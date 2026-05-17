/**
 * Deduplicate events in SQLite by order_number + date + client_name
 * Keeps the most recent (highest id) and deletes older dupes + cascades to related tables
 */
const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const DB_PATH = process.env.TLS_DB_PATH || path.join(__dirname, '..', 'data', 'tms.db');
const db = new sqlite3.Database(DB_PATH);

function run(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function(err) { err ? reject(err) : resolve({ lastID: this.lastID, changes: this.changes }); });
  });
}
function all(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => err ? reject(err) : resolve(rows));
  });
}

async function dedupe() {
  const events = await all(`SELECT id, order_number, date, client_name, created_at FROM events ORDER BY id DESC`);
  const seen = new Map();
  const dupes = [];
  for (const ev of events) {
    const key = (ev.order_number || '') + '|' + (ev.date || '') + '|' + (ev.client_name || '');
    if (seen.has(key)) {
      dupes.push(ev.id);
    } else {
      seen.set(key, ev.id);
    }
  }
  console.log(`Found ${dupes.length} duplicate events out of ${events.length} total.`);
  if (dupes.length === 0) {
    console.log('Nothing to clean.');
    db.close();
    return;
  }
  console.log(`Deleting duplicate event ids: ${dupes.join(', ')}`);
  for (const id of dupes) {
    await run(`DELETE FROM locations WHERE event_id = ?`, [id]);
    await run(`DELETE FROM contacts WHERE event_id = ?`, [id]);
    await run(`DELETE FROM timeline WHERE event_id = ?`, [id]);
    await run(`DELETE FROM equipment_items WHERE event_id = ?`, [id]);
    await run(`DELETE FROM payments WHERE event_id = ?`, [id]);
    await run(`DELETE FROM event_todos WHERE event_id = ?`, [id]);
    await run(`DELETE FROM event_personnel WHERE event_id = ?`, [id]);
    await run(`DELETE FROM events WHERE id = ?`, [id]);
  }
  console.log('Done. Running VACUUM...');
  await run(`VACUUM`);
  console.log('VACUUM complete. Database cleaned.');
  db.close();
}

dedupe().catch(err => { console.error(err); db.close(); process.exit(1); });
