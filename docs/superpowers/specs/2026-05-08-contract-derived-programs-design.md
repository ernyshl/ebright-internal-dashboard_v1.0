# Contract-Derived Programs — Design

**Date:** 2026-05-08
**Owner:** Academy / Student Database
**Status:** Draft — pending implementation

## Goal

Replace the manual program-enrollment ticks on the Coach & BM Performance page with values derived from each coach's `BranchStaff.contract` field. The Programs column becomes read-only; a new CCP stat card joins the existing three; a TPRR card is added; and the underlying `coach_program_enrollment` table is dropped.

## Background

The previous design (spec `2026-05-08-coach-bm-performance-design.md`) stored three boolean flags per coach in `coach_program_enrollment`, edited via tickable checkboxes. In practice, program participation is fully determined by contract length, so the manual layer is redundant. This spec removes it.

## Non-goals

- Editing contract values from this page. Contract remains owned by HR's portal.
- Computing lesson or student counts. Those columns continue to render `—`.
- Special-case overrides (e.g. "this 12M coach also does Toastmasters this cycle"). If overrides become necessary later, reintroduce a small override table — but YAGNI for now.

## Contract → Programs mapping

The contract value is parsed by extracting digits and taking the leading number:

```
months = parseInt(contract.replace(/[^0-9]/g, ''))
```

| `months` | Programs |
|---|---|
| 15 | CCP, Weekly Training, Toastmasters, TPRR |
| 18 | CCP, Weekly Training, Toastmasters, TPRR, ATCL Diploma |
| any other parseable value (9, 12, 24, …) | CCP |
| NULL or blank `contract` | (empty list — coach has no programs assigned) |

The "CCP for every contract" rule means CCP applies whenever a coach has a non-blank parseable contract value. Coaches with NULL/blank contract show `—` in the Programs column and are not counted on any stat card — they're flagged to HR by their absence.

## Stat cards

Five cards in this order:

| # | Card | Counts | Sub | Color | Icon |
|---|------|--------|-----|-------|------|
| 1 | CCP | active coaches/BMs whose contract is non-blank | `/N` | `#0ea5e9` | 📘 |
| 2 | Weekly Training | active coaches/BMs whose `months IN (15, 18)` | `/N` | `#4f46e5` | 🏋️ |
| 3 | Toastmasters | active coaches/BMs whose `months IN (15, 18)` | `/N` | `#10b981` | 🎤 |
| 4 | TPRR | active coaches/BMs whose `months IN (15, 18)` | `/N` | `#f59e0b` | 🗣️ |
| 5 | ATCL Diploma | active coaches/BMs whose `months = 18` only | `/N` | `#8b5cf6` | 🎓 |

`N` = total active coaches/BMs in the current branch filter (same denominator as the existing three cards). Search query does not affect card counts; branch filter does.

Weekly Training, Toastmasters, and TPRR will display identical numbers because all three apply to the same 15M+18M cohort. This is intentional — separate cards make the program names visible, which is the primary scanning task.

(Naming note: the card and program label is "Toastmasters" — plural — matching the existing card from the previous design and standard usage of the Toastmasters program name.)

The existing grid `repeat(auto-fit, minmax(200px, 1fr))` continues to lay out cards responsively (5 in a row on wide screens, wrapping on narrower).

## Programs column

Read-only list of colored chips, one per program:

- Each chip uses the matching card color (e.g. CCP chip is sky `#0ea5e9` on a `#0ea5e918` tint).
- Chips stack vertically, `alignSelf: flex-start` so they hug the left edge.
- A coach with `programs = []` renders `—` in muted text.
- No checkboxes, no click handlers, no mutation.

Frontend declares a `PROGRAM_COLORS` map at module scope:

```ts
const PROGRAM_COLORS: Record<string, string> = {
  'CCP':              '#0ea5e9',
  'Weekly Training':  '#4f46e5',
  'Toastmasters':      '#10b981',
  'TPRR':             '#f59e0b',
  'ATCL Diploma':     '#8b5cf6',
};
```

## Backend

### Migration: drop the now-unused table

New file `backend/sql/017_drop_coach_program_enrollment.sql`:

```sql
-- 017_drop_coach_program_enrollment.sql
--
-- Programs are now derived from BranchStaff.contract; the manual-tick
-- override table from migration 016 is no longer used. Idempotent.

DROP TABLE IF EXISTS public.coach_program_enrollment;
```

To apply locally: same psql / HeidiSQL flow as 016. For staging/production: applied as part of the normal deploy step.

### `routes/coachBmPerformance.js` changes

- Delete the PUT `/:branchStaffId/program` handler.
- Delete the `VALID_PROGRAMS` constant (only the PUT used it).
- Update GET `/`:
  - Remove `LEFT JOIN coach_program_enrollment cpe ...`.
  - Remove the three `COALESCE(cpe.<col>, FALSE)` selections.
  - Add a derived `programs text[]` column.

GET `/` SELECT (relevant portion):

```sql
SELECT bs.id,
       COALESCE(NULLIF(TRIM(bs."name"), ''), nl."name") AS name,
       bs."gender",
       bs."branch",
       bs.start_date,
       bs."contract",
       bs."status",
       CASE
         WHEN bs."contract" IS NULL OR TRIM(bs."contract") = '' THEN ARRAY[]::text[]
         ELSE
           ARRAY['CCP'] ||
           CASE NULLIF(regexp_replace(bs."contract", '[^0-9]', '', 'g'), '')::int
             WHEN 15 THEN ARRAY['Weekly Training', 'Toastmasters', 'TPRR']
             WHEN 18 THEN ARRAY['Weekly Training', 'Toastmasters', 'TPRR', 'ATCL Diploma']
             ELSE ARRAY[]::text[]
           END
       END AS programs
FROM hrfs."BranchStaff" bs
LEFT JOIN name_lookup nl ON nl."nickname" = bs."nickname"
WHERE ...
ORDER BY name ASC
LIMIT $... OFFSET $...
```

### `/stats` endpoint update

The new query uses a CTE to parse contract months once, keeping the FILTER expressions readable:

```sql
WITH parsed AS (
  SELECT bs.id,
         NULLIF(regexp_replace(COALESCE(bs."contract", ''), '[^0-9]', '', 'g'), '')::int AS months,
         bs."contract" AS raw_contract
  FROM hrfs."BranchStaff" bs
  WHERE (bs."role" ILIKE '%coach%' OR bs."role" = 'BM')
    AND bs."status" = 'Active'
    AND ($branch_filter IS NULL OR bs."branch" = $branch_filter)
)
SELECT
  COUNT(*)::int AS total,
  COUNT(*) FILTER (WHERE raw_contract IS NOT NULL AND TRIM(raw_contract) <> '')::int AS ccp,
  COUNT(*) FILTER (WHERE months IN (15, 18))::int AS weekly_training,
  COUNT(*) FILTER (WHERE months IN (15, 18))::int AS toastmasters,
  COUNT(*) FILTER (WHERE months IN (15, 18))::int AS tprr,
  COUNT(*) FILTER (WHERE months = 18)::int          AS atcl_diploma
FROM parsed;
```

(In the real implementation, `$branch_filter` is conditionally appended via `params.push(...)` — same pattern as the existing endpoint.)

## Frontend (`CoachBmPerformancePage.tsx`) changes

- **Type update:** `CoachRow` drops `weekly_training`, `atcl_diploma`, `toastmasters`. Adds `programs: string[]` (and keeps `contract: string | null`).
- **Imports:** drop `useMutation` and `useQueryClient` from the `@tanstack/react-query` import.
- **Hooks:** drop `const queryClient = useQueryClient();` and the entire `toggleMutation = useMutation({...})` block.
- **Stats query:** unchanged URL, but the destructure handles the new shape:
  ```ts
  const ccpCount = stats?.ccp ?? 0;
  const wtCount = stats?.weekly_training ?? 0;
  const tmCount = stats?.toastmasters ?? 0;
  const tprrCount = stats?.tprr ?? 0;
  const atclCount = stats?.atcl_diploma ?? 0;
  const statsTotal = stats?.total ?? 0;
  ```
- **Stat-card grid:** replace the 3-card render with 5 cards in the order CCP / Weekly Training / Toastmasters / TPRR / ATCL Diploma.
- **Programs column:** replace the checkbox `<td>` with the chip-list renderer described above.
- **`PROGRAM_COLORS` constant** added at module scope.

## Permission, routing, layout

Unchanged. Page still gated by `student_db` permission, still mounted at `/coach-bm-performance`, still linked from the Student Database card on the home page.

## Trade-offs and notes

- **Three cards with identical numbers (Weekly Training, Toastmasters, TPRR).** Accepted by design.
- **Coaches with NULL contract are invisible to all cards.** They're real coaches but produce no program data. The Programs column shows `—` so HR can spot the gap. If you'd rather flag them more loudly (e.g. a 6th "Missing contract" card), reopen this spec.
- **Contract parsing is lenient.** `15M`, `15 Month`, `15 MONTH`, `15 month contract`, `15-month` all map to 15. Strings with no digits (e.g. `Permanent`, `TBC`) parse to NULL months → coach gets only CCP if `contract` is non-blank. This matches user intent.
- **The `017_drop_coach_program_enrollment.sql` migration is one-way.** If contract derivation later proves insufficient and we need overrides, we'd write `018_recreate_coach_program_enrollment.sql` (different migration, fresh design).
- **No data loss concern from dropping the table.** Manual ticks on staging/production were never used in earnest — the feature was minutes old when this redesign was requested.
