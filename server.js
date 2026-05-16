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
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await dbRun(`
    CREATE TABLE IF NOT EXISTS locations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      event_id INTEGER NOT NULL,
      name TEXT,
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
      email TEXT
    )
  `);

  await dbRun(`
    CREATE TABLE IF NOT EXISTS timeline (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      event_id INTEGER NOT NULL,
      time TEXT,
      title TEXT,
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
      needed INTEGER DEFAULT 1
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
      is_external INTEGER DEFAULT 0
    )
  `);

  await dbRun(`
    CREATE TABLE IF NOT EXISTS equipment_packages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      name TEXT,
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
    `INSERT INTO events (user_id, order_number, order_type, status, event_type, date, client_name, locations, total_price, deposit, remaining, notes, km)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [req.user.id, d.orderNumber, d.orderType || 'event', d.status || 'inquiry', d.eventType, d.date, d.clientName, d.locations, d.totalPrice || 0, d.deposit || 0, (d.totalPrice || 0) - (d.deposit || 0), d.notes, d.km || 0]
  );
  res.json({ id: result.lastID });
});

app.put('/api/events/:id', authMW, async (req, res) => {
  const d = req.body;
  const event = await dbGet(`SELECT * FROM events WHERE id = ? AND user_id = ?`, [req.params.id, req.user.id]);
  if (!event) return res.status(404).json({ error: 'Not found' });
  await dbRun(
    `UPDATE events SET order_number=?, order_type=?, status=?, event_type=?, date=?, client_name=?, locations=?, total_price=?, deposit=?, remaining=?, notes=?, km=?, updated_at=CURRENT_TIMESTAMP
     WHERE id = ?`,
    [d.orderNumber, d.orderType, d.status, d.eventType, d.date, d.clientName, d.locations, d.totalPrice, d.deposit, d.remaining, d.notes, d.km, req.params.id]
  );
  res.json({ success: true });
});

app.delete('/api/events/:id', authMW, async (req, res) => {
  await dbRun(`DELETE FROM events WHERE id = ? AND user_id = ?`, [req.params.id, req.user.id]);
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
    `INSERT INTO equipment_catalog (user_id, category, name, tags, unit, price_day, is_external) VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [req.user.id, d.category, d.name, d.tags, d.unit, d.priceDay, d.isExternal ? 1 : 0]
  );
  res.json({ id: result.lastID });
});

app.put('/api/equipment-catalog/:id', authMW, async (req, res) => {
  const d = req.body;
  await dbRun(`UPDATE equipment_catalog SET category=?, name=?, tags=?, unit=?, price_day=?, is_external=? WHERE id = ? AND user_id = ?`,
    [d.category, d.name, d.tags, d.unit, d.priceDay, d.isExternal ? 1 : 0, req.params.id, req.user.id]);
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
    `INSERT INTO equipment_packages (user_id, name, tags, items) VALUES (?, ?, ?, ?)`,
    [req.user.id, d.name, d.tags, JSON.stringify(d.items || [])]
  );
  res.json({ id: result.lastID });
});

app.put('/api/equipment-packages/:id', authMW, async (req, res) => {
  const d = req.body;
  await dbRun(`UPDATE equipment_packages SET name=?, tags=?, items=? WHERE id = ? AND user_id = ?`,
    [d.name, d.tags, JSON.stringify(d.items || []), req.params.id, req.user.id]);
  res.json({ success: true });
});

app.delete('/api/equipment-packages/:id', authMW, async (req, res) => {
  await dbRun(`DELETE FROM equipment_packages WHERE id = ? AND user_id = ?`, [req.params.id, req.user.id]);
  res.json({ success: true });
});

// ─── Export CSV ──────────────────────────────
app.get('/api/export/events.csv', authMW, async (req, res) => {
  const rows = await dbAll(`SELECT * FROM events WHERE user_id = ?`, [req.user.id]);
  const headers = ['id', 'order_number', 'order_type', 'status', 'event_type', 'date', 'client_name', 'locations', 'total_price', 'deposit', 'remaining', 'notes', 'km'];
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
  data.equipmentCatalog = await dbAll(`SELECT * FROM equipment_catalog WHERE user_id = ?`, [uid]);
  data.equipmentPackages = await dbAll(`SELECT * FROM equipment_packages WHERE user_id = ?`, [uid]);
  data.eventPersonnel = await dbAll(`SELECT ep.* FROM event_personnel ep JOIN events e ON ep.event_id = e.id WHERE e.user_id = ?`, [uid]);
  res.json(data);
});

// ─── Import (JSON) ───────────────────────────
app.post('/api/import/full', authMW, async (req, res) => {
  try {
    const uid = req.user.id;
    const data = req.body;
    if (data.events) {
      for (const ev of data.events) {
        ev.userId = uid;
        await dbRun(
          `INSERT INTO events (user_id, order_number, order_type, status, event_type, date, client_name, locations, total_price, deposit, remaining, notes, km)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [uid, ev.orderNumber, ev.orderType || 'event', ev.status || 'inquiry', ev.eventType, ev.date, ev.clientName, ev.locations, ev.totalPrice || 0, ev.deposit || 0, (ev.totalPrice || 0) - (ev.deposit || 0), ev.notes, ev.km || 0]
        );
      }
    }
    if (data.equipmentCatalog) {
      for (const c of data.equipmentCatalog) {
        await dbRun(
          `INSERT INTO equipment_catalog (user_id, category, name, tags, unit, price_day, is_external) VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [uid, c.category, c.name, c.tags, c.unit, c.priceDay, c.isExternal ? 1 : 0]
        );
      }
    }
    if (data.equipmentPackages) {
      for (const p of data.equipmentPackages) {
        await dbRun(
          `INSERT INTO equipment_packages (user_id, name, tags, items) VALUES (?, ?, ?, ?)`,
          [uid, p.name, p.tags, JSON.stringify(p.items || [])]
        );
      }
    }
    if (data.eventPersonnel) {
      for (const p of data.eventPersonnel) {
        const ev = await dbGet(`SELECT id FROM events WHERE order_number = ? AND user_id = ?`, [p.eventId.toString(), uid]);
        if (ev) {
          await dbRun(
            `INSERT INTO event_personnel (event_id, role, qty, unit, price, needed, sort_order) VALUES (?, ?, ?, ?, ?, ?, ?)`,
            [ev.id, p.role, p.qty, p.unit, p.price, p.needed !== false ? 1 : 0, p.sortOrder || 0]
          );
        }
      }
    }
    res.json({ success: true });
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
