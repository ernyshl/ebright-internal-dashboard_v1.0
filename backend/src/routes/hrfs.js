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

    const [today, yesterday] = await Promise.all([
      fetchDay(`(NOW() AT TIME ZONE 'Asia/Kuala_Lumpur')::date`),
      fetchDay(`(NOW() AT TIME ZONE 'Asia/Kuala_Lumpur')::date - 1`),
    ]);

    return res.json({ today, yesterday, branches });
  } catch (err) { return next(err); }
});

// GET /api/hrfs/branch-staff
router.get('/branch-staff', requireAuth, requireRole(ALLOWED_ROLES), async (req, res, next) => {
  try {
    const { search = '', status = '', department = '', position = '', page = 1, limit = 50 } = req.query;
    const conditions = []; const params = []; let idx = 1;

    if (search) {
      conditions.push(`("name" ILIKE $${idx} OR "nickname" ILIKE $${idx} OR "nric" ILIKE $${idx} OR "email" ILIKE $${idx})`);
      params.push(`%${search}%`); idx++;
    }
    if (status) { conditions.push(`"status" = $${idx++}`); params.push(status); }
    if (department) { conditions.push(`"department" ILIKE $${idx++}`); params.push(`%${department}%`); }
    if (position) { conditions.push(`"position" ILIKE $${idx++}`); params.push(`%${position}%`); }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    const offset = (Number(page) - 1) * Number(limit);

    const [countResult, dataResult] = await Promise.all([
      pool.query(`SELECT COUNT(*) FROM hrfs."BranchStaff" ${where}`, params),
      pool.query(
        `SELECT id, "name", "nickname", "nric", "email", "phone", "role",
                "branch", "department", "position", "status", employment_type,
                start_date, "endDate", "dob", "age", "gender", "nationality",
                home_address, "residential", "location", "university",
                emergency_name, emergency_phone, emergency_relation,
                signed_date, "probation", "rate", "employeeId",
                "accessStatus", "bank", bank_name, bank_account,
                "contract", "createdAt", "updatedAt"
         FROM hrfs."BranchStaff" ${where}
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

    const [newHires, offboarded, mcRecords, alRecords] = await Promise.all([
      pool.query(`
        SELECT id, name, position, branch, "employeeId", "createdAt", "updatedAt"
        FROM hrfs."BranchStaff"
        WHERE status = 'Active'
          AND "createdAt" >= NOW() - INTERVAL '30 days'
        ORDER BY "createdAt" DESC
      `),
      pool.query(`
        SELECT id, name, position, branch, "employeeId", "createdAt", "updatedAt"
        FROM hrfs."BranchStaff"
        WHERE status = 'Inactive'
          AND "updatedAt" >= NOW() - INTERVAL '30 days'
        ORDER BY "updatedAt" DESC
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