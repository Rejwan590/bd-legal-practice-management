import { IClientRepository, ClientLinkedOverview } from '../../interfaces';
import { ClientRecord, SecurityContext } from '../../types';
import { restFetch } from './restCommon';

export class RestClientRepository implements IClientRepository {
  async list(_context: SecurityContext, filter?: { search?: string }): Promise<ClientRecord[]> {
    const params = new URLSearchParams();
    if (filter?.search) params.set('search', filter.search);
    const qs = params.toString() ? `?${params.toString()}` : '';
    return restFetch<ClientRecord[]>(`/clients${qs}`);
  }

  async getById(_context: SecurityContext, id: string): Promise<ClientRecord | null> {
    try {
      return await restFetch<ClientRecord>(`/clients/${id}`);
    } catch (err: unknown) {
      if (err && typeof err === 'object' && 'status' in err && (err as { status: number }).status === 404) return null;
      throw err;
    }
  }

  async create(
    _context: SecurityContext,
    data: {
      name: string;
      nameBn?: string;
      phone: string;
      email?: string;
      address: string;
      notes: string;
    }
  ): Promise<ClientRecord> {
    return restFetch<ClientRecord>('/clients', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async update(
    _context: SecurityContext,
    id: string,
    data: Partial<Omit<ClientRecord, 'id' | 'firmId' | 'createdAt' | 'deletedAt' | 'createdBy'>>
  ): Promise<ClientRecord> {
    return restFetch<ClientRecord>(`/clients/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
  }

  async delete(
    _context: SecurityContext,
    id: string
  ): Promise<{ success: boolean; softDeleted: true }> {
    return restFetch<{ success: boolean; softDeleted: true }>(`/clients/${id}`, {
      method: 'DELETE',
    });
  }

  async archive(context: SecurityContext, id: string): Promise<ClientRecord> {
    return this.update(context, id, { archived: true });
  }

  async getLinkedOverview(
    _context: SecurityContext,
    clientId: string
  ): Promise<ClientLinkedOverview> {
    return restFetch<ClientLinkedOverview>(`/clients/${clientId}/overview`);
  }
}
