const express = require('express');
const { pool } = require('../db');
const { requireAuth, requireRole } = require('../middleware/auth');

const router = express.Router();
const ALLOWED_ROLES = ['super_admin', 'ceo', 'hr', 'tv'];

// GET /api/hr-annual-leave/dashboard — approved AL from today to +2 weeks.
// Source: hrfs."LeaveTransaction" FDW → ebright_hrfs.public.LeaveTransaction,
// kept fresh hourly from the Autocount Payroll API by leave_import.py on
// wintest-server. The /api/hr-annual-leave CRUD below still operates on the
// older public.hr_annual_leave table — it's a manual log, no longer the
// dashboard's source of truth.
//
// BranchStaff resolution: lt."EmployeeCode" (e.g. EBRIGHT001) does NOT match
// hrfs."BranchStaff"."employeeId" (e.g. 11010001) — they're separate ID
// systems. We resolve to a BranchStaff.id via three strategies, in order:
//   1. lt."EmployeeName" (populated when leave is created via HRfS web UI)
//   2. name_lookup CTE — latest non-null EmployeeName per code
//   3. public.autocount_employee_map — manual bridge for staff whose leave
//      only ever comes through Autocount (their EmployeeName is always NULL)
// Once a BranchStaff row is found, we use its name/position/branch and apply
// the inactive-status filter against it.
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
         lt."LeaveDate"::date AS al_date,
         lt."Days" AS al_duration
       FROM hrfs."LeaveTransaction" lt
       LEFT JOIN resolved_name rn ON rn.lt_id = lt.id
       LEFT JOIN public.autocount_employee_map m ON m.autocount_code = lt."EmployeeCode"
       LEFT JOIN hrfs."BranchStaff" bs
         ON bs.id = m.branchstaff_id
         OR (m.branchstaff_id IS NULL
             AND rn.name_from_lt IS NOT NULL
             AND UPPER(bs.name) = UPPER(rn.name_from_lt))
       WHERE lt."LeaveTypeCode" = 'AL'
         AND lt."ApplyStatus" = 'A'
         AND lt."LeaveDate"::date >= CURRENT_DATE
         AND lt."LeaveDate"::date <= CURRENT_DATE + INTERVAL '14 days'
         AND (bs.status IS NULL OR bs.status <> 'Inactive')
       ORDER BY lt."LeaveDate" ASC`
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
