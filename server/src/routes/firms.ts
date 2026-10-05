import { Router, Response } from 'express';
import { authMiddleware, AuthenticatedRequest } from '../middleware/auth.js';
import { requireOwner } from '../middleware/permission.js';
import { enforceFirmIsolation } from '../middleware/firmIsolation.js';
import { enforceSubscriptionReadOnly, evaluateServerSubscription } from '../middleware/subscription.js';
import { getDatabase } from '../db/client.js';
import * as schema from '../db/schema.js';
import { recordAudit } from '../services/auditService.js';

export const firmsRouter = Router();

firmsRouter.use(authMiddleware);
firmsRouter.use(enforceFirmIsolation);

// GET /api/v1/firms/current
firmsRouter.get('/current', async (req: AuthenticatedRequest, res: Response) => {
  const db = getDatabase();
  const firm = await db.getFirm(req.user!.firmId);
  if (!firm) {
    return res.status(404).json({ error: 'Firm not found' });
  }

  const subscription = evaluateServerSubscription(firm);
  res.json({
    ...firm,
    subscription,
  });
});

// PATCH /api/v1/firms/current - Owner-only, blocked if read-only
firmsRouter.patch(
  '/current',
  requireOwner(),
  enforceSubscriptionReadOnly,
  async (req: AuthenticatedRequest, res: Response) => {
    const db = getDatabase();
    const currentFirm = await db.getFirm(req.user!.firmId);
    if (!currentFirm) {
      return res.status(404).json({ error: 'Firm not found' });
    }

    const ALLOWED_FIELDS = ['name', 'officeAddress', 'courtAffiliations', 'barCouncilReg'];
    const bodyKeys = Object.keys(req.body || {});
    const disallowed = bodyKeys.filter((k) => !ALLOWED_FIELDS.includes(k));
    if (disallowed.length > 0) {
      return res.status(400).json({
        error: 'BadRequest',
        message: `Disallowed fields in request body: ${disallowed.join(', ')}`,
        disallowed,
      });
    }

    const { name, officeAddress, courtAffiliations, barCouncilReg } = req.body || {};
    const updates: Partial<schema.Firm> = {};
    if (name !== undefined) updates.name = name;
    if (officeAddress !== undefined) updates.officeAddress = officeAddress;
    if (courtAffiliations !== undefined) updates.courtAffiliations = courtAffiliations;
    if (barCouncilReg !== undefined) updates.barCouncilReg = barCouncilReg;

    const oldValues = {
      name: currentFirm.name,
      officeAddress: currentFirm.officeAddress,
      courtAffiliations: currentFirm.courtAffiliations,
      barCouncilReg: currentFirm.barCouncilReg,
    };

    const updated = await db.updateFirm(currentFirm.id, updates);

    // Write audit log row
    await recordAudit({
      firmId: req.user!.firmId,
      userId: req.user!.id,
      userName: req.user!.name,
      entity: 'Firm',
      entityId: updated.id,
      action: 'UPDATE_FIRM',
      oldValue: oldValues,
      newValue: updates,
    });

    const subscription = evaluateServerSubscription(updated);
    res.json({
      ...updated,
      subscription,
    });
  }
);

