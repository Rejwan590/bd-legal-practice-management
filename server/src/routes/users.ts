import { Router, Response } from 'express';
import { authMiddleware, AuthenticatedRequest } from '../middleware/auth.js';
import { requireOwner } from '../middleware/permission.js';
import { enforceFirmIsolation } from '../middleware/firmIsolation.js';
import { enforceSubscriptionReadOnly } from '../middleware/subscription.js';
import { getDatabase } from '../db/client.js';
import { recordAudit } from '../services/auditService.js';

export const usersRouter = Router();

usersRouter.use(authMiddleware);
usersRouter.use(enforceFirmIsolation);

// GET /api/v1/users - List users in current firm
usersRouter.get('/', async (req: AuthenticatedRequest, res: Response) => {
  const db = getDatabase();
  const users = await db.listUsers(req.user!.firmId);
  const sanitized = users.map((u) => ({
    id: u.id,
    firmId: u.firmId,
    name: u.name,
    email: u.email,
    role: u.role,
    permissions: u.permissions,
    language: u.language,
    active: u.active,
    createdAt: u.createdAt,
    updatedAt: u.updatedAt,
  }));
  res.json(sanitized);
});

// GET /api/v1/users/:id - Get user by ID in same firm
usersRouter.get('/:id', async (req: AuthenticatedRequest, res: Response) => {
  const db = getDatabase();
  const user = await db.getUserById(req.params.id);
  if (!user || user.firmId !== req.user!.firmId) {
    return res.status(404).json({ error: 'User not found' });
  }

  res.json({
    id: user.id,
    firmId: user.firmId,
    name: user.name,
    email: user.email,
    role: user.role,
    permissions: user.permissions,
    language: user.language,
    active: user.active,
  });
});

// PATCH /api/v1/users/:id/permissions - Owner-only endpoint
usersRouter.patch(
  '/:id/permissions',
  requireOwner(),
  enforceSubscriptionReadOnly,
  async (req: AuthenticatedRequest, res: Response) => {
    const db = getDatabase();
    const targetUser = await db.getUserById(req.params.id);

    if (!targetUser || targetUser.firmId !== req.user!.firmId) {
      return res.status(404).json({ error: 'User not found in this chamber' });
    }

    const { permissions } = req.body;
    if (!Array.isArray(permissions)) {
      return res.status(400).json({ error: 'Bad Request', message: 'permissions must be an array of keys.' });
    }

    const oldPermissions = [...targetUser.permissions];
    const updated = await db.updateUser(targetUser.id, { permissions });

    // Write audit log row for this write operation
    await recordAudit({
      firmId: req.user!.firmId,
      userId: req.user!.id,
      userName: req.user!.name,
      entity: 'User',
      entityId: targetUser.id,
      action: 'UPDATE_PERMISSIONS',
      oldValue: { permissions: oldPermissions },
      newValue: { permissions },
    });

    res.json({
      id: updated.id,
      firmId: updated.firmId,
      name: updated.name,
      email: updated.email,
      role: updated.role,
      permissions: updated.permissions,
      language: updated.language,
      active: updated.active,
    });
  }
);
