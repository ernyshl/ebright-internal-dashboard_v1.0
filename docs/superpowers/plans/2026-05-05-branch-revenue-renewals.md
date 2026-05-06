# Branch Revenue & Renewals Card Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a Finance section card showing top-20 branches with two-tone horizontal bars (gold = renewal portion, tier-color = rest of revenue).

**Architecture:** New `GET /api/finance/branch-revenue-renewals` endpoint runs two parallel SQL queries (revenue from `view_ebright_invoices`, renewals from `finance_renewals`), joins them in JS using a constant `BRANCH_CODE_TO_FULL_NAME` mapping, and returns a single combined response. Frontend adds a new page (copy of `BranchRankingPage.tsx` with modified bar rendering and right-column display) plus one new route and one new dashboard tile.

**Tech Stack:** Node.js, Express, PostgreSQL (pg pool), React, @tanstack/react-query.

**Spec:** [`docs/superpowers/specs/2026-05-05-branch-revenue-renewals-design.md`](../specs/2026-05-05-branch-revenue-renewals-design.md)

---

## File Structure

| File | Action | Purpose |
|---|---|---|
| `backend/src/routes/finance.js` | Modify (append) | Add `GET /api/finance/branch-revenue-renewals` endpoint |
| `frontend/src/pages/FinanceBranchRevenueRenewalsPage.tsx` | Create | New page — based on `BranchRankingPage.tsx` with two-tone bars and dual right-column amounts |
| `frontend/src/App.tsx` | Modify | Add route `/finance/branch-revenue-renewals` |
| `frontend/src/pages/DashboardHomePage.tsx` | Modify | Add "Branch Revenue & Renewals" tile in Finance section |

No backend schema changes. No new tables, indexes, migrations, or cron jobs. The new endpoint reuses `finance_renewals` (already populated by `refreshFinanceRenewals.js`) and `view_ebright_invoices` (existing live view).

---

## Task 1: Add the new backend endpoint

**Files:**
- Modify: `backend/src/routes/finance.js` (append a new route handler before `module.exports`)

The new endpoint runs two parallel queries and joins them in JS using a constant mapping table from short branch codes (e.g. `'PJY'`) to full branch names (e.g. `'Ebright Putrajaya'`). Auth and role middleware are already applied to `financeRouter` at the top of the file (lines 8-9), so the new route inherits them automatically.

- [ ] **Step 1: Read the bottom of the file**

Read `backend/src/routes/finance.js` from line 160 to the end. Confirm the file ends with `module.exports = financeRouter;` (or similar). Identify the exact line just before `module.exports = ...` — that is where the new route goes.

- [ ] **Step 2: Insert the new endpoint block**

Insert the following block IMMEDIATELY BEFORE the `module.exports = financeRouter;` line:

```javascript
// Branch Revenue & Renewals — combines per-branch revenue (view_ebright_invoices)
// with per-branch renewal totals (finance_renewals). See
// docs/superpowers/specs/2026-05-05-branch-revenue-renewals-design.md
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

financeRouter.get('/branch-revenue-renewals', async (req, res, next) => {
  try {
    const { date_from, date_to, branch } = req.query;

    const dateConditions = [];
    const params = [];
    let idx = 1;

    if (date_from) {
      dateConditions.push(`DATE(doc_date + INTERVAL '8 hours') >= $${idx++}`);
      params.push(date_from);
    }
    if (date_to) {
      dateConditions.push(`DATE(doc_date + INTERVAL '8 hours') <= $${idx++}`);
      params.push(date_to);
    }
    if (branch) {
      dateConditions.push(`branches = $${idx++}`);
      params.push(branch);
    }

    const dateWhere = dateConditions.length
      ? `AND ${dateConditions.join(' AND ')}`
      : '';

    // Query 1: Revenue per branch (top 20 by all-time revenue, LEFT JOIN filtered to period)
    const revenuePromise = pool.query(`
      WITH all_branches AS (
        SELECT branches
        FROM view_ebright_invoices
        WHERE branches IS NOT NULL
          AND branches != ''
          AND branches != 'HQ / Others'
          AND total_amount IS NOT NULL
        GROUP BY branches
        ORDER BY SUM(total_amount) DESC
        LIMIT 20
      ),
      filtered AS (
        SELECT branches, SUM(total_amount) AS total_revenue, COUNT(*) AS invoice_count
        FROM view_ebright_invoices
        WHERE branches IS NOT NULL
          AND branches != ''
          AND branches != 'HQ / Others'
          AND total_amount IS NOT NULL
          ${dateWhere}
        GROUP BY branches
      )
      SELECT
        ab.branches,
        COALESCE(f.total_revenue, 0) AS total_revenue,
        COALESCE(f.invoice_count, 0) AS invoice_count
      FROM all_branches ab
      LEFT JOIN filtered f ON f.branches = ab.branches
      ORDER BY total_revenue DESC, ab.branches ASC
    `, params);

    // Query 2: Renewal total per branch (from finance_renewals; uses date_from/date_to only)
    const renewalParams = [];
    let renewalDateWhere = '';
    if (date_from && date_to) {
      renewalParams.push(date_from, date_to);
      renewalDateWhere = `WHERE doc_date >= $1 AND doc_date <= $2`;
    } else if (date_from) {
      renewalParams.push(date_from);
      renewalDateWhere = `WHERE doc_date >= $1`;
    } else if (date_to) {
      renewalParams.push(date_to);
      renewalDateWhere = `WHERE doc_date <= $1`;
    }
    const renewalsPromise = pool.query(`
      SELECT branch_code, SUM(amount) AS renewal_total
      FROM finance_renewals
      ${renewalDateWhere}
      GROUP BY branch_code
    `, renewalParams);

    const branchListPromise = pool.query(`
      SELECT DISTINCT branches
      FROM view_ebright_invoices
      WHERE branches IS NOT NULL
        AND branches != ''
        AND branches != 'HQ / Others'
      ORDER BY branches
    `);

    const [revenueResult, renewalsResult, branchListResult] = await Promise.all([
      revenuePromise,
      renewalsPromise,
      branchListPromise,
    ]);

    // Build a lookup: full branch name → renewal total
    const renewalByFullName = {};
    for (const row of renewalsResult.rows) {
      const fullName = BRANCH_CODE_TO_FULL_NAME[row.branch_code];
      if (fullName) {
        renewalByFullName[fullName] = parseFloat(row.renewal_total) || 0;
      }
    }

    const branches = revenueResult.rows.map(r => ({
      branch:  r.branches,
      total:   parseFloat(r.total_revenue || 0),
      renewal: renewalByFullName[r.branches] || 0,
      count:   parseInt(r.invoice_count, 10),
    }));

    const grandTotal = branches.reduce((sum, b) => sum + b.total, 0);
    const grandRenewalTotal = branches.reduce((sum, b) => sum + b.renewal, 0);

    return res.json({
      branches,
      grandTotal,
      grandRenewalTotal,
      branchList: branchListResult.rows.map(r => r.branches),
    });
  } catch (err) {
    console.error('[finance/branch-revenue-renewals] Error:', err.message);
    return next(err);
  }
});
```

- [ ] **Step 3: Validate JS syntax**

Run:
```
cd backend && node -c src/routes/finance.js
```

Expected: zero output. If you see a `SyntaxError`, fix the change and re-run.

- [ ] **Step 4: Commit**

```
git add backend/src/routes/finance.js
git commit -m "feat(finance): add /branch-revenue-renewals endpoint"
```

---

## Task 2: Manually verify the endpoint

This task does not change code. It validates the endpoint returns the expected shape against real data before we build the frontend on top of it.

**Files:** none.

- [ ] **Step 1: Restart the backend dev server (so the new route is registered)**

```
cd backend && npm run dev
```

Watch the console for clean startup:
```
✅ DB migrations complete
[finance-refresh] Scheduler started — every 15 minutes
[finance-renewals] Scheduler started — every 15 minutes
API listening on http://0.0.0.0:4000
```

- [ ] **Step 2: Hit the endpoint with curl**

Open a browser to `dashboard.ebright.my` (or your frontend), open DevTools → Network tab, find any request, copy the Cookie header.

Then in a new terminal:
```
curl -H "Cookie: <paste-your-cookie>" "http://localhost:4000/api/finance/branch-revenue-renewals?date_from=2026-04-01&date_to=2026-04-30" | head -c 2000
```

Expected: a JSON response with `branches` (array of up to 20 objects, each with `branch`, `total`, `renewal`, `count`), `grandTotal`, `grandRenewalTotal`, and `branchList`.

For the same date range, eyeball:
- `branches[0].total` is the highest revenue value (~RM 91,687)
- For at least one branch, `renewal > 0` (e.g. `Ebright Putrajaya` should show ~RM 17,418)
- `grandRenewalTotal` is roughly RM 188,693 (the total we saw from the staging dashboard for April 2026)

If response is `401` or `403`: the auth cookie is wrong/missing — re-copy from a fresh browser request.

If `branches` array is empty: the date range has no matching data — try `2026-04-01` / `2026-04-30` (April 2026, the month we tested before).

If renewal totals are all 0: the `BRANCH_CODE_TO_FULL_NAME` mapping isn't matching. Compare `branches[0].branch` to the keys in the mapping (the full-name strings must match exactly).

- [ ] **Step 3: No commit (this task is read-only)**

---

## Task 3: Create the new frontend page

**Files:**
- Create: `frontend/src/pages/FinanceBranchRevenueRenewalsPage.tsx`

The new page is built on the same skeleton as `BranchRankingPage.tsx` with three modifications:
1. Calls the new `/api/finance/branch-revenue-renewals` endpoint
2. Each row's bar is split into two segments: gold (renewal) and tier-colored (rest)
3. The right-side amount label shows two lines: total revenue (large) and renewal portion (smaller)

- [ ] **Step 1: Create the file with this exact content**

```typescript
import { useState, useRef, useCallback } from 'react';
import { toPng } from 'html-to-image';
import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '../lib/api';
import { BackButton } from '../components/BackButton';

const JACKPOT = 80000;
const RENEWAL_COLOR = '#fbbf24'; // gold

const TIER_DEFS = [
  { label: 'Tier A', emoji: '🥇', reward: 'RM500', color: '#22c55e', size: 7 },
  { label: 'Tier B', emoji: '🥈', reward: 'RM300', color: '#f59e0b', size: 7 },
  { label: 'Tier C', emoji: '🥉', reward: 'RM100', color: '#f97316', size: 6 },
];

const MONTH_NAMES = ['January','February','March','April','May','June','July','August','September','October','November','December'];
const MONTH_SHORT = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

function formatRM(val) {
  if (val === null || val === undefined) return '—';
  return `RM${Number(val).toLocaleString('en-MY', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function getBarColor(rank, total) {
  const t = total <= 1 ? 0 : rank / (total - 1);
  const hue = Math.round(142 * (1 - t));
  const sat = Math.round(71 + 13 * t);
  const lig = Math.round(45 + 10 * t);
  return `hsl(${hue}, ${sat}%, ${lig}%)`;
}

function monthYearToDates(month, year) {
  const mm = String(month).padStart(2, '0');
  const lastDay = new Date(year, month, 0).getDate();
  return {
    date_from: `${year}-${mm}-01`,
    date_to: `${year}-${mm}-${String(lastDay).padStart(2, '0')}`,
  };
}

function getYears() {
  const cur = new Date().getFullYear();
  const arr = [];
  for (let y = cur - 2; y <= cur + 1; y++) arr.push(y);
  return arr;
}

export function FinanceBranchRevenueRenewalsPage() {
  const now = new Date();
  const [selectedMonth, setSelectedMonth] = useState(now.getMonth() + 1);
  const [selectedYear, setSelectedYear] = useState(now.getFullYear());
  const [branch, setBranch] = useState('');
  const [activePreset, setActivePreset] = useState('this_month');
  const [toast, setToast] = useState(null);
  const captureRef = useRef(null);

  const showToast = (msg) => {
    setToast(msg);
    setTimeout(() => setToast(null), 2500);
  };

  const captureToClipboard = useCallback(async () => {
    if (!captureRef.current) {
      showToast('⚠️ Chart not ready');
      return;
    }
    showToast('⏳ Capturing…');

    let dataUrl;
    try {
      dataUrl = await toPng(captureRef.current, {
        backgroundColor: document.documentElement.getAttribute('data-theme') === 'dark' ? '#161b2b' : '#ffffff',
        pixelRatio: 2,
        filter: (node) => !node?.dataset?.noCapture,
      });
    } catch (err) {
      showToast(`⚠️ Render failed: ${err.message}`);
      return;
    }

    const filename = `branch-revenue-renewals-${selectedYear}-${String(selectedMonth).padStart(2, '0')}.png`;

    if (typeof ClipboardItem !== 'undefined' && navigator.clipboard?.write) {
      try {
        const res = await fetch(dataUrl);
        const blob = await res.blob();
        await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
        showToast('📋 Copied to clipboard!');
        return;
      } catch {
        // fall through to download
      }
    }

    const a = document.createElement('a');
    a.href = dataUrl;
    a.download = filename;
    a.click();
    showToast('📥 Downloaded!');
  }, [selectedMonth, selectedYear]);

  const applyPreset = (preset) => {
    if (preset === 'this_month') {
      setSelectedMonth(now.getMonth() + 1);
      setSelectedYear(now.getFullYear());
    } else if (preset === 'last_month') {
      const d = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      setSelectedMonth(d.getMonth() + 1);
      setSelectedYear(d.getFullYear());
    }
    setActivePreset(preset);
  };

  const handleMonthChange = (e) => {
    setSelectedMonth(Number(e.target.value));
    setActivePreset(null);
  };

  const handleYearChange = (e) => {
    setSelectedYear(Number(e.target.value));
    setActivePreset(null);
  };

  const { date_from, date_to } = monthYearToDates(selectedMonth, selectedYear);
  const params = new URLSearchParams({ date_from, date_to });
  if (branch) params.set('branch', branch);

  const { data, isLoading, isError, refetch, isFetching } = useQuery({
    queryKey: ['branch-revenue-renewals', date_from, date_to, branch],
    queryFn: () => apiFetch(`/api/finance/branch-revenue-renewals?${params}`),
    staleTime: 60_000,
  });

  const branches = data?.branches || [];
  const grandTotal = data?.grandTotal || 0;
  const grandRenewalTotal = data?.grandRenewalTotal || 0;
  const branchList = data?.branchList || [];

  const maxTotal = branches.length > 0
    ? Math.max(branches[0]?.total || 0, JACKPOT * 1.05)
    : JACKPOT * 1.05;
  const jackpotPct = Math.min((JACKPOT / maxTotal) * 100, 97);

  const tierRows = [];
  let idx = 0;
  for (const tier of TIER_DEFS) {
    const tierBranches = branches.slice(idx, idx + tier.size);
    if (tierBranches.length === 0) break;
    tierRows.push({ tier, branches: tierBranches, startIdx: idx });
    idx += tierBranches.length;
  }

  const periodLabel = `${MONTH_NAMES[selectedMonth - 1]} ${selectedYear}`;

  return (
    <div className="branchRankingPage">
      <div className="pageHeader">
        <div className="backButtonContainer">
          <BackButton to="/" label="Back to Home" />
        </div>
        <div className="pageHeaderTitle">💰 Branch Revenue & Renewals</div>
        <div className="pageHeaderSub">Revenue with renewal portion · {periodLabel}</div>
        <div className="refreshButtonContainer">
          <button className="btn btnSmall" onClick={() => refetch()} disabled={isFetching}>
            {isFetching ? '⟳ Refreshing…' : '⟳ Refresh'}
          </button>
        </div>
      </div>

      <div ref={captureRef}>
      <div className="brRankFilters">
        <div className="brRankFilterGroup">
          <label className="brRankLabel">Month</label>
          <select className="filterSelect" value={selectedMonth} onChange={handleMonthChange}>
            {MONTH_SHORT.map((m, i) => (
              <option key={i} value={i + 1}>{m}</option>
            ))}
          </select>
        </div>
        <div className="brRankFilterGroup">
          <label className="brRankLabel">Year</label>
          <select className="filterSelect" value={selectedYear} onChange={handleYearChange}>
            {getYears().map(y => <option key={y} value={y}>{y}</option>)}
          </select>
        </div>
        <div className="brRankFilterGroup">
          <label className="brRankLabel">Branch</label>
          <select className="filterSelect" value={branch} onChange={e => setBranch(e.target.value)}>
            <option value="">All Branches</option>
            {branchList.map(b => <option key={b} value={b}>{b}</option>)}
          </select>
        </div>
        <div className="brRankFilterGroup">
          <label className="brRankLabel">Quick Select</label>
          <div className="brRankPresets">
            {[
              { key: 'this_month', label: 'This Month' },
              { key: 'last_month', label: 'Last Month' },
            ].map(p => (
              <button
                key={p.key}
                className={`brRankPresetBtn${activePreset === p.key ? ' active' : ''}`}
                onClick={() => applyPreset(p.key)}
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>
        <div className="brRankFilterGroup brRankTotalInline">
          <label className="brRankLabel">Total Revenue</label>
          <div className="brRankTotalValue">{isLoading ? '—' : formatRM(grandTotal)}</div>
        </div>
        <div className="brRankFilterGroup brRankTotalInline">
          <label className="brRankLabel">Total Renewals</label>
          <div className="brRankTotalValue" style={{ color: RENEWAL_COLOR }}>
            {isLoading ? '—' : formatRM(grandRenewalTotal)}
          </div>
        </div>
        <button
          className="brRankPresetBtn"
          onClick={captureToClipboard}
          disabled={isLoading}
          title="Save chart as image"
          data-no-capture="true"
        >
          📋
        </button>
      </div>

      {toast && <div className="brRankToast">{toast}</div>}

      {isLoading ? (
        <div className="card"><div className="loadingCard"><div className="loadingDots"><span /><span /><span /></div> Loading…</div></div>
      ) : isError ? (
        <div className="errorText">Failed to load branch revenue & renewals data.</div>
      ) : (
        <div className="card brRankChartCard">
          <table className="brRankBarTable">
            <tbody>
              {tierRows.map(({ tier, branches: tierBranches, startIdx }, tIdx) =>
                tierBranches.map((b, i) => {
                  const rank = startIdx + i;
                  const totalPct = b.total > 0 ? (b.total / maxTotal) * 100 : 0;
                  const renewalPct = b.total > 0 ? (b.renewal / maxTotal) * 100 : 0;
                  const restPct = Math.max(totalPct - renewalPct, 0);
                  const isJackpot = b.total >= JACKPOT;
                  const isTierFirst = i === 0 && tIdx > 0;
                  return (
                    <tr key={b.branch} className={`brRankDataRow${isTierFirst ? ' tierStart' : ''}`}>
                      <td className="brRankRankCell">
                        <span className={`brRankRankNum${rank < 3 ? ' top3' : ''}`}>
                          #{rank + 1}
                        </span>
                      </td>
                      <td className="brRankNameCell">{b.branch}</td>
                      <td className="brRankBarCell">
                        <div className="brRankBarWrap" style={{ display: 'flex', alignItems: 'center', position: 'relative' }}>
                          {b.renewal > 0 && (
                            <div
                              style={{
                                width: `${renewalPct}%`,
                                background: RENEWAL_COLOR,
                                height: '100%',
                                position: 'absolute',
                                left: 0,
                                top: 0,
                                bottom: 0,
                              }}
                            />
                          )}
                          {restPct > 0 && (
                            <div
                              className="brRankBarFill"
                              style={{
                                width: `${restPct}%`,
                                background: getBarColor(rank, branches.length),
                                position: 'absolute',
                                left: `${renewalPct}%`,
                                top: 0,
                                bottom: 0,
                              }}
                            />
                          )}
                          <div className="brRankJackpotLine" style={{ left: `${jackpotPct}%` }} />
                          <span
                            className={`brRankRevenueLabel${isJackpot ? ' brRankJackpotVal' : b.total === 0 ? ' brRankZeroVal' : ''}`}
                            style={{ left: `calc(${totalPct}% + 6px)` }}
                          >
                            {b.total === 0 ? 'RM0.00' : formatRM(b.total)}
                            {b.renewal > 0 && (
                              <span style={{
                                display: 'block',
                                fontSize: '0.78em',
                                opacity: 0.8,
                                color: RENEWAL_COLOR,
                                fontWeight: 600,
                              }}>
                                renewal: {formatRM(b.renewal)}
                              </span>
                            )}
                          </span>
                        </div>
                      </td>
                      {i === 0 && (
                        <td
                          rowSpan={tierBranches.length}
                          className="brRankTierBadgeCell"
                          style={{ '--tier-color': tier.color } as React.CSSProperties}
                        >
                          <div className="brRankTierBadgeInner">
                            <div className="brRankTierBadgeEmoji">{tier.emoji}</div>
                            <div className="brRankTierBadgeName">{tier.label}</div>
                            <div className="brRankTierBadgeReward">{tier.reward}</div>
                          </div>
                        </td>
                      )}
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Confirm there are no obvious type errors**

If your local frontend dev server is running (Vite on `npm run dev` from `frontend/`), it will hot-reload and show errors in the terminal. If you don't have it running:

```
cd frontend && npm run build
```

Expected: build succeeds. If you see TypeScript errors, fix them and re-run. The most common error class would be missing import — if you see "Cannot find module" errors, double-check imports in your file match the import paths used at the top of the file.

- [ ] **Step 3: Commit**

```
git add frontend/src/pages/FinanceBranchRevenueRenewalsPage.tsx
git commit -m "feat(finance): add Branch Revenue & Renewals page component"
```

---

## Task 4: Add the route

**Files:**
- Modify: `frontend/src/App.tsx` (add one import line and one route)

- [ ] **Step 1: Add the import**

In `frontend/src/App.tsx`, find the import line for `BranchRankingPage`:
```typescript
import { BranchRankingPage } from './pages/BranchRankingPage';
```

Add a new import line directly after it:
```typescript
import { BranchRankingPage } from './pages/BranchRankingPage';
import { FinanceBranchRevenueRenewalsPage } from './pages/FinanceBranchRevenueRenewalsPage';
```

- [ ] **Step 2: Add the route**

In the same file, find the route for `/finance/renewal-by-branch` (around line 102):
```jsx
<Route path="/finance/renewal-by-branch" element={
  <RequirePermission dashboard="finance"><FinanceRenewalByBranchPage /></RequirePermission>
} />
```

Add a new route directly after it:
```jsx
<Route path="/finance/renewal-by-branch" element={
  <RequirePermission dashboard="finance"><FinanceRenewalByBranchPage /></RequirePermission>
} />
<Route path="/finance/branch-revenue-renewals" element={
  <RequirePermission dashboard="finance"><FinanceBranchRevenueRenewalsPage /></RequirePermission>
} />
```

- [ ] **Step 3: Verify the route renders**

The Vite dev server should hot-reload. Open `http://localhost:5173/finance/branch-revenue-renewals` (or whatever port your frontend dev server uses).

Expected: the new page loads with the title "💰 Branch Revenue & Renewals" and either:
- A loading spinner, then the data table appears, OR
- An error message "Failed to load…" if the backend isn't running

If the page shows "Page Not Found": the route was added incorrectly — check the file.

- [ ] **Step 4: Commit**

```
git add frontend/src/App.tsx
git commit -m "feat(finance): wire /finance/branch-revenue-renewals route"
```

---

## Task 5: Add the dashboard tile

**Files:**
- Modify: `frontend/src/pages/DashboardHomePage.tsx`

- [ ] **Step 1: Locate the Finance section in the page**

Read `frontend/src/pages/DashboardHomePage.tsx`. Find the Finance section's `links` array (around lines 67-75 — search for the literal string `'Renewal by Branch'`).

The current code looks like:
```javascript
      icon: '💰',
      color: '#10b981',
      links: [
        { label: 'Finance Dashboard', path: '/finance', dashboard: 'finance' },
        { label: 'Branch Ranking', path: '/branch-ranking', dashboard: 'finance' },
        // ADD THIS LINE BELOW:
        { label: 'Renewal by Branch', path: '/finance/renewal-by-branch', dashboard: 'finance' }
      ]
    },
```

- [ ] **Step 2: Add the new tile after "Renewal by Branch"**

Replace the `links` array contents to add the new tile, also remove the now-misleading `// ADD THIS LINE BELOW:` comment that's pointing at the old "Renewal by Branch" addition:

```javascript
      icon: '💰',
      color: '#10b981',
      links: [
        { label: 'Finance Dashboard', path: '/finance', dashboard: 'finance' },
        { label: 'Branch Ranking', path: '/branch-ranking', dashboard: 'finance' },
        { label: 'Renewal by Branch', path: '/finance/renewal-by-branch', dashboard: 'finance' },
        { label: 'Branch Revenue & Renewals', path: '/finance/branch-revenue-renewals', dashboard: 'finance' }
      ]
    },
```

(Make sure there's a comma after the `'Renewal by Branch'` line, since it's no longer the last entry.)

- [ ] **Step 3: Verify the tile renders on dashboard home**

Open `http://localhost:5173/` (the dashboard home). The Finance section should now show four tiles:
- Finance Dashboard
- Branch Ranking
- Renewal by Branch
- Branch Revenue & Renewals

Click the new tile. It should navigate to `/finance/branch-revenue-renewals` and load the page.

- [ ] **Step 4: Commit**

```
git add frontend/src/pages/DashboardHomePage.tsx
git commit -m "feat(finance): add Branch Revenue & Renewals tile to dashboard home"
```

---

## Task 6: Manual end-to-end verification

**Files:** none.

- [ ] **Step 1: Open the new page in the browser**

Navigate to `http://localhost:5173/finance/branch-revenue-renewals`. Confirm:
- Page loads without errors
- Title shows "💰 Branch Revenue & Renewals"
- Filters work: Month / Year / Branch / Quick Select
- "This Month" preset is selected by default; clicking "Last Month" loads the previous month's data
- The 20 branch rows render with two-tone bars (gold + tier color) for branches with renewals
- For branches with `renewal = 0`, only the tier-colored bar appears (no gold)
- Right column for each row shows total revenue (large) and "renewal: RM XX,XXX.XX" (smaller, gold) when renewal > 0
- Tier badges (TIER A/B/C) on the right side of the table render same as Branch Ranking
- "Total Revenue" and "Total Renewals" appear in the filter bar header

- [ ] **Step 2: Cross-check with existing pages**

Open Branch Ranking (`/branch-ranking`) for the same month — total revenue per branch should match the values in the new page.

Open Renewal by Branch (`/finance/renewal-by-branch`) for the same month — for each branch, the per-branch grand total should match the renewal amount on the new page (allowing for the short-code → full-name mapping).

- [ ] **Step 3: Confirm no regressions**

Quickly visit:
- Finance Dashboard
- Branch Ranking
- Renewal by Branch
- Dashboard home

All should still render correctly.

- [ ] **Step 4: No commit (this task is verification)**

---

## Self-Review Notes

This plan was checked against the spec at [`docs/superpowers/specs/2026-05-05-branch-revenue-renewals-design.md`](../specs/2026-05-05-branch-revenue-renewals-design.md):

- **Component 1 (new endpoint):** Task 1 + verification in Task 2.
- **Component 2 (new page):** Task 3.
- **Component 3 (routing + tile):** Tasks 4 and 5.
- **Edge cases (branch in revenue but missing from mapping, all renewals = 0):** Handled in the endpoint code and frontend rendering — verified manually in Task 6.
- **Error handling pattern (next(err)):** Used in Task 1 endpoint; frontend uses existing `isError` pattern from BranchRankingPage template.
- **Bar rendering (two-segment with gold + tier color):** Implemented in Task 3 step 1; verified in Task 6 step 1.

No new tests because the backend has no test framework. Verification is manual via Tasks 2 and 6.

---

## Stopping Conditions (Do Not Proceed Past Task 2 If…)

- The endpoint returns wrong shape (missing fields, wrong types).
- All renewal totals come back as 0 — likely a branch-name mapping mismatch worth fixing first.
- Auth fails (401/403) — wrong cookie, fix before continuing.

---

## Bundling for staging/production push

This work bundles together with the existing finance_renewals work that was pushed to staging at commit `9cbb571`. After all tasks complete:

1. Push master → origin/staging (existing pattern: `git checkout staging && git merge master && git push origin staging && git checkout master`).
2. Verify on `staging-dashboard.ebright.my/finance/branch-revenue-renewals`.
3. When ready, push master → origin/master to deploy everything (finance_renewals + this card) to production.
