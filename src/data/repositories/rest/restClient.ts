import { IClientRepository, ClientLinkedOverview } from '../../interfaces';
import { ClientNoteRecord, ClientPhotoRecord, ClientRecord, SecurityContext } from '../../types';
import { restFetch, getApiBaseUrl, createRestError } from './restCommon';

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

  async restore(context: SecurityContext, id: string): Promise<ClientRecord> {
    return restFetch<ClientRecord>(`/clients/${id}/restore`, {
      method: 'POST',
    });
  }

  async getLinkedOverview(
    _context: SecurityContext,
    clientId: string
  ): Promise<ClientLinkedOverview> {
    return restFetch<ClientLinkedOverview>(`/clients/${clientId}/overview`);
  }

  async getPhoto(_context: SecurityContext, clientId: string): Promise<ClientPhotoRecord | null> {
    try {
      const baseUrl = getApiBaseUrl();
      const url = `${baseUrl}/clients/${clientId}/photo`;
      const response = await fetch(url, {
        headers: {
          Accept: 'application/json, image/*',
        },
        credentials: 'include',
      });

      if (response.status === 404) return null;
      if (response.status === 401) {
        if (typeof window !== 'undefined' && typeof window.dispatchEvent === 'function') {
          window.dispatchEvent(new CustomEvent('auth:unauthorized'));
        }
        throw createRestError('Session expired or unauthorized', 401, 'UNAUTHORIZED');
      }
      if (!response.ok) {
        throw createRestError(`Failed to fetch photo: ${response.statusText}`, response.status);
      }

      const contentType = response.headers.get('content-type') || '';
      if (contentType.includes('application/json')) {
        const json = await response.json();
        return {
          clientId,
          firmId: json.firmId || _context.currentUser.firmId,
          mime: json.mime || 'image/jpeg',
          bytes: json.bytes,
          dataUrl: json.dataUrl || (json.bytes && json.mime ? `data:${json.mime};base64,${json.bytes}` : undefined),
          updatedAt: json.updatedAt || new Date().toISOString(),
        };
      }

      // Fallback for raw binary image stream response
      const arrayBuffer = await response.arrayBuffer();
      let base64 = '';
      if (typeof Buffer !== 'undefined') {
        base64 = Buffer.from(arrayBuffer).toString('base64');
      } else {
        const bytes = new Uint8Array(arrayBuffer);
        let binary = '';
        for (let i = 0; i < bytes.byteLength; i++) {
          binary += String.fromCharCode(bytes[i]);
        }
        base64 = btoa(binary);
      }
      const mime = contentType || 'image/jpeg';
      return {
        clientId,
        firmId: _context.currentUser.firmId,
        mime,
        bytes: base64,
        dataUrl: `data:${mime};base64,${base64}`,
        updatedAt: response.headers.get('last-modified') || new Date().toISOString(),
      };
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
    const rawBase64 = bytes.includes(',') ? bytes.split(',')[1] : bytes;
    const res = await restFetch<{
      success?: boolean;
      clientId?: string;
      firmId?: string;
      mime?: string;
      bytes?: string;
      dataUrl?: string;
      updatedAt?: string;
    }>(`/clients/${clientId}/photo`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ mime, data: rawBase64 }),
    });

    return {
      clientId,
      firmId: res.firmId || _context.currentUser.firmId,
      mime: res.mime || mime,
      bytes: res.bytes || rawBase64,
      dataUrl: res.dataUrl || (bytes.startsWith('data:') ? bytes : `data:${mime};base64,${rawBase64}`),
      updatedAt: res.updatedAt || new Date().toISOString(),
    };
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
