// Daily 00:05 Asia/Kuala_Lumpur — flip any student whose credit_expiry_date is
// in the past over to package_status = 'Expired'. The package is still valid
// ON the expiry date itself; it only expires the day after. Idempotent — only
// touches rows whose status isn't already 'Expired'.
const cron = require('node-cron');
const { pool } = require('../db');

const TABLES = ['studentrecords', 'studentrecords_testing'];

async function refreshPackageExpiry() {
  const start = Date.now();
  console.log('[package-expiry] starting at', new Date().toISOString());
  let totalUpdated = 0;

  for (const name of TABLES) {
    try {
      const r = await pool.query(
        `UPDATE ${name}
            SET package_status = 'Expired'
          WHERE credit_expiry_date IS NOT NULL
            AND credit_expiry_date < CURRENT_DATE
            AND package_status IS DISTINCT FROM 'Expired'`
      );
      totalUpdated += r.rowCount;
      console.log(`[package-expiry] ${name}: ${r.rowCount} row(s) flipped to Expired`);
    } catch (err) {
      console.error(`[package-expiry] ${name} FAILED:`, err.message);
    }
  }

  console.log(`[package-expiry] done — ${totalUpdated} total updates in ${Date.now() - start}ms`);
}

function startPackageExpiryJob() {
  // 00:05 every day, Asia/Kuala_Lumpur — flips packages whose expiry date has been reached.
  cron.schedule('5 0 * * *', refreshPackageExpiry, {
    timezone: 'Asia/Kuala_Lumpur',
  });
  console.log('[package-expiry] scheduled for 00:05 Asia/Kuala_Lumpur');
}

module.exports = { startPackageExpiryJob, refreshPackageExpiry };
