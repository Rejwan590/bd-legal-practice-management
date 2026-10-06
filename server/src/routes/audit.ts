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
      // If not an integer (e.g. limit=abc), safely fall back to default 100
    }

    // Offset (default 0)
    let offset = 0;
    if (req.query.offset !== undefined) {
      const parsedOffset = Number(req.query.offset);
      if (Number.isInteger(parsedOffset) && parsedOffset >= 0) {
        offset = parsedOffset;
      }
    }

    const canSeeRestricted =
      req.user!.role === 'Owner' ||
      Boolean(req.user!.permissions && req.user!.permissions.includes('restricted.view'));
    const logs = await db.listAudit(req.user!.firmId, limit, offset, canSeeRestricted);

    res.json(logs);
  }
);
