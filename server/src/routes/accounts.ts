import { Router, Response } from 'express';
import { authMiddleware, AuthenticatedRequest } from '../middleware/auth.js';
import { requirePermission } from '../middleware/permission.js';
import { enforceFirmIsolation } from '../middleware/firmIsolation.js';
import { getDatabase } from '../db/client.js';

export const accountsRouter = Router();

accountsRouter.use(authMiddleware);
accountsRouter.use(enforceFirmIsolation);

// GET /api/v1/accounts/summary - Financial balance & stats for client or case
accountsRouter.get(
  '/summary',
  requirePermission('accounts.view'),
  async (req: AuthenticatedRequest, res: Response) => {
    const db = getDatabase();
    const firmId = req.user!.firmId;

    const clientId = req.query.clientId as string | undefined;
    const caseId = req.query.caseId as string | undefined;

    // Validate visibility if clientId or caseId is specified
    if (clientId) {
      const client = await db.getClientById(clientId, firmId, req.user);
      if (!client || client.firmId !== firmId) {
        return res.status(404).json({ error: 'NotFound', message: 'Client not found or access denied' });
      }
    }

    if (caseId) {
      const caseRec = await db.getCaseById(caseId, firmId, req.user);
      if (!caseRec || caseRec.firmId !== firmId) {
        return res.status(404).json({ error: 'NotFound', message: 'Case not found or access denied' });
      }
    }

    const summary = await db.getAccountsSummary(firmId, { clientId, caseId }, req.user);
    res.json(summary);
  }
);

// GET /api/v1/accounts/client-balances - Client balances overview
accountsRouter.get(
  '/client-balances',
  requirePermission('accounts.view'),
  async (req: AuthenticatedRequest, res: Response) => {
    const db = getDatabase();
    const firmId = req.user!.firmId;

    const balances = await db.getClientBalancesOverview(firmId, req.user);
    res.json(balances);
  }
);
