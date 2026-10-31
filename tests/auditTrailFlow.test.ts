import { MockAuditLogRepository } from '../src/data/repositories/audit';
import { MockPhysicalFileRepository } from '../src/data/repositories/file';
import { MockBackupRepository } from '../src/data/repositories/backup';
import { RestAuditLogRepository } from '../src/data/repositories/rest/restAudit';
import { localStore } from '../src/data/mockStore';
import { SecurityContext, UserRecord } from '../src/data/types';
import { PermissionKey } from '../src/permissions';

function createTestContext(role: 'Owner' | 'Staff', permissions: PermissionKey[] = []): SecurityContext {
  const user: UserRecord = {
    id: role === 'Owner' ? 'user-owner-001' : 'user-staff-001',
    firmId: 'firm-bd-001',
    name: role === 'Owner' ? 'Chamber Owner' : 'Associate Staff',
    email: role === 'Owner' ? 'owner@firm.bd' : 'staff@firm.bd',
    role,
    jobType: role === 'Owner' ? 'lawyer_senior' : 'other',
    jobTitleLabel: null,
    reportsToUserId: null,
    permissions: role === 'Owner' ? ['settings.manage', 'files.view', 'files.manage', 'cases.view', 'restricted.view', 'data.export'] : permissions,
    language: 'en',
    active: true,
    mustChangePassword: false,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    deletedAt: null,
    createdBy: 'system',
    updatedBy: 'system',
  };

  return { currentUser: user };
}

async function runAuditTrailFlowTests() {
  console.log('--- STARTING FRONTEND & REPOSITORY AUDIT TRAIL FLOW TEST SUITE ---');

  let passed = 0;
  let failed = 0;

  function assert(condition: boolean, name: string, detail?: string) {
    if (condition) {
      console.log(`[PASS] ${name}`);
      passed++;
    } else {
      console.error(`[FAIL] ${name} ${detail ? `- ${detail}` : ''}`);
      failed++;
    }
  }

  const ownerCtx = createTestContext('Owner');
  const staffCtx = createTestContext('Staff', ['files.view', 'cases.view']);

  const auditRepo = new MockAuditLogRepository();
  const fileRepo = new MockPhysicalFileRepository(auditRepo);
  const backupRepo = new MockBackupRepository(auditRepo);
  const restAuditRepo = new RestAuditLogRepository();

  // 1. Create a physical file
  const file = await fileRepo.create(ownerCtx, {
    caseId: 'case-001',
    clientId: 'client-001',
    title: 'Trial Brief & Custody Exhibits',
    shelfLocation: 'Rack B - Shelf 3',
    notes: 'Urgent civil matter file',
  });
  assert(Boolean(file && file.id), '1. Physical file registered successfully');

  // Verify registration audit log
  const createLogs = await auditRepo.list(ownerCtx, { entity: 'PhysicalFile', action: 'CREATE' });
  const fileCreateLog = createLogs.find((l) => l.entityId === file.id);
  assert(Boolean(fileCreateLog), '2. Physical file registration wrote CREATE audit event');

  // 2. Check out the physical file
  const dueBack = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
  const checkoutResult = await fileRepo.checkOut(
    ownerCtx,
    file.id,
    ownerCtx.currentUser.id,
    dueBack,
    'Checked out for Supreme Court hearing preparation'
  );
  assert(checkoutResult.file.status === 'checked_out', '3. Physical file status transitioned to checked_out');
  const checkoutMovementId = checkoutResult.movement.id;
  assert(Boolean(checkoutMovementId), '4. Checkout generated unique movement record ID');

  // Verify checkout audit log
  const checkoutLogs = await auditRepo.list(ownerCtx, { entity: 'PhysicalFile', action: 'PHYSICAL_FILE_CHECKED_OUT' });
  const fileCheckoutLog = checkoutLogs.find((l) => l.entityId === file.id);
  assert(Boolean(fileCheckoutLog), '5. Physical file check-out wrote PHYSICAL_FILE_CHECKED_OUT audit event');
  assert(fileCheckoutLog?.newValue?.currentHolderId === ownerCtx.currentUser.id, '6. Checkout log records current holder ID');
  assert(fileCheckoutLog?.newValue?.movementId === checkoutMovementId, '7. Checkout log records movementId');
  assert(fileCheckoutLog?.newValue?.caseId === 'case-001', '8. Checkout log records top-level caseId for central visibility');

  // 3. Check in the physical file
  const checkinResult = await fileRepo.checkIn(
    ownerCtx,
    file.id,
    'Rack B - Shelf 4',
    'Returned safely to chamber custody'
  );
  assert(checkinResult.file.status === 'in_chamber', '9. Physical file status transitioned back to in_chamber');

  // Verify checkin audit log & connection to checkout event
  const checkinLogs = await auditRepo.list(ownerCtx, { entity: 'PhysicalFile', action: 'PHYSICAL_FILE_CHECKED_IN' });
  const fileCheckinLog = checkinLogs.find((l) => l.entityId === file.id);
  assert(Boolean(fileCheckinLog), '10. Physical file check-in wrote PHYSICAL_FILE_CHECKED_IN audit event');
  assert(fileCheckinLog?.newValue?.linkedCheckoutMovementId === checkoutMovementId, '11. Return audit event connects directly to checkout movement ID');
  assert(fileCheckinLog?.newValue?.shelfLocation === 'Rack B - Shelf 4', '12. Return audit event records new shelf location');

  // 4. Dispatch file to court
  const dispatchResult = await fileRepo.dispatchToCourt(
    ownerCtx,
    file.id,
    'High Court Division, Bench 14',
    ownerCtx.currentUser.id,
    dueBack,
    'Urgent hearing custody transfer'
  );
  assert(dispatchResult.file.status === 'in_court', '13. Dispatch to court transitioned file status to in_court');

  // 5. Visibility on Case Activity history (listByCaseId)
  const caseActivityLogs = await auditRepo.listByCaseId(ownerCtx, 'case-001');
  const fileEventsOnCase = caseActivityLogs.filter((l) => l.entity === 'PhysicalFile');
  assert(fileEventsOnCase.length >= 3, '14. Physical file checkout and checkin appear in case activity tab (listByCaseId)');

  // 6. RestAuditLogRepository Parity & listByCaseId
  const restCaseActivity = await restAuditRepo.listByCaseId(ownerCtx, 'case-001');
  const restFileEvents = restCaseActivity.filter((l) => l.entity === 'PhysicalFile');
  assert(restFileEvents.length >= 3, '15. RestAuditLogRepository listByCaseId reflects physical file custody events');

  // 7. Confidentiality / Central Visibility boundary
  // Create a restricted case and physical file
  localStore.mutate((store) => {
    store.cases = [
      ...store.cases,
      {
        id: 'case-confidential-001',
        firmId: 'firm-bd-001',
        clientId: 'client-001',
        fileSerial: 'FS-CONF-001',
        caseNumber: 'WP-CONFIDENTIAL-999',
        court: 'High Court',
        matterType: 'Writ',
        description: 'Classified confidential case',
        plaintiff: 'State',
        defendant: 'Party B',
        ourRole: 'petitioner',
        plaintiffLawyer: 'Senior Advocate',
        defendantLawyer: 'Opposing Counsel',
        status: 'ongoing',
        restricted: true,
        responsibleLawyerId: ownerCtx.currentUser.id,
        nextHearingAt: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        deletedAt: null,
        createdBy: ownerCtx.currentUser.id,
        updatedBy: ownerCtx.currentUser.id,
      },
    ];
  });

  const confidentialFile = await fileRepo.create(ownerCtx, {
    caseId: 'case-confidential-001',
    clientId: 'client-001',
    title: 'Confidential Intelligence Dossier',
    shelfLocation: 'Vault 1',
  });

  await fileRepo.checkOut(ownerCtx, confidentialFile.id, ownerCtx.currentUser.id, dueBack, 'Classified review');

  // Owner CAN see confidential file audits
  const ownerAuditList = await auditRepo.list(ownerCtx, { entity: 'PhysicalFile' });
  const ownerSeesConfidential = ownerAuditList.some((l) => l.entityId === confidentialFile.id);
  assert(ownerSeesConfidential, '16. Owner with restricted.view sees confidential matter audit events');

  // Staff WITHOUT restricted.view CANNOT see confidential file audits
  // Note: staff needs settings.manage to call list(), so create staff with settings.manage but NO restricted.view
  const staffSettingsCtx = createTestContext('Staff', ['settings.manage', 'files.view', 'cases.view']);
  const staffAuditList = await auditRepo.list(staffSettingsCtx, { entity: 'PhysicalFile' });
  const staffSeesConfidential = staffAuditList.some((l) => l.entityId === confidentialFile.id);
  assert(!staffSeesConfidential, '17. Staff lacking restricted.view is strictly blocked from seeing confidential file audit records');

  // 8. Chamber Backup Export Auditing
  const backup = await backupRepo.createBackup(ownerCtx);
  assert(Boolean(backup.filename), '18. Chamber backup created');
  const backupLogs = await auditRepo.list(ownerCtx, { entity: 'ChamberBackup', action: 'BACKUP_EXPORT' });
  assert(backupLogs.length > 0, '19. Backup export records BACKUP_EXPORT audit event');
  assert(Boolean(backupLogs[0].newValue?.checksum), '20. Backup export audit captures SHA-256 integrity checksum');

  // Cleanup test data
  await fileRepo.delete(ownerCtx, file.id);
  await fileRepo.delete(ownerCtx, confidentialFile.id);

  console.log('========================================');
  console.log(`FRONTEND AUDIT TRAIL FLOW RESULTS: ${passed} PASSED, ${failed} FAILED`);
  console.log('========================================');

  if (failed > 0) {
    process.exit(1);
  }
}

runAuditTrailFlowTests().catch((err) => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
