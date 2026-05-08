const express = require('express');
const { pool } = require('../db');
const { requireAuth, requireRole } = require('../middleware/auth');

const router = express.Router();
const ALLOWED_ROLES = ['super_admin', 'ceo', 'hr', 'tv'];

// GET /api/st-attendance
// Query params (all optional):
//   ?date=YYYY-MM-DD                       — single-day filter (legacy)
//   ?startDate=YYYY-MM-DD&endDate=YYYY-MM-DD — inclusive date range
// If both range and single-date are provided, the range wins.
router.get('/', requireAuth, requireRole(ALLOWED_ROLES), async (req, res, next) => {
  try {
    const { date = '', startDate = '', endDate = '' } = req.query;
    const conditions = []; const params = []; let idx = 1;

    if (startDate && endDate) {
      conditions.push(`"date"::date BETWEEN $${idx}::date AND $${idx + 1}::date`);
      params.push(startDate, endDate); idx += 2;
    } else if (date) {
      conditions.push(`"date"::date = $${idx++}::date`);
      params.push(date);
    }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

    // LEFT JOIN BranchStaff so attendance rows are enriched with HR-managed
    // `fullname`, `branch`, `role`. The subquery uses DISTINCT ON ("employeeId")
    // so even if BranchStaff has accidental duplicates on employeeId, each
    // attendance row joins to AT MOST ONE BranchStaff row — preventing the
    // JOIN-fanout that would otherwise duplicate attendance rows in the
    // result set. Tie-break: lowest BranchStaff.id wins (stable, deterministic).
    // Walk-up scans whose empNo isn't a registered staff member (e.g. "10000001",
    // "2", "3") keep their AttendanceLogST.empName via COALESCE.
    const { rows } = await pool.query(
      `SELECT a.id, a.date, a."empNo", a."empName",
              a."clockInTime", a."clockOutTime",
              a."clockInSerialNo", a."clockOutSerialNo", a."createdAt",
              COALESCE(bs.name, a."empName") AS fullname,
              bs.branch                      AS branch,
              bs.role                        AS role
       FROM public."AttendanceLogST" a
       LEFT JOIN (
         SELECT DISTINCT ON ("employeeId") "employeeId", name, branch, role, id
         FROM public."BranchStaff"
         WHERE "employeeId" IS NOT NULL
         ORDER BY "employeeId", id ASC
       ) bs ON bs."employeeId" = a."empNo"
       ${where ? where.replace(/"date"/g, 'a."date"') : ''}
       ORDER BY a.date DESC, a."clockInTime" ASC NULLS LAST, a."createdAt" ASC`,
      params
    );

    return res.json({ records: rows, total: rows.length });
  } catch (err) { return next(err); }
});

module.exports = { stAttendanceRouter: router };
