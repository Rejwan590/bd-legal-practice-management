# Physical Files Module

## What it does
Provides physical paper file and case bundle tracking for law chambers in Bangladesh:
- Generates unique auto-incrementing serial codes per firm (format `F-000xxx`, e.g., `F-000101`).
- Links physical document bundles to court cases and clients, or maintains general chamber reference files.
- Tracks custody movements: issuance to advocates/clerks (`CHECKOUT`), return to chamber shelves (`CHECKIN`), and dispatch to courts for motion/hearing hearings (`COURT_DISPATCH`).
- Maintains an immutable timeline of custody movements with timestamps, operator IDs, custodian names, expected return dates, and condition/receipt notes.
- Computes dynamic overdue alerts when a file has not been returned by its `dueBackAt` deadline (`dueBackAt < now && status !== 'in_chamber'`), displaying overdue day counts and alert highlights.
- Enforces strict confidentiality: files tied to restricted cases are hidden from unprivileged staff without `restricted.view`.
- Fully soft-deletes files while preserving movement history and audit trails.

## Invariants it upholds
1. **Auto-Generated Serials**: Auto-incremented per firm prefixed with `F-` followed by zero-padded 6 digits (e.g. `F-000101`).
2. **Custody Immutability**: Every status shift appends an immutable `FileMovementRecord` to `fileMovements` in addition to writing to the audit log.
3. **Overdue Invariant**: Evaluated in real-time (`dueBackAt < now`); chamber files or future due dates are never flagged as overdue.
4. **Confidential Case Isolation**: Files tied to confidential cases are filtered out at the repository query level if the user lacks `restricted.view`.
5. **Authorization Gate**: Requires `files.view` to inspect files/history and `files.manage` to create, edit, checkout, checkin, dispatch, or archive.
