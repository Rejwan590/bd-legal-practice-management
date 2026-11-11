import { Hono } from 'hono';
import { setCookie, deleteCookie } from 'hono/cookie';
import { z } from 'zod';
import { Env } from '../middleware/auth';
import { adminAuthMiddleware } from '../middleware/adminAuth';
import { getDb } from '../db/client';
import * as schema from '../db/schema';
import { hashPassword, verifyPassword, DUMMY_HASH } from '../utils/crypto';
import { signAdminToken } from '../utils/jwt';
import { calculateMonthlyPriceBdt } from '../utils/pricing';
import { generateSecureTemporaryPassword, ALL_OWNER_PERMISSIONS } from '../utils/security';
import { buildAdminAuditEntry, buildAuditEntry } from '../utils/audit';
import { eq, isNull, desc, and, sql, asc } from 'drizzle-orm';

export const adminRouter = new Hono<{ Bindings: Env; Variables: any }>();

// ==========================================
// PLATFORM ADMIN AUTHENTICATION
// ==========================================
adminRouter.post('/auth/login', async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const loginSchema = z.object({
    email: z.string().email(),
    password: z.string().min(1),
  });

  const parse = loginSchema.safeParse(body);
  if (!parse.success) {
    return c.json({ error: 'Validation failed', message: 'Valid admin email and password required' }, 400);
  }

  const db = getDb(c.env.DB);
  const adminRows = await db
    .select()
    .from(schema.platformAdmins)
    .where(eq(schema.platformAdmins.email, parse.data.email.toLowerCase().trim()))
    .limit(1);

  const admin = adminRows[0];
  if (!admin) {
    await verifyPassword(parse.data.password, DUMMY_HASH);
    return c.json({ error: 'Unauthorized', message: 'Invalid admin credentials' }, 401);
  }

  if (!admin.active) {
    await verifyPassword(parse.data.password, DUMMY_HASH);
    return c.json({ error: 'Unauthorized', message: 'Admin account disabled' }, 401);
  }

  const now = new Date();
  if (admin.lockedUntil && new Date(admin.lockedUntil).getTime() > now.getTime()) {
    return c.json({ error: 'Too Many Requests', message: 'Account locked temporarily' }, 429);
  }

  const isValid = await verifyPassword(parse.data.password, admin.passwordHash);
  if (!isValid) {
    const attempts = (admin.failedAttempts || 0) + 1;
    const lockedUntil = attempts >= 5 ? new Date(now.getTime() + 15 * 60 * 1000).toISOString() : null;
    await db
      .update(schema.platformAdmins)
      .set({ failedAttempts: attempts, lockedUntil, updatedAt: now.toISOString() })
      .where(eq(schema.platformAdmins.id, admin.id));
    return c.json({ error: 'Unauthorized', message: 'Invalid admin credentials' }, 401);
  }

  await db
    .update(schema.platformAdmins)
    .set({ failedAttempts: 0, lockedUntil: null, updatedAt: now.toISOString() })
    .where(eq(schema.platformAdmins.id, admin.id));

  const token = await signAdminToken(
    { adminId: admin.id, email: admin.email },
    c.env.ADMIN_JWT_SECRET || 'test-admin-jwt-secret-min-32-chars-long'
  );

  setCookie(c, 'admin_access_token', token, {
    httpOnly: true,
    secure: true,
    sameSite: 'None',
    path: '/',
    maxAge: 8 * 60 * 60,
  });

  return c.json({
    success: true,
    token,
    admin: { id: admin.id, email: admin.email, active: admin.active },
  });
});

adminRouter.get('/auth/me', adminAuthMiddleware, (c) => {
  const admin = c.get('admin') as schema.PlatformAdmin;
  return c.json({
    admin: { id: admin.id, email: admin.email, active: admin.active },
  });
});

adminRouter.post('/auth/logout', (c) => {
  deleteCookie(c, 'admin_access_token', { path: '/' });
  return c.json({ message: 'Logged out' });
});

// ==========================================
// HELPERS
// ==========================================
async function buildFirmEnrichment(db: any, firm: schema.Firm, planMap?: Map<string, schema.Plan>) {
  const [usersList, devicesList] = await Promise.all([
    db
      .select({ id: schema.users.id })
      .from(schema.users)
      .where(and(eq(schema.users.firmId, firm.id), isNull(schema.users.deletedAt))),
    db
      .select({ id: schema.devices.id, status: schema.devices.status })
      .from(schema.devices)
      .where(eq(schema.devices.firmId, firm.id)),
  ]);

  let plan: schema.Plan | null = null;
  if (firm.planId) {
    if (planMap?.has(firm.planId)) {
      plan = planMap.get(firm.planId)!;
    } else {
      const rows = await db.select().from(schema.plans).where(eq(schema.plans.id, firm.planId)).limit(1);
      plan = rows[0] || null;
    }
  }

  let monthlyPriceBdt: number | undefined;
  let pricingBreakdown: any;
  if (plan) {
    pricingBreakdown = calculateMonthlyPriceBdt(plan, firm);
    if (firm.isTrial) {
      const trialFee = firm.trialPriceBdt ?? 0;
      pricingBreakdown.isTrial = true;
      pricingBreakdown.note = 'after trial';
      pricingBreakdown.trialPriceBdt = trialFee;
      monthlyPriceBdt = trialFee;
    } else {
      monthlyPriceBdt = pricingBreakdown.monthlyPriceBdt;
    }
  }

  return {
    plan,
    userCount: usersList.length,
    deviceCount: devicesList.length,
    pendingDeviceCount: devicesList.filter((d: any) => d.status === 'pending').length,
    monthlyPriceBdt,
    pricingBreakdown,
  };
}

async function transitionFirmStatus(
  c: any,
  newStatus: 'suspended' | 'disabled' | 'active',
  eventType: string,
  auditAction: string,
  message: string
) {
  const admin = c.get('admin') as schema.PlatformAdmin;
  const firmId = c.req.param('id') as string;
  const db = getDb(c.env.DB);

  const firmRows = await db
    .select()
    .from(schema.firms)
    .where(and(eq(schema.firms.id, firmId), isNull(schema.firms.deletedAt)))
    .limit(1);

  const firm = firmRows[0];
  if (!firm) {
    return c.json({ error: 'Firm not found' }, 404);
  }

  const nowIso = new Date().toISOString();
  const oldState = { status: firm.status };
  const newState = { status: newStatus };

  await db.batch([
    db
      .update(schema.firms)
      .set({ status: newStatus, updatedAt: nowIso, updatedBy: admin.id })
      .where(eq(schema.firms.id, firmId)),
    db.insert(schema.licenseEvents).values({
      id: crypto.randomUUID(),
      firmId,
      type: eventType,
      old: oldState,
      new: newState,
      byAdmin: admin.id,
      at: nowIso,
    }),
    db.insert(schema.adminAudit).values(
      buildAdminAuditEntry({
        adminId: admin.id,
        action: auditAction,
        targetFirmId: firmId,
        old: oldState,
        new: newState,
        at: nowIso,
      })
    ),
  ] as any);

  return c.json({ message, firm: { ...firm, status: newStatus, updatedAt: nowIso } });
}

// ==========================================
// FIRM MANAGEMENT
// ==========================================
adminRouter.get('/firms', adminAuthMiddleware, async (c) => {
  const page = Math.max(1, parseInt(c.req.query('page') || '1', 10));
  const limit = Math.min(100, Math.max(1, parseInt(c.req.query('limit') || '50', 10)));
  const search = c.req.query('search')?.trim().toLowerCase() || '';
  const statusFilter = c.req.query('status')?.trim() || '';

  const db = getDb(c.env.DB);
  const [allFirms, allPlans] = await Promise.all([
    db.select().from(schema.firms).where(isNull(schema.firms.deletedAt)).orderBy(desc(schema.firms.createdAt)),
    db.select().from(schema.plans),
  ]);

  const planMap = new Map<string, schema.Plan>(allPlans.map((p) => [p.id, p]));

  const filtered = allFirms.filter((f) => {
    if (statusFilter && f.status !== statusFilter) return false;
    if (search) {
      const matches =
        f.name.toLowerCase().includes(search) ||
        (f.officeAddress || '').toLowerCase().includes(search) ||
        (f.contact || '').toLowerCase().includes(search) ||
        (f.barCouncilReg || '').toLowerCase().includes(search);
      if (!matches) return false;
    }
    return true;
  });

  const total = filtered.length;
  const totalPages = Math.max(1, Math.ceil(total / limit));
  const paged = filtered.slice((page - 1) * limit, page * limit);

  const enriched = await Promise.all(
    paged.map(async (f) => {
      const extra = await buildFirmEnrichment(db, f, planMap);
      return {
        ...f,
        userCount: extra.userCount,
        deviceCount: extra.deviceCount,
        pendingDeviceCount: extra.pendingDeviceCount,
        monthlyPriceBdt: extra.monthlyPriceBdt,
        pricingBreakdown: extra.pricingBreakdown,
      };
    })
  );

  return c.json({ firms: enriched, total, page, limit, totalPages });
});

adminRouter.post('/firms', adminAuthMiddleware, async (c) => {
  const admin = c.get('admin') as schema.PlatformAdmin;
  const body = await c.req.json().catch(() => ({}));

  const createFirmSchema = z.object({
    name: z.string().min(2),
    city: z.string().optional().default('Dhaka'),
    officeAddress: z.string().optional(),
    phone: z.string().optional().default(''),
    email: z.string().email().optional(),
    contact: z.string().optional(),
    barCouncilReg: z.string().nullable().optional(),
    courtAffiliations: z.union([z.string(), z.array(z.string())]).nullable().optional(),
    ownerName: z.string().min(2),
    ownerEmail: z.string().email(),
    ownerPassword: z.string().min(8).optional(),
    planId: z.string().optional().default('solo'),
    maxUsers: z.number().int().min(1).default(5),
    maxDevices: z.number().int().min(1).default(5),
    devicePolicy: z.enum(['auto-approve', 'manual']).optional().default('auto-approve'),
    licenseType: z.enum(['trial', 'paid']).default('trial'),
    trialDays: z.number().int().min(1).max(365).default(14),
    trialPriceBdt: z.number().int().min(0).max(10000000).optional().default(0),
    billingCycle: z.enum(['monthly', 'annual']).optional().default('monthly'),
    customBasePriceBdt: z.number().int().min(0).nullable().optional(),
    customAnnualPriceBdt: z.number().int().min(0).nullable().optional(),
    customExtraUserPriceBdt: z.number().int().min(0).nullable().optional(),
    customExtraDevicePriceBdt: z.number().int().min(0).nullable().optional(),
    priceLockedUntil: z.string().nullable().optional(),
    pricingNote: z.string().nullable().optional(),
    notes: z.string().optional(),
  });

  const parse = createFirmSchema.safeParse(body);
  if (!parse.success) {
    return c.json({ error: 'Validation failed', errors: parse.error.issues }, 400);
  }

  const data = parse.data;
  const db = getDb(c.env.DB);
  const cleanOwnerEmail = data.ownerEmail.toLowerCase().trim();

  const existingUser = await db
    .select({ id: schema.users.id })
    .from(schema.users)
    .where(and(eq(schema.users.email, cleanOwnerEmail), isNull(schema.users.deletedAt)))
    .limit(1);

  if (existingUser[0]) {
    return c.json({ error: 'Conflict', message: 'A user with this owner email already exists' }, 409);
  }

  const planRows = await db.select().from(schema.plans).where(eq(schema.plans.id, data.planId)).limit(1);
  if (planRows[0] && planRows[0].status === 'archived') {
    return c.json({ error: 'BadRequest', message: `Cannot assign archived plan: ${planRows[0].name}` }, 400);
  }

  const rawPassword = data.ownerPassword || generateSecureTemporaryPassword();
  const passwordHash = await hashPassword(rawPassword);

  const firmId = crypto.randomUUID();
  const ownerId = crypto.randomUUID();
  const now = new Date();
  const nowIso = now.toISOString();

  const isTrial = data.licenseType === 'trial';
  const durationDays = isTrial ? data.trialDays : 30;
  const expiresAt = new Date(now.getTime() + durationDays * 24 * 60 * 60 * 1000).toISOString();

  const firmData = {
    id: firmId,
    firmId,
    name: data.name,
    barCouncilReg: data.barCouncilReg ?? null,
    officeAddress: data.officeAddress ?? data.city ?? null,
    courtAffiliations: Array.isArray(data.courtAffiliations)
      ? JSON.stringify(data.courtAffiliations)
      : data.courtAffiliations ?? null,
    contact: data.contact ?? data.phone ?? data.email ?? cleanOwnerEmail,
    status: 'active' as const,
    planId: planRows[0] ? data.planId : null,
    billingCycle: data.billingCycle,
    customBasePriceBdt: data.customBasePriceBdt ?? null,
    customAnnualPriceBdt: data.customAnnualPriceBdt ?? null,
    customExtraUserPriceBdt: data.customExtraUserPriceBdt ?? null,
    customExtraDevicePriceBdt: data.customExtraDevicePriceBdt ?? null,
    priceLockedUntil: data.priceLockedUntil ?? null,
    pricingNote: data.pricingNote ?? data.notes ?? null,
    licenseStartsAt: nowIso,
    licenseExpiresAt: expiresAt,
    maxUsers: data.maxUsers,
    maxDevices: data.maxDevices,
    devicePolicy: data.devicePolicy,
    allowOwnerDeviceRemoval: false,
    isTrial,
    trialStartedAt: isTrial ? nowIso : null,
    trialDays: isTrial ? data.trialDays : null,
    trialPriceBdt: isTrial ? (data.trialPriceBdt ?? 0) : 0,
    visibilityMode: 'team' as const,
    createdAt: nowIso,
    updatedAt: nowIso,
    createdBy: admin.id,
  };

  const ownerData = {
    id: ownerId,
    firmId,
    name: data.ownerName,
    email: cleanOwnerEmail,
    passwordHash,
    role: 'Owner' as const,
    jobType: 'lawyer_senior' as const,
    permissions: [...ALL_OWNER_PERMISSIONS],
    language: 'en' as const,
    active: true,
    mustChangePassword: !data.ownerPassword,
    failedLoginAttempts: 0,
    createdAt: nowIso,
    updatedAt: nowIso,
    createdBy: admin.id,
  };

  await db.batch([
    db.insert(schema.firms).values(firmData),
    db.insert(schema.users).values(ownerData),
    db.insert(schema.licenseEvents).values({
      id: crypto.randomUUID(),
      firmId,
      type: isTrial ? 'TRIAL_CREATED' : 'CREATED',
      old: null,
      new: { licenseType: data.licenseType, expiresAt, maxUsers: data.maxUsers },
      byAdmin: admin.id,
      at: nowIso,
    }),
    db.insert(schema.adminAudit).values(
      buildAdminAuditEntry({
        adminId: admin.id,
        action: 'FIRM_CREATE',
        targetFirmId: firmId,
        new: { firmName: data.name, ownerEmail: cleanOwnerEmail },
        at: nowIso,
      })
    ),
  ] as any);

  const ownerSummary = {
    id: ownerId,
    name: data.ownerName,
    email: cleanOwnerEmail,
    role: 'Owner',
    mustChangePassword: !data.ownerPassword,
  };

  return c.json(
    {
      message: 'Firm provisioned successfully',
      firm: firmData,
      owner: ownerSummary,
      ownerUser: ownerSummary,
      temporaryPassword: rawPassword,
    },
    201
  );
});

adminRouter.get('/firms/:id', adminAuthMiddleware, async (c) => {
  const firmId = c.req.param('id') as string;
  const db = getDb(c.env.DB);

  const firmRows = await db
    .select()
    .from(schema.firms)
    .where(and(eq(schema.firms.id, firmId), isNull(schema.firms.deletedAt)))
    .limit(1);

  const firm = firmRows[0];
  if (!firm) {
    return c.json({ error: 'Firm not found' }, 404);
  }

  const extra = await buildFirmEnrichment(db, firm);
  const isExpired = new Date(firm.licenseExpiresAt).getTime() < Date.now();

  const lastAudit = await db
    .select({ timestamp: schema.auditLog.timestamp })
    .from(schema.auditLog)
    .where(eq(schema.auditLog.firmId, firm.id))
    .orderBy(desc(schema.auditLog.timestamp))
    .limit(1);

  const license = {
    planId: firm.planId,
    maxUsers: firm.maxUsers,
    maxDevices: firm.maxDevices,
    isTrial: firm.isTrial,
    trialStartedAt: firm.trialStartedAt,
    trialDays: firm.trialDays,
    trialPriceBdt: firm.trialPriceBdt ?? 0,
    billingCycle: firm.billingCycle,
    customBasePriceBdt: firm.customBasePriceBdt,
    customAnnualPriceBdt: firm.customAnnualPriceBdt,
    customExtraUserPriceBdt: firm.customExtraUserPriceBdt,
    customExtraDevicePriceBdt: firm.customExtraDevicePriceBdt,
    priceLockedUntil: firm.priceLockedUntil,
    pricingNote: firm.pricingNote,
    licenseStartsAt: firm.licenseStartsAt,
    licenseExpiresAt: firm.licenseExpiresAt,
    status: firm.status,
    isExpired,
  };

  return c.json({
    firm: {
      ...firm,
      monthlyPriceBdt: extra.monthlyPriceBdt,
      pricingBreakdown: extra.pricingBreakdown,
    },
    plan: extra.plan,
    license,
    monthlyPriceBdt: extra.monthlyPriceBdt,
    pricingBreakdown: extra.pricingBreakdown,
    userCount: extra.userCount,
    deviceCount: extra.deviceCount,
    pendingDeviceCount: extra.pendingDeviceCount,
    lastActivity: lastAudit[0]?.timestamp || null,
  });
});

adminRouter.patch('/firms/:id', adminAuthMiddleware, async (c) => {
  const admin = c.get('admin') as schema.PlatformAdmin;
  const firmId = c.req.param('id') as string;
  const body = await c.req.json().catch(() => ({}));

  const updateSchema = z.object({
    name: z.string().min(2).optional(),
    barCouncilReg: z.string().nullable().optional(),
    officeAddress: z.string().nullable().optional(),
    courtAffiliations: z.union([z.string(), z.array(z.string())]).nullable().optional(),
    contact: z.string().nullable().optional(),
    city: z.string().nullable().optional(),
    phone: z.string().nullable().optional(),
    email: z.string().email().nullable().optional(),
    maxUsers: z.number().int().min(1).optional(),
    maxDevices: z.number().int().min(1).optional(),
    devicePolicy: z.enum(['auto-approve', 'manual']).optional(),
    allowOwnerDeviceRemoval: z.boolean().optional(),
    visibilityMode: z.enum(['open', 'team', 'firm_wide', 'reporting_chain']).optional(),
  });

  const parse = updateSchema.safeParse(body);
  if (!parse.success) {
    return c.json({ error: 'Bad Request', errors: parse.error.issues }, 400);
  }

  const db = getDb(c.env.DB);
  const firmRows = await db
    .select()
    .from(schema.firms)
    .where(and(eq(schema.firms.id, firmId), isNull(schema.firms.deletedAt)))
    .limit(1);

  const firm = firmRows[0];
  if (!firm) {
    return c.json({ error: 'Firm not found' }, 404);
  }

  const nowIso = new Date().toISOString();
  const d = parse.data;
  const updates: Record<string, any> = { updatedAt: nowIso, updatedBy: admin.id };
  if (d.name !== undefined) updates.name = d.name;
  if (d.barCouncilReg !== undefined) updates.barCouncilReg = d.barCouncilReg;
  if (d.officeAddress !== undefined) updates.officeAddress = d.officeAddress;
  else if (d.city !== undefined) updates.officeAddress = d.city;
  if (d.courtAffiliations !== undefined) {
    updates.courtAffiliations = Array.isArray(d.courtAffiliations)
      ? JSON.stringify(d.courtAffiliations)
      : d.courtAffiliations;
  }
  if (d.contact !== undefined) updates.contact = d.contact;
  else if (d.phone !== undefined) updates.contact = d.phone;
  else if (d.email !== undefined) updates.contact = d.email;
  if (d.maxUsers !== undefined) updates.maxUsers = d.maxUsers;
  if (d.maxDevices !== undefined) updates.maxDevices = d.maxDevices;
  if (d.devicePolicy !== undefined) updates.devicePolicy = d.devicePolicy;
  if (d.allowOwnerDeviceRemoval !== undefined) updates.allowOwnerDeviceRemoval = d.allowOwnerDeviceRemoval;
  if (d.visibilityMode !== undefined) {
    updates.visibilityMode =
      d.visibilityMode === 'firm_wide' ? 'open' : d.visibilityMode === 'reporting_chain' ? 'team' : d.visibilityMode;
  }

  await db.batch([
    db.update(schema.firms).set(updates).where(eq(schema.firms.id, firmId)),
    db.insert(schema.adminAudit).values(
      buildAdminAuditEntry({
        adminId: admin.id,
        action: 'FIRM_UPDATE',
        targetFirmId: firmId,
        old: { name: firm.name, officeAddress: firm.officeAddress, contact: firm.contact, maxUsers: firm.maxUsers, maxDevices: firm.maxDevices },
        new: updates,
        at: nowIso,
      })
    ),
  ] as any);

  return c.json({ message: 'Firm updated successfully.', firm: { ...firm, ...updates } });
});

adminRouter.post('/firms/:id/suspend', adminAuthMiddleware, (c) =>
  transitionFirmStatus(c, 'suspended', 'SUSPEND', 'FIRM_SUSPEND', 'Firm suspended successfully.')
);
adminRouter.post('/firms/:id/disable', adminAuthMiddleware, (c) =>
  transitionFirmStatus(c, 'disabled', 'DISABLE', 'FIRM_DISABLE', 'Firm disabled successfully.')
);
adminRouter.post('/firms/:id/reactivate', adminAuthMiddleware, (c) =>
  transitionFirmStatus(c, 'active', 'REACTIVATE', 'FIRM_REACTIVATE', 'Firm reactivated successfully.')
);

adminRouter.delete('/firms/:id', adminAuthMiddleware, async (c) => {
  const admin = c.get('admin') as schema.PlatformAdmin;
  const firmId = c.req.param('id') as string;
  const body = await c.req.json().catch(() => ({}));

  const parse = z.object({ confirmFirmName: z.string().min(1) }).safeParse(body);
  if (!parse.success) {
    return c.json({ error: 'Bad Request', message: 'confirmFirmName is required to delete a firm.' }, 400);
  }

  const db = getDb(c.env.DB);
  const firmRows = await db
    .select()
    .from(schema.firms)
    .where(and(eq(schema.firms.id, firmId), isNull(schema.firms.deletedAt)))
    .limit(1);

  const firm = firmRows[0];
  if (!firm) {
    return c.json({ error: 'Firm not found' }, 404);
  }

  if (firm.name !== parse.data.confirmFirmName) {
    return c.json({ error: 'Bad Request', message: 'Confirmation firm name does not match.' }, 400);
  }

  const nowIso = new Date().toISOString();
  await db.batch([
    db
      .update(schema.firms)
      .set({ deletedAt: nowIso, status: 'disabled', updatedAt: nowIso, updatedBy: admin.id })
      .where(eq(schema.firms.id, firmId)),
    db
      .update(schema.users)
      .set({ deletedAt: nowIso, active: false, updatedAt: nowIso, updatedBy: admin.id })
      .where(eq(schema.users.firmId, firmId)),
    db.insert(schema.adminAudit).values(
      buildAdminAuditEntry({
        adminId: admin.id,
        action: 'FIRM_SOFT_DELETE',
        targetFirmId: firmId,
        old: { name: firm.name, status: firm.status },
        new: { deletedAt: nowIso },
        at: nowIso,
      })
    ),
  ] as any);

  return c.json({ message: 'Firm soft-deleted successfully.', softDeleted: true });
});

adminRouter.get('/firms/:id/users', adminAuthMiddleware, async (c) => {
  const firmId = c.req.param('id') as string;
  const db = getDb(c.env.DB);

  const firmRows = await db
    .select({ id: schema.firms.id })
    .from(schema.firms)
    .where(and(eq(schema.firms.id, firmId), isNull(schema.firms.deletedAt)))
    .limit(1);
  if (!firmRows[0]) {
    return c.json({ error: 'Firm not found' }, 404);
  }

  const users = await db
    .select({
      id: schema.users.id,
      firmId: schema.users.firmId,
      name: schema.users.name,
      email: schema.users.email,
      role: schema.users.role,
      jobType: schema.users.jobType,
      jobTitleLabel: schema.users.jobTitleLabel,
      active: schema.users.active,
      mustChangePassword: schema.users.mustChangePassword,
      createdAt: schema.users.createdAt,
    })
    .from(schema.users)
    .where(and(eq(schema.users.firmId, firmId), isNull(schema.users.deletedAt)));

  return c.json({ users });
});

adminRouter.post('/firms/:firmId/users/:userId/reset-password', adminAuthMiddleware, async (c) => {
  const admin = c.get('admin') as schema.PlatformAdmin;
  const firmId = c.req.param('firmId') as string;
  const userId = c.req.param('userId') as string;
  const db = getDb(c.env.DB);

  const firmRows = await db
    .select()
    .from(schema.firms)
    .where(and(eq(schema.firms.id, firmId), isNull(schema.firms.deletedAt)))
    .limit(1);
  if (!firmRows[0]) {
    return c.json({ error: 'Firm not found' }, 404);
  }

  const userRows = await db
    .select()
    .from(schema.users)
    .where(and(eq(schema.users.id, userId), eq(schema.users.firmId, firmId), isNull(schema.users.deletedAt)))
    .limit(1);

  const targetUser = userRows[0];
  if (!targetUser) {
    return c.json({ error: 'User not found in this firm' }, 404);
  }

  const temporaryPassword = generateSecureTemporaryPassword();
  const passwordHash = await hashPassword(temporaryPassword);
  const nowIso = new Date().toISOString();

  await db.batch([
    db
      .update(schema.users)
      .set({
        passwordHash,
        mustChangePassword: true,
        failedLoginAttempts: 0,
        lockedUntil: null,
        updatedAt: nowIso,
        updatedBy: admin.id,
      })
      .where(eq(schema.users.id, targetUser.id)),
    db.insert(schema.adminAudit).values(
      buildAdminAuditEntry({
        adminId: admin.id,
        action: 'RESET_USER_PASSWORD',
        targetFirmId: firmId,
        old: { mustChangePassword: targetUser.mustChangePassword },
        new: { userId: targetUser.id, userEmail: targetUser.email, role: targetUser.role, mustChangePassword: true },
        at: nowIso,
      })
    ),
    db.insert(schema.auditLog).values(
      buildAuditEntry({
        firmId,
        userId: admin.id,
        userName: `Admin: ${admin.email}`,
        entity: 'User',
        entityId: targetUser.id,
        action: 'RESET_PASSWORD',
        oldValue: { mustChangePassword: targetUser.mustChangePassword },
        newValue: { mustChangePassword: true, resetBy: 'platform_admin' },
        now: nowIso,
      })
    ),
  ] as any);

  return c.json({
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
});

adminRouter.put('/firms/:id/license', adminAuthMiddleware, async (c) => {
  const admin = c.get('admin') as schema.PlatformAdmin;
  const firmId = c.req.param('id') as string;
  const body = await c.req.json().catch(() => ({}));

  const licenseSchema = z.object({
    planId: z.string().optional(),
    maxUsers: z.number().int().min(1).optional(),
    maxDevices: z.number().int().min(1).optional(),
    startDate: z.string().optional(),
    expiryDate: z.string().optional(),
    billingCycle: z.enum(['monthly', 'annual']).optional(),
    customBasePriceBdt: z.number().int().min(0).nullable().optional(),
    customAnnualPriceBdt: z.number().int().min(0).nullable().optional(),
    customExtraUserPriceBdt: z.number().int().min(0).nullable().optional(),
    customExtraDevicePriceBdt: z.number().int().min(0).nullable().optional(),
    priceLockedUntil: z.string().nullable().optional(),
    pricingNote: z.string().nullable().optional(),
    trialPriceBdt: z.number().int().min(0).max(10000000).optional(),
  });

  const parse = licenseSchema.safeParse(body);
  if (!parse.success) {
    return c.json({ error: 'Bad Request', message: 'Invalid license update parameters', issues: parse.error.issues }, 400);
  }

  const db = getDb(c.env.DB);
  const firmRows = await db
    .select()
    .from(schema.firms)
    .where(and(eq(schema.firms.id, firmId), isNull(schema.firms.deletedAt)))
    .limit(1);

  const firm = firmRows[0];
  if (!firm) {
    return c.json({ error: 'Firm not found' }, 404);
  }

  const data = parse.data;
  if (data.planId) {
    const planRows = await db.select().from(schema.plans).where(eq(schema.plans.id, data.planId)).limit(1);
    if (!planRows[0]) {
      return c.json({ error: 'NotFound', message: `Plan ${data.planId} not found` }, 404);
    }
    if (planRows[0].status === 'archived') {
      return c.json({ error: 'BadRequest', message: `Cannot assign archived plan: ${planRows[0].name}` }, 400);
    }
  }

  const nowIso = new Date().toISOString();
  const updates: Record<string, any> = { updatedAt: nowIso, updatedBy: admin.id };
  if (data.planId !== undefined) updates.planId = data.planId;
  if (data.maxUsers !== undefined) updates.maxUsers = data.maxUsers;
  if (data.maxDevices !== undefined) updates.maxDevices = data.maxDevices;
  if (data.billingCycle !== undefined) updates.billingCycle = data.billingCycle;
  if (data.customBasePriceBdt !== undefined) updates.customBasePriceBdt = data.customBasePriceBdt;
  if (data.customAnnualPriceBdt !== undefined) updates.customAnnualPriceBdt = data.customAnnualPriceBdt;
  if (data.customExtraUserPriceBdt !== undefined) updates.customExtraUserPriceBdt = data.customExtraUserPriceBdt;
  if (data.customExtraDevicePriceBdt !== undefined) updates.customExtraDevicePriceBdt = data.customExtraDevicePriceBdt;
  if (data.priceLockedUntil !== undefined) updates.priceLockedUntil = data.priceLockedUntil;
  if (data.pricingNote !== undefined) updates.pricingNote = data.pricingNote;
  if (data.trialPriceBdt !== undefined) updates.trialPriceBdt = data.trialPriceBdt;
  if (data.startDate) updates.licenseStartsAt = new Date(data.startDate).toISOString();
  if (data.expiryDate) {
    const newExpiry = new Date(data.expiryDate);
    updates.licenseExpiresAt = newExpiry.toISOString();
    if (newExpiry.getTime() > Date.now() && firm.status === 'expired') {
      updates.status = 'active';
    }
  }

  const oldLicense = {
    planId: firm.planId,
    maxUsers: firm.maxUsers,
    maxDevices: firm.maxDevices,
    billingCycle: firm.billingCycle,
    trialPriceBdt: firm.trialPriceBdt ?? 0,
    licenseExpiresAt: firm.licenseExpiresAt,
  };

  await db.batch([
    db.update(schema.firms).set(updates).where(eq(schema.firms.id, firmId)),
    db.insert(schema.adminAudit).values(
      buildAdminAuditEntry({
        adminId: admin.id,
        action: 'LICENSE_UPDATE',
        targetFirmId: firmId,
        old: oldLicense,
        new: updates,
        at: nowIso,
      })
    ),
    db.insert(schema.licenseEvents).values({
      id: crypto.randomUUID(),
      firmId,
      type: 'UPDATE',
      old: oldLicense,
      new: updates,
      byAdmin: admin.id,
      at: nowIso,
    }),
  ] as any);

  return c.json({ message: 'Firm license updated successfully.', firm: { ...firm, ...updates } });
});

adminRouter.post('/firms/:id/renew', adminAuthMiddleware, async (c) => {
  const admin = c.get('admin') as schema.PlatformAdmin;
  const firmId = c.req.param('id') as string;
  const body = await c.req.json().catch(() => ({}));

  const parse = z.object({ months: z.number().int().min(1).max(60) }).safeParse(body);
  if (!parse.success) {
    return c.json({ error: 'Bad Request', message: 'Invalid renewal parameters', issues: parse.error.issues }, 400);
  }

  const db = getDb(c.env.DB);
  const firmRows = await db
    .select()
    .from(schema.firms)
    .where(and(eq(schema.firms.id, firmId), isNull(schema.firms.deletedAt)))
    .limit(1);

  const firm = firmRows[0];
  if (!firm) {
    return c.json({ error: 'Firm not found' }, 404);
  }

  const baseTime = Math.max(Date.now(), new Date(firm.licenseExpiresAt).getTime());
  const newExpiry = new Date(baseTime + parse.data.months * 30 * 24 * 60 * 60 * 1000).toISOString();
  const nowIso = new Date().toISOString();
  const updates: Record<string, any> = {
    licenseExpiresAt: newExpiry,
    updatedAt: nowIso,
    updatedBy: admin.id,
  };
  if (firm.status === 'expired') {
    updates.status = 'active';
  }

  await db.batch([
    db.update(schema.firms).set(updates).where(eq(schema.firms.id, firmId)),
    db.insert(schema.adminAudit).values(
      buildAdminAuditEntry({
        adminId: admin.id,
        action: 'LICENSE_RENEW',
        targetFirmId: firmId,
        old: { licenseExpiresAt: firm.licenseExpiresAt, status: firm.status },
        new: updates,
        at: nowIso,
      })
    ),
    db.insert(schema.licenseEvents).values({
      id: crypto.randomUUID(),
      firmId,
      type: 'RENEW',
      old: { licenseExpiresAt: firm.licenseExpiresAt, status: firm.status },
      new: updates,
      byAdmin: admin.id,
      at: nowIso,
    }),
  ] as any);

  return c.json({
    message: 'Firm license renewed successfully.',
    firm: { ...firm, ...updates },
    licenseExpiresAt: newExpiry,
  });
});

adminRouter.post('/firms/:id/extend-trial', adminAuthMiddleware, async (c) => {
  const admin = c.get('admin') as schema.PlatformAdmin;
  const firmId = c.req.param('id') as string;
  const body = await c.req.json().catch(() => ({}));

  const parse = z
    .object({
      days: z.number().int().min(1).max(365).optional(),
      additionalDays: z.number().int().min(1).max(365).optional(),
    })
    .refine((val) => val.days !== undefined || val.additionalDays !== undefined, {
      message: 'days is required and must be an integer between 1 and 365',
    })
    .safeParse(body);
  if (!parse.success) {
    return c.json({ error: 'Validation failed', errors: parse.error.issues }, 400);
  }

  const daysToAdd = (parse.data.days ?? parse.data.additionalDays)!;

  const db = getDb(c.env.DB);
  const firmRows = await db
    .select()
    .from(schema.firms)
    .where(and(eq(schema.firms.id, firmId), isNull(schema.firms.deletedAt)))
    .limit(1);

  const firm = firmRows[0];
  if (!firm || !firm.isTrial) {
    return c.json({ error: 'Bad request', message: 'Firm not found or not on trial' }, 400);
  }

  const baseTime = Math.max(Date.now(), new Date(firm.licenseExpiresAt).getTime());
  const newExpiry = new Date(baseTime + daysToAdd * 24 * 60 * 60 * 1000).toISOString();
  const nowIso = new Date().toISOString();
  const newTrialDays = (firm.trialDays || 0) + daysToAdd;

  await db.batch([
    db
      .update(schema.firms)
      .set({
        licenseExpiresAt: newExpiry,
        trialDays: newTrialDays,
        status: firm.status === 'expired' ? 'active' : firm.status,
        updatedAt: nowIso,
      })
      .where(eq(schema.firms.id, firmId)),
    db.insert(schema.licenseEvents).values({
      id: crypto.randomUUID(),
      firmId,
      type: 'EXTEND_TRIAL',
      old: { licenseExpiresAt: firm.licenseExpiresAt },
      new: { licenseExpiresAt: newExpiry, addedDays: daysToAdd },
      byAdmin: admin.id,
      at: nowIso,
    }),
    db.insert(schema.adminAudit).values(
      buildAdminAuditEntry({
        adminId: admin.id,
        action: 'FIRM_EXTEND_TRIAL',
        targetFirmId: firmId,
        old: { licenseExpiresAt: firm.licenseExpiresAt },
        new: { licenseExpiresAt: newExpiry, trialDays: newTrialDays },
        at: nowIso,
      })
    ),
  ] as any);

  return c.json({
    message: 'Trial extended successfully',
    firm: { ...firm, licenseExpiresAt: newExpiry, trialDays: newTrialDays, status: firm.status === 'expired' ? 'active' : firm.status },
    newExpiry,
  });
});

adminRouter.post('/firms/:id/convert-to-paid', adminAuthMiddleware, async (c) => {
  const admin = c.get('admin') as schema.PlatformAdmin;
  const firmId = c.req.param('id') as string;
  const body = await c.req.json().catch(() => ({}));

  const parse = z
    .object({
      planId: z.string().min(1),
      billingCycle: z.enum(['monthly', 'annual']).default('monthly'),
      durationMonths: z.number().int().min(1).max(36).optional(),
      expiryDate: z.string().optional(),
    })
    .safeParse(body);

  if (!parse.success) {
    return c.json({ error: 'Validation failed', errors: parse.error.issues }, 400);
  }

  const db = getDb(c.env.DB);
  const firmRows = await db
    .select()
    .from(schema.firms)
    .where(and(eq(schema.firms.id, firmId), isNull(schema.firms.deletedAt)))
    .limit(1);

  const firm = firmRows[0];
  if (!firm) {
    return c.json({ error: 'Not found', message: 'Firm not found' }, 404);
  }

  const planRows = await db.select().from(schema.plans).where(eq(schema.plans.id, parse.data.planId)).limit(1);
  if (!planRows[0]) {
    return c.json({ error: 'NotFound', message: `Plan ${parse.data.planId} not found` }, 404);
  }
  if (planRows[0].status === 'archived') {
    return c.json({ error: 'BadRequest', message: `Cannot assign archived plan: ${planRows[0].name}` }, 400);
  }

  const now = new Date();
  const resolvedMonths = parse.data.durationMonths ?? (parse.data.billingCycle === 'annual' ? planRows[0].durationMonths || 12 : 1);
  const newExpiry = parse.data.expiryDate
    ? new Date(parse.data.expiryDate).toISOString()
    : new Date(now.getTime() + resolvedMonths * 30 * 24 * 60 * 60 * 1000).toISOString();
  const nowIso = now.toISOString();

  await db.batch([
    db
      .update(schema.firms)
      .set({
        isTrial: false,
        planId: parse.data.planId,
        billingCycle: parse.data.billingCycle,
        licenseStartsAt: nowIso,
        licenseExpiresAt: newExpiry,
        status: 'active',
        updatedAt: nowIso,
      })
      .where(eq(schema.firms.id, firmId)),
    db.insert(schema.licenseEvents).values({
      id: crypto.randomUUID(),
      firmId,
      type: 'CONVERTED_TO_PAID',
      old: { isTrial: firm.isTrial, status: firm.status },
      new: { isTrial: false, planId: parse.data.planId, licenseExpiresAt: newExpiry },
      byAdmin: admin.id,
      at: nowIso,
    }),
    db.insert(schema.adminAudit).values(
      buildAdminAuditEntry({
        adminId: admin.id,
        action: 'FIRM_CONVERT_TO_PAID',
        targetFirmId: firmId,
        new: { planId: parse.data.planId, newExpiry },
        at: nowIso,
      })
    ),
  ] as any);

  return c.json({
    message: 'Firm converted to paid plan successfully',
    firm: { ...firm, isTrial: false, planId: parse.data.planId, licenseExpiresAt: newExpiry, status: 'active' },
    newExpiry,
  });
});

adminRouter.post('/firms/:id/payments', adminAuthMiddleware, async (c) => {
  const admin = c.get('admin') as schema.PlatformAdmin;
  const firmId = c.req.param('id') as string;
  const body = await c.req.json().catch(() => ({}));

  const parse = z
    .object({
      amount: z.number().int().min(1),
      method: z.enum(['bkash', 'nagad', 'bank', 'cash']),
      txnId: z.string().min(1),
      note: z.string().nullable().optional(),
    })
    .safeParse(body);

  if (!parse.success) {
    return c.json({ error: 'Bad Request', message: 'Invalid payment parameters', issues: parse.error.issues }, 400);
  }

  const db = getDb(c.env.DB);
  const firmRows = await db
    .select({ id: schema.firms.id })
    .from(schema.firms)
    .where(and(eq(schema.firms.id, firmId), isNull(schema.firms.deletedAt)))
    .limit(1);
  if (!firmRows[0]) {
    return c.json({ error: 'Firm not found' }, 404);
  }

  const nowIso = new Date().toISOString();
  const payment = {
    id: `pay-${crypto.randomUUID()}`,
    firmId,
    amount: parse.data.amount,
    method: parse.data.method,
    txnId: parse.data.txnId,
    note: parse.data.note ?? null,
    paidAt: nowIso,
    verifiedBy: admin.email,
    createdBy: admin.id,
  };

  await db.batch([
    db.insert(schema.payments).values(payment),
    db.insert(schema.adminAudit).values(
      buildAdminAuditEntry({
        adminId: admin.id,
        action: 'PAYMENT_RECORD',
        targetFirmId: firmId,
        new: payment,
        at: nowIso,
      })
    ),
  ] as any);

  return c.json({ message: 'Payment recorded successfully.', payment }, 201);
});

adminRouter.get('/firms/:id/payments', adminAuthMiddleware, async (c) => {
  const firmId = c.req.param('id') as string;
  const db = getDb(c.env.DB);
  const firmRows = await db
    .select({ id: schema.firms.id })
    .from(schema.firms)
    .where(and(eq(schema.firms.id, firmId), isNull(schema.firms.deletedAt)))
    .limit(1);
  if (!firmRows[0]) {
    return c.json({ error: 'Firm not found' }, 404);
  }

  const rows = await db
    .select()
    .from(schema.payments)
    .where(eq(schema.payments.firmId, firmId))
    .orderBy(desc(schema.payments.paidAt));

  return c.json(rows);
});

adminRouter.get('/firms/:id/license-events', adminAuthMiddleware, async (c) => {
  const firmId = c.req.param('id') as string;
  const db = getDb(c.env.DB);
  const firmRows = await db
    .select({ id: schema.firms.id })
    .from(schema.firms)
    .where(and(eq(schema.firms.id, firmId), isNull(schema.firms.deletedAt)))
    .limit(1);
  if (!firmRows[0]) {
    return c.json({ error: 'Firm not found' }, 404);
  }

  const rows = await db
    .select()
    .from(schema.licenseEvents)
    .where(eq(schema.licenseEvents.firmId, firmId))
    .orderBy(desc(schema.licenseEvents.at));

  return c.json(rows);
});

// ==========================================
// DEVICES MANAGEMENT
// ==========================================
adminRouter.get('/firms/:id/devices', adminAuthMiddleware, async (c) => {
  const firmId = c.req.param('id') as string;
  const db = getDb(c.env.DB);

  const firmRows = await db
    .select()
    .from(schema.firms)
    .where(and(eq(schema.firms.id, firmId), isNull(schema.firms.deletedAt)))
    .limit(1);
  const firm = firmRows[0];
  if (!firm) {
    return c.json({ error: 'Firm not found' }, 404);
  }

  const [devicesList, usersList] = await Promise.all([
    db.select().from(schema.devices).where(eq(schema.devices.firmId, firmId)),
    db
      .select({ id: schema.users.id, name: schema.users.name, email: schema.users.email, role: schema.users.role })
      .from(schema.users)
      .where(and(eq(schema.users.firmId, firmId), isNull(schema.users.deletedAt))),
  ]);

  const userMap = new Map(usersList.map((u) => [u.id, u]));
  const enriched = devicesList.map((d) => {
    const u = userMap.get(d.userId);
    return {
      id: d.id,
      firmId: d.firmId,
      userId: d.userId,
      userName: u?.name || 'Unknown User',
      userEmail: u?.email || 'Unknown Email',
      userRole: u?.role || 'Staff',
      name: d.name,
      userAgent: d.userAgent,
      status: d.status,
      firstSeenAt: d.firstSeenAt,
      lastSeenAt: d.lastSeenAt,
      approvedByAdminId: d.approvedByAdminId,
    };
  });

  return c.json({
    devices: enriched,
    maxDevices: firm.maxDevices,
    devicePolicy: firm.devicePolicy,
    allowOwnerDeviceRemoval: firm.allowOwnerDeviceRemoval,
  });
});

async function updateAdminDeviceStatus(
  c: any,
  newStatus: 'approved' | 'rejected' | 'revoked',
  auditAction: string,
  message: string
) {
  const admin = c.get('admin') as schema.PlatformAdmin;
  const deviceId = c.req.param('id') as string;
  const db = getDb(c.env.DB);

  const rows = await db.select().from(schema.devices).where(eq(schema.devices.id, deviceId)).limit(1);
  const device = rows[0];
  if (!device) {
    return c.json({ error: 'Device not found' }, 404);
  }

  const nowIso = new Date().toISOString();
  const updates = {
    status: newStatus,
    approvedByAdminId: newStatus === 'approved' ? admin.id : device.approvedByAdminId,
    lastSeenAt: nowIso,
  };

  await db.batch([
    db.update(schema.devices).set(updates).where(eq(schema.devices.id, deviceId)),
    db.insert(schema.adminAudit).values(
      buildAdminAuditEntry({
        adminId: admin.id,
        action: auditAction,
        targetFirmId: device.firmId,
        old: { deviceId: device.id, status: device.status },
        new: { deviceId: device.id, status: newStatus },
        at: nowIso,
      })
    ),
  ] as any);

  return c.json({ message, device: { ...device, ...updates } });
}

adminRouter.post('/devices/:id/approve', adminAuthMiddleware, (c) =>
  updateAdminDeviceStatus(c, 'approved', 'DEVICE_APPROVE', 'Device approved successfully.')
);
adminRouter.post('/devices/:id/reject', adminAuthMiddleware, (c) =>
  updateAdminDeviceStatus(c, 'rejected', 'DEVICE_REJECT', 'Device rejected successfully.')
);
adminRouter.post('/devices/:id/revoke', adminAuthMiddleware, (c) =>
  updateAdminDeviceStatus(c, 'revoked', 'DEVICE_REVOKE', 'Device revoked successfully.')
);

// ==========================================
// SUBSCRIPTION PLANS
// ==========================================
adminRouter.get('/plans', adminAuthMiddleware, async (c) => {
  const db = getDb(c.env.DB);
  const plans = await db
    .select()
    .from(schema.plans)
    .where(isNull(schema.plans.deletedAt))
    .orderBy(asc(schema.plans.priceBdt));

  return c.json({ plans });
});

adminRouter.post('/plans', adminAuthMiddleware, async (c) => {
  const admin = c.get('admin') as schema.PlatformAdmin;
  const body = await c.req.json().catch(() => ({}));

  const createPlanSchema = z.object({
    id: z.string().trim().min(1).max(64).regex(/^[a-z0-9_-]+$/i).optional(),
    name: z.string().trim().min(1).max(100),
    priceBdt: z.number().int().min(0),
    includedUsers: z.number().int().min(1).max(500),
    includedDevices: z.number().int().min(1).max(500),
    extraUserPriceBdt: z.number().int().min(0).max(100000),
    extraDevicePriceBdt: z.number().int().min(0).max(100000),
    durationMonths: z.number().int().min(1).max(36).default(12),
    features: z.array(z.string()).optional(),
  });

  const parse = createPlanSchema.safeParse(body);
  if (!parse.success) {
    return c.json({ error: 'BadRequest', message: 'Invalid plan creation payload', issues: parse.error.issues }, 400);
  }

  const data = parse.data;
  const db = getDb(c.env.DB);
  const slug = data.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
  const planId = data.id || slug || `plan-${crypto.randomUUID()}`;

  const existing = await db.select({ id: schema.plans.id }).from(schema.plans).where(eq(schema.plans.id, planId)).limit(1);
  if (existing[0]) {
    return c.json({ error: 'Conflict', message: `Plan with ID ${planId} already exists` }, 409);
  }

  const nowIso = new Date().toISOString();
  const plan = {
    id: planId,
    name: data.name,
    priceBdt: data.priceBdt,
    durationMonths: data.durationMonths,
    seats: data.includedUsers,
    includedUsers: data.includedUsers,
    includedDevices: data.includedDevices,
    extraUserPriceBdt: data.extraUserPriceBdt,
    extraDevicePriceBdt: data.extraDevicePriceBdt,
    status: 'active' as const,
    features: data.features ?? ['cases', 'hearings', 'tasks', 'files', 'calendar', 'backup', 'audit'],
    createdAt: nowIso,
    updatedAt: nowIso,
    deletedAt: null,
    createdBy: admin.id,
    updatedBy: admin.id,
  };

  await db.batch([
    db.insert(schema.plans).values(plan),
    db.insert(schema.adminAudit).values(
      buildAdminAuditEntry({
        adminId: admin.id,
        action: 'PLAN_CREATE',
        new: plan,
        at: nowIso,
      })
    ),
  ] as any);

  return c.json({ message: 'Plan created successfully', plan }, 201);
});

adminRouter.patch('/plans/:id', adminAuthMiddleware, async (c) => {
  const admin = c.get('admin') as schema.PlatformAdmin;
  const planId = c.req.param('id') as string;
  const body = await c.req.json().catch(() => ({}));

  const updatePlanSchema = z.object({
    name: z.string().trim().min(1).max(100).optional(),
    priceBdt: z.number().int().min(0).optional(),
    includedUsers: z.number().int().min(1).max(500).optional(),
    includedDevices: z.number().int().min(1).max(500).optional(),
    extraUserPriceBdt: z.number().int().min(0).max(100000).optional(),
    extraDevicePriceBdt: z.number().int().min(0).max(100000).optional(),
    durationMonths: z.number().int().min(1).max(36).optional(),
    status: z.enum(['active', 'archived']).optional(),
    features: z.array(z.string()).optional(),
  });

  const parse = updatePlanSchema.safeParse(body);
  if (!parse.success) {
    return c.json({ error: 'BadRequest', issues: parse.error.issues }, 400);
  }

  const db = getDb(c.env.DB);
  const existingRows = await db.select().from(schema.plans).where(eq(schema.plans.id, planId)).limit(1);
  const plan = existingRows[0];
  if (!plan) {
    return c.json({ error: 'NotFound', message: `Plan ${planId} not found` }, 404);
  }

  const nowIso = new Date().toISOString();
  const updates: Record<string, any> = {
    ...parse.data,
    seats: parse.data.includedUsers ?? plan.seats,
    updatedAt: nowIso,
    updatedBy: admin.id,
  };

  await db.batch([
    db.update(schema.plans).set(updates).where(eq(schema.plans.id, planId)),
    db.insert(schema.adminAudit).values(
      buildAdminAuditEntry({
        adminId: admin.id,
        action: 'PLAN_UPDATE',
        old: plan,
        new: updates,
        at: nowIso,
      })
    ),
  ] as any);

  return c.json({ message: 'Plan updated successfully', plan: { ...plan, ...updates } });
});

// ==========================================
// PLATFORM AUDIT LOGS
// ==========================================
adminRouter.get('/audit', adminAuthMiddleware, async (c) => {
  const limit = Math.min(200, Math.max(1, parseInt(c.req.query('limit') || '50', 10)));
  const offset = Math.max(0, parseInt(c.req.query('offset') || '0', 10));
  const db = getDb(c.env.DB);

  const [logs, countRow] = await Promise.all([
    db
      .select()
      .from(schema.adminAudit)
      .orderBy(desc(schema.adminAudit.at))
      .limit(limit)
      .offset(offset),
    db.select({ count: sql<number>`count(*)` }).from(schema.adminAudit),
  ]);

  return c.json({
    logs,
    limit,
    offset,
    total: Number(countRow[0]?.count || 0),
  });
});
