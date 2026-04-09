const express = require('express');
const { pool } = require('../db');
const { requireAuth, requireRole } = require('../middleware/auth');

const router = express.Router();

// GET /api/audit-log — list logs with filters
router.get('/', requireAuth, requireRole(['super_admin']), async (req, res, next) => {
  try {
    const { type = '', search = '', date_from = '', date_to = '', page = 1, limit = 50 } = req.query;
    const conditions = [];
    const params = [];
    let idx = 1;

    if (type) { conditions.push(`log_type = $${idx++}`); params.push(type); }
    if (search) {
      conditions.push(`(message ILIKE $${idx} OR user_email ILIKE $${idx} OR details ILIKE $${idx})`);
      params.push(`%${search}%`);
      idx++;
    }
    if (date_from) { conditions.push(`(created_at AT TIME ZONE 'Asia/Kuala_Lumpur')::date >= $${idx++}::date`); params.push(date_from); }
    if (date_to) { conditions.push(`(created_at AT TIME ZONE 'Asia/Kuala_Lumpur')::date <= $${idx++}::date`); params.push(date_to); }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    const offset = (Number(page) - 1) * Number(limit);

    const [countResult, dataResult] = await Promise.all([
      pool.query(`SELECT COUNT(*) FROM audit_log ${where}`, params),
      pool.query(
        `SELECT id, log_type, message, user_email, details, endpoint, method,
                (created_at AT TIME ZONE 'Asia/Kuala_Lumpur') AS created_at_local
         FROM audit_log ${where}
         ORDER BY created_at DESC
         LIMIT $${idx} OFFSET $${idx + 1}`,
        [...params, Number(limit), offset]
      ),
    ]);

    // Also get distinct log types for filter dropdown
    const { rows: types } = await pool.query('SELECT DISTINCT log_type FROM audit_log ORDER BY log_type');

    return res.json({
      records: dataResult.rows,
      total: parseInt(countResult.rows[0].count, 10),
      page: Number(page),
      totalPages: Math.ceil(parseInt(countResult.rows[0].count, 10) / Number(limit)),
      types: types.map(t => t.log_type),
    });
  } catch (err) { return next(err); }
});

module.exports = { auditLogRouter: router };

// Helper to write a log entry — used by other routes and middleware
async function writeLog({ log_type, message, user_email, details, endpoint, method }) {
  try {
    await pool.query(
      `INSERT INTO audit_log (log_type, message, user_email, details, endpoint, method) VALUES ($1,$2,$3,$4,$5,$6)`,
      [log_type || 'info', message || '', user_email || '', details || '', endpoint || '', method || '']
    );
  } catch { /* don't fail the request if logging fails */ }
}

module.exports = { auditLogRouter: router, writeLog };
