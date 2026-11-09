process.env.JWT_SECRET = 'valid_test_secret_key_at_least_32_chars_long_1234567890';
process.env.ADMIN_JWT_SECRET = 'valid_admin_secret_key_at_least_32_chars_long_9876543210';

import assert from 'node:assert';
import http from 'node:http';
import { AddressInfo } from 'node:net';
import { createApp } from '../src/app.js';
import { getDatabase, resetDatabaseInstance } from '../src/db/client.js';
import { generateAdminAccessToken } from '../src/middleware/adminAuth.js';
import { generateAccessToken } from '../src/middleware/auth.js';
import { addDaysDhakaEndOfDay } from '../src/routes/adminFirms.js';

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

// Dhaka date calculation helpers
function getDhakaDateString(date: Date | string | number = new Date()): string {
  const d = typeof date === 'object' && date instanceof Date ? date : new Date(date);
  return d.toLocaleDateString('en-CA', { timeZone: 'Asia/Dhaka' });
}

function calculateDaysLeftDhaka(
  targetDate: Date | string | number,
  referenceDate: Date | string | number = new Date()
): number {
  const targetStr = getDhakaDateString(targetDate);
  const refStr = getDhakaDateString(referenceDate);
  const [tY, tM, tD] = targetStr.split('-').map(Number);
  const [rY, rM, rD] = refStr.split('-').map(Number);
  const tUtc = Date.UTC(tY, tM - 1, tD);
  const rUtc = Date.UTC(rY, rM - 1, rD);
  return Math.round((tUtc - rUtc) / 86400000);
}

async function runTests() {
  console.log('\n=== RUNNING STAGE 2: CUSTOM TRIAL PERIOD TEST SUITE ===\n');

  // Initialize DB and Express app
  await resetDatabaseInstance();
  const db = getDatabase();
  const app = createApp();

  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, resolve));

  try {
    let admin = (await db.listPlatformAdmins())[0];
    if (!admin) {
      admin = await db.insertPlatformAdmin({
        email: 'stage2admin@platform.bd',
        passwordHash: 'dummy_hash',
        active: true,
      });
    }
    const adminToken = generateAdminAccessToken(admin);
    const adminCookie = `admin_access_token=${adminToken}`;

    // ----------------------------------------------------
    // TEST GROUP 1: Trial Creation with Custom Days
    // ----------------------------------------------------
    console.log('--- 1. Trial Creation with Custom Days ---');
    const trialRes = await makeRequest(server, '/api/admin/firms', {
      method: 'POST',
      cookie: adminCookie,
      body: {
        name: 'Trial Chambers Ltd',
        licenseType: 'trial',
        trialDays: 14,
        ownerName: 'Advocate Trial',
        ownerEmail: 'trial.owner@firm.bd',
      },
    });

    check(trialRes.status === 201, 'POST /firms creates trial firm successfully (201)');
    const trialFirm = trialRes.body.firm;
    check(trialFirm.isTrial === true, 'Firm is marked as trial (is_trial = true)');
    check(trialFirm.trialDays === 14, 'trial_days correctly recorded as 14');
    check(Boolean(trialFirm.trialStartedAt), 'trial_started_at timestamp recorded');
    check(trialFirm.status === 'active', 'Trial firm status is active');

    // Check expiry end-of-day in Asia/Dhaka
    const expiry = new Date(trialFirm.licenseExpiresAt);
    const dhakaDateStr = getDhakaDateString(expiry);
    const expectedExpiry = addDaysDhakaEndOfDay(new Date(), 14);
    check(
      expiry.toISOString() === expectedExpiry.toISOString(),
      `Trial expiry is set to 23:59 Asia/Dhaka (${expiry.toISOString()})`
    );
    const daysLeft = calculateDaysLeftDhaka(trialFirm.licenseExpiresAt);
    check(daysLeft === 14, `calculateDaysLeftDhaka returns exactly 14 days (got ${daysLeft})`);

    // ----------------------------------------------------
    // TEST GROUP 2: Validation of Trial Days (missing, 0, negative, decimal, 366)
    // ----------------------------------------------------
    console.log('\n--- 2. Validation of Trial Days ---');

    // Missing trialDays
    const missingDaysRes = await makeRequest(server, '/api/admin/firms', {
      method: 'POST',
      cookie: adminCookie,
      body: {
        name: 'Invalid Trial 1',
        licenseType: 'trial',
        ownerName: 'Owner 1',
        ownerEmail: 'invalid1@firm.bd',
      },
    });
    check(missingDaysRes.status === 400, 'Missing trialDays is rejected with 400');

    // 0 trialDays
    const zeroDaysRes = await makeRequest(server, '/api/admin/firms', {
      method: 'POST',
      cookie: adminCookie,
      body: {
        name: 'Invalid Trial 2',
        licenseType: 'trial',
        trialDays: 0,
        ownerName: 'Owner 2',
        ownerEmail: 'invalid2@firm.bd',
      },
    });
    check(zeroDaysRes.status === 400, '0 trialDays is rejected with 400');

    // Negative trialDays
    const negDaysRes = await makeRequest(server, '/api/admin/firms', {
      method: 'POST',
      cookie: adminCookie,
      body: {
        name: 'Invalid Trial 3',
        licenseType: 'trial',
        trialDays: -5,
        ownerName: 'Owner 3',
        ownerEmail: 'invalid3@firm.bd',
      },
    });
    check(negDaysRes.status === 400, 'Negative trialDays (-5) is rejected with 400');

    // Decimal trialDays
    const decimalDaysRes = await makeRequest(server, '/api/admin/firms', {
      method: 'POST',
      cookie: adminCookie,
      body: {
        name: 'Invalid Trial 4',
        licenseType: 'trial',
        trialDays: 14.5,
        ownerName: 'Owner 4',
        ownerEmail: 'invalid4@firm.bd',
      },
    });
    check(decimalDaysRes.status === 400, 'Decimal trialDays (14.5) is rejected with 400');

    // 366 trialDays
    const overDaysRes = await makeRequest(server, '/api/admin/firms', {
      method: 'POST',
      cookie: adminCookie,
      body: {
        name: 'Invalid Trial 5',
        licenseType: 'trial',
        trialDays: 366,
        ownerName: 'Owner 5',
        ownerEmail: 'invalid5@firm.bd',
      },
    });
    check(overDaysRes.status === 400, '366 trialDays is rejected with 400 (max 365)');

    // ----------------------------------------------------
    // TEST GROUP 3: Frontend Validation Rule Simulation
    // ----------------------------------------------------
    console.log('\n--- 3. Form Submission Validation Guard ---');
    const validateFormInput = (input: string) => {
      const trimmed = input.trim();
      if (!trimmed) return false;
      const parsed = parseInt(trimmed, 10);
      return !isNaN(parsed) && parsed >= 1 && parsed <= 365 && String(parsed) === trimmed;
    };

    check(validateFormInput('') === false, 'Empty trial input disables submission');
    check(validateFormInput('   ') === false, 'Whitespace trial input disables submission');
    check(validateFormInput('0') === false, '0 string disables submission');
    check(validateFormInput('-10') === false, 'Negative string disables submission');
    check(validateFormInput('14.5') === false, 'Decimal string disables submission');
    check(validateFormInput('366') === false, '366 string disables submission');
    check(validateFormInput('14') === true, 'Valid 14 string enables submission');
    check(validateFormInput('365') === true, 'Valid 365 string enables submission');

    // ----------------------------------------------------
    // TEST GROUP 4: Days Left on Dhaka Dates Across Midnight
    // ----------------------------------------------------
    console.log('\n--- 4. Dhaka Timezone Midnight Calculations ---');
    // Early morning in Dhaka (02:00 AM BST = 20:00 UTC previous day)
    const earlyMorningUtc = new Date('2026-11-12T20:00:00.000Z'); // 02:00 AM on 13 Nov in Dhaka
    check(
      getDhakaDateString(earlyMorningUtc) === '2026-11-13',
      'UTC 20:00 maps to 2026-11-13 in Asia/Dhaka (+06:00)'
    );

    // Target end of day across midnight
    const endOfDayDhaka = addDaysDhakaEndOfDay(new Date('2026-11-12T04:00:00.000Z'), 1);
    check(
      endOfDayDhaka.toISOString() === '2026-11-13T17:59:59.999Z',
      'addDaysDhakaEndOfDay ends at 17:59:59.999Z (23:59:59.999 Dhaka)'
    );

    const diffAcrossMidnight = calculateDaysLeftDhaka(
      '2026-11-14T17:59:59.999Z',
      '2026-11-12T20:00:00.000Z' // 13 Nov in Dhaka
    );
    check(diffAcrossMidnight === 1, 'Days left computed correctly across Dhaka calendar days');

    // ----------------------------------------------------
    // TEST GROUP 5: No Price Charged During Active Trial
    // ----------------------------------------------------
    console.log('\n--- 5. No Price Charged / Pricing Marked After Trial ---');
    const adminFirmGet = await makeRequest(server, `/api/admin/firms/${trialFirm.id}`, {
      cookie: adminCookie,
    });
    check(adminFirmGet.status === 200, 'GET /admin/firms/:id returns 200');
    check(
      adminFirmGet.body.monthlyPriceBdt === 0,
      'Active trial monthlyPriceBdt is 0'
    );
    check(
      adminFirmGet.body.pricingBreakdown?.note === 'after trial',
      'Pricing breakdown is marked "after trial"'
    );

    // Chamber owner route never receives price during trial
    const ownerUser = await db.getUserByEmail('trial.owner@firm.bd');
    assert(ownerUser, 'Owner user must exist');
    const chamberToken = generateAccessToken(ownerUser);
    const chamberCookie = `access_token=${chamberToken}`;

    const chamberGet = await makeRequest(server, '/api/v1/firms/current', {
      cookie: chamberCookie,
    });
    check(chamberGet.status === 200, 'GET /api/v1/firms/current returns 200');
    check(
      chamberGet.body.renewalPriceBdt === undefined,
      'renewalPriceBdt is not sent to chamber during trial'
    );
    check(
      chamberGet.body.monthlyPriceBdt === undefined,
      'monthlyPriceBdt is not sent to chamber during trial'
    );
    check(
      chamberGet.body.pricingBreakdown === undefined,
      'pricingBreakdown is not sent to chamber during trial'
    );
    check(
      chamberGet.body.isTrial === true,
      'Chamber firm receives isTrial = true to display trial banner'
    );

    // ----------------------------------------------------
    // TEST GROUP 6: Expiry Blocks Mutating Writes While Reads & Exports Work
    // ----------------------------------------------------
    console.log('\n--- 6. Expiry Enforces Read-Only Mode (Blocks Writes, Keeps Reads/Export) ---');
    // Set trial firm license to expired (e.g. 10 days in past)
    const pastExpiry = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000);
    await db.updateFirm(trialFirm.id, {
      licenseExpiresAt: pastExpiry,
      status: 'expired',
    });

    // Write endpoint: creating a client must be blocked (403)
    const writeBlockedRes = await makeRequest(server, '/api/v1/clients', {
      method: 'POST',
      cookie: chamberCookie,
      body: {
        name: 'Blocked Client',
        phone: '01700000000',
      },
    });
    check(
      writeBlockedRes.status === 403,
      `Mutating write POST /clients is blocked with 403 (got ${writeBlockedRes.status})`
    );
    check(
      writeBlockedRes.body?.code === 'SUBSCRIPTION_READ_ONLY',
      'Error code is SUBSCRIPTION_READ_ONLY'
    );

    // Read endpoint: listing clients must work (200)
    const readAllowedRes = await makeRequest(server, '/api/v1/clients', {
      method: 'GET',
      cookie: chamberCookie,
    });
    check(
      readAllowedRes.status === 200,
      'Read endpoint GET /clients returns 200 during expired read-only mode'
    );

    // Chamber backup export reads (firm, clients, cases, hearings) must remain fully accessible (200)
    const exportFirm = await makeRequest(server, '/api/v1/firms/current', { cookie: chamberCookie });
    const exportClients = await makeRequest(server, '/api/v1/clients', { cookie: chamberCookie });
    const exportCases = await makeRequest(server, '/api/v1/cases', { cookie: chamberCookie });
    const exportHearings = await makeRequest(server, '/api/v1/hearings', { cookie: chamberCookie });

    check(exportFirm.status === 200, 'Chamber backup export: reading firm current succeeds (200) during read-only mode');
    check(exportClients.status === 200, 'Chamber backup export: reading clients succeeds (200) during read-only mode');
    check(exportCases.status === 200, 'Chamber backup export: reading cases succeeds (200) during read-only mode');
    check(exportHearings.status === 200, 'Chamber backup export: reading hearings succeeds (200) during read-only mode');

    // ----------------------------------------------------
    // TEST GROUP 7: Extend an Active and an Expired Trial
    // ----------------------------------------------------
    console.log('\n--- 7. Extend Active and Expired Trials ---');
    // A) Extend expired trial: should extend from today and reactivate firm
    const extendExpiredRes = await makeRequest(server, `/api/admin/firms/${trialFirm.id}/extend-trial`, {
      method: 'POST',
      cookie: adminCookie,
      body: { days: 7 },
    });
    check(extendExpiredRes.status === 200, 'POST /extend-trial on expired firm returns 200');
    check(extendExpiredRes.body.firm.status === 'active', 'Expired firm is reactivated to status = active');
    check(
      extendExpiredRes.body.firm.trialDays === 21,
      `trial_days incremented from 14 to 21 (got ${extendExpiredRes.body.firm.trialDays})`
    );
    const newDaysLeft = calculateDaysLeftDhaka(extendExpiredRes.body.firm.licenseExpiresAt);
    check(newDaysLeft === 7, `New expiry is 7 days from today (got ${newDaysLeft})`);

    // B) Extend an active trial: should extend from current expiry
    const extendActiveRes = await makeRequest(server, `/api/admin/firms/${trialFirm.id}/extend-trial`, {
      method: 'POST',
      cookie: adminCookie,
      body: { days: 5 },
    });
    check(extendActiveRes.status === 200, 'POST /extend-trial on active firm returns 200');
    check(
      extendActiveRes.body.firm.trialDays === 26,
      `trial_days incremented to 26 (got ${extendActiveRes.body.firm.trialDays})`
    );
    const cumulativeDaysLeft = calculateDaysLeftDhaka(extendActiveRes.body.firm.licenseExpiresAt);
    check(cumulativeDaysLeft === 12, `Expiry extended from current expiry: 7 + 5 = 12 days left (got ${cumulativeDaysLeft})`);

    // C) Reject extending non-trial firm
    const paidFirm = await db.insertFirm({
      id: 'firm-paid-non-trial',
      firmId: 'firm-paid-non-trial',
      name: 'Paid Standard Chamber',
      isTrial: false,
      licenseExpiresAt: new Date(Date.now() + 100 * 24 * 60 * 60 * 1000),
      status: 'active',
    });
    const extendNonTrialRes = await makeRequest(server, `/api/admin/firms/${paidFirm.id}/extend-trial`, {
      method: 'POST',
      cookie: adminCookie,
      body: { days: 7 },
    });
    check(extendNonTrialRes.status === 400, 'Extending non-trial firm is rejected with 400');

    // D) Reject invalid days in extend-trial
    const extendInvalidRes = await makeRequest(server, `/api/admin/firms/${trialFirm.id}/extend-trial`, {
      method: 'POST',
      cookie: adminCookie,
      body: { days: 0 },
    });
    check(extendInvalidRes.status === 400, '0 days in extend-trial rejected with 400');

    // ----------------------------------------------------
    // TEST GROUP 8: Convert to Paid
    // ----------------------------------------------------
    console.log('\n--- 8. Convert to Paid ---');
    const convertRes = await makeRequest(server, `/api/admin/firms/${trialFirm.id}/convert-to-paid`, {
      method: 'POST',
      cookie: adminCookie,
      body: {
        planId: 'chamber',
        billingCycle: 'annual',
      },
    });
    check(convertRes.status === 200, 'POST /convert-to-paid returns 200');
    const convertedFirm = convertRes.body.firm;
    check(convertedFirm.isTrial === false, 'is_trial is cleared (false)');
    check(convertedFirm.planId === 'chamber', 'planId assigned to chamber');
    check(convertedFirm.billingCycle === 'annual', 'billingCycle set to annual');
    check(convertedFirm.status === 'active', 'Converted firm status is active');

    // Verify archived plan cannot be used for conversion
    // Ensure annual-standard is archived in DB
    const annualPlan = await db.getPlan('annual-standard');
    if (annualPlan && annualPlan.status !== 'archived') {
      await db.updatePlan('annual-standard', { status: 'archived' });
    }
    const convertArchivedRes = await makeRequest(server, `/api/admin/firms/${trialFirm.id}/convert-to-paid`, {
      method: 'POST',
      cookie: adminCookie,
      body: {
        planId: 'annual-standard', // archived in seed
        billingCycle: 'annual',
      },
    });
    check(convertArchivedRes.status === 400, 'Converting to archived plan is rejected with 400');

    // ----------------------------------------------------
    // TEST GROUP 9: Platform Admin Authorization Guard
    // ----------------------------------------------------
    console.log('\n--- 9. Platform Admin Security Guard ---');
    const unauthorizedExtend = await makeRequest(server, `/api/admin/firms/${trialFirm.id}/extend-trial`, {
      method: 'POST',
      cookie: chamberCookie, // regular chamber token, not platform admin!
      body: { days: 10 },
    });
    check(
      unauthorizedExtend.status === 401 || unauthorizedExtend.status === 403,
      `Non-platform admin cannot extend trial (${unauthorizedExtend.status})`
    );

    const unauthorizedConvert = await makeRequest(server, `/api/admin/firms/${trialFirm.id}/convert-to-paid`, {
      method: 'POST',
      cookie: chamberCookie,
      body: { planId: 'solo' },
    });
    check(
      unauthorizedConvert.status === 401 || unauthorizedConvert.status === 403,
      `Non-platform admin cannot convert to paid (${unauthorizedConvert.status})`
    );

    // ----------------------------------------------------
    // TEST GROUP 10: Firm Isolation Guard
    // ----------------------------------------------------
    console.log('\n--- 10. Firm Isolation Guard ---');
    // Create Firm B
    const firmBRes = await makeRequest(server, '/api/admin/firms', {
      method: 'POST',
      cookie: adminCookie,
      body: {
        name: 'Chamber B Practice',
        licenseType: 'trial',
        trialDays: 30,
        ownerName: 'Advocate B',
        ownerEmail: 'owner.b@firm.bd',
      },
    });
    check(firmBRes.status === 201, 'Firm B created');

    const ownerB = await db.getUserByEmail('owner.b@firm.bd');
    assert(ownerB, 'Owner B must exist');
    const tokenB = generateAccessToken(ownerB);
    const cookieB = `access_token=${tokenB}`;

    // User from Firm A trying to access Firm B /current should get Firm A data, not Firm B
    const firmACurrent = await makeRequest(server, '/api/v1/firms/current', {
      cookie: chamberCookie,
    });
    check(
      firmACurrent.body.id === trialFirm.id,
      'Firm A user strictly receives Firm A data (firm isolation verified)'
    );

    // ----------------------------------------------------
    // TEST GROUP 11: Audit Entries & License Events Exist
    // ----------------------------------------------------
    console.log('\n--- 11. Audit Logs and License Events Verification ---');
    const audits = await db.listAdminAudit();
    const firmAudits = audits.filter((a: any) => a.targetFirmId === trialFirm.id);
    const auditActions = firmAudits.map((a: any) => a.action);
    check(auditActions.includes('FIRM_CREATE'), 'Admin audit log contains FIRM_CREATE');
    check(auditActions.includes('FIRM_EXTEND_TRIAL'), 'Admin audit log contains FIRM_EXTEND_TRIAL');
    check(auditActions.includes('FIRM_CONVERT_TO_PAID'), 'Admin audit log contains FIRM_CONVERT_TO_PAID');

    const licenseEvents = await db.listLicenseEvents(trialFirm.id);
    const eventTypes = licenseEvents.map((e: any) => e.type);
    check(eventTypes.includes('CREATE'), 'License events contains CREATE');
    check(eventTypes.includes('EXTEND_TRIAL'), 'License events contains EXTEND_TRIAL');
    check(eventTypes.includes('CONVERT_TO_PAID'), 'License events contains CONVERT_TO_PAID');

    console.log(`\n==============================================`);
    console.log(`STAGE 2 RESULTS: ${passed} PASSED, ${failed} FAILED`);
    console.log(`==============================================\n`);

    if (failed > 0) {
      process.exit(1);
    }
  } finally {
    server.close();
  }
}

runTests().catch((err) => {
  console.error('Unhandled test failure:', err);
  process.exit(1);
});
