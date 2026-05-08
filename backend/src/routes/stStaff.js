const express = require('express');
const { pool } = require('../db');
const { requireAuth, requireRole } = require('../middleware/auth');

const router = express.Router();
const ALLOWED_ROLES = ['super_admin', 'ceo', 'hr', 'tv'];

// GET /api/st-staff
// Returns each ST staff member from public."BranchStaff" WHERE branch='ST',
// plus two derived fields from AttendanceLogST:
//   • `thumbRegistered` — true iff there is ANY record matching employeeId
//     (i.e. their fingerprint has been enrolled on a scanner).
//   • `lastSeen` — the most recent `date` they appear in the log, or null
//     if they have never scanned. `date` is TEXT in ISO `YYYY-MM-DD` form,
//     so lexical MAX matches chronological MAX.
// Also exposes `role` from BranchStaff (HR-managed; may be NULL).
router.get('/', requireAuth, requireRole(ALLOWED_ROLES), async (_req, res, next) => {
  try {
    const { rows } = await pool.query(
      `SELECT s.id,
              s.name,
              s."employeeId",
              s.branch,
              s.role,
              EXISTS (
                SELECT 1 FROM public."AttendanceLogST" a
                WHERE a."empNo" = s."employeeId"
              ) AS "thumbRegistered",
              (
                SELECT MAX(a.date) FROM public."AttendanceLogST" a
                WHERE a."empNo" = s."employeeId"
              ) AS "lastSeen"
       FROM public."BranchStaff" s
       WHERE s.branch = 'ST'
         -- Hide HR-deactivated staff from the registered list. status is
         -- HR-managed text ('Active' / 'Inactive'); treat NULL/blank as
         -- active so a missing value (e.g. legacy rows) doesn't silently
         -- vanish from the dashboard.
         AND COALESCE(NULLIF(TRIM(s.status), ''), 'Active') ILIKE 'Active'
       ORDER BY s.name ASC`
    );

    return res.json({ records: rows, total: rows.length });
  } catch (err) { return next(err); }
});

module.exports = { stStaffRouter: router };
