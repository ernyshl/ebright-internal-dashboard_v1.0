# Finance Renewals Table — Design

**Date:** 2026-05-05
**Status:** Approved, ready for implementation plan
**Owner:** dina

## Background

The "Renewal by Branch" dashboard card at `/finance/renewal-by-branch` currently fetches data by joining two databases at request time:

- `INV_DB.inventory_distribution_new` (via `invPool`) — provides `doc_no`, `branch_code`, `package`, filtered by `type = 'Renewal'` and date range.
- `ebrightleads_db.view_ebright_invoices` (via `pool`) — provides `total_amount` per `doc_no`.

The two result sets are stitched together in JavaScript inside [backend/src/routes/finance.js:94-165](../../../backend/src/routes/finance.js).

A materialized view `finance_renewal_by_branch` and a 15-minute refresh job ([backend/src/jobs/refreshFinanceView.js](../../../backend/src/jobs/refreshFinanceView.js)) exist in the leads DB but are not actually consumed by the endpoint.

## Goals

1. Fetch all renewal data from `autocount_invoices.data` JSON (single database).
2. Store parsed renewals in a new browseable table in `ebrightleads_db` so finance/dev can inspect rows directly in HeidiSQL.
3. Switch the dashboard endpoint to read from the new table once reconciliation proves parity.
4. Do not disturb existing data, jobs, or other endpoints.

## Non-goals

- Removing `inventory_distribution_new` from INV_DB.
- Dropping `finance_renewal_by_branch` materialized view or its refresh job.
- Removing `invPool` from `backend/src/db.js`.
- Modifying the upstream Autocount → DB sync.
- Changing the frontend page or component.

These are deliberately deferred as cleanup tasks after the new flow is proven stable.

## Architecture

```
[Autocount desktop]
       │ Upstream sync (sporadic, every few days, bulk re-import)
       │ ← out of scope
       ▼
autocount_invoices                  ← read-only for us
       │
       │ NEW cron (every 15 min, skip-if-unchanged):
       │   parse data->details for renewals → upsert
       ▼
finance_renewals                    ← NEW table, written only by our cron
       │
       │ Live SELECT (no cache layer)
       ▼
GET /api/finance/renewal-by-branch  ← rewritten endpoint, single-DB
       ▼
Dashboard card
```

The new table is **derived** from `autocount_invoices` via code — no foreign key, no trigger, no view dependency. The cron is the only mechanism keeping them in sync.

### Data freshness

`autocount_invoices` itself updates sporadically (we observed roughly one bulk re-sync event per few days, touching ~99% of rows in a single transaction). The 15-minute cron picks up changes within 15 min of the upstream sync completing. The real freshness bottleneck is the upstream sync, not our cron.

## Data flow details

### Source: parsing `autocount_invoices.data`

For every row where `doc_type = 'Invoice'`, we iterate `data->'details'` (a JSON array). Each detail row becomes a candidate `finance_renewals` row if all of these match:

| Field | Source | Filter |
|---|---|---|
| Type | `details[].description` 3rd CSV token | must equal `'Renewal'` |
| Package | `details[].description` 2nd CSV token | must be one of `'3M'`, `'6M'`, `'9M'`, `'12M'` |
| Branch code | `details[].deptNo`, strip leading digits | must match regex `^[0-9]+[A-Z]+$` |
| `detail_seq` | `details[].seq` | must be present (source always populates it; a missing seq is a data anomaly and the row is skipped) |
| Amount | `details[].subTotal` | numeric, per-line item |
| Student name | `details[].description` 1st CSV token | informational, used for drill-down |
| `doc_no`, `doc_date` | top-level `autocount_invoices` columns | — |

Anything that fails these filters is silently skipped (no row inserted). The `raw_description` column on every inserted row preserves the original string for audit.

### Why `subTotal` and not `master.finalTotal`

The current endpoint uses `view_ebright_invoices.total_amount`, which is the per-invoice total. If a single invoice has multiple line items (e.g. one 3M renewal + one trial), the current logic credits the *full* invoice amount to whichever package matched — over-counting. Using `details[].subTotal` per-line is correct and is a quiet correctness improvement of this change. Reconciliation may show small dollar differences for this reason; those differences are acceptable when traced to multi-line invoices.

## Components

### Component 1: `finance_renewals` table (new)

Created via raw SQL in `ebrightleads_db`, **not** added to `schema.prisma`. This matches the existing convention for finance objects (`finance_renewal_by_branch`, `finance_view_refresh_log`).

```sql
CREATE TABLE finance_renewals (
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

  UNIQUE (doc_no, detail_seq)
);

CREATE INDEX idx_finance_renewals_branch_date
  ON finance_renewals (branch_code, doc_date);
CREATE INDEX idx_finance_renewals_doc_date
  ON finance_renewals (doc_date);
```

The `UNIQUE (doc_no, detail_seq)` constraint allows the cron to use `INSERT ... ON CONFLICT DO UPDATE` for idempotent upserts.

### Component 2: `finance_renewals_refresh_log` table (new)

Append-only log so we can audit cron runs in HeidiSQL.

```sql
CREATE TABLE finance_renewals_refresh_log (
  id                        SERIAL      PRIMARY KEY,
  ran_at                    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  source_max_last_modified  TIMESTAMPTZ,
  rows_upserted             INTEGER,
  rows_deleted              INTEGER,
  duration_ms               INTEGER,
  status                    TEXT,
  error_message             TEXT
);
```

`status` is one of `'ok'`, `'skipped_unchanged'`, `'skipped_locked'`, `'error'`.

### Component 3: refresh cron job (new)

**File:** `backend/src/jobs/refreshFinanceRenewals.js` (separate from the existing `refreshFinanceView.js`).

**Schedule:** every 15 minutes via `node-cron`, plus a single run on server startup.

**Wiring:** registered from `backend/src/server.js` alongside the existing finance refresh job.

**Per-run logic:**

1. Acquire a Postgres advisory lock with `pg_try_advisory_lock(<constant>)`. If it fails, log `'skipped_locked'` and exit (prevents concurrent runs).
2. Read `MAX(last_modified)` from `autocount_invoices`.
3. Read `source_max_last_modified` from the latest `'ok'` row in `finance_renewals_refresh_log`.
4. If equal, log `'skipped_unchanged'`, release lock, exit.
5. `BEGIN TRANSACTION`.
6. Upsert all current renewal line items (one SQL statement using `INSERT ... ON CONFLICT (doc_no, detail_seq) DO UPDATE`).
7. Delete `finance_renewals` rows whose corresponding source line item no longer satisfies the filters (handles deleted invoices, type changed away from Renewal, package changed to invalid, etc.).
8. `COMMIT`.
9. Log `'ok'` with counts and duration.
10. Release lock.

**On error:** ROLLBACK, log `'error'` with the message, release lock. The schedule continues; the next run is 15 min later.

**Pool:** uses the existing `pool` (leads DB) from `backend/src/db.js`. No need for `invPool`.

### Component 4: rewritten `/api/finance/renewal-by-branch` endpoint

**File:** [backend/src/routes/finance.js](../../../backend/src/routes/finance.js), replacing lines 94–165.

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
WHERE doc_date >= $1 AND doc_date <= $2
GROUP BY branch_code
ORDER BY branch_code;
```

The endpoint output shape matches the current contract exactly. The frontend page [frontend/src/pages/FinanceRenewalByBranchPage.tsx](../../../frontend/src/pages/FinanceRenewalByBranchPage.tsx) requires zero changes.

`invPool` is removed from this file's destructure of `require('../db')`. `invPool` itself is **not** removed from `db.js` (other endpoints may still use it; cleanup is deferred).

### Component 5: rewritten freshness endpoint

`GET /api/finance/renewal-by-branch/freshness` ([backend/src/routes/finance.js:168-180](../../../backend/src/routes/finance.js)) reads the latest `'ok'` row from `finance_renewals_refresh_log` instead of `finance_view_refresh_log`. Response shape is identical, so the dashboard "Last updated: X minutes ago" indicator works without frontend changes.

## Error handling

| Failure mode | Behavior |
|---|---|
| Cron parse SQL errors | ROLLBACK, log `status='error'`, schedule continues |
| Cron concurrency (two runs overlap) | Second run logs `'skipped_locked'`, exits |
| Cron lock held but never released (crash) | Postgres releases advisory lock when the connection drops; next run proceeds normally |
| Endpoint queries empty table | Returns `{ data: [] }` (current contract) |
| Malformed `description` or `deptNo` in source | Row silently skipped during parse; `raw_description` preserved for any rows that did make it in |

## Verification & rollout

### Phase 1: build new infrastructure (zero risk)

1. Create `finance_renewals` and `finance_renewals_refresh_log` tables via raw SQL run once in HeidiSQL.
2. Add `refreshFinanceRenewals.js` and wire it into `server.js`.
3. Deploy. Cron starts populating the new table on the next 15-min boundary.
4. Endpoint still uses the old INV_DB + `view_ebright_invoices` flow. Dashboard unchanged.

### Phase 2: reconciliation

Run a side-by-side query in HeidiSQL comparing the old flow's output to the new table's aggregation, branch by branch, for the latest full month and the previous month.

**Acceptance criteria:** counts match exactly. Total amounts match within rounding, OR any differences are traced to multi-line invoices (acceptable, since `subTotal` is more correct than per-invoice `total_amount`).

If reconciliation fails, do not proceed to Phase 3. Investigate parse rules, adjust, re-run.

### Phase 3: switch endpoint

1. Replace endpoint bodies (Sections 4a, 4b above).
2. Deploy.
3. Eyeball the dashboard — numbers should be identical to before.
4. Spot-check a few branches and months.

### What is NOT done in this change (deferred cleanup)

- Drop `finance_renewal_by_branch` materialized view
- Stop and remove `refreshFinanceView.js` cron
- Drop `inventory_distribution_new` from INV_DB
- Remove `invPool` from `backend/src/db.js`

These remain in place as a fallback. If anything regresses, reverting the endpoint commit restores the old behavior immediately. After 1–2 weeks of stable operation, a follow-up PR removes the old infrastructure.

## Testing

- **Unit:** the parse logic is one SQL statement; correctness is verified through reconciliation rather than mocked unit tests.
- **Manual:**
  - After Phase 1, browse `finance_renewals` in HeidiSQL — confirm rows exist, branch codes look clean, packages are in the expected set.
  - Confirm `finance_renewals_refresh_log` has rows with sane durations (expect skip-runs to be ~10ms, full-runs to be a few hundred ms).
  - Force a refresh by clicking the "Refresh" button on the dashboard — confirm a new log row appears.
- **Reconciliation queries:** documented in the implementation plan, run in HeidiSQL between Phase 1 and Phase 3.
- **Post-deploy:** load the dashboard, compare visible numbers against the pre-deploy screenshot.

## Open questions

None at design time. Implementation plan should:

1. Verify which (if any) other endpoints still use `invPool` before deciding follow-up cleanup scope.
2. Decide the exact integer to use for the advisory lock key (any constant works; pick one and document it).
