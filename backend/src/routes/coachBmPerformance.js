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

module.exports = { coachBmPerformanceRouter: router };
