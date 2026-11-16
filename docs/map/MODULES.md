# Module Catalog & Cross-Module Boundaries

This catalog documents every module across the active applications: `src/modules` (Frontend), `admin-app/src/screens` (Admin Console), and `server-cloudflare/src/` (Active Cloudflare Backend).

> [!NOTE]
> The legacy Express backend (`server/`) is **retired and excluded from refactoring**. Its routes are documented as retired historical reference only.

---

## 1. Frontend Feature Modules (`src/modules/*`)

| Module | Purpose | Entry File | Total Lines | Imports from Other Modules | Imported By Modules | Cross-Module Architecture Flags |
| :--- | :--- | :--- | :---: | :--- | :--- | :--- |
| **appointments** | Client consultations & chamber meetings | `AppointmentsScreen.tsx` | 1,317 | `foundation` | `dashboard`, `foundation` | Standard |
| **audit** | Audit log inspection & filtering | `AuditLogScreen.tsx` | 333 | `foundation` | None (rendered via App) | Standard |
| **backup** | Chamber data JSON backup & restore | `BackupScreen.tsx` | 643 | `foundation` | None (rendered via App) | Standard |
| **billing** | Fee agreements, payments & ledgers | `BillingScreen.tsx` | 3,879 | `foundation`, `dashboard` | `cases`, `clients` | ⚠️ **Imports `dashboard/chamberExpenses`** |
| **calendar** | Daily cause lists & month/week grid | `CalendarScreen.tsx` | 2,027 | `foundation` | `dashboard` | Standard |
| **cases** | Case dossier, hearings & sharing | `CasesScreen.tsx` | 3,330 | `foundation`, `billing` | `dashboard`, `foundation` | ⚠️ **Directly imports `billing/BillingTab`** |
| **clients** | Client profiles, contacts & photos | `ClientsScreen.tsx` | 2,342 | `foundation`, `billing` | `dashboard`, `foundation` | ⚠️ **Directly imports `billing/BillingTab`** |
| **dashboard** | Chamber KPI metrics & daily agenda | `DashboardScreen.tsx` | 2,702 | `foundation`, `cases`, `clients`, `tasks`, `calendar`, `appointments` | `billing` | ⚠️ **Skips repos: imports 5 feature modals** |
| **files** | Physical folder serials & custody | `FilesScreen.tsx` | 2,008 | `foundation` | `foundation` | Standard |
| **foundation** | AppShell, Auth, Navigation, Modals | `AppShell.tsx` | 3,128 | `appointments`, `cases`, `clients`, `hearings`, `tasks`, `files`, `search` | All modules | ⚠️ **NavigationContext imports 7 feature modals** |
| **health** | In-browser test runner & diagnostics | `HealthScreen.tsx` | 4,758 | `foundation` | None (lazy route) | ⚠️ **Bundles test harness in production UI** |
| **hearings** | Court schedules, outcomes & history | `HearingsScreen.tsx` | 2,699 | `foundation` | `foundation` | Standard |
| **search** | Global search modal dialog | `GlobalSearchModal.tsx` | 454 | `foundation` | `foundation` | Standard |
| **settings** | Chamber config, licenses, users | `SettingsScreen.tsx` | 1,618 | `foundation` | None (rendered via App) | Standard |
| **subscription**| Empty placeholder directory | None | 0 | None | None | ⚠️ **Unused directory (0 files)** |
| **tasks** | Case action items & assignments | `TasksScreen.tsx` | 1,596 | `foundation` | `dashboard`, `foundation` | Standard |

---

## 2. Super Admin Portal Screens (`admin-app/src/screens/*`)

| Screen / Component | Purpose | Entry File | Lines | Internal Dependencies | Cross-Module / Layer Violations |
| :--- | :--- | :--- | :---: | :--- | :--- |
| **FirmListScreen** | Lists tenant chambers with status & license info | `FirmListScreen.tsx` | 406 | `CreateFirmModal`, `LicenseModal`, `RenewModal` | Clean admin client |
| **FirmDetailScreen**| In-depth chamber diagnostics, users, & audit logs | `FirmDetailScreen.tsx` | 828 | `LicenseModal`, `PaymentModal`, `AuditScreen` | Clean admin client |
| **LicenseModal** | Manages plan tiers, user/device limits, pricing | `LicenseModal.tsx` | 982 | `admin-app/src/utils/pricing.ts` | ⚠️ **Duplicates pricing calculation logic** |
| **PlansScreen** | Global plan definitions (Solo, Small, Medium, Large) | `PlansScreen.tsx` | 428 | Shared admin components | None |
| **CreateFirmModal** | Provisions new chamber tenant with trial or plan | `CreateFirmModal.tsx` | 404 | Form validation helpers | None |
| **AuditScreen** | System-wide admin audit log viewer | `AuditScreen.tsx` | 122 | Table components | None |
| **PaymentModal** | Records manual license fee payments | `PaymentModal.tsx` | 128 | Form components | None |
| **RenewModal** | Quick license term extension modal | `RenewModal.tsx` | 111 | Modal components | None |
| **LoginScreen** | Superadmin authentication login form | `LoginScreen.tsx` | 102 | Auth storage helpers | None |

---

## 3. Active Backend: Cloudflare Workers (`server-cloudflare/src/*`)

### A. Route Handlers (`server-cloudflare/src/routes/*`)

| Route Controller | Purpose | Lines | Database Entities & D1 Tables | Invariants Enforced |
| :--- | :--- | :---: | :--- | :--- |
| **admin.ts** | Superadmin firm provisioning, license renewal, quotas | 1,428 | `firms`, `plans`, `admin_audit`, `license_events` | Admin token auth, custom pricing, trial bounds |
| **backup.ts** | Chamber complete JSON export, validation, restore | 1,226 | All 32 tenant tables, `backups_log` | Magic bytes, SHA-256 checksums, atomic restore |
| **physicalFiles.ts**| Physical folder tracking, shelf tags, custody chains | 894 | `physical_files`, `file_movements`, `audit_log` | Monotonic barcodes, holder tracking |
| **clients.ts** | Client profiles, contact KYC, photo byte uploads | 812 | `clients`, `client_photos`, `client_notes`, `audit_log` | Magic byte JPEG/PNG checks, soft delete |
| **hearings.ts** | Court appearances, dates, and mandatory history | 788 | `hearings`, `hearing_date_history`, `audit_log` | Mandatory `hearing_date_history` insert |
| **reminders.ts** | Automatic reminder sync from hearings/tasks/files | 677 | `reminders`, `hearings`, `tasks`, `physical_files` | Per-user scoping, auto-sync within 24h |
| **cases.ts** | Legal matters, stage tracking, case shares | 671 | `cases`, `case_notes`, `case_shares`, `audit_log` | `canUserSeeCase`, supervisor hierarchy |
| **chamberExpenses.ts**| Operational overhead, office rent, staff advances | 601 | `chamber_expenses`, `chamber_advances`, `settlements` | Staff advance balance tracking, void guards |
| **users.ts** | Chamber team members, roles, reporting lines | 580 | `users`, `audit_log` | Hierarchy cycle prevention, seat quotas |
| **tasks.ts** | Action items, assignees, deadlines, case linkages | 445 | `tasks`, `audit_log` | Assignee scoping, completion audits |
| **feePayments.ts** | Payment receipts, partial settlements, invoices | 405 | `fee_payments`, `number_sequences`, `audit_log` | Monotonic receipt sequence per year, immutability |
| **appointments.ts** | Client appointments, attendee links, overlap warnings | 382 | `appointments`, `appointment_attendees`, `audit_log` | Overlap detection, auto-reminders |
| **calendar.ts** | Calendar event aggregations across all entities | 326 | `hearings`, `tasks`, `appointments`, `reminders` | Date range filtering, visibility scoping |
| **feeAgreements.ts**| Agreed fee contracts, payment schedules | 320 | `fee_agreements`, `fee_agreement_changes`, `audit_log` | Agreed amount validation, amendment logging |
| **auth.ts** | Chamber user login, session cookies, sliding session | 217 | `users`, `devices`, `firms`, `audit_log` | SameSite/Secure cookies, device fingerprinting |
| **expenses.ts** | Case-specific disbursements and out-of-pocket costs | 210 | `expenses`, `expense_categories`, `audit_log` | Client reimbursement tracking |

### B. Cloudflare Services & Utilities (`server-cloudflare/src/utils/*`)

| Utility File | Purpose | Lines | Consumed By | Architectural Invariants |
| :--- | :--- | :---: | :--- | :--- |
| **visibility.ts** | Central case visibility (`canUserSeeCase`) | 296 | `cases.ts`, `hearings.ts`, `tasks.ts`, `calendar.ts` | Firm isolation, supervisor chain, restricted view |
| **pricing.ts** | Plan tiers, seat/device costs, trial duration | 171 | `routes/admin.ts` | **Canonical pricing logic** (Solo, Small, Medium, Large) |
| **validation.ts** | Request payload Zod/schema validation | 75 | All route handlers | Strict boundary input validation |
| **audit.ts** | Immutable tenant audit logging helper | 53 | All mutating route handlers | Captures operator, entity, diff (0 secrets) |
| **token.ts** | JWT token generation & verification | 47 | `middleware/auth.ts`, `routes/auth.ts` | HS256 JWT, expiry checking |
| **errors.ts** | Standardized JSON error response formatting | 35 | `middleware/error.ts`, all routes | Consistent `{ error, code, details }` structure |

---

## 4. Retired Legacy Backend (`server/*`)

> **Status**: **RETIRED — DO NOT REFACTOR**.  
> The 7,549-line `server/src/db/client.ts` and Express routes in `server/src/routes/` are frozen and will be decommissioned once Cloudflare Pages and Workers deployment verification is finalized.
