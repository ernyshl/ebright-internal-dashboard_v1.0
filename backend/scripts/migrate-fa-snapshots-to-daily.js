// One-shot: drop weekly snapshot tables, recreate as daily snapshots.
// Run with: node scripts/migrate-fa-snapshots-to-daily.js
require('dotenv').config();
const { Pool } = require('pg');

const SQL = (tableName) => `
DROP TABLE IF EXISTS ${tableName};
CREATE TABLE ${tableName} (
  id            SERIAL PRIMARY KEY,
  branch        TEXT          NOT NULL,
  snapshot_date DATE          NOT NULL,
  active        INTEGER       NOT NULL DEFAULT 0,
  invited       INTEGER       NOT NULL DEFAULT 0,
  backlog       INTEGER       NOT NULL DEFAULT 0,
  captured_at   TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  CONSTRAINT ${tableName}_branch_date_unique UNIQUE (branch, snapshot_date)
);
CREATE INDEX ${tableName}_date_idx ON ${tableName} (snapshot_date DESC);
`;

(async () => {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  try {
    for (const t of ['fa_backlog_snapshots', 'fa_backlog_snapshots_testing']) {
      console.log(`Recreating ${t}...`);
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
