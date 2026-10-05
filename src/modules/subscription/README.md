# Subscription & Read-Only Enforcement Module (Stage 10)

## What it does
Provides chamber subscription lifecycle tracking, automated license expiry evaluation, multi-state alert banners, and strict enforcement of **Rule 8 ("Expired subscription = read-only. Data stays viewable and exportable")** across the practice management application:

- **Subscription Lifecycle States (`evaluateSubscription`)**:
  - **Active**: License is valid (>14 days remaining). Full read-write chamber operations.
  - **Expiring Soon**: License expires within 14 days. Displays an amber banner with exact days remaining and one-click renewal trigger. Normal chamber operations continue uninterrupted.
  - **5-Day Grace Period (`LICENSE_GRACE_PERIOD_DAYS = 5`)**:
    - Triggered immediately after `licenseExpiresAt` timestamp passes.
    - Displays a prominent red warning banner: *"License expired, X days of grace left"*.
    - **Chamber operations remain 100% functional**: Advocates and staff can continue creating/editing cases, scheduling hearings, assigning tasks, and moving physical files without disruption.
  - **Expired / Read-Only Mode**:
    - Activated when the 5-day grace period has elapsed (or if status is `suspended`).
    - Displays a persistent deep-red header banner informing staff that the chamber is in read-only mode with the expiration date and renewal action.
- **Rule 8 Repository Read-Only Gating (`assertNotReadOnly`)**:
  - Gating is strictly enforced at the data layer in `/src/data/repositories.ts` before any mutating operation.
  - **Blocked Write Operations**:
    - Client creation, modification, archival, and deletion.
    - Case creation, dossier edits, status changes, and deletion.
    - Hearing scheduling, updates, and adjournment date changes.
    - Task assignment, reassignment, and completion.
    - Physical file registration, custody checkout/checkin, and location updates.
    - User permission modifications (`updatePermissions`).
    - Database disaster recovery restore (`restoreBackup`).
  - **Preserved Operations (Unrestricted Access)**:
    - **Data Viewability**: All cases, clients, hearings, cause lists, tasks, files, and calendar events remain fully queryable and readable.
    - **Global Search**: Multi-entity instant cross-chamber search functions normally.
    - **Backup Snapshots**: Chamber data can still be exported at any time into SHA-256 signed and encrypted snapshots.
    - **License Renewal**: Chamber owners can renew subscription at any time, immediately restoring full write capabilities.
- **Renewal Workflow (`SubscriptionRenewModal`)**:
  - Chamber Owner can select 1-month, 6-month, or 12-month extension packages.
  - Atomically calculates new `licenseExpiresAt` relative to previous expiry or current time.
  - Records an immutable `SUBSCRIPTION_RENEW` event in the audit trail.
  - Instantly unblocks repository write operations across the chamber.

## Key Invariants
- Direct access to storage is strictly prohibited; all checks occur through `assertNotReadOnly(firmId)`.
- Rule 8 contract: Data is never held hostage; reads, queries, and backup exports are permanently accessible.
- Multi-tenant `firmId` isolation: License status affects only the target chamber firm.
- Automated audit log propagation: Every renewal is timestamped and attributed to the authorizing owner.

## Connects to
- **Foundation / AuthContext**: Evaluates subscription in real time and broadcasts `subscription` and `isReadOnly` state.
- **AppShell**: Renders responsive top-level banners for Expiring Soon, Grace Period, and Read-Only modes.
- **Settings Screen**: Displays validity cards, license status badges, and renewal triggers.
- **Repositories (`/src/data`)**: Intercepts writes with `assertNotReadOnly`.
- **Audit Log**: Captures `SUBSCRIPTION_RENEW` records for accountability.
- **Health Suite (`/src/modules/health/HealthScreen.tsx`)**: 11 dedicated automated tests validating all lifecycle transitions, grace period writes, read-only blocks, and unblocked queries/exports.
