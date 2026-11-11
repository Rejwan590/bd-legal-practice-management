import { Hono } from 'hono';
import { getCookie, setCookie, deleteCookie } from 'hono/cookie';
import { z } from 'zod';
import { Env, authMiddleware, enforceSubscriptionReadOnly } from '../middleware/auth';
import { getDb } from '../db/client';
import * as schema from '../db/schema';
import { hashPassword, verifyPassword, DUMMY_HASH } from '../utils/crypto';
import { signUserToken, verifyUserToken } from '../utils/jwt';
import { evaluateServerSubscription } from '../utils/subscription';
import { generateRandomHex, sha256Hex, summarizeUserAgent, validatePasswordStrength } from '../utils/security';
import { buildAuditEntry } from '../utils/audit';
import { eq, and, isNull } from 'drizzle-orm';

export const authRouter = new Hono<{ Bindings: Env; Variables: any }>();

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
  deviceName: z.string().max(120).optional(),
});

async function processDeviceLogin(params: {
  db: any;
  firm: schema.Firm;
  userId: string;
  rawDeviceKey?: string;
  userAgent?: string;
  customDeviceName?: string;
}): Promise<{
  status: 200 | 403;
  deviceKey: string;
  deviceKeyHash: string;
  device: schema.Device;
  error?: string;
  code?: string;
  message?: string;
}> {
  const { db, firm, userId, userAgent, customDeviceName } = params;
  let rawDeviceKey = params.rawDeviceKey?.trim();
  if (!rawDeviceKey || rawDeviceKey.length < 32) {
    rawDeviceKey = generateRandomHex(32);
  }

  let deviceKeyHash = await sha256Hex(rawDeviceKey);
  const existingRows = await db
    .select()
    .from(schema.devices)
    .where(eq(schema.devices.deviceKeyHash, deviceKeyHash))
    .limit(1);

  let existing = existingRows[0] as schema.Device | undefined;
  if (existing && existing.firmId !== firm.id) {
    rawDeviceKey = generateRandomHex(32);
    deviceKeyHash = await sha256Hex(rawDeviceKey);
    existing = undefined;
  }

  const now = new Date().toISOString();
  if (existing) {
    if (existing.status === 'revoked') {
      return {
        status: 403,
        error: 'Forbidden',
        code: 'DEVICE_REVOKED',
        message: 'This device authorization has been revoked. Please contact your chamber administrator.',
        deviceKey: rawDeviceKey,
        deviceKeyHash,
        device: existing,
      };
    }
    if (existing.status === 'rejected') {
      return {
        status: 403,
        error: 'Forbidden',
        code: 'DEVICE_REJECTED',
        message: 'This device registration was rejected by the administrator.',
        deviceKey: rawDeviceKey,
        deviceKeyHash,
        device: existing,
      };
    }
    if (existing.status === 'pending') {
      return {
        status: 403,
        error: 'Forbidden',
        code: 'DEVICE_PENDING',
        message: 'Your device is waiting for admin approval before you can log in.',
        deviceKey: rawDeviceKey,
        deviceKeyHash,
        device: existing,
      };
    }

    await db
      .update(schema.devices)
      .set({ userId, lastSeenAt: now, userAgent: userAgent || existing.userAgent })
      .where(eq(schema.devices.id, existing.id));

    return {
      status: 200,
      deviceKey: rawDeviceKey,
      deviceKeyHash,
      device: { ...existing, userId, lastSeenAt: now, userAgent: userAgent || existing.userAgent },
    };
  }

  const firmDevices = await db
    .select()
    .from(schema.devices)
    .where(and(eq(schema.devices.firmId, firm.id), eq(schema.devices.status, 'approved')));

  const approvedCount = firmDevices.length;
  const maxDevices = firm.maxDevices ?? 5;
  const devicePolicy = firm.devicePolicy ?? 'auto-approve';
  const name = customDeviceName?.trim() || summarizeUserAgent(userAgent);
  const autoApproved = approvedCount < maxDevices && devicePolicy === 'auto-approve';

  const newDevice: schema.Device = {
    id: crypto.randomUUID(),
    firmId: firm.id,
    userId,
    deviceKeyHash,
    name,
    userAgent: userAgent || 'Unknown Browser',
    status: autoApproved ? 'approved' : 'pending',
    firstSeenAt: now,
    lastSeenAt: now,
    approvedByAdminId: null,
  };

  await db.insert(schema.devices).values(newDevice);

  if (!autoApproved) {
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
      device: newDevice,
    };
  }

  return {
    status: 200,
    deviceKey: rawDeviceKey,
    deviceKeyHash,
    device: newDevice,
  };
}

// POST /auth/login and /api/v1/auth/login
authRouter.post('/login', async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const parse = loginSchema.safeParse(body);
  if (!parse.success) {
    return c.json({ error: 'Validation failed', message: 'Invalid email or password format' }, 400);
  }

  const { email, password, deviceName } = parse.data;
  const db = getDb(c.env.DB);
  const now = new Date();
  const nowIso = now.toISOString();

  const users = await db
    .select()
    .from(schema.users)
    .where(and(eq(schema.users.email, email.toLowerCase().trim()), isNull(schema.users.deletedAt)))
    .limit(1);

  const user = users[0];
  if (!user) {
    await verifyPassword(password, DUMMY_HASH);
    return c.json({ error: 'Unauthorized', message: 'Invalid email or password' }, 401);
  }

  if (user.lockedUntil && new Date(user.lockedUntil).getTime() > now.getTime()) {
    return c.json({
      error: 'Too Many Requests',
      code: 'ACCOUNT_LOCKED',
      message: 'Account temporarily locked due to repeated failed login attempts. Try again later.',
    }, 429);
  }

  if (!user.active) {
    await verifyPassword(password, DUMMY_HASH);
    return c.json({ error: 'Unauthorized', message: 'Account disabled' }, 401);
  }

  const isValid = await verifyPassword(password, user.passwordHash);
  if (!isValid) {
    const attempts = (user.failedLoginAttempts || 0) + 1;
    const lockedUntil = attempts >= 5 ? new Date(now.getTime() + 15 * 60 * 1000).toISOString() : null;
    await db
      .update(schema.users)
      .set({ failedLoginAttempts: attempts, lockedUntil, updatedAt: nowIso })
      .where(eq(schema.users.id, user.id));
    return c.json({ error: 'Unauthorized', message: 'Invalid email or password' }, 401);
  }

  const firmRows = await db
    .select()
    .from(schema.firms)
    .where(and(eq(schema.firms.id, user.firmId), isNull(schema.firms.deletedAt)))
    .limit(1);

  const firm = firmRows[0];
  if (!firm || firm.status === 'suspended' || firm.status === 'disabled') {
    return c.json({ error: 'Forbidden', message: 'Firm account is suspended or disabled' }, 403);
  }

  const deviceResult = await processDeviceLogin({
    db,
    firm,
    userId: user.id,
    rawDeviceKey: getCookie(c, 'device_key'),
    userAgent: c.req.header('user-agent'),
    customDeviceName: deviceName,
  });

  if (deviceResult.status !== 200) {
    setCookie(c, 'device_key', deviceResult.deviceKey, {
      httpOnly: true,
      secure: true,
      sameSite: 'None',
      path: '/',
      maxAge: 365 * 24 * 60 * 60,
    });
    return c.json(
      {
        error: deviceResult.error,
        code: deviceResult.code,
        message: deviceResult.message,
        device: {
          id: deviceResult.device.id,
          name: deviceResult.device.name,
          status: deviceResult.device.status,
        },
      },
      403
    );
  }

  const token = await signUserToken(
    {
      userId: user.id,
      firmId: user.firmId,
      role: user.role,
      email: user.email,
      deviceKeyHash: deviceResult.deviceKeyHash,
    },
    c.env.JWT_SECRET || 'test-jwt-secret-min-32-chars-long-security'
  );

  // Clear failed attempts counter + record login audit
  await db.batch([
    db
      .update(schema.users)
      .set({ failedLoginAttempts: 0, lockedUntil: null, updatedAt: nowIso })
      .where(eq(schema.users.id, user.id)),
    db.insert(schema.auditLog).values(
      buildAuditEntry({
        firmId: firm.id,
        userId: user.id,
        userName: user.name,
        entity: 'Session',
        entityId: user.id,
        action: 'LOGIN',
        newValue: { email: user.email, deviceId: deviceResult.device.id },
        now: nowIso,
      })
    ),
  ] as any);

  // Set access_token before device_key so single-cookie extractors reading first cookie receive access_token
  setCookie(c, 'access_token', token, {
    httpOnly: true,
    secure: true,
    sameSite: 'None',
    path: '/',
    maxAge: 7 * 24 * 60 * 60,
  });
  setCookie(c, 'device_key', deviceResult.deviceKey, {
    httpOnly: true,
    secure: true,
    sameSite: 'None',
    path: '/',
    maxAge: 365 * 24 * 60 * 60,
  });

  return c.json({
    user: {
      id: user.id,
      firmId: user.firmId,
      name: user.name,
      email: user.email,
      role: user.role,
      jobType: user.jobType,
      jobTitleLabel: user.jobTitleLabel,
      permissions: user.permissions,
      language: user.language,
      mustChangePassword: user.mustChangePassword,
    },
    firm: {
      id: firm.id,
      name: firm.name,
      status: firm.status,
      isTrial: firm.isTrial,
      licenseExpiresAt: firm.licenseExpiresAt,
      visibilityMode: firm.visibilityMode,
      maxUsers: firm.maxUsers,
      maxDevices: firm.maxDevices,
    },
    subscription: evaluateServerSubscription(firm),
    device: {
      id: deviceResult.device.id,
      name: deviceResult.device.name,
      status: deviceResult.device.status,
    },
  });
});

// GET /auth/me
authRouter.get('/me', authMiddleware, async (c) => {
  const user = c.get('user') as schema.User;
  const firm = c.get('firm') as schema.Firm;

  return c.json({
    user: {
      id: user.id,
      firmId: user.firmId,
      name: user.name,
      email: user.email,
      role: user.role,
      jobType: user.jobType,
      jobTitleLabel: user.jobTitleLabel,
      permissions: user.permissions,
      language: user.language,
      mustChangePassword: user.mustChangePassword,
    },
    firm,
    subscription: evaluateServerSubscription(firm),
  });
});

async function handleChangePassword(c: any) {
  const user = c.get('user') as schema.User;
  const body = await c.req.json().catch(() => ({}));

  const schemaValidation = z.object({
    currentPassword: z.string().min(1),
    newPassword: z.string().min(8),
  });

  const parse = schemaValidation.safeParse(body);
  if (!parse.success) {
    return c.json({ error: 'Bad Request', message: 'Current password and new password are required.' }, 400);
  }

  const { currentPassword, newPassword } = parse.data;
  const strength = validatePasswordStrength(newPassword);
  if (!strength.isValid) {
    return c.json({ error: 'Bad Request', message: strength.message }, 400);
  }

  const isValid = await verifyPassword(currentPassword, user.passwordHash);
  if (!isValid) {
    return c.json({ error: 'Unauthorized', message: 'Current password is incorrect.' }, 401);
  }

  const newHash = await hashPassword(newPassword);
  const db = getDb(c.env.DB);
  const nowIso = new Date().toISOString();

  await db.batch([
    db
      .update(schema.users)
      .set({
        passwordHash: newHash,
        mustChangePassword: false,
        updatedAt: nowIso,
      })
      .where(eq(schema.users.id, user.id)),
    db.insert(schema.auditLog).values(
      buildAuditEntry({
        firmId: user.firmId,
        userId: user.id,
        userName: user.name,
        entity: 'User',
        entityId: user.id,
        action: 'RESET_PASSWORD',
        newValue: { selfService: true, changedAt: nowIso },
        now: nowIso,
      })
    ),
  ] as any);

  return c.json({ message: 'Password changed successfully.' });
}

authRouter.post('/change-password', authMiddleware, enforceSubscriptionReadOnly, handleChangePassword);
authRouter.put('/change-password', authMiddleware, enforceSubscriptionReadOnly, handleChangePassword);

// POST /auth/logout
authRouter.post('/logout', async (c) => {
  const token = getCookie(c, 'access_token') || c.req.header('Authorization')?.replace('Bearer ', '');
  if (token) {
    try {
      const payload = await verifyUserToken(token, c.env.JWT_SECRET || 'test-jwt-secret-min-32-chars-long-security');
      if (payload?.userId && payload?.firmId) {
        const db = getDb(c.env.DB);
        await db.insert(schema.auditLog).values(
          buildAuditEntry({
            firmId: payload.firmId,
            userId: payload.userId,
            userName: payload.email || 'User',
            entity: 'Session',
            entityId: payload.userId,
            action: 'LOGOUT',
            newValue: { email: payload.email },
          })
        );
      }
    } catch {
      // Ignore verification failure on logout
    }
  }

  deleteCookie(c, 'access_token', { path: '/' });
  return c.json({ message: 'Logged out successfully' });
});
