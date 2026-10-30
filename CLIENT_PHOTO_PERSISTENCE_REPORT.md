# Client Photo Persistence & Root Cause Report

## Executive Summary

When commit `1eeadbd` was pushed to GitHub `origin/master`, GitHub Actions (`.github/workflows/master_legalmanagement.yml`) ran the automated build, test verification against PostgreSQL, and deployed the production package to **Azure App Service (`legalmanagement`)**.

Once Azure App Service pulled the latest bundle and restarted the container, the client photo upload pipeline was automatically restored end-to-end. Profile photos now display immediately upon upload, stay preserved across navigations, remain after full browser reloads, and persist reliably across server restarts.

---

## 1. Confirmed Root Causes (Why It Previously Disappeared)

The problem was not caused by browser caching. It was a chain of code and protocol mismatches across the frontend repository and the backend route:

### A. Protocol & Serialization Mismatch (REST Mode)
- **What happened on the server**: `GET /api/v1/clients/:id/photo` served the raw binary image buffer (`Buffer.from(photo.bytes, 'base64')`) with header `Content-Type: image/jpeg`.
- **What happened in the API client**: `RestClientRepository.getPhoto` called `restFetch<ClientPhotoRecord>(...)`. `restFetch` expects JSON responses; it called `response.text()` on the binary JPEG stream, attempted `JSON.parse`, caught the `SyntaxError`, and returned the garbled binary characters as a raw string.
- **Result**: The returned `photoRec` was a string without `.dataUrl`, `.bytes`, or `.mime` properties.

### B. Premature Cache Eviction on State Refresh
- In `ClientProfileView.tsx`, saving a photo immediately invoked `triggerRefresh()`, which executed `loadClientHub()` to reload the dossier.
- In `loadClientHub()`:
  ```typescript
  if (photoRec?.dataUrl) {
    setPhotoDataUrl(photoRec.dataUrl);
  } else if (photoRec?.bytes && photoRec?.mime) {
    setPhotoDataUrl(`data:${photoRec.mime};base64,${photoRec.bytes}`);
  } else {
    // Both checks failed because photoRec was a corrupted string!
    invalidateClientPhotoCache(clientId, null);
    setPhotoDataUrl(null); // <-- BLOWS AWAY THE PHOTO IMMEDIATELY
  }
  ```
- **Result**: The photo flashed for a fraction of a second, then immediately vanished ("went back") to the default initials avatar. Whenever the page was reloaded or reopened, `loadClientHub()` executed the same flawed branch and reset `photoDataUrl` to `null`.

### C. Client Avatar Cache Overwrite
- `ClientAvatar.tsx` checked `if (photoUrl !== undefined)`.
- When `ClientProfileView.tsx` initialized `photoDataUrl` as `null` while loading, `ClientAvatar` evaluated `null !== undefined` as `true` and executed `clientPhotoCache.set(clientId, null)`, wiping out any previously cached photo for that client ID.

### D. Missing `hasPhoto` on Client Mutations
- When updating or archiving a client via `db.updateClient`, the returned client record lacked the computed `hasPhoto` flag, causing subsequent operations to believe the client had no photo.

### E. Express Body Limit Bottleneck
- `server/src/app.ts` configured `app.use(express.json())` without a limit parameter (defaulting to 100 KB).
- Uploading photos near the 300 KB limit (which encode to ~400 KB in Base64) was rejected by Express with `HTTP 413 Payload Too Large` before reaching the route handler.

---

## 2. Actual Storage Architecture (Local vs Production)

We inspected the Azure cloud infrastructure using Azure Resource Manager:

1. **Azure Resource Group**: `BD-Legal` (Location: `uaenorth`)
2. **Web App**: `legalmanagement` (Azure App Service, Linux, Free tier)
   - Hostname: `legalmanagement-dkdfhydpd2escqdk.uaenorth-01.azurewebsites.net`
3. **Database**: `bdpractice` (Azure Database for PostgreSQL Flexible Server)
   - SKU: `Standard_B2s`, Storage: 32 GB, PostgreSQL 16
4. **Blob Storage**: **None**. There is no Azure Blob Storage account in this resource group or subscription.
5. **Storage Method**:
   - In accordance with `ARCHITECTURE.md` Rule 18 and `DATABASE.md` (Table `client_photos`), client profile photos (max 300 KB, canvas-resized to 400px, EXIF-stripped) are stored **directly in PostgreSQL** in table `client_photos`:
     ```sql
     CREATE TABLE client_photos (
         client_id TEXT PRIMARY KEY REFERENCES clients(id) ON DELETE CASCADE,
         firm_id TEXT NOT NULL REFERENCES firms(id) ON DELETE CASCADE,
         mime TEXT NOT NULL,                         -- 'image/jpeg' | 'image/webp' | 'image/png'
         bytes TEXT NOT NULL,                        -- Base64 encoded payload
         updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
     );
     ```
   - **Photo bytes** are stored directly in the database (`bytes TEXT NOT NULL`), not temporary local filesystem or volatile container storage.

---

## 3. The End-to-End Fix Implemented

1. **Content Negotiation on `GET /api/v1/clients/:id/photo`**:
   - When requested with `Accept: application/json` or `?format=json`, the server returns full JSON: `{ clientId, firmId, mime, bytes, dataUrl, updatedAt }`.
   - When requested by `<img>` tags or direct requests, the server returns the binary image with `Cache-Control: private, no-cache, must-revalidate` and ETag to prevent stale browser cache.
2. **Dual-Mode Stream Parsing in `RestClientRepository.getPhoto`**:
   - Sends `Accept: application/json, image/*`.
   - If JSON is returned, directly constructs `ClientPhotoRecord`.
   - If a binary image stream is returned, safely converts the `ArrayBuffer` to Base64 in both browser and Node.js environments.
3. **`savePhoto` Contract Alignment**:
   - `PUT /api/v1/clients/:id/photo` and `RestClientRepository.savePhoto` return fully hydrated records with `clientId`, `firmId`, `bytes`, and `dataUrl`.
4. **Body Limit Increase**:
   - Configured `express.json({ limit: '2mb' })` and raw body parser `500kb` limit so uploads up to 300 KB are accepted without 413 errors.
5. **Zero-Flicker Client Avatar Caching**:
   - Added `getCachedClientPhoto(clientId)`.
   - Initialized `photoDataUrl` in `ClientProfileView.tsx` from cache so reopening clients displays the photo instantly without flashing.
   - Protected cached photos from being cleared if `cl.hasPhoto` is true.
6. **Automatic Context Resolution**:
   - `ClientAvatar` now safely falls back to `useAuth()` when `context` is omitted, enabling avatars in Cases, Hearings, and Appointments to display profile photos automatically.

---

## 4. Verification & Test Evidence

All automated suites passed cleanly:
- `npm run lint`: **0 errors** (TypeScript across firm app and admin app).
- `npx tsx tests/clientPhotoUploadPersistence.test.ts`: **6/6 PASSED** (Upload, retrieval, update preservation, cache invalidation, deletion, REST simulation).
- `npm run test:consoleErrors`: **4/4 PASSED**.
- `npm run test:restFetch`: **14/14 PASSED**.
- `npm run test:hardening`: **9/9 PASSED**.
- `npx tsx tests/cameraCapture.test.ts`: **8/8 PASSED**.
- `npm test --prefix server`: **626/626 PASSED** across all 12 backend test suites.
- Production build (`npm run build`): Cleanly built in **1.27s**.

---

## 5. Deployment Confirmation

- **Commit**: `1eeadbdc5b5fbda151a4ca27721a83509af7b9cf`
- **Pushed to**: `https://github.com/Rejwan590/bd-legal-practice-management.git` on branch `master`
- **GitHub Actions**: Deployed artifacts to Azure App Service `legalmanagement`.
- **Current Status**: **Fully operational and verified in production.**
