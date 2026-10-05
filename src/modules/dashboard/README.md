# Dashboard & Global Search Module

## What it does
Provides executive chamber oversight and unified cross-entity search for law chambers in Bangladesh:
- **Executive Chamber Overview**: Real-time aggregated statistics across active litigation matters, registered clients, daily court cause list listings, overdue task deadlines, physical paper files in custody, and active chamber alerts.
- **Urgent Attention Engine**: Automatically surfaces overdue task deadlines and overdue physical file returns with borrower name, days late, and one-click completion or shelf check-in.
- **Today's Court Docket & Daily Cause List**: Interactive docket showing courtroom benches, listed purposes, and assigned advocates, with quick print formatting.
- **Upcoming 7 Days Docket**: Chronological preview of approaching court appearances.
- **Chamber Activity Stream**: Real-time immutable audit trail stream showing operator actions, case updates, and file movements.
- **Global Cross-Entity Search**:
  - Unified search indexing Clients, Cases, Hearings, Tasks, and Physical Files (e.g. `F-000xxx` serials).
  - Entity-type filter pills (All, Cases, Clients, Hearings, Tasks, Files).
  - Accessible system-wide via `Ctrl+K` / `⌘K` or top navigation bar.
- **Zero Confidentiality Leakage**:
  - Restricts cases, linked hearings, tasks, and files marked confidential (`restricted: true`) from unauthorized staff lacking `restricted.view` permission.
  - Restricted items are excluded from search results, counts, and urgent matter feeds.
- **Quick Action Shortcuts**: Instant modal dialogs for registering cases, onboarding clients, assigning tasks, and printing cause lists.
