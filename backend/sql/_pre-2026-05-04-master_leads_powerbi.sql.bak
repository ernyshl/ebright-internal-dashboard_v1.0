-- Snapshot of master_leads_powerbi BEFORE the 2026-05-04 Meta-JOIN dedup fix.
-- Run this file as-is to revert the change. Captured via:
--   pg_get_viewdef('master_leads_powerbi'::regclass, true)
-- on 2026-05-04.

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
     LEFT JOIN branch_mapping bm2 ON lower(ml.form_name) ~~* (('%'::text || lower(bm2.keyword)) || '%'::text)
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
