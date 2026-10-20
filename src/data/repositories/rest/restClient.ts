import { IClientRepository, ClientLinkedOverview } from '../../interfaces';
import { ClientNoteRecord, ClientPhotoRecord, ClientRecord, SecurityContext } from '../../types';
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

  async getPhoto(_context: SecurityContext, clientId: string): Promise<ClientPhotoRecord | null> {
    try {
      return await restFetch<ClientPhotoRecord>(`/clients/${clientId}/photo`);
    } catch (err: unknown) {
      if (err && typeof err === 'object' && 'status' in err && (err as { status: number }).status === 404) return null;
      throw err;
    }
  }

  async savePhoto(
    _context: SecurityContext,
    clientId: string,
    mime: string,
    bytes: string
  ): Promise<ClientPhotoRecord> {
    return restFetch<ClientPhotoRecord>(`/clients/${clientId}/photo`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ mime, data: bytes }),
    });
  }

  async deletePhoto(_context: SecurityContext, clientId: string): Promise<void> {
    await restFetch<{ success: boolean }>(`/clients/${clientId}/photo`, {
      method: 'DELETE',
    });
  }

  async listNotes(
    _context: SecurityContext,
    clientId: string,
    options?: { limit?: number; offset?: number }
  ): Promise<{ notes: ClientNoteRecord[]; total: number }> {
    const params = new URLSearchParams();
    if (options?.limit !== undefined) params.set('limit', String(options.limit));
    if (options?.offset !== undefined) params.set('offset', String(options.offset));
    const qs = params.toString() ? `?${params.toString()}` : '';
    return restFetch<{ notes: ClientNoteRecord[]; total: number }>(`/clients/${clientId}/notes${qs}`);
  }

  async createNote(
    _context: SecurityContext,
    clientId: string,
    data: { noteDate: string; body: string }
  ): Promise<ClientNoteRecord> {
    return restFetch<ClientNoteRecord>(`/clients/${clientId}/notes`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async updateNote(
    _context: SecurityContext,
    clientId: string,
    noteId: string,
    data: { noteDate?: string; body?: string }
  ): Promise<ClientNoteRecord> {
    return restFetch<ClientNoteRecord>(`/clients/${clientId}/notes/${noteId}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
  }

  async deleteNote(
    _context: SecurityContext,
    clientId: string,
    noteId: string
  ): Promise<{ success: boolean; softDeleted: true }> {
    return restFetch<{ success: boolean; softDeleted: true }>(`/clients/${clientId}/notes/${noteId}`, {
      method: 'DELETE',
    });
  }
}
