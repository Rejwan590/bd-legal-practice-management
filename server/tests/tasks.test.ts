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
  console.log('--- STARTING BACKEND TASKS MODULE TEST SUITE ---');
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

    const meRes = await fetch(`${baseUrl}/auth/me`, {
      headers: { Cookie: ownerCookie },
    });
    const meJson = await meRes.json();
    const firmId = meJson.user.firmId; // 'firm-bd-001'
    const ownerId = meJson.user.id;

    // Create staff without tasks.assign
    const passwordHash = await bcrypt.hash('StaffPassword123!', 10);
    const staffNoAssignId = 'staff-no-assign-001';
    await db.insertUser({
      id: staffNoAssignId,
      firmId,
      name: 'Clerk Without Assign',
      email: 'clerk.noassign@firm.bd',
      passwordHash,
      role: 'Staff',
      jobType: 'clerk',
      jobTitleLabel: 'Clerk',
      reportsToUserId: null,
      permissions: ['tasks.view', 'tasks.complete'],
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

    const staffRes = await fetch(`${baseUrl}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'clerk.noassign@firm.bd', password: 'StaffPassword123!' }),
    });
    const staffToken = extractToken(staffRes);
    const staffCookie = `access_token=${staffToken}`;

    // Create a client and case for linking
    const client = await db.insertClient({
      id: 'client-task-test-001',
      firmId,
      name: 'Task Test Client',
      nameBn: 'টাস্ক ক্লায়েন্ট',
      phone: '01711000099',
      email: 'taskclient@example.com',
      address: 'Dhaka',
      notes: null,
      archived: false,
      createdAt: new Date(),
      updatedAt: new Date(),
      deletedAt: null,
      createdBy: ownerId,
      updatedBy: ownerId,
    });

    const testCase = await db.insertCase({
      id: 'case-task-test-001',
      firmId,
      clientId: client.id,
      fileSerial: 'F-TASK-001',
      caseNumber: 'WP 9999/2026',
      court: 'High Court Division',
      matterType: 'Writ Petition',
      description: 'Task testing case',
      plaintiff: 'Petitioner',
      defendant: 'Respondent',
      ourRole: 'Petitioner',
      plaintiffLawyer: null,
      defendantLawyer: null,
      responsibleLawyerId: ownerId,
      status: 'ongoing',
      caseDate: new Date(),
      closedOn: null,
      caseCategory: 'civil',
      partyARole: 'Petitioner',
      partyBRole: 'Respondent',
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

    // --- Section 1: Task Creation ---
    console.log('\n--- 1. Task Creation & Permissions ---');
    const futureDue = new Date(Date.now() + 86400000 * 3).toISOString();

    // Staff without tasks.assign attempting to create task gets 403
    const staffCreateRes = await fetch(`${baseUrl}/api/v1/tasks`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: staffCookie },
      body: JSON.stringify({
        title: 'Unauthorized Task',
        assignedTo: staffNoAssignId,
        dueAt: futureDue,
        priority: 'normal',
      }),
    });
    assert(staffCreateRes.status === 403, 'Staff without tasks.assign cannot create tasks (HTTP 403)');

    // Invalid assignee rejected with 400
    const invalidAssigneeRes = await fetch(`${baseUrl}/api/v1/tasks`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: ownerCookie },
      body: JSON.stringify({
        title: 'Task with bad assignee',
        assignedTo: 'non-existent-user-id',
        dueAt: futureDue,
        priority: 'high',
      }),
    });
    assert(invalidAssigneeRes.status === 400, 'Creation with non-existent assignee returns 400');

    // Owner creates task 1 assigned to staff
    const createRes1 = await fetch(`${baseUrl}/api/v1/tasks`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: ownerCookie },
      body: JSON.stringify({
        title: 'Draft Vakalatnama and Petition',
        description: 'Prepare initial petition draft for High Court',
        assignedTo: staffNoAssignId,
        dueAt: futureDue,
        priority: 'high',
        caseId: testCase.id,
        clientId: client.id,
      }),
    });
    assert(createRes1.status === 201, 'Owner creates task successfully (HTTP 201)');
    const task1 = await createRes1.json();
    assert(task1.title === 'Draft Vakalatnama and Petition', 'Created task title matches');
    assert(task1.priority === 'high', 'Created task priority is high');
    assert(task1.status === 'pending', 'Created task status is pending');
    assert(task1.assignedTo === staffNoAssignId, 'Created task assigned to staff');
    assert(task1.assignedToName === 'Clerk Without Assign', 'Created task assignedToName resolved');

    // Owner creates task 2 assigned to Owner
    const createRes2 = await fetch(`${baseUrl}/api/v1/tasks`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: ownerCookie },
      body: JSON.stringify({
        title: 'Senior Advocate Review',
        description: 'Review final petition',
        assignedTo: ownerId,
        dueAt: futureDue,
        priority: 'urgent',
        caseId: testCase.id,
      }),
    });
    assert(createRes2.status === 201, 'Owner creates second task');
    const task2 = await createRes2.json();

    // --- Section 2: Task Listing & Filtering ---
    console.log('\n--- 2. Task Listing & Filters ---');
    const listRes = await fetch(`${baseUrl}/api/v1/tasks`, {
      headers: { Cookie: ownerCookie },
    });
    assert(listRes.status === 200, 'GET /api/v1/tasks returns HTTP 200');
    const listJson = await listRes.json();
    assert(Array.isArray(listJson.tasks), 'List response contains tasks array');
    assert(listJson.total >= 2, 'Total task count is at least 2');

    // Filter by priority
    const filterPriorityRes = await fetch(`${baseUrl}/api/v1/tasks?priority=urgent`, {
      headers: { Cookie: ownerCookie },
    });
    const filterPriorityJson = await filterPriorityRes.json();
    assert(
      filterPriorityJson.tasks.every((t: any) => t.priority === 'urgent'),
      'Filter by priority=urgent returns only urgent tasks'
    );

    // Filter by search
    const searchRes = await fetch(`${baseUrl}/api/v1/tasks?search=Vakalatnama`, {
      headers: { Cookie: ownerCookie },
    });
    const searchJson = await searchRes.json();
    assert(
      searchJson.tasks.some((t: any) => t.id === task1.id),
      'Search query finds task by title'
    );

    // Direct GET /:id
    const getRes = await fetch(`${baseUrl}/api/v1/tasks/${task1.id}`, {
      headers: { Cookie: ownerCookie },
    });
    assert(getRes.status === 200, 'GET /api/v1/tasks/:id returns HTTP 200');
    const getJson = await getRes.json();
    assert(getJson.id === task1.id, 'Fetched task matches requested ID');

    // --- Section 3: Staff Partitioning Invariant ---
    console.log('\n--- 3. Staff Partitioning Invariant ---');
    // Staff without tasks.assign calling GET /tasks only sees tasks assigned to them
    const staffListRes = await fetch(`${baseUrl}/api/v1/tasks`, {
      headers: { Cookie: staffCookie },
    });
    assert(staffListRes.status === 200, 'Staff GET /api/v1/tasks returns HTTP 200');
    const staffListJson = await staffListRes.json();
    const staffTaskIds = staffListJson.tasks.map((t: any) => t.id);
    assert(staffTaskIds.includes(task1.id), 'Staff sees task assigned to them');
    assert(!staffTaskIds.includes(task2.id), 'Staff does NOT see task assigned to another user');

    // Staff direct GET on task assigned to another user returns 404 (or hidden)
    const staffGetOtherRes = await fetch(`${baseUrl}/api/v1/tasks/${task2.id}`, {
      headers: { Cookie: staffCookie },
    });
    assert(staffGetOtherRes.status === 404, 'Staff cannot fetch task assigned to another user (HTTP 404)');

    // --- Section 4: Central Case Visibility & Restricted Matters ---
    console.log('\n--- 4. Central Case Visibility & Restricted Matters ---');
    // Create confidential case
    const restrictedCase = await db.insertCase({
      id: 'case-confidential-001',
      firmId,
      clientId: client.id,
      fileSerial: 'F-CONF-001',
      caseNumber: 'CR 123/2026',
      court: 'Metropolitan Sessions Court',
      matterType: 'Confidential Criminal',
      description: 'Confidential matter',
      plaintiff: 'State',
      defendant: 'VIP Client',
      ourRole: 'Defence counsel',
      plaintiffLawyer: null,
      defendantLawyer: null,
      responsibleLawyerId: ownerId,
      status: 'ongoing',
      caseDate: new Date(),
      closedOn: null,
      caseCategory: 'criminal_gr',
      partyARole: 'State',
      partyBRole: 'VIP Client',
      policeStation: 'Gulshan',
      sectionsOfLaw: '302',
      restricted: true,
      nextHearingAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      deletedAt: null,
      createdBy: ownerId,
      updatedBy: ownerId,
    });

    // Create task linked to restricted case
    const restrictedTask = await db.insertTask({
      firmId,
      caseId: restrictedCase.id,
      clientId: client.id,
      assignedTo: staffNoAssignId, // even if assigned to staff, restricted case hides it if staff lacks restricted.view
      title: 'Confidential Case Filing',
      description: 'Strictly confidential',
      priority: 'urgent',
      dueAt: new Date(Date.now() + 86400000),
      status: 'pending',
      completedAt: null,
      createdBy: ownerId,
      updatedBy: ownerId,
    });

    // Staff without restricted.view gets 404 on task linked to restricted case
    const staffGetRestrictedRes = await fetch(`${baseUrl}/api/v1/tasks/${restrictedTask.id}`, {
      headers: { Cookie: staffCookie },
    });
    assert(staffGetRestrictedRes.status === 404, 'Staff without restricted.view cannot access restricted case task (HTTP 404)');

    // Owner can access restricted task
    const ownerGetRestrictedRes = await fetch(`${baseUrl}/api/v1/tasks/${restrictedTask.id}`, {
      headers: { Cookie: ownerCookie },
    });
    assert(ownerGetRestrictedRes.status === 200, 'Owner can access restricted task (HTTP 200)');

    // --- Section 5: Task Completion & Reopening ---
    console.log('\n--- 5. Task Completion & Reopening ---');
    // Staff can complete their own task with note
    const completeRes = await fetch(`${baseUrl}/api/v1/tasks/${task1.id}/complete`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: staffCookie },
      body: JSON.stringify({ note: 'Filed petition in court room 12' }),
    });
    assert(completeRes.status === 200, 'Staff completes their own task (HTTP 200)');
    const completedTask = await completeRes.json();
    assert(completedTask.status === 'completed', 'Task status transitioned to completed');
    assert(Boolean(completedTask.completedAt), 'completedAt timestamp is recorded');
    assert(completedTask.description.includes('Filed petition in court room 12'), 'Completion note appended to description');

    // Staff cannot complete someone else's task
    const staffCompleteOtherRes = await fetch(`${baseUrl}/api/v1/tasks/${task2.id}/complete`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: staffCookie },
      body: JSON.stringify({ note: 'Hacking other task' }),
    });
    assert(staffCompleteOtherRes.status === 404 || staffCompleteOtherRes.status === 403, 'Staff cannot complete another user task');

    // Reopening task via PATCH (status: 'pending')
    const reopenRes = await fetch(`${baseUrl}/api/v1/tasks/${task1.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Cookie: staffCookie },
      body: JSON.stringify({ status: 'pending', completedAt: null }),
    });
    assert(reopenRes.status === 200, 'Staff with tasks.complete can reopen task (HTTP 200)');
    const reopenedTask = await reopenRes.json();
    assert(reopenedTask.status === 'pending', 'Reopened task has status pending');

    // --- Section 6: Task Reassignment ---
    console.log('\n--- 6. Task Reassignment & Audit Trail ---');
    // Reassign task1 from staff to Owner
    const reassignRes = await fetch(`${baseUrl}/api/v1/tasks/${task1.id}/reassign`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: ownerCookie },
      body: JSON.stringify({ newAssignedTo: ownerId, reason: 'Senior advocate taking over matter' }),
    });
    assert(reassignRes.status === 200, 'Owner reassigns task successfully (HTTP 200)');
    const reassignedTask = await reassignRes.json();
    assert(reassignedTask.assignedTo === ownerId, 'Task assignedTo updated to Owner');

    // --- Section 7: Task Deletion ---
    console.log('\n--- 7. Task Soft Deletion ---');
    // Staff cannot delete tasks
    const staffDeleteRes = await fetch(`${baseUrl}/api/v1/tasks/${task1.id}`, {
      method: 'DELETE',
      headers: { Cookie: staffCookie },
    });
    assert(staffDeleteRes.status === 403, 'Staff without tasks.assign cannot delete task (HTTP 403)');

    // Owner deletes task
    const ownerDeleteRes = await fetch(`${baseUrl}/api/v1/tasks/${task1.id}`, {
      method: 'DELETE',
      headers: { Cookie: ownerCookie },
    });
    assert(ownerDeleteRes.status === 200, 'Owner deletes task (HTTP 200)');
    const deleteJson = await ownerDeleteRes.json();
    assert(deleteJson.softDeleted === true, 'Response confirms soft delete');

    // Deleted task returns 404 on get
    const afterDeleteGet = await fetch(`${baseUrl}/api/v1/tasks/${task1.id}`, {
      headers: { Cookie: ownerCookie },
    });
    assert(afterDeleteGet.status === 404, 'Soft-deleted task returns 404 Not Found');

    // --- Section 8: Firm Isolation ---
    console.log('\n--- 8. Firm Isolation ---');
    // Create Firm B Owner
    const firmB = await db.insertFirm({
      id: 'firm-b-task-test',
      firmId: 'firm-b-task-test',
      name: 'Chamber B Law',
      barCouncilReg: null,
      officeAddress: null,
      courtAffiliations: null,
      contact: null,
      maxDevices: 5,
      devicePolicy: 'auto-approve',
      allowOwnerDeviceRemoval: false,
      visibilityMode: 'open',
      planId: 'plan-free',
      licenseStartsAt: new Date(),
      licenseExpiresAt: new Date(Date.now() + 86400000 * 30),
      status: 'active',
      createdAt: new Date(),
      updatedAt: new Date(),
      deletedAt: null,
      createdBy: 'admin',
      updatedBy: 'admin',
    });

    await db.insertUser({
      id: 'owner-firm-b-001',
      firmId: firmB.id,
      name: 'Owner B',
      email: 'owner@firmb.bd',
      passwordHash,
      role: 'Owner',
      jobType: 'lawyer_senior',
      jobTitleLabel: 'Head',
      reportsToUserId: null,
      permissions: ['tasks.view', 'tasks.assign', 'tasks.complete'],
      language: 'en',
      active: true,
      mustChangePassword: false,
      failedLoginAttempts: 0,
      lockedUntil: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      deletedAt: null,
      createdBy: 'admin',
      updatedBy: 'admin',
    });

    const firmBLogin = await fetch(`${baseUrl}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'owner@firmb.bd', password: 'StaffPassword123!' }),
    });
    const firmBToken = extractToken(firmBLogin);
    const firmBCookie = `access_token=${firmBToken}`;

    // Firm B attempting to get Firm A task2 returns 404
    const crossGet = await fetch(`${baseUrl}/api/v1/tasks/${task2.id}`, {
      headers: { Cookie: firmBCookie },
    });
    assert(crossGet.status === 404, 'Firm B querying Firm A task returns 404 Not Found');

    // Firm B attempting to complete Firm A task2 returns 404
    const crossComplete = await fetch(`${baseUrl}/api/v1/tasks/${task2.id}/complete`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: firmBCookie },
      body: JSON.stringify({ note: 'Cross-tenant probe' }),
    });
    assert(crossComplete.status === 404, 'Firm B completing Firm A task returns 404 Not Found');

    // --- Section 9: Subscription Read-Only Enforcement ---
    console.log('\n--- 9. Subscription Read-Only Enforcement ---');
    // Expire Firm A (past the 5-day grace period)
    await db.updateFirm(firmId, {
      status: 'expired',
      licenseExpiresAt: new Date(Date.now() - 30 * 86400000),
    });

    // Mutating write blocked
    const expiredWrite = await fetch(`${baseUrl}/api/v1/tasks`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: ownerCookie },
      body: JSON.stringify({
        title: 'Task in expired firm',
        assignedTo: ownerId,
        dueAt: futureDue,
        priority: 'normal',
      }),
    });
    assert(expiredWrite.status === 403, 'Mutating task write returns 403 when subscription expired');
    const expiredJson = await expiredWrite.json();
    assert(expiredJson.code === 'SUBSCRIPTION_READ_ONLY', 'Returns error code SUBSCRIPTION_READ_ONLY');

    // Read still succeeds
    const expiredRead = await fetch(`${baseUrl}/api/v1/tasks`, {
      headers: { Cookie: ownerCookie },
    });
    assert(expiredRead.status === 200, 'Reading tasks remains accessible when subscription expired');

    // Restore firm license
    await db.updateFirm(firmId, {
      status: 'active',
      licenseExpiresAt: new Date(Date.now() + 86400000 * 365),
    });

  } finally {
    server.close();
  }

  console.log(`\n========================================`);
  console.log(`TASKS BACKEND TEST RESULTS: ${passed} PASSED, ${failed} FAILED`);
  console.log(`========================================\n`);

  if (failed > 0) {
    process.exit(1);
  }
}

runTests().catch((err) => {
  console.error('Unhandled test runner error:', err);
  process.exit(1);
});
