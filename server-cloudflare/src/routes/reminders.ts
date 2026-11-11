import { Hono } from 'hono';
import { z } from 'zod';
import { and, asc, eq, inArray, isNull, lte, ne } from 'drizzle-orm';
import { Env, authMiddleware, enforceSubscriptionReadOnly } from '../middleware/auth';
import { getDb } from '../db/client';
import * as schema from '../db/schema';
import { canUserSeeCaseId, getVisibleCaseIds } from '../utils/visibility';
import { buildAuditEntry } from '../utils/audit';
import { buildRescheduleRemindersStmt, computeRemindAtIso } from '../utils/reminders';

export const remindersRouter = new Hono<{ Bindings: Env; Variables: any }>();

remindersRouter.use('*', authMiddleware);

const SOURCE_TYPES = ['hearing', 'task', 'file_return', 'appointment'] as const;
const CHANNELS = ['in_app', 'email_stub', 'sms_stub'] as const;
const STATUS_FILTERS = ['pending', 'sent', 'dismissed', 'active'] as const;

const isoDateString = z.string().refine((val) => !isNaN(Date.parse(val)), {
  message: 'Invalid ISO 8601 date string',
});

function canViewRestricted(user: schema.User): boolean {
  const perms = (Array.isArray(user.permissions) ? user.permissions : []) as string[];
  return user.role === 'Owner' || perms.includes('*') || perms.includes('restricted.view');
}

async function isSourceVisible(
  db: ReturnType<typeof getDb>,
  firm: schema.Firm,
  user: schema.User,
  sourceType: schema.Reminder['sourceType'],
  sourceId: string
): Promise<boolean> {
  let caseId: string | null = null;
  if (sourceType === 'hearing') {
    const rows = await db
      .select({ caseId: schema.hearings.caseId })
      .from(schema.hearings)
      .where(and(eq(schema.hearings.id, sourceId), eq(schema.hearings.firmId, firm.id), isNull(schema.hearings.deletedAt)))
      .limit(1);
    if (!rows[0]) return false;
    caseId = rows[0].caseId;
  } else if (sourceType === 'task') {
    const rows = await db
      .select({ caseId: schema.tasks.caseId })
      .from(schema.tasks)
      .where(and(eq(schema.tasks.id, sourceId), eq(schema.tasks.firmId, firm.id), isNull(schema.tasks.deletedAt)))
      .limit(1);
    if (!rows[0]) return false;
    caseId = rows[0].caseId;
  } else if (sourceType === 'file_return') {
    const rows = await db
      .select({ caseId: schema.physicalFiles.caseId })
      .from(schema.physicalFiles)
      .where(and(eq(schema.physicalFiles.id, sourceId), eq(schema.physicalFiles.firmId, firm.id), isNull(schema.physicalFiles.deletedAt)))
      .limit(1);
    if (!rows[0]) return false;
    caseId = rows[0].caseId;
  } else if (sourceType === 'appointment') {
    const rows = await db
      .select({ caseId: schema.appointments.caseId })
      .from(schema.appointments)
      .where(and(eq(schema.appointments.id, sourceId), eq(schema.appointments.firmId, firm.id), isNull(schema.appointments.deletedAt)))
      .limit(1);
    if (!rows[0]) return false;
    caseId = rows[0].caseId;
  }

  if (caseId) {
    const canSee = await canUserSeeCaseId(db, firm, user, caseId);
    if (!canSee) return false;
    if (!canViewRestricted(user)) {
      const cRows = await db
        .select({ restricted: schema.cases.restricted })
        .from(schema.cases)
        .where(and(eq(schema.cases.id, caseId), eq(schema.cases.firmId, firm.id)))
        .limit(1);
      if (cRows[0]?.restricted) return false;
    }
  }
  return true;
}

async function queryVisibleReminders(
  db: ReturnType<typeof getDb>,
  firm: schema.Firm,
  user: schema.User,
  filter?: {
    status?: (typeof STATUS_FILTERS)[number];
    sourceType?: (typeof SOURCE_TYPES)[number];
    userId?: string;
    search?: string;
    dueOnly?: boolean;
  }
) {
  const conditions: any[] = [
    eq(schema.reminders.firmId, firm.id),
    isNull(schema.reminders.deletedAt),
  ];

  if (user.role === 'Staff') {
    conditions.push(eq(schema.reminders.userId, user.id));
  } else if (filter?.userId) {
    conditions.push(eq(schema.reminders.userId, filter.userId));
  }

  if (filter?.status) {
    if (filter.status === 'active') {
      conditions.push(ne(schema.reminders.status, 'dismissed'));
    } else {
      conditions.push(eq(schema.reminders.status, filter.status));
    }
  }

  if (filter?.sourceType) {
    conditions.push(eq(schema.reminders.sourceType, filter.sourceType));
  }

  if (filter?.dueOnly) {
    conditions.push(lte(schema.reminders.remindAt, new Date().toISOString()));
  }

  const [rows, visible] = await Promise.all([
    db
      .select({
        reminder: schema.reminders,
        userName: schema.users.name,
      })
      .from(schema.reminders)
      .leftJoin(schema.users, eq(schema.reminders.userId, schema.users.id))
      .where(and(...conditions))
      .orderBy(asc(schema.reminders.remindAt)),
    getVisibleCaseIds(db, firm, user),
  ]);

  let items = rows.map((r) => ({
    ...r.reminder,
    userName: r.userName || undefined,
    description: r.reminder.description ?? undefined,
  }));

  if (visible !== 'ALL') {
    const visibleSet = new Set(visible);
    const hearingIds = items.filter((r) => r.sourceType === 'hearing').map((r) => r.sourceId);
    const taskIds = items.filter((r) => r.sourceType === 'task').map((r) => r.sourceId);
    const fileIds = items.filter((r) => r.sourceType === 'file_return').map((r) => r.sourceId);
    const apptIds = items.filter((r) => r.sourceType === 'appointment').map((r) => r.sourceId);

    const [hRows, tRows, fRows, aRows] = await Promise.all([
      hearingIds.length
        ? db
            .select({ id: schema.hearings.id, caseId: schema.hearings.caseId })
            .from(schema.hearings)
            .where(and(eq(schema.hearings.firmId, firm.id), isNull(schema.hearings.deletedAt), inArray(schema.hearings.id, hearingIds)))
        : Promise.resolve([]),
      taskIds.length
        ? db
            .select({ id: schema.tasks.id, caseId: schema.tasks.caseId })
            .from(schema.tasks)
            .where(and(eq(schema.tasks.firmId, firm.id), isNull(schema.tasks.deletedAt), inArray(schema.tasks.id, taskIds)))
        : Promise.resolve([]),
      fileIds.length
        ? db
            .select({ id: schema.physicalFiles.id, caseId: schema.physicalFiles.caseId })
            .from(schema.physicalFiles)
            .where(and(eq(schema.physicalFiles.firmId, firm.id), isNull(schema.physicalFiles.deletedAt), inArray(schema.physicalFiles.id, fileIds)))
        : Promise.resolve([]),
      apptIds.length
        ? db
            .select({ id: schema.appointments.id, caseId: schema.appointments.caseId })
            .from(schema.appointments)
            .where(and(eq(schema.appointments.firmId, firm.id), isNull(schema.appointments.deletedAt), inArray(schema.appointments.id, apptIds)))
        : Promise.resolve([]),
    ]);

    const hCaseMap = new Map(hRows.map((x) => [x.id, x.caseId]));
    const tCaseMap = new Map(tRows.map((x) => [x.id, x.caseId]));
    const fCaseMap = new Map(fRows.map((x) => [x.id, x.caseId]));
    const aCaseMap = new Map(aRows.map((x) => [x.id, x.caseId]));

    items = items.filter((r) => {
      let caseId: string | null | undefined;
      if (r.sourceType === 'hearing') caseId = hCaseMap.get(r.sourceId);
      else if (r.sourceType === 'task') caseId = tCaseMap.get(r.sourceId);
      else if (r.sourceType === 'file_return') caseId = fCaseMap.get(r.sourceId);
      else if (r.sourceType === 'appointment') caseId = aCaseMap.get(r.sourceId);
      if (caseId && !visibleSet.has(caseId)) return false;
      return true;
    });
  }

  if (filter?.search) {
    const q = filter.search.toLowerCase();
    items = items.filter(
      (r) =>
        r.title.toLowerCase().includes(q) ||
        (r.description && r.description.toLowerCase().includes(q))
    );
  }

  return items;
}

// GET /api/v1/reminders
remindersRouter.get('/', async (c) => {
  const parse = z
    .object({
      status: z.enum(STATUS_FILTERS).optional(),
      sourceType: z.enum(SOURCE_TYPES).optional(),
      userId: z.string().min(1).optional(),
      search: z.string().max(200).optional(),
      dueOnly: z.enum(['true', 'false']).optional(),
    })
    .safeParse({
      status: c.req.query('status'),
      sourceType: c.req.query('sourceType'),
      userId: c.req.query('userId'),
      search: c.req.query('search'),
      dueOnly: c.req.query('dueOnly'),
    });

  if (!parse.success) {
    return c.json({ error: 'Validation failed', errors: parse.error.issues }, 400);
  }

  const firm = c.get('firm') as schema.Firm;
  const user = c.get('user') as schema.User;
  const db = getDb(c.env.DB);

  const items = await queryVisibleReminders(db, firm, user, {
    status: parse.data.status,
    sourceType: parse.data.sourceType,
    userId: parse.data.userId,
    search: parse.data.search,
    dueOnly: parse.data.dueOnly === 'true',
  });
  return c.json(items);
});

// GET /api/v1/reminders/due
remindersRouter.get('/due', async (c) => {
  const firm = c.get('firm') as schema.Firm;
  const user = c.get('user') as schema.User;
  const db = getDb(c.env.DB);
  const items = await queryVisibleReminders(db, firm, user, { status: 'active', dueOnly: true });
  return c.json(items);
});

// POST /api/v1/reminders
remindersRouter.post('/', enforceSubscriptionReadOnly, async (c) => {
  const firm = c.get('firm') as schema.Firm;
  const user = c.get('user') as schema.User;
  const body = await c.req.json().catch(() => ({}));

  const parse = z
    .object({
      userId: z.string().trim().min(1),
      sourceType: z.enum(SOURCE_TYPES),
      sourceId: z.string().trim().min(1),
      title: z.string().trim().min(1).max(300),
      description: z.string().trim().max(2000).optional().nullable(),
      remindAt: isoDateString,
      dueAt: isoDateString,
      channel: z.enum(CHANNELS).optional().default('in_app'),
    })
    .safeParse(body);

  if (!parse.success) {
    return c.json({ error: 'Validation failed', errors: parse.error.issues }, 400);
  }

  const db = getDb(c.env.DB);
  const data = parse.data;
  const targetUsers = await db
    .select()
    .from(schema.users)
    .where(and(eq(schema.users.id, data.userId), eq(schema.users.firmId, firm.id), isNull(schema.users.deletedAt)))
    .limit(1);

  const targetUser = targetUsers[0];
  if (!targetUser) {
    return c.json({ error: 'Validation failed', message: 'Target user does not exist in this chamber' }, 400);
  }

  if (user.role === 'Staff' && targetUser.id !== user.id) {
    return c.json({ error: 'PermissionDenied', message: 'Staff users cannot create reminders for other members' }, 403);
  }

  const visible = await isSourceVisible(db, firm, user, data.sourceType, data.sourceId);
  if (!visible) {
    return c.json({ error: 'Not found', message: 'Linked source record not found or access denied' }, 404);
  }

  const nowIso = new Date().toISOString();
  const id = crypto.randomUUID();
  const newReminder: schema.NewReminder = {
    id,
    firmId: firm.id,
    userId: data.userId,
    sourceType: data.sourceType,
    sourceId: data.sourceId,
    title: data.title,
    description: data.description ?? null,
    remindAt: new Date(data.remindAt).toISOString(),
    dueAt: new Date(data.dueAt).toISOString(),
    channel: data.channel,
    status: 'pending',
    sentAt: null,
    dismissedAt: null,
    createdAt: nowIso,
    updatedAt: nowIso,
    deletedAt: null,
    createdBy: user.id,
    updatedBy: user.id,
  };

  await db.batch([
    db.insert(schema.reminders).values(newReminder),
    db.insert(schema.auditLog).values(
      buildAuditEntry({
        firmId: firm.id,
        userId: user.id,
        userName: user.name,
        entity: 'Reminder',
        entityId: id,
        action: 'REMINDER_CREATE',
        newValue: {
          id,
          userId: newReminder.userId,
          sourceType: newReminder.sourceType,
          sourceId: newReminder.sourceId,
          title: newReminder.title,
          remindAt: newReminder.remindAt,
          dueAt: newReminder.dueAt,
        },
        now: nowIso,
      })
    ),
  ] as any);

  return c.json(
    {
      ...newReminder,
      userName: targetUser.name,
      description: newReminder.description ?? undefined,
    },
    201
  );
});

// POST /api/v1/reminders/sync
remindersRouter.post('/sync', enforceSubscriptionReadOnly, async (c) => {
  const firm = c.get('firm') as schema.Firm;
  const user = c.get('user') as schema.User;
  const db = getDb(c.env.DB);

  const [hearingsRows, tasksRows, filesRows, apptsRows, casesRows, existingRows, usersRows] = await Promise.all([
    db.select().from(schema.hearings).where(and(eq(schema.hearings.firmId, firm.id), eq(schema.hearings.status, 'scheduled'), isNull(schema.hearings.deletedAt))),
    db.select().from(schema.tasks).where(and(eq(schema.tasks.firmId, firm.id), isNull(schema.tasks.deletedAt))),
    db.select().from(schema.physicalFiles).where(and(eq(schema.physicalFiles.firmId, firm.id), isNull(schema.physicalFiles.deletedAt))),
    db.select().from(schema.appointments).where(and(eq(schema.appointments.firmId, firm.id), eq(schema.appointments.status, 'scheduled'), isNull(schema.appointments.deletedAt))),
    db.select().from(schema.cases).where(and(eq(schema.cases.firmId, firm.id), isNull(schema.cases.deletedAt))),
    db.select().from(schema.reminders).where(and(eq(schema.reminders.firmId, firm.id), isNull(schema.reminders.deletedAt))),
    db.select({ id: schema.users.id, name: schema.users.name }).from(schema.users).where(eq(schema.users.firmId, firm.id)),
  ]);

  const caseMap = new Map(casesRows.map((cs) => [cs.id, cs]));
  const userMap = new Map(usersRows.map((u) => [u.id, u.name]));
  const nowIso = new Date().toISOString();

  const stmts: any[] = [];
  let createdCount = 0;
  let updatedCount = 0;

  // 1. Hearings (-24h)
  for (const h of hearingsRows) {
    const caseRec = caseMap.get(h.caseId);
    if (!caseRec) continue;
    const existing = existingRows.find((r) => r.sourceType === 'hearing' && r.sourceId === h.id);
    const remindIso = computeRemindAtIso(h.scheduledAt, 24 * 60 * 60 * 1000);
    if (!existing) {
      const recipientId = h.appearingLawyerId || caseRec.responsibleLawyerId || user.id;
      const fixedPurpose = h.fixedFor
        ? h.fixedForNote
          ? `${h.fixedFor} (${h.fixedForNote})`
          : h.fixedFor
        : h.purpose;
      stmts.push(
        db.insert(schema.reminders).values({
          id: crypto.randomUUID(),
          firmId: firm.id,
          userId: recipientId,
          sourceType: 'hearing',
          sourceId: h.id,
          title: `Court Hearing: ${caseRec.caseNumber} [${fixedPurpose}]`,
          description: `${caseRec.court} - Fixed for: ${fixedPurpose}`,
          remindAt: remindIso,
          dueAt: h.scheduledAt,
          channel: 'in_app',
          status: 'pending',
          createdAt: nowIso,
          updatedAt: nowIso,
          deletedAt: null,
          createdBy: user.id,
          updatedBy: user.id,
        })
      );
      createdCount++;
    } else if (new Date(existing.dueAt).getTime() !== new Date(h.scheduledAt).getTime()) {
      stmts.push(
        buildRescheduleRemindersStmt(db, {
          firmId: firm.id,
          sourceId: h.id,
          newDueAt: h.scheduledAt,
          newRemindAt: remindIso,
          updatedBy: user.id,
          nowIso,
        })
      );
      updatedCount++;
    }
  }

  // 2. Tasks (-2h)
  for (const t of tasksRows) {
    if (t.status === 'completed' || t.status === 'cancelled') continue;
    const existing = existingRows.find((r) => r.sourceType === 'task' && r.sourceId === t.id);
    if (!existing) {
      stmts.push(
        db.insert(schema.reminders).values({
          id: crypto.randomUUID(),
          firmId: firm.id,
          userId: t.assignedTo,
          sourceType: 'task',
          sourceId: t.id,
          title: `Task Deadline: ${t.title}`,
          description: t.description || `Priority: ${t.priority}`,
          remindAt: computeRemindAtIso(t.dueAt, 2 * 60 * 60 * 1000),
          dueAt: t.dueAt,
          channel: 'in_app',
          status: 'pending',
          createdAt: nowIso,
          updatedAt: nowIso,
          deletedAt: null,
          createdBy: user.id,
          updatedBy: user.id,
        })
      );
      createdCount++;
    }
  }

  // 3. Checked-out / In-court physical files (-4h)
  for (const f of filesRows) {
    if ((f.status !== 'checked_out' && f.status !== 'in_court') || !f.dueBackAt || !f.currentHolderId) continue;
    const existing = existingRows.find((r) => r.sourceType === 'file_return' && r.sourceId === f.id);
    if (!existing) {
      const holderName = userMap.get(f.currentHolderId) || f.currentHolderId;
      stmts.push(
        db.insert(schema.reminders).values({
          id: crypto.randomUUID(),
          firmId: firm.id,
          userId: f.currentHolderId,
          sourceType: 'file_return',
          sourceId: f.id,
          title: `File Return Due: ${f.serial} (${f.title})`,
          description: `Location: ${f.shelfLocation || 'Chamber Rack'}. Current holder: ${holderName}`,
          remindAt: computeRemindAtIso(f.dueBackAt, 4 * 60 * 60 * 1000),
          dueAt: f.dueBackAt,
          channel: 'in_app',
          status: 'pending',
          createdAt: nowIso,
          updatedAt: nowIso,
          deletedAt: null,
          createdBy: user.id,
          updatedBy: user.id,
        })
      );
      createdCount++;
    }
  }

  // 4. Scheduled appointments
  for (const a of apptsRows) {
    if (!(a.reminderMinutesBefore > 0)) continue;
    const existing = existingRows.find((r) => r.sourceType === 'appointment' && r.sourceId === a.id);
    if (!existing) {
      stmts.push(
        db.insert(schema.reminders).values({
          id: crypto.randomUUID(),
          firmId: firm.id,
          userId: a.organiserUserId,
          sourceType: 'appointment',
          sourceId: a.id,
          title: `Appointment: ${a.title}`,
          description: a.location ? `Location: ${a.location}` : null,
          remindAt: computeRemindAtIso(a.startsAt, a.reminderMinutesBefore * 60 * 1000),
          dueAt: a.startsAt,
          channel: 'in_app',
          status: 'pending',
          createdAt: nowIso,
          updatedAt: nowIso,
          deletedAt: null,
          createdBy: user.id,
          updatedBy: user.id,
        })
      );
      createdCount++;
    }
  }

  if (stmts.length > 0) {
    await db.batch(stmts as any);
  }

  const activeReminders = await queryVisibleReminders(db, firm, user, { status: 'active' });
  return c.json({ createdCount, updatedCount, activeReminders });
});

// POST /api/v1/reminders/clear-source
remindersRouter.post('/clear-source', enforceSubscriptionReadOnly, async (c) => {
  const firm = c.get('firm') as schema.Firm;
  const user = c.get('user') as schema.User;
  const body = await c.req.json().catch(() => ({}));
  const parse = z.object({ sourceId: z.string().trim().min(1) }).safeParse(body);
  if (!parse.success) {
    return c.json({ error: 'Validation failed', errors: parse.error.issues }, 400);
  }

  const db = getDb(c.env.DB);
  const nowIso = new Date().toISOString();
  const conditions: any[] = [
    eq(schema.reminders.firmId, firm.id),
    eq(schema.reminders.sourceId, parse.data.sourceId),
    isNull(schema.reminders.deletedAt),
    ne(schema.reminders.status, 'dismissed'),
  ];
  if (user.role === 'Staff') {
    conditions.push(eq(schema.reminders.userId, user.id));
  }

  const matching = await db.select({ id: schema.reminders.id }).from(schema.reminders).where(and(...conditions));
  if (matching.length > 0) {
    await db
      .update(schema.reminders)
      .set({ status: 'dismissed', dismissedAt: nowIso, updatedAt: nowIso, updatedBy: user.id })
      .where(and(...conditions));
  }

  return c.json({ dismissedCount: matching.length });
});

// POST /api/v1/reminders/reschedule-source
remindersRouter.post('/reschedule-source', enforceSubscriptionReadOnly, async (c) => {
  const firm = c.get('firm') as schema.Firm;
  const user = c.get('user') as schema.User;
  const body = await c.req.json().catch(() => ({}));
  const parse = z
    .object({
      sourceId: z.string().trim().min(1),
      newDueAt: isoDateString,
      newRemindAt: isoDateString.optional(),
    })
    .safeParse(body);

  if (!parse.success) {
    return c.json({ error: 'Validation failed', errors: parse.error.issues }, 400);
  }

  const db = getDb(c.env.DB);
  const nowIso = new Date().toISOString();
  const dueIso = new Date(parse.data.newDueAt).toISOString();
  const remindIso = parse.data.newRemindAt
    ? new Date(parse.data.newRemindAt).toISOString()
    : computeRemindAtIso(dueIso);

  const matching = await db
    .select({ id: schema.reminders.id })
    .from(schema.reminders)
    .where(
      and(
        eq(schema.reminders.firmId, firm.id),
        eq(schema.reminders.sourceId, parse.data.sourceId),
        isNull(schema.reminders.deletedAt)
      )
    );

  if (matching.length > 0) {
    await db
      .update(schema.reminders)
      .set({
        dueAt: dueIso,
        remindAt: remindIso,
        status: 'pending',
        dismissedAt: null,
        updatedAt: nowIso,
        updatedBy: user.id,
      })
      .where(
        and(
          eq(schema.reminders.firmId, firm.id),
          eq(schema.reminders.sourceId, parse.data.sourceId),
          isNull(schema.reminders.deletedAt)
        )
      );
  }

  return c.json({ updatedCount: matching.length });
});

// POST /api/v1/reminders/:id/dismiss
remindersRouter.post('/:id/dismiss', enforceSubscriptionReadOnly, async (c) => {
  const firm = c.get('firm') as schema.Firm;
  const user = c.get('user') as schema.User;
  const id = c.req.param('id') as string;
  const db = getDb(c.env.DB);

  const rows = await db
    .select({
      reminder: schema.reminders,
      userName: schema.users.name,
    })
    .from(schema.reminders)
    .leftJoin(schema.users, eq(schema.reminders.userId, schema.users.id))
    .where(and(eq(schema.reminders.id, id), eq(schema.reminders.firmId, firm.id), isNull(schema.reminders.deletedAt)))
    .limit(1);

  if (!rows[0]) {
    return c.json({ error: 'Not found', message: 'Reminder not found' }, 404);
  }
  const existing = rows[0].reminder;

  if (user.role === 'Staff' && existing.userId !== user.id) {
    return c.json({
      error: 'PermissionDenied',
      message: 'Permission denied: you cannot dismiss reminders of other advocates',
    }, 403);
  }

  const visible = await isSourceVisible(db, firm, user, existing.sourceType, existing.sourceId);
  if (!visible) {
    return c.json({ error: 'Not found', message: 'Reminder not found' }, 404);
  }

  const nowIso = new Date().toISOString();
  await db.batch([
    db
      .update(schema.reminders)
      .set({ status: 'dismissed', dismissedAt: nowIso, updatedAt: nowIso, updatedBy: user.id })
      .where(and(eq(schema.reminders.id, id), eq(schema.reminders.firmId, firm.id))),
    db.insert(schema.auditLog).values(
      buildAuditEntry({
        firmId: firm.id,
        userId: user.id,
        userName: user.name,
        entity: 'Reminder',
        entityId: id,
        action: 'REMINDER_DISMISS',
        oldValue: { status: existing.status, dismissedAt: existing.dismissedAt },
        newValue: { status: 'dismissed', dismissedAt: nowIso },
        now: nowIso,
      })
    ),
  ] as any);

  return c.json({
    ...existing,
    userName: rows[0].userName || undefined,
    description: existing.description ?? undefined,
    status: 'dismissed',
    dismissedAt: nowIso,
    updatedAt: nowIso,
    updatedBy: user.id,
  });
});
