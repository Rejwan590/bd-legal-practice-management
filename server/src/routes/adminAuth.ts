import { Router, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import {
  adminAuthMiddleware,
  AuthenticatedAdminRequest,
  ADMIN_COOKIE_NAME,
  generateAdminAccessToken,
  getAdminCookieOptions,
  AdminTokenPayload,
} from '../middleware/adminAuth.js';
import { revokeToken } from '../middleware/auth.js';
import { loginPlatformAdmin } from '../services/adminAuthService.js';
import { recordAdminAudit } from '../services/adminAuditService.js';
import { getAdminJwtSecret } from '../config.js';

export const adminAuthRouter = Router();

// POST /api/admin/auth/login
adminAuthRouter.post('/login', async (req: Request, res: Response) => {
  const { email, password } = req.body || {};

  const result = await loginPlatformAdmin(email, password);

  if (result.status !== 200 || !result.data) {
    return res.status(result.status).json({
      error: result.error,
      code: result.code,
      message: result.message,
    });
  }

  const { admin, token } = result.data;

  // Set httpOnly secure sameSite strict cookie
  res.cookie(ADMIN_COOKIE_NAME, token, getAdminCookieOptions());

  // Record audit entry for admin login
  await recordAdminAudit({
    adminId: admin.id,
    action: 'ADMIN_LOGIN',
    ip: req.ip,
  });

  // Zero token returned in JSON body (cookie-only security)
  res.json({
    success: true,
    admin: {
      id: admin.id,
      email: admin.email,
      active: admin.active,
    },
  });
});

// POST /api/admin/auth/logout
adminAuthRouter.post('/logout', async (req: Request, res: Response) => {
  const token = req.cookies?.[ADMIN_COOKIE_NAME];

  if (token) {
    // Revoke token server-side immediately
    revokeToken(token);

    try {
      const secret = getAdminJwtSecret();
      const payload = jwt.verify(token, secret) as AdminTokenPayload;
      if (payload && payload.adminId) {
        await recordAdminAudit({
          adminId: payload.adminId,
          action: 'ADMIN_LOGOUT',
          ip: req.ip,
        });
      }
    } catch {
      // Ignore token verification errors during logout audit logging
    }
  }

  // Clear admin cookie
  const isProd = process.env.NODE_ENV === 'production';
  res.clearCookie(ADMIN_COOKIE_NAME, {
    httpOnly: true,
    secure: isProd,
    sameSite: (isProd ? 'none' : 'strict') as 'none' | 'strict',
    path: '/',
  });

  res.json({
    success: true,
    message: 'Logged out successfully',
  });
});

// GET /api/admin/auth/me - Protected, slides session cookie
adminAuthRouter.get('/me', adminAuthMiddleware, async (req: AuthenticatedAdminRequest, res: Response) => {
  const admin = req.admin!;

  // Slide session: re-issue fresh 15-minute token
  const freshToken = generateAdminAccessToken(admin);
  res.cookie(ADMIN_COOKIE_NAME, freshToken, getAdminCookieOptions());

  res.json({
    admin: {
      id: admin.id,
      email: admin.email,
      active: admin.active,
      createdAt: admin.createdAt,
      updatedAt: admin.updatedAt,
    },
  });
});

// GET /api/admin/auth/audit - Audit view
adminAuthRouter.get('/audit', adminAuthMiddleware, async (req: AuthenticatedAdminRequest, res: Response) => {
  const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string) || 50));
  const offset = Math.max(0, parseInt(req.query.offset as string) || 0);

  const { getDatabase } = await import('../db/client.js');
  const db = getDatabase();
  const logs = await db.listAdminAudit(limit, offset);

  res.json({
    logs,
    limit,
    offset,
  });
});

