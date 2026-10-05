# ARCHITECTURE.md (shared memory for every tool; change rarely)

## Product
Online-first legal practice management PWA for law firms in Bangladesh: cases, clients, hearings (with date history), tasks, physical file tracking, calendar and reminders, staff accounts with permissions, Bangla/English, subscription licensing with read-only mode on expiry.

## Decisions that override the old "offline-first" notes
The original idea file described local-only, offline-first storage. After discussion this was CHANGED:
- Cloud server (PostgreSQL) is the single source of truth.
- Browser (IndexedDB) is a READ-ONLY offline cache, never the only copy.
- Offline editing, Tauri, Android, SMS, Google Calendar, automated payments are POSTPONED.
- Do not reintroduce any of the postponed items unless PROGRESS.md says so.

## Stack
- Frontend: React + TypeScript + Vite, Tailwind, react-i18next (en, bn), PWA service worker.
- Backend: Node.js + TypeScript, REST under /api/v1, PostgreSQL, Drizzle or Prisma migrations.
- Hosting: one DigitalOcean Droplet (Singapore) running Docker Compose (api, postgres) behind Caddy. Cloudflare in front for DNS/CDN/protection. Off-site nightly dump to Backblaze B2 or Cloudflare R2.

## Rules for all code
1. Every table has: id (uuid), firm_id, created_at, updated_at, deleted_at, created_by, updated_by. Soft delete only.
2. Every create/update/delete writes to audit_log (who, what, when, old, new).
3. Frontend screens never touch storage or fetch directly. They call repositories in /src/data. Repositories have a mock implementation and a REST implementation.
4. Permissions are enforced on the SERVER and in repositories. UI hiding is only cosmetic. One helper: can(permission).
5. firm_id isolation: every query filters by the caller's firm_id. Never trust a firm_id sent by the client.
6. No hardcoded UI text. Everything goes through i18n.
7. Hearing dates are never overwritten: a date change adds a row to hearing_date_history.
8. Expired subscription = read-only. Data stays viewable and exportable.
9. No secrets in code or prompts. Use .env (git-ignored) and .env.example.
10. No real client data in any AI tool. Dummy data only.
11. Migrations must never drop data. Test on a copy first.

## Data model (core tables)
- firms(id, name, plan_id, license_expires_at, status)
- plans(id, name, duration_months, price_bdt, seats, features jsonb)
- payments(id, firm_id, amount, method, txn_id, paid_at, verified_by)
- users(id, firm_id, name, email, password_hash, role, permissions jsonb, language, active)
- clients(id, firm_id, name, phone, address, notes)
- cases(id, firm_id, client_id, file_serial, case_number, court, matter_type, description, plaintiff, defendant, our_role, plaintiff_lawyer, defendant_lawyer, status, restricted, next_hearing_at)
- hearings(id, firm_id, case_id, scheduled_at, status[scheduled|held|adjourned|cancelled], outcome_note)
- hearing_date_history(id, hearing_id, old_at, new_at, reason, changed_by, changed_at)
- tasks(id, firm_id, case_id?, client_id?, assigned_to, title, priority, due_at, status)
- physical_files(id, firm_id, serial "F-000123", case_id, client_id, status, holder_id, due_back_at)
- file_movements(id, file_id, action[out|in], user_id, at, note)
- reminders(id, firm_id, user_id, source_type, source_id, remind_at, channel, sent_at)
- audit_log(id, firm_id, user_id, entity, entity_id, action, old jsonb, new jsonb, at)
- backups_log(id, firm_id, kind, at, checksum)

## Permission keys
cases.view/create/edit/delete, hearings.update, clients.view/edit, tasks.view/assign/complete, files.view/manage, billing.view, settings.manage, users.manage, restricted.view, data.export.
Roles: Owner (all). Staff (configurable subset).

## Module connection map
Client -> Cases -> Hearings -> Calendar -> Reminders
Case -> Tasks, Physical Files
Task deadline -> Calendar, Reminders
File check-out -> Reminder to return
Everything -> Audit log, Global search, Dashboard
Subscription state -> read-only gate on every write

## Folder layout
/app (frontend: src/modules/<name>, src/data, src/locales, src/permissions.ts)
/server (api: src/modules/<name>, migrations, tests)
/docs (this file, PROGRESS.md, BUILD_GUIDE.md)
