import { Router, Response } from 'express';
import crypto from 'crypto';
import { authMiddleware, AuthenticatedRequest } from '../middleware/auth.js';
import { requirePermission } from '../middleware/permission.js';
import { enforceFirmIsolation } from '../middleware/firmIsolation.js';
import { enforceSubscriptionReadOnly } from '../middleware/subscription.js';
import { getDatabase } from '../db/client.js';
import { recordAudit } from '../services/auditService.js';

export const appointmentsRouter = Router();

appointmentsRouter.use(authMiddleware);
appointmentsRouter.use(enforceFirmIsolation);

const VALID_TYPES = [
  'client_meeting',
  'consultation',
  'phone_call',
  'internal_meeting',
  'court_visit',
  'other',
] as const;

const VALID_MODES = ['in_person', 'phone', 'video'] as const;

// GET /api/v1/appointments - List & filter appointments
appointmentsRouter.get(
  '/',
  requirePermission('appointments.view'),
  async (req: AuthenticatedRequest, res: Response) => {
    const db = getDatabase();
    const { from, to, status, clientId, caseId, mine, limit, offset } = req.query;

    const data = await db.listAppointments(req.user!.firmId, {
      from: from as string | undefined,
      to: to as string | undefined,
      status: status as string | undefined,
      clientId: clientId as string | undefined,
      caseId: caseId as string | undefined,
      mine: mine === 'true',
      user: req.user,
      limit: Math.min(100, Math.max(1, parseInt(limit as string) || 50)),
      offset: Math.max(0, parseInt(offset as string) || 0),
    });

    res.json(data);
  }
);

// GET /api/v1/appointments/:id - Get single appointment
appointmentsRouter.get(
  '/:id',
  requirePermission('appointments.view'),
  async (req: AuthenticatedRequest, res: Response) => {
    const db = getDatabase();
    const appt = await db.getAppointmentById(req.params.id, req.user!.firmId, req.user);

    if (!appt || appt.firmId !== req.user!.firmId) {
      return res.status(404).json({ error: 'Appointment not found' });
    }

    res.json(appt);
  }
);

// POST /api/v1/appointments - Create new appointment
appointmentsRouter.post(
  '/',
  requirePermission('appointments.manage'),
  enforceSubscriptionReadOnly,
  async (req: AuthenticatedRequest, res: Response) => {
    const db = getDatabase();
    const {
      title,
      type,
      startsAt,
      endsAt,
      mode = 'in_person',
      location,
      organiserUserId,
      clientId,
      caseId,
      status = 'scheduled',
      notes,
      reminderMinutesBefore = 30,
      attendeeUserIds = [],
    } = req.body;

    if (!title || !title.trim()) {
      return res.status(400).json({ error: 'Title is required' });
    }
    if (!type || !VALID_TYPES.includes(type)) {
      return res.status(400).json({ error: `Valid type is required: ${VALID_TYPES.join(', ')}` });
    }
    if (!startsAt || isNaN(new Date(startsAt).getTime())) {
      return res.status(400).json({ error: 'Valid startsAt timestamp is required' });
    }
    if (!endsAt || isNaN(new Date(endsAt).getTime())) {
      return res.status(400).json({ error: 'Valid endsAt timestamp is required' });
    }
    if (new Date(endsAt).getTime() <= new Date(startsAt).getTime()) {
      return res.status(400).json({ error: 'endsAt must be after startsAt' });
    }
    if (mode && !VALID_MODES.includes(mode)) {
      return res.status(400).json({ error: `Valid mode is required: ${VALID_MODES.join(', ')}` });
    }

    const resolvedOrganiserId = organiserUserId ? String(organiserUserId).trim() : req.user!.id;

    // Check overlap for organiser
    const hasOverlap = await db.checkAppointmentOverlap(
      req.user!.firmId,
      resolvedOrganiserId,
      new Date(startsAt),
      new Date(endsAt)
    );

    const now = new Date();
    const id = crypto.randomUUID();

    const created = await db.insertAppointment(
      {
        id,
        firmId: req.user!.firmId,
        title: title.trim(),
        type,
        startsAt: new Date(startsAt),
        endsAt: new Date(endsAt),
        mode,
        location: location?.trim() || null,
        organiserUserId: resolvedOrganiserId,
        clientId: clientId || null,
        caseId: caseId || null,
        status,
        notes: notes?.trim() || null,
        reminderMinutesBefore: Number(reminderMinutesBefore) || 30,
        createdAt: now,
        updatedAt: now,
        deletedAt: null,
        createdBy: req.user!.id,
        updatedBy: req.user!.id,
      },
      Array.isArray(attendeeUserIds) ? attendeeUserIds : []
    );

    await recordAudit({
      firmId: req.user!.firmId,
      userId: req.user!.id,
      userName: req.user!.name,
      entity: 'Appointment',
      entityId: created.id,
      action: 'CREATE',
      oldValue: null,
      newValue: {
        title: created.title,
        type: created.type,
        startsAt: created.startsAt,
        endsAt: created.endsAt,
        organiserUserId: created.organiserUserId,
      },
    });

    res.status(201).json({
      ...created,
      hasOverlap,
      warning: hasOverlap ? 'Another appointment overlaps with this time' : undefined,
    });
  }
);

// PATCH /api/v1/appointments/:id - Update appointment
appointmentsRouter.patch(
  '/:id',
  requirePermission('appointments.manage'),
  enforceSubscriptionReadOnly,
  async (req: AuthenticatedRequest, res: Response) => {
    const db = getDatabase();
    const existing = await db.getAppointmentById(req.params.id, req.user!.firmId, req.user);

    if (!existing || existing.firmId !== req.user!.firmId) {
      return res.status(404).json({ error: 'Appointment not found' });
    }

    const {
      title,
      type,
      startsAt,
      endsAt,
      mode,
      location,
      organiserUserId,
      clientId,
      caseId,
      status,
      notes,
      reminderMinutesBefore,
      attendeeUserIds,
    } = req.body;

    const updates: any = {};
    if (title !== undefined) updates.title = title.trim();
    if (type !== undefined) {
      if (!VALID_TYPES.includes(type)) return res.status(400).json({ error: 'Invalid type' });
      updates.type = type;
    }
    if (mode !== undefined) {
      if (!VALID_MODES.includes(mode)) return res.status(400).json({ error: 'Invalid mode' });
      updates.mode = mode;
    }
    if (location !== undefined) updates.location = location ? location.trim() : null;
    if (organiserUserId !== undefined) updates.organiserUserId = organiserUserId;
    if (clientId !== undefined) updates.clientId = clientId || null;
    if (caseId !== undefined) updates.caseId = caseId || null;
    if (status !== undefined) updates.status = status;
    if (notes !== undefined) updates.notes = notes ? notes.trim() : null;
    if (reminderMinutesBefore !== undefined) updates.reminderMinutesBefore = Number(reminderMinutesBefore);

    let isReschedule = false;
    const targetStartsAt = startsAt ? new Date(startsAt) : existing.startsAt;
    const targetEndsAt = endsAt ? new Date(endsAt) : existing.endsAt;

    if (startsAt !== undefined || endsAt !== undefined) {
      if (new Date(targetEndsAt).getTime() <= new Date(targetStartsAt).getTime()) {
        return res.status(400).json({ error: 'endsAt must be after startsAt' });
      }
      updates.startsAt = new Date(targetStartsAt);
      updates.endsAt = new Date(targetEndsAt);
      isReschedule =
        new Date(existing.startsAt).getTime() !== new Date(targetStartsAt).getTime() ||
        new Date(existing.endsAt).getTime() !== new Date(targetEndsAt).getTime();
    }
    updates.updatedBy = req.user!.id;

    // Check overlap if time or organiser changed
    let hasOverlap = false;
    if (isReschedule || organiserUserId !== undefined) {
      hasOverlap = await db.checkAppointmentOverlap(
        req.user!.firmId,
        updates.organiserUserId || existing.organiserUserId,
        new Date(targetStartsAt),
        new Date(targetEndsAt),
        existing.id
      );
    }

    const updated = await db.updateAppointment(
      existing.id,
      req.user!.firmId,
      updates,
      Array.isArray(attendeeUserIds) ? attendeeUserIds : undefined
    );

    // Audit log (reschedule tracks old/new time)
    await recordAudit({
      firmId: req.user!.firmId,
      userId: req.user!.id,
      userName: req.user!.name,
      entity: 'Appointment',
      entityId: existing.id,
      action: isReschedule ? 'RESCHEDULE' : 'UPDATE',
      oldValue: {
        title: existing.title,
        startsAt: existing.startsAt,
        endsAt: existing.endsAt,
        status: existing.status,
      },
      newValue: {
        title: updated.title,
        startsAt: updated.startsAt,
        endsAt: updated.endsAt,
        status: updated.status,
      },
    });

    res.json({
      ...updated,
      hasOverlap,
      warning: hasOverlap ? 'Another appointment overlaps with this time' : undefined,
    });
  }
);

// DELETE /api/v1/appointments/:id - Soft delete appointment
appointmentsRouter.delete(
  '/:id',
  requirePermission('appointments.manage'),
  enforceSubscriptionReadOnly,
  async (req: AuthenticatedRequest, res: Response) => {
    const db = getDatabase();
    const existing = await db.getAppointmentById(req.params.id, req.user!.firmId, req.user);

    if (!existing || existing.firmId !== req.user!.firmId) {
      return res.status(404).json({ error: 'Appointment not found' });
    }

    await db.deleteAppointment(existing.id, req.user!.firmId, req.user!.id);

    await recordAudit({
      firmId: req.user!.firmId,
      userId: req.user!.id,
      userName: req.user!.name,
      entity: 'Appointment',
      entityId: existing.id,
      action: 'DELETE',
      oldValue: {
        title: existing.title,
        startsAt: existing.startsAt,
        endsAt: existing.endsAt,
      },
      newValue: {
        deletedAt: new Date().toISOString(),
        softDeleted: true,
      },
    });

    res.json({ success: true, softDeleted: true });
  }
);
