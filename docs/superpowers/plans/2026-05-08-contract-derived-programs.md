# Contract-Derived Programs — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the manual program-enrollment ticks on the Coach & BM Performance page with values derived from `BranchStaff.contract`. Add CCP and TPRR cards (5 cards total). Drop the now-unused `coach_program_enrollment` table and its PUT endpoint.

**Architecture:** Backend computes program lists in SQL (text array per coach in GET, FILTER aggregates in /stats) — single source of truth for the contract → programs rule. Frontend just renders a chip list and the 5 stat cards. Net effect on the page: same layout, same query keys, but no React Query mutation, no checkboxes.

**Tech Stack:** Express + node-postgres `pg` Pool (raw SQL), React 19 + TypeScript + Vite, `@tanstack/react-query`, plain CSS via inline `style={...}` with CSS variables.

**Spec:** [docs/superpowers/specs/2026-05-08-contract-derived-programs-design.md](../specs/2026-05-08-contract-derived-programs-design.md)

**Branch:** continue on `feat/coach-bm-performance` (the same branch the original Coach & BM Performance feature lives on — this redesign hasn't reached staging yet, so it's still one logical change).

**Commit policy:** Each task commits. Don't push to master. After all tasks: push `feat/coach-bm-performance` → merge to `staging` → verify on `staging-dashboard.ebright.my` → only then promote to `master`.

---

## File Structure

| File | Change | Responsibility |
|---|---|---|
| `backend/sql/017_drop_coach_program_enrollment.sql` | Create | Idempotent DROP of the now-unused tick table |
| `backend/src/routes/coachBmPerformance.js` | Modify | Replace LEFT JOIN + boolean selects with derived `programs text[]`; replace boolean FILTERs in /stats with contract-month FILTERs; delete the PUT handler and `VALID_PROGRAMS` set |
| `frontend/src/pages/CoachBmPerformancePage.tsx` | Modify | Drop mutation/queryClient, drop checkbox UI, render program chips, add CCP + TPRR cards (5 total), update `CoachRow` type, add `PROGRAM_COLORS` constant |

No new files on the frontend. No tests are added — the codebase has no test runner; verification is via `node --check` / `npx tsc --noEmit` / browser smoke-test.

---

## Task 1: Drop the `coach_program_enrollment` table

**Files:**
- Create: `backend/sql/017_drop_coach_program_enrollment.sql`

- [ ] **Step 1: Create the migration file**

Write `backend/sql/017_drop_coach_program_enrollment.sql`:

```sql
-- 017_drop_coach_program_enrollment.sql
--
-- Programs are now derived from BranchStaff.contract; the manual-tick
-- override table from migration 016 is no longer used. Idempotent.

DROP TABLE IF EXISTS public.coach_program_enrollment;
```

- [ ] **Step 2: Apply the migration locally (best-effort)**

If you have a SQL client (HeidiSQL, psql, DBeaver, pgAdmin) connected to the dashboard's local DB, run the file or paste the SQL.

PowerShell with psql:
```powershell
psql $env:DATABASE_URL -f backend/sql/017_drop_coach_program_enrollment.sql
```

Expected: `DROP TABLE` (or `NOTICE: table does not exist, skipping` on a fresh checkout where 016 was never applied).

If no SQL client is available locally, skip — the migration will run on staging deploy. Report this as `DONE_WITH_CONCERNS`. The backend Tasks 2 and 3 will still pass `node --check` because they don't touch the table at all.

- [ ] **Step 3: Verify the table is gone (only if Step 2 ran)**

```bash
psql "$DATABASE_URL" -c "\d coach_program_enrollment"
```

Expected: `Did not find any relation named "coach_program_enrollment".`

- [ ] **Step 4: Commit**

```bash
git add backend/sql/017_drop_coach_program_enrollment.sql
git commit -m "feat(coach-perf): drop coach_program_enrollment table"
```

---

## Task 2: Update GET `/api/coach-bm-performance` to derive programs from contract

**Files:**
- Modify: `backend/src/routes/coachBmPerformance.js`

- [ ] **Step 1: Read the current file**

Read `backend/src/routes/coachBmPerformance.js` to confirm it currently:
- Imports `pool`, `requireAuth`, `requireDashboard`.
- Has a `VALID_PROGRAMS` Set (used only by the PUT handler).
- Has a GET `/` handler that LEFT JOINs `coach_program_enrollment cpe` and selects three `COALESCE(cpe.<col>, FALSE)` boolean columns.
- Has a GET `/stats` handler that uses the same LEFT JOIN with `COUNT(*) FILTER (WHERE COALESCE(cpe.<col>, FALSE))`.
- Has a PUT `/:branchStaffId/program` handler.

- [ ] **Step 2: Replace the GET `/` SQL block**

Find the `dataResult` `pool.query(` call inside the GET `/` handler. The query currently looks like:

```js
pool.query(
  `${nameLookupCte}
   SELECT bs.id,
          COALESCE(NULLIF(TRIM(bs."name"), ''), nl."name") AS name,
          bs."gender",
          bs."branch",
          bs.start_date,
          bs."contract",
          bs."status",
          COALESCE(cpe.weekly_training, FALSE) AS weekly_training,
          COALESCE(cpe.atcl_diploma,    FALSE) AS atcl_diploma,
          COALESCE(cpe.toastmasters,    FALSE) AS toastmasters
   FROM hrfs."BranchStaff" bs
   LEFT JOIN name_lookup nl ON nl."nickname" = bs."nickname"
   LEFT JOIN coach_program_enrollment cpe ON cpe.branch_staff_id = bs.id
   ${where}
   ORDER BY name ASC
   LIMIT $${idx} OFFSET $${idx + 1}`,
  [...params, Number(limit), offset]
),
```

Replace it with:

```js
pool.query(
  `${nameLookupCte}
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
   ${where}
   ORDER BY name ASC
   LIMIT $${idx} OFFSET $${idx + 1}`,
  [...params, Number(limit), offset]
),
```

The diff:
- Three `COALESCE(cpe.<col>, FALSE) AS <col>` lines replaced with one `CASE ... AS programs` block.
- The line `LEFT JOIN coach_program_enrollment cpe ON cpe.branch_staff_id = bs.id` is deleted.
- Everything else (count query, WHERE conditions, ORDER BY, LIMIT/OFFSET, params) is unchanged.

The CASE produces a Postgres `text[]`. node-postgres returns these as a JS string array, so the response shape becomes:

```json
{ "id": 355, "name": "...", "contract": "15M", "programs": ["CCP", "Weekly Training", "Toastmasters", "TPRR"], ... }
```

- [ ] **Step 3: Update the `/stats` handler**

Find the `router.get('/stats', ...)` block. The current SQL looks like:

```js
const { rows } = await pool.query(
  `SELECT
     COUNT(*)::int AS total,
     COUNT(*) FILTER (WHERE COALESCE(cpe.weekly_training, FALSE))::int AS weekly_training,
     COUNT(*) FILTER (WHERE COALESCE(cpe.atcl_diploma,    FALSE))::int AS atcl_diploma,
     COUNT(*) FILTER (WHERE COALESCE(cpe.toastmasters,    FALSE))::int AS toastmasters
   FROM hrfs."BranchStaff" bs
   LEFT JOIN coach_program_enrollment cpe ON cpe.branch_staff_id = bs.id
   WHERE ${conditions.join(' AND ')}`,
  params
);
```

Replace the entire `pool.query(...)` call with this CTE-based version. The CTE parses contract once so the FILTER expressions stay readable, and the `params`/`conditions` from the outer JS still drive the WHERE in the CTE:

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
```

Notes for whoever reads this later:
- The outer `conditions` array is still `[role-filter, status-Active-filter, optional branch-filter]` exactly as before — copying it into the CTE works because the CTE only references `bs.*` columns.
- `params` is unchanged; the `$1` placeholder for branch (when present) lands in the CTE's WHERE clause.
- The `LEFT JOIN coach_program_enrollment cpe ...` line is removed.

- [ ] **Step 4: Delete the PUT handler and `VALID_PROGRAMS`**

Delete the entire `router.put('/:branchStaffId/program', ...)` block (the comment block above it plus the handler — anything between the `/stats` handler's closing `});` and `module.exports = ...`).

Also delete the line:

```js
const VALID_PROGRAMS = new Set(['weekly_training', 'atcl_diploma', 'toastmasters']);
```

near the top of the file. Nothing else references it.

The file should now contain (in order): the requires, `router.use(requireAuth); router.use(requireDashboard('student_db'));`, the GET `/` handler, the GET `/stats` handler, and `module.exports = { coachBmPerformanceRouter: router };`.

- [ ] **Step 5: Verify**

```bash
node --check backend/src/routes/coachBmPerformance.js
```

Expected: no output.

If you have a running local backend with the DB applied: smoke-test with curl. Otherwise skip — staging will exercise it.

```bash
curl -s "$API/api/coach-bm-performance?limit=2" -H "Authorization: Bearer $TOKEN" | jq '.records[0]'
# Expected: object with `programs` array, no `weekly_training`/`atcl_diploma`/`toastmasters` flags

curl -s "$API/api/coach-bm-performance/stats" -H "Authorization: Bearer $TOKEN" | jq
# Expected: { total, ccp, weekly_training, toastmasters, tprr, atcl_diploma } — all integers
```

- [ ] **Step 6: Commit**

```bash
git add backend/src/routes/coachBmPerformance.js
git commit -m "feat(coach-perf): derive programs from contract; drop tick endpoint"
```

---

## Task 3: Update the page — chips, 5 cards, drop the mutation

**Files:**
- Modify: `frontend/src/pages/CoachBmPerformancePage.tsx`

This is one task, not three, because the changes are tightly coupled — they all derive from the new API shape and the spec's redesign. Splitting them would force interim broken states.

- [ ] **Step 1: Read the current file**

Read `frontend/src/pages/CoachBmPerformancePage.tsx` to confirm its current state has:
- `import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';` at the top.
- `type CoachRow` with `weekly_training`, `atcl_diploma`, `toastmasters` boolean fields.
- A `useQueryClient()` call and a `toggleMutation = useMutation({...})` block inside the component.
- Three `statCard` calls in a `<div>` grid (Weekly Training, ATCL Diploma, Toastmasters).
- A Programs `<td>` with three `<input type="checkbox">` elements wired to `toggleMutation.mutate`.

- [ ] **Step 2: Update the import line**

Change:

```tsx
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
```

to:

```tsx
import { useQuery } from '@tanstack/react-query';
```

- [ ] **Step 3: Add the `PROGRAM_COLORS` constant**

Just below the existing module-scope `td` constant (or near the top of the module, alongside `th`/`td`/`PAGE_SIZE`), add:

```tsx
const PROGRAM_COLORS: Record<string, string> = {
  'CCP':              '#0ea5e9',
  'Weekly Training':  '#4f46e5',
  'Toastmasters':     '#10b981',
  'TPRR':             '#f59e0b',
  'ATCL Diploma':     '#8b5cf6',
};
```

- [ ] **Step 4: Update the `CoachRow` type**

Find the existing `type CoachRow = { ... }` block. Replace its three boolean fields with one `programs: string[]`:

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

(Removed: `weekly_training`, `atcl_diploma`, `toastmasters`. Added: `programs: string[]`.)

- [ ] **Step 5: Delete the mutation block**

Find and delete:

```tsx
const queryClient = useQueryClient();

const toggleMutation = useMutation({
  mutationFn: ({ id, program, enrolled }: { id: number; program: 'weekly_training' | 'atcl_diploma' | 'toastmasters'; enrolled: boolean }) =>
    apiFetch(`/api/coach-bm-performance/${id}/program`, {
      method: 'PUT',
      body: { program, enrolled },
    }),
  onMutate: async ({ id, program, enrolled }) => {
    await queryClient.cancelQueries({ queryKey: ['coachBmPerformance'] });
    const queryKey = ['coachBmPerformance', branchFilter, searchQuery, page];
    const previous = queryClient.getQueryData<any>(queryKey);
    if (previous) {
      queryClient.setQueryData(queryKey, {
        ...previous,
        records: previous.records.map((r: CoachRow) => r.id === id ? { ...r, [program]: enrolled } : r),
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

The whole block — `useQueryClient()` line and the `useMutation({...})` block — goes away.

- [ ] **Step 6: Update the count derivations and stat-card grid**

Find the existing block:

```tsx
const wtCount   = stats?.weekly_training ?? 0;
const atclCount = stats?.atcl_diploma    ?? 0;
const tmCount   = stats?.toastmasters    ?? 0;
const statsTotal = stats?.total ?? 0;
```

Replace with:

```tsx
const ccpCount   = stats?.ccp             ?? 0;
const wtCount    = stats?.weekly_training ?? 0;
const tmCount    = stats?.toastmasters    ?? 0;
const tprrCount  = stats?.tprr            ?? 0;
const atclCount  = stats?.atcl_diploma    ?? 0;
const statsTotal = stats?.total           ?? 0;
```

Then find the `<div>` containing the three `statCard` calls. It currently looks like:

```tsx
<div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit, minmax(200px, 1fr))', gap:12, marginBottom:16 }}>
  {statCard('Weekly Training', wtCount,   `/${statsTotal}`, '#4f46e5', '🏋️')}
  {statCard('ATCL Diploma',    atclCount, `/${statsTotal}`, '#8b5cf6', '🎓')}
  {statCard('Toastmasters',    tmCount,   `/${statsTotal}`, '#10b981', '🎤')}
</div>
```

Replace with the 5-card version in the new order:

```tsx
<div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit, minmax(200px, 1fr))', gap:12, marginBottom:16 }}>
  {statCard('CCP',             ccpCount,  `/${statsTotal}`, '#0ea5e9', '📘')}
  {statCard('Weekly Training', wtCount,   `/${statsTotal}`, '#4f46e5', '🏋️')}
  {statCard('Toastmasters',    tmCount,   `/${statsTotal}`, '#10b981', '🎤')}
  {statCard('TPRR',            tprrCount, `/${statsTotal}`, '#f59e0b', '🗣️')}
  {statCard('ATCL Diploma',    atclCount, `/${statsTotal}`, '#8b5cf6', '🎓')}
</div>
```

- [ ] **Step 7: Replace the Programs column body**

Find the `<td>` block in the table body that currently renders the three checkboxes. It looks like:

```tsx
<td style={td}>
  <div style={{ display:'flex', flexDirection:'column', gap:4 }}>
    {([
      { key: 'weekly_training' as const, label: 'Weekly Training', color: '#4f46e5' },
      { key: 'atcl_diploma'    as const, label: 'ATCL Diploma',    color: '#8b5cf6' },
      { key: 'toastmasters'    as const, label: 'Toastmasters',    color: '#10b981' },
    ]).map(p => (
      <label key={p.key} style={{ display:'flex', alignItems:'center', gap:6, cursor:'pointer', fontSize:11 }}>
        <input
          type="checkbox"
          checked={r[p.key]}
          onChange={() => toggleMutation.mutate({ id: r.id, program: p.key, enrolled: !r[p.key] })}
          style={{ accentColor: p.color, cursor:'pointer' }}
        />
        <span style={{ color: r[p.key] ? p.color : 'var(--muted)', fontWeight: r[p.key] ? 600 : 400 }}>{p.label}</span>
      </label>
    ))}
  </div>
</td>
```

Replace with the chip-list:

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

- [ ] **Step 8: Verify**

```bash
cd frontend && npx tsc --noEmit
```

Expected: zero errors in `CoachBmPerformancePage.tsx`. Pre-existing errors in unrelated files (JsonTable, EventDashboardPage, FaDashboardPage, etc.) are out of scope.

If you have both servers running and the DB migration applied, open the browser to `localhost:5174/coach-bm-performance`:
- 5 stat cards in the order CCP / Weekly Training / Toastmasters / TPRR / ATCL Diploma.
- Programs column shows colored chips per row, matching card colors.
- A coach with no contract value shows `—` in the Programs cell and is not counted on any card.
- A 9M coach shows just the `CCP` chip.
- A 15M coach shows `CCP, Weekly Training, Toastmasters, TPRR` (4 chips).
- An 18M coach shows all 5 chips.
- No checkboxes, no toggle interaction — the column is read-only.

- [ ] **Step 9: Commit**

```bash
git add frontend/src/pages/CoachBmPerformancePage.tsx
git commit -m "feat(coach-perf): contract-derived program chips and 5-card layout"
```

---

## Task 4: Final verification + staging deploy

This task adds no new code. It walks the change through staging.

- [ ] **Step 1: Local end-to-end smoke**

With both servers running and the local DB updated (migration 016's table dropped via 017):

1. Visit `/coach-bm-performance`. Confirm 5 cards, 9-column table, chip column.
2. Visit a few coaches with different contract lengths to verify the mapping is correct (15M → 4 chips, 18M → 5 chips, other → 1 chip, blank → `—`).
3. Toggle the branch filter to a few branches; confirm card totals update; chips don't change.
4. Open `/student-database` and `/archived-students` — confirm no regression from the route file changes.
5. Open devtools → Network tab. Refresh `/coach-bm-performance`. Confirm:
   - `GET /api/coach-bm-performance` returns `programs: [...]` per row, and no longer returns `weekly_training/atcl_diploma/toastmasters` boolean fields.
   - `GET /api/coach-bm-performance/stats` returns `{ total, ccp, weekly_training, toastmasters, tprr, atcl_diploma }`.
   - There is NO outbound `PUT /api/coach-bm-performance/.../program` request anywhere.

- [ ] **Step 2: Push the branch and deploy to staging**

```bash
git push origin feat/coach-bm-performance
git checkout staging
git pull --ff-only
git merge --no-ff feat/coach-bm-performance
git push origin staging
```

Wait for the auto-deploy. While waiting, **apply the new migration on staging DB**:

```bash
psql "$STAGING_DATABASE_URL" -f backend/sql/017_drop_coach_program_enrollment.sql
```

(Or run the SQL via your usual staging-DB client. Idempotent — `DROP TABLE IF EXISTS`.)

Expected: `DROP TABLE` (or `NOTICE: table does not exist, skipping` if migration 016 was never applied to staging — that's fine, the goal is "table absent" either way).

- [ ] **Step 3: Verify on staging**

Visit `https://staging-dashboard.ebright.my/coach-bm-performance`. Repeat the Step 1 checklist there. Pay particular attention to:
- Real coaches (not local seed data) with various `contract` text formats — does the leading-number parse correctly handle them all?
- Any rows with `programs: []` should be coaches with NULL/blank `contract`. If you see one with a non-blank contract showing empty programs, that's a parsing bug — flag and we'll fix.

- [ ] **Step 4: Promote to master only after explicit user approval**

Default behavior: don't push to master. When the user explicitly approves promoting:

```bash
git checkout master
git pull --ff-only
git merge --no-ff feat/coach-bm-performance
git push origin master
```

Then apply migration 017 to production DB the same way (`psql $PROD_DATABASE_URL -f backend/sql/017_drop_coach_program_enrollment.sql`).

Coordinate with whoever owns the prod deploy runbook — when in doubt, ask before pushing master.

---

## Self-review notes

**Spec coverage:**
- §Contract → Programs mapping → Task 2 Step 2 (CASE expression in GET /).
- §Stat cards → Task 3 Step 6 (5 cards in correct order with colors and icons).
- §Programs column → Task 3 Step 7 (chip list with `PROGRAM_COLORS`).
- §Backend / drop table → Task 1.
- §Backend / GET update → Task 2 Step 2.
- §Backend / /stats update → Task 2 Step 3.
- §Backend / delete PUT handler + VALID_PROGRAMS → Task 2 Step 4.
- §Frontend type/imports/hooks → Task 3 Steps 2–5.
- §Permission/routing/layout — unchanged, no task needed.

**Placeholder scan:** No "TBD"/"TODO"/vague placeholders. Every step has either runnable commands or exact code blocks.

**Type/name consistency:**
- `programs` (snake_case in JSON, camelCase nowhere — TypeScript field is `programs`). Used identically across SQL alias, Postgres array, JSON response, `CoachRow.programs`, `r.programs.map(...)`. ✓
- Program label strings: `'CCP'`, `'Weekly Training'`, `'Toastmasters'`, `'TPRR'`, `'ATCL Diploma'` — used identically across SQL string literals (Task 2), `PROGRAM_COLORS` map keys (Task 3 Step 3), and chip rendering. ✓
- Stats field names: `total`, `ccp`, `weekly_training`, `toastmasters`, `tprr`, `atcl_diploma` — used identically in SQL `AS` aliases (Task 2 Step 3) and frontend `stats?.<field>` (Task 3 Step 6). ✓
- `Toastmaster` (singular) does NOT appear anywhere — caught during spec self-review, the singular was a typo in the user's request. Plural everywhere now. ✓

**Trade-off note for the implementer:** The original Task 1 migration (`016_create_coach_program_enrollment.sql`) is still committed in the branch's history. We're not retroactively removing it — the audit trail of "we tried this, then dropped it" is more valuable than a clean tree. Migration 017 cleanly undoes 016 on every environment that ran 016.
