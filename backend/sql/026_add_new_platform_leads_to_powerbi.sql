-- Add new_platform_leads as a source in master_leads_powerbi.
-- Siblings are expanded with GENERATE_SERIES on children_count so each child
-- gets its own row (sibling_index 1…N).  Summary/Lead-Sources sections filter
-- sibling_index = 1 (without siblings); Regional Breakdown counts all rows.

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
    AND gl.branch IS NOT NULL

  UNION ALL

  -- new_platform_leads: each child expands to a sibling row.
  -- location_key (e.g. 'subang_taipan') is mapped to the canonical official_name
  -- so the downstream region CASE in leads.js picks it up correctly.
  SELECT
    COALESCE(NULLIF(TRIM(npl.lead_source), ''), NULLIF(TRIM(npl.platform), ''), 'new_platform') AS lead_source,
    (npl.received_at AT TIME ZONE 'Asia/Kuala_Lumpur')::timestamp AS submitted_at,
    CASE npl.location_key
      WHEN 'online'                 THEN 'Online'
      WHEN 'subang_taipan'          THEN 'Subang Taipan'
      WHEN 'setia_alam'             THEN 'Setia Alam'
      WHEN 'sri_petaling'           THEN 'Sri Petaling'
      WHEN 'kota_damansara'         THEN 'Kota Damansara'
      WHEN 'putrajaya'              THEN 'Putrajaya'
      WHEN 'ampang'                 THEN 'Ampang'
      WHEN 'cyberjaya'              THEN 'Cyberjaya'
      WHEN 'klang'                  THEN 'Klang'
      WHEN 'denai_alam'             THEN 'Denai Alam'
      WHEN 'bandar_baru_bangi'      THEN 'Bandar Baru Bangi'
      WHEN 'danau_kota'             THEN 'Danau Kota'
      WHEN 'shah_alam'              THEN 'Shah Alam'
      WHEN 'bandar_tun_hussein_onn' THEN 'Bandar Tun Hussein Onn'
      WHEN 'eco_grandeur'           THEN 'Eco Grandeur'
      WHEN 'bandar_seri_putra'      THEN 'Bandar Seri Putra'
      WHEN 'bandar_rimbayu'         THEN 'Rimbayu'
      WHEN 'taman_seri_gombak'      THEN 'Taman Sri Gombak'
      WHEN 'kajang_ttdi_grove'      THEN 'Kajang'
      WHEN 'kota_warisan'           THEN 'Kota Warisan'
      WHEN 'tropicana_sungai_buloh' THEN 'Tropicana Sungai Buloh'
      WHEN 'puncak_jalil'           THEN 'Puncak Jalil'
      WHEN 'puchong_utama'          THEN 'Dataran Puchong Utama'
      ELSE NULL
    END AS clean_branch,
    CASE npl.location_key
      WHEN 'online'                 THEN 'Region C'
      WHEN 'subang_taipan'          THEN 'Region A'
      WHEN 'setia_alam'             THEN 'Region A'
      WHEN 'sri_petaling'           THEN 'Region B'
      WHEN 'kota_damansara'         THEN 'Region B'
      WHEN 'putrajaya'              THEN 'Region C'
      WHEN 'ampang'                 THEN 'Region B'
      WHEN 'cyberjaya'              THEN 'Region C'
      WHEN 'klang'                  THEN 'Region A'
      WHEN 'denai_alam'             THEN 'Region A'
      WHEN 'bandar_baru_bangi'      THEN 'Region C'
      WHEN 'danau_kota'             THEN 'Region B'
      WHEN 'shah_alam'              THEN 'Region A'
      WHEN 'bandar_tun_hussein_onn' THEN 'Region B'
      WHEN 'eco_grandeur'           THEN 'Region A'
      WHEN 'bandar_seri_putra'      THEN 'Region C'
      WHEN 'bandar_rimbayu'         THEN 'Region A'
      WHEN 'taman_seri_gombak'      THEN 'Region B'
      WHEN 'kajang_ttdi_grove'      THEN 'Region B'
      WHEN 'kota_warisan'           THEN 'Region C'
      WHEN 'tropicana_sungai_buloh' THEN 'Region A'
      WHEN 'puncak_jalil'           THEN 'Region B'
      WHEN 'puchong_utama'          THEN 'Region C'
      ELSE NULL
    END AS region,
    gs.gs AS sibling_index
  FROM crm.new_platform_leads npl
  CROSS JOIN LATERAL generate_series(1, GREATEST(COALESCE(npl.children_count, 1), 1)) gs(gs)
  WHERE npl.location_key IS NOT NULL
    AND npl.location_key != '';

-- Add with-siblings total column to the Telegram report cache.
ALTER TABLE telegram_report_cache
  ADD COLUMN IF NOT EXISTS total_leads_with_siblings INTEGER NOT NULL DEFAULT 0;
