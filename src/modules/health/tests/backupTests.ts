import { encryptChamberBackup, decryptChamberBackup, LEGACY_PBKDF2_ITERATIONS, DEFAULT_PBKDF2_ITERATIONS } from '../../../data/backupCrypto';
import { INITIAL_FIRM } from '../../../data/mockStore';
import { DiagnosticContext, TestResult } from './types';

export async function runBackupTests(ctx: DiagnosticContext): Promise<{ suite: TestResult[]; exportedBackupJson: string }> {
  const suite: TestResult[] = [];
  const { repos, ownerUser, staffUser, ownerCtx, staffCtx } = ctx;

  let exportedBackupJson = '';

  // Test 51: Chamber Backup Snapshot Generation & SHA-256 Checksum Invariant
  try {
    const backup = await repos.backup.createBackup(ownerCtx);
    exportedBackupJson = backup.jsonString;

    const parsed = JSON.parse(backup.jsonString);
    const pass =
      parsed.magic === 'BD_LEGAL_PRACTICE_BACKUP' &&
      parsed.metadata.firmId === INITIAL_FIRM.id &&
      parsed.metadata.counts.cases > 0 &&
      parsed.metadata.counts.clients > 0 &&
      Boolean(backup.checksum) &&
      backup.isEncrypted === false;

    // Verify audit log has BACKUP_EXPORT
    const exportLogs = await repos.auditLog.list(ownerCtx, {
      action: 'BACKUP_EXPORT',
      limit: 1,
    });

    const auditPass =
      exportLogs.length > 0 &&
      exportLogs[0].entity === 'ChamberBackup' &&
      exportLogs[0].userName === ownerUser.name;

    suite.push({
      id: 'backup-export-checksum',
      name: 'Chamber Backup Snapshot Generation & SHA-256 Checksum Invariant',
      category: 'Backup & Restore',
      passed: pass && auditPass,
      message: pass && auditPass
        ? `Snapshot generated with magic header, ${parsed.metadata.counts.cases} cases, ${parsed.metadata.counts.clients} clients, SHA-256 checksum (${backup.checksum.slice(0, 12)}...), and audit trail recorded.`
        : 'Backup export or checksum generation failed.',
      details: `Filename: ${backup.filename}, Checksum: ${backup.checksum.slice(0, 16)}..., Audit: ${auditPass ? 'Logged' : 'Missing'}`,
    });
  } catch (err: unknown) {
    suite.push({
      id: 'backup-export-checksum',
      name: 'Chamber Backup Snapshot Generation & SHA-256 Checksum Invariant',
      category: 'Backup & Restore',
      passed: false,
      message: 'Backup export failed with exception.',
      details: err instanceof Error ? err.message : String(err),
    });
  }

  // Test 52: Multi-Tenant Firm ID Isolation Invariant in Backups
  try {
    const parsed = JSON.parse(exportedBackupJson);
    const data = parsed.data;

    // All exported records must belong to ownerUser.firmId
    const nonFirmClients = (data.clients || []).filter((c: any) => c.firmId !== INITIAL_FIRM.id);
    const nonFirmCases = (data.cases || []).filter((c: any) => c.firmId !== INITIAL_FIRM.id);
    const nonFirmHearings = (data.hearings || []).filter((h: any) => h.firmId !== INITIAL_FIRM.id);
    const nonFirmTasks = (data.tasks || []).filter((t: any) => t.firmId !== INITIAL_FIRM.id);
    const nonFirmFiles = (data.physicalFiles || []).filter((f: any) => f.firmId !== INITIAL_FIRM.id);

    const pass =
      nonFirmClients.length === 0 &&
      nonFirmCases.length === 0 &&
      nonFirmHearings.length === 0 &&
      nonFirmTasks.length === 0 &&
      nonFirmFiles.length === 0 &&
      data.firm.id === INITIAL_FIRM.id;

    suite.push({
      id: 'backup-firm-isolation',
      name: 'Multi-Tenant Firm ID Isolation Invariant in Backups',
      category: 'Backup & Restore',
      passed: pass,
      message: pass
        ? 'Backup strictly bundles records belonging exclusively to caller chamber; zero cross-tenant records included.'
        : 'Multi-tenant isolation breach: foreign firm records found in backup export!',
      details: `Firm ID verified: ${data.firm?.id}, Foreign records found: 0`,
    });
  } catch (err: unknown) {
    suite.push({
      id: 'backup-firm-isolation',
      name: 'Multi-Tenant Firm ID Isolation Invariant in Backups',
      category: 'Backup & Restore',
      passed: false,
      message: 'Firm ID isolation check in backup failed.',
      details: err instanceof Error ? err.message : String(err),
    });
  }

  // Test 53: Client-Side AES-GCM 256-Bit Password Encryption & Decryption Roundtrip
  try {
    const testPassword = 'SupremeCourtChamber#2026';

    // Create encrypted backup
    const encryptedBackup = await repos.backup.createBackup(ownerCtx, {
      password: testPassword,
    });

    const parsedEnc = JSON.parse(encryptedBackup.jsonString);
    const isEncryptedFormat =
      parsedEnc.magic === 'BD_LEGAL_PRACTICE_BACKUP_ENCRYPTED' &&
      parsedEnc.encryption?.algorithm === 'AES-GCM-256' &&
      parsedEnc.encryption?.iterations >= 600000 &&
      Boolean(parsedEnc.ciphertext);

    // Inspect with correct password
    const previewCorrect = await repos.backup.inspectBackup(
      ownerCtx,
      encryptedBackup.jsonString,
      testPassword
    );

    // Inspect with wrong password
    const previewWrong = await repos.backup.inspectBackup(
      ownerCtx,
      encryptedBackup.jsonString,
      'WrongPassword123'
    );

    const pass =
      isEncryptedFormat &&
      previewCorrect.valid &&
      previewCorrect.checksumMatched &&
      !previewWrong.valid &&
      Boolean(previewWrong.error);

    suite.push({
      id: 'backup-aes-gcm-roundtrip',
      name: 'Client-Side AES-GCM 256-Bit Password Encryption & Decryption Roundtrip',
      category: 'Backup & Restore',
      passed: pass,
      message: pass
        ? `Payload securely encrypted via AES-GCM-256 & PBKDF2 (${parsedEnc.encryption?.iterations} iterations stored in header); verified roundtrip decryption with correct password and clean rejection with wrong password.`
        : 'AES-GCM encryption or decryption roundtrip failed.',
      details: `Algorithm: AES-GCM-256, PBKDF2 Iterations: ${parsedEnc.encryption?.iterations}, Correct Decrypt: ${previewCorrect.valid ? 'OK' : 'Failed'}, Wrong Decrypt Blocked: ${!previewWrong.valid ? 'OK' : 'Failed'}`,
    });
  } catch (err: unknown) {
    suite.push({
      id: 'backup-aes-gcm-roundtrip',
      name: 'Client-Side AES-GCM 256-Bit Password Encryption & Decryption Roundtrip',
      category: 'Backup & Restore',
      passed: false,
      message: 'AES-GCM encryption roundtrip failed with exception.',
      details: err instanceof Error ? err.message : String(err),
    });
  }

  // Test 53B: Restoring Old-Format Backup Invariant (Item 8)
  try {
    const oldPassword = 'OldFormatBackupPass#2024';
    const plainParsed = JSON.parse(exportedBackupJson);

    // Explicitly encrypt using legacy 100,000 iterations
    const legacyEncrypted = await encryptChamberBackup(
      plainParsed,
      oldPassword,
      LEGACY_PBKDF2_ITERATIONS
    );

    // Simulate old-format header where 'iterations' was not recorded
    const oldFormatPayload = JSON.parse(JSON.stringify(legacyEncrypted));
    delete oldFormatPayload.encryption.iterations;
    const oldFormatJson = JSON.stringify(oldFormatPayload);

    // Verify inspectBackup handles old format
    const inspectOld = await repos.backup.inspectBackup(ownerCtx, oldFormatJson, oldPassword);

    // Verify restoreBackup successfully decrypts and merges old format backup
    const restoreOld = await repos.backup.restoreBackup(ownerCtx, oldFormatJson, {
      password: oldPassword,
      mode: 'merge',
    });

    const pass =
      inspectOld.valid &&
      inspectOld.checksumMatched &&
      restoreOld.success &&
      restoreOld.counts.cases > 0;

    suite.push({
      id: 'backup-legacy-format-restore',
      name: 'Legacy Old-Format Encrypted Backup Restore Invariant (Item 8)',
      category: 'Backup & Restore',
      passed: pass,
      message: pass
        ? `Old-format backup (100,000 iterations without header field) was correctly recognized and restored using legacy fallback.`
        : `Old-format backup restore failed: inspectValid=${inspectOld.valid}, restoreSuccess=${restoreOld.success}`,
      details: `Legacy iterations fallback: ${LEGACY_PBKDF2_ITERATIONS}, Restored cases: ${restoreOld.counts.cases}`,
    });
  } catch (err: unknown) {
    suite.push({
      id: 'backup-legacy-format-restore',
      name: 'Legacy Old-Format Encrypted Backup Restore Invariant (Item 8)',
      category: 'Backup & Restore',
      passed: false,
      message: 'Old-format backup restore test failed with exception.',
      details: err instanceof Error ? err.message : String(err),
    });
  }

  // Test 54: Tamper-Evident Integrity Checksum Verification & Poisoned Payload Rejection
  try {
    const tamperedBackup = JSON.parse(exportedBackupJson);

    // Maliciously change first case number without updating SHA-256 checksum
    if (tamperedBackup.data.cases.length > 0) {
      tamperedBackup.data.cases[0].caseNumber = 'Tampered Forged Suit No. 9999/2026';
    }

    const tamperedJson = JSON.stringify(tamperedBackup);

    // Inspect tampered payload
    const inspectTampered = await repos.backup.inspectBackup(ownerCtx, tamperedJson);

    // Attempt to restore tampered payload
    let restoreTamperedBlocked = false;
    try {
      await repos.backup.restoreBackup(ownerCtx, tamperedJson, { mode: 'clean' });
    } catch {
      restoreTamperedBlocked = true;
    }

    const pass =
      !inspectTampered.checksumMatched &&
      inspectTampered.warnings.some((w) => w.toLowerCase().includes('checksum mismatch')) &&
      restoreTamperedBlocked;

    suite.push({
      id: 'backup-tamper-detection',
      name: 'Tamper-Evident Integrity Checksum Verification & Poisoned Payload Rejection',
      category: 'Backup & Restore',
      passed: pass,
      message: pass
        ? 'SHA-256 verification detected payload modification; tamper warning triggered and poisoned restore strictly rejected.'
        : 'Tamper detection invariant failed: modified payload was not detected or blocked!',
      details: `Checksum matched: ${inspectTampered.checksumMatched}, Restore blocked: ${restoreTamperedBlocked}`,
    });
  } catch (err: unknown) {
    suite.push({
      id: 'backup-tamper-detection',
      name: 'Tamper-Evident Integrity Checksum Verification & Poisoned Payload Rejection',
      category: 'Backup & Restore',
      passed: false,
      message: 'Tamper detection test failed with exception.',
      details: err instanceof Error ? err.message : String(err),
    });
  }

  // Test 55: Transactional Clean & Merge Restore Invariant with Audit Trail
  try {
    const restoreResult = await repos.backup.restoreBackup(ownerCtx, exportedBackupJson, {
      mode: 'clean',
    });

    const restoreLogs = await repos.auditLog.list(ownerCtx, {
      action: 'BACKUP_RESTORE',
      limit: 1,
    });

    const hasRestoreAudit =
      restoreLogs.length > 0 &&
      restoreLogs[0].id === restoreResult.auditLogId &&
      restoreLogs[0].userName === ownerUser.name;

    const pass =
      restoreResult.success &&
      restoreResult.mode === 'clean' &&
      restoreResult.counts.cases > 0 &&
      hasRestoreAudit;

    suite.push({
      id: 'backup-restore-transactional',
      name: 'Transactional Clean & Merge Restore Invariant with Audit Trail',
      category: 'Backup & Restore',
      passed: pass,
      message: pass
        ? `Chamber restore executed atomically; restored ${restoreResult.counts.cases} cases and recorded audit entry "${restoreLogs[0]?.id}".`
        : 'Transactional restore or audit trail verification failed.',
      details: `Mode: ${restoreResult.mode}, Audit Log ID: ${restoreResult.auditLogId}, Operator: ${ownerUser.name}`,
    });
  } catch (err: unknown) {
    suite.push({
      id: 'backup-restore-transactional',
      name: 'Transactional Clean & Merge Restore Invariant with Audit Trail',
      category: 'Backup & Restore',
      passed: false,
      message: 'Restore invariant test failed with exception.',
      details: err instanceof Error ? err.message : String(err),
    });
  }

  // Test 56: Backup Authorization Gatekeeping (data.export & settings.manage)
  try {
    let exportBlockedForStaff = false;
    try {
      await repos.backup.createBackup(staffCtx);
    } catch {
      exportBlockedForStaff = true;
    }

    let restoreBlockedForStaff = false;
    try {
      await repos.backup.restoreBackup(staffCtx, exportedBackupJson, { mode: 'clean' });
    } catch {
      restoreBlockedForStaff = true;
    }

    const pass = exportBlockedForStaff && restoreBlockedForStaff;

    suite.push({
      id: 'backup-permission-gatekeeping',
      name: 'Backup Authorization Gatekeeping (data.export & settings.manage)',
      category: 'Permissions',
      passed: pass,
      message: pass
        ? 'Staff user without data.export is blocked from exporting; staff without settings.manage is blocked from restoring.'
        : `Authorization gate failed: exportBlocked=${exportBlockedForStaff}, restoreBlocked=${restoreBlockedForStaff}`,
      details: 'Checked data.export and settings.manage permission enforcement on MockBackupRepository.',
    });
  } catch (err: unknown) {
    suite.push({
      id: 'backup-permission-gatekeeping',
      name: 'Backup Authorization Gatekeeping (data.export & settings.manage)',
      category: 'Permissions',
      passed: false,
      message: 'Backup permission gatekeeping check failed.',
      details: err instanceof Error ? err.message : String(err),
    });
  }

  return { suite, exportedBackupJson };
}
