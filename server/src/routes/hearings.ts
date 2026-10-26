import { Router, Response } from 'express';
import crypto from 'crypto';
import { z } from 'zod';
import { authMiddleware, AuthenticatedRequest } from '../middleware/auth.js';
import { requirePermission } from '../middleware/permission.js';
import { enforceFirmIsolation } from '../middleware/firmIsolation.js';
import { enforceSubscriptionReadOnly } from '../middleware/subscription.js';
import { getDatabase, IDatabase } from '../db/client.js';
import * as schema from '../db/schema.js';
import { recordAudit } from '../services/auditService.js';
import { validateFixedFor } from '../services/hearingFixedFor.js';

export const hearingsRouter = Router();

hearingsRouter.use(authMiddleware);
hearingsRouter.use(enforceFirmIsolation);

function canAccessRestricted(req: AuthenticatedRequest): boolean {
  if (!req.user) return false;
  if (req.user.role === 'Owner') return true;
  return Boolean(req.user.permissions && req.user.permissions.includes('restricted.view'));
}

async function syncCaseNextHearing(db: IDatabase, firmId: string, caseId: string): Promise<void> {
  const hearings = await db.listHearings(firmId, { caseId, status: 'scheduled' });
  hearings.sort((a, b) => new Date(a.scheduledAt).getTime() - new Date(b.scheduledAt).getTime());
  const nextHearing = hearings[0] || null;
  await db.updateCase(caseId, firmId, {
    nextHearingAt: nextHearing ? new Date(nextHearing.scheduledAt) : null,
  });
}

// Zod schemas
const createHearingSchema = z.object({
  caseId: z.string().min(1, 'caseId is required'),
  appearingLawyerId: z.string().nullable().optional(),
  scheduledAt: z.string().refine((val) => !isNaN(Date.parse(val)), { message: 'Invalid scheduledAt ISO string' }),
  court: z.string().optional().nullable(),
  purpose: z.string().min(1, 'purpose is required').max(500),
  outcomeNote: z.string().max(2000).optional().nullable(),
  fixedFor: z.string().min(1, 'fixedFor is required'),
  fixedForNote: z.string().max(200).optional().nullable(),
});

const updateHearingSchema = z.object({
  appearingLawyerId: z.string().nullable().optional(),
  court: z.string().optional().nullable(),
  purpose: z.string().max(500).optional(),
  status: z.enum(['scheduled', 'held', 'adjourned', 'cancelled']).optional(),
  outcomeNote: z.string().max(2000).optional().nullable(),
  fixedFor: z.string().min(1).optional(),
  fixedForNote: z.string().max(200).optional().nullable(),
});

const rescheduleHearingSchema = z.object({
  scheduledAt: z.string().refine((val) => !isNaN(Date.parse(val)), { message: 'Invalid scheduledAt ISO string' }),
  reason: z.string().min(1, 'reason is required').max(500),
  fixedFor: z.string().min(1, 'fixedFor is required'),
  fixedForNote: z.string().max(200).optional().nullable(),
});

const adjournHearingSchema = z.object({
  nextDate: z.string().refine((val) => !isNaN(Date.parse(val)), { message: 'Invalid nextDate ISO string' }),
  reason: z.string().min(1, 'reason is required').max(500),
  nextFixedFor: z.string().min(1, 'nextFixedFor is required'),
  nextFixedForNote: z.string().max(200).optional().nullable(),
  outcomeNote: z.string().max(2000).optional().nullable(),
  nextPurpose: z.string().max(500).optional().nullable(),
});

// GET /api/v1/hearings - List hearings respecting case visibility
hearingsRouter.get(
  '/',
  requirePermission('cases.view'),
  async (req: AuthenticatedRequest, res: Response) => {
    const db = getDatabase();
    const firmId = req.user!.firmId;

    const filter = {
      caseId: req.query.caseId as string | undefined,
      status: req.query.status as string | undefined,
      fromDate: req.query.fromDate as string | undefined,
      toDate: req.query.toDate as string | undefined,
      fixedFor: req.query.fixedFor as string | undefined,
    };

    const hearings = await db.listHearings(firmId, filter, req.user);
    res.json(hearings);
  }
);

// GET /api/v1/hearings/:id - Get hearing by ID
hearingsRouter.get(
  '/:id',
  requirePermission('cases.view'),
  async (req: AuthenticatedRequest, res: Response) => {
    const db = getDatabase();
    const firmId = req.user!.firmId;
    const hearing = await db.getHearingById(req.params.id, firmId, req.user);
    if (!hearing) {
      return res.status(404).json({ error: 'NotFound', message: 'Hearing not found' });
    }

    const caseRecord = await db.getCaseById(hearing.caseId, firmId, req.user);
    if (caseRecord?.restricted && !canAccessRestricted(req)) {
      return res.status(404).json({ error: 'NotFound', message: 'Hearing not found' });
    }

    res.json(hearing);
  }
);

// POST /api/v1/hearings - Create hearing with fixed_for validation
hearingsRouter.post(
  '/',
  requirePermission('hearings.update'),
  enforceSubscriptionReadOnly,
  async (req: AuthenticatedRequest, res: Response) => {
    const parseRes = createHearingSchema.safeParse(req.body);
    if (!parseRes.success) {
      return res.status(400).json({ error: 'ValidationError', details: parseRes.error.flatten() });
    }

    const db = getDatabase();
    const firmId = req.user!.firmId;
    const { caseId, appearingLawyerId, scheduledAt, court, purpose, outcomeNote, fixedFor, fixedForNote } = parseRes.data;

    // Check case visibility
    const caseRecord = await db.getCaseById(caseId, firmId, req.user);
    if (!caseRecord) {
      return res.status(404).json({ error: 'NotFound', message: 'Target case not found' });
    }
    if (caseRecord.restricted && !canAccessRestricted(req)) {
      return res.status(404).json({ error: 'NotFound', message: 'Target case not found' });
    }

    // Validate fixedFor against case category
    const fixedForValidation = validateFixedFor(caseRecord.caseCategory, fixedFor);
    if (!fixedForValidation.valid) {
      return res.status(400).json({ error: 'ValidationError', message: fixedForValidation.error });
    }

    const result = await db.transaction(async (txDb) => {
      const newHearing = await txDb.insertHearing({
        id: crypto.randomUUID(),
        firmId,
        caseId,
        appearingLawyerId: appearingLawyerId !== undefined ? appearingLawyerId : caseRecord.responsibleLawyerId,
        scheduledAt: new Date(scheduledAt),
        court: court || caseRecord.court,
        purpose,
        status: 'scheduled',
        outcomeNote: outcomeNote || null,
        fixedFor,
        fixedForNote: fixedForNote || null,
        createdBy: req.user!.id,
        updatedBy: req.user!.id,
      });

      await syncCaseNextHearing(txDb, firmId, caseId);

      await recordAudit({
        firmId,
        userId: req.user!.id,
        userName: req.user!.name,
        entity: 'Hearing',
        entityId: newHearing.id,
        action: 'CREATE',
        oldValue: null,
        newValue: {
          caseId,
          scheduledAt,
          purpose,
          fixedFor,
          fixedForNote,
        },
      });

      return newHearing;
    });

    res.status(201).json(result);
  }
);

// PATCH /api/v1/hearings/:id - Update hearing
hearingsRouter.patch(
  '/:id',
  requirePermission('hearings.update'),
  enforceSubscriptionReadOnly,
  async (req: AuthenticatedRequest, res: Response) => {
    const parseRes = updateHearingSchema.safeParse(req.body);
    if (!parseRes.success) {
      return res.status(400).json({ error: 'ValidationError', details: parseRes.error.flatten() });
    }

    const db = getDatabase();
    const firmId = req.user!.firmId;
    const existing = await db.getHearingById(req.params.id, firmId, req.user);
    if (!existing) {
      return res.status(404).json({ error: 'NotFound', message: 'Hearing not found' });
    }

    const caseRecord = await db.getCaseById(existing.caseId, firmId, req.user);
    if (caseRecord?.restricted && !canAccessRestricted(req)) {
      return res.status(404).json({ error: 'NotFound', message: 'Hearing not found' });
    }

    if (parseRes.data.fixedFor) {
      const fixedForValidation = validateFixedFor(caseRecord?.caseCategory, parseRes.data.fixedFor);
      if (!fixedForValidation.valid) {
        return res.status(400).json({ error: 'ValidationError', message: fixedForValidation.error });
      }
    }

    const updates: Partial<schema.Hearing> = {
      ...parseRes.data,
      updatedBy: req.user!.id,
    };

    const result = await db.transaction(async (txDb) => {
      const updated = await txDb.updateHearing(req.params.id, firmId, updates);
      await syncCaseNextHearing(txDb, firmId, existing.caseId);
      await recordAudit({
        firmId,
        userId: req.user!.id,
        userName: req.user!.name,
        entity: 'Hearing',
        entityId: existing.id,
        action: 'UPDATE',
        oldValue: existing as unknown as Record<string, unknown>,
        newValue: updated as unknown as Record<string, unknown>,
      });
      return updated;
    });

    res.json(result);
  }
);

// POST /api/v1/hearings/:id/reschedule - Reschedule date with reason and fixed_for
hearingsRouter.post(
  '/:id/reschedule',
  requirePermission('hearings.update'),
  enforceSubscriptionReadOnly,
  async (req: AuthenticatedRequest, res: Response) => {
    const parseRes = rescheduleHearingSchema.safeParse(req.body);
    if (!parseRes.success) {
      return res.status(400).json({ error: 'ValidationError', details: parseRes.error.flatten() });
    }

    const db = getDatabase();
    const firmId = req.user!.firmId;
    const existing = await db.getHearingById(req.params.id, firmId, req.user);
    if (!existing) {
      return res.status(404).json({ error: 'NotFound', message: 'Hearing not found' });
    }

    const caseRecord = await db.getCaseById(existing.caseId, firmId, req.user);
    if (caseRecord?.restricted && !canAccessRestricted(req)) {
      return res.status(404).json({ error: 'NotFound', message: 'Hearing not found' });
    }

    const { scheduledAt, reason, fixedFor, fixedForNote } = parseRes.data;

    // Validate fixedFor against case category
    const fixedForValidation = validateFixedFor(caseRecord?.caseCategory, fixedFor);
    if (!fixedForValidation.valid) {
      return res.status(400).json({ error: 'ValidationError', message: fixedForValidation.error });
    }

    const result = await db.transaction(async (txDb) => {
      const oldAt = existing.scheduledAt;
      const oldFixedFor = existing.fixedFor;

      const history = await txDb.insertHearingDateHistory({
        id: crypto.randomUUID(),
        firmId,
        hearingId: existing.id,
        caseId: existing.caseId,
        oldAt,
        newAt: new Date(scheduledAt),
        reason: reason.trim(),
        oldFixedFor: oldFixedFor ?? null,
        newFixedFor: fixedFor,
        changedBy: req.user!.id,
      });

      const updatedHearing = await txDb.updateHearing(existing.id, firmId, {
        scheduledAt: new Date(scheduledAt),
        fixedFor,
        fixedForNote: fixedForNote || null,
        updatedBy: req.user!.id,
      });

      await syncCaseNextHearing(txDb, firmId, existing.caseId);

      await recordAudit({
        firmId,
        userId: req.user!.id,
        userName: req.user!.name,
        entity: 'Hearing',
        entityId: existing.id,
        action: 'HEARING_DATE_CHANGE',
        oldValue: {
          scheduledAt: oldAt,
          fixedFor: oldFixedFor,
        },
        newValue: {
          scheduledAt,
          fixedFor,
          reason: reason.trim(),
        },
      });

      return { hearing: updatedHearing, history };
    });

    res.json(result);
  }
);

// POST /api/v1/hearings/:id/adjourn - Adjourn hearing and create next date
hearingsRouter.post(
  '/:id/adjourn',
  requirePermission('hearings.update'),
  enforceSubscriptionReadOnly,
  async (req: AuthenticatedRequest, res: Response) => {
    const parseRes = adjournHearingSchema.safeParse(req.body);
    if (!parseRes.success) {
      return res.status(400).json({ error: 'ValidationError', details: parseRes.error.flatten() });
    }

    const db = getDatabase();
    const firmId = req.user!.firmId;
    const existing = await db.getHearingById(req.params.id, firmId, req.user);
    if (!existing) {
      return res.status(404).json({ error: 'NotFound', message: 'Hearing not found' });
    }

    const caseRecord = await db.getCaseById(existing.caseId, firmId, req.user);
    if (caseRecord?.restricted && !canAccessRestricted(req)) {
      return res.status(404).json({ error: 'NotFound', message: 'Hearing not found' });
    }

    const { nextDate, reason, nextFixedFor, nextFixedForNote, outcomeNote, nextPurpose } = parseRes.data;

    // Validate nextFixedFor against case category
    const fixedForValidation = validateFixedFor(caseRecord?.caseCategory, nextFixedFor);
    if (!fixedForValidation.valid) {
      return res.status(400).json({ error: 'ValidationError', message: fixedForValidation.error });
    }

    const result = await db.transaction(async (txDb) => {
      // 1. Mark existing hearing as adjourned. It keeps its original fixedFor!
      const adjournedHearing = await txDb.updateHearing(existing.id, firmId, {
        status: 'adjourned',
        outcomeNote: outcomeNote || 'Adjourned',
        updatedBy: req.user!.id,
      });

      // 2. Insert next hearing with nextFixedFor and nextFixedForNote
      const nextHearing = await txDb.insertHearing({
        id: crypto.randomUUID(),
        firmId,
        caseId: existing.caseId,
        appearingLawyerId: existing.appearingLawyerId,
        scheduledAt: new Date(nextDate),
        court: existing.court,
        purpose: nextPurpose || existing.purpose,
        status: 'scheduled',
        outcomeNote: null,
        fixedFor: nextFixedFor,
        fixedForNote: nextFixedForNote || null,
        createdBy: req.user!.id,
        updatedBy: req.user!.id,
      });

      // 3. Record history linking the adjournment
      const history = await txDb.insertHearingDateHistory({
        id: crypto.randomUUID(),
        firmId,
        hearingId: existing.id,
        caseId: existing.caseId,
        oldAt: existing.scheduledAt,
        newAt: new Date(nextDate),
        reason: reason.trim(),
        oldFixedFor: existing.fixedFor ?? null,
        newFixedFor: nextFixedFor,
        changedBy: req.user!.id,
      });

      // 4. Update case next_hearing_at
      await syncCaseNextHearing(txDb, firmId, existing.caseId);

      // 5. Record audit
      await recordAudit({
        firmId,
        userId: req.user!.id,
        userName: req.user!.name,
        entity: 'Hearing',
        entityId: existing.id,
        action: 'HEARING_DATE_CHANGE',
        oldValue: {
          scheduledAt: existing.scheduledAt,
          status: 'scheduled',
          fixedFor: existing.fixedFor,
        },
        newValue: {
          scheduledAt: nextDate,
          status: 'adjourned',
          reason: reason.trim(),
          nextFixedFor,
          outcomeNote,
        },
      });

      return { adjournedHearing, nextHearing, history };
    });

    res.json(result);
  }
);

// GET /api/v1/hearings/:id/history - Get hearing date history
hearingsRouter.get(
  '/:id/history',
  requirePermission('cases.view'),
  async (req: AuthenticatedRequest, res: Response) => {
    const db = getDatabase();
    const firmId = req.user!.firmId;
    const existing = await db.getHearingById(req.params.id, firmId, req.user);
    if (!existing) {
      return res.status(404).json({ error: 'NotFound', message: 'Hearing not found' });
    }

    const history = await db.listHearingDateHistory(existing.id, firmId);
    res.json(history);
  }
);

// DELETE /api/v1/hearings/:id - Soft delete hearing
hearingsRouter.delete(
  '/:id',
  requirePermission('hearings.update'),
  enforceSubscriptionReadOnly,
  async (req: AuthenticatedRequest, res: Response) => {
    const db = getDatabase();
    const firmId = req.user!.firmId;
    const existing = await db.getHearingById(req.params.id, firmId, req.user);
    if (!existing) {
      return res.status(404).json({ error: 'NotFound', message: 'Hearing not found' });
    }

    await db.transaction(async (txDb) => {
      await txDb.deleteHearing(existing.id, firmId, req.user!.id);
      await syncCaseNextHearing(txDb, firmId, existing.caseId);
      await recordAudit({
        firmId,
        userId: req.user!.id,
        userName: req.user!.name,
        entity: 'Hearing',
        entityId: existing.id,
        action: 'DELETE',
        oldValue: existing as unknown as Record<string, unknown>,
        newValue: null,
      });
    });

    res.json({ success: true, softDeleted: true });
  }
);
