process.env.JWT_SECRET = 'test_jwt_secret_key_at_least_32_chars_long_1234567890';
process.env.ADMIN_JWT_SECRET = 'test_admin_jwt_secret_key_at_least_32_chars_9876543210';

import http from 'http';
import { createApp } from '../src/app.js';
import { getDatabase } from '../src/db/client.js';
import { SEED_PASSWORDS } from '../src/db/seed.js';
import bcrypt from 'bcryptjs';

interface TestContext {
  baseUrl: string;
  server: http.Server;
}

async function startTestServer(): Promise<TestContext> {
  const app = createApp();
  const server = http.createServer(app);

  await new Promise<void>((resolve) => {
    server.listen(0, '127.0.0.1', () => resolve());
  });

  const addr = server.address() as any;
  const baseUrl = `http://127.0.0.1:${addr.port}`;
  return { baseUrl, server };
}

function extractToken(res: Response): string {
  const cookie = res.headers.get('set-cookie') || '';
  const match = cookie.match(/access_token=([^;]+)/);
  return match ? match[1] : '';
}

async function runTests() {
  console.log('--- STARTING BACKEND ACCOUNTS MODULE (PHASE 1) TEST SUITE ---');
  const { baseUrl, server } = await startTestServer();
  const db = getDatabase();

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

  try {
    // 1. Authenticate Firm A Owner
    const ownerRes = await fetch(`${baseUrl}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'owner@firm.bd', password: SEED_PASSWORDS.owner }),
    });
    const ownerToken = extractToken(ownerRes);
    const ownerCookie = `access_token=${ownerToken}`;
    assert(ownerRes.status === 200 && !!ownerToken, 'Owner login succeeds');

    // 2. Create Staff User in Firm A (without accounts permissions initially)
    const staffPass = 'ChamberStaff_2026_Secured!';
    const hashedStaffPass = await bcrypt.hash(staffPass, 10);
    const staffUser = await db.insertUser({
      id: 'user-accounts-staff-001',
      firmId: 'firm-bd-001',
      name: 'Accounts Test Junior',
      email: 'staff.accounts@firm.bd',
      passwordHash: hashedStaffPass,
      role: 'Staff',
      permissions: ['cases.view', 'clients.view'],
      isActive: true,
      failedLoginAttempts: 0,
      lockedUntil: null,
      mustChangePassword: false,
    });

    const staffLoginRes = await fetch(`${baseUrl}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: staffUser.email, password: staffPass }),
    });
    const staffToken = extractToken(staffLoginRes);
    const staffCookie = `access_token=${staffToken}`;
    assert(staffLoginRes.status === 200, 'Staff login succeeds');

    // 3. Setup Test Client & Case in Firm A
    const clientA = await db.insertClient({
      id: `client-acc-${Date.now()}`,
      firmId: 'firm-bd-001',
      name: 'Kalam Chowdhury',
      nameBn: 'কালাম চৌধুরী',
      phone: '+880 1819-998877',
      address: 'Dhanmondi, Dhaka',
      email: 'kalam@example.com',
      notes: 'Corporate client',
      createdAt: new Date(),
      updatedAt: new Date(),
      deletedAt: null,
      createdBy: 'user-owner-001',
      updatedBy: 'user-owner-001',
    });

    const caseA = await db.insertCase({
      id: `case-acc-${Date.now()}`,
      firmId: 'firm-bd-001',
      caseNumber: `CS-${Date.now()}/2026`,
      court: 'Dhaka District Court',
      matterType: 'Civil Suit',
      clientId: clientA.id,
      category: 'Civil',
      status: 'active',
      responsibleLawyerId: 'user-owner-001',
      restricted: false,
      createdAt: new Date(),
      updatedAt: new Date(),
      deletedAt: null,
      createdBy: 'user-owner-001',
      updatedBy: 'user-owner-001',
    });

    console.log('\n--- 1. Fee Agreement Creation & Revision ---');
    // Create agreement of 1,00,000 BDT (10,000,000 paisa)
    const createAgRes = await fetch(`${baseUrl}/api/v1/fee-agreements`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: ownerCookie },
      body: JSON.stringify({
        clientId: clientA.id,
        caseId: caseA.id,
        feeType: 'installment',
        agreedAmountPaisa: 10000000,
        agreementDate: '2026-10-01',
        notes: 'Four installments agreed',
      }),
    });
    assert(createAgRes.status === 201, 'Owner creates fee agreement (HTTP 201)');
    const agreementA = await createAgRes.json();
    assert(agreementA.agreedAmountPaisa === 10000000, 'Agreed amount is 10,000,000 paisa (1,00,000 BDT)');
    assert(agreementA.status === 'active', 'Agreement status is active');

    // Check summary before payments
    const sum1Res = await fetch(`${baseUrl}/api/v1/accounts/summary?clientId=${clientA.id}`, {
      headers: { Cookie: ownerCookie },
    });
    assert(sum1Res.status === 200, 'GET accounts summary returns HTTP 200');
    const sum1 = await sum1Res.json();
    assert(sum1.totalAgreedPaisa === 10000000, 'Summary totalAgreedPaisa matches agreed fee');
    assert(sum1.totalPaidPaisa === 0, 'Summary totalPaidPaisa is initially 0');
    assert(sum1.balancePaisa === 10000000, 'Summary balancePaisa equals 10,000,000 paisa');
    assert(sum1.outstandingPaisa === 10000000, 'Summary outstandingPaisa equals 10,000,000 paisa');
    assert(sum1.isCredit === false, 'isCredit is false');

    // Revise agreement amount from 10,000,000 to 12,000,000 paisa
    const reviseRes = await fetch(`${baseUrl}/api/v1/fee-agreements/${agreementA.id}/revise`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: ownerCookie },
      body: JSON.stringify({
        newAmountPaisa: 12000000,
        reason: 'Added cross-examination hearing appearance fee',
      }),
    });
    assert(reviseRes.status === 200, 'Owner revises fee agreement (HTTP 200)');
    const revisedAg = await reviseRes.json();
    assert(revisedAg.agreedAmountPaisa === 12000000, 'Revised agreed fee is 12,000,000 paisa');

    // Verify change history audit row
    const changesRes = await fetch(`${baseUrl}/api/v1/fee-agreements/${agreementA.id}/changes`, {
      headers: { Cookie: ownerCookie },
    });
    const changes = await changesRes.json();
    assert(Array.isArray(changes) && changes.length === 1, 'Fee agreement change history recorded 1 revision');
    assert(changes[0].oldAmountPaisa === 10000000 && changes[0].newAmountPaisa === 12000000, 'Revision records correct old and new amount');

    console.log('\n--- 2. Payments & Installments Balance Math ---');
    // First installment: 40,000 BDT (4,000,000 paisa)
    const pay1Res = await fetch(`${baseUrl}/api/v1/fee-payments`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: ownerCookie },
      body: JSON.stringify({
        clientId: clientA.id,
        caseId: caseA.id,
        feeAgreementId: agreementA.id,
        paymentDate: '2026-10-05',
        amountPaisa: 4000000,
        method: 'bank',
        reference: 'TRX-1001',
        purposeNote: 'First installment retainer',
        idempotencyKey: 'idemp-test-pay-001',
      }),
    });
    assert(pay1Res.status === 201, 'Record first payment installment (HTTP 201)');
    const pay1 = await pay1Res.json();
    assert(pay1.receiptNumber.startsWith('R-'), 'Receipt number generated with R- prefix');
    assert(pay1.status === 'posted', 'Payment status is posted');

    // Second installment: 40,000 BDT (4,000,000 paisa)
    const pay2Res = await fetch(`${baseUrl}/api/v1/fee-payments`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: ownerCookie },
      body: JSON.stringify({
        clientId: clientA.id,
        caseId: caseA.id,
        feeAgreementId: agreementA.id,
        paymentDate: '2026-10-15',
        amountPaisa: 4000000,
        method: 'cash',
        purposeNote: 'Second installment for issues framing',
        idempotencyKey: 'idemp-test-pay-002',
      }),
    });
    assert(pay2Res.status === 201, 'Record second payment installment (HTTP 201)');
    const pay2 = await pay2Res.json();
    assert(pay2.receiptNumber !== pay1.receiptNumber, 'Second payment receives a distinct sequential receipt number');

    // Verify balance after 2 installments: 12,000,000 - 8,000,000 = 4,000,000 paisa outstanding
    const sum2Res = await fetch(`${baseUrl}/api/v1/accounts/summary?clientId=${clientA.id}`, {
      headers: { Cookie: ownerCookie },
    });
    const sum2 = await sum2Res.json();
    assert(sum2.totalAgreedPaisa === 12000000, 'Total agreed remains 12,000,000 paisa');
    assert(sum2.totalPaidPaisa === 8000000, 'Total paid is now 8,000,000 paisa');
    assert(sum2.outstandingPaisa === 4000000, 'Outstanding balance is 4,000,000 paisa (40,000 BDT)');
    assert(sum2.isCredit === false, 'isCredit is false');

    console.log('\n--- 3. Overpayment & Credit Flag ---');
    // Third payment of 60,000 BDT (6,000,000 paisa) -> total paid 14,000,000 > 12,000,000 agreed
    const pay3Res = await fetch(`${baseUrl}/api/v1/fee-payments`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: ownerCookie },
      body: JSON.stringify({
        clientId: clientA.id,
        caseId: caseA.id,
        feeAgreementId: agreementA.id,
        paymentDate: '2026-10-20',
        amountPaisa: 6000000,
        method: 'bkash',
        reference: 'BKASH-99881',
        purposeNote: 'Third payment with advance deposit',
        idempotencyKey: 'idemp-test-pay-003',
      }),
    });
    assert(pay3Res.status === 201, 'Record overpayment (HTTP 201)');
    const pay3 = await pay3Res.json();

    const sum3Res = await fetch(`${baseUrl}/api/v1/accounts/summary?clientId=${clientA.id}`, {
      headers: { Cookie: ownerCookie },
    });
    const sum3 = await sum3Res.json();
    assert(sum3.totalPaidPaisa === 14000000, 'Total paid is 14,000,000 paisa');
    assert(sum3.balancePaisa === -2000000, 'Balance is negative (-2,000,000 paisa)');
    assert(sum3.isCredit === true, 'isCredit flagged as true on overpayment');
    assert(sum3.creditPaisa === 2000000, 'creditPaisa is 2,000,000 paisa (20,000 BDT)');
    assert(sum3.outstandingPaisa === 0, 'outstandingPaisa is 0 when in credit');

    console.log('\n--- 4. Void Exclusion from Balance Math ---');
    // Void payment 3 (the 60,000 BDT advance payment)
    const voidPayRes = await fetch(`${baseUrl}/api/v1/fee-payments/${pay3.id}/void`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: ownerCookie },
      body: JSON.stringify({
        reason: 'Client requested reversal of advance payment',
      }),
    });
    assert(voidPayRes.status === 200, 'Owner voids payment (HTTP 200)');
    const voidedPay = await voidPayRes.json();
    assert(voidedPay.status === 'void', 'Payment status transitioned to void');
    assert(voidedPay.voidReason === 'Client requested reversal of advance payment', 'Void reason recorded');

    // Balance should revert: total paid should be 8,000,000, outstanding 4,000,000
    const sum4Res = await fetch(`${baseUrl}/api/v1/accounts/summary?clientId=${clientA.id}`, {
      headers: { Cookie: ownerCookie },
    });
    const sum4 = await sum4Res.json();
    assert(sum4.totalPaidPaisa === 8000000, 'Voided payment is strictly excluded from total paid');
    assert(sum4.outstandingPaisa === 4000000, 'Outstanding balance reverted to 4,000,000 paisa');
    assert(sum4.isCredit === false, 'isCredit reverted to false');

    // Attempting to void already voided payment should fail
    const voidAgainRes = await fetch(`${baseUrl}/api/v1/fee-payments/${pay3.id}/void`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: ownerCookie },
      body: JSON.stringify({ reason: 'Trying to void again' }),
    });
    assert(voidAgainRes.status === 400, 'Voiding an already voided payment is rejected with HTTP 400');

    console.log('\n--- 5. Void Requires Reason Validation ---');
    const shortReasonRes = await fetch(`${baseUrl}/api/v1/fee-payments/${pay2.id}/void`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: ownerCookie },
      body: JSON.stringify({ reason: 'no' }), // < 3 characters
    });
    assert(shortReasonRes.status === 400, 'Void with reason shorter than 3 chars rejected (HTTP 400)');

    console.log('\n--- 6. Idempotency Key Deduplication ---');
    // Re-post with duplicate idempotencyKey 'idemp-test-pay-001'
    const dupRes = await fetch(`${baseUrl}/api/v1/fee-payments`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: ownerCookie },
      body: JSON.stringify({
        feeAgreementId: agreementA.id,
        clientId: clientA.id,
        caseId: caseA.id,
        paymentDate: '2026-10-05',
        amountPaisa: 4000000,
        method: 'bank',
        purposeNote: 'Duplicate submission attempt',
        idempotencyKey: 'idemp-test-pay-001',
      }),
    });
    assert(dupRes.status === 200, 'Duplicate submission with same idempotencyKey returns HTTP 200');
    const dupPay = await dupRes.json();
    assert(dupPay.id === pay1.id, 'Duplicate response returns original payment ID');
    assert(dupPay.receiptNumber === pay1.receiptNumber, 'Duplicate response preserves original receipt number');

    // Verify balance did not change
    const sumAfterDupRes = await fetch(`${baseUrl}/api/v1/accounts/summary?clientId=${clientA.id}`, {
      headers: { Cookie: ownerCookie },
    });
    const sumAfterDup = await sumAfterDupRes.json();
    assert(sumAfterDup.totalPaidPaisa === 8000000, 'Duplicate submission did NOT increment paid total');

    console.log('\n--- 7. Concurrent Receipt Numbering ---');
    // Dispatch 5 concurrent payments
    const concurrentKeys = Array.from({ length: 5 }, (_, i) => `concurrent-idemp-${Date.now()}-${i}`);
    const concurrentPromises = concurrentKeys.map((key, i) =>
      fetch(`${baseUrl}/api/v1/fee-payments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: ownerCookie },
        body: JSON.stringify({
          feeAgreementId: agreementA.id,
          clientId: clientA.id,
          caseId: caseA.id,
          paymentDate: '2026-10-25',
          amountPaisa: 100000,
          method: 'cash',
          purposeNote: `Concurrent payment ${i + 1}`,
          idempotencyKey: key,
        }),
      }).then((r) => r.json())
    );

    const concurrentResults = await Promise.all(concurrentPromises);
    const receiptNumbers = concurrentResults.map((r: any) => r.receiptNumber);
    const uniqueReceipts = new Set(receiptNumbers);
    assert(
      uniqueReceipts.size === 5,
      `All 5 concurrent payments received unique receipt numbers (${Array.from(uniqueReceipts).join(', ')})`
    );

    console.log('\n--- 8. Expenses Recording & Categories ---');
    // List categories
    const catRes = await fetch(`${baseUrl}/api/v1/expenses/categories`, {
      headers: { Cookie: ownerCookie },
    });
    assert(catRes.status === 200, 'GET expense categories returns HTTP 200');
    const categories = await catRes.json();
    assert(Array.isArray(categories) && categories.length >= 7, 'Default expense categories auto-seeded');

    // Record expense
    const expRes = await fetch(`${baseUrl}/api/v1/expenses`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: ownerCookie },
      body: JSON.stringify({
        clientId: clientA.id,
        caseId: caseA.id,
        categoryId: categories[0].id,
        expenseDate: '2026-10-22',
        amountPaisa: 350000,
        description: 'Certified copy fee paid at registry',
        reimbursable: true,
      }),
    });
    assert(expRes.status === 201, 'Owner records expense (HTTP 201)');
    const exp = await expRes.json();
    assert(exp.amountPaisa === 350000, 'Expense amount is 350,000 paisa (3,500 BDT)');

    // Summary includes expenses
    const sumExpRes = await fetch(`${baseUrl}/api/v1/accounts/summary?clientId=${clientA.id}`, {
      headers: { Cookie: ownerCookie },
    });
    const sumExp = await sumExpRes.json();
    assert(sumExp.totalExpensesPaisa >= 350000, 'Summary totalExpensesPaisa captures recorded expense');

    // Void expense
    const voidExpRes = await fetch(`${baseUrl}/api/v1/expenses/${exp.id}/void`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: ownerCookie },
      body: JSON.stringify({ reason: 'Registry refunded certified copy fee' }),
    });
    assert(voidExpRes.status === 200, 'Owner voids expense (HTTP 200)');
    const voidedExp = await voidExpRes.json();
    assert(voidedExp.status === 'void', 'Expense status is void');

    console.log('\n--- 9. Firm Isolation ---');
    // Setup Firm B Owner
    const firmB = await db.insertFirm({
      id: 'firm-isolated-b',
      firmId: 'firm-isolated-b',
      name: 'Isolation Firm B',
      status: 'active',
      licenseExpiresAt: new Date(Date.now() + 365 * 86400000),
    });

    const ownerBUser = await db.insertUser({
      id: 'user-accounts-owner-b',
      firmId: firmB.id,
      name: 'Owner B',
      email: 'owner.accounts@firmb.bd',
      passwordHash: await bcrypt.hash('FirmBOwnerPass_2026!', 10),
      role: 'Owner',
      permissions: ['accounts.view', 'accounts.manage'],
      isActive: true,
      failedLoginAttempts: 0,
      lockedUntil: null,
      mustChangePassword: false,
    });

    const ownerBLoginRes = await fetch(`${baseUrl}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: ownerBUser.email, password: 'FirmBOwnerPass_2026!' }),
    });
    const ownerBToken = extractToken(ownerBLoginRes);
    const ownerBCookie = `access_token=${ownerBToken}`;

    // Firm B tries to get Firm A's agreement -> 404
    const firmBCrossAgRes = await fetch(`${baseUrl}/api/v1/fee-agreements/${agreementA.id}`, {
      headers: { Cookie: ownerBCookie },
    });
    assert(firmBCrossAgRes.status === 404, 'Firm B reading Firm A fee agreement gets 404 Not Found');

    // Firm B tries to get Firm A's payment -> 404
    const firmBCrossPayRes = await fetch(`${baseUrl}/api/v1/fee-payments/${pay1.id}`, {
      headers: { Cookie: ownerBCookie },
    });
    assert(firmBCrossPayRes.status === 404, 'Firm B reading Firm A fee payment gets 404 Not Found');

    // Firm B calls getClientBalances -> sees only Firm B clients (none)
    const firmBBalancesRes = await fetch(`${baseUrl}/api/v1/accounts/client-balances`, {
      headers: { Cookie: ownerBCookie },
    });
    const firmBBalances = await firmBBalancesRes.json();
    assert(
      !firmBBalances.some((b: any) => b.clientId === clientA.id),
      'Firm B client balances does NOT include Firm A clients'
    );

    console.log('\n--- 10. Restricted Case Visibility ---');
    // Create restricted case in Firm A
    const restrictedCase = await db.insertCase({
      id: `case-restricted-${Date.now()}`,
      firmId: 'firm-bd-001',
      caseNumber: `RESTRICTED-${Date.now()}`,
      court: 'High Court Division',
      matterType: 'Writ Petition',
      clientId: clientA.id,
      category: 'Civil',
      status: 'active',
      responsibleLawyerId: 'user-owner-001',
      restricted: true,
      createdAt: new Date(),
      updatedAt: new Date(),
      deletedAt: null,
      createdBy: 'user-owner-001',
      updatedBy: 'user-owner-001',
    });

    const restrictedAgRes = await fetch(`${baseUrl}/api/v1/fee-agreements`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: ownerCookie },
      body: JSON.stringify({
        clientId: clientA.id,
        caseId: restrictedCase.id,
        feeType: 'fixed',
        agreedAmountPaisa: 20000000,
        agreementDate: '2026-10-25',
        notes: 'Confidential writ retainer',
      }),
    });
    const restrictedAg = await restrictedAgRes.json();

    // Give staff accounts.view and accounts.manage but NOT restricted.view
    await db.updateUser(staffUser.id, {
      permissions: ['accounts.view', 'accounts.manage', 'expenses.record'],
    });

    // Staff tries to access restricted agreement -> 404
    const staffRestrictedRes = await fetch(`${baseUrl}/api/v1/fee-agreements/${restrictedAg.id}`, {
      headers: { Cookie: staffCookie },
    });
    assert(staffRestrictedRes.status === 404, 'Staff without restricted.view gets 404 on restricted case agreement');

    // Staff tries to record payment on restricted case -> 400 / 404
    const staffRestrictedPayRes = await fetch(`${baseUrl}/api/v1/fee-payments`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: staffCookie },
      body: JSON.stringify({
        feeAgreementId: restrictedAg.id,
        clientId: clientA.id,
        caseId: restrictedCase.id,
        paymentDate: '2026-10-25',
        amountPaisa: 5000000,
        method: 'cash',
        purposeNote: 'Staff unauthorized deposit attempt',
        idempotencyKey: `staff-restricted-${Date.now()}`,
      }),
    });
    assert(staffRestrictedPayRes.status === 400 || staffRestrictedPayRes.status === 404, 'Staff without restricted.view gets 404/400 recording payment on restricted case');

    console.log('\n--- 11. Permission Denied Checks ---');
    // Remove accounts permissions from staff
    await db.updateUser(staffUser.id, {
      permissions: ['cases.view'],
    });

    const noPermSumRes = await fetch(`${baseUrl}/api/v1/accounts/summary?clientId=${clientA.id}`, {
      headers: { Cookie: staffCookie },
    });
    assert(noPermSumRes.status === 403, 'Staff without accounts.view gets 403 on GET /accounts/summary');

    const noPermPayRes = await fetch(`${baseUrl}/api/v1/fee-payments`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: staffCookie },
      body: JSON.stringify({
        feeAgreementId: agreementA.id,
        clientId: clientA.id,
        paymentDate: '2026-10-25',
        amountPaisa: 100000,
        method: 'cash',
        purposeNote: 'Unauthorized payment attempt',
        idempotencyKey: `unauth-pay-${Date.now()}`,
      }),
    });
    assert(noPermPayRes.status === 403, 'Staff without accounts.manage gets 403 on POST /fee-payments');

    console.log('\n--- 12. Read-Only Subscription Gate (R-08) ---');
    // Set Firm A license to expired in past (beyond 5 days grace period)
    const origFirm = await db.getFirm('firm-bd-001');
    await db.updateFirm('firm-bd-001', {
      licenseExpiresAt: new Date(Date.now() - 30 * 86400000),
    });

    const expiredPayRes = await fetch(`${baseUrl}/api/v1/fee-payments`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: ownerCookie },
      body: JSON.stringify({
        feeAgreementId: agreementA.id,
        clientId: clientA.id,
        paymentDate: '2026-10-25',
        amountPaisa: 100000,
        method: 'cash',
        purposeNote: 'Payment when subscription expired',
        idempotencyKey: `expired-pay-${Date.now()}`,
      }),
    });
    assert(expiredPayRes.status === 403, 'POST /fee-payments returns 403 when subscription is expired');
    const expiredPayBody = await expiredPayRes.json();
    assert(expiredPayBody.code === 'SUBSCRIPTION_READ_ONLY', 'Error response returns code SUBSCRIPTION_READ_ONLY');

    const expiredAgRes = await fetch(`${baseUrl}/api/v1/fee-agreements`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: ownerCookie },
      body: JSON.stringify({
        clientId: clientA.id,
        caseId: caseA.id,
        feeType: 'fixed',
        agreedAmountPaisa: 100000,
        agreementDate: '2026-10-25',
      }),
    });
    assert(expiredAgRes.status === 403, 'POST /fee-agreements returns 403 when subscription is expired');

    // Read queries should still succeed during read-only mode
    const expiredReadRes = await fetch(`${baseUrl}/api/v1/accounts/summary?clientId=${clientA.id}`, {
      headers: { Cookie: ownerCookie },
    });
    assert(expiredReadRes.status === 200, 'GET /accounts/summary still succeeds (HTTP 200) when subscription is expired');

    // Restore Firm A license
    await db.updateFirm('firm-bd-001', {
      licenseExpiresAt: origFirm?.licenseExpiresAt || new Date(Date.now() + 365 * 86400000),
    });

    console.log('\n--- 13. Per-Client & Per-Case Tracking and Invariants ---');
    // Setup Client with 3 distinct cases
    const clientMulti = await db.insertClient({
      id: `client-multi-${Date.now()}`,
      firmId: 'firm-bd-001',
      name: 'Rahim Steel Mills Ltd',
      nameBn: 'রহিম স্টিল মিলস লিঃ',
      phone: '+880 1711-223344',
      address: 'Chittagong, Bangladesh',
      createdAt: new Date(),
      updatedAt: new Date(),
      deletedAt: null,
      createdBy: 'user-owner-001',
      updatedBy: 'user-owner-001',
    });

    const multiCase1 = await db.insertCase({
      id: `case-multi-1-${Date.now()}`,
      firmId: 'firm-bd-001',
      caseNumber: `TAX-001-${Date.now()}`,
      court: 'High Court Division',
      matterType: 'Tax Appeal',
      clientId: clientMulti.id,
      category: 'Civil',
      status: 'active',
      responsibleLawyerId: 'user-owner-001',
      createdAt: new Date(),
      updatedAt: new Date(),
      deletedAt: null,
      createdBy: 'user-owner-001',
      updatedBy: 'user-owner-001',
    });

    const multiCase2 = await db.insertCase({
      id: `case-multi-2-${Date.now()}`,
      firmId: 'firm-bd-001',
      caseNumber: `LAB-002-${Date.now()}`,
      court: 'Labour Tribunal',
      matterType: 'Employment Dispute',
      clientId: clientMulti.id,
      category: 'Civil',
      status: 'active',
      responsibleLawyerId: 'user-owner-001',
      createdAt: new Date(),
      updatedAt: new Date(),
      deletedAt: null,
      createdBy: 'user-owner-001',
      updatedBy: 'user-owner-001',
    });

    const multiCase3 = await db.insertCase({
      id: `case-multi-3-${Date.now()}`,
      firmId: 'firm-bd-001',
      caseNumber: `COM-003-${Date.now()}`,
      court: 'Company Bench',
      matterType: 'Merger Validation',
      clientId: clientMulti.id,
      category: 'Civil',
      status: 'active',
      responsibleLawyerId: 'user-owner-001',
      createdAt: new Date(),
      updatedAt: new Date(),
      deletedAt: null,
      createdBy: 'user-owner-001',
      updatedBy: 'user-owner-001',
    });

    // Agreement 1: Case 1 - 50,000 BDT (5,000,000 paisa)
    const agMulti1Res = await fetch(`${baseUrl}/api/v1/fee-agreements`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: ownerCookie },
      body: JSON.stringify({
        clientId: clientMulti.id,
        caseId: multiCase1.id,
        feeType: 'fixed',
        agreedAmountPaisa: 5000000,
        agreementDate: '2026-10-25',
      }),
    });
    assert(agMulti1Res.status === 201, 'Created agreement for Multi Case 1');
    const agMulti1 = await agMulti1Res.json();

    // Agreement 2: Case 2 - 100,000 BDT (10,000,000 paisa)
    const agMulti2Res = await fetch(`${baseUrl}/api/v1/fee-agreements`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: ownerCookie },
      body: JSON.stringify({
        clientId: clientMulti.id,
        caseId: multiCase2.id,
        feeType: 'fixed',
        agreedAmountPaisa: 10000000,
        agreementDate: '2026-10-25',
      }),
    });
    assert(agMulti2Res.status === 201, 'Created agreement for Multi Case 2');
    const agMulti2 = await agMulti2Res.json();

    // Agreement 3: Case 3 - 40,000 BDT (4,000,000 paisa)
    const agMulti3Res = await fetch(`${baseUrl}/api/v1/fee-agreements`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: ownerCookie },
      body: JSON.stringify({
        clientId: clientMulti.id,
        caseId: multiCase3.id,
        feeType: 'fixed',
        agreedAmountPaisa: 4000000,
        agreementDate: '2026-10-25',
      }),
    });
    assert(agMulti3Res.status === 201, 'Created agreement for Multi Case 3');
    const agMulti3 = await agMulti3Res.json();

    // 13.1 Mismatched case / agreement / hearing rejection
    // Hearing for Case 2
    const hearingCase2 = await db.insertHearing({
      id: `hearing-case2-${Date.now()}`,
      firmId: 'firm-bd-001',
      caseId: multiCase2.id,
      scheduledAt: new Date('2026-11-15T10:00:00Z'),
      court: 'Tribunal-1',
      purpose: 'Evidence',
      status: 'scheduled',
      createdAt: new Date(),
      updatedAt: new Date(),
      deletedAt: null,
      createdBy: 'user-owner-001',
      updatedBy: 'user-owner-001',
    });

    // Try to record payment on agMulti1 (Case 1) with hearing of Case 2
    const mismatchHearingRes = await fetch(`${baseUrl}/api/v1/fee-payments`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: ownerCookie },
      body: JSON.stringify({
        feeAgreementId: agMulti1.id,
        hearingId: hearingCase2.id,
        paymentDate: '2026-10-25',
        amountPaisa: 1000000,
        method: 'cash',
        purposeNote: 'Mismatched hearing test',
        idempotencyKey: `mismatch-hearing-${Date.now()}`,
      }),
    });
    assert(mismatchHearingRes.status === 400, 'Payment with hearing belonging to another case is rejected with HTTP 400');

    // Agreement creation with case belonging to another client
    const mismatchClientCaseRes = await fetch(`${baseUrl}/api/v1/fee-agreements`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: ownerCookie },
      body: JSON.stringify({
        clientId: clientA.id,
        caseId: multiCase1.id, // belongs to clientMulti, not clientA
        feeType: 'fixed',
        agreedAmountPaisa: 2000000,
        agreementDate: '2026-10-25',
      }),
    });
    assert(mismatchClientCaseRes.status === 400, 'Agreement creation with case belonging to different client is rejected with HTTP 400');

    // 13.2 Closed agreement rejected
    const clientClosed = await db.insertClient({
      id: `client-closed-${Date.now()}`,
      firmId: 'firm-bd-001',
      name: 'Closed Agreement Client',
      phone: '+880 1700-112233',
      createdAt: new Date(),
      updatedAt: new Date(),
      deletedAt: null,
      createdBy: 'user-owner-001',
      updatedBy: 'user-owner-001',
    });
    const caseClosed = await db.insertCase({
      id: `case-closed-${Date.now()}`,
      firmId: 'firm-bd-001',
      caseNumber: `CLOSED-001-${Date.now()}`,
      court: 'High Court Division',
      matterType: 'Writ Petition',
      clientId: clientClosed.id,
      category: 'Civil',
      status: 'active',
      responsibleLawyerId: 'user-owner-001',
      createdAt: new Date(),
      updatedAt: new Date(),
      deletedAt: null,
      createdBy: 'user-owner-001',
      updatedBy: 'user-owner-001',
    });
    const agToCloseRes = await fetch(`${baseUrl}/api/v1/fee-agreements`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: ownerCookie },
      body: JSON.stringify({
        clientId: clientClosed.id,
        caseId: caseClosed.id,
        feeType: 'fixed',
        agreedAmountPaisa: 2500000,
        agreementDate: '2026-10-25',
      }),
    });
    const agToClose = await agToCloseRes.json();

    const closeAgRes = await fetch(`${baseUrl}/api/v1/fee-agreements/${agToClose.id}/close`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: ownerCookie },
    });
    assert(closeAgRes.status === 200, 'Fee agreement closed successfully');

    const payClosedRes = await fetch(`${baseUrl}/api/v1/fee-payments`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: ownerCookie },
      body: JSON.stringify({
        feeAgreementId: agToClose.id,
        paymentDate: '2026-10-25',
        amountPaisa: 1000000,
        method: 'cash',
        purposeNote: 'Payment to closed agreement',
        idempotencyKey: `pay-closed-${Date.now()}`,
      }),
    });
    assert(payClosedRes.status === 400, 'Payment to closed fee agreement is rejected with HTTP 400');

    // 13.3 Client with 3 cases has 3 separate balances
    // Payment 1 for Case 1: 20,000 BDT (2,000,000 paisa) of 50,000 BDT -> outstanding 30,000 BDT
    await fetch(`${baseUrl}/api/v1/fee-payments`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: ownerCookie },
      body: JSON.stringify({
        feeAgreementId: agMulti1.id,
        paymentDate: '2026-10-25',
        amountPaisa: 2000000,
        method: 'bank',
        purposeNote: 'Partial payment on Case 1',
        idempotencyKey: `pay-multi-1-${Date.now()}`,
      }),
    });

    // Payment 2 for Case 2: 100,000 BDT (10,000,000 paisa) of 100,000 BDT -> outstanding 0
    await fetch(`${baseUrl}/api/v1/fee-payments`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: ownerCookie },
      body: JSON.stringify({
        feeAgreementId: agMulti2.id,
        paymentDate: '2026-10-25',
        amountPaisa: 10000000,
        method: 'bank',
        purposeNote: 'Full payment on Case 2',
        idempotencyKey: `pay-multi-2-${Date.now()}`,
      }),
    });

    // Payment 3 for Case 3: 50,000 BDT (5,000,000 paisa) of 40,000 BDT -> credit 10,000 BDT
    await fetch(`${baseUrl}/api/v1/fee-payments`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: ownerCookie },
      body: JSON.stringify({
        feeAgreementId: agMulti3.id,
        paymentDate: '2026-10-25',
        amountPaisa: 5000000,
        method: 'bkash',
        purposeNote: 'Overpayment on Case 3',
        idempotencyKey: `pay-multi-3-${Date.now()}`,
      }),
    });

    // Grand total client summary
    const multiSummaryRes = await fetch(`${baseUrl}/api/v1/accounts/summary?clientId=${clientMulti.id}`, {
      headers: { Cookie: ownerCookie },
    });
    assert(multiSummaryRes.status === 200, 'Fetched multi-case client summary');
    const multiSummary = await multiSummaryRes.json();

    assert(multiSummary.totalAgreedPaisa === 19000000, 'Client total agreed is sum of cases (19,000,000 paisa)');
    assert(multiSummary.totalPaidPaisa === 17000000, 'Client total paid is sum of cases (17,000,000 paisa)');
    assert(multiSummary.balancePaisa === 2000000, 'Client overall balance is 2,000,000 paisa');

    // Verify case-level breakdowns
    const caseSums = multiSummary.caseSummaries || [];
    assert(caseSums.length === 3, 'Client summary returns 3 distinct case summaries');

    const c1Summary = caseSums.find((c: any) => c.caseId === multiCase1.id);
    assert(c1Summary && c1Summary.agreedPaisa === 5000000 && c1Summary.paidPaisa === 2000000 && c1Summary.outstandingPaisa === 3000000 && !c1Summary.isCredit, 'Case 1 has isolated agreed 50k, paid 20k, outstanding 30k');

    const c2Summary = caseSums.find((c: any) => c.caseId === multiCase2.id);
    assert(c2Summary && c2Summary.agreedPaisa === 10000000 && c2Summary.paidPaisa === 10000000 && c2Summary.outstandingPaisa === 0 && !c2Summary.isCredit, 'Case 2 has isolated agreed 100k, paid 100k, outstanding 0');

    const c3Summary = caseSums.find((c: any) => c.caseId === multiCase3.id);
    assert(c3Summary && c3Summary.agreedPaisa === 4000000 && c3Summary.paidPaisa === 5000000 && c3Summary.isCredit && c3Summary.creditPaisa === 1000000, 'Case 3 has isolated agreed 40k, paid 50k, credit 10k');

    // Case-filtered summary endpoint
    const c1FilteredRes = await fetch(`${baseUrl}/api/v1/accounts/summary?caseId=${multiCase1.id}`, {
      headers: { Cookie: ownerCookie },
    });
    const c1Filtered = await c1FilteredRes.json();
    assert(c1Filtered.totalAgreedPaisa === 5000000 && c1Filtered.outstandingPaisa === 3000000, 'Case-filtered summary isolated to single case');

    // 13.4 Idempotency duplicate cannot leak a case the user cannot see
    const restrictedSecretKey = `secret-restricted-idemp-${Date.now()}`;
    const ownerRestrictedPayRes = await fetch(`${baseUrl}/api/v1/fee-payments`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: ownerCookie },
      body: JSON.stringify({
        feeAgreementId: restrictedAg.id,
        paymentDate: '2026-10-25',
        amountPaisa: 3000000,
        method: 'cash',
        purposeNote: 'Owner confidential payment',
        idempotencyKey: restrictedSecretKey,
      }),
    });
    assert(ownerRestrictedPayRes.status === 201, 'Owner records payment on restricted case');

    // Ensure staff has accounts permissions but NOT restricted.view
    await db.updateUser(staffUser.id, {
      permissions: ['accounts.view', 'accounts.manage'],
    });

    // Staff tries to post with the secret idempotency key
    const staffIdempLeakRes = await fetch(`${baseUrl}/api/v1/fee-payments`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: staffCookie },
      body: JSON.stringify({
        feeAgreementId: restrictedAg.id,
        paymentDate: '2026-10-25',
        amountPaisa: 3000000,
        method: 'cash',
        purposeNote: 'Staff fishing with idempotency key',
        idempotencyKey: restrictedSecretKey,
      }),
    });
    assert(staffIdempLeakRes.status === 400 || staffIdempLeakRes.status === 404, 'Staff cannot leak restricted case payment via duplicate idempotency key (HTTP 400/404)');
    const staffIdempLeakBody = await staffIdempLeakRes.json();
    assert(!staffIdempLeakBody.receiptNumber && !staffIdempLeakBody.amountPaisa, 'Idempotency response does not leak payment or receipt details');

    // 13.5 Concurrent same-key posts return one record
    const concurrentKey = `concurrent-test-key-${Date.now()}`;
    const [conc1, conc2] = await Promise.all([
      fetch(`${baseUrl}/api/v1/fee-payments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: ownerCookie },
        body: JSON.stringify({
          feeAgreementId: agMulti1.id,
          paymentDate: '2026-10-25',
          amountPaisa: 500000,
          method: 'cash',
          purposeNote: 'Concurrent race test',
          idempotencyKey: concurrentKey,
        }),
      }),
      fetch(`${baseUrl}/api/v1/fee-payments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: ownerCookie },
        body: JSON.stringify({
          feeAgreementId: agMulti1.id,
          paymentDate: '2026-10-25',
          amountPaisa: 500000,
          method: 'cash',
          purposeNote: 'Concurrent race test',
          idempotencyKey: concurrentKey,
        }),
      }),
    ]);
    assert((conc1.status === 200 || conc1.status === 201) && (conc2.status === 200 || conc2.status === 201), 'Both concurrent requests succeed');
    const concBody1 = await conc1.json();
    const concBody2 = await conc2.json();
    assert(concBody1.id === concBody2.id, 'Concurrent requests return identical payment record ID');
    assert(concBody1.receiptNumber === concBody2.receiptNumber, 'Concurrent requests return identical receipt number');

    // 13.6 Legacy unassigned shown separately and attachable
    const legacyPay = await db.insertFeePayment({
      id: `pay-legacy-${Date.now()}`,
      firmId: 'firm-bd-001',
      clientId: clientMulti.id,
      caseId: null,
      feeAgreementId: null,
      receiptNumber: `R-LEGACY-${Date.now()}`,
      paymentDate: '2026-09-01',
      amountPaisa: 1500000,
      method: 'cash',
      status: 'posted',
      legacyUnassigned: true,
      purposeNote: 'Legacy unassigned deposit before module update',
      idempotencyKey: `idemp-legacy-${Date.now()}`,
      createdAt: new Date(),
      updatedAt: new Date(),
      deletedAt: null,
      createdBy: 'user-owner-001',
      updatedBy: 'user-owner-001',
    });

    const listLegacyRes = await fetch(`${baseUrl}/api/v1/fee-payments?clientId=${clientMulti.id}&legacyUnassigned=true`, {
      headers: { Cookie: ownerCookie },
    });
    assert(listLegacyRes.status === 200, 'List legacy unassigned payments succeeds');
    const legacyList = await listLegacyRes.json();
    const foundLegacy = legacyList.find((p: any) => p.id === legacyPay.id);
    assert(!!foundLegacy, 'Legacy unassigned payment returned in filtered query');

    // Attach legacy payment to agMulti1 (Case 1)
    const attachRes = await fetch(`${baseUrl}/api/v1/fee-payments/${legacyPay.id}/attach`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: ownerCookie },
      body: JSON.stringify({ feeAgreementId: agMulti1.id }),
    });
    assert(attachRes.status === 200, 'Legacy payment attached to agreement (HTTP 200)');
    const attachedBody = await attachRes.json();
    assert(attachedBody.feeAgreementId === agMulti1.id, 'Attached payment has feeAgreementId updated');
    assert(attachedBody.caseId === multiCase1.id, 'Attached payment has caseId derived from agreement');
    assert(attachedBody.legacyUnassigned === false, 'legacyUnassigned cleared to false');

    console.log('\n========================================');
    console.log(`ACCOUNTS MODULE TESTS COMPLETE: ${passed} passed, ${failed} failed`);
    console.log('========================================');

    if (failed > 0) {
      process.exit(1);
    }
  } catch (err) {
    console.error('Fatal test error:', err);
    process.exit(1);
  } finally {
    server.close();
  }
}

runTests();
