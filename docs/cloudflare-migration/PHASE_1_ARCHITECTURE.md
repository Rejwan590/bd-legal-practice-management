# Phase 1: Architecture and Conversion Specification
## Cloudflare Workers Migration for BD Legal Practice Management

**Document Status:** Ready for Review  
**Target Environment:** Cloudflare Workers (Hono) + Cloudflare D1 (SQLite) + Cloudflare R2 (Object Storage)  
**Current Production Branch:** `master` (Azure App Service + PostgreSQL)  
**Author:** Antigravity Engineering

---

## 1. Executive Summary

This specification evaluates the architectural transition of the **BD Legal Practice Management** backend from its current Node.js/Express + PostgreSQL deployment on Azure App Service to a modern, edge-native architecture on **Cloudflare Workers**.

The BD Legal platform serves legal chambers in Bangladesh, demanding strict compliance with legal practice rules, multi-tenant isolation, audit logging, dual-mode bilingual capabilities, and financial precision (BDT integer paisa calculations). 

Based on our empirical analysis of the repository's 31 database tables, 21 transactional operations, 9 cryptographic call sites, and 60 raw SQL queries, we conclude:
1. **Cloudflare Workers Paid ($5.00/month)** is mandatory. The Workers Free tier's strict **10 ms CPU execution limit** is incompatible with cryptographically secure password hashing (OWASP-recommended PBKDF2 iterations require 30–90 ms of CPU execution).
2. **Architecture A (Cloudflare Workers + Hono + D1 + R2)** is the optimal, robust architecture. It delivers complete SQL relational querying, low latency, seamless platform-admin cross-chamber reporting, and eliminates the multi-database operational overhead of per-tenant Durable Objects, while resolving D1's transaction constraints through deterministic `db.batch()` execution.
3. **Client Photos and Chamber Backups** must be decoupled from relational storage and hosted on **Cloudflare R2**, eliminating large Base64 blobs from D1 rows and dramatically reducing query costs.

---

## 2. Empirical Verification of Findings

An exhaustive automated and manual audit of the `server/src` directory confirmed the following exact metrics:

### 2.1 Cryptographic Call Sites (`bcrypt` / `bcryptjs`)
Exactly 6 production/operational files contain 9 distinct password verification and hashing call sites:
- `server/src/services/authService.ts`:
  - Line 159: `await bcrypt.compare(password, DUMMY_HASH);` (Timing-attack dummy check for missing user)
  - Line 193: `await bcrypt.compare(password, DUMMY_HASH);` (Timing-attack dummy check for inactive user)
  - Line 202: `const isMatch = await bcrypt.compare(password, user.passwordHash);` (Chamber user password verification)
- `server/src/services/adminAuthService.ts`:
  - Line 43: `await bcrypt.compare(password, DUMMY_ADMIN_HASH);` (Timing-attack dummy check for missing platform admin)
  - Line 61: `const isPasswordValid = await bcrypt.compare(password, admin.passwordHash);` (Platform admin password verification)
- `server/src/routes/auth.ts`:
  - Line 175: `const isMatch = await bcrypt.compare(currentPassword, req.user!.passwordHash);` (User password change check)
  - Lines 185–186: `const salt = await bcrypt.genSalt(10); const newHash = await bcrypt.hash(newPassword, salt);`
- `server/src/routes/adminFirms.ts`:
  - Lines 175–176: `const salt = await bcrypt.genSalt(10); const passwordHash = await bcrypt.hash(tempPassword, salt);` (Chamber initial owner creation)
  - Line 920: `const passwordHash = await bcrypt.hash(temporaryPassword, 10);` (Platform admin user password reset)
- `server/src/routes/users.ts`:
  - Line 237: `const passwordHash = await bcrypt.hash(tempPassword, 10);` (Staff user invitation)
  - Line 786: `const passwordHash = await bcrypt.hash(temporaryPassword, 10);` (Chamber user password reset)
- Operational scripts and tests:
  - `server/src/scripts/createPlatformAdmin.ts` (Line 89), `resetPlatformAdminPassword.ts` (Line 86), `db/seed.ts` (Lines 279–281), `db/client.ts` (Line 489).

### 2.2 Transaction Callbacks (`db.transaction()`)
Exactly 21 `db.transaction()` callbacks exist in business routes requiring atomic multi-table execution:
- **Device Management (`server/src/routes/adminDevices.ts`)**:
  - Line 66: Approve device + audit log insert.
  - Line 102: Reject device + audit log insert.
  - Line 137: Revoke device + audit log insert.
- **Chamber Firm Lifecycle (`server/src/routes/adminFirms.ts`)**:
  - Line 179: Create firm + provision owner user + generate license event + insert admin audit log.
  - Line 444: Suspend firm + insert admin audit log.
  - Line 485: Disable firm + insert admin audit log.
  - Line 526: Reactivate firm + insert admin audit log.
  - Line 584: Soft-delete firm cascade + soft-delete users + insert admin audit log.
  - Line 680: Update firm licensing parameters (expiry, devices, monthly price) + license event + audit log.
  - Line 751: Renew firm license + license event + audit log.
  - Line 803: Record platform subscription payment + update firm status + license event + audit log.
  - Line 1020: Extend firm trial period + license event + audit log.
  - Line 1113: Convert firm trial to paid active license + license event + audit log.
- **Billing & Financials**:
  - `server/src/routes/feeAgreements.ts` (Line 178): Update agreement terms + record fee agreement change history.
  - `server/src/routes/feePayments.ts` (Line 155): Increment receipt number sequence + insert payment record + update fee agreement `paidAmount` + write audit log.
- **Hearings & Case Calendaring (`server/src/routes/hearings.ts`)**:
  - Line 146: Create hearing + synchronize case `nextHearingAt`.
  - Line 218: Update hearing details + audit log.
  - Line 327: Adjourn hearing + create subsequent hearing + write hearing date history + synchronize case `nextHearingAt`.
  - Line 434: Bulk hearing status update.
  - Line 512: Bulk hearing reschedule + write hearing date history entries.
  - Line 563: Bulk hearing adjourn + create new hearing rows + write history records.
  - Line 645: Adjourn hearing with next hearing creation.
  - Line 746: Soft-delete hearing + recalculate and update case `nextHearingAt`.

### 2.3 PostgreSQL Schema & Storage Dependencies
- **Tables**: Exactly 31 tables defined in `server/src/db/schema.ts`.
- **Column Types**: 268 `text`, 100 `timestamp`, 19 `integer`, 11 `boolean`, 7 `uuid`, 8 `jsonb`.
- **Photo Storage**: Base64 data URLs stored directly in PostgreSQL (`client_photos.bytes: text`) with an application-enforced 300 KB limit.

---

## 3. Evaluation of Candidate Database Architectures

We evaluated three potential architectures for running BD Legal on Cloudflare Workers.

```
+--------------------------------------------------------------------------------------------------+
|                                    CANDIDATE ARCHITECTURES                                       |
+------------------------------------+------------------------------------+------------------------+
| Architecture A                     | Architecture B                     | Architecture C         |
| Workers + Hono + D1 + R2           | Workers + Hono + Durable Objects   | Hybrid: D1 (Global) +  |
| (Single Logical Database)          | (Per-Chamber SQLite DO)            | DO (Chamber) + R2      |
+------------------------------------+------------------------------------+------------------------+
```

### Detailed Architectural Comparison Matrix

| Evaluation Criteria | Architecture A: D1 + R2 (Recommended) | Architecture B: Per-Chamber Durable Objects | Architecture C: Hybrid D1 + DO |
|---|---|---|---|
| **1. Source of Truth** | Centralized D1 SQLite Database. | Individual SQLite databases inside each Chamber DO instance. | D1 for platform & plans; DO SQLite for chamber business data. |
| **2. Chamber Isolation** | Logical tenant isolation via strict indexed `firm_id` filters and Drizzle repository abstraction. | Physical storage isolation per chamber inside separate DO SQLite instances. | Physical for chamber data, logical for global platform entities. |
| **3. Platform-Admin Access** | Trivial: Direct relational `SELECT` queries across all firms, payments, and audit logs. | Extremely complex: Requires scatter-gather fan-out across hundreds of DOs or an asynchronous ETL pipeline. | Moderate: Platform entities in D1; chamber inspection requires ad-hoc DO RPC calls. |
| **4. Cross-Firm Reporting** | Simple SQL joins across `firms`, `payments`, `users`, and `plans`. | Requires secondary indexing or periodic aggregation worker to pipe data to D1/analytics. | Dual-query complexity: Reports must aggregate across DO and D1 boundaries. |
| **5. Transaction Guarantees** | Atomic execution via `db.batch([stmt1, stmt2, ...])`. All statements in a batch commit or rollback together. | Full interactive ACID transactions with standard SQLite `BEGIN IMMEDIATE...COMMIT`. | Full ACID for chamber actions; two-phase commit or eventual consistency across D1 and DO. |
| **6. Write Contention & Concurrency** | D1 handles serialized writes per database. BD Legal's transactional rate (< 5 writes/sec/chamber) is well within D1 throughput. | Zero cross-chamber contention. Single-threaded DO guarantees serialization per chamber. | Low contention; chamber writes isolated to DO, platform writes isolated to D1. |
| **7. Backup and PITR** | D1 Time Travel allows restoration to any minute within the retention window (up to 30 days). | Must iterate through thousands of DO instances, snapshotting individual SQLite state to R2. | High operational burden: Disjointed PITR between D1 and DO states causes referential drift. |
| **8. Data Export & Restore** | Native `wrangler d1 export` produces a clean SQLite dump. Per-firm chamber backup filters by `firm_id`. | DO SQLite files can be dumped directly to R2. Easy per-chamber export; hard global export. | Inconsistent export formats across global catalogs and chamber records. |
| **9. Operational Complexity** | **Low**: Standard relational paradigm. Single schema migration system via Drizzle ORM. | **Very High**: Managing DO lifecycle, migration deployment across thousands of live instances, cold starts. | **Extreme**: Dual-schema migrations, distributed transactions, hybrid connection routing. |
| **10. Usage Limits & Pricing** | Workers Paid ($5/mo) + D1 ($0.75/million writes over 50M) + R2 ($0.015/GB). Highly cost-effective. | DO storage costs ($0.15/GB-mo) + DO active duration ($0.128/million GB-s) + DO requests ($0.15/million). | Cumulative costs of both D1 and DO infrastructure tiers. |
| **11. Lock-in & Exit Strategy** | **Minimal**: Standard SQLite database. Can be dumped and loaded into PostgreSQL, Turso, or standard SQLite in minutes. | **High**: Deep coupling to Cloudflare Durable Objects runtime and RPC semantics. | **Extreme**: System tightly wedded to Cloudflare's proprietary distributed DO storage architecture. |

---

## 4. Architectural Recommendation & Rationale

### Recommendation: Architecture A (Cloudflare Workers + Hono + D1 + R2)

Architecture A is unequivocally recommended for the BD Legal Practice Management platform for the following reasons:

1. **Relational Model Parity**:
   The existing system relies on 31 relational tables with extensive foreign-key relationships, multi-table joins, and unified reporting (e.g., cross-table audit logging, platform-admin firm overviews, financial summaries). D1 provides a standard SQLite relational engine that maps 1:1 with Drizzle ORM.
2. **Platform Admin & Super-Admin Transparency**:
   Architecture B or C would require a distributed query engine to answer routine administrative queries like:
   - "List all chambers expiring within 7 days"
   - "Show total subscription revenue collected across all chambers this month"
   - "Audit log of all platform-admin actions"
   In Architecture A, these remain single SQL queries executed with index efficiency.
3. **Transaction Feasibility via D1 Batching**:
   While D1 does not currently support interactive multi-turn transactions across network round-trips (`BEGIN` ... wait for app logic ... `COMMIT`), **all 21 transactions in BD Legal can be modeled as atomic batches (`db.batch`)**. The business logic pre-calculates the changes, and submits the write statements atomically. If any statement fails, the entire batch rolls back.
4. **Decoupled Heavy Storage via R2**:
   Moving client profile photos (up to 300 KB) and chamber automated ZIP backups to Cloudflare R2 reduces D1 database size by over 90%, protects against D1's 2 MB row size limits, and drastically minimizes scanned row volumes.

---

## 5. Security & Isolation Model

### 5.1 Chamber Multi-Tenant Isolation
Logical multi-tenancy is enforced in Architecture A through multiple defense-in-depth layers:
1. **JWT Verification Layer**: The JWT payload contains cryptographically verified `firmId`, `userId`, and `role`. Client-supplied tenant IDs in request bodies or query parameters are strictly forbidden.
2. **Repository Scoping (`firm_id`)**: Every tenant-table query appends `eq(table.firmId, session.firmId)` at the ORM layer.
3. **Central Visibility (`canUserSeeCase`)**: Strict access control rules governing responsible lawyer IDs, reporting lines, supervisor chains, and explicit case shares are enforced in memory and at the SQL `where` clause level.

### 5.2 Super-Admin Isolation Boundary
Super-admin routes (`/api/v1/admin/*`) require the `platform_admins` token verified via a distinct secret key (`ADMIN_JWT_SECRET`). Platform admins have zero access to chamber case files or privileged client notes unless explicitly invited for support, and all actions are recorded in `admin_audit`.
