/**
 * Google Spend helper module
 * Fetches spend and conversion data from google_spend database table
 */

const { pool } = require('../db');

// Query google_spend table for metrics across different time periods
async function getGoogleSpendData(accountId = null, month = null, year = null) {
  try {
    let dateFilter = '';
    let params = [];
    
    if (month && year) {
      dateFilter = `AND EXTRACT(MONTH FROM data_date) = $${accountId ? '2' : '1'} AND EXTRACT(YEAR FROM data_date) = $${accountId ? '3' : '2'}`;
      params = [parseInt(month), parseInt(year)];
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
        SUM(spend) as spend_monthly,
        SUM(leads) as leads_monthly,
        SUM(spend) FILTER (WHERE leads > 0) as lead_spend_monthly
      FROM google_spend
      WHERE 1=1 ${accountId ? 'AND account_id = $1' : ''} ${dateFilter}
    `;

    const result = await pool.query(query, accountId ? [accountId, ...params] : params);
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
    let dateFilter = '';
    let params = [];
    
    if (month && year) {
      dateFilter = `AND EXTRACT(MONTH FROM data_date) = $${accountId ? '2' : '1'} AND EXTRACT(YEAR FROM data_date) = $${accountId ? '3' : '2'}`;
      params = [parseInt(month), parseInt(year)];
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
        SUM(spend) as spend_monthly,
        SUM(leads) as leads_monthly,
        SUM(spend) FILTER (WHERE leads > 0) as lead_spend_monthly
      FROM google_spend
      WHERE campaign_name IS NOT NULL
      ${accountId ? 'AND account_id = $1' : ''} ${dateFilter}
      GROUP BY campaign_name
      ORDER BY spend_monthly DESC
      LIMIT 10
    `;

    const result = await pool.query(query, accountId ? [accountId, ...params] : params);
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
