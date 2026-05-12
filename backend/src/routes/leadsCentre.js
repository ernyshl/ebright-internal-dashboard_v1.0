const express = require('express');
const { pool } = require('../db');
const { requireAuth, requireRole } = require('../middleware/auth');

const router = express.Router();

const REGION_BRANCHES = {
  'Region A': ['Bandar Rimbayu', 'Klang', 'Shah Alam', 'Setia Alam', 'Denai Alam', 'Eco Grandeur', 'Subang Taipan'],
  'Region B': ['Danau Kota', 'Kota Damansara', 'Ampang', 'Sri Petaling', 'Bandar Tun Hussein Onn', 'Kajang Perdana', 'Kajang', 'Taman Sri Gombak'],
  'Region C': ['Putrajaya', 'Kota Warisan', 'Bandar Baru Bangi', 'Cyberjaya', 'Bandar Seri Putra', 'Dataran Puchong Utama', 'Online'],
};

// `master_leads_base` stopped being populated in Jan 2026 and `master_leads_powerbi`
// has no PII columns. Rebuild the leads source as a UNION of the three live raw
// tables (meta_leads, social_posts where platform=tiktok_lead, raw_wix_leads),
// mirroring the same branch-mapping / sibling-expansion logic used by the
// `master_leads_powerbi` view, while pulling full_name / email / phone_number
// from the underlying records so the table and search still work.
//
// `submitted_at` is emitted as `timestamp without time zone` already in KL local
// time (matching the powerbi convention). Date filters compare against the local
// date directly without a redundant AT TIME ZONE conversion.
const LEADS_SRC = `(
  SELECT
    'Meta'::text AS lead_source,
    (SELECT (fd.value->'values')->>0 FROM jsonb_array_elements(ml.raw_data->'field_data') fd WHERE fd.value->>'name' = 'full_name' LIMIT 1) AS full_name,
    (SELECT (fd.value->'values')->>0 FROM jsonb_array_elements(ml.raw_data->'field_data') fd WHERE fd.value->>'name' = 'email' LIMIT 1)     AS email,
    (SELECT (fd.value->'values')->>0 FROM jsonb_array_elements(ml.raw_data->'field_data') fd WHERE fd.value->>'name' = 'phone' LIMIT 1)     AS phone_number,
    -- Child / participant name: BM forms use 'nama_peserta', ENG forms use 'participant_name'
    (SELECT (fd.value->'values')->>0 FROM jsonb_array_elements(ml.raw_data->'field_data') fd
      WHERE fd.value->>'name' ILIKE 'nama_peserta' OR fd.value->>'name' ILIKE 'participant_name' LIMIT 1) AS child_name,
    -- Meta lead webhook doesn't include campaign metadata; form_name is the closest proxy
    -- (marketing names each form after its campaign).
    ml.form_name AS campaign_name,
    CASE
      WHEN ml.form_id::text = ANY (ARRAY['34852175561095929','2081747062387420']) THEN 'Online'::text
      ELSE COALESCE(bm.official_name, bm2.official_name)
    END AS clean_branch,
    CASE
      WHEN ml.form_id::text = ANY (ARRAY['34852175561095929','2081747062387420']) THEN 'Online'::text
      ELSE COALESCE(bm.official_name, bm2.official_name)
    END AS raw_branch_text,
    NULL::text AS region,
    (((ml.raw_data->>'created_time')::timestamptz) AT TIME ZONE 'Asia/Kuala_Lumpur') AS submitted_at
  FROM meta_leads ml
  LEFT JOIN branch_mapping bm
    ON lower(bm.keyword) = lower((
      SELECT (fd.value->'values')->>0
      FROM jsonb_array_elements(ml.raw_data->'field_data') fd
      WHERE (fd.value->>'name') ILIKE '%branch%'
      LIMIT 1
    ))
  LEFT JOIN LATERAL (
    SELECT official_name
    FROM branch_mapping
    WHERE lower(ml.form_name) ILIKE ('%' || lower(keyword) || '%')
    LIMIT 1
  ) bm2 ON true

  UNION ALL

  SELECT
    'TikTok'::text AS lead_source,
    sp.raw_data->>'Name'         AS full_name,
    sp.raw_data->>'Email'        AS email,
    sp.raw_data->>'Phone number' AS phone_number,
    NULL::text                   AS child_name,
    sp.raw_data->>'campaign_name' AS campaign_name,
    COALESCE(bm.official_name,
      CASE
        WHEN (sp.raw_data->>'Please Select Your Preferred Day') ILIKE 'Online%' THEN 'Online'::text
        WHEN (sp.raw_data->>'Sila Pilih Hari Anda')             ILIKE 'Online%' THEN 'Online'::text
        ELSE NULL::text
      END) AS clean_branch,
    COALESCE(
      sp.raw_data->>'Please choose your preferred branch',
      sp.raw_data->>'Sila pilih cawangan pilihan anda'
    ) AS raw_branch_text,
    NULL::text AS region,
    CASE
      WHEN length(sp.raw_data->>'created_time') >= 19
      THEN ((left(sp.raw_data->>'created_time', 19))::timestamp AT TIME ZONE 'UTC') AT TIME ZONE 'Asia/Kuala_Lumpur'
      ELSE sp.created_at::timestamp
    END AS submitted_at
  FROM social_posts sp
  LEFT JOIN branch_mapping bm
    ON lower(bm.keyword) = lower(COALESCE(
      sp.raw_data->>'Please choose your preferred branch',
      sp.raw_data->>'Sila pilih cawangan pilihan anda'
    ))
  WHERE sp.platform = 'tiktok_lead'

  UNION ALL

  SELECT
    rw.lead_source,
    rw.full_name,
    rw.email,
    rw.phone_number,
    NULL::text              AS child_name,
    NULL::text              AS campaign_name,
    bm.official_name        AS clean_branch,
    rw.raw_branch_text      AS raw_branch_text,
    NULL::text              AS region,
    rw.submitted_at::timestamp AS submitted_at
  FROM raw_wix_leads rw
  CROSS JOIN LATERAL generate_series(1, GREATEST(COALESCE(rw.children_count, 1), 1)) gs(gs)
  LEFT JOIN branch_mapping bm ON lower(bm.keyword) = lower(rw.raw_branch_text)
) AS leads_view`;

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
      conditions.push(`submitted_at::date >= $${paramIndex}::date`);
      params.push(date_from);
      paramIndex++;
    }
    if (date_to) {
      conditions.push(`submitted_at::date <= $${paramIndex}::date`);
      params.push(date_to);
      paramIndex++;
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    // Get total count
    const countResult = await pool.query(
      `SELECT COUNT(*) FROM ${LEADS_SRC} ${whereClause}`,
      params
    );
    const total = parseInt(countResult.rows[0].count, 10);

    // Get filtered data — use actual columns from the table
    const dataResult = await pool.query(
      `SELECT lead_source, full_name, phone_number, email, child_name, campaign_name,
              submitted_at, raw_branch_text, clean_branch, region
       FROM ${LEADS_SRC} ${whereClause}
       ORDER BY submitted_at DESC LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`,
      [...params, Number(limit), offset]
    );

    // Get filter options — filter branches by selected region if provided
    const [sourcesResult, branchesResult] = await Promise.all([
      pool.query(`SELECT DISTINCT lead_source FROM ${LEADS_SRC} WHERE lead_source IS NOT NULL AND TRIM(lead_source) != '' ORDER BY lead_source`),
      region && REGION_BRANCHES[region]
        ? pool.query(`SELECT DISTINCT clean_branch FROM ${LEADS_SRC} WHERE TRIM(clean_branch) ILIKE ANY($1) AND clean_branch NOT ILIKE 'Unspecified' AND clean_branch NOT ILIKE 'Unknown Branch' ORDER BY clean_branch`, [REGION_BRANCHES[region]])
        : pool.query(`SELECT DISTINCT clean_branch FROM ${LEADS_SRC} WHERE clean_branch IS NOT NULL AND TRIM(clean_branch) != '' AND clean_branch NOT ILIKE 'Unspecified' AND clean_branch NOT ILIKE 'Unknown Branch' ORDER BY clean_branch`),
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

// GET /api/leads-centre/export — CSV export with same filters, no pagination
router.get('/export', requireAuth, requireRole(['super_admin', 'ceo', 'marketing', 'od', 'rm', 'hr']), async (req, res, next) => {
  try {
    const { search = '', lead_source = '', region = '', branch = '', date_from = '', date_to = '' } = req.query;
    const conditions = [];
    const params = [];
    let idx = 1;

    if (search) {
      const sanitizedSearch = sanitizeSearchTerm(search);
      conditions.push(`(LOWER(full_name) LIKE $${idx} OR LOWER(email) LIKE $${idx} OR LOWER(phone_number) LIKE $${idx})`);
      params.push(`%${sanitizedSearch.toLowerCase()}%`);
      idx++;
    }
    if (lead_source) { conditions.push(`lead_source = $${idx++}`); params.push(lead_source); }
    if (region && REGION_BRANCHES[region]) { conditions.push(`TRIM(clean_branch) ILIKE ANY($${idx++})`); params.push(REGION_BRANCHES[region]); }
    if (branch) { conditions.push(`clean_branch = $${idx++}`); params.push(branch); }
    if (date_from) { conditions.push(`submitted_at::date >= $${idx++}::date`); params.push(date_from); }
    if (date_to) { conditions.push(`submitted_at::date <= $${idx++}::date`); params.push(date_to); }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    const { rows } = await pool.query(
      `SELECT full_name, email, phone_number, lead_source, clean_branch,
              submitted_at AS submitted_at
       FROM ${LEADS_SRC} ${where}
       ORDER BY submitted_at DESC`,
      params,
    );

    // Build CSV
    const header = 'Name,Email,Phone,Source,Branch,Submitted At';
    const csvRows = rows.map(r => {
      const esc = (v) => `"${(v || '').replace(/"/g, '""')}"`;
      const dt = r.submitted_at ? new Date(r.submitted_at).toLocaleString('en-GB', { timeZone: 'Asia/Kuala_Lumpur' }) : '';
      return [esc(r.full_name), esc(r.email), esc(r.phone_number), esc(r.lead_source), esc(r.clean_branch), esc(dt)].join(',');
    });
    const csv = [header, ...csvRows].join('\n');

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="leads-export-${new Date().toISOString().split('T')[0]}.csv"`);
    return res.send(csv);
  } catch (err) { return next(err); }
});

// GET /api/leads-centre/email-source — email → lead_source mapping for cross-reference
router.get('/email-source', requireAuth, requireRole(['super_admin', 'ceo', 'marketing', 'od', 'rm', 'hr', 'tv']), async (_req, res, next) => {
  try {
    const { rows } = await pool.query(
      `SELECT LOWER(TRIM(email)) AS email, lead_source
       FROM ${LEADS_SRC}
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
    if (date_from) { conditions.push(`submitted_at::date >= $${idx++}::date`); params.push(date_from); }
    if (date_to)   { conditions.push(`submitted_at::date <= $${idx++}::date`); params.push(date_to); }
    const where = `WHERE ${conditions.join(' AND ')}`;
    const { rows } = await pool.query(
      `SELECT COALESCE(NULLIF(TRIM(lead_source),''), 'Unknown') AS lead_source, COUNT(*) AS nl
       FROM ${LEADS_SRC} ${where}
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
      `SELECT DISTINCT LOWER(TRIM(email)) AS email FROM ${LEADS_SRC} WHERE email IS NOT NULL AND TRIM(email) != ''`
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
      conditions.push(`submitted_at::date >= $${idx++}::date`);
      params.push(date_from);
    }
    if (date_to) {
      conditions.push(`submitted_at::date <= $${idx++}::date`);
      params.push(date_to);
    }

    const where = `WHERE ${conditions.join(' AND ')}`;

    const result = await pool.query(
      `SELECT TRIM(clean_branch) AS branch, COUNT(*) AS nl
       FROM ${LEADS_SRC}
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
