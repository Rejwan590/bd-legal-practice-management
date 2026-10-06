import assert from 'node:assert';
import http from 'node:http';
import { AddressInfo } from 'node:net';
import bcrypt from 'bcryptjs';
import { createApp } from '../src/app.js';
import { getDatabase, resetDatabaseInstance } from '../src/db/client.js';
import { generateAdminAccessToken } from '../src/middleware/adminAuth.js';
import { generateAccessToken } from '../src/middleware/auth.js';
import { SEED_PASSWORDS } from '../src/db/seed.js';

let passed = 0;
let failed = 0;

function check(condition: boolean, message: string) {
  if (condition) {
    console.log(`[PASS] ${message}`);
    passed++;
  } else {
    console.error(`[FAIL] ${message}`);
    failed++;
  }
}

async function makeRequest(
  server: http.Server,
  path: string,
  options: {
    method?: string;
    body?: any;
    cookie?: string;
  } = {}
) {
  const address = server.address() as AddressInfo;
  const url = `http://127.0.0.1:${address.port}${path}`;

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };

  if (options.cookie) {
    headers['Cookie'] = options.cookie;
  }

  const response = await fetch(url, {
    method: options.method || 'GET',
    headers,
    body: options.body ? JSON.stringify(options.body) : undefined,
  });

  const text = await response.text();
  let json: any = null;
  try {
    json = JSON.parse(text);
  } catch {
    json = text;
  }

  return {
    status: response.status,
    headers: response.headers,
    body: json,
  };
}

async function runAdminFirmsTests() {
  console.log('\n========================================');
  console.log('STARTING SUPER ADMIN (STEP B) TEST SUITE');
  console.log('========================================\n');

  process.env.JWT_SECRET = 'super_secret_test_jwt_key_that_is_at_least_32_characters_long_for_security';
  process.env.ADMIN_JWT_SECRET = 'admin_super_secret_jwt_key_that_is_at_least_32_chars_long_and_distinct';
  process.env.NODE_ENV = 'test';

  resetDatabaseInstance();
  const db = getDatabase();

  const app = createApp();
  const server = http.createServer(app);

  await new Promise<void>((resolve) => {
    server.listen(0, '127.0.0.1', () => resolve());
  });

  try {
    // Setup test platform admin
    const adminSalt = await bcrypt.genSalt(10);
    const adminHash = await bcrypt.hash('AdminPassword123!@#', adminSalt);
    const admin = await db.insertPlatformAdmin({
      email: 'superadmin_b@platform.bd',
      passwordHash: adminHash,
      active: true,
    });

    const adminToken = generateAdminAccessToken(admin);
    const adminCookie = `admin_access_token=${adminToken}`;

    // Setup firm owner credentials for cross-role rejection test
    const firmOwner = await db.getUserByEmail('owner@firm.bd');
    assert(firmOwner, 'Firm owner must exist in seed');
    const firmToken = generateAccessToken(firmOwner);
    const firmCookie = `access_token=${firmToken}`;

    // --- 1. Firm Owner Cannot Call Any Admin Firm Endpoints ---
    console.log('--- 1. Firm Owner Rejection on Admin Endpoints ---');

    const adminEndpoints = [
      { method: 'POST', path: '/api/admin/firms', body: { name: 'Test' } },
      { method: 'GET', path: '/api/admin/firms' },
      { method: 'GET', path: '/api/admin/firms/firm-bd-001' },
      { method: 'PATCH', path: '/api/admin/firms/firm-bd-001', body: { name: 'Hacked' } },
      { method: 'POST', path: '/api/admin/firms/firm-bd-001/suspend' },
      { method: 'POST', path: '/api/admin/firms/firm-bd-001/disable' },
      { method: 'POST', path: '/api/admin/firms/firm-bd-001/reactivate' },
      { method: 'DELETE', path: '/api/admin/firms/firm-bd-001', body: { confirmFirmName: 'Test' } },
      { method: 'PUT', path: '/api/admin/firms/firm-bd-001/license', body: { planId: 'annual-standard' } },
      { method: 'POST', path: '/api/admin/firms/firm-bd-001/renew', body: { months: 6 } },
      { method: 'POST', path: '/api/admin/firms/firm-bd-001/payments', body: { amount: 1000, method: 'bKash', txnId: 'TX1' } },
    ];

    for (const ep of adminEndpoints) {
      const res = await makeRequest(server, ep.path, {
        method: ep.method,
        body: ep.body,
        cookie: firmCookie,
      });
      check(res.status === 401, `Firm Owner calling ${ep.method} ${ep.path} rejected with HTTP 401`);
    }

    // --- 2. Create Firm (POST /api/admin/firms) with Zod Validation ---
    console.log('\n--- 2. Create Firm & First Owner Provisioning ---');

    // Validation failure: missing fields
    const invalidCreateRes = await makeRequest(server, '/api/admin/firms', {
      method: 'POST',
      body: { name: 'A' }, // name too short, missing ownerName, ownerEmail
      cookie: adminCookie,
    });
    check(invalidCreateRes.status === 400, 'POST /api/admin/firms with invalid data returns HTTP 400');
    check(Array.isArray(invalidCreateRes.body.issues), 'Zod validation issues returned');

    // Valid firm creation
    const newFirmPayload = {
      name: 'Chittagong Legal Associates',
      ownerName: 'Adv. Kamrul Hasan',
      ownerEmail: 'kamrul@ctg-legal.bd',
      contact: '+880 1819-998877',
      officeAddress: 'Agrabad C/A, Chittagong',
      barCouncilReg: 'BC-CTG-2015-1122',
      months: 6,
      maxDevices: 8,
    };

    const createRes = await makeRequest(server, '/api/admin/firms', {
      method: 'POST',
      body: newFirmPayload,
      cookie: adminCookie,
    });

    check(createRes.status === 201, 'POST /api/admin/firms succeeds with HTTP 201');
    check(Boolean(createRes.body.firm?.id), 'Firm created with valid ID');
    check(createRes.body.firm.status === 'active', 'New firm has active status');
    check(createRes.body.firm.maxDevices === 8, 'New firm maxDevices set correctly');
    check(Boolean(createRes.body.temporaryPassword), 'Temporary password generated and returned once');
    check(typeof createRes.body.temporaryPassword === 'string' && createRes.body.temporaryPassword.length >= 14, 'Temporary password meets >= 14 chars security requirement');
    check(createRes.body.ownerUser?.email === 'kamrul@ctg-legal.bd', 'First owner user email matches');
    check(createRes.body.ownerUser.mustChangePassword === true, 'First owner user flagged mustChangePassword: true');
    check(createRes.body.ownerUser.passwordHash === undefined, 'Owner password hash is never exposed');

    const createdFirmId = createRes.body.firm.id;
    const tempPassword = createRes.body.temporaryPassword;

    // Duplicate owner email rejection
    const duplicateCreateRes = await makeRequest(server, '/api/admin/firms', {
      method: 'POST',
      body: newFirmPayload,
      cookie: adminCookie,
    });
    check(duplicateCreateRes.status === 409, 'Duplicate owner email rejected with HTTP 409 Conflict');

    // First login with temporary password
    const firstLoginRes = await makeRequest(server, '/auth/login', {
      method: 'POST',
      body: { email: 'kamrul@ctg-legal.bd', password: tempPassword },
    });
    check(firstLoginRes.status === 200, 'First owner can log in with temporary password');
    check(firstLoginRes.body.user.mustChangePassword === true, 'Login response confirms mustChangePassword is true');

    // Forced password change
    const newOwnerCookie = firstLoginRes.headers.get('set-cookie') || '';
    const tokenMatch = newOwnerCookie.match(/access_token=([^;]+)/);
    const newOwnerTokenCookie = tokenMatch ? `access_token=${tokenMatch[1]}` : '';

    const changePassRes = await makeRequest(server, '/auth/change-password', {
      method: 'POST',
      body: {
        currentPassword: tempPassword,
        newPassword: 'BrandNewSecurePassword2026!',
      },
      cookie: newOwnerTokenCookie,
    });
    check(changePassRes.status === 200, 'Forced password change succeeds');

    // Verify /me reflects mustChangePassword: false
    const meRes = await makeRequest(server, '/auth/me', {
      cookie: newOwnerTokenCookie,
    });
    check(meRes.body.user.mustChangePassword === false, 'After password change, mustChangePassword is false');

    // --- 3. List Firms (GET /api/admin/firms) ---
    console.log('\n--- 3. List Firms (Pagination, Search, Filter) ---');

    const listRes = await makeRequest(server, '/api/admin/firms?page=1&limit=10', {
      cookie: adminCookie,
    });
    check(listRes.status === 200, 'GET /api/admin/firms returns HTTP 200');
    check(listRes.body.total >= 2, 'Total firms count includes seeded and newly created firm');
    check(Array.isArray(listRes.body.firms), 'Firms array returned');

    // Search filter
    const searchRes = await makeRequest(server, '/api/admin/firms?search=Chittagong', {
      cookie: adminCookie,
    });
    check(searchRes.status === 200, 'Search query returns HTTP 200');
    check(searchRes.body.firms.length === 1, 'Search finds exactly the matching firm');
    check(searchRes.body.firms[0].name === 'Chittagong Legal Associates', 'Matching firm returned');

    // --- 4. Get Firm Details & Metrics (GET /api/admin/firms/:id) ---
    console.log('\n--- 4. Get Firm Details & Metrics ---');

    const detailRes = await makeRequest(server, `/api/admin/firms/${createdFirmId}`, {
      cookie: adminCookie,
    });
    check(detailRes.status === 200, 'GET /api/admin/firms/:id returns HTTP 200');
    check(detailRes.body.firm.id === createdFirmId, 'Correct firm returned');
    check(Boolean(detailRes.body.license), 'License object present');
    check(detailRes.body.userCount >= 1, 'userCount is reported');
    check(detailRes.body.deviceCount >= 1, 'deviceCount is reported');
    check(detailRes.body.lastActivity !== undefined, 'lastActivity is reported');
    check(detailRes.body.plan !== undefined, 'plan details populated');

    // --- 5. Update Firm Details (PATCH /api/admin/firms/:id) ---
    console.log('\n--- 5. Update Firm Details ---');

    const patchRes = await makeRequest(server, `/api/admin/firms/${createdFirmId}`, {
      method: 'PATCH',
      body: {
        name: 'Chittagong Legal Chambers & Partners',
        contact: '+880 1819-000111',
      },
      cookie: adminCookie,
    });
    check(patchRes.status === 200, 'PATCH /api/admin/firms/:id returns HTTP 200');
    check(patchRes.body.firm.name === 'Chittagong Legal Chambers & Partners', 'Firm name updated');
    check(patchRes.body.firm.contact === '+880 1819-000111', 'Firm contact updated');

    // --- 6. Firm Suspension & Session Invalidation ---
    console.log('\n--- 6. Firm Suspension & Session Invalidation ---');

    const suspendRes = await makeRequest(server, `/api/admin/firms/${createdFirmId}/suspend`, {
      method: 'POST',
      cookie: adminCookie,
    });
    check(suspendRes.status === 200, 'POST /api/admin/firms/:id/suspend returns HTTP 200');
    check(suspendRes.body.firm.status === 'suspended', 'Firm status set to suspended');

    // Suspended firm login fails
    const suspendedLoginRes = await makeRequest(server, '/auth/login', {
      method: 'POST',
      body: { email: 'kamrul@ctg-legal.bd', password: 'BrandNewSecurePassword2026!' },
    });
    check(suspendedLoginRes.status === 403, 'Suspended firm user login rejected with HTTP 403');
    check(suspendedLoginRes.body.code === 'FIRM_SUSPENDED', 'Response error code is FIRM_SUSPENDED');

    // Suspended firm existing active session rejected on next request
    const existingSessionRes = await makeRequest(server, '/api/v1/firms/current', {
      cookie: newOwnerTokenCookie,
    });
    check(existingSessionRes.status === 403, 'Existing session of suspended firm immediately returns HTTP 403 on next request');

    // --- 7. Firm Reactivation ---
    console.log('\n--- 7. Firm Reactivation ---');

    const reactivateRes = await makeRequest(server, `/api/admin/firms/${createdFirmId}/reactivate`, {
      method: 'POST',
      cookie: adminCookie,
    });
    check(reactivateRes.status === 200, 'POST /api/admin/firms/:id/reactivate returns HTTP 200');
    check(reactivateRes.body.firm.status === 'active', 'Firm status restored to active');

    // Login works again after reactivation
    const reactivatedLoginRes = await makeRequest(server, '/auth/login', {
      method: 'POST',
      body: { email: 'kamrul@ctg-legal.bd', password: 'BrandNewSecurePassword2026!' },
    });
    check(reactivatedLoginRes.status === 200, 'Reactivated firm user can log in again');

    // --- 8. Firm Disabling ---
    console.log('\n--- 8. Firm Disabling ---');

    const disableRes = await makeRequest(server, `/api/admin/firms/${createdFirmId}/disable`, {
      method: 'POST',
      cookie: adminCookie,
    });
    check(disableRes.status === 200, 'POST /api/admin/firms/:id/disable returns HTTP 200');
    check(disableRes.body.firm.status === 'disabled', 'Firm status set to disabled');

    // Disabled firm login fails with 403
    const disabledLoginRes = await makeRequest(server, '/auth/login', {
      method: 'POST',
      body: { email: 'kamrul@ctg-legal.bd', password: 'BrandNewSecurePassword2026!' },
    });
    check(disabledLoginRes.status === 403, 'Disabled firm login rejected with HTTP 403');
    check(disabledLoginRes.body.code === 'FIRM_DISABLED', 'Response code is FIRM_DISABLED');

    // Re-activate before license tests
    await makeRequest(server, `/api/admin/firms/${createdFirmId}/reactivate`, {
      method: 'POST',
      cookie: adminCookie,
    });

    // --- 9. License Update (PUT /api/admin/firms/:id/license) ---
    console.log('\n--- 9. License Update ---');

    const licenseUpdateRes = await makeRequest(server, `/api/admin/firms/${createdFirmId}/license`, {
      method: 'PUT',
      body: {
        maxDevices: 15,
        expiryDate: '2028-12-31T23:59:59.000Z',
      },
      cookie: adminCookie,
    });
    check(licenseUpdateRes.status === 200, 'PUT /api/admin/firms/:id/license returns HTTP 200');
    check(licenseUpdateRes.body.firm.maxDevices === 15, 'maxDevices updated to 15');

    // --- 10. License Renewal (POST /api/admin/firms/:id/renew) ---
    console.log('\n--- 10. License Renewal & Data Retention ---');

    // Add a client and case to created firm to verify renewal never deletes data
    const newClient = await db.insertClient({
      id: `client-${crypto.randomUUID()}`,
      firmId: createdFirmId,
      name: 'Test Client CTG',
      nameBn: null,
      email: null,
      phone: '+880 1711-123123',
      address: 'Chittagong Port',
      notes: null,
      archived: false,
      createdAt: new Date(),
      updatedAt: new Date(),
      deletedAt: null,
      createdBy: null,
      updatedBy: null,
    });

    const currentExpiry = new Date(licenseUpdateRes.body.firm.licenseExpiresAt).getTime();

    const renewRes = await makeRequest(server, `/api/admin/firms/${createdFirmId}/renew`, {
      method: 'POST',
      body: { months: 12 },
      cookie: adminCookie,
    });
    check(renewRes.status === 200, 'POST /api/admin/firms/:id/renew returns HTTP 200');

    const updatedExpiry = new Date(renewRes.body.firm.licenseExpiresAt).getTime();
    check(updatedExpiry > currentExpiry, 'Renewal extends license beyond current expiry');

    // Invariant: renewal never deletes data
    const clientAfterRenewal = await db.getClientById(newClient.id, createdFirmId);
    check(clientAfterRenewal !== null, 'Client data preserved after renewal (never deletes data)');

    // --- 11. Payments (POST /api/admin/firms/:id/payments) ---
    console.log('\n--- 11. Payment Recording ---');

    const paymentRes = await makeRequest(server, `/api/admin/firms/${createdFirmId}/payments`, {
      method: 'POST',
      body: {
        amount: 35000,
        method: 'bKash',
        txnId: 'BKASH9928374',
        note: '6-month license extension fee',
      },
      cookie: adminCookie,
    });
    check(paymentRes.status === 201, 'POST /api/admin/firms/:id/payments returns HTTP 201');
    check(paymentRes.body.payment.amount === 35000, 'Payment amount stored correctly');
    check(paymentRes.body.payment.method === 'bKash', 'Payment method stored correctly');

    // Payment validation: invalid payment method
    const invalidPaymentRes = await makeRequest(server, `/api/admin/firms/${createdFirmId}/payments`, {
      method: 'POST',
      body: {
        amount: 1000,
        method: 'crypto', // not allowed
        txnId: 'CRYPTO1',
      },
      cookie: adminCookie,
    });
    check(invalidPaymentRes.status === 400, 'Invalid payment method rejected with HTTP 400');

    // --- 12. Soft Delete Firm (DELETE /api/admin/firms/:id) ---
    console.log('\n--- 12. Soft Delete Firm (Requires Typing Exact Name) ---');

    // Wrong confirmation name
    const wrongNameRes = await makeRequest(server, `/api/admin/firms/${createdFirmId}`, {
      method: 'DELETE',
      body: { confirmFirmName: 'Wrong Name' },
      cookie: adminCookie,
    });
    check(wrongNameRes.status === 400, 'DELETE with mismatched firm name rejected with HTTP 400');

    // Correct confirmation name
    const correctDeleteRes = await makeRequest(server, `/api/admin/firms/${createdFirmId}`, {
      method: 'DELETE',
      body: { confirmFirmName: 'Chittagong Legal Chambers & Partners' },
      cookie: adminCookie,
    });
    check(correctDeleteRes.status === 200, 'DELETE with matching firm name succeeds with HTTP 200');
    check(Boolean(correctDeleteRes.body.firm.deletedAt), 'Firm marked soft-deleted (deletedAt set)');

    // Invariant: data preserved in database
    const softDeletedFirm = await db.getFirm(createdFirmId, true);
    check(softDeletedFirm !== null, 'Soft-deleted firm record is preserved in database');
    const preservedClient = await db.getClientById(newClient.id, createdFirmId);
    check(preservedClient !== null, 'Firm client records are preserved in database');

    // --- 13. Audit Trail Verification (adminAudit & license_events) ---
    console.log('\n--- 13. Audit Logging Verification ---');

    const adminAudits = await db.listAdminAudit(100);
    const firmAudits = adminAudits.filter((a) => a.targetFirmId === createdFirmId);

    const auditActions = firmAudits.map((a) => a.action);
    check(auditActions.includes('FIRM_CREATE'), 'adminAudit recorded FIRM_CREATE');
    check(auditActions.includes('FIRM_UPDATE'), 'adminAudit recorded FIRM_UPDATE');
    check(auditActions.includes('FIRM_SUSPEND'), 'adminAudit recorded FIRM_SUSPEND');
    check(auditActions.includes('FIRM_DISABLE'), 'adminAudit recorded FIRM_DISABLE');
    check(auditActions.includes('FIRM_REACTIVATE'), 'adminAudit recorded FIRM_REACTIVATE');
    check(auditActions.includes('LICENSE_UPDATE'), 'adminAudit recorded LICENSE_UPDATE');
    check(auditActions.includes('LICENSE_RENEW'), 'adminAudit recorded LICENSE_RENEW');
    check(auditActions.includes('PAYMENT_RECORD'), 'adminAudit recorded PAYMENT_RECORD');
    check(auditActions.includes('FIRM_SOFT_DELETE'), 'adminAudit recorded FIRM_SOFT_DELETE');

    const licenseEvents = await db.listLicenseEvents(createdFirmId);
    const eventTypes = licenseEvents.map((e) => e.type);
    check(eventTypes.includes('CREATE'), 'license_events recorded CREATE');
    check(eventTypes.includes('SUSPEND'), 'license_events recorded SUSPEND');
    check(eventTypes.includes('DISABLE'), 'license_events recorded DISABLE');
    check(eventTypes.includes('REACTIVATE'), 'license_events recorded REACTIVATE');
    check(eventTypes.includes('UPDATE'), 'license_events recorded UPDATE');
    check(eventTypes.includes('RENEW'), 'license_events recorded RENEW');
    check(eventTypes.includes('SOFT_DELETE'), 'license_events recorded SOFT_DELETE');

  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }

  console.log('\n========================================');
  console.log(`SUPER ADMIN (STEP B) TEST RESULTS: ${passed} PASSED, ${failed} FAILED`);
  console.log('========================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runAdminFirmsTests().catch((err) => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
