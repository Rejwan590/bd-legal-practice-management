import { Hono } from 'hono';
import { z } from 'zod';
import { Env, authMiddleware, enforceSubscriptionReadOnly, requirePermission } from '../middleware/auth';
import { getDb } from '../db/client';
import * as schema from '../db/schema';
import { eq, and, isNull, sql, asc } from 'drizzle-orm';

export const hearingsRouter = new Hono<{ Bindings: Env; Variables: any }>();

hearingsRouter.use('*', authMiddleware);

// GET /api/v1/hearings
hearingsRouter.get('/', requirePermission('cases.view'), async (c) => {
  const firmId = c.get('firmId');
  const caseId = c.req.query('caseId');
  const fromDate = c.req.query('fromDate');
  const toDate = c.req.query('toDate');

  const db = getDb(c.env.DB);
  const conditions = [eq(schema.hearings.firmId, firmId), isNull(schema.hearings.deletedAt)];

  if (caseId) conditions.push(eq(schema.hearings.caseId, caseId));
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
      caseNumber: schema.cases.caseNumber,
      clientName: schema.clients.name,
    })
    .from(schema.hearings)
    .innerJoin(schema.cases, eq(schema.hearings.caseId, schema.cases.id))
    .innerJoin(schema.clients, eq(schema.cases.clientId, schema.clients.id))
    .where(and(...conditions))
    .orderBy(asc(schema.hearings.scheduledAt));

  return c.json({ hearings: rows });
});

// POST /api/v1/hearings
hearingsRouter.post('/', enforceSubscriptionReadOnly, requirePermission('cases.edit'), async (c) => {
  const firmId = c.get('firmId');
  const user = c.get('user') as schema.User;
  const body = await c.req.json().catch(() => ({}));

  const hearingCreateSchema = z.object({
    caseId: z.string().min(1),
    scheduledAt: z.string().min(1),
    court: z.string().optional(),
    purpose: z.string().optional(),
    fixedFor: z.string().optional(),
    fixedForNote: z.string().optional(),
    appearingLawyerId: z.string().optional(),
  });

  const parse = hearingCreateSchema.safeParse(body);
  if (!parse.success) {
    return c.json({ error: 'Validation failed', errors: parse.error.issues }, 400);
  }

  const { caseId, scheduledAt, court, purpose, fixedFor, fixedForNote, appearingLawyerId } = parse.data;
  const db = getDb(c.env.DB);

  // Verify Case exists within Firm
  const caseRows = await db
    .select()
    .from(schema.cases)
    .where(and(eq(schema.cases.id, caseId), eq(schema.cases.firmId, firmId), isNull(schema.cases.deletedAt)))
    .limit(1);

  if (!caseRows[0]) {
    return c.json({ error: 'Not found', message: 'Case not found' }, 404);
  }

  const hearingId = crypto.randomUUID();
  const auditId = crypto.randomUUID();
  const now = new Date().toISOString();

  const newHearing = {
    id: hearingId,
    firmId,
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

  const auditEntry = {
    id: auditId,
    firmId,
    userId: user.id,
    userName: user.name,
    entity: 'Hearing',
    entityId: hearingId,
    action: 'CREATE',
    oldValue: null,
    newValue: newHearing,
    timestamp: now,
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
    createdBy: user.id,
    updatedBy: null,
  };

  const currentNext = caseRows[0].nextHearingAt;
  const updatedNext = !currentNext || scheduledAt < currentNext ? scheduledAt : currentNext;

  // Atomic batch commit
  await db.batch([
    db.insert(schema.hearings).values(newHearing),
    db.update(schema.cases)
      .set({ nextHearingAt: updatedNext, updatedAt: now })
      .where(and(eq(schema.cases.id, caseId), eq(schema.cases.firmId, firmId))),
    db.insert(schema.auditLog).values(auditEntry),
  ] as any);

  return c.json({ hearing: newHearing }, 201);
});

// POST /api/v1/hearings/:id/adjourn
hearingsRouter.post('/:id/adjourn', enforceSubscriptionReadOnly, requirePermission('cases.edit'), async (c) => {
  const firmId = c.get('firmId');
  const user = c.get('user') as schema.User;
  const hearingId = c.req.param('id') as string;
  const body = await c.req.json().catch(() => ({}));

  const adjournSchema = z.object({
    nextScheduledAt: z.string().min(1),
    reason: z.string().min(1),
    outcomeNote: z.string().optional(),
    nextFixedFor: z.string().optional(),
  });

  const parse = adjournSchema.safeParse(body);
  if (!parse.success) {
    return c.json({ error: 'Validation failed', errors: parse.error.issues }, 400);
  }

  const { nextScheduledAt, reason, outcomeNote, nextFixedFor } = parse.data;
  const db = getDb(c.env.DB);

  const existingHearing = await db
    .select()
    .from(schema.hearings)
    .where(and(eq(schema.hearings.id, hearingId), eq(schema.hearings.firmId, firmId), isNull(schema.hearings.deletedAt)))
    .limit(1);

  if (!existingHearing[0]) {
    return c.json({ error: 'Not found', message: 'Hearing not found' }, 404);
  }

  const oldHearing = existingHearing[0];
  const newHearingId = crypto.randomUUID();
  const historyId = crypto.randomUUID();
  const auditId = crypto.randomUUID();
  const now = new Date().toISOString();

  const newHearing = {
    id: newHearingId,
    firmId,
    caseId: oldHearing.caseId,
    scheduledAt: nextScheduledAt,
    court: oldHearing.court,
    purpose: oldHearing.purpose,
    status: 'scheduled' as const,
    fixedFor: nextFixedFor || oldHearing.fixedFor,
    fixedForNote: null,
    appearingLawyerId: null,
    outcomeNote: null,
    createdAt: now,
    updatedAt: now,
    createdBy: user.id,
    updatedBy: null,
    deletedAt: null,
  };

  const historyEntry = {
    id: historyId,
    firmId,
    hearingId: oldHearing.id,
    caseId: oldHearing.caseId,
    oldAt: oldHearing.scheduledAt,
    newAt: nextScheduledAt,
    reason,
    oldFixedFor: oldHearing.fixedFor,
    newFixedFor: nextFixedFor || oldHearing.fixedFor,
    changedBy: user.id,
    changedAt: now,
  };

  const auditEntry = {
    id: auditId,
    firmId,
    userId: user.id,
    userName: user.name,
    entity: 'Hearing',
    entityId: oldHearing.id,
    action: 'ADJOURN',
    oldValue: { status: oldHearing.status, scheduledAt: oldHearing.scheduledAt },
    newValue: { status: 'adjourned', nextScheduledAt, reason },
    timestamp: now,
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
    createdBy: user.id,
    updatedBy: null,
  };

  // Atomic 5-statement batch commit
  await db.batch([
    db.update(schema.hearings)
      .set({ status: 'adjourned', outcomeNote: outcomeNote || oldHearing.outcomeNote, updatedAt: now })
      .where(and(eq(schema.hearings.id, hearingId), eq(schema.hearings.firmId, firmId))),
    db.insert(schema.hearings).values(newHearing),
    db.insert(schema.hearingDateHistory).values(historyEntry),
    db.update(schema.cases)
      .set({ nextHearingAt: nextScheduledAt, updatedAt: now })
      .where(and(eq(schema.cases.id, oldHearing.caseId), eq(schema.cases.firmId, firmId))),
    db.insert(schema.auditLog).values(auditEntry),
  ] as any);

  return c.json({
    message: 'Hearing adjourned successfully',
    adjournedHearingId: oldHearing.id,
    newHearing,
  });
});
