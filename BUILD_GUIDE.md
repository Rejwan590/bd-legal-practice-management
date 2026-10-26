# BUILD_GUIDE.md — Ordered Implementation Roadmap (Phases 1 to 14)

This document provides the authoritative, ordered 14-phase roadmap for completing the BD Legal Practice Management system.

---

## Roadmap Overview & Progress Summary

- **Phases Completed**: Phase 1, Phase 2, Phase 3, Phase 4, Phase 5, Phase 12 (Foundation, Clients, Cases, Appointments, Hearings & "Date Fixed For", Super Admin & Device Auth).
- **Recommended Next Task**: **Phase 6 — Daily Cause List Docket & Bulk Actions**.

---

## Ordered Implementation Plan

### Phase 1: Foundation, Multi-Tenant Auth & Permissions `[COMPLETED]`
- [x] Multi-tenant PostgreSQL 16 schema with strict `firm_id` isolation.
- [x] Cookie-based authentication (`httpOnly`, `Secure`, `SameSite=Lax`).
- [x] Central role-based access control (`Owner` vs `Staff`) and granular permissions (`can(key)`).
- [x] Rate limiting on login and lockout defense against brute force.
- [x] Immutable audit trail (`audit_log`) on every mutating write.
- [x] Subscription read-only enforcement (`enforceSubscriptionReadOnly`).
- [x] Central team hierarchy & visibility rule (`open` vs `team` mode, supervisor reporting chain).

### Phase 2: Clients Module & Profile Hub `[COMPLETED]`
- [x] Client CRUD with bilingual names (`name`, `name_bn`), phone, address, and notes.
- [x] Profile photos: client-side canvas resize (max 400px), EXIF stripping, magic-byte validation, max 300KB in `client_photos`.
- [x] Client notes: `client_notes` table with editable note dates, max 5,000 characters, pagination, and audit logging.
- [x] Redesigned Profile Hub: large avatar, tap-to-call, tap-to-mail, responsive stacked mobile layout, and linked case counts.
- [x] Soft delete with orphan prevention (blocks deletion if active cases exist).

### Phase 3: Cases Module & Bangladesh Party Structures `[COMPLETED]`
- [x] Case CRUD with unique file serials (`file_serial`) per firm and court affiliations.
- [x] BD Case Categories: `civil`, `criminal_gr`, `criminal_cr`, `other`.
- [x] Dynamic party roles (Plaintiff/Defendant, Petitioner/Respondent, State/Accused, Complainant/Accused).
- [x] Police Station (*Thana*), Sections of Law (*Dhara*), and opposing counsel tracking.
- [x] Case notes tab (`case_notes`) with chronological history and audit logging.
- [x] Case Dossier Working Hub with 5 tabs (`Overview`, `Hearings`, `Tasks`, `Files`, `Activity`).
- [x] Case sharing (`case_shares`) and confidential matter protection (`restricted.view`).

### Phase 4: Appointments Module `[COMPLETED]`
- [x] Dedicated appointment tracking (`appointments` and `appointment_attendees`).
- [x] Permissions `appointments.view` and `appointments.manage`.
- [x] Types: `client_meeting`, `consultation`, `phone_call`, `internal_meeting`, `court_visit`, `other`.
- [x] Non-blocking attendee schedule conflict detection.
- [x] Today's Appointments section on dashboard with 1-click status transitions.
- [x] Client profile appointments tab and full reschedule audit history.

---

### Phase 5: Hearings Backend & "Date Fixed For" `[COMPLETED]`
- [x] Add `fixed_for` (controlled key) and `fixed_for_note` (max 200 chars) to `hearings`.
- [x] Add `old_fixed_for` and `new_fixed_for` to `hearing_date_history`.
- [x] Implement controlled category lists with English/Bangla parity:
  - **Civil**: `first_hearing`, `written_statement`, `framing_of_issues`, `hearing`, `plaintiff_evidence`, `defendant_evidence`, `argument`, `order`, `judgment`, `compliance`, `ex_parte_hearing`, `peremptory_hearing`, `other`.
  - **Criminal (GR & CR)**: `cognizance`, `charge_framing`, `witness_examination`, `statement_of_accused`, `argument`, `bail_hearing`, `remand`, `order`, `judgment`, `compliance`, `other`.
  - **Other**: `hearing`, `order`, `judgment`, `other`.
- [x] Enforce `fixed_for` on hearing creation and reschedule.
- [x] Enforce next date + next `fixed_for` + reason on adjournment (default: same `fixed_for`).
- [x] Update frontend to display `fixed_for` in Case Dossier, Hearings list, Calendar, Dashboard, and History modal.
- [x] Automated tests: invalid category rejection, history recording old/new values, and adjournment carry-over (419/419 passed).

### Phase 6: Daily Cause List Docket & Bulk Actions `[RECOMMENDED NEXT TASK]`
- [ ] Daily cause list docket view filterable by court, date, appearing lawyer, and `fixed_for`.
- [ ] Bulk adjournment and step completion from the cause list screen.
- [ ] High-contrast, printable A4 cause list docket stylesheet.

### Phase 7: Tasks Module Backend & Assignment `[PLANNED]`
- [ ] Move tasks from frontend mock to PostgreSQL `tasks` table.
- [ ] Task assignment, priorities (`urgent`, `high`, `medium`, `normal`, `low`), due dates, and status transitions.
- [ ] Case and client association with overdue date calculations.

### Phase 8: Physical File Tracking & Custody Backend `[PLANNED]`
- [ ] Move physical files to PostgreSQL `physical_files` and `file_movements`.
- [ ] Firm-scoped serial generator (`F-000001`).
- [ ] Check-out / check-in custody workflows with holder assignment and return deadlines.

### Phase 9: Calendar & Automated Reminders Backend `[PLANNED]`
- [ ] PostgreSQL `reminders` table and aggregation service.
- [ ] Chronological calendar feed joining hearings, appointments, tasks, and file due dates.
- [ ] In-app notification center and reminder dismissal.

### Phase 10: Global Search & Executive Dashboard Backend `[PLANNED]`
- [ ] Cross-entity unified search endpoint respecting tenant isolation and confidentiality rules.
- [ ] Executive dashboard metrics endpoint calculating active cases, urgent hearings, overdue tasks, and files out.

### Phase 11: Chamber Cryptographic Backup & Restore `[PLANNED]`
- [ ] Server-side chamber backup export endpoint enforcing `data.export` permission and confidential matter filtering.
- [ ] Client-side AES-GCM 256-bit encryption with PBKDF2 (≥600,000 iterations) and SHA-256 integrity checks.
- [ ] Clean replace and safe merge restore procedures.

### Phase 12: Super Admin Portal & Device Authorization `[COMPLETED]`
- [x] Standalone `/admin-app` SPA with isolated `platform_admins` authentication.
- [x] Firm lifecycle management (creation, suspension, extension, reactivation).
- [x] Manual payment recording (bKash, Nagad, bank wire).
- [x] Browser-level device authorization (`device_key` cookie hash tracking and approval workflow).

### Phase 13: Performance, PWA Service Worker & Offline Sync `[PLANNED]`
- [ ] Service worker caching for static assets and offline read-only view of recent cases/hearings.
- [ ] Minimum version check and "Update Available" toast prompt.
- [ ] Persistent storage request (`navigator.storage.persist()`).

### Phase 14: Production Deployment & Infrastructure Hardening `[PLANNED]`
- [ ] Docker Compose setup for production (API + PostgreSQL 16 + Caddy).
- [ ] Caddy automatic HTTPS and reverse proxy configuration.
- [ ] Cloudflare DNS, DDoS protection, and SSL Full (strict) configuration.
- [ ] Automated off-site nightly backup pipeline to Cloudflare R2 / Backblaze B2.
