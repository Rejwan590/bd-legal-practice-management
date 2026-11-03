import { IChamberExpenseRepository } from '../../interfaces';
import {
  ChamberExpenseCategory,
  ChamberAdvance,
  ChamberAdvanceSettlement,
  ChamberExpense,
  ChamberExpensesSummary,
  ChamberExpenseKind,
  ChamberPaymentMethod,
  ChamberSettlementType,
  SecurityContext,
} from '../../types';
import { restFetch } from './restCommon';

export class RestChamberExpenseRepository implements IChamberExpenseRepository {
  async listCategories(_context: SecurityContext): Promise<ChamberExpenseCategory[]> {
    const res = await restFetch<ChamberExpenseCategory[]>('/chamber-expenses/categories');
    return Array.isArray(res) ? res : [];
  }

  async createCategory(
    _context: SecurityContext,
    data: { name: string; nameBn?: string | null; kind?: ChamberExpenseKind }
  ): Promise<ChamberExpenseCategory> {
    return restFetch<ChamberExpenseCategory>('/chamber-expenses/categories', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async listExpenses(
    _context: SecurityContext,
    filter?: { fromDate?: string; toDate?: string; categoryId?: string; status?: string }
  ): Promise<ChamberExpense[]> {
    const params = new URLSearchParams();
    if (filter?.fromDate) params.set('fromDate', filter.fromDate);
    if (filter?.toDate) params.set('toDate', filter.toDate);
    if (filter?.categoryId) params.set('categoryId', filter.categoryId);
    if (filter?.status) params.set('status', filter.status);
    const qs = params.toString() ? `?${params.toString()}` : '';
    const res = await restFetch<ChamberExpense[]>(`/chamber-expenses${qs}`);
    return Array.isArray(res) ? res : [];
  }

  async getExpenseById(_context: SecurityContext, id: string): Promise<ChamberExpense | null> {
    try {
      return await restFetch<ChamberExpense>(`/chamber-expenses/${id}`);
    } catch {
      return null;
    }
  }

  async recordExpense(
    _context: SecurityContext,
    expense: {
      categoryId: string;
      description: string;
      amountPaisa: number;
      expenseDate: string;
      paidTo: string;
      paymentMethod: ChamberPaymentMethod;
      receiptRef?: string | null;
      notes?: string | null;
      advanceId?: string | null;
    }
  ): Promise<ChamberExpense> {
    return restFetch<ChamberExpense>('/chamber-expenses', {
      method: 'POST',
      body: JSON.stringify(expense),
    });
  }

  async voidExpense(_context: SecurityContext, id: string, voidReason: string): Promise<ChamberExpense> {
    return restFetch<ChamberExpense>(`/chamber-expenses/${id}/void`, {
      method: 'POST',
      body: JSON.stringify({ voidReason }),
    });
  }

  async getSummary(
    _context: SecurityContext,
    period?: { month?: string; year?: number }
  ): Promise<ChamberExpensesSummary> {
    const params = new URLSearchParams();
    if (period?.month) params.set('month', period.month);
    if (period?.year) params.set('year', String(period.year));
    const qs = params.toString() ? `?${params.toString()}` : '';
    return restFetch<ChamberExpensesSummary>(`/chamber-expenses/summary${qs}`);
  }

  async listAdvances(
    _context: SecurityContext,
    filter?: { givenToUserId?: string; status?: string }
  ): Promise<ChamberAdvance[]> {
    const params = new URLSearchParams();
    if (filter?.givenToUserId) params.set('givenToUserId', filter.givenToUserId);
    if (filter?.status) params.set('status', filter.status);
    const qs = params.toString() ? `?${params.toString()}` : '';
    const res = await restFetch<ChamberAdvance[]>(`/chamber-expenses/advances${qs}`);
    return Array.isArray(res) ? res : [];
  }

  async getAdvanceById(
    _context: SecurityContext,
    id: string
  ): Promise<(ChamberAdvance & { settlements: ChamberAdvanceSettlement[] }) | null> {
    try {
      return await restFetch<ChamberAdvance & { settlements: ChamberAdvanceSettlement[] }>(
        `/chamber-expenses/advances/${id}`
      );
    } catch {
      return null;
    }
  }

  async createAdvance(
    _context: SecurityContext,
    advance: {
      givenTo: string;
      givenToUserId?: string | null;
      amountPaisa: number;
      givenDate: string;
      purpose: string;
      paymentMethod: ChamberPaymentMethod;
    }
  ): Promise<ChamberAdvance> {
    return restFetch<ChamberAdvance>('/chamber-expenses/advances', {
      method: 'POST',
      body: JSON.stringify(advance),
    });
  }

  async voidAdvance(_context: SecurityContext, id: string, voidReason: string): Promise<ChamberAdvance> {
    return restFetch<ChamberAdvance>(`/chamber-expenses/advances/${id}/void`, {
      method: 'POST',
      body: JSON.stringify({ voidReason }),
    });
  }

  async settleAdvance(
    _context: SecurityContext,
    advanceId: string,
    settlement: {
      type: ChamberSettlementType;
      amountPaisa: number;
      settledDate: string;
      notes?: string | null;
      expenseId?: string | null;
    }
  ): Promise<ChamberAdvanceSettlement> {
    return restFetch<ChamberAdvanceSettlement>(`/chamber-expenses/advances/${advanceId}/settle`, {
      method: 'POST',
      body: JSON.stringify(settlement),
    });
  }

  async listSettlements(_context: SecurityContext, advanceId: string): Promise<ChamberAdvanceSettlement[]> {
    const adv = await this.getAdvanceById(_context, advanceId);
    return adv?.settlements || [];
  }
}
