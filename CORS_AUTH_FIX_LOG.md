# Production CORS and Authentication Connectivity Fix Log

**Repository**: `Rejwan590/bd-legal-practice-management`  
**Date**: November 2, 2026  
**Auditor**: Senior Full-Stack Engineer & Security Auditor  

---

## Issue 1: Missing Hardcoded Fallback for Production Vercel Origin

### Root Cause
In `server/src/app.ts` and `server/src/middleware/originCheck.ts`, allowed origins were evaluated strictly via:
```ts
const rawOrigins = process.env.CORS_ORIGIN || (isProduction ? '' : 'http://localhost:3000,http://localhost:3001');
```
If `CORS_ORIGIN` was unset, empty, or misconfigured in production, `allowedOrigins` evaluated to `[]`, rejecting legitimate requests from the production frontend (`https://bd-legal-practice-management.vercel.app`).

### Fix
In `server/src/config.ts`:
- Defined `DEFAULT_PRODUCTION_ORIGINS = ['https://bd-legal-practice-management.vercel.app', 'https://bd-legal-practice-management-legal-2b9b.vercel.app']`.
- Defined `DEFAULT_DEVELOPMENT_ORIGINS = ['http://localhost:3000', 'http://localhost:3001', 'http://localhost:5173', 'http://127.0.0.1:3000', 'http://127.0.0.1:3001', 'http://127.0.0.1:5173']`.
- Created centralized `getAllowedOrigins()` returning a deduplicated array merging default origins with any additional values configured in `process.env.CORS_ORIGIN`.

### Files Changed
- `server/src/config.ts` (lines 14-45)
- `server/src/app.ts` (lines 35-65)
- `server/src/middleware/originCheck.ts` (lines 28-56)

---

## Issue 2: Comprehensive CORS Options and Preflight Wildcard Handler

### Root Cause
1. `cors()` was instantiated without explicit `methods`, `allowedHeaders`, `exposedHeaders`, or `maxAge`, relying entirely on library defaults.
2. Express did not have an explicit `app.options('*', cors(corsOptions))` handler, which is required so that preflight `OPTIONS` requests to any route (including auth routes and domain entities) return HTTP 204 immediately with the correct `Access-Control-*` headers.

### Fix
In `server/src/app.ts`:
```ts
const corsOptions: cors.CorsOptions = {
  origin: (origin, callback) => {
    if (!origin) return callback(null, true);
    const allowedOrigins = getAllowedOrigins();
    if (allowedOrigins.includes(origin)) return callback(null, true);
    if (!isProduction) {
      const isLocalhost = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin);
      if (isLocalhost) return callback(null, true);
    }
    return callback(null, false);
  },
  credentials: true,
  methods: ['GET', 'HEAD', 'PUT', 'PATCH', 'POST', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Accept', 'Origin'],
  exposedHeaders: ['Set-Cookie'],
  maxAge: 86400,
  optionsSuccessStatus: 204,
};

app.use(cors(corsOptions));
app.options('*', cors(corsOptions));
```

### Files Changed
- `server/src/app.ts` (lines 37-67)

---

## Issue 3: Origin Protection Middleware Synchronization

### Root Cause
`server/src/middleware/originCheck.ts` used a separate origin parsing routine, creating a risk of divergence between CORS validation and CSRF origin checks.

### Fix
Replaced manual parsing with `getAllowedOrigins()` from `../config.js`. Ensured safe methods (`GET`, `HEAD`, `OPTIONS`) bypass origin verification, while all mutating methods (`POST`, `PUT`, `PATCH`, `DELETE`) require a matching allowed origin.

### Files Changed
- `server/src/middleware/originCheck.ts` (lines 2, 29-55)

---

## Issue 4: Cross-Origin Cookie Attributes

### Root Cause Analysis
For cross-origin cookie authentication between Vercel (`.vercel.app`) and Azure (`.azurewebsites.net`), browsers enforce:
1. `SameSite=None`
2. `Secure` (HTTPS only)
3. `HttpOnly` (XSS mitigation)

### Verification
Verified in `server/src/routes/auth.ts` and `server/src/middleware/adminAuth.ts`:
- In production, cookies default to `sameSite: 'none'` and `secure: true`.
- In Azure App Settings, `COOKIE_SAMESITE="none"` is active.
- Verified in automated test suite `tests/corsAuthConnectivity.test.ts`.

---

## Issue 5: Azure App Service Free Tier Quota Exhaustion (Gateway Block)

### Root Cause
Azure App Service Plan `ASP-BDLegal-a137` is on Free Tier (`F1`). The 60-minute daily CPU limit was exhausted, putting the app in `state: "QuotaExceeded"`. Azure Front Door/IIS intercepted all requests and returned an HTML 403 page without CORS headers before traffic could reach Express.

### Status & Remediation
- **Status**: `BLOCKED (Azure F1 QuotaExceeded)`
- **Remediation**:
  1. Automated daily reset occurs at `2026-11-03T00:00:00Z` (midnight UTC).
  2. Immediate unblock can be achieved by scaling plan `ASP-BDLegal-a137` to Basic B1:
     `az appservice plan update --name ASP-BDLegal-a137 --resource-group BD-Legal --sku B1`
