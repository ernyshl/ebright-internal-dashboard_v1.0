-- 022_seed_autocount_employee_map_extra.sql
--
-- Additional autocount_code -> branchstaff_id mappings discovered on
-- 2026-05-21 after broadening the MC dashboard to non-AL leave types
-- (SL/UL/CL/HDL). These 4 staff have BranchStaff rows but their
-- LeaveTransaction rows always arrive with EmployeeName NULL, so the
-- name-match fallback in /api/hr-mc/dashboard couldn't resolve them
-- and they rendered as raw codes ("EBPT216" etc.) on the dashboard.
--
-- Each mapping was verified by cross-referencing AutoCount Payroll's
-- /OpenAPIEmployeeMaintenance/GetEmployeesList against
-- hrfs."BranchStaff".name; all 4 are Active.
--
-- Idempotent via ON CONFLICT DO NOTHING — safe to re-run on every boot.

INSERT INTO public.autocount_employee_map (autocount_code, branchstaff_id) VALUES
  ('EBPT117',  85),   -- INTAN NUR SYUHADAH BINTI ESA
  ('EBPT178', 272),   -- ARYNA AMIRA BINTI KHAIRUL AMRAN
  ('EBPT187', 211),   -- ROZAIDI BIN MOHD RAZIF
  ('EBPT216', 341)    -- NURUL AININ ARISYA BINTI MOHD SABRI
ON CONFLICT (autocount_code) DO NOTHING;
