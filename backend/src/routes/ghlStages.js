const express = require('express');
const { pool } = require('../db');
const { env } = require('../env');
const { requireAuth, requireRole } = require('../middleware/auth');

const router = express.Router();

const ALLOWED_ROLES = ['super_admin', 'ceo', 'marketing', 'od', 'rm', 'hr', 'tv'];

// `master_leads_powerbi` was simplified upstream and dropped PII columns
// (full_name, email, phone). Pull from `master_leads_base` and alias the
// columns so existing query text below keeps working unchanged.
const LEADS_SRC = `(SELECT
    source           AS lead_source,
    full_name,
    email,
    phone            AS phone_number,
    branch           AS clean_branch,
    branch           AS raw_branch_text,
    NULL::text       AS region,
    submission_date  AS submitted_at
  FROM master_leads_base) AS leads_view`;

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
  const startedAt = Date.now();
  const rawBody   = req.body;

  // helper — fire-and-forget log insert, never throws
  async function writeLog({ action, email, stageRaw, stageKey, fingerprint, ignoreReason, errorMessage }) {
    try {
      await pool.query(
        `INSERT INTO ghl_webhook_log
           (raw_body, email, stage_raw, stage_key, fingerprint, action, ignore_reason, error_message, duration_ms)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
        [
          JSON.stringify(rawBody),
          email        || null,
          stageRaw     || null,
          stageKey     || null,
          fingerprint  || null,
          action,
          ignoreReason || null,
          errorMessage || null,
          Date.now() - startedAt,
        ]
      );
    } catch (logErr) {
      console.error('[GHL webhook] log write failed:', logErr.message);
    }
  }

  try {
    // Optional secret check
    if (env.GHL_WEBHOOK_SECRET) {
      const incoming = req.query.secret || req.headers['x-webhook-secret'] || '';
      if (incoming !== env.GHL_WEBHOOK_SECRET) {
        return res.status(401).json({ error: 'Invalid webhook secret' });
      }
    }

    const data = rawBody;
    const cd   = data.customData || {};

    const email        = (data.email        || '').trim().toLowerCase();
    const lastName     = (data.last_name    || '').trim();
    const rawStage     = (data.pipleline_stage || data.pipeline_stage || data.Stage || data.stage || '').trim();
    const studentName  = (data.student_name || '').trim();
    const phone        = (data.phone        || '').trim();
    const branch       = (data.Branch       || data['Branch Name'] || '').trim();
    const pipelineName = (data.pipeline_name || '').trim();
    const contactType  = (data.contact_type || 'lead').trim();
    const leadSource   = (data.source || data.contact_source || data.opportunity_source || data['Lead Source'] || '').trim();
    const preferredDay = (cd.preferred_day || data.preferred_day || '').trim();
    const timeSlot     = (cd.time_slot     || data.time_slot     || '').trim();

    const stageKey = getStageKey(rawStage);
    if (!stageKey) {
      await writeLog({ action: 'ignored', email, stageRaw: rawStage, ignoreReason: 'unrecognised stage' });
      return res.status(200).json({ status: 'ignored', reason: 'unrecognised stage' });
    }

    // Ignore duplicate fires for the same person at the same stage:
    // same email + same last_name + same stage_key → already captured.
    // Different last_name (e.g. siblings sharing a parent's email) is allowed
    // through as a distinct lead. The full payload is preserved in
    // ghl_webhook_log (action='ignored') and surfaced via the
    // ghl_ignored_payloads view so it can be replayed later if needed.
    {
      const { rows: exists } = await pool.query(
        `SELECT 1 FROM ghl_stages
         WHERE email = $1 AND last_name = $2 AND stage_key = $3
         LIMIT 1`,
        [email, lastName, stageKey]
      );
      if (exists.length > 0) {
        await writeLog({ action: 'ignored', email, stageRaw: rawStage, stageKey, ignoreReason: 'same email+last_name+stage already exists' });
        return res.status(200).json({ status: 'ignored', reason: 'duplicate (email+last_name+stage)' });
      }
    }

    const fingerprint = `${email}|${lastName}|${studentName}|${rawStage}`.replace(/\s+/g, '');

    const { rowCount } = await pool.query(
      `INSERT INTO ghl_stages
         (email, last_name, phone, stage_raw, stage_key, pipeline_name, branch, student_name, contact_type, fingerprint, lead_source, preferred_day, time_slot)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
       ON CONFLICT (fingerprint) DO UPDATE SET
         email         = COALESCE(NULLIF(EXCLUDED.email, ''),         ghl_stages.email),
         last_name     = COALESCE(NULLIF(EXCLUDED.last_name, ''),     ghl_stages.last_name),
         phone         = COALESCE(NULLIF(EXCLUDED.phone, ''),         ghl_stages.phone),
         pipeline_name = COALESCE(NULLIF(EXCLUDED.pipeline_name, ''), ghl_stages.pipeline_name),
         branch        = COALESCE(NULLIF(EXCLUDED.branch, ''),        ghl_stages.branch),
         student_name  = COALESCE(NULLIF(EXCLUDED.student_name, ''),  ghl_stages.student_name),
         contact_type  = COALESCE(NULLIF(EXCLUDED.contact_type, ''),  ghl_stages.contact_type),
         lead_source   = COALESCE(NULLIF(EXCLUDED.lead_source, ''),   ghl_stages.lead_source),
         preferred_day = COALESCE(NULLIF(EXCLUDED.preferred_day, ''), ghl_stages.preferred_day),
         time_slot     = COALESCE(NULLIF(EXCLUDED.time_slot, ''),     ghl_stages.time_slot)`,
      [email, lastName, phone, rawStage, stageKey, pipelineName, branch, studentName, contactType, fingerprint, leadSource, preferredDay, timeSlot]
    );

    // rowCount > 0 = inserted, 0 = updated (ON CONFLICT fired)
    const action = rowCount > 0 ? 'inserted' : 'updated';
    await writeLog({ action, email, stageRaw: rawStage, stageKey, fingerprint });

    return res.status(200).json({ status: 'ok' });
  } catch (err) {
    console.error('[GHL webhook]', err.message);
    await writeLog({ action: 'error', errorMessage: err.message });
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

    // Deduplicate: one row per email+stage_key, preferring the row that has
    // preferred_day/time_slot, then the most recent.
    const dedupCte = `
      WITH deduped AS (
        SELECT DISTINCT ON (email, stage_key)
          id, email, last_name, phone, stage_raw, stage_key, pipeline_name, branch,
          student_name, contact_type, lead_source, preferred_day, time_slot, received_at
        FROM ghl_stages
        ${where}
        ORDER BY email, stage_key,
          CASE WHEN preferred_day <> '' OR time_slot <> '' THEN 0 ELSE 1 END,
          received_at DESC
      )
    `;

    const [countResult, dataResult] = await Promise.all([
      pool.query(`${dedupCte} SELECT COUNT(*) FROM deduped`, params),
      pool.query(
        `${dedupCte}
         SELECT id, email, last_name, phone, stage_raw, stage_key, pipeline_name, branch, student_name, contact_type, lead_source, preferred_day, time_slot,
                (received_at AT TIME ZONE 'Asia/Kuala_Lumpur') AS received_at_local
         FROM deduped
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
      `WITH deduped AS (
         SELECT DISTINCT ON (email, stage_key) pipeline_name, stage_key
         FROM ghl_stages
         ${where}
         ORDER BY email, stage_key,
           CASE WHEN preferred_day <> '' OR time_slot <> '' THEN 0 ELSE 1 END,
           received_at DESC
       )
       SELECT pipeline_name,
              COUNT(*) FILTER (WHERE stage_key = 'NL')  AS nl,
              COUNT(*) FILTER (WHERE stage_key = 'CT')  AS ct,
              COUNT(*) FILTER (WHERE stage_key = 'SU')  AS su,
              COUNT(*) FILTER (WHERE stage_key = 'ENR') AS enr
       FROM deduped
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
         COALESCE(NULLIF(TRIM(leads_view.lead_source),''), 'Unknown') AS lead_source,
         COUNT(*) FILTER (WHERE g.stage_key = 'CT')  AS ct,
         COUNT(*) FILTER (WHERE g.stage_key = 'SU')  AS su,
         COUNT(*) FILTER (WHERE g.stage_key = 'ENR') AS enr
       FROM ghl_stages g
       LEFT JOIN ${LEADS_SRC} ON LOWER(TRIM(leads_view.email)) = g.email
       WHERE ${conditions.join(' AND ')}
       GROUP BY COALESCE(NULLIF(TRIM(leads_view.lead_source),''), 'Unknown')
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
    const { email = '', last_name = '', phone = '', stage_raw = '', pipeline_name = '', branch = '', student_name = '', contact_type = 'lead', lead_source = '', preferred_day = '', time_slot = '' } = req.body;

    const stageKey = getStageKey(stage_raw);
    if (!stageKey) return res.status(400).json({ error: 'Invalid stage. Use: New Lead (NL), Confirmed (CT), Show-Up (SU), or Enrolled (ENR)' });

    const fingerprint = `${email.trim().toLowerCase()}|${last_name.trim()}|${student_name.trim()}|${stage_raw.trim()}`.replace(/\s+/g, '');

    const { rows } = await pool.query(
      `INSERT INTO ghl_stages (email, last_name, phone, stage_raw, stage_key, pipeline_name, branch, student_name, contact_type, fingerprint, lead_source, preferred_day, time_slot)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
       ON CONFLICT (fingerprint) DO NOTHING
       RETURNING id`,
      [email.trim().toLowerCase(), last_name.trim(), phone.trim(), stage_raw.trim(), stageKey, pipeline_name.trim(), branch.trim(), student_name.trim(), contact_type.trim(), fingerprint, lead_source.trim(), preferred_day.trim(), time_slot.trim()]
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
    const { email, last_name, phone, stage_raw, pipeline_name, branch, student_name, contact_type, lead_source, preferred_day, time_slot } = req.body;

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
    if (preferred_day !== undefined){ sets.push(`preferred_day = $${idx++}`); params.push(preferred_day.trim()); }
    if (time_slot !== undefined)    { sets.push(`time_slot = $${idx++}`);     params.push(time_slot.trim()); }

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
      const preferredDay = (r.preferred_day || '').trim();
      const timeSlot    = (r.time_slot || '').trim();
      const receivedAt  = r.received_at || null;

      const stageKey = getStageKey(rawStage);
      if (!stageKey) { skipped++; continue; }

      const fingerprint = `${email}|${lastName}|${studentName}|${rawStage}`.replace(/\s+/g, '');

      // Use a unique fingerprint per row to allow duplicates in bulk import
      const bulkFingerprint = `${fingerprint}|${receivedAt || Date.now()}|${inserted + skipped}`;

      const { rowCount } = await pool.query(
        `INSERT INTO ghl_stages (email, last_name, phone, stage_raw, stage_key, pipeline_name, branch, student_name, contact_type, fingerprint, lead_source, preferred_day, time_slot, received_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13, COALESCE($14::timestamptz, NOW()))
         ON CONFLICT (fingerprint) DO NOTHING`,
        [email, lastName, phone, rawStage, stageKey, pipelineName, branch, studentName, contactType, bulkFingerprint, leadSource, preferredDay, timeSlot, receivedAt]
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
router.get('/tally', requireAuth, requireRole(ALLOWED_ROLES), async (req, res, next) => {
  try {
    const { date_from = '', date_to = '', pipeline = '', lead_source = '' } = req.query;

    // Raw leads — see LEADS_SRC at top (master_leads_base aliased to old powerbi contract)
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
       FROM ${LEADS_SRC} ${rawWhere}
       ORDER BY submitted_at DESC`,
      rawParams,
    );

    // GHL leads — only NL stage
    const ghlConditions = [`stage_key = 'NL'`];
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
      `SELECT email, last_name, phone, pipeline_name, stage_key, lead_source, preferred_day, time_slot,
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

// ──────────────────────────────────────────────────────────────
// GET /api/ghl-stages/ct-calendar — CT counts grouped by pipeline × preferred_day × time_slot
// Used by the Trial Slot calendar on the Tally page so BMs can plan manpower.
// ──────────────────────────────────────────────────────────────
router.get('/ct-calendar', requireAuth, requireRole(ALLOWED_ROLES), async (req, res, next) => {
  try {
    const { date_from = '', date_to = '' } = req.query;
    const conditions = [`stage_key = 'CT'`, `preferred_day <> ''`, `time_slot <> ''`];
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
    const where = `WHERE ${conditions.join(' AND ')}`;
    const { rows } = await pool.query(
      `SELECT pipeline_name, preferred_day, time_slot, COUNT(*)::int AS n
       FROM ghl_stages
       ${where}
       GROUP BY pipeline_name, preferred_day, time_slot
       ORDER BY pipeline_name, preferred_day, time_slot`,
      params,
    );
    return res.json({ rows });
  } catch (err) {
    return next(err);
  }
});

// ──────────────────────────────────────────────────────────────
// GET /api/ghl-stages/ignored — paginated list of ignored webhook payloads
// ──────────────────────────────────────────────────────────────
router.get('/ignored', requireAuth, requireRole(['super_admin', 'ceo', 'od']), async (req, res, next) => {
  try {
    const { search = '', show = 'pending', page = 1, limit = 50 } = req.query;
    const conditions = [`action = 'ignored'`];
    const params = [];
    let idx = 1;

    // The opportunity name lives on different keys depending on the GHL workflow
    // template — try the common ones in priority order, fall back to first+last.
    const oppNameSql = `COALESCE(
      NULLIF(TRIM(raw_body->>'opportunity_name'), ''),
      NULLIF(TRIM(raw_body->>'name'), ''),
      NULLIF(TRIM(raw_body->>'full_name'), ''),
      NULLIF(TRIM(raw_body->>'contact_name'), ''),
      NULLIF(TRIM(raw_body->>'student_name'), ''),
      NULLIF(TRIM(CONCAT_WS(' ', raw_body->>'first_name', raw_body->>'last_name')), '')
    )`;

    if (show === 'pending')       conditions.push('replayed_at IS NULL');
    else if (show === 'replayed') conditions.push('replayed_at IS NOT NULL');
    // 'all' applies no replayed_at filter

    if (search) {
      conditions.push(`(
        email ILIKE $${idx}
        OR stage_raw ILIKE $${idx}
        OR ignore_reason ILIKE $${idx}
        OR ${oppNameSql} ILIKE $${idx}
      )`);
      params.push(`%${search}%`);
      idx++;
    }

    const where = `WHERE ${conditions.join(' AND ')}`;
    const offset = (Number(page) - 1) * Number(limit);

    const [countResult, dataResult] = await Promise.all([
      pool.query(`SELECT COUNT(*) FROM ghl_webhook_log ${where}`, params),
      pool.query(
        `SELECT id, email, stage_raw, stage_key, fingerprint,
                ignore_reason AS reason, raw_body AS payload,
                ${oppNameSql} AS opportunity_name,
                duration_ms, created_at, replayed_at
         FROM ghl_webhook_log
         ${where}
         ORDER BY created_at DESC
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
// POST /api/ghl-stages/ignored/:id/replay — re-process an ignored payload
// Re-parses the original raw_body and upserts into ghl_stages, merging
// non-empty fields into the existing row (matched on email+last_name+
// stage_key thanks to uq_ghl_stages_email_lastname_stage). Stamps
// replayed_at on the log row so the UI removes it from the pending list.
// ──────────────────────────────────────────────────────────────
router.post('/ignored/:id/replay', requireAuth, requireRole(['super_admin']), async (req, res, next) => {
  try {
    const { id } = req.params;

    const { rows: logs } = await pool.query(
      `SELECT raw_body, action, replayed_at FROM ghl_webhook_log WHERE id = $1`,
      [id]
    );
    if (logs.length === 0) return res.status(404).json({ error: 'Payload not found' });
    if (logs[0].action !== 'ignored') return res.status(400).json({ error: 'Only ignored payloads can be replayed' });
    if (logs[0].replayed_at) return res.status(400).json({ error: 'Payload already replayed' });

    const data = logs[0].raw_body || {};
    const cd   = data.customData || {};

    const email        = (data.email        || '').trim().toLowerCase();
    const lastName     = (data.last_name    || '').trim();
    const rawStage     = (data.pipleline_stage || data.pipeline_stage || data.Stage || data.stage || '').trim();
    const studentName  = (data.student_name || '').trim();
    const phone        = (data.phone        || '').trim();
    const branch       = (data.Branch       || data['Branch Name'] || '').trim();
    const pipelineName = (data.pipeline_name || '').trim();
    const contactType  = (data.contact_type || 'lead').trim();
    const leadSource   = (data.source || data.contact_source || data.opportunity_source || data['Lead Source'] || '').trim();
    const preferredDay = (cd.preferred_day || data.preferred_day || '').trim();
    const timeSlot     = (cd.time_slot     || data.time_slot     || '').trim();

    const stageKey = getStageKey(rawStage);
    if (!stageKey) return res.status(400).json({ error: 'Unrecognised stage in payload' });

    const fingerprint = `${email}|${lastName}|${studentName}|${rawStage}`.replace(/\s+/g, '');

    // Upsert against the (email, last_name, stage_key) unique index — non-empty
    // values from the payload overwrite the existing row, empty values preserve it.
    await pool.query(
      `INSERT INTO ghl_stages
         (email, last_name, phone, stage_raw, stage_key, pipeline_name, branch, student_name, contact_type, fingerprint, lead_source, preferred_day, time_slot)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
       ON CONFLICT (email, last_name, stage_key) DO UPDATE SET
         phone         = COALESCE(NULLIF(EXCLUDED.phone, ''),         ghl_stages.phone),
         pipeline_name = COALESCE(NULLIF(EXCLUDED.pipeline_name, ''), ghl_stages.pipeline_name),
         branch        = COALESCE(NULLIF(EXCLUDED.branch, ''),        ghl_stages.branch),
         student_name  = COALESCE(NULLIF(EXCLUDED.student_name, ''),  ghl_stages.student_name),
         contact_type  = COALESCE(NULLIF(EXCLUDED.contact_type, ''),  ghl_stages.contact_type),
         lead_source   = COALESCE(NULLIF(EXCLUDED.lead_source, ''),   ghl_stages.lead_source),
         preferred_day = COALESCE(NULLIF(EXCLUDED.preferred_day, ''), ghl_stages.preferred_day),
         time_slot     = COALESCE(NULLIF(EXCLUDED.time_slot, ''),     ghl_stages.time_slot)`,
      [email, lastName, phone, rawStage, stageKey, pipelineName, branch, studentName, contactType, fingerprint, leadSource, preferredDay, timeSlot]
    );

    await pool.query(
      `UPDATE ghl_webhook_log SET replayed_at = NOW() WHERE id = $1`,
      [id]
    );

    return res.json({ status: 'ok', message: 'Payload replayed and merged into ghl_stages' });
  } catch (err) {
    console.error('[GHL replay]', err.message);
    return next(err);
  }
});

module.exports = { ghlStagesRouter: router };
