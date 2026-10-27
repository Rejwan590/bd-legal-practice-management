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
  feeAgreementId: z.string().min(1, 'feeAgreementId is required'),
  hearingId: z.string().optional().nullable(),
  paymentDate: z.string().min(1, 'paymentDate is required'),
  amountPaisa: z.number().int().positive('Payment amount must be greater than 0'),
  method: z.enum(['cash', 'bank', 'bkash', 'nagad', 'cheque', 'other']),
  reference: z.string().trim().max(100).optional().nullable(),
  purposeNote: z.string().trim().min(1, 'purposeNote is required').max(500, 'purposeNote too long'),
  idempotencyKey: z.string().trim().min(1, 'idempotencyKey is required').max(128, 'idempotencyKey too long'),
  clientId: z.string().optional().nullable(),
  caseId: z.string().optional().nullable(),
});

const voidPaymentSchema = z.object({
  reason: z.string().trim().min(3, 'Reason must be at least 3 characters').max(500, 'Reason too long'),
});

const attachAgreementSchema = z.object({
  feeAgreementId: z.string().min(1, 'feeAgreementId is required'),
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
        legacyUnassigned: req.query.legacyUnassigned !== undefined ? req.query.legacyUnassigned === 'true' : undefined,
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

    // Helper to check user visibility before exposing any payment
    const checkPaymentVisibility = async (p: { caseId: string | null; clientId: string }): Promise<boolean> => {
      if (p.caseId) {
        const c = await db.getCaseById(p.caseId, firmId, req.user);
        if (!c || c.firmId !== firmId) return false;
      }
      if (p.clientId) {
        const cl = await db.getClientById(p.clientId, firmId, req.user);
        if (!cl || cl.firmId !== firmId) return false;
      }
      return true;
    };

    // Idempotency deduplication check: check visibility BEFORE returning idempotent duplicate
    const existing = await db.getFeePaymentByIdempotencyKey(firmId, parsed.data.idempotencyKey);
    if (existing) {
      const isVisible = await checkPaymentVisibility(existing);
      if (!isVisible) {
        return res.status(400).json({ error: 'BadRequest', message: 'Cannot access payment for hidden or restricted case' });
      }
      return res.status(200).json(existing);
    }

    // Validate fee agreement (required)
    const agreement = await db.getFeeAgreementById(parsed.data.feeAgreementId, firmId, req.user);
    if (!agreement || agreement.firmId !== firmId) {
      return res.status(404).json({ error: 'NotFound', message: 'Fee agreement not found' });
    }

    // Reject (400) if agreement is closed or void
    if (agreement.status === 'closed' || agreement.status === 'void') {
      return res.status(400).json({ error: 'BadRequest', message: 'Fee agreement is closed or void' });
    }

    if (!agreement.caseId) {
      return res.status(400).json({ error: 'BadRequest', message: 'Fee agreement must reference a case' });
    }

    // Check central case visibility + restricted.view on the agreement's case
    const caseRec = await db.getCaseById(agreement.caseId, firmId, req.user);
    if (!caseRec || caseRec.firmId !== firmId) {
      return res.status(400).json({ error: 'BadRequest', message: 'User cannot see the case (central visibility or restricted)' });
    }

    // Reject (400) if the case is not the client's
    if (caseRec.clientId !== agreement.clientId) {
      return res.status(400).json({ error: 'BadRequest', message: 'Case does not belong to the agreement client' });
    }

    // Reject (400) if hearingId is provided and is not a hearing of that case
    if (parsed.data.hearingId) {
      const h = await db.getHearingById(parsed.data.hearingId, firmId, req.user);
      if (!h || h.firmId !== firmId || h.caseId !== agreement.caseId) {
        return res.status(400).json({ error: 'BadRequest', message: 'Hearing is not a hearing of this case' });
      }
    }

    // Server derives client_id and case_id from the agreement
    const derivedClientId = agreement.clientId;
    const derivedCaseId = agreement.caseId;

    try {
      // Atomic transaction for receipt number generation and payment insertion
      const created = await db.transaction(async (txDb) => {
        // Check idempotency again within transaction snapshot
        const duplicate = await txDb.getFeePaymentByIdempotencyKey(firmId, parsed.data.idempotencyKey);
        if (duplicate) return duplicate;

        const { sequenceNumber } = await txDb.getNextSequenceNumber(firmId, 'receipt', 'R-');

        return await txDb.insertFeePayment({
          id: crypto.randomUUID(),
          firmId,
          clientId: derivedClientId,
          caseId: derivedCaseId,
          feeAgreementId: agreement.id,
          hearingId: parsed.data.hearingId || null,
          paymentDate: parsed.data.paymentDate,
          amountPaisa: parsed.data.amountPaisa,
          method: parsed.data.method,
          reference: parsed.data.reference || null,
          receiptNumber: sequenceNumber,
          purposeNote: parsed.data.purposeNote,
          status: 'posted',
          idempotencyKey: parsed.data.idempotencyKey,
          legacyUnassigned: false,
          createdBy: req.user!.id,
          updatedBy: req.user!.id,
        });
      });

      // If duplicate was returned from transaction
      if (created.idempotencyKey === parsed.data.idempotencyKey && created.createdBy !== req.user!.id) {
        const isVisible = await checkPaymentVisibility(created);
        if (!isVisible) {
          return res.status(400).json({ error: 'BadRequest', message: 'Cannot access payment for hidden or restricted case' });
        }
        return res.status(200).json(created);
      }

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

      return res.status(201).json(created);
    } catch (err: any) {
      const code = err.code || err.cause?.code;
      const message = `${err.message || ''} ${err.cause?.message || ''} ${err.detail || ''} ${err.cause?.detail || ''}`;
      // Catch unique-index idempotency race and return the original record
      if (
        code === '23505' ||
        message.includes('duplicate key') ||
        message.includes('unique constraint') ||
        message.includes('idx_fee_payments_firm_idempotency') ||
        err.detail?.includes('idempotency') ||
        err.cause?.detail?.includes('idempotency')
      ) {
        let original = await db.getFeePaymentByIdempotencyKey(firmId, parsed.data.idempotencyKey);
        if (!original) {
          // Allow in-flight concurrent transaction to finish committing
          for (let attempt = 0; attempt < 10; attempt++) {
            await new Promise((r) => setTimeout(r, 50));
            original = await db.getFeePaymentByIdempotencyKey(firmId, parsed.data.idempotencyKey);
            if (original) break;
          }
        }
        if (original) {
          const isVisible = await checkPaymentVisibility(original);
          if (!isVisible) {
            return res.status(400).json({ error: 'BadRequest', message: 'Cannot access payment for hidden or restricted case' });
          }
          return res.status(200).json(original);
        }
      }
      throw err;
    }
  }
);

// POST /api/v1/fee-payments/:id/attach - Attach legacy unassigned payment to an agreement
feePaymentsRouter.post(
  '/:id/attach',
  requirePermission('accounts.manage'),
  enforceSubscriptionReadOnly,
  async (req: AuthenticatedRequest, res: Response) => {
    const parsed = attachAgreementSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'ValidationError', details: parsed.error.issues });
    }

    const db = getDatabase();
    const firmId = req.user!.firmId;

    const payment = await db.getFeePaymentById(req.params.id, firmId, req.user);
    if (!payment || payment.firmId !== firmId) {
      return res.status(404).json({ error: 'NotFound', message: 'Fee payment not found' });
    }

    const agreement = await db.getFeeAgreementById(parsed.data.feeAgreementId, firmId, req.user);
    if (!agreement || agreement.firmId !== firmId) {
      return res.status(404).json({ error: 'NotFound', message: 'Fee agreement not found' });
    }

    if (agreement.status !== 'active') {
      return res.status(400).json({ error: 'BadRequest', message: 'Cannot attach to closed or void agreement' });
    }

    if (!agreement.caseId) {
      return res.status(400).json({ error: 'BadRequest', message: 'Fee agreement must be linked to a case' });
    }

    const updated = await db.updateFeePayment(payment.id, firmId, {
      feeAgreementId: agreement.id,
      caseId: agreement.caseId,
      clientId: agreement.clientId,
      legacyUnassigned: false,
      updatedBy: req.user!.id,
    });

    await recordAudit({
      firmId,
      userId: req.user!.id,
      userName: req.user!.name,
      entity: 'FeePayment',
      entityId: updated.id,
      action: 'ATTACH_PAYMENT_AGREEMENT',
      oldValue: payment as unknown as Record<string, unknown>,
      newValue: updated as unknown as Record<string, unknown>,
    });

    res.json(updated);
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
