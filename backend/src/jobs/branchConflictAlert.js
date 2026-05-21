const https = require('https');
const cron = require('node-cron');
const { pool } = require('../db');
const { env } = require('../env');

function sendTelegram(text) {
  const botToken = env.TELEGRAM_BOT_TOKEN;
  const chatIds = (env.TELEGRAM_ALERT_CHATS || '').split(',').map(s => s.trim()).filter(Boolean);
  if (!botToken || !chatIds.length) return;

  const body = JSON.stringify({ text, parse_mode: 'Markdown' });
  for (const chatId of chatIds) {
    const req = https.request({
      hostname: 'api.telegram.org',
      path: `/bot${botToken}/sendMessage`,
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) },
    }, () => {});
    req.on('error', err => console.error('[branch-conflict] telegram error:', err.message));
    req.write(JSON.stringify({ chat_id: chatId, text, parse_mode: 'Markdown' }));
    req.end();
  }
}

async function checkBranchConflicts() {
  try {
    // Find leads inserted in the last 2 minutes (overlap to handle timing gaps)
    // that share an email with an earlier record from a DIFFERENT branch.
    const { rows: conflicts } = await pool.query(`
      WITH recent AS (
        SELECT id, LOWER(TRIM(email)) AS email, full_name, branch, source, submission_date
        FROM master_leads_base
        WHERE submission_date >= NOW() - INTERVAL '2 minutes'
          AND branch IS NOT NULL AND TRIM(branch) <> ''
          AND email IS NOT NULL AND TRIM(email) <> ''
      )
      SELECT DISTINCT ON (r.email)
        r.id        AS new_id,
        r.email,
        r.full_name,
        r.branch    AS new_branch,
        r.source    AS new_source,
        r.submission_date AS new_date,
        m.branch    AS prev_branch,
        m.source    AS prev_source,
        m.submission_date AS prev_date
      FROM recent r
      JOIN master_leads_base m
        ON LOWER(TRIM(m.email)) = r.email
       AND m.id < r.id
       AND m.branch IS NOT NULL AND TRIM(m.branch) <> ''
       AND LOWER(TRIM(m.branch)) <> LOWER(TRIM(r.branch))
      ORDER BY r.email, m.submission_date DESC
    `);

    for (const c of conflicts) {
      // Dedup: only alert once per (email, new_branch, prev_branch) combination
      const { rowCount } = await pool.query(
        `INSERT INTO branch_conflict_alert_log (email, new_branch, prev_branch)
         VALUES ($1, $2, $3)
         ON CONFLICT (email, new_branch, prev_branch) DO NOTHING`,
        [c.email, c.new_branch, c.prev_branch]
      );
      if (rowCount === 0) continue; // already alerted for this combination

      const fmt = (d) => d ? new Date(d).toLocaleString('en-MY', {
        timeZone: 'Asia/Kuala_Lumpur', day: 'numeric', month: 'short',
        hour: '2-digit', minute: '2-digit', hour12: false,
      }) : '—';

      const name = c.full_name || '(no name)';
      const text =
        `⚠️ *Duplicate Branch Submission*\n\n` +
        `*Parent:* ${name}\n` +
        `*Email:* ${c.email}\n\n` +
        `📍 *Previous:* ${c.prev_branch} (${c.prev_source || '—'}, ${fmt(c.prev_date)})\n` +
        `📍 *New:* ${c.new_branch} (${c.new_source || '—'}, ${fmt(c.new_date)})`;

      sendTelegram(text);
      console.log(`[branch-conflict] alert sent for ${c.email}: ${c.prev_branch} → ${c.new_branch}`);
    }
  } catch (err) {
    console.error('[branch-conflict] check failed:', err.message);
  }
}

function startBranchConflictAlertJob() {
  // Run every minute — matches the refresh_master_leads_base cron cadence
  cron.schedule('* * * * *', checkBranchConflicts);
  console.log('[branch-conflict] Scheduler started — every minute');
}

module.exports = { startBranchConflictAlertJob };
