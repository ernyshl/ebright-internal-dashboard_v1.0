const { pool } = require('../db');
const { getTableNames } = require('../utils/tableNames');

const BRANCH_LIST = ['ONL','ST','CJY','SA','PJY','AMP','BBB','DK','KLG','KD','SHA','DA','SP','BSP','EGR','BTHO','RBY','TSG','KW','KTG'];

function todayMYISO() {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kuala_Lumpur' });
}

async function computeCurrentBacklog(client) {
  const { students: tbl } = getTableNames();
  const r = await client.query(
    `SELECT branch, pcm_progress_json FROM ${tbl} WHERE status = 'Active'`
  );
  const map = {};
  for (const code of BRANCH_LIST) {
    map[code] = { branch: code, active: 0, invited: 0, backlog: 0 };
  }
  for (const row of r.rows) {
    const code = row.branch;
    if (!map[code]) map[code] = { branch: code, active: 0, invited: 0, backlog: 0 };
    const pcm = Array.isArray(row.pcm_progress_json) ? row.pcm_progress_json : [];
    map[code].active  += pcm.length;
    map[code].invited += pcm.filter(Boolean).length;
  }
  for (const b of Object.values(map)) {
    b.backlog = Math.max(0, b.active - b.invited);
  }
  return Object.values(map);
}

async function capturePcmSnapshot(date = null) {
  const { pcmSnapshots: snapTbl } = getTableNames();
  const captureDate = date || todayMYISO();
  const client = await pool.connect();
  try {
    const rows = await computeCurrentBacklog(client);
    await client.query('BEGIN');
    for (const r of rows) {
      await client.query(
        `INSERT INTO ${snapTbl} (branch, snapshot_date, active, invited, backlog, captured_at)
         VALUES ($1, $2, $3, $4, $5, NOW())
         ON CONFLICT (branch, snapshot_date) DO UPDATE SET
           active      = EXCLUDED.active,
           invited     = EXCLUDED.invited,
           backlog     = EXCLUDED.backlog,
           captured_at = NOW()`,
        [r.branch, captureDate, r.active, r.invited, r.backlog]
      );
    }
    await client.query('COMMIT');
    return { date: captureDate, branches: rows.length, table: snapTbl };
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

module.exports = { capturePcmSnapshot, computeCurrentBacklog };
