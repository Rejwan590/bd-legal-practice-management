import { Hono } from 'hono';
import { z } from 'zod';
import { Env, authMiddleware, enforceSubscriptionReadOnly, requireAnyPermission } from '../middleware/auth';
import { getDb } from '../db/client';
import * as schema from '../db/schema';
import { eq, and, isNull, desc, asc } from 'drizzle-orm';
import { getVisibleCaseIds, canUserSeeCaseId } from '../utils/visibility';
import { buildAuditEntry } from '../utils/audit';

export const expensesRouter = new Hono<{ Bindings: Env; Variables: any }>();

expensesRouter.use('*', authMiddleware);

const catReadPerm = requireAnyPermission(['accounts.view', 'accounts.manage', 'expenses.record', 'billing.view']);
const expReadPerm = requireAnyPermission(['accounts.view', 'billing.view', 'expenses.record']);
const expWritePerm = requireAnyPermission(['expenses.record', 'accounts.manage', 'billing.edit']);

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
  const filtered = rows
    .filter((e) => {
      if (e.caseId && visible !== 'ALL' && !visible.includes(e.caseId)) return false;
      if (clientId && e.clientId !== clientId) return false;
      if (caseId && e.caseId !== caseId) return false;
      if (categoryId && e.categoryId !== categoryId) return false;
      if (status && e.status !== status) return false;
      return true;
    })
    .map((e) => ({
      ...e,
      categoryName: catMap.get(e.categoryId) || undefined,
    }));

  return c.json(filtered);
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

  const catRows = await db
    .select({ name: schema.expenseCategories.name })
    .from(schema.expenseCategories)
    .where(eq(schema.expenseCategories.id, expense.categoryId))
    .limit(1);

  return c.json({ ...expense, categoryName: catRows[0]?.name });
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
  if (parse.data.caseId && !(await canUserSeeCaseId(db, firm, user, parse.data.caseId))) {
    return c.json({ error: 'NotFound', message: 'Case not found or access denied' }, 404);
  }

  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  const created = {
    id,
    firmId: firm.id,
    clientId: parse.data.clientId || null,
    caseId: parse.data.caseId || null,
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

  return c.json(created, 201);
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

  return c.json({ ...existing, ...updates });
});
