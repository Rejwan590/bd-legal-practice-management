import { Hono } from 'hono';
import { z } from 'zod';
import { Env, authMiddleware, enforceSubscriptionReadOnly, requirePermission } from '../middleware/auth';
import { getDb } from '../db/client';
import * as schema from '../db/schema';
import { eq, and, isNull, sql, asc, desc, inArray } from 'drizzle-orm';
import { getVisibleCaseIds, canUserSeeCaseId } from '../utils/visibility';
import { buildAuditEntry } from '../utils/audit';
import {
  buildDismissRemindersStmt,
  buildRescheduleRemindersStmt,
  computeRemindAtIso,
} from '../utils/reminders';

export const hearingsRouter = new Hono<{ Bindings: Env; Variables: any }>();

hearingsRouter.use('*', authMiddleware);

// GET /api/v1/hearings
hearingsRouter.get('/', requirePermission('cases.view'), async (c) => {
  const firm = c.get('firm') as schema.Firm;
  const user = c.get('user') as schema.User;
  const caseId = c.req.query('caseId');
  const fromDate = c.req.query('fromDate');
  const toDate = c.req.query('toDate');
  const status = c.req.query('status');

  const db = getDb(c.env.DB);
  const visible = await getVisibleCaseIds(db, firm, user);
  if (visible !== 'ALL' && visible.length === 0) {
    return c.json([]);
  }

  const conditions = [eq(schema.hearings.firmId, firm.id), isNull(schema.hearings.deletedAt)];
  if (visible !== 'ALL') conditions.push(inArray(schema.hearings.caseId, visible));
  if (caseId) conditions.push(eq(schema.hearings.caseId, caseId));
  if (status && status.toLowerCase() !== 'all') {
    conditions.push(eq(schema.hearings.status, (status === 'completed' ? 'held' : status) as any));
  }
  if (fromDate) conditions.push(sql`${schema.hearings.scheduledAt} >= ${fromDate}`);
  if (toDate) conditions.push(sql`${schema.hearings.scheduledAt} <= ${toDate}`);

  const rows = await db
    .select({
      id: schema.hearings.id,
      firmId: schema.hearings.firmId,
      caseId: schema.hearings.caseId,
      scheduledAt: schema.hearings.scheduledAt,
      court: schema.hearings.court,
      purpose: schema.hearings.purpose,
      status: schema.hearings.status,
      outcomeNote: schema.hearings.outcomeNote,
      fixedFor: schema.hearings.fixedFor,
      fixedForNote: schema.hearings.fixedForNote,
      appearingLawyerId: schema.hearings.appearingLawyerId,
      createdAt: schema.hearings.createdAt,
      updatedAt: schema.hearings.updatedAt,
      caseNumber: schema.cases.caseNumber,
      clientName: schema.clients.name,
    })
    .from(schema.hearings)
    .innerJoin(schema.cases, eq(schema.hearings.caseId, schema.cases.id))
    .innerJoin(schema.clients, eq(schema.cases.clientId, schema.clients.id))
    .where(and(...conditions))
    .orderBy(asc(schema.hearings.scheduledAt));

  return c.json(rows);
});

// GET /api/v1/hearings/:id
hearingsRouter.get('/:id', requirePermission('cases.view'), async (c) => {
  const firm = c.get('firm') as schema.Firm;
  const user = c.get('user') as schema.User;
  const id = c.req.param('id') as string;
  const db = getDb(c.env.DB);

  const rows = await db
    .select()
    .from(schema.hearings)
    .where(and(eq(schema.hearings.id, id), eq(schema.hearings.firmId, firm.id), isNull(schema.hearings.deletedAt)))
    .limit(1);

  const hearing = rows[0];
  if (!hearing) return c.json({ error: 'Not found', message: 'Hearing not found' }, 404);
  if (!(await canUserSeeCaseId(db, firm, user, hearing.caseId))) {
    return c.json({ error: 'Not found', message: 'Hearing not found' }, 404);
  }
  return c.json(hearing);
});

// POST /api/v1/hearings
hearingsRouter.post('/', enforceSubscriptionReadOnly, requirePermission('cases.edit'), async (c) => {
  const firm = c.get('firm') as schema.Firm;
  const user = c.get('user') as schema.User;
  const body = await c.req.json().catch(() => ({}));

  const hearingCreateSchema = z.object({
    caseId: z.string().min(1),
    scheduledAt: z.string().min(1),
    court: z.string().optional(),
    purpose: z.string().nullable().optional(),
    fixedFor: z.string().nullable().optional(),
    fixedForNote: z.string().nullable().optional(),
    appearingLawyerId: z.string().nullable().optional(),
  });

  const parse = hearingCreateSchema.safeParse(body);
  if (!parse.success) {
    return c.json({ error: 'Validation failed', errors: parse.error.issues }, 400);
  }

  const { caseId, scheduledAt, court, purpose, fixedFor, fixedForNote, appearingLawyerId } = parse.data;
  const db = getDb(c.env.DB);

  if (!(await canUserSeeCaseId(db, firm, user, caseId))) {
    return c.json({ error: 'Not found', message: 'Case not found' }, 404);
  }

  const caseRows = await db
    .select()
    .from(schema.cases)
    .where(and(eq(schema.cases.id, caseId), eq(schema.cases.firmId, firm.id), isNull(schema.cases.deletedAt)))
    .limit(1);

  if (!caseRows[0]) {
    return c.json({ error: 'Not found', message: 'Case not found' }, 404);
  }

  const hearingId = crypto.randomUUID();
  const now = new Date().toISOString();

  const newHearing = {
    id: hearingId,
    firmId: firm.id,
    caseId,
    scheduledAt,
    court: court || caseRows[0].court,
    purpose: purpose || null,
    fixedFor: fixedFor || null,
    fixedForNote: fixedForNote || null,
    appearingLawyerId: appearingLawyerId || null,
    status: 'scheduled' as const,
    outcomeNote: null,
    createdAt: now,
    updatedAt: now,
    createdBy: user.id,
    updatedBy: null,
    deletedAt: null,
  };

  const currentNext = caseRows[0].nextHearingAt;
  const updatedNext = !currentNext || scheduledAt < currentNext ? scheduledAt : currentNext;

  await db.batch([
    db.insert(schema.hearings).values(newHearing),
    db
      .update(schema.cases)
      .set({ nextHearingAt: updatedNext, updatedAt: now })
      .where(and(eq(schema.cases.id, caseId), eq(schema.cases.firmId, firm.id))),
    db.insert(schema.auditLog).values(
      buildAuditEntry({
        firmId: firm.id,
        userId: user.id,
        userName: user.name,
        entity: 'Hearing',
        entityId: hearingId,
        action: 'CREATE',
        newValue: newHearing,
        now,
      })
    ),
  ] as any);

  return c.json(newHearing, 201);
});

// PATCH /api/v1/hearings/:id
hearingsRouter.patch('/:id', enforceSubscriptionReadOnly, requirePermission('cases.edit'), async (c) => {
  const firm = c.get('firm') as schema.Firm;
  const user = c.get('user') as schema.User;
  const id = c.req.param('id') as string;
  const body = await c.req.json().catch(() => ({}));

  const updateSchema = z.object({
    court: z.string().optional(),
    purpose: z.string().nullable().optional(),
    status: z.enum(['scheduled', 'held', 'completed', 'adjourned', 'cancelled']).optional(),
    outcomeNote: z.string().nullable().optional(),
    fixedFor: z.string().nullable().optional(),
    fixedForNote: z.string().nullable().optional(),
    appearingLawyerId: z.string().nullable().optional(),
  });

  const parse = updateSchema.safeParse(body);
  if (!parse.success) return c.json({ error: 'Validation failed', errors: parse.error.issues }, 400);

  const db = getDb(c.env.DB);
  const rows = await db
    .select()
    .from(schema.hearings)
    .where(and(eq(schema.hearings.id, id), eq(schema.hearings.firmId, firm.id), isNull(schema.hearings.deletedAt)))
    .limit(1);

  const existing = rows[0];
  if (!existing) return c.json({ error: 'Not found', message: 'Hearing not found' }, 404);
  if (!(await canUserSeeCaseId(db, firm, user, existing.caseId))) {
    return c.json({ error: 'Not found', message: 'Hearing not found' }, 404);
  }

  const now = new Date().toISOString();
  const { status: rawStatus, ...rest } = parse.data;
  const resolvedStatus = rawStatus === 'completed' ? 'held' : rawStatus;
  const updates = {
    ...rest,
    ...(resolvedStatus !== undefined ? { status: resolvedStatus as 'scheduled' | 'held' | 'adjourned' | 'cancelled' } : {}),
    updatedAt: now,
    updatedBy: user.id,
  };

  const patchStmts: any[] = [
    db.update(schema.hearings).set(updates).where(and(eq(schema.hearings.id, id), eq(schema.hearings.firmId, firm.id))),
    db.insert(schema.auditLog).values(
      buildAuditEntry({
        firmId: firm.id,
        userId: user.id,
        userName: user.name,
        entity: 'Hearing',
        entityId: id,
        action: 'UPDATE',
        oldValue: existing,
        newValue: updates,
        now,
      })
    ),
  ];
  if (resolvedStatus === 'cancelled' || resolvedStatus === 'held') {
    patchStmts.push(
      buildDismissRemindersStmt(db, {
        firmId: firm.id,
        sourceId: id,
        updatedBy: user.id,
        nowIso: now,
      })
    );
  }
  await db.batch(patchStmts as any);

  return c.json({ ...existing, ...updates });
});

// POST /api/v1/hearings/:id/reschedule
hearingsRouter.post('/:id/reschedule', enforceSubscriptionReadOnly, requirePermission('cases.edit'), async (c) => {
  const firm = c.get('firm') as schema.Firm;
  const user = c.get('user') as schema.User;
  const id = c.req.param('id') as string;
  const body = await c.req.json().catch(() => ({}));

  const parse = z
    .object({
      scheduledAt: z.string().min(1),
      reason: z.string().min(1),
      fixedFor: z.string().optional(),
      fixedForNote: z.string().nullable().optional(),
    })
    .safeParse(body);

  if (!parse.success) return c.json({ error: 'Validation failed', errors: parse.error.issues }, 400);

  const db = getDb(c.env.DB);
  const rows = await db
    .select()
    .from(schema.hearings)
    .where(and(eq(schema.hearings.id, id), eq(schema.hearings.firmId, firm.id), isNull(schema.hearings.deletedAt)))
    .limit(1);

  const existing = rows[0];
  if (!existing) return c.json({ error: 'Not found', message: 'Hearing not found' }, 404);
  if (!(await canUserSeeCaseId(db, firm, user, existing.caseId))) {
    return c.json({ error: 'Not found', message: 'Hearing not found' }, 404);
  }

  const now = new Date().toISOString();
  const nextFixedFor = parse.data.fixedFor ?? existing.fixedFor;
  const nextFixedForNote = parse.data.fixedForNote !== undefined ? parse.data.fixedForNote : existing.fixedForNote;

  const history = {
    id: crypto.randomUUID(),
    firmId: firm.id,
    hearingId: id,
    caseId: existing.caseId,
    oldAt: existing.scheduledAt,
    newAt: parse.data.scheduledAt,
    reason: parse.data.reason,
    oldFixedFor: existing.fixedFor,
    newFixedFor: nextFixedFor,
    changedBy: user.id,
    changedAt: now,
  };

  const updatedHearing = {
    ...existing,
    scheduledAt: parse.data.scheduledAt,
    fixedFor: nextFixedFor,
    fixedForNote: nextFixedForNote,
    updatedAt: now,
    updatedBy: user.id,
  };

  await db.batch([
    db
      .update(schema.hearings)
      .set({
        scheduledAt: parse.data.scheduledAt,
        fixedFor: nextFixedFor,
        fixedForNote: nextFixedForNote,
        updatedAt: now,
        updatedBy: user.id,
      })
      .where(and(eq(schema.hearings.id, id), eq(schema.hearings.firmId, firm.id))),
    db.insert(schema.hearingDateHistory).values(history),
    db
      .update(schema.cases)
      .set({ nextHearingAt: parse.data.scheduledAt, updatedAt: now })
      .where(and(eq(schema.cases.id, existing.caseId), eq(schema.cases.firmId, firm.id))),
    buildRescheduleRemindersStmt(db, {
      firmId: firm.id,
      sourceId: id,
      newDueAt: parse.data.scheduledAt,
      newRemindAt: computeRemindAtIso(parse.data.scheduledAt, 24 * 60 * 60 * 1000),
      updatedBy: user.id,
      nowIso: now,
    }),
    db.insert(schema.auditLog).values(
      buildAuditEntry({
        firmId: firm.id,
        userId: user.id,
        userName: user.name,
        entity: 'Hearing',
        entityId: id,
        action: 'RESCHEDULE',
        oldValue: { scheduledAt: existing.scheduledAt },
        newValue: { scheduledAt: parse.data.scheduledAt, reason: parse.data.reason },
        now,
      })
    ),
  ] as any);

  return c.json({ hearing: updatedHearing, history });
});

// POST /api/v1/hearings/:id/adjourn
hearingsRouter.post('/:id/adjourn', enforceSubscriptionReadOnly, requirePermission('cases.edit'), async (c) => {
  const firm = c.get('firm') as schema.Firm;
  const user = c.get('user') as schema.User;
  const hearingId = c.req.param('id') as string;
  const body = await c.req.json().catch(() => ({}));

  const adjournSchema = z
    .object({
      nextDate: z.string().min(1).optional(),
      nextScheduledAt: z.string().min(1).optional(),
      reason: z.string().min(1),
      outcomeNote: z.string().nullable().optional(),
      nextPurpose: z.string().nullable().optional(),
      nextFixedFor: z.string().nullable().optional(),
      nextFixedForNote: z.string().nullable().optional(),
    })
    .refine((d) => Boolean(d.nextDate || d.nextScheduledAt), {
      message: 'nextDate or nextScheduledAt is required',
    });

  const parse = adjournSchema.safeParse(body);
  if (!parse.success) {
    return c.json({ error: 'Validation failed', errors: parse.error.issues }, 400);
  }

  const nextScheduledAt = (parse.data.nextDate || parse.data.nextScheduledAt)!;
  const db = getDb(c.env.DB);

  const existingRows = await db
    .select()
    .from(schema.hearings)
    .where(and(eq(schema.hearings.id, hearingId), eq(schema.hearings.firmId, firm.id), isNull(schema.hearings.deletedAt)))
    .limit(1);

  const oldHearing = existingRows[0];
  if (!oldHearing) {
    return c.json({ error: 'Not found', message: 'Hearing not found' }, 404);
  }
  if (!(await canUserSeeCaseId(db, firm, user, oldHearing.caseId))) {
    return c.json({ error: 'Not found', message: 'Hearing not found' }, 404);
  }

  const now = new Date().toISOString();
  const nextHearingId = crypto.randomUUID();
  const resolvedOutcomeNote = parse.data.outcomeNote ?? oldHearing.outcomeNote;
  const nextFixedFor = parse.data.nextFixedFor ?? oldHearing.fixedFor;

  const adjournedHearing = {
    ...oldHearing,
    status: 'adjourned' as const,
    outcomeNote: resolvedOutcomeNote,
    updatedAt: now,
    updatedBy: user.id,
  };

  const nextHearing = {
    id: nextHearingId,
    firmId: firm.id,
    caseId: oldHearing.caseId,
    scheduledAt: nextScheduledAt,
    court: oldHearing.court,
    purpose: parse.data.nextPurpose ?? oldHearing.purpose,
    status: 'scheduled' as const,
    fixedFor: nextFixedFor,
    fixedForNote: parse.data.nextFixedForNote ?? null,
    appearingLawyerId: oldHearing.appearingLawyerId,
    outcomeNote: null,
    createdAt: now,
    updatedAt: now,
    createdBy: user.id,
    updatedBy: null,
    deletedAt: null,
  };

  const history = {
    id: crypto.randomUUID(),
    firmId: firm.id,
    hearingId: oldHearing.id,
    caseId: oldHearing.caseId,
    oldAt: oldHearing.scheduledAt,
    newAt: nextScheduledAt,
    reason: parse.data.reason,
    oldFixedFor: oldHearing.fixedFor,
    newFixedFor: nextFixedFor,
    changedBy: user.id,
    changedAt: now,
  };

  await db.batch([
    db
      .update(schema.hearings)
      .set({ status: 'adjourned', outcomeNote: resolvedOutcomeNote, updatedAt: now, updatedBy: user.id })
      .where(and(eq(schema.hearings.id, hearingId), eq(schema.hearings.firmId, firm.id))),
    db.insert(schema.hearings).values(nextHearing),
    db.insert(schema.hearingDateHistory).values(history),
    db
      .update(schema.cases)
      .set({ nextHearingAt: nextScheduledAt, updatedAt: now })
      .where(and(eq(schema.cases.id, oldHearing.caseId), eq(schema.cases.firmId, firm.id))),
    buildRescheduleRemindersStmt(db, {
      firmId: firm.id,
      sourceId: hearingId,
      newDueAt: nextScheduledAt,
      newRemindAt: computeRemindAtIso(nextScheduledAt, 24 * 60 * 60 * 1000),
      updatedBy: user.id,
      nowIso: now,
    }),
    db.insert(schema.auditLog).values(
      buildAuditEntry({
        firmId: firm.id,
        userId: user.id,
        userName: user.name,
        entity: 'Hearing',
        entityId: oldHearing.id,
        action: 'ADJOURN',
        oldValue: { status: oldHearing.status, scheduledAt: oldHearing.scheduledAt },
        newValue: { status: 'adjourned', nextScheduledAt, reason: parse.data.reason },
        now,
      })
    ),
  ] as any);

  return c.json({
    adjournedHearing,
    nextHearing,
    history,
  });
});

// GET /api/v1/hearings/:id/history
hearingsRouter.get('/:id/history', requirePermission('cases.view'), async (c) => {
  const firm = c.get('firm') as schema.Firm;
  const user = c.get('user') as schema.User;
  const id = c.req.param('id') as string;
  const db = getDb(c.env.DB);

  const rows = await db
    .select()
    .from(schema.hearings)
    .where(and(eq(schema.hearings.id, id), eq(schema.hearings.firmId, firm.id), isNull(schema.hearings.deletedAt)))
    .limit(1);
  if (!rows[0]) return c.json({ error: 'Not found', message: 'Hearing not found' }, 404);
  if (!(await canUserSeeCaseId(db, firm, user, rows[0].caseId))) {
    return c.json({ error: 'Not found', message: 'Hearing not found' }, 404);
  }

  const historyRows = await db
    .select()
    .from(schema.hearingDateHistory)
    .where(and(eq(schema.hearingDateHistory.firmId, firm.id), eq(schema.hearingDateHistory.hearingId, id)))
    .orderBy(desc(schema.hearingDateHistory.changedAt));

  return c.json(historyRows);
});

// POST /api/v1/hearings/bulk-status
hearingsRouter.post('/bulk-status', enforceSubscriptionReadOnly, requirePermission('cases.edit'), async (c) => {
  const firm = c.get('firm') as schema.Firm;
  const user = c.get('user') as schema.User;
  const body = await c.req.json().catch(() => ({}));
  const parse = z
    .object({
      hearingIds: z.array(z.string().min(1)).min(1).max(100),
      status: z.enum(['scheduled', 'held', 'completed', 'adjourned', 'cancelled']),
      outcomeNote: z.string().nullable().optional(),
    })
    .safeParse(body);

  if (!parse.success) return c.json({ error: 'Validation failed', errors: parse.error.issues }, 400);

  const targetStatus = (parse.data.status === 'completed' ? 'held' : parse.data.status) as
    | 'scheduled'
    | 'held'
    | 'adjourned'
    | 'cancelled';

  const db = getDb(c.env.DB);
  const [targetRows, visible] = await Promise.all([
    db
      .select()
      .from(schema.hearings)
      .where(and(eq(schema.hearings.firmId, firm.id), inArray(schema.hearings.id, parse.data.hearingIds), isNull(schema.hearings.deletedAt))),
    getVisibleCaseIds(db, firm, user),
  ]);

  const authorized = targetRows.filter((h) => visible === 'ALL' || visible.includes(h.caseId));
  if (authorized.length === 0) return c.json({ updatedCount: 0 });

  const now = new Date().toISOString();
  const stmts: any[] = [];
  for (const h of authorized) {
    stmts.push(
      db
        .update(schema.hearings)
        .set({
          status: targetStatus,
          outcomeNote: parse.data.outcomeNote !== undefined ? parse.data.outcomeNote : h.outcomeNote,
          updatedAt: now,
          updatedBy: user.id,
        })
        .where(and(eq(schema.hearings.id, h.id), eq(schema.hearings.firmId, firm.id)))
    );
    stmts.push(
      db.insert(schema.auditLog).values(
        buildAuditEntry({
          firmId: firm.id,
          userId: user.id,
          userName: user.name,
          entity: 'Hearing',
          entityId: h.id,
          action: 'UPDATE',
          oldValue: { status: h.status },
          newValue: { status: targetStatus, bulk: true },
          now,
        })
      )
    );
    if (targetStatus === 'cancelled' || targetStatus === 'held') {
      stmts.push(
        buildDismissRemindersStmt(db, {
          firmId: firm.id,
          sourceId: h.id,
          updatedBy: user.id,
          nowIso: now,
        })
      );
    }
  }

  await db.batch(stmts as any);
  return c.json({ updatedCount: authorized.length });
});

// POST /api/v1/hearings/bulk-adjourn
hearingsRouter.post('/bulk-adjourn', enforceSubscriptionReadOnly, requirePermission('cases.edit'), async (c) => {
  const firm = c.get('firm') as schema.Firm;
  const user = c.get('user') as schema.User;
  const body = await c.req.json().catch(() => ({}));
  const parse = z
    .object({
      items: z
        .array(
          z.object({
            hearingId: z.string().min(1),
            nextDate: z.string().min(1),
            reason: z.string().min(1),
            nextFixedFor: z.string().optional(),
            outcomeNote: z.string().nullable().optional(),
          })
        )
        .min(1)
        .max(50),
    })
    .safeParse(body);

  if (!parse.success) return c.json({ error: 'Validation failed', errors: parse.error.issues }, 400);

  const db = getDb(c.env.DB);
  const ids = parse.data.items.map((i) => i.hearingId);
  const [targetRows, visible] = await Promise.all([
    db
      .select()
      .from(schema.hearings)
      .where(and(eq(schema.hearings.firmId, firm.id), inArray(schema.hearings.id, ids), isNull(schema.hearings.deletedAt))),
    getVisibleCaseIds(db, firm, user),
  ]);

  const byId = new Map(targetRows.filter((h) => visible === 'ALL' || visible.includes(h.caseId)).map((h) => [h.id, h]));
  const now = new Date().toISOString();
  const stmts: any[] = [];
  let adjournedCount = 0;

  for (const item of parse.data.items) {
    const oldH = byId.get(item.hearingId);
    if (!oldH) continue;
    adjournedCount++;
    const nextFixedFor = item.nextFixedFor ?? oldH.fixedFor;
    const newId = crypto.randomUUID();
    stmts.push(
      db
        .update(schema.hearings)
        .set({ status: 'adjourned', outcomeNote: item.outcomeNote ?? oldH.outcomeNote, updatedAt: now, updatedBy: user.id })
        .where(and(eq(schema.hearings.id, oldH.id), eq(schema.hearings.firmId, firm.id))),
      db.insert(schema.hearings).values({
        id: newId,
        firmId: firm.id,
        caseId: oldH.caseId,
        scheduledAt: item.nextDate,
        court: oldH.court,
        purpose: oldH.purpose,
        status: 'scheduled',
        fixedFor: nextFixedFor,
        fixedForNote: null,
        appearingLawyerId: oldH.appearingLawyerId,
        outcomeNote: null,
        createdAt: now,
        updatedAt: now,
        createdBy: user.id,
        updatedBy: null,
        deletedAt: null,
      }),
      db.insert(schema.hearingDateHistory).values({
        id: crypto.randomUUID(),
        firmId: firm.id,
        hearingId: oldH.id,
        caseId: oldH.caseId,
        oldAt: oldH.scheduledAt,
        newAt: item.nextDate,
        reason: item.reason,
        oldFixedFor: oldH.fixedFor,
        newFixedFor: nextFixedFor,
        changedBy: user.id,
        changedAt: now,
      }),
      db
        .update(schema.cases)
        .set({ nextHearingAt: item.nextDate, updatedAt: now })
        .where(and(eq(schema.cases.id, oldH.caseId), eq(schema.cases.firmId, firm.id))),
      buildRescheduleRemindersStmt(db, {
        firmId: firm.id,
        sourceId: oldH.id,
        newDueAt: item.nextDate,
        newRemindAt: computeRemindAtIso(item.nextDate, 24 * 60 * 60 * 1000),
        updatedBy: user.id,
        nowIso: now,
      }),
      db.insert(schema.auditLog).values(
        buildAuditEntry({
          firmId: firm.id,
          userId: user.id,
          userName: user.name,
          entity: 'Hearing',
          entityId: oldH.id,
          action: 'ADJOURN',
          oldValue: { scheduledAt: oldH.scheduledAt },
          newValue: { nextScheduledAt: item.nextDate, reason: item.reason, bulk: true },
          now,
        })
      )
    );
  }

  if (stmts.length > 0) await db.batch(stmts as any);
  return c.json({ adjournedCount });
});

// POST /api/v1/hearings/bulk-reschedule
hearingsRouter.post('/bulk-reschedule', enforceSubscriptionReadOnly, requirePermission('cases.edit'), async (c) => {
  const firm = c.get('firm') as schema.Firm;
  const user = c.get('user') as schema.User;
  const body = await c.req.json().catch(() => ({}));
  const parse = z
    .object({
      items: z
        .array(
          z.object({
            hearingId: z.string().min(1),
            newDate: z.string().min(1),
            reason: z.string().min(1),
          })
        )
        .min(1)
        .max(50),
    })
    .safeParse(body);

  if (!parse.success) return c.json({ error: 'Validation failed', errors: parse.error.issues }, 400);

  const db = getDb(c.env.DB);
  const ids = parse.data.items.map((i) => i.hearingId);
  const [targetRows, visible] = await Promise.all([
    db
      .select()
      .from(schema.hearings)
      .where(and(eq(schema.hearings.firmId, firm.id), inArray(schema.hearings.id, ids), isNull(schema.hearings.deletedAt))),
    getVisibleCaseIds(db, firm, user),
  ]);

  const byId = new Map(targetRows.filter((h) => visible === 'ALL' || visible.includes(h.caseId)).map((h) => [h.id, h]));
  const now = new Date().toISOString();
  const stmts: any[] = [];
  let rescheduledCount = 0;

  for (const item of parse.data.items) {
    const oldH = byId.get(item.hearingId);
    if (!oldH) continue;
    rescheduledCount++;
    stmts.push(
      db
        .update(schema.hearings)
        .set({ scheduledAt: item.newDate, updatedAt: now, updatedBy: user.id })
        .where(and(eq(schema.hearings.id, oldH.id), eq(schema.hearings.firmId, firm.id))),
      db.insert(schema.hearingDateHistory).values({
        id: crypto.randomUUID(),
        firmId: firm.id,
        hearingId: oldH.id,
        caseId: oldH.caseId,
        oldAt: oldH.scheduledAt,
        newAt: item.newDate,
        reason: item.reason,
        oldFixedFor: oldH.fixedFor,
        newFixedFor: oldH.fixedFor,
        changedBy: user.id,
        changedAt: now,
      }),
      db
        .update(schema.cases)
        .set({ nextHearingAt: item.newDate, updatedAt: now })
        .where(and(eq(schema.cases.id, oldH.caseId), eq(schema.cases.firmId, firm.id))),
      buildRescheduleRemindersStmt(db, {
        firmId: firm.id,
        sourceId: oldH.id,
        newDueAt: item.newDate,
        newRemindAt: computeRemindAtIso(item.newDate, 24 * 60 * 60 * 1000),
        updatedBy: user.id,
        nowIso: now,
      }),
      db.insert(schema.auditLog).values(
        buildAuditEntry({
          firmId: firm.id,
          userId: user.id,
          userName: user.name,
          entity: 'Hearing',
          entityId: oldH.id,
          action: 'RESCHEDULE',
          oldValue: { scheduledAt: oldH.scheduledAt },
          newValue: { scheduledAt: item.newDate, reason: item.reason, bulk: true },
          now,
        })
      )
    );
  }

  if (stmts.length > 0) await db.batch(stmts as any);
  return c.json({ rescheduledCount });
});
