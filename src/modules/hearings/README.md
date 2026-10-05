# Hearings Module

## What it does
Provides court appearance schedule and immutable cause list management for Bangladesh law chambers:
- Tracks court appearance dates, procedural purpose (e.g. Written Statement, Framing of Issues, Cross-examination, Arguments), judicial orders, and trial outcomes.
- Supported statuses: `scheduled`, `held`, `adjourned`, `cancelled`.
- Immutable Hearing Date History: When a court hearing date changes, the previous date is never overwritten; an immutable row is appended to `hearing_date_history` capturing old date, new date, stated adjournment reason, operator user, and timestamp.
- One-Step Adjournment: Records today's court order / cost imposed, transitions status to `adjourned`, schedules the next date, and links the change history in one seamless step.
- Case synchronization: Automatically recalculates and synchronizes `case.nextHearingAt` timestamp whenever hearings are created, rescheduled, or adjourned.
- Case Overview: Displays previous, today's, and next scheduled hearing dates on the case dossier.
- Role-based permissions: requires `hearings.update` to create, modify, reschedule, or adjourn hearings.
- Audit Log integration: records every creation, modification, and date reschedule (`HEARING_DATE_CHANGE`) with before/after state diffs.

## Key Invariants
- Direct access to storage is strictly prohibited; all reads and writes flow through `IHearingRepository`.
- BaseRecord schema: `id` (UUID), `firmId`, `createdAt`, `updatedAt`, `deletedAt`, `createdBy`, `updatedBy`.
- Multi-tenant `firmId` isolation enforced on every query.
- Confidentiality isolation: hearings belonging to confidential cases (`case.restricted === true`) are hidden from users lacking `restricted.view`.
- History immutability: `hearing_date_history` records are append-only.

## Connects to
- Cases Module (Stage 3): Hearings bind to `hearing.caseId`, and dynamically update `case.nextHearingAt`.
- Calendar & Reminders (Stage 7): Feeds court appearance dates and automated in-app reminders.
- Dashboard (Stage 8): Powers today's cause list and upcoming hearings list.
