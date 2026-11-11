import { Hono } from 'hono';
import { z } from 'zod';
import { Env, authMiddleware, enforceSubscriptionReadOnly, requirePermission, requireOwner } from '../middleware/auth';
import { getDb } from '../db/client';
import * as schema from '../db/schema';
import { eq, and, isNull, sql, asc, desc, inArray } from 'drizzle-orm';
import { getVisibleCaseIds, canUserSeeCaseId } from '../utils/visibility';
import { buildAuditEntry } from '../utils/audit';

export const casesRouter = new Hono<{ Bindings: Env; Variables: any }>();

casesRouter.use('*', authMiddleware);

// GET /api/v1/cases/check-duplicate
casesRouter.get('/check-duplicate', requirePermission('cases.view'), async (c) => {
  const firmId = c.get('firmId') as string;
  const caseNumber = c.req.query('caseNumber')?.trim();
  const court = c.req.query('court')?.trim();
  const excludeId = c.req.query('excludeId')?.trim();

  if (!caseNumber || !court) {
    return c.json({ error: 'caseNumber and court parameters are required' }, 400);
  }

  const db = getDb(c.env.DB);
  const rows = await db
    .select({ id: schema.cases.id })
    .from(schema.cases)
    .where(
      and(
        eq(schema.cases.firmId, firmId),
        isNull(schema.cases.deletedAt),
        sql`LOWER(TRIM(${schema.cases.caseNumber})) = LOWER(${caseNumber})`,
        sql`LOWER(TRIM(${schema.cases.court})) = LOWER(${court})`
      )
    );

  const isDuplicate = rows.some((r) => r.id !== excludeId);
  return c.json({ isDuplicate });
});

// GET /api/v1/cases
casesRouter.get('/', requirePermission('cases.view'), async (c) => {
  const firm = c.get('firm') as schema.Firm;
  const user = c.get('user') as schema.User;
  const status = c.req.query('status');
  const court = c.req.query('court');
  const matterType = c.req.query('matterType');
  const scope = c.req.query('scope');
  const sortBy = c.req.query('sortBy');
  const sortOrder = c.req.query('sortOrder');
  const clientId = c.req.query('clientId');
  const responsibleLawyerId = c.req.query('responsibleLawyerId');
  const search = (c.req.query('search') || c.req.query('q'))?.trim();
  const limit = Math.min(parseInt(c.req.query('limit') || '200', 10), 500);
  const offset = parseInt(c.req.query('offset') || '0', 10);

  const db = getDb(c.env.DB);
  const visible = await getVisibleCaseIds(db, firm, user);

  if (visible !== 'ALL' && visible.length === 0) {
    return c.json([]);
  }

  const conditions = [eq(schema.cases.firmId, firm.id), isNull(schema.cases.deletedAt)];
  if (visible !== 'ALL') {
    conditions.push(inArray(schema.cases.id, visible));
  }
  if (status && status.toLowerCase() !== 'all') {
    conditions.push(eq(schema.cases.status, status as any));
  }
  if (court && court.toLowerCase() !== 'all') {
    conditions.push(eq(schema.cases.court, court));
  }
  if (matterType && matterType.toLowerCase() !== 'all') {
    conditions.push(eq(schema.cases.matterType, matterType));
  }
  if (scope === 'my') {
    conditions.push(eq(schema.cases.responsibleLawyerId, user.id));
  }
  if (clientId) {
    conditions.push(eq(schema.cases.clientId, clientId));
  }
  if (responsibleLawyerId) {
    conditions.push(eq(schema.cases.responsibleLawyerId, responsibleLawyerId));
  }
  if (search) {
    const q = `%${search}%`;
    conditions.push(
      sql`(${schema.cases.caseNumber} LIKE ${q} COLLATE NOCASE OR ${schema.cases.court} LIKE ${q} COLLATE NOCASE OR COALESCE(${schema.cases.matterType}, '') LIKE ${q} COLLATE NOCASE OR COALESCE(${schema.cases.plaintiff}, '') LIKE ${q} COLLATE NOCASE OR COALESCE(${schema.cases.defendant}, '') LIKE ${q} COLLATE NOCASE)`
    );
  }

  const sortCol =
    sortBy === 'updated_at'
      ? schema.cases.updatedAt
      : sortBy === 'case_date'
        ? schema.cases.caseDate
        : schema.cases.createdAt;
  const orderExpr = sortOrder === 'asc' ? asc(sortCol) : desc(sortCol);

  const rows = await db
    .select()
    .from(schema.cases)
    .where(and(...conditions))
    .limit(limit)
    .offset(offset)
    .orderBy(orderExpr);

  return c.json(rows);
});

// GET /api/v1/cases/:id
casesRouter.get('/:id', requirePermission('cases.view'), async (c) => {
  const firm = c.get('firm') as schema.Firm;
  const user = c.get('user') as schema.User;
  const id = c.req.param('id') as string;
  const db = getDb(c.env.DB);

  if (!(await canUserSeeCaseId(db, firm, user, id))) {
    return c.json({ error: 'Not found', message: 'Case not found or access restricted' }, 404);
  }

  const rows = await db
    .select()
    .from(schema.cases)
    .where(and(eq(schema.cases.id, id), eq(schema.cases.firmId, firm.id), isNull(schema.cases.deletedAt)))
    .limit(1);

  if (!rows[0]) {
    return c.json({ error: 'Not found', message: 'Case not found' }, 404);
  }

  return c.json(rows[0]);
});

// POST /api/v1/cases
casesRouter.post('/', enforceSubscriptionReadOnly, requirePermission('cases.create'), async (c) => {
  const firm = c.get('firm') as schema.Firm;
  const user = c.get('user') as schema.User;
  const body = await c.req.json().catch(() => ({}));

  const caseCreateSchema = z.object({
    clientId: z.string().min(1),
    caseNumber: z.string().min(1),
    court: z.string().min(1),
    matterType: z.string().min(1),
    fileSerial: z.string().nullable().optional(),
    description: z.string().nullable().optional(),
    plaintiff: z.string().nullable().optional(),
    defendant: z.string().nullable().optional(),
    ourRole: z.string().nullable().optional(),
    responsibleLawyerId: z.string().optional(),
    status: z.enum(['ongoing', 'pending', 'closed']).default('ongoing'),
    caseCategory: z.enum(['civil', 'criminal_gr', 'criminal_cr', 'other']).default('civil'),
    caseDate: z.string().optional(),
    closedOn: z.string().nullable().optional(),
    partyARole: z.string().nullable().optional(),
    partyBRole: z.string().nullable().optional(),
    policeStation: z.string().nullable().optional(),
    sectionsOfLaw: z.string().nullable().optional(),
    restricted: z.boolean().optional().default(false),
    nextHearingAt: z.string().nullable().optional(),
  });

  const parse = caseCreateSchema.safeParse(body);
  if (!parse.success) {
    return c.json({ error: 'Validation failed', errors: parse.error.issues }, 400);
  }

  const db = getDb(c.env.DB);
  const clientRows = await db
    .select({ id: schema.clients.id })
    .from(schema.clients)
    .where(and(eq(schema.clients.id, parse.data.clientId), eq(schema.clients.firmId, firm.id), isNull(schema.clients.deletedAt)))
    .limit(1);

  if (!clientRows[0]) {
    return c.json({ error: 'Client not found or does not belong to this chamber' }, 400);
  }

  const perms = Array.isArray(user.permissions) ? user.permissions : [];
  if (parse.data.restricted && user.role !== 'Owner' && !perms.includes('restricted.view') && !perms.includes('*')) {
    return c.json({ error: 'Forbidden', message: 'You lack permission to create restricted cases' }, 403);
  }

  const caseId = crypto.randomUUID();
  const now = new Date().toISOString();

  const newCaseData = {
    id: caseId,
    firmId: firm.id,
    clientId: parse.data.clientId,
    caseNumber: parse.data.caseNumber.trim(),
    court: parse.data.court.trim(),
    matterType: parse.data.matterType.trim(),
    fileSerial: parse.data.fileSerial ?? null,
    description: parse.data.description ?? null,
    plaintiff: parse.data.plaintiff ?? null,
    defendant: parse.data.defendant ?? null,
    ourRole: parse.data.ourRole ?? null,
    responsibleLawyerId: parse.data.responsibleLawyerId || user.id,
    status: parse.data.status,
    caseCategory: parse.data.caseCategory,
    caseDate: parse.data.caseDate || now,
    closedOn: parse.data.closedOn ?? null,
    partyARole: parse.data.partyARole ?? null,
    partyBRole: parse.data.partyBRole ?? null,
    policeStation: parse.data.policeStation ?? null,
    sectionsOfLaw: parse.data.sectionsOfLaw ?? null,
    restricted: parse.data.restricted,
    nextHearingAt: parse.data.nextHearingAt ?? null,
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
    createdBy: user.id,
    updatedBy: null,
  };

  await db.batch([
    db.insert(schema.cases).values(newCaseData),
    db.insert(schema.auditLog).values(
      buildAuditEntry({
        firmId: firm.id,
        userId: user.id,
        userName: user.name,
        entity: 'Case',
        entityId: caseId,
        action: 'CREATE',
        newValue: newCaseData,
        now,
      })
    ),
  ] as any);

  return c.json(newCaseData, 201);
});

// PATCH /api/v1/cases/:id
casesRouter.patch('/:id', enforceSubscriptionReadOnly, requirePermission('cases.edit'), async (c) => {
  const firm = c.get('firm') as schema.Firm;
  const user = c.get('user') as schema.User;
  const id = c.req.param('id') as string;
  const db = getDb(c.env.DB);

  if (!(await canUserSeeCaseId(db, firm, user, id))) {
    return c.json({ error: 'Not found', message: 'Case not found' }, 404);
  }

  const rows = await db
    .select()
    .from(schema.cases)
    .where(and(eq(schema.cases.id, id), eq(schema.cases.firmId, firm.id), isNull(schema.cases.deletedAt)))
    .limit(1);

  const existing = rows[0];
  if (!existing) return c.json({ error: 'Not found', message: 'Case not found' }, 404);

  const body = await c.req.json().catch(() => ({}));
  const updateSchema = z.object({
    clientId: z.string().min(1).optional(),
    caseNumber: z.string().min(1).optional(),
    court: z.string().min(1).optional(),
    matterType: z.string().min(1).optional(),
    fileSerial: z.string().nullable().optional(),
    description: z.string().nullable().optional(),
    plaintiff: z.string().nullable().optional(),
    defendant: z.string().nullable().optional(),
    ourRole: z.string().nullable().optional(),
    responsibleLawyerId: z.string().optional(),
    status: z.enum(['ongoing', 'pending', 'closed']).optional(),
    caseCategory: z.enum(['civil', 'criminal_gr', 'criminal_cr', 'other']).optional(),
    caseDate: z.string().optional(),
    closedOn: z.string().nullable().optional(),
    partyARole: z.string().nullable().optional(),
    partyBRole: z.string().nullable().optional(),
    policeStation: z.string().nullable().optional(),
    sectionsOfLaw: z.string().nullable().optional(),
    restricted: z.boolean().optional(),
    nextHearingAt: z.string().nullable().optional(),
  });

  const parse = updateSchema.safeParse(body);
  if (!parse.success) {
    return c.json({ error: 'Validation failed', errors: parse.error.issues }, 400);
  }

  const now = new Date().toISOString();
  const updates: Record<string, any> = { ...parse.data, updatedAt: now, updatedBy: user.id };

  await db.batch([
    db.update(schema.cases).set(updates).where(and(eq(schema.cases.id, id), eq(schema.cases.firmId, firm.id))),
    db.insert(schema.auditLog).values(
      buildAuditEntry({
        firmId: firm.id,
        userId: user.id,
        userName: user.name,
        entity: 'Case',
        entityId: id,
        action: 'UPDATE',
        oldValue: existing,
        newValue: updates,
        now,
      })
    ),
  ] as any);

  return c.json({ ...existing, ...updates });
});

// DELETE /api/v1/cases/:id
casesRouter.delete('/:id', enforceSubscriptionReadOnly, requireOwner, async (c) => {
  const firm = c.get('firm') as schema.Firm;
  const user = c.get('user') as schema.User;
  const id = c.req.param('id') as string;
  const db = getDb(c.env.DB);

  const rows = await db
    .select()
    .from(schema.cases)
    .where(and(eq(schema.cases.id, id), eq(schema.cases.firmId, firm.id), isNull(schema.cases.deletedAt)))
    .limit(1);

  const existing = rows[0];
  if (!existing) return c.json({ error: 'Not found', message: 'Case not found' }, 404);

  const now = new Date().toISOString();
  await db.batch([
    db
      .update(schema.cases)
      .set({ deletedAt: now, updatedAt: now, updatedBy: user.id })
      .where(and(eq(schema.cases.id, id), eq(schema.cases.firmId, firm.id))),
    db.insert(schema.auditLog).values(
      buildAuditEntry({
        firmId: firm.id,
        userId: user.id,
        userName: user.name,
        entity: 'Case',
        entityId: id,
        action: 'DELETE',
        oldValue: { caseNumber: existing.caseNumber, court: existing.court },
        now,
      })
    ),
  ] as any);

  return c.json({ success: true, softDeleted: true });
});

// GET /api/v1/cases/:id/counts
casesRouter.get('/:id/counts', requirePermission('cases.view'), async (c) => {
  const firm = c.get('firm') as schema.Firm;
  const user = c.get('user') as schema.User;
  const id = c.req.param('id') as string;
  const db = getDb(c.env.DB);

  if (!(await canUserSeeCaseId(db, firm, user, id))) {
    return c.json({ error: 'Not found', message: 'Case not found' }, 404);
  }

  const [hearingsRows, tasksRows, notesRows, agreementsRows, paymentsRows] = await Promise.all([
    db.select({ id: schema.hearings.id }).from(schema.hearings).where(and(eq(schema.hearings.firmId, firm.id), eq(schema.hearings.caseId, id), isNull(schema.hearings.deletedAt))),
    db.select({ status: schema.tasks.status }).from(schema.tasks).where(and(eq(schema.tasks.firmId, firm.id), eq(schema.tasks.caseId, id), isNull(schema.tasks.deletedAt))),
    db.select({ id: schema.caseNotes.id }).from(schema.caseNotes).where(and(eq(schema.caseNotes.firmId, firm.id), eq(schema.caseNotes.caseId, id), isNull(schema.caseNotes.deletedAt))),
    db.select({ id: schema.feeAgreements.id }).from(schema.feeAgreements).where(and(eq(schema.feeAgreements.firmId, firm.id), eq(schema.feeAgreements.caseId, id), isNull(schema.feeAgreements.deletedAt))),
    db.select({ id: schema.feePayments.id }).from(schema.feePayments).where(and(eq(schema.feePayments.firmId, firm.id), eq(schema.feePayments.caseId, id), isNull(schema.feePayments.deletedAt))),
  ]);

  return c.json({
    hearingsCount: hearingsRows.length,
    tasksCount: tasksRows.length,
    activeTasksCount: tasksRows.filter((t) => t.status !== 'completed' && t.status !== 'cancelled').length,
    notesCount: notesRows.length,
    filesCount: 0,
    agreementsCount: agreementsRows.length,
    paymentsCount: paymentsRows.length,
  });
});

// Case Shares: GET / POST / DELETE
casesRouter.get('/:id/shares', requirePermission('cases.view'), async (c) => {
  const firm = c.get('firm') as schema.Firm;
  const user = c.get('user') as schema.User;
  const id = c.req.param('id') as string;
  const db = getDb(c.env.DB);

  if (!(await canUserSeeCaseId(db, firm, user, id))) {
    return c.json({ error: 'Not found', message: 'Case not found' }, 404);
  }

  const shares = await db
    .select()
    .from(schema.caseShares)
    .where(and(eq(schema.caseShares.firmId, firm.id), eq(schema.caseShares.caseId, id), isNull(schema.caseShares.deletedAt)));

  return c.json(shares);
});

casesRouter.post('/:id/shares', enforceSubscriptionReadOnly, requirePermission('cases.edit'), async (c) => {
  const firm = c.get('firm') as schema.Firm;
  const user = c.get('user') as schema.User;
  const caseId = c.req.param('id') as string;
  const body = await c.req.json().catch(() => ({}));
  const parse = z.object({ userId: z.string().min(1) }).safeParse(body);
  if (!parse.success) return c.json({ error: 'userId is required' }, 400);

  const db = getDb(c.env.DB);
  if (!(await canUserSeeCaseId(db, firm, user, caseId))) {
    return c.json({ error: 'Not found', message: 'Case not found' }, 404);
  }

  const now = new Date().toISOString();
  const share = {
    id: crypto.randomUUID(),
    firmId: firm.id,
    caseId,
    userId: parse.data.userId,
    createdBy: user.id,
    createdAt: now,
    deletedAt: null,
  };

  await db.batch([
    db.insert(schema.caseShares).values(share),
    db.insert(schema.auditLog).values(
      buildAuditEntry({
        firmId: firm.id,
        userId: user.id,
        userName: user.name,
        entity: 'CaseShare',
        entityId: share.id,
        action: 'CREATE',
        newValue: { caseId, userId: parse.data.userId },
        now,
      })
    ),
  ] as any);

  return c.json(share, 201);
});

casesRouter.delete('/:id/shares/:shareOrUserId', enforceSubscriptionReadOnly, requirePermission('cases.edit'), async (c) => {
  const firm = c.get('firm') as schema.Firm;
  const user = c.get('user') as schema.User;
  const caseId = c.req.param('id') as string;
  const target = c.req.param('shareOrUserId') as string;
  const db = getDb(c.env.DB);

  const shares = await db
    .select()
    .from(schema.caseShares)
    .where(and(eq(schema.caseShares.firmId, firm.id), eq(schema.caseShares.caseId, caseId), isNull(schema.caseShares.deletedAt)));

  const match = shares.find((s) => s.id === target || s.userId === target);
  if (!match) return c.json({ error: 'Share not found' }, 404);

  const now = new Date().toISOString();
  await db.batch([
    db.update(schema.caseShares).set({ deletedAt: now }).where(eq(schema.caseShares.id, match.id)),
    db.insert(schema.auditLog).values(
      buildAuditEntry({
        firmId: firm.id,
        userId: user.id,
        userName: user.name,
        entity: 'CaseShare',
        entityId: match.id,
        action: 'DELETE',
        oldValue: { caseId, userId: match.userId },
        now,
      })
    ),
  ] as any);

  return c.json({ success: true });
});

// Case Notes: GET / POST / PATCH / DELETE
casesRouter.get('/:id/notes', requirePermission('cases.view'), async (c) => {
  const firm = c.get('firm') as schema.Firm;
  const user = c.get('user') as schema.User;
  const caseId = c.req.param('id') as string;
  const limit = Math.min(100, parseInt(c.req.query('limit') || '50', 10));
  const offset = parseInt(c.req.query('offset') || '0', 10);
  const db = getDb(c.env.DB);

  if (!(await canUserSeeCaseId(db, firm, user, caseId))) {
    return c.json({ error: 'Not found', message: 'Case not found' }, 404);
  }

  const allNotes = await db
    .select()
    .from(schema.caseNotes)
    .where(and(eq(schema.caseNotes.firmId, firm.id), eq(schema.caseNotes.caseId, caseId), isNull(schema.caseNotes.deletedAt)))
    .orderBy(desc(schema.caseNotes.createdAt));

  return c.json({
    notes: allNotes.slice(offset, offset + limit),
    total: allNotes.length,
  });
});

casesRouter.post('/:id/notes', enforceSubscriptionReadOnly, requirePermission('cases.edit'), async (c) => {
  const firm = c.get('firm') as schema.Firm;
  const user = c.get('user') as schema.User;
  const caseId = c.req.param('id') as string;
  const rawBody = await c.req.json().catch(() => ({}));
  const parse = z
    .object({
      body: z.string().min(1).max(5000).optional(),
      noteText: z.string().min(1).max(5000).optional(),
      noteDate: z.string().optional(),
    })
    .refine((d) => Boolean(d.body || d.noteText), { message: 'Note body is required' })
    .safeParse(rawBody);
  if (!parse.success) return c.json({ error: 'Validation failed', errors: parse.error.issues }, 400);

  const db = getDb(c.env.DB);
  if (!(await canUserSeeCaseId(db, firm, user, caseId))) {
    return c.json({ error: 'Not found', message: 'Case not found' }, 404);
  }

  const now = new Date().toISOString();
  const note = {
    id: crypto.randomUUID(),
    firmId: firm.id,
    caseId,
    noteDate: parse.data.noteDate || now.slice(0, 10),
    body: (parse.data.body || parse.data.noteText)!.trim(),
    createdBy: user.id,
    updatedBy: user.id,
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
  };

  await db.batch([
    db.insert(schema.caseNotes).values(note),
    db.insert(schema.auditLog).values(
      buildAuditEntry({
        firmId: firm.id,
        userId: user.id,
        userName: user.name,
        entity: 'CaseNote',
        entityId: note.id,
        action: 'CREATE',
        newValue: { caseId },
        now,
      })
    ),
  ] as any);

  return c.json(note, 201);
});

casesRouter.patch('/:id/notes/:noteId', enforceSubscriptionReadOnly, requirePermission('cases.edit'), async (c) => {
  const firm = c.get('firm') as schema.Firm;
  const user = c.get('user') as schema.User;
  const caseId = c.req.param('id') as string;
  const noteId = c.req.param('noteId') as string;
  const rawBody = await c.req.json().catch(() => ({}));
  const parse = z
    .object({
      body: z.string().min(1).max(5000).optional(),
      noteText: z.string().min(1).max(5000).optional(),
      noteDate: z.string().optional(),
    })
    .refine((d) => Boolean(d.body || d.noteText || d.noteDate), { message: 'Note update payload required' })
    .safeParse(rawBody);
  if (!parse.success) return c.json({ error: 'Validation failed', errors: parse.error.issues }, 400);

  const db = getDb(c.env.DB);
  if (!(await canUserSeeCaseId(db, firm, user, caseId))) {
    return c.json({ error: 'Not found', message: 'Case not found' }, 404);
  }

  const rows = await db
    .select()
    .from(schema.caseNotes)
    .where(and(eq(schema.caseNotes.id, noteId), eq(schema.caseNotes.caseId, caseId), eq(schema.caseNotes.firmId, firm.id), isNull(schema.caseNotes.deletedAt)))
    .limit(1);
  if (!rows[0]) return c.json({ error: 'Not found', message: 'Note not found' }, 404);

  const now = new Date().toISOString();
  const nextBody = parse.data.body || parse.data.noteText;
  const updates: Record<string, any> = { updatedAt: now, updatedBy: user.id };
  if (nextBody) updates.body = nextBody.trim();
  if (parse.data.noteDate) updates.noteDate = parse.data.noteDate;

  await db.update(schema.caseNotes).set(updates).where(eq(schema.caseNotes.id, noteId));

  return c.json({ ...rows[0], ...updates });
});

casesRouter.delete('/:id/notes/:noteId', enforceSubscriptionReadOnly, requirePermission('cases.edit'), async (c) => {
  const firm = c.get('firm') as schema.Firm;
  const user = c.get('user') as schema.User;
  const caseId = c.req.param('id') as string;
  const noteId = c.req.param('noteId') as string;
  const db = getDb(c.env.DB);

  if (!(await canUserSeeCaseId(db, firm, user, caseId))) {
    return c.json({ error: 'Not found', message: 'Case not found' }, 404);
  }

  const rows = await db
    .select({ id: schema.caseNotes.id })
    .from(schema.caseNotes)
    .where(and(eq(schema.caseNotes.id, noteId), eq(schema.caseNotes.caseId, caseId), eq(schema.caseNotes.firmId, firm.id), isNull(schema.caseNotes.deletedAt)))
    .limit(1);
  if (!rows[0]) return c.json({ error: 'Not found', message: 'Note not found' }, 404);

  const now = new Date().toISOString();
  await db.update(schema.caseNotes).set({ deletedAt: now, updatedAt: now }).where(eq(schema.caseNotes.id, noteId));
  return c.json({ success: true, softDeleted: true });
});
