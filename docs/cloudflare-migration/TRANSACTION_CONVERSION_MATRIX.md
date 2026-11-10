# Transaction Conversion Matrix: PostgreSQL to Cloudflare D1

**Document Status:** Ready for Review  
**Target Transaction Mechanism:** D1 Atomic Batching (`d1.batch([stmt1, stmt2, ...])`) and D1 Sessions  
**Source Engine:** PostgreSQL Interactive Multi-Statement Transactions (`db.transaction(async (tx) => { ... })`)

---

## 1. D1 Transaction Paradigm & The Batching Pattern

### 1.1 The Architectural Difference
In PostgreSQL, an application opens a persistent connection, sends `BEGIN`, issues queries, reads results back to the application runtime, issues further queries based on intermediate results, and finally sends `COMMIT` or `ROLLBACK`.

In Cloudflare D1 (an HTTP/distributed SQLite engine), **interactive transactions that pause across network round-trips are not supported**. Instead, D1 provides **Atomic Batches (`d1.batch()`)**:
- All prepared SQL statements submitted in a single `d1.batch([...])` array execute inside an implicit SQLite `BEGIN IMMEDIATE ... COMMIT` transaction on the D1 primary.
- If any statement in the array fails or triggers a constraint violation (e.g., unique key, foreign key, check constraint), **the entire batch is rolled back automatically**.
- Intermediate reads cannot occur inside the batch; all reads must occur **before** the batch, or logic must be expressed declaratively via SQL expressions (e.g., `UPDATE fee_agreements SET paid_amount = paid_amount + ?`).

### 1.2 The "Prepare-Validate-Batch" Architecture
Every complex multi-step transaction in BD Legal is re-architected into three deterministic stages:
```
+-----------------------------------------------------------------------------------------+
|                              PREPARE-VALIDATE-BATCH PATTERN                             |
+-----------------------------+-----------------------------+-----------------------------+
| Stage 1: Read & Prepare     | Stage 2: In-Memory Compute  | Stage 3: Atomic Batch       |
| Read current state, acquire | Compute hashes, UUIDs,      | Dispatch all mutating       |
| locks or sequence numbers.  | history rows, and diffs.    | statements in d1.batch().   |
+-----------------------------+-----------------------------+-----------------------------+
```

---

## 2. Mandatory Transaction Scenarios Specification

### Scenario 1: Firm Creation & Initial Owner Provisioning
- **Location:** `server/src/routes/adminFirms.ts` (Line 179, `POST /api/v1/admin/firms`)
- **Operations:**
  1. Insert into `firms` (status: `TRIAL`, trial expires in 30 days).
  2. Insert into `users` (primary owner with role `OWNER`, active status).
  3. Insert into `license_events` (`TRIAL_STARTED`).
  4. Insert into `admin_audit` (platform admin audit trail).
- **Atomicity Requirement:** Absolute. A firm without an owner, or an owner without a firm, creates an orphaned security vulnerability.
- **D1 Replacement Mechanism:**
  ```typescript
  // 1. Generate IDs and password hash in application memory
  const firmId = crypto.randomUUID();
  const userId = crypto.randomUUID();
  const licenseEventId = crypto.randomUUID();
  const auditId = crypto.randomUUID();
  const passwordHash = await hashPassword(tempPassword);

  // 2. Dispatch atomic batch
  await d1.batch([
    db.insert(schema.firms).values({ id: firmId, ...firmData }),
    db.insert(schema.users).values({ id: userId, firmId, passwordHash, ...ownerData }),
    db.insert(schema.licenseEvents).values({ id: licenseEventId, firmId, ...eventData }),
    db.insert(schema.adminAudit).values({ id: auditId, ...auditData })
  ]);
  ```
- **Failure & Rollback:** If the owner email collides (unique index on `users.email`), the firm record is rolled back atomically.
- **Idempotency:** Client passes optional `idempotencyKey` stored in `admin_audit`.

---

### Scenario 2: Firm Licensing & Subscription Changes
- **Location:** `server/src/routes/adminFirms.ts` (Lines 680, 751, 1020, 1113)
- **Operations:**
  1. Update `firms` (status, license expiry date, max users, max devices, monthly price).
  2. Insert into `license_events` (captures change type: `PARAMS_UPDATED`, `EXTENDED`, `CONVERTED_TO_PAID`, `RENEWED`).
  3. Insert into `admin_audit` (captures before/after snapshot).
- **Atomicity Requirement:** License state and license event history must never diverge.
- **D1 Replacement Mechanism:**
  Pre-read existing firm snapshot for audit diff; dispatch `UPDATE firms`, `INSERT license_events`, and `INSERT admin_audit` in a single `d1.batch()`.

---

### Scenario 3: Firm Suspension, Disable, Reactivate & Cascade Soft-Delete
- **Location:** `server/src/routes/adminFirms.ts` (Lines 444, 485, 526, 584)
- **Operations:**
  1. Update `firms` (`status = 'SUSPENDED' | 'DISABLED' | 'ACTIVE' | 'CANCELLED'`, `deleted_at = NOW()`).
  2. For soft-delete cascade: Update `users` (`deleted_at = NOW() WHERE firm_id = ?`).
  3. Insert into `license_events`.
  4. Insert into `admin_audit`.
- **Atomicity Requirement:** When a firm is suspended or soft-deleted, active user sessions must immediately be blocked from mutating writes, and the cascade must be all-or-nothing.
- **D1 Replacement Mechanism:** Single `d1.batch()` containing the firm update, user cascade update, license event, and audit record.

---

### Scenario 4: Hearing Creation & Case Next-Hearing Synchronization
- **Location:** `server/src/routes/hearings.ts` (Line 146, `POST /api/v1/cases/:caseId/hearings`)
- **Operations:**
  1. Insert into `hearings`.
  2. Recalculate earliest future hearing date for the case.
  3. Update `cases.next_hearing_at = calculatedDate`.
  4. Insert into `audit_log`.
- **Atomicity Requirement:** `cases.next_hearing_at` is the indexed column powering the daily court cause list. If a hearing is inserted without updating this date, lawyers miss court appearances.
- **D1 Replacement Mechanism:**
  ```typescript
  // 1. Read existing upcoming hearings for the case
  const upcoming = await db.queryHearings(caseId, firmId);
  const nextHearingDate = computeNextEarliestHearingDate([...upcoming, newHearing]);

  // 2. Atomic Batch
  await d1.batch([
    db.insert(schema.hearings).values(newHearing),
    db.update(schema.cases)
      .set({ nextHearingAt: nextHearingDate, updatedAt: now })
      .where(and(eq(schema.cases.id, caseId), eq(schema.cases.firmId, firmId))),
    db.insert(schema.auditLog).values(auditEntry)
  ]);
  ```

---

### Scenario 5: Hearing Adjournment & Hearing Date History
- **Location:** `server/src/routes/hearings.ts` (Lines 327, 645)
- **Operations:**
  1. Update existing hearing (`status = 'ADJOURNED'`, `adjournment_reason = ?`).
  2. Insert new subsequent hearing for the next court appearance date.
  3. Insert into `hearing_date_history` (records old date, new date, reason, changer ID).
  4. Recalculate and update `cases.next_hearing_at`.
  5. Insert into `audit_log`.
- **Atomicity Requirement:** Strict legal standing rule. Never update or adjourn a hearing date without creating a permanent `hearing_date_history` record and updating the case calendar pointer.
- **D1 Replacement Mechanism:**
  All 5 statements prepared in memory and committed via `d1.batch([updateOldHearing, insertNewHearing, insertHistory, updateCaseNextHearing, insertAudit])`.

---

### Scenario 6: Bulk Hearing Rescheduling & Bulk Adjournment
- **Location:** `server/src/routes/hearings.ts` (Lines 434, 512, 563, 746)
- **Operations:**
  1. For N hearings: Update each hearing row with the new date or status.
  2. For N hearings: Insert N records into `hearing_date_history`.
  3. For affected cases: Recalculate and update `cases.next_hearing_at`.
  4. Insert batch audit log.
- **Batch Size Limit in D1:** Cloudflare D1 supports batches up to 100 statements (or 1 MB SQL). For bulk operations involving > 30 hearings simultaneously:
  - If N <= 30: All updates, history rows, case updates, and audit rows fit into a single atomic `d1.batch()`.
  - If N > 30: Chunked into batches grouped strictly by `case_id`, guaranteeing per-case atomicity.

---

### Scenario 7: Device Approval, Rejection & Revocation
- **Location:** `server/src/routes/adminDevices.ts` (Lines 66, 102, 137)
- **Operations:**
  1. Check firm device limit against count of `APPROVED` devices.
  2. Update `devices` (`status = 'APPROVED' | 'REJECTED' | 'REVOKED'`, `approved_at`, `revoked_at`).
  3. Insert into `admin_audit`.
- **Atomicity Requirement:** Device authorization must enforce plan quota invariants. Cannot approve a device beyond the firm's `max_devices` limit.
- **D1 Replacement Mechanism:**
  Pre-read approved count; batch `UPDATE devices` and `INSERT admin_audit`.

---

### Scenario 8: Fee Payment, Receipt Numbering & Balance Updates
- **Location:** `server/src/routes/feePayments.ts` (Line 155), `feeAgreements.ts` (Line 178)
- **Operations:**
  1. Atomically increment receipt sequence in `number_sequences`.
  2. Format sequential receipt number: `REC-{YYYY}-{SEQ_00000}`.
  3. Insert into `fee_payments`.
  4. Update `fee_agreements.paid_amount_paisa = paid_amount_paisa + payment_amount`.
  5. Insert into `audit_log`.
- **Concurrency & Collision Risk:** Two cashiers receiving payments simultaneously must never receive the same receipt number.
- **D1 Replacement & Lock Pattern:**
  SQLite handles serialized writes. By executing an atomic `UPDATE number_sequences SET current_value = current_value + 1 WHERE ... RETURNING current_value`, D1 guarantees strict sequence ordering without race conditions.
  The complete payment batch executes:
  ```typescript
  await d1.batch([
    d1.prepare(`
      INSERT INTO number_sequences (id, firm_id, sequence_type, year, current_value, updated_at)
      VALUES (?, ?, 'FEE_PAYMENT', ?, 1, ?)
      ON CONFLICT (firm_id, sequence_type, year)
      DO UPDATE SET current_value = number_sequences.current_value + 1, updated_at = ?
    `).bind(seqId, firmId, currentYear, now, now),
    
    db.insert(schema.feePayments).values({ ...paymentData, receiptNumber }),
    
    d1.prepare(`
      UPDATE fee_agreements 
      SET paid_amount_paisa = paid_amount_paisa + ?, updated_at = ?
      WHERE id = ? AND firm_id = ?
    `).bind(paymentPaisa, now, agreementId, firmId),
    
    db.insert(schema.auditLog).values(auditEntry)
  ]);
  ```

---

## 3. Comprehensive Transaction Conversion Matrix

| File Path | Line | Function / Intent | Reads Involved | Mutating Statements in Batch | Atomicity Risk if Split | Replacement Mechanism |
|---|---|---|---|---|---|---|
| `adminDevices.ts` | 66 | Approve device | Firm max devices, active device count | `UPDATE devices`, `INSERT admin_audit` | Over-allocation of device seats | `d1.batch([updateDevice, insertAudit])` |
| `adminDevices.ts` | 102 | Reject device | Device record | `UPDATE devices`, `INSERT admin_audit` | Audit missing for rejected hardware | `d1.batch([updateDevice, insertAudit])` |
| `adminDevices.ts` | 137 | Revoke device | Device record | `UPDATE devices`, `INSERT admin_audit` | Device unrevoked or missing audit | `d1.batch([updateDevice, insertAudit])` |
| `adminFirms.ts` | 179 | Create firm + owner | Email collision check | `INSERT firms`, `INSERT users`, `INSERT license_events`, `INSERT admin_audit` | Orphaned tenant without admin owner | `d1.batch([firm, user, event, audit])` |
| `adminFirms.ts` | 444 | Suspend firm | Firm status | `UPDATE firms`, `INSERT license_events`, `INSERT admin_audit` | Firm suspended with no license event record | `d1.batch([updateFirm, insertEvent, insertAudit])` |
| `adminFirms.ts` | 485 | Disable firm | Firm status | `UPDATE firms`, `INSERT license_events`, `INSERT admin_audit` | Firm disabled without audit record | `d1.batch([updateFirm, insertEvent, insertAudit])` |
| `adminFirms.ts` | 526 | Reactivate firm | Firm status | `UPDATE firms`, `INSERT license_events`, `INSERT admin_audit` | Firm active without recorded reactivation event | `d1.batch([updateFirm, insertEvent, insertAudit])` |
| `adminFirms.ts` | 584 | Cascade soft-delete firm | Firm users, cases | `UPDATE firms`, `UPDATE users`, `INSERT license_events`, `INSERT admin_audit` | Incomplete cascade leaves ghost users | `d1.batch([updateFirm, updateUsers, insertEvent, insertAudit])` |
| `adminFirms.ts` | 680 | Update license params | Current firm parameters | `UPDATE firms`, `INSERT license_events`, `INSERT admin_audit` | Unrecorded quota or price adjustments | `d1.batch([updateFirm, insertEvent, insertAudit])` |
| `adminFirms.ts` | 751 | Renew firm license | Expiry date, plan | `UPDATE firms`, `INSERT license_events`, `INSERT admin_audit` | License date updated with no renewal trail | `d1.batch([updateFirm, insertEvent, insertAudit])` |
| `adminFirms.ts` | 803 | Record sub payment | Firm balance, plan | `INSERT payments`, `UPDATE firms`, `INSERT license_events`, `INSERT admin_audit` | Financial payment recorded without updating license | `d1.batch([insertPayment, updateFirm, insertEvent, insertAudit])` |
| `adminFirms.ts` | 1020 | Extend trial | Trial status | `UPDATE firms`, `INSERT license_events`, `INSERT admin_audit` | Trial extended without audit trail | `d1.batch([updateFirm, insertEvent, insertAudit])` |
| `adminFirms.ts` | 1113 | Convert trial to paid | Trial status, plan | `UPDATE firms`, `INSERT license_events`, `INSERT admin_audit` | Paid conversion without license event | `d1.batch([updateFirm, insertEvent, insertAudit])` |
| `feeAgreements.ts` | 178 | Update fee agreement | Agreement terms | `UPDATE fee_agreements`, `INSERT fee_agreement_changes`, `INSERT audit_log` | Contract changed without audit history | `d1.batch([updateAgreement, insertChange, insertAudit])` |
| `feePayments.ts` | 155 | Collect fee payment | Sequence counter, agreement | `UPSERT number_sequences`, `INSERT fee_payments`, `UPDATE fee_agreements`, `INSERT audit_log` | Duplicate receipt number, uncredited payment | `d1.batch([upsertSeq, insertPayment, updateAgreement, insertAudit])` |
| `hearings.ts` | 146 | Create hearing | Case hearings | `INSERT hearings`, `UPDATE cases`, `INSERT audit_log` | Court date missing from case overview | `d1.batch([insertHearing, updateCase, insertAudit])` |
| `hearings.ts` | 218 | Update hearing | Existing hearing | `UPDATE hearings`, `UPDATE cases`, `INSERT audit_log` | Case next hearing pointer out of sync | `d1.batch([updateHearing, updateCase, insertAudit])` |
| `hearings.ts` | 327 | Adjourn hearing | Existing hearing | `UPDATE hearings`, `INSERT hearings`, `INSERT hearing_date_history`, `UPDATE cases`, `INSERT audit_log` | Lost hearing history, inaccurate court calendar | `d1.batch([updateOld, insertNew, insertHistory, updateCase, insertAudit])` |
| `hearings.ts` | 434 | Bulk status update | Hearing IDs | `UPDATE hearings (N)`, `INSERT audit_log` | Partial bulk update | `d1.batch([...updateHearings, insertAudit])` |
| `hearings.ts` | 512 | Bulk reschedule | Hearing IDs | `UPDATE hearings (N)`, `INSERT hearing_date_history (N)`, `UPDATE cases`, `INSERT audit_log` | Rescheduled court dates without history log | `d1.batch([...updateHearings, ...insertHistories, ...updateCases, insertAudit])` |
| `hearings.ts` | 563 | Bulk adjourn | Hearing IDs | `UPDATE hearings (N)`, `INSERT hearings (N)`, `INSERT hearing_date_history (N)`, `UPDATE cases`, `INSERT audit_log` | Incomplete court adjournments | `d1.batch([...updates, ...newHearings, ...histories, ...cases, insertAudit])` |
| `hearings.ts` | 645 | Adjourn next | Existing hearing | `UPDATE hearings`, `INSERT hearings`, `INSERT hearing_date_history`, `UPDATE cases`, `INSERT audit_log` | Missing subsequent court date | `d1.batch([updateOld, insertNew, insertHistory, updateCase, insertAudit])` |
| `hearings.ts` | 746 | Delete hearing | Case hearings | `UPDATE hearings (soft-delete)`, `UPDATE cases (recalculate)`, `INSERT audit_log` | Case next hearing pointer referencing deleted hearing | `d1.batch([deleteHearing, updateCase, insertAudit])` |
