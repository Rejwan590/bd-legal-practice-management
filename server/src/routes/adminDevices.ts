import { Router, Response } from 'express';
import { z } from 'zod';
import { adminAuthMiddleware, AuthenticatedAdminRequest } from '../middleware/adminAuth.js';
import { getDatabase } from '../db/client.js';
import { recordAdminAudit } from '../services/adminAuditService.js';

export const adminDevicesRouter = Router();

// All routes require platform admin authentication
adminDevicesRouter.use(adminAuthMiddleware);

/**
 * Honest Architecture Notice:
 * A "device" is a browser install identified by a random id cookie, not physical hardware.
 */

// 1. GET /api/admin/firms/:id/devices - List all devices registered for a specific firm
adminDevicesRouter.get('/firms/:id/devices', async (req: AuthenticatedAdminRequest, res: Response) => {
  const db = getDatabase();
  const firm = await db.getFirm(req.params.id, true);

  if (!firm) {
    return res.status(404).json({ error: 'Firm not found' });
  }

  const devicesList = await db.listDevices(firm.id);
  const usersList = await db.listUsers(firm.id);
  const userMap = new Map(usersList.map((u) => [u.id, { name: u.name, email: u.email, role: u.role }]));

  const enrichedDevices = devicesList.map((d) => {
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
      approvedByAdminId: d.approvedByAdminId,
    };
  });

  return res.status(200).json({
    devices: enrichedDevices,
    maxDevices: firm.maxDevices,
    devicePolicy: firm.devicePolicy,
    allowOwnerDeviceRemoval: firm.allowOwnerDeviceRemoval,
  });
});

// 2. POST /api/admin/devices/:id/approve - Approve a pending, rejected, or revoked device
adminDevicesRouter.post('/devices/:id/approve', async (req: AuthenticatedAdminRequest, res: Response) => {
  const db = getDatabase();
  const device = await db.getDeviceById(req.params.id);

  if (!device) {
    return res.status(404).json({ error: 'Device not found' });
  }

  const oldStatus = device.status;
  const updatedDevice = await db.transaction(async (txDb) => {
    const updated = await txDb.updateDevice(device.id, {
      status: 'approved',
      approvedByAdminId: req.admin!.id,
      lastSeenAt: new Date(),
    });

    await txDb.insertAdminAudit({
      adminId: req.admin!.id,
      action: 'DEVICE_APPROVE',
      targetFirmId: device.firmId,
      old: { deviceId: device.id, status: oldStatus },
      new: { deviceId: device.id, status: 'approved' },
      ip: req.ip,
      at: new Date(),
    });

    return updated;
  });

  return res.status(200).json({
    message: 'Device approved successfully.',
    device: updatedDevice,
  });
});

// 3. POST /api/admin/devices/:id/reject - Reject a device registration
adminDevicesRouter.post('/devices/:id/reject', async (req: AuthenticatedAdminRequest, res: Response) => {
  const db = getDatabase();
  const device = await db.getDeviceById(req.params.id);

  if (!device) {
    return res.status(404).json({ error: 'Device not found' });
  }

  const oldStatus = device.status;
  const updatedDevice = await db.transaction(async (txDb) => {
    const updated = await txDb.updateDevice(device.id, {
      status: 'rejected',
      lastSeenAt: new Date(),
    });

    await txDb.insertAdminAudit({
      adminId: req.admin!.id,
      action: 'DEVICE_REJECT',
      targetFirmId: device.firmId,
      old: { deviceId: device.id, status: oldStatus },
      new: { deviceId: device.id, status: 'rejected' },
      ip: req.ip,
      at: new Date(),
    });

    return updated;
  });

  return res.status(200).json({
    message: 'Device registration rejected.',
    device: updatedDevice,
  });
});

// 4. POST /api/admin/devices/:id/revoke - Revoke device authorization, ending sessions immediately
adminDevicesRouter.post('/devices/:id/revoke', async (req: AuthenticatedAdminRequest, res: Response) => {
  const db = getDatabase();
  const device = await db.getDeviceById(req.params.id);

  if (!device) {
    return res.status(404).json({ error: 'Device not found' });
  }

  const oldStatus = device.status;
  const updatedDevice = await db.transaction(async (txDb) => {
    const updated = await txDb.updateDevice(device.id, {
      status: 'revoked',
      lastSeenAt: new Date(),
    });

    await txDb.insertAdminAudit({
      adminId: req.admin!.id,
      action: 'DEVICE_REVOKE',
      targetFirmId: device.firmId,
      old: { deviceId: device.id, status: oldStatus },
      new: { deviceId: device.id, status: 'revoked' },
      ip: req.ip,
      at: new Date(),
    });

    return updated;
  });

  return res.status(200).json({
    message: 'Device authorization revoked. Active sessions for this device are invalidated immediately.',
    device: updatedDevice,
  });
});
