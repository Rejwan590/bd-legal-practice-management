import { can } from '../../permissions';
import { IChamberExpenseRepository, IAuditLogRepository } from '../interfaces';
import { localStore } from '../mockStore';
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
} from '../types';
import { assertNotReadOnly, generateUUID } from './common';

export class MockChamberExpenseRepository implements IChamberExpenseRepository {
  private auditRepo: IAuditLogRepository;

  constructor(auditRepo: IAuditLogRepository) {
    this.auditRepo = auditRepo;
  }

  async listCategories(context: SecurityContext): Promise<ChamberExpenseCategory[]> {
    if (!can('chamber_expenses.view', context.currentUser)) {
      throw new Error('Permission denied: chamber_expenses.view required');
    }
    const store = localStore.getData();
    const canSalary = can('chamber_expenses.salary', context.currentUser);
    const cats = (store.chamberExpenseCategories || []).filter(
      (c) => c.firmId === context.currentUser.firmId && c.deletedAt === null
    );
    return cats.filter((c) => canSalary || c.kind !== 'salary');
  }

  async createCategory(
    context: SecurityContext,
    data: { name: string; nameBn?: string | null; kind?: ChamberExpenseKind }
  ): Promise<ChamberExpenseCategory> {
    assertNotReadOnly(context.currentUser.firmId);
    if (!can('chamber_expenses.manage', context.currentUser)) {
      throw new Error('Permission denied: chamber_expenses.manage required');
    }
    const store = localStore.getData();
    if (!store.chamberExpenseCategories) store.chamberExpenseCategories = [];

    const category: ChamberExpenseCategory = {
      id: `ch-cat-${generateUUID()}`,
      firmId: context.currentUser.firmId,
      name: data.name,
      nameBn: data.nameBn ?? null,
      kind: data.kind || 'general',
      isDefault: false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      deletedAt: null,
      createdBy: context.currentUser.id,
      updatedBy: context.currentUser.id,
    };

    store.chamberExpenseCategories.push(category);
    localStore.setData(store);

    await this.auditRepo.record(context, {
      action: 'CREATE',
      entity: 'ChamberExpenseCategory',
      entityId: category.id,
      oldValue: null,
      newValue: category as unknown as Record<string, unknown>,
    });

    return category;
  }

  async listExpenses(
    context: SecurityContext,
    filter?: { fromDate?: string; toDate?: string; categoryId?: string; status?: string }
  ): Promise<ChamberExpense[]> {
    if (!can('chamber_expenses.view', context.currentUser)) {
      throw new Error('Permission denied: chamber_expenses.view required');
    }
    const store = localStore.getData();
    const canSalary = can('chamber_expenses.salary', context.currentUser);
    const catMap = new Map((store.chamberExpenseCategories || []).map((c) => [c.id, c]));

    const expenses = (store.chamberExpenses || []).filter((e) => {
      if (e.firmId !== context.currentUser.firmId || e.deletedAt !== null) return false;
      const cat = catMap.get(e.categoryId);
      if (!canSalary && cat?.kind === 'salary') return false;
      if (filter?.categoryId && e.categoryId !== filter.categoryId) return false;
      if (filter?.status && e.status !== filter.status) return false;
      if (filter?.fromDate && e.expenseDate < filter.fromDate) return false;
      if (filter?.toDate && e.expenseDate > filter.toDate) return false;
      return true;
    });

    return expenses
      .sort((a, b) => b.expenseDate.localeCompare(a.expenseDate))
      .map((e) => {
        const cat = catMap.get(e.categoryId);
        return {
          ...e,
          categoryName: cat?.name || 'Unknown',
          categoryNameBn: cat?.nameBn || null,
          categoryKind: cat?.kind || 'general',
        };
      });
  }

  async getExpenseById(context: SecurityContext, id: string): Promise<ChamberExpense | null> {
    if (!can('chamber_expenses.view', context.currentUser)) {
      throw new Error('Permission denied: chamber_expenses.view required');
    }
    const store = localStore.getData();
    const expense = (store.chamberExpenses || []).find(
      (e) => e.id === id && e.firmId === context.currentUser.firmId && e.deletedAt === null
    );
    if (!expense) return null;

    const cat = (store.chamberExpenseCategories || []).find((c) => c.id === expense.categoryId);
    const canSalary = can('chamber_expenses.salary', context.currentUser);
    if (!canSalary && cat?.kind === 'salary') return null;

    return {
      ...expense,
      categoryName: cat?.name || 'Unknown',
      categoryNameBn: cat?.nameBn || null,
      categoryKind: cat?.kind || 'general',
    };
  }

  async recordExpense(
    context: SecurityContext,
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
    assertNotReadOnly(context.currentUser.firmId);
    if (!can('chamber_expenses.record', context.currentUser)) {
      throw new Error('Permission denied: chamber_expenses.record required');
    }
    const store = localStore.getData();
    if (!store.chamberExpenses) store.chamberExpenses = [];
    if (!store.chamberAdvanceSettlements) store.chamberAdvanceSettlements = [];

    const created: ChamberExpense = {
      id: `ch-exp-${generateUUID()}`,
      firmId: context.currentUser.firmId,
      categoryId: expense.categoryId,
      description: expense.description,
      amountPaisa: expense.amountPaisa,
      expenseDate: expense.expenseDate,
      paidTo: expense.paidTo,
      paymentMethod: expense.paymentMethod,
      receiptRef: expense.receiptRef ?? null,
      notes: expense.notes ?? null,
      advanceId: expense.advanceId ?? null,
      status: 'posted',
      voidReason: null,
      voidedBy: null,
      voidedAt: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      deletedAt: null,
      createdBy: context.currentUser.id,
      updatedBy: context.currentUser.id,
    };

    store.chamberExpenses.push(created);

    // If advanceId is supplied, auto-settle advance
    if (created.advanceId) {
      await this.settleAdvance(context, created.advanceId, {
        type: 'expense',
        amountPaisa: created.amountPaisa,
        settledDate: created.expenseDate,
        expenseId: created.id,
        notes: `Expense settlement: ${created.description}`,
      });
    } else {
      localStore.setData(store);
    }

    await this.auditRepo.record(context, {
      action: 'CREATE',
      entity: 'ChamberExpense',
      entityId: created.id,
      oldValue: null,
      newValue: created as unknown as Record<string, unknown>,
    });

    const cat = (store.chamberExpenseCategories || []).find((c) => c.id === created.categoryId);
    return {
      ...created,
      categoryName: cat?.name || 'Unknown',
      categoryNameBn: cat?.nameBn || null,
      categoryKind: cat?.kind || 'general',
    };
  }

  async voidExpense(context: SecurityContext, id: string, voidReason: string): Promise<ChamberExpense> {
    assertNotReadOnly(context.currentUser.firmId);
    if (!can('chamber_expenses.manage', context.currentUser)) {
      throw new Error('Permission denied: chamber_expenses.manage required');
    }
    const store = localStore.getData();
    const exp = (store.chamberExpenses || []).find(
      (e) => e.id === id && e.firmId === context.currentUser.firmId && e.deletedAt === null
    );
    if (!exp) throw new Error('Expense not found');
    if (exp.status === 'void') throw new Error('Expense already voided');

    const oldVal = { ...exp };
    exp.status = 'void';
    exp.voidReason = voidReason;
    exp.voidedBy = context.currentUser.id;
    exp.voidedAt = new Date().toISOString();
    exp.updatedAt = new Date().toISOString();
    exp.updatedBy = context.currentUser.id;

    // If linked to advance settlement, soft delete the settlement and check advance
    const settlements = (store.chamberAdvanceSettlements || []).filter(
      (s) => s.firmId === context.currentUser.firmId && s.expenseId === id && s.deletedAt === null
    );
    for (const s of settlements) {
      s.deletedAt = new Date().toISOString();
      const adv = (store.chamberAdvances || []).find((a) => a.id === s.advanceId);
      if (adv && adv.status === 'settled') {
        const remaining = (store.chamberAdvanceSettlements || []).filter(
          (other) => other.advanceId === adv.id && other.deletedAt === null
        );
        const settledPaisa = remaining.reduce((sum, item) => sum + Number(item.amountPaisa || 0), 0);
        if (settledPaisa < Number(adv.amountPaisa)) {
          adv.status = 'open';
          adv.updatedAt = new Date().toISOString();
        }
      }
    }

    localStore.setData(store);

    await this.auditRepo.record(context, {
      action: 'UPDATE',
      entity: 'ChamberExpense',
      entityId: exp.id,
      oldValue: oldVal as unknown as Record<string, unknown>,
      newValue: exp as unknown as Record<string, unknown>,
    });

    return exp;
  }

  async getSummary(
    context: SecurityContext,
    period?: { month?: string; year?: number }
  ): Promise<ChamberExpensesSummary> {
    if (!can('chamber_expenses.view', context.currentUser)) {
      throw new Error('Permission denied: chamber_expenses.view required');
    }
    const store = localStore.getData();
    const canSalary = can('chamber_expenses.salary', context.currentUser);
    const catMap = new Map((store.chamberExpenseCategories || []).map((c) => [c.id, c]));

    const now = new Date();
    const currentYear = period?.year ?? now.getFullYear();
    const currentMonth = period?.month ?? String(now.getMonth() + 1).padStart(2, '0');
    const currentMonthPrefix = `${currentYear}-${currentMonth}`;

    const lastMonthDate = new Date(currentYear, Number(currentMonth) - 2, 1);
    const lastMonthYear = lastMonthDate.getFullYear();
    const lastMonthNum = String(lastMonthDate.getMonth() + 1).padStart(2, '0');
    const lastMonthPrefix = `${lastMonthYear}-${lastMonthNum}`;

    let totalThisMonthPaisa = 0;
    let totalLastMonthPaisa = 0;
    let totalSalaryThisMonthPaisa = 0;
    const catBuckets = new Map<string, { totalPaisa: number; count: number }>();

    for (const exp of store.chamberExpenses || []) {
      if (exp.firmId !== context.currentUser.firmId || exp.deletedAt !== null || exp.status === 'void') continue;
      const cat = catMap.get(exp.categoryId);
      const isSalary = cat?.kind === 'salary';
      if (isSalary && !canSalary) continue;

      const amt = Number(exp.amountPaisa || 0);

      if (exp.expenseDate.startsWith(currentMonthPrefix)) {
        totalThisMonthPaisa += amt;
        if (isSalary) {
          totalSalaryThisMonthPaisa += amt;
        }

        const bucket = catBuckets.get(exp.categoryId) || { totalPaisa: 0, count: 0 };
        bucket.totalPaisa += amt;
        bucket.count += 1;
        catBuckets.set(exp.categoryId, bucket);
      } else if (exp.expenseDate.startsWith(lastMonthPrefix)) {
        totalLastMonthPaisa += amt;
      }
    }

    const byCategory = (store.chamberExpenseCategories || [])
      .filter((c) => c.firmId === context.currentUser.firmId && c.deletedAt === null && (canSalary || c.kind !== 'salary'))
      .map((c) => {
        const bucket = catBuckets.get(c.id) || { totalPaisa: 0, count: 0 };
        return {
          categoryId: c.id,
          categoryName: c.name,
          categoryNameBn: c.nameBn ?? null,
          categoryKind: c.kind,
          totalPaisa: bucket.totalPaisa,
          count: bucket.count,
        };
      })
      .filter((c) => c.count > 0)
      .sort((a, b) => b.totalPaisa - a.totalPaisa);

    return {
      totalThisMonthPaisa,
      totalLastMonthPaisa,
      totalSalaryThisMonthPaisa,
      byCategory,
    };
  }

  async listAdvances(
    context: SecurityContext,
    filter?: { givenToUserId?: string; status?: string }
  ): Promise<ChamberAdvance[]> {
    if (!can('chamber_expenses.view', context.currentUser)) {
      throw new Error('Permission denied: chamber_expenses.view required');
    }
    const store = localStore.getData();
    const advances = (store.chamberAdvances || []).filter((a) => {
      if (a.firmId !== context.currentUser.firmId || a.deletedAt !== null) return false;
      if (filter?.givenToUserId && a.givenToUserId !== filter.givenToUserId) return false;
      if (filter?.status && a.status !== filter.status) return false;
      return true;
    });

    return advances
      .sort((a, b) => b.givenDate.localeCompare(a.givenDate))
      .map((a) => {
        const settlements = (store.chamberAdvanceSettlements || []).filter(
          (s) => s.advanceId === a.id && s.deletedAt === null
        );
        const settledAmountPaisa = settlements.reduce((sum, s) => sum + Number(s.amountPaisa || 0), 0);
        const remainingAmountPaisa = Math.max(0, Number(a.amountPaisa) - settledAmountPaisa);
        return {
          ...a,
          settledAmountPaisa,
          remainingAmountPaisa,
        };
      });
  }

  async getAdvanceById(
    context: SecurityContext,
    id: string
  ): Promise<(ChamberAdvance & { settlements: ChamberAdvanceSettlement[] }) | null> {
    if (!can('chamber_expenses.view', context.currentUser)) {
      throw new Error('Permission denied: chamber_expenses.view required');
    }
    const store = localStore.getData();
    const adv = (store.chamberAdvances || []).find(
      (a) => a.id === id && a.firmId === context.currentUser.firmId && a.deletedAt === null
    );
    if (!adv) return null;

    const settlements = (store.chamberAdvanceSettlements || []).filter(
      (s) => s.advanceId === id && s.deletedAt === null
    );
    const settledAmountPaisa = settlements.reduce((sum, s) => sum + Number(s.amountPaisa || 0), 0);
    const remainingAmountPaisa = Math.max(0, Number(adv.amountPaisa) - settledAmountPaisa);

    return {
      ...adv,
      settledAmountPaisa,
      remainingAmountPaisa,
      settlements,
    };
  }

  async createAdvance(
    context: SecurityContext,
    advance: {
      givenTo: string;
      givenToUserId?: string | null;
      amountPaisa: number;
      givenDate: string;
      purpose: string;
      paymentMethod: ChamberPaymentMethod;
    }
  ): Promise<ChamberAdvance> {
    assertNotReadOnly(context.currentUser.firmId);
    if (!can('chamber_expenses.record', context.currentUser)) {
      throw new Error('Permission denied: chamber_expenses.record required');
    }
    const store = localStore.getData();
    if (!store.chamberAdvances) store.chamberAdvances = [];

    const created: ChamberAdvance = {
      id: `ch-adv-${generateUUID()}`,
      firmId: context.currentUser.firmId,
      givenTo: advance.givenTo,
      givenToUserId: advance.givenToUserId ?? null,
      amountPaisa: advance.amountPaisa,
      givenDate: advance.givenDate,
      purpose: advance.purpose,
      paymentMethod: advance.paymentMethod,
      status: 'open',
      voidReason: null,
      voidedBy: null,
      voidedAt: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      deletedAt: null,
      createdBy: context.currentUser.id,
      updatedBy: context.currentUser.id,
    };

    store.chamberAdvances.push(created);
    localStore.setData(store);

    await this.auditRepo.record(context, {
      action: 'CREATE',
      entity: 'ChamberAdvance',
      entityId: created.id,
      oldValue: null,
      newValue: created as unknown as Record<string, unknown>,
    });

    return created;
  }

  async voidAdvance(context: SecurityContext, id: string, voidReason: string): Promise<ChamberAdvance> {
    assertNotReadOnly(context.currentUser.firmId);
    if (!can('chamber_expenses.manage', context.currentUser)) {
      throw new Error('Permission denied: chamber_expenses.manage required');
    }
    const store = localStore.getData();
    const adv = (store.chamberAdvances || []).find(
      (a) => a.id === id && a.firmId === context.currentUser.firmId && a.deletedAt === null
    );
    if (!adv) throw new Error('Advance not found');

    const settlements = (store.chamberAdvanceSettlements || []).filter(
      (s) => s.advanceId === id && s.deletedAt === null
    );
    if (settlements.length > 0) {
      throw new Error('Cannot void advance with existing settlements. Settle by refund or void linked expenses first.');
    }

    const oldVal = { ...adv };
    adv.status = 'void';
    adv.voidReason = voidReason;
    adv.voidedBy = context.currentUser.id;
    adv.voidedAt = new Date().toISOString();
    adv.updatedAt = new Date().toISOString();
    adv.updatedBy = context.currentUser.id;

    localStore.setData(store);

    await this.auditRepo.record(context, {
      action: 'UPDATE',
      entity: 'ChamberAdvance',
      entityId: adv.id,
      oldValue: oldVal as unknown as Record<string, unknown>,
      newValue: adv as unknown as Record<string, unknown>,
    });

    return adv;
  }

  async settleAdvance(
    context: SecurityContext,
    advanceId: string,
    settlement: {
      type: ChamberSettlementType;
      amountPaisa: number;
      settledDate: string;
      notes?: string | null;
      expenseId?: string | null;
    }
  ): Promise<ChamberAdvanceSettlement> {
    assertNotReadOnly(context.currentUser.firmId);
    if (!can('chamber_expenses.record', context.currentUser)) {
      throw new Error('Permission denied: chamber_expenses.record required');
    }
    const store = localStore.getData();
    const adv = (store.chamberAdvances || []).find(
      (a) => a.id === advanceId && a.firmId === context.currentUser.firmId && a.deletedAt === null
    );
    if (!adv) throw new Error(`Advance not found: ${advanceId}`);
    if (adv.status === 'void') throw new Error('Cannot settle a voided advance');

    if (!store.chamberAdvanceSettlements) store.chamberAdvanceSettlements = [];
    const settlements = store.chamberAdvanceSettlements.filter(
      (s) => s.advanceId === advanceId && s.deletedAt === null
    );
    const currentSettled = settlements.reduce((sum, s) => sum + Number(s.amountPaisa || 0), 0);
    const remaining = Number(adv.amountPaisa) - currentSettled;

    if (Number(settlement.amountPaisa) > remaining) {
      throw new Error(`Settlement amount (${Number(settlement.amountPaisa)}) exceeds remaining balance (${remaining})`);
    }

    const created: ChamberAdvanceSettlement = {
      id: `ch-set-${generateUUID()}`,
      firmId: context.currentUser.firmId,
      advanceId,
      type: settlement.type,
      expenseId: settlement.expenseId ?? null,
      amountPaisa: settlement.amountPaisa,
      settledDate: settlement.settledDate,
      notes: settlement.notes ?? null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      deletedAt: null,
      createdBy: context.currentUser.id,
      updatedBy: context.currentUser.id,
    };

    store.chamberAdvanceSettlements.push(created);

    if (currentSettled + Number(settlement.amountPaisa) >= Number(adv.amountPaisa)) {
      adv.status = 'settled';
      adv.updatedAt = new Date().toISOString();
    }

    localStore.setData(store);

    await this.auditRepo.record(context, {
      action: 'CREATE',
      entity: 'ChamberAdvanceSettlement',
      entityId: created.id,
      oldValue: null,
      newValue: created as unknown as Record<string, unknown>,
    });

    return created;
  }

  async listSettlements(context: SecurityContext, advanceId: string): Promise<ChamberAdvanceSettlement[]> {
    if (!can('chamber_expenses.view', context.currentUser)) {
      throw new Error('Permission denied: chamber_expenses.view required');
    }
    const store = localStore.getData();
    return (store.chamberAdvanceSettlements || [])
      .filter((s) => s.advanceId === advanceId && s.firmId === context.currentUser.firmId && s.deletedAt === null)
      .sort((a, b) => b.settledDate.localeCompare(a.settledDate));
  }
}
