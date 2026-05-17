# NL to CT Breakdown Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a "Testing NL to CT Breakdown" feature under the existing Testing card — visualises a Google Sheet (one tab = one week) with three view modes, week-over-week comparison, and manual per-slot Actual capture for stable historical comparison.

**Architecture:** Two new Postgres tables (`nl_to_ct_tabs`, `nl_to_ct_captures`); one new Express route file (`backend/src/routes/nlToCt.js`) with six endpoints behind `requireDashboard('testing')`; a pluggable Google Sheets reader (CSV implementation now, service-account stub for later); two new React pages — manage tabs + visualisation — registered in `App.tsx` and the Testing card on the home page.

**Tech Stack:** Express, pg (raw SQL via `pool`), Zod, React 19, TanStack React Query 5, react-router-dom 7, recharts.

**Spec:** [docs/superpowers/specs/2026-05-17-nl-to-ct-breakdown-design.md](../specs/2026-05-17-nl-to-ct-breakdown-design.md)

**Spreadsheet ID:** `1GgZRY2MS8m4BJX2lzww-eEkIXcdJV8sLMURGu-ai4QQ` (hardcoded; verify the URL in the spec opens the correct sheet before starting).

**Notes for the implementer:**
- This codebase has **no automated test framework** (`npm test` errors out, no `vitest`/`jest`). Tasks verify with curl, the dev server, and direct DB queries — do **not** invent a test runner.
- New tables are created in two places: `backend/sql/019_create_nl_to_ct.sql` (for documentation / manual provisioning) AND inlined in `backend/src/server.js` `runMigrations()` (so the dev DB auto-migrates on startup). Both must be kept in sync.
- The exact spreadsheet row/column letters in `nlToCtSchema.js` are a best guess from screenshots — the **first task that touches the sheet** (Task 5) verifies them against the live tab and updates the constants if wrong.
- All commits use `nl-to-ct` as the scope prefix.

---

## Task 1: Database migration

**Files:**
- Create: `backend/sql/019_create_nl_to_ct.sql`
- Modify: `backend/src/server.js` (insert into `runMigrations()` after the `finance_renewals_refresh_log` block, around line 118)

- [ ] **Step 1: Write the SQL migration file**

Create `backend/sql/019_create_nl_to_ct.sql`:

```sql
-- 019_create_nl_to_ct.sql
-- Tables backing the "Testing NL to CT Breakdown" dashboard.
-- Both are also auto-created at server startup via runMigrations() in src/server.js
-- (idempotent; safe to re-run).

CREATE TABLE IF NOT EXISTS nl_to_ct_tabs (
  id         SERIAL       PRIMARY KEY,
  gid        TEXT         NOT NULL UNIQUE,
  tab_name   TEXT         NOT NULL,
  week_date  DATE         NOT NULL UNIQUE,
  added_by   UUID         REFERENCES users(id) ON DELETE SET NULL,
  added_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS nl_to_ct_captures (
  id           SERIAL       PRIMARY KEY,
  tab_id       INTEGER      NOT NULL REFERENCES nl_to_ct_tabs(id) ON DELETE CASCADE,
  slot_key     TEXT         NOT NULL,
  branch_code  TEXT         NOT NULL,
  actual       INTEGER      NOT NULL CHECK (actual >= 0),
  captured_by  UUID         REFERENCES users(id) ON DELETE SET NULL,
  captured_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  CONSTRAINT nl_to_ct_captures_unique UNIQUE (tab_id, slot_key, branch_code)
);
```

- [ ] **Step 2: Add the same DDL to `runMigrations()` in `backend/src/server.js`**

Find the block ending with the `idx_finance_renewals_refresh_log_status_ran_at` index (around line 118). Append immediately after it, before the `// Apply any standalone SQL migration files` comment:

```js
  // nl_to_ct: tables backing the Testing NL to CT Breakdown dashboard.
  // See docs/superpowers/specs/2026-05-17-nl-to-ct-breakdown-design.md
  await pool.query(`
    CREATE TABLE IF NOT EXISTS nl_to_ct_tabs (
      id         SERIAL       PRIMARY KEY,
      gid        TEXT         NOT NULL UNIQUE,
      tab_name   TEXT         NOT NULL,
      week_date  DATE         NOT NULL UNIQUE,
      added_by   UUID         REFERENCES users(id) ON DELETE SET NULL,
      added_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW()
    )
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS nl_to_ct_captures (
      id           SERIAL       PRIMARY KEY,
      tab_id       INTEGER      NOT NULL REFERENCES nl_to_ct_tabs(id) ON DELETE CASCADE,
      slot_key     TEXT         NOT NULL,
      branch_code  TEXT         NOT NULL,
      actual       INTEGER      NOT NULL CHECK (actual >= 0),
      captured_by  UUID         REFERENCES users(id) ON DELETE SET NULL,
      captured_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
      CONSTRAINT nl_to_ct_captures_unique UNIQUE (tab_id, slot_key, branch_code)
    )
  `);
```

- [ ] **Step 3: Restart the backend and verify the tables exist**

From `backend/`:
```
npm run dev
```
Wait for the line `✅ DB migrations complete`. Then in a psql shell:
```
\d nl_to_ct_tabs
\d nl_to_ct_captures
```
Expected: both tables exist with the columns above. The `\d nl_to_ct_tabs` output must show `gid` and `week_date` marked as `unique`.

- [ ] **Step 4: Commit**

```bash
git add backend/sql/019_create_nl_to_ct.sql backend/src/server.js
git commit -m "feat(nl-to-ct): create nl_to_ct_tabs and nl_to_ct_captures tables"
```

---

## Task 2: Backend constants — branches and time slots

**Files:**
- Create: `backend/src/lib/nlToCtSchema.js`

- [ ] **Step 1: Create the constants file**

Create `backend/src/lib/nlToCtSchema.js`:

```js
// Single source of truth for the sheet layout used by the
// "Testing NL to CT Breakdown" dashboard.
//
// Branches and time slots are hardcoded per the design — every weekly tab
// in the source spreadsheet uses the same shape. If the live sheet's
// column letters disagree with these, update them here (and the matching
// constants file in the frontend).

const SPREADSHEET_ID = '1GgZRY2MS8m4BJX2lzww-eEkIXcdJV8sLMURGu-ai4QQ';

// Order matches the source sheet (top-to-bottom). `row` is the 1-based row
// number in the sheet that holds the branch's data.
const BRANCHES = [
  { code: 'ONL',  row: 3  },
  { code: 'ST',   row: 4  },
  { code: 'SA',   row: 5  },
  { code: 'SP',   row: 6  },
  { code: 'KD',   row: 7  },
  { code: 'PJY',  row: 8  },
  { code: 'AMP',  row: 9  },
  { code: 'CJY',  row: 10 },
  { code: 'KLG',  row: 11 },
  { code: 'DA',   row: 12 },
  { code: 'BBB',  row: 13 },
  { code: 'DK',   row: 14 },
  { code: 'SHA',  row: 15 },
  { code: 'BTHO', row: 16 },
  { code: 'EGR',  row: 17 },
  { code: 'BSP',  row: 18 },
  { code: 'RBY',  row: 19 },
  { code: 'TSG',  row: 20 },
  { code: 'KW',   row: 21 },
  { code: 'KTG',  row: 22 },
];

// Column-letter positions in the sheet. `qaqcCol: null` means the slot
// has no QAQC sub-column (verified against the screenshots: Wed 4:30PM,
// Fri 12:30PM, Fri 6:30PM all lack QAQC).
const TIME_SLOTS = [
  { key: 'wed_4_30pm',  day: 'Wed', time: '4:30PM',  goalCol: 'E',  actualCol: 'F',  qaqcCol: null  },
  { key: 'wed_5_30pm',  day: 'Wed', time: '5:30PM',  goalCol: 'G',  actualCol: 'H',  qaqcCol: 'I'   },
  { key: 'thu_12_30pm', day: 'Thu', time: '12:30PM', goalCol: 'K',  actualCol: 'L',  qaqcCol: 'M'   },
  { key: 'thu_5_30pm',  day: 'Thu', time: '5:30PM',  goalCol: 'N',  actualCol: 'O',  qaqcCol: 'P'   },
  { key: 'thu_7_00pm',  day: 'Thu', time: '7:00PM',  goalCol: 'Q',  actualCol: 'R',  qaqcCol: 'S'   },
  { key: 'fri_12_30pm', day: 'Fri', time: '12:30PM', goalCol: 'U',  actualCol: 'V',  qaqcCol: null  },
  { key: 'fri_4_30pm',  day: 'Fri', time: '4:30PM',  goalCol: 'W',  actualCol: 'X',  qaqcCol: 'Y'   },
  { key: 'fri_6_30pm',  day: 'Fri', time: '6:30PM',  goalCol: 'Z',  actualCol: 'AA', qaqcCol: null  },
];

const BRANCH_CODES = new Set(BRANCHES.map(b => b.code));
const SLOT_KEYS    = new Set(TIME_SLOTS.map(s => s.key));

// Column for the per-branch NL value (yellow column near the left of the sheet)
const NL_COL  = 'B';
// Column for the per-branch CT @ 40% value
const CT_COL  = 'C';

// Convert "A" → 0, "Z" → 25, "AA" → 26, etc.
function colLetterToIndex(letter) {
  let n = 0;
  for (const ch of letter.toUpperCase()) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1;
}

module.exports = {
  SPREADSHEET_ID,
  BRANCHES,
  TIME_SLOTS,
  BRANCH_CODES,
  SLOT_KEYS,
  NL_COL,
  CT_COL,
  colLetterToIndex,
};
```

- [ ] **Step 2: Sanity-check the constants are loadable**

From `backend/`:
```
node -e "const s=require('./src/lib/nlToCtSchema'); console.log(s.BRANCHES.length, s.TIME_SLOTS.length, s.colLetterToIndex('AA'))"
```
Expected output: `20 8 26`

- [ ] **Step 3: Commit**

```bash
git add backend/src/lib/nlToCtSchema.js
git commit -m "feat(nl-to-ct): add branches and time-slots schema constants"
```

---

## Task 3: Backend sheet reader with CSV implementation and cache

**Files:**
- Create: `backend/src/lib/sheetsReader.js`

- [ ] **Step 1: Create the reader with CSV implementation**

Create `backend/src/lib/sheetsReader.js`:

```js
// Pluggable reader for the NL to CT spreadsheet.
//
// Two implementations are supported, selected via env var
// NL_TO_CT_SHEET_READER:
//
//   'csv' (default) - public CSV export. Requires the sheet to be
//                     "Anyone with the link can view".
//   'serviceAccount' - googleapis with a service-account JSON key.
//                      Stubbed out for now; throws on use until wired up.
//
// Both expose:
//   async readTab({ spreadsheetId, gid }) → { tabTitle, rows }
//     rows: string[][]  — outer index = sheet row (0-based, so row 3 is rows[2])
//                         inner index = column (0-based)

const READER_KIND = process.env.NL_TO_CT_SHEET_READER || 'csv';

// ── 30-second in-memory cache ──────────────────────────────────────────
const CACHE_TTL_MS = 30_000;
const cache = new Map(); // key → { value, expiresAt }

function cacheKey(spreadsheetId, gid) {
  return `${spreadsheetId}::${gid}`;
}
function cacheGet(spreadsheetId, gid) {
  const hit = cache.get(cacheKey(spreadsheetId, gid));
  if (!hit) return null;
  if (Date.now() > hit.expiresAt) {
    cache.delete(cacheKey(spreadsheetId, gid));
    return null;
  }
  return hit.value;
}
function cacheSet(spreadsheetId, gid, value) {
  cache.set(cacheKey(spreadsheetId, gid), { value, expiresAt: Date.now() + CACHE_TTL_MS });
}
function cacheInvalidate(spreadsheetId, gid) {
  cache.delete(cacheKey(spreadsheetId, gid));
}

// ── Minimal CSV parser ─────────────────────────────────────────────────
// Handles quoted fields, embedded commas, embedded newlines, escaped
// quotes. Good enough for the Google CSV export shape — no need to pull
// in a dependency.
function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = '';
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; }
        else { inQuotes = false; }
      } else {
        field += ch;
      }
    } else {
      if (ch === '"') inQuotes = true;
      else if (ch === ',') { row.push(field); field = ''; }
      else if (ch === '\n') { row.push(field); rows.push(row); row = []; field = ''; }
      else if (ch === '\r') { /* skip; \n will close the row */ }
      else field += ch;
    }
  }
  // Trailing field / row
  if (field.length || row.length) { row.push(field); rows.push(row); }
  return rows;
}

// ── CSV reader ─────────────────────────────────────────────────────────
async function csvReadTab({ spreadsheetId, gid }) {
  const cached = cacheGet(spreadsheetId, gid);
  if (cached) return cached;

  const exportUrl = `https://docs.google.com/spreadsheets/d/${spreadsheetId}/export?format=csv&gid=${gid}`;
  const res = await fetch(exportUrl);
  if (res.status === 404) throw Object.assign(new Error('Tab not found'), { code: 'TAB_NOT_FOUND' });
  if (!res.ok) throw new Error(`CSV export failed: ${res.status} ${res.statusText}`);

  const text = await res.text();
  const rows = parseCsv(text);

  // The CSV export doesn't include the tab title. Fetch the lightweight
  // HTML metadata page to recover it — the title sits in <title>…</title>.
  // We pull it ONCE per cache lifetime so repeated reads are cheap.
  let tabTitle = '';
  try {
    const metaUrl = `https://docs.google.com/spreadsheets/d/${spreadsheetId}/htmlview?gid=${gid}`;
    const metaRes = await fetch(metaUrl);
    if (metaRes.ok) {
      const html = await metaRes.text();
      // The active tab name appears in the document title and in an
      // attribute on the active tab anchor; the <title> form is reliable.
      const m = html.match(/<title>([^<]+)<\/title>/i);
      if (m) {
        // Google sets the title to "<Sheet Tab Name> - <Spreadsheet Name>".
        // We want just the leading tab name.
        tabTitle = m[1].split(' - ')[0].trim();
      }
    }
  } catch {
    // Non-fatal — caller can still use the rows; tabTitle just stays blank.
  }

  const value = { tabTitle, rows };
  cacheSet(spreadsheetId, gid, value);
  return value;
}

// ── Service-account reader stub ────────────────────────────────────────
async function serviceAccountReadTab(_args) {
  throw new Error(
    "Service-account reader not implemented yet. " +
    "Either install 'googleapis', wire up credentials, and add the implementation, " +
    "or set NL_TO_CT_SHEET_READER=csv (the default)."
  );
}

// ── Dispatcher ─────────────────────────────────────────────────────────
async function readTab(args) {
  if (READER_KIND === 'csv') return csvReadTab(args);
  if (READER_KIND === 'serviceAccount') return serviceAccountReadTab(args);
  throw new Error(`Unknown NL_TO_CT_SHEET_READER value: ${READER_KIND}`);
}

module.exports = { readTab, cacheInvalidate, _parseCsv: parseCsv };
```

- [ ] **Step 2: Smoke-test the CSV parser**

From `backend/`:
```
node -e "const r=require('./src/lib/sheetsReader'); console.log(JSON.stringify(r._parseCsv('a,b,\"c,d\"\n1,2,3\n')))"
```
Expected output: `[["a","b","c,d"],["1","2","3"]]`

- [ ] **Step 3: Smoke-test against the live sheet**

You need a real gid for this — open the spreadsheet in your browser, click a tab, and copy the `gid=…` value from the URL. Replace `<GID>` below:

```
node -e "(async()=>{const r=require('./src/lib/sheetsReader'); const v=await r.readTab({spreadsheetId:'1GgZRY2MS8m4BJX2lzww-eEkIXcdJV8sLMURGu-ai4QQ',gid:'<GID>'}); console.log('title:',v.tabTitle); console.log('rows:',v.rows.length); console.log('row 3 (ONL):', JSON.stringify(v.rows[2]?.slice(0,12)));})()"
```
Expected:
- `title:` is the tab name (e.g. `20260513`).
- `rows:` is at least 22 (the schema's last branch row is 22).
- `row 3 (ONL):` shows the ONL row content. Column index 1 (B) = NL; column index 4 (E) = Wed 4:30PM Goal; column index 5 (F) = Wed 4:30PM Actual. **Verify the column letters in `nlToCtSchema.js` match the live sheet by spot-checking ONL's values against the actual screenshot/sheet.** Update `nlToCtSchema.js` if any column letter is off.

- [ ] **Step 4: Commit**

```bash
git add backend/src/lib/sheetsReader.js
git commit -m "feat(nl-to-ct): add pluggable sheets reader with CSV impl and 30s cache"
```

---

## Task 4: Backend route — tabs list/add/delete

**Files:**
- Create: `backend/src/routes/nlToCt.js`

- [ ] **Step 1: Create the router with the three tab-CRUD endpoints**

Create `backend/src/routes/nlToCt.js`:

```js
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
```

- [ ] **Step 2: Wire the router into `backend/src/app.js` (so we can curl it for verification)**

In `backend/src/app.js`, add the import alongside the others (around line 43):

```js
const { nlToCtRouter } = require('./routes/nlToCt');
```

And mount it next to other rate-limited routes (after the `salestrailRouter` line, around line 183):

```js
  app.use('/api/nl-to-ct', applyRoleBasedRateLimit, nlToCtRouter);
```

- [ ] **Step 3: Restart the backend and verify the endpoints**

Restart `npm run dev` in `backend/`. Use a real bearer token (obtain via the existing `/api/auth/login` or copy from the browser's dev tools). Replace `<TOKEN>` and `<GID>` below.

List (empty initially):
```
curl -s -H "Authorization: Bearer <TOKEN>" http://localhost:8080/api/nl-to-ct/tabs
```
Expected: `{"tabs":[]}`

Add a valid tab:
```
curl -s -X POST -H "Authorization: Bearer <TOKEN>" -H "Content-Type: application/json" -d '{"gid":"<GID>"}' http://localhost:8080/api/nl-to-ct/tabs
```
Expected: `201` with `{"tab":{"id":1,"gid":"<GID>","tab_name":"20260513","week_date":"2026-05-13",...}}`

Add the same tab again — expect `409` "Week … is already registered."

Add a bogus gid:
```
curl -s -X POST -H "Authorization: Bearer <TOKEN>" -H "Content-Type: application/json" -d '{"gid":"99999999"}' http://localhost:8080/api/nl-to-ct/tabs
```
Expected: `400` with "Tab not found. Double-check the gid."

Delete the tab:
```
curl -s -X DELETE -H "Authorization: Bearer <TOKEN>" http://localhost:8080/api/nl-to-ct/tabs/1 -o /dev/null -w "%{http_code}\n"
```
Expected: `204`

- [ ] **Step 4: Commit**

```bash
git add backend/src/routes/nlToCt.js backend/src/app.js
git commit -m "feat(nl-to-ct): add tabs list/add/delete endpoints"
```

---

## Task 5: Backend route — read tab data (live + frozen)

**Files:**
- Modify: `backend/src/routes/nlToCt.js`

- [ ] **Step 1: Add a helper that merges live sheet data with frozen captures**

Inside `backend/src/routes/nlToCt.js`, add this above the route handlers (e.g. just after the `toIntOrNull` helper):

```js
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
```

- [ ] **Step 2: Add the `/tabs/:id/data` route**

Inside the same file, after the `DELETE /tabs/:id` route:

```js
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
```

- [ ] **Step 3: Restart and verify**

Re-add a tab (Task 4 Step 3), grab its id, then:
```
curl -s -H "Authorization: Bearer <TOKEN>" http://localhost:8080/api/nl-to-ct/tabs/1/data | python -m json.tool | head -60
```
Expected:
- `tab.id` matches.
- `parameters` has 8 keys (one per slot), values are the parameter row numbers (e.g. `wed_4_30pm: 0.5`).
- `branches` is a 20-element array. Each branch has `nl`, `ct`, and `slots` (length 8). Spot-check the ONL row's `nl`/`ct`/`goal` against the actual sheet.

- [ ] **Step 4: Commit**

```bash
git add backend/src/routes/nlToCt.js
git commit -m "feat(nl-to-ct): add /tabs/:id/data endpoint merging live sheet and frozen captures"
```

---

## Task 6: Backend route — capture endpoint

**Files:**
- Modify: `backend/src/routes/nlToCt.js`

- [ ] **Step 1: Add the capture endpoint**

In `backend/src/routes/nlToCt.js`, after the `/data` route:

```js
// ─── POST /api/nl-to-ct/tabs/:id/capture ──────────────────────────────
const CaptureBody = z.object({ slot_key: z.string().min(1) });

router.post('/tabs/:id/capture', async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ error: 'Invalid id' });

    const { slot_key } = CaptureBody.parse(req.body);
    if (!SLOT_KEYS.has(slot_key)) return res.status(400).json({ error: `Unknown slot_key: ${slot_key}` });

    const { rows: tabRows } = await pool.query(
      `SELECT id, gid FROM nl_to_ct_tabs WHERE id = $1`,
      [id]
    );
    if (tabRows.length === 0) return res.status(404).json({ error: 'Tab not found' });

    const slot = TIME_SLOTS.find(s => s.key === slot_key);
    const sheet = await readTab({ spreadsheetId: SPREADSHEET_ID, gid: tabRows[0].gid });

    // Pull the actual_col for each branch row, upsert all 20.
    const values = [];
    const placeholders = [];
    let p = 1;
    for (const b of BRANCHES) {
      const rowIdx = b.row - 1;
      const cell = sheet.rows[rowIdx]?.[colLetterToIndex(slot.actualCol)];
      const actual = toIntOrNull(cell);
      // Empty cells are captured as 0 by design (the user is saying "this is
      // the truth right now"). Non-numeric strings → 0 too.
      const value = actual == null ? 0 : actual;
      placeholders.push(`($${p++}, $${p++}, $${p++}, $${p++}, $${p++})`);
      values.push(id, slot_key, b.code, value, req.user.sub);
    }

    await pool.query(
      `INSERT INTO nl_to_ct_captures (tab_id, slot_key, branch_code, actual, captured_by)
       VALUES ${placeholders.join(', ')}
       ON CONFLICT (tab_id, slot_key, branch_code)
       DO UPDATE SET actual = EXCLUDED.actual,
                     captured_by = EXCLUDED.captured_by,
                     captured_at = NOW()`,
      values
    );

    // Invalidate cache so the immediate follow-up /data read sees fresh
    // sheet values (and so the user can verify the capture against the live row).
    cacheInvalidate(SPREADSHEET_ID, tabRows[0].gid);

    const payload = await buildTabPayload(tabRows[0]);
    res.json(payload);
  } catch (err) {
    if (err instanceof z.ZodError) return res.status(400).json({ error: 'slot_key is required' });
    next(err);
  }
});
```

- [ ] **Step 2: Restart and verify**

```
curl -s -X POST -H "Authorization: Bearer <TOKEN>" -H "Content-Type: application/json" -d '{"slot_key":"wed_4_30pm"}' http://localhost:8080/api/nl-to-ct/tabs/1/capture | python -m json.tool | head -40
```
Expected: the same shape as `/data`, but every branch's `wed_4_30pm.actual_captured` is now non-null. Verify with psql:

```
SELECT COUNT(*) FROM nl_to_ct_captures WHERE tab_id = 1 AND slot_key = 'wed_4_30pm';
```
Expected: `20`.

Run the same curl again (re-capture). It should succeed (upsert), `captured_at` updates. Verify with:
```
SELECT captured_at FROM nl_to_ct_captures WHERE tab_id = 1 AND slot_key = 'wed_4_30pm' AND branch_code = 'ONL';
```
The timestamp should be newer than the first run.

- [ ] **Step 3: Commit**

```bash
git add backend/src/routes/nlToCt.js
git commit -m "feat(nl-to-ct): add capture endpoint that freezes Actuals per slot"
```

---

## Task 7: Backend route — previous-week endpoint

**Files:**
- Modify: `backend/src/routes/nlToCt.js`

- [ ] **Step 1: Add the previous-week endpoint**

In `backend/src/routes/nlToCt.js`, after the capture route:

```js
// ─── GET /api/nl-to-ct/tabs/:id/previous-week ─────────────────────────
router.get('/tabs/:id/previous-week', async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ error: 'Invalid id' });

    const { rows } = await pool.query(
      `SELECT id, gid, tab_name, week_date, added_by, added_at
         FROM nl_to_ct_tabs
        WHERE week_date < (SELECT week_date FROM nl_to_ct_tabs WHERE id = $1)
        ORDER BY week_date DESC
        LIMIT 1`,
      [id]
    );
    if (rows.length === 0) return res.status(404).json({ error: 'No previous week registered' });

    const payload = await buildTabPayload(rows[0]);
    res.json(payload);
  } catch (err) { next(err); }
});
```

- [ ] **Step 2: Verify**

Register a second tab for an earlier week (use a different gid pointing to a tab with name like `20260506`):
```
curl -s -X POST -H "Authorization: Bearer <TOKEN>" -H "Content-Type: application/json" -d '{"gid":"<EARLIER_GID>"}' http://localhost:8080/api/nl-to-ct/tabs
```

Then:
```
curl -s -H "Authorization: Bearer <TOKEN>" http://localhost:8080/api/nl-to-ct/tabs/1/previous-week | python -m json.tool | head -30
```
Expected: payload for the 20260506 tab.

If only one week is registered, the endpoint returns `404 "No previous week registered"` — that's the intended behaviour.

- [ ] **Step 3: Commit**

```bash
git add backend/src/routes/nlToCt.js
git commit -m "feat(nl-to-ct): add previous-week endpoint"
```

---

## Task 8: Frontend constants mirror

**Files:**
- Create: `frontend/src/lib/nlToCtSchema.ts`

- [ ] **Step 1: Create the constants**

Create `frontend/src/lib/nlToCtSchema.ts`:

```typescript
// Mirror of backend/src/lib/nlToCtSchema.js. Keep in sync.
//
// The frontend doesn't need the column letters (those are a backend-only
// concern for reading the sheet) — only the codes/keys for rendering and
// matching responses.

export interface BranchDef {
  code: string;
}
export interface SlotDef {
  key: string;
  day: 'Wed' | 'Thu' | 'Fri';
  time: string;
  hasQaqc: boolean;
}

export const BRANCHES: BranchDef[] = [
  { code: 'ONL'  }, { code: 'ST'   }, { code: 'SA'   }, { code: 'SP'   },
  { code: 'KD'   }, { code: 'PJY'  }, { code: 'AMP'  }, { code: 'CJY'  },
  { code: 'KLG'  }, { code: 'DA'   }, { code: 'BBB'  }, { code: 'DK'   },
  { code: 'SHA'  }, { code: 'BTHO' }, { code: 'EGR'  }, { code: 'BSP'  },
  { code: 'RBY'  }, { code: 'TSG'  }, { code: 'KW'   }, { code: 'KTG'  },
];

export const TIME_SLOTS: SlotDef[] = [
  { key: 'wed_4_30pm',  day: 'Wed', time: '4:30PM',  hasQaqc: false },
  { key: 'wed_5_30pm',  day: 'Wed', time: '5:30PM',  hasQaqc: true  },
  { key: 'thu_12_30pm', day: 'Thu', time: '12:30PM', hasQaqc: true  },
  { key: 'thu_5_30pm',  day: 'Thu', time: '5:30PM',  hasQaqc: true  },
  { key: 'thu_7_00pm',  day: 'Thu', time: '7:00PM',  hasQaqc: true  },
  { key: 'fri_12_30pm', day: 'Fri', time: '12:30PM', hasQaqc: false },
  { key: 'fri_4_30pm',  day: 'Fri', time: '4:30PM',  hasQaqc: true  },
  { key: 'fri_6_30pm',  day: 'Fri', time: '6:30PM',  hasQaqc: false },
];

// Group slots by day for the grid view's column-group headers.
export const SLOTS_BY_DAY: Array<{ day: 'Wed' | 'Thu' | 'Fri'; slots: SlotDef[] }> = (() => {
  const out: Array<{ day: 'Wed' | 'Thu' | 'Fri'; slots: SlotDef[] }> = [];
  for (const s of TIME_SLOTS) {
    const last = out[out.length - 1];
    if (last && last.day === s.day) last.slots.push(s);
    else out.push({ day: s.day, slots: [s] });
  }
  return out;
})();
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/lib/nlToCtSchema.ts
git commit -m "feat(nl-to-ct): add frontend schema mirror"
```

---

## Task 9: Frontend API client

**Files:**
- Create: `frontend/src/api/nlToCt.ts`

- [ ] **Step 1: Create the typed wrappers**

Create `frontend/src/api/nlToCt.ts`:

```typescript
import { apiFetch } from '../lib/api';

export interface NlToCtTab {
  id: number;
  gid: string;
  tab_name: string;
  week_date: string; // 'YYYY-MM-DD'
  added_by: number | null;
  added_at: string;
}

export interface SlotData {
  slot_key: string;
  goal: number | null;
  actual_live: number | null;
  actual_captured: number | null;
  captured_at: string | null;
  captured_by: number | null;
  qaqc: string | null;
}

export interface BranchData {
  code: string;
  nl: number | null;
  ct: number | null;
  slots: SlotData[];
}

export interface TabPayload {
  tab: NlToCtTab;
  parameters: Record<string, number | null>;
  branches: BranchData[];
  sheet_read_error?: string;
}

export const nlToCtApi = {
  listTabs: () => apiFetch('/api/nl-to-ct/tabs') as Promise<{ tabs: NlToCtTab[] }>,

  addTab: (gid: string) =>
    apiFetch('/api/nl-to-ct/tabs', {
      method: 'POST',
      body: { gid },
    }) as Promise<{ tab: NlToCtTab }>,

  deleteTab: (id: number) =>
    apiFetch(`/api/nl-to-ct/tabs/${id}`, { method: 'DELETE' }) as Promise<void>,

  getData: (id: number) =>
    apiFetch(`/api/nl-to-ct/tabs/${id}/data`) as Promise<TabPayload>,

  capture: (id: number, slotKey: string) =>
    apiFetch(`/api/nl-to-ct/tabs/${id}/capture`, {
      method: 'POST',
      body: { slot_key: slotKey },
    }) as Promise<TabPayload>,

  previousWeek: (id: number) =>
    apiFetch(`/api/nl-to-ct/tabs/${id}/previous-week`) as Promise<TabPayload>,
};
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/api/nlToCt.ts
git commit -m "feat(nl-to-ct): add frontend API client"
```

---

## Task 10: Frontend Manage page

**Files:**
- Create: `frontend/src/pages/NlToCtTabsPage.tsx`

- [ ] **Step 1: Create the page**

Create `frontend/src/pages/NlToCtTabsPage.tsx`:

```tsx
import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { BackButton } from '../components/BackButton';
import { nlToCtApi, NlToCtTab } from '../api/nlToCt';
import { ApiError } from '../lib/api';

function formatWeekDate(iso: string): string {
  const [y, m, d] = iso.split('-');
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  return `${d} ${months[Number(m) - 1]} ${y}`;
}

function formatTimestamp(iso: string): string {
  return new Date(iso).toLocaleString();
}

export function NlToCtTabsPage() {
  const qc = useQueryClient();
  const [gid, setGid] = useState('');
  const [error, setError] = useState<string | null>(null);

  const tabsQ = useQuery({
    queryKey: ['nl-to-ct', 'tabs'],
    queryFn: () => nlToCtApi.listTabs(),
  });

  const addM = useMutation({
    mutationFn: (newGid: string) => nlToCtApi.addTab(newGid),
    onSuccess: () => {
      setGid('');
      setError(null);
      qc.invalidateQueries({ queryKey: ['nl-to-ct', 'tabs'] });
    },
    onError: (err: unknown) => {
      if (err instanceof ApiError) setError(err.message);
      else setError('Failed to add tab.');
    },
  });

  const deleteM = useMutation({
    mutationFn: (id: number) => nlToCtApi.deleteTab(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['nl-to-ct', 'tabs'] }),
  });

  function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const trimmed = gid.trim();
    if (!trimmed) {
      setError('Please paste a gid.');
      return;
    }
    addM.mutate(trimmed);
  }

  function handleDelete(t: NlToCtTab) {
    const ok = window.confirm(
      `Delete week ${formatWeekDate(t.week_date)} (tab "${t.tab_name}") and all of its captures? This can't be undone.`
    );
    if (ok) deleteM.mutate(t.id);
  }

  return (
    <div className="dashboardPage">
      <div className="dashboardHeader">
        <BackButton to="/" label="Back to Home" />
        <h1 className="pageHeaderTitle" style={{ marginTop: 16 }}>Manage NL to CT Tabs</h1>
        <p style={{ color: 'var(--muted)', marginTop: 4 }}>
          Paste the gid (page id) of a new weekly tab in the source Google Sheet. The tab name must start with YYYYMMDD.
        </p>
      </div>

      <form onSubmit={handleAdd} style={{ display: 'flex', gap: 8, marginBottom: 24, alignItems: 'flex-start', flexWrap: 'wrap' }}>
        <input
          type="text"
          value={gid}
          onChange={(e) => setGid(e.target.value)}
          placeholder="e.g. 360979780"
          style={{ flex: '1 1 240px', padding: '8px 10px', fontSize: 14 }}
          disabled={addM.isPending}
        />
        <button className="btn btnPrimary" type="submit" disabled={addM.isPending}>
          {addM.isPending ? 'Adding…' : 'Add tab'}
        </button>
      </form>
      {error && (
        <div style={{ background: '#fde2e2', color: '#8a1f1f', padding: '8px 12px', borderRadius: 4, marginBottom: 16 }}>
          {error}
        </div>
      )}

      {tabsQ.isLoading && <p>Loading…</p>}
      {tabsQ.error && <p style={{ color: '#8a1f1f' }}>Failed to load tabs.</p>}
      {tabsQ.data && (
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ textAlign: 'left', borderBottom: '1px solid #ccc' }}>
              <th style={{ padding: 8 }}>Week date</th>
              <th style={{ padding: 8 }}>Tab name</th>
              <th style={{ padding: 8 }}>gid</th>
              <th style={{ padding: 8 }}>Added</th>
              <th style={{ padding: 8, width: 60 }}></th>
            </tr>
          </thead>
          <tbody>
            {tabsQ.data.tabs.length === 0 && (
              <tr><td colSpan={5} style={{ padding: 16, color: 'var(--muted)' }}>No tabs registered yet.</td></tr>
            )}
            {tabsQ.data.tabs.map((t) => (
              <tr key={t.id} style={{ borderBottom: '1px solid #eee' }}>
                <td style={{ padding: 8 }}>{formatWeekDate(t.week_date)}</td>
                <td style={{ padding: 8 }}>{t.tab_name}</td>
                <td style={{ padding: 8, fontFamily: 'monospace' }}>{t.gid}</td>
                <td style={{ padding: 8, color: 'var(--muted)' }}>{formatTimestamp(t.added_at)}</td>
                <td style={{ padding: 8 }}>
                  <button
                    className="btn btnGhost btnSmall"
                    onClick={() => handleDelete(t)}
                    disabled={deleteM.isPending}
                    title="Delete tab"
                  >
                    🗑
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Add the route to `frontend/src/App.tsx`**

Add the import alongside the other page imports (around line 65):
```tsx
import { NlToCtTabsPage } from './pages/NlToCtTabsPage';
```

Add the route inside the `<AppLayout>` block, alongside the other `dashboard="testing"` routes (after the `/ui-ux-testing` route, around line 217):
```tsx
          <Route path="/nl-to-ct/manage" element={
            <RequirePermission dashboard="testing"><NlToCtTabsPage /></RequirePermission>
          } />
```

- [ ] **Step 3: Verify in the browser**

Start the frontend dev server (`cd frontend && npm run dev`) and the backend (`cd backend && npm run dev`). Log in as a user with `testing` dashboard access. Navigate manually to `/nl-to-ct/manage`. You should see:
- The form with the gid input.
- An empty (or existing) table.
- Pasting a valid gid adds a row. Pasting an invalid gid shows an inline red error.
- The trash icon prompts for confirmation, then deletes.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/pages/NlToCtTabsPage.tsx frontend/src/App.tsx
git commit -m "feat(nl-to-ct): add Manage NL to CT Tabs page"
```

---

## Task 11: Frontend Visualisation page — base + Grid view + Capture

**Files:**
- Create: `frontend/src/pages/NlToCtBreakdownPage.tsx`

This task brings up the visualisation page with the Grid view (the primary view) and the capture flow. Cards / Tiles / "Show last week" arrive in later tasks.

- [ ] **Step 1: Create the page scaffold + Grid view + capture modal**

Create `frontend/src/pages/NlToCtBreakdownPage.tsx`:

```tsx
import { useEffect, useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { BackButton } from '../components/BackButton';
import { nlToCtApi, NlToCtTab, TabPayload, BranchData } from '../api/nlToCt';
import { BRANCHES, TIME_SLOTS, SLOTS_BY_DAY, SlotDef } from '../lib/nlToCtSchema';

type ViewMode = 'grid' | 'cards' | 'tiles';

function formatWeekDate(iso: string): string {
  const [y, m, d] = iso.split('-');
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  return `${d} ${months[Number(m) - 1]} ${y}`;
}

// ─── Capture modal ────────────────────────────────────────────────────
interface CaptureModalProps {
  tabId: number;
  slot: SlotDef;
  payload: TabPayload;
  onClose: () => void;
  onCaptured: (next: TabPayload) => void;
}
function CaptureModal({ tabId, slot, payload, onClose, onCaptured }: CaptureModalProps) {
  const captureM = useMutation({
    mutationFn: () => nlToCtApi.capture(tabId, slot.key),
    onSuccess: (next) => { onCaptured(next); onClose(); },
  });

  const branches = payload.branches.map(b => {
    const sd = b.slots.find(s => s.slot_key === slot.key)!;
    return { code: b.code, live: sd.actual_live, frozen: sd.actual_captured };
  });
  const anyFrozen = branches.some(b => b.frozen !== null);

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'grid', placeItems: 'center', zIndex: 100 }}>
      <div style={{ background: 'white', padding: 20, borderRadius: 6, maxWidth: 560, width: '90%', maxHeight: '85vh', overflow: 'auto' }}>
        <h2 style={{ marginTop: 0 }}>Capture {slot.day} {slot.time}</h2>
        {anyFrozen && (
          <div style={{ background: '#fff4d6', padding: 10, borderRadius: 4, marginBottom: 12 }}>
            ⚠ Some branches already have a frozen value for this slot. Confirming will overwrite them.
          </div>
        )}
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr style={{ background: '#f5f5f5' }}>
              <th style={{ textAlign: 'left', padding: 6 }}>Branch</th>
              <th style={{ textAlign: 'right', padding: 6 }}>Existing frozen</th>
              <th style={{ textAlign: 'right', padding: 6 }}>Current sheet</th>
            </tr>
          </thead>
          <tbody>
            {branches.map(b => (
              <tr key={b.code}>
                <td style={{ padding: 6 }}>{b.code}</td>
                <td style={{ padding: 6, textAlign: 'right', color: b.frozen !== null ? '#444' : '#aaa' }}>{b.frozen ?? '—'}</td>
                <td style={{ padding: 6, textAlign: 'right', fontWeight: b.frozen !== b.live ? 600 : 400 }}>{b.live ?? '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 16 }}>
          <button className="btn btnGhost" onClick={onClose} disabled={captureM.isPending}>Cancel</button>
          <button className="btn btnPrimary" onClick={() => captureM.mutate()} disabled={captureM.isPending}>
            {captureM.isPending ? 'Capturing…' : (anyFrozen ? 'Confirm re-capture' : 'Confirm capture')}
          </button>
        </div>
        {captureM.error && <p style={{ color: '#8a1f1f', marginTop: 8 }}>Capture failed.</p>}
      </div>
    </div>
  );
}

// ─── Cell colouring (grid view) ───────────────────────────────────────
function cellTint(goal: number | null, actual: number | null): string | undefined {
  if (actual == null || goal == null) return undefined;
  if (actual === 0) return '#fcb6b6';            // red
  if (actual >= goal) return '#b6f5c4';          // green
  return '#fff39c';                              // yellow
}

// ─── Grid view ────────────────────────────────────────────────────────
interface GridViewProps {
  payload: TabPayload;
  onCaptureSlot: (slot: SlotDef) => void;
}
function GridView({ payload, onCaptureSlot }: GridViewProps) {
  const byCode = useMemo(() => {
    const m = new Map<string, BranchData>();
    for (const b of payload.branches) m.set(b.code, b);
    return m;
  }, [payload]);

  return (
    <table style={{ borderCollapse: 'collapse', fontSize: 13, minWidth: 1200 }}>
      <thead>
        <tr>
          <th style={{ padding: 4, background: '#f5f5f5', border: '1px solid #ddd' }} rowSpan={3}>Branch</th>
          <th style={{ padding: 4, background: '#fffae0', border: '1px solid #ddd' }} rowSpan={3}>NL</th>
          <th style={{ padding: 4, background: '#ffe6c8', border: '1px solid #ddd' }} rowSpan={3}>CT @ 40%</th>
          {SLOTS_BY_DAY.map(group => (
            <th
              key={group.day}
              colSpan={group.slots.reduce((n, s) => n + (s.hasQaqc ? 3 : 2), 0)}
              style={{ padding: 4, background: '#e8eef9', border: '1px solid #ddd', textAlign: 'center' }}
            >
              {group.day === 'Wed' ? 'Wednesday' : group.day === 'Thu' ? 'Thursday' : 'Friday'}
            </th>
          ))}
        </tr>
        <tr>
          {TIME_SLOTS.map(slot => {
            const span = slot.hasQaqc ? 3 : 2;
            const anyFrozen = payload.branches.some(b => b.slots.find(s => s.slot_key === slot.key)?.actual_captured != null);
            return (
              <th
                key={slot.key}
                colSpan={span}
                style={{ padding: 4, background: '#e8eef9', border: '1px solid #ddd', textAlign: 'center' }}
              >
                {slot.time}{' '}
                <button
                  className="btn btnSmall"
                  style={{ marginLeft: 6, background: anyFrozen ? '#f0ad4e' : '#5cb85c', color: 'white', border: 'none', padding: '2px 6px', borderRadius: 3, cursor: 'pointer' }}
                  onClick={() => onCaptureSlot(slot)}
                  title={anyFrozen ? 'Re-capture this slot' : 'Capture this slot'}
                >
                  {anyFrozen ? 'Re-capture' : 'Capture'}
                </button>
              </th>
            );
          })}
        </tr>
        <tr>
          {TIME_SLOTS.flatMap(slot => {
            const cols = [
              <th key={`${slot.key}-g`} style={{ padding: 4, border: '1px solid #ddd' }}>Goal</th>,
              <th key={`${slot.key}-a`} style={{ padding: 4, border: '1px solid #ddd' }}>Actual</th>,
            ];
            if (slot.hasQaqc) cols.push(<th key={`${slot.key}-q`} style={{ padding: 4, border: '1px solid #ddd', background: '#d4f5d4' }}>QAQC</th>);
            return cols;
          })}
        </tr>
      </thead>
      <tbody>
        {BRANCHES.map(b => {
          const bd = byCode.get(b.code);
          return (
            <tr key={b.code}>
              <td style={{ padding: 4, border: '1px solid #ddd', fontWeight: 600 }}>{b.code}</td>
              <td style={{ padding: 4, border: '1px solid #ddd', background: '#fffae0', textAlign: 'right' }}>{bd?.nl ?? '—'}</td>
              <td style={{ padding: 4, border: '1px solid #ddd', background: '#ffe6c8', textAlign: 'right' }}>{bd?.ct ?? '—'}</td>
              {TIME_SLOTS.flatMap(slot => {
                const sd = bd?.slots.find(s => s.slot_key === slot.key);
                const goal = sd?.goal ?? null;
                const displayActual = sd?.actual_captured ?? sd?.actual_live ?? null;
                const tint = cellTint(goal, displayActual);
                const cells = [
                  <td key={`${b.code}-${slot.key}-g`} style={{ padding: 4, border: '1px solid #ddd', textAlign: 'right' }}>{goal ?? '—'}</td>,
                  <td key={`${b.code}-${slot.key}-a`} style={{ padding: 4, border: '1px solid #ddd', textAlign: 'right', background: tint, fontWeight: sd?.actual_captured != null ? 600 : 400 }}>
                    {displayActual ?? '—'}
                  </td>,
                ];
                if (slot.hasQaqc) {
                  cells.push(
                    <td key={`${b.code}-${slot.key}-q`} style={{ padding: 4, border: '1px solid #ddd', background: '#eafbeb', fontSize: 11 }}>
                      {sd?.qaqc ?? ''}
                    </td>
                  );
                }
                return cells;
              })}
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────
export function NlToCtBreakdownPage() {
  const qc = useQueryClient();
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [view, setView] = useState<ViewMode>('grid');
  const [captureSlot, setCaptureSlot] = useState<SlotDef | null>(null);

  const tabsQ = useQuery({
    queryKey: ['nl-to-ct', 'tabs'],
    queryFn: () => nlToCtApi.listTabs(),
  });

  // TanStack Query v5 removed onSuccess from useQuery — pick the default
  // selection in an effect once data lands.
  useEffect(() => {
    if (selectedId == null && tabsQ.data && tabsQ.data.tabs.length > 0) {
      setSelectedId(tabsQ.data.tabs[0].id);
    }
  }, [selectedId, tabsQ.data]);

  const effectiveId = useMemo(() => {
    if (selectedId != null) return selectedId;
    return tabsQ.data?.tabs[0]?.id ?? null;
  }, [selectedId, tabsQ.data]);

  const dataQ = useQuery({
    queryKey: ['nl-to-ct', 'data', effectiveId],
    queryFn: () => nlToCtApi.getData(effectiveId as number),
    enabled: effectiveId != null,
  });

  function handleCaptured(next: TabPayload) {
    qc.setQueryData(['nl-to-ct', 'data', next.tab.id], next);
  }

  return (
    <div className="dashboardPage">
      <div className="dashboardHeader">
        <BackButton to="/" label="Back to Home" />
        <h1 className="pageHeaderTitle" style={{ marginTop: 16 }}>NL to CT Breakdown</h1>
      </div>

      {tabsQ.data && tabsQ.data.tabs.length === 0 && (
        <div style={{ background: '#fff4d6', padding: 12, borderRadius: 4 }}>
          No weekly tabs registered yet. Go to <a href="/nl-to-ct/manage">Manage NL to CT Tabs</a> to add one.
        </div>
      )}

      {tabsQ.data && tabsQ.data.tabs.length > 0 && (
        <>
          <div style={{ display: 'flex', gap: 16, alignItems: 'center', marginBottom: 16, flexWrap: 'wrap' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              Week:
              <select
                value={effectiveId ?? ''}
                onChange={(e) => setSelectedId(Number(e.target.value))}
                style={{ padding: '6px 8px', fontSize: 14 }}
              >
                {tabsQ.data.tabs.map((t: NlToCtTab) => (
                  <option key={t.id} value={t.id}>{formatWeekDate(t.week_date)}</option>
                ))}
              </select>
            </label>

            <div style={{ display: 'inline-flex', borderRadius: 4, overflow: 'hidden', border: '1px solid #ccc' }}>
              {(['grid','cards','tiles'] as ViewMode[]).map(v => (
                <button
                  key={v}
                  onClick={() => setView(v)}
                  className="btn btnSmall"
                  style={{
                    background: view === v ? '#2680eb' : 'white',
                    color: view === v ? 'white' : '#333',
                    border: 'none',
                    padding: '6px 12px',
                    borderRight: v !== 'tiles' ? '1px solid #ccc' : undefined,
                    cursor: 'pointer',
                    textTransform: 'capitalize',
                  }}
                >
                  {v}
                </button>
              ))}
            </div>
          </div>

          {dataQ.isLoading && <p>Loading week data…</p>}
          {dataQ.error && <p style={{ color: '#8a1f1f' }}>Failed to load week data.</p>}
          {dataQ.data && (
            <>
              {dataQ.data.sheet_read_error && (
                <div style={{ background: '#fde2e2', color: '#8a1f1f', padding: 10, borderRadius: 4, marginBottom: 12 }}>
                  Live sheet read failed — showing frozen captures only. ({dataQ.data.sheet_read_error})
                </div>
              )}
              {view === 'grid' && (
                <div style={{ overflowX: 'auto' }}>
                  <GridView payload={dataQ.data} onCaptureSlot={setCaptureSlot} />
                </div>
              )}
              {view === 'cards' && <p style={{ color: 'var(--muted)' }}>Cards view coming in Task 12.</p>}
              {view === 'tiles' && <p style={{ color: 'var(--muted)' }}>Tiles view coming in Task 13.</p>}
            </>
          )}
        </>
      )}

      {captureSlot && effectiveId != null && dataQ.data && (
        <CaptureModal
          tabId={effectiveId}
          slot={captureSlot}
          payload={dataQ.data}
          onClose={() => setCaptureSlot(null)}
          onCaptured={handleCaptured}
        />
      )}
    </div>
  );
}
```

- [ ] **Step 2: Add the route to `frontend/src/App.tsx`**

Add the import:
```tsx
import { NlToCtBreakdownPage } from './pages/NlToCtBreakdownPage';
```

Add the route alongside `NlToCtTabsPage`:
```tsx
          <Route path="/nl-to-ct" element={
            <RequirePermission dashboard="testing"><NlToCtBreakdownPage /></RequirePermission>
          } />
```

- [ ] **Step 3: Verify in the browser**

Navigate to `/nl-to-ct`. With at least one tab registered, you should see:
- The week dropdown showing all registered weeks (latest first).
- The Grid view rendering — branches as rows, three day groups, time-slot sub-columns with Goal/Actual and (where applicable) QAQC.
- Each time-slot column header has a Capture button (green) or Re-capture (orange) once any branch is frozen.
- Clicking Capture opens a modal listing all 20 branches with their existing-frozen and current-sheet values side by side. Confirming captures and the cells update.
- Cells colour by status: green / yellow / red based on Actual vs Goal.
- Pasting an invalid gid on the manage page, then loading `/nl-to-ct`, still loads (the failed-sheet banner appears for stale captured data).

- [ ] **Step 4: Commit**

```bash
git add frontend/src/pages/NlToCtBreakdownPage.tsx frontend/src/App.tsx
git commit -m "feat(nl-to-ct): add breakdown page with grid view and capture flow"
```

---

## Task 12: Frontend Visualisation page — Cards view

**Files:**
- Modify: `frontend/src/pages/NlToCtBreakdownPage.tsx`

- [ ] **Step 1: Add the CardsView component**

In `frontend/src/pages/NlToCtBreakdownPage.tsx`, add the recharts imports at the top:
```tsx
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts';
```

Add the component immediately above the `// ─── Page ───` section:

```tsx
interface CardsViewProps {
  payload: TabPayload;
}
function CardsView({ payload }: CardsViewProps) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 16 }}>
      {payload.branches.map(b => {
        const chartData = TIME_SLOTS.map(s => {
          const sd = b.slots.find(x => x.slot_key === s.key);
          return {
            label: `${s.day} ${s.time}`,
            goal: sd?.goal ?? 0,
            actual: sd?.actual_captured ?? sd?.actual_live ?? 0,
          };
        });
        return (
          <div key={b.code} style={{ border: '1px solid #ddd', borderRadius: 6, padding: 12 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 8 }}>
              <h3 style={{ margin: 0, fontSize: 18 }}>{b.code}</h3>
              <span style={{ fontSize: 12, color: 'var(--muted)' }}>NL {b.nl ?? '—'} · CT {b.ct ?? '—'}</span>
            </div>
            <div style={{ height: 180 }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData} margin={{ top: 4, right: 4, left: -16, bottom: 4 }}>
                  <XAxis dataKey="label" tick={{ fontSize: 10 }} interval={0} angle={-30} textAnchor="end" height={50} />
                  <YAxis tick={{ fontSize: 10 }} />
                  <Tooltip />
                  <Bar dataKey="goal" fill="#cfd8e3" name="Goal" />
                  <Bar dataKey="actual" name="Actual">
                    {chartData.map((d, i) => (
                      <Cell key={i} fill={d.actual === 0 ? '#e36b6b' : d.actual >= d.goal ? '#5cb85c' : '#e6c84e'} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        );
      })}
    </div>
  );
}
```

Replace the placeholder line:
```tsx
              {view === 'cards' && <p style={{ color: 'var(--muted)' }}>Cards view coming in Task 12.</p>}
```
with:
```tsx
              {view === 'cards' && <CardsView payload={dataQ.data} />}
```

- [ ] **Step 2: Verify in the browser**

On `/nl-to-ct`, click the **Cards** view. You should see a responsive grid of 20 branch cards, each with a small bar chart of Goal vs Actual across the 8 time slots, with bars colour-coded.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/pages/NlToCtBreakdownPage.tsx
git commit -m "feat(nl-to-ct): add cards view with per-branch bar charts"
```

---

## Task 13: Frontend Visualisation page — Tiles view

**Files:**
- Modify: `frontend/src/pages/NlToCtBreakdownPage.tsx`

- [ ] **Step 1: Add the TilesView component**

In `frontend/src/pages/NlToCtBreakdownPage.tsx`, immediately below `CardsView`:

```tsx
interface TilesViewProps {
  payload: TabPayload;
}
function TilesView({ payload }: TilesViewProps) {
  // Aggregate across branches per slot.
  const slotTotals = TIME_SLOTS.map(s => {
    let goalSum = 0;
    let actualSum = 0;
    for (const b of payload.branches) {
      const sd = b.slots.find(x => x.slot_key === s.key);
      goalSum   += sd?.goal ?? 0;
      actualSum += sd?.actual_captured ?? sd?.actual_live ?? 0;
    }
    const pct = goalSum > 0 ? Math.round((actualSum / goalSum) * 100) : 0;
    return { slot: s, goalSum, actualSum, pct };
  });

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 12 }}>
      {slotTotals.map(({ slot, goalSum, actualSum, pct }) => (
        <div
          key={slot.key}
          style={{
            border: '1px solid #ddd',
            borderRadius: 6,
            padding: 14,
            background: pct >= 100 ? '#e6f7e8' : pct >= 70 ? '#fffbe6' : '#fde2e2',
          }}
        >
          <div style={{ fontSize: 12, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: 0.5 }}>{slot.day} {slot.time}</div>
          <div style={{ fontSize: 26, fontWeight: 600, marginTop: 4 }}>
            {actualSum} <span style={{ fontSize: 14, color: 'var(--muted)' }}>/ {goalSum}</span>
          </div>
          <div style={{ fontSize: 14, color: '#333', marginTop: 4 }}>{pct}%</div>
        </div>
      ))}
    </div>
  );
}
```

Replace the placeholder line:
```tsx
              {view === 'tiles' && <p style={{ color: 'var(--muted)' }}>Tiles view coming in Task 13.</p>}
```
with:
```tsx
              {view === 'tiles' && <TilesView payload={dataQ.data} />}
```

- [ ] **Step 2: Verify in the browser**

Click the **Tiles** view. You should see 8 large tiles, one per slot, each showing the aggregated `actualSum / goalSum` and the percentage. Tile background colour depends on the percentage (green ≥ 100, yellow 70-99, red < 70).

- [ ] **Step 3: Commit**

```bash
git add frontend/src/pages/NlToCtBreakdownPage.tsx
git commit -m "feat(nl-to-ct): add tiles view with per-slot aggregates"
```

---

## Task 14: Frontend Visualisation page — "Show last week" toggle

**Files:**
- Modify: `frontend/src/pages/NlToCtBreakdownPage.tsx`

- [ ] **Step 1: Add the toggle + previous-week query + threading into all three views**

In `frontend/src/pages/NlToCtBreakdownPage.tsx`:

**1a.** Add a `showLast` state and a `prevQ` query inside the `NlToCtBreakdownPage` component (after the `dataQ` declaration):

```tsx
  const [showLast, setShowLast] = useState(false);

  const prevQ = useQuery({
    queryKey: ['nl-to-ct', 'previous-week', effectiveId],
    queryFn: () => nlToCtApi.previousWeek(effectiveId as number),
    enabled: effectiveId != null && showLast,
    retry: false,
  });
  const prevPayload: TabPayload | null = prevQ.data ?? null;
  const hasPrev = prevQ.isSuccess; // 404 → isError; success → we have data
```

**1b.** Render the toggle in the header row (inside the existing `<div style={{ display: 'flex', gap: 16, … }}>` block, after the view-mode segmented control). Disable the toggle if there's no previous tab — detect this lazily by trying the fetch once when enabled.

```tsx
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, marginLeft: 'auto' }}>
              <input
                type="checkbox"
                checked={showLast}
                onChange={(e) => setShowLast(e.target.checked)}
              />
              Show last week
              {showLast && prevQ.isError && (
                <span style={{ color: '#8a1f1f', fontSize: 12, marginLeft: 4 }}>(no earlier week)</span>
              )}
            </label>
```

**1c.** Update `GridView` to accept and overlay the previous payload. Change the `GridView` props and rendering to:

```tsx
interface GridViewProps {
  payload: TabPayload;
  prev: TabPayload | null;
  onCaptureSlot: (slot: SlotDef) => void;
}
function GridView({ payload, prev, onCaptureSlot }: GridViewProps) {
  const byCode = useMemo(() => {
    const m = new Map<string, BranchData>();
    for (const b of payload.branches) m.set(b.code, b);
    return m;
  }, [payload]);
  const prevByCode = useMemo(() => {
    const m = new Map<string, BranchData>();
    if (prev) for (const b of prev.branches) m.set(b.code, b);
    return m;
  }, [prev]);

  // (header unchanged from Task 11)

  // In the <tbody>, replace the Actual <td> with:
  //
  //   <td …>
  //     {displayActual ?? '—'}
  //     {prev && (() => {
  //       const psd = prevByCode.get(b.code)?.slots.find(s => s.slot_key === slot.key);
  //       const prevA = psd?.actual_captured ?? psd?.actual_live ?? null;
  //       const delta = displayActual != null && prevA != null ? displayActual - prevA : null;
  //       return (
  //         <div style={{ fontSize: 10, color: '#666', marginTop: 2 }}>
  //           prev {prevA ?? '—'} {delta != null && <span style={{ color: delta >= 0 ? '#1f7a1f' : '#8a1f1f' }}>({delta >= 0 ? '+' : ''}{delta})</span>}
  //         </div>
  //       );
  //     })()}
  //   </td>
}
```

For clarity, here's the full updated Actual `<td>` to drop into the existing `cells` array inside the `flatMap`:

```tsx
                  <td key={`${b.code}-${slot.key}-a`} style={{ padding: 4, border: '1px solid #ddd', textAlign: 'right', background: tint, fontWeight: sd?.actual_captured != null ? 600 : 400 }}>
                    <div>{displayActual ?? '—'}</div>
                    {prev && (() => {
                      const psd = prevByCode.get(b.code)?.slots.find(s => s.slot_key === slot.key);
                      const prevA = psd?.actual_captured ?? psd?.actual_live ?? null;
                      const delta = displayActual != null && prevA != null ? displayActual - prevA : null;
                      return (
                        <div style={{ fontSize: 10, color: '#666', marginTop: 2 }}>
                          prev {prevA ?? '—'}{' '}
                          {delta != null && (
                            <span style={{ color: delta >= 0 ? '#1f7a1f' : '#8a1f1f' }}>
                              ({delta >= 0 ? '+' : ''}{delta})
                            </span>
                          )}
                        </div>
                      );
                    })()}
                  </td>,
```

Update the GridView render call to pass `prev`:

```tsx
                  <GridView payload={dataQ.data} prev={showLast ? prevPayload : null} onCaptureSlot={setCaptureSlot} />
```

**1d.** Update `CardsView` to optionally include a third "Last week" bar series. Extend props:

```tsx
interface CardsViewProps {
  payload: TabPayload;
  prev: TabPayload | null;
}
function CardsView({ payload, prev }: CardsViewProps) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 16 }}>
      {payload.branches.map(b => {
        const prevB = prev?.branches.find(x => x.code === b.code);
        const chartData = TIME_SLOTS.map(s => {
          const sd = b.slots.find(x => x.slot_key === s.key);
          const psd = prevB?.slots.find(x => x.slot_key === s.key);
          return {
            label: `${s.day} ${s.time}`,
            goal: sd?.goal ?? 0,
            actual: sd?.actual_captured ?? sd?.actual_live ?? 0,
            prevActual: psd ? (psd.actual_captured ?? psd.actual_live ?? 0) : null,
          };
        });
        return (
          <div key={b.code} style={{ border: '1px solid #ddd', borderRadius: 6, padding: 12 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 8 }}>
              <h3 style={{ margin: 0, fontSize: 18 }}>{b.code}</h3>
              <span style={{ fontSize: 12, color: 'var(--muted)' }}>NL {b.nl ?? '—'} · CT {b.ct ?? '—'}</span>
            </div>
            <div style={{ height: 180 }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData} margin={{ top: 4, right: 4, left: -16, bottom: 4 }}>
                  <XAxis dataKey="label" tick={{ fontSize: 10 }} interval={0} angle={-30} textAnchor="end" height={50} />
                  <YAxis tick={{ fontSize: 10 }} />
                  <Tooltip />
                  <Bar dataKey="goal" fill="#cfd8e3" name="Goal" />
                  <Bar dataKey="actual" name="Actual">
                    {chartData.map((d, i) => (
                      <Cell key={i} fill={d.actual === 0 ? '#e36b6b' : d.actual >= d.goal ? '#5cb85c' : '#e6c84e'} />
                    ))}
                  </Bar>
                  {prev && <Bar dataKey="prevActual" fill="#9a9a9a" name="Last week" />}
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        );
      })}
    </div>
  );
}
```

Update the CardsView render call:
```tsx
              {view === 'cards' && <CardsView payload={dataQ.data} prev={showLast ? prevPayload : null} />}
```

**1e.** Update `TilesView` to optionally include the previous-week subtitle. Extend props:

```tsx
interface TilesViewProps {
  payload: TabPayload;
  prev: TabPayload | null;
}
function TilesView({ payload, prev }: TilesViewProps) {
  const slotTotals = TIME_SLOTS.map(s => {
    let goalSum = 0, actualSum = 0, prevGoalSum = 0, prevActualSum = 0;
    for (const b of payload.branches) {
      const sd = b.slots.find(x => x.slot_key === s.key);
      goalSum   += sd?.goal ?? 0;
      actualSum += sd?.actual_captured ?? sd?.actual_live ?? 0;
    }
    if (prev) {
      for (const b of prev.branches) {
        const sd = b.slots.find(x => x.slot_key === s.key);
        prevGoalSum   += sd?.goal ?? 0;
        prevActualSum += sd?.actual_captured ?? sd?.actual_live ?? 0;
      }
    }
    const pct = goalSum > 0 ? Math.round((actualSum / goalSum) * 100) : 0;
    const prevPct = prevGoalSum > 0 ? Math.round((prevActualSum / prevGoalSum) * 100) : 0;
    return { slot: s, goalSum, actualSum, pct, prevGoalSum, prevActualSum, prevPct };
  });

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 12 }}>
      {slotTotals.map(({ slot, goalSum, actualSum, pct, prevGoalSum, prevActualSum, prevPct }) => (
        <div
          key={slot.key}
          style={{
            border: '1px solid #ddd',
            borderRadius: 6,
            padding: 14,
            background: pct >= 100 ? '#e6f7e8' : pct >= 70 ? '#fffbe6' : '#fde2e2',
          }}
        >
          <div style={{ fontSize: 12, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: 0.5 }}>{slot.day} {slot.time}</div>
          <div style={{ fontSize: 26, fontWeight: 600, marginTop: 4 }}>
            {actualSum} <span style={{ fontSize: 14, color: 'var(--muted)' }}>/ {goalSum}</span>
          </div>
          <div style={{ fontSize: 14, color: '#333', marginTop: 4 }}>{pct}%</div>
          {prev && (
            <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 6 }}>
              Last week: {prevActualSum}/{prevGoalSum} ({prevPct}%)
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
```

Update the TilesView render call:
```tsx
              {view === 'tiles' && <TilesView payload={dataQ.data} prev={showLast ? prevPayload : null} />}
```

- [ ] **Step 2: Verify in the browser**

Register at least two weekly tabs. On `/nl-to-ct`, toggle **Show last week** on:
- **Grid view**: each Actual cell now has a small `prev N (+/-Δ)` line beneath it.
- **Cards view**: each chart has a third grey bar series labelled "Last week".
- **Tiles view**: each tile has a `Last week: A/G (P%)` subtitle.

Toggle off — everything reverts.

If only one tab is registered, the toggle still appears (per the spec) but shows `(no earlier week)` next to it because the previous-week endpoint 404s. The views render unchanged.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/pages/NlToCtBreakdownPage.tsx
git commit -m "feat(nl-to-ct): add Show last week toggle across all three views"
```

---

## Task 15: Wire links into the home dashboard card

**Files:**
- Modify: `frontend/src/pages/DashboardHomePage.tsx`

- [ ] **Step 1: Add the two new links to the Testing card**

In `frontend/src/pages/DashboardHomePage.tsx`, find the `testing` entry around line 171-181 and update its `links` array:

```tsx
    {
      id: 'testing',
      name: 'Testing Purposes Only (dnft)',
      icon: '🧪',
      color: '#f97316',
      links: [
        { label: 'Branch Performance', path: '/branch-performance', dashboard: 'testing' },
        { label: 'To Tally', path: '/tally', dashboard: 'testing' },
        { label: 'UI/UX Testing', path: '/ui-ux-testing', dashboard: 'testing' },
        { label: 'Testing NL to CT Breakdown', path: '/nl-to-ct', dashboard: 'testing' },
        { label: 'Manage NL to CT Tabs', path: '/nl-to-ct/manage', dashboard: 'testing' },
      ]
    },
```

- [ ] **Step 2: Verify in the browser**

Navigate to `/` (the dashboard home). The Testing Purposes Only (dnft) card now shows five links, with the two new ones at the bottom. Both navigate correctly.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/pages/DashboardHomePage.tsx
git commit -m "feat(nl-to-ct): add Testing card links for visualisation and management"
```

---

## Task 16: End-to-end smoke test

This task is a manual verification pass — no code changes. Run through the full user flow and confirm everything works together.

- [ ] **Step 1: Fresh-DB sanity check**

In psql:
```
SELECT COUNT(*) FROM nl_to_ct_tabs;
SELECT COUNT(*) FROM nl_to_ct_captures;
```
Note the starting numbers. After the smoke test the deltas should match what you did.

- [ ] **Step 2: Register a tab**

Log in. Navigate to **Testing Purposes Only (dnft) → Manage NL to CT Tabs**. Paste the gid of the *most recent* week's tab. Confirm:
- The row appears in the table with the parsed week date and tab name.
- A second paste of the same gid shows `Week … is already registered`.
- A bogus gid (e.g. `999999999`) shows `Tab not found. Double-check the gid.`.

- [ ] **Step 3: Register a second (earlier) week**

Paste the gid of the prior week's tab so the previous-week toggle has something to compare against.

- [ ] **Step 4: View the visualisation**

Navigate to **Testing Purposes Only (dnft) → Testing NL to CT Breakdown**. Confirm:
- Week dropdown contains both weeks, latest selected.
- Grid view shows live NL/CT/Goal/Actual/QAQC. Spot-check 2-3 cells against the actual Google Sheet.
- Switch to **Cards** — 20 cards render with bar charts.
- Switch to **Tiles** — 8 tiles render with aggregates.
- Toggle **Show last week** on (with the latest week selected). All three views now include last-week info.

- [ ] **Step 5: Capture and re-capture**

In Grid view, click **Capture** on `Wed 4:30PM`. The modal lists 20 branches showing current sheet values and `—` for existing frozen (since nothing is frozen yet). Confirm. The Actual column for that slot turns bold (indicating frozen) and the button becomes **Re-capture** with an orange tint.

Click **Re-capture**. The modal now shows existing frozen values alongside current sheet values. If they differ, the "Current sheet" column is bold. Confirm overwrite.

Verify with psql:
```
SELECT COUNT(*) FROM nl_to_ct_captures WHERE slot_key = 'wed_4_30pm';
```
Should be 20.

- [ ] **Step 6: Sheet read failure path**

Stop the backend. Restart with an env that breaks the CSV fetch:
```
# PowerShell
$env:NL_TO_CT_SHEET_READER = 'serviceAccount'; npm run dev

# Or bash
NL_TO_CT_SHEET_READER=serviceAccount npm run dev
```
Reload `/nl-to-ct`. Confirm: the red banner "Live sheet read failed — showing frozen captures only" appears. Frozen Actuals (captured in step 5) still render. Goal/QAQC cells show `—`.

Restart the backend without the env var (back to CSV) and confirm the page loads normally again.

- [ ] **Step 7: Delete a tab**

Go to **Manage NL to CT Tabs**. Click the trash icon next to the earlier week. Confirm in the prompt. The row disappears.

Verify in psql:
```
SELECT COUNT(*) FROM nl_to_ct_tabs;
SELECT COUNT(*) FROM nl_to_ct_captures;
```
Captures for the deleted tab should be gone too (cascade delete).

- [ ] **Step 8: Permissions sanity**

Open an incognito window. Log in as a non-`testing` user (e.g. one of the `marketing`-only roles). Navigate manually to `/nl-to-ct`. Expected: redirect / "Forbidden" — confirming the `requireDashboard('testing')` gate works.

- [ ] **Step 9: Commit (no changes — just a marker)**

No code change for this task. Run:
```bash
git log --oneline -20
```
You should see one commit per earlier task, all prefixed with `feat(nl-to-ct):` plus the docs commit from earlier. Nothing to commit here.

---

## Done

Total: 16 tasks, ~16 commits, one new feature spanning DB → API → UI under the existing Testing card, no test framework introduced, no changes to permissions infrastructure, no changes outside the agreed surface.

If anything in this plan turns out wrong against the live sheet (most likely: a column letter in `nlToCtSchema.js`), fix it inline and add a short follow-up commit — it's the kind of small correction the design explicitly anticipates.
