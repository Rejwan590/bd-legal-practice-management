process.env.JWT_SECRET = 'test_jwt_secret_key_at_least_32_chars_long_1234567890';
process.env.ADMIN_JWT_SECRET = 'test_admin_jwt_secret_key_at_least_32_chars_9876543210';

import http from 'http';
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
  return { baseUrl: `http://127.0.0.1:${addr.port}`, server };
}

function extractToken(res: Response): string {
  const cookie = res.headers.get('set-cookie') || '';
  const match = cookie.match(/access_token=([^;]+)/);
  return match ? match[1] : '';
}

async function runTests() {
  console.log('--- STARTING BACKEND CALENDAR & REMINDERS TEST SUITE ---');
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

    const meRes = await fetch(`${baseUrl}/auth/me`, { headers: { Cookie: ownerCookie } });
    const meJson = await meRes.json();
    const firmId = meJson.user.firmId;
    const ownerId = meJson.user.id;

    // 2. Provision two Staff members (junior without restricted.view, senior with restricted.view)
    const passwordHash = await bcrypt.hash('StaffPass123!', 10);
    const staffAId = 'staff-rem-a-001';
    await db.insertUser({
      id: staffAId,
      firmId,
      name: 'Junior Advocate A',
      email: 'rem.staffa@firm.bd',
      passwordHash,
      role: 'Staff',
      jobType: 'advocate',
      jobTitleLabel: 'Associate',
      reportsToUserId: null,
      permissions: ['cases.view', 'cases.edit', 'clients.view', 'tasks.view', 'tasks.complete', 'files.view', 'files.manage', 'appointments.view', 'appointments.manage'],
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

    const staffBId = 'staff-rem-b-002';
    await db.insertUser({
      id: staffBId,
      firmId,
      name: 'Senior Associate B',
      email: 'rem.staffb@firm.bd',
      passwordHash,
      role: 'Staff',
      jobType: 'advocate',
      jobTitleLabel: 'Senior Associate',
      reportsToUserId: null,
      permissions: ['cases.view', 'restricted.view', 'clients.view', 'tasks.view', 'files.view', 'appointments.view'],
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

    const loginA = await fetch(`${baseUrl}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'rem.staffa@firm.bd', password: 'StaffPass123!' }),
    });
    const staffACookie = `access_token=${extractToken(loginA)}`;

    const loginB = await fetch(`${baseUrl}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'rem.staffb@firm.bd', password: 'StaffPass123!' }),
    });
    const staffBCookie = `access_token=${extractToken(loginB)}`;

    // 3. Provision Client, Normal Case (assigned to Staff A), Restricted Case (assigned to Owner)
    const client = await db.insertClient({
      id: 'client-rem-test-001',
      firmId,
      name: 'Reminders Test Client',
      nameBn: null,
      phone: '01711889900',
      email: 'rem.client@example.com',
      address: 'Banani, Dhaka',
      notes: null,
      archived: false,
      createdAt: new Date(),
      updatedAt: new Date(),
      deletedAt: null,
      createdBy: ownerId,
      updatedBy: ownerId,
    });

    const normalCase = await db.insertCase({
      id: 'case-rem-normal-001',
      firmId,
      clientId: client.id,
      fileSerial: 'F-REM-001',
      caseNumber: 'Civil Suit 701/2026',
      court: 'Dhaka Joint District Judge Court',
      matterType: 'Declaration & Injunction',
      description: 'Calendar reminders normal test case',
      plaintiff: 'Reminders Test Client',
      defendant: 'Defendant Corp.',
      ourRole: 'Plaintiff',
      plaintiffLawyer: null,
      defendantLawyer: null,
      responsibleLawyerId: staffAId,
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
      id: 'case-rem-restricted-001',
      firmId,
      clientId: client.id,
      fileSerial: 'F-REM-RES-001',
      caseNumber: 'Writ Secret 99/2026',
      court: 'High Court Division',
      matterType: 'Writ Petition',
      description: 'Confidential writ matter',
      plaintiff: 'Reminders Test Client',
      defendant: 'Ministry',
      ourRole: 'Petitioner',
      plaintiffLawyer: null,
      defendantLawyer: null,
      responsibleLawyerId: ownerId,
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

    // 4. Create Hearing (within 12h so -24h reminder is already DUE), Restricted Hearing, Task, Physical File (checked out), Appointment
    const in12hIso = new Date(Date.now() + 12 * 3600 * 1000).toISOString();
    const hearingRes = await fetch(`${baseUrl}/api/v1/hearings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: ownerCookie },
      body: JSON.stringify({
        caseId: normalCase.id,
        scheduledAt: in12hIso,
        court: normalCase.court,
        purpose: 'Temporary Injunction Argument',
        fixedFor: 'hearing',
        appearingLawyerId: staffAId,
      }),
    });
    assert(hearingRes.status === 201, 'Normal hearing created');
    const hearing1 = await hearingRes.json();

    const secretHearingRes = await fetch(`${baseUrl}/api/v1/hearings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: ownerCookie },
      body: JSON.stringify({
        caseId: restrictedCase.id,
        scheduledAt: in12hIso,
        court: restrictedCase.court,
        purpose: 'In-Chamber Writ Motion',
        fixedFor: 'hearing',
        appearingLawyerId: ownerId,
      }),
    });
    assert(secretHearingRes.status === 201, 'Restricted hearing created');
    const secretHearing = await secretHearingRes.json();

    const in90mIso = new Date(Date.now() + 90 * 60 * 1000).toISOString();
    const taskRes = await fetch(`${baseUrl}/api/v1/tasks`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: ownerCookie },
      body: JSON.stringify({
        title: 'Prepare Injunction Paperbook',
        caseId: normalCase.id,
        clientId: client.id,
        assignedTo: staffAId,
        dueAt: in90mIso,
        priority: 'high',
      }),
    });
    assert(taskRes.status === 201, 'Task created for Staff A');
    const task1 = await taskRes.json();

    const fileRes = await fetch(`${baseUrl}/api/v1/physical-files`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: ownerCookie },
      body: JSON.stringify({
        title: 'Original Title Deed Bundle',
        caseId: normalCase.id,
        clientId: client.id,
        shelfLocation: 'Rack-C2',
      }),
    });
    assert(fileRes.status === 201, 'Physical file created');
    const file1 = await fileRes.json();

    const checkoutRes = await fetch(`${baseUrl}/api/v1/physical-files/${file1.id}/check-out`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: ownerCookie },
      body: JSON.stringify({
        holderId: staffAId,
        dueBackAt: new Date(Date.now() + 2 * 3600 * 1000).toISOString(),
        note: 'Need for injunction hearing',
      }),
    });
    assert(checkoutRes.status === 200, 'Physical file checked out to Staff A');

    const apptRes = await fetch(`${baseUrl}/api/v1/appointments`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: staffACookie },
      body: JSON.stringify({
        title: 'Briefing Client on Affidavit',
        type: 'client_meeting',
        startsAt: new Date(Date.now() + 3 * 3600 * 1000).toISOString(),
        endsAt: new Date(Date.now() + 4 * 3600 * 1000).toISOString(),
        caseId: normalCase.id,
        clientId: client.id,
        reminderMinutesBefore: 30,
      }),
    });
    assert(apptRes.status === 201, 'Appointment created with auto reminder');
    const appt1 = await apptRes.json();

    // 5. Sync Reminders and verify created reminders + due reminders
    const syncRes = await fetch(`${baseUrl}/api/v1/reminders/sync`, {
      method: 'POST',
      headers: { Cookie: ownerCookie },
    });
    assert(syncRes.status === 200, 'POST /reminders/sync succeeds');
    const syncJson = await syncRes.json();
    assert(syncJson.createdCount >= 3, `Sync generated reminders from hearings/tasks (createdCount=${syncJson.createdCount})`);

    const ownerDueRes = await fetch(`${baseUrl}/api/v1/reminders/due`, {
      headers: { Cookie: ownerCookie },
    });
    assert(ownerDueRes.status === 200, 'GET /reminders/due succeeds');
    const ownerDue = (await ownerDueRes.json()) as any[];
    assert(ownerDue.some((r) => r.sourceId === hearing1.id), 'Due reminders include upcoming hearing (<24h)');
    assert(ownerDue.some((r) => r.sourceId === task1.id), 'Due reminders include urgent task (<2h)');
    assert(ownerDue.some((r) => r.sourceId === file1.id), 'Due reminders include checked-out file (<4h)');
    assert(ownerDue.some((r) => r.sourceId === secretHearing.id), 'Owner sees restricted hearing reminder');

    // 6. Staff Partitioning + Restricted Visibility Check
    const staffAListRes = await fetch(`${baseUrl}/api/v1/reminders?status=active`, {
      headers: { Cookie: staffACookie },
    });
    assert(staffAListRes.status === 200, 'Staff A GET /reminders succeeds');
    const staffAList = (await staffAListRes.json()) as any[];
    assert(
      staffAList.every((r) => r.userId === staffAId),
      'Staff A only sees reminders assigned to Staff A'
    );
    assert(
      !staffAList.some((r) => r.sourceId === secretHearing.id),
      'Restricted hearing reminder hidden from Staff A'
    );

    // Staff B creates no reminder for Staff A and gets 403 trying to create for Staff A or dismiss Staff A reminder
    const staffCreateForARes = await fetch(`${baseUrl}/api/v1/reminders`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: staffBCookie },
      body: JSON.stringify({
        userId: staffAId,
        sourceType: 'task',
        sourceId: task1.id,
        title: 'Cross-staff alert',
        remindAt: new Date().toISOString(),
        dueAt: in90mIso,
      }),
    });
    assert(staffCreateForARes.status === 403, 'Staff B blocked (403) from creating reminder for Staff A');

    const staffATargetRem = staffAList.find((r) => r.sourceId === hearing1.id)!;
    assert(Boolean(staffATargetRem), 'Found hearing1 reminder belonging to Staff A');

    const staffBDismissARes = await fetch(`${baseUrl}/api/v1/reminders/${staffATargetRem.id}/dismiss`, {
      method: 'POST',
      headers: { Cookie: staffBCookie },
    });
    assert(staffBDismissARes.status === 403, 'Staff B blocked (403) from dismissing Staff A reminder');

    // 7. Manual reminder creation + dismissal + case counts check
    const manualRes = await fetch(`${baseUrl}/api/v1/reminders`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: staffACookie },
      body: JSON.stringify({
        userId: staffAId,
        sourceType: 'hearing',
        sourceId: hearing1.id,
        title: 'Bring 2 photocopies of Plaint',
        remindAt: new Date().toISOString(),
        dueAt: in12hIso,
        channel: 'in_app',
      }),
    });
    assert(manualRes.status === 201, 'Staff A can create own manual reminder on visible hearing');
    const manualRem = await manualRes.json();

    const countsBefore = await (
      await fetch(`${baseUrl}/api/v1/cases/${normalCase.id}/counts`, { headers: { Cookie: ownerCookie } })
    ).json();
    assert(
      countsBefore.remindersCount >= 4,
      `GET /cases/:id/counts reports real active remindersCount (got ${countsBefore.remindersCount})`
    );

    const dismissManualRes = await fetch(`${baseUrl}/api/v1/reminders/${manualRem.id}/dismiss`, {
      method: 'POST',
      headers: { Cookie: staffACookie },
    });
    assert(dismissManualRes.status === 200, 'Staff A dismisses own manual reminder');
    assert((await dismissManualRes.json()).status === 'dismissed', 'Dismissed status updated');

    // 8. Calendar Aggregation & Cause List + Restricted filtering + Dhaka TZ
    const calAllRes = await fetch(`${baseUrl}/api/v1/calendar`, { headers: { Cookie: ownerCookie } });
    assert(calAllRes.status === 200, 'GET /api/v1/calendar succeeds');
    const calAll = (await calAllRes.json()) as any[];
    assert(
      calAll.some((e) => e.type === 'hearing' && e.sourceId === hearing1.id) &&
        calAll.some((e) => e.type === 'task' && e.sourceId === task1.id) &&
        calAll.some((e) => e.type === 'file_return' && e.sourceId === file1.id) &&
        calAll.some((e) => e.type === 'appointment' && e.sourceId === appt1.id),
      'Calendar aggregates hearings, tasks, file returns, and appointments'
    );
    assert(
      calAll.some((e) => e.sourceId === secretHearing.id),
      'Owner calendar includes restricted case hearing'
    );

    const staffACalRes = await fetch(`${baseUrl}/api/v1/calendar`, { headers: { Cookie: staffACookie } });
    const staffACal = (await staffACalRes.json()) as any[];
    assert(
      !staffACal.some((e) => e.sourceId === secretHearing.id),
      'Calendar excludes restricted case hearing for Staff without restricted.view'
    );

    // Cause list for hearing1's Dhaka day
    // Create a hearing right after UTC midnight (e.g., 18:30Z -> next day 00:30 BST in Asia/Dhaka)
    const dhakaMidnightHearingRes = await fetch(`${baseUrl}/api/v1/hearings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: ownerCookie },
      body: JSON.stringify({
        caseId: normalCase.id,
        scheduledAt: '2026-12-20T18:30:00.000Z', // 2026-12-21 00:30 AM in Asia/Dhaka
        purpose: 'Midnight TZ Verification Hearing',
        fixedFor: 'hearing',
      }),
    });
    assert(dhakaMidnightHearingRes.status === 201, 'Dhaka midnight boundary hearing created');

    const causeListRes = await fetch(`${baseUrl}/api/v1/calendar/cause-list?date=2026-12-21`, {
      headers: { Cookie: ownerCookie },
    });
    assert(causeListRes.status === 200, 'GET /api/v1/calendar/cause-list succeeds');
    const causeList = await causeListRes.json();
    assert(causeList.date === '2026-12-21', 'Cause list resolves requested Dhaka date');
    assert(Boolean(causeList.firmName), 'Cause list returns firmName from chamber DB');
    assert(
      causeList.hearings.some((h: any) => h.title.includes('Midnight TZ Verification Hearing')),
      'Cause list maps 18:30Z to next Dhaka day (2026-12-21)'
    );

    // 9. Automatic Lifecycle Sync: Hearing Adjourn / Reschedule -> Reminder Updated
    const nextDateIso = new Date(Date.now() + 7 * 86400000).toISOString();
    const adjournRes = await fetch(`${baseUrl}/api/v1/hearings/${hearing1.id}/adjourn`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: ownerCookie },
      body: JSON.stringify({
        nextDate: nextDateIso,
        reason: 'Counsel on leave',
        nextFixedFor: 'hearing',
      }),
    });
    assert(adjournRes.status === 200, 'Hearing adjourn succeeds');
    const remAfterAdjourn = (await (
      await fetch(`${baseUrl}/api/v1/reminders?sourceType=hearing`, { headers: { Cookie: ownerCookie } })
    ).json()) as any[];
    const h1RemAfter = remAfterAdjourn.find((r) => r.sourceId === hearing1.id && r.status === 'pending');
    assert(
      Boolean(h1RemAfter) && h1RemAfter.dueAt === nextDateIso,
      'Adjournment automatically rescheduled hearing reminder dueAt and restored pending status'
    );

    // Task completion automatically dismisses reminder
    const completeTaskRes = await fetch(`${baseUrl}/api/v1/tasks/${task1.id}/complete`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: staffACookie },
      body: JSON.stringify({ note: 'Submitted in court' }),
    });
    assert(completeTaskRes.status === 200, 'Task completed by Staff A');
    const taskRemsAfter = (await (
      await fetch(`${baseUrl}/api/v1/reminders?status=active&sourceType=task`, { headers: { Cookie: ownerCookie } })
    ).json()) as any[];
    assert(!taskRemsAfter.some((r) => r.sourceId === task1.id), 'Completing task auto-dismissed its reminder');

    // Physical file check-in automatically dismisses file_return reminder
    const checkinRes = await fetch(`${baseUrl}/api/v1/physical-files/${file1.id}/check-in`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: ownerCookie },
      body: JSON.stringify({ shelfLocation: 'Rack-C2' }),
    });
    assert(checkinRes.status === 200, 'Physical file checked in');
    const fileRemsAfter = (await (
      await fetch(`${baseUrl}/api/v1/reminders?status=active&sourceType=file_return`, { headers: { Cookie: ownerCookie } })
    ).json()) as any[];
    assert(!fileRemsAfter.some((r) => r.sourceId === file1.id), 'Checking in physical file auto-dismissed return reminder');

    // Appointment cancel automatically dismisses appointment reminder
    const cancelApptRes = await fetch(`${baseUrl}/api/v1/appointments/${appt1.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Cookie: staffACookie },
      body: JSON.stringify({ status: 'cancelled' }),
    });
    assert(cancelApptRes.status === 200, 'Appointment cancelled');
    const apptRemsAfter = (await (
      await fetch(`${baseUrl}/api/v1/reminders?status=active&sourceType=appointment`, { headers: { Cookie: ownerCookie } })
    ).json()) as any[];
    assert(!apptRemsAfter.some((r) => r.sourceId === appt1.id), 'Cancelling appointment auto-dismissed its reminder');

    // 10. Cross-Firm Isolation
    const otherFirmId = 'firm-other-rem-test';
    await db.insertFirm({
      id: otherFirmId,
      firmId: otherFirmId,
      name: 'Other Chamber Reminders',
      status: 'active',
      licenseStartsAt: new Date(),
      licenseExpiresAt: new Date(Date.now() + 86400000 * 30),
    });
    await db.insertUser({
      id: 'user-other-rem-test',
      firmId: otherFirmId,
      name: 'Rival Advocate',
      email: 'rival.rem@firm.bd',
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
    const rivalLogin = await fetch(`${baseUrl}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'rival.rem@firm.bd', password: 'StaffPass123!' }),
    });
    const rivalCookie = `access_token=${extractToken(rivalLogin)}`;

    const rivalRemList = (await (
      await fetch(`${baseUrl}/api/v1/reminders`, { headers: { Cookie: rivalCookie } })
    ).json()) as any[];
    assert(rivalRemList.length === 0, 'Cross-firm GET /reminders sees 0 records from another chamber');

    const rivalDismissRes = await fetch(`${baseUrl}/api/v1/reminders/${h1RemAfter.id}/dismiss`, {
      method: 'POST',
      headers: { Cookie: rivalCookie },
    });
    assert(rivalDismissRes.status === 404, 'Cross-firm dismiss returns 404');

    // 11. Subscription Read-Only Enforcement
    await db.updateFirm(firmId, {
      status: 'expired',
      licenseExpiresAt: new Date(Date.now() - 30 * 86400000),
    });
    const roSyncRes = await fetch(`${baseUrl}/api/v1/reminders/sync`, {
      method: 'POST',
      headers: { Cookie: ownerCookie },
    });
    assert(roSyncRes.status === 403, 'POST /reminders/sync blocked (403) in read-only mode');
    assert((await roSyncRes.json()).code === 'SUBSCRIPTION_READ_ONLY', 'Code is SUBSCRIPTION_READ_ONLY');

    const roCalRes = await fetch(`${baseUrl}/api/v1/calendar`, { headers: { Cookie: ownerCookie } });
    assert(roCalRes.status === 200, 'GET /calendar remains accessible in read-only mode');

    // Restore firm status before case delete cascade check
    await db.updateFirm(firmId, {
      status: 'active',
      licenseExpiresAt: new Date(Date.now() + 86400000 * 365),
    });

    // 12. Case soft-delete cascades to reminders & hearings
    const delCaseRes = await fetch(`${baseUrl}/api/v1/cases/${normalCase.id}`, {
      method: 'DELETE',
      headers: { Cookie: ownerCookie },
    });
    assert(delCaseRes.status === 200, 'DELETE /cases/:id soft-deletes normalCase');

    const remAfterCaseDel = (await (
      await fetch(`${baseUrl}/api/v1/reminders?status=active`, { headers: { Cookie: ownerCookie } })
    ).json()) as any[];
    assert(
      !remAfterCaseDel.some((r) => r.sourceId === hearing1.id),
      'Soft-deleting case cascades reminder cleanup'
    );
  } finally {
    server.close();
  }

  console.log(`\n========================================`);
  console.log(`REMINDERS & CALENDAR BACKEND TEST RESULTS: ${passed} PASSED, ${failed} FAILED`);
  console.log(`========================================\n`);

  if (failed > 0) {
    process.exit(1);
  }
}

runTests().catch((err) => {
  console.error('Unhandled test runner error:', err);
  process.exit(1);
});
