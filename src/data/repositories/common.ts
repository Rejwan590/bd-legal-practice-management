import { evaluateSubscription } from '../../permissions';
import { localStore } from '../mockStore';
import { AppointmentRecord } from '../types';

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

export interface AppointmentListFilter {
  status?: AppointmentRecord['status'] | 'all';
  type?: AppointmentRecord['type'] | 'all';
  range?: 'upcoming' | 'past' | 'all';
  fromDate?: string;
  toDate?: string;
  clientId?: string;
  caseId?: string;
  search?: string;
}

/**
 * Applies shared appointment list filters (status, type, range, date bounds, search)
 * so Mock and REST repositories maintain contract parity across Express and Cloudflare backends.
 */
export function applyAppointmentFilters(
  items: AppointmentRecord[],
  filter?: AppointmentListFilter,
  nowMs: number = Date.now()
): AppointmentRecord[] {
  let results = items;

  if (filter?.status && filter.status !== 'all') {
    results = results.filter((a) => a.status === filter.status);
  }
  if (filter?.type && filter.type !== 'all') {
    results = results.filter((a) => a.type === filter.type);
  }
  if (filter?.clientId) {
    results = results.filter((a) => a.clientId === filter.clientId);
  }
  if (filter?.caseId) {
    results = results.filter((a) => a.caseId === filter.caseId);
  }
  if (filter?.range === 'upcoming') {
    results = results.filter((a) => {
      const ts = new Date(a.endsAt || a.startsAt).getTime();
      return !isNaN(ts) && ts >= nowMs;
    });
  } else if (filter?.range === 'past') {
    results = results.filter((a) => {
      const ts = new Date(a.endsAt || a.startsAt).getTime();
      return !isNaN(ts) && ts < nowMs;
    });
  }
  if (filter?.fromDate) {
    const fromMs = new Date(filter.fromDate).getTime();
    if (!isNaN(fromMs)) {
      results = results.filter((a) => new Date(a.startsAt).getTime() >= fromMs);
    }
  }
  if (filter?.toDate) {
    const toMs = new Date(filter.toDate).getTime();
    if (!isNaN(toMs)) {
      results = results.filter((a) => new Date(a.startsAt).getTime() <= toMs);
    }
  }
  if (filter?.search && filter.search.trim()) {
    const q = filter.search.trim().toLowerCase();
    results = results.filter(
      (a) =>
        (a.title || '').toLowerCase().includes(q) ||
        (a.location && a.location.toLowerCase().includes(q)) ||
        (a.notes && a.notes.toLowerCase().includes(q))
    );
  }

  return results.sort(
    (a, b) => (new Date(a.startsAt).getTime() || 0) - (new Date(b.startsAt).getTime() || 0)
  );
}
