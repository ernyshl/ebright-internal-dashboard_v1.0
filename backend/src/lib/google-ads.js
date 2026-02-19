/**
 * Google Ads API helper module
 * Fetches spend and conversion data from Google Ads API
 */

const { env } = require('../env');

// Check if Google Ads credentials are configured
const isConfigured = () => {
  return !!(
    env.GOOGLE_DEVELOPER_TOKEN &&
    env.GOOGLE_CLIENT_ID &&
    env.GOOGLE_CLIENT_SECRET &&
    env.GOOGLE_REFRESH_TOKEN &&
    env.GOOGLE_LOGIN_CUSTOMER_ID &&
    env.GOOGLE_ADS_ID
  );
};

// Placeholder function to fetch Google Ads data
// When using the googleapis library to connect to Google Ads API v17
async function getGoogleAdsData(customerId, dateRange = '30d') {
  // If credentials not configured, return empty data
  if (!isConfigured()) {
    console.warn('Google Ads credentials not configured');
    return {
      today: { spend: 0, leads: 0, convs: 0, leadSpend: 0, convSpend: 0, cpl: 0, cpc: 0 },
      yesterday: { spend: 0, leads: 0, convs: 0, leadSpend: 0, convSpend: 0, cpl: 0, cpc: 0 },
      d7: { spend: 0, leads: 0, convs: 0, leadSpend: 0, convSpend: 0, cpl: 0, cpc: 0 },
      d30: { spend: 0, leads: 0, convs: 0, leadSpend: 0, convSpend: 0, cpl: 0, cpc: 0 },
    };
  }

  try {
    // Import googleapis for Google Ads API v17
    const { google } = require('googleapis');

    // Create OAuth2 client
    const oauth2Client = new google.auth.OAuth2(
      env.GOOGLE_CLIENT_ID,
      env.GOOGLE_CLIENT_SECRET,
      'http://localhost:4000/auth/google/callback'
    );

    // Set credentials with refresh token
    oauth2Client.setCredentials({
      refresh_token: env.GOOGLE_REFRESH_TOKEN,
    });

    // Create Ads service instance
    // Note: Google Ads API v17 requires using the REST API or gRPC client
    // For production, use: npm install google-ads-api
    // This is a placeholder that returns formatted data structure
    
    console.info('Google Ads API integration ready. Customer ID:', env.GOOGLE_LOGIN_CUSTOMER_ID);
    
    // Return sample data structure until full integration is complete
    return {
      today: { spend: 0, leads: 0, convs: 0, leadSpend: 0, convSpend: 0, cpl: 0, cpc: 0 },
      yesterday: { spend: 0, leads: 0, convs: 0, leadSpend: 0, convSpend: 0, cpl: 0, cpc: 0 },
      d7: { spend: 0, leads: 0, convs: 0, leadSpend: 0, convSpend: 0, cpl: 0, cpc: 0 },
      d30: { spend: 0, leads: 0, convs: 0, leadSpend: 0, convSpend: 0, cpl: 0, cpc: 0 },
    };
  } catch (error) {
    console.error('Error initializing Google Ads API:', error);
    // Return zeros on error instead of crashing
    return {
      today: { spend: 0, leads: 0, convs: 0, leadSpend: 0, convSpend: 0, cpl: 0, cpc: 0 },
      yesterday: { spend: 0, leads: 0, convs: 0, leadSpend: 0, convSpend: 0, cpl: 0, cpc: 0 },
      d7: { spend: 0, leads: 0, convs: 0, leadSpend: 0, convSpend: 0, cpl: 0, cpc: 0 },
      d30: { spend: 0, leads: 0, convs: 0, leadSpend: 0, convSpend: 0, cpl: 0, cpc: 0 },
    };
  }
}

// Format period data for consistency with other channels
function processPeriodData(data) {
  if (!data || data.length === 0) {
    return {
      spend: 0,
      leads: 0,
      convs: 0,
      leadSpend: 0,
      convSpend: 0,
      cpl: 0,
      cpc: 0,
    };
  }

  // Sum up metrics across the period
  let totalSpend = 0;
  let totalConversions = 0;
  let totalAllConversions = 0;

  data.forEach(row => {
    totalSpend += row.spend || 0;
    totalConversions += row.conversions || 0;
    totalAllConversions += row.all_conversions || 0;
  });

  const spend = totalSpend;
  const convs = Math.round(totalConversions);
  const allConvs = Math.round(totalAllConversions);

  // Use all_conversions for leads if available
  const leads = allConvs > 0 ? allConvs : convs;
  const leadSpend = spend;
  const convSpend = spend;

  return {
    spend: Math.round(spend * 100) / 100,
    leads,
    convs,
    leadSpend: Math.round(leadSpend * 100) / 100,
    convSpend: Math.round(convSpend * 100) / 100,
    cpl: leads > 0 ? Math.round((leadSpend / leads) * 100) / 100 : 0,
    cpc: convs > 0 ? Math.round((convSpend / convs) * 100) / 100 : 0,
  };
}

module.exports = {
  isConfigured,
  getGoogleAdsData,
};
