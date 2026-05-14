const express = require('express');
const { pool } = require('../db');
const { getTableNames } = require('../utils/tableNames');
const { captureFaSnapshot } = require('../services/faSnapshotService');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();
router.use(requireAuth);

function todayMYISO() {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kuala_Lumpur' });
}

function isValidIsoDate(s) {
  return typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s);
}

// POST /api/fa-snapshots/capture — manual trigger / fallback. Daily cron does this automatically.
// Idempotent via UNIQUE(branch, snapshot_date).
router.post('/capture', async (req, res, next) => {
  const date = isValidIsoDate(req.body?.date) ? req.body.date : null;
  try {
    const result = await captureFaSnapshot(date);
    return res.json({ ok: true, ...result });
  } catch (err) {
    return next(err);
  }
});

// GET /api/fa-snapshots?date=YYYY-MM-DD — read snapshot rows for a single date.
router.get('/', async (req, res, next) => {
  const { faSnapshots: snapTbl } = getTableNames();
  const date = isValidIsoDate(req.query.date) ? req.query.date : todayMYISO();

  try {
    // Cast snapshot_date::text to keep it date-only and avoid pg's TZ-shifted Date object.
    const r = await pool.query(
      `SELECT branch, snapshot_date::text AS snapshot_date, active, invited, backlog, captured_at
         FROM ${snapTbl}
        WHERE snapshot_date = $1
        ORDER BY branch ASC`,
      [date]
    );
    return res.json({ date, data: r.rows, table: snapTbl });
  } catch (err) {
    return next(err);
  }
});

// GET /api/fa-snapshots/range?dates=YYYY-MM-DD,YYYY-MM-DD,... — fetch multiple dates at once.
router.get('/range', async (req, res, next) => {
  const { faSnapshots: snapTbl } = getTableNames();
  const raw = String(req.query.dates || '');
  const dates = raw.split(',').map(s => s.trim()).filter(isValidIsoDate);
  if (dates.length === 0) return res.json({ data: {} });

  try {
    const r = await pool.query(
      `SELECT branch, snapshot_date::text AS snapshot_date, active, invited, backlog
         FROM ${snapTbl}
        WHERE snapshot_date = ANY($1::date[])
        ORDER BY snapshot_date ASC, branch ASC`,
      [dates]
    );
    const out = {};
    for (const row of r.rows) {
      if (!out[row.snapshot_date]) out[row.snapshot_date] = [];
      out[row.snapshot_date].push({
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

// GET /api/fa-snapshots/earliest — earliest snapshot_date (for "feature start" message).
router.get('/earliest', async (_req, res, next) => {
  const { faSnapshots: snapTbl } = getTableNames();
  try {
    // ::text avoids pg DATE→Date object→toISOString() timezone shift bug.
    const r = await pool.query(`SELECT MIN(snapshot_date)::text AS first FROM ${snapTbl}`);
    return res.json({ earliest: r.rows[0]?.first || null });
  } catch (err) {
    return next(err);
  }
});

module.exports = { faSnapshotsRouter: router };
