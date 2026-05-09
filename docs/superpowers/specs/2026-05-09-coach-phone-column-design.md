# Coach Phone Column — Design

**Date:** 2026-05-09
**Owner:** Academy / Student Database
**Status:** Draft — pending implementation

## Goal

Add a `Phone` column to the Coach & BM Performance page table, displayed between `Gender` and `Branch`. Sourced from `hrfs."BranchStaff".phone`.

## Non-goals

- Editing the phone number from this page (still owned by HR's portal).
- Click-to-call (`tel:`) behavior — plain text only for now.
- Phone number normalization or validation — display as stored.
- Filtering / searching by phone.

## Backend

`backend/src/routes/coachBmPerformance.js` GET `/` handler:

In the `dataResult` SELECT clause, add `bs."phone"` between `bs."gender"` and `bs."branch"`. No other changes — count query, /stats handler, and PUT handler all remain untouched.

```sql
SELECT bs.id,
       COALESCE(NULLIF(TRIM(bs."name"), ''), nl."name") AS name,
       bs."gender",
       bs."phone",
       bs."branch",
       bs.start_date,
       bs."contract",
       bs."status",
       CASE ... END AS programs,
       COALESCE(...) AS completed_programs
FROM hrfs."BranchStaff" bs
LEFT JOIN name_lookup nl ON nl."nickname" = bs."nickname"
${where}
ORDER BY name ASC
LIMIT $${idx} OFFSET $${idx + 1}
```

## Frontend

`frontend/src/pages/CoachBmPerformancePage.tsx`:

**Type update:** add `phone: string | null` to `CoachRow`, positioned between `gender` and `branch`:

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

**Header update:** insert `'Phone'` between `'Gender'` and `'Branch'` in the existing header array. Column count goes from 9 to 10. The empty-state row's `colSpan` (currently `9`) also bumps to `10`.

**Cell render:** new `<td>` between the Gender cell and the Branch cell, styled to match Gender (muted-text colour when blank, `whiteSpace: 'nowrap'`):

```tsx
<td style={{ ...td, color: r.phone ? 'var(--text)' : 'var(--muted)', whiteSpace:'nowrap' }}>
  {r.phone || '—'}
</td>
```

## Permissions / Privacy

`hrfs."BranchStaff".phone` is already exposed by the existing `/api/hrfs/branch-staff` endpoint to HR roles (`super_admin`, `ceo`, `hr`, `tv`). This change additionally exposes it to anyone with `student_db` permission (which today means super_admin, ceo, plus academy users with custom grants — confirmed acceptable by the user during brainstorm). No other sensitive HR fields (NRIC, salary, bank, address, emergency contact) are added — the SELECT remains tightly scoped.

## Testing

No automated tests (codebase has no runner). Manual verification:
- After applying the change, hard-refresh `localhost:5174/coach-bm-performance`.
- Each row shows the coach's phone between Gender and Branch.
- Coaches with NULL/blank phone show `—`.
- The 10-column header lines up with 10-column rows.
- The empty-state placeholder spans the full width (10 columns).
