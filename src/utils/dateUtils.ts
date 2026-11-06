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

/**
 * Returns a 'YYYY-MM-DD' formatted calendar date string from a Date object's local year, month, and date.
 * Prevents UTC timezone shift issues (such as local midnight rolling back to the previous day in UTC)
 * when constructing calendar month grids or handling local midnight dates.
 */
export function formatLocalDateKey(date: Date | string | number = new Date()): string {
  try {
    const d = typeof date === 'object' && date instanceof Date ? date : new Date(date);
    if (isNaN(d.getTime())) return '';
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  } catch {
    return '';
  }
}

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

/**
 * Safely formats any date, ISO timestamp, number, or string for HTML `<input type="date">` (`YYYY-MM-DD`).
 * Prevents browser console errors when full ISO timestamps (e.g. `2026-05-15T12:00:00.000Z`) are supplied.
 * Handles null, undefined, empty, and invalid dates safely by returning an empty string.
 */
export function toDateInputValue(val?: Date | string | number | null): string {
  if (!val) return '';
  if (typeof val === 'string') {
    const trimmed = val.trim();
    if (!trimmed) return '';
    // If it's already exactly YYYY-MM-DD
    if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
      return trimmed;
    }
    // Parse ISO timestamps or other date strings
    const d = new Date(trimmed);
    if (!isNaN(d.getTime())) {
      return getDhakaDateString(d);
    }
    // Fallback regex matching YYYY-MM-DD at the start
    const match = trimmed.match(/^(\d{4}-\d{2}-\d{2})/);
    return match ? match[1] : '';
  }
  if (val instanceof Date) {
    if (isNaN(val.getTime())) return '';
    return getDhakaDateString(val);
  }
  if (typeof val === 'number') {
    const d = new Date(val);
    if (isNaN(d.getTime())) return '';
    return getDhakaDateString(d);
  }
  return '';
}

/**
 * Safely formats any date, timestamp, or string for HTML `<input type="datetime-local">` (`YYYY-MM-DDTHH:mm`).
 * Handles null, undefined, and invalid values safely by returning an empty string.
 */
export function toDateTimeInputValue(val?: Date | string | number | null): string {
  if (!val) return '';
  const d = typeof val === 'object' && val instanceof Date ? val : new Date(val);
  if (isNaN(d.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/**
 * Checks whether a date or timestamp corresponds to midnight (00:00) in Bangladesh or UTC.
 * Used to omit redundant "00:00 AM" / "12:00 AM" timestamps on task cards.
 */
export function isDhakaMidnight(date: Date | string | number): boolean {
  try {
    const d = typeof date === 'object' && date instanceof Date ? date : new Date(date);
    if (isNaN(d.getTime())) return false;
    const s = d.toLocaleTimeString('en-US', {
      timeZone: BANGLADESH_TIMEZONE,
      hour12: false,
      hour: '2-digit',
      minute: '2-digit',
    });
    if (s === '00:00' || s === '24:00') return true;
    if (d.getUTCHours() === 0 && d.getUTCMinutes() === 0 && d.getUTCSeconds() === 0) return true;
    if (d.getHours() === 0 && d.getMinutes() === 0 && d.getSeconds() === 0) return true;
    return false;
  } catch {
    return false;
  }
}


