import React, { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../foundation/AuthContext';
import { getRepositories } from '../../data/repositories';
import {
  AccountsSummary,
  CaseRecord,
  Expense,
  FeeAgreement,
  FeePayment,
} from '../../data/types';
import {
  CreditCard,
  Plus,
  Receipt,
  FileText,
  AlertTriangle,
  RotateCcw,
  CheckCircle2,
  XCircle,
  Clock,
  Edit3,
  Briefcase,
  Link2,
} from 'lucide-react';
import { formatBdt } from '../../utils/currency';
import { RecordPaymentModal } from './RecordPaymentModal';
import { VoidRecordModal } from './VoidRecordModal';
import { AddExpenseModal } from './AddExpenseModal';
import { CreateAgreementModal } from './CreateAgreementModal';
import { ReviseAgreementModal } from './ReviseAgreementModal';
import { AttachPaymentModal } from './AttachPaymentModal';

interface BillingTabProps {
  clientId: string;
  caseId?: string | null;
}

export const BillingTab: React.FC<BillingTabProps> = ({ clientId, caseId }) => {
  const { t, i18n } = useTranslation();
  const { currentUser, can, isReadOnly } = useAuth();
  const repos = getRepositories();

  const [summary, setSummary] = useState<AccountsSummary | null>(null);
  const [cases, setCases] = useState<CaseRecord[]>([]);
  const [agreements, setAgreements] = useState<FeeAgreement[]>([]);
  const [payments, setPayments] = useState<FeePayment[]>([]);
  const [expenses, setExpenses] = useState<Array<Expense & { categoryName?: string }>>([]);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Modals state
  const [isRecordPaymentOpen, setIsRecordPaymentOpen] = useState(false);
  const [isAddExpenseOpen, setIsAddExpenseOpen] = useState(false);
  const [isCreateAgreementOpen, setIsCreateAgreementOpen] = useState(false);
  const [agreementToRevise, setAgreementToRevise] = useState<FeeAgreement | null>(null);
  const [paymentToAttach, setPaymentToAttach] = useState<FeePayment | null>(null);
  const [activeModalCaseId, setActiveModalCaseId] = useState<string | null>(caseId || null);
  const [activeModalAgreementId, setActiveModalAgreementId] = useState<string | null>(null);

  const [voidModalState, setVoidModalState] = useState<{
    isOpen: boolean;
    title: string;
    itemDescription: string;
    onConfirm: (reason: string) => Promise<void>;
  }>({
    isOpen: false,
    title: '',
    itemDescription: '',
    onConfirm: async () => {},
  });

  const canManageAccounts = can('accounts.manage');
  const canRecordExpenses = can('expenses.record');

  const loadData = useCallback(async () => {
    if (!currentUser) return;
    setLoading(true);
    setErrorMsg(null);

    const secContext = { currentUser };
    const filter = { clientId, caseId: caseId || undefined };

    try {
      const [sum, ags, pays, exps, clientCases] = await Promise.all([
        repos.accounts.getSummary(secContext, filter),
        repos.accounts.listAgreements(secContext, filter),
        repos.accounts.listPayments(secContext, filter),
        repos.accounts.listExpenses(secContext, filter),
        repos.case.list(secContext, { clientId }),
      ]);
      setSummary(sum);
      setAgreements(ags);
      setPayments(pays);
      setExpenses(exps);
      setCases(clientCases);
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : t('billing.errors.loadFailed', 'Failed to load accounts data'));
    } finally {
      setLoading(false);
    }
  }, [currentUser, clientId, caseId, repos, t]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleVoidPayment = (payment: FeePayment) => {
    setVoidModalState({
      isOpen: true,
      title: t('billing.voidPayment', 'Void Payment Receipt'),
      itemDescription: `${t('billing.receiptNumber', 'Receipt')}: ${payment.receiptNumber} — ${formatBdt(payment.amountPaisa, { lang: i18n.language })} (${payment.purposeNote})`,
      onConfirm: async (reason: string) => {
        if (!currentUser) return;
        await repos.accounts.voidPayment({ currentUser }, payment.id, reason);
        await loadData();
      },
    });
  };

  const handleVoidExpense = (expense: Expense & { categoryName?: string }) => {
    setVoidModalState({
      isOpen: true,
      title: t('billing.voidExpense', 'Void Expense Entry'),
      itemDescription: `${expense.categoryName || t('billing.expense', 'Expense')}: ${formatBdt(expense.amountPaisa, { lang: i18n.language })} — ${expense.description}`,
      onConfirm: async (reason: string) => {
        if (!currentUser) return;
        await repos.accounts.voidExpense({ currentUser }, expense.id, reason);
        await loadData();
      },
    });
  };

  const handleCloseAgreement = async (agreement: FeeAgreement) => {
    if (!currentUser) return;
    try {
      await repos.accounts.closeAgreement({ currentUser }, agreement.id);
      await loadData();
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : t('billing.errors.closeFailed', 'Failed to close agreement'));
    }
  };

  const handleVoidAgreement = (agreement: FeeAgreement) => {
    setVoidModalState({
      isOpen: true,
      title: t('billing.voidAgreement', 'Void Fee Agreement'),
      itemDescription: `${t(`billing.feeTypes.${agreement.feeType}`, agreement.feeType)} — ${formatBdt(agreement.agreedAmountPaisa, { lang: i18n.language })} (${agreement.agreementDate})`,
      onConfirm: async (reason: string) => {
        if (!currentUser) return;
        await repos.accounts.voidAgreement({ currentUser }, agreement.id, reason);
        await loadData();
      },
    });
  };

  const openRecordPayment = (targetCaseId?: string | null, targetAgreementId?: string | null) => {
    setActiveModalCaseId(targetCaseId ?? caseId ?? null);
    setActiveModalAgreementId(targetAgreementId ?? null);
    setIsRecordPaymentOpen(true);
  };

  const openCreateAgreement = (targetCaseId?: string | null) => {
    setActiveModalCaseId(targetCaseId ?? caseId ?? null);
    setIsCreateAgreementOpen(true);
  };

  const openAddExpense = (targetCaseId?: string | null) => {
    setActiveModalCaseId(targetCaseId ?? caseId ?? null);
    setIsAddExpenseOpen(true);
  };

  if (loading && !summary) {
    return (
      <div className="p-8 text-center text-xs text-slate-500">
        <div className="inline-block animate-spin rounded-full h-5 w-5 border-2 border-emerald-600 border-t-transparent mb-2"></div>
        <p>{t('common.loading', 'Loading accounts ledger...')}</p>
      </div>
    );
  }

  // Filter legacy unassigned records
  const unassignedPayments = payments.filter((p) => p.legacyUnassigned || !p.feeAgreementId || !p.caseId);
  const unassignedAgreements = agreements.filter((a) => !a.caseId);
  const unassignedExpenses = expenses.filter((e) => !e.caseId);
  const hasUnassigned = unassignedPayments.length > 0 || unassignedAgreements.length > 0 || unassignedExpenses.length > 0;

  // Render a specific case's tables
  const renderCaseBlock = (
    c: CaseRecord,
    caseAgreements: FeeAgreement[],
    casePayments: FeePayment[],
    caseExpenses: Array<Expense & { categoryName?: string }>
  ) => {
    const agreedPaisa = caseAgreements
      .filter((a) => a.status !== 'void')
      .reduce((s, a) => s + Number(a.agreedAmountPaisa || 0), 0);
    const paidPaisa = casePayments
      .filter((p) => p.status === 'posted')
      .reduce((s, p) => s + Number(p.amountPaisa || 0), 0);
    const expPaisa = caseExpenses
      .filter((e) => e.status === 'posted')
      .reduce((s, e) => s + Number(e.amountPaisa || 0), 0);
    const balancePaisa = agreedPaisa - paidPaisa;
    const isCredit = balancePaisa < 0;
    const outstandingPaisa = isCredit ? 0 : balancePaisa;
    const creditPaisa = isCredit ? Math.abs(balancePaisa) : 0;

    return (
      <div key={c.id} className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-sm space-y-4 p-5">
        {/* Case Header */}
        <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-slate-100">
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-indigo-50 text-indigo-700 rounded-lg">
              <Briefcase className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h4 className="text-sm font-bold text-slate-800">{c.caseNumber}</h4>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-slate-100 text-slate-700 capitalize">
                  {c.status}
                </span>
                {c.fileSerial && (
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-amber-50 text-amber-700 border border-amber-200">
                    {c.fileSerial}
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-500">
                {c.matterType || c.court} {c.description ? `— ${c.description}` : ''}
              </p>
            </div>
          </div>

          {/* Quick Case Actions */}
          <div className="flex flex-wrap items-center gap-2">
            {canManageAccounts && (
              <>
                <button
                  type="button"
                  onClick={() => openCreateAgreement(c.id)}
                  disabled={isReadOnly}
                  className="px-2.5 py-1.5 text-xs font-medium text-slate-700 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-lg flex items-center gap-1 min-h-[36px] disabled:opacity-50"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>{t('billing.addAgreement', 'Agreement')}</span>
                </button>
                <button
                  type="button"
                  onClick={() => openRecordPayment(c.id)}
                  disabled={isReadOnly}
                  className="px-3 py-1.5 text-xs font-medium text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg flex items-center gap-1 min-h-[36px] disabled:opacity-50"
                >
                  <CreditCard className="w-3.5 h-3.5" />
                  <span>{t('billing.recordPayment', 'Record Payment')}</span>
                </button>
              </>
            )}
            {canRecordExpenses && (
              <button
                type="button"
                onClick={() => openAddExpense(c.id)}
                disabled={isReadOnly}
                className="px-2.5 py-1.5 text-xs font-medium text-slate-700 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-lg flex items-center gap-1 min-h-[36px] disabled:opacity-50"
              >
                <Receipt className="w-3.5 h-3.5" />
                <span>{t('billing.addExpense', 'Expense')}</span>
              </button>
            )}
          </div>
        </div>

        {/* Case Financial KPI Row */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 bg-slate-50 p-3 rounded-lg border border-slate-200/60 text-xs">
          <div>
            <span className="text-slate-500 block text-[11px] uppercase font-semibold">{t('billing.totalAgreed', 'Agreed')}</span>
            <span className="text-sm font-bold text-slate-800">{formatBdt(agreedPaisa, { lang: i18n.language })}</span>
          </div>
          <div>
            <span className="text-slate-500 block text-[11px] uppercase font-semibold">{t('billing.totalCollected', 'Received')}</span>
            <span className="text-sm font-bold text-emerald-700">{formatBdt(paidPaisa, { lang: i18n.language })}</span>
          </div>
          <div>
            <span className="text-slate-500 block text-[11px] uppercase font-semibold">
              {isCredit ? t('billing.creditBalance', 'Advance Credit') : t('billing.outstandingBalance', 'Outstanding')}
            </span>
            <span className={`text-sm font-bold ${isCredit ? 'text-blue-700' : outstandingPaisa > 0 ? 'text-amber-700' : 'text-slate-700'}`}>
              {formatBdt(isCredit ? creditPaisa : outstandingPaisa, { lang: i18n.language })}
            </span>
          </div>
          <div>
            <span className="text-slate-500 block text-[11px] uppercase font-semibold">{t('billing.totalExpenses', 'Expenses')}</span>
            <span className="text-sm font-bold text-slate-700">{formatBdt(expPaisa, { lang: i18n.language })}</span>
          </div>
        </div>

        {/* Fee Agreements Table */}
        <div className="border border-slate-200 rounded-lg overflow-hidden">
          <div className="px-3 py-2 bg-slate-50 border-b border-slate-200 flex items-center justify-between text-xs font-semibold text-slate-700">
            <span className="flex items-center gap-1.5">
              <FileText className="w-3.5 h-3.5 text-indigo-600" />
              {t('billing.feeAgreements', 'Fee Agreements')} ({caseAgreements.length})
            </span>
          </div>
          {caseAgreements.length === 0 ? (
            <p className="p-3 text-xs text-slate-500 italic">{t('billing.noAgreements', 'No fee agreements recorded for this case.')}</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 text-slate-500 border-b border-slate-200">
                  <tr>
                    <th className="px-3 py-2">{t('billing.date', 'Date')}</th>
                    <th className="px-3 py-2">{t('billing.feeType', 'Structure')}</th>
                    <th className="px-3 py-2">{t('billing.agreedAmount', 'Agreed Fee')}</th>
                    <th className="px-3 py-2">{t('billing.notes', 'Notes')}</th>
                    <th className="px-3 py-2">{t('billing.status', 'Status')}</th>
                    {canManageAccounts && <th className="px-3 py-2 text-right">{t('common.actions', 'Actions')}</th>}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {caseAgreements.map((a) => (
                    <tr key={a.id} className="hover:bg-slate-50">
                      <td className="px-3 py-2 font-medium text-slate-700 whitespace-nowrap">{a.agreementDate}</td>
                      <td className="px-3 py-2 capitalize">{t(`billing.feeTypes.${a.feeType}`, a.feeType)}</td>
                      <td className="px-3 py-2 font-semibold text-slate-900">{formatBdt(a.agreedAmountPaisa, { lang: i18n.language })}</td>
                      <td className="px-3 py-2 text-slate-600 max-w-xs truncate">{a.notes || '—'}</td>
                      <td className="px-3 py-2">
                        <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium ${
                          a.status === 'active' ? 'bg-emerald-50 text-emerald-700' :
                          a.status === 'closed' ? 'bg-slate-100 text-slate-700' :
                          'bg-rose-50 text-rose-700'
                        }`}>
                          {t(`billing.status.${a.status}`, a.status)}
                        </span>
                      </td>
                      {canManageAccounts && (
                        <td className="px-3 py-2 text-right whitespace-nowrap">
                          {a.status === 'active' && !isReadOnly && (
                            <div className="flex items-center justify-end gap-1.5">
                              <button
                                type="button"
                                onClick={() => setAgreementToRevise(a)}
                                title={t('billing.reviseAgreement', 'Revise Agreed Amount')}
                                className="p-1 text-slate-500 hover:text-indigo-600 rounded"
                              >
                                <Edit3 className="w-3.5 h-3.5" />
                              </button>
                              <button
                                type="button"
                                onClick={() => handleCloseAgreement(a)}
                                title={t('billing.closeAgreement', 'Close Agreement')}
                                className="p-1 text-slate-500 hover:text-slate-700 rounded"
                              >
                                <CheckCircle2 className="w-3.5 h-3.5" />
                              </button>
                              <button
                                type="button"
                                onClick={() => handleVoidAgreement(a)}
                                title={t('billing.voidAgreement', 'Void Agreement')}
                                className="p-1 text-slate-500 hover:text-rose-600 rounded"
                              >
                                <XCircle className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          )}
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Payments Table */}
        <div className="border border-slate-200 rounded-lg overflow-hidden">
          <div className="px-3 py-2 bg-slate-50 border-b border-slate-200 flex items-center justify-between text-xs font-semibold text-slate-700">
            <span className="flex items-center gap-1.5">
              <CreditCard className="w-3.5 h-3.5 text-emerald-600" />
              {t('billing.paymentReceipts', 'Payment Receipts')} ({casePayments.length})
            </span>
          </div>
          {casePayments.length === 0 ? (
            <p className="p-3 text-xs text-slate-500 italic">{t('billing.noPayments', 'No payments recorded for this case yet.')}</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 text-slate-500 border-b border-slate-200">
                  <tr>
                    <th className="px-3 py-2">{t('billing.receiptNumber', 'Receipt #')}</th>
                    <th className="px-3 py-2">{t('billing.date', 'Date')}</th>
                    <th className="px-3 py-2">{t('billing.amount', 'Amount')}</th>
                    <th className="px-3 py-2">{t('billing.method', 'Method')}</th>
                    <th className="px-3 py-2">{t('billing.purposeNote', 'Purpose Note')}</th>
                    <th className="px-3 py-2">{t('billing.status', 'Status')}</th>
                    {canManageAccounts && <th className="px-3 py-2 text-right">{t('common.actions', 'Actions')}</th>}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {casePayments.map((p) => (
                    <tr key={p.id} className={`hover:bg-slate-50 ${p.status === 'void' ? 'opacity-60 bg-rose-50/20' : ''}`}>
                      <td className="px-3 py-2 font-mono font-semibold text-slate-800">{p.receiptNumber}</td>
                      <td className="px-3 py-2 whitespace-nowrap text-slate-600">{p.paymentDate}</td>
                      <td className="px-3 py-2 font-bold text-emerald-700">{formatBdt(p.amountPaisa, { lang: i18n.language })}</td>
                      <td className="px-3 py-2 capitalize">{t(`billing.methods.${p.method}`, p.method)}</td>
                      <td className="px-3 py-2 text-slate-700 max-w-sm truncate" title={p.purposeNote}>
                        {p.purposeNote}
                        {p.reference && <span className="text-[10px] text-slate-400 block">Ref: {p.reference}</span>}
                      </td>
                      <td className="px-3 py-2 whitespace-nowrap">
                        <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium ${
                          p.status === 'posted' ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700'
                        }`}>
                          {t(`billing.paymentStatus.${p.status}`, p.status)}
                        </span>
                      </td>
                      {canManageAccounts && (
                        <td className="px-3 py-2 text-right whitespace-nowrap">
                          {p.status === 'posted' && !isReadOnly && (
                            <button
                              type="button"
                              onClick={() => handleVoidPayment(p)}
                              title={t('billing.voidPayment', 'Void Payment')}
                              className="p-1 text-slate-400 hover:text-rose-600 rounded"
                            >
                              <RotateCcw className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Expenses Table */}
        <div className="border border-slate-200 rounded-lg overflow-hidden">
          <div className="px-3 py-2 bg-slate-50 border-b border-slate-200 flex items-center justify-between text-xs font-semibold text-slate-700">
            <span className="flex items-center gap-1.5">
              <Receipt className="w-3.5 h-3.5 text-slate-600" />
              {t('billing.caseExpenses', 'Disbursements & Court Expenses')} ({caseExpenses.length})
            </span>
          </div>
          {caseExpenses.length === 0 ? (
            <p className="p-3 text-xs text-slate-500 italic">{t('billing.noExpenses', 'No expenses recorded for this case.')}</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 text-slate-500 border-b border-slate-200">
                  <tr>
                    <th className="px-3 py-2">{t('billing.date', 'Date')}</th>
                    <th className="px-3 py-2">{t('billing.category', 'Category')}</th>
                    <th className="px-3 py-2">{t('billing.amount', 'Amount')}</th>
                    <th className="px-3 py-2">{t('billing.description', 'Description')}</th>
                    <th className="px-3 py-2">{t('billing.status', 'Status')}</th>
                    {canRecordExpenses && <th className="px-3 py-2 text-right">{t('common.actions', 'Actions')}</th>}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {caseExpenses.map((e) => (
                    <tr key={e.id} className={`hover:bg-slate-50 ${e.status === 'void' ? 'opacity-60 bg-rose-50/20' : ''}`}>
                      <td className="px-3 py-2 whitespace-nowrap text-slate-600">{e.expenseDate}</td>
                      <td className="px-3 py-2 font-medium text-slate-800">{e.categoryName || 'Disbursement'}</td>
                      <td className="px-3 py-2 font-bold text-slate-800">{formatBdt(e.amountPaisa, { lang: i18n.language })}</td>
                      <td className="px-3 py-2 text-slate-600 max-w-sm truncate">{e.description}</td>
                      <td className="px-3 py-2 whitespace-nowrap">
                        <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium ${
                          e.status === 'posted' ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700'
                        }`}>
                          {t(`billing.paymentStatus.${e.status}`, e.status)}
                        </span>
                      </td>
                      {canRecordExpenses && (
                        <td className="px-3 py-2 text-right whitespace-nowrap">
                          {e.status === 'posted' && !isReadOnly && (
                            <button
                              type="button"
                              onClick={() => handleVoidExpense(e)}
                              title={t('billing.voidExpense', 'Void Expense')}
                              className="p-1 text-slate-400 hover:text-rose-600 rounded"
                            >
                              <RotateCcw className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-6">
      {errorMsg && (
        <div className="p-3 bg-rose-50 border border-rose-200 rounded-lg text-rose-700 text-xs flex items-center justify-between">
          <span>{errorMsg}</span>
          <button type="button" onClick={() => setErrorMsg(null)} className="text-rose-600 hover:underline">
            {t('common.dismiss', 'Dismiss')}
          </button>
        </div>
      )}

      {/* Top Grand Total KPI Cards */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2">
            <CreditCard className="w-4 h-4 text-emerald-600" />
            <span>{caseId ? t('billing.caseFinancials', 'Case Financial Summary') : t('billing.grandTotal', 'Grand Total (All Matters)')}</span>
          </h3>
          <span className="text-xs text-slate-400">
            {caseId ? t('billing.singleMatter', '1 Case') : `${cases.length} ${t('cases.cases', 'Cases')}`}
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
            <div className="flex items-center justify-between text-slate-500 mb-1">
              <span className="text-xs font-semibold uppercase tracking-wider">{t('billing.totalAgreed', 'Total Agreed Fee')}</span>
              <FileText className="w-4 h-4 text-blue-600" />
            </div>
            <div className="text-2xl font-bold text-slate-900 tracking-tight">
              {formatBdt(summary?.totalAgreedPaisa || 0, { lang: i18n.language })}
            </div>
            <p className="text-xs text-slate-500 mt-1">
              {agreements.filter((a) => a.status === 'active').length} {t('billing.activeAgreementsCount', 'active contracts')}
            </p>
          </div>

          <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
            <div className="flex items-center justify-between text-slate-500 mb-1">
              <span className="text-xs font-semibold uppercase tracking-wider">{t('billing.totalCollected', 'Total Received')}</span>
              <CreditCard className="w-4 h-4 text-emerald-600" />
            </div>
            <div className="text-2xl font-bold text-emerald-700 tracking-tight">
              {formatBdt(summary?.totalPaidPaisa || 0, { lang: i18n.language })}
            </div>
            <p className="text-xs text-slate-500 mt-1">
              {payments.filter((p) => p.status === 'posted').length} {t('billing.postedPayments', 'receipted payments')}
            </p>
          </div>

          <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
            <div className="flex items-center justify-between text-slate-500 mb-1">
              <span className="text-xs font-semibold uppercase tracking-wider">
                {summary?.isCredit ? t('billing.creditBalance', 'Advance Credit') : t('billing.outstandingBalance', 'Outstanding')}
              </span>
              <Clock className="w-4 h-4 text-amber-600" />
            </div>
            <div
              className={`text-2xl font-bold tracking-tight ${
                summary?.isCredit ? 'text-blue-700' : (summary?.outstandingPaisa || 0) > 0 ? 'text-amber-700' : 'text-slate-700'
              }`}
            >
              {summary?.isCredit
                ? formatBdt(summary.creditPaisa, { lang: i18n.language })
                : formatBdt(summary?.outstandingPaisa || 0, { lang: i18n.language })}
            </div>
            <p className="text-xs text-slate-500 mt-1">
              {summary?.isCredit
                ? t('billing.advancePaid', 'Advance payment in credit')
                : (summary?.outstandingPaisa || 0) > 0
                ? t('billing.dueForCollection', 'Due for collection')
                : t('billing.allSettled', 'Fully settled')}
            </p>
          </div>

          <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
            <div className="flex items-center justify-between text-slate-500 mb-1">
              <span className="text-xs font-semibold uppercase tracking-wider">{t('billing.totalExpenses', 'Total Expenses')}</span>
              <Receipt className="w-4 h-4 text-slate-600" />
            </div>
            <div className="text-2xl font-bold text-slate-700 tracking-tight">
              {formatBdt(summary?.totalExpensesPaisa || 0, { lang: i18n.language })}
            </div>
            <p className="text-xs text-slate-500 mt-1">
              {expenses.filter((e) => e.status === 'posted').length} {t('billing.postedExpenses', 'disbursements')}
            </p>
          </div>
        </div>
      </div>

      {/* Global Toolbar for Client View or Case View */}
      <div className="flex flex-wrap items-center justify-between gap-3 bg-slate-50 p-3 rounded-xl border border-slate-200">
        <div className="flex items-center gap-2">
          <CreditCard className="w-5 h-5 text-slate-600" />
          <h3 className="text-sm font-semibold text-slate-800">
            {caseId ? t('billing.caseLedger', 'Case Ledger & Transactions') : t('billing.mattersLedger', 'Matters Billing Ledger')}
          </h3>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {canManageAccounts && (
            <>
              <button
                type="button"
                onClick={() => openCreateAgreement(caseId)}
                disabled={isReadOnly}
                className="px-3.5 py-2 text-xs font-medium text-slate-700 bg-white hover:bg-slate-100 border border-slate-300 rounded-lg shadow-sm flex items-center gap-1.5 min-h-[44px] disabled:opacity-50"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>{t('billing.addAgreement', 'Add Agreement')}</span>
              </button>
              <button
                type="button"
                onClick={() => openRecordPayment(caseId)}
                disabled={isReadOnly}
                className="px-3.5 py-2 text-xs font-medium text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg shadow-sm flex items-center gap-1.5 min-h-[44px] disabled:opacity-50"
              >
                <CreditCard className="w-3.5 h-3.5" />
                <span>{t('billing.recordPayment', 'Record Payment')}</span>
              </button>
            </>
          )}
          {canRecordExpenses && (
            <button
              type="button"
              onClick={() => openAddExpense(caseId)}
              disabled={isReadOnly}
              className="px-3.5 py-2 text-xs font-medium text-slate-700 bg-white hover:bg-slate-100 border border-slate-300 rounded-lg shadow-sm flex items-center gap-1.5 min-h-[44px] disabled:opacity-50"
            >
              <Receipt className="w-3.5 h-3.5" />
              <span>{t('billing.addExpense', 'Record Expense')}</span>
            </button>
          )}
        </div>
      </div>

      {/* Main Content: If Case View -> Render Single Case; If Client View -> Render One Block Per Case */}
      {caseId ? (
        // Case Dossier Billing Tab: only that case
        cases.find((c) => c.id === caseId) ? (
          renderCaseBlock(
            cases.find((c) => c.id === caseId)!,
            agreements.filter((a) => a.caseId === caseId),
            payments.filter((p) => p.caseId === caseId),
            expenses.filter((e) => e.caseId === caseId)
          )
        ) : (
          renderCaseBlock(
            { id: caseId, caseNumber: t('cases.case', 'Case'), court: '', status: 'active', firmId: currentUser?.firmId || '', clientId } as unknown as CaseRecord,
            agreements,
            payments,
            expenses
          )
        )
      ) : (
        // Client Dossier Billing Tab: ONE BLOCK PER CASE
        <div className="space-y-6">
          {cases.length === 0 ? (
            <div className="p-8 text-center text-xs text-slate-500 bg-white rounded-xl border border-slate-200">
              <Briefcase className="w-8 h-8 text-slate-300 mx-auto mb-2" />
              <p>{t('billing.noCasesYet', 'No cases registered for this client yet. Create a case to track fees and payments per case.')}</p>
            </div>
          ) : (
            cases.map((c) => {
              const caseAgs = agreements.filter((a) => a.caseId === c.id);
              const casePays = payments.filter((p) => p.caseId === c.id);
              const caseExps = expenses.filter((e) => e.caseId === c.id);
              return renderCaseBlock(c, caseAgs, casePays, caseExps);
            })
          )}

          {/* Legacy Unassigned Block (if any exist) */}
          {hasUnassigned && (
            <div className="bg-amber-50/50 rounded-xl border border-amber-300 p-5 space-y-4">
              <div className="flex items-center gap-2 text-amber-800">
                <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0" />
                <div>
                  <h4 className="text-sm font-bold uppercase tracking-wider">
                    {t('billing.unassignedBlock', 'Legacy Unassigned Billing Records')}
                  </h4>
                  <p className="text-xs text-amber-700">
                    {t(
                      'billing.unassignedDesc',
                      'These billing entries have no linked case or agreement. Use the attach action to link them to an active fee agreement.'
                    )}
                  </p>
                </div>
              </div>

              {unassignedPayments.length > 0 && (
                <div className="border border-amber-200 bg-white rounded-lg overflow-hidden">
                  <div className="px-3 py-2 bg-amber-100/50 border-b border-amber-200 text-xs font-semibold text-amber-900">
                    {t('billing.unassignedPayments', 'Unassigned Payments')} ({unassignedPayments.length})
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs">
                      <thead className="bg-slate-50 text-slate-500 border-b border-slate-200">
                        <tr>
                          <th className="px-3 py-2">{t('billing.receiptNumber', 'Receipt #')}</th>
                          <th className="px-3 py-2">{t('billing.date', 'Date')}</th>
                          <th className="px-3 py-2">{t('billing.amount', 'Amount')}</th>
                          <th className="px-3 py-2">{t('billing.method', 'Method')}</th>
                          <th className="px-3 py-2">{t('billing.purposeNote', 'Purpose Note')}</th>
                          <th className="px-3 py-2">{t('billing.status', 'Status')}</th>
                          {canManageAccounts && <th className="px-3 py-2 text-right">{t('common.actions', 'Actions')}</th>}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {unassignedPayments.map((p) => (
                          <tr key={p.id} className="hover:bg-slate-50">
                            <td className="px-3 py-2 font-mono font-semibold text-slate-800">{p.receiptNumber}</td>
                            <td className="px-3 py-2 whitespace-nowrap text-slate-600">{p.paymentDate}</td>
                            <td className="px-3 py-2 font-bold text-emerald-700">{formatBdt(p.amountPaisa, { lang: i18n.language })}</td>
                            <td className="px-3 py-2 capitalize">{t(`billing.methods.${p.method}`, p.method)}</td>
                            <td className="px-3 py-2 text-slate-700 max-w-sm truncate">{p.purposeNote}</td>
                            <td className="px-3 py-2">
                              <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-amber-50 text-amber-700 border border-amber-200">
                                {t('billing.unassigned', 'Unassigned')}
                              </span>
                            </td>
                            {canManageAccounts && (
                              <td className="px-3 py-2 text-right whitespace-nowrap">
                                {!isReadOnly && (
                                  <button
                                    type="button"
                                    onClick={() => setPaymentToAttach(p)}
                                    className="px-2.5 py-1 text-xs font-medium text-indigo-700 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 rounded flex items-center gap-1 ml-auto min-h-[32px]"
                                  >
                                    <Link2 className="w-3.5 h-3.5" />
                                    <span>{t('billing.attachToAgreement', 'Attach to Agreement')}</span>
                                  </button>
                                )}
                              </td>
                            )}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Record Payment Modal */}
      <RecordPaymentModal
        isOpen={isRecordPaymentOpen}
        clientId={clientId}
        caseId={activeModalCaseId}
        feeAgreementId={activeModalAgreementId}
        onClose={() => {
          setIsRecordPaymentOpen(false);
          setActiveModalCaseId(caseId || null);
          setActiveModalAgreementId(null);
        }}
        onSuccess={loadData}
      />

      {/* Create Fee Agreement Modal */}
      <CreateAgreementModal
        isOpen={isCreateAgreementOpen}
        clientId={clientId}
        caseId={activeModalCaseId}
        onClose={() => {
          setIsCreateAgreementOpen(false);
          setActiveModalCaseId(caseId || null);
        }}
        onSuccess={loadData}
      />

      {/* Add Expense Modal */}
      <AddExpenseModal
        isOpen={isAddExpenseOpen}
        clientId={clientId}
        caseId={activeModalCaseId}
        onClose={() => {
          setIsAddExpenseOpen(false);
          setActiveModalCaseId(caseId || null);
        }}
        onSuccess={loadData}
      />

      {/* Revise Agreement Modal */}
      {agreementToRevise && (
        <ReviseAgreementModal
          isOpen={!!agreementToRevise}
          agreement={agreementToRevise}
          onClose={() => setAgreementToRevise(null)}
          onSuccess={loadData}
        />
      )}

      {/* Attach Payment Modal */}
      {paymentToAttach && (
        <AttachPaymentModal
          isOpen={!!paymentToAttach}
          payment={paymentToAttach}
          agreements={agreements}
          cases={cases}
          onClose={() => setPaymentToAttach(null)}
          onSuccess={loadData}
        />
      )}

      {/* Void Confirmation Modal */}
      <VoidRecordModal
        isOpen={voidModalState.isOpen}
        title={voidModalState.title}
        itemDescription={voidModalState.itemDescription}
        onConfirm={voidModalState.onConfirm}
        onClose={() => setVoidModalState((prev) => ({ ...prev, isOpen: false }))}
      />
    </div>
  );
};
