# Unified Internal Dashboard (React + Express + PostgreSQL)

This project scaffolds the **unified client-server dashboard** Gemini described:

- **Backend**: Node.js/Express (single source of truth) + PostgreSQL
- **Auth**: bcrypt password hashing + JWT
- **Frontend**: React (sidebar navigation + protected pages)

> Note: Your workspace was empty when we started, so the marketing/leads SQL is currently **placeholder** and needs your real queries pasted in.

## 1) Backend setup

### Configure environment variables

Copy `backend/.env.example` to `backend/.env` and fill in:

- `DATABASE_URL`
- `JWT_SECRET` (>= 32 chars)
- `CORS_ORIGIN` (default React dev server is `http://localhost:5173`)

### Create `users` table

Run:

- `backend/sql/001_create_users.sql`

This creates a `users` table with `password_hash` and a `role`.

### Create your first user (recommended)

From `backend/`:

```bash
npm run create-user -- --email you@company.com --password "ChangeMe123!" --role executive --name "Your Name"
```

Roles used by the placeholder RBAC:

- `executive`
- `marketing`
- `sales`

### Start the API

From `backend/`:

```bash
npm run dev
```

Health check:

- `GET /health`

Auth:

- `POST /api/auth/login`
- `GET /api/auth/me` (requires Bearer token)
- `GET /api/marketing/performance` (requires role: `executive` or `marketing`)
- `GET /api/leads/breakdown` (requires role: `executive`, `sales`, or `marketing`)

## 2) Frontend setup

Copy `frontend/.env.example` to `frontend/.env` if you want to override the API URL.

Start the UI from `frontend/`:

```bash
npm run dev
```

Open the Vite URL it prints (usually `http://localhost:5173`).

## 3) Plug in your real data queries

These routes are now implemented from your provided scripts:

- **Marketing**: `GET /api/marketing/performance`
  - Uses `meta_spend` and reproduces Streamlit’s CPL/CPC logic by account + time window.
- **Leads**: `GET /api/leads/breakdown`
  - Uses `master_leads_powerbi` and reproduces your `dashboard.js` region/branch logic.

If your DB schema/table names differ between environments, update the SQL in:

- `backend/src/routes/marketing.js`
- `backend/src/routes/leads.js`

