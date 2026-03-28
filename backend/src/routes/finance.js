const express = require('express');
const { pool } = require('../db');
const { requireAuth, requireRole } = require('../middleware/auth');

const financeRouter = express.Router();

financeRouter.use(requireAuth);
financeRouter.use(requireRole(['super_admin', 'ceo', 'finance', 'od', 'rm']));

// Branch Ranking — sum invoices by branch, filtered by date range
financeRouter.get('/branch-ranking', async (req, res) => {
  try {
    const { date_from, date_to, branch } = req.query;

    const conditions = [
      `branches IS NOT NULL`,
      `branches != ''`,
      `total_amount IS NOT NULL`,
    ];
    const params = [];
    let idx = 1;

    if (date_from) {
      conditions.push(`DATE(doc_date + INTERVAL '8 hours') >= $${idx++}`);
      params.push(date_from);
    }
    if (date_to) {
      conditions.push(`DATE(doc_date + INTERVAL '8 hours') <= $${idx++}`);
      params.push(date_to);
    }
    if (branch) {
      conditions.push(`branches = $${idx++}`);
      params.push(branch);
    }

    const where = `WHERE ${conditions.join(' AND ')}`;

    const result = await pool.query(`
      SELECT
        branches,
        SUM(total_amount) AS total_revenue,
        COUNT(*) AS invoice_count
      FROM view_ebright_invoices
      ${where}
      GROUP BY branches
      ORDER BY total_revenue DESC
    `, params);

    const branchList = await pool.query(`
      SELECT DISTINCT branches
      FROM view_ebright_invoices
      WHERE branches IS NOT NULL AND branches != ''
      ORDER BY branches
    `);

    const grandTotal = result.rows.reduce((sum, r) => sum + parseFloat(r.total_revenue || 0), 0);

    res.json({
      branches: result.rows.map(r => ({
        branch: r.branches,
        total: parseFloat(r.total_revenue || 0),
        count: parseInt(r.invoice_count, 10),
      })),
      grandTotal,
      branchList: branchList.rows.map(r => r.branches),
    });
  } catch (err) {
    console.error('Error fetching branch ranking:', err);
    res.status(500).json({ error: 'Failed to fetch branch ranking' });
  }
});

module.exports = { financeRouter };
