process.env.JWT_SECRET = 'valid_test_secret_key_at_least_32_chars_long_1234567890';
process.env.ADMIN_JWT_SECRET = 'valid_admin_secret_key_at_least_32_chars_long_9876543210';

import http from 'http';
import { createApp } from '../src/app.js';
import { SEED_PASSWORDS } from '../src/db/seed.js';

function assert(condition: boolean, msg: string) {
  if (!condition) {
    console.error(`[FAIL] ${msg}`);
    process.exit(1);
  }
  console.log(`[PASS] ${msg}`);
}

async function runTests() {
  console.log('--- STARTING CORS & AUTH CONNECTIVITY TEST SUITE ---');

  // Test in simulated production environment mode
  const prevEnv = process.env.NODE_ENV;
  const prevCors = process.env.CORS_ORIGIN;
  const prevSameSite = process.env.COOKIE_SAMESITE;
  const prevDbUrl = process.env.DATABASE_URL;
  const prevVercel = process.env.VERCEL;

  const prodOrigin = 'https://bd-legal-practice-management.vercel.app';
  process.env.NODE_ENV = 'production';
  process.env.COOKIE_SAMESITE = 'none';
  process.env.VERCEL = '1';
  delete process.env.DATABASE_URL;
    process.env.CORS_ORIGIN = prodOrigin;

  const app = createApp();
  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
  const addr = server.address() as any;
  const baseUrl = `http://127.0.0.1:${addr.port}`;

  const evilOrigin = 'https://evil.vercel.app';

  try {
    // 1. Preflight OPTIONS request on /auth/login from production origin
    console.log('\n--- 1. Preflight OPTIONS on /auth/login ---');
    const preflightRes = await fetch(`${baseUrl}/auth/login`, {
      method: 'OPTIONS',
      headers: {
        Origin: prodOrigin,
        'Access-Control-Request-Method': 'POST',
        'Access-Control-Request-Headers': 'content-type',
      },
    });

    assert(preflightRes.status === 204, 'OPTIONS /auth/login returns HTTP 204');
    assert(
      preflightRes.headers.get('access-control-allow-origin') === prodOrigin,
      'Preflight response allows production Vercel origin'
    );
    assert(
      preflightRes.headers.get('access-control-allow-credentials') === 'true',
      'Preflight response permits credentials'
    );
    const allowMethods = preflightRes.headers.get('access-control-allow-methods') || '';
    assert(allowMethods.includes('POST'), 'Preflight permits POST method');
    const allowHeaders = preflightRes.headers.get('access-control-allow-headers') || '';
    assert(allowHeaders.toLowerCase().includes('content-type'), 'Preflight permits Content-Type header');

    // 2. Preflight OPTIONS request from unauthorized origin is rejected
    console.log('\n--- 2. Preflight OPTIONS from Disallowed Origin ---');
    const evilPreflightRes = await fetch(`${baseUrl}/auth/login`, {
      method: 'OPTIONS',
      headers: {
        Origin: evilOrigin,
        'Access-Control-Request-Method': 'POST',
        'Access-Control-Request-Headers': 'content-type',
      },
    });

    assert(
      evilPreflightRes.headers.get('access-control-allow-origin') !== evilOrigin,
      'Disallowed origin does NOT receive Access-Control-Allow-Origin on preflight'
    );

    // 3. Preflight OPTIONS on domain route /api/v1/cases
    console.log('\n--- 3. Preflight OPTIONS on Domain Routes ---');
    const casePreflightRes = await fetch(`${baseUrl}/api/v1/cases`, {
      method: 'OPTIONS',
      headers: {
        Origin: prodOrigin,
        'Access-Control-Request-Method': 'GET',
      },
    });
    assert(casePreflightRes.status === 204, 'OPTIONS /api/v1/cases returns HTTP 204');
    assert(
      casePreflightRes.headers.get('access-control-allow-origin') === prodOrigin,
      'Domain preflight permits production origin'
    );

    // 4. GET /auth/me unauthenticated handles request and sets CORS headers
    console.log('\n--- 4. Unauthenticated GET /auth/me ---');
    const unauthMeRes = await fetch(`${baseUrl}/auth/me`, {
      method: 'GET',
      headers: {
        Origin: prodOrigin,
      },
    });
    assert(unauthMeRes.status === 401, 'Unauthenticated GET /auth/me returns HTTP 401');
    assert(
      unauthMeRes.headers.get('access-control-allow-origin') === prodOrigin,
      'HTTP 401 on /auth/me retains Access-Control-Allow-Origin header'
    );
    assert(
      unauthMeRes.headers.get('access-control-allow-credentials') === 'true',
      'HTTP 401 on /auth/me retains Access-Control-Allow-Credentials: true'
    );

    // 5. POST /auth/login with valid credentials
    console.log('\n--- 5. POST /auth/login Authentication Flow ---');
    const loginRes = await fetch(`${baseUrl}/auth/login`, {
      method: 'POST',
      headers: {
        Origin: prodOrigin,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        email: 'owner@firm.bd',
        password: SEED_PASSWORDS.owner,
      }),
    });

    assert(loginRes.status === 200, 'POST /auth/login succeeds with HTTP 200');
    assert(
      loginRes.headers.get('access-control-allow-origin') === prodOrigin,
      'Login response retains Access-Control-Allow-Origin'
    );
    assert(
      loginRes.headers.get('access-control-allow-credentials') === 'true',
      'Login response retains Access-Control-Allow-Credentials: true'
    );

    const setCookie = loginRes.headers.get('set-cookie') || '';
    assert(setCookie.includes('access_token='), 'Login sets access_token cookie');
    assert(
      setCookie.toLowerCase().includes('samesite=none'),
      'Session cookie has SameSite=None for cross-origin Vercel deployment'
    );
    assert(
      setCookie.toLowerCase().includes('secure'),
      'Session cookie has Secure attribute'
    );
    assert(
      setCookie.toLowerCase().includes('httponly'),
      'Session cookie has HttpOnly attribute'
    );

    const tokenMatch = setCookie.match(/access_token=([^;]+)/);
    const accessToken = tokenMatch ? tokenMatch[1] : '';
    assert(accessToken.length > 0, 'Extracted valid access_token from cookie');

    // 6. Authenticated GET /auth/me with session cookie
    console.log('\n--- 6. Authenticated GET /auth/me ---');
    const authMeRes = await fetch(`${baseUrl}/auth/me`, {
      method: 'GET',
      headers: {
        Origin: prodOrigin,
        Cookie: `access_token=${accessToken}`,
      },
    });

    assert(authMeRes.status === 200, 'Authenticated GET /auth/me returns HTTP 200');
    assert(
      authMeRes.headers.get('access-control-allow-origin') === prodOrigin,
      'Authenticated /auth/me retains Access-Control-Allow-Origin'
    );
    const meBody = await authMeRes.json();
    assert(meBody.user?.email === 'owner@firm.bd', 'GET /auth/me returns correct user data');
    assert(Boolean(meBody.firm?.id), 'GET /auth/me returns firm information');

    // 7. CORS headers on application error responses (404 Not Found & 400 Bad Request)
    console.log('\n--- 7. CORS Headers on Error Responses ---');
    const notFoundRes = await fetch(`${baseUrl}/api/v1/nonexistent-route`, {
      headers: { Origin: prodOrigin },
    });
    assert(notFoundRes.status === 404, 'Nonexistent route returns HTTP 404');
    assert(
      notFoundRes.headers.get('access-control-allow-origin') === prodOrigin,
      'HTTP 404 response includes Access-Control-Allow-Origin'
    );

    const badLoginRes = await fetch(`${baseUrl}/auth/login`, {
      method: 'POST',
      headers: {
        Origin: prodOrigin,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({}),
    });
    assert(badLoginRes.status === 400, 'Empty login payload returns HTTP 400 Bad Request');
    assert(
      badLoginRes.headers.get('access-control-allow-origin') === prodOrigin,
      'HTTP 400 response includes Access-Control-Allow-Origin'
    );

    // 8. Super Admin login route retains separate boundary and CORS headers
    console.log('\n--- 8. Super Admin CORS & Authentication Isolation ---');
    const adminPreflight = await fetch(`${baseUrl}/api/admin/auth/login`, {
      method: 'OPTIONS',
      headers: {
        Origin: prodOrigin,
        'Access-Control-Request-Method': 'POST',
        'Access-Control-Request-Headers': 'content-type',
      },
    });
    assert(adminPreflight.status === 204, 'Admin preflight returns HTTP 204');
    assert(
      adminPreflight.headers.get('access-control-allow-origin') === prodOrigin,
      'Admin preflight allows origin'
    );

    console.log('\n========================================');
    console.log('CORS & AUTH CONNECTIVITY TESTS: ALL PASSED');
    console.log('========================================');
  } finally {
    server.close();
    process.env.NODE_ENV = prevEnv;
    if (prevCors !== undefined) process.env.CORS_ORIGIN = prevCors; else delete process.env.CORS_ORIGIN;
    if (prevSameSite !== undefined) process.env.COOKIE_SAMESITE = prevSameSite; else delete process.env.COOKIE_SAMESITE;
    if (prevDbUrl !== undefined) process.env.DATABASE_URL = prevDbUrl; else delete process.env.DATABASE_URL;
    if (prevVercel !== undefined) process.env.VERCEL = prevVercel; else delete process.env.VERCEL;
  }
}

runTests().catch((err) => {
  console.error('Fatal test runner error:', err);
  process.exit(1);
});
