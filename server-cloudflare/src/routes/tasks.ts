import { Hono } from 'hono';
import { z } from 'zod';
import { Env, authMiddleware, enforceSubscriptionReadOnly, requirePermission } from '../middleware/auth';
import { getDb } from '../db/client';
import * as schema from '../db/schema';
import { eq, and, isNull, asc } from 'drizzle-orm';
import { getVisibleCaseIds, canUserSeeCaseId } from '../utils/visibility';
import { buildAuditEntry } from '../utils/audit';

export const tasksRouter = new Hono<{ Bindings: Env; Variables: any }>();

tasksRouter.use('*', authMiddleware);

function normalizeTaskStatus(s?: string): 'pending' | 'in_progress' | 'completed' | 'cancelled' {
  if (s === 'done' || s === 'completed') return 'completed';
  if (s === 'in_progress' || s === 'cancelled') return s;
  return 'pending';
}

// GET /api/v1/tasks
tasksRouter.get('/', requirePermission('tasks.view'), async (c) => {
  const firm = c.get('firm') as schema.Firm;
  const user = c.get('user') as schema.User;
  const caseId = c.req.query('caseId');
  const clientId = c.req.query('clientId');
  const assignedTo = c.req.query('assignedTo');
  const status = c.req.query('status');
  const priority = c.req.query('priority');
  const search = c.req.query('search')?.trim().toLowerCase();

  const db = getDb(c.env.DB);
  const visible = await getVisibleCaseIds(db, firm, user);

  const conditions = [eq(schema.tasks.firmId, firm.id), isNull(schema.tasks.deletedAt)];
  if (caseId) conditions.push(eq(schema.tasks.caseId, caseId));
  if (clientId) conditions.push(eq(schema.tasks.clientId, clientId));
  if (assignedTo) conditions.push(eq(schema.tasks.assignedTo, assignedTo));
  if (priority) conditions.push(eq(schema.tasks.priority, priority as any));

  const rows = await db
    .select()
    .from(schema.tasks)
    .where(and(...conditions))
    .orderBy(asc(schema.tasks.dueAt));

  const filtered = rows.filter((t) => {
    if (t.caseId && visible !== 'ALL' && !visible.includes(t.caseId)) return false;
    if (status === 'active' && (t.status === 'completed' || t.status === 'cancelled')) return false;
    if (status && status !== 'active' && t.status !== normalizeTaskStatus(status)) return false;
    if (search) {
      const hit = t.title.toLowerCase().includes(search) || (t.description || '').toLowerCase().includes(search);
      if (!hit) return false;
    }
    return true;
  });

  return c.json(filtered);
});

// GET /api/v1/tasks/:id
tasksRouter.get('/:id', requirePermission('tasks.view'), async (c) => {
  const firm = c.get('firm') as schema.Firm;
  const user = c.get('user') as schema.User;
  const id = c.req.param('id') as string;
  const db = getDb(c.env.DB);

  const rows = await db
    .select()
    .from(schema.tasks)
    .where(and(eq(schema.tasks.id, id), eq(schema.tasks.firmId, firm.id), isNull(schema.tasks.deletedAt)))
    .limit(1);

  const task = rows[0];
  if (!task) return c.json({ error: 'Not found', message: 'Task not found' }, 404);
  if (task.caseId && !(await canUserSeeCaseId(db, firm, user, task.caseId))) {
    return c.json({ error: 'Not found', message: 'Task not found' }, 404);
  }
  return c.json(task);
});

// POST /api/v1/tasks
tasksRouter.post('/', enforceSubscriptionReadOnly, requirePermission('tasks.assign'), async (c) => {
  const firm = c.get('firm') as schema.Firm;
  const user = c.get('user') as schema.User;
  const body = await c.req.json().catch(() => ({}));

  const createSchema = z.object({
    title: z.string().min(1).max(300),
    description: z.string().nullable().optional(),
    assignedTo: z.string().min(1),
    dueAt: z.string().min(1),
    priority: z.enum(['low', 'normal', 'medium', 'high', 'urgent']).default('normal'),
    caseId: z.string().nullable().optional(),
    clientId: z.string().nullable().optional(),
  });

  const parse = createSchema.safeParse(body);
  if (!parse.success) {
    return c.json({ error: 'Validation failed', errors: parse.error.issues }, 400);
  }

  const db = getDb(c.env.DB);
  if (parse.data.caseId && !(await canUserSeeCaseId(db, firm, user, parse.data.caseId))) {
    return c.json({ error: 'Not found', message: 'Linked case not found or inaccessible' }, 404);
  }

  const id = crypto.randomUUID();
  const nowIso = new Date().toISOString();
  const newTask: typeof schema.tasks.$inferInsert = {
    id,
    firmId: firm.id,
    title: parse.data.title.trim(),
    description: parse.data.description ?? null,
    assignedTo: parse.data.assignedTo,
    caseId: parse.data.caseId ?? null,
    clientId: parse.data.clientId ?? null,
    dueAt: parse.data.dueAt,
    priority: parse.data.priority,
    status: 'pending',
    completedAt: null,
    createdAt: nowIso,
    updatedAt: nowIso,
    deletedAt: null,
    createdBy: user.id,
    updatedBy: null,
  };

  await db.batch([
    db.insert(schema.tasks).values(newTask),
    db.insert(schema.auditLog).values(
      buildAuditEntry({
        firmId: firm.id,
        userId: user.id,
        userName: user.name,
        entity: 'Task',
        entityId: id,
        action: 'CREATE',
        newValue: newTask,
        now: nowIso,
      })
    ),
  ] as any);

  return c.json(newTask, 201);
});

// PATCH /api/v1/tasks/:id
tasksRouter.patch('/:id', enforceSubscriptionReadOnly, requirePermission('tasks.view'), async (c) => {
  const firm = c.get('firm') as schema.Firm;
  const user = c.get('user') as schema.User;
  const id = c.req.param('id') as string;
  const body = await c.req.json().catch(() => ({}));

  const updateSchema = z.object({
    title: z.string().min(1).max(300).optional(),
    description: z.string().nullable().optional(),
    assignedTo: z.string().min(1).optional(),
    dueAt: z.string().min(1).optional(),
    priority: z.enum(['low', 'normal', 'medium', 'high', 'urgent']).optional(),
    status: z.enum(['pending', 'in_progress', 'completed', 'done', 'cancelled']).optional(),
    caseId: z.string().nullable().optional(),
    clientId: z.string().nullable().optional(),
  });

  const parse = updateSchema.safeParse(body);
  if (!parse.success) {
    return c.json({ error: 'Validation failed', errors: parse.error.issues }, 400);
  }

  const db = getDb(c.env.DB);
  const rows = await db
    .select()
    .from(schema.tasks)
    .where(and(eq(schema.tasks.id, id), eq(schema.tasks.firmId, firm.id), isNull(schema.tasks.deletedAt)))
    .limit(1);

  const task = rows[0];
  if (!task) return c.json({ error: 'Not found', message: 'Task not found' }, 404);
  if (task.caseId && !(await canUserSeeCaseId(db, firm, user, task.caseId))) {
    return c.json({ error: 'Not found', message: 'Task not found' }, 404);
  }

  const nowIso = new Date().toISOString();
  const { status: rawStatus, ...rest } = parse.data;
  const updates: Record<string, any> = { ...rest, updatedAt: nowIso, updatedBy: user.id };
  if (rawStatus !== undefined) {
    const normalized = normalizeTaskStatus(rawStatus);
    updates.status = normalized;
    if (normalized === 'completed' && !task.completedAt) {
      updates.completedAt = nowIso;
    }
  }

  await db.batch([
    db.update(schema.tasks).set(updates).where(and(eq(schema.tasks.id, id), eq(schema.tasks.firmId, firm.id))),
    db.insert(schema.auditLog).values(
      buildAuditEntry({
        firmId: firm.id,
        userId: user.id,
        userName: user.name,
        entity: 'Task',
        entityId: id,
        action: 'UPDATE',
        oldValue: task,
        newValue: updates,
        now: nowIso,
      })
    ),
  ] as any);

  return c.json({ ...task, ...updates });
});

// POST /api/v1/tasks/:id/complete
tasksRouter.post('/:id/complete', enforceSubscriptionReadOnly, requirePermission('tasks.complete'), async (c) => {
  const firm = c.get('firm') as schema.Firm;
  const user = c.get('user') as schema.User;
  const id = c.req.param('id') as string;
  const body = await c.req.json().catch(() => ({}));
  const note = typeof body?.note === 'string' ? body.note : null;

  const db = getDb(c.env.DB);
  const rows = await db
    .select()
    .from(schema.tasks)
    .where(and(eq(schema.tasks.id, id), eq(schema.tasks.firmId, firm.id), isNull(schema.tasks.deletedAt)))
    .limit(1);

  const task = rows[0];
  if (!task) return c.json({ error: 'Not found', message: 'Task not found' }, 404);
  if (task.caseId && !(await canUserSeeCaseId(db, firm, user, task.caseId))) {
    return c.json({ error: 'Not found', message: 'Task not found' }, 404);
  }

  const nowIso = new Date().toISOString();
  const updates = { status: 'completed' as const, completedAt: nowIso, updatedAt: nowIso, updatedBy: user.id };

  await db.batch([
    db.update(schema.tasks).set(updates).where(and(eq(schema.tasks.id, id), eq(schema.tasks.firmId, firm.id))),
    db.insert(schema.auditLog).values(
      buildAuditEntry({
        firmId: firm.id,
        userId: user.id,
        userName: user.name,
        entity: 'Task',
        entityId: id,
        action: 'UPDATE',
        oldValue: { status: task.status },
        newValue: { status: 'completed', note },
        now: nowIso,
      })
    ),
  ] as any);

  return c.json({ ...task, ...updates });
});

// POST /api/v1/tasks/:id/reassign
tasksRouter.post('/:id/reassign', enforceSubscriptionReadOnly, requirePermission('tasks.assign'), async (c) => {
  const firm = c.get('firm') as schema.Firm;
  const user = c.get('user') as schema.User;
  const id = c.req.param('id') as string;
  const body = await c.req.json().catch(() => ({}));
  const parse = z.object({ newAssignedTo: z.string().min(1), reason: z.string().optional() }).safeParse(body);
  if (!parse.success) {
    return c.json({ error: 'Validation failed', errors: parse.error.issues }, 400);
  }

  const db = getDb(c.env.DB);
  const rows = await db
    .select()
    .from(schema.tasks)
    .where(and(eq(schema.tasks.id, id), eq(schema.tasks.firmId, firm.id), isNull(schema.tasks.deletedAt)))
    .limit(1);
  const task = rows[0];
  if (!task) return c.json({ error: 'Not found', message: 'Task not found' }, 404);

  const nowIso = new Date().toISOString();
  const updates = { assignedTo: parse.data.newAssignedTo, updatedAt: nowIso, updatedBy: user.id };

  await db.batch([
    db.update(schema.tasks).set(updates).where(and(eq(schema.tasks.id, id), eq(schema.tasks.firmId, firm.id))),
    db.insert(schema.auditLog).values(
      buildAuditEntry({
        firmId: firm.id,
        userId: user.id,
        userName: user.name,
        entity: 'Task',
        entityId: id,
        action: 'UPDATE',
        oldValue: { assignedTo: task.assignedTo },
        newValue: { assignedTo: parse.data.newAssignedTo, reason: parse.data.reason || null },
        now: nowIso,
      })
    ),
  ] as any);

  return c.json({ ...task, ...updates });
});

// DELETE /api/v1/tasks/:id
tasksRouter.delete('/:id', enforceSubscriptionReadOnly, requirePermission('tasks.assign'), async (c) => {
  const firm = c.get('firm') as schema.Firm;
  const user = c.get('user') as schema.User;
  const id = c.req.param('id') as string;
  const db = getDb(c.env.DB);

  const rows = await db
    .select()
    .from(schema.tasks)
    .where(and(eq(schema.tasks.id, id), eq(schema.tasks.firmId, firm.id), isNull(schema.tasks.deletedAt)))
    .limit(1);
  const task = rows[0];
  if (!task) return c.json({ error: 'Not found', message: 'Task not found' }, 404);

  const nowIso = new Date().toISOString();
  await db.batch([
    db
      .update(schema.tasks)
      .set({ deletedAt: nowIso, updatedAt: nowIso, updatedBy: user.id })
      .where(and(eq(schema.tasks.id, id), eq(schema.tasks.firmId, firm.id))),
    db.insert(schema.auditLog).values(
      buildAuditEntry({
        firmId: firm.id,
        userId: user.id,
        userName: user.name,
        entity: 'Task',
        entityId: id,
        action: 'DELETE',
        oldValue: { title: task.title, status: task.status },
        now: nowIso,
      })
    ),
  ] as any);

  return c.json({ success: true, softDeleted: true });
});
