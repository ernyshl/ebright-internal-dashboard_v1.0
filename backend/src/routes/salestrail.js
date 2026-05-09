const express = require('express');
const https = require('https');
const { requireAuth, requireRole } = require('../middleware/auth');
const { pool } = require('../db');

const router = express.Router();

const SALESTRAIL_AUTH = 'Basic YjczOWVlM2QtNTAyMS00NjExLThlNDAtNGVhNTA0MWZkNjU2OmJmaWV1VFluaXg4RmxQRGFXNVpkUzU4NElubzI3ZW1zWVRuN1NDVEEyOXZ2bjV3cTRnaDJ6SGZBaDJkTlNvakc=';

router.get('/ranking', requireAuth, requireRole(['super_admin', 'ceo', 'rm', 'od', 'marketing', 'tv']), async (req, res, next) => {
  try {
    const { date_from, date_to, rolling_days } = req.query;

    let dateFilter = '';
    const params = [];

    if (rolling_days) {
      params.push(parseInt(rolling_days));
      dateFilter = `AND start_time_utc >= NOW() - ($1 || ' days')::INTERVAL`;
    } else if (date_from && date_to) {
      params.push(date_from, date_to);
      dateFilter = `AND call_date BETWEEN $1 AND $2`;
    } else {
      dateFilter = `AND DATE_TRUNC('month', call_date) = DATE_TRUNC('month', CURRENT_DATE)`;
    }

    const query = `
      SELECT
        user_id,
        user_name,
        COUNT(*) AS total_calls,
        COUNT(*) FILTER (WHERE answered = true) AS answered,
        COUNT(*) FILTER (WHERE answered = false AND inbound = true)  AS missed,
        COUNT(*) FILTER (WHERE answered = false AND inbound = false) AS no_answer,
        COUNT(*) FILTER (WHERE inbound = false) AS outbound,
        COUNT(*) FILTER (WHERE inbound = true) AS inbound,
        SUM(duration) AS total_duration_sec,
        ROUND(AVG(duration)) AS avg_duration_sec,
        ROUND(
          COUNT(*) FILTER (WHERE answered = true)::numeric /
          NULLIF(COUNT(*), 0) * 100, 1
        ) AS answer_rate
      FROM salestrail_cr
      WHERE 1=1 ${dateFilter}
      GROUP BY user_id, user_name
      ORDER BY total_calls DESC, answered DESC;
    `;

    const result = await pool.query(query, params);

    return res.json({ ranking: result.rows });
  } catch (err) {
    return next(err);
  }
});

// Individual calls for a branch
router.get('/calls', requireAuth, requireRole(['super_admin', 'ceo', 'rm', 'od', 'marketing', 'tv']), async (req, res, next) => {
  try {
    const { user_id, date_from, date_to, rolling_days } = req.query;
    if (!user_id) return res.status(400).json({ error: 'user_id required' });

    const params = [user_id];
    let dateFilter = '';

    if (rolling_days) {
      params.push(parseInt(rolling_days));
      dateFilter = `AND start_time_utc >= NOW() - ($2 || ' days')::INTERVAL`;
    } else if (date_from && date_to) {
      params.push(date_from, date_to);
      dateFilter = `AND call_date BETWEEN $2 AND $3`;
    } else {
      dateFilter = `AND DATE_TRUNC('month', call_date) = DATE_TRUNC('month', CURRENT_DATE)`;
    }

    const query = `
      SELECT
        call_id, call_date, call_time, duration,
        answered, inbound, number, formatted_number,
        phonebook_name, recording_uri, rec_type, source_detail
      FROM salestrail_cr
      WHERE user_id = $1 ${dateFilter}
      ORDER BY call_date DESC, call_time DESC;
    `;

    const result = await pool.query(query, params);
    return res.json({ calls: result.rows });
  } catch (err) {
    return next(err);
  }
});

// Returns the short-lived Azure signed URL — browser loads audio directly from Azure CDN
router.get('/recording-url/:callId', requireAuth, requireRole(['super_admin', 'ceo', 'rm', 'od', 'marketing', 'tv']), (req, res, next) => {
  const { callId } = req.params;
  if (!/^[0-9a-f-]{36}$/.test(callId)) return res.status(400).json({ error: 'Invalid callId' });

  const step1 = https.get(
    `https://standalone-api.salestrail.io/export/calls/${callId}/recording`,
    { headers: { Authorization: SALESTRAIL_AUTH } },
    (r1) => {
      r1.resume();
      if (!r1.headers.location) return res.status(502).json({ error: 'No URL from Salestrail' });
      return res.json({ url: r1.headers.location });
    }
  );
  step1.on('error', next);
});

module.exports = { salestrailRouter: router };
