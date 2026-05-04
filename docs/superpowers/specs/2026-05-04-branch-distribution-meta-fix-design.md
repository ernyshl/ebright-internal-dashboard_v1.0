# Branch Distribution Meta Count Fix — Design

**Date:** 2026-05-04
**Author:** OD team
**Status:** Approved (Parts 1 & 2)

## Background

The Branch Distribution dashboard's "Lead Sources (without siblings)" Meta card showed
105 leads for 2026-05-03 MYT, while Meta's own Leads Center UI (filtered to the same
date in MYT) showed 84. Investigation found two independent root causes:

1. **JOIN inflation** in the `master_leads_powerbi` view: an `ILIKE '%keyword%'` JOIN
   to `branch_mapping` matches multiple branch keywords against one Meta `form_name`,
   so a single Meta lead can appear 2+ times. Yesterday: 20 leads doubled into 40 rows
   out of 85 unique → view returned 105.
2. **Sync coverage gap**: even after dedup, our raw `meta_leads` table for 2026-05-03
   MYT contains 57 rows when filtered by the `lead_created_time` column, or ~85 unique
   when filtered by the JSONB `raw_data->>'created_time'` (same expression the view
   uses). Meta's UI shows 84. So depending on the timestamp source, we may also have
   a small or large gap in `sync_meta_leads.py`. Part 2 audits this end-to-end.

The Telegram daily report reads from the same view (`master_leads_powerbi`), so it
inherits both bugs.

## Goals

| # | Goal | Notes |
|---|---|---|
| 1 | Branch Distribution Meta count = our `meta_leads` table count | Within ±5 leads variance |
| 2 | Telegram report Meta count = Branch Distribution Meta count | Same view, follows automatically |
| 3 | Our `meta_leads` table count = Meta's Leads Center UI count | Within ±5 leads variance |
| 4 | Regional Breakdown (with siblings) keeps current behaviour | No change to GHL-sourced UNION branches |
| 5 | TikTok branch of view stays untouched | "If it works, don't touch it" |

## Success criteria

For 2026-05-03 (and going forward, daily):
- `meta_leads` row count for the day in MYT is within ±5 of Meta UI's count
- `master_leads_powerbi` Meta row count for the day in MYT is within ±5 of `meta_leads`
  row count for the same day
- Telegram report's Meta number matches Branch Distribution's Meta number exactly
  (since they share a query)

## Architecture

Two independent workstreams. They do not block each other and can be reviewed/merged
separately.

### Part 1 — JOIN fix in `master_leads_powerbi` view

**Scope:** Meta UNION branch only. TikTok branch and any GHL-sourced UNION branches
remain unchanged.

**Change:** Replace the duplicate-causing JOIN to `branch_mapping`:

```sql
-- Before (causes duplicates when form_name matches multiple keywords)
LEFT JOIN branch_mapping bm2
  ON lower(ml.form_name) ~~* ('%' || lower(bm2.keyword) || '%')

-- After (returns at most one branch per lead, preferring most-specific keyword)
LEFT JOIN LATERAL (
  SELECT official_name, region
  FROM branch_mapping
  WHERE lower(ml.form_name) LIKE '%' || lower(keyword) || '%'
  ORDER BY length(keyword) DESC
  LIMIT 1
) bm2 ON true
```

The existing `bm` JOIN (which reads a `%branch%`-named field from `raw_data`) stays as
the primary; `bm2` (form_name fallback) is the duplicating one and gets the LATERAL
treatment.

**Tie-breaker rationale:** Sort by `length(keyword) DESC` so longer/more-specific
keywords win. Example: if `branch_mapping` has both `"AREA C"` and `"C"`, a form_name
containing `"AREA C"` matches both → LATERAL picks `"AREA C"` because its keyword is
longer. This matches operator intent.

**Deployment:** Run as `CREATE OR REPLACE VIEW master_leads_powerbi AS …` in psql
against postgres_leads. Reversible by re-running the previous definition. No app
downtime.

**Verification:**
- Before/after row counts in `master_leads_powerbi` for 2026-05-03 MYT — expect drop
  from 105 to ~85 (dedup of the 20 duplicate groups identified earlier).
- `meta_leads` raw count using `(raw_data->>'created_time')::timestamptz` filter
  (same expression the view uses) — should match the view's count after dedup.
- Spot-check 5 lead-IDs that previously appeared twice in the view, confirm now
  appear once.

**Note on timestamp column choice:** A separate diagnostic earlier showed `meta_leads`
filtered by `lead_created_time` returns 57 rows for 2026-05-03 MYT, while the view
(using `raw_data->>'created_time'`) returns ~85 unique. These two timestamps may
disagree for some rows. Reconciling them is out of scope for Part 1 — the view's
existing timestamp logic is preserved. Part 2's audit will surface this if it
matters.

### Part 2 — Sync coverage audit (read-only diagnostic)

**Scope:** Investigation only. No DB writes, no sync changes from this part. Findings
inform a follow-up fix.

**New script:** `~/ebright-live-dashboard/audit_meta_leads.py` (lives next to existing
sync scripts).

**Behaviour:**

1. Read `LEADS_ACCESS_TOKEN` and `PAGE_ID` from `config.py` (same as `sync_meta_leads.py`).
2. Fetch every form on the Page from `/{page_id}/leadgen_forms`, **including** non-ACTIVE
   statuses (DRAFT, PAUSED, ARCHIVED). This differs from `discover_forms()` which only
   returns ACTIVE.
3. For each form, page through `/{form_id}/leads` collecting every lead whose
   `created_time` falls in the chosen MYT day range (UTC equivalent). Follow
   `paging.next` until exhausted.
4. Build sets:
   - `meta_truth_ids` = lead IDs Meta returned
   - `db_ids` = lead IDs in our `meta_leads` table for the same MYT range
5. Print a report:
   - Total in `meta_truth`, total in DB, missing count
   - Per-form breakdown (form_id, form_name, status, leads_on_meta, leads_in_db, missing)
   - Up to 20 sample missing lead-IDs with their form context

**Hypotheses the report will confirm or rule out** (in order):

1. **Non-ACTIVE forms** — if missing leads cluster on PAUSED/DRAFT forms, the fix is
   to broaden `discover_forms()` to include those statuses (or specific historical
   statuses).
2. **Pagination** — if missing leads cluster on busy forms (>25 leads/day), the fix
   is to follow `paging.next` in `sync_meta_leads.py`.
3. **Permission edge cases** — if certain form_ids return errors in audit but not in
   sync (or vice versa), token scope on those forms needs review.
4. **Timing** — if missing lead `created_time` clusters near MYT-midnight boundary,
   the sync polling cadence may need to be tightened or the date filter widened.

**Output destination:** stdout, redirected to `/tmp/meta_audit_2026-05-03.log`. Not
committed; this is a one-off run.

**Followup fix (separate spec):** Once the audit identifies the cause, a small patch
to `sync_meta_leads.py` closes the gap. That patch is NOT part of this design — it
gets its own spec once we have the audit data.

## Components and dependencies

| Component | Where | Touched by |
|---|---|---|
| `master_leads_powerbi` view | postgres_leads DB | Part 1 |
| `meta_leads` table | postgres_leads DB | Read-only in both parts |
| `branch_mapping` table | postgres_leads DB | Read-only |
| `sync_meta_leads.py` | wintest-server `~/ebright-live-dashboard/` | NOT touched (Part 2 is read-only) |
| `audit_meta_leads.py` | NEW, wintest-server | Part 2 |
| `backend/src/routes/leads.js` | dashboard repo | NOT touched (queries the view) |
| `backend/scripts/telegram-report.sh` | dashboard repo | NOT touched (queries the view) |

## Out of scope (for this spec)

- TikTok branch of the view (untouched per user instruction).
- GHL-sourced branches of the view (powering "with siblings" Regional Breakdown).
- Patching `sync_meta_leads.py` to close the sync gap — gets its own spec after audit.
- Adding monitoring/alerts for view dedup or sync lag — separate ticket.
- Frontend changes to `LeadsBreakdownPage.tsx` — none needed.

## Rollback plan

**Part 1:** `CREATE OR REPLACE VIEW master_leads_powerbi AS <previous-definition>` —
need to capture the current definition before changing. Will save it to
`backend/sql/_pre-2026-05-04-master_leads_powerbi.sql` before running the patch.

**Part 2:** Read-only script. Nothing to roll back. Can delete the file if not wanted.

## Risks

| Risk | Likelihood | Mitigation |
|---|---|---|
| LATERAL JOIN tie-break picks wrong branch when keywords overlap | Low | Manual spot-check after deploy on 5 known-multi-match form_names |
| `length(keyword) DESC` tie-break is wrong heuristic for some branches | Low | Audit `branch_mapping`'s keyword list for ambiguous overlaps |
| Audit script hits Meta rate limits on busy days | Medium | Run during low-traffic hours; back off on rate-limit errors |
| Audit reveals gap is bigger than 27 leads (e.g. archived forms have huge backlog) | Medium | Findings go in followup spec; doesn't affect Part 1 |
