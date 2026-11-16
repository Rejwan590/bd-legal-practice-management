# UI/UX Fix Log

**Repository**: `bd-legal-practice-management`  
**Date**: November 2026  
**Auditor & Engineer**: Antigravity Full-Stack Agent  

---

## Issue 1: Sideways Scrolling on Mobile and Small Screens

### Root Cause
1. In `BillingScreen.tsx`, the client balances table used `overflow-x-auto` with fixed table headers and cells having `whitespace-nowrap`, requiring a minimum viewport width of 700px. On phones (360px - 414px), users were forced to scroll sideways.
2. In `CalendarScreen.tsx:998`, the daily hearings table had `-mx-2 sm:mx-0` with `min-w-[560px]`, which actively pulled the container beyond the screen boundary, triggering body horizontal scrollbars.
3. In `DailyCauseListModal.tsx:93`, an inner `-mx-1 sm:mx-0` caused horizontal bleeding in the modal container.

### Fix
- **`BillingScreen.tsx`**: Implemented dual-mode presentation. On mobile devices (`block md:hidden`), balances render as dense, informative cards showing client name, phone, agreed fee, total received, and balance badges. On desktop (`hidden md:block`), the table renders cleanly.
- **`CalendarScreen.tsx`**: Removed negative margin `-mx-2`. Replaced with mobile card layout (`block sm:hidden`) and desktop table (`hidden sm:block`).
- **`DailyCauseListModal.tsx`**: Removed `-mx-1 sm:mx-0`.

---

## Issue 2: Sidebar Navigation Header Misalignment and Content "Jumping"

### Root Cause
In `AppShell.tsx`, the top `<header>` used `max-w-7xl 2xl:max-w-[1536px] mx-auto px-3 sm:px-6 lg:px-8`. However, `getContentWrapperClass()` returned `w-full max-w-none` on some tabs (`cases`, `hearings`, `tasks`, `calendar`, `billing`) and `max-w-7xl mx-auto` on others (`dashboard`, `clients`, `settings`, `health`). 
On screens wider than 1280px (e.g. 1440px or 1536px), navigating between tabs caused the entire sidebar and content container to jump horizontally by over 100px, disconnecting the header brand from the sidebar.

### Fix
- Introduced `SHELL_CONTAINER_CLASS = 'w-full max-w-7xl 2xl:max-w-[1536px] mx-auto px-3 sm:px-6 lg:px-8'`.
- Standardized `<header>`, `getContentWrapperClass()`, and all alert banners (read-only, grace period, expiring soon) to use `SHELL_CONTAINER_CLASS`.
- Structured the desktop navigation sidebar into 3 titled sections (`Practice Management`, `Finance & Accounts`, `Administration`).
- Removed developmental `S{stage}` badges.
- Tightened button padding from `py-2.5` to `min-h-[38px] py-1.5` so all 14 navigation items fit comfortably without vertical scrolling on standard laptop displays.

---

## Issue 3: Excessive Spacing Between UI Elements ("Spaces between infos are wide tighten them")

### Root Cause
Most main screens (`DashboardScreen.tsx`, `CasesScreen.tsx`, `HearingsScreen.tsx`, `ClientsScreen.tsx`, `TasksScreen.tsx`, `FilesScreen.tsx`, `AppointmentsScreen.tsx`, `AuditLogScreen.tsx`, `BackupScreen.tsx`, `HealthScreen.tsx`, `SettingsScreen.tsx`) had an inner wrapper with `space-y-6 max-w-7xl mx-auto` or `space-y-8 max-w-5xl mx-auto`. Because `AppShell` already provided the outer shell container, this created double-centering, large margins, and excessively spaced vertical layouts (`space-y-6` / `space-y-8`).

### Fix
- Replaced inner wrappers with `w-full space-y-4`.
- Tightened card padding across dashboards and KPI summaries from `p-6`/`p-8` down to `p-3.5 sm:p-4` or `p-5 sm:p-6`.
- Tightened grid gaps from `gap-6` to `gap-3 sm:gap-4`.

---

## Issue 4: Hearing Status Translation Leak in Case Dossier

### Root Cause
In `CaseDetailsView.tsx:1053`, the status badge attempted to translate via:
```tsx
t(`hearings.status${h.status.charAt(0).toUpperCase() + h.status.slice(1)}`)
```
If `h.status` had unexpected casing or was undefined, or if the translation key was missing, it leaked untranslated or broken strings. Furthermore, in `bn.json`, `hearings.statusHeld` was untranslated ("Held").

### Fix
- Normalized status casing:
```tsx
const normStatus = (h.status || 'scheduled').toLowerCase();
const statusKey = `hearings.status${normStatus.charAt(0).toUpperCase() + normStatus.slice(1)}`;
t(statusKey, h.status || 'Scheduled')
```
- Updated `src/locales/bn.json` so `hearings.statusHeld` translates accurately to "অনুষ্ঠিত".
- Same normalization applied in `CalendarScreen.tsx`.

---

## Issue 5: System Health Diagnostics "Failures Detected" on 0 Failures

### Root Cause
In `HealthScreen.tsx`, if the test suite had not yet run or if the runner threw an unhandled error, the state fell back to showing a red `FAILURES DETECTED` banner even when 0 checks had failed.

### Fix
- Introduced four explicit states: `running`, `no-results` (neutral banner explaining no diagnostics have been run yet), `pass` (green all passed banner), and `fail` (amber/rose banner when failedCount > 0).
- Wrapped runner in `try/catch` and displayed a clear error state when execution fails.

---

## Issue 6: Task Midnight Timestamps (12:00 AM / 00:00 AM)

### Root Cause
When tasks had only a date assigned (stored as midnight UTC or midnight BST), `TasksScreen.tsx` displayed an irrelevant time badge like "12:00 AM" or "00:00 AM".

### Fix
- Added `isDhakaMidnight(date)` helper in `src/utils/dateUtils.ts`.
- In `TasksScreen.tsx`, suppressed the time label if the deadline falls on midnight BST, showing only the date.

---

## Issue 7: Cancelled Appointments Filtering

### Root Cause
When filtering appointments by `cancelled`, the API default `range: 'upcoming'` omitted past cancelled appointments, resulting in empty views.

### Fix
- In `AppointmentsScreen.tsx`, if `statusFilter === 'cancelled'`, automatically set `range: 'all'`, sort by date descending (newest first), and render filter chips with a "Clear filters" button.

---

## Issue 8: Camera Capture Red Error Fallback

### Root Cause
In `CameraCaptureModal.tsx`, when webcam permissions were denied or when running in a desktop browser without a camera, a harsh red error banner was displayed.

### Fix
- Added a calm file-upload fallback interface when camera hardware is unavailable, eliminating the jarring error banner.

---

## Issue 9: Modals Responsive Scroll Cutoff

### Root Cause
Some legacy modals (`AppointmentFormModal.tsx`, `CaseNotesTab.tsx`, `ClientNotesPanel.tsx`) did not use the central `ResponsiveModal` component or lacked `min-h-0` on their scrollable container, causing form buttons to be cut off on small phone screens.

### Fix
- Added `min-h-0` to `ResponsiveModal.tsx` modal body.
- Migrated legacy modals to use `ResponsiveModal`.
