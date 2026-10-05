# Settings Module

## What it does
Provides administration of the chamber's identity, bar council credentials, court jurisdictions, advocate/staff roster, granular permission assignment, and subscription validity.

## Key Invariants
- Modifications to chamber profile require `settings.manage` permission.
- Modifications to staff permissions require `users.manage` permission.
- All changes create corresponding entries in the immutable `audit_log`.
- Interface language toggle immediately syncs with `localStorage` and `react-i18next`.

## Connects to
- `FirmRepository`: loads and updates firm profile records.
- `UserRepository`: lists and updates permissions for advocates and staff.
- `AuditLogRepository`: receives records whenever firm info or permissions change.
- `AuthContext`: refreshes global session permissions dynamically when changes occur.
