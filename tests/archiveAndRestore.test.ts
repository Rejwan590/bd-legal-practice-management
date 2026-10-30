import assert from 'node:assert';
import { getRepositories } from '../src/data/repositories';
import { INITIAL_USERS } from '../src/data/mockStore';
import { SecurityContext, ClientRecord } from '../src/data/types';

async function runArchiveAndRestoreTests() {
  console.log('--- STARTING ARCHIVE, RESTORE & SOFT-DELETE REGRESSION SUITE ---');
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

  const repos = getRepositories();

  const ownerUser = INITIAL_USERS.find((u) => u.role === 'Owner') || INITIAL_USERS[0];
  const staffUser = INITIAL_USERS.find((u) => u.role === 'Staff') || {
    ...INITIAL_USERS[0],
    id: 'user-staff-no-edit',
    role: 'Staff' as const,
    permissions: ['clients.view'],
  };

  const ownerContext: SecurityContext = { currentUser: ownerUser };
  const staffContext: SecurityContext = { currentUser: staffUser };

  // 1. Create a synthetic client
  let testClient: ClientRecord;
  await test('1. Create a synthetic client for archive & restore verification', async () => {
    testClient = await repos.client.create(ownerContext, {
      name: 'Adv. Test Archive Client',
      nameBn: 'অ্যাডভোকেট টেস্ট আর্কাইভ মক্কেল',
      phone: '+880 1700-112233',
      email: 'test.archive@example.com',
      address: 'Motijheel C/A, Dhaka',
      notes: 'Initial synthetic client for archive lifecycle verification',
    });
    assert.strictEqual(testClient.name, 'Adv. Test Archive Client');
    assert.strictEqual(Boolean(testClient.archived), false);
    assert.strictEqual(testClient.deletedAt, null);
  });

  // 2. Client is initially in the active list
  await test('2. Client is present in the active list by default', async () => {
    const list = await repos.client.list(ownerContext);
    const found = list.find((c) => c.id === testClient.id);
    assert(Boolean(found), 'Newly created client should appear in client list');
    assert.strictEqual(Boolean(found?.archived), false);
  });

  // 3. Archive the client
  await test('3. Archive client using repos.client.archive', async () => {
    const archived = await repos.client.archive(ownerContext, testClient.id);
    assert.strictEqual(archived.archived, true);
  });

  // 4. Verify client is marked archived and filtered out from active list
  await test('4. Client disappears from active filter list and appears in archived filter list', async () => {
    const allClients = await repos.client.list(ownerContext);
    const clientRecord = allClients.find((c) => c.id === testClient.id);
    assert(Boolean(clientRecord), 'Client record must still exist');
    assert.strictEqual(clientRecord?.archived, true);

    // Filter simulation as in ClientsScreen
    const activeClients = allClients.filter((c) => !c.archived);
    const archivedClients = allClients.filter((c) => Boolean(c.archived));

    assert(!activeClients.some((c) => c.id === testClient.id), 'Archived client must NOT appear in active view');
    assert(archivedClients.some((c) => c.id === testClient.id), 'Archived client MUST appear in archived view');
  });

  // 5. Staff without edit permissions cannot restore
  await test('5. Unauthorized restore attempt without clients.edit is rejected', async () => {
    let threw = false;
    try {
      await repos.client.restore(staffContext, testClient.id);
    } catch (err: any) {
      threw = true;
      assert(err.message.includes('Permission denied'), 'Error must specify permission denied');
    }
    assert(threw, 'Restoring without clients.edit must throw an error');
  });

  // 6. Cross-firm isolation on restore
  await test('6. Cross-firm restore attempt is rejected', async () => {
    const foreignContext: SecurityContext = {
      currentUser: {
        ...ownerUser,
        id: 'user-foreign-firm',
        firmId: 'firm-other-foreign-999',
      },
    };
    let threw = false;
    try {
      await repos.client.restore(foreignContext, testClient.id);
    } catch {
      threw = true;
    }
    assert(threw, 'Cross-firm client restore must be rejected');
  });

  // 7. Authorized restore
  await test('7. Authorized Owner restores client to active status', async () => {
    const restored = await repos.client.restore(ownerContext, testClient.id);
    assert.strictEqual(restored.archived, false);
    assert.strictEqual(restored.deletedAt, null);
  });

  // 8. Verify client is back in active list
  await test('8. Restored client appears in active list and leaves archived list', async () => {
    const allClients = await repos.client.list(ownerContext);
    const clientRecord = allClients.find((c) => c.id === testClient.id);
    assert(Boolean(clientRecord));
    assert.strictEqual(clientRecord?.archived, false);

    const activeClients = allClients.filter((c) => !c.archived);
    const archivedClients = allClients.filter((c) => Boolean(c.archived));

    assert(activeClients.some((c) => c.id === testClient.id), 'Restored client MUST appear in active view');
    assert(!archivedClients.some((c) => c.id === testClient.id), 'Restored client must NOT appear in archived view');
  });

  // 9. Reopen / Restore closed court case
  await test('9. Closed matter can be restored and reopened to ongoing status', async () => {
    // Create synthetic case
    const newCase = await repos.case.create(ownerContext, {
      clientId: testClient.id,
      fileSerial: `FS-${Date.now()}`,
      caseNumber: `TEST-CASE-ARCHIVE-${Date.now()}`,
      court: 'High Court Division',
      matterType: 'Writ Petition',
      description: 'Archive test case description',
      status: 'closed',
      caseCategory: 'civil',
      ourRole: 'Petitioner',
      partyARole: 'Petitioner',
      partyBRole: 'Respondent',
      plaintiff: 'Petitioner Party',
      defendant: 'Government of Bangladesh',
      plaintiffLawyer: 'Adv. Mahbubur Rahman',
      defendantLawyer: 'Attorney General',
      caseDate: '2026-01-15',
      closedOn: '2026-10-15',
      restricted: false,
    });
    assert.strictEqual(newCase.status, 'closed');

    // Reopen / restore case
    const reopened = await repos.case.update(ownerContext, newCase.id, {
      status: 'ongoing',
      closedOn: null,
    });
    assert.strictEqual(reopened.status, 'ongoing');
    assert.strictEqual(reopened.closedOn, null);
  });

  // 10. Audit logging verification
  await test('10. Audit log recorded RESTORE action with operator identity', async () => {
    const auditLogs = await repos.auditLog.list(ownerContext, { limit: 50 });
    const restoreEntry = auditLogs.find(
      (l) => l.entity === 'Client' && l.entityId === testClient.id && l.action === 'RESTORE'
    );
    assert(Boolean(restoreEntry), 'Audit log must contain a RESTORE record for restored client');
  });

  console.log(`\n========================================`);
  console.log(`ARCHIVE AND RESTORE TEST RESULTS: ${passed} PASSED, ${failed} FAILED`);
  console.log(`========================================\n`);

  if (failed > 0) {
    process.exit(1);
  }
}

runArchiveAndRestoreTests();
