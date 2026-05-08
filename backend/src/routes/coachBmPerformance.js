const express = require('express');
const { pool } = require('../db');
const { requireAuth } = require('../middleware/auth');
const { requireDashboard } = require('../middleware/dashboards');

const router = express.Router();
router.use(requireAuth);
router.use(requireDashboard('student_db'));


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
                CASE
                  WHEN bs."contract" IS NULL OR TRIM(bs."contract") = '' THEN ARRAY[]::text[]
                  ELSE
                    ARRAY['CCP'] ||
                    CASE NULLIF(regexp_replace(bs."contract", '[^0-9]', '', 'g'), '')::int
                      WHEN 15 THEN ARRAY['Weekly Training', 'Toastmasters', 'TPRR']
                      WHEN 18 THEN ARRAY['Weekly Training', 'Toastmasters', 'TPRR', 'ATCL Diploma']
                      ELSE ARRAY[]::text[]
                    END
                END AS programs
         FROM hrfs."BranchStaff" bs
         LEFT JOIN name_lookup nl ON nl."nickname" = bs."nickname"
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

// GET /api/coach-bm-performance/stats?branch=...
//
// Returns enrollment totals across all active coaches/BMs matching the
// branch filter (search is intentionally ignored — the cards mirror the
// branch filter only, same convention as Student Database's FA cards).
router.get('/stats', async (req, res, next) => {
  try {
    const { branch = '' } = req.query;
    const conditions = [
      `(bs."role" ILIKE '%coach%' OR bs."role" = 'BM')`,
      `bs."status" = 'Active'`,
    ];
    const params = [];
    if (branch) {
      conditions.push(`bs."branch" = $1`);
      params.push(branch);
    }

    const { rows } = await pool.query(
      `WITH parsed AS (
         SELECT
           bs.id,
           NULLIF(regexp_replace(COALESCE(bs."contract", ''), '[^0-9]', '', 'g'), '')::int AS months,
           bs."contract" AS raw_contract
         FROM hrfs."BranchStaff" bs
         WHERE ${conditions.join(' AND ')}
       )
       SELECT
         COUNT(*)::int                                                                    AS total,
         COUNT(*) FILTER (WHERE raw_contract IS NOT NULL AND TRIM(raw_contract) <> '')::int AS ccp,
         COUNT(*) FILTER (WHERE months IN (15, 18))::int                                  AS weekly_training,
         COUNT(*) FILTER (WHERE months IN (15, 18))::int                                  AS toastmasters,
         COUNT(*) FILTER (WHERE months IN (15, 18))::int                                  AS tprr,
         COUNT(*) FILTER (WHERE months = 18)::int                                         AS atcl_diploma
       FROM parsed`,
      params
    );
    return res.json(rows[0]);
  } catch (err) { return next(err); }
});


module.exports = { coachBmPerformanceRouter: router };
