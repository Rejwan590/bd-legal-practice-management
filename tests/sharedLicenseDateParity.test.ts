import assert from 'node:assert';
import {
  formatLicenseDate as formatChamberDate,
  calculateDaysLeftDhaka as calcChamberDays,
} from '../src/utils/dateUtils';
import {
  formatLicenseDate as formatAdminDate,
  calculateDaysLeftDhaka as calcAdminDays,
} from '../admin-app/src/utils/dateUtils';

console.log('\n=== RUNNING SHARED LICENSE DATE & DAYS-LEFT PARITY TEST ===\n');

const testCases = [
  '2026-12-08T00:00:00.000Z',
  '2026-12-08T18:00:00.000Z',
  '2027-01-01T23:59:59.000Z',
  '2026-03-15',
  new Date('2026-11-30T10:00:00.000Z'),
];

const referenceDate = '2026-11-07T12:00:00.000Z';

let passed = 0;

for (const tc of testCases) {
  // 1. English format parity ("08 Dec 2026")
  const chamberEn = formatChamberDate(tc, 'en');
  const adminEn = formatAdminDate(tc, 'en');
  assert.strictEqual(chamberEn, adminEn, `En date mismatch for ${tc}: ${chamberEn} vs ${adminEn}`);
  console.log(`[PASS] English date parity verified: ${chamberEn}`);
  passed++;

  // 2. Bangla format parity ("০৮ Dec ২০২৬")
  const chamberBn = formatChamberDate(tc, 'bn');
  const adminBn = formatAdminDate(tc, 'bn');
  assert.strictEqual(chamberBn, adminBn, `Bn date mismatch for ${tc}: ${chamberBn} vs ${adminBn}`);
  console.log(`[PASS] Bengali date parity verified: ${chamberBn}`);
  passed++;

  // 3. Days left parity on Asia/Dhaka calendar dates
  const chamberDays = calcChamberDays(tc, referenceDate);
  const adminDays = calcAdminDays(tc, referenceDate);
  assert.strictEqual(chamberDays, adminDays, `Days left mismatch for ${tc}: ${chamberDays} vs ${adminDays}`);
  console.log(`[PASS] Days left parity verified: ${chamberDays} days`);
  passed++;
}

console.log(`\nAll ${passed} assertions PASSED! Both Chamber and Admin apps have 100% license date & days-left parity.\n`);
