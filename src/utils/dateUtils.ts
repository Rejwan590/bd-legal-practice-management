/**
 * Bangladesh Legal Practice Management - Date & Timezone Utilities
 * 
 * In Bangladesh legal practice, court calendars, daily cause lists, and hearing dates
 * operate strictly on Bangladesh Standard Time (BST, UTC+6 / 'Asia/Dhaka').
 */

export const BANGLADESH_TIMEZONE = 'Asia/Dhaka';

/**
 * Returns a 'YYYY-MM-DD' formatted calendar date string in Bangladesh timezone ('Asia/Dhaka').
 * Uses the Canadian English ('en-CA') locale which guarantees standard ISO 8601 YYYY-MM-DD output.
 */
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
 * Checks whether two dates or ISO timestamps correspond to the same calendar day in Bangladesh.
 */
export function isSameDhakaDay(
  date1: Date | string | number,
  date2: Date | string | number = new Date()
): boolean {
  const d1Str = getDhakaDateString(date1);
  const d2Str = getDhakaDateString(date2);
  return Boolean(d1Str && d2Str && d1Str === d2Str);
}

/**
 * Returns a human-friendly formatted date for display in Bangladesh.
 */
export function formatDhakaDate(
  date: Date | string | number,
  locale: 'en' | 'bn' = 'en'
): string {
  try {
    const d = typeof date === 'object' && date instanceof Date ? date : new Date(date);
    if (isNaN(d.getTime())) return '';
    return d.toLocaleDateString(locale === 'bn' ? 'bn-BD' : 'en-GB', {
      timeZone: BANGLADESH_TIMEZONE,
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  } catch {
    return '';
  }
}
