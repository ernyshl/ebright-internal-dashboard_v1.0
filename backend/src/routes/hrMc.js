const express = require('express');
const { pool } = require('../db');
const { requireAuth, requireRole } = require('../middleware/auth');

const router = express.Router();
const ALLOWED_ROLES = ['super_admin', 'ceo', 'hr', 'tv'];

// GET /api/hr-mc/dashboard — approved SL (sick leave) from -7 days to today.
// Source: hrfs."LeaveTransaction" FDW → ebright_hrfs.public.LeaveTransaction,
// fed hourly from the Autocount Payroll API by leave_import.py. The CRUD
// endpoints below still operate on the older public.hr_mc table — it's a
// manual log, no longer the dashboard's source of truth.
//
// Name + role + branch resolution mirrors /api/hr-annual-leave/dashboard:
// LT.EmployeeName → name_lookup CTE → autocount_employee_map → name-match,
// with bs.role exposed as `position` for frontend compatibility.
router.get('/dashboard', requireAuth, requireRole(ALLOWED_ROLES), async (_req, res, next) => {
  try {
    const { rows } = await pool.query(
      `WITH name_lookup AS (
         SELECT DISTINCT ON ("EmployeeCode") "EmployeeCode", "EmployeeName"
         FROM hrfs."LeaveTransaction"
         WHERE "EmployeeName" IS NOT NULL AND TRIM("EmployeeName") <> ''
         ORDER BY "EmployeeCode", created_at DESC
       ),
       resolved_name AS (
         SELECT lt.id AS lt_id,
                COALESCE(NULLIF(TRIM(lt."EmployeeName"), ''), nl."EmployeeName") AS name_from_lt
         FROM hrfs."LeaveTransaction" lt
         LEFT JOIN name_lookup nl ON nl."EmployeeCode" = lt."EmployeeCode"
       )
       SELECT
         lt.id,
         COALESCE(bs.name, rn.name_from_lt, lt."EmployeeCode") AS name,
         bs.role AS position,
         bs.branch AS department_branch,
         lt."LeaveDate"::date AS mc_date,
         lt."ApplyReason" AS reason
       FROM hrfs."LeaveTransaction" lt
       LEFT JOIN resolved_name rn ON rn.lt_id = lt.id
       LEFT JOIN public.autocount_employee_map m ON m.autocount_code = lt."EmployeeCode"
       LEFT JOIN hrfs."BranchStaff" bs
         ON bs.id = m.branchstaff_id
         OR (m.branchstaff_id IS NULL
             AND rn.name_from_lt IS NOT NULL
             AND UPPER(TRIM(bs.name)) = UPPER(TRIM(rn.name_from_lt)))
       WHERE lt."LeaveTypeCode" = 'SL'
         AND lt."ApplyStatus" = 'A'
         AND lt."LeaveDate"::date >= CURRENT_DATE - INTERVAL '7 days'
         AND lt."LeaveDate"::date <= CURRENT_DATE
         AND (bs.status IS NULL OR bs.status <> 'Inactive')
       ORDER BY lt."LeaveDate" DESC`
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
