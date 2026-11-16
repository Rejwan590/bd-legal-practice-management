# System Audit Trail Bug Fix Log

**Date**: 2026-10-31  
**Auditor**: Senior Full-Stack Engineer & Security Auditor  
**Repository**: `bd-legal-practice-management`

---

## 1. Confirmed Defects & Resolutions

### Defect 1: Physical File Check-Out and Check-In Custody Events Missing from Audit Trail
- **Severity**: High (Primary User Defect)
- **Root Cause**:
  1. In `src/data/repositories/file.ts`, `checkOut` and `checkIn` wrote to `this.auditRepo.record(...)` using `oldValue: existing` and `newValue: { file, movement }`. Top-level `caseId` was absent in `newValue`, which broke visibility matching in `listByCaseId` and server case filtering.
  2. In `src/data/repositories/rest/restAudit.ts`, `RestAuditLogRepository.list` queried `/api/v1/audit-log` without merging client-tracked physical file custody movements.
  3. In `src/modules/audit/AuditLogScreen.tsx`, the action filter dropdown had a hardcoded list of only 5 actions (`CREATE`, `UPDATE`, `DELETE`, `USER_SWITCH`, `LOGIN`), completely omitting custody actions.
  4. Return events were not explicitly linked to their corresponding checkout movement identifiers.
- **Fix**:
  1. Updated `src/data/repositories/file.ts`:
     - Standardized audit actions to `PHYSICAL_FILE_CHECKED_OUT` and `PHYSICAL_FILE_CHECKED_IN`.
     - Standardized `oldValue` and `newValue` shapes to include top-level `fileId`, `serial`, `title`, `caseId`, `status`, `shelfLocation`, `currentHolderId`, `currentHolderName`, `checkedOutAt`, and `dueBackAt`.
     - In `checkIn`, queried prior checkout movements to set `linkedCheckoutMovementId: previousCheckout?.id || null`.
  2. Updated `src/data/repositories/rest/restAudit.ts`:
     - Implemented `record()` method in `RestAuditLogRepository`.
     - Updated `list()` to merge client-tracked records with server records using deduplication and timestamp ordering.
     - Updated `listByCaseId()` to match `caseId` from top-level and nested file records.
  3. Updated `src/modules/audit/AuditLogScreen.tsx`:
     - Populated action filter with all standard actions (`PHYSICAL_FILE_CHECKED_OUT`, `PHYSICAL_FILE_CHECKED_IN`, `FILE_CHECKOUT`, `FILE_CHECKIN`, `HEARING_DATE_CHANGE`, `TASK_ASSIGN`, `TASK_COMPLETE`, `LOGOUT`, etc.) and dynamically discovered actions from logs.
     - Added specialized badge color formatting and inline preview chips for custody changes (`Holder: ... (Due: ...)`, `Location: ...`).
- **Files Modified**:
  - `src/data/types.ts`
  - `src/data/repositories/file.ts`
  - `src/data/repositories/rest/restAudit.ts`
  - `src/data/repositories/index.ts`
  - `src/modules/audit/AuditLogScreen.tsx`
- **Regression Tests**:
  - `tests/auditTrailFlow.test.ts` (Assertions 1-15)

---

### Defect 2: Missing Audit Event on User Logout
- **Severity**: Medium
- **Root Cause**:
  In `server/src/routes/auth.ts`, `POST /logout` invalidated the session cookie and revoked the JWT token, but never called `recordAudit`.
- **Fix**:
  Decoded the verified JWT access token prior to revocation to capture `userId`, `firmId`, `email`, and `req.ip`, and logged `action: 'LOGOUT'` with `entity: 'Session'`.
- **Files Modified**:
  - `server/src/routes/auth.ts`
- **Regression Tests**:
  - `server/tests/auditTrailComprehensive.test.ts` (Test 2: `POST /api/v1/auth/logout succeeds` and captures `LOGOUT` audit record)

---

### Defect 3: Missing Audit Event on Self-Service Password Change
- **Severity**: Medium
- **Root Cause**:
  In `server/src/routes/auth.ts`, `POST /change-password` updated the password hash in the database but did not create an audit log entry.
- **Fix**:
  Added `recordAudit({ entity: 'User', action: 'RESET_PASSWORD', ... })` with `{ selfService: true, changedAt: new Date().toISOString() }`, strictly excluding raw passwords and bcrypt hashes.
- **Files Modified**:
  - `server/src/routes/auth.ts`
- **Regression Tests**:
  - `server/tests/auditTrailComprehensive.test.ts` (Test 3: `POST /api/v1/auth/change-password succeeds` and verifies zero raw passwords or bcrypt hashes in logs)

---

### Defect 4: Server Audit Log Endpoint Missing Filter Query Parameters
- **Severity**: Low
- **Root Cause**:
  In `server/src/routes/audit.ts` and `server/src/db/client.ts`, `GET /api/v1/audit-log` only accepted `limit` and `offset`, ignoring `entity`, `action`, `userId`, `startDate`, and `endDate` query parameters.
- **Fix**:
  1. Updated `server/src/db/client.ts` in `MemoryDatabase` and `PostgresDatabase` to filter by `entity`, `action`, `userId`, `startDate`, and `endDate`.
  2. Updated `server/src/routes/audit.ts` to extract, sanitize, and pass filter parameters to `db.listAudit`.
- **Files Modified**:
  - `server/src/db/client.ts`
  - `server/src/routes/audit.ts`
- **Regression Tests**:
  - `server/tests/auditTrailComprehensive.test.ts` (Test 4: Entity filter, Action filter, UserId filter, and pagination checks)
