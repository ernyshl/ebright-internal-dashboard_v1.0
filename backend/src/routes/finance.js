const express = require('express');
const { pool } = require('../db');
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

// Renewal Distribution by Branch
// Reads from finance_renewals (populated by refreshFinanceRenewals.js cron).
// Replaces a previous two-DB join (INV_DB + view_ebright_invoices) — see
// docs/superpowers/specs/2026-05-05-finance-renewals-table-design.md
financeRouter.get('/renewal-by-branch', async (req, res, next) => {
  try {
    const { month, year } = req.query;
    const startDate = `${year}-${month}-01`;
    const endDate = new Date(year, month, 0).toISOString().split('T')[0];

    const result = await pool.query(`
      SELECT
        branch_code,
        COUNT(*) FILTER (WHERE package = '3M')                  AS count_3m,
        COUNT(*) FILTER (WHERE package = '6M')                  AS count_6m,
        COUNT(*) FILTER (WHERE package = '9M')                  AS count_9m,
        COUNT(*) FILTER (WHERE package = '12M')                 AS count_12m,
        COUNT(*)                                                 AS total_renewals,
        COALESCE(SUM(amount) FILTER (WHERE package = '3M'),  0) AS total_3m,
        COALESCE(SUM(amount) FILTER (WHERE package = '6M'),  0) AS total_6m,
        COALESCE(SUM(amount) FILTER (WHERE package = '9M'),  0) AS total_9m,
        COALESCE(SUM(amount) FILTER (WHERE package = '12M'), 0) AS total_12m,
        COALESCE(SUM(amount), 0)                                 AS grand_total
      FROM finance_renewals
      WHERE doc_date >= $1 AND doc_date <= $2
      GROUP BY branch_code
      ORDER BY branch_code
    `, [startDate, endDate]);

    // Cast numerics to JS numbers for the existing frontend contract.
    const data = result.rows.map(r => ({
      branch_code:    r.branch_code,
      count_3m:       Number(r.count_3m),
      count_6m:       Number(r.count_6m),
      count_9m:       Number(r.count_9m),
      count_12m:      Number(r.count_12m),
      total_renewals: Number(r.total_renewals),
      total_3m:       parseFloat(r.total_3m),
      total_6m:       parseFloat(r.total_6m),
      total_9m:       parseFloat(r.total_9m),
      total_12m:      parseFloat(r.total_12m),
      grand_total:    parseFloat(r.grand_total),
    }));

    res.json({ data });
  } catch (err) {
    console.error('[finance/renewal-by-branch] Error:', err.message);
    next(err);
  }
});

// Renewal by Branch Freshness Indicator
// Reads the latest successful run from finance_renewals_refresh_log.
financeRouter.get('/renewal-by-branch/freshness', async (req, res, next) => {
  try {
    const result = await pool.query(
      `SELECT ran_at AS last_refreshed, duration_ms
       FROM finance_renewals_refresh_log
       WHERE status = 'ok'
       ORDER BY ran_at DESC
       LIMIT 1`
    );
    res.json({ data: result.rows[0] || null });
  } catch (err) {
    console.error('[finance/renewal-by-branch/freshness] Error:', err);
    return next(err);
  }
});

// Branch Revenue & Renewals — combines per-branch revenue (view_ebright_invoices)
// with per-branch renewal totals (finance_renewals). See
// docs/superpowers/specs/2026-05-05-branch-revenue-renewals-design.md
const BRANCH_CODE_TO_FULL_NAME = {
  AMP:  'Ebright Ampang',
  BBB:  'Ebright Bandar Baru Bangi',
  BSP:  'Ebright Bandar Seri Putra',
  BTHO: 'Ebright Bandar Tun Hussein Onn',
  CJY:  'Ebright Cyberjaya',
  DA:   'Ebright Denai Alam',
  DK:   'Ebright Danau Kota',
  DPU:  'Ebright Dataran Puchong Utama',
  EGR:  'Ebright Eco Grandeur',
  KD:   'Ebright Kota Damansara',
  KLG:  'Ebright Klang',
  KTG:  'Ebright Kajang TTDI Groove',
  KW:   'Ebright Kota Warisan',
  ONL:  'Ebright Online',
  PJY:  'Ebright Putrajaya',
  RBY:  'Ebright Rimbayu',
  SA:   'Ebright Setia Alam',
  SHA:  'Ebright Shah Alam',
  SP:   'Ebright Sri Petaling',
  ST:   'Ebright Subang Taipan',
  TSG:  'Ebright Taman Sri Gombak',
};

financeRouter.get('/branch-revenue-renewals', async (req, res, next) => {
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

    // Query 1: Revenue per branch (top 20 by all-time revenue, LEFT JOIN filtered to period)
    const revenuePromise = pool.query(`
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

    // Query 2: Renewal total per branch (from finance_renewals; uses date_from/date_to only)
    const renewalParams = [];
    let renewalDateWhere = '';
    if (date_from && date_to) {
      renewalParams.push(date_from, date_to);
      renewalDateWhere = `WHERE doc_date >= $1 AND doc_date <= $2`;
    } else if (date_from) {
      renewalParams.push(date_from);
      renewalDateWhere = `WHERE doc_date >= $1`;
    } else if (date_to) {
      renewalParams.push(date_to);
      renewalDateWhere = `WHERE doc_date <= $1`;
    }
    const renewalsPromise = pool.query(`
      SELECT branch_code, SUM(amount) AS renewal_total
      FROM finance_renewals
      ${renewalDateWhere}
      GROUP BY branch_code
    `, renewalParams);

    const branchListPromise = pool.query(`
      SELECT DISTINCT branches
      FROM view_ebright_invoices
      WHERE branches IS NOT NULL
        AND branches != ''
        AND branches != 'HQ / Others'
      ORDER BY branches
    `);

    const [revenueResult, renewalsResult, branchListResult] = await Promise.all([
      revenuePromise,
      renewalsPromise,
      branchListPromise,
    ]);

    // Build a lookup: full branch name → renewal total
    const renewalByFullName = {};
    for (const row of renewalsResult.rows) {
      const fullName = BRANCH_CODE_TO_FULL_NAME[row.branch_code];
      if (fullName) {
        renewalByFullName[fullName] = parseFloat(row.renewal_total) || 0;
      }
    }

    const branches = revenueResult.rows.map(r => ({
      branch:  r.branches,
      total:   parseFloat(r.total_revenue || 0),
      renewal: renewalByFullName[r.branches] || 0,
      count:   parseInt(r.invoice_count, 10),
    }));

    const grandTotal = branches.reduce((sum, b) => sum + b.total, 0);
    const grandRenewalTotal = branches.reduce((sum, b) => sum + b.renewal, 0);

    return res.json({
      branches,
      grandTotal,
      grandRenewalTotal,
      branchList: branchListResult.rows.map(r => r.branches),
    });
  } catch (err) {
    console.error('[finance/branch-revenue-renewals] Error:', err.message);
    return next(err);
  }
});

module.exports = { financeRouter };