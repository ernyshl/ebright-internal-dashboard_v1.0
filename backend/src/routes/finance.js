const express = require('express');
const { pool } = require('../db');
const { requireAuth, requireRole } = require('../middleware/auth');

const financeRouter = express.Router();

financeRouter.use(requireAuth);
financeRouter.use(requireRole(['super_admin', 'ceo', 'finance', 'od', 'rm']));

// Branch Ranking — always returns top 20 branches (RM0 for those with no data in period)
financeRouter.get('/branch-ranking', async (req, res, next) => {
  try {
    const { date_from, date_to, branch } = req.query;

    const dateConditions = [];
    const params = [];
    let idx = 1;

    if (date_from) {
      dateConditions.push(`DATE(doc_date + INTERVAL '8 hours') >= $${idx++}`);
      params.push(date_from);
    }
    if (date_to) {
      dateConditions.push(`DATE(doc_date + INTERVAL '8 hours') <= $${idx++}`);
      params.push(date_to);
    }
    if (branch) {
      dateConditions.push(`branches = $${idx++}`);
      params.push(branch);
    }

    const dateWhere = dateConditions.length
      ? `AND ${dateConditions.join(' AND ')}`
      : '';

    // Get all 20 branches (by all-time revenue), LEFT JOIN filtered period
    const result = await pool.query(`
      WITH all_branches AS (
        SELECT branches
        FROM view_ebright_invoices
        WHERE branches IS NOT NULL
          AND branches != ''
          AND branches != 'HQ / Others'
          AND total_amount IS NOT NULL
        GROUP BY branches
        ORDER BY SUM(total_amount) DESC
        LIMIT 20
      ),
      filtered AS (
        SELECT branches, SUM(total_amount) AS total_revenue, COUNT(*) AS invoice_count
        FROM view_ebright_invoices
        WHERE branches IS NOT NULL
          AND branches != ''
          AND branches != 'HQ / Others'
          AND total_amount IS NOT NULL
          ${dateWhere}
        GROUP BY branches
      )
      SELECT
        ab.branches,
        COALESCE(f.total_revenue, 0) AS total_revenue,
        COALESCE(f.invoice_count, 0) AS invoice_count
      FROM all_branches ab
      LEFT JOIN filtered f ON f.branches = ab.branches
      ORDER BY total_revenue DESC, ab.branches ASC
    `, params);

    const branchList = await pool.query(`
      SELECT DISTINCT branches
      FROM view_ebright_invoices
      WHERE branches IS NOT NULL
        AND branches != ''
        AND branches != 'HQ / Others'
      ORDER BY branches
    `);

    const grandTotal = result.rows.reduce((sum, r) => sum + parseFloat(r.total_revenue || 0), 0);

    return res.json({
      branches: result.rows.map(r => ({
        branch: r.branches,
        total: parseFloat(r.total_revenue || 0),
        count: parseInt(r.invoice_count, 10),
      })),
      grandTotal,
      branchList: branchList.rows.map(r => r.branches),
    });
  } catch (err) {
    return next(err);
  }
});

module.exports = { financeRouter };
