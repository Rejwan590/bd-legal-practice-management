# Test and Acceptance Plan: Cloudflare Migration

**Document Status:** Ready for Review  
**Coverage Scope:** 18 Existing Server Test Suites, D1 Concurrency Benchmarks, Invariant Verifications  
**Testing Framework:** Vitest with `@cloudflare/vitest-pool-workers` (Local Miniflare / D1 Simulation)

---

## 1. Test Architecture & Tooling

To ensure 100% behavioral parity with zero production regressions, testing Cloudflare Workers must execute inside an accurate local simulation of the Workers runtime.

- **Test Runner:** `vitest`
- **Worker Simulation:** `@cloudflare/vitest-pool-workers` (runs tests inside Cloudflare's open-source `workerd` runtime engine, executing true Web Crypto, D1 SQLite storage, and R2 bindings).
- **Parity Assertion:** Every existing test suite in `server/tests/` must run against the Cloudflare Worker implementation and pass with identical HTTP response bodies, status codes, and database side effects.

---

## 2. Mapping of 18 Existing Test Suites

The current server test suite contains 18 comprehensive test files verifying core business invariants:

| # | Existing Test File | Scope / Invariant Tested | Cloudflare Parity Verification Focus |
|---|---|---|---|
| 1 | `tests/auth.test.ts` | Login, password change, JWT issuance, timing dummy hashes | Verify PBKDF2 hash generation, constant-time comparison, cookie issuance. |
| 2 | `tests/users.test.ts` | User invitation, RBAC permissions, user profile updates | Check user creation, role assignment, and password hashing. |
| 3 | `tests/clients.test.ts` | Client CRUD, search, photo handling | Verify client metadata in D1 and photo upload/streaming via R2 binding. |
| 4 | `tests/cases.test.ts` | Case CRUD, case number uniqueness, client link | Verify case generation, status transitions, and soft-delete invariants. |
| 5 | `tests/caseVisibility.test.ts` | Responsible lawyer, reporting chain, case shares | Verify `canUserSeeCase` SQL query generation and in-memory authorization logic. |
| 6 | `tests/hearings.test.ts` | Hearing scheduling, date history, next hearing sync | Verify atomic `d1.batch()` updates both `hearings` and `cases.next_hearing_at`. |
| 7 | `tests/adjournments.test.ts` | Adjournment, history log, next hearing pointer | Verify `hearing_date_history` creation and case date sync within single atomic batch. |
| 8 | `tests/feeAgreements.test.ts` | Agreed fees, amendment history, payment tracking | Verify integer paisa calculations and `fee_agreement_changes` creation. |
| 9 | `tests/feePayments.test.ts` | Receipt generation, sequence counter, agreement balance | Verify `number_sequences` atomic increment and duplicate receipt collision prevention. |
| 10 | `tests/expenses.test.ts` | Case expense logging, categories, receipts | Verify expense category foreign keys and integer paisa storage. |
| 11 | `tests/chamberExpenses.test.ts` | Office overhead, petty cash, advances, settlements | Verify multi-table advance reconciliation within D1 batch. |
| 12 | `tests/appointments.test.ts` | Calendaring, client appointments, attendees | Verify appointment attendee join table cascades and time format. |
| 13 | `tests/tasks.test.ts` | Chamber task assignment, status updates, case links | Verify task assignments and filtering. |
| 14 | `tests/adminFirms.test.ts` | Chamber creation, trial periods, license parameters | Verify multi-table creation of firm, owner, license event, and audit log. |
| 15 | `tests/adminSubscriptions.test.ts`| License expiry, renewals, payment recording | Verify firm status transitions and `license_events` history. |
| 16 | `tests/adminDevices.test.ts` | Device fingerprinting, seat limits, approval/revocation | Verify device count queries and audit logging. |
| 17 | `tests/auditLog.test.ts` | Tenant audit trail, before/after JSON diffs | Verify JSON serialization in `audit_log` text columns. |
| 18 | `tests/dualModeParity.test.ts` | Mock repository vs database repository parity | Verify that the D1 repository produces identical outputs to the mock store. |

---

## 3. High-Risk Concurrency & Stress Tests

To prove the validity of replacing PostgreSQL interactive transactions with D1 atomic batching, four automated concurrency stress tests must be executed:

### 3.1 Test C1: Receipt Sequence Collision Under Load
- **Scenario:** 20 concurrent requests simulate cashiers issuing fee payments for different clients in the same firm within a 100ms window.
- **Verification Criteria:**
  - Exactly 20 distinct receipt numbers issued (`REC-2026-00001` through `REC-2026-00020`).
  - Zero duplicate sequence errors.
  - The final `number_sequences.current_value` exactly equals 20.
  - The sum of `fee_agreements.paid_amount_paisa` matches the exact sum of individual payments.

### 3.2 Test C2: Simultaneous Hearing Adjournment & Reschedule
- **Scenario:** Two users attempt to adjourn and reschedule the same case's hearing simultaneously.
- **Verification Criteria:**
  - One batch commits successfully; the subsequent batch receives a clean conflict/pre-condition failure or updates cleanly without corrupting `cases.next_hearing_at`.
  - Exactly one `hearing_date_history` row per completed action.
  - `cases.next_hearing_at` always matches the true earliest active future hearing date.

### 3.3 Test C3: Device Quota Race Condition
- **Scenario:** A firm with 1 available device seat receives 5 simultaneous `POST /devices/register` requests.
- **Verification Criteria:**
  - Exactly 1 device transitions to `APPROVED` (or pending approval).
  - The remaining 4 are rejected with `403 Forbidden: Device seat limit reached`.
  - No over-allocation occurs.

### 3.4 Test C4: Multi-Tenant Data Leakage Verification
- **Scenario:** Run 50 concurrent mixed queries across 5 distinct tenant firms (`firm_id_1` through `firm_id_5`).
- **Verification Criteria:**
  - Firm A never receives records belonging to Firm B in any response payload.
  - Audit logs are strictly isolated by `firm_id`.

---

## 4. Phase 2 Acceptance Checklist

Before any production traffic is migrated to Cloudflare Workers, the following gates must be formally satisfied:

- [ ] **A1 — Test Suite 100% Green:** All 18 server test suites pass cleanly under `@cloudflare/vitest-pool-workers`.
- [ ] **A2 — Zero Lint & Type Errors:** `npm run lint` and `npm run build` pass with zero errors and zero warnings.
- [ ] **A3 — Concurrency Verification:** Tests C1, C2, C3, and C4 complete without deadlocks, collisions, or isolation leaks.
- [ ] **A4 — R2 Photo Integrity:** Client photo uploads (up to 300 KB) save to R2, stream correctly via GET, and return valid ETags and HTTP caching headers.
- [ ] **A5 — D1 Time Travel Drill:** A test D1 database is restored to a prior point in time using Cloudflare D1 Time Travel to verify disaster recovery.
- [ ] **A6 — Bilingual String Parity:** Zero hardcoded strings in backend error payloads; all validation messages map to valid bilingual keys.
- [ ] **A7 — Performance Latency:** 95th percentile API response time for authenticated case list queries < 80 ms globally.
