import React, { useState, useEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../foundation/AuthContext';
import { useNavigation } from '../foundation/NavigationContext';
import { getRepositories } from '../../data/repositories';
import { ClientBalanceOverview } from '../../data/types';
import {
  CreditCard,
  Search,
  ArrowUpDown,
  ExternalLink,
  AlertTriangle,
  FileText,
  CheckCircle2,
  Clock,
} from 'lucide-react';
import { formatBdt } from '../../utils/currency';

export const BillingScreen: React.FC = () => {
  const { t, i18n } = useTranslation();
  const { currentUser, can } = useAuth();
  const { openClientProfile } = useNavigation();
  const repos = getRepositories();

  const [balances, setBalances] = useState<ClientBalanceOverview[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [sortBy, setSortBy] = useState<'outstanding' | 'agreed' | 'name'>('outstanding');
  const [sortAsc, setSortAsc] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    if (!currentUser) return;
    setLoading(true);
    setErrorMsg(null);

    repos.accounts
      .getClientBalances({ currentUser })
      .then((res) => setBalances(res))
      .catch((err) => setErrorMsg(err instanceof Error ? err.message : 'Failed to load balances'))
      .finally(() => setLoading(false));
  }, [currentUser, repos]);

  const filteredBalances = useMemo(() => {
    let list = balances;
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter(
        (b) =>
          b.clientName.toLowerCase().includes(q) ||
          (b.clientNameBn && b.clientNameBn.toLowerCase().includes(q)) ||
          b.clientPhone.toLowerCase().includes(q)
      );
    }

    return list.sort((a, b) => {
      let comparison = 0;
      if (sortBy === 'outstanding') {
        comparison = a.outstandingPaisa - b.outstandingPaisa;
      } else if (sortBy === 'agreed') {
        comparison = a.totalAgreedPaisa - b.totalAgreedPaisa;
      } else if (sortBy === 'name') {
        comparison = a.clientName.localeCompare(b.clientName);
      }
      return sortAsc ? comparison : -comparison;
    });
  }, [balances, search, sortBy, sortAsc]);

  const totals = useMemo(() => {
    let totalAgreed = 0;
    let totalPaid = 0;
    let totalOutstanding = 0;
    let totalCredit = 0;

    for (const b of balances) {
      totalAgreed += b.totalAgreedPaisa;
      totalPaid += b.totalPaidPaisa;
      totalOutstanding += b.outstandingPaisa;
      totalCredit += b.creditPaisa;
    }

    return { totalAgreed, totalPaid, totalOutstanding, totalCredit };
  }, [balances]);

  if (!can('accounts.view')) {
    return (
      <div className="p-8 text-center text-slate-500">
        <AlertTriangle className="w-8 h-8 mx-auto text-amber-500 mb-2" />
        <p className="font-medium text-slate-800">{t('common.accessDenied', 'Access Denied')}</p>
        <p className="text-xs text-slate-500 mt-1">{t('billing.permissionRequired', 'accounts.view permission is required.')}</p>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-7xl mx-auto" data-testid="billing-screen">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight flex items-center gap-2">
            <CreditCard className="w-7 h-7 text-emerald-600" />
            <span>{t('nav.billing', 'Billing & Accounts')}</span>
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            {t('billing.screenSubtitle', 'Chamber fee agreements, client balances, and receipts overview')}
          </p>
        </div>
      </div>

      {errorMsg && (
        <div className="p-3 bg-rose-50 border border-rose-200 rounded-lg text-rose-700 text-xs flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 shrink-0 text-rose-600" />
          <span>{errorMsg}</span>
        </div>
      )}

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
          <div className="flex items-center justify-between text-slate-500 mb-1">
            <span className="text-xs font-semibold uppercase tracking-wider">{t('billing.totalAgreedFee', 'Total Agreed Fee')}</span>
            <FileText className="w-4 h-4 text-blue-600" />
          </div>
          <div className="text-2xl font-bold text-slate-900">
            {formatBdt(totals.totalAgreed, { lang: i18n.language })}
          </div>
          <p className="text-xs text-slate-400 mt-1">{balances.length} {t('billing.totalClients', 'clients')}</p>
        </div>

        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
          <div className="flex items-center justify-between text-slate-500 mb-1">
            <span className="text-xs font-semibold uppercase tracking-wider">{t('billing.totalReceived', 'Total Received')}</span>
            <CheckCircle2 className="w-4 h-4 text-emerald-600" />
          </div>
          <div className="text-2xl font-bold text-emerald-600">
            {formatBdt(totals.totalPaid, { lang: i18n.language })}
          </div>
          <p className="text-xs text-slate-400 mt-1">{t('billing.clearedFees', 'Collected chamber fees')}</p>
        </div>

        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
          <div className="flex items-center justify-between text-slate-500 mb-1">
            <span className="text-xs font-semibold uppercase tracking-wider">{t('billing.totalOutstanding', 'Total Outstanding')}</span>
            <Clock className="w-4 h-4 text-amber-600" />
          </div>
          <div className="text-2xl font-bold text-amber-600">
            {formatBdt(totals.totalOutstanding, { lang: i18n.language })}
          </div>
          <p className="text-xs text-slate-400 mt-1">{t('billing.receivableBalance', 'Pending client collection')}</p>
        </div>

        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
          <div className="flex items-center justify-between text-slate-500 mb-1">
            <span className="text-xs font-semibold uppercase tracking-wider">{t('billing.totalAdvanceCredit', 'Advance Credit')}</span>
            <CreditCard className="w-4 h-4 text-cyan-600" />
          </div>
          <div className="text-2xl font-bold text-cyan-600">
            {formatBdt(totals.totalCredit, { lang: i18n.language })}
          </div>
          <p className="text-xs text-slate-400 mt-1">{t('billing.clientsInCredit', 'Client advance balances')}</p>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-3 bg-white p-3 rounded-xl border border-slate-200 shadow-sm">
        <div className="relative w-full sm:w-80">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t('billing.searchClients', 'Search clients by name or phone...')}
            className="w-full pl-9 pr-3 py-2 border border-slate-200 rounded-lg text-xs focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 min-h-[44px]"
          />
        </div>

        <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
          <span className="text-xs text-slate-500 whitespace-nowrap">{t('common.sortBy', 'Sort by')}:</span>
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as any)}
            className="px-3 py-2 border border-slate-200 rounded-lg text-xs text-slate-700 bg-white min-h-[44px]"
          >
            <option value="outstanding">{t('billing.sortOutstanding', 'Outstanding Balance')}</option>
            <option value="agreed">{t('billing.sortAgreed', 'Total Agreed')}</option>
            <option value="name">{t('billing.sortName', 'Client Name')}</option>
          </select>
          <button
            type="button"
            onClick={() => setSortAsc(!sortAsc)}
            className="p-2 border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-50 min-h-[44px] min-w-[44px] flex items-center justify-center"
            title={sortAsc ? 'Ascending' : 'Descending'}
          >
            <ArrowUpDown className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Clients Balances Table */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-sm">
        {loading ? (
          <div className="p-8 text-center text-xs text-slate-500">
            {t('common.loading', 'Loading accounts data...')}
          </div>
        ) : filteredBalances.length === 0 ? (
          <div className="p-8 text-center text-xs text-slate-500">
            {t('billing.noClientsFound', 'No client balances found.')}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 text-slate-500 uppercase tracking-wider border-b border-slate-200">
                <tr>
                  <th className="px-4 py-3 font-semibold">{t('clients.name', 'Client Name')}</th>
                  <th className="px-4 py-3 font-semibold">{t('clients.phone', 'Phone')}</th>
                  <th className="px-4 py-3 font-semibold text-right">{t('billing.agreedFee', 'Agreed Fee')}</th>
                  <th className="px-4 py-3 font-semibold text-right">{t('billing.totalReceived', 'Total Received')}</th>
                  <th className="px-4 py-3 font-semibold text-right">{t('billing.balance', 'Balance')}</th>
                  <th className="px-4 py-3 font-semibold text-center">{t('common.actions', 'Action')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredBalances.map((b) => {
                  return (
                    <tr
                      key={b.clientId}
                      className="hover:bg-slate-50/70 transition-colors cursor-pointer"
                      onClick={() => openClientProfile(b.clientId, 'billing')}
                    >
                      <td className="px-4 py-3.5 whitespace-nowrap">
                        <div className="font-semibold text-slate-900">{b.clientName}</div>
                        {b.clientNameBn && <div className="text-[11px] text-slate-400">{b.clientNameBn}</div>}
                      </td>
                      <td className="px-4 py-3.5 whitespace-nowrap text-slate-600 font-mono">
                        {b.clientPhone}
                      </td>
                      <td className="px-4 py-3.5 whitespace-nowrap text-right font-medium text-slate-900">
                        {formatBdt(b.totalAgreedPaisa, { lang: i18n.language })}
                      </td>
                      <td className="px-4 py-3.5 whitespace-nowrap text-right font-medium text-emerald-600">
                        {formatBdt(b.totalPaidPaisa, { lang: i18n.language })}
                      </td>
                      <td className="px-4 py-3.5 whitespace-nowrap text-right">
                        {b.isCredit ? (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-bold bg-cyan-50 text-cyan-700 border border-cyan-200">
                            {formatBdt(b.creditPaisa, { lang: i18n.language })} {t('billing.creditBadge', 'Credit')}
                          </span>
                        ) : b.outstandingPaisa > 0 ? (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-bold bg-amber-50 text-amber-700 border border-amber-200">
                            {formatBdt(b.outstandingPaisa, { lang: i18n.language })} {t('billing.dueBadge', 'Due')}
                          </span>
                        ) : (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold bg-slate-100 text-slate-600">
                            ৳ 0 ({t('billing.settledBadge', 'Settled')})
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3.5 whitespace-nowrap text-center">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            openClientProfile(b.clientId, 'billing');
                          }}
                          className="px-2.5 py-1 text-xs font-medium text-emerald-700 bg-emerald-50 hover:bg-emerald-100 rounded-lg inline-flex items-center gap-1 min-h-[36px]"
                        >
                          <ExternalLink className="w-3.5 h-3.5" />
                          <span>{t('billing.openLedger', 'Ledger')}</span>
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};
