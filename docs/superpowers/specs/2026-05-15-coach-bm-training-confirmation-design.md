# Coach & BM Performance — Role, Training Dates, Training Confirmation

**Date:** 2026-05-15
**Status:** Approved (pending spec-file review)
**Page affected:** `/coach-bm-performance`

## Goal

Extend the Coach & BM Performance page so academy can:

1. See each coach/BM's role (FT Coach / PT Coach / BM) at a glance.
2. See the training window (start + end date) instead of contract start date.
3. Confirm — once 7 days have elapsed since training started — that a coach/BM actually completed their initial 1-week training.
4. Have BMs correctly excluded from CCP (BMs don't take CCP), both in the per-row Programs column and the CCP stat card.

The Status badge already on the Name cell stays as-is — no separate Status column.

## Data sources

All source data already lives in `hrfs."BranchStaff"`:

- `bs."role"` — values like `'FT - Coach'`, `'PT - Coach'`, `'BM'` (exact format follows whatever the Portal already writes; do not normalize).
- `bs."trainingStartDate"` — nullable (academy fills in).
- `bs."trainingEndDate"` — nullable (academy fills in, often after the coach resigns).

Confirmation state is new and stored in a new dashboard-owned table.

## Schema

New table `coach_training_completion` (sibling to existing `coach_program_completion`):

```sql
CREATE TABLE coach_training_completion (
  branch_staff_id INT PRIMARY KEY REFERENCES hrfs."BranchStaff"(id) ON DELETE CASCADE,
  confirmed_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  confirmed_by    INT REFERENCES public.users(id)
);
```

PK on `branch_staff_id` because at most one confirmation row per coach (no per-program key needed). `coach_program_completion` stays in use for the Programs column — different concept (per-program completion driven by contract length).

## Backend — `/api/coach-bm-performance`

### `GET /` changes

Add to the SELECT:

- `bs."role"`
- `bs."trainingStartDate"` AS `training_start_date`
- `bs."trainingEndDate"` AS `training_end_date`
- LEFT JOIN `coach_training_completion ctc ON ctc.branch_staff_id = bs.id`, return `(ctc.branch_staff_id IS NOT NULL) AS training_confirmed`.

Adjust the contract → programs CASE so **role = 'BM' returns programs without CCP**:

```sql
CASE
  WHEN bs."contract" IS NULL OR TRIM(bs."contract") = '' THEN ARRAY[]::text[]
  WHEN bs."role" = 'BM' THEN
    CASE NULLIF(regexp_replace(bs."contract", '[^0-9]', '', 'g'), '')::int
      WHEN 15 THEN ARRAY['Weekly Training', 'Toastmasters', 'TPRR']
      WHEN 18 THEN ARRAY['Weekly Training', 'Toastmasters', 'TPRR', 'ATCL Diploma']
      ELSE ARRAY[]::text[]
    END
  ELSE
    ARRAY['CCP'] ||
    CASE NULLIF(regexp_replace(bs."contract", '[^0-9]', '', 'g'), '')::int
      WHEN 15 THEN ARRAY['Weekly Training', 'Toastmasters', 'TPRR']
      WHEN 18 THEN ARRAY['Weekly Training', 'Toastmasters', 'TPRR', 'ATCL Diploma']
      ELSE ARRAY[]::text[]
    END
END
```

Existing `start_date` field can be removed from the SELECT — frontend no longer reads it.

### `GET /stats` changes

Apply the BM-no-CCP rule to CCP counters only:

- `assigned_ccp` filter becomes: `raw_contract IS NOT NULL AND TRIM(raw_contract) <> '' AND role <> 'BM'`.
- `completed_ccp` filter mirrors that with the same `role <> 'BM'` clause.
- Other program counters (Weekly Training, Toastmasters, TPRR, ATCL Diploma) are unchanged — they're already gated on `months IN (15, 18)` / `months = 18`. BMs with 15M/18M contracts SHOULD count toward those program totals, since they DO take those programs.

To make `role` available in the parsed CTE, add it to the SELECT in that CTE.

### `PUT /:branchStaffId/training-completion` (new endpoint)

Body: `{ confirmed: boolean }`

**Guards (in order):**

1. `branchStaffId` is a positive int → else 400.
2. `confirmed` is a boolean → else 400.
3. Row exists, is `Active`, and matches `(role ILIKE '%coach%' OR role = 'BM')` → else 404.
4. **Only when `confirmed === true`:** require `trainingStartDate IS NOT NULL` AND `NOW() >= trainingStartDate + INTERVAL '7 days'` → else 422.
   - Untick (delete) is always allowed regardless of dates — covers the edge case where dates get corrected after a confirmation was already made.

**Action:**

- `confirmed=true` → `INSERT INTO coach_training_completion (branch_staff_id, confirmed_at, confirmed_by) VALUES ($1, NOW(), $2) ON CONFLICT (branch_staff_id) DO UPDATE SET confirmed_at = NOW(), confirmed_by = EXCLUDED.confirmed_by`.
- `confirmed=false` → `DELETE FROM coach_training_completion WHERE branch_staff_id = $1` (idempotent).

Response: `{ ok: true, branch_staff_id, confirmed }`.

## Frontend — `CoachBmPerformancePage.tsx`

### Column order (changes in **bold**)

| # | Column | Notes |
|---|---|---|
| 1 | No. | unchanged |
| 2 | Name | keeps existing Active/Inactive status badge |
| 3 | Gender | unchanged |
| 4 | Phone | unchanged |
| 5 | Branch | unchanged |
| 6 | **Role** | new — pill style, raw value from `bs.role` (e.g. `FT - Coach`, `PT - Coach`, `BM`) |
| 7 | **Training Start Date** | replaces "Start Date" — uses existing `fmtStartDate` |
| 8 | **Training End Date** | new — same formatter, `—` if null |
| 9 | Contract Period | unchanged |
| 10 | **Training Completed** | new — see state matrix below |
| 11 | Programs | BM rows: contract-derived programs minus CCP (so 9M BM = empty list) |
| 12 | No. of Lessons | unchanged |
| 13 | No. of Students | unchanged |

### `CoachRow` type

```ts
type CoachRow = {
  id: number;
  name: string;
  gender: string | null;
  phone: string | null;
  branch: string | null;
  role: string | null;                  // new
  training_start_date: string | null;   // replaces start_date
  training_end_date: string | null;     // new
  contract: string | null;
  status: string | null;
  programs: string[];
  completed_programs: string[];
  student_count: number;
  training_confirmed: boolean;          // new
};
```

The existing `start_date` field is removed from the type.

### Training Completed cell state matrix

| `trainingStartDate` | Days since start | `training_confirmed` | Renders | Tooltip |
|---|---|---|---|---|
| NULL | — | — | `—` | "Training start date not set" |
| set | < 7 | false | Disabled unchecked checkbox | "Available on `<startDate + 7d>`" |
| set | ≥ 7 | false | Enabled unchecked checkbox | (none) |
| set | ≥ 7 | true | Enabled checked checkbox | "Confirmed on `<confirmed_at>`" |
| set | < 7 | true | Enabled checked checkbox (still toggleable) | "Confirmed on `<confirmed_at>`" |

The last row is the edge case: HR corrected the start date after academy already confirmed. Leave the confirmation in place — academy can untick manually. Backend's 422 only blocks NEW confirmations during the < 7-day window; deletions are always allowed.

### Mutation

A new `toggleTrainingConfirmation` `useMutation` parallel to existing `toggleCompletion`:

- `mutationFn`: `PUT /api/coach-bm-performance/:id/training-completion` with `{ confirmed }`.
- `onMutate`: optimistic — flip `training_confirmed` on the matching row in the cached `coachBmPerformance` query.
- `onError`: roll back to previous cache snapshot (silent — same as program checkboxes).
- `onSettled`: invalidate `['coachBmPerformance']` and `['coachBmPerformanceStats']`.

## Out of scope

- No filter for status or role (current Branch + Search filters stay).
- No automated tests added for this page (consistent with the rest of the page; manual verification only — see Verification Plan below).
- No change to the Portal that writes the training dates (assumed to already work).
- Audit log integration — `confirmed_by` is captured in the table for future audit but no admin/audit-log UI changes here.

## Verification plan (manual, on staging)

1. Pick 1 active coach with `trainingStartDate` > 7 days ago → tick, confirm row appears in `coach_training_completion`; untick, confirm row disappears.
2. Pick 1 coach with `trainingStartDate` < 7 days ago → confirm checkbox is disabled, hover shows "Available on `<date>`".
3. Pick 1 row with NULL `trainingStartDate` → confirm cell shows `—`, no checkbox.
4. Pick 1 BM with 9M contract → confirm Programs column is empty.
5. Pick 1 BM with 15M contract → confirm Programs shows Weekly Training / Toastmasters / TPRR (no CCP).
6. Confirm CCP stat card denominator drops by the count of BMs with non-empty contracts.
7. Confirm Weekly Training / Toastmasters / TPRR / ATCL Diploma denominators are unchanged from before (BMs with 15M/18M still counted).

## Migration

New SQL file: `backend/sql/019_create_coach_training_completion.sql` containing the `CREATE TABLE` above. To be applied manually on staging then production (existing convention in this repo — see `coach_program_completion` migration).
