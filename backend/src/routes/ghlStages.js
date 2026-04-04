const express = require('express');
const { pool } = require('../db');
const { env } = require('../env');
const { requireAuth, requireRole } = require('../middleware/auth');

const router = express.Router();

const ALLOWED_ROLES = ['super_admin', 'ceo', 'marketing', 'od', 'rm', 'hr', 'tv'];

function getStageKey(raw) {
  const s = (raw || '').toLowerCase();
  if (s.includes('new lead'))   return 'NL';
  if (s.includes('confirmed'))  return 'CT';
  if (s.includes('show'))       return 'SU';
  if (s.includes('enrolled'))   return 'ENR';
  return null;
}

// ──────────────────────────────────────────────────────────────
// POST /api/ghl-stages/webhook — public, receives GHL webhooks
// ──────────────────────────────────────────────────────────────
router.post('/webhook', async (req, res) => {
  try {
    // Optional secret check
    if (env.GHL_WEBHOOK_SECRET) {
      const incoming = req.query.secret || req.headers['x-webhook-secret'] || '';
      if (incoming !== env.GHL_WEBHOOK_SECRET) {
        return res.status(401).json({ error: 'Invalid webhook secret' });
      }
    }

    const data = req.body;

    const email       = (data.email        || '').trim().toLowerCase();
    const lastName    = (data.last_name    || '').trim();
    const rawStage    = (data.pipeline_stage || data.Stage || '').trim();
    const studentName = (data.student_name || '').trim();
    const phone       = (data.phone        || '').trim();
    const branch      = (data.Branch       || data['Branch Name'] || '').trim();
    const pipelineName = (data.pipeline_name || '').trim();
    const contactType = (data.contact_type || 'lead').trim();

    const stageKey = getStageKey(rawStage);
    if (!stageKey) {
      return res.status(200).json({ status: 'ignored', reason: 'unrecognised stage' });
    }

    // Fingerprint: same logic as GSheet code
    const fingerprint = `${email}|${lastName}|${studentName}|${rawStage}`.replace(/\s+/g, '');

    // Upsert — ON CONFLICT DO NOTHING deduplicates permanently
    await pool.query(
      `INSERT INTO ghl_stages
         (email, last_name, phone, stage_raw, stage_key, pipeline_name, branch, student_name, contact_type, fingerprint)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
       ON CONFLICT (fingerprint) DO NOTHING`,
      [email, lastName, phone, rawStage, stageKey, pipelineName, branch, studentName, contactType, fingerprint]
    );

    return res.status(200).json({ status: 'ok' });
  } catch (err) {
    // Always return 200 to GHL so it stops retrying
    console.error('[GHL webhook]', err.message);
    return res.status(200).json({ status: 'error', message: err.message });
  }
});

// ──────────────────────────────────────────────────────────────
// GET /api/ghl-stages — list with filters (paginated)
// ──────────────────────────────────────────────────────────────
router.get('/', requireAuth, requireRole(ALLOWED_ROLES), async (req, res, next) => {
  try {
    const {
      date_from = '', date_to = '',
      stage = '', pipeline = '', search = '',
      page = 1, limit = 50,
    } = req.query;

    const conditions = [];
    const params = [];
    let idx = 1;

    if (date_from) {
      conditions.push(`(received_at AT TIME ZONE 'Asia/Kuala_Lumpur')::date >= $${idx++}::date`);
      params.push(date_from);
    }
    if (date_to) {
      conditions.push(`(received_at AT TIME ZONE 'Asia/Kuala_Lumpur')::date <= $${idx++}::date`);
      params.push(date_to);
    }
    if (stage)    { conditions.push(`stage_key = $${idx++}`); params.push(stage); }
    if (pipeline) { conditions.push(`pipeline_name = $${idx++}`); params.push(pipeline); }
    if (search) {
      conditions.push(`(email ILIKE $${idx} OR last_name ILIKE $${idx} OR phone ILIKE $${idx})`);
      params.push(`%${search}%`);
      idx++;
    }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    const offset = (Number(page) - 1) * Number(limit);

    const [countResult, dataResult] = await Promise.all([
      pool.query(`SELECT COUNT(*) FROM ghl_stages ${where}`, params),
      pool.query(
        `SELECT id, email, last_name, phone, stage_raw, stage_key, pipeline_name, branch, student_name, contact_type,
                (received_at AT TIME ZONE 'Asia/Kuala_Lumpur') AS received_at_local
         FROM ghl_stages ${where}
         ORDER BY received_at DESC
         LIMIT $${idx} OFFSET $${idx + 1}`,
        [...params, Number(limit), offset]
      ),
    ]);

    return res.json({
      records: dataResult.rows,
      total: parseInt(countResult.rows[0].count, 10),
      page: Number(page),
      totalPages: Math.ceil(parseInt(countResult.rows[0].count, 10) / Number(limit)),
    });
  } catch (err) {
    return next(err);
  }
});

// ──────────────────────────────────────────────────────────────
// GET /api/ghl-stages/by-pipeline — CT/SU/ENR counts per pipeline
// ──────────────────────────────────────────────────────────────
router.get('/by-pipeline', requireAuth, requireRole(ALLOWED_ROLES), async (req, res, next) => {
  try {
    const { date_from = '', date_to = '' } = req.query;
    const conditions = [`stage_key IN ('CT','SU','ENR')`];
    const params = [];
    let idx = 1;

    if (date_from) {
      conditions.push(`(received_at AT TIME ZONE 'Asia/Kuala_Lumpur')::date >= $${idx++}::date`);
      params.push(date_from);
    }
    if (date_to) {
      conditions.push(`(received_at AT TIME ZONE 'Asia/Kuala_Lumpur')::date <= $${idx++}::date`);
      params.push(date_to);
    }

    const { rows } = await pool.query(
      `SELECT pipeline_name,
              COUNT(*) FILTER (WHERE stage_key = 'CT')  AS ct,
              COUNT(*) FILTER (WHERE stage_key = 'SU')  AS su,
              COUNT(*) FILTER (WHERE stage_key = 'ENR') AS enr
       FROM ghl_stages
       WHERE ${conditions.join(' AND ')}
       GROUP BY pipeline_name`,
      params,
    );

    return res.json({ byPipeline: rows });
  } catch (err) {
    return next(err);
  }
});

// ──────────────────────────────────────────────────────────────
// GET /api/ghl-stages/by-source — CT/SU/ENR per lead_source (joined with DB by email)
// ──────────────────────────────────────────────────────────────
router.get('/by-source', requireAuth, requireRole(ALLOWED_ROLES), async (req, res, next) => {
  try {
    const { date_from = '', date_to = '' } = req.query;
    const conditions = [`g.stage_key IN ('CT','SU','ENR')`];
    const params = [];
    let idx = 1;

    if (date_from) {
      conditions.push(`(g.received_at AT TIME ZONE 'Asia/Kuala_Lumpur')::date >= $${idx++}::date`);
      params.push(date_from);
    }
    if (date_to) {
      conditions.push(`(g.received_at AT TIME ZONE 'Asia/Kuala_Lumpur')::date <= $${idx++}::date`);
      params.push(date_to);
    }

    const { rows } = await pool.query(
      `SELECT
         COALESCE(NULLIF(TRIM(m.lead_source),''), 'Unknown') AS lead_source,
         COUNT(*) FILTER (WHERE g.stage_key = 'CT')  AS ct,
         COUNT(*) FILTER (WHERE g.stage_key = 'SU')  AS su,
         COUNT(*) FILTER (WHERE g.stage_key = 'ENR') AS enr
       FROM ghl_stages g
       LEFT JOIN master_leads_powerbi m ON LOWER(TRIM(m.email)) = g.email
       WHERE ${conditions.join(' AND ')}
       GROUP BY COALESCE(NULLIF(TRIM(m.lead_source),''), 'Unknown')
       ORDER BY ct DESC`,
      params,
    );

    return res.json({ bySource: rows });
  } catch (err) {
    return next(err);
  }
});

module.exports = { ghlStagesRouter: router };
