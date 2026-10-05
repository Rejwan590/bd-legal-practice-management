import { IFirmRepository } from '../../interfaces';
import { FirmRecord, SecurityContext } from '../../types';
import { restFetch } from './restCommon';

export class RestFirmRepository implements IFirmRepository {
  async getFirm(_context: SecurityContext): Promise<FirmRecord> {
    return restFetch<FirmRecord>('/firms/current');
  }

  async updateFirm(
    _context: SecurityContext,
    data: Partial<Omit<FirmRecord, 'id' | 'firmId' | 'createdAt' | 'deletedAt' | 'createdBy'>>
  ): Promise<FirmRecord> {
    return restFetch<FirmRecord>('/firms/current', {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
  }
}
