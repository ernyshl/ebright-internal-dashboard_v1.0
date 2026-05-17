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

module.exports = { nlToCtRouter: router };
