const express = require('express');
const { requireAuth, requireRole } = require('../middleware/auth');
const { pool } = require('../db');
const { getGoogleSpendData, getGoogleCampaignData } = require('../lib/google-ads');

const router = express.Router();

// Ad account IDs — move to env vars (e.g. META_MAIN_FB_ID) for easier config management
const ACCOUNTS = {
  MAIN_FB_ID: process.env.META_MAIN_FB_ID || 'act_1303223119861639',
  TT_ID: process.env.META_TT_ID || '7158009688364204033',
  SARA_ID: process.env.META_SARA_ID || 'act_2740903809519822',
  ONLINE_ID: process.env.META_ONLINE_ID || 'act_1235601843302851',
};

// Mirrors the Streamlit logic from `app.py` (meta_spend table) and returns
// per-channel stats for today / yesterday / 7d / 30d.
router.get('/performance', requireAuth, requireRole(['super_admin', 'ceo', 'marketing', 'od']), async (req, res, next) => {
  try {
    const { month, year } = req.query;



    // Base query for standard time windows (Today, Yesterday, 7d, 30d)
    // We use (SELECT MAX(data_date::date) FROM meta_spend) as "Today" to ensure we follow the database's latest data
    const query = `
      WITH latest AS (SELECT MAX(data_date::date) as today FROM meta_spend)
      SELECT
        $1::text as channel_key,
        SUM(spend) FILTER (WHERE data_date::date = (SELECT today FROM latest)) as spend_today,
        SUM(leads) FILTER (WHERE data_date::date = (SELECT today FROM latest)) as leads_today,
        SUM(conversions) FILTER (WHERE data_date::date = (SELECT today FROM latest)) as convs_today,

        SUM(spend) FILTER (WHERE data_date::date = (SELECT today FROM latest) - 1) as spend_yesterday,
        SUM(leads) FILTER (WHERE data_date::date = (SELECT today FROM latest) - 1) as leads_yesterday,
        SUM(conversions) FILTER (WHERE data_date::date = (SELECT today FROM latest) - 1) as convs_yesterday,

        SUM(spend) FILTER (WHERE data_date::date >= (SELECT today FROM latest) - INTERVAL '7 days') as spend_7d,
        SUM(leads) FILTER (WHERE data_date::date >= (SELECT today FROM latest) - INTERVAL '7 days') as leads_7d,
        SUM(conversions) FILTER (WHERE data_date::date >= (SELECT today FROM latest) - INTERVAL '7 days') as convs_7d,

        SUM(spend) FILTER (WHERE data_date::date >= (SELECT today FROM latest) - INTERVAL '30 days') as spend_30d,
        SUM(leads) FILTER (WHERE data_date::date >= (SELECT today FROM latest) - INTERVAL '30 days') as leads_30d,
        SUM(conversions) FILTER (WHERE data_date::date >= (SELECT today FROM latest) - INTERVAL '30 days') as convs_30d,
        
        -- Monthly stats for charts (filtered by query params)
        SUM(spend) FILTER (WHERE EXTRACT(MONTH FROM data_date) = $3 AND EXTRACT(YEAR FROM data_date) = $4) as spend_monthly,
        SUM(leads) FILTER (WHERE EXTRACT(MONTH FROM data_date) = $3 AND EXTRACT(YEAR FROM data_date) = $4) as leads_monthly,
        SUM(conversions) FILTER (WHERE EXTRACT(MONTH FROM data_date) = $3 AND EXTRACT(YEAR FROM data_date) = $4) as convs_monthly
      FROM meta_spend
      WHERE account_id = $2
    `;

    const campaignQuery = `
      WITH latest AS (SELECT MAX(data_date::date) as today FROM meta_spend)
      SELECT
        campaign_name,
        SUM(spend) FILTER (WHERE data_date::date = (SELECT today FROM latest)) as spend_today,
        SUM(leads) FILTER (WHERE data_date::date = (SELECT today FROM latest)) as leads_today,
        SUM(conversions) FILTER (WHERE data_date::date = (SELECT today FROM latest)) as convs_today,

        SUM(spend) FILTER (WHERE data_date::date = (SELECT today FROM latest) - 1) as spend_yesterday,
        SUM(leads) FILTER (WHERE data_date::date = (SELECT today FROM latest) - 1) as leads_yesterday,
        SUM(conversions) FILTER (WHERE data_date::date = (SELECT today FROM latest) - 1) as convs_yesterday,

        SUM(spend) FILTER (WHERE data_date::date >= (SELECT today FROM latest) - INTERVAL '7 days') as spend_7d,
        SUM(leads) FILTER (WHERE data_date::date >= (SELECT today FROM latest) - INTERVAL '7 days') as leads_7d,
        SUM(conversions) FILTER (WHERE data_date::date >= (SELECT today FROM latest) - INTERVAL '7 days') as convs_7d,

        SUM(spend) FILTER (WHERE data_date::date >= (SELECT today FROM latest) - INTERVAL '30 days') as spend_30d,
        SUM(leads) FILTER (WHERE data_date::date >= (SELECT today FROM latest) - INTERVAL '30 days') as leads_30d,
        SUM(conversions) FILTER (WHERE data_date::date >= (SELECT today FROM latest) - INTERVAL '30 days') as convs_30d,
        
        -- Monthly stats for charts (filtered by query params)
        SUM(spend) FILTER (WHERE EXTRACT(MONTH FROM data_date) = $2 AND EXTRACT(YEAR FROM data_date) = $3) as spend_monthly,
        SUM(leads) FILTER (WHERE EXTRACT(MONTH FROM data_date) = $2 AND EXTRACT(YEAR FROM data_date) = $3) as leads_monthly,
        SUM(conversions) FILTER (WHERE EXTRACT(MONTH FROM data_date) = $2 AND EXTRACT(YEAR FROM data_date) = $3) as convs_monthly
      FROM meta_spend
      WHERE account_id = $1
      GROUP BY campaign_name
      ORDER BY spend_monthly DESC NULLS LAST
      LIMIT 10
    `;

    const m = parseInt(month) || (new Date().getMonth() + 1);
    const y = parseInt(year) || new Date().getFullYear();

    const [mainFb, tt, sara, online, googleData, googleCampaigns] = await Promise.all([
      pool.query(query, ['fb_group', ACCOUNTS.MAIN_FB_ID, m, y]),
      pool.query(query, ['tiktok', ACCOUNTS.TT_ID, m, y]),
      pool.query(query, ['sara', ACCOUNTS.SARA_ID, m, y]),
      pool.query(query, ['online', ACCOUNTS.ONLINE_ID, m, y]),
      getGoogleSpendData(null, m, y),
      getGoogleCampaignData(null, m, y),
    ]);

    // Campaign queries - handle potential missing campaign_name column gracefully
    let fbCampaigns = { rows: [] };
    let ttCampaigns = { rows: [] };
    let saraCampaigns = { rows: [] };
    let onlineCampaigns = { rows: [] };

    try {
      [fbCampaigns, ttCampaigns, saraCampaigns, onlineCampaigns] = await Promise.all([
        pool.query(campaignQuery, [ACCOUNTS.MAIN_FB_ID, m, y]),
        pool.query(campaignQuery, [ACCOUNTS.TT_ID, m, y]),
        pool.query(campaignQuery, [ACCOUNTS.SARA_ID, m, y]),
        pool.query(campaignQuery, [ACCOUNTS.ONLINE_ID, m, y]),
      ]);
    } catch (campaignErr) {
      // If campaign queries fail (e.g., campaign_name column doesn't exist), continue without campaigns
      console.warn('Campaign data not available:', campaignErr.message);
    }

    function toPeriodStats(row, prefix) {
      const spend = Number(row[`spend_${prefix}`] ?? 0);
      const leads = Number(row[`leads_${prefix}`] ?? 0);
      const convs = Number(row[`convs_${prefix}`] ?? 0);
      const cpl = leads > 0 ? spend / leads : 0;
      const cpc = convs > 0 ? spend / convs : 0;

      return {
        spend,
        leads,
        convs,
        cpl,
        cpc,
      };
    }

    function toPeriodStatsGoogle(row, prefix) {
      const spend = Number(row[`spend_${prefix}`] ?? 0);
      const leads = Number(row[`leads_${prefix}`] ?? 0);
      const cpl = leads > 0 ? spend / leads : 0;

      return {
        spend,
        leads,
        cpl,
      };
    }

    function formatChannel(result) {
      const row = result.rows[0] || {};
      return {
        today: toPeriodStats(row, 'today'),
        yesterday: toPeriodStats(row, 'yesterday'),
        d7: toPeriodStats(row, '7d'),
        d30: toPeriodStats(row, '30d'),
        monthly: toPeriodStats(row, 'monthly'),
      };
    }

    function formatGoogleChannel(result) {
      const row = result.rows[0] || {};
      return {
        today: toPeriodStatsGoogle(row, 'today'),
        yesterday: toPeriodStatsGoogle(row, 'yesterday'),
        d7: toPeriodStatsGoogle(row, '7d'),
        d30: toPeriodStatsGoogle(row, '30d'),
        monthly: toPeriodStatsGoogle(row, 'monthly'),
      };
    }

    function formatCampaigns(result) {
      return result.rows.map(row => ({
        name: row.campaign_name,
        today: toPeriodStats(row, 'today'),
        yesterday: toPeriodStats(row, 'yesterday'),
        d7: toPeriodStats(row, '7d'),
        d30: toPeriodStats(row, '30d'),
        monthly: toPeriodStats(row, 'monthly'),
      }));
    }

    function formatGoogleCampaigns(result) {
      return result.rows.map(row => ({
        name: row.campaign_name,
        today: toPeriodStatsGoogle(row, 'today'),
        yesterday: toPeriodStatsGoogle(row, 'yesterday'),
        d7: toPeriodStatsGoogle(row, '7d'),
        d30: toPeriodStatsGoogle(row, '30d'),
        monthly: toPeriodStatsGoogle(row, 'monthly'),
      }));
    }

    const channels = {
      fb_group: formatChannel(mainFb),
      tiktok: formatChannel(tt),
      sara: formatChannel(sara),
      online: formatChannel(online),
      google: formatGoogleChannel(googleData),
    };

    const campaigns = {
      fb_group: formatCampaigns(fbCampaigns),
      tiktok: formatCampaigns(ttCampaigns),
      sara: formatCampaigns(saraCampaigns),
      online: formatCampaigns(onlineCampaigns),
      google: formatGoogleCampaigns(googleCampaigns),
    };

    // Streamlit "Main Marketing" total = FB (Group) + TikTok + Google
    // NOTE: Google channel's "leads" field actually represents conversions
    function sumPeriods(fbData, ttData, googleData) {
      const out = {};
      for (const k of ['today', 'yesterday', 'd7', 'd30']) {
        const fb = fbData[k];
        const tt = ttData[k];
        const gg = googleData[k];

        const spend = (fb?.spend || 0) + (tt?.spend || 0) + (gg?.spend || 0);
        const leads = (fb?.leads || 0) + (tt?.leads || 0); // Google doesn't contribute leads
        const convs = (fb?.convs || 0) + (gg?.leads || 0); // Google's "leads" are actually conversions
        const leadSpend = (fb?.leadSpend || 0) + (tt?.leadSpend || 0);
        const convSpend = (fb?.convSpend || 0) + (gg?.leadSpend || 0); // Google's "leadSpend" is conv spend

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
      main_marketing: sumPeriods(channels.fb_group, channels.tiktok, channels.google),
    };

    return res.json({ channels, groups, campaigns });
  } catch (err) {
    return next(err);
  }
});

module.exports = { marketingRouter: router };

