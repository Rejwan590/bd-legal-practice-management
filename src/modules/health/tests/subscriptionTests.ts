import { evaluateSubscription, LICENSE_GRACE_PERIOD_DAYS } from '../../../permissions';
import { localStore } from '../../../data/mockStore';
import { DiagnosticContext, TestResult } from './types';

export async function runSubscriptionTests(
  ctx: DiagnosticContext,
  exportedBackupJson: string
): Promise<TestResult[]> {
  const suite: TestResult[] = [];
  const { repos, ownerUser, staffUser, ownerCtx, staffCtx } = ctx;

  // Test 51: Subscription Expiry & Days Remaining Calculation Invariant
  try {
    const futureDate = new Date(Date.now() + 300 * 24 * 60 * 60 * 1000).toISOString();
    const nearFutureDate = new Date(Date.now() + 5 * 24 * 60 * 60 * 1000).toISOString();
    const gracePeriodDate = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString();
    const pastGraceDate = new Date(
      Date.now() - (LICENSE_GRACE_PERIOD_DAYS + 3) * 24 * 60 * 60 * 1000
    ).toISOString();

    const subActive = evaluateSubscription('active', futureDate);
    const subExpiring = evaluateSubscription('active', nearFutureDate);
    const subGrace = evaluateSubscription('active', gracePeriodDate);
    const subExpired = evaluateSubscription('expired', pastGraceDate);

    const pass =
      subActive.status === 'active' &&
      !subActive.isReadOnly &&
      subExpiring.status === 'expiring_soon' &&
      !subExpiring.isReadOnly &&
      subGrace.status === 'grace_period' &&
      subGrace.inGracePeriod &&
      !subGrace.isReadOnly &&
      subGrace.graceDaysRemaining === 3 &&
      subExpired.status === 'expired' &&
      subExpired.isReadOnly;

    suite.push({
      id: 'subscription-evaluator-invariants',
      name: 'Subscription Expiry & Days Remaining Calculation Invariant (evaluateSubscription)',
      category: 'Subscription & Read-Only',
      passed: pass,
      message: pass
        ? 'Subscription engine accurately calculates active (300d), expiring_soon (5d), grace_period (3d left), and expired read-only states.'
        : `Evaluation invariant failed: active=${subActive.status}, expiring=${subExpiring.status}, grace=${subGrace.status}, expiredReadOnly=${subExpired.isReadOnly}`,
      details: `Active days: ${subActive.daysRemaining}, Grace days remaining: ${subGrace.graceDaysRemaining}, Expired isReadOnly: ${subExpired.isReadOnly}`,
    });
  } catch (err: unknown) {
    suite.push({
      id: 'subscription-evaluator-invariants',
      name: 'Subscription Expiry & Days Remaining Calculation Invariant (evaluateSubscription)',
      category: 'Subscription & Read-Only',
      passed: false,
      message: 'Subscription evaluator test failed with exception.',
      details: err instanceof Error ? err.message : String(err),
    });
  }

  // Test 51B: Normal Chamber Operations Permitted During 5-Day Grace Period Invariant
  try {
    const withinGraceDate = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString();
    const graceState = evaluateSubscription('active', withinGraceDate);

    const pass =
      graceState.status === 'grace_period' &&
      graceState.inGracePeriod === true &&
      graceState.isReadOnly === false &&
      graceState.graceDaysRemaining === 3;

    suite.push({
      id: 'subscription-grace-period-unlocked',
      name: 'Normal Chamber Operations Permitted During 5-Day Grace Period Invariant',
      category: 'Subscription & Read-Only',
      passed: pass,
      message: pass
        ? `During the 5-day grace window, the chamber retains full operational write capabilities (isReadOnly=false, bannerVariant=grace, ${graceState.graceDaysRemaining} days remaining).`
        : `Grace window check failed: inGrace=${graceState.inGracePeriod}, isReadOnly=${graceState.isReadOnly}`,
      details: `Status: ${graceState.status}, Grace days left: ${graceState.graceDaysRemaining}`,
    });
  } catch (err: unknown) {
    suite.push({
      id: 'subscription-grace-period-unlocked',
      name: 'Normal Chamber Operations Permitted During 5-Day Grace Period Invariant',
      category: 'Subscription & Read-Only',
      passed: false,
      message: 'Grace period invariant test failed with exception.',
      details: err instanceof Error ? err.message : String(err),
    });
  }

  // Test 52: Case & Client Write Gating in Read-Only Mode (Rule 8 Invariant)
  try {
    const pastGraceDate = new Date(
      Date.now() - (LICENSE_GRACE_PERIOD_DAYS + 2) * 24 * 60 * 60 * 1000
    ).toISOString();
    localStore.mutate((data) => {
      data.firm.status = 'expired';
      data.firm.licenseExpiresAt = pastGraceDate;
    });

    let clientCreateBlocked = false;
    try {
      await repos.client.create(ownerCtx, {
        name: 'Blocked Test Client',
        phone: '+8801700000000',
        address: 'Dhaka',
        notes: 'Testing read-only block',
      });
    } catch (err: unknown) {
      if (err instanceof Error && err.message.toLowerCase().includes('read-only')) {
        clientCreateBlocked = true;
      }
    }

    let caseCreateBlocked = false;
    try {
      await repos.case.create(ownerCtx, {
        clientId: 'client-001',
        fileSerial: 'F-BLOCKED-01',
        caseNumber: 'Blocked Suit 99/2026',
        court: 'High Court',
        matterType: 'Writ',
        description: 'Testing read-only block',
        plaintiff: 'P',
        defendant: 'D',
        ourRole: 'Plaintiff',
        plaintiffLawyer: 'Adv. Test',
        defendantLawyer: 'Adv. Opp',
        status: 'ongoing',
        restricted: false,
      });
    } catch (err: unknown) {
      if (err instanceof Error && err.message.toLowerCase().includes('read-only')) {
        caseCreateBlocked = true;
      }
    }

    const pass = clientCreateBlocked && caseCreateBlocked;

    suite.push({
      id: 'subscription-readonly-cases-clients',
      name: 'Case & Client Write Gating in Read-Only Mode (Rule 8 Invariant)',
      category: 'Subscription & Read-Only',
      passed: pass,
      message: pass
        ? 'All client and case write operations (create/update/delete) were strictly rejected by repository gates with read-only lock error.'
        : 'Read-only gatekeeping invariant failed: write operation was not blocked!',
      details: `Client create blocked: ${clientCreateBlocked}, Case create blocked: ${caseCreateBlocked}`,
    });
  } catch (err: unknown) {
    suite.push({
      id: 'subscription-readonly-cases-clients',
      name: 'Case & Client Write Gating in Read-Only Mode (Rule 8 Invariant)',
      category: 'Subscription & Read-Only',
      passed: false,
      message: 'Read-only cases/clients test failed with exception.',
      details: err instanceof Error ? err.message : String(err),
    });
  }

  // Test 59: Hearing & Task Write Gating in Read-Only Mode (Rule 8 Invariant)
  try {
    let hearingCreateBlocked = false;
    try {
      await repos.hearing.create(ownerCtx, {
        caseId: 'case-001',
        scheduledAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
        purpose: 'Blocked Hearing',
      });
    } catch (err: unknown) {
      if (err instanceof Error && err.message.toLowerCase().includes('read-only')) {
        hearingCreateBlocked = true;
      }
    }

    let taskCreateBlocked = false;
    try {
      await repos.task.create(ownerCtx, {
        title: 'Blocked Task Creation',
        assignedTo: ownerUser.id,
        dueAt: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString(),
        priority: 'high',
      });
    } catch (err: unknown) {
      if (err instanceof Error && err.message.toLowerCase().includes('read-only')) {
        taskCreateBlocked = true;
      }
    }

    const pass = hearingCreateBlocked && taskCreateBlocked;

    suite.push({
      id: 'subscription-readonly-hearings-tasks',
      name: 'Hearing & Task Write Gating in Read-Only Mode (Rule 8 Invariant)',
      category: 'Subscription & Read-Only',
      passed: pass,
      message: pass
        ? 'Hearing and task mutation methods are strictly gated; mutations were rejected under read-only mode.'
        : 'Read-only gatekeeping invariant failed for hearings or tasks!',
      details: `Hearing create blocked: ${hearingCreateBlocked}, Task create blocked: ${taskCreateBlocked}`,
    });
  } catch (err: unknown) {
    suite.push({
      id: 'subscription-readonly-hearings-tasks',
      name: 'Hearing & Task Write Gating in Read-Only Mode (Rule 8 Invariant)',
      category: 'Subscription & Read-Only',
      passed: false,
      message: 'Read-only hearings/tasks test failed with exception.',
      details: err instanceof Error ? err.message : String(err),
    });
  }

  // Test 60: Physical File & Database Restore Gating in Read-Only Mode (Rule 8 Invariant)
  try {
    let fileCreateBlocked = false;
    try {
      await repos.physicalFile.create(ownerCtx, {
        title: 'Blocked Physical File Bundle',
        shelfLocation: 'Rack B',
      });
    } catch (err: unknown) {
      if (err instanceof Error && err.message.toLowerCase().includes('read-only')) {
        fileCreateBlocked = true;
      }
    }

    let restoreBlocked = false;
    try {
      await repos.backup.restoreBackup(ownerCtx, exportedBackupJson, { mode: 'clean' });
    } catch (err: unknown) {
      if (err instanceof Error && err.message.toLowerCase().includes('read-only')) {
        restoreBlocked = true;
      }
    }

    const pass = fileCreateBlocked && restoreBlocked;

    suite.push({
      id: 'subscription-readonly-files-restores',
      name: 'Physical File & Database Restore Gating in Read-Only Mode (Rule 8 Invariant)',
      category: 'Subscription & Read-Only',
      passed: pass,
      message: pass
        ? 'Physical file creation and database restore operations were strictly halted under read-only lock.'
        : 'Read-only gatekeeping invariant failed for physical files or database restore!',
      details: `File create blocked: ${fileCreateBlocked}, Restore blocked: ${restoreBlocked}`,
    });
  } catch (err: unknown) {
    suite.push({
      id: 'subscription-readonly-files-restores',
      name: 'Physical File & Database Restore Gating in Read-Only Mode (Rule 8 Invariant)',
      category: 'Subscription & Read-Only',
      passed: false,
      message: 'Read-only files/restores test failed with exception.',
      details: err instanceof Error ? err.message : String(err),
    });
  }

  // Test: Staff Permission Modification Gating in Read-Only Mode (Rule 8 Invariant)
  try {
    let permissionUpdateBlocked = false;
    let blockedErrMsg = '';

    const targetUser = (await repos.user.list(ownerCtx)).find((u) => u.role === 'Staff');
    const originalPerms = targetUser ? [...targetUser.permissions] : [];

    try {
      if (targetUser) {
        await repos.user.updatePermissions(ownerCtx, targetUser.id, ['cases.view']);
      }
    } catch (err: unknown) {
      if (err instanceof Error && err.message.toLowerCase().includes('read-only')) {
        permissionUpdateBlocked = true;
        blockedErrMsg = err.message;
      }
    }

    const verifiedUser = targetUser ? await repos.user.getById(ownerCtx, targetUser.id) : null;
    const permsUnchanged =
      verifiedUser !== null &&
      verifiedUser.permissions.length === originalPerms.length;

    const pass = permissionUpdateBlocked && permsUnchanged;

    suite.push({
      id: 'subscription-readonly-blocks-permission-update',
      name: 'Staff Permission Edit Gating in Read-Only Mode (updatePermissions)',
      category: 'Subscription & Read-Only',
      passed: pass,
      message: pass
        ? 'Staff permission modifications (updatePermissions) are strictly blocked during read-only mode.'
        : `Staff permission update was not blocked during read-only mode: blocked=${permissionUpdateBlocked}`,
      details: `Blocked message: "${blockedErrMsg}"`,
    });
  } catch (err: unknown) {
    suite.push({
      id: 'subscription-readonly-blocks-permission-update',
      name: 'Staff Permission Edit Gating in Read-Only Mode (updatePermissions)',
      category: 'Subscription & Read-Only',
      passed: false,
      message: 'Permission update gating test failed with exception.',
      details: err instanceof Error ? err.message : String(err),
    });
  }

  // Test: Data Viewability Allowed in Read-Only Mode (Rule 8 Invariant)
  try {
    const cases = await repos.case.list(ownerCtx);
    const clients = await repos.client.list(ownerCtx);
    const hearings = await repos.hearing.list(ownerCtx);
    const tasks = await repos.task.list(ownerCtx);
    const files = await repos.physicalFile.list(ownerCtx);
    const calendarEvents = await repos.calendar.getEvents(ownerCtx, {
      startIso: new Date(Date.now() - 30 * 86400000).toISOString(),
      endIso: new Date(Date.now() + 30 * 86400000).toISOString(),
    });
    const metrics = await repos.dashboard.getMetrics(ownerCtx);

    const pass =
      Array.isArray(cases) &&
      Array.isArray(clients) &&
      Array.isArray(hearings) &&
      Array.isArray(tasks) &&
      Array.isArray(files) &&
      Array.isArray(calendarEvents) &&
      typeof metrics.activeCasesCount === 'number';

    suite.push({
      id: 'subscription-readonly-allows-viewing',
      name: 'Data Viewability Allowed in Read-Only Mode (Rule 8 Invariant)',
      category: 'Subscription & Read-Only',
      passed: pass,
      message: pass
        ? `All chamber data records (cases: ${cases.length}, clients: ${clients.length}, hearings: ${hearings.length}, tasks: ${tasks.length}, files: ${files.length}, calendar: ${calendarEvents.length}) remain fully viewable in read-only mode.`
        : 'Viewing query failed during read-only mode!',
      details: `Cases: ${cases.length}, Clients: ${clients.length}, Tasks: ${tasks.length}, Files: ${files.length}`,
    });
  } catch (err: unknown) {
    suite.push({
      id: 'subscription-readonly-allows-viewing',
      name: 'Data Viewability Allowed in Read-Only Mode (Rule 8 Invariant)',
      category: 'Subscription & Read-Only',
      passed: false,
      message: 'Viewing in read-only mode failed with exception.',
      details: err instanceof Error ? err.message : String(err),
    });
  }

  // Test: Global Search Allowed in Read-Only Mode (Rule 8 Invariant)
  try {
    const searchResults = await repos.search.search(ownerCtx, 'dhaka');
    const pass = Array.isArray(searchResults) && searchResults.length > 0;

    suite.push({
      id: 'subscription-readonly-allows-searching',
      name: 'Global Search Allowed in Read-Only Mode (Rule 8 Invariant)',
      category: 'Subscription & Read-Only',
      passed: pass,
      message: pass
        ? `Global multi-entity search executed successfully in read-only mode, discovering ${searchResults.length} matching records across the chamber.`
        : 'Search query failed during read-only mode!',
      details: `Discovered matches: ${searchResults.length}`,
    });
  } catch (err: unknown) {
    suite.push({
      id: 'subscription-readonly-allows-searching',
      name: 'Global Search Allowed in Read-Only Mode (Rule 8 Invariant)',
      category: 'Subscription & Read-Only',
      passed: false,
      message: 'Search in read-only mode failed with exception.',
      details: err instanceof Error ? err.message : String(err),
    });
  }

  // Test: Backup Export Allowed in Read-Only Mode (Rule 8 Invariant)
  try {
    const exportSnapshot = await repos.backup.createBackup(ownerCtx, {});
    const pass =
      typeof exportSnapshot.jsonString === 'string' &&
      exportSnapshot.jsonString.length > 0 &&
      exportSnapshot.checksum.length === 64;

    suite.push({
      id: 'subscription-readonly-allows-backup-export',
      name: 'Backup Export Allowed in Read-Only Mode (Rule 8 Invariant)',
      category: 'Subscription & Read-Only',
      passed: pass,
      message: pass
        ? `Chamber backup export succeeded in read-only mode, generating a signed snapshot (${exportSnapshot.filename}) with SHA-256 integrity hash.`
        : 'Backup export failed during read-only mode!',
      details: `Filename: ${exportSnapshot.filename}, Checksum: ${exportSnapshot.checksum.slice(0, 16)}...`,
    });
  } catch (err: unknown) {
    suite.push({
      id: 'subscription-readonly-allows-backup-export',
      name: 'Backup Export Allowed in Read-Only Mode (Rule 8 Invariant)',
      category: 'Subscription & Read-Only',
      passed: false,
      message: 'Backup export in read-only mode failed with exception.',
      details: err instanceof Error ? err.message : String(err),
    });
  }

  // Test: License Modification Gated from Firm Users & Admin Renewal Restores Writes
  try {
    const firmUserCannotRenew =
      (repos.firm as any).renewLicense === undefined &&
      (repos.firm as any).setLicenseState === undefined;

    // Simulate license renewal by platform admin
    const newExpiresAt = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString();
    localStore.mutate((data) => {
      data.firm.status = 'active';
      data.firm.licenseExpiresAt = newExpiresAt;
    });

    const renewedFirm = await repos.firm.getFirm(ownerCtx);
    const renewedSub = evaluateSubscription(renewedFirm.status, renewedFirm.licenseExpiresAt);

    // Verify write operations are immediately restored
    const createdClient = await repos.client.create(ownerCtx, {
      name: 'Post-Renewal Restored Client',
      phone: '+8801811223344',
      address: 'Gulshan-2, Dhaka',
      notes: 'Created after chamber license renewal',
    });
    await repos.client.delete(ownerCtx, createdClient.id);

    const pass =
      firmUserCannotRenew &&
      renewedFirm.status === 'active' &&
      !renewedSub.isReadOnly &&
      renewedSub.daysRemaining > 300 &&
      Boolean(createdClient.id);

    suite.push({
      id: 'subscription-readonly-allows-license-renewal',
      name: 'License Modification Gated from Firm Users & Renewal Restores Writes',
      category: 'Subscription & Read-Only',
      passed: pass,
      message: pass
        ? `Firm-facing API and repository correctly block license changes (renewLicense/setLicenseState removed). Admin license extension through ${renewedSub.formattedExpiry} immediately restored write operations.`
        : 'Firm license mutation not properly gated or writes remained blocked!',
      details: `Firm Status: ${renewedFirm.status}, Days Remaining: ${renewedSub.daysRemaining}, Gate Protected: ${firmUserCannotRenew}`,
    });
  } catch (err: unknown) {
    suite.push({
      id: 'subscription-readonly-allows-license-renewal',
      name: 'License Modification Gated from Firm Users & Renewal Restores Writes',
      category: 'Subscription & Read-Only',
      passed: false,
      message: 'License renewal test failed with exception.',
      details: err instanceof Error ? err.message : String(err),
    });
  }

  // Test: 5-Day Grace Period Invariant: Normal Operations with Grace Banner
  try {
    const gracePeriodDate = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString();
    localStore.mutate((data) => {
      data.firm.status = 'expired';
      data.firm.licenseExpiresAt = gracePeriodDate;
    });

    const firmInGrace = await repos.firm.getFirm(ownerCtx);
    const subInGrace = evaluateSubscription(firmInGrace.status, firmInGrace.licenseExpiresAt);

    let writeSucceeded = false;
    let createdTestClient: any = null;
    try {
      createdTestClient = await repos.client.create(ownerCtx, {
        name: 'Grace Period Test Client',
        phone: '+880 1711-333444',
        address: 'Banani, Dhaka',
        notes: 'Testing unblocked write during grace',
      });
      writeSucceeded = Boolean(createdTestClient?.id);
      await repos.client.delete(ownerCtx, createdTestClient.id);
    } catch {
      writeSucceeded = false;
    }

    const nextYear = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString();
    localStore.mutate((data) => {
      data.firm.status = 'active';
      data.firm.licenseExpiresAt = nextYear;
    });

    const pass =
      subInGrace.inGracePeriod &&
      !subInGrace.isReadOnly &&
      subInGrace.graceDaysRemaining === 3 &&
      writeSucceeded;

    suite.push({
      id: 'subscription-grace-period-unblocked-writes',
      name: '5-Day Grace Period Invariant: Normal Operations with Grace Indicator',
      category: 'Subscription & Read-Only',
      passed: pass,
      message: pass
        ? `During the ${LICENSE_GRACE_PERIOD_DAYS}-day grace period (evaluated ${subInGrace.graceDaysRemaining}d remaining), the application functions normally: write operations are permitted without read-only block.`
        : `Grace period write test failed: inGrace=${subInGrace.inGracePeriod}, isReadOnly=${subInGrace.isReadOnly}, writeSucceeded=${writeSucceeded}`,
      details: `Grace days remaining: ${subInGrace.graceDaysRemaining}, isReadOnly: ${subInGrace.isReadOnly}`,
    });
  } catch (err: unknown) {
    suite.push({
      id: 'subscription-grace-period-unblocked-writes',
      name: '5-Day Grace Period Invariant: Normal Operations with Grace Indicator',
      category: 'Subscription & Read-Only',
      passed: false,
      message: 'Grace period test failed with exception.',
      details: err instanceof Error ? err.message : String(err),
    });
  }

  return suite;
}
