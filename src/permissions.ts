/**
 * Central Permission Definition & Authorization Engine
 * Follows ARCHITECTURE.md specifications
 */

export type PermissionKey =
  | 'cases.view'
  | 'cases.create'
  | 'cases.edit'
  | 'cases.delete'
  | 'hearings.update'
  | 'clients.view'
  | 'clients.edit'
  | 'tasks.view'
  | 'tasks.assign'
  | 'tasks.complete'
  | 'files.view'
  | 'files.manage'
  | 'billing.view'
  | 'settings.manage'
  | 'users.manage'
  | 'restricted.view'
  | 'data.export';

export type UserRole = 'Owner' | 'Staff';

export interface UserPermissionProfile {
  id: string;
  firmId: string;
  name: string;
  email: string;
  role: UserRole;
  permissions: PermissionKey[];
  language: 'en' | 'bn';
  active: boolean;
}

export const ALL_PERMISSIONS: PermissionKey[] = [
  'cases.view',
  'cases.create',
  'cases.edit',
  'cases.delete',
  'hearings.update',
  'clients.view',
  'clients.edit',
  'tasks.view',
  'tasks.assign',
  'tasks.complete',
  'files.view',
  'files.manage',
  'billing.view',
  'settings.manage',
  'users.manage',
  'restricted.view',
  'data.export',
];

export const DEFAULT_STAFF_PERMISSIONS: PermissionKey[] = [
  'cases.view',
  'hearings.update',
  'clients.view',
  'tasks.view',
  'tasks.complete',
  'files.view',
];

/**
 * Single authorization helper used throughout the application.
 * Both UI components and repository methods must check this.
 */
export function can(
  permission: PermissionKey,
  user?: UserPermissionProfile | null
): boolean {
  if (!user || !user.active) {
    return false;
  }

  // Owner always has all permissions
  if (user.role === 'Owner') {
    return true;
  }

  // Staff has explicit subset
  return user.permissions.includes(permission);
}

export const LICENSE_GRACE_PERIOD_DAYS = 5;

export type SubscriptionStatus =
  | 'active'
  | 'expiring_soon'
  | 'grace_period'
  | 'expired'
  | 'suspended';

export interface SubscriptionEvaluation {
  status: SubscriptionStatus;
  isReadOnly: boolean;
  daysRemaining: number;
  graceDaysRemaining: number;
  formattedExpiry: string;
  isExpired: boolean;
  isExpiringSoon: boolean;
  inGracePeriod: boolean;
}

/**
 * Evaluates subscription status and enforces Rule 8:
 * - Active / Expiring soon: normal operations.
 * - 5-day Grace period after licenseExpiresAt: app works normally with a red grace banner.
 * - After grace period or suspended: read-only mode applies.
 */
export function evaluateSubscription(
  status: 'active' | 'expired' | 'suspended',
  licenseExpiresAt: string
): SubscriptionEvaluation {
  const expiryDate = new Date(licenseExpiresAt);
  const now = new Date();
  const formattedExpiry = expiryDate.toLocaleDateString();

  if (status === 'suspended') {
    return {
      status: 'suspended',
      isReadOnly: true,
      daysRemaining: 0,
      graceDaysRemaining: 0,
      formattedExpiry,
      isExpired: true,
      isExpiringSoon: false,
      inGracePeriod: false,
    };
  }

  const diffMs = expiryDate.getTime() - now.getTime();
  const daysRemaining = Math.ceil(diffMs / (1000 * 60 * 60 * 24));

  // If before expiry:
  if (daysRemaining > 0 && status !== 'expired') {
    if (daysRemaining <= 14) {
      return {
        status: 'expiring_soon',
        isReadOnly: false,
        daysRemaining,
        graceDaysRemaining: LICENSE_GRACE_PERIOD_DAYS,
        formattedExpiry,
        isExpired: false,
        isExpiringSoon: true,
        inGracePeriod: false,
      };
    }

    return {
      status: 'active',
      isReadOnly: false,
      daysRemaining,
      graceDaysRemaining: LICENSE_GRACE_PERIOD_DAYS,
      formattedExpiry,
      isExpired: false,
      isExpiringSoon: false,
      inGracePeriod: false,
    };
  }

  // If licenseExpiresAt is in the past: calculate grace period
  const graceEndMs = expiryDate.getTime() + LICENSE_GRACE_PERIOD_DAYS * 24 * 60 * 60 * 1000;
  const graceDiffMs = graceEndMs - now.getTime();
  const graceDaysRemaining = Math.ceil(graceDiffMs / (1000 * 60 * 60 * 24));

  if (graceDaysRemaining > 0) {
    // 5-day grace period: app works normally but shows red grace banner
    return {
      status: 'grace_period',
      isReadOnly: false,
      daysRemaining: 0,
      graceDaysRemaining: Math.min(LICENSE_GRACE_PERIOD_DAYS, Math.max(1, graceDaysRemaining)),
      formattedExpiry,
      isExpired: true,
      isExpiringSoon: false,
      inGracePeriod: true,
    };
  }

  // After grace period: read-only mode applies
  return {
    status: 'expired',
    isReadOnly: true,
    daysRemaining: 0,
    graceDaysRemaining: 0,
    formattedExpiry,
    isExpired: true,
    isExpiringSoon: false,
    inGracePeriod: false,
  };
}

