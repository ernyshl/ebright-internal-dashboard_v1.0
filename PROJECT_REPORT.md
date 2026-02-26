# Ebright Internal Dashboard - Project Report

## 📋 Overview

**Project Name:** Ebright Internal Dashboard  
**Repository:** https://github.com/EbrightOD/ebright-internal-dashboard_v1.0  
**Live URL:** https://dashboard.ebright.my  
**Tech Stack:** React + Vite | Express.js | PostgreSQL | Docker

---

## 🏗️ Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     nginx (Reverse Proxy)                   │
│              Serves Frontend + Proxies API                  │
└─────────────────────────────────────────────────────────────┘
                              │
              ┌───────────────┴───────────────┐
              ▼                               ▼
┌─────────────────────────┐       ┌─────────────────────────┐
│    Frontend (React)     │       │   Backend (Express)     │
│    Port: 5173 (dev)     │       │   Port: 4000            │
│    Static files (prod)  │       │   PostgreSQL            │
└─────────────────────────┘       └─────────────────────────┘
                                              │
                                              ▼
                                   ┌─────────────────────────┐
                                   │  PostgreSQL Database    │
                                   │  (postgres_leads)       │
                                   └─────────────────────────┘
```

---

## ✅ Features Implemented

### 1. Authentication System
- JWT-based authentication with bcrypt password hashing
- Role-based access control (RBAC)
- Protected routes with middleware
- Token expiration (8 hours)
- Profile editing with password change

### 2. User Roles
| Role | Permissions |
|------|-------------|
| super_admin | Full access to all features |
| ceo | Marketing, Leads, Events |
| marketing | Marketing, Leads, Events |
| od | Leads, Events |
| rm | Leads |
| hr | Leads |
| academy | Events |
| finance | No leads access |

### 3. Dashboard Pages
- **Dashboard Home** (`/`) - Main landing page
- **Leads Centre** (`/leads-centre`) - Leads management with filters
- **Marketing Performance** (`/marketing-performance`) - Channel analytics
- **Branch Distribution** (`/branch-distribution`) - Regional breakdown
- **Event Entry** (`/event-entry`) - Event management (CRUD)
- **Event Dashboard** (`/events`) - Events listing
- **User Management** (`/users`) - Admin only
- **Permissions** (`/permissions`) - Admin only
- **Profile** (`/profile`) - User profile editing

### 4. API Endpoints
| Endpoint | Method | Auth | Description |
|----------|--------|------|-------------|
| `/api/auth/login` | POST | No | User login |
| `/api/auth/me` | GET | Yes | Current user |
| `/api/auth/profile` | GET/PUT | Yes | Profile management |
| `/api/marketing/performance` | GET | Yes | Marketing analytics |
| `/api/leads/breakdown` | GET | Yes | Leads breakdown |
| `/api/leads-centre` | GET | Yes | Leads with filters |
| `/api/events` | GET/POST | Yes | Events list/create |
| `/api/events/:id` | PUT/DELETE | Yes | Events update/delete |
| `/api/users` | GET/POST | Yes | User management |
| `/api/permissions` | GET | Yes | Permission details |

---

## 🔒 Security Implementations

### Recent Security Updates (Feb 2026)
1. **Rate Limiting**
   - Login attempts: 5 per 15 minutes → 30-minute lockout
   - API requests: 100 per 15 minutes
   - Role-based rate limiting for authenticated users

2. **Password Policies**
   - Minimum 8 characters
   - Must contain: uppercase, lowercase, number, special character
   - Password history tracking (last 5 passwords cannot be reused)
   - bcrypt hashing with cost factor 12

3. **JWT Enhancements**
   - Added issuer (`ebright-dashboard`) and audience (`ebright-users`) validation
   - Stronger token payload validation
   - Improved error messages

4. **CORS Configuration**
   - Strict origin checking in production
   - Only allows `https://dashboard.ebright.my`

---

## 🐛 Bug Fixes

### Login Issues Fixed
- **Hardcoded API URL**: Frontend was hardcoded to `http://103.209.156.174:4000` causing Mixed Content errors
- **Fix**: Set `VITE_API_BASE_URL=""` in nginx Dockerfile to use relative paths

### Permission Issues Fixed
- **Leads Centre visibility**: Hidden from academy and finance roles
- **Event delete authorization**: Now academy and marketing can delete any event

### UI Improvements
- **Event Entry title**: Matched styling with Leads Centre
- **Delete error handling**: Added user-friendly error alerts

---

## 📦 Database Schema

### Tables Created
- `users` - User accounts with roles
- `password_history` - Password reuse prevention
- `events` - Event management
- `meta_spend` - Marketing spend data
- `master_leads_powerbi` - Leads data

### Migrations
```
backend/sql/
├── 001_create_users.sql       - Users table
├── 002_create_permissions.sql - Permissions table
└── 003_create_password_history.sql - Password history
```

---

## 🚀 Deployment

### Docker Services
```yaml
services:
  backend:
    container: ebright-dashboard-backend
    port: 4000
    
  nginx:
    container: ebright-dashboard-nginx
    ports: 80, 443
```

### Deployment Commands
```bash
# Standard deployment
git add -A && git commit -m "message" && git push
ssh staff1@103.209.156.174 "cd /home/staff1/ebright-dashboard && git pull && docker compose restart"

# Frontend changes (rebuild required)
ssh staff1@103.209.156.174 "cd /home/staff1/ebright-dashboard && git pull && docker compose up -d --build nginx"

# Backend changes
ssh staff1@103.209.156.174 "cd /home/staff1/ebright-dashboard && git pull && docker compose up -d --build backend"

# Database migrations
ssh staff1@103.209.156.174 "PGPASSWORD=xxx psql -h 127.0.0.1 -p 5433 -U optidept -d ebrightleads_db -f /home/staff1/ebright-dashboard/backend/sql/xxx.sql"
```

---

## 📊 Recent Commits

| Commit | Description |
|--------|-------------|
| 16ebfc1 | Allow academy and marketing to edit/delete any event |
| b537ec7 | Fix Event Entry: add delete error alert, match title style |
| 55eec63 | Block Leads Centre access for academy and finance roles |
| 87b77cb | Also hide Leads Centre from finance role |
| ba8e33a | Hide Leads Centre from academy role |
| 8bc0add | Fix: Use UUID type for user_id in password_history |
| 8099b5b | Security: Strengthen authentication with rate limiting, password policies |
| 47dd855 | Cleanup: Remove debug logging and restore strict CORS |
| 99ca716 | Fix: Force empty VITE_API_BASE_URL in nginx build |

---

## 👥 Test Users

| Email | Role | Password |
|-------|------|----------|
| admin@ebright.com | super_admin | Admin@2024! |
| marketing@ebright.my | marketing | (set by admin) |
| academy@ebright.my | academy | (set by admin) |
| finance@company.com | finance | (set by admin) |
| od@ebright.my | od | (set by admin) |
| hr@ebright.my | hr | (set by admin) |
| rm@ebright.com | rm | (set by admin) |

---

## 📁 Project Structure

```
ebright-internal-dashboard/
├── backend/
│   ├── src/
│   │   ├── app.js           # Express app
│   │   ├── db.js            # Database connection
│   │   ├── env.js           # Environment config
│   │   ├── middleware/      # Auth middleware
│   │   └── routes/          # API routes
│   ├── sql/                 # SQL migrations
│   └── scripts/             # CLI tools
├── frontend/
│   ├── src/
│   │   ├── pages/           # Page components
│   │   ├── components/      # Reusable components
│   │   ├── lib/             # API, auth, permissions
│   │   └── layouts/         # Layout components
│   └── public/              # Static assets
├── nginx/
│   ├── Dockerfile           # Nginx + frontend build
│   └── nginx.conf          # Reverse proxy config
├── docker-compose.yml
└── README.md
```

---

## 📝 Status: ✅ Production Ready

- All features implemented and tested
- Security hardening complete
- Role-based access working
- Docker deployment configured
- Live at https://dashboard.ebright.my

---

*Last Updated: February 26, 2026*
