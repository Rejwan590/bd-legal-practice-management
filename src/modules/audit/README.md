# Audit Log Module

## What it does
Maintains an immutable append-only record of all critical system events across the chamber practice. Records who performed the action, target entity, timestamp, previous state snapshot, and new state snapshot.

## Key Invariants
- Immutable: entries are never updated or deleted.
- Firm-isolated: only returns audit events belonging to the caller's `firmId`.
- Access controlled: strictly limited to users with `settings.manage` permission (Owner role).
- Automatic propagation: all write operations across repositories invoke `auditLogRepo.record()`.

## Connects to
- AuthContext: captures `USER_SWITCH` and `LOGIN` events.
- UserRepository: records permission assignment changes.
- FirmRepository: records chamber identity and address changes.
- Future modules (Clients, Cases, Hearings, Tasks, Files): every create/update/delete registers here.
