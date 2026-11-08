/**
 * Shared Date & Timezone Utilities for Admin App
 * Strictly formatted in Asia/Dhaka timezone.
 */

export const BANGLADESH_TIMEZONE = 'Asia/Dhaka';

const BN_DIGITS: Record<string, string> = {
  '0': '০', '1': '১', '2': '২', '3': '৩', '4': '৪',
  '5': '৫', '6': '৬', '7': '৭', '8': '৮', '9': '৯',
};

export function toBnDigits(str: string | number): string {
  return String(str).replace(/[0-9]/g, (d) => BN_DIGITS[d] || d);
}

export function getDhakaDateString(date: Date | string | number = new Date()): string {
  try {
    const d = typeof date === 'object' && date instanceof Date ? date : new Date(date);
    if (isNaN(d.getTime())) return '';
    return d.toLocaleDateString('en-CA', { timeZone: BANGLADESH_TIMEZONE });
  } catch {
    return '';
  }
}

/**
 * Shared formatter for license, expiry, and renewal dates across both Chamber and Admin apps.
 * Format: "08 Dec 2026" in Asia/Dhaka timezone with Bengali digits when locale === 'bn'.
 */
export function formatLicenseDate(
  date: Date | string | number | null | undefined,
  locale: 'en' | 'bn' = 'en'
): string {
  if (!date) return 'N/A';
  const d = typeof date === 'object' && date instanceof Date ? date : new Date(date);
  if (isNaN(d.getTime())) return 'N/A';

  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: BANGLADESH_TIMEZONE,
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(d);

  if (locale === 'bn') {
    return toBnDigits(parts);
  }
  return parts;
}

/**
 * Computes calendar days left until targetDate based strictly on Asia/Dhaka calendar dates.
 */
export function calculateDaysLeftDhaka(
  targetDate: Date | string | number | null | undefined,
  referenceDate: Date | string | number = new Date()
): number {
  if (!targetDate) return 0;
  const targetStr = getDhakaDateString(targetDate);
  const refStr = getDhakaDateString(referenceDate);
  if (!targetStr || !refStr) return 0;

  const [tY, tM, tD] = targetStr.split('-').map(Number);
  const [rY, rM, rD] = refStr.split('-').map(Number);
  const tUtc = Date.UTC(tY, tM - 1, tD);
  const rUtc = Date.UTC(rY, rM - 1, rD);

  return Math.round((tUtc - rUtc) / 86400000);
}
