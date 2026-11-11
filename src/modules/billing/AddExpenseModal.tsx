import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../foundation/AuthContext';
import { getRepositories } from '../../data/repositories';
import { CaseRecord, ClientRecord, ExpenseCategory, ExpenseRecord } from '../../data/types';
import { Receipt, AlertCircle, Lock } from 'lucide-react';
import { ResponsiveModal } from '../../components/responsive/ResponsiveModal';
import { takaToPaisa, formatBdt } from '../../utils/currency';
import { getDhakaDateString, toDateInputValue } from '../../utils/dateUtils';

interface AddExpenseModalProps {
  isOpen: boolean;
  clientId?: string | null;
  caseId?: string | null;
  initialExpense?: ExpenseRecord | null;
  onClose: () => void;
  onSuccess: () => void;
}

export const AddExpenseModal: React.FC<AddExpenseModalProps> = ({
  isOpen,
  clientId,
  caseId,
  initialExpense,
  onClose,
  onSuccess,
}) => {
  const { t, i18n } = useTranslation();
  const { currentUser } = useAuth();
  const repos = getRepositories();

  const isEdit = Boolean(initialExpense);
  const [clients, setClients] = useState<ClientRecord[]>([]);
  const [selectedClientId, setSelectedClientId] = useState<string>('');
  const [cases, setCases] = useState<CaseRecord[]>([]);
  const [selectedCaseId, setSelectedCaseId] = useState<string>('');
  const [categories, setCategories] = useState<ExpenseCategory[]>([]);
  const [categoryId, setCategoryId] = useState('');
  const [takaAmount, setTakaAmount] = useState('');
  const [expenseDate, setExpenseDate] = useState(() => getDhakaDateString());
  const [description, setDescription] = useState('');
  const [reimbursable, setReimbursable] = useState(true);

  const [saving, setSaving] = useState(false);
  const [loadingClients, setLoadingClients] = useState(false);
  const [loadingCases, setLoadingCases] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen && currentUser) {
      setErrorMsg(null);
      if (initialExpense) {
        setSelectedClientId(initialExpense.clientId || clientId || '');
        setSelectedCaseId(initialExpense.caseId || '');
        setCategoryId(initialExpense.categoryId);
        setTakaAmount(String(initialExpense.amountPaisa / 100));
        setExpenseDate(toDateInputValue(initialExpense.expenseDate) || getDhakaDateString());
        setDescription(initialExpense.description);
        setReimbursable(initialExpense.reimbursable);
      } else {
        setSelectedClientId(clientId || '');
        setSelectedCaseId(caseId || '');
        setTakaAmount('');
        setExpenseDate(getDhakaDateString());
        setDescription('');
        setReimbursable(true);
      }

      repos.accounts
        .listExpenseCategories({ currentUser })
        .then((cats) => {
          setCategories(cats);
          if (!initialExpense && cats.length > 0) {
            setCategoryId((prev) => prev || cats[0].id);
          }
        })
        .catch(() => setCategories([]));

      if (!clientId && !initialExpense?.clientId) {
        setLoadingClients(true);
        repos.client
          .list({ currentUser })
          .then((list) => setClients(list))
          .catch(() => setClients([]))
          .finally(() => setLoadingClients(false));
      }
    }
  }, [isOpen, clientId, caseId, initialExpense, currentUser]);

  useEffect(() => {
    if (isOpen && currentUser && selectedClientId) {
      setLoadingCases(true);
      repos.case
        .list({ currentUser }, { clientId: selectedClientId })
        .then((list) => setCases(list))
        .catch(() => setCases([]))
        .finally(() => setLoadingCases(false));
    } else if (isOpen && !selectedClientId) {
      setCases([]);
    }
  }, [isOpen, selectedClientId, currentUser]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentUser) return;

    if (!selectedClientId) {
      setErrorMsg(t('billing.errors.clientRequired', 'Please select a client'));
      return;
    }

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
      if (initialExpense) {
        await repos.accounts.updateExpense({ currentUser }, initialExpense.id, {
          caseId: selectedCaseId || null,
          categoryId,
          expenseDate: toDateInputValue(expenseDate) || getDhakaDateString(),
          amountPaisa: paisa,
          description: description.trim(),
          reimbursable,
        });
      } else {
        await repos.accounts.recordExpense(
          { currentUser },
          {
            clientId: selectedClientId,
            caseId: selectedCaseId || null,
            categoryId,
            expenseDate: toDateInputValue(expenseDate) || getDhakaDateString(),
            amountPaisa: paisa,
            description: description.trim(),
            reimbursable,
          }
        );
      }
      onSuccess();
      onClose();
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : t('billing.errors.saveFailed', 'Failed to save expense'));
    } finally {
      setSaving(false);
    }
  };

  const isClientLocked = Boolean(clientId) || isEdit;
  const isCaseLocked = Boolean(caseId);

  return (
    <ResponsiveModal
      isOpen={isOpen}
      onClose={onClose}
      title={isEdit ? t('billing.editExpense', 'Edit Expense') : t('billing.addExpense', 'Record Expense')}
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
            disabled={saving || !selectedClientId}
          >
            {saving
              ? t('common.saving', 'Saving...')
              : isEdit
                ? t('common.saveChanges', 'Save Changes')
                : t('billing.addExpense', 'Record Expense')}
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

        {!isClientLocked && (
          <div>
            <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
              {t('clients.client', 'Client')} *
            </label>
            <select
              value={selectedClientId}
              onChange={(e) => {
                setSelectedClientId(e.target.value);
                if (!isCaseLocked) setSelectedCaseId('');
              }}
              disabled={loadingClients}
              required
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 min-h-[44px]"
            >
              <option value="">{t('billing.selectClient', '-- Select Client --')}</option>
              {clients.map((cl) => (
                <option key={cl.id} value={cl.id}>
                  {cl.name} {cl.phone ? `(${cl.phone})` : ''}
                </option>
              ))}
            </select>
          </div>
        )}

        <div>
          <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1 flex items-center gap-1.5">
            <span>{t('cases.case', 'Case')}</span>
            {isCaseLocked && <Lock className="w-3 h-3 text-slate-400" />}
          </label>
          <select
            value={selectedCaseId}
            onChange={(e) => setSelectedCaseId(e.target.value)}
            disabled={isCaseLocked || loadingCases || !selectedClientId}
            className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 min-h-[44px] disabled:bg-slate-100 disabled:text-slate-500"
          >
            <option value="">{t('billing.generalClientLevel', '-- General / Client-level (No specific case) --')}</option>
            {cases.map((c) => (
              <option key={c.id} value={c.id}>
                {c.caseNumber} - {c.matterType || c.court} {c.fileSerial ? `(${c.fileSerial})` : ''}
              </option>
            ))}
          </select>
        </div>

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
              placeholder={t('billing.amountInTaka', 'Amount in Taka')}
              required
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 min-h-[44px]"
            />
            {Number(takaAmount) > 0 && (
              <span className="text-xs text-emerald-700 font-semibold block mt-1">
                {formatBdt(takaToPaisa(Number(takaAmount)), { lang: i18n.language })}
              </span>
            )}
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
