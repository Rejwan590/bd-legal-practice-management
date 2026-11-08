process.env.JWT_SECRET = 'valid_test_secret_key_at_least_32_chars_long_1234567890';
process.env.ADMIN_JWT_SECRET = 'valid_admin_secret_key_at_least_32_chars_long_9876543210';

import assert from 'node:assert';
import http from 'node:http';
import { AddressInfo } from 'node:net';
import { createApp } from '../src/app.js';
import { getDatabase, resetDatabaseInstance } from '../src/db/client.js';
import { generateAdminAccessToken } from '../src/middleware/adminAuth.js';
import { generateAccessToken } from '../src/middleware/auth.js';
import { calculateMonthlyPriceBdt } from '../src/utils/pricing.js';

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
  let body: any = null;
  try {
    body = JSON.parse(text);
  } catch {
    body = text;
  }

  return { status: response.status, body };
}

async function runTests() {
  console.log('\n=== RUNNING SEAT & DEVICE PRICING TEST SUITE ===\n');

  // PART 1: Pricing formula unit tests
  console.log('--- Test Suite 1: Pricing Calculation Formula ---');
  const basePlan = {
    priceBdt: 50000,
    seats: 10,
    includedUsers: 10,
    includedDevices: 5,
    extraUserPriceBdt: 100,
    extraDevicePriceBdt: 100,
  };

  // 1. No extras
  const calcNoExtras = calculateMonthlyPriceBdt(basePlan, { maxUsers: 10, maxDevices: 5 });
  check(calcNoExtras.monthlyPriceBdt === 50000, 'Formula with no extras: returns exact base price (50,000 BDT)');
  check(calcNoExtras.extraUsersCount === 0 && calcNoExtras.extraDevicesCount === 0, 'Formula with no extras: extra counts are 0');

  // Lower than included does not reduce base price
  const calcBelowIncluded = calculateMonthlyPriceBdt(basePlan, { maxUsers: 5, maxDevices: 2 });
  check(calcBelowIncluded.monthlyPriceBdt === 50000, 'Formula below included: max(0, ...) ensures no negative extras');

  // 2. Only extra users
  const calcExtraUsers = calculateMonthlyPriceBdt(basePlan, { maxUsers: 14, maxDevices: 5 });
  check(calcExtraUsers.extraUsersCount === 4, 'Only extra users: extraUsersCount is 4');
  check(calcExtraUsers.extraUsersCostBdt === 400, 'Only extra users: extraUsersCostBdt is 400 BDT');
  check(calcExtraUsers.monthlyPriceBdt === 50400, 'Only extra users: monthlyPriceBdt is 50,400 BDT');

  // 3. Only extra devices
  const calcExtraDevices = calculateMonthlyPriceBdt(basePlan, { maxUsers: 10, maxDevices: 8 });
  check(calcExtraDevices.extraDevicesCount === 3, 'Only extra devices: extraDevicesCount is 3');
  check(calcExtraDevices.extraDevicesCostBdt === 300, 'Only extra devices: extraDevicesCostBdt is 300 BDT');
  check(calcExtraDevices.monthlyPriceBdt === 50300, 'Only extra devices: monthlyPriceBdt is 50,300 BDT');

  // 4. Both extra users and extra devices
  const calcBoth = calculateMonthlyPriceBdt(basePlan, { maxUsers: 12, maxDevices: 9 });
  check(calcBoth.extraUsersCount === 2 && calcBoth.extraDevicesCount === 4, 'Both extras: extra users=2, extra devices=4');
  check(calcBoth.extraUsersCostBdt === 200 && calcBoth.extraDevicesCostBdt === 400, 'Both extras: users cost=200, devices cost=400');
  check(calcBoth.monthlyPriceBdt === 50600, 'Both extras: monthlyPriceBdt is 50,600 BDT');

  // PART 2: API & Permissions tests
  console.log('\n--- Test Suite 2: API Endpoints & Role Permissions ---');
  delete process.env.DATABASE_URL;
  resetDatabaseInstance();
  const db = getDatabase();

  const app = createApp();
  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, resolve));

  try {
    const adminToken = generateAdminAccessToken({ id: 'admin-platform-001', email: 'admin@platform.bd' } as any);
    const adminCookie = `admin_access_token=${adminToken}`;

    const ownerToken = generateAccessToken({
      id: 'user-owner-001',
      firmId: 'firm-bd-001',
      role: 'Owner',
      permissions: ['*'],
    });
    const ownerCookie = `access_token=${ownerToken}`;

    const staffToken = generateAccessToken({
      id: 'user-staff-002',
      firmId: 'firm-bd-001',
      role: 'Staff',
      permissions: ['cases.view'],
    });
    const staffCookie = `access_token=${staffToken}`;

    // 5. Platform super admin can edit plan
    const updatePlanRes = await makeRequest(server, '/api/v1/admin/plans/chamber', {
      method: 'PATCH',
      cookie: adminCookie,
      body: {
        includedUsers: 12,
        includedDevices: 6,
        extraUserPriceBdt: 150,
        extraDevicePriceBdt: 120,
      },
    });
    check(updatePlanRes.status === 200, 'Platform admin can update plan parameters (HTTP 200)');
    check(updatePlanRes.body.plan?.includedUsers === 12, 'Plan includedUsers updated to 12');
    check(updatePlanRes.body.plan?.extraUserPriceBdt === 150, 'Plan extraUserPriceBdt updated to 150');

    // 6. Unauthorized or chamber users cannot edit plan
    const unauthRes = await makeRequest(server, '/api/v1/admin/plans/annual-standard', {
      method: 'PATCH',
      body: { includedUsers: 20 },
    });
    check(unauthRes.status === 401, 'Unauthenticated edit plan request is rejected (HTTP 401)');

    const ownerEditPlanRes = await makeRequest(server, '/api/v1/admin/plans/annual-standard', {
      method: 'PATCH',
      cookie: ownerCookie,
      body: { includedUsers: 20 },
    });
    check(ownerEditPlanRes.status === 401, 'Chamber Owner cannot edit plan (HTTP 401/admin token required)');

    const staffEditPlanRes = await makeRequest(server, '/api/v1/admin/plans/annual-standard', {
      method: 'PATCH',
      cookie: staffCookie,
      body: { includedUsers: 20 },
    });
    check(staffEditPlanRes.status === 401, 'Chamber Staff cannot edit plan (HTTP 401/admin token required)');

    // 7. Chamber Owner sees the renewal amount
    const ownerFirmRes = await makeRequest(server, '/api/v1/firms/current', {
      cookie: ownerCookie,
    });
    check(ownerFirmRes.status === 200, 'Chamber Owner can fetch /api/v1/firms/current (HTTP 200)');
    check(typeof ownerFirmRes.body.renewalPriceBdt === 'number', 'Chamber Owner sees renewalPriceBdt in response');
    check(ownerFirmRes.body.pricingBreakdown !== undefined, 'Chamber Owner sees pricingBreakdown in response');

    // 8. Chamber Staff does NOT see the renewal amount
    const staffFirmRes = await makeRequest(server, '/api/v1/firms/current', {
      cookie: staffCookie,
    });
    check(staffFirmRes.status === 200, 'Chamber Staff can fetch /api/v1/firms/current (HTTP 200)');
    check(staffFirmRes.body.renewalPriceBdt === undefined, 'Chamber Staff does NOT receive renewalPriceBdt (undefined)');
    check(staffFirmRes.body.monthlyPriceBdt === undefined, 'Chamber Staff does NOT receive monthlyPriceBdt (undefined)');
    check(staffFirmRes.body.pricingBreakdown === undefined, 'Chamber Staff does NOT receive pricingBreakdown (undefined)');
    check(staffFirmRes.body.userCount !== undefined, 'Chamber Staff can see userCount');
    check(staffFirmRes.body.deviceCount !== undefined, 'Chamber Staff can see deviceCount');

    // 9. Admin app firm list endpoint enriches with pricing
    const adminFirmsRes = await makeRequest(server, '/api/admin/firms', {
      cookie: adminCookie,
    });
    check(adminFirmsRes.status === 200, 'Admin can list firms (HTTP 200)');
    const firstFirm = adminFirmsRes.body.firms?.[0];
    check(firstFirm && typeof firstFirm.monthlyPriceBdt === 'number', 'Admin firms list includes monthlyPriceBdt for each firm');
    check(firstFirm && firstFirm.pricingBreakdown !== undefined, 'Admin firms list includes pricingBreakdown for each firm');

    // 10. Admin can adjust license maxUsers and maxDevices
    const adminAdjustLicenseRes = await makeRequest(server, `/api/admin/firms/${firstFirm.id}/license`, {
      method: 'PUT',
      cookie: adminCookie,
      body: {
        maxUsers: 15,
        maxDevices: 10,
      },
    });
    check(adminAdjustLicenseRes.status === 200, 'Admin can adjust license maxUsers and maxDevices (HTTP 200)');
    check(adminAdjustLicenseRes.body.firm?.maxUsers === 15, 'Firm maxUsers updated to 15');
    check(adminAdjustLicenseRes.body.firm?.maxDevices === 10, 'Firm maxDevices updated to 10');

  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }

  console.log(`\n========================================`);
  console.log(`Tests: ${passed} passed, ${failed} failed`);
  console.log(`========================================\n`);

  if (failed > 0) {
    process.exit(1);
  }
}

runTests().catch((err) => {
  console.error('Fatal error in test suite:', err);
  process.exit(1);
});
