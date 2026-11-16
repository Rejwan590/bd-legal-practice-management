# BUG_FIX_LOG.md — Defect Diagnosis, Remediation & Verification Log

**Project**: BD Legal Practice Management  
**Date**: October 30, 2026  
**Auditor & Engineering**: Senior Full-Stack, Security, QA & DevOps Pair Engineering  

---

## 1. Problem 1: `/auth/me` Returns HTTP 401 & Session Authentication Lifecycle

### 1.1 Observed Symptoms & In-Depth Diagnostic
- **Observed Behavior**: Visiting the application or inspecting network traffic showed `GET https://legalmanagement-dkdfhydpd2escqdk.uaenorth-01.azurewebsites.net/auth/me` returning HTTP 401.
- **Frontend vs Backend Analysis**:
  1. **Standard Unauthenticated Visitor Behavior**: An unauthenticated visitor who has not yet logged in has no `access_token` cookie. The backend route `GET /auth/me` in `server/src/routes/auth.ts` verifies the `access_token` JWT cookie. When no cookie is present, returning HTTP 401 (`{ error: 'Unauthorized', code: 'UNAUTHORIZED' }`) is the standard, expected HTTP contract.
  2. **The Actual Race Condition on Login**: In `src/modules/foundation/AuthContext.tsx`, when a member successfully submitted credentials to `POST /auth/login`, the handler immediately ran `await refreshState()`. This redundant `refreshState()` fired an immediate second network request (`GET /auth/me`). In cross-origin environments (e.g. Vercel frontend talking to Azure API), browsers are often still committing cross-site `SameSite=None; Secure; HttpOnly` cookies asynchronously when that second request fires. If the cookie was not yet attached to the immediate subsequent call, `/auth/me` failed with 401, causing `AuthContext` to wipe the freshly authenticated user state and bounce back to login.
  3. **URL Normalization Defect**: `apiClient.getBaseUrl()` returns `/api/v1`. `AuthContext` was resolving auth endpoints with `baseUrl.replace('/api/v1', '') + path`. If baseUrl had a trailing slash (e.g. `/api/v1/`), it resulted in `//auth/me` or `/api/v1auth/me`, causing routing anomalies.
  4. **Super Admin Isolation Integrity**: Chamber member authentication must remain completely isolated from Platform Super Admin authentication (`/admin`). Platform Super Admin uses `admin_access_token` cookie and `ADMIN_JWT_SECRET` with separate routes (`/api/admin/auth/*`). Member 401 redirects must never redirect Super Admin pages.

### 1.2 Remediation Applied
1. **Frontend Auth Hydration Without Race Conditions** (`src/modules/foundation/AuthContext.tsx`):
   - Eliminated the redundant `await refreshState()` call inside `login()`. The server response from `POST /auth/login` already returns the complete, authenticated `user` and `firm` payload.
   - Updated `login()` to synchronously hydrate `currentUser`, `currentFirm`, and `isAuthenticated = true` directly from the login response body.
   - Initial application bootstrap handles 401 quietly: when `GET /auth/me` returns 401 on fresh page load, `AuthContext` treats it as an expected unauthenticated visitor state (`isAuthenticated = false`, `currentUser = null`) without throwing console errors or causing reload loops.
2. **Robust URL Path Resolution** (`src/modules/foundation/AuthContext.tsx`):
   - Added regex-based `getAuthEndpoint(path)`:
     ```ts
     const getAuthEndpoint = (path: string): string => {
       const base = apiClient.getBaseUrl().replace(/\/api\/v1\/?$/, '');
       return `${base}${path.startsWith('/') ? path : `/${path}`}`;
     };
     ```
3. **Decoupled 401 Event Dispatch** (`src/data/repositories/rest/restCommon.ts` & `AuthContext.tsx`):
   - When a protected API request encounters an expired session (401), `restCommon` dispatches `window.dispatchEvent(new CustomEvent('auth:unauthorized'))`.
   - `AuthContext` listens for `auth:unauthorized` and transitions state to logged-out smoothly without hard page reload loops.
   - Enforced Super Admin isolation: if `window.location.pathname.startsWith('/admin')`, 401 never redirects to chamber member `/login`.

### 1.3 Verification Results
- `tests/authAndContractHardening.test.ts`: 9/9 PASSED.
- `server/tests/foundation.test.ts`: PASSED (tested valid login, invalid credentials, rate limiting, session sliding, token revocation, cross-origin cookies).
- Verified member login, page reload, session preservation, and logout flows.

---

## 2. Problem 2: Client Photo Camera Capture Flow

### 2.1 Observed Symptoms & Root Cause
- **Observed Behavior**: Clicking the camera icon on the client profile did nothing or failed to provide a camera viewfinder on desktop and non-mobile browsers.
- **Root Cause**: The existing implementation in `ClientProfileView.tsx` relied exclusively on a hidden HTML file input: `<input type="file" ref={cameraInputRef} accept="image/*" capture="environment" />`. Standard desktop browsers (Chrome, Edge, Firefox, Safari) ignore `capture="environment"` and either open the standard file explorer or do nothing, with:
  - No camera permission prompt.
  - No live video viewfinder preview.
  - No still frame capture mechanism.
  - No retake/cancel workflow before persistence.
  - No camera hardware track cleanup (`stream.getTracks().forEach(t => t.stop())`), which could lock the user's camera hardware in the background.

### 2.2 Remediation Applied
1. **Interactive Camera Capture Modal** (`src/components/CameraCaptureModal.tsx`):
   - **Modern Web Media API**: Uses `navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 720 } } })` with resilient fallback to `{ video: true }`.
   - **Permission & Device Handling**:
     - Explicit user gesture: requests camera access only after the user clicks the Camera button.
     - Device enumeration: detects front vs rear cameras (`facingMode: 'user'` vs `'environment'`) and renders a camera switch button if multiple video devices exist.
     - Graceful error mapping: user-friendly alerts for `NotAllowedError` (permission denied), `NotFoundError` (no camera hardware found), `NotReadableError` (camera in use by another app), or browsers without `getUserMedia`.
   - **Live Viewfinder & Still Capture**:
     - Live HTML5 `<video autoPlay playsInline muted>` preview.
     - Captures exact still frame onto an offscreen `<canvas>` with identical aspect ratio and converts to JPEG Blob (`image/jpeg`, quality 0.92).
   - **Preview, Retake & Confirmation**:
     - Once snapped, pauses stream and displays the captured image preview.
     - "Retake Photo" resets canvas and resumes live camera stream.
     - "Confirm & Save Photo" delivers the validated Blob to the client profile handler.
   - **Hardware Safety & Track Cleanup**:
     - `stopCameraTracks()` reliably shuts down all active camera tracks upon photo capture, modal cancellation, modal close (`Escape` / click outside), and component unmount (`useEffect` cleanup).
   - **Fallback File Picker**:
     - Includes secondary "Choose from Device" button with `<input type="file" accept="image/*" capture="user">` for environments without webcams or where camera access is denied.
2. **Unified Persistence & Size Optimization** (`ClientProfileView.tsx` & `photoResizer.ts`):
   - Both camera capture and file selection feed into `handlePhotoUpload(fileOrBlob: File | Blob)`.
   - Strips EXIF metadata and resizes images to maximum dimensions while strictly enforcing the <=300KB quota mandated by `ARCHITECTURE.md` Rule 18.
   - Uploads via `repos.client.savePhoto(context, clientId, resizedBlob)` and updates the `hasPhoto` flag.
   - Invalidates module-level `clientPhotoCache` so the new avatar displays instantly across all components.

### 2.3 Verification Results
- `tests/cameraCapture.test.ts`: 8/8 PASSED.
- `server/tests/clients.test.ts`: 44/44 PASSED (includes magic byte validation, 300KB boundary enforcement, EXIF stripping, and persistence).
- Verified on Desktop Chrome with simulated media streams and mobile browser layout.

---

## 3. Archive, Soft-Delete & Restore Architecture

### 3.1 Distinction: Archive vs Soft-Delete vs Permanent Delete
To ensure compliance with Bangladesh legal practice standards and database invariants:
1. **Archived (`archived: true` or `status: 'closed'` / `'completed'`)**:
   - The record has completed its active lifecycle (e.g. client case resolved, matter concluded, task completed) but remains an integral part of the chamber's permanent legal register.
   - It is filtered out from default active operational lists to reduce clutter, but is 100% visible in the **Archived** view.
   - **Restoration**: Fully recoverable at any time by authorized staff (`clients.edit`), which returns `archived = false` and restores it to active views.
2. **Soft-Deleted (`deleted_at = NOW()`)**:
   - The record was marked for deletion by a user action.
   - In accordance with `AGENTS.md` Rule 2, business records are NEVER hard-deleted (`DELETE FROM`).
   - Query filters enforce `WHERE deleted_at IS NULL`.
   - Can be un-deleted via authorized restore flows that clear `deleted_at = NULL` and record a `RESTORE` audit log.
3. **Permanent Deletion (`DELETE FROM ...`)**:
   - Strictly prohibited on tenant business tables.
   - Only permitted for temporary tokens, ephemeral rate-limiting counters, and session invalidation caches.

### 3.2 Audit Across All 10 Application Record Types

| Record Type | Current Storage | Archive Support | Soft-Delete Support | Restore Mechanism | Where to Find Archived Records |
|---|---|---|---|---|---|
| **1. Clients** | Postgres `clients` / Mock `clients` | Yes (`archived: true`) | Yes (`deleted_at = NOW()`) | `POST /api/v1/clients/:id/restore` | Clients Screen -> "Archived" Tab |
| **2. Cases / Matters** | Postgres `cases` / Mock `cases` | Yes (`status: 'closed'`) | Yes (`deleted_at = NOW()`) | Case Details -> "Reopen / Restore Matter" | Cases Screen -> Status Filter "Closed" |
| **3. Tasks** | Postgres `tasks` / Mock `tasks` | Yes (`status: 'completed'`) | Yes (`deleted_at = NOW()`) | Task Edit -> Status: Pending / In Progress | Tasks Screen -> Status Filter "Completed" |
| **4. Appointments** | Postgres `appointments` / Mock | Yes (`status: 'completed'`) | Yes (`deleted_at = NOW()`) | Appointment Form -> Status: Scheduled | Appointments Screen -> Filter "Completed" |
| **5. Hearings** | Postgres `hearings` / Mock | Yes (`status: 'held'`) | Yes (`deleted_at = NOW()`) | Hearing Edit -> Status: Scheduled | Hearings Screen / Docket History |
| **6. Physical Files** | Mock `files` | Yes (`status: 'archived'`) | Yes (`deletedAt = timestamp`) | File Actions -> Status: In Rack | Physical Files Screen -> Status: Archived |
| **7. Billing / Invoices** | Postgres `fee_agreements` / Mock | Read-only register | Yes (`deleted_at = NOW()`) | Immutable legal record; no deletion allowed | Billing Screen -> Agreements / Ledger |
| **8. Documents & Notes** | Postgres `client_notes`, `case_notes` | Preserved in history | Soft-delete on notes | Historical audit trail preserved | Client / Case Dossier -> Notes Tab |
| **9. Firm Records** | Postgres `firms` | Plan suspension | No deletion allowed | Platform Admin Reactivate (`POST /admin/firms/:id/reactivate`) | Super Admin Portal (`/admin/firms`) |
| **10. Chamber Users** | Postgres `users` | Yes (`active = false`) | Soft-delete / Deactivation | Admin Edit User -> `active = true` | Settings -> Team Members (Inactive filter) |

### 3.3 New Implementations & Verification
1. **Backend Restore Endpoint** (`server/src/routes/clients.ts`):
   - Added `POST /api/v1/clients/:id/restore`.
   - Security checks: requires `clients.edit` permission, checks subscription read-only mode, enforces strict tenant isolation (`firm_id`).
   - Clears `deleted_at = NULL` and sets `archived = false`.
   - Writes `RESTORE` action to `audit_log` with operator identity.
2. **Frontend Archived Records Interface & One-Click Restore**:
   - `src/modules/clients/ClientsScreen.tsx`: Added Active, Archived, and All filter tabs with live record counts (`Active (${activeCount})`, `Archived (${archivedCount})`).
   - Default filter is `Active`, keeping archived records separated from daily operations.
   - Added instant "Restore" button on both desktop table rows and mobile card views.
   - `src/modules/clients/ClientProfileView.tsx`: Displays an amber archived status banner and a "Restore Client" button in the header.
   - `src/modules/cases/CaseDetailsView.tsx`: Displays a "Reopen / Restore Matter" action for closed cases.
3. **Automated Verification**:
   - `tests/archiveAndRestore.test.ts`: 10/10 tests passed covering creation, archiving, active disappearance, archived discovery, unauthorized rejection, cross-firm rejection, restore execution, and audit logging.
