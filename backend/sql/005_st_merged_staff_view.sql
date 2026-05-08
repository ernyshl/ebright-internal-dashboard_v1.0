-- 005_st_merged_staff_view.sql
--
-- Read-only view that exposes a unified staff list joined to attendance.
-- Run AFTER `migrate-st-staff.js backfill --apply` (so all 9 ST staff exist
-- in BranchStaff). Re-run after `drop --apply` is fine — the view only
-- references BranchStaff, never BranchStaffST.
--
-- Columns:
--   empNo     — AttendanceLogST.empNo (the scanner-side identifier)
--   fullname  — BranchStaff.name (NULL when no match exists, e.g. "Unknown" empNos like '2', '10000001')
--   role      — BranchStaff.role (NULL until HR fills it in)
--   branch    — BranchStaff.branch
--
-- Note: AttendanceLogST has rows whose empNo doesn't match any BranchStaff
-- (the "Unknown" walk-up scans). LEFT JOIN preserves them with NULL fullname.

CREATE OR REPLACE VIEW public."v_st_attendance_with_staff" AS
SELECT DISTINCT
  a."empNo",
  bs.name   AS fullname,
  bs.role   AS role,
  bs.branch AS branch
FROM public."AttendanceLogST" a
LEFT JOIN public."BranchStaff" bs ON bs."employeeId" = a."empNo";

-- If you also want a row-level enriched attendance feed (one row per scan,
-- not one per empNo), use this companion view. Used by /api/st-attendance
-- if/when you migrate it off the manual JOIN.
CREATE OR REPLACE VIEW public."v_st_attendance_log_enriched" AS
SELECT
  a.id,
  a.date,
  a."empNo",
  a."empName",
  a."clockInTime",
  a."clockOutTime",
  a."clockInSerialNo",
  a."clockOutSerialNo",
  a."createdAt",
  a."updatedAt",
  COALESCE(bs.name, a."empName") AS fullname,
  bs.role                        AS role,
  bs.branch                      AS branch
FROM public."AttendanceLogST" a
LEFT JOIN public."BranchStaff" bs ON bs."employeeId" = a."empNo";
