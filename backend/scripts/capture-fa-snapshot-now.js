// One-shot: capture FA backlog for today into the env-pinned snapshot table.
// Reuses computeCurrentBacklog logic via direct DB queries (no HTTP).
require('dotenv').config();
const { Pool } = require('pg');

const BRANCH_LIST = ['ONL','ST','CJY','SA','PJY','AMP','BBB','DK','KLG','KD','SHA','DA','SP','BSP','EGR','BTHO','RBY','TSG','KW','KTG'];

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

(async () => {
  const studentsTbl    = process.env.STUDENT_TABLE     || 'studentrecords';
  const faSnapshotsTbl = process.env.FA_SNAPSHOT_TABLE || 'fa_backlog_snapshots';
  const date           = process.argv[2] && /^\d{4}-\d{2}-\d{2}$/.test(process.argv[2])
                            ? process.argv[2]
                            : todayISO();

  console.log(`Source: ${studentsTbl}`);
  console.log(`Target: ${faSnapshotsTbl}`);
  console.log(`Date:   ${date}`);

  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const client = await pool.connect();
  try {
    const r = await client.query(
      `SELECT branch, fa_progress_json FROM ${studentsTbl} WHERE status = 'Active'`
    );
    console.log(`Read ${r.rows.length} active students`);

    const map = {};
    for (const code of BRANCH_LIST) map[code] = { branch: code, active: 0, invited: 0, backlog: 0 };
    for (const row of r.rows) {
      const code = row.branch;
      if (!map[code]) map[code] = { branch: code, active: 0, invited: 0, backlog: 0 };
      const fa = Array.isArray(row.fa_progress_json) ? row.fa_progress_json : [];
      map[code].active  += fa.length;
      map[code].invited += fa.filter(Boolean).length;
    }
    for (const b of Object.values(map)) b.backlog = Math.max(0, b.active - b.invited);

    await client.query('BEGIN');
    for (const b of Object.values(map)) {
      await client.query(
        `INSERT INTO ${faSnapshotsTbl} (branch, snapshot_date, active, invited, backlog, captured_at)
         VALUES ($1, $2, $3, $4, $5, NOW())
         ON CONFLICT (branch, snapshot_date) DO UPDATE SET
           active=EXCLUDED.active, invited=EXCLUDED.invited, backlog=EXCLUDED.backlog, captured_at=NOW()`,
        [b.branch, date, b.active, b.invited, b.backlog]
      );
    }
    await client.query('COMMIT');
    console.log(`Upserted ${Object.keys(map).length} branch rows`);

    const verify = await client.query(
      `SELECT branch, active, invited, backlog FROM ${faSnapshotsTbl} WHERE snapshot_date = $1 ORDER BY branch ASC`,
      [date]
    );
    console.log('\nResult:');
    console.table(verify.rows);
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('Failed:', err.message);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
})();
