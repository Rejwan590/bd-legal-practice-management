import { Router, Response } from 'express';
import { authMiddleware, AuthenticatedRequest } from '../middleware/auth.js';
import { requireOwner } from '../middleware/permission.js';
import { enforceFirmIsolation } from '../middleware/firmIsolation.js';
import { enforceSubscriptionReadOnly, evaluateServerSubscription } from '../middleware/subscription.js';
import { getDatabase } from '../db/client.js';
import { calculatePricing, calculateMonthlyPriceBdt } from '../utils/pricing.js';
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
  const approvedDeviceCount = await db.countApprovedDevices(firm.id);
  const users = await db.listUsers(firm.id);
  const activeUsersCount = users.filter((u) => !u.deletedAt && !(u as any).deactivatedAt).length;

  const responseData: any = {
    ...firm,
    maxUsers: firm.maxUsers,
    maxDevices: firm.maxDevices,
    subscription,
    userCount: activeUsersCount,
    deviceCount: approvedDeviceCount,
  };

  // Only Owner sees renewal amount and breakdown
  if (req.user?.role === 'Owner') {
    const plan = firm.planId ? await db.getPlan(firm.planId) : null;
    if (plan) {
      responseData.plan = plan;
      if (!firm.isTrial) {
        const pricing = calculateMonthlyPriceBdt(plan, firm);
        responseData.monthlyPriceBdt = pricing.monthlyTotal;
        responseData.renewalPriceBdt = pricing.termTotal;
        responseData.termTotal = pricing.termTotal;
        responseData.unit = pricing.unit;
        responseData.billingCycle = pricing.billingCycle;
        responseData.pricingBreakdown = pricing;
      }
    }
  }

  // Chamber settings privacy guard: Never show pricingNote or internal custom fields
  delete responseData.pricingNote;
  delete responseData.customBasePriceBdt;
  delete responseData.customAnnualPriceBdt;
  delete responseData.customExtraUserPriceBdt;
  delete responseData.customExtraDevicePriceBdt;

  if (firm.isTrial) {
    delete responseData.renewalPriceBdt;
    delete responseData.monthlyPriceBdt;
    delete responseData.termTotal;
    delete responseData.unit;
    delete responseData.pricingBreakdown;
  }

  res.json(responseData);
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

    const ALLOWED_FIELDS = ['name', 'officeAddress', 'courtAffiliations', 'barCouncilReg', 'visibilityMode'];
    const bodyKeys = Object.keys(req.body || {});
    const disallowed = bodyKeys.filter((k) => !ALLOWED_FIELDS.includes(k));
    if (disallowed.length > 0) {
      return res.status(400).json({
        error: 'BadRequest',
        message: `Disallowed fields in request body: ${disallowed.join(', ')}`,
        disallowed,
      });
    }

    const { name, officeAddress, courtAffiliations, barCouncilReg, visibilityMode } = req.body || {};
    if (visibilityMode !== undefined && visibilityMode !== 'open' && visibilityMode !== 'team') {
      return res.status(400).json({
        error: 'BadRequest',
        message: 'visibilityMode must be either "open" or "team"',
      });
    }
    const updates: Partial<schema.Firm> = {};
    if (name !== undefined) updates.name = name;
    if (officeAddress !== undefined) updates.officeAddress = officeAddress;
    if (courtAffiliations !== undefined) updates.courtAffiliations = courtAffiliations;
    if (barCouncilReg !== undefined) updates.barCouncilReg = barCouncilReg;
    if (visibilityMode !== undefined) updates.visibilityMode = visibilityMode;

    const oldValues = {
      name: currentFirm.name,
      officeAddress: currentFirm.officeAddress,
      courtAffiliations: currentFirm.courtAffiliations,
      barCouncilReg: currentFirm.barCouncilReg,
      visibilityMode: currentFirm.visibilityMode,
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

