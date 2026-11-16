# Dependency Graphs & Architecture Layering

This document visualizes the dependencies across the frontend, admin console, and the active **Cloudflare Workers serverless backend**, verified by static analysis and `npx madge`.

> [!NOTE]
> The legacy Express/Postgres backend (`server/`) is **retired and excluded from refactoring**.

---

## 1. Circular Dependencies Analysis

- **Verified by**: `npx madge --circular --extensions ts,tsx src admin-app/src server-cloudflare/src` & `scripts/map/gen-map.mjs`
- **Result**: **0 Circular Dependency Cycles Found** across 199 TypeScript/TSX source files.

---

## 2. Frontend Module-to-Module Coupling Graph

```mermaid
flowchart TD
    subgraph Core ["Core Infrastructure Layer"]
        Foundation["src/modules/foundation<br/>(AppShell, AuthContext, Navigation)"]
    end

    subgraph FeatureModules ["Feature Modules Layer"]
        Dashboard["src/modules/dashboard<br/>(KPI Cards & Daily Agenda)"]
        Cases["src/modules/cases<br/>(Case Dossier)"]
        Clients["src/modules/clients<br/>(Client Profiles)"]
        Billing["src/modules/billing<br/>(Fees, Payments, Ledgers)"]
        Hearings["src/modules/hearings"]
        Tasks["src/modules/tasks"]
        Files["src/modules/files"]
        Calendar["src/modules/calendar"]
        Appointments["src/modules/appointments"]
        Audit["src/modules/audit"]
        Backup["src/modules/backup"]
        Settings["src/modules/settings"]
        Health["src/modules/health"]
        Search["src/modules/search"]
    end

    %% Standard foundation imports
    Cases --> Foundation
    Clients --> Foundation
    Hearings --> Foundation
    Tasks --> Foundation
    Files --> Foundation
    Calendar --> Foundation
    Appointments --> Foundation
    Audit --> Foundation
    Backup --> Foundation
    Settings --> Foundation
    Health --> Foundation
    Search --> Foundation

    %% Problematic Cross-Module Couplings
    Dashboard -.->|imports modals| Cases
    Dashboard -.->|imports modals| Clients
    Dashboard -.->|imports modals| Tasks
    Dashboard -.->|imports modals| Calendar
    Dashboard -.->|imports modals| Appointments
    Billing -.->|imports ChamberExpenses| Dashboard
    Cases -.->|imports BillingTab| Billing
    Clients -.->|imports BillingTab| Billing

    %% Central Navigation Hub Coupling
    Foundation -.->|NavigationContext imports modals| Appointments
    Foundation -.->|NavigationContext imports modals| Cases
    Foundation -.->|NavigationContext imports modals| Clients
    Foundation -.->|NavigationContext imports modals| Hearings
    Foundation -.->|NavigationContext imports modals| Tasks
    Foundation -.->|NavigationContext imports modals| Files
    Foundation -.->|NavigationContext imports modals| Search

    classDef core fill:#e0e7ff,stroke:#4338ca,stroke-width:2px;
    classDef feature fill:#f8fafc,stroke:#64748b,stroke-width:1px;
    class Foundation core;
    class Dashboard,Cases,Clients,Billing,Hearings,Tasks,Files,Calendar,Appointments,Audit,Backup,Settings,Health,Search feature;
```

---

## 3. Active Cloudflare Backend Layers: Routes -> Utils -> D1 Database

```mermaid
flowchart TD
    subgraph WorkerEntrypoint ["Cloudflare Worker Entry (server-cloudflare/src/)"]
        Index["index.ts<br/>(Fetch Dispatcher & CORS)"]
    end

    subgraph MiddlewareLayer ["Worker Middleware (middleware/)"]
        AuthMiddleware["auth.ts<br/>(JWT Cookie & Token Verification)"]
        CorsMiddleware["cors.ts<br/>(Allowed Origins & Credentials)"]
        ErrorMiddleware["error.ts<br/>(Standardized Error Responses)"]
    end

    subgraph RouteControllers ["Route Controllers (routes/)"]
        AdminRoute["admin.ts (1,428 lines)"]
        BackupRoute["backup.ts (1,226 lines)"]
        CaseRoute["cases.ts (671 lines)"]
        ClientRoute["clients.ts (812 lines)"]
        HearingRoute["hearings.ts (788 lines)"]
        FileRoute["physicalFiles.ts (894 lines)"]
        BillingRoute["feeAgreements.ts / feePayments.ts / expenses.ts"]
        ChamberExpenseRoute["chamberExpenses.ts (601 lines)"]
        ReminderRoute["reminders.ts (677 lines)"]
        TaskRoute["tasks.ts (445 lines)"]
        UserRoute["users.ts (580 lines)"]
        AuthRoute["auth.ts (217 lines)"]
    end

    subgraph UtilityLayer ["Core Utilities (utils/)"]
        Visibility["visibility.ts<br/>(canUserSeeCase)"]
        Pricing["pricing.ts<br/>(Canonical Plan & Tier Rules)"]
        AuditUtil["audit.ts<br/>(Structured Diff Logger)"]
        TokenUtil["token.ts<br/>(JWT Signing & Verification)"]
        ValidationUtil["validation.ts<br/>(Zod Request Schemas)"]
    end

    subgraph D1Layer ["D1 SQLite Database (db/)"]
        D1Client["client.ts<br/>(Drizzle D1 Database Factory)"]
        D1Schema["schema.ts<br/>(34 D1 Tables & 104 Indexes)"]
    end

    Index --> MiddlewareLayer
    MiddlewareLayer --> RouteControllers

    %% Routes call Utilities
    CaseRoute --> Visibility
    HearingRoute --> Visibility
    TaskRoute --> Visibility
    ReminderRoute --> Visibility
    AdminRoute --> Pricing
    AuthRoute --> TokenUtil
    RouteControllers --> AuditUtil
    RouteControllers --> ValidationUtil

    %% Routes call D1 Database
    RouteControllers --> D1Client
    D1Client --> D1Schema
```

---

## 4. End-to-End Flow: Frontend Repositories -> REST -> Cloudflare Worker

```mermaid
flowchart LR
    subgraph UI ["Frontend Screens (src/modules/)"]
        CaseView["CasesScreen / CaseDetailsView"]
        ClientView["ClientsScreen / ClientProfileView"]
        BillingView["BillingScreen / MattersBillingLedger"]
        FileView["FilesScreen"]
    end

    subgraph FrontendRepo ["Repository Layer (src/data/repositories/)"]
        RepoFacade["getRepositories()"]
        RestCase["restCase.ts"]
        RestClient["restClient.ts"]
        RestAccounts["restAccounts.ts"]
        RestFiles["restFile.ts"]
        RestCommon["restCommon.ts<br/>(Fetch / Credentials)"]
    end

    subgraph CFEndpoints ["Cloudflare Worker Endpoints (server-cloudflare/)"]
        CFCases["GET/POST /api/v1/cases"]
        CFClients["GET/POST /api/v1/clients"]
        CFBilling["GET/POST /api/v1/fee-agreements<br/>GET/POST /api/v1/fee-payments"]
        CFFiles["GET/POST /api/v1/physical-files"]
    end

    subgraph D1Storage ["Cloudflare D1 Database"]
        D1DB["D1 SQLite Database (34 Tables)"]
    end

    UI --> RepoFacade
    RepoFacade --> RestCase
    RepoFacade --> RestClient
    RepoFacade --> RestAccounts
    RepoFacade --> RestFiles

    RestCase --> RestCommon
    RestClient --> RestCommon
    RestAccounts --> RestCommon
    RestFiles --> RestCommon

    RestCase -->|HTTP JSON| CFCases
    RestClient -->|HTTP JSON| CFClients
    RestAccounts -->|HTTP JSON| CFBilling
    RestFiles -->|HTTP JSON| CFFiles

    CFCases --> D1DB
    CFClients --> D1DB
    CFBilling --> D1DB
    CFFiles --> D1DB
```
