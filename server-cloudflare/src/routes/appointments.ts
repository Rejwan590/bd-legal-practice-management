import { Hono } from 'hono';
import { z } from 'zod';
import { Env, authMiddleware, enforceSubscriptionReadOnly, requirePermission } from '../middleware/auth';
import { getDb } from '../db/client';
import * as schema from '../db/schema';
import { eq, and, isNull, asc, inArray } from 'drizzle-orm';
import { getVisibleCaseIds, canUserSeeCaseId } from '../utils/visibility';
import { buildAuditEntry } from '../utils/audit';
import {
  buildDismissRemindersStmt,
  buildRescheduleRemindersStmt,
  computeRemindAtIso,
} from '../utils/reminders';

export const appointmentsRouter = new Hono<{ Bindings: Env; Variables: any }>();

appointmentsRouter.use('*', authMiddleware);

type ApptType = 'client_meeting' | 'consultation' | 'phone_call' | 'internal_meeting' | 'court_visit' | 'other';
function normalizeApptType(t?: string): ApptType {
  if (t === 'court_conference') return 'court_visit';
  if (t === 'client_meeting' || t === 'consultation' || t === 'phone_call' || t === 'internal_meeting' || t === 'court_visit') {
    return t;
  }
  return 'other';
}

// GET /api/v1/appointments
appointmentsRouter.get('/', requirePermission('appointments.view'), async (c) => {
  const firm = c.get('firm') as schema.Firm;
  const user = c.get('user') as schema.User;
  const status = c.req.query('status');
  const type = c.req.query('type');
  const fromDate = c.req.query('fromDate');
  const toDate = c.req.query('toDate');
  const clientId = c.req.query('clientId');
  const caseId = c.req.query('caseId');
  const search = c.req.query('search')?.trim().toLowerCase();

  const db = getDb(c.env.DB);
  const visible = await getVisibleCaseIds(db, firm, user);

  const conditions = [eq(schema.appointments.firmId, firm.id), isNull(schema.appointments.deletedAt)];
  if (clientId) conditions.push(eq(schema.appointments.clientId, clientId));
  if (caseId) conditions.push(eq(schema.appointments.caseId, caseId));

  const rows = await db
    .select()
    .from(schema.appointments)
    .where(and(...conditions))
    .orderBy(asc(schema.appointments.startsAt));

  const filtered = rows.filter((a) => {
    if (a.caseId && visible !== 'ALL' && !visible.includes(a.caseId)) return false;
    if (status && status !== 'all' && a.status !== status) return false;
    if (type && type !== 'all' && a.type !== normalizeApptType(type)) return false;
    if (fromDate && a.startsAt < fromDate) return false;
    if (toDate && a.startsAt > toDate) return false;
    if (search) {
      const hit =
        a.title.toLowerCase().includes(search) ||
        (a.location || '').toLowerCase().includes(search) ||
        (a.notes || '').toLowerCase().includes(search);
      if (!hit) return false;
    }
    return true;
  });

  if (filtered.length === 0) return c.json([]);

  const attendeesRows = await db
    .select()
    .from(schema.appointmentAttendees)
    .where(
      and(
        eq(schema.appointmentAttendees.firmId, firm.id),
        inArray(
          schema.appointmentAttendees.appointmentId,
          filtered.map((a) => a.id)
        )
      )
    );

  const attendeesByAppt = new Map<string, string[]>();
  for (const row of attendeesRows) {
    const arr = attendeesByAppt.get(row.appointmentId) || [];
    arr.push(row.userId);
    attendeesByAppt.set(row.appointmentId, arr);
  }

  return c.json(
    filtered.map((a) => ({
      ...a,
      attendees: attendeesByAppt.get(a.id) || [],
    }))
  );
});

// GET /api/v1/appointments/:id
appointmentsRouter.get('/:id', requirePermission('appointments.view'), async (c) => {
  const firm = c.get('firm') as schema.Firm;
  const user = c.get('user') as schema.User;
  const id = c.req.param('id') as string;
  const db = getDb(c.env.DB);

  const rows = await db
    .select()
    .from(schema.appointments)
    .where(and(eq(schema.appointments.id, id), eq(schema.appointments.firmId, firm.id), isNull(schema.appointments.deletedAt)))
    .limit(1);

  const appt = rows[0];
  if (!appt) return c.json({ error: 'Not found', message: 'Appointment not found' }, 404);
  if (appt.caseId && !(await canUserSeeCaseId(db, firm, user, appt.caseId))) {
    return c.json({ error: 'Not found', message: 'Appointment not found' }, 404);
  }

  const attendeesRows = await db
    .select({ userId: schema.appointmentAttendees.userId })
    .from(schema.appointmentAttendees)
    .where(eq(schema.appointmentAttendees.appointmentId, id));

  return c.json({ ...appt, attendees: attendeesRows.map((r) => r.userId) });
});

// POST /api/v1/appointments
appointmentsRouter.post('/', enforceSubscriptionReadOnly, requirePermission('appointments.manage'), async (c) => {
  const firm = c.get('firm') as schema.Firm;
  const user = c.get('user') as schema.User;
  const body = await c.req.json().catch(() => ({}));

  const createSchema = z.object({
    title: z.string().min(1).max(300),
    type: z.string().default('client_meeting'),
    startsAt: z.string().min(1),
    endsAt: z.string().min(1),
    mode: z.enum(['in_person', 'phone', 'video']).default('in_person'),
    location: z.string().nullable().optional(),
    clientId: z.string().nullable().optional(),
    caseId: z.string().nullable().optional(),
    notes: z.string().nullable().optional(),
    reminderMinutesBefore: z.number().int().min(0).default(30),
    attendees: z.array(z.string()).optional(),
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
  const newAppt: typeof schema.appointments.$inferInsert = {
    id,
    firmId: firm.id,
    title: parse.data.title.trim(),
    type: normalizeApptType(parse.data.type),
    startsAt: parse.data.startsAt,
    endsAt: parse.data.endsAt,
    mode: parse.data.mode,
    location: parse.data.location ?? null,
    organiserUserId: user.id,
    clientId: parse.data.clientId ?? null,
    caseId: parse.data.caseId ?? null,
    status: 'scheduled',
    notes: parse.data.notes ?? null,
    reminderMinutesBefore: parse.data.reminderMinutesBefore,
    createdAt: nowIso,
    updatedAt: nowIso,
    deletedAt: null,
    createdBy: user.id,
    updatedBy: null,
  };

  const attendees = parse.data.attendees?.length ? parse.data.attendees : [user.id];
  const stmts: any[] = [db.insert(schema.appointments).values(newAppt)];
  for (const uid of attendees) {
    stmts.push(
      db.insert(schema.appointmentAttendees).values({
        id: crypto.randomUUID(),
        appointmentId: id,
        userId: uid,
        firmId: firm.id,
        createdAt: nowIso,
        updatedAt: nowIso,
      })
    );
  }
  if (newAppt.reminderMinutesBefore > 0) {
    stmts.push(
      db.insert(schema.reminders).values({
        id: crypto.randomUUID(),
        firmId: firm.id,
        userId: user.id,
        sourceType: 'appointment',
        sourceId: id,
        title: `Appointment: ${newAppt.title}`,
        description: `${newAppt.mode}${newAppt.location ? ` · ${newAppt.location}` : ''}`,
        dueAt: newAppt.startsAt,
        remindAt: computeRemindAtIso(newAppt.startsAt, newAppt.reminderMinutesBefore * 60 * 1000),
        channel: 'in_app',
        status: 'pending',
        dismissedAt: null,
        createdAt: nowIso,
        updatedAt: nowIso,
        createdBy: user.id,
        updatedBy: null,
        deletedAt: null,
      })
    );
  }
  stmts.push(
    db.insert(schema.auditLog).values(
      buildAuditEntry({
        firmId: firm.id,
        userId: user.id,
        userName: user.name,
        entity: 'Appointment',
        entityId: id,
        action: 'CREATE',
        newValue: { ...newAppt, attendees },
        now: nowIso,
      })
    )
  );

  await db.batch(stmts as any);
  return c.json({ ...newAppt, attendees, overlapWarning: false }, 201);
});

// PATCH /api/v1/appointments/:id
appointmentsRouter.patch('/:id', enforceSubscriptionReadOnly, requirePermission('appointments.manage'), async (c) => {
  const firm = c.get('firm') as schema.Firm;
  const user = c.get('user') as schema.User;
  const id = c.req.param('id') as string;
  const body = await c.req.json().catch(() => ({}));

  const updateSchema = z.object({
    title: z.string().min(1).max(300).optional(),
    type: z.string().optional(),
    startsAt: z.string().min(1).optional(),
    endsAt: z.string().min(1).optional(),
    mode: z.enum(['in_person', 'phone', 'video']).optional(),
    location: z.string().nullable().optional(),
    clientId: z.string().nullable().optional(),
    caseId: z.string().nullable().optional(),
    status: z.enum(['scheduled', 'completed', 'cancelled', 'no_show']).optional(),
    notes: z.string().nullable().optional(),
    reminderMinutesBefore: z.number().int().min(0).optional(),
    attendees: z.array(z.string()).optional(),
  });

  const parse = updateSchema.safeParse(body);
  if (!parse.success) {
    return c.json({ error: 'Validation failed', errors: parse.error.issues }, 400);
  }

  const db = getDb(c.env.DB);
  const rows = await db
    .select()
    .from(schema.appointments)
    .where(and(eq(schema.appointments.id, id), eq(schema.appointments.firmId, firm.id), isNull(schema.appointments.deletedAt)))
    .limit(1);

  const appt = rows[0];
  if (!appt) return c.json({ error: 'Not found', message: 'Appointment not found' }, 404);

  const nowIso = new Date().toISOString();
  const { attendees, type, ...rest } = parse.data;
  const updates: Record<string, any> = {
    ...rest,
    ...(type !== undefined ? { type: normalizeApptType(type) } : {}),
    updatedAt: nowIso,
    updatedBy: user.id,
  };
  const stmts: any[] = [
    db.update(schema.appointments).set(updates).where(and(eq(schema.appointments.id, id), eq(schema.appointments.firmId, firm.id))),
  ];

  if (attendees !== undefined) {
    stmts.push(db.delete(schema.appointmentAttendees).where(eq(schema.appointmentAttendees.appointmentId, id)));
    for (const uid of attendees) {
      stmts.push(
        db.insert(schema.appointmentAttendees).values({
          id: crypto.randomUUID(),
          appointmentId: id,
          userId: uid,
          firmId: firm.id,
          createdAt: nowIso,
          updatedAt: nowIso,
        })
      );
    }
  }

  const nextStatus = updates.status ?? appt.status;
  const nextStartsAt = updates.startsAt ?? appt.startsAt;
  const nextMins = updates.reminderMinutesBefore ?? appt.reminderMinutesBefore;

  if (nextStatus !== 'scheduled' || nextMins <= 0) {
    stmts.push(
      buildDismissRemindersStmt(db, {
        firmId: firm.id,
        sourceId: id,
        updatedBy: user.id,
        nowIso,
      })
    );
  } else if (updates.startsAt !== undefined || updates.reminderMinutesBefore !== undefined || updates.status === 'scheduled') {
    const existingReminder = await db
      .select({ id: schema.reminders.id })
      .from(schema.reminders)
      .where(and(eq(schema.reminders.firmId, firm.id), eq(schema.reminders.sourceId, id), isNull(schema.reminders.deletedAt)))
      .limit(1);

    const newRemindAt = computeRemindAtIso(nextStartsAt, nextMins * 60 * 1000);
    if (existingReminder.length > 0) {
      stmts.push(
        buildRescheduleRemindersStmt(db, {
          firmId: firm.id,
          sourceId: id,
          newDueAt: nextStartsAt,
          newRemindAt,
          updatedBy: user.id,
          nowIso,
        })
      );
    } else {
      const nextTitle = updates.title ?? appt.title;
      const nextMode = updates.mode ?? appt.mode;
      const nextLocation = updates.location !== undefined ? updates.location : appt.location;
      stmts.push(
        db.insert(schema.reminders).values({
          id: crypto.randomUUID(),
          firmId: firm.id,
          userId: appt.organiserUserId || user.id,
          sourceType: 'appointment',
          sourceId: id,
          title: `Appointment: ${nextTitle}`,
          description: `${nextMode}${nextLocation ? ` · ${nextLocation}` : ''}`,
          dueAt: nextStartsAt,
          remindAt: newRemindAt,
          channel: 'in_app',
          status: 'pending',
          dismissedAt: null,
          createdAt: nowIso,
          updatedAt: nowIso,
          createdBy: user.id,
          updatedBy: null,
          deletedAt: null,
        })
      );
    }
  }

  stmts.push(
    db.insert(schema.auditLog).values(
      buildAuditEntry({
        firmId: firm.id,
        userId: user.id,
        userName: user.name,
        entity: 'Appointment',
        entityId: id,
        action: 'UPDATE',
        oldValue: appt,
        newValue: parse.data,
        now: nowIso,
      })
    )
  );

  await db.batch(stmts as any);
  return c.json({ ...appt, ...updates, attendees: attendees ?? [] });
});

// DELETE /api/v1/appointments/:id
appointmentsRouter.delete('/:id', enforceSubscriptionReadOnly, requirePermission('appointments.manage'), async (c) => {
  const firm = c.get('firm') as schema.Firm;
  const user = c.get('user') as schema.User;
  const id = c.req.param('id') as string;
  const db = getDb(c.env.DB);

  const rows = await db
    .select()
    .from(schema.appointments)
    .where(and(eq(schema.appointments.id, id), eq(schema.appointments.firmId, firm.id), isNull(schema.appointments.deletedAt)))
    .limit(1);
  const appt = rows[0];
  if (!appt) return c.json({ error: 'Not found', message: 'Appointment not found' }, 404);

  const nowIso = new Date().toISOString();
  await db.batch([
    db
      .update(schema.appointments)
      .set({ deletedAt: nowIso, updatedAt: nowIso, updatedBy: user.id })
      .where(and(eq(schema.appointments.id, id), eq(schema.appointments.firmId, firm.id))),
    buildDismissRemindersStmt(db, {
      firmId: firm.id,
      sourceId: id,
      updatedBy: user.id,
      nowIso,
      softDelete: true,
    }),
    db.insert(schema.auditLog).values(
      buildAuditEntry({
        firmId: firm.id,
        userId: user.id,
        userName: user.name,
        entity: 'Appointment',
        entityId: id,
        action: 'DELETE',
        oldValue: { title: appt.title },
        now: nowIso,
      })
    ),
  ] as any);

  return c.json({ success: true, softDeleted: true });
});
