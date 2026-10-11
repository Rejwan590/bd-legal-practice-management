process.env.JWT_SECRET = 'test_jwt_secret_key_at_least_32_chars_long_1234567890';
process.env.ADMIN_JWT_SECRET = 'test_admin_jwt_secret_key_at_least_32_chars_9876543210';

import fs from 'fs';
import path from 'path';
import http from 'http';
import { fileURLToPath } from 'url';
import { createApp } from '../src/app.js';
import { getDatabase } from '../src/db/client.js';
import { SEED_PASSWORDS } from '../src/db/seed.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

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
  console.log('--- STARTING BACKEND TEAM HIERARCHY & VISIBILITY TEST SUITE ---');
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
    // Authenticate Firm A Owner and seed Firm B Owner
    const ownerARes = await fetch(`${baseUrl}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'owner@firm.bd', password: SEED_PASSWORDS.owner }),
    });
    const ownerAToken = extractToken(ownerARes);

    const firmBId = 'firm-bd-002';
    await db.insertFirm({
      id: firmBId,
      firmId: firmBId,
      name: 'Chattogram Commercial Chambers',
      barCouncilReg: 'BC-CTG-2015-1102',
      officeAddress: 'Agrabad C/A, Chattogram',
      courtAffiliations: 'Chattogram District Court',
      planId: 'annual-standard',
      visibilityMode: 'team',
      licenseExpiresAt: new Date('2028-01-01'),
      status: 'active',
      createdAt: new Date(),
      updatedAt: new Date(),
      deletedAt: null,
      createdBy: 'user-owner-002',
      updatedBy: 'user-owner-002',
    });
    await db.insertUser({
      id: 'user-owner-002',
      firmId: firmBId,
      name: 'Barrister Kamal Hossain Jr.',
      email: 'owner@otherfirm.bd',
      passwordHash: 'not_used_directly',
      role: 'Owner',
      jobType: 'lawyer_senior',
      jobTitleLabel: null,
      reportsToUserId: null,
      permissions: ['cases.view'],
      language: 'en',
      active: true,
      mustChangePassword: false,
      failedLoginAttempts: 0,
      lockedUntil: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      deletedAt: null,
      createdBy: 'user-owner-002',
      updatedBy: 'user-owner-002',
    });

    // --- 1. Route Scanner Test: Ensure no chamber route skips the central visibility rule ---
    console.log('\n--- 1. Route Scanner for Central Visibility Rule ---');
    {
      const routesDir = path.resolve(__dirname, '../src/routes');
      const routeFiles = fs
        .readdirSync(routesDir)
        .filter((f) => f.endsWith('.ts') && !f.startsWith('admin'));

      let skippedVisibilityCalls: string[] = [];

      for (const file of routeFiles) {
        const content = fs.readFileSync(path.join(routesDir, file), 'utf-8');

        // Check db.getCaseById(id, firmId, userCtx) -> must have 3 arguments
        const getCaseMatches = [...content.matchAll(/db\.getCaseById\(([^)]+)\)/g)];
        for (const m of getCaseMatches) {
          const args = m[1].split(',');
          if (args.length < 3) {
            skippedVisibilityCalls.push(`${file}: db.getCaseById(${m[1]}) missing user context`);
          }
        }

        // Check db.listCases(firmId, filter) -> filter must include user
        const listCasesMatches = [...content.matchAll(/db\.listCases\(([\s\S]*?)\);/g)];
        for (const m of listCasesMatches) {
          if (!m[1].includes('user:') && !m[1].includes('req.user')) {
            skippedVisibilityCalls.push(`${file}: db.listCases missing user context`);
          }
        }

        // Check db.checkDuplicateCase -> must pass req.user (6 arguments)
        const dupMatches = [...content.matchAll(/db\.checkDuplicateCase\(([\s\S]*?)\);/g)];
        for (const m of dupMatches) {
          if (!m[1].includes('req.user')) {
            skippedVisibilityCalls.push(`${file}: db.checkDuplicateCase missing req.user`);
          }
        }

        // Check db.getClientLinkedOverview -> must pass req.user (4 arguments)
        const linkedMatches = [...content.matchAll(/db\.getClientLinkedOverview\(([\s\S]*?)\);/g)];
        for (const m of linkedMatches) {
          if (!m[1].includes('req.user')) {
            skippedVisibilityCalls.push(`${file}: db.getClientLinkedOverview missing req.user`);
          }
        }

        // Check db.listAudit -> must pass req.user
        const auditMatches = [...content.matchAll(/db\.listAudit\(([\s\S]*?)\);/g)];
        for (const m of auditMatches) {
          if (!m[1].includes('req.user') && !m[1].includes('user:')) {
            skippedVisibilityCalls.push(`${file}: db.listAudit missing req.user`);
          }
        }
      }

      assert(
        skippedVisibilityCalls.length === 0,
        'Route scanner: every case-derived query in chamber routes applies central visibility rule',
        skippedVisibilityCalls.join('; ')
      );
    }

    // --- 2. Create Lawyer A, Lawyer B, and Clerk under Lawyer A ---
    console.log('\n--- 2. User Creation, Presets & Team Hierarchy ---');
    const createLawyerARes = await fetch(`${baseUrl}/api/v1/users`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: `access_token=${ownerAToken}`,
      },
      body: JSON.stringify({
        name: 'Adv. Kamal (Lawyer A)',
        email: 'lawyer.a@firm.bd',
        preset: 'seniorLawyer',
        reportsToUserId: 'user-owner-001',
        temporaryPassword: 'LawyerAPass#2026',
      }),
    });
    const lawyerA = (await createLawyerARes.json()) as any;
    assert(
      createLawyerARes.status === 201 &&
        lawyerA.jobType === 'lawyer_senior' &&
        lawyerA.mustChangePassword === true,
      'Created Lawyer A with seniorLawyer preset and mustChangePassword=true'
    );

    const createLawyerBRes = await fetch(`${baseUrl}/api/v1/users`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: `access_token=${ownerAToken}`,
      },
      body: JSON.stringify({
        name: 'Adv. Farhana (Lawyer B)',
        email: 'lawyer.b@firm.bd',
        preset: 'seniorLawyer',
        reportsToUserId: 'user-owner-001',
        temporaryPassword: 'LawyerBPass#2026',
      }),
    });
    const lawyerB = (await createLawyerBRes.json()) as any;
    assert(
      createLawyerBRes.status === 201 && lawyerB.jobType === 'lawyer_senior',
      'Created Lawyer B with seniorLawyer preset'
    );

    const createClerkRes = await fetch(`${baseUrl}/api/v1/users`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: `access_token=${ownerAToken}`,
      },
      body: JSON.stringify({
        name: 'Clerk Rahim (Under Lawyer A)',
        email: 'clerk.a@firm.bd',
        preset: 'clerk',
        reportsToUserId: lawyerA.id,
        temporaryPassword: 'ClerkAPass#2026',
      }),
    });
    const clerkA = (await createClerkRes.json()) as any;
    assert(
      createClerkRes.status === 201 &&
        clerkA.jobType === 'clerk' &&
        clerkA.reportsToUserId === lawyerA.id,
      'Created Clerk under Lawyer A with clerk preset'
    );

    // Grant clerkA settings.manage temporarily so we can also test GET /api/v1/audit visibility filtering
    await fetch(`${baseUrl}/api/v1/users/${clerkA.id}/permissions`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Cookie: `access_token=${ownerAToken}`,
      },
      body: JSON.stringify({
        permissions: [...clerkA.permissions, 'settings.manage'],
      }),
    });

    // Log in as Clerk A and Lawyer A
    const clerkLoginRes = await fetch(`${baseUrl}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'clerk.a@firm.bd', password: 'ClerkAPass#2026' }),
    });
    const clerkToken = extractToken(clerkLoginRes);

    const lawyerALoginRes = await fetch(`${baseUrl}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'lawyer.a@firm.bd', password: 'LawyerAPass#2026' }),
    });
    const lawyerAToken = extractToken(lawyerALoginRes);

    // --- 3. Team Visibility Mode Enforcement ---
    console.log('\n--- 3. Central Visibility Rule in Team Mode ---');
    // Switch Firm A to 'team' mode
    const modeRes = await fetch(`${baseUrl}/api/v1/firms/current`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Cookie: `access_token=${ownerAToken}`,
      },
      body: JSON.stringify({ visibilityMode: 'team' }),
    });
    assert(modeRes.status === 200, "Switched Firm A visibilityMode to 'team'");

    // Create Case A (responsible: Lawyer A) and Case B (responsible: Lawyer B)
    const caseARes = await fetch(`${baseUrl}/api/v1/cases`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: `access_token=${ownerAToken}`,
      },
      body: JSON.stringify({
        clientId: 'client-001',
        responsibleLawyerId: lawyerA.id,
        fileSerial: 'F-TEAM-101',
        caseNumber: 'LawyerA Writ 101/2026',
        court: 'High Court Division',
        matterType: 'Writ Petition',
      }),
    });
    const caseA = (await caseARes.json()) as any;

    const caseBRes = await fetch(`${baseUrl}/api/v1/cases`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: `access_token=${ownerAToken}`,
      },
      body: JSON.stringify({
        clientId: 'client-001',
        responsibleLawyerId: lawyerB.id,
        fileSerial: 'F-TEAM-202',
        caseNumber: 'LawyerB Suit 202/2026',
        court: 'High Court Division',
        matterType: 'Civil Revision',
      }),
    });
    const caseB = (await caseBRes.json()) as any;

    // Clerk A lists cases
    const clerkListRes = await fetch(`${baseUrl}/api/v1/cases`, {
      headers: { Cookie: `access_token=${clerkToken}` },
    });
    const clerkCases = (await clerkListRes.json()) as any[];
    assert(
      clerkCases.some((c) => c.id === caseA.id) && !clerkCases.some((c) => c.id === caseB.id),
      "Clerk under Lawyer A sees Lawyer A's case and cannot see Lawyer B's case in list"
    );

    // Clerk A searches for Lawyer B's case
    const clerkSearchRes = await fetch(
      `${baseUrl}/api/v1/cases?search=${encodeURIComponent('LawyerB Suit 202')}`,
      { headers: { Cookie: `access_token=${clerkToken}` } }
    );
    const clerkSearchCases = (await clerkSearchRes.json()) as any[];
    assert(
      clerkSearchCases.length === 0,
      "Clerk under Lawyer A cannot find Lawyer B's case via search"
    );

    // Clerk A direct ID lookup on Case B -> 404
    const clerkDirectBRes = await fetch(`${baseUrl}/api/v1/cases/${caseB.id}`, {
      headers: { Cookie: `access_token=${clerkToken}` },
    });
    assert(
      clerkDirectBRes.status === 404,
      "Clerk under Lawyer A gets 404 on direct GET /api/v1/cases/:id for Lawyer B's case"
    );

    // Clerk A counts lookup on Case B -> 404
    const clerkCountsBRes = await fetch(`${baseUrl}/api/v1/cases/${caseB.id}/counts`, {
      headers: { Cookie: `access_token=${clerkToken}` },
    });
    assert(
      clerkCountsBRes.status === 404,
      "Clerk under Lawyer A gets 404 on GET /api/v1/cases/:id/counts for Lawyer B's case"
    );

    // Clerk A check-duplicate on Case B -> false
    const clerkDupBRes = await fetch(
      `${baseUrl}/api/v1/cases/check-duplicate?caseNumber=${encodeURIComponent(
        caseB.caseNumber
      )}&court=${encodeURIComponent(caseB.court)}`,
      { headers: { Cookie: `access_token=${clerkToken}` } }
    );
    const clerkDupBData = (await clerkDupBRes.json()) as any;
    assert(
      clerkDupBData.isDuplicate === false,
      "Clerk under Lawyer A cannot probe Lawyer B's case via check-duplicate"
    );

    // Clerk A client linked-overview omits Case B
    const clerkOverviewRes = await fetch(`${baseUrl}/api/v1/clients/client-001/overview`, {
      headers: { Cookie: `access_token=${clerkToken}` },
    });
    const clerkOverview = (await clerkOverviewRes.json()) as any;
    assert(
      clerkOverview.cases.some((c: any) => c.id === caseA.id) &&
        !clerkOverview.cases.some((c: any) => c.id === caseB.id),
      "Clerk under Lawyer A sees Case A and not Case B in client linked-overview"
    );

    // Clerk A audit log omits Case B
    const clerkAuditRes = await fetch(`${baseUrl}/api/v1/audit-log`, {
      headers: { Cookie: `access_token=${clerkToken}` },
    });
    const clerkAudit = (await clerkAuditRes.json()) as any[];
    assert(
      !clerkAudit.some((a) => a.entityId === caseB.id),
      "Clerk under Lawyer A cannot see audit entries for Lawyer B's case"
    );

    // --- 4. Case Sharing & Unsharing ---
    console.log('\n--- 4. Case Sharing & Revocation ---');
    const shareRes = await fetch(`${baseUrl}/api/v1/cases/${caseB.id}/shares`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: `access_token=${ownerAToken}`,
      },
      body: JSON.stringify({ userId: clerkA.id }),
    });
    const shareObj = (await shareRes.json()) as any;
    assert(shareRes.status === 201, 'Shared Case B with Clerk A');

    const clerkAfterShareRes = await fetch(`${baseUrl}/api/v1/cases/${caseB.id}`, {
      headers: { Cookie: `access_token=${clerkToken}` },
    });
    assert(clerkAfterShareRes.status === 200, 'Clerk A can view Case B after sharing');

    const unshareRes = await fetch(`${baseUrl}/api/v1/cases/${caseB.id}/shares/${shareObj.id}`, {
      method: 'DELETE',
      headers: { Cookie: `access_token=${ownerAToken}` },
    });
    assert(unshareRes.status === 200, 'Removed Case B share from Clerk A');

    const clerkAfterUnshareRes = await fetch(`${baseUrl}/api/v1/cases/${caseB.id}`, {
      headers: { Cookie: `access_token=${clerkToken}` },
    });
    assert(
      clerkAfterUnshareRes.status === 404,
      'Clerk A gets 404 on Case B immediately after un-sharing'
    );

    // --- 5. Open Mode vs Team Mode Switching ---
    console.log('\n--- 5. Open Mode Shows All & Mode Switching Never Loses Data ---');
    await fetch(`${baseUrl}/api/v1/firms/current`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Cookie: `access_token=${ownerAToken}`,
      },
      body: JSON.stringify({ visibilityMode: 'open' }),
    });

    const clerkOpenListRes = await fetch(`${baseUrl}/api/v1/cases`, {
      headers: { Cookie: `access_token=${clerkToken}` },
    });
    const clerkOpenCases = (await clerkOpenListRes.json()) as any[];
    assert(
      clerkOpenCases.some((c) => c.id === caseA.id) &&
        clerkOpenCases.some((c) => c.id === caseB.id),
      "'open' mode allows Clerk A to see all non-restricted chamber cases"
    );

    // Switch back to 'team' mode
    await fetch(`${baseUrl}/api/v1/firms/current`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Cookie: `access_token=${ownerAToken}`,
      },
      body: JSON.stringify({ visibilityMode: 'team' }),
    });

    // --- 6. Restricted Case Enforcement on Responsible Lawyer without restricted.view ---
    console.log('\n--- 6. Restricted Cases Require restricted.view ---');
    // Remove restricted.view from Lawyer A
    await fetch(`${baseUrl}/api/v1/users/${lawyerA.id}/permissions`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Cookie: `access_token=${ownerAToken}`,
      },
      body: JSON.stringify({
        permissions: ['cases.view', 'cases.create', 'cases.edit'],
      }),
    });

    // Owner creates a restricted case with responsibleLawyerId = Lawyer A
    const restCaseRes = await fetch(`${baseUrl}/api/v1/cases`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: `access_token=${ownerAToken}`,
      },
      body: JSON.stringify({
        clientId: 'client-001',
        responsibleLawyerId: lawyerA.id,
        fileSerial: 'F-REST-999',
        caseNumber: 'Confidential Suit 999/2026',
        court: 'High Court Division',
        matterType: 'Company Matter',
        restricted: true,
      }),
    });
    const restCase = (await restCaseRes.json()) as any;

    const lawyerAGetRestRes = await fetch(`${baseUrl}/api/v1/cases/${restCase.id}`, {
      headers: { Cookie: `access_token=${lawyerAToken}` },
    });
    assert(
      lawyerAGetRestRes.status === 404,
      'restricted.view still hides restricted case from responsible lawyer who lacks restricted.view'
    );

    // --- 7. User Management Invariants & Security Boundaries ---
    console.log('\n--- 7. User Management Guards & Security ---');
    // Last Owner cannot be demoted
    const demoteOwnerRes = await fetch(`${baseUrl}/api/v1/users/user-owner-001/role`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Cookie: `access_token=${ownerAToken}`,
      },
      body: JSON.stringify({ role: 'Staff' }),
    });
    assert(demoteOwnerRes.status === 400, 'Last active Owner cannot be demoted');

    // Last Owner cannot be deactivated
    const deactOwnerRes = await fetch(`${baseUrl}/api/v1/users/user-owner-001/deactivate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: `access_token=${ownerAToken}`,
      },
      body: JSON.stringify({}),
    });
    assert(deactOwnerRes.status === 400, 'Last active Owner cannot be deactivated');

    // Nobody changes their own permissions
    const selfPermRes = await fetch(`${baseUrl}/api/v1/users/user-owner-001/permissions`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Cookie: `access_token=${ownerAToken}`,
      },
      body: JSON.stringify({ permissions: ['cases.view'] }),
    });
    assert(selfPermRes.status === 400, 'User cannot modify their own permissions');

    // Unknown permission keys rejected
    const unknownPermRes = await fetch(`${baseUrl}/api/v1/users/${clerkA.id}/permissions`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Cookie: `access_token=${ownerAToken}`,
      },
      body: JSON.stringify({ permissions: ['cases.view', 'invalid.permission.key'] }),
    });
    assert(unknownPermRes.status === 400, 'Unknown permission keys rejected with HTTP 400');

    // reports_to rejects cycles
    await fetch(`${baseUrl}/api/v1/users/${lawyerA.id}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Cookie: `access_token=${ownerAToken}`,
      },
      body: JSON.stringify({ reportsToUserId: lawyerB.id }),
    });
    const cycleRes = await fetch(`${baseUrl}/api/v1/users/${lawyerB.id}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Cookie: `access_token=${ownerAToken}`,
      },
      body: JSON.stringify({ reportsToUserId: lawyerA.id }),
    });
    assert(cycleRes.status === 400, 'reportsToUserId rejects reporting cycles');

    // reports_to rejects other firm's users
    const crossFirmSupRes = await fetch(`${baseUrl}/api/v1/users/${lawyerA.id}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Cookie: `access_token=${ownerAToken}`,
      },
      body: JSON.stringify({ reportsToUserId: 'user-owner-002' }),
    });
    assert(crossFirmSupRes.status === 400, "reportsToUserId rejects other firm's users");

    // Firm A cannot touch Firm B's users
    const touchFirmBRes = await fetch(`${baseUrl}/api/v1/users/user-owner-002`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Cookie: `access_token=${ownerAToken}`,
      },
      body: JSON.stringify({ name: 'Hacked Name' }),
    });
    assert(touchFirmBRes.status === 404, "Firm A cannot touch Firm B's users (404)");

    // Deactivated user cannot log in and active session is terminated
    const deactClerkRes = await fetch(`${baseUrl}/api/v1/users/${clerkA.id}/deactivate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: `access_token=${ownerAToken}`,
      },
      body: JSON.stringify({}),
    });
    assert(deactClerkRes.status === 200, 'Deactivated Clerk A');

    const deactLoginRes = await fetch(`${baseUrl}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'clerk.a@firm.bd', password: 'ClerkAPass#2026' }),
    });
    assert(
      deactLoginRes.status === 401 || deactLoginRes.status === 403,
      'Deactivated user cannot log in (401/403)'
    );

    const deactSessionRes = await fetch(`${baseUrl}/api/v1/cases`, {
      headers: { Cookie: `access_token=${clerkToken}` },
    });
    assert(
      deactSessionRes.status === 401 || deactSessionRes.status === 403,
      'Deactivated user active session is immediately terminated on next request'
    );

    // Seat limit enforced
    await db.updateFirm('firm-bd-001', { seatLimit: 2 } as any);
    const overSeatRes = await fetch(`${baseUrl}/api/v1/users`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: `access_token=${ownerAToken}`,
      },
      body: JSON.stringify({
        name: 'Seat Limit Exceeded User',
        email: 'exceeded@firm.bd',
        preset: 'clerk',
      }),
    });
    assert(overSeatRes.status === 403, 'Seat limit enforced on POST /api/v1/users (403)');

    // Restore Firm A defaults
    await db.updateFirm('firm-bd-001', { seatLimit: 15, visibilityMode: 'open' } as any);
  } finally {
    server.close();
  }

  console.log(`\n--- TEAM VISIBILITY TESTS COMPLETE: ${passed} passed, ${failed} failed ---`);
  if (failed > 0) {
    process.exit(1);
  }
}

runTests().catch((err) => {
  console.error('Unhandled error in teamVisibility.test.ts:', err);
  process.exit(1);
});
