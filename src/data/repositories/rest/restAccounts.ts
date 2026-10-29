import { IAccountsRepository } from '../../interfaces';
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
} from '../../types';
import { restFetch } from './restCommon';

export class RestAccountsRepository implements IAccountsRepository {
  async getSummary(
    _context: SecurityContext,
    filter: { clientId?: string; caseId?: string }
  ): Promise<AccountsSummary> {
    const params = new URLSearchParams();
    if (filter.clientId) params.set('clientId', filter.clientId);
    if (filter.caseId) params.set('caseId', filter.caseId);
    const qs = params.toString() ? `?${params.toString()}` : '';
    return restFetch<AccountsSummary>(`/accounts/summary${qs}`);
  }

  async getClientBalances(_context: SecurityContext): Promise<ClientBalanceOverview[]> {
    const res = await restFetch<ClientBalanceOverview[]>('/accounts/client-balances');
    return Array.isArray(res) ? res : [];
  }

  async listAgreements(
    _context: SecurityContext,
    filter?: { clientId?: string; caseId?: string; status?: string }
  ): Promise<FeeAgreement[]> {
    const params = new URLSearchParams();
    if (filter?.clientId) params.set('clientId', filter.clientId);
    if (filter?.caseId) params.set('caseId', filter.caseId);
    if (filter?.status) params.set('status', filter.status);
    const qs = params.toString() ? `?${params.toString()}` : '';
    return restFetch<FeeAgreement[]>(`/fee-agreements${qs}`);
  }

  async getAgreementById(_context: SecurityContext, id: string): Promise<FeeAgreement | null> {
    try {
      return await restFetch<FeeAgreement>(`/fee-agreements/${id}`);
    } catch (err: unknown) {
      if (err && typeof err === 'object' && 'status' in err && (err as { status: number }).status === 404) {
        return null;
      }
      throw err;
    }
  }

  async createAgreement(
    _context: SecurityContext,
    agreement: {
      clientId: string;
      caseId: string;
      feeType: FeeType;
      agreedAmountPaisa: number;
      agreementDate: string;
      notes?: string | null;
    }
  ): Promise<FeeAgreement> {
    return restFetch<FeeAgreement>('/fee-agreements', {
      method: 'POST',
      body: JSON.stringify(agreement),
    });
  }

  async reviseAgreement(
    _context: SecurityContext,
    id: string,
    newAmountPaisa: number,
    reason: string
  ): Promise<FeeAgreement> {
    return restFetch<FeeAgreement>(`/fee-agreements/${id}/revise`, {
      method: 'POST',
      body: JSON.stringify({ newAmountPaisa, reason }),
    });
  }

  async closeAgreement(_context: SecurityContext, id: string): Promise<FeeAgreement> {
    return restFetch<FeeAgreement>(`/fee-agreements/${id}/close`, {
      method: 'POST',
    });
  }

  async voidAgreement(_context: SecurityContext, id: string, reason: string): Promise<FeeAgreement> {
    return restFetch<FeeAgreement>(`/fee-agreements/${id}/void`, {
      method: 'POST',
      body: JSON.stringify({ reason }),
    });
  }

  async listAgreementChanges(_context: SecurityContext, agreementId: string): Promise<FeeAgreementChange[]> {
    return restFetch<FeeAgreementChange[]>(`/fee-agreements/${agreementId}/changes`);
  }

  async listPayments(
    _context: SecurityContext,
    filter?: { clientId?: string; caseId?: string; feeAgreementId?: string; status?: string; legacyUnassigned?: boolean }
  ): Promise<FeePayment[]> {
    const params = new URLSearchParams();
    if (filter?.clientId) params.set('clientId', filter.clientId);
    if (filter?.caseId) params.set('caseId', filter.caseId);
    if (filter?.feeAgreementId) params.set('feeAgreementId', filter.feeAgreementId);
    if (filter?.status) params.set('status', filter.status);
    if (filter?.legacyUnassigned !== undefined) params.set('legacyUnassigned', String(filter.legacyUnassigned));
    const qs = params.toString() ? `?${params.toString()}` : '';
    return restFetch<FeePayment[]>(`/fee-payments${qs}`);
  }

  async getPaymentById(_context: SecurityContext, id: string): Promise<FeePayment | null> {
    try {
      return await restFetch<FeePayment>(`/fee-payments/${id}`);
    } catch (err: unknown) {
      if (err && typeof err === 'object' && 'status' in err && (err as { status: number }).status === 404) {
        return null;
      }
      throw err;
    }
  }

  async recordPayment(
    _context: SecurityContext,
    payment: {
      feeAgreementId: string;
      paymentDate: string;
      amountPaisa: number;
      method: PaymentMethod;
      purposeNote: string;
      idempotencyKey: string;
      hearingId?: string | null;
      reference?: string | null;
      clientId?: string;
      caseId?: string | null;
    }
  ): Promise<FeePayment> {
    return restFetch<FeePayment>('/fee-payments', {
      method: 'POST',
      body: JSON.stringify(payment),
    });
  }

  async voidPayment(_context: SecurityContext, id: string, reason: string): Promise<FeePayment> {
    return restFetch<FeePayment>(`/fee-payments/${id}/void`, {
      method: 'POST',
      body: JSON.stringify({ reason }),
    });
  }

  async attachPaymentToAgreement(
    _context: SecurityContext,
    paymentId: string,
    feeAgreementId: string
  ): Promise<FeePayment> {
    return restFetch<FeePayment>(`/fee-payments/${paymentId}/attach`, {
      method: 'POST',
      body: JSON.stringify({ feeAgreementId }),
    });
  }

  async listExpenseCategories(_context: SecurityContext): Promise<ExpenseCategory[]> {
    const res = await restFetch<ExpenseCategory[]>('/expenses/categories');
    return Array.isArray(res) ? res : [];
  }

  async listExpenses(
    _context: SecurityContext,
    filter?: { clientId?: string; caseId?: string; categoryId?: string; status?: string }
  ): Promise<Array<Expense & { categoryName?: string }>> {
    const params = new URLSearchParams();
    if (filter?.clientId) params.set('clientId', filter.clientId);
    if (filter?.caseId) params.set('caseId', filter.caseId);
    if (filter?.categoryId) params.set('categoryId', filter.categoryId);
    if (filter?.status) params.set('status', filter.status);
    const qs = params.toString() ? `?${params.toString()}` : '';
    return restFetch<Array<Expense & { categoryName?: string }>>(`/expenses${qs}`);
  }

  async getExpenseById(
    _context: SecurityContext,
    id: string
  ): Promise<(Expense & { categoryName?: string }) | null> {
    try {
      return await restFetch<Expense & { categoryName?: string }>(`/expenses/${id}`);
    } catch (err: unknown) {
      if (err && typeof err === 'object' && 'status' in err && (err as { status: number }).status === 404) {
        return null;
      }
      throw err;
    }
  }

  async recordExpense(
    _context: SecurityContext,
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
    return restFetch<Expense>('/expenses', {
      method: 'POST',
      body: JSON.stringify(expense),
    });
  }

  async voidExpense(_context: SecurityContext, id: string, reason: string): Promise<Expense> {
    return restFetch<Expense>(`/expenses/${id}/void`, {
      method: 'POST',
      body: JSON.stringify({ reason }),
    });
  }
}
