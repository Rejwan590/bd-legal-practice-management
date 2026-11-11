import { Hono } from 'hono';
import { z } from 'zod';
import { Env, authMiddleware, enforceSubscriptionReadOnly, requireAnyPermission } from '../middleware/auth';
import { getDb, ChamberDatabase } from '../db/client';
import * as schema from '../db/schema';
import { eq, and, isNull, desc } from 'drizzle-orm';
import { getVisibleCaseIds, canUserSeeCaseId } from '../utils/visibility';
import { buildAuditEntry } from '../utils/audit';
import { enrichPayments } from '../utils/billing';

export const feePaymentsRouter = new Hono<{ Bindings: Env; Variables: any }>();

feePaymentsRouter.use('*', authMiddleware);

const readPerm = requireAnyPermission(['accounts.view', 'billing.view']);
const writePerm = requireAnyPermission(['accounts.manage', 'billing.manage', 'billing.edit']);

// GET /api/v1/fee-payments
feePaymentsRouter.get('/', readPerm, async (c) => {
  const firm = c.get('firm') as schema.Firm;
  const user = c.get('user') as schema.User;
  const clientId = c.req.query('clientId');
  const caseId = c.req.query('caseId');
  const feeAgreementId = c.req.query('feeAgreementId');
  const status = c.req.query('status');
  const method = c.req.query('method');
  const legacyUnassigned = c.req.query('legacyUnassigned');
  const search = (c.req.query('search') || '').trim().toLowerCase();

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
    if (status && status !== 'all' && p.status !== status) return false;
    if (method && method !== 'all' && p.method !== method) return false;
    if (legacyUnassigned !== undefined && String(p.legacyUnassigned) !== legacyUnassigned) return false;
    return true;
  });

  const enriched = await enrichPayments(db, firm.id, filtered);
  if (!search) return c.json(enriched);

  return c.json(
    enriched.filter((p) => {
      const hay = [
        p.receiptNumber,
        p.purposeNote,
        p.reference,
        p.clientName,
        p.clientNameBn,
        p.caseNumber,
        p.caseTitle,
        p.method,
        p.paymentDate,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      return hay.includes(search);
    })
  );
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
  const [enriched] = await enrichPayments(db, firm.id, [payment]);
  return c.json(enriched);
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
      feeAgreementId: z.string().min(1, 'feeAgreementId is required'),
      hearingId: z.string().nullable().optional(),
      paymentDate: z.string().min(1),
      amountPaisa: z.number().int().min(1).optional(),
      amountBdt: z.number().int().min(1).optional(),
      method: z.enum(['cash', 'bank', 'bkash', 'nagad', 'cheque', 'other']),
      reference: z.string().trim().max(120).nullable().optional(),
      purposeNote: z.string().trim().min(1).max(500),
      idempotencyKey: z.string().trim().min(1).max(128).optional(),
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
    if (existingIdemp[0].caseId && !(await canUserSeeCaseId(db, firm, user, existingIdemp[0].caseId))) {
      return c.json({ error: 'NotFound', message: 'Linked case not found or inaccessible' }, 404);
    }
    const [enrichedDup] = await enrichPayments(db, firm.id, [existingIdemp[0]]);
    return c.json(enrichedDup);
  }

  const agrRows = await db
    .select()
    .from(schema.feeAgreements)
    .where(and(eq(schema.feeAgreements.id, parse.data.feeAgreementId), eq(schema.feeAgreements.firmId, firm.id), isNull(schema.feeAgreements.deletedAt)))
    .limit(1);
  const agr = agrRows[0];
  if (!agr) return c.json({ error: 'NotFound', message: 'Fee agreement not found' }, 404);
  if (agr.status !== 'active') {
    return c.json({ error: 'BadRequest', message: 'Cannot record payment for closed or void fee agreement' }, 400);
  }

  if (parse.data.clientId && parse.data.clientId !== agr.clientId) {
    return c.json({ error: 'BadRequest', message: 'Payment client does not match fee agreement client' }, 400);
  }

  if (parse.data.caseId && agr.caseId && parse.data.caseId !== agr.caseId) {
    return c.json({ error: 'BadRequest', message: 'Payment case does not match fee agreement case' }, 400);
  }

  const resolvedClientId = agr.clientId;
  const resolvedCaseId = parse.data.caseId ?? agr.caseId ?? null;

  const clientRows = await db
    .select({ id: schema.clients.id })
    .from(schema.clients)
    .where(and(eq(schema.clients.id, resolvedClientId), eq(schema.clients.firmId, firm.id), isNull(schema.clients.deletedAt)))
    .limit(1);
  if (!clientRows[0]) {
    return c.json({ error: 'NotFound', message: 'Client not found' }, 404);
  }

  if (resolvedCaseId) {
    if (!(await canUserSeeCaseId(db, firm, user, resolvedCaseId))) {
      return c.json({ error: 'NotFound', message: 'Linked case not found or inaccessible' }, 404);
    }
    const caseRows = await db
      .select({ id: schema.cases.id, clientId: schema.cases.clientId })
      .from(schema.cases)
      .where(and(eq(schema.cases.id, resolvedCaseId), eq(schema.cases.firmId, firm.id), isNull(schema.cases.deletedAt)))
      .limit(1);
    if (!caseRows[0] || caseRows[0].clientId !== resolvedClientId) {
      return c.json({ error: 'BadRequest', message: 'Case does not belong to the agreement client' }, 400);
    }
  }

  if (parse.data.hearingId) {
    const hearingRows = await db
      .select({ id: schema.hearings.id, caseId: schema.hearings.caseId })
      .from(schema.hearings)
      .where(and(eq(schema.hearings.id, parse.data.hearingId), eq(schema.hearings.firmId, firm.id), isNull(schema.hearings.deletedAt)))
      .limit(1);
    if (!hearingRows[0] || (resolvedCaseId && hearingRows[0].caseId !== resolvedCaseId)) {
      return c.json({ error: 'BadRequest', message: 'Hearing does not belong to this case' }, 400);
    }
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
    feeAgreementId: agr.id,
    hearingId: parse.data.hearingId || null,
    paymentDate: parse.data.paymentDate,
    amountPaisa,
    method: parse.data.method,
    reference: parse.data.reference || null,
    receiptNumber,
    purposeNote: parse.data.purposeNote,
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

  try {
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
  } catch (err) {
    const dupCheck = await db
      .select()
      .from(schema.feePayments)
      .where(and(eq(schema.feePayments.firmId, firm.id), eq(schema.feePayments.idempotencyKey, idempotencyKey)))
      .limit(1);
    if (dupCheck[0]) {
      const [enrichedDup] = await enrichPayments(db, firm.id, [dupCheck[0]]);
      return c.json(enrichedDup);
    }
    throw err;
  }

  const [enriched] = await enrichPayments(db, firm.id, [newPayment]);
  return c.json(enriched, 201);
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
  if (payment.caseId && !(await canUserSeeCaseId(db, firm, user, payment.caseId))) {
    return c.json({ error: 'NotFound', message: 'Fee payment not found' }, 404);
  }
  const agreement = agrRows[0];
  if (!agreement) return c.json({ error: 'NotFound', message: 'Fee agreement not found' }, 404);
  if (agreement.status !== 'active') return c.json({ error: 'BadRequest', message: 'Cannot attach to closed or void agreement' }, 400);
  if (agreement.caseId && !(await canUserSeeCaseId(db, firm, user, agreement.caseId))) {
    return c.json({ error: 'NotFound', message: 'Target agreement case not found or inaccessible' }, 404);
  }

  const now = new Date().toISOString();
  const updates = {
    feeAgreementId: agreement.id,
    caseId: agreement.caseId ?? payment.caseId ?? null,
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

  const [enriched] = await enrichPayments(db, firm.id, [{ ...payment, ...updates }]);
  return c.json(enriched);
});

// POST /api/v1/fee-payments/:id/void
feePaymentsRouter.post('/:id/void', enforceSubscriptionReadOnly, writePerm, async (c) => {
  const firm = c.get('firm') as schema.Firm;
  const user = c.get('user') as schema.User;
  const id = c.req.param('id') as string;
  const body = await c.req.json().catch(() => ({}));
  const parse = z.object({ reason: z.string().trim().min(3).max(500) }).safeParse(body);
  if (!parse.success) return c.json({ error: 'ValidationError', details: parse.error.issues }, 400);

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

  const [enriched] = await enrichPayments(db, firm.id, [{ ...payment, ...updates }]);
  return c.json(enriched);
});
