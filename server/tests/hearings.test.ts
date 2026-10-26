process.env.JWT_SECRET = 'test_jwt_secret_key_at_least_32_chars_long_1234567890';
process.env.ADMIN_JWT_SECRET = 'test_admin_jwt_secret_key_at_least_32_chars_9876543210';

import http from 'http';
import { createApp } from '../src/app.js';
import { getDatabase } from '../src/db/client.js';
import { SEED_PASSWORDS } from '../src/db/seed.js';
import bcrypt from 'bcryptjs';

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
  console.log('--- STARTING BACKEND STEP 3.3 HEARINGS & DATE FIXED FOR TEST SUITE ---');
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
    // Authenticate Owner
    const ownerRes = await fetch(`${baseUrl}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'owner@firm.bd', password: SEED_PASSWORDS.owner }),
    });
    const ownerToken = extractToken(ownerRes);
    const ownerCookie = `access_token=${ownerToken}`;

    const meRes = await fetch(`${baseUrl}/auth/me`, {
      headers: { Cookie: ownerCookie },
    });
    const meJson = await meRes.json();
    const firmId = meJson.user.firmId; // 'firm-bd-001'

    // Create staff without hearings.update for permission tests
    const passwordHash = await bcrypt.hash('StaffPassword123!', 10);
    await db.insertUser({
      id: 'staff-no-hearings-perm',
      firmId,
      name: 'No Hearing Perm Staff',
      email: 'noperm@firm.bd',
      passwordHash,
      role: 'Staff',
      jobType: 'clerk',
      permissions: ['cases.view'],
      language: 'en',
      active: true,
      mustChangePassword: false,
    });

    const staffLoginRes = await fetch(`${baseUrl}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'noperm@firm.bd', password: 'StaffPassword123!' }),
    });
    const staffCookie = `access_token=${extractToken(staffLoginRes)}`;

    // Create test client & test civil case
    const now = new Date();
    const client = await db.insertClient({
      id: 'client-hearing-test',
      firmId,
      name: 'Hearing Test Client',
      phone: '01711000999',
      address: 'Dhaka',
      archived: false,
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    });

    const civilCase = await db.insertCase({
      id: 'case-civil-hearings-1',
      firmId,
      clientId: client.id,
      fileSerial: 'F-2026-0901',
      caseNumber: 'Suit 501/2026',
      court: 'Joint District Judge Court 1, Dhaka',
      matterType: 'Money Suit',
      caseCategory: 'civil',
      status: 'ongoing',
      plaintiff: 'Hearing Test Client',
      defendant: 'Opposite Party Ltd',
      ourRole: 'Plaintiff',
      restricted: false,
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
      nextHearingAt: null,
    } as any);

    const criminalCase = await db.insertCase({
      id: 'case-criminal-hearings-1',
      firmId,
      clientId: client.id,
      fileSerial: 'F-2026-0902',
      caseNumber: 'GR 99/2026',
      court: 'Chief Metropolitan Magistrate Court, Dhaka',
      matterType: 'GR Case',
      caseCategory: 'criminal_gr',
      status: 'ongoing',
      plaintiff: 'State',
      defendant: 'Hearing Test Accused',
      ourRole: 'Defence counsel',
      restricted: false,
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
      nextHearingAt: null,
    } as any);

    // --- 1. Fixed For Validation on Creation ---
    console.log('\n--- 1. Fixed For Validation & Controlled Lists ---');

    // Missing fixed_for rejected
    const missingFixedForRes = await fetch(`${baseUrl}/api/v1/hearings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: ownerCookie },
      body: JSON.stringify({
        caseId: civilCase.id,
        scheduledAt: '2026-11-15T09:30:00Z',
        purpose: 'First appearance',
      }),
    });
    assert(missingFixedForRes.status === 400, 'POST /hearings rejects missing fixedFor (HTTP 400)');

    // Invalid fixed_for for civil category rejected
    const invalidCivilFixedForRes = await fetch(`${baseUrl}/api/v1/hearings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: ownerCookie },
      body: JSON.stringify({
        caseId: civilCase.id,
        scheduledAt: '2026-11-15T09:30:00Z',
        purpose: 'Bail prayer',
        fixedFor: 'bail_hearing', // bail_hearing belongs to criminal, not civil!
      }),
    });
    assert(invalidCivilFixedForRes.status === 400, 'POST /hearings rejects invalid fixedFor key for Civil category');

    // Criminal accepts bail_hearing
    const validCrimRes = await fetch(`${baseUrl}/api/v1/hearings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: ownerCookie },
      body: JSON.stringify({
        caseId: criminalCase.id,
        scheduledAt: '2026-11-20T10:00:00Z',
        purpose: 'Bail petition',
        fixedFor: 'bail_hearing',
        fixedForNote: 'Ad-interim bail prayer',
      }),
    });
    assert(validCrimRes.status === 201, 'POST /hearings accepts valid criminal fixedFor (bail_hearing)');
    const crimHearing = await validCrimRes.json();
    assert(crimHearing.fixedFor === 'bail_hearing', 'Criminal hearing stored fixedFor correctly');
    assert(crimHearing.fixedForNote === 'Ad-interim bail prayer', 'Criminal hearing stored fixedForNote correctly');

    // Civil accepts first_hearing
    const validCivilRes = await fetch(`${baseUrl}/api/v1/hearings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: ownerCookie },
      body: JSON.stringify({
        caseId: civilCase.id,
        scheduledAt: '2026-11-10T09:30:00Z',
        purpose: 'Initial hearing',
        fixedFor: 'first_hearing',
      }),
    });
    assert(validCivilRes.status === 201, 'POST /hearings creates civil hearing with valid fixedFor (first_hearing)');
    const civilHearing = await validCivilRes.json();
    assert(civilHearing.fixedFor === 'first_hearing', 'Civil hearing stored fixedFor');

    // Verify case nextHearingAt was synchronized
    const updatedCivilCase = await db.getCaseById(civilCase.id, firmId);
    assert(
      updatedCivilCase?.nextHearingAt !== null &&
        new Date(updatedCivilCase!.nextHearingAt!).toISOString() === new Date('2026-11-10T09:30:00Z').toISOString(),
      'Case next_hearing_at synchronized with earliest scheduled hearing'
    );

    // --- 2. Rescheduling & Hearing Date History ---
    console.log('\n--- 2. Rescheduling & Hearing Date History ---');

    // Reschedule with invalid fixed_for rejected
    const invalidReschedule = await fetch(`${baseUrl}/api/v1/hearings/${civilHearing.id}/reschedule`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: ownerCookie },
      body: JSON.stringify({
        scheduledAt: '2026-11-25T09:30:00Z',
        reason: 'Judge on leave',
        fixedFor: 'invalid_step',
      }),
    });
    assert(invalidReschedule.status === 400, 'POST /hearings/:id/reschedule rejects invalid fixedFor (HTTP 400)');

    // Reschedule with valid new date and new fixed_for
    const validReschedule = await fetch(`${baseUrl}/api/v1/hearings/${civilHearing.id}/reschedule`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: ownerCookie },
      body: JSON.stringify({
        scheduledAt: '2026-11-25T09:30:00Z',
        reason: 'Presiding Judge was attending training',
        fixedFor: 'written_statement',
        fixedForNote: 'Time petition for W.S.',
      }),
    });
    assert(validReschedule.status === 200, 'POST /hearings/:id/reschedule succeeds (HTTP 200)');
    const rescheduleData = await validReschedule.json();
    assert(rescheduleData.hearing.fixedFor === 'written_statement', 'Rescheduled hearing updated fixedFor to written_statement');
    assert(rescheduleData.history.oldFixedFor === 'first_hearing', 'History captured old_fixed_for as first_hearing');
    assert(rescheduleData.history.newFixedFor === 'written_statement', 'History captured new_fixed_for as written_statement');
    assert(rescheduleData.history.reason === 'Presiding Judge was attending training', 'History captured reason');

    // Check GET /hearings/:id/history endpoint
    const historyRes = await fetch(`${baseUrl}/api/v1/hearings/${civilHearing.id}/history`, {
      headers: { Cookie: ownerCookie },
    });
    assert(historyRes.status === 200, 'GET /hearings/:id/history returns HTTP 200');
    const historyList = await historyRes.json();
    assert(Array.isArray(historyList) && historyList.length === 1, 'History list contains 1 entry');
    assert(historyList[0].newFixedFor === 'written_statement', 'History item contains newFixedFor');

    // --- 3. Adjournment & Next Hearing Creation ---
    console.log('\n--- 3. Adjournment & Next Hearing Carry-Over ---');

    // Adjourn hearing: requires nextDate, nextFixedFor, reason
    const adjournRes = await fetch(`${baseUrl}/api/v1/hearings/${civilHearing.id}/adjourn`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: ownerCookie },
      body: JSON.stringify({
        nextDate: '2026-12-15T09:30:00Z',
        reason: 'Defendant prayed for time to file written statement',
        nextFixedFor: 'written_statement',
        nextFixedForNote: 'Final time for W.S.',
        outcomeNote: 'Time granted on payment of cost',
      }),
    });
    assert(adjournRes.status === 200, 'POST /hearings/:id/adjourn succeeds (HTTP 200)');
    const adjournData = await adjournRes.json();

    assert(adjournData.adjournedHearing.status === 'adjourned', 'Old hearing marked as adjourned');
    assert(adjournData.adjournedHearing.fixedFor === 'written_statement', 'Old hearing preserved its original fixedFor');
    assert(adjournData.nextHearing.status === 'scheduled', 'Next hearing created with status scheduled');
    assert(adjournData.nextHearing.fixedFor === 'written_statement', 'Next hearing received nextFixedFor');
    assert(adjournData.history.oldFixedFor === 'written_statement', 'Adjournment history stored oldFixedFor');
    assert(adjournData.history.newFixedFor === 'written_statement', 'Adjournment history stored newFixedFor');

    // Case nextHearingAt updated to the adjourned nextDate
    const caseAfterAdjourn = await db.getCaseById(civilCase.id, firmId);
    assert(
      new Date(caseAfterAdjourn!.nextHearingAt!).toISOString() === new Date('2026-12-15T09:30:00Z').toISOString(),
      'Case next_hearing_at updated to next hearing date after adjournment'
    );

    // --- 4. Filtering & Cause List Querying ---
    console.log('\n--- 4. List Filtering by fixed_for ---');

    // Filter by fixedFor=written_statement
    const wsFilterRes = await fetch(`${baseUrl}/api/v1/hearings?fixedFor=written_statement`, {
      headers: { Cookie: ownerCookie },
    });
    const wsHearings = await wsFilterRes.json();
    assert(wsHearings.length >= 1, 'Filter by fixedFor returns matching hearings');
    assert(wsHearings.every((h: any) => h.fixedFor === 'written_statement'), 'All filtered hearings have fixedFor=written_statement');

    // Filter by fixedFor=bail_hearing
    const bailFilterRes = await fetch(`${baseUrl}/api/v1/hearings?fixedFor=bail_hearing`, {
      headers: { Cookie: ownerCookie },
    });
    const bailHearings = await bailFilterRes.json();
    assert(bailHearings.length >= 1, 'Filter by fixedFor=bail_hearing returns criminal hearing');
    assert(bailHearings[0].caseId === criminalCase.id, 'Matching bail hearing belongs to criminal case');

    // --- 5. Permissions, Central Visibility & Firm Isolation ---
    console.log('\n--- 5. Permissions, Central Visibility & Firm Isolation ---');

    // Staff lacking hearings.update cannot create hearing (HTTP 403)
    const staffCreateRes = await fetch(`${baseUrl}/api/v1/hearings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: staffCookie },
      body: JSON.stringify({
        caseId: civilCase.id,
        scheduledAt: '2026-11-30T09:30:00Z',
        purpose: 'Test unauthorized',
        fixedFor: 'hearing',
      }),
    });
    assert(staffCreateRes.status === 403, 'Staff without hearings.update cannot create hearing (HTTP 403)');

    // Create Firm 2 and test cross-tenant isolation
    const firm2Case = await db.insertCase({
      id: 'case-firm2-hearing-1',
      firmId: 'firm-2',
      clientId: 'client-firm2',
      fileSerial: 'F-2026-8801',
      caseNumber: 'Firm 2 Case',
      court: 'Dhaka Court',
      matterType: 'Other',
      caseCategory: 'other',
      status: 'ongoing',
      restricted: false,
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
      nextHearingAt: null,
    } as any);

    const firm2Hearing = await db.insertHearing({
      id: 'hearing-firm2-1',
      firmId: 'firm-2',
      caseId: firm2Case.id,
      scheduledAt: new Date('2026-11-20T10:00:00Z'),
      purpose: 'Firm 2 hearing',
      status: 'scheduled',
      fixedFor: 'hearing',
    });

    // Firm 1 owner querying Firm 2 hearing directly gets 404
    const crossTenantGet = await fetch(`${baseUrl}/api/v1/hearings/${firm2Hearing.id}`, {
      headers: { Cookie: ownerCookie },
    });
    assert(crossTenantGet.status === 404, 'Firm 1 cannot access Firm 2 hearing by ID (HTTP 404)');

    // Firm 1 owner querying hearings list cannot see Firm 2 hearing
    const firm1HearingsList = await (await fetch(`${baseUrl}/api/v1/hearings`, { headers: { Cookie: ownerCookie } })).json();
    assert(!firm1HearingsList.some((h: any) => h.id === firm2Hearing.id), 'Firm 1 hearings list never exposes Firm 2 hearings');

    // --- 6. Subscription Read-Only Enforcement ---
    console.log('\n--- 6. Subscription Read-Only Enforcement ---');

    // Simulate expired firm subscription
    await db.updateFirm(firmId, {
      licenseExpiresAt: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000), // expired 30 days ago
    });

    // Write should be blocked with 403 SUBSCRIPTION_READ_ONLY
    const expiredWriteRes = await fetch(`${baseUrl}/api/v1/hearings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: ownerCookie },
      body: JSON.stringify({
        caseId: civilCase.id,
        scheduledAt: '2026-12-20T09:30:00Z',
        purpose: 'Blocked write',
        fixedFor: 'hearing',
      }),
    });
    assert(expiredWriteRes.status === 403, 'POST /hearings blocked when subscription is expired (HTTP 403)');
    const expiredWriteJson = await expiredWriteRes.json();
    assert(expiredWriteJson.code === 'SUBSCRIPTION_READ_ONLY', 'Expired write returns SUBSCRIPTION_READ_ONLY code');

    // Read should still succeed
    const expiredReadRes = await fetch(`${baseUrl}/api/v1/hearings`, {
      headers: { Cookie: ownerCookie },
    });
    assert(expiredReadRes.status === 200, 'GET /hearings succeeds even when subscription is expired (HTTP 200)');

    // Restore firm subscription
    await db.updateFirm(firmId, {
      licenseExpiresAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
    });

    // --- 7. Audit Trail ---
    console.log('\n--- 7. Audit Trail for Hearings ---');
    const auditLogs = await db.listAudit(firmId, 50, 0);
    const hearingAudits = auditLogs.filter((a) => a.entity === 'Hearing');
    assert(hearingAudits.length >= 3, 'Audit log recorded multiple Hearing operations');
    assert(hearingAudits.some((a) => a.action === 'CREATE'), 'Audit log contains CREATE action for Hearing');
    assert(hearingAudits.some((a) => a.action === 'HEARING_DATE_CHANGE'), 'Audit log contains HEARING_DATE_CHANGE action');

  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }

  console.log('\n========================================');
  console.log(`HEARINGS BACKEND TEST RESULTS: ${passed} PASSED, ${failed} FAILED`);
  console.log('========================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runTests().catch((err) => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
