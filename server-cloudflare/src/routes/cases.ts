import { Hono } from 'hono';
import { z } from 'zod';
import { Env, authMiddleware, enforceSubscriptionReadOnly, requirePermission } from '../middleware/auth';
import { getDb } from '../db/client';
import * as schema from '../db/schema';
import { eq, and, isNull, sql, desc, or, inArray } from 'drizzle-orm';

export const casesRouter = new Hono<{ Bindings: Env; Variables: any }>();

casesRouter.use('*', authMiddleware);

/**
 * Hard Invariant: Central Visibility Rule (`canUserSeeCase`)
 */
async function getVisibleCaseIds(db: any, firmId: string, user: schema.User): Promise<string[] | 'ALL'> {
  if (user.role === 'Owner') {
    return 'ALL';
  }

  const perms = (Array.isArray(user.permissions) ? user.permissions : []) as string[];
  if (perms.includes('cases.view_all') || perms.includes('*')) {
    return 'ALL';
  }

  // Find users who report to this user (reporting chain hierarchy)
  const subordinates = await db
    .select({ id: schema.users.id })
    .from(schema.users)
    .where(and(eq(schema.users.firmId, firmId), eq(schema.users.reportsToUserId, user.id), isNull(schema.users.deletedAt)));

  const allowedLawyerIds = [user.id, ...subordinates.map((s: any) => s.id)];

  // Find explicitly shared cases
  const shares = await db
    .select({ caseId: schema.caseShares.caseId })
    .from(schema.caseShares)
    .where(and(eq(schema.caseShares.firmId, firmId), eq(schema.caseShares.userId, user.id), isNull(schema.caseShares.deletedAt)));

  const sharedCaseIds = shares.map((s: any) => s.caseId);

  // Query matching cases
  const visibleCases = await db
    .select({ id: schema.cases.id })
    .from(schema.cases)
    .where(
      and(
        eq(schema.cases.firmId, firmId),
        isNull(schema.cases.deletedAt),
        or(
          inArray(schema.cases.responsibleLawyerId, allowedLawyerIds),
          sharedCaseIds.length > 0 ? inArray(schema.cases.id, sharedCaseIds) : sql`0=1`
        )
      )
    );

  return visibleCases.map((c: any) => c.id);
}

// GET /api/v1/cases
casesRouter.get('/', requirePermission('cases.view'), async (c) => {
  const firmId = c.get('firmId');
  const user = c.get('user') as schema.User;
  const status = c.req.query('status');
  const clientId = c.req.query('clientId');
  const search = c.req.query('q')?.trim();
  const limit = Math.min(parseInt(c.req.query('limit') || '50', 10), 100);
  const offset = parseInt(c.req.query('offset') || '0', 10);

  const db = getDb(c.env.DB);
  const visible = await getVisibleCaseIds(db, firmId, user);

  if (visible !== 'ALL' && visible.length === 0) {
    return c.json({ cases: [] });
  }

  const conditions = [eq(schema.cases.firmId, firmId), isNull(schema.cases.deletedAt)];
  if (visible !== 'ALL') {
    conditions.push(inArray(schema.cases.id, visible));
  }
  if (status) {
    conditions.push(eq(schema.cases.status, status as any));
  }
  if (clientId) {
    conditions.push(eq(schema.cases.clientId, clientId));
  }
  if (search) {
    const q = `%${search}%`;
    conditions.push(sql`(${schema.cases.caseNumber} LIKE ${q} COLLATE NOCASE OR ${schema.cases.court} LIKE ${q} COLLATE NOCASE)`);
  }

  const rows = await db
    .select()
    .from(schema.cases)
    .where(and(...conditions))
    .limit(limit)
    .offset(offset)
    .orderBy(desc(schema.cases.createdAt));

  return c.json({ cases: rows });
});

// GET /api/v1/cases/:id
casesRouter.get('/:id', requirePermission('cases.view'), async (c) => {
  const firmId = c.get('firmId') as string;
  const user = c.get('user') as schema.User;
  const id = c.req.param('id') as string;
  const db = getDb(c.env.DB);

  const visible = await getVisibleCaseIds(db, firmId, user);
  if (visible !== 'ALL' && !visible.includes(id)) {
    return c.json({ error: 'Not found', message: 'Case not found or access restricted' }, 404);
  }

  const rows = await db
    .select()
    .from(schema.cases)
    .where(and(eq(schema.cases.id, id), eq(schema.cases.firmId, firmId), isNull(schema.cases.deletedAt)))
    .limit(1);

  if (!rows[0]) {
    return c.json({ error: 'Not found', message: 'Case not found' }, 404);
  }

  return c.json({ case: rows[0] });
});

// POST /api/v1/cases
casesRouter.post('/', enforceSubscriptionReadOnly, requirePermission('cases.create'), async (c) => {
  const firmId = c.get('firmId');
  const user = c.get('user') as schema.User;
  const body = await c.req.json().catch(() => ({}));

  const caseCreateSchema = z.object({
    clientId: z.string().min(1),
    caseNumber: z.string().min(1),
    court: z.string().min(1),
    matterType: z.string().min(1),
    fileSerial: z.string().optional(),
    description: z.string().optional(),
    plaintiff: z.string().optional(),
    defendant: z.string().optional(),
    ourRole: z.string().optional(),
    responsibleLawyerId: z.string().optional(),
    status: z.enum(['ongoing', 'pending', 'closed']).default('ongoing'),
    caseCategory: z.enum(['civil', 'criminal_gr', 'criminal_cr', 'other']).default('civil'),
    caseDate: z.string().optional(),
  });

  const parse = caseCreateSchema.safeParse(body);
  if (!parse.success) {
    return c.json({ error: 'Validation failed', errors: parse.error.issues }, 400);
  }

  const caseId = crypto.randomUUID();
  const auditId = crypto.randomUUID();
  const now = new Date().toISOString();

  const newCaseData = {
    id: caseId,
    firmId,
    clientId: parse.data.clientId,
    caseNumber: parse.data.caseNumber,
    court: parse.data.court,
    matterType: parse.data.matterType,
    fileSerial: parse.data.fileSerial || null,
    description: parse.data.description || null,
    plaintiff: parse.data.plaintiff || null,
    defendant: parse.data.defendant || null,
    ourRole: parse.data.ourRole || null,
    responsibleLawyerId: parse.data.responsibleLawyerId || user.id,
    status: parse.data.status,
    caseCategory: parse.data.caseCategory,
    caseDate: parse.data.caseDate || now,
    closedOn: null,
    partyARole: null,
    partyBRole: null,
    policeStation: null,
    sectionsOfLaw: null,
    restricted: false,
    nextHearingAt: null,
    createdAt: now,
    updatedAt: now,
    createdBy: user.id,
  };

  const auditEntry = {
    id: auditId,
    firmId,
    userId: user.id,
    userName: user.name,
    entity: 'Case',
    entityId: caseId,
    action: 'CREATE',
    oldValue: null,
    newValue: newCaseData,
    timestamp: now,
    createdAt: now,
    updatedAt: now,
  };

  const db = getDb(c.env.DB);
  await db.batch([
    db.insert(schema.cases).values(newCaseData),
    db.insert(schema.auditLog).values(auditEntry),
  ] as any);

  return c.json({ case: newCaseData }, 201);
});
