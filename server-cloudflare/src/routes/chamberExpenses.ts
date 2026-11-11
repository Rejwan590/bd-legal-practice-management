import { Hono } from 'hono';
import { z } from 'zod';
import { Env, authMiddleware, enforceSubscriptionReadOnly, requireAnyPermission } from '../middleware/auth';
import { getDb } from '../db/client';
import * as schema from '../db/schema';
import { eq, and, isNull, desc, asc } from 'drizzle-orm';
import { buildAuditEntry } from '../utils/audit';

export const chamberExpensesRouter = new Hono<{ Bindings: Env; Variables: any }>();

chamberExpensesRouter.use('*', authMiddleware);

const readPerm = requireAnyPermission(['chamber_expenses.view', 'accounts.view', 'billing.view']);
const recordPerm = requireAnyPermission(['chamber_expenses.record', 'chamber_expenses.manage', 'accounts.manage']);
const managePerm = requireAnyPermission(['chamber_expenses.manage', 'accounts.manage']);

const DEFAULT_CHAMBER_CATEGORIES: Array<{ name: string; nameBn: string; kind: 'general' | 'salary' }> = [
  { name: 'Office Rent', nameBn: 'চেম্বার ভাড়া', kind: 'general' },
  { name: 'Utilities & Internet', nameBn: 'বিদ্যুৎ ও ইন্টারনেট', kind: 'general' },
  { name: 'Staff Salary', nameBn: 'কর্মচারী বেতন', kind: 'salary' },
  { name: 'Stationery & Supplies', nameBn: 'স্টেশনারি ও সাপ্লাই', kind: 'general' },
];

async function ensureDefaultChamberCategories(db: any, firmId: string, userId: string) {
  const existing = await db
    .select()
    .from(schema.chamberExpenseCategories)
    .where(and(eq(schema.chamberExpenseCategories.firmId, firmId), isNull(schema.chamberExpenseCategories.deletedAt)))
    .orderBy(asc(schema.chamberExpenseCategories.name));
  if (existing.length > 0) return existing;

  const now = new Date().toISOString();
  const rows = DEFAULT_CHAMBER_CATEGORIES.map((c) => ({
    id: crypto.randomUUID(),
    firmId,
    name: c.name,
    nameBn: c.nameBn,
    kind: c.kind,
    isDefault: true,
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
    createdBy: userId,
    updatedBy: null,
  }));
  await db.batch(rows.map((r) => db.insert(schema.chamberExpenseCategories).values(r)) as any);
  return rows;
}

// GET /api/v1/chamber-expenses/categories
chamberExpensesRouter.get('/categories', readPerm, async (c) => {
  const firmId = c.get('firmId') as string;
  const user = c.get('user') as schema.User;
  const db = getDb(c.env.DB);
  const categories = await ensureDefaultChamberCategories(db, firmId, user.id);
  return c.json(categories);
});

// POST /api/v1/chamber-expenses/categories
chamberExpensesRouter.post('/categories', enforceSubscriptionReadOnly, managePerm, async (c) => {
  const firmId = c.get('firmId') as string;
  const user = c.get('user') as schema.User;
  const body = await c.req.json().catch(() => ({}));
  const parse = z
    .object({
      name: z.string().min(1).max(120),
      nameBn: z.string().nullable().optional(),
      kind: z.enum(['general', 'salary']).default('general'),
    })
    .safeParse(body);
  if (!parse.success) return c.json({ error: 'ValidationError', details: parse.error.issues }, 400);

  const now = new Date().toISOString();
  const created = {
    id: crypto.randomUUID(),
    firmId,
    name: parse.data.name.trim(),
    nameBn: parse.data.nameBn ?? null,
    kind: parse.data.kind,
    isDefault: false,
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
    createdBy: user.id,
    updatedBy: null,
  };

  const db = getDb(c.env.DB);
  await db.batch([
    db.insert(schema.chamberExpenseCategories).values(created),
    db.insert(schema.auditLog).values(
      buildAuditEntry({
        firmId,
        userId: user.id,
        userName: user.name,
        entity: 'ChamberExpenseCategory',
        entityId: created.id,
        action: 'CREATE',
        newValue: created,
        now,
      })
    ),
  ] as any);

  return c.json(created, 201);
});

// GET /api/v1/chamber-expenses/summary
chamberExpensesRouter.get('/summary', readPerm, async (c) => {
  const firmId = c.get('firmId') as string;
  const monthParam = c.req.query('month'); // optional YYYY-MM
  const db = getDb(c.env.DB);

  const [allExp, cats] = await Promise.all([
    db
      .select()
      .from(schema.chamberExpenses)
      .where(and(eq(schema.chamberExpenses.firmId, firmId), isNull(schema.chamberExpenses.deletedAt))),
    db
      .select()
      .from(schema.chamberExpenseCategories)
      .where(and(eq(schema.chamberExpenseCategories.firmId, firmId), isNull(schema.chamberExpenseCategories.deletedAt))),
  ]);

  const now = new Date();
  const targetMonth = monthParam || `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`;
  const [y, m] = targetMonth.split('-').map(Number);
  const prevDate = new Date(Date.UTC(y, m - 2, 1));
  const lastMonth = `${prevDate.getUTCFullYear()}-${String(prevDate.getUTCMonth() + 1).padStart(2, '0')}`;

  const catMap = new Map(cats.map((cat) => [cat.id, cat]));
  const posted = allExp.filter((e) => e.status === 'posted');

  let totalThisMonthPaisa = 0;
  let totalLastMonthPaisa = 0;
  let totalSalaryThisMonthPaisa = 0;
  const byCatMap = new Map<string, { categoryId: string; categoryName: string; categoryNameBn: string | null; categoryKind: string; totalPaisa: number; count: number }>();

  for (const exp of posted) {
    const expMonth = exp.expenseDate.slice(0, 7);
    const cat = catMap.get(exp.categoryId);
    if (expMonth === targetMonth) {
      totalThisMonthPaisa += exp.amountPaisa;
      if (cat?.kind === 'salary') totalSalaryThisMonthPaisa += exp.amountPaisa;
      const entry = byCatMap.get(exp.categoryId) || {
        categoryId: exp.categoryId,
        categoryName: cat?.name || 'Other',
        categoryNameBn: cat?.nameBn || null,
        categoryKind: cat?.kind || 'general',
        totalPaisa: 0,
        count: 0,
      };
      entry.totalPaisa += exp.amountPaisa;
      entry.count += 1;
      byCatMap.set(exp.categoryId, entry);
    } else if (expMonth === lastMonth) {
      totalLastMonthPaisa += exp.amountPaisa;
    }
  }

  return c.json({
    totalThisMonthPaisa,
    totalLastMonthPaisa,
    totalSalaryThisMonthPaisa,
    byCategory: Array.from(byCatMap.values()),
  });
});

// ==========================================
// CHAMBER ADVANCES & SETTLEMENTS
// ==========================================
chamberExpensesRouter.get('/advances', readPerm, async (c) => {
  const firmId = c.get('firmId') as string;
  const status = c.req.query('status');
  const db = getDb(c.env.DB);

  const [advances, settlements] = await Promise.all([
    db
      .select()
      .from(schema.chamberAdvances)
      .where(and(eq(schema.chamberAdvances.firmId, firmId), isNull(schema.chamberAdvances.deletedAt)))
      .orderBy(desc(schema.chamberAdvances.givenDate), desc(schema.chamberAdvances.createdAt)),
    db
      .select()
      .from(schema.chamberAdvanceSettlements)
      .where(and(eq(schema.chamberAdvanceSettlements.firmId, firmId), isNull(schema.chamberAdvanceSettlements.deletedAt))),
  ]);

  const settledMap = new Map<string, number>();
  for (const s of settlements) {
    settledMap.set(s.advanceId, (settledMap.get(s.advanceId) || 0) + s.amountPaisa);
  }

  const enriched = advances
    .filter((a) => !status || a.status === status)
    .map((a) => {
      const settledPaisa = settledMap.get(a.id) || 0;
      return {
        ...a,
        settledAmountPaisa: settledPaisa,
        remainingAmountPaisa: Math.max(0, a.amountPaisa - settledPaisa),
      };
    });

  return c.json(enriched);
});

chamberExpensesRouter.get('/advances/:id', readPerm, async (c) => {
  const firmId = c.get('firmId') as string;
  const id = c.req.param('id') as string;
  const db = getDb(c.env.DB);

  const [advRows, settlements] = await Promise.all([
    db
      .select()
      .from(schema.chamberAdvances)
      .where(and(eq(schema.chamberAdvances.id, id), eq(schema.chamberAdvances.firmId, firmId), isNull(schema.chamberAdvances.deletedAt)))
      .limit(1),
    db
      .select()
      .from(schema.chamberAdvanceSettlements)
      .where(and(eq(schema.chamberAdvanceSettlements.advanceId, id), eq(schema.chamberAdvanceSettlements.firmId, firmId), isNull(schema.chamberAdvanceSettlements.deletedAt)))
      .orderBy(desc(schema.chamberAdvanceSettlements.settledDate)),
  ]);

  const adv = advRows[0];
  if (!adv) return c.json({ error: 'NotFound', message: 'Advance not found' }, 404);
  const settledPaisa = settlements.reduce((sum, s) => sum + s.amountPaisa, 0);

  return c.json({
    ...adv,
    settledAmountPaisa: settledPaisa,
    remainingAmountPaisa: Math.max(0, adv.amountPaisa - settledPaisa),
    settlements,
  });
});

chamberExpensesRouter.post('/advances', enforceSubscriptionReadOnly, recordPerm, async (c) => {
  const firmId = c.get('firmId') as string;
  const user = c.get('user') as schema.User;
  const body = await c.req.json().catch(() => ({}));

  const parse = z
    .object({
      givenTo: z.string().min(1),
      givenToUserId: z.string().nullable().optional(),
      amountPaisa: z.number().int().min(1),
      givenDate: z.string().min(1),
      purpose: z.string().min(1),
      paymentMethod: z.enum(['cash', 'bank', 'mobile_banking', 'cheque', 'other']),
    })
    .safeParse(body);
  if (!parse.success) return c.json({ error: 'ValidationError', details: parse.error.issues }, 400);

  const id = `ch-adv-${crypto.randomUUID()}`;
  const now = new Date().toISOString();
  const created = {
    id,
    firmId,
    givenTo: parse.data.givenTo,
    givenToUserId: parse.data.givenToUserId ?? null,
    amountPaisa: parse.data.amountPaisa,
    givenDate: parse.data.givenDate,
    purpose: parse.data.purpose,
    paymentMethod: parse.data.paymentMethod,
    status: 'open' as const,
    voidReason: null,
    voidedBy: null,
    voidedAt: null,
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
    createdBy: user.id,
    updatedBy: null,
  };

  const db = getDb(c.env.DB);
  await db.batch([
    db.insert(schema.chamberAdvances).values(created),
    db.insert(schema.auditLog).values(
      buildAuditEntry({
        firmId,
        userId: user.id,
        userName: user.name,
        entity: 'ChamberAdvance',
        entityId: id,
        action: 'CREATE',
        newValue: created,
        now,
      })
    ),
  ] as any);

  return c.json({ ...created, settledAmountPaisa: 0, remainingAmountPaisa: created.amountPaisa }, 201);
});

chamberExpensesRouter.post('/advances/:id/settle', enforceSubscriptionReadOnly, recordPerm, async (c) => {
  const firmId = c.get('firmId') as string;
  const user = c.get('user') as schema.User;
  const advanceId = c.req.param('id') as string;
  const body = await c.req.json().catch(() => ({}));

  const parse = z
    .object({
      type: z.enum(['expense', 'refund']),
      expenseId: z.string().nullable().optional(),
      amountPaisa: z.number().int().min(1),
      settledDate: z.string().min(1),
      notes: z.string().nullable().optional(),
    })
    .safeParse(body);
  if (!parse.success) return c.json({ error: 'ValidationError', details: parse.error.issues }, 400);

  const db = getDb(c.env.DB);
  const [advRows, existingSettlements] = await Promise.all([
    db
      .select()
      .from(schema.chamberAdvances)
      .where(and(eq(schema.chamberAdvances.id, advanceId), eq(schema.chamberAdvances.firmId, firmId), isNull(schema.chamberAdvances.deletedAt)))
      .limit(1),
    db
      .select({ amountPaisa: schema.chamberAdvanceSettlements.amountPaisa })
      .from(schema.chamberAdvanceSettlements)
      .where(and(eq(schema.chamberAdvanceSettlements.advanceId, advanceId), eq(schema.chamberAdvanceSettlements.firmId, firmId), isNull(schema.chamberAdvanceSettlements.deletedAt))),
  ]);

  const adv = advRows[0];
  if (!adv) return c.json({ error: 'NotFound', message: 'Advance not found' }, 404);
  if (adv.status !== 'open') return c.json({ error: 'BadRequest', message: 'Advance is not open' }, 400);

  const alreadySettled = existingSettlements.reduce((sum, s) => sum + s.amountPaisa, 0);
  const nextSettled = alreadySettled + parse.data.amountPaisa;
  if (nextSettled > adv.amountPaisa) {
    return c.json({ error: 'BadRequest', message: 'Settlement amount exceeds remaining advance balance' }, 400);
  }

  const now = new Date().toISOString();
  const created = {
    id: `ch-set-${crypto.randomUUID()}`,
    firmId,
    advanceId,
    type: parse.data.type,
    expenseId: parse.data.expenseId ?? null,
    amountPaisa: parse.data.amountPaisa,
    settledDate: parse.data.settledDate,
    notes: parse.data.notes ?? null,
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
    createdBy: user.id,
    updatedBy: user.id,
  };

  const stmts: any[] = [
    db.insert(schema.chamberAdvanceSettlements).values(created),
    db.insert(schema.auditLog).values(
      buildAuditEntry({
        firmId,
        userId: user.id,
        userName: user.name,
        entity: 'ChamberAdvanceSettlement',
        entityId: created.id,
        action: 'UPDATE',
        newValue: created,
        now,
      })
    ),
  ];

  if (nextSettled === adv.amountPaisa) {
    stmts.push(
      db
        .update(schema.chamberAdvances)
        .set({ status: 'settled', updatedAt: now, updatedBy: user.id })
        .where(and(eq(schema.chamberAdvances.id, advanceId), eq(schema.chamberAdvances.firmId, firmId)))
    );
  }

  await db.batch(stmts as any);
  return c.json(created, 201);
});

chamberExpensesRouter.post('/advances/:id/void', enforceSubscriptionReadOnly, managePerm, async (c) => {
  const firmId = c.get('firmId') as string;
  const user = c.get('user') as schema.User;
  const id = c.req.param('id') as string;
  const body = await c.req.json().catch(() => ({}));
  const parse = z.object({ reason: z.string().min(1) }).safeParse(body);
  if (!parse.success) return c.json({ error: 'ValidationError', details: parse.error.issues }, 400);

  const db = getDb(c.env.DB);
  const rows = await db
    .select()
    .from(schema.chamberAdvances)
    .where(and(eq(schema.chamberAdvances.id, id), eq(schema.chamberAdvances.firmId, firmId), isNull(schema.chamberAdvances.deletedAt)))
    .limit(1);
  const adv = rows[0];
  if (!adv) return c.json({ error: 'NotFound', message: 'Advance not found' }, 404);
  if (adv.status === 'void') return c.json({ error: 'BadRequest', message: 'Advance is already voided' }, 400);

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
    db.update(schema.chamberAdvances).set(updates).where(and(eq(schema.chamberAdvances.id, id), eq(schema.chamberAdvances.firmId, firmId))),
    db.insert(schema.auditLog).values(
      buildAuditEntry({
        firmId,
        userId: user.id,
        userName: user.name,
        entity: 'ChamberAdvance',
        entityId: id,
        action: 'VOID',
        oldValue: { status: adv.status },
        newValue: updates,
        now,
      })
    ),
  ] as any);

  return c.json({ ...adv, ...updates });
});

// ==========================================
// CHAMBER EXPENSES CRUD
// ==========================================
chamberExpensesRouter.get('/', readPerm, async (c) => {
  const firmId = c.get('firmId') as string;
  const categoryId = c.req.query('categoryId');
  const status = c.req.query('status');
  const fromDate = c.req.query('fromDate');
  const toDate = c.req.query('toDate');
  const db = getDb(c.env.DB);

  const [rows, cats] = await Promise.all([
    db
      .select()
      .from(schema.chamberExpenses)
      .where(and(eq(schema.chamberExpenses.firmId, firmId), isNull(schema.chamberExpenses.deletedAt)))
      .orderBy(desc(schema.chamberExpenses.expenseDate), desc(schema.chamberExpenses.createdAt)),
    db
      .select()
      .from(schema.chamberExpenseCategories)
      .where(and(eq(schema.chamberExpenseCategories.firmId, firmId), isNull(schema.chamberExpenseCategories.deletedAt))),
  ]);

  const catMap = new Map(cats.map((cat) => [cat.id, cat]));
  const filtered = rows
    .filter((e) => {
      if (categoryId && e.categoryId !== categoryId) return false;
      if (status && e.status !== status) return false;
      if (fromDate && e.expenseDate < fromDate) return false;
      if (toDate && e.expenseDate > toDate) return false;
      return true;
    })
    .map((e) => {
      const cat = catMap.get(e.categoryId);
      return {
        ...e,
        categoryName: cat?.name,
        categoryKind: cat?.kind,
      };
    });

  return c.json(filtered);
});

chamberExpensesRouter.get('/:id', readPerm, async (c) => {
  const firmId = c.get('firmId') as string;
  const id = c.req.param('id') as string;
  const db = getDb(c.env.DB);

  const rows = await db
    .select()
    .from(schema.chamberExpenses)
    .where(and(eq(schema.chamberExpenses.id, id), eq(schema.chamberExpenses.firmId, firmId), isNull(schema.chamberExpenses.deletedAt)))
    .limit(1);
  if (!rows[0]) return c.json({ error: 'NotFound', message: 'Expense not found' }, 404);
  return c.json(rows[0]);
});

chamberExpensesRouter.post('/', enforceSubscriptionReadOnly, recordPerm, async (c) => {
  const firmId = c.get('firmId') as string;
  const user = c.get('user') as schema.User;
  const body = await c.req.json().catch(() => ({}));

  const parse = z
    .object({
      categoryId: z.string().min(1),
      description: z.string().min(1),
      amountPaisa: z.number().int().min(1),
      expenseDate: z.string().min(1),
      paidTo: z.string().min(1),
      paymentMethod: z.enum(['cash', 'bank', 'mobile_banking', 'cheque', 'other']),
      receiptRef: z.string().nullable().optional(),
      notes: z.string().nullable().optional(),
      advanceId: z.string().nullable().optional(),
    })
    .safeParse(body);
  if (!parse.success) return c.json({ error: 'ValidationError', details: parse.error.issues }, 400);

  const id = `ch-exp-${crypto.randomUUID()}`;
  const now = new Date().toISOString();
  const created = {
    id,
    firmId,
    categoryId: parse.data.categoryId,
    description: parse.data.description,
    amountPaisa: parse.data.amountPaisa,
    expenseDate: parse.data.expenseDate,
    paidTo: parse.data.paidTo,
    paymentMethod: parse.data.paymentMethod,
    receiptRef: parse.data.receiptRef ?? null,
    notes: parse.data.notes ?? null,
    advanceId: parse.data.advanceId ?? null,
    status: 'posted' as const,
    voidReason: null,
    voidedBy: null,
    voidedAt: null,
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
    createdBy: user.id,
    updatedBy: null,
  };

  const db = getDb(c.env.DB);
  await db.batch([
    db.insert(schema.chamberExpenses).values(created),
    db.insert(schema.auditLog).values(
      buildAuditEntry({
        firmId,
        userId: user.id,
        userName: user.name,
        entity: 'ChamberExpense',
        entityId: id,
        action: 'CREATE',
        newValue: created,
        now,
      })
    ),
  ] as any);

  return c.json(created, 201);
});

chamberExpensesRouter.post('/:id/void', enforceSubscriptionReadOnly, managePerm, async (c) => {
  const firmId = c.get('firmId') as string;
  const user = c.get('user') as schema.User;
  const id = c.req.param('id') as string;
  const body = await c.req.json().catch(() => ({}));
  const parse = z.object({ reason: z.string().min(1) }).safeParse(body);
  if (!parse.success) return c.json({ error: 'ValidationError', details: parse.error.issues }, 400);

  const db = getDb(c.env.DB);
  const rows = await db
    .select()
    .from(schema.chamberExpenses)
    .where(and(eq(schema.chamberExpenses.id, id), eq(schema.chamberExpenses.firmId, firmId), isNull(schema.chamberExpenses.deletedAt)))
    .limit(1);
  const existing = rows[0];
  if (!existing) return c.json({ error: 'NotFound', message: 'Expense not found' }, 404);
  if (existing.status === 'void') return c.json({ error: 'BadRequest', message: 'Expense is already voided' }, 400);

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
    db.update(schema.chamberExpenses).set(updates).where(and(eq(schema.chamberExpenses.id, id), eq(schema.chamberExpenses.firmId, firmId))),
    db.insert(schema.auditLog).values(
      buildAuditEntry({
        firmId,
        userId: user.id,
        userName: user.name,
        entity: 'ChamberExpense',
        entityId: id,
        action: 'VOID',
        oldValue: { status: existing.status },
        newValue: updates,
        now,
      })
    ),
  ] as any);

  return c.json({ ...existing, ...updates });
});
