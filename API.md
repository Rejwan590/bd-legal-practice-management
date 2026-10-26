# API.md — REST API Specification

This document is the definitive reference for the BD Legal Practice Management REST API.

---

## 1. Authentication & Security Architecture

### 1.1 Dual Authentication Paradigms

1. **Chamber Tenant API (`/api/v1/*`)**:
   - Authentication via signed JSON Web Token stored in an `httpOnly`, `Secure`, `SameSite=Lax` cookie named `access_token`.
   - Signed using `JWT_SECRET` (minimum 32 characters).
   - Validated by `firmAuthMiddleware`:
     - Checks token validity and decodes `userId` and `firmId`.
     - Validates device authorization (`device_key` cookie verified against `devices` table).
     - Queries current user record to verify account active status and real-time permissions.
     - Blocks requests if the firm is suspended or disabled.
     - Rejects Super Admin tokens.
2. **Platform Super Admin API (`/api/admin/*`)**:
   - Authentication via signed JSON Web Token stored in an `httpOnly`, `Secure`, `SameSite=Strict` cookie named `admin_access_token`.
   - Signed using separate `ADMIN_JWT_SECRET`.
   - Validated by `adminAuthMiddleware`:
     - Checks token validity and verifies admin identity against `platform_admins`.
     - 15-minute token expiry with sliding session on active calls (`GET /api/admin/auth/me`).
     - Rejects chamber tenant tokens.

### 1.2 Rate Limiting
- Tenant Login: Max 6 consecutive failed attempts per IP/account before temporary lockout (`HTTP 429 RATE_LIMITED`).
- Super Admin Login: Max 5 failed attempts before lockout (`HTTP 429 RATE_LIMITED`).

### 1.3 Error Handling & Status Codes
All error responses return a standardized JSON envelope:
```json
{
  "code": "ERROR_CODE",
  "message": "Human-readable explanation of error",
  "details": {}
}
```
Standard status codes:
- `400 Bad Request`: Validation failure (Zod parsing errors).
- `401 Unauthorized`: Missing, expired, or invalid session cookie.
- `403 Forbidden`: Lacking required permission, firm isolation violation, device pending/revoked, or subscription read-only.
- `404 Not Found`: Record does not exist, or hidden across tenant boundaries / visibility filters.
- `429 Too Many Requests`: Rate limit exceeded.
- `500 Internal Server Error`: Unexpected server exception.

---

## 2. Chamber Tenant API Catalog (`/api/v1`)

### 2.1 Authentication & Session (`/api/v1/auth`)

#### `POST /api/v1/auth/login` `[BUILT]`
- **Body**: `{ "email": "lawyer@firm.bd", "password": "SecurePassword123!" }`
- **Response**: `200 OK` `{ "success": true, "user": { ... } }`
- Sets `access_token` and `device_key` cookies.

#### `GET /api/v1/auth/me` `[BUILT]`
- **Response**: `200 OK` Returns current user profile, firm details, role, permissions, and device status. Slides session.

#### `POST /api/v1/auth/logout` `[BUILT]`
- Clears session cookies.

---

### 2.2 Firms & Settings (`/api/v1/firms`)

#### `GET /api/v1/firms/current` `[BUILT]`
- Returns current firm profile and subscription details.

#### `PATCH /api/v1/firms/current` `[BUILT]`
- **Guard**: `requirePermission('settings.manage')`, `enforceSubscriptionReadOnly`.
- **Allowed fields**: `name`, `barCouncilReg`, `officeAddress`, `courtAffiliations`, `contact`, `visibilityMode`.

---

### 2.3 Users & Hierarchy (`/api/v1/users`)

#### `GET /api/v1/users` `[BUILT]`
- Lists chamber staff members within the tenant.

#### `POST /api/v1/users` `[BUILT]`
- **Guard**: `requireOwner` or `users.manage`, `enforceSubscriptionReadOnly`.
- **Body**: `{ "name": "...", "email": "...", "password": "...", "role": "Staff", "jobType": "lawyer_junior", "reportsToUserId": "...", "permissions": [...] }`
- Enforces seat limit and rejects circular reporting hierarchy.

#### `PATCH /api/v1/users/:id` `[BUILT]`
- Updates user metadata, job title, and supervisor assignment.

#### `PATCH /api/v1/users/:id/permissions` `[BUILT]`
- Updates user granular permission list.

#### `POST /api/v1/users/:id/deactivate` & `reactivate` `[BUILT]`
- Deactivates or reactivates user. Cannot deactivate last active Owner.

---

### 2.4 Clients Module (`/api/v1/clients`)

#### `GET /api/v1/clients` `[BUILT]`
- Query params: `search`, `limit`, `offset`, `archived`.
- Returns paginated client list respecting firm scoping.

#### `POST /api/v1/clients` `[BUILT]`
- **Guard**: `requirePermission('clients.edit')`, `enforceSubscriptionReadOnly`.
- **Body**: `{ "name": "...", "nameBn": "...", "phone": "...", "email": "...", "address": "...", "notes": "..." }`

#### `GET /api/v1/clients/:id` `[BUILT]`
- Retrieves single client dossier.

#### `PATCH /api/v1/clients/:id` `[BUILT]`
- Updates client details.

#### `DELETE /api/v1/clients/:id` `[BUILT]`
- Soft-deletes client (`deleted_at = NOW()`). Warns and blocks if client has active cases.

#### `GET /api/v1/clients/:id/overview` `[BUILT]`
- Returns linked counts and summary metrics (cases, upcoming hearings, open tasks, physical files).

#### `GET /api/v1/clients/:id/photo` `[BUILT]`
- Returns cached image binary (`image/jpeg`, `image/webp`, `image/png`) with `Cache-Control: private`.

#### `PUT /api/v1/clients/:id/photo` `[BUILT]`
- **Guard**: `requirePermission('clients.edit')`, `enforceSubscriptionReadOnly`.
- **Body**: `{ "mime": "image/jpeg", "bytes": "<base64>" }` (Max 300KB).
- Validates real magic bytes.

#### `DELETE /api/v1/clients/:id/photo` `[BUILT]`
- Removes client photo.

#### `GET /api/v1/clients/:id/notes` `[BUILT]`
- Retrieves paginated notes for client.

#### `POST /api/v1/clients/:id/notes` `[BUILT]`
- **Body**: `{ "noteDate": "2026-10-21", "body": "Discussed bail bond documentation." }`

---

### 2.5 Cases Module (`/api/v1/cases`)

#### `GET /api/v1/cases` `[BUILT]`
- Filters: `status`, `court`, `matterType`, `responsibleLawyerId`, `clientId`, `search`, `scope` (`my` | `team` | `all`).
- Applies central visibility rule (`canUserSeeCase`).

#### `POST /api/v1/cases` `[BUILT]`
- **Guard**: `requirePermission('cases.create')`, `enforceSubscriptionReadOnly`.
- **Body**:
  ```json
  {
    "clientId": "...",
    "caseNumber": "Civil Revision 102/2025",
    "court": "High Court Division, Bench No. 12",
    "matterType": "Civil Revision",
    "caseCategory": "civil",
    "partyARole": "Petitioner",
    "partyBRole": "Respondent",
    "plaintiff": "Abdul Karim",
    "defendant": "Government of Bangladesh",
    "ourRole": "Petitioner",
    "policeStation": "Motijheel",
    "sectionsOfLaw": "Section 115 CPC",
    "restricted": false
  }
  ```

#### `GET /api/v1/cases/:id` `[BUILT]`
- Fetches case dossier. Returns 404 if hidden by visibility rule or restricted flag.

#### `PATCH /api/v1/cases/:id` `[BUILT]`
- Updates case attributes and triggers audit log.

#### `DELETE /api/v1/cases/:id` `[BUILT]`
- Soft-deletes case and dismisses linked pending reminders.

#### `GET /api/v1/cases/:id/counts` `[BUILT]`
- Returns counts of linked hearings, tasks, files, and notes.

#### `POST /api/v1/cases/:id/shares` & `DELETE .../shares/:userId` `[BUILT]`
- Grants or revokes explicit case access for team members.

---

### 2.6 Hearings Module & Date Fixed For (`/api/v1/hearings`)

#### `GET /api/v1/hearings` `[BUILT]`
- Query params: `caseId`, `date`, `status`, `fixed_for` `[PLANNED]`.
- Filters by case visibility.

#### `POST /api/v1/hearings` `[BUILT]` / `[PLANNED with fixed_for]`
- **Body**:
  ```json
  {
    "caseId": "...",
    "scheduledAt": "2026-11-05T09:30:00Z",
    "court": "Joint District Judge Court 1, Dhaka",
    "appearingLawyerId": "...",
    "purpose": "Hearing on injunction petition",
    "fixedFor": "hearing",
    "fixedForNote": ""
  }
  ```
- Updates `cases.next_hearing_at`.

#### `POST /api/v1/hearings/:id/reschedule` `[BUILT]`
- **Body**:
  ```json
  {
    "scheduledAt": "2026-11-20T09:30:00Z",
    "reason": "Presiding judge on leave",
    "fixedFor": "plaintiff_evidence",
    "fixedForNote": ""
  }
  ```
- Creates `hearing_date_history` row recording old date, new date, old `fixed_for`, new `fixed_for`, and reason.

#### `POST /api/v1/hearings/:id/adjourn` `[BUILT]`
- **Body**:
  ```json
  {
    "nextDate": "2026-12-01T09:30:00Z",
    "reason": "Time prayer filed by opposite party",
    "nextFixedFor": "hearing",
    "nextFixedForNote": ""
  }
  ```
- Marks current hearing `adjourned`, records history, and schedules next hearing.

---

### 2.7 Appointments Module (`/api/v1/appointments`)

#### `GET /api/v1/appointments` `[BUILT]`
- Query params: `startDate`, `endDate`, `status`, `type`, `userId`.

#### `POST /api/v1/appointments` `[BUILT]`
- **Body**:
  ```json
  {
    "title": "Client intake conference",
    "type": "client_meeting",
    "mode": "in_person",
    "startsAt": "2026-10-22T14:00:00Z",
    "endsAt": "2026-10-22T15:00:00Z",
    "clientId": "...",
    "attendees": ["user_1", "user_2"]
  }
  ```
- Warns if attendee has scheduling conflicts.

#### `POST /api/v1/appointments/:id/reschedule` `[BUILT]`
- Updates appointment time with audit entry.

---

### 2.8 Tasks Module (`/api/v1/tasks`) `[BUILT]`

#### `GET /api/v1/tasks` `[BUILT]`
- Query params: `caseId`, `clientId`, `assignedTo`, `status`, `priority`, `search`, `limit`, `offset`.
- Enforces staff partitioning (staff without `tasks.assign` see only tasks assigned to them).

#### `GET /api/v1/tasks/:id` `[BUILT]`

#### `POST /api/v1/tasks` `[BUILT]`
- **Guard**: `requirePermission('tasks.assign')`, `enforceSubscriptionReadOnly`.
- Records audit `TASK_ASSIGN`.

#### `PATCH /api/v1/tasks/:id` `[BUILT]`
- Reopening requires `tasks.complete`, metadata changes require `tasks.assign`.

#### `POST /api/v1/tasks/:id/complete` `[BUILT]`
- **Guard**: `requirePermission('tasks.complete')`.
- Appends optional completion note and timestamps completion.

#### `POST /api/v1/tasks/:id/reassign` `[BUILT]`
- **Guard**: `requirePermission('tasks.assign')`.

#### `DELETE /api/v1/tasks/:id` `[BUILT]`
- Soft delete with audit log.

---

### 2.9 Accounts & Billing Module (`/api/v1/fee-agreements`, `/api/v1/fee-payments`, `/api/v1/expenses`, `/api/v1/accounts`) `[BUILT]`

Financial management module for chamber client litigation fees and expenses.
All monetary amounts are stored strictly as integer paisa (1 BDT = 100 paisa).
Enforces central case visibility, confidentiality (`restricted.view`), firm isolation, idempotency, atomic receipt numbering, soft-deletes, and subscription read-only guards.

#### 2.9.1 Fee Agreements (`/api/v1/fee-agreements`)
- `GET /api/v1/fee-agreements`: Lists agreements with filters (`clientId`, `caseId`, `status`, `feeType`). Gated by `accounts.view`.
- `GET /api/v1/fee-agreements/:id`: Returns agreement details with client and case metadata.
- `GET /api/v1/fee-agreements/:id/changes`: Returns revision history (`fee_agreement_changes`).
- `POST /api/v1/fee-agreements`: Creates fee agreement. Gated by `accounts.manage`, `enforceSubscriptionReadOnly`.
  - Body: `{ "clientId": "...", "caseId": "...", "feeType": "fixed"|"per_hearing"|"hourly"|"retainer"|"installment", "agreedAmountPaisa": 5000000, "agreementDate": "2026-10-26T00:00:00Z", "notes": "..." }`
- `POST /api/v1/fee-agreements/:id/revise`: Modifies agreed fee amount, recording revision history with required `reason`.
- `POST /api/v1/fee-agreements/:id/close`: Closes agreement.
- `POST /api/v1/fee-agreements/:id/void`: Voids agreement with required `reason`.

#### 2.9.2 Fee Payments Received (`/api/v1/fee-payments`)
- `GET /api/v1/fee-payments`: Lists payments with filters (`clientId`, `caseId`, `feeAgreementId`, `status`, `limit`, `offset`).
- `GET /api/v1/fee-payments/:id`: Returns payment record.
- `POST /api/v1/fee-payments`: Records payment received. Gated by `accounts.manage`, `enforceSubscriptionReadOnly`.
  - Body: `{ "clientId": "...", "caseId": "...", "feeAgreementId": "...", "hearingId": "...", "paymentDate": "2026-10-26T12:00:00Z", "amountPaisa": 2500000, "method": "cash"|"bank"|"bkash"|"nagad"|"cheque"|"other", "reference": "TRX-12345", "purposeNote": "Advance for filing", "idempotencyKey": "uuid" }`
  - Atomically increments and assigns receipt number (e.g. `R-000001`) from `number_sequences`.
  - Enforces duplicate idempotency key deduplication (returns existing record without duplicate receipt number).
- `POST /api/v1/fee-payments/:id/void`: Voids payment with required `voidReason`. Gated by `accounts.manage`, `enforceSubscriptionReadOnly`. Excludes payment from balances.

#### 2.9.3 Expenses (`/api/v1/expenses`)
- `GET /api/v1/expenses/categories`: Lists firm expense categories (`expense_categories`).
- `GET /api/v1/expenses`: Lists chamber expenses with filters (`clientId`, `caseId`, `categoryId`, `status`).
- `GET /api/v1/expenses/:id`: Returns expense record.
- `POST /api/v1/expenses`: Records an expense. Gated by `expenses.record`, `enforceSubscriptionReadOnly`.
  - Body: `{ "clientId": "...", "caseId": "...", "categoryId": "...", "expenseDate": "2026-10-26T00:00:00Z", "amountPaisa": 150000, "description": "Court filing fee & stamp", "reimbursable": true }`
- `POST /api/v1/expenses/:id/void`: Voids expense with required `voidReason`. Gated by `accounts.manage`, `enforceSubscriptionReadOnly`.

#### 2.9.4 Accounts Summary & Client Balances (`/api/v1/accounts`)
- `GET /api/v1/accounts/summary`: Returns chamber-wide, client-specific, or case-specific financial summary (`agreedPaisa`, `receivedPaisa`, `balancePaisa`, `isOverpaid`, `creditPaisa`, `expensesPaisa`). Query params: `clientId`, `caseId`. Gated by `accounts.view`.
- `GET /api/v1/accounts/client-balances`: Returns sortable list of all clients with outstanding balances and payment metrics. Query params: `search`, `sortBy` (`balance_desc`, `balance_asc`, `name`), `limit`, `offset`. Gated by `accounts.view`.

---

### 2.10 Planned Modules (`/files`, `/reminders`) `[PLANNED]`

Target endpoints for upcoming phases:
- `GET /api/v1/files` & `POST /api/v1/files/:id/checkout` / `checkin`: Physical custody movement.
- `GET /api/v1/reminders`: Chamber deadline notification center.

---

## 3. Super Admin API Catalog (`/api/admin`)

### 3.1 Super Admin Auth
- `POST /api/admin/auth/login`
- `GET /api/admin/auth/me`
- `POST /api/admin/auth/logout`

### 3.2 Firm Lifecycle & Licensing
- `GET /api/admin/firms`: Lists all tenant firms with device and seat counts.
- `POST /api/admin/firms`: Provisions new firm and primary Owner user in a transaction.
- `POST /api/admin/firms/:id/suspend`: Suspends firm (forces immediate session invalidation).
- `POST /api/admin/firms/:id/disable`: Disables firm.
- `POST /api/admin/firms/:id/reactivate`: Restores active status.
- `POST /api/admin/firms/:id/renew`: Extends subscription license.
- `POST /api/admin/firms/:id/payments`: Records manual payment (bKash/Nagad/Bank).

### 3.3 Device Management
- `GET /api/admin/devices`: Lists browser device authorization requests.
- `POST /api/admin/devices/:id/approve`: Approves pending browser seat.
- `POST /api/admin/devices/:id/reject`: Rejects browser seat.
- `POST /api/admin/devices/:id/revoke`: Revokes browser seat immediately.

### 3.4 Audit Trail
- `GET /api/admin/audit`: Filterable log of all super admin mutations.
