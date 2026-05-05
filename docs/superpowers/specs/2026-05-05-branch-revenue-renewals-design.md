# Branch Revenue & Renewals Card — Design

**Date:** 2026-05-05
**Status:** Approved, ready for implementation plan
**Owner:** dina

## Background

The Finance section of the dashboard home page currently has three tiles: Finance Dashboard, Branch Ranking, and Renewal by Branch. This design adds a fourth tile, **Branch Revenue & Renewals**, which combines the two existing data sources into one chart.

The new chart answers the question: *"How much of each branch's total revenue comes from renewals?"* — a useful KPI for assessing branch dependency on recurring student renewals.

The card is built on the same horizontal-bar layout as Branch Ranking but each bar is split into two segments: a gold segment for the renewal portion and the existing tier-colored segment for the rest of the revenue.

## Goals

1. New card in the Finance section linking to a new page `/finance/branch-revenue-renewals`.
2. Display top 20 branches (same set as Branch Ranking) with two-tone horizontal bars showing renewal portion within total revenue.
3. Per-row right-side display: total revenue (large) and renewal amount (smaller).
4. Reuse existing Branch Ranking infrastructure where possible without modifying that page.
5. Reuse the `finance_renewals` table that already exists and is being kept fresh by `refreshFinanceRenewals.js`.

## Non-goals

- Modifying the existing `/branch-ranking` endpoint or `BranchRankingPage.tsx`.
- Adding new columns to `finance_renewals` or `view_ebright_invoices`.
- Changing the cron job, refresh log, or any other backend infrastructure.
- Building reusable bar-chart components — the new page can copy from `BranchRankingPage.tsx`. Refactoring shared components is deferred until a third similar page emerges.

## Architecture

```
┌────────────────────────────────────┐
│  Dashboard Home                    │
│  └─ Finance section                │
│     ├─ Finance Dashboard           │
│     ├─ Branch Ranking              │
│     ├─ Renewal by Branch           │
│     └─ Branch Revenue & Renewals  ← NEW tile
└────────────────────────────────────┘
              │ click
              ▼
┌────────────────────────────────────────┐
│  /finance/branch-revenue-renewals      │
│  (new page — copy of BranchRanking)    │
└──────────────┬─────────────────────────┘
               │ GET ?date_from=...&date_to=...
               ▼
┌────────────────────────────────────────┐
│  /api/finance/branch-revenue-renewals  │
│  (new endpoint)                        │
└──────┬───────────────────────────┬─────┘
       │ Query 1                    │ Query 2
       ▼                            ▼
┌──────────────────────┐   ┌──────────────────────┐
│ view_ebright_invoices│   │ finance_renewals     │
│ (revenue per branch) │   │ (renewals per branch │
│                      │   │  via mapped branch   │
│                      │   │  code → full name)   │
└──────────────────────┘   └──────────────────────┘
```

The endpoint runs both queries in parallel, then joins the renewal totals onto the revenue rows in JS using a constant mapping table from short branch codes (e.g. `'PJY'`) to full names (e.g. `'Ebright Putrajaya'`).

## Components

### Component 1: `GET /api/finance/branch-revenue-renewals` (new endpoint)

**Location:** Added to `backend/src/routes/finance.js`.

**Query parameters:** `date_from`, `date_to`, `branch` (optional) — same as `/branch-ranking`.

**Two parallel queries:**

1. **Revenue query** — identical SQL to the existing `/branch-ranking` endpoint at lines 36–66 of `finance.js`. Returns top 20 branches by all-time revenue, LEFT JOIN filtered to the selected period, with `total_revenue` and `invoice_count` per branch.

2. **Renewals query** — new SQL against `finance_renewals`:

   ```sql
   SELECT branch_code, SUM(amount) AS renewal_total
   FROM finance_renewals
   WHERE doc_date >= $1 AND doc_date <= $2
   GROUP BY branch_code
   ```

**JS join:** A constant `BRANCH_CODE_TO_FULL_NAME` mapping defined at the top of the route handler translates short codes to full branch names. The endpoint maps each renewals-query row by code, then attaches the resulting `renewal_total` to the corresponding revenue row.

**Response shape:**

```json
{
  "branches": [
    { "branch": "Ebright Danau Kota", "total": 91687.86, "renewal": 25368.46, "count": 142 },
    { "branch": "Ebright Setia Alam", "total": 85499.26, "renewal": 10500.00, "count": 110 }
  ],
  "grandTotal": 946219.22,
  "grandRenewalTotal": 188693.36,
  "branchList": ["Ebright Ampang", "Ebright Bandar Baru Bangi", "..."]
}
```

This is the same shape as `/branch-ranking` plus two new fields: `renewal` per branch and `grandRenewalTotal` at the top level. The existing `branchList` field stays as-is for the branch dropdown.

**Branch mapping (defined inline):**

```javascript
const BRANCH_CODE_TO_FULL_NAME = {
  AMP:  'Ebright Ampang',
  BBB:  'Ebright Bandar Baru Bangi',
  BSP:  'Ebright Bandar Seri Putra',
  BTHO: 'Ebright Bandar Tun Hussein Onn',
  CJY:  'Ebright Cyberjaya',
  DA:   'Ebright Denai Alam',
  DK:   'Ebright Danau Kota',
  DPU:  'Ebright Dataran Puchong Utama',
  EGR:  'Ebright Eco Grandeur',
  KD:   'Ebright Kota Damansara',
  KLG:  'Ebright Klang',
  KTG:  'Ebright Kajang TTDI Groove',
  KW:   'Ebright Kota Warisan',
  ONL:  'Ebright Online',
  PJY:  'Ebright Putrajaya',
  RBY:  'Ebright Rimbayu',
  SA:   'Ebright Setia Alam',
  SHA:  'Ebright Shah Alam',
  SP:   'Ebright Sri Petaling',
  ST:   'Ebright Subang Taipan',
  TSG:  'Ebright Taman Sri Gombak',
};
```

Sourced from `frontend/src/lib/okr/constants.ts` (`REGIONS` array). Codes that appear in `finance_renewals` but are not in this mapping are silently ignored (their renewal totals would not be attributable to a known branch).

### Component 2: `FinanceBranchRevenueRenewalsPage.tsx` (new page)

**Location:** `frontend/src/pages/FinanceBranchRevenueRenewalsPage.tsx`.

**Built by:** Copying `BranchRankingPage.tsx` and modifying:
- Page title: `"Branch Revenue & Renewals"`
- API call: `/api/finance/branch-revenue-renewals` (new endpoint)
- Bar rendering: each row now shows a two-segment bar instead of a single-color bar
- Right column: shows total revenue (primary) and renewal amount (secondary, below)
- Header total row: shows total revenue + total renewal contribution
- All other UI (filter controls, tier labels on the right, refresh button, freshness behaviour) stays identical

**Two-segment bar rendering:**

For each branch row, replace the existing single bar `<div>` with two side-by-side `<div>`s inside a flex container:

- Gold segment: `width = (renewal / total) * 100%`, background gold (suggested `#fbbf24`)
- Tier-colored segment: `width = ((total - renewal) / total) * 100%`, background = existing tier color logic from BranchRankingPage

If `renewal === 0` or `total === 0`, render only the tier-colored segment (no gold).

**Right column for each row:**

```
RM 91,687.86            ← total revenue, large/primary text
renewal: RM 25,368.46   ← renewal portion, smaller/secondary text
```

### Component 3: Routing and tile

**`frontend/src/App.tsx`** — add route:

```jsx
<Route path="/finance/branch-revenue-renewals" element={<FinanceBranchRevenueRenewalsPage />} />
```

**`frontend/src/pages/DashboardHomePage.tsx`** — add tile inside the Finance section card, after the existing "Renewal by Branch" tile.

## Data flow

1. User clicks "Branch Revenue & Renewals" tile → routes to `/finance/branch-revenue-renewals`.
2. Page loads with default filter (Last Month) → fires `GET /api/finance/branch-revenue-renewals?date_from=...&date_to=...`.
3. Endpoint runs two queries in parallel:
   - Revenue from `view_ebright_invoices` (live view, no caching).
   - Renewals from `finance_renewals` (kept fresh by the existing 15-min cron).
4. Endpoint joins the two in JS using `BRANCH_CODE_TO_FULL_NAME` and returns combined response.
5. Frontend renders 20 rows with two-tone bars and dual amount labels.
6. User changes filter → re-fetch → re-render.

## Error handling

- **Branch in revenue but missing from `BRANCH_CODE_TO_FULL_NAME`** → row renders with `renewal: 0` (silently safe).
- **Branch in `finance_renewals` but not in the top-20 revenue list** → its renewal data is dropped (the chart is anchored to the top-20 by revenue, by design).
- **Either query fails** → endpoint returns `next(err)` consistent with the existing pattern in `finance.js`. Frontend falls back to the existing error UI from `BranchRankingPage`.
- **All renewal amounts = 0 in selected period** → page renders normally; all bars show only the tier color (no gold); header shows `Total Renewals: RM 0.00`.

## Testing

- **Unit:** No test framework in use; covered by manual verification.
- **Manual verification:**
  - Hit endpoint directly with `curl`, confirm JSON shape matches the contract.
  - Open the new page in browser. For 2–3 branches, confirm:
    - The total revenue matches what `/branch-ranking` shows for the same branch + period.
    - The renewal amount matches what `/renewal-by-branch` shows for the same branch + period.
  - Verify default filter loads correctly (Last Month).
  - Verify branch dropdown filtering works.
  - Verify Refresh button works and updates the freshness indicator (if present).
- **Regression check:** Open existing Branch Ranking and Renewal by Branch pages — both should look unchanged.

## Verification & rollout

This change has no migration, no cron, no schema modification. Pure code addition.

**Phase 1 (local dev):**
- Implement endpoint and page.
- Test locally as above.

**Phase 2 (staging):**
- Bundle with the existing finance_renewals work (already on staging).
- Push master → origin/staging.
- Verify on `staging-dashboard.ebright.my/finance/branch-revenue-renewals`.

**Phase 3 (production):**
- Push everything (finance_renewals + this card) to origin/master in a single push.
- Brief production restart window (~30–90s of 502).
- Verify on `dashboard.ebright.my/finance/branch-revenue-renewals`.

**Rollback:** delete the two new files, revert the App.tsx and DashboardHomePage.tsx changes — no data side-effects since this change is read-only.

## Open questions

None at design time.
