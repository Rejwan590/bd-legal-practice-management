import { Router, Response } from 'express';
import crypto from 'node:crypto';
import { z } from 'zod';
import { adminAuthMiddleware, AuthenticatedAdminRequest } from '../middleware/adminAuth.js';
import { getDatabase } from '../db/client.js';
import { recordAdminAudit } from '../services/adminAuditService.js';

export const adminPlansRouter = Router();

// All routes require platform super admin authentication
adminPlansRouter.use(adminAuthMiddleware);

const createPlanSchema = z.object({
  id: z
    .string()
    .trim()
    .min(1)
    .max(64)
    .regex(/^[a-z0-9_-]+$/i, 'Plan ID must be alphanumeric with hyphens or underscores')
    .optional(),
  name: z.string().trim().min(1).max(100),
  priceBdt: z.number().int().min(0),
  includedUsers: z.number().int().min(1).max(500),
  includedDevices: z.number().int().min(1).max(500),
  extraUserPriceBdt: z.number().int().min(0).max(100000),
  extraDevicePriceBdt: z.number().int().min(0).max(100000),
  durationMonths: z.number().int().min(1).max(36).default(12),
  features: z.array(z.string()).optional(),
}).strict();

const updatePlanSchema = z.object({
  name: z.string().trim().min(1).max(100).optional(),
  priceBdt: z.number().int().min(0).optional(),
  includedUsers: z.number().int().min(1).max(500).optional(),
  includedDevices: z.number().int().min(1).max(500).optional(),
  extraUserPriceBdt: z.number().int().min(0).max(100000).optional(),
  extraDevicePriceBdt: z.number().int().min(0).max(100000).optional(),
  durationMonths: z.number().int().min(1).max(36).optional(),
  status: z.enum(['active', 'archived']).optional(),
  features: z.array(z.string()).optional(),
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

// 3. POST / - Create a new plan
adminPlansRouter.post('/', async (req: AuthenticatedAdminRequest, res: Response) => {
  const parseResult = createPlanSchema.safeParse(req.body);
  if (!parseResult.success) {
    return res.status(400).json({
      error: 'BadRequest',
      message: 'Invalid plan creation payload',
      issues: parseResult.error.issues,
    });
  }

  const data = parseResult.data;
  const db = getDatabase();

  const generatedSlug = data.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
  const planId = data.id || (generatedSlug ? generatedSlug : `plan-${crypto.randomUUID()}`);

  const existing = await db.getPlan(planId);
  if (existing) {
    return res.status(409).json({ error: 'Conflict', message: `Plan with ID ${planId} already exists` });
  }

  const now = new Date();
  const newPlan = await db.insertPlan({
    id: planId,
    name: data.name,
    priceBdt: data.priceBdt,
    durationMonths: data.durationMonths,
    seats: data.includedUsers,
    includedUsers: data.includedUsers,
    includedDevices: data.includedDevices,
    extraUserPriceBdt: data.extraUserPriceBdt,
    extraDevicePriceBdt: data.extraDevicePriceBdt,
    status: 'active',
    features: data.features ?? ['cases', 'hearings', 'tasks', 'files', 'calendar', 'backup', 'audit'],
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
    createdBy: req.admin!.id,
    updatedBy: req.admin!.id,
  });

  await recordAdminAudit({
    adminId: req.admin!.id,
    action: 'PLAN_CREATE',
    targetFirmId: null,
    old: null,
    new: newPlan,
    ip: req.ip,
  });

  return res.status(201).json({
    message: 'Plan created successfully',
    plan: newPlan,
  });
});

// 4. PATCH /:id - Update plan parameters or soft-archive
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
    name: plan.name,
    priceBdt: plan.priceBdt,
    durationMonths: plan.durationMonths,
    status: plan.status,
    includedUsers: plan.includedUsers,
    includedDevices: plan.includedDevices,
    extraUserPriceBdt: plan.extraUserPriceBdt,
    extraDevicePriceBdt: plan.extraDevicePriceBdt,
    features: plan.features,
  };

  const updates: any = { ...parseResult.data };
  if (updates.includedUsers !== undefined) {
    updates.seats = updates.includedUsers;
  }
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
