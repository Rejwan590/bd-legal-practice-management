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



/**
 * Safely parses a 'YYYY-MM-DD' calendar date key into a local Date at midnight.
 * Avoids any timezone shift or UTC rollback.
 */
export function parseLocalDateKey(dateStr: string): Date {
  const parts = dateStr.split('-');
  const y = parseInt(parts[0], 10) || 2026;
  const m = (parseInt(parts[1], 10) || 1) - 1;
  const d = parseInt(parts[2], 10) || 1;
  return new Date(y, m, d);
}

/**
 * Returns the 7 days of the calendar week (Sunday to Saturday) containing the given anchor date key.
 */
export function getWeekDaysForDate(dateStr: string): Array<{ date: Date; dateStr: string; dayIndex: number }> {
  const anchor = parseLocalDateKey(dateStr);
  const dayOfWeek = anchor.getDay(); // 0 = Sunday, 6 = Saturday
  const sunDate = new Date(anchor.getFullYear(), anchor.getMonth(), anchor.getDate() - dayOfWeek);
  const days: Array<{ date: Date; dateStr: string; dayIndex: number }> = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(sunDate.getFullYear(), sunDate.getMonth(), sunDate.getDate() + i);
    days.push({
      date: d,
      dateStr: formatLocalDateKey(d),
      dayIndex: i,
    });
  }
  return days;
}

/**
 * Navigates an anchor date based on the active calendar view mode.
 * - 'month' / 'agenda': moves by 1 month
 * - 'week': moves by 7 days
 * - 'day' / 'causelist': moves by 1 day
 */
export function navigateDate(
  dateStr: string,
  viewMode: 'month' | 'week' | 'day' | 'agenda' | 'causelist',
  direction: 'prev' | 'next'
): { newDateStr: string; newCurrentDate: Date } {
  const anchor = parseLocalDateKey(dateStr);
  const factor = direction === 'next' ? 1 : -1;

  if (viewMode === 'month' || viewMode === 'agenda') {
    const targetMonth = anchor.getMonth() + factor;
    const targetDate = new Date(anchor.getFullYear(), targetMonth + 1, 0);
    const maxDays = targetDate.getDate();
    const clampedDay = Math.min(anchor.getDate(), maxDays);
    const newDate = new Date(anchor.getFullYear(), targetMonth, clampedDay);
    return {
      newDateStr: formatLocalDateKey(newDate),
      newCurrentDate: new Date(newDate.getFullYear(), newDate.getMonth(), 1),
    };
  }

  if (viewMode === 'week') {
    const newDate = new Date(anchor.getFullYear(), anchor.getMonth(), anchor.getDate() + factor * 7);
    return {
      newDateStr: formatLocalDateKey(newDate),
      newCurrentDate: new Date(newDate.getFullYear(), newDate.getMonth(), 1),
    };
  }

  // 'day' or 'causelist'
  const newDate = new Date(anchor.getFullYear(), anchor.getMonth(), anchor.getDate() + factor);
  return {
    newDateStr: formatLocalDateKey(newDate),
    newCurrentDate: new Date(newDate.getFullYear(), newDate.getMonth(), 1),
  };
}

/**
 * Formats the calendar header range label according to the active view mode.
 * - Month / Agenda: "November 2026" / "নভেম্বর ২০২৬"
 * - Week: "8 Nov – 14 Nov 2026" / "৮ নভে – ১৪ নভে ২০২৬" (or across months/years)
 * - Day / Cause List: "Friday, 6 Nov 2026" / "শুক্রবার, ৬ নভে ২০২৬"
 */
export function getCalendarRangeLabel(
  dateStr: string,
  viewMode: 'month' | 'week' | 'day' | 'agenda' | 'causelist',
  locale: 'en' | 'bn' = 'en'
): string {
  const anchor = parseLocalDateKey(dateStr);
  const intlLocale = locale === 'bn' ? 'bn-BD' : 'en-GB';

  if (viewMode === 'month' || viewMode === 'agenda') {
    return anchor.toLocaleDateString(intlLocale, {
      month: 'long',
      year: 'numeric',
    });
  }

  if (viewMode === 'week') {
    const weekDays = getWeekDaysForDate(dateStr);
    const start = weekDays[0].date;
    const end = weekDays[6].date;
    const startDay = start.toLocaleDateString(intlLocale, { day: 'numeric' });
    const endDay = end.toLocaleDateString(intlLocale, { day: 'numeric' });
    const startMonth = start.toLocaleDateString(intlLocale, { month: 'short' });
    const endMonth = end.toLocaleDateString(intlLocale, { month: 'short' });
    const startYear = start.toLocaleDateString(intlLocale, { year: 'numeric' });
    const endYear = end.toLocaleDateString(intlLocale, { year: 'numeric' });

    if (start.getFullYear() !== end.getFullYear()) {
      return `${startDay} ${startMonth} ${startYear} – ${endDay} ${endMonth} ${endYear}`;
    }
    if (start.getMonth() !== end.getMonth()) {
      return `${startDay} ${startMonth} – ${endDay} ${endMonth} ${endYear}`;
    }
    return `${startDay} ${startMonth} – ${endDay} ${endMonth} ${endYear}`;
  }

  // 'day' | 'causelist'
  const weekday = anchor.toLocaleDateString(intlLocale, { weekday: 'long' });
  const day = anchor.toLocaleDateString(intlLocale, { day: 'numeric' });
  const month = anchor.toLocaleDateString(intlLocale, { month: 'short' });
  const year = anchor.toLocaleDateString(intlLocale, { year: 'numeric' });
  return `${weekday}, ${day} ${month} ${year}`;
}


const BN_DIGITS: Record<string, string> = {
  '0': '০', '1': '১', '2': '২', '3': '৩', '4': '৪',
  '5': '৫', '6': '৬', '7': '৭', '8': '৮', '9': '৯',
};

export function toBnDigits(str: string | number): string {
  return String(str).replace(/[0-9]/g, (d) => BN_DIGITS[d] || d);
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

/**
 * Safely converts a Date, timestamp, or date string to an ISO 8601 UTC string.
 * Returns null when the input is empty or invalid instead of throwing RangeError.
 */
export function toSafeIsoString(val?: Date | string | number | null): string | null {
  if (val === undefined || val === null || val === '') return null;
  const d = typeof val === 'object' && val instanceof Date ? val : new Date(val);
  if (isNaN(d.getTime())) return null;
  return d.toISOString();
}
