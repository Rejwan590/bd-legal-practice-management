import { can, PermissionKey } from '../../permissions';
import { IAuditLogRepository, IUserRepository } from '../interfaces';
import { localStore } from '../mockStore';
import { SecurityContext, UserRecord } from '../types';
import { assertNotReadOnly } from './common';

export class MockUserRepository implements IUserRepository {
  private auditRepo: IAuditLogRepository;

  constructor(auditRepo: IAuditLogRepository) {
    this.auditRepo = auditRepo;
  }

  async list(context: SecurityContext): Promise<UserRecord[]> {
    const { currentUser } = context;
    // Firm isolation + soft-delete check
    return localStore
      .getData()
      .users.filter((u) => u.firmId === currentUser.firmId && u.deletedAt === null);
  }

  async getById(context: SecurityContext, id: string): Promise<UserRecord | null> {
    const { currentUser } = context;
    const user = localStore
      .getData()
      .users.find((u) => u.id === id && u.firmId === currentUser.firmId && u.deletedAt === null);
    return user || null;
  }

  async updatePermissions(
    context: SecurityContext,
    targetUserId: string,
    permissions: PermissionKey[]
  ): Promise<UserRecord> {
    // Only users with users.manage or Owner can modify staff permissions
    if (!can('users.manage', context.currentUser)) {
      throw new Error('Permission denied: users.manage required to modify permissions');
    }
    assertNotReadOnly(context.currentUser.firmId);

    const { currentUser } = context;
    const store = localStore.getData();
    const targetUser = store.users.find(
      (u) => u.id === targetUserId && u.firmId === currentUser.firmId && u.deletedAt === null
    );

    if (!targetUser) {
      throw new Error('User not found');
    }

    const oldPermissions = [...targetUser.permissions];
    const now = new Date().toISOString();

    let updatedUser: UserRecord | null = null;

    localStore.mutate((data) => {
      const userToUpdate = data.users.find((u) => u.id === targetUserId);
      if (userToUpdate) {
        userToUpdate.permissions = [...permissions];
        userToUpdate.updatedAt = now;
        userToUpdate.updatedBy = currentUser.id;
        updatedUser = { ...userToUpdate };
      }
    });

    if (!updatedUser) {
      throw new Error('Failed to update user');
    }

    await this.auditRepo.record(context, {
      entity: 'User',
      entityId: targetUserId,
      action: 'UPDATE',
      oldValue: { permissions: oldPermissions },
      newValue: { permissions },
    });

    return updatedUser;
  }
}
