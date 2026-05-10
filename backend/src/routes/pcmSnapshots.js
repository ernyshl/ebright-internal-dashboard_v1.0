const express = require('express');
const { pool } = require('../db');
const { getTableNames } = require('../utils/tableNames');
const { capturePcmSnapshot } = require('../services/pcmSnapshotService');

const router = express.Router();

function todayMYISO() {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kuala_Lumpur' });
}

function isValidIsoDate(s) {
  return typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s);
}

// POST /api/pcm-snapshots/capture — manual trigger / fallback. Daily cron does this automatically.
router.post('/capture', async (req, res, next) => {
  const date = isValidIsoDate(req.body?.date) ? req.body.date : null;
  try {
    const result = await capturePcmSnapshot(date);
    return res.json({ ok: true, ...result });
  } catch (err) {
    return next(err);
  }
});

// GET /api/pcm-snapshots?date=YYYY-MM-DD — read snapshot rows for a single date.
router.get('/', async (req, res, next) => {
  const { pcmSnapshots: snapTbl } = getTableNames();
  const date = isValidIsoDate(req.query.date) ? req.query.date : todayMYISO();

  try {
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

// GET /api/pcm-snapshots/range?dates=YYYY-MM-DD,YYYY-MM-DD,... — fetch multiple dates at once.
router.get('/range', async (req, res, next) => {
  const { pcmSnapshots: snapTbl } = getTableNames();
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

// GET /api/pcm-snapshots/earliest — earliest snapshot_date.
router.get('/earliest', async (_req, res, next) => {
  const { pcmSnapshots: snapTbl } = getTableNames();
  try {
    const r = await pool.query(`SELECT MIN(snapshot_date)::text AS first FROM ${snapTbl}`);
    return res.json({ earliest: r.rows[0]?.first || null });
  } catch (err) {
    return next(err);
  }
});

module.exports = { pcmSnapshotsRouter: router };
