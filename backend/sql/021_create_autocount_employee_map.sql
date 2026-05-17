-- 021_create_autocount_employee_map.sql
--
-- Maps Autocount Payroll EmployeeCode (e.g. EBRIGHT001) to hrfs."BranchStaff".id
-- for staff whose leave only ever comes through Autocount Payroll. Those staff's
-- LeaveTransaction.EmployeeName is always NULL — Autocount's leave API does NOT
-- return names, and they've never applied through the HRfS web app (which is
-- what otherwise populates EmployeeName).
--
-- The Annual Leave dashboard tile uses this map to resolve display names,
-- positions and branches. Without it, those staff render as raw codes
-- (e.g. "EBRIGHT001" instead of "KEVIN KHOO KUAN XIONG").
--
-- branchstaff_id references hrfs."BranchStaff".id but no FK constraint —
-- BranchStaff is a foreign-data-wrapper table and cross-schema FKs to FDW
-- tables are not supported (same reason coach_potential_ft_flag etc. omit FK).
--
-- Upkeep: when HR onboards a new exec/CEO/etc. whose leave never goes through
-- the HRfS UI, add a row here. The need will be obvious — their name will
-- appear as a raw Autocount code on the dashboard until the mapping is added.

CREATE TABLE IF NOT EXISTS public.autocount_employee_map (
  autocount_code  TEXT        PRIMARY KEY,
  branchstaff_id  INTEGER     NOT NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Seed rows for the 8 staff identified as of 2026-05-15. Idempotent: existing
-- rows are not touched, so manual edits (e.g. a wrong branchstaff_id fix)
-- survive subsequent boots.
INSERT INTO public.autocount_employee_map (autocount_code, branchstaff_id) VALUES
  ('EBRIGHT001', 277),  -- KEVIN KHOO KUAN XIONG
  ('EBRIGHT54',  301),  -- JANANI A/P SUBRAMANIAM
  ('EBRIGHT50',  275),  -- EZRY EZWAN SHAH BIN AZIZAN
  ('EBRIGHT61',  290),  -- MUHAMMAD AL AMIN BIN JAMIL
  ('INT061',     231),  -- FERRIS FABIANSYAH UMAR (Inactive — leave will still be hidden by status filter)
  ('INT085',     333),  -- YASMIN DAMIA BINTI MOH WADZIR
  ('EBPT165',    153),  -- SORNA SURIA ASOKAN
  ('EBPT146',     94)   -- MUHAMMAD ZAFFRAN FAUZAN BIN LOTFI
ON CONFLICT (autocount_code) DO NOTHING;
