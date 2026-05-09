# Coach Student-Count Column — Design

**Date:** 2026-05-09
**Owner:** Academy / Student Database
**Status:** Draft — pending implementation

## Goal

Populate the `No. of Students` column on the Coach & BM Performance page with a live count of students at each coach's branch, sourced from the existing `studentrecords` table. Replaces the current `—` placeholder.

## Background

The Coach & BM Performance page already has a `No. of Students` placeholder column. Coach-to-student linkage is currently weak — the Student Database's `coach_name` column is rarely populated, so a per-coach exact match would return 0 for almost everyone today. Branch-level aggregation gives a meaningful number immediately and works without a backfill.

## Non-goals

- **Coach-name backfill**: populating `student.coach_name` from the coaches list is a separate, future feature with its own spec.
- **Per-coach student counts**: not in scope today. The column shows branch totals; every coach in the same branch shows the same number. Acceptable trade-off given current data quality.
- **No. of Lessons column**: still `—`. Different data source, different scope.
- **Filtering or drilling**: clicking the count number does NOT navigate to a filtered Student Database view. (Possible future enhancement.)

## Counting rule

For each coach/BM row, `No. of Students` = count of rows in `studentrecords` where `student.branch = coach.branch`.

- All non-archived statuses included (Active + Inactive). Archived students live in a separate `archived_students` table and are excluded by virtue of querying only `studentrecords`.
- Coaches whose `branch` matches no students get `0` (not blank, not `—`).
- Coaches whose `branch` is NULL/blank also get `0`.
- Branch matching is exact-string (case-sensitive). The `BRANCHES` constant and `BranchStaff.branch` codes already share the same canonical form (e.g. `KTG`, `BTHO`), so this is fine.

## Backend

### `routes/coachBmPerformance.js` GET `/` handler

Add a second CTE alongside the existing `name_lookup` that aggregates branch student counts:

```sql
WITH name_lookup AS (
  SELECT DISTINCT ON ("nickname") "nickname", "name"
  FROM hrfs."BranchStaff"
  WHERE "name" IS NOT NULL AND TRIM("name") <> ''
    AND "nickname" IS NOT NULL AND TRIM("nickname") <> ''
  ORDER BY "nickname", "createdAt" DESC
),
branch_student_counts AS (
  SELECT branch, COUNT(*)::int AS cnt
  FROM ${students}
  GROUP BY branch
)
SELECT bs.id,
       ...,
       CASE ... END AS programs,
       COALESCE(...) AS completed_programs,
       COALESCE(bsc.cnt, 0)::int AS student_count
FROM hrfs."BranchStaff" bs
LEFT JOIN name_lookup nl ON nl."nickname" = bs."nickname"
LEFT JOIN branch_student_counts bsc ON bsc.branch = bs."branch"
${where}
ORDER BY name ASC
LIMIT $${idx} OFFSET $${idx + 1}
```

The `${students}` interpolation uses the existing `getTableNames()` helper from `backend/src/utils/tableNames.js`, the same one `studentRecords.js` already uses. The helper validates the table name against an allowlist, so no SQL-injection surface is introduced.

The `LEFT JOIN` and `COALESCE(bsc.cnt, 0)` pair ensures coaches at branches with no students (or with a NULL `branch`) return `0` cleanly.

The count CTE only needs to be in the data query — the count query (`countResult`) doesn't return per-row data so it doesn't need it.

### Imports

Add `const { getTableNames } = require('../utils/tableNames');` near the existing requires at the top of the file.

### `/stats` and PUT handlers

Unchanged — the student-count column is per-row only and doesn't roll up to a stat card.

## Frontend

### `CoachBmPerformancePage.tsx`

**Type update:** add `student_count: number` to `CoachRow`. Place it after `completed_programs`:

```tsx
type CoachRow = {
  id: number;
  name: string;
  gender: string | null;
  phone: string | null;
  branch: string | null;
  start_date: string | null;
  contract: string | null;
  status: string | null;
  programs: string[];
  completed_programs: string[];
  student_count: number;
};
```

**Cell update:** replace the existing `<td style={{ ...td, color:'var(--muted)' }}>—</td>` for the No. of Students column with:

```tsx
<td style={{ ...td, color: r.student_count > 0 ? 'var(--text)' : 'var(--muted)', whiteSpace:'nowrap' }}>
  {r.student_count}
</td>
```

When `student_count` is 0, the muted color signals "no students" without the `—` placeholder. When non-zero, normal text color.

The No. of Lessons cell stays as `—` (untouched).

## Permissions

Unchanged. Reading `studentrecords` row counts is no more sensitive than the existing Student Database card — both gated by `student_db` permission.

## Performance

The `branch_student_counts` CTE scans `studentrecords` once per request and groups by branch. With ~2,700 student rows and ~20 branches, this is a fraction of a millisecond. No index needed; PostgreSQL will sequential-scan and hash-aggregate.

The page is paginated (50 rows), so the JOIN evaluates the small `branch_student_counts` table for each of the 50 coach rows on the current page — trivial.

## Edge cases

| Situation | Behavior |
|---|---|
| Coach's branch has no students | `student_count: 0`, rendered in muted color |
| Coach's `branch` is NULL/blank | `student_count: 0` (no JOIN match) |
| Branch in BranchStaff but not in students table | `student_count: 0` |
| Branch in students table but no coaches there | Not visible on this page (page only lists coaches/BMs); branch's students are still counted on Student Database itself |
| Student record's `branch` doesn't match any `BRANCHES` code | Excluded from JOIN; doesn't contribute to any coach's count |
| Concurrent student adds/removes between two page requests | Page-load shows the count at request time; no caching beyond React Query's 2-minute `staleTime` |

## Testing

No automated tests (codebase has no runner). Manual verification:

1. After backend restart, hard-refresh `localhost:5174/coach-bm-performance`.
2. Pick any coach in branch KD (or any branch with known students).
3. Open the Student Database, filter by that branch, note the count shown.
4. Confirm every coach in that branch shows the same number on the performance page.
5. Pick a coach in a branch with zero students (e.g. ONL coaches if ONL has none, or any obscure branch). Confirm `0` rendered in muted color.
