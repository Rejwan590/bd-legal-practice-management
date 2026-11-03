import React, { useState, useEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../foundation/AuthContext';
import { useNavigation } from '../foundation/NavigationContext';
import { getRepositories } from '../../data/repositories';
import { ClientBalanceOverview, CaseBalanceOverview } from '../../data/types';
import { TablePagination } from '../../components/responsive/TablePagination';
import { ChamberExpensesCard } from '../dashboard/chamberExpenses/ChamberExpensesCard';
import { ChamberExpensesModal } from '../dashboard/chamberExpenses/ChamberExpensesModal';
import {
  CreditCard,
  Search,
  ArrowUpDown,
  ExternalLink,
  AlertTriangle,
  FileText,
  CheckCircle2,
  Clock,
  Briefcase,
  Receipt,
} from 'lucide-react';
import { formatBdt } from '../../utils/currency';

export const BillingScreen: React.FC = () => {
  const { t, i18n } = useTranslation();
  const { currentUser, can } = useAuth();
  const { openClientProfile, openCaseDossier, refreshVersion, triggerRefresh } = useNavigation();
  const repos = getRepositories();

  // Top-level section tabs: 'caseBalances' | 'chamberExpenses'
  const [activeTab, setActiveTab] = useState<'caseBalances' | 'chamberExpenses'>('caseBalances');
  const [chamberModalOpen, setChamberModalOpen] = useState(false);
  const [chamberModalTab, setChamberModalTab] = useState<'expenses' | 'summary' | 'advances'>('expenses');

  const [clientBalances, setClientBalances] = useState<ClientBalanceOverview[]>([]);
  const [caseBalances, setCaseBalances] = useState<CaseBalanceOverview[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [sortBy, setSortBy] = useState<'outstanding' | 'agreed' | 'name'>('outstanding');
  const [sortAsc, setSortAsc] = useState(false);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    if (!currentUser) return;
    setLoading(true);
    setErrorMsg(null);

    Promise.all([
      repos.accounts.getClientBalances({ currentUser }).catch(() => []),
      repos.accounts.getCaseBalances({ currentUser }).catch(() => []),
    ])
      .then(([clientsRes, casesRes]) => {
        setClientBalances(Array.isArray(clientsRes) ? clientsRes : []);
        setCaseBalances(Array.isArray(casesRes) ? casesRes : []);
      })
      .catch((err) => setErrorMsg(err instanceof Error ? err.message : 'Failed to load balances'))
      .finally(() => setLoading(false));
  }, [currentUser, repos, refreshVersion]);

  // Reset page when filter/sort changes
  useEffect(() => {
    setPage(1);
  }, [search, sortBy, sortAsc]);

  const filteredBalances = useMemo(() => {
    let list = [...caseBalances];

    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter((cb) => {
        const matchesClient =
          cb.clientName.toLowerCase().includes(q) ||
          (cb.clientNameBn && cb.clientNameBn.toLowerCase().includes(q)) ||
          cb.clientPhone.toLowerCase().includes(q);

        const matchesCase =
          (cb.caseNumber && cb.caseNumber.toLowerCase().includes(q)) ||
          (cb.caseTitle && cb.caseTitle.toLowerCase().includes(q)) ||
          (cb.fileSerial && cb.fileSerial.toLowerCase().includes(q));

        return matchesClient || Boolean(matchesCase);
      });
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
  }, [caseBalances, search, sortBy, sortAsc]);

  const paginatedBalances = useMemo(() => {
    const start = (page - 1) * pageSize;
    return filteredBalances.slice(start, start + pageSize);
  }, [filteredBalances, page, pageSize]);

  const totals = useMemo(() => {
    let totalAgreed = 0;
    let totalPaid = 0;
    let totalOutstanding = 0;
    let totalCredit = 0;

    for (const b of clientBalances) {
      totalAgreed += b.totalAgreedPaisa;
      totalPaid += b.totalPaidPaisa;
      totalOutstanding += b.outstandingPaisa;
      totalCredit += b.creditPaisa;
    }

    return { totalAgreed, totalPaid, totalOutstanding, totalCredit };
  }, [clientBalances]);

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
    <div className="w-full space-y-4" data-testid="billing-screen">
      {/* Header with Section Tabs */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight flex items-center gap-2">
            <CreditCard className="w-7 h-7 text-emerald-600" />
            <span>{t('nav.billing', 'Billing & Accounts')}</span>
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            {t('billing.screenSubtitle', 'Chamber fee agreements, client balances, and receipts overview')}
          </p>
        </div>

        {/* Section Tabs: Case Fee Balances | Chamber Expenses */}
        {can('chamber_expenses.view') && (
          <div className="inline-flex items-center p-1 bg-slate-100 rounded-xl border border-slate-200 self-start sm:self-auto">
            <button
              type="button"
              data-testid="billing-tab-cases"
              onClick={() => setActiveTab('caseBalances')}
              className={`min-h-[38px] px-3.5 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition ${
                activeTab === 'caseBalances'
                  ? 'bg-slate-900 text-white shadow-2xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Briefcase className="w-3.5 h-3.5" />
              <span>{t('billing.caseFeeBalances', 'Case Fee Balances')}</span>
              <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-slate-200/50">
                {caseBalances.length}
              </span>
            </button>

            <button
              type="button"
              data-testid="billing-tab-chamber-expenses"
              onClick={() => setActiveTab('chamberExpenses')}
              className={`min-h-[38px] px-3.5 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition ${
                activeTab === 'chamberExpenses'
                  ? 'bg-slate-900 text-white shadow-2xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Receipt className="w-3.5 h-3.5" />
              <span>{t('chamberExpenses.cardTitle', 'Chamber Expenses')}</span>
            </button>
          </div>
        )}
      </div>

      {errorMsg && (
        <div className="p-3 bg-rose-50 border border-rose-200 rounded-lg text-rose-700 text-xs flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 shrink-0 text-rose-600" />
          <span>{errorMsg}</span>
        </div>
      )}

      {/* Tab Content: Chamber Expenses */}
      {activeTab === 'chamberExpenses' ? (
        <div className="space-y-4">
          <ChamberExpensesCard
            onOpenModal={(tab) => {
              setChamberModalTab(tab || 'expenses');
              setChamberModalOpen(true);
            }}
            refreshTrigger={refreshVersion}
          />
        </div>
      ) : (
        /* Tab Content: Case Fee Balances */
        <>
          {/* KPI Cards (Client-based totals) */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <div className="bg-white p-3.5 sm:p-4 rounded-xl border border-slate-200 shadow-sm">
              <div className="flex items-center justify-between text-slate-500 mb-1">
                <span className="text-xs font-semibold uppercase tracking-wider">{t('billing.totalAgreedFee', 'Total Agreed Fee')}</span>
                <FileText className="w-4 h-4 text-blue-600" />
              </div>
              <div className="text-2xl font-bold text-slate-900">
                {formatBdt(totals.totalAgreed, { lang: i18n.language })}
              </div>
              <p className="text-xs text-slate-400 mt-1">{clientBalances.length} {t('billing.totalClients', 'clients')}</p>
            </div>

            <div className="bg-white p-3.5 sm:p-4 rounded-xl border border-slate-200 shadow-sm">
              <div className="flex items-center justify-between text-slate-500 mb-1">
                <span className="text-xs font-semibold uppercase tracking-wider">{t('billing.totalReceived', 'Total Received')}</span>
                <CheckCircle2 className="w-4 h-4 text-emerald-600" />
              </div>
              <div className="text-2xl font-bold text-emerald-600">
                {formatBdt(totals.totalPaid, { lang: i18n.language })}
              </div>
              <p className="text-xs text-slate-400 mt-1">{t('billing.clearedFees', 'Collected chamber fees')}</p>
            </div>

            <div className="bg-white p-3.5 sm:p-4 rounded-xl border border-slate-200 shadow-sm">
              <div className="flex items-center justify-between text-slate-500 mb-1">
                <span className="text-xs font-semibold uppercase tracking-wider">{t('billing.totalOutstanding', 'Total Outstanding')}</span>
                <Clock className="w-4 h-4 text-amber-600" />
              </div>
              <div className="text-2xl font-bold text-amber-600">
                {formatBdt(totals.totalOutstanding, { lang: i18n.language })}
              </div>
              <p className="text-xs text-slate-400 mt-1">{t('billing.receivableBalance', 'Pending client collection')}</p>
            </div>

            <div className="bg-white p-3.5 sm:p-4 rounded-xl border border-slate-200 shadow-sm">
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
                placeholder={t('billing.searchCasesAndClients', 'Search by client, case #, title...')}
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

          {/* Balances Table (Per-Case) */}
          <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-sm">
            {loading ? (
              <div className="p-8 text-center text-xs text-slate-500">
                {t('common.loading', 'Loading accounts data...')}
              </div>
            ) : filteredBalances.length === 0 ? (
              <div className="p-8 text-center text-xs text-slate-500">
                {t('billing.noCaseBalancesFound', 'No case billing balances found.')}
              </div>
            ) : (
              <>
                {/* Mobile Card List (<md) */}
                <div className="block md:hidden divide-y divide-slate-100">
                  {paginatedBalances.map((cb, idx) => {
                    const handleClick = () => {
                      if (cb.caseId) {
                        openCaseDossier(cb.caseId, 'billing');
                      } else {
                        openClientProfile(cb.clientId, 'billing');
                      }
                    };

                    return (
                      <div
                        key={`${cb.clientId}-${cb.caseId ?? 'null'}-${idx}`}
                        onClick={handleClick}
                        className="p-3.5 hover:bg-slate-50 transition cursor-pointer space-y-2.5"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0 flex-1">
                            <div className="font-semibold text-slate-900 text-sm break-words">{cb.clientName}</div>
                            {cb.clientNameBn && <div className="text-[11px] text-slate-400 break-words">{cb.clientNameBn}</div>}
                            <div className="text-xs text-slate-600 font-mono mt-0.5">{cb.clientPhone}</div>
                            <div className="mt-1 text-xs text-indigo-700 font-medium space-y-0.5">
                              {cb.caseNumber ? (
                                <div className="font-bold">{cb.caseNumber}</div>
                              ) : (
                                <div className="italic text-slate-400">{t('billing.generalNoCase', 'General / no case')}</div>
                              )}
                              {cb.caseTitle && (
                                <div className="text-slate-600 font-normal text-[11px] leading-tight line-clamp-2">
                                  {cb.caseTitle}
                                </div>
                              )}
                              {cb.fileSerial && (
                                <div className="text-[10px] font-mono text-slate-400">
                                  {cb.fileSerial}
                                </div>
                              )}
                            </div>
                          </div>
                          <div className="shrink-0">
                            {cb.isCredit ? (
                              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-bold bg-cyan-50 text-cyan-700 border border-cyan-200">
                                {formatBdt(cb.creditPaisa, { lang: i18n.language })} {t('billing.creditBadge', 'Credit')}
                              </span>
                            ) : cb.outstandingPaisa > 0 ? (
                              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-bold bg-amber-50 text-amber-700 border border-amber-200">
                                {formatBdt(cb.outstandingPaisa, { lang: i18n.language })} {t('billing.dueBadge', 'Due')}
                              </span>
                            ) : (
                              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold bg-slate-100 text-slate-600">
                                ৳ 0 ({t('billing.settledBadge', 'Settled')})
                              </span>
                            )}
                          </div>
                        </div>

                        <div className="grid grid-cols-2 gap-2 text-xs pt-1.5 border-t border-slate-100">
                          <div>
                            <span className="text-slate-400 block text-[10px] uppercase font-semibold">{t('billing.agreedFee', 'Agreed Fee')}</span>
                            <span className="font-medium text-slate-800">{formatBdt(cb.totalAgreedPaisa, { lang: i18n.language })}</span>
                          </div>
                          <div className="text-right">
                            <span className="text-slate-400 block text-[10px] uppercase font-semibold">{t('billing.totalReceived', 'Received')}</span>
                            <span className="font-medium text-emerald-600">{formatBdt(cb.totalPaidPaisa, { lang: i18n.language })}</span>
                          </div>
                        </div>

                        <div className="pt-1 flex justify-end">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleClick();
                            }}
                            className="px-3 py-1.5 text-xs font-medium text-emerald-700 bg-emerald-50 hover:bg-emerald-100 rounded-lg inline-flex items-center gap-1 min-h-[36px]"
                          >
                            <ExternalLink className="w-3.5 h-3.5" />
                            <span>{t('billing.openLedger', 'Ledger')}</span>
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Desktop Table (>=md) */}
                <div className="hidden md:block overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-slate-50 text-slate-500 uppercase tracking-wider border-b border-slate-200 sticky top-0 z-10 backdrop-blur-xs">
                      <tr>
                        <th className="px-4 py-3 font-semibold">{t('clients.name', 'Client Name')}</th>
                        <th className="px-4 py-3 font-semibold">{t('cases.title', 'Chamber Cases Register')}</th>
                        <th className="px-4 py-3 font-semibold">{t('clients.phone', 'Phone')}</th>
                        <th className="px-4 py-3 font-semibold text-right">{t('billing.agreedFee', 'Agreed Fee')}</th>
                        <th className="px-4 py-3 font-semibold text-right">{t('billing.totalReceived', 'Total Received')}</th>
                        <th className="px-4 py-3 font-semibold text-right">{t('billing.balance', 'Balance')}</th>
                        <th className="px-4 py-3 font-semibold text-center">{t('common.actions', 'Action')}</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {paginatedBalances.map((cb, idx) => {
                        const handleClick = () => {
                          if (cb.caseId) {
                            openCaseDossier(cb.caseId, 'billing');
                          } else {
                            openClientProfile(cb.clientId, 'billing');
                          }
                        };

                        return (
                          <tr
                            key={`${cb.clientId}-${cb.caseId ?? 'null'}-${idx}`}
                            className="hover:bg-slate-50/70 transition-colors cursor-pointer"
                            onClick={handleClick}
                          >
                            <td className="px-4 py-3.5 min-w-[140px] max-w-[200px]">
                              <div className="font-semibold text-slate-900 break-words">{cb.clientName}</div>
                              {cb.clientNameBn && <div className="text-[11px] text-slate-400 break-words">{cb.clientNameBn}</div>}
                            </td>

                            <td className="px-4 py-3.5 max-w-xs">
                              {cb.caseNumber ? (
                                <div className="space-y-0.5">
                                  <div className="font-bold text-slate-900">{cb.caseNumber}</div>
                                  {cb.caseTitle && (
                                    <div className="text-[11px] text-slate-600 line-clamp-2 leading-tight">
                                      {cb.caseTitle}
                                    </div>
                                  )}
                                  {cb.fileSerial && (
                                    <div className="text-[10px] font-mono text-slate-400">
                                      {cb.fileSerial}
                                    </div>
                                  )}
                                </div>
                              ) : (
                                <span className="italic text-slate-400">{t('billing.generalNoCase', 'General / no case')}</span>
                              )}
                            </td>

                            <td className="px-4 py-3.5 whitespace-nowrap text-slate-600 font-mono">
                              {cb.clientPhone}
                            </td>
                            <td className="px-4 py-3.5 whitespace-nowrap text-right font-medium text-slate-900">
                              {formatBdt(cb.totalAgreedPaisa, { lang: i18n.language })}
                            </td>
                            <td className="px-4 py-3.5 whitespace-nowrap text-right font-medium text-emerald-600">
                              {formatBdt(cb.totalPaidPaisa, { lang: i18n.language })}
                            </td>
                            <td className="px-4 py-3.5 whitespace-nowrap text-right">
                              {cb.isCredit ? (
                                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-bold bg-cyan-50 text-cyan-700 border border-cyan-200">
                                  {formatBdt(cb.creditPaisa, { lang: i18n.language })} {t('billing.creditBadge', 'Credit')}
                                </span>
                              ) : cb.outstandingPaisa > 0 ? (
                                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-bold bg-amber-50 text-amber-700 border border-amber-200">
                                  {formatBdt(cb.outstandingPaisa, { lang: i18n.language })} {t('billing.dueBadge', 'Due')}
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
                                  handleClick();
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

                {/* Pagination Controls */}
                {filteredBalances.length > 0 && (
                  <div className="p-3 border-t border-slate-200">
                    <TablePagination
                      totalItems={filteredBalances.length}
                      currentPage={page}
                      pageSize={pageSize}
                      onPageChange={setPage}
                      onPageSizeChange={(sz) => {
                        setPageSize(sz);
                        setPage(1);
                      }}
                    />
                  </div>
                )}
              </>
            )}
          </div>
        </>
      )}

      {/* Chamber Expenses & Advances Modal */}
      {chamberModalOpen && (
        <ChamberExpensesModal
          isOpen={chamberModalOpen}
          initialTab={chamberModalTab}
          onClose={() => setChamberModalOpen(false)}
          onExpenseChanged={() => triggerRefresh()}
        />
      )}
    </div>
  );
};
