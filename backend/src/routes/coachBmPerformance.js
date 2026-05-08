const express = require('express');
const { pool } = require('../db');
const { requireAuth } = require('../middleware/auth');
const { requireDashboard } = require('../middleware/dashboards');

const router = express.Router();
router.use(requireAuth);
router.use(requireDashboard('student_db'));

const VALID_PROGRAMS = new Set(['weekly_training', 'atcl_diploma', 'toastmasters']);

// GET /api/coach-bm-performance
//
// Returns active coaches and BMs from hrfs."BranchStaff" joined with the
// dashboard-side coach_program_enrollment table.
//
//   role match:  ILIKE '%coach%' OR exact 'BM'
//   status:      Active only
//   ordering:    name ASC
//
// Reuses the same name_lookup CTE pattern as /api/hrfs/branch-staff to
// rescue stub rows where bs.name is blank but a sibling row with the same
// nickname has a real name. Rows that can't be rescued are filtered out.
router.get('/', async (req, res, next) => {
  try {
    const { search = '', branch = '', page = 1, limit = 50 } = req.query;
    const conditions = [
      `(bs."role" ILIKE '%coach%' OR bs."role" = 'BM')`,
      `bs."status" = 'Active'`,
    ];
    const params = [];
    let idx = 1;

    if (search) {
      conditions.push(`COALESCE(NULLIF(TRIM(bs."name"), ''), nl."name") ILIKE $${idx}`);
      params.push(`%${search}%`); idx++;
    }
    if (branch) {
      conditions.push(`bs."branch" = $${idx}`);
      params.push(branch); idx++;
    }

    const where = `WHERE ${conditions.join(' AND ')}
      AND COALESCE(NULLIF(TRIM(bs."name"), ''), nl."name") IS NOT NULL`;
    const offset = (Number(page) - 1) * Number(limit);

    const nameLookupCte = `
      WITH name_lookup AS (
        SELECT DISTINCT ON ("nickname") "nickname", "name"
        FROM hrfs."BranchStaff"
        WHERE "name" IS NOT NULL AND TRIM("name") <> ''
          AND "nickname" IS NOT NULL AND TRIM("nickname") <> ''
        ORDER BY "nickname", "createdAt" DESC
      )
    `;

    const [countResult, dataResult] = await Promise.all([
      pool.query(
        `${nameLookupCte}
         SELECT COUNT(*)
         FROM hrfs."BranchStaff" bs
         LEFT JOIN name_lookup nl ON nl."nickname" = bs."nickname"
         ${where}`,
        params
      ),
      pool.query(
        `${nameLookupCte}
         SELECT bs.id,
                COALESCE(NULLIF(TRIM(bs."name"), ''), nl."name") AS name,
                bs."gender",
                bs."branch",
                bs.start_date,
                bs."contract",
                bs."status",
                COALESCE(cpe.weekly_training, FALSE) AS weekly_training,
                COALESCE(cpe.atcl_diploma,    FALSE) AS atcl_diploma,
                COALESCE(cpe.toastmasters,    FALSE) AS toastmasters
         FROM hrfs."BranchStaff" bs
         LEFT JOIN name_lookup nl ON nl."nickname" = bs."nickname"
         LEFT JOIN coach_program_enrollment cpe ON cpe.branch_staff_id = bs.id
         ${where}
         ORDER BY name ASC
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
  } catch (err) { return next(err); }
});

// PUT /api/coach-bm-performance/:branchStaffId/program
//
// Body: { program: 'weekly_training' | 'atcl_diploma' | 'toastmasters', enrolled: boolean }
//
// Validates that the staff row exists, is Active, and matches the
// coach/BM filter, then upserts the enrollment row. Existing flags on
// the other two programs are preserved by the CASE expression in the
// UPDATE branch — we only ever change the targeted column.
router.put('/:branchStaffId/program', async (req, res, next) => {
  try {
    const branchStaffId = parseInt(req.params.branchStaffId, 10);
    if (!Number.isInteger(branchStaffId) || branchStaffId <= 0) {
      return res.status(400).json({ error: 'Invalid branchStaffId' });
    }

    const { program, enrolled } = req.body || {};
    if (!VALID_PROGRAMS.has(program)) {
      return res.status(400).json({ error: 'Invalid program' });
    }
    if (typeof enrolled !== 'boolean') {
      return res.status(400).json({ error: 'enrolled must be boolean' });
    }

    // Confirm the staff row is a real, active coach/BM. Prevents writing
    // ticks against arbitrary HR rows by guessing ids.
    const { rows: staffRows } = await pool.query(
      `SELECT id FROM hrfs."BranchStaff"
       WHERE id = $1
         AND "status" = 'Active'
         AND ("role" ILIKE '%coach%' OR "role" = 'BM')`,
      [branchStaffId]
    );
    if (!staffRows.length) {
      return res.status(404).json({ error: 'Coach or BM not found' });
    }

    const wt   = program === 'weekly_training' ? enrolled : false;
    const atcl = program === 'atcl_diploma'    ? enrolled : false;
    const tm   = program === 'toastmasters'    ? enrolled : false;
    const userId = req.user.sub;

    const { rows } = await pool.query(
      `INSERT INTO coach_program_enrollment
         (branch_staff_id, weekly_training, atcl_diploma, toastmasters, updated_at, updated_by)
       VALUES ($1, $2, $3, $4, NOW(), $5)
       ON CONFLICT (branch_staff_id) DO UPDATE SET
         weekly_training = CASE WHEN $6 = 'weekly_training' THEN EXCLUDED.weekly_training ELSE coach_program_enrollment.weekly_training END,
         atcl_diploma    = CASE WHEN $6 = 'atcl_diploma'    THEN EXCLUDED.atcl_diploma    ELSE coach_program_enrollment.atcl_diploma    END,
         toastmasters    = CASE WHEN $6 = 'toastmasters'    THEN EXCLUDED.toastmasters    ELSE coach_program_enrollment.toastmasters    END,
         updated_at      = NOW(),
         updated_by      = EXCLUDED.updated_by
       RETURNING branch_staff_id, weekly_training, atcl_diploma, toastmasters, updated_at`,
      [branchStaffId, wt, atcl, tm, userId, program]
    );

    return res.json({ ok: true, enrollment: rows[0] });
  } catch (err) { return next(err); }
});

module.exports = { coachBmPerformanceRouter: router };
