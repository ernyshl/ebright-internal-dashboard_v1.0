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
    const rawStage    = (data.pipleline_stage || data.pipeline_stage || data.Stage || data.stage || '').trim();
    const studentName = (data.student_name || '').trim();
    const phone       = (data.phone        || '').trim();
    const branch      = (data.Branch       || data['Branch Name'] || '').trim();
    const pipelineName = (data.pipeline_name || '').trim();
    const contactType = (data.contact_type || 'lead').trim();
    const leadSource  = (data.source || data.contact_source || data.opportunity_source || data['Lead Source'] || '').trim();

    const stageKey = getStageKey(rawStage);
    if (!stageKey) {
      return res.status(200).json({ status: 'ignored', reason: 'unrecognised stage' });
    }

    // Fingerprint: same logic as GSheet code
    const fingerprint = `${email}|${lastName}|${studentName}|${rawStage}`.replace(/\s+/g, '');

    // Upsert — ON CONFLICT DO NOTHING deduplicates permanently
    await pool.query(
      `INSERT INTO ghl_stages
         (email, last_name, phone, stage_raw, stage_key, pipeline_name, branch, student_name, contact_type, fingerprint, lead_source)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
       ON CONFLICT (fingerprint) DO NOTHING`,
      [email, lastName, phone, rawStage, stageKey, pipelineName, branch, studentName, contactType, fingerprint, leadSource]
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
      stage = '', pipeline = '', pipelines = '', search = '',
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
    else if (pipelines) {
      const list = pipelines.split(',').map(p => p.trim()).filter(Boolean);
      if (list.length > 0) {
        const placeholders = list.map(() => `$${idx++}`).join(',');
        conditions.push(`pipeline_name IN (${placeholders})`);
        params.push(...list);
      }
    }
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
        `SELECT id, email, last_name, phone, stage_raw, stage_key, pipeline_name, branch, student_name, contact_type, lead_source,
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

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

    const { rows } = await pool.query(
      `SELECT pipeline_name,
              COUNT(*) FILTER (WHERE stage_key = 'NL')  AS nl,
              COUNT(*) FILTER (WHERE stage_key = 'CT')  AS ct,
              COUNT(*) FILTER (WHERE stage_key = 'SU')  AS su,
              COUNT(*) FILTER (WHERE stage_key = 'ENR') AS enr
       FROM ghl_stages
       ${where}
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

// ──────────────────────────────────────────────────────────────
// POST /api/ghl-stages — manually create a record (super_admin)
// ──────────────────────────────────────────────────────────────
router.post('/', requireAuth, requireRole(['super_admin']), async (req, res, next) => {
  try {
    const { email = '', last_name = '', phone = '', stage_raw = '', pipeline_name = '', branch = '', student_name = '', contact_type = 'lead', lead_source = '' } = req.body;

    const stageKey = getStageKey(stage_raw);
    if (!stageKey) return res.status(400).json({ error: 'Invalid stage. Use: New Lead (NL), Confirmed (CT), Show-Up (SU), or Enrolled (ENR)' });

    const fingerprint = `${email.trim().toLowerCase()}|${last_name.trim()}|${student_name.trim()}|${stage_raw.trim()}`.replace(/\s+/g, '');

    const { rows } = await pool.query(
      `INSERT INTO ghl_stages (email, last_name, phone, stage_raw, stage_key, pipeline_name, branch, student_name, contact_type, fingerprint, lead_source)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
       ON CONFLICT (fingerprint) DO NOTHING
       RETURNING id`,
      [email.trim().toLowerCase(), last_name.trim(), phone.trim(), stage_raw.trim(), stageKey, pipeline_name.trim(), branch.trim(), student_name.trim(), contact_type.trim(), fingerprint, lead_source.trim()]
    );

    if (rows.length === 0) return res.status(409).json({ error: 'Duplicate record (same fingerprint already exists)' });
    return res.status(201).json({ id: rows[0].id });
  } catch (err) {
    return next(err);
  }
});

// ──────────────────────────────────────────────────────────────
// PUT /api/ghl-stages/:id — update a record (super_admin)
// ──────────────────────────────────────────────────────────────
router.put('/:id', requireAuth, requireRole(['super_admin']), async (req, res, next) => {
  try {
    const { id } = req.params;
    const { email, last_name, phone, stage_raw, pipeline_name, branch, student_name, contact_type, lead_source } = req.body;

    // Recalculate stage_key if stage_raw changed
    let stageKey;
    if (stage_raw !== undefined) {
      stageKey = getStageKey(stage_raw);
      if (!stageKey) return res.status(400).json({ error: 'Invalid stage. Use: New Lead (NL), Confirmed (CT), Show-Up (SU), or Enrolled (ENR)' });
    }

    const sets = [];
    const params = [];
    let idx = 1;

    if (email !== undefined)        { sets.push(`email = $${idx++}`);         params.push(email.trim().toLowerCase()); }
    if (last_name !== undefined)    { sets.push(`last_name = $${idx++}`);     params.push(last_name.trim()); }
    if (phone !== undefined)        { sets.push(`phone = $${idx++}`);         params.push(phone.trim()); }
    if (stage_raw !== undefined)    { sets.push(`stage_raw = $${idx++}`);     params.push(stage_raw.trim()); sets.push(`stage_key = $${idx++}`); params.push(stageKey); }
    if (pipeline_name !== undefined){ sets.push(`pipeline_name = $${idx++}`); params.push(pipeline_name.trim()); }
    if (branch !== undefined)       { sets.push(`branch = $${idx++}`);        params.push(branch.trim()); }
    if (student_name !== undefined) { sets.push(`student_name = $${idx++}`);  params.push(student_name.trim()); }
    if (contact_type !== undefined) { sets.push(`contact_type = $${idx++}`);  params.push(contact_type.trim()); }
    if (lead_source !== undefined)  { sets.push(`lead_source = $${idx++}`);   params.push(lead_source.trim()); }

    if (sets.length === 0) return res.status(400).json({ error: 'No fields to update' });

    params.push(id);
    const { rowCount } = await pool.query(
      `UPDATE ghl_stages SET ${sets.join(', ')} WHERE id = $${idx}`,
      params
    );

    if (rowCount === 0) return res.status(404).json({ error: 'Record not found' });
    return res.json({ message: 'Updated' });
  } catch (err) {
    return next(err);
  }
});

// ──────────────────────────────────────────────────────────────
// DELETE /api/ghl-stages/:id — delete a record (super_admin)
// ──────────────────────────────────────────────────────────────
router.delete('/:id', requireAuth, requireRole(['super_admin']), async (req, res, next) => {
  try {
    const { id } = req.params;
    const { rowCount } = await pool.query('DELETE FROM ghl_stages WHERE id = $1', [id]);
    if (rowCount === 0) return res.status(404).json({ error: 'Record not found' });
    return res.json({ message: 'Deleted' });
  } catch (err) {
    return next(err);
  }
});

// ──────────────────────────────────────────────────────────────
// POST /api/ghl-stages/bulk — bulk import records (super_admin)
// Accepts JSON array of records
// ──────────────────────────────────────────────────────────────
router.post('/bulk', requireAuth, requireRole(['super_admin']), async (req, res, next) => {
  try {
    const { records, clearFirst } = req.body;
    if (!Array.isArray(records) || records.length === 0) {
      return res.status(400).json({ error: 'records must be a non-empty array' });
    }

    // Optionally wipe the table before re-importing
    if (clearFirst) {
      await pool.query('DELETE FROM ghl_stages');
    }

    let inserted = 0;
    let skipped = 0;

    for (const r of records) {
      const email       = (r.email || '').trim().toLowerCase();
      const lastName    = (r.last_name || '').trim();
      const phone       = (r.phone || '').trim();
      const rawStage    = (r.stage_raw || r.stage || '').trim();
      const pipelineName = (r.pipeline_name || '').trim();
      const branch      = (r.branch || '').trim();
      const studentName = (r.student_name || '').trim();
      const contactType = (r.contact_type || 'lead').trim();
      const leadSource  = (r.lead_source || '').trim();
      const receivedAt  = r.received_at || null;

      const stageKey = getStageKey(rawStage);
      if (!stageKey) { skipped++; continue; }

      const fingerprint = `${email}|${lastName}|${studentName}|${rawStage}`.replace(/\s+/g, '');

      const { rowCount } = await pool.query(
        `INSERT INTO ghl_stages (email, last_name, phone, stage_raw, stage_key, pipeline_name, branch, student_name, contact_type, fingerprint, lead_source, received_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11, COALESCE($12::timestamptz, NOW()))
         ON CONFLICT (fingerprint) DO NOTHING`,
        [email, lastName, phone, rawStage, stageKey, pipelineName, branch, studentName, contactType, fingerprint, leadSource, receivedAt]
      );

      if (rowCount > 0) inserted++;
      else skipped++;
    }

    return res.json({ inserted, skipped, total: records.length });
  } catch (err) {
    return next(err);
  }
});

// ──────────────────────────────────────────────────────────────
// GET /api/ghl-stages/tally — raw DB leads vs GHL leads for comparison
// ──────────────────────────────────────────────────────────────
router.get('/tally', requireAuth, requireRole(['super_admin']), async (req, res, next) => {
  try {
    const { date_from = '', date_to = '', pipeline = '', lead_source = '' } = req.query;

    // Raw leads from master_leads_powerbi
    const rawConditions = [];
    const rawParams = [];
    let ridx = 1;
    if (date_from) { rawConditions.push(`(submitted_at AT TIME ZONE 'Asia/Kuala_Lumpur')::date >= $${ridx++}::date`); rawParams.push(date_from); }
    if (date_to)   { rawConditions.push(`(submitted_at AT TIME ZONE 'Asia/Kuala_Lumpur')::date <= $${ridx++}::date`); rawParams.push(date_to); }
    if (pipeline)  { rawConditions.push(`clean_branch = $${ridx++}`); rawParams.push(pipeline); }
    if (lead_source) { rawConditions.push(`lead_source = $${ridx++}`); rawParams.push(lead_source); }
    const rawWhere = rawConditions.length ? `WHERE ${rawConditions.join(' AND ')}` : '';

    const { rows: rawLeads } = await pool.query(
      `SELECT LOWER(TRIM(email)) AS email, full_name, phone_number AS phone, clean_branch AS branch, lead_source,
              (submitted_at AT TIME ZONE 'Asia/Kuala_Lumpur') AS submitted_at
       FROM master_leads_powerbi ${rawWhere}
       ORDER BY submitted_at DESC`,
      rawParams,
    );

    // GHL leads
    const ghlConditions = [];
    const ghlParams = [];
    let gidx = 1;
    if (date_from) { ghlConditions.push(`(received_at AT TIME ZONE 'Asia/Kuala_Lumpur')::date >= $${gidx++}::date`); ghlParams.push(date_from); }
    if (date_to)   { ghlConditions.push(`(received_at AT TIME ZONE 'Asia/Kuala_Lumpur')::date <= $${gidx++}::date`); ghlParams.push(date_to); }
    if (pipeline)  {
      // Map branch name to pipeline codes — let the frontend handle this, just filter by pipeline_name
      ghlConditions.push(`pipeline_name = $${gidx++}`); ghlParams.push(pipeline);
    }
    if (lead_source) { ghlConditions.push(`lead_source = $${gidx++}`); ghlParams.push(lead_source); }
    const ghlWhere = ghlConditions.length ? `WHERE ${ghlConditions.join(' AND ')}` : '';

    const { rows: ghlLeads } = await pool.query(
      `SELECT email, last_name, phone, pipeline_name, stage_key, lead_source,
              (received_at AT TIME ZONE 'Asia/Kuala_Lumpur') AS received_at
       FROM ghl_stages ${ghlWhere}
       ORDER BY received_at DESC`,
      ghlParams,
    );

    return res.json({ rawLeads, ghlLeads });
  } catch (err) {
    return next(err);
  }
});

module.exports = { ghlStagesRouter: router };
