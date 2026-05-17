# For Manjeet — Day/Time Slot ENR Cross-Check + Branch Totals

**Date:** 2026-05-18
**Pages affected:** Day Distribution, Time Slot Distribution (under For Manjeet)

## Problem

Both distribution pages currently show only CT (Confirmed Tour) counts per day / time slot. BMs want to see, alongside each CT count, how many of those leads have already progressed to ENR (Enrolled). They also want the per-branch total visible next to each branch name, so they don't have to mentally sum the row.

## Behavior

### 1. ENR cross-check in cells

Each cell shows two numbers: `CT | ENR`.

- **CT count:** unchanged — number of CT-stage `ghl_stages` rows for that pipeline × day × slot within the date range.
- **ENR count:** number of those CT-booked leads (matched by `email + opportunity_name`) that *also* have an ENR-stage row in `ghl_stages` — **without** a date restriction on the ENR row. ENR happens after CT, so restricting it to the dashboard date range would undercount conversions.
- ENR count is always ≤ CT count (it's a subset of the CT leads in range).

### 2. Per-cell click behavior

Each number inside a cell is independently clickable. The drill-down count in Lead Centre is required to **exactly match** the number on the cell — so the click passes through every dimension that defines the cell (pipeline, preferred_day, time_slot).

- **Click CT number** → Lead Centre with `stage=CT&preset=<current>&pipeline=<pip>` plus, where applicable, `preferred_day=<day>` and `time_slot=<code>`. Lead Centre filters CT rows by their own `received_at`, preferred_day, and time_slot.
- **Click ENR number** → Lead Centre with `stage=ENR&preset=<current>&pipeline=<pip>&via_ct=1` plus, where applicable, `preferred_day=<day>` and `time_slot=<code>`. The `via_ct=1` flag tells the list endpoint to apply the date filter — *and the preferred_day / time_slot filters* — to the **linked CT** (matched by `email + opportunity_name`) rather than to the ENR row itself. ENR rows often lack day/slot metadata, so without `via_ct` they couldn't be filtered by those fields.
- The pipe `|` between them is not clickable (muted color).

Cell-to-URL mapping:

| Page | preferred_day param | time_slot param |
|---|---|---|
| Day Distribution (per-day cell) | Full day name (`Wednesday`) | — |
| Day Distribution (branch total label) | — | — |
| Time Slot Distribution (per-slot cell, "All Days") | — | 4-digit code (`0915`) |
| Time Slot Distribution (per-slot cell, day filter active) | Full day name | 4-digit code |
| Time Slot Distribution (branch total label) | Full day name if day filter active | — |

The branch total labels (e.g. `Setia Alam [ 75 | 15 ]`) are clickable too: clicking `75` opens CT for that pipeline; clicking `15` opens ENR with `via_ct=1`. They omit per-cell filters, so they match the row total.

### 3. Branch totals beside label

Each branch row label changes from `Setia Alam` to `Setia Alam [ 75 | 15 ]` — CT total | ENR total summed across the visible columns of that row.

The Overall row uses the same format: `Overall [ 90 | 18 ]`.

Totals respect the current view filters:
- **Day Distribution:** sum across all 5 days.
- **Time Slot Distribution:** sum across the currently visible slot codes (which depend on the day filter — weekday vs weekend).

## Backend change

Extend `GET /api/ghl-stages/ct-calendar` in [backend/src/routes/ghlStages.js](backend/src/routes/ghlStages.js#L572) to add `n_enr` per group.

New SQL:

```sql
SELECT
  ct.pipeline_name,
  ct.preferred_day,
  ct.time_slot,
  COUNT(*)::int AS n,
  COUNT(*) FILTER (WHERE enr.email IS NOT NULL)::int AS n_enr
FROM ghl_stages ct
LEFT JOIN ghl_stages enr
  ON enr.email = ct.email
 AND enr.opportunity_name = ct.opportunity_name
 AND enr.stage_key = 'ENR'
WHERE ct.stage_key = 'CT'
  AND ct.preferred_day <> ''
  AND ct.time_slot <> ''
  AND (ct.received_at AT TIME ZONE 'Asia/Kuala_Lumpur')::date >= $1::date
  AND (ct.received_at AT TIME ZONE 'Asia/Kuala_Lumpur')::date <= $2::date
GROUP BY ct.pipeline_name, ct.preferred_day, ct.time_slot
ORDER BY ct.pipeline_name, ct.preferred_day, ct.time_slot
```

Response shape:

```json
{ "rows": [{ "pipeline_name": "...", "preferred_day": "...", "time_slot": "...", "n": 15, "n_enr": 8 }] }
```

Existing consumers that only read `n` keep working (additive change).

### Backend change — list endpoint

Extend `GET /api/ghl-stages` in [backend/src/routes/ghlStages.js](backend/src/routes/ghlStages.js#L190) with two additions:

**(a) New `preferred_day` query param.** Filters rows by exact-match on the `preferred_day` column (e.g. `Wednesday`). Applied directly to the outer row when `via_ct` is not set.

**(b) New `via_ct=1` flag.** When set, three filters move *off* the outer row and *into* an EXISTS subquery against linked CT rows:

- `date_from` / `date_to` → applied to `ct.received_at`, not to the outer row.
- `preferred_day` (if supplied) → applied to `ct.preferred_day`.
- `time_slot` (if supplied) → applied to `ct.time_slot` (with the same `LIKE 'code%'` pattern used today).

```sql
EXISTS (
  SELECT 1 FROM ghl_stages ct
  WHERE ct.email = ghl_stages.email
    AND ct.opportunity_name = ghl_stages.opportunity_name
    AND ct.stage_key = 'CT'
    AND ct.preferred_day <> ''
    AND ct.time_slot <> ''
    AND (ct.received_at AT TIME ZONE 'Asia/Kuala_Lumpur')::date >= $X::date
    AND (ct.received_at AT TIME ZONE 'Asia/Kuala_Lumpur')::date <= $Y::date
    [AND ct.preferred_day = $D]   -- only if preferred_day supplied
    [AND ct.time_slot LIKE $T]    -- only if time_slot supplied
)
```

All other filters (`stage`, `pipeline`, `pipelines`, `search`) continue to apply to the outer row. The `pipeline` filter on the outer (ENR) row is safe because ENR carries the same `pipeline_name` as the matching CT — they're per-lead. Net result: clicking the ENR number for "Wednesday 1800 at Setia Alam" returns exactly the ENR rows whose linked CT was Setia Alam, Wednesday, 1800, within the dashboard date range — matching the dashboard cell.

## Frontend changes

### [frontend/src/pages/DayDistributionPage.tsx](frontend/src/pages/DayDistributionPage.tsx) & [frontend/src/pages/TimeSlotDistributionPage.tsx](frontend/src/pages/TimeSlotDistributionPage.tsx)

1. **Build a parallel ENR map** alongside `dayMap` / `slotMap`, summing `r.n_enr` with the same grouping logic.
2. **`MetricCard` renders `ct | enr`** as two clickable spans separated by a muted pipe. Each span calls a separate click handler. Hover affordance only on numbers, not the pipe.
3. **`Row` accepts** `enrValues` plus a second click handler (`onCellClickEnr`).
4. **Branch label** changes to `${branchName} [ ${ctTotal} | ${enrTotal} ]`, with `ctTotal` and `enrTotal` rendered as two clickable spans (same pattern as cells). Totals computed across the row's visible cells (Day: all 5 days; Time Slot: `visibleCodes`).
5. **`goToLeadCentre`** parameterized by stage and per-cell context:
   - Day Distribution: `goToLeadCentre(pip, stage, { day })` where `day` is the full day name (`Wednesday`).
   - Time Slot Distribution: `goToLeadCentre(pip, stage, { day: selectedDay || undefined, slot })`. `slot` is the 4-digit code.
   - When `stage === 'ENR'`, appends `via_ct=1`; otherwise omits it.
   - Branch-label total clicks pass no per-cell context, so they match the row total (Day Distribution passes nothing; Time Slot passes `selectedDay` only if active).

### [frontend/src/pages/GhlLeadsCentrePage.tsx](frontend/src/pages/GhlLeadsCentrePage.tsx)

1. **Read `preferred_day` and `via_ct` from URL params** on mount; add them to state alongside the other filters.
2. **Add a "Day" select dropdown** to the filter bar (options: `All Days`, Wed, Thu, Fri, Sat, Sun — value is the full day name). Sits between Time Slot and Search visually.
3. **Include `preferred_day` and `via_ct` in the query params** sent to `/api/ghl-stages`.
4. **Include both in the page-reset effect and the "Clear" button.**
5. The `via_ct` flag has **no visible UI control** — it's only set via URL when arriving from the dashboard. It's preserved across filter changes (until Clear is pressed), so changing e.g. the time slot dropdown after arriving from a dashboard click keeps the linked-CT semantics.

No new files. No new routes. No schema changes.

## Edge cases

- **Both zero:** cell shows `0 | 0`, muted, not clickable (current behavior treats `value === 0` as non-interactive when `onClick` is set — keep that).
- **CT > 0, ENR = 0:** show `15 | 0`. CT clickable, ENR span styled muted but still clickable (lets user verify no enrolments in Lead Centre).
- **A lead with multiple ENR rows** (shouldn't happen given the `(email, opportunity_name, stage_key)` uniqueness, but defensive): `COUNT(*) FILTER` would double-count. Mitigation: the LEFT JOIN matches at most one ENR row per CT row because of the unique constraint — fine.
- **CT lead without preferred_day/time_slot:** already filtered out by the existing `preferred_day <> '' AND time_slot <> ''` clause.

## Testing

Manual verification:

1. Pick a date range with known CT→ENR conversions. Confirm each cell shows correct `CT | ENR`.
2. Confirm ENR ≤ CT in every cell.
3. Click any CT cell → Lead Centre filters to CT stage, count matches the cell number.
4. Click any ENR cell → Lead Centre filters to ENR stage with `via_ct=1`, count matches the cell number.
5. Click a CT cell with a specific day on Time Slot page (day filter active) → Lead Centre shows that pipeline + day + slot.
6. Click the branch label totals → CT and ENR counts match the row totals.
7. On Time Slot page, toggle Day filter — confirm totals recompute against the now-visible slot codes only.
8. On Lead Centre after an ENR drill-down: change time slot dropdown → list refines but `via_ct` stays on (URL preserved). Click Clear → all filters including `via_ct` reset.

## Out of scope

- ENR-only mode / toggle.
- New columns or pages.
- Surfacing `via_ct` as a visible filter chip in Lead Centre (it's invisible state that the URL carries).
