import crypto from 'crypto';
import { Router, Response } from 'express';
import { z } from 'zod';
import { authMiddleware, AuthenticatedRequest } from '../middleware/auth.js';
import { requirePermission } from '../middleware/permission.js';
import { enforceFirmIsolation } from '../middleware/firmIsolation.js';
import { enforceSubscriptionReadOnly } from '../middleware/subscription.js';
import { getDatabase } from '../db/client.js';
import { recordAudit } from '../services/auditService.js';

export const feeAgreementsRouter = Router();

feeAgreementsRouter.use(authMiddleware);
feeAgreementsRouter.use(enforceFirmIsolation);

const createFeeAgreementSchema = z.object({
  clientId: z.string().min(1, 'clientId is required'),
  caseId: z.string().min(1, 'caseId is required'), // NOT NULL for new agreements
  feeType: z.enum(['fixed', 'per_hearing', 'hourly', 'retainer', 'installment']).default('fixed'),
  agreedAmountPaisa: z.number().int().positive('Agreed amount must be greater than 0'),
  agreementDate: z.string().min(1, 'agreementDate is required'),
  notes: z.string().trim().max(2000).optional().nullable(),
});

const reviseFeeAgreementSchema = z.object({
  newAmountPaisa: z.number().int().positive('New amount must be greater than 0'),
  reason: z.string().trim().min(3, 'Reason must be at least 3 characters').max(500, 'Reason too long'),
});

const voidFeeAgreementSchema = z.object({
  reason: z.string().trim().min(3, 'Reason must be at least 3 characters').max(500, 'Reason too long'),
});

// GET /api/v1/fee-agreements - List fee agreements
feeAgreementsRouter.get(
  '/',
  requirePermission('accounts.view'),
  async (req: AuthenticatedRequest, res: Response) => {
    const db = getDatabase();
    const firmId = req.user!.firmId;

    const list = await db.listFeeAgreements(
      firmId,
      {
        clientId: req.query.clientId as string | undefined,
        caseId: req.query.caseId as string | undefined,
        status: req.query.status as string | undefined,
      },
      req.user
    );

    res.json(list);
  }
);

// GET /api/v1/fee-agreements/:id - Get single fee agreement
feeAgreementsRouter.get(
  '/:id',
  requirePermission('accounts.view'),
  async (req: AuthenticatedRequest, res: Response) => {
    const db = getDatabase();
    const firmId = req.user!.firmId;

    const agreement = await db.getFeeAgreementById(req.params.id, firmId, req.user);
    if (!agreement || agreement.firmId !== firmId) {
      return res.status(404).json({ error: 'NotFound', message: 'Fee agreement not found' });
    }

    res.json(agreement);
  }
);

// GET /api/v1/fee-agreements/:id/changes - Get revision history of fee agreement
feeAgreementsRouter.get(
  '/:id/changes',
  requirePermission('accounts.view'),
  async (req: AuthenticatedRequest, res: Response) => {
    const db = getDatabase();
    const firmId = req.user!.firmId;

    const agreement = await db.getFeeAgreementById(req.params.id, firmId, req.user);
    if (!agreement || agreement.firmId !== firmId) {
      return res.status(404).json({ error: 'NotFound', message: 'Fee agreement not found' });
    }

    const changes = await db.listFeeAgreementChanges(req.params.id, firmId);
    res.json(changes);
  }
);

// POST /api/v1/fee-agreements - Create fee agreement
feeAgreementsRouter.post(
  '/',
  requirePermission('accounts.manage'),
  enforceSubscriptionReadOnly,
  async (req: AuthenticatedRequest, res: Response) => {
    const parsed = createFeeAgreementSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'ValidationError', details: parsed.error.issues });
    }

    const db = getDatabase();
    const firmId = req.user!.firmId;

    // Validate client visibility
    const client = await db.getClientById(parsed.data.clientId, firmId, req.user);
    if (!client || client.firmId !== firmId) {
      return res.status(404).json({ error: 'NotFound', message: 'Client not found or access denied' });
    }

    // Validate case visibility (caseId is required)
    const caseRec = await db.getCaseById(parsed.data.caseId, firmId, req.user);
    if (!caseRec || caseRec.firmId !== firmId) {
      return res.status(404).json({ error: 'NotFound', message: 'Case not found or access denied' });
    }

    // Validate case belongs to the client
    if (caseRec.clientId !== parsed.data.clientId) {
      return res.status(400).json({ error: 'BadRequest', message: 'Case does not belong to the agreement client' });
    }

    const created = await db.insertFeeAgreement({
      id: crypto.randomUUID(),
      firmId,
      clientId: parsed.data.clientId,
      caseId: parsed.data.caseId,
      feeType: parsed.data.feeType,
      agreedAmountPaisa: parsed.data.agreedAmountPaisa,
      agreementDate: parsed.data.agreementDate,
      notes: parsed.data.notes || null,
      status: 'active',
      createdBy: req.user!.id,
      updatedBy: req.user!.id,
    });

    await recordAudit({
      firmId,
      userId: req.user!.id,
      userName: req.user!.name,
      entity: 'FeeAgreement',
      entityId: created.id,
      action: 'CREATE_FEE_AGREEMENT',
      oldValue: null,
      newValue: created as unknown as Record<string, unknown>,
    });

    res.status(201).json(created);
  }
);

// POST /api/v1/fee-agreements/:id/revise - Revise agreed fee amount
feeAgreementsRouter.post(
  '/:id/revise',
  requirePermission('accounts.manage'),
  enforceSubscriptionReadOnly,
  async (req: AuthenticatedRequest, res: Response) => {
    const parsed = reviseFeeAgreementSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'ValidationError', details: parsed.error.issues });
    }

    const db = getDatabase();
    const firmId = req.user!.firmId;

    const existing = await db.getFeeAgreementById(req.params.id, firmId, req.user);
    if (!existing || existing.firmId !== firmId) {
      return res.status(404).json({ error: 'NotFound', message: 'Fee agreement not found' });
    }

    if (existing.status !== 'active') {
      return res.status(400).json({ error: 'BadRequest', message: `Cannot revise agreement with status ${existing.status}` });
    }

    const oldAmountPaisa = existing.agreedAmountPaisa;
    const newAmountPaisa = parsed.data.newAmountPaisa;

    // Run revision inside an atomic transaction
    const updated = await db.transaction(async (txDb) => {
      await txDb.insertFeeAgreementChange({
        id: crypto.randomUUID(),
        firmId,
        feeAgreementId: existing.id,
        oldAmountPaisa,
        newAmountPaisa,
        reason: parsed.data.reason,
        changedBy: req.user!.id,
      });

      return await txDb.updateFeeAgreement(existing.id, firmId, {
        agreedAmountPaisa: newAmountPaisa,
        updatedBy: req.user!.id,
      });
    });

    await recordAudit({
      firmId,
      userId: req.user!.id,
      userName: req.user!.name,
      entity: 'FeeAgreement',
      entityId: updated.id,
      action: 'REVISE_FEE_AGREEMENT',
      oldValue: existing as unknown as Record<string, unknown>,
      newValue: { ...updated, changeReason: parsed.data.reason } as unknown as Record<string, unknown>,
    });

    res.json(updated);
  }
);

// POST /api/v1/fee-agreements/:id/close - Close an agreement
feeAgreementsRouter.post(
  '/:id/close',
  requirePermission('accounts.manage'),
  enforceSubscriptionReadOnly,
  async (req: AuthenticatedRequest, res: Response) => {
    const db = getDatabase();
    const firmId = req.user!.firmId;

    const existing = await db.getFeeAgreementById(req.params.id, firmId, req.user);
    if (!existing || existing.firmId !== firmId) {
      return res.status(404).json({ error: 'NotFound', message: 'Fee agreement not found' });
    }

    const updated = await db.updateFeeAgreement(existing.id, firmId, {
      status: 'closed',
      updatedBy: req.user!.id,
    });

    await recordAudit({
      firmId,
      userId: req.user!.id,
      userName: req.user!.name,
      entity: 'FeeAgreement',
      entityId: updated.id,
      action: 'CLOSE_FEE_AGREEMENT',
      oldValue: existing as unknown as Record<string, unknown>,
      newValue: updated as unknown as Record<string, unknown>,
    });

    res.json(updated);
  }
);

// POST /api/v1/fee-agreements/:id/void - Void an agreement
feeAgreementsRouter.post(
  '/:id/void',
  requirePermission('accounts.manage'),
  enforceSubscriptionReadOnly,
  async (req: AuthenticatedRequest, res: Response) => {
    const parsed = voidFeeAgreementSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'ValidationError', details: parsed.error.issues });
    }

    const db = getDatabase();
    const firmId = req.user!.firmId;

    const existing = await db.getFeeAgreementById(req.params.id, firmId, req.user);
    if (!existing || existing.firmId !== firmId) {
      return res.status(404).json({ error: 'NotFound', message: 'Fee agreement not found' });
    }

    if (existing.status === 'void') {
      return res.status(400).json({ error: 'BadRequest', message: 'Agreement is already voided' });
    }

    const updated = await db.updateFeeAgreement(existing.id, firmId, {
      status: 'void',
      updatedBy: req.user!.id,
    });

    await recordAudit({
      firmId,
      userId: req.user!.id,
      userName: req.user!.name,
      entity: 'FeeAgreement',
      entityId: updated.id,
      action: 'VOID_FEE_AGREEMENT',
      oldValue: existing as unknown as Record<string, unknown>,
      newValue: { ...updated, voidReason: parsed.data.reason } as unknown as Record<string, unknown>,
    });

    res.json(updated);
  }
);
