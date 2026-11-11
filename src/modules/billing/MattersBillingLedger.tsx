import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../foundation/AuthContext';
import { useNavigation } from '../foundation/NavigationContext';
import { getRepositories } from '../../data/repositories';
import {
  AccountsSummary,
  AgreementRecord,
  CaseRecord,
  ExpenseRecord,
  PaymentMethod,
  PaymentRecord,
} from '../../data/types';
import {
  CreditCard,
  FileText,
  Receipt,
  Plus,
  Search,
  Eye,
  Edit2,
  History,
  CheckCircle2,
  Ban,
  Link2,
  AlertTriangle,
  Clock,
  ExternalLink,
} from 'lucide-react';
import { formatBdt } from '../../utils/currency';
import { getDhakaDateString, toDateInputValue } from '../../utils/dateUtils';

function formatLedgerDate(dateStr: string, lang: string): string {
  const iso = toDateInputValue(dateStr) || getDhakaDateString(dateStr);
  if (!iso) return dateStr;
  try {
    return new Date(`${iso}T00:00:00+06:00`).toLocaleDateString(lang === 'bn' ? 'bn-BD' : 'en-GB', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    });
  } catch {
    return iso;
  }
}
import { TablePagination } from '../../components/responsive/TablePagination';
import { CreateAgreementModal } from './CreateAgreementModal';
import { EditAgreementModal } from './EditAgreementModal';
import { ReviseAgreementModal } from './ReviseAgreementModal';
import { RecordPaymentModal } from './RecordPaymentModal';
import { AddExpenseModal } from './AddExpenseModal';
import { AttachPaymentModal } from './AttachPaymentModal';
import { VoidRecordModal } from './VoidRecordModal';
import { BillingRecordDetailModal, SelectedBillingRecord } from './BillingRecordDetailModal';

interface MattersBillingLedgerProps {
  clientId?: string | null;
  caseId?: string | null;
  compactHeader?: boolean;
}

type LedgerSection = 'agreements' | 'payments' | 'expenses';

export const MattersBillingLedger: React.FC<MattersBillingLedgerProps> = ({
  clientId = null,
  caseId = null,
  compactHeader = false,
}) => {
  const { t, i18n } = useTranslation();
  const { currentUser, can, subscription } = useAuth();
  const { openClientProfile, openCaseDossier, refreshVersion, triggerRefresh } = useNavigation();
  const repos = getRepositories();

  const hasFinancialRead = can('accounts.view') || can('billing.view');
  const hasExpenseRead = hasFinancialRead || can('expenses.record');
  const canManageBilling =
    can('accounts.manage') ||
    Boolean(currentUser?.active && (currentUser.role === 'Owner' || (currentUser.permissions as string[]).includes('billing.manage')));
  const canManageExpenses = can('expenses.record') || canManageBilling;
  const isReadOnly = subscription.isReadOnly;

  const [section, setSection] = useState<LedgerSection>(() => (hasFinancialRead ? 'agreements' : 'expenses'));
  const [agreements, setAgreements] = useState<AgreementRecord[]>([]);
  const [payments, setPayments] = useState<PaymentRecord[]>([]);
  const [expenses, setExpenses] = useState<ExpenseRecord[]>([]);
  const [summary, setSummary] = useState<AccountsSummary | null>(null);
  const [cases, setCases] = useState<CaseRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Filters
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [methodFilter, setMethodFilter] = useState<string>('all');
  const [clientFilter, setClientFilter] = useState<string>('');
  const [caseFilter, setCaseFilter] = useState<string>('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);

  // Modal state
  const [createAgreementOpen, setCreateAgreementOpen] = useState(false);
  const [editAgreementTarget, setEditAgreementTarget] = useState<AgreementRecord | null>(null);
  const [reviseAgreementTarget, setReviseAgreementTarget] = useState<AgreementRecord | null>(null);
  const [recordPaymentOpen, setRecordPaymentOpen] = useState(false);
  const [paymentDefaultAgreementId, setPaymentDefaultAgreementId] = useState<string | null>(null);
  const [paymentDefaultClientId, setPaymentDefaultClientId] = useState<string | null>(null);
  const [paymentDefaultCaseId, setPaymentDefaultCaseId] = useState<string | null>(null);
  const [addExpenseOpen, setAddExpenseOpen] = useState(false);
  const [editExpenseTarget, setEditExpenseTarget] = useState<ExpenseRecord | null>(null);
  const [attachPaymentTarget, setAttachPaymentTarget] = useState<PaymentRecord | null>(null);
  const [detailTarget, setDetailTarget] = useState<SelectedBillingRecord | null>(null);
  const [voidTarget, setVoidTarget] = useState<{
    kind: 'agreement' | 'payment' | 'expense';
    id: string;
    title: string;
    description: string;
  } | null>(null);

  useEffect(() => {
    setPage(1);
    setStatusFilter('all');
    setMethodFilter('all');
  }, [section, clientId, caseId]);

  useEffect(() => {
    setPage(1);
  }, [search, statusFilter, methodFilter, clientFilter, caseFilter]);

  const loadData = useCallback(async () => {
    if (!currentUser || !hasExpenseRead) return;
    setLoading(true);
    setErrorMsg(null);
    const scopeFilter = {
      ...(clientId ? { clientId } : {}),
      ...(caseId ? { caseId } : {}),
    };
    try {
      const [agList, payList, expList, sumData, caseList] = await Promise.all([
        hasFinancialRead ? repos.accounts.listAgreements({ currentUser }, scopeFilter) : Promise.resolve([]),
        hasFinancialRead ? repos.accounts.listPayments({ currentUser }, scopeFilter) : Promise.resolve([]),
        repos.accounts.listExpenses({ currentUser }, scopeFilter),
        hasFinancialRead ? repos.accounts.getSummary({ currentUser }, scopeFilter).catch(() => null) : Promise.resolve(null),
        repos.case.list({ currentUser }, clientId ? { clientId } : undefined).catch(() => []),
      ]);
      setAgreements(Array.isArray(agList) ? agList : []);
      setPayments(Array.isArray(payList) ? payList : []);
      setExpenses(Array.isArray(expList) ? expList : []);
      setSummary(sumData);
      setCases(Array.isArray(caseList) ? caseList : []);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : t('billing.errors.loadFailed', 'Failed to load billing ledger'));
    } finally {
      setLoading(false);
    }
  }, [currentUser, hasFinancialRead, hasExpenseRead, clientId, caseId, repos, t]);

  useEffect(() => {
    void loadData();
  }, [loadData, refreshVersion]);

  const handleMutationSuccess = () => {
    triggerRefresh();
    void loadData();
  };

  // Client & case dropdown options derived from firm records when browsing at firm level
  const clientOptions = useMemo(() => {
    const map = new Map<string, string>();
    for (const a of agreements) {
      if (a.clientId && a.clientName) map.set(a.clientId, i18n.language === 'bn' && a.clientNameBn ? a.clientNameBn : a.clientName);
    }
    for (const p of payments) {
      if (p.clientId && p.clientName) map.set(p.clientId, i18n.language === 'bn' && p.clientNameBn ? p.clientNameBn : p.clientName);
    }
    for (const e of expenses) {
      if (e.clientId && e.clientName) map.set(e.clientId, i18n.language === 'bn' && e.clientNameBn ? e.clientNameBn : e.clientName);
    }
    return Array.from(map.entries()).sort((a, b) => a[1].localeCompare(b[1]));
  }, [agreements, payments, expenses, i18n.language]);

  const caseOptions = useMemo(() => {
    const list = clientFilter ? cases.filter((c) => c.clientId === clientFilter) : cases;
    return list.map((c) => ({
      id: c.id,
      label: `${c.caseNumber}${c.matterType ? ` · ${c.matterType}` : ''}`,
    }));
  }, [cases, clientFilter]);

  // Filtered lists
  const filteredAgreements = useMemo(() => {
    const q = search.trim().toLowerCase();
    return agreements.filter((a) => {
      if (statusFilter !== 'all' && a.status !== statusFilter) return false;
      if (!clientId && clientFilter && a.clientId !== clientFilter) return false;
      if (!caseId && caseFilter && a.caseId !== caseFilter) return false;
      if (!q) return true;
      return [a.clientName, a.clientNameBn, a.caseNumber, a.caseTitle, a.feeType, a.notes, a.agreementDate]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
        .includes(q);
    });
  }, [agreements, statusFilter, clientId, clientFilter, caseId, caseFilter, search]);

  const filteredPayments = useMemo(() => {
    const q = search.trim().toLowerCase();
    return payments.filter((p) => {
      if (statusFilter !== 'all' && p.status !== statusFilter) return false;
      if (methodFilter !== 'all' && p.method !== methodFilter) return false;
      if (!clientId && clientFilter && p.clientId !== clientFilter) return false;
      if (!caseId && caseFilter && p.caseId !== caseFilter) return false;
      if (!q) return true;
      return [p.receiptNumber, p.purposeNote, p.reference, p.method, p.clientName, p.clientNameBn, p.caseNumber, p.caseTitle, p.paymentDate]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
        .includes(q);
    });
  }, [payments, statusFilter, methodFilter, clientId, clientFilter, caseId, caseFilter, search]);

  const filteredExpenses = useMemo(() => {
    const q = search.trim().toLowerCase();
    return expenses.filter((e) => {
      if (statusFilter !== 'all' && e.status !== statusFilter) return false;
      if (!clientId && clientFilter && e.clientId !== clientFilter) return false;
      if (!caseId && caseFilter && e.caseId !== caseFilter) return false;
      if (!q) return true;
      return [e.description, e.categoryName, e.clientName, e.clientNameBn, e.caseNumber, e.caseTitle, e.expenseDate]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
        .includes(q);
    });
  }, [expenses, statusFilter, clientId, clientFilter, caseId, caseFilter, search]);

  const activeItemsCount =
    section === 'agreements'
      ? filteredAgreements.length
      : section === 'payments'
        ? filteredPayments.length
        : filteredExpenses.length;

  const paginatedAgreements = useMemo(() => {
    const start = (page - 1) * pageSize;
    return filteredAgreements.slice(start, start + pageSize);
  }, [filteredAgreements, page, pageSize]);

  const paginatedPayments = useMemo(() => {
    const start = (page - 1) * pageSize;
    return filteredPayments.slice(start, start + pageSize);
  }, [filteredPayments, page, pageSize]);

  const paginatedExpenses = useMemo(() => {
    const start = (page - 1) * pageSize;
    return filteredExpenses.slice(start, start + pageSize);
  }, [filteredExpenses, page, pageSize]);

  const kpis = useMemo(() => {
    if (summary) return summary;
    const agreed = agreements.filter((a) => a.status !== 'void').reduce((s, a) => s + a.agreedAmountPaisa, 0);
    const paid = payments.filter((p) => p.status === 'posted').reduce((s, p) => s + p.amountPaisa, 0);
    const exp = expenses.filter((e) => e.status === 'posted').reduce((s, e) => s + e.amountPaisa, 0);
    const balance = agreed - paid;
    return {
      totalAgreedPaisa: agreed,
      totalPaidPaisa: paid,
      balancePaisa: balance,
      isCredit: balance < 0,
      creditPaisa: balance < 0 ? Math.abs(balance) : 0,
      outstandingPaisa: balance > 0 ? balance : 0,
      totalExpensesPaisa: exp,
    };
  }, [summary, agreements, payments, expenses]);

  const handleCloseAgreement = async (agreement: AgreementRecord) => {
    if (!currentUser) return;
    if (!window.confirm(t('billing.confirmCloseAgreement', 'Close this fee agreement? No more payments can be recorded under it once closed.'))) {
      return;
    }
    try {
      await repos.accounts.closeAgreement({ currentUser }, agreement.id);
      handleMutationSuccess();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : t('billing.errors.saveFailed', 'Failed to close agreement'));
    }
  };

  const renderClientBadge = (rec: { clientId?: string | null; clientName?: string | null; clientNameBn?: string | null }) => {
    const label =
      i18n.language === 'bn' && rec.clientNameBn
        ? rec.clientNameBn
        : rec.clientName || rec.clientId || '-';
    if (clientId || !rec.clientId) {
      return <span className="font-medium text-slate-800">{label}</span>;
    }
    return (
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          openClientProfile(rec.clientId!);
        }}
        className="font-medium text-slate-800 hover:text-indigo-700 hover:underline inline-flex items-center gap-1 text-left"
      >
        <span>{label}</span>
        <ExternalLink className="w-3 h-3 text-slate-400 shrink-0" />
      </button>
    );
  };

  const renderCaseBadge = (rec: { caseId?: string | null; caseNumber?: string | null; caseTitle?: string | null }) => {
    if (!rec.caseId) {
      return (
        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium bg-slate-100 text-slate-600">
          {t('billing.clientLevel', 'Client-level')}
        </span>
      );
    }
    const label = rec.caseNumber ? `${rec.caseNumber}${rec.caseTitle ? ` · ${rec.caseTitle}` : ''}` : rec.caseId;
    if (caseId === rec.caseId) {
      return <span className="text-xs font-medium text-slate-700">{label}</span>;
    }
    return (
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          openCaseDossier(rec.caseId!, 'billing');
        }}
        className="text-xs font-medium text-indigo-700 hover:underline inline-flex items-center gap-1 text-left"
      >
        <span>{label}</span>
        <ExternalLink className="w-3 h-3 shrink-0" />
      </button>
    );
  };

  const renderStatusPill = (status: string) => {
    const cls =
      status === 'active' || status === 'posted'
        ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
        : status === 'closed'
          ? 'bg-slate-100 text-slate-700 border-slate-200'
          : 'bg-rose-50 text-rose-700 border-rose-200 line-through';
    return (
      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold border ${cls}`}>
        {t(`billing.statusValues.${status}`, status)}
      </span>
    );
  };

  if (!hasExpenseRead) {
    return (
      <div className="p-6 text-center text-slate-500">
        <AlertTriangle className="w-7 h-7 mx-auto text-amber-500 mb-2" />
        <p className="text-sm font-medium text-slate-800">{t('common.accessDenied', 'Access Denied')}</p>
      </div>
    );
  }

  return (
    <div className="space-y-4" data-testid="matters-billing-ledger">
      {/* Header & Quick Create Actions */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        {!compactHeader && (
          <div>
            <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
              <CreditCard className="w-5 h-5 text-emerald-600" />
              <span>{t('billing.mattersLedgerTitle', 'Matters Billing Ledger')}</span>
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              {t('billing.mattersLedgerSubtitle', 'Unified fee agreements, payment receipts, and matter disbursements')}
            </p>
          </div>
        )}

        {!isReadOnly && (
          <div className={`flex flex-wrap items-center gap-2 ${compactHeader ? 'w-full justify-end' : ''}`}>
            {canManageBilling && (
              <>
                <button
                  type="button"
                  data-testid="ledger-btn-new-agreement"
                  onClick={() => setCreateAgreementOpen(true)}
                  className="min-h-[44px] px-3.5 py-2 text-xs font-semibold bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 inline-flex items-center gap-1.5 shadow-2xs"
                >
                  <Plus className="w-4 h-4" />
                  <span>{t('billing.newAgreement', 'New Agreement')}</span>
                </button>
                <button
                  type="button"
                  data-testid="ledger-btn-record-payment"
                  onClick={() => {
                    setPaymentDefaultAgreementId(null);
                    setPaymentDefaultClientId(clientId);
                    setPaymentDefaultCaseId(caseId);
                    setRecordPaymentOpen(true);
                  }}
                  className="min-h-[44px] px-3.5 py-2 text-xs font-semibold bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 inline-flex items-center gap-1.5 shadow-2xs"
                >
                  <Plus className="w-4 h-4" />
                  <span>{t('billing.recordPayment', 'Record Payment')}</span>
                </button>
              </>
            )}
            {canManageExpenses && (
              <button
                type="button"
                data-testid="ledger-btn-add-expense"
                onClick={() => {
                  setEditExpenseTarget(null);
                  setAddExpenseOpen(true);
                }}
                className="min-h-[44px] px-3.5 py-2 text-xs font-semibold bg-slate-900 text-white rounded-lg hover:bg-slate-800 inline-flex items-center gap-1.5 shadow-2xs"
              >
                <Plus className="w-4 h-4" />
                <span>{t('billing.addExpense', 'Record Expense')}</span>
              </button>
            )}
          </div>
        )}
      </div>

      {errorMsg && (
        <div className="p-3 bg-rose-50 border border-rose-200 rounded-lg text-rose-700 text-xs flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 shrink-0 text-rose-600" />
          <span>{errorMsg}</span>
        </div>
      )}

      {/* KPI Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        {hasFinancialRead && (
          <>
            <div className="bg-white p-3.5 rounded-xl border border-slate-200 shadow-2xs">
              <div className="flex items-center justify-between text-slate-500 text-xs font-semibold uppercase">
                <span>{t('billing.totalAgreed', 'Total Agreed')}</span>
                <FileText className="w-4 h-4 text-indigo-600" />
              </div>
              <p className="text-xl font-bold text-slate-900 mt-1">{formatBdt(kpis.totalAgreedPaisa, { lang: i18n.language })}</p>
            </div>
            <div className="bg-white p-3.5 rounded-xl border border-slate-200 shadow-2xs">
              <div className="flex items-center justify-between text-slate-500 text-xs font-semibold uppercase">
                <span>{t('billing.totalPaid', 'Total Paid')}</span>
                <CheckCircle2 className="w-4 h-4 text-emerald-600" />
              </div>
              <p className="text-xl font-bold text-emerald-700 mt-1">{formatBdt(kpis.totalPaidPaisa, { lang: i18n.language })}</p>
            </div>
            <div className="bg-white p-3.5 rounded-xl border border-slate-200 shadow-2xs">
              <div className="flex items-center justify-between text-slate-500 text-xs font-semibold uppercase">
                <span>{kpis.isCredit ? t('billing.advanceCredit', 'Advance Credit') : t('billing.outstanding', 'Outstanding')}</span>
                <Clock className="w-4 h-4 text-amber-600" />
              </div>
              <p className={`text-xl font-bold mt-1 ${kpis.isCredit ? 'text-sky-700' : 'text-amber-700'}`}>
                {formatBdt(kpis.isCredit ? kpis.creditPaisa : kpis.outstandingPaisa, { lang: i18n.language })}
              </p>
            </div>
          </>
        )}
        <div className="bg-white p-3.5 rounded-xl border border-slate-200 shadow-2xs">
          <div className="flex items-center justify-between text-slate-500 text-xs font-semibold uppercase">
            <span>{t('billing.totalExpenses', 'Total Expenses')}</span>
            <Receipt className="w-4 h-4 text-slate-700" />
          </div>
          <p className="text-xl font-bold text-slate-900 mt-1">{formatBdt(kpis.totalExpensesPaisa, { lang: i18n.language })}</p>
        </div>
      </div>

      {/* Ledger Section Tabs + Search & Filters */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-2xs overflow-hidden">
        <div className="p-3 border-b border-slate-200 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3">
          {/* 3 Section Pills */}
          <div className="inline-flex flex-wrap items-center p-1 bg-slate-100 rounded-xl border border-slate-200 gap-1">
            {hasFinancialRead && (
              <>
                <button
                  type="button"
                  data-testid="ledger-section-agreements"
                  onClick={() => setSection('agreements')}
                  className={`min-h-[44px] px-3.5 py-2 rounded-lg text-xs font-semibold inline-flex items-center gap-1.5 transition ${
                    section === 'agreements' ? 'bg-slate-900 text-white shadow-2xs' : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <FileText className="w-3.5 h-3.5" />
                  <span>{t('billing.sections.agreements', 'Agreements')}</span>
                  <span className="px-1.5 py-0.5 rounded-full text-[10px] bg-white/20 text-current">
                    {agreements.length}
                  </span>
                </button>
                <button
                  type="button"
                  data-testid="ledger-section-payments"
                  onClick={() => setSection('payments')}
                  className={`min-h-[44px] px-3.5 py-2 rounded-lg text-xs font-semibold inline-flex items-center gap-1.5 transition ${
                    section === 'payments' ? 'bg-slate-900 text-white shadow-2xs' : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <CreditCard className="w-3.5 h-3.5" />
                  <span>{t('billing.sections.payments', 'Payments')}</span>
                  <span className="px-1.5 py-0.5 rounded-full text-[10px] bg-white/20 text-current">
                    {payments.length}
                  </span>
                </button>
              </>
            )}
            <button
              type="button"
              data-testid="ledger-section-expenses"
              onClick={() => setSection('expenses')}
              className={`min-h-[44px] px-3.5 py-2 rounded-lg text-xs font-semibold inline-flex items-center gap-1.5 transition ${
                section === 'expenses' ? 'bg-slate-900 text-white shadow-2xs' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Receipt className="w-3.5 h-3.5" />
              <span>{t('billing.sections.expenses', 'Expenses')}</span>
              <span className="px-1.5 py-0.5 rounded-full text-[10px] bg-white/20 text-current">
                {expenses.length}
              </span>
            </button>
          </div>

          {/* Filters */}
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative flex-1 min-w-[200px] sm:w-64">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={t('billing.searchLedger', 'Search client, case #, receipt, notes...')}
                className="w-full pl-9 pr-3 py-2 border border-slate-200 rounded-lg text-xs focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 min-h-[44px]"
              />
            </div>

            {!clientId && clientOptions.length > 0 && (
              <select
                value={clientFilter}
                onChange={(e) => {
                  setClientFilter(e.target.value);
                  setCaseFilter('');
                }}
                aria-label={t('billing.filterByClient', 'Filter by client')}
                className="px-3 py-2 border border-slate-200 rounded-lg text-xs bg-white min-h-[44px]"
              >
                <option value="">{t('billing.allClients', 'All Clients')}</option>
                {clientOptions.map(([cid, label]) => (
                  <option key={cid} value={cid}>
                    {label}
                  </option>
                ))}
              </select>
            )}

            {!caseId && caseOptions.length > 0 && (
              <select
                value={caseFilter}
                onChange={(e) => setCaseFilter(e.target.value)}
                aria-label={t('billing.filterByCase', 'Filter by case')}
                className="px-3 py-2 border border-slate-200 rounded-lg text-xs bg-white min-h-[44px] max-w-[220px]"
              >
                <option value="">{t('billing.allCases', 'All Cases')}</option>
                {caseOptions.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.label}
                  </option>
                ))}
              </select>
            )}

            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              aria-label={t('common.status', 'Status')}
              className="px-3 py-2 border border-slate-200 rounded-lg text-xs bg-white min-h-[44px]"
            >
              <option value="all">{t('billing.allStatuses', 'All Statuses')}</option>
              {section === 'agreements' ? (
                <>
                  <option value="active">{t('billing.statusValues.active', 'Active')}</option>
                  <option value="closed">{t('billing.statusValues.closed', 'Closed')}</option>
                  <option value="void">{t('billing.statusValues.void', 'Void')}</option>
                </>
              ) : (
                <>
                  <option value="posted">{t('billing.statusValues.posted', 'Posted')}</option>
                  <option value="void">{t('billing.statusValues.void', 'Void')}</option>
                </>
              )}
            </select>

            {section === 'payments' && (
              <select
                value={methodFilter}
                onChange={(e) => setMethodFilter(e.target.value)}
                aria-label={t('billing.method', 'Payment Method')}
                className="px-3 py-2 border border-slate-200 rounded-lg text-xs bg-white min-h-[44px]"
              >
                <option value="all">{t('billing.allMethods', 'All Methods')}</option>
                {(['cash', 'bank', 'bkash', 'nagad', 'cheque', 'other'] as PaymentMethod[]).map((m) => (
                  <option key={m} value={m}>
                    {t(`billing.methods.${m}`, m)}
                  </option>
                ))}
              </select>
            )}
          </div>
        </div>

        {/* Content */}
        {loading ? (
          <div className="p-8 text-center text-xs text-slate-500">{t('common.loading', 'Loading...')}</div>
        ) : activeItemsCount === 0 ? (
          <div className="p-10 text-center space-y-2" data-testid="ledger-empty-state">
            <p className="text-sm font-semibold text-slate-700">
              {section === 'agreements'
                ? t('billing.emptyAgreements', 'No fee agreements found')
                : section === 'payments'
                  ? t('billing.emptyPayments', 'No payment receipts found')
                  : t('billing.emptyExpenses', 'No expenses recorded')}
            </p>
            <p className="text-xs text-slate-500">
              {t('billing.emptyLedgerHint', 'Create a record or adjust your search and filter criteria.')}
            </p>
          </div>
        ) : (
          <>
            {/* SECTION 1: AGREEMENTS */}
            {section === 'agreements' && (
              <>
                <div className="hidden md:block overflow-x-auto">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead>
                      <tr className="bg-slate-50 border-b border-slate-200 text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
                        <th className="py-3 px-4">{t('billing.agreementDate', 'Date')}</th>
                        {!clientId && <th className="py-3 px-4">{t('clients.client', 'Client')}</th>}
                        <th className="py-3 px-4">{t('cases.case', 'Case')}</th>
                        <th className="py-3 px-4">{t('billing.feeType', 'Fee Type')}</th>
                        <th className="py-3 px-4 text-right">{t('billing.totalAgreed', 'Agreed')}</th>
                        <th className="py-3 px-4 text-right">{t('billing.totalPaid', 'Paid')}</th>
                        <th className="py-3 px-4 text-right">{t('billing.balance', 'Balance')}</th>
                        <th className="py-3 px-4">{t('common.status', 'Status')}</th>
                        <th className="py-3 px-4 text-right">{t('common.actions', 'Actions')}</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {paginatedAgreements.map((agr) => {
                        const credit = agr.creditPaisa ?? 0;
                        const due = agr.outstandingPaisa ?? Math.max(0, agr.agreedAmountPaisa - (agr.paidPaisa ?? 0));
                        return (
                          <tr
                            key={agr.id}
                            onClick={() => setDetailTarget({ kind: 'agreement', record: agr })}
                            className="hover:bg-slate-50/80 cursor-pointer transition"
                          >
                            <td className="py-3 px-4 whitespace-nowrap text-slate-700">
                              {formatLedgerDate(agr.agreementDate, i18n.language)}
                            </td>
                            {!clientId && <td className="py-3 px-4">{renderClientBadge(agr)}</td>}
                            <td className="py-3 px-4">{renderCaseBadge(agr)}</td>
                            <td className="py-3 px-4 text-slate-700">{t(`billing.feeTypes.${agr.feeType}`, agr.feeType)}</td>
                            <td className="py-3 px-4 text-right font-semibold text-slate-900">
                              {formatBdt(agr.agreedAmountPaisa, { lang: i18n.language })}
                            </td>
                            <td className="py-3 px-4 text-right font-medium text-emerald-700">
                              {formatBdt(agr.paidPaisa ?? 0, { lang: i18n.language })}
                            </td>
                            <td className={`py-3 px-4 text-right font-semibold ${credit > 0 ? 'text-sky-700' : due > 0 ? 'text-amber-700' : 'text-slate-600'}`}>
                              {credit > 0
                                ? `${formatBdt(credit, { lang: i18n.language })} (${t('billing.credit', 'CR')})`
                                : formatBdt(due, { lang: i18n.language })}
                            </td>
                            <td className="py-3 px-4">{renderStatusPill(agr.status)}</td>
                            <td className="py-3 px-4 text-right" onClick={(e) => e.stopPropagation()}>
                              <div className="inline-flex items-center justify-end gap-1">
                                <button
                                  type="button"
                                  onClick={() => setDetailTarget({ kind: 'agreement', record: agr })}
                                  title={t('common.viewDetails', 'View details')}
                                  className="p-2 text-slate-600 hover:bg-slate-100 rounded-lg min-h-[36px] min-w-[36px] inline-flex items-center justify-center"
                                >
                                  <Eye className="w-3.5 h-3.5" />
                                </button>
                                {!isReadOnly && agr.status === 'active' && canManageBilling && (
                                  <>
                                    <button
                                      type="button"
                                      onClick={() => {
                                        setPaymentDefaultAgreementId(agr.id);
                                        setPaymentDefaultClientId(agr.clientId);
                                        setPaymentDefaultCaseId(agr.caseId);
                                        setRecordPaymentOpen(true);
                                      }}
                                      title={t('billing.recordPayment', 'Record Payment')}
                                      className="p-2 text-emerald-700 hover:bg-emerald-50 rounded-lg min-h-[36px] min-w-[36px] inline-flex items-center justify-center"
                                    >
                                      <CreditCard className="w-3.5 h-3.5" />
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => setEditAgreementTarget(agr)}
                                      title={t('common.edit', 'Edit')}
                                      className="p-2 text-indigo-700 hover:bg-indigo-50 rounded-lg min-h-[36px] min-w-[36px] inline-flex items-center justify-center"
                                    >
                                      <Edit2 className="w-3.5 h-3.5" />
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => setReviseAgreementTarget(agr)}
                                      title={t('billing.revise', 'Revise Amount')}
                                      className="p-2 text-slate-700 hover:bg-slate-100 rounded-lg min-h-[36px] min-w-[36px] inline-flex items-center justify-center"
                                    >
                                      <History className="w-3.5 h-3.5" />
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() =>
                                        setVoidTarget({
                                          kind: 'agreement',
                                          id: agr.id,
                                          title: t('billing.voidAgreement', 'Void Agreement'),
                                          description: `${agr.clientName || ''} · ${formatBdt(agr.agreedAmountPaisa, { lang: i18n.language })}`,
                                        })
                                      }
                                      title={t('billing.void', 'Void')}
                                      className="p-2 text-rose-600 hover:bg-rose-50 rounded-lg min-h-[36px] min-w-[36px] inline-flex items-center justify-center"
                                    >
                                      <Ban className="w-3.5 h-3.5" />
                                    </button>
                                  </>
                                )}
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                {/* Mobile Cards */}
                <div className="md:hidden divide-y divide-slate-100">
                  {paginatedAgreements.map((agr) => (
                    <div
                      key={agr.id}
                      onClick={() => setDetailTarget({ kind: 'agreement', record: agr })}
                      className="p-4 space-y-2 hover:bg-slate-50 cursor-pointer"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          {!clientId && <div className="text-sm font-semibold">{renderClientBadge(agr)}</div>}
                          <div className="mt-0.5">{renderCaseBadge(agr)}</div>
                        </div>
                        {renderStatusPill(agr.status)}
                      </div>
                      <div className="flex items-center justify-between text-xs text-slate-600">
                        <span>{t(`billing.feeTypes.${agr.feeType}`, agr.feeType)}</span>
                        <span>{formatLedgerDate(agr.agreementDate, i18n.language)}</span>
                      </div>
                      <div className="flex items-center justify-between text-xs pt-1">
                        <span className="font-bold text-slate-900">{formatBdt(agr.agreedAmountPaisa, { lang: i18n.language })}</span>
                        <span className="text-emerald-700 font-medium">
                          {t('billing.totalPaid', 'Paid')}: {formatBdt(agr.paidPaisa ?? 0, { lang: i18n.language })}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}

            {/* SECTION 2: PAYMENTS */}
            {section === 'payments' && (
              <>
                <div className="hidden md:block overflow-x-auto">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead>
                      <tr className="bg-slate-50 border-b border-slate-200 text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
                        <th className="py-3 px-4">{t('billing.receiptNo', 'Receipt #')}</th>
                        <th className="py-3 px-4">{t('billing.paymentDate', 'Date')}</th>
                        {!clientId && <th className="py-3 px-4">{t('clients.client', 'Client')}</th>}
                        <th className="py-3 px-4">{t('cases.case', 'Case')}</th>
                        <th className="py-3 px-4">{t('billing.method', 'Method')}</th>
                        <th className="py-3 px-4">{t('billing.purposeNote', 'Purpose')}</th>
                        <th className="py-3 px-4 text-right">{t('billing.amount', 'Amount')}</th>
                        <th className="py-3 px-4">{t('common.status', 'Status')}</th>
                        <th className="py-3 px-4 text-right">{t('common.actions', 'Actions')}</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {paginatedPayments.map((pay) => (
                        <tr
                          key={pay.id}
                          onClick={() => setDetailTarget({ kind: 'payment', record: pay })}
                          className="hover:bg-slate-50/80 cursor-pointer transition"
                        >
                          <td className="py-3 px-4 font-mono font-semibold text-slate-900 whitespace-nowrap">{pay.receiptNumber}</td>
                          <td className="py-3 px-4 whitespace-nowrap text-slate-700">{formatLedgerDate(pay.paymentDate, i18n.language)}</td>
                          {!clientId && <td className="py-3 px-4">{renderClientBadge(pay)}</td>}
                          <td className="py-3 px-4">{renderCaseBadge(pay)}</td>
                          <td className="py-3 px-4 text-slate-700">{t(`billing.methods.${pay.method}`, pay.method)}</td>
                          <td className="py-3 px-4 text-slate-600 max-w-[240px] truncate">{pay.purposeNote}</td>
                          <td className="py-3 px-4 text-right font-semibold text-emerald-700 whitespace-nowrap">
                            {formatBdt(pay.amountPaisa, { lang: i18n.language })}
                          </td>
                          <td className="py-3 px-4">{renderStatusPill(pay.status)}</td>
                          <td className="py-3 px-4 text-right" onClick={(e) => e.stopPropagation()}>
                            <div className="inline-flex items-center justify-end gap-1">
                              <button
                                type="button"
                                onClick={() => setDetailTarget({ kind: 'payment', record: pay })}
                                title={t('common.viewDetails', 'View details')}
                                className="p-2 text-slate-600 hover:bg-slate-100 rounded-lg min-h-[36px] min-w-[36px] inline-flex items-center justify-center"
                              >
                                <Eye className="w-3.5 h-3.5" />
                              </button>
                              {!isReadOnly && pay.status === 'posted' && canManageBilling && (!pay.feeAgreementId || pay.legacyUnassigned) && (
                                <button
                                  type="button"
                                  onClick={() => setAttachPaymentTarget(pay)}
                                  title={t('billing.attachToAgreement', 'Attach to Agreement')}
                                  className="p-2 text-amber-700 hover:bg-amber-50 rounded-lg min-h-[36px] min-w-[36px] inline-flex items-center justify-center"
                                >
                                  <Link2 className="w-3.5 h-3.5" />
                                </button>
                              )}
                              {!isReadOnly && pay.status === 'posted' && canManageBilling && (
                                <button
                                  type="button"
                                  onClick={() =>
                                    setVoidTarget({
                                      kind: 'payment',
                                      id: pay.id,
                                      title: t('billing.voidPayment', 'Void Payment'),
                                      description: `${pay.receiptNumber} · ${formatBdt(pay.amountPaisa, { lang: i18n.language })}`,
                                    })
                                  }
                                  title={t('billing.void', 'Void')}
                                  className="p-2 text-rose-600 hover:bg-rose-50 rounded-lg min-h-[36px] min-w-[36px] inline-flex items-center justify-center"
                                >
                                  <Ban className="w-3.5 h-3.5" />
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* Mobile Cards */}
                <div className="md:hidden divide-y divide-slate-100">
                  {paginatedPayments.map((pay) => (
                    <div
                      key={pay.id}
                      onClick={() => setDetailTarget({ kind: 'payment', record: pay })}
                      className="p-4 space-y-2 hover:bg-slate-50 cursor-pointer"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <span className="font-mono text-xs font-bold text-slate-900">{pay.receiptNumber}</span>
                          {!clientId && <div className="text-sm font-semibold mt-0.5">{renderClientBadge(pay)}</div>}
                          <div className="mt-0.5">{renderCaseBadge(pay)}</div>
                        </div>
                        {renderStatusPill(pay.status)}
                      </div>
                      <p className="text-xs text-slate-600 line-clamp-2">{pay.purposeNote}</p>
                      <div className="flex items-center justify-between text-xs pt-1">
                        <span className="font-bold text-emerald-700">{formatBdt(pay.amountPaisa, { lang: i18n.language })}</span>
                        <span className="text-slate-500">
                          {t(`billing.methods.${pay.method}`, pay.method)} · {formatLedgerDate(pay.paymentDate, i18n.language)}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}

            {/* SECTION 3: EXPENSES */}
            {section === 'expenses' && (
              <>
                <div className="hidden md:block overflow-x-auto">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead>
                      <tr className="bg-slate-50 border-b border-slate-200 text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
                        <th className="py-3 px-4">{t('billing.expenseDate', 'Date')}</th>
                        {!clientId && <th className="py-3 px-4">{t('clients.client', 'Client')}</th>}
                        <th className="py-3 px-4">{t('cases.case', 'Case')}</th>
                        <th className="py-3 px-4">{t('billing.expenseCategory', 'Category')}</th>
                        <th className="py-3 px-4">{t('billing.description', 'Description')}</th>
                        <th className="py-3 px-4 text-right">{t('billing.amount', 'Amount')}</th>
                        <th className="py-3 px-4">{t('common.status', 'Status')}</th>
                        <th className="py-3 px-4 text-right">{t('common.actions', 'Actions')}</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {paginatedExpenses.map((exp) => (
                        <tr
                          key={exp.id}
                          onClick={() => setDetailTarget({ kind: 'expense', record: exp })}
                          className="hover:bg-slate-50/80 cursor-pointer transition"
                        >
                          <td className="py-3 px-4 whitespace-nowrap text-slate-700">{formatLedgerDate(exp.expenseDate, i18n.language)}</td>
                          {!clientId && <td className="py-3 px-4">{renderClientBadge(exp)}</td>}
                          <td className="py-3 px-4">{renderCaseBadge(exp)}</td>
                          <td className="py-3 px-4 font-medium text-slate-700">
                            {t(`billing.categories.${exp.categoryName || ''}`, exp.categoryName || '-')}
                          </td>
                          <td className="py-3 px-4 text-slate-600 max-w-[240px] truncate">{exp.description}</td>
                          <td className="py-3 px-4 text-right font-semibold text-slate-900 whitespace-nowrap">
                            {formatBdt(exp.amountPaisa, { lang: i18n.language })}
                          </td>
                          <td className="py-3 px-4">{renderStatusPill(exp.status)}</td>
                          <td className="py-3 px-4 text-right" onClick={(e) => e.stopPropagation()}>
                            <div className="inline-flex items-center justify-end gap-1">
                              <button
                                type="button"
                                onClick={() => setDetailTarget({ kind: 'expense', record: exp })}
                                title={t('common.viewDetails', 'View details')}
                                className="p-2 text-slate-600 hover:bg-slate-100 rounded-lg min-h-[36px] min-w-[36px] inline-flex items-center justify-center"
                              >
                                <Eye className="w-3.5 h-3.5" />
                              </button>
                              {!isReadOnly && exp.status === 'posted' && canManageExpenses && (
                                <>
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setEditExpenseTarget(exp);
                                      setAddExpenseOpen(true);
                                    }}
                                    title={t('common.edit', 'Edit')}
                                    className="p-2 text-indigo-700 hover:bg-indigo-50 rounded-lg min-h-[36px] min-w-[36px] inline-flex items-center justify-center"
                                  >
                                    <Edit2 className="w-3.5 h-3.5" />
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() =>
                                      setVoidTarget({
                                        kind: 'expense',
                                        id: exp.id,
                                        title: t('billing.voidExpense', 'Void Expense'),
                                        description: `${exp.description} · ${formatBdt(exp.amountPaisa, { lang: i18n.language })}`,
                                      })
                                    }
                                    title={t('billing.void', 'Void')}
                                    className="p-2 text-rose-600 hover:bg-rose-50 rounded-lg min-h-[36px] min-w-[36px] inline-flex items-center justify-center"
                                  >
                                    <Ban className="w-3.5 h-3.5" />
                                  </button>
                                </>
                              )}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* Mobile Cards */}
                <div className="md:hidden divide-y divide-slate-100">
                  {paginatedExpenses.map((exp) => (
                    <div
                      key={exp.id}
                      onClick={() => setDetailTarget({ kind: 'expense', record: exp })}
                      className="p-4 space-y-2 hover:bg-slate-50 cursor-pointer"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          {!clientId && <div className="text-sm font-semibold">{renderClientBadge(exp)}</div>}
                          <div className="mt-0.5">{renderCaseBadge(exp)}</div>
                        </div>
                        {renderStatusPill(exp.status)}
                      </div>
                      <p className="text-xs font-medium text-slate-800">{exp.description}</p>
                      <div className="flex items-center justify-between text-xs pt-1">
                        <span className="font-bold text-slate-900">{formatBdt(exp.amountPaisa, { lang: i18n.language })}</span>
                        <span className="text-slate-500">
                          {t(`billing.categories.${exp.categoryName || ''}`, exp.categoryName || '-')} · {formatLedgerDate(exp.expenseDate, i18n.language)}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}

            {/* Pagination */}
            <div className="p-3 border-t border-slate-200">
              <TablePagination
                totalItems={activeItemsCount}
                currentPage={page}
                pageSize={pageSize}
                onPageChange={setPage}
                onPageSizeChange={(sz) => {
                  setPageSize(sz);
                  setPage(1);
                }}
              />
            </div>
          </>
        )}
      </div>

      {/* Modals */}
      <CreateAgreementModal
        isOpen={createAgreementOpen}
        clientId={clientId}
        caseId={caseId}
        onClose={() => setCreateAgreementOpen(false)}
        onSuccess={handleMutationSuccess}
      />

      <EditAgreementModal
        isOpen={Boolean(editAgreementTarget)}
        agreement={editAgreementTarget}
        lockCase={Boolean(caseId)}
        onClose={() => setEditAgreementTarget(null)}
        onSuccess={handleMutationSuccess}
      />

      <ReviseAgreementModal
        isOpen={Boolean(reviseAgreementTarget)}
        agreement={reviseAgreementTarget}
        onClose={() => setReviseAgreementTarget(null)}
        onSuccess={handleMutationSuccess}
      />

      <RecordPaymentModal
        isOpen={recordPaymentOpen}
        clientId={paymentDefaultClientId ?? clientId}
        caseId={paymentDefaultCaseId ?? caseId}
        feeAgreementId={paymentDefaultAgreementId}
        onClose={() => {
          setRecordPaymentOpen(false);
          setPaymentDefaultAgreementId(null);
        }}
        onSuccess={handleMutationSuccess}
      />

      <AddExpenseModal
        isOpen={addExpenseOpen}
        clientId={clientId}
        caseId={caseId}
        initialExpense={editExpenseTarget}
        onClose={() => {
          setAddExpenseOpen(false);
          setEditExpenseTarget(null);
        }}
        onSuccess={handleMutationSuccess}
      />

      <AttachPaymentModal
        isOpen={Boolean(attachPaymentTarget)}
        payment={attachPaymentTarget}
        agreements={agreements.filter((a) => !attachPaymentTarget || a.clientId === attachPaymentTarget.clientId)}
        cases={cases}
        onClose={() => setAttachPaymentTarget(null)}
        onSuccess={handleMutationSuccess}
      />

      <BillingRecordDetailModal
        isOpen={Boolean(detailTarget)}
        item={detailTarget}
        canManageBilling={canManageBilling}
        canManageExpenses={canManageExpenses}
        isReadOnly={isReadOnly}
        onClose={() => setDetailTarget(null)}
        onEditAgreement={(agr) => setEditAgreementTarget(agr)}
        onReviseAgreement={(agr) => setReviseAgreementTarget(agr)}
        onRecordPaymentForAgreement={(agr) => {
          setPaymentDefaultAgreementId(agr.id);
          setPaymentDefaultClientId(agr.clientId);
          setPaymentDefaultCaseId(agr.caseId);
          setRecordPaymentOpen(true);
        }}
        onCloseAgreement={handleCloseAgreement}
        onVoidAgreement={(agr) =>
          setVoidTarget({
            kind: 'agreement',
            id: agr.id,
            title: t('billing.voidAgreement', 'Void Agreement'),
            description: `${agr.clientName || ''} · ${formatBdt(agr.agreedAmountPaisa, { lang: i18n.language })}`,
          })
        }
        onAttachPayment={(pay) => setAttachPaymentTarget(pay)}
        onVoidPayment={(pay) =>
          setVoidTarget({
            kind: 'payment',
            id: pay.id,
            title: t('billing.voidPayment', 'Void Payment'),
            description: `${pay.receiptNumber} · ${formatBdt(pay.amountPaisa, { lang: i18n.language })}`,
          })
        }
        onEditExpense={(exp) => {
          setEditExpenseTarget(exp);
          setAddExpenseOpen(true);
        }}
        onVoidExpense={(exp) =>
          setVoidTarget({
            kind: 'expense',
            id: exp.id,
            title: t('billing.voidExpense', 'Void Expense'),
            description: `${exp.description} · ${formatBdt(exp.amountPaisa, { lang: i18n.language })}`,
          })
        }
      />

      {voidTarget && (
        <VoidRecordModal
          isOpen={Boolean(voidTarget)}
          title={voidTarget.title}
          itemDescription={voidTarget.description}
          onClose={() => setVoidTarget(null)}
          onConfirm={async (reason) => {
            if (!currentUser) return;
            if (voidTarget.kind === 'agreement') {
              await repos.accounts.voidAgreement({ currentUser }, voidTarget.id, reason);
            } else if (voidTarget.kind === 'payment') {
              await repos.accounts.voidPayment({ currentUser }, voidTarget.id, reason);
            } else {
              await repos.accounts.voidExpense({ currentUser }, voidTarget.id, reason);
            }
            handleMutationSuccess();
          }}
        />
      )}
    </div>
  );
};
