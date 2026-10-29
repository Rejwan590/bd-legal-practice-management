process.env.JWT_SECRET = 'test_jwt_secret_key_at_least_32_chars_long_1234567890';
process.env.ADMIN_JWT_SECRET = 'test_admin_jwt_secret_key_at_least_32_chars_9876543210';

import http from 'http';
import { createApp } from '../src/app.js';
import { getDatabase } from '../src/db/client.js';
import { SEED_PASSWORDS, ALL_PERMISSIONS } from '../src/db/seed.js';

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

function extractCookie(res: Response): string {
  const token = extractToken(res);
  return token ? `access_token=${token}` : '';
}

async function runTests() {
  console.log('--- STARTING BACKEND APPOINTMENTS TEST SUITE ---');
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
    const ownerCookie = extractCookie(ownerRes);
    assert(ownerRes.status === 200 && Boolean(ownerCookie), 'Owner logs in successfully');

    // Authenticate Staff
    const staffRes = await fetch(`${baseUrl}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'staff@firm.bd', password: SEED_PASSWORDS.staff }),
    });
    const staffCookie = extractCookie(staffRes);
    assert(staffRes.status === 200 && Boolean(staffCookie), 'Staff logs in successfully');

    // 1. Validation checks on creation
    const resNoTitle = await fetch(`${baseUrl}/api/v1/appointments`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: ownerCookie },
      body: JSON.stringify({
        title: '',
        type: 'consultation',
        startsAt: new Date(Date.now() + 3600000).toISOString(),
        endsAt: new Date(Date.now() + 7200000).toISOString(),
      }),
    });
    assert(resNoTitle.status === 400, 'Creation rejects empty title with HTTP 400');

    const resBadType = await fetch(`${baseUrl}/api/v1/appointments`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: ownerCookie },
      body: JSON.stringify({
        title: 'Meeting',
        type: 'invalid_type',
        startsAt: new Date(Date.now() + 3600000).toISOString(),
        endsAt: new Date(Date.now() + 7200000).toISOString(),
      }),
    });
    assert(resBadType.status === 400, 'Creation rejects invalid appointment type with HTTP 400');

    const resEndBeforeStart = await fetch(`${baseUrl}/api/v1/appointments`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: ownerCookie },
      body: JSON.stringify({
        title: 'Meeting',
        type: 'consultation',
        startsAt: new Date(Date.now() + 7200000).toISOString(),
        endsAt: new Date(Date.now() + 3600000).toISOString(),
      }),
    });
    assert(resEndBeforeStart.status === 400, 'Creation rejects endsAt <= startsAt with HTTP 400');

    // 2. Successful creation
    const start1 = new Date(Date.now() + 24 * 3600 * 1000);
    const end1 = new Date(start1.getTime() + 3600 * 1000);

    const resCreate = await fetch(`${baseUrl}/api/v1/appointments`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: ownerCookie },
      body: JSON.stringify({
        title: 'Initial Consultation with New Client',
        type: 'consultation',
        mode: 'in_person',
        location: 'Chamber Room 402',
        startsAt: start1.toISOString(),
        endsAt: end1.toISOString(),
        notes: 'Review land deed documents and civil petition.',
        attendeeUserIds: ['user-staff-002'],
      }),
    });
    assert(resCreate.status === 201, 'Appointment created with HTTP 201');
    const createdAppt = await resCreate.json();
    assert(createdAppt.title === 'Initial Consultation with New Client', 'Created appointment matches title');
    assert(createdAppt.hasOverlap === false, 'First appointment has no overlap');

    // 3. Overlap detection
    const resOverlap = await fetch(`${baseUrl}/api/v1/appointments`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: ownerCookie },
      body: JSON.stringify({
        title: 'Conflicting Court Briefing',
        type: 'client_meeting',
        startsAt: new Date(start1.getTime() + 1800 * 1000).toISOString(), // overlapping 30m
        endsAt: new Date(end1.getTime() + 1800 * 1000).toISOString(),
      }),
    });
    assert(resOverlap.status === 201, 'Overlapping appointment is permitted with HTTP 201');
    const overlapData = await resOverlap.json();
    assert(overlapData.hasOverlap === true, 'Overlap flag hasOverlap === true is returned');
    assert(typeof overlapData.warning === 'string', 'Overlap warning message is returned');

    // 4. Listing appointments & structure check
    const resList = await fetch(`${baseUrl}/api/v1/appointments`, {
      headers: { Cookie: ownerCookie },
    });
    assert(resList.status === 200, 'Listing appointments returns HTTP 200');
    const listData = await resList.json();
    assert(Array.isArray(listData.appointments), 'Response contains appointments array');
    assert(typeof listData.total === 'number', 'Response contains total number');
    assert(listData.total >= 2, 'Appointments list includes newly created items');

    // 5. Get by ID
    const resGet = await fetch(`${baseUrl}/api/v1/appointments/${createdAppt.id}`, {
      headers: { Cookie: ownerCookie },
    });
    assert(resGet.status === 200, 'GET /appointments/:id returns HTTP 200');
    const singleAppt = await resGet.json();
    assert(singleAppt.id === createdAppt.id, 'Retrieved appointment has correct ID');

    // 6. Update & Reschedule tracking
    const newStart = new Date(start1.getTime() + 48 * 3600 * 1000);
    const newEnd = new Date(newStart.getTime() + 3600 * 1000);

    const resUpdate = await fetch(`${baseUrl}/api/v1/appointments/${createdAppt.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Cookie: ownerCookie },
      body: JSON.stringify({
        startsAt: newStart.toISOString(),
        endsAt: newEnd.toISOString(),
        location: 'Virtual Zoom Room 101',
      }),
    });
    assert(resUpdate.status === 200, 'PATCH /appointments/:id returns HTTP 200');
    const updatedAppt = await resUpdate.json();
    assert(updatedAppt.location === 'Virtual Zoom Room 101', 'Location successfully updated');

    // 7. Audit log verification for appointment
    const resAudit = await fetch(`${baseUrl}/api/v1/audit-log?limit=10`, {
      headers: { Cookie: ownerCookie },
    });
    assert(resAudit.status === 200, 'GET /audit-log returns HTTP 200');
    const auditLogs = await resAudit.json();
    const apptAudits = auditLogs.filter((l: any) => l.entity === 'Appointment' && l.entityId === createdAppt.id);
    assert(apptAudits.length >= 2, 'Audit log recorded CREATE and RESCHEDULE actions for appointment');

    // 8. Soft delete appointment
    const resDelete = await fetch(`${baseUrl}/api/v1/appointments/${overlapData.id}`, {
      method: 'DELETE',
      headers: { Cookie: ownerCookie },
    });
    assert(resDelete.status === 200, 'DELETE /appointments/:id returns HTTP 200');
    const deleteResult = await resDelete.json();
    assert(deleteResult.softDeleted === true, 'Soft deleted flag confirmed');

    // 9. Soft deleted appointment returns 404
    const resGetDeleted = await fetch(`${baseUrl}/api/v1/appointments/${overlapData.id}`, {
      headers: { Cookie: ownerCookie },
    });
    assert(resGetDeleted.status === 404, 'Soft deleted appointment returns 404 Not Found');

    // 10. Read-only subscription blocks mutation
    const pastDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    await db.updateFirm('firm-bd-001', { licenseExpiresAt: pastDate, status: 'expired' });

    const resReadOnlyCreate = await fetch(`${baseUrl}/api/v1/appointments`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: ownerCookie },
      body: JSON.stringify({
        title: 'Blocked Appointment',
        type: 'consultation',
        startsAt: new Date(Date.now() + 3600000).toISOString(),
        endsAt: new Date(Date.now() + 7200000).toISOString(),
      }),
    });
    assert(resReadOnlyCreate.status === 403, 'Subscription expired returns 403 on appointment creation');

    // Reset firm back to active
    const futureDate = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000);
    await db.updateFirm('firm-bd-001', { licenseExpiresAt: futureDate, status: 'active' });
  } catch (err: any) {
    console.error('Unhandled test exception:', err);
    failed++;
  } finally {
    server.close();
  }

  console.log(`\n========================================`);
  console.log(`APPOINTMENTS TEST RESULTS: ${passed} PASSED, ${failed} FAILED`);
  console.log(`========================================\n`);

  if (failed > 0) {
    process.exit(1);
  }
}

runTests();
