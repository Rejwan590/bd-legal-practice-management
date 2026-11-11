import { can } from '../../permissions';
import { IAccountsRepository, IAuditLogRepository } from '../interfaces';
import { localStore } from '../mockStore';
import {
  AccountsSummary,
  ClientBalanceOverview,
  CaseBalanceOverview,
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

type MockStoreData = ReturnType<typeof localStore.getData>;

function hasExtraPermission(user: SecurityContext['currentUser'], key: string): boolean {
  if (!user || !user.active) return false;
  if (user.role === 'Owner') return true;
  return (user.permissions as string[]).includes(key);
}

function canReadBilling(user: SecurityContext['currentUser']): boolean {
  return can('accounts.view', user) || can('billing.view', user) || hasExtraPermission(user, 'billing.manage');
}

function canReadExpenses(user: SecurityContext['currentUser']): boolean {
  return canReadBilling(user) || can('expenses.record', user);
}

function canManageBilling(user: SecurityContext['currentUser']): boolean {
  return can('accounts.manage', user) || hasExtraPermission(user, 'billing.manage');
}

function canManageExpenses(user: SecurityContext['currentUser']): boolean {
  return can('expenses.record', user) || canManageBilling(user);
}

function computeAgreementBalance(agreedAmountPaisa: number, paidPaisa: number, status: string) {
  if (status === 'void') {
    return { paidPaisa, outstandingPaisa: 0, creditPaisa: 0 };
  }
  const diff = agreedAmountPaisa - paidPaisa;
  return {
    paidPaisa,
    outstandingPaisa: diff > 0 ? diff : 0,
    creditPaisa: diff < 0 ? Math.abs(diff) : 0,
  };
}

function enrichMockAgreements(store: MockStoreData, firmId: string, rows: FeeAgreement[]): FeeAgreement[] {
  const clientMap = new Map((store.clients || []).filter((c) => c.firmId === firmId).map((c) => [c.id, c]));
  const caseMap = new Map((store.cases || []).filter((c) => c.firmId === firmId).map((c) => [c.id, c]));
  const paidByAgreement = new Map<string, number>();
  for (const p of store.feePayments || []) {
    if (p.firmId === firmId && p.deletedAt === null && p.status === 'posted' && p.feeAgreementId) {
      paidByAgreement.set(p.feeAgreementId, (paidByAgreement.get(p.feeAgreementId) || 0) + Number(p.amountPaisa || 0));
    }
  }
  return rows.map((agr) => {
    const cl = clientMap.get(agr.clientId);
    const cs = agr.caseId ? caseMap.get(agr.caseId) : undefined;
    const paidPaisa = paidByAgreement.get(agr.id) || 0;
    const bal = computeAgreementBalance(agr.agreedAmountPaisa, paidPaisa, agr.status);
    return {
      ...agr,
      clientName: cl?.name,
      clientNameBn: cl?.nameBn ?? null,
      caseNumber: cs?.caseNumber ?? null,
      caseTitle: cs ? cs.matterType || cs.description || null : null,
      paidPaisa: bal.paidPaisa,
      outstandingPaisa: bal.outstandingPaisa,
      creditPaisa: bal.creditPaisa,
    };
  });
}

function enrichMockPayments(store: MockStoreData, firmId: string, rows: FeePayment[]): FeePayment[] {
  const clientMap = new Map((store.clients || []).filter((c) => c.firmId === firmId).map((c) => [c.id, c]));
  const caseMap = new Map((store.cases || []).filter((c) => c.firmId === firmId).map((c) => [c.id, c]));
  const agrMap = new Map((store.feeAgreements || []).filter((a) => a.firmId === firmId).map((a) => [a.id, a]));
  return rows.map((p) => {
    const cl = clientMap.get(p.clientId);
    const cs = p.caseId ? caseMap.get(p.caseId) : undefined;
    const agr = p.feeAgreementId ? agrMap.get(p.feeAgreementId) : undefined;
    return {
      ...p,
      clientName: cl?.name,
      clientNameBn: cl?.nameBn ?? null,
      caseNumber: cs?.caseNumber ?? null,
      caseTitle: cs ? cs.matterType || cs.description || null : null,
      agreementFeeType: agr?.feeType ?? null,
      agreementAmountPaisa: agr?.agreedAmountPaisa ?? null,
    };
  });
}

function enrichMockExpenses(
  store: MockStoreData,
  firmId: string,
  rows: Expense[]
): Array<Expense & { categoryName?: string }> {
  const clientMap = new Map((store.clients || []).filter((c) => c.firmId === firmId).map((c) => [c.id, c]));
  const caseMap = new Map((store.cases || []).filter((c) => c.firmId === firmId).map((c) => [c.id, c]));
  const catMap = new Map((store.expenseCategories || []).filter((c) => c.firmId === firmId).map((c) => [c.id, c.name]));
  return rows.map((e) => {
    const cl = e.clientId ? clientMap.get(e.clientId) : undefined;
    const cs = e.caseId ? caseMap.get(e.caseId) : undefined;
    return {
      ...e,
      categoryName: catMap.get(e.categoryId) || 'Unknown Category',
      clientName: cl?.name ?? null,
      clientNameBn: cl?.nameBn ?? null,
      caseNumber: cs?.caseNumber ?? null,
      caseTitle: cs ? cs.matterType || cs.description || null : null,
    };
  });
}

export class MockAccountsRepository implements IAccountsRepository {
  private auditRepo: IAuditLogRepository;

  constructor(auditRepo: IAuditLogRepository) {
    this.auditRepo = auditRepo;
  }

  async getSummary(
    context: SecurityContext,
    filter: { clientId?: string; caseId?: string }
  ): Promise<AccountsSummary> {
    if (!canReadBilling(context.currentUser)) {
      throw new Error('Permission denied: accounts.view or billing.view required');
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

    // Build per-case breakdown
    let caseSummaries: AccountsSummary['caseSummaries'] = undefined;
    if (filter.clientId) {
      const caseMap = new Map<string, { agreedPaisa: number; paidPaisa: number; expensesPaisa: number }>();
      for (const a of agreements) {
        if (a.caseId) {
          const cur = caseMap.get(a.caseId) || { agreedPaisa: 0, paidPaisa: 0, expensesPaisa: 0 };
          cur.agreedPaisa += Number(a.agreedAmountPaisa || 0);
          caseMap.set(a.caseId, cur);
        }
      }
      for (const p of payments) {
        if (p.caseId) {
          const cur = caseMap.get(p.caseId) || { agreedPaisa: 0, paidPaisa: 0, expensesPaisa: 0 };
          cur.paidPaisa += Number(p.amountPaisa || 0);
          caseMap.set(p.caseId, cur);
        }
      }
      for (const e of expenses) {
        if (e.caseId) {
          const cur = caseMap.get(e.caseId) || { agreedPaisa: 0, paidPaisa: 0, expensesPaisa: 0 };
          cur.expensesPaisa += Number(e.amountPaisa || 0);
          caseMap.set(e.caseId, cur);
        }
      }
      caseSummaries = Array.from(caseMap.entries()).map(([cid, data]) => {
        const bPaisa = data.agreedPaisa - data.paidPaisa;
        const credit = bPaisa < 0;
        return {
          caseId: cid,
          agreedPaisa: data.agreedPaisa,
          paidPaisa: data.paidPaisa,
          balancePaisa: bPaisa,
          isCredit: credit,
          creditPaisa: credit ? Math.abs(bPaisa) : 0,
          outstandingPaisa: credit ? 0 : bPaisa,
          expensesPaisa: data.expensesPaisa,
        };
      });
    }

    return {
      totalAgreedPaisa,
      totalPaidPaisa,
      balancePaisa,
      isCredit,
      creditPaisa,
      outstandingPaisa,
      totalExpensesPaisa,
      caseSummaries,
    };
  }

  async getClientBalances(context: SecurityContext): Promise<ClientBalanceOverview[]> {
    if (!canReadBilling(context.currentUser)) {
      throw new Error('Permission denied: accounts.view or billing.view required');
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

  async getCaseBalances(context: SecurityContext): Promise<CaseBalanceOverview[]> {
    if (!canReadBilling(context.currentUser)) {
      throw new Error('Permission denied: accounts.view or billing.view required');
    }

    const { currentUser } = context;
    const store = localStore.getData();
    const visibleCaseIds = getVisibleCaseIdsForContext(context);

    const clients = (store.clients || []).filter(
      (c) => c.firmId === currentUser.firmId && c.deletedAt === null
    );

    const result: CaseBalanceOverview[] = [];

    for (const c of clients) {
      const agreements = (store.feeAgreements || []).filter(
        (a) => a.firmId === currentUser.firmId && a.deletedAt === null && a.status !== 'void' && a.clientId === c.id
      );
      const payments = (store.feePayments || []).filter(
        (p) => p.firmId === currentUser.firmId && p.deletedAt === null && p.status === 'posted' && p.clientId === c.id
      );
      const clientExpenses = (store.expenses || []).filter(
        (e) => e.firmId === currentUser.firmId && e.deletedAt === null && e.status === 'posted' && e.clientId === c.id
      );

      const caseIds = new Set<string | null>();
      for (const a of agreements) caseIds.add(a.caseId ?? null);
      for (const p of payments) caseIds.add(p.caseId ?? null);
      for (const e of clientExpenses) caseIds.add(e.caseId ?? null);

      for (const cid of caseIds) {
        if (cid === null) {
          const generalAgreements = agreements.filter((a) => !a.caseId);
          const generalPayments = payments.filter((p) => !p.caseId);
          const totalAgreedPaisa = generalAgreements.reduce((sum, a) => sum + Number(a.agreedAmountPaisa || 0), 0);
          const totalPaidPaisa = generalPayments.reduce((sum, p) => sum + Number(p.amountPaisa || 0), 0);
          const balancePaisa = totalAgreedPaisa - totalPaidPaisa;
          const isCredit = balancePaisa < 0;
          result.push({
            clientId: c.id,
            clientName: c.name,
            clientNameBn: c.nameBn,
            clientPhone: c.phone,
            caseId: null,
            caseNumber: null,
            caseTitle: 'General / no case',
            fileSerial: null,
            totalAgreedPaisa,
            totalPaidPaisa,
            balancePaisa,
            isCredit,
            creditPaisa: isCredit ? Math.abs(balancePaisa) : 0,
            outstandingPaisa: isCredit ? 0 : balancePaisa,
          });
        } else {
          if (!visibleCaseIds.has(cid)) continue;
          const caseRec = (store.cases || []).find((k) => k.id === cid && k.deletedAt === null);
          if (!caseRec) continue;
          const caseAgreements = agreements.filter((a) => a.caseId === cid);
          const casePayments = payments.filter((p) => p.caseId === cid);
          const caseExp = clientExpenses.filter((e) => e.caseId === cid);
          const totalAgreedPaisa = caseAgreements.reduce((sum, a) => sum + Number(a.agreedAmountPaisa || 0), 0);
          const totalPaidPaisa = casePayments.reduce((sum, p) => sum + Number(p.amountPaisa || 0), 0);
          const totalExpensesPaisa = caseExp.reduce((sum, e) => sum + Number(e.amountPaisa || 0), 0);
          const balancePaisa = totalAgreedPaisa - totalPaidPaisa;
          const isCredit = balancePaisa < 0;
          result.push({
            clientId: c.id,
            clientName: c.name,
            clientNameBn: c.nameBn,
            clientPhone: c.phone,
            caseId: caseRec.id,
            caseNumber: caseRec.caseNumber,
            caseTitle: caseRec.matterType || caseRec.description || null,
            fileSerial: caseRec.fileSerial || null,
            totalAgreedPaisa,
            totalPaidPaisa,
            totalExpensesPaisa,
            balancePaisa,
            isCredit,
            creditPaisa: isCredit ? Math.abs(balancePaisa) : 0,
            outstandingPaisa: isCredit ? 0 : balancePaisa,
          });
        }
      }
    }

    return result;
  }

  async listAgreements(
    context: SecurityContext,
    filter?: { clientId?: string; caseId?: string; status?: string; search?: string }
  ): Promise<FeeAgreement[]> {
    if (!canReadBilling(context.currentUser)) {
      throw new Error('Permission denied: accounts.view or billing.view required');
    }

    const { currentUser } = context;
    const store = localStore.getData();
    const visibleCaseIds = getVisibleCaseIdsForContext(context);

    const list = (store.feeAgreements || []).filter((a) => {
      if (a.firmId !== currentUser.firmId || a.deletedAt !== null) return false;
      if (a.caseId && !visibleCaseIds.has(a.caseId)) return false;
      if (filter?.clientId && a.clientId !== filter.clientId) return false;
      if (filter?.caseId && a.caseId !== filter.caseId) return false;
      if (filter?.status && filter.status !== 'all' && a.status !== filter.status) return false;
      return true;
    });

    const sorted = list.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    const enriched = enrichMockAgreements(store, currentUser.firmId, sorted);
    const search = (filter?.search || '').trim().toLowerCase();
    if (!search) return enriched;
    return enriched.filter((a) =>
      [a.clientName, a.clientNameBn, a.caseNumber, a.caseTitle, a.feeType, a.notes, a.agreementDate]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
        .includes(search)
    );
  }

  async getAgreementById(context: SecurityContext, id: string): Promise<FeeAgreement | null> {
    if (!canReadBilling(context.currentUser)) {
      throw new Error('Permission denied: accounts.view or billing.view required');
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
    return enrichMockAgreements(store, currentUser.firmId, [agreement])[0];
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
    if (!canManageBilling(context.currentUser)) {
      throw new Error('Permission denied: accounts.manage required');
    }
    assertNotReadOnly(context.currentUser.firmId);

    const { currentUser } = context;
    const store = localStore.getData();
    const visibleCaseIds = getVisibleCaseIdsForContext(context);

    const client = (store.clients || []).find(
      (cl) => cl.id === agreement.clientId && cl.firmId === currentUser.firmId && cl.deletedAt === null
    );
    if (!client) throw new Error('Client not found');

    const resolvedCaseId = agreement.caseId || null;
    if (resolvedCaseId) {
      if (!visibleCaseIds.has(resolvedCaseId)) {
        throw new Error('Cannot create agreement for hidden or restricted case');
      }
      const caseRec = (store.cases || []).find(
        (cs) => cs.id === resolvedCaseId && cs.firmId === currentUser.firmId && cs.deletedAt === null
      );
      if (!caseRec || caseRec.clientId !== agreement.clientId) {
        throw new Error('Case does not belong to client');
      }
    }

    const now = new Date().toISOString();
    const newAgreement: FeeAgreement = {
      id: `fa-${generateUUID()}`,
      firmId: currentUser.firmId,
      clientId: agreement.clientId,
      caseId: resolvedCaseId,
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

    return enrichMockAgreements(localStore.getData(), currentUser.firmId, [newAgreement])[0];
  }

  async updateAgreement(
    context: SecurityContext,
    id: string,
    updates: {
      caseId?: string | null;
      feeType?: FeeType;
      agreedAmountPaisa?: number;
      agreementDate?: string;
      notes?: string | null;
      revisionReason?: string;
    }
  ): Promise<FeeAgreement> {
    if (!canManageBilling(context.currentUser)) {
      throw new Error('Permission denied: accounts.manage required');
    }
    assertNotReadOnly(context.currentUser.firmId);

    const { currentUser } = context;
    const store = localStore.getData();
    const visibleCaseIds = getVisibleCaseIdsForContext(context);
    const existing = (store.feeAgreements || []).find(
      (a) => a.id === id && a.firmId === currentUser.firmId && a.deletedAt === null
    );
    if (!existing) throw new Error('Fee agreement not found');
    if (existing.caseId && !visibleCaseIds.has(existing.caseId)) {
      throw new Error('Fee agreement not found');
    }
    if (existing.status !== 'active') {
      throw new Error('Only active agreements can be edited');
    }

    const nextCaseId = updates.caseId !== undefined ? updates.caseId : existing.caseId;
    if (nextCaseId) {
      if (!visibleCaseIds.has(nextCaseId)) {
        throw new Error('Cannot access hidden or restricted case');
      }
      const caseRec = (store.cases || []).find(
        (cs) => cs.id === nextCaseId && cs.firmId === currentUser.firmId && cs.deletedAt === null
      );
      if (!caseRec || caseRec.clientId !== existing.clientId) {
        throw new Error('Case does not belong to client');
      }
    }

    const amountChanged =
      updates.agreedAmountPaisa !== undefined && updates.agreedAmountPaisa !== existing.agreedAmountPaisa;
    if (amountChanged && !(updates.revisionReason || '').trim()) {
      throw new Error('Revision reason is required when changing the agreed amount');
    }

    const now = new Date().toISOString();
    let updated!: FeeAgreement;
    localStore.mutate((data) => {
      if (amountChanged) {
        if (!data.feeAgreementChanges) data.feeAgreementChanges = [];
        data.feeAgreementChanges.push({
          id: `fac-${generateUUID()}`,
          firmId: currentUser.firmId,
          feeAgreementId: existing.id,
          oldAmountPaisa: existing.agreedAmountPaisa,
          newAmountPaisa: updates.agreedAmountPaisa!,
          reason: updates.revisionReason!.trim(),
          changedBy: currentUser.id,
          createdAt: now,
        });
      }
      const idx = (data.feeAgreements || []).findIndex((a) => a.id === id);
      if (idx !== -1) {
        data.feeAgreements![idx] = {
          ...data.feeAgreements![idx],
          caseId: nextCaseId ?? null,
          feeType: updates.feeType ?? existing.feeType,
          agreedAmountPaisa: updates.agreedAmountPaisa ?? existing.agreedAmountPaisa,
          agreementDate: updates.agreementDate ?? existing.agreementDate,
          notes: updates.notes !== undefined ? updates.notes : existing.notes,
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
      newValue: { ...updated, ...(updates.revisionReason ? { changeReason: updates.revisionReason } : {}) } as unknown as Record<string, unknown>,
    });

    return enrichMockAgreements(localStore.getData(), currentUser.firmId, [updated])[0];
  }

  async reviseAgreement(
    context: SecurityContext,
    id: string,
    newAmountPaisa: number,
    reason: string
  ): Promise<FeeAgreement> {
    if (!canManageBilling(context.currentUser)) {
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
    if (!canManageBilling(context.currentUser)) {
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
    if (!canManageBilling(context.currentUser)) {
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
    if (!canReadBilling(context.currentUser)) {
      throw new Error('Permission denied: accounts.view or billing.view required');
    }
    const store = localStore.getData();
    return (store.feeAgreementChanges || [])
      .filter((c) => c.feeAgreementId === agreementId && c.firmId === context.currentUser.firmId)
      .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
  }

  async listPayments(
    context: SecurityContext,
    filter?: {
      clientId?: string;
      caseId?: string;
      feeAgreementId?: string;
      status?: string;
      legacyUnassigned?: boolean;
      method?: string;
      search?: string;
    }
  ): Promise<FeePayment[]> {
    if (!canReadBilling(context.currentUser)) {
      throw new Error('Permission denied: accounts.view or billing.view required');
    }

    const { currentUser } = context;
    const store = localStore.getData();
    const visibleCaseIds = getVisibleCaseIdsForContext(context);

    const list = (store.feePayments || []).filter((p) => {
      if (p.firmId !== currentUser.firmId || p.deletedAt !== null) return false;
      if (p.caseId && !visibleCaseIds.has(p.caseId)) return false;
      if (filter?.clientId && p.clientId !== filter.clientId) return false;
      if (filter?.caseId && p.caseId !== filter.caseId) return false;
      if (filter?.feeAgreementId && p.feeAgreementId !== filter.feeAgreementId) return false;
      if (filter?.status && filter.status !== 'all' && p.status !== filter.status) return false;
      if (filter?.method && filter.method !== 'all' && p.method !== filter.method) return false;
      if (filter?.legacyUnassigned !== undefined) {
        const isLegacy = Boolean(p.legacyUnassigned || !p.feeAgreementId || !p.caseId);
        if (filter.legacyUnassigned !== isLegacy) return false;
      }
      return true;
    });

    const sorted = list.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    const enriched = enrichMockPayments(store, currentUser.firmId, sorted);
    const search = (filter?.search || '').trim().toLowerCase();
    if (!search) return enriched;
    return enriched.filter((p) =>
      [p.receiptNumber, p.purposeNote, p.reference, p.method, p.clientName, p.clientNameBn, p.caseNumber, p.caseTitle, p.paymentDate]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
        .includes(search)
    );
  }

  async getPaymentById(context: SecurityContext, id: string): Promise<FeePayment | null> {
    if (!canReadBilling(context.currentUser)) {
      throw new Error('Permission denied: accounts.view or billing.view required');
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
    return enrichMockPayments(store, currentUser.firmId, [payment])[0];
  }

  async recordPayment(
    context: SecurityContext,
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
    if (!canManageBilling(context.currentUser)) {
      throw new Error('Permission denied: accounts.manage required');
    }
    assertNotReadOnly(context.currentUser.firmId);

    const { currentUser } = context;
    const store = localStore.getData();
    const visibleCaseIds = getVisibleCaseIdsForContext(context);

    // Idempotency check with visibility verification
    const existing = (store.feePayments || []).find(
      (p) => p.firmId === currentUser.firmId && p.idempotencyKey === payment.idempotencyKey && p.deletedAt === null
    );
    if (existing) {
      if (existing.caseId && !visibleCaseIds.has(existing.caseId)) {
        throw new Error('Cannot access payment for hidden or restricted case');
      }
      return enrichMockPayments(store, currentUser.firmId, [existing])[0];
    }

    // Agreement lookup & validation
    const agreement = (store.feeAgreements || []).find(
      (a) => a.id === payment.feeAgreementId && a.firmId === currentUser.firmId && a.deletedAt === null
    );
    if (!agreement) {
      throw new Error('Fee agreement not found');
    }
    if (agreement.status === 'closed' || agreement.status === 'void') {
      throw new Error('Cannot record payment for closed or void fee agreement');
    }
    if (payment.clientId && payment.clientId !== agreement.clientId) {
      throw new Error('Client does not match agreement client');
    }

    const resolvedCaseId = agreement.caseId || payment.caseId || null;
    if (agreement.caseId && payment.caseId && payment.caseId !== agreement.caseId) {
      throw new Error('Case does not match agreement case');
    }

    if (resolvedCaseId) {
      if (!visibleCaseIds.has(resolvedCaseId)) {
        throw new Error('Cannot access payment for hidden or restricted case');
      }
      const caseRec = (store.cases || []).find(
        (c) => c.id === resolvedCaseId && c.firmId === currentUser.firmId && c.deletedAt === null
      );
      if (!caseRec || caseRec.clientId !== agreement.clientId) {
        throw new Error('Case does not belong to agreement client');
      }
    }

    // Verify hearing belongs to case if provided
    if (payment.hearingId) {
      const hearing = (store.hearings || []).find(
        (h) => h.id === payment.hearingId && h.firmId === currentUser.firmId && h.deletedAt === null
      );
      if (!hearing || (resolvedCaseId && hearing.caseId !== resolvedCaseId)) {
        throw new Error('Hearing does not belong to this case');
      }
    }

    const clientId = agreement.clientId;
    const caseId = resolvedCaseId;

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
      clientId,
      caseId,
      feeAgreementId: agreement.id,
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
      legacyUnassigned: false,
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

    return enrichMockPayments(localStore.getData(), currentUser.firmId, [newPayment])[0];
  }

  async attachPaymentToAgreement(
    context: SecurityContext,
    paymentId: string,
    feeAgreementId: string
  ): Promise<FeePayment> {
    if (!canManageBilling(context.currentUser)) {
      throw new Error('Permission denied: accounts.manage required');
    }
    assertNotReadOnly(context.currentUser.firmId);

    const { currentUser } = context;
    const store = localStore.getData();
    const visibleCaseIds = getVisibleCaseIdsForContext(context);
    const payment = (store.feePayments || []).find(
      (p) => p.id === paymentId && p.firmId === currentUser.firmId && p.deletedAt === null
    );
    if (!payment) {
      throw new Error('Fee payment not found');
    }
    if (payment.status !== 'posted') {
      throw new Error('Cannot attach a voided payment');
    }
    const agreement = (store.feeAgreements || []).find(
      (a) => a.id === feeAgreementId && a.firmId === currentUser.firmId && a.deletedAt === null
    );
    if (!agreement) {
      throw new Error('Fee agreement not found');
    }
    if (agreement.status !== 'active') {
      throw new Error('Cannot attach to closed or void agreement');
    }
    if (agreement.caseId && !visibleCaseIds.has(agreement.caseId)) {
      throw new Error('Cannot attach payment to hidden or restricted case');
    }

    const updated: FeePayment = {
      ...payment,
      feeAgreementId: agreement.id,
      caseId: agreement.caseId ?? payment.caseId ?? null,
      clientId: agreement.clientId,
      legacyUnassigned: false,
      updatedAt: new Date().toISOString(),
      updatedBy: currentUser.id,
    };

    localStore.mutate((data) => {
      data.feePayments = (data.feePayments || []).map((p) => (p.id === paymentId ? updated : p));
    });

    await this.auditRepo.record(context, {
      entity: 'FeePayment',
      entityId: updated.id,
      action: 'UPDATE',
      oldValue: payment as unknown as Record<string, unknown>,
      newValue: updated as unknown as Record<string, unknown>,
    });

    return enrichMockPayments(localStore.getData(), currentUser.firmId, [updated])[0];
  }

  async voidPayment(context: SecurityContext, id: string, reason: string): Promise<FeePayment> {
    if (!canManageBilling(context.currentUser)) {
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
    filter?: { clientId?: string; caseId?: string; categoryId?: string; status?: string; search?: string }
  ): Promise<Array<Expense & { categoryName?: string }>> {
    if (!canReadExpenses(context.currentUser)) {
      throw new Error('Permission denied: accounts.view or expenses.record required');
    }

    const { currentUser } = context;
    const store = localStore.getData();
    const visibleCaseIds = getVisibleCaseIdsForContext(context);

    const list = (store.expenses || []).filter((e) => {
      if (e.firmId !== currentUser.firmId || e.deletedAt !== null) return false;
      if (e.caseId && !visibleCaseIds.has(e.caseId)) return false;
      if (filter?.clientId && e.clientId !== filter.clientId) return false;
      if (filter?.caseId && e.caseId !== filter.caseId) return false;
      if (filter?.categoryId && e.categoryId !== filter.categoryId) return false;
      if (filter?.status && filter.status !== 'all' && e.status !== filter.status) return false;
      return true;
    });

    const sorted = list.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    const enriched = enrichMockExpenses(store, currentUser.firmId, sorted);
    const search = (filter?.search || '').trim().toLowerCase();
    if (!search) return enriched;
    return enriched.filter((e) =>
      [e.description, e.categoryName, e.clientName, e.clientNameBn, e.caseNumber, e.caseTitle, e.expenseDate]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
        .includes(search)
    );
  }

  async getExpenseById(context: SecurityContext, id: string): Promise<(Expense & { categoryName?: string }) | null> {
    if (!canReadExpenses(context.currentUser)) {
      throw new Error('Permission denied: accounts.view or expenses.record required');
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
    return enrichMockExpenses(store, currentUser.firmId, [expense])[0];
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
    if (!canManageExpenses(context.currentUser)) {
      throw new Error('Permission denied: expenses.record required');
    }
    assertNotReadOnly(context.currentUser.firmId);

    const { currentUser } = context;
    const store = localStore.getData();
    const visibleCaseIds = getVisibleCaseIdsForContext(context);

    const cat = (store.expenseCategories || []).find(
      (c) => c.id === expense.categoryId && c.firmId === currentUser.firmId && c.deletedAt === null
    );
    if (!cat) throw new Error('Expense category not found');

    let resolvedClientId = expense.clientId || null;
    const resolvedCaseId = expense.caseId || null;
    if (resolvedCaseId) {
      if (!visibleCaseIds.has(resolvedCaseId)) {
        throw new Error('Cannot access hidden or restricted case');
      }
      const caseRec = (store.cases || []).find(
        (cs) => cs.id === resolvedCaseId && cs.firmId === currentUser.firmId && cs.deletedAt === null
      );
      if (!caseRec) throw new Error('Case not found');
      if (resolvedClientId && caseRec.clientId !== resolvedClientId) {
        throw new Error('Case does not belong to specified client');
      }
      if (!resolvedClientId) resolvedClientId = caseRec.clientId;
    }

    if (!resolvedClientId) {
      throw new Error('Client association is required for an expense record');
    }
    const client = (store.clients || []).find(
      (cl) => cl.id === resolvedClientId && cl.firmId === currentUser.firmId && cl.deletedAt === null
    );
    if (!client) throw new Error('Client not found');

    const now = new Date().toISOString();
    const newExpense: Expense = {
      id: `exp-${generateUUID()}`,
      firmId: currentUser.firmId,
      clientId: resolvedClientId,
      caseId: resolvedCaseId,
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

    return enrichMockExpenses(localStore.getData(), currentUser.firmId, [newExpense])[0];
  }

  async updateExpense(
    context: SecurityContext,
    id: string,
    updates: {
      caseId?: string | null;
      categoryId?: string;
      expenseDate?: string;
      amountPaisa?: number;
      description?: string;
      reimbursable?: boolean;
    }
  ): Promise<Expense> {
    if (!canManageExpenses(context.currentUser)) {
      throw new Error('Permission denied: expenses.record required');
    }
    assertNotReadOnly(context.currentUser.firmId);

    const { currentUser } = context;
    const store = localStore.getData();
    const visibleCaseIds = getVisibleCaseIdsForContext(context);
    const existing = (store.expenses || []).find(
      (e) => e.id === id && e.firmId === currentUser.firmId && e.deletedAt === null
    );
    if (!existing) throw new Error('Expense not found');
    if (existing.caseId && !visibleCaseIds.has(existing.caseId)) {
      throw new Error('Expense not found');
    }
    if (existing.status !== 'posted') {
      throw new Error('Only posted expenses can be edited');
    }

    if (updates.categoryId) {
      const cat = (store.expenseCategories || []).find(
        (c) => c.id === updates.categoryId && c.firmId === currentUser.firmId && c.deletedAt === null
      );
      if (!cat) throw new Error('Expense category not found');
    }

    const nextCaseId = updates.caseId !== undefined ? updates.caseId : existing.caseId;
    let nextClientId = existing.clientId;
    if (nextCaseId) {
      if (!visibleCaseIds.has(nextCaseId)) {
        throw new Error('Cannot access hidden or restricted case');
      }
      const caseRec = (store.cases || []).find(
        (cs) => cs.id === nextCaseId && cs.firmId === currentUser.firmId && cs.deletedAt === null
      );
      if (!caseRec) throw new Error('Case not found');
      if (nextClientId && caseRec.clientId !== nextClientId) {
        throw new Error('Case does not belong to expense client');
      }
      if (!nextClientId) nextClientId = caseRec.clientId;
    }

    const now = new Date().toISOString();
    let updated!: Expense;
    localStore.mutate((data) => {
      const idx = (data.expenses || []).findIndex((e) => e.id === id);
      if (idx !== -1) {
        data.expenses![idx] = {
          ...data.expenses![idx],
          clientId: nextClientId,
          caseId: nextCaseId ?? null,
          categoryId: updates.categoryId ?? existing.categoryId,
          expenseDate: updates.expenseDate ?? existing.expenseDate,
          amountPaisa: updates.amountPaisa ?? existing.amountPaisa,
          description: updates.description ?? existing.description,
          reimbursable: updates.reimbursable !== undefined ? updates.reimbursable : existing.reimbursable,
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

    return enrichMockExpenses(localStore.getData(), currentUser.firmId, [updated])[0];
  }

  async voidExpense(context: SecurityContext, id: string, reason: string): Promise<Expense> {
    if (!canManageExpenses(context.currentUser)) {
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
