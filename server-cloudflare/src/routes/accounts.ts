import { Hono } from 'hono';
import { z } from 'zod';
import { Env, authMiddleware, enforceSubscriptionReadOnly, requireAnyPermission } from '../middleware/auth';
import { getDb, ChamberDatabase } from '../db/client';
import * as schema from '../db/schema';
import { eq, and, isNull, desc } from 'drizzle-orm';
import { getVisibleCaseIds, canUserSeeCaseId } from '../utils/visibility';
import { buildAuditEntry } from '../utils/audit';
import { formatCaseTitle } from '../utils/billing';

export const accountsRouter = new Hono<{ Bindings: Env; Variables: any }>();

accountsRouter.use('*', authMiddleware);

const readPerm = requireAnyPermission(['accounts.view', 'billing.view']);
const writePerm = requireAnyPermission(['accounts.manage', 'billing.manage', 'billing.edit']);

// GET /api/v1/accounts/summary
accountsRouter.get('/summary', readPerm, async (c) => {
  const firm = c.get('firm') as schema.Firm;
  const user = c.get('user') as schema.User;
  const clientId = c.req.query('clientId');
  const caseId = c.req.query('caseId');

  const db = getDb(c.env.DB);
  const [agreements, payments, expensesRows, visible] = await Promise.all([
    db
      .select()
      .from(schema.feeAgreements)
      .where(and(eq(schema.feeAgreements.firmId, firm.id), isNull(schema.feeAgreements.deletedAt))),
    db
      .select()
      .from(schema.feePayments)
      .where(and(eq(schema.feePayments.firmId, firm.id), isNull(schema.feePayments.deletedAt))),
    db
      .select()
      .from(schema.expenses)
      .where(and(eq(schema.expenses.firmId, firm.id), isNull(schema.expenses.deletedAt))),
    getVisibleCaseIds(db, firm, user),
  ]);

  const filterVisible = <T extends { clientId?: string | null; caseId?: string | null; status: string }>(row: T) => {
    if (row.status === 'void') return false;
    if (row.caseId && visible !== 'ALL' && !visible.includes(row.caseId)) return false;
    if (clientId && row.clientId !== clientId) return false;
    if (caseId && row.caseId !== caseId) return false;
    return true;
  };

  const validAgrs = agreements.filter(filterVisible);
  const validPays = payments.filter((p) => p.status === 'posted' && filterVisible(p));
  const validExps = expensesRows.filter((e) => e.status === 'posted' && filterVisible(e));

  const totalAgreedPaisa = validAgrs.reduce((s, a) => s + a.agreedAmountPaisa, 0);
  const totalPaidPaisa = validPays.reduce((s, p) => s + p.amountPaisa, 0);
  const totalExpensesPaisa = validExps.reduce((s, e) => s + e.amountPaisa, 0);
  const balancePaisa = totalAgreedPaisa - totalPaidPaisa;
  const isCredit = balancePaisa < 0;

  return c.json({
    totalAgreedPaisa,
    totalPaidPaisa,
    balancePaisa,
    isCredit,
    creditPaisa: isCredit ? Math.abs(balancePaisa) : 0,
    outstandingPaisa: balancePaisa > 0 ? balancePaisa : 0,
    totalExpensesPaisa,
  });
});

// GET /api/v1/accounts/client-balances
accountsRouter.get('/client-balances', readPerm, async (c) => {
  const firm = c.get('firm') as schema.Firm;
  const user = c.get('user') as schema.User;
  const db = getDb(c.env.DB);

  const [clientsList, agreements, payments, visible] = await Promise.all([
    db.select().from(schema.clients).where(and(eq(schema.clients.firmId, firm.id), isNull(schema.clients.deletedAt))),
    db.select().from(schema.feeAgreements).where(and(eq(schema.feeAgreements.firmId, firm.id), isNull(schema.feeAgreements.deletedAt))),
    db.select().from(schema.feePayments).where(and(eq(schema.feePayments.firmId, firm.id), isNull(schema.feePayments.deletedAt))),
    getVisibleCaseIds(db, firm, user),
  ]);

  const results = clientsList
    .map((cl) => {
      const agreed = agreements
        .filter((a) => a.clientId === cl.id && a.status !== 'void' && (!a.caseId || visible === 'ALL' || visible.includes(a.caseId)))
        .reduce((s, a) => s + a.agreedAmountPaisa, 0);
      const paid = payments
        .filter((p) => p.clientId === cl.id && p.status === 'posted' && (!p.caseId || visible === 'ALL' || visible.includes(p.caseId)))
        .reduce((s, p) => s + p.amountPaisa, 0);
      if (agreed === 0 && paid === 0) return null;
      const balancePaisa = agreed - paid;
      const isCredit = balancePaisa < 0;
      return {
        clientId: cl.id,
        clientName: cl.name,
        clientNameBn: cl.nameBn,
        clientPhone: cl.phone,
        totalAgreedPaisa: agreed,
        totalPaidPaisa: paid,
        balancePaisa,
        isCredit,
        creditPaisa: isCredit ? Math.abs(balancePaisa) : 0,
        outstandingPaisa: balancePaisa > 0 ? balancePaisa : 0,
      };
    })
    .filter(Boolean);

  return c.json(results);
});

// GET /api/v1/accounts/case-balances
accountsRouter.get('/case-balances', readPerm, async (c) => {
  const firm = c.get('firm') as schema.Firm;
  const user = c.get('user') as schema.User;
  const db = getDb(c.env.DB);

  const [casesList, clientsList, agreements, payments, expensesRows, visible] = await Promise.all([
    db.select().from(schema.cases).where(and(eq(schema.cases.firmId, firm.id), isNull(schema.cases.deletedAt))),
    db.select().from(schema.clients).where(and(eq(schema.clients.firmId, firm.id), isNull(schema.clients.deletedAt))),
    db.select().from(schema.feeAgreements).where(and(eq(schema.feeAgreements.firmId, firm.id), isNull(schema.feeAgreements.deletedAt))),
    db.select().from(schema.feePayments).where(and(eq(schema.feePayments.firmId, firm.id), isNull(schema.feePayments.deletedAt))),
    db.select().from(schema.expenses).where(and(eq(schema.expenses.firmId, firm.id), isNull(schema.expenses.deletedAt))),
    getVisibleCaseIds(db, firm, user),
  ]);

  const clientMap = new Map(clientsList.map((cl) => [cl.id, cl]));
  const visibleCases = casesList.filter((cs) => visible === 'ALL' || visible.includes(cs.id));

  const results = visibleCases
    .map((cs) => {
      const agreed = agreements.filter((a) => a.caseId === cs.id && a.status !== 'void').reduce((s, a) => s + a.agreedAmountPaisa, 0);
      const paid = payments.filter((p) => p.caseId === cs.id && p.status === 'posted').reduce((s, p) => s + p.amountPaisa, 0);
      const totalExpensesPaisa = expensesRows
        .filter((e) => e.caseId === cs.id && e.status === 'posted')
        .reduce((s, e) => s + e.amountPaisa, 0);
      if (agreed === 0 && paid === 0 && totalExpensesPaisa === 0) return null;
      const cl = clientMap.get(cs.clientId);
      const balancePaisa = agreed - paid;
      const isCredit = balancePaisa < 0;
      return {
        clientId: cs.clientId,
        clientName: cl?.name || 'Unknown',
        clientNameBn: cl?.nameBn || null,
        clientPhone: cl?.phone || '',
        caseId: cs.id,
        caseNumber: cs.caseNumber,
        caseTitle: formatCaseTitle(cs),
        fileSerial: cs.fileSerial,
        totalAgreedPaisa: agreed,
        totalPaidPaisa: paid,
        totalExpensesPaisa,
        balancePaisa,
        isCredit,
        creditPaisa: isCredit ? Math.abs(balancePaisa) : 0,
        outstandingPaisa: balancePaisa > 0 ? balancePaisa : 0,
      };
    })
    .filter(Boolean);

  return c.json(results);
});

// ==========================================
// LEGACY / ALIAS ENDPOINTS (/accounts/agreements, /accounts/payments)
// ==========================================
accountsRouter.get('/agreements', readPerm, async (c) => {
  const firmId = c.get('firmId') as string;
  const db = getDb(c.env.DB);
  const rows = await db
    .select()
    .from(schema.feeAgreements)
    .where(and(eq(schema.feeAgreements.firmId, firmId), isNull(schema.feeAgreements.deletedAt)))
    .orderBy(desc(schema.feeAgreements.createdAt));
  return c.json(rows);
});

accountsRouter.post('/agreements', enforceSubscriptionReadOnly, writePerm, async (c) => {
  const firmId = c.get('firmId') as string;
  const user = c.get('user') as schema.User;
  const body = await c.req.json().catch(() => ({}));
  const parse = z
    .object({
      clientId: z.string().min(1),
      caseId: z.string().nullable().optional(),
      feeType: z.enum(['fixed', 'per_hearing', 'hourly', 'retainer', 'installment']).default('fixed'),
      agreedAmountBdt: z.number().int().min(0).optional(),
      agreedAmountPaisa: z.number().int().min(0).optional(),
      agreementDate: z.string().min(1),
      notes: z.string().optional(),
    })
    .safeParse(body);
  if (!parse.success) return c.json({ error: 'Validation failed', errors: parse.error.issues }, 400);

  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  const agreedAmountPaisa = parse.data.agreedAmountPaisa ?? (parse.data.agreedAmountBdt || 0) * 100;
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

  const db = getDb(c.env.DB);
  await db.batch([
    db.insert(schema.feeAgreements).values(newAgreement),
    db.insert(schema.auditLog).values(
      buildAuditEntry({ firmId, userId: user.id, userName: user.name, entity: 'FeeAgreement', entityId: id, action: 'CREATE', newValue: newAgreement, now })
    ),
  ] as any);

  return c.json(newAgreement, 201);
});

accountsRouter.get('/payments', readPerm, async (c) => {
  const firmId = c.get('firmId') as string;
  const db = getDb(c.env.DB);
  const rows = await db
    .select()
    .from(schema.feePayments)
    .where(and(eq(schema.feePayments.firmId, firmId), isNull(schema.feePayments.deletedAt)))
    .orderBy(desc(schema.feePayments.createdAt));
  return c.json(rows);
});

accountsRouter.post('/payments', enforceSubscriptionReadOnly, writePerm, async (c) => {
  const firm = c.get('firm') as schema.Firm;
  const firmId = c.get('firmId') as string;
  const user = c.get('user') as schema.User;
  const body = await c.req.json().catch(() => ({}));
  const parse = z
    .object({
      clientId: z.string().min(1),
      caseId: z.string().optional(),
      feeAgreementId: z.string().optional(),
      paymentDate: z.string().min(1),
      amountBdt: z.number().int().min(1).optional(),
      amountPaisa: z.number().int().min(1).optional(),
      method: z.enum(['cash', 'bank', 'bkash', 'nagad', 'cheque', 'other']),
      reference: z.string().optional(),
      purposeNote: z.string().min(1),
      idempotencyKey: z.string().optional(),
    })
    .safeParse(body);
  if (!parse.success) return c.json({ error: 'Validation failed', errors: parse.error.issues }, 400);

  const amountPaisa = parse.data.amountPaisa ?? (parse.data.amountBdt || 0) * 100;
  if (amountPaisa < 1) {
    return c.json({ error: 'Validation failed', message: 'amountPaisa must be greater than 0' }, 400);
  }

  const idempotencyKey = parse.data.idempotencyKey || crypto.randomUUID();
  const db = getDb(c.env.DB);
  const existing = await db
    .select()
    .from(schema.feePayments)
    .where(and(eq(schema.feePayments.firmId, firmId), eq(schema.feePayments.idempotencyKey, idempotencyKey)))
    .limit(1);
  if (existing[0]) return c.json(existing[0]);

  const clientRows = await db
    .select({ id: schema.clients.id })
    .from(schema.clients)
    .where(and(eq(schema.clients.id, parse.data.clientId), eq(schema.clients.firmId, firmId), isNull(schema.clients.deletedAt)))
    .limit(1);
  if (!clientRows[0]) return c.json({ error: 'NotFound', message: 'Client not found' }, 404);

  if (parse.data.caseId) {
    if (!(await canUserSeeCaseId(db, firm, user, parse.data.caseId))) {
      return c.json({ error: 'NotFound', message: 'Case not found or access denied' }, 404);
    }
    const caseRows = await db
      .select({ id: schema.cases.id, clientId: schema.cases.clientId })
      .from(schema.cases)
      .where(and(eq(schema.cases.id, parse.data.caseId), eq(schema.cases.firmId, firmId), isNull(schema.cases.deletedAt)))
      .limit(1);
    if (!caseRows[0] || caseRows[0].clientId !== parse.data.clientId) {
      return c.json({ error: 'BadRequest', message: 'Case does not belong to the specified client' }, 400);
    }
  }

  const chamberDb = new ChamberDatabase(db, c.env.DB);
  const receiptNumber = await chamberDb.getNextReceiptNumber(firmId);
  const paymentId = crypto.randomUUID();
  const now = new Date().toISOString();

  const newPayment = {
    id: paymentId,
    firmId,
    clientId: parse.data.clientId,
    caseId: parse.data.caseId || null,
    feeAgreementId: parse.data.feeAgreementId || null,
    hearingId: null,
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
      buildAuditEntry({ firmId, userId: user.id, userName: user.name, entity: 'FeePayment', entityId: paymentId, action: 'CREATE', newValue: newPayment, now })
    ),
  ] as any);

  return c.json(newPayment, 201);
});
