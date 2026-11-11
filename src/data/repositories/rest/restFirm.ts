import { can } from '../../../permissions';
import { IFirmRepository } from '../../interfaces';
import { FirmRecord, SecurityContext } from '../../types';
import { restFetch } from './restCommon';

export class RestFirmRepository implements IFirmRepository {
  async getFirm(context: SecurityContext): Promise<FirmRecord> {
    if (!context?.currentUser?.firmId) {
      throw new Error('Unauthorized firm access');
    }
    const firm = await restFetch<FirmRecord>('/firms/current');
    if (!firm?.id || firm.id !== context.currentUser.firmId) {
      throw new Error('Unauthorized firm access');
    }
    return firm;
  }

  async updateFirm(
    context: SecurityContext,
    data: Partial<Omit<FirmRecord, 'id' | 'firmId' | 'createdAt' | 'deletedAt' | 'createdBy'>>
  ): Promise<FirmRecord> {
    if (!can('settings.manage', context.currentUser) || context.currentUser.role !== 'Owner') {
      throw new Error('Permission denied: settings.manage required to modify chamber settings');
    }
    if (!context?.currentUser?.firmId) {
      throw new Error('Unauthorized firm access');
    }
    const updated = await restFetch<FirmRecord>('/firms/current', {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
    if (!updated?.id || updated.id !== context.currentUser.firmId) {
      throw new Error('Unauthorized firm access');
    }
    return updated;
  }
}
