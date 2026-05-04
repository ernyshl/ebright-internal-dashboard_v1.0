-- 009_ghl_stages_opportunity_name.sql
--
-- Switches the ghl_stages dedup key from (email, last_name, stage_key) to
-- (email, opportunity_name, stage_key). Different opportunity names on the
-- same email+stage are now treated as distinct leads — covers the case
-- where a parent registers multiple kids on a shared email and the
-- workflow produces opportunities with different names.
--
-- 1. Add the column.
-- 2. Backfill from last_name (best-effort proxy for the old uniqueness key)
--    so existing rows don't collide on the new unique index.
-- 3. Replace the unique index.

ALTER TABLE ghl_stages
  ADD COLUMN IF NOT EXISTS opportunity_name TEXT;

UPDATE ghl_stages
   SET opportunity_name = COALESCE(
     NULLIF(TRIM(last_name), ''),
     NULLIF(TRIM(student_name), ''),
     ''
   )
 WHERE opportunity_name IS NULL;

DROP INDEX IF EXISTS uq_ghl_stages_email_lastname_stage;

CREATE UNIQUE INDEX IF NOT EXISTS uq_ghl_stages_email_oppname_stage
  ON ghl_stages (email, opportunity_name, stage_key);
