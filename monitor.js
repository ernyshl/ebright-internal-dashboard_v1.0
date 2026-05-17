const { Pool } = require('pg');
const https = require('https');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN;
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID;

function sendTelegram(message) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({
      chat_id: TELEGRAM_CHAT_ID,
      text: message,
      parse_mode: 'HTML',
    });

    const req = https.request({
      hostname: 'api.telegram.org',
      path: `/bot${TELEGRAM_TOKEN}/sendMessage`,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body),
      },
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve(JSON.parse(data)));
    });

    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

async function runMonitor() {
  try {
    const issues = [];

    // Check 1 — any errors in the last 30 minutes
    const { rows: errors } = await pool.query(`
      SELECT COUNT(*) AS count
      FROM ghl_webhook_log
      WHERE action = 'error'
      AND created_at >= NOW() - INTERVAL '30 minutes'
    `);
    if (parseInt(errors[0].count) > 0) {
      issues.push(`⚠️ <b>${errors[0].count} webhook error(s)</b> in the last 30 minutes`);
    }

    // Check 2 — unrecognised stage warnings in last 30 minutes
    const { rows: unrecognised } = await pool.query(`
      SELECT COUNT(*) AS count,
             STRING_AGG(DISTINCT stage_raw, ', ') AS stages
      FROM ghl_webhook_log
      WHERE action = 'ignored'
      AND ignore_reason = 'unrecognised stage'
      AND created_at >= NOW() - INTERVAL '30 minutes'
    `);
    if (parseInt(unrecognised[0].count) > 0) {
      issues.push(`⚠️ <b>${unrecognised[0].count} unrecognised stage(s)</b>: ${unrecognised[0].stages}`);
    }

    // Check 3 — no webhooks at all during business hours (9am-6pm) in last 2 hours
    const now = new Date();
    const hour = parseInt(now.toLocaleString('en-US', { timeZone: 'Asia/Kuala_Lumpur', hour: 'numeric', hour12: false }));
    if (hour >= 9 && hour <= 18) {
      const { rows: silence } = await pool.query(`
        SELECT COUNT(*) AS count
        FROM ghl_webhook_log
        WHERE created_at >= NOW() - INTERVAL '2 hours'
      `);
      if (parseInt(silence[0].count) === 0) {
        issues.push(`🔇 <b>No webhooks received</b> in the last 2 hours — GHL may have stopped firing`);
      }
    }

    // Send alert if any issues found
    if (issues.length > 0) {
      const message = `🚨 <b>Ebright Webhook Monitor</b>\n${new Date().toLocaleString('en-MY', { timeZone: 'Asia/Kuala_Lumpur' })}\n\n${issues.join('\n\n')}`;
      await sendTelegram(message);
      console.log('[monitor] Alert sent:', issues.length, 'issue(s)');
    } else {
      console.log('[monitor] All clear —', new Date().toISOString());
    }

  } catch (err) {
    console.error('[monitor] Error:', err.message);
  } finally {
    await pool.end();
  }
}

runMonitor();
