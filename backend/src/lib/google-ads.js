/**
 * Google Spend helper module
 * Fetches spend and conversion data from google_spend database table
 */

const { pool } = require('../db');

// Query google_spend table for metrics across different time periods
async function getGoogleSpendData(accountId = null) {
  try {
    const query = `
      SELECT
        'google'::text as channel_key,
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
      FROM google_spend
      ${accountId ? 'WHERE account_id = $1' : ''}
    `;

    const result = await pool.query(query, accountId ? [accountId] : []);
    return result;
  } catch (error) {
    console.error('Error fetching Google spend data from database:', error.message);
    // Return empty result object on error
    return { rows: [{}] };
  }
}

// Query campaign data from google_spend table
async function getGoogleCampaignData(accountId = null) {
  try {
    const query = `
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
      FROM google_spend
      ${accountId ? 'WHERE account_id = $1' : ''}
      GROUP BY campaign_name
      ORDER BY spend_30d DESC
      LIMIT 10
    `;

    const result = await pool.query(query, accountId ? [accountId] : []);
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
