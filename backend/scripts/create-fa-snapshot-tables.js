// One-shot migration: create fa_backlog_snapshots (prod) and
// fa_backlog_snapshots_testing (local + staging) on the shared DB.
// Run with: node scripts/create-fa-snapshot-tables.js
require('dotenv').config();
const { Pool } = require('pg');

const SQL = (tableName) => `
CREATE TABLE IF NOT EXISTS ${tableName} (
  id           SERIAL PRIMARY KEY,
  branch       TEXT          NOT NULL,
  week_start   DATE          NOT NULL,
  active       INTEGER       NOT NULL DEFAULT 0,
  invited      INTEGER       NOT NULL DEFAULT 0,
  backlog      INTEGER       NOT NULL DEFAULT 0,
  captured_at  TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  CONSTRAINT ${tableName}_branch_week_unique UNIQUE (branch, week_start)
);
CREATE INDEX IF NOT EXISTS ${tableName}_week_start_idx ON ${tableName} (week_start DESC);
`;

(async () => {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  try {
    for (const t of ['fa_backlog_snapshots', 'fa_backlog_snapshots_testing']) {
      console.log(`Creating ${t}...`);
      await pool.query(SQL(t));
      const { rows } = await pool.query(
        `SELECT column_name, data_type FROM information_schema.columns WHERE table_name = $1 ORDER BY ordinal_position`,
        [t]
      );
      console.log(`  ${t}: ${rows.length} columns`);
      rows.forEach(r => console.log(`    - ${r.column_name} (${r.data_type})`));
    }
    console.log('Done.');
  } catch (err) {
    console.error('Failed:', err.message);
    process.exit(1);
  } finally {
    await pool.end();
  }
})();
