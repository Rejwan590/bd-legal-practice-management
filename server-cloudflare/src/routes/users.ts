import { Hono } from 'hono';
import { z } from 'zod';
import { Env, authMiddleware, enforceSubscriptionReadOnly } from '../middleware/auth';
import { getDb } from '../db/client';
import * as schema from '../db/schema';
import { eq, and, isNull, asc } from 'drizzle-orm';
import { hashPassword } from '../utils/crypto';
import { generateSecureTemporaryPassword } from '../utils/security';
import { buildAuditEntry } from '../utils/audit';

export const usersRouter = new Hono<{ Bindings: Env; Variables: any }>();

usersRouter.use('*', authMiddleware);

const ROLE_PRESETS: Record<string, { defaultJobType: schema.User['jobType']; permissions: string[] }> = {
  senior_lawyer: {
    defaultJobType: 'lawyer_senior',
    permissions: [
      'cases.view', 'cases.create', 'cases.edit', 'hearings.update', 'clients.view', 'clients.edit',
      'appointments.view', 'appointments.manage', 'tasks.view', 'tasks.assign', 'tasks.complete',
      'files.view', 'files.manage', 'billing.view', 'data.export', 'accounts.view', 'accounts.manage',
      'expenses.record', 'accounts.export',
    ],
  },
  junior_lawyer: {
    defaultJobType: 'lawyer_junior',
    permissions: [
      'cases.view', 'cases.create', 'cases.edit', 'hearings.update', 'clients.view', 'clients.edit',
      'appointments.view', 'appointments.manage', 'tasks.view', 'tasks.complete', 'files.view',
    ],
  },
  clerk: {
    defaultJobType: 'clerk',
    permissions: [
      'cases.view', 'hearings.update', 'clients.view', 'appointments.view', 'tasks.view',
      'tasks.complete', 'files.view', 'files.manage',
    ],
  },
  receptionist: {
    defaultJobType: 'receptionist',
    permissions: [
      'clients.view', 'clients.edit', 'appointments.view', 'appointments.manage', 'tasks.view', 'tasks.complete',
    ],
  },
  intern: {
    defaultJobType: 'intern',
    permissions: ['cases.view', 'clients.view', 'tasks.view', 'tasks.complete'],
  },
};

function sanitizeUser(u: schema.User) {
  return {
    id: u.id,
    firmId: u.firmId,
    name: u.name,
    email: u.email,
    role: u.role,
    jobType: u.jobType,
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

function canManageUsers(user: schema.User): boolean {
  if (user.role === 'Owner') return true;
  const perms = Array.isArray(user.permissions) ? user.permissions : [];
  return perms.includes('users.manage') || perms.includes('*');
}

// GET /api/v1/users
usersRouter.get('/', async (c) => {
  const firmId = c.get('firmId') as string;
  const db = getDb(c.env.DB);
  const rows = await db
    .select()
    .from(schema.users)
    .where(and(eq(schema.users.firmId, firmId), isNull(schema.users.deletedAt)))
    .orderBy(asc(schema.users.name));

  return c.json(rows.map(sanitizeUser));
});

// GET /api/v1/users/:id
usersRouter.get('/:id', async (c) => {
  const firmId = c.get('firmId') as string;
  const id = c.req.param('id') as string;
  const db = getDb(c.env.DB);

  const rows = await db
    .select()
    .from(schema.users)
    .where(and(eq(schema.users.id, id), eq(schema.users.firmId, firmId), isNull(schema.users.deletedAt)))
    .limit(1);

  if (!rows[0]) {
    return c.json({ error: 'Not found', message: 'User not found' }, 404);
  }
  return c.json(sanitizeUser(rows[0]));
});

// POST /api/v1/users
usersRouter.post('/', enforceSubscriptionReadOnly, async (c) => {
  const actor = c.get('user') as schema.User;
  const firm = c.get('firm') as schema.Firm;
  if (!canManageUsers(actor)) {
    return c.json({ error: 'Forbidden', message: 'Missing permission: users.manage' }, 403);
  }

  const body = await c.req.json().catch(() => ({}));
  const createSchema = z.object({
    name: z.string().min(1),
    email: z.string().email(),
    role: z.enum(['Owner', 'Staff']).default('Staff'),
    jobType: z.enum(['lawyer_senior', 'lawyer_junior', 'clerk', 'receptionist', 'intern', 'other']).optional(),
    jobTitleLabel: z.string().nullable().optional(),
    reportsToUserId: z.string().nullable().optional(),
    preset: z.string().optional(),
    permissions: z.array(z.string()).optional(),
    language: z.enum(['en', 'bn']).default('en'),
    temporaryPassword: z.string().min(8).optional(),
  });

  const parse = createSchema.safeParse(body);
  if (!parse.success) {
    return c.json({ error: 'Validation failed', errors: parse.error.issues }, 400);
  }

  const data = parse.data;
  if (data.role === 'Owner' && actor.role !== 'Owner') {
    return c.json({ error: 'Forbidden', message: 'Only Owner can create another Owner' }, 403);
  }

  const db = getDb(c.env.DB);
  const currentUsers = await db
    .select({ id: schema.users.id })
    .from(schema.users)
    .where(and(eq(schema.users.firmId, firm.id), isNull(schema.users.deletedAt)));

  if (currentUsers.length >= firm.maxUsers) {
    return c.json({ error: 'Forbidden', message: `Firm user limit (${firm.maxUsers}) reached` }, 403);
  }

  const cleanEmail = data.email.toLowerCase().trim();
  const existing = await db
    .select({ id: schema.users.id })
    .from(schema.users)
    .where(and(eq(schema.users.email, cleanEmail), isNull(schema.users.deletedAt)))
    .limit(1);

  if (existing[0]) {
    return c.json({ error: 'Conflict', message: 'Email already in use' }, 409);
  }

  const presetDef = data.preset ? ROLE_PRESETS[data.preset] : undefined;
  const resolvedJobType = data.jobType || presetDef?.defaultJobType || (data.role === 'Owner' ? 'lawyer_senior' : 'other');
  const resolvedPermissions =
    data.role === 'Owner'
      ? ['*']
      : data.permissions ?? presetDef?.permissions ?? ['cases.view', 'clients.view', 'tasks.view'];

  const rawPassword = data.temporaryPassword || generateSecureTemporaryPassword();
  const passwordHash = await hashPassword(rawPassword);
  const id = crypto.randomUUID();
  const nowIso = new Date().toISOString();

  const newUser: typeof schema.users.$inferInsert = {
    id,
    firmId: firm.id,
    name: data.name.trim(),
    email: cleanEmail,
    passwordHash,
    role: data.role,
    jobType: resolvedJobType,
    jobTitleLabel: data.jobTitleLabel ?? null,
    reportsToUserId: data.reportsToUserId ?? null,
    permissions: resolvedPermissions,
    language: data.language,
    active: true,
    mustChangePassword: !data.temporaryPassword,
    failedLoginAttempts: 0,
    lockedUntil: null,
    createdAt: nowIso,
    updatedAt: nowIso,
    deletedAt: null,
    createdBy: actor.id,
    updatedBy: null,
  };

  await db.batch([
    db.insert(schema.users).values(newUser),
    db.insert(schema.auditLog).values(
      buildAuditEntry({
        firmId: firm.id,
        userId: actor.id,
        userName: actor.name,
        entity: 'User',
        entityId: id,
        action: 'CREATE',
        newValue: { email: cleanEmail, role: data.role, jobType: resolvedJobType },
        now: nowIso,
      })
    ),
  ] as any);

  return c.json({ ...sanitizeUser(newUser as schema.User), temporaryPassword: rawPassword }, 201);
});

// PATCH /api/v1/users/:id
usersRouter.patch('/:id', enforceSubscriptionReadOnly, async (c) => {
  const actor = c.get('user') as schema.User;
  const firmId = c.get('firmId') as string;
  const targetId = c.req.param('id') as string;
  if (!canManageUsers(actor) && actor.id !== targetId) {
    return c.json({ error: 'Forbidden', message: 'Missing permission: users.manage' }, 403);
  }

  const body = await c.req.json().catch(() => ({}));
  const updateSchema = z.object({
    name: z.string().min(1).optional(),
    email: z.string().email().optional(),
    jobType: z.enum(['lawyer_senior', 'lawyer_junior', 'clerk', 'receptionist', 'intern', 'other']).optional(),
    jobTitleLabel: z.string().nullable().optional(),
    reportsToUserId: z.string().nullable().optional(),
    language: z.enum(['en', 'bn']).optional(),
  });

  const parse = updateSchema.safeParse(body);
  if (!parse.success) {
    return c.json({ error: 'Validation failed', errors: parse.error.issues }, 400);
  }

  const db = getDb(c.env.DB);
  const rows = await db
    .select()
    .from(schema.users)
    .where(and(eq(schema.users.id, targetId), eq(schema.users.firmId, firmId), isNull(schema.users.deletedAt)))
    .limit(1);

  const target = rows[0];
  if (!target) {
    return c.json({ error: 'Not found', message: 'User not found' }, 404);
  }

  if (parse.data.reportsToUserId === targetId) {
    return c.json({ error: 'BadRequest', message: 'User cannot report to themselves' }, 400);
  }

  const nowIso = new Date().toISOString();
  const updates = { ...parse.data, updatedAt: nowIso, updatedBy: actor.id };

  await db.batch([
    db.update(schema.users).set(updates).where(and(eq(schema.users.id, targetId), eq(schema.users.firmId, firmId))),
    db.insert(schema.auditLog).values(
      buildAuditEntry({
        firmId,
        userId: actor.id,
        userName: actor.name,
        entity: 'User',
        entityId: targetId,
        action: 'UPDATE',
        oldValue: { name: target.name, jobType: target.jobType, reportsToUserId: target.reportsToUserId },
        newValue: parse.data,
        now: nowIso,
      })
    ),
  ] as any);

  return c.json(sanitizeUser({ ...target, ...updates }));
});

async function handleUpdatePermissions(c: any) {
  const actor = c.get('user') as schema.User;
  if (!canManageUsers(actor)) {
    return c.json({ error: 'Forbidden', message: 'Missing permission: users.manage' }, 403);
  }
  const firmId = c.get('firmId') as string;
  const targetId = c.req.param('id') as string;
  const body = await c.req.json().catch(() => ({}));
  const parse = z.object({ permissions: z.array(z.string()) }).safeParse(body);
  if (!parse.success) {
    return c.json({ error: 'Validation failed', errors: parse.error.issues }, 400);
  }

  const db = getDb(c.env.DB);
  const rows = await db
    .select()
    .from(schema.users)
    .where(and(eq(schema.users.id, targetId), eq(schema.users.firmId, firmId), isNull(schema.users.deletedAt)))
    .limit(1);
  const target = rows[0];
  if (!target) {
    return c.json({ error: 'Not found', message: 'User not found' }, 404);
  }

  const nowIso = new Date().toISOString();
  await db.batch([
    db
      .update(schema.users)
      .set({ permissions: parse.data.permissions, updatedAt: nowIso, updatedBy: actor.id })
      .where(and(eq(schema.users.id, targetId), eq(schema.users.firmId, firmId))),
    db.insert(schema.auditLog).values(
      buildAuditEntry({
        firmId,
        userId: actor.id,
        userName: actor.name,
        entity: 'User',
        entityId: targetId,
        action: 'PERMISSION_CHANGE',
        oldValue: { permissions: target.permissions },
        newValue: { permissions: parse.data.permissions },
        now: nowIso,
      })
    ),
  ] as any);

  return c.json(sanitizeUser({ ...target, permissions: parse.data.permissions, updatedAt: nowIso }));
}

usersRouter.patch('/:id/permissions', enforceSubscriptionReadOnly, handleUpdatePermissions);
usersRouter.put('/:id/permissions', enforceSubscriptionReadOnly, handleUpdatePermissions);

async function handleUpdateRole(c: any) {
  const actor = c.get('user') as schema.User;
  if (actor.role !== 'Owner') {
    return c.json({ error: 'OWNER_ONLY', message: 'Only Owner can change user roles' }, 403);
  }
  const firmId = c.get('firmId') as string;
  const targetId = c.req.param('id') as string;
  const body = await c.req.json().catch(() => ({}));
  const parse = z.object({ role: z.enum(['Owner', 'Staff']) }).safeParse(body);
  if (!parse.success) {
    return c.json({ error: 'Validation failed', errors: parse.error.issues }, 400);
  }

  const db = getDb(c.env.DB);
  const rows = await db
    .select()
    .from(schema.users)
    .where(and(eq(schema.users.id, targetId), eq(schema.users.firmId, firmId), isNull(schema.users.deletedAt)))
    .limit(1);
  const target = rows[0];
  if (!target) {
    return c.json({ error: 'Not found', message: 'User not found' }, 404);
  }

  const nowIso = new Date().toISOString();
  await db.batch([
    db
      .update(schema.users)
      .set({ role: parse.data.role, updatedAt: nowIso, updatedBy: actor.id })
      .where(and(eq(schema.users.id, targetId), eq(schema.users.firmId, firmId))),
    db.insert(schema.auditLog).values(
      buildAuditEntry({
        firmId,
        userId: actor.id,
        userName: actor.name,
        entity: 'User',
        entityId: targetId,
        action: 'PERMISSION_CHANGE',
        oldValue: { role: target.role },
        newValue: { role: parse.data.role },
        now: nowIso,
      })
    ),
  ] as any);

  return c.json(sanitizeUser({ ...target, role: parse.data.role, updatedAt: nowIso }));
}

usersRouter.patch('/:id/role', enforceSubscriptionReadOnly, handleUpdateRole);
usersRouter.put('/:id/role', enforceSubscriptionReadOnly, handleUpdateRole);

// POST /api/v1/users/:id/deactivate
usersRouter.post('/:id/deactivate', enforceSubscriptionReadOnly, async (c) => {
  const actor = c.get('user') as schema.User;
  if (!canManageUsers(actor)) {
    return c.json({ error: 'Forbidden', message: 'Missing permission: users.manage' }, 403);
  }
  const firmId = c.get('firmId') as string;
  const targetId = c.req.param('id') as string;
  if (actor.id === targetId) {
    return c.json({ error: 'BadRequest', message: 'You cannot deactivate your own account' }, 400);
  }

  const body = await c.req.json().catch(() => ({}));
  const reassignToUserId = typeof body?.reassignToUserId === 'string' ? body.reassignToUserId : undefined;
  const db = getDb(c.env.DB);

  const rows = await db
    .select()
    .from(schema.users)
    .where(and(eq(schema.users.id, targetId), eq(schema.users.firmId, firmId), isNull(schema.users.deletedAt)))
    .limit(1);
  const target = rows[0];
  if (!target) {
    return c.json({ error: 'Not found', message: 'User not found' }, 404);
  }

  const nowIso = new Date().toISOString();
  const stmts: any[] = [
    db
      .update(schema.users)
      .set({ active: false, updatedAt: nowIso, updatedBy: actor.id })
      .where(and(eq(schema.users.id, targetId), eq(schema.users.firmId, firmId))),
    db.insert(schema.auditLog).values(
      buildAuditEntry({
        firmId,
        userId: actor.id,
        userName: actor.name,
        entity: 'User',
        entityId: targetId,
        action: 'UPDATE',
        oldValue: { active: target.active },
        newValue: { active: false, reassignToUserId: reassignToUserId || null },
        now: nowIso,
      })
    ),
  ];

  if (reassignToUserId) {
    stmts.push(
      db
        .update(schema.cases)
        .set({ responsibleLawyerId: reassignToUserId, updatedAt: nowIso })
        .where(and(eq(schema.cases.firmId, firmId), eq(schema.cases.responsibleLawyerId, targetId)))
    );
  }

  await db.batch(stmts as any);
  return c.json(sanitizeUser({ ...target, active: false, updatedAt: nowIso }));
});

// POST /api/v1/users/:id/reactivate
usersRouter.post('/:id/reactivate', enforceSubscriptionReadOnly, async (c) => {
  const actor = c.get('user') as schema.User;
  if (!canManageUsers(actor)) {
    return c.json({ error: 'Forbidden', message: 'Missing permission: users.manage' }, 403);
  }
  const firmId = c.get('firmId') as string;
  const targetId = c.req.param('id') as string;
  const db = getDb(c.env.DB);

  const rows = await db
    .select()
    .from(schema.users)
    .where(and(eq(schema.users.id, targetId), eq(schema.users.firmId, firmId), isNull(schema.users.deletedAt)))
    .limit(1);
  const target = rows[0];
  if (!target) {
    return c.json({ error: 'Not found', message: 'User not found' }, 404);
  }

  const nowIso = new Date().toISOString();
  await db.batch([
    db
      .update(schema.users)
      .set({ active: true, updatedAt: nowIso, updatedBy: actor.id })
      .where(and(eq(schema.users.id, targetId), eq(schema.users.firmId, firmId))),
    db.insert(schema.auditLog).values(
      buildAuditEntry({
        firmId,
        userId: actor.id,
        userName: actor.name,
        entity: 'User',
        entityId: targetId,
        action: 'UPDATE',
        oldValue: { active: target.active },
        newValue: { active: true },
        now: nowIso,
      })
    ),
  ] as any);

  return c.json(sanitizeUser({ ...target, active: true, updatedAt: nowIso }));
});

// POST /api/v1/users/:id/reassign-team
usersRouter.post('/:id/reassign-team', enforceSubscriptionReadOnly, async (c) => {
  const actor = c.get('user') as schema.User;
  if (!canManageUsers(actor)) {
    return c.json({ error: 'Forbidden', message: 'Missing permission: users.manage' }, 403);
  }
  const firmId = c.get('firmId') as string;
  const fromLawyerId = c.req.param('id') as string;
  const body = await c.req.json().catch(() => ({}));
  const parse = z.object({ toLawyerId: z.string().min(1) }).safeParse(body);
  if (!parse.success) {
    return c.json({ error: 'Validation failed', errors: parse.error.issues }, 400);
  }

  const db = getDb(c.env.DB);
  const reports = await db
    .select({ id: schema.users.id })
    .from(schema.users)
    .where(and(eq(schema.users.firmId, firmId), eq(schema.users.reportsToUserId, fromLawyerId), isNull(schema.users.deletedAt)));

  const affectedUserIds = reports.map((r) => r.id);
  const nowIso = new Date().toISOString();

  await db.batch([
    db
      .update(schema.users)
      .set({ reportsToUserId: parse.data.toLawyerId, updatedAt: nowIso, updatedBy: actor.id })
      .where(and(eq(schema.users.firmId, firmId), eq(schema.users.reportsToUserId, fromLawyerId))),
    db.insert(schema.auditLog).values(
      buildAuditEntry({
        firmId,
        userId: actor.id,
        userName: actor.name,
        entity: 'User',
        entityId: fromLawyerId,
        action: 'UPDATE',
        newValue: { toLawyerId: parse.data.toLawyerId, affectedUserIds },
        now: nowIso,
      })
    ),
  ] as any);

  return c.json({ success: true, affectedUserIds });
});

// POST /api/v1/users/:id/reset-password
usersRouter.post('/:id/reset-password', enforceSubscriptionReadOnly, async (c) => {
  const actor = c.get('user') as schema.User;
  if (!canManageUsers(actor)) {
    return c.json({ error: 'Forbidden', message: 'Missing permission: users.manage' }, 403);
  }
  const firmId = c.get('firmId') as string;
  const targetId = c.req.param('id') as string;
  const db = getDb(c.env.DB);

  const rows = await db
    .select()
    .from(schema.users)
    .where(and(eq(schema.users.id, targetId), eq(schema.users.firmId, firmId), isNull(schema.users.deletedAt)))
    .limit(1);
  const target = rows[0];
  if (!target) {
    return c.json({ error: 'Not found', message: 'User not found' }, 404);
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
        updatedBy: actor.id,
      })
      .where(and(eq(schema.users.id, targetId), eq(schema.users.firmId, firmId))),
    db.insert(schema.auditLog).values(
      buildAuditEntry({
        firmId,
        userId: actor.id,
        userName: actor.name,
        entity: 'User',
        entityId: targetId,
        action: 'RESET_PASSWORD',
        newValue: { mustChangePassword: true, resetByUserId: actor.id },
        now: nowIso,
      })
    ),
  ] as any);

  return c.json({ message: 'Password reset successfully.', temporaryPassword });
});
