import { Hono } from 'hono';
import { z } from 'zod';
import { Env, authMiddleware, enforceSubscriptionReadOnly, requireAnyPermission } from '../middleware/auth';
import { getDb } from '../db/client';
import * as schema from '../db/schema';
import { eq, and, isNull, desc, asc } from 'drizzle-orm';
import { getVisibleCaseIds, canUserSeeCaseId } from '../utils/visibility';
import { buildAuditEntry } from '../utils/audit';
import { enrichExpenses } from '../utils/billing';

export const expensesRouter = new Hono<{ Bindings: Env; Variables: any }>();

expensesRouter.use('*', authMiddleware);

const catReadPerm = requireAnyPermission(['accounts.view', 'accounts.manage', 'expenses.record', 'billing.view', 'billing.manage']);
const expReadPerm = requireAnyPermission(['accounts.view', 'accounts.manage', 'billing.view', 'billing.manage', 'expenses.record']);
const expWritePerm = requireAnyPermission(['expenses.record', 'accounts.manage', 'billing.manage', 'billing.edit']);

const DEFAULT_EXPENSE_CATEGORIES = ['Court Fee', 'Photocopy & Printing', 'Clerk / Taidad', 'Travel & Conveyance', 'Miscellaneous'];

async function ensureDefaultExpenseCategories(db: any, firmId: string, userId: string) {
  const existing = await db
    .select()
    .from(schema.expenseCategories)
    .where(and(eq(schema.expenseCategories.firmId, firmId), isNull(schema.expenseCategories.deletedAt)))
    .orderBy(asc(schema.expenseCategories.name));

  if (existing.length > 0) return existing;

  const now = new Date().toISOString();
  const rows = DEFAULT_EXPENSE_CATEGORIES.map((name) => ({
    id: crypto.randomUUID(),
    firmId,
    name,
    isDefault: true,
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
    createdBy: userId,
    updatedBy: null,
  }));

  await db.batch(rows.map((r) => db.insert(schema.expenseCategories).values(r)) as any);
  return rows;
}

// GET /api/v1/expenses/categories
expensesRouter.get('/categories', catReadPerm, async (c) => {
  const firmId = c.get('firmId') as string;
  const user = c.get('user') as schema.User;
  const db = getDb(c.env.DB);
  const categories = await ensureDefaultExpenseCategories(db, firmId, user.id);
  return c.json(categories);
});

// GET /api/v1/expenses
expensesRouter.get('/', expReadPerm, async (c) => {
  const firm = c.get('firm') as schema.Firm;
  const user = c.get('user') as schema.User;
  const clientId = c.req.query('clientId');
  const caseId = c.req.query('caseId');
  const categoryId = c.req.query('categoryId');
  const status = c.req.query('status');
  const reimbursable = c.req.query('reimbursable');
  const search = (c.req.query('search') || '').trim().toLowerCase();

  const db = getDb(c.env.DB);
  const [rows, categories, visible] = await Promise.all([
    db
      .select()
      .from(schema.expenses)
      .where(and(eq(schema.expenses.firmId, firm.id), isNull(schema.expenses.deletedAt)))
      .orderBy(desc(schema.expenses.expenseDate), desc(schema.expenses.createdAt)),
    db
      .select()
      .from(schema.expenseCategories)
      .where(and(eq(schema.expenseCategories.firmId, firm.id), isNull(schema.expenseCategories.deletedAt))),
    getVisibleCaseIds(db, firm, user),
  ]);

  const catMap = new Map(categories.map((cat) => [cat.id, cat.name]));
  const filtered = rows.filter((e) => {
    if (e.caseId && visible !== 'ALL' && !visible.includes(e.caseId)) return false;
    if (clientId && e.clientId !== clientId) return false;
    if (caseId && e.caseId !== caseId) return false;
    if (categoryId && e.categoryId !== categoryId) return false;
    if (status && status !== 'all' && e.status !== status) return false;
    if (reimbursable === 'true' && !e.reimbursable) return false;
    if (reimbursable === 'false' && e.reimbursable) return false;
    return true;
  });

  const enriched = await enrichExpenses(db, firm.id, filtered, catMap);
  if (!search) return c.json(enriched);

  return c.json(
    enriched.filter((e) => {
      const hay = [
        e.description,
        e.categoryName,
        e.clientName,
        e.clientNameBn,
        e.caseNumber,
        e.caseTitle,
        e.expenseDate,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      return hay.includes(search);
    })
  );
});

// GET /api/v1/expenses/:id
expensesRouter.get('/:id', expReadPerm, async (c) => {
  const firm = c.get('firm') as schema.Firm;
  const user = c.get('user') as schema.User;
  const id = c.req.param('id') as string;
  const db = getDb(c.env.DB);

  const rows = await db
    .select()
    .from(schema.expenses)
    .where(and(eq(schema.expenses.id, id), eq(schema.expenses.firmId, firm.id), isNull(schema.expenses.deletedAt)))
    .limit(1);

  const expense = rows[0];
  if (!expense) return c.json({ error: 'NotFound', message: 'Expense not found' }, 404);
  if (expense.caseId && !(await canUserSeeCaseId(db, firm, user, expense.caseId))) {
    return c.json({ error: 'NotFound', message: 'Expense not found' }, 404);
  }

  const [enriched] = await enrichExpenses(db, firm.id, [expense]);
  return c.json(enriched);
});

// POST /api/v1/expenses
expensesRouter.post('/', enforceSubscriptionReadOnly, expWritePerm, async (c) => {
  const firm = c.get('firm') as schema.Firm;
  const user = c.get('user') as schema.User;
  const body = await c.req.json().catch(() => ({}));

  const createSchema = z.object({
    clientId: z.string().nullable().optional(),
    caseId: z.string().nullable().optional(),
    categoryId: z.string().min(1),
    expenseDate: z.string().min(1),
    amountPaisa: z.number().int().min(1),
    description: z.string().min(1),
    reimbursable: z.boolean().default(true),
  });

  const parse = createSchema.safeParse(body);
  if (!parse.success) return c.json({ error: 'ValidationError', details: parse.error.issues }, 400);

  const db = getDb(c.env.DB);
  const catRows = await db
    .select({ id: schema.expenseCategories.id })
    .from(schema.expenseCategories)
    .where(
      and(
        eq(schema.expenseCategories.id, parse.data.categoryId),
        eq(schema.expenseCategories.firmId, firm.id),
        isNull(schema.expenseCategories.deletedAt)
      )
    )
    .limit(1);
  if (!catRows[0]) {
    return c.json({ error: 'NotFound', message: 'Expense category not found' }, 404);
  }

  let resolvedClientId = parse.data.clientId || null;
  const resolvedCaseId = parse.data.caseId || null;

  if (resolvedCaseId) {
    if (!(await canUserSeeCaseId(db, firm, user, resolvedCaseId))) {
      return c.json({ error: 'NotFound', message: 'Case not found or access denied' }, 404);
    }
    const caseRows = await db
      .select({ id: schema.cases.id, clientId: schema.cases.clientId })
      .from(schema.cases)
      .where(and(eq(schema.cases.id, resolvedCaseId), eq(schema.cases.firmId, firm.id), isNull(schema.cases.deletedAt)))
      .limit(1);
    const caseRec = caseRows[0];
    if (!caseRec) {
      return c.json({ error: 'NotFound', message: 'Case not found' }, 404);
    }
    if (resolvedClientId && caseRec.clientId !== resolvedClientId) {
      return c.json({ error: 'BadRequest', message: 'Case does not belong to the specified client' }, 400);
    }
    if (!resolvedClientId) resolvedClientId = caseRec.clientId;
  }

  if (!resolvedClientId) {
    return c.json({ error: 'ValidationError', message: 'Client association is required for an expense record' }, 400);
  }

  const clientRows = await db
    .select({ id: schema.clients.id })
    .from(schema.clients)
    .where(and(eq(schema.clients.id, resolvedClientId), eq(schema.clients.firmId, firm.id), isNull(schema.clients.deletedAt)))
    .limit(1);
  if (!clientRows[0]) {
    return c.json({ error: 'NotFound', message: 'Client not found' }, 404);
  }

  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  const created = {
    id,
    firmId: firm.id,
    clientId: resolvedClientId,
    caseId: resolvedCaseId,
    categoryId: parse.data.categoryId,
    expenseDate: parse.data.expenseDate,
    amountPaisa: parse.data.amountPaisa,
    description: parse.data.description,
    reimbursable: parse.data.reimbursable,
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

  await db.batch([
    db.insert(schema.expenses).values(created),
    db.insert(schema.auditLog).values(
      buildAuditEntry({
        firmId: firm.id,
        userId: user.id,
        userName: user.name,
        entity: 'Expense',
        entityId: id,
        action: 'CREATE',
        newValue: created,
        now,
      })
    ),
  ] as any);

  const [enriched] = await enrichExpenses(db, firm.id, [created]);
  return c.json(enriched, 201);
});

// PATCH /api/v1/expenses/:id
expensesRouter.patch('/:id', enforceSubscriptionReadOnly, expWritePerm, async (c) => {
  const firm = c.get('firm') as schema.Firm;
  const user = c.get('user') as schema.User;
  const id = c.req.param('id') as string;
  const body = await c.req.json().catch(() => ({}));

  const updateSchema = z.object({
    clientId: z.string().min(1).optional(),
    caseId: z.string().nullable().optional(),
    categoryId: z.string().min(1).optional(),
    expenseDate: z.string().min(1).optional(),
    amountPaisa: z.number().int().min(1).optional(),
    description: z.string().min(1).optional(),
    reimbursable: z.boolean().optional(),
  });

  const parse = updateSchema.safeParse(body);
  if (!parse.success) return c.json({ error: 'ValidationError', details: parse.error.issues }, 400);

  const db = getDb(c.env.DB);
  const rows = await db
    .select()
    .from(schema.expenses)
    .where(and(eq(schema.expenses.id, id), eq(schema.expenses.firmId, firm.id), isNull(schema.expenses.deletedAt)))
    .limit(1);

  const existing = rows[0];
  if (!existing) return c.json({ error: 'NotFound', message: 'Expense not found' }, 404);
  if (existing.caseId && !(await canUserSeeCaseId(db, firm, user, existing.caseId))) {
    return c.json({ error: 'NotFound', message: 'Expense not found' }, 404);
  }
  if (existing.status !== 'posted') {
    return c.json({ error: 'BadRequest', message: 'Only posted expenses can be edited' }, 400);
  }

  if (parse.data.categoryId) {
    const catRows = await db
      .select({ id: schema.expenseCategories.id })
      .from(schema.expenseCategories)
      .where(
        and(
          eq(schema.expenseCategories.id, parse.data.categoryId),
          eq(schema.expenseCategories.firmId, firm.id),
          isNull(schema.expenseCategories.deletedAt)
        )
      )
      .limit(1);
    if (!catRows[0]) return c.json({ error: 'NotFound', message: 'Expense category not found' }, 404);
  }

  let nextClientId = parse.data.clientId !== undefined ? parse.data.clientId : existing.clientId;
  const nextCaseId = parse.data.caseId !== undefined ? parse.data.caseId : existing.caseId;

  if (nextCaseId) {
    if (!(await canUserSeeCaseId(db, firm, user, nextCaseId))) {
      return c.json({ error: 'NotFound', message: 'Case not found or access denied' }, 404);
    }
    const caseRows = await db
      .select({ id: schema.cases.id, clientId: schema.cases.clientId })
      .from(schema.cases)
      .where(and(eq(schema.cases.id, nextCaseId), eq(schema.cases.firmId, firm.id), isNull(schema.cases.deletedAt)))
      .limit(1);
    const caseRec = caseRows[0];
    if (!caseRec) return c.json({ error: 'NotFound', message: 'Case not found' }, 404);
    if (parse.data.clientId !== undefined && caseRec.clientId !== parse.data.clientId) {
      return c.json({ error: 'BadRequest', message: 'Case does not belong to the specified client' }, 400);
    }
    if (parse.data.caseId !== undefined && parse.data.clientId === undefined) {
      nextClientId = caseRec.clientId;
    } else if (nextClientId && caseRec.clientId !== nextClientId) {
      return c.json({ error: 'BadRequest', message: 'Case does not belong to the specified client' }, 400);
    }
  }

  if (!nextClientId) {
    return c.json({ error: 'ValidationError', message: 'Client association is required for an expense record' }, 400);
  }

  if (parse.data.clientId !== undefined || nextClientId !== existing.clientId) {
    const clientRows = await db
      .select({ id: schema.clients.id })
      .from(schema.clients)
      .where(and(eq(schema.clients.id, nextClientId), eq(schema.clients.firmId, firm.id), isNull(schema.clients.deletedAt)))
      .limit(1);
    if (!clientRows[0]) return c.json({ error: 'NotFound', message: 'Client not found' }, 404);
  }

  const now = new Date().toISOString();
  const updates = {
    clientId: nextClientId,
    caseId: nextCaseId ?? null,
    categoryId: parse.data.categoryId ?? existing.categoryId,
    expenseDate: parse.data.expenseDate ?? existing.expenseDate,
    amountPaisa: parse.data.amountPaisa ?? existing.amountPaisa,
    description: parse.data.description ?? existing.description,
    reimbursable: parse.data.reimbursable !== undefined ? parse.data.reimbursable : existing.reimbursable,
    updatedAt: now,
    updatedBy: user.id,
  };

  await db.batch([
    db.update(schema.expenses).set(updates).where(and(eq(schema.expenses.id, id), eq(schema.expenses.firmId, firm.id))),
    db.insert(schema.auditLog).values(
      buildAuditEntry({
        firmId: firm.id,
        userId: user.id,
        userName: user.name,
        entity: 'Expense',
        entityId: id,
        action: 'UPDATE',
        oldValue: {
          clientId: existing.clientId,
          caseId: existing.caseId,
          categoryId: existing.categoryId,
          expenseDate: existing.expenseDate,
          amountPaisa: existing.amountPaisa,
          description: existing.description,
          reimbursable: existing.reimbursable,
        },
        newValue: updates,
        now,
      })
    ),
  ] as any);

  const [enriched] = await enrichExpenses(db, firm.id, [{ ...existing, ...updates }]);
  return c.json(enriched);
});

// POST /api/v1/expenses/:id/void
expensesRouter.post('/:id/void', enforceSubscriptionReadOnly, expWritePerm, async (c) => {
  const firm = c.get('firm') as schema.Firm;
  const user = c.get('user') as schema.User;
  const id = c.req.param('id') as string;
  const body = await c.req.json().catch(() => ({}));

  const parse = z.object({ reason: z.string().min(1) }).safeParse(body);
  if (!parse.success) return c.json({ error: 'ValidationError', details: parse.error.issues }, 400);

  const db = getDb(c.env.DB);
  const rows = await db
    .select()
    .from(schema.expenses)
    .where(and(eq(schema.expenses.id, id), eq(schema.expenses.firmId, firm.id), isNull(schema.expenses.deletedAt)))
    .limit(1);

  const existing = rows[0];
  if (!existing) return c.json({ error: 'NotFound', message: 'Expense not found' }, 404);
  if (existing.caseId && !(await canUserSeeCaseId(db, firm, user, existing.caseId))) {
    return c.json({ error: 'NotFound', message: 'Expense not found' }, 404);
  }
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
    db.update(schema.expenses).set(updates).where(and(eq(schema.expenses.id, id), eq(schema.expenses.firmId, firm.id))),
    db.insert(schema.auditLog).values(
      buildAuditEntry({
        firmId: firm.id,
        userId: user.id,
        userName: user.name,
        entity: 'Expense',
        entityId: id,
        action: 'VOID',
        oldValue: { status: existing.status },
        newValue: updates,
        now,
      })
    ),
  ] as any);

  const [enriched] = await enrichExpenses(db, firm.id, [{ ...existing, ...updates }]);
  return c.json(enriched);
});
