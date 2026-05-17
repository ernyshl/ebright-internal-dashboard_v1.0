const express = require('express');
const { z } = require('zod');
const { pool } = require('../db');
const { requireAuth } = require('../middleware/auth');
const { requireDashboard } = require('../middleware/dashboards');
const { readTab, cacheInvalidate } = require('../lib/sheetsReader');
const {
  SPREADSHEET_ID,
  BRANCHES,
  TIME_SLOTS,
  SLOT_KEYS,
  NL_COL,
  CT_COL,
  colLetterToIndex,
} = require('../lib/nlToCtSchema');

const router = express.Router();
router.use(requireAuth);
router.use(requireDashboard('testing'));

// ─── helpers ──────────────────────────────────────────────────────────
function parseWeekDateFromTabName(tabName) {
  // Tolerant parser: extract the leading YYYYMMDD if present.
  const m = (tabName || '').match(/^(\d{4})(\d{2})(\d{2})/);
  if (!m) return null;
  const [, y, mo, d] = m;
  const iso = `${y}-${mo}-${d}`;
  // Validate by round-tripping through Date.
  const dt = new Date(`${iso}T00:00:00Z`);
  if (Number.isNaN(dt.getTime())) return null;
  // Reject obviously implausible dates (year < 2020 or > 2099).
  const yy = dt.getUTCFullYear();
  if (yy < 2020 || yy > 2099) return null;
  return iso;
}

function toIntOrNull(s) {
  if (s == null) return null;
  const t = String(s).trim();
  if (t === '') return null;
  const n = Number(t);
  return Number.isFinite(n) ? Math.trunc(n) : null;
}

// Build the merged payload for a given tab. Used by GET /tabs/:id/data
// and GET /tabs/:id/previous-week.
async function buildTabPayload(tabRow) {
  const sheet = await readTab({ spreadsheetId: SPREADSHEET_ID, gid: tabRow.gid });

  // Frozen actuals.
  const { rows: captureRows } = await pool.query(
    `SELECT slot_key, branch_code, actual, captured_by, captured_at
       FROM nl_to_ct_captures
      WHERE tab_id = $1`,
    [tabRow.id]
  );
  const frozen = new Map(); // `${slot_key}::${branch_code}` → capture
  for (const c of captureRows) frozen.set(`${c.slot_key}::${c.branch_code}`, c);

  const cellAt = (rowIdx, colLetter) => {
    const row = sheet.rows[rowIdx];
    if (!row) return null;
    return row[colLetterToIndex(colLetter)] ?? null;
  };

  // Parameters live on row 1 of each slot's goal column (e.g. E1, G1, K1…).
  const parameters = {};
  for (const slot of TIME_SLOTS) {
    const raw = cellAt(0, slot.goalCol);
    const n = raw == null || raw === '' ? null : Number(raw);
    parameters[slot.key] = Number.isFinite(n) ? n : null;
  }

  const branches = BRANCHES.map(b => {
    const rowIdx = b.row - 1; // sheet rows are 1-based; array is 0-based
    return {
      code: b.code,
      nl: toIntOrNull(cellAt(rowIdx, NL_COL)),
      ct: toIntOrNull(cellAt(rowIdx, CT_COL)),
      slots: TIME_SLOTS.map(slot => {
        const fz = frozen.get(`${slot.key}::${b.code}`);
        return {
          slot_key: slot.key,
          goal: toIntOrNull(cellAt(rowIdx, slot.goalCol)),
          actual_live: toIntOrNull(cellAt(rowIdx, slot.actualCol)),
          actual_captured: fz ? fz.actual : null,
          captured_at: fz ? fz.captured_at : null,
          captured_by: fz ? fz.captured_by : null,
          qaqc: slot.qaqcCol ? (cellAt(rowIdx, slot.qaqcCol) || null) : null,
        };
      }),
    };
  });

  return {
    tab: tabRow,
    parameters,
    branches,
  };
}

// ─── GET /api/nl-to-ct/tabs ───────────────────────────────────────────
router.get('/tabs', async (_req, res, next) => {
  try {
    const { rows } = await pool.query(
      `SELECT id, gid, tab_name, week_date, added_by, added_at
         FROM nl_to_ct_tabs
        ORDER BY week_date DESC`
    );
    res.json({ tabs: rows });
  } catch (err) { next(err); }
});

// ─── POST /api/nl-to-ct/tabs ──────────────────────────────────────────
const AddTabBody = z.object({ gid: z.string().min(1) });

router.post('/tabs', async (req, res, next) => {
  try {
    const { gid } = AddTabBody.parse(req.body);

    // Fetch the tab to learn its title + verify the gid is valid.
    let tabTitle;
    try {
      const v = await readTab({ spreadsheetId: SPREADSHEET_ID, gid });
      tabTitle = v.tabTitle;
    } catch (err) {
      if (err.code === 'TAB_NOT_FOUND') {
        return res.status(400).json({ error: 'Tab not found. Double-check the gid.' });
      }
      throw err;
    }

    if (!tabTitle) {
      return res.status(400).json({ error: 'Could not read the tab name. Make sure the sheet is shared as "Anyone with the link can view".' });
    }

    const weekDate = parseWeekDateFromTabName(tabTitle);
    if (!weekDate) {
      return res.status(400).json({ error: `Tab name must start with YYYYMMDD (got "${tabTitle}").` });
    }

    try {
      const { rows } = await pool.query(
        `INSERT INTO nl_to_ct_tabs (gid, tab_name, week_date, added_by)
         VALUES ($1, $2, $3, $4)
         RETURNING id, gid, tab_name, week_date, added_by, added_at`,
        [gid, tabTitle, weekDate, req.user.sub]
      );
      res.status(201).json({ tab: rows[0] });
    } catch (err) {
      if (err.code === '23505') {
        // unique_violation — either gid or week_date.
        const detail = (err.detail || '').toLowerCase();
        if (detail.includes('week_date')) {
          return res.status(409).json({ error: `Week ${weekDate} is already registered.` });
        }
        return res.status(409).json({ error: 'This gid is already registered.' });
      }
      throw err;
    }
  } catch (err) {
    if (err instanceof z.ZodError) {
      return res.status(400).json({ error: 'gid is required' });
    }
    next(err);
  }
});

// ─── DELETE /api/nl-to-ct/tabs/:id ────────────────────────────────────
router.delete('/tabs/:id', async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ error: 'Invalid id' });

    const { rowCount } = await pool.query('DELETE FROM nl_to_ct_tabs WHERE id = $1', [id]);
    if (rowCount === 0) return res.status(404).json({ error: 'Tab not found' });
    res.status(204).end();
  } catch (err) { next(err); }
});

// ─── GET /api/nl-to-ct/tabs/:id/data ──────────────────────────────────
router.get('/tabs/:id/data', async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ error: 'Invalid id' });

    const { rows } = await pool.query(
      `SELECT id, gid, tab_name, week_date, added_by, added_at
         FROM nl_to_ct_tabs
        WHERE id = $1`,
      [id]
    );
    if (rows.length === 0) return res.status(404).json({ error: 'Tab not found' });

    try {
      const payload = await buildTabPayload(rows[0]);
      res.json(payload);
    } catch (err) {
      // Sheet read failed — return what we have from the DB so the UI can
      // still render frozen Actuals with a banner.
      const { rows: captureRows } = await pool.query(
        `SELECT slot_key, branch_code, actual, captured_by, captured_at
           FROM nl_to_ct_captures
          WHERE tab_id = $1`,
        [id]
      );
      const frozen = new Map();
      for (const c of captureRows) frozen.set(`${c.slot_key}::${c.branch_code}`, c);
      res.json({
        tab: rows[0],
        parameters: Object.fromEntries(TIME_SLOTS.map(s => [s.key, null])),
        branches: BRANCHES.map(b => ({
          code: b.code,
          nl: null,
          ct: null,
          slots: TIME_SLOTS.map(slot => {
            const fz = frozen.get(`${slot.key}::${b.code}`);
            return {
              slot_key: slot.key,
              goal: null,
              actual_live: null,
              actual_captured: fz ? fz.actual : null,
              captured_at: fz ? fz.captured_at : null,
              captured_by: fz ? fz.captured_by : null,
              qaqc: null,
            };
          }),
        })),
        sheet_read_error: err.message || 'Sheet read failed',
      });
    }
  } catch (err) { next(err); }
});

module.exports = { nlToCtRouter: router };
