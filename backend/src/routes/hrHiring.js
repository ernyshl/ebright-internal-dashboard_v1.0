const express = require('express');
const { pool } = require('../db');
const { requireAuth, requireRole } = require('../middleware/auth');

const router = express.Router();
const ALLOWED_ROLES = ['super_admin', 'ceo', 'hr', 'tv'];

// GET /api/hr-hiring — list with filters
router.get('/', requireAuth, requireRole(ALLOWED_ROLES), async (req, res, next) => {
  try {
    const { search = '', employment_type = '', page = 1, limit = 50 } = req.query;
    const conditions = []; const params = []; let idx = 1;

    if (search) { conditions.push(`(first_name ILIKE $${idx} OR last_name ILIKE $${idx} OR tags ILIKE $${idx} OR contact_id ILIKE $${idx})`); params.push(`%${search}%`); idx++; }
    if (employment_type) { conditions.push(`employment_type = $${idx++}`); params.push(employment_type); }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    const offset = (Number(page) - 1) * Number(limit);

    const [countResult, dataResult] = await Promise.all([
      pool.query(`SELECT COUNT(*) FROM hr_hiring_data ${where}`, params),
      pool.query(`SELECT contact_id, first_name, last_name, tags, employment_type, synced_at FROM hr_hiring_data ${where} ORDER BY synced_at DESC LIMIT $${idx} OFFSET $${idx + 1}`, [...params, Number(limit), offset]),
    ]);

    return res.json({
      records: dataResult.rows,
      total: parseInt(countResult.rows[0].count, 10),
      page: Number(page),
      totalPages: Math.ceil(parseInt(countResult.rows[0].count, 10) / Number(limit)),
    });
  } catch (err) { return next(err); }
});

module.exports = { hrHiringRouter: router };
