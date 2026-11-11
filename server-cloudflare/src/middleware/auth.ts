import { Context, Next } from 'hono';
import { getCookie } from 'hono/cookie';
import { verifyUserToken } from '../utils/jwt';
import { getDb } from '../db/client';
import * as schema from '../db/schema';
import { eq, and, isNull } from 'drizzle-orm';
import { sha256Hex } from '../utils/security';
import { evaluateServerSubscription } from '../utils/subscription';

export interface Env {
  DB: D1Database;
  PHOTOS_BUCKET?: R2Bucket;
  BACKUPS_BUCKET?: R2Bucket;
  SUPABASE_URL?: string;
  SUPABASE_SECRET_KEY?: string;
  SUPABASE_SERVICE_ROLE_KEY?: string;
  SUPABASE_PHOTOS_BUCKET?: string;
  SUPABASE_BACKUPS_BUCKET?: string;
  JWT_SECRET: string;
  ADMIN_JWT_SECRET: string;
  CORS_ORIGIN: string;
  ENVIRONMENT: string;
}

export async function authMiddleware(c: Context<{ Bindings: Env; Variables: any }>, next: Next) {
  const token = getCookie(c, 'access_token') || c.req.header('Authorization')?.replace('Bearer ', '');

  if (!token) {
    return c.json({ error: 'Unauthorized', message: 'Authentication required' }, 401);
  }

  const payload = await verifyUserToken(token, c.env.JWT_SECRET || 'test-jwt-secret-min-32-chars-long-security');
  if (!payload) {
    return c.json({ error: 'Unauthorized', message: 'Invalid or expired token' }, 401);
  }

  const db = getDb(c.env.DB);
  const userRows = await db
    .select()
    .from(schema.users)
    .where(and(eq(schema.users.id, payload.userId), eq(schema.users.firmId, payload.firmId), isNull(schema.users.deletedAt)))
    .limit(1);

  const user = userRows[0];
  if (!user || !user.active) {
    return c.json({ error: 'Unauthorized', message: 'User account inactive or deleted' }, 401);
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

  // Device authorization check when cookie or JWT carries a deviceKeyHash
  const rawDeviceKey = getCookie(c, 'device_key');
  const deviceKeyHash = rawDeviceKey ? await sha256Hex(rawDeviceKey) : payload.deviceKeyHash;
  if (deviceKeyHash) {
    const devRows = await db
      .select()
      .from(schema.devices)
      .where(and(eq(schema.devices.deviceKeyHash, deviceKeyHash), eq(schema.devices.firmId, firm.id)))
      .limit(1);
    const device = devRows[0];
    if (device) {
      if (device.status === 'revoked' || device.status === 'rejected' || device.status === 'pending') {
        const codeMap: Record<string, string> = {
          revoked: 'DEVICE_REVOKED',
          rejected: 'DEVICE_REJECTED',
          pending: 'DEVICE_PENDING',
        };
        return c.json({
          error: 'Forbidden',
          code: codeMap[device.status] || 'DEVICE_UNAUTHORIZED',
          message: `Device access is ${device.status}. Please contact your chamber administrator.`,
        }, 403);
      }
      c.set('device', device);
    }
  }

  c.set('user', user);
  c.set('firmId', user.firmId);
  c.set('firm', firm);

  return next();
}

/**
 * Hard Invariant: Block mutating writes when firm license is expired past grace period (Read-Only Mode)
 */
export async function enforceSubscriptionReadOnly(c: Context<{ Bindings: Env; Variables: any }>, next: Next) {
  const method = c.req.method.toUpperCase();
  const isMutating = ['POST', 'PUT', 'PATCH', 'DELETE'].includes(method);
  if (!isMutating) {
    return next();
  }

  if (c.req.path.endsWith('/auth/logout')) {
    return next();
  }

  const firm = c.get('firm') as schema.Firm | undefined;
  if (!firm) {
    return next();
  }

  const sub = evaluateServerSubscription(firm);
  if (sub.isReadOnly) {
    return c.json({
      error: 'SUBSCRIPTION_READ_ONLY',
      code: 'SUBSCRIPTION_READ_ONLY',
      message: 'Subscription has expired. Chamber is in read-only mode. Please renew to make changes.',
    }, 403);
  }

  return next();
}

/**
 * Verify user has a specific permission or is an Owner
 */
export function requirePermission(permissionKey: string) {
  return requireAnyPermission([permissionKey]);
}

export function requireAnyPermission(permissionKeys: string[]) {
  return async (c: Context<{ Bindings: Env; Variables: any }>, next: Next) => {
    const user = c.get('user') as schema.User;
    if (!user) {
      return c.json({ error: 'Unauthorized', message: 'Authentication required' }, 401);
    }

    if (user.role === 'Owner') {
      return next();
    }

    const perms = (Array.isArray(user.permissions) ? user.permissions : []) as string[];
    if (perms.includes('*') || permissionKeys.some((k) => perms.includes(k))) {
      return next();
    }

    return c.json({ error: 'Forbidden', message: `Missing required permission: ${permissionKeys[0]}` }, 403);
  };
}

/**
 * Hard Invariant: Verify user is an Owner
 */
export async function requireOwner(c: Context<{ Bindings: Env; Variables: any }>, next: Next) {
  const user = c.get('user') as schema.User;
  if (!user || user.role !== 'Owner') {
    return c.json({ error: 'OWNER_ONLY', message: 'This operation requires chamber Owner privileges' }, 403);
  }
  return next();
}
