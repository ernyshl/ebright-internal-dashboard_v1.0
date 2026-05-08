const express = require('express');
const { pool } = require('../db');

const router = express.Router();

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const ALLOWED_CHAT_IDS = (process.env.TELEGRAM_ALLOWED_CHATS || '')
  .split(',')
  .map(s => s.trim())
  .filter(Boolean);

if (!BOT_TOKEN) {
  console.warn('[telegramBot] TELEGRAM_BOT_TOKEN not set — webhook will reject calls');
}
if (ALLOWED_CHAT_IDS.length === 0) {
  console.warn('[telegramBot] TELEGRAM_ALLOWED_CHATS not set — webhook will ignore all messages');
}

function fmtRM(n) {
  return `RM ${Number(n || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

async function getLeadsToday() {
  // Without siblings — mirrors Branch Distribution Summary + Lead Sources.
  const { rows } = await pool.query(`
    SELECT
      CASE
        WHEN TRIM(lead_source) = 'Meta' THEN 'Meta'
        WHEN TRIM(lead_source) = 'TikTok' THEN 'TikTok'
        WHEN LOWER(TRIM(lead_source)) = 'trial class form' THEN 'Website (Conversion)'
        WHEN LOWER(TRIM(lead_source)) = 'roadshow' THEN 'Roadshow'
        WHEN LOWER(TRIM(lead_source)) IN ('self generated lead','self-generated lead','selfgenerated lead','self generated','self-generated','sgl','s.g.l') THEN 'Self Generated Lead'
        WHEN LOWER(TRIM(lead_source)) IN ('walk in','walk-in','walkin','walk_in') THEN 'Walk In'
        WHEN LOWER(TRIM(lead_source)) = 'website' THEN 'Website (Organic)'
        ELSE 'Others'
      END as source,
      COUNT(*) as count
    FROM master_leads_powerbi
    WHERE (submitted_at AT TIME ZONE 'Asia/Kuala_Lumpur')::date = (NOW() AT TIME ZONE 'Asia/Kuala_Lumpur')::date
      AND sibling_index = 1
    GROUP BY 1
    ORDER BY count DESC;
  `);
  return rows;
}

async function getSpendBreakdown() {
  // Mirrors backend/src/routes/marketing.js: dashboard reads spend from
  // meta_spend (4 ad accounts) + google_spend. The tiktok_spend table is NOT
  // used by the marketing dashboard — TikTok numbers there come from
  // META_TT_ID inside meta_spend, so the bot mirrors the same source.
  // Earlier MAX(spend) GROUP BY account_id was wrong: meta_spend has multiple
  // campaigns per account, so MAX collapsed them to one campaign's value.
  // SUM is correct because the unique constraint (account_id, campaign_name,
  // data_date) prevents the duplicate-row race we originally guarded against.
  const FB_ACCOUNTS = [
    process.env.META_MAIN_FB_ID,
    process.env.META_SARA_ID,
    process.env.META_ONLINE_ID,
  ].filter(Boolean);
  const TT_ACCOUNT = process.env.META_TT_ID || '';
  const { rows } = await pool.query(`
    SELECT
      COALESCE((SELECT SUM(spend) FROM meta_spend
         WHERE data_date::date = (SELECT MAX(data_date::date) FROM meta_spend)
           AND account_id = ANY($1::text[])
       ), 0) AS meta,
      COALESCE((SELECT SUM(spend) FROM meta_spend
         WHERE data_date::date = (SELECT MAX(data_date::date) FROM meta_spend)
           AND account_id = $2
       ), 0) AS tiktok,
      COALESCE((SELECT SUM(spend) FROM google_spend
         WHERE data_date::date = (SELECT MAX(data_date::date) FROM google_spend)
       ), 0) AS google
  `, [FB_ACCOUNTS, TT_ACCOUNT]);
  const meta = Number(rows[0]?.meta || 0);
  const google = Number(rows[0]?.google || 0);
  const tiktok = Number(rows[0]?.tiktok || 0);
  return { meta, google, tiktok, total: meta + google + tiktok };
}

async function getSpendToday() {
  const { total } = await getSpendBreakdown();
  return total;
}

async function getLeadsByBranch() {
  const { rows } = await pool.query(`
    SELECT
      TRIM(clean_branch) as branch,
      COUNT(*) as count
    FROM master_leads_powerbi
    WHERE (submitted_at AT TIME ZONE 'Asia/Kuala_Lumpur')::date = (NOW() AT TIME ZONE 'Asia/Kuala_Lumpur')::date
      AND clean_branch IS NOT NULL
      AND TRIM(clean_branch) != ''
      AND LOWER(TRIM(clean_branch)) != 'unspecified'
      AND LOWER(TRIM(clean_branch)) != 'unknown branch'
      AND LOWER(TRIM(clean_branch)) NOT LIKE '%test%'
    GROUP BY 1
    ORDER BY count DESC;
  `);
  return rows;
}

async function getLeadsByRegion() {
  const { rows } = await pool.query(`
    SELECT
      CASE
        WHEN TRIM(clean_branch) ILIKE ANY(ARRAY['Bandar Rimbayu','Klang','Shah Alam','Setia Alam','Denai Alam','Eco Grandeur','Subang Taipan']) THEN 'Region A'
        WHEN TRIM(clean_branch) ILIKE ANY(ARRAY['Danau Kota','Kota Damansara','Ampang','Sri Petaling','Bandar Tun Hussein Onn','Kajang Perdana','Kajang','Taman Sri Gombak']) THEN 'Region B'
        WHEN TRIM(clean_branch) ILIKE ANY(ARRAY['Putrajaya','Kota Warisan','Bandar Baru Bangi','Cyberjaya','Bandar Seri Putra','Dataran Puchong Utama','Online']) THEN 'Region C'
        ELSE 'Other'
      END as region,
      COUNT(*) as count
    FROM master_leads_powerbi
    WHERE (submitted_at AT TIME ZONE 'Asia/Kuala_Lumpur')::date = (NOW() AT TIME ZONE 'Asia/Kuala_Lumpur')::date
      AND clean_branch IS NOT NULL AND TRIM(clean_branch) != ''
    GROUP BY 1
    ORDER BY region;
  `);
  return rows;
}

function buildReportMessage(leads, spend) {
  const sources = ['Meta', 'TikTok', 'Website (Conversion)', 'Roadshow', 'Self Generated Lead', 'Walk In', 'Website (Organic)', 'Others'];
  const map = {};
  let total = 0;
  for (const r of leads) { map[r.source] = Number(r.count); total += Number(r.count); }

  const cpl = total > 0 ? spend / total : 0;
  const now = new Date().toLocaleString('en-GB', { timeZone: 'Asia/Kuala_Lumpur', day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });

  let msg = `📊 *Ebright Daily Report*\n📅 ${now}\n\n*Today's Leads*\n━━━━━━━━━━━━━━━━━━\n`;
  for (const s of sources) msg += `${s}: *${map[s] || 0}*\n`;
  msg += `━━━━━━━━━━━━━━━━━━\nTOTAL: *${total}*\n\n`;
  msg += `*Executive Summary*\n━━━━━━━━━━━━━━━━━━\n`;
  msg += `Total Leads Today: *${total}*\n`;
  msg += `Total Spend Today: *${fmtRM(spend)}*\n`;
  msg += `Cost Per Lead: *${fmtRM(cpl)}*`;
  return msg;
}

async function sendTelegramMessage(chatId, text) {
  if (!BOT_TOKEN) throw new Error('TELEGRAM_BOT_TOKEN is not configured');
  const url = `https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`;
  await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text, parse_mode: 'Markdown' }),
  });
}

// Telegram webhook handler
router.post('/webhook', async (req, res) => {
  try {
    const { message } = req.body;
    if (!message || !message.text) return res.json({ ok: true });

    const chatId = String(message.chat.id);
    const text = message.text.trim().toLowerCase();

    // Security: only respond to allowed chat IDs
    if (!ALLOWED_CHAT_IDS.includes(chatId)) {
      return res.json({ ok: true });
    }

    if (text === '/report' || text === '/today' || text === '/start') {
      const [leads, spend] = await Promise.all([getLeadsToday(), getSpendToday()]);
      await sendTelegramMessage(chatId, buildReportMessage(leads, spend));
    }

    else if (text === '/branch' || text === '/branches') {
      const rows = await getLeadsByBranch();
      let msg = `🏢 *Today's Leads by Branch*\n━━━━━━━━━━━━━━━━━━\n`;
      let total = 0;
      for (const r of rows) { msg += `${r.branch}: *${r.count}*\n`; total += Number(r.count); }
      msg += `━━━━━━━━━━━━━━━━━━\nTOTAL: *${total}*`;
      await sendTelegramMessage(chatId, msg);
    }

    else if (text === '/region' || text === '/regions') {
      const rows = await getLeadsByRegion();
      let msg = `🗺 *Today's Leads by Region*\n━━━━━━━━━━━━━━━━━━\n`;
      let total = 0;
      for (const r of rows) { msg += `${r.region}: *${r.count}*\n`; total += Number(r.count); }
      msg += `━━━━━━━━━━━━━━━━━━\nTOTAL: *${total}*`;
      await sendTelegramMessage(chatId, msg);
    }

    else if (text === '/spend') {
      const b = await getSpendBreakdown();
      const msg = `💰 *Today's Ad Spend*\n━━━━━━━━━━━━━━━━━━\n` +
        `Meta: *${fmtRM(b.meta)}*\n` +
        `Google: *${fmtRM(b.google)}*\n` +
        `TikTok: *${fmtRM(b.tiktok)}*\n` +
        `━━━━━━━━━━━━━━━━━━\nTOTAL: *${fmtRM(b.total)}*`;
      await sendTelegramMessage(chatId, msg);
    }

    else if (text === '/help') {
      const msg = `🤖 *Ebright Dashboard Bot*\n\nAvailable commands:\n/report — Full daily report\n/branch — Leads by branch\n/region — Leads by region\n/spend — Today's ad spend\n/help — Show this message`;
      await sendTelegramMessage(chatId, msg);
    }

    else {
      await sendTelegramMessage(chatId, `❓ Unknown command. Type /help to see available commands.`);
    }

    return res.json({ ok: true });
  } catch (err) {
    console.error('[Telegram Bot]', err.message);
    return res.json({ ok: true });
  }
});

module.exports = { telegramBotRouter: router };
