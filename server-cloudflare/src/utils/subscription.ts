import * as schema from '../db/schema';

export const LICENSE_GRACE_PERIOD_DAYS = 5;

export interface SubscriptionEvaluation {
  status: 'active' | 'expiring_soon' | 'grace_period' | 'expired' | 'suspended';
  isReadOnly: boolean;
  daysRemaining: number;
  graceDaysRemaining: number;
  formattedExpiry: string;
  isExpired: boolean;
  isExpiringSoon: boolean;
  inGracePeriod: boolean;
  serverTime: string;
}

export function evaluateServerSubscription(firm: schema.Firm): SubscriptionEvaluation {
  const expiryDate = new Date(firm.licenseExpiresAt);
  const now = new Date();
  const formattedExpiry = Number.isNaN(expiryDate.getTime())
    ? String(firm.licenseExpiresAt)
    : expiryDate.toISOString().split('T')[0];

  if (firm.status === 'suspended' || firm.status === 'disabled') {
    return {
      status: 'suspended',
      isReadOnly: true,
      daysRemaining: 0,
      graceDaysRemaining: 0,
      formattedExpiry,
      isExpired: true,
      isExpiringSoon: false,
      inGracePeriod: false,
      serverTime: now.toISOString(),
    };
  }

  const diffMs = expiryDate.getTime() - now.getTime();
  const daysRemaining = Math.ceil(diffMs / (1000 * 60 * 60 * 24));

  if (daysRemaining > 0 && firm.status !== 'expired') {
    return {
      status: daysRemaining <= 14 ? 'expiring_soon' : 'active',
      isReadOnly: false,
      daysRemaining,
      graceDaysRemaining: LICENSE_GRACE_PERIOD_DAYS,
      formattedExpiry,
      isExpired: false,
      isExpiringSoon: daysRemaining <= 14,
      inGracePeriod: false,
      serverTime: now.toISOString(),
    };
  }

  const graceEndMs = expiryDate.getTime() + LICENSE_GRACE_PERIOD_DAYS * 24 * 60 * 60 * 1000;
  const graceDiffMs = graceEndMs - now.getTime();
  const graceDaysRemaining = Math.ceil(graceDiffMs / (1000 * 60 * 60 * 24));

  if (graceDaysRemaining > 0) {
    return {
      status: 'grace_period',
      isReadOnly: false,
      daysRemaining: 0,
      graceDaysRemaining: Math.min(LICENSE_GRACE_PERIOD_DAYS, Math.max(1, graceDaysRemaining)),
      formattedExpiry,
      isExpired: true,
      isExpiringSoon: false,
      inGracePeriod: true,
      serverTime: now.toISOString(),
    };
  }

  return {
    status: 'expired',
    isReadOnly: true,
    daysRemaining: 0,
    graceDaysRemaining: 0,
    formattedExpiry,
    isExpired: true,
    isExpiringSoon: false,
    inGracePeriod: false,
    serverTime: now.toISOString(),
  };
}
