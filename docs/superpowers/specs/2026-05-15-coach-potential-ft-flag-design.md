# Coach & BM Performance — Potential FT Coach Flag

**Date:** 2026-05-15
**Status:** Approved (pending spec-file review)
**Page affected:** `/coach-bm-performance`

## Goal

Add a "Potential FT Coach" column to the Coach & BM Performance page so academy can flag PT Coaches they think may be promoted to FT. The flag is checkbox-driven, persisted, and visible only on rows where `bs.role = 'PT - Coach'` (FT Coach and BM rows show a muted `—`).

## Data sources

All source data already lives in `hrfs."BranchStaff"` (existing). The new flag is dashboard-owned.

## Schema

New table `public.coach_potential_ft_flag` (sibling to `coach_training_completion` and `coach_program_completion`):

```sql
CREATE TABLE IF NOT EXISTS public.coach_potential_ft_flag (
  branch_staff_id  INTEGER     PRIMARY KEY,
  flagged_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  flagged_by       UUID        REFERENCES public.users(id) ON DELETE SET NULL
);
```

PK on `branch_staff_id` because at most one flag per coach. Row exists ⇒ flagged. Row absent ⇒ not flagged. No FK to `hrfs."BranchStaff"` because that schema is a foreign-data wrapper and cross-schema FKs to FDW tables are not supported (same reason `coach_training_completion` and `coach_program_completion` omit theirs).

## Backend — `/api/coach-bm-performance`

### `GET /` changes

Add to the SELECT (parallel to the existing `training_confirmed` boolean):

- LEFT JOIN `public.coach_potential_ft_flag pft ON pft.branch_staff_id = bs.id`
- `(pft.branch_staff_id IS NOT NULL) AS potential_ft`

Existing fields and the contract→programs CASE are unchanged.

### `GET /stats` — no change

No stat card depends on this flag. The /stats endpoint is left alone.

### `PUT /:branchStaffId/potential-ft` (new endpoint)

Body: `{ flagged: boolean }`

**Guards (in order):**

1. `branchStaffId` is a positive int → else 400.
2. `flagged` is a boolean → else 400.
3. Row exists, is `Active`, and matches `(role ILIKE '%coach%' OR role = 'BM')` → else 404.
4. **Only when `flagged === true`:** require `bs."role" = 'PT - Coach'` → else 422 with error `'Only PT Coaches can be flagged'`. Untick (delete) is always allowed regardless of role — covers the case where role is corrected from PT to FT after flagging.

**Action:**

- `flagged=true` → `INSERT INTO public.coach_potential_ft_flag (branch_staff_id, flagged_at, flagged_by) VALUES ($1, NOW(), $2) ON CONFLICT (branch_staff_id) DO UPDATE SET flagged_at = NOW(), flagged_by = EXCLUDED.flagged_by`.
- `flagged=false` → `DELETE FROM public.coach_potential_ft_flag WHERE branch_staff_id = $1` (idempotent).

Response: `{ ok: true, branch_staff_id, flagged }`.

## Frontend — `CoachBmPerformancePage.tsx`

### Column position

New column **"Potential FT Coach"** inserted between **"Training Completed"** and **"Programs"** in both the headers array and the row JSX.

| # | Column |
|---|---|
| 1–10 | (unchanged) ... up to Training Completed |
| 11 | **Potential FT Coach** (new) |
| 12 | Programs |
| 13 | No. of Lessons |
| 14 | No. of Students |

Update the empty-row `colSpan={13}` → `colSpan={14}`.

### `CoachRow` type addition

```ts
type CoachRow = {
  // ... existing fields
  potential_ft: boolean; // new
};
```

### Cell render rules

| `r.role` | Renders |
|---|---|
| not `'PT - Coach'` | `—` muted dash (no tooltip — column header is self-explanatory) |
| `'PT - Coach'` | Enabled checkbox, `accentColor: '#f59e0b'` (amber, distinct from the green Training Completed checkbox and the program-color checkboxes) |

The PT Coach checkbox is always enabled (no time gate). Toggling persists immediately via the mutation.

### Mutation

A new `togglePotentialFt` `useMutation` parallel to `toggleTrainingConfirmation`:

- `mutationFn`: `PUT /api/coach-bm-performance/:id/potential-ft` with `{ flagged }`.
- `onMutate`: optimistic — flip `potential_ft` on the matching row in cached `coachBmPerformance` query.
- `onError`: roll back to previous cache snapshot (silent — same as other checkboxes).
- `onSettled`: invalidate `['coachBmPerformance']` only. No stats invalidation (stats don't depend on this flag).

## Out of scope

- No filter for "show only flagged" rows (Branch + Search filters stay).
- No new stat card.
- No automated tests (consistent with the rest of the page; manual verification only).
- No admin/audit-log surface — `flagged_by` / `flagged_at` are captured in the table for future use but no UI consumes them.

## Verification plan (manual, on staging)

1. Pick an active PT Coach → tick the Potential FT Coach checkbox; confirm row appears in `public.coach_potential_ft_flag`. Untick → confirm row gone.
2. Pick an active FT Coach → confirm cell shows `—`, no checkbox.
3. Pick an active BM → confirm cell shows `—`, no checkbox.
4. Confirm none of the existing columns / behavior regressed (Training Completed checkbox still works, Programs still works, stat cards unchanged).

## Migration

New SQL file: `backend/sql/020_create_coach_potential_ft_flag.sql` containing the `CREATE TABLE` above. Applied manually (existing convention).
