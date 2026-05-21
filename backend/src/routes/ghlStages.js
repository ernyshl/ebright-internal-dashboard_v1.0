const https = require('https');
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

// Fire-and-forget Telegram alert for double-fired NL webhooks.
function sendDoubleFireAlert({ botToken, chatIds, pipelineName, email, leadName, firstSeen, refiredAt }) {
  if (!botToken || !chatIds.length) return;
  const fmt = (d) => new Date(d).toLocaleString('en-MY', {
    timeZone: 'Asia/Kuala_Lumpur', day: 'numeric', month: 'short',
    hour: '2-digit', minute: '2-digit', hour12: false,
  });
  const text = `⚠️ Double Fire NL Detected\nPipeline: ${pipelineName || 'Unknown'}\nEmail: ${email}\nLead: ${leadName || 'Unknown'}\nFirst seen: ${fmt(firstSeen)}\nRe-fired: ${fmt(refiredAt)}`;
  for (const chatId of chatIds) {
    const body = JSON.stringify({ chat_id: chatId, text });
    const req = https.request({
      hostname: 'api.telegram.org',
      path: `/bot${botToken}/sendMessage`,
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) },
    }, () => {});
    req.on('error', (err) => console.error('[double-fire alert] telegram error:', err.message));
    req.write(body);
    req.end();
  }
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
    // Opportunity name — try the keys GHL workflows actually populate, in priority order.
    const opportunityName = (
      data.opportunity_name
      || data.name
      || data.full_name
      || data.contact_name
      || data.student_name
      || [data.first_name, data.last_name].filter(Boolean).join(' ')
      || ''
    ).trim();

    const stageKey = getStageKey(rawStage);
    if (!stageKey) {
      await writeLog({ action: 'ignored', email, stageRaw: rawStage, ignoreReason: 'unrecognised stage' });
      return res.status(200).json({ status: 'ignored', reason: 'unrecognised stage' });
    }

    // Duplicate check — split by stage.
    // NL: check by (email, pipeline_name) because GHL re-fires often come with a
    //     different opportunity_name, bypassing the old (email+opp_name+stage) key.
    // Other stages: keep original (email, opportunity_name, stage_key) check.
    {
      let existsRows;
      if (stageKey === 'NL') {
        const result = await pool.query(
          `SELECT received_at, pipeline_name FROM ghl_stages
           WHERE email = $1 AND stage_key = 'NL' AND pipeline_name = $2
           LIMIT 1`,
          [email, pipelineName]
        );
        existsRows = result.rows;
      } else {
        const result = await pool.query(
          `SELECT received_at, pipeline_name FROM ghl_stages
           WHERE email = $1 AND opportunity_name = $2 AND stage_key = $3
           LIMIT 1`,
          [email, opportunityName, stageKey]
        );
        existsRows = result.rows;
      }
      if (existsRows.length > 0) {
        if (stageKey === 'NL') {
          sendDoubleFireAlert({
            botToken: env.TELEGRAM_BOT_TOKEN,
            chatIds: (env.TELEGRAM_ALERT_CHATS || '').split(',').map(s => s.trim()).filter(Boolean),
            pipelineName: pipelineName || existsRows[0].pipeline_name,
            email,
            leadName: opportunityName || studentName,
            firstSeen: existsRows[0].received_at,
            refiredAt: new Date(),
          });
          await writeLog({ action: 'ignored', email, stageRaw: rawStage, stageKey, ignoreReason: 'NL double-fire: email already has NL in this pipeline' });
          return res.status(200).json({ status: 'ignored', reason: 'NL double-fire' });
        } else {
          await writeLog({ action: 'ignored', email, stageRaw: rawStage, stageKey, ignoreReason: 'same email+opportunity_name+stage already exists' });
          return res.status(200).json({ status: 'ignored', reason: 'duplicate (email+opportunity_name+stage)' });
        }
      }
    }

    const fingerprint = `${email}|${lastName}|${studentName}|${rawStage}`.replace(/\s+/g, '');

    const { rowCount } = await pool.query(
      `INSERT INTO ghl_stages
         (email, last_name, opportunity_name, phone, stage_raw, stage_key, pipeline_name, branch, student_name, contact_type, fingerprint, lead_source, preferred_day, time_slot, source)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,'webhook')
       ON CONFLICT (email, opportunity_name, stage_key) WHERE source = 'webhook' DO UPDATE SET
         last_name     = COALESCE(NULLIF(EXCLUDED.last_name, ''),     ghl_stages.last_name),
         phone         = COALESCE(NULLIF(EXCLUDED.phone, ''),         ghl_stages.phone),
         pipeline_name = COALESCE(NULLIF(EXCLUDED.pipeline_name, ''), ghl_stages.pipeline_name),
         branch        = COALESCE(NULLIF(EXCLUDED.branch, ''),        ghl_stages.branch),
         student_name  = COALESCE(NULLIF(EXCLUDED.student_name, ''),  ghl_stages.student_name),
         contact_type  = COALESCE(NULLIF(EXCLUDED.contact_type, ''),  ghl_stages.contact_type),
         lead_source   = COALESCE(NULLIF(EXCLUDED.lead_source, ''),   ghl_stages.lead_source),
         preferred_day = COALESCE(NULLIF(EXCLUDED.preferred_day, ''), ghl_stages.preferred_day),
         time_slot     = COALESCE(NULLIF(EXCLUDED.time_slot, ''),     ghl_stages.time_slot)`,
      [email, lastName, opportunityName, phone, rawStage, stageKey, pipelineName, branch, studentName, contactType, fingerprint, leadSource, preferredDay, timeSlot]
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
      stage = '', pipeline = '', pipelines = '',
      preferred_day = '', time_slot = '', search = '',
      via_ct = '',
      page = 1, limit = 50,
    } = req.query;

    const conditions = [];
    const params = [];
    let idx = 1;

    const useViaCt = String(via_ct) === '1';

    if (useViaCt) {
      // Filters that semantically belong to the lead's CT booking get moved
      // into an EXISTS clause against the matching CT row. Lets ENR drill-downs
      // from the For Manjeet dashboards filter by the CT's date/day/slot rather
      // than the ENR row's own (often empty) fields.
      const ex = [
        `ct.email = ghl_stages.email`,
        `ct.opportunity_name = ghl_stages.opportunity_name`,
        `ct.stage_key = 'CT'`,
        `ct.preferred_day <> ''`,
        `ct.time_slot <> ''`,
      ];
      if (date_from) {
        ex.push(`(ct.received_at AT TIME ZONE 'Asia/Kuala_Lumpur')::date >= $${idx++}::date`);
        params.push(date_from);
      }
      if (date_to) {
        ex.push(`(ct.received_at AT TIME ZONE 'Asia/Kuala_Lumpur')::date <= $${idx++}::date`);
        params.push(date_to);
      }
      if (preferred_day) { ex.push(`ct.preferred_day = $${idx++}`); params.push(preferred_day); }
      if (time_slot)     { ex.push(`ct.time_slot LIKE $${idx++}`);   params.push(`${time_slot}%`); }
      conditions.push(`EXISTS (SELECT 1 FROM ghl_stages ct WHERE ${ex.join(' AND ')})`);
    } else {
      if (date_from) {
        conditions.push(`(received_at AT TIME ZONE 'Asia/Kuala_Lumpur')::date >= $${idx++}::date`);
        params.push(date_from);
      }
      if (date_to) {
        conditions.push(`(received_at AT TIME ZONE 'Asia/Kuala_Lumpur')::date <= $${idx++}::date`);
        params.push(date_to);
      }
      if (preferred_day) { conditions.push(`preferred_day = $${idx++}`); params.push(preferred_day); }
      if (time_slot) {
        // Stored values look like '1730 | 05:30pm' — match by leading 4-digit code.
        conditions.push(`time_slot LIKE $${idx++}`);
        params.push(`${time_slot}%`);
      }
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
      conditions.push(`(email ILIKE $${idx} OR opportunity_name ILIKE $${idx} OR last_name ILIKE $${idx} OR phone ILIKE $${idx})`);
      params.push(`%${search}%`);
      idx++;
    }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    const offset = (Number(page) - 1) * Number(limit);

    // Deduplicate: one row per (email, opportunity_name, stage_key), preferring
    // the row that has preferred_day/time_slot, then the most recent.
    const dedupCte = `
      WITH deduped AS (
        SELECT DISTINCT ON (email, opportunity_name, stage_key)
          id, email, last_name, opportunity_name, phone, stage_raw, stage_key, pipeline_name, branch,
          student_name, contact_type, lead_source, preferred_day, time_slot, received_at
        FROM ghl_stages
        ${where}
        ORDER BY email, opportunity_name, stage_key,
          CASE WHEN preferred_day <> '' OR time_slot <> '' THEN 0 ELSE 1 END,
          received_at DESC
      )
    `;

    const [countResult, dataResult] = await Promise.all([
      pool.query(`${dedupCte} SELECT COUNT(*) FROM deduped`, params),
      pool.query(
        `${dedupCte}
         SELECT id, email, last_name, opportunity_name, phone, stage_raw, stage_key, pipeline_name, branch, student_name, contact_type, lead_source, preferred_day, time_slot,
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
         SELECT DISTINCT ON (email, opportunity_name, stage_key) pipeline_name, stage_key
         FROM ghl_stages
         ${where}
         ORDER BY email, opportunity_name, stage_key,
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
    const { email = '', last_name = '', opportunity_name = '', phone = '', stage_raw = '', pipeline_name = '', branch = '', student_name = '', contact_type = 'lead', lead_source = '', preferred_day = '', time_slot = '' } = req.body;

    const stageKey = getStageKey(stage_raw);
    if (!stageKey) return res.status(400).json({ error: 'Invalid stage. Use: New Lead (NL), Confirmed (CT), Show-Up (SU), or Enrolled (ENR)' });

    const oppName = (opportunity_name || last_name || student_name || '').trim();
    const fingerprint = `${email.trim().toLowerCase()}|${last_name.trim()}|${student_name.trim()}|${stage_raw.trim()}`.replace(/\s+/g, '');
    const emailLc = email.trim().toLowerCase();

    // Pre-check across ALL sources — manual create still rejects duplicates of
    // any existing row (webhook, replay, or another manual).
    const { rows: dup } = await pool.query(
      `SELECT 1 FROM ghl_stages WHERE email = $1 AND opportunity_name = $2 AND stage_key = $3 LIMIT 1`,
      [emailLc, oppName, stageKey]
    );
    if (dup.length > 0) return res.status(409).json({ error: 'Duplicate record (same email+opportunity_name+stage already exists)' });

    const { rows } = await pool.query(
      `INSERT INTO ghl_stages (email, last_name, opportunity_name, phone, stage_raw, stage_key, pipeline_name, branch, student_name, contact_type, fingerprint, lead_source, preferred_day, time_slot, source)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,'manual')
       RETURNING id`,
      [emailLc, last_name.trim(), oppName, phone.trim(), stage_raw.trim(), stageKey, pipeline_name.trim(), branch.trim(), student_name.trim(), contact_type.trim(), fingerprint, lead_source.trim(), preferred_day.trim(), time_slot.trim()]
    );

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
    const { email, last_name, opportunity_name, phone, stage_raw, pipeline_name, branch, student_name, contact_type, lead_source, preferred_day, time_slot } = req.body;

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
    if (opportunity_name !== undefined) { sets.push(`opportunity_name = $${idx++}`); params.push(opportunity_name.trim()); }
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
      const oppName = (r.opportunity_name || lastName || studentName || '').trim();

      // Use a unique fingerprint per row to allow duplicates in bulk import.
      // source='manual' so the partial unique index on webhook rows does
      // not block bulk backfill that overlaps with existing webhook rows.
      const bulkFingerprint = `${fingerprint}|${receivedAt || Date.now()}|${inserted + skipped}`;

      const { rowCount } = await pool.query(
        `INSERT INTO ghl_stages (email, last_name, opportunity_name, phone, stage_raw, stage_key, pipeline_name, branch, student_name, contact_type, fingerprint, lead_source, preferred_day, time_slot, received_at, source)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14, COALESCE($15::timestamptz, NOW()), 'manual')
         ON CONFLICT (fingerprint) DO NOTHING`,
        [email, lastName, oppName, phone, rawStage, stageKey, pipelineName, branch, studentName, contactType, bulkFingerprint, leadSource, preferredDay, timeSlot, receivedAt]
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
      `SELECT DISTINCT ON (email, pipeline_name)
              email, last_name, phone, pipeline_name, stage_key, lead_source, preferred_day, time_slot,
              (received_at AT TIME ZONE 'Asia/Kuala_Lumpur') AS received_at
       FROM ghl_stages ${ghlWhere}
       ORDER BY email, pipeline_name, received_at ASC`,
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
    const conditions = [`ct.stage_key = 'CT'`, `ct.preferred_day <> ''`, `ct.time_slot <> ''`];
    const params = [];
    let idx = 1;
    if (date_from) {
      conditions.push(`(ct.received_at AT TIME ZONE 'Asia/Kuala_Lumpur')::date >= $${idx++}::date`);
      params.push(date_from);
    }
    if (date_to) {
      conditions.push(`(ct.received_at AT TIME ZONE 'Asia/Kuala_Lumpur')::date <= $${idx++}::date`);
      params.push(date_to);
    }
    const where = `WHERE ${conditions.join(' AND ')}`;
    const { rows } = await pool.query(
      `SELECT ct.pipeline_name, ct.preferred_day, ct.time_slot,
              COUNT(*)::int AS n,
              COUNT(*) FILTER (WHERE enr.email IS NOT NULL)::int AS n_enr
       FROM ghl_stages ct
       LEFT JOIN ghl_stages enr
         ON enr.email = ct.email
        AND enr.opportunity_name = ct.opportunity_name
        AND enr.stage_key = 'ENR'
       ${where}
       GROUP BY ct.pipeline_name, ct.preferred_day, ct.time_slot
       ORDER BY ct.pipeline_name, ct.preferred_day, ct.time_slot`,
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
    // Opportunity name — try the keys GHL workflows actually populate, in priority order.
    const opportunityName = (
      data.opportunity_name
      || data.name
      || data.full_name
      || data.contact_name
      || data.student_name
      || [data.first_name, data.last_name].filter(Boolean).join(' ')
      || ''
    ).trim();

    const stageKey = getStageKey(rawStage);
    if (!stageKey) return res.status(400).json({ error: 'Unrecognised stage in payload' });

    const fingerprint = `${email}|${lastName}|${studentName}|${rawStage}`.replace(/\s+/g, '');

    // Replay path is allowed to insert a duplicate of an existing
    // (email, opportunity_name, stage_key) row. The partial unique index only
    // covers source = 'webhook', so this insert with source = 'replay'
    // bypasses it. The Lead Centre display dedups via DISTINCT ON, so
    // duplicates render as one row.
    await pool.query(
      `INSERT INTO ghl_stages
         (email, last_name, opportunity_name, phone, stage_raw, stage_key, pipeline_name, branch, student_name, contact_type, fingerprint, lead_source, preferred_day, time_slot, source)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,'replay')`,
      [email, lastName, opportunityName, phone, rawStage, stageKey, pipelineName, branch, studentName, contactType, fingerprint, leadSource, preferredDay, timeSlot]
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

// ──────────────────────────────────────────────────────────────
// GET /api/ghl-stages/ct-nl-summary
// CT→NL tally: hardcoded GHL 16–20 per-branch + live DB today count
// ──────────────────────────────────────────────────────────────
const GHL_16_20 = {
  '01 ONL':  { name: 'Online',         count: 49 },
  '02 ST':   { name: 'Subang Taipan',  count: 31 },
  '03 SP':   { name: 'Sri Petaling',   count: 17 },
  '04 SA':   { name: 'Setia Alam',     count: 38 },
  '05 KD':   { name: 'Kota Damansara', count: 20 },
  '06 PJY':  { name: 'Putrajaya',      count: 36 },
  '07 AMP':  { name: 'Ampang',         count: 36 },
  '08 CJY':  { name: 'Cyberjaya',      count: 22 },
  '09 KLG':  { name: 'Klang',          count: 19 },
  '10 DA':   { name: 'Denai Alam',     count: 12 },
  '11 BBB':  { name: 'Bangi',          count: 25 },
  '12 DK':   { name: 'Danau Kota',     count: 31 },
  '13 SHA':  { name: 'Shah Alam',      count: 20 },
  '14 BTHO': { name: 'BTHO',           count: 10 },
  '15 EGR':  { name: 'Eco Grandeur',   count: 30 },
  '16 BSP':  { name: 'BSP',            count: 18 },
  '17 RBY':  { name: 'Rimbayu',        count: 36 },
  '18 TSG':  { name: 'TSG',            count: 18 },
  '19 KW':   { name: 'Kita Warisan',   count: 17 },
  '20 KTG':  { name: 'KTG',            count: 13 },
};
const GHL_CONFIRMED_TOTAL = 564;
const GHL_TODAY_CONFIRMED = 70;

router.get('/ct-nl-summary', requireAuth, requireRole(ALLOWED_ROLES), async (req, res, next) => {
  try {
    const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kuala_Lumpur' });
    const { rows } = await pool.query(`
      SELECT pipeline_name, COUNT(*) AS nl_count
      FROM ghl_stages
      WHERE stage_key = 'NL'
        AND (received_at AT TIME ZONE 'Asia/Kuala_Lumpur')::date = $1
      GROUP BY pipeline_name
    `, [today]);

    const dbToday = {};
    for (const r of rows) dbToday[r.pipeline_name] = parseInt(r.nl_count);

    const branches = Object.entries(GHL_16_20).map(([pipeline, { name, count }]) => ({
      pipeline,
      name,
      ghl1620: count,
      dbToday: dbToday[pipeline] || 0,
      total: count + (dbToday[pipeline] || 0),
    }));

    return res.json({
      branches,
      summary: {
        ghl1620Total: 498,
        todayCount: GHL_TODAY_CONFIRMED,
        ghlTotal: GHL_CONFIRMED_TOTAL,
      },
      date: today,
    });
  } catch (err) {
    return next(err);
  }
});

module.exports = { ghlStagesRouter: router };
