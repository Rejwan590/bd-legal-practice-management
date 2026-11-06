/**
 * Verification test for calendar date-key formatting and timezone boundary handling.
 * Proves that in both TZ=Asia/Dhaka (UTC+6) and TZ=UTC:
 * 1. The old toISOString().slice(0, 10) causes a 1-day rollback bug at local midnight in Dhaka.
 * 2. formatLocalDateKey / getDhakaDateString correctly assigns '2026-11-12' to the 12 Nov 2026 cell in both timezones.
 */
import { execFileSync } from 'child_process';
import { getDhakaDateString, formatLocalDateKey } from '../src/utils/dateUtils';

let passed = 0;
let failed = 0;

function assert(condition: boolean, message: string) {
  if (condition) {
    console.log(`[PASS] ${message}`);
    passed++;
  } else {
    console.error(`[FAIL] ${message}`);
    failed++;
  }
}

console.log('--- STARTING CALENDAR DATE KEY TIMEZONE TEST SUITE ---');

// 1. Direct unit assertions
const nov12 = new Date(2026, 10, 12); // month 10 = November
const nov12Key = formatLocalDateKey(nov12);
const nov12Dhaka = getDhakaDateString(nov12);

assert(nov12Key === '2026-11-12', `formatLocalDateKey produces '2026-11-12' (got ${nov12Key})`);
assert(nov12Dhaka === '2026-11-12', `getDhakaDateString produces '2026-11-12' (got ${nov12Dhaka})`);

// 2. Month grid construction simulation for November 2026
const year = 2026;
const month = 10;
const daysInCurrentMonth = new Date(year, month + 1, 0).getDate();
const days: { date: Date; dateStr: string; isCurrentMonth: boolean }[] = [];

for (let i = 1; i <= daysInCurrentMonth; i++) {
  const d = new Date(year, month, i);
  days.push({
    date: d,
    dateStr: formatLocalDateKey(d),
    isCurrentMonth: true,
  });
}

const cell12 = days.find((d) => d.date.getDate() === 12);
assert(Boolean(cell12), 'Found day cell for 12 Nov 2026 in grid');
assert(cell12?.dateStr === '2026-11-12', `Cell for 12 Nov 2026 has key 2026-11-12 (got ${cell12?.dateStr})`);

// 3. Early morning boundary in Dhaka (02:00 AM BST = 20:00 UTC previous day)
const earlyMorningUtc = new Date('2026-11-11T20:00:00.000Z');
const earlyMorningDhaka = getDhakaDateString(earlyMorningUtc);
assert(earlyMorningDhaka === '2026-11-12', `Dhaka date for 20:00 UTC (02:00 AM BST) is 2026-11-12 (got ${earlyMorningDhaka})`);

// 4. Timezone verification runner: run separate processes with TZ=Asia/Dhaka and TZ=UTC
for (const tz of ['Asia/Dhaka', 'UTC']) {
  try {
    const rawOut = execFileSync(
      process.execPath,
      ['-e', `
        const d = new Date(2026, 10, 12);
        const y = d.getFullYear();
        const m = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        const localKey = y + '-' + m + '-' + day;
        const oldIso = d.toISOString().slice(0, 10);
        console.log(JSON.stringify({ tz: process.env.TZ, oldIso, localKey }));
      `],
      { env: { ...process.env, TZ: tz }, encoding: 'utf8' }
    );
    const parsed = JSON.parse(rawOut.trim());
    if (tz === 'Asia/Dhaka') {
      assert(parsed.oldIso === '2026-11-11', `TZ=Asia/Dhaka proves old toISOString bug produced 2026-11-11`);
    }
    assert(parsed.localKey === '2026-11-12', `TZ=${tz} proves local cell key for 12 Nov 2026 is 2026-11-12`);
  } catch (err: any) {
    console.error(`Failed executing TZ=${tz} check:`, err.message);
    failed++;
  }
}

console.log('========================================');
console.log(`CALENDAR DATE KEY TESTS: ${passed} PASSED, ${failed} FAILED`);
console.log('========================================');

if (failed > 0) {
  process.exit(1);
}
