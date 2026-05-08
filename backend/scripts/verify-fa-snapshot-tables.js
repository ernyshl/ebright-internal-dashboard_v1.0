// Verifies the snapshot tables exist and are queryable.
require('dotenv').config();
const { Pool } = require('pg');

(async () => {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  try {
    const conn = await pool.query(
      `SELECT current_database() AS db, current_user AS usr, current_schema() AS schema`
    );
    console.log('Connected to:', conn.rows[0]);

    for (const t of ['fa_backlog_snapshots', 'fa_backlog_snapshots_testing']) {
      const exists = await pool.query(
        `SELECT EXISTS (
           SELECT 1 FROM information_schema.tables
           WHERE table_schema = 'public' AND table_name = $1
         ) AS exists`,
        [t]
      );
      const count = exists.rows[0].exists
        ? (await pool.query(`SELECT COUNT(*)::int AS n FROM ${t}`)).rows[0].n
        : 'N/A';
      console.log(`  ${t}: exists=${exists.rows[0].exists}, rows=${count}`);
    }
  } catch (err) {
    console.error('Failed:', err.message);
    process.exit(1);
  } finally {
    await pool.end();
  }
})();
