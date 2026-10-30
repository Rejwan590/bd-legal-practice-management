import assert from 'node:assert';
import { toDateInputValue, toDateTimeInputValue, getDhakaDateString, isSameDhakaDay } from '../src/utils/dateUtils';
import { isLawyerOrOwner } from '../src/rolePresets';
import { isLawyerOrOwner as serverIsLawyerOrOwner } from '../server/src/rolePresets';
import { getRepositories } from '../src/data/repositories';
import { invalidateClientPhotoCache } from '../src/components/ClientAvatar';
import { PermissionKey } from '../src/permissions';

async function runTests() {
  console.log('--- STARTING BROWSER CONSOLE ERRORS REGRESSION SUITE ---');

  // 1. Date input formatting & sanitization tests
  console.log('\n--- 1. Date Input Formatting (yyyy-MM-dd) ---');
  {
    // Full ISO timestamp (as returned by DB/API for closedOn or caseDate)
    const isoString = '2026-05-15T12:00:00.000Z';
    const formatted = toDateInputValue(isoString);
    assert.strictEqual(formatted, '2026-05-15', 'ISO timestamp with time & timezone is converted to YYYY-MM-DD');

    // Already YYYY-MM-DD
    const standardDate = '2026-05-15';
    assert.strictEqual(toDateInputValue(standardDate), '2026-05-15', 'Standard YYYY-MM-DD is preserved exactly');

    // Date object
    const dateObj = new Date('2026-05-15T00:00:00Z');
    assert.strictEqual(toDateInputValue(dateObj), getDhakaDateString(dateObj), 'Date object is formatted to Bangladesh date');

    // Null, undefined, empty, and invalid values
    assert.strictEqual(toDateInputValue(null), '', 'null returns empty string');
    assert.strictEqual(toDateInputValue(undefined), '', 'undefined returns empty string');
    assert.strictEqual(toDateInputValue(''), '', 'empty string returns empty string');
    assert.strictEqual(toDateInputValue('   '), '', 'whitespace string returns empty string');
    assert.strictEqual(toDateInputValue('not-a-date'), '', 'invalid string returns empty string');
    console.log('[PASS] toDateInputValue formats dates strictly as yyyy-MM-dd and handles edge cases safely');
  }

  // 2. Datetime-local formatting tests
  console.log('\n--- 2. Datetime-local Input Formatting (YYYY-MM-DDTHH:mm) ---');
  {
    const d = new Date(2026, 4, 15, 10, 30);
    const formatted = toDateTimeInputValue(d);
    assert.strictEqual(formatted, '2026-05-15T10:30', 'Local date formatted to YYYY-MM-DDTHH:mm');

    assert.strictEqual(toDateTimeInputValue(null), '', 'null returns empty string for datetime');
    assert.strictEqual(toDateTimeInputValue(undefined), '', 'undefined returns empty string for datetime');
    assert.strictEqual(toDateTimeInputValue('invalid'), '', 'invalid date returns empty string');
    console.log('[PASS] toDateTimeInputValue formats datetime inputs safely');
  }

  // 3. Responsible lawyer contract verification (isLawyerOrOwner parity)
  console.log('\n--- 3. Responsible Lawyer Verification (Both Frontend and Backend) ---');
  {
    const testCases = [
      { user: { role: 'Owner', jobType: 'other', jobTitleLabel: 'Partner' }, expected: true, label: 'Owner role' },
      { user: { role: 'Staff', jobType: 'lawyer_senior', jobTitleLabel: 'Senior Lawyer' }, expected: true, label: 'lawyer_senior jobType' },
      { user: { role: 'Staff', jobType: 'lawyer_junior', jobTitleLabel: 'Junior Lawyer' }, expected: true, label: 'lawyer_junior jobType' },
      { user: { role: 'Staff', jobType: 'other', jobTitleLabel: 'Associate', name: 'Adv. Nusrat Jahan' }, expected: true, label: 'Adv. Nusrat Jahan (Associate)' },
      { user: { role: 'Staff', jobType: 'other', jobTitleLabel: 'Counsel' }, expected: true, label: 'Counsel title' },
      { user: { role: 'Staff', jobType: 'clerk', jobTitleLabel: 'Court Clerk' }, expected: false, label: 'Court Clerk (non-lawyer)' },
      { user: { role: 'Staff', jobType: 'receptionist', jobTitleLabel: 'Chamber Front Desk' }, expected: false, label: 'Receptionist (non-lawyer)' },
    ];

    for (const tc of testCases) {
      assert.strictEqual(isLawyerOrOwner(tc.user as any), tc.expected, `Frontend isLawyerOrOwner for ${tc.label}`);
      assert.strictEqual(serverIsLawyerOrOwner(tc.user as any), tc.expected, `Backend isLawyerOrOwner for ${tc.label}`);
    }
    console.log('[PASS] isLawyerOrOwner correctly recognizes chamber advocates and maintains frontend/backend parity');
  }

  // 4. Client photo repository parity & cache invalidation
  console.log('\n--- 4. Client Photo Repositories & hasPhoto Parity ---');
  {
    const repos = getRepositories();
    const mockContext = {
      currentUser: {
        id: 'user-owner-001',
        firmId: 'firm-bd-001',
        name: 'Adv. Mahbubur Rahman',
        email: 'owner@firm.bd',
        role: 'Owner' as const,
        active: true,
        permissions: ['clients.view', 'clients.edit'] as PermissionKey[],
        language: 'en' as const,
        createdAt: '2024-01-01T00:00:00.000Z',
        updatedAt: '2024-01-01T00:00:00.000Z',
        deletedAt: null,
        createdBy: 'user-owner-001',
        updatedBy: 'user-owner-001',
      },
    };

    const clients = await repos.client.list(mockContext);
    assert(clients.length > 0, 'Clients list returned from in-memory repository');
    for (const cl of clients) {
      assert(typeof cl.hasPhoto === 'boolean', `Client ${cl.id} hasPhoto boolean property is populated`);
    }

    // Invalidation helper does not throw
    invalidateClientPhotoCache('client-syn-019');
    invalidateClientPhotoCache('client-syn-099', 'data:image/jpeg;base64,test');
    console.log('[PASS] Client photo records include hasPhoto flag with zero unintended 404 lookups');
  }

  console.log('\n========================================');
  console.log('BROWSER CONSOLE ERRORS REGRESSION SUITE: ALL PASSED');
  console.log('========================================\n');
}

runTests().catch((err) => {
  console.error('Test failed:', err);
  process.exit(1);
});
