# Tasks Module

## What it does
Provides chamber workflow delegation, action item tracking, and deadline monitoring for Bangladesh law chambers:
- Associates tasks with specific court cases and/or clients, or creates general chamber office tasks.
- Tracks task title, comprehensive procedural instructions, priority (`urgent`, `high`, `medium`, `normal`, `low`), due date/time, and status (`pending`, `in_progress`, `completed`, `cancelled`).
- **Staff-Partitioned Views**:
  - Staff users (e.g. `Adv. Nusrat Jahan`) view tasks assigned directly to their account to maintain focused workflow and confidentiality.
  - Chamber Owner / Managing Partner (e.g. `Adv. Mahbubur Rahman`) views firm-wide tasks across all associates and staff, and can filter by assignee.
- **Overdue Calculation**: Dynamically computes overdue status if a pending or in-progress task has passed its `dueAt` timestamp, rendering visual urgency indicators (overdue days badge, red scorecard).
- **Task Reassignment**: Reassigns tasks between advocates/staff members with audit trail tracking.
- **Task Completion Workflow**: Marks tasks completed with completion notes/order numbers, recording `completedAt` timestamp.
- **Role-based permissions**:
  - `tasks.view`: required to view tasks.
  - `tasks.assign`: required to create, reassign, update, or soft-delete tasks (held by Owner).
  - `tasks.complete`: allows staff members to complete their assigned tasks.
- **Confidential Case Isolation**: Tasks tied to restricted/confidential cases (`case.restricted === true`) are hidden from unauthorized staff queries without `restricted.view`.
- **Audit Log integration**: Records task assignment (`TASK_ASSIGN`), completion (`TASK_COMPLETE`), and modifications with before/after state diffs.

## Key Invariants
- Direct access to storage is strictly prohibited; all reads and writes flow through `ITaskRepository`.
- BaseRecord schema: `id` (UUID), `firmId`, `createdAt`, `updatedAt`, `deletedAt`, `createdBy`, `updatedBy`.
- Multi-tenant `firmId` isolation enforced on every query.
- Soft-delete data model: deleted tasks retain `deletedAt` timestamp; never hard dropped.

## Connects to
- Cases Module (Stage 3): Tasks bind to `task.caseId`, and display in case details dossier.
- Clients Module (Stage 2): Tasks bind to `task.clientId`, and display in client profile.
- Calendar & Reminders (Stage 7): Feeds task deadlines to chamber calendar.
- Dashboard (Stage 8): Powers overdue tasks summary and pending actions.
