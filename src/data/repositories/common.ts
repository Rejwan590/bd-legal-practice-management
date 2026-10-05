import { evaluateSubscription } from '../../permissions';
import { localStore } from '../mockStore';

export function generateUUID(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

/**
 * Enforces Rule 8 of ARCHITECTURE.md:
 * Expired subscription = read-only. Data stays viewable and exportable.
 * Throws an Error if the firm's subscription has expired and past the 5-day grace period,
 * or if it is suspended.
 */
export function assertNotReadOnly(firmId: string): void {
  const store = localStore.getData();
  const firm = store.firm;
  if (!firm || firm.id !== firmId) return;

  const sub = evaluateSubscription(firm.status, firm.licenseExpiresAt);
  if (sub.isReadOnly) {
    throw new Error(
      `Subscription expired: Chamber "${firm.name}" is in read-only mode (license expired on ${sub.formattedExpiry}). Adding or modifying records is disabled until renewal.`
    );
  }
}
