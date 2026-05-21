// One-off diagnostic — run with: node check-login.js
require('dotenv').config();
const { Pool } = require('pg');
const bcrypt = require('bcryptjs');

const EMAIL = 'main@ebright.my';
const PASSWORD = 'Main@2026D';

(async () => {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  try {
    const { rows } = await pool.query(
      `SELECT id, email, full_name, role, password_hash, is_active
       FROM public.users WHERE lower(email) = lower($1) LIMIT 1`,
      [EMAIL]
    );
    if (rows.length === 0) {
      console.log(`NO ROW for email "${EMAIL}" in public.users on this DB.`);
      const { rows: all } = await pool.query(
        `SELECT email, is_active FROM public.users ORDER BY email LIMIT 20`
      );
      console.log('First 20 emails in this DB:');
      all.forEach(r => console.log(' ', r.email, '| active:', r.is_active));
    } else {
      const u = rows[0];
      console.log('Found row:');
      console.log('  id        :', u.id);
      console.log('  email     :', u.email);
      console.log('  full_name :', u.full_name);
      console.log('  role      :', u.role);
      console.log('  is_active :', u.is_active);
      console.log('  hash      :', u.password_hash);
      const ok = await bcrypt.compare(PASSWORD, u.password_hash);
      console.log(`  bcrypt match for "${PASSWORD}": ${ok ? 'YES ✓' : 'NO ✗'}`);
    }
  } catch (e) {
    console.error('DB error:', e.message);
  } finally {
    await pool.end();
  }
})();
