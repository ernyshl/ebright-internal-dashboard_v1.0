-- 016_master_leads_base_add_children.sql
--
-- Two changes:
-- 1. Add children_details (jsonb, nullable) column to master_leads_base.
--    Meta and TikTok rows will remain NULL. Wix rows carry the child array
--    from raw_wix_leads.children_details verbatim.
-- 2. Replace refresh_master_leads_base() to include children_details when
--    inserting Wix rows, and backfill existing Wix rows that are missing it.
--
-- Run manually after applying:
--   SELECT * FROM refresh_master_leads_base();
-- Returns one row: (meta_inserted, tiktok_inserted, wix_inserted).

BEGIN;

-- 1) Add children_details column (safe to run twice — IF NOT EXISTS)
ALTER TABLE master_leads_base
  ADD COLUMN IF NOT EXISTS children_details jsonb;

-- 2) Backfill existing Wix rows that are missing children_details.
--    Match on email + submission_date (same dedup key used during insert).
UPDATE master_leads_base mlb
SET children_details = rw.children_details::jsonb
FROM raw_wix_leads rw
WHERE mlb.source NOT IN ('Meta', 'TikTok')
  AND lower(trim(mlb.email))  = lower(trim(rw.email))
  AND mlb.submission_date     = rw.submitted_at
  AND mlb.children_details IS NULL
  AND rw.children_details IS NOT NULL
  AND rw.children_details <> '[]';

-- 3) Replace the refresh function
DROP FUNCTION IF EXISTS refresh_master_leads_base();

CREATE OR REPLACE FUNCTION refresh_master_leads_base()
RETURNS TABLE(meta_inserted bigint, tiktok_inserted bigint, wix_inserted bigint) AS $$
DECLARE
  m_high timestamptz;
  t_high timestamptz;
  w_high timestamptz;
  m_count bigint;
  t_count bigint;
  w_count bigint;
BEGIN
  SELECT COALESCE(MAX(submission_date), 'epoch'::timestamptz)
    INTO m_high FROM master_leads_base WHERE source = 'Meta';

  SELECT COALESCE(MAX(submission_date), 'epoch'::timestamptz)
    INTO t_high FROM master_leads_base WHERE source = 'TikTok';

  -- Wix high-water = max across all non-Meta/TikTok sources.
  SELECT COALESCE(MAX(submission_date), 'epoch'::timestamptz)
    INTO w_high FROM master_leads_base WHERE source NOT IN ('Meta', 'TikTok');

  -- ─── Meta ─────────────────────────────────────────────────────────────────
  WITH src AS (
    SELECT
      (SELECT (fd.value -> 'values') ->> 0
         FROM jsonb_array_elements(ml.raw_data -> 'field_data') fd
        WHERE fd.value ->> 'name' ~~* '%full_name%' OR fd.value ->> 'name' = 'name'
        LIMIT 1) AS full_name,
      LOWER(TRIM((SELECT (fd.value -> 'values') ->> 0
         FROM jsonb_array_elements(ml.raw_data -> 'field_data') fd
        WHERE fd.value ->> 'name' ~~* '%email%'
        LIMIT 1))) AS email,
      (SELECT (fd.value -> 'values') ->> 0
         FROM jsonb_array_elements(ml.raw_data -> 'field_data') fd
        WHERE fd.value ->> 'name' ~~* '%phone%'
        LIMIT 1) AS phone,
      CASE
        WHEN ml.form_id::text = ANY (ARRAY['34852175561095929', '2081747062387420'])
          THEN 'Online'
        ELSE COALESCE(bm.official_name, bm2.official_name)
      END AS branch,
      (ml.raw_data ->> 'created_time')::timestamptz AS submission_date
    FROM meta_leads ml
    LEFT JOIN branch_mapping bm ON lower(bm.keyword) = lower((
      SELECT (fd.value -> 'values') ->> 0
        FROM jsonb_array_elements(ml.raw_data -> 'field_data') fd
       WHERE fd.value ->> 'name' ~~* '%branch%'
       LIMIT 1))
    LEFT JOIN LATERAL (
      SELECT official_name, region
      FROM branch_mapping
      WHERE lower(ml.form_name) ~~* ('%' || lower(keyword) || '%')
      ORDER BY length(keyword) DESC
      LIMIT 1
    ) bm2 ON true
    WHERE (ml.raw_data ->> 'created_time')::timestamptz > m_high
  ), inserted AS (
    INSERT INTO master_leads_base (source, full_name, email, phone, branch, submission_date)
    SELECT 'Meta', full_name, email, phone, branch, submission_date
    FROM src
    WHERE email IS NOT NULL AND email <> ''
      AND NOT EXISTS (
        SELECT 1 FROM master_leads_base mlb
        WHERE mlb.source = 'Meta'
          AND mlb.email = src.email
          AND mlb.submission_date = src.submission_date
      )
    RETURNING 1
  )
  SELECT COUNT(*) INTO m_count FROM inserted;

  -- ─── TikTok ───────────────────────────────────────────────────────────────
  WITH src AS (
    SELECT
      sp.raw_data ->> 'Name' AS full_name,
      LOWER(TRIM(sp.raw_data ->> 'Email')) AS email,
      sp.raw_data ->> 'Phone number' AS phone,
      COALESCE(
        bm.official_name,
        CASE
          WHEN sp.raw_data ->> 'Please Select Your Preferred Day' ~~* 'Online%' THEN 'Online'
          WHEN sp.raw_data ->> 'Sila Pilih Hari Anda' ~~* 'Online%' THEN 'Online'
          ELSE NULL
        END
      ) AS branch,
      CASE
        WHEN length(sp.raw_data ->> 'created_time') >= 19
          THEN ("left"(sp.raw_data ->> 'created_time', 19)::timestamp AT TIME ZONE 'UTC')
        ELSE sp.created_at::timestamptz
      END AS submission_date
    FROM social_posts sp
    LEFT JOIN branch_mapping bm ON lower(bm.keyword) = lower(COALESCE(
      sp.raw_data ->> 'Please choose your preferred branch',
      sp.raw_data ->> 'Sila pilih cawangan pilihan anda'
    ))
    WHERE sp.platform::text = 'tiktok_lead'
  ), filtered AS (
    SELECT * FROM src WHERE submission_date > t_high
  ), inserted AS (
    INSERT INTO master_leads_base (source, full_name, email, phone, branch, submission_date)
    SELECT 'TikTok', full_name, email, phone, branch, submission_date
    FROM filtered
    WHERE email IS NOT NULL AND email <> ''
      AND NOT EXISTS (
        SELECT 1 FROM master_leads_base mlb
        WHERE mlb.source = 'TikTok'
          AND mlb.email = filtered.email
          AND mlb.submission_date = filtered.submission_date
      )
    RETURNING 1
  )
  SELECT COUNT(*) INTO t_count FROM inserted;

  -- ─── Wix (Trial Class Form / Website / Roadshow / SGL / Walk In / Others) ─
  WITH src AS (
    SELECT
      rw.full_name,
      LOWER(TRIM(rw.email)) AS email,
      rw.phone_number AS phone,
      bm.official_name AS branch,
      rw.lead_source,
      rw.submitted_at AS submission_date,
      CASE
        WHEN rw.children_details IS NOT NULL AND rw.children_details <> '[]'
          THEN rw.children_details::jsonb
        ELSE NULL
      END AS children_details
    FROM raw_wix_leads rw
    LEFT JOIN branch_mapping bm ON lower(bm.keyword) = lower(rw.raw_branch_text)
    WHERE rw.submitted_at > w_high
  ), inserted AS (
    INSERT INTO master_leads_base (source, full_name, email, phone, branch, submission_date, children_details)
    SELECT lead_source, full_name, email, phone, branch, submission_date, children_details
    FROM src
    WHERE email IS NOT NULL AND email <> ''
      AND lead_source IS NOT NULL AND lead_source <> ''
      AND NOT EXISTS (
        SELECT 1 FROM master_leads_base mlb
        WHERE mlb.source = src.lead_source
          AND mlb.email = src.email
          AND mlb.submission_date = src.submission_date
      )
    RETURNING 1
  )
  SELECT COUNT(*) INTO w_count FROM inserted;

  RETURN QUERY SELECT m_count, t_count, w_count;
END;
$$ LANGUAGE plpgsql;

COMMIT;
