const express = require('express');
const { pool } = require('../db');
const { getTableNames } = require('../utils/tableNames');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();
router.use(requireAuth);

function normName(s) {
  return String(s || '').trim().toUpperCase();
}

function toIsoDate(val) {
  if (!val) return null;
  const s = String(val).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  return null;
}

// POST /api/student-packages/preview
// Body: { rows: [{ name, packageStatus, creditExpiryDate }] }
// Returns: { matched: [...], unmatched: [...] } where matched rows include studentId
router.post('/preview', async (req, res, next) => {
  try {
    const rows = Array.isArray(req.body?.rows) ? req.body.rows : [];
    if (rows.length === 0) return res.status(400).json({ error: 'rows array required' });

    const { students } = getTableNames();
    const dbStudents = await pool.query(`SELECT id, name, branch FROM ${students}`);
    const lookup = new Map();
    for (const r of dbStudents.rows) lookup.set(normName(r.name), r);

    const matched = [];
    const unmatched = [];
    for (const row of rows) {
      const name = normName(row.name);
      if (!name) continue;
      const hit = lookup.get(name);
      const cleaned = {
        name: row.name,
        packageStatus: String(row.packageStatus || '').trim(),
        creditExpiryDate: toIsoDate(row.creditExpiryDate),
      };
      if (hit) {
        matched.push({ ...cleaned, studentId: hit.id, branch: hit.branch });
      } else {
        unmatched.push(cleaned);
      }
    }
    return res.json({ matched, unmatched, totalUploaded: rows.length });
  } catch (err) { return next(err); }
});

// POST /api/student-packages/confirm
// Body: { rows: [{ studentId, packageStatus, creditExpiryDate }] }
router.post('/confirm', async (req, res, next) => {
  try {
    const rows = Array.isArray(req.body?.rows) ? req.body.rows : [];
    if (rows.length === 0) return res.status(400).json({ error: 'rows array required' });

    const { students } = getTableNames();
    let updated = 0;
    for (const r of rows) {
      const id = parseInt(r.studentId, 10);
      if (!Number.isInteger(id) || id <= 0) continue;
      const status = String(r.packageStatus || '').trim() || null;
      const expiry = toIsoDate(r.creditExpiryDate);
      const result = await pool.query(
        `UPDATE ${students}
            SET package_status = $1,
                credit_expiry_date = $2::date
          WHERE id = $3`,
        [status, expiry, id]
      );
      updated += result.rowCount;
    }
    return res.json({ ok: true, updated });
  } catch (err) { return next(err); }
});

// PUT /api/student-packages/student/:id  (manual single-student upsert)
router.put('/student/:id', async (req, res, next) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ error: 'Invalid student id' });
    const status = String(req.body?.packageStatus || '').trim() || null;
    const expiry = toIsoDate(req.body?.creditExpiryDate);

    const { students } = getTableNames();
    const result = await pool.query(
      `UPDATE ${students}
          SET package_status = $1,
              credit_expiry_date = $2::date
        WHERE id = $3
      RETURNING id, name, package_status, credit_expiry_date`,
      [status, expiry, id]
    );
    if (result.rowCount === 0) return res.status(404).json({ error: 'Student not found' });
    return res.json({ ok: true, data: result.rows[0] });
  } catch (err) { return next(err); }
});

module.exports = { studentPackagesRouter: router };
