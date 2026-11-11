import http from 'http';
import { AddressInfo } from 'net';
import {
  RestAuditLogRepository,
  RestFirmRepository,
  RestUserRepository,
  repositories,
} from '../src/data/repositories';
import { runFoundationTests } from '../src/modules/health/tests/foundationTests';
import { runAllHealthDiagnostics } from '../src/modules/health/tests';
import { ALL_PERMISSIONS, DEFAULT_STAFF_PERMISSIONS } from '../src/permissions';
import { FirmRecord, UserRecord } from '../src/data/types';

const REAL_FIRM_ID = 'firm-0beab37b-f44d-4b99-88d9-cc3f58c2e5ff';

function createMockUser(overrides: Partial<UserRecord> = {}): UserRecord {
  const now = new Date().toISOString();
  return {
    id: 'user-real-owner',
    firmId: REAL_FIRM_ID,
    name: 'SOME',
    email: 'some@chamber.bd',
    role: 'Owner',
    permissions: ALL_PERMISSIONS,
    language: 'en',
    active: true,
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
    createdBy: 'system',
    updatedBy: 'system',
    ...overrides,
  };
}

function createMockFirm(): FirmRecord {
  const now = new Date().toISOString();
  return {
    id: REAL_FIRM_ID,
    firmId: REAL_FIRM_ID,
    name: 'SOME & Associates',
    barCouncilReg: 'BC-DHK-2026-001',
    officeAddress: 'Dhaka',
    courtAffiliations: 'Dhaka Judge Court',
    planId: 'chamber',
    maxUsers: 5,
    maxDevices: 5,
    isTrial: false,
    trialStartedAt: null,
    trialDays: null,
    licenseExpiresAt: '2027-12-31T23:59:59.000Z',
    status: 'active',
    visibilityMode: 'open',
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
    createdBy: 'user-real-owner',
    updatedBy: 'user-real-owner',
  };
}

async function runTests() {
  console.log('--- STARTING REST HEALTH DIAGNOSTICS & GATEKEEPING TEST SUITE ---');

  let passed = 0;
  let failed = 0;

  function assert(condition: boolean, name: string, details?: string) {
    if (condition) {
      console.log(`[PASS] ${name}`);
      passed++;
    } else {
      console.error(`[FAIL] ${name}${details ? ` - ${details}` : ''}`);
      failed++;
    }
  }

  let patchFirmHits = 0;
  let getAuditHits = 0;

  const firmData = createMockFirm();
  const usersData: UserRecord[] = [
    createMockUser({ id: 'u1', name: 'SOME', role: 'Owner' }),
    createMockUser({
      id: 'u2',
      name: 'hoga',
      email: 'hoga@chamber.bd',
      role: 'Staff',
      permissions: DEFAULT_STAFF_PERMISSIONS,
    }),
    createMockUser({
      id: 'u-foreign',
      firmId: 'foreign-firm-xyz',
      name: 'Foreign Intruder',
    }),
  ];

  const server = http.createServer((req, res) => {
    const url = req.url || '';
    if (url === '/api/v1/firms/current' && req.method === 'GET') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(firmData));
      return;
    }
    if (url === '/api/v1/firms/current' && req.method === 'PATCH') {
      patchFirmHits++;
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ...firmData, name: 'Malicious Change' }));
      return;
    }
    if (url === '/api/v1/users' && req.method === 'GET') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(usersData));
      return;
    }
    if (url.startsWith('/api/v1/audit-log') && req.method === 'GET') {
      getAuditHits++;
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify([]));
      return;
    }
    res.writeHead(404);
    res.end();
  });

  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const addr = server.address() as AddressInfo;
  const prevBaseUrl = process.env.VITE_API_BASE_URL;
  const prevDataSource = process.env.VITE_DATA_SOURCE;
  process.env.VITE_API_BASE_URL = `http://127.0.0.1:${addr.port}/api/v1`;
  process.env.VITE_DATA_SOURCE = 'rest';

  try {
    const restFirmRepo = new RestFirmRepository();
    const restAuditRepo = new RestAuditLogRepository();
    const restUserRepo = new RestUserRepository();

    const ownerUser = usersData[0];
    const staffUser = usersData[1];
    const foreignUser = createMockUser({ id: 'foreign-user-999', firmId: 'foreign-firm-xyz' });

    // 1. RestFirmRepository.getFirm succeeds for same firm
    const fetchedFirm = await restFirmRepo.getFirm({ currentUser: ownerUser });
    assert(fetchedFirm.id === REAL_FIRM_ID, 'RestFirmRepository.getFirm returns matching firm');

    // 2. RestFirmRepository.getFirm rejects foreign firmId
    let foreignBlocked = false;
    try {
      await restFirmRepo.getFirm({ currentUser: foreignUser });
    } catch {
      foreignBlocked = true;
    }
    assert(foreignBlocked, 'RestFirmRepository.getFirm enforces firmId isolation against foreign tenant');

    // 3. RestFirmRepository.updateFirm blocks Staff without hitting PATCH endpoint
    let staffFirmBlocked = false;
    try {
      await restFirmRepo.updateFirm({ currentUser: staffUser }, { name: 'Malicious Change' });
    } catch {
      staffFirmBlocked = true;
    }
    assert(
      staffFirmBlocked && patchFirmHits === 0,
      'RestFirmRepository.updateFirm blocks Staff in repository layer without sending PATCH request',
      `staffFirmBlocked=${staffFirmBlocked}, patchFirmHits=${patchFirmHits}`
    );

    // 4. RestAuditLogRepository.list blocks Staff without hitting GET /audit-log
    let staffAuditBlocked = false;
    try {
      await restAuditRepo.list({ currentUser: staffUser });
    } catch {
      staffAuditBlocked = true;
    }
    assert(
      staffAuditBlocked && getAuditHits === 0,
      'RestAuditLogRepository.list blocks Staff in repository layer without sending GET request',
      `staffAuditBlocked=${staffAuditBlocked}, getAuditHits=${getAuditHits}`
    );

    // 5. RestUserRepository.list filters out foreign-firm users
    const filteredUsers = await restUserRepo.list({ currentUser: ownerUser });
    assert(
      filteredUsers.length === 2 && filteredUsers.every((u) => u.firmId === REAL_FIRM_ID),
      'RestUserRepository.list filters out users outside caller firmId'
    );

    // 6. Run foundation tests in REST mode with REST repos
    const restRepos = {
      ...repositories,
      firm: restFirmRepo,
      auditLog: restAuditRepo,
      user: restUserRepo,
    };
    const foundationResults = await runFoundationTests({
      repos: restRepos,
      ownerUser,
      staffUser,
      ownerCtx: { currentUser: ownerUser },
      staffCtx: { currentUser: staffUser },
    });

    for (const r of foundationResults) {
      assert(r.passed, `Foundation REST check [${r.id}]: ${r.name}`, r.message);
    }
    assert(
      patchFirmHits === 0 && getAuditHits === 0,
      'Foundation diagnostics sent zero unauthorized write/audit requests to backend',
      `patchFirmHits=${patchFirmHits}, getAuditHits=${getAuditHits}`
    );

    // 7. Verify runAllHealthDiagnostics in REST mode uses passed currentUser/currentFirm
    const origRepos = {
      firm: repositories.firm,
      auditLog: repositories.auditLog,
      user: repositories.user,
    };
    repositories.firm = restFirmRepo;
    repositories.auditLog = restAuditRepo;
    repositories.user = restUserRepo;
    try {
      const fullRestResults = await runAllHealthDiagnostics({
        currentUser: ownerUser,
        currentFirm: firmData,
      });
      assert(
        fullRestResults.length === 9 && fullRestResults.every((r) => r.passed),
        'runAllHealthDiagnostics passes all 9 checks in REST mode',
        `passed=${fullRestResults.filter((r) => r.passed).length}/${fullRestResults.length}`
      );
    } finally {
      repositories.firm = origRepos.firm;
      repositories.auditLog = origRepos.auditLog;
      repositories.user = origRepos.user;
    }
  } finally {
    if (prevBaseUrl === undefined) delete process.env.VITE_API_BASE_URL;
    else process.env.VITE_API_BASE_URL = prevBaseUrl;
    if (prevDataSource === undefined) delete process.env.VITE_DATA_SOURCE;
    else process.env.VITE_DATA_SOURCE = prevDataSource;
    server.close();
  }

  console.log(`\n========================================`);
  console.log(`REST HEALTH DIAGNOSTICS TESTS: ${passed} PASSED, ${failed} FAILED`);
  console.log(`========================================\n`);

  if (failed > 0) {
    process.exit(1);
  }
}

runTests().catch((err) => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
