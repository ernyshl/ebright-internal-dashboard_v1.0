const express = require('express');
const { pool } = require('../db');
const { env } = require('../env');
const { requireAuth, requireRole } = require('../middleware/auth');
const { pushToGHL } = require('../lib/ghlPush');

const router = express.Router();

function requireApiKey(req, res, next) {
  const key = req.headers['x-api-key'] || req.query.api_key;
  if (!env.NEW_PLATFORM_API_KEY || key !== env.NEW_PLATFORM_API_KEY) {
    return res.status(401).json({ error: 'Invalid or missing API key' });
  }
  return next();
}

// ──────────────────────────────────────────────────────────────
// POST /api/new-platform-leads
// Public endpoint for the digital marketing team to submit leads.
// Authenticate with: header  X-Api-Key: <key>
//                 or query   ?api_key=<key>
//
// Body (all fields optional except at least one contact field):
// {
//   "parent_name":      "Ali Hassan",
//   "parent_phone":     "0123456789",
//   "parent_email":     "ali@example.com",
//   "children_count":   2,
//   "children":         [{ "name": "Amir", "age": 8 }],
//   "preferred_branch": "Subang Taipan",
//   "branch":           "subang_taipan",
//   "remarks":          "Interested in trial",
//   "lead_source":      "tiktok",
//   "platform":         "tiktok_shop",
//   "landing_page_url": "https://...",
//   "device_type":      "mobile",
//   "utm_source":       "tiktok",
//   "utm_medium":       "paid",
//   "utm_campaign":     "may_trial",
//   "utm_content":      "video_ad_1",
//   "utm_term":         "",
//   "fbclid":           "",
//   "gclid":            ""
// }
// ──────────────────────────────────────────────────────────────
router.post('/', requireApiKey, async (req, res, next) => {
  try {
    const {
      parent_name = '',
      parent_phone = '',
      parent_email = '',
      children_count = null,
      children = null,
      preferred_branch = '',
      branch = '',
      remarks = '',
      lead_source = '',
      platform = '',
      landing_page_url = '',
      device_type = '',
      utm_source = '',
      utm_medium = '',
      utm_campaign = '',
      utm_content = '',
      utm_term = '',
      fbclid = '',
      gclid = '',
    } = req.body;

    if (!parent_phone && !parent_email && !parent_name) {
      return res.status(400).json({ error: 'At least one of parent_name, parent_phone, or parent_email is required' });
    }

    // Normalise location_key from branch or preferred_branch
    const raw = (branch || preferred_branch || '').toLowerCase().replace(/\s+/g, '_');
    const location_key = raw || null;

    const { rows } = await pool.query(
      `INSERT INTO new_platform_leads
         (parent_name, parent_phone, parent_email, children_count, children,
          preferred_branch, location_key, branch, remarks, lead_source, platform,
          landing_page_url, device_type,
          utm_source, utm_medium, utm_campaign, utm_content, utm_term,
          fbclid, gclid, raw_payload)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21)
       RETURNING id, received_at`,
      [
        parent_name    || null,
        parent_phone   || null,
        parent_email   || null,
        children_count || null,
        children       ? JSON.stringify(children) : null,
        preferred_branch || null,
        location_key,
        branch         || null,
        remarks        || null,
        lead_source    || null,
        platform       || null,
        landing_page_url || null,
        device_type    || null,
        utm_source     || null,
        utm_medium     || null,
        utm_campaign   || null,
        utm_content    || null,
        utm_term       || null,
        fbclid         || null,
        gclid          || null,
        JSON.stringify(req.body),
      ]
    );

    await pool.query(
      `INSERT INTO master_leads_base
         (source, full_name, email, phone, branch, submission_date, children_count, children_details, campaign_name)
       VALUES ($1, $2, $3, $4, $5, NOW(), $6, $7, $8)
       ON CONFLICT DO NOTHING`,
      [
        lead_source || platform || 'new_platform',
        parent_name   || null,
        parent_email  || null,
        parent_phone  || null,
        preferred_branch || branch || null,
        children_count || null,
        children ? JSON.stringify(children) : null,
        utm_campaign   || null,
      ]
    );

    if (location_key) {
      pushToGHL(
        parent_name, parent_email || null, parent_phone || null,
        location_key,
        lead_source || platform || 'new_platform',
        Array.isArray(children) ? children : null,
      ).catch(err => console.error('[new-platform-leads → GHL] push failed:', err.message));
    }

    return res.status(201).json({ status: 'ok', id: rows[0].id, received_at: rows[0].received_at });
  } catch (err) {
    return next(err);
  }
});

// ──────────────────────────────────────────────────────────────
// GET /api/new-platform-leads
// Internal — requires dashboard login. Supports pagination + filters.
// ──────────────────────────────────────────────────────────────
router.get('/', requireAuth, requireRole(['super_admin', 'ceo', 'marketing', 'od']), async (req, res, next) => {
  try {
    const {
      date_from = '', date_to = '',
      branch = '', lead_source = '', platform = '',
      search = '',
      page = 1, limit = 50,
    } = req.query;

    const conditions = [];
    const params = [];
    let idx = 1;

    if (date_from) { conditions.push(`(received_at AT TIME ZONE 'Asia/Kuala_Lumpur')::date >= $${idx++}::date`); params.push(date_from); }
    if (date_to)   { conditions.push(`(received_at AT TIME ZONE 'Asia/Kuala_Lumpur')::date <= $${idx++}::date`); params.push(date_to); }
    if (branch)      { conditions.push(`location_key = $${idx++}`); params.push(branch); }
    if (lead_source) { conditions.push(`lead_source = $${idx++}`); params.push(lead_source); }
    if (platform)    { conditions.push(`platform = $${idx++}`); params.push(platform); }
    if (search) {
      conditions.push(`(parent_name ILIKE $${idx} OR parent_phone ILIKE $${idx} OR parent_email ILIKE $${idx})`);
      params.push(`%${search}%`);
      idx++;
    }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    const offset = (Number(page) - 1) * Number(limit);

    const [countRes, dataRes] = await Promise.all([
      pool.query(`SELECT COUNT(*) FROM new_platform_leads ${where}`, params),
      pool.query(
        `SELECT id, parent_name, parent_phone, parent_email, children_count, children,
                preferred_branch, location_key, branch, remarks, lead_source, platform,
                utm_source, utm_medium, utm_campaign, landing_page_url, device_type,
                (received_at AT TIME ZONE 'Asia/Kuala_Lumpur') AS received_at_local
         FROM new_platform_leads ${where}
         ORDER BY received_at DESC
         LIMIT $${idx} OFFSET $${idx + 1}`,
        [...params, Number(limit), offset]
      ),
    ]);

    return res.json({
      records: dataRes.rows,
      total: parseInt(countRes.rows[0].count, 10),
      page: Number(page),
      totalPages: Math.ceil(parseInt(countRes.rows[0].count, 10) / Number(limit)),
    });
  } catch (err) {
    return next(err);
  }
});

module.exports = { newPlatformLeadsRouter: router };
