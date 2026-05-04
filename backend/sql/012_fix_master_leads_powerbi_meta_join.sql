-- 012_fix_master_leads_powerbi_meta_join.sql
--
-- Fix the JOIN-induced double-count in the Meta UNION branch of
-- master_leads_powerbi. The original `bm2` JOIN used ILIKE '%keyword%'
-- against branch_mapping, which produces multiple rows whenever a
-- form_name contains substrings of more than one keyword. Yesterday
-- (2026-05-03 MYT): 20 leads were doubled into 40 rows out of 85 unique,
-- inflating the view to 105 instead of 85.
--
-- Fix: replace the `bm2` JOIN with a LATERAL subquery that returns at
-- most one branch per lead, preferring the most-specific (longest)
-- keyword on tie. Pattern matching semantics are preserved (ILIKE).
--
-- TikTok and Wix UNION branches are intentionally untouched.
--
-- Rollback: re-run backend/sql/_pre-2026-05-04-master_leads_powerbi.sql.

CREATE OR REPLACE VIEW master_leads_powerbi AS
 SELECT 'Meta'::text AS lead_source,
    (((ml.raw_data ->> 'created_time'::text)::timestamp with time zone) AT TIME ZONE 'Asia/Kuala_Lumpur'::text) AS submitted_at,
        CASE
            WHEN ml.form_id::text = ANY (ARRAY['34852175561095929'::character varying::text, '2081747062387420'::character varying::text]) THEN 'Online'::text
            ELSE COALESCE(bm.official_name, bm2.official_name)
        END AS clean_branch,
        CASE
            WHEN ml.form_id::text = ANY (ARRAY['34852175561095929'::character varying::text, '2081747062387420'::character varying::text]) THEN 'Region C'::text
            ELSE COALESCE(bm.region, bm2.region)
        END AS region,
    1 AS sibling_index
   FROM meta_leads ml
     LEFT JOIN branch_mapping bm ON lower(bm.keyword) = lower(( SELECT (fd.value -> 'values'::text) ->> 0
           FROM jsonb_array_elements(ml.raw_data -> 'field_data'::text) fd(value)
          WHERE (fd.value ->> 'name'::text) ~~* '%branch%'::text
         LIMIT 1))
     LEFT JOIN LATERAL (
       SELECT official_name, region
       FROM branch_mapping
       WHERE lower(ml.form_name) ~~* ('%' || lower(keyword) || '%')
       ORDER BY length(keyword) DESC
       LIMIT 1
     ) bm2 ON true
UNION ALL
 SELECT 'TikTok'::text AS lead_source,
        CASE
            WHEN length(sp.raw_data ->> 'created_time'::text) >= 19 THEN (("left"(sp.raw_data ->> 'created_time'::text, 19)::timestamp without time zone AT TIME ZONE 'UTC'::text) AT TIME ZONE 'Asia/Kuala_Lumpur'::text)
            ELSE sp.created_at
        END AS submitted_at,
    COALESCE(bm.official_name,
        CASE
            WHEN (sp.raw_data ->> 'Please Select Your Preferred Day'::text) ~~* 'Online%'::text THEN 'Online'::text
            WHEN (sp.raw_data ->> 'Sila Pilih Hari Anda'::text) ~~* 'Online%'::text THEN 'Online'::text
            ELSE NULL::text
        END) AS clean_branch,
    COALESCE(bm.region,
        CASE
            WHEN (sp.raw_data ->> 'Please Select Your Preferred Day'::text) ~~* 'Online%'::text THEN 'Region 3'::text
            WHEN (sp.raw_data ->> 'Sila Pilih Hari Anda'::text) ~~* 'Online%'::text THEN 'Region 3'::text
            ELSE NULL::text
        END) AS region,
    1 AS sibling_index
   FROM social_posts sp
     LEFT JOIN branch_mapping bm ON lower(bm.keyword) = lower(COALESCE(sp.raw_data ->> 'Please choose your preferred branch'::text, sp.raw_data ->> 'Sila pilih cawangan pilihan anda'::text))
  WHERE sp.platform::text = 'tiktok_lead'::text
UNION ALL
 SELECT rw.lead_source,
    rw.submitted_at::timestamp without time zone AS submitted_at,
    bm.official_name AS clean_branch,
    bm.region,
    gs.gs AS sibling_index
   FROM raw_wix_leads rw
     CROSS JOIN LATERAL generate_series(1, GREATEST(COALESCE(rw.children_count, 1), 1)) gs(gs)
     LEFT JOIN branch_mapping bm ON lower(bm.keyword) = lower(rw.raw_branch_text);

-- ─── Verification ───────────────────────────────────────────────────────────
-- After applying, run these to confirm:
--
--   -- Yesterday's Meta count in the view (was 105, expect ~85):
--   SELECT COUNT(*)
--   FROM master_leads_powerbi
--   WHERE lead_source = 'Meta'
--     AND submitted_at::date = (NOW() AT TIME ZONE 'Asia/Kuala_Lumpur')::date - 1;
--
--   -- Confirm no remaining duplicates:
--   WITH dups AS (
--     SELECT clean_branch, region, submitted_at, COUNT(*) AS dup_count
--     FROM master_leads_powerbi
--     WHERE lead_source = 'Meta'
--       AND submitted_at::date = (NOW() AT TIME ZONE 'Asia/Kuala_Lumpur')::date - 1
--     GROUP BY clean_branch, region, submitted_at
--   )
--   SELECT COUNT(*) FILTER (WHERE dup_count > 1) AS dup_groups
--   FROM dups;
--   -- expect 0
