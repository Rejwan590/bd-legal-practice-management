import React, { useState, useEffect } from 'react';
import { adminApi } from '../api/adminApi';
import { Firm, FirmStatus } from '../types/adminTypes';
import { formatLicenseDate, calculateDaysLeftDhaka } from '../utils/dateUtils';
import {
  Building2,
  Search,
  Plus,
  Clock,
  Laptop,
  AlertTriangle,
  ChevronRight,
  ShieldAlert,
} from 'lucide-react';

interface FirmListScreenProps {
  onSelectFirm: (id: string) => void;
  onOpenCreateModal?: () => void;
}

export const FirmListScreen: React.FC<FirmListScreenProps> = ({
  onSelectFirm,
  onOpenCreateModal,
}) => {
  const [firms, setFirms] = useState<Firm[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);

  const fetchFirms = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await adminApi.listFirms({
        page,
        limit: 15,
        search: search.trim() || undefined,
        status: statusFilter !== 'all' ? statusFilter : undefined,
      });
      setFirms(res.firms);
      setTotal(res.total);
      setTotalPages(res.totalPages || 1);
    } catch (err: any) {
      setError(err?.message || 'Failed to load firms');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchFirms();
  }, [page, statusFilter]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setPage(1);
    fetchFirms();
  };

  const getDaysLeft = (expiryDate: string) => {
    const days = calculateDaysLeftDhaka(expiryDate);
    if (days < 0) return { text: `Expired (${Math.abs(days)}d ago)`, isExpired: true, daysLeft: 0 };
    if (days === 0) return { text: 'Expires today', isExpired: false, isUrgent: true, daysLeft: 0 };
    return { text: `${days} days left`, isExpired: false, isUrgent: days <= 14, daysLeft: days };
  };

  const statusBadge = (status: FirmStatus) => {
    const map = {
      active: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
      expired: 'bg-rose-500/10 text-rose-400 border-rose-500/20',
      suspended: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
      disabled: 'bg-slate-700/50 text-slate-400 border-slate-600',
    };
    return (
      <span
        className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold border ${
          map[status] || map.active
        }`}
      >
        {status.toUpperCase()}
      </span>
    );
  };

  return (
    <div className="space-y-6">
      {/* Header and Actions */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-white tracking-tight">Chamber Firms</h1>
          <p className="text-xs sm:text-sm text-slate-400">
            Total of {total} registered legal practices and subscriptions
          </p>
        </div>

        <button
          onClick={onOpenCreateModal}
          className="inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white font-semibold rounded-xl text-sm transition shadow-lg shadow-indigo-600/20 min-h-[44px]"
        >
          <Plus className="w-4 h-4" />
          <span>New Chamber Firm</span>
        </button>
      </div>

      {/* Filter and Search Bar */}
      <div className="flex flex-col sm:flex-row gap-3">
        <form onSubmit={handleSearchSubmit} className="relative flex-1">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search chamber firms by name, ID, or phone..."
            className="w-full pl-9 pr-4 py-2.5 bg-slate-900 border border-slate-800 rounded-xl text-sm text-slate-200 placeholder-slate-500 focus:outline-none focus:border-indigo-500 min-h-[44px]"
          />
        </form>

        <div className="flex gap-2">
          <select
            value={statusFilter}
            onChange={(e) => {
              setStatusFilter(e.target.value);
              setPage(1);
            }}
            className="px-3 py-2.5 bg-slate-900 border border-slate-800 rounded-xl text-sm text-slate-200 focus:outline-none focus:border-indigo-500 min-h-[44px]"
          >
            <option value="all">All Statuses</option>
            <option value="active">Active</option>
            <option value="expired">Expired</option>
            <option value="suspended">Suspended</option>
            <option value="disabled">Disabled</option>
          </select>
        </div>
      </div>

      {/* Firm List Content */}
      {loading ? (
        <div className="p-12 text-center text-slate-500 text-sm">Loading chamber firms...</div>
      ) : error ? (
        <div className="p-4 bg-rose-500/10 border border-rose-500/20 rounded-xl text-rose-400 text-sm flex items-center gap-2">
          <AlertTriangle className="w-5 h-5 shrink-0" />
          <span>{error}</span>
        </div>
      ) : firms.length === 0 ? (
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-12 text-center space-y-3">
          <Building2 className="w-12 h-12 text-slate-600 mx-auto" />
          <h3 className="text-base font-semibold text-slate-300">No chamber firms found</h3>
          <p className="text-xs text-slate-500">
            {search ? 'Try adjusting your search terms or filters.' : 'Get started by creating your first chamber firm.'}
          </p>
        </div>
      ) : (
        <>
          {/* Desktop Table View (>= md) */}
          <div className="hidden md:block bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-xl">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm text-slate-300">
                <thead className="bg-slate-800/60 border-b border-slate-800 text-xs font-semibold text-slate-400 uppercase tracking-wider">
                  <tr>
                    <th className="px-5 py-3.5">Chamber Firm</th>
                    <th className="px-4 py-3.5">Status</th>
                    <th className="px-4 py-3.5">License Expiry</th>
                    <th className="px-4 py-3.5">Devices Allowed</th>
                    <th className="px-4 py-3.5">Monthly Price</th>
                    <th className="px-4 py-3.5">Contact</th>
                    <th className="px-4 py-3.5 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60">
                  {firms.map((firm) => {
                    const days = getDaysLeft(firm.licenseExpiresAt);
                    return (
                      <tr
                        key={firm.id}
                        onClick={() => onSelectFirm(firm.id)}
                        className="hover:bg-slate-800/40 transition-colors cursor-pointer group"
                      >
                        <td className="px-5 py-4">
                          <div className="font-semibold text-white group-hover:text-indigo-400 transition-colors">
                            {firm.name}
                          </div>
                          <div className="text-xs text-slate-500 font-mono">{firm.firmId}</div>
                        </td>
                        <td className="px-4 py-4">
                          <div className="flex flex-col gap-1 items-start">
                            {statusBadge(firm.status)}
                            {firm.isTrial && (
                              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold bg-purple-500/15 text-purple-300 border border-purple-500/30">
                                Trial ({days.isExpired ? 'Expired' : `${days.daysLeft}d left`})
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="px-4 py-4">
                          <div className="flex items-center gap-1.5 font-mono text-xs text-slate-200">
                            <Clock className="w-3.5 h-3.5 text-slate-400" />
                            {formatLicenseDate(firm.licenseExpiresAt)}
                          </div>
                          <div
                            className={`text-[11px] font-medium ${
                              days.isExpired
                                ? 'text-rose-400'
                                : days.isUrgent
                                ? 'text-amber-400'
                                : 'text-emerald-400'
                            }`}
                          >
                            {days.text}
                          </div>
                        </td>
                        <td className="px-4 py-4">
                          <div className="flex items-center gap-1.5 text-xs text-slate-300 font-mono">
                            <Laptop className="w-3.5 h-3.5 text-slate-400" />
                            <span>
                              {firm.approvedDeviceCount ?? 0} / {firm.maxDevices} devices
                            </span>
                          </div>
                          {Boolean(firm.pendingDeviceCount && firm.pendingDeviceCount > 0) && (
                            <div className="mt-1">
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-amber-500/15 text-amber-400 border border-amber-500/30">
                                <ShieldAlert className="w-3 h-3" />
                                {firm.pendingDeviceCount} pending approval
                              </span>
                            </div>
                          )}
                        </td>
                        <td className="px-4 py-4">
                          {firm.isTrial ? (
                            <div>
                              <div className="font-mono text-xs font-semibold text-purple-300">
                                BDT 0 <span className="text-[10px] text-purple-400 font-normal">(Trial)</span>
                              </div>
                              {firm.pricingBreakdown && (
                                <div className="text-[10px] text-amber-400 font-mono mt-0.5">
                                  After trial: BDT {firm.pricingBreakdown.monthlyTotal.toLocaleString()}/mo
                                </div>
                              )}
                            </div>
                          ) : (
                            <div>
                              <div className="font-mono text-xs font-semibold text-slate-100">
                                {firm.monthlyPriceBdt != null ? `BDT ${firm.monthlyPriceBdt.toLocaleString()}/mo` : '—'}
                              </div>
                              {firm.pricingBreakdown && (
                                <div className="text-[11px] text-slate-400 font-mono space-y-0.5 mt-0.5">
                                  <div>Base: BDT {firm.pricingBreakdown.basePriceBdt.toLocaleString()}</div>
                                  {(firm.pricingBreakdown.extraUsersCostBdt > 0 || firm.pricingBreakdown.extraDevicesCostBdt > 0) && (
                                    <div className="text-indigo-400 text-[10px]">
                                      +{firm.pricingBreakdown.extraUsersCostBdt > 0 ? `Users: BDT ${firm.pricingBreakdown.extraUsersCostBdt.toLocaleString()}` : ''}
                                      {firm.pricingBreakdown.extraUsersCostBdt > 0 && firm.pricingBreakdown.extraDevicesCostBdt > 0 ? ', ' : ''}
                                      {firm.pricingBreakdown.extraDevicesCostBdt > 0 ? `Devices: BDT ${firm.pricingBreakdown.extraDevicesCostBdt.toLocaleString()}` : ''}
                                    </div>
                                  )}
                                </div>
                              )}
                            </div>
                          )}
                        </td>
                        <td className="px-4 py-4 text-xs text-slate-400">{firm.contact || '—'}</td>
                        <td className="px-4 py-4 text-right">
                          <span className="inline-flex items-center gap-1 text-xs text-indigo-400 font-medium group-hover:translate-x-1 transition-transform">
                            Manage
                            <ChevronRight className="w-4 h-4" />
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Mobile Card View (< md) */}
          <div className="grid grid-cols-1 gap-3 md:hidden">
            {firms.map((firm) => {
              const days = getDaysLeft(firm.licenseExpiresAt);
              return (
                <div
                  key={firm.id}
                  onClick={() => onSelectFirm(firm.id)}
                  className="bg-slate-900 border border-slate-800 rounded-xl p-4 space-y-3 cursor-pointer hover:border-slate-700 active:bg-slate-800/60 transition-colors"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="font-semibold text-white text-base leading-snug">{firm.name}</div>
                      <div className="text-xs text-slate-500 font-mono">{firm.firmId}</div>
                    </div>
                    <div className="flex flex-col gap-1 items-end">
                      {statusBadge(firm.status)}
                      {firm.isTrial && (
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold bg-purple-500/15 text-purple-300 border border-purple-500/30">
                          Trial ({days.isExpired ? 'Expired' : `${days.daysLeft}d left`})
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-2 text-xs pt-2 border-t border-slate-800/80">
                    <div>
                      <div className="text-slate-500 text-[11px]">Expiry</div>
                      <div className="text-slate-200 font-mono">
                        {formatLicenseDate(firm.licenseExpiresAt)}
                      </div>
                      <div
                        className={`text-[11px] font-medium ${
                          days.isExpired ? 'text-rose-400' : days.isUrgent ? 'text-amber-400' : 'text-emerald-400'
                        }`}
                      >
                        {days.text}
                      </div>
                    </div>
                    <div>
                      <div className="text-slate-500 text-[11px]">Devices</div>
                      <div className="flex items-center gap-1 text-slate-200 font-mono">
                        <Laptop className="w-3.5 h-3.5 text-slate-400" />
                        <span>
                          {firm.approvedDeviceCount ?? 0} / {firm.maxDevices}
                        </span>
                      </div>
                      {Boolean(firm.pendingDeviceCount && firm.pendingDeviceCount > 0) && (
                        <div className="mt-1">
                          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold bg-amber-500/15 text-amber-400 border border-amber-500/30">
                            <ShieldAlert className="w-2.5 h-2.5" />
                            {firm.pendingDeviceCount} pending
                          </span>
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="pt-2 border-t border-slate-800/80 flex items-center justify-between text-xs">
                    <span className="text-slate-500 text-[11px]">Monthly Price</span>
                    <span className="font-mono font-semibold text-indigo-400">
                      {firm.isTrial
                        ? 'BDT 0 (Trial)'
                        : firm.monthlyPriceBdt != null
                        ? `BDT ${firm.monthlyPriceBdt.toLocaleString()}/mo`
                        : '—'}
                    </span>
                  </div>
                  {firm.isTrial && firm.pricingBreakdown && (
                    <div className="text-[10px] text-amber-400 font-mono">
                      After trial: BDT {firm.pricingBreakdown.monthlyTotal.toLocaleString()}/mo
                    </div>
                  )}

                  <div className="flex items-center justify-between pt-1 text-xs text-slate-400">
                    <span>{firm.contact || 'No contact phone'}</span>
                    <span className="flex items-center gap-1 text-indigo-400 font-medium">
                      Manage <ChevronRight className="w-4 h-4" />
                    </span>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Pagination Controls */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between border-t border-slate-800 pt-4">
              <button
                disabled={page <= 1}
                onClick={() => setPage(page - 1)}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 text-sm font-medium rounded-lg border border-slate-700 min-h-[44px] disabled:opacity-40 transition-colors"
              >
                Previous
              </button>
              <span className="text-xs text-slate-400">
                Page {page} of {totalPages}
              </span>
              <button
                disabled={page >= totalPages}
                onClick={() => setPage(page + 1)}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 text-sm font-medium rounded-lg border border-slate-700 min-h-[44px] disabled:opacity-40 transition-colors"
              >
                Next
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
};
