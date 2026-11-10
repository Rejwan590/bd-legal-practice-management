import { Context, Next } from 'hono';
import { getCookie } from 'hono/cookie';
import { verifyAdminToken } from '../utils/jwt';
import { getDb } from '../db/client';
import * as schema from '../db/schema';
import { eq } from 'drizzle-orm';
import { Env } from './auth';

export async function adminAuthMiddleware(c: Context<{ Bindings: Env; Variables: any }>, next: Next) {
  const token = getCookie(c, 'admin_access_token') || c.req.header('Authorization')?.replace('Bearer ', '');

  if (!token) {
    return c.json({ error: 'Unauthorized', message: 'Platform admin authentication required' }, 401);
  }

  const payload = await verifyAdminToken(token, c.env.ADMIN_JWT_SECRET || 'test-admin-jwt-secret-min-32-chars-long');
  if (!payload) {
    return c.json({ error: 'Unauthorized', message: 'Invalid or expired admin token' }, 401);
  }

  const db = getDb(c.env.DB);
  const adminRows = await db
    .select()
    .from(schema.platformAdmins)
    .where(eq(schema.platformAdmins.id, payload.adminId))
    .limit(1);

  const admin = adminRows[0];
  if (!admin || !admin.active) {
    return c.json({ error: 'Unauthorized', message: 'Platform admin account disabled' }, 401);
  }

  c.set('admin', admin);
  return next();
}
