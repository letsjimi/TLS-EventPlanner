const sqlite3 = require('sqlite3').verbose();
const bcrypt = require('bcryptjs');
const db = new sqlite3.Database('./data/tms.db');
db.all('SELECT id, username, display_name, is_admin, SUBSTR(password_hash,1,30) as hash_head FROM users LIMIT 5', (err, rows) => {
  if (err) { console.error(err); process.exit(1); }
  console.log(JSON.stringify(rows));
  const admin = rows.find(r => r.username === 'admin');
  if (admin) {
    bcrypt.compare('admin', admin.password_hash || admin.hash_head, (err2, ok) => {
      console.log('admin/admin match:', ok, err2);
      process.exit(0);
    });
  } else { console.log('no admin'); process.exit(0); }
});
