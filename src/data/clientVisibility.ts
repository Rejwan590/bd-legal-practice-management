import { ClientRecord, CaseRecord, SecurityContext } from './types';
import { localStore } from './mockStore';
import { canUserSeeCase, getSubordinateUserIds, isSupervisorOf } from './caseVisibility';

/**
 * Central Client Visibility evaluator for frontend mock/in-memory layer.
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
    deletedAt?: string | null;
  },
  firm: {
    id: string;
    visibilityMode?: 'open' | 'team' | string;
  },
  users: Array<{ id: string; reportsToUserId?: string | null; deletedAt?: string | null }>,
  allCases: CaseRecord[] = [],
  activeCaseShares: Array<{ caseId: string; userId: string; deletedAt?: string | null }> = []
): boolean {
  if (client.firmId !== user.firmId) return false;
  if (client.deletedAt) return false;

  // 1. Owner
  if (user.role === 'Owner') return true;

  // 2. Open mode
  if (firm.visibilityMode === 'open') return true;

  // 3. Creator
  if (client.createdBy && client.createdBy === user.id) return true;

  // 4. Can see at least one case of that client
  const clientCases = allCases.filter(
    (c) => c.clientId === client.id && c.firmId === user.firmId && !c.deletedAt
  );

  for (const c of clientCases) {
    if (canUserSeeCase(user, c, firm, users, activeCaseShares)) {
      return true;
    }
  }

  // 5. Client has no cases and creator is in user's team hierarchy (subordinates, supervisors, or co-reports)
  if (clientCases.length === 0 && client.createdBy) {
    const creatorId = client.createdBy;
    const subordinates = getSubordinateUserIds(users, user.id);
    if (subordinates.has(creatorId)) return true;

    if (isSupervisorOf(users, creatorId, user.id)) return true;

    const me = users.find((u) => u.id === user.id && !u.deletedAt);
    const creator = users.find((u) => u.id === creatorId && !u.deletedAt);
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
 * Filter an array of clients using the central client visibility rule in the mock layer.
 */
export function filterVisibleClients(
  contextOrUser:
    | SecurityContext
    | { id: string; firmId: string; role: string; permissions?: string[] },
  clientsList: ClientRecord[],
  firmArg?: { id: string; visibilityMode?: 'open' | 'team' | string },
  usersArg?: Array<{ id: string; reportsToUserId?: string | null; deletedAt?: string | null }>,
  casesArg?: CaseRecord[],
  sharesArg?: Array<{ caseId: string; userId: string; deletedAt?: string | null }>
): ClientRecord[] {
  const currentUser =
    'currentUser' in contextOrUser ? contextOrUser.currentUser : contextOrUser;
  const store = localStore.getData();
  const firm = firmArg || store.firm;
  const allUsers = usersArg || store.users;
  const allCases = casesArg || store.cases;
  const shares = sharesArg || store.caseShares || [];

  return clientsList.filter((c) =>
    canUserSeeClient(currentUser, c, firm, allUsers, allCases, shares)
  );
}
