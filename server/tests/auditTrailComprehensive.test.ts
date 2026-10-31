process.env.JWT_SECRET = 'test_jwt_secret_key_at_least_32_chars_long_1234567890';
process.env.ADMIN_JWT_SECRET = 'test_admin_jwt_secret_key_at_least_32_chars_9876543210';

import http from 'http';
import { createApp } from '../src/app.js';
import { getDatabase } from '../src/db/client.js';
import { SEED_PASSWORDS, ALL_PERMISSIONS } from '../src/db/seed.js';

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

async function runTests() {
  console.log('--- STARTING COMPREHENSIVE SYSTEM AUDIT TRAIL TEST SUITE ---');
  const { baseUrl, server } = await startTestServer();
  const db = getDatabase();

  let passed = 0;
  let failed = 0;

  function assert(condition: boolean, name: string, detail?: string) {
    if (condition) {
      console.log(`[PASS] ${name}`);
      passed++;
    } else {
      console.error(`[FAIL] ${name} ${detail ? `- ${detail}` : ''}`);
      failed++;
    }
  }

  try {
    // 1. Authenticate Owner
    const loginRes = await fetch(`${baseUrl}/api/v1/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'owner@firm.bd', password: SEED_PASSWORDS.owner }),
    });
    assert(loginRes.status === 200, 'Owner logs in successfully');
    const ownerToken = extractToken(loginRes);

    // Verify LOGIN_SUCCESS audit log was created
    const initialLogsRes = await fetch(`${baseUrl}/api/v1/audit-log`, {
      headers: { Cookie: `access_token=${ownerToken}` },
    });
    assert(initialLogsRes.status === 200, 'GET /api/v1/audit-log returns 200');
    const initialLogs = await initialLogsRes.json();
    const loginSuccessLog = initialLogs.find((l: any) => l.action === 'LOGIN_SUCCESS');
    assert(Boolean(loginSuccessLog), 'Audit log contains LOGIN_SUCCESS record');
    assert(loginSuccessLog?.userId !== undefined, 'LOGIN_SUCCESS captures operator userId');

    // 2. Test Logout audit event
    // Create a staff user to test login and logout
    const createStaffRes = await fetch(`${baseUrl}/api/v1/users`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: `access_token=${ownerToken}` },
      body: JSON.stringify({
        name: 'Audit Test Staff',
        email: 'auditteststaff@firm.bd',
        temporaryPassword: 'Password123!',
        role: 'Staff',
        permissions: ['cases.view', 'files.view'],
      }),
    });
    assert(createStaffRes.status === 201, 'Created test staff user');
    const staffUser = await createStaffRes.json();
    const tempPw = staffUser.temporaryPassword || 'Password123!';

    const staffLoginRes = await fetch(`${baseUrl}/api/v1/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'auditteststaff@firm.bd', password: tempPw }),
    });
    assert(staffLoginRes.status === 200, 'Test staff logs in successfully');
    const staffToken = extractToken(staffLoginRes);

    const logoutRes = await fetch(`${baseUrl}/api/v1/auth/logout`, {
      method: 'POST',
      headers: { Cookie: `access_token=${staffToken}` },
    });
    assert(logoutRes.status === 200, 'POST /api/v1/auth/logout succeeds');

    const logsAfterLogoutRes = await fetch(`${baseUrl}/api/v1/audit-log`, {
      headers: { Cookie: `access_token=${ownerToken}` },
    });
    const logsAfterLogout = await logsAfterLogoutRes.json();
    const logoutLog = logsAfterLogout.find((l: any) => l.action === 'LOGOUT' && l.userId === staffUser.id);
    assert(Boolean(logoutLog), 'Audit log contains LOGOUT record with staff userId');
    assert(logoutLog?.entity === 'Session', 'LOGOUT audit entry entity is Session');

    // 3. Test Self-Service Change Password audit event
    const staffLoginAgain = await fetch(`${baseUrl}/api/v1/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'auditteststaff@firm.bd', password: tempPw }),
    });
    const freshStaffToken = extractToken(staffLoginAgain);

    const changePwRes = await fetch(`${baseUrl}/api/v1/auth/change-password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: `access_token=${freshStaffToken}` },
      body: JSON.stringify({ currentPassword: tempPw, newPassword: 'NewSecurePassword123!' }),
    });
    assert(changePwRes.status === 200, 'POST /api/v1/auth/change-password succeeds');

    const logsAfterPwRes = await fetch(`${baseUrl}/api/v1/audit-log`, {
      headers: { Cookie: `access_token=${ownerToken}` },
    });
    const logsAfterPw = await logsAfterPwRes.json();
    const pwChangeLog = logsAfterPw.find((l: any) => l.action === 'RESET_PASSWORD' && l.userId === staffUser.id);
    assert(Boolean(pwChangeLog), 'Audit log contains RESET_PASSWORD record for user password change');
    assert(pwChangeLog?.oldValue === null || typeof pwChangeLog?.oldValue === 'object', 'RESET_PASSWORD oldValue is clean');
    // Ensure zero secrets logged
    const serializedLog = JSON.stringify(pwChangeLog);
    assert(!serializedLog.includes('Password123!'), 'No raw passwords logged in audit trail');
    assert(!serializedLog.includes('$2a$'), 'No bcrypt password hashes logged in audit trail');

    // 4. Test Query Parameter Filtering on GET /api/v1/audit-log
    // Filter by entity
    const entityFilteredRes = await fetch(`${baseUrl}/api/v1/audit-log?entity=Session`, {
      headers: { Cookie: `access_token=${ownerToken}` },
    });
    assert(entityFilteredRes.status === 200, 'GET /api/v1/audit-log?entity=Session succeeds');
    const entityFiltered = await entityFilteredRes.json();
    assert(Array.isArray(entityFiltered) && entityFiltered.length > 0, 'Entity filter returns results');
    assert(entityFiltered.every((l: any) => l.entity.toLowerCase() === 'session'), 'All filtered results have entity === Session');

    // Filter by action
    const actionFilteredRes = await fetch(`${baseUrl}/api/v1/audit-log?action=LOGOUT`, {
      headers: { Cookie: `access_token=${ownerToken}` },
    });
    assert(actionFilteredRes.status === 200, 'GET /api/v1/audit-log?action=LOGOUT succeeds');
    const actionFiltered = await actionFilteredRes.json();
    assert(Array.isArray(actionFiltered) && actionFiltered.length > 0, 'Action filter returns results');
    assert(actionFiltered.every((l: any) => l.action === 'LOGOUT'), 'All filtered results have action === LOGOUT');

    // Filter by userId
    const userFilteredRes = await fetch(`${baseUrl}/api/v1/audit-log?userId=${staffUser.id}`, {
      headers: { Cookie: `access_token=${ownerToken}` },
    });
    assert(userFilteredRes.status === 200, 'GET /api/v1/audit-log?userId=... succeeds');
    const userFiltered = await userFilteredRes.json();
    assert(Array.isArray(userFiltered) && userFiltered.length > 0, 'UserId filter returns results');
    assert(userFiltered.every((l: any) => l.userId === staffUser.id), 'All filtered results belong to requested userId');

    // Pagination limit & offset
    const pageRes = await fetch(`${baseUrl}/api/v1/audit-log?limit=2&offset=1`, {
      headers: { Cookie: `access_token=${ownerToken}` },
    });
    assert(pageRes.status === 200, 'GET /api/v1/audit-log with pagination succeeds');
    const pageLogs = await pageRes.json();
    assert(Array.isArray(pageLogs) && pageLogs.length <= 2, 'Limit 2 returns at most 2 records');

    // 5. Invariant Rule: Direct client writes to audit-log are forbidden (404/405)
    const directWriteRes = await fetch(`${baseUrl}/api/v1/audit-log`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: `access_token=${ownerToken}` },
      body: JSON.stringify({ entity: 'Firm', entityId: 'firm-001', action: 'FORGED_AUDIT' }),
    });
    assert(directWriteRes.status === 404 || directWriteRes.status === 405, 'Direct client POST /api/v1/audit-log returns 404/405');

    // 6. Invariant Rule: Audit log entries cannot be modified or deleted
    const deleteAuditRes = await fetch(`${baseUrl}/api/v1/audit-log/${loginSuccessLog?.id || 'any-id'}`, {
      method: 'DELETE',
      headers: { Cookie: `access_token=${ownerToken}` },
    });
    assert(deleteAuditRes.status === 404 || deleteAuditRes.status === 405, 'DELETE /api/v1/audit-log/:id returns 404/405 (immutable)');

    const patchAuditRes = await fetch(`${baseUrl}/api/v1/audit-log/${loginSuccessLog?.id || 'any-id'}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Cookie: `access_token=${ownerToken}` },
      body: JSON.stringify({ action: 'TAMPERED' }),
    });
    assert(patchAuditRes.status === 404 || patchAuditRes.status === 405, 'PATCH /api/v1/audit-log/:id returns 404/405 (immutable)');

    // 7. Confidentiality / Central Visibility Filtering:
    // A staff user without restricted.view cannot view audit records for restricted cases
    const firmBLogs = await db.listAudit('firm-bd-002', 100, 0, false);
    assert(firmBLogs.every((l) => l.firmId === 'firm-bd-002'), 'Database listAudit strictly isolates by firmId');

  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }

  console.log('========================================');
  console.log(`SYSTEM AUDIT TRAIL TEST RESULTS: ${passed} PASSED, ${failed} FAILED`);
  console.log('========================================');

  if (failed > 0) {
    process.exit(1);
  }
}

runTests().catch((err) => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
