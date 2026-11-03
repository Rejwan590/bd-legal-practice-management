import crypto from 'crypto';
import { Router, Response } from 'express';
import { z } from 'zod';
import { authMiddleware, AuthenticatedRequest } from '../middleware/auth.js';
import { requirePermission } from '../middleware/permission.js';
import { enforceFirmIsolation } from '../middleware/firmIsolation.js';
import { enforceSubscriptionReadOnly } from '../middleware/subscription.js';
import { getDatabase } from '../db/client.js';
import { recordAudit } from '../services/auditService.js';

export const chamberExpensesRouter = Router();

chamberExpensesRouter.use(authMiddleware);
chamberExpensesRouter.use(enforceFirmIsolation);

const createCategorySchema = z.object({
  name: z.string().trim().min(1, 'Name is required').max(100, 'Name too long'),
  nameBn: z.string().trim().max(100, 'Name (Bangla) too long').optional().nullable(),
  kind: z.enum(['general', 'salary']).default('general'),
});

const createExpenseSchema = z.object({
  categoryId: z.string().min(1, 'Category is required'),
  description: z.string().trim().min(1, 'Description is required').max(500, 'Description too long'),
  amountPaisa: z.number().int().positive('Amount must be greater than 0'),
  expenseDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be in YYYY-MM-DD format'),
  paidTo: z.string().trim().min(1, 'Paid to is required').max(200, 'Paid to too long'),
  paymentMethod: z.enum(['cash', 'bank', 'mobile_banking', 'cheque', 'other']),
  receiptRef: z.string().trim().max(100, 'Receipt reference too long').optional().nullable(),
  notes: z.string().trim().max(1000, 'Notes too long').optional().nullable(),
  advanceId: z.string().optional().nullable(),
});

const voidExpenseSchema = z.object({
  voidReason: z.string().trim().min(3, 'Void reason must be at least 3 characters').max(500, 'Void reason too long'),
});

const createAdvanceSchema = z.object({
  givenTo: z.string().trim().min(1, 'Given to is required').max(200, 'Given to too long'),
  givenToUserId: z.string().optional().nullable(),
  amountPaisa: z.number().int().positive('Amount must be greater than 0'),
  givenDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be in YYYY-MM-DD format'),
  purpose: z.string().trim().min(1, 'Purpose is required').max(500, 'Purpose too long'),
  paymentMethod: z.enum(['cash', 'bank', 'mobile_banking', 'cheque', 'other']),
});

const settleAdvanceSchema = z.object({
  type: z.enum(['expense', 'refund']),
  amountPaisa: z.number().int().positive('Amount must be greater than 0'),
  settledDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be in YYYY-MM-DD format'),
  notes: z.string().trim().max(500, 'Notes too long').optional().nullable(),
  expenseId: z.string().optional().nullable(),
});

// GET /api/v1/chamber-expenses/categories
chamberExpensesRouter.get(
  '/categories',
  requirePermission('chamber_expenses.view'),
  async (req: AuthenticatedRequest, res: Response) => {
    const db = getDatabase();
    const categories = await db.listChamberExpenseCategories(req.user!.firmId);
    res.json(categories);
  }
);

// POST /api/v1/chamber-expenses/categories
chamberExpensesRouter.post(
  '/categories',
  requirePermission('chamber_expenses.manage'),
  enforceSubscriptionReadOnly,
  async (req: AuthenticatedRequest, res: Response) => {
    const parsed = createCategorySchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'ValidationError', details: parsed.error.issues });
    }

    const db = getDatabase();
    const firmId = req.user!.firmId;

    const created = await db.createChamberExpenseCategory(firmId, {
      id: `ch-cat-${crypto.randomUUID()}`,
      firmId,
      name: parsed.data.name,
      nameBn: parsed.data.nameBn ?? null,
      kind: parsed.data.kind,
      isDefault: false,
      createdBy: req.user!.id,
      updatedBy: req.user!.id,
    });

    await recordAudit({
      firmId,
      userId: req.user!.id,
      userName: req.user!.name,
      entity: 'ChamberExpenseCategory',
      entityId: created.id,
      action: 'CREATE_CHAMBER_EXPENSE_CATEGORY',
      oldValue: null,
      newValue: created as unknown as Record<string, unknown>,
    });

    res.status(201).json(created);
  }
);

// GET /api/v1/chamber-expenses/summary
chamberExpensesRouter.get(
  '/summary',
  requirePermission('chamber_expenses.view'),
  async (req: AuthenticatedRequest, res: Response) => {
    const db = getDatabase();
    const firmId = req.user!.firmId;
    const month = req.query.month as string | undefined;
    const year = req.query.year ? parseInt(req.query.year as string, 10) : undefined;

    const summary = await db.getChamberExpensesSummary(firmId, { month, year }, req.user);
    res.json(summary);
  }
);

// GET /api/v1/chamber-expenses/advances
chamberExpensesRouter.get(
  '/advances',
  requirePermission('chamber_expenses.view'),
  async (req: AuthenticatedRequest, res: Response) => {
    const db = getDatabase();
    const firmId = req.user!.firmId;
    const list = await db.listChamberAdvances(firmId, {
      givenToUserId: req.query.givenToUserId as string | undefined,
      status: req.query.status as string | undefined,
    });
    res.json(list);
  }
);

// GET /api/v1/chamber-expenses/advances/:id
chamberExpensesRouter.get(
  '/advances/:id',
  requirePermission('chamber_expenses.view'),
  async (req: AuthenticatedRequest, res: Response) => {
    const db = getDatabase();
    const firmId = req.user!.firmId;
    const adv = await db.getChamberAdvanceById(firmId, req.params.id);
    if (!adv || adv.firmId !== firmId) {
      return res.status(404).json({ error: 'NotFound', message: 'Advance not found' });
    }
    res.json(adv);
  }
);

// POST /api/v1/chamber-expenses/advances
chamberExpensesRouter.post(
  '/advances',
  requirePermission('chamber_expenses.record'),
  enforceSubscriptionReadOnly,
  async (req: AuthenticatedRequest, res: Response) => {
    const parsed = createAdvanceSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'ValidationError', details: parsed.error.issues });
    }

    const db = getDatabase();
    const firmId = req.user!.firmId;

    const created = await db.createChamberAdvance(firmId, {
      id: `ch-adv-${crypto.randomUUID()}`,
      firmId,
      givenTo: parsed.data.givenTo,
      givenToUserId: parsed.data.givenToUserId || null,
      amountPaisa: parsed.data.amountPaisa,
      givenDate: parsed.data.givenDate,
      purpose: parsed.data.purpose,
      paymentMethod: parsed.data.paymentMethod,
      createdBy: req.user!.id,
      updatedBy: req.user!.id,
    });

    await recordAudit({
      firmId,
      userId: req.user!.id,
      userName: req.user!.name,
      entity: 'ChamberAdvance',
      entityId: created.id,
      action: 'CREATE_CHAMBER_ADVANCE',
      oldValue: null,
      newValue: created as unknown as Record<string, unknown>,
    });

    res.status(201).json(created);
  }
);

// POST /api/v1/chamber-expenses/advances/:id/settle
chamberExpensesRouter.post(
  '/advances/:id/settle',
  requirePermission('chamber_expenses.record'),
  enforceSubscriptionReadOnly,
  async (req: AuthenticatedRequest, res: Response) => {
    const parsed = settleAdvanceSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'ValidationError', details: parsed.error.issues });
    }

    const db = getDatabase();
    const firmId = req.user!.firmId;

    try {
      const created = await db.createChamberAdvanceSettlement(firmId, req.params.id, {
        id: `ch-set-${crypto.randomUUID()}`,
        firmId,
        advanceId: req.params.id,
        type: parsed.data.type,
        expenseId: parsed.data.expenseId || null,
        amountPaisa: parsed.data.amountPaisa,
        settledDate: parsed.data.settledDate,
        notes: parsed.data.notes || null,
        createdBy: req.user!.id,
        updatedBy: req.user!.id,
      });

      await recordAudit({
        firmId,
        userId: req.user!.id,
        userName: req.user!.name,
        entity: 'ChamberAdvanceSettlement',
        entityId: created.id,
        action: 'SETTLE_CHAMBER_ADVANCE',
        oldValue: null,
        newValue: created as unknown as Record<string, unknown>,
      });

      res.status(201).json(created);
    } catch (err: any) {
      res.status(400).json({ error: 'BadRequest', message: err.message });
    }
  }
);

// POST /api/v1/chamber-expenses/advances/:id/void
chamberExpensesRouter.post(
  '/advances/:id/void',
  requirePermission('chamber_expenses.manage'),
  enforceSubscriptionReadOnly,
  async (req: AuthenticatedRequest, res: Response) => {
    const parsed = voidExpenseSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'ValidationError', details: parsed.error.issues });
    }

    const db = getDatabase();
    const firmId = req.user!.firmId;

    try {
      const existing = await db.getChamberAdvanceById(firmId, req.params.id);
      if (!existing || existing.firmId !== firmId) {
        return res.status(404).json({ error: 'NotFound', message: 'Advance not found' });
      }

      const voided = await db.voidChamberAdvance(firmId, req.params.id, parsed.data.voidReason, req.user!.id);

      await recordAudit({
        firmId,
        userId: req.user!.id,
        userName: req.user!.name,
        entity: 'ChamberAdvance',
        entityId: voided.id,
        action: 'VOID_CHAMBER_ADVANCE',
        oldValue: existing as unknown as Record<string, unknown>,
        newValue: voided as unknown as Record<string, unknown>,
      });

      res.json(voided);
    } catch (err: any) {
      res.status(400).json({ error: 'BadRequest', message: err.message });
    }
  }
);

// GET /api/v1/chamber-expenses
chamberExpensesRouter.get(
  '/',
  requirePermission('chamber_expenses.view'),
  async (req: AuthenticatedRequest, res: Response) => {
    const db = getDatabase();
    const firmId = req.user!.firmId;

    const list = await db.listChamberExpenses(
      firmId,
      {
        fromDate: req.query.fromDate as string | undefined,
        toDate: req.query.toDate as string | undefined,
        categoryId: req.query.categoryId as string | undefined,
        status: req.query.status as string | undefined,
      },
      req.user
    );

    res.json(list);
  }
);

// GET /api/v1/chamber-expenses/:id
chamberExpensesRouter.get(
  '/:id',
  requirePermission('chamber_expenses.view'),
  async (req: AuthenticatedRequest, res: Response) => {
    const db = getDatabase();
    const firmId = req.user!.firmId;

    const expense = await db.getChamberExpenseById(firmId, req.params.id, req.user);
    if (!expense || expense.firmId !== firmId) {
      return res.status(404).json({ error: 'NotFound', message: 'Expense not found' });
    }

    res.json(expense);
  }
);

// POST /api/v1/chamber-expenses
chamberExpensesRouter.post(
  '/',
  requirePermission('chamber_expenses.record'),
  enforceSubscriptionReadOnly,
  async (req: AuthenticatedRequest, res: Response) => {
    const parsed = createExpenseSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'ValidationError', details: parsed.error.issues });
    }

    const db = getDatabase();
    const firmId = req.user!.firmId;

    try {
      const created = await db.createChamberExpense(firmId, {
        id: `ch-exp-${crypto.randomUUID()}`,
        firmId,
        categoryId: parsed.data.categoryId,
        description: parsed.data.description,
        amountPaisa: parsed.data.amountPaisa,
        expenseDate: parsed.data.expenseDate,
        paidTo: parsed.data.paidTo,
        paymentMethod: parsed.data.paymentMethod,
        receiptRef: parsed.data.receiptRef || null,
        notes: parsed.data.notes || null,
        advanceId: parsed.data.advanceId || null,
        status: 'posted',
        createdBy: req.user!.id,
        updatedBy: req.user!.id,
      });

      await recordAudit({
        firmId,
        userId: req.user!.id,
        userName: req.user!.name,
        entity: 'ChamberExpense',
        entityId: created.id,
        action: 'CREATE_CHAMBER_EXPENSE',
        oldValue: null,
        newValue: created as unknown as Record<string, unknown>,
      });

      res.status(201).json(created);
    } catch (err: any) {
      res.status(400).json({ error: 'BadRequest', message: err.message });
    }
  }
);

// POST /api/v1/chamber-expenses/:id/void
chamberExpensesRouter.post(
  '/:id/void',
  requirePermission('chamber_expenses.manage'),
  enforceSubscriptionReadOnly,
  async (req: AuthenticatedRequest, res: Response) => {
    const parsed = voidExpenseSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'ValidationError', details: parsed.error.issues });
    }

    const db = getDatabase();
    const firmId = req.user!.firmId;

    const existing = await db.getChamberExpenseById(firmId, req.params.id, req.user);
    if (!existing || existing.firmId !== firmId) {
      return res.status(404).json({ error: 'NotFound', message: 'Expense not found' });
    }

    if (existing.status === 'void') {
      return res.status(400).json({ error: 'BadRequest', message: 'Expense is already voided' });
    }

    const updated = await db.voidChamberExpense(firmId, existing.id, parsed.data.voidReason, req.user!.id);

    await recordAudit({
      firmId,
      userId: req.user!.id,
      userName: req.user!.name,
      entity: 'ChamberExpense',
      entityId: updated.id,
      action: 'VOID_CHAMBER_EXPENSE',
      oldValue: existing as unknown as Record<string, unknown>,
      newValue: updated as unknown as Record<string, unknown>,
    });

    res.json(updated);
  }
);
