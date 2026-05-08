# Branch Revenue & Renewals — Diverging View Toggle — Design

**Date:** 2026-05-08
**Status:** Approved, ready for implementation plan
**Owner:** dina

## Background

The `/academy/branch-revenue-renewals` page currently renders one chart: a horizontal stacked bar per branch, with a purple renewal segment at the left of each bar and a tier-colored "new revenue" segment filling the rest. The grand total of each bar = total revenue (renewal + new). A separate column on the right shows the renewal RM amount.

dina wants a second visualization: a back-to-back / diverging bar chart that splits renewal and non-renewal revenue around a central axis, with a per-branch percentage so it's obvious how dependent each branch is on renewals. The two views should coexist via a toggle so the existing chart is not lost.

## Goals

1. Add a **Stacked ⇄ Diverging** toggle to the filter bar on `/academy/branch-revenue-renewals`.
2. Default mode is "Stacked" — current behavior is unchanged.
3. "Diverging" mode renders the same per-branch data as a back-to-back bar chart, with renewal on the left and non-renewal new revenue on the right.
4. Each row in Diverging mode shows: renewal RM, renewal %, non-renewal %, non-renewal RM, plus the existing rank, branch name, and tier badge.
5. Capture-to-clipboard continues to work for whichever view is active.

## Non-goals

- No backend or API changes. Same `/api/academy/branch-revenue-renewals` payload powers both modes.
- No new files. All changes live in `frontend/src/pages/AcademyBranchRevenueRenewalsPage.tsx` plus minor styling.
- No URL persistence of toggle state (component-local state only). Can be added later if needed.
- No mobile-specific layout. On narrow viewports the diverging row scrolls horizontally inside its container.
- No period-over-period comparison (e.g. this month vs last month). The toggle only switches presentation of the currently selected period.

## Color conventions (preserved from existing chart)

- Purple (`#9333ea`) = renewal.
- Tier-colored gradient (existing `getBarColor(rank, total)` helper) = non-renewal new revenue.
- Branch name color = lifetime jackpot tier (existing `lifetime_max` lookup).
- A row with no purple anywhere = the branch had zero renewal students that period.

## UX

### Toggle control

A new control in the filter bar, styled like the existing "Quick Select" presets:

```
┌─ View ────────────────────────┐
│  [ Stacked ● ]  [ Diverging ] │
└───────────────────────────────┘
```

- Two buttons sharing the `brRankPresetBtn` class with the existing `.active` state for the selected mode.
- Default = Stacked.
- Clicking either button updates a `viewMode` state (`'stacked' | 'diverging'`).

### Diverging row layout

```
#1  Cyberjaya     RM6,168 [████◀     ] 20% │ 80% [     ▶██████████]  RM25,362   🥇
                            renewal               new revenue              Tier A
#2  Shah Alam     RM1,960 [██◀       ] 10% │ 90% [     ▶████████]    RM17,424
#3  Taman SG          —   [          ]  —  │100% [     ▶████████]    RM17,767
                                                  (no purple = no renewal)
```

Columns left-to-right:

1. **Rank** — `#1`, `#2`, … (existing styling).
2. **Branch name** — colored by lifetime jackpot if applicable (existing styling).
3. **Renewal RM** — right-aligned, purple, `formatRM(renewal)` or `—` if `renewal === 0`.
4. **Left bar half** — renewal portion. Bar grows from the center divider leftward. Width = `(renewal / sharedMax) * 50%` where `sharedMax = max(branch.total) across all branches` so the two halves are comparable.
5. **Renewal %** — `(renewal / total * 100)` rounded to whole number, displayed just left of the center divider. Renders `—` when `total === 0` or `renewal === 0`.
6. **Center divider** — thin vertical line.
7. **Non-renewal %** — `((total - renewal) / total * 100)` rounded to whole number, just right of the divider.
8. **Right bar half** — non-renewal portion. Width = `((total - renewal) / sharedMax) * 50%`. Tier-colored using existing `getBarColor(rank, total)`.
9. **Non-renewal RM** — left-aligned, in the same tier color as the bar.
10. **Tier badge** — unchanged (rowSpan across the tier's rows, far right).

Both bar halves share `sharedMax` (the largest branch's total revenue) so the renewal half visually shrinks against the same yardstick as the new revenue half. This makes "Cyberjaya is mostly new revenue" and "Branch X is mostly renewal" both visually obvious.

### Percentages — edge cases

| Condition | Left % | Right % |
|---|---|---|
| `total === 0` | `—` | `—` |
| `renewal === 0`, `total > 0` | `—` | `100%` |
| `renewal === total` | `100%` | `—` |
| Both > 0 | rounded(renewal/total \* 100) | rounded((total−renewal)/total \* 100) |

Left+Right always equals 100 (or both `—`); rounding is applied to each side independently after computing exact values, then if rounding causes them to sum to 99 or 101, the larger side absorbs the difference.

### Jackpot threshold lines

The Stacked view draws vertical lines at RM80K and RM120K representing total-revenue thresholds. In Diverging mode the right bar represents non-renewal only, so the existing line positions would mislead. **Diverging mode hides the vertical lines.** The "🏆 Jackpot Winners" summary card above the chart already lists winning branches — that remains visible in both modes and is the canonical way to see who hit a threshold.

### Tier badges

Unchanged in both modes. The badge cell still uses `rowSpan` over the tier's branches.

### Capture-to-PNG

No change. The existing `captureRef` wraps the filter bar + jackpot summary + chart; whichever view is active gets exported.

## Implementation outline

Single file: `frontend/src/pages/AcademyBranchRevenueRenewalsPage.tsx`.

1. Add `const [viewMode, setViewMode] = useState<'stacked' | 'diverging'>('stacked')`.
2. Add a new `brRankFilterGroup` to the filter bar with two `brRankPresetBtn` buttons toggling `viewMode`.
3. Compute `sharedMax` once per render: `Math.max(...branches.map(b => b.total), 1)` (the existing `maxTotal` already does this for the stacked layout — it can be reused).
4. Inside the `tierRows.map(...)` row render, branch on `viewMode`:
   - `'stacked'` → existing JSX, untouched.
   - `'diverging'` → new JSX block describing columns 1–10 above.
5. CSS: a small block of new rules for the diverging row (left/right bar halves, center divider, % labels). Existing `brRankBarTable`/`brRankDataRow` classes are reused for row striping and tier-start separators.
6. Jackpot vertical lines (`brRankJackpotLine`) are only rendered when `viewMode === 'stacked'`.

No new imports, no new helpers needed beyond inline math.

## Testing

Manual verification against the running staging instance (`staging-dashboard.ebright.my`):

- Toggle defaults to Stacked; existing chart looks identical to before.
- Switching to Diverging reflows rows; renewal RM appears on the left, non-renewal RM on the right, percentages flank a center divider.
- Branches with `renewal === 0` show no purple half and `—` on the left, `100%` on the right.
- Branches with `total === 0` show both sides as `—`.
- Capture-to-clipboard works in both modes; PNG matches what's on screen.
- Tier badges still render once per tier with correct `rowSpan`.
- Lifetime jackpot branch-name colors are still applied.
- Switching mode does not refetch data (toggle is purely presentational).

No automated tests are added — this page has no existing test coverage and the change is pure presentation.

## Risks

- **Visual density**: the diverging row has more elements (RM + bar + % on each side). On narrower viewports it can crowd. Mitigation: container scrolls horizontally; copy review of the staging build before promoting to master.
- **Percent rounding**: trivial mismatches like 19% + 80% = 99% are corrected per the table above.
- **User confusion about jackpots in Diverging mode**: mitigated by keeping the jackpot summary card visible at the top of the chart in both modes.

## Files changed

- `frontend/src/pages/AcademyBranchRevenueRenewalsPage.tsx` — toggle state, conditional row rendering, small CSS additions (inline or in the existing co-located CSS file if there is one).
