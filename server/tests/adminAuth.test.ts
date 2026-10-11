process.env.JWT_SECRET = 'valid_test_secret_key_at_least_32_chars_long_1234567890';
process.env.ADMIN_JWT_SECRET = 'valid_admin_secret_key_at_least_32_chars_long_9876543210';

import http from 'http';
import jwt from 'jsonwebtoken';
import { createApp } from '../src/app.js';
import { getDatabase, resetDatabaseInstance } from '../src/db/client.js';
import { validateStartupConfig } from '../src/config.js';
import { createPlatformAdmin } from '../scripts/createPlatformAdmin.js';
import { ADMIN_COOKIE_NAME, generateAdminAccessToken } from '../src/middleware/adminAuth.js';
import { generateAccessToken } from '../src/middleware/auth.js';
import { SEED_PASSWORDS } from '../src/db/seed.js';

let passed = 0;
let failed = 0;

function assert(condition: boolean, message: string) {
  if (condition) {
    console.log(`[PASS] ${message}`);
    passed++;
  } else {
    console.error(`[FAIL] ${message}`);
    failed++;
  }
}

function extractCookie(res: Response, cookieName: string): string | null {
  const setCookie = res.headers.get('set-cookie');
  if (!setCookie) return null;
  const match = setCookie.match(new RegExp(`${cookieName}=([^;]+)`));
  return match ? match[1] : null;
}

async function runAdminAuthTests() {
  console.log('\n========================================');
  console.log('STARTING SUPER ADMIN (STEP A) TEST SUITE');
  console.log('========================================\n');

  resetDatabaseInstance();

  const app = createApp();
  const server = http.createServer(app);

  await new Promise<void>((resolve) => server.listen(0, resolve));
  const address = server.address() as any;
  const baseUrl = `http://127.0.0.1:${address.port}`;

  try {
    // ----------------------------------------------------
    // 1. ADMIN_JWT_SECRET & Startup Hardening
    // ----------------------------------------------------
    console.log('--- 1. ADMIN_JWT_SECRET Startup Validation ---');
    const originalAdminSecret = process.env.ADMIN_JWT_SECRET!;
    const originalFirmSecret = process.env.JWT_SECRET!;

    // 1a. Missing ADMIN_JWT_SECRET
    delete process.env.ADMIN_JWT_SECRET;
    let missingAdminSecret = false;
    try {
      validateStartupConfig();
    } catch (e: any) {
      missingAdminSecret = e.message.includes('ADMIN_JWT_SECRET environment variable is missing');
    }
    assert(missingAdminSecret, 'validateStartupConfig throws error when ADMIN_JWT_SECRET is missing');

    // 1b. Short ADMIN_JWT_SECRET (< 32 chars)
    process.env.ADMIN_JWT_SECRET = 'short_admin_secret_under_32';
    let shortAdminSecret = false;
    try {
      validateStartupConfig();
    } catch (e: any) {
      shortAdminSecret = e.message.includes('ADMIN_JWT_SECRET is too short');
    }
    assert(shortAdminSecret, 'validateStartupConfig throws error when ADMIN_JWT_SECRET is shorter than 32 characters');

    // 1c. ADMIN_JWT_SECRET equal to JWT_SECRET
    process.env.ADMIN_JWT_SECRET = originalFirmSecret;
    let equalSecretThrown = false;
    try {
      validateStartupConfig();
    } catch (e: any) {
      equalSecretThrown = e.message.includes('ADMIN_JWT_SECRET cannot be equal to JWT_SECRET');
    }
    assert(equalSecretThrown, 'validateStartupConfig throws error when ADMIN_JWT_SECRET equals JWT_SECRET');

    // 1d. Forbidden ADMIN_JWT_SECRET from .env.example
    process.env.ADMIN_JWT_SECRET = 'your_super_secret_admin_jwt_key_at_least_32_chars';
    let forbiddenSecretThrown = false;
    try {
      validateStartupConfig();
    } catch (e: any) {
      forbiddenSecretThrown = e.message.includes('ADMIN_JWT_SECRET equals a known default or example secret');
    }
    assert(forbiddenSecretThrown, 'validateStartupConfig throws error when ADMIN_JWT_SECRET equals .env.example value');

    // Restore secrets
    process.env.ADMIN_JWT_SECRET = originalAdminSecret;
    process.env.JWT_SECRET = originalFirmSecret;

    const startupConfig = validateStartupConfig();
    assert(
      startupConfig.jwtSecret === originalFirmSecret && startupConfig.adminJwtSecret === originalAdminSecret,
      'validateStartupConfig returns both valid secrets when configured correctly'
    );

    // ----------------------------------------------------
    // 2. CLI Script createPlatformAdmin.ts
    // ----------------------------------------------------
    console.log('\n--- 2. CLI Script createPlatformAdmin.ts Invariants ---');
    const testAdminEmail = 'superadmin@chamber.bd';
    const testAdminPassword = 'SuperAdminSecurePassword2026!'; // >= 14 chars

    // 2a. Rejects password under 14 chars
    let shortPasswordRejected = false;
    try {
      await createPlatformAdmin('test@admin.bd', 'short123');
    } catch (e: any) {
      shortPasswordRejected = e.message.includes('at least 14 characters');
    }
    assert(shortPasswordRejected, 'createPlatformAdmin rejects passwords shorter than 14 characters');

    // 2b. Rejects invalid email
    let invalidEmailRejected = false;
    try {
      await createPlatformAdmin('not-an-email', testAdminPassword);
    } catch (e: any) {
      invalidEmailRejected = e.message.includes('Invalid email address format');
    }
    assert(invalidEmailRejected, 'createPlatformAdmin rejects invalid email address');

    // 2c. Successful creation
    const createdAdmin = await createPlatformAdmin(testAdminEmail, testAdminPassword);
    assert(Boolean(createdAdmin.id), 'Platform admin created with valid UUID');
    assert(createdAdmin.email === testAdminEmail, 'Platform admin email stored correctly');
    assert(createdAdmin.active === true, 'Platform admin is active by default');
    assert((createdAdmin as any).firmId === undefined, 'Platform admin has NO firm_id');

    // 2d. Audit log written for admin creation
    const db = getDatabase();
    const seededAdmin = await db.getPlatformAdminByEmail('admin@platform.bd');
    assert(Boolean(seededAdmin), 'Default seeded platform admin is available');
    assert(seededAdmin?.totpSecret === null, 'Default seeded platform admin uses nullable totpSecret field');
    const adminAudits = await db.listAdminAudit(10);
    const creationAudit = adminAudits.find(
      (a) => a.adminId === createdAdmin.id && a.action === 'PLATFORM_ADMIN_CREATED'
    );
    assert(Boolean(creationAudit), 'Platform admin creation recorded in admin_audit table');

    // 2e. Refuses duplicate execution with the same email
    let duplicateRejected = false;
    try {
      await createPlatformAdmin(testAdminEmail, testAdminPassword);
    } catch (e: any) {
      duplicateRejected = e.message.includes('already exists');
    }
    assert(duplicateRejected, 'createPlatformAdmin refuses duplicate execution with same email');

    // ----------------------------------------------------
    // 3. Platform Admin Login & Lockout
    // ----------------------------------------------------
    console.log('\n--- 3. Platform Admin Login & Lockout ---');

    // 3a. Missing credentials
    const emptyLoginRes = await fetch(`${baseUrl}/api/admin/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: '', password: '' }),
    });
    assert(emptyLoginRes.status === 400, 'POST /api/admin/auth/login with empty credentials returns HTTP 400');

    // 3b. Non-existent email returns 401
    const unknownLoginRes = await fetch(`${baseUrl}/api/admin/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'ghost@admin.bd', password: 'SomeRandomPassword123!' }),
    });
    assert(unknownLoginRes.status === 401, 'POST /api/admin/auth/login with non-existent email returns HTTP 401');

    // 3c. Successful login
    const validLoginRes = await fetch(`${baseUrl}/api/admin/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: testAdminEmail, password: testAdminPassword }),
    });
    assert(validLoginRes.status === 200, 'POST /api/admin/auth/login with valid credentials returns HTTP 200');
    const validLoginBody = await validLoginRes.json();
    assert(validLoginBody.admin.email === testAdminEmail, 'Response body includes admin email');
    assert((validLoginBody as any).token === undefined, 'No token is returned in JSON body (cookie-only security)');

    const adminCookie = extractCookie(validLoginRes, ADMIN_COOKIE_NAME);
    assert(Boolean(adminCookie), 'Login response sets admin_access_token cookie');
    const setCookieHeader = validLoginRes.headers.get('set-cookie') || '';
    assert(setCookieHeader.toLowerCase().includes('httponly'), 'admin_access_token cookie has HttpOnly flag');
    assert(setCookieHeader.toLowerCase().includes('samesite=strict'), 'admin_access_token cookie has sameSite=strict flag');

    // Verify admin audit row for login
    const loginAudits = await db.listAdminAudit(5);
    const loginAudit = loginAudits.find(
      (a) => a.adminId === createdAdmin.id && a.action === 'ADMIN_LOGIN'
    );
    assert(Boolean(loginAudit), 'admin_audit table records ADMIN_LOGIN action');

    // 3d. Admin Lockout Invariant: 5 failed attempts lock the account
    console.log('Testing admin login lockout (5 failed attempts)...');
    const lockoutEmail = 'lockout-test@admin.bd';
    const lockoutPassword = 'ValidPasswordForLockout123!';
    const lockoutAdmin = await createPlatformAdmin(lockoutEmail, lockoutPassword);

    for (let i = 1; i <= 5; i++) {
      const failRes = await fetch(`${baseUrl}/api/admin/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: lockoutEmail, password: 'WrongPasswordEveryTime123!' }),
      });
      assert(failRes.status === 401, `Failed attempt ${i} returns HTTP 401`);
    }

    // 6th attempt should be locked out with HTTP 429
    const lockedRes = await fetch(`${baseUrl}/api/admin/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: lockoutEmail, password: lockoutPassword }),
    });
    assert(lockedRes.status === 429, 'Locked out admin attempt returns HTTP 429 (Too Many Requests)');
    const lockedBody = await lockedRes.json();
    assert(lockedBody.code === 'RATE_LIMITED', 'Locked out admin response has RATE_LIMITED code');

    // ----------------------------------------------------
    // 4. Session Verification & Sliding (GET /api/admin/auth/me)
    // ----------------------------------------------------
    console.log('\n--- 4. Session Verification & Sliding (GET /api/admin/auth/me) ---');

    // 4a. Request without cookie returns 401
    const unauthMe = await fetch(`${baseUrl}/api/admin/auth/me`);
    assert(unauthMe.status === 401, 'GET /api/admin/auth/me without cookie returns HTTP 401');

    // 4b. Request with valid admin cookie returns 200 and admin data
    const meRes = await fetch(`${baseUrl}/api/admin/auth/me`, {
      headers: { Cookie: `${ADMIN_COOKIE_NAME}=${adminCookie}` },
    });
    assert(meRes.status === 200, 'GET /api/admin/auth/me with valid admin cookie returns HTTP 200');
    const meBody = await meRes.json();
    assert(meBody.admin.email === testAdminEmail, 'GET /api/admin/auth/me returns admin profile');
    assert((meBody.admin as any).passwordHash === undefined, 'GET /api/admin/auth/me does not expose passwordHash');

    // 4c. Slides session: re-issues admin cookie
    const freshCookie = extractCookie(meRes, ADMIN_COOKIE_NAME);
    assert(Boolean(freshCookie), 'GET /api/admin/auth/me slides session and re-issues admin_access_token cookie');

    // ----------------------------------------------------
    // 5. Token Cross-Contamination Rejection (Rule 4 Invariant)
    // ----------------------------------------------------
    console.log('\n--- 5. Token Cross-Contamination Rejection ---');

    // Obtain a firm Owner token
    const firmLoginRes = await fetch(`${baseUrl}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'owner@firm.bd', password: SEED_PASSWORDS.owner }),
    });
    assert(firmLoginRes.status === 200, 'Firm owner login succeeds');
    const firmToken = extractCookie(firmLoginRes, 'access_token');
    assert(Boolean(firmToken), 'Firm owner receives access_token cookie');

    // 5a. Firm Owner token on /api/admin/* returns 401
    // Case 1: firm token passed as access_token cookie
    const firmOnAdmin1 = await fetch(`${baseUrl}/api/admin/auth/me`, {
      headers: { Cookie: `access_token=${firmToken}` },
    });
    assert(firmOnAdmin1.status === 401, 'Firm token in access_token on /api/admin/auth/me returns HTTP 401');

    // Case 2: firm token disguised in admin_access_token cookie
    const firmOnAdmin2 = await fetch(`${baseUrl}/api/admin/auth/me`, {
      headers: { Cookie: `${ADMIN_COOKIE_NAME}=${firmToken}` },
    });
    assert(firmOnAdmin2.status === 401, 'Firm token disguised in admin_access_token on /api/admin/auth/me returns HTTP 401');

    // 5b. Admin token on /api/v1/* returns 401
    // Case 1: admin token passed as admin_access_token cookie
    const adminOnFirm1 = await fetch(`${baseUrl}/api/v1/firms/current`, {
      headers: { Cookie: `${ADMIN_COOKIE_NAME}=${adminCookie}` },
    });
    assert(adminOnFirm1.status === 401, 'Admin token in admin_access_token on /api/v1/firms/current returns HTTP 401');

    // Case 2: admin token disguised in access_token cookie
    const adminOnFirm2 = await fetch(`${baseUrl}/api/v1/firms/current`, {
      headers: { Cookie: `access_token=${adminCookie}` },
    });
    assert(adminOnFirm2.status === 401, 'Admin token disguised in access_token on /api/v1/firms/current returns HTTP 401');

    const adminOnUsers = await fetch(`${baseUrl}/api/v1/users`, {
      headers: { Cookie: `access_token=${adminCookie}` },
    });
    assert(adminOnUsers.status === 401, 'Admin token on /api/v1/users returns HTTP 401');

    // ----------------------------------------------------
    // 6. Deleted firm-facing license routes return 404
    // ----------------------------------------------------
    console.log('\n--- 6. Deleted License Routes Invariant ---');

    const renewOld = await fetch(`${baseUrl}/api/v1/firms/license/renew`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: `access_token=${firmToken}` },
      body: JSON.stringify({ months: 12 }),
    });
    assert(renewOld.status === 404, 'POST /api/v1/firms/license/renew returns HTTP 404 Not Found');

    const setStateOld = await fetch(`${baseUrl}/api/v1/firms/license/set-state`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: `access_token=${firmToken}` },
      body: JSON.stringify({ status: 'active' }),
    });
    assert(setStateOld.status === 404, 'POST /api/v1/firms/license/set-state returns HTTP 404 Not Found');

    const renewRoot = await fetch(`${baseUrl}/firms/license/renew`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: `access_token=${firmToken}` },
      body: JSON.stringify({ months: 12 }),
    });
    assert(renewRoot.status === 404, 'POST /firms/license/renew returns HTTP 404 Not Found');

    const setStateRoot = await fetch(`${baseUrl}/firms/license/set-state`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: `access_token=${firmToken}` },
      body: JSON.stringify({ status: 'active' }),
    });
    assert(setStateRoot.status === 404, 'POST /firms/license/set-state returns HTTP 404 Not Found');

    // ----------------------------------------------------
    // 7. Logout (POST /api/admin/auth/logout)
    // ----------------------------------------------------
    console.log('\n--- 7. Platform Admin Logout ---');

    const logoutRes = await fetch(`${baseUrl}/api/admin/auth/logout`, {
      method: 'POST',
      headers: { Cookie: `${ADMIN_COOKIE_NAME}=${adminCookie}` },
    });
    assert(logoutRes.status === 200, 'POST /api/admin/auth/logout returns HTTP 200');
    const logoutCookieHeader = logoutRes.headers.get('set-cookie') || '';
    assert(
      logoutCookieHeader.includes(`${ADMIN_COOKIE_NAME}=;`) || logoutCookieHeader.includes('Max-Age=0'),
      'Logout clears admin_access_token cookie'
    );

    // Verify token is revoked and cannot be reused
    const replayedMe = await fetch(`${baseUrl}/api/admin/auth/me`, {
      headers: { Cookie: `${ADMIN_COOKIE_NAME}=${adminCookie}` },
    });
    assert(replayedMe.status === 401, 'Replaying revoked admin token returns HTTP 401');

    // Verify admin_audit records logout
    const logoutAudits = await db.listAdminAudit(5);
    const logoutAudit = logoutAudits.find(
      (a) => a.adminId === createdAdmin.id && a.action === 'ADMIN_LOGOUT'
    );
    assert(Boolean(logoutAudit), 'admin_audit table records ADMIN_LOGOUT action');
  } finally {
    server.close();
  }

  console.log('\n========================================');
  console.log(`SUPER ADMIN TEST RESULTS: ${passed} PASSED, ${failed} FAILED`);
  console.log('========================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runAdminAuthTests().catch((err) => {
  console.error('Fatal error during adminAuth test suite execution:', err);
  process.exit(1);
});
