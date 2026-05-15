// One-shot: create student_change_log table for student edit history.
require('dotenv').config();
const { Pool } = require('pg');

const SQL = `
CREATE TABLE IF NOT EXISTS student_change_log (
  id             SERIAL PRIMARY KEY,
  student_id     INTEGER,                   -- null when student was deleted
  student_name   TEXT        NOT NULL,
  branch         TEXT        NOT NULL,
  action         TEXT        NOT NULL,      -- create / edit / delete / archive / restore / tick / untick / bulk_upload
  field          TEXT,                       -- e.g. name, dob, faAttended[0], guardianName
  old_value      TEXT,
  new_value      TEXT,
  user_email     TEXT,
  note           TEXT,                       -- optional admin annotation
  changed_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS student_change_log_branch_idx     ON student_change_log (branch);
CREATE INDEX IF NOT EXISTS student_change_log_student_id_idx ON student_change_log (student_id);
CREATE INDEX IF NOT EXISTS student_change_log_changed_at_idx ON student_change_log (changed_at DESC);
CREATE INDEX IF NOT EXISTS student_change_log_action_idx     ON student_change_log (action);
`;

(async () => {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  try {
    await pool.query(SQL);
    const { rows } = await pool.query(
      `SELECT column_name, data_type FROM information_schema.columns
        WHERE table_name = 'student_change_log' ORDER BY ordinal_position`
    );
    console.log(`student_change_log: ${rows.length} columns`);
    rows.forEach(r => console.log(`  - ${r.column_name} (${r.data_type})`));
    console.log('Done.');
  } catch (err) {
    console.error('Failed:', err.message);
    process.exit(1);
  } finally {
    await pool.end();
  }
})();
