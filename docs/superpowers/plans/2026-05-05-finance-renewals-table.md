# Finance Renewals Table — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the two-database join in `/api/finance/renewal-by-branch` with a derived `finance_renewals` table populated from `autocount_invoices` JSON via a 15-min skip-if-unchanged cron.

**Architecture:** Add a numbered SQL migration (013) that creates `finance_renewals` and `finance_renewals_refresh_log` in `ebrightleads_db` via the existing `runMigrations()` startup pattern. Add a new `refreshFinanceRenewals.js` cron job that parses `autocount_invoices.data->details[]` for renewals and upserts into the new table every 15 minutes (skipping when `MAX(last_modified)` is unchanged). After reconciliation passes, rewrite the endpoint to read from the new table.

**Tech Stack:** Node.js, Express, PostgreSQL (pg pool), node-cron, raw SQL (no Prisma migration).

**Spec:** [`docs/superpowers/specs/2026-05-05-finance-renewals-table-design.md`](../specs/2026-05-05-finance-renewals-table-design.md)

---

## File Structure

| File | Action | Purpose |
|---|---|---|
| `backend/sql/013_create_finance_renewals.sql` | Create | Reference SQL for the two new tables (matches `backend/sql/0NN_*.sql` convention). Documentation; the actual table creation runs through `runMigrations`. |
| `backend/src/server.js` | Modify (lines 7–72, 81) | Add `CREATE TABLE IF NOT EXISTS` for both new tables to `runMigrations()`. Import and start the new cron job. |
| `backend/src/jobs/refreshFinanceRenewals.js` | Create | The cron job — advisory lock, skip-if-unchanged check, parse-and-upsert, delete-stale, log. |
| `backend/src/routes/finance.js` | Modify (lines 1–2, 94–180) | Drop `invPool` from this file's `require('../db')`. Rewrite both endpoint bodies to read from the new tables. |

No frontend changes. No Prisma schema changes.

---

## Task 1: Create the reference SQL migration file

**Files:**
- Create: `backend/sql/013_create_finance_renewals.sql`

This file documents the new schema. It is not auto-executed (the actual creation goes through `runMigrations` in Task 2), but it follows the `backend/sql/0NN_*.sql` naming pattern so future devs can find it.

- [ ] **Step 1: Create the SQL file**

Write `backend/sql/013_create_finance_renewals.sql`:

```sql
-- 013_create_finance_renewals.sql
-- Creates the finance_renewals table (derived from autocount_invoices.data JSON)
-- and its append-only refresh log. Tables are also auto-created at server
-- startup via runMigrations() in src/server.js — this file exists for
-- documentation and manual provisioning.

CREATE TABLE IF NOT EXISTS finance_renewals (
  id                      BIGSERIAL     PRIMARY KEY,
  doc_no                  TEXT          NOT NULL,
  doc_date                DATE          NOT NULL,
  branch_code             TEXT          NOT NULL,
  package                 TEXT          NOT NULL,
  amount                  NUMERIC(12,2) NOT NULL,
  student_name            TEXT,
  raw_description         TEXT,
  detail_seq              INTEGER       NOT NULL,
  source_last_modified    TIMESTAMPTZ,
  parsed_at               TIMESTAMPTZ   NOT NULL DEFAULT NOW(),

  CONSTRAINT finance_renewals_doc_no_seq_unique UNIQUE (doc_no, detail_seq)
);

CREATE INDEX IF NOT EXISTS idx_finance_renewals_branch_date
  ON finance_renewals (branch_code, doc_date);

CREATE INDEX IF NOT EXISTS idx_finance_renewals_doc_date
  ON finance_renewals (doc_date);

CREATE TABLE IF NOT EXISTS finance_renewals_refresh_log (
  id                        SERIAL      PRIMARY KEY,
  ran_at                    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  source_max_last_modified  TIMESTAMPTZ,
  rows_upserted             INTEGER,
  rows_deleted              INTEGER,
  duration_ms               INTEGER,
  status                    TEXT,
  error_message             TEXT
);

CREATE INDEX IF NOT EXISTS idx_finance_renewals_refresh_log_status_ran_at
  ON finance_renewals_refresh_log (status, ran_at DESC);
```

- [ ] **Step 2: Commit**

```bash
git add backend/sql/013_create_finance_renewals.sql
git commit -m "sql: add 013_create_finance_renewals migration file"
```

---

## Task 2: Wire table creation into runMigrations()

**Files:**
- Modify: `backend/src/server.js` (inside `runMigrations()`, before the closing `console.log`)

This makes the tables auto-create on server startup, matching how all other tables in this codebase are provisioned.

- [ ] **Step 1: Add CREATE TABLE statements to runMigrations()**

In `backend/src/server.js`, locate `runMigrations()` (starts at line 7). Just before the closing `console.log('✅ DB migrations complete');` line (line 71), add the following block:

```javascript
  // finance_renewals: derived from autocount_invoices.data JSON, populated by
  // refreshFinanceRenewals.js cron. See docs/superpowers/specs/2026-05-05-finance-renewals-table-design.md
  await pool.query(`
    CREATE TABLE IF NOT EXISTS finance_renewals (
      id                      BIGSERIAL     PRIMARY KEY,
      doc_no                  TEXT          NOT NULL,
      doc_date                DATE          NOT NULL,
      branch_code             TEXT          NOT NULL,
      package                 TEXT          NOT NULL,
      amount                  NUMERIC(12,2) NOT NULL,
      student_name            TEXT,
      raw_description         TEXT,
      detail_seq              INTEGER       NOT NULL,
      source_last_modified    TIMESTAMPTZ,
      parsed_at               TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
      CONSTRAINT finance_renewals_doc_no_seq_unique UNIQUE (doc_no, detail_seq)
    );
    CREATE INDEX IF NOT EXISTS idx_finance_renewals_branch_date
      ON finance_renewals (branch_code, doc_date);
    CREATE INDEX IF NOT EXISTS idx_finance_renewals_doc_date
      ON finance_renewals (doc_date);
    CREATE TABLE IF NOT EXISTS finance_renewals_refresh_log (
      id                        SERIAL      PRIMARY KEY,
      ran_at                    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      source_max_last_modified  TIMESTAMPTZ,
      rows_upserted             INTEGER,
      rows_deleted              INTEGER,
      duration_ms               INTEGER,
      status                    TEXT,
      error_message             TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_finance_renewals_refresh_log_status_ran_at
      ON finance_renewals_refresh_log (status, ran_at DESC);
  `);
```

- [ ] **Step 2: Restart the dev server**

```bash
cd backend && npm run dev
```

Watch the console. Expected output includes:
```
✅ DB migrations complete
API listening on http://0.0.0.0:<port>
```

If you see a SQL syntax error, fix the SQL block above and restart. Do not proceed until the migration runs cleanly.

- [ ] **Step 3: Verify the tables exist in HeidiSQL**

Connect to `ebrightleads_db` in HeidiSQL. In the left tree, refresh the `public` schema. Confirm:
- `finance_renewals` appears in the table list
- `finance_renewals_refresh_log` appears in the table list

Then run in HeidiSQL:
```sql
\d finance_renewals
\d finance_renewals_refresh_log
```
(Or in HeidiSQL specifically: right-click the table → "Show CREATE table".)

Confirm columns and indexes match the schema in Task 1, Step 1.

- [ ] **Step 4: Commit**

```bash
git add backend/src/server.js
git commit -m "feat(finance): create finance_renewals tables on startup"
```

---

## Task 3: Prototype the parse SQL in HeidiSQL

This task does not change any code — it validates the parse query against real data before we wrap it in a cron job. If the query has bugs, we find them now, in HeidiSQL, where iteration is fast.

**Files:** none (read-only DB exploration).

- [ ] **Step 1: Run the parse query for last month**

In HeidiSQL on `ebrightleads_db`, run:

```sql
SELECT
  ai.doc_no,
  ai.doc_date::date                                                AS doc_date,
  TRIM(REGEXP_REPLACE(d->>'deptNo', '^[0-9]+', ''))                AS branch_code,
  TRIM(SPLIT_PART(d->>'description', ',', 2))                     AS package,
  (d->>'subTotal')::numeric                                        AS amount,
  TRIM(SPLIT_PART(d->>'description', ',', 1))                     AS student_name,
  d->>'description'                                                AS raw_description,
  (d->>'seq')::int                                                 AS detail_seq,
  ai.last_modified                                                 AS source_last_modified
FROM autocount_invoices ai,
     LATERAL jsonb_array_elements(ai.data->'details') AS d
WHERE ai.doc_type = 'Invoice'
  AND ai.doc_date >= DATE_TRUNC('month', NOW() - INTERVAL '1 month')
  AND ai.doc_date <  DATE_TRUNC('month', NOW())
  AND TRIM(SPLIT_PART(d->>'description', ',', 3)) = 'Renewal'
  AND TRIM(SPLIT_PART(d->>'description', ',', 2)) IN ('3M','6M','9M','12M')
  AND d->>'deptNo' ~ '^[0-9]+[A-Z]+$'
  AND d->>'seq' IS NOT NULL
ORDER BY ai.doc_date DESC, ai.doc_no
LIMIT 200;
```

Expected: a result set with 100–200 rows, each having clean `branch_code` (e.g. `CJY`, `KD`, `EGR`, `ONL`), valid `package` (`3M`/`6M`/`9M`/`12M`), positive `amount`, and a `raw_description` that includes the word "Renewal".

- [ ] **Step 2: Spot-check by branch**

Run:

```sql
SELECT branch_code, package, COUNT(*) AS cnt, SUM(amount) AS total
FROM (
  SELECT
    TRIM(REGEXP_REPLACE(d->>'deptNo', '^[0-9]+', '')) AS branch_code,
    TRIM(SPLIT_PART(d->>'description', ',', 2))      AS package,
    (d->>'subTotal')::numeric                         AS amount
  FROM autocount_invoices ai,
       LATERAL jsonb_array_elements(ai.data->'details') AS d
  WHERE ai.doc_type = 'Invoice'
    AND ai.doc_date >= DATE_TRUNC('month', NOW() - INTERVAL '1 month')
    AND ai.doc_date <  DATE_TRUNC('month', NOW())
    AND TRIM(SPLIT_PART(d->>'description', ',', 3)) = 'Renewal'
    AND TRIM(SPLIT_PART(d->>'description', ',', 2)) IN ('3M','6M','9M','12M')
    AND d->>'deptNo' ~ '^[0-9]+[A-Z]+$'
    AND d->>'seq' IS NOT NULL
) t
GROUP BY branch_code, package
ORDER BY branch_code, package;
```

Expected: similar shape to the Renewal by Branch dashboard — a few branches with rows for 3M/6M/9M/12M and reasonable totals.

- [ ] **Step 3: Compare against the dashboard**

Open the dashboard at `/finance/renewal-by-branch`, click "Last Month". Eyeball: do the per-branch counts and totals from Step 2 roughly match the dashboard? Exact match isn't required yet (the dashboard reads from the OLD path); we just want to confirm the shape and order of magnitude is right.

If totals are off by orders of magnitude, the parse rules are wrong — re-read the spec's "Source: parsing autocount_invoices.data" section before proceeding.

- [ ] **Step 4: No commit (this task is read-only)**

---

## Task 4: Create the cron job module

**Files:**
- Create: `backend/src/jobs/refreshFinanceRenewals.js`

- [ ] **Step 1: Create the file**

Write `backend/src/jobs/refreshFinanceRenewals.js`:

```javascript
const cron = require('node-cron');
const { pool } = require('../db');

const ADVISORY_LOCK_KEY = 7426519; // arbitrary constant, namespaces this job

async function logRun(client, fields) {
  await client.query(
    `INSERT INTO finance_renewals_refresh_log
       (source_max_last_modified, rows_upserted, rows_deleted, duration_ms, status, error_message)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [
      fields.sourceMax || null,
      fields.rowsUpserted || 0,
      fields.rowsDeleted || 0,
      fields.durationMs || 0,
      fields.status,
      fields.errorMessage || null,
    ]
  );
}

async function refreshFinanceRenewals() {
  const start = Date.now();
  const client = await pool.connect();
  try {
    // 1. Acquire advisory lock (prevents concurrent runs after a deploy hiccup).
    const lockResult = await client.query(
      'SELECT pg_try_advisory_lock($1) AS got',
      [ADVISORY_LOCK_KEY]
    );
    if (!lockResult.rows[0].got) {
      await logRun(client, { status: 'skipped_locked', durationMs: Date.now() - start });
      console.log('[finance-renewals] skipped — another run holds the advisory lock');
      return;
    }

    try {
      // 2. Read current MAX(last_modified) from autocount_invoices.
      const sourceCheck = await client.query(
        'SELECT MAX(last_modified) AS max_lm FROM autocount_invoices'
      );
      const currentMax = sourceCheck.rows[0].max_lm;

      // 3. Read MAX(last_modified) seen on the most recent successful run.
      const lastRun = await client.query(
        `SELECT source_max_last_modified
         FROM finance_renewals_refresh_log
         WHERE status = 'ok'
         ORDER BY ran_at DESC
         LIMIT 1`
      );
      const lastSeen = lastRun.rows[0]?.source_max_last_modified || null;

      // 4. Skip if unchanged.
      if (lastSeen && currentMax && new Date(lastSeen).getTime() === new Date(currentMax).getTime()) {
        await logRun(client, {
          sourceMax: currentMax,
          status: 'skipped_unchanged',
          durationMs: Date.now() - start,
        });
        console.log('[finance-renewals] skipped — autocount_invoices unchanged since last run');
        return;
      }

      // 5. Parse + upsert + delete-stale, all in one transaction.
      await client.query('BEGIN');

      const upsertResult = await client.query(`
        INSERT INTO finance_renewals
          (doc_no, doc_date, branch_code, package, amount,
           student_name, raw_description, detail_seq, source_last_modified)
        SELECT
          ai.doc_no,
          ai.doc_date::date,
          TRIM(REGEXP_REPLACE(d->>'deptNo', '^[0-9]+', '')),
          TRIM(SPLIT_PART(d->>'description', ',', 2)),
          (d->>'subTotal')::numeric,
          TRIM(SPLIT_PART(d->>'description', ',', 1)),
          d->>'description',
          (d->>'seq')::int,
          ai.last_modified
        FROM autocount_invoices ai,
             LATERAL jsonb_array_elements(ai.data->'details') AS d
        WHERE ai.doc_type = 'Invoice'
          AND TRIM(SPLIT_PART(d->>'description', ',', 3)) = 'Renewal'
          AND TRIM(SPLIT_PART(d->>'description', ',', 2)) IN ('3M','6M','9M','12M')
          AND d->>'deptNo' ~ '^[0-9]+[A-Z]+$'
          AND d->>'seq' IS NOT NULL
        ON CONFLICT (doc_no, detail_seq) DO UPDATE SET
          doc_date             = EXCLUDED.doc_date,
          branch_code          = EXCLUDED.branch_code,
          package              = EXCLUDED.package,
          amount               = EXCLUDED.amount,
          student_name         = EXCLUDED.student_name,
          raw_description      = EXCLUDED.raw_description,
          source_last_modified = EXCLUDED.source_last_modified,
          parsed_at            = NOW()
      `);

      const deleteResult = await client.query(`
        DELETE FROM finance_renewals fr
        WHERE NOT EXISTS (
          SELECT 1
          FROM autocount_invoices ai,
               LATERAL jsonb_array_elements(ai.data->'details') AS d
          WHERE ai.doc_no = fr.doc_no
            AND (d->>'seq')::int = fr.detail_seq
            AND ai.doc_type = 'Invoice'
            AND TRIM(SPLIT_PART(d->>'description', ',', 3)) = 'Renewal'
            AND TRIM(SPLIT_PART(d->>'description', ',', 2)) IN ('3M','6M','9M','12M')
            AND d->>'deptNo' ~ '^[0-9]+[A-Z]+$'
        )
      `);

      await client.query('COMMIT');

      await logRun(client, {
        sourceMax: currentMax,
        rowsUpserted: upsertResult.rowCount,
        rowsDeleted: deleteResult.rowCount,
        durationMs: Date.now() - start,
        status: 'ok',
      });

      console.log(
        `[finance-renewals] OK — upserted ${upsertResult.rowCount}, deleted ${deleteResult.rowCount}, ${Date.now() - start}ms`
      );
    } finally {
      // 6. Always release the advisory lock.
      await client.query('SELECT pg_advisory_unlock($1)', [ADVISORY_LOCK_KEY]);
    }
  } catch (err) {
    // Roll back if the transaction is open. A second BEGIN-ROLLBACK is a no-op when none is open.
    try { await client.query('ROLLBACK'); } catch (_) { /* ignore */ }
    try {
      await logRun(client, {
        durationMs: Date.now() - start,
        status: 'error',
        errorMessage: err.message,
      });
    } catch (logErr) {
      console.error('[finance-renewals] failed to log error:', logErr.message);
    }
    console.error('[finance-renewals] FAILED:', err.message);
  } finally {
    client.release();
  }
}

function startFinanceRenewalsRefreshJob() {
  // Every 15 minutes
  cron.schedule('*/15 * * * *', refreshFinanceRenewals);

  // Run once on startup so the table is fresh after a deploy
  refreshFinanceRenewals();

  console.log('[finance-renewals] Scheduler started — every 15 minutes');
}

module.exports = { startFinanceRenewalsRefreshJob, refreshFinanceRenewals };
```

- [ ] **Step 2: Lint check (no commit yet)**

```bash
cd backend && node -c src/jobs/refreshFinanceRenewals.js
```

Expected: no output (syntax is valid). If you see a `SyntaxError`, fix it.

- [ ] **Step 3: Commit**

```bash
git add backend/src/jobs/refreshFinanceRenewals.js
git commit -m "feat(finance): add refreshFinanceRenewals cron job"
```

---

## Task 5: Wire the cron into server.js startup

**Files:**
- Modify: `backend/src/server.js` (line 5 import, line 81 startup)

- [ ] **Step 1: Add the import**

In `backend/src/server.js`, locate line 5:
```javascript
const { startFinanceRefreshJob } = require('./jobs/refreshFinanceView');
```

Change it to:
```javascript
const { startFinanceRefreshJob } = require('./jobs/refreshFinanceView');
const { startFinanceRenewalsRefreshJob } = require('./jobs/refreshFinanceRenewals');
```

- [ ] **Step 2: Start the new job in start()**

In the same file, locate line 81:
```javascript
  startFinanceRefreshJob();
```

Add the new job call right after it:
```javascript
  startFinanceRefreshJob();
  startFinanceRenewalsRefreshJob();
```

- [ ] **Step 3: Restart the dev server and watch the logs**

```bash
cd backend && npm run dev
```

Expected console output (in order):
```
✅ DB migrations complete
API listening on http://0.0.0.0:<port>
[finance-refresh] Scheduler started — every 15 minutes
[finance-refresh] OK — refreshed in <N>ms
[finance-renewals] Scheduler started — every 15 minutes
[finance-renewals] OK — upserted <N>, deleted 0, <N>ms
```

If you see `[finance-renewals] FAILED:` instead, copy the error message and check the parse SQL — the most likely cause is a column type mismatch (e.g., `seq` not parseable as int for some row that slipped past the `IS NOT NULL` filter).

- [ ] **Step 4: Verify the table is populated**

In HeidiSQL on `ebrightleads_db`:

```sql
SELECT COUNT(*) FROM finance_renewals;
```
Expected: a positive number (likely a few hundred to a few thousand depending on history).

```sql
SELECT * FROM finance_renewals ORDER BY doc_date DESC LIMIT 20;
```
Expected: 20 rows of recent renewals with clean branch codes, valid packages, positive amounts.

```sql
SELECT * FROM finance_renewals_refresh_log ORDER BY ran_at DESC LIMIT 5;
```
Expected: at least one row with `status = 'ok'`, sensible `rows_upserted`, `duration_ms` in the low hundreds of ms.

- [ ] **Step 5: Verify skip-if-unchanged works**

Manually trigger a second run by restarting the dev server (which calls `refreshFinanceRenewals()` once on startup).

```bash
# Ctrl-C the server, then:
cd backend && npm run dev
```

Watch logs for:
```
[finance-renewals] skipped — autocount_invoices unchanged since last run
```

Then in HeidiSQL:
```sql
SELECT status, ran_at, duration_ms FROM finance_renewals_refresh_log ORDER BY ran_at DESC LIMIT 3;
```
Expected: the latest row has `status = 'skipped_unchanged'` and `duration_ms` under 50ms.

- [ ] **Step 6: Commit**

```bash
git add backend/src/server.js
git commit -m "feat(finance): start refreshFinanceRenewals job on boot"
```

---

## Task 6: Reconciliation against the existing endpoint

This task is the gate before we change the live endpoint. We compare the OLD endpoint's output to what the NEW table contains, branch by branch, for the same date range.

**Files:** none (read-only verification).

- [ ] **Step 1: Capture the old endpoint's output for last month**

Open a browser tab to the live dashboard at `/finance/renewal-by-branch`. Click "Last Month". Take a screenshot showing every branch's row with its 3M/6M/9M/12M counts and Grand Total.

(Alternative: open the browser dev tools Network tab, find the `/api/finance/renewal-by-branch?month=...&year=...` request, copy the JSON response, and save it to a scratch file.)

- [ ] **Step 2: Query the NEW table for the same range**

In HeidiSQL on `ebrightleads_db` (replace `$1`/`$2` with the same start and end dates the dashboard sent — start of month, end of month):

```sql
SELECT
  branch_code,
  COUNT(*) FILTER (WHERE package = '3M')                  AS count_3m,
  COUNT(*) FILTER (WHERE package = '6M')                  AS count_6m,
  COUNT(*) FILTER (WHERE package = '9M')                  AS count_9m,
  COUNT(*) FILTER (WHERE package = '12M')                 AS count_12m,
  COUNT(*)                                                 AS total_renewals,
  COALESCE(SUM(amount) FILTER (WHERE package = '3M'),  0) AS total_3m,
  COALESCE(SUM(amount) FILTER (WHERE package = '6M'),  0) AS total_6m,
  COALESCE(SUM(amount) FILTER (WHERE package = '9M'),  0) AS total_9m,
  COALESCE(SUM(amount) FILTER (WHERE package = '12M'), 0) AS total_12m,
  COALESCE(SUM(amount), 0)                                 AS grand_total
FROM finance_renewals
WHERE doc_date >= DATE '2026-04-01'
  AND doc_date <= DATE '2026-04-30'
GROUP BY branch_code
ORDER BY branch_code;
```

(Adjust the dates if "last month" is a different month at the time of execution.)

- [ ] **Step 3: Compare row by row**

For each branch in the dashboard screenshot (Step 1):
- Counts (3M, 6M, 9M, 12M, total_renewals): MUST match exactly.
- Totals (total_3m, total_6m, total_9m, total_12m, grand_total): SHOULD match. Small differences (a few RM) are acceptable IF traceable to a multi-line invoice (the spec discusses this — `subTotal` per-line is more correct than per-invoice `total_amount`).

If any row differs in counts: **stop**. Investigate.

Likely causes for count mismatches:
- A branch_code regex mismatch (e.g., a `deptNo` like `EGR` without leading digits — adjust the regex)
- A `description` parsed differently (e.g., extra whitespace before "Renewal")
- An invoice in the OLD path's `inventory_distribution_new` that doesn't exist in `autocount_invoices`

Run this drill-down to find the offender:

```sql
SELECT branch_code, package, doc_no, doc_date, amount, raw_description
FROM finance_renewals
WHERE doc_date BETWEEN DATE '2026-04-01' AND DATE '2026-04-30'
  AND branch_code = 'CJY'   -- pick a branch that mismatched
ORDER BY doc_date, doc_no;
```

Compare to a similar query against the OLD path:

```sql
-- Run on INV_DB (autocount inventory database):
SELECT branch_code, package, doc_no, doc_date
FROM inventory_distribution_new
WHERE type = 'Renewal'
  AND doc_date >= '2026-04-01' AND doc_date <= '2026-04-30'
  AND branch_code = 'CJY'
ORDER BY doc_date, doc_no;
```

The set of `doc_no`s should be identical. Investigate any difference, fix the parse rules in `refreshFinanceRenewals.js` (Task 4), restart the server to pick up the fix, and re-run reconciliation.

- [ ] **Step 4: Repeat for the previous month**

Repeat Steps 1–3 for the month before "last month". Two months of clean reconciliation = green light to proceed.

- [ ] **Step 5: No commit (this task is verification)**

If reconciliation never reaches a clean state, **do not proceed to Task 7**. The new infrastructure is harmless sitting there — it's not yet powering the dashboard. Take time to debug.

---

## Task 7: Rewrite the renewal-by-branch endpoint

**Files:**
- Modify: `backend/src/routes/finance.js` (line 2 imports, lines 94–165 endpoint)

- [ ] **Step 1: Drop invPool from this file's imports**

In `backend/src/routes/finance.js`, line 2:
```javascript
const { pool, invPool } = require('../db'); // Make sure you use both pools here
```

Change to:
```javascript
const { pool } = require('../db');
```

- [ ] **Step 2: Replace the endpoint body**

In `backend/src/routes/finance.js`, replace lines 93–165 (the entire `// NEW: Renewal Distribution by Branch` route, from the comment through the closing `});`) with:

```javascript
// Renewal Distribution by Branch
// Reads from finance_renewals (populated by refreshFinanceRenewals.js cron).
// Replaces a previous two-DB join (INV_DB + view_ebright_invoices).
financeRouter.get('/renewal-by-branch', async (req, res, next) => {
  try {
    const { month, year } = req.query;
    const startDate = `${year}-${month}-01`;
    const endDate = new Date(year, month, 0).toISOString().split('T')[0];

    const result = await pool.query(`
      SELECT
        branch_code,
        COUNT(*) FILTER (WHERE package = '3M')                  AS count_3m,
        COUNT(*) FILTER (WHERE package = '6M')                  AS count_6m,
        COUNT(*) FILTER (WHERE package = '9M')                  AS count_9m,
        COUNT(*) FILTER (WHERE package = '12M')                 AS count_12m,
        COUNT(*)                                                 AS total_renewals,
        COALESCE(SUM(amount) FILTER (WHERE package = '3M'),  0) AS total_3m,
        COALESCE(SUM(amount) FILTER (WHERE package = '6M'),  0) AS total_6m,
        COALESCE(SUM(amount) FILTER (WHERE package = '9M'),  0) AS total_9m,
        COALESCE(SUM(amount) FILTER (WHERE package = '12M'), 0) AS total_12m,
        COALESCE(SUM(amount), 0)                                 AS grand_total
      FROM finance_renewals
      WHERE doc_date >= $1 AND doc_date <= $2
      GROUP BY branch_code
      ORDER BY branch_code
    `, [startDate, endDate]);

    // Cast numerics to JS numbers for the existing frontend contract.
    const data = result.rows.map(r => ({
      branch_code:    r.branch_code,
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
```

- [ ] **Step 3: Replace the freshness endpoint body**

In the same file, locate lines 167–180 (`// NEW: Renewal by Branch Freshness Indicator`) and replace with:

```javascript
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
```

- [ ] **Step 4: Restart the dev server**

```bash
cd backend && npm run dev
```

Watch for clean startup. Expected:
```
✅ DB migrations complete
API listening on http://0.0.0.0:<port>
[finance-refresh] Scheduler started — every 15 minutes
[finance-renewals] Scheduler started — every 15 minutes
```

No `ReferenceError: invPool is not defined` or similar. If you see one, you missed a usage of `invPool` somewhere in the file — re-grep:

```bash
grep -n "invPool" backend/src/routes/finance.js
```
Expected: zero matches.

- [ ] **Step 5: Hit the endpoint with curl**

```bash
curl "http://localhost:<port>/api/finance/renewal-by-branch?month=4&year=2026" | head -c 500
```
Replace `<port>` with the actual dev port. (You may also need to include an auth cookie/header — copy from a browser request if so.)

Expected: a JSON array of branch summaries with the same shape as before.

```bash
curl "http://localhost:<port>/api/finance/renewal-by-branch/freshness"
```
Expected: `{"data":{"last_refreshed":"2026-...","duration_ms":N}}`.

- [ ] **Step 6: Load the dashboard and eyeball**

Open `/finance/renewal-by-branch` in the browser. Click "Last Month". Compare against the Task 6 screenshot.

Expected: identical numbers (or differences traceable to multi-line invoices, as documented in reconciliation).

Spot-check: change branch filter, change month, click Refresh, watch "Last updated: X minutes ago" reflect a recent timestamp.

- [ ] **Step 7: Commit**

```bash
git add backend/src/routes/finance.js
git commit -m "refactor(finance): renewal-by-branch reads from finance_renewals"
```

---

## Task 8: Final smoke test and freshness check

**Files:** none.

- [ ] **Step 1: Wait 15 min for a scheduled cron run**

Or trigger one manually (skip if you just restarted). After the cron fires, check:

```sql
SELECT status, ran_at, rows_upserted, rows_deleted, duration_ms
FROM finance_renewals_refresh_log
ORDER BY ran_at DESC
LIMIT 5;
```

Expected: a mix of `'ok'` and `'skipped_unchanged'` rows. No `'error'`. Durations under 1 second.

- [ ] **Step 2: Verify dashboard freshness indicator**

Reload the dashboard. The "Last updated: X minutes ago" text should be reasonably current (within 15 minutes).

- [ ] **Step 3: Confirm legacy infrastructure still works**

The OLD materialized view and refresh job were deliberately left in place (per the spec's non-goals). Verify nothing broke them:

```sql
SELECT COUNT(*) FROM finance_renewal_by_branch;
SELECT * FROM finance_view_refresh_log ORDER BY last_refreshed DESC LIMIT 1;
```

Expected: the materialized view still has data and the old refresh log still gets new rows every 15 min from `refreshFinanceView.js`. (We don't use these for the dashboard anymore, but they're untouched.)

- [ ] **Step 4: No commit (this task is verification)**

---

## Self-Review Notes

This plan has been checked against the spec at [`docs/superpowers/specs/2026-05-05-finance-renewals-table-design.md`](../specs/2026-05-05-finance-renewals-table-design.md):

- **Components 1 & 2 (tables):** Tasks 1, 2 create them.
- **Component 3 (cron):** Tasks 4, 5 build and wire it.
- **Component 4 (endpoint rewrite):** Task 7.
- **Component 5 (freshness rewrite):** Task 7, Step 3.
- **Verification & rollout (Phase 1, 2, 3):** Tasks 2–5 = Phase 1, Task 6 = Phase 2, Task 7 = Phase 3. Task 8 covers post-deploy smoke.
- **Non-goals (don't drop legacy):** explicitly preserved by Task 8 Step 3.

No formal unit tests in this plan because the backend has no test framework set up; verification is via SQL queries and dashboard eyeballing at each step. If a test framework is added later, the parse SQL in Task 4 is the natural unit to fixture against.

---

## Stopping Conditions (Do Not Proceed Past Task 6 If…)

- Reconciliation count mismatches you cannot explain.
- Cron logs show repeated `'error'` rows.
- The migration in Task 2 fails to apply.

In any of those cases, leave the dashboard on the OLD code path. The new tables can sit unused — they cost nothing and harm nothing.
