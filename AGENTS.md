# AGENTS.md — Standing Rules for Coding Assistants

Standing rules for all AI coding tools (Antigravity, Claude, Codex, Gemini) working in this repository. Follow strictly.

## 1. Required Read Order
Before starting any task, read these files in order:
1. `AGENTS.md` (this file)
2. `ARCHITECTURE.md` (architectural decisions, security boundaries, invariant rules)
3. `PROGRESS.md` (current implementation status, recent commits, what is done)
4. Domain docs as relevant: `PRD.md`, `DATABASE.md`, `API.md`, `DESIGN.md`, `BUILD_GUIDE.md`

## 2. Hard Invariant Rules (Never Break)
- **Firm Isolation**: Every query on a tenant table MUST filter by `firm_id`. Never trust client-supplied `firmId`; derive strictly from verified session/JWT.
- **Central Visibility**: Always enforce the central case visibility rule (`canUserSeeCase`). Respect `responsible_lawyer_id`, reporting hierarchy (`reports_to_user_id`), supervisor chain, case shares, and `restricted.view`. Never bypass in any route or service.
- **Permission Checks (`can()`)**: Every state-changing route and UI action MUST verify user permissions (`requirePermission` / `requireOwner` / `can(key)`).
- **Soft Deletes Only**: Never run hard `DELETE` queries on tenant business tables. Set `deleted_at = NOW()`, filter with `WHERE deleted_at IS NULL`.
- **Audit Logging**: Every insert, update, or soft-delete on business entities MUST write an `audit_log` row capturing operator identity, entity ID, action, and before/after diff. NEVER log passwords, tokens, session cookies, or raw photo byte payloads.
- **Subscription Read-Only**: Enforce read-only mode when subscription is expired or cancelled (`enforceSubscriptionReadOnly`). Block mutating writes (HTTP 403); keep read and chamber backup export fully available.
- **Hearing Date History**: Never update a hearing date without creating a corresponding `hearing_date_history` row recording old date, new date, reason, and changing user.
- **Atomic Transactions**: Multi-table and cascading writes MUST run inside an atomic database transaction (`db.transaction`).
- **Zod at Boundaries**: Validate all incoming HTTP request bodies, route parameters, and query strings with strict Zod schemas.

## 3. Frontend Architecture Rules
- **Repository Pattern**: Screens and UI components call repositories in `/src/data/repositories`, never raw `fetch` or direct storage.
- **Dual-Mode Parity**: Keep in-memory/mock store and server REST repositories in 100% feature and contract parity.
- **Bilingual i18n Parity**: Zero hardcoded UI strings. Every label, message, validation, and placeholder must exist in both English (`en.json`) and Bangla (`bn.json`) with matching keys.
- **Responsive & Touch Targets**: Minimum touch target size 44×44px on mobile. Fully responsive across 360px (mobile), 768px (tablet), and 1280px (desktop).
- **Accessibility**: Modals and form elements must support keyboard navigation (`Escape`, `Tab` focus trap) and valid semantic ARIA attributes.

## 4. Engineering Process Rules
- **Inspect First**: Always inspect existing schemas, tests, and code before modifying files.
- **Test Before & After**: Run `npm run lint`, `npm test --prefix server`, and `npm run build` to verify clean pass before committing.
- **Update PROGRESS.md**: Document changes, updated checklists, and verification results in `PROGRESS.md` at the end of each session.
- **Total Honesty**: Never report phantom passes or fake test output. Report real errors, skipped suites, and genuine test counts.
- **Conventional Commits**: Commit messages follow conventional commit format (e.g., `feat: ...`, `fix: ...`, `docs: ...`, `refactor: ...`).

## 5. Standard Task Completion Report Format
Every task completion report must include:
1. **Summary of Work**: What was built or fixed.
2. **Files Changed**: Exact paths of files created or modified.
3. **Verification Results**: Command output summary for `npm run lint`, `npm test --prefix server`, and `npm run build`.
4. **Git Commit Details**: Commit hash and message.
5. **Recommended Next Step**: Next logical task according to `BUILD_GUIDE.md`.

## 6. What NOT to Build Yet
Do not introduce or implement:
- Document/file uploads (only small client profile photos ≤300KB are permitted).
- External SMS/email gateways (use stubs / mock channels).
- Online payment gateway integrations (bKash/SSLCommerz manual entry only).
- External calendar synchronization (Google Calendar / Outlook sync postponed).
- Automated court web scraping (manual entry / import of cause list only).
