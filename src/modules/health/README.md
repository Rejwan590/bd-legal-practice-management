# System Health & Diagnostic Suite

## What it does
Provides automated self-testing across all architectural rules defined in `ARCHITECTURE.md`.
Verifies that:
- Chamber context is correctly initialized.
- Owner role has all 17 permission keys.
- Staff role has strictly partitioned permissions.
- Repository layer stops unauthorized staff calls directly, without relying solely on UI button disabling.
- Firm ID isolation prevents multi-tenant leaks.
- Entity soft-delete contracts are respected (soft delete with `deletedAt`, no physical removal).
- Immutable audit trail records every operation.
- Dual English/Bangla localization bundles are loaded.

## How to use
Visit the `/health` screen at any time to re-run the diagnostic checks and inspect results before advancing to the next development stage.
