# Cases Module

## What it does
Provides court case registration, litigation management, and representation dossier for Bangladesh law chambers:
- Tracks court cases with case number, chamber file serial, court/tribunal, matter classification, subject facts summary, plaintiff/petitioner, defendant/respondent, representation role, and opposing counsel.
- Links cases directly to parent Clients (`case.clientId`).
- Confidential / Restricted cases: marks sensitive matters with `restricted: true`. Confidential cases are invisible to staff members unless they explicitly possess `restricted.view` permission (enforced directly in repository queries and retrieval methods).
- Real-time duplicate case detection: warns if a case with the same case number and court already exists in the chamber to prevent duplicate registrations.
- Soft-delete preservation: closing or archiving a case sets `deletedAt` without physically deleting data, preserving linked hearing histories, tasks, and file records.
- Role-based permissions: requires `cases.view` to search/view, `cases.create` to register, `cases.edit` to update, and `cases.delete` to archive.
- Audit Log integration: every case creation, update, and soft-delete logs an immutable event with before/after state diffs.

## Key Invariants
- Direct access to storage is strictly prohibited; all reads and writes flow through `ICaseRepository`.
- BaseRecord schema: `id` (UUID), `firmId`, `createdAt`, `updatedAt`, `deletedAt`, `createdBy`, `updatedBy`.
- Multi-tenant `firmId` isolation enforced on every query.
- Confidentiality isolation: `MockCaseRepository.list` and `getById` filter out `restricted === true` records for users without `restricted.view`.

## Connects to
- Clients Module (Stage 2): Cases are linked to parent clients; Client profile dossier dynamically queries `caseRepo.getByClientId()`.
- Hearings Module (Stage 4): Each case has scheduled court hearings; hearing dates feed `case.nextHearingAt`.
- Tasks Module (Stage 5): Chamber tasks bind to `caseId`.
- Physical Files Module (Stage 6): Tracks paper case file custody for each case serial.
- Calendar & Reminders (Stage 7): Feeds court cause list calendar.
- Dashboard & Global Search (Stage 8): Powers chamber litigation overview and global search.
