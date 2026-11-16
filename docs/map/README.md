# Codebase Map & Architectural Index

This directory provides an architectural map of the **BD Legal Practice Management** monorepo, covering the three core applications: `src/` (Chamber Member Frontend), `admin-app/` (Super Admin Console), and `server/` (Express & Cloudflare Workers Backend).

---

## 10-Line System Overview

1. **Multi-App Monorepo**: Hosts the chamber web application (`src/`), platform superadmin console (`admin-app/`), and multi-runtime backend (`server/` Express + `server-cloudflare/` Worker).
2. **Strict Multi-Tenant Isolation**: Every tenant query enforces `firm_id` derived exclusively from server-verified JWT/session credentials, never trusting client payloads.
3. **Dual-Mode Data Architecture**: Operates seamlessly in either in-memory mock mode (`mockStore.ts`) or server REST mode (`/src/data/repositories/rest/`) with 100% contract parity.
4. **Central Case Visibility**: Access to court cases, hearings, tasks, and ledgers is governed strictly by `canUserSeeCase`, enforcing role precedence, lawyer assignments, and supervisor chains.
5. **Deterministic Legal Data**: Purpose-built for Bangladeshi legal practice, supporting Asia/Dhaka timezone scheduling, court jurisdictions, and case stages.
6. **Financial Invariance**: Enforces immutable BDT payment ledger records, atomic multi-table transactions, and sequential receipt numbers via `number_sequences`.
7. **Hearing Date History**: Strictly tracks every hearing date change in `hearing_date_history`, recording prior dates, new dates, reasons, and user identity.
8. **Soft Deletes Only**: Preserves legal and operational auditability by setting `deleted_at = NOW()` rather than running hard `DELETE` queries on tenant data.
9. **Role-Based Permissions**: Granular capability model (`can('cases.view')`, `can('billing.edit')`) guarding both frontend view rendering and backend API routes.
10. **Bilingual Localization**: Complete user interface parity across English (`en.json`) and Bengali (`bn.json`) without hardcoded strings.

---

## Map File Index

| Document | Primary Focus | Contents |
| :--- | :--- | :--- |
| [**STRUCTURE.md**](./STRUCTURE.md) | Directory Organization | 3-level annotated folder tree mapping UI, data, routes, services, db, tests, and configuration layers. |
| [**MODULES.md**](./MODULES.md) | Feature Boundaries | In-depth inventory of all feature modules in `src/modules`, `admin-app/src/screens`, and server routes/services. |
| [**DEPENDENCIES.md**](./DEPENDENCIES.md) | Architecture Graphs | Mermaid diagrams for frontend module dependencies, server layered architecture, and repository-to-API flows. |
| [**DATA_MODEL.md**](./DATA_MODEL.md) | Schema & Invariants | 33 PostgreSQL/D1 schema tables, complete Mermaid ER diagram, and `firm_id` isolation auditing. |
| [**HOTSPOTS.md**](./HOTSPOTS.md) | Code Smells & Risks | Files >800 lines, core hub modules (>15 importers), orphan files, and recorded failing baseline. |
| [**REORG_PLAN.md**](./REORG_PLAN.md) | Modular Clean-up Plan | Step-by-step proposal and before/after layout trees for refactoring monolithic files (Proposal Only). |

---

## How to Regenerate the Maps

The dependency graphs, module metrics, and code hotspot analysis are generated directly from codebase static analysis via:

```bash
# Run the automated repository map generator
node scripts/map/gen-map.mjs
```

The script scans all `.ts`, `.tsx`, `.js`, and `.mjs` source files, resolves relative and ESM import paths, verifies circularities, and extracts line counts and dependency links.
