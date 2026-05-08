# Renewal Ranking Graph — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a Graph view to `/finance/renewal-by-branch` that ranks all 20 branches by renewal revenue (default) or renewal count, with a Table↔Graph toggle button beside "Last Month" and a capture-to-PNG button for sharing.

**Architecture:** Add `branch_name` to the existing `/api/finance/renewal-by-branch` SQL (one extra column, additive). On the frontend, extend `FinanceRenewalByBranchPage.tsx` with `viewMode: 'table' | 'graph'` state and a `graphMetric: 'revenue' | 'count'` toggle, conditionally rendering either the existing table or a new inline graph block. The graph reuses the `getBarColor` HSL gradient and `toPng`-based capture flow from `BranchRankingPage`. All colors route through the existing CSS variables for dark-mode parity.

**Tech Stack:** React 18 + TypeScript, @tanstack/react-query, html-to-image (already in `frontend/package.json`), Express, PostgreSQL (`pg` pool).

**Spec:** [`docs/superpowers/specs/2026-05-07-renewal-ranking-graph-design.md`](../specs/2026-05-07-renewal-ranking-graph-design.md)

---

## File Structure

| File | Action | Purpose |
|---|---|---|
| `backend/src/routes/finance.js` | Modify | Add `bm.branch_name` to the SELECT in the `/renewal-by-branch` handler and to the JS response mapping. |
| `frontend/src/pages/FinanceRenewalByBranchPage.tsx` | Modify | Extend `RenewalData` type with `branch_name`. Add `viewMode` + `graphMetric` state. Add Table/Graph toggle button in the QUICK SELECT row. Render either the existing table or a new graph block. Add Capture button + clipboard logic. |
| `frontend/src/App.css` | Modify | Append a `.renewalGraph` block (rows, bar tracks, bar fills, metric toggle, ranks, value labels). All theme-aware via existing CSS vars. |

No new files. No new dependencies. No new routes.

---

## Task 1: Add `branch_name` to the `/renewal-by-branch` API response

**Files:**
- Modify: `backend/src/routes/finance.js` (the `financeRouter.get('/renewal-by-branch', …)` handler — currently around lines 95–145)

The existing query already LEFT JOINs `branch_map_autocount bm` against `finance_renewals fr`. We just need to surface `bm.branch_name` in the SELECT and pass it through in the JS mapping.

- [ ] **Step 1: Add `bm.branch_name` to the SELECT clause and `GROUP BY`**

Find the SQL block in `backend/src/routes/finance.js` that starts with `SELECT bm.branch_code,` (inside the `/renewal-by-branch` handler).

Replace:

```js
    const result = await pool.query(`
      SELECT
        bm.branch_code,
        COUNT(*) FILTER (WHERE fr.package = '3M')                     AS count_3m,
        COUNT(*) FILTER (WHERE fr.package = '6M')                     AS count_6m,
        COUNT(*) FILTER (WHERE fr.package = '9M')                     AS count_9m,
        COUNT(*) FILTER (WHERE fr.package = '12M')                    AS count_12m,
        COUNT(fr.id)                                                  AS total_renewals,
        COALESCE(SUM(fr.amount) FILTER (WHERE fr.package = '3M'),  0) AS total_3m,
        COALESCE(SUM(fr.amount) FILTER (WHERE fr.package = '6M'),  0) AS total_6m,
        COALESCE(SUM(fr.amount) FILTER (WHERE fr.package = '9M'),  0) AS total_9m,
        COALESCE(SUM(fr.amount) FILTER (WHERE fr.package = '12M'), 0) AS total_12m,
        COALESCE(SUM(fr.amount), 0)                                   AS grand_total
      FROM branch_map_autocount bm
      LEFT JOIN finance_renewals fr
        ON fr.branch_code = bm.branch_code
        AND fr.doc_date >= $1
        AND fr.doc_date <= $2
      GROUP BY bm.branch_code
      ORDER BY bm.branch_code
    `, [startDate, endDate]);
```

with:

```js
    const result = await pool.query(`
      SELECT
        bm.branch_code,
        bm.branch_name,
        COUNT(*) FILTER (WHERE fr.package = '3M')                     AS count_3m,
        COUNT(*) FILTER (WHERE fr.package = '6M')                     AS count_6m,
        COUNT(*) FILTER (WHERE fr.package = '9M')                     AS count_9m,
        COUNT(*) FILTER (WHERE fr.package = '12M')                    AS count_12m,
        COUNT(fr.id)                                                  AS total_renewals,
        COALESCE(SUM(fr.amount) FILTER (WHERE fr.package = '3M'),  0) AS total_3m,
        COALESCE(SUM(fr.amount) FILTER (WHERE fr.package = '6M'),  0) AS total_6m,
        COALESCE(SUM(fr.amount) FILTER (WHERE fr.package = '9M'),  0) AS total_9m,
        COALESCE(SUM(fr.amount) FILTER (WHERE fr.package = '12M'), 0) AS total_12m,
        COALESCE(SUM(fr.amount), 0)                                   AS grand_total
      FROM branch_map_autocount bm
      LEFT JOIN finance_renewals fr
        ON fr.branch_code = bm.branch_code
        AND fr.doc_date >= $1
        AND fr.doc_date <= $2
      GROUP BY bm.branch_code, bm.branch_name
      ORDER BY bm.branch_code
    `, [startDate, endDate]);
```

The `GROUP BY bm.branch_code, bm.branch_name` is required because `branch_name` is not aggregated and must appear in `GROUP BY` (Postgres rule). Since `branch_code` is already `bm`'s primary key, `branch_name` is functionally dependent — Postgres will accept this without further aggregation.

- [ ] **Step 2: Add `branch_name` to the JS response mapping**

In the same handler, find the `result.rows.map(r => ({ … }))` block. Add `branch_name` as the second field after `branch_code`:

Replace:

```js
    const data = result.rows.map(r => ({
      branch_code:    r.branch_code,
      count_3m:       Number(r.count_3m),
```

with:

```js
    const data = result.rows.map(r => ({
      branch_code:    r.branch_code,
      branch_name:    r.branch_name,
      count_3m:       Number(r.count_3m),
```

- [ ] **Step 3: Restart backend and verify the response shape**

Restart the backend dev server (kill and re-run whatever runs `backend/src/server.js` — typically `npm run dev` from the `backend/` directory).

Run from any terminal:

```bash
curl -s "http://localhost:5175/api/finance/renewal-by-branch?month=5&year=2026" | head -c 600
```

(Adjust the port if the backend runs elsewhere — check `backend/src/server.js` for the listen port.)

Expected: the JSON includes `"branch_name":"Ebright …"` next to each `"branch_code"`. All 20 branches present.

- [ ] **Step 4: Commit**

```bash
git add backend/src/routes/finance.js
git commit -m "feat(finance): include branch_name in /renewal-by-branch response

Adds bm.branch_name to the SELECT/GROUP BY so the upcoming Renewal
Ranking graph can label bars with full branch names. Additive — the
existing table view ignores the new field."
```

---

## Task 2: Extend the frontend `RenewalData` type

**Files:**
- Modify: `frontend/src/pages/FinanceRenewalByBranchPage.tsx` (the `RenewalData` type at the top of the file)

- [ ] **Step 1: Add `branch_name` to the `RenewalData` type**

Replace:

```ts
type RenewalData = {
  branch_code: string;
  count_3m: number; count_6m: number; count_9m: number; count_12m: number;
  total_3m: number; total_6m: number; total_9m: number; total_12m: number;
  total_renewals: number;
  grand_total: number;
};
```

with:

```ts
type RenewalData = {
  branch_code: string;
  branch_name: string;
  count_3m: number; count_6m: number; count_9m: number; count_12m: number;
  total_3m: number; total_6m: number; total_9m: number; total_12m: number;
  total_renewals: number;
  grand_total: number;
};
```

- [ ] **Step 2: Verify the page still loads**

Open `localhost:5174/finance/renewal-by-branch` in the browser. The table should render exactly as before (no UI change yet — type is only consumed in upcoming tasks). No TypeScript errors in the IDE.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/pages/FinanceRenewalByBranchPage.tsx
git commit -m "feat(finance): extend RenewalData type with branch_name"
```

---

## Task 3: Add the `.renewalGraph` CSS block

**Files:**
- Modify: `frontend/src/App.css` (append after the existing `.renewalBranchTable` rules — search for `.renewalBranchTable th.sortable:hover` and append directly after the closing `}`)

- [ ] **Step 1: Append the CSS**

Find this rule in `frontend/src/App.css`:

```css
.renewalBranchTable th.sortable:hover {
  background: var(--border);
}
```

Immediately after it, add:

```css
/* --- Renewal Ranking Graph --- */
.renewalGraph {
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.renewalGraphHeader {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 12px;
  gap: 12px;
  flex-wrap: wrap;
}
.renewalGraphMetricToggle {
  display: inline-flex;
  border: 1px solid var(--border);
  border-radius: 8px;
  overflow: hidden;
}
.renewalGraphMetricToggle button {
  background: transparent;
  border: none;
  padding: 6px 14px;
  font-size: 13px;
  font-weight: 600;
  color: var(--textSecondary);
  cursor: pointer;
  transition: background 0.15s, color 0.15s;
}
.renewalGraphMetricToggle button.active {
  background: var(--brand);
  color: #fff;
}
.renewalGraphMetricToggle button:not(.active):hover {
  background: var(--borderLight);
  color: var(--text);
}
.renewalGraphRow {
  display: grid;
  grid-template-columns: 48px 220px 1fr 140px;
  align-items: center;
  gap: 12px;
  padding: 6px 8px;
  border-bottom: 1px solid var(--borderLight);
}
.renewalGraphRow.zeroRow {
  opacity: 0.55;
}
.renewalGraphRank {
  font-size: 13px;
  font-weight: 700;
  color: var(--textSecondary);
  text-align: right;
}
.renewalGraphName {
  font-size: 13px;
  color: var(--text);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.renewalGraphTrack {
  position: relative;
  height: 22px;
  background: var(--borderLight);
  border-radius: 4px;
  overflow: hidden;
}
.renewalGraphFill {
  height: 100%;
  border-radius: 4px;
  transition: width 0.35s ease;
}
.renewalGraphValue {
  font-size: 13px;
  font-weight: 600;
  color: var(--text);
  text-align: right;
  font-variant-numeric: tabular-nums;
}
.renewalGraphRow.zeroRow .renewalGraphValue {
  color: var(--muted);
}
.renewalGraphCaptureToast {
  position: fixed;
  bottom: 24px;
  left: 50%;
  transform: translateX(-50%);
  background: var(--panel);
  color: var(--text);
  border: 1px solid var(--border);
  padding: 10px 18px;
  border-radius: 8px;
  font-size: 13px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
  z-index: 9999;
}
```

- [ ] **Step 2: Verify CSS compiles**

Save the file. The Vite dev server will hot-reload. Open the existing `/finance/renewal-by-branch` page — table should look unchanged. No new visual elements yet (CSS classes aren't used until Task 5).

- [ ] **Step 3: Commit**

```bash
git add frontend/src/App.css
git commit -m "feat(finance): add CSS for upcoming Renewal Ranking graph view"
```

---

## Task 4: Add view-mode state and the Table/Graph toggle button

**Files:**
- Modify: `frontend/src/pages/FinanceRenewalByBranchPage.tsx`

- [ ] **Step 1: Add `viewMode` and `graphMetric` state**

Find the existing state block near the top of the component (the `useState` calls for `selectedMonth`, `selectedYear`, `selectedBranch`, `sortBy`, `sortDir`). Directly after `setSortDir`, add two new state hooks:

```ts
  const [viewMode, setViewMode] = useState<'table' | 'graph'>('table');
  const [graphMetric, setGraphMetric] = useState<'revenue' | 'count'>('revenue');
```

The full state block should now read (in order): `selectedMonth`, `selectedYear`, `selectedBranch`, `sortBy`, `sortDir`, `viewMode`, `graphMetric`.

- [ ] **Step 2: Add the toggle button beside "Last Month"**

Find the closing `</button>` of the "Last Month" button inside the QUICK SELECT row. Directly after that closing `</button>` and before the closing `</div>` of the inner flex container, add:

```tsx
    {/* TABLE / GRAPH TOGGLE */}
    <button
      className="btn btnSmall btnSecondary"
      onClick={() => setViewMode(viewMode === 'table' ? 'graph' : 'table')}
      style={{ marginLeft: '4px' }}
    >
      {viewMode === 'table' ? '📊 Graph' : '📋 Table'}
    </button>
```

- [ ] **Step 3: Verify the toggle button shows**

Reload the page. A third button now appears in QUICK SELECT, after "Last Month", labeled `📊 Graph`. Click it — label flips to `📋 Table`. (Nothing else changes yet — graph render is in Task 5.) Click again — flips back.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/pages/FinanceRenewalByBranchPage.tsx
git commit -m "feat(finance): add Table/Graph view toggle button"
```

---

## Task 5: Render the graph block conditionally

**Files:**
- Modify: `frontend/src/pages/FinanceRenewalByBranchPage.tsx`

This task replaces the unconditional table render with a conditional that flips between table and graph based on `viewMode`. The existing table block stays exactly as-is — it just gets wrapped.

- [ ] **Step 1: Add a `getBarColor` helper near the other helpers at top of file**

Find the existing `getRelativeTime` helper (just above `export default function FinanceRenewalByBranchPage()`). Directly after the `getRelativeTime` closing `};`, add:

```ts
const getBarColor = (rank: number, total: number) => {
  const t = total <= 1 ? 0 : rank / (total - 1);
  const hue = Math.round(142 * (1 - t));
  const sat = Math.round(71 + 13 * t);
  const lig = Math.round(45 + 10 * t);
  return `hsl(${hue}, ${sat}%, ${lig}%)`;
};
```

This is the identical gradient used by `BranchRankingPage` — duplicated here intentionally to keep this page self-contained.

- [ ] **Step 2: Add a `graphRows` memo that ranks the filtered rows**

Find the existing `sortedRows` useMemo (used by the table). Directly after the closing `}, [rows, sortBy, sortDir]);` of that block, add a new memo:

```ts
  // Rank rows for the graph view by the active metric, descending. Ties broken
  // by branch name asc so the ordering is stable for screenshots.
  const graphRows = useMemo(() => {
    const key = graphMetric === 'revenue' ? 'grand_total' : 'total_renewals';
    return [...rows].sort((a, b) => {
      const av = Number(a[key]);
      const bv = Number(b[key]);
      if (av === bv) return a.branch_name.localeCompare(b.branch_name);
      return bv - av;
    });
  }, [rows, graphMetric]);

  const graphMax = useMemo(() => {
    const key = graphMetric === 'revenue' ? 'grand_total' : 'total_renewals';
    return graphRows.reduce((m, r) => Math.max(m, Number(r[key])), 0);
  }, [graphRows, graphMetric]);
```

`graphMax` is the largest value across the visible branches — used to scale bar widths. If everyone has zero, `graphMax` is `0` and bars render at 0 width (handled in Step 4).

- [ ] **Step 3: Wrap the existing table block in a `viewMode === 'table'` conditional**

Find this line in the JSX (inside the `{isLoading ? … : isError ? … : ( … )}` block):

```tsx
        <div className="card overflow-x-auto">
          <table className="brRankBarTable renewalBranchTable w-full text-left border-collapse">
```

Replace just the opening `<div className="card overflow-x-auto">` line with:

```tsx
        viewMode === 'table' ? (
        <div className="card overflow-x-auto">
          <table className="brRankBarTable renewalBranchTable w-full text-left border-collapse">
```

Then find the matching `</div>` that closes that `card overflow-x-auto` div (it sits right after the closing `</table>` — currently the line that reads `        </div>` immediately before the closing `      )}` of the isLoading/isError ternary). Replace just that `</div>` with:

```tsx
        </div>
        ) : (
          /* GRAPH VIEW — placeholder, filled in next step */
          <div className="card" style={{ padding: '20px' }}>
            <p>Graph view (TBD)</p>
          </div>
        )
```

> **Note:** the `(TBD)` placeholder is intentional — it disappears in Step 4. Do not commit yet.

- [ ] **Step 4: Replace the placeholder graph block with the real graph**

Replace this temporary placeholder:

```tsx
          /* GRAPH VIEW — placeholder, filled in next step */
          <div className="card" style={{ padding: '20px' }}>
            <p>Graph view (TBD)</p>
          </div>
```

with:

```tsx
          <div className="card" style={{ padding: '20px' }} ref={graphCaptureRef}>
            <div className="renewalGraphHeader">
              <div className="renewalGraphMetricToggle" data-no-capture>
                <button
                  className={graphMetric === 'revenue' ? 'active' : ''}
                  onClick={() => setGraphMetric('revenue')}
                >
                  💰 Revenue (RM)
                </button>
                <button
                  className={graphMetric === 'count' ? 'active' : ''}
                  onClick={() => setGraphMetric('count')}
                >
                  🔢 Renewal Count
                </button>
              </div>
              <button
                className="btn btnSmall"
                onClick={captureGraph}
                data-no-capture
              >
                📷 Capture
              </button>
            </div>
            <div className="renewalGraph">
              {graphRows.map((row, i) => {
                const value = graphMetric === 'revenue'
                  ? Number(row.grand_total)
                  : Number(row.total_renewals);
                const isZero = value === 0;
                const widthPct = graphMax > 0 ? (value / graphMax) * 100 : 0;
                const display = graphMetric === 'revenue'
                  ? formatRM(value)
                  : `${value} renewal${value === 1 ? '' : 's'}`;
                return (
                  <div
                    key={row.branch_code}
                    className={`renewalGraphRow${isZero ? ' zeroRow' : ''}`}
                  >
                    <div className="renewalGraphRank">#{i + 1}</div>
                    <div className="renewalGraphName" title={row.branch_name}>
                      {row.branch_name || row.branch_code}
                    </div>
                    <div className="renewalGraphTrack">
                      <div
                        className="renewalGraphFill"
                        style={{
                          width: `${widthPct}%`,
                          background: isZero
                            ? 'transparent'
                            : getBarColor(i, graphRows.length),
                        }}
                      />
                    </div>
                    <div className="renewalGraphValue">{display}</div>
                  </div>
                );
              })}
            </div>
          </div>
```

This block references `graphCaptureRef` and `captureGraph` — both will be defined in Task 6. The page will fail to compile until Task 6 is done; that's expected, do not commit yet.

- [ ] **Step 5: Hold commit until Task 6 completes**

The graph JSX depends on `graphCaptureRef` and `captureGraph`, which Task 6 introduces. Move directly to Task 6.

---

## Task 6: Wire up capture-to-PNG

**Files:**
- Modify: `frontend/src/pages/FinanceRenewalByBranchPage.tsx`

- [ ] **Step 1: Update imports to add `useRef`, `useCallback`, and `toPng`**

Replace the existing import lines at the top of the file:

```ts
import React, { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '../lib/api';
import { BackButton } from '../components/BackButton';
```

with:

```ts
import React, { useMemo, useState, useRef, useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import { toPng } from 'html-to-image';
import { apiFetch } from '../lib/api';
import { BackButton } from '../components/BackButton';
```

- [ ] **Step 2: Add the ref and toast state inside the component**

Just before the `viewMode` state line (added in Task 4), add:

```ts
  const graphCaptureRef = useRef<HTMLDivElement | null>(null);
  const [captureToast, setCaptureToast] = useState<string | null>(null);
```

The full state ordering is now: `selectedMonth`, `selectedYear`, `selectedBranch`, `sortBy`, `sortDir`, `graphCaptureRef`, `captureToast`, `viewMode`, `graphMetric`.

- [ ] **Step 3: Add the `captureGraph` callback**

Find the existing `handleLastMonth` function. Directly after its closing `};`, add:

```ts
  const showCaptureToast = (msg: string) => {
    setCaptureToast(msg);
    setTimeout(() => setCaptureToast(null), 2500);
  };

  const captureGraph = useCallback(async () => {
    if (!graphCaptureRef.current) {
      showCaptureToast('⚠️ Chart not ready');
      return;
    }
    showCaptureToast('⏳ Capturing…');

    let dataUrl: string;
    try {
      dataUrl = await toPng(graphCaptureRef.current, {
        backgroundColor:
          document.documentElement.getAttribute('data-theme') === 'dark'
            ? '#161b2b'
            : '#ffffff',
        pixelRatio: 2,
        filter: (node: HTMLElement) => !(node as HTMLElement)?.dataset?.noCapture,
      });
    } catch (err) {
      showCaptureToast(`⚠️ Render failed: ${(err as Error).message}`);
      return;
    }

    const filename = `renewal-ranking-${selectedYear}-${String(selectedMonth).padStart(2, '0')}.png`;

    if (typeof ClipboardItem !== 'undefined' && navigator.clipboard?.write) {
      try {
        const res = await fetch(dataUrl);
        const blob = await res.blob();
        await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
        showCaptureToast('📋 Copied to clipboard!');
        return;
      } catch {
        // fall through to download
      }
    }

    const a = document.createElement('a');
    a.href = dataUrl;
    a.download = filename;
    a.click();
    showCaptureToast('📥 Downloaded!');
  }, [selectedMonth, selectedYear]);
```

- [ ] **Step 4: Render the toast**

Find the outermost `return (` block of the component. Directly inside the opening `<div className="branchRankingPage">`, before the existing `<div className="pageHeader">`, add:

```tsx
      {captureToast && (
        <div className="renewalGraphCaptureToast">{captureToast}</div>
      )}
```

- [ ] **Step 5: Verify the graph + capture flow end-to-end**

Reload the page (`/finance/renewal-by-branch`). Verify:

1. Default view is the Table — looks identical to before.
2. Click `📊 Graph`. The graph renders. All 20 branches present, full names, sorted by Grand Total (RM) desc. Bars colored green→amber by rank. Zero-revenue branches at the bottom with empty bars and muted text.
3. Click `🔢 Renewal Count`. Order updates — top branch is the one with most renewals (e.g. CJY = 4 for May 2026). Bars use renewal count as the metric, value labels read e.g. "4 renewals".
4. Click `💰 Revenue (RM)`. Order flips back to revenue ranking.
5. Click `📷 Capture`. Toast `⏳ Capturing…` appears, then `📋 Copied to clipboard!`. Paste (Ctrl+V) into Slack/Notes — verify the PNG shows just the graph card (no filter bar, no header, no `Capture` button itself).
6. Toggle dark mode (whatever switch the dashboard uses). Re-capture — background of the PNG flips to dark navy `#161b2b`.
7. Filter to a single branch — graph shows one bar.
8. Click `📋 Table` — flips back to Table view, no errors.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/pages/FinanceRenewalByBranchPage.tsx
git commit -m "feat(finance): add Renewal Ranking graph view with capture-to-PNG

Adds a Table/Graph toggle to /finance/renewal-by-branch. The graph
ranks all 20 branches by renewal revenue (default) or count, with
zero-value branches visible-but-muted at the bottom. Bar gradient
matches Branch Ranking. Capture button copies PNG to clipboard
(downloads as fallback)."
```

---

## Task 7: Manual verification on staging, then promote to production

**Files:** None

- [ ] **Step 1: Push to staging**

```bash
git push origin master:staging
```

> If your local `master` and `staging` aren't aligned, push whatever branch holds these commits to `staging` instead. Check the deploy memory: `staging` branch auto-deploys to `staging-dashboard.ebright.my`.

- [ ] **Step 2: Smoke-test on staging**

Open `https://staging-dashboard.ebright.my/finance/renewal-by-branch`. Repeat the Task 6 Step 5 verification list against staging:

1. Table loads, all 20 branches.
2. Graph toggle works.
3. Metric toggle works.
4. Capture works (try in both Chrome and whatever your team uses — Safari's Clipboard API is stricter).
5. Dark mode looks correct.
6. Filters apply to both views.

- [ ] **Step 3: Promote to production**

If staging looks good:

```bash
git push origin master
```

`master` auto-deploys to `dashboard.ebright.my` (production). Confirm with one quick visual check on the production URL.

---

## Self-Review

**Spec coverage:**
- ✅ Toggle on same page, button beside Last Month → Task 4
- ✅ Metric toggle (Revenue default, Count alt) → Task 5 step 4 + Task 4 state
- ✅ All 20 branches always shown, including zeros → Task 5 step 4 (`graphRows = [...rows]`, no filtering)
- ✅ Sorted highest → lowest → Task 5 step 2 (`graphRows` memo)
- ✅ Zero-value rows visible but muted → Task 5 step 4 (`zeroRow` class) + Task 3 CSS (`opacity: 0.55`)
- ✅ Bar color gradient matching Branch Ranking → Task 5 step 1 (identical `getBarColor`)
- ✅ Branch full names from `branch_map_autocount.branch_name` → Task 1 (backend) + Task 2 (type) + Task 5 step 4 (render)
- ✅ Capture-to-PNG with clipboard + download fallback → Task 6
- ✅ Theme-aware in dark mode → Task 3 CSS uses CSS vars, Task 6 capture uses theme attr
- ✅ Reuses existing endpoint → Task 1 only adds one column
- ✅ No new routes, no tier badges, no jackpot → confirmed not in plan

**Placeholder scan:** the `(TBD)` placeholder in Task 5 Step 3 is replaced in Step 4 within the same task — no commit happens between them. No other placeholders.

**Type consistency:** `RenewalData.branch_name` is added in Task 2 and consumed in Task 5 Step 2 (`a.branch_name.localeCompare(b.branch_name)`) and Step 4 (`row.branch_name`). `viewMode` and `graphMetric` types are consistent throughout. `graphCaptureRef` typed as `HTMLDivElement | null` and used on a `<div>`.

No issues found. Plan is complete.
