const express = require('express');
const { pool } = require('../db');
const { getTableNames } = require('../utils/tableNames');

const router = express.Router();

const BRANCH_LIST = ['ONL','ST','CJY','SA','PJY','AMP','BBB','DK','KLG','KD','SHA','DA','SP','BSP','EGR','BTHO','RBY','TSG','KW','KTG'];

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

function isValidIsoDate(s) {
  return typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s);
}

async function computeCurrentBacklog(client) {
  const { students: tbl } = getTableNames();
  const r = await client.query(
    `SELECT branch, pcm_progress_json
       FROM ${tbl}
      WHERE status = 'Active'`
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

// POST /api/pcm-snapshots/capture — compute current PCM backlog and upsert today's snapshot row.
// Idempotent: same date = upsert. Defaults date to today.
router.post('/capture', async (req, res, next) => {
  const { pcmSnapshots: snapTbl } = getTableNames();
  const date = isValidIsoDate(req.body?.date) ? req.body.date : todayISO();

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
        [r.branch, date, r.active, r.invited, r.backlog]
      );
    }
    await client.query('COMMIT');

    return res.json({ ok: true, date, branches: rows.length, table: snapTbl });
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    return next(err);
  } finally {
    client.release();
  }
});

// GET /api/pcm-snapshots?date=YYYY-MM-DD — read snapshot rows for a single date.
router.get('/', async (req, res, next) => {
  const { pcmSnapshots: snapTbl } = getTableNames();
  const date = isValidIsoDate(req.query.date) ? req.query.date : todayISO();

  try {
    const r = await pool.query(
      `SELECT branch, snapshot_date, active, invited, backlog, captured_at
         FROM ${snapTbl}
        WHERE snapshot_date = $1
        ORDER BY branch ASC`,
      [date]
    );
    return res.json({
      date,
      data: r.rows,
      table: snapTbl,
    });
  } catch (err) {
    return next(err);
  }
});

// GET /api/pcm-snapshots/range?dates=YYYY-MM-DD,YYYY-MM-DD,... — fetch multiple dates at once.
router.get('/range', async (req, res, next) => {
  const { pcmSnapshots: snapTbl } = getTableNames();
  const raw = String(req.query.dates || '');
  const dates = raw.split(',').map(s => s.trim()).filter(isValidIsoDate);
  if (dates.length === 0) return res.json({ data: {} });

  try {
    const r = await pool.query(
      `SELECT branch, snapshot_date, active, invited, backlog
         FROM ${snapTbl}
        WHERE snapshot_date = ANY($1::date[])
        ORDER BY snapshot_date ASC, branch ASC`,
      [dates]
    );
    const out = {};
    for (const row of r.rows) {
      const iso = row.snapshot_date.toISOString().slice(0, 10);
      if (!out[iso]) out[iso] = [];
      out[iso].push({
        branch: row.branch,
        active: row.active,
        invited: row.invited,
        backlog: row.backlog,
      });
    }
    return res.json({ data: out, table: snapTbl });
  } catch (err) {
    return next(err);
  }
});

// GET /api/pcm-snapshots/earliest — earliest snapshot_date (for "feature start" message).
router.get('/earliest', async (_req, res, next) => {
  const { pcmSnapshots: snapTbl } = getTableNames();
  try {
    const r = await pool.query(`SELECT MIN(snapshot_date) AS first FROM ${snapTbl}`);
    const first = r.rows[0]?.first;
    return res.json({ earliest: first ? first.toISOString().slice(0, 10) : null });
  } catch (err) {
    return next(err);
  }
});

module.exports = { pcmSnapshotsRouter: router };
