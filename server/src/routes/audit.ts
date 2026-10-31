import { Router, Response } from 'express';
import { authMiddleware, AuthenticatedRequest } from '../middleware/auth.js';
import { requirePermission } from '../middleware/permission.js';
import { enforceFirmIsolation } from '../middleware/firmIsolation.js';
import { getDatabase } from '../db/client.js';

export const auditRouter = Router();

auditRouter.use(authMiddleware);
auditRouter.use(enforceFirmIsolation);

// GET /api/v1/audit-log - Only users with settings.manage can view audit log
auditRouter.get(
  '/',
  requirePermission('settings.manage'),
  async (req: AuthenticatedRequest, res: Response) => {
    const db = getDatabase();

    // Cap limit (1 to 500, default 100) and validate integer
    let limit = 100;
    if (req.query.limit !== undefined) {
      const parsedLimit = Number(req.query.limit);
      if (Number.isInteger(parsedLimit)) {
        if (parsedLimit < 1) {
          limit = 1;
        } else if (parsedLimit > 500) {
          limit = 500;
        } else {
          limit = parsedLimit;
        }
      }
    }

    // Offset (default 0)
    let offset = 0;
    if (req.query.offset !== undefined) {
      const parsedOffset = Number(req.query.offset);
      if (Number.isInteger(parsedOffset) && parsedOffset >= 0) {
        offset = parsedOffset;
      }
    }

    const entity =
      typeof req.query.entity === 'string' && req.query.entity.trim() !== ''
        ? req.query.entity.trim()
        : undefined;
    const action =
      typeof req.query.action === 'string' && req.query.action.trim() !== ''
        ? req.query.action.trim()
        : undefined;
    const userId =
      typeof req.query.userId === 'string' && req.query.userId.trim() !== ''
        ? req.query.userId.trim()
        : undefined;
    const startDate =
      typeof req.query.startDate === 'string' && req.query.startDate.trim() !== ''
        ? req.query.startDate.trim()
        : undefined;
    const endDate =
      typeof req.query.endDate === 'string' && req.query.endDate.trim() !== ''
        ? req.query.endDate.trim()
        : undefined;

    const canSeeRestricted =
      req.user!.role === 'Owner' ||
      Boolean(req.user!.permissions && req.user!.permissions.includes('restricted.view'));
    const logs = await db.listAudit(req.user!.firmId, limit, offset, canSeeRestricted, req.user, {
      entity,
      action,
      userId,
      startDate,
      endDate,
    });

    res.json(logs);
  }
);
