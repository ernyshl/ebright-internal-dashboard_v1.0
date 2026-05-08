const cron = require('node-cron');
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function refreshFinanceRenewalView() {
  const start = Date.now();
  try {
    await prisma.$executeRawUnsafe(
      'REFRESH MATERIALIZED VIEW CONCURRENTLY finance_renewal_by_branch'
    );
    const duration = Date.now() - start;

    await prisma.$executeRawUnsafe(`
      INSERT INTO finance_view_refresh_log (view_name, last_refreshed, duration_ms)
      VALUES ('finance_renewal_by_branch', now(), ${duration})
      ON CONFLICT (view_name) DO UPDATE
        SET last_refreshed = EXCLUDED.last_refreshed,
            duration_ms = EXCLUDED.duration_ms
    `);

    console.log(`[finance-refresh] OK — refreshed in ${duration}ms`);
  } catch (err) {
    console.error('[finance-refresh] FAILED:', err.message);
  }
}

function startFinanceRefreshJob() {
  // Every 15 minutes — change to '*/5 * * * *' for 5min, '0 * * * *' for hourly
  cron.schedule('*/15 * * * *', refreshFinanceRenewalView);

  // Run once on startup so the view is fresh after deploys
  refreshFinanceRenewalView();

  console.log('[finance-refresh] Scheduler started — every 15 minutes');
}

module.exports = { startFinanceRefreshJob, refreshFinanceRenewalView };