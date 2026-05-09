-- 018_create_coach_program_completion.sql
--
-- Per-(coach, program) completion records for the Coach & BM Performance
-- page. Row exists  ⇒  the coach has completed that program.
-- Row absent      ⇒  not completed.
-- Toggling a checkbox off DELETEs the row rather than setting a flag,
-- so absence is the canonical "not completed" state.
--
-- branch_staff_id references hrfs."BranchStaff".id but no FK constraint
-- because BranchStaff lives in a foreign-data-wrapper schema and
-- cross-schema FKs to FDW tables are not supported.
--
-- `program` is a free-text label that must match the program names
-- emitted by the GET / endpoint's CASE expression: 'CCP', 'Weekly
-- Training', 'Toastmasters', 'TPRR', 'ATCL Diploma'. Validation is
-- enforced server-side, not via a CHECK constraint, so future
-- additions don't require a migration.

CREATE TABLE IF NOT EXISTS public.coach_program_completion (
  branch_staff_id  INTEGER     NOT NULL,
  program          TEXT        NOT NULL,
  completed_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_by     UUID        REFERENCES public.users(id) ON DELETE SET NULL,
  PRIMARY KEY (branch_staff_id, program)
);

CREATE INDEX IF NOT EXISTS idx_coach_program_completion_program
  ON public.coach_program_completion (program);
