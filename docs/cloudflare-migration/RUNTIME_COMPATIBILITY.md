# Runtime Compatibility & Web Standards Specification

**Document Status:** Ready for Review  
**Target Runtime:** Cloudflare Workers (V8 JavaScript Runtime, `compatibility_date = "2024-11-01"`)  
**Target Web Framework:** Hono (`hono/tiny` or `hono`)  
**Source Runtime:** Node.js 20 LTS + Express 4.x

---

## 1. Architectural Runtime Shift: Node.js vs Cloudflare Workers

Cloudflare Workers does not execute Node.js binaries. Instead, it runs inside Google's V8 engine on Cloudflare's global edge network, implementing standard **W3C Web APIs** (`Request`, `Response`, `Headers`, `fetch`, `SubtleCrypto`, `Streams`).

```
+------------------------------------+------------------------------------+
| Node.js / Express Architecture     | Cloudflare Workers / Hono          |
+------------------------------------+------------------------------------+
| Express (req, res, next)           | Hono (c.req, c.text, c.json)       |
| node:crypto, bcryptjs (C++ / JS)   | globalThis.crypto (Web Crypto API) |
| process.env                        | c.env (Worker environment bindings)|
| res.cookie() (cookie-parser)       | hono/cookie (getCookie, setCookie) |
| helmet (Express middleware)        | hono/secure-headers                |
| cors (Express middleware)          | hono/cors                          |
| pg / postgres client (TCP socket)  | @cloudflare/workers-types + D1 API |
| Base64 in PostgreSQL text column   | Cloudflare R2 Object Storage       |
+------------------------------------+------------------------------------+
```

---

## 2. Express to Hono Middleware Translation

Every middleware currently mounted in `server/src/app.ts` has a direct, high-performance Hono equivalent:

### 2.1 Security Headers (Helmet replacement)
- **Node.js Express:** `app.use(helmet())`
- **Hono Edge:**
  ```typescript
  import { secureHeaders } from 'hono/secure-headers';
  
  app.use('*', secureHeaders({
    contentSecurityPolicy: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", 'data:', 'blob:'],
      connectSrc: ["'self'"]
    },
    xFrameOptions: 'DENY',
    xContentTypeOptions: 'nosniff',
    strictTransportSecurity: 'max-age=31536000; includeSubDomains',
  }));
  ```

### 2.2 CORS & Origin Whitelisting
- **Node.js Express:** `cors({ origin: env.CORS_ORIGIN, credentials: true })`
- **Hono Edge:**
  ```typescript
  import { cors } from 'hono/cors';

  app.use('*', async (c, next) => {
    const corsMiddleware = cors({
      origin: (origin) => {
        const allowed = [
          c.env.CORS_ORIGIN,
          'https://bd-legal-practice-management.vercel.app',
          'http://localhost:5173'
        ];
        return allowed.includes(origin) ? origin : null;
      },
      allowMethods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
      allowHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
      exposeHeaders: ['Content-Range', 'X-Total-Count'],
      credentials: true,
      maxAge: 86400,
    });
    return corsMiddleware(c, next);
  });
  ```

### 2.3 Cookie Handling (`cookie-parser` replacement)
- **Node.js Express:** `res.cookie('token', jwt, { httpOnly: true, secure: true, sameSite: 'none' })`
- **Hono Edge:**
  ```typescript
  import { getCookie, setCookie, deleteCookie } from 'hono/cookie';

  // Setting Auth Cookie
  setCookie(c, 'token', jwtToken, {
    httpOnly: true,
    secure: true,
    sameSite: 'None',
    path: '/',
    maxAge: 60 * 60 * 24 * 7, // 7 days
  });

  // Reading Auth Cookie
  const token = getCookie(c, 'token') || c.req.header('Authorization')?.replace('Bearer ', '');
  ```

### 2.4 Request Correlation ID & Logging
- **Hono Edge:**
  ```typescript
  import { requestId } from 'hono/request-id';
  import { logger } from 'hono/logger';

  app.use('*', requestId());
  app.use('*', logger());
  ```

---

## 3. JWT & Authentication Middleware in Hono

The central authentication middleware (`server/src/middleware/auth.ts`) translates into Hono cleanly using `hono/jwt` or Web Crypto HMAC:

```typescript
import { verify } from 'hono/jwt';

export async function authMiddleware(c: Context, next: Next) {
  const token = getCookie(c, 'token') || c.req.header('Authorization')?.replace('Bearer ', '');
  
  if (!token) {
    return c.json({ error: 'Unauthorized', message: 'Missing session token' }, 401);
  }

  try {
    const payload = await verify(token, c.env.JWT_SECRET);
    
    // Enforce Active Status and Subscription Read-Only Invariant
    const user = await db.getUserById(c.env.DB, payload.userId);
    if (!user || user.deletedAt) {
      return c.json({ error: 'Unauthorized', message: 'Account no longer exists' }, 401);
    }
    
    c.set('user', user);
    c.set('firmId', user.firmId);
    return next();
  } catch (err) {
    return c.json({ error: 'Unauthorized', message: 'Invalid or expired token' }, 401);
  }
}
```

---

## 4. Environment Variables & Secret Injections

In Node.js, `process.env` is a global object. In Cloudflare Workers, **environment variables and D1/R2 bindings are injected per request via the Context object (`c.env`)**:

```typescript
export interface Env {
  DB: D1Database;
  PHOTOS_BUCKET: R2Bucket;
  BACKUPS_BUCKET: R2Bucket;
  JWT_SECRET: string;
  ADMIN_JWT_SECRET: string;
  CORS_ORIGIN: string;
  ENVIRONMENT: 'production' | 'staging' | 'preview';
}
```

All repository services receive `c.env.DB` rather than importing a singleton `db` instance. This completely eliminates global connection leaks and ensures seamless multi-region edge isolation.

---

## 5. Storage Migration: Client Photos to Cloudflare R2

### 5.1 The Current Problem
- `client_photos` currently stores binary photos as a Base64 `text` string (up to 300 KB) in the database.
- Storing binary blobs inside SQLite / D1 causes severe database bloat, exceeds D1's 2 MB row size limits during bulk joins, and unnecessarily inflates scanned row billing counters.

### 5.2 The R2 Solution
1. **Cloudflare R2 Bucket Binding (`PHOTOS_BUCKET`)**:
   Photos are streamed directly to R2 under the key:
   `photos/{firmId}/{clientId}.jpg`
2. **Database Record (`client_photos`)**:
   D1 stores only the lightweight metadata:
   - `client_id` (PK, text)
   - `firm_id` (FK, text)
   - `r2_key` (text, e.g. `photos/firm-123/client-456.jpg`)
   - `mime` (text, e.g. `image/jpeg`)
   - `size_bytes` (integer)
   - `updated_at` (text)
3. **Serving Photos**:
   The Hono endpoint `GET /api/v1/clients/:id/photo` fetches the object from R2 via `c.env.PHOTOS_BUCKET.get(key)` and streams the raw image bytes with `Content-Type`, `Cache-Control: public, max-age=86400`, and `ETag` headers.

---

## 6. Frontend Hosting & Routing Strategy

The BD Legal frontend is an existing React/Vite single-page application.
- **Frontend Target:** Cloudflare Pages (or can remain on Vercel connecting to the Worker API).
- **Domain Mapping:**
  - Production Frontend: `https://app.bdlegal.com` (Cloudflare Pages or Vercel)
  - Production API: `https://api.bdlegal.com` (Cloudflare Worker route)
- **Same-Domain Advantage:** When both frontend and backend are proxied through Cloudflare DNS, cookies can use `SameSite=Lax`, completely eliminating third-party cookie restrictions across modern browsers.
