import { Hono } from 'hono';
import { z } from 'zod';
import { Env, authMiddleware, enforceSubscriptionReadOnly, requireOwner } from '../middleware/auth';
import { getDb } from '../db/client';
import * as schema from '../db/schema';
import { eq } from 'drizzle-orm';
import { evaluateServerSubscription } from '../utils/subscription';
import { buildAuditEntry } from '../utils/audit';

export const firmsRouter = new Hono<{ Bindings: Env; Variables: any }>();

firmsRouter.use('*', authMiddleware);

// GET /api/v1/firms/current
firmsRouter.get('/current', (c) => {
  const firm = c.get('firm') as schema.Firm;
  const sanitizedFirm: Record<string, any> = {
    ...firm,
    subscription: evaluateServerSubscription(firm),
  };
  delete sanitizedFirm.pricingNote;
  delete sanitizedFirm.customBasePriceBdt;
  delete sanitizedFirm.customAnnualPriceBdt;
  delete sanitizedFirm.customExtraUserPriceBdt;
  delete sanitizedFirm.customExtraDevicePriceBdt;
  return c.json(sanitizedFirm);
});

// PATCH /api/v1/firms/current
firmsRouter.patch('/current', enforceSubscriptionReadOnly, requireOwner, async (c) => {
  const firm = c.get('firm') as schema.Firm;
  const user = c.get('user') as schema.User;
  const body = await c.req.json().catch(() => ({}));

  const updateSchema = z.object({
    name: z.string().min(2).max(160).optional(),
    barCouncilReg: z.string().nullable().optional(),
    officeAddress: z.string().nullable().optional(),
    courtAffiliations: z.string().nullable().optional(),
    contact: z.string().nullable().optional(),
    visibilityMode: z.enum(['open', 'team']).optional(),
  });

  const parse = updateSchema.safeParse(body);
  if (!parse.success) {
    return c.json({ error: 'Validation failed', errors: parse.error.issues }, 400);
  }

  const nowIso = new Date().toISOString();
  const updates = { ...parse.data, updatedAt: nowIso, updatedBy: user.id };
  const db = getDb(c.env.DB);

  await db.batch([
    db.update(schema.firms).set(updates).where(eq(schema.firms.id, firm.id)),
    db.insert(schema.auditLog).values(
      buildAuditEntry({
        firmId: firm.id,
        userId: user.id,
        userName: user.name,
        entity: 'Firm',
        entityId: firm.id,
        action: 'UPDATE',
        oldValue: {
          name: firm.name,
          barCouncilReg: firm.barCouncilReg,
          officeAddress: firm.officeAddress,
          contact: firm.contact,
          visibilityMode: firm.visibilityMode,
        },
        newValue: parse.data,
        now: nowIso,
      })
    ),
  ] as any);

  const updated: schema.Firm = { ...firm, ...updates };
  return c.json({
    ...updated,
    subscription: evaluateServerSubscription(updated),
  });
});
