# Branch Revenue & Renewals — Diverging View Toggle Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a Stacked ⇄ Diverging view toggle to `/academy/branch-revenue-renewals` so each branch can be displayed as either the existing stacked bar or a back-to-back chart with renewal on the left and non-renewal new revenue on the right, plus per-side percentage labels.

**Architecture:** Single React component change in `AcademyBranchRevenueRenewalsPage.tsx` plus a small CSS addition in `App.css`. New `viewMode` component state controls which row layout renders. Same data, two presentations — no API or backend changes.

**Tech Stack:** React 19, TypeScript, Vite, plain CSS in `frontend/src/App.css` (Tailwind exists in deps but this page uses CSS classes from the global stylesheet).

**Important — commit policy for this plan:** The user has explicitly requested **no commits and no pushes** during implementation. They want to inspect the result locally before any git commit. Each task ends at "verify in browser". A single optional commit step is parked at the end of the plan, **gated on explicit user approval** before running.

---

## File Structure

| File | Change | Responsibility |
|---|---|---|
| `frontend/src/pages/AcademyBranchRevenueRenewalsPage.tsx` | Modify | Add `viewMode` state, toggle UI, conditional row rendering for diverging mode, and gate jackpot lines on stacked mode only |
| `frontend/src/App.css` | Modify | Add CSS rules for diverging row layout (`.brRankDivergingRow`, half-bar wrappers, center divider, percentage labels) |

No new files. No backend changes.

---

## Task 1: Add `viewMode` state and toggle UI

**Files:**
- Modify: `frontend/src/pages/AcademyBranchRevenueRenewalsPage.tsx`

This task adds the toggle but does not yet change row rendering. Diverging mode will fall back to stacked rendering until Task 3 — that's intentional for incremental verification.

- [ ] **Step 1: Add `viewMode` state**

In `AcademyBranchRevenueRenewalsPage.tsx`, find the existing `useState` block near the top of the component (around line 66-71) and add a new state line at the end of that group:

```typescript
const [viewMode, setViewMode] = useState<'stacked' | 'diverging'>('stacked');
```

The block should now read:

```typescript
const now = new Date();
const [selectedMonth, setSelectedMonth] = useState(now.getMonth() + 1);
const [selectedYear, setSelectedYear] = useState(now.getFullYear());
const [branch, setBranch] = useState('');
const [activePreset, setActivePreset] = useState<string | null>('this_month');
const [toast, setToast] = useState<string | null>(null);
const [viewMode, setViewMode] = useState<'stacked' | 'diverging'>('stacked');
const captureRef = useRef<HTMLDivElement>(null);
```

- [ ] **Step 2: Add the toggle UI to the filter bar**

In the filter bar, find the `<div className="brRankFilterGroup">` block that contains the "Quick Select" presets (around line 217-233). **Insert a new filter group immediately after it** (before the `brRankTotalInline` group). The new block:

```tsx
<div className="brRankFilterGroup">
  <label className="brRankLabel">View</label>
  <div className="brRankPresets">
    {[
      { key: 'stacked', label: 'Stacked' },
      { key: 'diverging', label: 'Diverging' },
    ].map(v => (
      <button
        key={v.key}
        className={`brRankPresetBtn${viewMode === v.key ? ' active' : ''}`}
        onClick={() => setViewMode(v.key as 'stacked' | 'diverging')}
      >
        {v.label}
      </button>
    ))}
  </div>
</div>
```

- [ ] **Step 3: Verify toggle UI in browser**

Run: `cd frontend && npm run dev`
Navigate to: `http://localhost:5174/academy/branch-revenue-renewals`

Expected:
- A new "View" filter group appears between "Quick Select" and "Total Revenue".
- Two buttons: "Stacked" (active by default, brand-colored) and "Diverging" (inactive).
- Clicking "Diverging" makes that button active, "Stacked" goes inactive. Clicking back works.
- The chart itself does **not** change yet — both modes still render the existing stacked rows. This is expected.

Stop the dev server (Ctrl+C) before moving on, or leave it running for live reload during the next tasks.

---

## Task 2: Add CSS for diverging row layout

**Files:**
- Modify: `frontend/src/App.css`

Add CSS rules that the diverging row JSX (Task 3) will use. Defining styles first lets us preview shapes with empty content in the next task.

- [ ] **Step 1: Append diverging-mode CSS rules**

Open `frontend/src/App.css`. Find the existing `.brRankJackpotLine` rule (around line 2935). **After the last `brRank*` rule in the file** (search for `brRank` and find the bottom of that block — it should be in the 2900–3000 range), append this new block:

```css
/* ─── Diverging mode (Branch Revenue & Renewals) ────────────────────────── */

.brRankDivergingRow {
  /* Replaces the .brRankBarCell width/padding behaviour. The row uses a fixed
     12-column subgrid via inline flex so it lines up across rows. */
}

.brRankDivLeftRm,
.brRankDivRightRm {
  white-space: nowrap;
  font-weight: 700;
  font-size: 0.95em;
  padding: 0 8px;
}

.brRankDivLeftRm {
  text-align: right;
  color: #9333ea; /* renewal purple */
}

.brRankDivLeftRm.zero {
  color: var(--textSecondary, #94a3b8);
  font-weight: 500;
}

.brRankDivRightRm {
  text-align: left;
}

.brRankDivBarWrap {
  position: relative;
  height: 22px;
  background: var(--border);
  border-radius: 4px;
  display: flex;
  width: 100%;
  overflow: visible;
}

.brRankDivBarLeft,
.brRankDivBarRight {
  position: relative;
  height: 100%;
  flex: 1;
  display: flex;
  align-items: stretch;
}

.brRankDivBarLeft {
  justify-content: flex-end;
  border-right: 1px solid var(--textSecondary, #94a3b8);
}

.brRankDivBarRight {
  justify-content: flex-start;
}

.brRankDivBarFillLeft {
  background: #9333ea; /* renewal purple */
  border-radius: 4px 0 0 4px;
  transition: width 0.4s ease;
  min-width: 0;
}

.brRankDivBarFillRight {
  border-radius: 0 4px 4px 0;
  transition: width 0.4s ease;
  min-width: 0;
}

.brRankDivPctLeft,
.brRankDivPctRight {
  position: absolute;
  top: 50%;
  transform: translateY(-50%);
  font-size: 0.8em;
  font-weight: 700;
  color: var(--textPrimary);
  pointer-events: none;
}

.brRankDivPctLeft {
  right: calc(50% + 6px);
}

.brRankDivPctRight {
  left: calc(50% + 6px);
}

.brRankDivPctMuted {
  color: var(--textSecondary, #94a3b8);
  font-weight: 500;
}
```

- [ ] **Step 2: Verify CSS compiles (no visual change yet)**

Save the file. If the dev server is running, Vite's HMR will reload. Open the page and confirm:
- No console errors about CSS parsing.
- Existing Stacked view still looks identical to before.
- Diverging mode (when toggled) still renders the existing stacked rows since Task 3 isn't done yet.

If the dev server isn't running, run `cd frontend && npm run build` to confirm the CSS is valid (Vite will fail the build on malformed CSS).

---

## Task 3: Implement diverging row rendering

**Files:**
- Modify: `frontend/src/pages/AcademyBranchRevenueRenewalsPage.tsx`

This is the core change. Inside the `tierRows.map(...)` body, branch on `viewMode` and render either the existing stacked row JSX or the new diverging row JSX.

- [ ] **Step 1: Locate the per-row render**

In `AcademyBranchRevenueRenewalsPage.tsx`, find the inner `tierBranches.map((b: Branch, i: number) => { ... })` block (starts around line 306). The body computes `rank`, `totalPct`, `renewalPct`, `restPct`, `highestJackpot`, `lifetimeJackpot`, `isTierFirst` and returns a `<tr>...</tr>`.

Keep all those computed values — they're used by both modes. Add three more computed values right before the `return (`:

```typescript
let renewalSharePct: number | null = b.total > 0 ? Math.round((b.renewal / b.total) * 100) : null;
let nonRenewalSharePct: number | null = b.total > 0 ? Math.round(((b.total - b.renewal) / b.total) * 100) : null;
// Correct rounding drift: when both sides are non-null and don't sum to 100,
// the LARGER side absorbs the difference.
if (renewalSharePct !== null && nonRenewalSharePct !== null && renewalSharePct + nonRenewalSharePct !== 100) {
  if (renewalSharePct >= nonRenewalSharePct) {
    renewalSharePct = 100 - nonRenewalSharePct;
  } else {
    nonRenewalSharePct = 100 - renewalSharePct;
  }
}
const nonRenewal = Math.max(b.total - b.renewal, 0);
const renewalHalfPct = b.total > 0 ? (b.renewal / maxTotal) * 100 : 0;
const nonRenewalHalfPct = b.total > 0 ? (nonRenewal / maxTotal) * 100 : 0;
```

Note `maxTotal` is the existing constant computed earlier in the component — reuse it as `sharedMax`.

- [ ] **Step 2: Wrap the existing JSX in a conditional**

Replace the existing `return (` with a conditional that picks between two row blocks. The full updated map body should look like this:

```tsx
return viewMode === 'stacked' ? (
  <tr key={b.branch} className={`brRankDataRow${isTierFirst ? ' tierStart' : ''}`}>
    {/* ... EXISTING stacked row JSX, untouched ... */}
  </tr>
) : (
  <tr key={b.branch} className={`brRankDataRow${isTierFirst ? ' tierStart' : ''}`}>
    <td className="brRankRankCell">
      <span className={`brRankRankNum${rank < 3 ? ' top3' : ''}`}>
        #{rank + 1}
      </span>
    </td>
    <td
      className="brRankNameCell"
      style={lifetimeJackpot ? { color: lifetimeJackpot.color, fontWeight: 700 } : undefined}
    >
      {b.branch}
    </td>
    <td className={`brRankDivLeftRm${b.renewal === 0 ? ' zero' : ''}`}>
      {b.renewal > 0 ? formatRM(b.renewal) : '—'}
    </td>
    <td className="brRankBarCell" style={{ width: '100%' }}>
      <div className="brRankDivBarWrap">
        <div className="brRankDivBarLeft">
          {b.renewal > 0 && (
            <div
              className="brRankDivBarFillLeft"
              style={{ width: `${renewalHalfPct}%` }}
            />
          )}
          <span className={`brRankDivPctLeft${renewalSharePct === null || renewalSharePct === 0 ? ' brRankDivPctMuted' : ''}`}>
            {renewalSharePct === null ? '—' : `${renewalSharePct}%`}
          </span>
        </div>
        <div className="brRankDivBarRight">
          {nonRenewal > 0 && (
            <div
              className="brRankDivBarFillRight"
              style={{
                width: `${nonRenewalHalfPct}%`,
                background: getBarColor(rank, branches.length),
              }}
            />
          )}
          <span className={`brRankDivPctRight${nonRenewalSharePct === null || nonRenewalSharePct === 0 ? ' brRankDivPctMuted' : ''}`}>
            {nonRenewalSharePct === null ? '—' : `${nonRenewalSharePct}%`}
          </span>
        </div>
      </div>
    </td>
    <td
      className="brRankDivRightRm"
      style={{ color: getBarColor(rank, branches.length) }}
    >
      {b.total > 0 ? formatRM(nonRenewal) : '—'}
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
```

Important: leave the existing stacked branch (the first half of the ternary) byte-for-byte identical to the current implementation — this is purely additive.

- [ ] **Step 3: Verify diverging rendering in browser**

Save. Vite HMR reloads. With dev server running, navigate to `/academy/branch-revenue-renewals` and click "Diverging".

Expected:
- Each branch row shows: rank, branch name, **renewal RM (purple, right-aligned)**, then a horizontal bar split by a center divider with **purple fill on left growing rightward toward center** and **tier-colored fill on right growing leftward away from center**, then **non-renewal RM (tier-colored, left-aligned)**, then tier badge.
- Percentages flank the center divider (e.g. `20%` just left of divider, `80%` just right).
- Branches with `renewal === 0` (e.g. Taman Sri Gombak per the screenshot): left RM shows `—` muted, no purple bar, left % shows `—` muted, right % shows `100%`.
- Branches with `total === 0`: both RM and both % show `—` muted.
- Tier badges still appear once per tier with correct rowspan.
- Toggling back to Stacked shows the original layout unchanged.

If columns look misaligned, inspect with DevTools and adjust CSS in Task 2 — but stop and surface the issue rather than guessing.

---

## Task 4: Hide jackpot vertical lines in diverging mode

**Files:**
- Modify: `frontend/src/pages/AcademyBranchRevenueRenewalsPage.tsx`

The Stacked mode draws vertical lines at RM80K / RM120K relative to total revenue across the full bar width. In Diverging mode the right bar represents non-renewal only, so those positions don't translate. Spec says: hide them in diverging mode. Jackpot summary card above the chart still lists winners.

Note: the jackpot lines are rendered **inside the existing stacked-mode `<tr>` JSX** (the `{jackpotWinners.map(t => (<div className="brRankJackpotLine" ...))}` block around line 364). Since Task 3 only adds them to the stacked branch of the ternary and the new diverging branch never references them, **this task may already be complete after Task 3**. Verify that's the case rather than adding code.

- [ ] **Step 1: Confirm jackpot lines are absent from the diverging branch**

Open `frontend/src/pages/AcademyBranchRevenueRenewalsPage.tsx`. Search for `brRankJackpotLine`. There should be exactly one occurrence, inside the stacked `<tr>` JSX. If there's a copy inside the new diverging `<tr>`, remove it.

- [ ] **Step 2: Browser verification**

With dev server running, on `/academy/branch-revenue-renewals`:
- Stacked mode: vertical RM80K (green) and RM120K (blue) lines visible inside each bar.
- Diverging mode: no vertical lines on either bar half.
- Jackpot Winners summary card above the chart is visible in **both** modes.

---

## Task 5: Verify capture-to-clipboard works in both modes

**Files:** None (verification only).

The capture button uses `captureRef`, which wraps the entire chart area including the toggle. No code change needed — just confirm both views capture cleanly.

- [ ] **Step 1: Capture in stacked mode**

With dev server running:
1. On `/academy/branch-revenue-renewals`, leave Stacked selected.
2. Click the 📋 capture button.
3. Toast says "Copied to clipboard" or "Downloaded".
4. Paste into an image viewer (or check Downloads folder for the PNG).
5. PNG should match the on-screen Stacked view including jackpot lines.

- [ ] **Step 2: Capture in diverging mode**

1. Click "Diverging".
2. Click the 📋 capture button.
3. Same toast.
4. Paste / view the PNG.
5. PNG should match the on-screen Diverging view: split bars, percentages, no jackpot lines.

- [ ] **Step 3: Verify the toggle button itself is captured**

The toggle UI is *inside* `captureRef`, so it shows up in the PNG. That's fine and consistent with how other filter controls already get captured. Confirm both PNGs include the View toggle showing the active mode.

---

## Task 6 (PARKED — DO NOT RUN WITHOUT EXPLICIT USER APPROVAL): Commit

**Files:** None (git only).

The user requested no commits or pushes during this plan. This task documents how to commit when they approve, but **must not be executed automatically**.

- [ ] **Step 1: Wait for explicit user approval**

The user must say something like "go ahead and commit" or "commit it now" before this task runs.

- [ ] **Step 2: Stage and commit**

```bash
git add frontend/src/pages/AcademyBranchRevenueRenewalsPage.tsx frontend/src/App.css docs/superpowers/specs/2026-05-08-branch-revenue-renewals-diverging-view-design.md docs/superpowers/plans/2026-05-08-branch-revenue-renewals-diverging-view.md
git commit -m "feat(academy): add diverging-bar view toggle to branch revenue & renewals"
```

- [ ] **Step 3: Do NOT push**

`master` and `staging` both auto-deploy. Per user instructions, leave commits local. The user will push manually after their own review.

---

## Self-Review Notes

- **Spec coverage:** every spec section has a corresponding task — toggle UI (Task 1), CSS (Task 2), diverging row layout including all 10 columns (Task 3), jackpot line hiding (Task 4), capture-to-clipboard verification (Task 5). The "no automated tests" stance from the spec is honored — verification is browser-based throughout.
- **Edge cases from spec table:** `total === 0` and `renewal === 0` cases are handled in the percentage computation and the conditional class names in Task 3, Step 2.
- **Type consistency:** `viewMode` is typed `'stacked' | 'diverging'` everywhere it appears (Task 1 declaration, Task 1 onClick cast, Task 3 ternary).
- **No placeholders:** every code block is concrete; no "implement later" or "similar to above".
- **Commit policy:** parked task with explicit gate, matches user's "don't push or commit" directive.
