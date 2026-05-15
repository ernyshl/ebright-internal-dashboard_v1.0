// One-shot: add workbook_progress_json (jsonb) + total_workbook (text) to 4 tables.
// Idempotent — safe to re-run.
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
      await pool.query(`ALTER TABLE ${t} ADD COLUMN IF NOT EXISTS workbook_progress_json JSONB DEFAULT '[]'::jsonb`);
      await pool.query(`ALTER TABLE ${t} ADD COLUMN IF NOT EXISTS total_workbook TEXT DEFAULT '0/0'`);
      const r = await pool.query(
        `SELECT column_name, data_type FROM information_schema.columns
          WHERE table_name = $1 AND column_name IN ('workbook_progress_json','total_workbook')
          ORDER BY column_name`,
        [t]
      );
      console.log(`  ${t.padEnd(28)} -> ${r.rows.map(x => `${x.column_name}(${x.data_type})`).join(', ')}`);
    }
    console.log('Done.');
  } catch (err) {
    console.error('Failed:', err.message);
    process.exit(1);
  } finally {
    await pool.end();
  }
})();
