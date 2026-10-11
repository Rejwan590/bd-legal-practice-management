import { Response, NextFunction } from 'express';
import { AuthenticatedRequest } from './auth.js';

export function can(permission: string, user?: { role: string; permissions: string[]; active: boolean } | null): boolean {
  if (!user || !user.active) return false;
  if (user.role === 'Owner') return true;
  return user.permissions.includes(permission);
}

export function requirePermission(permission: string) {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Unauthorized', message: 'Authentication required' });
    }

    if (can(permission, req.user)) {
      return next();
    }

    return res.status(403).json({
      error: 'Forbidden',
      code: 'PERMISSION_DENIED',
      message: `Permission denied: '${permission}' required for this operation.`,
    });
  };
}

export function requireOwner() {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Unauthorized', message: 'Authentication required' });
    }

    if (req.user.role === 'Owner') {
      return next();
    }

    return res.status(403).json({
      error: 'Forbidden',
      code: 'OWNER_ONLY',
      message: 'This operation is restricted exclusively to chamber Owners.',
    });
  };
}

export function requireOwnerOrUsersManage() {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Unauthorized', message: 'Authentication required' });
    }

    if (can('users.manage', req.user)) {
      return next();
    }

    return res.status(403).json({
      error: 'Forbidden',
      code: 'OWNER_ONLY',
      message: 'This operation requires Owner role or users.manage permission.',
    });
  };
}
