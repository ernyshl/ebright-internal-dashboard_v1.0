const express = require('express');
const { requireAuth, requireRole } = require('../middleware/auth');
const { pool } = require('../db');

const router = express.Router();

router.get('/breakdown', requireAuth, requireRole(['super_admin', 'ceo', 'rm', 'od', 'marketing']), async (_req, res, next) => {
  try {
    // A) Summary headers (total counts by lead_source)
    const queryTotal = `
      SELECT
        CASE 
          WHEN LOWER(TRIM(lead_source)) LIKE '%online%' THEN 'Online'
          WHEN LOWER(TRIM(lead_source)) = '' THEN 'Unknown'
          ELSE TRIM(lead_source)
        END as lead_source,
        COUNT(*) FILTER (WHERE submitted_at >= CURRENT_DATE) AS count_today,
        COUNT(*) FILTER (WHERE submitted_at::date = CURRENT_DATE - 1) AS count_yesterday,
        COUNT(*) FILTER (WHERE submitted_at >= CURRENT_DATE - INTERVAL '7 days') AS count_7_days,
        COUNT(*) FILTER (WHERE submitted_at >= CURRENT_DATE - INTERVAL '30 days') AS count_30_days
      FROM master_leads_powerbi
      GROUP BY 1
      ORDER BY lead_source;
    `;

    // B) Regions table - simplified to just 2 regions
    const queryRegion = `
      SELECT
        region,
        COUNT(*) FILTER (WHERE submitted_at >= CURRENT_DATE) AS count_today,
        COUNT(*) FILTER (WHERE submitted_at::date = CURRENT_DATE - 1) AS count_yesterday,
        COUNT(*) FILTER (WHERE submitted_at >= CURRENT_DATE - INTERVAL '7 days') AS count_7_days,
        COUNT(*) FILTER (WHERE submitted_at >= CURRENT_DATE - INTERVAL '30 days') AS count_30_days
      FROM master_leads_powerbi
      WHERE region IN ('Region 2', 'Region 3')
      GROUP BY region
      ORDER BY region;
    `;

    // C) Branch breakdown - show all branches with flexible matching
    const queryBranch = `
      SELECT * FROM (
        -- All Online branches combined into ONE row
        SELECT
          'Online' as region,
          'Online' as lead_source,
          'Online' as clean_branch,
          COUNT(*) FILTER (WHERE submitted_at >= CURRENT_DATE) AS count_today,
          COUNT(*) FILTER (WHERE submitted_at::date = CURRENT_DATE - 1) AS count_yesterday,
          COUNT(*) FILTER (WHERE submitted_at >= CURRENT_DATE - INTERVAL '7 days') AS count_7_days,
          COUNT(*) FILTER (WHERE submitted_at >= CURRENT_DATE - INTERVAL '30 days') AS count_30_days
        FROM master_leads_powerbi
        WHERE LOWER(TRIM(clean_branch)) LIKE '%online%'
        GROUP BY 1, 2, 3
        
        UNION ALL
        
        -- Regular branches - combined by branch name only (not region)
        SELECT
          'All Regions' as region,
          'All Sources' as lead_source,
          TRIM(clean_branch) as clean_branch,
          COUNT(*) FILTER (WHERE submitted_at >= CURRENT_DATE) AS count_today,
          COUNT(*) FILTER (WHERE submitted_at::date = CURRENT_DATE - 1) AS count_yesterday,
          COUNT(*) FILTER (WHERE submitted_at >= CURRENT_DATE - INTERVAL '7 days') AS count_7_days,
          COUNT(*) FILTER (WHERE submitted_at >= CURRENT_DATE - INTERVAL '30 days') AS count_30_days
        FROM master_leads_powerbi
        WHERE 
          clean_branch IN (
            'Ampang', 'Bandar Baru Bangi', 'Bandar Seri Putra', 'Bandar Tun Hussein Onn',
            'Cyberjaya', 'Denai Alam', 'Danau Kota', 'Eco Grandeur', 'Kota Damansara', 'Klang',
            'Kajang', 'Kota Warisan', 'Putrajaya', 'Bandar Rimbayu',
            'Setia Alam', 'Shah Alam', 'Sri Petaling', 'Subang Taipan', 'Taman Seri Gombak'
          )
          AND LOWER(TRIM(clean_branch)) NOT LIKE '%online%'
        GROUP BY TRIM(clean_branch)
      ) combined
      ORDER BY count_30_days DESC;
    `;

    const [resTotal, resRegion, resBranch] = await Promise.all([
      pool.query(queryTotal),
      pool.query(queryRegion),
      pool.query(queryBranch),
    ]);

    return res.json({
      total: resTotal.rows,
      regions: resRegion.rows,
      branches: resBranch.rows,
    });
  } catch (err) {
    return next(err);
  }
});

module.exports = { leadsRouter: router };

