import React, { useState, useEffect } from 'react';
import { adminApi } from '../api/adminApi';
import { AdminAuditEntry } from '../types/adminTypes';
import { History, Shield, RefreshCw } from 'lucide-react';

export const AuditScreen: React.FC = () => {
  const [logs, setLogs] = useState<AdminAuditEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchLogs = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await adminApi.listAdminAudits(100, 0);
      setLogs(res.logs);
    } catch (err: any) {
      setError(err?.message || 'Failed to fetch platform audit log.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLogs();
  }, []);

  const actionBadge = (action: string) => {
    let color = 'bg-slate-800 text-slate-300 border-slate-700';
    if (action.includes('CREATE')) color = 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20';
    if (action.includes('DELETE')) color = 'bg-rose-500/10 text-rose-400 border-rose-500/20';
    if (action.includes('SUSPEND') || action.includes('DISABLE')) color = 'bg-amber-500/10 text-amber-400 border-amber-500/20';
    if (action.includes('RENEW') || action.includes('REACTIVATE')) color = 'bg-indigo-500/10 text-indigo-400 border-indigo-500/20';

    return (
      <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-mono font-medium border ${color}`}>
        {action}
      </span>
    );
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-white flex items-center gap-2">
            <History className="w-6 h-6 text-indigo-400" />
            Platform Super Admin Audit Trail
          </h1>
          <p className="text-xs sm:text-sm text-slate-400">
            Immutable log of all super admin actions, firm modifications, and license operations.
          </p>
        </div>
        <button
          onClick={fetchLogs}
          className="flex items-center justify-center gap-2 px-3.5 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs sm:text-sm font-medium rounded-xl border border-slate-700 min-h-[44px] transition-colors"
        >
          <RefreshCw className="w-4 h-4" />
          Refresh
        </button>
      </div>

      {loading ? (
        <div className="p-12 text-center text-slate-500 text-sm">Loading audit logs...</div>
      ) : error ? (
        <div className="p-4 bg-rose-500/10 border border-rose-500/20 rounded-xl text-rose-400 text-sm">
          {error}
        </div>
      ) : logs.length === 0 ? (
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-12 text-center text-slate-500 text-sm">
          No audit records found.
        </div>
      ) : (
        <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-xl">
          <div className="divide-y divide-slate-800/80">
            {logs.map((log) => (
              <div key={log.id} className="p-4 sm:p-5 space-y-2 hover:bg-slate-800/30 transition-colors">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1.5">
                  <div className="flex items-center gap-2 flex-wrap">
                    {actionBadge(log.action)}
                    {log.targetFirmId && (
                      <span className="text-xs text-slate-400 font-mono">
                        Target Firm: <span className="text-slate-200">{log.targetFirmId}</span>
                      </span>
                    )}
                  </div>
                  <div className="text-xs text-slate-500">
                    {new Date(log.at).toLocaleString()}
                    {log.ip && ` • IP: ${log.ip}`}
                  </div>
                </div>

                <div className="flex items-center gap-2 text-xs text-slate-400">
                  <Shield className="w-3.5 h-3.5 text-slate-500" />
                  <span>Admin ID: <span className="font-mono text-slate-300">{log.adminId}</span></span>
                </div>

                {(log.old || log.new) && (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2 pt-1">
                    {log.old && (
                      <div className="bg-slate-950/60 p-2.5 rounded-lg border border-slate-800 text-[11px] font-mono text-slate-400 overflow-x-auto">
                        <div className="text-slate-500 font-semibold mb-1">Old State:</div>
                        <pre>{JSON.stringify(log.old, null, 2)}</pre>
                      </div>
                    )}
                    {log.new && (
                      <div className="bg-slate-950/60 p-2.5 rounded-lg border border-slate-800 text-[11px] font-mono text-indigo-300 overflow-x-auto">
                        <div className="text-indigo-400 font-semibold mb-1">New State:</div>
                        <pre>{JSON.stringify(log.new, null, 2)}</pre>
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
