import { IPhysicalFileRepository } from '../../interfaces';
import {
  FileMovementRecord,
  PhysicalFileRecord,
  PhysicalFileStatus,
  SecurityContext,
} from '../../types';
import { restFetch } from './restCommon';

export class RestPhysicalFileRepository implements IPhysicalFileRepository {
  async list(
    _context: SecurityContext,
    filter?: {
      caseId?: string;
      clientId?: string;
      status?: PhysicalFileStatus | 'all';
      holderId?: string;
      search?: string;
    }
  ): Promise<PhysicalFileRecord[]> {
    const params = new URLSearchParams();
    if (filter?.caseId) params.set('caseId', filter.caseId);
    if (filter?.clientId) params.set('clientId', filter.clientId);
    if (filter?.status && filter.status !== 'all') params.set('status', filter.status);
    if (filter?.holderId) params.set('holderId', filter.holderId);
    if (filter?.search) params.set('search', filter.search);

    const qs = params.toString();
    return restFetch<PhysicalFileRecord[]>(`/physical-files${qs ? `?${qs}` : ''}`);
  }

  async getById(_context: SecurityContext, id: string): Promise<PhysicalFileRecord | null> {
    try {
      return await restFetch<PhysicalFileRecord>(`/physical-files/${encodeURIComponent(id)}`);
    } catch (err: any) {
      if (err?.status === 404) return null;
      throw err;
    }
  }

  async getBySerial(_context: SecurityContext, serial: string): Promise<PhysicalFileRecord | null> {
    try {
      return await restFetch<PhysicalFileRecord>(
        `/physical-files/by-serial/${encodeURIComponent(serial)}`
      );
    } catch (err: any) {
      if (err?.status === 404) return null;
      throw err;
    }
  }

  async create(
    _context: SecurityContext,
    data: {
      title: string;
      caseId?: string | null;
      clientId?: string | null;
      shelfLocation?: string;
      notes?: string;
      serial?: string;
    }
  ): Promise<PhysicalFileRecord> {
    return restFetch<PhysicalFileRecord>('/physical-files', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async update(
    _context: SecurityContext,
    id: string,
    data: Partial<
      Omit<
        PhysicalFileRecord,
        'id' | 'firmId' | 'serial' | 'createdAt' | 'deletedAt' | 'createdBy'
      >
    >
  ): Promise<PhysicalFileRecord> {
    return restFetch<PhysicalFileRecord>(`/physical-files/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
  }

  async checkOut(
    _context: SecurityContext,
    id: string,
    holderId: string,
    dueBackAt: string,
    note?: string
  ): Promise<{ file: PhysicalFileRecord; movement: FileMovementRecord }> {
    return restFetch<{ file: PhysicalFileRecord; movement: FileMovementRecord }>(
      `/physical-files/${encodeURIComponent(id)}/check-out`,
      {
        method: 'POST',
        body: JSON.stringify({ holderId, dueBackAt, note }),
      }
    );
  }

  async checkIn(
    _context: SecurityContext,
    id: string,
    shelfLocation?: string,
    note?: string
  ): Promise<{ file: PhysicalFileRecord; movement: FileMovementRecord }> {
    return restFetch<{ file: PhysicalFileRecord; movement: FileMovementRecord }>(
      `/physical-files/${encodeURIComponent(id)}/check-in`,
      {
        method: 'POST',
        body: JSON.stringify({ shelfLocation, note }),
      }
    );
  }

  async dispatchToCourt(
    _context: SecurityContext,
    id: string,
    courtName: string,
    holderId: string,
    dueBackAt: string,
    note?: string
  ): Promise<{ file: PhysicalFileRecord; movement: FileMovementRecord }> {
    return restFetch<{ file: PhysicalFileRecord; movement: FileMovementRecord }>(
      `/physical-files/${encodeURIComponent(id)}/dispatch-court`,
      {
        method: 'POST',
        body: JSON.stringify({ courtName, holderId, dueBackAt, note }),
      }
    );
  }

  async getMovements(_context: SecurityContext, fileId: string): Promise<FileMovementRecord[]> {
    return restFetch<FileMovementRecord[]>(
      `/physical-files/${encodeURIComponent(fileId)}/movements`
    );
  }

  async delete(
    _context: SecurityContext,
    id: string
  ): Promise<{ success: boolean; softDeleted: true }> {
    return restFetch<{ success: boolean; softDeleted: true }>(
      `/physical-files/${encodeURIComponent(id)}`,
      { method: 'DELETE' }
    );
  }

  async getNextSerial(_context: SecurityContext): Promise<string> {
    const res = await restFetch<{ serial: string }>('/physical-files/next-serial');
    return res.serial;
  }

  async getByCaseId(_context: SecurityContext, caseId: string): Promise<PhysicalFileRecord | null> {
    try {
      return await restFetch<PhysicalFileRecord>(
        `/physical-files/by-case/${encodeURIComponent(caseId)}`
      );
    } catch (err: any) {
      if (err?.status === 404) return null;
      throw err;
    }
  }
}
