import crypto from 'crypto';
import { Router, Response } from 'express';
import { z } from 'zod';
import { authMiddleware, AuthenticatedRequest } from '../middleware/auth.js';
import { requirePermission } from '../middleware/permission.js';
import { enforceFirmIsolation } from '../middleware/firmIsolation.js';
import { enforceSubscriptionReadOnly } from '../middleware/subscription.js';
import { getDatabase, IDatabase } from '../db/client.js';
import * as schema from '../db/schema.js';

export const physicalFilesRouter = Router();

physicalFilesRouter.use(authMiddleware);
physicalFilesRouter.use(enforceFirmIsolation);

function canAccessRestricted(req: AuthenticatedRequest): boolean {
  if (!req.user) return false;
  if (req.user.role === 'Owner') return true;
  return Boolean(req.user.permissions?.includes('restricted.view'));
}

async function insertAuditTx(
  txDb: IDatabase,
  params: {
    firmId: string;
    userId: string;
    userName: string;
    entityId: string;
    action: string;
    oldValue?: Record<string, unknown> | null;
    newValue?: Record<string, unknown> | null;
  }
) {
  const now = new Date();
  await txDb.insertAudit({
    id: crypto.randomUUID(),
    firmId: params.firmId,
    userId: params.userId,
    userName: params.userName,
    entity: 'PhysicalFile',
    entityId: params.entityId,
    action: params.action,
    oldValue: params.oldValue || null,
    newValue: params.newValue || null,
    timestamp: now,
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
    createdBy: params.userId,
    updatedBy: params.userId,
  });
}

async function upsertFileReturnReminderTx(
  txDb: IDatabase,
  params: {
    firmId: string;
    fileId: string;
    serial: string;
    title: string;
    shelfLocation?: string | null;
    holderId: string;
    holderName: string;
    dueDate: Date;
    actorId: string;
  }
) {
  const remindAt = new Date(params.dueDate.getTime() - 4 * 60 * 60 * 1000);
  const rescheduled = await txDb.rescheduleRemindersBySource(
    params.firmId,
    params.fileId,
    params.dueDate,
    remindAt,
    params.actorId
  );
  if (rescheduled === 0) {
    await txDb.insertReminder({
      id: crypto.randomUUID(),
      firmId: params.firmId,
      userId: params.holderId,
      sourceType: 'file_return',
      sourceId: params.fileId,
      title: `File Return Due: ${params.serial} (${params.title})`,
      description: `Location: ${params.shelfLocation || 'Chamber Rack'}. Current holder: ${params.holderName}`,
      remindAt,
      dueAt: params.dueDate,
      channel: 'in_app',
      status: 'pending',
      createdBy: params.actorId,
      updatedBy: params.actorId,
    });
  } else {
    const rems = await txDb.listRemindersBySourceIds(params.firmId, [params.fileId]);
    for (const r of rems) {
      if (r.sourceType === 'file_return' && r.userId !== params.holderId) {
        await txDb.updateReminder(r.id, params.firmId, {
          userId: params.holderId,
          updatedBy: params.actorId,
        });
      }
    }
  }
}

async function checkFileAccess(
  db: IDatabase,
  req: AuthenticatedRequest,
  file: (schema.PhysicalFile & { currentHolderName?: string | null }) | null
): Promise<
  | { ok: true; file: schema.PhysicalFile & { currentHolderName?: string | null } }
  | { ok: false; status: 403 | 404; error: string; message: string }
> {
  const firmId = req.user!.firmId;
  if (!file || file.firmId !== firmId) {
    return { ok: false, status: 404, error: 'NotFound', message: 'Physical file not found' };
  }

  if (file.caseId) {
    const caseRec = await db.getCaseById(file.caseId, firmId, req.user);
    if (!caseRec || caseRec.firmId !== firmId) {
      return { ok: false, status: 404, error: 'NotFound', message: 'Physical file not found' };
    }
    if (caseRec.restricted && !canAccessRestricted(req)) {
      return {
        ok: false,
        status: 403,
        error: 'PermissionDenied',
        message: 'Permission denied: restricted case physical file',
      };
    }
  }

  return { ok: true, file };
}

const createPhysicalFileSchema = z.object({
  title: z.string().trim().min(1, 'Title is required').max(300, 'Title too long'),
  serial: z.string().trim().min(1).max(60).optional(),
  caseId: z.string().trim().optional().nullable(),
  clientId: z.string().trim().optional().nullable(),
  shelfLocation: z.string().trim().max(200).optional().nullable(),
  notes: z.string().trim().max(2000).optional().nullable(),
});

const updatePhysicalFileSchema = z.object({
  title: z.string().trim().min(1).max(300).optional(),
  caseId: z.string().trim().optional().nullable(),
  clientId: z.string().trim().optional().nullable(),
  shelfLocation: z.string().trim().max(200).optional().nullable(),
  status: z.enum(['in_chamber', 'checked_out', 'in_court', 'archived']).optional(),
  currentHolderId: z.string().trim().optional().nullable(),
  checkedOutAt: z
    .string()
    .refine((v) => !isNaN(Date.parse(v)), { message: 'Invalid checkedOutAt ISO string' })
    .optional()
    .nullable(),
  dueBackAt: z
    .string()
    .refine((v) => !isNaN(Date.parse(v)), { message: 'Invalid dueBackAt ISO string' })
    .optional()
    .nullable(),
  notes: z.string().trim().max(2000).optional().nullable(),
});

const checkOutSchema = z.object({
  holderId: z.string().trim().min(1, 'holderId is required'),
  dueBackAt: z.string().refine((v) => !isNaN(Date.parse(v)), { message: 'Invalid dueBackAt ISO string' }),
  note: z.string().trim().max(1000).optional().nullable(),
});

const checkInSchema = z.object({
  shelfLocation: z.string().trim().max(200).optional().nullable(),
  note: z.string().trim().max(1000).optional().nullable(),
});

const dispatchCourtSchema = z.object({
  courtName: z.string().trim().min(1, 'courtName is required').max(300),
  holderId: z.string().trim().min(1, 'holderId is required'),
  dueBackAt: z.string().refine((v) => !isNaN(Date.parse(v)), { message: 'Invalid dueBackAt ISO string' }),
  note: z.string().trim().max(1000).optional().nullable(),
});

// GET /api/v1/physical-files - List firm physical files with filters & case visibility
physicalFilesRouter.get(
  '/',
  requirePermission('files.view'),
  async (req: AuthenticatedRequest, res: Response) => {
    const db = getDatabase();
    const { caseId, clientId, status, holderId, search } = req.query;

    const files = await db.listPhysicalFiles(
      req.user!.firmId,
      {
        caseId: caseId as string | undefined,
        clientId: clientId as string | undefined,
        status: status as string | undefined,
        holderId: holderId as string | undefined,
        search: search as string | undefined,
      },
      req.user
    );

    res.json(files);
  }
);

// GET /api/v1/physical-files/next-serial - Sequential serial preview (F-000101...)
physicalFilesRouter.get(
  '/next-serial',
  requirePermission('files.view'),
  async (req: AuthenticatedRequest, res: Response) => {
    const db = getDatabase();
    const serial = await db.getNextPhysicalFileSerial(req.user!.firmId);
    res.json({ serial });
  }
);

// GET /api/v1/physical-files/by-serial/:serial - Lookup physical file by serial
physicalFilesRouter.get(
  '/by-serial/:serial',
  requirePermission('files.view'),
  async (req: AuthenticatedRequest, res: Response) => {
    const db = getDatabase();
    const raw = await db.getPhysicalFileBySerial(req.params.serial, req.user!.firmId);
    const access = await checkFileAccess(db, req, raw);
    if (!access.ok) {
      return res.status(access.status).json({ error: access.error, message: access.message });
    }
    res.json(access.file);
  }
);

// GET /api/v1/physical-files/by-case/:caseId - Lookup physical file by case
physicalFilesRouter.get(
  '/by-case/:caseId',
  requirePermission('files.view'),
  async (req: AuthenticatedRequest, res: Response) => {
    const db = getDatabase();
    const firmId = req.user!.firmId;
    const caseRec = await db.getCaseById(req.params.caseId, firmId, req.user);
    if (!caseRec || caseRec.firmId !== firmId) {
      return res.status(404).json({ error: 'NotFound', message: 'Case not found' });
    }
    if (caseRec.restricted && !canAccessRestricted(req)) {
      return res.status(403).json({
        error: 'PermissionDenied',
        message: 'Permission denied: restricted case',
      });
    }

    const file = await db.getPhysicalFileByCaseId(req.params.caseId, firmId);
    if (!file) {
      return res.status(404).json({ error: 'NotFound', message: 'Physical file not found for case' });
    }
    res.json(file);
  }
);

// GET /api/v1/physical-files/:id - Get single physical file
physicalFilesRouter.get(
  '/:id',
  requirePermission('files.view'),
  async (req: AuthenticatedRequest, res: Response) => {
    const db = getDatabase();
    const raw = await db.getPhysicalFileById(req.params.id, req.user!.firmId);
    const access = await checkFileAccess(db, req, raw);
    if (!access.ok) {
      return res.status(access.status).json({ error: access.error, message: access.message });
    }
    res.json(access.file);
  }
);

// GET /api/v1/physical-files/:id/movements - Custody history timeline
physicalFilesRouter.get(
  '/:id/movements',
  requirePermission('files.view'),
  async (req: AuthenticatedRequest, res: Response) => {
    const db = getDatabase();
    const raw = await db.getPhysicalFileById(req.params.id, req.user!.firmId);
    const access = await checkFileAccess(db, req, raw);
    if (!access.ok) {
      return res.status(access.status).json({ error: access.error, message: access.message });
    }
    const movements = await db.listFileMovements(access.file.id, req.user!.firmId);
    res.json(movements);
  }
);

// POST /api/v1/physical-files - Create physical file
physicalFilesRouter.post(
  '/',
  requirePermission('files.manage'),
  enforceSubscriptionReadOnly,
  async (req: AuthenticatedRequest, res: Response) => {
    const parsed = createPhysicalFileSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'ValidationError', details: parsed.error.issues });
    }

    const db = getDatabase();
    const firmId = req.user!.firmId;
    const cleanCaseId = parsed.data.caseId || null;
    let cleanClientId = parsed.data.clientId || null;

    if (cleanCaseId) {
      const caseRec = await db.getCaseById(cleanCaseId, firmId, req.user);
      if (!caseRec || caseRec.firmId !== firmId) {
        return res.status(404).json({ error: 'NotFound', message: 'Linked case not found or access denied' });
      }
      if (caseRec.restricted && !canAccessRestricted(req)) {
        return res.status(403).json({
          error: 'PermissionDenied',
          message: 'Permission denied: cannot link physical file to restricted case',
        });
      }
      if (!cleanClientId) {
        cleanClientId = caseRec.clientId;
      }
    }

    if (cleanClientId) {
      const clientRec = await db.getClientById(cleanClientId, firmId, req.user);
      if (!clientRec || clientRec.firmId !== firmId) {
        return res.status(404).json({ error: 'NotFound', message: 'Linked client not found or access denied' });
      }
    }

    try {
      const created = await db.transaction(async (txDb) => {
        const serial = parsed.data.serial?.trim() || (await txDb.getNextPhysicalFileSerial(firmId));
        const inserted = await txDb.insertPhysicalFile({
          id: crypto.randomUUID(),
          firmId,
          serial,
          caseId: cleanCaseId,
          clientId: cleanClientId,
          title: parsed.data.title,
          shelfLocation: parsed.data.shelfLocation?.trim() || 'General File Rack',
          status: 'in_chamber',
          currentHolderId: null,
          checkedOutAt: null,
          dueBackAt: null,
          notes: parsed.data.notes || null,
          createdBy: req.user!.id,
          updatedBy: req.user!.id,
        });

        await insertAuditTx(txDb, {
          firmId,
          userId: req.user!.id,
          userName: req.user!.name,
          entityId: inserted.id,
          action: 'CREATE',
          newValue: inserted as unknown as Record<string, unknown>,
        });

        return inserted;
      });

      return res.status(201).json(created);
    } catch (err: any) {
      if (
        err?.code === '23505' ||
        String(err?.message || '').includes('DUPLICATE_SERIAL') ||
        String(err?.message || '').includes('uidx_physical_files_firm_serial')
      ) {
        return res.status(409).json({
          error: 'Conflict',
          message: 'Physical file serial already exists in this firm',
        });
      }
      throw err;
    }
  }
);

// PATCH /api/v1/physical-files/:id - Update physical file metadata
physicalFilesRouter.patch(
  '/:id',
  requirePermission('files.manage'),
  enforceSubscriptionReadOnly,
  async (req: AuthenticatedRequest, res: Response) => {
    const parsed = updatePhysicalFileSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'ValidationError', details: parsed.error.issues });
    }

    const db = getDatabase();
    const firmId = req.user!.firmId;
    const raw = await db.getPhysicalFileById(req.params.id, firmId);
    const access = await checkFileAccess(db, req, raw);
    if (!access.ok) {
      return res.status(access.status).json({ error: access.error, message: access.message });
    }
    const existing = access.file;

    if (parsed.data.caseId !== undefined && parsed.data.caseId !== null && parsed.data.caseId !== existing.caseId) {
      const caseRec = await db.getCaseById(parsed.data.caseId, firmId, req.user);
      if (!caseRec || caseRec.firmId !== firmId) {
        return res.status(404).json({ error: 'NotFound', message: 'Linked case not found or access denied' });
      }
      if (caseRec.restricted && !canAccessRestricted(req)) {
        return res.status(403).json({
          error: 'PermissionDenied',
          message: 'Permission denied: cannot link to restricted case',
        });
      }
    }

    if (parsed.data.clientId !== undefined && parsed.data.clientId !== null && parsed.data.clientId !== existing.clientId) {
      const clientRec = await db.getClientById(parsed.data.clientId, firmId, req.user);
      if (!clientRec || clientRec.firmId !== firmId) {
        return res.status(404).json({ error: 'NotFound', message: 'Linked client not found or access denied' });
      }
    }

    if (parsed.data.currentHolderId) {
      const holder = await db.getUserById(parsed.data.currentHolderId);
      if (!holder || holder.firmId !== firmId || !holder.active) {
        return res.status(400).json({ error: 'ValidationError', message: 'Holder user not found or inactive in this firm' });
      }
    }

    const updates: Partial<schema.PhysicalFile> = {
      updatedBy: req.user!.id,
    };
    if (parsed.data.title !== undefined) updates.title = parsed.data.title;
    if (parsed.data.caseId !== undefined) updates.caseId = parsed.data.caseId || null;
    if (parsed.data.clientId !== undefined) updates.clientId = parsed.data.clientId || null;
    if (parsed.data.shelfLocation !== undefined) updates.shelfLocation = parsed.data.shelfLocation || null;
    if (parsed.data.status !== undefined) updates.status = parsed.data.status;
    if (parsed.data.currentHolderId !== undefined) updates.currentHolderId = parsed.data.currentHolderId || null;
    if (parsed.data.checkedOutAt !== undefined) {
      updates.checkedOutAt = parsed.data.checkedOutAt ? new Date(parsed.data.checkedOutAt) : null;
    }
    if (parsed.data.dueBackAt !== undefined) {
      updates.dueBackAt = parsed.data.dueBackAt ? new Date(parsed.data.dueBackAt) : null;
    }
    if (parsed.data.notes !== undefined) updates.notes = parsed.data.notes || null;

    const updated = await db.transaction(async (txDb) => {
      const resFile = await txDb.updatePhysicalFile(existing.id, firmId, updates);
      if (parsed.data.status === 'archived' || parsed.data.status === 'in_chamber') {
        await txDb.dismissRemindersBySource(firmId, existing.id, req.user!.id);
      }

      if (parsed.data.status === 'archived' && existing.status !== 'archived') {
        await txDb.insertFileMovement({
          id: crypto.randomUUID(),
          firmId,
          fileId: existing.id,
          action: 'ARCHIVE',
          userId: req.user!.id,
          at: new Date(),
          dueBackAt: null,
          note: `Archived by ${req.user!.name}`,
        });
      }

      await insertAuditTx(txDb, {
        firmId,
        userId: req.user!.id,
        userName: req.user!.name,
        entityId: existing.id,
        action: 'UPDATE',
        oldValue: existing as unknown as Record<string, unknown>,
        newValue: resFile as unknown as Record<string, unknown>,
      });

      return resFile;
    });

    res.json(updated);
  }
);

// POST /api/v1/physical-files/:id/check-out - Check out physical file to advocate/staff
physicalFilesRouter.post(
  '/:id/check-out',
  requirePermission('files.manage'),
  enforceSubscriptionReadOnly,
  async (req: AuthenticatedRequest, res: Response) => {
    const parsed = checkOutSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'ValidationError', details: parsed.error.issues });
    }

    const db = getDatabase();
    const firmId = req.user!.firmId;
    const raw = await db.getPhysicalFileById(req.params.id, firmId);
    const access = await checkFileAccess(db, req, raw);
    if (!access.ok) {
      return res.status(access.status).json({ error: access.error, message: access.message });
    }
    const existing = access.file;

    if (existing.status === 'archived') {
      return res.status(400).json({ error: 'InvalidState', message: 'Cannot check out an archived physical file' });
    }

    const holder = await db.getUserById(parsed.data.holderId);
    if (!holder || holder.firmId !== firmId || !holder.active) {
      return res.status(400).json({ error: 'ValidationError', message: 'Recipient holder must be an active member of this firm' });
    }

    const now = new Date();
    const dueDate = new Date(parsed.data.dueBackAt);

    const result = await db.transaction(async (txDb) => {
      const updatedFile = await txDb.updatePhysicalFile(existing.id, firmId, {
        status: 'checked_out',
        currentHolderId: holder.id,
        checkedOutAt: now,
        dueBackAt: dueDate,
        updatedBy: req.user!.id,
      });

      const movement = await txDb.insertFileMovement({
        id: crypto.randomUUID(),
        firmId,
        fileId: existing.id,
        action: 'CHECKOUT',
        userId: holder.id,
        at: now,
        dueBackAt: dueDate,
        note: parsed.data.note?.trim() || `Checked out by ${req.user!.name}`,
      });

      await upsertFileReturnReminderTx(txDb, {
        firmId,
        fileId: existing.id,
        serial: updatedFile.serial,
        title: updatedFile.title,
        shelfLocation: updatedFile.shelfLocation,
        holderId: holder.id,
        holderName: holder.name,
        dueDate,
        actorId: req.user!.id,
      });

      await insertAuditTx(txDb, {
        firmId,
        userId: req.user!.id,
        userName: req.user!.name,
        entityId: existing.id,
        action: 'PHYSICAL_FILE_CHECKED_OUT',
        oldValue: {
          status: existing.status,
          currentHolderId: existing.currentHolderId,
        },
        newValue: {
          status: updatedFile.status,
          currentHolderId: holder.id,
          currentHolderName: holder.name,
          dueBackAt: dueDate.toISOString(),
          note: movement.note,
        },
      });

      return { file: updatedFile, movement };
    });

    res.json(result);
  }
);

// POST /api/v1/physical-files/:id/check-in - Return physical file to chamber rack
physicalFilesRouter.post(
  '/:id/check-in',
  requirePermission('files.manage'),
  enforceSubscriptionReadOnly,
  async (req: AuthenticatedRequest, res: Response) => {
    const parsed = checkInSchema.safeParse(req.body || {});
    if (!parsed.success) {
      return res.status(400).json({ error: 'ValidationError', details: parsed.error.issues });
    }

    const db = getDatabase();
    const firmId = req.user!.firmId;
    const raw = await db.getPhysicalFileById(req.params.id, firmId);
    const access = await checkFileAccess(db, req, raw);
    if (!access.ok) {
      return res.status(access.status).json({ error: access.error, message: access.message });
    }
    const existing = access.file;

    if (existing.status === 'archived') {
      return res.status(400).json({ error: 'InvalidState', message: 'Cannot check in an archived physical file' });
    }

    const now = new Date();
    const nextShelf = parsed.data.shelfLocation?.trim() || existing.shelfLocation || 'General File Rack';

    const result = await db.transaction(async (txDb) => {
      const updatedFile = await txDb.updatePhysicalFile(existing.id, firmId, {
        status: 'in_chamber',
        currentHolderId: null,
        checkedOutAt: null,
        dueBackAt: null,
        shelfLocation: nextShelf,
        updatedBy: req.user!.id,
      });

      const movement = await txDb.insertFileMovement({
        id: crypto.randomUUID(),
        firmId,
        fileId: existing.id,
        action: 'CHECKIN',
        userId: req.user!.id,
        at: now,
        dueBackAt: null,
        note: parsed.data.note?.trim() || `Returned to ${nextShelf}`,
      });

      await txDb.dismissRemindersBySource(firmId, existing.id, req.user!.id);

      await insertAuditTx(txDb, {
        firmId,
        userId: req.user!.id,
        userName: req.user!.name,
        entityId: existing.id,
        action: 'PHYSICAL_FILE_CHECKED_IN',
        oldValue: {
          status: existing.status,
          currentHolderId: existing.currentHolderId,
        },
        newValue: {
          status: updatedFile.status,
          shelfLocation: nextShelf,
          note: movement.note,
        },
      });

      return { file: updatedFile, movement };
    });

    res.json(result);
  }
);

// POST /api/v1/physical-files/:id/dispatch-court - Dispatch physical file to court
physicalFilesRouter.post(
  '/:id/dispatch-court',
  requirePermission('files.manage'),
  enforceSubscriptionReadOnly,
  async (req: AuthenticatedRequest, res: Response) => {
    const parsed = dispatchCourtSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'ValidationError', details: parsed.error.issues });
    }

    const db = getDatabase();
    const firmId = req.user!.firmId;
    const raw = await db.getPhysicalFileById(req.params.id, firmId);
    const access = await checkFileAccess(db, req, raw);
    if (!access.ok) {
      return res.status(access.status).json({ error: access.error, message: access.message });
    }
    const existing = access.file;

    if (existing.status === 'archived') {
      return res.status(400).json({ error: 'InvalidState', message: 'Cannot dispatch an archived physical file' });
    }

    const holder = await db.getUserById(parsed.data.holderId);
    if (!holder || holder.firmId !== firmId || !holder.active) {
      return res.status(400).json({ error: 'ValidationError', message: 'Taking custodian must be an active member of this firm' });
    }

    const now = new Date();
    const dueDate = new Date(parsed.data.dueBackAt);
    const movementNote = parsed.data.note?.trim()
      ? `[Court: ${parsed.data.courtName}] ${parsed.data.note.trim()}`
      : `Dispatched to ${parsed.data.courtName}`;

    const result = await db.transaction(async (txDb) => {
      const updatedFile = await txDb.updatePhysicalFile(existing.id, firmId, {
        status: 'in_court',
        currentHolderId: holder.id,
        checkedOutAt: now,
        dueBackAt: dueDate,
        updatedBy: req.user!.id,
      });

      const movement = await txDb.insertFileMovement({
        id: crypto.randomUUID(),
        firmId,
        fileId: existing.id,
        action: 'COURT_DISPATCH',
        userId: holder.id,
        at: now,
        dueBackAt: dueDate,
        note: movementNote,
      });

      await upsertFileReturnReminderTx(txDb, {
        firmId,
        fileId: existing.id,
        serial: updatedFile.serial,
        title: updatedFile.title,
        shelfLocation: updatedFile.shelfLocation,
        holderId: holder.id,
        holderName: holder.name,
        dueDate,
        actorId: req.user!.id,
      });

      await insertAuditTx(txDb, {
        firmId,
        userId: req.user!.id,
        userName: req.user!.name,
        entityId: existing.id,
        action: 'PHYSICAL_FILE_COURT_DISPATCH',
        oldValue: {
          status: existing.status,
          currentHolderId: existing.currentHolderId,
        },
        newValue: {
          status: updatedFile.status,
          courtName: parsed.data.courtName,
          currentHolderId: holder.id,
          currentHolderName: holder.name,
          dueBackAt: dueDate.toISOString(),
          note: movementNote,
        },
      });

      return { file: updatedFile, movement };
    });

    res.json(result);
  }
);

// DELETE /api/v1/physical-files/:id - Soft delete physical file
physicalFilesRouter.delete(
  '/:id',
  requirePermission('files.manage'),
  enforceSubscriptionReadOnly,
  async (req: AuthenticatedRequest, res: Response) => {
    const db = getDatabase();
    const firmId = req.user!.firmId;
    const raw = await db.getPhysicalFileById(req.params.id, firmId);
    const access = await checkFileAccess(db, req, raw);
    if (!access.ok) {
      return res.status(access.status).json({ error: access.error, message: access.message });
    }
    const existing = access.file;

    await db.transaction(async (txDb) => {
      await txDb.deletePhysicalFile(existing.id, firmId, req.user!.id);
      await txDb.dismissRemindersBySource(firmId, existing.id, req.user!.id, true);
      await insertAuditTx(txDb, {
        firmId,
        userId: req.user!.id,
        userName: req.user!.name,
        entityId: existing.id,
        action: 'DELETE',
        oldValue: existing as unknown as Record<string, unknown>,
        newValue: { deletedAt: new Date().toISOString(), softDeleted: true },
      });
    });

    res.json({ success: true, softDeleted: true });
  }
);
