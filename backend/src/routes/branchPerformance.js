const express = require('express');
const { z } = require('zod');
const { pool } = require('../db');
const { requireAuth, requireRole } = require('../middleware/auth');

const router = express.Router();

const ALLOWED_ROLES = ['super_admin', 'ceo', 'marketing', 'od', 'rm', 'hr', 'tv'];

// Mirror of frontend leadsSheet.js — kept hardcoded so the API is self-contained.
const REGION_PIPELINES = {
  A: ['02 ST', '04 SA', '09 KLG', '10 DA', '13 SHA', '15 EGR', '17 RBY'],
  B: ['03 SP', '05 KD', '07 AMP', '12 DK', '14 BTHO', '18 TSG', '20 KTG'],
  C: ['01 ONL', '06 PJY', '08 CJY', '11 BBB', '16 BSP', '19 KW', '23 PU'],
};
const ALL_PIPELINES = [...REGION_PIPELINES.A, ...REGION_PIPELINES.B, ...REGION_PIPELINES.C];

const RatesQuery = z.object({
  scope: z.enum(['overall', 'region', 'branch']),
  granularity: z.enum(['month', 'week']),
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  to:   z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  region: z.string().optional(),  // 'A' | 'B' | 'C'
  branch: z.string().optional(),  // pipeline_name e.g. '02 ST'
});

router.get('/rates', requireAuth, requireRole(ALLOWED_ROLES), async (req, res, next) => {
  try {
    const params = RatesQuery.parse(req.query);

    let pipelines;
    if (params.scope === 'branch' && params.branch) {
      pipelines = [params.branch];
    } else if (params.scope === 'region' && params.region) {
      pipelines = REGION_PIPELINES[params.region.toUpperCase()] || [];
    } else {
      pipelines = ALL_PIPELINES;
    }

    if (pipelines.length === 0) {
      return res.json({ rows: [] });
    }

    // date_trunc safelist — we already validate via Zod, but belt-and-braces.
    const trunc = params.granularity === 'week' ? 'week' : 'month';

    const { rows } = await pool.query(
      `SELECT
         TO_CHAR(DATE_TRUNC('${trunc}', (received_at AT TIME ZONE 'Asia/Kuala_Lumpur')), 'YYYY-MM-DD') AS bucket,
         pipeline_name,
         stage_key,
         COUNT(*)::int AS n
       FROM ghl_stages
       WHERE (received_at AT TIME ZONE 'Asia/Kuala_Lumpur')::date >= $1::date
         AND (received_at AT TIME ZONE 'Asia/Kuala_Lumpur')::date <= $2::date
         AND stage_key IN ('NL','CT','SU','ENR')
         AND pipeline_name = ANY($3::text[])
       GROUP BY 1, 2, 3
       ORDER BY 1, 2, 3`,
      [params.from, params.to, pipelines],
    );

    return res.json({ rows, granularity: params.granularity });
  } catch (err) {
    return next(err);
  }
});

router.get('/targets', requireAuth, async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      `SELECT conversion_rate, confirmed_rate, show_up_rate, enrolment_rate
       FROM kpi_targets
       ORDER BY id
       LIMIT 1`,
    );
    if (rows.length === 0) {
      // Migration not run yet — return defaults so the UI doesn't crash.
      return res.json({ conversion_rate: 7, confirmed_rate: 40, show_up_rate: 50, enrolment_rate: 33 });
    }
    const r = rows[0];
    return res.json({
      conversion_rate: Number(r.conversion_rate),
      confirmed_rate:  Number(r.confirmed_rate),
      show_up_rate:    Number(r.show_up_rate),
      enrolment_rate:  Number(r.enrolment_rate),
    });
  } catch (err) {
    return next(err);
  }
});

const TargetsSchema = z.object({
  conversion_rate: z.number().min(0).max(100),
  confirmed_rate:  z.number().min(0).max(100),
  show_up_rate:    z.number().min(0).max(100),
  enrolment_rate:  z.number().min(0).max(100),
});

router.put('/targets', requireAuth, requireRole(['super_admin']), async (req, res, next) => {
  try {
    const t = TargetsSchema.parse(req.body);
    const userId = req.user?.sub || null;

    const { rows: existing } = await pool.query(
      `SELECT id FROM kpi_targets ORDER BY id LIMIT 1`,
    );

    let result;
    if (existing.length === 0) {
      ({ rows: result } = await pool.query(
        `INSERT INTO kpi_targets
           (conversion_rate, confirmed_rate, show_up_rate, enrolment_rate, updated_by)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING conversion_rate, confirmed_rate, show_up_rate, enrolment_rate`,
        [t.conversion_rate, t.confirmed_rate, t.show_up_rate, t.enrolment_rate, userId],
      ));
    } else {
      ({ rows: result } = await pool.query(
        `UPDATE kpi_targets
         SET conversion_rate = $1,
             confirmed_rate  = $2,
             show_up_rate    = $3,
             enrolment_rate  = $4,
             updated_at      = NOW(),
             updated_by      = $5
         WHERE id = $6
         RETURNING conversion_rate, confirmed_rate, show_up_rate, enrolment_rate`,
        [t.conversion_rate, t.confirmed_rate, t.show_up_rate, t.enrolment_rate, userId, existing[0].id],
      ));
    }

    const r = result[0];
    return res.json({
      conversion_rate: Number(r.conversion_rate),
      confirmed_rate:  Number(r.confirmed_rate),
      show_up_rate:    Number(r.show_up_rate),
      enrolment_rate:  Number(r.enrolment_rate),
    });
  } catch (err) {
    return next(err);
  }
});

module.exports = { branchPerformanceRouter: router };
