import { Router, Response } from 'express';
import { firmAuthMiddleware, AuthenticatedRequest } from '../middleware/auth.js';
import { enforceSubscriptionReadOnly } from '../middleware/subscription.js';
import { getDatabase } from '../db/client.js';
import { recordAudit } from '../services/auditService.js';

export const devicesRouter = Router();

// All firm device routes require firm authentication
devicesRouter.use(firmAuthMiddleware);

/**
 * Honest Architecture Notice:
 * A "device" is a browser install identified by a random id cookie, not physical hardware.
 */

// 1. GET /api/v1/devices/my - Firm Owner gets read-only list of chamber devices
devicesRouter.get('/my', async (req: AuthenticatedRequest, res: Response) => {
  if (req.user?.role !== 'Owner') {
    return res.status(403).json({
      error: 'Forbidden',
      message: 'Only chamber owners can inspect authorized chamber devices.',
    });
  }

  const db = getDatabase();
  const firmId = req.firm!.id;
  const devicesList = await db.listDevices(firmId);
  const usersList = await db.listUsers(firmId);
  const userMap = new Map(usersList.map((u) => [u.id, { name: u.name, email: u.email, role: u.role }]));

  // Strictly omit deviceKeyHash for security
  const safeDevices = devicesList.map((d) => {
    const user = userMap.get(d.userId);
    return {
      id: d.id,
      firmId: d.firmId,
      userId: d.userId,
      userName: user?.name || 'Unknown User',
      userEmail: user?.email || 'Unknown Email',
      userRole: user?.role || 'Staff',
      name: d.name,
      userAgent: d.userAgent,
      status: d.status,
      firstSeenAt: d.firstSeenAt,
      lastSeenAt: d.lastSeenAt,
      isCurrentDevice: req.device?.id === d.id,
    };
  });

  return res.status(200).json({
    devices: safeDevices,
    maxDevices: req.firm!.maxDevices,
    allowOwnerDeviceRemoval: req.firm!.allowOwnerDeviceRemoval,
    notice: 'A device is a browser profile/cookie install identified by a random id, not physical hardware.',
  });
});

// 2. DELETE /api/v1/devices/:id - Firm Owner may remove staff devices only if admin enables that policy
devicesRouter.delete(
  '/:id',
  enforceSubscriptionReadOnly,
  async (req: AuthenticatedRequest, res: Response) => {
    if (req.user?.role !== 'Owner') {
      return res.status(403).json({
        error: 'Forbidden',
        message: 'Only chamber owners can remove staff devices.',
      });
    }

  const firm = req.firm!;
  if (!firm.allowOwnerDeviceRemoval) {
    return res.status(403).json({
      error: 'Forbidden',
      message: 'Device removal by chamber owner is disabled by platform policy. Contact support.',
    });
  }

  const db = getDatabase();
  const device = await db.getDeviceById(req.params.id);

  // Firm isolation: if device not found or belongs to another firm, return 404
  if (!device || device.firmId !== firm.id) {
    return res.status(404).json({ error: 'Device not found' });
  }

  // Revoke device access so their active sessions terminate immediately
  const oldStatus = device.status;
  const updatedDevice = await db.updateDevice(device.id, {
    status: 'revoked',
    lastSeenAt: new Date(),
  });

  await recordAudit({
    firmId: firm.id,
    userId: req.user!.id,
    userName: req.user!.name,
    entity: 'Device',
    entityId: device.id,
    action: 'DEVICE_REVOKE',
    oldValue: { status: oldStatus },
    newValue: { status: 'revoked' },
  });

  return res.status(200).json({
    message: 'Staff device removed and access revoked.',
    device: {
      id: updatedDevice.id,
      name: updatedDevice.name,
      status: updatedDevice.status,
    },
  });
});
