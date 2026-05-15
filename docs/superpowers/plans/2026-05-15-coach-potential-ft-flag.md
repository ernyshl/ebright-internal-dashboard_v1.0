# Coach Potential FT Flag Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a "Potential FT Coach" checkbox column to the Coach & BM Performance page so academy can flag PT Coaches as promotion candidates. The checkbox appears only when `bs.role = 'PT - Coach'`; FT Coach and BM rows show `—`.

**Architecture:** New `public.coach_potential_ft_flag` table (PK on `branch_staff_id`) parallels `coach_training_completion`. Backend exposes a `potential_ft` boolean via LEFT JOIN in `GET /api/coach-bm-performance` and a new `PUT /:id/potential-ft` endpoint guarded on `role = 'PT - Coach'` for sets only (unset always allowed). Frontend adds one column between "Training Completed" and "Programs", plus a `togglePotentialFt` mutation parallel to the existing checkbox mutations.

**Tech Stack:** Postgres, Node/Express (backend, port 4000, `nodemon`), React + Vite + TanStack Query (frontend, Vite proxies `/api` to `http://127.0.0.1:4000`).

**Branch:** Working on `fix/schema-qualify-dashboards-middleware` (already checked out).

**Manual verification only.** No automated tests for this page exist; verification is via clicking through the UI and SQL spot-checks. Each task ends with a commit.

**Spec:** [docs/superpowers/specs/2026-05-15-coach-potential-ft-flag-design.md](../specs/2026-05-15-coach-potential-ft-flag-design.md)

---

## File Structure

| File | Action | Responsibility |
|---|---|---|
| `backend/sql/020_create_coach_potential_ft_flag.sql` | Create | Schema migration for the new table |
| `backend/src/routes/coachBmPerformance.js` | Modify | Add `potential_ft` to GET / SELECT; add new PUT /:id/potential-ft endpoint |
| `frontend/src/pages/CoachBmPerformancePage.tsx` | Modify | Add column header, type field, cell render, and mutation |

---

## Task 1: Create the migration SQL file

**Files:**
- Create: `backend/sql/020_create_coach_potential_ft_flag.sql`

- [ ] **Step 1: Write the migration file**

Create `backend/sql/020_create_coach_potential_ft_flag.sql` with exactly:

```sql
-- 020_create_coach_potential_ft_flag.sql
--
-- Per-coach "potential FT Coach" flag for the Coach & BM Performance
-- page. Row exists  ⇒  academy has flagged this PT Coach as a candidate
-- for FT promotion. Row absent  ⇒  not flagged.
-- Toggling the checkbox off DELETEs the row (absence is canonical).
--
-- branch_staff_id references hrfs."BranchStaff".id but no FK constraint
-- because BranchStaff lives in a foreign-data-wrapper schema and
-- cross-schema FKs to FDW tables are not supported (same reason
-- coach_training_completion and coach_program_completion omit theirs).
--
-- The "PT - Coach only" rule is enforced server-side (PUT endpoint),
-- not via a CHECK constraint, so the rule can evolve without a
-- migration.

CREATE TABLE IF NOT EXISTS public.coach_potential_ft_flag (
  branch_staff_id  INTEGER     PRIMARY KEY,
  flagged_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  flagged_by       UUID        REFERENCES public.users(id) ON DELETE SET NULL
);
```

- [ ] **Step 2: Apply the migration (operator action — do NOT run inside the dev session)**

The dashboard's dev pool connects to a shared Postgres at `103.209.156.174:5433/ebrightleads_db`. Apply the migration manually in HeidiSQL (or psql) when ready to deploy. Subagents implementing this task should NOT attempt to apply the SQL — just create the file and commit.

- [ ] **Step 3: Commit**

```bash
git add backend/sql/020_create_coach_potential_ft_flag.sql
git commit -m "feat(db): add coach_potential_ft_flag table"
```

---

## Task 2: Backend — extend `GET /api/coach-bm-performance` to expose `potential_ft`

Add a LEFT JOIN to the new table and surface the boolean in the response.

**Files:**
- Modify: `backend/src/routes/coachBmPerformance.js` (the `GET /` handler's data query only)

- [ ] **Step 1: Add the LEFT JOIN and the boolean to the SELECT**

Open `backend/src/routes/coachBmPerformance.js`. In the `router.get('/', ...)` handler, locate the data query inside `Promise.all([...])` (the second `pool.query(...)` call, whose SQL begins `${nameLookupCte},`). Make TWO small edits to its SQL:

Find:

```sql
                COALESCE(bsc.cnt, 0)::int AS student_count,
                (ctc.branch_staff_id IS NOT NULL) AS training_confirmed,
                ctc.confirmed_at                  AS training_confirmed_at
         FROM hrfs."BranchStaff" bs
         LEFT JOIN name_lookup nl ON nl."nickname" = bs."nickname"
         LEFT JOIN branch_student_counts bsc ON bsc.branch = bs."branch"
         LEFT JOIN public.coach_training_completion ctc ON ctc.branch_staff_id = bs.id
```

Replace with:

```sql
                COALESCE(bsc.cnt, 0)::int AS student_count,
                (ctc.branch_staff_id IS NOT NULL) AS training_confirmed,
                ctc.confirmed_at                  AS training_confirmed_at,
                (pft.branch_staff_id IS NOT NULL) AS potential_ft
         FROM hrfs."BranchStaff" bs
         LEFT JOIN name_lookup nl ON nl."nickname" = bs."nickname"
         LEFT JOIN branch_student_counts bsc ON bsc.branch = bs."branch"
         LEFT JOIN public.coach_training_completion ctc ON ctc.branch_staff_id = bs.id
         LEFT JOIN public.coach_potential_ft_flag pft ON pft.branch_staff_id = bs.id
```

(Two additions: the `potential_ft` line in SELECT, and the new LEFT JOIN below the existing one. The trailing comma after `training_confirmed_at` is added.)

The COUNT query, `where`, `nameLookupCte`, `/stats`, `/coaches`, `/:id/completion`, and `/:id/training-completion` handlers are NOT changed.

- [ ] **Step 2: Verify JS syntax**

```bash
node -c backend/src/routes/coachBmPerformance.js
```

Expected: exit 0, no output.

- [ ] **Step 3: Commit**

```bash
git add backend/src/routes/coachBmPerformance.js
git commit -m "feat(coach-bm): expose potential_ft in GET / response"
```

---

## Task 3: Backend — new endpoint `PUT /:branchStaffId/potential-ft`

Adds the persistence endpoint for the new checkbox. Untick is always allowed; tick requires `role = 'PT - Coach'`.

**Files:**
- Modify: `backend/src/routes/coachBmPerformance.js` (add new route handler before `module.exports`)

- [ ] **Step 1: Add the new route handler**

Insert this new handler in `backend/src/routes/coachBmPerformance.js` immediately before the `module.exports = { coachBmPerformanceRouter: router };` line at the bottom of the file. If the file ends with the existing `/:branchStaffId/training-completion` handler, place this new one after it with a single blank line between them.

```javascript
// PUT /api/coach-bm-performance/:branchStaffId/potential-ft
//
// Body: { flagged: boolean }
//
// Records (or removes) academy's flag that a PT Coach is a candidate
// for FT promotion.
//
// Guards:
//   1. Row exists, is Active, and is a coach or BM.
//   2. For flagged=true ONLY: role must be 'PT - Coach' (exact match).
//      Untick (flagged=false) is always allowed regardless of role —
//      covers the case where HR corrects role from PT to FT after a
//      flag was set.
//
// flagged=true  → INSERT ... ON CONFLICT DO UPDATE (refresh timestamp)
// flagged=false → DELETE (idempotent)
router.put('/:branchStaffId/potential-ft', async (req, res, next) => {
  try {
    const branchStaffId = parseInt(req.params.branchStaffId, 10);
    if (!Number.isInteger(branchStaffId) || branchStaffId <= 0) {
      return res.status(400).json({ error: 'Invalid branchStaffId' });
    }

    const { flagged } = req.body || {};
    if (typeof flagged !== 'boolean') {
      return res.status(400).json({ error: 'flagged must be boolean' });
    }

    const { rows: staffRows } = await pool.query(
      `SELECT bs."role" AS role
         FROM hrfs."BranchStaff" bs
        WHERE bs.id = $1
          AND bs."status" = 'Active'
          AND (bs."role" ILIKE '%coach%' OR bs."role" = 'BM')`,
      [branchStaffId]
    );
    if (!staffRows.length) {
      return res.status(404).json({ error: 'Coach or BM not found' });
    }

    if (flagged) {
      if (staffRows[0].role !== 'PT - Coach') {
        return res.status(422).json({ error: 'Only PT Coaches can be flagged' });
      }

      const userId = req.user.sub;
      await pool.query(
        `INSERT INTO public.coach_potential_ft_flag
           (branch_staff_id, flagged_at, flagged_by)
         VALUES ($1, NOW(), $2)
         ON CONFLICT (branch_staff_id) DO UPDATE SET
           flagged_at = NOW(),
           flagged_by = EXCLUDED.flagged_by`,
        [branchStaffId, userId]
      );
    } else {
      await pool.query(
        `DELETE FROM public.coach_potential_ft_flag
         WHERE branch_staff_id = $1`,
        [branchStaffId]
      );
    }

    return res.json({ ok: true, branch_staff_id: branchStaffId, flagged });
  } catch (err) { return next(err); }
});
```

- [ ] **Step 2: Verify JS syntax**

```bash
node -c backend/src/routes/coachBmPerformance.js
```

Expected: exit 0.

- [ ] **Step 3: Commit**

```bash
git add backend/src/routes/coachBmPerformance.js
git commit -m "feat(coach-bm): PUT /:id/potential-ft endpoint (PT Coach only)"
```

---

## Task 4: Frontend — add `potential_ft` to type, add header, update colSpan

**Files:**
- Modify: `frontend/src/pages/CoachBmPerformancePage.tsx`

- [ ] **Step 1: Add `potential_ft` to the `CoachRow` type**

Find the existing `CoachRow` type (around line 20). It currently ends with:

```typescript
  training_confirmed: boolean;
  training_confirmed_at: string | null;
};
```

Add one new field on its own line just before the closing `};`:

```typescript
  training_confirmed: boolean;
  training_confirmed_at: string | null;
  potential_ft: boolean;
};
```

- [ ] **Step 2: Insert the new header in the `<thead>` array**

Find:

```typescript
{['No.','Name','Gender','Phone','Branch','Role','Training Start Date','Training End Date','Contract Period','Training Completed','Programs','No. of Lessons','No. of Students'].map(h => (
```

Replace with:

```typescript
{['No.','Name','Gender','Phone','Branch','Role','Training Start Date','Training End Date','Contract Period','Training Completed','Potential FT Coach','Programs','No. of Lessons','No. of Students'].map(h => (
```

(Insert `'Potential FT Coach'` between `'Training Completed'` and `'Programs'`.)

- [ ] **Step 3: Update the empty-row `colSpan`**

Find:

```typescript
<tr><td colSpan={13} style={{ ...td, textAlign:'center', padding:'48px 16px', color:'var(--muted)' }}>
```

Change `colSpan={13}` to `colSpan={14}`.

- [ ] **Step 4: Verify lint passes for this file**

```bash
cd frontend && npm run lint 2>&1 | grep -i CoachBm
```

Expected: no NEW errors related to `CoachBmPerformancePage.tsx` (existing repo-wide warnings are fine).

- [ ] **Step 5: Commit**

```bash
cd ..
git add frontend/src/pages/CoachBmPerformancePage.tsx
git commit -m "refactor(coach-bm): add Potential FT Coach header + type field"
```

---

## Task 5: Frontend — render Potential FT Coach cell + add mutation

**Files:**
- Modify: `frontend/src/pages/CoachBmPerformancePage.tsx`

- [ ] **Step 1: Add the `togglePotentialFt` mutation**

Inside `export function CoachBmPerformancePage()`, find the existing `const toggleTrainingConfirmation = useMutation({ ... });` block (it ends with `});`). Immediately AFTER that block, insert:

```typescript
  const togglePotentialFt = useMutation({
    mutationFn: ({ id, flagged }: { id: number; flagged: boolean }) =>
      apiFetch(`/api/coach-bm-performance/${id}/potential-ft`, {
        method: 'PUT',
        body: { flagged },
      }),
    onMutate: async ({ id, flagged }) => {
      await queryClient.cancelQueries({ queryKey: ['coachBmPerformance'] });
      const queryKey = ['coachBmPerformance', branchFilter, searchQuery, page];
      const previous = queryClient.getQueryData<any>(queryKey);
      if (previous) {
        queryClient.setQueryData(queryKey, {
          ...previous,
          records: previous.records.map((r: CoachRow) =>
            r.id === id ? { ...r, potential_ft: flagged } : r
          ),
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
    },
  });
```

(Indent: two leading spaces — match the existing `toggleTrainingConfirmation` declaration.)

- [ ] **Step 2: Insert the Potential FT Coach `<td>` between Training Completed and Programs**

In the `records.map((r, idx) => (...))` JSX, find the Training Completed `<td>` block. It begins with:

```typescript
                    <td style={td}>
                      {(() => {
                        if (!r.training_start_date) {
```

…and ends with its closing `</td>` line. Immediately AFTER that closing `</td>` line, insert the new `<td>`:

```typescript
                    <td style={td}>
                      {r.role === 'PT - Coach' ? (
                        <label style={{ display:'inline-flex', alignItems:'center', cursor:'pointer' }}>
                          <input
                            type="checkbox"
                            checked={r.potential_ft}
                            onChange={() => togglePotentialFt.mutate({ id: r.id, flagged: !r.potential_ft })}
                            style={{ accentColor: '#f59e0b', cursor:'pointer' }}
                          />
                        </label>
                      ) : (
                        <span style={{ color:'var(--muted)' }}>—</span>
                      )}
                    </td>
```

The next `<td>` in the row JSX after this new one should be the existing Programs cell (`<td style={td}>` containing the `r.programs.length === 0 ? (...) : (...)` ternary).

- [ ] **Step 3: Verify lint passes for this file**

```bash
cd frontend && npm run lint 2>&1 | grep -i CoachBm
```

Expected: no NEW errors related to `CoachBmPerformancePage.tsx`.

- [ ] **Step 4: Commit**

```bash
cd ..
git add frontend/src/pages/CoachBmPerformancePage.tsx
git commit -m "feat(coach-bm): Potential FT Coach checkbox cell + mutation"
```

---

## Task 6: End-to-end sanity pass

Final pass against the spec's verification plan before pushing.

- [ ] **Step 1: Apply the migration to the dev DB (operator action)**

Open `backend/sql/020_create_coach_potential_ft_flag.sql` in HeidiSQL (or psql) connected to the same DB that hosts `public.coach_training_completion`. Execute it.

Verify:

```sql
SELECT column_name, data_type FROM information_schema.columns
WHERE table_schema='public' AND table_name='coach_potential_ft_flag'
ORDER BY ordinal_position;
-- Expect 3 rows:
--   branch_staff_id integer
--   flagged_at      timestamp with time zone
--   flagged_by      uuid
```

- [ ] **Step 2: Restart dev servers**

```bash
# Terminal 1
cd backend && npm run dev
# Terminal 2
cd frontend && npm run dev
```

- [ ] **Step 3: Walk the spec's verification list**

Open `http://localhost:5174/coach-bm-performance` and confirm each:

1. ✅ Active PT Coach → tick the Potential FT Coach checkbox; row appears in `public.coach_potential_ft_flag`. Untick → row gone:
   ```sql
   SELECT * FROM public.coach_potential_ft_flag;
   ```
2. ✅ Active FT Coach row → cell shows `—`, no checkbox.
3. ✅ Active BM row → cell shows `—`, no checkbox.
4. ✅ Existing columns unchanged: Training Completed checkbox still ticks/unticks for a coach with `trainingStartDate` ≥ 7 days; Programs column still ticks/unticks; CCP / Weekly Training / etc. stat cards unchanged.
5. ✅ Branch filter + Search + Pagination all still work.

If any step fails, fix in place and amend the relevant task's commit (or add a new fix-up commit).

- [ ] **Step 4: Final commit if anything was tweaked**

If no fix-ups were needed during Step 3, nothing to do here. Otherwise:

```bash
git add backend/src/routes/coachBmPerformance.js frontend/src/pages/CoachBmPerformancePage.tsx
git commit -m "fix(coach-bm): <whatever was tweaked>"
```

---

## Done

Push to staging via the usual flow (merge `fix/schema-qualify-dashboards-middleware` → `staging`, push staging, apply migration on the shared DB before the deploy goes live, verify on staging-dashboard.ebright.my, then merge staging → master).
