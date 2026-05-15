// One-shot: add `dob DATE` column to studentrecords + archived_students (prod + testing).
// Idempotent (uses IF NOT EXISTS so re-running is harmless).
require('dotenv').config();
const { Pool } = require('pg');

const TABLES = [
  'studentrecords',
  'studentrecords_testing',
  'archived_students',
  'archived_students_testing',
];

(async () => {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  try {
    for (const t of TABLES) {
      await pool.query(`ALTER TABLE ${t} ADD COLUMN IF NOT EXISTS dob DATE`);
      const r = await pool.query(
        `SELECT column_name, data_type FROM information_schema.columns WHERE table_name = $1 AND column_name = 'dob'`,
        [t]
      );
      console.log(`  ${t}: dob column ${r.rows.length > 0 ? `✓ (${r.rows[0].data_type})` : '✗ MISSING'}`);
    }
    console.log('Done.');
  } catch (err) {
    console.error('Failed:', err.message);
    process.exit(1);
  } finally {
    await pool.end();
  }
})();
