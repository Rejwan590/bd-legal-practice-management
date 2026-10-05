import { can } from '../../permissions';
import { IAuditLogRepository, IFirmRepository } from '../interfaces';
import { localStore } from '../mockStore';
import { FirmRecord, SecurityContext } from '../types';
import { assertNotReadOnly } from './common';

export class MockFirmRepository implements IFirmRepository {
  private auditRepo: IAuditLogRepository;

  constructor(auditRepo: IAuditLogRepository) {
    this.auditRepo = auditRepo;
  }

  async getFirm(context: SecurityContext): Promise<FirmRecord> {
    const { currentUser } = context;
    const firm = localStore.getData().firm;
    if (firm.id !== currentUser.firmId) {
      throw new Error('Unauthorized firm access');
    }
    return firm;
  }

  async updateFirm(
    context: SecurityContext,
    updateData: Partial<Omit<FirmRecord, 'id' | 'firmId' | 'createdAt' | 'deletedAt' | 'createdBy'>>
  ): Promise<FirmRecord> {
    if (!can('settings.manage', context.currentUser)) {
      throw new Error('Permission denied: settings.manage required to modify chamber settings');
    }

    const { currentUser } = context;
    assertNotReadOnly(currentUser.firmId);

    const currentFirm = localStore.getData().firm;
    if (currentFirm.id !== currentUser.firmId) {
      throw new Error('Unauthorized firm access');
    }

    const oldFirmData = { ...currentFirm };
    const now = new Date().toISOString();

    let savedFirm: FirmRecord | null = null;

    localStore.mutate((data) => {
      data.firm = {
        ...data.firm,
        ...updateData,
        updatedAt: now,
        updatedBy: currentUser.id,
      };
      savedFirm = { ...data.firm };
    });

    if (!savedFirm) {
      throw new Error('Failed to save firm settings');
    }

    await this.auditRepo.record(context, {
      entity: 'Firm',
      entityId: currentFirm.id,
      action: 'UPDATE',
      oldValue: oldFirmData as unknown as Record<string, unknown>,
      newValue: savedFirm as unknown as Record<string, unknown>,
    });

    return savedFirm;
  }
}
