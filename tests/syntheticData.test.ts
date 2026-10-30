import { generateSyntheticDataset, SYNTHETIC_FIRM_ID, OWNER_USER_ID, STAFF_USER_ID } from '../src/data/syntheticData';
import { localStore } from '../src/data/mockStore';

async function runTests() {
  console.log('--- STARTING SYNTHETIC CLIENTS & PRACTICE DATA TEST SUITE ---');

  let passed = 0;
  let failed = 0;

  function assert(condition: boolean, name: string, details?: string) {
    if (condition) {
      console.log(`[PASS] ${name}`);
      passed++;
    } else {
      console.error(`[FAIL] ${name} ${details ? '- ' + details : ''}`);
      failed++;
    }
  }

  const dataset = generateSyntheticDataset();

  // 1. Client Dataset Volume & Firm Isolation
  assert(dataset.clients.length === 100, 'Exactly 100 synthetic clients generated', `Got ${dataset.clients.length}`);
  const allFirmIsolated = dataset.clients.every((c) => c.firmId === SYNTHETIC_FIRM_ID);
  assert(allFirmIsolated, 'All synthetic clients strictly isolated to firm-bd-001');

  // 2. Uniqueness of Client IDs and Phone Numbers
  const clientIds = new Set(dataset.clients.map((c) => c.id));
  assert(clientIds.size === 100, 'All 100 synthetic client IDs are strictly unique');
  const phones = new Set(dataset.clients.map((c) => c.phone));
  assert(phones.size === 100, 'All 100 client phone numbers are unique');

  // 3. Required Fields Validity
  const allRequiredValid = dataset.clients.every(
    (c) =>
      Boolean(c.id) &&
      Boolean(c.name && c.name.trim()) &&
      Boolean(c.phone && c.phone.startsWith('+880 1700-')) &&
      Boolean(c.address && c.address.trim()) &&
      Boolean(c.createdAt) &&
      Boolean(c.updatedAt) &&
      c.deletedAt === null &&
      Boolean(c.createdBy) &&
      Boolean(c.updatedBy)
  );
  assert(allRequiredValid, 'All synthetic clients satisfy required BaseRecord and ClientRecord schema fields');

  // 4. Bilingual Name & Script Parity
  const allHaveBnName = dataset.clients.every((c) => Boolean(c.nameBn && c.nameBn.trim()));
  assert(allHaveBnName, 'All synthetic clients provide authentic Bangla script names (nameBn)');

  // 5. Reserved Email Domains
  const validEmails = dataset.clients.every(
    (c) => !c.email || c.email.endsWith('@example.com') || c.email.endsWith('@example.org')
  );
  assert(validEmails, 'All provided client emails use reserved safe domains (example.com / example.org)');
  const clientsWithEmail = dataset.clients.filter((c) => Boolean(c.email));
  const clientsWithoutEmail = dataset.clients.filter((c) => !c.email);
  assert(clientsWithEmail.length > 50 && clientsWithoutEmail.length > 20, 'Realistic mixture of clients with and without optional email', `With: ${clientsWithEmail.length}, Without: ${clientsWithoutEmail.length}`);

  // 6. Geographic Distribution across Bangladesh
  const addresses = dataset.clients.map((c) => c.address).join(' ');
  const districts = ['Dhaka', 'Chattogram', 'Sylhet', 'Rajshahi', 'Khulna', 'Barishal', 'Rangpur', 'Mymensingh', 'Cumilla', 'Cox’s Bazar', 'Bogura'];
  const coveredDistricts = districts.filter((d) => addresses.includes(d));
  assert(coveredDistricts.length >= 8, 'Addresses span across major Bangladesh divisions and court jurisdictions', `Covered: ${coveredDistricts.join(', ')}`);

  // 7. Individual vs Corporate Client Diversity
  const corporateClients = dataset.clients.filter((c) =>
    c.name.includes('Ltd.') || c.name.includes('PLC') || c.name.includes('Industries') || c.name.includes('Mills') || c.name.includes('Lines') || c.name.includes('Syndicate')
  );
  assert(corporateClients.length >= 10, 'Realistic presence of corporate/commercial enterprise clients', `Found ${corporateClients.length}`);

  // 8. Archived vs Active Client Variation
  const archivedClients = dataset.clients.filter((c) => c.archived === true);
  const activeClients = dataset.clients.filter((c) => c.archived === false);
  assert(archivedClients.length === 10 && activeClients.length === 90, 'Exactly 10 archived and 90 active synthetic clients for testing archive workflows');

  // 9. Related Cases Validation
  assert(dataset.cases.length === 110, 'Related cases count within 100-150 target range', `Got ${dataset.cases.length}`);
  const allCaseClientsExist = dataset.cases.every((cs) => clientIds.has(cs.clientId));
  assert(allCaseClientsExist, 'Every case references a valid existing synthetic client');
  const uniqueFileSerials = new Set(dataset.cases.map((cs) => cs.fileSerial));
  assert(uniqueFileSerials.size === 110, 'Every case has a unique fileSerial within the firm');
  const ongoingCases = dataset.cases.filter((cs) => cs.status === 'ongoing');
  const pendingCases = dataset.cases.filter((cs) => cs.status === 'pending');
  const closedCases = dataset.cases.filter((cs) => cs.status === 'closed');
  assert(ongoingCases.length > 0 && pendingCases.length > 0 && closedCases.length > 0, 'Cases include a realistic mixture of ongoing, pending, and closed statuses');
  const allClosedHaveClosedOn = closedCases.every((cs) => Boolean(cs.closedOn));
  assert(allClosedHaveClosedOn, 'All closed cases have valid closedOn timestamps');
  const restrictedCases = dataset.cases.filter((cs) => cs.restricted === true);
  assert(restrictedCases.length > 0 && restrictedCases.length < 20, 'Realistic proportion of confidential cases (restricted = true)');

  // 10. Related Hearings Validation
  assert(dataset.hearings.length === 180, 'Hearings count within 150-250 target range', `Got ${dataset.hearings.length}`);
  const caseIds = new Set(dataset.cases.map((cs) => cs.id));
  const allHearingsLinkToCases = dataset.hearings.every((h) => caseIds.has(h.caseId));
  assert(allHearingsLinkToCases, 'Every hearing references a valid existing case');
  const scheduledHearings = dataset.hearings.filter((h) => h.status === 'scheduled');
  const heldHearings = dataset.hearings.filter((h) => h.status === 'held');
  const adjournedHearings = dataset.hearings.filter((h) => h.status === 'adjourned');
  assert(scheduledHearings.length > 0 && heldHearings.length > 0 && adjournedHearings.length > 0, 'Hearings include scheduled, held, and adjourned statuses');

  // 11. Hearing Date History
  assert(dataset.hearingDateHistory.length === 45, 'Hearing date history records generated for adjourned hearings', `Got ${dataset.hearingDateHistory.length}`);
  const allHistoriesLinkValidHearings = dataset.hearingDateHistory.every(
    (hist) => dataset.hearings.some((h) => h.id === hist.hearingId) && caseIds.has(hist.caseId)
  );
  assert(allHistoriesLinkValidHearings, 'All hearing date histories link to valid hearings and cases');

  // 12. Related Tasks Validation
  assert(dataset.tasks.length === 120, 'Tasks count within 100-150 target range', `Got ${dataset.tasks.length}`);
  const allTasksLinkToCases = dataset.tasks.every((t) => !t.caseId || caseIds.has(t.caseId));
  assert(allTasksLinkToCases, 'Every task with case link references a valid case');
  const taskPriorities = new Set(dataset.tasks.map((t) => t.priority));
  assert(taskPriorities.has('urgent') && taskPriorities.has('high') && taskPriorities.has('medium') && taskPriorities.has('normal'), 'Tasks cover urgent, high, medium, and normal priorities');

  // 13. Client Notes Validation
  assert(dataset.clientNotes.length === 140, 'Client notes count within 100-200 target range', `Got ${dataset.clientNotes.length}`);
  const allNotesLinkToClients = dataset.clientNotes.every((cn) => clientIds.has(cn.clientId));
  assert(allNotesLinkToClients, 'Every client note references a valid synthetic client');

  // 14. Appointments Validation
  assert(dataset.appointments.length === 65, 'Appointments count within 50-100 target range', `Got ${dataset.appointments.length}`);
  const allApptsValid = dataset.appointments.every(
    (a) => Boolean(a.startsAt) && Boolean(a.endsAt) && new Date(a.endsAt).getTime() > new Date(a.startsAt).getTime()
  );
  assert(allApptsValid, 'All appointments have valid sequential start and end timestamps');

  // 15. Billing & Accounting Validation
  assert(dataset.feeAgreements.length === 50, 'Fee agreements generated', `Got ${dataset.feeAgreements.length}`);
  assert(dataset.feePayments.length === 60, 'Fee payments generated', `Got ${dataset.feePayments.length}`);
  assert(dataset.expenses.length === 30, 'Expenses generated', `Got ${dataset.expenses.length}`);
  const totalBilling = dataset.feeAgreements.length + dataset.feePayments.length + dataset.expenses.length;
  assert(totalBilling >= 100 && totalBilling <= 200, 'Total billing and accounting records within 100-200 target range', `Total: ${totalBilling}`);

  // Integer Paisa precision checks
  const allAgreedPaisaAreIntegers = dataset.feeAgreements.every((fa) => Number.isInteger(fa.agreedAmountPaisa) && fa.agreedAmountPaisa > 0);
  assert(allAgreedPaisaAreIntegers, 'All fee agreement amounts strictly follow integer paisa convention');
  const allPaymentsPaisaAreIntegers = dataset.feePayments.every((fp) => Number.isInteger(fp.amountPaisa) && fp.amountPaisa > 0);
  assert(allPaymentsPaisaAreIntegers, 'All fee payments strictly follow integer paisa convention');

  // Unique receipt numbers and idempotency keys
  const receiptNumbers = new Set(dataset.feePayments.map((fp) => fp.receiptNumber));
  assert(receiptNumbers.size === dataset.feePayments.length, 'All fee payment receipts are strictly unique within firm');
  const idemKeys = new Set(dataset.feePayments.map((fp) => fp.idempotencyKey));
  assert(idemKeys.size === dataset.feePayments.length, 'All fee payment idempotency keys are strictly unique');

  // 16. Physical Files Validation (Mock Store)
  assert(dataset.physicalFiles.length === 50, 'Physical file records within 50-100 target range', `Got ${dataset.physicalFiles.length}`);
  const uniqueFileSerialsPhysical = new Set(dataset.physicalFiles.map((f) => f.serial));
  assert(uniqueFileSerialsPhysical.size === 50, 'All physical file serials are unique');
  assert(dataset.fileMovements.length === 20, 'File movement records generated for tracking file custody');

  // 17. Idempotency & Clean Operation in Store
  const initialClientCount = localStore.getData().clients.length;
  const popResult1 = localStore.populateSyntheticData();
  const countAfterPop1 = localStore.getData().clients.length;
  const popResult2 = localStore.populateSyntheticData();
  const countAfterPop2 = localStore.getData().clients.length;

  assert(countAfterPop1 === countAfterPop2, 'Repeated population is idempotent (count does not increase on re-run)');
  assert(popResult2.created['clients'] === 0, 'Re-run reports 0 new clients created');
  assert(popResult2.skipped['clients'] === 100, 'Re-run correctly skips existing 100 synthetic clients');

  // Clean and verify preservation of original fixtures
  const cleanResult = localStore.removeSyntheticData();
  assert(cleanResult.removed['clients'] === 100, 'Clean operation removed exactly 100 synthetic clients');
  const preservedClientCount = localStore.getData().clients.length;
  assert(preservedClientCount === 3, 'Clean operation preserved exactly the 3 original seed clients (client-001, client-002, client-003)', `Got ${preservedClientCount}`);

  // Re-populate store for application runtime
  localStore.populateSyntheticData();
  const finalClientCount = localStore.getData().clients.length;
  assert(finalClientCount === 103, 'Application runtime store populated with 103 total clients (100 synthetic + 3 seed)', `Got ${finalClientCount}`);

  // 18. Auto-migration verification for existing browser storage
  // When a user has a pre-existing store in localStorage lacking synthetic data, getData() auto-populates it
  localStore.setData({
    ...localStore.getData(),
    clients: localStore.getData().clients.filter((c) => !c.id.includes('-syn-')),
  }, false);
  const autoMigratedClients = localStore.getData().clients.length;
  assert(autoMigratedClients === 103, 'Legacy browser session without synthetic data is automatically migrated to 103 clients upon access', `Got ${autoMigratedClients}`);

  console.log(`\n========================================`);
  console.log(`SYNTHETIC TEST SUITE RESULTS: ${passed} PASSED, ${failed} FAILED`);
  console.log(`========================================`);

  if (failed > 0) {
    process.exit(1);
  }
}

runTests().catch((err) => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
