const express = require('express');
const { pool } = require('../db');
const { env } = require('../env');

const router = express.Router();

function getField(userColumnData, ...keys) {
  for (const entry of (userColumnData || [])) {
    const id = (entry.column_id || '').toLowerCase();
    if (keys.some(k => id.includes(k.toLowerCase()))) {
      return (entry.string_value || '').trim();
    }
  }
  return '';
}

router.post('/webhook', async (req, res) => {
  try {
    const payload = req.body;

    if (env.GOOGLE_ADS_WEBHOOK_KEY) {
      if (payload.google_key !== env.GOOGLE_ADS_WEBHOOK_KEY) {
        return res.status(401).json({ error: 'Invalid webhook key' });
      }
    }

    const cols      = payload.user_column_data || [];
    const fullName  = getField(cols, 'full_name', 'name');
    const email     = getField(cols, 'email').toLowerCase();
    const phone     = getField(cols, 'phone');
    const branchRaw = getField(cols, 'branch', 'nearest', 'cawangan', 'preferred');

    if (!email) {
      return res.status(200).json({ status: 'ignored', reason: 'no email' });
    }

    // Dedup by lead_id (Google guarantees uniqueness)
    const leadId = payload.lead_id || null;
    if (leadId) {
      const { rows: dup } = await pool.query(
        'SELECT 1 FROM google_ads_leads WHERE lead_id = $1 LIMIT 1',
        [leadId]
      );
      if (dup.length > 0) {
        return res.status(200).json({ status: 'ignored', reason: 'duplicate lead_id' });
      }
    }

    // Resolve branch via branch_mapping (same logic as Meta)
    let branch = null;
    if (branchRaw) {
      const { rows: bm } = await pool.query(
        'SELECT official_name FROM branch_mapping WHERE LOWER(keyword) = LOWER($1) LIMIT 1',
        [branchRaw]
      );
      if (bm.length > 0) {
        branch = bm[0].official_name;
      } else {
        // Fallback: partial match on form_name style (keyword contained in branchRaw)
        const { rows: bm2 } = await pool.query(
          `SELECT official_name FROM branch_mapping
           WHERE LOWER($1) LIKE '%' || LOWER(keyword) || '%'
           ORDER BY LENGTH(keyword) DESC LIMIT 1`,
          [branchRaw]
        );
        branch = bm2.length > 0 ? bm2[0].official_name : branchRaw;
      }
    }

    const campaignId   = payload.campaign_id   || null;
    const campaignName = payload.campaign_name  || null;
    const adgroupId    = payload.adgroup_id     || null;
    const adgroupName  = payload.adgroup_name   || null;
    const formId       = payload.form_id        || null;
    const gclId        = payload.gcl_id         || null;
    const isTest       = payload.is_test        || false;

    await pool.query(
      `INSERT INTO google_ads_leads
         (lead_id, full_name, email, phone, branch_raw, branch,
          campaign_id, campaign_name, adgroup_id, adgroup_name,
          form_id, gcl_id, is_test, raw_payload)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
       ON CONFLICT (lead_id) DO NOTHING`,
      [leadId, fullName, email, phone, branchRaw, branch,
       campaignId, campaignName, adgroupId, adgroupName,
       formId, gclId, isTest, JSON.stringify(payload)]
    );

    // Insert into master_leads_base so it appears on the dashboard
    if (!isTest) {
      await pool.query(
        `INSERT INTO master_leads_base (source, full_name, email, phone, branch, submission_date, campaign_name)
         VALUES ('google_lead_form', $1, $2, $3, $4, NOW(), $5)
         ON CONFLICT DO NOTHING`,
        [fullName, email, phone, branch, campaignName]
      );
    }

    return res.status(200).json({ status: 'ok' });
  } catch (err) {
    console.error('[Google Ads webhook]', err.message);
    return res.status(200).json({ status: 'error', message: err.message });
  }
});

module.exports = { googleAdsLeadsRouter: router };
