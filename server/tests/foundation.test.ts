process.env.JWT_SECRET = 'valid_test_secret_key_at_least_32_chars_long_1234567890';
process.env.ADMIN_JWT_SECRET = 'valid_admin_secret_key_at_least_32_chars_long_9876543210';

import http from 'http';
import jwt from 'jsonwebtoken';
import { execSync } from 'child_process';
import path from 'path';
import fs from 'fs';
import { createApp } from '../src/app.js';
import { getDatabase } from '../src/db/client.js';
import { SEED_PASSWORDS, ALL_PERMISSIONS } from '../src/db/seed.js';
import bcrypt from 'bcryptjs';
import { executeAdminLicenseChange } from '../src/scripts/adminLicense.js';
import { validateStartupConfig } from '../src/config.js';
import { resetLoginThrottles } from '../src/services/authService.js';

interface TestContext {
  baseUrl: string;
  server: http.Server;
}

async function startTestServer(): Promise<TestContext> {
  const app = createApp();
  const server = http.createServer(app);

  await new Promise<void>((resolve) => {
    server.listen(0, '127.0.0.1', () => resolve());
  });

  const addr = server.address() as any;
  const baseUrl = `http://127.0.0.1:${addr.port}`;
  return { baseUrl, server };
}

function extractToken(res: Response): string {
  const cookie = res.headers.get('set-cookie') || '';
  const match = cookie.match(/access_token=([^;]+)/);
  return match ? match[1] : '';
}

function extractCookie(res: Response): string {
  const token = extractToken(res);
  return token ? `access_token=${token}` : '';
}

async function runTests() {
  console.log('--- STARTING BACKEND STEP 3.0 FOUNDATION TEST SUITE ---');
  const { baseUrl, server } = await startTestServer();
  const db = getDatabase();

  let passed = 0;
  let failed = 0;

  function assert(condition: boolean, name: string, details?: string) {
    if (condition) {
      console.log(`[PASS] ${name}`);
      passed++;
    } else {
      console.error(`[FAIL] ${name} ${details ? '- ' + details : ''}`);
      failed++;
    }
  }

  try {
    // 0. Health check test
    {
      const res = await fetch(`${baseUrl}/api/v1/health`);
      const body = await res.json();
      assert(res.status === 200 && body.status === 'ok', 'Health endpoint GET /api/v1/health returns 200 ok');
    }

    // 1. Test 1: Owner logs in; wrong password rejected; repeated wrong attempts rate-limited
    {
      console.log('\n--- Test 1: Login & Rate Limiting ---');
      // Success login
      const res1 = await fetch(`${baseUrl}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'owner@firm.bd', password: SEED_PASSWORDS.owner }),
      });
      const body1 = await res1.json();
      const cookies = res1.headers.get('set-cookie');
      assert(res1.status === 200, 'Owner can log in with correct credentials');
      assert(body1.user?.role === 'Owner', 'Logged in user has role Owner');
      assert(body1.token === undefined, 'Server login response does not return token in body');
      assert(Boolean(cookies && cookies.includes('access_token')), 'Response sets httpOnly access_token cookie');

      // Wrong password rejected
      const resWrong = await fetch(`${baseUrl}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'owner@firm.bd', password: 'WrongPassword123!' }),
      });
      const wrongBody = await resWrong.json();
      assert(resWrong.status === 401, 'Wrong password is rejected with HTTP 401');
      assert(wrongBody.message === 'Invalid email or password.', 'Wrong password returns generic message');

      // Unknown email returns identical 401 status and error message (no account enumeration)
      const resUnknown = await fetch(`${baseUrl}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'nonexistent@firm.bd', password: 'AnyPassword123!' }),
      });
      const unknownBody = await resUnknown.json();
      assert(resUnknown.status === 401, 'Unknown email is rejected with HTTP 401');
      assert(unknownBody.message === wrongBody.message, 'Unknown email returns identical message to wrong password');
      assert(unknownBody.error === wrongBody.error, 'Unknown email returns identical error to wrong password');

      // Make additional wrong attempts to trigger rate limit lock (5 consecutive failed attempts)
      for (let i = 0; i < 4; i++) {
        await fetch(`${baseUrl}/auth/login`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: 'owner@firm.bd', password: 'WrongPassword123!' }),
        });
      }

      // Next attempt must be rate-limited (HTTP 429)
      const resLocked = await fetch(`${baseUrl}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'owner@firm.bd', password: SEED_PASSWORDS.owner }),
      });
      const lockedBody = await resLocked.json();
      assert(resLocked.status === 429 && lockedBody.code === 'RATE_LIMITED', 'Repeated failed login attempts result in HTTP 429 RATE_LIMITED');
      assert(lockedBody.message === 'Too many attempts, try again later', 'Rate limited response returns generic message without leaking account status');
      assert(!JSON.stringify(lockedBody).toLowerCase().includes('account locked'), 'Rate limited response does not reveal account locked');

      // Reset owner lock for subsequent tests
      const owner = await db.getUserByEmail('owner@firm.bd');
      if (owner) {
        await db.updateUser(owner.id, { failedLoginAttempts: 0, lockedUntil: null });
      }
      resetLoginThrottles();

      // Sliding session: GET /me re-issues access_token cookie
      const meRes = await fetch(`${baseUrl}/auth/me`, {
        headers: { Cookie: `access_token=${extractToken(res1)}` },
      });
      assert(meRes.status === 200, 'GET /me succeeds for authenticated user');
      const meCookies = meRes.headers.get('set-cookie');
      assert(Boolean(meCookies && meCookies.includes('access_token')), 'GET /me slides session by re-issuing access_token cookie');

      // Server-side token revocation on logout
      const logoutRes = await fetch(`${baseUrl}/auth/logout`, {
        method: 'POST',
        headers: { Cookie: `access_token=${extractToken(res1)}` },
      });
      assert(logoutRes.status === 200, 'POST /auth/logout succeeds');

      // Replaying the revoked token returns HTTP 401
      const replayedRes = await fetch(`${baseUrl}/api/v1/firms/current`, {
        headers: { Cookie: `access_token=${extractToken(res1)}` },
      });
      assert(replayedRes.status === 401, 'Replaying revoked token returns HTTP 401');

      // Log back in to get a fresh token for remaining tests
      const resReauth = await fetch(`${baseUrl}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'owner@firm.bd', password: SEED_PASSWORDS.owner }),
      });
      const freshToken = extractToken(resReauth);

      // Request with valid token in Authorization header but no cookie returns 401
      const resBearerNoCookie = await fetch(`${baseUrl}/api/v1/firms/current`, {
        headers: { Authorization: `Bearer ${freshToken}` },
      });
      assert(resBearerNoCookie.status === 401, 'Request with valid token in Authorization header but no cookie returns 401');
    }

    // 2. Test 2: Staff user calling Owner-only endpoint gets 403
    {
      console.log('\n--- Test 2: Permission Check & Owner-Only Enforcement ---');
      // Login as Staff
      const staffLoginRes = await fetch(`${baseUrl}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'staff@firm.bd', password: SEED_PASSWORDS.staff }),
      });
      const staffToken = extractToken(staffLoginRes);

      // Staff attempts Owner-only PATCH /api/v1/users/:id/permissions
      const staffForbiddenRes = await fetch(`${baseUrl}/api/v1/users/user-staff-002/permissions`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Cookie: `access_token=${staffToken}`,
        },
        body: JSON.stringify({ permissions: ALL_PERMISSIONS }),
      });
      const staffForbiddenBody = await staffForbiddenRes.json();
      assert(staffForbiddenRes.status === 403 && staffForbiddenBody.code === 'OWNER_ONLY', 'Staff calling Owner-only endpoint gets HTTP 403 OWNER_ONLY');

      // Login as Owner
      const ownerLoginRes = await fetch(`${baseUrl}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'owner@firm.bd', password: SEED_PASSWORDS.owner }),
      });
      const ownerToken = extractToken(ownerLoginRes);

      // Owner successfully calls PATCH /api/v1/users/:id/permissions
      const ownerSuccessRes = await fetch(`${baseUrl}/api/v1/users/user-staff-002/permissions`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Cookie: `access_token=${ownerToken}`,
        },
        body: JSON.stringify({ permissions: ['cases.view', 'hearings.update', 'tasks.view'] }),
      });
      assert(ownerSuccessRes.status === 200, 'Owner can update user permissions successfully (HTTP 200)');
    }

    // 3. Test 3: User of Firm A cannot read Firm B data
    {
      console.log('\n--- Test 3: Firm Isolation ---');
      // Seed Firm B and User B
      const firmBId = 'firm-bd-002';
      await db.insertFirm({
        id: firmBId,
        firmId: firmBId,
        name: 'Chattogram Commercial Chambers',
        barCouncilReg: 'BC-CTG-2015-1102',
        officeAddress: 'Agrabad C/A, Chattogram',
        courtAffiliations: 'Chattogram District Court',
        planId: 'annual-standard',
        licenseExpiresAt: new Date('2028-01-01'),
        status: 'active',
        createdAt: new Date(),
        updatedAt: new Date(),
        deletedAt: null,
        createdBy: 'user-owner-002',
        updatedBy: 'user-owner-002',
      });

      const salt = await bcrypt.genSalt(10);
      const hashB = await bcrypt.hash('ChamberOwner2026!', salt);
      const userB = await db.insertUser({
        id: 'user-owner-002',
        firmId: firmBId,
        name: 'Barrister Kamal Hossain Jr.',
        email: 'owner@firm-b.bd',
        passwordHash: hashB,
        role: 'Owner',
        permissions: ALL_PERMISSIONS,
        language: 'en',
        active: true,
        failedLoginAttempts: 0,
        lockedUntil: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        deletedAt: null,
        createdBy: 'user-owner-002',
        updatedBy: 'user-owner-002',
      });

      // Login as Firm A Owner
      const ownerALogin = await fetch(`${baseUrl}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'owner@firm.bd', password: SEED_PASSWORDS.owner }),
      });
      const tokenA = extractToken(ownerALogin);

      // Firm A calls GET /api/v1/users
      const usersRes = await fetch(`${baseUrl}/api/v1/users`, {
        headers: { Cookie: `access_token=${tokenA}` },
      });
      const usersList = await usersRes.json();

      const containsUserB = usersList.some((u: any) => u.id === userB.id || u.firmId === firmBId);
      assert(!containsUserB, 'User of Firm A cannot see Firm B users in user list (Firm isolation)');

      // Firm A tries to query User B by ID
      const directQueryRes = await fetch(`${baseUrl}/api/v1/users/${userB.id}`, {
        headers: { Cookie: `access_token=${tokenA}` },
      });
      assert(directQueryRes.status === 404, 'User of Firm A querying Firm B user ID directly returns 404 Not Found');

      // Firm A tries to query with explicit firmId=firm-bd-002 parameter
      const crossTenantParamRes = await fetch(`${baseUrl}/api/v1/audit-log?firmId=${firmBId}`, {
        headers: { Cookie: `access_token=${tokenA}` },
      });
      assert(crossTenantParamRes.status === 403, 'Cross-tenant parameter query rejected with HTTP 403 FIRM_ISOLATION_VIOLATION');
    }

    // 4. Test 4: Every write creates an audit_log row
    {
      console.log('\n--- Test 4: Audit Trail on Every Write ---');
      const ownerLogin = await fetch(`${baseUrl}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'owner@firm.bd', password: SEED_PASSWORDS.owner }),
      });
      const token = extractToken(ownerLogin);

      const logsBeforeRes = await fetch(`${baseUrl}/api/v1/audit-log`, {
        headers: { Cookie: `access_token=${token}` },
      });
      const logsBefore = await logsBeforeRes.json();
      const countBefore = logsBefore.length;

      // Perform a write operation: update firm office address
      const writeRes = await fetch(`${baseUrl}/api/v1/firms/current`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Cookie: `access_token=${token}`,
        },
        body: JSON.stringify({ officeAddress: 'Suite 909, Supreme Court Annex Building, Dhaka' }),
      });
      assert(writeRes.status === 200, 'Write operation PATCH /api/v1/firms/current succeeds (HTTP 200)');

      // Verify audit log has new entry
      const logsAfterRes = await fetch(`${baseUrl}/api/v1/audit-log`, {
        headers: { Cookie: `access_token=${token}` },
      });
      const logsAfter = await logsAfterRes.json();
      assert(logsAfter.length === countBefore + 1, 'Write operation automatically created an audit_log row');
      assert(logsAfter[0].action === 'UPDATE_FIRM', 'New audit log row captures the UPDATE_FIRM action');
      assert(logsAfter[0].userName === 'Adv. Mahbubur Rahman', 'Audit log row captures operator identity');
    }

    // 5. Test 5: License endpoints removed from firm API, strict allow-list, CLI admin tool, and read-only subscription enforcement
    {
      console.log('\n--- Test 5: License Security, Strict Allow-List, Admin CLI & Read-Only Enforcement ---');
      const ownerLogin = await fetch(`${baseUrl}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'owner@firm.bd', password: SEED_PASSWORDS.owner }),
      });
      const token = extractToken(ownerLogin);

      const staffLogin = await fetch(`${baseUrl}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'staff@firm.bd', password: SEED_PASSWORDS.staff }),
      });
      const staffToken = extractToken(staffLogin);

      // 5a. Deleted routes return 404
      const renewOld = await fetch(`${baseUrl}/api/v1/firms/license/renew`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: `access_token=${token}` },
        body: JSON.stringify({ months: 12 }),
      });
      assert(renewOld.status === 404, 'POST /api/v1/firms/license/renew returns 404 Not Found');

      const setStateOld = await fetch(`${baseUrl}/api/v1/firms/license/set-state`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: `access_token=${token}` },
        body: JSON.stringify({ status: 'active' }),
      });
      assert(setStateOld.status === 404, 'POST /api/v1/firms/license/set-state returns 404 Not Found');

      // 5b. PATCH /firms/current rejects disallowed fields with 400
      for (const field of ['status', 'licenseExpiresAt', 'planId', 'firmId']) {
        const val = field === 'firmId' ? 'firm-bd-001' : 'unauthorized_value';
        const disallowedRes = await fetch(`${baseUrl}/api/v1/firms/current`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json', Cookie: `access_token=${token}` },
          body: JSON.stringify({ [field]: val }),
        });
        assert(disallowedRes.status === 400, `PATCH /firms/current with disallowed field '${field}' returns HTTP 400`);
      }

      // 5c. Staff cannot change firm settings
      const staffPatchRes = await fetch(`${baseUrl}/api/v1/firms/current`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Cookie: `access_token=${staffToken}` },
        body: JSON.stringify({ name: 'Staff Rename' }),
      });
      assert(staffPatchRes.status === 403, 'Staff without settings.manage cannot PATCH /firms/current (HTTP 403)');

      // 5d. CLI admin tool validates inputs and refuses without ADMIN_CONFIRM=yes
      const prevAdminConfirm = process.env.ADMIN_CONFIRM;
      delete process.env.ADMIN_CONFIRM;
      let confirmErrorThrown = false;
      try {
        await executeAdminLicenseChange({ firmId: 'firm-bd-001', months: 6 });
      } catch (e: any) {
        confirmErrorThrown = e.message.includes('ADMIN_CONFIRM=yes');
      }
      assert(confirmErrorThrown, 'executeAdminLicenseChange throws error when ADMIN_CONFIRM!=yes');

      process.env.ADMIN_CONFIRM = 'yes';
      let invalidMonthsThrown = false;
      try {
        await executeAdminLicenseChange({ firmId: 'firm-bd-001', months: 50 });
      } catch (e: any) {
        invalidMonthsThrown = e.message.includes('between 1 and 36');
      }
      assert(invalidMonthsThrown, 'executeAdminLicenseChange rejects invalid months (50)');

      // 5e. Simulate expired firm in DB to test read-only subscription enforcement
      const pastDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
      await db.updateFirm('firm-bd-001', { licenseExpiresAt: pastDate, status: 'expired' });

      // Write operation must be blocked with HTTP 403 SUBSCRIPTION_READ_ONLY
      const blockedWriteRes = await fetch(`${baseUrl}/api/v1/firms/current`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Cookie: `access_token=${token}`,
        },
        body: JSON.stringify({ name: 'Attempted Renamed Firm' }),
      });
      const blockedBody = await blockedWriteRes.json();
      assert(
        blockedWriteRes.status === 403 && blockedBody.code === 'SUBSCRIPTION_READ_ONLY',
        'Mutating write endpoint returns HTTP 403 SUBSCRIPTION_READ_ONLY when subscription is expired'
      );

      // Read operation MUST still succeed with HTTP 200 (Rule 8: data stays viewable)
      const allowedReadRes = await fetch(`${baseUrl}/api/v1/firms/current`, {
        headers: { Cookie: `access_token=${token}` },
      });
      const readBody = await allowedReadRes.json();
      assert(allowedReadRes.status === 200, 'Read endpoint GET /api/v1/firms/current still succeeds (HTTP 200)');
      assert(readBody.subscription?.isReadOnly === true, 'Server evaluates subscription.isReadOnly === true');

      const allowedUsersRead = await fetch(`${baseUrl}/api/v1/users`, {
        headers: { Cookie: `access_token=${token}` },
      });
      assert(allowedUsersRead.status === 200, 'Read endpoint GET /api/v1/users still succeeds (HTTP 200)');

      // 5f. Use Admin CLI tool to renew the license and verify audit row
      await executeAdminLicenseChange({ firmId: 'firm-bd-001', months: 12, status: 'active' });

      // Restore ADMIN_CONFIRM env var if needed
      if (prevAdminConfirm !== undefined) {
        process.env.ADMIN_CONFIRM = prevAdminConfirm;
      }

      // Write operation now succeeds again
      const unblockedWriteRes = await fetch(`${baseUrl}/api/v1/firms/current`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Cookie: `access_token=${token}`,
        },
        body: JSON.stringify({ name: 'Rahman & Associates Chambers' }),
      });
      assert(unblockedWriteRes.status === 200, 'After CLI admin renewal, write operations succeed normally (HTTP 200)');

      // Verify audit log has system-admin row
      const auditRes = await fetch(`${baseUrl}/api/v1/audit-log`, {
        headers: { Cookie: `access_token=${token}` },
      });
      const auditLogs = await auditRes.json();
      const adminAudit = auditLogs.find((l: any) => l.action === 'ADMIN_LICENSE_UPDATE' && l.userName === 'system-admin');
      assert(!!adminAudit, 'Admin CLI tool wrote an audit_log row with userName system-admin');
    }

    // 6. Test 6: JWT Secret & Startup Environment Validation Hardening
    {
      console.log('\n--- Test 6: JWT Secret & Startup Environment Hardening ---');
      const originalSecret = process.env.JWT_SECRET!;
      const originalDbUrl = process.env.DATABASE_URL;
      const originalNodeEnv = process.env.NODE_ENV;

      // 6a. Refuses startup when JWT_SECRET is missing
      delete process.env.JWT_SECRET;
      let missingSecretThrown = false;
      try {
        validateStartupConfig();
      } catch (e: any) {
        missingSecretThrown = e.message.includes('missing');
      }
      assert(missingSecretThrown, 'validateStartupConfig throws error when JWT_SECRET is missing');

      // 6b. Refuses startup when JWT_SECRET is shorter than 32 characters
      process.env.JWT_SECRET = 'short_secret_under_32_chars';
      let shortSecretThrown = false;
      try {
        validateStartupConfig();
      } catch (e: any) {
        shortSecretThrown = e.message.includes('32 characters');
      }
      assert(shortSecretThrown, 'validateStartupConfig throws error when JWT_SECRET is shorter than 32 characters');

      // 6c. Refuses startup when JWT_SECRET is the old hardcoded default string
      process.env.JWT_SECRET = 'chamber_default_jwt_secret_dev_only_32_characters';
      let oldDefaultThrown = false;
      try {
        validateStartupConfig();
      } catch (e: any) {
        oldDefaultThrown = e.message.includes('known default or example secret');
      }
      assert(oldDefaultThrown, 'validateStartupConfig throws error when JWT_SECRET is old default secret');

      // 6d. Refuses startup when JWT_SECRET is the placeholder from .env.example
      process.env.JWT_SECRET = 'your_super_secret_jwt_key_at_least_32_characters_long';
      let exampleSecretThrown = false;
      try {
        validateStartupConfig();
      } catch (e: any) {
        exampleSecretThrown = e.message.includes('known default or example secret');
      }
      assert(exampleSecretThrown, 'validateStartupConfig throws error when JWT_SECRET is .env.example placeholder');

      // 6e. Refuses startup in production if DATABASE_URL is missing
      process.env.JWT_SECRET = originalSecret;
      process.env.NODE_ENV = 'production';
      delete process.env.DATABASE_URL;
      let missingDbThrown = false;
      try {
        validateStartupConfig();
      } catch (e: any) {
        missingDbThrown = e.message.includes('DATABASE_URL is missing');
      }
      assert(missingDbThrown, 'validateStartupConfig throws error when DATABASE_URL is missing in production');

      // 6f. Refuses startup in production if DATABASE_URL is default example string
      process.env.DATABASE_URL = 'postgres://bd_legal_user:bd_legal_secret_password@localhost:5432/bd_legal_db';
      let defaultDbThrown = false;
      try {
        validateStartupConfig();
      } catch (e: any) {
        defaultDbThrown = e.message.includes('default example connection string');
      }
      assert(defaultDbThrown, 'validateStartupConfig throws error when DATABASE_URL in production is default string');

      // Restore environment
      process.env.JWT_SECRET = originalSecret;
      if (originalDbUrl !== undefined) process.env.DATABASE_URL = originalDbUrl; else delete process.env.DATABASE_URL;
      if (originalNodeEnv !== undefined) process.env.NODE_ENV = originalNodeEnv; else delete process.env.NODE_ENV;

      // 6g. Tokens signed with a different secret are rejected with HTTP 401
      const forgedToken = jwt.sign(
        {
          userId: 'user-owner-001',
          firmId: 'firm-bd-001',
          role: 'Owner',
          email: 'owner@firm.bd',
        },
        'different_unauthorized_secret_at_least_32_characters_long!',
        { expiresIn: '15m' }
      );
      const forgedRes = await fetch(`${baseUrl}/api/v1/firms/current`, {
        headers: { Cookie: `access_token=${forgedToken}` },
      });
      assert(forgedRes.status === 401, 'Request with token signed with different secret is rejected with HTTP 401');

      // 6h. Server CLI entrypoint exits with error code when started with invalid secret
      const serverDir = process.cwd().endsWith('server') ? process.cwd() : path.join(process.cwd(), 'server');
      let cliExitedWithError = false;
      try {
        execSync('npx tsx src/index.ts', {
          cwd: serverDir,
          env: { ...process.env, JWT_SECRET: 'short' },
          stdio: 'pipe',
          timeout: 5000,
        });
      } catch (err: any) {
        cliExitedWithError = err.status !== 0;
      }
      assert(cliExitedWithError, 'Server index.ts process exits with error when started with short secret');
    }

    // 7. Test 7: Audit Log Endpoint Security, Capping & Pagination
    {
      console.log('\n--- Test 7: Audit Log Endpoint Security & Pagination ---');
      const ownerLogin = await fetch(`${baseUrl}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'owner@firm.bd', password: SEED_PASSWORDS.owner }),
      });
      const token = extractToken(ownerLogin);

      const staffLogin = await fetch(`${baseUrl}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'staff@firm.bd', password: SEED_PASSWORDS.staff }),
      });
      const staffToken = extractToken(staffLogin);

      // 7a. POST /api/v1/audit-log returns 404 (audit rows written ONLY by server code)
      const postAuditRes = await fetch(`${baseUrl}/api/v1/audit-log`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: `access_token=${token}` },
        body: JSON.stringify({ entity: 'Firm', entityId: 'firm-bd-001', action: 'FORGED_AUDIT' }),
      });
      assert(postAuditRes.status === 404 || postAuditRes.status === 405, 'POST /api/v1/audit-log returns 404/405 (clients cannot write audit rows)');

      // 7b. GET /api/v1/audit-log with limit=abc handled safely (falls back to default 100)
      const abcRes = await fetch(`${baseUrl}/api/v1/audit-log?limit=abc`, {
        headers: { Cookie: `access_token=${token}` },
      });
      assert(abcRes.status === 200, 'GET /api/v1/audit-log?limit=abc returns HTTP 200 without error');
      const abcLogs = await abcRes.json();
      assert(Array.isArray(abcLogs), 'Returned logs is a valid array');

      // 7c. GET /api/v1/audit-log with limit=99999999 is capped safely (max 500)
      const maxRes = await fetch(`${baseUrl}/api/v1/audit-log?limit=99999999`, {
        headers: { Cookie: `access_token=${token}` },
      });
      assert(maxRes.status === 200, 'GET /api/v1/audit-log?limit=99999999 returns HTTP 200 without error');
      const maxLogs = await maxRes.json();
      assert(Array.isArray(maxLogs) && maxLogs.length <= 500, 'Returned logs length is safely capped at 500');

      // 7d. GET /api/v1/audit-log with offset works
      const offsetRes = await fetch(`${baseUrl}/api/v1/audit-log?limit=1&offset=1`, {
        headers: { Cookie: `access_token=${token}` },
      });
      assert(offsetRes.status === 200, 'GET /api/v1/audit-log with offset returns HTTP 200');
      const offsetLogs = await offsetRes.json();
      assert(Array.isArray(offsetLogs), 'Offset query returns an array');

      // 7e. Staff without settings.manage cannot access audit log (HTTP 403)
      const staffAuditRes = await fetch(`${baseUrl}/api/v1/audit-log`, {
        headers: { Cookie: `access_token=${staffToken}` },
      });
      assert(staffAuditRes.status === 403, 'Staff without settings.manage cannot view audit log (HTTP 403)');
    }

    // 8. Test 8: Docker Hardening, Compose Secrets & Seed Security (Item 6)
    {
      console.log('\n--- Test 8: Docker Hardening, Compose Secrets & Seed Security ---');
      const { SEED_PASSWORDS: sp } = await import('../src/db/seed.js');

      // 8a. SEED_PASSWORDS dynamically resolves strings
      assert(typeof sp.owner === 'string' && sp.owner.length > 0, 'SEED_PASSWORDS.owner is a valid string');
      assert(typeof sp.staff === 'string' && sp.staff.length > 0, 'SEED_PASSWORDS.staff is a valid string');

      // 8b. Running seed.ts in production exits with an error
      const serverDir = process.cwd().endsWith('server') ? process.cwd() : path.join(process.cwd(), 'server');
      const rootDir = process.cwd().endsWith('server') ? path.resolve(process.cwd(), '..') : process.cwd();
      let seedExitedWithError = false;
      try {
        execSync('npx tsx src/db/seed.ts', {
          cwd: serverDir,
          env: { ...process.env, NODE_ENV: 'production' },
          stdio: 'pipe',
          timeout: 5000,
        });
      } catch (err: any) {
        seedExitedWithError = err.status !== 0;
      }
      assert(seedExitedWithError, 'Running src/db/seed.ts exits with error when NODE_ENV=production');

      // 8c. docker-compose.yml must require secrets without defaults and not expose ports
      const composeContent = fs.readFileSync(path.join(rootDir, 'docker-compose.yml'), 'utf8');
      assert(composeContent.includes('${POSTGRES_PASSWORD:?POSTGRES_PASSWORD required}'), 'docker-compose requires POSTGRES_PASSWORD without default fallback');
      assert(composeContent.includes('${JWT_SECRET:?JWT_SECRET required}'), 'docker-compose requires JWT_SECRET without default fallback');
      assert(!composeContent.includes('ports:'), 'docker-compose.yml does not expose ports in production file');

      // 8d. docker-compose.dev.yml exposes 127.0.0.1 ports
      const devCompose = fs.readFileSync(path.join(rootDir, 'docker-compose.dev.yml'), 'utf8');
      assert(devCompose.includes('127.0.0.1:5432:5432'), 'docker-compose.dev.yml binds postgres strictly to 127.0.0.1:5432');
      assert(devCompose.includes('127.0.0.1:4000:4000'), 'docker-compose.dev.yml binds api strictly to 127.0.0.1:4000');

      // 8e. Dockerfile hardening checks
      const dockerfileContent = fs.readFileSync(path.join(serverDir, 'Dockerfile'), 'utf8');
      assert(dockerfileContent.includes('npm ci'), 'Dockerfile uses npm ci for deterministic builds');
      assert(dockerfileContent.includes('USER node'), 'Dockerfile runs as non-root USER node');
      assert(dockerfileContent.includes('HEALTHCHECK'), 'Dockerfile includes HEALTHCHECK on /api/v1/health');

      // 8f. .dockerignore checks
      const rootDockerignore = fs.readFileSync(path.join(rootDir, '.dockerignore'), 'utf8');
      assert(rootDockerignore.includes('node_modules') && rootDockerignore.includes('.env*') && rootDockerignore.includes('tests'), 'Root .dockerignore excludes sensitive files');

      // 8g. Cleanup checks (Item 8)
      assert(!fs.existsSync(path.join(rootDir, 'bun.lock')), 'bun.lock is deleted');
      assert(!fs.existsSync(path.join(rootDir, 'metadata.json')), 'metadata.json is deleted');
      const pkg = JSON.parse(fs.readFileSync(path.join(rootDir, 'package.json'), 'utf8'));
      assert(pkg.name === 'bd-legal-practice', 'package.json name is bd-legal-practice');
      const viteConfig = fs.readFileSync(path.join(rootDir, 'vite.config.ts'), 'utf8');
      assert(!viteConfig.includes('AI Studio'), 'vite.config.ts contains no AI Studio comments');

      // 8h. ARCHITECTURE.md restored rules (Item 10)
      const archContent = fs.readFileSync(path.join(rootDir, 'ARCHITECTURE.md'), 'utf8');
      assert(archContent.includes('Permissions are enforced on the SERVER'), 'ARCHITECTURE.md requires permissions enforced on SERVER');
      assert(archContent.includes('Never trust a firm_id sent by the client'), 'ARCHITECTURE.md enforces never trusting client firm_id');
      assert(archContent.includes('Migrations must never drop data'), 'ARCHITECTURE.md enforces migrations never drop data');
      assert(archContent.includes('payments(id, firm_id') && archContent.includes('backups_log(id, firm_id'), 'ARCHITECTURE.md specifies payments and backups_log tables');
      assert(archContent.includes('Off-site nightly dump') || archContent.includes('Off-site nightly backup rule'), 'ARCHITECTURE.md includes off-site nightly backup rule');
      assert(archContent.includes('/server/src/routes/') && archContent.includes('httpOnly secure cookie') && archContent.includes('admin-only via CLI'), 'ARCHITECTURE.md specifies backend folder layout and auth/license rules');

      // ----------------------------------------------------
      // 9. Trust Proxy Configuration (R-05)
      // ----------------------------------------------------
      console.log('\n--- 9. TRUST_PROXY_HOPS & req.ip Invariants ---');
      const savedTrustProxy = process.env.TRUST_PROXY_HOPS;

      // 9a. Default / 0 hops: X-Forwarded-For is ignored
      process.env.TRUST_PROXY_HOPS = '0';
      const appHops0 = createApp();
      assert(appHops0.get('trust proxy') === 0, 'createApp sets trust proxy to 0 when TRUST_PROXY_HOPS=0');

      const server0 = http.createServer(appHops0);
      await new Promise<void>((resolve) => server0.listen(0, '127.0.0.1', () => resolve()));
      const port0 = (server0.address() as any).port;

      const res0 = await fetch(`http://127.0.0.1:${port0}/api/v1/health`, {
        headers: { 'x-forwarded-for': '203.0.113.195, 70.41.3.18' },
      });
      const data0 = await res0.json();
      server0.close();
      assert(
        data0.clientIp && !data0.clientIp.includes('203.0.113.195') && !data0.clientIp.includes('70.41.3.18'),
        'req.ip ignores X-Forwarded-For when TRUST_PROXY_HOPS is 0'
      );

      // 9b. TRUST_PROXY_HOPS=2: X-Forwarded-For is trusted 2 hops deep
      process.env.TRUST_PROXY_HOPS = '2';
      const appHops2 = createApp();
      assert(appHops2.get('trust proxy') === 2, 'createApp sets trust proxy to 2 when TRUST_PROXY_HOPS=2');

      const server2 = http.createServer(appHops2);
      await new Promise<void>((resolve) => server2.listen(0, '127.0.0.1', () => resolve()));
      const port2 = (server2.address() as any).port;

      const res2 = await fetch(`http://127.0.0.1:${port2}/api/v1/health`, {
        headers: { 'x-forwarded-for': '203.0.113.195, 70.41.3.18' },
      });
      const data2 = await res2.json();
      server2.close();
      assert(
        data2.clientIp === '203.0.113.195',
        'req.ip uses X-Forwarded-For client IP when TRUST_PROXY_HOPS is 2'
      );

      if (savedTrustProxy !== undefined) {
        process.env.TRUST_PROXY_HOPS = savedTrustProxy;
      } else {
        delete process.env.TRUST_PROXY_HOPS;
      }

      // ----------------------------------------------------
      // 10. Automated Audit: enforceSubscriptionReadOnly on ALL /api/v1 write routes (R-08)
      // ----------------------------------------------------
      console.log('\n--- 10. Automated Audit: Subscription Read-Only Gate on All /api/v1 Write Routes ---');
      function extractAppRoutes(stack: any[], prefix = ''): { path: string; methods: string[]; middleware: string[] }[] {
        let routes: { path: string; methods: string[]; middleware: string[] }[] = [];
        for (const layer of stack) {
          if (layer.route) {
            const methods = Object.keys(layer.route.methods).map((m) => m.toUpperCase());
            const middleware = layer.route.stack.map((s: any) => s.name || 'anonymous');
            routes.push({
              path: prefix + (layer.route.path === '/' ? '' : layer.route.path),
              methods,
              middleware,
            });
          } else if (layer.name === 'router' && layer.handle && layer.handle.stack) {
            let routerPrefix = '';
            if (layer.regexp && !layer.regexp.fast_slash) {
              let src = layer.regexp.source;
              src = src.replace('^\\', '').replace('^', '');
              src = src.replace('\\/?(?=\\/|$)', '').replace('?(?=\\/|$)', '');
              src = src.replace(/\\\//g, '/');
              routerPrefix = src;
            }
            routes = routes.concat(extractAppRoutes(layer.handle.stack, prefix + (routerPrefix ? (routerPrefix.startsWith('/') ? routerPrefix : '/' + routerPrefix) : '')));
          }
        }
        return routes;
      }

      const app = createApp();
      const allRegisteredRoutes = extractAppRoutes((app as any)._router.stack);
      const writeMethods = ['POST', 'PUT', 'PATCH', 'DELETE'];
      const v1WriteRoutes = allRegisteredRoutes.filter((r) => {
        const isV1 = r.path.startsWith('/api/v1');
        const hasWrite = r.methods.some((m) => writeMethods.includes(m));
        return isV1 && hasWrite;
      });

      const EXEMPT_PATHS = ['/api/v1/auth/login', '/api/v1/auth/logout'];
      let ungatedWriteRoutes: string[] = [];

      for (const r of v1WriteRoutes) {
        if (r.path.startsWith('/api/v1/admin') || EXEMPT_PATHS.includes(r.path)) {
          continue;
        }
        const hasGate = r.middleware.includes('enforceSubscriptionReadOnly');
        if (!hasGate) {
          ungatedWriteRoutes.push(`${r.methods.join(',')} ${r.path}`);
        }
      }

      assert(
        v1WriteRoutes.length > 0,
        `Found ${v1WriteRoutes.length} registered write routes under /api/v1`
      );
      assert(
        ungatedWriteRoutes.length === 0,
        'All registered /api/v1 write routes have enforceSubscriptionReadOnly gate',
        ungatedWriteRoutes.length > 0 ? `Ungated routes: ${ungatedWriteRoutes.join('; ')}` : undefined
      );
    }

    console.log(`\n========================================`);
    console.log(`FOUNDATION BACKEND TEST RESULTS: ${passed} PASSED, ${failed} FAILED`);
    console.log(`========================================\n`);

    if (failed > 0) {
      process.exit(1);
    }
  } catch (err) {
    console.error('Test execution error:', err);
    process.exit(1);
  } finally {
    server.close();
  }
}

runTests();
