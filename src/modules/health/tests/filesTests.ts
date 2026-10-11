import { INITIAL_FIRM, localStore } from '../../../data/mockStore';
import { DiagnosticContext, TestResult } from './types';

export async function runFilesTests(ctx: DiagnosticContext): Promise<TestResult[]> {
  const suite: TestResult[] = [];
  const { repos, ownerUser, staffUser, ownerCtx, staffCtx } = ctx;

  // Test 33: Physical File Auto-Increment Serial Invariant
  try {
    const nextSerial = await repos.physicalFile.getNextSerial(ownerCtx);
    const serialFormatValid = /^F-\d{6}$/.test(nextSerial);
    const allFiles = await repos.physicalFile.list(ownerCtx);
    const isUnique = !allFiles.some((f) => f.serial === nextSerial);

    const pass = serialFormatValid && isUnique;
    suite.push({
      id: 'file-serial-generation',
      name: 'Physical File Serial Generation & Uniqueness Invariant',
      category: 'Physical Files Module',
      passed: pass,
      message: pass
        ? `Auto-increment generator yielded unique valid chamber serial "${nextSerial}" following F-000xxx format.`
        : `Serial generation failed: nextSerial="${nextSerial}", formatValid=${serialFormatValid}, unique=${isUnique}`,
      details: `Allocated serial: ${nextSerial}, Total files inspected: ${allFiles.length}`,
    });
  } catch (err: unknown) {
    suite.push({
      id: 'file-serial-generation',
      name: 'Physical File Serial Generation & Uniqueness Invariant',
      category: 'Physical Files Module',
      passed: false,
      message: 'Serial generation invariant check failed.',
      details: err instanceof Error ? err.message : String(err),
    });
  }

  // Test 34: Physical File Creation & BaseRecord Schema Invariant
  let createdFileId = '';
  try {
    const newFile = await repos.physicalFile.create(ownerCtx, {
      title: 'Dhaka District Court Land Title Suit - Original Deeds Bundle',
      caseId: 'case-001',
      clientId: 'client-001',
      shelfLocation: 'Cabinet C, Shelf 2 (Motijheel Civil)',
      notes: 'Original certified CS, SA, and RS porcha copies with registration receipts.',
    });
    createdFileId = newFile.id;

    const pass =
      Boolean(newFile.id) &&
      newFile.firmId === INITIAL_FIRM.id &&
      Boolean(newFile.serial) &&
      newFile.status === 'in_chamber' &&
      newFile.currentHolderId === null &&
      newFile.deletedAt === null &&
      newFile.createdBy === ownerUser.id;

    suite.push({
      id: 'file-create-schema',
      name: 'Physical File Creation & BaseRecord Schema Invariant',
      category: 'Physical Files Module',
      passed: pass,
      message: pass
        ? `Physical file "${newFile.title}" (${newFile.serial}) registered in chamber shelf "${newFile.shelfLocation}".`
        : 'Physical file creation violated BaseRecord schema invariants.',
      details: `File ID: ${newFile.id}, Serial: ${newFile.serial}, Status: ${newFile.status}`,
    });
  } catch (err: unknown) {
    suite.push({
      id: 'file-create-schema',
      name: 'Physical File Creation & BaseRecord Schema Invariant',
      category: 'Physical Files Module',
      passed: false,
      message: 'Physical file creation test failed.',
      details: err instanceof Error ? err.message : String(err),
    });
  }

  // Test 35: Custody Checkout Workflow & Movement Log Invariant
  try {
    const targetFileId = createdFileId || 'file-002';
    const dueBack = new Date();
    dueBack.setDate(dueBack.getDate() + 3);
    const dueBackIso = dueBack.toISOString();

    const result = await repos.physicalFile.checkOut(
      ownerCtx,
      targetFileId,
      staffUser.id,
      dueBackIso,
      'File checked out for cross-examination scrutiny'
    );

    const pass =
      result.file.status === 'checked_out' &&
      result.file.currentHolderId === staffUser.id &&
      result.file.dueBackAt === dueBackIso &&
      result.movement.action === 'CHECKOUT' &&
      result.movement.userId === staffUser.id;

    suite.push({
      id: 'file-checkout-movement',
      name: 'Custody Checkout Workflow & Immutable Movement Log Invariant',
      category: 'Physical Files Module',
      passed: pass,
      message: pass
        ? `File successfully checked out to "${result.file.currentHolderName}" with immutable CHECKOUT movement record.`
        : 'Custody checkout workflow failed.',
      details: `Movement ID: ${result.movement.id}, Holder: ${result.file.currentHolderName}, Due: ${result.file.dueBackAt}`,
    });
  } catch (err: unknown) {
    suite.push({
      id: 'file-checkout-movement',
      name: 'Custody Checkout Workflow & Immutable Movement Log Invariant',
      category: 'Physical Files Module',
      passed: false,
      message: 'Custody checkout test failed.',
      details: err instanceof Error ? err.message : String(err),
    });
  }

  // Test 36: Custody Return / Check-In Workflow & Location Invariant
  try {
    const targetFileId = createdFileId || 'file-002';
    const returnShelf = 'Cabinet C, Shelf 2 (Restored)';

    const result = await repos.physicalFile.checkIn(
      ownerCtx,
      targetFileId,
      returnShelf,
      'Returned intact with certified court order copy attached'
    );

    const movements = await repos.physicalFile.getMovements(ownerCtx, targetFileId);
    const hasCheckout = movements.some((m) => m.action === 'CHECKOUT');
    const hasCheckin = movements.some((m) => m.action === 'CHECKIN');

    const pass =
      result.file.status === 'in_chamber' &&
      result.file.currentHolderId === null &&
      result.file.dueBackAt === null &&
      result.file.shelfLocation === returnShelf &&
      result.movement.action === 'CHECKIN' &&
      hasCheckout &&
      hasCheckin;

    suite.push({
      id: 'file-checkin-movement',
      name: 'Custody Return / Check-In Workflow & Shelf Location Invariant',
      category: 'Physical Files Module',
      passed: pass,
      message: pass
        ? `File returned to chamber custody at "${returnShelf}". Timeline verified ${movements.length} custody events.`
        : 'Custody return check-in workflow failed.',
      details: `Movements count: ${movements.length}, Actions: ${movements.map((m) => m.action).join(' -> ')}`,
    });
  } catch (err: unknown) {
    suite.push({
      id: 'file-checkin-movement',
      name: 'Custody Return / Check-In Workflow & Shelf Location Invariant',
      category: 'Physical Files Module',
      passed: false,
      message: 'Custody return test failed.',
      details: err instanceof Error ? err.message : String(err),
    });
  }

  // Test 37: Dynamic Overdue Return Calculation Invariant
  try {
    const allFiles = await repos.physicalFile.list(ownerCtx);
    const nowMs = Date.now();

    const overdueFiles = allFiles.filter(
      (f) =>
        f.status !== 'in_chamber' &&
        f.dueBackAt &&
        new Date(f.dueBackAt).getTime() < nowMs
    );

    const file001Overdue = overdueFiles.some((f) => f.id === 'file-001');
    const file004NotOverdue = !overdueFiles.some((f) => f.id === 'file-004');
    const file002NotOverdue = !overdueFiles.some((f) => f.id === 'file-002');

    const pass = overdueFiles.length >= 1 && file001Overdue && file004NotOverdue && file002NotOverdue;

    suite.push({
      id: 'file-overdue-alert',
      name: 'Dynamic Overdue Custody Return Calculation Invariant',
      category: 'Physical Files Module',
      passed: pass,
      message: pass
        ? `System identified ${overdueFiles.length} overdue file(s); chamber files and future due dates properly excluded.`
        : `Overdue calculation failed: overdueCount=${overdueFiles.length}, file001Overdue=${file001Overdue}`,
      details: `Identified overdue files: ${overdueFiles.map((f) => `${f.serial} (${f.currentHolderName})`).join(', ')}`,
    });
  } catch (err: unknown) {
    suite.push({
      id: 'file-overdue-alert',
      name: 'Dynamic Overdue Custody Return Calculation Invariant',
      category: 'Physical Files Module',
      passed: false,
      message: 'Overdue physical file return check failed.',
      details: err instanceof Error ? err.message : String(err),
    });
  }

  // Test 38: Confidential Case Physical File Isolation Invariant
  try {
    const staffFiles = await repos.physicalFile.list(staffCtx);
    const staffSeesConfidential = staffFiles.some(
      (f) => f.id === 'file-003' || f.caseId === 'case-003'
    );

    let staffGetBlocked = false;
    try {
      await repos.physicalFile.getById(staffCtx, 'file-003');
    } catch {
      staffGetBlocked = true;
    }

    const ownerFiles = await repos.physicalFile.list(ownerCtx);
    const ownerSeesConfidential = ownerFiles.some((f) => f.id === 'file-003');

    const pass = !staffSeesConfidential && staffGetBlocked && ownerSeesConfidential;

    suite.push({
      id: 'file-confidential-isolation',
      name: 'Confidential Case Physical File Isolation Invariant',
      category: 'Physical Files Module',
      passed: pass,
      message: pass
        ? 'Physical files tied to confidential cases are strictly concealed from staff lacking restricted.view.'
        : `Confidential file isolation breach: staffSees=${staffSeesConfidential}, getBlocked=${staffGetBlocked}, ownerSees=${ownerSeesConfidential}`,
      details: 'Verified in MockPhysicalFileRepository.list() and getById().',
    });
  } catch (err: unknown) {
    suite.push({
      id: 'file-confidential-isolation',
      name: 'Confidential Case Physical File Isolation Invariant',
      category: 'Physical Files Module',
      passed: false,
      message: 'Confidential physical file isolation test failed.',
      details: err instanceof Error ? err.message : String(err),
    });
  }

  // Clean up created file
  if (createdFileId) {
    localStore.mutate((s) => {
      s.physicalFiles = (s.physicalFiles || []).filter((f) => f.id !== createdFileId);
      s.reminders = (s.reminders || []).filter((r) => r.sourceId !== createdFileId);
    });
  }

  return suite;
}
