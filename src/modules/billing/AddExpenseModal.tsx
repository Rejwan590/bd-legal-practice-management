import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../foundation/AuthContext';
import { getRepositories } from '../../data/repositories';
import { ExpenseCategory } from '../../data/types';
import { Receipt, AlertCircle } from 'lucide-react';
import { ResponsiveModal } from '../../components/responsive/ResponsiveModal';
import { takaToPaisa } from '../../utils/currency';
import { getDhakaDateString, toDateInputValue } from '../../utils/dateUtils';

interface AddExpenseModalProps {
  isOpen: boolean;
  clientId?: string | null;
  caseId?: string | null;
  onClose: () => void;
  onSuccess: () => void;
}

export const AddExpenseModal: React.FC<AddExpenseModalProps> = ({
  isOpen,
  clientId,
  caseId,
  onClose,
  onSuccess,
}) => {
  const { t } = useTranslation();
  const { currentUser } = useAuth();
  const repos = getRepositories();

  const [categories, setCategories] = useState<ExpenseCategory[]>([]);
  const [categoryId, setCategoryId] = useState('');
  const [takaAmount, setTakaAmount] = useState('');
  const [expenseDate, setExpenseDate] = useState(() => getDhakaDateString());
  const [description, setDescription] = useState('');
  const [reimbursable, setReimbursable] = useState(true);

  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen && currentUser) {
      setTakaAmount('');
      setExpenseDate(new Date().toISOString().slice(0, 10));
      setDescription('');
      setReimbursable(true);
      setErrorMsg(null);

      repos.accounts.listExpenseCategories({ currentUser })
        .then((cats) => {
          setCategories(cats);
          if (cats.length > 0 && !categoryId) {
            setCategoryId(cats[0].id);
          }
        })
        .catch(() => setCategories([]));
    }
  }, [isOpen, currentUser]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentUser) return;

    const paisa = takaToPaisa(takaAmount);
    if (paisa <= 0) {
      setErrorMsg(t('billing.errors.positiveAmount', 'Amount must be greater than zero'));
      return;
    }

    if (!categoryId) {
      setErrorMsg(t('billing.errors.categoryRequired', 'Expense category is required'));
      return;
    }

    if (!description.trim()) {
      setErrorMsg(t('billing.errors.descriptionRequired', 'Description is required'));
      return;
    }

    setSaving(true);
    setErrorMsg(null);

    try {
      await repos.accounts.recordExpense(
        { currentUser },
        {
          clientId: clientId || null,
          caseId: caseId || null,
          categoryId,
          expenseDate: toDateInputValue(expenseDate) || getDhakaDateString(),
          amountPaisa: paisa,
          description: description.trim(),
          reimbursable,
        }
      );
      onSuccess();
      onClose();
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : t('billing.errors.saveFailed', 'Failed to record expense'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <ResponsiveModal
      isOpen={isOpen}
      onClose={onClose}
      title={t('billing.addExpense', 'Record Expense')}
      subtitle={t('billing.addExpenseSub', 'Disbursement / chamber operational expense')}
      icon={Receipt}
      maxWidth="md"
      footer={
        <div className="flex items-center justify-end gap-3 w-full">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100 rounded-lg min-h-[44px]"
            disabled={saving}
          >
            {t('common.cancel', 'Cancel')}
          </button>
          <button
            type="submit"
            form="add-expense-form"
            className="px-5 py-2 text-sm font-medium text-white bg-slate-900 hover:bg-slate-800 rounded-lg min-h-[44px] flex items-center gap-2 disabled:opacity-50"
            disabled={saving}
          >
            {saving ? t('common.saving', 'Recording...') : t('billing.addExpense', 'Record Expense')}
          </button>
        </div>
      }
    >
      <form id="add-expense-form" onSubmit={handleSubmit} className="space-y-4">
        {errorMsg && (
          <div className="p-3 bg-rose-50 border border-rose-200 rounded-lg text-rose-700 text-xs flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0 text-rose-600" />
            <span>{errorMsg}</span>
          </div>
        )}

        <div>
          <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
            {t('billing.expenseCategory', 'Expense Category')} *
          </label>
          <select
            value={categoryId}
            onChange={(e) => setCategoryId(e.target.value)}
            required
            className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 min-h-[44px]"
          >
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {t(`billing.categories.${c.name}`, c.name)}
              </option>
            ))}
          </select>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
              {t('billing.amountBdt', 'Amount (৳ Taka)')} *
            </label>
            <input
              type="number"
              step="any"
              min="1"
              value={takaAmount}
              onChange={(e) => setTakaAmount(e.target.value)}
              placeholder="e.g. 1500"
              required
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 min-h-[44px]"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
              {t('billing.expenseDate', 'Date')} *
            </label>
            <input
              type="date"
              value={toDateInputValue(expenseDate)}
              onChange={(e) => setExpenseDate(e.target.value)}
              required
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 min-h-[44px]"
            />
          </div>
        </div>

        <div>
          <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
            {t('billing.description', 'Description')} *
          </label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="e.g. Court fee stamps purchased for plaint presentation"
            rows={3}
            maxLength={500}
            required
            className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
          />
        </div>

        <div className="flex items-center gap-2 pt-1">
          <input
            type="checkbox"
            id="reimbursable-check"
            checked={reimbursable}
            onChange={(e) => setReimbursable(e.target.checked)}
            className="w-4 h-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
          />
          <label htmlFor="reimbursable-check" className="text-xs text-slate-700 font-medium">
            {t('billing.reimbursableClient', 'Reimbursable by client (Chamber disbursement)')}
          </label>
        </div>
      </form>
    </ResponsiveModal>
  );
};
