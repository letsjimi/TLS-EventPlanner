const sqlite3 = require('sqlite3').verbose();
const bcrypt = require('bcryptjs');
const db = new sqlite3.Database('./data/tms.db');
const hash = bcrypt.hashSync('admin', 10);
db.run('UPDATE users SET password_hash = ? WHERE username = ?', [hash, 'admin'], function(err) {
  if (err) { console.error(err); process.exit(1); }
  console.log('updated rows:', this.changes);
  process.exit(0);
});
