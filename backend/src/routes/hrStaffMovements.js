const express = require('express');
const { pool } = require('../db');
const { requireAuth, requireRole } = require('../middleware/auth');

const router = express.Router();

const ALLOWED_ROLES = ['super_admin', 'ceo', 'hr'];

// GET /api/hr-staff-movements/dashboard — dashboard view (-2 weeks to +2 months)
router.get('/dashboard', requireAuth, requireRole(ALLOWED_ROLES), async (_req, res, next) => {
  try {
    const { rows: onboarding } = await pool.query(
      `SELECT id, name, position, department_branch, movement_type, movement_date
       FROM hr_staff_movements
       WHERE movement_type = 'onboarding'
         AND movement_date >= CURRENT_DATE - INTERVAL '14 days'
         AND movement_date <= CURRENT_DATE + INTERVAL '2 months'
       ORDER BY movement_date ASC`
    );

    const { rows: offboarding } = await pool.query(
      `SELECT id, name, position, department_branch, movement_type, movement_date
       FROM hr_staff_movements
       WHERE movement_type = 'offboarding'
         AND movement_date >= CURRENT_DATE - INTERVAL '14 days'
         AND movement_date <= CURRENT_DATE + INTERVAL '2 months'
       ORDER BY movement_date DESC`
    );

    return res.json({ onboarding, offboarding });
  } catch (err) {
    return next(err);
  }
});

// GET /api/hr-staff-movements — list with filters (paginated)
router.get('/', requireAuth, requireRole(ALLOWED_ROLES), async (req, res, next) => {
  try {
    const {
      search = '', movement_type = '', department_branch = '',
      date_from = '', date_to = '',
      page = 1, limit = 50,
    } = req.query;

    const conditions = [];
    const params = [];
    let idx = 1;

    if (search) {
      conditions.push(`(name ILIKE $${idx} OR position ILIKE $${idx} OR department_branch ILIKE $${idx})`);
      params.push(`%${search}%`);
      idx++;
    }
    if (movement_type) { conditions.push(`movement_type = $${idx++}`); params.push(movement_type); }
    if (department_branch) { conditions.push(`department_branch = $${idx++}`); params.push(department_branch); }
    if (date_from) { conditions.push(`movement_date >= $${idx++}::date`); params.push(date_from); }
    if (date_to) { conditions.push(`movement_date <= $${idx++}::date`); params.push(date_to); }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    const offset = (Number(page) - 1) * Number(limit);

    const [countResult, dataResult, deptResult] = await Promise.all([
      pool.query(`SELECT COUNT(*) FROM hr_staff_movements ${where}`, params),
      pool.query(
        `SELECT id, name, position, department_branch, movement_type, movement_date, created_at
         FROM hr_staff_movements ${where}
         ORDER BY movement_date DESC, created_at DESC
         LIMIT $${idx} OFFSET $${idx + 1}`,
        [...params, Number(limit), offset]
      ),
      pool.query(`SELECT DISTINCT department_branch FROM hr_staff_movements WHERE department_branch != '' ORDER BY department_branch`),
    ]);

    return res.json({
      records: dataResult.rows,
      total: parseInt(countResult.rows[0].count, 10),
      page: Number(page),
      totalPages: Math.ceil(parseInt(countResult.rows[0].count, 10) / Number(limit)),
      filters: { departments: deptResult.rows.map(r => r.department_branch) },
    });
  } catch (err) {
    return next(err);
  }
});

// POST /api/hr-staff-movements — create
router.post('/', requireAuth, requireRole(ALLOWED_ROLES), async (req, res, next) => {
  try {
    const { name, position, department_branch, movement_type, movement_date } = req.body;

    if (!name || !position || !department_branch || !movement_type || !movement_date) {
      return res.status(400).json({ error: 'All fields are required: name, position, department_branch, movement_type, movement_date' });
    }
    if (!['onboarding', 'offboarding'].includes(movement_type)) {
      return res.status(400).json({ error: 'movement_type must be onboarding or offboarding' });
    }

    const { rows } = await pool.query(
      `INSERT INTO hr_staff_movements (name, position, department_branch, movement_type, movement_date)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id`,
      [name.trim(), position.trim(), department_branch.trim(), movement_type, movement_date]
    );

    return res.status(201).json({ id: rows[0].id });
  } catch (err) {
    return next(err);
  }
});

// PUT /api/hr-staff-movements/:id — update
router.put('/:id', requireAuth, requireRole(ALLOWED_ROLES), async (req, res, next) => {
  try {
    const { id } = req.params;
    const { name, position, department_branch, movement_type, movement_date } = req.body;

    if (movement_type !== undefined && !['onboarding', 'offboarding'].includes(movement_type)) {
      return res.status(400).json({ error: 'movement_type must be onboarding or offboarding' });
    }

    const sets = [];
    const params = [];
    let idx = 1;

    if (name !== undefined) { sets.push(`name = $${idx++}`); params.push(name.trim()); }
    if (position !== undefined) { sets.push(`position = $${idx++}`); params.push(position.trim()); }
    if (department_branch !== undefined) { sets.push(`department_branch = $${idx++}`); params.push(department_branch.trim()); }
    if (movement_type !== undefined) { sets.push(`movement_type = $${idx++}`); params.push(movement_type); }
    if (movement_date !== undefined) { sets.push(`movement_date = $${idx++}`); params.push(movement_date); }

    if (sets.length === 0) return res.status(400).json({ error: 'No fields to update' });

    params.push(id);
    const { rowCount } = await pool.query(
      `UPDATE hr_staff_movements SET ${sets.join(', ')} WHERE id = $${idx}`,
      params
    );

    if (rowCount === 0) return res.status(404).json({ error: 'Record not found' });
    return res.json({ message: 'Updated' });
  } catch (err) {
    return next(err);
  }
});

// DELETE /api/hr-staff-movements/:id — delete
router.delete('/:id', requireAuth, requireRole(ALLOWED_ROLES), async (req, res, next) => {
  try {
    const { id } = req.params;
    const { rowCount } = await pool.query('DELETE FROM hr_staff_movements WHERE id = $1', [id]);
    if (rowCount === 0) return res.status(404).json({ error: 'Record not found' });
    return res.json({ message: 'Deleted' });
  } catch (err) {
    return next(err);
  }
});

module.exports = { hrStaffMovementsRouter: router };
