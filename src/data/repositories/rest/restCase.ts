import { ICaseRepository } from '../../interfaces';
import { BaseRecord, CaseRecord, SecurityContext } from '../../types';
import { restFetch } from './restCommon';

export class RestCaseRepository implements ICaseRepository {
  async list(
    _context: SecurityContext,
    filter?: {
      search?: string;
      status?: 'ongoing' | 'closed' | 'all';
      court?: string;
      matterType?: string;
      clientId?: string;
    }
  ): Promise<CaseRecord[]> {
    const params = new URLSearchParams();
    if (filter?.search) params.set('search', filter.search);
    if (filter?.status) params.set('status', filter.status);
    if (filter?.court) params.set('court', filter.court);
    if (filter?.matterType) params.set('matterType', filter.matterType);
    if (filter?.clientId) params.set('clientId', filter.clientId);
    const qs = params.toString() ? `?${params.toString()}` : '';
    return restFetch<CaseRecord[]>(`/cases${qs}`);
  }

  async getById(_context: SecurityContext, id: string): Promise<CaseRecord | null> {
    try {
      return await restFetch<CaseRecord>(`/cases/${id}`);
    } catch (err: unknown) {
      if (err && typeof err === 'object' && 'status' in err && (err as { status: number }).status === 404) return null;
      throw err;
    }
  }

  async create(
    _context: SecurityContext,
    data: Omit<CaseRecord, keyof BaseRecord | 'nextHearingAt'>
  ): Promise<CaseRecord> {
    return restFetch<CaseRecord>('/cases', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async update(
    _context: SecurityContext,
    id: string,
    data: Partial<Omit<CaseRecord, 'id' | 'firmId' | 'createdAt' | 'deletedAt' | 'createdBy'>>
  ): Promise<CaseRecord> {
    return restFetch<CaseRecord>(`/cases/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
  }

  async delete(
    _context: SecurityContext,
    id: string
  ): Promise<{ success: boolean; softDeleted: true }> {
    return restFetch<{ success: boolean; softDeleted: true }>(`/cases/${id}`, {
      method: 'DELETE',
    });
  }

  async getLinkedCounts(
    _context: SecurityContext,
    caseId: string
  ): Promise<{
    hearingsCount: number;
    tasksCount: number;
    filesCount: number;
    remindersCount: number;
  }> {
    return restFetch<{
      hearingsCount: number;
      tasksCount: number;
      filesCount: number;
      remindersCount: number;
    }>(`/cases/${caseId}/counts`);
  }

  async getByClientId(context: SecurityContext, clientId: string): Promise<CaseRecord[]> {
    return this.list(context, { clientId });
  }

  async checkDuplicate(
    _context: SecurityContext,
    caseNumber: string,
    court: string,
    excludeId?: string
  ): Promise<boolean> {
    const params = new URLSearchParams({
      caseNumber,
      court,
    });
    if (excludeId) params.set('excludeId', excludeId);
    const res = await restFetch<{ isDuplicate: boolean }>(`/cases/check-duplicate?${params.toString()}`);
    return Boolean(res?.isDuplicate);
  }
}
