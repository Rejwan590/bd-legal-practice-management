# PRD.md — Product Requirements Document

## 1. Executive Summary & Problem Statement

### 1.1 Context
In Bangladesh, law practice management relies heavily on physical paper registers (*sheresta diaries*), court cause lists published on physical boards or late-afternoon PDF bulletins, and manual coordination among senior advocates, junior associates, chamber clerks (*moharrirs*), and clients. 

Chambers face severe operational bottlenecks:
- **Missed Hearing Dates**: Missing a peremptory hearing or step date (*tadbir*) can result in dismissals for default (*kharij*) or ex-parte decrees.
- **Lost Physical Briefs**: Files moving between courtrooms, associates, and chamber shelves get misplaced without custody tracking.
- **Fragmented Client Communication**: Clerks and junior advocates frequently receive repetitive calls regarding case status, next dates, and court locations.
- **Bilingual Divide**: While statutory court pleadings and cause lists frequently use both English and Bangla, clerical staff and clients rely primarily on Bangla.

### 1.2 Target Audience
1. **Senior Advocates / Chamber Owners**: Sole proprietorships and partnership law firms managing active litigation across Lower Judiciary (Magistrate and Judge Courts) and Supreme Court (High Court Division).
2. **Associate Lawyers (Senior & Junior)**: Requiring daily task assignments, hearing appearances, case briefing, and calendar coordination.
3. **Chamber Clerks (*Moharrirs*) & Apprentices**: Tracking physical files, noting dates from court order sheets, taking down causes, and coordinating client visits.
4. **Software Platform Administrators (Super Admins)**: Managing firm licensing, device approvals, payments, and platform integrity.

---

## 2. User Roles, Team Hierarchy & Permissions

### 2.1 System Roles & Job Types
- **Owner**: Full administrative control over firm settings, user seats, visibility mode, and all cases.
- **Staff**: Role assigned to all other chamber members with granular configurable permissions.
- **Job Types**:
  - `lawyer_senior`: Senior associates with independent case responsibilities.
  - `lawyer_junior`: Junior advocates handling hearings and drafting.
  - `clerk`: Chamber clerks handling court steps, file movements, and dates.
  - `receptionist`: Managing front-desk appointments and client intake.
  - `intern`: Apprentices assisting with research and dossier review.
  - `other`: Non-standard staff designations.

### 2.2 Reporting Hierarchy & Central Case Visibility Rule
Chambers can operate in two visibility modes:
1. **`open` Mode**: Every non-restricted case is visible to all active chamber members.
2. **`team` Mode**: Case access is strictly restricted based on hierarchy and assignment.

**The Central Visibility Rule** (`canUserSeeCase`):
A user can view a case if and only if:
1. User is firm `Owner`; OR
2. Firm `visibility_mode` is `'open'`; OR
3. User is the assigned `responsible_lawyer_id`; OR
4. User reports directly or transitively to the responsible lawyer (`reports_to_user_id` chain); OR
5. User is above the responsible lawyer in the supervisory chain; OR
6. User created the case (`created_by`); OR
7. The case is explicitly shared with the user via `case_shares`.
*Confidentiality Rule*: Restricted cases (`restricted = true`) additionally require the `restricted.view` permission or `Owner` role regardless of visibility mode.

### 2.3 Granular Permissions
- `cases.view`, `cases.create`, `cases.edit`, `cases.delete`
- `hearings.update`
- `clients.view`, `clients.edit`
- `appointments.view`, `appointments.manage`
- `tasks.view`, `tasks.assign`, `tasks.complete`
- `files.view`, `files.manage`
- `billing.view`
- `settings.manage`
- `users.manage`
- `restricted.view`
- `data.export`

---

## 3. Core Entities & Feature Specifications

### 3.1 Clients Module `[BUILT]`
- **Client Profiles**: Full contact information, bilingual names (`name`, `nameBn`), phone numbers, email, chamber notes, and archive status.
- **Client Profile Photo `[BUILT]`**:
  - Canvas-based client-side resize to ≤400px on longest side, stripping EXIF metadata.
  - Storage in `client_photos` table, ≤300KB limit.
  - Strict magic-byte validation (`image/jpeg`, `image/webp`, `image/png`).
  - Private HTTP caching, client-visibility checks, and zero image payload in audit logs.
- **Client Notes `[BUILT]`**:
  - Timestamped notes (`client_notes`) with editable note date, max 5,000 characters, full pagination and audit trail.
- **Client Profile Working Hub `[BUILT]`**:
  - Large avatar display, tap-to-call, tap-to-mail, responsive stacked mobile layout.
  - Associated case dossier links, linked tasks, physical files, and appointment tabs.

### 3.2 Cases Module `[BUILT]`
- **Case Information**: File serial, case number, court, matter type, description, status (`ongoing`, `pending`, `closed`), filing date (`case_date`), and disposal date (`closed_on`).
- **Bangladesh Legal Party Structures `[BUILT]`**:
  - Case Categories: `civil`, `criminal_gr`, `criminal_cr`, `other`.
  - Dynamic party role labels:
    - Civil: Plaintiff vs Defendant.
    - Criminal GR: State vs Accused (FIR / G.R. cases).
    - Criminal CR: Complainant vs Accused (Complaint cases).
    - Writ/Appellate: Petitioner vs Respondent / Appellant vs Respondent.
  - Tracking of Police Station (*Thana*), Sections of Law (*Dhara*), opposing counsel, and chamber role (`our_role`).
- **Case Notes `[BUILT]`**:
  - Dated chronological notes (`case_notes`) displayed in dedicated dossier tab with audit logging.
- **Case Dossier Hub `[BUILT]`**:
  - Unified workspace with Overview, Hearings, Tasks, Files, and Activity tabs.

### 3.3 Hearings & "Date Fixed For" Module
#### A. Existing Hearings & Date History `[BUILT]`
- Hearing scheduling (`scheduled_at`, `court`, `purpose`, `status`, `outcome_note`, `appearing_lawyer_id`).
- Immutable date change tracking in `hearing_date_history` (`old_at`, `new_at`, `reason`, `changed_by`).
- Automatic synchronization of `cases.next_hearing_at`.

#### B. "Date Fixed For" (*Kharjja / Agami Tarikh*) `[BUILT]`
In Bangladesh courts, every scheduled hearing date has a legally defined procedural purpose recorded in the court order sheet.
- **Controlled Category Lists**:
  - **Civil**: `first_hearing`, `written_statement`, `framing_of_issues`, `hearing`, `plaintiff_evidence`, `defendant_evidence`, `argument`, `order`, `judgment`, `compliance`, `ex_parte_hearing`, `peremptory_hearing`, `other`.
  - **Criminal (GR & CR)**: `cognizance`, `charge_framing`, `witness_examination`, `statement_of_accused`, `argument`, `bail_hearing`, `remand`, `order`, `judgment`, `compliance`, `other`.
  - **Other**: `hearing`, `order`, `judgment`, `other`.
- **Fields**:
  - `fixed_for`: Selected key from category controlled list.
  - `fixed_for_note`: Optional free text (max 200 chars) for specialized court steps.
  - `old_fixed_for` & `new_fixed_for` in `hearing_date_history`.
- **Workflow Rules**:
  - Hearing creation and rescheduling require `fixed_for`.
  - Adjournment requires next date + next date's `fixed_for` (default: copied from current date) + adjournment reason. Old hearing preserves its original `fixed_for`.
  - Displayed alongside date across Case Dossier, Hearings List, Calendar, Dashboard, Daily Cause List docket, Print View, Global Search, and History modals.

### 3.4 Daily Cause List Docket `[BUILT]`
- Chronological list of hearings scheduled for today or selected date across courts.
- Filterable by court, appearing lawyer, and `fixed_for` purpose.
- Printable A4 cause list docket supporting Bangla font rendering.
- Bulk adjournment, bulk rescheduling, and bulk status updates directly from cause list view with multi-select checkboxes.

### 3.5 Appointments Module `[BUILT]`
- Dedicated module for client consultations, court visits, phone calls, and internal conferences.
- Stored in `appointments` and `appointment_attendees`.
- Non-blocking overlap warning for attendees and organizers.
- Filterable list view, dashboard section ("Today's Appointments"), client profile tab, and full reschedule audit trail.

### 3.6 Tasks Module `[BUILT]`
- Tasks assigned to staff members with priorities (`urgent`, `high`, `medium`, `normal`, `low`) and due dates.
- Linkable to clients and cases.
- Overdue computation, task reassignments, completion modals, and automatic reminder clearance.
- Staff partitioning: staff without `tasks.assign` can only view and complete tasks assigned to them.
- Full Postgres + REST + Mock dual-mode parity with audit trail.

### 3.7 Physical File Tracking `[BUILT (Mock Layer)]` / `[PLANNED (Postgres API)]`
- Unique sequential physical file serials (`F-000001`) per firm.
- Check-out / check-in custody workflows with holder assignment and return due dates.
- Movement audit history (`file_movements`) and overdue tracking.

### 3.8 Calendar & Reminders `[BUILT (Mock Layer)]` / `[PLANNED (Background Worker)]`
- Unified monthly, weekly, and daily calendar view aggregating hearings, appointments, task deadlines, and physical file return dates.
- In-app notification center for impending deadlines.
- `[IDEA]`: SMS and WhatsApp notification delivery to clients and advocates.

### 3.9 Audit Trail `[BUILT]`
- Comprehensive, immutable `audit_log` recording every mutation with actor, timestamp, action type, entity ID, and old/new JSON diff.
- Sensitive redaction: passwords, tokens, cookies, and raw photo bytes are excluded.
- Confidentiality enforcement: staff lacking `restricted.view` cannot view audit logs concerning restricted cases.

### 3.10 Super Admin & Licensing Portal `[BUILT]`
- Standalone `/admin` SPA portal completely separated from tenant codebase.
- Independent authentication (`platform_admins`, `ADMIN_JWT_SECRET`, secure cookies).
- Firm lifecycle management (Create, Suspend, Extend, Reactivate).
- Payment recording (bKash, Nagad, Bank transfer).
- Device authorization management.
- Subscription read-only enforcement: expired or suspended firms are restricted to read and backup operations only (`SUBSCRIPTION_READ_ONLY`).

### 3.11 Accounts & Billing Module (Phase 1) `[BUILT]`
- **Integer Paisa Precision**: All monetary values stored strictly as integer paisa (no floating point, 1 BDT = 100 paisa).
- **South Asian Formatting**: Dynamic currency formatter rendering Bangla and English numerals with Bangladeshi grouping (`৳ 1,50,000` / `৳ ১,৫০,০০০`).
- **Fee Agreements & Changes**:
  - Every agreement MUST reference one client and one case (`case_id` NOT NULL for new agreements).
  - Types: `fixed`, `per_hearing`, `hourly`, `retainer`, `installment`.
  - Amount changes strictly preserved in `fee_agreement_changes` with mandatory reason.
- **Fee Payments Received (Tracked Per Client and Per Case)**:
  - Every payment references a fee agreement; server derives `client_id` and `case_id` directly from the agreement.
  - Rejection guards (HTTP 400): closed or void agreement; mismatched client/case; mismatched hearing; unauthorized case access under central visibility or `restricted.view`.
  - Central case visibility verified BEFORE returning an idempotent duplicate.
  - Unique-index idempotency collision race condition caught and handled safely.
  - Payment methods: `cash`, `bank`, `bkash`, `nagad`, `cheque`, `other`.
  - Mandatory purpose note (max 500 chars).
  - Atomic, gap-safe receipt numbering (`R-000001`) via `number_sequences`.
  - Duplicate idempotency key protection per firm.
  - Optional link to hearing date of that case.
  - Immutable posted records: voiding requires reason, recording operator and timestamp; void records excluded from balances.
- **Legacy Unassigned Handling & Non-Destructive Migration**:
  - Legacy payments without fee agreement or case marked `legacy_unassigned = true`.
  - Displayed in a distinct "Legacy Unassigned" UI block with an admin action to attach them to an active case agreement.
- **Chamber Expenses**:
  - Seedable categories per firm with English/Bangla names.
  - Linkable to client and case; reimbursable flag.
  - Voiding with reason.
- **Client & Case Balance Computation**:
  - Per agreement = Agreed Amount − Posted Payments.
  - Per case = Sum of its agreements.
  - Per client = Sum of its cases.
  - Overpayment supported and flagged as credit.
- **UI & Dual-Mode Repositories**:
  - Client Billing tab displays grand total KPI summary cards on top, followed by ONE BLOCK PER CASE (case number/title, agreed, received, outstanding, payments with purpose notes, expenses) plus an unassigned records block.
  - Case Billing tab isolates ledger strictly to that specific case.
  - `RecordPaymentModal` features reactive Case and Agreement selectors (prefilled and locked when opened from a case).
  - Chamber-wide Billing screen (`/billing`) with sortable client balance rankings.
  - 100% bilingual i18n parity (`en.json`, `bn.json`).

---

## 4. Non-Functional Requirements

- **Security & Multi-Tenancy**: Guaranteed tenant isolation via `firm_id` filter on every query. Server derives tenant strictly from verified session.
- **Device Authorization**: Browser installation tracking identified via cryptographically random 256-bit cookie key (`device_key`), hashed via SHA-256.
- **Client-Side Cryptography**: Backup export uses PBKDF2 (≥600,000 iterations) with Web Crypto API and AES-GCM 256-bit encryption.
- **Localization**: 100% parity across English and Bangla (`en.json`, `bn.json`) utilizing Noto Sans Bengali typography.
- **Responsiveness**: Fluid layout across 360px (mobile), 768px (tablet), and 1280px+ (desktop). Minimum touch target size 44×44px.

---

## 5. Feature Status Matrix

| Module / Feature | Status | Implementation Layer |
| :--- | :--- | :--- |
| Foundation & Tenant Auth | `[BUILT]` | Postgres + REST + Mock |
| Central Case Visibility & Team Hierarchy | `[BUILT]` | Postgres + REST + Mock |
| Client CRUD & Profile Hub | `[BUILT]` | Postgres + REST + Mock |
| Client Profile Photos (≤300KB) | `[BUILT]` | Postgres + REST + Mock |
| Client Notes | `[BUILT]` | Postgres + REST + Mock |
| Cases CRUD & Dossier Hub | `[BUILT]` | Postgres + REST + Mock |
| Case BD Party Roles & Categories | `[BUILT]` | Postgres + REST + Mock |
| Case Notes & History | `[BUILT]` | Postgres + REST + Mock |
| Appointments Module & Attendee Linkage | `[BUILT]` | Postgres + REST + Mock |
| Hearings Basic Scheduling & Date History | `[BUILT]` | Postgres + REST + Mock |
| Hearings "Date Fixed For" Controlled Lists | `[BUILT]` | Postgres + REST + Mock |
| Cause List Daily Docket & Print View | `[BUILT]` | Frontend UI & Mock |
| Cause List Bulk Status Operations | `[BUILT]` | Postgres + REST + Mock |
| Tasks Module | `[BUILT]` | Postgres + REST + Mock |
| Accounts & Billing Phase 1 (Agreements, Payments, Expenses) | `[BUILT]` | Postgres + REST + Mock |
| Physical File Tracking | `[BUILT]` (Mock) / `[PLANNED]` (DB) | Frontend Mock active |
| Calendar & In-App Reminders | `[BUILT]` (Mock) / `[PLANNED]` (DB) | Frontend Mock active |
| Super Admin Portal & Device Authorization | `[BUILT]` | Postgres + REST + Admin SPA |
| Cryptographic Backup & Restore | `[BUILT]` | Client-side Web Crypto + Mock |
| SMS / WhatsApp Notification Gateway | `[IDEA]` | Postponed |
| External Calendar Sync (Google / Outlook) | `[IDEA]` | Postponed |
| Real Court Scraper Integration | `[IDEA]` | Postponed |

---

## 6. MISMATCH Section

This section records verified discrepancies between earlier planning notes and the current codebase:
1. **Uploads Policy**:
   - *Original Plan*: Strictly "no document uploads of any kind".
   - *Current Code*: Exception added for small client profile photos (≤300KB), resized client-side via HTML canvas with EXIF stripping and magic byte validation. Full document/brief uploads remain prohibited.
2. **Super Admin Isolation**:
   - *Original Plan*: Envisioned a simple boolean flag (`is_admin`) on users.
   - *Current Code*: Implemented as a completely isolated subsystem (`platform_admins` table, separate `ADMIN_JWT_SECRET`, standalone `/admin-app` SPA, and dedicated rate limiters).
3. **Tasks and Physical Files Storage**:
   - *Original Plan*: Assumed all entities live in Postgres from day one.
   - *Current Code*: The frontend features a comprehensive UI backed by an in-memory repository store (`mockStore.ts`). PostgreSQL tables and REST routes for `tasks`, `physical_files`, `file_movements`, and `reminders` are planned for upcoming backend phases.
4. **Device Authorization Concept**:
   - *Original Clarification*: Documented that a "device" represents a unique browser profile/cookie installation identified by a random key, not hardware-level hardware MAC/fingerprints.
