import { Router, Response } from 'express';
import { z } from 'zod';
import { authMiddleware, AuthenticatedRequest } from '../middleware/auth.js';
import { enforceFirmIsolation } from '../middleware/firmIsolation.js';
import { getDatabase } from '../db/client.js';

export const calendarRouter = Router();

calendarRouter.use(authMiddleware);
calendarRouter.use(enforceFirmIsolation);

const DHAKA_OFFSET_MS = 6 * 60 * 60 * 1000;

function getDhakaDateString(input: Date | string = new Date()): string {
  const d = typeof input === 'string' ? new Date(input) : input;
  if (isNaN(d.getTime())) return '';
  return new Date(d.getTime() + DHAKA_OFFSET_MS).toISOString().slice(0, 10);
}

const calendarQuerySchema = z.object({
  startIso: z.string().refine((v) => !isNaN(Date.parse(v)), { message: 'Invalid startIso' }).optional(),
  endIso: z.string().refine((v) => !isNaN(Date.parse(v)), { message: 'Invalid endIso' }).optional(),
  fromDate: z.string().refine((v) => !isNaN(Date.parse(v)), { message: 'Invalid fromDate' }).optional(),
  toDate: z.string().refine((v) => !isNaN(Date.parse(v)), { message: 'Invalid toDate' }).optional(),
  type: z.enum(['all', 'hearing', 'task', 'file_return', 'appointment']).optional(),
});

const causeListQuerySchema = z.object({
  date: z.string().optional(),
});

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

function hasPerm(user: NonNullable<AuthenticatedRequest['user']>, key: string): boolean {
  if (user.role === 'Owner') return true;
  return Boolean(user.permissions?.includes('*') || user.permissions?.includes(key));
}

// GET /api/v1/calendar
calendarRouter.get('/', async (req: AuthenticatedRequest, res: Response) => {
  const parsed = calendarQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    return res.status(400).json({ error: 'ValidationError', details: parsed.error.issues });
  }

  const db = getDatabase();
  const user = req.user!;
  const firmId = user.firmId;
  const type = parsed.data.type || 'all';
  const startIso = parsed.data.startIso || parsed.data.fromDate;
  const endIso = parsed.data.endIso || parsed.data.toDate;

  const canCases = hasPerm(user, 'cases.view');
  const canClients = hasPerm(user, 'clients.view');
  const canTasks = hasPerm(user, 'tasks.view');
  const canFiles = hasPerm(user, 'files.view');
  const canAppts = hasPerm(user, 'appointments.view');
  const canUsers = true;

  const [visibleCases, clients, hearings, taskRes, files, apptRes, users] = await Promise.all([
    db.listCases(firmId, { user: req.user, includeRestricted: true }),
    canClients ? db.listClients(firmId) : Promise.resolve([]),
    canCases && (type === 'all' || type === 'hearing')
      ? db.listHearings(firmId, {}, user)
      : Promise.resolve([]),
    canTasks && (type === 'all' || type === 'task')
      ? db.listTasks(firmId, { limit: 10000 }, user)
      : Promise.resolve({ tasks: [], total: 0 }),
    canFiles && (type === 'all' || type === 'file_return')
      ? db.listPhysicalFiles(firmId, {}, user)
      : Promise.resolve([]),
    canAppts && (type === 'all' || type === 'appointment')
      ? db.listAppointments(firmId, { limit: 10000, user })
      : Promise.resolve({ appointments: [], total: 0 }),
    canUsers ? db.listUsers(firmId) : Promise.resolve([]),
  ]);
  const tasks = taskRes.tasks;
  const appointments = apptRes.appointments;

  const visibleCaseIds = new Set(visibleCases.map((c) => c.id));
  const caseMap = new Map(visibleCases.map((c) => [c.id, c]));
  const clientMap = new Map(clients.map((cl) => [cl.id, cl]));
  const userMap = new Map(users.map((u) => [u.id, u]));

  const events: CalendarEventItem[] = [];
  const nowMs = Date.now();

  // 1. Hearings
  for (const h of hearings) {
    if (h.deletedAt || !visibleCaseIds.has(h.caseId)) continue;
    const caseRec = caseMap.get(h.caseId);
    const clientRec = caseRec ? clientMap.get(caseRec.clientId) : undefined;
    const dateStr = h.scheduledAt instanceof Date ? h.scheduledAt.toISOString() : String(h.scheduledAt);
    const label = h.purpose || h.fixedFor || 'Hearing';
    events.push({
      id: `cal-hearing-${h.id}`,
      title: caseRec ? `${caseRec.caseNumber} - ${label}` : label,
      date: dateStr,
      type: 'hearing',
      sourceId: h.id,
      caseId: h.caseId,
      caseNumber: caseRec?.caseNumber,
      court: caseRec?.court,
      clientId: caseRec?.clientId ?? null,
      clientName: clientRec?.name,
      status: h.status,
      restricted: Boolean(caseRec?.restricted),
      fixedFor: h.fixedFor || undefined,
      fixedForNote: h.fixedForNote || undefined,
    });
  }

  // 2. Tasks
  const hasTasksAssign = hasPerm(user, 'tasks.assign');
  for (const t of tasks) {
    if (t.deletedAt) continue;
    if (user.role === 'Staff' && !hasTasksAssign && t.assignedTo !== user.id) continue;
    if (t.caseId && !visibleCaseIds.has(t.caseId)) continue;
    const caseRec = t.caseId ? caseMap.get(t.caseId) : undefined;
    const clientRec = t.clientId ? clientMap.get(t.clientId) : undefined;
    const assignee = userMap.get(t.assignedTo);
    const dateStr = t.dueAt instanceof Date ? t.dueAt.toISOString() : String(t.dueAt);
    const isOverdue =
      t.status !== 'completed' &&
      t.status !== 'cancelled' &&
      new Date(dateStr).getTime() < nowMs;
    events.push({
      id: `cal-task-${t.id}`,
      title: t.title,
      date: dateStr,
      type: 'task',
      sourceId: t.id,
      caseId: t.caseId,
      caseNumber: caseRec?.caseNumber,
      clientId: t.clientId,
      clientName: clientRec?.name,
      assigneeId: t.assignedTo,
      assigneeName: assignee?.name,
      status: t.status,
      priority: t.priority,
      isOverdue,
      restricted: caseRec?.restricted,
    });
  }

  // 3. Physical File Return Deadlines
  for (const f of files) {
    if (f.deletedAt || (f.status !== 'checked_out' && f.status !== 'in_court') || !f.dueBackAt) continue;
    if (f.caseId && !visibleCaseIds.has(f.caseId)) continue;
    const caseRec = f.caseId ? caseMap.get(f.caseId) : undefined;
    const clientRec = f.clientId ? clientMap.get(f.clientId) : undefined;
    const dateStr = f.dueBackAt instanceof Date ? f.dueBackAt.toISOString() : String(f.dueBackAt);
    events.push({
      id: `cal-file-${f.id}`,
      title: `Return: ${f.serial} (${f.title})`,
      date: dateStr,
      type: 'file_return',
      sourceId: f.id,
      caseId: f.caseId,
      caseNumber: caseRec?.caseNumber,
      clientId: f.clientId,
      clientName: clientRec?.name,
      assigneeId: f.currentHolderId,
      assigneeName: f.currentHolderName || (f.currentHolderId ? userMap.get(f.currentHolderId)?.name : undefined),
      status: f.status,
      shelfLocation: f.shelfLocation || undefined,
      isOverdue: new Date(dateStr).getTime() < nowMs,
      restricted: caseRec?.restricted,
    });
  }

  // 4. Appointments
  for (const a of appointments) {
    if (a.deletedAt) continue;
    if (a.caseId && !visibleCaseIds.has(a.caseId)) continue;
    const caseRec = a.caseId ? caseMap.get(a.caseId) : undefined;
    const clientRec = a.clientId ? clientMap.get(a.clientId) : undefined;
    const organiser = userMap.get(a.organiserUserId);
    const dateStr = a.startsAt instanceof Date ? a.startsAt.toISOString() : String(a.startsAt);
    events.push({
      id: `cal-appt-${a.id}`,
      title: a.title,
      date: dateStr,
      type: 'appointment',
      sourceId: a.id,
      caseId: a.caseId,
      caseNumber: caseRec?.caseNumber,
      clientId: a.clientId,
      clientName: clientRec?.name,
      assigneeId: a.organiserUserId,
      assigneeName: organiser?.name,
      status: a.status,
      restricted: caseRec?.restricted,
    });
  }

  // Date window filtering & chronological sort
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
  return res.json(result);
});

// GET /api/v1/calendar/cause-list
calendarRouter.get('/cause-list', async (req: AuthenticatedRequest, res: Response) => {
  const parsed = causeListQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    return res.status(400).json({ error: 'ValidationError', details: parsed.error.issues });
  }

  const rawDate = parsed.data.date;
  let targetDay = getDhakaDateString(new Date());
  if (rawDate) {
    if (/^\d{4}-\d{2}-\d{2}$/.test(rawDate)) {
      targetDay = rawDate;
    } else if (!isNaN(Date.parse(rawDate))) {
      targetDay = getDhakaDateString(rawDate);
    } else {
      return res.status(400).json({ error: 'ValidationError', message: 'Invalid date parameter' });
    }
  }

  const db = getDatabase();
  const user = req.user!;
  const firmId = user.firmId;
  const canCases = hasPerm(user, 'cases.view');
  const canClients = hasPerm(user, 'clients.view');

  const [firm, visibleCases, clients, hearings] = await Promise.all([
    db.getFirm(firmId),
    db.listCases(firmId, { user: req.user, includeRestricted: true }),
    canClients ? db.listClients(firmId) : Promise.resolve([]),
    canCases ? db.listHearings(firmId, {}, user) : Promise.resolve([]),
  ]);

  const visibleCaseIds = new Set(visibleCases.map((c) => c.id));
  const caseMap = new Map(visibleCases.map((c) => [c.id, c]));
  const clientMap = new Map(clients.map((cl) => [cl.id, cl]));

  const dayHearings: CalendarEventItem[] = hearings
    .filter((h) => {
      if (h.deletedAt || !visibleCaseIds.has(h.caseId)) return false;
      const iso = h.scheduledAt instanceof Date ? h.scheduledAt.toISOString() : String(h.scheduledAt);
      return getDhakaDateString(iso) === targetDay;
    })
    .map((h) => {
      const caseRec = caseMap.get(h.caseId);
      const clientRec = caseRec ? clientMap.get(caseRec.clientId) : undefined;
      const iso = h.scheduledAt instanceof Date ? h.scheduledAt.toISOString() : String(h.scheduledAt);
      const label = h.purpose || h.fixedFor || 'Hearing';
      return {
        id: `cal-hearing-${h.id}`,
        title: caseRec ? `${caseRec.caseNumber} - ${label}` : label,
        date: iso,
        type: 'hearing' as const,
        sourceId: h.id,
        caseId: h.caseId,
        caseNumber: caseRec?.caseNumber,
        court: caseRec?.court,
        clientId: caseRec?.clientId ?? null,
        clientName: clientRec?.name,
        status: h.status,
        restricted: Boolean(caseRec?.restricted),
        fixedFor: h.fixedFor || undefined,
        fixedForNote: h.fixedForNote || undefined,
      };
    })
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

  return res.json({
    date: targetDay,
    hearings: dayHearings,
    firmName: firm?.name || 'Rahman & Associates Chambers',
  });
});
