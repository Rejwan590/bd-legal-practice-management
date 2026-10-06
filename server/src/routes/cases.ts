import { Router, Response } from 'express';
import crypto from 'crypto';
import { authMiddleware, AuthenticatedRequest } from '../middleware/auth.js';
import { requirePermission } from '../middleware/permission.js';
import { enforceFirmIsolation } from '../middleware/firmIsolation.js';
import { enforceSubscriptionReadOnly } from '../middleware/subscription.js';
import { getDatabase } from '../db/client.js';
import { recordAudit } from '../services/auditService.js';

export const casesRouter = Router();

casesRouter.use(authMiddleware);
casesRouter.use(enforceFirmIsolation);

function canAccessRestricted(req: AuthenticatedRequest): boolean {
  if (!req.user) return false;
  if (req.user.role === 'Owner') return true;
  return Boolean(req.user.permissions && req.user.permissions.includes('restricted.view'));
}

// GET /api/v1/cases/check-duplicate - Check duplicate case number in same court
casesRouter.get(
  '/check-duplicate',
  requirePermission('cases.view'),
  async (req: AuthenticatedRequest, res: Response) => {
    const db = getDatabase();
    const caseNumber = req.query.caseNumber as string | undefined;
    const court = req.query.court as string | undefined;
    const excludeId = req.query.excludeId as string | undefined;

    if (!caseNumber || !court) {
      return res.status(400).json({ error: 'caseNumber and court parameters are required' });
    }

    const isDuplicate = await db.checkDuplicateCase(
      req.user!.firmId,
      caseNumber,
      court,
      excludeId,
      canAccessRestricted(req)
    );

    res.json({ isDuplicate });
  }
);

// GET /api/v1/cases - List & filter cases
casesRouter.get(
  '/',
  requirePermission('cases.view'),
  async (req: AuthenticatedRequest, res: Response) => {
    const db = getDatabase();
    const { search, status, court, matterType, clientId } = req.query;
    const includeRestricted = canAccessRestricted(req);

    const casesList = await db.listCases(req.user!.firmId, {
      search: search as string | undefined,
      status: (status as 'ongoing' | 'closed' | 'all') || 'all',
      court: court as string | undefined,
      matterType: matterType as string | undefined,
      clientId: clientId as string | undefined,
      includeRestricted,
    });

    res.json(casesList);
  }
);

// GET /api/v1/cases/:id/counts - Linked record counts for a case
casesRouter.get(
  '/:id/counts',
  requirePermission('cases.view'),
  async (req: AuthenticatedRequest, res: Response) => {
    const db = getDatabase();
    const c = await db.getCaseById(req.params.id);

    if (!c || c.firmId !== req.user!.firmId) {
      return res.status(404).json({ error: 'Case not found' });
    }

    if (c.restricted && !canAccessRestricted(req)) {
      return res.status(404).json({ error: 'Case not found' });
    }

    const counts = await db.getCaseLinkedCounts(c.id, req.user!.firmId);
    res.json(counts);
  }
);

// GET /api/v1/cases/:id - Get case by ID
casesRouter.get(
  '/:id',
  requirePermission('cases.view'),
  async (req: AuthenticatedRequest, res: Response) => {
    const db = getDatabase();
    const c = await db.getCaseById(req.params.id);

    if (!c || c.firmId !== req.user!.firmId) {
      return res.status(404).json({ error: 'Case not found' });
    }

    // Confidential case protection: return 404 so unauthorized users cannot confirm case existence
    if (c.restricted && !canAccessRestricted(req)) {
      return res.status(404).json({ error: 'Case not found' });
    }

    res.json(c);
  }
);

// POST /api/v1/cases - Register new case
casesRouter.post(
  '/',
  requirePermission('cases.create'),
  enforceSubscriptionReadOnly,
  async (req: AuthenticatedRequest, res: Response) => {
    const db = getDatabase();
    const {
      clientId,
      fileSerial,
      caseNumber,
      court,
      matterType,
      description,
      plaintiff,
      defendant,
      ourRole,
      plaintiffLawyer,
      defendantLawyer,
      status,
      restricted,
    } = req.body;

    // Validate required fields
    if (!clientId || !clientId.trim()) {
      return res.status(400).json({ error: 'Case requires a client (clientId is required)' });
    }
    if (!caseNumber || !caseNumber.trim()) {
      return res.status(400).json({ error: 'Case number is required' });
    }
    if (!court || !court.trim()) {
      return res.status(400).json({ error: 'Court is required' });
    }
    if (!matterType || !matterType.trim()) {
      return res.status(400).json({ error: 'Matter type is required' });
    }

    // Client verification: Client must exist, belong to this firm, and not be soft-deleted
    const client = await db.getClientById(clientId.trim());
    if (!client || client.firmId !== req.user!.firmId) {
      return res.status(400).json({ error: 'Client not found or does not belong to this chamber' });
    }

    // Confidentiality permission check
    const isRestricted = Boolean(restricted);
    if (isRestricted && !canAccessRestricted(req)) {
      return res.status(403).json({
        error: 'Permission restricted.view required to register confidential cases',
      });
    }

    // Duplicate check in the same court
    const isDuplicate = await db.checkDuplicateCase(
      req.user!.firmId,
      caseNumber.trim(),
      court.trim(),
      undefined,
      canAccessRestricted(req)
    );

    const id = crypto.randomUUID();
    const now = new Date();

    const newCase = await db.insertCase({
      id,
      firmId: req.user!.firmId,
      clientId: client.id,
      fileSerial: fileSerial?.trim() || null,
      caseNumber: caseNumber.trim(),
      court: court.trim(),
      matterType: matterType.trim(),
      description: description?.trim() || null,
      plaintiff: plaintiff?.trim() || null,
      defendant: defendant?.trim() || null,
      ourRole: ourRole || 'Plaintiff',
      plaintiffLawyer: plaintiffLawyer?.trim() || null,
      defendantLawyer: defendantLawyer?.trim() || null,
      status: status === 'closed' ? 'closed' : 'ongoing',
      restricted: isRestricted,
      nextHearingAt: null,
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
      createdBy: req.user!.id,
      updatedBy: req.user!.id,
    });

    // Record immutable audit log
    await recordAudit({
      firmId: req.user!.firmId,
      userId: req.user!.id,
      userName: req.user!.name,
      entity: 'Case',
      entityId: newCase.id,
      action: 'CREATE',
      oldValue: null,
      newValue: {
        id: newCase.id,
        caseNumber: newCase.caseNumber,
        court: newCase.court,
        clientId: newCase.clientId,
        restricted: newCase.restricted,
        status: newCase.status,
      },
    });

    res.status(201).json({
      ...newCase,
      warning: isDuplicate
        ? 'Duplicate case number in the same court detected'
        : undefined,
    });
  }
);

// PATCH /api/v1/cases/:id - Update case / close case
casesRouter.patch(
  '/:id',
  requirePermission('cases.edit'),
  enforceSubscriptionReadOnly,
  async (req: AuthenticatedRequest, res: Response) => {
    const db = getDatabase();
    const existing = await db.getCaseById(req.params.id);

    if (!existing || existing.firmId !== req.user!.firmId) {
      return res.status(404).json({ error: 'Case not found' });
    }

    const hasRestrictedPermission = canAccessRestricted(req);

    // If case is restricted, or request is trying to change restricted flag, verify permission
    if ((existing.restricted || req.body.restricted !== undefined) && !hasRestrictedPermission) {
      return res.status(403).json({
        error: 'Permission restricted.view required to access or modify confidential cases',
      });
    }

    // If changing clientId, verify new client exists and belongs to firm
    if (req.body.clientId && req.body.clientId !== existing.clientId) {
      const client = await db.getClientById(req.body.clientId);
      if (!client || client.firmId !== req.user!.firmId) {
        return res.status(400).json({ error: 'Client not found or does not belong to this chamber' });
      }
    }

    // Check duplicate warning if caseNumber or court changed
    let isDuplicate = false;
    const targetCaseNumber = req.body.caseNumber || existing.caseNumber;
    const targetCourt = req.body.court || existing.court;
    if (req.body.caseNumber || req.body.court) {
      isDuplicate = await db.checkDuplicateCase(
        req.user!.firmId,
        targetCaseNumber,
        targetCourt,
        existing.id,
        canAccessRestricted(req)
      );
    }

    const updates = {
      ...(req.body.clientId && { clientId: req.body.clientId }),
      ...(req.body.fileSerial !== undefined && { fileSerial: req.body.fileSerial?.trim() || null }),
      ...(req.body.caseNumber && { caseNumber: req.body.caseNumber.trim() }),
      ...(req.body.court && { court: req.body.court.trim() }),
      ...(req.body.matterType && { matterType: req.body.matterType.trim() }),
      ...(req.body.description !== undefined && { description: req.body.description?.trim() || null }),
      ...(req.body.plaintiff !== undefined && { plaintiff: req.body.plaintiff?.trim() || null }),
      ...(req.body.defendant !== undefined && { defendant: req.body.defendant?.trim() || null }),
      ...(req.body.ourRole && { ourRole: req.body.ourRole }),
      ...(req.body.plaintiffLawyer !== undefined && { plaintiffLawyer: req.body.plaintiffLawyer?.trim() || null }),
      ...(req.body.defendantLawyer !== undefined && { defendantLawyer: req.body.defendantLawyer?.trim() || null }),
      ...(req.body.status && { status: req.body.status }),
      ...(req.body.restricted !== undefined && { restricted: Boolean(req.body.restricted) }),
      ...(req.body.nextHearingAt !== undefined && {
        nextHearingAt: req.body.nextHearingAt ? new Date(req.body.nextHearingAt) : null,
      }),
      updatedBy: req.user!.id,
    };

    const updated = await db.updateCase(existing.id, updates);

    // Record immutable audit log
    await recordAudit({
      firmId: req.user!.firmId,
      userId: req.user!.id,
      userName: req.user!.name,
      entity: 'Case',
      entityId: existing.id,
      action: 'UPDATE',
      oldValue: {
        caseNumber: existing.caseNumber,
        court: existing.court,
        status: existing.status,
        restricted: existing.restricted,
      },
      newValue: {
        caseNumber: updated.caseNumber,
        court: updated.court,
        status: updated.status,
        restricted: updated.restricted,
      },
    });

    res.json({
      ...updated,
      warning: isDuplicate
        ? 'Duplicate case number in the same court detected'
        : undefined,
    });
  }
);

// DELETE /api/v1/cases/:id - Soft delete case (Owner only with cases.delete)
casesRouter.delete(
  '/:id',
  requirePermission('cases.delete'),
  enforceSubscriptionReadOnly,
  async (req: AuthenticatedRequest, res: Response) => {
    // Only chamber Owner can delete cases
    if (req.user!.role !== 'Owner') {
      return res.status(403).json({ error: 'Permission denied: Only chamber Owner can delete cases' });
    }

    const db = getDatabase();
    const existing = await db.getCaseById(req.params.id);

    if (!existing || existing.firmId !== req.user!.firmId) {
      return res.status(404).json({ error: 'Case not found' });
    }

    const now = new Date();
    await db.updateCase(existing.id, {
      deletedAt: now,
      updatedBy: req.user!.id,
    });

    // Record immutable audit log
    await recordAudit({
      firmId: req.user!.firmId,
      userId: req.user!.id,
      userName: req.user!.name,
      entity: 'Case',
      entityId: existing.id,
      action: 'DELETE',
      oldValue: {
        caseNumber: existing.caseNumber,
        court: existing.court,
        clientId: existing.clientId,
      },
      newValue: {
        deletedAt: now.toISOString(),
      },
    });

    res.json({ success: true, softDeleted: true });
  }
);
