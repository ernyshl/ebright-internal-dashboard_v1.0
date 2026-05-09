# Coach Program Completion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add per-(coach, program) completion checkboxes to the Coach & BM Performance page, persisting to a new `coach_program_completion` table. Stat cards switch to "completed / assigned" semantics.

**Architecture:** New row-per-completion table (PK on `(branch_staff_id, program)`). Backend GET adds a `completed_programs text[]` column via correlated subquery; new PUT toggles a single (coach, program) record with INSERT-or-DELETE; /stats expands to a nested `{ assigned: {...}, completed: {...} }` shape. Frontend wraps each chip in a `<label>` with a leading checkbox wired to a React Query mutation with optimistic updates.

**Tech Stack:** Express + node-postgres `pg` Pool (raw SQL via `backend/sql/*.sql` migration files), React 19 + TypeScript + Vite, `@tanstack/react-query` for data fetching and mutations, plain CSS via inline `style={...}` with CSS variables.

**Spec:** [docs/superpowers/specs/2026-05-09-coach-program-completion-design.md](../specs/2026-05-09-coach-program-completion-design.md)

**Branch:** continue on `feat/coach-bm-performance` (which has been pushed to `staging` already; this work appends without re-deploying until the user explicitly merges to staging again).

**Commit policy:** Each task commits. **Don't push to staging.** The user said "I want to test in localhost" — keep all commits local on `feat/coach-bm-performance` until they ask to push.

---

## File Structure

| File | Change | Responsibility |
|---|---|---|
| `backend/sql/018_create_coach_program_completion.sql` | Create | DDL for the new completion table + program index |
| `backend/src/routes/coachBmPerformance.js` | Modify | Add `completed_programs` to GET; add new PUT `/:branchStaffId/completion`; expand `/stats` response to `{ total, assigned, completed }` |
| `frontend/src/pages/CoachBmPerformancePage.tsx` | Modify | Add `completed_programs` to type; add `useMutation` for completion toggle; wrap chips with checkbox `<label>`; rewire stat cards to per-program assigned denominator |

No new files on the frontend. No tests added — codebase has no test runner; verification is `node --check` / `npx tsc --noEmit` / browser smoke-test.

---

## Task 1: Create the `coach_program_completion` table

**Files:**
- Create: `backend/sql/018_create_coach_program_completion.sql`

- [ ] **Step 1: Create the migration file**

Write `backend/sql/018_create_coach_program_completion.sql`:

```sql
-- 018_create_coach_program_completion.sql
--
-- Per-(coach, program) completion records for the Coach & BM Performance
-- page. Row exists  ⇒  the coach has completed that program.
-- Row absent      ⇒  not completed.
-- Toggling a checkbox off DELETEs the row rather than setting a flag,
-- so absence is the canonical "not completed" state.
--
-- branch_staff_id references hrfs."BranchStaff".id but no FK constraint
-- because BranchStaff lives in a foreign-data-wrapper schema and
-- cross-schema FKs to FDW tables are not supported.
--
-- `program` is a free-text label that must match the program names
-- emitted by the GET / endpoint's CASE expression: 'CCP', 'Weekly
-- Training', 'Toastmasters', 'TPRR', 'ATCL Diploma'. Validation is
-- enforced server-side, not via a CHECK constraint, so future
-- additions don't require a migration.

CREATE TABLE IF NOT EXISTS public.coach_program_completion (
  branch_staff_id  INTEGER     NOT NULL,
  program          TEXT        NOT NULL,
  completed_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_by     UUID        REFERENCES public.users(id) ON DELETE SET NULL,
  PRIMARY KEY (branch_staff_id, program)
);

CREATE INDEX IF NOT EXISTS idx_coach_program_completion_program
  ON public.coach_program_completion (program);
```

- [ ] **Step 2: Apply the migration to the local DB**

The user has HeidiSQL connected to `ebrightleads_db` (per session history). Two options for whoever is implementing:

**Option A — psql, if installed:**

```powershell
psql $env:DATABASE_URL -f backend/sql/018_create_coach_program_completion.sql
```

Expected: `CREATE TABLE` then `CREATE INDEX`.

**Option B — paste into HeidiSQL Query tab and run:**

```sql
CREATE TABLE IF NOT EXISTS public.coach_program_completion (
  branch_staff_id  INTEGER     NOT NULL,
  program          TEXT        NOT NULL,
  completed_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_by     UUID        REFERENCES public.users(id) ON DELETE SET NULL,
  PRIMARY KEY (branch_staff_id, program)
);
CREATE INDEX IF NOT EXISTS idx_coach_program_completion_program
  ON public.coach_program_completion (program);
```

If neither is available to you, report `DONE_WITH_CONCERNS` — the user can apply manually before browser testing.

- [ ] **Step 3: Verify the table exists (only if Step 2 ran)**

```sql
SELECT table_schema, table_name
FROM information_schema.tables
WHERE table_name = 'coach_program_completion';
```

Expected: one row, `public | coach_program_completion`.

- [ ] **Step 4: Commit**

```bash
git add backend/sql/018_create_coach_program_completion.sql
git commit -m "feat(coach-perf): add coach_program_completion table"
```

---

## Task 2: Add `completed_programs` to GET `/api/coach-bm-performance`

**Files:**
- Modify: `backend/src/routes/coachBmPerformance.js`

- [ ] **Step 1: Read the current file**

Open `backend/src/routes/coachBmPerformance.js`. Confirm the GET `/` handler currently has SELECT columns ending with the `programs` CASE expression and no `completed_programs` reference.

- [ ] **Step 2: Add `completed_programs` to the SELECT list**

Find the `dataResult` `pool.query(` call inside the GET `/` handler. Locate the closing of the `programs` CASE expression (which currently ends with `END AS programs`). Immediately after `END AS programs,` add the new column. The query SELECT clause should become:

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
       END AS programs,
       COALESCE(
         (SELECT array_agg(cpc.program ORDER BY cpc.program)
            FROM coach_program_completion cpc
           WHERE cpc.branch_staff_id = bs.id),
         ARRAY[]::text[]
       ) AS completed_programs
```

The diff is purely additive: a comma after `END AS programs`, then the new `COALESCE((SELECT array_agg ...), ARRAY[]::text[]) AS completed_programs` block. Everything else (FROM, WHERE, ORDER BY, LIMIT) is unchanged.

- [ ] **Step 3: Verify**

```bash
node --check backend/src/routes/coachBmPerformance.js
```

Expected: no output.

If you have the local backend running and DB updated:

```bash
curl -s "$API/api/coach-bm-performance?limit=2" -H "Authorization: Bearer $TOKEN" | jq '.records[0]'
# Expected: object with both `programs` and `completed_programs` arrays.
# Both should be `[]` for a fresh DB (no completion rows exist yet).
```

- [ ] **Step 4: Commit**

```bash
git add backend/src/routes/coachBmPerformance.js
git commit -m "feat(coach-perf): include completed_programs in GET response"
```

---

## Task 3: Add the PUT `/:branchStaffId/completion` endpoint

**Files:**
- Modify: `backend/src/routes/coachBmPerformance.js`

- [ ] **Step 1: Add the program allowlist**

Near the top of the file (after the `requires` and `router.use(...)` lines, before the GET `/` handler), add:

```js
// Server-side allowlist of program names the completion endpoint will
// accept. Keep in sync with the labels emitted by the GET / handler's
// CASE expression and with the frontend's PROGRAM_COLORS map keys.
const VALID_PROGRAMS = new Set(['CCP', 'Weekly Training', 'Toastmasters', 'TPRR', 'ATCL Diploma']);
```

- [ ] **Step 2: Add the PUT handler**

Insert this handler BEFORE the `module.exports = ...` line at the bottom of the file, AFTER the `/stats` handler:

```js
// PUT /api/coach-bm-performance/:branchStaffId/completion
//
// Body: { program: string, completed: boolean }
//
// `program` must be one of VALID_PROGRAMS AND currently assigned to the
// coach (the same contract → programs derivation that GET / uses). The
// assignment check prevents writing a completion for a program the
// coach isn't actually on (e.g. ATCL Diploma for a 9M coach).
//
// completed=true  → INSERT ... ON CONFLICT DO UPDATE (refresh timestamp)
// completed=false → DELETE (idempotent; missing row is fine)
router.put('/:branchStaffId/completion', async (req, res, next) => {
  try {
    const branchStaffId = parseInt(req.params.branchStaffId, 10);
    if (!Number.isInteger(branchStaffId) || branchStaffId <= 0) {
      return res.status(400).json({ error: 'Invalid branchStaffId' });
    }

    const { program, completed } = req.body || {};
    if (!VALID_PROGRAMS.has(program)) {
      return res.status(400).json({ error: 'Invalid program' });
    }
    if (typeof completed !== 'boolean') {
      return res.status(400).json({ error: 'completed must be boolean' });
    }

    // Guard: confirm the staff row exists, is Active coach/BM, and the
    // requested program is in their currently assigned set. Re-runs the
    // same CASE expression as GET /.
    const { rows: assignmentRows } = await pool.query(
      `SELECT
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
       WHERE bs.id = $1
         AND bs."status" = 'Active'
         AND (bs."role" ILIKE '%coach%' OR bs."role" = 'BM')`,
      [branchStaffId]
    );
    if (!assignmentRows.length) {
      return res.status(404).json({ error: 'Coach or BM not found' });
    }
    if (!assignmentRows[0].programs.includes(program)) {
      return res.status(422).json({ error: 'Program not assigned to this coach' });
    }

    const userId = req.user.sub;
    if (completed) {
      await pool.query(
        `INSERT INTO coach_program_completion
           (branch_staff_id, program, completed_at, completed_by)
         VALUES ($1, $2, NOW(), $3)
         ON CONFLICT (branch_staff_id, program) DO UPDATE SET
           completed_at = NOW(),
           completed_by = EXCLUDED.completed_by`,
        [branchStaffId, program, userId]
      );
    } else {
      await pool.query(
        `DELETE FROM coach_program_completion
         WHERE branch_staff_id = $1 AND program = $2`,
        [branchStaffId, program]
      );
    }

    return res.json({ ok: true, branch_staff_id: branchStaffId, program, completed });
  } catch (err) { return next(err); }
});
```

- [ ] **Step 3: Verify**

```bash
node --check backend/src/routes/coachBmPerformance.js
```

Expected: no output.

If the local backend is running and DB is updated, smoke-test:

```bash
# Pick any active coach/BM id from a previous GET response (e.g. 355).
curl -s -X PUT "$API/api/coach-bm-performance/355/completion" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"program":"CCP","completed":true}' | jq
# Expected: { "ok": true, "branch_staff_id": 355, "program": "CCP", "completed": true }

# Verify GET reflects it:
curl -s "$API/api/coach-bm-performance?search=adlia" -H "Authorization: Bearer $TOKEN" \
  | jq '.records[] | {name, programs, completed_programs}'
# Expected: completed_programs includes "CCP" for that coach.

# Toggle off:
curl -s -X PUT "$API/api/coach-bm-performance/355/completion" \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"program":"CCP","completed":false}' | jq
# Expected: { "ok": true, ..., "completed": false }

# Validation cases:
curl -s -X PUT "$API/api/coach-bm-performance/355/completion" \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"program":"foo","completed":true}' | jq
# Expected: 400 {"error":"Invalid program"}

# Unassigned program (e.g. ATCL Diploma on a 9M coach — pick any 9M coach id):
curl -s -X PUT "$API/api/coach-bm-performance/<9M_ID>/completion" \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"program":"ATCL Diploma","completed":true}' | jq
# Expected: 422 {"error":"Program not assigned to this coach"}
```

- [ ] **Step 4: Commit**

```bash
git add backend/src/routes/coachBmPerformance.js
git commit -m "feat(coach-perf): add PUT completion endpoint with assignment guard"
```

---

## Task 4: Update GET `/stats` to return assigned + completed counts

**Files:**
- Modify: `backend/src/routes/coachBmPerformance.js`

- [ ] **Step 1: Replace the `/stats` query**

Find the `router.get('/stats', ...)` handler. The current SQL inside it looks like:

```js
const { rows } = await pool.query(
  `WITH parsed AS (
     SELECT
       bs.id,
       NULLIF(regexp_replace(COALESCE(bs."contract", ''), '[^0-9]', '', 'g'), '')::int AS months,
       bs."contract" AS raw_contract
     FROM hrfs."BranchStaff" bs
     WHERE ${conditions.join(' AND ')}
   )
   SELECT
     COUNT(*)::int                                                                    AS total,
     COUNT(*) FILTER (WHERE raw_contract IS NOT NULL AND TRIM(raw_contract) <> '')::int AS ccp,
     COUNT(*) FILTER (WHERE months IN (15, 18))::int                                  AS weekly_training,
     COUNT(*) FILTER (WHERE months IN (15, 18))::int                                  AS toastmasters,
     COUNT(*) FILTER (WHERE months IN (15, 18))::int                                  AS tprr,
     COUNT(*) FILTER (WHERE months = 18)::int                                         AS atcl_diploma
   FROM parsed`,
  params
);
return res.json(rows[0]);
```

Replace the entire `pool.query(...)` AND the `return res.json(rows[0]);` with:

```js
const { rows } = await pool.query(
  `WITH parsed AS (
     SELECT
       bs.id,
       NULLIF(regexp_replace(COALESCE(bs."contract", ''), '[^0-9]', '', 'g'), '')::int AS months,
       bs."contract" AS raw_contract
     FROM hrfs."BranchStaff" bs
     WHERE ${conditions.join(' AND ')}
   )
   SELECT
     COUNT(*)::int AS total,
     -- assigned counts
     COUNT(*) FILTER (WHERE raw_contract IS NOT NULL AND TRIM(raw_contract) <> '')::int AS assigned_ccp,
     COUNT(*) FILTER (WHERE months IN (15, 18))::int                                    AS assigned_weekly_training,
     COUNT(*) FILTER (WHERE months IN (15, 18))::int                                    AS assigned_toastmasters,
     COUNT(*) FILTER (WHERE months IN (15, 18))::int                                    AS assigned_tprr,
     COUNT(*) FILTER (WHERE months = 18)::int                                           AS assigned_atcl_diploma,
     -- completed counts (only count completion if program is currently assigned)
     COUNT(*) FILTER (WHERE raw_contract IS NOT NULL AND TRIM(raw_contract) <> ''
                          AND EXISTS (SELECT 1 FROM coach_program_completion cpc
                                       WHERE cpc.branch_staff_id = parsed.id
                                         AND cpc.program = 'CCP'))::int                  AS completed_ccp,
     COUNT(*) FILTER (WHERE months IN (15, 18)
                          AND EXISTS (SELECT 1 FROM coach_program_completion cpc
                                       WHERE cpc.branch_staff_id = parsed.id
                                         AND cpc.program = 'Weekly Training'))::int      AS completed_weekly_training,
     COUNT(*) FILTER (WHERE months IN (15, 18)
                          AND EXISTS (SELECT 1 FROM coach_program_completion cpc
                                       WHERE cpc.branch_staff_id = parsed.id
                                         AND cpc.program = 'Toastmasters'))::int         AS completed_toastmasters,
     COUNT(*) FILTER (WHERE months IN (15, 18)
                          AND EXISTS (SELECT 1 FROM coach_program_completion cpc
                                       WHERE cpc.branch_staff_id = parsed.id
                                         AND cpc.program = 'TPRR'))::int                 AS completed_tprr,
     COUNT(*) FILTER (WHERE months = 18
                          AND EXISTS (SELECT 1 FROM coach_program_completion cpc
                                       WHERE cpc.branch_staff_id = parsed.id
                                         AND cpc.program = 'ATCL Diploma'))::int         AS completed_atcl_diploma
   FROM parsed`,
  params
);

const r = rows[0];
return res.json({
  total: r.total,
  assigned: {
    ccp:              r.assigned_ccp,
    weekly_training:  r.assigned_weekly_training,
    toastmasters:     r.assigned_toastmasters,
    tprr:             r.assigned_tprr,
    atcl_diploma:     r.assigned_atcl_diploma,
  },
  completed: {
    ccp:              r.completed_ccp,
    weekly_training:  r.completed_weekly_training,
    toastmasters:     r.completed_toastmasters,
    tprr:             r.completed_tprr,
    atcl_diploma:     r.completed_atcl_diploma,
  },
});
```

The handler now returns the nested shape from the spec. The flat snake_case columns get reshaped in JS so the SQL stays one query.

- [ ] **Step 2: Verify**

```bash
node --check backend/src/routes/coachBmPerformance.js
```

Expected: no output.

If local backend + DB are up:

```bash
curl -s "$API/api/coach-bm-performance/stats" -H "Authorization: Bearer $TOKEN" | jq
# Expected (with no completions ticked yet):
# {
#   "total": 125,
#   "assigned":  { "ccp": 97, "weekly_training": 83, "toastmasters": 83, "tprr": 83, "atcl_diploma": 1 },
#   "completed": { "ccp": 0,  "weekly_training": 0,  "toastmasters": 0,  "tprr": 0,  "atcl_diploma": 0 }
# }
# (Numbers will vary based on actual data; the shape and zeros for completed are what to check.)
```

- [ ] **Step 3: Commit**

```bash
git add backend/src/routes/coachBmPerformance.js
git commit -m "feat(coach-perf): expand /stats with completed counts"
```

---

## Task 5: Frontend — checkboxes, mutation, card rewiring

**Files:**
- Modify: `frontend/src/pages/CoachBmPerformancePage.tsx`

This task bundles the frontend changes because they all depend on the new API shape and would leave the page broken if split.

- [ ] **Step 1: Update the import**

Change:

```tsx
import { useQuery } from '@tanstack/react-query';
```

to:

```tsx
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
```

- [ ] **Step 2: Update the `CoachRow` type**

Find the existing type:

```tsx
type CoachRow = {
  id: number;
  name: string;
  gender: string | null;
  branch: string | null;
  start_date: string | null;
  contract: string | null;
  status: string | null;
  programs: string[];
};
```

Add `completed_programs: string[]`:

```tsx
type CoachRow = {
  id: number;
  name: string;
  gender: string | null;
  branch: string | null;
  start_date: string | null;
  contract: string | null;
  status: string | null;
  programs: string[];
  completed_programs: string[];
};
```

- [ ] **Step 3: Add `queryClient` and the toggle mutation**

Inside the `CoachBmPerformancePage` component, find the existing `useQuery` for the list (the one with `queryKey: ['coachBmPerformance', ...]`). Just below it AND below the `useQuery` for stats (`['coachBmPerformanceStats', branchFilter]`), add:

```tsx
const queryClient = useQueryClient();

const toggleCompletion = useMutation({
  mutationFn: ({ id, program, completed }: { id: number; program: string; completed: boolean }) =>
    apiFetch(`/api/coach-bm-performance/${id}/completion`, {
      method: 'PUT',
      body: { program, completed },
    }),
  onMutate: async ({ id, program, completed }) => {
    await queryClient.cancelQueries({ queryKey: ['coachBmPerformance'] });
    const queryKey = ['coachBmPerformance', branchFilter, searchQuery, page];
    const previous = queryClient.getQueryData<any>(queryKey);
    if (previous) {
      queryClient.setQueryData(queryKey, {
        ...previous,
        records: previous.records.map((r: CoachRow) => {
          if (r.id !== id) return r;
          const set = new Set(r.completed_programs);
          if (completed) set.add(program); else set.delete(program);
          return { ...r, completed_programs: Array.from(set) };
        }),
      });
    }
    return { previous, queryKey };
  },
  onError: (_err, _vars, ctx) => {
    if (ctx?.previous && ctx?.queryKey) {
      queryClient.setQueryData(ctx.queryKey, ctx.previous);
    }
  },
  onSettled: () => {
    queryClient.invalidateQueries({ queryKey: ['coachBmPerformance'] });
    queryClient.invalidateQueries({ queryKey: ['coachBmPerformanceStats'] });
  },
});
```

- [ ] **Step 4: Update the stat-card derivations and grid**

Find the existing block:

```tsx
const ccpCount   = stats?.ccp             ?? 0;
const wtCount    = stats?.weekly_training ?? 0;
const tmCount    = stats?.toastmasters    ?? 0;
const tprrCount  = stats?.tprr            ?? 0;
const atclCount  = stats?.atcl_diploma    ?? 0;
const statsTotal = stats?.total           ?? 0;
```

Replace with the new shape readers (the leading number is now *completed*; the denominator is per-program *assigned*):

```tsx
const assigned  = stats?.assigned  ?? {};
const completed = stats?.completed ?? {};

const ccpCount      = completed.ccp             ?? 0;
const wtCount       = completed.weekly_training ?? 0;
const tmCount       = completed.toastmasters    ?? 0;
const tprrCount     = completed.tprr            ?? 0;
const atclCount     = completed.atcl_diploma    ?? 0;

const ccpAssigned   = assigned.ccp              ?? 0;
const wtAssigned    = assigned.weekly_training  ?? 0;
const tmAssigned    = assigned.toastmasters     ?? 0;
const tprrAssigned  = assigned.tprr             ?? 0;
const atclAssigned  = assigned.atcl_diploma     ?? 0;
```

(Note: `statsTotal` is no longer used by stat cards. If it's referenced elsewhere on the page — e.g. the header subtitle or filter bar — keep a `const statsTotal = stats?.total ?? 0;` line. Otherwise remove it. Search the file for `statsTotal` to decide.)

Then find the `<div>` containing the five `statCard` calls. It currently looks like:

```tsx
<div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit, minmax(200px, 1fr))', gap:12, marginBottom:16 }}>
  {statCard('CCP',             ccpCount,  `/${statsTotal}`, '#0ea5e9', '📘')}
  {statCard('Weekly Training', wtCount,   `/${statsTotal}`, '#4f46e5', '🏋️')}
  {statCard('Toastmasters',    tmCount,   `/${statsTotal}`, '#10b981', '🎤')}
  {statCard('TPRR',            tprrCount, `/${statsTotal}`, '#f59e0b', '🗣️')}
  {statCard('ATCL Diploma',    atclCount, `/${statsTotal}`, '#8b5cf6', '🎓')}
</div>
```

Replace with per-program denominators:

```tsx
<div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit, minmax(200px, 1fr))', gap:12, marginBottom:16 }}>
  {statCard('CCP',             ccpCount,  `/${ccpAssigned}`,  '#0ea5e9', '📘')}
  {statCard('Weekly Training', wtCount,   `/${wtAssigned}`,   '#4f46e5', '🏋️')}
  {statCard('Toastmasters',    tmCount,   `/${tmAssigned}`,   '#10b981', '🎤')}
  {statCard('TPRR',            tprrCount, `/${tprrAssigned}`, '#f59e0b', '🗣️')}
  {statCard('ATCL Diploma',    atclCount, `/${atclAssigned}`, '#8b5cf6', '🎓')}
</div>
```

- [ ] **Step 5: Replace the Programs column body**

Find the `<td>` that renders the chip list. It currently looks like:

```tsx
<td style={td}>
  {r.programs.length === 0 ? (
    <span style={{ color:'var(--muted)' }}>—</span>
  ) : (
    <div style={{ display:'flex', flexDirection:'column', gap:3 }}>
      {r.programs.map(p => {
        const color = PROGRAM_COLORS[p] || '#6366f1';
        return (
          <span key={p} style={{
            fontSize:11, padding:'2px 8px', borderRadius:6, fontWeight:600,
            background: `${color}18`,
            color,
            alignSelf:'flex-start',
          }}>{p}</span>
        );
      })}
    </div>
  )}
</td>
```

Replace with the checkbox + chip variant:

```tsx
<td style={td}>
  {r.programs.length === 0 ? (
    <span style={{ color:'var(--muted)' }}>—</span>
  ) : (
    <div style={{ display:'flex', flexDirection:'column', gap:4 }}>
      {r.programs.map(p => {
        const color = PROGRAM_COLORS[p] || '#6366f1';
        const done = r.completed_programs.includes(p);
        return (
          <label key={p} style={{ display:'flex', alignItems:'center', gap:6, cursor:'pointer' }}>
            <input
              type="checkbox"
              checked={done}
              onChange={() => toggleCompletion.mutate({ id: r.id, program: p, completed: !done })}
              style={{ accentColor: color, cursor:'pointer' }}
            />
            <span style={{
              fontSize:11, padding:'2px 8px', borderRadius:6, fontWeight:600,
              background: `${color}18`,
              color,
              alignSelf:'flex-start',
            }}>{p}</span>
          </label>
        );
      })}
    </div>
  )}
</td>
```

The chip styling is unchanged. The wrapper changes from a `<span>` directly inside the flex column to a `<label>` containing a leading `<input type="checkbox">` and the same `<span>` chip.

- [ ] **Step 6: Verify**

```bash
cd frontend && npx tsc --noEmit
```

Expected: zero errors in `CoachBmPerformancePage.tsx`. Pre-existing errors in unrelated files are out of scope — DO NOT fix them.

If both servers are running and the DB has the new table:

1. Open `localhost:5174/coach-bm-performance` (hard-refresh to pick up the new bundle).
2. Verify each chip now has a leading checkbox.
3. Tick a checkbox. The card for that program should increment its leading number; the chip's checkbox stays ticked.
4. Refresh the page. The tick persists.
5. Untick the same checkbox. Card decrements; the row reflects unchecked.
6. Switch the branch filter. Stat-card numbers update; ticks for visible coaches retain their state.
7. Find a 9M coach (only `CCP` chip). Try ticking CCP — it should work. Verify there's no way to tick `ATCL Diploma` for that coach (no chip exists for them).

- [ ] **Step 7: Commit**

```bash
git add frontend/src/pages/CoachBmPerformancePage.tsx
git commit -m "feat(coach-perf): add completion checkboxes and rewire cards"
```

---

## Task 6: Local end-to-end verification

This task adds no code. It walks the end-to-end behavior locally before the user decides whether to push to staging.

- [ ] **Step 1: Confirm both servers are running and DB is up to date**

Run the migration manually if not already applied (use HeidiSQL or psql; the SQL is in `backend/sql/018_create_coach_program_completion.sql`).

Backend: `cd backend && npm run dev`
Frontend: `cd frontend && npm run dev`

- [ ] **Step 2: Walk the happy path**

Open `localhost:5174/coach-bm-performance`:

- 5 cards: CCP, Weekly Training, Toastmasters, TPRR, ATCL Diploma. Each shows `0 / <assigned>` initially.
- Programs column shows chips with leading checkboxes.
- 9M coach: 1 chip + 1 checkbox (CCP only).
- 15M coach: 4 chips + 4 checkboxes.
- 18M coach: 5 chips + 5 checkboxes.
- Coach with no contract: `—`, no checkboxes.

Tick CCP for one coach. Cards update immediately (optimistic). Refresh. Persists.

- [ ] **Step 3: Walk the edge cases**

- Tick all 5 programs for one 18M coach. CCP shows 1, Weekly Training shows 1, etc.
- Pick that coach in HeidiSQL/psql, change `BranchStaff.contract` to `15M`. Refresh page. The coach now has 4 chips (no ATCL Diploma). The stat cards' completed counts: CCP, WT, Toastmasters, TPRR each still show 1. ATCL Diploma drops to 0 (because the program is no longer assigned). The DB row for the ATCL completion still exists (preserved). Change contract back to `18M`; the ATCL chip reappears already-checked.
- Try with a coach who has no contract — confirm no chips, and the cards' assigned numbers don't include them.
- Hit the page as a user without `student_db` access — confirm 403 from the API and redirect to `/` from the route guard.

- [ ] **Step 4: Confirm no regression on the other Student Database pages**

Open `/student-database`, `/archived-students`, `/student-attendance`. All should render normally — this work doesn't touch them.

- [ ] **Step 5: Done**

If all checks pass, the feature is ready. Don't push to staging until the user explicitly asks.

---

## Self-review notes

**Spec coverage:**
- §Storage → Task 1.
- §Backend / GET adds `completed_programs` → Task 2.
- §Backend / new PUT → Task 3.
- §Backend / `/stats` returns `{ total, assigned, completed }` → Task 4.
- §Frontend / type, mutation, checkboxes, card rewiring → Task 5.
- §Edge cases (contract change preserves history, unassigned program rejected, idempotent untick, concurrent ticks) → exercised in Task 6 manual verification.
- §Permissions unchanged → no task; the new PUT inherits the existing `requireAuth` + `requireDashboard('student_db')` from `router.use(...)`.

**Placeholder scan:** No "TBD"/"TODO"/"similar to". Every step has either runnable commands or exact code.

**Type/name consistency:**
- `completed_programs` (snake_case) used identically across SQL alias, JSON response, `CoachRow.completed_programs`, and `r.completed_programs.includes(...)`. ✓
- Program label strings: `'CCP'`, `'Weekly Training'`, `'Toastmasters'`, `'TPRR'`, `'ATCL Diploma'`. Used identically in: `VALID_PROGRAMS` Set (Task 3), CASE expression in GET / and the assignment-guard subquery in PUT (Tasks 2 + 3), stats SQL (Task 4), `PROGRAM_COLORS` map keys (already in file — no change in this plan), and the chip rendering. Plural "Toastmasters" everywhere. ✓
- Stats nested-shape field names: `total`, `assigned.{ccp, weekly_training, toastmasters, tprr, atcl_diploma}`, `completed.{...same five...}`. SQL columns use `assigned_<x>` / `completed_<x>` underscore-separated and the handler reshapes; frontend reads via `stats.assigned.<x>` / `stats.completed.<x>`. ✓
- Mutation payload field names: `id`, `program`, `completed`. Used identically in `mutationFn`, request body, and PUT handler param parsing. ✓

**Trade-off note:** Task 5 bundles five sub-changes into one commit because intermediate states would render the page broken (e.g. checking against `r.completed_programs` before the API returns it would crash). The plan accepts the larger commit in exchange for never landing on a broken state mid-task.
