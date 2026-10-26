import crypto from 'crypto';
import { Router, Response } from 'express';
import { z } from 'zod';
import { authMiddleware, AuthenticatedRequest } from '../middleware/auth.js';
import { requirePermission } from '../middleware/permission.js';
import { enforceFirmIsolation } from '../middleware/firmIsolation.js';
import { enforceSubscriptionReadOnly } from '../middleware/subscription.js';
import { getDatabase } from '../db/client.js';
import { recordAudit } from '../services/auditService.js';

export const expensesRouter = Router();

expensesRouter.use(authMiddleware);
expensesRouter.use(enforceFirmIsolation);

const recordExpenseSchema = z.object({
  clientId: z.string().optional().nullable(),
  caseId: z.string().optional().nullable(),
  categoryId: z.string().min(1, 'categoryId is required'),
  expenseDate: z.string().min(1, 'expenseDate is required'),
  amountPaisa: z.number().int().positive('Expense amount must be greater than 0'),
  description: z.string().trim().min(1, 'description is required').max(500, 'description too long'),
  reimbursable: z.boolean().default(true),
});

const voidExpenseSchema = z.object({
  reason: z.string().trim().min(3, 'Reason must be at least 3 characters').max(500, 'Reason too long'),
});

// GET /api/v1/expenses/categories - List expense categories
expensesRouter.get(
  '/categories',
  async (req: AuthenticatedRequest, res: Response) => {
    const hasPerm =
      req.user?.role === 'Owner' ||
      (req.user?.permissions &&
        (req.user.permissions.includes('accounts.view') ||
          req.user.permissions.includes('expenses.record') ||
          req.user.permissions.includes('accounts.manage')));
    if (!hasPerm) {
      return res.status(403).json({ error: 'Forbidden', message: 'Permission denied' });
    }

    const db = getDatabase();
    const firmId = req.user!.firmId;
    const categories = await db.listExpenseCategories(firmId);
    res.json(categories);
  }
);

// GET /api/v1/expenses - List expenses
expensesRouter.get(
  '/',
  requirePermission('accounts.view'),
  async (req: AuthenticatedRequest, res: Response) => {
    const db = getDatabase();
    const firmId = req.user!.firmId;

    const list = await db.listExpenses(
      firmId,
      {
        clientId: req.query.clientId as string | undefined,
        caseId: req.query.caseId as string | undefined,
        categoryId: req.query.categoryId as string | undefined,
        status: req.query.status as string | undefined,
      },
      req.user
    );

    res.json(list);
  }
);

// GET /api/v1/expenses/:id - Get single expense
expensesRouter.get(
  '/:id',
  requirePermission('accounts.view'),
  async (req: AuthenticatedRequest, res: Response) => {
    const db = getDatabase();
    const firmId = req.user!.firmId;

    const expense = await db.getExpenseById(req.params.id, firmId, req.user);
    if (!expense || expense.firmId !== firmId) {
      return res.status(404).json({ error: 'NotFound', message: 'Expense not found' });
    }

    res.json(expense);
  }
);

// POST /api/v1/expenses - Record expense
expensesRouter.post(
  '/',
  requirePermission('expenses.record'),
  enforceSubscriptionReadOnly,
  async (req: AuthenticatedRequest, res: Response) => {
    const parsed = recordExpenseSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'ValidationError', details: parsed.error.issues });
    }

    const db = getDatabase();
    const firmId = req.user!.firmId;

    // Validate client visibility if provided
    if (parsed.data.clientId) {
      const client = await db.getClientById(parsed.data.clientId, firmId, req.user);
      if (!client || client.firmId !== firmId) {
        return res.status(404).json({ error: 'NotFound', message: 'Client not found or access denied' });
      }
    }

    // Validate case visibility if provided
    if (parsed.data.caseId) {
      const caseRec = await db.getCaseById(parsed.data.caseId, firmId, req.user);
      if (!caseRec || caseRec.firmId !== firmId) {
        return res.status(404).json({ error: 'NotFound', message: 'Case not found or access denied' });
      }
    }

    const created = await db.insertExpense({
      id: crypto.randomUUID(),
      firmId,
      clientId: parsed.data.clientId || null,
      caseId: parsed.data.caseId || null,
      categoryId: parsed.data.categoryId,
      expenseDate: parsed.data.expenseDate,
      amountPaisa: parsed.data.amountPaisa,
      description: parsed.data.description,
      reimbursable: parsed.data.reimbursable,
      status: 'posted',
      createdBy: req.user!.id,
      updatedBy: req.user!.id,
    });

    await recordAudit({
      firmId,
      userId: req.user!.id,
      userName: req.user!.name,
      entity: 'Expense',
      entityId: created.id,
      action: 'RECORD_EXPENSE',
      oldValue: null,
      newValue: created as unknown as Record<string, unknown>,
    });

    res.status(201).json(created);
  }
);

// POST /api/v1/expenses/:id/void - Void an expense
expensesRouter.post(
  '/:id/void',
  requirePermission('expenses.record'),
  enforceSubscriptionReadOnly,
  async (req: AuthenticatedRequest, res: Response) => {
    const parsed = voidExpenseSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'ValidationError', details: parsed.error.issues });
    }

    const db = getDatabase();
    const firmId = req.user!.firmId;

    const existing = await db.getExpenseById(req.params.id, firmId, req.user);
    if (!existing || existing.firmId !== firmId) {
      return res.status(404).json({ error: 'NotFound', message: 'Expense not found' });
    }

    if (existing.status === 'void') {
      return res.status(400).json({ error: 'BadRequest', message: 'Expense is already voided' });
    }

    const updated = await db.updateExpense(existing.id, firmId, {
      status: 'void',
      voidReason: parsed.data.reason,
      voidedBy: req.user!.id,
      voidedAt: new Date(),
      updatedBy: req.user!.id,
    });

    await recordAudit({
      firmId,
      userId: req.user!.id,
      userName: req.user!.name,
      entity: 'Expense',
      entityId: updated.id,
      action: 'VOID_EXPENSE',
      oldValue: existing as unknown as Record<string, unknown>,
      newValue: updated as unknown as Record<string, unknown>,
    });

    res.json(updated);
  }
);
