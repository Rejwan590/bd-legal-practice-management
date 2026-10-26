import crypto from 'crypto';
import { Router, Response } from 'express';
import { z } from 'zod';
import { authMiddleware, AuthenticatedRequest } from '../middleware/auth.js';
import { requirePermission } from '../middleware/permission.js';
import { enforceFirmIsolation } from '../middleware/firmIsolation.js';
import { enforceSubscriptionReadOnly } from '../middleware/subscription.js';
import { getDatabase } from '../db/client.js';
import { recordAudit } from '../services/auditService.js';

export const feePaymentsRouter = Router();

feePaymentsRouter.use(authMiddleware);
feePaymentsRouter.use(enforceFirmIsolation);

const recordPaymentSchema = z.object({
  clientId: z.string().min(1, 'clientId is required'),
  caseId: z.string().optional().nullable(),
  feeAgreementId: z.string().optional().nullable(),
  hearingId: z.string().optional().nullable(),
  paymentDate: z.string().min(1, 'paymentDate is required'),
  amountPaisa: z.number().int().positive('Payment amount must be greater than 0'),
  method: z.enum(['cash', 'bank', 'bkash', 'nagad', 'cheque', 'other']),
  reference: z.string().trim().max(100).optional().nullable(),
  purposeNote: z.string().trim().min(1, 'purposeNote is required').max(500, 'purposeNote too long'),
  idempotencyKey: z.string().trim().min(1, 'idempotencyKey is required').max(128, 'idempotencyKey too long'),
});

const voidPaymentSchema = z.object({
  reason: z.string().trim().min(3, 'Reason must be at least 3 characters').max(500, 'Reason too long'),
});

// GET /api/v1/fee-payments - List fee payments
feePaymentsRouter.get(
  '/',
  requirePermission('accounts.view'),
  async (req: AuthenticatedRequest, res: Response) => {
    const db = getDatabase();
    const firmId = req.user!.firmId;

    const list = await db.listFeePayments(
      firmId,
      {
        clientId: req.query.clientId as string | undefined,
        caseId: req.query.caseId as string | undefined,
        feeAgreementId: req.query.feeAgreementId as string | undefined,
        status: req.query.status as string | undefined,
      },
      req.user
    );

    res.json(list);
  }
);

// GET /api/v1/fee-payments/:id - Get single fee payment
feePaymentsRouter.get(
  '/:id',
  requirePermission('accounts.view'),
  async (req: AuthenticatedRequest, res: Response) => {
    const db = getDatabase();
    const firmId = req.user!.firmId;

    const payment = await db.getFeePaymentById(req.params.id, firmId, req.user);
    if (!payment || payment.firmId !== firmId) {
      return res.status(404).json({ error: 'NotFound', message: 'Fee payment not found' });
    }

    res.json(payment);
  }
);

// POST /api/v1/fee-payments - Record received payment
feePaymentsRouter.post(
  '/',
  requirePermission('accounts.manage'),
  enforceSubscriptionReadOnly,
  async (req: AuthenticatedRequest, res: Response) => {
    const parsed = recordPaymentSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'ValidationError', details: parsed.error.issues });
    }

    const db = getDatabase();
    const firmId = req.user!.firmId;

    // Idempotency deduplication check: duplicate key returns original record without duplicate write
    const existing = await db.getFeePaymentByIdempotencyKey(firmId, parsed.data.idempotencyKey);
    if (existing) {
      return res.status(200).json(existing);
    }

    // Validate client visibility
    const client = await db.getClientById(parsed.data.clientId, firmId, req.user);
    if (!client || client.firmId !== firmId) {
      return res.status(404).json({ error: 'NotFound', message: 'Client not found or access denied' });
    }

    // Validate case visibility if caseId is provided
    if (parsed.data.caseId) {
      const caseRec = await db.getCaseById(parsed.data.caseId, firmId, req.user);
      if (!caseRec || caseRec.firmId !== firmId) {
        return res.status(404).json({ error: 'NotFound', message: 'Case not found or access denied' });
      }
    }

    // Validate fee agreement if provided
    if (parsed.data.feeAgreementId) {
      const ag = await db.getFeeAgreementById(parsed.data.feeAgreementId, firmId, req.user);
      if (!ag || ag.firmId !== firmId) {
        return res.status(404).json({ error: 'NotFound', message: 'Fee agreement not found' });
      }
    }

    // Validate hearing if provided
    if (parsed.data.hearingId) {
      const h = await db.getHearingById(parsed.data.hearingId, firmId, req.user);
      if (!h || h.firmId !== firmId) {
        return res.status(404).json({ error: 'NotFound', message: 'Hearing not found' });
      }
    }

    // Atomic transaction for receipt number generation and payment insertion
    const created = await db.transaction(async (txDb) => {
      // Check idempotency again within transaction snapshot
      const duplicate = await txDb.getFeePaymentByIdempotencyKey(firmId, parsed.data.idempotencyKey);
      if (duplicate) return duplicate;

      const { sequenceNumber } = await txDb.getNextSequenceNumber(firmId, 'receipt', 'R-');

      return await txDb.insertFeePayment({
        id: crypto.randomUUID(),
        firmId,
        clientId: parsed.data.clientId,
        caseId: parsed.data.caseId || null,
        feeAgreementId: parsed.data.feeAgreementId || null,
        hearingId: parsed.data.hearingId || null,
        paymentDate: parsed.data.paymentDate,
        amountPaisa: parsed.data.amountPaisa,
        method: parsed.data.method,
        reference: parsed.data.reference || null,
        receiptNumber: sequenceNumber,
        purposeNote: parsed.data.purposeNote,
        status: 'posted',
        idempotencyKey: parsed.data.idempotencyKey,
        createdBy: req.user!.id,
        updatedBy: req.user!.id,
      });
    });

    await recordAudit({
      firmId,
      userId: req.user!.id,
      userName: req.user!.name,
      entity: 'FeePayment',
      entityId: created.id,
      action: 'RECORD_FEE_PAYMENT',
      oldValue: null,
      newValue: created as unknown as Record<string, unknown>,
    });

    res.status(201).json(created);
  }
);

// POST /api/v1/fee-payments/:id/void - Void a payment
feePaymentsRouter.post(
  '/:id/void',
  requirePermission('accounts.manage'),
  enforceSubscriptionReadOnly,
  async (req: AuthenticatedRequest, res: Response) => {
    const parsed = voidPaymentSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'ValidationError', details: parsed.error.issues });
    }

    const db = getDatabase();
    const firmId = req.user!.firmId;

    const existing = await db.getFeePaymentById(req.params.id, firmId, req.user);
    if (!existing || existing.firmId !== firmId) {
      return res.status(404).json({ error: 'NotFound', message: 'Fee payment not found' });
    }

    if (existing.status === 'void') {
      return res.status(400).json({ error: 'BadRequest', message: 'Payment is already voided' });
    }

    const updated = await db.updateFeePayment(existing.id, firmId, {
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
      entity: 'FeePayment',
      entityId: updated.id,
      action: 'VOID_FEE_PAYMENT',
      oldValue: existing as unknown as Record<string, unknown>,
      newValue: updated as unknown as Record<string, unknown>,
    });

    res.json(updated);
  }
);
