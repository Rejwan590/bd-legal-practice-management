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
}
