import { Router, Response } from 'express';
import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { adminAuthMiddleware, AuthenticatedAdminRequest } from '../middleware/adminAuth.js';
import { getDatabase } from '../db/client.js';
import { recordAdminAudit } from '../services/adminAuditService.js';
import { recordAudit } from '../services/auditService.js';
import { ALL_PERMISSIONS } from '../db/seed.js';
import { revokeAllUserSessions } from '../middleware/auth.js';
import {
  generateSecureTemporaryPassword,
  checkResetPasswordRateLimit,
} from '../services/authService.js';

export const adminFirmsRouter = Router();

// All routes require platform super admin authentication
adminFirmsRouter.use(adminAuthMiddleware);

// --- Validation Schemas ---

const createFirmSchema = z.object({
  name: z.string().trim().min(2, 'Firm name must be at least 2 characters').max(255),
  planId: z.string().optional().default('annual-standard'),
  months: z.number().int().min(1).max(120).optional().default(12),
  maxDevices: z.number().int().min(1).max(100).optional().default(5),
  ownerName: z.string().trim().min(2, 'Owner name must be at least 2 characters').max(100),
  ownerEmail: z.string().trim().toLowerCase().email('Invalid owner email address'),
  contact: z.string().trim().max(255).optional(),
  officeAddress: z.string().trim().optional(),
  barCouncilReg: z.string().trim().optional(),
  courtAffiliations: z.string().trim().optional(),
});

const listFirmsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().trim().optional(),
  status: z.enum(['active', 'expired', 'suspended', 'disabled', 'all']).optional(),
});

const updateFirmSchema = z.object({
  name: z.string().trim().min(2, 'Firm name must be at least 2 characters').max(255).optional(),
  contact: z.string().trim().max(255).optional(),
  officeAddress: z.string().trim().optional(),
  barCouncilReg: z.string().trim().optional(),
  courtAffiliations: z.string().trim().optional(),
}).strict();

const softDeleteFirmSchema = z.object({
  confirmFirmName: z.string().trim().min(1, 'confirmFirmName is required'),
});

const updateLicenseSchema = z.object({
  planId: z.string().optional(),
  maxDevices: z.number().int().min(1).max(100).optional(),
  startDate: z.string().datetime({ offset: true }).or(z.string().regex(/^\d{4}-\d{2}-\d{2}/)).optional(),
  expiryDate: z.string().datetime({ offset: true }).or(z.string().regex(/^\d{4}-\d{2}-\d{2}/)).optional(),
});

const renewFirmSchema = z.object({
  months: z.number().int().min(1).max(120).optional().default(12),
});

const recordPaymentSchema = z.object({
  amount: z.number().int().positive('Payment amount must be a positive integer'),
  method: z.enum(['bKash', 'Nagad', 'bank']),
  txnId: z.string().trim().min(3, 'Transaction ID must be at least 3 characters'),
  note: z.string().trim().optional(),
});

// Helper to generate secure temporary passwords (min 16 chars with upper, lower, digit, special)
function generateTemporaryPassword(): string {
  const lettersUpper = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  const lettersLower = 'abcdefghijkmnopqrstuvwxyz';
  const digits = '23456789';
  const symbols = '!@#$%^&*';

  const randomPart = crypto.randomBytes(8).toString('hex');
  const upper = lettersUpper[crypto.randomInt(lettersUpper.length)];
  const lower = lettersLower[crypto.randomInt(lettersLower.length)];
  const digit = digits[crypto.randomInt(digits.length)];
  const sym = symbols[crypto.randomInt(symbols.length)];

  return `BdTemp${upper}${lower}${digit}${sym}${randomPart}`;
}

// 1. POST /firms - Create firm + first Owner user with temporary password
adminFirmsRouter.post('/', async (req: AuthenticatedAdminRequest, res: Response) => {
  const parseResult = createFirmSchema.safeParse(req.body);
  if (!parseResult.success) {
    return res.status(400).json({
      error: 'Bad Request',
      message: 'Validation failed',
      issues: parseResult.error.issues,
    });
  }

  const data = parseResult.data;
  const db = getDatabase();

  // Check if owner email is already taken
  const existingUser = await db.getUserByEmail(data.ownerEmail);
  if (existingUser) {
    return res.status(409).json({
      error: 'Conflict',
      message: 'A user with this email address already exists.',
    });
  }

  // Server clock only
  const now = new Date();
  const startsAt = now;
  const expiresAt = new Date(now.getTime() + data.months * 30 * 24 * 60 * 60 * 1000);

  const firmId = `firm-${crypto.randomUUID()}`;
  const tempPassword = generateTemporaryPassword();
  const salt = await bcrypt.genSalt(10);
  const passwordHash = await bcrypt.hash(tempPassword, salt);

  // Wrap firm creation and all dependent records in an atomic database transaction (R-10)
  const { newFirm, ownerUser } = await db.transaction(async (txDb) => {
    const createdFirm = await txDb.insertFirm({
      id: firmId,
      firmId,
      name: data.name,
      contact: data.contact ?? null,
      officeAddress: data.officeAddress ?? null,
      barCouncilReg: data.barCouncilReg ?? null,
      courtAffiliations: data.courtAffiliations ?? null,
      planId: data.planId,
      maxDevices: data.maxDevices,
      licenseStartsAt: startsAt,
      licenseExpiresAt: expiresAt,
      status: 'active',
      createdBy: req.admin!.id,
      createdAt: now,
      updatedAt: now,
    });

    // Provision first Owner user with temporary password and forced password change
    const createdOwner = await txDb.insertUser({
      id: `user-${crypto.randomUUID()}`,
      firmId: createdFirm.id,
      name: data.ownerName,
      email: data.ownerEmail,
      passwordHash,
      role: 'Owner',
      permissions: ALL_PERMISSIONS,
      language: 'en',
      active: true,
      mustChangePassword: true,
      failedLoginAttempts: 0,
      createdBy: req.admin!.id,
      createdAt: now,
      updatedAt: now,
    });

    // Record in admin_audit
    await txDb.insertAdminAudit({
      adminId: req.admin!.id,
      action: 'FIRM_CREATE',
      targetFirmId: createdFirm.id,
      new: {
        firmId: createdFirm.id,
        name: createdFirm.name,
        ownerEmail: createdOwner.email,
        ownerId: createdOwner.id,
        planId: createdFirm.planId,
        maxDevices: createdFirm.maxDevices,
        licenseExpiresAt: createdFirm.licenseExpiresAt,
      },
      ip: req.ip,
      at: now,
    });

    // Record in license_events
    await txDb.insertLicenseEvent({
      firmId: createdFirm.id,
      type: 'CREATE',
      new: {
        planId: createdFirm.planId,
        maxDevices: createdFirm.maxDevices,
        licenseStartsAt: createdFirm.licenseStartsAt,
        licenseExpiresAt: createdFirm.licenseExpiresAt,
        status: createdFirm.status,
      },
      byAdmin: req.admin!.id,
      at: now,
    });

    return { newFirm: createdFirm, ownerUser: createdOwner };
  });

  return res.status(201).json({
    message: 'Firm created successfully.',
    firm: newFirm,
    ownerUser: {
      id: ownerUser.id,
      name: ownerUser.name,
      email: ownerUser.email,
      role: ownerUser.role,
      mustChangePassword: ownerUser.mustChangePassword,
    },
    temporaryPassword: tempPassword, // Shown ONCE in response payload
  });
});

// 2. GET /firms - Paginated, search, filter by status
adminFirmsRouter.get('/', async (req: AuthenticatedAdminRequest, res: Response) => {
  const parseResult = listFirmsQuerySchema.safeParse(req.query);
  if (!parseResult.success) {
    return res.status(400).json({
      error: 'Bad Request',
      message: 'Invalid query parameters',
      issues: parseResult.error.issues,
    });
  }

  const { page, limit, search, status } = parseResult.data;
  const db = getDatabase();

  const result = await db.listFirms({ page, limit, search, status });

  const enrichedFirms = await Promise.all(
    result.firms.map(async (f) => {
      const pendingDeviceCount = await db.countPendingDevices(f.id);
      const approvedDeviceCount = await db.countApprovedDevices(f.id);
      return {
        ...f,
        pendingDeviceCount,
        approvedDeviceCount,
      };
    })
  );

  return res.status(200).json({
    firms: enrichedFirms,
    total: result.total,
    page: result.page,
    limit: result.limit,
    totalPages: Math.ceil(result.total / result.limit),
  });
});

// 3. GET /firms/:id - Get firm details, plan, license, user count, device count, last activity
adminFirmsRouter.get('/:id', async (req: AuthenticatedAdminRequest, res: Response) => {
  const db = getDatabase();
  const firm = await db.getFirm(req.params.id, true);

  if (!firm) {
    return res.status(404).json({ error: 'Firm not found' });
  }

  const plan = firm.planId ? await db.getPlan(firm.planId) : null;
  const metrics = await db.getFirmMetrics(firm.id);

  // Server clock comparison for expiration status
  const isExpired = new Date(firm.licenseExpiresAt).getTime() < Date.now();

  const license = {
    planId: firm.planId,
    maxDevices: firm.maxDevices,
    licenseStartsAt: firm.licenseStartsAt,
    licenseExpiresAt: firm.licenseExpiresAt,
    status: firm.status,
    isExpired,
  };

  return res.status(200).json({
    firm,
    plan,
    license,
    userCount: metrics.userCount,
    deviceCount: metrics.deviceCount,
    pendingDeviceCount: metrics.pendingDeviceCount,
    lastActivity: metrics.lastActivity,
  });
});

// 4. PATCH /firms/:id - Update name, contact, addresses
adminFirmsRouter.patch('/:id', async (req: AuthenticatedAdminRequest, res: Response) => {
  const parseResult = updateFirmSchema.safeParse(req.body);
  if (!parseResult.success) {
    return res.status(400).json({
      error: 'Bad Request',
      message: 'Invalid input fields',
      issues: parseResult.error.issues,
    });
  }

  const updates = parseResult.data;
  const db = getDatabase();
  const firm = await db.getFirm(req.params.id);

  if (!firm) {
    return res.status(404).json({ error: 'Firm not found' });
  }

  const oldValues = {
    name: firm.name,
    contact: firm.contact,
    officeAddress: firm.officeAddress,
    barCouncilReg: firm.barCouncilReg,
    courtAffiliations: firm.courtAffiliations,
  };

  const updatedFirm = await db.updateFirm(firm.id, updates);

  await recordAdminAudit({
    adminId: req.admin!.id,
    action: 'FIRM_UPDATE',
    targetFirmId: firm.id,
    old: oldValues,
    new: updates,
    ip: req.ip,
  });

  return res.status(200).json({
    message: 'Firm updated successfully.',
    firm: updatedFirm,
  });
});

// 5. POST /firms/:id/suspend - Suspend a firm
adminFirmsRouter.post('/:id/suspend', async (req: AuthenticatedAdminRequest, res: Response) => {
  const db = getDatabase();
  const firm = await db.getFirm(req.params.id);

  if (!firm) {
    return res.status(404).json({ error: 'Firm not found' });
  }

  const oldStatus = firm.status;
  const updatedFirm = await db.transaction(async (txDb) => {
    const updated = await txDb.updateFirm(firm.id, { status: 'suspended' });

    await txDb.insertAdminAudit({
      adminId: req.admin!.id,
      action: 'FIRM_SUSPEND',
      targetFirmId: firm.id,
      old: { status: oldStatus },
      new: { status: 'suspended' },
      ip: req.ip,
      at: new Date(),
    });

    await txDb.insertLicenseEvent({
      firmId: firm.id,
      type: 'SUSPEND',
      old: { status: oldStatus },
      new: { status: 'suspended' },
      byAdmin: req.admin!.id,
      at: new Date(),
    });

    return updated;
  });

  return res.status(200).json({
    message: 'Firm suspended successfully.',
    firm: updatedFirm,
  });
});

// 6. POST /firms/:id/disable - Disable a firm
adminFirmsRouter.post('/:id/disable', async (req: AuthenticatedAdminRequest, res: Response) => {
  const db = getDatabase();
  const firm = await db.getFirm(req.params.id);

  if (!firm) {
    return res.status(404).json({ error: 'Firm not found' });
  }

  const oldStatus = firm.status;
  const updatedFirm = await db.transaction(async (txDb) => {
    const updated = await txDb.updateFirm(firm.id, { status: 'disabled' });

    await txDb.insertAdminAudit({
      adminId: req.admin!.id,
      action: 'FIRM_DISABLE',
      targetFirmId: firm.id,
      old: { status: oldStatus },
      new: { status: 'disabled' },
      ip: req.ip,
      at: new Date(),
    });

    await txDb.insertLicenseEvent({
      firmId: firm.id,
      type: 'DISABLE',
      old: { status: oldStatus },
      new: { status: 'disabled' },
      byAdmin: req.admin!.id,
      at: new Date(),
    });

    return updated;
  });

  return res.status(200).json({
    message: 'Firm disabled successfully.',
    firm: updatedFirm,
  });
});

// 7. POST /firms/:id/reactivate - Reactivate a suspended or disabled firm
adminFirmsRouter.post('/:id/reactivate', async (req: AuthenticatedAdminRequest, res: Response) => {
  const db = getDatabase();
  const firm = await db.getFirm(req.params.id);

  if (!firm) {
    return res.status(404).json({ error: 'Firm not found' });
  }

  const oldStatus = firm.status;
  const updatedFirm = await db.transaction(async (txDb) => {
    const updated = await txDb.updateFirm(firm.id, { status: 'active' });

    await txDb.insertAdminAudit({
      adminId: req.admin!.id,
      action: 'FIRM_REACTIVATE',
      targetFirmId: firm.id,
      old: { status: oldStatus },
      new: { status: 'active' },
      ip: req.ip,
      at: new Date(),
    });

    await txDb.insertLicenseEvent({
      firmId: firm.id,
      type: 'REACTIVATE',
      old: { status: oldStatus },
      new: { status: 'active' },
      byAdmin: req.admin!.id,
      at: new Date(),
    });

    return updated;
  });

  return res.status(200).json({
    message: 'Firm reactivated successfully.',
    firm: updatedFirm,
  });
});

// 8. DELETE /firms/:id - Soft delete only, requires typing exact firm name, data kept
adminFirmsRouter.delete('/:id', async (req: AuthenticatedAdminRequest, res: Response) => {
  const parseResult = softDeleteFirmSchema.safeParse(req.body);
  if (!parseResult.success) {
    return res.status(400).json({
      error: 'Bad Request',
      message: 'confirmFirmName is required to soft-delete a firm.',
      issues: parseResult.error.issues,
    });
  }

  const { confirmFirmName } = parseResult.data;
  const db = getDatabase();
  const firm = await db.getFirm(req.params.id);

  if (!firm) {
    return res.status(404).json({ error: 'Firm not found' });
  }

  if (confirmFirmName !== firm.name) {
    return res.status(400).json({
      error: 'Bad Request',
      message: 'Typed firm name does not match the firm being deleted.',
    });
  }

  const now = new Date();
  const updatedFirm = await db.transaction(async (txDb) => {
    const updated = await txDb.updateFirm(firm.id, { deletedAt: now });

    await txDb.insertAdminAudit({
      adminId: req.admin!.id,
      action: 'FIRM_SOFT_DELETE',
      targetFirmId: firm.id,
      old: { deletedAt: null },
      new: { deletedAt: now },
      ip: req.ip,
      at: now,
    });

    await txDb.insertLicenseEvent({
      firmId: firm.id,
      type: 'SOFT_DELETE',
      old: { deletedAt: null },
      new: { deletedAt: now },
      byAdmin: req.admin!.id,
      at: now,
    });

    return updated;
  });

  return res.status(200).json({
    message: 'Firm soft-deleted successfully. All firm data is preserved.',
    firm: updatedFirm,
  });
});

// 9. PUT /firms/:id/license - Update plan, max_devices, start date, expiry date
adminFirmsRouter.put('/:id/license', async (req: AuthenticatedAdminRequest, res: Response) => {
  const parseResult = updateLicenseSchema.safeParse(req.body);
  if (!parseResult.success) {
    return res.status(400).json({
      error: 'Bad Request',
      message: 'Invalid license update parameters',
      issues: parseResult.error.issues,
    });
  }

  const data = parseResult.data;
  const db = getDatabase();
  const firm = await db.getFirm(req.params.id);

  if (!firm) {
    return res.status(404).json({ error: 'Firm not found' });
  }

  const oldLicense = {
    planId: firm.planId,
    maxDevices: firm.maxDevices,
    licenseStartsAt: firm.licenseStartsAt,
    licenseExpiresAt: firm.licenseExpiresAt,
  };

  const updates: any = {};
  if (data.planId) updates.planId = data.planId;
  if (data.maxDevices) updates.maxDevices = data.maxDevices;
  if (data.startDate) updates.licenseStartsAt = new Date(data.startDate);
  if (data.expiryDate) {
    const newExpiry = new Date(data.expiryDate);
    updates.licenseExpiresAt = newExpiry;
    // If firm was expired and new expiry date is in the future, set status to active
    if (newExpiry.getTime() > Date.now() && firm.status === 'expired') {
      updates.status = 'active';
    }
  }

  const updatedFirm = await db.transaction(async (txDb) => {
    const updated = await txDb.updateFirm(firm.id, updates);

    await txDb.insertAdminAudit({
      adminId: req.admin!.id,
      action: 'LICENSE_UPDATE',
      targetFirmId: firm.id,
      old: oldLicense,
      new: updates,
      ip: req.ip,
      at: new Date(),
    });

    await txDb.insertLicenseEvent({
      firmId: firm.id,
      type: 'UPDATE',
      old: oldLicense,
      new: updates,
      byAdmin: req.admin!.id,
      at: new Date(),
    });

    return updated;
  });

  return res.status(200).json({
    message: 'Firm license updated successfully.',
    firm: updatedFirm,
  });
});

// 10. POST /firms/:id/renew - Extends from the later of now or current expiry, never deletes data
adminFirmsRouter.post('/:id/renew', async (req: AuthenticatedAdminRequest, res: Response) => {
  const parseResult = renewFirmSchema.safeParse(req.body);
  if (!parseResult.success) {
    return res.status(400).json({
      error: 'Bad Request',
      message: 'Invalid renewal parameters',
      issues: parseResult.error.issues,
    });
  }

  const { months } = parseResult.data;
  const db = getDatabase();
  const firm = await db.getFirm(req.params.id);

  if (!firm) {
    return res.status(404).json({ error: 'Firm not found' });
  }

  // Server clock only: extends from the later of now or current expiry
  const now = Date.now();
  const currentExpiry = new Date(firm.licenseExpiresAt).getTime();
  const baseTime = Math.max(now, currentExpiry);
  const newExpiry = new Date(baseTime + months * 30 * 24 * 60 * 60 * 1000);

  const oldLicense = {
    licenseExpiresAt: firm.licenseExpiresAt,
    status: firm.status,
  };

  const updates: any = {
    licenseExpiresAt: newExpiry,
  };

  // If firm was expired, re-activate it upon renewal
  if (firm.status === 'expired') {
    updates.status = 'active';
  }

  const updatedFirm = await db.transaction(async (txDb) => {
    const updated = await txDb.updateFirm(firm.id, updates);

    await txDb.insertAdminAudit({
      adminId: req.admin!.id,
      action: 'LICENSE_RENEW',
      targetFirmId: firm.id,
      old: oldLicense,
      new: updates,
      ip: req.ip,
      at: new Date(),
    });

    await txDb.insertLicenseEvent({
      firmId: firm.id,
      type: 'RENEW',
      old: oldLicense,
      new: updates,
      byAdmin: req.admin!.id,
      at: new Date(),
    });

    return updated;
  });

  return res.status(200).json({
    message: 'Firm license renewed successfully.',
    firm: updatedFirm,
    licenseExpiresAt: newExpiry,
  });
});

// 11. POST /firms/:id/payments - Record a payment
adminFirmsRouter.post('/:id/payments', async (req: AuthenticatedAdminRequest, res: Response) => {
  const parseResult = recordPaymentSchema.safeParse(req.body);
  if (!parseResult.success) {
    return res.status(400).json({
      error: 'Bad Request',
      message: 'Invalid payment parameters',
      issues: parseResult.error.issues,
    });
  }

  const data = parseResult.data;
  const db = getDatabase();
  const firm = await db.getFirm(req.params.id);

  if (!firm) {
    return res.status(404).json({ error: 'Firm not found' });
  }

  const now = new Date();
  const payment = await db.transaction(async (txDb) => {
    const createdPayment = await txDb.insertPayment({
      id: `pay-${crypto.randomUUID()}`,
      firmId: firm.id,
      amount: data.amount,
      method: data.method,
      txnId: data.txnId,
      note: data.note ?? null,
      paidAt: now,
      verifiedBy: req.admin!.email,
      createdBy: req.admin!.id,
    });

    await txDb.insertAdminAudit({
      adminId: req.admin!.id,
      action: 'PAYMENT_RECORD',
      targetFirmId: firm.id,
      new: {
        paymentId: createdPayment.id,
        amount: createdPayment.amount,
        method: createdPayment.method,
        txnId: createdPayment.txnId,
        note: createdPayment.note,
      },
      ip: req.ip,
      at: now,
    });

    return createdPayment;
  });

  return res.status(201).json({
    message: 'Payment recorded successfully.',
    payment,
  });
});

// 12. GET /firms/:id/license-events - List license events history
adminFirmsRouter.get('/:id/license-events', async (req: AuthenticatedAdminRequest, res: Response) => {
  const db = getDatabase();
  const firm = await db.getFirm(req.params.id, true);

  if (!firm) {
    return res.status(404).json({ error: 'Firm not found' });
  }

  const events = await db.listLicenseEvents(firm.id);
  return res.status(200).json(events);
});

// 13. GET /firms/:id/payments - List payments history
adminFirmsRouter.get('/:id/payments', async (req: AuthenticatedAdminRequest, res: Response) => {
  const db = getDatabase();
  const firm = await db.getFirm(req.params.id, true);

  if (!firm) {
    return res.status(404).json({ error: 'Firm not found' });
  }

  const payments = await db.listPayments(firm.id);
  return res.status(200).json(payments);
});

// 14. GET /firms/:firmId/users - List users belonging to a firm
adminFirmsRouter.get('/:firmId/users', async (req: AuthenticatedAdminRequest, res: Response) => {
  const db = getDatabase();
  const firm = await db.getFirm(req.params.firmId, true);

  if (!firm) {
    return res.status(404).json({ error: 'Firm not found' });
  }

  const users = await db.listUsers(firm.id);
  return res.status(200).json({
    users: users.map((u) => ({
      id: u.id,
      firmId: u.firmId,
      name: u.name,
      email: u.email,
      role: u.role,
      jobType: u.jobType,
      jobTitleLabel: u.jobTitleLabel,
      active: u.active,
      mustChangePassword: u.mustChangePassword,
      createdAt: u.createdAt,
    })),
  });
});

// 15. POST /firms/:firmId/users/:userId/reset-password - Platform admin password reset (e.g. for Owner)
adminFirmsRouter.post(
  '/:firmId/users/:userId/reset-password',
  async (req: AuthenticatedAdminRequest, res: Response) => {
    const { firmId, userId } = req.params;
    const db = getDatabase();

    const firm = await db.getFirm(firmId, true);
    if (!firm) {
      return res.status(404).json({ error: 'Firm not found' });
    }

    const targetUser = await db.getUserById(userId);
    if (!targetUser || targetUser.firmId !== firm.id || targetUser.deletedAt) {
      return res.status(404).json({ error: 'User not found in this firm' });
    }

    // Rate-limit: max 5 requests per 15 minutes per target user
    const rateLimitKey = `admin_reset:${firm.id}:${targetUser.id}`;
    if (!checkResetPasswordRateLimit(rateLimitKey, 5, 15 * 60 * 1000)) {
      return res.status(429).json({
        error: 'Too Many Requests',
        code: 'RATE_LIMITED',
        message: 'Too many password reset attempts for this user. Please try again later.',
      });
    }

    const temporaryPassword = generateSecureTemporaryPassword();
    const passwordHash = await bcrypt.hash(temporaryPassword, 10);

    await db.updateUser(targetUser.id, {
      passwordHash,
      mustChangePassword: true,
      failedLoginAttempts: 0,
      lockedUntil: null,
      updatedBy: req.admin!.id,
    });

    // Invalidate user active sessions
    revokeAllUserSessions(targetUser.id);

    // Record in admin_audit (NEVER log raw password or hash!)
    await recordAdminAudit({
      adminId: req.admin!.id,
      action: 'RESET_USER_PASSWORD',
      targetFirmId: firm.id,
      old: { mustChangePassword: targetUser.mustChangePassword },
      new: {
        userId: targetUser.id,
        userEmail: targetUser.email,
        role: targetUser.role,
        mustChangePassword: true,
        sessionsRevoked: true,
      },
      ip: req.ip,
    });

    // Also record in firm audit log
    await recordAudit({
      firmId: firm.id,
      userId: req.admin!.id,
      userName: `Admin: ${req.admin!.email}`,
      entity: 'User',
      entityId: targetUser.id,
      action: 'RESET_PASSWORD',
      oldValue: { mustChangePassword: targetUser.mustChangePassword },
      newValue: { mustChangePassword: true, resetBy: 'platform_admin' },
    });

    return res.status(200).json({
      message: 'Password reset successfully.',
      temporaryPassword,
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
