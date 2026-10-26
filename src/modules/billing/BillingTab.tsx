import React, { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../foundation/AuthContext';
import { getRepositories } from '../../data/repositories';
import {
  AccountsSummary,
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
} from 'lucide-react';
import { formatBdt } from '../../utils/currency';
import { RecordPaymentModal } from './RecordPaymentModal';
import { VoidRecordModal } from './VoidRecordModal';
import { AddExpenseModal } from './AddExpenseModal';
import { CreateAgreementModal } from './CreateAgreementModal';
import { ReviseAgreementModal } from './ReviseAgreementModal';

interface BillingTabProps {
  clientId: string;
  caseId?: string | null;
}

export const BillingTab: React.FC<BillingTabProps> = ({ clientId, caseId }) => {
  const { t, i18n } = useTranslation();
  const { currentUser, can, isReadOnly } = useAuth();
  const repos = getRepositories();

  const [summary, setSummary] = useState<AccountsSummary | null>(null);
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
  const [voidModalState, setVoidModalState] = useState<{
    isOpen: boolean;
    title: string;
    description: string;
    onConfirm: (reason: string) => Promise<void>;
  }>({
    isOpen: false,
    title: '',
    description: '',
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
      const [sum, ags, pays, exps] = await Promise.all([
        repos.accounts.getSummary(secContext, filter),
        repos.accounts.listAgreements(secContext, filter),
        repos.accounts.listPayments(secContext, filter),
        repos.accounts.listExpenses(secContext, filter),
      ]);
      setSummary(sum);
      setAgreements(ags);
      setPayments(pays);
      setExpenses(exps);
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
      description: `${t('billing.receiptNumber', 'Receipt')}: ${payment.receiptNumber} — ${formatBdt(payment.amountPaisa, { lang: i18n.language })} (${payment.purposeNote})`,
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
      description: `${expense.categoryName || t('billing.expense', 'Expense')}: ${formatBdt(expense.amountPaisa, { lang: i18n.language })} — ${expense.description}`,
      onConfirm: async (reason: string) => {
        if (!currentUser) return;
        await repos.accounts.voidExpense({ currentUser }, expense.id, reason);
        await loadData();
      },
    });
  };

  const handleVoidAgreement = (agreement: FeeAgreement) => {
    setVoidModalState({
      isOpen: true,
      title: t('billing.voidAgreement', 'Void Fee Agreement'),
      description: `${t('billing.agreedFee', 'Agreed Fee')}: ${formatBdt(agreement.agreedAmountPaisa, { lang: i18n.language })} (${t(`billing.feeTypes.${agreement.feeType}`, agreement.feeType)})`,
      onConfirm: async (reason: string) => {
        if (!currentUser) return;
        await repos.accounts.voidAgreement({ currentUser }, agreement.id, reason);
        await loadData();
      },
    });
  };

  const handleCloseAgreement = async (agreement: FeeAgreement) => {
    if (!currentUser || isReadOnly) return;
    try {
      await repos.accounts.closeAgreement({ currentUser }, agreement.id);
      await loadData();
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : t('billing.errors.actionFailed', 'Failed to update agreement'));
    }
  };

  return (
    <div className="space-y-6" data-testid="billing-tab">
      {errorMsg && (
        <div className="p-3 bg-rose-50 border border-rose-200 rounded-lg text-rose-700 text-xs flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 shrink-0 text-rose-600" />
          <span>{errorMsg}</span>
        </div>
      )}

      {/* Summary KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Total Agreed */}
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
          <div className="flex items-center justify-between text-slate-500 mb-1">
            <span className="text-xs font-semibold uppercase tracking-wider">{t('billing.agreedFee', 'Agreed Fee')}</span>
            <FileText className="w-4 h-4 text-blue-600" />
          </div>
          <div className="text-2xl font-bold text-slate-900 tracking-tight">
            {formatBdt(summary?.totalAgreedPaisa || 0, { lang: i18n.language })}
          </div>
          <p className="text-xs text-slate-500 mt-1">
            {agreements.filter((a) => a.status === 'active').length} {t('billing.activeAgreements', 'active')}
          </p>
        </div>

        {/* Total Received */}
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
          <div className="flex items-center justify-between text-slate-500 mb-1">
            <span className="text-xs font-semibold uppercase tracking-wider">{t('billing.totalReceived', 'Total Received')}</span>
            <CheckCircle2 className="w-4 h-4 text-emerald-600" />
          </div>
          <div className="text-2xl font-bold text-emerald-600 tracking-tight">
            {formatBdt(summary?.totalPaidPaisa || 0, { lang: i18n.language })}
          </div>
          <p className="text-xs text-slate-500 mt-1">
            {payments.filter((p) => p.status === 'posted').length} {t('billing.postedReceipts', 'receipts')}
          </p>
        </div>

        {/* Outstanding / Credit */}
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
          <div className="flex items-center justify-between text-slate-500 mb-1">
            <span className="text-xs font-semibold uppercase tracking-wider">
              {summary?.isCredit ? t('billing.creditBalance', 'Credit Balance') : t('billing.outstanding', 'Outstanding')}
            </span>
            <Clock className={`w-4 h-4 ${summary?.isCredit ? 'text-cyan-600' : 'text-amber-600'}`} />
          </div>
          <div
            className={`text-2xl font-bold tracking-tight ${
              summary?.isCredit
                ? 'text-cyan-600'
                : (summary?.outstandingPaisa || 0) > 0
                ? 'text-amber-600'
                : 'text-slate-900'
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

        {/* Expenses */}
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

      {/* Action Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3 bg-slate-50 p-3 rounded-xl border border-slate-200">
        <div className="flex items-center gap-2">
          <CreditCard className="w-5 h-5 text-slate-600" />
          <h3 className="text-sm font-semibold text-slate-800">{t('billing.financialOverview', 'Accounts & Financial Ledger')}</h3>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {canManageAccounts && (
            <>
              <button
                type="button"
                onClick={() => setIsCreateAgreementOpen(true)}
                disabled={isReadOnly}
                className="px-3.5 py-2 text-xs font-medium text-slate-700 bg-white hover:bg-slate-100 border border-slate-300 rounded-lg shadow-sm flex items-center gap-1.5 min-h-[44px] disabled:opacity-50"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>{t('billing.addAgreement', 'Add Agreement')}</span>
              </button>
              <button
                type="button"
                onClick={() => setIsRecordPaymentOpen(true)}
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
              onClick={() => setIsAddExpenseOpen(true)}
              disabled={isReadOnly}
              className="px-3.5 py-2 text-xs font-medium text-slate-700 bg-white hover:bg-slate-100 border border-slate-300 rounded-lg shadow-sm flex items-center gap-1.5 min-h-[44px] disabled:opacity-50"
            >
              <Receipt className="w-3.5 h-3.5" />
              <span>{t('billing.addExpense', 'Record Expense')}</span>
            </button>
          )}
        </div>
      </div>

      {/* Fee Agreements Section */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-sm">
        <div className="px-4 py-3 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <FileText className="w-4 h-4 text-blue-600" />
            <h4 className="text-xs font-semibold text-slate-800 uppercase tracking-wider">
              {t('billing.feeAgreements', 'Fee Agreements')} ({agreements.length})
            </h4>
          </div>
        </div>

        {agreements.length === 0 ? (
          <div className="p-6 text-center text-xs text-slate-500">
            {t('billing.noAgreements', 'No fee agreements recorded yet.')}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 text-slate-500 uppercase tracking-wider border-b border-slate-200">
                <tr>
                  <th className="px-4 py-2.5 font-semibold">{t('billing.date', 'Date')}</th>
                  <th className="px-4 py-2.5 font-semibold">{t('billing.feeType', 'Structure')}</th>
                  <th className="px-4 py-2.5 font-semibold">{t('billing.agreedAmount', 'Agreed Fee')}</th>
                  <th className="px-4 py-2.5 font-semibold">{t('billing.notes', 'Terms / Notes')}</th>
                  <th className="px-4 py-2.5 font-semibold">{t('billing.status', 'Status')}</th>
                  {canManageAccounts && <th className="px-4 py-2.5 font-semibold text-right">{t('common.actions', 'Actions')}</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {agreements.map((ag) => (
                  <tr key={ag.id} className="hover:bg-slate-50/70 transition-colors">
                    <td className="px-4 py-3 whitespace-nowrap text-slate-700 font-medium">{ag.agreementDate}</td>
                    <td className="px-4 py-3 whitespace-nowrap text-slate-600">
                      {t(`billing.feeTypes.${ag.feeType}`, ag.feeType)}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap font-bold text-slate-900">
                      {formatBdt(ag.agreedAmountPaisa, { lang: i18n.language })}
                    </td>
                    <td className="px-4 py-3 text-slate-600 max-w-xs truncate">{ag.notes || '—'}</td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <span
                        className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                          ag.status === 'active'
                            ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                            : ag.status === 'closed'
                            ? 'bg-slate-100 text-slate-600 border border-slate-200'
                            : 'bg-rose-50 text-rose-700 border border-rose-200 line-through'
                        }`}
                      >
                        {t(`billing.statusValues.${ag.status}`, ag.status)}
                      </span>
                    </td>
                    {canManageAccounts && (
                      <td className="px-4 py-3 whitespace-nowrap text-right space-x-2">
                        {ag.status === 'active' && !isReadOnly && (
                          <>
                            <button
                              type="button"
                              onClick={() => setAgreementToRevise(ag)}
                              className="text-blue-600 hover:text-blue-800 font-medium text-xs inline-flex items-center gap-1"
                            >
                              <Edit3 className="w-3 h-3" />
                              <span>{t('billing.revise', 'Revise')}</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => handleCloseAgreement(ag)}
                              className="text-slate-600 hover:text-slate-800 font-medium text-xs inline-flex items-center gap-1"
                            >
                              <CheckCircle2 className="w-3 h-3" />
                              <span>{t('billing.close', 'Close')}</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => handleVoidAgreement(ag)}
                              className="text-rose-600 hover:text-rose-800 font-medium text-xs inline-flex items-center gap-1"
                            >
                              <XCircle className="w-3 h-3" />
                              <span>{t('billing.void', 'Void')}</span>
                            </button>
                          </>
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

      {/* Payment Receipts Section */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-sm">
        <div className="px-4 py-3 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CreditCard className="w-4 h-4 text-emerald-600" />
            <h4 className="text-xs font-semibold text-slate-800 uppercase tracking-wider">
              {t('billing.paymentReceipts', 'Payments Received')} ({payments.length})
            </h4>
          </div>
        </div>

        {payments.length === 0 ? (
          <div className="p-6 text-center text-xs text-slate-500">
            {t('billing.noPayments', 'No payments recorded yet.')}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 text-slate-500 uppercase tracking-wider border-b border-slate-200">
                <tr>
                  <th className="px-4 py-2.5 font-semibold">{t('billing.receiptNo', 'Receipt #')}</th>
                  <th className="px-4 py-2.5 font-semibold">{t('billing.date', 'Date')}</th>
                  <th className="px-4 py-2.5 font-semibold">{t('billing.amountBdt', 'Amount')}</th>
                  <th className="px-4 py-2.5 font-semibold">{t('billing.method', 'Method')}</th>
                  <th className="px-4 py-2.5 font-semibold">{t('billing.purposeNote', 'Purpose Note')}</th>
                  <th className="px-4 py-2.5 font-semibold">{t('billing.status', 'Status')}</th>
                  {canManageAccounts && <th className="px-4 py-2.5 font-semibold text-right">{t('common.actions', 'Actions')}</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {payments.map((p) => {
                  const isVoid = p.status === 'void';
                  return (
                    <tr key={p.id} className={`hover:bg-slate-50/70 transition-colors ${isVoid ? 'bg-slate-50/50 opacity-60' : ''}`}>
                      <td className="px-4 py-3 whitespace-nowrap font-mono font-bold text-slate-800">
                        {p.receiptNumber}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-slate-600">{p.paymentDate}</td>
                      <td className={`px-4 py-3 whitespace-nowrap font-bold text-emerald-700 ${isVoid ? 'line-through text-slate-400' : ''}`}>
                        {formatBdt(p.amountPaisa, { lang: i18n.language })}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <span className="capitalize text-slate-700 font-medium">
                          {t(`billing.methods.${p.method}`, p.method)}
                        </span>
                        {p.reference && <span className="text-[11px] text-slate-400 block font-mono">{p.reference}</span>}
                      </td>
                      <td className="px-4 py-3 text-slate-700 max-w-sm">
                        <div className="font-medium text-slate-800">{p.purposeNote}</div>
                        {isVoid && p.voidReason && (
                          <div className="text-[11px] text-rose-600 mt-0.5">
                            <span className="font-semibold">{t('billing.voidReasonLabel', 'Void reason')}:</span> {p.voidReason}
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <span
                          className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                            !isVoid
                              ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                              : 'bg-rose-50 text-rose-700 border border-rose-200'
                          }`}
                        >
                          {t(`billing.statusValues.${p.status}`, p.status)}
                        </span>
                      </td>
                      {canManageAccounts && (
                        <td className="px-4 py-3 whitespace-nowrap text-right">
                          {!isVoid && !isReadOnly && (
                            <button
                              type="button"
                              onClick={() => handleVoidPayment(p)}
                              className="text-rose-600 hover:text-rose-800 font-medium text-xs inline-flex items-center gap-1"
                            >
                              <RotateCcw className="w-3 h-3" />
                              <span>{t('billing.void', 'Void')}</span>
                            </button>
                          )}
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Expenses Section */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-sm">
        <div className="px-4 py-3 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Receipt className="w-4 h-4 text-slate-600" />
            <h4 className="text-xs font-semibold text-slate-800 uppercase tracking-wider">
              {t('billing.expenses', 'Expenses & Disbursements')} ({expenses.length})
            </h4>
          </div>
        </div>

        {expenses.length === 0 ? (
          <div className="p-6 text-center text-xs text-slate-500">
            {t('billing.noExpenses', 'No expenses recorded yet.')}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 text-slate-500 uppercase tracking-wider border-b border-slate-200">
                <tr>
                  <th className="px-4 py-2.5 font-semibold">{t('billing.date', 'Date')}</th>
                  <th className="px-4 py-2.5 font-semibold">{t('billing.category', 'Category')}</th>
                  <th className="px-4 py-2.5 font-semibold">{t('billing.amountBdt', 'Amount')}</th>
                  <th className="px-4 py-2.5 font-semibold">{t('billing.description', 'Description')}</th>
                  <th className="px-4 py-2.5 font-semibold">{t('billing.reimbursable', 'Reimbursable')}</th>
                  <th className="px-4 py-2.5 font-semibold">{t('billing.status', 'Status')}</th>
                  {canRecordExpenses && <th className="px-4 py-2.5 font-semibold text-right">{t('common.actions', 'Actions')}</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {expenses.map((e) => {
                  const isVoid = e.status === 'void';
                  return (
                    <tr key={e.id} className={`hover:bg-slate-50/70 transition-colors ${isVoid ? 'bg-slate-50/50 opacity-60' : ''}`}>
                      <td className="px-4 py-3 whitespace-nowrap text-slate-600">{e.expenseDate}</td>
                      <td className="px-4 py-3 whitespace-nowrap font-medium text-slate-800">
                        {e.categoryName ? t(`billing.categories.${e.categoryName}`, e.categoryName) : '—'}
                      </td>
                      <td className={`px-4 py-3 whitespace-nowrap font-bold text-slate-900 ${isVoid ? 'line-through text-slate-400' : ''}`}>
                        {formatBdt(e.amountPaisa, { lang: i18n.language })}
                      </td>
                      <td className="px-4 py-3 text-slate-700 max-w-sm">
                        <div>{e.description}</div>
                        {isVoid && e.voidReason && (
                          <div className="text-[11px] text-rose-600 mt-0.5">
                            <span className="font-semibold">{t('billing.voidReasonLabel', 'Void reason')}:</span> {e.voidReason}
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <span
                          className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-medium ${
                            e.reimbursable ? 'bg-blue-50 text-blue-700' : 'bg-slate-100 text-slate-600'
                          }`}
                        >
                          {e.reimbursable ? t('billing.yes', 'Yes') : t('billing.no', 'No')}
                        </span>
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <span
                          className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                            !isVoid
                              ? 'bg-slate-100 text-slate-700'
                              : 'bg-rose-50 text-rose-700 border border-rose-200'
                          }`}
                        >
                          {t(`billing.statusValues.${e.status}`, e.status)}
                        </span>
                      </td>
                      {canRecordExpenses && (
                        <td className="px-4 py-3 whitespace-nowrap text-right">
                          {!isVoid && !isReadOnly && (
                            <button
                              type="button"
                              onClick={() => handleVoidExpense(e)}
                              className="text-rose-600 hover:text-rose-800 font-medium text-xs inline-flex items-center gap-1"
                            >
                              <RotateCcw className="w-3 h-3" />
                              <span>{t('billing.void', 'Void')}</span>
                            </button>
                          )}
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Modals */}
      <RecordPaymentModal
        isOpen={isRecordPaymentOpen}
        clientId={clientId}
        caseId={caseId}
        onClose={() => setIsRecordPaymentOpen(false)}
        onSuccess={loadData}
      />

      <AddExpenseModal
        isOpen={isAddExpenseOpen}
        clientId={clientId}
        caseId={caseId}
        onClose={() => setIsAddExpenseOpen(false)}
        onSuccess={loadData}
      />

      <CreateAgreementModal
        isOpen={isCreateAgreementOpen}
        clientId={clientId}
        caseId={caseId}
        onClose={() => setIsCreateAgreementOpen(false)}
        onSuccess={loadData}
      />

      <ReviseAgreementModal
        isOpen={Boolean(agreementToRevise)}
        agreement={agreementToRevise}
        onClose={() => setAgreementToRevise(null)}
        onSuccess={loadData}
      />

      <VoidRecordModal
        isOpen={voidModalState.isOpen}
        title={voidModalState.title}
        itemDescription={voidModalState.description}
        onClose={() => setVoidModalState((s) => ({ ...s, isOpen: false }))}
        onConfirm={voidModalState.onConfirm}
      />
    </div>
  );
};
