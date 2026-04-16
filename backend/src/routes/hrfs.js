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
    if (date_from) { conditions.push(`"date" >= $${idx++}::date`); params.push(date_from); }
    if (date_to) { conditions.push(`"date" <= $${idx++}::date`); params.push(date_to); }

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

// GET /api/hrfs/attendance-dashboard — summary for dashboard cards
router.get('/attendance-dashboard', requireAuth, requireRole(ALLOWED_ROLES), async (_req, res, next) => {
  try {
    const { rows } = await pool.query(`
      SELECT
        date,
        "empNo",
        "empName",
        "clockInTime",
        "clockOutTime",
        CASE WHEN "clockInTime" IS NOT NULL AND "clockInTime" > '09:00:00' THEN true ELSE false END AS is_late
      FROM hrfs."AttendanceLog"
      WHERE date >= CURRENT_DATE - 1 AND date <= CURRENT_DATE
      ORDER BY date DESC, "clockInTime" ASC
    `);

    const today = new Date().toISOString().split('T')[0];
    const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0];

    const todayRecords = rows.filter(r => r.date && r.date.toISOString().split('T')[0] === today);
    const yesterdayRecords = rows.filter(r => r.date && r.date.toISOString().split('T')[0] === yesterday);

    const summarize = (records) => ({
      total: records.length,
      on_time: records.filter(r => !r.is_late && r.clockInTime).length,
      late: records.filter(r => r.is_late).length,
      no_clock_in: records.filter(r => !r.clockInTime).length,
      no_clock_out: records.filter(r => r.clockInTime && !r.clockOutTime).length,
      records: records.map(r => ({
        empNo: r.empNo,
        empName: r.empName,
        clockIn: r.clockInTime ? String(r.clockInTime).slice(0, 5) : null,
        clockOut: r.clockOutTime ? String(r.clockOutTime).slice(0, 5) : null,
        isLate: r.is_late,
      })),
    });

    return res.json({
      today: summarize(todayRecords),
      yesterday: summarize(yesterdayRecords),
    });
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
                "branch", "department", "position", "status", "employmentType",
                "startDate", "endDate", "dob", "age", "gender", "nationality",
                "homeAddress", "residential", "location", "university",
                "emergencyName", "emergencyPhone", "emergencyRelation",
                "signedDate", "probation", "rate", "employeeId",
                "accessStatus", "createdAt", "updatedAt"
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
      conditions.push(`(lt."EmployeeCode" ILIKE $${idx} OR bs."name" ILIKE $${idx})`);
      params.push(`%${search}%`); idx++;
    }
    if (status) { conditions.push(`lt."ApplyStatus" = $${idx++}`); params.push(status); }
    if (leave_type) { conditions.push(`lt."LeaveTypeCode" = $${idx++}`); params.push(leave_type); }
    if (date_from) { conditions.push(`lt."ApplyDate" >= $${idx++}::date`); params.push(date_from); }
    if (date_to) { conditions.push(`lt."ApplyDate" <= $${idx++}::date`); params.push(date_to); }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    const offset = (Number(page) - 1) * Number(limit);

    const [countResult, dataResult] = await Promise.all([
      pool.query(`SELECT COUNT(*) FROM hrfs."LeaveTransaction" lt LEFT JOIN hrfs."BranchStaff" bs ON lt."EmployeeCode" = bs."employeeId" ${where}`, params),
      pool.query(
        `SELECT lt.id, lt."EmployeeCode", lt."LeaveTypeCode", lt."LeaveTransId",
                lt."ApplyDate", lt."ApplyReason", lt."ApplyStatus", lt."Attachment",
                lt."DayNo", lt."HourNo", lt."Days", lt."Source", lt."LeaveAdjustmentId",
                lt."LeaveDate", lt."FromTime", lt."ToTime", lt."IsHourly", lt."IsAdjustment",
                lt."LeaveCreditId", lt."ActionRemark", lt."RequiredThirdParty",
                lt."WorkingHours", lt."created_at",
                bs."name" AS employee_name, bs."department", bs."branch"
         FROM hrfs."LeaveTransaction" lt
         LEFT JOIN hrfs."BranchStaff" bs ON lt."EmployeeCode" = bs."employeeId"
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

module.exports = { hrfsRouter: router };