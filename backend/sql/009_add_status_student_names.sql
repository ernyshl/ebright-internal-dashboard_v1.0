-- Add per-status student name columns. Companion to 008_add_frozen_student_names.sql.
-- Each column is newline-separated names. Filled by parsing the user's pasted
-- Excel roster (one row per student: "Name <tab/spaces> status").

ALTER TABLE branch_okr_attendance
  ADD COLUMN IF NOT EXISTS attended_student_names TEXT DEFAULT '' NOT NULL,
  ADD COLUMN IF NOT EXISTS absent_student_names   TEXT DEFAULT '' NOT NULL,
  ADD COLUMN IF NOT EXISTS replaced_student_names TEXT DEFAULT '' NOT NULL;
