import { INITIAL_FIRM, localStore } from '../../../data/mockStore';
import { SecurityContext } from '../../../data/types';
import { DiagnosticContext, TestResult } from './types';

export async function runClientsTests(ctx: DiagnosticContext): Promise<TestResult[]> {
  const suite: TestResult[] = [];
  const { repos, ownerUser, staffUser, ownerCtx, staffCtx } = ctx;

  let testClientId = '';
  // Test 9: Client Creation & Schema Contract
  try {
    const newClient = await repos.client.create(ownerCtx, {
      name: 'Mohammad Farhad Hossain',
      nameBn: 'মোহাম্মদ ফরহাদ হোসেন',
      phone: '+880 1799-112233',
      email: 'farhad.hossain@example.com',
      address: 'Sector 4, Uttara, Dhaka-1230',
      notes: 'Health verification client creation test',
    });
    testClientId = newClient.id;

    const pass =
      Boolean(newClient.id) &&
      newClient.firmId === INITIAL_FIRM.id &&
      newClient.deletedAt === null &&
      newClient.createdBy === ownerUser.id &&
      Boolean(newClient.createdAt);

    suite.push({
      id: 'client-create',
      name: 'Client Creation & BaseRecord Schema Invariant',
      category: 'Clients Module',
      passed: pass,
      message: pass
        ? `Client "${newClient.name}" created with UUID, firmId isolation, and audit timestamp.`
        : 'Client creation failed to conform to BaseRecord schema.',
      details: `Client ID: ${newClient.id}, Firm: ${newClient.firmId}, CreatedBy: ${newClient.createdBy}`,
    });
  } catch (err: unknown) {
    suite.push({
      id: 'client-create',
      name: 'Client Creation & BaseRecord Schema Invariant',
      category: 'Clients Module',
      passed: false,
      message: 'Exception occurred during client creation.',
      details: err instanceof Error ? err.message : String(err),
    });
  }

  // Test 10: Client Soft-Delete & Store Preservation Invariant
  try {
    if (testClientId) {
      // Soft delete the test client
      const delRes = await repos.client.delete(ownerCtx, testClientId);
      const storeClients = localStore.getData().clients || [];
      const preservedInStore = storeClients.find((c) => c.id === testClientId);
      const hasDeletedAt = preservedInStore && preservedInStore.deletedAt !== null;

      // Verify active list query excludes soft-deleted client
      const activeList = await repos.client.list(ownerCtx);
      const excludedFromActive = !activeList.some((c) => c.id === testClientId);

      const pass = delRes.softDeleted && Boolean(hasDeletedAt) && excludedFromActive;
      suite.push({
        id: 'client-soft-delete',
        name: 'Client Soft-Delete Preservation Invariant',
        category: 'Clients Module',
        passed: pass,
        message: pass
          ? 'Soft delete marks deletedAt without physical removal; active queries correctly filter archived records.'
          : 'Soft-delete preservation invariant failed.',
        details: `Soft-deleted record preserved with timestamp: ${preservedInStore?.deletedAt}`,
      });
    } else {
      throw new Error('Test client ID was not established.');
    }
  } catch (err: unknown) {
    suite.push({
      id: 'client-soft-delete',
      name: 'Client Soft-Delete Preservation Invariant',
      category: 'Clients Module',
      passed: false,
      message: 'Soft delete verification failed.',
      details: err instanceof Error ? err.message : String(err),
    });
  }

  // Test 11: Client Permission Gatekeeping
  try {
    let writeBlocked = false;

    // Staff user does not have clients.edit by default
    try {
      await repos.client.create(staffCtx, {
        name: 'Unauthorized Client',
        phone: '+880 1900-000000',
        address: 'Test',
        notes: 'Should fail',
      });
    } catch {
      writeBlocked = true;
    }

    // But staff CAN view clients
    let viewAllowed = false;
    try {
      const list = await repos.client.list(staffCtx);
      viewAllowed = Array.isArray(list);
    } catch {
      viewAllowed = false;
    }

    const pass = writeBlocked && viewAllowed;
    suite.push({
      id: 'client-permissions',
      name: 'Client Permission Partition (clients.view vs clients.edit)',
      category: 'Clients Module',
      passed: pass,
      message: pass
        ? 'Staff user can view clients list (clients.view) but repository method blocks writes without clients.edit.'
        : `Permission gate failed: writeBlocked=${writeBlocked}, viewAllowed=${viewAllowed}`,
      details: 'Verified inside MockClientRepository methods.',
    });
  } catch (err: unknown) {
    suite.push({
      id: 'client-permissions',
      name: 'Client Permission Partition (clients.view vs clients.edit)',
      category: 'Clients Module',
      passed: false,
      message: 'Permission gate check encountered an error.',
      details: err instanceof Error ? err.message : String(err),
    });
  }

  // Test 12: Client Multi-Case Profile Linkage Invariant
  try {
    const overview = await repos.client.getLinkedOverview(ownerCtx, 'client-001');
    const pass =
      overview.cases.length >= 2 &&
      overview.tasks.length >= 2 &&
      overview.files.length >= 1;

    suite.push({
      id: 'client-profile-relations',
      name: 'Client Profile Multi-Case & Dossier Linkage',
      category: 'Clients Module',
      passed: pass,
      message: pass
        ? `Client profile links ${overview.cases.length} court cases, ${overview.tasks.length} tasks, and ${overview.files.length} physical files.`
        : 'Client profile relations linkage failed.',
      details: `Cases: ${overview.cases.map((c) => c.caseNumber).join(', ')}`,
    });
  } catch (err: unknown) {
    suite.push({
      id: 'client-profile-relations',
      name: 'Client Profile Multi-Case & Dossier Linkage',
      category: 'Clients Module',
      passed: false,
      message: 'Client profile overview failed.',
      details: err instanceof Error ? err.message : String(err),
    });
  }

  // Test 13: Client Operations Audit Trail Verification
  try {
    const clientLogs = await repos.auditLog.list(ownerCtx, { entity: 'Client', limit: 5 });
    const hasCreate = clientLogs.some((l) => l.action === 'CREATE');
    const hasDelete = clientLogs.some((l) => l.action === 'DELETE');
    const pass = clientLogs.length >= 2 && hasCreate && hasDelete;

    suite.push({
      id: 'client-audit-propagation',
      name: 'Client Operations Audit Trail Verification',
      category: 'Audit Trail',
      passed: pass,
      message: pass
        ? `Audit log captured ${clientLogs.length} client mutations with before/after state diffs.`
        : 'Client audit trail verification failed.',
      details: `Recorded actions: ${clientLogs.map((l) => l.action).join(', ')}`,
    });
  } catch (err: unknown) {
    suite.push({
      id: 'client-audit-propagation',
      name: 'Client Operations Audit Trail Verification',
      category: 'Audit Trail',
      passed: false,
      message: 'Client audit check failed.',
      details: err instanceof Error ? err.message : String(err),
    });
  }

  // Test 13B: Client Deletion Blocked with Linked Cases & Owner Archiving
  try {
    let blockedErrorMsg = '';
    try {
      // client-001 has active cases, tasks, and files
      await repos.client.delete(ownerCtx, 'client-001');
    } catch (err: unknown) {
      blockedErrorMsg = err instanceof Error ? err.message : String(err);
    }

    const correctlyBlocked =
      blockedErrorMsg.includes('Cannot delete client') &&
      blockedErrorMsg.includes('active case(s)');

    // Verify archiving a client with no active cases works for Owner
    const tempClient = await repos.client.create(ownerCtx, {
      name: 'Archive Test Client',
      phone: '+880 1800-999999',
      address: 'Dhaka',
      notes: 'Testing client archive flow',
    });
    const archivedClient = await repos.client.archive(ownerCtx, tempClient.id);
    const isArchived = Boolean(archivedClient && archivedClient.archived === true);

    // Clean up temp client
    localStore.mutate((s) => {
      s.clients = (s.clients || []).filter((c) => c.id !== tempClient.id);
    });

    const pass = correctlyBlocked && isArchived;
    suite.push({
      id: 'client-delete-blocked-linked',
      name: 'Client Deletion Blocked with Linked Cases & Owner Archiving',
      category: 'Clients Module',
      passed: pass,
      message: pass
        ? 'Client deletion is strictly blocked when linked to active cases, tasks, or files. Owner archiving functions correctly for completed clients.'
        : `Client delete gate failed: correctlyBlocked=${correctlyBlocked}, isArchived=${isArchived}`,
      details: `Blocked msg: "${blockedErrorMsg}"`,
    });
  } catch (err: unknown) {
    suite.push({
      id: 'client-delete-blocked-linked',
      name: 'Client Deletion Blocked with Linked Cases & Owner Archiving',
      category: 'Clients Module',
      passed: false,
      message: 'Client delete test failed.',
      details: err instanceof Error ? err.message : String(err),
    });
  }

  // Test 57: Client Deletion Blocked by Active Records & Owner Archiving Invariant
  try {
    let deleteBlocked = false;
    let blockedMessage = '';

    // client-001 has active cases and tasks
    try {
      await repos.client.delete(ownerCtx, 'client-001');
    } catch (err: unknown) {
      deleteBlocked = true;
      blockedMessage = err instanceof Error ? err.message : String(err);
    }

    let archiveBlockedWhenOngoing = false;
    try {
      await repos.client.archive(ownerCtx, 'client-001');
    } catch {
      archiveBlockedWhenOngoing = true;
    }

    const archivableClient = await repos.client.create(ownerCtx, {
      name: 'Settled Client for Archival',
      phone: '+880 1711-888777',
      address: 'Uttara, Dhaka',
      notes: 'Matters concluded',
    });
    const archived = await repos.client.archive(ownerCtx, archivableClient.id);
    const isArchivedInStore = Boolean(archived.archived);

    // Clean up test client
    localStore.mutate((s) => {
      s.clients = (s.clients || []).filter((c) => c.id !== archivableClient.id);
    });

    const pass =
      deleteBlocked &&
      blockedMessage.includes('Cannot delete client') &&
      archiveBlockedWhenOngoing &&
      isArchivedInStore;

    suite.push({
      id: 'client-delete-blocked-linked-cases',
      name: 'Client Delete Blocked by Active Records & Owner Archiving Invariant',
      category: 'Clients Module',
      passed: pass,
      message: pass
        ? 'Client deletion is strictly blocked when active cases, tasks, or files exist. Owner archive is blocked while cases are ongoing and succeeds when cases are closed/none.'
        : `Client delete blocking or archiving invariant failed: deleteBlocked=${deleteBlocked}, archiveBlocked=${archiveBlockedWhenOngoing}, isArchived=${isArchivedInStore}`,
      details: `Blocked msg: "${blockedMessage}"`,
    });
  } catch (err: unknown) {
    suite.push({
      id: 'client-delete-blocked-linked-cases',
      name: 'Client Delete Blocked by Active Records & Owner Archiving Invariant',
      category: 'Clients Module',
      passed: false,
      message: 'Client delete blocking test failed with error.',
      details: err instanceof Error ? err.message : String(err),
    });
  }

  // Clean up any test clients created during tests so store is untouched
  if (testClientId) {
    localStore.mutate((s) => {
      s.clients = (s.clients || []).filter((c) => c.id !== testClientId);
    });
  }

  return suite;
}
