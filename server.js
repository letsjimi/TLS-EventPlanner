/**
 * TLS Event Planner Backend
 * Express + SQLite + JWT
 * Port 8999 (static SPA) + Port 3000 (API backend proxy passthrough)
 */

const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const cors = require('cors');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = 8999;
const JWT_SECRET = process.env.TLS_JWT_SECRET || 'tls-dev-secret-2026-change-in-prod';
const DB_PATH = process.env.TLS_DB_PATH || path.join(__dirname, 'data', 'tms.db');

// Ensure data directory
const dataDir = path.dirname(DB_PATH);
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

// ─── Middleware ──────────────────────────────
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.static(__dirname));

// ─── Auth Middleware ─────────────────────────
function authMW(req, res, next) {
  const bearer = req.headers.authorization;
  if (!bearer) return res.status(401).json({ error: 'Unauthorized' });
  const token = bearer.replace('Bearer ', '');
  try {
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch {
    res.status(401).json({ error: 'Invalid token' });
  }
}

function adminMW(req, res, next) {
  if (!req.user || !req.user.isAdmin) return res.status(403).json({ error: 'Forbidden' });
  next();
}

// ─── DB ─────────────────────────────────────
const db = new sqlite3.Database(DB_PATH, (err) => {
  if (err) console.error('DB open error:', err);
  else console.log('SQLite connected:', DB_PATH);
});

// Promisify helpers
const dbRun = (sql, params = []) => new Promise((resolve, reject) => {
  db.run(sql, params, function (err) { err ? reject(err) : resolve({ lastID: this.lastID, changes: this.changes }); });
});
const dbAll = (sql, params = []) => new Promise((resolve, reject) => {
  db.all(sql, params, (err, rows) => err ? reject(err) : resolve(rows));
});
const dbGet = (sql, params = []) => new Promise((resolve, reject) => {
  db.get(sql, params, (err, row) => err ? reject(err) : resolve(row));
});

// ─── Schema Init ────────────────────────────
async function initSchema() {
  await dbRun(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      display_name TEXT,
      is_admin INTEGER DEFAULT 0,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await dbRun(`
    CREATE TABLE IF NOT EXISTS events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      order_number TEXT NOT NULL,
      order_type TEXT DEFAULT 'event',
      status TEXT DEFAULT 'inquiry',
      event_type TEXT,
      date TEXT,
      client_name TEXT,
      locations TEXT,
      total_price REAL DEFAULT 0,
      deposit REAL DEFAULT 0,
      remaining REAL DEFAULT 0,
      notes TEXT,
      km INTEGER DEFAULT 0,
      duration INTEGER DEFAULT 1,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await dbRun(`
    CREATE TABLE IF NOT EXISTS locations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      event_id INTEGER NOT NULL,
      name TEXT,
      address TEXT,
      km INTEGER DEFAULT 0,
      setup_time TEXT,
      soundcheck TEXT,
      notes TEXT,
      contact_name TEXT,
      contact_phone TEXT,
      sort_order INTEGER DEFAULT 0
    )
  `);

  await dbRun(`
    CREATE TABLE IF NOT EXISTS contacts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      event_id INTEGER NOT NULL,
      role TEXT,
      name TEXT,
      phone TEXT,
      email TEXT,
      responsibility TEXT,
      notes TEXT,
      availability TEXT
    )
  `);

  await dbRun(`
    CREATE TABLE IF NOT EXISTS timeline (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      event_id INTEGER NOT NULL,
      time TEXT,
      title TEXT,
      detail TEXT,
      location TEXT,
      duration TEXT,
      crew TEXT,
      done INTEGER DEFAULT 0,
      sort_order INTEGER DEFAULT 0
    )
  `);

  await dbRun(`
    CREATE TABLE IF NOT EXISTS equipment_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      event_id INTEGER NOT NULL,
      category TEXT,
      name TEXT,
      qty INTEGER DEFAULT 1,
      unit TEXT DEFAULT 'Stk',
      price REAL,
      needed INTEGER DEFAULT 1,
      packed INTEGER DEFAULT 0,
      note TEXT DEFAULT '',
      source TEXT DEFAULT 'catalog',
      is_external INTEGER DEFAULT 0
    )
  `);

  await dbRun(`
    CREATE TABLE IF NOT EXISTS equipment_catalog (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      category TEXT,
      name TEXT,
      tags TEXT,
      unit TEXT DEFAULT 'Stk',
      price_day REAL DEFAULT 0,
      stock INTEGER DEFAULT 1,
      is_external INTEGER DEFAULT 0
    )
  `);

  await dbRun(`
    CREATE TABLE IF NOT EXISTS equipment_packages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      name TEXT,
      description TEXT,
      tags TEXT,
      items TEXT
    )
  `);

  await dbRun(`
    CREATE TABLE IF NOT EXISTS payments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      event_id INTEGER NOT NULL,
      type TEXT,
      amount REAL DEFAULT 0,
      due_date TEXT,
      status TEXT DEFAULT 'offen'
    )
  `);

  await dbRun(`
    CREATE TABLE IF NOT EXISTS event_personnel (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      event_id INTEGER NOT NULL,
      role TEXT,
      qty INTEGER DEFAULT 1,
      unit TEXT DEFAULT 'Pauschale',
      price REAL DEFAULT 0,
      needed INTEGER DEFAULT 1,
      sort_order INTEGER DEFAULT 0
    )
  `);

  await dbRun(`
    CREATE TABLE IF NOT EXISTS event_todos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      event_id INTEGER NOT NULL,
      title TEXT,
      due_date TEXT,
      done INTEGER DEFAULT 0
    )
  `);

  await dbRun(`
    CREATE TABLE IF NOT EXISTS settings (
      user_id INTEGER NOT NULL,
      key TEXT NOT NULL,
      value TEXT,
      PRIMARY KEY (user_id, key)
    )
  `);

  // Seed admin if no users
  const users = await dbAll(`SELECT id FROM users LIMIT 1`);
  if (users.length === 0) {
    const hash = await bcrypt.hash('admin', 10);
    await dbRun(`INSERT INTO users (username, password_hash, display_name, is_admin) VALUES (?, ?, ?, 1)`,
      ['admin', hash, 'Administrator']);
    console.log('Seeded default admin/admin');
  }
}

initSchema().catch(err => console.error('Schema init error:', err));

// ─── Auth ────────────────────────────────────
app.post('/api/auth/change-password', authMW, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    if (!currentPassword || !newPassword || newPassword.length < 6) {
      return res.status(400).json({ error: 'Invalid input' });
    }
    const user = await dbGet(`SELECT * FROM users WHERE id = ?`, [req.user.id]);
    if (!user) return res.status(404).json({ error: 'User not found' });
    const match = await bcrypt.compare(currentPassword, user.password_hash);
    if (!match) return res.status(401).json({ error: 'Current password incorrect' });
    const hash = await bcrypt.hash(newPassword, 10);
    await dbRun(`UPDATE users SET password_hash = ? WHERE id = ?`, [hash, req.user.id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/auth/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    const user = await dbGet(`SELECT * FROM users WHERE username = ?`, [username]);
    if (!user) return res.status(401).json({ error: 'Invalid credentials' });
    const match = await bcrypt.compare(password, user.password_hash);
    if (!match) return res.status(401).json({ error: 'Invalid credentials' });
    const token = jwt.sign({ id: user.id, username: user.username, isAdmin: !!user.is_admin }, JWT_SECRET, { expiresIn: '7d' });
    res.json({ token, user: { id: user.id, username: user.username, displayName: user.display_name, isAdmin: !!user.is_admin } });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/auth/register', async (req, res) => {
  try {
    const { username, password, displayName } = req.body;
    const hash = await bcrypt.hash(password, 10);
    const result = await dbRun(`INSERT INTO users (username, password_hash, display_name) VALUES (?, ?, ?)`,
      [username, hash, displayName || username]);
    res.json({ id: result.lastID });
  } catch (err) {
    if (err.message.includes('UNIQUE')) return res.status(409).json({ error: 'Username taken' });
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/auth/me', authMW, async (req, res) => {
  const user = await dbGet(`SELECT id, username, display_name, is_admin FROM users WHERE id = ?`, [req.user.id]);
  res.json({ ...user, displayName: user.display_name, isAdmin: !!user.is_admin });
});

app.get('/api/auth/users', authMW, adminMW, async (req, res) => {
  const rows = await dbAll(`SELECT id, username, display_name, is_admin, created_at FROM users ORDER BY id`);
  res.json(rows.map(u => ({ id: u.id, username: u.username, displayName: u.display_name, isAdmin: !!u.is_admin, createdAt: u.created_at })));
});

// ─── CRUD Events ────────────────────────────
app.get('/api/events', authMW, async (req, res) => {
  const rows = await dbAll(
    `SELECT * FROM events WHERE user_id = ? ORDER BY date DESC`,
    [req.user.id]
  );
  res.json(rows);
});

app.post('/api/events', authMW, async (req, res) => {
  const d = req.body;
  const result = await dbRun(
    `INSERT INTO events (user_id, order_number, order_type, status, event_type, date, client_name, locations, total_price, deposit, remaining, notes, km, duration)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [req.user.id, d.orderNumber, d.orderType || 'event', d.status || 'inquiry', d.eventType, d.date, d.clientName, d.locations, d.totalPrice || 0, d.deposit || 0, (d.totalPrice || 0) - (d.deposit || 0), d.notes, d.km || 0, d.duration || 1]
  );
  res.json({ id: result.lastID });
});

app.put('/api/events/:id', authMW, async (req, res) => {
  const d = req.body;
  const event = await dbGet(`SELECT * FROM events WHERE id = ? AND user_id = ?`, [req.params.id, req.user.id]);
  if (!event) return res.status(404).json({ error: 'Not found' });
  const orderNumber = d.orderNumber !== undefined ? d.orderNumber : event.order_number;
  const orderType   = d.orderType   !== undefined ? d.orderType   : event.order_type;
  const status      = d.status      !== undefined ? d.status      : event.status;
  const eventType   = d.eventType   !== undefined ? d.eventType   : event.event_type;
  const date        = d.date        !== undefined ? d.date        : event.date;
  const clientName  = d.clientName  !== undefined ? d.clientName  : event.client_name;
  const locations   = d.locations   !== undefined ? d.locations   : event.locations;
  const totalPrice  = d.totalPrice  !== undefined ? d.totalPrice  : event.total_price;
  const deposit     = d.deposit     !== undefined ? d.deposit     : event.deposit;
  const remaining   = d.remaining   !== undefined ? d.remaining   : event.remaining;
  const notes       = d.notes       !== undefined ? d.notes       : event.notes;
  const km          = d.km          !== undefined ? d.km          : event.km;
  const duration    = d.duration    !== undefined ? d.duration    : event.duration;
  const computedRemaining = (totalPrice || 0) - (deposit || 0);
  const finalRemaining = (d.totalPrice !== undefined || d.deposit !== undefined) ? computedRemaining : remaining;
  await dbRun(
    `UPDATE events SET order_number=?, order_type=?, status=?, event_type=?, date=?, client_name=?, locations=?, total_price=?, deposit=?, remaining=?, notes=?, km=?, duration=?, updated_at=CURRENT_TIMESTAMP
     WHERE id = ?`,
    [orderNumber, orderType, status, eventType, date, clientName, locations, totalPrice, deposit, finalRemaining, notes, km, duration||1, req.params.id]
  );
  res.json({ success: true });
});

app.get('/api/events/:id', authMW, async (req, res) => {
  const row = await dbGet(`SELECT * FROM events WHERE id = ? AND user_id = ?`, [req.params.id, req.user.id]);
  if (!row) return res.status(404).json({ error: 'Not found' });
  res.json(row);
});

app.delete('/api/events/:id', authMW, async (req, res) => {
  const id = req.params.id;
  const uid = req.user.id;
  await dbRun(`DELETE FROM locations WHERE event_id = ?`, [id]);
  await dbRun(`DELETE FROM contacts WHERE event_id = ?`, [id]);
  await dbRun(`DELETE FROM timeline WHERE event_id = ?`, [id]);
  await dbRun(`DELETE FROM equipment_items WHERE event_id = ?`, [id]);
  await dbRun(`DELETE FROM payments WHERE event_id = ?`, [id]);
  await dbRun(`DELETE FROM event_todos WHERE event_id = ?`, [id]);
  await dbRun(`DELETE FROM event_personnel WHERE event_id = ?`, [id]);
  await dbRun(`DELETE FROM events WHERE id = ? AND user_id = ?`, [id, uid]);
  res.json({ success: true });
});

// ─── Locations ───────────────────────────────
app.get('/api/events/:id/locations', authMW, async (req, res) => {
  const rows = await dbAll(`SELECT * FROM locations WHERE event_id = ? ORDER BY sort_order`, [req.params.id]);
  res.json(rows);
});

app.put('/api/events/:id/locations', authMW, async (req, res) => {
  const rows = req.body;
  await dbRun(`DELETE FROM locations WHERE event_id = ?`, [req.params.id]);
  for (const l of rows) {
    await dbRun(
      `INSERT INTO locations (event_id, name, address, km, setup_time, soundcheck, notes, contact_name, contact_phone, sort_order) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [req.params.id, l.name, l.address, l.km || 0, l.setupTime, l.soundcheck, l.notes, l.contactName, l.contactPhone, l.sortOrder || 0]
    );
  }
  res.json({ success: true });
});

// ─── Contacts ───────────────────────────────
app.get('/api/events/:id/contacts', authMW, async (req, res) => {
  const rows = await dbAll(`SELECT * FROM contacts WHERE event_id = ?`, [req.params.id]);
  res.json(rows);
});

app.put('/api/events/:id/contacts', authMW, async (req, res) => {
  const rows = req.body;
  await dbRun(`DELETE FROM contacts WHERE event_id = ?`, [req.params.id]);
  for (const c of rows) {
    await dbRun(
      `INSERT INTO contacts (event_id, role, name, phone, email, responsibility, notes, availability) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [req.params.id, c.role, c.name, c.phone, c.email, c.responsibility, c.notes, c.availability]
    );
  }
  res.json({ success: true });
});

// ─── Timeline ───────────────────────────────
app.get('/api/events/:id/timeline', authMW, async (req, res) => {
  const rows = await dbAll(`SELECT * FROM timeline WHERE event_id = ? ORDER BY sort_order`, [req.params.id]);
  res.json(rows);
});

app.put('/api/events/:id/timeline', authMW, async (req, res) => {
  const rows = req.body;
  await dbRun(`DELETE FROM timeline WHERE event_id = ?`, [req.params.id]);
  for (const t of rows) {
    await dbRun(
      `INSERT INTO timeline (event_id, time, title, detail, location, duration, crew, done, sort_order) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [req.params.id, t.time, t.title, t.detail, t.location, t.duration, t.crew, t.done ? 1 : 0, t.sortOrder || 0]
    );
  }
  res.json({ success: true });
});

// ─── Equipment Items ────────────────────────
app.get('/api/events/:id/equipment-items', authMW, async (req, res) => {
  const rows = await dbAll(`SELECT * FROM equipment_items WHERE event_id = ?`, [req.params.id]);
  res.json(rows);
});

app.put('/api/events/:id/equipment-items', authMW, async (req, res) => {
  const rows = req.body;
  await dbRun(`DELETE FROM equipment_items WHERE event_id = ?`, [req.params.id]);
  for (const it of rows) {
    const price = it.priceDay !== undefined ? it.priceDay : (it.price || 0);
    await dbRun(
      `INSERT INTO equipment_items (event_id, category, name, qty, unit, price, needed, packed, note, source, is_external) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [req.params.id, it.category, it.name, it.qty || 1, it.unit || 'Stk', price, it.needed !== false ? 1 : 0, it.packed ? 1 : 0, it.note || '', it.source || 'catalog', it.isExternal ? 1 : 0]
    );
  }
  res.json({ success: true });
});

// ─── Payments ───────────────────────────────
app.get('/api/events/:id/payments', authMW, async (req, res) => {
  const rows = await dbAll(`SELECT * FROM payments WHERE event_id = ?`, [req.params.id]);
  res.json(rows);
});

app.put('/api/events/:id/payments', authMW, async (req, res) => {
  const rows = req.body;
  await dbRun(`DELETE FROM payments WHERE event_id = ?`, [req.params.id]);
  for (const p of rows) {
    await dbRun(
      `INSERT INTO payments (event_id, type, amount, due_date, status) VALUES (?, ?, ?, ?, ?)`,
      [req.params.id, p.type, p.amount || 0, p.dueDate, p.status || 'offen']
    );
  }
  res.json({ success: true });
});

// ─── Event Todos ────────────────────────────
app.get('/api/events/:id/todos', authMW, async (req, res) => {
  const rows = await dbAll(`SELECT * FROM event_todos WHERE event_id = ? ORDER BY done, due_date`, [req.params.id]);
  res.json(rows);
});

app.put('/api/events/:id/todos', authMW, async (req, res) => {
  const rows = req.body;
  await dbRun(`DELETE FROM event_todos WHERE event_id = ?`, [req.params.id]);
  for (const t of rows) {
    await dbRun(
      `INSERT INTO event_todos (event_id, title, due_date, done) VALUES (?, ?, ?, ?)`,
      [req.params.id, t.title, t.dueDate, t.done ? 1 : 0]
    );
  }
  res.json({ success: true });
});

// ─── Settings ───────────────────────────────
app.get('/api/settings', authMW, async (req, res) => {
  const rows = await dbAll(`SELECT * FROM settings WHERE user_id = ?`, [req.user.id]);
  res.json(rows);
});

app.put('/api/settings', authMW, async (req, res) => {
  const rows = req.body;
  for (const s of rows) {
    await dbRun(
      `INSERT OR REPLACE INTO settings (user_id, key, value) VALUES (?, ?, ?)`,
      [req.user.id, s.key, s.value]
    );
  }
  res.json({ success: true });
});

// ─── Personnel ───────────────────────────────
app.get('/api/events/:id/personnel', authMW, async (req, res) => {
  const rows = await dbAll(`SELECT * FROM event_personnel WHERE event_id = ? ORDER BY sort_order`, [req.params.id]);
  res.json(rows);
});

app.put('/api/events/:id/personnel', authMW, async (req, res) => {
  const rows = req.body; // array of { role, qty, unit, price, needed, sortOrder }
  await dbRun(`DELETE FROM event_personnel WHERE event_id = ?`, [req.params.id]);
  for (const p of rows) {
    await dbRun(
      `INSERT INTO event_personnel (event_id, role, qty, unit, price, needed, sort_order) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [req.params.id, p.role, p.qty || 1, p.unit || 'Pauschale', p.price || 0, p.needed !== false ? 1 : 0, p.sortOrder || 0]
    );
  }
  res.json({ success: true });
});

// ─── Equipment Catalog ────────────────────────
app.get('/api/equipment-catalog', authMW, async (req, res) => {
  const rows = await dbAll(`SELECT * FROM equipment_catalog WHERE user_id = ?`, [req.user.id]);
  res.json(rows);
});

app.post('/api/equipment-catalog', authMW, async (req, res) => {
  const d = req.body;
  const result = await dbRun(
    `INSERT INTO equipment_catalog (user_id, category, name, tags, unit, price_day, stock, is_external) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [req.user.id, d.category, d.name, d.tags, d.unit, d.priceDay, d.stock, d.isExternal ? 1 : 0]
  );
  res.json({ id: result.lastID });
});

app.put('/api/equipment-catalog/:id', authMW, async (req, res) => {
  const d = req.body;
  await dbRun(`UPDATE equipment_catalog SET category=?, name=?, tags=?, unit=?, price_day=?, stock=?, is_external=? WHERE id = ? AND user_id = ?`,
    [d.category, d.name, d.tags, d.unit, d.priceDay, d.stock, d.isExternal ? 1 : 0, req.params.id, req.user.id]);
  res.json({ success: true });
});

app.delete('/api/equipment-catalog/:id', authMW, async (req, res) => {
  await dbRun(`DELETE FROM equipment_catalog WHERE id = ? AND user_id = ?`, [req.params.id, req.user.id]);
  res.json({ success: true });
});

// ─── Equipment Packages ──────────────────────
app.get('/api/equipment-packages', authMW, async (req, res) => {
  const rows = await dbAll(`SELECT * FROM equipment_packages WHERE user_id = ?`, [req.user.id]);
  rows.forEach(r => { try { r.items = JSON.parse(r.items || '[]'); } catch { r.items = []; } });
  res.json(rows);
});

app.post('/api/equipment-packages', authMW, async (req, res) => {
  const d = req.body;
  const result = await dbRun(
    `INSERT INTO equipment_packages (user_id, name, description, tags, items) VALUES (?, ?, ?, ?, ?)`,
    [req.user.id, d.name, d.description || '', d.tags, JSON.stringify(d.items || [])]
  );
  res.json({ id: result.lastID });
});

app.put('/api/equipment-packages/:id', authMW, async (req, res) => {
  const d = req.body;
  await dbRun(`UPDATE equipment_packages SET name=?, description=?, tags=?, items=? WHERE id = ? AND user_id = ?`,
    [d.name, d.description || '', d.tags, JSON.stringify(d.items || []), req.params.id, req.user.id]);
  res.json({ success: true });
});

app.delete('/api/equipment-packages/:id', authMW, async (req, res) => {
  await dbRun(`DELETE FROM equipment_packages WHERE id = ? AND user_id = ?`, [req.params.id, req.user.id]);
  res.json({ success: true });
});

// ─── Export CSV ──────────────────────────────
app.get('/api/export/events.csv', authMW, async (req, res) => {
  const rows = await dbAll(`SELECT * FROM events WHERE user_id = ?`, [req.user.id]);
  const headers = ['id', 'order_number', 'order_type', 'status', 'event_type', 'date', 'client_name', 'locations', 'total_price', 'deposit', 'remaining', 'notes', 'km', 'duration'];
  const lines = [headers.join(';')];
  rows.forEach(r => {
    lines.push(headers.map(h => (r[h] ?? '').toString().replace(/"/g, '""')).join(';'));
  });
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename=tls-events.csv');
  res.send(lines.join('\n'));
});

// ─── Full Backup (JSON) ──────────────────────
app.get('/api/export/full', authMW, async (req, res) => {
  const uid = req.user.id;
  const data = {};
  data.events = await dbAll(`SELECT * FROM events WHERE user_id = ?`, [uid]);
  data.locations = await dbAll(`SELECT l.* FROM locations l JOIN events e ON l.event_id = e.id WHERE e.user_id = ?`, [uid]);
  data.contacts = await dbAll(`SELECT c.* FROM contacts c JOIN events e ON c.event_id = e.id WHERE e.user_id = ?`, [uid]);
  data.timeline = await dbAll(`SELECT t.* FROM timeline t JOIN events e ON t.event_id = e.id WHERE e.user_id = ?`, [uid]);
  data.equipmentItems = await dbAll(`SELECT ei.* FROM equipment_items ei JOIN events e ON ei.event_id = e.id WHERE e.user_id = ?`, [uid]);
  data.equipmentCatalog = await dbAll(`SELECT * FROM equipment_catalog WHERE user_id = ?`, [uid]);
  data.equipmentPackages = await dbAll(`SELECT * FROM equipment_packages WHERE user_id = ?`, [uid]);
  data.payments = await dbAll(`SELECT p.* FROM payments p JOIN events e ON p.event_id = e.id WHERE e.user_id = ?`, [uid]);
  data.eventTodos = await dbAll(`SELECT et.* FROM event_todos et JOIN events e ON et.event_id = e.id WHERE e.user_id = ?`, [uid]);
  data.eventPersonnel = await dbAll(`SELECT ep.* FROM event_personnel ep JOIN events e ON ep.event_id = e.id WHERE e.user_id = ?`, [uid]);
  data.settings = await dbAll(`SELECT * FROM settings WHERE user_id = ?`, [uid]);
  res.json(data);
});

// ─── Import (JSON) ───────────────────────────
app.post('/api/import/full', authMW, async (req, res) => {
  try {
    const uid = req.user.id;
    const data = req.body;
    const eventIdMap = {}; // old eventId -> new SQLite event id

    if (data.events) {
      for (const ev of data.events) {
        // Normalize snake_case -> camelCase and back for robustness
        const orderNumber = ev.orderNumber != null ? ev.orderNumber : (ev.order_number != null ? ev.order_number : 'IMPORT-' + Date.now());
        const orderType   = ev.orderType   != null ? ev.orderType   : (ev.order_type   != null ? ev.order_type   : 'event');
        const status      = ev.status      != null ? ev.status      : (ev.status      != null ? ev.status      : 'inquiry');
        const eventType   = ev.eventType   != null ? ev.eventType   : ev.event_type;
        const date        = ev.date        != null ? ev.date        : (ev.date        != null ? ev.date        : new Date().toISOString().slice(0,10));
        const clientName  = ev.clientName  != null ? ev.clientName  : ev.client_name;
        const locations   = ev.locations   != null ? ev.locations   : (ev.locations   != null ? ev.locations   : '');
        const totalPrice  = ev.totalPrice  != null ? ev.totalPrice  : (ev.total_price  != null ? ev.total_price  : 0);
        const deposit     = ev.deposit     != null ? ev.deposit     : (ev.deposit     != null ? ev.deposit     : 0);
        const remaining   = ev.remaining   != null ? ev.remaining   : (ev.remaining   != null ? ev.remaining   : (totalPrice - deposit));
        const notes       = ev.notes       != null ? ev.notes       : (ev.notes       != null ? ev.notes       : '');
        const km          = ev.km          != null ? ev.km          : (ev.km          != null ? ev.km          : 0);
        const duration    = ev.duration    != null ? ev.duration    : (ev.duration    != null ? ev.duration    : 1);
        const result = await dbRun(
          `INSERT INTO events (user_id, order_number, order_type, status, event_type, date, client_name, locations, total_price, deposit, remaining, notes, km, duration)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [uid, orderNumber, orderType, status, eventType, date, clientName, locations, totalPrice, deposit, remaining, notes, km, duration]
        );
        eventIdMap[ev.id] = result.lastID;
      }
    }

    function mapEventId(oldId) {
      const mapped = eventIdMap[oldId];
      return mapped !== undefined ? mapped : oldId;
    }
    function evId(obj) { return obj.eventId !== undefined ? obj.eventId : obj.event_id; }

    if (data.locations) {
      for (const l of data.locations) {
        await dbRun(
          `INSERT INTO locations (event_id, name, address, km, setup_time, soundcheck, notes, contact_name, contact_phone, sort_order)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [mapEventId(evId(l)), l.name, l.address, l.km || 0, l.setupTime !== undefined ? l.setupTime : l.setup_time, l.soundcheck, l.notes, l.contactName !== undefined ? l.contactName : l.contact_name, l.contactPhone !== undefined ? l.contactPhone : l.contact_phone, l.sortOrder !== undefined ? l.sortOrder : (l.sort_order || 0)]
        );
      }
    }
    if (data.contacts) {
      for (const c of data.contacts) {
        await dbRun(
          `INSERT INTO contacts (event_id, role, name, phone, email, responsibility, notes, availability)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          [mapEventId(evId(c)), c.role, c.name, c.phone, c.email, c.responsibility, c.notes, c.availability]
        );
      }
    }
    if (data.timeline) {
      for (const t of data.timeline) {
        await dbRun(
          `INSERT INTO timeline (event_id, time, title, detail, location, duration, crew, done, sort_order)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [mapEventId(evId(t)), t.time, t.title, t.detail, t.location, t.duration, t.crew, t.done ? 1 : 0, t.sortOrder !== undefined ? t.sortOrder : (t.sort_order || 0)]
        );
      }
    }
    if (data.equipmentItems) {
      for (const it of data.equipmentItems) {
        const price = it.priceDay !== undefined ? it.priceDay : (it.price !== undefined ? it.price : 0);
        const isExt = it.isExternal !== undefined ? it.isExternal : it.is_external;
        await dbRun(
          `INSERT INTO equipment_items (event_id, category, name, qty, unit, price, needed, packed, note, source, is_external)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [mapEventId(evId(it)), it.category, it.name, it.qty || 1, it.unit || 'Stk', price, it.needed !== false ? 1 : 0, it.packed ? 1 : 0, it.note || '', it.source || 'catalog', isExt ? 1 : 0]
        );
      }
    }
    if (data.equipmentCatalog) {
      for (const c of data.equipmentCatalog) {
        const isExt = c.isExternal !== undefined ? c.isExternal : c.is_external;
        await dbRun(
          `INSERT INTO equipment_catalog (user_id, category, name, tags, unit, price_day, stock, is_external) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          [uid, c.category, c.name, c.tags, c.unit, c.priceDay !== undefined ? c.priceDay : c.price_day, c.stock, isExt ? 1 : 0]
        );
      }
    }
    if (data.equipmentPackages) {
      for (const p of data.equipmentPackages) {
        await dbRun(
          `INSERT INTO equipment_packages (user_id, name, description, tags, items) VALUES (?, ?, ?, ?, ?)`,
          [uid, p.name, p.description || '', p.tags, JSON.stringify(p.items || [])]
        );
      }
    }
    if (data.payments) {
      for (const p of data.payments) {
        await dbRun(
          `INSERT INTO payments (event_id, type, amount, due_date, status) VALUES (?, ?, ?, ?, ?)`,
          [mapEventId(evId(p)), p.type, p.amount || 0, p.dueDate !== undefined ? p.dueDate : p.due_date, p.status || 'offen']
        );
      }
    }
    if (data.eventTodos) {
      for (const t of data.eventTodos) {
        const eid = mapEventId(t.eventId !== undefined ? t.eventId : t.event_id);
        const dueDate = t.dueDate !== undefined ? t.dueDate : t.due_date;
        await dbRun(
          `INSERT INTO event_todos (event_id, title, due_date, done) VALUES (?, ?, ?, ?)`,
          [eid, t.title, dueDate, t.done ? 1 : 0]
        );
      }
    }
    if (data.eventPersonnel) {
      for (const p of data.eventPersonnel) {
        const eid = mapEventId(p.event_id !== undefined ? p.event_id : p.eventId);
        if (!eid) continue;
        await dbRun(
          `INSERT INTO event_personnel (event_id, role, qty, unit, price, needed, sort_order) VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [eid, p.role, p.qty || 1, p.unit || 'Pauschale', p.price || 0, p.needed !== false ? 1 : 0, p.sort_order !== undefined ? p.sort_order : (p.sortOrder || 0)]
        );
      }
    }
    if (data.settings) {
      for (const s of data.settings) {
        await dbRun(
          `INSERT OR REPLACE INTO settings (user_id, key, value) VALUES (?, ?, ?)`,
          [uid, s.key, s.value]
        );
      }
    }
    res.json({ success: true, importedEvents: Object.keys(eventIdMap).length });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── Catch-all → SPA ────────────────────────
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

app.listen(PORT, () => {
  console.log(`TLS EventPlanner server on http://localhost:${PORT}`);
});
