# Taif Children's Hospital Research Platform

## Overview

Bilingual (English + Arabic, RTL) full-stack web app for hospital research management. Built on a pnpm monorepo using TypeScript, React+Vite frontend, Express backend, and Supabase (PostgreSQL) as the database and auth provider.

## Stack

- **Monorepo**: pnpm workspaces
- **Node.js**: 24
- **Frontend**: React + Vite (artifacts/hospital-research)
- **Backend**: Express 5 (artifacts/api-server), esbuild bundle
- **Database/Auth**: Supabase (PostgreSQL + Auth)
- **API codegen**: Orval from OpenAPI spec
- **Validation**: Zod, drizzle-zod
- **UI**: Tailwind CSS, shadcn/ui, Lucide icons
- **i18n**: i18next (en + ar RTL)
- **Calendar**: FullCalendar

## Architecture

- API routes served at `/api/*` (port 8080 in dev)
- Frontend served at root `/` (port 18622 in dev)
- Shared reverse proxy at localhost:80 routes traffic
- OpenAPI spec: `lib/api-spec/openapi.yaml`
- Generated client: `lib/api-client-react/src/generated/api.ts`
- API base URL: no prefix (setBaseUrl(null)) — hooks already include `/api/` prefix

## Features

- Role-based auth: Admin, CEO, Director, Doctor, Nurse, Staff
- Landing page (configurable hero, sections, theme, logo, background)
- Dashboard with statistics
- User management (admin only)
- Document management (upload, list, delete) — **RBAC enforced** (see below)
- Articles/Blog (CRUD) — **RBAC enforced**
- Calendar events (FullCalendar) — **RBAC enforced**
- Admin settings: logo/background upload, theme colors, landing page sections
- Profile page
- Daily Attendance (clock-in/out, stats, CSV export, date range filter)
- Meeting Attendance Forms (admin creates time-windowed forms linked to calendar events; staff submit with auto-populated signature; sequential submission numbering; live countdown timer; admin remarks per submission)

## RBAC — Role-Based Access Control

Admin roles: `admin`, `ceo`, `director` (defined as `ADMIN_ROLES` in `auth.ts` middleware).

### Three-Layer Enforcement

**1. UI Layer** (hide mutation buttons for non-admins):
- Calendar: Create Event button, date-click, event card click, Edit/Delete in dialog all hidden for non-admins
- Articles: Create Article button, Edit/Delete dropdown hidden for non-admins
- Documents: Upload button, Delete menu item hidden; Download button shown only if user has explicit permission or is admin; Manage Access button (admin only)

**2. Application Logic Layer** (Express route guards):
- `POST/PATCH/DELETE /api/calendar/events` → `requireRole("admin","ceo","director")`
- `POST/PATCH/DELETE /api/articles` → `requireRole("admin","ceo","director")`
- `POST /api/documents/upload` → `requireRole("admin","ceo","director")`
- `DELETE /api/documents/:id` → `requireRole("admin","ceo","director")`
- `GET /api/documents` → enriches each doc with `can_download` flag; redacts `file_url` for unauthorized users

**3. Database Layer** (Supabase RLS — Section 21 of migration):
- Direct Supabase API inserts/updates/deletes on `calendar_events`, `articles`, `documents` restricted to admin roles via JWT `user_metadata.role` check

### Document Download Permissions
- Table: `document_download_permissions` (Section 20 of migration)
- Admins grant/revoke per-document, per-user download access via "Manage Access" dialog on DocumentsPage
- Non-admins without explicit permission see a locked download icon and no file URL in the API response
- Endpoints: `GET /documents/my-permissions`, `GET /documents/:id/download-permissions`, `POST /documents/:id/grant-download`, `DELETE /documents/:id/revoke-download/:userId`

## Database Setup (Required First-Time)

Tables do NOT exist in Supabase by default. Run `supabase-migration.sql` in the Supabase SQL Editor:
1. Go to https://supabase.com/dashboard
2. Select your project → SQL Editor
3. Paste contents of `supabase-migration.sql` and run it

Tables created: `profiles`, `landing_page_config`, `landing_page_sections`, `documents`, `articles`, `calendar_events`, `theme_settings`, `attendance`, `meeting_attendance_forms`, `meeting_attendance_submissions`, `document_download_permissions`

**Section 17** adds the `attendance` table (daily clock-in/out).
**Section 18** adds `meeting_attendance_forms` and `meeting_attendance_submissions` for the Meeting Attendance Form system.
**Section 20** adds `document_download_permissions` for per-user document download grants.
**Section 21** adds tighter RLS write policies on `calendar_events`, `articles`, and `documents` (restrict direct Supabase API writes to admin roles only).

## First Admin User

After running migrations, create an admin user in Supabase Dashboard:
- Authentication → Users → Invite user
- Then set their metadata: `{ "role": "admin" }`

Or via the API (once logged in as admin), use the Users page to create new users.

## Key Commands

- `pnpm run typecheck` — full typecheck across all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks from OpenAPI spec
- `pnpm --filter @workspace/api-server run dev` — run API server
- `pnpm --filter @workspace/hospital-research run dev` — run frontend

## Environment Variables

- `SUPABASE_URL` — Supabase project URL
- `SUPABASE_ANON_KEY` — Public anon key
- `SUPABASE_SERVICE_ROLE_KEY` — Service role key (backend only)
- `SESSION_SECRET` — Express session secret

## Key Files

- `supabase-migration.sql` — Full DB schema migration
- `artifacts/hospital-research/src/App.tsx` — Router
- `artifacts/hospital-research/src/contexts/AuthContext.tsx` — Auth state
- `artifacts/hospital-research/src/pages/` — All page components
- `artifacts/api-server/src/routes/` — All API routes
- `artifacts/api-server/src/lib/supabase.ts` — Supabase admin client
- `lib/api-spec/openapi.yaml` — API contract
