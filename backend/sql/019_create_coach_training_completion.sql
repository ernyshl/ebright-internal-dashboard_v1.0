-- 019_create_coach_training_completion.sql
--
-- Per-coach "training confirmed" record for the Coach & BM Performance
-- page. Row exists  ⇒  academy has confirmed the coach completed their
-- 1-week initial training. Row absent  ⇒  not yet confirmed.
-- Toggling the checkbox off DELETEs the row (absence is canonical).
--
-- branch_staff_id references hrfs."BranchStaff".id but no FK constraint
-- because BranchStaff lives in a foreign-data-wrapper schema and
-- cross-schema FKs to FDW tables are not supported (same reason
-- coach_program_completion has no FK).
--
-- One row per coach (PK is branch_staff_id alone) — academy confirms
-- the training as a whole, not per-program.
--
-- The 7-day-since-trainingStartDate gate is enforced server-side
-- (PUT /api/coach-bm-performance/:id/training-completion), not via a
-- CHECK constraint, so the rule can evolve without a migration.

CREATE TABLE IF NOT EXISTS public.coach_training_completion (
  branch_staff_id  INTEGER     PRIMARY KEY,
  confirmed_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  confirmed_by     UUID        REFERENCES public.users(id) ON DELETE SET NULL
);
