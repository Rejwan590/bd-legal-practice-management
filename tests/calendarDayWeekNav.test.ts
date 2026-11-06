import assert from 'node:assert';
import {
  parseLocalDateKey,
  formatLocalDateKey,
  getWeekDaysForDate,
  navigateDate,
  getCalendarRangeLabel,
} from '../src/utils/dateUtils';

let passed = 0;
let failed = 0;

function check(condition: boolean, message: string) {
  if (condition) {
    console.log(`[PASS] ${message}`);
    passed++;
  } else {
    console.error(`[FAIL] ${message}`);
    failed++;
  }
}

console.log(`\n=== RUNNING CALENDAR DAY & WEEK NAVIGATION TEST SUITE (TZ=${process.env.TZ || 'Default'}) ===\n`);

// Test 1: parseLocalDateKey and formatLocalDateKey roundtrip
const testDateStr = '2026-11-12';
const parsedDate = parseLocalDateKey(testDateStr);
check(formatLocalDateKey(parsedDate) === testDateStr, 'parseLocalDateKey -> formatLocalDateKey preserves exact YYYY-MM-DD');

// Test 2: getWeekDaysForDate - Sunday to Saturday (mid-month)
// 12 Nov 2026 is Thursday. Sunday of that week is 8 Nov, Saturday is 14 Nov.
const weekMidMonth = getWeekDaysForDate('2026-11-12');
check(weekMidMonth.length === 7, 'Week has exactly 7 days');
check(weekMidMonth[0].dateStr === '2026-11-08', 'Week starts on Sunday (2026-11-08)');
check(weekMidMonth[0].date.getDay() === 0, 'First day is Sunday (getDay() === 0)');
check(weekMidMonth[4].dateStr === '2026-11-12', 'Thursday index 4 matches anchor date (2026-11-12)');
check(weekMidMonth[6].dateStr === '2026-11-14', 'Week ends on Saturday (2026-11-14)');
check(weekMidMonth[6].date.getDay() === 6, 'Last day is Saturday (getDay() === 6)');

// Test 3: getWeekDaysForDate across Month Boundary
// 1 Dec 2026 is Tuesday. Week starts Sunday 29 Nov 2026, ends Saturday 5 Dec 2026.
const weekMonthBoundary = getWeekDaysForDate('2026-12-01');
check(weekMonthBoundary[0].dateStr === '2026-11-29', 'Month boundary week starts on Sunday 2026-11-29');
check(weekMonthBoundary[1].dateStr === '2026-11-30', 'Monday is 2026-11-30');
check(weekMonthBoundary[2].dateStr === '2026-12-01', 'Tuesday is 2026-12-01 (target month)');
check(weekMonthBoundary[6].dateStr === '2026-12-05', 'Month boundary week ends on Saturday 2026-12-05');

// Test 4: getWeekDaysForDate across Year Boundary
// 1 Jan 2027 is Friday. Week starts Sunday 27 Dec 2026, ends Saturday 2 Jan 2027.
const weekYearBoundary = getWeekDaysForDate('2027-01-01');
check(weekYearBoundary[0].dateStr === '2026-12-27', 'Year boundary week starts on Sunday 2026-12-27');
check(weekYearBoundary[5].dateStr === '2027-01-01', 'Friday is 2027-01-01 (New Year)');
check(weekYearBoundary[6].dateStr === '2027-01-02', 'Year boundary week ends on Saturday 2027-01-02');

// Test 5: navigateDate - Week view moves by 7 days
const navWeekNext = navigateDate('2026-11-12', 'week', 'next');
check(navWeekNext.newDateStr === '2026-11-19', 'Week next moves anchor forward by exactly 7 days');
const navWeekPrev = navigateDate('2026-11-12', 'week', 'prev');
check(navWeekPrev.newDateStr === '2026-11-05', 'Week prev moves anchor backward by exactly 7 days');

// Test 6: navigateDate - Day and Cause List move by 1 day
const navDayNext = navigateDate('2026-11-30', 'day', 'next');
check(navDayNext.newDateStr === '2026-12-01', 'Day next crosses month boundary correctly (30 Nov -> 1 Dec)');
const navDayPrev = navigateDate('2026-12-01', 'causelist', 'prev');
check(navDayPrev.newDateStr === '2026-11-30', 'Cause list prev crosses month boundary correctly (1 Dec -> 30 Nov)');
const navYearPrev = navigateDate('2027-01-01', 'day', 'prev');
check(navYearPrev.newDateStr === '2026-12-31', 'Day prev crosses year boundary correctly (1 Jan 2027 -> 31 Dec 2026)');

// Test 7: navigateDate - Month and Agenda move by 1 month
const navMonthNext = navigateDate('2026-11-15', 'month', 'next');
check(navMonthNext.newDateStr === '2026-12-15', 'Month next moves by 1 month (15 Nov -> 15 Dec)');
check(navMonthNext.newCurrentDate.getMonth() === 11, 'Month next updates newCurrentDate to December');

const navMonthPrev = navigateDate('2026-11-15', 'agenda', 'prev');
check(navMonthPrev.newDateStr === '2026-10-15', 'Agenda prev moves by 1 month (15 Nov -> 15 Oct)');

// Month clamping: 31 March -> 30 April
const navClamp = navigateDate('2026-03-31', 'month', 'next');
check(navClamp.newDateStr === '2026-04-30', 'Month next clamps to last day of month if target month is shorter (31 Mar -> 30 Apr)');

// Test 8: getCalendarRangeLabel
const labelMonth = getCalendarRangeLabel('2026-11-12', 'month', 'en');
check(labelMonth.includes('November') && labelMonth.includes('2026'), 'Month label contains November 2026');

const labelWeek = getCalendarRangeLabel('2026-11-12', 'week', 'en');
check(labelWeek.includes('8') && labelWeek.includes('14') && labelWeek.includes('2026'), 'Week label contains 8 Nov – 14 Nov 2026');

const labelWeekCrossMonth = getCalendarRangeLabel('2026-12-01', 'week', 'en');
check(labelWeekCrossMonth.includes('29') && labelWeekCrossMonth.includes('5'), 'Week label across months contains 29 Nov – 5 Dec 2026');

const labelDay = getCalendarRangeLabel('2026-11-12', 'day', 'en');
check(labelDay.includes('Thursday') && labelDay.includes('12') && labelDay.includes('2026'), 'Day label contains Thursday, 12 Nov 2026');

console.log(`\n========================================`);
console.log(`Navigation Tests: ${passed} passed, ${failed} failed`);
console.log(`========================================\n`);

if (failed > 0) {
  process.exit(1);
}
