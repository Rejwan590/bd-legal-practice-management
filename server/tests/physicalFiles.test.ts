process.env.JWT_SECRET = 'test_jwt_secret_key_at_least_32_chars_long_1234567890';
process.env.ADMIN_JWT_SECRET = 'test_admin_jwt_secret_key_at_least_32_chars_9876543210';

import http from 'http';
import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import { createApp } from '../src/app.js';
import { getDatabase } from '../src/db/client.js';
import { SEED_PASSWORDS } from '../src/db/seed.js';

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
  console.log('--- STARTING BACKEND PHYSICAL FILES MODULE TEST SUITE ---');
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
    // 1. Authenticate Owner
    const ownerRes = await fetch(`${baseUrl}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'owner@firm.bd', password: SEED_PASSWORDS.owner }),
    });
    const ownerToken = extractToken(ownerRes);
    const ownerCookie = `access_token=${ownerToken}`;
    assert(Boolean(ownerToken), 'Owner login succeeds');

    const meRes = await fetch(`${baseUrl}/auth/me`, {
      headers: { Cookie: ownerCookie },
    });
    const meJson = await meRes.json();
    const firmId = meJson.user.firmId;
    const ownerId = meJson.user.id;

    // 2. Provision Staff users (one with files.view only, one with files.view + files.manage, without restricted.view)
    const passwordHash = await bcrypt.hash('StaffPass123!', 10);
    const staffViewerId = 'staff-files-view-001';
    await db.insertUser({
      id: staffViewerId,
      firmId,
      name: 'Junior Viewer',
      email: 'files.viewer@firm.bd',
      passwordHash,
      role: 'Staff',
      jobType: 'clerk',
      jobTitleLabel: 'Clerk',
      reportsToUserId: null,
      permissions: ['files.view', 'cases.view', 'clients.view'],
      language: 'en',
      active: true,
      mustChangePassword: false,
      failedLoginAttempts: 0,
      lockedUntil: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      deletedAt: null,
      createdBy: ownerId,
      updatedBy: ownerId,
    });

    const staffManagerId = 'staff-files-manage-001';
    await db.insertUser({
      id: staffManagerId,
      firmId,
      name: 'Senior Custody Associate',
      email: 'files.manager@firm.bd',
      passwordHash,
      role: 'Staff',
      jobType: 'associate',
      jobTitleLabel: 'Associate',
      reportsToUserId: null,
      permissions: ['files.view', 'files.manage', 'cases.view', 'clients.view'],
      language: 'en',
      active: true,
      mustChangePassword: false,
      failedLoginAttempts: 0,
      lockedUntil: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      deletedAt: null,
      createdBy: ownerId,
      updatedBy: ownerId,
    });

    const viewerLogin = await fetch(`${baseUrl}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'files.viewer@firm.bd', password: 'StaffPass123!' }),
    });
    const viewerCookie = `access_token=${extractToken(viewerLogin)}`;

    const managerLogin = await fetch(`${baseUrl}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'files.manager@firm.bd', password: 'StaffPass123!' }),
    });
    const managerCookie = `access_token=${extractToken(managerLogin)}`;

    // 3. Provision client + normal case + restricted case
    const client = await db.insertClient({
      id: 'client-files-test-001',
      firmId,
      name: 'Custody Test Client',
      nameBn: null,
      phone: '01711223344',
      email: 'custody.client@example.com',
      address: 'Dhanmondi, Dhaka',
      notes: null,
      archived: false,
      createdAt: new Date(),
      updatedAt: new Date(),
      deletedAt: null,
      createdBy: ownerId,
      updatedBy: ownerId,
    });

    const normalCase = await db.insertCase({
      id: 'case-files-normal-001',
      firmId,
      clientId: client.id,
      fileSerial: 'F-CASE-001',
      caseNumber: 'Title Suit 450/2026',
      court: 'Dhaka District Judge Court',
      matterType: 'Land Partition',
      description: 'Physical dossier case',
      plaintiff: 'Custody Test Client',
      defendant: 'Opponent Co.',
      ourRole: 'Plaintiff',
      plaintiffLawyer: null,
      defendantLawyer: null,
      responsibleLawyerId: ownerId,
      status: 'ongoing',
      caseDate: new Date(),
      closedOn: null,
      caseCategory: 'civil',
      partyARole: 'Plaintiff',
      partyBRole: 'Defendant',
      policeStation: null,
      sectionsOfLaw: null,
      restricted: false,
      nextHearingAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      deletedAt: null,
      createdBy: ownerId,
      updatedBy: ownerId,
    });

    const restrictedCase = await db.insertCase({
      id: 'case-files-restricted-001',
      firmId,
      clientId: client.id,
      fileSerial: 'F-CASE-RES-001',
      caseNumber: 'Writ Secret 12/2026',
      court: 'High Court Division',
      matterType: 'Confidential Writ',
      description: 'Restricted physical dossier',
      plaintiff: 'Custody Test Client',
      defendant: 'State',
      ourRole: 'Petitioner',
      plaintiffLawyer: null,
      defendantLawyer: null,
      responsibleLawyerId: staffManagerId,
      status: 'ongoing',
      caseDate: new Date(),
      closedOn: null,
      caseCategory: 'writ',
      partyARole: 'Petitioner',
      partyBRole: 'Respondent',
      policeStation: null,
      sectionsOfLaw: null,
      restricted: true,
      nextHearingAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      deletedAt: null,
      createdBy: ownerId,
      updatedBy: ownerId,
    });

    // 4. Next Serial preview & Sequential Generation
    const nextRes1 = await fetch(`${baseUrl}/api/v1/physical-files/next-serial`, {
      headers: { Cookie: ownerCookie },
    });
    assert(nextRes1.status === 200, 'GET /physical-files/next-serial returns 200');
    const nextJson1 = await nextRes1.json();
    assert(nextJson1.serial === 'F-000101', `Initial next-serial is F-000101 (got ${nextJson1.serial})`);

    // Staff without files.manage cannot create
    const forbiddenCreate = await fetch(`${baseUrl}/api/v1/physical-files`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: viewerCookie },
      body: JSON.stringify({
        title: 'Unauthorized Folder',
        caseId: normalCase.id,
      }),
    });
    assert(forbiddenCreate.status === 403, 'Staff without files.manage gets 403 on POST /physical-files');

    // Create File 1 (auto-serial, linked to normal case)
    const create1 = await fetch(`${baseUrl}/api/v1/physical-files`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: ownerCookie },
      body: JSON.stringify({
        title: 'Main Brief & Plaint Bundle Vol-1',
        caseId: normalCase.id,
        shelfLocation: 'Cabinet A, Shelf 2',
        notes: 'Contains original title deed',
      }),
    });
    assert(create1.status === 201, 'Owner creates physical file successfully');
    const file1 = await create1.json();
    assert(file1.serial === 'F-000101', `Assigned sequential serial F-000101 (got ${file1.serial})`);
    assert(file1.status === 'in_chamber', 'Initial status is in_chamber');
    assert(file1.clientId === client.id, 'Automatically inherits clientId from linked case');

    // Duplicate serial check -> 409 Conflict
    const dupSerialRes = await fetch(`${baseUrl}/api/v1/physical-files`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: ownerCookie },
      body: JSON.stringify({
        title: 'Duplicate Serial Test',
        serial: 'F-000101',
      }),
    });
    assert(dupSerialRes.status === 409, 'Duplicate serial in same firm returns 409 Conflict');

    // Next serial increments to F-000102
    const nextRes2 = await fetch(`${baseUrl}/api/v1/physical-files/next-serial`, {
      headers: { Cookie: ownerCookie },
    });
    const nextJson2 = await nextRes2.json();
    assert(nextJson2.serial === 'F-000102', `Next serial increments to F-000102 (got ${nextJson2.serial})`);

    // Create File 2 (restricted case)
    const createRestricted = await fetch(`${baseUrl}/api/v1/physical-files`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: ownerCookie },
      body: JSON.stringify({
        title: 'Confidential Annexures',
        caseId: restrictedCase.id,
        shelfLocation: 'Safe Vault B',
      }),
    });
    assert(createRestricted.status === 201, 'Restricted case file created by owner');
    const restrictedFile = await createRestricted.json();

    // 5. Lookup by serial, by case, and list filters
    const bySerial = await fetch(`${baseUrl}/api/v1/physical-files/by-serial/f-000101`, {
      headers: { Cookie: ownerCookie },
    });
    assert(bySerial.status === 200, 'GET /by-serial resolves case-insensitively');
    const bySerialJson = await bySerial.json();
    assert(bySerialJson.id === file1.id, 'Lookup by serial returns matching file');

    const byCase = await fetch(`${baseUrl}/api/v1/physical-files/by-case/${normalCase.id}`, {
      headers: { Cookie: ownerCookie },
    });
    assert(byCase.status === 200, 'GET /by-case/:caseId returns linked file');

    // Restricted access check for staff manager lacking restricted.view
    const listManager = await fetch(`${baseUrl}/api/v1/physical-files`, {
      headers: { Cookie: managerCookie },
    });
    const listManagerJson = await listManager.json();
    assert(
      !listManagerJson.some((f: any) => f.id === restrictedFile.id),
      'Staff without restricted.view does not see restricted case physical file in list'
    );

    const getRestrictedAsStaff = await fetch(`${baseUrl}/api/v1/physical-files/${restrictedFile.id}`, {
      headers: { Cookie: managerCookie },
    });
    assert(
      getRestrictedAsStaff.status === 404 || getRestrictedAsStaff.status === 403,
      `Direct access to restricted case physical file without restricted.view is denied (got ${getRestrictedAsStaff.status})`
    );

    // 6. Custody Lifecycle: Check-out -> Dispatch to Court -> Check-in -> Timeline
    const dueIso = new Date(Date.now() + 86400000 * 3).toISOString();
    const checkOutRes = await fetch(`${baseUrl}/api/v1/physical-files/${file1.id}/check-out`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: managerCookie },
      body: JSON.stringify({
        holderId: staffManagerId,
        dueBackAt: dueIso,
        note: 'Preparing written argument',
      }),
    });
    assert(checkOutRes.status === 200, 'POST /check-out succeeds');
    const checkOutJson = await checkOutRes.json();
    assert(checkOutJson.file.status === 'checked_out', 'Status updated to checked_out');
    assert(checkOutJson.file.currentHolderId === staffManagerId, 'currentHolderId updated');
    assert(checkOutJson.file.currentHolderName === 'Senior Custody Associate', 'currentHolderName resolved');
    assert(checkOutJson.movement.action === 'CHECKOUT', 'Movement record created with CHECKOUT');

    // Client Linked Overview & Case Linked Counts reflect live file
    const clientOverviewRes = await fetch(`${baseUrl}/api/v1/clients/${client.id}/overview`, {
      headers: { Cookie: ownerCookie },
    });
    const clientOverview = await clientOverviewRes.json();
    assert(
      Array.isArray(clientOverview.files) &&
        clientOverview.files.some((f: any) => f.id === file1.id && f.status === 'checked_out'),
      'Client linked overview includes physical files with live status'
    );

    const caseCountsRes = await fetch(`${baseUrl}/api/v1/cases/${normalCase.id}/counts`, {
      headers: { Cookie: ownerCookie },
    });
    const caseCounts = await caseCountsRes.json();
    assert(caseCounts.filesCount === 1, `Case linked counts reports filesCount = 1 (got ${caseCounts.filesCount})`);

    // Dispatch to court
    const courtDueIso = new Date(Date.now() + 86400000).toISOString();
    const dispatchRes = await fetch(`${baseUrl}/api/v1/physical-files/${file1.id}/dispatch-court`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: managerCookie },
      body: JSON.stringify({
        courtName: 'Dhaka District Judge Court, Room 204',
        holderId: staffViewerId,
        dueBackAt: courtDueIso,
        note: 'Evidence marking hearing',
      }),
    });
    assert(dispatchRes.status === 200, 'POST /dispatch-court succeeds');
    const dispatchJson = await dispatchRes.json();
    assert(dispatchJson.file.status === 'in_court', 'Status updated to in_court');
    assert(dispatchJson.file.currentHolderId === staffViewerId, 'Custody transferred to court carrier');
    assert(dispatchJson.movement.action === 'COURT_DISPATCH', 'Movement record created with COURT_DISPATCH');

    // Check-in back to shelf
    const checkInRes = await fetch(`${baseUrl}/api/v1/physical-files/${file1.id}/check-in`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: ownerCookie },
      body: JSON.stringify({
        shelfLocation: 'Cabinet A, Shelf 3',
        note: 'All exhibits intact',
      }),
    });
    assert(checkInRes.status === 200, 'POST /check-in succeeds');
    const checkInJson = await checkInRes.json();
    assert(checkInJson.file.status === 'in_chamber', 'Status restored to in_chamber');
    assert(checkInJson.file.currentHolderId === null, 'Holder cleared on check-in');
    assert(checkInJson.file.shelfLocation === 'Cabinet A, Shelf 3', 'Shelf location updated on check-in');
    assert(checkInJson.movement.action === 'CHECKIN', 'Movement record created with CHECKIN');

    // Verify movement history timeline has 3 movements in order
    const movementsRes = await fetch(`${baseUrl}/api/v1/physical-files/${file1.id}/movements`, {
      headers: { Cookie: viewerCookie },
    });
    assert(movementsRes.status === 200, 'GET /movements succeeds with files.view');
    const movements = await movementsRes.json();
    assert(movements.length === 3, `Movement timeline has 3 events (got ${movements.length})`);
    assert(movements[0].action === 'CHECKIN', 'Latest movement appears first (CHECKIN)');

    // 7. Cross-firm isolation check
    const otherFirmId = 'firm-other-files-test';
    await db.insertFirm({
      id: otherFirmId,
      firmId: otherFirmId,
      name: 'Rival Chamber',
      status: 'active',
      licenseStartsAt: new Date(),
      licenseExpiresAt: new Date(Date.now() + 86400000 * 30),
    });
    await db.insertUser({
      id: 'user-other-files-test',
      firmId: otherFirmId,
      name: 'Other Lawyer',
      email: 'other.files@rival.bd',
      passwordHash,
      role: 'Owner',
      jobType: 'advocate',
      permissions: ['*'],
      language: 'en',
      active: true,
      mustChangePassword: false,
      failedLoginAttempts: 0,
      lockedUntil: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      deletedAt: null,
    });
    const otherLogin = await fetch(`${baseUrl}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'other.files@rival.bd', password: 'StaffPass123!' }),
    });
    const otherCookie = `access_token=${extractToken(otherLogin)}`;

    const crossFirmGet = await fetch(`${baseUrl}/api/v1/physical-files/${file1.id}`, {
      headers: { Cookie: otherCookie },
    });
    assert(crossFirmGet.status === 404, 'Cross-firm GET /physical-files/:id returns 404');

    // 8. Subscription Read-Only Mode enforcement (past expiry + 5-day grace period)
    await db.updateFirm(firmId, {
      status: 'expired',
      licenseExpiresAt: new Date(Date.now() - 30 * 86400000),
    });
    const expiredWrite = await fetch(`${baseUrl}/api/v1/physical-files`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: ownerCookie },
      body: JSON.stringify({ title: 'Blocked during expired sub' }),
    });
    assert(expiredWrite.status === 403, 'Mutating write returns 403 when subscription expired');
    const expiredJson = await expiredWrite.json();
    assert(expiredJson.code === 'SUBSCRIPTION_READ_ONLY', 'Error code is SUBSCRIPTION_READ_ONLY');

    const expiredRead = await fetch(`${baseUrl}/api/v1/physical-files`, {
      headers: { Cookie: ownerCookie },
    });
    assert(expiredRead.status === 200, 'Read remains available in read-only mode');

    // Restore firm active license
    await db.updateFirm(firmId, {
      status: 'active',
      licenseExpiresAt: new Date(Date.now() + 86400000 * 365),
    });

    // 9. Soft delete & Audit verification
    const deleteRes = await fetch(`${baseUrl}/api/v1/physical-files/${file1.id}`, {
      method: 'DELETE',
      headers: { Cookie: ownerCookie },
    });
    assert(deleteRes.status === 200, 'DELETE /physical-files/:id soft-deletes file');
    const afterDeleteGet = await fetch(`${baseUrl}/api/v1/physical-files/${file1.id}`, {
      headers: { Cookie: ownerCookie },
    });
    assert(afterDeleteGet.status === 404, 'Soft-deleted file returns 404 on GET');

    // Verify next-serial still stays at F-000103 (respecting soft-deleted F-000101 & restricted F-000102)
    const nextResAfterDel = await fetch(`${baseUrl}/api/v1/physical-files/next-serial`, {
      headers: { Cookie: ownerCookie },
    });
    const nextAfterDelJson = await nextResAfterDel.json();
    assert(
      nextAfterDelJson.serial === 'F-000103',
      `Serial generator skips soft-deleted serials safely (got ${nextAfterDelJson.serial})`
    );

    const auditLogs = await db.listAudit(firmId, 100, 0, true, undefined, { entity: 'PhysicalFile' });
    const actions = new Set(auditLogs.map((a) => a.action));
    assert(
      actions.has('CREATE') &&
        actions.has('PHYSICAL_FILE_CHECKED_OUT') &&
        actions.has('PHYSICAL_FILE_COURT_DISPATCH') &&
        actions.has('PHYSICAL_FILE_CHECKED_IN') &&
        actions.has('DELETE'),
      'Audit trail captures all PhysicalFile custody lifecycle mutations'
    );
  } finally {
    server.close();
  }

  console.log(`\n========================================`);
  console.log(`PHYSICAL FILES BACKEND TEST RESULTS: ${passed} PASSED, ${failed} FAILED`);
  console.log(`========================================\n`);

  if (failed > 0) {
    process.exit(1);
  }
}

runTests().catch((err) => {
  console.error('Unhandled test runner error:', err);
  process.exit(1);
});
