# Coach & BM Training Confirmation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a Role column, replace Start Date with Training Start/End Date, add a gated "Training Completed" checkbox column, and exclude BMs from CCP throughout `/coach-bm-performance`.

**Architecture:** New `public.coach_training_completion` table (PK on `branch_staff_id`, mirrors the `coach_program_completion` pattern). Backend reads `bs."role"`, `bs."trainingStartDate"`, `bs."trainingEndDate"` from `hrfs."BranchStaff"` and exposes `training_confirmed` via LEFT JOIN. New `PUT /:id/training-completion` endpoint guarded on `NOW() >= trainingStartDate + 7 days` for new confirmations only (untick always allowed). Frontend adds three new columns and a new mutation parallel to the existing `toggleCompletion`.

**Tech Stack:** Postgres, Node/Express (backend, port 4000, `nodemon`), React + Vite + TanStack Query (frontend, Vite proxies `/api` to `http://127.0.0.1:4000`).

**Branch:** Working on `fix/schema-qualify-dashboards-middleware` (already checked out).

**Manual verification only.** This codebase has no automated tests for these routes/pages — verification is via `curl` against the dev backend and clicking through the UI. Each task ends with verification commands and a commit.

**Spec:** [docs/superpowers/specs/2026-05-15-coach-bm-training-confirmation-design.md](../specs/2026-05-15-coach-bm-training-confirmation-design.md)

---

## File Structure

| File | Action | Responsibility |
|---|---|---|
| `backend/sql/019_create_coach_training_completion.sql` | Create | Schema migration for the new table |
| `backend/src/routes/coachBmPerformance.js` | Modify | Backend: add role/training dates to GET, BM-no-CCP, new PUT endpoint, stats fix |
| `frontend/src/pages/CoachBmPerformancePage.tsx` | Modify | Frontend: type, headers, three new column cells, new mutation |

---

## Task 1: Create the migration SQL file

**Files:**
- Create: `backend/sql/019_create_coach_training_completion.sql`

- [ ] **Step 1: Write the migration file**

Create `backend/sql/019_create_coach_training_completion.sql` with exactly:

```sql
-- 019_create_coach_training_completion.sql
--
-- Per-coach "training confirmed" record for the Coach & BM Performance
-- page. Row exists  ⇒  academy has confirmed the coach completed their
-- 1-week initial training. Row absent  ⇒  not yet confirmed.
-- Toggling the checkbox off DELETEs the row (absence is canonical).
--
-- branch_staff_id references hrfs."BranchStaff".id but no FK constraint
-- because BranchStaff lives in a foreign-data-wrapper schema and
-- cross-schema FKs to FDW tables are not supported (same reason
-- coach_program_completion has no FK).
--
-- One row per coach (PK is branch_staff_id alone) — academy confirms
-- the training as a whole, not per-program.
--
-- The 7-day-since-trainingStartDate gate is enforced server-side
-- (PUT /api/coach-bm-performance/:id/training-completion), not via a
-- CHECK constraint, so the rule can evolve without a migration.

CREATE TABLE IF NOT EXISTS public.coach_training_completion (
  branch_staff_id  INTEGER     PRIMARY KEY,
  confirmed_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  confirmed_by     UUID        REFERENCES public.users(id) ON DELETE SET NULL
);
```

- [ ] **Step 2: Apply the migration to your local Postgres**

Open the SQL in HeidiSQL (or psql) connected to the dashboard's database and execute it.

```bash
# Example with psql (substitute your local conn string):
psql "$DATABASE_URL" -f backend/sql/019_create_coach_training_completion.sql
```

- [ ] **Step 3: Verify the table exists and is empty**

In HeidiSQL or psql:

```sql
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'coach_training_completion'
ORDER BY ordinal_position;

SELECT COUNT(*) FROM public.coach_training_completion;
```

Expected: 3 rows (`branch_staff_id` integer NOT NULL, `confirmed_at` timestamptz NOT NULL, `confirmed_by` uuid YES nullable). Count = 0.

- [ ] **Step 4: Commit**

```bash
git add backend/sql/019_create_coach_training_completion.sql
git commit -m "feat(db): add coach_training_completion table"
```

---

## Task 2: Backend — extend `GET /api/coach-bm-performance`

Add `role`, training dates, and `training_confirmed` to the response. Apply the BM-no-CCP rule in the contract→programs CASE.

**Files:**
- Modify: `backend/src/routes/coachBmPerformance.js` (the `GET /` handler)

- [ ] **Step 1: Replace the data SELECT inside the GET / handler**

Open `backend/src/routes/coachBmPerformance.js`. Find the `pool.query(...)` call inside `Promise.all([...])` whose SQL begins `SELECT bs.id,` (the data query, not the count query). Replace its SQL string with:

```sql
${nameLookupCte},
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
        bs."role",
        bs."trainingStartDate" AS training_start_date,
        bs."trainingEndDate"   AS training_end_date,
        bs."contract",
        bs."status",
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
        END AS programs,
        COALESCE(
          (SELECT array_agg(cpc.program ORDER BY cpc.program)
             FROM coach_program_completion cpc
            WHERE cpc.branch_staff_id = bs.id),
          ARRAY[]::text[]
        ) AS completed_programs,
        COALESCE(bsc.cnt, 0)::int AS student_count,
        (ctc.branch_staff_id IS NOT NULL) AS training_confirmed
 FROM hrfs."BranchStaff" bs
 LEFT JOIN name_lookup nl ON nl."nickname" = bs."nickname"
 LEFT JOIN branch_student_counts bsc ON bsc.branch = bs."branch"
 LEFT JOIN public.coach_training_completion ctc ON ctc.branch_staff_id = bs.id
 ${where}
 ORDER BY name ASC
 LIMIT $${idx} OFFSET $${idx + 1}
```

(The `bs."start_date"` line is removed; the new lines added are: `bs."role"`, `bs."trainingStartDate"`, `bs."trainingEndDate"`, the `WHEN bs."role" = 'BM'` branch in the CASE, the LEFT JOIN to `coach_training_completion`, and the `training_confirmed` boolean.)

- [ ] **Step 2: Restart the backend dev server**

```bash
cd backend && npm run dev
```

Wait for `API listening on http://0.0.0.0:4000`.

- [ ] **Step 3: Hit the endpoint and verify the new fields**

In a separate terminal, log in via the UI to grab a session cookie (or use an existing session). Then:

```bash
curl -s -b "<your session cookie header>" "http://127.0.0.1:4000/api/coach-bm-performance?limit=3" | python -m json.tool
```

Expected: each `records[i]` object now includes `role`, `training_start_date`, `training_end_date`, `training_confirmed: false`. The `start_date` field is gone. For any record where `role = 'BM'` and `contract` is `'9 MONTH'`, `programs` should be `[]`.

If you can't easily get a cookie, alternative: open the browser DevTools Network tab on `/coach-bm-performance` and inspect a real request's response payload after restarting backend.

- [ ] **Step 4: Commit**

```bash
git add backend/src/routes/coachBmPerformance.js
git commit -m "feat(coach-bm): expose role + training dates + training_confirmed; BM excluded from CCP"
```

---

## Task 3: Backend — fix `GET /api/coach-bm-performance/stats` for BM-no-CCP

CCP counters must exclude BMs from both numerator and denominator. Other program counters stay unchanged (BMs with 15M/18M still count toward Weekly Training / Toastmasters / TPRR / ATCL Diploma).

**Files:**
- Modify: `backend/src/routes/coachBmPerformance.js` (the `GET /stats` handler)

- [ ] **Step 1: Add `role` to the parsed CTE and update CCP filters**

In the `router.get('/stats', ...)` handler, replace the entire `pool.query(...)` SQL with:

```sql
WITH parsed AS (
   SELECT
     bs.id,
     bs."role",
     NULLIF(regexp_replace(COALESCE(bs."contract", ''), '[^0-9]', '', 'g'), '')::int AS months,
     bs."contract" AS raw_contract
   FROM hrfs."BranchStaff" bs
   WHERE ${conditions.join(' AND ')}
 )
 SELECT
   COUNT(*)::int AS total,
   -- assigned counts
   COUNT(*) FILTER (WHERE raw_contract IS NOT NULL AND TRIM(raw_contract) <> ''
                        AND "role" <> 'BM')::int                                    AS assigned_ccp,
   COUNT(*) FILTER (WHERE months IN (15, 18))::int                                  AS assigned_weekly_training,
   COUNT(*) FILTER (WHERE months IN (15, 18))::int                                  AS assigned_toastmasters,
   COUNT(*) FILTER (WHERE months IN (15, 18))::int                                  AS assigned_tprr,
   COUNT(*) FILTER (WHERE months = 18)::int                                         AS assigned_atcl_diploma,
   -- completed counts (only count completion if program is currently assigned)
   COUNT(*) FILTER (WHERE raw_contract IS NOT NULL AND TRIM(raw_contract) <> ''
                        AND "role" <> 'BM'
                        AND EXISTS (SELECT 1 FROM coach_program_completion cpc
                                     WHERE cpc.branch_staff_id = parsed.id
                                       AND cpc.program = 'CCP'))::int                AS completed_ccp,
   COUNT(*) FILTER (WHERE months IN (15, 18)
                        AND EXISTS (SELECT 1 FROM coach_program_completion cpc
                                     WHERE cpc.branch_staff_id = parsed.id
                                       AND cpc.program = 'Weekly Training'))::int    AS completed_weekly_training,
   COUNT(*) FILTER (WHERE months IN (15, 18)
                        AND EXISTS (SELECT 1 FROM coach_program_completion cpc
                                     WHERE cpc.branch_staff_id = parsed.id
                                       AND cpc.program = 'Toastmasters'))::int       AS completed_toastmasters,
   COUNT(*) FILTER (WHERE months IN (15, 18)
                        AND EXISTS (SELECT 1 FROM coach_program_completion cpc
                                     WHERE cpc.branch_staff_id = parsed.id
                                       AND cpc.program = 'TPRR'))::int               AS completed_tprr,
   COUNT(*) FILTER (WHERE months = 18
                        AND EXISTS (SELECT 1 FROM coach_program_completion cpc
                                     WHERE cpc.branch_staff_id = parsed.id
                                       AND cpc.program = 'ATCL Diploma'))::int       AS completed_atcl_diploma
 FROM parsed
```

(The two changes are: `parsed` CTE now selects `bs."role"`, and the two `assigned_ccp` / `completed_ccp` counters now have `AND "role" <> 'BM'` in their FILTER clause.)

- [ ] **Step 2: Backend has hot-reloaded via nodemon — hit /stats and verify**

```bash
curl -s -b "<your session cookie>" "http://127.0.0.1:4000/api/coach-bm-performance/stats" | python -m json.tool
```

Expected: `assigned.ccp` is now lower than before by the count of active BMs with non-empty contracts. `assigned.weekly_training`, `assigned.toastmasters`, `assigned.tprr`, `assigned.atcl_diploma` are unchanged.

Sanity-check by running this in HeidiSQL/psql:

```sql
SELECT
  COUNT(*) FILTER (WHERE bs."contract" IS NOT NULL AND TRIM(bs."contract") <> '' AND bs."role" <> 'BM') AS expected_assigned_ccp,
  COUNT(*) FILTER (WHERE bs."contract" IS NOT NULL AND TRIM(bs."contract") <> '' AND bs."role" = 'BM')  AS bm_count_excluded
FROM hrfs."BranchStaff" bs
WHERE (bs."role" ILIKE '%coach%' OR bs."role" = 'BM')
  AND bs."status" = 'Active';
```

`expected_assigned_ccp` should match the new `assigned.ccp` from the API.

- [ ] **Step 3: Commit**

```bash
git add backend/src/routes/coachBmPerformance.js
git commit -m "fix(coach-bm/stats): exclude BM from CCP assigned + completed counters"
```

---

## Task 4: Backend — new endpoint `PUT /api/coach-bm-performance/:branchStaffId/training-completion`

Adds the persistence endpoint for the Training Completed checkbox.

**Files:**
- Modify: `backend/src/routes/coachBmPerformance.js` (add new route handler before `module.exports`)

- [ ] **Step 1: Add the new route handler**

Insert this new handler in `backend/src/routes/coachBmPerformance.js` immediately before the `module.exports = { coachBmPerformanceRouter: router };` line:

```javascript
// PUT /api/coach-bm-performance/:branchStaffId/training-completion
//
// Body: { confirmed: boolean }
//
// Records (or removes) academy's confirmation that the coach/BM has
// completed their initial 1-week training.
//
// Guards:
//   1. Row exists, is Active, and is a coach or BM.
//   2. For confirmed=true ONLY: trainingStartDate IS NOT NULL AND
//      NOW() >= trainingStartDate + 7 days. The 7-day rule mirrors the
//      UI's enabled-state condition. Untick (confirmed=false) is always
//      allowed regardless of date — covers the case where HR corrects
//      the training start date after academy already confirmed.
//
// confirmed=true  → INSERT ... ON CONFLICT DO UPDATE (refresh timestamp)
// confirmed=false → DELETE (idempotent)
router.put('/:branchStaffId/training-completion', async (req, res, next) => {
  try {
    const branchStaffId = parseInt(req.params.branchStaffId, 10);
    if (!Number.isInteger(branchStaffId) || branchStaffId <= 0) {
      return res.status(400).json({ error: 'Invalid branchStaffId' });
    }

    const { confirmed } = req.body || {};
    if (typeof confirmed !== 'boolean') {
      return res.status(400).json({ error: 'confirmed must be boolean' });
    }

    const { rows: staffRows } = await pool.query(
      `SELECT bs."trainingStartDate" AS training_start_date
         FROM hrfs."BranchStaff" bs
        WHERE bs.id = $1
          AND bs."status" = 'Active'
          AND (bs."role" ILIKE '%coach%' OR bs."role" = 'BM')`,
      [branchStaffId]
    );
    if (!staffRows.length) {
      return res.status(404).json({ error: 'Coach or BM not found' });
    }

    if (confirmed) {
      const trainingStartDate = staffRows[0].training_start_date;
      if (!trainingStartDate) {
        return res.status(422).json({ error: 'Training start date not set' });
      }
      const ageMs = Date.now() - new Date(trainingStartDate).getTime();
      if (ageMs < 7 * 24 * 60 * 60 * 1000) {
        return res.status(422).json({ error: 'Training period not yet elapsed (7 days)' });
      }

      const userId = req.user.sub;
      await pool.query(
        `INSERT INTO public.coach_training_completion
           (branch_staff_id, confirmed_at, confirmed_by)
         VALUES ($1, NOW(), $2)
         ON CONFLICT (branch_staff_id) DO UPDATE SET
           confirmed_at = NOW(),
           confirmed_by = EXCLUDED.confirmed_by`,
        [branchStaffId, userId]
      );
    } else {
      await pool.query(
        `DELETE FROM public.coach_training_completion
         WHERE branch_staff_id = $1`,
        [branchStaffId]
      );
    }

    return res.json({ ok: true, branch_staff_id: branchStaffId, confirmed });
  } catch (err) { return next(err); }
});
```

- [ ] **Step 2: Verify the endpoint with curl**

Pick an active coach with `trainingStartDate` more than 7 days ago. Find one:

```sql
SELECT id, name, "trainingStartDate"
FROM hrfs."BranchStaff"
WHERE "status" = 'Active'
  AND ("role" ILIKE '%coach%' OR "role" = 'BM')
  AND "trainingStartDate" IS NOT NULL
  AND "trainingStartDate" < NOW() - INTERVAL '7 days'
ORDER BY id
LIMIT 1;
```

Note the `id` (call it `<ID>`). Then:

```bash
# Tick (should succeed)
curl -s -X PUT -b "<cookie>" -H "Content-Type: application/json" \
  -d '{"confirmed": true}' \
  "http://127.0.0.1:4000/api/coach-bm-performance/<ID>/training-completion"
# Expected: {"ok":true,"branch_staff_id":<ID>,"confirmed":true}

# Verify in DB
psql "$DATABASE_URL" -c "SELECT * FROM public.coach_training_completion WHERE branch_staff_id = <ID>;"
# Expected: 1 row with confirmed_at = now-ish, confirmed_by = your user id

# Untick (should succeed)
curl -s -X PUT -b "<cookie>" -H "Content-Type: application/json" \
  -d '{"confirmed": false}' \
  "http://127.0.0.1:4000/api/coach-bm-performance/<ID>/training-completion"
# Expected: {"ok":true,"branch_staff_id":<ID>,"confirmed":false}

# Verify row gone
psql "$DATABASE_URL" -c "SELECT COUNT(*) FROM public.coach_training_completion WHERE branch_staff_id = <ID>;"
# Expected: 0
```

Now find an active coach with `trainingStartDate` LESS than 7 days ago (or NULL) to test the guard:

```sql
SELECT id, "trainingStartDate"
FROM hrfs."BranchStaff"
WHERE "status" = 'Active'
  AND ("role" ILIKE '%coach%' OR "role" = 'BM')
  AND ("trainingStartDate" IS NULL OR "trainingStartDate" >= NOW() - INTERVAL '7 days')
ORDER BY id
LIMIT 1;
```

```bash
curl -s -X PUT -b "<cookie>" -H "Content-Type: application/json" \
  -d '{"confirmed": true}' \
  "http://127.0.0.1:4000/api/coach-bm-performance/<ID>/training-completion"
# Expected: HTTP 422 with error: "Training start date not set" or "Training period not yet elapsed (7 days)"
```

- [ ] **Step 3: Commit**

```bash
git add backend/src/routes/coachBmPerformance.js
git commit -m "feat(coach-bm): PUT /:id/training-completion endpoint with 7-day gate"
```

---

## Task 5: Frontend — type updates + new column headers

Update the `CoachRow` type, drop the old `start_date` field, add the three new headers.

**Files:**
- Modify: `frontend/src/pages/CoachBmPerformancePage.tsx`

- [ ] **Step 1: Update the `CoachRow` type**

Replace the existing `type CoachRow = { ... }` block (around line 20) with:

```typescript
type CoachRow = {
  id: number;
  name: string;
  gender: string | null;
  phone: string | null;
  branch: string | null;
  role: string | null;
  training_start_date: string | null;
  training_end_date: string | null;
  contract: string | null;
  status: string | null;
  programs: string[];
  completed_programs: string[];
  student_count: number;
  training_confirmed: boolean;
};
```

(`start_date` removed; `role`, `training_start_date`, `training_end_date`, `training_confirmed` added.)

- [ ] **Step 2: Update the `<thead>` headers and the empty-row colSpan**

Find:

```typescript
{['No.','Name','Gender','Phone','Branch','Start Date','Contract Period','Programs','No. of Lessons','No. of Students'].map(h => (
```

Replace with:

```typescript
{['No.','Name','Gender','Phone','Branch','Role','Training Start Date','Training End Date','Contract Period','Training Completed','Programs','No. of Lessons','No. of Students'].map(h => (
```

Then find:

```typescript
<tr><td colSpan={10} style={{ ...td, textAlign:'center', padding:'48px 16px', color:'var(--muted)' }}>
```

Change `colSpan={10}` to `colSpan={13}`.

- [ ] **Step 3: Verify the table renders with the new headers (existing rows will look broken — that's OK for this task)**

Make sure the frontend dev server is running:

```bash
cd frontend && npm run dev
```

Open `http://localhost:5174/coach-bm-performance`. You should see 13 column headers in the new order. Existing data cells will be misaligned because we haven't updated the `<tbody>` cells yet — that's expected; we fix it in Tasks 6 and 7.

Run the linter to catch any TS issues from the type change:

```bash
cd frontend && npm run lint
```

Expected: no new errors related to `CoachBmPerformancePage.tsx` (existing repo-wide warnings unrelated to this file are fine).

- [ ] **Step 4: Commit**

```bash
git add frontend/src/pages/CoachBmPerformancePage.tsx
git commit -m "refactor(coach-bm): update CoachRow type + table headers for new columns"
```

---

## Task 6: Frontend — Role pill + Training Start/End Date cells

Replace the old `<tbody>` row with the new structure including Role and the two training date cells. The Training Completed cell is added in Task 7.

**Files:**
- Modify: `frontend/src/pages/CoachBmPerformancePage.tsx`

- [ ] **Step 1: Replace the entire row JSX inside `records.map((r, idx) => ...)`**

Find the `records.map((r, idx) => (...))` block. Replace the entire `<tr key={r.id} ...>...</tr>` with:

```typescript
<tr key={r.id} style={{ borderTop:'1px solid var(--border)' }}>
  <td style={{ ...td, color:'var(--muted)' }}>{pageStart + idx + 1}</td>
  <td style={td}>
    <div style={{ display:'flex', alignItems:'center', gap:8 }}>
      <span style={{ fontWeight:600, color:'var(--text)', whiteSpace:'nowrap' }}>{r.name}</span>
      <span style={{ fontSize:10, padding:'2px 7px', borderRadius:99, fontWeight:600, background:r.status==='Active'?'rgba(34,197,94,0.15)':'rgba(239,68,68,0.12)', color:r.status==='Active'?'#16a34a':'#dc2626' }}>{r.status}</span>
    </div>
  </td>
  <td style={{ ...td, color:'var(--muted)', whiteSpace:'nowrap' }}>{r.gender || '—'}</td>
  <td style={{ ...td, color: r.phone ? 'var(--text)' : 'var(--muted)', whiteSpace:'nowrap' }}>{r.phone || '—'}</td>
  <td style={td}><span style={{ fontSize:11, padding:'2px 8px', borderRadius:6, fontWeight:600, background:'rgba(99,102,241,0.1)', color:'#6366f1' }}>{r.branch || '—'}</span></td>
  <td style={td}>
    {r.role
      ? <span style={{ fontSize:11, padding:'2px 8px', borderRadius:6, fontWeight:600, background:'rgba(244,63,94,0.1)', color:'#f43f5e', whiteSpace:'nowrap' }}>{r.role}</span>
      : <span style={{ color:'var(--muted)' }}>—</span>}
  </td>
  <td style={{ ...td, color:'var(--muted)', whiteSpace:'nowrap' }}>{fmtStartDate(r.training_start_date)}</td>
  <td style={{ ...td, color:'var(--muted)', whiteSpace:'nowrap' }}>{fmtStartDate(r.training_end_date)}</td>
  <td style={{ ...td, color: r.contract ? 'var(--text)' : 'var(--muted)' }}>{r.contract || '—'}</td>
  <td style={{ ...td, color:'var(--muted)' }}>{/* Training Completed — added in Task 7 */}—</td>
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
  <td style={{ ...td, color:'var(--muted)' }}>—</td>
  <td style={{ ...td, color: r.student_count > 0 ? 'var(--text)' : 'var(--muted)', whiteSpace:'nowrap' }}>{r.student_count}</td>
</tr>
```

(Changes from original: added Role cell after Branch, replaced one Start Date cell with Training Start + Training End Date, added a placeholder Training Completed cell after Contract Period — Task 7 fills it in.)

- [ ] **Step 2: Verify the table renders correctly with all columns aligned**

Reload `http://localhost:5174/coach-bm-performance`. All 13 columns should be present and aligned. The Role pill shows in pink-ish red. Training dates render via the existing `fmtStartDate` helper. The Training Completed column shows `—` for every row.

Spot-check: pick a known BM (you can find one from the previous SQL query or scrolling). The Programs column for that BM should match the BM-no-CCP rule:
- 9M BM → `—` (empty)
- 15M BM → only Weekly Training/Toastmasters/TPRR (no CCP)

Lint:

```bash
cd frontend && npm run lint
```

Expected: no new errors in this file.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/pages/CoachBmPerformancePage.tsx
git commit -m "feat(coach-bm): render Role pill + Training Start/End Date columns"
```

---

## Task 7: Frontend — Training Completed cell + mutation

Replace the placeholder `—` Training Completed cell with the gated checkbox per the state matrix, plus the mutation that persists the toggle.

**Files:**
- Modify: `frontend/src/pages/CoachBmPerformancePage.tsx`

- [ ] **Step 1: Add the `toggleTrainingConfirmation` mutation**

Inside the component, immediately after the existing `const toggleCompletion = useMutation({...})` block (which ends at the line `});`), add:

```typescript
const toggleTrainingConfirmation = useMutation({
  mutationFn: ({ id, confirmed }: { id: number; confirmed: boolean }) =>
    apiFetch(`/api/coach-bm-performance/${id}/training-completion`, {
      method: 'PUT',
      body: { confirmed },
    }),
  onMutate: async ({ id, confirmed }) => {
    await queryClient.cancelQueries({ queryKey: ['coachBmPerformance'] });
    const queryKey = ['coachBmPerformance', branchFilter, searchQuery, page];
    const previous = queryClient.getQueryData<any>(queryKey);
    if (previous) {
      queryClient.setQueryData(queryKey, {
        ...previous,
        records: previous.records.map((r: CoachRow) =>
          r.id === id ? { ...r, training_confirmed: confirmed } : r
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

- [ ] **Step 2: Add the gating helper above the component**

Above the `export function CoachBmPerformancePage()` line, add:

```typescript
const TRAINING_GATE_MS = 7 * 24 * 60 * 60 * 1000;

function trainingGate(trainingStartDate: string | null): { unlocked: boolean; availableOn: Date | null } {
  if (!trainingStartDate) return { unlocked: false, availableOn: null };
  const start = new Date(trainingStartDate);
  if (isNaN(start.getTime())) return { unlocked: false, availableOn: null };
  const availableOn = new Date(start.getTime() + TRAINING_GATE_MS);
  return { unlocked: Date.now() >= availableOn.getTime(), availableOn };
}
```

- [ ] **Step 3: Replace the placeholder Training Completed cell**

Find the line in the row JSX:

```typescript
<td style={{ ...td, color:'var(--muted)' }}>{/* Training Completed — added in Task 7 */}—</td>
```

Replace with:

```typescript
<td style={td}>
  {(() => {
    const gate = trainingGate(r.training_start_date);
    const showCheckbox = !!r.training_start_date;
    if (!showCheckbox) {
      return <span title="Training start date not set" style={{ color:'var(--muted)' }}>—</span>;
    }
    // Disabled when within the 7-day window AND not already confirmed.
    // Already-confirmed rows stay toggleable so academy can untick if they made a mistake.
    const disabled = !gate.unlocked && !r.training_confirmed;
    const tooltip = r.training_confirmed
      ? 'Confirmed'
      : (gate.unlocked ? '' : `Available on ${gate.availableOn?.toLocaleDateString('en-GB', { day:'2-digit', month:'short', year:'numeric' })}`);
    return (
      <label title={tooltip} style={{ display:'inline-flex', alignItems:'center', cursor: disabled ? 'not-allowed' : 'pointer', opacity: disabled ? 0.4 : 1 }}>
        <input
          type="checkbox"
          checked={r.training_confirmed}
          disabled={disabled}
          onChange={() => toggleTrainingConfirmation.mutate({ id: r.id, confirmed: !r.training_confirmed })}
          style={{ accentColor: '#10b981', cursor: disabled ? 'not-allowed' : 'pointer' }}
        />
      </label>
    );
  })()}
</td>
```

- [ ] **Step 4: Verify the cell behaves per the state matrix**

Reload `http://localhost:5174/coach-bm-performance`. Verify each state from the spec's matrix:

1. **NULL `trainingStartDate`** — find a row, cell shows `—`, hover shows "Training start date not set".
2. **`trainingStartDate` < 7 days ago, not confirmed** — find a row (use the earlier SQL query), cell shows a disabled (greyed) checkbox, hover shows "Available on `<date>`".
3. **`trainingStartDate` ≥ 7 days ago, not confirmed** — find a row, cell shows an enabled empty checkbox.
4. Click the enabled checkbox → it ticks immediately (optimistic). Verify in DB:
   ```sql
   SELECT * FROM public.coach_training_completion WHERE branch_staff_id = <ID>;
   ```
   should show 1 row.
5. Click again to untick → checkbox empties immediately. Verify the row is gone.
6. **Edge case (manual)**: With a row currently confirmed, manually update its `trainingStartDate` to today via SQL:
   ```sql
   UPDATE hrfs."BranchStaff" SET "trainingStartDate" = NOW() WHERE id = <ID>;
   ```
   Reload the page. The row should still show a CHECKED + ENABLED checkbox (because confirmed). Click to untick — should succeed (untick is always allowed). Restore the original date afterward:
   ```sql
   UPDATE hrfs."BranchStaff" SET "trainingStartDate" = '<original>' WHERE id = <ID>;
   ```

Lint:

```bash
cd frontend && npm run lint
```

Expected: no new errors in this file.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/pages/CoachBmPerformancePage.tsx
git commit -m "feat(coach-bm): Training Completed checkbox column gated on 7 days"
```

---

## Task 8: End-to-end sanity pass on the full feature

A final pass against the spec's verification checklist, top-to-bottom in one session, before pushing to staging.

- [ ] **Step 1: Restart both dev servers cleanly**

```bash
# Terminal 1
cd backend && npm run dev
# Terminal 2
cd frontend && npm run dev
```

- [ ] **Step 2: Run through every spec verification step**

Open `http://localhost:5174/coach-bm-performance` and confirm each item from the spec's "Verification plan":

1. ✅ Active coach with `trainingStartDate` > 7 days → tick + untick works, DB row appears + disappears.
2. ✅ Coach with `trainingStartDate` < 7 days → checkbox disabled, tooltip shows "Available on `<date>`".
3. ✅ Row with NULL `trainingStartDate` → cell shows `—`, no checkbox.
4. ✅ BM with 9M contract → Programs column is empty (`—`).
5. ✅ BM with 15M contract → Programs shows Weekly Training, Toastmasters, TPRR (no CCP).
6. ✅ CCP stat card denominator dropped by the count of BMs with non-empty contracts. Confirm by comparing to the SQL sanity-check query in Task 3 Step 2.
7. ✅ Weekly Training / Toastmasters / TPRR / ATCL Diploma denominators unchanged (eyeball comparison vs. before — no easy automated way).

If any step fails, fix in place and amend the relevant Task's commit (or add a new fix-up commit).

- [ ] **Step 3: Confirm no regressions in the rest of the page**

Click through:
- Branch filter dropdown — pick 2 branches, verify table updates and pagination resets.
- Search by name — verify result narrows.
- Pagination — Next/Prev/First/Last all work.
- Toggle one of the existing Programs checkboxes (CCP on a coach) — verify it still ticks/unticks (Task 2 changed the SQL but not this column's behavior).

- [ ] **Step 4: Final commit if anything was tweaked, otherwise no-op**

If you made fix-ups during Step 2 or Step 3, commit them with a message like:

```bash
git add frontend/src/pages/CoachBmPerformancePage.tsx backend/src/routes/coachBmPerformance.js
git commit -m "fix(coach-bm): <whatever was tweaked>"
```

Otherwise nothing to do here — the feature is ready for the staging push.

---

## Done

Push to staging and deploy via the usual flow (`staging` branch auto-deploys to staging-dashboard.ebright.my). Don't forget to apply the SQL migration on staging and production Postgres before pushing the code, otherwise the new endpoint and the `LEFT JOIN coach_training_completion` will fail.

```bash
# On staging DB
psql "$STAGING_DATABASE_URL" -f backend/sql/019_create_coach_training_completion.sql
# On production DB (after staging passes)
psql "$PROD_DATABASE_URL"    -f backend/sql/019_create_coach_training_completion.sql
```
