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

Each number inside a cell is independently clickable:

- **Click CT number** → Lead Centre with `stage=CT&preset=<current>&pipeline=<pip>` (current behavior — Lead Centre filters CT rows by their own `received_at`).
- **Click ENR number** → Lead Centre with `stage=ENR&preset=<current>&pipeline=<pip>&via_ct=1`. The new `via_ct=1` flag tells the list endpoint to apply the date filter to the **linked CT's** `received_at` rather than the ENR row's `received_at`. This way, the drill-down count matches the dashboard cell exactly: a CT booked today that enrols next week is counted in *today's* ENR cell and *today's* ENR drill-down.
- The pipe `|` between them is not clickable (muted color).

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

Extend `GET /api/ghl-stages` in [backend/src/routes/ghlStages.js](backend/src/routes/ghlStages.js#L190) to accept a new query param `via_ct=1`. When set:

- The outer date filter on `received_at` is skipped.
- An EXISTS clause is added: rows are kept only if there is a linked CT row (same `email` + `opportunity_name`) with `stage_key = 'CT'`, `preferred_day <> ''`, `time_slot <> ''`, and `received_at` (KL date) within the supplied `date_from`/`date_to`.

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
)
```

All other filters (`stage`, `pipeline`, `time_slot`, `search`) continue to apply to the outer row (the ENR row). This means: clicking ENR shows ENR-stage rows whose linked CT was booked in the dashboard date range — count matches the dashboard cell.

## Frontend changes

### [frontend/src/pages/DayDistributionPage.tsx](frontend/src/pages/DayDistributionPage.tsx) & [frontend/src/pages/TimeSlotDistributionPage.tsx](frontend/src/pages/TimeSlotDistributionPage.tsx)

1. **Build a parallel ENR map** alongside `dayMap` / `slotMap`, summing `r.n_enr` with the same grouping logic.
2. **`MetricCard` renders `ct | enr`** as two clickable spans separated by a muted pipe. Each span calls a separate click handler. Hover affordance only on numbers, not the pipe.
3. **`Row` accepts** `enrValues` plus a second click handler (`onCellClickEnr`).
4. **Branch label** changes to `${branchName} [ ${ctTotal} | ${enrTotal} ]`. Totals computed across the row's visible cells (Day: all 5 days; Time Slot: `visibleCodes`).
5. **`goToLeadCentre`** parameterized by stage: `goToLeadCentre(pip, stage)`. When `stage === 'ENR'`, the function also appends `via_ct=1` so the date filter is applied to the linked CT's `received_at` and the drill-down count matches the dashboard cell.

No new files. No new routes. No schema changes.

## Edge cases

- **Both zero:** cell shows `0 | 0`, muted, not clickable (current behavior treats `value === 0` as non-interactive when `onClick` is set — keep that).
- **CT > 0, ENR = 0:** show `15 | 0`. CT clickable, ENR span styled muted but still clickable (lets user verify no enrolments in Lead Centre).
- **A lead with multiple ENR rows** (shouldn't happen given the `(email, opportunity_name, stage_key)` uniqueness, but defensive): `COUNT(*) FILTER` would double-count. Mitigation: the LEFT JOIN matches at most one ENR row per CT row because of the unique constraint — fine.
- **CT lead without preferred_day/time_slot:** already filtered out by the existing `preferred_day <> '' AND time_slot <> ''` clause.

## Testing

Manual verification:

1. Pick a date range with known CT→ENR conversions. Confirm cell shows correct `CT | ENR`.
2. Confirm ENR ≤ CT in every cell.
3. Click CT number → Lead Centre filters to CT stage. Click ENR number → filters to ENR stage.
4. Confirm branch label totals = sum of visible cells in that row.
5. On Time Slot page, toggle Day filter — confirm totals recompute against the now-visible slot codes only.

## Out of scope

- Per-cell granularity on drill-down (clicking the Wed cell still shows the whole pipeline row in Lead Centre, not just Wed's CTs — Lead Centre has no `preferred_day` filter today). Filed as a possible follow-up.
- ENR-only mode / toggle.
- New columns or pages.
