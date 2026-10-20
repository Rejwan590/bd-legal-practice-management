import express, { Router, Response } from 'express';
import crypto from 'crypto';
import { authMiddleware, AuthenticatedRequest } from '../middleware/auth.js';
import { requirePermission } from '../middleware/permission.js';
import { enforceFirmIsolation } from '../middleware/firmIsolation.js';
import { enforceSubscriptionReadOnly } from '../middleware/subscription.js';
import { getDatabase } from '../db/client.js';
import * as schema from '../db/schema.js';
import { recordAudit } from '../services/auditService.js';

export const clientsRouter = Router();

clientsRouter.use(authMiddleware);
clientsRouter.use(enforceFirmIsolation);

// Raw body parser for photo upload
clientsRouter.use('/:id/photo', (req, res, next) => {
  if (req.method === 'PUT') {
    express.raw({ type: ['image/*', 'application/octet-stream'], limit: '350kb' })(req, res, (err) => {
      if (err) {
        return res.status(400).json({ error: 'Payload too large', message: 'Photo exceeds 300 KB limit' });
      }
      next();
    });
  } else {
    next();
  }
});

// GET /api/v1/clients - List & search clients
clientsRouter.get(
  '/',
  requirePermission('clients.view'),
  async (req: AuthenticatedRequest, res: Response) => {
    const db = getDatabase();
    const search = req.query.search as string | undefined;
    const clientList = await db.listClients(req.user!.firmId, search, req.user);

    res.json(clientList);
  }
);

// GET /api/v1/clients/:id - Get client by ID
clientsRouter.get(
  '/:id',
  requirePermission('clients.view'),
  async (req: AuthenticatedRequest, res: Response) => {
    const db = getDatabase();
    const client = await db.getClientById(req.params.id, req.user!.firmId, req.user);

    if (!client || client.firmId !== req.user!.firmId) {
      return res.status(404).json({ error: 'Client not found' });
    }

    res.json(client);
  }
);

// GET /api/v1/clients/:id/overview - Get linked matter overview
clientsRouter.get(
  '/:id/overview',
  requirePermission('clients.view'),
  async (req: AuthenticatedRequest, res: Response) => {
    const db = getDatabase();
    const client = await db.getClientById(req.params.id, req.user!.firmId, req.user);

    if (!client || client.firmId !== req.user!.firmId) {
      return res.status(404).json({ error: 'Client not found' });
    }

    const canSeeRestricted =
      req.user!.role === 'Owner' || (req.user!.permissions && req.user!.permissions.includes('restricted.view'));
    const overview = await db.getClientLinkedOverview(client.id, req.user!.firmId, canSeeRestricted, req.user);
    res.json(overview);
  }
);

// PUT /api/v1/clients/:id/photo - Upload client profile photo
clientsRouter.put(
  '/:id/photo',
  requirePermission('clients.edit'),
  enforceSubscriptionReadOnly,
  async (req: AuthenticatedRequest, res: Response) => {
    const db = getDatabase();
    const client = await db.getClientById(req.params.id, req.user!.firmId, req.user);
    if (!client || client.firmId !== req.user!.firmId) {
      return res.status(404).json({ error: 'Client not found' });
    }

    let buffer: Buffer | null = null;
    if (Buffer.isBuffer(req.body)) {
      buffer = req.body;
    } else if (req.body && typeof req.body === 'object' && req.body.data) {
      const dataStr = String(req.body.data);
      const base64Data = dataStr.includes(',') ? dataStr.split(',')[1] : dataStr;
      buffer = Buffer.from(base64Data, 'base64');
    }

    if (!buffer || buffer.length === 0) {
      return res.status(400).json({ error: 'No image data provided' });
    }

    // Max 300 KB limit after resize
    if (buffer.length > 300 * 1024) {
      return res.status(400).json({ error: 'Photo exceeds 300 KB limit' });
    }

    // Magic signature check
    let mime: string | null = null;
    if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
      mime = 'image/jpeg';
    } else if (
      buffer.length >= 4 &&
      buffer[0] === 0x89 &&
      buffer[1] === 0x50 &&
      buffer[2] === 0x4e &&
      buffer[3] === 0x47
    ) {
      mime = 'image/png';
    } else if (
      buffer.length >= 12 &&
      buffer.subarray(0, 4).toString('ascii') === 'RIFF' &&
      buffer.subarray(8, 12).toString('ascii') === 'WEBP'
    ) {
      mime = 'image/webp';
    }

    if (!mime) {
      return res.status(400).json({
        error: 'Invalid image format',
        message: 'Only JPEG, WebP, and PNG are allowed based on verified file signature',
      });
    }

    const existingPhoto = await db.getClientPhoto(client.id, req.user!.firmId);
    const photo = await db.upsertClientPhoto({
      clientId: client.id,
      firmId: req.user!.firmId,
      mime,
      bytes: buffer.toString('base64'),
      updatedAt: new Date(),
    });

    await recordAudit({
      firmId: req.user!.firmId,
      userId: req.user!.id,
      userName: req.user!.name,
      entity: 'ClientPhoto',
      entityId: client.id,
      action: existingPhoto ? 'UPDATE' : 'CREATE',
      oldValue: null,
      newValue: { mime, size: buffer.length },
    });

    res.json({ success: true, mime, size: buffer.length, updatedAt: photo.updatedAt });
  }
);

// GET /api/v1/clients/:id/photo - Retrieve client photo
clientsRouter.get(
  '/:id/photo',
  requirePermission('clients.view'),
  async (req: AuthenticatedRequest, res: Response) => {
    const db = getDatabase();
    const client = await db.getClientById(req.params.id, req.user!.firmId, req.user);
    if (!client || client.firmId !== req.user!.firmId) {
      return res.status(404).json({ error: 'Client not found' });
    }

    const photo = await db.getClientPhoto(client.id, req.user!.firmId);
    if (!photo) {
      return res.status(404).json({ error: 'Photo not found' });
    }

    res.setHeader('Content-Type', photo.mime);
    res.setHeader('Cache-Control', 'private, max-age=3600');
    res.send(Buffer.from(photo.bytes, 'base64'));
  }
);

// DELETE /api/v1/clients/:id/photo - Delete client photo
clientsRouter.delete(
  '/:id/photo',
  requirePermission('clients.edit'),
  enforceSubscriptionReadOnly,
  async (req: AuthenticatedRequest, res: Response) => {
    const db = getDatabase();
    const client = await db.getClientById(req.params.id, req.user!.firmId, req.user);
    if (!client || client.firmId !== req.user!.firmId) {
      return res.status(404).json({ error: 'Client not found' });
    }

    await db.deleteClientPhoto(client.id, req.user!.firmId);

    await recordAudit({
      firmId: req.user!.firmId,
      userId: req.user!.id,
      userName: req.user!.name,
      entity: 'ClientPhoto',
      entityId: client.id,
      action: 'DELETE',
      oldValue: null,
      newValue: { deleted: true },
    });

    res.json({ success: true });
  }
);

// GET /api/v1/clients/:id/notes - List notes for client
clientsRouter.get(
  '/:id/notes',
  requirePermission('clients.view'),
  async (req: AuthenticatedRequest, res: Response) => {
    const db = getDatabase();
    const client = await db.getClientById(req.params.id, req.user!.firmId, req.user);
    if (!client || client.firmId !== req.user!.firmId) {
      return res.status(404).json({ error: 'Client not found' });
    }
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string) || 50));
    const offset = Math.max(0, parseInt(req.query.offset as string) || 0);
    const notesData = await db.listClientNotes(client.id, req.user!.firmId, limit, offset);
    res.json(notesData);
  }
);

// POST /api/v1/clients/:id/notes - Add note to client
clientsRouter.post(
  '/:id/notes',
  requirePermission('clients.edit'),
  enforceSubscriptionReadOnly,
  async (req: AuthenticatedRequest, res: Response) => {
    const db = getDatabase();
    const client = await db.getClientById(req.params.id, req.user!.firmId, req.user);
    if (!client || client.firmId !== req.user!.firmId) {
      return res.status(404).json({ error: 'Client not found' });
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
    const note = await db.insertClientNote({
      id: crypto.randomUUID(),
      firmId: req.user!.firmId,
      clientId: client.id,
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
      entity: 'ClientNote',
      entityId: note.id,
      action: 'CREATE',
      oldValue: null,
      newValue: {
        clientId: client.id,
        noteDate: note.noteDate,
        bodyLength: note.body.length,
      },
    });

    res.status(201).json(note);
  }
);

// PATCH /api/v1/clients/:id/notes/:noteId - Update client note
clientsRouter.patch(
  '/:id/notes/:noteId',
  requirePermission('clients.edit'),
  enforceSubscriptionReadOnly,
  async (req: AuthenticatedRequest, res: Response) => {
    const db = getDatabase();
    const client = await db.getClientById(req.params.id, req.user!.firmId, req.user);
    if (!client || client.firmId !== req.user!.firmId) {
      return res.status(404).json({ error: 'Client not found' });
    }
    const existing = await db.getClientNoteById(req.params.noteId, client.id, req.user!.firmId);
    if (!existing) {
      return res.status(404).json({ error: 'Note not found' });
    }
    const { noteDate, body } = req.body;
    if (body !== undefined && body.trim().length > 5000) {
      return res.status(400).json({ error: 'Note text cannot exceed 5000 characters' });
    }
    const updates: Partial<schema.ClientNote> = {};
    if (noteDate !== undefined) updates.noteDate = String(noteDate).trim().slice(0, 10);
    if (body !== undefined) updates.body = body.trim();
    updates.updatedBy = req.user!.id;

    const updated = await db.updateClientNote(existing.id, client.id, req.user!.firmId, updates);
    await recordAudit({
      firmId: req.user!.firmId,
      userId: req.user!.id,
      userName: req.user!.name,
      entity: 'ClientNote',
      entityId: updated.id,
      action: 'UPDATE',
      oldValue: { noteDate: existing.noteDate, bodyLength: existing.body.length },
      newValue: { noteDate: updated.noteDate, bodyLength: updated.body.length },
    });
    res.json(updated);
  }
);

// DELETE /api/v1/clients/:id/notes/:noteId - Delete client note
clientsRouter.delete(
  '/:id/notes/:noteId',
  requirePermission('clients.edit'),
  enforceSubscriptionReadOnly,
  async (req: AuthenticatedRequest, res: Response) => {
    const db = getDatabase();
    const client = await db.getClientById(req.params.id, req.user!.firmId, req.user);
    if (!client || client.firmId !== req.user!.firmId) {
      return res.status(404).json({ error: 'Client not found' });
    }
    const existing = await db.getClientNoteById(req.params.noteId, client.id, req.user!.firmId);
    if (!existing) {
      return res.status(404).json({ error: 'Note not found' });
    }
    await db.deleteClientNote(existing.id, client.id, req.user!.firmId, req.user!.id);
    await recordAudit({
      firmId: req.user!.firmId,
      userId: req.user!.id,
      userName: req.user!.name,
      entity: 'ClientNote',
      entityId: existing.id,
      action: 'DELETE',
      oldValue: { noteDate: existing.noteDate, bodyLength: existing.body.length },
      newValue: { softDeleted: true },
    });
    res.json({ success: true, softDeleted: true });
  }
);

// POST /api/v1/clients - Create client
clientsRouter.post(
  '/',
  requirePermission('clients.edit'),
  enforceSubscriptionReadOnly,
  async (req: AuthenticatedRequest, res: Response) => {
    const db = getDatabase();
    const { name, nameBn, phone, email, address, notes } = req.body;

    if (!name || !name.trim()) {
      return res.status(400).json({ error: 'Client name is required' });
    }
    if (!phone || !phone.trim()) {
      return res.status(400).json({ error: 'Phone number is required' });
    }
    if (!address || !address.trim()) {
      return res.status(400).json({ error: 'Address is required' });
    }

    const id = crypto.randomUUID();
    const now = new Date();

    const newClient = await db.insertClient({
      id,
      firmId: req.user!.firmId,
      name: name.trim(),
      nameBn: nameBn?.trim() || null,
      phone: phone.trim(),
      email: email?.trim() || null,
      address: address.trim(),
      notes: notes?.trim() || null,
      archived: false,
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
      createdBy: req.user!.id,
      updatedBy: req.user!.id,
    });

    if (notes && notes.trim()) {
      await db.insertClientNote({
        id: crypto.randomUUID(),
        firmId: req.user!.firmId,
        clientId: newClient.id,
        noteDate: now.toISOString().slice(0, 10),
        body: notes.trim(),
        createdBy: req.user!.id,
        updatedBy: req.user!.id,
        createdAt: now,
        updatedAt: now,
        deletedAt: null,
      });
    }

    // Record audit log
    await recordAudit({
      firmId: req.user!.firmId,
      userId: req.user!.id,
      userName: req.user!.name,
      entity: 'Client',
      entityId: newClient.id,
      action: 'CREATE',
      oldValue: null,
      newValue: {
        name: newClient.name,
        nameBn: newClient.nameBn,
        phone: newClient.phone,
        email: newClient.email,
        address: newClient.address,
      },
    });

    res.status(201).json(newClient);
  }
);

// PATCH /api/v1/clients/:id - Edit client
clientsRouter.patch(
  '/:id',
  requirePermission('clients.edit'),
  enforceSubscriptionReadOnly,
  async (req: AuthenticatedRequest, res: Response) => {
    const db = getDatabase();
    const existing = await db.getClientById(req.params.id, req.user!.firmId, req.user);

    if (!existing || existing.firmId !== req.user!.firmId) {
      return res.status(404).json({ error: 'Client not found' });
    }

    const { name, nameBn, phone, email, address, notes, archived } = req.body;
    const updates: Partial<schema.Client> = {};
    if (name !== undefined) updates.name = name.trim();
    if (nameBn !== undefined) updates.nameBn = nameBn ? nameBn.trim() : null;
    if (phone !== undefined) updates.phone = phone.trim();
    if (email !== undefined) updates.email = email ? email.trim() : null;
    if (address !== undefined) updates.address = address.trim();
    if (notes !== undefined) updates.notes = notes ? notes.trim() : null;
    if (archived !== undefined) updates.archived = Boolean(archived);

    const oldSnapshot = {
      name: existing.name,
      nameBn: existing.nameBn,
      phone: existing.phone,
      email: existing.email,
      address: existing.address,
      notes: existing.notes,
      archived: existing.archived,
    };

    const updated = await db.updateClient(existing.id, req.user!.firmId, {
      ...updates,
      updatedBy: req.user!.id,
    });

    // Record audit log
    await recordAudit({
      firmId: req.user!.firmId,
      userId: req.user!.id,
      userName: req.user!.name,
      entity: 'Client',
      entityId: updated.id,
      action: 'UPDATE',
      oldValue: oldSnapshot,
      newValue: updates,
    });

    res.json(updated);
  }
);

// DELETE /api/v1/clients/:id - Soft delete with orphan protection
clientsRouter.delete(
  '/:id',
  requirePermission('clients.edit'),
  enforceSubscriptionReadOnly,
  async (req: AuthenticatedRequest, res: Response) => {
    const db = getDatabase();
    const existing = await db.getClientById(req.params.id, req.user!.firmId, req.user);

    if (!existing || existing.firmId !== req.user!.firmId) {
      return res.status(404).json({ error: 'Client not found' });
    }

    // CHECKLIST: Soft delete warns when the client has cases and does not orphan them
    const activeCasesCount = await db.countActiveCasesForClient(existing.id, req.user!.firmId);
    if (activeCasesCount > 0) {
      return res.status(400).json({
        error: 'Cannot delete client with active cases',
        message: `Cannot delete client: Client has ${activeCasesCount} active case(s). All cases must be resolved or closed first to avoid orphaned matter records.`,
      });
    }

    const oldSnapshot = { ...existing };
    const now = new Date();

    // SOFT DELETE ONLY: never hard delete
    await db.updateClient(existing.id, req.user!.firmId, {
      deletedAt: now,
      updatedAt: now,
      updatedBy: req.user!.id,
    });

    // Record audit log
    await recordAudit({
      firmId: req.user!.firmId,
      userId: req.user!.id,
      userName: req.user!.name,
      entity: 'Client',
      entityId: existing.id,
      action: 'DELETE',
      oldValue: oldSnapshot,
      newValue: { deletedAt: now.toISOString(), softDeleted: true },
    });

    res.json({ success: true, softDeleted: true });
  }
);
