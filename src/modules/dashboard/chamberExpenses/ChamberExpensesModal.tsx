import React, { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../foundation/AuthContext';
import { getRepositories } from '../../../data/repositories';
import {
  ChamberExpense,
  ChamberExpenseCategory,
  ChamberAdvance,
  ChamberExpensesSummary,
  ChamberPaymentMethod,
  ChamberSettlementType,
} from '../../../data/types';
import { ResponsiveModal } from '../../../components/responsive/ResponsiveModal';
import { TablePagination } from '../../../components/responsive/TablePagination';
import { formatBdt } from '../../../utils/currency';
import {
  Receipt,
  Plus,
  TrendingUp,
  Wallet,
  Calendar,
  AlertCircle,
  CheckCircle2,
  Trash2,
  CheckSquare,
  FileText,
  User,
  ArrowRight,
} from 'lucide-react';

interface ChamberExpensesModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialTab?: 'expenses' | 'summary' | 'advances';
  onExpenseChanged?: () => void;
}

export const ChamberExpensesModal: React.FC<ChamberExpensesModalProps> = ({
  isOpen,
  onClose,
  initialTab = 'expenses',
  onExpenseChanged,
}) => {
  const { t, i18n } = useTranslation();
  const { currentUser, can, isReadOnly } = useAuth();
  const [activeTab, setActiveTab] = useState<'expenses' | 'summary' | 'advances'>(initialTab);

  const canView = can('chamber_expenses.view');
  const canRecord = can('chamber_expenses.record') && !isReadOnly;
  const canManage = can('chamber_expenses.manage') && !isReadOnly;
  const canSalary = can('chamber_expenses.salary');

  // Data states
  const [categories, setCategories] = useState<ChamberExpenseCategory[]>([]);
  const [expenses, setExpenses] = useState<ChamberExpense[]>([]);
  const [advances, setAdvances] = useState<ChamberAdvance[]>([]);
  const [summary, setSummary] = useState<ChamberExpensesSummary | null>(null);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Filters & Pagination for Expenses
  const [expCategoryFilter, setExpCategoryFilter] = useState('');
  const [expStatusFilter, setExpStatusFilter] = useState('');
  const [expPage, setExpPage] = useState(1);
  const [expPageSize, setExpPageSize] = useState(25);

  // Filters & Pagination for Advances
  const [advStatusFilter, setAdvStatusFilter] = useState('');
  const [advPage, setAdvPage] = useState(1);
  const [advPageSize, setAdvPageSize] = useState(25);

  // Sub-forms / Sub-modals
  const [showAddExpense, setShowAddExpense] = useState(false);
  const [showAddAdvance, setShowAddAdvance] = useState(false);
  const [settleAdvanceTarget, setSettleAdvanceTarget] = useState<ChamberAdvance | null>(null);
  const [voidExpenseTarget, setVoidExpenseTarget] = useState<ChamberExpense | null>(null);
  const [voidAdvanceTarget, setVoidAdvanceTarget] = useState<ChamberAdvance | null>(null);
  const [voidReason, setVoidReason] = useState('');

  // Add Expense Form state
  const todayStr = new Date().toISOString().slice(0, 10);
  const [expCategoryId, setExpCategoryId] = useState('');
  const [expDescription, setExpDescription] = useState('');
  const [expAmount, setExpAmount] = useState('');
  const [expDate, setExpDate] = useState(todayStr);
  const [expPaidTo, setExpPaidTo] = useState('');
  const [expPaymentMethod, setExpPaymentMethod] = useState<ChamberPaymentMethod>('cash');
  const [expReceiptRef, setExpReceiptRef] = useState('');
  const [expNotes, setExpNotes] = useState('');
  const [expAdvanceId, setExpAdvanceId] = useState('');

  // Add Advance Form state
  const [advGivenTo, setAdvGivenTo] = useState('');
  const [advAmount, setAdvAmount] = useState('');
  const [advDate, setAdvDate] = useState(todayStr);
  const [advPurpose, setAdvPurpose] = useState('');
  const [advPaymentMethod, setAdvPaymentMethod] = useState<ChamberPaymentMethod>('cash');

  // Settle Advance Form state
  const [settleType, setSettleType] = useState<ChamberSettlementType>('refund');
  const [settleAmount, setSettleAmount] = useState('');
  const [settleDate, setSettleDate] = useState(todayStr);
  const [settleNotes, setSettleNotes] = useState('');

  // Sync initial tab
  useEffect(() => {
    if (isOpen) {
      setActiveTab(initialTab);
      setErrorMsg(null);
      setSuccessMsg(null);
    }
  }, [isOpen, initialTab]);

  const loadData = useCallback(async () => {
    if (!currentUser || !canView) return;
    try {
      setLoading(true);
      const repos = getRepositories();
      const [cats, exps, advs, sum] = await Promise.all([
        repos.chamberExpenses.listCategories({ currentUser }),
        repos.chamberExpenses.listExpenses({ currentUser }),
        repos.chamberExpenses.listAdvances({ currentUser }),
        repos.chamberExpenses.getSummary({ currentUser }),
      ]);
      setCategories(cats);
      setExpenses(exps);
      setAdvances(advs);
      setSummary(sum);
      if (cats.length > 0 && !expCategoryId) {
        setExpCategoryId(cats[0].id);
      }
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to load chamber expenses data');
    } finally {
      setLoading(false);
    }
  }, [currentUser, canView, expCategoryId]);

  useEffect(() => {
    if (isOpen) {
      loadData();
    }
  }, [isOpen, loadData]);

  // Handle Record Expense
  const handleRecordExpense = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentUser || !canRecord) return;
    setErrorMsg(null);
    setSuccessMsg(null);

    const amt = parseFloat(expAmount);
    if (isNaN(amt) || amt <= 0) {
      setErrorMsg(t('chamberExpenses.validAmountError', 'Please enter a valid amount greater than 0'));
      return;
    }
    const amountPaisa = Math.round(amt * 100);

    try {
      const repos = getRepositories();
      await repos.chamberExpenses.recordExpense(
        { currentUser },
        {
          categoryId: expCategoryId,
          description: expDescription.trim(),
          amountPaisa,
          expenseDate: expDate,
          paidTo: expPaidTo.trim(),
          paymentMethod: expPaymentMethod,
          receiptRef: expReceiptRef.trim() || null,
          notes: expNotes.trim() || null,
          advanceId: expAdvanceId || null,
        }
      );

      setSuccessMsg(t('chamberExpenses.expenseRecordedSuccess', 'Chamber expense recorded successfully'));
      setShowAddExpense(false);
      setExpDescription('');
      setExpAmount('');
      setExpPaidTo('');
      setExpReceiptRef('');
      setExpNotes('');
      setExpAdvanceId('');
      await loadData();
      onExpenseChanged?.();
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to record expense');
    }
  };

  // Handle Record Advance
  const handleRecordAdvance = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentUser || !canRecord) return;
    setErrorMsg(null);
    setSuccessMsg(null);

    const amt = parseFloat(advAmount);
    if (isNaN(amt) || amt <= 0) {
      setErrorMsg(t('chamberExpenses.validAmountError', 'Please enter a valid amount greater than 0'));
      return;
    }
    const amountPaisa = Math.round(amt * 100);

    try {
      const repos = getRepositories();
      await repos.chamberExpenses.createAdvance(
        { currentUser },
        {
          givenTo: advGivenTo.trim(),
          amountPaisa,
          givenDate: advDate,
          purpose: advPurpose.trim(),
          paymentMethod: advPaymentMethod,
        }
      );

      setSuccessMsg(t('chamberExpenses.advanceGivenSuccess', 'Advance recorded successfully'));
      setShowAddAdvance(false);
      setAdvGivenTo('');
      setAdvAmount('');
      setAdvPurpose('');
      await loadData();
      onExpenseChanged?.();
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to record advance');
    }
  };

  // Handle Settle Advance
  const handleSettleAdvance = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentUser || !canRecord || !settleAdvanceTarget) return;
    setErrorMsg(null);
    setSuccessMsg(null);

    const amt = parseFloat(settleAmount);
    if (isNaN(amt) || amt <= 0) {
      setErrorMsg(t('chamberExpenses.validAmountError', 'Please enter a valid amount greater than 0'));
      return;
    }
    const amountPaisa = Math.round(amt * 100);

    try {
      const repos = getRepositories();
      await repos.chamberExpenses.settleAdvance(
        { currentUser },
        settleAdvanceTarget.id,
        {
          type: settleType,
          amountPaisa,
          settledDate: settleDate,
          notes: settleNotes.trim() || null,
        }
      );

      setSuccessMsg(t('chamberExpenses.advanceSettledSuccess', 'Advance settled successfully'));
      setSettleAdvanceTarget(null);
      setSettleAmount('');
      setSettleNotes('');
      await loadData();
      onExpenseChanged?.();
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to settle advance');
    }
  };

  // Handle Void Expense
  const handleConfirmVoidExpense = async () => {
    if (!currentUser || !canManage || !voidExpenseTarget) return;
    if (voidReason.trim().length < 3) {
      setErrorMsg(t('chamberExpenses.voidReasonMinError', 'Void reason must be at least 3 characters'));
      return;
    }
    try {
      const repos = getRepositories();
      await repos.chamberExpenses.voidExpense({ currentUser }, voidExpenseTarget.id, voidReason.trim());
      setSuccessMsg(t('chamberExpenses.expenseVoidedSuccess', 'Expense voided successfully'));
      setVoidExpenseTarget(null);
      setVoidReason('');
      await loadData();
      onExpenseChanged?.();
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to void expense');
    }
  };

  // Handle Void Advance
  const handleConfirmVoidAdvance = async () => {
    if (!currentUser || !canManage || !voidAdvanceTarget) return;
    if (voidReason.trim().length < 3) {
      setErrorMsg(t('chamberExpenses.voidReasonMinError', 'Void reason must be at least 3 characters'));
      return;
    }
    try {
      const repos = getRepositories();
      await repos.chamberExpenses.voidAdvance({ currentUser }, voidAdvanceTarget.id, voidReason.trim());
      setSuccessMsg(t('chamberExpenses.advanceVoidedSuccess', 'Advance voided successfully'));
      setVoidAdvanceTarget(null);
      setVoidReason('');
      await loadData();
      onExpenseChanged?.();
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to void advance');
    }
  };

  // Filtered Expenses
  const filteredExpenses = expenses.filter((e) => {
    if (expCategoryFilter && e.categoryId !== expCategoryFilter) return false;
    if (expStatusFilter && e.status !== expStatusFilter) return false;
    return true;
  });

  const pagedExpenses = filteredExpenses.slice(
    (expPage - 1) * expPageSize,
    expPage * expPageSize
  );

  // Filtered Advances
  const filteredAdvances = advances.filter((a) => {
    if (advStatusFilter && a.status !== advStatusFilter) return false;
    return true;
  });

  const pagedAdvances = filteredAdvances.slice(
    (advPage - 1) * advPageSize,
    advPage * advPageSize
  );

  // Open advances available for settling by expense
  const openAdvances = advances.filter((a) => a.status === 'open');

  return (
    <ResponsiveModal
      isOpen={isOpen}
      onClose={onClose}
      title={
        <div className="flex items-center gap-2">
          <Receipt className="w-5 h-5 text-emerald-600" />
          <span>{t('chamberExpenses.modalTitle', 'Chamber Expenses & Advances')}</span>
        </div>
      }
      subtitle={t(
        'chamberExpenses.modalSubtitle',
        'Manage office supplies, utilities, rent, salaries, staff advances, and petty cash'
      )}
      maxWidth="4xl"
    >
      <div className="space-y-4">
        {/* Alerts */}
        {errorMsg && (
          <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-rose-800 text-xs flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
              <span>{errorMsg}</span>
            </div>
            <button
              onClick={() => setErrorMsg(null)}
              className="text-xs text-rose-500 font-bold hover:text-rose-700"
            >
              ✕
            </button>
          </div>
        )}

        {successMsg && (
          <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-emerald-800 text-xs flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
              <span>{successMsg}</span>
            </div>
            <button
              onClick={() => setSuccessMsg(null)}
              className="text-xs text-emerald-500 font-bold hover:text-emerald-700"
            >
              ✕
            </button>
          </div>
        )}

        {/* Navigation Tabs */}
        <div className="flex items-center gap-2 border-b border-slate-200 pb-2">
          <button
            type="button"
            onClick={() => setActiveTab('expenses')}
            className={`min-h-[38px] px-3.5 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition ${
              activeTab === 'expenses'
                ? 'bg-slate-900 text-white shadow-2xs'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            <Receipt className="w-3.5 h-3.5" />
            <span>{t('chamberExpenses.tabExpenses', 'Expenses')}</span>
            <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-slate-200/50">
              {expenses.length}
            </span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('summary')}
            className={`min-h-[38px] px-3.5 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition ${
              activeTab === 'summary'
                ? 'bg-slate-900 text-white shadow-2xs'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            <TrendingUp className="w-3.5 h-3.5" />
            <span>{t('chamberExpenses.tabSummary', 'Monthly Summary')}</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('advances')}
            className={`min-h-[38px] px-3.5 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition ${
              activeTab === 'advances'
                ? 'bg-slate-900 text-white shadow-2xs'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            <Wallet className="w-3.5 h-3.5" />
            <span>{t('chamberExpenses.tabAdvances', 'Staff Advances')}</span>
            <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-slate-200/50">
              {advances.filter((a) => a.status === 'open').length} {t('chamberExpenses.open', 'open')}
            </span>
          </button>
        </div>

        {/* TAB 1: EXPENSES LIST */}
        {activeTab === 'expenses' && (
          <div className="space-y-4">
            {/* Header / Add expense button */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-slate-50 p-3 rounded-xl border border-slate-200">
              <div className="flex items-center gap-2 flex-wrap">
                <select
                  value={expCategoryFilter}
                  onChange={(e) => {
                    setExpCategoryFilter(e.target.value);
                    setExpPage(1);
                  }}
                  className="px-2.5 py-1.5 bg-white border border-slate-200 rounded-lg text-xs text-slate-700 min-h-[36px]"
                >
                  <option value="">{t('chamberExpenses.allCategories', 'All Categories')}</option>
                  {categories.map((c) => (
                    <option key={c.id} value={c.id}>
                      {i18n.language === 'bn' && c.nameBn ? c.nameBn : c.name}
                    </option>
                  ))}
                </select>

                <select
                  value={expStatusFilter}
                  onChange={(e) => {
                    setExpStatusFilter(e.target.value);
                    setExpPage(1);
                  }}
                  className="px-2.5 py-1.5 bg-white border border-slate-200 rounded-lg text-xs text-slate-700 min-h-[36px]"
                >
                  <option value="">{t('chamberExpenses.allStatuses', 'All Statuses')}</option>
                  <option value="posted">{t('chamberExpenses.posted', 'Posted')}</option>
                  <option value="void">{t('chamberExpenses.void', 'Void')}</option>
                </select>
              </div>

              {canRecord && (
                <button
                  type="button"
                  onClick={() => setShowAddExpense(!showAddExpense)}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-slate-900 hover:bg-slate-800 text-white rounded-lg text-xs font-semibold shadow-2xs transition min-h-[36px]"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>
                    {showAddExpense
                      ? t('common.cancel', 'Cancel')
                      : t('chamberExpenses.recordExpense', 'Record Expense')}
                  </span>
                </button>
              )}
            </div>

            {/* Inline Add Expense Form */}
            {showAddExpense && (
              <form
                onSubmit={handleRecordExpense}
                className="p-4 bg-emerald-50/50 border border-emerald-200 rounded-xl space-y-3"
              >
                <h4 className="text-xs font-bold uppercase tracking-wider text-emerald-900">
                  {t('chamberExpenses.recordNewExpense', 'Record New Chamber Expense')}
                </h4>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
                  <div>
                    <label className="block font-semibold text-slate-700 mb-1">
                      {t('chamberExpenses.category', 'Category')} *
                    </label>
                    <select
                      value={expCategoryId}
                      onChange={(e) => setExpCategoryId(e.target.value)}
                      required
                      className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-xs min-h-[36px]"
                    >
                      {categories.map((c) => (
                        <option key={c.id} value={c.id}>
                          {i18n.language === 'bn' && c.nameBn ? c.nameBn : c.name}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block font-semibold text-slate-700 mb-1">
                      {t('chamberExpenses.amountBdt', 'Amount (৳)')} *
                    </label>
                    <input
                      type="number"
                      step="1"
                      min="1"
                      required
                      value={expAmount}
                      onChange={(e) => setExpAmount(e.target.value)}
                      placeholder="e.g. 1500"
                      className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-xs min-h-[36px]"
                    />
                  </div>

                  <div>
                    <label className="block font-semibold text-slate-700 mb-1">
                      {t('chamberExpenses.expenseDate', 'Date')} *
                    </label>
                    <input
                      type="date"
                      required
                      value={expDate}
                      onChange={(e) => setExpDate(e.target.value)}
                      className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-xs min-h-[36px]"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
                  <div>
                    <label className="block font-semibold text-slate-700 mb-1">
                      {t('chamberExpenses.paidTo', 'Paid To (Person / Vendor)')} *
                    </label>
                    <input
                      type="text"
                      required
                      value={expPaidTo}
                      onChange={(e) => setExpPaidTo(e.target.value)}
                      placeholder="e.g. Desh Stationery / Jamuna Power"
                      className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-xs min-h-[36px]"
                    />
                  </div>

                  <div>
                    <label className="block font-semibold text-slate-700 mb-1">
                      {t('chamberExpenses.paymentMethod', 'Payment Method')} *
                    </label>
                    <select
                      value={expPaymentMethod}
                      onChange={(e) => setExpPaymentMethod(e.target.value as ChamberPaymentMethod)}
                      className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-xs min-h-[36px]"
                    >
                      <option value="cash">{t('chamberExpenses.methodCash', 'Cash')}</option>
                      <option value="bank">{t('chamberExpenses.methodBank', 'Bank Transfer')}</option>
                      <option value="mobile_banking">{t('chamberExpenses.methodMFS', 'bKash / Nagad')}</option>
                      <option value="cheque">{t('chamberExpenses.methodCheque', 'Cheque')}</option>
                      <option value="other">{t('chamberExpenses.methodOther', 'Other')}</option>
                    </select>
                  </div>

                  <div>
                    <label className="block font-semibold text-slate-700 mb-1">
                      {t('chamberExpenses.receiptRef', 'Receipt / Voucher #')}
                    </label>
                    <input
                      type="text"
                      value={expReceiptRef}
                      onChange={(e) => setExpReceiptRef(e.target.value)}
                      placeholder="e.g. VCH-2026-0042"
                      className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-xs min-h-[36px]"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                  <div>
                    <label className="block font-semibold text-slate-700 mb-1">
                      {t('chamberExpenses.description', 'Description')} *
                    </label>
                    <input
                      type="text"
                      required
                      value={expDescription}
                      onChange={(e) => setExpDescription(e.target.value)}
                      placeholder="e.g. A4 Paper reams and printer cartridge"
                      className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-xs min-h-[36px]"
                    />
                  </div>

                  <div>
                    <label className="block font-semibold text-slate-700 mb-1">
                      {t('chamberExpenses.linkAdvance', 'Settle Against Staff Advance (Optional)')}
                    </label>
                    <select
                      value={expAdvanceId}
                      onChange={(e) => setExpAdvanceId(e.target.value)}
                      className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-xs min-h-[36px]"
                    >
                      <option value="">{t('chamberExpenses.noneDirectExpense', 'None (Direct Chamber Expense)')}</option>
                      {openAdvances.map((a) => (
                        <option key={a.id} value={a.id}>
                          {a.givenTo} — Remaining: {formatBdt(a.remainingAmountPaisa ?? a.amountPaisa, { lang: i18n.language })} ({a.purpose})
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="flex justify-end gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => setShowAddExpense(false)}
                    className="px-3 py-1.5 border border-slate-300 hover:bg-slate-50 rounded-lg text-xs font-semibold text-slate-700 min-h-[36px]"
                  >
                    {t('common.cancel', 'Cancel')}
                  </button>
                  <button
                    type="submit"
                    className="px-4 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-semibold shadow-2xs min-h-[36px]"
                  >
                    {t('chamberExpenses.saveExpense', 'Save Expense')}
                  </button>
                </div>
              </form>
            )}

            {/* Expenses Table */}
            <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-2xs">
              {loading ? (
                <div className="p-8 text-center text-xs text-slate-500">{t('common.loading', 'Loading...')}</div>
              ) : filteredExpenses.length === 0 ? (
                <div className="p-8 text-center text-xs text-slate-500">
                  {t('chamberExpenses.noExpensesFound', 'No chamber expenses found.')}
                </div>
              ) : (
                <>
                  {/* Mobile view (< md) */}
                  <div className="block md:hidden divide-y divide-slate-100">
                    {pagedExpenses.map((e) => (
                      <div key={e.id} className="p-3.5 space-y-2">
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">
                              {e.categoryName}
                            </span>
                            <div className="font-semibold text-slate-900 text-xs">{e.description}</div>
                            <span className="text-[11px] text-slate-500">Paid to: {e.paidTo}</span>
                          </div>
                          <div className="text-right">
                            <span className="font-bold text-sm text-slate-900">
                              {formatBdt(e.amountPaisa, { lang: i18n.language })}
                            </span>
                            <span
                              className={`block text-[10px] font-bold px-1.5 py-0.2 rounded ${
                                e.status === 'posted'
                                  ? 'bg-emerald-50 text-emerald-700'
                                  : 'bg-rose-50 text-rose-700'
                              }`}
                            >
                              {e.status}
                            </span>
                          </div>
                        </div>

                        <div className="flex items-center justify-between text-[11px] text-slate-400 pt-1">
                          <span>{e.expenseDate} • {e.paymentMethod}</span>
                          {canManage && e.status === 'posted' && (
                            <button
                              type="button"
                              onClick={() => {
                                setVoidExpenseTarget(e);
                                setVoidReason('');
                              }}
                              className="text-rose-600 hover:text-rose-800 text-xs font-semibold p-1"
                            >
                              {t('common.void', 'Void')}
                            </button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Desktop view (>= md) */}
                  <div className="hidden md:block overflow-x-auto">
                    <table className="w-full text-left text-xs">
                      <thead className="bg-slate-50 text-slate-500 uppercase tracking-wider border-b border-slate-200">
                        <tr>
                          <th className="px-4 py-3 font-semibold">{t('chamberExpenses.date', 'Date')}</th>
                          <th className="px-4 py-3 font-semibold">{t('chamberExpenses.category', 'Category')}</th>
                          <th className="px-4 py-3 font-semibold">{t('chamberExpenses.description', 'Description')}</th>
                          <th className="px-4 py-3 font-semibold">{t('chamberExpenses.paidTo', 'Paid To')}</th>
                          <th className="px-4 py-3 font-semibold text-right">{t('chamberExpenses.amount', 'Amount (৳)')}</th>
                          <th className="px-4 py-3 font-semibold text-center">{t('chamberExpenses.status', 'Status')}</th>
                          <th className="px-4 py-3 font-semibold text-center">{t('common.actions', 'Action')}</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {pagedExpenses.map((e) => (
                          <tr key={e.id} className="hover:bg-slate-50/60 transition">
                            <td className="px-4 py-3 font-mono text-slate-600 whitespace-nowrap">
                              {e.expenseDate}
                            </td>
                            <td className="px-4 py-3 font-medium text-slate-800 whitespace-nowrap">
                              {i18n.language === 'bn' && e.categoryNameBn ? e.categoryNameBn : e.categoryName}
                            </td>
                            <td className="px-4 py-3 text-slate-700 max-w-xs">
                              <div className="line-clamp-2">{e.description}</div>
                              {e.receiptRef && (
                                <span className="text-[10px] text-slate-400 block font-mono">
                                  Ref: {e.receiptRef}
                                </span>
                              )}
                            </td>
                            <td className="px-4 py-3 text-slate-600 whitespace-nowrap">
                              {e.paidTo}
                            </td>
                            <td className="px-4 py-3 text-right font-bold text-slate-900 whitespace-nowrap">
                              {formatBdt(e.amountPaisa, { lang: i18n.language })}
                            </td>
                            <td className="px-4 py-3 text-center whitespace-nowrap">
                              <span
                                className={`inline-block text-[10px] font-bold px-2 py-0.5 rounded ${
                                  e.status === 'posted'
                                    ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                                    : 'bg-rose-50 text-rose-700 border border-rose-200'
                                }`}
                              >
                                {e.status}
                              </span>
                            </td>
                            <td className="px-4 py-3 text-center whitespace-nowrap">
                              {canManage && e.status === 'posted' ? (
                                <button
                                  type="button"
                                  onClick={() => {
                                    setVoidExpenseTarget(e);
                                    setVoidReason('');
                                  }}
                                  className="px-2.5 py-1 text-xs font-semibold text-rose-700 bg-rose-50 hover:bg-rose-100 rounded-lg inline-flex items-center gap-1 transition min-h-[32px]"
                                >
                                  <Trash2 className="w-3 h-3" />
                                  <span>{t('common.void', 'Void')}</span>
                                </button>
                              ) : (
                                <span className="text-slate-300">—</span>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </>
              )}
            </div>

            {/* Pagination */}
            {filteredExpenses.length > 0 && (
              <TablePagination
                totalItems={filteredExpenses.length}
                currentPage={expPage}
                pageSize={expPageSize}
                onPageChange={setExpPage}
                onPageSizeChange={(sz) => {
                  setExpPageSize(sz);
                  setExpPage(1);
                }}
              />
            )}
          </div>
        )}

        {/* TAB 2: MONTHLY SUMMARY */}
        {activeTab === 'summary' && (
          <div className="space-y-4">
            {/* KPI Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs">
                <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider block mb-1">
                  {t('chamberExpenses.thisMonthTotal', 'This Month Total')}
                </span>
                <span className="text-2xl font-extrabold text-slate-900">
                  {formatBdt(summary?.totalThisMonthPaisa ?? 0, { lang: i18n.language })}
                </span>
              </div>

              <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs">
                <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider block mb-1">
                  {t('chamberExpenses.lastMonthTotal', 'Last Month Total')}
                </span>
                <span className="text-2xl font-extrabold text-slate-700">
                  {formatBdt(summary?.totalLastMonthPaisa ?? 0, { lang: i18n.language })}
                </span>
              </div>

              {canSalary && (
                <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs">
                  <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider block mb-1">
                    {t('chamberExpenses.salaryThisMonth', 'Staff Salaries This Month')}
                  </span>
                  <span className="text-2xl font-extrabold text-indigo-700">
                    {formatBdt(summary?.totalSalaryThisMonthPaisa ?? 0, { lang: i18n.language })}
                  </span>
                </div>
              )}
            </div>

            {/* Category breakdown table */}
            <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-2xs">
              <div className="px-4 py-3 bg-slate-50 border-b border-slate-200 font-bold text-xs text-slate-700 uppercase tracking-wider">
                {t('chamberExpenses.breakdownByCategory', 'Breakdown By Category')}
              </div>

              <div className="divide-y divide-slate-100">
                {(summary?.byCategory || []).length === 0 ? (
                  <div className="p-8 text-center text-xs text-slate-400">
                    {t('chamberExpenses.noCategoryData', 'No expense records found for this period.')}
                  </div>
                ) : (
                  (summary?.byCategory || []).map((cat) => {
                    const percent =
                      summary && summary.totalThisMonthPaisa > 0
                        ? Math.round((cat.totalPaisa / summary.totalThisMonthPaisa) * 100)
                        : 0;

                    return (
                      <div key={cat.categoryId} className="p-4 space-y-2">
                        <div className="flex items-center justify-between text-xs">
                          <div>
                            <span className="font-bold text-slate-900">
                              {i18n.language === 'bn' && cat.categoryNameBn ? cat.categoryNameBn : cat.categoryName}
                            </span>
                            <span className="text-slate-400 ml-2">({cat.count} expenses)</span>
                          </div>
                          <div className="font-extrabold text-slate-900">
                            {formatBdt(cat.totalPaisa, { lang: i18n.language })} ({percent}%)
                          </div>
                        </div>

                        {/* Progress bar */}
                        <div className="w-full bg-slate-100 rounded-full h-2 overflow-hidden">
                          <div
                            className={`h-2 rounded-full ${
                              cat.categoryKind === 'salary' ? 'bg-indigo-600' : 'bg-emerald-600'
                            }`}
                            style={{ width: `${Math.min(100, Math.max(2, percent))}%` }}
                          />
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          </div>
        )}

        {/* TAB 3: ADVANCES & PETTY CASH */}
        {activeTab === 'advances' && (
          <div className="space-y-4">
            {/* Header / Add advance button */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-slate-50 p-3 rounded-xl border border-slate-200">
              <div className="flex items-center gap-2">
                <select
                  value={advStatusFilter}
                  onChange={(e) => {
                    setAdvStatusFilter(e.target.value);
                    setAdvPage(1);
                  }}
                  className="px-2.5 py-1.5 bg-white border border-slate-200 rounded-lg text-xs text-slate-700 min-h-[36px]"
                >
                  <option value="">{t('chamberExpenses.allStatuses', 'All Statuses')}</option>
                  <option value="open">{t('chamberExpenses.statusOpen', 'Open (Unsettled)')}</option>
                  <option value="settled">{t('chamberExpenses.statusSettled', 'Settled')}</option>
                  <option value="void">{t('chamberExpenses.statusVoid', 'Void')}</option>
                </select>
              </div>

              {canRecord && (
                <button
                  type="button"
                  onClick={() => setShowAddAdvance(!showAddAdvance)}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-slate-900 hover:bg-slate-800 text-white rounded-lg text-xs font-semibold shadow-2xs transition min-h-[36px]"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>
                    {showAddAdvance
                      ? t('common.cancel', 'Cancel')
                      : t('chamberExpenses.giveAdvance', 'Give Staff Advance')}
                  </span>
                </button>
              )}
            </div>

            {/* Inline Add Advance Form */}
            {showAddAdvance && (
              <form
                onSubmit={handleRecordAdvance}
                className="p-4 bg-indigo-50/50 border border-indigo-200 rounded-xl space-y-3"
              >
                <h4 className="text-xs font-bold uppercase tracking-wider text-indigo-900">
                  {t('chamberExpenses.giveAdvanceTitle', 'Give Staff Advance / Petty Cash')}
                </h4>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
                  <div>
                    <label className="block font-semibold text-slate-700 mb-1">
                      {t('chamberExpenses.givenTo', 'Given To (Staff Name)')} *
                    </label>
                    <input
                      type="text"
                      required
                      value={advGivenTo}
                      onChange={(e) => setAdvGivenTo(e.target.value)}
                      placeholder="e.g. Kamal Hossain (Clerk)"
                      className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-xs min-h-[36px]"
                    />
                  </div>

                  <div>
                    <label className="block font-semibold text-slate-700 mb-1">
                      {t('chamberExpenses.amountBdt', 'Advance Amount (৳)')} *
                    </label>
                    <input
                      type="number"
                      step="1"
                      min="1"
                      required
                      value={advAmount}
                      onChange={(e) => setAdvAmount(e.target.value)}
                      placeholder="e.g. 5000"
                      className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-xs min-h-[36px]"
                    />
                  </div>

                  <div>
                    <label className="block font-semibold text-slate-700 mb-1">
                      {t('chamberExpenses.givenDate', 'Date')} *
                    </label>
                    <input
                      type="date"
                      required
                      value={advDate}
                      onChange={(e) => setAdvDate(e.target.value)}
                      className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-xs min-h-[36px]"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                  <div>
                    <label className="block font-semibold text-slate-700 mb-1">
                      {t('chamberExpenses.purpose', 'Purpose')} *
                    </label>
                    <input
                      type="text"
                      required
                      value={advPurpose}
                      onChange={(e) => setAdvPurpose(e.target.value)}
                      placeholder="e.g. Petty cash for court paperwork, photocopying, stamps"
                      className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-xs min-h-[36px]"
                    />
                  </div>

                  <div>
                    <label className="block font-semibold text-slate-700 mb-1">
                      {t('chamberExpenses.paymentMethod', 'Disbursed Via')} *
                    </label>
                    <select
                      value={advPaymentMethod}
                      onChange={(e) => setAdvPaymentMethod(e.target.value as ChamberPaymentMethod)}
                      className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-xs min-h-[36px]"
                    >
                      <option value="cash">{t('chamberExpenses.methodCash', 'Cash')}</option>
                      <option value="bank">{t('chamberExpenses.methodBank', 'Bank Transfer')}</option>
                      <option value="mobile_banking">{t('chamberExpenses.methodMFS', 'bKash / Nagad')}</option>
                      <option value="cheque">{t('chamberExpenses.methodCheque', 'Cheque')}</option>
                      <option value="other">{t('chamberExpenses.methodOther', 'Other')}</option>
                    </select>
                  </div>
                </div>

                <div className="flex justify-end gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => setShowAddAdvance(false)}
                    className="px-3 py-1.5 border border-slate-300 hover:bg-slate-50 rounded-lg text-xs font-semibold text-slate-700 min-h-[36px]"
                  >
                    {t('common.cancel', 'Cancel')}
                  </button>
                  <button
                    type="submit"
                    className="px-4 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-semibold shadow-2xs min-h-[36px]"
                  >
                    {t('chamberExpenses.saveAdvance', 'Record Advance')}
                  </button>
                </div>
              </form>
            )}

            {/* Advances Table */}
            <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-2xs">
              {loading ? (
                <div className="p-8 text-center text-xs text-slate-500">{t('common.loading', 'Loading...')}</div>
              ) : filteredAdvances.length === 0 ? (
                <div className="p-8 text-center text-xs text-slate-500">
                  {t('chamberExpenses.noAdvancesFound', 'No advance records found.')}
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-slate-50 text-slate-500 uppercase tracking-wider border-b border-slate-200">
                      <tr>
                        <th className="px-4 py-3 font-semibold">{t('chamberExpenses.givenDate', 'Date')}</th>
                        <th className="px-4 py-3 font-semibold">{t('chamberExpenses.givenTo', 'Given To')}</th>
                        <th className="px-4 py-3 font-semibold">{t('chamberExpenses.purpose', 'Purpose')}</th>
                        <th className="px-4 py-3 font-semibold text-right">{t('chamberExpenses.advanceAmount', 'Advance (৳)')}</th>
                        <th className="px-4 py-3 font-semibold text-right">{t('chamberExpenses.remaining', 'Remaining (৳)')}</th>
                        <th className="px-4 py-3 font-semibold text-center">{t('chamberExpenses.status', 'Status')}</th>
                        <th className="px-4 py-3 font-semibold text-center">{t('common.actions', 'Action')}</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {pagedAdvances.map((a) => {
                        const remaining = a.remainingAmountPaisa ?? (a.status === 'settled' ? 0 : a.amountPaisa);
                        return (
                          <tr key={a.id} className="hover:bg-slate-50/60 transition">
                            <td className="px-4 py-3 font-mono text-slate-600 whitespace-nowrap">
                              {a.givenDate}
                            </td>
                            <td className="px-4 py-3 font-semibold text-slate-900 whitespace-nowrap">
                              {a.givenTo}
                            </td>
                            <td className="px-4 py-3 text-slate-700 max-w-xs">
                              <div className="line-clamp-2">{a.purpose}</div>
                            </td>
                            <td className="px-4 py-3 text-right font-medium text-slate-900 whitespace-nowrap">
                              {formatBdt(a.amountPaisa, { lang: i18n.language })}
                            </td>
                            <td className="px-4 py-3 text-right font-bold whitespace-nowrap">
                              <span className={remaining > 0 ? 'text-amber-600' : 'text-slate-400'}>
                                {formatBdt(remaining, { lang: i18n.language })}
                              </span>
                            </td>
                            <td className="px-4 py-3 text-center whitespace-nowrap">
                              <span
                                className={`inline-block text-[10px] font-bold px-2 py-0.5 rounded ${
                                  a.status === 'open'
                                    ? 'bg-amber-50 text-amber-700 border border-amber-200'
                                    : a.status === 'settled'
                                    ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                                    : 'bg-rose-50 text-rose-700 border border-rose-200'
                                }`}
                              >
                                {a.status}
                              </span>
                            </td>
                            <td className="px-4 py-3 text-center whitespace-nowrap">
                              <div className="flex items-center justify-center gap-1.5">
                                {canRecord && a.status === 'open' && (
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setSettleAdvanceTarget(a);
                                      setSettleAmount(String(remaining / 100));
                                      setSettleNotes('');
                                    }}
                                    className="px-2.5 py-1 text-xs font-semibold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 rounded-lg inline-flex items-center gap-1 transition min-h-[32px]"
                                  >
                                    <CheckSquare className="w-3 h-3" />
                                    <span>{t('chamberExpenses.settle', 'Settle')}</span>
                                  </button>
                                )}

                                {canManage && a.status === 'open' && (!a.settledAmountPaisa || a.settledAmountPaisa === 0) && (
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setVoidAdvanceTarget(a);
                                      setVoidReason('');
                                    }}
                                    className="px-2 py-1 text-xs font-semibold text-rose-700 bg-rose-50 hover:bg-rose-100 rounded-lg inline-flex items-center gap-1 transition min-h-[32px]"
                                  >
                                    <Trash2 className="w-3 h-3" />
                                    <span>{t('common.void', 'Void')}</span>
                                  </button>
                                )}
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* Pagination */}
            {filteredAdvances.length > 0 && (
              <TablePagination
                totalItems={filteredAdvances.length}
                currentPage={advPage}
                pageSize={advPageSize}
                onPageChange={setAdvPage}
                onPageSizeChange={(sz) => {
                  setAdvPageSize(sz);
                  setAdvPage(1);
                }}
              />
            )}
          </div>
        )}

        {/* SUBMODAL: SETTLE ADVANCE */}
        {settleAdvanceTarget && (
          <div className="fixed inset-0 z-60 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
            <form
              onSubmit={handleSettleAdvance}
              className="bg-white rounded-2xl max-w-md w-full p-5 space-y-4 shadow-2xl border border-slate-200"
            >
              <div className="flex items-center justify-between">
                <h4 className="text-sm font-bold text-slate-900">
                  {t('chamberExpenses.settleAdvanceTitle', 'Settle Advance')}
                </h4>
                <button
                  type="button"
                  onClick={() => setSettleAdvanceTarget(null)}
                  className="text-slate-400 hover:text-slate-600 text-sm font-bold"
                >
                  ✕
                </button>
              </div>

              <div className="text-xs text-slate-600 bg-slate-50 p-3 rounded-lg space-y-1">
                <div>
                  <strong className="text-slate-800">Given to:</strong> {settleAdvanceTarget.givenTo}
                </div>
                <div>
                  <strong className="text-slate-800">Advance:</strong>{' '}
                  {formatBdt(settleAdvanceTarget.amountPaisa, { lang: i18n.language })}
                </div>
                <div>
                  <strong className="text-slate-800">Remaining to settle:</strong>{' '}
                  {formatBdt(
                    settleAdvanceTarget.remainingAmountPaisa ?? settleAdvanceTarget.amountPaisa,
                    { lang: i18n.language }
                  )}
                </div>
              </div>

              <div className="space-y-3 text-xs">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">
                    {t('chamberExpenses.settlementType', 'Settlement Type')} *
                  </label>
                  <select
                    value={settleType}
                    onChange={(e) => setSettleType(e.target.value as ChamberSettlementType)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs min-h-[36px]"
                  >
                    <option value="refund">{t('chamberExpenses.settleByRefund', 'Cash Refund to Chamber')}</option>
                    <option value="expense">{t('chamberExpenses.settleByExpense', 'Expense Receipt Submitted')}</option>
                  </select>
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 mb-1">
                    {t('chamberExpenses.amountBdt', 'Amount (৳)')} *
                  </label>
                  <input
                    type="number"
                    step="1"
                    min="1"
                    required
                    value={settleAmount}
                    onChange={(e) => setSettleAmount(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs min-h-[36px]"
                  />
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 mb-1">
                    {t('chamberExpenses.settledDate', 'Settled Date')} *
                  </label>
                  <input
                    type="date"
                    required
                    value={settleDate}
                    onChange={(e) => setSettleDate(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs min-h-[36px]"
                  />
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 mb-1">
                    {t('chamberExpenses.notes', 'Notes / Explanation')}
                  </label>
                  <input
                    type="text"
                    value={settleNotes}
                    onChange={(e) => setSettleNotes(e.target.value)}
                    placeholder="e.g. Returned unused advance cash"
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs min-h-[36px]"
                  />
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setSettleAdvanceTarget(null)}
                  className="px-3 py-1.5 border border-slate-300 hover:bg-slate-50 rounded-lg text-xs font-semibold text-slate-700 min-h-[36px]"
                >
                  {t('common.cancel', 'Cancel')}
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-semibold shadow-2xs min-h-[36px]"
                >
                  {t('chamberExpenses.confirmSettlement', 'Confirm Settlement')}
                </button>
              </div>
            </form>
          </div>
        )}

        {/* SUBMODAL: VOID EXPENSE */}
        {voidExpenseTarget && (
          <div className="fixed inset-0 z-60 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
            <div className="bg-white rounded-2xl max-w-md w-full p-5 space-y-4 shadow-2xl border border-slate-200">
              <div className="flex items-center justify-between">
                <h4 className="text-sm font-bold text-slate-900">
                  {t('chamberExpenses.voidExpenseTitle', 'Void Chamber Expense')}
                </h4>
                <button
                  type="button"
                  onClick={() => setVoidExpenseTarget(null)}
                  className="text-slate-400 hover:text-slate-600 text-sm font-bold"
                >
                  ✕
                </button>
              </div>

              <p className="text-xs text-slate-600">
                {t(
                  'chamberExpenses.voidExpensePrompt',
                  'Are you sure you want to void this expense? This action will mark it void, retain audit trails, and restore any advance balance linked to it.'
                )}
              </p>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  {t('chamberExpenses.voidReasonLabel', 'Reason for Voiding')} *
                </label>
                <input
                  type="text"
                  required
                  value={voidReason}
                  onChange={(e) => setVoidReason(e.target.value)}
                  placeholder="e.g. Duplicate entry / Incorrect voucher"
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs min-h-[36px]"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setVoidExpenseTarget(null)}
                  className="px-3 py-1.5 border border-slate-300 hover:bg-slate-50 rounded-lg text-xs font-semibold text-slate-700 min-h-[36px]"
                >
                  {t('common.cancel', 'Cancel')}
                </button>
                <button
                  type="button"
                  onClick={handleConfirmVoidExpense}
                  className="px-4 py-1.5 bg-rose-600 hover:bg-rose-700 text-white rounded-lg text-xs font-semibold shadow-2xs min-h-[36px]"
                >
                  {t('common.confirmVoid', 'Confirm Void')}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* SUBMODAL: VOID ADVANCE */}
        {voidAdvanceTarget && (
          <div className="fixed inset-0 z-60 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
            <div className="bg-white rounded-2xl max-w-md w-full p-5 space-y-4 shadow-2xl border border-slate-200">
              <div className="flex items-center justify-between">
                <h4 className="text-sm font-bold text-slate-900">
                  {t('chamberExpenses.voidAdvanceTitle', 'Void Staff Advance')}
                </h4>
                <button
                  type="button"
                  onClick={() => setVoidAdvanceTarget(null)}
                  className="text-slate-400 hover:text-slate-600 text-sm font-bold"
                >
                  ✕
                </button>
              </div>

              <p className="text-xs text-slate-600">
                {t(
                  'chamberExpenses.voidAdvancePrompt',
                  'Are you sure you want to void this staff advance? Only advances with zero settlements can be voided.'
                )}
              </p>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  {t('chamberExpenses.voidReasonLabel', 'Reason for Voiding')} *
                </label>
                <input
                  type="text"
                  required
                  value={voidReason}
                  onChange={(e) => setVoidReason(e.target.value)}
                  placeholder="e.g. Cancelled errand / Entry mistake"
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs min-h-[36px]"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setVoidAdvanceTarget(null)}
                  className="px-3 py-1.5 border border-slate-300 hover:bg-slate-50 rounded-lg text-xs font-semibold text-slate-700 min-h-[36px]"
                >
                  {t('common.cancel', 'Cancel')}
                </button>
                <button
                  type="button"
                  onClick={handleConfirmVoidAdvance}
                  className="px-4 py-1.5 bg-rose-600 hover:bg-rose-700 text-white rounded-lg text-xs font-semibold shadow-2xs min-h-[36px]"
                >
                  {t('common.confirmVoid', 'Confirm Void')}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </ResponsiveModal>
  );
};
