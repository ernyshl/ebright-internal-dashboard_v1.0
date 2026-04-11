const express = require('express');
const { pool } = require('../db');
const { requireAuth, requireRole } = require('../middleware/auth');

const router = express.Router();

const ALLOWED_ROLES = ['super_admin', 'ceo', 'od', 'academy', 'tv'];

// GET /api/fa-dashboard — fetch all 20 branch rows
router.get('/', requireAuth, requireRole(ALLOWED_ROLES), async (_req, res, next) => {
  try {
    const { rows } = await pool.query(
      `SELECT branch_code, fa_active, inv_apr1819, inv_apr2526, backlog, updated_at, updated_by
       FROM fa_dashboard_data
       ORDER BY branch_code ASC`
    );
    return res.json({ data: rows });
  } catch (err) {
    return next(err);
  }
});

// POST /api/fa-dashboard/save — upsert all 20 rows at once
router.post('/save', requireAuth, requireRole(ALLOWED_ROLES), async (req, res, next) => {
  const { rows } = req.body; // array of { branch_code, fa_active, inv_apr1819, inv_apr2526 }
  const updatedBy = req.user?.email || req.user?.sub || 'unknown';

  if (!Array.isArray(rows) || rows.length === 0) {
    return res.status(400).json({ error: 'rows array is required' });
  }

  try {
    // Upsert each row in a single transaction
    await pool.query('BEGIN');

    for (const row of rows) {
      const { branch_code, fa_active, inv_apr1819, inv_apr2526 } = row;

      // Validate
      if (
        typeof branch_code !== 'string' ||
        !Number.isInteger(fa_active) || fa_active < 0 ||
        !Number.isInteger(inv_apr1819) || inv_apr1819 < 0 ||
        !Number.isInteger(inv_apr2526) || inv_apr2526 < 0
      ) {
        await pool.query('ROLLBACK');
        return res.status(400).json({ error: `Invalid data for branch: ${branch_code}` });
      }

      await pool.query(
        `INSERT INTO fa_dashboard_data (branch_code, fa_active, inv_apr1819, inv_apr2526, updated_at, updated_by)
         VALUES ($1, $2, $3, $4, NOW(), $5)
         ON CONFLICT (branch_code) DO UPDATE SET
           fa_active   = EXCLUDED.fa_active,
           inv_apr1819 = EXCLUDED.inv_apr1819,
           inv_apr2526 = EXCLUDED.inv_apr2526,
           updated_at  = NOW(),
           updated_by  = EXCLUDED.updated_by`,
        [branch_code, fa_active, inv_apr1819, inv_apr2526, updatedBy]
      );
    }

    await pool.query('COMMIT');

    // Return the updated data
    const { rows: updated } = await pool.query(
      `SELECT branch_code, fa_active, inv_apr1819, inv_apr2526, backlog, updated_at, updated_by
       FROM fa_dashboard_data ORDER BY branch_code ASC`
    );

    return res.json({ ok: true, data: updated });
  } catch (err) {
    await pool.query('ROLLBACK').catch(() => {});
    return next(err);
  }
});

module.exports = { faDashboardRouter: router };
