process.env.JWT_SECRET = 'valid_test_secret_key_at_least_32_chars_long_1234567890';
process.env.ADMIN_JWT_SECRET = 'valid_admin_secret_key_at_least_32_chars_long_9876543210';

import assert from 'node:assert';
import http from 'node:http';
import { AddressInfo } from 'node:net';
import { createApp } from '../src/app.js';
import { getDatabase, resetDatabaseInstance } from '../src/db/client.js';
import { generateAdminAccessToken } from '../src/middleware/adminAuth.js';
import { generateAccessToken } from '../src/middleware/auth.js';
import { calculatePricing, calculateMonthlyPriceBdt } from '../src/utils/pricing.js';

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
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
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
  console.log('\n=== RUNNING STAGE 1: PLANS & PRICING TEST SUITE ===\n');

  const basePlan = {
    id: 'test-solo',
    name: 'Solo Test',
    priceBdt: 599,
    seats: 2,
    includedUsers: 2,
    includedDevices: 2,
    extraUserPriceBdt: 100,
    extraDevicePriceBdt: 100,
    durationMonths: 12,
  };

  // --- 1. Pricing Engine Unit Tests ---
  console.log('--- Suite 1: Pricing Engine Resolution ---');

  // Test 1: No overrides (monthly default)
  const noOverrides = calculatePricing(basePlan, {
    maxUsers: 2,
    maxDevices: 2,
    billingCycle: 'monthly',
  });
  check(noOverrides.monthlyTotal === 599, '1. No overrides: monthlyTotal = 599');
  check(noOverrides.termTotal === 599, '1. No overrides: termTotal = 599');
  check(noOverrides.annualTotal === 5990, '1. No overrides: default annualTotal = monthlyTotal * 10 (5990)');
  check(noOverrides.unit === '/ month', '1. No overrides: unit is "/ month"');
  check(noOverrides.extraUsersCount === 0 && noOverrides.extraDevicesCount === 0, '1. No extras count = 0');

  // Test 2: Each override alone
  // 2a. custom_base_price_bdt alone
  const baseOnly = calculatePricing(basePlan, {
    customBasePriceBdt: 450,
    maxUsers: 2,
    maxDevices: 2,
  });
  check(baseOnly.effectiveBasePriceBdt === 450, '2a. custom_base_price_bdt alone: effective base = 450');
  check(baseOnly.monthlyTotal === 450, '2a. custom_base_price_bdt alone: monthlyTotal = 450');
  check(baseOnly.annualTotal === 4500, '2a. custom_base_price_bdt alone: annualTotal = 4500');

  // 2b. custom_annual_price_bdt alone
  const annualOnly = calculatePricing(basePlan, {
    customAnnualPriceBdt: 5000,
    maxUsers: 2,
    maxDevices: 2,
    billingCycle: 'annual',
  });
  check(annualOnly.annualTotal === 5000, '2b. custom_annual_price_bdt alone: annualTotal = 5000');
  check(annualOnly.termTotal === 5000, '2b. custom_annual_price_bdt alone: termTotal = 5000');
  check(annualOnly.monthlyTotal === 599, '2b. custom_annual_price_bdt alone: monthlyTotal stays 599');
  check(annualOnly.unit === '/ year', '2b. annual billing cycle: unit is "/ year"');

  // 2c. custom_extra_user_price_bdt alone
  const extraUserOnly = calculatePricing(basePlan, {
    customExtraUserPriceBdt: 80,
    maxUsers: 4, // 2 extra users
    maxDevices: 2,
  });
  check(extraUserOnly.effectiveExtraUserPriceBdt === 80, '2c. custom_extra_user_price_bdt alone: effective extra user rate = 80');
  check(extraUserOnly.extraUsersCostBdt === 160, '2c. 2 extra users at 80 BDT = 160 BDT');
  check(extraUserOnly.monthlyTotal === 599 + 160, '2c. monthlyTotal = 759');

  // 2d. custom_extra_device_price_bdt alone
  const extraDeviceOnly = calculatePricing(basePlan, {
    customExtraDevicePriceBdt: 50,
    maxUsers: 2,
    maxDevices: 5, // 3 extra devices
  });
  check(extraDeviceOnly.effectiveExtraDevicePriceBdt === 50, '2d. custom_extra_device_price_bdt alone: effective extra device rate = 50');
  check(extraDeviceOnly.extraDevicesCostBdt === 150, '2d. 3 extra devices at 50 BDT = 150 BDT');
  check(extraDeviceOnly.monthlyTotal === 599 + 150, '2d. monthlyTotal = 749');

  // Test 3: All overrides together
  const allOverrides = calculatePricing(basePlan, {
    customBasePriceBdt: 400,
    customAnnualPriceBdt: 6000,
    customExtraUserPriceBdt: 70,
    customExtraDevicePriceBdt: 40,
    maxUsers: 5, // 3 extra users -> 210
    maxDevices: 4, // 2 extra devices -> 80
    billingCycle: 'annual',
  });
  check(allOverrides.monthlyTotal === 400 + 210 + 80, '3. All overrides: monthlyTotal = 690');
  check(allOverrides.annualTotal === 6000, '3. All overrides: annualTotal = 6000 (explicit override)');
  check(allOverrides.termTotal === 6000, '3. All overrides: termTotal = 6000');
  check(allOverrides.unit === '/ year', '3. All overrides: unit is "/ year"');

  // Test 4: Monthly vs Annual cycle
  const monthlyCycle = calculatePricing(basePlan, { billingCycle: 'monthly', maxUsers: 2, maxDevices: 2 });
  const annualCycle = calculatePricing(basePlan, { billingCycle: 'annual', maxUsers: 2, maxDevices: 2 });
  check(monthlyCycle.termTotal === 599 && monthlyCycle.unit === '/ month', '4. Monthly cycle: termTotal = 599, unit = / month');
  check(annualCycle.termTotal === 5990 && annualCycle.unit === '/ year', '4. Annual cycle: termTotal = 5990, unit = / year');

  // Test 5: Custom annual vs default annual
  const defaultAnnual = calculatePricing(basePlan, { billingCycle: 'annual', maxUsers: 2, maxDevices: 2 });
  const customAnnual = calculatePricing(basePlan, { customAnnualPriceBdt: 5500, billingCycle: 'annual', maxUsers: 2, maxDevices: 2 });
  check(defaultAnnual.annualTotal === 5990, '5. Default annual: 10 × 599 = 5990');
  check(customAnnual.annualTotal === 5500, '5. Custom annual override: 5500');

  // Test 6: 0 vs null
  const zeroComped = calculatePricing(basePlan, {
    customBasePriceBdt: 0,
    customExtraUserPriceBdt: 0,
    customExtraDevicePriceBdt: 0,
    maxUsers: 5,
    maxDevices: 5,
  });
  check(zeroComped.effectiveBasePriceBdt === 0, '6. 0 base price: allowed and resolves to 0 (comped/free)');
  check(zeroComped.monthlyTotal === 0, '6. 0 base + 0 extras: monthlyTotal = 0');

  const nullDefaults = calculatePricing(basePlan, {
    customBasePriceBdt: null,
    customAnnualPriceBdt: null,
    customExtraUserPriceBdt: null,
    customExtraDevicePriceBdt: null,
    maxUsers: 2,
    maxDevices: 2,
  });
  check(nullDefaults.effectiveBasePriceBdt === 599, '6. Null custom values correctly fall back to plan default (599)');
  check(nullDefaults.effectiveExtraUserPriceBdt === 100, '6. Null extra user rate falls back to plan default (100)');

  // Test 7: Negative and non-integer rejected
  let negativeRejected = false;
  try {
    calculatePricing(basePlan, { customBasePriceBdt: -50 });
  } catch (err: any) {
    negativeRejected = err.message.includes('negative');
  }
  check(negativeRejected, '7. Negative price rejected with clear error');

  let floatRejected = false;
  try {
    calculatePricing(basePlan, { customBasePriceBdt: 499.5 });
  } catch (err: any) {
    floatRejected = err.message.includes('integer');
  }
  check(floatRejected, '7. Non-integer float price rejected with clear error');

  // Test 8: 0, 1 and many extras
  const extras0 = calculatePricing(basePlan, { maxUsers: 2, maxDevices: 2 });
  const extras1 = calculatePricing(basePlan, { maxUsers: 3, maxDevices: 3 });
  const extrasMany = calculatePricing(basePlan, { maxUsers: 52, maxDevices: 22 }); // 50 extra users, 20 extra devices
  check(extras0.extraUsersCostBdt === 0 && extras0.extraDevicesCostBdt === 0, '8. 0 extras: costs are 0');
  check(extras1.extraUsersCostBdt === 100 && extras1.extraDevicesCostBdt === 100, '8. 1 extra user + 1 extra device: 100 + 100');
  check(extrasMany.extraUsersCostBdt === 5000 && extrasMany.extraDevicesCostBdt === 2000, '8. Many extras: 50*100=5000 users, 20*100=2000 devices');
  check(extrasMany.monthlyTotal === 599 + 5000 + 2000, '8. Many extras total matches sum');

  // Test 9: Plan default change does NOT affect overridden fields
  const firmWithOverrides = {
    customBasePriceBdt: 450,
    customExtraUserPriceBdt: 80,
    maxUsers: 4,
    maxDevices: 2,
  };
  const planV1 = { ...basePlan, priceBdt: 599, extraUserPriceBdt: 100, extraDevicePriceBdt: 100 };
  const planV2 = { ...basePlan, priceBdt: 799, extraUserPriceBdt: 150, extraDevicePriceBdt: 120 };
  const resV1 = calculatePricing(planV1, firmWithOverrides);
  const resV2 = calculatePricing(planV2, firmWithOverrides);
  check(resV1.effectiveBasePriceBdt === 450 && resV2.effectiveBasePriceBdt === 450, '9. Changing plan base price does not change firm custom base price');
  check(resV1.effectiveExtraUserPriceBdt === 80 && resV2.effectiveExtraUserPriceBdt === 80, '9. Changing plan extra user rate does not change firm custom extra user rate');
  check(resV1.effectiveExtraDevicePriceBdt === 100 && resV2.effectiveExtraDevicePriceBdt === 120, '9. Non-overridden field (extra device) automatically adopts new plan default (120)');

  // --- 2. API Integration Tests ---
  console.log('\n--- Suite 2: API & Database Tests ---');
  await resetDatabaseInstance();
  const db = getDatabase();

  const app = createApp();
  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));

  let admin = (await db.listPlatformAdmins())[0];
  if (!admin) {
    admin = await db.insertPlatformAdmin({
      email: 'stage1-admin@platform.bd',
      passwordHash: 'dummy_hash',
      active: true,
    });
  }
  const adminToken = generateAdminAccessToken(admin);
  const adminCookie = `admin_access_token=${adminToken}`;

  const ownerUser = await db.getUserById('user-owner-001');
  assert(ownerUser);
  const staffUser = await db.getUserById('user-staff-002');
  assert(staffUser);

  const ownerToken = generateAccessToken(ownerUser);
  const ownerCookie = `access_token=${ownerToken}`;

  const staffToken = generateAccessToken(staffUser);
  const staffCookie = `access_token=${staffToken}`;

  try {
    // 10. Only platform admins can create / edit plans
    const anonPlanPost = await makeRequest(server, '/api/admin/plans', {
      method: 'POST',
      body: { name: 'Unauthorized Plan', priceBdt: 999, includedUsers: 5, includedDevices: 5, extraUserPriceBdt: 100, extraDevicePriceBdt: 100 },
    });
    check(anonPlanPost.status === 401, '10. Anonymous user cannot create plan (HTTP 401)');

    const ownerPlanPost = await makeRequest(server, '/api/admin/plans', {
      method: 'POST',
      body: { name: 'Chamber Owner Plan', priceBdt: 999, includedUsers: 5, includedDevices: 5, extraUserPriceBdt: 100, extraDevicePriceBdt: 100 },
      cookie: ownerCookie,
    });
    check(ownerPlanPost.status === 401, '10. Chamber owner cannot create plan on platform endpoint (HTTP 401)');

    // 11. Platform admin creates plan
    const createPlanRes = await makeRequest(server, '/api/admin/plans', {
      method: 'POST',
      body: {
        id: 'enterprise-custom',
        name: 'Enterprise Custom',
        priceBdt: 4999,
        includedUsers: 20,
        includedDevices: 20,
        extraUserPriceBdt: 80,
        extraDevicePriceBdt: 80,
        durationMonths: 12,
      },
      cookie: adminCookie,
    });
    if (createPlanRes.status !== 201) {
      console.error('createPlanRes error:', createPlanRes.status, createPlanRes.body);
    }
    check(createPlanRes.status === 201, '11. Platform super admin can create plan (HTTP 201)');
    check(createPlanRes.body.plan.id === 'enterprise-custom', '11. Created plan ID matches');
    check(createPlanRes.body.plan.status === 'active', '11. Created plan default status is active');

    // 12. Soft-archive plan via PATCH
    const archiveRes = await makeRequest(server, '/api/admin/plans/enterprise-custom', {
      method: 'PATCH',
      body: { status: 'archived' },
      cookie: adminCookie,
    });
    check(archiveRes.status === 200, '12. Platform admin can soft-archive plan (HTTP 200)');
    check(archiveRes.body.plan.status === 'archived', '12. Plan status is now archived');

    // 13. Archived plan cannot be assigned to a firm
    const assignArchivedRes = await makeRequest(server, '/api/admin/firms/firm-bd-001/license', {
      method: 'PUT',
      body: { planId: 'enterprise-custom' },
      cookie: adminCookie,
    });
    check(assignArchivedRes.status === 400, '13. Assigning archived plan to firm is rejected (HTTP 400)');
    check(assignArchivedRes.body.message.includes('Cannot assign archived plan'), '13. Clear error message for archived plan rejection');

    // 14. Update firm license with custom pricing overrides
    const futureDate = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    const updateLicenseRes = await makeRequest(server, '/api/admin/firms/firm-bd-001/license', {
      method: 'PUT',
      body: {
        billingCycle: 'annual',
        customBasePriceBdt: 1000,
        customAnnualPriceBdt: 10000,
        customExtraUserPriceBdt: 75,
        customExtraDevicePriceBdt: 60,
        priceLockedUntil: futureDate,
        pricingNote: 'VIP Chamber Founder Rate locked for 90 days',
        maxUsers: 15,
        maxDevices: 10,
      },
      cookie: adminCookie,
    });
    check(updateLicenseRes.status === 200, '14. Platform admin can update firm with custom pricing and price lock (HTTP 200)');

    // 15. Verify GET /api/admin/firms/:id returns full pricing and audit
    const getAdminFirmRes = await makeRequest(server, '/api/admin/firms/firm-bd-001', {
      cookie: adminCookie,
    });
    check(getAdminFirmRes.status === 200, '15. Admin GET firm returns 200');
    check(getAdminFirmRes.body.firm.customBasePriceBdt === 1000, '15. Custom base price returned to admin');
    check(getAdminFirmRes.body.firm.pricingNote === 'VIP Chamber Founder Rate locked for 90 days', '15. Pricing note returned to admin');
    check(getAdminFirmRes.body.license.billingCycle === 'annual', '15. Billing cycle returned on license object');

    // 16. Chamber Owner never receives pricing_note or internal admin custom fields
    const getOwnerFirmRes = await makeRequest(server, '/api/v1/firms/current', {
      cookie: ownerCookie,
    });

    check(getOwnerFirmRes.status === 200, '16. Chamber owner GET /api/v1/firms/current returns 200');
    check(getOwnerFirmRes.body.pricingNote === undefined, '16. Chamber owner NEVER receives pricingNote');
    check(getOwnerFirmRes.body.customBasePriceBdt === undefined, '16. Chamber owner NEVER receives internal customBasePriceBdt');
    check(getOwnerFirmRes.body.termTotal === 10000, '16. Chamber owner receives effective termTotal (10,000)');
    check(getOwnerFirmRes.body.unit === '/ year', '16. Chamber owner receives unit "/ year"');
    check(getOwnerFirmRes.body.billingCycle === 'annual', '16. Chamber owner receives billingCycle "annual"');
    check(getOwnerFirmRes.body.maxUsers === 15, '16. Chamber owner receives maxUsers directly from firm (15)');
    check(getOwnerFirmRes.body.maxDevices === 10, '16. Chamber owner receives maxDevices directly from firm (10)');

    // 17. Chamber Staff never receives pricing_note or pricing totals
    const getStaffFirmRes = await makeRequest(server, '/api/v1/firms/current', {
      cookie: staffCookie,
    });
    check(getStaffFirmRes.status === 200, '17. Staff GET /api/v1/firms/current returns 200');
    check(getStaffFirmRes.body.pricingNote === undefined, '17. Staff NEVER receives pricingNote');
    check(getStaffFirmRes.body.monthlyPriceBdt === undefined, '17. Staff does not receive monthlyPriceBdt');
    check(getStaffFirmRes.body.termTotal === undefined, '17. Staff does not receive termTotal');
    check(getStaffFirmRes.body.maxUsers === 15, '17. Staff receives firm maxUsers (15)');
    check(getStaffFirmRes.body.maxDevices === 10, '17. Staff receives firm maxDevices (10)');

    // 18. Firm isolation: tenant cannot access or see another firm's data
    const testIsoFirmId = 'firm-bd-iso-plans-01';
    const testIsoUserId = 'user-owner-iso-plans-01';
    const firm2 = await db.insertFirm({
      id: testIsoFirmId,
      firmId: testIsoFirmId,
      name: 'Second Firm Chambers',
      maxUsers: 5,
      maxDevices: 3,
      planId: 'solo',
      licenseStartsAt: new Date(),
      licenseExpiresAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
      status: 'active',
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    const user2 = await db.insertUser({
      id: testIsoUserId,
      firmId: testIsoFirmId,
      name: 'Owner 2',
      email: 'owner2-iso-plans@firm2.bd',
      passwordHash: 'hash',
      role: 'Owner',
      permissions: ['settings.view', 'settings.manage'],
      language: 'en',
      active: true,
      mustChangePassword: false,
      failedLoginAttempts: 0,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    const firm2Token = generateAccessToken(user2);
    const firm2Cookie = `access_token=${firm2Token}`;
    const firm2Res = await makeRequest(server, '/api/v1/firms/current', {
      cookie: firm2Cookie,
    });
    check(firm2Res.status === 200, '18. Firm 2 Owner can fetch own firm info');
    check(firm2Res.body.id === testIsoFirmId, '18. Firm isolation: Firm 2 sees only its own firm ID');
    check(firm2Res.body.name === 'Second Firm Chambers', '18. Firm isolation: Firm 2 sees only its own firm name');
    check(firm2Res.body.maxUsers === 5, '18. Firm isolation: Firm 2 sees its own maxUsers limit (5, not Firm 1 15)');

    // 19. Reject negative prices in API
    const negativeApiRes = await makeRequest(server, '/api/admin/firms/firm-bd-001/license', {
      method: 'PUT',
      body: { customBasePriceBdt: -100 },
      cookie: adminCookie,
    });
    check(negativeApiRes.status === 400, '19. API rejects negative customBasePriceBdt with HTTP 400');

    // 20. Moving a firm to another plan keeps maxUsers/maxDevices unless changed
    const currentFirmBefore = await db.getFirm('firm-bd-001');
    assert(currentFirmBefore);
    check(currentFirmBefore.maxUsers === 15 && currentFirmBefore.maxDevices === 10, '20. Firm currently has maxUsers=15, maxDevices=10');
    // Change plan to 'solo' without passing maxUsers / maxDevices
    const switchPlanRes = await makeRequest(server, '/api/admin/firms/firm-bd-001/license', {
      method: 'PUT',
      body: { planId: 'solo' },
      cookie: adminCookie,
    });
    check(switchPlanRes.status === 200, '20. Successfully changed plan to solo');
    const currentFirmAfter = await db.getFirm('firm-bd-001');
    assert(currentFirmAfter);
    check(currentFirmAfter.planId === 'solo', '20. Firm plan is now solo');
    check(currentFirmAfter.maxUsers === 15 && currentFirmAfter.maxDevices === 10, '20. Moving firm to another plan kept maxUsers (15) and maxDevices (10)');

  } finally {
    server.close();
  }

  console.log(`\n=== STAGE 1 TEST SUMMARY: ${passed} passed, ${failed} failed ===\n`);
  if (failed > 0) {
    process.exit(1);
  }
}

runTests().catch((err) => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
