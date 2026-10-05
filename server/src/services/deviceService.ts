import crypto from 'node:crypto';
import { getDatabase } from '../db/client.js';
import * as schema from '../db/schema.js';

/**
 * Honest Architecture Notice:
 * A "device" in this web-app level authorization system is a browser installation
 * identified by a cryptographically random 256-bit key stored in an httpOnly cookie,
 * NOT physical hardware.
 *
 * If a user clears their browser cookies or uses an incognito profile, the server
 * will perceive a new browser install, assign a new random key, and place it in 'pending'
 * authorization if the firm's device quota is exhausted or if policy is manual.
 */

export function generateDeviceKey(): string {
  return crypto.randomBytes(32).toString('hex');
}

export function hashDeviceKey(deviceKey: string): string {
  return crypto.createHash('sha256').update(deviceKey).digest('hex');
}

export function summarizeUserAgent(ua?: string): string {
  if (!ua) return 'Unknown Browser';

  let browser = 'Browser';
  if (/Edg\//i.test(ua)) browser = 'Edge';
  else if (/Chrome\//i.test(ua)) browser = 'Chrome';
  else if (/Firefox\//i.test(ua)) browser = 'Firefox';
  else if (/Safari\//i.test(ua) && !/Chrome\//i.test(ua)) browser = 'Safari';

  let os = 'Unknown OS';
  if (/Windows/i.test(ua)) os = 'Windows';
  else if (/Macintosh|Mac OS/i.test(ua)) os = 'macOS';
  else if (/Android/i.test(ua)) os = 'Android';
  else if (/iPhone|iPad|iPod/i.test(ua)) os = 'iOS';
  else if (/Linux/i.test(ua)) os = 'Linux';

  return `${browser} on ${os}`;
}

export interface DeviceAuthResult {
  status: 200 | 403;
  deviceKey: string;
  deviceKeyHash: string;
  device: schema.Device;
  error?: string;
  code?: string;
  message?: string;
}

export async function processDeviceLogin(params: {
  firmId: string;
  userId: string;
  rawDeviceKey?: string;
  userAgent?: string;
  customDeviceName?: string;
}): Promise<DeviceAuthResult> {
  const db = getDatabase();
  const { firmId, userId, userAgent, customDeviceName } = params;

  let rawDeviceKey = params.rawDeviceKey?.trim();
  let isNewGenerated = false;

  if (!rawDeviceKey || rawDeviceKey.length < 32) {
    rawDeviceKey = generateDeviceKey();
    isNewGenerated = true;
  }

  const deviceKeyHash = hashDeviceKey(rawDeviceKey);
  const existingDevice = await db.getDeviceByHash(deviceKeyHash);

  if (existingDevice) {
    // If device was registered under another firm, treat as fresh device key
    if (existingDevice.firmId !== firmId) {
      const freshKey = generateDeviceKey();
      return processDeviceLogin({
        firmId,
        userId,
        rawDeviceKey: freshKey,
        userAgent,
        customDeviceName,
      });
    }

    // Existing device registered for this firm
    if (existingDevice.status === 'revoked') {
      return {
        status: 403,
        error: 'Forbidden',
        code: 'DEVICE_REVOKED',
        message: 'This device authorization has been revoked. Please contact your chamber administrator.',
        deviceKey: rawDeviceKey,
        deviceKeyHash,
        device: existingDevice,
      };
    }

    if (existingDevice.status === 'rejected') {
      return {
        status: 403,
        error: 'Forbidden',
        code: 'DEVICE_REJECTED',
        message: 'This device registration was rejected by the administrator.',
        deviceKey: rawDeviceKey,
        deviceKeyHash,
        device: existingDevice,
      };
    }

    if (existingDevice.status === 'pending') {
      return {
        status: 403,
        error: 'Forbidden',
        code: 'DEVICE_PENDING',
        message: 'Your device is waiting for admin approval before you can log in.',
        deviceKey: rawDeviceKey,
        deviceKeyHash,
        device: existingDevice,
      };
    }

    // Approved device: update last seen & user agent
    const updated = await db.updateDevice(existingDevice.id, {
      userId,
      lastSeenAt: new Date(),
      userAgent: userAgent || existingDevice.userAgent,
    });

    return {
      status: 200,
      deviceKey: rawDeviceKey,
      deviceKeyHash,
      device: updated,
    };
  }

  // Unknown device: check limits and policy
  const firm = await db.getFirm(firmId, true);
  const maxDevices = firm?.maxDevices ?? 5;
  const devicePolicy = firm?.devicePolicy ?? 'auto-approve';
  const approvedCount = await db.countApprovedDevices(firmId);

  const name = customDeviceName?.trim() || summarizeUserAgent(userAgent);
  const now = new Date();

  if (approvedCount < maxDevices && devicePolicy === 'auto-approve') {
    // Auto-approve within quota
    const newDevice = await db.insertDevice({
      firmId,
      userId,
      deviceKeyHash,
      name,
      userAgent: userAgent || 'Unknown Browser',
      status: 'approved',
      firstSeenAt: now,
      lastSeenAt: now,
      approvedByAdminId: null,
    });

    return {
      status: 200,
      deviceKey: rawDeviceKey,
      deviceKeyHash,
      device: newDevice,
    };
  } else {
    // Quota reached or policy is manual -> Pending approval
    const pendingDevice = await db.insertDevice({
      firmId,
      userId,
      deviceKeyHash,
      name,
      userAgent: userAgent || 'Unknown Browser',
      status: 'pending',
      firstSeenAt: now,
      lastSeenAt: now,
      approvedByAdminId: null,
    });

    const quotaExceeded = approvedCount >= maxDevices;
    return {
      status: 403,
      error: 'Forbidden',
      code: 'DEVICE_PENDING',
      message: quotaExceeded
        ? `Maximum authorized device limit (${maxDevices}) reached for your chamber. This new device requires admin approval.`
        : 'This device requires administrator approval before you can log in.',
      deviceKey: rawDeviceKey,
      deviceKeyHash,
      device: pendingDevice,
    };
  }
}
