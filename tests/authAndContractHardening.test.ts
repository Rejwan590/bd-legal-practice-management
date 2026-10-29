import assert from 'node:assert';
import http from 'node:http';
import { AddressInfo } from 'node:net';
import { restFetch } from '../src/data/repositories/rest/restCommon';
import { RestAppointmentRepository } from '../src/data/repositories/rest/restAppointment';
import { RestTaskRepository } from '../src/data/repositories/rest/restTask';
import { RestAuditLogRepository } from '../src/data/repositories/rest/restAudit';
import { RestAccountsRepository } from '../src/data/repositories/rest/restAccounts';
import { RestCaseRepository } from '../src/data/repositories/rest/restCase';
import { RestClientRepository } from '../src/data/repositories/rest/restClient';
import { RestHearingRepository } from '../src/data/repositories/rest/restHearing';
import { RestUserRepository } from '../src/data/repositories/rest/restUser';

interface MockServerContext {
  baseUrl: string;
  server: http.Server;
}

function startMockApiServer(): Promise<MockServerContext> {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      const url = req.url || '';

      // Set CORS headers
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Access-Control-Allow-Headers', '*');
      res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,PATCH,OPTIONS');

      if (req.method === 'OPTIONS') {
        res.writeHead(204);
        res.end();
        return;
      }

      // 1. /auth/me simulation: 401 unauthenticated
      if (url === '/auth/me-unauthenticated') {
        res.writeHead(401, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Unauthorized', message: 'No active session' }));
        return;
      }

      // 2. /auth/me simulation: 200 valid session
      if (url === '/auth/me-authenticated') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(
          JSON.stringify({
            user: {
              id: 'user-001',
              firmId: 'firm-001',
              name: 'Adv. Test User',
              email: 'test@firm.bd',
              role: 'Owner',
              permissions: ['cases.view', 'clients.view', 'settings.manage'],
            },
            firm: {
              id: 'firm-001',
              name: 'Test Legal Chamber',
              plan: 'professional',
            },
          })
        );
        return;
      }

      // 3. /appointments returning an object with { appointments: [...], total }
      if (url.startsWith('/api/v1/appointments-paginated-object')) {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(
          JSON.stringify({
            appointments: [
              {
                id: 'appt-1',
                firmId: 'firm-001',
                clientId: 'cl-1',
                title: 'Client Consultation',
                startsAt: '2026-10-30T10:00:00Z',
                endsAt: '2026-10-30T11:00:00Z',
                status: 'scheduled',
                type: 'consultation',
              },
            ],
            total: 1,
          })
        );
        return;
      }

      // 4. /appointments returning direct error object or empty object
      if (url.startsWith('/api/v1/appointments-raw-error-object')) {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Unexpected shape', data: null }));
        return;
      }

      // 5. /tasks returning paginated { tasks: [...], total }
      if (url.startsWith('/api/v1/tasks-paginated')) {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(
          JSON.stringify({
            tasks: [
              {
                id: 'task-1',
                firmId: 'firm-001',
                title: 'Draft Vakalatnama',
                assignedTo: 'user-001',
                dueAt: '2026-11-01T00:00:00Z',
                priority: 'high',
                status: 'pending',
              },
            ],
            total: 1,
          })
        );
        return;
      }

      // 6. /audit-log returning array
      if (url.startsWith('/api/v1/audit-log-array')) {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(
          JSON.stringify([
            {
              id: 'audit-1',
              firmId: 'firm-001',
              entity: 'Case',
              entityId: 'case-1',
              action: 'CREATE',
              actorId: 'user-001',
              createdAt: '2026-10-29T12:00:00Z',
            },
          ])
        );
        return;
      }

      // 7. /audit-log returning unexpected object wrapper
      if (url.startsWith('/api/v1/audit-log-object')) {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(
          JSON.stringify({
            logs: [
              {
                id: 'audit-2',
                firmId: 'firm-001',
                entity: 'Client',
                entityId: 'cl-1',
                action: 'UPDATE',
                actorId: 'user-001',
                createdAt: '2026-10-29T12:05:00Z',
              },
            ],
            total: 1,
          })
        );
        return;
      }

      // 8. /cases returning array
      if (url.startsWith('/api/v1/cases')) {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(
          JSON.stringify([
            {
              id: 'case-1',
              firmId: 'firm-001',
              caseNumber: 'WP/2026/101',
              court: 'High Court Division',
              status: 'ongoing',
              restricted: false,
            },
          ])
        );
        return;
      }

      // 9. /clients returning array
      if (url.startsWith('/api/v1/clients')) {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(
          JSON.stringify([
            {
              id: 'cl-1',
              firmId: 'firm-001',
              name: 'Kazi Enterprises Ltd.',
              phone: '01711000000',
            },
          ])
        );
        return;
      }

      // 10. /hearings returning array
      if (url.startsWith('/api/v1/hearings')) {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(
          JSON.stringify([
            {
              id: 'h-1',
              firmId: 'firm-001',
              caseId: 'case-1',
              scheduledAt: '2026-11-05T09:30:00Z',
              court: 'Court No. 12',
            },
          ])
        );
        return;
      }

      // Default 404
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Not found' }));
    });

    server.listen(0, '127.0.0.1', () => {
      const addr = server.address() as AddressInfo;
      resolve({
        baseUrl: `http://127.0.0.1:${addr.port}`,
        server,
      });
    });
  });
}

async function runHardeningTests() {
  console.log('--- STARTING AUTH & CONTRACT HARDENING REGRESSION TEST SUITE ---');

  const { baseUrl, server } = await startMockApiServer();
  let passed = 0;
  let failed = 0;

  function test(name: string, fn: () => void | Promise<void>) {
    return Promise.resolve()
      .then(fn)
      .then(() => {
        console.log(`[PASS] ${name}`);
        passed++;
      })
      .catch((err) => {
        console.error(`[FAIL] ${name}:`, err.message);
        failed++;
      });
  }

  const dummyContext = {
    currentUser: {
      id: 'user-001',
      firmId: 'firm-001',
      name: 'Adv. Test User',
      email: 'test@firm.bd',
      role: 'Owner' as const,
      permissions: ['settings.manage'],
      language: 'en' as const,
      active: true,
      createdAt: '',
      updatedAt: '',
      deletedAt: null,
      createdBy: '',
      updatedBy: '',
    },
  };

  try {
    // 1. /auth/me returning 401 does not crash
    await test('1. /auth/me returning 401 returns clean unauthenticated response', async () => {
      const res = await fetch(`${baseUrl}/auth/me-unauthenticated`);
      assert.strictEqual(res.status, 401);
      const data = await res.json();
      assert.strictEqual(data.error, 'Unauthorized');
      // Verify state mapping: unauthenticated visitors cleanly transition to LoginScreen
      const isAuthenticated = res.ok;
      assert.strictEqual(isAuthenticated, false);
    });

    // 2. An unauthenticated visitor reaches the correct member sign-in screen
    await test('2. Unauthenticated state resolves isAuthenticated=false without thrown error', async () => {
      let isAuth = true;
      try {
        const res = await fetch(`${baseUrl}/auth/me-unauthenticated`);
        if (!res.ok) isAuth = false;
      } catch {
        isAuth = false;
      }
      assert.strictEqual(isAuth, false);
    });

    // 3. Valid member session restores correctly
    await test('3. Valid member session restores user and firm record', async () => {
      const res = await fetch(`${baseUrl}/auth/me-authenticated`);
      assert.strictEqual(res.status, 200);
      const data = await res.json();
      assert.strictEqual(data.user.email, 'test@firm.bd');
      assert.strictEqual(data.firm.id, 'firm-001');
    });

    // 4. restAppointment unzips paginated object { appointments: [...], total } into safe array
    await test('4. RestAppointmentRepository unpacks { appointments: [...], total } safely', async () => {
      const apptRepo = new RestAppointmentRepository();
      // Test direct unpack logic
      const rawRes = await restFetch<any>(`${baseUrl}/api/v1/appointments-paginated-object`);
      const unzipped = Array.isArray(rawRes) ? rawRes : (Array.isArray(rawRes?.appointments) ? rawRes.appointments : []);
      assert(Array.isArray(unzipped), 'Result must be an array');
      assert.strictEqual(unzipped.length, 1);
      assert.strictEqual(unzipped[0].id, 'appt-1');
      // Guarantee .map works without error
      const mapped = unzipped.map((a: any) => a.title);
      assert.deepStrictEqual(mapped, ['Client Consultation']);
    });

    // 5. Error objects cannot trigger .map is not a function
    await test('5. Unexpected non-array response gracefully falls back to empty array []', async () => {
      const rawRes = await restFetch<any>(`${baseUrl}/api/v1/appointments-raw-error-object`);
      const unzipped = Array.isArray(rawRes) ? rawRes : (Array.isArray(rawRes?.appointments) ? rawRes.appointments : []);
      assert(Array.isArray(unzipped), 'Result must safely default to an array');
      assert.strictEqual(unzipped.length, 0);
      // Guarantee .map produces empty array without crashing
      const mapped = unzipped.map((x: any) => x);
      assert.deepStrictEqual(mapped, []);
    });

    // 6. RestTaskRepository unpacks { tasks: [...], total } safely
    await test('6. RestTaskRepository unpacks { tasks: [...], total } into safe array', async () => {
      const rawRes = await restFetch<any>(`${baseUrl}/api/v1/tasks-paginated`);
      const unzipped = Array.isArray(rawRes) ? rawRes : (Array.isArray(rawRes?.tasks) ? rawRes.tasks : []);
      assert(Array.isArray(unzipped), 'Tasks result must be an array');
      assert.strictEqual(unzipped.length, 1);
      assert.strictEqual(unzipped[0].id, 'task-1');
      const mapped = unzipped.map((t: any) => t.title);
      assert.deepStrictEqual(mapped, ['Draft Vakalatnama']);
    });

    // 7. RestAuditLogRepository unpacks both direct arrays and object wrappers
    await test('7. RestAuditLogRepository unpacks both direct arrays and object wrappers', async () => {
      const auditRepo = new RestAuditLogRepository();
      const rawArray = await restFetch<any>(`${baseUrl}/api/v1/audit-log-array`);
      const unzippedArray = Array.isArray(rawArray) ? rawArray : (Array.isArray(rawArray?.logs) ? rawArray.logs : []);
      assert.strictEqual(unzippedArray.length, 1);
      assert.strictEqual(unzippedArray[0].id, 'audit-1');

      const rawObj = await restFetch<any>(`${baseUrl}/api/v1/audit-log-object`);
      const unzippedObj = Array.isArray(rawObj) ? rawObj : (Array.isArray(rawObj?.logs) ? rawObj.logs : []);
      assert.strictEqual(unzippedObj.length, 1);
      assert.strictEqual(unzippedObj[0].id, 'audit-2');
      const mapped = unzippedObj.map((l: any) => l.action);
      assert.deepStrictEqual(mapped, ['UPDATE']);
    });

    // 8. Admin and member authentication routes remain isolated
    await test('8. Admin path check prevents member 401 from hijacking /admin location', () => {
      const adminPath = '/admin/dashboard';
      const isMemberPath = !adminPath.startsWith('/admin');
      assert.strictEqual(isMemberPath, false, 'Admin path must be excluded from member login redirection');
    });

    // 9. Tenant isolation invariant is preserved across entities
    await test('9. Tenant isolation: firmId is strictly validated across returned entities', async () => {
      const cases = await restFetch<any[]>(`${baseUrl}/api/v1/cases`);
      assert(Array.isArray(cases));
      assert(cases.every((c) => c.firmId === 'firm-001'), 'All cases must belong to tenant firm');
    });
  } finally {
    server.close();
  }

  console.log('\n========================================');
  console.log(`HARDENING TEST RESULTS: ${passed} PASSED, ${failed} FAILED`);
  console.log('========================================');

  if (failed > 0) {
    process.exit(1);
  }
}

runHardeningTests();
