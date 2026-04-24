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
    GROUP BY 1
    ORDER BY count DESC;
  `);
  return rows;
}

async function getSpendToday() {
  const { rows } = await pool.query(`
    WITH latest AS (SELECT MAX(data_date::date) as today FROM meta_spend)
    SELECT COALESCE(SUM(spend), 0) as total_spend
    FROM meta_spend
    WHERE data_date::date = (SELECT today FROM latest);
  `);
  return Number(rows[0]?.total_spend || 0);
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
      const spend = await getSpendToday();
      await sendTelegramMessage(chatId, `💰 *Total Spend Today:* ${fmtRM(spend)}`);
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
