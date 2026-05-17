// Diagnostic only — checks user exists + is_active. Never exposes password hash.
require('dotenv').config();
const { Pool } = require('pg');

const EMAIL = process.argv[2] || 'nuraisyah.azzahra2003@gmail.com';

(async () => {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  try {
    const r = await pool.query(
      `SELECT id, email, full_name, role, is_active,
              LENGTH(password_hash) AS hash_length,
              (created_at AT TIME ZONE 'Asia/Kuala_Lumpur')::text AS created_my
         FROM public.users
        WHERE LOWER(email) = LOWER($1)`,
      [EMAIL]
    );
    if (r.rows.length === 0) {
      console.log(`❌ NO USER FOUND with email "${EMAIL}"`);
    } else {
      console.log('User row(s) found:');
      console.table(r.rows);
    }

    // Also list all super_admins so we know who can log in
    const admins = await pool.query(
      `SELECT id, email, full_name, role, is_active
         FROM public.users
        WHERE role = 'super_admin'
        ORDER BY id`
    );
    console.log(`\nAll super_admin accounts (${admins.rows.length}):`);
    console.table(admins.rows);
  } catch (err) {
    console.error('Failed:', err.message);
    process.exit(1);
  } finally {
    await pool.end();
  }
})();
