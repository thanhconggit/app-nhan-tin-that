'use strict';
/* Client dung Socket.IO do chinh server phat tai /socket.io/socket.io.js (khong dung package rieng, tranh lech phien ban) */
const $ = (id) => document.getElementById(id);
const EMOJIS = ['😀','😁','😂','🤣','😊','😍','😘','😎','🤩','😢','😭','😡','👍','👎','👏','🙏','💪','🔥','❤️','💔','🎉','🎂','🌹','☀️','🌧️','⭐','✅','❌','🎵','⚽','🍜','☕','🍺','🚗','✈️','🏠','💰','📱','💻','🎮','📚','😴','🤔','😅','🥰','😜','🫡','🤝','🫶','👋','👀','💯','🥳','😱','🤗','🙂','😉','😋','😇','🥹','🤠','👻','💩','🐶','🐱'];
/* Sticker anh that (PNG nen trong suot, phuc vu tu /stickers/) - 2 bo: Meo trang + Shiba.
   Sticker gui di chi luu duong dan anh nen khong ton dung luong database. */
const STICKER_PACKS = [
  { name: '🐱 Mèo trắng', files: Array.from({ length: 12 }, (_, i) => `/stickers/meo-${String(i + 1).padStart(2, '0')}.png`) },
  { name: '🐶 Shiba', files: Array.from({ length: 12 }, (_, i) => `/stickers/shiba-${String(i + 1).padStart(2, '0')}.png`) },
  { name: '🐤 Gà vàng', files: Array.from({ length: 12 }, (_, i) => `/stickers/ga-${String(i + 1).padStart(2, '0')}.png`) },
  { name: '🐰 Thỏ', files: Array.from({ length: 12 }, (_, i) => `/stickers/tho-${String(i + 1).padStart(2, '0')}.png`) },
  { name: '🐼 Panda meme', files: Array.from({ length: 12 }, (_, i) => `/stickers/panda-${String(i + 1).padStart(2, '0')}.png`) },
  { name: '🍄 Đầu nấm', files: Array.from({ length: 12 }, (_, i) => `/stickers/nam-${String(i + 1).padStart(2, '0')}.png`) },
  { name: '🐸 Ếch ngáo', files: Array.from({ length: 12 }, (_, i) => `/stickers/ech-${String(i + 1).padStart(2, '0')}.png`) },
  { name: '🐷 Heo bựa', files: Array.from({ length: 12 }, (_, i) => `/stickers/heo-${String(i + 1).padStart(2, '0')}.png`) },
];
/* GIF dong that tu Giphy CDN. Luu y: nhieu GIF bi Giphy xoa se tra anh "not available" du HTTP 200,
   nen danh sach nay da kiem chung bang cach TAI THAT tung file (06/11/2026): dung noi dung that,
   khong trung hash anh chet, du khung hinh. Anh nho 200.gif dung cho khay chon (thieu thi tu ve giphy.gif). */
const GIFS = ['3o7TKMt1VVNkHV2PaE','l0HlBO7eyXzSZkJri','xT9IgG50Fb7Mi0prBC','111ebonMs90YLu','l4KihuqeuJEi9qLSM','mcJohbfGPATW8','13CoXDiaCcCoyk','l3q2K5jinAlChoCLS','ASd0Ukj0y3qMM','dzaUX7CAG0Ihi','mlvseq9yvZhba','26gsjCZpPolPr3sBy','26AHONQ79FdWZhAI0','l0MYt5jPR6QX5pnqM','xTiTnxpQ3ghPiB2Hp6','g9582DNuQppxC',
'03IoP34ByFpdRvT0wb','0T1tm4a0mrDXXJBO4g','0dKHpamGLycEt3Ffyg','0oIkdy76oYE8uPsPjy','10UHehEC098kAE','10UeedrT5MIfPG','10tIjpzIu8fe0','11s8zgtzOAep7mFUW8','11tTNkNy1SdXGg','12PIT4DOj6Tgek','12msOFU8oL1eww','13BwjdpxACoBPO','13hxeOYjoTWtK8','13t22jOjxpkAN2','14qb1Uhf40ndw4','18LZm8w9R8T0Q','1BQdjXovIqSLS','1BXa2alBjrCXC']
  .map((id) => `https://media.giphy.com/media/${id}/giphy.gif`);
/* GIF dang the chu cua ban cu - chi de hien lai tin nhan cu cho dung */
const LEGACY_GIFS = [
  ['chao', '👋', 'Xin chào!'], ['cuoi', '😂', 'Haha!'], ['tim', '❤️', 'Thả tim'],
  ['mung', '🎉', 'Ăn mừng!'], ['wow', '😮', 'Wow!'], ['ok', '👌', 'OK!'],
  ['ngu', '💤', 'Buồn ngủ'], ['yeu', '🥰', 'Yêu quá'], ['khoc', '😭', 'Khóc'],
  ['like', '👍', 'Like!'], ['nhay', '💃', 'Nhảy!'], ['an', '🍜', 'Ăn thôi'],
];

let token = localStorage.getItem('token') || '';
let me = null, socket = null, users = [], groups = [], online = new Set();
let currentPeer = null, currentGroup = null, unread = {}, lastMsg = {};
const msgsCache = {};
/* Tin nhan da "xoa phia toi": chi an tren may nay, luu danh sach id trong localStorage */
let deletedIds = new Set();
function loadDeleted() {
  try { deletedIds = new Set(JSON.parse(localStorage.getItem('deletedMsgs:' + me.username) || '[]')); } catch { deletedIds = new Set(); }
}
function saveDeleted() {
  try { localStorage.setItem('deletedMsgs:' + me.username, JSON.stringify([...deletedIds].slice(-500))); } catch { /* bo qua */ }
}
const keyOf = (m) => (m.groupId ? 'g:' + m.groupId : 'u:' + (m.from === me.username ? m.to : m.from));
const currentKey = () => (currentGroup ? 'g:' + currentGroup : currentPeer ? 'u:' + currentPeer : null);
const groupById = (id) => groups.find((g) => g.id === id);

/* ================= Tieng thong bao (WebAudio, khong can file am thanh) ================= */
let audioCtx = null;
let soundOn = localStorage.getItem('sound') !== 'off';
function ensureAudio() {
  if (!audioCtx) { try { audioCtx = new (window.AudioContext || window.webkitAudioContext)(); } catch { audioCtx = null; } }
  if (audioCtx && audioCtx.state === 'suspended') audioCtx.resume();
}
document.addEventListener('pointerdown', ensureAudio);
function tone(freq, delay, dur, vol = 0.14) {
  if (!audioCtx || !soundOn) return;
  const t = audioCtx.currentTime + delay;
  const o = audioCtx.createOscillator(), g = audioCtx.createGain();
  o.type = 'sine'; o.frequency.value = freq;
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vol, t + 0.02);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g); g.connect(audioCtx.destination);
  o.start(t); o.stop(t + dur + 0.05);
}
function ding() { ensureAudio(); tone(880, 0, 0.18); tone(1318, 0.09, 0.28); }
let ringTimer = null;
function startRing() {
  if (!soundOn) return;
  ensureAudio();
  const ring = () => { tone(1046, 0, 0.35, 0.11); tone(1046, 0.45, 0.35, 0.11); };
  ring(); stopRingOnly(); ringTimer = setInterval(ring, 2300);
}
function stopRingOnly() { if (ringTimer) { clearInterval(ringTimer); ringTimer = null; } }
function stopRing() { stopRingOnly(); }
$('soundBtn').textContent = soundOn ? '🔊' : '🔇';
$('soundBtn').onclick = () => {
  soundOn = !soundOn;
  localStorage.setItem('sound', soundOn ? 'on' : 'off');
  $('soundBtn').textContent = soundOn ? '🔊' : '🔇';
  if (!soundOn) stopRing(); else ding();
};

$('loginForm').addEventListener('submit', async (e) => {
  e.preventDefault(); $('loginError').textContent = '';
  try {
    const r = await fetch('/api/login', { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: $('username').value, password: $('password').value }) });
    const d = await r.json();
    if (!r.ok) throw new Error(d.error || 'Đăng nhập thất bại');
    token = d.token; localStorage.setItem('token', token); me = d.user; enterApp();
  } catch (err) { $('loginError').textContent = err.message; }
});
$('logoutBtn').onclick = () => { localStorage.removeItem('token'); location.reload(); };

/* Tao tai khoan moi - server luu tai khoan, tao xong dang nhap ngay */
$('showRegister').onclick = (e) => { e.preventDefault(); $('loginForm').hidden = true; $('registerForm').hidden = false; };
$('showLogin').onclick = (e) => { e.preventDefault(); $('registerForm').hidden = true; $('loginForm').hidden = false; };
$('registerForm').addEventListener('submit', async (e) => {
  e.preventDefault(); $('registerError').textContent = '';
  try {
    const r = await fetch('/api/register', { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ displayName: $('regName').value, username: $('regUsername').value, password: $('regPassword').value }) });
    const d = await r.json();
    if (!r.ok) throw new Error(d.error || 'Tạo tài khoản thất bại');
    token = d.token; localStorage.setItem('token', token); me = d.user; enterApp();
  } catch (err) { $('registerError').textContent = err.message; }
});

async function enterApp() {
  $('loginView').hidden = true; $('appView').hidden = false;
  $('myName').textContent = me.displayName; $('myUser').textContent = '@' + me.username;
  $('myAvatar').textContent = me.displayName[0];
  ensureAudio();
  if ('Notification' in window && Notification.permission === 'default') Notification.requestPermission();
  const r = await fetch('/api/users', { headers: { Authorization: 'Bearer ' + token } });
  users = (await r.json()).users.filter((u) => u.username !== me.username);
  await loadGroups();
  socket = io({ auth: { token } });
  socket.on('connect', () => socket.emit('presence:get'));
  socket.on('presence', ({ online: o }) => { online = new Set(o); renderList(); if (currentPeer) $('peerStatus').textContent = online.has(currentPeer) ? 'Đang online' : 'Ngoại tuyến'; });
  loadDeleted();
  socket.on('message:new', onIncomingMessage);
  socket.on('message:updated', (m) => {
    const r = patchCachedMessage(m.id, { type: 'recalled', content: '', reactions: {} });
    if (r.key) {
      if (lastMsg[r.key]?.id === m.id) lastMsg[r.key] = r.msg;
      if (r.key === currentKey()) rerenderMessages();
      renderList();
    }
  });
  socket.on('message:reacted', (p) => {
    const r = patchCachedMessage(p.id, { reactions: p.reactions || {} });
    if (r.key && r.key === currentKey()) rerenderMessages();
  });
  socket.on('group:deleted', ({ id, name }) => {
    removeGroupLocal(id);
    toast('Nhóm đã bị xoá', `Nhóm "${name}" đã bị người tạo xoá`);
  });
  socket.on('group:created', (g) => {
    if (!groupById(g.id)) groups.push(g);
    renderList(); ding();
    toast('Nhóm mới', `Bạn được thêm vào nhóm "${g.name}"`);
  });
  socket.on('typing', ({ from }) => { if (from === currentPeer) { $('typing').textContent = 'Đang nhập…'; setTimeout(() => $('typing').textContent = '', 1800); } });
  wireCallSocket();
  renderList();
}

async function loadGroups() {
  try {
    const r = await fetch('/api/groups', { headers: { Authorization: 'Bearer ' + token } });
    if (r.ok) groups = (await r.json()).groups || [];
  } catch { /* giu danh sach cu */ }
}

function toast(title, body) {
  const t = document.createElement('div'); t.className = 'toast'; t.innerHTML = `<b></b><br><span></span>`;
  t.querySelector('b').textContent = title; t.querySelector('span').textContent = body;
  $('toasts').appendChild(t); setTimeout(() => t.remove(), 4500);
}
function notify(title, body) {
  toast(title, body);
  if ('Notification' in window && Notification.permission === 'granted' && document.hidden) new Notification(title, { body });
}

function peerName(u) { return (users.find((x) => x.username === u) || {}).displayName || u; }

function renderList() {
  const q = $('search').value.toLowerCase();
  const gs = groups.filter((g) => g.name.toLowerCase().includes(q));
  const us = users.filter((u) => u.displayName.toLowerCase().includes(q));
  let h = '';
  if (gs.length) {
    h += `<div class="list-label">Nhóm</div>` + gs.map((g) => {
      const last = lastMsg['g:' + g.id];
      const prev = last ? escapeHtml((last.from !== me.username ? peerName(last.from) + ': ' : '') + preview(last)) : `${g.members.length} thành viên`;
      return `<div class="conv ${g.id === currentGroup ? 'active' : ''}" data-kind="group" data-id="${g.id}">
        <div class="avatar gav">👥</div>
        <div class="info"><div><b>${escapeHtml(g.name)}</b></div>
        <div class="muted last">${prev}</div></div>
        ${unread['g:' + g.id] ? `<span class="badge">${unread['g:' + g.id]}</span>` : ''}</div>`;
    }).join('');
  }
  h += `<div class="list-label">Mọi người</div>` + us.map((u) => {
    const on = online.has(u.username); const last = lastMsg['u:' + u.username];
    return `<div class="conv ${u.username === currentPeer ? 'active' : ''}" data-kind="dm" data-u="${u.username}">
      <div class="avatar">${u.displayName[0]}<span class="dot ${on ? 'on' : ''}"></span></div>
      <div class="info"><div><b>${u.displayName}</b></div>
      <div class="muted last">${last ? escapeHtml(preview(last)) : (on ? 'Đang online' : 'Ngoại tuyến')}</div></div>
      ${unread['u:' + u.username] ? `<span class="badge">${unread['u:' + u.username]}</span>` : ''}</div>`;
  }).join('');
  $('convList').innerHTML = h;
}
$('search').oninput = renderList;
$('convList').addEventListener('click', (e) => {
  const c = e.target.closest('.conv'); if (!c) return;
  if (c.dataset.kind === 'group') openGroup(c.dataset.id); else openChat(c.dataset.u);
});
function preview(m) { if (m.type === 'recalled') return '🚫 Tin nhắn đã thu hồi'; if (m.type === 'sticker') return String(m.content).startsWith('/stickers/') ? '🎨 Sticker' : 'Sticker ' + m.content; return m.type === 'text' || m.type === 'emoji' ? m.content : ({ image: '🖼️ Ảnh', audio: '🎤 Tin nhắn thoại', gif: '🎬 GIF', call: m.content })[m.type] || m.content; }
function escapeHtml(s) { const d = document.createElement('div'); d.textContent = s; return d.innerHTML; }

function showChatUI() {
  $('emptyState').hidden = true; $('chatMain').hidden = false;
  document.querySelector('#appView').classList.add('chat-open');
}
async function openChat(peer) {
  currentPeer = peer; currentGroup = null; unread['u:' + peer] = 0;
  showChatUI();
  $('groupDelBtn').hidden = true;
  $('voiceCallBtn').style.display = ''; $('videoCallBtn').style.display = '';
  $('peerName').textContent = peerName(peer);
  $('peerAvatar').textContent = peerName(peer)[0];
  $('peerAvatar').classList.remove('gav');
  $('peerStatus').textContent = online.has(peer) ? 'Đang online' : 'Ngoại tuyến';
  renderList();
  const key = 'u:' + peer;
  if (!msgsCache[key]) {
    const r = await fetch('/api/messages/' + peer, { headers: { Authorization: 'Bearer ' + token } });
    msgsCache[key] = (await r.json()).messages || [];
    for (const m of msgsCache[key]) if (!deletedIds.has(m.id)) lastMsg[key] = m;
  }
  $('messages').innerHTML = ''; msgsCache[key].forEach(renderMsg); scrollDown();
}
async function openGroup(id) {
  const g = groupById(id); if (!g) return;
  currentGroup = id; currentPeer = null; unread['g:' + id] = 0;
  showChatUI();
  $('voiceCallBtn').style.display = 'none'; $('videoCallBtn').style.display = 'none';
  $('peerName').textContent = g.name;
  $('peerAvatar').textContent = '👥';
  $('peerAvatar').classList.add('gav');
  $('peerStatus').textContent = `${g.members.length} thành viên`;
  $('groupDelBtn').hidden = g.createdBy !== me.username;
  renderList();
  const key = 'g:' + id;
  if (!msgsCache[key]) {
    const r = await fetch('/api/groups/' + id + '/messages', { headers: { Authorization: 'Bearer ' + token } });
    msgsCache[key] = (await r.json()).messages || [];
    for (const m of msgsCache[key]) if (!deletedIds.has(m.id)) lastMsg[key] = m;
  }
  $('messages').innerHTML = ''; msgsCache[key].forEach(renderMsg); scrollDown();
}
$('backBtn').onclick = () => document.querySelector('#appView').classList.remove('chat-open');

function renderMsg(m) {
  if (deletedIds.has(m.id)) return;
  const d = document.createElement('div');
  d.className = 'msg' + (m.from === me.username ? ' mine' : '');
  d.dataset.id = m.id;
  const time = `<div class="time">${new Date(m.at).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })}</div>`;
  if (m.groupId && m.from !== me.username) {
    const s = document.createElement('div'); s.className = 'sender-name'; s.textContent = peerName(m.from); d.appendChild(s);
  }
  if (m.type === 'recalled') {
    d.classList.add('recalled');
    d.appendChild(document.createTextNode('🚫 Tin nhắn đã thu hồi'));
    d.insertAdjacentHTML('beforeend', time);
    $('messages').appendChild(d);
    return;
  }
  if (m.type === 'text') d.appendChild(document.createTextNode(m.content));
  else if (m.type === 'emoji') { d.classList.add('big'); d.appendChild(document.createTextNode(m.content)); }
  else if (m.type === 'sticker') {
    if (String(m.content).startsWith('/stickers/')) { d.classList.add('nobg'); const img = document.createElement('img'); img.className = 'stickerimg'; img.src = m.content; img.alt = 'Sticker'; d.appendChild(img); }
    else { d.classList.add('big'); d.appendChild(document.createTextNode(m.content)); }
  }
  else if (m.type === 'gif') {
    if (String(m.content).startsWith('http')) { const img = document.createElement('img'); img.className = 'photo'; img.src = m.content; img.alt = 'GIF'; d.appendChild(img); }
    else { const g = LEGACY_GIFS.find((x) => x[0] === m.content) || LEGACY_GIFS[0]; d.classList.add('gifcard'); d.appendChild(document.createTextNode(`${g[1]} ${g[2]}`)); }
  }
  else if (m.type === 'image') { const img = document.createElement('img'); img.className = 'photo'; img.src = m.content; img.alt = 'Ảnh'; d.appendChild(img); }
  else if (m.type === 'audio') { const a = document.createElement('audio'); a.controls = true; a.src = m.content; d.appendChild(a); }
  else if (m.type === 'call') d.appendChild(document.createTextNode('📞 ' + m.content));
  else d.appendChild(document.createTextNode(m.content));
  const reacts = m.reactions || {};
  const rKeys = Object.keys(reacts);
  if (rKeys.length) {
    d.classList.add('has-reacts');
    const counts = {};
    for (const u of rKeys) counts[reacts[u]] = (counts[reacts[u]] || 0) + 1;
    const rd = document.createElement('div'); rd.className = 'reacts';
    rd.textContent = Object.entries(counts).map(([e, c]) => (c > 1 ? `${e} ${c}` : e)).join(' ');
    rd.title = rKeys.map((u) => `${u === me.username ? 'Bạn' : peerName(u)}: ${reacts[u]}`).join('\n');
    d.appendChild(rd);
  }
  d.insertAdjacentHTML('beforeend', time);
  $('messages').appendChild(d);
}
function scrollDown() { const b = $('messages'); b.scrollTop = b.scrollHeight; }

/* Tim + sua 1 tin trong cache (dung cho thu hoi / cam xuc) */
function patchCachedMessage(id, patch) {
  for (const key of Object.keys(msgsCache)) {
    const arr = msgsCache[key];
    const i = arr.findIndex((x) => x.id === id);
    if (i >= 0) { Object.assign(arr[i], patch); return { key, msg: arr[i] }; }
  }
  return {};
}
function rerenderMessages() {
  const key = currentKey(); if (!key) return;
  const box = $('messages');
  const nearBottom = box.scrollHeight - box.scrollTop - box.clientHeight < 140;
  box.innerHTML = '';
  (msgsCache[key] || []).forEach(renderMsg);
  if (nearBottom) scrollDown();
}
function removeGroupLocal(id) {
  groups = groups.filter((g) => g.id !== id);
  delete msgsCache['g:' + id]; delete lastMsg['g:' + id]; delete unread['g:' + id];
  if (currentGroup === id) {
    currentGroup = null;
    $('chatMain').hidden = true; $('emptyState').hidden = false;
    document.querySelector('#appView').classList.remove('chat-open');
  }
  renderList();
}

function onIncomingMessage(m) {
  const key = keyOf(m);
  (msgsCache[key] = msgsCache[key] || []).push(m); lastMsg[key] = m;
  const viewing = key === currentKey();
  if (viewing && m.from !== me.username) { renderMsg(m); scrollDown(); }
  else if (m.from !== me.username) {
    unread[key] = (unread[key] || 0) + 1;
    if (m.groupId) { const g = groupById(m.groupId); notify(g ? g.name : 'Nhóm', peerName(m.from) + ': ' + preview(m)); }
    else notify(peerName(m.from), preview(m));
  }
  if (m.from !== me.username && (!viewing || document.hidden)) ding();
  renderList();
}

function handleSent(msg) {
  const key = keyOf(msg);
  (msgsCache[key] = msgsCache[key] || []).push(msg); lastMsg[key] = msg;
  if (key === currentKey()) { renderMsg(msg); scrollDown(); }
  renderList();
}
function send(type, content) {
  const payload = currentGroup ? { groupId: currentGroup, type, content } : currentPeer ? { to: currentPeer, type, content } : null;
  if (!payload) return;
  socket.emit('message:send', payload, (res) => {
    if (res?.ok) {
      if (type === 'sticker') bumpUsage('sticker', content);
      else if (type === 'emoji') bumpUsage('emoji', content);
      handleSent(res.message);
    }
    else toast('Không gửi được', res?.error || 'Lỗi');
  });
}
function sendDM(peer, type, content) {
  socket.emit('message:send', { to: peer, type, content }, (res) => { if (res?.ok) handleSent(res.message); });
}
$('sendBtn').onclick = () => { const v = $('textInput').value.trim(); if (v) { send('text', v); $('textInput').value = ''; } };
$('textInput').addEventListener('keydown', (e) => { if (e.key === 'Enter') $('sendBtn').click(); });
$('textInput').addEventListener('input', () => { if (currentPeer) socket.emit('typing', { to: currentPeer }); });

/* Panel emoji / sticker / GIF - 3 tab rieng */
let panelTab = 'emoji';
/* Dem so lan dung sticker/emoji tren may nay -> muc "Hay dung" len dau khay chon */
function loadUsage(kind) {
  try { return JSON.parse(localStorage.getItem('usage:' + kind + ':' + me.username) || '{}'); } catch { return {}; }
}
function bumpUsage(kind, key) {
  if (!me) return;
  const u = loadUsage(kind); u[key] = (u[key] || 0) + 1;
  try { localStorage.setItem('usage:' + kind + ':' + me.username, JSON.stringify(u)); } catch { /* bo qua */ }
}
function topUsed(kind, n) {
  return Object.entries(loadUsage(kind)).sort((a, b) => b[1] - a[1]).slice(0, n).map(([k]) => k);
}
function renderPanel() {
  const b = $('panelBody');
  document.querySelectorAll('.ptab').forEach((t) => t.classList.toggle('active', t.dataset.tab === panelTab));
  if (panelTab === 'emoji') {
    const fav = topUsed('emoji', 14);
    b.innerHTML = (fav.length ? `<div class="pack-label">⭐ Hay dùng</div>` + fav.map((e) => `<button data-k="emoji">${e}</button>`).join('') + `<div class="pack-label">Tất cả emoji</div>` : '')
      + EMOJIS.map((e) => `<button data-k="emoji">${e}</button>`).join('');
  }
  else if (panelTab === 'sticker') {
    const fav = topUsed('sticker', 12).filter((f) => String(f).startsWith('/stickers/'));
    b.innerHTML = (fav.length ? `<div class="pack-label">⭐ Hay dùng</div>` + fav.map((f) => `<button class="stkpick" data-k="stickerimg" data-url="${f}"><img loading="lazy" src="${f}" alt="sticker"></button>`).join('') : '')
      + STICKER_PACKS.map((p) =>
        `<div class="pack-label">${p.name}</div>` +
        p.files.map((f) => `<button class="stkpick" data-k="stickerimg" data-url="${f}"><img loading="lazy" src="${f}" alt="sticker"></button>`).join('')
      ).join('');
  }
  else b.innerHTML = GIFS.map((u) => `<button class="gifpick" data-k="gif" data-url="${u}"><img class="gifthumb" loading="lazy" src="${u.replace('giphy.gif', '200.gif')}" onerror="this.onerror=null;this.src='${u}'" alt="GIF"></button>`).join('');
}
$('emojiBtn').onclick = () => {
  const p = $('panel');
  if (!p.hidden) { p.hidden = true; return; }
  p.hidden = false; renderPanel();
};
$('panelTabs').addEventListener('click', (e) => {
  const t = e.target.closest('.ptab'); if (!t) return;
  panelTab = t.dataset.tab; renderPanel();
});
$('panelBody').addEventListener('click', (e) => {
  const b = e.target.closest('button'); if (!b) return;
  if (b.dataset.k === 'emoji') { $('textInput').value += b.textContent; $('textInput').focus(); }
  if (b.dataset.k === 'stickerimg') send('sticker', b.dataset.url);
  if (b.dataset.k === 'gif') send('gif', b.dataset.url);
});

/* Tao nhom */
$('newGroupBtn').onclick = () => {
  $('groupError').textContent = ''; $('groupName').value = '';
  $('memberList').innerHTML = users.map((u) => `<label class="member-row">
    <input type="checkbox" value="${u.username}">
    <span class="avatar">${u.displayName[0]}</span>
    <span><b>${escapeHtml(u.displayName)}</b><br><span class="muted">@${u.username}</span></span>
  </label>`).join('') || '<p class="muted">Chưa có người dùng nào khác.</p>';
  $('groupView').hidden = false;
};
$('cancelGroupBtn').onclick = () => { $('groupView').hidden = true; };
$('createGroupBtn').onclick = async () => {
  $('groupError').textContent = '';
  const members = [...document.querySelectorAll('#memberList input:checked')].map((i) => i.value);
  try {
    const r = await fetch('/api/groups', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
      body: JSON.stringify({ name: $('groupName').value, members }) });
    const d = await r.json();
    if (!r.ok) throw new Error(d.error || 'Tạo nhóm thất bại');
    groups.push(d.group);
    $('groupView').hidden = true;
    toast('Đã tạo nhóm', d.group.name);
    openGroup(d.group.id);
  } catch (err) { $('groupError').textContent = err.message; }
};

/* Xoa nhom (chi nguoi tao thay nut) */
$('groupDelBtn').onclick = async () => {
  const g = groupById(currentGroup); if (!g) return;
  if (!confirm(`Xoá nhóm "${g.name}"?\nToàn bộ tin nhắn trong nhóm sẽ bị xoá đối với mọi thành viên. Hành động này không hoàn tác được.`)) return;
  try {
    const r = await fetch('/api/groups/' + g.id, { method: 'DELETE', headers: { Authorization: 'Bearer ' + token } });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(d.error || 'Xoá nhóm thất bại');
    removeGroupLocal(g.id);
    toast('Đã xoá nhóm', g.name);
  } catch (err) { toast('Không xoá được nhóm', err.message); }
};

/* ===== Menu tin nhan: tha cam xuc / thu hoi / xoa phia toi =====
   Mo bang: chuot phai (may tinh) hoac nhan giu (dien thoai) vao bong bong tin */
let menuMsg = null;
function openMsgMenu(m) {
  menuMsg = m;
  $('mmRecall').hidden = !(m.from === me.username && m.type !== 'recalled' && m.type !== 'call');
  $('mmReacts').style.display = m.type === 'recalled' ? 'none' : '';
  $('msgMenu').hidden = false;
}
function closeMsgMenu() { $('msgMenu').hidden = true; menuMsg = null; }
function findCurrentMsg(id) {
  const key = currentKey(); if (!key) return null;
  return (msgsCache[key] || []).find((x) => x.id === id) || null;
}
$('messages').addEventListener('contextmenu', (e) => {
  const el = e.target.closest('.msg'); if (!el) return;
  e.preventDefault();
  const m = findCurrentMsg(Number(el.dataset.id));
  if (m) openMsgMenu(m);
});
let pressTimer = null;
$('messages').addEventListener('pointerdown', (e) => {
  const el = e.target.closest('.msg'); if (!el) return;
  clearTimeout(pressTimer);
  pressTimer = setTimeout(() => {
    const m = findCurrentMsg(Number(el.dataset.id));
    if (m) openMsgMenu(m);
  }, 550);
});
['pointerup', 'pointermove', 'pointercancel'].forEach((ev) => $('messages').addEventListener(ev, () => clearTimeout(pressTimer)));
$('messages').addEventListener('click', (e) => {
  const pill = e.target.closest('.reacts');
  if (pill) {
    const el = e.target.closest('.msg');
    const m = el && findCurrentMsg(Number(el.dataset.id));
    const mine = m?.reactions?.[me.username];
    if (m && mine) reactTo(m, mine);
  }
});
$('msgMenu').addEventListener('click', (e) => { if (e.target === $('msgMenu')) closeMsgMenu(); });
$('mmClose').onclick = closeMsgMenu;
$('mmReacts').addEventListener('click', (e) => {
  const b = e.target.closest('button[data-r]'); if (!b || !menuMsg) return;
  reactTo(menuMsg, b.dataset.r);
  closeMsgMenu();
});
function reactTo(m, emoji) {
  socket.emit('message:react', { id: m.id, emoji }, (res) => {
    if (res?.ok) { patchCachedMessage(m.id, { reactions: res.reactions }); rerenderMessages(); }
    else toast('Không thả được cảm xúc', res?.error || 'Lỗi');
  });
}
$('mmRecall').onclick = () => {
  if (!menuMsg) return;
  const target = menuMsg; closeMsgMenu();
  socket.emit('message:recall', { id: target.id }, (res) => {
    if (res?.ok) {
      const r = patchCachedMessage(target.id, { type: 'recalled', content: '', reactions: {} });
      if (r.key) { if (lastMsg[r.key]?.id === target.id) lastMsg[r.key] = r.msg; rerenderMessages(); renderList(); }
    } else toast('Không thu hồi được', res?.error || 'Lỗi');
  });
};
$('mmDelete').onclick = () => {
  if (!menuMsg) return;
  const target = menuMsg; closeMsgMenu();
  deletedIds.add(target.id); saveDeleted();
  const key = currentKey();
  if (key && lastMsg[key]?.id === target.id) {
    const rest = (msgsCache[key] || []).filter((x) => !deletedIds.has(x.id));
    lastMsg[key] = rest[rest.length - 1];
  }
  rerenderMessages(); renderList();
};

/* Gui anh: nen tren client, gioi han kich thuoc */
$('photoBtn').onclick = () => $('photoInput').click();
$('photoInput').addEventListener('change', () => {
  const f = $('photoInput').files[0]; if (!f) return;
  const img = new Image();
  img.onload = () => {
    const scale = Math.min(1, 1024 / Math.max(img.width, img.height));
    const c = document.createElement('canvas'); c.width = img.width * scale; c.height = img.height * scale;
    c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
    const url = c.toDataURL('image/jpeg', 0.78);
    if (url.length > 3_400_000) { toast('Ảnh quá lớn', 'Hãy chọn ảnh nhỏ hơn'); return; }
    send('image', url); URL.revokeObjectURL(img.src);
  };
  img.src = URL.createObjectURL(f); $('photoInput').value = '';
});

/* Tin nhan thoai: MediaRecorder, toi da 60 giay */
let recorder = null, recChunks = [], recTimer = null, recStart = 0;
$('voiceBtn').onclick = async () => {
  if (recorder) return;
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    recChunks = []; recorder = new MediaRecorder(stream);
    recorder.ondataavailable = (e) => recChunks.push(e.data);
    recorder.onstop = () => {
      stream.getTracks().forEach((t) => t.stop()); clearInterval(recTimer); $('recBar').hidden = true;
      if (!recChunks.length) return;
      const blob = new Blob(recChunks, { type: recorder.mimeType || 'audio/webm' });
      if (blob.size > 2_000_000) { toast('Tin nhắn thoại quá dài', 'Giới hạn 60 giây'); return; }
      const rd = new FileReader(); rd.onload = () => send('audio', rd.result); rd.readAsDataURL(blob);
    };
    recorder.start(); recStart = Date.now(); $('recBar').hidden = false;
    recTimer = setInterval(() => { const s = Math.floor((Date.now() - recStart) / 1000); $('recTime').textContent = s + 's'; if (s >= 60) stopRec(); }, 500);
  } catch { toast('Không mở được micro', 'Hãy cấp quyền micro cho trình duyệt'); }
};
function stopRec() { if (recorder && recorder.state !== 'inactive') recorder.stop(); recorder = null; }
$('recStop').onclick = stopRec;
$('recCancel').onclick = () => { recChunks = []; stopRec(); };

/* ================= WebRTC goi thoai / video =================
   Signaling qua Socket.IO, media P2P, chi dung Google STUN (xem README ve TURN) */
let pc = null, localStream = null, callPeer = null, callType = 'voice', callStartAt = 0, callTimer = null, pendingOffer = null;

function newPC() {
  pc = new RTCPeerConnection({ iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] });
  pc.onicecandidate = (e) => { if (e.candidate && callPeer) socket.emit('call:ice', { to: callPeer, candidate: e.candidate }); };
  pc.ontrack = (e) => {
    const stream = e.streams[0];
    if (callType === 'video') $('remoteVideo').srcObject = stream; else $('remoteAudio').srcObject = stream;
  };
  return pc;
}
async function getMedia() {
  localStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: callType === 'video' });
  $('localVideo').srcObject = callType === 'video' ? localStream : null;
  localStream.getTracks().forEach((t) => pc.addTrack(t, localStream));
}
function showCall(title, status) { $('callView').hidden = false; $('callTitle').textContent = title; $('callStatus').textContent = status; }
function startTimer() {
  callStartAt = Date.now();
  callTimer = setInterval(() => { const s = Math.floor((Date.now() - callStartAt) / 1000);
    $('callStatus').textContent = `Đang nói • ${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; }, 1000);
}
function cleanupCall(sendHistory, label) {
  stopRing();
  clearInterval(callTimer);
  if (pc) { pc.close(); pc = null; }
  if (localStream) { localStream.getTracks().forEach((t) => t.stop()); localStream = null; }
  $('callView').hidden = true; $('incomingView').hidden = true;
  if (sendHistory && callPeer) sendDM(callPeer, 'call', label || 'Cuộc gọi');
  callPeer = null; pendingOffer = null;
}
async function startCall(type) {
  if (!currentPeer) return;
  callType = type; callPeer = currentPeer; newPC();
  try { await getMedia(); } catch { toast('Không mở được mic/camera', 'Hãy cấp quyền cho trình duyệt'); cleanupCall(false); return; }
  showCall(peerName(callPeer), 'Đang gọi…');
  const offer = await pc.createOffer(); await pc.setLocalDescription(offer);
  socket.emit('call:offer', { to: callPeer, offer, callType });
}
$('voiceCallBtn').onclick = () => startCall('voice');
$('videoCallBtn').onclick = () => startCall('video');

function wireCallSocket() {
  socket.on('call:incoming', async ({ from, fromName, offer, callType: t }) => {
    callPeer = from; callType = t; pendingOffer = offer;
    $('incomingTitle').textContent = `${fromName || peerName(from)} đang gọi ${t === 'video' ? 'video' : 'thoại'}…`;
    $('incomingView').hidden = false; notify('Cuộc gọi đến', $('incomingTitle').textContent);
    startRing();
  });
  socket.on('call:answered', async ({ answer }) => { if (pc) { await pc.setRemoteDescription(answer); startTimer(); } });
  socket.on('call:ice', async ({ candidate }) => { try { if (pc && candidate) await pc.addIceCandidate(candidate); } catch {} });
  socket.on('call:rejected', () => { toast('Cuộc gọi bị từ chối', ''); cleanupCall(true, `Cuộc gọi ${callType === 'video' ? 'video' : 'thoại'} · Bị từ chối`); });
  socket.on('call:ended', () => { toast('Cuộc gọi đã kết thúc', ''); cleanupCall(false); });
}
$('acceptBtn').onclick = async () => {
  stopRing();
  $('incomingView').hidden = true; newPC();
  try { await getMedia(); } catch { toast('Không mở được mic/camera', ''); socket.emit('call:reject', { to: callPeer }); cleanupCall(false); return; }
  await pc.setRemoteDescription(pendingOffer);
  const answer = await pc.createAnswer(); await pc.setLocalDescription(answer);
  socket.emit('call:answer', { to: callPeer, answer });
  showCall(peerName(callPeer), 'Đang kết nối…'); startTimer();
};
$('rejectBtn').onclick = () => { stopRing(); socket.emit('call:reject', { to: callPeer }); cleanupCall(false); };
$('endCallBtn').onclick = () => { const dur = callStartAt ? Math.floor((Date.now() - callStartAt) / 1000) : 0;
  socket.emit('call:end', { to: callPeer }); cleanupCall(true, `Cuộc gọi ${callType === 'video' ? 'video' : 'thoại'} · ${dur}s`); };
$('muteBtn').onclick = () => { localStream?.getAudioTracks().forEach((t) => t.enabled = !t.enabled); };
$('camBtn').onclick = () => { localStream?.getVideoTracks().forEach((t) => t.enabled = !t.enabled); };

/* Tu dang nhap lai neu da co token */
(async () => {
  if (!token) return;
  try {
    const r = await fetch('/api/me', { headers: { Authorization: 'Bearer ' + token } });
    if (!r.ok) throw 0; me = (await r.json()).user; enterApp();
  } catch { localStorage.removeItem('token'); }
})();
