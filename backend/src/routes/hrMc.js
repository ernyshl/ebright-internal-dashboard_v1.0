const express = require('express');
const { pool } = require('../db');
const { requireAuth, requireRole } = require('../middleware/auth');

const router = express.Router();
const ALLOWED_ROLES = ['super_admin', 'ceo', 'hr', 'tv'];

// GET /api/hr-mc/dashboard — MC records from -2 weeks to today
router.get('/dashboard', requireAuth, requireRole(ALLOWED_ROLES), async (_req, res, next) => {
  try {
    const { rows } = await pool.query(
      `SELECT id, name, position, department_branch, mc_date, reason
       FROM hr_mc
       WHERE mc_date >= CURRENT_DATE - INTERVAL '7 days'
         AND mc_date <= CURRENT_DATE
       ORDER BY mc_date DESC`
    );
    return res.json({ records: rows });
  } catch (err) { return next(err); }
});

// GET /api/hr-mc — list with filters
router.get('/', requireAuth, requireRole(ALLOWED_ROLES), async (req, res, next) => {
  try {
    const { search = '', position = '', department_branch = '', date_from = '', date_to = '', page = 1, limit = 50 } = req.query;
    const conditions = []; const params = []; let idx = 1;

    if (search) { conditions.push(`(name ILIKE $${idx} OR position ILIKE $${idx} OR department_branch ILIKE $${idx} OR reason ILIKE $${idx})`); params.push(`%${search}%`); idx++; }
    if (position) { conditions.push(`position = $${idx++}`); params.push(position); }
    if (department_branch) { conditions.push(`department_branch = $${idx++}`); params.push(department_branch); }
    if (date_from) { conditions.push(`mc_date >= $${idx++}::date`); params.push(date_from); }
    if (date_to) { conditions.push(`mc_date <= $${idx++}::date`); params.push(date_to); }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    const offset = (Number(page) - 1) * Number(limit);

    const [countResult, dataResult] = await Promise.all([
      pool.query(`SELECT COUNT(*) FROM hr_mc ${where}`, params),
      pool.query(`SELECT id, name, position, department_branch, mc_date, reason, created_at FROM hr_mc ${where} ORDER BY mc_date DESC, created_at DESC LIMIT $${idx} OFFSET $${idx + 1}`, [...params, Number(limit), offset]),
    ]);

    return res.json({ records: dataResult.rows, total: parseInt(countResult.rows[0].count, 10), page: Number(page), totalPages: Math.ceil(parseInt(countResult.rows[0].count, 10) / Number(limit)) });
  } catch (err) { return next(err); }
});

// POST /api/hr-mc
router.post('/', requireAuth, requireRole(['super_admin', 'hr']), async (req, res, next) => {
  try {
    const { name, position, department_branch, mc_date, reason } = req.body;
    if (!name || !position || !department_branch || !mc_date) return res.status(400).json({ error: 'Name, position, department/branch, and MC date are required' });
    const { rows } = await pool.query(`INSERT INTO hr_mc (name, position, department_branch, mc_date, reason) VALUES ($1,$2,$3,$4,$5) RETURNING id`, [name.trim(), position.trim(), department_branch.trim(), mc_date, (reason || '').trim()]);
    return res.status(201).json({ id: rows[0].id });
  } catch (err) { return next(err); }
});

// PUT /api/hr-mc/:id
router.put('/:id', requireAuth, requireRole(['super_admin', 'hr']), async (req, res, next) => {
  try {
    const { id } = req.params;
    const { name, position, department_branch, mc_date, reason } = req.body;
    const sets = []; const params = []; let idx = 1;
    if (name !== undefined) { sets.push(`name = $${idx++}`); params.push(name.trim()); }
    if (position !== undefined) { sets.push(`position = $${idx++}`); params.push(position.trim()); }
    if (department_branch !== undefined) { sets.push(`department_branch = $${idx++}`); params.push(department_branch.trim()); }
    if (mc_date !== undefined) { sets.push(`mc_date = $${idx++}`); params.push(mc_date); }
    if (reason !== undefined) { sets.push(`reason = $${idx++}`); params.push(reason.trim()); }
    if (sets.length === 0) return res.status(400).json({ error: 'No fields to update' });
    params.push(id);
    const { rowCount } = await pool.query(`UPDATE hr_mc SET ${sets.join(', ')} WHERE id = $${idx}`, params);
    if (rowCount === 0) return res.status(404).json({ error: 'Record not found' });
    return res.json({ message: 'Updated' });
  } catch (err) { return next(err); }
});

// DELETE /api/hr-mc/:id
router.delete('/:id', requireAuth, requireRole(['super_admin', 'hr']), async (req, res, next) => {
  try {
    const { id } = req.params;
    const { rowCount } = await pool.query('DELETE FROM hr_mc WHERE id = $1', [id]);
    if (rowCount === 0) return res.status(404).json({ error: 'Record not found' });
    return res.json({ message: 'Deleted' });
  } catch (err) { return next(err); }
});

module.exports = { hrMcRouter: router };
