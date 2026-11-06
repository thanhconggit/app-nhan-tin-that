'use strict';
/* Test 2 client THAT: REST login + Socket.IO
   Chay: 1) khoi dong server (npm start, cong PORT), 2) o terminal khac: BASE=http://localhost:3000 npm run test:2client
   Kiem tra: A gui text -> B nhan; B gui sticker -> A nhan; presence co ca 2 online;
              signaling goi: offer -> incoming, answer, ICE, end-call. */
const { io } = require('socket.io-client');
const BASE = process.env.BASE || 'http://localhost:3000';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let failures = 0;
const ok = (cond, label, extra = '') => { console.log(`${cond ? 'PASS' : 'FAIL'}  ${label} ${extra}`); if (!cond) failures++; };

async function login(username, password) {
  const r = await fetch(BASE + '/api/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username, password }) });
  if (!r.ok) throw new Error('login ' + username + ' -> HTTP ' + r.status);
  return (await r.json()).token;
}
function connect(token) {
  return new Promise((resolve, reject) => {
    const s = io(BASE, { auth: { token }, transports: ['websocket', 'polling'] });
    s.on('connect', () => resolve(s));
    s.on('connect_error', reject);
    setTimeout(() => reject(new Error('connect timeout')), 8000);
  });
}
function waitEvent(socket, ev, pred, timeoutMs = 8000, label = ev) {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('timeout cho ' + label)), timeoutMs);
    socket.on(ev, (d) => { if (!pred || pred(d)) { clearTimeout(t); resolve(d); } });
  });
}
function emitAck(socket, ev, payload) {
  return new Promise((resolve, reject) => {
    socket.emit(ev, payload, (res) => (res ? resolve(res) : reject(new Error('no ack ' + ev))));
    setTimeout(() => reject(new Error('ack timeout ' + ev)), 8000);
  });
}

(async () => {
  const [ta, tb] = await Promise.all([login('admin', 'admin123'), login('lananh', '123456')]);
  ok(!!ta && !!tb, 'REST login cho ca 2 tai khoan');
  const newUser = 'testuser' + Date.now().toString().slice(-6);
  const reg = await fetch(BASE + '/api/register', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: newUser, password: 'test123456', displayName: 'Nguoi Dung Test' }) });
  const regBody = await reg.json().catch(() => ({}));
  ok(reg.status === 201 && !!regBody.token, 'Dang ky tai khoan moi thanh cong', '(HTTP ' + reg.status + ')');
  const dup = await fetch(BASE + '/api/register', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: newUser, password: 'test123456', displayName: 'Trung Lap' }) });
  ok(dup.status === 409, 'Dang ky trung tai khoan bi tu choi', '(HTTP ' + dup.status + ')');
  const dupSeed = await fetch(BASE + '/api/register', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: 'lananh', password: 'test123456', displayName: 'Trung Seed' }) });
  ok(dupSeed.status === 409, 'Dang ky trung tai khoan cap san bi tu choi', '(HTTP ' + dupSeed.status + ')');
  const tNew = await login(newUser, 'test123456');
  ok(!!tNew, 'Tai khoan moi dang nhap lai duoc');

  const A = await connect(ta); const B = await connect(tb);
  const presP = waitEvent(B, 'presence', (d) => d.online.includes('admin') && d.online.includes('lananh'), 8000, 'presence 2 nguoi');
  B.emit('presence:get');
  let pres; try { pres = await presP; } catch { pres = null; }
  ok(!!pres, 'Presence: ca admin va lananh deu online', pres ? JSON.stringify(pres.online) : '');

  const gotByB = waitEvent(B, 'message:new', (m) => m.from === 'admin' && m.type === 'text', 8000, 'B nhan text');
  const ack1 = await emitAck(A, 'message:send', { to: 'lananh', type: 'text', content: 'Xin chao tu test tu dong' });
  ok(ack1.ok === true, 'A gui text - server ack ok');
  const m1 = await gotByB;
  ok(m1.content === 'Xin chao tu test tu dong', 'B NHAN DUOC text cua A', JSON.stringify(m1.content));

  const gotByA = waitEvent(A, 'message:new', (m) => m.from === 'lananh' && m.type === 'sticker', 8000, 'A nhan sticker');
  const ack2 = await emitAck(B, 'message:send', { to: 'admin', type: 'sticker', content: '❤️' });
  const m2 = await gotByA;
  ok(ack2.ok === true && m2.content === '❤️', 'A NHAN DUOC sticker cua B', JSON.stringify(m2.content));

  const r = await fetch(BASE + '/api/messages/lananh', { headers: { Authorization: 'Bearer ' + ta } });
  const hist = (await r.json()).messages || [];
  ok(hist.length >= 2, 'Lich su tin nhan da luu tren server', '(' + hist.length + ' tin)');

  // --- WebRTC signaling relay ---
  const incoming = waitEvent(B, 'call:incoming', (d) => d.from === 'admin', 8000, 'B nhan cuoc goi den');
  A.emit('call:offer', { to: 'lananh', offer: { type: 'offer', sdp: 'fake-sdp-offer' }, callType: 'voice' });
  const inc = await incoming;
  ok(inc.callType === 'voice' && inc.offer.sdp === 'fake-sdp-offer', 'Signaling: B nhan offer (incoming call)');

  const answered = waitEvent(A, 'call:answered', (d) => d.from === 'lananh', 8000, 'A nhan answer');
  B.emit('call:answer', { to: 'admin', answer: { type: 'answer', sdp: 'fake-sdp-answer' } });
  const ans = await answered;
  ok(ans.answer.sdp === 'fake-sdp-answer', 'Signaling: A nhan answer cua B');

  const ice = waitEvent(B, 'call:ice', (d) => d.from === 'admin', 8000, 'B nhan ICE');
  A.emit('call:ice', { to: 'lananh', candidate: { candidate: 'candidate:fake', sdpMid: '0' } });
  const iceD = await ice;
  ok(iceD.candidate.candidate === 'candidate:fake', 'Signaling: ICE candidate duoc chuyen tiep');

  const ended = waitEvent(A, 'call:ended', (d) => d.from === 'lananh', 8000, 'A nhan end-call');
  B.emit('call:end', { to: 'admin' });
  await ended;
  ok(true, 'Signaling: end-call duoc chuyen tiep');

  A.close(); B.close();
  console.log(failures === 0 ? '\nTAT CA TEST PASS' : `\nCO ${failures} TEST FAIL`);
  process.exit(failures === 0 ? 0 : 1);
})().catch((e) => { console.error('FAIL (exception):', e.message); process.exit(1); });
