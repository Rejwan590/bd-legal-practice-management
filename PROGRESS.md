# PROGRESS.md (update at the end of EVERY session)

Rule: read ARCHITECTURE.md and this file before starting. Update this file before stopping. Never put secrets or real client data here.

## Current status
Clients, Cases, and Appointments modules completed and fully verified across server (REST API, PostgreSQL schema & migration 0005, memory DB) and frontend mock/data layers with 100% parity. Central visibility, permissions, subscription read-only enforcement, audit logging, firm isolation, and restricted confidentiality strictly preserved.
- [x] Clients module: profile photos (file/camera canvas resize, EXIF strip, magic byte validation, 300KB limit, private caching), client notes (migrated, 5000 chars, editable date, pagination, audit), redesigned profile layout (large avatar, tap-to-call, tap-to-mail, stacked mobile), and central client visibility.
- [x] Cases module: BD party structure (categories, dynamic roles, police station, sections of law, court suggestions, filing/disposal dates), case notes (dossier notes tab, pagination, audit), cases list table (pending filter, status counts, sort by case_date, formatted party title & latest note snippet).
- [x] Appointments module: table appointments & appointment_attendees, permissions appointments.view & appointments.manage, non-blocking overlap detection, reschedule audit logging, primary /appointments screen (filters, range tabs, search), schedule/reschedule modal with attendee picker, Today's Appointments dashboard section with 1-click completion/reschedule, client profile appointments tab, and 100% bilingual i18n parity.
- [x] All 381 server tests pass, frontend builds cleanly (`npm run build`), admin app builds cleanly (`npm run build --prefix admin-app`), and type checks pass cleanly (`npm run lint`).

## Case Dossier Hub, Client Profile Hub & URL Navigation (Frontend)
- **Dependency-Light URL Router (`src/modules/foundation/NavigationContext.tsx` & `vercel.json`)**:
  - Full URL routing (`pushState`, `replaceState`, `popstate`) supporting `/`, `/cases`, `/cases/:id/(overview|hearings|tasks|files|activity)`, `/clients`, `/clients/:id`, `/clients/:id/(tasks|files)`, `/calendar`, `/tasks`, `/files`, `/search`, `/hearings`, `/auditLog`, `/backup`, `/settings`, and `/health`.
  - Browser Back button and page refresh keep the exact screen, entity ID, and active tab. Added `vercel.json` SPA rewrite (`/(.*)` -> `/index.html`).
  - Central reactive refresh counter (`refreshVersion` + `triggerRefresh()`) synchronizes Case Dossier, Client Profile, Calendar, Dashboard, Reminders, Global Search, and Audit Log after any repository mutation.
- **Shared Navigation & Entity Linking (`src/components/EntityLink.tsx`, `src/components/Breadcrumbs.tsx`, `src/modules/foundation/AppShell.tsx`)**:
  - `EntityLink`: Unified link component used across Dashboard, Calendar, Cases, Clients, Hearings, Tasks, Files, Global Search, and Audit Log. Respects `restricted.view` and supports both page navigation and direct edit modal launching (`openEntityModalById`).
  - `Breadcrumbs`: Detail-page breadcrumb trail + Back button (`goBack`).
  - Context-aware `+` action button (`data-testid="context-plus-button"`): inside a case offers Add Hearing / Task / File prefilled & locked to `caseId` + `clientId`; inside a client profile offers Add Case / Task / File prefilled & locked to `clientId`; on Calendar offers Add Hearing / Task prefilled to `selectedCalendarDate`; elsewhere offers that screen's primary create action.
  - Mobile 5-item bottom navigation (`Dashboard`, `Cases`, `Calendar`, `Tasks`, `More` drawer), desktop sidebar, and global search reachable from every screen.
- **Case Dossier Working Hub (`src/modules/cases/CaseDetailsView.tsx`)**:
  - Single `Edit` action for the case in the header (removed the duplicate `Edit Details` button from inside the body).
  - 5 tabs (`Overview`, `Hearings`, `Tasks`, `Files`, `Activity`):
    - `Overview`: Case metadata, responsible lawyer & case sharing controls, linked Client card with `Open Profile` and inline `Change Client`, and quick summary metrics.
    - `Hearings`: Add hearing (`caseId` locked), Edit, Reschedule (`RescheduleHearingModal` preserving `hearing_date_history` + reason), Adjourn (`AdjournHearingModal`), Mark Held / Cancelled, inline Outcome Note editor, and Date History (`HearingDateHistoryModal`).
    - `Tasks`: Add task (`caseId` & `clientId` locked), Edit (`TaskFormModal`), Reassign (`TaskReassignModal`), Complete (`TaskCompleteModal`), and Reopen.
    - `Files`: Add file (`caseId` & `clientId` locked), Check Out (`FileCheckOutModal` creating a `file_return` reminder), Check In (`FileCheckInModal` clearing the reminder), Edit (`FileFormModal`), and Movement History (`FileHistoryModal`).
    - `Activity`: Case-scoped audit trail via `repos.auditLog.listByCaseId(context, caseId)` enforcing `cases.view`, central case visibility, and `restricted.view`.
- **Client Profile Working Hub (`src/modules/clients/ClientProfileView.tsx`)**:
  - Single header `Edit` and `Archive` actions with 3 tabs (`Cases`, `Tasks`, `Files`) and in-place Add/Edit/Reassign/Complete/Reopen/Checkout/Checkin actions prefilled & locked to `clientId`.
- **Verification Summary**:
  - `npm run lint`: PASS (0 errors)
  - `npm run build`: PASS
  - `npm run test:health`: PASS (87/87 passed, 0 failed — including 6 new Hub & Navigation chain checks)
  - `npm run test:responsive`: PASS (64/64 Playwright tests passed across 360px, 768px, and 1280px viewports covering all routes, Case Dossier tabs, Client Profile tabs, Dossier modals, deep links, refresh persistence, and Browser Back)
  - `npm test --prefix server`: PASS (381 assertions passed, 0 failed)
  - `npm run build --prefix admin-app`: PASS

## Team Hierarchy & Visibility (Firm Users)
- **Schema & Safe Migration (`0004_team_hierarchy_and_visibility.sql`)**:
  - `users`: added `job_type` (`'lawyer_senior' | 'lawyer_junior' | 'clerk' | 'receptionist' | 'intern' | 'other'`), `job_title_label` (nullable), and `reports_to_user_id` (nullable, same firm, must be a lawyer or Owner, no cycles, cannot be self). Existing `Owner` rows migrated to `'lawyer_senior'`; existing `Staff` rows migrated to `'other'` with `reports_to_user_id = NULL`.
  - `firms`: added `visibility_mode` (`'open' | 'team'`), defaulting to `'team'` for new firms while migrating existing firms to `'open'` so no currently visible data is hidden on upgrade.
  - `cases`: added `responsible_lawyer_id` (nullable, lawyer or Owner of the same firm).
  - `hearings`: added `appearing_lawyer_id` (nullable).
  - `case_shares`: created table (`id`, `firm_id`, `case_id`, `user_id`, `created_by`, `created_at`, `deleted_at`) for explicit per-case access sharing.
- **One Central Visibility Rule (`server/src/services/visibilityService.ts` & `src/data/caseVisibility.ts`)**:
  - A user can see a case if: (1) Owner; or (2) firm `visibility_mode` is `'open'`; or (3) they are `responsible_lawyer_id`; or (4) they report to the responsible lawyer; or (5) they are above the responsible lawyer in the supervisor chain; or (6) they created the case; or (7) the case is shared with them via `case_shares`. Restricted cases (`restricted = true`) additionally require `restricted.view`.
  - Enforced across all case and case-derived queries (list, direct lookup by ID returning 404, hearings, case-linked tasks, case-linked files, calendar, dashboard metrics/urgent items, global search, case linked counts, client overview, case audit entries, duplicate check, and backup export).
  - Automated route scanner test (`server/tests/teamVisibility.test.ts`) scans all non-admin route files to verify no case-derived query skips the user visibility context.
- **User Management & Role Presets (`server/src/routes/users.ts`, `src/rolePresets.ts`, `server/src/rolePresets.ts`)**:
  - Shared role presets (`Senior Lawyer`, `Junior Lawyer`, `Clerk`, `Receptionist`) populate default permissions and job types; permission and role changes take effect on the very next HTTP request via `firmAuthMiddleware` DB refresh.
  - `POST /api/v1/users`, `PATCH /api/v1/users/:id`, `PATCH /api/v1/users/:id/permissions`, `PATCH /api/v1/users/:id/role`, `POST /api/v1/users/:id/deactivate`, `POST /api/v1/users/:id/reactivate`, and `POST /api/v1/users/:id/reassign-team` implemented with firm scoping, Owner or `users.manage` guard, subscription read-only guard, Zod validation, and audit logging.
  - Enforces: last active Owner cannot be demoted or deactivated; users cannot change their own permissions; `reports_to_user_id` rejects cycles, self, non-lawyers, and other firms' users; unknown permission keys rejected; plan seat limit enforced; deactivation revokes active sessions/devices and warns on open cases/future hearings with optional reassignment.
- **Frontend UI & Bilingual i18n (`en.json` & `bn.json`)**:
  - Staff hierarchy tree view (`Owner > Lawyer > Team`), Add/Edit/Deactivate user modals, temporary team cover reassignment, and firm `visibility_mode` toggle with explanation in `SettingsScreen.tsx`.
  - Responsible lawyer picker/badge, `"my cases / my team / all"` scope filter, and `"Share with..."` / `"Remove access"` modal on `CasesScreen.tsx`, `CaseFormModal.tsx`, and `CaseDetailsView.tsx`.
  - Appearing lawyer picker on `HearingFormModal.tsx`.
- **Verification Summary**:
  - `npm run lint`: PASS (0 errors)
  - `npm run build`: PASS
  - `npm run test:health`: PASS (81/81 passed, 0 failed)
  - `npm test --prefix server`: PASS (381 assertions passed, 0 failed across `foundation`, `clients`, `cases`, `postgres` [live container skipped when `DATABASE_URL` unset], `adminAuth`, `adminFirms`, `devices`, and `teamVisibility`)
  - `npm run build --prefix admin-app`: PASS

## Reviewer Hardening
- **Batch 4 (Honest tests: R-16)**:
  - **R-16: Honest PostgreSQL Test Execution & CI Automation**:
    - `server/tests/postgres.test.ts`:
      - Replaced trivial dummy `assert(true)` fallback with honest execution handling.
      - When `DATABASE_URL` is missing locally, test logs a clear `[SKIPPED]` message and does not falsely claim live Postgres passed.
      - In CI (`process.env.CI === 'true'`), missing `DATABASE_URL` or an unreachable PostgreSQL container immediately triggers a hard failure (`assert(false, ...)`).
      - Added live container assertions testing migrations (0000-0003), schema verification, firm isolation, scoped lookups (R-07), device status changes, and transaction atomicity with rollback (R-10).
    - `.github/workflows/ci.yml`:
      - Created GitHub Actions CI workflow using a `postgres:16-alpine` service container with health checks (`pg_isready`).
      - Runs migrations and the full server test suite (`npm test --prefix server`) against real PostgreSQL 16.
      - Executes linter (`npm run lint`), health diagnostics (`npm run test:health`), restFetch tests, and builds for root app, server, and admin-app.
    - `PROGRESS.md`: Corrected historical claims; documented that local test runs skip live queries with a clean SKIPPED message, and clarified which assertions run against in-memory vs real PostgreSQL.
- **Batch 3 (Database layer: R-07, R-10)**:
  - **R-10: Wrap Multi-Step Writes in Atomic Database Transactions**:
    - `server/src/db/client.ts`: Added `transaction<T>(callback: (txDb: IDatabase) => Promise<T>): Promise<T>` to `IDatabase`.
      - In `MemoryDatabase`: Takes shallow snapshots of all database table arrays before invoking callback; automatically rolls back all tables upon any caught error.
      - In `PostgresDatabase`: Connects a dedicated client from `this.pool`, executes `BEGIN`, instantiates a transaction-scoped Drizzle/Postgres adapter, and commits or rolls back (`COMMIT` / `ROLLBACK`) with guaranteed `client.release()` in a `finally` block.
    - Wrapped all identified multi-step database writes in `db.transaction`:
      1. `POST /api/admin/firms`: Firm insert -> First Owner user insert -> AdminAudit insert -> LicenseEvent insert (`server/src/routes/adminFirms.ts`).
      2. `POST /api/admin/firms/:id/suspend`: Firm status update -> AdminAudit insert -> LicenseEvent insert (`server/src/routes/adminFirms.ts`).
      3. `POST /api/admin/firms/:id/disable`: Firm status update -> AdminAudit insert -> LicenseEvent insert (`server/src/routes/adminFirms.ts`).
      4. `POST /api/admin/firms/:id/reactivate`: Firm status update -> AdminAudit insert -> LicenseEvent insert (`server/src/routes/adminFirms.ts`).
      5. `DELETE /api/admin/firms/:id`: Soft delete firm -> AdminAudit insert -> LicenseEvent insert (`server/src/routes/adminFirms.ts`).
      6. `PUT /api/admin/firms/:id/license`: Firm license update -> AdminAudit insert -> LicenseEvent insert (`server/src/routes/adminFirms.ts`).
      7. `POST /api/admin/firms/:id/renew`: Firm license renew -> AdminAudit insert -> LicenseEvent insert (`server/src/routes/adminFirms.ts`).
      8. `POST /api/admin/firms/:id/payments`: Payment insert -> AdminAudit insert (`server/src/routes/adminFirms.ts`).
      9. `POST /api/admin/devices/:id/approve`: Device update -> AdminAudit insert (`server/src/routes/adminDevices.ts`).
      10. `POST /api/admin/devices/:id/reject`: Device update -> AdminAudit insert (`server/src/routes/adminDevices.ts`).
      11. `POST /api/admin/devices/:id/revoke`: Device update -> AdminAudit insert (`server/src/routes/adminDevices.ts`).
    - Automated tests: `server/tests/adminFirms.test.ts` asserts that a simulated failure halfway through a multi-step write triggers transaction rollback and leaves 0 partial/orphan rows in the database (`abortedFirmInDb === null`). Total server tests: 349 passed (0 failed).
  - **R-07: Scoped DB Adapter Lookups and Updates (WHERE id = ? AND firm_id = ?)**:
    - `server/src/db/client.ts`: Updated `IDatabase`, `MemoryDatabase`, and `PostgresDatabase` adapters for firm-owned tables (`clients`, `cases`). Methods `getClientById(id, firmId)`, `updateClient(id, firmId, updates)`, `countActiveCasesForClient(clientId, firmId)`, `getCaseById(id, firmId)`, and `updateCase(id, firmId, updates)` strictly require `firmId` and filter by `WHERE id = $id AND firm_id = $firmId`. Unscoped versions removed.
    - `server/src/routes/clients.ts` & `server/src/routes/cases.ts`: Routes enforce two defense-in-depth layers: passing `req.user!.firmId` into DB queries and checking record `firmId` afterwards.
    - Automated tests: `server/tests/cases.test.ts` asserts that calling `db.getClientById` or `db.getCaseById` with a foreign `firmId` returns `null` for both entities. Total server test assertions: 349 passed (0 failed).

- **Batch 2 (Restricted Cases: R-03, R-04, R-12)**:
  - **R-12: Explicit Future Server-Side Backup Rule in ARCHITECTURE.md**:
    - `ARCHITECTURE.md`: Explicitly documented Rule 14 with three essential requirements: (1) Off-site nightly database dump with SHA-256 integrity verification, (2) Future server-side backup export endpoint must strictly enforce caller firm_id scoping (`WHERE firm_id = $firmId`, never trusting client input) with `data.export` gate, and (3) Confidentiality boundary where exports on behalf of staff without `restricted.view` must omit restricted cases and all derived records.
    - `server/tests/foundation.test.ts`: Added automated invariant checks asserting ARCHITECTURE.md specifies server-side backup firm_id scoping and confidentiality boundaries.
  - **R-04: Filter Restricted Cases in Backup Export without restricted.view**:
    - `src/data/repositories/backup.ts`: Updated `createBackup` method in `MockBackupRepository`. When caller lacks `restricted.view`, backup payload excludes all restricted cases (`c.restricted === true`), and strips all associated child/related rows: linked hearings (`h.caseId`), hearing date histories, linked tasks (`t.caseId`), linked physical files (`f.caseId`), file movements, reminders derived from restricted hearings/tasks/files, and audit logs targeting or referencing confidential matters.
    - Updated `counts` in `metadata` to reflect the sanitized counts.
    - Added Test 57 to `src/modules/health/tests/backupTests.ts` asserting that staff with `data.export` but without `restricted.view` produces an export without any trace of restricted matters or child entities, while Owner export retains full data.
    - Diagnostic suite: 76/76 passed. All linters, builds, and server test suites passed cleanly.
  - **R-03: Exclude Restricted Cases from Duplicate Check, Audit, Search and Counts**:
    - `server/src/db/client.ts`: Added `includeRestricted?: boolean` parameter to `IDatabase.checkDuplicateCase` and `IDatabase.listAudit`. In `MemoryDatabase` and `PostgresDatabase`, when `includeRestricted = false`, queries strictly filter out restricted cases (`restricted = false`) and exclude case-specific audit entries for confidential cases.
    - `server/src/routes/cases.ts`: `GET /check-duplicate`, `POST /cases`, and `PATCH /cases/:id` now pass caller's `canAccessRestricted(req)` so unauthorized staff receive `isDuplicate: false` for confidential cases.
    - `server/src/routes/audit.ts`: `GET /api/v1/audit-log` now verifies whether caller has `restricted.view` (or `Owner` role) and hides audit entries concerning restricted cases.
    - `src/data/repositories/case.ts`: `MockCaseRepository.checkDuplicate` verifies `can('restricted.view', currentUser) || !c.restricted`.
    - `src/data/repositories/audit.ts`: `MockAuditLogRepository.list` filters out audit log entries regarding restricted cases if caller lacks `restricted.view`.
    - `src/data/repositories/dashboard.ts` & `src/data/repositories/reminder.ts`: Filter out reminders pointing to restricted cases and hearings/tasks/files of restricted cases when caller lacks `restricted.view`.
    - Automated tests: `server/tests/cases.test.ts` asserts that staff without `restricted.view` cannot see duplicate matches for `case-002` and cannot view its audit trail, while Owner and authorized staff can. Health check diagnostics (`casesTests.ts`, `auditTests.ts`) pass 76/76. Total server test assertions: 347 passed (0 failed).

- **Batch 1 (Config and Safety: R-01, R-05, R-06, R-08, R-11, R-14)**:
  - **R-14: Remove Unused Dependencies**:
    - Removed unused `"motion": "^12.23.24"` from root `package.json`. Verified zero imports in `src/`. Ran `npm install --legacy-peer-deps`. `npm run build` and `npm audit` remain 0 vulnerabilities.
  - **R-11: TypeScript Lint Fixes**:
    - Root `tsconfig.json`: Added `"exclude": ["node_modules", "dist", "server", "admin-app"]` to prevent root `tsc` from colliding with `admin-app`'s Vite setup.
    - `server/tests/adminFirms.test.ts:339`: Added required fields (`nameBn`, `email`, `notes`, `deletedAt`, `createdBy`, `updatedBy`) to `db.insertClient` call matching `schema.Client`.
    - Verified `npm run lint` (`tsc --noEmit`) passes with 0 errors.
  - **R-01: Drizzle ORM & Drizzle Kit Upgrade**:
    - Upgraded `drizzle-orm` to `^0.45.3` (fixes high-severity SQL injection GHSA-gpj5-g38j-94v9) and `drizzle-kit` to `^0.31.11` in `server/package.json`.
    - Verified installed versions: `drizzle-orm@0.45.3`, `drizzle-kit@0.31.11`.
    - Audit summaries: Root: 0 vulnerabilities. Server: 4 moderate (in dev-only `drizzle-kit` CLI generator's dependency `esbuild`; forced fix would downgrade drizzle-kit to 0.18 which is broken). Admin-app: 0 vulnerabilities.
  - **R-06: FORBIDDEN_ADMIN_JWT_SECRETS Validation**:
    - `server/src/config.ts`: Added `if (FORBIDDEN_ADMIN_JWT_SECRETS.includes(secret.trim()))` check inside `getAdminJwtSecret()`.
    - `server/tests/adminAuth.test.ts`: Added test case 1d asserting `validateStartupConfig()` throws when `ADMIN_JWT_SECRET` equals `.env.example` placeholder value (`'your_super_secret_admin_jwt_key_at_least_32_chars'`). All 49 assertions pass.
  - **R-05: Dynamic Trust Proxy Hops**:
    - `server/src/app.ts`: Implemented `const trustProxyHops = parseInt(process.env.TRUST_PROXY_HOPS || '0', 10); app.set('trust proxy', isNaN(trustProxyHops) ? 0 : trustProxyHops)`. Avoids hardcoded proxy trust.
    - `.env.example`: Documented `TRUST_PROXY_HOPS=0` default and that production behind Cloudflare + Caddy uses `2`.
    - `server/src/routes/health.ts`: Added `clientIp: req.ip` for operational diagnostics.
    - `server/tests/foundation.test.ts`: Added Test 9 verifying `req.ip` ignores `X-Forwarded-For` when `TRUST_PROXY_HOPS=0`, and properly resolves the client IP two hops deep when `TRUST_PROXY_HOPS=2`.
  - **R-08: Subscription Read-Only Gate on All /api/v1 Write Routes**:
    - `server/src/routes/devices.ts`: Added `enforceSubscriptionReadOnly` to `DELETE /api/v1/devices/:id`.
    - `server/src/routes/auth.ts`: Added `enforceSubscriptionReadOnly` to `POST /api/v1/auth/change-password` (and `/auth/change-password`).
    - `server/tests/devices.test.ts`: Added test asserting `DELETE /api/v1/devices/:id` returns HTTP 403 `SUBSCRIPTION_READ_ONLY` when firm license is expired.
    - `server/tests/foundation.test.ts`: Added Test 10 which dynamically extracts all registered Express routes from `app._router.stack`, identifies all 12 write endpoints under `/api/v1`, and asserts that every single one has `enforceSubscriptionReadOnly` (excluding login unauthenticated handshake and logout by design).

## Super Admin Implementation
- **Super Admin Step D - Device Authorization (Web-App Level)**:
  - **Honest Architectural Model**:
    - A "device" is a browser install identified by a random 256-bit cryptographic ID stored in an `httpOnly` cookie (`device_key`), not physical hardware.
    - Server stores only the SHA-256 hash in table `devices` (`device_key_hash`). The raw key is never exposed via API responses.
    - Clearing browser cookies or cache assigns a new random key and registers as a new pending device when quotas are full (fully verified and documented).
  - **Database Schema & Versioned Migration**:
    - Created table `devices` (`id uuid`, `firm_id text`, `user_id text`, `device_key_hash text unique`, `name text`, `user_agent text`, `status text [pending|approved|rejected|revoked]`, `first_seen_at timestamp`, `last_seen_at timestamp`, `approved_by_admin_id uuid nullable`).
    - Added columns to `firms`: `device_policy text default 'auto-approve'`, `allow_owner_device_removal boolean default false`.
    - Generated Drizzle migration `server/drizzle/0003_wild_mikhail_rasputin.sql` and updated `server/drizzle/meta/_journal.json`.
    - Extended `IDatabase`, `MemoryDatabase`, and `PostgresDatabase` with device CRUD, counting, and firm metrics enriched with device usage and pending counts.
  - **Authentication & Immediate Session Invalidation**:
    - Created `server/src/services/deviceService.ts` (`processDeviceLogin`, `hashDeviceKey`, `generateDeviceKey`, `summarizeUserAgent`).
    - Integrated with `server/src/services/authService.ts` (`loginUser`) and `server/src/routes/auth.ts`: sets `device_key` cookie (1 year expiry, httpOnly, sameSite lax). If quota reached, returns HTTP 403 `DEVICE_PENDING` while still attaching `device_key` cookie so subsequent approvals recognize the install.
    - In `server/src/middleware/auth.ts` (`firmAuthMiddleware`): queries device record from database on every request. If device status is `revoked`, `rejected`, or `pending`, immediately returns HTTP 403 and invalidates token server-side.
  - **Admin & Firm API Endpoints**:
    - Admin endpoints (`server/src/routes/adminDevices.ts` behind `adminAuthMiddleware`):
      - `GET /api/admin/firms/:id/devices`: lists all devices for a firm with user details.
      - `POST /api/admin/devices/:id/approve`: transitions device to `approved`, sets `approvedByAdminId`, and logs to `admin_audit`.
      - `POST /api/admin/devices/:id/reject`: transitions device to `rejected` and logs to `admin_audit`.
      - `POST /api/admin/devices/:id/revoke`: transitions device to `revoked`, instantly terminating all active sessions, and logs to `admin_audit`.
    - Firm endpoints (`server/src/routes/devices.ts` behind `firmAuthMiddleware`):
      - `GET /api/v1/devices/my`: Firm Owner gets read-only list of authorized chamber devices (key hashes strictly omitted).
      - `DELETE /api/v1/devices/:id`: Firm Owner may remove staff devices only if admin enables `allowOwnerDeviceRemoval`; enforced with strict firm isolation (returns 404 for devices belonging to other firms).
  - **Admin App UI Enhancements (`/admin-app`)**:
    - On `FirmListScreen`: live pending device counter badge on both desktop table and mobile card views (`X pending approval`).
    - On `FirmDetailScreen`: dedicated `Devices` tab showing quota usage (`X / Y Approved`), honest architecture notice, device status badges, user details, and action buttons (`Approve`, `Reject`, `Revoke` with confirmation modal).
  - **Firm App UI Enhancements (`src/`)**:
    - Created `src/modules/foundation/DevicePendingScreen.tsx`: clear, responsive screen displayed upon HTTP 403 `DEVICE_PENDING`.
    - Supports live language toggle with 100% en/bn parity (`src/locales/en.json` and `src/locales/bn.json` under `"devices"`).
    - Features "Check Approval Status" retry button and "Back to Login".
  - **Automated Verification**:
    - Created `server/tests/devices.test.ts` (35 assertions):
      - 3 devices allowed, 4th becomes pending with HTTP 403 `DEVICE_PENDING`.
      - Admin approval allows the 4th device to sign in.
      - Revoking a device blocks its very next request with HTTP 403 `DEVICE_REVOKED`.
      - Firm isolation: Firm A cannot see or remove Firm B's devices; firm users cannot call admin device endpoints.
      - Staff device removal by owner is blocked until admin policy enables it.
      - Clearing cookies assigns a new random key and creates a new pending device when quota is full.
    - All 331 server backend tests pass with 0 failures (`npm test --prefix server`).
    - All 74 health diagnostics pass (`npm run test:health`).
    - All 14 restFetch tests pass (`npm run test:restFetch`).
    - Automated 360px responsive check passes on admin-app.
  - **Standalone Package & Deployment Architecture**:
    - Created isolated application in `/admin-app` with its own `package.json`, `tsconfig.json`, `vite.config.ts`, and `vercel.json` (SPA routing & strict CSP headers).
    - Target domain: `admin.<domain>`. Completely decoupled: firm app contains zero admin code, zero admin links, and zero `/api/admin` references.
    - Minimal dependencies: `react`, `react-dom`, `lucide-react`, `tailwindcss`, `@tailwindcss/vite`, `vite`, `typescript`.
  - **Screens & UX Patterns**:
    - `LoginScreen`: Authenticates with platform super admin credentials; pure httpOnly `admin_access_token` cookie; zero token storage in `localStorage`.
    - `FirmListScreen`: Displays chamber firms with live status badges, license expiry countdown with days left, device limits, search by firm name/contact/court, and status filters. Responsive design: cards on mobile (`< md`), clean table on desktop (`>= md`).
    - `FirmDetailScreen`: Full chamber dossier with metrics (devices authorised, active users, expiry status, last chamber activity), actions toolbar, and tabbed history views (`license_events` and `payments`).
    - `CreateFirmModal`: Creates firm and provisions initial Owner user with a temporary password (>= 14 characters) displayed once with one-click copy.
    - `RenewModal`: Extends license from later of now or current expiry (server clock only), preserving all firm data.
    - `LicenseModal`: Adjusts device limits and license dates with server clock validation.
    - `PaymentModal`: Records subscription payments (bKash, Nagad, bank transfer) with transaction reference and notes.
    - `ConfirmModal`: Confirmation modals for suspend, disable, reactivate, and soft-delete (requires typing exact firm name).
    - `AuditScreen`: Dedicated view of platform super admin audit logs with old/new JSON diffs.
  - **Security & Responsive Verification**:
    - `npm run build --prefix admin-app`: PASS (production bundle generated with zero server code imports).
    - `npm audit --prefix admin-app`: PASS (0 vulnerabilities).
    - `npm run test:responsive --prefix admin-app`: PASS (screenshot-free automated Playwright check verifying that all screens and modals render at 360px viewport with `scrollWidth <= innerWidth` and zero horizontal overflow).
- **Super Admin Step A - Software Owner Foundation & Auth Separation**:
  - **License API & UI Deletion**:
    - Removed `POST /api/v1/firms/license/renew` and `POST /api/v1/firms/license/set-state` from `server/src/routes/firms.ts`. Kept `PATCH /api/v1/firms/current` with strict allow-list (`name`, `officeAddress`, `courtAffiliations`, `barCouncilReg`).
    - Removed `renewLicense` and `setLicenseState` from repository contracts (`src/data/interfaces.ts`, `src/data/repositories/rest/restFirm.ts`, `src/data/repositories/firm.ts`) and `AuthContext.tsx`.
    - Removed `SubscriptionRenewModal.tsx` and renewal/state mutation buttons from UI (`SettingsScreen.tsx`, `AppShell.tsx`); replaced with `mailto:support@firm.bd`.
    - Updated frontend health tests in `src/modules/health/tests/subscriptionTests.ts` to assert that firm repositories have no renewal/state mutation methods.
  - **Platform Admins & Admin Audit Schema**:
    - Created tables `platform_admins` (`id uuid`, `email unique`, `password_hash`, `totp_secret nullable`, `active`, `failed_attempts`, `locked_until`, `created_at`, `updated_at`) with NO `firm_id`, and `admin_audit` (`id uuid`, `admin_id uuid`, `action varchar(64)`, `target_firm_id uuid nullable`, `old jsonb`, `new jsonb`, `ip varchar(45)`, `at timestamp`) in `server/src/db/schema.ts`. `users` table untouched.
    - Generated Drizzle migration `server/drizzle/0001_new_umar.sql` and updated `server/drizzle/meta/_journal.json`.
    - Updated `server/src/db/client.ts` (`IDatabase`, `MemoryDatabase`, `PostgresDatabase`) with full platform admin and admin audit methods.
  - **Admin Auth & Middleware**:
    - Created `server/src/middleware/adminAuth.ts` (`adminAuthMiddleware`, `generateAdminAccessToken`, cookie options: `httpOnly`, `sameSite: 'strict'`, 15m expiry).
    - Hardened `server/src/middleware/auth.ts`: added `firmAuthMiddleware` alias, rejects any admin tokens. `adminAuthMiddleware` rejects firm tokens.
    - Configured `server/src/config.ts`: startup validation enforces `ADMIN_JWT_SECRET` presence, min 32 chars, and `ADMIN_JWT_SECRET !== JWT_SECRET`.
    - Created `server/src/services/adminAuthService.ts` (bcrypt, 5-attempt limit, 15m lockout, dummy hash comparison on non-existent users) and `server/src/services/adminAuditService.ts`.
    - Mounted `/api/admin/auth` endpoints (`/login`, `/logout`, `/me` with session sliding) in `server/src/routes/adminAuth.ts` and `server/src/app.ts`.
  - **Interactive CLI Script**:
    - Created `server/scripts/createPlatformAdmin.ts` using `node:readline` interactive prompts. Refuses CLI args or input files, enforces min 14 chars, bcrypt hashing, and refuses duplicate emails.
    - Added npm script `"admin:create": "tsx scripts/createPlatformAdmin.ts"` in `server/package.json`.
  - **Automated Verification**:
    - Added `server/tests/adminAuth.test.ts` (48 assertions) testing secret validation, CLI rules, lockout, session sliding, token cross-rejection, deleted route 404s, and audit logging.
    - Added platform admin and audit schema checks to `server/tests/postgres.test.ts` (21 assertions).
    - Total server backend test assertions: 210 PASSED (0 failed). Zero lint errors.

- **Super Admin Step B - Firm & License Management API (/api/admin)**:
  - **Database Schema & Versioned Migration**:
    - Added table `license_events` (`id uuid`, `firm_id text`, `type text`, `old jsonb`, `new jsonb`, `by_admin uuid`, `at timestamp with timezone`) to `server/src/db/schema.ts`.
    - Added `contact`, `max_devices`, `license_starts_at` to `firms` table; added `must_change_password` to `users` table; added `note` to `payments` table.
    - Generated versioned Drizzle migration `server/drizzle/0002_glamorous_lord_hawal.sql` and updated migration journal.
    - Updated `IDatabase`, `MemoryDatabase`, and `PostgresDatabase` in `server/src/db/client.ts` with firm listing, metrics, license events, and payments methods.
  - **Admin Firm Endpoints (`server/src/routes/adminFirms.ts`)**:
    - All routes mounted at `/api/admin/firms` behind `adminAuthMiddleware`.
    - All inputs validated strictly via `zod`.
    - `POST /firms`: Creates firm + first Owner user with secure temporary password (>= 14 chars) returned once in payload; sets `mustChangePassword: true`; writes to `adminAudit` and `license_events`.
    - `POST /auth/change-password`: Allows users with `mustChangePassword` to change password and clears the flag.
    - `GET /firms`: Paginated (`page`, `limit`), search across name, firmId, contact, address, bar council reg, filter by status (`active`, `expired`, `suspended`, `disabled`, `all`).
    - `GET /firms/:id`: Returns firm, plan, license (including startsAt, expiresAt, status, isExpired), user count, device count (from audit session IPs or users), last activity.
    - `PATCH /firms/:id`: Updates name, contact, addresses; writes to `adminAudit`.
    - `POST /firms/:id/suspend`: Suspends firm; records `FIRM_SUSPEND` in `adminAudit` and `SUSPEND` in `license_events`.
    - `POST /firms/:id/disable`: Disables firm; records `FIRM_DISABLE` in `adminAudit` and `DISABLE` in `license_events`.
    - `POST /firms/:id/reactivate`: Reactivates firm; records `FIRM_REACTIVATE` in `adminAudit` and `REACTIVATE` in `license_events`.
    - `DELETE /firms/:id`: Soft delete only (`deletedAt` timestamp); requires typing the exact firm name in `confirmFirmName`; firm and related client/case records preserved in DB; records `FIRM_SOFT_DELETE` in `adminAudit` and `license_events`.
    - `PUT /firms/:id/license`: Updates plan, maxDevices, start date, expiry date; re-activates expired firm if new expiry date is in future; records `LICENSE_UPDATE` in `adminAudit` and `license_events`.
    - `POST /firms/:id/renew`: Extends license from later of `now` (server clock only) or `currentExpiry`; preserves all data; re-activates if status was expired; records `LICENSE_RENEW` in `adminAudit` and `license_events`.
    - `POST /firms/:id/payments`: Records payment (`amount`, `method` [bKash/Nagad/bank], `txnId`, `note`); writes to `adminAudit`.
    - `GET /firms/:id/license-events` & `GET /firms/:id/payments`: History query endpoints.
  - **Session & Security Invariants**:
    - Updated `server/src/middleware/auth.ts`: `firmAuthMiddleware` immediately rejects any request from users belonging to a suspended or disabled firm with HTTP 403 (`FIRM_SUSPENDED` / `FIRM_DISABLED`).
    - Updated `server/src/services/authService.ts`: `loginUser` rejects login for suspended or disabled firms with HTTP 403.
    - Password hashes are never exposed in any responses.
    - Server clock used exclusively for all temporal calculations.
    - All admin actions write to `adminAudit` and `license_events`.
  - **Automated Verification**:
    - Created `server/tests/adminFirms.test.ts` (85 assertions): firm owner rejection on all admin routes (401), Zod validation, temporary password and forced password change, pagination, search, metrics, updates, suspend/disable lockout and session termination, reactivation, renewal data preservation, payments, soft deletion typing confirmation, and audit/license_events trail verification.
    - Updated `server/tests/postgres.test.ts` (22 assertions) with `licenseEvents` schema check.
    - Total server backend test assertions: 296 PASSED (0 failed). Zero lint errors.


## Done

| Module | Prototype (Gemini) | Reviewed (Claude) | Backend (Antigravity) | Hardened (Codex) |
|---|---|---|---|---|
| Foundation/auth/permissions | [x] PASS | [x] PASS | [x] PASS | [ ] |
| Clients | [x] PASS | [x] PASS | [x] PASS | [ ] |
| Cases | [x] PASS | [x] PASS | [x] PASS | [ ] |
| Hearings + history | [x] PASS | [x] PASS | [ ] | [ ] |
| Tasks | [x] PASS | [x] PASS | [ ] | [ ] |
| Physical files | [x] PASS | [x] PASS | [ ] | [ ] |
| Calendar + reminders | [x] PASS | [x] PASS | [ ] | [ ] |
| Dashboard + search | [x] PASS | [x] PASS | [ ] | [ ] |
| Backup/restore | [x] PASS | [ ] | [ ] | [ ] |
| Subscription/read-only | [x] PASS | [ ] | [ ] | [ ] |
| Admin page (firms, payments) | [x] PASS | [ ] | [ ] | [ ] |
| Deploy + server backups | n/a | n/a | [ ] | [ ] |

## Known gaps for the backend
* Two-step authentication (2FA) and password reset by email are postponed for later improvements.
* Domain modules 3.1 to 3.8 (clients, cases, hearings, tasks, files, calendar) are currently on mock repositories until their respective backend steps are built.
* PWA manifest, service worker and icons are scheduled for Step 3.10.

## Refactoring & Hardening Completed
- **Safe UUID Generation (Item 5)**:
  - Replaced all non-standard and pseudo-random ID generation with the cryptographic/UUID standard helper (`generateUUID()`) across tasks, files, file movements, and reminders.
- **Dependency & Config Cleanup (Item 6)**:
  - Cleaned up unused dependencies (`@google/genai`, `express`, `dotenv`, `@types/express`) from `package.json`.
  - Removed placeholder `GEMINI_API_KEY` and `APP_URL` from `.env.example`.
  - Removed server-side Gemini capabilities from `metadata.json` and ensured documentation notes zero external AI keys required.
- **Store Preservation Invariant (Item 7)**:
  - Health diagnostic suite executes against a clean state with automated pre-run and post-run snapshots.
  - Guaranteed zero demo data modification: automated test `store-demo-preservation-invariant` validates that the store state is 100% byte-for-byte identical before and after test execution.
- **Hardened Cryptography (Item 8)**:
  - Raised PBKDF2 derivation iterations to 600,000 for all new backups.
  - Encrypted backup headers store the iteration count (`encryption.iterations = 600000`).
  - Added legacy backup restore support with automated fallback to 100,000 iterations for older format backups.
  - Added dedicated test `backup-legacy-format-restore` verifying seamless decryption and restore of legacy backup payloads.
- **Modular Code Organization (Item 9)**:
  - Split `src/data/repositories.ts` into individual modular files under `src/data/repositories/` (`client.ts`, `case.ts`, `hearing.ts`, `task.ts`, `file.ts`, `reminder.ts`, `search.ts`, `dashboard.ts`, `backup.ts`, `firm.ts`, `user.ts`, `audit.ts`, `calendar.ts`, `common.ts`) with central index and backwards-compatible barrel export.
  - Split `HealthScreen.tsx` into modular test suites under `src/modules/health/tests/` (`foundationTests.ts`, `auditTests.ts`, `clientsTests.ts`, `casesTests.ts`, `hearingsTests.ts`, `tasksTests.ts`, `filesTests.ts`, `calendarRemindersTests.ts`, `dashboardSearchTests.ts`, `backupTests.ts`, `subscriptionTests.ts`, `index.ts`).
  - Reduced `HealthScreen.tsx` from 3,436 lines to ~200 lines. All 74 health invariant checks pass.
- **Security Fix 1 - LoginScreen Demo Credentials Removal (Item 1)**:
  - Removed all hardcoded demo emails and passwords (`owner@firm.bd`, `OwnerPassword123!`, `staff@firm.bd`, `StaffPassword123!`) from `src/modules/foundation/LoginScreen.tsx`.
  - Conditioned "Quick Demo Access" strictly on `import.meta.env.DEV && import.meta.env.VITE_ENABLE_DEMO_LOGIN === 'true'`.
  - Configured demo logins in development to pull from `VITE_DEMO_OWNER_EMAIL`, `VITE_DEMO_OWNER_PASSWORD`, `VITE_DEMO_STAFF_EMAIL`, `VITE_DEMO_STAFF_PASSWORD`. Documented in `.env.example`.
  - Verified production build (`npm run build`): Rollup dead-code eliminated the entire demo login section and credentials. Verified 0 occurrences across `dist/`.
- **Security Fix 2 - Remove Token Storage & Enforce HttpOnly Cookie Authentication (Item 2)**:
  - Removed `bd_legal_token` completely from `src/modules/foundation/AuthContext.tsx` and `src/data/repositories/rest/restCommon.ts`.
  - Zero token writes or reads from `localStorage` in application logic.
  - Client REST communications now strictly authenticate via `credentials: 'include'` relying on the `httpOnly` secure `access_token` cookie.
  - Updated `server/src/routes/auth.ts`: `/login` endpoint sets the `httpOnly` cookie and does not return any token in the JSON body.
  - Added assertion in `server/tests/foundation.test.ts` verifying `body.token === undefined`.
  - Updated backend test suites (`foundation.test.ts`, `clients.test.ts`, `cases.test.ts`) to extract tokens from `set-cookie`. All 82 test assertions PASS.
- **Security Fix Item 2b - Cookie-Only Auth Enforcement & Token Purge (Item 2b)**:
  - **What changed**:
    - `server/src/middleware/auth.ts`: Removed `Authorization: Bearer` fallback. The server now authenticates strictly via `req.cookies.access_token`. Any request lacking the cookie is rejected with HTTP 401.
    - `src/main.tsx` and `src/modules/foundation/AuthContext.tsx`: Added an upfront startup cleanup routine that removes any legacy `bd_legal_token` from `localStorage`.
    - `server/tests/foundation.test.ts`: Added test asserting that a request bearing a valid JWT in the `Authorization: Bearer` header with no cookie returns HTTP 401.
    - Updated all backend test suites (`foundation.test.ts`, `clients.test.ts`, `cases.test.ts`) to send `Cookie: access_token=...` headers. All 83 test assertions PASS.
  - **Files touched**:
    - `server/src/middleware/auth.ts`
    - `src/main.tsx`
    - `src/modules/foundation/AuthContext.tsx`
    - `server/tests/foundation.test.ts`
    - `server/tests/clients.test.ts`
    - `server/tests/cases.test.ts`
    - `PROGRESS.md`
  - **How to verify by hand**:
    1. Start the API (`npm run dev --prefix server`).
    2. Log in via `POST /auth/login` to obtain an `access_token` cookie.
    3. Make a request to `GET /api/v1/firms/current` using only `Authorization: Bearer <valid_jwt>` without the cookie: verify HTTP 401 `Unauthorized` is returned.
    4. Repeat the request with the cookie attached: verify HTTP 200 is returned.
    5. In the browser console on `localhost:3000`, run `localStorage.setItem('bd_legal_token', 'test_token')` and reload: verify `localStorage.getItem('bd_legal_token')` is `null`.
- **Security Fix Item 3 - License Endpoints, Strict Allow-List, Admin CLI & Read-Only Enforcement (Item 3, CRITICAL)**:
  - **What changed**:
    - `server/src/routes/firms.ts`: Deleted `POST /api/v1/firms/license/renew` and `POST /api/v1/firms/license/set-state`. Implemented a strict allow-list on `PATCH /api/v1/firms/current` (`name`, `officeAddress`, `courtAffiliations`, `barCouncilReg`) rejecting any other fields (`status`, `licenseExpiresAt`, `planId`, `firmId`) with HTTP 400 `BadRequest`.
    - `server/src/scripts/adminLicense.ts`: Built a standalone admin CLI tool (`npm run admin:license --prefix server -- --firm <id> --months <n> --status <active|suspended>`). Added input validation (months 1-36, valid statuses), required `ADMIN_CONFIRM=yes` environment variable, and automated audit logging with operator `system-admin`.
    - `server/package.json`: Registered `"admin:license": "tsx src/scripts/adminLicense.ts"`.
    - `src/data/repositories/rest/restFirm.ts`: Guarded `renewLicense` and `setLicenseState` to throw `'Not available: contact support'` immediately without calling the server.
    - `src/modules/settings/SettingsScreen.tsx`: In REST mode (`VITE_DATA_SOURCE=rest`), the Renew button renders "Contact us to renew" (`mailto:support@firm.bd`), mock simulation panel is suppressed unless `import.meta.env.DEV && !isRestMode`, and `SubscriptionRenewModal` is conditionally excluded.
    - `server/tests/foundation.test.ts`: Added tests verifying deleted endpoints return 404, `PATCH /firms/current` rejects `status`, `licenseExpiresAt`, `planId`, and `firmId` with 400, Staff without `settings.manage` receives 403, and the CLI script validates input, requires `ADMIN_CONFIRM=yes`, unblocks expired firms, and writes audit rows with `userName: "system-admin"`. All 93 backend assertions PASS.
  - **Files touched**:
    - `server/src/routes/firms.ts`
    - `server/src/scripts/adminLicense.ts`
    - `server/package.json`
    - `src/data/repositories/rest/restFirm.ts`
    - `src/modules/settings/SettingsScreen.tsx`
    - `server/tests/foundation.test.ts`
    - `PROGRESS.md`
  - **How to verify by hand**:
    1. Start the API (`npm run dev --prefix server`).
    2. Attempt `POST /api/v1/firms/license/renew` or `POST /api/v1/firms/license/set-state`: observe HTTP 404.
    3. Call `PATCH /api/v1/firms/current` with `{"status": "active"}` or `{"licenseExpiresAt": "2030-01-01"}`: observe HTTP 400 rejection.
    4. Run `npm run admin:license --prefix server -- --firm firm-bd-001 --months 12`: verify it aborts with an error requiring `ADMIN_CONFIRM=yes`.
    5. Run `ADMIN_CONFIRM=yes npm run admin:license --prefix server -- --firm firm-bd-001 --months 12`: verify license is updated and `GET /api/v1/audit-log` contains an entry with `userName: "system-admin"`.
    6. In browser with `VITE_DATA_SOURCE=rest`, verify the Renew button displays "Contact us to renew" and the simulation panel is hidden.
- **Security Fix Item 3b - JWT Secret Loading & Startup Hardening (Item 3b, CRITICAL)**:
  - **What changed**:
    - `server/src/index.ts`: Made `import 'dotenv/config';` the first line. Integrated `validateStartupConfig()` at bootstrap before launching Express or database migrations.
    - `server/src/config.ts`: Created centralized configuration and startup environment validator:
      - Removed hardcoded default secret fallback (`'chamber_default_jwt_secret_dev_only_32_characters'`).
      - Created `getJwtSecret()` which reads `process.env.JWT_SECRET` dynamically at runtime (never at module import time), validating that it is present, at least 32 characters, and neither the old hardcoded default nor the `.env.example` placeholder.
      - Created `validateStartupConfig()` which enforces the secret validity and in production (`NODE_ENV=production`) ensures `DATABASE_URL` is set and does not match the example database connection string.
    - `server/src/db/migrate.ts`: Removed `import dotenv from 'dotenv';` and `dotenv.config();`.
    - `server/src/app.ts`: Calls `validateStartupConfig()` in `createApp()`.
    - `server/src/middleware/auth.ts`: Replaced top-level `JWT_SECRET` constant with dynamic calls to `getJwtSecret()` inside `generateAccessToken` and `authMiddleware`.
    - `server/tests/foundation.test.ts`: Added Test 6 verifying that missing, short (< 32 chars), or example/default JWT secrets throw an error; production `DATABASE_URL` presence and validity are validated; tokens signed with a different secret are rejected with HTTP 401; and `index.ts` exits with an error code on invalid secret.
    - Configured test suites (`foundation.test.ts`, `clients.test.ts`, `cases.test.ts`) with a valid 32+ char test secret. All 101 backend assertions PASS.
  - **Files touched**:
    - `server/src/index.ts`
    - `server/src/config.ts`
    - `server/src/db/migrate.ts`
    - `server/src/app.ts`
    - `server/src/middleware/auth.ts`
    - `server/tests/foundation.test.ts`
    - `server/tests/clients.test.ts`
    - `server/tests/cases.test.ts`
    - `PROGRESS.md`
  - **How to verify by hand**:
    1. In a terminal, run the server with a missing secret:
       ```powershell
       $env:JWT_SECRET=""; npm run dev --prefix server
       ```
       Verify the process exits with `FATAL: JWT_SECRET environment variable is missing`.
    2. Run with a short secret:
       ```powershell
       $env:JWT_SECRET="too_short_key"; npm run dev --prefix server
       ```
       Verify the process exits with `FATAL: JWT_SECRET is too short (... characters). Must be at least 32 characters long`.
    3. Run with the default example secret:
       ```powershell
       $env:JWT_SECRET="your_super_secret_jwt_key_at_least_32_characters_long"; npm run dev --prefix server
       ```
       Verify the process exits with `FATAL: JWT_SECRET equals a known default or example secret from .env.example`.
    4. Sign a request with a different secret: verify HTTP 401 Unauthorized is returned.
- **Security Fix Item 4 - Audit Log Hardening, Pagination & Client Write Removal (Item 4)**:
  - **What changed**:
    - `server/src/routes/audit.ts`: Deleted `POST /api/v1/audit-log` completely. Audit rows can only be written internally by server services (`recordAudit()`) and cannot be written via client HTTP requests.
    - Added integer validation and bounds capping on `GET /api/v1/audit-log` query parameter `limit` (capped to 1..500, default 100, safe fallback for non-integer inputs like `limit=abc` or extreme integers like `limit=99999999`) and added `offset` pagination support (default 0). Preserved `settings.manage` permission check.
    - `server/src/db/client.ts`: Updated `IDatabase`, `MemoryDatabase`, and `PostgresDatabase` implementations of `listAudit` to accept and execute `limit` and `offset` pagination.
    - `src/data/repositories/rest/restAudit.ts`: Deleted `record` method from `RestAuditLogRepository`. The frontend REST repository now only performs reads (`list`) and cannot write audit rows directly.
    - `src/data/interfaces.ts` & `src/data/repositories/index.ts`: Supported `offset?: number` in `list` filter. Updated `Repositories.auditLog` typing to support `RestAuditLogRepository` without `record`.
    - `src/modules/foundation/AuthContext.tsx` & `src/modules/health/tests/auditTests.ts`: Narrowed calls to `repos.auditLog.record` so they are only invoked in mock environments where `record` is implemented.
    - `server/tests/foundation.test.ts`: Added Test 7 verifying:
      1. `POST /api/v1/audit-log` returns 404/405.
      2. `GET /api/v1/audit-log?limit=abc` returns 200 with default limit.
      3. `GET /api/v1/audit-log?limit=99999999` returns 200 safely capped at 500 without error.
      4. `GET /api/v1/audit-log?limit=1&offset=1` performs offset pagination correctly.
      5. Staff without `settings.manage` receives HTTP 403.
    - All 109 backend assertions PASS (48 Foundation + 23 Clients + 38 Cases).
  - **Files touched**:
    - `server/src/routes/audit.ts`
    - `server/src/db/client.ts`
    - `src/data/repositories/rest/restAudit.ts`
    - `src/data/interfaces.ts`
    - `src/data/repositories/index.ts`
    - `src/modules/foundation/AuthContext.tsx`
    - `src/modules/health/tests/auditTests.ts`
    - `server/tests/foundation.test.ts`
    - `PROGRESS.md`
  - **How to verify by hand**:
    1. Start the API (`npm run dev --prefix server`).
    2. Attempt a client write: `curl -X POST http://127.0.0.1:4000/api/v1/audit-log -b "access_token=..." -d '{"action":"TEST"}'` -> observe HTTP 404 Not Found.
    3. Query `GET /api/v1/audit-log?limit=abc` -> observe HTTP 200 returned with default array size.
    4. Query `GET /api/v1/audit-log?limit=99999999` -> observe HTTP 200 returned with response array length capped to <= 500.
    5. Query `GET /api/v1/audit-log` with non-managing staff account -> observe HTTP 403 Forbidden.
- **Security Fix Item 5 - restFetch Hardening (Item 5)**:
  - **What changed**:
    - `src/data/repositories/rest/restCommon.ts`:
      - Handled HTTP 204 No Content and empty body responses safely by returning `undefined` without calling `response.json()` blindly.
      - Implemented `getApiBaseUrl()` removing the default localhost fallback in production builds: if `VITE_API_BASE_URL` is missing and `!import.meta.env.DEV`, throws `FATAL: VITE_API_BASE_URL environment variable is missing. Localhost fallback is disabled in production builds.`
      - Added a default 15-second request timeout (`DEFAULT_TIMEOUT_MS = 15000`) with `AbortController`, generating human-readable error messages on timeout (`Request timed out after X seconds. Please check your network connection.`) with status 408 and code `REQUEST_TIMEOUT`.
      - Handled HTTP 401 Unauthorized responses with automated client-side browser redirection to `/login` when active session expires.
      - Handled network/connection errors with clear readable messages and code `NETWORK_FAILURE`.
    - `src/modules/foundation/AuthContext.tsx`: Updated to use `getApiBaseUrl()` instead of hardcoded fallback string.
    - `package.json`: Added `"test:restFetch": "tsx tests/restFetch.test.ts"`.
    - `tests/restFetch.test.ts`: Created unit test suite covering:
      1. HTTP 204 No Content handled without `response.json()` parse errors.
      2. HTTP 200 with empty body handled without errors.
      3. HTTP 401 triggers browser redirect to `/login` and throws error with `status: 401`.
      4. Timeout aborts request and returns HTTP 408 `REQUEST_TIMEOUT` with readable error.
      5. Network failures return clear human-readable error with `NETWORK_FAILURE`.
      6. Successful JSON response parsing.
      All 14 test assertions PASS.
  - **Files touched**:
    - `src/data/repositories/rest/restCommon.ts`
    - `src/modules/foundation/AuthContext.tsx`
    - `package.json`
    - `tests/restFetch.test.ts`
    - `PROGRESS.md`
  - **How to verify by hand**:
    1. Run the restFetch unit test suite:
       ```powershell
       npm run test:restFetch
       ```
       Verify all 14 unit test assertions pass.
    2. In browser network tab, simulate an endpoint returning 204: verify frontend does not crash with `Unexpected end of JSON input`.
    3. Disconnect network or stop backend API and perform any REST call: verify a clear error message `Network failure: Unable to connect to the server...` is presented instead of an unhandled exception.
- **Security Fix Item 6 - Docker Hardening, Compose Secrets & Seed Security (Item 6)**:
  - **What changed**:
    - `docker-compose.yml`:
      - Removed default secrets: configured strictly with `${JWT_SECRET:?JWT_SECRET required}` and `${POSTGRES_PASSWORD:?POSTGRES_PASSWORD required}` so startup fails immediately if secrets are not supplied.
      - Removed published `ports` in production compose file to prevent accidental network exposure.
    - `docker-compose.dev.yml`:
      - Created development override file mapping `127.0.0.1:5432:5432` for postgres and `127.0.0.1:4000:4000` for api.
    - `server/Dockerfile`:
      - Upgraded to `npm ci` in builder and runner stages for deterministic, reproducible builds.
      - Configured container to execute as non-root `USER node`.
      - Added `HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 CMD curl -f http://localhost:4000/api/v1/health || exit 1`.
      - Installed `curl` in alpine runner for the healthcheck.
    - `.dockerignore` and `server/.dockerignore`:
      - Created Docker ignore files excluding `node_modules`, `.env*`, `tests`, `.git`, and `dist`.
    - `server/src/db/seed.ts`:
      - Added `assertNotProduction()`: rejects execution and exits with error code 1 if `NODE_ENV === 'production'`.
      - Replaced hardcoded password constants with dynamic getters `SEED_PASSWORDS.owner` and `SEED_PASSWORDS.staff` reading from `SEED_OWNER_PASSWORD` and `SEED_STAFF_PASSWORD` env vars. If unset, generates a random cryptographically secure hex password, prints it once, and caches it.
      - Added `seedDatabase()` function that safely executes against PostgreSQL using parameterized queries when `DATABASE_URL` is provided.
    - `.env.example`:
      - Documented `SEED_OWNER_PASSWORD` and `SEED_STAFF_PASSWORD`.
    - `server/tests/foundation.test.ts`:
      - Added Test 8 verifying:
        1. `SEED_PASSWORDS.owner` and `SEED_PASSWORDS.staff` dynamically resolve strings.
        2. Running `src/db/seed.ts` when `NODE_ENV=production` exits with an error.
        3. `docker-compose.yml` requires `POSTGRES_PASSWORD` and `JWT_SECRET` with error syntax and contains no published ports.
        4. `docker-compose.dev.yml` binds `postgres` and `api` strictly to `127.0.0.1`.
        5. `server/Dockerfile` uses `npm ci`, runs as `USER node`, and includes `HEALTHCHECK`.
        6. Root `.dockerignore` excludes sensitive files.
  - **Files touched**:
    - `docker-compose.yml`
    - `docker-compose.dev.yml`
    - `.dockerignore`
    - `server/.dockerignore`
    - `server/Dockerfile`
    - `server/src/db/seed.ts`
    - `.env.example`
    - `server/tests/foundation.test.ts`
    - `PROGRESS.md`
  - **How to verify by hand**:
    1. Verify docker-compose secret requirement:
       ```powershell
       # If docker compose is installed:
       # Running without env vars fails:
       docker compose config
       # Output will report: required variable JWT_SECRET is missing a value
       ```
    2. Verify seed production guard:
       ```powershell
       $env:NODE_ENV="production"; npx tsx server/src/db/seed.ts; $env:NODE_ENV=""
       # Output reports: FATAL: Database seeding is forbidden in production environment (NODE_ENV=production)
       # Process exits with exit code 1
       ```
    3. Verify seed password generation:
       ```powershell
       npx tsx server/src/db/seed.ts
       # Observe notice printed once: [Seed] Notice: No SEED_OWNER_PASSWORD provided. Generated random owner password: ...
       ```
    4. Run all server tests:
       ```powershell
       npm test --prefix server
       # All 121 backend assertions pass (60 Foundation + 23 Clients + 38 Cases).
       ```
- **Security Fix Item 7 - Login Hardening, Timing Attack Defense, Exponential Throttling & Sliding Session (Item 7)**:
  - **What changed**:
    - `server/src/services/authService.ts`:
      - **Constant-time timing attack defense**: Non-existent user logins run `await bcrypt.compare(password, DUMMY_HASH)` to ensure response times match valid user password checks, returning the identical HTTP 401 error object (`error: 'Invalid credentials'`, `message: 'Invalid email or password.'`).
      - **Generic HTTP 429 response**: Eliminated leakage of "Account locked" or remaining minutes. Returns a generic `{ status: 429, error: 'Too Many Requests', code: 'RATE_LIMITED', message: 'Too many attempts, try again later' }`.
      - **Per-IP and per-account exponential throttling**: Replaced the hard 15-minute lock with growing backoff delays (attempts 1..4: 0s, attempt 5: 1s, attempt 6: 2s, attempt 7: 4s, ... capped at 15m). Delays enforce spacing between retry attempts without permanently locking the user out for 15 minutes.
      - **Atomic attempt tracking**: Database updates now use atomic `incrementFailedLogin` and `resetFailedLogin` statements to eliminate concurrency race conditions.
      - Added `resetLoginThrottles(ip?, email?)` helper to clear in-memory throttles when needed (e.g. testing or admin resets).
    - `server/src/db/client.ts`:
      - Added `incrementFailedLogin(id, lockedUntil)` and `resetFailedLogin(id)` to `IDatabase`.
      - Implemented atomic `UPDATE users SET failed_login_attempts = failed_login_attempts + 1, locked_until = $2 ... RETURNING ...` in `PostgresDatabase`.
      - Implemented atomic update logic in `MemoryDatabase`.
    - `server/src/middleware/auth.ts`:
      - Implemented server-side token revocation tracking (`revokeToken`, `isTokenRevoked`, `clearRevokedTokens`).
      - In `authMiddleware`: immediately rejects requests presenting revoked tokens with HTTP 401.
    - `server/src/routes/auth.ts`:
      - On `POST /logout`: calls `revokeToken(token)` to invalidate the session token on the server immediately, preventing token replay attacks.
      - On `GET /me`: implemented sliding session renewal. Re-issues fresh 15-minute `access_token` cookie for active users so they are not abruptly logged out every 15 minutes.
    - `server/tests/foundation.test.ts`:
      - Updated Test 1 with assertions verifying:
        1. Unknown email and wrong password return identical HTTP 401 error and message.
        2. HTTP 429 returns generic "Too many attempts, try again later" without leaking "account locked".
        3. `GET /me` slides the session and re-issues an `access_token` cookie.
        4. `POST /auth/logout` invalidates the token server-side, and replaying the revoked token returns HTTP 401.
        All 70 Foundation test assertions PASS (up from 60).
  - **Files touched**:
    - `server/src/services/authService.ts`
    - `server/src/db/client.ts`
    - `server/src/middleware/auth.ts`
    - `server/src/routes/auth.ts`
    - `server/tests/foundation.test.ts`
    - `PROGRESS.md`
  - **How to verify by hand**:
    1. Send a login request with an unknown email:
       ```powershell
       curl -X POST http://localhost:4000/auth/login -H "Content-Type: application/json" -d "{\"email\":\"nobody@random.bd\",\"password\":\"WrongPassword123!\"}"
       # Returns HTTP 401 with {"error":"Invalid credentials","message":"Invalid email or password."}
       ```
    2. Send 5 failed login attempts in quick succession:
       ```powershell
       # The 6th attempt within the 1-second delay window returns:
       # HTTP 429 {"error":"Too Many Requests","code":"RATE_LIMITED","message":"Too many attempts, try again later"}
       ```
    3. Log in, copy the `access_token` cookie, call `POST /auth/logout`, and re-use the cookie:
       ```powershell
       # Output reports: HTTP 401 {"error":"Unauthorized","message":"Session has been invalidated. Please log in again."}
       ```
    4. Run all server tests:
       ```powershell
       npm test --prefix server
       # All 131 backend assertions pass (70 Foundation + 23 Clients + 38 Cases).
       ```
- **Cleanup Item 8 - Project Cleanup, Package Rename & Vite Config Hardening (Item 8)**:
  - **What changed**:
    - **Deleted `bun.lock`**: Removed redundant Bun lockfile, maintaining standard `package-lock.json` as the single lockfile authority.
    - **Deleted `metadata.json`**: Removed unused root template metadata artifact.
    - **Renamed package to `bd-legal-practice`**: Updated root `package.json` and `package-lock.json` name from `react-example` to `bd-legal-practice`.
    - **Cleaned `vite.config.ts`**:
      - Removed AI Studio comments.
      - Resolved `__dirname` warning by using `fileURLToPath(import.meta.url)` in ESM mode.
    - **Added automated verification to test suite (`server/tests/foundation.test.ts`)**:
      - Verified non-existence of `bun.lock` and `metadata.json`.
      - Verified `package.json` name is `bd-legal-practice`.
      - Verified `vite.config.ts` contains no AI Studio comments.
      - Total Foundation test assertions increased to 74 (all passing).
  - **Files touched**:
    - `bun.lock` (deleted)
    - `metadata.json` (deleted)
    - `package.json`
    - `package-lock.json`
    - `vite.config.ts`
    - `server/tests/foundation.test.ts`
    - `PROGRESS.md`
  - **How to verify by hand**:
    1. Verify deleted files:
       ```powershell
       Test-Path bun.lock       # False
       Test-Path metadata.json  # False
       ```
    2. Check package name in `package.json`:
       ```powershell
       (Get-Content package.json | ConvertFrom-Json).name # bd-legal-practice
       ```
    3. Run build and tests:
       ```powershell
       npm run build
       npm test --prefix server # All 135 assertions pass
       ```
- **Cleanup Item 9 - Strict TypeScript Enforcement & Zero Any Policy (Item 9)**:
  - **What changed**:
    - **Enabled `"strict": true` in root `tsconfig.json`**: Root configuration now enforces strict type checking across the entire project (both client and server TypeScript code).
    - **Eliminated `any` types**:
      - `server/src/routes/clients.ts`: Typed request bodies as `Partial<schema.Client>`.
      - `server/src/routes/firms.ts` & `server/src/scripts/adminLicense.ts`: Strongly typed firm updates as `Partial<schema.Firm>`.
      - `src/modules/dashboard/DashboardScreen.tsx`: Used repository parameter helper types `Parameters<typeof repos.<module>.<action>>[1]` to eliminate `any` casts on client/case creations.
      - `src/data/repositories/rest/restCommon.ts`, `restCase.ts`, `restClient.ts`, `restUser.ts`: Replaced `any` with `RestApiError`, `createRestError`, and typed catch variables (`err: unknown`).
      - `server/src/app.ts`: Strongly typed error-handling middleware parameters (`err: Error, _req: Request, res: Response, _next: NextFunction`).
      - `src/data/repositories/backup.ts`: Strongly typed `ChamberBackupMetadata` and `Record<string, unknown>`.
      - `tests/restFetch.test.ts`: Strongly typed HTTP mock server `AddressInfo` and catch blocks.
    - Verified 0 type errors with `tsc --noEmit`.
  - **Files touched**:
    - `tsconfig.json`
    - `server/src/routes/clients.ts`
    - `server/src/routes/firms.ts`
    - `server/src/scripts/adminLicense.ts`
    - `server/src/app.ts`
    - `src/modules/dashboard/DashboardScreen.tsx`
    - `src/data/repositories/rest/restCommon.ts`
    - `src/data/repositories/rest/restCase.ts`
    - `src/data/repositories/rest/restClient.ts`
    - `src/data/repositories/rest/restUser.ts`
    - `src/data/repositories/backup.ts`
    - `tests/restFetch.test.ts`
    - `PROGRESS.md`
  - **How to verify by hand**:
    1. Run TypeScript compiler type-check:
       ```powershell
       npm run lint
       # tsc --noEmit completes cleanly with 0 errors under strict: true
       ```
    2. Build frontend:
       ```powershell
       npm run build
       # Vite builds cleanly with 0 errors
       ```
- **Cleanup Item 10 - Restore Rules & Invariants to ARCHITECTURE.md (Item 10)**:
  - **What changed**:
    - `ARCHITECTURE.md`: Restored core architectural rules, entity specifications, and backend layout:
      1. **Permissions on Server**: Explicitly defined that permissions are enforced on the SERVER (via `requirePermission` / `requireOwner` middleware and route guards); UI `can(permission)` helper is cosmetic only.
      2. **Never Trust Client `firm_id`**: Added rule enforcing that `firm_id` is never accepted from client input, but derived strictly from the verified session/JWT (`req.user.firmId`).
      3. **Migrations Data Safety**: Added rule 13: "Migrations must never drop data. Test on a copy first. Keep one single schema source of truth."
      4. **Data Model Specification**: Added `payments(id, firm_id, amount, method, txn_id, paid_at, verified_by)` and `backups_log(id, firm_id, kind, at, checksum)` tables.
      5. **Off-site Nightly Backup Rule**: Added rule 14 specifying automated PostgreSQL dump with SHA-256 integrity verification uploaded to off-site cloud storage (Backblaze B2 / Cloudflare R2).
      6. **Backend Folder Layout & Auth Rules**: Documented `/server/src/routes/`, `/server/src/services/`, `/server/src/middleware/`, `/server/src/db/`, `/server/src/scripts/`, and `/server/tests/`. Documented auth rules (cookie-only authentication, no token in `localStorage`, audit logs written only by server code, license changes admin-only via CLI).
    - `server/tests/foundation.test.ts`: Added automated assertions in Test 8 verifying `ARCHITECTURE.md` contains the restored server-enforced permissions, `firm_id` isolation, migration safety, `payments` and `backups_log` specifications, off-site backup rule, and folder layout / auth rules. Total Foundation test assertions increased to 80 (all passing; 141 backend assertions total).
  - **Files touched**:
    - `ARCHITECTURE.md`
    - `server/tests/foundation.test.ts`
    - `PROGRESS.md`
  - **How to verify by hand**:
    1. Inspect `ARCHITECTURE.md` to verify all rules (1–14), data model tables (`payments`, `backups_log`), and backend folder layout are present.
    2. Run the test suite:
       ```powershell
       npm test --prefix server
       # Observes:
       # [PASS] ARCHITECTURE.md requires permissions enforced on SERVER
       # [PASS] ARCHITECTURE.md enforces never trusting client firm_id
       # [PASS] ARCHITECTURE.md enforces migrations never drop data
       # [PASS] ARCHITECTURE.md specifies payments and backups_log tables
       # [PASS] ARCHITECTURE.md includes off-site nightly backup rule
       # [PASS] ARCHITECTURE.md specifies backend folder layout and auth/license rules
       # 80 Foundation tests passed (141 total server tests passed).
       ```
- **Cleanup Item 11 - Real PostgreSQL Container Test & Schema Source of Truth (Item 11)**:
  - **What changed**:
    - **Single Schema Source of Truth**:
      - `server/src/db/schema.ts` established as the single authority for database schema: defines all 8 core tables (`plans`, `firms`, `users`, `clients`, `cases`, `audit_log`, `payments`, `backups_log`), relationship foreign keys, and indexes (`idx_users_firm_id`, `idx_users_email`, `idx_clients_firm_id`, `idx_clients_name`, `idx_clients_phone`, `idx_cases_client_id`, `idx_cases_firm_id`, `idx_cases_case_number`, `idx_cases_court`, `idx_cases_status`, `idx_cases_file_serial`, `uidx_cases_firm_file_serial`, `idx_audit_log_firm_id`, `idx_audit_log_timestamp`, `idx_payments_firm_id`, `idx_backups_log_firm_id`).
      - Created `server/drizzle.config.ts` targeting `src/db/schema.ts` and outputting migrations to `./drizzle`.
      - Generated initial versioned migration (`drizzle/0000_shallow_kitty_pryde.sql`) and journal (`drizzle/meta/_journal.json`).
      - Removed duplicate raw SQL DDL string (`MIGRATION_SQL = 'CREATE TABLE IF NOT EXISTS...'`) from `server/src/db/migrate.ts`.
      - Updated `server/src/db/migrate.ts` to use official `migrate()` function from `drizzle-orm/node-postgres/migrator`, maintaining `__drizzle_migrations` as the versioned migration history table.
      - Updated `server/src/index.ts` to ensure migrations are run as a separate command (`npm run db:migrate`) and NEVER automatically at server startup in production.
    - **PostgreSQL Test Suite & Live Container Harness**:
      - Created `server/tests/postgres.test.ts` providing 19 automated assertions:
        1. Single schema source of truth validation (all 8 tables, indexes, Drizzle config, versioned migration journal).
        2. Strict absence of raw `CREATE TABLE IF NOT EXISTS` DDL strings in migration runner.
        3. Startup migration production guard.
        4. Postgres adapter error resiliency (`isHealthy()` safely returns `false` without crashing when host is unreachable).
        5. Live PostgreSQL container execution: connects to live PostgreSQL when running, runs migrations, validates `__drizzle_migrations` history table, and executes end-to-end CRUD (firm isolation, bilingual search with `ilike`, atomic `incrementFailedLogin`/`resetFailedLogin`, JSONB audit logging).
        6. Clean Docker/containerized environment detection and test reporting.
      - Updated `server/src/db/client.ts` exporting `createPostgresDatabase` and `resetDatabaseInstance`.
      - Registered `"db:generate": "drizzle-kit generate --config=drizzle.config.ts"`, `"test:postgres": "tsx tests/postgres.test.ts"`, and wired `test:postgres` into `"test"` in `server/package.json`.
      - Total server test assertions increased to 160 (all passing; 80 Foundation + 23 Clients + 38 Cases + 19 PostgreSQL).
  - **Files touched**:
    - `server/src/db/schema.ts`
    - `server/drizzle.config.ts`
    - `server/drizzle/`
    - `server/src/db/migrate.ts`
    - `server/src/index.ts`
    - `server/src/db/client.ts`
    - `server/tests/postgres.test.ts`
    - `server/package.json`
    - `PROGRESS.md`
  - **How to verify by hand**:
    1. Verify Drizzle migrations can be generated cleanly from single source of truth:
       ```powershell
       npm run db:generate --prefix server
       ```
    2. Run the PostgreSQL test suite:
       ```powershell
       npm run test:postgres --prefix server
       # Observes:
       # [PASS] schema.ts defines all tables
       # [PASS] drizzle.config.ts references schema.ts as single source of truth
       # [PASS] migrate.ts contains NO raw CREATE TABLE IF NOT EXISTS string
       # [PASS] index.ts guards migrations against automatic execution in production
       # [PASS] PostgresDatabase.isHealthy returns false safely on unreachable host without crashing
       # [SKIPPED] Real PostgreSQL container execution skipped: DATABASE_URL environment variable is not set.
       # Note: When DATABASE_URL is unset locally, live DB tests are cleanly SKIPPED (not falsely reported as PASS).
       # In CI (CI=true), missing DATABASE_URL triggers a test failure.
       ```
    3. Run full server test suite:
       ```powershell
       npm test --prefix server
       # All 160 backend assertions pass.
       ```
- **Responsive Pass - Module 1: Dashboard**:
  - **What changed**:
    - `src/modules/dashboard/DashboardScreen.tsx`:
      - Converted Section A (Today's Court Appearances / Cause List Docket) to `ResponsiveTable`: renders responsive stacked cards on mobile screens (`< md`) and a full table on tablets and desktops (`>= md`) with columns for Case/Matter, Status/Flags, Court Bench, Client, Time, and In Charge.
      - Converted Section B (Urgent Attention Matters: Overdue Tasks & Physical Files) to unified `ResponsiveTable<UrgentItem>`: renders touch-friendly cards on mobile (`< md`) with action buttons (`min-h-[44px]`), and a structured table on tablets/desktops (`>= md`) with columns for Type/Status, Title/Subject, Assigned/Holder, Due/Shelf, and quick action buttons (Mark Done / Check In).
      - Touch targets for shortcuts and actions tuned to minimum 44px on mobile devices.
      - Zero horizontal overflow across all viewport widths.
  - **Exact Widths Checked**:
    - Phones: `320px`, `360px`, `390px`, `430px`
    - Tablets: `768px`, `820px` (portrait & landscape)
    - Desktops & Large Displays: `1024px`, `1280px`, `1366px`, `1536px`, `1920px`
    - Phone landscape (e.g. `667x375`, `844x390`)
  - **Files touched**:
    - `src/modules/dashboard/DashboardScreen.tsx`
    - `PROGRESS.md`
  - **How to verify by hand**:
    1. In browser at `localhost:3000`, open Developer Tools responsive mode.
    2. Test width `320px` (iPhone SE):
       - Notice Today's Docket and Urgent Attention render as clean stacked cards.
       - Quick action buttons wrap cleanly.
       - Zero horizontal scrolling.
    3. Test widths `360px`, `390px`, `430px`:
       - Cards expand fluidly; tap targets remain accessible (>=44px).
    4. Test width `768px` and `820px` (Tablets):
       - Docket and Urgent Attention switch seamlessly to full desktop table view with columns.
- **Responsive Pass - Module 2: Cases**:
  - **What changed**:
    - `src/modules/cases/CaseFormModal.tsx`:
      - Replaced raw fixed dialog overlay with `ResponsiveModal` (maxWidth="2xl").
      - Header remains sticky at top with title, subtitle, and close button.
      - Body scrolls internally with structured responsive 2-column grid (`grid grid-cols-1 md:grid-cols-2 gap-4`).
      - Footer remains sticky at bottom with minimum 44px tap targets for Cancel and Submit buttons, utilizing `form="case-form-modal"` external trigger.
      - Full-screen sheet on mobile (`< md`), centered responsive dialog on tablet/desktop (`>= md`).
    - `src/modules/cases/CaseDetailsView.tsx`:
      - Replaced custom fixed soft-delete confirmation modal with `ResponsiveModal` (maxWidth="md").
      - Tuned action buttons (Keep Case, Confirm Delete) to minimum 44px height with full tap safety.
    - `src/modules/cases/CasesScreen.tsx`:
      - Replaced raw `divide-y divide-slate-100` case list rendering with `ResponsiveTable<CaseRecord>`.
      - On mobile (`< md`): renders stacked cards displaying File Serial badge, Case Number, Confidential flag, Status badge, Court bench, Parties, Client link with role, and touch-friendly action buttons (>= 44px).
      - On tablet/desktop (`>= md`): renders full structured table with columns for File / Serial, Case Number & Status, Court, Parties, Client & Role, and Action buttons (Edit & View Details).
      - Clicking any row or card opens the dossier view; action buttons stop propagation.
      - Search and court/status filter inputs and action buttons updated with minimum 44px height for touch convenience.
      - Responsive container capped with `max-w-7xl mx-auto w-full` with zero horizontal overflow.
  - **Exact Widths Checked**:
    - Phones: `320px`, `360px`, `390px`, `430px`
    - Tablets: `768px`, `820px` (portrait & landscape)
    - Desktops & Large Displays: `1024px`, `1280px`, `1366px`, `1536px`, `1920px`
    - Phone landscape (e.g. `667x375`, `844x390`)
  - **Files touched**:
    - `src/modules/cases/CaseFormModal.tsx`
    - `src/modules/cases/CaseDetailsView.tsx`
    - `src/modules/cases/CasesScreen.tsx`
    - `PROGRESS.md`
  - **How to verify by hand**:
    1. In browser at `localhost:3000`, navigate to Cases module.
    2. Test width `320px` (iPhone SE):
       - Observe Cases list renders as clean stacked cards.
       - Tap "+ Register Case": verify modal opens as full-height sheet with sticky header and sticky bottom Cancel/Submit buttons.
       - Open a Case dossier and click "Delete Case" (as Owner): verify confirmation modal opens full-screen with 44px action buttons.
       - Verify zero horizontal scrolling across the page.
    3. Test widths `360px`, `390px`, `430px`:
       - Cards expand gracefully with ample spacing; touch targets >= 44px.
    4. Test widths `768px` and `820px` (Tablets):
       - Cases list transitions to full tabular layout with columns (File/Serial, Case Number, Court, Parties, Client, Actions).
       - Modals transition to centered dialogs.
    5. Test widths `1024px`, `1280px`, `1536px`, `1920px` (Desktops):
       - Table renders with clean borders and alignment, bounded within `max-w-7xl mx-auto`.
- **Responsive Pass - Module 3: Clients**:
  - **What changed**:
    - `src/modules/clients/ClientFormModal.tsx`:
      - Converted to `ResponsiveModal` (maxWidth="xl") with sticky header and sticky bottom action bar (Cancel, Save).
      - Responsive 2-column grid for bilingual names and phone/email, full-width inputs for address and notes with minimum 44px touch targets.
      - Full-screen sheet on mobile (`< md`), centered modal on tablet/desktop (`>= md`).
    - `src/modules/clients/ClientProfileView.tsx`:
      - Converted soft-delete confirmation dialog to `ResponsiveModal` (maxWidth="md") with sticky actions and minimum 44px tap targets.
      - Tab bar made horizontally scrollable with touch-safe $\ge 44px$ tab buttons.
      - Top action bar buttons (Back, Edit, Archive, Delete) upgraded to $\ge 44px$ touch targets.
      - Container bounded by `max-w-7xl mx-auto w-full`.
    - `src/modules/clients/ClientsScreen.tsx`:
      - Client list converted to `ResponsiveTable<ClientRecord>`:
        - Mobile (`< md`): stacked cards displaying Avatar badge, Client English/Bengali names, phone, address, and $\ge 44px$ Edit & View Profile buttons.
        - Tablet / Desktop (`>= md`): full structured table with columns for Client, Contact, Address, Registered date, and Actions.
      - Search bar, add button, and empty state buttons updated to $\ge 44px$ touch targets.
      - Bounded responsive container (`max-w-7xl mx-auto w-full`) with zero horizontal overflow.
  - **Exact Widths Checked**:
    - Phones: `320px`, `360px`, `390px`, `430px`
    - Tablets: `768px`, `820px` (portrait & landscape)
    - Desktops & Large Displays: `1024px`, `1280px`, `1366px`, `1536px`, `1920px`
    - Phone landscape (e.g. `667x375`, `844x390`)
  - **Files touched**:
    - `src/modules/clients/ClientFormModal.tsx`
    - `src/modules/clients/ClientProfileView.tsx`
    - `src/modules/clients/ClientsScreen.tsx`
    - `PROGRESS.md`
  - **How to verify by hand**:
    1. In browser at `localhost:3000`, navigate to Clients module.
    2. Test width `320px` (iPhone SE):
       - Observe Clients list renders as clean stacked cards.
       - Tap "+ Register Client": verify modal opens as full-height sheet with sticky header and sticky bottom Cancel/Save buttons.
       - Open a Client profile: verify top action buttons wrap cleanly and tab headers scroll horizontally without breaking layout.
       - Click "Delete" on client profile: verify confirmation modal opens full-screen with 44px action buttons.
       - Verify zero horizontal scrolling across the page.
    3. Test widths `360px`, `390px`, `430px`:
       - Cards expand gracefully with ample spacing; touch targets >= 44px.
    4. Test widths `768px` and `820px` (Tablets):
       - Clients list transitions to full tabular layout with columns (Client, Contact, Address, Registered, Actions).
       - Modals transition to centered dialogs.
    5. Test widths `1024px`, `1280px`, `1536px`, `1920px` (Desktops):
       - Table renders with clean borders and alignment, bounded within `max-w-7xl mx-auto`.
- **Responsive Pass - Module 4: Hearings**:
  - **What changed**:
    - `src/modules/hearings/AdjournHearingModal.tsx`:
      - Converted to `ResponsiveModal` (maxWidth="lg") with sticky header and sticky bottom action bar (Cancel, Adjourn & Schedule Next Date).
      - Touch targets $\ge 44px$ on all buttons and inputs. Full-screen sheet on mobile (`< md`), centered modal on tablet/desktop (`>= md`).
    - `src/modules/hearings/HearingDateHistoryModal.tsx`:
      - Converted to `ResponsiveModal` (maxWidth="lg") with sticky header and sticky bottom Close button ($\ge 44px$).
      - Responsive timeline entry cards with clear status badge, date, order notes, and reason.
    - `src/modules/hearings/HearingFormModal.tsx`:
      - Converted to `ResponsiveModal` (maxWidth="xl") with sticky header and sticky bottom action bar (Cancel, Save Hearing).
      - Responsive 2-column grid for date/time/court inputs with $\ge 44px$ touch targets and form validation.
    - `src/modules/hearings/RescheduleHearingModal.tsx`:
      - Converted to `ResponsiveModal` (maxWidth="md") with sticky header and sticky bottom action bar (Cancel, Reschedule).
      - Touch-friendly date/time pickers and reason textarea with $\ge 44px$ buttons.
    - `src/modules/hearings/HearingsScreen.tsx`:
      - Hearings list converted to `ResponsiveTable<HearingRecord>`:
        - Mobile (`< md`): stacked cards displaying Case Number, File Serial badge, Status badge, Court bench, Step/Purpose box, formatted Date & Time, and $\ge 44px$ action buttons (Date History, Reschedule, Adjourn & Next).
        - Tablet / Desktop (`>= md`): full structured table with columns for Case / Matter, Step / Purpose, Date & Time, Status, and Actions.
      - Cause list filter bar ("All Hearings", "Today's Cause List", status dropdown) and top "+ Schedule Hearing" button upgraded to $\ge 44px$ touch targets.
      - Bounded responsive container (`max-w-7xl mx-auto w-full`) with zero horizontal overflow.
  - **Exact Widths Checked**:
    - Phones: `320px`, `360px`, `390px`, `430px`
    - Tablets: `768px`, `820px` (portrait & landscape)
    - Desktops & Large Displays: `1024px`, `1280px`, `1366px`, `1536px`, `1920px`
    - Phone landscape (e.g. `667x375`, `844x390`)
  - **Files touched**:
    - `src/modules/hearings/AdjournHearingModal.tsx`
    - `src/modules/hearings/HearingDateHistoryModal.tsx`
    - `src/modules/hearings/HearingFormModal.tsx`
    - `src/modules/hearings/RescheduleHearingModal.tsx`
    - `src/modules/hearings/HearingsScreen.tsx`
    - `PROGRESS.md`
  - **How to verify by hand**:
    1. In browser at `localhost:3000`, navigate to Hearings module.
    2. Test width `320px` (iPhone SE):
       - Observe Hearings list renders as clean stacked cards.
       - Tap "+ Schedule Hearing": verify modal opens as full-height sheet with sticky header and sticky bottom Cancel/Save buttons.
       - Tap "Date History", "Reschedule", or "Adjourn & Next" on any hearing: verify modals open as responsive full-height sheets with $\ge 44px$ buttons.
       - Verify cause list filter buttons wrap cleanly and have touch-safe heights.
       - Verify zero horizontal scrolling across the page.
    3. Test widths `360px`, `390px`, `430px`:
       - Cards expand gracefully with ample spacing; touch targets $\ge 44px$.
    4. Test widths `768px` and `820px` (Tablets):
       - Hearings list transitions to full tabular layout with columns (Case/Matter, Step/Purpose, Date & Time, Status, Actions).
       - Modals transition to centered dialogs.
    5. Test widths `1024px`, `1280px`, `1536px`, `1920px` (Desktops):
       - Table renders with clean borders and alignment, bounded within `max-w-7xl mx-auto`.
- **Responsive Pass - Module 5: Tasks**:
  - **What changed**:
    - `src/modules/tasks/TaskCompleteModal.tsx`:
      - Converted to `ResponsiveModal` (maxWidth="md") with sticky header and sticky bottom action bar (Cancel, Mark Completed).
      - Touch targets $\ge 44px$ on all buttons and inputs. Full-screen sheet on mobile (`< md`), centered modal on tablet/desktop (`>= md`).
    - `src/modules/tasks/TaskFormModal.tsx`:
      - Converted to `ResponsiveModal` (maxWidth="xl") with sticky header and sticky bottom action bar (Cancel, Save Task).
      - Responsive 2-column grid for assignedTo, priority, case, client with $\ge 44px$ touch targets and form ID binding (`form="task-form-modal"`).
    - `src/modules/tasks/TaskReassignModal.tsx`:
      - Converted to `ResponsiveModal` (maxWidth="md") with sticky header and sticky bottom action bar (Cancel, Reassign Task).
      - Touch-friendly assignee selector and reason textarea with $\ge 44px$ action buttons.
    - `src/modules/tasks/TasksScreen.tsx`:
      - Tasks list converted to `ResponsiveTable<TaskRecord>`:
        - Mobile (`< md`): stacked cards displaying complete toggle checkbox ($\ge 44px$ tap area), Title, Priority badge, Status badge, Description, Assignee, linked Case/Client, localized Due Date with overdue highlight, and $\ge 44px$ action buttons (Complete, Reassign, Edit, Delete).
        - Tablet / Desktop (`>= md`): full structured table with columns for Status & Task, Matter & Assignee, Priority, Due Date, and Actions.
      - Soft delete confirmation converted to `ResponsiveModal` (maxWidth="md") with $\ge 44px$ Cancel and Delete buttons.
      - Scope switch ("My Tasks" vs "All Chamber Tasks"), search input, and status/priority/assignee dropdown filters upgraded to $\ge 44px$ touch targets.
      - Top action button ("+ Add Task") upgraded to $\ge 44px$ touch target.
      - Bounded responsive container (`max-w-7xl mx-auto w-full`) with zero horizontal overflow across all viewports.
  - **Exact Widths Checked**:
    - Phones: `320px`, `360px`, `390px`, `430px`
    - Tablets: `768px`, `820px` (portrait & landscape)
    - Desktops & Large Displays: `1024px`, `1280px`, `1366px`, `1536px`, `1920px`
    - Phone landscape (e.g. `667x375`, `844x390`)
  - **Files touched**:
    - `src/modules/tasks/TaskCompleteModal.tsx`
    - `src/modules/tasks/TaskFormModal.tsx`
    - `src/modules/tasks/TaskReassignModal.tsx`
    - `src/modules/tasks/TasksScreen.tsx`
    - `PROGRESS.md`
  - **How to verify by hand**:
    1. In browser at `localhost:3000`, navigate to Tasks module.
    2. Test width `320px` (iPhone SE):
       - Observe Tasks list renders as clean stacked cards.
       - Tap complete checkbox on card: toggle completes task with strike-through or opens completion modal.
       - Tap "+ Add Task": verify modal opens as full-height sheet with sticky header and sticky bottom Cancel/Save buttons.
       - Tap "Reassign", "Edit", or "Delete": verify each modal opens as responsive sheet with $\ge 44px$ buttons.
       - Verify scope switch and filter inputs wrap cleanly and have touch-safe heights.
       - Verify zero horizontal scrolling across the page.
    3. Test widths `360px`, `390px`, `430px`:
       - Cards expand gracefully with ample spacing; touch targets $\ge 44px$.
    4. Test widths `768px` and `820px` (Tablets):
       - Tasks list transitions to full tabular layout with columns (Status & Task, Matter & Assignee, Priority, Due Date, Actions).
       - Modals transition to centered dialogs.
    5. Test widths `1024px`, `1280px`, `1536px`, `1920px` (Desktops):
       - Table renders with clean borders and alignment, bounded within `max-w-7xl mx-auto`.

## Phase 3: Backend Step 3.0 (Foundation: Server, Database, Auth)

### 1. What was built
- **Backend Server (`/server`)**:
  - Express + TypeScript REST service structured under `/api/v1` (with `/auth/*` top-level routing).
  - Production & local Dockerfile (`server/Dockerfile`) and `docker-compose.yml` defining an isolated local PostgreSQL 16 database (port strictly bound to `127.0.0.1`, not exposed to the internet) and the API container.
- **Database Layer & Migrations**:
  - Drizzle ORM schema (`server/src/db/schema.ts`) and SQL DDL migrations (`server/src/db/migrate.ts`) defining: `plans`, `firms`, `users`, and `audit_log` tables with standard architecture columns (`id` uuid, `firm_id`, `created_at`, `updated_at`, `deleted_at`, `created_by`, `updated_by`).
  - Performance and tenant isolation indexes on `firm_id`, `email`, and `timestamp`.
  - Database adapter supporting both live PostgreSQL connections and an in-process memory database adapter for automated testing and zero-dependency local verification.
  - Seeding dummy data (`server/src/db/seed.ts`) with demo firm (`firm-bd-001`), demo Owner (`owner@firm.bd`), and demo Staff (`staff@firm.bd`).
- **Authentication & Security Engine**:
  - Passwords hashed with `bcryptjs` (salt rounds = 10).
  - Strong password validator (minimum 8 chars, uppercase, lowercase, number, special character).
  - Short-lived JWT access tokens (15-minute expiry) issued in `httpOnly`, `sameSite: 'lax'`, secure cookies as well as Bearer token header support.
  - Login rate-limiting: tracks failed attempts per user and automatically locks accounts for 15 minutes after 5 consecutive failed attempts.
- **Middleware Suite**:
  - `authMiddleware`: verifies JWT token from httpOnly cookie or Authorization header, loading active user and chamber firm.
  - `requirePermission` & `requireOwner`: role-based access control matching `src/permissions.ts` permission keys (Owner has all permissions; Staff restricted to granted permissions).
  - `enforceFirmIsolation`: prevents cross-tenant access; rejects foreign `firmId` parameters with HTTP 403 `FIRM_ISOLATION_VIOLATION`.
  - `enforceSubscriptionReadOnly`: server-clock subscription evaluation; past grace period or suspended firms receive HTTP 403 `SUBSCRIPTION_READ_ONLY` on write endpoints (`POST`, `PUT`, `PATCH`, `DELETE`) while reads (`GET`) remain accessible.
  - `recordAudit`: writes an immutable row into `audit_log` on every write operation.
- **Endpoints Implemented**:
  - `GET /api/v1/health` (and `/health`)
  - `POST /auth/login` (and `/api/v1/auth/login`)
  - `POST /auth/logout` (and `/api/v1/auth/logout`)
  - `GET /auth/me` (and `/api/v1/auth/me`)
  - `GET /api/v1/users`, `GET /api/v1/users/:id`, `PATCH /api/v1/users/:id/permissions`
  - `GET /api/v1/firms/current`, `PATCH /api/v1/firms/current`, `POST /api/v1/firms/license/renew`
  - `GET /api/v1/audit-log`, `POST /api/v1/audit-log`
- **Frontend Integration**:
  - REST repositories (`RestUserRepository`, `RestFirmRepository`, `RestAuditLogRepository`) in `src/data/repositories/rest/`.
  - Selected via single environment variable: `VITE_DATA_SOURCE=rest` (defaults to `mock`).
  - Real, mobile-first responsive `LoginScreen.tsx` replacing profile switcher when unauthenticated, with password visibility toggles, rate limit error banners, and 1-click demo logins.
  - User session modal updated with a "Sign Out" action.
- **Automated Test Suite**:
  - `server/tests/foundation.test.ts` running 20 assertions covering all 5 checklist requirements.

### 2. How to run it locally
- **Run Backend Standalone**:
  ```bash
  npm run dev --prefix server
  # Server starts on port 4000: http://localhost:4000/api/v1/health
  ```
- **Run Backend Automated Tests**:
  ```bash
  npm test --prefix server
  # Or: npx tsx server/tests/foundation.test.ts
  ```
- **Run Docker Compose (API + PostgreSQL)**:
  ```bash
  docker compose up --build
  # PostgreSQL is on 127.0.0.1:5432 (local-only, not exposed to internet)
  # API is on 127.0.0.1:4000
  ```
- **Run Frontend with REST Backend**:
  ```bash
  # In .env: set VITE_DATA_SOURCE=rest
  npm run dev
  # Frontend opens on http://localhost:3000
  ```

### 3. What to verify by hand
1. Open the login screen (`LoginScreen.tsx`) at `http://localhost:3000`.
2. Try logging in with invalid password: verify HTTP 401 error message.
3. Try 5 consecutive wrong passwords: verify account lock alert ("Account is temporarily locked").
4. Click "Demo Owner (Adv. Mahbubur Rahman)": verify login succeeds, cookie is set, and chamber dashboard opens.
5. In header profile, click "Sign Out": verify session clears and returns to LoginScreen.
6. Click "Demo Staff (Adv. Nusrat Jahan)": verify staff login and permissions.
7. Test bilingual toggle (EN / বাংলা) on login screen.

### 4. Known gaps
- Two-step verification (2FA) and email password reset are postponed.
- Domain modules 3.2 to 3.8 (cases, hearings, tasks, files, calendar) currently operate on mock repositories and will be connected module-by-module in subsequent steps.

## Phase 3: Backend Step 3.1 (Clients)

### 1. What was built
- **Database Schema & Migrations (`server/src/db/schema.ts`, `server/src/db/migrate.ts`)**:
  - `clients` table with standard architecture columns (`id` uuid, `firm_id`, `name`, `name_bn`, `phone`, `email`, `address`, `notes`, `archived`, `created_at`, `updated_at`, `deleted_at`, `created_by`, `updated_by`).
  - Added indexes: `idx_clients_firm_id`, `idx_clients_name`, `idx_clients_phone`, `idx_cases_client_id`.
  - Added dummy clients in `server/src/db/seed.ts` (`client-001`, `client-002`, `client-003`).
- **Data Access & In-Memory / Postgres Adapters (`server/src/db/client.ts`)**:
  - `listClients(firmId, search?)`: bilingual search covering English (`name`), Bangla (`nameBn`), phone, and address.
  - `getClientById(id)`: firm-isolated retrieval.
  - `insertClient(client)`: client creation.
  - `updateClient(id, updates)`: updates with timestamp.
  - `countActiveCasesForClient(clientId)`: checks ongoing cases for orphan protection.
  - `getClientLinkedOverview(clientId, firmId)`: returns linked matters overview (`cases`, `tasks`, `files`).
- **REST Endpoints (`server/src/routes/clients.ts`)**:
  - `GET /api/v1/clients`: list & bilingual search (requires `clients.view`).
  - `GET /api/v1/clients/:id`: get client by ID (requires `clients.view`).
  - `GET /api/v1/clients/:id/overview`: get client's linked matters overview (requires `clients.view`).
  - `POST /api/v1/clients`: create client, validates required fields, enforces `clients.edit` and subscription read-only check, writes immutable `audit_log` row.
  - `PATCH /api/v1/clients/:id`: update client, enforces `clients.edit` and subscription read-only check, writes immutable `audit_log` row.
  - `DELETE /api/v1/clients/:id`: soft delete only (`deleted_at`), enforces `clients.edit` and subscription read-only check. **Orphan protection**: rejects deletion with HTTP 400 if client has active cases. Writes immutable `audit_log` row.
- **Frontend Integration (`src/data/repositories/rest/restClient.ts`)**:
  - `RestClientRepository` implements `IClientRepository` via REST client with credentials & CSRF headers.
  - Configured in `src/data/repositories/index.ts` under `VITE_DATA_SOURCE=rest`.
- **Automated Test Suite (`server/tests/clients.test.ts`)**:
  - 23 assertions verifying bilingual search, orphan protection, permissions, subscription read-only, audit log generation, and multi-tenant isolation.
  - Total backend assertions: 43 (20 Foundation + 23 Clients).

### 2. How to run locally
- Start API:
  ```powershell
  cd server && npm run dev
  ```
- Run tests:
  ```powershell
  npm test --prefix server
  ```

### 3. What to verify by hand
1. Send `GET /api/v1/clients?search=হাসান` to verify Bangla search works.
2. Send `DELETE /api/v1/clients/client-001` (client with active case): verify HTTP 400 error preventing orphaned cases.
3. Call `POST /api/v1/clients` as Staff user without `clients.edit`: verify HTTP 403 Forbidden.
4. Call `GET /api/v1/audit-log` after creating or editing client: verify audit entries recorded.

### 4. Known gaps
- Client tags, duplicate phone warning, and Excel import are postponed for future enhancements.

## Phase 3: Backend Step 3.2 (Cases)

### 1. What was built
- **Database Schema & Migrations (`server/src/db/schema.ts`, `server/src/db/migrate.ts`)**:
  - `cases` table with standard architecture columns (`id` uuid, `firm_id`, `client_id`, `file_serial`, `case_number`, `court`, `matter_type`, `description`, `plaintiff`, `defendant`, `our_role`, `plaintiff_lawyer`, `defendant_lawyer`, `status`, `restricted`, `next_hearing_at`, `created_at`, `updated_at`, `deleted_at`, `created_by`, `updated_by`).
  - Added indexes: `idx_cases_case_number`, `idx_cases_court`, `idx_cases_status`, `idx_cases_file_serial`, and partial unique index `uidx_cases_firm_file_serial` on `(firm_id, file_serial)` where not null and not deleted.
  - Added seed cases in `server/src/db/seed.ts` (`case-001` public, `case-002` confidential/restricted).
- **Data Access & In-Memory / Postgres Adapters (`server/src/db/client.ts`)**:
  - `listCases`: filters by `search`, `status`, `court`, `matterType`, `clientId`, and enforces confidentiality via `includeRestricted` flag.
  - `getCaseById`: firm-isolated case retrieval.
  - `insertCase`: case registration.
  - `updateCase`: case editing and status transitions (e.g. closing a case).
  - `checkDuplicateCase`: case number + court duplication check per firm with optional `excludeId` for updates.
  - `getCaseLinkedCounts`: linked counts for hearings, tasks, files, and reminders.
  - Updated `getClientLinkedOverview` to respect `restricted.view` confidentiality.
- **REST Endpoints (`server/src/routes/cases.ts`)**:
  - `GET /api/v1/cases/check-duplicate`: real-time duplicate check endpoint by `caseNumber` and `court`.
  - `GET /api/v1/cases`: list & filter cases (requires `cases.view`). Confidential cases omitted for unauthorized staff.
  - `GET /api/v1/cases/:id`: get case by ID (requires `cases.view`). Confidential cases return HTTP 404 to unauthorized users.
  - `GET /api/v1/cases/:id/counts`: get linked counts (requires `cases.view`).
  - `POST /api/v1/cases`: register case (requires `cases.create`). Enforces valid client belonging to caller firm, validates `restricted.view` if marked restricted, returns duplicate warning if duplicate detected, records `audit_log` row.
  - `PATCH /api/v1/cases/:id`: update case (requires `cases.edit`). Preserves linked records when closing case (`status: 'closed'`), checks `restricted.view` if editing confidential case, returns duplicate warning if duplicate detected, records `audit_log` row.
  - `DELETE /api/v1/cases/:id`: soft delete case (requires `cases.delete` and role `Owner`). Never hard-deletes, records `audit_log` row.
- **Frontend Integration (`src/data/repositories/rest/restCase.ts`)**:
  - `RestCaseRepository` implements `ICaseRepository` against `/api/v1/cases`.
  - Wired into `src/data/repositories/index.ts` under `VITE_DATA_SOURCE=rest`.
- **Automated Test Suite (`server/tests/cases.test.ts`)**:
  - 38 assertions validating client requirement, cross-module linkage, restricted case confidentiality, duplicate warnings, closing record retention, soft delete, audit trail, and firm isolation.
  - Total backend assertions: 81 (20 Foundation + 23 Clients + 38 Cases).

### 2. How to run locally
- Start API:
  ```powershell
  cd server && npm run dev
  ```
- Run tests:
  ```powershell
  npm test --prefix server
  ```

### 3. What to verify by hand
1. Login as Staff (`staff@firm.bd`): call `GET /api/v1/cases` and verify `case-002` (restricted) is completely absent.
2. Query `GET /api/v1/cases/case-002` as Staff: verify HTTP 404 Not Found (invisible).
3. Login as Owner (`owner@firm.bd`): call `GET /api/v1/cases/case-002`: verify HTTP 200 with case details.
4. Call `POST /api/v1/cases` with existing case number & court: verify HTTP 201 response includes `warning: 'Duplicate case number in the same court detected'`.
5. Call `PATCH /api/v1/cases/case-001` with `{"status": "closed"}`: verify case closes and all linked counts remain intact.
6. Call `GET /api/v1/audit-log`: verify CREATE, UPDATE, and DELETE entries for Case entity.

### 4. Known gaps
- Conflict-of-interest check across opposing parties and counsel directory are postponed for future enhancements.

## Decisions log
- Single source of truth repository pattern implemented in `/src/data`. UI interacts strictly through repository interfaces.
- Permissions enforced both at UI layer and repository method layer.
- Confidential/restricted cases are isolated at the data query layer to ensure zero data leakage to unauthorized staff in search, metrics, and docket feeds.
- Dynamic cross-module linkage: Client profile reflects live cases, tasks, and physical files; Case dossier reflects live hearing status, date history, tasks, and physical files; Calendar aggregates across all modules; Dashboard unifies everything into executive oversight.
- Global search provides instant cross-entity discovery across 5 entities with deep-linking to target module tabs.
- Chamber backup exports produce tamper-evident, SHA-256 signed JSON snapshots with optional 256-bit AES-GCM password encryption via native Web Crypto API.
- Multi-tenant firmId isolation guarantees zero foreign tenant leakage in exported backups; restores safely remap records to the restoring chamber's firmId.
- Every backup export and restore operation writes an immutable entry (`BACKUP_EXPORT` / `BACKUP_RESTORE`) into the chamber audit trail.
- Hearing adjournments automatically reschedule linked reminders; task completions and file returns automatically clear linked reminders.
- Reminders are stored in `localStore.reminders` and synchronized automatically across chamber modules.
- Daily cause list supports both interactive UI review and crisp physical print formatting.

## Responsive pass

### 1. Foundation (Shell & Navigation)
- **Status**: [x] PASS
- **Components & Assets Updated**:
  - `src/index.html`: Added `viewport-fit=cover` to meta viewport for iPhone notch and home-indicator handling.
  - `src/index.css`: Mobile-first baseline styling, safe-area insets (`pt-safe`, `pb-safe`, `pl-safe`, `pr-safe`), 16px input font size on mobile to block iOS auto-zoom, Bengali typography line-height protection (1.5 min), 44x44px minimum tap targets, prefers-reduced-motion protection, and `100dvh` container height.
  - `src/components/responsive/useBreakpoint.ts`: Single source of truth reactive hook for breakpoints (`xs`, `sm`, `md`, `lg`, `xl`, `2xl`) and semantic flags (`isMobile`, `isTablet`, `isDesktop`, `isLandscape`).
  - `src/components/responsive/ResponsiveModal.tsx`: Reusable modal opening as a full-screen sheet with sticky header and sticky bottom action bar on phones (<md), and as a centered dialog with max-width and internal scrolling on tablets/desktops (>=md).
  - `src/components/responsive/ResponsiveTable.tsx`: Reusable component rendering stacked cards on phones (<md) and sticky-header table on tablets/desktops (>=md).
  - `src/modules/foundation/AppShell.tsx`:
    - Phone (<md): Top bar with chamber branding + slide-out navigation drawer with all 11 modules + fixed bottom navigation bar for 4 core tabs (Dashboard, Cases, Calendar, Tasks) with safe-area padding and 44px+ tap targets.
    - Tablet (md to lg, 768px - 1023px): Collapsible sidebar toggling between 240px expanded and 68px icon rail with tooltips.
    - Desktop (lg+, >=1024px): Full 240px sidebar + content area.
    - Large / Ultra-wide Displays (>=1536px, 1920px): Max-width bounded content container (`max-w-7xl 2xl:max-w-[1536px] mx-auto`) preventing line stretching on 27"+ monitors.
    - Overflow: `overflow-x-hidden` on main container guaranteeing zero horizontal page scroll.
  - `src/modules/foundation/UserSwitchModal.tsx`: Fully responsive modal via `ResponsiveModal` with 44px tap targets and wrapped bilingual text.
- **Exact Widths Checked**:
  - Phones: `320px`, `360px`, `390px`, `430px`
  - Tablets: `768px`, `820px` (portrait & landscape)
  - Desktops & Large Displays: `1024px`, `1280px`, `1366px`, `1536px`, `1920px`
  - Orientations & Zoom: Phone landscape (e.g. `667x375`, `844x390`), Browser zoom `150%` and `200%`
- **Verification Results**:
  - `npm run lint`: PASS (0 errors)
  - `npm run build`: PASS (Vite production build)
  - Health suite: PASS (74/74 invariants passed, zero demo data mutation)

### 2. Dashboard
- **Status**: [x] PASS
- **Components & Assets Updated**:
  - `src/modules/dashboard/DashboardScreen.tsx`:
    - Section A (Today's Cause List Docket) converted to `ResponsiveTable` (cards on mobile, table on desktop/tablet).
    - Section B (Urgent Overdue Tasks & Physical Files) converted to unified `ResponsiveTable<UrgentItem>` (cards on mobile, table on desktop/tablet).
    - Minimum 44px tap targets for quick actions, shortcuts, and table row items.
    - Zero horizontal overflow across all breakpoints.
- **Exact Widths Checked**:
  - Phones: `320px`, `360px`, `390px`, `430px`
  - Tablets: `768px`, `820px` (portrait & landscape)
  - Desktops & Large Displays: `1024px`, `1280px`, `1366px`, `1536px`, `1920px`
  - Orientations & Zoom: Phone landscape (e.g. `667x375`, `844x390`), Browser zoom `150%` and `200%`
- **Verification Results**:
  - `npm run lint`: PASS (0 errors)
  - `npm run build`: PASS (Vite production build)
  - Health suite: PASS (74/74 invariants passed, zero demo data mutation)
  - Server tests: PASS (160/160 assertions passed)

### 3. Cases
- **Status**: [x] PASS
- **Components & Assets Updated**:
  - `src/modules/cases/CaseFormModal.tsx`:
    - Converted to `ResponsiveModal` (maxWidth="2xl") with sticky header and sticky bottom action bar (Cancel, Save Case).
    - 2-column responsive form grid with scrollable internal body.
    - Full-height sheet on mobile devices (`< md`), centered modal on tablet/desktop (`>= md`).
    - Minimum 44px touch targets on all buttons and inputs.
  - `src/modules/cases/CaseDetailsView.tsx`:
    - Soft-delete confirmation dialog converted to `ResponsiveModal` (maxWidth="md") with sticky actions and minimum 44px tap targets.
  - `src/modules/cases/CasesScreen.tsx`:
    - Case list converted to `ResponsiveTable<CaseRecord>`:
      - Mobile (`< md`): stacked cards displaying File Serial badge, Case Number, Confidential badge, Status badge, Court, Parties, Client link, and >=44px action buttons.
      - Tablet / Desktop (`>= md`): full structured table with columns for File / Serial, Case Number & Status, Court, Parties, Client & Role, and Actions.
    - Search input, court filter, status filter, and "+ Register Case" buttons upgraded to minimum 44px touch targets.
    - Bounded responsive container (`max-w-7xl mx-auto w-full`) with zero horizontal overflow.
- **Exact Widths Checked**:
  - Phones: `320px`, `360px`, `390px`, `430px`
  - Tablets: `768px`, `820px` (portrait & landscape)
  - Desktops & Large Displays: `1024px`, `1280px`, `1366px`, `1536px`, `1920px`
  - Orientations & Zoom: Phone landscape (e.g. `667x375`, `844x390`), Browser zoom `150%` and `200%`
- **Verification Results**:
  - `npm run lint`: PASS (0 errors)
  - `npm run build`: PASS (Vite production build)
  - Health suite: PASS (74/74 invariants passed, zero demo data mutation)
  - Server tests: PASS (160/160 assertions passed)

### 4. Clients
- **Status**: [x] PASS
- **Components & Assets Updated**:
  - `src/modules/clients/ClientFormModal.tsx`:
    - Converted to `ResponsiveModal` (maxWidth="xl") with sticky header and sticky bottom actions (Cancel, Save).
    - 2-column responsive form grid for bilingual names and phone/email, full-width inputs for address and notes with $\ge 44px$ touch targets.
    - Full-height sheet on mobile devices (`< md`), centered modal on tablet/desktop (`>= md`).
  - `src/modules/clients/ClientProfileView.tsx`:
    - Converted soft-delete confirmation dialog to `ResponsiveModal` (maxWidth="md") with sticky actions and minimum 44px tap targets.
    - Horizontally scrollable tab bar with $\ge 44px$ touch-safe tab buttons.
    - Top action bar buttons (Back, Edit, Archive, Delete) upgraded to $\ge 44px$ touch targets.
    - Container bounded by `max-w-7xl mx-auto w-full`.
  - `src/modules/clients/ClientsScreen.tsx`:
    - Client list converted to `ResponsiveTable<ClientRecord>`:
      - Mobile (`< md`): stacked cards displaying Avatar badge, Client English/Bengali names, phone, address, and $\ge 44px$ Edit & View Profile buttons.
      - Tablet / Desktop (`>= md`): full structured table with columns for Client, Contact, Address, Registered date, and Actions.
    - Search bar, add button, and empty state buttons updated to $\ge 44px$ touch targets.
    - Bounded responsive container (`max-w-7xl mx-auto w-full`) with zero horizontal overflow.
- **Exact Widths Checked**:
  - Phones: `320px`, `360px`, `390px`, `430px`
  - Tablets: `768px`, `820px` (portrait & landscape)
  - Desktops & Large Displays: `1024px`, `1280px`, `1366px`, `1536px`, `1920px`
  - Orientations & Zoom: Phone landscape (e.g. `667x375`, `844x390`), Browser zoom `150%` and `200%`
- **Verification Results**:
  - `npm run lint`: PASS (0 errors)
  - `npm run build`: PASS (Vite production build)
  - Health suite: PASS (74/74 invariants passed, zero demo data mutation)
  - Server tests: PASS (160/160 assertions passed)

### 5. Hearings
- **Status**: [x] PASS
- **Components & Assets Updated**:
  - `src/modules/hearings/AdjournHearingModal.tsx`:
    - Converted to `ResponsiveModal` (maxWidth="lg") with sticky header and sticky bottom action bar (Cancel, Adjourn & Schedule Next Date).
    - Minimum 44px tap targets on all buttons and inputs.
    - Full-height sheet on mobile devices (`< md`), centered modal on tablet/desktop (`>= md`).
  - `src/modules/hearings/HearingDateHistoryModal.tsx`:
    - Converted to `ResponsiveModal` (maxWidth="lg") with sticky header and sticky bottom Close button ($\ge 44px$).
    - Responsive timeline entries with status badge, order notes, reason, and proper contrast.
  - `src/modules/hearings/HearingFormModal.tsx`:
    - Converted to `ResponsiveModal` (maxWidth="xl") with sticky header and sticky bottom action bar (Cancel, Save Hearing).
    - 2-column responsive grid for date/time/court inputs with $\ge 44px$ touch targets.
  - `src/modules/hearings/RescheduleHearingModal.tsx`:
    - Converted to `ResponsiveModal` (maxWidth="md") with sticky header and sticky bottom action bar (Cancel, Reschedule).
    - Touch-friendly date/time pickers and reason textarea with $\ge 44px$ buttons.
  - `src/modules/hearings/HearingsScreen.tsx`:
    - Hearings list converted to `ResponsiveTable<HearingRecord>`:
      - Mobile (`< md`): stacked cards displaying Case Number, File Serial badge, Status badge, Court bench, Step/Purpose box, formatted Date & Time, and $\ge 44px$ action buttons (Date History, Reschedule, Adjourn & Next).
      - Tablet / Desktop (`>= md`): full structured table with columns for Case / Matter, Step / Purpose, Date & Time, Status, and Actions.
    - Cause list filter bar ("All Hearings", "Today's Cause List", status dropdown) and top "+ Schedule Hearing" button upgraded to $\ge 44px$ touch targets.
    - Bounded responsive container (`max-w-7xl mx-auto w-full`) with zero horizontal overflow.
- **Exact Widths Checked**:
  - Phones: `320px`, `360px`, `390px`, `430px`
  - Tablets: `768px`, `820px` (portrait & landscape)
  - Desktops & Large Displays: `1024px`, `1280px`, `1366px`, `1536px`, `1920px`
  - Orientations & Zoom: Phone landscape (e.g. `667x375`, `844x390`), Browser zoom `150%` and `200%`
- **Verification Results**:
  - `npm run lint`: PASS (0 errors)
  - `npm run build`: PASS (Vite production build)
  - Health suite: PASS (74/74 invariants passed, zero demo data mutation)
  - Server tests: PASS (160/160 assertions passed)

### 6. Tasks
- **Status**: [x] PASS
- **Components & Assets Updated**:
  - `src/modules/tasks/TaskCompleteModal.tsx`:
    - Converted to `ResponsiveModal` (maxWidth="md") with sticky header and sticky bottom action bar (Cancel, Mark Completed).
    - Minimum 44px tap targets on all buttons and inputs.
    - Full-height sheet on mobile devices (`< md`), centered modal on tablet/desktop (`>= md`).
  - `src/modules/tasks/TaskFormModal.tsx`:
    - Converted to `ResponsiveModal` (maxWidth="xl") with sticky header and sticky bottom action bar (Cancel, Save Task).
    - 2-column responsive grid for task inputs with $\ge 44px$ touch targets.
  - `src/modules/tasks/TaskReassignModal.tsx`:
    - Converted to `ResponsiveModal` (maxWidth="md") with sticky header and sticky bottom action bar (Cancel, Reassign Task).
    - Touch-friendly assignee selector and reason textarea with $\ge 44px$ buttons.
  - `src/modules/tasks/TasksScreen.tsx`:
    - Tasks list converted to `ResponsiveTable<TaskRecord>`:
      - Mobile (`< md`): stacked cards displaying complete toggle checkbox ($\ge 44px$ tap area), Title, Priority badge, Status badge, Description, Assignee, linked Case/Client, localized Due Date with overdue highlight, and $\ge 44px$ action buttons (Complete, Reassign, Edit, Delete).
      - Tablet / Desktop (`>= md`): full structured table with columns for Status & Task, Matter & Assignee, Priority, Due Date, and Actions.
    - Soft delete confirmation converted to `ResponsiveModal` (maxWidth="md") with $\ge 44px$ Cancel and Delete buttons.
    - Scope switch ("My Tasks" vs "All Chamber Tasks"), search input, and status/priority/assignee dropdown filters upgraded to $\ge 44px$ touch targets.
    - Top action button ("+ Add Task") upgraded to $\ge 44px$ touch target.
    - Bounded responsive container (`max-w-7xl mx-auto w-full`) with zero horizontal overflow across all viewports.
- **Exact Widths Checked**:
  - Phones: `320px`, `360px`, `390px`, `430px`
  - Tablets: `768px`, `820px` (portrait & landscape)
  - Desktops & Large Displays: `1024px`, `1280px`, `1366px`, `1536px`, `1920px`
  - Orientations & Zoom: Phone landscape (e.g. `667x375`, `844x390`), Browser zoom `150%` and `200%`
- **Verification Results**:
  - `npm run lint`: PASS (0 errors)
  - `npm run build`: PASS (Vite production build)
  - Health suite: PASS (74/74 invariants passed, zero demo data mutation)
  - Server tests: PASS (160/160 assertions passed)

### 7. Files (Physical Files)
- **Status**: [x] PASS
- **Components & Assets Updated**:
  - `src/modules/files/FileCheckInModal.tsx`:
    - Converted to `ResponsiveModal` (maxWidth="md") with sticky header and sticky bottom action bar (Cancel, Check In to Chamber).
    - Minimum 44px tap targets on all buttons and inputs.
    - Full-height sheet on mobile devices (`< md`), centered modal on tablet/desktop (`>= md`).
  - `src/modules/files/FileCheckOutModal.tsx`:
    - Converted to `ResponsiveModal` (maxWidth="md") with sticky header and sticky bottom action bar (Cancel, Check Out File).
    - Minimum 44px tap targets on all buttons and inputs.
  - `src/modules/files/FileCourtDispatchModal.tsx`:
    - Converted to `ResponsiveModal` (maxWidth="md") with sticky header and sticky bottom action bar (Cancel, Dispatch to Court).
    - Minimum 44px tap targets on all inputs, select, and buttons.
  - `src/modules/files/FileFormModal.tsx`:
    - Converted to `ResponsiveModal` (maxWidth="xl") with sticky header and sticky bottom action bar (Cancel, Save File).
    - Responsive form grid for serial, case, client, shelf location, and notes with $\ge 44px$ touch targets.
  - `src/modules/files/FileHistoryModal.tsx`:
    - Converted to `ResponsiveModal` (maxWidth="xl") with subtitle `${file.serial} • ${file.title}`.
    - Sticky Close button with $\ge 44px$ touch target.
    - Responsive custody timeline with status badges and timestamps.
  - `src/modules/files/FilesScreen.tsx`:
    - File list converted to `ResponsiveTable<PhysicalFileRecord>`:
      - Mobile (`< md`): stacked cards displaying monospace serial badge, shelf location, linked case/client tags, title, notes preview, custody status badge, custody info strip (current holder, checked out date, due date with overdue alert), and $\ge 44px$ action buttons (Check Out, Dispatch Court, Check In, View History, Edit, Delete).
      - Tablet / Desktop (`>= md`): full structured table with columns for File & Serial, Case & Client, Custody Status, Holder & Due Date, and Actions.
    - Soft delete confirmation converted to `ResponsiveModal` (maxWidth="md") with $\ge 44px$ Cancel and Delete buttons.
    - Stats scorecards (Total Files, In Chamber, Checked Out, In Court, Overdue) styled with $\ge 44px$ interactive touch targets and responsive wrapping (`grid-cols-2 sm:grid-cols-3 lg:grid-cols-5`).
    - Search input and status/shelf dropdown filters upgraded to $\ge 44px$ touch targets.
    - Top action button ("+ Register Physical File") upgraded to $\ge 44px$ touch target.
    - Bounded responsive container (`max-w-7xl mx-auto w-full`) with zero horizontal overflow across all viewports.
- **Exact Widths Checked**:
  - Phones: `320px`, `360px`, `390px`, `430px`
  - Tablets: `768px`, `820px` (portrait & landscape)
  - Desktops & Large Displays: `1024px`, `1280px`, `1366px`, `1536px`, `1920px`
  - Orientations & Zoom: Phone landscape (e.g. `667x375`, `844x390`), Browser zoom `150%` and `200%`
- **Verification Results**:
  - `npm run lint`: PASS (0 errors)
  - `npm run build`: PASS (Vite production build)
  - Health suite: PASS (74/74 invariants passed, zero demo data mutation)
  - Server tests: PASS (160/160 assertions passed)

### 8. Calendar
- **Status**: [x] PASS
- **Components & Assets Updated**:
  - `src/modules/calendar/DailyCauseListModal.tsx`:
    - Converted to `ResponsiveModal` (maxWidth="4xl") with subtitle `${formattedDate}` and Scale icon.
    - Sticky Cancel and Print Daily Cause List action buttons with $\ge 44px$ touch targets.
    - Responsive printable cause list header and table with horizontal scroll wrapper (`min-w-[580px]`) and clean print media styles.
    - Full-height sheet on mobile devices (`< md`), centered modal on tablet/desktop (`>= md`).
  - `src/modules/calendar/CalendarScreen.tsx`:
    - Outer container bounded to `space-y-6 max-w-7xl mx-auto w-full`.
    - Month grid cells:
      - Mobile (`< sm`): compact layout (`min-h-[56px]`) with colored dots indicating hearing (indigo), task (amber), and file return (emerald) events, guaranteeing zero horizontal overflow across 320px–430px viewports.
      - Desktop (`>= sm`): structured cells (`min-h-[105px]`) with event title badges and "+N more" overflow indicators.
    - Selected date agenda section:
      - Interactive touch targets on all event cards and "Print Daily Cause List" button ($\ge 44px$).
    - Cause List view:
      - Equipped with horizontal scroll container (`min-w-[560px]`) preventing layout breakage on mobile viewports.
      - Print button upgraded to $\ge 44px$ touch target.
    - Top header:
      - "Scan Reminders / Sync Now" and "Print Daily Cause List" buttons upgraded to $\ge 44px$ touch targets.
    - Due reminders banner:
      - Reminder item "Dismiss" button upgraded to $\ge 44px$ touch target.
    - Control bar:
      - View mode toggle ("Month Grid", "Agenda / Timeline", "Daily Cause List") converted to $\ge 44px$ buttons with horizontal scroll support on small screens.
      - Month navigator (Previous, Month/Year label, Next, Today) upgraded with $\ge 44px$ touch targets.
      - Event filter pills ("All Items", "Court Hearings", "Task Deadlines", "File Returns") upgraded to $\ge 44px$ touch targets.
- **Exact Widths Checked**:
  - Phones: `320px`, `360px`, `390px`, `430px`
  - Tablets: `768px`, `820px` (portrait & landscape)
  - Desktops & Large Displays: `1024px`, `1280px`, `1366px`, `1536px`, `1920px`
  - Orientations & Zoom: Phone landscape (e.g. `667x375`, `844x390`), Browser zoom `150%` and `200%`
- **Verification Results**:
  - `npm run lint`: PASS (0 errors)
  - `npm run build`: PASS (Vite production build)
  - Health suite: PASS (74/74 invariants passed, zero demo data mutation)
  - Server tests: PASS (160/160 assertions passed)

### 9. Search (Global Search)
- **Status**: [x] PASS
- **Components & Assets Updated**:
  - `src/modules/search/GlobalSearchModal.tsx`:
    - Responsive modal container:
      - Adjusted top offset and padding (`pt-2 sm:pt-16 p-2 sm:p-4`) and height (`max-h-[92vh] sm:max-h-[80vh]`) for small phone screens.
      - Retains backdrop click and Escape key dismissal.
    - Search input header:
      - Text size styled at `text-sm sm:text-base` preventing unwanted browser zoom on iOS devices upon focus.
      - Search query clear button upgraded to $\ge 44px$ tap area.
      - Added dedicated mobile Close button (`min-h-[44px] min-w-[44px]`) featuring an explicit `X` icon on mobile screens where hardware Escape keys are absent.
    - Entity filter pills:
      - All filter buttons ("All", "Cases", "Clients", "Hearings", "Tasks", "Files") upgraded to $\ge 44px$ touch targets with horizontal scroll support on narrow screens.
    - Empty state:
      - Responsive padding and illustration.
      - "Quick examples" filter suggestion buttons ("Suit", "F-000101", "Dhaka", "Rafiqul") upgraded to $\ge 44px$ touch targets.
    - Search result hits:
      - Each result row styled with $\ge 48px$ touch target height and active scale feedback (`active:scale-[0.99]`).
      - Clean multi-line wrapping on titles, subtitles, and details, preventing truncation bugs on 320px–430px viewports.
      - Confidentiality / restricted indicators gracefully wrap with entity and status badges.
    - Footer info bar:
      - Compact layout with result count and responsive keyboard hints.
- **Exact Widths Checked**:
  - Phones: `320px`, `360px`, `390px`, `430px`
  - Tablets: `768px`, `820px` (portrait & landscape)
  - Desktops & Large Displays: `1024px`, `1280px`, `1366px`, `1536px`, `1920px`
  - Orientations & Zoom: Phone landscape (e.g. `667x375`, `844x390`), Browser zoom `150%` and `200%`
- **Verification Results**:
  - `npm run lint`: PASS (0 errors)
  - `npm run build`: PASS (Vite production build)
  - Health suite: PASS (74/74 invariants passed, zero demo data mutation)
  - Server tests: PASS (160/160 assertions passed)

### 10. Backup & Restore
- **Status**: [x] PASS
- **Components & Assets Updated**:
  - `src/modules/backup/BackupScreen.tsx`:
    - Screen Layout & Container:
      - Responsive grid structure (`grid-cols-1 lg:grid-cols-2 gap-8`) gracefully stacking into a clean 1-column layout on mobile viewports (<1024px) and 2 columns on desktop.
      - Container wrapped with `space-y-8 max-w-7xl mx-auto w-full pb-12` preventing horizontal scrolling or cut-off elements.
    - Export Section:
      - Backup format selector cards ("Full Database Backup" and "Metadata Only") styled with $\ge 44px$ interactive height and clear responsive indicators.
      - Encryption password input and confirmation input upgraded to `min-h-[44px] px-3.5 py-2.5` with minimum 16px font sizing on focus.
      - "Download Backup" submit button upgraded to `min-h-[44px] py-2.5 px-4` with animated loading state.
    - Inspect & Decrypt Section:
      - Decrypt password input and "Unlock & Inspect" button upgraded to `min-h-[44px]` touch targets.
      - Snapshot preview details card styled with responsive grid and overflow protection for long firm names or checksum strings.
    - Restore Strategy & Actions:
      - Restore strategy radio choice cards ("Clean Replace" vs "Safe Merge") upgraded to `min-h-[44px] p-3` touch targets.
      - "Proceed to Restore" button upgraded to `min-h-[44px] py-2.5 px-4` touch target.
    - Confirmation Modal Refactor:
      - Converted raw modal overlay to standard `ResponsiveModal` component with `maxWidth="md"`.
      - Built-in backdrop tap dismissal, hardware Escape key handler, and body scroll lock.
      - Mobile-first responsive footer (`flex flex-col-reverse sm:flex-row items-stretch sm:items-center justify-end gap-3`) with $\ge 44px$ Cancel and Confirm Restore buttons.
- **Exact Widths Checked**:
  - Phones: `320px`, `360px`, `390px`, `430px`
  - Tablets: `768px`, `820px` (portrait & landscape)
  - Desktops & Large Displays: `1024px`, `1280px`, `1366px`, `1536px`, `1920px`
  - Orientations & Zoom: Phone landscape (e.g. `667x375`, `844x390`), Browser zoom `150%` and `200%`
- **Verification Results**:
  - `npm run lint`: PASS (0 errors)
  - `npm run build`: PASS (Vite production build)
  - Health suite: PASS (74/74 invariants passed, zero demo data mutation)
  - Server tests: PASS (160/160 assertions passed)

### 11. Settings & Staff Management
- **Status**: [x] PASS
- **Components & Assets Updated**:
  - `src/modules/settings/SettingsScreen.tsx`:
    - Screen Layout & Container:
      - Wrapped with `space-y-8 max-w-5xl mx-auto w-full pb-12` ensuring responsive containment and bottom clearance across all screen sizes.
      - 2-column layout on desktop (`lg:grid-cols-3`) collapsing to 1-column stack on small screens with consistent padding (`p-5 sm:p-6`).
    - Chamber Profile Form:
      - Firm Name, Bar Council Reg, and Court Affiliations text inputs upgraded to `min-h-[44px] px-3.5 py-2.5 text-sm rounded-xl`.
      - Office Address textarea expanded with `min-h-[80px] px-3.5 py-2.5 text-sm rounded-xl`.
      - "Save Chamber Profile" action button upgraded to `min-h-[44px] px-5 py-2.5 rounded-xl` with full-width mobile adaptation (`w-full sm:w-auto`).
    - Subscription Column:
      - "Renew Subscription" button / "Contact us to renew" link upgraded to `min-h-[44px] px-3.5 py-2 rounded-xl`.
      - License simulation testing buttons (DEV & mock mode) upgraded to `min-h-[44px] px-2.5 py-2 rounded-xl flex items-center`.
    - Language Preference:
      - English and Bangla switch buttons upgraded to `min-h-[44px] py-2.5 px-4 rounded-xl flex items-center justify-center` ensuring reliable finger tapping.
    - Backup Quick Card:
      - Navigation link upgraded to `min-h-[44px] py-2 inline-flex items-center gap-1.5`.
    - Staff Management & Permissions Matrix:
      - User card header equipped with `min-w-0` and `break-all sm:break-normal` on User ID to prevent overflow on 320px–360px phones.
      - Permissions checklist items upgraded to `min-h-[44px] p-2.5 rounded-xl flex items-start gap-2.5` with `shrink-0` on checkboxes and `break-words leading-tight` preventing text truncation across English and Bengali labels.
- **Exact Widths Checked**:
  - Phones: `320px`, `360px`, `390px`, `430px`
  - Tablets: `768px`, `820px` (portrait & landscape)
  - Desktops & Large Displays: `1024px`, `1280px`, `1366px`, `1536px`, `1920px`
  - Orientations & Zoom: Phone landscape (e.g. `667x375`, `844x390`), Browser zoom `150%` and `200%`
- **Verification Results**:
  - `npm run lint`: PASS (0 errors)
  - `npm run build`: PASS (Vite production build)
  - Health suite: PASS (74/74 invariants passed, zero demo data mutation)
  - Server tests: PASS (160/160 assertions passed)

### 12. Audit Trail
- **Status**: [x] PASS
- **Components & Assets Updated**:
  - `src/modules/audit/AuditLogScreen.tsx`:
    - Screen Layout & Container:
      - Outer container wrapped with `space-y-6 max-w-7xl mx-auto w-full pb-12` ensuring responsive containment and padding across mobile and desktop.
    - Restricted Access Guard:
      - Upgraded restricted access warning card to responsive container (`max-w-4xl mx-auto p-4 sm:p-6 w-full`) with comfortable padding (`p-6 sm:p-8 rounded-2xl`).
    - Header & Controls:
      - "Refresh" button upgraded to `w-full sm:w-auto min-h-[44px] px-4 py-2.5 rounded-xl` with animated spinner.
    - Filters:
      - Filter panel styled with `p-4 sm:p-5 rounded-2xl border border-slate-200 shadow-xs`.
      - Entity filter and action filter select dropdowns upgraded to `min-h-[44px] px-3.5 py-2.5 rounded-xl` for comfortable touch control.
    - Audit Log Rows:
      - Interactive row headers upgraded to `min-h-[44px]` touch targets with hover and active states.
      - Entity ID styled with `break-all sm:break-normal` preventing overflow on narrow phone screens.
      - "Show details" / "Hide changes" toggles upgraded to `min-h-[44px]` tap targets.
    - JSON Diffs:
      - Removed rigid margin on mobile (`mt-3 sm:ml-7`) allowing diff cards to occupy optimal screen width.
      - Old and new value payloads wrapped in `overflow-x-auto whitespace-pre-wrap break-all text-[11px] sm:text-xs` ensuring zero horizontal container rupture.
- **Exact Widths Checked**:
  - Phones: `320px`, `360px`, `390px`, `430px`
  - Tablets: `768px`, `820px` (portrait & landscape)
  - Desktops & Large Displays: `1024px`, `1280px`, `1366px`, `1536px`, `1920px`
  - Orientations & Zoom: Phone landscape (e.g. `667x375`, `844x390`), Browser zoom `150%` and `200%`
- **Verification Results**:
  - `npm run lint`: PASS (0 errors)
  - `npm run build`: PASS (Vite production build)
  - Health suite: PASS (74/74 invariants passed, zero demo data mutation)
  - Server tests: PASS (160/160 assertions passed)

### 13. System Health & Diagnostics
- **Status**: [x] PASS
- **Components & Assets Updated**:
  - `src/modules/health/HealthScreen.tsx`:
    - Screen Layout & Container:
      - Wrapped with `space-y-6 max-w-5xl mx-auto w-full pb-12` ensuring responsive containment and padding across mobile and desktop.
    - Header & Trigger Action:
      - "Run Diagnostics Again" button upgraded to `w-full sm:w-auto min-h-[44px] px-5 py-2.5 rounded-xl` with spinning refresh indicator.
    - Stage Banner:
      - Stage status badge aligned with `self-start sm:self-auto` to prevent badge compression or distortion on 320px–360px viewports.
    - Summary Scorecards:
      - Overall Status, Passed Count, and Issues cards styled with rounded-2xl corners, responsive typography (`text-base sm:text-lg`), and balanced spacing.
    - Diagnostics List:
      - Header converted to responsive flex container (`flex-col sm:flex-row gap-1 px-4 sm:px-6 py-3.5 sm:py-4`) preventing text collision on small phones.
      - Pass/Fail status badges equipped with `self-start sm:self-auto` for clean vertical alignment on mobile screens.
      - Technical details and assertion strings protected with `break-all sm:break-normal` to eliminate horizontal container overflow on narrow viewports.
- **Exact Widths Checked**:
  - Phones: `320px`, `360px`, `390px`, `430px`
  - Tablets: `768px`, `820px` (portrait & landscape)
  - Desktops & Large Displays: `1024px`, `1280px`, `1366px`, `1536px`, `1920px`
  - Orientations & Zoom: Phone landscape (e.g. `667x375`, `844x390`), Browser zoom `150%` and `200%`
- **Verification Results**:
  - `npm run lint`: PASS (0 errors)
  - `npm run build`: PASS (Vite production build)
  - Health suite: PASS (74/74 invariants passed, zero demo data mutation)
  - Server tests: PASS (160/160 assertions passed)

### 14. Subscription Licensing & Renewal
- **Status**: [x] PASS
- **Components & Assets Updated**:
  - `src/modules/subscription/SubscriptionRenewModal.tsx`:
    - Standard Responsive Modal Architecture:
      - Converted raw custom overlay into `ResponsiveModal` with `maxWidth="md"`.
      - Incorporates backdrop tap dismissal, hardware Escape key dismissal, and background scroll locking.
    - Package Selection Cards:
      - 1-month, 6-month, and 12-month tier cards upgraded to `min-h-[56px] p-3.5 rounded-xl border-2 flex items-center justify-between gap-3`.
      - Radio buttons equipped with `shrink-0` to guarantee consistent shape.
      - Recommended badge and package titles wrap gracefully on ultra-compact 320px screens.
    - Status & Preview Cards:
      - Current subscription status card and new validity projected expiry card styled with responsive flex layouts and `shrink-0` icons.
    - Action Buttons:
      - Footer refactored with mobile-first responsive stacked action buttons (`flex flex-col-reverse sm:flex-row items-stretch sm:items-center justify-end gap-3`).
      - Cancel button and Confirm Renewal button upgraded to `min-h-[44px]` touch targets with full touch accessibility.
- **Exact Widths Checked**:
  - Phones: `320px`, `360px`, `390px`, `430px`
  - Tablets: `768px`, `820px` (portrait & landscape)
  - Desktops & Large Displays: `1024px`, `1280px`, `1366px`, `1536px`, `1920px`
  - Orientations & Zoom: Phone landscape (e.g. `667x375`, `844x390`), Browser zoom `150%` and `200%`
- **Verification Results**:
  - `npm run lint`: PASS (0 errors)
  - `npm run build`: PASS (Vite production build)
  - Health suite: PASS (74/74 invariants passed, zero demo data mutation)
  - Server tests: PASS (160/160 assertions passed)

---

## Responsive Pass Automated Verification (Playwright E2E)
- **Status**: [x] ALL 11 MODULES PROVEN & VERIFIED
- **Audit Findings**:
  - **Raw Modal & Overlay Audit**:
    - All functional modal dialogs across all 11 modules (`ClientModal`, `CaseModal`, `HearingModal`, `TaskModal`, `FileUploadModal`, `FileHistoryModal`, `FileTransferModal`, `DailyCauseListModal`, `RestoreModal`, `AddStaffModal`, `SubscriptionRenewModal`) use the unified `ResponsiveModal` component.
    - Two non-dialog overlays intentionally use direct primitives:
      - `AppShell.tsx`: Mobile slide-out drawer backdrop overlay (`fixed inset-0 bg-slate-900/50 backdrop-blur-xs`) and fixed mobile bottom bar (`fixed bottom-0 left-0 right-0 z-40`). These are persistent navigation shells, not modals.
      - `GlobalSearchModal.tsx`: Global Command-K / Spotlight search palette. Uses standard `fixed inset-0 z-50` backdrop with full keyboard traps, Escape dismissal, backdrop click dismissal, and `min-h-[44px]` tap targets.
  - **Raw `<table>` Audit**:
    - All primary data tables across all modules (`ClientsScreen`, `CasesScreen`, `HearingsScreen`, `TasksScreen`, `FilesScreen`) use `ResponsiveTable` with automatic mobile card transformation on `<md` screens.
    - Two specialized legal cause list tables intentionally use raw `<table>`:
      - `CalendarScreen.tsx` (Daily Cause List table) and `DailyCauseListModal.tsx` (Printable Court Cause List table). Both are strictly wrapped inside horizontal scroll containers (`overflow-x-auto min-w-[560px]` / `min-w-[580px]`) preserving legal judicial column alignments for printing while preventing page-level horizontal overflow.
  - **Touch Targets**:
    - All interactive elements across all modules satisfy >= 44px minimum touch targets (`min-h-[44px]` / `min-w-[44px]`).
- **Automated Playwright E2E Suite (`e2e/responsive.spec.ts`)**:
  - Test command: `npm run test:responsive` (`playwright test`)
  - Evaluated condition across every module: `document.documentElement.scrollWidth <= window.innerWidth` (fails if any horizontal overflow occurs).
  - Tested Viewports:
    - `360px` (Compact Mobile - 11/11 modules PASS)
    - `768px` (Tablet - 11/11 modules PASS)
    - `1280px` (Desktop - 11/11 modules PASS)
  - Result: **33 passed (49.3s)** with 0 failures across all 11 modules.





