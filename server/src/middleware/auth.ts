import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { getDatabase } from '../db/client.js';
import * as schema from '../db/schema.js';
import { getJwtSecret } from '../config.js';

export interface AuthenticatedRequest extends Request {
  user?: schema.User;
  firm?: schema.Firm;
}

export const ACCESS_TOKEN_EXPIRY = '15m';

export interface TokenPayload {
  userId: string;
  firmId: string;
  role: string;
  email: string;
}

export function generateAccessToken(user: schema.User): string {
  const secret = getJwtSecret();
  const payload: TokenPayload = {
    userId: user.id,
    firmId: user.firmId,
    role: user.role,
    email: user.email,
  };
  return jwt.sign(payload, secret, { expiresIn: ACCESS_TOKEN_EXPIRY });
}

const revokedTokens = new Set<string>();

export function revokeToken(token: string): void {
  revokedTokens.add(token);
}

export function isTokenRevoked(token: string): boolean {
  return revokedTokens.has(token);
}

export function clearRevokedTokens(): void {
  revokedTokens.clear();
}

export async function authMiddleware(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) {
  try {
    const token = req.cookies?.access_token;

    if (!token) {
      return res.status(401).json({
        error: 'Unauthorized',
        message: 'No active session or authorization token found.',
      });
    }

    if (isTokenRevoked(token)) {
      return res.status(401).json({
        error: 'Unauthorized',
        message: 'Session has been invalidated. Please log in again.',
      });
    }

    const secret = getJwtSecret();
    const payload = jwt.verify(token, secret) as TokenPayload & { type?: string };
    if (payload.type === 'platform_admin' || !payload.firmId || !payload.userId) {
      return res.status(401).json({
        error: 'Unauthorized',
        message: 'Platform admin token cannot be used for firm endpoints.',
      });
    }
    const db = getDatabase();

    const user = await db.getUserById(payload.userId);
    if (!user || !user.active) {
      return res.status(401).json({
        error: 'Unauthorized',
        message: 'User account is inactive or no longer exists.',
      });
    }

    const firm = await db.getFirm(user.firmId, true);
    if (!firm) {
      return res.status(401).json({
        error: 'Unauthorized',
        message: 'Chamber firm not found.',
      });
    }

    if (firm.deletedAt) {
      return res.status(403).json({
        error: 'Forbidden',
        code: 'FIRM_DELETED',
        message: 'Your chamber firm account has been deleted. Please contact support.',
      });
    }

    if (firm.status === 'suspended') {
      return res.status(403).json({
        error: 'Forbidden',
        code: 'FIRM_SUSPENDED',
        message: 'Your chamber firm account has been suspended. Please contact support.',
      });
    }

    if (firm.status === 'disabled') {
      return res.status(403).json({
        error: 'Forbidden',
        code: 'FIRM_DISABLED',
        message: 'Your chamber firm account has been disabled. Please contact support.',
      });
    }

    req.user = user;
    req.firm = firm;
    next();
  } catch (err: unknown) {
    if (err instanceof Error && err.name === 'TokenExpiredError') {
      return res.status(401).json({
        error: 'TokenExpired',
        message: 'Session token has expired. Please log in again.',
      });
    }
    return res.status(401).json({
      error: 'Unauthorized',
      message: 'Invalid authorization token.',
    });
  }
}

export const firmAuthMiddleware = authMiddleware;
