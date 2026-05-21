const express = require('express');
const { pool } = require('../db');
const { env }  = require('../env');
const { LOCATION_MAPPING, pushToGHL } = require('../lib/ghlPush');

const router = express.Router();

// The form's BRANCH_TO_LOCATION uses slightly different keys for two branches
const LOCATION_KEY_ALIASES = {
  'dataran_puchong_utama': 'puchong_utama',
  'taman_sri_gombak':      'taman_seri_gombak',
};

// Maps normalized location key → official branch name matching VALID_BRANCHES in leadsCentre
const LOCATION_KEY_TO_OFFICIAL = {
  'online':                 'Online',
  'subang_taipan':          'Subang Taipan',
  'setia_alam':             'Setia Alam',
  'sri_petaling':           'Sri Petaling',
  'kota_damansara':         'Kota Damansara',
  'putrajaya':              'Putrajaya',
  'ampang':                 'Ampang',
  'cyberjaya':              'Cyberjaya',
  'klang':                  'Klang',
  'denai_alam':             'Denai Alam',
  'bandar_baru_bangi':      'Bandar Baru Bangi',
  'danau_kota':             'Danau Kota',
  'shah_alam':              'Shah Alam',
  'bandar_tun_hussein_onn': 'Bandar Tun Hussein Onn',
  'eco_grandeur':           'Eco Grandeur',
  'bandar_seri_putra':      'Bandar Seri Putra',
  'bandar_rimbayu':         'Rimbayu',
  'taman_seri_gombak':      'Taman Sri Gombak',
  'kajang_ttdi_grove':      'Kajang',
  'kota_warisan':           'Kota Warisan',
  'puchong_utama':          'Dataran Puchong Utama',
  'tropicana_sungai_buloh': 'Tropicana Sungai Buloh',
  'puncak_jalil':           'Puncak Jalil',
};

function resolveLocationKey(rawKey) {
  if (!rawKey) return null;
  const normalized = LOCATION_KEY_ALIASES[rawKey] || rawKey;
  return LOCATION_MAPPING[normalized] ? normalized : null;
}

// ── Webhook handler ────────────────────────────────────────────────────────
router.post('/webhook', async (req, res) => {
  try {
    const payload = req.body;

    if (env.WIX_TRIAL_WEBHOOK_KEY) {
      if (payload.webhook_key !== env.WIX_TRIAL_WEBHOOK_KEY) {
        return res.status(401).json({ error: 'Invalid webhook key' });
      }
    }

    const parentName  = (payload.parentName  || '').trim();
    const parentEmail = (payload.parentEmail  || '').trim().toLowerCase();
    const parentPhone = (payload.parentPhone  || '').trim();

    if (!parentEmail && !parentPhone) {
      return res.status(200).json({ status: 'ignored', reason: 'no contact info' });
    }

    // Dedup: same email+phone submitted within 60 seconds
    const { rows: dup } = await pool.query(
      `SELECT 1 FROM wix_trial_form_leads
       WHERE LOWER(parent_email) = $1 AND parent_phone = $2
         AND received_at > NOW() - INTERVAL '60 seconds'
       LIMIT 1`,
      [parentEmail, parentPhone]
    );
    if (dup.length > 0) {
      return res.status(200).json({ status: 'ignored', reason: 'duplicate submission' });
    }

    const rawLocationKey = payload.locationKey || '';
    const locationKey    = resolveLocationKey(rawLocationKey);
    const branch         = locationKey ? (LOCATION_KEY_TO_OFFICIAL[locationKey] || null) : null;
    const children       = Array.isArray(payload.children) ? payload.children : [];
    const childrenCount  = Number(payload.childrenCount) || children.length;
    const leadSource     = (payload.lead_source || 'Trial Class Form').trim();
    const leadSourceKey  = leadSource.toLowerCase().replace(/\s+/g, '_');

    await pool.query(
      `INSERT INTO wix_trial_form_leads
         (parent_name, parent_phone, parent_email, children_count, children,
          preferred_branch, location_key, branch, remarks,
          utm_source, utm_medium, utm_campaign, utm_content, utm_term,
          lead_source, landing_page_url, device_type, fbclid, gclid, raw_payload)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20)`,
      [
        parentName, parentPhone, parentEmail, childrenCount,
        children.length > 0 ? JSON.stringify(children) : null,
        payload.preferredBranch || '', rawLocationKey, branch,
        payload.remarks || '',
        payload.utm_source || '', payload.utm_medium || '',
        payload.utm_campaign || '', payload.utm_content || '', payload.utm_term || '',
        leadSource,
        payload.landing_page_url || '', payload.device_type || '',
        payload.fbclid || '', payload.gclid || '',
        JSON.stringify(payload),
      ]
    );

    await pool.query(
      `INSERT INTO master_leads_base (source, full_name, email, phone, branch, submission_date, campaign_name)
       VALUES ($1, $2, $3, $4, $5, NOW(), $6)
       ON CONFLICT DO NOTHING`,
      [leadSourceKey, parentName, parentEmail, parentPhone, branch, payload.utm_campaign || null]
    );

    if (locationKey) {
      pushToGHL(parentName, parentEmail, parentPhone, locationKey, leadSource, children)
        .catch(err => console.error('[Wix Trial → GHL] push failed:', err.message));
    } else {
      console.warn(`[Wix Trial] Could not resolve GHL location key for: ${rawLocationKey}`);
    }

    return res.status(200).json({ status: 'ok' });
  } catch (err) {
    console.error('[Wix Trial webhook]', err.message);
    return res.status(200).json({ status: 'error', message: err.message });
  }
});

module.exports = { wixTrialFormLeadsRouter: router };
