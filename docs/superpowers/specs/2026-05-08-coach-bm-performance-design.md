# Coach & BM Performance — Design

**Date:** 2026-05-08
**Owner:** Academy / Student Database
**Status:** Draft — pending implementation

## Goal

Add a new page under the **Student Database** card on the home page that lists all coaches and Branch Managers (BMs), with editable program-enrollment ticks (Weekly Training, ATCL Diploma, Toastmasters) and placeholder columns for lesson and student counts that will be wired up in a later iteration.

The page mirrors the existing Student Database page in layout: header with stat cards, branch + name filters, paginated table.

## Non-goals

- Computing actual lesson or student counts. Those columns render `—` for every row in this iteration.
- Contract-period-based gating of programs (e.g. "15M coaches do Toastmasters, 12M coaches do not"). All three programs are togglable for everyone in this iteration; the gating logic ships in a follow-up.
- Editing any other `BranchStaff` field. The HR system at portal.ebright.my remains the source of truth for staff data; this page only writes to its own enrollment table.

## Placement

- **Home page card:** Student Database (existing card, `dashboard = student_db`).
- **New 4th link** added to that card's `links` array in [DashboardHomePage.tsx](frontend/src/pages/DashboardHomePage.tsx):
  ```ts
  { label: '🎯 Coach & BM Performance', path: '/coach-bm-performance', dashboard: 'student_db' }
  ```
- **Route:** `/coach-bm-performance`, registered in `App.tsx` behind `<RequirePermission dashboard="student_db">`.
- **Page component:** `frontend/src/pages/CoachBmPerformancePage.tsx`.

## Page layout

Mirrors [StudentDatabasePage.tsx](frontend/src/pages/StudentDatabasePage.tsx) section-for-section:

```
┌─────────────────────────────────────────────────────────────┐
│ ← Back to Home                                               │
│ 🎯 Coach & BM Performance                                    │
│ N total coaches & BMs                                        │
├─────────────────────────────────────────────────────────────┤
│ [Weekly Training] [ATCL Diploma] [Toastmasters]             │  ← 3 stat cards
├─────────────────────────────────────────────────────────────┤
│ Filter by Branch: [▼]   🔍 Search name…   Showing 1-50 of N │
├─────────────────────────────────────────────────────────────┤
│ Table (paginated, 50 per page)                               │
└─────────────────────────────────────────────────────────────┘
```

Visual tokens (`var(--panel)`, `var(--border)`, `var(--text)`, `var(--muted)`, `var(--shadow-sm)`) and the `statCard` helper come straight from `StudentDatabasePage`. No new CSS.

### Filters

- **Branch** — `<select>` populated from the `BRANCHES` constant in [studentTypes.ts](frontend/src/lib/studentTypes.ts) so the dropdown matches Student Database. Default value `All`.
- **Search** — text input that filters by `name` (case-insensitive `ILIKE %q%` on the backend).
- **Status** is fixed to `Active` (not user-toggleable in this iteration). The page is a "performance" view; offboarded staff would dilute it.
- Sort: `name ASC`. Predictable for a roster scan.

### Pagination

50 rows per page, identical pagination control to Student Database (`« First / ‹ Prev / 1 2 3 / Next › / Last »`).

## Stat cards (top row)

Three cards using the existing `statCard` helper signature `(label, val, sub, color, icon)`:

| Card | Value | Sub | Color | Icon |
|------|-------|-----|-------|------|
| Weekly Training | count of branch-filtered staff with `weekly_training = true` | `/N` (N = branch-filtered total) | `#4f46e5` | 🏋️ |
| ATCL Diploma | count of branch-filtered staff with `atcl_diploma = true` | `/N` | `#8b5cf6` | 🎓 |
| Toastmasters | count of branch-filtered staff with `toastmasters = true` | `/N` | `#10b981` | 🎤 |

- Counts derive from the same flags rendered in the **Programs** column.
- Counts respect the **branch filter** (so flipping branches updates them) but **not** the **search query** — same convention as Student Database's FA/PCM cards.
- When contract-based program gating ships later, these counts diverge from `N` automatically.

## Table columns

| # | Column | Source | Notes |
|---|--------|--------|-------|
| 1 | No. | row index | continues across pages: `pageStart + idx + 1` |
| 2 | Name | `BranchStaff.name` | bold; trailing `Active`/`Inactive` pill (same style as Student Database) |
| 3 | Gender | `BranchStaff.gender` | plain text; `—` if blank |
| 4 | Branch | `BranchStaff.branch` | indigo pill (same style as Student Database) |
| 5 | Start Date | `BranchStaff.start_date` | rendered through a date helper. Note: `start_date` is a text field with inconsistent formats (per the existing `/api/hrfs/branch-staff` endpoint comments). The helper attempts `new Date(value)`; if `Invalid Date`, it falls back to the raw text rather than rendering "Invalid Date". |
| 6 | Contract Period | `BranchStaff.contract` | text as-is (e.g. `15M`); `—` if blank |
| 7 | Programs | derived | three checkboxes — Weekly Training, ATCL Diploma, Toastmasters. Toggle saves immediately via PUT (same pattern as FA/PCM checkboxes in Student Database). |
| 8 | No. of Lessons | placeholder | `—` for every row |
| 9 | No. of Students | placeholder | `—` for every row |

### Empty / loading states

- Loading: same `Loading coaches & BMs…` placeholder as Student Database.
- Empty (with branch/search): "No coaches or BMs match your search/filter."
- Empty (no data at all): "No active coaches or BMs found."

## Backend

### New file: `backend/src/middleware/dashboards.js`

```js
const { pool } = require('../db');

// ROLE_DEFAULTS mirror — kept as a const lookup so this middleware does not
// import from routes/permissions.js (avoids circular import). If the defaults
// change in permissions.js, update both places.
const ROLE_DEFAULTS = {
  super_admin: '*',  // all dashboards
  ceo:         ['operations_dept','academy','fa_testing','event_mkt','finance','operations','marketing','department','hr','hr_db','hr_crud','hr_testing','student_db','testing','manjeet','rm_dashboard','events'],
  rm:          ['operations_dept','operations','academy','rm_dashboard'],
  marketing:   ['marketing','academy','event_mkt'],
  od:          ['operations_dept','operations','academy'],
  hr:          ['department','hr','hr_db','hr_crud','hr_testing'],
  academy:     ['academy','fa_testing','events','event_mkt'],
  finance:     ['finance'],
};

function requireDashboard(dashboardId) {
  return async (req, res, next) => {
    if (!req.user) return res.status(401).json({ error: 'Not authenticated' });

    // 1. Custom per-user permission overrides everything.
    const { rows } = await pool.query(
      'SELECT can_view FROM user_permissions WHERE user_id = $1 AND dashboard = $2',
      [req.user.sub, dashboardId]
    );
    if (rows.length) {
      return rows[0].can_view ? next() : res.status(403).json({ error: 'Forbidden' });
    }

    // 2. Fall back to role defaults.
    const defaults = ROLE_DEFAULTS[req.user.role];
    const allowed = defaults === '*' || (Array.isArray(defaults) && defaults.includes(dashboardId));
    return allowed ? next() : res.status(403).json({ error: 'Forbidden' });
  };
}

module.exports = { requireDashboard };
```

**Note on duplication:** the role defaults table is duplicated between `routes/permissions.js` and this middleware. Acceptable trade-off — the alternative is exporting `ROLE_DEFAULTS` from `permissions.js`, which would be cleaner. **Implementation should refactor to a shared constant** (e.g. `backend/src/lib/dashboardDefaults.js`) so there's only one source of truth.

### New table

Migration adds the table to the dashboard's own DB (public schema). No FK constraint to `hrfs."BranchStaff"` because that's a foreign-data-wrapper table and constraints don't propagate.

```sql
CREATE TABLE coach_program_enrollment (
  branch_staff_id  INTEGER PRIMARY KEY,
  weekly_training  BOOLEAN     NOT NULL DEFAULT FALSE,
  atcl_diploma     BOOLEAN     NOT NULL DEFAULT FALSE,
  toastmasters     BOOLEAN     NOT NULL DEFAULT FALSE,
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_by       UUID        REFERENCES users(id) ON DELETE SET NULL
);
```

**Stability caveat:** `branch_staff_id` references `hrfs."BranchStaff".id`. If HR rebuilds the foreign table from scratch with new ids, every existing tick orphans. Switching to `nickname` would be more durable but introduces collision risk (two people with the same nickname). Decision: keep `branch_staff_id`; if HR ever does a full rebuild, write a one-time migration that maps old → new ids by `nickname + nric`. Document this in the migration file.

### New file: `backend/src/routes/coachBmPerformance.js`

```js
const express = require('express');
const { pool } = require('../db');
const { requireAuth } = require('../middleware/auth');
const { requireDashboard } = require('../middleware/dashboards');

const router = express.Router();
router.use(requireAuth);
router.use(requireDashboard('student_db'));

const VALID_PROGRAMS = new Set(['weekly_training', 'atcl_diploma', 'toastmasters']);
```

**Endpoints:**

#### `GET /api/coach-bm-performance`

Query params: `search?`, `branch?`, `page=1`, `limit=50`.

- Filters `hrfs."BranchStaff"` to `(role ILIKE '%coach%' OR role = 'BM') AND status = 'Active'`.
- Reuses the same `name_lookup` CTE pattern as the existing `/api/hrfs/branch-staff` endpoint to resolve stub-row names.
- LEFT JOINs `coach_program_enrollment` so rows without an enrollment row get `false` defaults for all three programs.
- Returns the 7 columns the page needs plus the 3 program flags. **Does not** select NRIC, salary rate, bank info, address, or emergency contact.

```sql
WITH name_lookup AS (
  SELECT DISTINCT ON ("nickname") "nickname", "name"
  FROM hrfs."BranchStaff"
  WHERE "name" IS NOT NULL AND TRIM("name") <> ''
    AND "nickname" IS NOT NULL AND TRIM("nickname") <> ''
  ORDER BY "nickname", "createdAt" DESC
)
SELECT
  bs.id,
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
WHERE (bs."role" ILIKE '%coach%' OR bs."role" = 'BM')
  AND bs."status" = 'Active'
  AND COALESCE(NULLIF(TRIM(bs."name"), ''), nl."name") IS NOT NULL
  AND ($branch IS NULL OR bs."branch" = $branch)
  AND ($search IS NULL OR COALESCE(NULLIF(TRIM(bs."name"), ''), nl."name") ILIKE $search)
ORDER BY name ASC
LIMIT $limit OFFSET $offset
```

Response shape:
```json
{
  "records": [
    { "id": 355, "name": "ADLIA ...", "gender": "Female", "branch": "KTG",
      "start_date": "2024-08-01", "contract": "15M", "status": "Active",
      "weekly_training": true, "atcl_diploma": false, "toastmasters": true }
  ],
  "total": 42,
  "page": 1,
  "totalPages": 1
}
```

#### `PUT /api/coach-bm-performance/:branchStaffId/program`

Body: `{ "program": "weekly_training" | "atcl_diploma" | "toastmasters", "enrolled": true }`.

- Validates `program` against `VALID_PROGRAMS` (reject anything else with 400).
- Validates that `branchStaffId` exists in `hrfs."BranchStaff"` and matches the coach/BM filter (reject with 404 otherwise — prevents writing ticks against arbitrary HR rows).
- Upserts via `INSERT ... ON CONFLICT (branch_staff_id) DO UPDATE`. The handler builds the INSERT row with the new value in the targeted column and `FALSE` for the others (so a brand-new row has the right initial state); the UPDATE branch uses `CASE` on the program name so only the targeted column is overwritten on an existing row:

```sql
INSERT INTO coach_program_enrollment
  (branch_staff_id, weekly_training, atcl_diploma, toastmasters, updated_at, updated_by)
VALUES ($id, $wt_init, $atcl_init, $tm_init, NOW(), $userId)
ON CONFLICT (branch_staff_id) DO UPDATE SET
  weekly_training = CASE WHEN $program = 'weekly_training' THEN EXCLUDED.weekly_training ELSE coach_program_enrollment.weekly_training END,
  atcl_diploma    = CASE WHEN $program = 'atcl_diploma'    THEN EXCLUDED.atcl_diploma    ELSE coach_program_enrollment.atcl_diploma    END,
  toastmasters    = CASE WHEN $program = 'toastmasters'    THEN EXCLUDED.toastmasters    ELSE coach_program_enrollment.toastmasters    END,
  updated_at      = NOW(),
  updated_by      = EXCLUDED.updated_by
RETURNING *;
```

Where `$wt_init`, `$atcl_init`, `$tm_init` are computed in the handler: the targeted program receives `enrolled`, the other two receive `FALSE`. Response: `{ ok: true, enrollment: { ... } }`.

### App.js wiring

Add to `backend/src/app.js`:
```js
const { coachBmPerformanceRouter } = require('./routes/coachBmPerformance');
app.use('/api/coach-bm-performance', applyRoleBasedRateLimit, coachBmPerformanceRouter);
```

## Frontend

### `CoachBmPerformancePage.tsx`

State:
- `branchFilter` (`'All'` default, drives query)
- `searchQuery` (debounced 200ms before driving query)
- `page` (1-indexed)
- `data`, `loading`, `apiError` from `useQuery` (`@tanstack/react-query`, already used by `HrfsBranchStaffPage`)

Data fetching:
- `useQuery(['coachBmPerformance', branch, search, page], () => apiFetch('/api/coach-bm-performance?…'))`.
- `staleTime: 2 * 60 * 1000` to match `HrfsBranchStaffPage`.

Toggling a program checkbox:
- Optimistic update — flip the local row, then `apiFetch('PUT /api/coach-bm-performance/:id/program', { program, enrolled })`.
- On error: revert and show the same `apiError` banner pattern Student Database uses.
- Use React Query's `useMutation` with `onMutate` / `onError` for the optimistic update, then `invalidateQueries(['coachBmPerformance'])` on success to refresh stats.

Stat-card counts: derived in the component from `data.records`, filtered by branch (already filtered server-side, so it's just `records.filter(r => r.weekly_training).length`).

## Permissions wiring summary

| Layer | Gate |
|-------|------|
| Frontend route (`App.tsx`) | `<RequirePermission dashboard="student_db">` |
| Backend router | `requireAuth` + `requireDashboard('student_db')` |
| Existing HR endpoint `/api/hrfs/branch-staff` | **untouched** — stays HR-only |
| Sensitive `BranchStaff` fields (NRIC, bank, salary, address, emergency contact) | **never selected** by the new endpoint |

## Open questions / risks

1. **`requireDashboard` middleware vs. simpler `requireRole`** — flagged in design discussion. New middleware chosen because it matches the frontend gate exactly. If the implementer prefers, falling back to `requireRole(['super_admin', 'ceo', 'tv'])` is acceptable; users with custom-granted `student_db` permission would then get a 403 from the API but a working frontend page. Document the trade-off.
2. **Stub rows in `BranchStaff`** — handled by reusing the existing `name_lookup` CTE. Stub rows with no resolvable name are filtered out, matching the existing `/api/hrfs/branch-staff` behavior.
3. **`branch_staff_id` durability** — addressed in the table comment and in the "Stability caveat" above.
4. **Status filter** — defaulted to `Active`-only with no user toggle. If the user later wants to see offboarded coaches' historical program enrollment, add a status dropdown.
5. **Sort order** — `name ASC` chosen; if the user wants `branch ASC, name ASC` or `start_date DESC` later, change the `ORDER BY` and add a sort dropdown.
