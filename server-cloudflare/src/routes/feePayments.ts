import { Hono } from 'hono';
import { z } from 'zod';
import { Env, authMiddleware, enforceSubscriptionReadOnly, requireAnyPermission } from '../middleware/auth';
import { getDb, ChamberDatabase } from '../db/client';
import * as schema from '../db/schema';
import { eq, and, isNull, desc } from 'drizzle-orm';
import { getVisibleCaseIds, canUserSeeCaseId } from '../utils/visibility';
import { buildAuditEntry } from '../utils/audit';

export const feePaymentsRouter = new Hono<{ Bindings: Env; Variables: any }>();

feePaymentsRouter.use('*', authMiddleware);

const readPerm = requireAnyPermission(['accounts.view', 'billing.view']);
const writePerm = requireAnyPermission(['accounts.manage', 'billing.edit']);

// GET /api/v1/fee-payments
feePaymentsRouter.get('/', readPerm, async (c) => {
  const firm = c.get('firm') as schema.Firm;
  const user = c.get('user') as schema.User;
  const clientId = c.req.query('clientId');
  const caseId = c.req.query('caseId');
  const feeAgreementId = c.req.query('feeAgreementId');
  const status = c.req.query('status');
  const legacyUnassigned = c.req.query('legacyUnassigned');

  const db = getDb(c.env.DB);
  const [rows, visible] = await Promise.all([
    db
      .select()
      .from(schema.feePayments)
      .where(and(eq(schema.feePayments.firmId, firm.id), isNull(schema.feePayments.deletedAt)))
      .orderBy(desc(schema.feePayments.paymentDate), desc(schema.feePayments.createdAt)),
    getVisibleCaseIds(db, firm, user),
  ]);

  const filtered = rows.filter((p) => {
    if (p.caseId && visible !== 'ALL' && !visible.includes(p.caseId)) return false;
    if (clientId && p.clientId !== clientId) return false;
    if (caseId && p.caseId !== caseId) return false;
    if (feeAgreementId && p.feeAgreementId !== feeAgreementId) return false;
    if (status && p.status !== status) return false;
    if (legacyUnassigned !== undefined && String(p.legacyUnassigned) !== legacyUnassigned) return false;
    return true;
  });

  return c.json(filtered);
});

// GET /api/v1/fee-payments/:id
feePaymentsRouter.get('/:id', readPerm, async (c) => {
  const firm = c.get('firm') as schema.Firm;
  const user = c.get('user') as schema.User;
  const id = c.req.param('id') as string;
  const db = getDb(c.env.DB);

  const rows = await db
    .select()
    .from(schema.feePayments)
    .where(and(eq(schema.feePayments.id, id), eq(schema.feePayments.firmId, firm.id), isNull(schema.feePayments.deletedAt)))
    .limit(1);

  const payment = rows[0];
  if (!payment) return c.json({ error: 'NotFound', message: 'Fee payment not found' }, 404);
  if (payment.caseId && !(await canUserSeeCaseId(db, firm, user, payment.caseId))) {
    return c.json({ error: 'NotFound', message: 'Fee payment not found' }, 404);
  }
  return c.json(payment);
});

// POST /api/v1/fee-payments
feePaymentsRouter.post('/', enforceSubscriptionReadOnly, writePerm, async (c) => {
  const firm = c.get('firm') as schema.Firm;
  const user = c.get('user') as schema.User;
  const body = await c.req.json().catch(() => ({}));

  const createSchema = z
    .object({
      clientId: z.string().optional(),
      caseId: z.string().nullable().optional(),
      feeAgreementId: z.string().nullable().optional(),
      hearingId: z.string().nullable().optional(),
      paymentDate: z.string().min(1),
      amountPaisa: z.number().int().min(1).optional(),
      amountBdt: z.number().int().min(1).optional(),
      method: z.enum(['cash', 'bank', 'bkash', 'nagad', 'cheque', 'other']),
      reference: z.string().nullable().optional(),
      purposeNote: z.string().min(1),
      idempotencyKey: z.string().min(1).optional(),
    })
    .refine((d) => d.amountPaisa !== undefined || d.amountBdt !== undefined, {
      message: 'amountPaisa or amountBdt is required',
    });

  const parse = createSchema.safeParse(body);
  if (!parse.success) return c.json({ error: 'ValidationError', details: parse.error.issues }, 400);

  const db = getDb(c.env.DB);
  const idempotencyKey = parse.data.idempotencyKey || crypto.randomUUID();

  const existingIdemp = await db
    .select()
    .from(schema.feePayments)
    .where(and(eq(schema.feePayments.firmId, firm.id), eq(schema.feePayments.idempotencyKey, idempotencyKey)))
    .limit(1);
  if (existingIdemp[0]) {
    return c.json(existingIdemp[0]);
  }

  let resolvedClientId = parse.data.clientId;
  let resolvedCaseId = parse.data.caseId ?? null;

  if (parse.data.feeAgreementId) {
    const agrRows = await db
      .select()
      .from(schema.feeAgreements)
      .where(and(eq(schema.feeAgreements.id, parse.data.feeAgreementId), eq(schema.feeAgreements.firmId, firm.id), isNull(schema.feeAgreements.deletedAt)))
      .limit(1);
    const agr = agrRows[0];
    if (!agr) return c.json({ error: 'NotFound', message: 'Fee agreement not found' }, 404);
    resolvedClientId = resolvedClientId || agr.clientId;
    resolvedCaseId = resolvedCaseId ?? agr.caseId;
  }

  if (!resolvedClientId) {
    return c.json({ error: 'BadRequest', message: 'clientId or valid feeAgreementId is required' }, 400);
  }
  if (resolvedCaseId && !(await canUserSeeCaseId(db, firm, user, resolvedCaseId))) {
    return c.json({ error: 'NotFound', message: 'Linked case not found or inaccessible' }, 404);
  }

  const chamberDb = new ChamberDatabase(db, c.env.DB);
  const receiptNumber = await chamberDb.getNextReceiptNumber(firm.id);
  const paymentId = crypto.randomUUID();
  const now = new Date().toISOString();
  const amountPaisa = parse.data.amountPaisa ?? parse.data.amountBdt! * 100;

  const newPayment = {
    id: paymentId,
    firmId: firm.id,
    clientId: resolvedClientId,
    caseId: resolvedCaseId,
    feeAgreementId: parse.data.feeAgreementId || null,
    hearingId: parse.data.hearingId || null,
    paymentDate: parse.data.paymentDate,
    amountPaisa,
    method: parse.data.method,
    reference: parse.data.reference ?? null,
    receiptNumber,
    purposeNote: parse.data.purposeNote,
    status: 'posted' as const,
    voidReason: null,
    voidedBy: null,
    voidedAt: null,
    idempotencyKey,
    legacyUnassigned: !parse.data.feeAgreementId,
    createdAt: now,
    updatedAt: now,
    createdBy: user.id,
    updatedBy: null,
    deletedAt: null,
  };

  await db.batch([
    db.insert(schema.feePayments).values(newPayment),
    db.insert(schema.auditLog).values(
      buildAuditEntry({
        firmId: firm.id,
        userId: user.id,
        userName: user.name,
        entity: 'FeePayment',
        entityId: paymentId,
        action: 'CREATE',
        newValue: newPayment,
        now,
      })
    ),
  ] as any);

  return c.json(newPayment, 201);
});

// POST /api/v1/fee-payments/:id/attach
feePaymentsRouter.post('/:id/attach', enforceSubscriptionReadOnly, writePerm, async (c) => {
  const firm = c.get('firm') as schema.Firm;
  const user = c.get('user') as schema.User;
  const id = c.req.param('id') as string;
  const body = await c.req.json().catch(() => ({}));
  const parse = z.object({ feeAgreementId: z.string().min(1) }).safeParse(body);
  if (!parse.success) return c.json({ error: 'ValidationError', details: parse.error.issues }, 400);

  const db = getDb(c.env.DB);
  const [payRows, agrRows] = await Promise.all([
    db.select().from(schema.feePayments).where(and(eq(schema.feePayments.id, id), eq(schema.feePayments.firmId, firm.id), isNull(schema.feePayments.deletedAt))).limit(1),
    db.select().from(schema.feeAgreements).where(and(eq(schema.feeAgreements.id, parse.data.feeAgreementId), eq(schema.feeAgreements.firmId, firm.id), isNull(schema.feeAgreements.deletedAt))).limit(1),
  ]);

  const payment = payRows[0];
  if (!payment) return c.json({ error: 'NotFound', message: 'Fee payment not found' }, 404);
  const agreement = agrRows[0];
  if (!agreement) return c.json({ error: 'NotFound', message: 'Fee agreement not found' }, 404);
  if (agreement.status !== 'active') return c.json({ error: 'BadRequest', message: 'Cannot attach to closed or void agreement' }, 400);
  if (!agreement.caseId) return c.json({ error: 'BadRequest', message: 'Fee agreement must be linked to a case' }, 400);

  const now = new Date().toISOString();
  const updates = {
    feeAgreementId: agreement.id,
    caseId: agreement.caseId,
    clientId: agreement.clientId,
    legacyUnassigned: false,
    updatedAt: now,
    updatedBy: user.id,
  };

  await db.batch([
    db.update(schema.feePayments).set(updates).where(and(eq(schema.feePayments.id, id), eq(schema.feePayments.firmId, firm.id))),
    db.insert(schema.auditLog).values(
      buildAuditEntry({
        firmId: firm.id,
        userId: user.id,
        userName: user.name,
        entity: 'FeePayment',
        entityId: id,
        action: 'UPDATE',
        oldValue: { feeAgreementId: payment.feeAgreementId, legacyUnassigned: payment.legacyUnassigned },
        newValue: updates,
        now,
      })
    ),
  ] as any);

  return c.json({ ...payment, ...updates });
});

// POST /api/v1/fee-payments/:id/void
feePaymentsRouter.post('/:id/void', enforceSubscriptionReadOnly, writePerm, async (c) => {
  const firm = c.get('firm') as schema.Firm;
  const user = c.get('user') as schema.User;
  const id = c.req.param('id') as string;
  const body = await c.req.json().catch(() => ({}));
  const parse = z.object({ reason: z.string().min(1) }).safeParse(body);
  if (!parse.success) return c.json({ error: 'ValidationError', details: parse.error.issues }, 400);

  const db = getDb(c.env.DB);
  const rows = await db
    .select()
    .from(schema.feePayments)
    .where(and(eq(schema.feePayments.id, id), eq(schema.feePayments.firmId, firm.id), isNull(schema.feePayments.deletedAt)))
    .limit(1);
  const payment = rows[0];
  if (!payment) return c.json({ error: 'NotFound', message: 'Fee payment not found' }, 404);
  if (payment.status === 'void') return c.json({ error: 'BadRequest', message: 'Payment is already voided' }, 400);

  const now = new Date().toISOString();
  const updates = {
    status: 'void' as const,
    voidReason: parse.data.reason,
    voidedBy: user.id,
    voidedAt: now,
    updatedAt: now,
    updatedBy: user.id,
  };

  await db.batch([
    db.update(schema.feePayments).set(updates).where(and(eq(schema.feePayments.id, id), eq(schema.feePayments.firmId, firm.id))),
    db.insert(schema.auditLog).values(
      buildAuditEntry({
        firmId: firm.id,
        userId: user.id,
        userName: user.name,
        entity: 'FeePayment',
        entityId: id,
        action: 'VOID',
        oldValue: { status: payment.status },
        newValue: updates,
        now,
      })
    ),
  ] as any);

  return c.json({ ...payment, ...updates });
});
