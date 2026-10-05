import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { getDatabase } from '../db/client.js';
import * as schema from '../db/schema.js';
import { getAdminJwtSecret } from '../config.js';
import { isTokenRevoked } from './auth.js';

export const ADMIN_COOKIE_NAME = 'admin_access_token';
export const ADMIN_ACCESS_TOKEN_EXPIRY = '15m'; // 15 minute expiry
export const ADMIN_COOKIE_MAX_AGE_MS = 15 * 60 * 1000; // 15 minutes

export interface AdminTokenPayload {
  adminId: string;
  email: string;
  type: 'platform_admin';
}

export interface AuthenticatedAdminRequest extends Request {
  admin?: schema.PlatformAdmin;
}

export function generateAdminAccessToken(admin: schema.PlatformAdmin): string {
  const secret = getAdminJwtSecret();
  const payload: AdminTokenPayload = {
    adminId: admin.id,
    email: admin.email,
    type: 'platform_admin',
  };
  return jwt.sign(payload, secret, { expiresIn: ADMIN_ACCESS_TOKEN_EXPIRY });
}

export function getAdminCookieOptions() {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict' as const,
    maxAge: ADMIN_COOKIE_MAX_AGE_MS,
    path: '/',
  };
}

export async function adminAuthMiddleware(
  req: AuthenticatedAdminRequest,
  res: Response,
  next: NextFunction
) {
  try {
    const token = req.cookies?.[ADMIN_COOKIE_NAME];

    if (!token) {
      return res.status(401).json({
        error: 'Unauthorized',
        message: 'No active admin session found.',
      });
    }

    if (isTokenRevoked(token)) {
      return res.status(401).json({
        error: 'Unauthorized',
        message: 'Admin session has been invalidated. Please log in again.',
      });
    }

    const secret = getAdminJwtSecret();
    const payload = jwt.verify(token, secret) as AdminTokenPayload & { firmId?: string; userId?: string };

    // Explicitly reject firm user tokens or any non-platform_admin payload
    if (payload.type !== 'platform_admin' || payload.firmId || payload.userId || !payload.adminId) {
      return res.status(401).json({
        error: 'Unauthorized',
        message: 'Firm user tokens cannot be used for platform admin endpoints.',
      });
    }

    const db = getDatabase();
    const admin = await db.getPlatformAdminById(payload.adminId);
    if (!admin || !admin.active) {
      return res.status(401).json({
        error: 'Unauthorized',
        message: 'Platform admin account is inactive or no longer exists.',
      });
    }

    req.admin = admin;
    next();
  } catch (err: unknown) {
    if (err instanceof Error && err.name === 'TokenExpiredError') {
      return res.status(401).json({
        error: 'TokenExpired',
        message: 'Admin session token has expired. Please log in again.',
      });
    }
    return res.status(401).json({
      error: 'Unauthorized',
      message: 'Invalid platform admin authorization token.',
    });
  }
}
