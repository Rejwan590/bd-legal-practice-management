import { can, PermissionKey } from '../../permissions';
import {
  ALL_PERMISSION_KEYS,
  isLawyerOrOwner,
  JobType,
  ROLE_PRESETS,
  VALID_JOB_TYPES,
} from '../../rolePresets';
import { isSupervisorOf } from '../caseVisibility';
import { IAuditLogRepository, IUserRepository } from '../interfaces';
import { localStore } from '../mockStore';
import { SecurityContext, UserRecord } from '../types';
import { assertNotReadOnly, generateUUID } from './common';

export class MockUserRepository implements IUserRepository {
  private auditRepo: IAuditLogRepository;

  constructor(auditRepo: IAuditLogRepository) {
    this.auditRepo = auditRepo;
  }

  private assertCanManageUsers(context: SecurityContext): void {
    if (context.currentUser.role !== 'Owner' && !can('users.manage', context.currentUser)) {
      throw new Error('Permission denied: Owner or users.manage required');
    }
    assertNotReadOnly(context.currentUser.firmId);
  }

  private validatePermissionsList(permissions: string[]): PermissionKey[] {
    for (const p of permissions) {
      if (!(ALL_PERMISSION_KEYS as readonly string[]).includes(p)) {
        throw new Error(`Unknown permission key: ${p}`);
      }
    }
    return permissions as PermissionKey[];
  }

  private validateReportsTo(
    firmId: string,
    userId: string | null,
    reportsToUserId: string | null | undefined
  ): void {
    if (!reportsToUserId) return;
    if (userId && reportsToUserId === userId) {
      throw new Error('A user cannot report to themselves');
    }
    const store = localStore.getData();
    const supervisor = store.users.find(
      (u) => u.id === reportsToUserId && u.firmId === firmId && u.deletedAt === null
    );
    if (!supervisor) {
      throw new Error('Supervisor not found in this firm');
    }
    if (supervisor.status === 'deactivated') {
      throw new Error('Cannot report to a deactivated user');
    }
    if (!isLawyerOrOwner(supervisor)) {
      throw new Error('Supervisor must be an Owner or Lawyer');
    }
    if (userId) {
      const firmUsers = store.users.filter((u) => u.firmId === firmId && u.deletedAt === null);
      if (isSupervisorOf(firmUsers, userId, reportsToUserId)) {
        throw new Error('Cycle detected in reporting hierarchy');
      }
    }
  }

  async list(context: SecurityContext): Promise<UserRecord[]> {
    const { currentUser } = context;
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

  async create(
    context: SecurityContext,
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
    this.assertCanManageUsers(context);
    const { currentUser } = context;
    const store = localStore.getData();

    const activeFirmUsers = store.users.filter(
      (u) =>
        u.firmId === currentUser.firmId &&
        u.deletedAt === null &&
        (u.status ?? 'active') === 'active'
    );
    const seatLimit = store.firm.id === currentUser.firmId ? (store.firm.seatLimit ?? 15) : 15;
    if (activeFirmUsers.length >= seatLimit) {
      throw new Error(`Seat limit reached (${seatLimit} active seats allowed on current plan)`);
    }

    const emailNormalized = data.email.trim().toLowerCase();
    const duplicateEmail = store.users.find(
      (u) => u.email.toLowerCase() === emailNormalized && u.deletedAt === null
    );
    if (duplicateEmail) {
      throw new Error('A user with this email already exists');
    }

    const role: 'Owner' | 'Staff' = data.role === 'Owner' ? 'Owner' : 'Staff';
    let jobType: JobType = (data.jobType as JobType) || (role === 'Owner' ? 'lawyer_senior' : 'other');
    let permissions: PermissionKey[] = [];

    if (data.preset && ROLE_PRESETS[data.preset]) {
      const p = ROLE_PRESETS[data.preset];
      jobType = (data.jobType as JobType) || p.jobType;
      permissions = [...p.permissions] as PermissionKey[];
    } else if (data.permissions) {
      permissions = this.validatePermissionsList(data.permissions);
    } else if (role === 'Owner') {
      permissions = [...ALL_PERMISSION_KEYS] as PermissionKey[];
    } else {
      const matchingPreset = Object.values(ROLE_PRESETS).find((pr) => pr.jobType === jobType);
      permissions = matchingPreset
        ? ([...matchingPreset.permissions] as PermissionKey[])
        : (['cases.view', 'clients.view', 'tasks.view', 'files.view', 'calendar.view'] as PermissionKey[]);
    }

    if (!VALID_JOB_TYPES.includes(jobType)) {
      throw new Error(`Invalid job type: ${jobType}`);
    }

    const reportsToUserId = data.reportsToUserId || null;
    this.validateReportsTo(currentUser.firmId, null, reportsToUserId);

    const tempPassword =
      data.temporaryPassword?.trim() ||
      `Temp#${Math.random().toString(36).slice(2, 8).toUpperCase()}9!`;
    const now = new Date().toISOString();

    const newUser: UserRecord = {
      id: generateUUID(),
      firmId: currentUser.firmId,
      name: data.name.trim(),
      email: emailNormalized,
      role,
      jobType,
      jobTitleLabel: data.jobTitleLabel?.trim() || null,
      reportsToUserId,
      active: true,
      status: 'active',
      mustChangePassword: true,
      permissions,
      language: data.language || 'en',
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
      createdBy: currentUser.id,
      updatedBy: currentUser.id,
    };

    localStore.mutate((s) => {
      s.users.push(newUser);
    });

    await this.auditRepo.record(context, {
      entity: 'User',
      entityId: newUser.id,
      action: 'CREATE',
      oldValue: null,
      newValue: {
        name: newUser.name,
        email: newUser.email,
        role: newUser.role,
        jobType: newUser.jobType,
        reportsToUserId: newUser.reportsToUserId,
      },
    });

    return { ...newUser, temporaryPassword: tempPassword };
  }

  async update(
    context: SecurityContext,
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
    this.assertCanManageUsers(context);
    const { currentUser } = context;
    const store = localStore.getData();

    const targetUser = store.users.find(
      (u) => u.id === targetUserId && u.firmId === currentUser.firmId && u.deletedAt === null
    );
    if (!targetUser) {
      throw new Error('User not found');
    }

    if (data.email !== undefined) {
      const emailNormalized = data.email.trim().toLowerCase();
      const dup = store.users.find(
        (u) => u.id !== targetUserId && u.email.toLowerCase() === emailNormalized && u.deletedAt === null
      );
      if (dup) {
        throw new Error('Email is already in use by another user');
      }
    }

    if (data.jobType !== undefined && !VALID_JOB_TYPES.includes(data.jobType as JobType)) {
      throw new Error(`Invalid job type: ${data.jobType}`);
    }

    if (data.reportsToUserId !== undefined) {
      this.validateReportsTo(currentUser.firmId, targetUserId, data.reportsToUserId);
    }

    const oldSnapshot = {
      name: targetUser.name,
      email: targetUser.email,
      jobType: targetUser.jobType,
      jobTitleLabel: targetUser.jobTitleLabel,
      reportsToUserId: targetUser.reportsToUserId,
      language: targetUser.language,
    };

    const now = new Date().toISOString();
    let updatedUser: UserRecord | null = null;

    localStore.mutate((s) => {
      const u = s.users.find((item) => item.id === targetUserId);
      if (u) {
        if (data.name !== undefined) u.name = data.name.trim();
        if (data.email !== undefined) u.email = data.email.trim().toLowerCase();
        if (data.jobType !== undefined) u.jobType = data.jobType as JobType;
        if (data.jobTitleLabel !== undefined) u.jobTitleLabel = data.jobTitleLabel?.trim() || null;
        if (data.reportsToUserId !== undefined) u.reportsToUserId = data.reportsToUserId || null;
        if (data.language !== undefined) u.language = data.language;
        u.updatedAt = now;
        u.updatedBy = currentUser.id;
        updatedUser = { ...u };
      }
    });

    if (!updatedUser) {
      throw new Error('Failed to update user');
    }

    await this.auditRepo.record(context, {
      entity: 'User',
      entityId: targetUserId,
      action: 'UPDATE',
      oldValue: oldSnapshot,
      newValue: data as Record<string, unknown>,
    });

    return updatedUser;
  }

  async updatePermissions(
    context: SecurityContext,
    targetUserId: string,
    permissions: PermissionKey[]
  ): Promise<UserRecord> {
    this.assertCanManageUsers(context);
    const { currentUser } = context;

    if (targetUserId === currentUser.id) {
      throw new Error('You cannot change your own permissions');
    }

    const validatedPerms = this.validatePermissionsList(permissions);
    const store = localStore.getData();
    const targetUser = store.users.find(
      (u) => u.id === targetUserId && u.firmId === currentUser.firmId && u.deletedAt === null
    );

    if (!targetUser) {
      throw new Error('User not found');
    }

    if (targetUser.role === 'Owner') {
      throw new Error('Cannot modify permissions of an Owner');
    }

    const oldPermissions = [...targetUser.permissions];
    const now = new Date().toISOString();

    let updatedUser: UserRecord | null = null;

    localStore.mutate((data) => {
      const userToUpdate = data.users.find((u) => u.id === targetUserId);
      if (userToUpdate) {
        userToUpdate.permissions = [...validatedPerms];
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
      newValue: { permissions: validatedPerms },
    });

    return updatedUser;
  }

  async updateRole(
    context: SecurityContext,
    targetUserId: string,
    role: 'Owner' | 'Staff'
  ): Promise<UserRecord> {
    this.assertCanManageUsers(context);
    const { currentUser } = context;
    const store = localStore.getData();

    const targetUser = store.users.find(
      (u) => u.id === targetUserId && u.firmId === currentUser.firmId && u.deletedAt === null
    );
    if (!targetUser) {
      throw new Error('User not found');
    }

    if (targetUser.role === 'Owner' && role === 'Staff') {
      const activeOwners = store.users.filter(
        (u) =>
          u.firmId === currentUser.firmId &&
          u.deletedAt === null &&
          u.role === 'Owner' &&
          (u.status ?? 'active') === 'active'
      );
      if (activeOwners.length <= 1) {
        throw new Error('Cannot demote the last active Owner of the chamber');
      }
    }

    const oldRole = targetUser.role;
    const now = new Date().toISOString();
    let updatedUser: UserRecord | null = null;

    localStore.mutate((s) => {
      const u = s.users.find((item) => item.id === targetUserId);
      if (u) {
        u.role = role;
        if (role === 'Owner') {
          u.permissions = [...ALL_PERMISSION_KEYS] as PermissionKey[];
        }
        u.updatedAt = now;
        u.updatedBy = currentUser.id;
        updatedUser = { ...u };
      }
    });

    if (!updatedUser) {
      throw new Error('Failed to update user role');
    }

    await this.auditRepo.record(context, {
      entity: 'User',
      entityId: targetUserId,
      action: 'UPDATE',
      oldValue: { role: oldRole },
      newValue: { role },
    });

    return updatedUser;
  }

  async deactivate(
    context: SecurityContext,
    targetUserId: string,
    reassignToUserId?: string
  ): Promise<UserRecord & { warnings?: string[]; openCasesCount?: number; futureHearingsCount?: number }> {
    this.assertCanManageUsers(context);
    const { currentUser } = context;

    if (targetUserId === currentUser.id) {
      throw new Error('You cannot deactivate your own account');
    }

    const store = localStore.getData();
    const targetUser = store.users.find(
      (u) => u.id === targetUserId && u.firmId === currentUser.firmId && u.deletedAt === null
    );
    if (!targetUser) {
      throw new Error('User not found');
    }

    if (targetUser.role === 'Owner') {
      const activeOwners = store.users.filter(
        (u) =>
          u.firmId === currentUser.firmId &&
          u.deletedAt === null &&
          u.role === 'Owner' &&
          (u.status ?? 'active') === 'active'
      );
      if (activeOwners.length <= 1) {
        throw new Error('Cannot deactivate the last active Owner of the chamber');
      }
    }

    if (reassignToUserId) {
      const replacement = store.users.find(
        (u) =>
          u.id === reassignToUserId &&
          u.firmId === currentUser.firmId &&
          u.deletedAt === null &&
          (u.status ?? 'active') === 'active'
      );
      if (!replacement) {
        throw new Error('Replacement user not found or not active in this firm');
      }
    }

    const now = new Date().toISOString();
    const openCases = (store.cases || []).filter(
      (c) =>
        c.firmId === currentUser.firmId &&
        c.deletedAt === null &&
        c.status === 'ongoing' &&
        c.responsibleLawyerId === targetUserId
    );
    const futureHearings = (store.hearings || []).filter(
      (h) =>
        h.firmId === currentUser.firmId &&
        h.deletedAt === null &&
        h.status === 'scheduled' &&
        h.appearingLawyerId === targetUserId
    );
    const openTasks = (store.tasks || []).filter(
      (t) =>
        t.firmId === currentUser.firmId &&
        t.deletedAt === null &&
        (t.status === 'pending' || t.status === 'in_progress') &&
        t.assignedTo === targetUserId
    );

    const warnings: string[] = [];
    if (!reassignToUserId) {
      if (openCases.length > 0) {
        warnings.push(`User is responsible lawyer on ${openCases.length} ongoing case(s).`);
      }
      if (futureHearings.length > 0) {
        warnings.push(`User is appearing lawyer on ${futureHearings.length} scheduled hearing(s).`);
      }
      if (openTasks.length > 0) {
        warnings.push(`User holds ${openTasks.length} open task(s).`);
      }
    }

    let updatedUser: UserRecord | null = null;

    localStore.mutate((s) => {
      const u = s.users.find((item) => item.id === targetUserId);
      if (u) {
        u.active = false;
        u.status = 'deactivated';
        u.updatedAt = now;
        u.updatedBy = currentUser.id;
        updatedUser = { ...u };
      }

      if (reassignToUserId) {
        for (const c of s.cases || []) {
          if (c.firmId === currentUser.firmId && c.deletedAt === null && c.responsibleLawyerId === targetUserId) {
            c.responsibleLawyerId = reassignToUserId;
            c.updatedAt = now;
          }
        }
        for (const h of s.hearings || []) {
          if (
            h.firmId === currentUser.firmId &&
            h.deletedAt === null &&
            h.status === 'scheduled' &&
            h.appearingLawyerId === targetUserId
          ) {
            h.appearingLawyerId = reassignToUserId;
            h.updatedAt = now;
          }
        }
        for (const t of s.tasks || []) {
          if (
            t.firmId === currentUser.firmId &&
            t.deletedAt === null &&
            (t.status === 'pending' || t.status === 'in_progress') &&
            t.assignedTo === targetUserId
          ) {
            const rep = s.users.find((x) => x.id === reassignToUserId);
            t.assignedTo = reassignToUserId;
            if (rep) t.assignedToName = rep.name;
            t.updatedAt = now;
          }
        }
        for (const sub of s.users) {
          if (sub.firmId === currentUser.firmId && sub.deletedAt === null && sub.reportsToUserId === targetUserId) {
            sub.reportsToUserId = reassignToUserId;
            sub.updatedAt = now;
          }
        }
      }
    });

    if (!updatedUser) {
      throw new Error('Failed to deactivate user');
    }

    await this.auditRepo.record(context, {
      entity: 'User',
      entityId: targetUserId,
      action: 'UPDATE',
      oldValue: { status: targetUser.status ?? 'active' },
      newValue: {
        status: 'deactivated',
        reassignedTo: reassignToUserId || null,
        warnings,
      },
    });

    return {
      ...(updatedUser as UserRecord),
      warnings,
      openCasesCount: openCases.length,
      futureHearingsCount: futureHearings.length,
    };
  }

  async reactivate(context: SecurityContext, targetUserId: string): Promise<UserRecord> {
    this.assertCanManageUsers(context);
    const { currentUser } = context;
    const store = localStore.getData();

    const targetUser = store.users.find(
      (u) => u.id === targetUserId && u.firmId === currentUser.firmId && u.deletedAt === null
    );
    if (!targetUser) {
      throw new Error('User not found');
    }

    const activeFirmUsers = store.users.filter(
      (u) =>
        u.firmId === currentUser.firmId &&
        u.deletedAt === null &&
        (u.status ?? 'active') === 'active'
    );
    const seatLimit = store.firm.id === currentUser.firmId ? (store.firm.seatLimit ?? 15) : 15;
    if (activeFirmUsers.length >= seatLimit) {
      throw new Error(`Seat limit reached (${seatLimit} active seats allowed on current plan)`);
    }

    const now = new Date().toISOString();
    let updatedUser: UserRecord | null = null;

    localStore.mutate((s) => {
      const u = s.users.find((item) => item.id === targetUserId);
      if (u) {
        u.active = true;
        u.status = 'active';
        u.updatedAt = now;
        u.updatedBy = currentUser.id;
        updatedUser = { ...u };
      }
    });

    if (!updatedUser) {
      throw new Error('Failed to reactivate user');
    }

    await this.auditRepo.record(context, {
      entity: 'User',
      entityId: targetUserId,
      action: 'UPDATE',
      oldValue: { status: 'deactivated' },
      newValue: { status: 'active' },
    });

    return updatedUser;
  }

  async reassignTeam(
    context: SecurityContext,
    fromLawyerId: string,
    toLawyerId: string
  ): Promise<{ success: boolean; affectedUserIds: string[] }> {
    this.assertCanManageUsers(context);
    const { currentUser } = context;

    if (fromLawyerId === toLawyerId) {
      throw new Error('Source and target lawyer cannot be the same');
    }

    const store = localStore.getData();
    const toLawyer = store.users.find(
      (u) =>
        u.id === toLawyerId &&
        u.firmId === currentUser.firmId &&
        u.deletedAt === null &&
        (u.status ?? 'active') === 'active'
    );
    if (!toLawyer || !isLawyerOrOwner(toLawyer)) {
      throw new Error('Target supervisor must be an active Lawyer or Owner in this chamber');
    }

    const affectedUserIds: string[] = [];
    const now = new Date().toISOString();

    localStore.mutate((s) => {
      for (const u of s.users) {
        if (
          u.firmId === currentUser.firmId &&
          u.deletedAt === null &&
          u.reportsToUserId === fromLawyerId &&
          u.id !== toLawyerId
        ) {
          u.reportsToUserId = toLawyerId;
          u.updatedAt = now;
          u.updatedBy = currentUser.id;
          affectedUserIds.push(u.id);
        }
      }
    });

    await this.auditRepo.record(context, {
      entity: 'User',
      entityId: fromLawyerId,
      action: 'UPDATE',
      oldValue: { teamSupervisorId: fromLawyerId },
      newValue: {
        action: 'REASSIGN_TEAM',
        fromLawyerId,
        toLawyerId,
        affectedUserIds,
      },
    });

    return { success: true, affectedUserIds };
  }

  async resetPassword(
    context: SecurityContext,
    targetUserId: string
  ): Promise<{ temporaryPassword: string; message?: string }> {
    this.assertCanManageUsers(context);
    const { currentUser } = context;

    if (targetUserId === currentUser.id) {
      throw new Error('Cannot reset your own password');
    }

    const store = localStore.getData();
    const targetUser = store.users.find(
      (u) => u.id === targetUserId && u.firmId === currentUser.firmId && u.deletedAt === null
    );
    if (!targetUser) {
      throw new Error('User not found in this chamber');
    }

    // Generate random temporary password
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%^&*';
    let tempPassword = 'Temp_';
    for (let i = 0; i < 11; i++) {
      tempPassword += chars.charAt(Math.floor(Math.random() * chars.length));
    }

    const now = new Date().toISOString();
    localStore.mutate((s) => {
      const u = s.users.find((user) => user.id === targetUserId);
      if (u) {
        u.mustChangePassword = true;
        u.updatedAt = now;
        u.updatedBy = currentUser.id;
      }
    });

    await this.auditRepo.record(context, {
      entity: 'User',
      entityId: targetUserId,
      action: 'RESET_PASSWORD',
      oldValue: { mustChangePassword: targetUser.mustChangePassword },
      newValue: { mustChangePassword: true },
    });

    return {
      temporaryPassword: tempPassword,
      message: 'Password reset successfully',
    };
  }
}
