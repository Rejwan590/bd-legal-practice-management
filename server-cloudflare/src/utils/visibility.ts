import * as schema from '../db/schema';
import { eq, and, isNull, or, inArray, sql } from 'drizzle-orm';

async function getSubordinateIds(db: any, firmId: string, rootUserId: string): Promise<string[]> {
  const firmUsers = await db
    .select({ id: schema.users.id, reportsToUserId: schema.users.reportsToUserId })
    .from(schema.users)
    .where(and(eq(schema.users.firmId, firmId), isNull(schema.users.deletedAt)));

  const childrenMap = new Map<string, string[]>();
  for (const u of firmUsers) {
    if (u.reportsToUserId) {
      const list = childrenMap.get(u.reportsToUserId) || [];
      list.push(u.id);
      childrenMap.set(u.reportsToUserId, list);
    }
  }

  const visited = new Set<string>([rootUserId]);
  const queue = [rootUserId];
  while (queue.length > 0) {
    const curr = queue.shift()!;
    for (const childId of childrenMap.get(curr) || []) {
      if (!visited.has(childId)) {
        visited.add(childId);
        queue.push(childId);
      }
    }
  }
  return Array.from(visited);
}

/**
 * Central Case Visibility Rule (`canUserSeeCase` / `getVisibleCaseIds`).
 */
export async function getVisibleCaseIds(db: any, firm: schema.Firm, user: schema.User): Promise<string[] | 'ALL'> {
  const perms = (Array.isArray(user.permissions) ? user.permissions : []) as string[];
  const isOwner = user.role === 'Owner' || perms.includes('*');
  const canViewRestricted = isOwner || perms.includes('restricted.view');

  if (isOwner) {
    return 'ALL';
  }

  const hasOpenOrViewAll = firm.visibilityMode === 'open' || perms.includes('cases.view_all');
  if (hasOpenOrViewAll && canViewRestricted) {
    return 'ALL';
  }

  const conditions = [eq(schema.cases.firmId, firm.id), isNull(schema.cases.deletedAt)];
  if (!canViewRestricted) {
    conditions.push(eq(schema.cases.restricted, false));
  }

  if (!hasOpenOrViewAll) {
    const allowedLawyerIds = await getSubordinateIds(db, firm.id, user.id);
    const shares = await db
      .select({ caseId: schema.caseShares.caseId })
      .from(schema.caseShares)
      .where(and(eq(schema.caseShares.firmId, firm.id), eq(schema.caseShares.userId, user.id), isNull(schema.caseShares.deletedAt)));
    const sharedCaseIds = shares.map((s: any) => s.caseId);

    conditions.push(
      or(
        inArray(schema.cases.responsibleLawyerId, allowedLawyerIds),
        sharedCaseIds.length > 0 ? inArray(schema.cases.id, sharedCaseIds) : sql`0=1`
      )!
    );
  }

  const rows = await db
    .select({ id: schema.cases.id })
    .from(schema.cases)
    .where(and(...conditions));

  return rows.map((r: any) => r.id);
}

export async function canUserSeeCaseId(
  db: any,
  firm: schema.Firm,
  user: schema.User,
  caseId: string
): Promise<boolean> {
  const visible = await getVisibleCaseIds(db, firm, user);
  if (visible === 'ALL') return true;
  return visible.includes(caseId);
}
