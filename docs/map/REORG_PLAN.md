# Codebase Reorganization Plan (Proposal Only)

> [!IMPORTANT]
> **PROPOSAL ONLY — DO NOT APPLY ANY OF IT IN THIS PHASE.**  
> This plan outlines an architectural cleanup roadmap covering `src/` (frontend), `admin-app/`, and `server-cloudflare/` (Cloudflare Workers + D1).  
> **Notice**: The legacy Node/Postgres backend (`server/`) is **retired — do not refactor**. All backend cleanups apply exclusively to `server-cloudflare/`.  
> Per standing rules, changes are ordered strictly from **lowest risk to highest risk**. Money, billing, auth, and permissions code are placed strictly **last**.

---

## 1. Before vs. Proposed Layout

### Current Layout (Before)

```
src/
├── modules/
│   ├── dashboard/
│   │   ├── chamberExpenses/          # ⚠️ Misplaced: Chamber expenses embedded in dashboard UI
│   │   │   ├── ChamberExpensesCard.tsx
│   │   │   └── ChamberExpensesModal.tsx (1,361 lines)
│   │   └── DashboardScreen.tsx (1,190 lines)
│   ├── cases/
│   │   ├── CaseDetailsView.tsx       # ⚠️ Monolith: 1,559 lines (6 tabs in one component)
│   │   └── CasesScreen.tsx (652 lines)
│   ├── subscription/                 # ⚠️ Dead: Empty directory (0 files)
│   └── foundation/
│       ├── PlaceholderScreen.tsx     # ⚠️ Dead: Unused screen (0 importers)
│       └── NavigationContext.tsx     # ⚠️ Coupling: 939 lines (directly imports 7 modals)
├── utils/
│   ├── date.ts                       # Partial date helper; 8 other files use ad-hoc toLocale*
│   └── pricing.ts                    # ⚠️ Orphan duplicate: 171 lines (0 importers in src/)
admin-app/src/
└── utils/
    └── pricing.ts                    # ⚠️ Duplicate pricing definitions
server-cloudflare/src/
└── routes/
    └── admin.ts                      # ⚠️ Duplicate hardcoded plan tier pricing
```

---

### Proposed Layout (After)

```
src/
├── modules/
│   ├── billing/                      # Consolidated financial & chamber accounting domain
│   │   ├── chamberExpenses/          # Relocated from dashboard/ to billing/
│   │   │   ├── ChamberExpensesCard.tsx
│   │   │   └── ChamberExpensesModal.tsx
│   │   ├── MattersBillingLedger.tsx
│   │   └── BillingScreen.tsx
│   ├── cases/
│   │   ├── details/                  # Modularized Case Dossier tabs (<250 lines each)
│   │   │   ├── CaseOverviewTab.tsx
│   │   │   ├── CaseHearingsTab.tsx
│   │   │   ├── CaseTasksTab.tsx
│   │   │   ├── CaseFilesTab.tsx
│   │   │   ├── CaseNotesTab.tsx
│   │   │   └── CaseActivityTab.tsx
│   │   ├── CaseDetailsView.tsx       # Lightweight tab router/orchestrator (<200 lines)
│   │   └── CasesScreen.tsx
│   ├── dashboard/
│   │   └── DashboardScreen.tsx       # Clean KPI overview importing ChamberExpensesCard from billing
│   └── foundation/
│       └── NavigationContext.tsx     # Decoupled via lazy modal registry or state slots
├── utils/
│   ├── date.ts                       # Canonical Dhaka timezone (Asia/Dhaka, GMT+6) formatter
│   └── pricing.ts                    # Canonical client-side pricing source
admin-app/src/
└── utils/
    └── pricing.ts                    # Synced via parity check script
server-cloudflare/src/
└── utils/
    └── pricing.ts                    # Synced via parity check script
scripts/
└── verify-pricing-parity.mjs         # Fast CI parity check script across apps
```

---

## 2. Reorganization Roadmap (Strict 5-Step Order)

The reorganization is structured into 5 independent branches, starting with pure utility consolidation and deferring financial and state-heavy refactoring to the very end.

```
Step A: Shared Date Helper + Dhaka Timezone  [LOW RISK]
    │
    ▼
Step B: Single Pricing Source of Truth       [LOW RISK]
    │
    ▼
Step C: Move Chamber Expenses to Billing     [MEDIUM RISK]
    │
    ▼
Step D: NavigationContext Modal Decoupling   [MEDIUM RISK]
    │
    ▼
Step E: CaseDetailsView Decomposition        [MEDIUM-HIGH RISK]
```

---

### Step A: One Shared Date Helper + Dhaka Timezone (`Asia/Dhaka`, GMT+6)
- **Goal**: Consolidate date formatting across the app. Eliminate 8 duplicate ad-hoc formatters and raw `toLocaleDateString()` / `toLocaleTimeString()` calls that cause client-timezone mismatches and SSR/hydration discrepancies.
- **Implementation**:
  - Extend `src/utils/date.ts` to expose standardized helpers: `formatDhakaDate()`, `formatDhakaDateTime()`, `formatDhakaTime()`, and `getRelativeDhakaTime()`.
  - Enforce explicit `timeZone: 'Asia/Dhaka'` and bilingual locale (`bn-BD` / `en-GB`) handling.
  - Refactor calling sites across `CasesScreen.tsx`, `HearingsCalendarView.tsx`, `CauseListScreen.tsx`, and `ChamberExpensesModal.tsx`.
- **Files Affected**:
  - `src/utils/date.ts`
  - `src/modules/cases/CasesScreen.tsx`
  - `src/modules/cases/HearingsCalendarView.tsx`
  - `src/modules/court/CauseListScreen.tsx`
  - `src/modules/tasks/TasksScreen.tsx`
- **Risk**: **LOW**. Pure data presentation logic; no database schema or state changes.
- **Protective Tests**:
  - Unit tests for date formatting across DST boundaries and leap years.
  - `npm run test:responsive` (calendar and cause list views).

---

### Step B: Single Pricing Source of Truth
- **Goal**: Eliminate diverged pricing definitions between `src/utils/pricing.ts`, `admin-app/src/utils/pricing.ts`, and `server-cloudflare/src/routes/admin.ts`.
- **Architecture Decision (Shared Package vs. Copy-Check Script)**:
  - ⚠️ *Why a shared npm workspace package is riskier*: Setting up an npm/monorepo workspace package (`@bdlegal/pricing`) requires modifying root `package.json`, adding tsconfig project references, and configuring Cloudflare Workers bundler (`wrangler`) to resolve workspace symlinks. Cloudflare Workers builds often encounter module resolution issues with local symlinked packages.
  - ✅ *Safer Approach*: Maintain canonical pricing schema in `src/utils/pricing.ts` and add a fast pre-commit/CI script (`scripts/verify-pricing-parity.mjs`) that validates 100% byte or AST parity with `admin-app` and `server-cloudflare`. Alternatively, maintain a clean standalone symlink or automated copy script.
- **Files Affected**:
  - `src/utils/pricing.ts`
  - `admin-app/src/utils/pricing.ts`
  - `server-cloudflare/src/routes/admin.ts`
  - `scripts/verify-pricing-parity.mjs`
- **Risk**: **LOW**. Read-only tier definitions (plan names, user limits, monthly/annual BDT fees).
- **Protective Tests**:
  - `npm run lint`
  - `scripts/verify-pricing-parity.mjs`
  - `npm run build` & `npm run build --prefix admin-app`

---

### Step C: Move Chamber Expenses from `dashboard/` to `billing/`
- **Goal**: Move `src/modules/dashboard/chamberExpenses/` to `src/modules/billing/chamberExpenses/` so that all accounting, advances, overheads, and financial ledgers reside in the `billing` domain.
- **Implementation**:
  - Move folder via `git mv src/modules/dashboard/chamberExpenses src/modules/billing/chamberExpenses`.
  - Update import paths in `src/modules/dashboard/DashboardScreen.tsx` (which continues to display `ChamberExpensesCard` as a dashboard widget).
  - Update any direct references in `src/modules/billing/BillingScreen.tsx`.
- **Files Affected**:
  - `src/modules/dashboard/chamberExpenses/ChamberExpensesCard.tsx`
  - `src/modules/dashboard/chamberExpenses/ChamberExpensesModal.tsx`
  - `src/modules/dashboard/DashboardScreen.tsx`
  - `src/modules/billing/BillingScreen.tsx`
- **Risk**: **MEDIUM**. Folder move touches a large component (`ChamberExpensesModal.tsx`, 1,361 lines), but does not alter business logic or state flow.
- **Protective Tests**:
  - `npm run lint`
  - `npm run build`
  - E2E billing and dashboard flows.

---

### Step D: Decouple `NavigationContext` Modal Imports
- **Goal**: `src/modules/foundation/NavigationContext.tsx` is 939 lines and directly imports 7 heavy modal dialogs (`CaseFormModal`, `ClientFormModal`, `PaymentReceiptModal`, `ChamberExpensesModal`, `AppointmentModal`, `TaskModal`, `FileMovementModal`). This tightly couples the foundation layer to domain UI.
- **Implementation**:
  - Decouple modal mounting using React lazy imports (`React.lazy`) or an event-driven modal slot pattern (`ModalOutlet`).
  - Keep `NavigationContext` focused strictly on active route state, navigation parameters, and modal open/close intent flags.
- **Files Affected**:
  - `src/modules/foundation/NavigationContext.tsx`
  - `src/components/modals/ModalOutlet.tsx` (new thin orchestrator)
- **Risk**: **MEDIUM**. Modals are heavily used throughout user interaction flows; must ensure zero regression in modal open/close transitions, backdrop handling, and keyboard Escape listeners.
- **Protective Tests**:
  - `npm run test:responsive`
  - Modal interaction specs in `e2e/`.

---

### Step E: Split `CaseDetailsView.tsx` into Sub-Tab Components
- **Goal**: Decompose `src/modules/cases/CaseDetailsView.tsx` (1,559 lines) into dedicated, single-responsibility tab components under `src/modules/cases/details/`.
- **Implementation**:
  - Extract the 6 tab panels:
    1. `CaseOverviewTab.tsx` (<250 lines): Basic facts, parties, court, section, case status.
    2. `CaseHearingsTab.tsx` (<250 lines): Hearing history, next court date, bench details.
    3. `CaseTasksTab.tsx` (<200 lines): Case-specific task list and assignments.
    4. `CaseFilesTab.tsx` (<200 lines): Physical tracking serial, shelf location, movement log.
    5. `CaseNotesTab.tsx` (<200 lines): Confidential case notes and strategy log.
    6. `CaseActivityTab.tsx` (<200 lines): Audit log and history timeline.
  - Retain `CaseDetailsView.tsx` as a clean coordinator (<200 lines) managing tab selection, header actions, and data fetching via repositories.
- **Files Affected**:
  - `src/modules/cases/CaseDetailsView.tsx`
  - `src/modules/cases/details/*` (new subcomponents)
- **Risk**: **MEDIUM-HIGH** (Money & Permission sensitive). Case view enforces `canUserSeeCase`, restricted view redaction, and links directly to fee agreements and financial ledgers.
- **Protective Tests**:
  - `npm run lint`
  - `npm run build`
  - `npm run test:responsive`
  - Central case visibility tests and case detail navigation specs.
