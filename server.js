'use strict';
const fs = require('fs');
const path = require('path');
const http = require('http');
const express = require('express');
const { Server } = require('socket.io');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const USERS = require('./seed-users');

const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'doi-bi-mat-nay-khi-deploy-that';
if (!process.env.JWT_SECRET) {
  console.warn('[CANH BAO] Chua dat JWT_SECRET - dang dung gia tri tam. Hay dat JWT_SECRET tren host truoc khi dung that.');
}

const DATA_DIR = path.join(__dirname, 'data');
const MSG_FILE = path.join(DATA_DIR, 'messages.json');
fs.mkdirSync(DATA_DIR, { recursive: true });

let messages = [];
try {
  if (fs.existsSync(MSG_FILE)) messages = JSON.parse(fs.readFileSync(MSG_FILE, 'utf8'));
  if (!Array.isArray(messages)) messages = [];
} catch { messages = []; }

let saveTimer = null;
function persist() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    try { fs.writeFileSync(MSG_FILE, JSON.stringify(messages)); } catch (e) { console.error('Luu tin nhan loi:', e.message); }
  }, 150);
}

const USER_FILE = path.join(DATA_DIR, 'users.json');
let registeredUsers = [];
try {
  if (fs.existsSync(USER_FILE)) registeredUsers = JSON.parse(fs.readFileSync(USER_FILE, 'utf8'));
  if (!Array.isArray(registeredUsers)) registeredUsers = [];
} catch { registeredUsers = []; }
const userByName = new Map(USERS.map((u) => [u.username, u]));
for (const u of registeredUsers) if (u && u.username && !userByName.has(u.username)) userByName.set(u.username, u);
function saveUsers() {
  try { fs.writeFileSync(USER_FILE, JSON.stringify(registeredUsers)); } catch (e) { console.error('Luu tai khoan loi:', e.message); }
}
const publicUser = (u) => ({ username: u.username, displayName: u.displayName });
let seq = messages.reduce((m, x) => Math.max(m, x.id || 0), 0);

const app = express();
app.use(express.json({ limit: '12mb' }));
app.use(express.static(path.join(__dirname, 'public')));

function authRest(req, res, next) {
  const h = req.headers.authorization || '';
  const token = h.startsWith('Bearer ') ? h.slice(7) : '';
  try {
    const p = jwt.verify(token, JWT_SECRET);
    if (!userByName.has(p.username)) throw new Error('no user');
    req.username = p.username;
    next();
  } catch { res.status(401).json({ error: 'Phien dang nhap khong hop le' }); }
}

// Dang nhap - tai khoan cap san (seed-users.js) + tai khoan tu dang ky (data/users.json)
app.post('/api/login', (req, res) => {
  const { username, password } = req.body || {};
  const u = userByName.get(String(username || '').trim().toLowerCase());
  if (!u || !bcrypt.compareSync(String(password || ''), u.passwordHash)) {
    return res.status(401).json({ error: 'Sai tai khoan hoac mat khau' });
  }
  const token = jwt.sign({ username: u.username }, JWT_SECRET, { expiresIn: '30d' });
  res.json({ token, user: publicUser(u) });
});

// Tao tai khoan moi - luu tren server (data/users.json), mat khau chi luu bcrypt hash
app.post('/api/register', (req, res) => {
  const { username, password, displayName } = req.body || {};
  const un = String(username || '').trim().toLowerCase();
  const dn = String(displayName || '').trim();
  if (!/^[a-z0-9_]{3,20}$/.test(un)) return res.status(400).json({ error: 'Tai khoan 3-20 ky tu: chu thuong, so hoac dau _' });
  if (String(password || '').length < 6) return res.status(400).json({ error: 'Mat khau toi thieu 6 ky tu' });
  if (dn.length < 2 || dn.length > 50) return res.status(400).json({ error: 'Ten hien thi tu 2-50 ky tu' });
  if (userByName.has(un)) return res.status(409).json({ error: 'Tai khoan da ton tai' });
  const u = { username: un, displayName: dn, passwordHash: bcrypt.hashSync(String(password), 10) };
  registeredUsers.push(u);
  userByName.set(un, u);
  saveUsers();
  const token = jwt.sign({ username: un }, JWT_SECRET, { expiresIn: '30d' });
  res.status(201).json({ token, user: publicUser(u) });
});

app.get('/api/me', authRest, (req, res) => res.json({ user: publicUser(userByName.get(req.username)) }));

app.get('/api/users', authRest, (req, res) => {
  res.json({ users: [...userByName.values()].map(publicUser), online: [...onlineUsers()] });
});

app.get('/api/messages/:peer', authRest, (req, res) => {
  const peer = req.params.peer;
  if (!userByName.has(peer)) return res.status(404).json({ error: 'Khong tim thay nguoi dung' });
  const list = messages.filter(
    (m) => (m.from === req.username && m.to === peer) || (m.from === peer && m.to === req.username)
  );
  res.json({ messages: list });
});

app.get('/healthz', (req, res) => res.json({ ok: true }));

const server = http.createServer(app);
const io = new Server(server, { maxHttpBufferSize: 12 * 1024 * 1024 });

const socketsByUser = new Map(); // username -> Set<socketId>
function onlineUsers() {
  return new Set([...socketsByUser.entries()].filter(([, s]) => s.size > 0).map(([u]) => u));
}
function broadcastPresence() { io.emit('presence', { online: [...onlineUsers()] }); }
function emitToUser(username, ev, payload) {
  const set = socketsByUser.get(username);
  if (set) for (const id of set) io.to(id).emit(ev, payload);
}

io.use((socket, next) => {
  try {
    const p = jwt.verify(socket.handshake.auth?.token || '', JWT_SECRET);
    if (!userByName.has(p.username)) throw new Error('no user');
    socket.username = p.username;
    next();
  } catch { next(new Error('unauthorized')); }
});

const ALLOWED_TYPES = new Set(['text', 'emoji', 'sticker', 'gif', 'image', 'audio', 'call']);
const MAX_DATA_URL = 3_500_000;

io.on('connection', (socket) => {
  const me = socket.username;
  if (!socketsByUser.has(me)) socketsByUser.set(me, new Set());
  socketsByUser.get(me).add(socket.id);
  broadcastPresence();

  socket.on('message:send', (payload, ack) => {
    const { to, type, content } = payload || {};
    if (!userByName.has(to) || to === me) return ack?.({ ok: false, error: 'Nguoi nhan khong hop le' });
    if (!ALLOWED_TYPES.has(type)) return ack?.({ ok: false, error: 'Loai tin nhan khong hop le' });
    if (typeof content !== 'string' || content.length === 0) return ack?.({ ok: false, error: 'Noi dung rong' });
    if ((type === 'image' || type === 'audio') && content.length > MAX_DATA_URL) return ack?.({ ok: false, error: 'File qua lon' });
    if (type !== 'image' && type !== 'audio' && content.length > 4000) return ack?.({ ok: false, error: 'Noi dung qua dai' });
    const msg = { id: ++seq, from: me, to, type, content, at: Date.now() };
    messages.push(msg);
    if (messages.length > 5000) messages = messages.slice(-5000);
    persist();
    emitToUser(to, 'message:new', msg);
    ack?.({ ok: true, message: msg });
  });

  socket.on('typing', ({ to } = {}) => { if (userByName.has(to)) emitToUser(to, 'typing', { from: me }); });
  socket.on('presence:get', () => socket.emit('presence', { online: [...onlineUsers()] }));

  // ---- WebRTC signaling (chi chuyen tiep, media di ngang hang P2P) ----
  socket.on('call:offer', ({ to, offer, callType } = {}) => {
    if (!userByName.has(to)) return;
    emitToUser(to, 'call:incoming', { from: me, fromName: userByName.get(me).displayName, offer, callType: callType === 'video' ? 'video' : 'voice' });
  });
  socket.on('call:answer', ({ to, answer } = {}) => { if (userByName.has(to)) emitToUser(to, 'call:answered', { from: me, answer }); });
  socket.on('call:ice', ({ to, candidate } = {}) => { if (userByName.has(to)) emitToUser(to, 'call:ice', { from: me, candidate }); });
  socket.on('call:reject', ({ to } = {}) => { if (userByName.has(to)) emitToUser(to, 'call:rejected', { from: me }); });
  socket.on('call:end', ({ to } = {}) => { if (userByName.has(to)) emitToUser(to, 'call:ended', { from: me }); });

  socket.on('disconnect', () => {
    socketsByUser.get(me)?.delete(socket.id);
    broadcastPresence();
  });
});

server.listen(PORT, () => console.log(`App nhan tin dang chay tai http://localhost:${PORT}`));
