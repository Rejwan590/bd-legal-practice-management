import { Hono } from 'hono';
import { Env, authMiddleware } from '../middleware/auth';
import { getDb } from '../db/client';
import * as schema from '../db/schema';
import { eq, desc, and, isNull } from 'drizzle-orm';
import { getVisibleCaseIds } from '../utils/visibility';

export const auditRouter = new Hono<{ Bindings: Env; Variables: any }>();

auditRouter.use('*', authMiddleware);

// GET /api/v1/audit-log
auditRouter.get('/', async (c) => {
  const firm = c.get('firm') as schema.Firm;
  const user = c.get('user') as schema.User;
  const entity = c.req.query('entity');
  const action = c.req.query('action');
  const limit = Math.min(500, Math.max(1, parseInt(c.req.query('limit') || '100', 10)));
  const offset = Math.max(0, parseInt(c.req.query('offset') || '0', 10));

  const db = getDb(c.env.DB);
  const conditions = [eq(schema.auditLog.firmId, firm.id), isNull(schema.auditLog.deletedAt)];
  if (entity) conditions.push(eq(schema.auditLog.entity, entity));
  if (action) conditions.push(eq(schema.auditLog.action, action));

  const [rows, visibleCases] = await Promise.all([
    db
      .select()
      .from(schema.auditLog)
      .where(and(...conditions))
      .orderBy(desc(schema.auditLog.timestamp))
      .limit(limit)
      .offset(offset),
    getVisibleCaseIds(db, firm, user),
  ]);

  const filtered = rows.filter((log) => {
    if (visibleCases === 'ALL') return true;
    if (log.entity === 'Case' && !visibleCases.includes(log.entityId)) return false;
    const oldCaseId = (log.oldValue as any)?.caseId;
    const newCaseId = (log.newValue as any)?.caseId;
    if (oldCaseId && !visibleCases.includes(oldCaseId)) return false;
    if (newCaseId && !visibleCases.includes(newCaseId)) return false;
    return true;
  });

  return c.json(filtered);
});
