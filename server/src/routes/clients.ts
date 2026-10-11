import { Router, Response } from 'express';
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

// GET /api/v1/clients - List & search clients
clientsRouter.get(
  '/',
  requirePermission('clients.view'),
  async (req: AuthenticatedRequest, res: Response) => {
    const db = getDatabase();
    const search = req.query.search as string | undefined;
    const clientList = await db.listClients(req.user!.firmId, search);

    res.json(clientList);
  }
);

// GET /api/v1/clients/:id - Get client by ID
clientsRouter.get(
  '/:id',
  requirePermission('clients.view'),
  async (req: AuthenticatedRequest, res: Response) => {
    const db = getDatabase();
    const client = await db.getClientById(req.params.id, req.user!.firmId);

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
    const client = await db.getClientById(req.params.id, req.user!.firmId);

    if (!client || client.firmId !== req.user!.firmId) {
      return res.status(404).json({ error: 'Client not found' });
    }

    const canSeeRestricted =
      req.user!.role === 'Owner' || (req.user!.permissions && req.user!.permissions.includes('restricted.view'));
    const overview = await db.getClientLinkedOverview(client.id, req.user!.firmId, canSeeRestricted, req.user);
    res.json(overview);
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
    const existing = await db.getClientById(req.params.id, req.user!.firmId);

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
    const existing = await db.getClientById(req.params.id, req.user!.firmId);

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
