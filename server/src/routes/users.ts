import { Router, Response } from 'express';
import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { authMiddleware, AuthenticatedRequest, revokeAllUserSessions } from '../middleware/auth.js';
import { requireOwnerOrUsersManage } from '../middleware/permission.js';
import { enforceFirmIsolation } from '../middleware/firmIsolation.js';
import { enforceSubscriptionReadOnly } from '../middleware/subscription.js';
import { getDatabase } from '../db/client.js';
import * as schema from '../db/schema.js';
import { recordAudit } from '../services/auditService.js';
import {
  generateSecureTemporaryPassword,
  checkResetPasswordRateLimit,
} from '../services/authService.js';
import {
  ALL_PERMISSION_KEYS,
  JobType,
  ROLE_PRESETS,
  VALID_JOB_TYPES,
  isLawyerOrOwner,
} from '../rolePresets.js';
import { isSupervisorOf } from '../services/visibilityService.js';

export const usersRouter = Router();

usersRouter.use(authMiddleware);
usersRouter.use(enforceFirmIsolation);

function sanitizeUser(u: schema.User) {
  return {
    id: u.id,
    firmId: u.firmId,
    name: u.name,
    email: u.email,
    role: u.role,
    jobType: u.jobType || (u.role === 'Owner' ? 'lawyer_senior' : 'other'),
    jobTitleLabel: u.jobTitleLabel ?? null,
    reportsToUserId: u.reportsToUserId ?? null,
    permissions: u.permissions,
    language: u.language,
    active: u.active,
    mustChangePassword: u.mustChangePassword,
    createdAt: u.createdAt,
    updatedAt: u.updatedAt,
  };
}

const createUserSchema = z.object({
  name: z.string().trim().min(1, 'Name is required'),
  email: z.string().trim().email('Valid email is required'),
  role: z.enum(['Owner', 'Staff']).optional().default('Staff'),
  jobType: z
    .enum(['lawyer_senior', 'lawyer_junior', 'clerk', 'receptionist', 'intern', 'other'])
    .optional(),
  jobTitleLabel: z.string().trim().nullable().optional(),
  reportsToUserId: z.string().trim().nullable().optional(),
  preset: z.string().trim().optional(),
  permissions: z.array(z.string()).optional(),
  language: z.enum(['en', 'bn']).optional().default('en'),
  temporaryPassword: z.string().min(8).optional(),
});

const updateUserSchema = z.object({
  name: z.string().trim().min(1).optional(),
  email: z.string().trim().email().optional(),
  jobType: z
    .enum(['lawyer_senior', 'lawyer_junior', 'clerk', 'receptionist', 'intern', 'other'])
    .optional(),
  jobTitleLabel: z.string().trim().nullable().optional(),
  reportsToUserId: z.string().trim().nullable().optional(),
  language: z.enum(['en', 'bn']).optional(),
});

const updatePermissionsSchema = z.object({
  permissions: z.array(z.string()),
});

const updateRoleSchema = z.object({
  role: z.enum(['Owner', 'Staff']),
});

// Helper to validate reportsToUserId against firm, lawyer/Owner role, self, and cycles
async function validateReportsTo(
  firmId: string,
  targetUserId: string | null,
  reportsToUserId: string | null | undefined,
  firmUsers: schema.User[]
): Promise<{ valid: boolean; error?: string }> {
  if (!reportsToUserId) return { valid: true };

  if (targetUserId && reportsToUserId === targetUserId) {
    return { valid: false, error: 'A user cannot report to themselves' };
  }

  const supervisor = firmUsers.find((u) => u.id === reportsToUserId && !u.deletedAt);
  if (!supervisor || supervisor.firmId !== firmId) {
    return { valid: false, error: 'Supervisor must belong to the same firm' };
  }

  if (!isLawyerOrOwner(supervisor.role, supervisor.jobType)) {
    return { valid: false, error: 'Supervisor must be a lawyer or Owner' };
  }

  if (targetUserId) {
    // Check if targetUserId is already a supervisor of `supervisor` (which would form a cycle)
    if (isSupervisorOf(firmUsers, targetUserId, reportsToUserId)) {
      return { valid: false, error: 'Reporting hierarchy cycle detected' };
    }
  }

  return { valid: true };
}

// GET /api/v1/users - List users in current firm
usersRouter.get('/', async (req: AuthenticatedRequest, res: Response) => {
  const db = getDatabase();
  const users = await db.listUsers(req.user!.firmId);
  res.json(users.map(sanitizeUser));
});

// GET /api/v1/users/:id - Get user by ID in same firm
usersRouter.get('/:id', async (req: AuthenticatedRequest, res: Response) => {
  const db = getDatabase();
  const user = await db.getUserById(req.params.id);
  if (!user || user.firmId !== req.user!.firmId) {
    return res.status(404).json({ error: 'User not found' });
  }

  res.json(sanitizeUser(user));
});

// POST /api/v1/users - Create user in current firm
usersRouter.post(
  '/',
  requireOwnerOrUsersManage(),
  enforceSubscriptionReadOnly,
  async (req: AuthenticatedRequest, res: Response) => {
    const parsed = createUserSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        error: 'ValidationError',
        message: parsed.error.issues[0]?.message || 'Invalid user payload',
        issues: parsed.error.issues,
      });
    }

    const db = getDatabase();
    const firmId = req.user!.firmId;
    const firm = await db.getFirm(firmId);
    if (!firm) {
      return res.status(404).json({ error: 'Firm not found' });
    }

    const firmUsers = await db.listUsers(firmId);
    const activeUsersCount = firmUsers.filter((u) => u.active && !u.deletedAt).length;

    // Enforce plan seat limit
    let seatLimit = 100;
    if (typeof (firm as any).seatLimit === 'number' && (firm as any).seatLimit > 0) {
      seatLimit = (firm as any).seatLimit;
    } else if (firm.planId) {
      const plan = await db.getPlan(firm.planId);
      if (plan && plan.seats > 0) {
        seatLimit = plan.seats;
      }
    }
    if (activeUsersCount >= seatLimit) {
      return res.status(403).json({
        error: 'SeatLimitReached',
        code: 'SEAT_LIMIT_REACHED',
        message: `Plan seat limit (${seatLimit}) reached for this chamber.`,
      });
    }

    const {
      name,
      email,
      role,
      jobType: rawJobType,
      jobTitleLabel,
      reportsToUserId,
      preset,
      permissions: rawPermissions,
      language,
      temporaryPassword: providedTempPassword,
    } = parsed.data;

    // Check email uniqueness globally
    const existingByEmail = await db.getUserByEmail(email.toLowerCase());
    if (existingByEmail) {
      return res.status(409).json({
        error: 'Conflict',
        message: 'A user with this email already exists',
      });
    }

    // Determine preset & permissions & jobType
    let resolvedPermissions: string[] = [];
    let resolvedJobType: JobType = rawJobType || (role === 'Owner' ? 'lawyer_senior' : 'other');

    if (preset && ROLE_PRESETS[preset]) {
      resolvedPermissions = [...ROLE_PRESETS[preset].permissions];
      if (!rawJobType) {
        resolvedJobType = ROLE_PRESETS[preset].defaultJobType;
      }
    }

    if (rawPermissions) {
      const unknownKeys = rawPermissions.filter(
        (k) => !(ALL_PERMISSION_KEYS as readonly string[]).includes(k)
      );
      if (unknownKeys.length > 0) {
        return res.status(400).json({
          error: 'BadRequest',
          message: `Unknown permission keys: ${unknownKeys.join(', ')}`,
        });
      }
      resolvedPermissions = rawPermissions;
    }

    if (role === 'Owner') {
      resolvedPermissions = [...ALL_PERMISSION_KEYS];
    }

    // Validate reportsToUserId
    const repCheck = await validateReportsTo(firmId, null, reportsToUserId, firmUsers);
    if (!repCheck.valid) {
      return res.status(400).json({ error: 'BadRequest', message: repCheck.error });
    }

    // Generate one-time temporary password if not provided
    const tempPassword =
      providedTempPassword || `Temp_${crypto.randomBytes(6).toString('hex')}!1A`;
    const passwordHash = await bcrypt.hash(tempPassword, 10);

    const createdUser = await db.insertUser({
      id: `user-${crypto.randomUUID()}`,
      firmId,
      name,
      email: email.toLowerCase(),
      passwordHash,
      role,
      jobType: resolvedJobType,
      jobTitleLabel: jobTitleLabel ?? null,
      reportsToUserId: reportsToUserId ?? null,
      permissions: resolvedPermissions,
      language,
      active: true,
      mustChangePassword: true,
      createdBy: req.user!.id,
      updatedBy: req.user!.id,
    });

    await recordAudit({
      firmId,
      userId: req.user!.id,
      userName: req.user!.name,
      entity: 'User',
      entityId: createdUser.id,
      action: 'CREATE_USER',
      oldValue: null,
      newValue: {
        id: createdUser.id,
        name: createdUser.name,
        email: createdUser.email,
        role: createdUser.role,
        jobType: createdUser.jobType,
        reportsToUserId: createdUser.reportsToUserId,
        preset: preset || null,
      },
    });

    res.status(201).json({
      ...sanitizeUser(createdUser),
      temporaryPassword: tempPassword,
    });
  }
);

// PATCH /api/v1/users/:id - Update user profile, jobType, label, reports_to, language
usersRouter.patch(
  '/:id',
  requireOwnerOrUsersManage(),
  enforceSubscriptionReadOnly,
  async (req: AuthenticatedRequest, res: Response) => {
    const parsed = updateUserSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        error: 'ValidationError',
        message: parsed.error.issues[0]?.message || 'Invalid update payload',
        issues: parsed.error.issues,
      });
    }

    const db = getDatabase();
    const firmId = req.user!.firmId;
    const targetUser = await db.getUserById(req.params.id);

    if (!targetUser || targetUser.firmId !== firmId) {
      return res.status(404).json({ error: 'User not found in this chamber' });
    }

    const { name, email, jobType, jobTitleLabel, reportsToUserId, language } = parsed.data;

    if (email && email.toLowerCase() !== targetUser.email.toLowerCase()) {
      const existing = await db.getUserByEmail(email.toLowerCase());
      if (existing && existing.id !== targetUser.id) {
        return res.status(409).json({ error: 'Conflict', message: 'Email already in use' });
      }
    }

    const firmUsers = await db.listUsers(firmId);

    if (reportsToUserId !== undefined) {
      const repCheck = await validateReportsTo(firmId, targetUser.id, reportsToUserId, firmUsers);
      if (!repCheck.valid) {
        return res.status(400).json({ error: 'BadRequest', message: repCheck.error });
      }
    }

    const updates: Partial<schema.User> = {
      ...(name !== undefined && { name }),
      ...(email !== undefined && { email: email.toLowerCase() }),
      ...(jobType !== undefined && { jobType }),
      ...(jobTitleLabel !== undefined && { jobTitleLabel }),
      ...(reportsToUserId !== undefined && { reportsToUserId }),
      ...(language !== undefined && { language }),
      updatedBy: req.user!.id,
    };

    const oldValues = {
      name: targetUser.name,
      email: targetUser.email,
      jobType: targetUser.jobType,
      jobTitleLabel: targetUser.jobTitleLabel,
      reportsToUserId: targetUser.reportsToUserId,
      language: targetUser.language,
    };

    const updated = await db.updateUser(targetUser.id, updates);

    await recordAudit({
      firmId,
      userId: req.user!.id,
      userName: req.user!.name,
      entity: 'User',
      entityId: targetUser.id,
      action: 'UPDATE_USER',
      oldValue: oldValues,
      newValue: updates,
    });

    res.json(sanitizeUser(updated));
  }
);

// PATCH /api/v1/users/:id/permissions - Update permissions (known keys only, not self, not Owner)
usersRouter.patch(
  '/:id/permissions',
  requireOwnerOrUsersManage(),
  enforceSubscriptionReadOnly,
  async (req: AuthenticatedRequest, res: Response) => {
    const db = getDatabase();
    const targetUser = await db.getUserById(req.params.id);

    if (!targetUser || targetUser.firmId !== req.user!.firmId) {
      return res.status(404).json({ error: 'User not found in this chamber' });
    }

    if (targetUser.id === req.user!.id) {
      return res.status(400).json({
        error: 'BadRequest',
        message: 'Users cannot modify their own permissions.',
      });
    }

    if (targetUser.role === 'Owner') {
      return res.status(400).json({
        error: 'BadRequest',
        message: 'Cannot modify permissions of a chamber Owner.',
      });
    }

    const parsed = updatePermissionsSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        error: 'Bad Request',
        message: 'permissions must be an array of keys.',
      });
    }

    const { permissions } = parsed.data;
    const unknownKeys = permissions.filter(
      (k) => !(ALL_PERMISSION_KEYS as readonly string[]).includes(k)
    );
    if (unknownKeys.length > 0) {
      return res.status(400).json({
        error: 'Bad Request',
        message: `Unknown permission keys: ${unknownKeys.join(', ')}`,
      });
    }

    const oldPermissions = [...targetUser.permissions];
    const updated = await db.updateUser(targetUser.id, {
      permissions,
      updatedBy: req.user!.id,
    });

    await recordAudit({
      firmId: req.user!.firmId,
      userId: req.user!.id,
      userName: req.user!.name,
      entity: 'User',
      entityId: targetUser.id,
      action: 'UPDATE_PERMISSIONS',
      oldValue: { permissions: oldPermissions },
      newValue: { permissions },
    });

    res.json(sanitizeUser(updated));
  }
);

// PATCH /api/v1/users/:id/role - Promote or demote user (last active Owner cannot be demoted)
usersRouter.patch(
  '/:id/role',
  requireOwnerOrUsersManage(),
  enforceSubscriptionReadOnly,
  async (req: AuthenticatedRequest, res: Response) => {
    const parsed = updateRoleSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        error: 'ValidationError',
        message: 'role must be "Owner" or "Staff"',
      });
    }

    const db = getDatabase();
    const firmId = req.user!.firmId;
    const targetUser = await db.getUserById(req.params.id);

    if (!targetUser || targetUser.firmId !== firmId) {
      return res.status(404).json({ error: 'User not found in this chamber' });
    }

    const { role } = parsed.data;

    if (targetUser.role === 'Owner' && role === 'Staff') {
      const firmUsers = await db.listUsers(firmId);
      const activeOwners = firmUsers.filter(
        (u) => u.role === 'Owner' && u.active && !u.deletedAt
      );
      if (activeOwners.length <= 1) {
        return res.status(400).json({
          error: 'LastOwnerConstraint',
          code: 'LAST_OWNER_PROTECTED',
          message: 'The last active Owner of a chamber cannot be demoted.',
        });
      }
    }

    const oldRole = targetUser.role;
    const nextJobType: JobType =
      role === 'Owner' && (!targetUser.jobType || targetUser.jobType === 'other')
        ? 'lawyer_senior'
        : (targetUser.jobType as JobType) || 'other';
    const nextPermissions =
      role === 'Owner' ? [...ALL_PERMISSION_KEYS] : targetUser.permissions;

    const updated = await db.updateUser(targetUser.id, {
      role,
      jobType: nextJobType,
      permissions: nextPermissions,
      updatedBy: req.user!.id,
    });

    await recordAudit({
      firmId,
      userId: req.user!.id,
      userName: req.user!.name,
      entity: 'User',
      entityId: targetUser.id,
      action: 'UPDATE_ROLE',
      oldValue: { role: oldRole },
      newValue: { role },
    });

    res.json(sanitizeUser(updated));
  }
);

// POST /api/v1/users/:id/deactivate - Deactivate user (never delete, ends sessions/devices, warns on open work)
usersRouter.post(
  '/:id/deactivate',
  requireOwnerOrUsersManage(),
  enforceSubscriptionReadOnly,
  async (req: AuthenticatedRequest, res: Response) => {
    const db = getDatabase();
    const firmId = req.user!.firmId;
    const targetUser = await db.getUserById(req.params.id);

    if (!targetUser || targetUser.firmId !== firmId) {
      return res.status(404).json({ error: 'User not found in this chamber' });
    }

    if (targetUser.role === 'Owner') {
      const firmUsers = await db.listUsers(firmId);
      const activeOwners = firmUsers.filter(
        (u) => u.role === 'Owner' && u.active && !u.deletedAt
      );
      if (activeOwners.length <= 1) {
        return res.status(400).json({
          error: 'LastOwnerConstraint',
          code: 'LAST_OWNER_PROTECTED',
          message: 'The last active Owner of a chamber cannot be deactivated.',
        });
      }
    }

    // Optional reassignment target passed in body
    const { reassignToUserId } = req.body || {};
    if (reassignToUserId) {
      const reassignTarget = await db.getUserById(reassignToUserId);
      if (!reassignTarget || reassignTarget.firmId !== firmId || !reassignTarget.active) {
        return res.status(400).json({ error: 'Reassignment target user not found or inactive' });
      }
      // Reassign subordinate team members and cases
      const firmUsers = await db.listUsers(firmId);
      for (const sub of firmUsers) {
        if (sub.reportsToUserId === targetUser.id) {
          await db.updateUser(sub.id, { reportsToUserId: reassignTarget.id });
        }
      }
      const firmCases = await db.listCases(firmId, {
        includeRestricted: true,
        user: { ...req.user!, role: 'Owner', permissions: [...ALL_PERMISSION_KEYS] },
      });
      for (const c of firmCases) {
        if (c.responsibleLawyerId === targetUser.id) {
          await db.updateCase(c.id, firmId, { responsibleLawyerId: reassignTarget.id });
        }
      }
      const firmHearings = await db.listHearings(firmId);
      for (const h of firmHearings) {
        if (h.appearingLawyerId === targetUser.id && h.status === 'scheduled') {
          await db.updateHearing(h.id, firmId, { appearingLawyerId: reassignTarget.id });
        }
      }
    }

    // Check open cases and future hearings
    const allCases = await db.listCases(firmId, {
      includeRestricted: true,
      user: { ...req.user!, role: 'Owner', permissions: [...ALL_PERMISSION_KEYS] },
    });
    const openCasesCount = allCases.filter(
      (c) => c.responsibleLawyerId === targetUser.id && c.status === 'ongoing'
    ).length;

    const allHearings = await db.listHearings(firmId);
    const now = new Date();
    const futureHearingsCount = allHearings.filter(
      (h) =>
        h.appearingLawyerId === targetUser.id &&
        h.status === 'scheduled' &&
        new Date(h.scheduledAt) >= now
    ).length;

    // Revoke user's devices in this firm
    const devices = await db.listDevices(firmId);
    let revokedDevicesCount = 0;
    for (const dev of devices) {
      if (dev.userId === targetUser.id && dev.status !== 'revoked') {
        await db.updateDevice(dev.id, { status: 'revoked' });
        revokedDevicesCount++;
      }
    }

    const updated = await db.updateUser(targetUser.id, {
      active: false,
      updatedBy: req.user!.id,
    });

    await recordAudit({
      firmId,
      userId: req.user!.id,
      userName: req.user!.name,
      entity: 'User',
      entityId: targetUser.id,
      action: 'DEACTIVATE_USER',
      oldValue: { active: targetUser.active },
      newValue: {
        active: false,
        revokedDevicesCount,
        reassignToUserId: reassignToUserId || null,
      },
    });

    const warnings: string[] = [];
    if (openCasesCount > 0) {
      warnings.push(`User holds ${openCasesCount} ongoing case(s).`);
    }
    if (futureHearingsCount > 0) {
      warnings.push(`User is assigned to ${futureHearingsCount} upcoming hearing(s).`);
    }

    res.json({
      ...sanitizeUser(updated),
      revokedDevicesCount,
      openCasesCount,
      futureHearingsCount,
      warnings,
    });
  }
);

// POST /api/v1/users/:id/reactivate - Reactivate user (respects plan seat limit)
usersRouter.post(
  '/:id/reactivate',
  requireOwnerOrUsersManage(),
  enforceSubscriptionReadOnly,
  async (req: AuthenticatedRequest, res: Response) => {
    const db = getDatabase();
    const firmId = req.user!.firmId;
    const targetUser = await db.getUserById(req.params.id);

    if (!targetUser || targetUser.firmId !== firmId) {
      return res.status(404).json({ error: 'User not found in this chamber' });
    }

    if (!targetUser.active) {
      const firm = await db.getFirm(firmId);
      const firmUsers = await db.listUsers(firmId);
      const activeUsersCount = firmUsers.filter((u) => u.active && !u.deletedAt).length;

      let seatLimit = 100;
      if (firm?.planId) {
        const plan = await db.getPlan(firm.planId);
        if (plan && plan.seats > 0) {
          seatLimit = plan.seats;
        }
      }
      if (activeUsersCount >= seatLimit) {
        return res.status(403).json({
          error: 'SeatLimitReached',
          code: 'SEAT_LIMIT_REACHED',
          message: `Plan seat limit (${seatLimit}) reached for this chamber.`,
        });
      }
    }

    const updated = await db.updateUser(targetUser.id, {
      active: true,
      updatedBy: req.user!.id,
    });

    await recordAudit({
      firmId,
      userId: req.user!.id,
      userName: req.user!.name,
      entity: 'User',
      entityId: targetUser.id,
      action: 'REACTIVATE_USER',
      oldValue: { active: targetUser.active },
      newValue: { active: true },
    });

    res.json(sanitizeUser(updated));
  }
);

// POST /api/v1/users/:id/reassign-team - Temporarily reassign a lawyer's team (reports_to change) with an audit entry
usersRouter.post(
  '/:id/reassign-team',
  requireOwnerOrUsersManage(),
  enforceSubscriptionReadOnly,
  async (req: AuthenticatedRequest, res: Response) => {
    const db = getDatabase();
    const firmId = req.user!.firmId;
    const fromLawyer = await db.getUserById(req.params.id);

    if (!fromLawyer || fromLawyer.firmId !== firmId) {
      return res.status(404).json({ error: 'Source lawyer not found in this chamber' });
    }

    const { toLawyerId } = req.body || {};
    if (!toLawyerId || typeof toLawyerId !== 'string') {
      return res.status(400).json({ error: 'toLawyerId is required' });
    }

    const toLawyer = await db.getUserById(toLawyerId);
    if (!toLawyer || toLawyer.firmId !== firmId || !toLawyer.active) {
      return res.status(400).json({ error: 'Target lawyer must be an active user in the same chamber' });
    }

    if (!isLawyerOrOwner(toLawyer.role, toLawyer.jobType)) {
      return res.status(400).json({ error: 'Target supervisor must be a lawyer or Owner' });
    }

    const firmUsers = await db.listUsers(firmId);
    const affectedUserIds: string[] = [];

    for (const u of firmUsers) {
      if (u.reportsToUserId === fromLawyer.id && u.id !== toLawyer.id) {
        const repCheck = await validateReportsTo(firmId, u.id, toLawyer.id, firmUsers);
        if (repCheck.valid) {
          await db.updateUser(u.id, { reportsToUserId: toLawyer.id, updatedBy: req.user!.id });
          affectedUserIds.push(u.id);
        }
      }
    }

    await recordAudit({
      firmId,
      userId: req.user!.id,
      userName: req.user!.name,
      entity: 'User',
      entityId: fromLawyer.id,
      action: 'REASSIGN_TEAM',
      oldValue: { fromLawyerId: fromLawyer.id, fromLawyerName: fromLawyer.name },
      newValue: {
        toLawyerId: toLawyer.id,
        toLawyerName: toLawyer.name,
        affectedUserIds,
      },
    });

    res.json({
      success: true,
      fromLawyerId: fromLawyer.id,
      toLawyerId: toLawyer.id,
      affectedUserIds,
    });
  }
);

// POST /api/v1/users/:id/reset-password - Reset password for another user in the same firm
usersRouter.post(
  '/:id/reset-password',
  requireOwnerOrUsersManage(),
  enforceSubscriptionReadOnly,
  async (req: AuthenticatedRequest, res: Response) => {
    const targetUserId = req.params.id;
    const caller = req.user!;
    const firmId = caller.firmId;

    // Cannot target yourself (use Change password)
    if (targetUserId === caller.id) {
      return res.status(400).json({
        error: 'BadRequest',
        code: 'SELF_RESET_PROHIBITED',
        message: 'Cannot reset your own password. Please use Change Password in your profile.',
      });
    }

    // Rate-limit: max 5 requests per 15 minutes per target user
    const rateLimitKey = `reset:${firmId}:${targetUserId}`;
    if (!checkResetPasswordRateLimit(rateLimitKey, 5, 15 * 60 * 1000)) {
      return res.status(429).json({
        error: 'Too Many Requests',
        code: 'RATE_LIMITED',
        message: 'Too many password reset attempts for this user. Please try again later.',
      });
    }

    const db = getDatabase();
    const targetUser = await db.getUserById(targetUserId);

    // Cannot target a user of another firm (404)
    if (!targetUser || targetUser.firmId !== firmId || targetUser.deletedAt) {
      return res.status(404).json({
        error: 'NotFound',
        message: 'User not found in this chamber.',
      });
    }

    // Generates a one-time temporary password (random, 12+ chars)
    const temporaryPassword = generateSecureTemporaryPassword();
    const passwordHash = await bcrypt.hash(temporaryPassword, 10);

    // Stores only its hash, sets mustChangePassword=true
    await db.updateUser(targetUser.id, {
      passwordHash,
      mustChangePassword: true,
      failedLoginAttempts: 0,
      lockedUntil: null,
      updatedBy: caller.id,
    });

    // Revokes/invalidates the user's active sessions
    revokeAllUserSessions(targetUser.id);

    // Writes an audit entry (RESET_PASSWORD, no password in the log)
    await recordAudit({
      firmId,
      userId: caller.id,
      userName: caller.name,
      entity: 'User',
      entityId: targetUser.id,
      action: 'RESET_PASSWORD',
      oldValue: { mustChangePassword: targetUser.mustChangePassword },
      newValue: { mustChangePassword: true, sessionsRevoked: true },
    });

    // Return the temporary password once in the response
    return res.status(200).json({
      success: true,
      temporaryPassword,
      message: 'Password reset successfully. Share this temporary password securely with the user.',
      user: {
        id: targetUser.id,
        name: targetUser.name,
        email: targetUser.email,
        role: targetUser.role,
        mustChangePassword: true,
      },
    });
  }
);
