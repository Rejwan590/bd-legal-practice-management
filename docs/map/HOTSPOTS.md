# Architectural Hotspots & Risk Register

This document tracks files exceeding the 800-line threshold, high-fan-in hub files (>15 importers), orphan files with zero importers, and records the known failing baseline.

---

## 1. Monolithic Files Over 800 Lines

| Rank | File Path | Lines | Importers | Architectural Risk & Recommended Action |
| :---: | :--- | :---: | :---: | :--- |
| 1 | `server/src/db/client.ts` | 7,549 | 53 | **CRITICAL MONOLITH**: Dual database adapter. Split into domain delegates under `memory/` and `postgres/`. |
| 2 | `server-cloudflare/tests/cloudflareBackend.test.ts` | 2,621 | 0 | **TEST MONOLITH**: All Cloudflare tests in single file. Split into route-specific test suites. |
| 3 | `src/modules/cases/CaseDetailsView.tsx` | 1,559 | 2 | **UI MONOLITH**: Embeds 6 tabs in one file. Split into modular `Case*Tab.tsx` components. |
| 4 | `src/data/syntheticData.ts` | 1,538 | 2 | **SEED FACTORY**: Large fixture generator. Keep intact as development utility. |
| 5 | `src/modules/settings/SettingsScreen.tsx` | 1,434 | 1 | **UI MONOLITH**: Combines profile, chamber users, licensing, and security. Split into sub-settings views. |
| 6 | `server-cloudflare/src/routes/admin.ts` | 1,428 | 1 | **ROUTER MONOLITH**: Admin handler. Decompose into `adminFirms`, `adminLicenses`, `adminMetrics`. |
| 7 | `src/modules/dashboard/chamberExpenses/ChamberExpensesModal.tsx` | 1,361 | 2 | **MISPLACED FINANCIAL UI**: Lives under `dashboard/`. Relocate to `modules/billing/` and decompose tabs. |
| 8 | `src/data/repositories/accounts.ts` | 1,352 | 3 | **REPO MONOLITH**: Bundles agreements, payments, expenses, ledgers. Split into dedicated account repos. |
| 9 | `src/modules/calendar/CalendarScreen.tsx` | 1,295 | 1 | **UI COMPLEXITY**: Handles month, week, day, agenda, causelist views. Extract view modes into sub-views. |
| 10 | `src/data/mockStore.ts` | 1,250 | 36 | **STATE HUB**: High coupling. Split in-memory collections into isolated domain store slices. |
| 11 | `server-cloudflare/src/routes/backup.ts` | 1,226 | 1 | **BACKUP ENGINE**: Large JSON export/import handler. Extract schema validator and checksum modules. |
| 12 | `src/modules/dashboard/DashboardScreen.tsx` | 1,190 | 1 | **CROSS-COUPLING**: Directly imports 5 feature modals. Refactor to event/route dispatching. |
| 13 | `src/modules/clients/ClientProfileView.tsx` | 1,182 | 2 | **UI COMPLEXITY**: Decompose into overview, case list, and client notes tab subcomponents. |
| 14 | `server/src/routes/adminFirms.ts` | 1,169 | 1 | **EXPRESS MONOLITH**: Decompose superadmin firm actions into service-backed controllers. |
| 15 | `src/modules/hearings/HearingsScreen.tsx` | 1,143 | 1 | **UI COMPLEXITY**: Extract cause list table, hearing filters, and bulk action toolbar. |
| 16 | `src/modules/billing/MattersBillingLedger.tsx` | 1,134 | 3 | **FINANCIAL UI**: Extract payment history table, agreement terms card, and receipt drawer. |
| 17 | `server/tests/foundation.test.ts` | 1,085 | 0 | **TEST SUITE**: Integration suite covering auth, CSRF, and devices. Keep intact. |
| 18 | `src/modules/files/FilesScreen.tsx` | 1,016 | 1 | **UI COMPLEXITY**: Decompose file inventory table and custody movement history drawer. |
| 19 | `server/tests/accounts.test.ts` | 1,012 | 0 | **TEST SUITE**: Comprehensive financial accounts backend test suite. Keep intact. |
| 20 | `src/modules/tasks/TasksScreen.tsx` | 993 | 1 | **UI COMPLEXITY**: Extract task filters, Kanban/list view toggle, and task status cards. |
| 21 | `admin-app/src/screens/LicenseModal.tsx` | 982 | 2 | **ADMIN UI**: Decompose plan picker, device quota slider, and price calculation breakdown. |
| 22 | `src/modules/foundation/AppShell.tsx` | 966 | 1 | **APP FRAME**: Decompose sidebar navigation, header user menu, and mobile bottom drawer. |
| 23 | `src/modules/foundation/NavigationContext.tsx` | 939 | 20 | **COUPLING BOTTLENECK**: Directly imports 7 feature modals. Decouple modal registry. |
| 24 | `server-cloudflare/src/routes/physicalFiles.ts` | 894 | 1 | **ROUTER COMPLEXITY**: Extract file movement history logic into a file service. |
| 25 | `src/data/repositories/case.ts` | 886 | 6 | **REPO COMPLEXITY**: Move case notes and case shares queries into dedicated sub-repositories. |
| 26 | `admin-app/src/screens/FirmDetailScreen.tsx` | 828 | 1 | **ADMIN UI**: Extract firm diagnostics tab and firm user management tab. |
| 27 | `server/src/db/schema.ts` | 827 | 16 | **SCHEMA HUB**: Contains all 33 PostgreSQL tables. Split by domain into `schemas/` folder. |
| 28 | `server/src/routes/users.ts` | 827 | 1 | **ROUTER COMPLEXITY**: Extract user hierarchy and role assignment into `userService`. |
| 29 | `server-cloudflare/src/db/schema.ts` | 823 | 28 | **D1 SCHEMA HUB**: Mirrors Postgres schema. Split identically to Postgres schema. |
| 30 | `server-cloudflare/src/routes/clients.ts` | 812 | 1 | **ROUTER COMPLEXITY**: Extract client photo base64/binary handler into service. |

---

## 2. Core Hub Files (>15 Importers)

These files have extreme fan-in. Changes to them propagate across the entire repository:

| File Path | Importer Count | Total Lines | Architectural Role | Recommendation |
| :--- | :---: | :---: | :--- | :--- |
| `src/data/types.ts` | 107 | 720 | Central TypeScript domain type definitions | High stability required; do not introduce circular dependencies. |
| `server/src/db/client.ts` | 53 | 7,549 | Backend database adapter | Split implementation delegates; retain `IDatabase` contract as shim. |
| `src/data/repositories.ts` | 47 | 6 | Top-level repository factory facade | Keep clean and lightweight (<20 lines). |
| `src/modules/foundation/AuthContext.tsx`| 46 | 320 | Global user session & permissions context | Maintain backward compatibility; protect login invariants. |
| `src/components/responsive/ResponsiveModal.tsx` | 36 | 126 | Universal responsive dialog primitive | Stable design system component. |
| `src/data/mockStore.ts` | 36 | 1,250 | In-memory database store | Break into domain slice stores to reduce coupling. |
| `src/permissions.ts` | 36 | 221 | Permission checks & subscription evaluator | Core security invariant; require 2 review passes. |
| `src/utils/dateUtils.ts` | 35 | 336 | Asia/Dhaka legal timezone date formatter | Make canonical; eliminate competing date formatters. |
| `src/data/interfaces.ts` | 33 | 724 | Repository interface contracts | Keep interface signatures stable during refactors. |
| `server/src/middleware/auth.ts` | 30 | 226 | Express session cookie & JWT verification | Security barrier; protect timing attack defenses. |
| `server-cloudflare/src/db/schema.ts` | 28 | 823 | Cloudflare D1 table definitions | Keep in 100% parity with Express Postgres schema. |
| `server-cloudflare/src/db/client.ts` | 25 | 210 | Cloudflare D1 database client wrapper | Maintain interface parity. |
| `server-cloudflare/src/middleware/auth.ts`| 22 | 162 | Worker auth middleware | Maintain cookie options parity. |
| `src/data/repositories/rest/restCommon.ts`| 21 | 156 | Base REST fetcher with credentials | Stable HTTP transport layer. |
| `server/src/app.ts` | 20 | 137 | Express application router pipeline | Keep route registration minimal. |
| `src/modules/foundation/NavigationContext.tsx` | 20 | 939 | Global navigation state & tab coordinator | Decouple modal imports via dynamic loading. |
| `server-cloudflare/src/utils/audit.ts` | 18 | 53 | Worker audit log helper | Maintain structured diff logging. |
| `server/src/config.ts` | 17 | 139 | Server startup validation & env configs | Protect JWT secret length and database URL guards. |
| `server/src/db/schema.ts` | 16 | 827 | Postgres ORM table definitions | Core schema hub. |

---

## 3. Orphan Files (0 Importers)

Files that have zero incoming import references across the repository:

| File Path | Lines | Category | Recommendation |
| :--- | :---: | :--- | :--- |
| `src/utils/pricing.ts` | 171 | **Redundant Duplicate** | Complete duplicate of server pricing logic with zero importers in `src/`. Safe to delete. |
| `src/modules/foundation/PlaceholderScreen.tsx` | 96 | **Dead Code** | Unreferenced placeholder screen. Safe to delete. |
| `src/components/responsive/index.ts` | 4 | **Unused Barrel** | Re-exports components that are imported directly from subfiles. Clean up barrel. |
| `server/drizzle.config.ts` | 13 | **Tooling Config** | Standalone Drizzle ORM CLI configuration. Keep intact. |
| `server-cloudflare/drizzle.config.ts` | 8 | **Tooling Config** | Standalone Drizzle ORM CLI configuration for Cloudflare. Keep intact. |
| `playwright.config.ts` | 17 | **Test Config** | Root Playwright test suite configuration. Keep intact. |
| `admin-app/src/vite-env.d.ts` | 2 | **Type Declaration** | Ambient TypeScript type definitions for Vite client. Keep intact. |

---

## 4. Known Failing Baseline (Protected — Do Not Touch)

Per standing rules, these known failing baseline tests and missing translation keys are cataloged here for traceability and must NOT be edited in this phase:

### A. Failing E2E Integration Tests (12 Failures)
1. `e2e/calendarExpandMore.spec.ts` @ 768px: Month grid "+N more" expand/collapse and interactions.
2. `e2e/calendarExpandMore.spec.ts` @ 1024px: Month grid "+N more" expand/collapse and interactions.
3. `e2e/calendarExpandMore.spec.ts` @ 1280px: Month grid "+N more" expand/collapse and interactions.
4. `e2e/responsive.spec.ts` @ 320px: Case Dossier Modals horizontal scroll test.
5. `e2e/responsive.spec.ts` @ 360px: Case Dossier Modals horizontal scroll test.
6. `e2e/responsive.spec.ts` @ 375px: Case Dossier Modals horizontal scroll test.
7. `e2e/responsive.spec.ts` @ 768px: Case Dossier Modals horizontal scroll test.
8. `e2e/responsive.spec.ts` @ 1024px: Case Dossier Modals horizontal scroll test.
9. `e2e/responsive.spec.ts` @ 1280px: Case Dossier Modals horizontal scroll test.
10. `e2e/responsive.spec.ts` @ 1440px: Case Dossier Modals horizontal scroll test.
11. `e2e/responsive.spec.ts` @ 1920px: Case Dossier Modals horizontal scroll test.
12. `e2e/responsive.spec.ts`: Deep Link, Refresh Persistence & Browser Back Navigation.

### B. Missing i18n Translation Keys (13 Violations in `src/modules/billing/*`)
1. `common.saveChanges` (`AddExpenseModal.tsx:194`, `EditAgreementModal.tsx:122`)
2. `common.close` (`BillingRecordDetailModal.tsx:229`)
3. `common.viewDetails` (`MattersBillingLedger.tsx:678`, `:811`, `:920`)
4. `clients.client` (`AddExpenseModal.tsx:211`, `BillingRecordDetailModal.tsx:249`, `CreateAgreementModal.tsx:168`, `MattersBillingLedger.tsx:635`, `:780`, `:888`, `RecordPaymentModal.tsx:235`)
