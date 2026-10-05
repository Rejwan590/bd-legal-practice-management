# Foundation Module

## What it does
Provides the core architectural foundation for the legal practice management PWA:
- App Shell with responsive desktop sidebar and mobile navigation drawer.
- Bilingual localization system (English and Bengali / বাংলা) utilizing `react-i18next` with Noto Sans Bengali font.
- Central role-based access control engine (`/src/permissions.ts`) with `can(permission, user)` authorization helper.
- Mock authentication with instant profile switcher between Senior Chamber Partner (Owner - unrestricted) and Junior Associate (Staff - restricted).
- Data abstraction layer in `/src/data` with in-memory store persisted to `localStorage`.
- Immutable audit log repository capturing all write operations, logins, and session switches.
- Chamber settings screen for managing firm details, subscription license status, and staff permission assignments.
- Automated system health check page (`/health`) running invariant self-tests.

## Key Invariants
- Direct access to `localStorage` from UI screens is strictly prohibited; all reads and writes flow through repository interfaces in `/src/data/interfaces.ts`.
- Every database record includes: `id` (UUID), `firmId`, `createdAt`, `updatedAt`, `deletedAt` (soft-delete only), `createdBy`, and `updatedBy`.
- Cross-tenant queries are blocked: all repository queries filter by `context.currentUser.firmId`.
- Permission checking is enforced inside repository methods in addition to UI button state.
