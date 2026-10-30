import http from 'http';
import { AddressInfo } from 'net';
import { getDhakaDateString, isSameDhakaDay } from '../src/utils/dateUtils';
import { MockDashboardRepository } from '../src/data/repositories/dashboard';
import { MockCalendarRepository } from '../src/data/repositories/calendar';
import { MockSearchRepository } from '../src/data/repositories/search';
import { RestDashboardRepository } from '../src/data/repositories/rest/restDashboard';
import { RestCalendarRepository } from '../src/data/repositories/rest/restCalendar';
import { RestSearchRepository } from '../src/data/repositories/rest/restSearch';
import { SecurityContext, UserRecord } from '../src/data/types';

let passed = 0;
let failed = 0;

function assert(condition: boolean, message: string) {
  if (condition) {
    console.log(`[PASS] ${message}`);
    passed++;
  } else {
    console.error(`[FAIL] ${message}`);
    failed++;
  }
}

interface MockServer {
  baseUrl: string;
  server: http.Server;
}

function startMockBackendServer(): Promise<MockServer> {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      const url = new URL(req.url || '/', 'http://127.0.0.1');
      res.setHeader('Content-Type', 'application/json');

      if (url.pathname === '/api/v1/cases') {
        res.writeHead(200);
        res.end(
          JSON.stringify([
            { id: 'case-1', firmId: 'firm-1', caseNumber: 'CR-101/2026', court: 'High Court', status: 'ongoing', matterType: 'criminal_cr', clientId: 'client-1' },
            { id: 'case-2', firmId: 'firm-1', caseNumber: 'CS-202/2026', court: 'Joint District Judge', status: 'ongoing', matterType: 'civil', clientId: 'client-2' },
            { id: 'case-3', firmId: 'firm-1', caseNumber: 'WP-303/2025', court: 'High Court', status: 'closed', matterType: 'writ', clientId: 'client-1' },
          ])
        );
        return;
      }

      if (url.pathname === '/api/v1/clients') {
        const q = url.searchParams.get('search')?.toLowerCase();
        const list = [
          { id: 'client-1', firmId: 'firm-1', name: 'Md. Rafiqul Islam', phone: '+8801711000001', archived: false, deletedAt: null },
          { id: 'client-2', firmId: 'firm-1', name: 'Anwara Begum', phone: '+8801711000002', archived: false, deletedAt: null },
          { id: 'client-3', firmId: 'firm-1', name: 'Archived Client Ltd', phone: '+8801711000003', archived: true, deletedAt: null },
          { id: 'client-4', firmId: 'firm-1', name: 'Deleted Client', phone: '+8801711000004', archived: false, deletedAt: '2026-01-01T00:00:00Z' },
        ];
        const filtered = q ? list.filter((c) => c.name.toLowerCase().includes(q)) : list;
        res.writeHead(200);
        res.end(JSON.stringify(filtered));
        return;
      }

      if (url.pathname === '/api/v1/hearings') {
        const todayDhaka = getDhakaDateString(new Date());
        res.writeHead(200);
        res.end(
          JSON.stringify([
            {
              id: 'hearing-1',
              firmId: 'firm-1',
              caseId: 'case-1',
              scheduledAt: `${todayDhaka}T09:30:00.000Z`,
              purpose: 'Hearing on Bail Petition',
              status: 'scheduled',
              deletedAt: null,
            },
            {
              id: 'hearing-2',
              firmId: 'firm-1',
              caseId: 'case-2',
              scheduledAt: `${todayDhaka}T11:00:00.000Z`,
              purpose: 'Framing of Issues',
              status: 'scheduled',
              deletedAt: null,
            },
            {
              id: 'hearing-3',
              firmId: 'firm-1',
              caseId: 'case-1',
              scheduledAt: '2026-12-15T10:00:00.000Z',
              purpose: 'Cross Examination',
              status: 'scheduled',
              deletedAt: null,
            },
          ])
        );
        return;
      }

      if (url.pathname === '/api/v1/tasks') {
        res.writeHead(200);
        res.end(
          JSON.stringify({
            tasks: [
              {
                id: 'task-1',
                firmId: 'firm-1',
                caseId: 'case-1',
                title: 'Draft Bail Application',
                assignedTo: 'user-1',
                status: 'pending',
                priority: 'urgent',
                dueAt: new Date(Date.now() - 86400000).toISOString(), // Overdue by 1 day
                deletedAt: null,
              },
              {
                id: 'task-2',
                firmId: 'firm-1',
                caseId: 'case-2',
                title: 'Collect certified copies',
                assignedTo: 'user-1',
                status: 'in_progress',
                priority: 'normal',
                dueAt: new Date(Date.now() + 86400000 * 3).toISOString(), // Due in 3 days
                deletedAt: null,
              },
              {
                id: 'task-3',
                firmId: 'firm-1',
                caseId: 'case-1',
                title: 'Old completed task',
                assignedTo: 'user-1',
                status: 'completed',
                priority: 'low',
                dueAt: '2026-01-01T10:00:00Z',
                deletedAt: null,
              },
            ],
            total: 3,
          })
        );
        return;
      }

      if (url.pathname === '/api/v1/appointments') {
        const q = url.searchParams.get('search')?.toLowerCase();
        const todayDhaka = getDhakaDateString(new Date());
        const list = [
          {
            id: 'appt-1',
            firmId: 'firm-1',
            caseId: 'case-1',
            title: 'Client Conference on Bail',
            startsAt: `${todayDhaka}T15:00:00.000Z`,
            endsAt: `${todayDhaka}T16:00:00.000Z`,
            status: 'scheduled',
            deletedAt: null,
          },
        ];
        const filtered = q ? list.filter((a) => a.title.toLowerCase().includes(q)) : list;
        res.writeHead(200);
        res.end(
          JSON.stringify({
            appointments: filtered,
            total: filtered.length,
          })
        );
        return;
      }

      res.writeHead(404);
      res.end(JSON.stringify({ error: 'Not Found' }));
    });

    server.listen(0, '127.0.0.1', () => {
      const addr = server.address() as AddressInfo;
      resolve({
        baseUrl: `http://127.0.0.1:${addr.port}/api/v1`,
        server,
      });
    });
  });
}

async function runTests() {
  console.log('--- STARTING DASHBOARD & CALENDAR TEST SUITE ---\n');

  // 1. Timezone utilities tests
  console.log('1. Timezone Utilities (Asia/Dhaka UTC+6)');
  const dhakaNow = getDhakaDateString(new Date());
  assert(/^\d{4}-\d{2}-\d{2}$/.test(dhakaNow), `getDhakaDateString produces YYYY-MM-DD: ${dhakaNow}`);

  // Test across UTC midnight boundary
  // 18:30 UTC on 2026-10-30 is 00:30 on 2026-10-31 in Bangladesh
  const dateAtDhakaMidnight = new Date('2026-10-30T18:30:00.000Z');
  const dhakaNextDay = getDhakaDateString(dateAtDhakaMidnight);
  assert(dhakaNextDay === '2026-10-31', `Correctly maps 18:30 UTC to next day in Dhaka: ${dhakaNextDay}`);

  const isSameDayCheck = isSameDhakaDay('2026-10-30T04:00:00.000Z', '2026-10-30T12:00:00.000Z');
  assert(isSameDayCheck === true, 'isSameDhakaDay identifies same Dhaka day correctly');

  // 2. Dual-mode repository interface compliance
  console.log('\n2. Dual-Mode Repository Parity');
  const mockDash = new MockDashboardRepository();
  const restDash = new RestDashboardRepository();
  assert(typeof mockDash.getMetrics === 'function' && typeof restDash.getMetrics === 'function', 'Both implement getMetrics');
  assert(typeof mockDash.getUrgentItems === 'function' && typeof restDash.getUrgentItems === 'function', 'Both implement getUrgentItems');
  assert(typeof mockDash.getUpcomingHearings === 'function' && typeof restDash.getUpcomingHearings === 'function', 'Both implement getUpcomingHearings');

  const mockCal = new MockCalendarRepository();
  const restCal = new RestCalendarRepository();
  assert(typeof mockCal.getEvents === 'function' && typeof restCal.getEvents === 'function', 'Both implement getEvents');
  assert(typeof mockCal.getDayCauseList === 'function' && typeof restCal.getDayCauseList === 'function', 'Both implement getDayCauseList');

  const mockSearch = new MockSearchRepository();
  const restSearch = new RestSearchRepository();
  assert(typeof mockSearch.search === 'function' && typeof restSearch.search === 'function', 'Both implement search');

  // 3. RestDashboardRepository live data-driven calculations
  console.log('\n3. RestDashboardRepository Live Integration');
  const mockServer = await startMockBackendServer();
  const prevEnv = process.env.VITE_API_BASE_URL;
  process.env.VITE_API_BASE_URL = mockServer.baseUrl;

  try {
    const fakeUser: UserRecord = {
      id: 'user-1',
      firmId: 'firm-1',
      name: 'Adv. Mahbubur Rahman',
      email: 'owner@example.com',
      role: 'Owner',
      active: true,
      language: 'en',
      permissions: ['cases.view', 'clients.view', 'hearings.update', 'tasks.view', 'settings.manage'],
      status: 'active',
      createdAt: '2026-01-01T00:00:00Z',
      updatedAt: '2026-01-01T00:00:00Z',
      deletedAt: null,
      createdBy: 'sys',
      updatedBy: 'sys',
    };
    const context: SecurityContext = { currentUser: fakeUser };

    const metrics = await restDash.getMetrics(context);
    console.log('Calculated Metrics:', JSON.stringify(metrics, null, 2));

    assert(metrics.activeCasesCount === 2, `Active cases count is 2 (2 ongoing, 1 closed): got ${metrics.activeCasesCount}`);
    assert(metrics.totalClientsCount === 2, `Total non-archived non-deleted clients count is 2: got ${metrics.totalClientsCount}`);
    assert(metrics.todayHearingsCount === 2, `Today's hearings count in Dhaka timezone is 2: got ${metrics.todayHearingsCount}`);
    assert(metrics.pendingTasksCount === 2, `Pending tasks count (pending + in_progress) is 2: got ${metrics.pendingTasksCount}`);
    assert(metrics.overdueTasksCount === 1, `Overdue tasks count is 1: got ${metrics.overdueTasksCount}`);
    assert(metrics.todayAppointmentsCount === 1, `Today's appointments count is 1: got ${metrics.todayAppointmentsCount}`);

    // Urgent items
    const urgent = await restDash.getUrgentItems(context);
    assert(urgent.todayHearings.length === 2, `Urgent items includes 2 hearings today: got ${urgent.todayHearings.length}`);
    assert(urgent.overdueTasks.length === 1, `Urgent items includes 1 overdue task: got ${urgent.overdueTasks.length}`);
    assert(urgent.todayAppointments?.length === 1, `Urgent items includes 1 appointment today: got ${urgent.todayAppointments?.length}`);

    // Cause list
    const causeList = await restCal.getDayCauseList(context, new Date().toISOString());
    assert(causeList.hearings.length === 2, `Day cause list returned 2 hearings: got ${causeList.hearings.length}`);
    assert(causeList.hearings[0].caseNumber === 'CR-101/2026', `Cause list hearing enriched with caseNumber: got ${causeList.hearings[0].caseNumber}`);
    assert(causeList.hearings[0].clientName === 'Md. Rafiqul Islam', `Cause list hearing enriched with clientName: got ${causeList.hearings[0].clientName}`);

    // Global Search
    const searchResults = await restSearch.search(context, 'Rafiqul');
    assert(searchResults.length >= 1, `Search found client: got ${searchResults.length}`);
    assert(searchResults[0].title === 'Md. Rafiqul Islam', `Search client name matches: ${searchResults[0].title}`);

    const caseSearchResults = await restSearch.search(context, 'CR-101');
    assert(caseSearchResults.length >= 1, `Search found case: got ${caseSearchResults.length}`);
    assert(caseSearchResults[0].caseNumber === 'CR-101/2026', `Search case number matches: ${caseSearchResults[0].caseNumber}`);
  } finally {
    process.env.VITE_API_BASE_URL = prevEnv;
    mockServer.server.close();
  }

  console.log(`\n========================================`);
  console.log(`DASHBOARD TEST RESULTS: ${passed} PASSED, ${failed} FAILED`);
  console.log(`========================================`);

  if (failed > 0) {
    process.exit(1);
  }
}

runTests().catch((err) => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
