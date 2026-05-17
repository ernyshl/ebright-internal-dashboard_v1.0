const express = require('express');
const { pool } = require('../db');
const { requireAuth, requireRole } = require('../middleware/auth');

const router = express.Router();

// Branch Revenue & Renewals — combines per-branch revenue (view_ebright_invoices)
// with per-branch renewal totals (finance_renewals).
const BRANCH_CODE_TO_FULL_NAME = {
  AMP:  'Ebright Ampang',
  BBB:  'Ebright Bandar Baru Bangi',
  BSP:  'Ebright Bandar Seri Putra',
  BTHO: 'Ebright Bandar Tun Hussein Onn',
  CJY:  'Ebright Cyberjaya',
  DA:   'Ebright Denai Alam',
  DK:   'Ebright Danau Kota',
  PU:   'Ebright Dataran Puchong Utama',
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

router.get(
  '/branch-revenue-renewals',
  requireAuth,
  requireRole(['super_admin', 'ceo', 'finance', 'od', 'rm', 'tv', 'academy']),
  async (req, res, next) => {
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

      let renewalBranchCode = null;
      if (branch) {
        for (const [code, fullName] of Object.entries(BRANCH_CODE_TO_FULL_NAME)) {
          if (fullName === branch) {
            renewalBranchCode = code;
            break;
          }
        }
      }

      const renewalConditions = [];
      const renewalParams = [];
      let rIdx = 1;
      if (date_from) {
        renewalConditions.push(`doc_date >= $${rIdx++}`);
        renewalParams.push(date_from);
      }
      if (date_to) {
        renewalConditions.push(`doc_date <= $${rIdx++}`);
        renewalParams.push(date_to);
      }
      if (renewalBranchCode) {
        renewalConditions.push(`branch_code = $${rIdx++}`);
        renewalParams.push(renewalBranchCode);
      }
      const renewalWhere = renewalConditions.length
        ? `WHERE ${renewalConditions.join(' AND ')}`
        : '';

      const renewalsPromise = pool.query(`
        SELECT branch_code, SUM(amount) AS renewal_total
        FROM finance_renewals
        ${renewalWhere}
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

      const renewalByFullName = {};
      for (const row of renewalsResult.rows) {
        const fullName = BRANCH_CODE_TO_FULL_NAME[row.branch_code];
        if (fullName) {
          renewalByFullName[fullName] = parseFloat(row.renewal_total) || 0;
        }
      }

      const branches = revenueResult.rows.map(r => ({
        branch:       r.branches,
        total:        parseFloat(r.total_revenue || 0),
        renewal:      renewalByFullName[r.branches] || 0,
        count:        parseInt(r.invoice_count, 10),
        lifetime_max: parseFloat(r.lifetime_max || 0),
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
      console.error('[academy/branch-revenue-renewals] Error:', err.message);
      return next(err);
    }
  }
);

// Academy dashboard stats endpoint
// This can be extended to fetch data from GHL API or your database
router.get('/stats', requireAuth, requireRole(['super_admin', 'ceo', 'marketing', 'od', 'academy']), async (_req, res, next) => {
  try {
    // Placeholder for academy stats
    // You can extend this to fetch from GHL API or your database
    
    // Example: Return placeholder stats that can be replaced with real data
    const stats = {
      total_students: 0,
      active_courses: 0,
      completion_rate: 0,
      revenue: 0,
      new_enrollments: 0,
      pending_assessments: 0,
    };

    return res.json({
      stats,
      embeddedUrl: 'https://app.ebright.my/v2/location/uCIrspLXxSiM9hj1g1sd/dashboard',
      lastUpdated: new Date().toISOString(),
    });
  } catch (err) {
    return next(err);
  }
});

// Get academy courses
router.get('/courses', requireAuth, requireRole(['super_admin', 'ceo', 'marketing', 'od', 'academy']), async (_req, res, next) => {
  try {
    // Placeholder for courses data
    const courses = [];
    
    return res.json({ courses });
  } catch (err) {
    return next(err);
  }
});

// Get academy students
router.get('/students', requireAuth, requireRole(['super_admin', 'ceo', 'marketing', 'od', 'academy']), async (_req, res, next) => {
  try {
    // Placeholder for students data
    const students = [];
    
    return res.json({ students });
  } catch (err) {
    return next(err);
  }
});

module.exports = { academyRouter: router };