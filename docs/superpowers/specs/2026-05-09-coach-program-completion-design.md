# Coach Program Completion — Design

**Date:** 2026-05-09
**Owner:** Academy / Student Database
**Status:** Draft — pending implementation

## Goal

Add per-coach, per-program completion tracking to the Coach & BM Performance page. Each chip in the Programs column gets a leading checkbox; ticking a checkbox marks that coach as having completed that program. Stat cards switch to a "completed / assigned" display.

## Background

The current page (shipped to staging earlier today) derives each coach's program list from `BranchStaff.contract`. The Programs column shows colored chips; the cards count assignment (e.g. "CCP 97/125" = 97 of 125 coaches have CCP assigned). There's no way to record that a coach has actually finished a program. This spec adds that layer.

## Non-goals

- Tracking completion dates beyond a single timestamp (`completed_at`). No multi-attempt history, no certification expiry.
- Bulk import / export of completion records.
- Per-coach completion notes.
- Editing contract values (still owned by HR's portal).

## Storage

New migration `backend/sql/018_create_coach_program_completion.sql`:

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
  completed_by     UUID        REFERENCES users(id) ON DELETE SET NULL,
  PRIMARY KEY (branch_staff_id, program)
);

CREATE INDEX IF NOT EXISTS idx_coach_program_completion_program
  ON public.coach_program_completion (program);
```

The `program` index supports the per-program completion-count queries the stats endpoint will run.

## Backend

### `routes/coachBmPerformance.js` changes

#### GET `/`

Add a `completed_programs text[]` column per row. Two ways to compute it; the recommendation is a correlated subquery returning a sorted array, which is readable and doesn't disturb the existing `name_lookup` CTE / pagination structure:

```sql
SELECT bs.id,
       ...,
       CASE WHEN bs."contract" IS NULL ... END AS programs,
       COALESCE(
         (SELECT array_agg(cpc.program ORDER BY cpc.program)
            FROM coach_program_completion cpc
           WHERE cpc.branch_staff_id = bs.id),
         ARRAY[]::text[]
       ) AS completed_programs
FROM hrfs."BranchStaff" bs
LEFT JOIN name_lookup nl ON nl."nickname" = bs."nickname"
WHERE ...
```

The subquery returns `NULL` if no rows match; `COALESCE` to an empty array keeps the response shape consistent. node-postgres maps Postgres `text[]` to a JS string array.

Note: `completed_programs` may include programs that are not in the coach's current `programs` list (because their contract changed since they completed it). The frontend will filter / display accordingly — no SQL filter at this layer because we want the historical record preserved if the contract reverts.

#### New PUT `/:branchStaffId/completion`

Body: `{ program: string, completed: boolean }`.

Behavior:
1. Validate `branchStaffId` is a positive integer (400 otherwise).
2. Validate `program` is one of the five recognized labels (400 otherwise — server-side allowlist).
3. Validate `completed` is a boolean (400 otherwise).
4. Look up the staff row in `hrfs."BranchStaff"` (must exist, status `Active`, role coach/BM) and re-derive its assigned `programs` list using the same SQL CASE expression as GET. **Reject** with 422 if the requested `program` is not in the assigned list — prevents writing a completion for a program the coach isn't on (e.g. someone manipulating the API to write `ATCL Diploma` for a 9M coach).
5. If `completed === true`: `INSERT ... ON CONFLICT (branch_staff_id, program) DO UPDATE SET completed_at = NOW(), completed_by = $userId`. The UPSERT lets a stale frontend safely re-tick without erroring.
6. If `completed === false`: `DELETE FROM coach_program_completion WHERE branch_staff_id = $1 AND program = $2`.
7. Response: `{ ok: true, branch_staff_id, program, completed }`.

#### GET `/stats`

Response shape becomes:

```json
{
  "total": 125,
  "assigned":  { "ccp": 97, "weekly_training": 83, "toastmasters": 83, "tprr": 83, "atcl_diploma": 1 },
  "completed": { "ccp": 12, "weekly_training": 5, "toastmasters": 3, "tprr": 4, "atcl_diploma": 1 }
}
```

The `assigned` object preserves the current card denominators. The `completed` object is the new numerator data.

A completion record only counts toward `completed.<program>` if that program is currently in the coach's assigned set. SQL pattern:

```sql
WITH parsed AS (
  SELECT bs.id,
         NULLIF(regexp_replace(COALESCE(bs."contract", ''), '[^0-9]', '', 'g'), '')::int AS months,
         bs."contract" AS raw_contract
  FROM hrfs."BranchStaff" bs
  WHERE ${conditions.join(' AND ')}
)
SELECT
  COUNT(*)::int AS total,
  -- assigned (unchanged from current implementation):
  COUNT(*) FILTER (WHERE raw_contract IS NOT NULL AND TRIM(raw_contract) <> '')::int  AS assigned_ccp,
  COUNT(*) FILTER (WHERE months IN (15, 18))::int                                     AS assigned_weekly_training,
  COUNT(*) FILTER (WHERE months IN (15, 18))::int                                     AS assigned_toastmasters,
  COUNT(*) FILTER (WHERE months IN (15, 18))::int                                     AS assigned_tprr,
  COUNT(*) FILTER (WHERE months = 18)::int                                            AS assigned_atcl_diploma,
  -- completed (new — joined via existence check on coach_program_completion):
  COUNT(*) FILTER (WHERE raw_contract IS NOT NULL AND TRIM(raw_contract) <> ''
                       AND EXISTS (SELECT 1 FROM coach_program_completion cpc
                                    WHERE cpc.branch_staff_id = parsed.id
                                      AND cpc.program = 'CCP'))::int                  AS completed_ccp,
  COUNT(*) FILTER (WHERE months IN (15, 18)
                       AND EXISTS (SELECT 1 FROM coach_program_completion cpc
                                    WHERE cpc.branch_staff_id = parsed.id
                                      AND cpc.program = 'Weekly Training'))::int       AS completed_weekly_training,
  COUNT(*) FILTER (WHERE months IN (15, 18)
                       AND EXISTS (SELECT 1 FROM coach_program_completion cpc
                                    WHERE cpc.branch_staff_id = parsed.id
                                      AND cpc.program = 'Toastmasters'))::int          AS completed_toastmasters,
  COUNT(*) FILTER (WHERE months IN (15, 18)
                       AND EXISTS (SELECT 1 FROM coach_program_completion cpc
                                    WHERE cpc.branch_staff_id = parsed.id
                                      AND cpc.program = 'TPRR'))::int                  AS completed_tprr,
  COUNT(*) FILTER (WHERE months = 18
                       AND EXISTS (SELECT 1 FROM coach_program_completion cpc
                                    WHERE cpc.branch_staff_id = parsed.id
                                      AND cpc.program = 'ATCL Diploma'))::int          AS completed_atcl_diploma
FROM parsed;
```

The handler then reshapes the flat row into the nested `{ assigned: {...}, completed: {...} }` JSON.

## Frontend

### `CoachBmPerformancePage.tsx` changes

**Type:** add `completed_programs: string[]` to `CoachRow`.

**Imports:** re-add `useMutation` and `useQueryClient` from `@tanstack/react-query`.

**Mutation:** new `toggleCompletion` mutation:

```ts
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
    if (ctx?.previous && ctx?.queryKey) queryClient.setQueryData(ctx.queryKey, ctx.previous);
  },
  onSettled: () => {
    queryClient.invalidateQueries({ queryKey: ['coachBmPerformance'] });
    queryClient.invalidateQueries({ queryKey: ['coachBmPerformanceStats'] });
  },
});
```

**Programs column:** chips become rows with a leading checkbox:

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
              background: `${color}18`, color, alignSelf:'flex-start',
            }}>{p}</span>
          </label>
        );
      })}
    </div>
  )}
</td>
```

The chip styling is unchanged; only the wrapping `<label>` and leading `<input>` are added.

**Stat cards:** values + subs read from the new nested response:

```ts
const assigned  = stats?.assigned  ?? {};
const completed = stats?.completed ?? {};

const ccpCount       = completed.ccp             ?? 0;
const wtCount        = completed.weekly_training ?? 0;
const tmCount        = completed.toastmasters    ?? 0;
const tprrCount      = completed.tprr            ?? 0;
const atclCount      = completed.atcl_diploma    ?? 0;

const ccpAssigned    = assigned.ccp             ?? 0;
const wtAssigned     = assigned.weekly_training ?? 0;
const tmAssigned     = assigned.toastmasters    ?? 0;
const tprrAssigned   = assigned.tprr            ?? 0;
const atclAssigned   = assigned.atcl_diploma    ?? 0;
```

Each `statCard` call uses its program-specific assigned count as the denominator:

```tsx
{statCard('CCP',             ccpCount,  `/${ccpAssigned}`,  '#0ea5e9', '📘')}
{statCard('Weekly Training', wtCount,   `/${wtAssigned}`,   '#4f46e5', '🏋️')}
{statCard('Toastmasters',    tmCount,   `/${tmAssigned}`,   '#10b981', '🎤')}
{statCard('TPRR',            tprrCount, `/${tprrAssigned}`, '#f59e0b', '🗣️')}
{statCard('ATCL Diploma',    atclCount, `/${atclAssigned}`, '#8b5cf6', '🎓')}
```

The leading number is the completion count; the denominator is the per-program assigned count.

## Edge cases

| Situation | Behavior |
|---|---|
| Coach changes contract from 18M → 15M after completing ATCL | The ATCL completion row stays in the DB. UI hides it (no chip, no card contribution). If contract reverts to 18M, the tick auto-reappears. |
| Coach has no contract | Both `programs` and `completed_programs` empty (after the assigned-programs filter). UI shows `—`. |
| Stale frontend tries to PUT a completion for an unassigned program | Server returns 422. Frontend's optimistic update rolls back. |
| Two users tick the same checkbox concurrently | UPSERT handles it — last write of `completed_at` / `completed_by` wins; the row exists either way. |
| User unticks an already-unticked box | DELETE finds no row and silently succeeds. Idempotent. |

## Permissions

Unchanged. The new PUT and the modified GET both inherit the existing `requireAuth` + `requireDashboard('student_db')` middleware on the router.

## Out of scope (intentional)

- A "complete all" bulk action.
- Showing the completion timestamp in the UI.
- Showing who ticked a completion (`completed_by`).
- Restricting who can tick (any user with `student_db` access can — same as the original Phase-1 ticks).

These are easy follow-ups if the user asks; this spec stays focused on the minimum viable behavior change requested.
