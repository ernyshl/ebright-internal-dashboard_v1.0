# Coach Student-Count Column Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Populate the `No. of Students` column on the Coach & BM Performance page with a per-branch count of students from the existing `studentrecords` table.

**Architecture:** Add a `branch_student_counts` CTE to the GET `/` query that aggregates `studentrecords` by branch, then LEFT JOIN it onto each coach row to get a `student_count` field. The frontend renders this in the existing column where `—` was previously hard-coded.

**Tech Stack:** Express + node-postgres (raw SQL), React 19 + TypeScript + Vite. No DB migration, no schema change.

**Spec:** [docs/superpowers/specs/2026-05-09-coach-student-count-design.md](../specs/2026-05-09-coach-student-count-design.md)

**Branch:** continue on `feat/coach-bm-performance`. Don't push to remote — user is testing locally.

---

## File Structure

| File | Change | Responsibility |
|---|---|---|
| `backend/src/routes/coachBmPerformance.js` | Modify | Add `getTableNames` import; add `branch_student_counts` CTE; add `student_count` column to GET / SELECT; LEFT JOIN the CTE |
| `frontend/src/pages/CoachBmPerformancePage.tsx` | Modify | Add `student_count: number` to `CoachRow`; replace `—` placeholder in the No. of Students cell |

This is one task. Splitting backend/frontend would force a broken interim state (frontend reading a field the backend doesn't return, or backend returning a field the frontend ignores).

---

## Task 1: Add the student count end-to-end

**Files:**
- Modify: `backend/src/routes/coachBmPerformance.js`
- Modify: `frontend/src/pages/CoachBmPerformancePage.tsx`

### Step 1: Add the `getTableNames` import

Open `backend/src/routes/coachBmPerformance.js`. Find the existing requires block at the top (currently has `express`, `pool`, `requireAuth`, `requireDashboard`). Add a fifth require:

```js
const { getTableNames } = require('../utils/tableNames');
```

Place it immediately after the existing `requireDashboard` require so the require block reads:

```js
const express = require('express');
const { pool } = require('../db');
const { requireAuth } = require('../middleware/auth');
const { requireDashboard } = require('../middleware/dashboards');
const { getTableNames } = require('../utils/tableNames');
```

### Step 2: Compute the students table name inside the GET / handler

Inside the `router.get('/', async (req, res, next) => { ... })` body, near the top of the `try` block (after the `const { search = '', branch = '', page = 1, limit = 50 } = req.query;` line and before the `conditions` array is built), add:

```js
const { students } = getTableNames();
```

The helper validates the table name against an allowlist (`'studentrecords'` or `'studentrecords_testing'`), so interpolating `${students}` into the SQL below is safe.

### Step 3: Update the data-query SQL

Find the `dataResult` `pool.query(` call inside the GET `/` handler. Currently the SQL string starts with `${nameLookupCte}` (which expands to `WITH name_lookup AS (...)`). Replace that single-CTE wrapper with a two-CTE wrapper that adds `branch_student_counts`, AND extend the SELECT and FROM to use it.

The current data query looks like:

```js
pool.query(
  `${nameLookupCte}
   SELECT bs.id,
          COALESCE(NULLIF(TRIM(bs."name"), ''), nl."name") AS name,
          bs."gender",
          bs."phone",
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
          END AS programs,
          COALESCE(
            (SELECT array_agg(cpc.program ORDER BY cpc.program)
               FROM coach_program_completion cpc
              WHERE cpc.branch_staff_id = bs.id),
            ARRAY[]::text[]
          ) AS completed_programs
   FROM hrfs."BranchStaff" bs
   LEFT JOIN name_lookup nl ON nl."nickname" = bs."nickname"
   ${where}
   ORDER BY name ASC
   LIMIT $${idx} OFFSET $${idx + 1}`,
  [...params, Number(limit), offset]
),
```

Replace it with:

```js
pool.query(
  `${nameLookupCte},
   branch_student_counts AS (
     SELECT branch, COUNT(*)::int AS cnt
     FROM ${students}
     GROUP BY branch
   )
   SELECT bs.id,
          COALESCE(NULLIF(TRIM(bs."name"), ''), nl."name") AS name,
          bs."gender",
          bs."phone",
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
          END AS programs,
          COALESCE(
            (SELECT array_agg(cpc.program ORDER BY cpc.program)
               FROM coach_program_completion cpc
              WHERE cpc.branch_staff_id = bs.id),
            ARRAY[]::text[]
          ) AS completed_programs,
          COALESCE(bsc.cnt, 0)::int AS student_count
   FROM hrfs."BranchStaff" bs
   LEFT JOIN name_lookup nl ON nl."nickname" = bs."nickname"
   LEFT JOIN branch_student_counts bsc ON bsc.branch = bs."branch"
   ${where}
   ORDER BY name ASC
   LIMIT $${idx} OFFSET $${idx + 1}`,
  [...params, Number(limit), offset]
),
```

Three diffs from the current state:

1. The opening `${nameLookupCte}` becomes `${nameLookupCte},\n   branch_student_counts AS (...)` — the comma turns the existing single-CTE into a two-CTE block, and the second CTE aggregates students by branch.
2. After `END AS programs, ... AS completed_programs,` a new `COALESCE(bsc.cnt, 0)::int AS student_count` column is appended.
3. After the existing `LEFT JOIN name_lookup nl ...` line, a new `LEFT JOIN branch_student_counts bsc ON bsc.branch = bs."branch"` is added.

Don't touch the count query (`countResult`), the WHERE conditions, ORDER BY, or LIMIT/OFFSET. Don't change `/stats` or PUT.

### Step 4: Verify backend syntax

```bash
node --check backend/src/routes/coachBmPerformance.js
```

Expected: no output.

### Step 5: Add `student_count` to the `CoachRow` type

Open `frontend/src/pages/CoachBmPerformancePage.tsx`. Find the `CoachRow` type:

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
};
```

Add `student_count: number` as the last field:

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

### Step 6: Replace the No. of Students placeholder cell

Find the existing data-row mapping in the table body. The two trailing cells are currently both rendering `—`. They look something like:

```tsx
<td style={{ ...td, color:'var(--muted)' }}>—</td>
<td style={{ ...td, color:'var(--muted)' }}>—</td>
```

The FIRST one is the No. of Lessons cell (stays as `—` per spec). The SECOND one is the No. of Students cell. Replace ONLY the second one with:

```tsx
<td style={{ ...td, color: r.student_count > 0 ? 'var(--text)' : 'var(--muted)', whiteSpace:'nowrap' }}>{r.student_count}</td>
```

The `r.student_count > 0` ternary keeps the cell visually subdued when zero (so a coach with `0` students doesn't visually compete with coaches who have students).

**Important — making sure you replace the right `<td>`:** the No. of Students cell is the LAST `<td>` in each `<tr>`, after the No. of Lessons cell. The header array order is `... 'No. of Lessons', 'No. of Students']`, so the cells in the row mirror that order. Read the file before editing to confirm placement; the file currently has these two cells at the end of the row mapping.

### Step 7: Type-check

```bash
cd frontend && npx tsc --noEmit
```

Expected: zero errors in `CoachBmPerformancePage.tsx`. Pre-existing errors in unrelated files (JsonTable, EventDashboardPage, FaDashboardPage, etc.) are out of scope — DO NOT fix them.

### Step 8: Manual smoke (optional, only if local stack is running and DB is up)

Restart the backend (`coachBmPerformance.js` changed). Hard-refresh `localhost:5174/coach-bm-performance`.

- Pick any coach in branch KD. Note the count in their `No. of Students` cell.
- Open `/student-database`, filter by branch KD, note the displayed count.
- Both numbers should match.
- Confirm every coach in the same branch shows the same count.
- Confirm a coach in a branch with zero students renders `0` in muted color.
- Confirm a coach with NULL/blank `branch` renders `0` in muted color.

### Step 9: Commit

```bash
git add backend/src/routes/coachBmPerformance.js frontend/src/pages/CoachBmPerformancePage.tsx
git commit -m "feat(coach-perf): populate No. of Students from branch totals"
```

---

## Self-review notes

**Spec coverage:**
- §Counting rule (branch-level, all non-archived) → Step 3 SQL.
- §Backend / `branch_student_counts` CTE → Step 3.
- §Backend / `getTableNames` import → Step 1.
- §Frontend / `student_count: number` type field → Step 5.
- §Frontend / replace `—` with `r.student_count` → Step 6.
- §Edge cases (zero, NULL branch, no-coach branches) → handled by `LEFT JOIN` + `COALESCE(bsc.cnt, 0)` in Step 3 SQL; rendering covered by Step 6 ternary.
- §Permissions, /stats, PUT all unchanged → no task needed.

**Placeholder scan:** No "TBD"/"TODO"/"similar to". Every step has either runnable commands or exact code blocks.

**Type/name consistency:**
- Field name `student_count` (snake_case from SQL alias, mapped to TS field `student_count`). Used identically in SQL `AS student_count`, `CoachRow.student_count`, and the JSX `r.student_count`. ✓
- CTE name `branch_student_counts` and alias `bsc`: used in the CTE definition, the JOIN, and the `COALESCE(bsc.cnt, 0)` reference. Consistent.
- `${students}` interpolation uses the same `getTableNames()` helper that `studentRecords.js` already uses — no new patterns introduced.

**Trade-off note:** the count CTE scans `studentrecords` once per request. With ~2,700 rows and ~20 distinct branches, this is sub-millisecond. No index added, no caching layer. If `studentrecords` grows past tens of thousands of rows, an index on `branch` would help — but YAGNI for now.
