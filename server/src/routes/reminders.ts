import crypto from 'crypto';
import { Router, Response } from 'express';
import { z } from 'zod';
import { authMiddleware, AuthenticatedRequest } from '../middleware/auth.js';
import { enforceFirmIsolation } from '../middleware/firmIsolation.js';
import { enforceSubscriptionReadOnly } from '../middleware/subscription.js';
import { getDatabase, IDatabase } from '../db/client.js';
import * as schema from '../db/schema.js';

export const remindersRouter = Router();

remindersRouter.use(authMiddleware);
remindersRouter.use(enforceFirmIsolation);

const SOURCE_TYPES = ['hearing', 'task', 'file_return', 'appointment'] as const;
const CHANNELS = ['in_app', 'email_stub', 'sms_stub'] as const;
const STATUS_FILTERS = ['pending', 'sent', 'dismissed', 'active'] as const;

const isoDateString = z.string().refine((val) => !isNaN(Date.parse(val)), {
  message: 'Invalid ISO 8601 date string',
});

const listQuerySchema = z.object({
  status: z.enum(STATUS_FILTERS).optional(),
  sourceType: z.enum(SOURCE_TYPES).optional(),
  userId: z.string().min(1).optional(),
  search: z.string().max(200).optional(),
  dueOnly: z.enum(['true', 'false']).optional(),
});

const createReminderSchema = z.object({
  userId: z.string().trim().min(1, 'userId is required'),
  sourceType: z.enum(SOURCE_TYPES),
  sourceId: z.string().trim().min(1, 'sourceId is required'),
  title: z.string().trim().min(1, 'title is required').max(300, 'title too long'),
  description: z.string().trim().max(2000).optional().nullable(),
  remindAt: isoDateString,
  dueAt: isoDateString,
  channel: z.enum(CHANNELS).optional().default('in_app'),
});

const clearSourceSchema = z.object({
  sourceId: z.string().trim().min(1, 'sourceId is required'),
});

const rescheduleSourceSchema = z.object({
  sourceId: z.string().trim().min(1, 'sourceId is required'),
  newDueAt: isoDateString,
  newRemindAt: isoDateString.optional(),
});

async function insertReminderAudit(
  txDb: IDatabase,
  params: {
    firmId: string;
    userId: string;
    userName: string;
    entityId: string;
    action: string;
    oldValue?: Record<string, unknown> | null;
    newValue?: Record<string, unknown> | null;
  }
) {
  const now = new Date();
  await txDb.insertAudit({
    id: crypto.randomUUID(),
    firmId: params.firmId,
    userId: params.userId,
    userName: params.userName,
    entity: 'Reminder',
    entityId: params.entityId,
    action: params.action,
    oldValue: params.oldValue || null,
    newValue: params.newValue || null,
    timestamp: now,
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
    createdBy: params.userId,
    updatedBy: params.userId,
  });
}

function toReminderResponse(r: schema.Reminder & { userName?: string }) {
  return {
    id: r.id,
    firmId: r.firmId,
    userId: r.userId,
    userName: r.userName,
    sourceType: r.sourceType,
    sourceId: r.sourceId,
    title: r.title,
    description: r.description ?? undefined,
    remindAt: r.remindAt instanceof Date ? r.remindAt.toISOString() : r.remindAt,
    dueAt: r.dueAt instanceof Date ? r.dueAt.toISOString() : r.dueAt,
    channel: r.channel,
    status: r.status,
    sentAt: r.sentAt instanceof Date ? r.sentAt.toISOString() : r.sentAt ?? null,
    dismissedAt: r.dismissedAt instanceof Date ? r.dismissedAt.toISOString() : r.dismissedAt ?? null,
    createdAt: r.createdAt instanceof Date ? r.createdAt.toISOString() : r.createdAt,
    updatedAt: r.updatedAt instanceof Date ? r.updatedAt.toISOString() : r.updatedAt,
    deletedAt: r.deletedAt instanceof Date ? r.deletedAt.toISOString() : r.deletedAt ?? null,
    createdBy: r.createdBy ?? '',
    updatedBy: r.updatedBy ?? '',
  };
}

function canViewRestricted(user: AuthenticatedRequest['user']): boolean {
  if (!user) return false;
  if (user.role === 'Owner') return true;
  return Boolean(user.permissions?.includes('restricted.view'));
}

async function isReminderSourceVisible(
  db: IDatabase,
  firmId: string,
  user: NonNullable<AuthenticatedRequest['user']>,
  sourceType: schema.Reminder['sourceType'],
  sourceId: string
): Promise<boolean> {
  let caseId: string | null = null;
  if (sourceType === 'hearing') {
    const h = await db.getHearingById(sourceId, firmId, user);
    if (!h) return false;
    caseId = h.caseId;
  } else if (sourceType === 'task') {
    const t = await db.getTaskById(sourceId, firmId, user);
    if (!t) return false;
    caseId = t.caseId;
  } else if (sourceType === 'file_return') {
    const f = await db.getPhysicalFileById(sourceId, firmId);
    if (!f) return false;
    caseId = f.caseId;
  } else if (sourceType === 'appointment') {
    const a = await db.getAppointmentById(sourceId, firmId, user);
    if (!a) return false;
    caseId = a.caseId;
  }

  if (caseId) {
    const c = await db.getCaseById(caseId, firmId, user);
    if (!c) return false;
    if (c.restricted && !canViewRestricted(user)) return false;
  }
  return true;
}

// GET /api/v1/reminders
remindersRouter.get('/', async (req: AuthenticatedRequest, res: Response) => {
  const parsed = listQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    return res.status(400).json({ error: 'ValidationError', details: parsed.error.issues });
  }

  const db = getDatabase();
  const firmId = req.user!.firmId;
  const rows = await db.listReminders(
    firmId,
    {
      status: parsed.data.status,
      sourceType: parsed.data.sourceType,
      userId: parsed.data.userId,
      search: parsed.data.search,
      dueOnly: parsed.data.dueOnly === 'true',
    },
    req.user
  );
  return res.json(rows.map(toReminderResponse));
});

// GET /api/v1/reminders/due
remindersRouter.get('/due', async (req: AuthenticatedRequest, res: Response) => {
  const db = getDatabase();
  const firmId = req.user!.firmId;
  const rows = await db.listReminders(firmId, { status: 'active', dueOnly: true }, req.user);
  return res.json(rows.map(toReminderResponse));
});

// POST /api/v1/reminders
remindersRouter.post(
  '/',
  enforceSubscriptionReadOnly,
  async (req: AuthenticatedRequest, res: Response) => {
    const parsed = createReminderSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'ValidationError', details: parsed.error.issues });
    }

    const db = getDatabase();
    const firmId = req.user!.firmId;
    const data = parsed.data;

    const targetUser = await db.getUserById(data.userId);
    if (!targetUser || targetUser.firmId !== firmId || targetUser.deletedAt) {
      return res.status(400).json({
        error: 'ValidationError',
        message: 'Target user does not exist in this chamber',
      });
    }

    if (req.user!.role === 'Staff' && targetUser.id !== req.user!.id) {
      return res.status(403).json({
        error: 'PermissionDenied',
        message: 'Staff users cannot create reminders assigned to other chamber members',
      });
    }

    const visible = await isReminderSourceVisible(db, firmId, req.user!, data.sourceType, data.sourceId);
    if (!visible) {
      return res.status(404).json({
        error: 'NotFound',
        message: 'Linked source record not found or access denied',
      });
    }

    const now = new Date();
    const id = crypto.randomUUID();
    const created = await db.transaction(async (txDb) => {
      const rec = await txDb.insertReminder({
        id,
        firmId,
        userId: data.userId,
        sourceType: data.sourceType,
        sourceId: data.sourceId,
        title: data.title,
        description: data.description ?? null,
        remindAt: new Date(data.remindAt),
        dueAt: new Date(data.dueAt),
        channel: data.channel,
        status: 'pending',
        sentAt: null,
        dismissedAt: null,
        createdAt: now,
        updatedAt: now,
        deletedAt: null,
        createdBy: req.user!.id,
        updatedBy: req.user!.id,
      });

      await insertReminderAudit(txDb, {
        firmId,
        userId: req.user!.id,
        userName: req.user!.name,
        entityId: id,
        action: 'REMINDER_CREATE',
        oldValue: null,
        newValue: {
          id,
          userId: rec.userId,
          sourceType: rec.sourceType,
          sourceId: rec.sourceId,
          title: rec.title,
          remindAt: rec.remindAt,
          dueAt: rec.dueAt,
        },
      });

      return rec;
    });

    return res.status(201).json(toReminderResponse(created));
  }
);

// POST /api/v1/reminders/sync
remindersRouter.post(
  '/sync',
  enforceSubscriptionReadOnly,
  async (req: AuthenticatedRequest, res: Response) => {
    const db = getDatabase();
    const firmId = req.user!.firmId;
    const actor = req.user!;

    const [hearings, taskRes, files, apptRes, cases, existingReminders] = await Promise.all([
      db.listHearings(firmId, { status: 'scheduled' }),
      db.listTasks(firmId, { limit: 10000 }),
      db.listPhysicalFiles(firmId, {}),
      db.listAppointments(firmId, { status: 'scheduled', limit: 10000 }),
      db.listCases(firmId, { user: req.user, includeRestricted: true }),
      db.listReminders(firmId, {}),
    ]);
    const tasks = taskRes.tasks;
    const appointments = apptRes.appointments;

    const caseMap = new Map(cases.map((c) => [c.id, c]));
    const now = new Date();

    let createdCount = 0;
    let updatedCount = 0;

    await db.transaction(async (txDb) => {
      // 1. Sync upcoming hearings (-24h)
      for (const h of hearings) {
        if (h.deletedAt || h.status !== 'scheduled') continue;
        const caseRec = caseMap.get(h.caseId);
        if (!caseRec) continue;

        const existing = existingReminders.find(
          (r) => r.sourceType === 'hearing' && r.sourceId === h.id && !r.deletedAt
        );
        const dueDate = new Date(h.scheduledAt);
        const remindDate = new Date(dueDate.getTime() - 24 * 60 * 60 * 1000);

        if (!existing) {
          const recipientId = h.appearingLawyerId || caseRec.responsibleLawyerId || actor.id;
          const fixedPurpose = h.fixedFor
            ? h.fixedForNote
              ? `${h.fixedFor} (${h.fixedForNote})`
              : h.fixedFor
            : h.purpose;
          const id = crypto.randomUUID();
          await txDb.insertReminder({
            id,
            firmId,
            userId: recipientId,
            sourceType: 'hearing',
            sourceId: h.id,
            title: `Court Hearing: ${caseRec.caseNumber} [${fixedPurpose}]`,
            description: `${caseRec.court} - Fixed for: ${fixedPurpose}`,
            remindAt: remindDate,
            dueAt: dueDate,
            channel: 'in_app',
            status: 'pending',
            createdAt: now,
            updatedAt: now,
            deletedAt: null,
            createdBy: actor.id,
            updatedBy: actor.id,
          });
          createdCount++;
        } else if (new Date(existing.dueAt).getTime() !== dueDate.getTime()) {
          await txDb.rescheduleRemindersBySource(firmId, h.id, dueDate, remindDate, actor.id);
          updatedCount++;
        }
      }

      // 2. Sync incomplete tasks (-2h)
      for (const t of tasks) {
        if (t.deletedAt || t.status === 'completed' || t.status === 'cancelled') continue;
        const existing = existingReminders.find(
          (r) => r.sourceType === 'task' && r.sourceId === t.id && !r.deletedAt
        );
        const dueDate = new Date(t.dueAt);
        const remindDate = new Date(dueDate.getTime() - 2 * 60 * 60 * 1000);

        if (!existing) {
          const id = crypto.randomUUID();
          await txDb.insertReminder({
            id,
            firmId,
            userId: t.assignedTo,
            sourceType: 'task',
            sourceId: t.id,
            title: `Task Deadline: ${t.title}`,
            description: t.description || `Priority: ${t.priority}`,
            remindAt: remindDate,
            dueAt: dueDate,
            channel: 'in_app',
            status: 'pending',
            createdAt: now,
            updatedAt: now,
            deletedAt: null,
            createdBy: actor.id,
            updatedBy: actor.id,
          });
          createdCount++;
        }
      }

      // 3. Sync checked-out / in-court physical files (-4h)
      for (const f of files) {
        if (
          f.deletedAt ||
          (f.status !== 'checked_out' && f.status !== 'in_court') ||
          !f.dueBackAt ||
          !f.currentHolderId
        ) {
          continue;
        }
        const existing = existingReminders.find(
          (r) => r.sourceType === 'file_return' && r.sourceId === f.id && !r.deletedAt
        );
        const dueDate = new Date(f.dueBackAt);
        const remindDate = new Date(dueDate.getTime() - 4 * 60 * 60 * 1000);

        if (!existing) {
          const id = crypto.randomUUID();
          await txDb.insertReminder({
            id,
            firmId,
            userId: f.currentHolderId,
            sourceType: 'file_return',
            sourceId: f.id,
            title: `File Return Due: ${f.serial} (${f.title})`,
            description: `Location: ${f.shelfLocation || 'Chamber Rack'}. Current holder: ${f.currentHolderName || f.currentHolderId}`,
            remindAt: remindDate,
            dueAt: dueDate,
            channel: 'in_app',
            status: 'pending',
            createdAt: now,
            updatedAt: now,
            deletedAt: null,
            createdBy: actor.id,
            updatedBy: actor.id,
          });
          createdCount++;
        }
      }

      // 4. Sync scheduled appointments (reminderMinutesBefore)
      for (const a of appointments) {
        if (a.deletedAt || a.status !== 'scheduled' || !(a.reminderMinutesBefore > 0)) continue;
        const existing = existingReminders.find(
          (r) => r.sourceType === 'appointment' && r.sourceId === a.id && !r.deletedAt
        );
        if (!existing) {
          const dueDate = new Date(a.startsAt);
          const remindDate = new Date(dueDate.getTime() - a.reminderMinutesBefore * 60 * 1000);
          const id = crypto.randomUUID();
          await txDb.insertReminder({
            id,
            firmId,
            userId: a.organiserUserId,
            sourceType: 'appointment',
            sourceId: a.id,
            title: `Appointment: ${a.title}`,
            description: a.location ? `Location: ${a.location}` : undefined,
            remindAt: remindDate,
            dueAt: dueDate,
            channel: 'in_app',
            status: 'pending',
            createdAt: now,
            updatedAt: now,
            deletedAt: null,
            createdBy: actor.id,
            updatedBy: actor.id,
          });
          createdCount++;
        }
      }
    });

    const activeReminders = await db.listReminders(firmId, { status: 'active' }, actor);
    return res.json({
      createdCount,
      updatedCount,
      activeReminders: activeReminders.map(toReminderResponse),
    });
  }
);

// POST /api/v1/reminders/clear-source
remindersRouter.post(
  '/clear-source',
  enforceSubscriptionReadOnly,
  async (req: AuthenticatedRequest, res: Response) => {
    const parsed = clearSourceSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'ValidationError', details: parsed.error.issues });
    }

    const db = getDatabase();
    const firmId = req.user!.firmId;
    const dismissedCount = await db.dismissRemindersBySource(
      firmId,
      parsed.data.sourceId,
      req.user!.id,
      false,
      req.user!.role === 'Staff' ? req.user!.id : undefined
    );
    return res.json({ dismissedCount });
  }
);

// POST /api/v1/reminders/reschedule-source
remindersRouter.post(
  '/reschedule-source',
  enforceSubscriptionReadOnly,
  async (req: AuthenticatedRequest, res: Response) => {
    const parsed = rescheduleSourceSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'ValidationError', details: parsed.error.issues });
    }

    const db = getDatabase();
    const firmId = req.user!.firmId;
    const updatedCount = await db.rescheduleRemindersBySource(
      firmId,
      parsed.data.sourceId,
      new Date(parsed.data.newDueAt),
      parsed.data.newRemindAt ? new Date(parsed.data.newRemindAt) : undefined,
      req.user!.id
    );
    return res.json({ updatedCount });
  }
);

// POST /api/v1/reminders/:id/dismiss
remindersRouter.post(
  '/:id/dismiss',
  enforceSubscriptionReadOnly,
  async (req: AuthenticatedRequest, res: Response) => {
    const db = getDatabase();
    const firmId = req.user!.firmId;
    const existing = await db.getReminderById(req.params.id, firmId);

    if (!existing) {
      return res.status(404).json({ error: 'NotFound', message: 'Reminder not found' });
    }

    if (req.user!.role === 'Staff' && existing.userId !== req.user!.id) {
      return res.status(403).json({
        error: 'PermissionDenied',
        message: 'Permission denied: you cannot dismiss reminders of other advocates',
      });
    }

    const visible = await isReminderSourceVisible(db, firmId, req.user!, existing.sourceType, existing.sourceId);
    if (!visible) {
      return res.status(404).json({ error: 'NotFound', message: 'Reminder not found' });
    }

    const now = new Date();
    const updated = await db.transaction(async (txDb) => {
      const rec = await txDb.updateReminder(existing.id, firmId, {
        status: 'dismissed',
        dismissedAt: now,
        updatedAt: now,
        updatedBy: req.user!.id,
      });

      await insertReminderAudit(txDb, {
        firmId,
        userId: req.user!.id,
        userName: req.user!.name,
        entityId: existing.id,
        action: 'REMINDER_DISMISS',
        oldValue: { status: existing.status, dismissedAt: existing.dismissedAt },
        newValue: { status: rec.status, dismissedAt: rec.dismissedAt },
      });

      return rec;
    });

    return res.json(toReminderResponse(updated));
  }
);
