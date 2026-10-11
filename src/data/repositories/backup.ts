import { can } from '../../permissions';
import {
  canonicalStringify,
  computeSha256,
  decryptChamberBackup,
  encryptChamberBackup,
} from '../backupCrypto';
import { IAuditLogRepository, IBackupRepository } from '../interfaces';
import { localStore } from '../mockStore';
import {
  AuditLogRecord,
  ChamberBackupCounts,
  ChamberBackupData,
  ChamberBackupMetadata,
  ChamberBackupPayload,
  EncryptedBackupPayload,
  FirmRecord,
  RestoreMode,
  RestorePreview,
  RestoreResult,
  SecurityContext,
} from '../types';
import { getVisibleCaseIdsForContext } from './case';
import { assertNotReadOnly, generateUUID } from './common';

export class MockBackupRepository implements IBackupRepository {
  private auditLogRepo: IAuditLogRepository;

  constructor(auditLogRepo: IAuditLogRepository) {
    this.auditLogRepo = auditLogRepo;
  }

  async createBackup(
    context: SecurityContext,
    options?: {
      password?: string;
    }
  ): Promise<{
    filename: string;
    payload: ChamberBackupPayload | EncryptedBackupPayload;
    jsonString: string;
    metadata: ChamberBackupMetadata;
    checksum: string;
    isEncrypted: boolean;
  }> {
    const { currentUser } = context;
    if (!can('data.export', currentUser)) {
      throw new Error('Permission denied: data.export required to export chamber data');
    }

    const firmId = currentUser.firmId;
    const store = localStore.getData();

    // Verify firm matches
    if (store.firm.id !== firmId) {
      throw new Error(`Firm ID mismatch: User firm ${firmId} does not match store firm ${store.firm.id}`);
    }

    // Filter all records strictly by caller's firmId
    const firmData: FirmRecord = { ...store.firm };
    const clients = (store.clients || []).filter((c) => c.firmId === firmId);
    let cases = (store.cases || []).filter((c) => c.firmId === firmId);
    let hearings = (store.hearings || []).filter((h) => h.firmId === firmId);
    let hearingDateHistory = (store.hearingDateHistory || []).filter((hd) => hd.firmId === firmId);
    let tasks = (store.tasks || []).filter((t) => t.firmId === firmId);
    let physicalFiles = (store.physicalFiles || []).filter((f) => f.firmId === firmId);
    let fileMovements = (store.fileMovements || []).filter((fm) => fm.firmId === firmId);
    let reminders = (store.reminders || []).filter((r) => r.firmId === firmId);
    let auditLogs = (store.auditLogs || []).filter((a) => a.firmId === firmId);

    // Central visibility boundary: omit any cases (restricted or team-hidden) and derived records not visible to currentUser
    const visibleCaseIds = getVisibleCaseIdsForContext(context);
    const hiddenCaseIdSet = new Set(
      cases.filter((c) => !visibleCaseIds.has(c.id)).map((c) => c.id)
    );

    if (hiddenCaseIdSet.size > 0 || !can('restricted.view', currentUser)) {
      // Exclude hidden cases
      cases = cases.filter((c) => !hiddenCaseIdSet.has(c.id));

      // Exclude linked hearings
      const hiddenHearingIdSet = new Set(
        hearings.filter((h) => h.caseId && hiddenCaseIdSet.has(h.caseId)).map((h) => h.id)
      );
      hearings = hearings.filter((h) => !hiddenHearingIdSet.has(h.id));
      hearingDateHistory = hearingDateHistory.filter((hd) => !hiddenHearingIdSet.has(hd.hearingId));

      // Exclude linked tasks
      const hiddenTaskIdSet = new Set(
        tasks.filter((t) => t.caseId && hiddenCaseIdSet.has(t.caseId)).map((t) => t.id)
      );
      tasks = tasks.filter((t) => !hiddenTaskIdSet.has(t.id));

      // Exclude linked physical files
      const hiddenFileIdSet = new Set(
        physicalFiles.filter((f) => f.caseId && hiddenCaseIdSet.has(f.caseId)).map((f) => f.id)
      );
      physicalFiles = physicalFiles.filter((f) => !hiddenFileIdSet.has(f.id));
      fileMovements = fileMovements.filter((fm) => !hiddenFileIdSet.has(fm.fileId));

      // Exclude reminders derived from hidden hearings, tasks, or files
      reminders = reminders.filter((r) => {
        if (r.sourceType === 'hearing' && hiddenHearingIdSet.has(r.sourceId)) return false;
        if (r.sourceType === 'task' && hiddenTaskIdSet.has(r.sourceId)) return false;
        if (r.sourceType === 'file_return' && hiddenFileIdSet.has(r.sourceId)) return false;
        return true;
      });

      const canSeeRestricted = can('restricted.view', currentUser);

      // Exclude audit logs referencing hidden cases or containing restricted flags when lacking restricted.view
      auditLogs = auditLogs.filter((a) => {
        if (a.entity === 'Case' && hiddenCaseIdSet.has(a.entityId)) return false;
        if (hiddenCaseIdSet.has(a.entityId)) return false;
        const oldVal = a.oldValue as Record<string, unknown> | null;
        const newVal = a.newValue as Record<string, unknown> | null;
        if (oldVal?.caseId && typeof oldVal.caseId === 'string' && hiddenCaseIdSet.has(oldVal.caseId)) return false;
        if (newVal?.caseId && typeof newVal.caseId === 'string' && hiddenCaseIdSet.has(newVal.caseId)) return false;
        if (!canSeeRestricted && (oldVal?.restricted === true || newVal?.restricted === true)) return false;
        return true;
      });
    }

    const counts: ChamberBackupCounts = {
      clients: clients.length,
      cases: cases.length,
      hearings: hearings.length,
      hearingDateHistory: hearingDateHistory.length,
      tasks: tasks.length,
      physicalFiles: physicalFiles.length,
      fileMovements: fileMovements.length,
      reminders: reminders.length,
      auditLog: auditLogs.length,
    };

    const isEncrypted = Boolean(options?.password && options.password.trim().length > 0);
    const nowIso = new Date().toISOString();

    const metadata: ChamberBackupMetadata = {
      version: '1.0',
      exportedAt: nowIso,
      exportedBy: currentUser.id,
      exportedByName: currentUser.name,
      firmId,
      firmName: firmData.name,
      schemaVersion: 1,
      encrypted: isEncrypted,
      counts,
    };

    const data: ChamberBackupData = {
      firm: firmData,
      clients,
      cases,
      hearings,
      hearingDateHistory,
      tasks,
      physicalFiles,
      fileMovements,
      reminders,
      auditLogs,
    };

    const canonicalDataStr = canonicalStringify(data);
    const checksum = await computeSha256(canonicalDataStr);

    const plainPayload: ChamberBackupPayload = {
      magic: 'BD_LEGAL_PRACTICE_BACKUP',
      metadata,
      checksum,
      data,
    };

    let finalPayload: ChamberBackupPayload | EncryptedBackupPayload = plainPayload;
    if (isEncrypted && options?.password) {
      finalPayload = await encryptChamberBackup(plainPayload, options.password);
    }

    const jsonString = JSON.stringify(finalPayload, null, 2);
    const dateStamp = nowIso.split('T')[0];
    const safeFirmName = firmData.name.toLowerCase().replace(/[^a-z0-9]+/g, '-');
    const filename = `${safeFirmName}-backup-${dateStamp}${isEncrypted ? '.enc.json' : '.json'}`;

    // Record audit trail
    await this.auditLogRepo.record(context, {
      entity: 'ChamberBackup',
      entityId: firmId,
      action: 'BACKUP_EXPORT',
      oldValue: null,
      newValue: {
        filename,
        encrypted: isEncrypted,
        counts,
        checksum: isEncrypted ? (finalPayload as EncryptedBackupPayload).checksum : checksum,
      },
    });

    return {
      filename,
      payload: finalPayload,
      jsonString,
      metadata,
      checksum,
      isEncrypted,
    };
  }

  async inspectBackup(
    context: SecurityContext,
    fileContent: string,
    password?: string
  ): Promise<RestorePreview> {
    const { currentUser } = context;
    if (!can('data.export', currentUser) && !can('settings.manage', currentUser)) {
      throw new Error('Permission denied: insufficient privileges to inspect chamber backup');
    }

    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(fileContent);
    } catch {
      return {
        valid: false,
        isEncrypted: false,
        checksumMatched: false,
        firmMatch: false,
        warnings: ['File is not valid JSON'],
        error: 'Invalid JSON format',
      };
    }

    if (parsed.magic === 'BD_LEGAL_PRACTICE_BACKUP_ENCRYPTED') {
      if (!password) {
        const meta = parsed.metadata as ChamberBackupMetadata | undefined;
        return {
          valid: true,
          isEncrypted: true,
          metadata: meta,
          checksumMatched: true,
          firmMatch: meta?.firmId === currentUser.firmId,
          warnings: ['Backup is password-encrypted with AES-GCM-256. Enter chamber encryption password to inspect and restore.'],
          counts: meta?.counts,
        };
      }

      try {
        const decrypted = await decryptChamberBackup(parsed as unknown as EncryptedBackupPayload, password);
        return this.validateAndPreviewPlainPayload(decrypted, currentUser.firmId);
      } catch (err: unknown) {
        const errorMsg = err instanceof Error ? err.message : 'Decryption failed';
        return {
          valid: false,
          isEncrypted: true,
          checksumMatched: false,
          firmMatch: false,
          warnings: [errorMsg],
          error: errorMsg || 'Decryption failed: Incorrect password or corrupted payload',
        };
      }
    }

    if (parsed.magic === 'BD_LEGAL_PRACTICE_BACKUP') {
      return this.validateAndPreviewPlainPayload(parsed as unknown as ChamberBackupPayload, currentUser.firmId);
    }

    return {
      valid: false,
      isEncrypted: false,
      checksumMatched: false,
      firmMatch: false,
      warnings: ['Unrecognized backup file format. Magic header missing or unsupported.'],
      error: 'Unrecognized backup format',
    };
  }

  private async validateAndPreviewPlainPayload(
    payload: ChamberBackupPayload,
    currentFirmId: string
  ): Promise<RestorePreview> {
    const warnings: string[] = [];
    if (!payload.metadata || !payload.data) {
      return {
        valid: false,
        isEncrypted: false,
        checksumMatched: false,
        firmMatch: false,
        warnings: ['Backup structure is missing metadata or data section.'],
        error: 'Incomplete backup structure',
      };
    }

    // Verify SHA-256 checksum
    const canonicalStr = canonicalStringify(payload.data);
    const calculatedChecksum = await computeSha256(canonicalStr);
    const checksumMatched = calculatedChecksum === payload.checksum;

    if (!checksumMatched) {
      warnings.push(
        `Tamper Warning: Checksum mismatch! Expected ${payload.checksum.slice(0, 10)}... but calculated ${calculatedChecksum.slice(0, 10)}... Data may have been tampered with or corrupted.`
      );
    }

    const firmMatch = payload.metadata.firmId === currentFirmId;
    if (!firmMatch) {
      warnings.push(
        `Firm Context Warning: Backup is from chamber "${payload.metadata.firmName}" (ID: ${payload.metadata.firmId}). Restoring will safely map records to your current chamber.`
      );
    }

    return {
      valid: checksumMatched,
      isEncrypted: false,
      metadata: payload.metadata,
      checksumMatched,
      firmMatch,
      warnings,
      counts: payload.metadata.counts,
      payload,
    };
  }

  async restoreBackup(
    context: SecurityContext,
    fileContent: string,
    options: {
      password?: string;
      mode: RestoreMode;
    }
  ): Promise<RestoreResult> {
    const { currentUser } = context;
    if (!can('settings.manage', currentUser)) {
      throw new Error('Permission denied: settings.manage required to restore backup');
    }
    assertNotReadOnly(currentUser.firmId);

    // Inspect and validate first
    const preview = await this.inspectBackup(context, fileContent, options.password);
    if (!preview.valid || !preview.payload) {
      throw new Error(
        preview.error ||
          (preview.warnings.length > 0
            ? preview.warnings[0]
            : 'Backup validation failed. Checksum mismatch or invalid payload.')
      );
    }

    const payload = preview.payload;
    const firmId = currentUser.firmId;
    const nowIso = new Date().toISOString();

    const previousStore = localStore.getData();
    const oldCounts = {
      clients: previousStore.clients.filter((c) => c.firmId === firmId).length,
      cases: previousStore.cases.filter((c) => c.firmId === firmId).length,
      tasks: previousStore.tasks.filter((t) => t.firmId === firmId).length,
    };

    // Ensure all records in the backup use current firmId
    const remapRecord = <T extends { firmId: string }>(rec: T): T => ({
      ...rec,
      firmId,
    });

    const incomingClients = (payload.data.clients || []).map(remapRecord);
    const incomingCases = (payload.data.cases || []).map(remapRecord);
    const incomingHearings = (payload.data.hearings || []).map(remapRecord);
    const incomingDateHist = (payload.data.hearingDateHistory || []).map(remapRecord);
    const incomingTasks = (payload.data.tasks || []).map(remapRecord);
    const incomingFiles = (payload.data.physicalFiles || []).map(remapRecord);
    const incomingMovements = (payload.data.fileMovements || []).map(remapRecord);
    const incomingReminders = (payload.data.reminders || []).map(remapRecord);

    let auditLogRecordId = '';

    localStore.mutate((store) => {
      if (options.mode === 'clean') {
        // Retain foreign-firm records (multi-tenant safety) and replace current firm's records
        store.clients = [
          ...store.clients.filter((c) => c.firmId !== firmId),
          ...incomingClients,
        ];
        store.cases = [
          ...store.cases.filter((c) => c.firmId !== firmId),
          ...incomingCases,
        ];
        store.hearings = [
          ...store.hearings.filter((h) => h.firmId !== firmId),
          ...incomingHearings,
        ];
        store.hearingDateHistory = [
          ...store.hearingDateHistory.filter((hd) => hd.firmId !== firmId),
          ...incomingDateHist,
        ];
        store.tasks = [
          ...store.tasks.filter((t) => t.firmId !== firmId),
          ...incomingTasks,
        ];
        store.physicalFiles = [
          ...store.physicalFiles.filter((f) => f.firmId !== firmId),
          ...incomingFiles,
        ];
        store.fileMovements = [
          ...store.fileMovements.filter((fm) => fm.firmId !== firmId),
          ...incomingMovements,
        ];
        store.reminders = [
          ...store.reminders.filter((r) => r.firmId !== firmId),
          ...incomingReminders,
        ];
      } else {
        // Merge mode: upsert by ID
        const mergeList = <T extends { id: string }>(currentList: T[], incoming: T[]): T[] => {
          const map = new Map<string, T>();
          currentList.forEach((item) => map.set(item.id, item));
          incoming.forEach((item) => map.set(item.id, item));
          return Array.from(map.values());
        };

        store.clients = mergeList(store.clients, incomingClients);
        store.cases = mergeList(store.cases, incomingCases);
        store.hearings = mergeList(store.hearings, incomingHearings);
        store.hearingDateHistory = mergeList(store.hearingDateHistory, incomingDateHist);
        store.tasks = mergeList(store.tasks, incomingTasks);
        store.physicalFiles = mergeList(store.physicalFiles, incomingFiles);
        store.fileMovements = mergeList(store.fileMovements, incomingMovements);
        store.reminders = mergeList(store.reminders, incomingReminders);
      }

      // Generate restore audit log entry
      const auditEntry: AuditLogRecord = {
        id: generateUUID(),
        firmId,
        userId: currentUser.id,
        userName: currentUser.name,
        entity: 'ChamberBackup',
        entityId: firmId,
        action: 'BACKUP_RESTORE',
        oldValue: oldCounts,
        newValue: {
          mode: options.mode,
          sourceFirm: payload.metadata.firmName,
          sourceFirmId: payload.metadata.firmId,
          exportedAt: payload.metadata.exportedAt,
          restoredCounts: payload.metadata.counts,
          restoredAt: nowIso,
        },
        timestamp: nowIso,
      };

      auditLogRecordId = auditEntry.id;
      store.auditLogs.unshift(auditEntry);
    });

    return {
      success: true,
      mode: options.mode,
      restoredAt: nowIso,
      restoredBy: currentUser.id,
      restoredByName: currentUser.name,
      auditLogId: auditLogRecordId,
      counts: payload.metadata.counts,
      message: `Successfully restored ${payload.metadata.counts.cases} cases, ${payload.metadata.counts.clients} clients, and ${payload.metadata.counts.hearings} hearings in ${options.mode} mode.`,
    };
  }
}
