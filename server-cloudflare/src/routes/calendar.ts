import { Hono } from 'hono';
import { z } from 'zod';
import { and, eq, isNull } from 'drizzle-orm';
import { Env, authMiddleware } from '../middleware/auth';
import { getDb } from '../db/client';
import * as schema from '../db/schema';
import { getVisibleCaseIds } from '../utils/visibility';

export const calendarRouter = new Hono<{ Bindings: Env; Variables: any }>();

calendarRouter.use('*', authMiddleware);

const DHAKA_OFFSET_MS = 6 * 60 * 60 * 1000;

function getDhakaDateString(input: Date | string = new Date()): string {
  const d = typeof input === 'string' ? new Date(input) : input;
  if (isNaN(d.getTime())) return '';
  return new Date(d.getTime() + DHAKA_OFFSET_MS).toISOString().slice(0, 10);
}

function hasPerm(user: schema.User, key: string): boolean {
  if (user.role === 'Owner') return true;
  const perms = (Array.isArray(user.permissions) ? user.permissions : []) as string[];
  return perms.includes('*') || perms.includes(key);
}

export interface CalendarEventItem {
  id: string;
  title: string;
  date: string;
  type: 'hearing' | 'task' | 'file_return' | 'appointment';
  sourceId: string;
  caseId?: string | null;
  caseNumber?: string;
  court?: string;
  clientId?: string | null;
  clientName?: string;
  assigneeId?: string | null;
  assigneeName?: string;
  status?: string;
  priority?: string;
  shelfLocation?: string;
  isOverdue?: boolean;
  restricted?: boolean;
  fixedFor?: string;
  fixedForNote?: string;
}

// GET /api/v1/calendar
calendarRouter.get('/', async (c) => {
  const parse = z
    .object({
      startIso: z.string().refine((v) => !isNaN(Date.parse(v)), { message: 'Invalid startIso' }).optional(),
      endIso: z.string().refine((v) => !isNaN(Date.parse(v)), { message: 'Invalid endIso' }).optional(),
      fromDate: z.string().refine((v) => !isNaN(Date.parse(v)), { message: 'Invalid fromDate' }).optional(),
      toDate: z.string().refine((v) => !isNaN(Date.parse(v)), { message: 'Invalid toDate' }).optional(),
      type: z.enum(['all', 'hearing', 'task', 'file_return', 'appointment']).optional(),
    })
    .safeParse({
      startIso: c.req.query('startIso'),
      endIso: c.req.query('endIso'),
      fromDate: c.req.query('fromDate'),
      toDate: c.req.query('toDate'),
      type: c.req.query('type'),
    });

  if (!parse.success) {
    return c.json({ error: 'Validation failed', errors: parse.error.issues }, 400);
  }

  const firm = c.get('firm') as schema.Firm;
  const user = c.get('user') as schema.User;
  const db = getDb(c.env.DB);
  const type = parse.data.type || 'all';
  const startIso = parse.data.startIso || parse.data.fromDate;
  const endIso = parse.data.endIso || parse.data.toDate;

  const canCases = hasPerm(user, 'cases.view');
  const canTasks = hasPerm(user, 'tasks.view');
  const canFiles = hasPerm(user, 'files.view');
  const canAppts = hasPerm(user, 'appointments.view');

  const [visible, casesRows, clientsRows, usersRows, hearingsRows, tasksRows, filesRows, apptsRows] = await Promise.all([
    getVisibleCaseIds(db, firm, user),
    db.select().from(schema.cases).where(and(eq(schema.cases.firmId, firm.id), isNull(schema.cases.deletedAt))),
    db.select().from(schema.clients).where(and(eq(schema.clients.firmId, firm.id), isNull(schema.clients.deletedAt))),
    db.select({ id: schema.users.id, name: schema.users.name }).from(schema.users).where(eq(schema.users.firmId, firm.id)),
    canCases && (type === 'all' || type === 'hearing')
      ? db.select().from(schema.hearings).where(and(eq(schema.hearings.firmId, firm.id), isNull(schema.hearings.deletedAt)))
      : Promise.resolve([]),
    canTasks && (type === 'all' || type === 'task')
      ? db.select().from(schema.tasks).where(and(eq(schema.tasks.firmId, firm.id), isNull(schema.tasks.deletedAt)))
      : Promise.resolve([]),
    canFiles && (type === 'all' || type === 'file_return')
      ? db.select().from(schema.physicalFiles).where(and(eq(schema.physicalFiles.firmId, firm.id), isNull(schema.physicalFiles.deletedAt)))
      : Promise.resolve([]),
    canAppts && (type === 'all' || type === 'appointment')
      ? db.select().from(schema.appointments).where(and(eq(schema.appointments.firmId, firm.id), isNull(schema.appointments.deletedAt)))
      : Promise.resolve([]),
  ]);

  const isCaseVisible = (caseId?: string | null) => {
    if (!caseId) return true;
    if (visible === 'ALL') return true;
    return visible.includes(caseId);
  };

  const caseMap = new Map(casesRows.filter((cs) => isCaseVisible(cs.id)).map((cs) => [cs.id, cs]));
  const clientMap = new Map(clientsRows.map((cl) => [cl.id, cl]));
  const userMap = new Map(usersRows.map((u) => [u.id, u.name]));

  const events: CalendarEventItem[] = [];
  const nowMs = Date.now();

  // 1. Hearings
  for (const h of hearingsRows) {
    if (!isCaseVisible(h.caseId)) continue;
    const caseRec = caseMap.get(h.caseId);
    if (!caseRec) continue;
    const clientRec = clientMap.get(caseRec.clientId);
    events.push({
      id: `cal-hearing-${h.id}`,
      title: `${caseRec.caseNumber} - ${h.purpose}`,
      date: h.scheduledAt,
      type: 'hearing',
      sourceId: h.id,
      caseId: h.caseId,
      caseNumber: caseRec.caseNumber,
      court: caseRec.court,
      clientId: caseRec.clientId,
      clientName: clientRec?.name,
      status: h.status,
      restricted: Boolean(caseRec.restricted),
      fixedFor: h.fixedFor || undefined,
      fixedForNote: h.fixedForNote || undefined,
    });
  }

  // 2. Tasks
  const hasTasksAssign = hasPerm(user, 'tasks.assign');
  for (const t of tasksRows) {
    if (user.role === 'Staff' && !hasTasksAssign && t.assignedTo !== user.id) continue;
    if (t.caseId && !isCaseVisible(t.caseId)) continue;
    const caseRec = t.caseId ? caseMap.get(t.caseId) : undefined;
    const clientRec = t.clientId ? clientMap.get(t.clientId) : undefined;
    const isOverdue = t.status !== 'completed' && t.status !== 'cancelled' && new Date(t.dueAt).getTime() < nowMs;
    events.push({
      id: `cal-task-${t.id}`,
      title: t.title,
      date: t.dueAt,
      type: 'task',
      sourceId: t.id,
      caseId: t.caseId,
      caseNumber: caseRec?.caseNumber,
      clientId: t.clientId,
      clientName: clientRec?.name,
      assigneeId: t.assignedTo,
      assigneeName: userMap.get(t.assignedTo),
      status: t.status,
      priority: t.priority,
      isOverdue,
      restricted: caseRec ? Boolean(caseRec.restricted) : undefined,
    });
  }

  // 3. Physical file returns
  for (const f of filesRows) {
    if ((f.status !== 'checked_out' && f.status !== 'in_court') || !f.dueBackAt) continue;
    if (f.caseId && !isCaseVisible(f.caseId)) continue;
    const caseRec = f.caseId ? caseMap.get(f.caseId) : undefined;
    const clientRec = f.clientId ? clientMap.get(f.clientId) : undefined;
    events.push({
      id: `cal-file-${f.id}`,
      title: `Return: ${f.serial} (${f.title})`,
      date: f.dueBackAt,
      type: 'file_return',
      sourceId: f.id,
      caseId: f.caseId,
      caseNumber: caseRec?.caseNumber,
      clientId: f.clientId,
      clientName: clientRec?.name,
      assigneeId: f.currentHolderId,
      assigneeName: f.currentHolderId ? userMap.get(f.currentHolderId) : undefined,
      status: f.status,
      shelfLocation: f.shelfLocation || undefined,
      isOverdue: new Date(f.dueBackAt).getTime() < nowMs,
      restricted: caseRec ? Boolean(caseRec.restricted) : undefined,
    });
  }

  // 4. Appointments
  for (const a of apptsRows) {
    if (a.caseId && !isCaseVisible(a.caseId)) continue;
    const caseRec = a.caseId ? caseMap.get(a.caseId) : undefined;
    const clientRec = a.clientId ? clientMap.get(a.clientId) : undefined;
    events.push({
      id: `cal-appt-${a.id}`,
      title: a.title,
      date: a.startsAt,
      type: 'appointment',
      sourceId: a.id,
      caseId: a.caseId,
      caseNumber: caseRec?.caseNumber,
      clientId: a.clientId,
      clientName: clientRec?.name,
      assigneeId: a.organiserUserId,
      assigneeName: userMap.get(a.organiserUserId),
      status: a.status,
      restricted: caseRec ? Boolean(caseRec.restricted) : undefined,
    });
  }

  let result = events;
  if (startIso) {
    const startMs = new Date(startIso).getTime();
    result = result.filter((e) => new Date(e.date).getTime() >= startMs);
  }
  if (endIso) {
    const endMs = new Date(endIso).getTime();
    result = result.filter((e) => new Date(e.date).getTime() <= endMs);
  }

  result.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  return c.json(result);
});

// GET /api/v1/calendar/cause-list
calendarRouter.get('/cause-list', async (c) => {
  const rawDate = c.req.query('date');
  let targetDay = getDhakaDateString(new Date());
  if (rawDate) {
    if (/^\d{4}-\d{2}-\d{2}$/.test(rawDate)) {
      targetDay = rawDate;
    } else if (!isNaN(Date.parse(rawDate))) {
      targetDay = getDhakaDateString(rawDate);
    } else {
      return c.json({ error: 'Validation failed', message: 'Invalid date parameter' }, 400);
    }
  }

  const firm = c.get('firm') as schema.Firm;
  const user = c.get('user') as schema.User;
  const db = getDb(c.env.DB);

  const canCases = hasPerm(user, 'cases.view');
  const [visible, casesRows, clientsRows, hearingsRows] = await Promise.all([
    getVisibleCaseIds(db, firm, user),
    db.select().from(schema.cases).where(and(eq(schema.cases.firmId, firm.id), isNull(schema.cases.deletedAt))),
    db.select().from(schema.clients).where(and(eq(schema.clients.firmId, firm.id), isNull(schema.clients.deletedAt))),
    canCases
      ? db.select().from(schema.hearings).where(and(eq(schema.hearings.firmId, firm.id), isNull(schema.hearings.deletedAt)))
      : Promise.resolve([]),
  ]);

  const isCaseVisible = (caseId: string) => visible === 'ALL' || visible.includes(caseId);
  const caseMap = new Map(casesRows.filter((cs) => isCaseVisible(cs.id)).map((cs) => [cs.id, cs]));
  const clientMap = new Map(clientsRows.map((cl) => [cl.id, cl]));

  const dayHearings: CalendarEventItem[] = hearingsRows
    .filter((h) => isCaseVisible(h.caseId) && getDhakaDateString(h.scheduledAt) === targetDay)
    .map((h) => {
      const caseRec = caseMap.get(h.caseId);
      const clientRec = caseRec ? clientMap.get(caseRec.clientId) : undefined;
      return {
        id: `cal-hearing-${h.id}`,
        title: caseRec ? `${caseRec.caseNumber} - ${h.purpose}` : h.purpose,
        date: h.scheduledAt,
        type: 'hearing' as const,
        sourceId: h.id,
        caseId: h.caseId,
        caseNumber: caseRec?.caseNumber,
        court: caseRec?.court,
        clientId: caseRec?.clientId ?? null,
        clientName: clientRec?.name,
        status: h.status,
        restricted: caseRec ? Boolean(caseRec.restricted) : undefined,
        fixedFor: h.fixedFor || undefined,
        fixedForNote: h.fixedForNote || undefined,
      };
    })
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

  return c.json({
    date: targetDay,
    hearings: dayHearings,
    firmName: firm.name || 'Rahman & Associates Chambers',
  });
});
