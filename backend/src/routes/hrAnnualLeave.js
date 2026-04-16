const express = require('express');
const { pool } = require('../db');
const { requireAuth, requireRole } = require('../middleware/auth');

const router = express.Router();
const ALLOWED_ROLES = ['super_admin', 'ceo', 'hr', 'tv'];

// GET /api/hr-annual-leave/dashboard — AL records from -1 week to +2 weeks
router.get('/dashboard', requireAuth, requireRole(ALLOWED_ROLES), async (_req, res, next) => {
  try {
    const { rows } = await pool.query(
      `SELECT id, name, position, department_branch, al_date, al_duration
       FROM hr_annual_leave
       WHERE al_date >= CURRENT_DATE - INTERVAL '14 days'
         AND al_date <= CURRENT_DATE + INTERVAL '14 days'
       ORDER BY al_date ASC`
    );
    return res.json({ records: rows });
  } catch (err) { return next(err); }
});

// GET /api/hr-annual-leave — list with filters
router.get('/', requireAuth, requireRole(ALLOWED_ROLES), async (req, res, next) => {
  try {
    const { search = '', position = '', department_branch = '', date_from = '', date_to = '', page = 1, limit = 50 } = req.query;
    const conditions = []; const params = []; let idx = 1;

    if (search) { conditions.push(`(name ILIKE $${idx} OR position ILIKE $${idx} OR department_branch ILIKE $${idx})`); params.push(`%${search}%`); idx++; }
    if (position) { conditions.push(`position = $${idx++}`); params.push(position); }
    if (department_branch) { conditions.push(`department_branch = $${idx++}`); params.push(department_branch); }
    if (date_from) { conditions.push(`al_date >= $${idx++}::date`); params.push(date_from); }
    if (date_to) { conditions.push(`al_date <= $${idx++}::date`); params.push(date_to); }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    const offset = (Number(page) - 1) * Number(limit);

    const [countResult, dataResult] = await Promise.all([
      pool.query(`SELECT COUNT(*) FROM hr_annual_leave ${where}`, params),
      pool.query(`SELECT id, name, position, department_branch, al_date, al_duration, created_at FROM hr_annual_leave ${where} ORDER BY al_date DESC, created_at DESC LIMIT $${idx} OFFSET $${idx + 1}`, [...params, Number(limit), offset]),
    ]);

    return res.json({ records: dataResult.rows, total: parseInt(countResult.rows[0].count, 10), page: Number(page), totalPages: Math.ceil(parseInt(countResult.rows[0].count, 10) / Number(limit)) });
  } catch (err) { return next(err); }
});

// POST /api/hr-annual-leave
router.post('/', requireAuth, requireRole(['super_admin', 'hr']), async (req, res, next) => {
  try {
    const { name, position, department_branch, al_date, al_duration } = req.body;
    if (!name || !position || !department_branch || !al_date || !al_duration) return res.status(400).json({ error: 'All fields are required' });
    const { rows } = await pool.query(`INSERT INTO hr_annual_leave (name, position, department_branch, al_date, al_duration) VALUES ($1,$2,$3,$4,$5) RETURNING id`, [name.trim(), position.trim(), department_branch.trim(), al_date, al_duration.trim()]);
    return res.status(201).json({ id: rows[0].id });
  } catch (err) { return next(err); }
});

// PUT /api/hr-annual-leave/:id
router.put('/:id', requireAuth, requireRole(['super_admin', 'hr']), async (req, res, next) => {
  try {
    const { id } = req.params;
    const { name, position, department_branch, al_date, al_duration } = req.body;
    const sets = []; const params = []; let idx = 1;
    if (name !== undefined) { sets.push(`name = $${idx++}`); params.push(name.trim()); }
    if (position !== undefined) { sets.push(`position = $${idx++}`); params.push(position.trim()); }
    if (department_branch !== undefined) { sets.push(`department_branch = $${idx++}`); params.push(department_branch.trim()); }
    if (al_date !== undefined) { sets.push(`al_date = $${idx++}`); params.push(al_date); }
    if (al_duration !== undefined) { sets.push(`al_duration = $${idx++}`); params.push(al_duration.trim()); }
    if (sets.length === 0) return res.status(400).json({ error: 'No fields to update' });
    params.push(id);
    const { rowCount } = await pool.query(`UPDATE hr_annual_leave SET ${sets.join(', ')} WHERE id = $${idx}`, params);
    if (rowCount === 0) return res.status(404).json({ error: 'Record not found' });
    return res.json({ message: 'Updated' });
  } catch (err) { return next(err); }
});

// DELETE /api/hr-annual-leave/:id
router.delete('/:id', requireAuth, requireRole(['super_admin', 'hr']), async (req, res, next) => {
  try {
    const { id } = req.params;
    const { rowCount } = await pool.query('DELETE FROM hr_annual_leave WHERE id = $1', [id]);
    if (rowCount === 0) return res.status(404).json({ error: 'Record not found' });
    return res.json({ message: 'Deleted' });
  } catch (err) { return next(err); }
});

module.exports = { hrAnnualLeaveRouter: router };
