const express = require('express');
const { pool } = require('../db');
const { requireAuth, requireRole } = require('../middleware/auth');

const router = express.Router();
const ALLOWED_ROLES = ['super_admin', 'ceo', 'hr', 'tv'];

// GET /api/hr-attendance — list with filters
router.get('/', requireAuth, requireRole(ALLOWED_ROLES), async (req, res, next) => {
  try {
    const { search = '', status = '', date_from = '', date_to = '', page = 1, limit = 50 } = req.query;
    const conditions = []; const params = []; let idx = 1;

    if (search) { conditions.push(`(employee_code ILIKE $${idx} OR company_id ILIKE $${idx})`); params.push(`%${search}%`); idx++; }
    if (status) { conditions.push(`attendance_status = $${idx++}`); params.push(status); }
    if (date_from) { conditions.push(`attendance_date >= $${idx++}::date`); params.push(date_from); }
    if (date_to) { conditions.push(`attendance_date <= $${idx++}::date`); params.push(date_to); }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    const offset = (Number(page) - 1) * Number(limit);

    const [countResult, dataResult] = await Promise.all([
      pool.query(`SELECT COUNT(*) FROM hr_attendance_live ${where}`, params),
      pool.query(`SELECT id, company_id, employee_code, attendance_date, clock_in, clock_out, attendance_status, last_synced_at FROM hr_attendance_live ${where} ORDER BY attendance_date DESC, clock_in DESC LIMIT $${idx} OFFSET $${idx + 1}`, [...params, Number(limit), offset]),
    ]);

    return res.json({
      records: dataResult.rows,
      total: parseInt(countResult.rows[0].count, 10),
      page: Number(page),
      totalPages: Math.ceil(parseInt(countResult.rows[0].count, 10) / Number(limit)),
    });
  } catch (err) { return next(err); }
});

module.exports = { hrAttendanceRouter: router };
