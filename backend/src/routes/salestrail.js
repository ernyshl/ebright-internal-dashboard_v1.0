const express = require('express');
const { requireAuth, requireRole } = require('../middleware/auth');
const { pool } = require('../db');

const router = express.Router();

router.get('/ranking', requireAuth, requireRole(['super_admin', 'ceo', 'rm', 'od', 'marketing', 'tv']), async (req, res, next) => {
  try {
    const { date_from, date_to } = req.query;

    let dateFilter = '';
    const params = [];

    if (date_from && date_to) {
      params.push(date_from, date_to);
      dateFilter = `AND call_date BETWEEN $1 AND $2`;
    } else {
      // Default: this month
      dateFilter = `AND DATE_TRUNC('month', call_date) = DATE_TRUNC('month', CURRENT_DATE)`;
    }

    const query = `
      SELECT
        user_id,
        user_name,
        COUNT(*) AS total_calls,
        COUNT(*) FILTER (WHERE answered = true) AS answered,
        COUNT(*) FILTER (WHERE answered = false) AS missed,
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

module.exports = { salestrailRouter: router };
