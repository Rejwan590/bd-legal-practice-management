process.env.JWT_SECRET = 'valid_test_secret_key_at_least_32_chars_long_1234567890';
process.env.ADMIN_JWT_SECRET = 'valid_admin_secret_key_at_least_32_chars_long_9876543210';
process.env.NODE_ENV = 'test';

import http from 'http';
import { createApp } from '../src/app.js';
import { getDatabase } from '../src/db/client.js';
import { SEED_PASSWORDS } from '../src/db/seed.js';

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

function extractCookie(res: Response): string {
  const cookie = res.headers.get('set-cookie') || '';
  const match = cookie.match(/access_token=([^;]+)/);
  return match ? `access_token=${match[1]}` : '';
}

async function runChamberExpensesTests() {
  console.log('--- STARTING CHAMBER EXPENSES & CASE BALANCES TEST SUITE ---');
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
    // 1. Owner Login
    const ownerLoginRes = await fetch(`${baseUrl}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Origin: baseUrl },
      body: JSON.stringify({
        email: 'owner@firm.bd',
        password: SEED_PASSWORDS.owner,
      }),
    });
    const ownerCookie = extractCookie(ownerLoginRes);
    assert(ownerLoginRes.status === 200 && Boolean(ownerCookie), 'Owner can log in and gets session cookie');

    // 2. Staff Login
    const staffLoginRes = await fetch(`${baseUrl}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Origin: baseUrl },
      body: JSON.stringify({
        email: 'staff@firm.bd',
        password: SEED_PASSWORDS.staff,
      }),
    });
    const staffCookie = extractCookie(staffLoginRes);
    assert(staffLoginRes.status === 200 && Boolean(staffCookie), 'Staff can log in and gets session cookie');

    // 3. Test Category auto-seeding
    const catRes = await fetch(`${baseUrl}/api/v1/chamber-expenses/categories`, {
      headers: { Cookie: ownerCookie },
    });
    assert(catRes.status === 200, 'GET /chamber-expenses/categories returns 200');
    const categories = await catRes.json();
    assert(Array.isArray(categories) && categories.length >= 8, 'Seeds 8 default chamber expense categories');
    const names = categories.map((c: any) => c.name);
    assert(
      names.includes('Food and refreshments') &&
      names.includes('Office supplies') &&
      names.includes('Utilities (electricity, internet, water)') &&
      names.includes('Rent') &&
      names.includes('Staff salary') &&
      names.includes('Payments for specific work') &&
      names.includes('Transportation') &&
      names.includes('Miscellaneous'),
      'All 8 required default categories are present'
    );

    // 4. Create custom category
    const createCatRes = await fetch(`${baseUrl}/api/v1/chamber-expenses/categories`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: ownerCookie, Origin: baseUrl },
      body: JSON.stringify({
        name: 'Books & Law Reports',
        nameBn: 'বই ও আইন জার্নাল',
        kind: 'general',
      }),
    });
    assert(createCatRes.status === 201, 'POST /chamber-expenses/categories creates custom category');
    const customCat = await createCatRes.json();
    assert(customCat.name === 'Books & Law Reports', 'Custom category has correct name');

    // 5. Record chamber expense
    const recordExpRes = await fetch(`${baseUrl}/api/v1/chamber-expenses`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: ownerCookie, Origin: baseUrl },
      body: JSON.stringify({
        categoryId: customCat.id,
        description: 'Supreme Court Case Digest 2025 Volume',
        amountPaisa: 250000, // 2500 BDT
        expenseDate: '2026-03-15',
        paidTo: 'Law Book Society',
        paymentMethod: 'cash',
        receiptRef: 'VCH-001',
      }),
    });
    assert(recordExpRes.status === 201, 'POST /chamber-expenses records operational expense');
    const recordedExp = await recordExpRes.json();
    assert(recordedExp.amountPaisa === 250000 && recordedExp.status === 'posted', 'Recorded expense has status posted');

    // 6. List chamber expenses
    const listExpRes = await fetch(`${baseUrl}/api/v1/chamber-expenses`, {
      headers: { Cookie: ownerCookie },
    });
    assert(listExpRes.status === 200, 'GET /chamber-expenses returns 200');
    const expList = await listExpRes.json();
    const foundExp = expList.find((e: any) => e.id === recordedExp.id);
    assert(Boolean(foundExp) && foundExp.categoryName === 'Books & Law Reports', 'Listed expense includes categoryName');

    // 7. Staff advance management
    const giveAdvRes = await fetch(`${baseUrl}/api/v1/chamber-expenses/advances`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: ownerCookie, Origin: baseUrl },
      body: JSON.stringify({
        givenTo: 'Kamal Hossain (Clerk)',
        amountPaisa: 500000, // 5000 BDT
        givenDate: '2026-03-10',
        purpose: 'Court filing fees and stamps petty cash',
        paymentMethod: 'cash',
      }),
    });
    assert(giveAdvRes.status === 201, 'POST /chamber-expenses/advances gives staff advance');
    const recordedAdv = await giveAdvRes.json();
    assert(recordedAdv.status === 'open' && recordedAdv.amountPaisa === 500000, 'Advance recorded with status open');

    // 8. Settle advance part by expense
    const settleExpRes = await fetch(`${baseUrl}/api/v1/chamber-expenses/advances/${recordedAdv.id}/settle`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: ownerCookie, Origin: baseUrl },
      body: JSON.stringify({
        type: 'expense',
        amountPaisa: 300000, // 3000 BDT
        settledDate: '2026-03-12',
        notes: 'Submitted stamp purchase receipt',
      }),
    });
    assert(settleExpRes.status === 201, 'POST /advances/:id/settle settles partial advance by expense');

    const checkAdvRes = await fetch(`${baseUrl}/api/v1/chamber-expenses/advances/${recordedAdv.id}`, {
      headers: { Cookie: ownerCookie },
    });
    const checkAdv = await checkAdvRes.json();
    assert(checkAdv.settledAmountPaisa === 300000, 'Advance tracked settledAmountPaisa correctly (300000)');
    assert(checkAdv.remainingAmountPaisa === 200000, 'Advance tracked remainingAmountPaisa correctly (200000)');
    assert(checkAdv.status === 'open', 'Advance remains open while remaining > 0');

    // 9. Rejection when settling amount exceeds remaining balance
    const settleExcessRes = await fetch(`${baseUrl}/api/v1/chamber-expenses/advances/${recordedAdv.id}/settle`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: ownerCookie, Origin: baseUrl },
      body: JSON.stringify({
        type: 'refund',
        amountPaisa: 500000, // exceeds remaining 200000
        settledDate: '2026-03-12',
      }),
    });
    assert(settleExcessRes.status === 400, 'Reject settlement exceeding remaining balance with HTTP 400');

    // 10. Settle remaining balance by cash refund
    const settleRefundRes = await fetch(`${baseUrl}/api/v1/chamber-expenses/advances/${recordedAdv.id}/settle`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: ownerCookie, Origin: baseUrl },
      body: JSON.stringify({
        type: 'refund',
        amountPaisa: 200000,
        settledDate: '2026-03-14',
        notes: 'Refunded remaining unused cash',
      }),
    });
    assert(settleRefundRes.status === 201, 'POST /advances/:id/settle settles remaining balance by refund');

    const checkSettledAdvRes = await fetch(`${baseUrl}/api/v1/chamber-expenses/advances/${recordedAdv.id}`, {
      headers: { Cookie: ownerCookie },
    });
    const checkSettledAdv = await checkSettledAdvRes.json();
    assert(checkSettledAdv.settledAmountPaisa === 500000, 'Advance fully settled (500000)');
    assert(checkSettledAdv.remainingAmountPaisa === 0, 'Advance remaining is 0');
    assert(checkSettledAdv.status === 'settled', 'Advance status transitioned to settled');

    // 11. Reject voiding advance that has settlements
    const voidSettledAdvRes = await fetch(`${baseUrl}/api/v1/chamber-expenses/advances/${recordedAdv.id}/void`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: ownerCookie, Origin: baseUrl },
      body: JSON.stringify({ voidReason: 'Cancelled' }),
    });
    assert(voidSettledAdvRes.status === 400, 'Cannot void advance with existing settlements (HTTP 400)');

    // 12. Void chamber expense
    const voidExpRes = await fetch(`${baseUrl}/api/v1/chamber-expenses/${recordedExp.id}/void`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: ownerCookie, Origin: baseUrl },
      body: JSON.stringify({ voidReason: 'Book order cancelled by supplier' }),
    });
    assert(voidExpRes.status === 200, 'POST /chamber-expenses/:id/void voids expense');
    const voidedExp = await voidExpRes.json();
    assert(voidedExp.status === 'void', 'Expense status is void');
    assert(voidedExp.voidReason === 'Book order cancelled by supplier', 'Expense captures voidReason');

    // 13. Case-level Billing List API (Change E)
    const caseBalancesRes = await fetch(`${baseUrl}/api/v1/accounts/case-balances`, {
      headers: { Cookie: ownerCookie },
    });
    assert(caseBalancesRes.status === 200, 'GET /accounts/case-balances returns HTTP 200');
    const caseBalances = await caseBalancesRes.json();
    assert(Array.isArray(caseBalances), 'Returns array of case balance entries');
    if (caseBalances.length > 0) {
      const first = caseBalances[0];
      assert('clientId' in first && 'clientName' in first && 'caseId' in first, 'Has required fields');
      assert('totalAgreedPaisa' in first && 'totalPaidPaisa' in first && 'balancePaisa' in first, 'Has financial metrics');
    }

    console.log(`\n========================================`);
    console.log(`CHAMBER EXPENSES TEST RESULTS: ${passed} PASSED, ${failed} FAILED`);
    console.log(`========================================\n`);

    if (failed > 0) process.exit(1);
  } finally {
    server.close();
  }
}

runChamberExpensesTests().catch((err) => {
  console.error('Test runner failure:', err);
  process.exit(1);
});
