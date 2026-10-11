import { IUserRepository } from '../../interfaces';
import { SecurityContext, UserRecord } from '../../types';
import { PermissionKey } from '../../../permissions';
import { restFetch } from './restCommon';

export class RestUserRepository implements IUserRepository {
  async list(_context: SecurityContext): Promise<UserRecord[]> {
    return restFetch<UserRecord[]>('/users');
  }

  async getById(_context: SecurityContext, id: string): Promise<UserRecord | null> {
    try {
      return await restFetch<UserRecord>(`/users/${id}`);
    } catch (err: unknown) {
      if (err && typeof err === 'object' && 'status' in err && (err as { status: number }).status === 404) return null;
      throw err;
    }
  }

  async create(
    _context: SecurityContext,
    data: {
      name: string;
      email: string;
      role?: 'Owner' | 'Staff';
      jobType?: string;
      jobTitleLabel?: string | null;
      reportsToUserId?: string | null;
      preset?: string;
      permissions?: PermissionKey[];
      language?: 'en' | 'bn';
      temporaryPassword?: string;
    }
  ): Promise<UserRecord & { temporaryPassword?: string }> {
    return restFetch<UserRecord & { temporaryPassword?: string }>('/users', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async update(
    _context: SecurityContext,
    targetUserId: string,
    data: {
      name?: string;
      email?: string;
      jobType?: string;
      jobTitleLabel?: string | null;
      reportsToUserId?: string | null;
      language?: 'en' | 'bn';
    }
  ): Promise<UserRecord> {
    return restFetch<UserRecord>(`/users/${targetUserId}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
  }

  async updatePermissions(
    _context: SecurityContext,
    targetUserId: string,
    permissions: PermissionKey[]
  ): Promise<UserRecord> {
    return restFetch<UserRecord>(`/users/${targetUserId}/permissions`, {
      method: 'PATCH',
      body: JSON.stringify({ permissions }),
    });
  }

  async updateRole(
    _context: SecurityContext,
    targetUserId: string,
    role: 'Owner' | 'Staff'
  ): Promise<UserRecord> {
    return restFetch<UserRecord>(`/users/${targetUserId}/role`, {
      method: 'PATCH',
      body: JSON.stringify({ role }),
    });
  }

  async deactivate(
    _context: SecurityContext,
    targetUserId: string,
    reassignToUserId?: string
  ): Promise<UserRecord & { warnings?: string[]; openCasesCount?: number; futureHearingsCount?: number }> {
    return restFetch<UserRecord & { warnings?: string[]; openCasesCount?: number; futureHearingsCount?: number }>(
      `/users/${targetUserId}/deactivate`,
      {
        method: 'POST',
        body: JSON.stringify(reassignToUserId ? { reassignToUserId } : {}),
      }
    );
  }

  async reactivate(_context: SecurityContext, targetUserId: string): Promise<UserRecord> {
    return restFetch<UserRecord>(`/users/${targetUserId}/reactivate`, {
      method: 'POST',
    });
  }

  async reassignTeam(
    _context: SecurityContext,
    fromLawyerId: string,
    toLawyerId: string
  ): Promise<{ success: boolean; affectedUserIds: string[] }> {
    return restFetch<{ success: boolean; affectedUserIds: string[] }>(
      `/users/${fromLawyerId}/reassign-team`,
      {
        method: 'POST',
        body: JSON.stringify({ toLawyerId }),
      }
    );
  }
}
