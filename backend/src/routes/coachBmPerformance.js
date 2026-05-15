const express = require('express');
const { pool } = require('../db');
const { requireAuth } = require('../middleware/auth');
const { requireDashboard } = require('../middleware/dashboards');
const { getTableNames } = require('../utils/tableNames');

const router = express.Router();
router.use(requireAuth);
router.use(requireDashboard('student_db'));

// Server-side allowlist of program names the completion endpoint will
// accept. Keep in sync with the labels emitted by the GET / handler's
// CASE expression and with the frontend's PROGRAM_COLORS map keys.
const VALID_PROGRAMS = new Set(['CCP', 'Weekly Training', 'Toastmasters', 'TPRR', 'ATCL Diploma']);

// GET /api/coach-bm-performance
//
// Returns active coaches and BMs from hrfs."BranchStaff" with each row's
// `programs` array derived from `BranchStaff.contract` (15M and 18M get
// extra programs on top of the universal CCP — see migration 017 and the
// 2026-05-08 contract-derived-programs design doc).
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
    const { students } = getTableNames();
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
        `${nameLookupCte},
         branch_student_counts AS (
           SELECT branch, COUNT(*)::int AS cnt
           FROM ${students}
           GROUP BY branch
         )
         SELECT bs.id,
                COALESCE(NULLIF(TRIM(bs."name"), ''), nl."name") AS name,
                bs."gender",
                bs."phone",
                bs."branch",
                bs."role",
                bs."trainingStartDate" AS training_start_date,
                bs."trainingEndDate"   AS training_end_date,
                bs."contract",
                bs."status",
                CASE
                  WHEN bs."contract" IS NULL OR TRIM(bs."contract") = '' THEN ARRAY[]::text[]
                  WHEN bs."role" = 'BM' THEN
                    CASE NULLIF(regexp_replace(bs."contract", '[^0-9]', '', 'g'), '')::int
                      WHEN 15 THEN ARRAY['Weekly Training', 'Toastmasters', 'TPRR']
                      WHEN 18 THEN ARRAY['Weekly Training', 'Toastmasters', 'TPRR', 'ATCL Diploma']
                      ELSE ARRAY[]::text[]
                    END
                  ELSE
                    ARRAY['CCP'] ||
                    CASE NULLIF(regexp_replace(bs."contract", '[^0-9]', '', 'g'), '')::int
                      WHEN 15 THEN ARRAY['Weekly Training', 'Toastmasters', 'TPRR']
                      WHEN 18 THEN ARRAY['Weekly Training', 'Toastmasters', 'TPRR', 'ATCL Diploma']
                      ELSE ARRAY[]::text[]
                    END
                END AS programs,
                COALESCE(
                  (SELECT array_agg(cpc.program ORDER BY cpc.program)
                     FROM coach_program_completion cpc
                    WHERE cpc.branch_staff_id = bs.id),
                  ARRAY[]::text[]
                ) AS completed_programs,
                COALESCE(bsc.cnt, 0)::int AS student_count,
                (ctc.branch_staff_id IS NOT NULL) AS training_confirmed
         FROM hrfs."BranchStaff" bs
         LEFT JOIN name_lookup nl ON nl."nickname" = bs."nickname"
         LEFT JOIN branch_student_counts bsc ON bsc.branch = bs."branch"
         LEFT JOIN public.coach_training_completion ctc ON ctc.branch_staff_id = bs.id
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
         COUNT(*)::int AS total,
         -- assigned counts
         COUNT(*) FILTER (WHERE raw_contract IS NOT NULL AND TRIM(raw_contract) <> '')::int AS assigned_ccp,
         COUNT(*) FILTER (WHERE months IN (15, 18))::int                                    AS assigned_weekly_training,
         COUNT(*) FILTER (WHERE months IN (15, 18))::int                                    AS assigned_toastmasters,
         COUNT(*) FILTER (WHERE months IN (15, 18))::int                                    AS assigned_tprr,
         COUNT(*) FILTER (WHERE months = 18)::int                                           AS assigned_atcl_diploma,
         -- completed counts (only count completion if program is currently assigned)
         COUNT(*) FILTER (WHERE raw_contract IS NOT NULL AND TRIM(raw_contract) <> ''
                              AND EXISTS (SELECT 1 FROM coach_program_completion cpc
                                           WHERE cpc.branch_staff_id = parsed.id
                                             AND cpc.program = 'CCP'))::int                  AS completed_ccp,
         COUNT(*) FILTER (WHERE months IN (15, 18)
                              AND EXISTS (SELECT 1 FROM coach_program_completion cpc
                                           WHERE cpc.branch_staff_id = parsed.id
                                             AND cpc.program = 'Weekly Training'))::int      AS completed_weekly_training,
         COUNT(*) FILTER (WHERE months IN (15, 18)
                              AND EXISTS (SELECT 1 FROM coach_program_completion cpc
                                           WHERE cpc.branch_staff_id = parsed.id
                                             AND cpc.program = 'Toastmasters'))::int         AS completed_toastmasters,
         COUNT(*) FILTER (WHERE months IN (15, 18)
                              AND EXISTS (SELECT 1 FROM coach_program_completion cpc
                                           WHERE cpc.branch_staff_id = parsed.id
                                             AND cpc.program = 'TPRR'))::int                 AS completed_tprr,
         COUNT(*) FILTER (WHERE months = 18
                              AND EXISTS (SELECT 1 FROM coach_program_completion cpc
                                           WHERE cpc.branch_staff_id = parsed.id
                                             AND cpc.program = 'ATCL Diploma'))::int         AS completed_atcl_diploma
       FROM parsed`,
      params
    );

    const r = rows[0];
    return res.json({
      total: r.total,
      assigned: {
        ccp:             r.assigned_ccp,
        weekly_training: r.assigned_weekly_training,
        toastmasters:    r.assigned_toastmasters,
        tprr:            r.assigned_tprr,
        atcl_diploma:    r.assigned_atcl_diploma,
      },
      completed: {
        ccp:             r.completed_ccp,
        weekly_training: r.completed_weekly_training,
        toastmasters:    r.completed_toastmasters,
        tprr:            r.completed_tprr,
        atcl_diploma:    r.completed_atcl_diploma,
      },
    });
  } catch (err) { return next(err); }
});

// GET /api/coach-bm-performance/coaches?branch=KTG
//
// Lookup endpoint for the Edit Student modal's coach dropdown.
// Returns { coaches: [{ id, name }] } for active coaches/BMs in the
// requested branch, sorted by name. Reuses the same name_lookup CTE
// as GET / to resolve stub-row names.
router.get('/coaches', async (req, res, next) => {
  try {
    const branch = (req.query.branch || '').toString().trim();
    if (!branch) {
      return res.status(400).json({ error: 'branch required' });
    }

    const { rows } = await pool.query(
      `WITH name_lookup AS (
         SELECT DISTINCT ON ("nickname") "nickname", "name"
         FROM hrfs."BranchStaff"
         WHERE "name" IS NOT NULL AND TRIM("name") <> ''
           AND "nickname" IS NOT NULL AND TRIM("nickname") <> ''
         ORDER BY "nickname", "createdAt" DESC
       )
       SELECT bs.id,
              COALESCE(NULLIF(TRIM(bs."name"), ''), nl."name") AS name
       FROM hrfs."BranchStaff" bs
       LEFT JOIN name_lookup nl ON nl."nickname" = bs."nickname"
       WHERE (bs."role" ILIKE '%coach%' OR bs."role" = 'BM')
         AND bs."status" = 'Active'
         AND bs."branch" = $1
         AND COALESCE(NULLIF(TRIM(bs."name"), ''), nl."name") IS NOT NULL
       ORDER BY name ASC`,
      [branch]
    );

    return res.json({ coaches: rows });
  } catch (err) { return next(err); }
});

// PUT /api/coach-bm-performance/:branchStaffId/completion
//
// Body: { program: string, completed: boolean }
//
// `program` must be one of VALID_PROGRAMS AND currently assigned to the
// coach (the same contract → programs derivation that GET / uses). The
// assignment check prevents writing a completion for a program the
// coach isn't actually on (e.g. ATCL Diploma for a 9M coach).
//
// completed=true  → INSERT ... ON CONFLICT DO UPDATE (refresh timestamp)
// completed=false → DELETE (idempotent; missing row is fine)
router.put('/:branchStaffId/completion', async (req, res, next) => {
  try {
    const branchStaffId = parseInt(req.params.branchStaffId, 10);
    if (!Number.isInteger(branchStaffId) || branchStaffId <= 0) {
      return res.status(400).json({ error: 'Invalid branchStaffId' });
    }

    const { program, completed } = req.body || {};
    if (!VALID_PROGRAMS.has(program)) {
      return res.status(400).json({ error: 'Invalid program' });
    }
    if (typeof completed !== 'boolean') {
      return res.status(400).json({ error: 'completed must be boolean' });
    }

    // Guard: confirm the staff row exists, is Active coach/BM, and the
    // requested program is in their currently assigned set. Re-runs the
    // same CASE expression as GET /.
    const { rows: assignmentRows } = await pool.query(
      `SELECT
         CASE
           WHEN bs."contract" IS NULL OR TRIM(bs."contract") = '' THEN ARRAY[]::text[]
           WHEN bs."role" = 'BM' THEN
             CASE NULLIF(regexp_replace(bs."contract", '[^0-9]', '', 'g'), '')::int
               WHEN 15 THEN ARRAY['Weekly Training', 'Toastmasters', 'TPRR']
               WHEN 18 THEN ARRAY['Weekly Training', 'Toastmasters', 'TPRR', 'ATCL Diploma']
               ELSE ARRAY[]::text[]
             END
           ELSE
             ARRAY['CCP'] ||
             CASE NULLIF(regexp_replace(bs."contract", '[^0-9]', '', 'g'), '')::int
               WHEN 15 THEN ARRAY['Weekly Training', 'Toastmasters', 'TPRR']
               WHEN 18 THEN ARRAY['Weekly Training', 'Toastmasters', 'TPRR', 'ATCL Diploma']
               ELSE ARRAY[]::text[]
             END
         END AS programs
       FROM hrfs."BranchStaff" bs
       WHERE bs.id = $1
         AND bs."status" = 'Active'
         AND (bs."role" ILIKE '%coach%' OR bs."role" = 'BM')`,
      [branchStaffId]
    );
    if (!assignmentRows.length) {
      return res.status(404).json({ error: 'Coach or BM not found' });
    }
    if (!assignmentRows[0].programs.includes(program)) {
      return res.status(422).json({ error: 'Program not assigned to this coach' });
    }

    const userId = req.user.sub;
    if (completed) {
      await pool.query(
        `INSERT INTO coach_program_completion
           (branch_staff_id, program, completed_at, completed_by)
         VALUES ($1, $2, NOW(), $3)
         ON CONFLICT (branch_staff_id, program) DO UPDATE SET
           completed_at = NOW(),
           completed_by = EXCLUDED.completed_by`,
        [branchStaffId, program, userId]
      );
    } else {
      await pool.query(
        `DELETE FROM coach_program_completion
         WHERE branch_staff_id = $1 AND program = $2`,
        [branchStaffId, program]
      );
    }

    return res.json({ ok: true, branch_staff_id: branchStaffId, program, completed });
  } catch (err) { return next(err); }
});

module.exports = { coachBmPerformanceRouter: router };
