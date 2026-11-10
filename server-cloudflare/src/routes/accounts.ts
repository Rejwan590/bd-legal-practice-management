import { Hono } from 'hono';
import { z } from 'zod';
import { Env, authMiddleware, enforceSubscriptionReadOnly, requirePermission } from '../middleware/auth';
import { getDb, ChamberDatabase } from '../db/client';
import * as schema from '../db/schema';
import { eq, and, isNull, sql, desc } from 'drizzle-orm';

export const accountsRouter = new Hono<{ Bindings: Env; Variables: any }>();

accountsRouter.use('*', authMiddleware);

// ==========================================
// FEE AGREEMENTS
// ==========================================
accountsRouter.get('/agreements', requirePermission('billing.view'), async (c) => {
  const firmId = c.get('firmId');
  const db = getDb(c.env.DB);

  const rows = await db
    .select({
      id: schema.feeAgreements.id,
      firmId: schema.feeAgreements.firmId,
      clientId: schema.feeAgreements.clientId,
      caseId: schema.feeAgreements.caseId,
      feeType: schema.feeAgreements.feeType,
      agreedAmountPaisa: schema.feeAgreements.agreedAmountPaisa,
      agreementDate: schema.feeAgreements.agreementDate,
      status: schema.feeAgreements.status,
      clientName: schema.clients.name,
      caseNumber: schema.cases.caseNumber,
    })
    .from(schema.feeAgreements)
    .innerJoin(schema.clients, eq(schema.feeAgreements.clientId, schema.clients.id))
    .leftJoin(schema.cases, eq(schema.feeAgreements.caseId, schema.cases.id))
    .where(and(eq(schema.feeAgreements.firmId, firmId), isNull(schema.feeAgreements.deletedAt)))
    .orderBy(desc(schema.feeAgreements.createdAt));

  return c.json({ agreements: rows });
});

accountsRouter.post('/agreements', enforceSubscriptionReadOnly, requirePermission('billing.edit'), async (c) => {
  const firmId = c.get('firmId');
  const user = c.get('user') as schema.User;
  const body = await c.req.json().catch(() => ({}));

  const agreementSchema = z.object({
    clientId: z.string().min(1),
    caseId: z.string().optional(),
    feeType: z.enum(['fixed', 'per_hearing', 'hourly', 'retainer', 'installment']).default('fixed'),
    agreedAmountBdt: z.number().int().min(0),
    agreementDate: z.string().min(1),
    notes: z.string().optional(),
  });

  const parse = agreementSchema.safeParse(body);
  if (!parse.success) {
    return c.json({ error: 'Validation failed', errors: parse.error.issues }, 400);
  }

  const id = crypto.randomUUID();
  const auditId = crypto.randomUUID();
  const now = new Date().toISOString();
  const agreedAmountPaisa = parse.data.agreedAmountBdt * 100;

  const newAgreement = {
    id,
    firmId,
    clientId: parse.data.clientId,
    caseId: parse.data.caseId || null,
    feeType: parse.data.feeType,
    agreedAmountPaisa,
    agreementDate: parse.data.agreementDate,
    notes: parse.data.notes || null,
    status: 'active' as const,
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
    entity: 'FeeAgreement',
    entityId: id,
    action: 'CREATE',
    oldValue: null,
    newValue: newAgreement,
    timestamp: now,
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
    createdBy: user.id,
    updatedBy: null,
  };

  const db = getDb(c.env.DB);
  await db.batch([
    db.insert(schema.feeAgreements).values(newAgreement),
    db.insert(schema.auditLog).values(auditEntry),
  ] as any);

  return c.json({ agreement: newAgreement }, 201);
});

// ==========================================
// FEE PAYMENTS & RECEIPTS
// ==========================================
accountsRouter.get('/payments', requirePermission('billing.view'), async (c) => {
  const firmId = c.get('firmId');
  const db = getDb(c.env.DB);

  const rows = await db
    .select({
      id: schema.feePayments.id,
      firmId: schema.feePayments.firmId,
      receiptNumber: schema.feePayments.receiptNumber,
      paymentDate: schema.feePayments.paymentDate,
      amountPaisa: schema.feePayments.amountPaisa,
      method: schema.feePayments.method,
      reference: schema.feePayments.reference,
      purposeNote: schema.feePayments.purposeNote,
      status: schema.feePayments.status,
      clientName: schema.clients.name,
      caseNumber: schema.cases.caseNumber,
    })
    .from(schema.feePayments)
    .innerJoin(schema.clients, eq(schema.feePayments.clientId, schema.clients.id))
    .leftJoin(schema.cases, eq(schema.feePayments.caseId, schema.cases.id))
    .where(and(eq(schema.feePayments.firmId, firmId), isNull(schema.feePayments.deletedAt)))
    .orderBy(desc(schema.feePayments.createdAt));

  return c.json({ payments: rows });
});

// POST /api/v1/accounts/payments
accountsRouter.post('/payments', enforceSubscriptionReadOnly, requirePermission('billing.edit'), async (c) => {
  const firmId = c.get('firmId');
  const user = c.get('user') as schema.User;
  const body = await c.req.json().catch(() => ({}));

  const paymentSchema = z.object({
    clientId: z.string().min(1),
    caseId: z.string().optional(),
    feeAgreementId: z.string().optional(),
    paymentDate: z.string().min(1),
    amountBdt: z.number().int().min(1),
    method: z.enum(['cash', 'bank', 'bkash', 'nagad', 'cheque', 'other']),
    reference: z.string().optional(),
    purposeNote: z.string().min(1),
    idempotencyKey: z.string().optional(),
  });

  const parse = paymentSchema.safeParse(body);
  if (!parse.success) {
    return c.json({ error: 'Validation failed', errors: parse.error.issues }, 400);
  }

  const { clientId, caseId, feeAgreementId, paymentDate, amountBdt, method, reference, purposeNote } = parse.data;
  const idempotencyKey = parse.data.idempotencyKey || crypto.randomUUID();

  const db = getDb(c.env.DB);
  const chamberDb = new ChamberDatabase(db, c.env.DB);

  // Check idempotency deduplication
  const existingPayment = await db
    .select()
    .from(schema.feePayments)
    .where(and(eq(schema.feePayments.firmId, firmId), eq(schema.feePayments.idempotencyKey, idempotencyKey)))
    .limit(1);

  if (existingPayment[0]) {
    return c.json({ payment: existingPayment[0], duplicate: true });
  }

  const receiptNumber = await chamberDb.getNextReceiptNumber(firmId);
  const paymentId = crypto.randomUUID();
  const auditId = crypto.randomUUID();
  const now = new Date().toISOString();
  const amountPaisa = amountBdt * 100;

  const newPayment = {
    id: paymentId,
    firmId,
    clientId,
    caseId: caseId || null,
    feeAgreementId: feeAgreementId || null,
    hearingId: null,
    paymentDate,
    amountPaisa,
    method,
    reference: reference || null,
    receiptNumber,
    purposeNote,
    status: 'posted' as const,
    voidReason: null,
    voidedBy: null,
    voidedAt: null,
    idempotencyKey,
    legacyUnassigned: false,
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
    entity: 'FeePayment',
    entityId: paymentId,
    action: 'CREATE',
    oldValue: null,
    newValue: newPayment,
    timestamp: now,
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
    createdBy: user.id,
    updatedBy: null,
  };

  // Atomic batch execution
  await db.batch([
    db.insert(schema.feePayments).values(newPayment),
    db.insert(schema.auditLog).values(auditEntry),
  ] as any);

  return c.json({ payment: newPayment }, 201);
});
