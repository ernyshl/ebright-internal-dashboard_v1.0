const express = require('express');
const { requireAuth, requireRole } = require('../middleware/auth');
const { pool } = require('../db');

const router = express.Router();

const VALID_BRANCHES = [
  'Online', 'Subang Taipan', 'Sri Petaling', 'Setia Alam', 'Kota Damansara',
  'Putrajaya', 'Ampang', 'Cyberjaya', 'Klang', 'Denai Alam', 'Bandar Baru Bangi',
  'Danau Kota', 'Shah Alam', 'Bandar Tun Hussein Onn', 'Eco Grandeur',
  'Bandar Seri Putra', 'Rimbayu', 'Kajang', 'Kota Warisan', 'Taman Sri Gombak',
];

router.get('/breakdown', requireAuth, requireRole(['super_admin', 'ceo', 'rm', 'od', 'marketing', 'tv']), async (_req, res, next) => {
  try {
    // Single scan of master_leads_powerbi — all six sections derived from one MATERIALIZED CTE.
    // bm2 LATERAL in the view already short-circuits; this eliminates 5 additional full scans.
    const query = `
      WITH today AS (
        SELECT (NOW() AT TIME ZONE 'Asia/Kuala_Lumpur')::date AS d
      ),
      base AS MATERIALIZED (
        SELECT
          TRIM(clean_branch)                                           AS branch,
          LOWER(TRIM(clean_branch)) LIKE '%online%'                   AS is_online,
          sibling_index,
          (submitted_at AT TIME ZONE 'Asia/Kuala_Lumpur')::date       AS sub_date,
          TRIM(lead_source)                                            AS raw_lead_source,
          LOWER(TRIM(lead_source))                                     AS ls,
          CASE
            WHEN TRIM(lead_source) = 'Meta'                                               THEN 'Meta'
            WHEN TRIM(lead_source) = 'TikTok'                                             THEN 'TikTok'
            WHEN LOWER(TRIM(lead_source)) = 'trial class form'                            THEN 'Trial Class Form'
            WHEN LOWER(TRIM(lead_source)) = 'roadshow'                                   THEN 'Roadshow'
            WHEN LOWER(TRIM(lead_source)) IN ('self generated lead','self-generated lead','selfgenerated lead','self generated','self-generated','sgl','s.g.l') THEN 'Self Generated Lead'
            WHEN LOWER(TRIM(lead_source)) IN ('walk in','walk-in','walkin','walk_in')    THEN 'Walk In'
            WHEN LOWER(TRIM(lead_source)) = 'website'                                    THEN 'Website'
            ELSE 'Others'
          END                                                          AS lead_source_cat,
          CASE
            WHEN TRIM(clean_branch) ILIKE ANY(ARRAY['Rimbayu','Klang','Shah Alam','Setia Alam','Denai Alam','Eco Grandeur','Subang Taipan']) THEN 'Region A'
            WHEN TRIM(clean_branch) ILIKE ANY(ARRAY['Danau Kota','Kota Damansara','Ampang','Sri Petaling','Bandar Tun Hussein Onn','Kajang','Taman Sri Gombak']) THEN 'Region B'
            WHEN TRIM(clean_branch) ILIKE ANY(ARRAY['Putrajaya','Kota Warisan','Bandar Baru Bangi','Cyberjaya','Bandar Seri Putra'])
              OR LOWER(TRIM(clean_branch)) LIKE '%online%'            THEN 'Region C'
            ELSE NULL
          END                                                          AS region
        FROM master_leads_powerbi, today
        WHERE TRIM(clean_branch) = ANY($1)
      ),

      -- A) Lead source breakdown (primary rows only)
      _src AS (
        SELECT
          lead_source_cat AS lead_source,
          COUNT(*) FILTER (WHERE sub_date = d)                        AS count_today,
          COUNT(*) FILTER (WHERE sub_date = d - 1)                    AS count_yesterday,
          COUNT(*) FILTER (WHERE sub_date >= d - INTERVAL '7 days')   AS count_7_days,
          COUNT(*) FILTER (WHERE sub_date >= d - INTERVAL '30 days')  AS count_30_days
        FROM base, today
        WHERE sibling_index = 1
        GROUP BY 1
      ),

      -- B) Region breakdown
      _rgn AS (
        SELECT
          region,
          COUNT(*) FILTER (WHERE sub_date = d)                        AS count_today,
          COUNT(*) FILTER (WHERE sub_date = d - 1)                    AS count_yesterday,
          COUNT(*) FILTER (WHERE sub_date >= d - INTERVAL '7 days')   AS count_7_days,
          COUNT(*) FILTER (WHERE sub_date >= d - INTERVAL '30 days')  AS count_30_days
        FROM base, today
        WHERE region IS NOT NULL
        GROUP BY 1
      ),

      -- C) Branch breakdown (Online row + per-branch rows)
      _brn_online AS (
        SELECT
          'Online'      AS region,
          'Online'      AS lead_source,
          'Online'      AS clean_branch,
          COUNT(*) FILTER (WHERE sub_date = d)                        AS count_today,
          COUNT(*) FILTER (WHERE sub_date = d - 1)                    AS count_yesterday,
          COUNT(*) FILTER (WHERE sub_date >= d - INTERVAL '7 days')   AS count_7_days,
          COUNT(*) FILTER (WHERE sub_date >= d - INTERVAL '30 days')  AS count_30_days
        FROM base, today
        WHERE is_online
      ),
      _brn_physical AS (
        SELECT
          'All Regions' AS region,
          'All Sources' AS lead_source,
          branch        AS clean_branch,
          COUNT(*) FILTER (WHERE sub_date = d)                        AS count_today,
          COUNT(*) FILTER (WHERE sub_date = d - 1)                    AS count_yesterday,
          COUNT(*) FILTER (WHERE sub_date >= d - INTERVAL '7 days')   AS count_7_days,
          COUNT(*) FILTER (WHERE sub_date >= d - INTERVAL '30 days')  AS count_30_days
        FROM base, today
        WHERE NOT is_online
        GROUP BY branch
      ),

      -- D) Roadshow group — now scoped to VALID_BRANCHES (blank branches excluded)
      _rds AS (
        SELECT
          COUNT(*) FILTER (WHERE sub_date = d AND ls IN ('roadshow','self generated lead','self-generated lead','selfgenerated lead','sgl','s.g.l','others','other','walk in','walk-in','walkin','walk_in'))       AS count_today,
          COUNT(*) FILTER (WHERE sub_date = d - 1 AND ls IN ('roadshow','self generated lead','self-generated lead','selfgenerated lead','sgl','s.g.l','others','other','walk in','walk-in','walkin','walk_in')) AS count_yesterday,
          COUNT(*) FILTER (WHERE sub_date >= d - INTERVAL '7 days'  AND ls IN ('roadshow','self generated lead','self-generated lead','selfgenerated lead','sgl','s.g.l','others','other','walk in','walk-in','walkin','walk_in')) AS count_7_days,
          COUNT(*) FILTER (WHERE sub_date >= d - INTERVAL '30 days' AND ls IN ('roadshow','self generated lead','self-generated lead','selfgenerated lead','sgl','s.g.l','others','other','walk in','walk-in','walkin','walk_in')) AS count_30_days
        FROM base, today
      ),

      -- E) Grand total (primary rows only)
      _grd AS (
        SELECT
          COUNT(*) FILTER (WHERE sub_date = d)                                         AS count_today,
          COUNT(*) FILTER (WHERE sub_date = d - 1)                                     AS count_yesterday,
          COUNT(*) FILTER (WHERE sub_date >= d - INTERVAL '7 days')                    AS count_7_days,
          COUNT(*) FILTER (WHERE sub_date >= d - INTERVAL '30 days')                   AS count_30_days,
          COUNT(*) FILTER (WHERE sub_date = d        AND is_online)                    AS count_online_today,
          COUNT(*) FILTER (WHERE sub_date = d - 1    AND is_online)                    AS count_online_yesterday,
          COUNT(*) FILTER (WHERE sub_date >= d - INTERVAL '7 days'  AND is_online)     AS count_online_7_days,
          COUNT(*) FILTER (WHERE sub_date >= d - INTERVAL '30 days' AND is_online)     AS count_online_30_days
        FROM base, today
        WHERE sibling_index = 1
      ),

      -- F) Others detail — top-20 raw lead_source values that map to 'Others'
      _oth AS (
        SELECT
          raw_lead_source,
          COUNT(*) FILTER (WHERE sub_date = d) AS count_today,
          COUNT(*)                              AS count_total
        FROM base, today
        WHERE lead_source_cat = 'Others'
          AND raw_lead_source IS NOT NULL
          AND raw_lead_source != ''
        GROUP BY raw_lead_source
        ORDER BY count_today DESC, count_total DESC
        LIMIT 20
      )

      SELECT
        (SELECT json_agg(row_to_json(s) ORDER BY s.count_30_days DESC) FROM _src s)          AS total,
        (SELECT json_agg(row_to_json(r) ORDER BY r.region)             FROM _rgn r)           AS regions,
        (SELECT json_agg(row_to_json(b) ORDER BY b.count_30_days DESC)
           FROM (SELECT * FROM _brn_online UNION ALL SELECT * FROM _brn_physical) b)          AS branches,
        (SELECT row_to_json(d) FROM _rds d)                                                   AS roadshow,
        (SELECT row_to_json(g) FROM _grd g)                                                   AS grand_total,
        (SELECT json_agg(row_to_json(o)) FROM _oth o)                                         AS others_detail;
    `;

    const { rows } = await pool.query(query, [VALID_BRANCHES]);
    const r = rows[0];

    return res.json({
      total:        r.total        || [],
      regions:      r.regions      || [],
      branches:     r.branches     || [],
      roadshow:     r.roadshow     || {},
      grandTotal:   r.grand_total  || {},
      othersDetail: r.others_detail || [],
    });
  } catch (err) {
    return next(err);
  }
});

module.exports = { leadsRouter: router };
