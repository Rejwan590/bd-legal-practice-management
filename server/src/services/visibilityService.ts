import { sql, SQL, and, or, eq, isNull } from 'drizzle-orm';
import * as schema from '../db/schema.js';

/**
 * Returns the set of subordinate user IDs that report directly or indirectly to the supervisor.
 */
export function getSubordinateUserIds(
  users: Array<{ id: string; reportsToUserId?: string | null; deletedAt?: Date | string | null }>,
  supervisorId: string
): Set<string> {
  const result = new Set<string>();
  const queue = [supervisorId];

  while (queue.length > 0) {
    const current = queue.shift()!;
    for (const u of users) {
      if (u.deletedAt) continue;
      if (u.reportsToUserId === current && !result.has(u.id)) {
        result.add(u.id);
        queue.push(u.id);
      }
    }
  }

  return result;
}

/**
 * Returns true if candidateSupervisorId is above userId in the reporting chain.
 */
export function isSupervisorOf(
  users: Array<{ id: string; reportsToUserId?: string | null; deletedAt?: Date | string | null }>,
  candidateSupervisorId: string,
  userId: string
): boolean {
  let current = userId;
  const visited = new Set<string>();

  while (current) {
    if (visited.has(current)) break;
    visited.add(current);

    const user = users.find((u) => u.id === current && !u.deletedAt);
    if (!user || !user.reportsToUserId) break;

    if (user.reportsToUserId === candidateSupervisorId) {
      return true;
    }
    current = user.reportsToUserId;
  }

  return false;
}

/**
 * Central Visibility evaluator for in-memory / object queries.
 */
export function canUserSeeCase(
  user: {
    id: string;
    firmId: string;
    role: string;
    permissions?: string[];
  },
  c: {
    id: string;
    firmId: string;
    responsibleLawyerId?: string | null;
    createdBy?: string | null;
    restricted?: boolean;
    deletedAt?: Date | string | null;
  },
  firm: {
    id: string;
    visibilityMode?: 'open' | 'team' | string;
  },
  users: Array<{ id: string; reportsToUserId?: string | null; deletedAt?: Date | string | null }>,
  activeCaseShares: Array<{ caseId: string; userId: string; deletedAt?: Date | string | null }> = [],
  includeDeleted = false
): boolean {
  if (c.firmId !== user.firmId) return false;
  if (!includeDeleted && c.deletedAt) return false;

  // Restricted check
  if (c.restricted) {
    const hasRestricted =
      user.role === 'Owner' || (user.permissions && user.permissions.includes('restricted.view'));
    if (!hasRestricted) return false;
  }

  // 1. Owner
  if (user.role === 'Owner') return true;

  // 2. Open mode
  if (firm.visibilityMode === 'open') return true;

  // 3. Responsible lawyer
  if (c.responsibleLawyerId && c.responsibleLawyerId === user.id) return true;

  // 4 & 5. Team hierarchy
  if (c.responsibleLawyerId) {
    // 4. Reports to responsible lawyer
    const subs = getSubordinateUserIds(users, c.responsibleLawyerId);
    if (subs.has(user.id)) return true;

    // 5. Supervisor above responsible lawyer
    if (isSupervisorOf(users, user.id, c.responsibleLawyerId)) return true;
  }

  // 6. Creator
  if (c.createdBy && c.createdBy === user.id) return true;

  // 7. Case share
  const isShared = activeCaseShares.some(
    (cs) => cs.caseId === c.id && cs.userId === user.id && !cs.deletedAt
  );
  if (isShared) return true;

  return false;
}

/**
 * Central Client Visibility evaluator for in-memory / object queries.
 * A user sees a client if:
 * 1. Owner
 * 2. Chamber visibility_mode === 'open'
 * 3. User created client (created_by === user.id)
 * 4. User can see at least one case of that client (via canUserSeeCase)
 * 5. Client has no cases and creator is in user's team hierarchy (subordinates, supervisors, or co-reports)
 */
export function canUserSeeClient(
  user: {
    id: string;
    firmId: string;
    role: string;
    permissions?: string[];
  },
  client: {
    id: string;
    firmId: string;
    createdBy?: string | null;
    deletedAt?: Date | string | null;
  },
  firm: {
    id: string;
    visibilityMode?: string;
  },
  firmUsers: Array<{ id: string; reportsToUserId?: string | null; deletedAt?: Date | string | null }>,
  allCases: Array<{
    id: string;
    firmId: string;
    clientId: string;
    responsibleLawyerId?: string | null;
    createdBy?: string | null;
    restricted?: boolean;
    deletedAt?: Date | string | null;
  }> = [],
  activeCaseShares: Array<{ caseId: string; userId: string; deletedAt?: Date | string | null }> = [],
  includeDeleted = false
): boolean {
  if (client.firmId !== user.firmId) return false;
  if (!includeDeleted && client.deletedAt) return false;

  // 1. Owner
  if (user.role === 'Owner') return true;

  // 2. Open mode
  if (firm.visibilityMode === 'open') return true;

  // 3. Creator
  if (client.createdBy && client.createdBy === user.id) return true;

  // 4. Can see at least one case of that client
  const clientCases = allCases.filter(
    (c) => c.clientId === client.id && c.firmId === user.firmId && (includeDeleted || !c.deletedAt)
  );

  for (const c of clientCases) {
    if (canUserSeeCase(user, c, firm, firmUsers, activeCaseShares, includeDeleted)) {
      return true;
    }
  }

  // 5. Client has no cases and creator is in user's team hierarchy (subordinates, supervisors, or co-reports)
  if (clientCases.length === 0 && client.createdBy) {
    const creatorId = client.createdBy;
    const subordinates = getSubordinateUserIds(firmUsers, user.id);
    if (subordinates.has(creatorId)) return true;

    if (isSupervisorOf(firmUsers, creatorId, user.id)) return true;

    const me = firmUsers.find((u) => u.id === user.id && !u.deletedAt);
    const creator = firmUsers.find((u) => u.id === creatorId && !u.deletedAt);
    if (
      me?.reportsToUserId &&
      creator?.reportsToUserId &&
      me.reportsToUserId === creator.reportsToUserId
    ) {
      return true;
    }
  }

  return false;
}

/**
 * Central Appointment Visibility evaluator for in-memory / object queries.
 * Rules: Visible to organiser, attendees, Owner, or anyone who can see linked case.
 * In open mode, all with appointments.view. Linked clients follow client visibility.
 */
export function canUserSeeAppointment(
  user: {
    id: string;
    firmId: string;
    role: string;
    permissions?: string[];
  },
  appt: {
    id: string;
    firmId: string;
    organiserUserId: string;
    caseId?: string | null;
    clientId?: string | null;
    deletedAt?: Date | string | null;
  },
  attendeeUserIds: string[],
  firm: {
    id: string;
    visibilityMode?: string;
  },
  firmUsers: Array<{ id: string; reportsToUserId?: string | null; deletedAt?: Date | string | null }>,
  allCases: Array<{
    id: string;
    firmId: string;
    clientId: string;
    responsibleLawyerId?: string | null;
    createdBy?: string | null;
    restricted?: boolean;
    deletedAt?: Date | string | null;
  }> = [],
  activeCaseShares: Array<{ caseId: string; userId: string; deletedAt?: Date | string | null }> = [],
  includeDeleted = false
): boolean {
  if (appt.firmId !== user.firmId) return false;
  if (!includeDeleted && appt.deletedAt) return false;

  // 1. Owner
  if (user.role === 'Owner') return true;

  // 2. Open mode
  if (firm.visibilityMode === 'open') return true;

  // 3. Organiser
  if (appt.organiserUserId === user.id) return true;

  // 4. Attendee
  if (attendeeUserIds.includes(user.id)) return true;

  // 5. Linked Case: central case visibility rule
  if (appt.caseId) {
    const linkedCase = allCases.find((c) => c.id === appt.caseId && c.firmId === user.firmId);
    if (linkedCase && canUserSeeCase(user, linkedCase, firm, firmUsers, activeCaseShares, includeDeleted)) {
      return true;
    }
  }

  // 6. Linked Client: if no case, but client is visible
  if (appt.clientId && !appt.caseId) {
    const clientVisible = canUserSeeClient(
      user,
      { id: appt.clientId, firmId: user.firmId },
      firm,
      firmUsers,
      allCases,
      activeCaseShares,
      includeDeleted
    );
    if (clientVisible) return true;
  }

  return false;
}

/**
 * Build SQL filter expression for Drizzle ORM queries on cases table.
 * ONE CENTRAL VISIBILITY RULE for PostgreSQL.
 */
export function buildCaseVisibilitySql(
  user: {
    id: string;
    firmId: string;
    role: string;
    permissions?: string[];
  },
  firm: {
    id: string;
    visibilityMode?: string;
  },
  firmUsers: Array<{ id: string; reportsToUserId?: string | null; deletedAt?: Date | string | null }>,
  includeDeleted = false
): SQL {
  const firmCondition = eq(schema.cases.firmId, user.firmId);
  const notDeleted = includeDeleted ? sql`true` : isNull(schema.cases.deletedAt);

  const canSeeRestricted =
    user.role === 'Owner' || (user.permissions && user.permissions.includes('restricted.view'));
  const restrictedCondition = canSeeRestricted ? sql`true` : eq(schema.cases.restricted, false);

  if (user.role === 'Owner' || firm.visibilityMode === 'open') {
    return and(firmCondition, notDeleted, restrictedCondition)!;
  }

  // Calculate lawyers who report to user (user is their supervisor)
  const subordinates = getSubordinateUserIds(firmUsers, user.id);

  // User's supervisor chain: find who user reports to
  const me = firmUsers.find((u) => u.id === user.id);

  // Allowed responsible lawyer IDs:
  // - Self
  // - Any subordinate (user is supervisor of responsible lawyer)
  // - Direct/chain supervisor (user reports to responsible lawyer)
  const allowedRespLawyerIds = new Set<string>();
  allowedRespLawyerIds.add(user.id);
  subordinates.forEach((id) => allowedRespLawyerIds.add(id));

  // Traverse upwards from user to add all supervisors user reports to
  let currentSup = me?.reportsToUserId;
  const visited = new Set<string>();
  while (currentSup) {
    if (visited.has(currentSup)) break;
    visited.add(currentSup);
    allowedRespLawyerIds.add(currentSup);
    const supUser = firmUsers.find((u) => u.id === currentSup);
    currentSup = supUser?.reportsToUserId || null;
  }

  const respLawyerArray = Array.from(allowedRespLawyerIds);

  const respLawyerCondition =
    respLawyerArray.length > 0
      ? sql`${schema.cases.responsibleLawyerId} IN (${sql.join(
          respLawyerArray.map((id) => sql`${id}`),
          sql`, `
        )})`
      : sql`false`;

  const creatorCondition = eq(schema.cases.createdBy, user.id);

  const shareCondition = sql`EXISTS (
    SELECT 1 FROM ${schema.caseShares}
    WHERE ${schema.caseShares.caseId} = ${schema.cases.id}
      AND ${schema.caseShares.userId} = ${user.id}
      AND ${schema.caseShares.firmId} = ${user.firmId}
      AND ${schema.caseShares.deletedAt} IS NULL
  )`;

  const visibilityCondition = or(respLawyerCondition, creatorCondition, shareCondition)!;

  return and(firmCondition, notDeleted, restrictedCondition, visibilityCondition)!;
}

/**
 * Build SQL filter expression for Drizzle ORM queries on clients table.
 * ONE CENTRAL CLIENT VISIBILITY RULE for PostgreSQL.
 */
export function buildClientVisibilitySql(
  user: {
    id: string;
    firmId: string;
    role: string;
    permissions?: string[];
  },
  firm: {
    id: string;
    visibilityMode?: string;
  },
  firmUsers: Array<{ id: string; reportsToUserId?: string | null; deletedAt?: Date | string | null }>,
  includeDeleted = false
): SQL {
  const firmCondition = eq(schema.clients.firmId, user.firmId);
  const notDeleted = includeDeleted ? sql`true` : isNull(schema.clients.deletedAt);

  if (user.role === 'Owner' || firm.visibilityMode === 'open') {
    return and(firmCondition, notDeleted)!;
  }

  // 3. User created client
  const createdCondition = eq(schema.clients.createdBy, user.id);

  // 4. At least one visible case of this client
  const caseVisibilitySql = buildCaseVisibilitySql(user, firm, firmUsers, false);
  const hasVisibleCaseCondition = sql`EXISTS (
    SELECT 1 FROM ${schema.cases}
    WHERE ${schema.cases.clientId} = ${schema.clients.id}
      AND ${schema.cases.firmId} = ${user.firmId}
      AND ${schema.cases.deletedAt} IS NULL
      AND (${caseVisibilitySql})
  )`;

  // 5. Client has no active cases AND creator is in team hierarchy (subordinates, supervisors, co-reports)
  const subordinates = getSubordinateUserIds(firmUsers, user.id);
  const teamMemberIds = new Set<string>();
  subordinates.forEach((id) => teamMemberIds.add(id));

  const me = firmUsers.find((u) => u.id === user.id);
  let currentSup = me?.reportsToUserId;
  const visited = new Set<string>();
  while (currentSup) {
    if (visited.has(currentSup)) break;
    visited.add(currentSup);
    teamMemberIds.add(currentSup);
    const supUser = firmUsers.find((u) => u.id === currentSup);
    currentSup = supUser?.reportsToUserId || null;
  }

  if (me?.reportsToUserId) {
    for (const u of firmUsers) {
      if (!u.deletedAt && u.reportsToUserId === me.reportsToUserId) {
        teamMemberIds.add(u.id);
      }
    }
  }

  const teamMembersArray = Array.from(teamMemberIds);
  const teamHierarchyCondition =
    teamMembersArray.length > 0
      ? sql`(${schema.clients.createdBy} IN (${sql.join(
          teamMembersArray.map((id) => sql`${id}`),
          sql`, `
        )}))`
      : sql`false`;

  const noCasesAndTeamCreator = sql`(
    NOT EXISTS (
      SELECT 1 FROM ${schema.cases}
      WHERE ${schema.cases.clientId} = ${schema.clients.id}
        AND ${schema.cases.firmId} = ${user.firmId}
        AND ${schema.cases.deletedAt} IS NULL
    )
    AND ${teamHierarchyCondition}
  )`;

  const visibilityCondition = or(createdCondition, hasVisibleCaseCondition, noCasesAndTeamCreator)!;
  return and(firmCondition, notDeleted, visibilityCondition)!;
}
