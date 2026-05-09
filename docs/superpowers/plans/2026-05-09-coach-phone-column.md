# Coach Phone Column Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a `Phone` column to the Coach & BM Performance page table, between `Gender` and `Branch`. Sourced from `hrfs."BranchStaff".phone`.

**Architecture:** One field added to the GET response, one column added to the page table. No DB migration, no permission change, no /stats change.

**Tech Stack:** Express + node-postgres (raw SQL), React 19 + TypeScript + Vite.

**Spec:** [docs/superpowers/specs/2026-05-09-coach-phone-column-design.md](../specs/2026-05-09-coach-phone-column-design.md)

**Branch:** continue on `feat/coach-bm-performance`. Don't push to remote — user is testing locally.

---

## File Structure

| File | Change | Responsibility |
|---|---|---|
| `backend/src/routes/coachBmPerformance.js` | Modify (1 line) | Add `bs."phone"` to GET / SELECT |
| `frontend/src/pages/CoachBmPerformancePage.tsx` | Modify (3 spots) | Add `phone` to `CoachRow` type, add `'Phone'` to header array, add `<td>` cell |

This is one task. Splitting it would force a broken interim state (backend returns `phone` but frontend ignores it, or vice versa).

---

## Task 1: Add the Phone column end-to-end

**Files:**
- Modify: `backend/src/routes/coachBmPerformance.js`
- Modify: `frontend/src/pages/CoachBmPerformancePage.tsx`

### Step 1: Add `bs."phone"` to GET / SELECT

Open `backend/src/routes/coachBmPerformance.js`. Find the GET `/` handler's `dataResult` SELECT clause. Locate the line `bs."gender",`. Insert `bs."phone",` immediately after it. The relevant fragment becomes:

```sql
SELECT bs.id,
       COALESCE(NULLIF(TRIM(bs."name"), ''), nl."name") AS name,
       bs."gender",
       bs."phone",
       bs."branch",
       bs.start_date,
       bs."contract",
       bs."status",
       CASE
         ...
       END AS programs,
       COALESCE(
         ...
       ) AS completed_programs
```

Don't touch any other part of the SQL: count query, WHERE conditions, ORDER BY, LIMIT, the CASE expression, the `completed_programs` subquery — all unchanged.

### Step 2: Verify backend syntax

```bash
node --check backend/src/routes/coachBmPerformance.js
```

Expected: no output.

### Step 3: Add `phone` to the `CoachRow` type

Open `frontend/src/pages/CoachBmPerformancePage.tsx`. Find the `CoachRow` type:

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

Add `phone: string | null` between `gender` and `branch`:

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

### Step 4: Add `'Phone'` to the table header array and update colSpan

Find the header `<thead>` block. The `<th>` row maps over an array currently containing 9 strings:

```tsx
{['No.','Name','Gender','Branch','Start Date','Contract Period','Programs','No. of Lessons','No. of Students'].map(h => (
  <th key={h} style={th}>{h}</th>
))}
```

Insert `'Phone'` between `'Gender'` and `'Branch'`:

```tsx
{['No.','Name','Gender','Phone','Branch','Start Date','Contract Period','Programs','No. of Lessons','No. of Students'].map(h => (
  <th key={h} style={th}>{h}</th>
))}
```

Then find the empty-state row's `colSpan`. It currently reads `colSpan={9}`. Change to `colSpan={10}`:

```tsx
<tr><td colSpan={10} style={{ ...td, textAlign:'center', padding:'48px 16px', color:'var(--muted)' }}>
```

### Step 5: Add the Phone `<td>` between Gender and Branch

Find the existing data-row mapping. The Gender cell currently looks like:

```tsx
<td style={{ ...td, color:'var(--muted)', whiteSpace:'nowrap' }}>{r.gender || '—'}</td>
```

Immediately after it (and before the Branch cell), insert:

```tsx
<td style={{ ...td, color: r.phone ? 'var(--text)' : 'var(--muted)', whiteSpace:'nowrap' }}>{r.phone || '—'}</td>
```

The Phone cell uses normal text color when a value is present, muted when blank — same idiom as the existing Contract Period cell.

### Step 6: Type-check

```bash
cd frontend && npx tsc --noEmit
```

Expected: zero errors in `CoachBmPerformancePage.tsx`. Pre-existing errors in unrelated files (JsonTable, EventDashboardPage, FaDashboardPage, etc.) are out of scope — DO NOT fix them.

### Step 7: Manual smoke (optional, if local stack is running)

Restart the backend if it's running (the route file changed). Hard-refresh `localhost:5174/coach-bm-performance`.

- Header now shows: No., Name, Gender, **Phone**, Branch, Start Date, Contract Period, Programs, No. of Lessons, No. of Students.
- Each data row shows the coach's phone between Gender and Branch.
- Coaches with NULL/blank phone show `—` in muted color.
- Empty-state placeholder (when filters return zero results) spans all 10 columns.

### Step 8: Commit

```bash
git add backend/src/routes/coachBmPerformance.js frontend/src/pages/CoachBmPerformancePage.tsx
git commit -m "feat(coach-perf): add Phone column"
```

---

## Self-review notes

**Spec coverage:**
- §Backend / SELECT update → Step 1.
- §Frontend / `CoachRow` type → Step 3.
- §Frontend / header update + colSpan → Step 4.
- §Frontend / new `<td>` cell → Step 5.
- §Permissions / Privacy → no task; the spec confirmed the audience widening with the user during brainstorm. No code change needed (router gating is unchanged).
- §Testing → Step 7 (manual).

**Placeholder scan:** No "TBD"/"TODO"/vague placeholders. Every step has either runnable commands or exact code blocks.

**Type/name consistency:**
- Field name `phone` (snake_case nowhere — it's a single word). Used identically in: SQL alias (`bs."phone"`), JSON response, `CoachRow.phone`, and `r.phone` references. ✓
- Column position (between Gender and Branch) is consistent across SQL SELECT order, type field order, header array order, and `<td>` render order. ✓
- `colSpan={10}` matches the new 10-column header. ✓
