const express = require('express');
const { pool } = require('../db');
const { requireAuth, requireRole } = require('../middleware/auth');

const router = express.Router();

const ALLOWED_ROLES = ['super_admin', 'ceo', 'hr', 'tv'];

// GET /api/hr-staff-movements/dashboard — dashboard view (-2 weeks to +2 months)
router.get('/dashboard', requireAuth, requireRole(ALLOWED_ROLES), async (_req, res, next) => {
  try {
    const { rows: onboarding } = await pool.query(
      `SELECT id, name, position, department_branch, start_date, end_date
       FROM hr_staff_movements
       WHERE start_date IS NOT NULL
         AND start_date >= CURRENT_DATE - INTERVAL '14 days'
         AND start_date <= CURRENT_DATE + INTERVAL '2 months'
       ORDER BY start_date ASC`
    );

    const { rows: offboarding } = await pool.query(
      `SELECT id, name, position, department_branch, start_date, end_date
       FROM hr_staff_movements
       WHERE end_date IS NOT NULL
         AND end_date >= CURRENT_DATE - INTERVAL '14 days'
         AND end_date <= CURRENT_DATE + INTERVAL '2 months'
       ORDER BY end_date DESC`
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
      search = '', position = '', department_branch = '',
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
    if (position) { conditions.push(`position = $${idx++}`); params.push(position); }
    if (department_branch) { conditions.push(`department_branch = $${idx++}`); params.push(department_branch); }
    if (date_from) { conditions.push(`(start_date >= $${idx}::date OR end_date >= $${idx}::date)`); params.push(date_from); idx++; }
    if (date_to) { conditions.push(`(start_date <= $${idx}::date OR end_date <= $${idx}::date)`); params.push(date_to); idx++; }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    const offset = (Number(page) - 1) * Number(limit);

    const [countResult, dataResult] = await Promise.all([
      pool.query(`SELECT COUNT(*) FROM hr_staff_movements ${where}`, params),
      pool.query(
        `SELECT id, name, position, department_branch, start_date, end_date, created_at
         FROM hr_staff_movements ${where}
         ORDER BY start_date DESC, created_at DESC
         LIMIT $${idx} OFFSET $${idx + 1}`,
        [...params, Number(limit), offset]
      ),
    ]);

    return res.json({
      records: dataResult.rows,
      total: parseInt(countResult.rows[0].count, 10),
      page: Number(page),
      totalPages: Math.ceil(parseInt(countResult.rows[0].count, 10) / Number(limit)),
    });
  } catch (err) {
    return next(err);
  }
});

// POST /api/hr-staff-movements — create
router.post('/', requireAuth, requireRole(ALLOWED_ROLES), async (req, res, next) => {
  try {
    const { name, position, department_branch, start_date, end_date } = req.body;

    if (!name || !position || !department_branch) {
      return res.status(400).json({ error: 'Name, position, and department/branch are required' });
    }
    if (!start_date && !end_date) {
      return res.status(400).json({ error: 'At least one of start date or end date is required' });
    }

    const { rows } = await pool.query(
      `INSERT INTO hr_staff_movements (name, position, department_branch, start_date, end_date)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id`,
      [name.trim(), position.trim(), department_branch.trim(), start_date || null, end_date || null]
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
    const { name, position, department_branch, start_date, end_date } = req.body;

    const sets = [];
    const params = [];
    let idx = 1;

    if (name !== undefined) { sets.push(`name = $${idx++}`); params.push(name.trim()); }
    if (position !== undefined) { sets.push(`position = $${idx++}`); params.push(position.trim()); }
    if (department_branch !== undefined) { sets.push(`department_branch = $${idx++}`); params.push(department_branch.trim()); }
    if (start_date !== undefined) { sets.push(`start_date = $${idx++}`); params.push(start_date || null); }
    if (end_date !== undefined) { sets.push(`end_date = $${idx++}`); params.push(end_date || null); }

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

// POST /api/hr-staff-movements/bulk — bulk import
router.post('/bulk', requireAuth, requireRole(['super_admin', 'hr']), async (req, res, next) => {
  try {
    const { records, clearFirst } = req.body;
    if (!Array.isArray(records) || records.length === 0) {
      return res.status(400).json({ error: 'records must be a non-empty array' });
    }

    if (clearFirst) {
      await pool.query('DELETE FROM hr_staff_movements');
    }

    let inserted = 0;
    let skipped = 0;

    for (const r of records) {
      const name = (r.name || '').trim();
      const position = (r.position || '').trim();
      const dept = (r.department_branch || '').trim();
      const startDate = r.start_date || null;
      const endDate = r.end_date || null;

      if (!name || !position || !dept) { skipped++; continue; }
      if (!startDate && !endDate) { skipped++; continue; }

      await pool.query(
        `INSERT INTO hr_staff_movements (name, position, department_branch, start_date, end_date)
         VALUES ($1, $2, $3, $4, $5)`,
        [name, position, dept, startDate, endDate]
      );
      inserted++;
    }

    return res.json({ inserted, skipped, total: records.length });
  } catch (err) {
    return next(err);
  }
});

module.exports = { hrStaffMovementsRouter: router };
