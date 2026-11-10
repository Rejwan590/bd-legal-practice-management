import { Hono } from 'hono';
import { setCookie, deleteCookie } from 'hono/cookie';
import { z } from 'zod';
import { Env, authMiddleware } from '../middleware/auth';
import { getDb } from '../db/client';
import * as schema from '../db/schema';
import { hashPassword, verifyPassword, DUMMY_HASH } from '../utils/crypto';
import { signUserToken } from '../utils/jwt';
import { eq, and, isNull } from 'drizzle-orm';

export const authRouter = new Hono<{ Bindings: Env; Variables: any }>();

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

// POST /api/v1/auth/login
authRouter.post('/login', async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const parse = loginSchema.safeParse(body);
  if (!parse.success) {
    return c.json({ error: 'Validation failed', message: 'Invalid email or password format' }, 400);
  }

  const { email, password } = parse.data;
  const db = getDb(c.env.DB);

  const users = await db
    .select()
    .from(schema.users)
    .where(and(eq(schema.users.email, email.toLowerCase().trim()), isNull(schema.users.deletedAt)))
    .limit(1);

  const user = users[0];

  if (!user) {
    // Constant-time dummy verification to eliminate user-enumeration timing attacks
    await verifyPassword(password, DUMMY_HASH);
    return c.json({ error: 'Unauthorized', message: 'Invalid email or password' }, 401);
  }

  if (!user.active) {
    await verifyPassword(password, DUMMY_HASH);
    return c.json({ error: 'Unauthorized', message: 'Account disabled' }, 401);
  }

  const isValid = await verifyPassword(password, user.passwordHash);
  if (!isValid) {
    return c.json({ error: 'Unauthorized', message: 'Invalid email or password' }, 401);
  }

  // Fetch Firm details
  const firmRows = await db
    .select()
    .from(schema.firms)
    .where(and(eq(schema.firms.id, user.firmId), isNull(schema.firms.deletedAt)))
    .limit(1);

  const firm = firmRows[0];
  if (!firm || firm.status === 'suspended' || firm.status === 'disabled') {
    return c.json({ error: 'Forbidden', message: 'Firm account is suspended or disabled' }, 403);
  }

  const token = await signUserToken(
    {
      userId: user.id,
      firmId: user.firmId,
      role: user.role,
      email: user.email,
    },
    c.env.JWT_SECRET || 'test-jwt-secret-min-32-chars-long-security'
  );

  setCookie(c, 'access_token', token, {
    httpOnly: true,
    secure: true,
    sameSite: 'None',
    path: '/',
    maxAge: 7 * 24 * 60 * 60,
  });

  return c.json({
    user: {
      id: user.id,
      firmId: user.firmId,
      name: user.name,
      email: user.email,
      role: user.role,
      jobType: user.jobType,
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
  });
});

// GET /api/v1/auth/me
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
  });
});

// PUT /api/v1/auth/change-password
authRouter.put('/change-password', authMiddleware, async (c) => {
  const user = c.get('user') as schema.User;
  const body = await c.req.json().catch(() => ({}));

  const schemaValidation = z.object({
    currentPassword: z.string().min(1),
    newPassword: z.string().min(8),
  });

  const parse = schemaValidation.safeParse(body);
  if (!parse.success) {
    return c.json({ error: 'Validation failed', message: 'New password must be at least 8 characters' }, 400);
  }

  const { currentPassword, newPassword } = parse.data;
  const isValid = await verifyPassword(currentPassword, user.passwordHash);
  if (!isValid) {
    return c.json({ error: 'Unauthorized', message: 'Current password incorrect' }, 401);
  }

  const newHash = await hashPassword(newPassword);
  const db = getDb(c.env.DB);

  await db
    .update(schema.users)
    .set({
      passwordHash: newHash,
      mustChangePassword: false,
      updatedAt: new Date().toISOString(),
    })
    .where(eq(schema.users.id, user.id));

  return c.json({ message: 'Password updated successfully' });
});

// POST /api/v1/auth/logout
authRouter.post('/logout', (c) => {
  deleteCookie(c, 'access_token', { path: '/' });
  return c.json({ message: 'Logged out successfully' });
});
