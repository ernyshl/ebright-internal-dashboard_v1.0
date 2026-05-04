-- Add a column for storing the names of frozen students per branch per week.
--
-- One TEXT field, newline-separated names. Keeps the data entry/display flow
-- simple (a textarea in the form, a list in the popup) without forcing a
-- separate students-per-week table.
--
-- HOW TO RUN (one of):
--   psql "$DATABASE_URL" -f backend/sql/008_add_frozen_student_names.sql
--   docker exec -i postgres_leads psql -U optidept -d ebrightleads_db < backend/sql/008_add_frozen_student_names.sql

ALTER TABLE branch_okr_attendance
  ADD COLUMN IF NOT EXISTS frozen_student_names TEXT DEFAULT '' NOT NULL;
