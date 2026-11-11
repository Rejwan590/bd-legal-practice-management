import { SecurityContext } from '../../../data/types';
import { DiagnosticContext, TestResult } from './types';
import enLocale from '../../../locales/en.json';
import bnLocale from '../../../locales/bn.json';

export async function runBillingLedgerTests(ctx: DiagnosticContext): Promise<TestResult[]> {
  const suite: TestResult[] = [];
  const { repos, ownerCtx, staffUser } = ctx;

  // Test: Case 88/90 Unified Billing Ledger Workflow in MockAccountsRepository
  try {
    const client = await repos.client.create(ownerCtx, {
      name: 'Partition Suit Client',
      nameBn: 'বাটোয়ারা মামলার মক্কেল',
      phone: '+8801711889000',
      address: 'Motijheel, Dhaka',
      notes: 'Case 88/90 billing test',
    });

    const case88 = await repos.case.create(ownerCtx, {
      clientId: client.id,
      fileSerial: 'FS-88-90',
      caseNumber: '88/90',
      court: 'Joint District Judge Court',
      matterType: 'Civil / Land Title Partition Suit',
      caseCategory: 'civil',
      description: 'Ancestral land partition suit',
      plaintiff: client.name,
      defendant: 'Co-sharers',
      ourRole: 'Plaintiff',
      plaintiffLawyer: 'Senior Counsel',
      defendantLawyer: '',
      caseDate: '2026-11-11',
      status: 'ongoing',
      closedOn: null,
      restricted: false,
      responsibleLawyerId: ctx.ownerUser.id,
    });

    // 1) Create agreement
    const agr = await repos.accounts.createAgreement(ownerCtx, {
      clientId: client.id,
      caseId: case88.id,
      feeType: 'fixed',
      agreedAmountPaisa: 10000000, // 100,000 BDT
      agreementDate: '2026-11-11',
      notes: 'Trial representation',
    });

    // 2) Record payment + idempotency dedup
    const pay1 = await repos.accounts.recordPayment(ownerCtx, {
      feeAgreementId: agr.id,
      paymentDate: '2026-11-11',
      amountPaisa: 3500000,
      method: 'bkash',
      purposeNote: 'First installment 88/90',
      idempotencyKey: 'health-idem-88-90-1',
    });
    const payDup = await repos.accounts.recordPayment(ownerCtx, {
      feeAgreementId: agr.id,
      paymentDate: '2026-11-11',
      amountPaisa: 3500000,
      method: 'bkash',
      purposeNote: 'First installment 88/90',
      idempotencyKey: 'health-idem-88-90-1',
    });

    // 3) Record & Edit Expense
    const cats = await repos.accounts.listExpenseCategories(ownerCtx);
    const exp = await repos.accounts.recordExpense(ownerCtx, {
      clientId: client.id,
      caseId: case88.id,
      categoryId: cats[0].id,
      expenseDate: '2026-11-11',
      amountPaisa: 150000,
      description: 'Partition map copy fee',
      reimbursable: true,
    });
    const editedExp = await repos.accounts.updateExpense(ownerCtx, exp.id, {
      amountPaisa: 175000,
      description: 'Partition map + surveyor fee',
    });

    // 4) Update agreement with revisionReason
    const editedAgr = await repos.accounts.updateAgreement(ownerCtx, agr.id, {
      agreedAmountPaisa: 12500000,
      revisionReason: 'Added commissioner objection hearing',
    });
    const changes = await repos.accounts.listAgreementChanges(ownerCtx, agr.id);

    // 5) Cross-view parity (firm, client, case)
    const [firmAgs, clientAgs, caseAgs, firmPays, clientPays, casePays, firmExps, clientExps, caseExps] =
      await Promise.all([
        repos.accounts.listAgreements(ownerCtx, { search: '88/90' }),
        repos.accounts.listAgreements(ownerCtx, { clientId: client.id }),
        repos.accounts.listAgreements(ownerCtx, { caseId: case88.id }),
        repos.accounts.listPayments(ownerCtx, { search: pay1.receiptNumber }),
        repos.accounts.listPayments(ownerCtx, { clientId: client.id }),
        repos.accounts.listPayments(ownerCtx, { caseId: case88.id }),
        repos.accounts.listExpenses(ownerCtx, { search: 'surveyor' }),
        repos.accounts.listExpenses(ownerCtx, { clientId: client.id }),
        repos.accounts.listExpenses(ownerCtx, { caseId: case88.id }),
      ]);

    const pass =
      pay1.id === payDup.id &&
      firmAgs.some((a) => a.id === agr.id) &&
      clientAgs.some((a) => a.id === agr.id) &&
      caseAgs.some((a) => a.id === agr.id) &&
      editedAgr.paidPaisa === 3500000 &&
      editedAgr.outstandingPaisa === 9000000 &&
      changes.length === 1 &&
      firmPays.length === 1 &&
      clientPays.some((p) => p.id === pay1.id) &&
      casePays.length === 1 &&
      editedExp.amountPaisa === 175000 &&
      firmExps.some((e) => e.id === exp.id) &&
      clientExps.some((e) => e.id === exp.id) &&
      caseExps.some((e) => e.id === exp.id);

    suite.push({
      id: 'billing-ledger-unified-parity',
      name: 'Unified Matters Billing Ledger (Case 88/90, Idempotency & Balances)',
      category: 'Data Layer',
      passed: pass,
      message: pass
        ? 'Agreements, Payments, and Expenses share unified records across Main Billing, Client Dossier, and Case 88/90 with accurate balances and idempotency.'
        : 'Unified Matters Billing Ledger failed parity, balance, or idempotency checks.',
    });
  } catch (err: unknown) {
    suite.push({
      id: 'billing-ledger-unified-parity',
      name: 'Unified Matters Billing Ledger (Case 88/90, Idempotency & Balances)',
      category: 'Data Layer',
      passed: false,
      message: 'Exception in unified billing ledger check.',
      details: err instanceof Error ? err.message : String(err),
    });
  }

  // Test: Permission enforcement & Bilingual i18n key parity for billing.*
  try {
    const noBillingCtx: SecurityContext = {
      currentUser: { ...staffUser, permissions: ['cases.view', 'clients.view'] },
    };
    let denied = false;
    try {
      await repos.accounts.listAgreements(noBillingCtx);
    } catch {
      denied = true;
    }

    const enBillingKeys = Object.keys((enLocale as any).billing || {}).sort();
    const bnBillingKeys = Object.keys((bnLocale as any).billing || {}).sort();
    const keysMatch = JSON.stringify(enBillingKeys) === JSON.stringify(bnBillingKeys);

    const pass = denied && keysMatch;
    suite.push({
      id: 'billing-ledger-perms-and-i18n',
      name: 'Billing Permission Gating & Bilingual (EN/BN) Key Parity',
      category: 'Permissions',
      passed: pass,
      message: pass
        ? `Billing permissions enforced and ${enBillingKeys.length} billing i18n keys match across en.json and bn.json.`
        : `Check failed (denied=${denied}, keysMatch=${keysMatch}).`,
    });
  } catch (err: unknown) {
    suite.push({
      id: 'billing-ledger-perms-and-i18n',
      name: 'Billing Permission Gating & Bilingual (EN/BN) Key Parity',
      category: 'Permissions',
      passed: false,
      message: 'Exception in permission/i18n parity check.',
      details: err instanceof Error ? err.message : String(err),
    });
  }

  return suite;
}
