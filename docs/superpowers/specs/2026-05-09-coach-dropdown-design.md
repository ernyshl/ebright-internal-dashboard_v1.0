# Coach Dropdown in Edit Student Modal — Design

**Date:** 2026-05-09
**Owner:** Academy / Student Database
**Status:** Draft — pending implementation

## Goal

Replace the free-text Coach Name input in the Student Database's Edit modal with a strict dropdown populated from `hrfs."BranchStaff"`, scoped to the student's currently-selected branch. The dropdown stores the coach's full name into `student.coach_name`.

## Non-goals

- The Add Student modal stays free-text for now. (Separate follow-up if needed.)
- The Student Database table view's display of `coach_name` is unchanged — still shows the stored text as-is.
- Bulk reassignment of coaches across many students.
- Backfilling existing `student.coach_name` text to match canonical BranchStaff names. Existing values are preserved verbatim.
- Schema changes — `student.coach_name` remains TEXT.

## Backend — new endpoint

### `GET /api/coach-bm-performance/coaches?branch=KTG`

Lives in `backend/src/routes/coachBmPerformance.js`, inheriting the existing router-level `requireAuth + requireDashboard('student_db')` middleware.

**Request:**
- Required query param `branch` (string).

**Response:**
```json
{ "coaches": [ { "id": 355, "name": "ADLIA NURIN BADRISYA BINTI AWALLUDIN" }, ... ] }
```

**Behavior:**
- Returns 400 `{ error: 'branch required' }` if `branch` is missing or empty after trim.
- Filters `hrfs."BranchStaff"` to `(bs."role" ILIKE '%coach%' OR bs."role" = 'BM') AND bs."status" = 'Active' AND bs."branch" = $1`.
- Reuses the same `name_lookup` CTE pattern as GET `/` to resolve stub-row names (rows with blank `bs.name` borrow from a sibling row's `name` keyed by `nickname`).
- Filters out rows where neither `bs.name` nor the lookup yields a non-empty name.
- ORDER BY resolved name ASC.
- `id` is `bs.id` from BranchStaff.

**SQL:**
```sql
WITH name_lookup AS (
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
ORDER BY name ASC
```

## Frontend — `EditStudentModal.tsx`

### Imports

Add a single new import:

```tsx
import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '../../lib/api';
```

(`useQuery` already exists elsewhere in the codebase; the modal currently doesn't use it. The import path for `apiFetch` is `'../../lib/api'` from this file's location.)

### Coach options query

Inside the `EditStudentModal` component (after the existing `useState`/`set` declarations):

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

The `enabled: Boolean(branch)` guards against firing the query when branch is somehow empty (defensive — `BRANCHES` always has at least one entry, but being explicit avoids a bad request).

### Replace the Coach Name input

The current free-text `<input>` block (lines 71–79 of the existing file):

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

Becomes:

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

The IIFE keeps the four render-state branches readable inline. Disabled selects use a lone option for the placeholder text — same visual weight as a regular dropdown, no jumpy layout.

### Branch-change behavior

When the user changes `form.branch`, React Query auto-refetches because `branch` is in the query key. The `form.coachName` value is **not** auto-cleared — the user picks a new coach explicitly (or `— None —` to clear). If their saved coach isn't in the new branch's list, the synthetic `(not in <branch>)` option keeps the existing value visible and selectable, preserving data while flagging the mismatch.

## Permissions

Unchanged. The new endpoint is in the `coachBmPerformance.js` router which already has `router.use(requireAuth); router.use(requireDashboard('student_db'));` — applies to all routes including the new one. The Edit modal itself is reached from the Student Database page, also gated by `student_db`.

## Edge cases

| Situation | Behavior |
|---|---|
| Student's branch has zero active coaches/BMs | Dropdown disabled with `No coaches in this branch`. Existing `coach_name` text is still saved on submit (unchanged). |
| Student's saved `coach_name` doesn't match any option in current branch | Synthetic option `<name> (not in <branch>)` shown at top of list, preserving the value. User can pick a different option to overwrite. |
| User switches branch mid-edit | Coach list refetches. Saved coach value persists. If it doesn't match new branch, synthetic option appears. |
| Network error | Dropdown disabled with `Failed to load coaches`. User can cancel the modal and retry, or save without changing the coach. |
| Two coaches share the same full name | Both appear; selection stores whichever `name` string was clicked. (No disambiguation in this iteration.) |
| Stub rows in BranchStaff with no resolvable name | Filtered out by the `name_lookup` CTE — match the GET `/` endpoint's existing behavior. |
| Inactive coaches (e.g. just offboarded) | Excluded. If a student's `coach_name` references an inactive coach, the synthetic-option fallback shows it. |

## Trade-offs

- **Strict dropdown** loses some flexibility when HR is slow to register a new coach in BranchStaff. Trade-off accepted by the user during brainstorm — clean data > flexibility for now.
- **Full name as stored value** can be long (e.g. 35+ chars), but matches the Coach & BM Performance display and avoids nickname collisions.
- **No fuzzy match against existing free-text values**: a student whose `coach_name` is currently `'Adlia'` (nickname) won't auto-match the `'ADLIA NURIN ...'` option. The synthetic-option fallback handles this gracefully.

## Out of scope (intentional)

- AddStudentModal — keeps text input.
- Bulk import / CSV upload — coach name still arrives as text.
- Display-side changes to the Student Database table — still shows stored text.
- Coach assignment audit trail (who set this, when).
- A "view all students for this coach" reverse-link.
