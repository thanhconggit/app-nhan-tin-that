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
const AVATAR_FILE = path.join(DATA_DIR, 'avatars.json');
const SAVED_FILE = path.join(DATA_DIR, 'saved.json');
fs.mkdirSync(DATA_DIR, { recursive: true });

// Danh sach tai khoan da dang ky can XOA khoi noi luu tru khi khoi dong,
// khai bao qua bien moi truong REMOVE_USERS (vi du: REMOVE_USERS=kiemtra,abc).
// Server xoa cac tai khoan nay ca trong database/file roi moi tiep tuc chay.
const REMOVE_USERS = (process.env.REMOVE_USERS || '').split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);

let messages = [];
let registeredUsers = [];
let groups = [];
let groupSeq = 0;
let avatars = new Map();       // username -> data URL anh dai dien
let savedByUser = new Map();   // username -> [{msgId, snapshot, at}] (moi nhat dung dau mang khi tra ve API)
const publicGroup = (g) => ({ id: g.id, name: g.name, members: g.members, createdBy: g.createdBy, at: g.at });
function safeParseReactions(s) { try { const o = JSON.parse(s || '{}'); return o && typeof o === 'object' ? o : {}; } catch { return {}; } }
function safeParseExtra(s) {
  try { const o = JSON.parse(s || '{}'); return { replyTo: o && o.replyTo ? o.replyTo : null, forwarded: !!(o && o.forwarded) }; }
  catch { return { replyTo: null, forwarded: false }; }
}
/* Ban xem truoc cua 1 tin de lam trich dan (tra loi) hoac hien trong muc Da luu */
function msgPreviewOf(m) {
  if (!m || m.type === 'recalled') return 'Tin nhắn đã thu hồi';
  if (m.type === 'text' || m.type === 'emoji') return String(m.content || '').slice(0, 90);
  return ({ sticker: '🎨 Sticker', gif: '🎬 GIF', image: '🖼️ Hình ảnh', audio: '🎤 Tin nhắn thoại', call: '📞 ' + (m.content || 'Cuộc gọi') })[m.type] || 'Tin nhắn';
}
function replySnapshot(src) { return { id: src.id, from: src.from, type: src.type, preview: msgPreviewOf(src) }; }
/* Nguoi dung co quyen xem tin nay khong (1-1: la 1 trong 2 phia; nhom: la thanh vien) */
function canAccessMessage(m, username) {
  if (!m) return false;
  if (m.groupId) { const g = groups.find((x) => x.id === m.groupId); return !!(g && g.members.includes(username)); }
  return m.from === username || m.to === username;
}
const userByName = new Map(USERS.map((u) => [u.username, u]));
const publicUser = (u) => ({ username: u.username, displayName: u.displayName, avatar: avatars.get(u.username) || null });
let seq = 0;

let saveTimer = null;
function writeMessagesFile() {
  try { fs.writeFileSync(MSG_FILE, JSON.stringify(messages)); } catch (e) { console.error('Luu tin nhan loi:', e.message); }
}
function persistGroupsFile() {
  try { fs.writeFileSync(GROUP_FILE, JSON.stringify(groups)); } catch (e) { console.error('Luu nhom loi:', e.message); }
}

/* Cap nhat 1 tin nhan da co (thu hoi / cam xuc) vao noi luu tru */
function updateStoredMessage(msg) {
  if (pool) {
    pool.query(
      'UPDATE messages SET type=$1, content=$2, reactions=$3 WHERE id=$4',
      [msg.type, msg.content, JSON.stringify(msg.reactions || {}), msg.id]
    ).catch((e) => console.error('Cap nhat tin nhan (DB) loi:', e.message));
    return;
  }
  writeMessagesFile();
}

function persist(msg) {
  if (pool) {
    pool.query(
      'INSERT INTO messages(id, sender, recipient, type, content, at, grp, reactions, extra) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) ON CONFLICT (id) DO NOTHING',
      [msg.id, msg.from, msg.to || '', msg.type, msg.content, msg.at, msg.groupId || null, JSON.stringify(msg.reactions || {}), JSON.stringify({ replyTo: msg.replyTo || null, forwarded: !!msg.forwarded })]
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

function persistAvatarsFile() {
  try { fs.writeFileSync(AVATAR_FILE, JSON.stringify([...avatars.entries()])); } catch (e) { console.error('Luu avatar loi:', e.message); }
}
function persistSavedFile() {
  try { fs.writeFileSync(SAVED_FILE, JSON.stringify([...savedByUser.entries()])); } catch (e) { console.error('Luu tin da luu loi:', e.message); }
}
function saveAvatar(username, dataUrl) {
  if (pool) {
    if (dataUrl) pool.query('INSERT INTO avatars(username, avatar) VALUES($1,$2) ON CONFLICT (username) DO UPDATE SET avatar=EXCLUDED.avatar', [username, dataUrl]).catch((e) => console.error('Luu avatar (DB) loi:', e.message));
    else pool.query('DELETE FROM avatars WHERE username=$1', [username]).catch((e) => console.error('Xoa avatar (DB) loi:', e.message));
    return;
  }
  persistAvatarsFile();
}
function storeSaved(username, entry) {
  if (pool) {
    pool.query('INSERT INTO saved_messages(username, msg_id, snapshot, at) VALUES($1,$2,$3,$4) ON CONFLICT (username, msg_id) DO NOTHING',
      [username, entry.msgId, JSON.stringify(entry.snapshot), entry.at]).catch((e) => console.error('Luu tin (DB) loi:', e.message));
    return;
  }
  persistSavedFile();
}
function removeSaved(username, msgId) {
  if (pool) {
    pool.query('DELETE FROM saved_messages WHERE username=$1 AND msg_id=$2', [username, msgId]).catch((e) => console.error('Xoa tin da luu (DB) loi:', e.message));
    return;
  }
  persistSavedFile();
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
    await pool.query('CREATE TABLE IF NOT EXISTS messages(id BIGINT PRIMARY KEY, sender TEXT NOT NULL, recipient TEXT NOT NULL, type TEXT NOT NULL, content TEXT NOT NULL, at BIGINT NOT NULL, grp TEXT, reactions TEXT, extra TEXT)');
    await pool.query('ALTER TABLE messages ADD COLUMN IF NOT EXISTS grp TEXT');
    await pool.query('ALTER TABLE messages ADD COLUMN IF NOT EXISTS reactions TEXT');
    await pool.query('ALTER TABLE messages ADD COLUMN IF NOT EXISTS extra TEXT');
    await pool.query('CREATE TABLE IF NOT EXISTS groups(id TEXT PRIMARY KEY, name TEXT NOT NULL, members TEXT NOT NULL, created_by TEXT NOT NULL, at BIGINT NOT NULL)');
    await pool.query('CREATE TABLE IF NOT EXISTS avatars(username TEXT PRIMARY KEY, avatar TEXT NOT NULL)');
    await pool.query('CREATE TABLE IF NOT EXISTS saved_messages(username TEXT NOT NULL, msg_id BIGINT NOT NULL, snapshot TEXT NOT NULL, at BIGINT NOT NULL, PRIMARY KEY(username, msg_id))');
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
    const rm = await pool.query('SELECT id, sender, recipient, type, content, at, grp, reactions, extra FROM messages ORDER BY id ASC');
    messages = rm.rows.map((r) => {
      const ex = safeParseExtra(r.extra);
      return { id: Number(r.id), from: r.sender, to: r.recipient || undefined, type: r.type, content: r.content, at: Number(r.at), reactions: safeParseReactions(r.reactions), ...(r.grp ? { groupId: r.grp } : {}), ...(ex.replyTo ? { replyTo: ex.replyTo } : {}), ...(ex.forwarded ? { forwarded: true } : {}) };
    });
    const rg = await pool.query('SELECT id, name, members, created_by, at FROM groups ORDER BY at ASC');
    groups = rg.rows.map((r) => ({ id: r.id, name: r.name, members: JSON.parse(r.members), createdBy: r.created_by, at: Number(r.at) }));
    const rav = await pool.query('SELECT username, avatar FROM avatars');
    avatars = new Map(rav.rows.map((r) => [r.username, r.avatar]));
    const rsv = await pool.query('SELECT username, msg_id, snapshot, at FROM saved_messages ORDER BY at ASC');
    savedByUser = new Map();
    for (const r of rsv.rows) {
      if (!savedByUser.has(r.username)) savedByUser.set(r.username, []);
      let snap = {}; try { snap = JSON.parse(r.snapshot); } catch { /* bo qua */ }
      savedByUser.get(r.username).push({ msgId: Number(r.msg_id), snapshot: snap, at: Number(r.at) });
    }
    console.log(`[DB] Da nap ${registeredUsers.length} tai khoan dang ky, ${messages.length} tin nhan va ${groups.length} nhom tu Postgres`);
  } else {
    try { if (fs.existsSync(MSG_FILE)) messages = JSON.parse(fs.readFileSync(MSG_FILE, 'utf8')); if (!Array.isArray(messages)) messages = []; } catch { messages = []; }
    try { if (fs.existsSync(GROUP_FILE)) groups = JSON.parse(fs.readFileSync(GROUP_FILE, 'utf8')); if (!Array.isArray(groups)) groups = []; } catch { groups = []; }
    try { if (fs.existsSync(AVATAR_FILE)) avatars = new Map(JSON.parse(fs.readFileSync(AVATAR_FILE, 'utf8'))); } catch { avatars = new Map(); }
    try { if (fs.existsSync(SAVED_FILE)) savedByUser = new Map(JSON.parse(fs.readFileSync(SAVED_FILE, 'utf8'))); } catch { savedByUser = new Map(); }
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
  for (const m of messages) if (!m.reactions || typeof m.reactions !== 'object') m.reactions = {};
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

/* Doi avatar: gui data URL anh (client nen nho ~128px, toi da 200KB); gui avatar rong/null de xoa */
app.put('/api/me/avatar', authRest, (req, res) => {
  const avatar = (req.body || {}).avatar;
  if (avatar === null || avatar === '') {
    avatars.delete(req.username);
    saveAvatar(req.username, null);
    io.emit('user:updated', { username: req.username, avatar: null, displayName: userByName.get(req.username).displayName });
    return res.json({ ok: true, avatar: null });
  }
  if (typeof avatar !== 'string' || !avatar.startsWith('data:image/') || avatar.length > 200_000) {
    return res.status(400).json({ error: 'Avatar khong hop le (can anh nho duoi 200KB)' });
  }
  avatars.set(req.username, avatar);
  saveAvatar(req.username, avatar);
  io.emit('user:updated', { username: req.username, avatar, displayName: userByName.get(req.username).displayName });
  res.json({ ok: true, avatar });
});

/* ===== Tin nhan da luu (bookmark ca nhan, luu ban chup noi dung) ===== */
app.get('/api/saved', authRest, (req, res) => {
  const list = (savedByUser.get(req.username) || []).slice().sort((a, b) => b.at - a.at);
  res.json({ saved: list });
});

app.post('/api/saved', authRest, (req, res) => {
  const msgId = Number((req.body || {}).msgId);
  const msg = messages.find((m) => m.id === msgId);
  if (!msg || !canAccessMessage(msg, req.username)) return res.status(404).json({ error: 'Khong tim thay tin nhan' });
  if (msg.type === 'recalled') return res.status(400).json({ error: 'Tin da thu hoi, khong luu duoc' });
  const list = savedByUser.get(req.username) || [];
  const existing = list.find((e) => e.msgId === msgId);
  if (existing) return res.json({ ok: true, entry: existing });
  if (list.length >= 200) return res.status(400).json({ error: 'Da luu toi da 200 tin' });
  const snapshot = { id: msg.id, from: msg.from, to: msg.to, groupId: msg.groupId, type: msg.type, content: msg.content, at: msg.at };
  const entry = { msgId, snapshot, at: Date.now() };
  list.push(entry);
  savedByUser.set(req.username, list);
  storeSaved(req.username, entry);
  res.status(201).json({ ok: true, entry });
});

app.delete('/api/saved/:msgId', authRest, (req, res) => {
  const msgId = Number(req.params.msgId);
  const list = savedByUser.get(req.username) || [];
  const next = list.filter((e) => e.msgId !== msgId);
  if (next.length === list.length) return res.status(404).json({ error: 'Khong tim thay tin da luu' });
  savedByUser.set(req.username, next);
  removeSaved(req.username, msgId);
  res.json({ ok: true });
});

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

// Xoa nhom: chi nguoi tao nhom moi xoa duoc; xoa ca tin nhan cua nhom
app.delete('/api/groups/:id', authRest, async (req, res) => {
  const idx = groups.findIndex((x) => x.id === req.params.id);
  if (idx < 0) return res.status(404).json({ error: 'Khong tim thay nhom' });
  const g = groups[idx];
  if (g.createdBy !== req.username) return res.status(403).json({ error: 'Chi nguoi tao nhom moi xoa duoc nhom' });
  groups.splice(idx, 1);
  messages = messages.filter((m) => m.groupId !== g.id);
  if (pool) {
    try {
      await pool.query('DELETE FROM messages WHERE grp=$1', [g.id]);
      await pool.query('DELETE FROM groups WHERE id=$1', [g.id]);
    } catch (e) { console.error('Xoa nhom (DB) loi:', e.message); }
  } else { persistGroupsFile(); writeMessagesFile(); }
  for (const m of g.members) if (m !== req.username) emitToUser(m, 'group:deleted', { id: g.id, name: g.name });
  res.json({ ok: true });
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
/* Danh sach nguoi nhan thong bao ve 1 tin nhan (doi tac 1-1 hoac thanh vien nhom), tru nguoi gui */
function msgAudience(msg, except) {
  if (msg.groupId) {
    const g = groups.find((x) => x.id === msg.groupId);
    return g ? g.members.filter((u) => u !== except) : [];
  }
  const other = msg.from === except ? msg.to : msg.from;
  return other && other !== except ? [other] : [];
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
    const { to, groupId, replyTo, forwardOf } = payload || {};
    let { type, content } = payload || {};
    let forwarded = false;
    /* Chia se tin nhan: server tu sao chep noi dung tu tin goc (khong tin noi dung client gui len) */
    if (forwardOf != null) {
      const src = messages.find((m) => m.id === Number(forwardOf));
      if (!src || !canAccessMessage(src, me)) return ack?.({ ok: false, error: 'Khong tim thay tin goc' });
      if (src.type === 'recalled' || src.type === 'call') return ack?.({ ok: false, error: 'Khong the chia se tin nay' });
      type = src.type; content = src.content; forwarded = true;
    }
    if (!ALLOWED_TYPES.has(type)) return ack?.({ ok: false, error: 'Loai tin nhan khong hop le' });
    if (typeof content !== 'string' || content.length === 0) return ack?.({ ok: false, error: 'Noi dung rong' });
    if ((type === 'image' || type === 'audio') && content.length > MAX_DATA_URL) return ack?.({ ok: false, error: 'File qua lon' });
    if (type !== 'image' && type !== 'audio' && content.length > 4000) return ack?.({ ok: false, error: 'Noi dung qua dai' });
    /* Trich dan tra loi: chi chap nhan tin thuoc cung cuoc tro chuyen, sai thi bo qua trich dan (van gui tin) */
    let replySnap;
    if (!forwarded && replyTo != null) {
      const src = messages.find((m) => m.id === Number(replyTo));
      if (src && src.type !== 'call') {
        const sameConv = groupId ? src.groupId === groupId : (!src.groupId && ((src.from === me && src.to === to) || (src.from === to && src.to === me)));
        if (sameConv) replySnap = replySnapshot(src);
      }
    }
    if (groupId) {
      const g = groups.find((x) => x.id === groupId);
      if (!g || !g.members.includes(me)) return ack?.({ ok: false, error: 'Nhom khong hop le' });
      const msg = { id: ++seq, from: me, groupId, type, content, at: Date.now(), reactions: {}, ...(replySnap ? { replyTo: replySnap } : {}), ...(forwarded ? { forwarded: true } : {}) };
      messages.push(msg);
      if (messages.length > 5000) messages = messages.slice(-5000);
      persist(msg);
      for (const m of g.members) if (m !== me) emitToUser(m, 'message:new', msg);
      return ack?.({ ok: true, message: msg });
    }
    if (!userByName.has(to) || to === me) return ack?.({ ok: false, error: 'Nguoi nhan khong hop le' });
    const msg = { id: ++seq, from: me, to, type, content, at: Date.now(), reactions: {}, ...(replySnap ? { replyTo: replySnap } : {}), ...(forwarded ? { forwarded: true } : {}) };
    messages.push(msg);
    if (messages.length > 5000) messages = messages.slice(-5000);
    persist(msg);
    emitToUser(to, 'message:new', msg);
    ack?.({ ok: true, message: msg });
  });

  /* Thu hoi tin nhan: chi nguoi gui, ca hai phia deu thay "Tin nhan da thu hoi" */
  socket.on('message:recall', ({ id } = {}, ack) => {
    const msg = messages.find((m) => m.id === Number(id));
    if (!msg || msg.from !== me) return ack?.({ ok: false, error: 'Chi thu hoi duoc tin nhan cua ban' });
    if (msg.type === 'recalled' || msg.type === 'call') return ack?.({ ok: false, error: 'Khong the thu hoi tin nay' });
    msg.type = 'recalled'; msg.content = ''; msg.reactions = {};
    updateStoredMessage(msg);
    for (const u of msgAudience(msg, me)) emitToUser(u, 'message:updated', msg);
    ack?.({ ok: true, message: msg });
  });

  /* Tha cam xuc vao tin nhan: bam lai cung 1 emoji de go */
  const REACT_EMOJIS = new Set(['❤️', '😂', '😮', '😢', '👍', '😡']);
  socket.on('message:react', ({ id, emoji } = {}, ack) => {
    const msg = messages.find((m) => m.id === Number(id));
    if (!msg || !REACT_EMOJIS.has(emoji)) return ack?.({ ok: false, error: 'Cam xuc khong hop le' });
    if (msg.type === 'recalled') return ack?.({ ok: false, error: 'Tin da thu hoi' });
    const isParty = msg.groupId
      ? (groups.find((g) => g.id === msg.groupId)?.members.includes(me) ?? false)
      : (msg.from === me || msg.to === me);
    if (!isParty) return ack?.({ ok: false, error: 'Khong co quyen voi tin nay' });
    msg.reactions = msg.reactions || {};
    if (msg.reactions[me] === emoji) delete msg.reactions[me]; else msg.reactions[me] = emoji;
    updateStoredMessage(msg);
    const payload = { id: msg.id, reactions: msg.reactions, from: msg.from, to: msg.to, groupId: msg.groupId };
    for (const u of msgAudience(msg, me)) emitToUser(u, 'message:reacted', payload);
    ack?.({ ok: true, reactions: msg.reactions });
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
