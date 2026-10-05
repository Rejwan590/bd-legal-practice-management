import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { getDatabase } from '../db/client.js';
import * as schema from '../db/schema.js';
import { getJwtSecret } from '../config.js';

import { hashDeviceKey } from '../services/deviceService.js';

export interface AuthenticatedRequest extends Request {
  user?: schema.User;
  firm?: schema.Firm;
  device?: schema.Device;
}

export const ACCESS_TOKEN_EXPIRY = '15m';

export interface TokenPayload {
  userId: string;
  firmId: string;
  role: string;
  email: string;
  deviceId?: string;
  deviceKeyHash?: string;
}

export function generateAccessToken(user: schema.User, device?: schema.Device): string {
  const secret = getJwtSecret();
  const payload: TokenPayload = {
    userId: user.id,
    firmId: user.firmId,
    role: user.role,
    email: user.email,
    deviceId: device?.id,
    deviceKeyHash: device?.deviceKeyHash,
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
      revokeToken(token);
      return res.status(403).json({
        error: 'Forbidden',
        code: 'FIRM_DELETED',
        message: 'Your chamber firm account has been deleted. Please contact support.',
      });
    }

    if (firm.status === 'suspended') {
      revokeToken(token);
      return res.status(403).json({
        error: 'Forbidden',
        code: 'FIRM_SUSPENDED',
        message: 'Your chamber firm account has been suspended. Please contact support.',
      });
    }

    if (firm.status === 'disabled') {
      revokeToken(token);
      return res.status(403).json({
        error: 'Forbidden',
        code: 'FIRM_DISABLED',
        message: 'Your chamber firm account has been disabled. Please contact support.',
      });
    }

    // Device authorization check (Web-app level browser install check)
    // Honest: A "device" is a browser install identified by random key cookie, not hardware.
    const rawDeviceKey = req.cookies?.device_key;
    const deviceKeyHash = rawDeviceKey ? hashDeviceKey(rawDeviceKey) : payload.deviceKeyHash;

    if (deviceKeyHash) {
      const device = await db.getDeviceByHash(deviceKeyHash);
      if (!device) {
        return res.status(403).json({
          error: 'Forbidden',
          code: 'DEVICE_NOT_FOUND',
          message: 'Device authorization record not found. Please log in again.',
        });
      }

      if (device.firmId !== user.firmId) {
        return res.status(403).json({
          error: 'Forbidden',
          code: 'DEVICE_FIRM_MISMATCH',
          message: 'Device does not belong to your chamber firm.',
        });
      }

      if (device.status === 'revoked') {
        revokeToken(token);
        return res.status(403).json({
          error: 'Forbidden',
          code: 'DEVICE_REVOKED',
          message: 'This device authorization has been revoked. Session terminated immediately.',
        });
      }

      if (device.status === 'rejected') {
        revokeToken(token);
        return res.status(403).json({
          error: 'Forbidden',
          code: 'DEVICE_REJECTED',
          message: 'This device registration has been rejected.',
        });
      }

      if (device.status === 'pending') {
        return res.status(403).json({
          error: 'Forbidden',
          code: 'DEVICE_PENDING',
          message: 'Device is waiting for admin approval before you can access chamber resources.',
        });
      }

      req.device = device;
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
