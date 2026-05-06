const express = require('express');
const { pool } = require('../db');
const { requireAuth, requireRole } = require('../middleware/auth');

const router = express.Router();
const ALLOWED_ROLES = ['super_admin', 'ceo', 'hr', 'tv'];

// GET /api/hrfs/attendance
router.get('/attendance', requireAuth, requireRole(ALLOWED_ROLES), async (req, res, next) => {
  try {
    const { search = '', date_from = '', date_to = '', page = 1, limit = 50 } = req.query;
    const conditions = []; const params = []; let idx = 1;

    if (search) {
      conditions.push(`("empNo" ILIKE $${idx} OR "empName" ILIKE $${idx})`);
      params.push(`%${search}%`); idx++;
    }
    if (date_from) { conditions.push(`"date"::date >= $${idx++}::date`); params.push(date_from); }
    if (date_to) { conditions.push(`"date"::date <= $${idx++}::date`); params.push(date_to); }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    const offset = (Number(page) - 1) * Number(limit);

    const [countResult, dataResult] = await Promise.all([
      pool.query(`SELECT COUNT(*) FROM hrfs."AttendanceLog" ${where}`, params),
      pool.query(
        `SELECT id, date, "empNo", "empName", "clockInTime", "clockOutTime",
                "clockInSerialNo", "clockOutSerialNo", "clockInEmailSent",
                "clockOutEmailSent", "createdAt", "updatedAt"
         FROM hrfs."AttendanceLog" ${where}
         ORDER BY "createdAt" DESC LIMIT $${idx} OFFSET $${idx + 1}`,
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

// HQ-type branch codes — staff under any of these are treated as HQ for
// scheduling (Tue–Sat) and are merged behind the "HQ" filter button.
// Includes both the short codes used in BranchStaff (ACD, FNC) and longer
// variants in case they ever appear.
const HQ_BRANCHES = ['HQ', 'HR', 'OD', 'MKT', 'FNC', 'FINANCE', 'ACD', 'ACADEMY', 'OPERATION'];

// GET /api/hrfs/attendance-dashboard — summary cards + expected-today list
//
// Schedule rules (used to derive who is expected to clock in on a given day):
//   position ILIKE '%coach%'   → Wed/Thu/Fri/Sat/Sun
//   position ILIKE '%intern%'  → Tue/Wed/Thu/Fri/Sat
//   HQ branch (everyone else)  → Tue/Wed/Thu/Fri/Sat
//   Operational branch (else)  → Wed/Thu/Fri/Sat/Sun
//
// Query params:
//   branch=all     → no branch filter (default)
//   branch=HQ      → matches any HQ_BRANCHES code
//   branch=<CODE>  → matches that exact branch code
router.get('/attendance-dashboard', requireAuth, requireRole(ALLOWED_ROLES), async (req, res, next) => {
  try {
    const branchParam = (req.query.branch || 'all').toString();

    // Build branch filter SQL fragment + params used by both queries below.
    let branchSql = '';
    const branchParams = [];
    if (branchParam === 'HQ') {
      branchSql = `AND UPPER(COALESCE(bs.branch, '')) = ANY($1::text[])`;
      branchParams.push(HQ_BRANCHES);
    } else if (branchParam && branchParam !== 'all') {
      branchSql = `AND UPPER(COALESCE(bs.branch, '')) = $1`;
      branchParams.push(branchParam.toUpperCase());
    }

    // List of branch codes for the frontend to render filter buttons.
    // Limit to branches that have at least one Active staff with an
    // employeeId — the rest don't have thumbprint scanners installed yet
    // (only ST and HQ do today) so they'd render empty.
    const { rows: branchRows } = await pool.query(`
      SELECT DISTINCT branch FROM hrfs."BranchStaff"
      WHERE status = 'Active'
        AND branch IS NOT NULL AND TRIM(branch) <> ''
        AND "employeeId" IS NOT NULL AND TRIM("employeeId") <> ''
      ORDER BY branch
    `);
    const branches = branchRows.map(r => r.branch);

    const fetchDay = async (dateExpr) => {
      // 1) AttendanceLog rows for this day, JOINED to BranchStaff so:
      //    - Orphan rows (empNo with no matching active staff) are dropped
      //    - We can require employeeId is set (i.e. only branches with the
      //      thumbprint scanner installed)
      //    - The branch filter actually filters
      const attendanceSql = `
        SELECT
          al."empNo", al."empName", al."clockInTime", al."clockOutTime",
          CASE WHEN al."clockInTime" IS NOT NULL AND al."clockInTime"::time >= '09:01:00' THEN true ELSE false END AS is_late
        FROM hrfs."AttendanceLog" al
        JOIN hrfs."BranchStaff" bs
          ON (al."empNo" = bs."employeeId" OR LOWER(TRIM(al."empName")) = LOWER(TRIM(bs.name)))
        WHERE al.date::date = ${dateExpr}
          AND bs.status = 'Active'
          AND bs."employeeId" IS NOT NULL AND TRIM(bs."employeeId") <> ''
          ${branchSql}
        ORDER BY al."clockInTime" ASC
      `;
      const { rows } = await pool.query(attendanceSql, branchParams);

      // 2) Active BranchStaff who are expected today by schedule rule AND
      //    have NOT clocked in yet today.
      const dow = `EXTRACT(DOW FROM ${dateExpr})::int`;
      const expectedSql = `
        SELECT bs.name, bs.position, bs.branch, bs."employeeId" AS "empNo"
        FROM hrfs."BranchStaff" bs
        WHERE bs.status = 'Active'
          AND bs."employeeId" IS NOT NULL AND TRIM(bs."employeeId") <> ''
          AND (
            (bs.position ILIKE '%coach%' AND ${dow} IN (3,4,5,6,0))
            OR (bs.position ILIKE '%intern%' AND ${dow} IN (2,3,4,5,6))
            OR (
              (bs.position IS NULL OR (bs.position NOT ILIKE '%coach%' AND bs.position NOT ILIKE '%intern%'))
              AND UPPER(COALESCE(bs.branch, '')) = ANY('{HQ,HR,OD,MKT,FNC,FINANCE,ACD,ACADEMY,OPERATION}'::text[])
              AND ${dow} IN (2,3,4,5,6)
            )
            OR (
              (bs.position IS NULL OR (bs.position NOT ILIKE '%coach%' AND bs.position NOT ILIKE '%intern%'))
              AND UPPER(COALESCE(bs.branch, '')) <> ALL('{HQ,HR,OD,MKT,FNC,FINANCE,ACD,ACADEMY,OPERATION}'::text[])
              AND ${dow} IN (3,4,5,6,0)
            )
          )
          ${branchSql}
          AND NOT EXISTS (
            SELECT 1 FROM hrfs."AttendanceLog" al
            WHERE al.date::date = ${dateExpr}
              AND (al."empNo" = bs."employeeId" OR LOWER(TRIM(al."empName")) = LOWER(TRIM(bs.name)))
              AND al."clockInTime" IS NOT NULL
          )
        ORDER BY bs.branch, bs.name
      `;
      const { rows: expected } = await pool.query(expectedSql, branchParams);

      return {
        total: rows.length,
        on_time: rows.filter(r => !r.is_late && r.clockInTime).length,
        late: rows.filter(r => r.is_late).length,
        no_clock_in: rows.filter(r => !r.clockInTime).length,
        no_clock_out: rows.filter(r => r.clockInTime && !r.clockOutTime).length,
        records: rows.map(r => ({
          empNo: r.empNo,
          empName: r.empName,
          clockIn: r.clockInTime ? String(r.clockInTime).slice(0, 5) : null,
          clockOut: r.clockOutTime ? String(r.clockOutTime).slice(0, 5) : null,
          isLate: r.is_late,
        })),
        not_clocked_in_yet: expected.map(r => ({
          empNo: r.empNo,
          name: r.name,
          position: r.position,
          branch: r.branch,
        })),
      };
    };

    // "Last Saturday" / "Last Sunday" = most recent Sat/Sun strictly in the
    // past. If today IS Sat/Sun, jump back a full week so the user sees a
    // distinct prior day rather than today's data twice.
    const todayMyt = `(NOW() AT TIME ZONE 'Asia/Kuala_Lumpur')::date`;
    const lastSatExpr = `(${todayMyt} - (CASE WHEN EXTRACT(DOW FROM ${todayMyt})::int = 6 THEN 7 ELSE EXTRACT(DOW FROM ${todayMyt})::int + 1 END))`;
    const lastSunExpr = `(${todayMyt} - (CASE WHEN EXTRACT(DOW FROM ${todayMyt})::int = 0 THEN 7 ELSE EXTRACT(DOW FROM ${todayMyt})::int END))`;

    const [today, yesterday, last_sat, last_sun] = await Promise.all([
      fetchDay(todayMyt),
      fetchDay(`${todayMyt} - 1`),
      fetchDay(lastSatExpr),
      fetchDay(lastSunExpr),
    ]);

    return res.json({ today, yesterday, last_sat, last_sun, branches });
  } catch (err) { return next(err); }
});

// GET /api/hrfs/branch-staff
router.get('/branch-staff', requireAuth, requireRole(ALLOWED_ROLES), async (req, res, next) => {
  try {
    const {
      search = '', status = '', department = '', position = '',
      branch = '', employment_type = '',
      page = 1, limit = 50,
    } = req.query;
    const conditions = []; const params = []; let idx = 1;

    if (search) {
      conditions.push(`(bs."name" ILIKE $${idx} OR bs."nickname" ILIKE $${idx} OR bs."nric" ILIKE $${idx} OR bs."email" ILIKE $${idx})`);
      params.push(`%${search}%`); idx++;
    }
    if (status)          { conditions.push(`bs."status" = $${idx++}`);          params.push(status); }
    if (department)      { conditions.push(`bs."department" = $${idx++}`);      params.push(department); }
    if (position)        { conditions.push(`bs."position" = $${idx++}`);        params.push(position); }
    if (branch)          { conditions.push(`bs."branch" = $${idx++}`);          params.push(branch); }
    if (employment_type) { conditions.push(`bs.employment_type = $${idx++}`);   params.push(employment_type); }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    const offset = (Number(page) - 1) * Number(limit);

    // BranchStaff sometimes contains stub rows for the same person where
    // only nickname/branch/role are populated and name (plus NRIC, email,
    // phone) are NULL. Fall back to the latest non-empty name we have for
    // that nickname so the dashboard shows the person rather than a blank
    // row. Same pattern used by /api/hrfs/leave-transactions.
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
      pool.query(`SELECT COUNT(*) FROM hrfs."BranchStaff" bs ${where}`, params),
      pool.query(
        `${nameLookupCte}
         SELECT bs.id,
                COALESCE(NULLIF(TRIM(bs."name"), ''), nl."name") AS name,
                bs."nickname", bs."nric", bs."email", bs."phone", bs."role",
                bs."branch", bs."department", bs."position", bs."status", bs.employment_type,
                bs.start_date, bs."endDate", bs."dob", bs."age", bs."gender", bs."nationality",
                bs.home_address, bs."residential", bs."location", bs."university",
                bs.emergency_name, bs.emergency_phone, bs.emergency_relation,
                bs.signed_date, bs."probation", bs."rate", bs."employeeId",
                bs."accessStatus", bs."bank", bs.bank_name, bs.bank_account,
                bs."contract", bs."createdAt", bs."updatedAt"
         FROM hrfs."BranchStaff" bs
         LEFT JOIN name_lookup nl ON nl."nickname" = bs."nickname"
         ${where}
         ORDER BY bs."createdAt" DESC LIMIT $${idx} OFFSET $${idx + 1}`,
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

// GET /api/hrfs/branch-staff/options — distinct values for the 5 dropdown filters.
// Returns { branches, departments, positions, statuses, employment_types }, each
// alphabetised with blanks filtered out.
router.get('/branch-staff/options', requireAuth, requireRole(ALLOWED_ROLES), async (_req, res, next) => {
  try {
    const distinctSql = (col) => `
      SELECT DISTINCT TRIM("${col}") AS v
      FROM hrfs."BranchStaff"
      WHERE "${col}" IS NOT NULL AND TRIM("${col}") <> ''
      ORDER BY 1
    `;
    const empTypeSql = `
      SELECT DISTINCT TRIM(employment_type) AS v
      FROM hrfs."BranchStaff"
      WHERE employment_type IS NOT NULL AND TRIM(employment_type) <> ''
      ORDER BY 1
    `;
    const [branches, departments, positions, statuses, employment_types] = await Promise.all([
      pool.query(distinctSql('branch')),
      pool.query(distinctSql('department')),
      pool.query(distinctSql('position')),
      pool.query(distinctSql('status')),
      pool.query(empTypeSql),
    ]);
    return res.json({
      branches:         branches.rows.map(r => r.v),
      departments:      departments.rows.map(r => r.v),
      positions:        positions.rows.map(r => r.v),
      statuses:         statuses.rows.map(r => r.v),
      employment_types: employment_types.rows.map(r => r.v),
    });
  } catch (err) { return next(err); }
});

// GET /api/hrfs/leave-transactions
router.get('/leave-transactions', requireAuth, requireRole(ALLOWED_ROLES), async (req, res, next) => {
  try {
    const { search = '', status = '', leave_type = '', date_from = '', date_to = '', page = 1, limit = 50 } = req.query;
    const conditions = []; const params = []; let idx = 1;

    if (search) {
      conditions.push(`(
        lt."EmployeeCode" ILIKE $${idx}
        OR lt."EmployeeName" ILIKE $${idx}
        OR EXISTS (
          SELECT 1 FROM hrfs."LeaveTransaction" lt2
          WHERE lt2."EmployeeCode" = lt."EmployeeCode"
            AND lt2."EmployeeName" ILIKE $${idx}
        )
      )`);
      params.push(`%${search}%`); idx++;
    }
    if (status) { conditions.push(`lt."ApplyStatus" = $${idx++}`); params.push(status); }
    if (leave_type) { conditions.push(`lt."LeaveTypeCode" = $${idx++}`); params.push(leave_type); }
    if (date_from) { conditions.push(`lt."ApplyDate" >= $${idx++}::date`); params.push(date_from); }
    if (date_to) { conditions.push(`lt."ApplyDate" <= $${idx++}::date`); params.push(date_to); }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    const offset = (Number(page) - 1) * Number(limit);

    // Build a code -> latest non-empty EmployeeName fallback so rows missing
    // EmployeeName still display the correct person.
    const nameLookupCte = `
      WITH name_lookup AS (
        SELECT DISTINCT ON ("EmployeeCode") "EmployeeCode", "EmployeeName"
        FROM hrfs."LeaveTransaction"
        WHERE "EmployeeName" IS NOT NULL AND TRIM("EmployeeName") <> ''
        ORDER BY "EmployeeCode", created_at DESC
      )
    `;

    const [countResult, dataResult] = await Promise.all([
      pool.query(`SELECT COUNT(*) FROM hrfs."LeaveTransaction" lt ${where}`, params),
      pool.query(
        `${nameLookupCte}
         SELECT lt.id, lt."EmployeeCode",
                COALESCE(NULLIF(TRIM(lt."EmployeeName"), ''), nl."EmployeeName") AS employee_name,
                lt."LeaveTypeCode", lt."LeaveTransId",
                lt."ApplyDate", lt."ApplyReason", lt."ApplyStatus", lt."Attachment",
                lt."DayNo", lt."HourNo", lt."Days", lt."Source", lt."LeaveAdjustmentId",
                lt."LeaveDate", lt."FromTime", lt."ToTime", lt."IsHourly", lt."IsAdjustment",
                lt."LeaveCreditId", lt."ActionRemark", lt."RequiredThirdParty",
                lt."WorkingHours", lt."created_at"
         FROM hrfs."LeaveTransaction" lt
         LEFT JOIN name_lookup nl ON nl."EmployeeCode" = lt."EmployeeCode"
         ${where}
         ORDER BY lt."created_at" DESC LIMIT $${idx} OFFSET $${idx + 1}`,
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

// ──────────────────────────────────────────────────────────────
// GET /api/hrfs/overview-v2 — dashboard reading directly from the live
// HRFS foreign tables (BranchStaff + LeaveTransaction). This is distinct
// from /api/hr-staff-movements/dashboard which reads from the manually-
// curated hr_staff_movements / hr_mc / hr_annual_leave tables.
//
// Returns four lists:
//   new_hires      Active BranchStaff with createdAt in the last 30 days
//   offboarded     Inactive BranchStaff with updatedAt in the last 30 days
//   mc             SL leave with LeaveDate within the last 7 days
//   annual_leave   AL leave with LeaveDate from today through +14 days
// ──────────────────────────────────────────────────────────────
router.get('/overview-v2', requireAuth, requireRole(ALLOWED_ROLES), async (_req, res, next) => {
  try {
    // Falls back to the most recent non-empty EmployeeName per code, same
    // pattern used by /api/hrfs/leave-transactions (rows often arrive with
    // the name blanked out, but earlier rows for the same code have it).
    const nameLookupCte = `
      WITH name_lookup AS (
        SELECT DISTINCT ON ("EmployeeCode") "EmployeeCode", "EmployeeName"
        FROM hrfs."LeaveTransaction"
        WHERE "EmployeeName" IS NOT NULL AND TRIM("EmployeeName") <> ''
        ORDER BY "EmployeeCode", created_at DESC
      )
    `;

    // BranchStaff.start_date / endDate are TEXT and inconsistent (mixes
    // ISO 'YYYY-MM-DD' with phrases like '5th March 2026'). Parse only
    // ISO-format rows; non-parseable dates are skipped — the HR team can
    // normalise them upstream over time.
    const ISO_RE = `'^\\d{4}-\\d{2}-\\d{2}'`;

    const [newHires, offboarded, mcRecords, alRecords] = await Promise.all([
      pool.query(`
        SELECT id, name, position, branch, "employeeId", start_date, "endDate",
               "createdAt", "updatedAt",
               substring(start_date, 1, 10)::date AS parsed_start_date
        FROM hrfs."BranchStaff"
        WHERE status = 'Active'
          AND start_date ~ ${ISO_RE}
          AND substring(start_date, 1, 10)::date >= CURRENT_DATE - INTERVAL '1 week'
          AND substring(start_date, 1, 10)::date <= CURRENT_DATE + INTERVAL '6 months'
        ORDER BY substring(start_date, 1, 10)::date ASC
      `),
      pool.query(`
        SELECT id, name, position, branch, "employeeId", status, start_date, "endDate",
               "createdAt", "updatedAt",
               substring("endDate", 1, 10)::date AS parsed_end_date
        FROM hrfs."BranchStaff"
        WHERE "endDate" ~ ${ISO_RE}
          AND substring("endDate", 1, 10)::date >= CURRENT_DATE - INTERVAL '1 week'
          AND substring("endDate", 1, 10)::date <= CURRENT_DATE + INTERVAL '6 months'
        ORDER BY substring("endDate", 1, 10)::date ASC
      `),
      pool.query(`
        ${nameLookupCte}
        SELECT lt.id, lt."EmployeeCode",
               COALESCE(NULLIF(TRIM(lt."EmployeeName"), ''), nl."EmployeeName") AS employee_name,
               lt."LeaveTypeCode", lt."ApplyDate", lt."LeaveDate",
               lt."Days", lt."DayNo", lt."ApplyStatus", lt."ApplyReason"
        FROM hrfs."LeaveTransaction" lt
        LEFT JOIN name_lookup nl ON nl."EmployeeCode" = lt."EmployeeCode"
        WHERE lt."LeaveTypeCode" = 'SL'
          AND lt."LeaveDate" >= CURRENT_DATE - INTERVAL '7 days'
          AND lt."LeaveDate" <= CURRENT_DATE
        ORDER BY lt."LeaveDate" DESC
      `),
      pool.query(`
        ${nameLookupCte}
        SELECT lt.id, lt."EmployeeCode",
               COALESCE(NULLIF(TRIM(lt."EmployeeName"), ''), nl."EmployeeName") AS employee_name,
               lt."LeaveTypeCode", lt."ApplyDate", lt."LeaveDate",
               lt."Days", lt."DayNo", lt."ApplyStatus", lt."ApplyReason"
        FROM hrfs."LeaveTransaction" lt
        LEFT JOIN name_lookup nl ON nl."EmployeeCode" = lt."EmployeeCode"
        WHERE lt."LeaveTypeCode" = 'AL'
          AND lt."LeaveDate" >= CURRENT_DATE
          AND lt."LeaveDate" <= CURRENT_DATE + INTERVAL '14 days'
        ORDER BY lt."LeaveDate" ASC
      `),
    ]);

    return res.json({
      new_hires: newHires.rows,
      offboarded: offboarded.rows,
      mc: mcRecords.rows,
      annual_leave: alRecords.rows,
    });
  } catch (err) {
    return next(err);
  }
});

module.exports = { hrfsRouter: router };