process.env.JWT_SECRET = 'test_jwt_secret_key_at_least_32_chars_long_1234567890';
process.env.ADMIN_JWT_SECRET = 'test_admin_jwt_secret_key_at_least_32_chars_9876543210';

import http from 'http';
import { createApp } from '../src/app.js';
import { getDatabase } from '../src/db/client.js';
import { SEED_PASSWORDS, ALL_PERMISSIONS } from '../src/db/seed.js';
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
  console.log('--- STARTING BACKEND STEP 3.2 CASES TEST SUITE ---');
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
    // Authenticate Owner and Staff
    const ownerRes = await fetch(`${baseUrl}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'owner@firm.bd', password: SEED_PASSWORDS.owner }),
    });
    const ownerToken = extractToken(ownerRes);

    const staffRes = await fetch(`${baseUrl}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'staff@firm.bd', password: SEED_PASSWORDS.staff }),
    });
    const staffToken = extractToken(staffRes);

    // --- 1. Case requires a client; client profile lists the case ---
    console.log('\n--- 1. Client Requirement & Cross-Module Linkage ---');
    {
      // Missing clientId
      const missingClientRes = await fetch(`${baseUrl}/api/v1/cases`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Cookie: `access_token=${ownerToken}`,
        },
        body: JSON.stringify({
          caseNumber: 'Artha Rin Suit 101/2024',
          court: 'Artha Rin Adalat-1, Dhaka',
          matterType: 'Commercial Banking / Loan Recovery',
        }),
      });
      assert(
        missingClientRes.status === 400,
        'Case creation without clientId rejected with HTTP 400'
      );

      // Nonexistent clientId
      const invalidClientRes = await fetch(`${baseUrl}/api/v1/cases`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Cookie: `access_token=${ownerToken}`,
        },
        body: JSON.stringify({
          clientId: 'client-nonexistent-999',
          caseNumber: 'Artha Rin Suit 101/2024',
          court: 'Artha Rin Adalat-1, Dhaka',
          matterType: 'Commercial Banking / Loan Recovery',
        }),
      });
      assert(
        invalidClientRes.status === 400,
        'Case creation with nonexistent clientId rejected with HTTP 400'
      );

      // Valid case creation for client-001
      const createRes = await fetch(`${baseUrl}/api/v1/cases`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Cookie: `access_token=${ownerToken}`,
        },
        body: JSON.stringify({
          clientId: 'client-001',
          fileSerial: 'F-2024-0012',
          caseNumber: 'Money Suit No. 88/2024',
          court: '3rd Joint District Judge Court, Dhaka',
          matterType: 'Commercial Recovery',
          description: 'Recovery of defaulted trade finance under contract.',
          plaintiff: 'Haji Mohammad Rafiqul Islam',
          defendant: 'Bengal Traders Ltd.',
          ourRole: 'Plaintiff',
          status: 'ongoing',
          restricted: false,
        }),
      });
      const createdCase = await createRes.json();
      assert(createRes.status === 201, 'Valid case registered successfully (HTTP 201)');
      assert(Boolean(createdCase.id), 'Case assigned a valid UUID');
      assert(createdCase.clientId === 'client-001', 'Case linked to client-001');

      // Client profile overview lists the case
      const overviewRes = await fetch(`${baseUrl}/api/v1/clients/client-001/overview`, {
        headers: { Cookie: `access_token=${ownerToken}` },
      });
      const overview = await overviewRes.json();
      assert(overviewRes.status === 200, 'Client overview returns HTTP 200');
      const hasCase = (overview.cases || []).some(
        (c: any) => c.caseNumber === 'Money Suit No. 88/2024'
      );
      assert(hasCase, 'Client overview lists the newly created case');
    }

    // --- 2. Restricted case is invisible to staff without restricted.view ---
    console.log('\n--- 2. Restricted Case Confidentiality ---');
    {
      // Seed data contains case-002 which is restricted
      // Staff listing cases: should NOT see case-002
      const staffListRes = await fetch(`${baseUrl}/api/v1/cases`, {
        headers: { Cookie: `access_token=${staffToken}` },
      });
      const staffCases = await staffListRes.json();
      assert(staffListRes.status === 200, 'Staff can list non-restricted cases (HTTP 200)');
      const staffSeesRestricted = staffCases.some((c: any) => c.id === 'case-002' || c.restricted);
      assert(
        !staffSeesRestricted,
        'Restricted case is completely omitted from staff case list'
      );

      // Staff querying restricted case by ID directly: returns 404 (invisible)
      const staffDirectRes = await fetch(`${baseUrl}/api/v1/cases/case-002`, {
        headers: { Cookie: `access_token=${staffToken}` },
      });
      assert(
        staffDirectRes.status === 404,
        'Direct API query for restricted case returns 404 Not Found to unauthorized staff'
      );

      // Staff querying restricted case counts: returns 404
      const staffCountsRes = await fetch(`${baseUrl}/api/v1/cases/case-002/counts`, {
        headers: { Cookie: `access_token=${staffToken}` },
      });
      assert(
        staffCountsRes.status === 404,
        'Restricted case counts endpoint returns 404 Not Found to unauthorized staff'
      );

      // Staff querying client overview for client-002: restricted case is omitted
      const staffOverviewRes = await fetch(`${baseUrl}/api/v1/clients/client-002/overview`, {
        headers: { Cookie: `access_token=${staffToken}` },
      });
      const staffOverview = await staffOverviewRes.json();
      const overviewHasRestricted = (staffOverview.cases || []).some((c: any) => c.id === 'case-002');
      assert(
        !overviewHasRestricted,
        'Restricted case is omitted from client overview when queried by staff'
      );

      // Staff attempting to register restricted case without permission: returns 403
      const staffCreateRestricted = await fetch(`${baseUrl}/api/v1/cases`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Cookie: `access_token=${staffToken}`,
        },
        body: JSON.stringify({
          clientId: 'client-001',
          caseNumber: 'Confidential Criminal Misc 99/2024',
          court: 'High Court Division',
          matterType: 'Criminal Misc',
          restricted: true,
        }),
      });
      assert(
        staffCreateRestricted.status === 403,
        'Staff without restricted.view cannot create a restricted case (HTTP 403)'
      );

      // Owner (has all permissions) CAN view case-002
      const ownerDirectRes = await fetch(`${baseUrl}/api/v1/cases/case-002`, {
        headers: { Cookie: `access_token=${ownerToken}` },
      });
      const ownerCase = await ownerDirectRes.json();
      assert(ownerDirectRes.status === 200, 'Owner can retrieve restricted case (HTTP 200)');
      assert(ownerCase.restricted === true, 'Retrieved case has restricted: true');

      // Owner client-002 overview includes the restricted case
      const ownerOverviewRes = await fetch(`${baseUrl}/api/v1/clients/client-002/overview`, {
        headers: { Cookie: `access_token=${ownerToken}` },
      });
      const ownerOverview = await ownerOverviewRes.json();
      const ownerOverviewHasRestricted = (ownerOverview.cases || []).some(
        (c: any) => c.id === 'case-002'
      );
      assert(
        ownerOverviewHasRestricted,
        'Owner can see restricted cases in client overview'
      );
      // Staff without restricted.view checks duplicate for confidential case-002: must NOT reveal its existence
      const staffDupCheckRes = await fetch(
        `${baseUrl}/api/v1/cases/check-duplicate?caseNumber=Special+Criminal+Revision+No.+12/2024&court=High+Court+Division,+Supreme+Court+of+Bangladesh`,
        { headers: { Cookie: `access_token=${staffToken}` } }
      );
      const staffDupCheck = await staffDupCheckRes.json();
      assert(staffDupCheckRes.status === 200, 'Staff duplicate check endpoint returns HTTP 200');
      assert(
        staffDupCheck.isDuplicate === false,
        'Staff without restricted.view does NOT see restricted case in duplicate check (confidentiality)'
      );

      // Owner checking duplicate for confidential case-002 gets isDuplicate: true
      const ownerDupCheckRes = await fetch(
        `${baseUrl}/api/v1/cases/check-duplicate?caseNumber=Special+Criminal+Revision+No.+12/2024&court=High+Court+Division,+Supreme+Court+of+Bangladesh`,
        { headers: { Cookie: `access_token=${ownerToken}` } }
      );
      const ownerDupCheck = await ownerDupCheckRes.json();
      assert(
        ownerDupCheck.isDuplicate === true,
        'Owner with restricted access sees restricted case in duplicate check'
      );
    }

    // --- 3. Duplicate case number in the same court gives a warning ---
    console.log('\n--- 3. Duplicate Case Number in Same Court Warning ---');
    {
      // Duplicate check endpoint for existing case-001
      const dupCheckRes = await fetch(
        `${baseUrl}/api/v1/cases/check-duplicate?caseNumber=Title+Suit+No.+45/2023&court=1st+Joint+District+Judge+Court,+Dhaka`,
        { headers: { Cookie: `access_token=${ownerToken}` } }
      );
      const dupCheck = await dupCheckRes.json();
      assert(dupCheckRes.status === 200, 'Duplicate check endpoint returns HTTP 200');
      assert(dupCheck.isDuplicate === true, 'Duplicate case number in same court detected as duplicate');

      // Duplicate check with excludeId of the existing case
      const dupExcludeRes = await fetch(
        `${baseUrl}/api/v1/cases/check-duplicate?caseNumber=Title+Suit+No.+45/2023&court=1st+Joint+District+Judge+Court,+Dhaka&excludeId=case-001`,
        { headers: { Cookie: `access_token=${ownerToken}` } }
      );
      const dupExclude = await dupExcludeRes.json();
      assert(
        dupExclude.isDuplicate === false,
        'Duplicate check excludes current case ID during edits'
      );

      // Registering duplicate case returns warning in response without blocking
      const dupCreateRes = await fetch(`${baseUrl}/api/v1/cases`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Cookie: `access_token=${ownerToken}`,
        },
        body: JSON.stringify({
          clientId: 'client-001',
          caseNumber: 'Title Suit No. 45/2023', // duplicate of case-001
          court: '1st Joint District Judge Court, Dhaka',
          matterType: 'Civil Partition',
          description: 'Second filing attempt',
        }),
      });
      const dupCreateBody = await dupCreateRes.json();
      assert(dupCreateRes.status === 201, 'Duplicate case creation is permitted (HTTP 201)');
      assert(
        dupCreateBody.warning && dupCreateBody.warning.includes('Duplicate'),
        'API returns duplicate warning in response payload'
      );
    }

    // --- 4. Closing a case keeps all linked records ---
    console.log('\n--- 4. Closing a Case & Linked Record Retention ---');
    {
      // Close case-001
      const closeRes = await fetch(`${baseUrl}/api/v1/cases/case-001`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Cookie: `access_token=${ownerToken}`,
        },
        body: JSON.stringify({
          status: 'closed',
        }),
      });
      const closedCase = await closeRes.json();
      assert(closeRes.status === 200, 'Case updated to closed status (HTTP 200)');
      assert(closedCase.status === 'closed', 'Case record status is now closed');

      // Verify client overview still retains the closed case
      const overviewRes = await fetch(`${baseUrl}/api/v1/clients/client-001/overview`, {
        headers: { Cookie: `access_token=${ownerToken}` },
      });
      const overview = await overviewRes.json();
      const clientCase = (overview.cases || []).find((c: any) => c.id === 'case-001');
      assert(Boolean(clientCase), 'Closed case is retained in client overview');
      assert(clientCase?.status === 'Closed', 'Client overview reflects Closed status');

      // Verify linked counts still accessible
      const countsRes = await fetch(`${baseUrl}/api/v1/cases/case-001/counts`, {
        headers: { Cookie: `access_token=${ownerToken}` },
      });
      const counts = await countsRes.json();
      assert(countsRes.status === 200, 'Linked counts query succeeds on closed case');
      assert(typeof counts.hearingsCount === 'number', 'Linked counts structure preserved');
    }

    // --- 5. Soft Delete and Owner-Only Enforcement ---
    console.log('\n--- 5. Soft Delete & Owner-Only Permission ---');
    {
      // Register a case for deletion test
      const tempRes = await fetch(`${baseUrl}/api/v1/cases`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Cookie: `access_token=${ownerToken}`,
        },
        body: JSON.stringify({
          clientId: 'client-001',
          caseNumber: 'Writ Petition No. 500/2024',
          court: 'High Court Division',
          matterType: 'Constitutional / Writ',
        }),
      });
      const tempCase = await tempRes.json();

      // Staff user attempts to delete: rejected (Owner only)
      const staffDelRes = await fetch(`${baseUrl}/api/v1/cases/${tempCase.id}`, {
        method: 'DELETE',
        headers: { Cookie: `access_token=${staffToken}` },
      });
      assert(
        staffDelRes.status === 403,
        'Staff user cannot delete case (HTTP 403 Owner-only enforcement)'
      );

      // Owner soft-deletes the case
      const ownerDelRes = await fetch(`${baseUrl}/api/v1/cases/${tempCase.id}`, {
        method: 'DELETE',
        headers: { Cookie: `access_token=${ownerToken}` },
      });
      const delBody = await ownerDelRes.json();
      assert(ownerDelRes.status === 200, 'Owner can soft-delete case (HTTP 200)');
      assert(delBody.softDeleted === true, 'Response confirms soft-delete');

      // Case is excluded from active list
      const listRes = await fetch(`${baseUrl}/api/v1/cases`, {
        headers: { Cookie: `access_token=${ownerToken}` },
      });
      const casesList = await listRes.json();
      assert(
        !casesList.some((c: any) => c.id === tempCase.id),
        'Soft-deleted case is excluded from active case list'
      );
    }

    // --- 6. Audit Trail for Case Mutations ---
    console.log('\n--- 6. Audit Trail for Case Mutations ---');
    {
      const auditRes = await fetch(`${baseUrl}/api/v1/audit-log`, {
        headers: { Cookie: `access_token=${ownerToken}` },
      });
      const auditLogs = await auditRes.json();
      assert(auditRes.status === 200, 'Audit log endpoint returns HTTP 200');

      const caseCreateEntry = auditLogs.find(
        (a: any) => a.entity === 'Case' && a.action === 'CREATE'
      );
      assert(Boolean(caseCreateEntry), 'Audit log contains Case CREATE entry');
      assert(
        caseCreateEntry.userId === 'user-owner-001',
        'Audit log captures operator identity'
      );

      const caseUpdateEntry = auditLogs.find(
        (a: any) => a.entity === 'Case' && a.action === 'UPDATE'
      );
      assert(Boolean(caseUpdateEntry), 'Audit log contains Case UPDATE entry');

      const caseDeleteEntry = auditLogs.find(
        (a: any) => a.entity === 'Case' && a.action === 'DELETE'
      );
      assert(Boolean(caseDeleteEntry), 'Audit log contains Case DELETE entry');

      // R-03: Audit log entries concerning restricted cases are hidden from users without restricted.view
      await db.insertAudit({
        id: 'audit-case-002-test',
        firmId: 'firm-bd-001',
        userId: 'user-owner-001',
        userName: 'Adv. Mahbubur Rahman',
        entity: 'Case',
        entityId: 'case-002',
        action: 'UPDATE',
        oldValue: { restricted: true, caseNumber: 'Special Criminal Revision No. 12/2024' },
        newValue: { restricted: true, status: 'ongoing' },
        timestamp: new Date(),
        createdAt: new Date(),
        updatedAt: new Date(),
        deletedAt: null,
        createdBy: 'user-owner-001',
        updatedBy: 'user-owner-001',
      });

      // Owner can see the restricted case audit entry
      const ownerAuditWithRestricted = await (await fetch(`${baseUrl}/api/v1/audit-log`, {
        headers: { Cookie: `access_token=${ownerToken}` },
      })).json();
      const ownerSeesRestrictedAudit = ownerAuditWithRestricted.some(
        (a: any) => a.entity === 'Case' && a.entityId === 'case-002'
      );
      assert(ownerSeesRestrictedAudit, 'Owner can see audit entries concerning restricted cases');

      // Grant settings.manage to staff WITHOUT restricted.view
      await fetch(`${baseUrl}/api/v1/users/user-staff-002/permissions`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Cookie: `access_token=${ownerToken}`,
        },
        body: JSON.stringify({ permissions: ['settings.manage', 'cases.view'] }),
      });

      // Staff queries audit log
      const staffAuditRes = await fetch(`${baseUrl}/api/v1/audit-log`, {
        headers: { Cookie: `access_token=${staffToken}` },
      });
      assert(staffAuditRes.status === 200, 'Staff with settings.manage can query audit log (HTTP 200)');
      const staffAuditLogs = await staffAuditRes.json();
      const staffSeesRestrictedAudit = staffAuditLogs.some(
        (a: any) => a.entity === 'Case' && a.entityId === 'case-002'
      );
      assert(
        !staffSeesRestrictedAudit,
        'Staff without restricted.view CANNOT see audit entries concerning restricted cases (R-03 confidentiality)'
      );

      // Now grant restricted.view to staff
      await fetch(`${baseUrl}/api/v1/users/user-staff-002/permissions`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Cookie: `access_token=${ownerToken}`,
        },
        body: JSON.stringify({ permissions: ['settings.manage', 'cases.view', 'restricted.view'] }),
      });

      // Staff queries audit log with restricted.view
      const staffAuditWithPerm = await (await fetch(`${baseUrl}/api/v1/audit-log`, {
        headers: { Cookie: `access_token=${staffToken}` },
      })).json();
      const staffWithPermSeesRestricted = staffAuditWithPerm.some(
        (a: any) => a.entity === 'Case' && a.entityId === 'case-002'
      );
      assert(
        staffWithPermSeesRestricted,
        'Staff with restricted.view CAN see audit entries concerning restricted cases'
      );
    }

    // --- 7. Firm Isolation on Cases ---
    console.log('\n--- 7. Firm Isolation on Cases ---');
    {
      // Create Firm B and User B
      const firmBId = 'firm-bd-isolated-002';
      await db.insertFirm({
        id: firmBId,
        firmId: firmBId,
        name: 'Isolated Legal Chamber B',
        barCouncilReg: null,
        officeAddress: null,
        courtAffiliations: null,
        planId: 'plan-pro-001',
        licenseExpiresAt: new Date(Date.now() + 30 * 86400000),
        status: 'active',
        createdAt: new Date(),
        updatedAt: new Date(),
        deletedAt: null,
        createdBy: 'system',
        updatedBy: 'system',
      });

      const userBPasswordHash = await bcrypt.hash('UserBPassword123!', 10);
      await db.insertUser({
        id: 'user-b-001',
        firmId: firmBId,
        name: 'Adv. Isolated User',
        email: 'userb@firm-b.bd',
        passwordHash: userBPasswordHash,
        role: 'Owner',
        permissions: ALL_PERMISSIONS,
        language: 'en',
        active: true,
        failedLoginAttempts: 0,
        lockedUntil: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        deletedAt: null,
        createdBy: 'system',
        updatedBy: 'system',
      } as any);

      const loginBRes = await fetch(`${baseUrl}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'userb@firm-b.bd', password: 'UserBPassword123!' }),
      });
      const tokenB = extractToken(loginBRes);

      // Firm B lists cases: should not see Firm A cases (case-001, case-002)
      const firmBCasesRes = await fetch(`${baseUrl}/api/v1/cases`, {
        headers: { Cookie: `access_token=${tokenB}` },
      });
      const firmBCases = await firmBCasesRes.json();
      assert(
        !firmBCases.some((c: any) => c.firmId === 'firm-bd-001' || c.id === 'case-001'),
        'Firm B cannot see Firm A cases in list (firm isolation)'
      );

      // Firm B querying Firm A case by ID directly: returns 404
      const firmBQueryRes = await fetch(`${baseUrl}/api/v1/cases/case-001`, {
        headers: { Cookie: `access_token=${tokenB}` },
      });
      assert(
        firmBQueryRes.status === 404,
        'Firm B querying Firm A case ID returns 404 Not Found'
      );

      // --- R-07: DB Adapter Scoping Test ---
      // Direct call to db.getClientById(id, foreignFirmId) must return null
      const crossFirmClient = await (db as any).getClientById('client-001', firmBId);
      assert(crossFirmClient === null, 'DB adapter getClientById with foreign firmId returns null');

      // Direct call to db.getCaseById(id, foreignFirmId) must return null
      const crossFirmCase = await (db as any).getCaseById('case-001', firmBId);
      assert(crossFirmCase === null, 'DB adapter getCaseById with foreign firmId returns null');
    }

    console.log('\n--- 8. Synthetic Case Update Regression Test (case-syn-109) ---');
    {
      // Create synthetic case linked to client-001 and responsible lawyer user-staff-002
      const synCaseId = 'case-syn-109';
      await db.insertCase({
        id: synCaseId,
        firmId: 'firm-bd-001',
        clientId: 'client-001',
        fileSerial: 'SYN-FS-0109',
        caseNumber: 'Customs No. 104/2024',
        court: 'Family Court, Dhaka',
        matterType: 'Customs Valuation & Port Tariff Dispute',
        description: 'Synthetic legal practice matter concerning customs valuation dispute',
        plaintiff: 'Md. Zillur Rahman Molla',
        defendant: 'Opposite Party & Others (109)',
        partyARole: 'Plaintiff',
        partyBRole: 'Defendant',
        ourRole: 'Plaintiff',
        plaintiffLawyer: 'Adv. Nusrat Jahan',
        defendantLawyer: 'Adv. Enamul Karim (109)',
        responsibleLawyerId: 'user-staff-002',
        status: 'closed',
        caseCategory: 'other',
        caseDate: new Date('2024-11-10T00:00:00.000Z'),
        closedOn: new Date('2026-05-15T12:00:00.000Z'),
        policeStation: null,
        sectionsOfLaw: 'Section 54 Specific Relief Act 1877',
        restricted: false,
        nextHearingAt: null,
        createdAt: new Date('2024-11-12T10:00:00.000Z'),
        updatedAt: new Date('2026-06-15T14:00:00.000Z'),
        deletedAt: null,
        createdBy: 'user-owner-001',
        updatedBy: 'user-owner-001',
      } as any);

      // Verify updating synthetic case succeeds with HTTP 200 (including date fields & responsible lawyer)
      const updatePayload = {
        clientId: 'client-001',
        responsibleLawyerId: 'user-staff-002',
        fileSerial: 'SYN-FS-0109',
        caseNumber: 'Customs No. 104/2024-UPDATED',
        court: 'Family Court, Dhaka',
        matterType: 'Customs Valuation & Port Tariff Dispute',
        description: 'Updated synthetic matter description',
        caseCategory: 'other',
        caseDate: '2024-11-10',
        closedOn: '2026-05-15',
        partyARole: 'Plaintiff',
        partyBRole: 'Defendant',
        plaintiff: 'Md. Zillur Rahman Molla',
        defendant: 'Opposite Party & Others (109)',
        ourRole: 'Plaintiff',
        status: 'closed',
        restricted: false,
      };

      const patchRes = await fetch(`${baseUrl}/api/v1/cases/${synCaseId}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Cookie: `access_token=${ownerToken}`,
        },
        body: JSON.stringify(updatePayload),
      });

      assert(patchRes.status === 200, `Updating synthetic case-syn-109 returns HTTP 200 (received ${patchRes.status})`);
      const patchedBody = await patchRes.json();
      assert(patchedBody.caseNumber === 'Customs No. 104/2024-UPDATED', 'Synthetic case number was updated');
      assert(patchedBody.responsibleLawyerId === 'user-staff-002', 'Responsible lawyer user-staff-002 retained');
      assert(patchedBody.status === 'closed', 'Case status remains closed');
      assert(Boolean(patchedBody.closedOn), 'Disposal date closedOn persisted properly');
    }
  } finally {
    server.close();
  }

  console.log('\n========================================');
  console.log(`CASES BACKEND TEST RESULTS: ${passed} PASSED, ${failed} FAILED`);
  console.log('========================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runTests().catch((err) => {
  console.error('Test runner encountered fatal error:', err);
  process.exit(1);
});
