-- 020_create_coach_potential_ft_flag.sql
--
-- Per-coach "potential FT Coach" flag for the Coach & BM Performance
-- page. Row exists  ⇒  academy has flagged this PT Coach as a candidate
-- for FT promotion. Row absent  ⇒  not flagged.
-- Toggling the checkbox off DELETEs the row (absence is canonical).
--
-- branch_staff_id references hrfs."BranchStaff".id but no FK constraint
-- because BranchStaff lives in a foreign-data-wrapper schema and
-- cross-schema FKs to FDW tables are not supported (same reason
-- coach_training_completion and coach_program_completion omit theirs).
--
-- The "PT - Coach only" rule is enforced server-side (PUT endpoint),
-- not via a CHECK constraint, so the rule can evolve without a
-- migration.

CREATE TABLE IF NOT EXISTS public.coach_potential_ft_flag (
  branch_staff_id  INTEGER     PRIMARY KEY,
  flagged_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  flagged_by       UUID        REFERENCES public.users(id) ON DELETE SET NULL
);
