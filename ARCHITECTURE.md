# ARCHITECTURE.md (shared memory for every tool; change rarely)

## Product
Online-first legal practice management PWA for law firms in Bangladesh: cases, clients, hearings (with date history), tasks, physical file tracking, calendar and reminders, staff accounts with permissions, Bangla/English, subscription licensing with read-only mode on expiry.

## Decisions that override the old "offline-first" notes
The original idea file described local-only, offline-first storage. After discussion this was CHANGED:
- Cloud server (PostgreSQL) is the single source of truth.
- Browser (IndexedDB/localStorage in prototype) is a prototype/cache layer.
- Offline editing, Tauri, Android, SMS, Google Calendar, automated payments are POSTPONED.
- Do not reintroduce any of the postponed items unless PROGRESS.md says so.

## Stack
- Frontend: React + TypeScript + Vite, Tailwind CSS, react-i18next (en, bn), PWA service worker.
- Cryptography: Web Crypto API (SubtleCrypto) for SHA-256 checksums, PBKDF2 key derivation (600,000 iterations default with header iteration tracking; 100,000 legacy fallback), and AES-GCM 256-bit encryption.
- Backend: Node.js + TypeScript, REST under /api/v1, PostgreSQL, Drizzle or Prisma migrations.
- Hosting: one DigitalOcean Droplet (Singapore) running Docker Compose (api, postgres) behind Caddy. Cloudflare in front for DNS/CDN/protection. Off-site nightly dump to Backblaze B2 or Cloudflare R2.

## Rules for all code
1. Every record/table has: id (uuid), firm_id, created_at, updated_at, deleted_at (soft delete only, never hard delete), created_by, updated_by.
2. Every create/update/delete writes to audit_log (who, what, when, old, new). Audit rows are written ONLY by server code; the frontend never writes audit rows directly.
3. Frontend screens never touch storage or fetch directly. They call repositories in /src/data. Repositories have an in-memory/localStorage store for the prototype and a REST API implementation for production.
4. Permissions are enforced on the SERVER (via requirePermission / requireOwner middleware and route guards) and in repositories. UI hiding is only cosmetic. One central helper: can(permission).
5. firm_id isolation: every query filters by the caller's firm_id. Never trust a firm_id sent by the client. The server derives firm_id strictly from the verified session/JWT.
6. Authentication & session security: strictly via httpOnly secure cookie. No token is ever stored in localStorage or returned in response bodies.
7. License & Subscription management: status, planId, and license expiry can NEVER be altered by any firm user (including Owner) via API endpoints. License changes are admin-only via CLI script or dedicated admin tooling.
8. No hardcoded UI text. Everything goes through i18n (/src/locales/en.json and bn.json). Noto Sans Bengali font.
9. Hearing dates are never overwritten: a date change adds a row to hearing_date_history.
10. Expired subscription = read-only. Data stays viewable and exportable.
11. No secrets in code or prompts. Use .env (git-ignored) and .env.example. Fail fast on missing, short, or default secrets at startup.
12. No real client data in any AI tool. Dummy data only.
13. Migrations must never drop data. Test on a copy first. Keep one single schema source of truth.
14. Off-site nightly backup rule: automated PostgreSQL dump with SHA-256 integrity verification uploaded to off-site cloud storage (Backblaze B2 or Cloudflare R2).
15. Super Admin (Software Owner) Separation: Platform admins belong to table platform_admins with NO firm_id. Admin auth is cryptographically and logically isolated with its own ADMIN_JWT_SECRET, admin_access_token cookie, 15m expiration, login lockout, and adminAuthMiddleware. Firm tokens are rejected on admin routes and admin tokens are rejected on firm routes. Admin provisioning is CLI-only (createPlatformAdmin.ts, interactive prompt, min 14 chars, bcrypt). Every admin mutation is immutably logged to admin_audit.
16. Device Authorization (Web-App Level): A "device" in this system is an individual browser profile/installation identified by a cryptographically random 256-bit key stored in an httpOnly cookie (`device_key`), NOT physical hardware. The server stores only the SHA-256 hash in table `devices`. Clearing browser cookies or cache assigns a new random key and creates a new pending device registration. On login: if approved device count < `max_devices` and firm policy is "auto-approve", the browser is approved automatically; otherwise it transitions to `pending` and receives HTTP 403 `DEVICE_PENDING`. Suspending a firm or revoking a device terminates active sessions immediately on the very next HTTP request via server-side verification in `firmAuthMiddleware`. Firm owners have read-only visibility into authorized chamber devices, and may remove staff devices only when explicitly enabled by platform policy (`allow_owner_device_removal`).

## Data model (core entities / tables)
- firms(id, name, plan_id, license_expires_at, status, max_devices, device_policy, allow_owner_device_removal)
- plans(id, name, duration_months, price_bdt, seats, features jsonb)
- payments(id, firm_id, amount, method, txn_id, paid_at, verified_by)
- users(id, firm_id, name, email, password_hash, role, permissions jsonb, language, active)
- clients(id, firm_id, name, phone, address, notes)
- cases(id, firm_id, client_id, file_serial, case_number, court, matter_type, description, plaintiff, defendant, our_role, plaintiff_lawyer, defendant_lawyer, status, restricted, next_hearing_at)
- hearings(id, firm_id, case_id, scheduled_at, status, outcome_note)
- hearing_date_history(id, hearing_id, old_at, new_at, reason, changed_by, changed_at)
- tasks(id, firm_id, case_id, client_id, assigned_to, title, priority, due_at, status)
- physical_files(id, firm_id, serial, case_id, client_id, status, holder_id, due_back_at)
- file_movements(id, file_id, action, user_id, at, note)
- reminders(id, firm_id, user_id, source_type, source_id, remind_at, channel, sent_at)
- audit_log(id, firm_id, user_id, user_name, entity, entity_id, action, old_value jsonb, new_value jsonb, timestamp)
- backups_log(id, firm_id, kind, at, checksum)
- platform_admins(id, email, password_hash, totp_secret, active, failed_attempts, locked_until, created_at, updated_at) [Super Admin - NO firm_id]
- admin_audit(id, admin_id, action, target_firm_id, old, new, ip, at) [Super Admin actions audit trail]
- license_events(id, firm_id, type, old, new, by_admin, at) [Full license and firm lifecycle history]
- devices(id, firm_id, user_id, device_key_hash, name, user_agent, status, first_seen_at, last_seen_at, approved_by_admin_id) [Web-app level browser authorization]

## Permission keys
cases.view, cases.create, cases.edit, cases.delete, hearings.update, clients.view, clients.edit, tasks.view, tasks.assign, tasks.complete, files.view, files.manage, billing.view, settings.manage, users.manage, restricted.view, data.export.
Roles: Owner (all permissions). Staff (configurable subset).

## Module connection map
- Client -> Cases, Tasks, Physical Files (Client dossier displays live linked cases, tasks, and files)
- Case -> Hearings, Tasks, Physical Files, Reminders, Cause List (Case details unifies all matter records; case deletion soft-deletes hearings, dismisses reminders, and unlinks tasks/files)
- Hearing -> Date history, Case nextHearingAt synchronization, Reminders, Daily cause list docket (Adjournment reschedules reminders atomically)
- Physical File -> Custody check-out/check-in, movement logs, overdue alerts
- Task -> Assignee partitioning, overdue calculation, completion automatically clears linked reminders
- Calendar & Reminders -> Aggregates hearings, tasks, and file return deadlines into a unified chronological schedule
- Dashboard & Search -> Executive overview of metrics, urgent alerts, and global cross-entity search with strict confidentiality filtering
- Subscription state -> Enforces Rule 10 read-only gates on all write operations across all entities while preserving search, view, and backup exports; license renewal unblocks writes immediately
- Backup & Restore -> Exports full chamber database with SHA-256 integrity checksums and optional AES-GCM 256-bit encryption; supports clean replace and safe merge restores
- Everything -> Immutable audit trail logging with operator identity and before/after payloads

## Folder layout
- Frontend: `/src` (Firm application only; zero admin routes or code)
  - `/src/data` (repository interfaces, in-memory/localStorage stores, factory)
  - `/src/data/repositories/` (modular repositories: client, case, hearing, task, file, reminder, search, dashboard, backup, firm, user, audit, calendar, common)
  - `/src/data/repositories/rest/` (REST API implementations communicating with backend)
  - `/src/locales` (en.json, bn.json, i18n.ts)
  - `/src/permissions.ts` (permission keys, role defaults, can() checker, subscription evaluator)
  - `/src/modules/<name>/` (screens, components, types, README.md; includes DevicePendingScreen)
  - `/src/modules/health/tests/` (modular test suites per module, store snapshot preservation runner)
- Super Admin Frontend: `/admin-app` (Completely standalone Vite SPA; zero firm code imports)
  - `/admin-app/src/screens/` (Login, FirmList with pending counter, FirmDetail with Devices tab, CreateFirm, License, Payment, Audit)
  - `/admin-app/src/api/` (adminApi.ts communicating strictly with /api/admin)
  - `/admin-app/vercel.json` (Strict CSP headers and SPA rewrites)
- Backend: `/server`
  - `/server/src/routes/` (Express API route endpoints: auth, clients, cases, firms, audit, health, devices, adminAuth, adminFirms, adminDevices)
  - `/server/src/services/` (domain services: auth, security, deviceService, adminAuditService)
  - `/server/src/middleware/` (authMiddleware, adminAuthMiddleware, requirePermission, enforceFirmIsolation, rate limiting)
  - `/server/src/db/` (schema.ts, migrate.ts, client.ts, seed.ts)
  - `/server/src/scripts/` (admin CLI utilities, e.g. adminLicense.ts, createPlatformAdmin.ts)
  - `/server/tests/` (server automated test suites: foundation, clients, cases, postgres, adminAuth, adminFirms, devices)


