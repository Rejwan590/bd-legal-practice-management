import { INITIAL_FIRM, localStore } from '../../../data/mockStore';
import { SecurityContext } from '../../../data/types';
import { DiagnosticContext, TestResult } from './types';

export async function runCasesTests(ctx: DiagnosticContext): Promise<TestResult[]> {
  const suite: TestResult[] = [];
  const { repos, ownerUser, staffUser, ownerCtx, staffCtx } = ctx;

  let testCaseId = '';
  // Test 14: Case Creation & BaseRecord Schema Contract
  try {
    const newCase = await repos.case.create(ownerCtx, {
      clientId: 'client-001',
      fileSerial: 'F-2024-TEST',
      caseNumber: 'Artha Rin Suit No. 99/2024',
      court: 'Artha Rin Adalat, Dhaka',
      matterType: 'Money Loan Recovery Act 2003',
      description: 'Test suit for loan recovery verification',
      plaintiff: 'Bank PLC',
      defendant: 'Borrower Ltd.',
      ourRole: 'Plaintiff',
      plaintiffLawyer: 'Adv. Mahbubur Rahman',
      defendantLawyer: 'Adv. M. Ali',
      status: 'ongoing',
      restricted: false,
    });
    testCaseId = newCase.id;

    const pass =
      Boolean(newCase.id) &&
      newCase.firmId === INITIAL_FIRM.id &&
      newCase.clientId === 'client-001' &&
      newCase.deletedAt === null &&
      newCase.createdBy === ownerUser.id;

    suite.push({
      id: 'case-create-link',
      name: 'Case Creation & BaseRecord Schema Invariant',
      category: 'Cases Module',
      passed: pass,
      message: pass
        ? `Case "${newCase.caseNumber}" registered for client-001 with UUID, file serial ${newCase.fileSerial}, and BaseRecord schema.`
        : 'Case creation failed schema requirements.',
      details: `Case ID: ${newCase.id}, Client: ${newCase.clientId}, File Serial: ${newCase.fileSerial}`,
    });
  } catch (err: unknown) {
    suite.push({
      id: 'case-create-link',
      name: 'Case Creation & BaseRecord Schema Invariant',
      category: 'Cases Module',
      passed: false,
      message: 'Exception occurred during case creation.',
      details: err instanceof Error ? err.message : String(err),
    });
  }

  // Test 15: Restricted Cases Confidentiality Isolation Invariant
  try {
    const staffCases = await repos.case.list(staffCtx);
    const staffSeesRestricted = staffCases.some((c) => c.restricted || c.id === 'case-003');

    let getByIdBlocked = false;
    try {
      await repos.case.getById(staffCtx, 'case-003');
    } catch {
      getByIdBlocked = true;
    }

    const pass = !staffSeesRestricted && getByIdBlocked;
    suite.push({
      id: 'case-restricted-isolation',
      name: 'Restricted Cases Isolation Invariant (Staff Boundary)',
      category: 'Cases Module',
      passed: pass,
      message: pass
        ? 'Confidential/restricted cases are completely filtered from staff queries and blocked at repository level without restricted.view.'
        : `Restricted isolation breach: staffSeesRestricted=${staffSeesRestricted}, getByIdBlocked=${getByIdBlocked}`,
      details: 'Verified against case-003 (Company Matter No. 88/2022).',
    });
  } catch (err: unknown) {
    suite.push({
      id: 'case-restricted-isolation',
      name: 'Restricted Cases Isolation Invariant (Staff Boundary)',
      category: 'Cases Module',
      passed: false,
      message: 'Restricted case isolation check failed.',
      details: err instanceof Error ? err.message : String(err),
    });
  }

  // Test 16: Owner Authorized Access to Confidential Matters
  try {
    const confidentialCase = await repos.case.getById(ownerCtx, 'case-003');
    const pass = Boolean(confidentialCase && confidentialCase.restricted);

    suite.push({
      id: 'case-restricted-owner',
      name: 'Authorized Access to Confidential Matters (Owner/Partner)',
      category: 'Cases Module',
      passed: pass,
      message: pass
        ? `Owner successfully retrieves confidential case "${confidentialCase?.caseNumber}" with full matter details.`
        : 'Owner was incorrectly barred from viewing confidential case.',
      details: `Case: ${confidentialCase?.caseNumber}, Court: ${confidentialCase?.court}`,
    });
  } catch (err: unknown) {
    suite.push({
      id: 'case-restricted-owner',
      name: 'Authorized Access to Confidential Matters (Owner/Partner)',
      category: 'Cases Module',
      passed: false,
      message: 'Authorized confidential access check failed.',
      details: err instanceof Error ? err.message : String(err),
    });
  }

  // Test 17: Duplicate Case Number & Court Detection Invariant
  try {
    const isDup = await repos.case.checkDuplicate(
      ownerCtx,
      'Title Suit No. 45/2023',
      '1st Joint District Judge Court, Dhaka'
    );
    const isUnique = !(await repos.case.checkDuplicate(
      ownerCtx,
      'Non Existent Suit 9999/2026',
      'Supreme Court of Bangladesh (High Court Division)'
    ));

    // Confidential case duplicate check: staff without restricted.view must get false
    const staffConfidentialDup = await repos.case.checkDuplicate(
      staffCtx,
      'Company Matter No. 88/2022',
      'High Court Division (Company Bench)'
    );
    const ownerConfidentialDup = await repos.case.checkDuplicate(
      ownerCtx,
      'Company Matter No. 88/2022',
      'High Court Division (Company Bench)'
    );

    const pass = isDup && isUnique && !staffConfidentialDup && ownerConfidentialDup;
    suite.push({
      id: 'case-duplicate-detection',
      name: 'Duplicate Case Detection Invariant',
      category: 'Cases Module',
      passed: pass,
      message: pass
        ? 'Repository accurately detects duplicate case numbers within the same court jurisdiction, allows unique registrations, and conceals confidential cases from unauthorized staff.'
        : `Duplicate detection check failed: isDup=${isDup}, isUnique=${isUnique}, staffConfidentialDup=${staffConfidentialDup}, ownerConfidentialDup=${ownerConfidentialDup}`,
      details: 'Checked: Title Suit No. 45/2023 & Company Matter No. 88/2022.',
    });
  } catch (err: unknown) {
    suite.push({
      id: 'case-duplicate-detection',
      name: 'Duplicate Case Detection Invariant',
      category: 'Cases Module',
      passed: false,
      message: 'Duplicate detection check failed.',
      details: err instanceof Error ? err.message : String(err),
    });
  }

  // Test 18: Case Soft-Delete Invariant
  try {
    if (testCaseId) {
      const delRes = await repos.case.delete(ownerCtx, testCaseId);
      const storeCases = localStore.getData().cases || [];
      const preservedCase = storeCases.find((c) => c.id === testCaseId);
      const hasDeletedAt = Boolean(preservedCase && preservedCase.deletedAt !== null);

      const activeCases = await repos.case.list(ownerCtx);
      const excludedFromActive = !activeCases.some((c) => c.id === testCaseId);

      const pass = delRes.softDeleted && hasDeletedAt && excludedFromActive;
      suite.push({
        id: 'case-soft-delete',
        name: 'Case Soft-Delete Preservation Invariant',
        category: 'Cases Module',
        passed: pass,
        message: pass
          ? 'Case soft delete sets deletedAt timestamp while preserving historical records for hearings, files, and tasks.'
          : 'Case soft-delete preservation invariant failed.',
        details: `Preserved record deletedAt: ${preservedCase?.deletedAt}`,
      });
    } else {
      throw new Error('Test case ID was not established.');
    }
  } catch (err: unknown) {
    suite.push({
      id: 'case-soft-delete',
      name: 'Case Soft-Delete Preservation Invariant',
      category: 'Cases Module',
      passed: false,
      message: 'Case soft-delete check failed.',
      details: err instanceof Error ? err.message : String(err),
    });
  }

  // Test 18B: Case Delete Cascade & Unlink Integrity (Zero Broken Links or Live Reminders)
  try {
    const cascadeCase = await repos.case.create(ownerCtx, {
      clientId: 'client-001',
      fileSerial: 'F-CASCADE-TEST',
      caseNumber: 'Cascade Test Suit No. 101/2026',
      court: 'Joint District Judge Court, Dhaka',
      matterType: 'Civil Matter',
      description: 'Test case for cascade delete integrity verification',
      plaintiff: 'Alpha Ltd',
      defendant: 'Beta Ltd',
      ourRole: 'Plaintiff',
      plaintiffLawyer: 'Adv. Mahbubur Rahman',
      defendantLawyer: 'Adv. M. Ali',
      status: 'ongoing',
      restricted: false,
    });

    const cascadeHearing = await repos.hearing.create(ownerCtx, {
      caseId: cascadeCase.id,
      scheduledAt: '2026-11-20T10:30:00.000Z',
      purpose: 'Arguments',
    });

    const cascadeReminder = await repos.reminder.create(ownerCtx, {
      userId: ownerUser.id,
      sourceType: 'hearing',
      sourceId: cascadeHearing.id,
      title: 'Cascade Hearing Reminder',
      remindAt: '2026-11-19T09:00:00.000Z',
      dueAt: '2026-11-20T10:30:00.000Z',
    });

    const cascadeTask = await repos.task.create(ownerCtx, {
      title: 'Cascade Linked Task',
      assignedTo: ownerUser.id,
      dueAt: '2026-11-18T17:00:00.000Z',
      priority: 'high',
      caseId: cascadeCase.id,
      clientId: 'client-001',
    });

    const cascadeFile = await repos.physicalFile.create(ownerCtx, {
      title: 'Cascade Linked Physical File',
      caseId: cascadeCase.id,
      clientId: 'client-001',
      shelfLocation: 'Shelf-C9',
    });

    // Case delete via repository (with Owner role)
    await repos.case.delete(ownerCtx, cascadeCase.id);

    // Verify state after cascade
    const store = localStore.getData();
    const updatedCase = (store.cases || []).find((c) => c.id === cascadeCase.id);
    const caseSoftDeleted = Boolean(updatedCase && updatedCase.deletedAt !== null);

    const updatedHearing = (store.hearings || []).find((h) => h.id === cascadeHearing.id);
    const hearingSoftDeleted = Boolean(updatedHearing && updatedHearing.deletedAt !== null);

    const updatedReminder = (store.reminders || []).find((r) => r.id === cascadeReminder.id);
    const reminderCleared = Boolean(
      !updatedReminder || updatedReminder.status === 'dismissed' || updatedReminder.deletedAt !== null
    );

    const updatedTask = (store.tasks || []).find((t) => t.id === cascadeTask.id);
    const taskUnlinked = Boolean(
      updatedTask &&
      updatedTask.caseId === null &&
      updatedTask.description?.includes('[Case archived:')
    );

    const updatedFile = (store.physicalFiles || []).find((f) => f.id === cascadeFile.id);
    const fileUnlinked = Boolean(
      updatedFile &&
      updatedFile.caseId === null &&
      updatedFile.notes?.includes('[Case archived:')
    );

    // Clean up test records
    localStore.mutate((s) => {
      s.cases = (s.cases || []).filter((c) => c.id !== cascadeCase.id);
      s.hearings = (s.hearings || []).filter((h) => h.id !== cascadeHearing.id);
      s.reminders = (s.reminders || []).filter((r) => r.id !== cascadeReminder.id);
      s.tasks = (s.tasks || []).filter((t) => t.id !== cascadeTask.id);
      s.physicalFiles = (s.physicalFiles || []).filter((f) => f.id !== cascadeFile.id);
    });

    const pass =
      caseSoftDeleted &&
      hearingSoftDeleted &&
      reminderCleared &&
      taskUnlinked &&
      fileUnlinked;

    suite.push({
      id: 'case-delete-cascade-integrity',
      name: 'Case Delete Cascade Integrity (Zero Broken Links & Clean Reminders)',
      category: 'Cases Module',
      passed: pass,
      message: pass
        ? 'Case deletion successfully soft-deletes hearings, clears live reminders, and unlinks tasks & physical files marked as [Case archived] with zero broken links.'
        : `Cascade integrity failed: case=${caseSoftDeleted}, hearing=${hearingSoftDeleted}, reminder=${reminderCleared}, task=${taskUnlinked}, file=${fileUnlinked}`,
      details: 'Verified: Case soft-deleted, hearing soft-deleted, reminder cleared, task & file unlinked without broken FKs.',
    });
  } catch (err: unknown) {
    suite.push({
      id: 'case-delete-cascade-integrity',
      name: 'Case Delete Cascade Integrity (Zero Broken Links & Clean Reminders)',
      category: 'Cases Module',
      passed: false,
      message: 'Case cascade integrity test failed.',
      details: err instanceof Error ? err.message : String(err),
    });
  }

  // Test 19: Client Profile Multi-Case Dynamic Linkage
  try {
    const clientCases = await repos.case.getByClientId(ownerCtx, 'client-001');
    const pass = clientCases.length >= 2 && clientCases.some((c) => c.id === 'case-001');

    suite.push({
      id: 'case-client-linkage',
      name: 'Client Dossier Multi-Case Dynamic Linkage Invariant',
      category: 'Cases Module',
      passed: pass,
      message: pass
        ? `Client profile dynamically pulls ${clientCases.length} linked active cases from the Cases repository.`
        : 'Client dossier failed to link cases.',
      details: `Linked cases for client-001: ${clientCases.map((c) => c.caseNumber).join(', ')}`,
    });
  } catch (err: unknown) {
    suite.push({
      id: 'case-client-linkage',
      name: 'Client Dossier Multi-Case Dynamic Linkage Invariant',
      category: 'Cases Module',
      passed: false,
      message: 'Client case linkage check failed.',
      details: err instanceof Error ? err.message : String(err),
    });
  }

  // Test 20: Case Operations Audit Trail Verification
  try {
    const caseLogs = await repos.auditLog.list(ownerCtx, { entity: 'Case', limit: 5 });
    const pass = caseLogs.length >= 2;

    suite.push({
      id: 'case-audit-propagation',
      name: 'Case Operations Audit Trail Verification',
      category: 'Audit Trail',
      passed: pass,
      message: pass
        ? `Audit log captured ${caseLogs.length} case operations with operator "${caseLogs[0]?.userName}".`
        : 'Case audit log verification failed.',
      details: `Logged actions: ${caseLogs.map((l) => l.action).join(', ')}`,
    });
  } catch (err: unknown) {
    suite.push({
      id: 'case-audit-propagation',
      name: 'Case Operations Audit Trail Verification',
      category: 'Audit Trail',
      passed: false,
      message: 'Case audit check failed.',
      details: err instanceof Error ? err.message : String(err),
    });
  }

  // Test 58: Case Delete Cascade, Reminder Clearance & Safe Unlinking Invariant
  try {
    // 1. Setup client and case
    const testClient = await repos.client.create(ownerCtx, {
      name: 'Cascade Verification Client',
      phone: '+880 1800-999000',
      address: 'Dhaka',
      notes: 'For cascade deletion test',
    });

    const testCase = await repos.case.create(ownerCtx, {
      clientId: testClient.id,
      fileSerial: 'F-CASCADE-99',
      caseNumber: 'Suit No. 999/CASCADE',
      court: 'High Court Division',
      matterType: 'Writ Petition',
      description: 'Cascade test matter',
      plaintiff: 'Petitioner',
      defendant: 'Respondent',
      ourRole: 'Petitioner',
      plaintiffLawyer: 'Adv. Mahbubur Rahman',
      defendantLawyer: 'Adv. Opponent',
      status: 'ongoing',
      restricted: false,
    });

    // 2. Add hearing and explicit pending reminder
    const testHearing = await repos.hearing.create(ownerCtx, {
      caseId: testCase.id,
      scheduledAt: new Date(Date.now() + 86400000 * 3).toISOString(),
      purpose: 'Order 39 hearing',
    });

    await repos.reminder.create(ownerCtx, {
      userId: ownerUser.id,
      sourceType: 'hearing',
      sourceId: testHearing.id,
      title: 'Upcoming Hearing: Suit No. 999/CASCADE',
      remindAt: new Date(Date.now() + 86400000 * 2).toISOString(),
      dueAt: testHearing.scheduledAt,
    });

    // 3. Add task linked to case
    const testTask = await repos.task.create(ownerCtx, {
      caseId: testCase.id,
      clientId: testClient.id,
      assignedTo: ownerUser.id,
      title: 'Task for cascade test',
      priority: 'high',
      dueAt: new Date(Date.now() + 86400000 * 2).toISOString(),
    });

    // 4. Add physical file linked to case
    const testFile = await repos.physicalFile.create(ownerCtx, {
      caseId: testCase.id,
      clientId: testClient.id,
      title: 'Cascade Paper Dossier',
      shelfLocation: 'Shelf C-3',
    });

    // 5. Verify getLinkedCounts
    const counts = await repos.case.getLinkedCounts(ownerCtx, testCase.id);
    const countsValid =
      counts.hearingsCount >= 1 &&
      counts.tasksCount >= 1 &&
      counts.filesCount >= 1 &&
      counts.remindersCount >= 1;

    // 6. Verify staff cannot delete case
    let staffBlocked = false;
    try {
      await repos.case.delete(staffCtx, testCase.id);
    } catch {
      staffBlocked = true;
    }

    // 7. Owner deletes case
    const delRes = await repos.case.delete(ownerCtx, testCase.id);

    // 8. Verify cascade effects
    const activeCases = await repos.case.list(ownerCtx, { search: '999/CASCADE' });
    const caseSoftDeleted = activeCases.length === 0;

    const caseHearings = await repos.hearing.list(ownerCtx, { caseId: testCase.id });
    const hearingsSoftDeleted = caseHearings.length === 0;

    const allReminders = await repos.reminder.list(ownerCtx);
    const liveHearingReminders = allReminders.filter(
      (r) => r.sourceId === testHearing.id && r.status === 'pending'
    );
    const remindersCleared = liveHearingReminders.length === 0;

    const updatedTask = await repos.task.getById(ownerCtx, testTask.id);
    const taskUnlinked =
      updatedTask?.caseId === null &&
      Boolean(updatedTask?.description?.includes('[Case archived: Suit No. 999/CASCADE]'));

    const updatedFile = await repos.physicalFile.getById(ownerCtx, testFile.id);
    const fileUnlinked =
      updatedFile?.caseId === null &&
      Boolean(updatedFile?.notes?.includes('[Case archived: Suit No. 999/CASCADE]'));

    // Clean up test records
    await repos.task.delete(ownerCtx, testTask.id);
    await repos.physicalFile.delete(ownerCtx, testFile.id);
    await repos.client.delete(ownerCtx, testClient.id);

    const pass =
      countsValid &&
      staffBlocked &&
      delRes.softDeleted &&
      caseSoftDeleted &&
      hearingsSoftDeleted &&
      remindersCleared &&
      taskUnlinked &&
      fileUnlinked;

    suite.push({
      id: 'case-delete-unlink-cleanup',
      name: 'Case Delete Cascade, Reminder Clearance & Safe Unlinking Invariant',
      category: 'Cases Module',
      passed: pass,
      message: pass
        ? 'Case deletion soft-deletes linked hearings, clears pending reminders, and unlinks tasks and physical files (marked as "Case archived") with zero broken links.'
        : `Case delete cascade check failed: countsValid=${countsValid}, staffBlocked=${staffBlocked}, caseDel=${caseSoftDeleted}, hearingsDel=${hearingsSoftDeleted}, remindersCleared=${remindersCleared}, taskUnlinked=${taskUnlinked}, fileUnlinked=${fileUnlinked}`,
      details: `Counts: ${JSON.stringify(counts)}, Task CaseId: ${updatedTask?.caseId}, File CaseId: ${updatedFile?.caseId}`,
    });
  } catch (err: unknown) {
    suite.push({
      id: 'case-delete-unlink-cleanup',
      name: 'Case Delete Cascade, Reminder Clearance & Safe Unlinking Invariant',
      category: 'Cases Module',
      passed: false,
      message: 'Case delete cascade test failed with error.',
      details: err instanceof Error ? err.message : String(err),
    });
  }

  // Clean up created test case
  if (testCaseId) {
    localStore.mutate((s) => {
      s.cases = (s.cases || []).filter((c) => c.id !== testCaseId);
    });
  }

  return suite;
}
