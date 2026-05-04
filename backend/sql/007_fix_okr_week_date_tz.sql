-- Fix mis-stored OKR attendance week_date values caused by a backend TZ bug.
--
-- Until commit 02f6d9f, backend/src/routes/okrAttendance.js#toWednesday()
-- used `Date.toISOString().slice(0, 10)`, which returns the UTC date. On a
-- server running in Asia/Kuala_Lumpur (UTC+8), that turned the intended
-- Monday (e.g. 2026-04-20) into the previous Sunday (2026-04-19) before
-- being inserted into the DB.
--
-- This migration finds every branch_okr_attendance row where week_date
-- lands on a Sunday and shifts it forward by 1 day so it sits on Monday,
-- matching what the user originally intended when they saved the row.
--
-- DOW = 0 in PostgreSQL means Sunday.
--
-- HOW TO RUN (one of):
--   psql "$DATABASE_URL" -f backend/sql/007_fix_okr_week_date_tz.sql
--   docker compose exec -T postgres psql -U <user> -d <db> < backend/sql/007_fix_okr_week_date_tz.sql

BEGIN;

-- Show what will change first (uncomment to preview before committing)
-- SELECT id, branch, week_date, week_date + INTERVAL '1 day' AS new_week_date
-- FROM branch_okr_attendance
-- WHERE EXTRACT(DOW FROM week_date) = 0
-- ORDER BY week_date DESC, branch ASC;

-- Apply the fix: every row sitting on a Sunday is shifted to the next Monday.
-- The unique constraint is on (branch, week_date) so we have to handle the
-- (rare) case where a Monday row already exists for the same branch — we
-- skip those and let the operator merge by hand.
UPDATE branch_okr_attendance AS a
SET week_date = a.week_date + INTERVAL '1 day'
WHERE EXTRACT(DOW FROM a.week_date) = 0
  AND NOT EXISTS (
    SELECT 1 FROM branch_okr_attendance AS b
    WHERE b.branch = a.branch
      AND b.week_date = a.week_date + INTERVAL '1 day'
  );

COMMIT;
