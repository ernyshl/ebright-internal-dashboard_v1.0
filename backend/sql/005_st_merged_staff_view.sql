-- 005_st_merged_staff_view.sql
--
-- Read-only views that expose a unified ST staff list joined to attendance.
-- Run AFTER `migrate-st-staff.js backfill --apply` (so all 9 ST staff exist
-- in BranchStaff). Re-run after `drop --apply` is fine — the views only
-- reference BranchStaff, never BranchStaffST.
--
-- These views only exist in databases that have ST infrastructure
-- (public."AttendanceLogST" + public."BranchStaff") — i.e. the legacy
-- ebright_hrfs DB. The guard makes this script a no-op against any other DB
-- (e.g. ebrightleads_db where the team's main pool now points), so the
-- startup migration loop doesn't crash on databases that don't host ST.
--
-- Columns:
--   empNo     — AttendanceLogST.empNo (the scanner-side identifier)
--   fullname  — BranchStaff.name (NULL when no match exists)
--   role      — BranchStaff.role
--   branch    — BranchStaff.branch

DO $$
BEGIN
  IF EXISTS (
       SELECT 1 FROM information_schema.tables
       WHERE table_schema = 'public' AND table_name = 'AttendanceLogST'
     )
     AND EXISTS (
       SELECT 1 FROM information_schema.tables
       WHERE table_schema = 'public' AND table_name = 'BranchStaff'
     )
  THEN
    EXECUTE $view$
      CREATE OR REPLACE VIEW public."v_st_attendance_with_staff" AS
      SELECT DISTINCT
        a."empNo",
        bs.name   AS fullname,
        bs.role   AS role,
        bs.branch AS branch
      FROM public."AttendanceLogST" a
      LEFT JOIN public."BranchStaff" bs ON bs."employeeId" = a."empNo"
    $view$;

    EXECUTE $view$
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
      LEFT JOIN public."BranchStaff" bs ON bs."employeeId" = a."empNo"
    $view$;
  END IF;
END
$$;
