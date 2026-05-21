const express = require('express');
const { pool } = require('../db');
const { requireAuth, requireRole } = require('../middleware/auth');

const financeRouter = express.Router();

// Keep your middleware lines here
financeRouter.use(requireAuth);

// Path-aware role gate: /renewal-by-branch (and its freshness sub-route)
// also allow the 'academy' role because the page is now displayed under the
// Academy section in the dashboard. All OTHER finance endpoints (Branch
// Ranking, etc.) keep the original strict role list — academy users
// shouldn't be able to call them via direct API.
financeRouter.use((req, res, next) => {
  const isRenewalByBranch =
    req.path === '/renewal-by-branch' ||
    req.path === '/renewal-by-branch/freshness';
  const allowed = isRenewalByBranch
    ? ['super_admin', 'ceo', 'finance', 'od', 'rm', 'tv', 'academy']
    : ['super_admin', 'ceo', 'finance', 'od', 'rm', 'tv'];
  return requireRole(allowed)(req, res, next);
});
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

    // Get all 20 branches (by all-time revenue), LEFT JOIN filtered period.
    // Also compute lifetime_max — each branch's highest single-month revenue
    // since 2026-01-01 — used by the frontend to permanently color the branch
    // name based on the highest jackpot tier the branch has ever hit.
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
      ),
      monthly AS (
        SELECT
          branches,
          DATE_TRUNC('month', DATE(doc_date + INTERVAL '8 hours')) AS month,
          SUM(total_amount) AS month_total
        FROM view_ebright_invoices
        WHERE branches IS NOT NULL
          AND branches != ''
          AND branches != 'HQ / Others'
          AND total_amount IS NOT NULL
          AND DATE(doc_date + INTERVAL '8 hours') >= '2026-01-01'
        GROUP BY branches, month
      ),
      lifetime AS (
        SELECT branches, MAX(month_total) AS lifetime_max
        FROM monthly
        GROUP BY branches
      )
      SELECT
        ab.branches,
        COALESCE(f.total_revenue, 0) AS total_revenue,
        COALESCE(f.invoice_count, 0) AS invoice_count,
        COALESCE(l.lifetime_max, 0)  AS lifetime_max
      FROM all_branches ab
      LEFT JOIN filtered f ON f.branches = ab.branches
      LEFT JOIN lifetime l ON l.branches = ab.branches
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
        lifetime_max: parseFloat(r.lifetime_max || 0),
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
    // Always validate month/year first — required even when a custom range
    // is provided (frontend uses them as the queryKey, and we want a clean
    // 400 on garbage input instead of `${undefined}-${undefined}-01`).
    const m = parseInt(req.query.month, 10);
    const y = parseInt(req.query.year, 10);
    if (!Number.isFinite(m) || !Number.isFinite(y) || m < 1 || m > 12 || y < 2000 || y > 2100) {
      return res.status(400).json({ error: 'Invalid month or year' });
    }
    // Optional custom date range. Both ends must be ISO YYYY-MM-DD; if either
    // fails the format check we silently ignore and fall back to the full
    // month — the frontend already constrains the inputs to the selected
    // month, so this is a defensive guard.
    const { date_from, date_to } = req.query;
    const isoRe = /^\d{4}-\d{2}-\d{2}$/;
    const useCustomRange =
      typeof date_from === 'string' && isoRe.test(date_from) &&
      typeof date_to   === 'string' && isoRe.test(date_to)   &&
      date_from <= date_to;
    let startDate, endDate;
    if (useCustomRange) {
      startDate = date_from;
      endDate   = date_to;
    } else {
      startDate = `${y}-${String(m).padStart(2, '0')}-01`;
      endDate   = new Date(y, m, 0).toISOString().split('T')[0];
    }

    // Drive off branch_map_autocount so every branch that can appear in
    // AutoCount-sourced renewals shows up, even with zero rows for the month.
    // Using branch_master would skip branches that aren't in it (e.g. KTG).
    // Date filter must stay in the JOIN ON — moving it to WHERE would
    // convert the LEFT JOIN back into an inner join.
    const result = await pool.query(`
      SELECT
        bm.branch_code,
        bm.branch_name,
        COUNT(*) FILTER (WHERE fr.package = '3M')                     AS count_3m,
        COUNT(*) FILTER (WHERE fr.package = '6M')                     AS count_6m,
        COUNT(*) FILTER (WHERE fr.package = '9M')                     AS count_9m,
        COUNT(*) FILTER (WHERE fr.package = '12M')                    AS count_12m,
        COUNT(fr.id)                                                  AS total_renewals,
        COALESCE(SUM(fr.amount) FILTER (WHERE fr.package = '3M'),  0) AS total_3m,
        COALESCE(SUM(fr.amount) FILTER (WHERE fr.package = '6M'),  0) AS total_6m,
        COALESCE(SUM(fr.amount) FILTER (WHERE fr.package = '9M'),  0) AS total_9m,
        COALESCE(SUM(fr.amount) FILTER (WHERE fr.package = '12M'), 0) AS total_12m,
        COALESCE(SUM(fr.amount), 0)                                   AS grand_total
      FROM branch_map_autocount bm
      LEFT JOIN finance_renewals fr
        ON fr.branch_code = bm.branch_code
        AND fr.doc_date >= $1
        AND fr.doc_date <= $2
      GROUP BY bm.branch_code, bm.branch_name
      ORDER BY bm.branch_code
    `, [startDate, endDate]);

    // Cast numerics to JS numbers for the existing frontend contract.
    const data = result.rows.map(r => ({
      branch_code:    r.branch_code,
      branch_name:    r.branch_name,
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

module.exports = { financeRouter };