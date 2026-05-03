const express = require('express');
const { pool, invPool } = require('../db'); // Make sure you use both pools here
const { requireAuth, requireRole } = require('../middleware/auth');

const financeRouter = express.Router();

// Keep your middleware lines here
financeRouter.use(requireAuth);
financeRouter.use(requireRole(['super_admin', 'ceo', 'finance', 'od', 'rm', 'tv']));
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

// NEW: Renewal Distribution by Branch
financeRouter.get('/renewal-by-branch', async (req, res, next) => {
  try {
    const { month, year } = req.query;
    // Format dates for the query
    const startDate = `${year}-${month}-01`;
    const endDate = new Date(year, month, 0).toISOString().split('T')[0];

    console.log(`[Finance] Fetching renewals for ${month}/${year}`);

    // QUERY 1: Get the "What" from INV_DB
    // We use invPool here. We ONLY ask for columns we saw in your HeidiSQL image.
    const inventoryResult = await invPool.query(`
      SELECT doc_no, branch_code, package 
      FROM inventory_distribution_new 
      WHERE type = 'Renewal' 
        AND doc_date >= $1 AND doc_date <= $2
    `, [startDate, endDate]);

    const renewals = inventoryResult.rows;

    // If no renewals found, return empty array immediately
    if (renewals.length === 0) {
      return res.json({ data: [] });
    }

    // QUERY 2: Get the "Money" from LEADS_DB
    // We use the regular pool here.
    const docNos = renewals.map(r => r.doc_no);
    const leadsResult = await pool.query(`
      SELECT doc_no, total_amount 
      FROM view_ebright_invoices 
      WHERE doc_no = ANY($1)
    `, [docNos]);

    // Create a map of doc_no -> amount
    const moneyMap = {};
    leadsResult.rows.forEach(row => {
      moneyMap[row.doc_no] = parseFloat(row.total_amount) || 0;
    });

    // STEP 3: Combine them in JavaScript
    const branchSummary = {};

    renewals.forEach(r => {
      const amount = moneyMap[r.doc_no] || 0;
      
      if (!branchSummary[r.branch_code]) {
        branchSummary[r.branch_code] = { 
          branch_code: r.branch_code, 
          count_3m: 0, count_6m: 0, count_9m: 0, count_12m: 0,
          total_3m: 0, total_6m: 0, total_9m: 0, total_12m: 0,
          total_renewals: 0, grand_total: 0
        };
      }

      const b = branchSummary[r.branch_code];
      b.total_renewals += 1;
      b.grand_total += amount;

      // Match the package string exactly as seen in HeidiSQL
      if (r.package === '3M') { b.count_3m += 1; b.total_3m += amount; }
      else if (r.package === '6M') { b.count_6m += 1; b.total_6m += amount; }
      else if (r.package === '9M') { b.count_9m += 1; b.total_9m += amount; }
      else if (r.package === '12M') { b.count_12m += 1; b.total_12m += amount; }
    });

    res.json({ data: Object.values(branchSummary) });
  } catch (err) {
    console.error('Final Logic Error:', err.message);
    next(err);
  }
});

// NEW: Renewal by Branch Freshness Indicator
financeRouter.get('/renewal-by-branch/freshness', async (req, res, next) => {
  try {
    const result = await pool.query(
      `SELECT last_refreshed, duration_ms
       FROM finance_view_refresh_log
       WHERE view_name = 'finance_renewal_by_branch'`
    );
    res.json({ data: result.rows[0] || null });
  } catch (err) {
    console.error('[finance/renewal-by-branch/freshness] Error:', err);
    return next(err);
  }
});

module.exports = { financeRouter };