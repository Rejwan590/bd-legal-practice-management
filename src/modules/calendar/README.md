# Calendar & Reminders Module

## What it does
Provides unified chamber agenda scheduling, automated in-app reminders, and daily cause list dockets for Bangladesh law chambers:
- **Aggregated Calendar Feed**: Merges court hearings (`scheduledAt`), task deadlines (`dueAt`), and physical file returns (`dueBackAt`) into a single chronological agenda.
- **Interactive Views**:
  - **Month Grid View**: Interactive 7-day calendar with date badges and counts for hearings, tasks, and file returns.
  - **Agenda / Timeline View**: Chronological order of all firm matters.
  - **Daily Cause List Docket**: Formatted court docket with bench, case number, parties, purpose, and print-ready layout for court clerks.
- **Automated In-App Reminders Engine**:
  - Automatically calculates and triggers reminders for upcoming court hearings (24 hours before), task deadlines (2 hours before), and physical file returns (4 hours before).
  - Reminders inbox with dismiss action.
  - **Hearing Adjournment Invariant**: When a hearing date is changed or adjourned, linked reminders are automatically rescheduled to the new date.
  - **Task Completion Invariant**: When a task is marked completed, linked reminders are automatically cleared/dismissed.
  - **Physical File Return Invariant**: When a file is returned and checked in, linked return reminders are automatically cleared.
- **Confidential Case Isolation**: Calendar events and reminders tied to confidential/restricted cases are concealed from staff lacking `restricted.view`.
- **Staff Role Partitioning**: Staff advocates only view tasks assigned to them and their own reminders, while chamber owners can inspect firm-wide calendars and dockets.
