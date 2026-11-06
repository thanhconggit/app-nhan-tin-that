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

// Luu tru du lieu:
// - Co DATABASE_URL: dung Postgres (Neon) - tai khoan va tin nhan ben vung, khong mat khi deploy lai.
// - Khong co: dung file JSON trong data/ (chi de chay local - host mien phi xoa sach file nay moi lan deploy).
const DATABASE_URL = process.env.DATABASE_URL || '';
let pool = null;
if (DATABASE_URL) {
  const { Pool } = require('pg');
  pool = new Pool({ connectionString: DATABASE_URL, ssl: { rejectUnauthorized: false } });
}

const DATA_DIR = path.join(__dirname, 'data');
const MSG_FILE = path.join(DATA_DIR, 'messages.json');
const USER_FILE = path.join(DATA_DIR, 'users.json');
const GROUP_FILE = path.join(DATA_DIR, 'groups.json');
fs.mkdirSync(DATA_DIR, { recursive: true });

// Danh sach tai khoan da dang ky can XOA khoi noi luu tru khi khoi dong,
// khai bao qua bien moi truong REMOVE_USERS (vi du: REMOVE_USERS=kiemtra,abc).
// Server xoa cac tai khoan nay ca trong database/file roi moi tiep tuc chay.
const REMOVE_USERS = (process.env.REMOVE_USERS || '').split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);

let messages = [];
let registeredUsers = [];
let groups = [];
let groupSeq = 0;
const publicGroup = (g) => ({ id: g.id, name: g.name, members: g.members, createdBy: g.createdBy, at: g.at });
const userByName = new Map(USERS.map((u) => [u.username, u]));
const publicUser = (u) => ({ username: u.username, displayName: u.displayName });
let seq = 0;

let saveTimer = null;
function persist(msg) {
  if (pool) {
    pool.query(
      'INSERT INTO messages(id, sender, recipient, type, content, at, grp) VALUES($1,$2,$3,$4,$5,$6,$7) ON CONFLICT (id) DO NOTHING',
      [msg.id, msg.from, msg.to || '', msg.type, msg.content, msg.at, msg.groupId || null]
    ).catch((e) => console.error('Luu tin nhan (DB) loi:', e.message));
    return;
  }
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    try { fs.writeFileSync(MSG_FILE, JSON.stringify(messages)); } catch (e) { console.error('Luu tin nhan loi:', e.message); }
  }, 150);
}

function saveGroup(g) {
  if (pool) {
    pool.query(
      'INSERT INTO groups(id, name, members, created_by, at) VALUES($1,$2,$3,$4,$5) ON CONFLICT (id) DO NOTHING',
      [g.id, g.name, JSON.stringify(g.members), g.createdBy, g.at]
    ).catch((e) => console.error('Luu nhom (DB) loi:', e.message));
    return;
  }
  try { fs.writeFileSync(GROUP_FILE, JSON.stringify(groups)); } catch (e) { console.error('Luu nhom loi:', e.message); }
}

function saveUser(u) {
  if (pool) {
    pool.query(
      'INSERT INTO users(username, display_name, password_hash) VALUES($1,$2,$3) ON CONFLICT (username) DO NOTHING',
      [u.username, u.displayName, u.passwordHash]
    ).catch((e) => console.error('Luu tai khoan (DB) loi:', e.message));
    return;
  }
  try { fs.writeFileSync(USER_FILE, JSON.stringify(registeredUsers)); } catch (e) { console.error('Luu tai khoan loi:', e.message); }
}

async function initStorage() {
  if (pool) {
    await pool.query('CREATE TABLE IF NOT EXISTS users(username TEXT PRIMARY KEY, display_name TEXT NOT NULL, password_hash TEXT NOT NULL)');
    await pool.query('CREATE TABLE IF NOT EXISTS messages(id BIGINT PRIMARY KEY, sender TEXT NOT NULL, recipient TEXT NOT NULL, type TEXT NOT NULL, content TEXT NOT NULL, at BIGINT NOT NULL, grp TEXT)');
    await pool.query('ALTER TABLE messages ADD COLUMN IF NOT EXISTS grp TEXT');
    await pool.query('CREATE TABLE IF NOT EXISTS groups(id TEXT PRIMARY KEY, name TEXT NOT NULL, members TEXT NOT NULL, created_by TEXT NOT NULL, at BIGINT NOT NULL)');
    const ru = await pool.query('SELECT username, display_name, password_hash FROM users');
    registeredUsers = ru.rows.map((r) => ({ username: r.username, displayName: r.display_name, passwordHash: r.password_hash }));
    if (REMOVE_USERS.length) {
      const before = registeredUsers.length;
      registeredUsers = registeredUsers.filter((u) => !REMOVE_USERS.includes(u.username));
      if (registeredUsers.length !== before) {
        await pool.query('DELETE FROM users WHERE username = ANY($1)', [REMOVE_USERS]);
        console.log(`[DB] Da xoa ${before - registeredUsers.length} tai khoan theo REMOVE_USERS: ${REMOVE_USERS.join(', ')}`);
      }
    }
    const rm = await pool.query('SELECT id, sender, recipient, type, content, at, grp FROM messages ORDER BY id ASC');
    messages = rm.rows.map((r) => ({ id: Number(r.id), from: r.sender, to: r.recipient || undefined, type: r.type, content: r.content, at: Number(r.at), ...(r.grp ? { groupId: r.grp } : {}) }));
    const rg = await pool.query('SELECT id, name, members, created_by, at FROM groups ORDER BY at ASC');
    groups = rg.rows.map((r) => ({ id: r.id, name: r.name, members: JSON.parse(r.members), createdBy: r.created_by, at: Number(r.at) }));
    console.log(`[DB] Da nap ${registeredUsers.length} tai khoan dang ky, ${messages.length} tin nhan va ${groups.length} nhom tu Postgres`);
  } else {
    try { if (fs.existsSync(MSG_FILE)) messages = JSON.parse(fs.readFileSync(MSG_FILE, 'utf8')); if (!Array.isArray(messages)) messages = []; } catch { messages = []; }
    try { if (fs.existsSync(GROUP_FILE)) groups = JSON.parse(fs.readFileSync(GROUP_FILE, 'utf8')); if (!Array.isArray(groups)) groups = []; } catch { groups = []; }
    try { if (fs.existsSync(USER_FILE)) registeredUsers = JSON.parse(fs.readFileSync(USER_FILE, 'utf8')); if (!Array.isArray(registeredUsers)) registeredUsers = []; } catch { registeredUsers = []; }
    if (REMOVE_USERS.length) {
      const before = registeredUsers.length;
      registeredUsers = registeredUsers.filter((u) => !REMOVE_USERS.includes(u.username));
      if (registeredUsers.length !== before) {
        try { fs.writeFileSync(USER_FILE, JSON.stringify(registeredUsers)); } catch (e) { console.error('Luu tai khoan loi:', e.message); }
        console.log(`[FILE] Da xoa ${before - registeredUsers.length} tai khoan theo REMOVE_USERS: ${REMOVE_USERS.join(', ')}`);
      }
    }
  }
  for (const u of registeredUsers) if (u && u.username && !userByName.has(u.username)) userByName.set(u.username, u);
  seq = messages.reduce((m, x) => Math.max(m, x.id || 0), 0);
}

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

// Tao tai khoan moi - luu tren server (Postgres neu co DATABASE_URL, khong thi data/users.json), mat khau chi luu bcrypt hash
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
  saveUser(u);
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

// ===== Nhom chat =====
// Tao nhom: nguoi tao tu dong la thanh vien, can chon it nhat 2 thanh vien khac
app.post('/api/groups', authRest, (req, res) => {
  const name = String((req.body || {}).name || '').trim();
  const rawMembers = Array.isArray((req.body || {}).members) ? req.body.members : [];
  const members = [...new Set(rawMembers.map((m) => String(m || '').trim().toLowerCase()))]
    .filter((m) => m !== req.username && userByName.has(m));
  if (name.length < 2 || name.length > 60) return res.status(400).json({ error: 'Ten nhom tu 2-60 ky tu' });
  if (members.length < 2) return res.status(400).json({ error: 'Chon it nhat 2 thanh vien (ngoai ban)' });
  const g = { id: 'g' + Date.now().toString(36) + (++groupSeq).toString(36), name, members: [req.username, ...members], createdBy: req.username, at: Date.now() };
  groups.push(g);
  saveGroup(g);
  for (const m of g.members) if (m !== req.username) emitToUser(m, 'group:created', publicGroup(g));
  res.status(201).json({ group: publicGroup(g) });
});

app.get('/api/groups', authRest, (req, res) => {
  res.json({ groups: groups.filter((g) => g.members.includes(req.username)).map(publicGroup) });
});

app.get('/api/groups/:id/messages', authRest, (req, res) => {
  const g = groups.find((x) => x.id === req.params.id);
  if (!g) return res.status(404).json({ error: 'Khong tim thay nhom' });
  if (!g.members.includes(req.username)) return res.status(403).json({ error: 'Ban khong phai thanh vien nhom' });
  res.json({ messages: messages.filter((m) => m.groupId === g.id) });
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
    const { to, groupId, type, content } = payload || {};
    if (!ALLOWED_TYPES.has(type)) return ack?.({ ok: false, error: 'Loai tin nhan khong hop le' });
    if (typeof content !== 'string' || content.length === 0) return ack?.({ ok: false, error: 'Noi dung rong' });
    if ((type === 'image' || type === 'audio') && content.length > MAX_DATA_URL) return ack?.({ ok: false, error: 'File qua lon' });
    if (type !== 'image' && type !== 'audio' && content.length > 4000) return ack?.({ ok: false, error: 'Noi dung qua dai' });
    if (groupId) {
      const g = groups.find((x) => x.id === groupId);
      if (!g || !g.members.includes(me)) return ack?.({ ok: false, error: 'Nhom khong hop le' });
      const msg = { id: ++seq, from: me, groupId, type, content, at: Date.now() };
      messages.push(msg);
      if (messages.length > 5000) messages = messages.slice(-5000);
      persist(msg);
      for (const m of g.members) if (m !== me) emitToUser(m, 'message:new', msg);
      return ack?.({ ok: true, message: msg });
    }
    if (!userByName.has(to) || to === me) return ack?.({ ok: false, error: 'Nguoi nhan khong hop le' });
    const msg = { id: ++seq, from: me, to, type, content, at: Date.now() };
    messages.push(msg);
    if (messages.length > 5000) messages = messages.slice(-5000);
    persist(msg);
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

initStorage()
  .then(() => server.listen(PORT, () => console.log(`App nhan tin dang chay tai http://localhost:${PORT}`)))
  .catch((e) => { console.error('Loi khoi tao luu tru, khong the khoi dong:', e.message); process.exit(1); });
