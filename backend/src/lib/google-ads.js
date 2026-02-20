/**
 * Google Spend helper module
 * Fetches spend and conversion data from google_spend database table
 */

const { pool } = require('../db');

// Query google_spend table for metrics across different time periods
async function getGoogleSpendData(accountId = null, month = null, year = null) {
  try {
    const params = [];
    let accountFilter = '';
    let monthFilter = '';
    
    if (accountId) {
      params.push(accountId);
      accountFilter = `AND account_id = $${params.length}`;
    }
    
    if (month && year) {
      params.push(parseInt(month));
      monthFilter += ` AND EXTRACT(MONTH FROM data_date) = $${params.length}`;
      params.push(parseInt(year));
      monthFilter += ` AND EXTRACT(YEAR FROM data_date) = $${params.length}`;
    } else {
      const now = new Date();
      params.push(now.getMonth() + 1);
      monthFilter += ` AND EXTRACT(MONTH FROM data_date) = $${params.length}`;
      params.push(now.getFullYear());
      monthFilter += ` AND EXTRACT(YEAR FROM data_date) = $${params.length}`;
    }

    const query = `
      SELECT
        'google'::text as channel_key,
        SUM(spend) FILTER (WHERE data_date::date = CURRENT_DATE) as spend_today,
        SUM(leads) FILTER (WHERE data_date::date = CURRENT_DATE) as leads_today,
        SUM(spend) FILTER (WHERE data_date::date = CURRENT_DATE AND leads > 0) as lead_spend_today,

        SUM(spend) FILTER (WHERE data_date::date = CURRENT_DATE - 1) as spend_yesterday,
        SUM(leads) FILTER (WHERE data_date::date = CURRENT_DATE - 1) as leads_yesterday,
        SUM(spend) FILTER (WHERE data_date::date = CURRENT_DATE - 1 AND leads > 0) as lead_spend_yesterday,

        SUM(spend) FILTER (WHERE data_date::date >= CURRENT_DATE - INTERVAL '7 days') as spend_7d,
        SUM(leads) FILTER (WHERE data_date::date >= CURRENT_DATE - INTERVAL '7 days') as leads_7d,
        SUM(spend) FILTER (WHERE data_date::date >= CURRENT_DATE - INTERVAL '7 days' AND leads > 0) as lead_spend_7d,

        SUM(spend) FILTER (WHERE data_date::date >= CURRENT_DATE - INTERVAL '30 days') as spend_30d,
        SUM(leads) FILTER (WHERE data_date::date >= CURRENT_DATE - INTERVAL '30 days') as leads_30d,
        SUM(spend) FILTER (WHERE data_date::date >= CURRENT_DATE - INTERVAL '30 days' AND leads > 0) as lead_spend_30d,
        
        -- Monthly stats for charts
        SUM(spend) FILTER (WHERE 1=1 ${monthFilter}) as spend_monthly,
        SUM(leads) FILTER (WHERE 1=1 ${monthFilter}) as leads_monthly
      FROM google_spend
      WHERE 1=1 ${accountFilter}
    `;

    const result = await pool.query(query, params);
    return result;
  } catch (error) {
    console.error('Error fetching Google spend data from database:', error.message);
    // Return empty result object on error
    return { rows: [{}] };
  }
}

// Query campaign data from google_spend table
async function getGoogleCampaignData(accountId = null, month = null, year = null) {
  try {
    const params = [];
    let accountFilter = '';
    let monthFilter = '';
    
    if (accountId) {
      params.push(accountId);
      accountFilter = `AND account_id = $${params.length}`;
    }
    
    if (month && year) {
      params.push(parseInt(month));
      monthFilter += ` AND EXTRACT(MONTH FROM data_date) = $${params.length}`;
      params.push(parseInt(year));
      monthFilter += ` AND EXTRACT(YEAR FROM data_date) = $${params.length}`;
    } else {
      const now = new Date();
      params.push(now.getMonth() + 1);
      monthFilter += ` AND EXTRACT(MONTH FROM data_date) = $${params.length}`;
      params.push(now.getFullYear());
      monthFilter += ` AND EXTRACT(YEAR FROM data_date) = $${params.length}`;
    }

    const query = `
      SELECT
        campaign_name,
        SUM(spend) FILTER (WHERE data_date::date = CURRENT_DATE) as spend_today,
        SUM(leads) FILTER (WHERE data_date::date = CURRENT_DATE) as leads_today,
        SUM(spend) FILTER (WHERE data_date::date = CURRENT_DATE AND leads > 0) as lead_spend_today,

        SUM(spend) FILTER (WHERE data_date::date = CURRENT_DATE - 1) as spend_yesterday,
        SUM(leads) FILTER (WHERE data_date::date = CURRENT_DATE - 1) as leads_yesterday,
        SUM(spend) FILTER (WHERE data_date::date = CURRENT_DATE - 1 AND leads > 0) as lead_spend_yesterday,

        SUM(spend) FILTER (WHERE data_date::date >= CURRENT_DATE - INTERVAL '7 days') as spend_7d,
        SUM(leads) FILTER (WHERE data_date::date >= CURRENT_DATE - INTERVAL '7 days') as leads_7d,
        SUM(spend) FILTER (WHERE data_date::date >= CURRENT_DATE - INTERVAL '7 days' AND leads > 0) as lead_spend_7d,

        SUM(spend) FILTER (WHERE data_date::date >= CURRENT_DATE - INTERVAL '30 days') as spend_30d,
        SUM(leads) FILTER (WHERE data_date::date >= CURRENT_DATE - INTERVAL '30 days') as leads_30d,
        SUM(spend) FILTER (WHERE data_date::date >= CURRENT_DATE - INTERVAL '30 days' AND leads > 0) as lead_spend_30d,
        
        -- Monthly stats for charts
        SUM(spend) FILTER (WHERE 1=1 ${monthFilter}) as spend_monthly,
        SUM(leads) FILTER (WHERE 1=1 ${monthFilter}) as leads_monthly
      FROM google_spend
      WHERE campaign_name IS NOT NULL ${accountFilter}
      GROUP BY campaign_name
      ORDER BY spend_monthly DESC NULLS LAST
      LIMIT 10
    `;

    const result = await pool.query(query, params);
    return result;
  } catch (error) {
    console.error('Error fetching Google campaign data from database:', error.message);
    // Return empty result object on error
    return { rows: [] };
  }
}

module.exports = {
  getGoogleSpendData,
  getGoogleCampaignData,
};
