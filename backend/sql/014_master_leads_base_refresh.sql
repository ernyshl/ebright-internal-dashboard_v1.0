-- 014_master_leads_base_refresh.sql
--
-- Defines refresh_master_leads_base() — incrementally inserts new Meta and
-- TikTok leads from the live raw tables (meta_leads, social_posts) into
-- master_leads_base. Idempotent: only inserts rows whose submission_date is
-- newer than the current per-source max in master_leads_base, with a defensive
-- NOT EXISTS check on (source, email, submission_date).
--
-- Why this exists: master_leads_base stopped getting new rows on 2026-01-16.
-- The Tally / by-source endpoints (backend/src/routes/ghlStages.js) read from
-- it via LEADS_SRC and were returning 0 leads for any "today" filter. Rather
-- than touch the consumers, we top up the table from the still-fresh raw
-- sources on a cron schedule.
--
-- Run manually:
--   SELECT * FROM refresh_master_leads_base();
-- Returns one row: (meta_inserted, tiktok_inserted).

CREATE OR REPLACE FUNCTION refresh_master_leads_base()
RETURNS TABLE(meta_inserted bigint, tiktok_inserted bigint) AS $$
DECLARE
  m_high timestamptz;
  t_high timestamptz;
  m_count bigint;
  t_count bigint;
BEGIN
  SELECT COALESCE(MAX(submission_date), 'epoch'::timestamptz)
    INTO m_high FROM master_leads_base WHERE source = 'meta';

  SELECT COALESCE(MAX(submission_date), 'epoch'::timestamptz)
    INTO t_high FROM master_leads_base WHERE source = 'tiktok';

  -- ─── Meta side ────────────────────────────────────────────────────────────
  WITH src AS (
    SELECT
      ml.id AS ml_id,
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
    SELECT 'meta', full_name, email, phone, branch, submission_date
    FROM src
    WHERE email IS NOT NULL AND email <> ''
      AND NOT EXISTS (
        SELECT 1 FROM master_leads_base mlb
        WHERE mlb.source = 'meta'
          AND mlb.email = src.email
          AND mlb.submission_date = src.submission_date
      )
    RETURNING 1
  )
  SELECT COUNT(*) INTO m_count FROM inserted;

  -- ─── TikTok side ──────────────────────────────────────────────────────────
  -- TikTok's created_time is non-standard: "2026-05-05 06:11:56(UTC+00:00)".
  -- Take the first 19 chars and treat as UTC (mirrors master_leads_powerbi).
  WITH src AS (
    SELECT
      sp.id AS sp_id,
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
    SELECT 'tiktok', full_name, email, phone, branch, submission_date
    FROM filtered
    WHERE email IS NOT NULL AND email <> ''
      AND NOT EXISTS (
        SELECT 1 FROM master_leads_base mlb
        WHERE mlb.source = 'tiktok'
          AND mlb.email = filtered.email
          AND mlb.submission_date = filtered.submission_date
      )
    RETURNING 1
  )
  SELECT COUNT(*) INTO t_count FROM inserted;

  RETURN QUERY SELECT m_count, t_count;
END;
$$ LANGUAGE plpgsql;
