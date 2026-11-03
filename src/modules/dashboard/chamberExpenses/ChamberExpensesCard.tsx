import React, { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../foundation/AuthContext';
import { getRepositories } from '../../../data/repositories';
import { ChamberExpensesSummary } from '../../../data/types';
import { formatBdt } from '../../../utils/currency';
import { Receipt, TrendingUp, ChevronRight, Plus, Wallet } from 'lucide-react';

interface ChamberExpensesCardProps {
  onOpenModal: (initialTab?: 'expenses' | 'summary' | 'advances') => void;
  onOpenAddExpense?: () => void;
  refreshTrigger?: number;
}

export const ChamberExpensesCard: React.FC<ChamberExpensesCardProps> = ({
  onOpenModal,
  refreshTrigger = 0,
}) => {
  const { t, i18n } = useTranslation();
  const { currentUser, can } = useAuth();
  const [summary, setSummary] = useState<ChamberExpensesSummary | null>(null);
  const [loading, setLoading] = useState(true);

  const canView = can('chamber_expenses.view');
  const canRecord = can('chamber_expenses.record');

  const loadSummary = useCallback(async () => {
    if (!currentUser || !canView) return;
    try {
      setLoading(true);
      const repos = getRepositories();
      const res = await repos.chamberExpenses.getSummary({ currentUser });
      setSummary(res);
    } catch {
      // silent fallback
    } finally {
      setLoading(false);
    }
  }, [currentUser, canView]);

  useEffect(() => {
    loadSummary();
  }, [loadSummary, refreshTrigger]);

  if (!canView) return null;

  const totalThisMonth = summary?.totalThisMonthPaisa ?? 0;
  const totalLastMonth = summary?.totalLastMonthPaisa ?? 0;
  const diffPercent =
    totalLastMonth > 0
      ? Math.round(((totalThisMonth - totalLastMonth) / totalLastMonth) * 100)
      : null;

  return (
    <div
      className="bg-white rounded-xl border border-slate-200 shadow-2xs overflow-hidden hover:border-slate-300 transition"
      data-testid="chamber-expenses-card"
    >
      <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center font-bold">
            <Receipt className="w-4 h-4" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-slate-900">
              {t('chamberExpenses.cardTitle', 'Chamber Expenses')}
            </h3>
            <p className="text-xs text-slate-500">
              {t('chamberExpenses.cardSubtitle', 'Operational spending & advances')}
            </p>
          </div>
        </div>

        <button
          type="button"
          data-testid="chamber-expenses-open-btn"
          onClick={() => onOpenModal('expenses')}
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-700 hover:text-emerald-800 px-3 py-1.5 rounded-lg hover:bg-emerald-50 border border-emerald-200 transition min-h-[36px]"
        >
          <span>{t('common.open', 'Open')}</span>
          <ChevronRight className="w-3.5 h-3.5" />
        </button>
      </div>

      <div className="p-5 space-y-4">
        {/* Main metric */}
        <div>
          <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider block mb-1">
            {t('chamberExpenses.thisMonthTotal', 'This Month Spending')}
          </span>
          <div className="flex items-baseline gap-3">
            <span className="text-2xl font-extrabold text-slate-900">
              {loading ? '...' : formatBdt(totalThisMonth, { lang: i18n.language })}
            </span>
            {diffPercent !== null && (
              <span
                className={`text-xs font-bold px-1.5 py-0.5 rounded ${
                  diffPercent <= 0
                    ? 'bg-emerald-50 text-emerald-700'
                    : 'bg-amber-50 text-amber-700'
                }`}
                title="Compared to last month"
              >
                {diffPercent > 0 ? `+${diffPercent}%` : `${diffPercent}%`}
              </span>
            )}
          </div>
          {totalLastMonth > 0 && (
            <p className="text-[11px] text-slate-400 mt-1">
              {t('chamberExpenses.lastMonth', 'Last month')}:{' '}
              {formatBdt(totalLastMonth, { lang: i18n.language })}
            </p>
          )}
        </div>

        {/* Quick action buttons */}
        <div className="flex items-center gap-2 pt-2 border-t border-slate-100 flex-wrap">
          {canRecord && (
            <button
              type="button"
              onClick={() => onOpenModal('expenses')}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-slate-900 hover:bg-slate-800 text-white rounded-lg text-xs font-semibold shadow-2xs transition min-h-[36px]"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>{t('chamberExpenses.recordExpense', 'Record Expense')}</span>
            </button>
          )}

          <button
            type="button"
            onClick={() => onOpenModal('advances')}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-semibold transition min-h-[36px]"
          >
            <Wallet className="w-3.5 h-3.5 text-slate-500" />
            <span>{t('chamberExpenses.advances', 'Advances')}</span>
          </button>

          <button
            type="button"
            onClick={() => onOpenModal('summary')}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-semibold transition min-h-[36px]"
          >
            <TrendingUp className="w-3.5 h-3.5 text-slate-500" />
            <span>{t('chamberExpenses.summary', 'Summary')}</span>
          </button>
        </div>
      </div>
    </div>
  );
};
