'use strict';
/* Client dung Socket.IO do chinh server phat tai /socket.io/socket.io.js (khong dung package rieng, tranh lech phien ban) */
const $ = (id) => document.getElementById(id);
const EMOJIS = ['😀','😁','😂','🤣','😊','😍','😘','😎','🤩','😢','😭','😡','👍','👎','👏','🙏','💪','🔥','❤️','💔','🎉','🎂','🌹','☀️','🌧️','⭐','✅','❌','🎵','⚽','🍜','☕','🍺','🚗','✈️','🏠','💰','📱','💻','🎮','📚','😴','🤔','😅','🥰','😜','🫡','🤝','🫶','👋','👀','💯','🥳','😱','🤗','🙂','😉','😋','😇','🥹','🤠','👻','💩','🐶','🐱'];
const STICKERS = ['❤️','🔥','👍','🎉','😂','🥰','💯','🌟','🍀','🎁','🏆','💪','🫶','🥳','🐻','🐰'];
const GIFS = [
  ['chao', '👋', 'Xin chào!'], ['cuoi', '😂', 'Haha!'], ['tim', '❤️', 'Thả tim'],
  ['mung', '🎉', 'Ăn mừng!'], ['wow', '😮', 'Wow!'], ['ok', '👌', 'OK!'],
  ['ngu', '💤', 'Buồn ngủ'], ['yeu', '🥰', 'Yêu quá'], ['khoc', '😭', 'Khóc'],
  ['like', '👍', 'Like!'], ['nhay', '💃', 'Nhảy!'], ['an', '🍜', 'Ăn thôi'],
];

let token = localStorage.getItem('token') || '';
let me = null, socket = null, users = [], online = new Set();
let currentPeer = null, unread = {}, lastMsg = {};
const msgsCache = {};

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
  if ('Notification' in window && Notification.permission === 'default') Notification.requestPermission();
  const r = await fetch('/api/users', { headers: { Authorization: 'Bearer ' + token } });
  users = (await r.json()).users.filter((u) => u.username !== me.username);
  socket = io({ auth: { token } });
  socket.on('connect', () => socket.emit('presence:get'));
  socket.on('presence', ({ online: o }) => { online = new Set(o); renderList(); if (currentPeer) $('peerStatus').textContent = online.has(currentPeer) ? 'Đang online' : 'Ngoại tuyến'; });
  socket.on('message:new', onIncomingMessage);
  socket.on('typing', ({ from }) => { if (from === currentPeer) { $('typing').textContent = 'Đang nhập…'; setTimeout(() => $('typing').textContent = '', 1800); } });
  wireCallSocket();
  renderList();
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
  $('convList').innerHTML = users.filter((u) => u.displayName.toLowerCase().includes(q)).map((u) => {
    const on = online.has(u.username); const last = lastMsg[u.username];
    return `<div class="conv ${u.username === currentPeer ? 'active' : ''}" data-u="${u.username}">
      <div class="avatar">${u.displayName[0]}<span class="dot ${on ? 'on' : ''}"></span></div>
      <div class="info"><div><b>${u.displayName}</b></div>
      <div class="muted last">${last ? escapeHtml(preview(last)) : (on ? 'Đang online' : 'Ngoại tuyến')}</div></div>
      ${unread[u.username] ? `<span class="badge">${unread[u.username]}</span>` : ''}</div>`;
  }).join('');
}
$('search').oninput = renderList;
$('convList').addEventListener('click', (e) => { const c = e.target.closest('.conv'); if (c) openChat(c.dataset.u); });
function preview(m) { return m.type === 'text' || m.type === 'emoji' ? m.content : ({ image: '🖼️ Ảnh', audio: '🎤 Tin nhắn thoại', sticker: 'Sticker ' + m.content, gif: 'GIF', call: m.content })[m.type] || m.content; }
function escapeHtml(s) { const d = document.createElement('div'); d.textContent = s; return d.innerHTML; }

async function openChat(peer) {
  currentPeer = peer; unread[peer] = 0;
  $('emptyState').hidden = true; $('chatMain').hidden = false;
  document.querySelector('#appView').classList.add('chat-open');
  $('peerName').textContent = peerName(peer);
  $('peerAvatar').textContent = peerName(peer)[0];
  $('peerStatus').textContent = online.has(peer) ? 'Đang online' : 'Ngoại tuyến';
  renderList();
  if (!msgsCache[peer]) {
    const r = await fetch('/api/messages/' + peer, { headers: { Authorization: 'Bearer ' + token } });
    msgsCache[peer] = (await r.json()).messages || [];
    for (const m of msgsCache[peer]) lastMsg[peer] = m;
  }
  $('messages').innerHTML = ''; msgsCache[peer].forEach(renderMsg); scrollDown();
}
$('backBtn').onclick = () => document.querySelector('#appView').classList.remove('chat-open');

function renderMsg(m) {
  const d = document.createElement('div');
  d.className = 'msg' + (m.from === me.username ? ' mine' : '');
  const time = `<div class="time">${new Date(m.at).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })}</div>`;
  if (m.type === 'text') d.textContent = m.content;
  else if (m.type === 'emoji' || m.type === 'sticker') { d.classList.add('big'); d.textContent = m.content; }
  else if (m.type === 'gif') { const g = GIFS.find((x) => x[0] === m.content) || GIFS[0]; d.classList.add('gifcard'); d.textContent = `${g[1]} ${g[2]}`; }
  else if (m.type === 'image') { const img = document.createElement('img'); img.className = 'photo'; img.src = m.content; img.alt = 'Ảnh'; d.appendChild(img); }
  else if (m.type === 'audio') { const a = document.createElement('audio'); a.controls = true; a.src = m.content; d.appendChild(a); }
  else if (m.type === 'call') d.textContent = '📞 ' + m.content;
  else d.textContent = m.content;
  d.insertAdjacentHTML('beforeend', time);
  $('messages').appendChild(d);
}
function scrollDown() { const b = $('messages'); b.scrollTop = b.scrollHeight; }

function onIncomingMessage(m) {
  const peer = m.from === me.username ? m.to : m.from;
  (msgsCache[peer] = msgsCache[peer] || []).push(m); lastMsg[peer] = m;
  if (peer === currentPeer && m.from !== me.username) { renderMsg(m); scrollDown(); }
  else if (m.from !== me.username) { unread[peer] = (unread[peer] || 0) + 1; notify(peerName(m.from), preview(m)); }
  renderList();
}

function send(type, content) {
  if (!currentPeer) return;
  socket.emit('message:send', { to: currentPeer, type, content }, (res) => {
    if (res?.ok) { (msgsCache[currentPeer] = msgsCache[currentPeer] || []).push(res.message); lastMsg[currentPeer] = res.message; renderMsg(res.message); scrollDown(); renderList(); }
    else toast('Không gửi được', res?.error || 'Lỗi');
  });
}
$('sendBtn').onclick = () => { const v = $('textInput').value.trim(); if (v) { send('text', v); $('textInput').value = ''; } };
$('textInput').addEventListener('keydown', (e) => { if (e.key === 'Enter') $('sendBtn').click(); });
$('textInput').addEventListener('input', () => { if (currentPeer) socket.emit('typing', { to: currentPeer }); });

/* Panel emoji / sticker / GIF */
let panelMode = null;
$('emojiBtn').onclick = () => {
  const p = $('panel');
  if (!p.hidden && panelMode === 'all') { p.hidden = true; return; }
  panelMode = 'all'; p.hidden = false;
  p.innerHTML =
    EMOJIS.map((e) => `<button data-k="emoji">${e}</button>`).join('') +
    STICKERS.map((s) => `<button data-k="sticker" title="Sticker">${s}</button>`).join('') +
    GIFS.map((g) => `<button class="gifbtn" data-k="gif" data-id="${g[0]}">${g[1]} ${g[2]}</button>`).join('');
};
$('panel').addEventListener('click', (e) => {
  const b = e.target.closest('button'); if (!b) return;
  if (b.dataset.k === 'emoji') { $('textInput').value += b.textContent; $('textInput').focus(); }
  if (b.dataset.k === 'sticker') send('sticker', b.textContent);
  if (b.dataset.k === 'gif') send('gif', b.dataset.id);
});

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
  clearInterval(callTimer);
  if (pc) { pc.close(); pc = null; }
  if (localStream) { localStream.getTracks().forEach((t) => t.stop()); localStream = null; }
  $('callView').hidden = true; $('incomingView').hidden = true;
  if (sendHistory && callPeer) send('call', label || 'Cuộc gọi');
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
  });
  socket.on('call:answered', async ({ answer }) => { if (pc) { await pc.setRemoteDescription(answer); startTimer(); } });
  socket.on('call:ice', async ({ candidate }) => { try { if (pc && candidate) await pc.addIceCandidate(candidate); } catch {} });
  socket.on('call:rejected', () => { toast('Cuộc gọi bị từ chối', ''); cleanupCall(true, `Cuộc gọi ${callType === 'video' ? 'video' : 'thoại'} · Bị từ chối`); });
  socket.on('call:ended', () => { toast('Cuộc gọi đã kết thúc', ''); cleanupCall(false); });
}
$('acceptBtn').onclick = async () => {
  $('incomingView').hidden = true; newPC();
  try { await getMedia(); } catch { toast('Không mở được mic/camera', ''); socket.emit('call:reject', { to: callPeer }); cleanupCall(false); return; }
  await pc.setRemoteDescription(pendingOffer);
  const answer = await pc.createAnswer(); await pc.setLocalDescription(answer);
  socket.emit('call:answer', { to: callPeer, answer });
  showCall(peerName(callPeer), 'Đang kết nối…'); startTimer();
};
$('rejectBtn').onclick = () => { socket.emit('call:reject', { to: callPeer }); cleanupCall(false); };
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
