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
        COUNT(*) FILTER (WHERE submitted_at::date = CURRENT_DATE) AS count_today,
        COUNT(*) FILTER (WHERE submitted_at::date = CURRENT_DATE - 1) AS count_yesterday,
        COUNT(*) FILTER (WHERE submitted_at::date >= CURRENT_DATE - INTERVAL '7 days') AS count_7_days,
        COUNT(*) FILTER (WHERE submitted_at::date >= CURRENT_DATE - INTERVAL '30 days') AS count_30_days
      FROM master_leads_powerbi
      GROUP BY 1
      ORDER BY lead_source;
    `;

    // B) Regions table - include ALL regions (Region 2, Region 3, and any others)
    const queryRegion = `
      SELECT
        region,
        COUNT(*) FILTER (WHERE submitted_at::date = CURRENT_DATE) AS count_today,
        COUNT(*) FILTER (WHERE submitted_at::date = CURRENT_DATE - 1) AS count_yesterday,
        COUNT(*) FILTER (WHERE submitted_at::date >= CURRENT_DATE - INTERVAL '7 days') AS count_7_days,
        COUNT(*) FILTER (WHERE submitted_at::date >= CURRENT_DATE - INTERVAL '30 days') AS count_30_days
      FROM master_leads_powerbi
      WHERE region IS NOT NULL AND TRIM(region) != ''
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
          COUNT(*) FILTER (WHERE submitted_at::date = CURRENT_DATE) AS count_today,
          COUNT(*) FILTER (WHERE submitted_at::date = CURRENT_DATE - 1) AS count_yesterday,
          COUNT(*) FILTER (WHERE submitted_at::date >= CURRENT_DATE - INTERVAL '7 days') AS count_7_days,
          COUNT(*) FILTER (WHERE submitted_at::date >= CURRENT_DATE - INTERVAL '30 days') AS count_30_days
        FROM master_leads_powerbi
        WHERE LOWER(TRIM(clean_branch)) LIKE '%online%'
        GROUP BY 1, 2, 3
        
        UNION ALL
        
        -- Regular branches - get ALL branches from database
        SELECT
          'All Regions' as region,
          'All Sources' as lead_source,
          TRIM(clean_branch) as clean_branch,
          COUNT(*) FILTER (WHERE submitted_at::date = CURRENT_DATE) AS count_today,
          COUNT(*) FILTER (WHERE submitted_at::date = CURRENT_DATE - 1) AS count_yesterday,
          COUNT(*) FILTER (WHERE submitted_at::date >= CURRENT_DATE - INTERVAL '7 days') AS count_7_days,
          COUNT(*) FILTER (WHERE submitted_at::date >= CURRENT_DATE - INTERVAL '30 days') AS count_30_days
        FROM master_leads_powerbi
        WHERE 
          clean_branch IS NOT NULL 
          AND TRIM(clean_branch) != ''
          AND LOWER(TRIM(clean_branch)) NOT LIKE '%online%'
          AND LOWER(TRIM(clean_branch)) NOT LIKE 'unspecified'
          AND LOWER(TRIM(clean_branch)) NOT LIKE 'unknown branch'
          AND LOWER(TRIM(clean_branch)) NOT LIKE '%test%'
        GROUP BY TRIM(clean_branch)
      ) combined
      ORDER BY count_30_days DESC;
    `;

    // D) Grand total - count ALL leads in the database
    const queryGrandTotal = `
      SELECT
        COUNT(*) FILTER (WHERE submitted_at::date = CURRENT_DATE) AS count_today,
        COUNT(*) FILTER (WHERE submitted_at::date = CURRENT_DATE - 1) AS count_yesterday,
        COUNT(*) FILTER (WHERE submitted_at::date >= CURRENT_DATE - INTERVAL '7 days') AS count_7_days,
        COUNT(*) FILTER (WHERE submitted_at::date >= CURRENT_DATE - INTERVAL '30 days') AS count_30_days
      FROM master_leads_powerbi;
    `;

    const [resTotal, resRegion, resBranch, resGrandTotal] = await Promise.all([
      pool.query(queryTotal),
      pool.query(queryRegion),
      pool.query(queryBranch),
      pool.query(queryGrandTotal),
    ]);

    return res.json({
      total: resTotal.rows,
      regions: resRegion.rows,
      branches: resBranch.rows,
      grandTotal: resGrandTotal.rows[0],
    });
  } catch (err) {
    return next(err);
  }
});

module.exports = { leadsRouter: router };

