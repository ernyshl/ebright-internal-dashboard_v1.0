# Coach & BM Performance — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a Coach & BM Performance page under the Student Database card on the home page, with a paginated table of active coaches/BMs from `hrfs."BranchStaff"` plus tickable program-enrollment columns (Weekly Training, ATCL Diploma, Toastmasters) and three matching stat cards. Lesson and student counts are placeholder columns for now.

**Architecture:** New backend route at `/api/coach-bm-performance` gated by a new `requireDashboard('student_db')` middleware. Program ticks persist to a new `coach_program_enrollment` table in the dashboard's own DB (cross-schema with the read-only `hrfs."BranchStaff"` foreign table). New frontend page at `/coach-bm-performance` mirroring the Student Database page layout, fetching with React Query, optimistic toggle on checkbox.

**Tech Stack:** Express + node-postgres `pg` Pool (raw SQL via `backend/sql/*.sql` migration files), React 19 + TypeScript + Vite, `@tanstack/react-query` for data fetching, plain CSS via `frontend/src/App.css`.

**Spec:** [docs/superpowers/specs/2026-05-08-coach-bm-performance-design.md](../specs/2026-05-08-coach-bm-performance-design.md)

**Commit policy:** Each task ends with a commit step. **Do not push to `master`** — work on a feature branch, push to `staging`, verify on `staging-dashboard.ebright.my`, only then merge to `master`. The `staging` branch auto-deploys.

---

## File Structure

| File | Change | Responsibility |
|---|---|---|
| `backend/sql/016_create_coach_program_enrollment.sql` | Create | DDL for the new enrollment table |
| `backend/src/lib/dashboardDefaults.js` | Create | Single source of truth for `ROLE_DEFAULTS` and `DASHBOARDS`, replacing the const inside `routes/permissions.js` |
| `backend/src/routes/permissions.js` | Modify | Import `ROLE_DEFAULTS`/`DASHBOARDS` from the new lib instead of defining them locally |
| `backend/src/middleware/dashboards.js` | Create | New `requireDashboard(dashboardId)` middleware that mirrors the frontend permission gate |
| `backend/src/routes/coachBmPerformance.js` | Create | GET (list) + PUT (toggle program) endpoints |
| `backend/src/app.js` | Modify | Wire the new router under `/api/coach-bm-performance` |
| `frontend/src/pages/CoachBmPerformancePage.tsx` | Create | New page component |
| `frontend/src/App.tsx` | Modify | Register the new route behind `<RequirePermission dashboard="student_db">` |
| `frontend/src/pages/DashboardHomePage.tsx` | Modify | Add a 4th link to the Student Database card |

No tests are added — this codebase has no test runner configured. Each task uses manual verification (curl for backend, browser for frontend) as the verification step.

---

## Task 1: Create the `coach_program_enrollment` migration

**Files:**
- Create: `backend/sql/016_create_coach_program_enrollment.sql`

- [ ] **Step 1: Create the migration file**

Write `backend/sql/016_create_coach_program_enrollment.sql`:

```sql
-- 016_create_coach_program_enrollment.sql
--
-- Stores program-enrollment ticks (Weekly Training, ATCL Diploma,
-- Toastmasters) for coaches and Branch Managers, displayed on the
-- /coach-bm-performance page.
--
-- branch_staff_id references hrfs."BranchStaff".id but no FK constraint
-- because BranchStaff lives in a foreign-data-wrapper schema and
-- cross-schema FKs to FDW tables are not supported.
--
-- DURABILITY NOTE: if HR ever rebuilds the foreign table from scratch
-- with new ids, every enrollment row orphans. If that happens, write a
-- one-time migration that maps old → new ids by (nickname, nric) before
-- the rebuild.

CREATE TABLE IF NOT EXISTS coach_program_enrollment (
  branch_staff_id  INTEGER     PRIMARY KEY,
  weekly_training  BOOLEAN     NOT NULL DEFAULT FALSE,
  atcl_diploma     BOOLEAN     NOT NULL DEFAULT FALSE,
  toastmasters     BOOLEAN     NOT NULL DEFAULT FALSE,
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_by       UUID        REFERENCES users(id) ON DELETE SET NULL
);
```

- [ ] **Step 2: Apply the migration to local dev DB**

Run from the project root (the `pool` in `backend/src/db.js` reads `DATABASE_URL` from `backend/.env`):

```bash
psql "$DATABASE_URL" -f backend/sql/016_create_coach_program_enrollment.sql
```

PowerShell variant:

```powershell
psql $env:DATABASE_URL -f backend/sql/016_create_coach_program_enrollment.sql
```

Expected: `CREATE TABLE` (or `NOTICE: relation already exists, skipping` on a re-run — `IF NOT EXISTS` makes it idempotent).

- [ ] **Step 3: Verify the table exists**

Run:

```bash
psql "$DATABASE_URL" -c "\d coach_program_enrollment"
```

Expected output: a description of the 6 columns with the right types and constraints (`branch_staff_id` PK, three booleans defaulting to false, `updated_at` defaulting to NOW(), nullable `updated_by`).

- [ ] **Step 4: Commit**

```bash
git add backend/sql/016_create_coach_program_enrollment.sql
git commit -m "feat(coach-perf): add coach_program_enrollment table"
```

---

## Task 2: Extract `ROLE_DEFAULTS` and `DASHBOARDS` to a shared lib

**Files:**
- Create: `backend/src/lib/dashboardDefaults.js`
- Modify: `backend/src/routes/permissions.js`

The new `requireDashboard` middleware needs the same `ROLE_DEFAULTS` lookup that lives inside `routes/permissions.js`. Importing the route file from a middleware risks circular imports, so this task lifts the constants into a dependency-free lib module.

- [ ] **Step 1: Create the shared lib file**

Write `backend/src/lib/dashboardDefaults.js`:

```js
// Single source of truth for dashboard registry and per-role default
// access. Imported by both routes/permissions.js (to serve the user
// permissions API) and middleware/dashboards.js (to gate routes).
//
// To grant a card to a role by default: append the card id to the
// matching role's array. To register a brand-new card: add it to
// DASHBOARDS, then add the id to whichever roles should see it by
// default (super_admin always gets all of them automatically).

const DASHBOARDS = [
  { id: 'operations_dept', name: 'Operations Department',           icon: '⚙️' },
  { id: 'academy',         name: 'Academy',                         icon: '🎓' },
  { id: 'fa_testing',      name: 'FA Dashboard Testing',            icon: '🧪' },
  { id: 'event_mkt',       name: 'Event MKT',                       icon: '🎪' },
  { id: 'finance',         name: 'Finance',                         icon: '💰' },
  { id: 'operations',      name: 'Optimisation',                    icon: '⚙️' },
  { id: 'marketing',       name: 'Marketing',                       icon: '📈' },
  { id: 'department',      name: 'Department',                      icon: '✅' },
  { id: 'hr',              name: 'HR',                              icon: '👥' },
  { id: 'hr_db',           name: 'HR Database',                     icon: '🗄️' },
  { id: 'hr_crud',         name: 'CRUD HR Data',                    icon: '📋' },
  { id: 'hr_testing',      name: 'HR Testing Data',                 icon: '🧪' },
  { id: 'student_db',      name: 'Student Database',                icon: '📚' },
  { id: 'admin',           name: 'Admin',                           icon: '🔧' },
  { id: 'testing',         name: 'Testing (dnft)',                  icon: '🧪' },
  { id: 'manjeet',         name: 'For Manjeet',                     icon: '🎯' },
  { id: 'rm_dashboard',    name: 'For Regional Manager',            icon: '📊' },
  { id: 'events',          name: 'Events',                          icon: '🎪' },
];

const ROLE_DEFAULTS = {
  super_admin: DASHBOARDS.map(d => d.id),
  ceo:         DASHBOARDS.map(d => d.id).filter(id => id !== 'admin'),
  rm:          ['operations_dept', 'operations', 'academy', 'rm_dashboard'],
  marketing:   ['marketing', 'academy', 'event_mkt'],
  od:          ['operations_dept', 'operations', 'academy'],
  hr:          ['department', 'hr', 'hr_db', 'hr_crud', 'hr_testing'],
  academy:     ['academy', 'fa_testing', 'events', 'event_mkt'],
  finance:     ['finance'],
};

module.exports = { DASHBOARDS, ROLE_DEFAULTS };
```

- [ ] **Step 2: Replace local consts in `routes/permissions.js`**

In `backend/src/routes/permissions.js`, replace lines 12–44 (the `DASHBOARDS` array and the `ROLE_DEFAULTS` object) with a single import line.

Find this block at the top of the file (after the existing requires):

```js
// Available dashboards — one entry per CARD on the home page so admins can
// toggle visibility per card. ...
const DASHBOARDS = [
  { id: 'operations_dept', name: 'Operations Department',           icon: '⚙️' },
  // ...
];

const ROLE_DEFAULTS = {
  super_admin: DASHBOARDS.map(d => d.id),
  // ...
};
```

Replace it with:

```js
const { DASHBOARDS, ROLE_DEFAULTS } = require('../lib/dashboardDefaults');
```

- [ ] **Step 3: Verify the permissions endpoint still returns the same shape**

Start the backend (`cd backend && npm run dev`) and call the permissions endpoint with a logged-in token. Easiest way: open the dashboard in a browser, log in, then in the browser devtools Network tab inspect the response from `GET /api/permissions`. Confirm:

- `permissions` object includes the `student_db` key with `{allowed: <true|false>, custom: false}` (or `fromRole: true` if applicable).
- `dashboards` array (if exposed by this endpoint) is unchanged from before.

If using curl with a token from logged-in localStorage:

```bash
curl -s "$API/api/permissions" -H "Authorization: Bearer $TOKEN" | jq '.permissions.student_db'
```

Expected: `{"allowed": true, ...}` for super_admin/ceo, `{"allowed": false, ...}` for academy/finance/etc.

- [ ] **Step 4: Commit**

```bash
git add backend/src/lib/dashboardDefaults.js backend/src/routes/permissions.js
git commit -m "refactor(perms): lift DASHBOARDS/ROLE_DEFAULTS to shared lib"
```

---

## Task 3: Create the `requireDashboard` middleware

**Files:**
- Create: `backend/src/middleware/dashboards.js`

- [ ] **Step 1: Write the middleware**

Write `backend/src/middleware/dashboards.js`:

```js
const { pool } = require('../db');
const { ROLE_DEFAULTS } = require('../lib/dashboardDefaults');

// Permission gate that mirrors the frontend <RequirePermission dashboard="X">
// component:
//   1. user_permissions row exists for (user, dashboard) → use its can_view flag
//   2. otherwise fall back to ROLE_DEFAULTS[user.role]
//
// Use this on routes whose audience is "users who can see card X on the
// home page" rather than "users with role Y" — the dashboard registry
// supports per-user custom grants, requireRole does not.
function requireDashboard(dashboardId) {
  return async (req, res, next) => {
    if (!req.user) return res.status(401).json({ error: 'Not authenticated' });
    if (req.user.role === 'super_admin') return next();

    try {
      const { rows } = await pool.query(
        'SELECT can_view FROM user_permissions WHERE user_id = $1 AND dashboard = $2',
        [req.user.sub, dashboardId]
      );
      if (rows.length) {
        return rows[0].can_view ? next() : res.status(403).json({ error: 'Forbidden' });
      }

      const defaults = ROLE_DEFAULTS[req.user.role] || [];
      return defaults.includes(dashboardId)
        ? next()
        : res.status(403).json({ error: 'Forbidden' });
    } catch (err) {
      return next(err);
    }
  };
}

module.exports = { requireDashboard };
```

- [ ] **Step 2: Smoke-test by attaching it to a throwaway route (optional, recommended)**

If you want to verify the middleware works before Task 4 wires it to a real route, temporarily add to `backend/src/app.js` after the existing route mounts:

```js
const { requireAuth } = require('./middleware/auth');
const { requireDashboard } = require('./middleware/dashboards');
app.get('/api/_dashtest/student-db', requireAuth, requireDashboard('student_db'), (req, res) => {
  res.json({ ok: true });
});
```

Then call:

```bash
curl -i "$API/api/_dashtest/student-db" -H "Authorization: Bearer $SUPER_ADMIN_TOKEN"
```

Expected: `200 OK` with `{"ok":true}` for super_admin/ceo. With an academy-only token: `403 Forbidden`.

**Remove the test route before committing.**

- [ ] **Step 3: Commit**

```bash
git add backend/src/middleware/dashboards.js
git commit -m "feat(perms): add requireDashboard middleware"
```

---

## Task 4: Create the GET `/api/coach-bm-performance` endpoint

**Files:**
- Create: `backend/src/routes/coachBmPerformance.js`

- [ ] **Step 1: Write the route file with the GET handler only**

Write `backend/src/routes/coachBmPerformance.js`:

```js
const express = require('express');
const { pool } = require('../db');
const { requireAuth } = require('../middleware/auth');
const { requireDashboard } = require('../middleware/dashboards');

const router = express.Router();
router.use(requireAuth);
router.use(requireDashboard('student_db'));

const VALID_PROGRAMS = new Set(['weekly_training', 'atcl_diploma', 'toastmasters']);

// GET /api/coach-bm-performance
//
// Returns active coaches and BMs from hrfs."BranchStaff" joined with the
// dashboard-side coach_program_enrollment table.
//
//   role match:  ILIKE '%coach%' OR exact 'BM'
//   status:      Active only
//   ordering:    name ASC
//
// Reuses the same name_lookup CTE pattern as /api/hrfs/branch-staff to
// rescue stub rows where bs.name is blank but a sibling row with the same
// nickname has a real name. Rows that can't be rescued are filtered out.
router.get('/', async (req, res, next) => {
  try {
    const { search = '', branch = '', page = 1, limit = 50 } = req.query;
    const conditions = [
      `(bs."role" ILIKE '%coach%' OR bs."role" = 'BM')`,
      `bs."status" = 'Active'`,
    ];
    const params = [];
    let idx = 1;

    if (search) {
      conditions.push(`COALESCE(NULLIF(TRIM(bs."name"), ''), nl."name") ILIKE $${idx}`);
      params.push(`%${search}%`); idx++;
    }
    if (branch) {
      conditions.push(`bs."branch" = $${idx}`);
      params.push(branch); idx++;
    }

    const where = `WHERE ${conditions.join(' AND ')}
      AND COALESCE(NULLIF(TRIM(bs."name"), ''), nl."name") IS NOT NULL`;
    const offset = (Number(page) - 1) * Number(limit);

    const nameLookupCte = `
      WITH name_lookup AS (
        SELECT DISTINCT ON ("nickname") "nickname", "name"
        FROM hrfs."BranchStaff"
        WHERE "name" IS NOT NULL AND TRIM("name") <> ''
          AND "nickname" IS NOT NULL AND TRIM("nickname") <> ''
        ORDER BY "nickname", "createdAt" DESC
      )
    `;

    const [countResult, dataResult] = await Promise.all([
      pool.query(
        `${nameLookupCte}
         SELECT COUNT(*)
         FROM hrfs."BranchStaff" bs
         LEFT JOIN name_lookup nl ON nl."nickname" = bs."nickname"
         ${where}`,
        params
      ),
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
    ]);

    return res.json({
      records: dataResult.rows,
      total: parseInt(countResult.rows[0].count, 10),
      page: Number(page),
      totalPages: Math.ceil(parseInt(countResult.rows[0].count, 10) / Number(limit)),
    });
  } catch (err) { return next(err); }
});

module.exports = { coachBmPerformanceRouter: router };
```

- [ ] **Step 2: Wire the router into `app.js` so it can be tested now**

In `backend/src/app.js`, add the require near the other route requires (around line 29-46 — match the existing pattern):

```js
const { coachBmPerformanceRouter } = require('./routes/coachBmPerformance');
```

Then add the mount line near the other `app.use('/api/...')` lines (the cluster around lines 137–163):

```js
app.use('/api/coach-bm-performance', applyRoleBasedRateLimit, coachBmPerformanceRouter);
```

Place it immediately after the existing `app.use('/api/student-attendance', ...)` line so related routes stay grouped.

- [ ] **Step 3: Run the backend and smoke-test**

Start the backend:

```bash
cd backend && npm run dev
```

In a second terminal, grab a super_admin token (log into the dashboard once and copy from devtools localStorage `token` key, or call the auth login endpoint), then:

```bash
curl -s "$API/api/coach-bm-performance?limit=5" -H "Authorization: Bearer $TOKEN" | jq
```

Expected response shape:

```json
{
  "records": [
    {
      "id": 355,
      "name": "ADLIA NURIN BADRISYA ...",
      "gender": "Female",
      "branch": "KTG",
      "start_date": "2024-08-01",
      "contract": "15M",
      "status": "Active",
      "weekly_training": false,
      "atcl_diploma": false,
      "toastmasters": false
    }
  ],
  "total": 42,
  "page": 1,
  "totalPages": 9
}
```

Verify:
- `total` is non-zero (there are active coaches/BMs in BranchStaff).
- Every returned row has `weekly_training`, `atcl_diploma`, `toastmasters` all `false` (no enrollment rows yet).
- Filtering works:
  ```bash
  curl -s "$API/api/coach-bm-performance?branch=ONL&limit=3" -H "Authorization: Bearer $TOKEN" | jq '.records[].branch'
  ```
  All values should be `"ONL"`.
- Search works:
  ```bash
  curl -s "$API/api/coach-bm-performance?search=adlia" -H "Authorization: Bearer $TOKEN" | jq '.records[].name'
  ```
  Should return rows whose name contains "adlia" (case-insensitive).
- 403 for unauthorized roles: with an `academy` token (academy isn't in `student_db` defaults), the same call returns `403 Forbidden`.

- [ ] **Step 4: Commit**

```bash
git add backend/src/routes/coachBmPerformance.js backend/src/app.js
git commit -m "feat(coach-perf): add GET /api/coach-bm-performance endpoint"
```

---

## Task 5: Add the PUT `/api/coach-bm-performance/:branchStaffId/program` endpoint

**Files:**
- Modify: `backend/src/routes/coachBmPerformance.js`

- [ ] **Step 1: Append the PUT handler**

Open `backend/src/routes/coachBmPerformance.js` and add this handler **before** the `module.exports` line at the bottom:

```js
// PUT /api/coach-bm-performance/:branchStaffId/program
//
// Body: { program: 'weekly_training' | 'atcl_diploma' | 'toastmasters', enrolled: boolean }
//
// Validates that the staff row exists, is Active, and matches the
// coach/BM filter, then upserts the enrollment row. Existing flags on
// the other two programs are preserved by the CASE expression in the
// UPDATE branch — we only ever change the targeted column.
router.put('/:branchStaffId/program', async (req, res, next) => {
  try {
    const branchStaffId = parseInt(req.params.branchStaffId, 10);
    if (!Number.isInteger(branchStaffId) || branchStaffId <= 0) {
      return res.status(400).json({ error: 'Invalid branchStaffId' });
    }

    const { program, enrolled } = req.body || {};
    if (!VALID_PROGRAMS.has(program)) {
      return res.status(400).json({ error: 'Invalid program' });
    }
    if (typeof enrolled !== 'boolean') {
      return res.status(400).json({ error: 'enrolled must be boolean' });
    }

    // Confirm the staff row is a real, active coach/BM. Prevents writing
    // ticks against arbitrary HR rows by guessing ids.
    const { rows: staffRows } = await pool.query(
      `SELECT id FROM hrfs."BranchStaff"
       WHERE id = $1
         AND "status" = 'Active'
         AND ("role" ILIKE '%coach%' OR "role" = 'BM')`,
      [branchStaffId]
    );
    if (!staffRows.length) {
      return res.status(404).json({ error: 'Coach or BM not found' });
    }

    const wt   = program === 'weekly_training' ? enrolled : false;
    const atcl = program === 'atcl_diploma'    ? enrolled : false;
    const tm   = program === 'toastmasters'    ? enrolled : false;
    const userId = req.user.sub;

    const { rows } = await pool.query(
      `INSERT INTO coach_program_enrollment
         (branch_staff_id, weekly_training, atcl_diploma, toastmasters, updated_at, updated_by)
       VALUES ($1, $2, $3, $4, NOW(), $5)
       ON CONFLICT (branch_staff_id) DO UPDATE SET
         weekly_training = CASE WHEN $6 = 'weekly_training' THEN EXCLUDED.weekly_training ELSE coach_program_enrollment.weekly_training END,
         atcl_diploma    = CASE WHEN $6 = 'atcl_diploma'    THEN EXCLUDED.atcl_diploma    ELSE coach_program_enrollment.atcl_diploma    END,
         toastmasters    = CASE WHEN $6 = 'toastmasters'    THEN EXCLUDED.toastmasters    ELSE coach_program_enrollment.toastmasters    END,
         updated_at      = NOW(),
         updated_by      = EXCLUDED.updated_by
       RETURNING branch_staff_id, weekly_training, atcl_diploma, toastmasters, updated_at`,
      [branchStaffId, wt, atcl, tm, userId, program]
    );

    return res.json({ ok: true, enrollment: rows[0] });
  } catch (err) { return next(err); }
});
```

- [ ] **Step 2: Smoke-test the PUT**

With the backend still running, pick an `id` from a previous GET response and toggle Weekly Training on:

```bash
curl -s -X PUT "$API/api/coach-bm-performance/355/program" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"program":"weekly_training","enrolled":true}' | jq
```

Expected:

```json
{
  "ok": true,
  "enrollment": {
    "branch_staff_id": 355,
    "weekly_training": true,
    "atcl_diploma": false,
    "toastmasters": false,
    "updated_at": "2026-..."
  }
}
```

Verify the GET reflects it:

```bash
curl -s "$API/api/coach-bm-performance?search=adlia" -H "Authorization: Bearer $TOKEN" | jq '.records[] | {name, weekly_training}'
```

Expected: `weekly_training: true` for the row you toggled.

Toggle a second program for the same row to confirm the first one is preserved:

```bash
curl -s -X PUT "$API/api/coach-bm-performance/355/program" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"program":"toastmasters","enrolled":true}' | jq
```

Expected: `weekly_training: true, toastmasters: true, atcl_diploma: false`.

Toggle Weekly Training off:

```bash
curl -s -X PUT "$API/api/coach-bm-performance/355/program" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"program":"weekly_training","enrolled":false}' | jq
```

Expected: `weekly_training: false, toastmasters: true`.

Validation checks:

```bash
# Invalid program
curl -s -X PUT "$API/api/coach-bm-performance/355/program" \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"program":"foo","enrolled":true}' | jq
# Expected: {"error":"Invalid program"}, status 400

# Non-coach id (e.g. an FT EXEC row from BranchStaff)
curl -s -X PUT "$API/api/coach-bm-performance/244/program" \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"program":"weekly_training","enrolled":true}' | jq
# Expected: {"error":"Coach or BM not found"}, status 404
```

- [ ] **Step 3: Commit**

```bash
git add backend/src/routes/coachBmPerformance.js
git commit -m "feat(coach-perf): add PUT /program endpoint with upsert"
```

---

## Task 6: Create the page component skeleton (header, fetch, table without checkboxes)

**Files:**
- Create: `frontend/src/pages/CoachBmPerformancePage.tsx`
- Modify: `frontend/src/App.tsx`
- Modify: `frontend/src/pages/DashboardHomePage.tsx`

- [ ] **Step 1: Create the page component**

Write `frontend/src/pages/CoachBmPerformancePage.tsx`:

```tsx
import { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { BackButton } from '../components/BackButton';
import { BRANCHES } from '../lib/studentTypes';
import { apiFetch } from '../lib/api';

const PAGE_SIZE = 50;

const th = { padding:'10px 14px', textAlign:'left' as const, fontSize:11, fontWeight:700, color:'var(--muted)', textTransform:'uppercase' as const, whiteSpace:'nowrap' as const, letterSpacing:0.5 };
const td = { padding:'10px 14px', fontSize:12 };

type CoachRow = {
  id: number;
  name: string;
  gender: string | null;
  branch: string | null;
  start_date: string | null;
  contract: string | null;
  status: string | null;
  weekly_training: boolean;
  atcl_diploma: boolean;
  toastmasters: boolean;
};

function fmtStartDate(raw: string | null): string {
  if (!raw) return '—';
  const d = new Date(raw);
  if (isNaN(d.getTime())) return raw; // fall back to raw text — start_date is inconsistent in BranchStaff
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

export function CoachBmPerformancePage() {
  const [branchFilter, setBranchFilter] = useState<string>('All');
  const [searchQuery, setSearchQuery] = useState('');
  const [page, setPage] = useState(1);

  useEffect(() => { setPage(1); }, [branchFilter, searchQuery]);

  const params = new URLSearchParams({ page: String(page), limit: String(PAGE_SIZE) });
  if (branchFilter !== 'All') params.set('branch', branchFilter);
  if (searchQuery.trim())     params.set('search', searchQuery.trim());

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['coachBmPerformance', branchFilter, searchQuery, page],
    queryFn: () => apiFetch(`/api/coach-bm-performance?${params}`),
    staleTime: 2 * 60 * 1000,
  });

  const records: CoachRow[] = data?.records || [];
  const total: number = data?.total || 0;
  const totalPages: number = data?.totalPages || 1;
  const pageStart = (page - 1) * PAGE_SIZE;
  const pageEnd = Math.min(pageStart + PAGE_SIZE, pageStart + records.length);

  return (
    <div className="dashboardPage">
      {/* Header */}
      <div style={{ marginBottom:24 }}>
        <BackButton to="/" label="Back to Home" />
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginTop:12, flexWrap:'wrap', gap:12 }}>
          <div>
            <h1 style={{ fontSize:28, fontWeight:900, color:'var(--text)', margin:0, letterSpacing:-0.5 }}>🎯 Coach & BM Performance</h1>
            <p style={{ fontSize:13, color:'var(--muted)', margin:'4px 0 0' }}>{total} total coaches & BMs</p>
          </div>
        </div>
      </div>

      {isError && (
        <div style={{ background:'#fee2e2', border:'1px solid #fca5a5', borderRadius:8, padding:'10px 16px', marginBottom:12, fontSize:13, color:'#dc2626' }}>
          ⚠ {(error as any)?.message || 'Failed to load coaches & BMs'}
        </div>
      )}

      {/* Stat cards placeholder — filled in Task 7 */}

      {/* Filters */}
      <div style={{ background:'var(--panel)', border:'1px solid var(--border)', borderRadius:10, padding:'12px 16px', marginBottom:14, display:'flex', alignItems:'center', gap:12, flexWrap:'wrap' }}>
        <span style={{ fontSize:13, fontWeight:600, color:'var(--text)' }}>Filter by Branch:</span>
        <select value={branchFilter} onChange={e => setBranchFilter(e.target.value)} style={{ fontSize:13, border:'1px solid var(--border)', borderRadius:8, padding:'6px 12px', background:'var(--bg)', color:'var(--text)', outline:'none' }}>
          <option value="All">All Branches</option>
          {BRANCHES.map(b => <option key={b} value={b}>{b}</option>)}
        </select>

        <div style={{ display:'flex', alignItems:'center', gap:6, flex:1, minWidth:180, maxWidth:320, border:'1px solid var(--border)', borderRadius:8, padding:'6px 10px', background:'var(--bg)' }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--muted)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
          </svg>
          <input
            type="text"
            placeholder="Search name…"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            style={{ border:'none', outline:'none', background:'transparent', fontSize:13, color:'var(--text)', flex:1, minWidth:0 }}
          />
          {searchQuery && (
            <button onClick={() => setSearchQuery('')} style={{ background:'none', border:'none', cursor:'pointer', color:'var(--muted)', fontSize:16, lineHeight:1, padding:0 }}>×</button>
          )}
        </div>

        {total > 0 && (
          <span style={{ fontSize:13, color:'var(--muted)', fontWeight:500 }}>
            Showing {pageStart + 1}-{pageEnd} of {total}
          </span>
        )}
      </div>

      {/* Table */}
      {isLoading ? (
        <div style={{ textAlign:'center', padding:48, color:'var(--muted)', fontSize:14 }}>Loading coaches & BMs…</div>
      ) : (
        <div style={{ background:'var(--panel)', border:'1px solid var(--border)', borderRadius:12, overflow:'hidden' }}>
          <div style={{ overflowX:'auto' }}>
            <table style={{ minWidth:'100%', borderCollapse:'collapse' }}>
              <thead>
                <tr style={{ background:'var(--bg)', borderBottom:'1px solid var(--border)' }}>
                  {['No.','Name','Gender','Branch','Start Date','Contract Period','Programs','No. of Lessons','No. of Students'].map(h => (
                    <th key={h} style={th}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {records.length === 0 ? (
                  <tr><td colSpan={9} style={{ ...td, textAlign:'center', padding:'48px 16px', color:'var(--muted)' }}>
                    <div style={{ display:'flex', flexDirection:'column', alignItems:'center', gap:8 }}>
                      <span style={{ fontSize:36 }}>🎯</span>
                      <p style={{ fontWeight:600, color:'var(--text)', margin:0 }}>
                        {searchQuery || branchFilter !== 'All' ? 'No coaches or BMs match your filters' : 'No active coaches or BMs'}
                      </p>
                    </div>
                  </td></tr>
                ) : records.map((r, idx) => (
                  <tr key={r.id} style={{ borderTop:'1px solid var(--border)' }}>
                    <td style={{ ...td, color:'var(--muted)' }}>{pageStart + idx + 1}</td>
                    <td style={td}>
                      <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                        <span style={{ fontWeight:600, color:'var(--text)', whiteSpace:'nowrap' }}>{r.name}</span>
                        <span style={{ fontSize:10, padding:'2px 7px', borderRadius:99, fontWeight:600, background:r.status==='Active'?'rgba(34,197,94,0.15)':'rgba(239,68,68,0.12)', color:r.status==='Active'?'#16a34a':'#dc2626' }}>{r.status}</span>
                      </div>
                    </td>
                    <td style={{ ...td, color:'var(--muted)', whiteSpace:'nowrap' }}>{r.gender || '—'}</td>
                    <td style={td}><span style={{ fontSize:11, padding:'2px 8px', borderRadius:6, fontWeight:600, background:'rgba(99,102,241,0.1)', color:'#6366f1' }}>{r.branch || '—'}</span></td>
                    <td style={{ ...td, color:'var(--muted)', whiteSpace:'nowrap' }}>{fmtStartDate(r.start_date)}</td>
                    <td style={{ ...td, color: r.contract ? 'var(--text)' : 'var(--muted)' }}>{r.contract || '—'}</td>
                    {/* Programs column — checkboxes added in Task 8 */}
                    <td style={td}>—</td>
                    <td style={{ ...td, color:'var(--muted)' }}>—</td>
                    <td style={{ ...td, color:'var(--muted)' }}>—</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {totalPages > 1 && (
            <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'12px 16px', borderTop:'1px solid var(--border)', flexWrap:'wrap', gap:12 }}>
              <span style={{ fontSize:12, color:'var(--muted)' }}>Page {page} of {totalPages} · {total} records</span>
              <div style={{ display:'flex', gap:6, flexWrap:'wrap' }}>
                <button onClick={() => setPage(1)} disabled={page === 1} style={{ fontSize:12, padding:'5px 10px', borderRadius:6, border:'1px solid var(--border)', background:'var(--panel)', color:'var(--text)', cursor:page===1?'not-allowed':'pointer', opacity:page===1?0.4:1, fontWeight:500 }}>« First</button>
                <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1} style={{ fontSize:12, padding:'5px 10px', borderRadius:6, border:'1px solid var(--border)', background:'var(--panel)', color:'var(--text)', cursor:page===1?'not-allowed':'pointer', opacity:page===1?0.4:1, fontWeight:500 }}>‹ Prev</button>
                <span style={{ fontSize:12, padding:'5px 10px', color:'var(--text)', fontWeight:600 }}>{page}</span>
                <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages} style={{ fontSize:12, padding:'5px 10px', borderRadius:6, border:'1px solid var(--border)', background:'var(--panel)', color:'var(--text)', cursor:page===totalPages?'not-allowed':'pointer', opacity:page===totalPages?0.4:1, fontWeight:500 }}>Next ›</button>
                <button onClick={() => setPage(totalPages)} disabled={page === totalPages} style={{ fontSize:12, padding:'5px 10px', borderRadius:6, border:'1px solid var(--border)', background:'var(--panel)', color:'var(--text)', cursor:page===totalPages?'not-allowed':'pointer', opacity:page===totalPages?0.4:1, fontWeight:500 }}>Last »</button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Register the route in `App.tsx`**

In `frontend/src/App.tsx`, add the import line near the other page imports (alphabetically, around line 47-50 where the Student* imports live):

```tsx
import { CoachBmPerformancePage } from './pages/CoachBmPerformancePage';
```

Then add the route inside the `<Routes>` block, immediately after the `/student-attendance` route (around line 222-224):

```tsx
<Route path="/coach-bm-performance" element={
  <RequirePermission dashboard="student_db"><CoachBmPerformancePage /></RequirePermission>
} />
```

- [ ] **Step 3: Add the link to the Student Database card on the home page**

In `frontend/src/pages/DashboardHomePage.tsx`, find the `student_db` card definition (around lines 152-162) and add a 4th link:

```tsx
{
  id: 'student_db',
  name: 'Student Database',
  icon: '📚',
  color: '#7c3aed',
  links: [
    { label: 'Student Records', path: '/student-database', dashboard: 'student_db' },
    { label: '🗂 Archived Students', path: '/archived-students', dashboard: 'student_db' },
    { label: '📋 Student Attendance', path: '/student-attendance', dashboard: 'student_db' },
    { label: '🎯 Coach & BM Performance', path: '/coach-bm-performance', dashboard: 'student_db' },
  ]
},
```

- [ ] **Step 4: Verify the page renders end-to-end**

Run frontend (in addition to the already-running backend):

```bash
cd frontend && npm run dev
```

In the browser:
1. Log in as super_admin (or any user with `student_db` access).
2. On the home page, find the **Student Database** card — confirm the new "🎯 Coach & BM Performance" button is the 4th link.
3. Click it. Verify:
   - URL becomes `/coach-bm-performance`.
   - Header shows "🎯 Coach & BM Performance" + "N total coaches & BMs".
   - Branch dropdown is populated with branches from `BRANCHES`.
   - Table renders with the 9 columns. Programs column shows `—` (placeholder).
   - "No. of Lessons" and "No. of Students" columns show `—` for every row.
   - Branch filter and search box both narrow the result set.
   - Pagination works if there are more than 50 rows.
4. Log in as an academy-only user (or any user without `student_db`). The card link must not appear, and direct navigation to `/coach-bm-performance` must redirect to `/`.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/pages/CoachBmPerformancePage.tsx frontend/src/App.tsx frontend/src/pages/DashboardHomePage.tsx
git commit -m "feat(coach-perf): add page skeleton and home-card link"
```

---

## Task 7: Add the three top stat cards

**Files:**
- Modify: `frontend/src/pages/CoachBmPerformancePage.tsx`

The cards count program enrollment within the current branch filter. They share their counts with the Programs column added in Task 8 — counts are derived from `records` directly so no extra API call is needed. **Caveat:** because the API paginates, the cards reflect the *current page only* until we add an aggregate count (deferred — same trade-off the spec accepted). To make the cards reflect the full filtered set, we'll add a separate lightweight stats endpoint in Task 9.

For now this task adds the cards and uses page-local counts; Task 9 swaps in a real total.

- [ ] **Step 1: Add the `statCard` helper and stat row**

In `CoachBmPerformancePage.tsx`, add this helper near the top of the component, after the existing `useQuery` block:

```tsx
const statCard = (label: string, val: number | string, sub: string, color: string, icon: string) => (
  <div style={{ background:'var(--panel)', border:'1px solid var(--border)', borderRadius:12, padding:'16px 20px', display:'flex', alignItems:'center', justifyContent:'space-between', boxShadow:'var(--shadow-sm)' }}>
    <div>
      <p style={{ fontSize:11, fontWeight:700, color:'var(--muted)', textTransform:'uppercase', letterSpacing:0.5, margin:'0 0 4px' }}>{label}</p>
      <p style={{ fontSize:24, fontWeight:800, color, margin:0 }}>{val}<span style={{ fontSize:14, fontWeight:500, color:'var(--muted)' }}>{sub}</span></p>
    </div>
    <div style={{ width:40, height:40, borderRadius:'50%', background:`${color}18`, display:'flex', alignItems:'center', justifyContent:'center', fontSize:20 }}>{icon}</div>
  </div>
);

const wtCount   = records.filter(r => r.weekly_training).length;
const atclCount = records.filter(r => r.atcl_diploma).length;
const tmCount   = records.filter(r => r.toastmasters).length;
```

Then replace the comment placeholder `{/* Stat cards placeholder — filled in Task 7 */}` with:

```tsx
<div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit, minmax(200px, 1fr))', gap:12, marginBottom:16 }}>
  {statCard('Weekly Training', wtCount,   `/${records.length}`, '#4f46e5', '🏋️')}
  {statCard('ATCL Diploma',    atclCount, `/${records.length}`, '#8b5cf6', '🎓')}
  {statCard('Toastmasters',    tmCount,   `/${records.length}`, '#10b981', '🎤')}
</div>
```

- [ ] **Step 2: Verify the cards render**

Reload `/coach-bm-performance`. Confirm:
- Three cards appear above the filters bar.
- Values are `0/<page count>` everywhere (no enrollment ticks yet).
- Card colors match: indigo / purple / green.
- The cards size responsively when the window is narrowed (auto-fit grid).

- [ ] **Step 3: Commit**

```bash
git add frontend/src/pages/CoachBmPerformancePage.tsx
git commit -m "feat(coach-perf): add Weekly Training/ATCL/Toastmasters stat cards"
```

---

## Task 8: Add the Programs checkbox column with optimistic toggle

**Files:**
- Modify: `frontend/src/pages/CoachBmPerformancePage.tsx`

- [ ] **Step 1: Add the toggle mutation**

At the top of the component, add to the existing imports:

```tsx
import { useMutation, useQueryClient } from '@tanstack/react-query';
```

Inside the component (after the `useQuery` block) add:

```tsx
const queryClient = useQueryClient();

const toggleMutation = useMutation({
  mutationFn: ({ id, program, enrolled }: { id: number; program: 'weekly_training' | 'atcl_diploma' | 'toastmasters'; enrolled: boolean }) =>
    apiFetch(`/api/coach-bm-performance/${id}/program`, {
      method: 'PUT',
      body: { program, enrolled },
    }),
  onMutate: async ({ id, program, enrolled }) => {
    // Optimistic update: flip the row in the cached list immediately.
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
  },
});
```

- [ ] **Step 2: Replace the Programs column placeholder with checkboxes**

Find the row in the table body that currently reads:

```tsx
{/* Programs column — checkboxes added in Task 8 */}
<td style={td}>—</td>
```

Replace with:

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

- [ ] **Step 3: Verify the toggles work end-to-end**

Reload `/coach-bm-performance`. Test:
1. Pick any coach row. Click the "Weekly Training" checkbox. The label should switch to indigo + bold immediately (optimistic), then the network request fires.
2. Open devtools Network — confirm `PUT /api/coach-bm-performance/<id>/program` returns 200.
3. The Weekly Training stat card at the top should increment.
4. Refresh the page (full reload). The tick should still be there.
5. Toggle ATCL on the same row, then Toastmasters. All three should be saveable independently. Ticks for one program should not affect the others.
6. Toggle a checkbox off. The card count should decrement; refresh should confirm persistence.
7. Force an error to verify rollback: in devtools, block the PUT request (e.g. devtools → Network → throttle to "Offline"), click a checkbox. The optimistic state should revert after the request fails.
8. Pagination + ticks: tick a program on page 1, navigate to page 2, then back to page 1. The tick should still be there (data is refetched and merged).

- [ ] **Step 4: Commit**

```bash
git add frontend/src/pages/CoachBmPerformancePage.tsx
git commit -m "feat(coach-perf): tickable Programs column with optimistic toggle"
```

---

## Task 9: Replace page-local stat counts with a global stats endpoint

**Files:**
- Modify: `backend/src/routes/coachBmPerformance.js`
- Modify: `frontend/src/pages/CoachBmPerformancePage.tsx`

The cards in Task 7 only count enrollment within the current page of 50 rows. With ~40 active coaches+BMs that's fine today, but if the count grows past one page the cards become misleading. This task adds a lightweight stats endpoint that returns enrollment totals across the full filtered set, then wires the cards to it.

- [ ] **Step 1: Add the stats handler to the router**

In `backend/src/routes/coachBmPerformance.js`, add this handler **before** the `module.exports` line:

```js
// GET /api/coach-bm-performance/stats?branch=...
//
// Returns enrollment totals across all active coaches/BMs matching the
// branch filter (search is intentionally ignored — the cards mirror the
// branch filter only, same convention as Student Database's FA cards).
router.get('/stats', async (req, res, next) => {
  try {
    const { branch = '' } = req.query;
    const conditions = [
      `(bs."role" ILIKE '%coach%' OR bs."role" = 'BM')`,
      `bs."status" = 'Active'`,
    ];
    const params = [];
    if (branch) {
      conditions.push(`bs."branch" = $1`);
      params.push(branch);
    }

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
    return res.json(rows[0]);
  } catch (err) { return next(err); }
});
```

**Important:** this handler must be registered **before** the `:branchStaffId/program` route — Express matches `/stats` against the `:branchStaffId` parameter otherwise. If you put `/stats` after the PUT route, it still works because the methods differ (GET vs PUT), but if a future task adds a GET on `:branchStaffId/...`, ordering matters. Keep `/stats` near the top.

Smoke-test it:

```bash
curl -s "$API/api/coach-bm-performance/stats" -H "Authorization: Bearer $TOKEN" | jq
# Expected: { "total": 42, "weekly_training": 1, "atcl_diploma": 0, "toastmasters": 1 }

curl -s "$API/api/coach-bm-performance/stats?branch=ONL" -H "Authorization: Bearer $TOKEN" | jq
# Expected: scoped totals for ONL branch
```

- [ ] **Step 2: Wire the stats query in the page**

In `CoachBmPerformancePage.tsx`, just below the existing `useQuery` for the list, add a second query:

```tsx
const { data: stats } = useQuery({
  queryKey: ['coachBmPerformanceStats', branchFilter],
  queryFn: () => apiFetch(`/api/coach-bm-performance/stats${branchFilter !== 'All' ? `?branch=${encodeURIComponent(branchFilter)}` : ''}`),
  staleTime: 2 * 60 * 1000,
});
```

Replace the existing page-local count lines:

```tsx
const wtCount   = records.filter(r => r.weekly_training).length;
const atclCount = records.filter(r => r.atcl_diploma).length;
const tmCount   = records.filter(r => r.toastmasters).length;
```

with:

```tsx
const wtCount   = stats?.weekly_training ?? 0;
const atclCount = stats?.atcl_diploma    ?? 0;
const tmCount   = stats?.toastmasters    ?? 0;
const statsTotal = stats?.total ?? 0;
```

Then update the three `statCard` calls to use `statsTotal` for the `/N` denominator:

```tsx
{statCard('Weekly Training', wtCount,   `/${statsTotal}`, '#4f46e5', '🏋️')}
{statCard('ATCL Diploma',    atclCount, `/${statsTotal}`, '#8b5cf6', '🎓')}
{statCard('Toastmasters',    tmCount,   `/${statsTotal}`, '#10b981', '🎤')}
```

Finally, update the `toggleMutation`'s `onSettled` to also invalidate the stats query so cards update when a tick toggles:

```tsx
onSettled: () => {
  queryClient.invalidateQueries({ queryKey: ['coachBmPerformance'] });
  queryClient.invalidateQueries({ queryKey: ['coachBmPerformanceStats'] });
},
```

- [ ] **Step 3: Verify cards now reflect the full filtered set**

Reload `/coach-bm-performance`. Confirm:
- The `/N` denominator on each card matches `total coaches & BMs` shown under the page title.
- Toggling a program on a row in any branch updates the matching card immediately.
- Switching the branch filter changes both the table data and the card totals.
- Search query does **not** change the card counts (cards mirror branch filter only).

- [ ] **Step 4: Commit**

```bash
git add backend/src/routes/coachBmPerformance.js frontend/src/pages/CoachBmPerformancePage.tsx
git commit -m "feat(coach-perf): add /stats endpoint for full-set card counts"
```

---

## Task 10: Final verification and staging deployment

This task adds no new code. It catches anything the earlier per-task verifications may have missed and walks the change through staging before it goes to master.

- [ ] **Step 1: Full local end-to-end pass**

With both servers running:

1. Log in as super_admin. Visit `/coach-bm-performance`.
2. Confirm: header, 3 stat cards, filter bar, table with 9 columns, pagination — all render.
3. Toggle 2-3 programs across different rows and different branches. Refresh after each set of toggles to verify persistence.
4. Open `/student-database` and `/archived-students` — confirm the existing pages still work and look unchanged (no regression from `permissions.js` refactor in Task 2).
5. Open the **Student Database** card on the home page — confirm "🎯 Coach & BM Performance" appears as the 4th link and clicks through correctly.
6. Open `/api/permissions` in the Network tab — confirm response shape matches the pre-refactor shape.
7. Log out. Log in as an academy-only user. The Student Database card should be hidden (academy doesn't have `student_db` by default). Direct nav to `/coach-bm-performance` must redirect to `/`.
8. Try a direct API hit with the academy user's token: `curl -i "$API/api/coach-bm-performance" -H "Authorization: Bearer $ACADEMY_TOKEN"` → expect `403 Forbidden`.

- [ ] **Step 2: Push the branch and wait for staging deploy**

Assuming you've been working on a feature branch (let the runner pick the name):

```bash
git push -u origin <feature-branch>
git checkout staging
git pull --ff-only
git merge --no-ff <feature-branch>
git push origin staging
```

Wait for the auto-deploy to finish (watch the deploy log / GitHub Actions), then visit https://staging-dashboard.ebright.my and repeat the Step 1 checklist there. Pay special attention to:
- Migration ran cleanly on staging DB (check the API doesn't 500 on the first GET).
- The new home-card link is visible to the right roles.
- Toggling a program persists across a refresh.

- [ ] **Step 3: Promote to master only after staging looks good**

Once staging is verified, **ask the user before merging to master.** Default behaviour is: don't push to master without explicit approval (per the deploy memory). When approved:

```bash
git checkout master
git pull --ff-only
git merge --no-ff <feature-branch>
git push origin master
```

The migration `016_create_coach_program_enrollment.sql` must also be applied to the production DB before — or as part of — the master deploy. Coordinate with the deploy runbook (the runbook step depends on infra; if you don't know it, ask before pushing master).

---

## Self-review notes

- Spec coverage: every section of the spec maps to a task. §Placement → Task 6. §Page layout & filters → Task 6. §Stat cards → Task 7 + 9. §Table columns → Task 6 (cols 1–6, 8–9) + Task 8 (col 7). §Backend table → Task 1. §Backend middleware → Tasks 2 + 3. §Backend endpoints → Tasks 4 + 5 + 9. §Permissions wiring → Tasks 3 + 6.
- Open question 1 (`requireDashboard` vs. `requireRole`) resolved in plan: chose `requireDashboard` per spec recommendation.
- Open question 2 (`branch_staff_id` durability) noted in migration comment.
- Open question 3 (status filter) implicit: hard-coded `Active` in WHERE clause, no UI toggle. Easy to revisit later.
- Open question 4 (sort order) implicit: `ORDER BY name ASC` in GET endpoint, no UI toggle.
- Type consistency: `CoachRow` type used in page matches the API response shape returned by `coachBmPerformance.js` GET.
- Card stats trade-off (Task 7 → Task 9): page-local counts ship first, then the proper aggregate endpoint. This was deliberate to keep each task small and independently demoable; if you'd rather skip Task 7's intermediate step, you can fold it into Task 9 — the only loss is one extra commit boundary.
