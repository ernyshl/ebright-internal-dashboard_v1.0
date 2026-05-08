-- 016_create_coach_program_enrollment.sql
--
-- Stores program-enrollment ticks (Weekly Training, ATCL Diploma,
-- Toastmasters) for coaches and Branch Managers, displayed on the
-- /coach-bm-performance page.
--
-- branch_staff_id references hrfs."BranchStaff".id but no FK constraint
-- because BranchStaff lives in a foreign-data-wrapper schema and
-- cross-schema FKs to FDW tables are not supported.
--
-- DURABILITY NOTE: if HR ever rebuilds the foreign table from scratch
-- with new ids, every enrollment row orphans. If that happens, write a
-- one-time migration that maps old → new ids by (nickname, nric) before
-- the rebuild.

CREATE TABLE IF NOT EXISTS coach_program_enrollment (
  branch_staff_id  INTEGER     PRIMARY KEY,
  weekly_training  BOOLEAN     NOT NULL DEFAULT FALSE,
  atcl_diploma     BOOLEAN     NOT NULL DEFAULT FALSE,
  toastmasters     BOOLEAN     NOT NULL DEFAULT FALSE,
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_by       INTEGER
);

CREATE INDEX IF NOT EXISTS idx_coach_program_updated_at
  ON coach_program_enrollment (updated_at DESC);
