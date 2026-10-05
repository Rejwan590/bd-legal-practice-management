import { Response, NextFunction } from 'express';
import { AuthenticatedRequest } from './auth.js';

export function enforceFirmIsolation(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) {
  if (!req.user || !req.firm) {
    return next();
  }

  // If request specifies a firmId parameter, ensure it matches authenticated user's firmId
  const requestedFirmId = req.params?.firmId || req.body?.firmId || req.query?.firmId;

  if (requestedFirmId && requestedFirmId !== req.user.firmId) {
    return res.status(403).json({
      error: 'Forbidden',
      code: 'FIRM_ISOLATION_VIOLATION',
      message: 'Access denied: Cannot access or modify data belonging to another chamber.',
    });
  }

  next();
}
