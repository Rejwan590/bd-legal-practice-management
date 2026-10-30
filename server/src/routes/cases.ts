import { Router, Response } from 'express';
import crypto from 'crypto';
import { authMiddleware, AuthenticatedRequest } from '../middleware/auth.js';
import { requirePermission } from '../middleware/permission.js';
import { enforceFirmIsolation } from '../middleware/firmIsolation.js';
import { enforceSubscriptionReadOnly } from '../middleware/subscription.js';
import { getDatabase } from '../db/client.js';
import * as schema from '../db/schema.js';
import { recordAudit } from '../services/auditService.js';
import { isLawyerOrOwner } from '../rolePresets.js';

export const casesRouter = Router();

casesRouter.use(authMiddleware);
casesRouter.use(enforceFirmIsolation);

export function validateCaseRoles(
  category: string,
  ourRole?: string | null,
  partyARole?: string | null,
  partyBRole?: string | null
): { valid: boolean; error?: string } {
  if (category === 'criminal_gr') {
    const validOurRoles = ['Prosecution counsel', 'Defence counsel'];
    if (ourRole && !validOurRoles.includes(ourRole)) {
      return {
        valid: false,
        error: `Invalid ourRole '${ourRole}' for Criminal GR. Allowed roles: ${validOurRoles.join(', ')}`,
      };
    }
    const validPartyARoles = ['Prosecution', 'State'];
    if (partyARole && !validPartyARoles.includes(partyARole)) {
      return {
        valid: false,
        error: `Invalid partyARole '${partyARole}' for Criminal GR. Allowed roles: ${validPartyARoles.join(', ')}`,
      };
    }
  } else if (category === 'criminal_cr') {
    const validOurRoles = ["Complainant's counsel", 'Defence counsel'];
    if (ourRole && !validOurRoles.includes(ourRole)) {
      return {
        valid: false,
        error: `Invalid ourRole '${ourRole}' for Criminal CR. Allowed roles: ${validOurRoles.join(', ')}`,
      };
    }
    const validPartyARoles = ['Complainant'];
    if (partyARole && !validPartyARoles.includes(partyARole)) {
      return {
        valid: false,
        error: `Invalid partyARole '${partyARole}' for Criminal CR. Allowed roles: ${validPartyARoles.join(', ')}`,
      };
    }
  } else if (category === 'civil') {
    const validOurRoles = [
      'Plaintiff',
      'Defendant',
      'Applicant',
      'Opposite Party',
      'Revisioner',
      'Respondent',
      'Appellant',
      'Petitioner',
    ];
    if (ourRole && !validOurRoles.includes(ourRole)) {
      return {
        valid: false,
        error: `Invalid ourRole '${ourRole}' for Civil. Allowed roles: ${validOurRoles.join(', ')}`,
      };
    }
  }
  return { valid: true };
}

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
      canAccessRestricted(req),
      req.user
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
    const { search, status, court, matterType, clientId, scope } = req.query;
    const includeRestricted = canAccessRestricted(req);

    const casesList = await db.listCases(req.user!.firmId, {
      search: search as string | undefined,
      status: (status as 'ongoing' | 'closed' | 'all') || 'all',
      court: court as string | undefined,
      matterType: matterType as string | undefined,
      clientId: clientId as string | undefined,
      includeRestricted,
      user: req.user,
      scope: (scope as 'my' | 'team' | 'all') || undefined,
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
    const c = await db.getCaseById(req.params.id, req.user!.firmId, req.user);

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

// GET /api/v1/cases/:id/shares - List case shares
casesRouter.get(
  '/:id/shares',
  requirePermission('cases.view'),
  async (req: AuthenticatedRequest, res: Response) => {
    const db = getDatabase();
    const c = await db.getCaseById(req.params.id, req.user!.firmId, req.user);
    if (!c || c.firmId !== req.user!.firmId) {
      return res.status(404).json({ error: 'Case not found' });
    }
    const shares = await db.listCaseShares(c.id, req.user!.firmId);
    res.json(shares);
  }
);

// POST /api/v1/cases/:id/shares - Share a case with another user in the firm
casesRouter.post(
  '/:id/shares',
  requirePermission('cases.edit'),
  enforceSubscriptionReadOnly,
  async (req: AuthenticatedRequest, res: Response) => {
    const db = getDatabase();
    const c = await db.getCaseById(req.params.id, req.user!.firmId, req.user);
    if (!c || c.firmId !== req.user!.firmId) {
      return res.status(404).json({ error: 'Case not found' });
    }
    const { userId } = req.body;
    if (!userId || typeof userId !== 'string') {
      return res.status(400).json({ error: 'userId is required' });
    }
    const targetUser = await db.getUserById(userId);
    if (!targetUser || targetUser.firmId !== req.user!.firmId || !targetUser.active) {
      return res.status(400).json({ error: 'Target user not found or inactive in this chamber' });
    }
    const share = await db.insertCaseShare({
      id: `share-${crypto.randomUUID()}`,
      firmId: req.user!.firmId,
      caseId: c.id,
      userId: targetUser.id,
      createdBy: req.user!.id,
    });
    await recordAudit({
      firmId: req.user!.firmId,
      userId: req.user!.id,
      userName: req.user!.name,
      entity: 'Case',
      entityId: c.id,
      action: 'SHARE_CASE',
      oldValue: null,
      newValue: { shareId: share.id, caseId: c.id, sharedWithUserId: targetUser.id, sharedWithName: targetUser.name },
    });
    res.status(201).json(share);
  }
);

// DELETE /api/v1/cases/:id/shares/:shareId - Remove case share
casesRouter.delete(
  '/:id/shares/:shareId',
  requirePermission('cases.edit'),
  enforceSubscriptionReadOnly,
  async (req: AuthenticatedRequest, res: Response) => {
    const db = getDatabase();
    const c = await db.getCaseById(req.params.id, req.user!.firmId, req.user);
    if (!c || c.firmId !== req.user!.firmId) {
      return res.status(404).json({ error: 'Case not found' });
    }
    const shares = await db.listCaseShares(c.id, req.user!.firmId);
    const targetShare = shares.find((s) => s.id === req.params.shareId || s.userId === req.params.shareId);
    if (!targetShare) {
      return res.status(404).json({ error: 'Share not found' });
    }
    await db.deleteCaseShare(targetShare.id, req.user!.firmId);
    await recordAudit({
      firmId: req.user!.firmId,
      userId: req.user!.id,
      userName: req.user!.name,
      entity: 'Case',
      entityId: c.id,
      action: 'UNSHARE_CASE',
      oldValue: { shareId: targetShare.id, caseId: c.id, sharedWithUserId: targetShare.userId },
      newValue: { deletedAt: new Date().toISOString() },
    });
    res.json({ success: true });
  }
);

// GET /api/v1/cases/:id - Get case by ID
casesRouter.get(
  '/:id',
  requirePermission('cases.view'),
  async (req: AuthenticatedRequest, res: Response) => {
    const db = getDatabase();
    const c = await db.getCaseById(req.params.id, req.user!.firmId, req.user);

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
      responsibleLawyerId,
      status,
      caseDate,
      closedOn,
      caseCategory = 'civil',
      partyARole,
      partyBRole,
      policeStation,
      sectionsOfLaw,
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

    // Role validation
    const roleValidation = validateCaseRoles(caseCategory, ourRole, partyARole, partyBRole);
    if (!roleValidation.valid) {
      return res.status(400).json({ error: roleValidation.error });
    }

    // Client verification: Client must exist, belong to this firm, and not be soft-deleted
    const client = await db.getClientById(clientId.trim(), req.user!.firmId);
    if (!client || client.firmId !== req.user!.firmId) {
      return res.status(400).json({ error: 'Client not found or does not belong to this chamber' });
    }

    // Validate responsibleLawyerId if provided
    let resolvedRespLawyerId: string | null = null;
    if (responsibleLawyerId !== undefined && responsibleLawyerId !== null && responsibleLawyerId !== '') {
      const respUser = await db.getUserById(String(responsibleLawyerId));
      if (!respUser || respUser.firmId !== req.user!.firmId || !respUser.active) {
        return res.status(400).json({ error: 'Responsible lawyer must be an active user of the same firm' });
      }
      if (!isLawyerOrOwner(respUser)) {
        return res.status(400).json({ error: 'Responsible lawyer must be a lawyer or Owner' });
      }
      resolvedRespLawyerId = respUser.id;
    } else if (isLawyerOrOwner(req.user!)) {
      resolvedRespLawyerId = req.user!.id;
    } else if (req.user!.reportsToUserId) {
      resolvedRespLawyerId = req.user!.reportsToUserId;
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
      canAccessRestricted(req),
      req.user
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
      ourRole: ourRole || (caseCategory === 'criminal_gr' ? 'Prosecution counsel' : caseCategory === 'criminal_cr' ? "Complainant's counsel" : 'Plaintiff'),
      plaintiffLawyer: plaintiffLawyer?.trim() || null,
      defendantLawyer: defendantLawyer?.trim() || null,
      responsibleLawyerId: resolvedRespLawyerId,
      status: status === 'closed' ? 'closed' : status === 'pending' ? 'pending' : 'ongoing',
      caseDate: caseDate ? new Date(caseDate) : null,
      closedOn: closedOn ? new Date(closedOn) : status === 'closed' ? now : null,
      caseCategory: caseCategory || 'civil',
      partyARole: partyARole?.trim() || null,
      partyBRole: partyBRole?.trim() || null,
      policeStation: policeStation?.trim() || null,
      sectionsOfLaw: sectionsOfLaw?.trim() || null,
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
        responsibleLawyerId: newCase.responsibleLawyerId,
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
    const hasRestrictedPermission = canAccessRestricted(req);
    // Check team visibility first (ignoring restricted flag so team-visible restricted cases return 403 below, while other teams' cases return 404)
    const existing = await db.getCaseById(req.params.id, req.user!.firmId, {
      ...req.user!,
      permissions: hasRestrictedPermission
        ? req.user!.permissions
        : [...req.user!.permissions, 'restricted.view'],
    });
    if (!existing || existing.firmId !== req.user!.firmId) {
      return res.status(404).json({ error: 'Case not found' });
    }

    // If case is restricted, or request is trying to change restricted flag, verify permission
    if ((existing.restricted || req.body.restricted !== undefined) && !hasRestrictedPermission) {
      return res.status(403).json({
        error: 'Permission restricted.view required to access or modify confidential cases',
      });
    }

    // If changing clientId, verify new client exists and belongs to firm
    if (req.body.clientId && req.body.clientId !== existing.clientId) {
      const client = await db.getClientById(req.body.clientId, req.user!.firmId);
      if (!client || client.firmId !== req.user!.firmId) {
        return res.status(400).json({ error: 'Client not found or does not belong to this chamber' });
      }
    }

    // Validate responsibleLawyerId if provided
    if (req.body.responsibleLawyerId !== undefined && req.body.responsibleLawyerId !== null && req.body.responsibleLawyerId !== '') {
      const respUser = await db.getUserById(String(req.body.responsibleLawyerId));
      if (!respUser || respUser.firmId !== req.user!.firmId || !respUser.active) {
        return res.status(400).json({ error: 'Responsible lawyer must be an active user of the same firm' });
      }
      if (!isLawyerOrOwner(respUser)) {
        return res.status(400).json({ error: 'Responsible lawyer must be a lawyer or Owner' });
      }
    }

    // Role validation on updates
    const targetCategory = req.body.caseCategory || existing.caseCategory;
    const targetOurRole = req.body.ourRole !== undefined ? req.body.ourRole : existing.ourRole;
    const targetPartyARole = req.body.partyARole !== undefined ? req.body.partyARole : existing.partyARole;
    const targetPartyBRole = req.body.partyBRole !== undefined ? req.body.partyBRole : existing.partyBRole;
    const roleValidation = validateCaseRoles(targetCategory, targetOurRole, targetPartyARole, targetPartyBRole);
    if (!roleValidation.valid) {
      return res.status(400).json({ error: roleValidation.error });
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
        canAccessRestricted(req),
        req.user
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
      ...(req.body.responsibleLawyerId !== undefined && {
        responsibleLawyerId: req.body.responsibleLawyerId || null,
      }),
      ...(req.body.status && { status: req.body.status }),
      ...(req.body.caseDate !== undefined && { caseDate: req.body.caseDate ? new Date(req.body.caseDate) : null }),
      ...(req.body.closedOn !== undefined && { closedOn: req.body.closedOn ? new Date(req.body.closedOn) : null }),
      ...(req.body.status === 'closed' && req.body.closedOn === undefined && !existing.closedOn && { closedOn: new Date() }),
      ...(req.body.status === 'ongoing' && req.body.closedOn === undefined && { closedOn: null }),
      ...(req.body.caseCategory !== undefined && { caseCategory: req.body.caseCategory }),
      ...(req.body.partyARole !== undefined && { partyARole: req.body.partyARole?.trim() || null }),
      ...(req.body.partyBRole !== undefined && { partyBRole: req.body.partyBRole?.trim() || null }),
      ...(req.body.policeStation !== undefined && { policeStation: req.body.policeStation?.trim() || null }),
      ...(req.body.sectionsOfLaw !== undefined && { sectionsOfLaw: req.body.sectionsOfLaw?.trim() || null }),
      ...(req.body.restricted !== undefined && { restricted: Boolean(req.body.restricted) }),
      ...(req.body.nextHearingAt !== undefined && {
        nextHearingAt: req.body.nextHearingAt ? new Date(req.body.nextHearingAt) : null,
      }),
      updatedBy: req.user!.id,
    };

    const updated = await db.updateCase(existing.id, req.user!.firmId, updates);

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
        responsibleLawyerId: existing.responsibleLawyerId,
      },
      newValue: {
        caseNumber: updated.caseNumber,
        court: updated.court,
        status: updated.status,
        restricted: updated.restricted,
        responsibleLawyerId: updated.responsibleLawyerId,
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
    const existing = await db.getCaseById(req.params.id, req.user!.firmId, req.user);

    if (!existing || existing.firmId !== req.user!.firmId) {
      return res.status(404).json({ error: 'Case not found' });
    }

    const now = new Date();
    await db.updateCase(existing.id, req.user!.firmId, {
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

// GET /api/v1/cases/:id/notes - List case notes
casesRouter.get(
  '/:id/notes',
  requirePermission('cases.view'),
  async (req: AuthenticatedRequest, res: Response) => {
    const db = getDatabase();
    const c = await db.getCaseById(req.params.id, req.user!.firmId, req.user);
    if (!c || c.firmId !== req.user!.firmId) {
      return res.status(404).json({ error: 'Case not found' });
    }
    if (c.restricted && !canAccessRestricted(req)) {
      return res.status(404).json({ error: 'Case not found' });
    }
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string) || 50));
    const offset = Math.max(0, parseInt(req.query.offset as string) || 0);
    const notesData = await db.listCaseNotes(c.id, req.user!.firmId, limit, offset);
    res.json(notesData);
  }
);

// POST /api/v1/cases/:id/notes - Create case note
casesRouter.post(
  '/:id/notes',
  requirePermission('cases.edit'),
  enforceSubscriptionReadOnly,
  async (req: AuthenticatedRequest, res: Response) => {
    const db = getDatabase();
    const c = await db.getCaseById(req.params.id, req.user!.firmId, req.user);
    if (!c || c.firmId !== req.user!.firmId) {
      return res.status(404).json({ error: 'Case not found' });
    }
    if (c.restricted && !canAccessRestricted(req)) {
      return res.status(404).json({ error: 'Case not found' });
    }
    const { noteDate, body } = req.body;
    if (!body || !body.trim()) {
      return res.status(400).json({ error: 'Note text is required' });
    }
    if (body.trim().length > 5000) {
      return res.status(400).json({ error: 'Note text cannot exceed 5000 characters' });
    }
    const formattedDate = noteDate && String(noteDate).trim() ? String(noteDate).trim().slice(0, 10) : new Date().toISOString().slice(0, 10);
    const now = new Date();
    const note = await db.insertCaseNote({
      id: crypto.randomUUID(),
      firmId: req.user!.firmId,
      caseId: c.id,
      noteDate: formattedDate,
      body: body.trim(),
      createdBy: req.user!.id,
      updatedBy: req.user!.id,
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    });

    await recordAudit({
      firmId: req.user!.firmId,
      userId: req.user!.id,
      userName: req.user!.name,
      entity: 'CaseNote',
      entityId: note.id,
      action: 'CREATE',
      oldValue: null,
      newValue: {
        caseId: c.id,
        noteDate: note.noteDate,
        bodyLength: note.body.length,
      },
    });

    res.status(201).json(note);
  }
);

// PATCH /api/v1/cases/:id/notes/:noteId - Update case note
casesRouter.patch(
  '/:id/notes/:noteId',
  requirePermission('cases.edit'),
  enforceSubscriptionReadOnly,
  async (req: AuthenticatedRequest, res: Response) => {
    const db = getDatabase();
    const c = await db.getCaseById(req.params.id, req.user!.firmId, req.user);
    if (!c || c.firmId !== req.user!.firmId) {
      return res.status(404).json({ error: 'Case not found' });
    }
    if (c.restricted && !canAccessRestricted(req)) {
      return res.status(404).json({ error: 'Case not found' });
    }
    const existing = await db.getCaseNoteById(req.params.noteId, c.id, req.user!.firmId);
    if (!existing) {
      return res.status(404).json({ error: 'Note not found' });
    }
    const { noteDate, body } = req.body;
    if (body !== undefined && body.trim().length > 5000) {
      return res.status(400).json({ error: 'Note text cannot exceed 5000 characters' });
    }
    const updates: Partial<schema.CaseNote> = {};
    if (noteDate !== undefined) updates.noteDate = String(noteDate).trim().slice(0, 10);
    if (body !== undefined) updates.body = body.trim();
    updates.updatedBy = req.user!.id;

    const updated = await db.updateCaseNote(existing.id, c.id, req.user!.firmId, updates);
    await recordAudit({
      firmId: req.user!.firmId,
      userId: req.user!.id,
      userName: req.user!.name,
      entity: 'CaseNote',
      entityId: updated.id,
      action: 'UPDATE',
      oldValue: { noteDate: existing.noteDate, bodyLength: existing.body.length },
      newValue: { noteDate: updated.noteDate, bodyLength: updated.body.length },
    });
    res.json(updated);
  }
);

// DELETE /api/v1/cases/:id/notes/:noteId - Delete case note
casesRouter.delete(
  '/:id/notes/:noteId',
  requirePermission('cases.edit'),
  enforceSubscriptionReadOnly,
  async (req: AuthenticatedRequest, res: Response) => {
    const db = getDatabase();
    const c = await db.getCaseById(req.params.id, req.user!.firmId, req.user);
    if (!c || c.firmId !== req.user!.firmId) {
      return res.status(404).json({ error: 'Case not found' });
    }
    if (c.restricted && !canAccessRestricted(req)) {
      return res.status(404).json({ error: 'Case not found' });
    }
    const existing = await db.getCaseNoteById(req.params.noteId, c.id, req.user!.firmId);
    if (!existing) {
      return res.status(404).json({ error: 'Note not found' });
    }
    await db.deleteCaseNote(existing.id, c.id, req.user!.firmId, req.user!.id);
    await recordAudit({
      firmId: req.user!.firmId,
      userId: req.user!.id,
      userName: req.user!.name,
      entity: 'CaseNote',
      entityId: existing.id,
      action: 'DELETE',
      oldValue: { noteDate: existing.noteDate, bodyLength: existing.body.length },
      newValue: { softDeleted: true },
    });
    res.json({ success: true, softDeleted: true });
  }
);
