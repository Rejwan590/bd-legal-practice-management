# Repository Structure & Layer Map

This document describes the directory tree down to 3 levels across the workspace, annotating each directory's architectural purpose, assigned layer, and flags for mixed concerns.

> [!IMPORTANT]
> **Primary Backend Notice**: `server-cloudflare/` (Cloudflare Workers + D1) is the **ONLY active production backend**.  
> The legacy Node.js/Express implementation in `server/` is **RETIRED — DO NOT REFACTOR**.

---

## Workspace Directory Tree (3 Levels Deep)

```
.
├── admin-app/                             # [App 2] Super Admin Console application
│   ├── public/                            # Static public web assets [Layer: UI / Assets]
│   └── src/                               # Superadmin React TypeScript source [Layer: UI / Admin]
│       ├── components/                    # Reusable administrative UI components [Layer: UI]
│       ├── screens/                       # Top-level admin screens and workflow modals [Layer: UI]
│       └── utils/                         # Date formatting, pricing and network helpers [Layer: Shared / Utility]
├── docs/                                  # Documentation and architectural records
│   ├── archive/                           # Historical reports and superseded documentation [Layer: Docs]
│   │   └── reports/                       # 25 archived audit, fix, and release markdown logs [Layer: Docs]
│   ├── cloudflare-migration/              # Cloudflare D1/Worker architecture documentation [Layer: Docs]
│   ├── map/                               # Codebase architecture, structure, and dependency maps [Layer: Docs]
│   └── prompts/                           # Master prompt records and task briefs [Layer: Docs]
├── e2e/                                   # Playwright end-to-end integration test suites [Layer: Test]
├── scripts/                               # Maintenance, seed, and development tooling scripts
│   └── map/                               # Codebase mapping and dependency graph generator [Layer: Tooling]
├── server/                                # [RETIRED / DO NOT REFACTOR] Legacy Node.js Express backend
│   ├── drizzle/                           # Legacy PostgreSQL Drizzle migrations [Layer: Retired]
│   ├── src/                               # Legacy Express routes, services, db adapter [Layer: Retired]
│   └── tests/                             # Legacy server integration tests [Layer: Retired]
├── server-cloudflare/                     # [App 3] Active Production Backend (Cloudflare Worker + D1)
│   ├── src/                               # Worker TypeScript source code [Layer: Serverless Server]
│   │   ├── db/                            # D1 SQLite Drizzle schema (34 tables, 104 indexes) & client [Layer: DB]
│   │   ├── middleware/                    # Worker auth (JWT cookie), CORS, error handling [Layer: Middleware]
│   │   ├── routes/                        # 16 route controllers (admin, cases, clients, etc.) [Layer: Route]
│   │   └── utils/                         # Token, pricing, audit, validation, visibility helpers [Layer: Utility]
│   └── tests/                             # Cloudflare backend end-to-end tests [Layer: Test]
├── src/                                   # [App 1] Chamber Member Web Application (Vite + React)
│   ├── components/                        # Shared UI components and primitives [Layer: UI]
│   │   ├── responsive/                    # Responsive modals, tables, and pagination [Layer: UI]
│   │   └── ui/                            # Basic primitives (buttons, badges, inputs) [Layer: UI]
│   ├── data/                              # Repository abstraction and data management layer [Layer: Data / Repository]
│   │   └── repositories/                  # Dual-mode repository implementations [Layer: Data / Repository]
│   │       └── rest/                      # HTTP client fetch implementations for REST mode [Layer: Data / REST]
│   ├── i18n/                              # Internationalization loader and context [Layer: UI / i18n]
│   ├── locales/                           # Bilingual translation JSON files (en.json, bn.json) [Layer: Config / i18n]
│   ├── modules/                           # Domain feature modules (views, forms, local components) [Layer: UI]
│   │   ├── appointments/                  # Client appointments & schedule management [Layer: UI]
│   │   ├── audit/                         # Audit trail inspection screen [Layer: UI]
│   │   ├── backup/                        # Chamber data backup and restore screen [Layer: UI]
│   │   ├── billing/                       # Fee agreements, payment records & ledgers [Layer: UI]
│   │   ├── calendar/                      # Cause list and legal calendar views [Layer: UI]
│   │   ├── cases/                         # Case dossier, court cases & sharing [Layer: UI]
│   │   ├── clients/                       # Client profiles & contact records [Layer: UI]
│   │   ├── dashboard/                     # Chamber KPI cards & operational summaries [Layer: UI] (⚠️ MIXED)
│   │   ├── files/                         # Physical case file catalog and custody tracking [Layer: UI]
│   │   ├── foundation/                    # AppShell, Auth, Navigation & global state [Layer: UI / Core] (⚠️ MIXED)
│   │   ├── health/                        # System diagnostics & test runner screen [Layer: UI / Test] (⚠️ MIXED)
│   │   ├── hearings/                      # Court hearing dates and outcome forms [Layer: UI]
│   │   ├── search/                        # Global search modal dialog [Layer: UI]
│   │   ├── settings/                      # Chamber preferences, licenses & staff setup [Layer: UI]
│   │   ├── subscription/                  # Empty placeholder folder [Layer: Unused / Dead] (⚠️ UNUSED)
│   │   └── tasks/                         # Case and chamber action item management [Layer: UI]
│   └── utils/                             # Shared client utilities (dates, printing, pricing) [Layer: Utility]
└── tests/                                 # Frontend unit and translation parity test suites [Layer: Test]
```

---

## Directory Layer Categorization Summary

| Layer | Folder Paths | Purpose |
| :--- | :--- | :--- |
| **UI** | `src/components/`, `src/modules/*`, `admin-app/src/screens/` | Renders user interface, forms, modals, tables, and dashboards. |
| **Data / Repository**| `src/data/`, `src/data/repositories/`, `src/data/repositories/rest/` | Abstracts data access between in-memory `mockStore` and REST API. |
| **Active Server** | `server-cloudflare/src/` | Cloudflare Worker endpoints, D1 SQLite database, and middleware. |
| **Retired Server** | `server/` | **Retired — do not refactor**. Legacy Express/Postgres backend. |
| **DB (D1)** | `server-cloudflare/src/db/` | SQLite/D1 Drizzle schema (34 tables, 104 indexes) and client adapter. |
| **Test** | `tests/`, `e2e/`, `server-cloudflare/tests/`, `server/tests/` | Unit, responsive, and backend end-to-end tests. |
| **Config / i18n** | `src/locales/`, `src/i18n/`, `.env*` | Bilingual translation JSONs, runtime environment parameters. |
| **Docs** | `docs/`, `docs/archive/`, `docs/map/`, `docs/prompts/` | System architecture, mapping, task prompts, and archived logs. |
| **Tooling** | `scripts/` | Seed data scripts, health check runners, and map generators. |

---

## Folders with Mixed or Problematic Purposes (Flagged)

1. **`server/` (Flag: ⚠️ RETIRED CODEBASE — DO NOT REFACTOR)**
   - The legacy Express Node.js application and its 7,549-line `client.ts` are retired. All ongoing backend execution and production deployment runs exclusively on `server-cloudflare/`.
2. **`src/modules/dashboard/` (Flag: ⚠️ MISPLACED FINANCIAL UI)**
   - Embeds chamber operational expense models and modals (`chamberExpenses/ChamberExpensesModal.tsx`, `ChamberExpensesCard.tsx`). These belong in `src/modules/billing/`.
3. **`src/modules/foundation/` (Flag: ⚠️ MIXED CONCERN & BOTTLENECK)**
   - Mixes fundamental app frame logic (`AppShell.tsx`, `AuthContext.tsx`, `NavigationContext.tsx`) with temporary developer tooling (`UserSwitchModal.tsx`). `NavigationContext.tsx` directly imports 7 feature modals.
4. **`src/modules/health/` (Flag: ⚠️ TEST HARNESS IN PRODUCTION UI)**
   - Contains 17 files (~4,758 lines) implementing an in-browser test runner bundled directly into the production web bundle.
5. **`src/modules/subscription/` (Flag: ⚠️ EMPTY UNUSED DIRECTORY)**
   - Completely empty folder (0 files). Subscription evaluation is handled in `src/permissions.ts`.
