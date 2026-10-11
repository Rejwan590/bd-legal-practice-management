import { CaseRecord, SecurityContext } from './types';
import { localStore } from './mockStore';

/**
 * Returns the set of all user IDs that report directly or indirectly to the given supervisor.
 */
export function getSubordinateUserIds(
  users: Array<{ id: string; reportsToUserId?: string | null; deletedAt?: string | null }>,
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
 * Returns true if candidateSupervisorId is an ancestor (direct supervisor or higher in chain) of userId.
 */
export function isSupervisorOf(
  users: Array<{ id: string; reportsToUserId?: string | null; deletedAt?: string | null }>,
  candidateSupervisorId: string,
  userId: string
): boolean {
  let current = userId;
  const visited = new Set<string>();

  while (current) {
    if (visited.has(current)) break; // cycle protection
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
 * Evaluates whether a user can see a specific case according to the central visibility rule:
 * A user can see a case if:
 * 1. User is Owner; OR
 * 2. Chamber firm visibility_mode is 'open'; OR
 * 3. User is the responsible lawyer; OR
 * 4. User reports to the responsible lawyer (subordinate); OR
 * 5. User is above the responsible lawyer in the supervisor chain (supervisor); OR
 * 6. User created the case (c.createdBy === user.id); OR
 * 7. Case is shared with the user via active case_shares.
 *
 * RESTRICTED CASES:
 * If c.restricted is true, user additionally requires 'restricted.view' permission (or Owner role).
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
    deletedAt?: string | null;
  },
  firm: {
    id: string;
    visibilityMode?: 'open' | 'team' | string;
  },
  users: Array<{ id: string; reportsToUserId?: string | null; deletedAt?: string | null }>,
  activeCaseShares: Array<{ caseId: string; userId: string; deletedAt?: string | null }> = []
): boolean {
  // Must belong to same firm and not be deleted
  if (c.firmId !== user.firmId) return false;
  if (c.deletedAt) return false;

  // Restricted check: confidential cases additionally require restricted.view
  if (c.restricted) {
    const hasRestricted =
      user.role === 'Owner' || (user.permissions && user.permissions.includes('restricted.view'));
    if (!hasRestricted) return false;
  }

  // 1. Owner can see all matters (if restricted permission holds)
  if (user.role === 'Owner') return true;

  // 2. Open mode allows all firm users
  if (firm.visibilityMode === 'open') return true;

  // 3. User is the responsible lawyer
  if (c.responsibleLawyerId && c.responsibleLawyerId === user.id) return true;

  // 4 & 5. Team hierarchy linked to responsible lawyer
  if (c.responsibleLawyerId) {
    // 4. Reports to responsible lawyer?
    const subordinatesOfResp = getSubordinateUserIds(users, c.responsibleLawyerId);
    if (subordinatesOfResp.has(user.id)) return true;

    // 5. Supervisor above the responsible lawyer?
    if (isSupervisorOf(users, user.id, c.responsibleLawyerId)) return true;
  }

  // 6. Created the case
  if (c.createdBy && c.createdBy === user.id) return true;

  // 7. Case is shared with user
  const isShared = activeCaseShares.some(
    (cs) => cs.caseId === c.id && cs.userId === user.id && !cs.deletedAt
  );
  if (isShared) return true;

  return false;
}

/**
  * Filter an array of cases using the central visibility rule in the mock/in-memory layer.
  */
export function filterVisibleCases(
  contextOrUser:
    | SecurityContext
    | { id: string; firmId: string; role: string; permissions?: string[] },
  casesList: CaseRecord[],
  firmArg?: { id: string; visibilityMode?: 'open' | 'team' | string },
  usersArg?: Array<{ id: string; reportsToUserId?: string | null; deletedAt?: string | null }>,
  sharesArg?: Array<{ caseId: string; userId: string; deletedAt?: string | null }>
): CaseRecord[] {
  const currentUser =
    'currentUser' in contextOrUser ? contextOrUser.currentUser : contextOrUser;
  const store = localStore.getData();
  const firm = firmArg || store.firm;
  const allUsers = usersArg || store.users;
  const shares = sharesArg || store.caseShares || [];

  return casesList.filter((c) =>
    canUserSeeCase(currentUser, c, firm, allUsers, shares)
  );
}
