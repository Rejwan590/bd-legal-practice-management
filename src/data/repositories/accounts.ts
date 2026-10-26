import { can } from '../../permissions';
import { IAccountsRepository, IAuditLogRepository } from '../interfaces';
import { localStore } from '../mockStore';
import {
  AccountsSummary,
  ClientBalanceOverview,
  Expense,
  ExpenseCategory,
  FeeAgreement,
  FeeAgreementChange,
  FeePayment,
  FeeType,
  PaymentMethod,
  SecurityContext,
} from '../types';
import { getVisibleCaseIdsForContext } from './case';
import { assertNotReadOnly, generateUUID } from './common';

export class MockAccountsRepository implements IAccountsRepository {
  private auditRepo: IAuditLogRepository;

  constructor(auditRepo: IAuditLogRepository) {
    this.auditRepo = auditRepo;
  }

  async getSummary(
    context: SecurityContext,
    filter: { clientId?: string; caseId?: string }
  ): Promise<AccountsSummary> {
    if (!can('accounts.view', context.currentUser)) {
      throw new Error('Permission denied: accounts.view required');
    }

    const { currentUser } = context;
    const store = localStore.getData();
    const visibleCaseIds = getVisibleCaseIdsForContext(context);

    const agreements = (store.feeAgreements || []).filter((a) => {
      if (a.firmId !== currentUser.firmId || a.deletedAt !== null || a.status === 'void') return false;
      if (a.caseId && !visibleCaseIds.has(a.caseId)) return false;
      if (filter.clientId && a.clientId !== filter.clientId) return false;
      if (filter.caseId && a.caseId !== filter.caseId) return false;
      return true;
    });
    const totalAgreedPaisa = agreements.reduce((sum, a) => sum + Number(a.agreedAmountPaisa || 0), 0);

    const payments = (store.feePayments || []).filter((p) => {
      if (p.firmId !== currentUser.firmId || p.deletedAt !== null || p.status !== 'posted') return false;
      if (p.caseId && !visibleCaseIds.has(p.caseId)) return false;
      if (filter.clientId && p.clientId !== filter.clientId) return false;
      if (filter.caseId && p.caseId !== filter.caseId) return false;
      return true;
    });
    const totalPaidPaisa = payments.reduce((sum, p) => sum + Number(p.amountPaisa || 0), 0);

    const expenses = (store.expenses || []).filter((e) => {
      if (e.firmId !== currentUser.firmId || e.deletedAt !== null || e.status !== 'posted') return false;
      if (e.caseId && !visibleCaseIds.has(e.caseId)) return false;
      if (filter.clientId && e.clientId !== filter.clientId) return false;
      if (filter.caseId && e.caseId !== filter.caseId) return false;
      return true;
    });
    const totalExpensesPaisa = expenses.reduce((sum, e) => sum + Number(e.amountPaisa || 0), 0);

    const balancePaisa = totalAgreedPaisa - totalPaidPaisa;
    const isCredit = balancePaisa < 0;
    const creditPaisa = isCredit ? Math.abs(balancePaisa) : 0;
    const outstandingPaisa = isCredit ? 0 : balancePaisa;

    return {
      totalAgreedPaisa,
      totalPaidPaisa,
      balancePaisa,
      isCredit,
      creditPaisa,
      outstandingPaisa,
      totalExpensesPaisa,
    };
  }

  async getClientBalances(context: SecurityContext): Promise<ClientBalanceOverview[]> {
    if (!can('accounts.view', context.currentUser)) {
      throw new Error('Permission denied: accounts.view required');
    }

    const { currentUser } = context;
    const store = localStore.getData();
    const visibleCaseIds = getVisibleCaseIdsForContext(context);

    const clients = (store.clients || []).filter(
      (c) => c.firmId === currentUser.firmId && c.deletedAt === null
    );

    return clients.map((c) => {
      const agreements = (store.feeAgreements || []).filter((a) => {
        if (a.firmId !== currentUser.firmId || a.deletedAt !== null || a.status === 'void' || a.clientId !== c.id) {
          return false;
        }
        if (a.caseId && !visibleCaseIds.has(a.caseId)) return false;
        return true;
      });
      const totalAgreedPaisa = agreements.reduce((sum, a) => sum + Number(a.agreedAmountPaisa || 0), 0);

      const payments = (store.feePayments || []).filter((p) => {
        if (p.firmId !== currentUser.firmId || p.deletedAt !== null || p.status !== 'posted' || p.clientId !== c.id) {
          return false;
        }
        if (p.caseId && !visibleCaseIds.has(p.caseId)) return false;
        return true;
      });
      const totalPaidPaisa = payments.reduce((sum, p) => sum + Number(p.amountPaisa || 0), 0);

      const balancePaisa = totalAgreedPaisa - totalPaidPaisa;
      const isCredit = balancePaisa < 0;
      const creditPaisa = isCredit ? Math.abs(balancePaisa) : 0;
      const outstandingPaisa = isCredit ? 0 : balancePaisa;

      return {
        clientId: c.id,
        clientName: c.name,
        clientNameBn: c.nameBn,
        clientPhone: c.phone,
        totalAgreedPaisa,
        totalPaidPaisa,
        balancePaisa,
        isCredit,
        creditPaisa,
        outstandingPaisa,
      };
    });
  }

  async listAgreements(
    context: SecurityContext,
    filter?: { clientId?: string; caseId?: string; status?: string }
  ): Promise<FeeAgreement[]> {
    if (!can('accounts.view', context.currentUser)) {
      throw new Error('Permission denied: accounts.view required');
    }

    const { currentUser } = context;
    const store = localStore.getData();
    const visibleCaseIds = getVisibleCaseIdsForContext(context);

    let list = (store.feeAgreements || []).filter((a) => {
      if (a.firmId !== currentUser.firmId || a.deletedAt !== null) return false;
      if (a.caseId && !visibleCaseIds.has(a.caseId)) return false;
      if (filter?.clientId && a.clientId !== filter.clientId) return false;
      if (filter?.caseId && a.caseId !== filter.caseId) return false;
      if (filter?.status && a.status !== filter.status) return false;
      return true;
    });

    return list.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }

  async getAgreementById(context: SecurityContext, id: string): Promise<FeeAgreement | null> {
    if (!can('accounts.view', context.currentUser)) {
      throw new Error('Permission denied: accounts.view required');
    }

    const { currentUser } = context;
    const store = localStore.getData();
    const agreement = (store.feeAgreements || []).find(
      (a) => a.id === id && a.firmId === currentUser.firmId && a.deletedAt === null
    );
    if (!agreement) return null;

    if (agreement.caseId) {
      const visibleCaseIds = getVisibleCaseIdsForContext(context);
      if (!visibleCaseIds.has(agreement.caseId)) return null;
    }
    return agreement;
  }

  async createAgreement(
    context: SecurityContext,
    agreement: {
      clientId: string;
      caseId?: string | null;
      feeType: FeeType;
      agreedAmountPaisa: number;
      agreementDate: string;
      notes?: string | null;
    }
  ): Promise<FeeAgreement> {
    if (!can('accounts.manage', context.currentUser)) {
      throw new Error('Permission denied: accounts.manage required');
    }
    assertNotReadOnly(context.currentUser.firmId);

    const { currentUser } = context;
    const now = new Date().toISOString();
    const newAgreement: FeeAgreement = {
      id: `fa-${generateUUID()}`,
      firmId: currentUser.firmId,
      clientId: agreement.clientId,
      caseId: agreement.caseId || null,
      feeType: agreement.feeType,
      agreedAmountPaisa: agreement.agreedAmountPaisa,
      agreementDate: agreement.agreementDate,
      notes: agreement.notes || null,
      status: 'active',
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
      createdBy: currentUser.id,
      updatedBy: currentUser.id,
    };

    localStore.mutate((data) => {
      if (!data.feeAgreements) data.feeAgreements = [];
      data.feeAgreements.unshift(newAgreement);
    });

    await this.auditRepo.record(context, {
      entity: 'FeeAgreement',
      entityId: newAgreement.id,
      action: 'CREATE',
      oldValue: null,
      newValue: newAgreement as unknown as Record<string, unknown>,
    });

    return newAgreement;
  }

  async reviseAgreement(
    context: SecurityContext,
    id: string,
    newAmountPaisa: number,
    reason: string
  ): Promise<FeeAgreement> {
    if (!can('accounts.manage', context.currentUser)) {
      throw new Error('Permission denied: accounts.manage required');
    }
    assertNotReadOnly(context.currentUser.firmId);

    const { currentUser } = context;
    const store = localStore.getData();
    const existing = (store.feeAgreements || []).find(
      (a) => a.id === id && a.firmId === currentUser.firmId && a.deletedAt === null
    );
    if (!existing) throw new Error('Fee agreement not found');

    const oldAmountPaisa = existing.agreedAmountPaisa;
    const now = new Date().toISOString();

    const change: FeeAgreementChange = {
      id: `fac-${generateUUID()}`,
      firmId: currentUser.firmId,
      feeAgreementId: existing.id,
      oldAmountPaisa,
      newAmountPaisa,
      reason,
      changedBy: currentUser.id,
      createdAt: now,
    };

    let updated!: FeeAgreement;

    localStore.mutate((data) => {
      if (!data.feeAgreementChanges) data.feeAgreementChanges = [];
      data.feeAgreementChanges.push(change);

      const idx = (data.feeAgreements || []).findIndex((a) => a.id === id);
      if (idx !== -1) {
        data.feeAgreements![idx] = {
          ...data.feeAgreements![idx],
          agreedAmountPaisa: newAmountPaisa,
          updatedAt: now,
          updatedBy: currentUser.id,
        };
        updated = data.feeAgreements![idx];
      }
    });

    await this.auditRepo.record(context, {
      entity: 'FeeAgreement',
      entityId: id,
      action: 'UPDATE',
      oldValue: existing as unknown as Record<string, unknown>,
      newValue: { ...updated, changeReason: reason } as unknown as Record<string, unknown>,
    });

    return updated;
  }

  async closeAgreement(context: SecurityContext, id: string): Promise<FeeAgreement> {
    if (!can('accounts.manage', context.currentUser)) {
      throw new Error('Permission denied: accounts.manage required');
    }
    assertNotReadOnly(context.currentUser.firmId);

    const { currentUser } = context;
    const store = localStore.getData();
    const existing = (store.feeAgreements || []).find(
      (a) => a.id === id && a.firmId === currentUser.firmId && a.deletedAt === null
    );
    if (!existing) throw new Error('Fee agreement not found');

    let updated!: FeeAgreement;
    const now = new Date().toISOString();

    localStore.mutate((data) => {
      const idx = (data.feeAgreements || []).findIndex((a) => a.id === id);
      if (idx !== -1) {
        data.feeAgreements![idx] = {
          ...data.feeAgreements![idx],
          status: 'closed',
          updatedAt: now,
          updatedBy: currentUser.id,
        };
        updated = data.feeAgreements![idx];
      }
    });

    await this.auditRepo.record(context, {
      entity: 'FeeAgreement',
      entityId: id,
      action: 'UPDATE',
      oldValue: existing as unknown as Record<string, unknown>,
      newValue: updated as unknown as Record<string, unknown>,
    });

    return updated;
  }

  async voidAgreement(context: SecurityContext, id: string, reason: string): Promise<FeeAgreement> {
    if (!can('accounts.manage', context.currentUser)) {
      throw new Error('Permission denied: accounts.manage required');
    }
    assertNotReadOnly(context.currentUser.firmId);

    const { currentUser } = context;
    const store = localStore.getData();
    const existing = (store.feeAgreements || []).find(
      (a) => a.id === id && a.firmId === currentUser.firmId && a.deletedAt === null
    );
    if (!existing) throw new Error('Fee agreement not found');

    let updated!: FeeAgreement;
    const now = new Date().toISOString();

    localStore.mutate((data) => {
      const idx = (data.feeAgreements || []).findIndex((a) => a.id === id);
      if (idx !== -1) {
        data.feeAgreements![idx] = {
          ...data.feeAgreements![idx],
          status: 'void',
          updatedAt: now,
          updatedBy: currentUser.id,
        };
        updated = data.feeAgreements![idx];
      }
    });

    await this.auditRepo.record(context, {
      entity: 'FeeAgreement',
      entityId: id,
      action: 'UPDATE',
      oldValue: existing as unknown as Record<string, unknown>,
      newValue: { ...updated, voidReason: reason } as unknown as Record<string, unknown>,
    });

    return updated;
  }

  async listAgreementChanges(context: SecurityContext, agreementId: string): Promise<FeeAgreementChange[]> {
    if (!can('accounts.view', context.currentUser)) {
      throw new Error('Permission denied: accounts.view required');
    }
    const store = localStore.getData();
    return (store.feeAgreementChanges || [])
      .filter((c) => c.feeAgreementId === agreementId && c.firmId === context.currentUser.firmId)
      .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
  }

  async listPayments(
    context: SecurityContext,
    filter?: { clientId?: string; caseId?: string; feeAgreementId?: string; status?: string }
  ): Promise<FeePayment[]> {
    if (!can('accounts.view', context.currentUser)) {
      throw new Error('Permission denied: accounts.view required');
    }

    const { currentUser } = context;
    const store = localStore.getData();
    const visibleCaseIds = getVisibleCaseIdsForContext(context);

    let list = (store.feePayments || []).filter((p) => {
      if (p.firmId !== currentUser.firmId || p.deletedAt !== null) return false;
      if (p.caseId && !visibleCaseIds.has(p.caseId)) return false;
      if (filter?.clientId && p.clientId !== filter.clientId) return false;
      if (filter?.caseId && p.caseId !== filter.caseId) return false;
      if (filter?.feeAgreementId && p.feeAgreementId !== filter.feeAgreementId) return false;
      if (filter?.status && p.status !== filter.status) return false;
      return true;
    });

    return list.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }

  async getPaymentById(context: SecurityContext, id: string): Promise<FeePayment | null> {
    if (!can('accounts.view', context.currentUser)) {
      throw new Error('Permission denied: accounts.view required');
    }

    const { currentUser } = context;
    const store = localStore.getData();
    const payment = (store.feePayments || []).find(
      (p) => p.id === id && p.firmId === currentUser.firmId && p.deletedAt === null
    );
    if (!payment) return null;

    if (payment.caseId) {
      const visibleCaseIds = getVisibleCaseIdsForContext(context);
      if (!visibleCaseIds.has(payment.caseId)) return null;
    }
    return payment;
  }

  async recordPayment(
    context: SecurityContext,
    payment: {
      clientId: string;
      caseId?: string | null;
      feeAgreementId?: string | null;
      hearingId?: string | null;
      paymentDate: string;
      amountPaisa: number;
      method: PaymentMethod;
      reference?: string | null;
      purposeNote: string;
      idempotencyKey: string;
    }
  ): Promise<FeePayment> {
    if (!can('accounts.manage', context.currentUser)) {
      throw new Error('Permission denied: accounts.manage required');
    }
    assertNotReadOnly(context.currentUser.firmId);

    const { currentUser } = context;
    const store = localStore.getData();

    // Idempotency check
    const existing = (store.feePayments || []).find(
      (p) => p.firmId === currentUser.firmId && p.idempotencyKey === payment.idempotencyKey && p.deletedAt === null
    );
    if (existing) {
      return existing;
    }

    // Sequence calculation
    const existingReceipts = (store.feePayments || [])
      .filter((p) => p.firmId === currentUser.firmId)
      .map((p) => {
        const num = parseInt(p.receiptNumber.replace(/^R-/, ''), 10);
        return isNaN(num) ? 0 : num;
      });
    const nextVal = existingReceipts.length > 0 ? Math.max(...existingReceipts) + 1 : 1;
    const receiptNumber = `R-${String(nextVal).padStart(6, '0')}`;

    const now = new Date().toISOString();
    const newPayment: FeePayment = {
      id: `pay-${generateUUID()}`,
      firmId: currentUser.firmId,
      clientId: payment.clientId,
      caseId: payment.caseId || null,
      feeAgreementId: payment.feeAgreementId || null,
      hearingId: payment.hearingId || null,
      paymentDate: payment.paymentDate,
      amountPaisa: payment.amountPaisa,
      method: payment.method,
      reference: payment.reference || null,
      receiptNumber,
      purposeNote: payment.purposeNote,
      status: 'posted',
      voidReason: null,
      voidedBy: null,
      voidedAt: null,
      idempotencyKey: payment.idempotencyKey,
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
      createdBy: currentUser.id,
      updatedBy: currentUser.id,
    };

    localStore.mutate((data) => {
      if (!data.feePayments) data.feePayments = [];
      data.feePayments.unshift(newPayment);
    });

    await this.auditRepo.record(context, {
      entity: 'FeePayment',
      entityId: newPayment.id,
      action: 'CREATE',
      oldValue: null,
      newValue: newPayment as unknown as Record<string, unknown>,
    });

    return newPayment;
  }

  async voidPayment(context: SecurityContext, id: string, reason: string): Promise<FeePayment> {
    if (!can('accounts.manage', context.currentUser)) {
      throw new Error('Permission denied: accounts.manage required');
    }
    assertNotReadOnly(context.currentUser.firmId);

    const { currentUser } = context;
    const store = localStore.getData();
    const existing = (store.feePayments || []).find(
      (p) => p.id === id && p.firmId === currentUser.firmId && p.deletedAt === null
    );
    if (!existing) throw new Error('Fee payment not found');
    if (existing.status === 'void') throw new Error('Payment is already voided');

    let updated!: FeePayment;
    const now = new Date().toISOString();

    localStore.mutate((data) => {
      const idx = (data.feePayments || []).findIndex((p) => p.id === id);
      if (idx !== -1) {
        data.feePayments![idx] = {
          ...data.feePayments![idx],
          status: 'void',
          voidReason: reason,
          voidedBy: currentUser.id,
          voidedAt: now,
          updatedAt: now,
          updatedBy: currentUser.id,
        };
        updated = data.feePayments![idx];
      }
    });

    await this.auditRepo.record(context, {
      entity: 'FeePayment',
      entityId: id,
      action: 'UPDATE',
      oldValue: existing as unknown as Record<string, unknown>,
      newValue: updated as unknown as Record<string, unknown>,
    });

    return updated;
  }

  async listExpenseCategories(context: SecurityContext): Promise<ExpenseCategory[]> {
    const store = localStore.getData();
    let categories = (store.expenseCategories || []).filter(
      (c) => c.firmId === context.currentUser.firmId && c.deletedAt === null
    );
    if (categories.length === 0) {
      const defaultNames = [
        'Court Fees',
        'Process Server / Notice',
        'Certified Copy',
        'Stamp Duty',
        'Travel / Conveyance',
        'Photocopy & Typing',
        'Miscellaneous',
      ];
      const now = new Date().toISOString();
      const seeded: ExpenseCategory[] = defaultNames.map((name) => ({
        id: `expcat-${generateUUID()}`,
        firmId: context.currentUser.firmId,
        name,
        isDefault: true,
        createdAt: now,
        updatedAt: now,
        deletedAt: null,
        createdBy: context.currentUser.id,
        updatedBy: context.currentUser.id,
      }));
      localStore.mutate((data) => {
        if (!data.expenseCategories) data.expenseCategories = [];
        data.expenseCategories.push(...seeded);
      });
      categories = seeded;
    }
    return categories;
  }

  async listExpenses(
    context: SecurityContext,
    filter?: { clientId?: string; caseId?: string; categoryId?: string; status?: string }
  ): Promise<Array<Expense & { categoryName?: string }>> {
    if (!can('accounts.view', context.currentUser)) {
      throw new Error('Permission denied: accounts.view required');
    }

    const { currentUser } = context;
    const store = localStore.getData();
    const visibleCaseIds = getVisibleCaseIdsForContext(context);

    let list = (store.expenses || []).filter((e) => {
      if (e.firmId !== currentUser.firmId || e.deletedAt !== null) return false;
      if (e.caseId && !visibleCaseIds.has(e.caseId)) return false;
      if (filter?.clientId && e.clientId !== filter.clientId) return false;
      if (filter?.caseId && e.caseId !== filter.caseId) return false;
      if (filter?.categoryId && e.categoryId !== filter.categoryId) return false;
      if (filter?.status && e.status !== filter.status) return false;
      return true;
    });

    return list
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .map((e) => {
        const cat = (store.expenseCategories || []).find((c) => c.id === e.categoryId);
        return {
          ...e,
          categoryName: cat ? cat.name : 'Unknown Category',
        };
      });
  }

  async getExpenseById(context: SecurityContext, id: string): Promise<(Expense & { categoryName?: string }) | null> {
    if (!can('accounts.view', context.currentUser)) {
      throw new Error('Permission denied: accounts.view required');
    }

    const { currentUser } = context;
    const store = localStore.getData();
    const expense = (store.expenses || []).find(
      (e) => e.id === id && e.firmId === currentUser.firmId && e.deletedAt === null
    );
    if (!expense) return null;

    if (expense.caseId) {
      const visibleCaseIds = getVisibleCaseIdsForContext(context);
      if (!visibleCaseIds.has(expense.caseId)) return null;
    }
    const cat = (store.expenseCategories || []).find((c) => c.id === expense.categoryId);
    return {
      ...expense,
      categoryName: cat ? cat.name : 'Unknown Category',
    };
  }

  async recordExpense(
    context: SecurityContext,
    expense: {
      clientId?: string | null;
      caseId?: string | null;
      categoryId: string;
      expenseDate: string;
      amountPaisa: number;
      description: string;
      reimbursable?: boolean;
    }
  ): Promise<Expense> {
    if (!can('expenses.record', context.currentUser)) {
      throw new Error('Permission denied: expenses.record required');
    }
    assertNotReadOnly(context.currentUser.firmId);

    const { currentUser } = context;
    const now = new Date().toISOString();
    const newExpense: Expense = {
      id: `exp-${generateUUID()}`,
      firmId: currentUser.firmId,
      clientId: expense.clientId || null,
      caseId: expense.caseId || null,
      categoryId: expense.categoryId,
      expenseDate: expense.expenseDate,
      amountPaisa: expense.amountPaisa,
      description: expense.description,
      reimbursable: expense.reimbursable ?? true,
      status: 'posted',
      voidReason: null,
      voidedBy: null,
      voidedAt: null,
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
      createdBy: currentUser.id,
      updatedBy: currentUser.id,
    };

    localStore.mutate((data) => {
      if (!data.expenses) data.expenses = [];
      data.expenses.unshift(newExpense);
    });

    await this.auditRepo.record(context, {
      entity: 'Expense',
      entityId: newExpense.id,
      action: 'CREATE',
      oldValue: null,
      newValue: newExpense as unknown as Record<string, unknown>,
    });

    return newExpense;
  }

  async voidExpense(context: SecurityContext, id: string, reason: string): Promise<Expense> {
    if (!can('expenses.record', context.currentUser)) {
      throw new Error('Permission denied: expenses.record required');
    }
    assertNotReadOnly(context.currentUser.firmId);

    const { currentUser } = context;
    const store = localStore.getData();
    const existing = (store.expenses || []).find(
      (e) => e.id === id && e.firmId === currentUser.firmId && e.deletedAt === null
    );
    if (!existing) throw new Error('Expense not found');
    if (existing.status === 'void') throw new Error('Expense is already voided');

    let updated!: Expense;
    const now = new Date().toISOString();

    localStore.mutate((data) => {
      const idx = (data.expenses || []).findIndex((e) => e.id === id);
      if (idx !== -1) {
        data.expenses![idx] = {
          ...data.expenses![idx],
          status: 'void',
          voidReason: reason,
          voidedBy: currentUser.id,
          voidedAt: now,
          updatedAt: now,
          updatedBy: currentUser.id,
        };
        updated = data.expenses![idx];
      }
    });

    await this.auditRepo.record(context, {
      entity: 'Expense',
      entityId: id,
      action: 'UPDATE',
      oldValue: existing as unknown as Record<string, unknown>,
      newValue: updated as unknown as Record<string, unknown>,
    });

    return updated;
  }
}
