import { Router, Response } from 'express';
import { z } from 'zod';
import { adminAuthMiddleware, AuthenticatedAdminRequest } from '../middleware/adminAuth.js';
import { getDatabase } from '../db/client.js';
import { recordAdminAudit } from '../services/adminAuditService.js';

export const adminPlansRouter = Router();

// All routes require platform super admin authentication
adminPlansRouter.use(adminAuthMiddleware);

const updatePlanSchema = z.object({
  includedUsers: z.number().int().min(1).max(500).optional(),
  includedDevices: z.number().int().min(1).max(500).optional(),
  extraUserPriceBdt: z.number().int().min(0).max(100000).optional(),
  extraDevicePriceBdt: z.number().int().min(0).max(100000).optional(),
}).strict();

// 1. GET / - List all plans
adminPlansRouter.get('/', async (req: AuthenticatedAdminRequest, res: Response) => {
  const db = getDatabase();
  const plans = await db.listPlans();
  return res.status(200).json({ plans });
});

// 2. GET /:id - Get plan by ID
adminPlansRouter.get('/:id', async (req: AuthenticatedAdminRequest, res: Response) => {
  const db = getDatabase();
  const plan = await db.getPlan(req.params.id);
  if (!plan) {
    return res.status(404).json({ error: 'NotFound', message: `Plan ${req.params.id} not found` });
  }
  return res.status(200).json({ plan });
});

// 3. PATCH /:id - Update plan seat and device parameters
adminPlansRouter.patch('/:id', async (req: AuthenticatedAdminRequest, res: Response) => {
  const parseResult = updatePlanSchema.safeParse(req.body);
  if (!parseResult.success) {
    return res.status(400).json({
      error: 'BadRequest',
      message: 'Invalid plan update payload',
      issues: parseResult.error.issues,
    });
  }

  const db = getDatabase();
  const plan = await db.getPlan(req.params.id);
  if (!plan) {
    return res.status(404).json({ error: 'NotFound', message: `Plan ${req.params.id} not found` });
  }

  const oldValues = {
    includedUsers: plan.includedUsers,
    includedDevices: plan.includedDevices,
    extraUserPriceBdt: plan.extraUserPriceBdt,
    extraDevicePriceBdt: plan.extraDevicePriceBdt,
  };

  const updates = parseResult.data;
  const updatedPlan = await db.updatePlan(plan.id, updates);

  await recordAdminAudit({
    adminId: req.admin!.id,
    action: 'PLAN_UPDATE',
    targetFirmId: null,
    old: oldValues,
    new: updates,
    ip: req.ip,
  });

  return res.status(200).json({
    message: 'Plan updated successfully',
    plan: updatedPlan,
  });
});
