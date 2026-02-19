# Copilot Instructions for Unified Internal Dashboard

## Project Architecture

This is a **client-server dashboard** built with React (frontend) + Express (backend) + PostgreSQL.

```
frontend (React + Vite)  ←→  backend (Express)  ←→  PostgreSQL
       ↓                              ↓
localStorage (JWT token)      roles-based routes (RBAC)
```

### Key Design Principles
- **Backend is the source of truth**: All auth, validation, and authorization happens server-side
- **Role-based access control (RBAC)**: Routes enforce roles (`executive`, `marketing`, `sales`) via `requireRole()` middleware
- **Stateless JWT auth**: Frontend stores token in localStorage, passes as `Bearer token` in Authorization header
- **Placeholder data routes**: Marketing and leads endpoints mirror Streamlit/PowerBI logic using time-windowed SQL aggregations

## Critical Workflows

### Backend Development (`backend/`)
```bash
npm run dev          # Start Express server on port 4000 with nodemon hot-reload
npm run create-user  # CLI tool to seed users: --email, --password, --role, --name
```

**Configuration**: Copy `.env.example` to `.env`. Requires:
- `DATABASE_URL` (PostgreSQL connection string)
- `JWT_SECRET` (≥32 chars, used for token signing)
- `CORS_ORIGIN` (usually `http://localhost:5173` for dev)

### Frontend Development (`frontend/`)
```bash
npm run dev          # Start Vite dev server on port 5173
npm run build        # Production build
npm run lint         # ESLint check
```

**Configuration**: Optional `.env` for `VITE_API_BASE_URL` (defaults to `http://localhost:4000`).

### Database
Run [backend/sql/001_create_users.sql](backend/sql/001_create_users.sql) once to create the `users` table. Data queries reference `meta_spend` (marketing) and `master_leads_powerbi` (leads) tables—these must exist for routes to work.

## Authentication Flow

1. **Login** (`POST /api/auth/login`)
   - Frontend: [LoginPage.jsx](frontend/src/pages/LoginPage.jsx) sends email + password
   - Backend: [routes/auth.js](backend/src/routes/auth.js) hashes password with bcryptjs, compares, issues JWT
   - Frontend: Stores token via [lib/auth.js](frontend/src/lib/auth.js) (`setToken()`) → localStorage

2. **Protected Routes**
   - All frontend routes except `/login` wrapped in [RequireAuth.jsx](frontend/src/components/RequireAuth.jsx)
   - Checks localStorage for token; redirects to login if missing
   - Backend routes use `requireAuth` middleware to verify Bearer token, then `requireRole()` to check permission

3. **API Calls** via [lib/api.js](frontend/src/lib/api.js)
   - `apiFetch()` automatically injects Bearer token and handles JSON parsing
   - Throws errors with `status` and `data` properties for caller to handle

## Route Structure & RBAC

### Backend Routes ([src/routes/](backend/src/routes/))

| Route | Method | Auth | Role | Purpose |
|-------|--------|------|------|---------|
| `/health` | GET | — | — | Health check |
| `/api/auth/login` | POST | — | — | Login, returns JWT |
| `/api/auth/me` | GET | ✓ | — | Get current user from token payload |
| `/api/marketing/performance` | GET | ✓ | executive, marketing | 4 channels (fb_group, tiktok, sara, online), 4 time windows (today, yesterday, 7d, 30d) with CPL/CPC calculations |
| `/api/leads/breakdown` | GET | ✓ | executive, sales, marketing | 3 tables: summary by lead_source, regions breakdown, branch dropdowns; region mapping logic for "Online" / nulls |

### Frontend Routes ([src/App.jsx](frontend/src/App.jsx))
- `/login` — Public login page
- `/` (index) — [ExecutiveSummaryPage.jsx](frontend/src/pages/ExecutiveSummaryPage.jsx) (executive summary shell)
- `/marketing-performance` — [MarketingPerformancePage.jsx](frontend/src/pages/MarketingPerformancePage.jsx)
- `/branch-distribution` — [LeadsBreakdownPage.jsx](frontend/src/pages/LeadsBreakdownPage.jsx)

## Data Patterns

### Marketing Route Logic
- Queries `meta_spend` table with hardcoded account IDs (MAIN_FB_ID, TT_ID, SARA_ID, ONLINE_ID)
- Uses SQL `FILTER` for time windows: `CURRENT_DATE`, `CURRENT_DATE - 1`, `INTERVAL '7 days'`, `INTERVAL '30 days'`
- Calculates CPL (cost per lead) = lead_spend / leads; CPC (cost per conversion) = conv_spend / conversions
- Returns per-channel stats object with `{ today, yesterday, 7d, 30d }` periods

### Leads Route Logic
- Queries `master_leads_powerbi` table
- **Region mapping** (hardcoded): If `clean_branch` contains "Online" → "Region 3"; if null/empty/unspecified → "Region 2"; else use `region` field
- **Blacklisted branches**: ["Bandra East", "Andheri West"] excluded from branch dropdown
- Returns 3 query results: summary (total by lead_source), regions breakdown, branch dropdowns
- All include count aggregations (today, yesterday, 7d, 30d)

## Code Conventions

### Backend
- **Error handling**: Zod validation errors return 400 with `{ error, details }`. Unhandled errors logged then return 500 with `{ error: "Internal server error" }`
- **Middleware pattern**: `requireAuth` → `requireRole()` chaining (see [middleware/auth.js](backend/src/middleware/auth.js))
- **JWT payload**: `{ sub, email, role, fullName, expiresIn }` (verified by `jwt.verify()` on each protected request)
- **DB queries**: Use parameterized queries (`$1`, `$2` placeholders) to prevent SQL injection

### Frontend
- **React Router v7**: Nested routes with `<Outlet />`, programmatic navigation via `useNavigate()`
- **Token storage**: localStorage key is `dashboard_token`; token is extracted as plain string, not JSON
- **API pattern**: `apiFetch(path, options)` wraps fetch, auto-injects token, throws with `error.status` and `error.data`
- **Styling**: CSS modules / inline classes (see [App.css](frontend/src/App.css))

## Common Task Templates

**Adding a new protected endpoint:**
1. Create route in [backend/src/routes/](backend/src/routes/), add `requireAuth`, `requireRole([roles])`
2. Import and mount in [app.js](backend/src/app.js) under appropriate path
3. Frontend: Call via `apiFetch('/api/path')` in a page or component; handle errors with `try/catch`

**Modifying region/branch logic:**
- Edit the `CASE` statement in the SQL within [routes/leads.js](backend/src/routes/leads.js)
- Also update the blacklisted branches array if needed

**Adding a new table column to response:**
- Add SQL `SELECT` field and aggregation
- Transform result in the `formatChannel()` or similar function
- Frontend component will receive the new field in the response object

## Environment & Dependencies

**Backend**: Express, PostgreSQL (`pg`), bcryptjs, JWT, Zod (validation), CORS, dotenv  
**Frontend**: React 19, React Router 7, React Query, Vite, ESLint

Both use CommonJS (backend) and ESM (frontend) module systems.
