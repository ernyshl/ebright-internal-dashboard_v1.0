const express = require('express');
const { pool } = require('../db');
const { requireAuth, requireRole } = require('../middleware/auth');

const router = express.Router();

const REGION_BRANCHES = {
  'Region A': ['Bandar Rimbayu', 'Klang', 'Shah Alam', 'Setia Alam', 'Denai Alam', 'Eco Grandeur', 'Subang Taipan'],
  'Region B': ['Danau Kota', 'Kota Damansara', 'Ampang', 'Sri Petaling', 'Bandar Tun Hussein Onn', 'Kajang Perdana', 'Kajang', 'Taman Sri Gombak'],
  'Region C': ['Putrajaya', 'Kota Warisan', 'Bandar Baru Bangi', 'Cyberjaya', 'Bandar Seri Putra', 'Dataran Puchong Utama', 'Online'],
};

function sanitizeSearchTerm(term) {
  // Escape LIKE wildcards to prevent SQL injection via search
  return term.replace(/%/g, '\\%').replace(/_/g, '\\_');
}

// GET /api/leads-centre — filtered, paginated leads search
router.get('/', requireAuth, requireRole(['super_admin', 'ceo', 'marketing', 'od', 'rm', 'hr', 'tv']), async (req, res, next) => {
  try {
    const {
      search = '',
      lead_source = '',
      region = '',
      branch = '',
      date_from = '',
      date_to = '',
      page = 1,
      limit = 50,
    } = req.query;

    const offset = (Number(page) - 1) * Number(limit);
    const conditions = [];
    const params = [];
    let paramIndex = 1;

    // Search filter (multiple fields)
    if (search) {
      const sanitizedSearch = sanitizeSearchTerm(search);
      conditions.push(`(
        LOWER(full_name) LIKE $${paramIndex} OR
        LOWER(email) LIKE $${paramIndex} OR
        LOWER(phone_number) LIKE $${paramIndex}
      )`);
      params.push(`%${sanitizedSearch.toLowerCase()}%`);
      paramIndex++;
    }

    // Lead source filter
    if (lead_source) {
      conditions.push(`lead_source = $${paramIndex}`);
      params.push(lead_source);
      paramIndex++;
    }

    // Region filter — mapped from clean_branch to Region A / B / C
    if (region && REGION_BRANCHES[region]) {
      conditions.push(`TRIM(clean_branch) ILIKE ANY($${paramIndex})`);
      params.push(REGION_BRANCHES[region]);
      paramIndex++;
    }

    // Branch filter
    if (branch) {
      conditions.push(`clean_branch = $${paramIndex}`);
      params.push(branch);
      paramIndex++;
    }

    // Date range filters — compare in Asia/Kuala_Lumpur (UTC+8) to avoid timezone drift
    if (date_from) {
      conditions.push(`(submitted_at AT TIME ZONE 'Asia/Kuala_Lumpur')::date >= $${paramIndex}::date`);
      params.push(date_from);
      paramIndex++;
    }
    if (date_to) {
      conditions.push(`(submitted_at AT TIME ZONE 'Asia/Kuala_Lumpur')::date <= $${paramIndex}::date`);
      params.push(date_to);
      paramIndex++;
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    // Get total count
    const countResult = await pool.query(
      `SELECT COUNT(*) FROM master_leads_powerbi ${whereClause}`,
      params
    );
    const total = parseInt(countResult.rows[0].count, 10);

    // Get filtered data — use actual columns from the table
    const dataResult = await pool.query(
      `SELECT lead_source, full_name, phone_number, email, submitted_at, raw_branch_text, clean_branch, region
       FROM master_leads_powerbi ${whereClause}
       ORDER BY submitted_at DESC LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`,
      [...params, Number(limit), offset]
    );

    // Get filter options — filter branches by selected region if provided
    const [sourcesResult, branchesResult] = await Promise.all([
      pool.query('SELECT DISTINCT lead_source FROM master_leads_powerbi WHERE lead_source IS NOT NULL AND TRIM(lead_source) != \'\' ORDER BY lead_source'),
      region && REGION_BRANCHES[region]
        ? pool.query(`SELECT DISTINCT clean_branch FROM master_leads_powerbi WHERE TRIM(clean_branch) ILIKE ANY($1) AND clean_branch NOT ILIKE 'Unspecified' AND clean_branch NOT ILIKE 'Unknown Branch' ORDER BY clean_branch`, [REGION_BRANCHES[region]])
        : pool.query('SELECT DISTINCT clean_branch FROM master_leads_powerbi WHERE clean_branch IS NOT NULL AND TRIM(clean_branch) != \'\' AND clean_branch NOT ILIKE \'Unspecified\' AND clean_branch NOT ILIKE \'Unknown Branch\' ORDER BY clean_branch'),
    ]);

    return res.json({
      leads: dataResult.rows,
      total,
      page: Number(page),
      totalPages: Math.ceil(total / Number(limit)),
      filters: {
        lead_sources: sourcesResult.rows.map(r => r.lead_source),
        regions: Object.keys(REGION_BRANCHES),
        branches: branchesResult.rows.map(r => r.clean_branch),
      },
    });
  } catch (err) {
    return next(err);
  }
});

// GET /api/leads-centre/email-source — email → lead_source mapping for cross-reference
router.get('/email-source', requireAuth, requireRole(['super_admin', 'ceo', 'marketing', 'od', 'rm', 'hr', 'tv']), async (_req, res, next) => {
  try {
    const { rows } = await pool.query(
      `SELECT LOWER(TRIM(email)) AS email, lead_source
       FROM master_leads_powerbi
       WHERE email IS NOT NULL AND TRIM(email) != '' AND lead_source IS NOT NULL AND TRIM(lead_source) != ''`
    );
    // Build map: email → most common lead_source (in case of duplicates)
    const map = {};
    for (const r of rows) {
      if (!map[r.email]) map[r.email] = r.lead_source;
    }
    return res.json({ emailSource: map });
  } catch (err) {
    return next(err);
  }
});

// GET /api/leads-centre/nl-by-source — NL count grouped by lead_source for date range
router.get('/nl-by-source', requireAuth, requireRole(['super_admin', 'ceo', 'marketing', 'od', 'rm', 'hr', 'tv']), async (req, res, next) => {
  try {
    const { date_from = '', date_to = '' } = req.query;
    const conditions = [
      `clean_branch IS NOT NULL`,
      `TRIM(clean_branch) != ''`,
      `LOWER(TRIM(clean_branch)) != 'unspecified'`,
      `LOWER(TRIM(clean_branch)) != 'unknown branch'`,
      `LOWER(TRIM(clean_branch)) NOT LIKE '%test%'`,
    ];
    const params = [];
    let idx = 1;
    if (date_from) { conditions.push(`(submitted_at AT TIME ZONE 'Asia/Kuala_Lumpur')::date >= $${idx++}::date`); params.push(date_from); }
    if (date_to)   { conditions.push(`(submitted_at AT TIME ZONE 'Asia/Kuala_Lumpur')::date <= $${idx++}::date`); params.push(date_to); }
    const where = `WHERE ${conditions.join(' AND ')}`;
    const { rows } = await pool.query(
      `SELECT COALESCE(NULLIF(TRIM(lead_source),''), 'Unknown') AS lead_source, COUNT(*) AS nl
       FROM master_leads_powerbi ${where}
       GROUP BY COALESCE(NULLIF(TRIM(lead_source),''), 'Unknown')
       ORDER BY nl DESC`,
      params,
    );
    return res.json({ nl: rows });
  } catch (err) {
    return next(err);
  }
});

// GET /api/leads-centre/emails — all emails in DB (for cross-reference)
router.get('/emails', requireAuth, requireRole(['super_admin', 'ceo', 'marketing', 'od', 'rm', 'hr', 'tv']), async (_req, res, next) => {
  try {
    const { rows } = await pool.query(
      `SELECT DISTINCT LOWER(TRIM(email)) AS email FROM master_leads_powerbi WHERE email IS NOT NULL AND TRIM(email) != ''`
    );
    return res.json({ emails: rows.map(r => r.email) });
  } catch (err) {
    return next(err);
  }
});

// GET /api/leads-centre/nl-by-branch — NL count grouped by clean_branch for date range
router.get('/nl-by-branch', requireAuth, requireRole(['super_admin', 'ceo', 'marketing', 'od', 'rm', 'hr', 'tv']), async (req, res, next) => {
  try {
    const { date_from = '', date_to = '' } = req.query;

    const conditions = [
      `clean_branch IS NOT NULL`,
      `TRIM(clean_branch) != ''`,
      `LOWER(TRIM(clean_branch)) != 'unspecified'`,
      `LOWER(TRIM(clean_branch)) != 'unknown branch'`,
      `LOWER(TRIM(clean_branch)) NOT LIKE '%test%'`,
    ];
    const params = [];
    let idx = 1;

    if (date_from) {
      conditions.push(`(submitted_at AT TIME ZONE 'Asia/Kuala_Lumpur')::date >= $${idx++}::date`);
      params.push(date_from);
    }
    if (date_to) {
      conditions.push(`(submitted_at AT TIME ZONE 'Asia/Kuala_Lumpur')::date <= $${idx++}::date`);
      params.push(date_to);
    }

    const where = `WHERE ${conditions.join(' AND ')}`;

    const result = await pool.query(
      `SELECT TRIM(clean_branch) AS branch, COUNT(*) AS nl
       FROM master_leads_powerbi
       ${where}
       GROUP BY TRIM(clean_branch)
       ORDER BY branch`,
      params,
    );

    return res.json({ nl: result.rows });
  } catch (err) {
    return next(err);
  }
});

module.exports = { leadsCentreRouter: router };
