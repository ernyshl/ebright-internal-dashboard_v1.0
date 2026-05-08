-- 017_drop_coach_program_enrollment.sql
--
-- Programs are now derived from BranchStaff.contract; the manual-tick
-- override table from migration 016 is no longer used. Idempotent.

DROP TABLE IF EXISTS public.coach_program_enrollment;
