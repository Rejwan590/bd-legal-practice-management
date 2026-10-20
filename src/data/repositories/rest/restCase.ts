import { ICaseRepository } from '../../interfaces';
import { BaseRecord, CaseNoteRecord, CaseRecord, CaseShareRecord, SecurityContext } from '../../types';
import { restFetch } from './restCommon';

export class RestCaseRepository implements ICaseRepository {
  async list(
    _context: SecurityContext,
    filter?: {
      search?: string;
      status?: 'ongoing' | 'pending' | 'closed' | 'all';
      court?: string;
      matterType?: string;
      clientId?: string;
      scope?: 'my' | 'team' | 'all';
      sortBy?: 'case_date' | 'created_at' | 'updated_at';
      sortOrder?: 'asc' | 'desc';
    }
  ): Promise<CaseRecord[]> {
    const params = new URLSearchParams();
    if (filter?.search) params.set('search', filter.search);
    if (filter?.status) params.set('status', filter.status);
    if (filter?.court) params.set('court', filter.court);
    if (filter?.matterType) params.set('matterType', filter.matterType);
    if (filter?.clientId) params.set('clientId', filter.clientId);
    if (filter?.scope) params.set('scope', filter.scope);
    if (filter?.sortBy) params.set('sortBy', filter.sortBy);
    if (filter?.sortOrder) params.set('sortOrder', filter.sortOrder);
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

  async listShares(_context: SecurityContext, caseId: string): Promise<CaseShareRecord[]> {
    return restFetch<CaseShareRecord[]>(`/cases/${caseId}/shares`);
  }

  async shareCase(_context: SecurityContext, caseId: string, userId: string): Promise<CaseShareRecord> {
    return restFetch<CaseShareRecord>(`/cases/${caseId}/shares`, {
      method: 'POST',
      body: JSON.stringify({ userId }),
    });
  }

  async unshareCase(_context: SecurityContext, caseId: string, shareIdOrUserId: string): Promise<void> {
    await restFetch<{ success: boolean }>(`/cases/${caseId}/shares/${shareIdOrUserId}`, {
      method: 'DELETE',
    });
  }

  async listNotes(
    _context: SecurityContext,
    caseId: string,
    options?: { limit?: number; offset?: number }
  ): Promise<{ notes: CaseNoteRecord[]; total: number }> {
    const params = new URLSearchParams();
    if (options?.limit !== undefined) params.set('limit', String(options.limit));
    if (options?.offset !== undefined) params.set('offset', String(options.offset));
    const qs = params.toString() ? `?${params.toString()}` : '';
    return restFetch<{ notes: CaseNoteRecord[]; total: number }>(`/cases/${caseId}/notes${qs}`);
  }

  async createNote(
    _context: SecurityContext,
    caseId: string,
    data: { noteDate: string; body: string }
  ): Promise<CaseNoteRecord> {
    return restFetch<CaseNoteRecord>(`/cases/${caseId}/notes`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async updateNote(
    _context: SecurityContext,
    caseId: string,
    noteId: string,
    data: { noteDate?: string; body?: string }
  ): Promise<CaseNoteRecord> {
    return restFetch<CaseNoteRecord>(`/cases/${caseId}/notes/${noteId}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
  }

  async deleteNote(
    _context: SecurityContext,
    caseId: string,
    noteId: string
  ): Promise<{ success: boolean; softDeleted: true }> {
    return restFetch<{ success: boolean; softDeleted: true }>(`/cases/${caseId}/notes/${noteId}`, {
      method: 'DELETE',
    });
  }
}
