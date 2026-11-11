import { Hono } from 'hono';
import { z } from 'zod';
import { Env, authMiddleware, enforceSubscriptionReadOnly, requireAnyPermission } from '../middleware/auth';
import { getDb } from '../db/client';
import * as schema from '../db/schema';
import { eq, and, isNull, desc } from 'drizzle-orm';
import { canUserSeeCaseId, getVisibleCaseIds } from '../utils/visibility';
import { buildAuditEntry } from '../utils/audit';

export const feeAgreementsRouter = new Hono<{ Bindings: Env; Variables: any }>();

feeAgreementsRouter.use('*', authMiddleware);

const readPerm = requireAnyPermission(['accounts.view', 'billing.view']);
const writePerm = requireAnyPermission(['accounts.manage', 'billing.edit']);

// GET /api/v1/fee-agreements
feeAgreementsRouter.get('/', readPerm, async (c) => {
  const firm = c.get('firm') as schema.Firm;
  const user = c.get('user') as schema.User;
  const clientId = c.req.query('clientId');
  const caseId = c.req.query('caseId');
  const status = c.req.query('status');

  const db = getDb(c.env.DB);
  const [rows, visible] = await Promise.all([
    db
      .select()
      .from(schema.feeAgreements)
      .where(and(eq(schema.feeAgreements.firmId, firm.id), isNull(schema.feeAgreements.deletedAt)))
      .orderBy(desc(schema.feeAgreements.createdAt)),
    getVisibleCaseIds(db, firm, user),
  ]);

  const filtered = rows.filter((a) => {
    if (a.caseId && visible !== 'ALL' && !visible.includes(a.caseId)) return false;
    if (clientId && a.clientId !== clientId) return false;
    if (caseId && a.caseId !== caseId) return false;
    if (status && a.status !== status) return false;
    return true;
  });

  return c.json(filtered);
});

// GET /api/v1/fee-agreements/:id
feeAgreementsRouter.get('/:id', readPerm, async (c) => {
  const firm = c.get('firm') as schema.Firm;
  const user = c.get('user') as schema.User;
  const id = c.req.param('id') as string;
  const db = getDb(c.env.DB);

  const rows = await db
    .select()
    .from(schema.feeAgreements)
    .where(and(eq(schema.feeAgreements.id, id), eq(schema.feeAgreements.firmId, firm.id), isNull(schema.feeAgreements.deletedAt)))
    .limit(1);

  const agreement = rows[0];
  if (!agreement) return c.json({ error: 'Not found', message: 'Fee agreement not found' }, 404);
  if (agreement.caseId && !(await canUserSeeCaseId(db, firm, user, agreement.caseId))) {
    return c.json({ error: 'Not found', message: 'Fee agreement not found' }, 404);
  }
  return c.json(agreement);
});

// POST /api/v1/fee-agreements
feeAgreementsRouter.post('/', enforceSubscriptionReadOnly, writePerm, async (c) => {
  const firm = c.get('firm') as schema.Firm;
  const user = c.get('user') as schema.User;
  const body = await c.req.json().catch(() => ({}));

  const createSchema = z
    .object({
      clientId: z.string().min(1),
      caseId: z.string().nullable().optional(),
      feeType: z.enum(['fixed', 'per_hearing', 'hourly', 'retainer', 'installment']).default('fixed'),
      agreedAmountPaisa: z.number().int().min(0).optional(),
      agreedAmountBdt: z.number().int().min(0).optional(),
      agreementDate: z.string().min(1),
      notes: z.string().nullable().optional(),
    })
    .refine((d) => d.agreedAmountPaisa !== undefined || d.agreedAmountBdt !== undefined, {
      message: 'agreedAmountPaisa or agreedAmountBdt is required',
    });

  const parse = createSchema.safeParse(body);
  if (!parse.success) return c.json({ error: 'ValidationError', details: parse.error.issues }, 400);

  const db = getDb(c.env.DB);
  if (parse.data.caseId && !(await canUserSeeCaseId(db, firm, user, parse.data.caseId))) {
    return c.json({ error: 'Not found', message: 'Case not found or access denied' }, 404);
  }

  const agreedAmountPaisa = parse.data.agreedAmountPaisa ?? parse.data.agreedAmountBdt! * 100;
  const id = crypto.randomUUID();
  const now = new Date().toISOString();

  const agreement = {
    id,
    firmId: firm.id,
    clientId: parse.data.clientId,
    caseId: parse.data.caseId || null,
    feeType: parse.data.feeType,
    agreedAmountPaisa,
    agreementDate: parse.data.agreementDate,
    notes: parse.data.notes ?? null,
    status: 'active' as const,
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
    createdBy: user.id,
    updatedBy: null,
  };

  await db.batch([
    db.insert(schema.feeAgreements).values(agreement),
    db.insert(schema.auditLog).values(
      buildAuditEntry({
        firmId: firm.id,
        userId: user.id,
        userName: user.name,
        entity: 'FeeAgreement',
        entityId: id,
        action: 'CREATE',
        newValue: agreement,
        now,
      })
    ),
  ] as any);

  return c.json(agreement, 201);
});

// POST /api/v1/fee-agreements/:id/revise
feeAgreementsRouter.post('/:id/revise', enforceSubscriptionReadOnly, writePerm, async (c) => {
  const firm = c.get('firm') as schema.Firm;
  const user = c.get('user') as schema.User;
  const id = c.req.param('id') as string;
  const body = await c.req.json().catch(() => ({}));

  const parse = z.object({ newAmountPaisa: z.number().int().min(0), reason: z.string().min(1) }).safeParse(body);
  if (!parse.success) return c.json({ error: 'ValidationError', details: parse.error.issues }, 400);

  const db = getDb(c.env.DB);
  const rows = await db
    .select()
    .from(schema.feeAgreements)
    .where(and(eq(schema.feeAgreements.id, id), eq(schema.feeAgreements.firmId, firm.id), isNull(schema.feeAgreements.deletedAt)))
    .limit(1);

  const existing = rows[0];
  if (!existing) return c.json({ error: 'NotFound', message: 'Fee agreement not found' }, 404);
  if (existing.status !== 'active') return c.json({ error: 'BadRequest', message: 'Can only revise active agreements' }, 400);

  const now = new Date().toISOString();
  const updated = { ...existing, agreedAmountPaisa: parse.data.newAmountPaisa, updatedAt: now, updatedBy: user.id };

  await db.batch([
    db
      .update(schema.feeAgreements)
      .set({ agreedAmountPaisa: parse.data.newAmountPaisa, updatedAt: now, updatedBy: user.id })
      .where(and(eq(schema.feeAgreements.id, id), eq(schema.feeAgreements.firmId, firm.id))),
    db.insert(schema.feeAgreementChanges).values({
      id: crypto.randomUUID(),
      firmId: firm.id,
      feeAgreementId: id,
      oldAmountPaisa: existing.agreedAmountPaisa,
      newAmountPaisa: parse.data.newAmountPaisa,
      reason: parse.data.reason,
      changedBy: user.id,
      createdAt: now,
    }),
    db.insert(schema.auditLog).values(
      buildAuditEntry({
        firmId: firm.id,
        userId: user.id,
        userName: user.name,
        entity: 'FeeAgreement',
        entityId: id,
        action: 'UPDATE',
        oldValue: { agreedAmountPaisa: existing.agreedAmountPaisa },
        newValue: { agreedAmountPaisa: parse.data.newAmountPaisa, reason: parse.data.reason },
        now,
      })
    ),
  ] as any);

  return c.json(updated);
});

// POST /api/v1/fee-agreements/:id/close
feeAgreementsRouter.post('/:id/close', enforceSubscriptionReadOnly, writePerm, async (c) => {
  const firm = c.get('firm') as schema.Firm;
  const user = c.get('user') as schema.User;
  const id = c.req.param('id') as string;
  const db = getDb(c.env.DB);

  const rows = await db
    .select()
    .from(schema.feeAgreements)
    .where(and(eq(schema.feeAgreements.id, id), eq(schema.feeAgreements.firmId, firm.id), isNull(schema.feeAgreements.deletedAt)))
    .limit(1);
  const existing = rows[0];
  if (!existing) return c.json({ error: 'NotFound', message: 'Fee agreement not found' }, 404);

  const now = new Date().toISOString();
  await db.batch([
    db
      .update(schema.feeAgreements)
      .set({ status: 'closed', updatedAt: now, updatedBy: user.id })
      .where(and(eq(schema.feeAgreements.id, id), eq(schema.feeAgreements.firmId, firm.id))),
    db.insert(schema.auditLog).values(
      buildAuditEntry({
        firmId: firm.id,
        userId: user.id,
        userName: user.name,
        entity: 'FeeAgreement',
        entityId: id,
        action: 'UPDATE',
        oldValue: { status: existing.status },
        newValue: { status: 'closed' },
        now,
      })
    ),
  ] as any);

  return c.json({ ...existing, status: 'closed', updatedAt: now });
});

// POST /api/v1/fee-agreements/:id/void
feeAgreementsRouter.post('/:id/void', enforceSubscriptionReadOnly, writePerm, async (c) => {
  const firm = c.get('firm') as schema.Firm;
  const user = c.get('user') as schema.User;
  const id = c.req.param('id') as string;
  const body = await c.req.json().catch(() => ({}));
  const reason = typeof body?.reason === 'string' && body.reason.trim() ? body.reason.trim() : 'Voided';

  const db = getDb(c.env.DB);
  const rows = await db
    .select()
    .from(schema.feeAgreements)
    .where(and(eq(schema.feeAgreements.id, id), eq(schema.feeAgreements.firmId, firm.id), isNull(schema.feeAgreements.deletedAt)))
    .limit(1);
  const existing = rows[0];
  if (!existing) return c.json({ error: 'NotFound', message: 'Fee agreement not found' }, 404);

  const now = new Date().toISOString();
  await db.batch([
    db
      .update(schema.feeAgreements)
      .set({ status: 'void', updatedAt: now, updatedBy: user.id })
      .where(and(eq(schema.feeAgreements.id, id), eq(schema.feeAgreements.firmId, firm.id))),
    db.insert(schema.auditLog).values(
      buildAuditEntry({
        firmId: firm.id,
        userId: user.id,
        userName: user.name,
        entity: 'FeeAgreement',
        entityId: id,
        action: 'VOID',
        oldValue: { status: existing.status },
        newValue: { status: 'void', reason },
        now,
      })
    ),
  ] as any);

  return c.json({ ...existing, status: 'void', updatedAt: now });
});

// GET /api/v1/fee-agreements/:id/changes
feeAgreementsRouter.get('/:id/changes', readPerm, async (c) => {
  const firm = c.get('firm') as schema.Firm;
  const id = c.req.param('id') as string;
  const db = getDb(c.env.DB);

  const rows = await db
    .select()
    .from(schema.feeAgreementChanges)
    .where(and(eq(schema.feeAgreementChanges.firmId, firm.id), eq(schema.feeAgreementChanges.feeAgreementId, id)))
    .orderBy(desc(schema.feeAgreementChanges.createdAt));

  return c.json(rows);
});
