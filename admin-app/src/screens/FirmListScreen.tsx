import React, { useState, useEffect } from 'react';
import { Firm, FirmStatus } from '../types/adminTypes';
import { adminApi } from '../api/adminApi';
import { CreateFirmModal } from './CreateFirmModal';
import {
  Building2,
  Plus,
  Search,
  ChevronRight,
  AlertTriangle,
  Clock,
  Laptop,
} from 'lucide-react';

interface FirmListScreenProps {
  onSelectFirm: (firmId: string) => void;
}

export const FirmListScreen: React.FC<FirmListScreenProps> = ({ onSelectFirm }) => {
  const [firms, setFirms] = useState<Firm[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isCreateOpen, setIsCreateOpen] = useState(false);

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
    const ms = new Date(expiryDate).getTime() - Date.now();
    const days = Math.ceil(ms / (1000 * 60 * 60 * 24));
    if (days < 0) return { text: `Expired (${Math.abs(days)}d ago)`, isExpired: true };
    if (days === 0) return { text: 'Expires today', isExpired: false, isUrgent: true };
    return { text: `${days} days left`, isExpired: false, isUrgent: days <= 14 };
  };

  const statusBadge = (status: FirmStatus) => {
    const map = {
      active: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
      expired: 'bg-rose-500/10 text-rose-400 border-rose-500/20',
      suspended: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
      disabled: 'bg-slate-700/50 text-slate-400 border-slate-600',
    };
    return (
      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${map[status] || map.active}`}>
        {status.toUpperCase()}
      </span>
    );
  };

  return (
    <div className="space-y-6">
      {/* Header & Quick Action */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-white flex items-center gap-2">
            <Building2 className="w-6 h-6 text-indigo-400" />
            Chamber Firms ({total})
          </h1>
          <p className="text-xs sm:text-sm text-slate-400">
            Manage practice chamber licenses, device authorisations, and subscriptions.
          </p>
        </div>
        <button
          onClick={() => setIsCreateOpen(true)}
          className="flex items-center justify-center gap-2 px-4 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-semibold rounded-xl min-h-[44px] transition-colors shadow-lg shadow-indigo-600/20"
        >
          <Plus className="w-4 h-4" />
          Create Chamber Firm
        </button>
      </div>

      {/* Filter and Search Bar */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 flex flex-col md:flex-row gap-3 items-stretch md:items-center justify-between">
        <form onSubmit={handleSearchSubmit} className="flex-1 flex gap-2">
          <div className="relative flex-1">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by firm name, contact, court..."
              className="w-full pl-9 pr-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-slate-100 text-sm placeholder-slate-500 focus:outline-none focus:border-indigo-500 min-h-[44px]"
            />
          </div>
          <button
            type="submit"
            className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 text-sm font-medium rounded-lg border border-slate-700 min-h-[44px] transition-colors"
          >
            Search
          </button>
        </form>

        <div className="flex items-center gap-2">
          <label className="text-xs text-slate-400 whitespace-nowrap">Filter Status:</label>
          <select
            value={statusFilter}
            onChange={(e) => {
              setStatusFilter(e.target.value);
              setPage(1);
            }}
            className="px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-slate-200 text-sm focus:outline-none focus:border-indigo-500 min-h-[44px]"
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
                        <td className="px-4 py-4">{statusBadge(firm.status)}</td>
                        <td className="px-4 py-4">
                          <div className="flex items-center gap-1.5 font-mono text-xs text-slate-200">
                            <Clock className="w-3.5 h-3.5 text-slate-400" />
                            {new Date(firm.licenseExpiresAt).toLocaleDateString()}
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
                            <span>{firm.maxDevices} max devices</span>
                          </div>
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

          {/* Mobile Cards View (< md) */}
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
                    {statusBadge(firm.status)}
                  </div>

                  <div className="grid grid-cols-2 gap-2 pt-2 border-t border-slate-800/80 text-xs">
                    <div>
                      <div className="text-slate-500 text-[11px]">Expiry</div>
                      <div className="text-slate-200 font-mono">
                        {new Date(firm.licenseExpiresAt).toLocaleDateString()}
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
                      <div className="text-slate-500 text-[11px]">Device Limit</div>
                      <div className="flex items-center gap-1 text-slate-200 font-mono">
                        <Laptop className="w-3.5 h-3.5 text-slate-400" />
                        <span>{firm.maxDevices} devices</span>
                      </div>
                    </div>
                  </div>

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

      {/* Create Firm Modal */}
      <CreateFirmModal
        isOpen={isCreateOpen}
        onClose={() => setIsCreateOpen(false)}
        onSuccess={() => fetchFirms()}
      />
    </div>
  );
};
