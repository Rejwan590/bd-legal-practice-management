import { Hono } from 'hono';
import { setCookie, deleteCookie } from 'hono/cookie';
import { z } from 'zod';
import { Env } from '../middleware/auth';
import { adminAuthMiddleware } from '../middleware/adminAuth';
import { getDb } from '../db/client';
import * as schema from '../db/schema';
import { hashPassword, verifyPassword, DUMMY_HASH } from '../utils/crypto';
import { signAdminToken } from '../utils/jwt';
import { eq, and, isNull, desc, sql } from 'drizzle-orm';

export const adminRouter = new Hono<{ Bindings: Env; Variables: any }>();

// ==========================================
// ADMIN AUTHENTICATION
// ==========================================
adminRouter.post('/auth/login', async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const loginSchema = z.object({
    email: z.string().email(),
    password: z.string().min(1),
  });

  const parse = loginSchema.safeParse(body);
  if (!parse.success) {
    return c.json({ error: 'Validation failed', message: 'Email and password required' }, 400);
  }

  const { email, password } = parse.data;
  const db = getDb(c.env.DB);

  const admins = await db
    .select()
    .from(schema.platformAdmins)
    .where(eq(schema.platformAdmins.email, email.toLowerCase().trim()))
    .limit(1);

  const admin = admins[0];
  if (!admin || !admin.active) {
    await verifyPassword(password, DUMMY_HASH);
    return c.json({ error: 'Unauthorized', message: 'Invalid administrative credentials' }, 401);
  }

  const isValid = await verifyPassword(password, admin.passwordHash);
  if (!isValid) {
    return c.json({ error: 'Unauthorized', message: 'Invalid administrative credentials' }, 401);
  }

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
    admin: {
      id: admin.id,
      email: admin.email,
    },
  });
});

adminRouter.get('/auth/me', adminAuthMiddleware, (c) => {
  const admin = c.get('admin');
  return c.json({ admin: { id: admin.id, email: admin.email } });
});

adminRouter.post('/auth/logout', (c) => {
  deleteCookie(c, 'admin_access_token', { path: '/' });
  return c.json({ message: 'Admin logged out successfully' });
});

// ==========================================
// CHAMBER FIRMS MANAGEMENT
// ==========================================
adminRouter.use('/firms/*', adminAuthMiddleware);
adminRouter.use('/firms', adminAuthMiddleware);
adminRouter.use('/plans/*', adminAuthMiddleware);
adminRouter.use('/plans', adminAuthMiddleware);
adminRouter.use('/audit/*', adminAuthMiddleware);
adminRouter.use('/audit', adminAuthMiddleware);

// GET /api/admin/firms
adminRouter.get('/firms', async (c) => {
  const db = getDb(c.env.DB);
  const rows = await db
    .select()
    .from(schema.firms)
    .where(isNull(schema.firms.deletedAt))
    .orderBy(desc(schema.firms.createdAt));

  return c.json({ firms: rows });
});

// POST /api/admin/firms - Create firm with owner (Mandatory Scenario 1)
adminRouter.post('/firms', async (c) => {
  const admin = c.get('admin');
  const body = await c.req.json().catch(() => ({}));

  const createFirmSchema = z.object({
    name: z.string().min(1),
    ownerName: z.string().min(1),
    ownerEmail: z.string().email(),
    licenseType: z.enum(['trial', 'paid']).default('trial'),
    trialDays: z.number().int().min(1).max(365).optional(),
    planId: z.string().optional(),
    billingCycle: z.enum(['monthly', 'annual']).default('monthly'),
    maxUsers: z.number().int().min(1).default(5),
    maxDevices: z.number().int().min(1).default(5),
  });

  const parse = createFirmSchema.safeParse(body);
  if (!parse.success) {
    return c.json({ error: 'Validation failed', errors: parse.error.issues }, 400);
  }

  const db = getDb(c.env.DB);
  const data = parse.data;

  // Check unique owner email
  const existingUser = await db
    .select()
    .from(schema.users)
    .where(and(eq(schema.users.email, data.ownerEmail.toLowerCase().trim()), isNull(schema.users.deletedAt)))
    .limit(1);

  if (existingUser[0]) {
    return c.json({ error: 'Conflict', message: 'Owner email already registered' }, 409);
  }

  const firmId = crypto.randomUUID();
  const userId = crypto.randomUUID();
  const eventId = crypto.randomUUID();
  const auditId = crypto.randomUUID();
  const now = new Date();
  const nowIso = now.toISOString();

  // Temporary password generation
  const tempPassword = `BdLegal_${crypto.randomUUID().substring(0, 12)}!`;
  const passwordHash = await hashPassword(tempPassword);

  let isTrial = data.licenseType === 'trial';
  let trialDays = isTrial ? data.trialDays || 14 : null;
  let licenseExpiresAt = new Date(now.getTime() + (trialDays || 30) * 24 * 60 * 60 * 1000).toISOString();

  const newFirm = {
    id: firmId,
    firmId: `firm-${firmId.substring(0, 8)}`,
    name: data.name,
    barCouncilReg: null,
    officeAddress: null,
    courtAffiliations: null,
    contact: null,
    maxUsers: data.maxUsers,
    maxDevices: data.maxDevices,
    billingCycle: data.billingCycle,
    customBasePriceBdt: null,
    customAnnualPriceBdt: null,
    customExtraUserPriceBdt: null,
    customExtraDevicePriceBdt: null,
    priceLockedUntil: null,
    pricingNote: null,
    isTrial,
    trialDays,
    trialStartedAt: isTrial ? nowIso : null,
    devicePolicy: 'auto-approve' as const,
    allowOwnerDeviceRemoval: false,
    visibilityMode: 'team' as const,
    planId: data.planId || null,
    licenseStartsAt: nowIso,
    licenseExpiresAt,
    status: 'active' as const,
    createdAt: nowIso,
    updatedAt: nowIso,
    deletedAt: null,
    createdBy: admin.id,
    updatedBy: null,
  };

  const newOwner = {
    id: userId,
    firmId,
    name: data.ownerName,
    email: data.ownerEmail.toLowerCase().trim(),
    passwordHash,
    role: 'Owner' as const,
    jobType: 'lawyer_senior' as const,
    jobTitleLabel: null,
    reportsToUserId: null,
    permissions: ['*'],
    language: 'en' as const,
    active: true,
    mustChangePassword: true,
    failedLoginAttempts: 0,
    lockedUntil: null,
    createdAt: nowIso,
    updatedAt: nowIso,
    deletedAt: null,
    createdBy: admin.id,
    updatedBy: null,
  };

  const licenseEvent = {
    id: eventId,
    firmId,
    type: isTrial ? 'TRIAL_STARTED' : 'FIRM_CREATED',
    old: null,
    new: { ...newFirm, ownerEmail: data.ownerEmail },
    byAdmin: admin.id,
    at: nowIso,
  };

  const adminAudit = {
    id: auditId,
    adminId: admin.id,
    action: 'FIRM_CREATE',
    targetFirmId: firmId,
    old: null,
    new: { firmId, name: data.name, ownerEmail: data.ownerEmail },
    ip: null,
    at: nowIso,
  };

  // Atomic batch commit for firm, owner, license event, and audit
  await db.batch([
    db.insert(schema.firms).values(newFirm),
    db.insert(schema.users).values(newOwner),
    db.insert(schema.licenseEvents).values(licenseEvent),
    db.insert(schema.adminAudit).values(adminAudit),
  ] as any);

  return c.json({
    firm: newFirm,
    owner: {
      id: newOwner.id,
      email: newOwner.email,
      name: newOwner.name,
    },
    temporaryPassword: tempPassword,
  }, 201);
});

// POST /api/admin/firms/:id/extend-trial
adminRouter.post('/firms/:id/extend-trial', async (c) => {
  const admin = c.get('admin');
  const firmId = c.req.param('id');
  const body = await c.req.json().catch(() => ({}));

  const extendSchema = z.object({
    additionalDays: z.number().int().min(1).max(365),
  });

  const parse = extendSchema.safeParse(body);
  if (!parse.success) {
    return c.json({ error: 'Validation failed', errors: parse.error.issues }, 400);
  }

  const db = getDb(c.env.DB);
  const rows = await db.select().from(schema.firms).where(eq(schema.firms.id, firmId)).limit(1);
  const firm = rows[0];

  if (!firm || !firm.isTrial) {
    return c.json({ error: 'Bad Request', message: 'Firm is not an active trial' }, 400);
  }

  const now = new Date();
  const currentExpiry = new Date(firm.licenseExpiresAt);
  const baseDate = currentExpiry.getTime() > now.getTime() ? currentExpiry : now;
  const newExpiry = new Date(baseDate.getTime() + parse.data.additionalDays * 24 * 60 * 60 * 1000).toISOString();
  const newTrialDays = (firm.trialDays || 0) + parse.data.additionalDays;
  const nowIso = now.toISOString();

  await db.batch([
    db.update(schema.firms)
      .set({
        licenseExpiresAt: newExpiry,
        trialDays: newTrialDays,
        status: 'active',
        updatedAt: nowIso,
      })
      .where(eq(schema.firms.id, firmId)),
    db.insert(schema.licenseEvents).values({
      id: crypto.randomUUID(),
      firmId,
      type: 'TRIAL_EXTENDED',
      old: { licenseExpiresAt: firm.licenseExpiresAt, trialDays: firm.trialDays },
      new: { licenseExpiresAt: newExpiry, trialDays: newTrialDays },
      byAdmin: admin.id,
      at: nowIso,
    }),
    db.insert(schema.adminAudit).values({
      id: crypto.randomUUID(),
      adminId: admin.id,
      action: 'FIRM_EXTEND_TRIAL',
      targetFirmId: firmId,
      old: null,
      new: { additionalDays: parse.data.additionalDays, newExpiry },
      ip: null,
      at: nowIso,
    }),
  ] as any);

  return c.json({ message: 'Trial extended successfully', newExpiry, totalTrialDays: newTrialDays });
});

// POST /api/admin/firms/:id/convert-to-paid
adminRouter.post('/firms/:id/convert-to-paid', async (c) => {
  const admin = c.get('admin');
  const firmId = c.req.param('id');
  const body = await c.req.json().catch(() => ({}));

  const convertSchema = z.object({
    planId: z.string().min(1),
    billingCycle: z.enum(['monthly', 'annual']).default('monthly'),
    durationMonths: z.number().int().min(1).default(1),
  });

  const parse = convertSchema.safeParse(body);
  if (!parse.success) {
    return c.json({ error: 'Validation failed', errors: parse.error.issues }, 400);
  }

  const db = getDb(c.env.DB);
  const rows = await db.select().from(schema.firms).where(eq(schema.firms.id, firmId)).limit(1);
  const firm = rows[0];

  if (!firm) {
    return c.json({ error: 'Not found', message: 'Firm not found' }, 404);
  }

  const now = new Date();
  const newExpiry = new Date(now.getTime() + parse.data.durationMonths * 30 * 24 * 60 * 60 * 1000).toISOString();
  const nowIso = now.toISOString();

  await db.batch([
    db.update(schema.firms)
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
    db.insert(schema.adminAudit).values({
      id: crypto.randomUUID(),
      adminId: admin.id,
      action: 'FIRM_CONVERT_TO_PAID',
      targetFirmId: firmId,
      old: null,
      new: { planId: parse.data.planId, newExpiry },
      ip: null,
      at: nowIso,
    }),
  ] as any);

  return c.json({ message: 'Firm converted to paid plan successfully', newExpiry });
});
