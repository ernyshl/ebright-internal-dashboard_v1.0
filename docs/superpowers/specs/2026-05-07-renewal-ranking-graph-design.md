# Renewal Ranking Graph — Design

**Date:** 2026-05-07
**Status:** Approved, ready for implementation plan
**Owner:** dina

## Background

The Renewal by Branch page at `/finance/renewal-by-branch` ([frontend/src/pages/FinanceRenewalByBranchPage.tsx](../../../frontend/src/pages/FinanceRenewalByBranchPage.tsx)) shows monthly renewals per branch in a table grouped by package length (3M / 6M / 9M / 12M), with both renewal counts and revenue (RM). The Branch Ranking page at `/branch-ranking` ([frontend/src/pages/BranchRankingPage.tsx](../../../frontend/src/pages/BranchRankingPage.tsx)) shows a horizontal bar-chart ranking of branches by **overall** revenue, with tier badges and a screenshot capture button.

Users want a similar bar-chart ranking, but specifically for **renewals** (not overall revenue), so they can see at a glance which branches lead and trail on renewal performance for the selected month.

## Goals

1. Add a Graph view of renewals on the existing Renewal by Branch page, ranked highest → lowest.
2. Let the user toggle the ranking metric between **Renewal Revenue (RM)** (default) and **Renewal Count**.
3. Show **all 20 branches** every month, including those with zero renewals.
4. Make the chart shareable (capture as PNG to clipboard, with download fallback).
5. Avoid backend rework — reuse the existing `/api/finance/renewal-by-branch` endpoint with a minimal additive change.

## Non-goals

- Tier badges (Tier A / B / C with RM rewards). Tiering belongs to the existing Branch Ranking page; duplicating it here would conflate two different reward schemes.
- Jackpot total / monthly target indicator.
- A separate route or page (e.g. `/finance/renewal-ranking`). User chose an in-page Table / Graph toggle.
- Branch-level drill-down or per-package breakdown inside the bars (the table already serves that need).
- Period comparison (this month vs last month overlay).

## User flow

```
User opens /finance/renewal-by-branch
       │
       ▼
Default Table view renders (current behavior, unchanged)
       │
       │ user clicks "📊 Graph" toggle (beside "Last Month" in Quick Select row)
       ▼
Graph view replaces the table area
       │
       │ user can flip metric: 💰 Revenue (RM) ↔ 🔢 Renewal Count
       │ user can change Month / Year / Branch filters (apply to both views)
       │ user can click "📷 Capture" to copy the chart as PNG
       │ user can click "📋 Table" to flip back
       ▼
Table view restored (state preserved)
```

## UI / UX

### Toggle placement

A single button labeled with the **target** view sits beside the "Last Month" button in the Quick Select row:

- While in Table view: button reads `📊 Graph` — click flips to Graph.
- While in Graph view: button reads `📋 Table` — click flips back.

This keeps the filter row compact and avoids a 2-button segmented control taking up extra width.

### Graph view layout

```
┌─────────────────────────────────────────────────────────────────┐
│  [💰 Revenue (RM)]  [🔢 Renewal Count]              📷 Capture  │
├─────────────────────────────────────────────────────────────────┤
│  #1  Ebright Cyberjaya         ████████████████  RM 6,168.33    │
│  #2  Ebright Bandar Baru Bangi █████████████     RM 4,880.40    │
│  #3  Ebright Kota Damansara    ██████████        RM 3,884.72    │
│  ...                                                             │
│  #19 Ebright Sri Petaling                        RM 0.00         │
│  #20 Ebright Taman Sri Gombak                    RM 0.00         │
└─────────────────────────────────────────────────────────────────┘
```

- Metric toggle: a 2-button segmented control inside the graph card, top-left.
- Capture button: top-right of the graph card.
- Bars: horizontal, full row width, each branch in its own row.
- **All 20 branches** always render — sorted by the active metric desc, ties broken by branch name asc.
- Zero-value rows: bar is drawn at zero width (empty track visible), value text rendered in the muted color, but the row stays in the rank order (so the user sees who's at the bottom and how far the gap is).
- Bar color: green-to-amber gradient by rank, using the same `hsl()` function as `BranchRankingPage.getBarColor` so the two pages feel consistent.
- Branch label: full name (`branch_map_autocount.branch_name`, e.g. "Ebright Cyberjaya"), not the code.

### Theme

All colors route through the existing CSS variables (`--text`, `--textSecondary`, `--muted`, `--border`, `--borderLight`, `--panel`) so the chart looks correct in both light and dark modes — same approach the table now uses after the recent dark-mode fix.

## Data

### API change

The existing endpoint `GET /api/finance/renewal-by-branch?month=&year=` already returns one row per branch, joined off `branch_map_autocount` LEFT JOIN `finance_renewals`. To support the full-name labels in the graph, **add `bm.branch_name` to the SELECT** and pass it through in the JS mapping. No new endpoint, no new query — one extra column.

Response shape (additive, backward compatible):

```jsonc
{
  "data": [
    {
      "branch_code": "CJY",
      "branch_name": "Ebright Cyberjaya",   // NEW
      "count_3m": 0, "count_6m": 4, "count_9m": 0, "count_12m": 0,
      "total_renewals": 4,
      "total_3m": 0, "total_6m": 6168.33, "total_9m": 0, "total_12m": 0,
      "grand_total": 6168.33
    },
    // … all 20 branches
  ]
}
```

The Table view ignores the new field; nothing breaks.

### Sorting

Frontend sorts the rows in-memory by the active metric (`grand_total` for Revenue, `total_renewals` for Count), descending, ties broken by `branch_name` ascending. Sort is recomputed via `useMemo` on metric change.

### Capture

Reuses `toPng` from `html-to-image` (already a project dependency, used by Branch Ranking). The capture target is the inner graph card only — not the filter bar or page header — keeping the screenshot tight and shareable. Background color is theme-aware (white in light mode, dark panel in dark mode), copied verbatim from `BranchRankingPage.captureToClipboard`.

## Implementation surface

| File | Change |
|---|---|
| `backend/src/routes/finance.js` | Add `bm.branch_name` to SELECT + map; ~4 lines. |
| `frontend/src/pages/FinanceRenewalByBranchPage.tsx` | Add `viewMode` and `graphMetric` state. Add toggle button. Conditionally render either the existing table or a new `<RenewalGraph>` subcomponent. Add Capture button. |
| `frontend/src/App.css` | Small block of CSS for `.renewalGraph` (bar tracks, bar fills, row layout, segmented metric toggle). Theme-aware via existing CSS vars. |

No new routes, no new endpoints, no new dependencies. The graph subcomponent stays inside `FinanceRenewalByBranchPage.tsx` — small enough that splitting into its own file would just add navigation cost.

## Edge cases & error handling

- **All 20 branches have zero renewals for the month** (rare but possible for January 1 etc.): graph renders 20 empty rows in alphabetical order, no error state. The table already handles this case the same way.
- **API returns fewer than 20 rows** (e.g. `branch_map_autocount` is missing a row): graph still renders whatever it gets, sorted normally. No padding to a fixed 20.
- **Capture fails** (clipboard API unavailable, html-to-image throws): fall back to PNG download, then show a toast — copied straight from Branch Ranking's existing handling.
- **Branch filter set to a single branch**: graph shows just that one branch as a single bar. Not particularly useful but consistent with the table's behavior, no special-casing.

## Testing

Manual verification on staging:

1. Open `/finance/renewal-by-branch`, confirm Table view loads as before with all 20 branches.
2. Click the Graph toggle. Bars render, all 20 branches present, sorted by RM Grand Total desc.
3. Flip metric to Renewal Count. Order updates, top branch is the one with the most renewals (e.g. CJY with 4).
4. Change Month to a past month. Both views update; ranking reflects the new month's data.
5. Click Capture. PNG appears in clipboard / downloads. Pasted image shows the chart only, with correct theme background.
6. Toggle dark mode. Graph remains legible — bars visible, labels readable, capture works.
7. Filter to a single branch. Graph shows one bar.
8. Switch back to Table view. State (month, year, branch filter) is preserved.

No automated tests added — the project doesn't have a frontend test setup for these page components, and the logic (sort + render) is small enough that visual verification is sufficient.

## Rollout

- Single PR covering backend additive change + frontend feature.
- Merge to `staging` first, verify on `staging-dashboard.ebright.my`, then promote to `master` for production.
- No data migration, no flag, no phased rollout — additive UI change.
