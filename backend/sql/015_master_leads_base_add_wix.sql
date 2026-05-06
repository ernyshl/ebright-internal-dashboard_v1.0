-- 015_master_leads_base_add_wix.sql
--
-- Two changes:
-- 1. Normalize source casing on existing rows: 'meta' → 'Meta', 'tiktok' → 'TikTok'.
--    This matches master_leads_powerbi.lead_source (which the Tally page filter
--    expects) and avoids confusing mixed-case values in the source dropdown.
-- 2. Replace refresh_master_leads_base() with a version that ALSO pulls from
--    raw_wix_leads, covering Trial Class Form / Website / Roadshow / Self
--    Generated Lead / Walk In leads that previously weren't tallied. Each Wix
--    row gets its source set to rw.lead_source verbatim (already proper case).
--
-- Run manually after applying:
--   SELECT * FROM refresh_master_leads_base();
-- Returns one row: (meta_inserted, tiktok_inserted, wix_inserted).

BEGIN;

-- 1) Normalize source casing on existing rows
UPDATE master_leads_base SET source = 'Meta'   WHERE source = 'meta';
UPDATE master_leads_base SET source = 'TikTok' WHERE source = 'tiktok';

-- 2) Replace the refresh function
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

  -- Wix high-water = max across all non-Meta/TikTok sources (Trial Class Form,
  -- Website, Roadshow, Self Generated Lead, Walk In, Others).
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
  -- raw_wix_leads has clean columns, so no JSONB extraction needed. Source
  -- field is set to rw.lead_source verbatim so the Tally dropdown shows the
  -- exact same labels users see in Branch Distribution.
  WITH src AS (
    SELECT
      rw.full_name,
      LOWER(TRIM(rw.email)) AS email,
      rw.phone_number AS phone,
      bm.official_name AS branch,
      rw.lead_source,
      rw.submitted_at AS submission_date
    FROM raw_wix_leads rw
    LEFT JOIN branch_mapping bm ON lower(bm.keyword) = lower(rw.raw_branch_text)
    WHERE rw.submitted_at > w_high
  ), inserted AS (
    INSERT INTO master_leads_base (source, full_name, email, phone, branch, submission_date)
    SELECT lead_source, full_name, email, phone, branch, submission_date
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
