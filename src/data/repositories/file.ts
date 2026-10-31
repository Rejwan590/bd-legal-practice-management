import { can } from '../../permissions';
import { IAuditLogRepository, IPhysicalFileRepository, IReminderRepository } from '../interfaces';
import { localStore } from '../mockStore';
import {
  FileMovementRecord,
  PhysicalFileRecord,
  PhysicalFileStatus,
  SecurityContext,
} from '../types';
import { getVisibleCaseIdsForContext } from './case';
import { assertNotReadOnly, generateUUID } from './common';

export class MockPhysicalFileRepository implements IPhysicalFileRepository {
  private auditRepo: IAuditLogRepository;
  public reminderRepo?: IReminderRepository;

  constructor(auditRepo: IAuditLogRepository, reminderRepo?: IReminderRepository) {
    this.auditRepo = auditRepo;
    this.reminderRepo = reminderRepo;
  }

  async list(
    context: SecurityContext,
    filter?: {
      caseId?: string;
      clientId?: string;
      status?: PhysicalFileStatus | 'all';
      holderId?: string;
      search?: string;
    }
  ): Promise<PhysicalFileRecord[]> {
    if (!can('files.view', context.currentUser)) {
      throw new Error('Permission denied: files.view required');
    }

    const { currentUser } = context;
    const store = localStore.getData();
    const visibleCaseIds = getVisibleCaseIdsForContext(context);

    let files = (store.physicalFiles || []).filter(
      (f) =>
        f.firmId === currentUser.firmId &&
        f.deletedAt === null &&
        (!f.caseId || visibleCaseIds.has(f.caseId))
    );

    if (filter?.caseId) {
      files = files.filter((f) => f.caseId === filter.caseId);
    }
    if (filter?.clientId) {
      files = files.filter((f) => f.clientId === filter.clientId);
    }
    if (filter?.status && filter.status !== 'all') {
      files = files.filter((f) => f.status === filter.status);
    }
    if (filter?.holderId) {
      files = files.filter((f) => f.currentHolderId === filter.holderId);
    }
    if (filter?.search) {
      const q = filter.search.toLowerCase();
      files = files.filter(
        (f) =>
          f.serial.toLowerCase().includes(q) ||
          f.title.toLowerCase().includes(q) ||
          (f.shelfLocation && f.shelfLocation.toLowerCase().includes(q)) ||
          (f.currentHolderName && f.currentHolderName.toLowerCase().includes(q)) ||
          (f.notes && f.notes.toLowerCase().includes(q))
      );
    }

    return files.sort((a, b) => a.serial.localeCompare(b.serial));
  }

  async getById(context: SecurityContext, id: string): Promise<PhysicalFileRecord | null> {
    if (!can('files.view', context.currentUser)) {
      throw new Error('Permission denied: files.view required');
    }

    const { currentUser } = context;
    const store = localStore.getData();
    const file = (store.physicalFiles || []).find(
      (f) => f.id === id && f.firmId === currentUser.firmId && f.deletedAt === null
    );

    if (!file) return null;

    if (file.caseId && !can('restricted.view', currentUser)) {
      const caseRec = (store.cases || []).find((c) => c.id === file.caseId);
      if (caseRec?.restricted) {
        throw new Error('Permission denied: file belongs to confidential case');
      }
    }

    if (file.caseId) {
      const visibleCaseIds = getVisibleCaseIdsForContext(context);
      if (!visibleCaseIds.has(file.caseId)) {
        return null;
      }
    }

    return file;
  }

  async getBySerial(context: SecurityContext, serial: string): Promise<PhysicalFileRecord | null> {
    if (!can('files.view', context.currentUser)) {
      throw new Error('Permission denied: files.view required');
    }

    const { currentUser } = context;
    const store = localStore.getData();
    const file = (store.physicalFiles || []).find(
      (f) =>
        f.serial.toLowerCase() === serial.toLowerCase() &&
        f.firmId === currentUser.firmId &&
        f.deletedAt === null
    );

    if (!file) return null;

    if (file.caseId && !can('restricted.view', currentUser)) {
      const caseRec = (store.cases || []).find((c) => c.id === file.caseId);
      if (caseRec?.restricted) {
        throw new Error('Permission denied: file belongs to confidential case');
      }
    }

    if (file.caseId) {
      const visibleCaseIds = getVisibleCaseIdsForContext(context);
      if (!visibleCaseIds.has(file.caseId)) {
        return null;
      }
    }

    return file;
  }

  async getNextSerial(context: SecurityContext): Promise<string> {
    const store = localStore.getData();
    const firmFiles = (store.physicalFiles || []).filter(
      (f) => f.firmId === context.currentUser.firmId
    );

    // Extract numbers from serials like "F-000101"
    let maxNumber = 100;
    firmFiles.forEach((f) => {
      const match = f.serial.match(/F-(\d+)/);
      if (match) {
        const num = parseInt(match[1], 10);
        if (!isNaN(num) && num > maxNumber) {
          maxNumber = num;
        }
      }
    });

    const nextNumber = maxNumber + 1;
    return `F-${String(nextNumber).padStart(6, '0')}`;
  }

  async create(
    context: SecurityContext,
    data: {
      title: string;
      caseId?: string | null;
      clientId?: string | null;
      shelfLocation?: string;
      notes?: string;
      serial?: string;
    }
  ): Promise<PhysicalFileRecord> {
    if (!can('files.manage', context.currentUser)) {
      throw new Error('Permission denied: files.manage required to create physical files');
    }
    assertNotReadOnly(context.currentUser.firmId);

    const { currentUser } = context;
    const now = new Date().toISOString();
    // Task 5 SAFE ID: Use generateUUID() instead of Date.now() / Math.random()
    const id = generateUUID();
    const serial = data.serial || (await this.getNextSerial(context));

    const newFile: PhysicalFileRecord = {
      id,
      firmId: currentUser.firmId,
      serial,
      caseId: data.caseId || null,
      clientId: data.clientId || null,
      title: data.title.trim(),
      shelfLocation: data.shelfLocation?.trim() || 'General File Rack',
      status: 'in_chamber',
      currentHolderId: null,
      currentHolderName: null,
      checkedOutAt: null,
      dueBackAt: null,
      notes: data.notes?.trim() || undefined,
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
      createdBy: currentUser.id,
      updatedBy: currentUser.id,
    };

    localStore.mutate((s) => {
      s.physicalFiles = [...(s.physicalFiles || []), newFile];
    });

    await this.auditRepo.record(context, {
      entity: 'PhysicalFile',
      entityId: id,
      action: 'CREATE',
      oldValue: null,
      newValue: newFile as unknown as Record<string, unknown>,
    });

    return newFile;
  }

  async update(
    context: SecurityContext,
    id: string,
    updateData: Partial<
      Omit<PhysicalFileRecord, 'id' | 'firmId' | 'serial' | 'createdAt' | 'deletedAt' | 'createdBy'>
    >
  ): Promise<PhysicalFileRecord> {
    if (!can('files.manage', context.currentUser)) {
      throw new Error('Permission denied: files.manage required to update physical files');
    }
    assertNotReadOnly(context.currentUser.firmId);

    const { currentUser } = context;
    const store = localStore.getData();
    const existing = (store.physicalFiles || []).find(
      (f) => f.id === id && f.firmId === currentUser.firmId && f.deletedAt === null
    );

    if (!existing) {
      throw new Error('Physical file not found');
    }

    const oldSnapshot = { ...existing };
    const now = new Date().toISOString();
    let updated: PhysicalFileRecord | null = null;

    localStore.mutate((s) => {
      const idx = (s.physicalFiles || []).findIndex((f) => f.id === id);
      if (idx !== -1) {
        s.physicalFiles[idx] = {
          ...s.physicalFiles[idx],
          ...updateData,
          updatedAt: now,
          updatedBy: currentUser.id,
        };
        updated = { ...s.physicalFiles[idx] };
      }
    });

    if (!updated) {
      throw new Error('Failed to update physical file');
    }

    const finalUpdated: PhysicalFileRecord = updated;
    await this.auditRepo.record(context, {
      entity: 'PhysicalFile',
      entityId: id,
      action: 'UPDATE',
      oldValue: oldSnapshot as unknown as Record<string, unknown>,
      newValue: finalUpdated as unknown as Record<string, unknown>,
    });

    return finalUpdated;
  }

  async checkOut(
    context: SecurityContext,
    id: string,
    holderId: string,
    dueBackAt: string,
    note?: string
  ): Promise<{ file: PhysicalFileRecord; movement: FileMovementRecord }> {
    if (!can('files.manage', context.currentUser)) {
      throw new Error('Permission denied: files.manage required to check out files');
    }
    assertNotReadOnly(context.currentUser.firmId);

    const { currentUser } = context;
    const store = localStore.getData();
    const existing = (store.physicalFiles || []).find(
      (f) => f.id === id && f.firmId === currentUser.firmId && f.deletedAt === null
    );

    if (!existing) {
      throw new Error('Physical file not found');
    }

    const holder = (store.users || []).find((u) => u.id === holderId);
    const holderName = holder ? holder.name : 'Unknown Advocate';
    const now = new Date().toISOString();
    // Task 5 SAFE ID: Use generateUUID() instead of Date.now() / Math.random()
    const movId = generateUUID();

    const movement: FileMovementRecord = {
      id: movId,
      firmId: currentUser.firmId,
      fileId: id,
      action: 'CHECKOUT',
      userId: holderId,
      userName: holderName,
      at: now,
      dueBackAt,
      note: note?.trim() || 'File checked out for chamber review',
    };

    let updatedFile: PhysicalFileRecord | null = null;

    localStore.mutate((s) => {
      const idx = (s.physicalFiles || []).findIndex((f) => f.id === id);
      if (idx !== -1) {
        s.physicalFiles[idx] = {
          ...s.physicalFiles[idx],
          status: 'checked_out',
          currentHolderId: holderId,
          currentHolderName: holderName,
          checkedOutAt: now,
          dueBackAt,
          updatedAt: now,
          updatedBy: currentUser.id,
        };
        updatedFile = { ...s.physicalFiles[idx] };
      }
      s.fileMovements = [...(s.fileMovements || []), movement];
    });

    if (!updatedFile) {
      throw new Error('Failed to check out physical file');
    }

    const finalFile: PhysicalFileRecord = updatedFile;
    await this.auditRepo.record(context, {
      entity: 'PhysicalFile',
      entityId: id,
      action: 'PHYSICAL_FILE_CHECKED_OUT',
      oldValue: {
        fileId: id,
        serial: existing.serial,
        title: existing.title,
        caseId: existing.caseId,
        status: existing.status,
        shelfLocation: existing.shelfLocation,
        currentHolderId: existing.currentHolderId,
        currentHolderName: existing.currentHolderName,
        checkedOutAt: existing.checkedOutAt,
        dueBackAt: existing.dueBackAt,
      },
      newValue: {
        fileId: id,
        serial: finalFile.serial,
        title: finalFile.title,
        caseId: finalFile.caseId,
        status: finalFile.status,
        shelfLocation: finalFile.shelfLocation,
        currentHolderId: finalFile.currentHolderId,
        currentHolderName: finalFile.currentHolderName,
        checkedOutAt: finalFile.checkedOutAt,
        dueBackAt: finalFile.dueBackAt,
        movementId: movId,
        note: movement.note,
        file: finalFile,
        movement,
      },
    });

    if (this.reminderRepo && dueBackAt) {
      const remindAt = new Date(new Date(dueBackAt).getTime() - 4 * 60 * 60 * 1000).toISOString();
      const updated = await this.reminderRepo.rescheduleBySourceId(context, id, dueBackAt, remindAt);
      if (updated.updatedCount === 0) {
        await this.reminderRepo.create(context, {
          userId: holderId,
          sourceType: 'file_return',
          sourceId: id,
          title: `File Return Due: ${finalFile.serial} (${finalFile.title})`,
          description: `Location: ${finalFile.shelfLocation || 'Chamber Rack'}. Current holder: ${finalFile.currentHolderName}`,
          remindAt,
          dueAt: dueBackAt,
        });
      }
    }

    return { file: finalFile, movement };
  }

  async checkIn(
    context: SecurityContext,
    id: string,
    shelfLocation?: string,
    note?: string
  ): Promise<{ file: PhysicalFileRecord; movement: FileMovementRecord }> {
    if (!can('files.manage', context.currentUser)) {
      throw new Error('Permission denied: files.manage required to check in files');
    }
    assertNotReadOnly(context.currentUser.firmId);

    const { currentUser } = context;
    const store = localStore.getData();
    const existing = (store.physicalFiles || []).find(
      (f) => f.id === id && f.firmId === currentUser.firmId && f.deletedAt === null
    );

    if (!existing) {
      throw new Error('Physical file not found');
    }

    const now = new Date().toISOString();
    // Task 5 SAFE ID: Use generateUUID() instead of Date.now() / Math.random()
    const movId = generateUUID();

    const movement: FileMovementRecord = {
      id: movId,
      firmId: currentUser.firmId,
      fileId: id,
      action: 'CHECKIN',
      userId: currentUser.id,
      userName: currentUser.name,
      at: now,
      dueBackAt: null,
      note: note?.trim() || `Returned to chamber custody at ${shelfLocation || existing.shelfLocation || 'rack'}`,
    };

    let updatedFile: PhysicalFileRecord | null = null;

    localStore.mutate((s) => {
      const idx = (s.physicalFiles || []).findIndex((f) => f.id === id);
      if (idx !== -1) {
        s.physicalFiles[idx] = {
          ...s.physicalFiles[idx],
          status: 'in_chamber',
          currentHolderId: null,
          currentHolderName: null,
          checkedOutAt: null,
          dueBackAt: null,
          shelfLocation: shelfLocation?.trim() || s.physicalFiles[idx].shelfLocation,
          updatedAt: now,
          updatedBy: currentUser.id,
        };
        updatedFile = { ...s.physicalFiles[idx] };
      }
      s.fileMovements = [...(s.fileMovements || []), movement];
    });

    if (!updatedFile) {
      throw new Error('Failed to check in physical file');
    }

    // Find the latest checkout movement to connect this return event to its checkout
    const previousCheckout = (store.fileMovements || [])
      .filter((m) => m.fileId === id && (m.action === 'CHECKOUT' || m.action === 'COURT_DISPATCH'))
      .sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime())[0];

    const finalFile: PhysicalFileRecord = updatedFile;
    await this.auditRepo.record(context, {
      entity: 'PhysicalFile',
      entityId: id,
      action: 'PHYSICAL_FILE_CHECKED_IN',
      oldValue: {
        fileId: id,
        serial: existing.serial,
        title: existing.title,
        caseId: existing.caseId,
        status: existing.status,
        shelfLocation: existing.shelfLocation,
        currentHolderId: existing.currentHolderId,
        currentHolderName: existing.currentHolderName,
        checkedOutAt: existing.checkedOutAt,
        dueBackAt: existing.dueBackAt,
      },
      newValue: {
        fileId: id,
        serial: finalFile.serial,
        title: finalFile.title,
        caseId: finalFile.caseId,
        status: finalFile.status,
        shelfLocation: finalFile.shelfLocation,
        currentHolderId: null,
        currentHolderName: null,
        checkedOutAt: null,
        dueBackAt: null,
        movementId: movId,
        linkedCheckoutMovementId: previousCheckout?.id || null,
        returnedBy: currentUser.id,
        returnedByName: currentUser.name,
        note: movement.note,
        file: finalFile,
        movement,
      },
    });

    if (this.reminderRepo) {
      await this.reminderRepo.clearBySourceId(context, id);
    }

    return { file: finalFile, movement };
  }

  async dispatchToCourt(
    context: SecurityContext,
    id: string,
    courtName: string,
    holderId: string,
    dueBackAt: string,
    note?: string
  ): Promise<{ file: PhysicalFileRecord; movement: FileMovementRecord }> {
    if (!can('files.manage', context.currentUser)) {
      throw new Error('Permission denied: files.manage required to dispatch files to court');
    }
    assertNotReadOnly(context.currentUser.firmId);

    const { currentUser } = context;
    const store = localStore.getData();
    const existing = (store.physicalFiles || []).find(
      (f) => f.id === id && f.firmId === currentUser.firmId && f.deletedAt === null
    );

    if (!existing) {
      throw new Error('Physical file not found');
    }

    const holder = (store.users || []).find((u) => u.id === holderId);
    const holderName = holder ? holder.name : currentUser.name;
    const now = new Date().toISOString();
    // Task 5 SAFE ID: Use generateUUID() instead of Date.now() / Math.random()
    const movId = generateUUID();

    const movement: FileMovementRecord = {
      id: movId,
      firmId: currentUser.firmId,
      fileId: id,
      action: 'COURT_DISPATCH',
      userId: holderId,
      userName: holderName,
      at: now,
      dueBackAt,
      note: note?.trim() || `Dispatched to ${courtName} for court hearing`,
    };

    let updatedFile: PhysicalFileRecord | null = null;

    localStore.mutate((s) => {
      const idx = (s.physicalFiles || []).findIndex((f) => f.id === id);
      if (idx !== -1) {
        s.physicalFiles[idx] = {
          ...s.physicalFiles[idx],
          status: 'in_court',
          currentHolderId: holderId,
          currentHolderName: holderName,
          checkedOutAt: now,
          dueBackAt,
          updatedAt: now,
          updatedBy: currentUser.id,
        };
        updatedFile = { ...s.physicalFiles[idx] };
      }
      s.fileMovements = [...(s.fileMovements || []), movement];
    });

    if (!updatedFile) {
      throw new Error('Failed to dispatch file to court');
    }

    const finalFile: PhysicalFileRecord = updatedFile;
    await this.auditRepo.record(context, {
      entity: 'PhysicalFile',
      entityId: id,
      action: 'PHYSICAL_FILE_CHECKED_OUT',
      oldValue: {
        fileId: id,
        serial: existing.serial,
        title: existing.title,
        caseId: existing.caseId,
        status: existing.status,
        shelfLocation: existing.shelfLocation,
        currentHolderId: existing.currentHolderId,
        currentHolderName: existing.currentHolderName,
        checkedOutAt: existing.checkedOutAt,
        dueBackAt: existing.dueBackAt,
      },
      newValue: {
        fileId: id,
        serial: finalFile.serial,
        title: finalFile.title,
        caseId: finalFile.caseId,
        status: finalFile.status,
        shelfLocation: finalFile.shelfLocation,
        currentHolderId: finalFile.currentHolderId,
        currentHolderName: finalFile.currentHolderName,
        checkedOutAt: finalFile.checkedOutAt,
        dueBackAt: finalFile.dueBackAt,
        movementId: movId,
        note: movement.note,
        file: finalFile,
        movement,
      },
    });

    if (this.reminderRepo && dueBackAt) {
      const remindAt = new Date(new Date(dueBackAt).getTime() - 4 * 60 * 60 * 1000).toISOString();
      const updated = await this.reminderRepo.rescheduleBySourceId(context, id, dueBackAt, remindAt);
      if (updated.updatedCount === 0) {
        await this.reminderRepo.create(context, {
          userId: holderId,
          sourceType: 'file_return',
          sourceId: id,
          title: `File Return Due: ${finalFile.serial} (${finalFile.title})`,
          description: `Dispatched to ${courtName}. Current holder: ${finalFile.currentHolderName}`,
          remindAt,
          dueAt: dueBackAt,
        });
      }
    }

    return { file: finalFile, movement };
  }

  async getMovements(context: SecurityContext, fileId: string): Promise<FileMovementRecord[]> {
    if (!can('files.view', context.currentUser)) {
      throw new Error('Permission denied: files.view required');
    }

    const { currentUser } = context;
    const store = localStore.getData();
    return (store.fileMovements || [])
      .filter((m) => m.fileId === fileId && m.firmId === currentUser.firmId)
      .sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());
  }

  async delete(
    context: SecurityContext,
    id: string
  ): Promise<{ success: boolean; softDeleted: true }> {
    if (!can('files.manage', context.currentUser)) {
      throw new Error('Permission denied: files.manage required to delete physical files');
    }
    assertNotReadOnly(context.currentUser.firmId);

    const { currentUser } = context;
    const store = localStore.getData();
    const existing = (store.physicalFiles || []).find(
      (f) => f.id === id && f.firmId === currentUser.firmId && f.deletedAt === null
    );

    if (!existing) {
      throw new Error('Physical file not found');
    }

    const now = new Date().toISOString();

    localStore.mutate((s) => {
      const target = (s.physicalFiles || []).find((f) => f.id === id);
      if (target) {
        target.deletedAt = now;
        target.updatedAt = now;
        target.updatedBy = currentUser.id;
      }
    });

    await this.auditRepo.record(context, {
      entity: 'PhysicalFile',
      entityId: id,
      action: 'DELETE',
      oldValue: existing as unknown as Record<string, unknown>,
      newValue: { deletedAt: now, softDeleted: true },
    });

    if (this.reminderRepo) {
      await this.reminderRepo.clearBySourceId(context, id);
    }

    return { success: true, softDeleted: true };
  }

  async getByCaseId(context: SecurityContext, caseId: string): Promise<PhysicalFileRecord | null> {
    const list = await this.list(context, { caseId });
    return list[0] || null;
  }
}
