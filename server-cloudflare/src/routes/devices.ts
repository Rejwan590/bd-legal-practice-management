import { Hono } from 'hono';
import { Env, authMiddleware, enforceSubscriptionReadOnly, requireOwner } from '../middleware/auth';
import { getDb } from '../db/client';
import * as schema from '../db/schema';
import { eq, and, isNull } from 'drizzle-orm';
import { buildAuditEntry } from '../utils/audit';

export const devicesRouter = new Hono<{ Bindings: Env; Variables: any }>();

devicesRouter.use('*', authMiddleware);

// GET /api/v1/devices/my
devicesRouter.get('/my', requireOwner, async (c) => {
  const firm = c.get('firm') as schema.Firm;
  const currentDevice = c.get('device') as schema.Device | undefined;
  const db = getDb(c.env.DB);

  const [devicesList, usersList] = await Promise.all([
    db.select().from(schema.devices).where(eq(schema.devices.firmId, firm.id)),
    db
      .select({ id: schema.users.id, name: schema.users.name, email: schema.users.email, role: schema.users.role })
      .from(schema.users)
      .where(and(eq(schema.users.firmId, firm.id), isNull(schema.users.deletedAt))),
  ]);

  const userMap = new Map(usersList.map((u) => [u.id, u]));

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
      isCurrentDevice: currentDevice?.id === d.id,
    };
  });

  return c.json({
    devices: safeDevices,
    maxDevices: firm.maxDevices,
    allowOwnerDeviceRemoval: firm.allowOwnerDeviceRemoval,
    notice: 'A device is a browser profile/cookie install identified by a random id, not physical hardware.',
  });
});

// DELETE /api/v1/devices/:id
devicesRouter.delete('/:id', enforceSubscriptionReadOnly, requireOwner, async (c) => {
  const firm = c.get('firm') as schema.Firm;
  const user = c.get('user') as schema.User;
  const id = c.req.param('id') as string;

  if (!firm.allowOwnerDeviceRemoval) {
    return c.json({
      error: 'Forbidden',
      message: 'Device removal by chamber owner is disabled by platform policy. Contact support.',
    }, 403);
  }

  const db = getDb(c.env.DB);
  const rows = await db
    .select()
    .from(schema.devices)
    .where(and(eq(schema.devices.id, id), eq(schema.devices.firmId, firm.id)))
    .limit(1);

  const device = rows[0];
  if (!device) {
    return c.json({ error: 'Device not found' }, 404);
  }

  const nowIso = new Date().toISOString();
  const updatedDevice = { ...device, status: 'revoked' as const, lastSeenAt: nowIso };

  await db.batch([
    db
      .update(schema.devices)
      .set({ status: 'revoked', lastSeenAt: nowIso })
      .where(and(eq(schema.devices.id, id), eq(schema.devices.firmId, firm.id))),
    db.insert(schema.auditLog).values(
      buildAuditEntry({
        firmId: firm.id,
        userId: user.id,
        userName: user.name,
        entity: 'Device',
        entityId: device.id,
        action: 'DEVICE_REVOKE',
        oldValue: { status: device.status },
        newValue: { status: 'revoked', deviceName: device.name },
        now: nowIso,
      })
    ),
  ] as any);

  return c.json({
    message: 'Device revoked successfully.',
    device: { id: updatedDevice.id, name: updatedDevice.name, status: updatedDevice.status },
  });
});
