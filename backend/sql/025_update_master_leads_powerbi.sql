-- Add wix_trial_form_leads + google_ads_leads to master_leads_powerbi.
-- Also apply recruitment form filter to Meta arm (exclude COACH / PT forms).
CREATE OR REPLACE VIEW crm.master_leads_powerbi AS
  SELECT 'Meta'::text AS lead_source,
    (((ml.raw_data->>'created_time')::timestamptz) AT TIME ZONE 'Asia/Kuala_Lumpur') AS submitted_at,
    CASE
      WHEN ml.form_id::text = ANY (ARRAY['34852175561095929','2081747062387420']) THEN 'Online'::text
      ELSE COALESCE(bm.official_name, bm2.official_name)
    END AS clean_branch,
    CASE
      WHEN ml.form_id::text = ANY (ARRAY['34852175561095929','2081747062387420']) THEN 'Region C'::text
      ELSE COALESCE(bm.region, bm2.region)
    END AS region,
    1 AS sibling_index
  FROM meta_leads ml
  LEFT JOIN branch_mapping bm
    ON lower(bm.keyword) = lower((
      SELECT (fd.value->'values')->>0
      FROM jsonb_array_elements(ml.raw_data->'field_data') fd
      WHERE (fd.value->>'name') ILIKE '%branch%'
      LIMIT 1
    ))
  LEFT JOIN branch_mapping bm2
    ON lower(ml.form_name) ILIKE ('%' || lower(bm2.keyword) || '%')
  WHERE ml.form_name NOT ILIKE '%COACH%'
    AND ml.form_name NOT ILIKE '% PT %'

  UNION ALL

  SELECT 'TikTok'::text AS lead_source,
    CASE
      WHEN length(sp.raw_data->>'created_time') >= 19
      THEN ((left(sp.raw_data->>'created_time', 19)::timestamp AT TIME ZONE 'UTC') AT TIME ZONE 'Asia/Kuala_Lumpur')
      ELSE sp.created_at::timestamp
    END AS submitted_at,
    COALESCE(bm.official_name,
      CASE
        WHEN (sp.raw_data->>'Please Select Your Preferred Day') ILIKE 'Online%' THEN 'Online'::text
        WHEN (sp.raw_data->>'Sila Pilih Hari Anda') ILIKE 'Online%' THEN 'Online'::text
        ELSE NULL::text
      END) AS clean_branch,
    COALESCE(bm.region,
      CASE
        WHEN (sp.raw_data->>'Please Select Your Preferred Day') ILIKE 'Online%' THEN 'Region 3'::text
        WHEN (sp.raw_data->>'Sila Pilih Hari Anda') ILIKE 'Online%' THEN 'Region 3'::text
        ELSE NULL::text
      END) AS region,
    1 AS sibling_index
  FROM crm.social_posts sp
  LEFT JOIN branch_mapping bm
    ON lower(bm.keyword) = lower(COALESCE(
      sp.raw_data->>'Please choose your preferred branch',
      sp.raw_data->>'Sila pilih cawangan pilihan anda'
    ))
  WHERE sp.platform = 'tiktok_lead'

  UNION ALL

  SELECT rw.lead_source,
    rw.submitted_at::timestamp AS submitted_at,
    bm.official_name AS clean_branch,
    bm.region,
    gs.gs AS sibling_index
  FROM raw_wix_leads rw
  CROSS JOIN LATERAL generate_series(1, GREATEST(COALESCE(rw.children_count, 1), 1)) gs(gs)
  LEFT JOIN branch_mapping bm ON lower(bm.keyword) = lower(rw.raw_branch_text)

  UNION ALL

  SELECT wtf.lead_source,
    (wtf.received_at AT TIME ZONE 'Asia/Kuala_Lumpur')::timestamp AS submitted_at,
    wtf.branch AS clean_branch,
    bm.region,
    gs.gs AS sibling_index
  FROM public.wix_trial_form_leads wtf
  CROSS JOIN LATERAL generate_series(1, GREATEST(COALESCE(wtf.children_count, 1), 1)) gs(gs)
  LEFT JOIN LATERAL (
    SELECT region FROM branch_mapping
    WHERE lower(official_name) = lower(wtf.branch) AND region IS NOT NULL
    LIMIT 1
  ) bm ON true
  WHERE wtf.branch IS NOT NULL

  UNION ALL

  SELECT 'Google Lead Form'::text AS lead_source,
    (gl.received_at AT TIME ZONE 'Asia/Kuala_Lumpur')::timestamp AS submitted_at,
    gl.branch AS clean_branch,
    bm.region,
    1 AS sibling_index
  FROM google_ads_leads gl
  LEFT JOIN LATERAL (
    SELECT region FROM branch_mapping
    WHERE lower(official_name) = lower(gl.branch) AND region IS NOT NULL
    LIMIT 1
  ) bm ON true
  WHERE gl.is_test = false
    AND gl.branch IS NOT NULL;
