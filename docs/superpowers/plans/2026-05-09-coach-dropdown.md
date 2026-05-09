# Coach Dropdown in Edit Student Modal Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the free-text Coach Name input in the Student Database's Edit modal with a strict dropdown of active coaches/BMs filtered to the student's branch, sourced from `hrfs."BranchStaff"`.

**Architecture:** New `GET /api/coach-bm-performance/coaches?branch=X` endpoint returns `{ coaches: [{id, name}] }`. The Edit modal swaps its `<input type="text">` for a `<select>` driven by a React Query keyed on `form.branch`, with disabled-state placeholders for loading / error / empty-branch and a synthetic option that surfaces stale `coachName` values that don't match any current option.

**Tech Stack:** Express + node-postgres (raw SQL), React 19 + TypeScript + Vite, `@tanstack/react-query`. No DB schema change.

**Spec:** [docs/superpowers/specs/2026-05-09-coach-dropdown-design.md](../specs/2026-05-09-coach-dropdown-design.md)

**Branch:** continue on `feat/coach-bm-performance`. Don't push to remote — user is testing locally.

---

## File Structure

| File | Change | Responsibility |
|---|---|---|
| `backend/src/routes/coachBmPerformance.js` | Modify | Add new `GET /coaches` handler |
| `frontend/src/components/StudentDB/EditStudentModal.tsx` | Modify | Add `useQuery` import + apiFetch import; replace coach `<input>` with state-aware `<select>` |

This is two files, but the changes are tightly coupled (frontend reads exactly what backend returns). Splitting into two tasks risks a broken interim state — the frontend would call an endpoint that doesn't exist, or vice versa. Bundling into one task.

---

## Task 1: Coach dropdown end-to-end

**Files:**
- Modify: `backend/src/routes/coachBmPerformance.js`
- Modify: `frontend/src/components/StudentDB/EditStudentModal.tsx`

### Step 1: Add the GET `/coaches` handler

Open `backend/src/routes/coachBmPerformance.js`. Insert this handler **immediately after the GET `/stats` handler** (which ends at its closing `});`) and **before the PUT `/:branchStaffId/completion` handler**. Placement matters because Express matches routes in declaration order — putting `/coaches` before `/:branchStaffId/...` rules out any future ambiguity.

```js
// GET /api/coach-bm-performance/coaches?branch=KTG
//
// Lookup endpoint for the Edit Student modal's coach dropdown.
// Returns { coaches: [{ id, name }] } for active coaches/BMs in the
// requested branch, sorted by name. Reuses the same name_lookup CTE
// as GET / to resolve stub-row names.
router.get('/coaches', async (req, res, next) => {
  try {
    const branch = (req.query.branch || '').toString().trim();
    if (!branch) {
      return res.status(400).json({ error: 'branch required' });
    }

    const { rows } = await pool.query(
      `WITH name_lookup AS (
         SELECT DISTINCT ON ("nickname") "nickname", "name"
         FROM hrfs."BranchStaff"
         WHERE "name" IS NOT NULL AND TRIM("name") <> ''
           AND "nickname" IS NOT NULL AND TRIM("nickname") <> ''
         ORDER BY "nickname", "createdAt" DESC
       )
       SELECT bs.id,
              COALESCE(NULLIF(TRIM(bs."name"), ''), nl."name") AS name
       FROM hrfs."BranchStaff" bs
       LEFT JOIN name_lookup nl ON nl."nickname" = bs."nickname"
       WHERE (bs."role" ILIKE '%coach%' OR bs."role" = 'BM')
         AND bs."status" = 'Active'
         AND bs."branch" = $1
         AND COALESCE(NULLIF(TRIM(bs."name"), ''), nl."name") IS NOT NULL
       ORDER BY name ASC`,
      [branch]
    );

    return res.json({ coaches: rows });
  } catch (err) { return next(err); }
});
```

### Step 2: Verify backend syntax

```bash
node --check backend/src/routes/coachBmPerformance.js
```

Expected: no output.

If the local backend and DB are running, smoke-test:

```bash
curl -s "$API/api/coach-bm-performance/coaches?branch=KTG" -H "Authorization: Bearer $TOKEN" | jq
# Expected: { "coaches": [{ "id": 355, "name": "ADLIA NURIN BADRISYA ..." }, ...] }

curl -s "$API/api/coach-bm-performance/coaches" -H "Authorization: Bearer $TOKEN" | jq
# Expected: 400 {"error": "branch required"}
```

### Step 3: Update the Edit modal imports

Open `frontend/src/components/StudentDB/EditStudentModal.tsx`. The current imports look like:

```tsx
import { useState } from 'react';
import React from 'react';
import { BRANCHES, GRADES, CHAPTERS } from '../../lib/studentTypes';
import { getFaCount, getPcmCount, reconcileFa } from '../../lib/studentFaLogic';
```

Add two imports — `useQuery` from React Query, and `apiFetch` from the api lib. The full import block becomes:

```tsx
import { useState } from 'react';
import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { BRANCHES, GRADES, CHAPTERS } from '../../lib/studentTypes';
import { getFaCount, getPcmCount, reconcileFa } from '../../lib/studentFaLogic';
import { apiFetch } from '../../lib/api';
```

### Step 4: Add the coach options query

Inside the `EditStudentModal` component, find the existing `useState` and `set` declarations. Just below the `set` function (and above the `const faCount = ...` line), add:

```tsx
const branch = form.branch;

const {
  data: coachData,
  isLoading: coachesLoading,
  isError: coachesError,
} = useQuery({
  queryKey: ['coachOptions', branch],
  queryFn: () => apiFetch(`/api/coach-bm-performance/coaches?branch=${encodeURIComponent(branch)}`),
  enabled: Boolean(branch),
  staleTime: 5 * 60 * 1000,
});

const coaches: { id: number; name: string }[] = coachData?.coaches || [];
const currentCoachInList = !form.coachName || coaches.some(c => c.name === form.coachName);
```

### Step 5: Replace the Coach Name input with a state-aware select

Find the current Coach Name block (the `<div>` with `<label>Coach Name</label>` and the free-text `<input>`):

```tsx
<div>
  <label style={lbl}>Coach Name</label>
  <input
    type="text"
    style={inp}
    placeholder="e.g., Coach Lim"
    value={form.coachName || ''}
    onChange={e => set('coachName', e.target.value)}
  />
</div>
```

Replace with:

```tsx
<div>
  <label style={lbl}>Coach Name</label>
  {(() => {
    if (coachesLoading) {
      return <select style={inp} disabled value=""><option value="">Loading coaches…</option></select>;
    }
    if (coachesError) {
      return <select style={inp} disabled value=""><option value="">Failed to load coaches</option></select>;
    }
    if (coaches.length === 0) {
      return <select style={inp} disabled value=""><option value="">No coaches in this branch</option></select>;
    }
    return (
      <select style={inp} value={form.coachName || ''} onChange={e => set('coachName', e.target.value)}>
        <option value="">— None —</option>
        {!currentCoachInList && form.coachName && (
          <option value={form.coachName}>{form.coachName} (not in {branch})</option>
        )}
        {coaches.map(c => (
          <option key={c.id} value={c.name}>{c.name}</option>
        ))}
      </select>
    );
  })()}
</div>
```

The IIFE keeps the four render-state branches readable inline. Each branch returns the same `style={inp}` so the dropdown's visual weight matches the surrounding inputs.

### Step 6: Type-check

```bash
cd frontend && npx tsc --noEmit
```

Expected: zero errors in `EditStudentModal.tsx`. Pre-existing errors in unrelated files are out of scope — DO NOT fix them.

### Step 7: Manual smoke (optional, only if local stack is running)

Restart the backend (route file changed). Hard-refresh `localhost:5174/student-database`. Click Edit on any student.

- Coach Name field shows a dropdown.
- For a student in branch KTG: dropdown lists active coaches/BMs assigned to KTG, sorted by name.
- For a student in a branch with no coaches: dropdown is disabled with `No coaches in this branch`.
- Switch the Branch select. The coach dropdown refetches automatically. The previously-selected coach name persists in `form.coachName`.
- If the student's saved `coach_name` doesn't match a coach in the new branch, the synthetic `(not in <branch>)` option appears at the top of the list and remains selected.
- Save the student. The selected coach name persists in the database (visible on next edit).

### Step 8: Commit

```bash
git add backend/src/routes/coachBmPerformance.js frontend/src/components/StudentDB/EditStudentModal.tsx
git commit -m "feat(student-db): coach dropdown sourced from BranchStaff"
```

---

## Self-review notes

**Spec coverage:**
- §Backend / new endpoint → Step 1.
- §Backend / 400 on missing branch → Step 1 (early return).
- §Backend / SQL with `name_lookup` CTE + role/status/branch filter + ORDER BY name → Step 1.
- §Frontend / `useQuery` + `apiFetch` imports → Step 3.
- §Frontend / coach options query keyed on branch → Step 4.
- §Frontend / disabled placeholders for loading/error/empty → Step 5.
- §Frontend / `— None —` + synthetic stale-value option + populated list → Step 5.
- §Frontend / branch-change auto-refetch → handled implicitly because `branch` is in the queryKey (Step 4).
- §Permissions unchanged → no task; the new endpoint inherits the existing `requireAuth + requireDashboard('student_db')` from `router.use(...)` at the top of the file.
- §Edge cases (zero coaches, stale value, network error, branch switch) → covered by Step 5 render branches.

**Placeholder scan:** No "TBD"/"TODO"/"similar to". Every step has either runnable commands or exact code blocks.

**Type/name consistency:**
- Endpoint path `/api/coach-bm-performance/coaches` — used identically in backend `router.get('/coaches', ...)` and frontend `apiFetch(...)` URL. ✓
- Response shape `{ coaches: [{ id, name }] }` — backend `res.json({ coaches: rows })`, frontend `coachData?.coaches`. ✓
- Query key `['coachOptions', branch]` — defined once in Step 4. No other consumer references it (cache will be invalidated implicitly when other queries don't touch it).
- React Query state names `coachData`, `coachesLoading`, `coachesError` — used consistently in the IIFE branches.

**Trade-off note:** the IIFE in JSX is unusual for this codebase. Rationale: extracting it to a helper function would require either inlining state via props or moving state out of the closure — both more disruptive than the IIFE. The IIFE keeps the four render-state branches local and readable. Acceptable for a 20-line block.
