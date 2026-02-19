const express = require('express');
const { requireAuth, requireRole } = require('../middleware/auth');
const { pool } = require('../db');

const router = express.Router();

// Mirrors the Streamlit logic from `app.py` (meta_spend table) and returns
// per-channel stats for today / yesterday / 7d / 30d.
router.get('/performance', requireAuth, requireRole(['super_admin', 'ceo', 'marketing', 'od']), async (_req, res, next) => {
  try {
    // Account IDs from your Streamlit config
    const ACCOUNTS = {
      MAIN_FB_ID: 'act_1303223119861639',
      TT_ID: '7158009688364204033',
      SARA_ID: 'act_2740903809519822',
      ONLINE_ID: 'act_1235601843302851',
    };

    const query = `
      SELECT
        $1::text as channel_key,
        SUM(spend) FILTER (WHERE data_date::date = CURRENT_DATE) as spend_today,
        SUM(leads) FILTER (WHERE data_date::date = CURRENT_DATE) as leads_today,
        SUM(conversions) FILTER (WHERE data_date::date = CURRENT_DATE) as convs_today,
        SUM(spend) FILTER (WHERE data_date::date = CURRENT_DATE AND leads > 0) as lead_spend_today,
        SUM(spend) FILTER (WHERE data_date::date = CURRENT_DATE AND conversions > 0) as conv_spend_today,

        SUM(spend) FILTER (WHERE data_date::date = CURRENT_DATE - 1) as spend_yesterday,
        SUM(leads) FILTER (WHERE data_date::date = CURRENT_DATE - 1) as leads_yesterday,
        SUM(conversions) FILTER (WHERE data_date::date = CURRENT_DATE - 1) as convs_yesterday,
        SUM(spend) FILTER (WHERE data_date::date = CURRENT_DATE - 1 AND leads > 0) as lead_spend_yesterday,
        SUM(spend) FILTER (WHERE data_date::date = CURRENT_DATE - 1 AND conversions > 0) as conv_spend_yesterday,

        SUM(spend) FILTER (WHERE data_date::date >= CURRENT_DATE - INTERVAL '7 days') as spend_7d,
        SUM(leads) FILTER (WHERE data_date::date >= CURRENT_DATE - INTERVAL '7 days') as leads_7d,
        SUM(conversions) FILTER (WHERE data_date::date >= CURRENT_DATE - INTERVAL '7 days') as convs_7d,
        SUM(spend) FILTER (WHERE data_date::date >= CURRENT_DATE - INTERVAL '7 days' AND leads > 0) as lead_spend_7d,
        SUM(spend) FILTER (WHERE data_date::date >= CURRENT_DATE - INTERVAL '7 days' AND conversions > 0) as conv_spend_7d,

        SUM(spend) FILTER (WHERE data_date::date >= CURRENT_DATE - INTERVAL '30 days') as spend_30d,
        SUM(leads) FILTER (WHERE data_date::date >= CURRENT_DATE - INTERVAL '30 days') as leads_30d,
        SUM(conversions) FILTER (WHERE data_date::date >= CURRENT_DATE - INTERVAL '30 days') as convs_30d,
        SUM(spend) FILTER (WHERE data_date::date >= CURRENT_DATE - INTERVAL '30 days' AND leads > 0) as lead_spend_30d,
        SUM(spend) FILTER (WHERE data_date::date >= CURRENT_DATE - INTERVAL '30 days' AND conversions > 0) as conv_spend_30d
      FROM meta_spend
      WHERE account_id = $2
    `;

    const campaignQuery = `
      SELECT
        campaign_name,
        SUM(spend) FILTER (WHERE data_date::date = CURRENT_DATE) as spend_today,
        SUM(leads) FILTER (WHERE data_date::date = CURRENT_DATE) as leads_today,
        SUM(conversions) FILTER (WHERE data_date::date = CURRENT_DATE) as convs_today,
        SUM(spend) FILTER (WHERE data_date::date = CURRENT_DATE AND leads > 0) as lead_spend_today,
        SUM(spend) FILTER (WHERE data_date::date = CURRENT_DATE AND conversions > 0) as conv_spend_today,

        SUM(spend) FILTER (WHERE data_date::date = CURRENT_DATE - 1) as spend_yesterday,
        SUM(leads) FILTER (WHERE data_date::date = CURRENT_DATE - 1) as leads_yesterday,
        SUM(conversions) FILTER (WHERE data_date::date = CURRENT_DATE - 1) as convs_yesterday,
        SUM(spend) FILTER (WHERE data_date::date = CURRENT_DATE - 1 AND leads > 0) as lead_spend_yesterday,
        SUM(spend) FILTER (WHERE data_date::date = CURRENT_DATE - 1 AND conversions > 0) as conv_spend_yesterday,

        SUM(spend) FILTER (WHERE data_date::date >= CURRENT_DATE - INTERVAL '7 days') as spend_7d,
        SUM(leads) FILTER (WHERE data_date::date >= CURRENT_DATE - INTERVAL '7 days') as leads_7d,
        SUM(conversions) FILTER (WHERE data_date::date >= CURRENT_DATE - INTERVAL '7 days') as convs_7d,
        SUM(spend) FILTER (WHERE data_date::date >= CURRENT_DATE - INTERVAL '7 days' AND leads > 0) as lead_spend_7d,
        SUM(spend) FILTER (WHERE data_date::date >= CURRENT_DATE - INTERVAL '7 days' AND conversions > 0) as conv_spend_7d,

        SUM(spend) FILTER (WHERE data_date::date >= CURRENT_DATE - INTERVAL '30 days') as spend_30d,
        SUM(leads) FILTER (WHERE data_date::date >= CURRENT_DATE - INTERVAL '30 days') as leads_30d,
        SUM(conversions) FILTER (WHERE data_date::date >= CURRENT_DATE - INTERVAL '30 days') as convs_30d,
        SUM(spend) FILTER (WHERE data_date::date >= CURRENT_DATE - INTERVAL '30 days' AND leads > 0) as lead_spend_30d,
        SUM(spend) FILTER (WHERE data_date::date >= CURRENT_DATE - INTERVAL '30 days' AND conversions > 0) as conv_spend_30d
      FROM meta_spend
      WHERE account_id = $1
      GROUP BY campaign_name
      ORDER BY spend_30d DESC
      LIMIT 10
    `;

    const [mainFb, tt, sara, online] = await Promise.all([
      pool.query(query, ['fb_group', ACCOUNTS.MAIN_FB_ID]),
      pool.query(query, ['tiktok', ACCOUNTS.TT_ID]),
      pool.query(query, ['sara', ACCOUNTS.SARA_ID]),
      pool.query(query, ['online', ACCOUNTS.ONLINE_ID]),
    ]);

    // Campaign queries - handle potential missing campaign_name column gracefully
    let fbCampaigns = { rows: [] };
    let ttCampaigns = { rows: [] };
    let saraCampaigns = { rows: [] };
    let onlineCampaigns = { rows: [] };

    try {
      [fbCampaigns, ttCampaigns, saraCampaigns, onlineCampaigns] = await Promise.all([
        pool.query(campaignQuery, [ACCOUNTS.MAIN_FB_ID]),
        pool.query(campaignQuery, [ACCOUNTS.TT_ID]),
        pool.query(campaignQuery, [ACCOUNTS.SARA_ID]),
        pool.query(campaignQuery, [ACCOUNTS.ONLINE_ID]),
      ]);
    } catch (campaignErr) {
      // If campaign queries fail (e.g., campaign_name column doesn't exist), continue without campaigns
      console.warn('Campaign data not available:', campaignErr.message);
    }

    function toPeriodStats(row, prefix) {
      const spend = Number(row[`spend_${prefix}`] ?? 0);
      const leads = Number(row[`leads_${prefix}`] ?? 0);
      const convs = Number(row[`convs_${prefix}`] ?? 0);
      const leadSpend = Number(row[`lead_spend_${prefix}`] ?? 0);
      const convSpend = Number(row[`conv_spend_${prefix}`] ?? 0);
      const cpl = leads > 0 ? leadSpend / leads : 0;
      const cpc = convs > 0 ? convSpend / convs : 0;

      return {
        spend,
        leads,
        convs,
        leadSpend,
        convSpend,
        cpl,
        cpc,
      };
    }

    function formatChannel(result) {
      const row = result.rows[0] || {};
      return {
        today: toPeriodStats(row, 'today'),
        yesterday: toPeriodStats(row, 'yesterday'),
        d7: toPeriodStats(row, '7d'),
        d30: toPeriodStats(row, '30d'),
      };
    }

    function formatCampaigns(result) {
      return result.rows.map(row => ({
        name: row.campaign_name,
        today: toPeriodStats(row, 'today'),
        yesterday: toPeriodStats(row, 'yesterday'),
        d7: toPeriodStats(row, '7d'),
        d30: toPeriodStats(row, '30d'),
      }));
    }

    const channels = {
      fb_group: formatChannel(mainFb),
      tiktok: formatChannel(tt),
      sara: formatChannel(sara),
      online: formatChannel(online),
    };

    const campaigns = {
      fb_group: formatCampaigns(fbCampaigns),
      tiktok: formatCampaigns(ttCampaigns),
      sara: formatCampaigns(saraCampaigns),
      online: formatCampaigns(onlineCampaigns),
    };

    // Streamlit "Ebright Group Expenses" total = FB (Group) + TikTok
    function sumPeriods(a, b) {
      const out = {};
      for (const k of ['today', 'yesterday', 'd7', 'd30']) {
        const A = a[k];
        const B = b[k];
        const spend = (A?.spend || 0) + (B?.spend || 0);
        const leads = (A?.leads || 0) + (B?.leads || 0);
        const convs = (A?.convs || 0) + (B?.convs || 0);
        const leadSpend = (A?.leadSpend || 0) + (B?.leadSpend || 0);
        const convSpend = (A?.convSpend || 0) + (B?.convSpend || 0);
        out[k] = {
          spend,
          leads,
          convs,
          leadSpend,
          convSpend,
          cpl: leads > 0 ? leadSpend / leads : 0,
          cpc: convs > 0 ? convSpend / convs : 0,
        };
      }
      return out;
    }

    const groups = {
      ebright_group_expenses: sumPeriods(channels.fb_group, channels.tiktok),
    };

    return res.json({ channels, groups, campaigns });
  } catch (err) {
    return next(err);
  }
});

module.exports = { marketingRouter: router };

