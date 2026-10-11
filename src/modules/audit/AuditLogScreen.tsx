import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../foundation/AuthContext';
import { useNavigation } from '../foundation/NavigationContext';
import { getRepositories } from '../../data/repositories';
import { AuditAction, AuditLogRecord } from '../../data/types';
import { EntityLink } from '../../components/EntityLink';
import { ShieldAlert, RefreshCw, FileText, ChevronDown, ChevronRight, User, Clock } from 'lucide-react';

export const AuditLogScreen: React.FC = () => {
  const { t } = useTranslation();
  const { currentUser, can } = useAuth();
  const { refreshVersion } = useNavigation();
  const [logs, setLogs] = useState<AuditLogRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [entityFilter, setEntityFilter] = useState<string>('ALL');
  const [actionFilter, setActionFilter] = useState<string>('ALL');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const repos = getRepositories();

  const fetchLogs = async () => {
    setLoading(true);
    setErrorMsg(null);
    try {
      const records = await repos.auditLog.list(
        { currentUser },
        {
          entity: entityFilter !== 'ALL' ? entityFilter : undefined,
          action: actionFilter !== 'ALL' ? (actionFilter as AuditAction) : undefined,
        }
      );
      setLogs(records);
    } catch (err: unknown) {
      if (err instanceof Error) {
        setErrorMsg(err.message);
      } else {
        setErrorMsg('Failed to load audit logs');
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (can('settings.manage')) {
      fetchLogs();
    } else {
      setLoading(false);
    }
  }, [currentUser, entityFilter, actionFilter, refreshVersion]);

  if (!can('settings.manage')) {
    return (
      <div className="max-w-4xl mx-auto p-4 sm:p-6 w-full">
        <div className="bg-amber-50 border border-amber-200 rounded-2xl p-6 sm:p-8 text-center text-amber-900 shadow-sm space-y-3">
          <ShieldAlert className="w-12 h-12 mx-auto text-amber-600 mb-1" />
          <h2 className="text-xl font-bold">{t('audit.title')}</h2>
          <p className="text-amber-700 max-w-md mx-auto text-sm leading-relaxed">
            {t('audit.restrictedAccessNotice')}
          </p>
          <div className="pt-2">
            <span className="inline-flex items-center px-3.5 py-1.5 rounded-full text-xs font-semibold bg-amber-200 text-amber-800">
              Permission required: settings.manage (Current: {currentUser.role})
            </span>
          </div>
        </div>
      </div>
    );
  }

  const uniqueEntities = Array.from(new Set(logs.map((l) => l.entity)));

  const renderAuditEntityLink = (log: AuditLogRecord) => {
    const payload = (log.newValue || log.oldValue || {}) as Record<string, unknown>;
    if (log.entity === 'Case') {
      const label = (payload.caseNumber as string) || `Case (${log.entityId})`;
      return (
        <EntityLink
          type="case"
          id={log.entityId}
          label={label}
          isRestricted={Boolean(payload.isRestricted)}
          className="text-xs"
        />
      );
    }
    if (log.entity === 'Client') {
      const label = (payload.name as string) || `Client (${log.entityId})`;
      return <EntityLink type="client" id={log.entityId} label={label} className="text-xs" />;
    }
    if (log.entity === 'Hearing') {
      const label = (payload.purpose as string) || `Hearing (${log.entityId})`;
      return (
        <EntityLink
          type="hearing"
          id={log.entityId}
          caseId={(payload.caseId as string) || undefined}
          label={label}
          className="text-xs"
        />
      );
    }
    if (log.entity === 'Task') {
      const label = (payload.title as string) || `Task (${log.entityId})`;
      return <EntityLink type="task" id={log.entityId} label={label} className="text-xs" />;
    }
    if (log.entity === 'PhysicalFile') {
      const label = (payload.title as string) || (payload.serial as string) || `File (${log.entityId})`;
      return <EntityLink type="file" id={log.entityId} label={label} className="text-xs" />;
    }
    return (
      <span className="text-xs text-slate-400 font-mono break-all sm:break-normal">
        ID: {log.entityId}
      </span>
    );
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto w-full pb-12">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200 pb-5">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
            <FileText className="w-6 h-6 text-slate-700 shrink-0" />
            <span>{t('audit.title')}</span>
          </h1>
          <p className="text-sm text-slate-500 mt-1">{t('audit.subtitle')}</p>
        </div>
        <button
          onClick={fetchLogs}
          disabled={loading}
          className="w-full sm:w-auto inline-flex items-center justify-center gap-2 min-h-[44px] px-4 py-2.5 text-sm font-semibold bg-white hover:bg-slate-50 border border-slate-300 rounded-xl text-slate-700 shadow-xs transition"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          <span>{t('common.refresh')}</span>
        </button>
      </div>

      {errorMsg && (
        <div className="p-4 bg-rose-50 border border-rose-200 rounded-xl text-rose-700 text-sm">
          {errorMsg}
        </div>
      )}

      {/* Filters */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 bg-white p-4 sm:p-5 rounded-2xl border border-slate-200 shadow-xs">
        <div>
          <label className="block text-xs font-semibold text-slate-700 mb-1.5">
            {t('audit.filterByEntity')}
          </label>
          <select
            value={entityFilter}
            onChange={(e) => setEntityFilter(e.target.value)}
            className="w-full bg-slate-50 border border-slate-300 text-slate-800 text-sm rounded-xl min-h-[44px] px-3.5 py-2.5 focus:ring-2 focus:ring-slate-500 focus:outline-hidden"
          >
            <option value="ALL">{t('common.all')}</option>
            {uniqueEntities.map((ent) => (
              <option key={ent} value={ent}>
                {ent}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-xs font-semibold text-slate-700 mb-1.5">
            {t('audit.filterByAction')}
          </label>
          <select
            value={actionFilter}
            onChange={(e) => setActionFilter(e.target.value)}
            className="w-full bg-slate-50 border border-slate-300 text-slate-800 text-sm rounded-xl min-h-[44px] px-3.5 py-2.5 focus:ring-2 focus:ring-slate-500 focus:outline-hidden"
          >
            <option value="ALL">{t('common.all')}</option>
            <option value="CREATE">CREATE</option>
            <option value="UPDATE">UPDATE</option>
            <option value="DELETE">DELETE</option>
            <option value="USER_SWITCH">USER_SWITCH</option>
            <option value="LOGIN">LOGIN</option>
          </select>
        </div>
      </div>

      {/* Table / List */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-slate-500 text-sm">{t('common.loading')}</div>
        ) : logs.length === 0 ? (
          <div className="p-12 text-center text-slate-500 text-sm">
            {t('audit.noLogs')}
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {logs.map((log) => {
              const isExpanded = expandedId === log.id;
              const hasPayload = log.oldValue !== null || log.newValue !== null;

              return (
                <div key={log.id} className="p-4 hover:bg-slate-50/80 transition">
                  <div
                    className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 cursor-pointer min-h-[44px]"
                    onClick={() => hasPayload && setExpandedId(isExpanded ? null : log.id)}
                  >
                    <div className="flex items-start sm:items-center gap-3 min-w-0">
                      <div className="mt-1 sm:mt-0 text-slate-400 shrink-0">
                        {hasPayload ? (
                          isExpanded ? <ChevronDown className="w-4 h-4 text-slate-600" /> : <ChevronRight className="w-4 h-4 text-slate-600" />
                        ) : (
                          <div className="w-4 h-4" />
                        )}
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap" onClick={(e) => e.stopPropagation()}>
                          <span className="font-semibold text-sm text-slate-900">
                            {log.entity}
                          </span>
                          <span
                            className={`px-2 py-0.5 rounded text-xs font-semibold uppercase tracking-wider shrink-0 ${
                              log.action === 'CREATE'
                                ? 'bg-emerald-100 text-emerald-800'
                                : log.action === 'DELETE'
                                ? 'bg-rose-100 text-rose-800'
                                : log.action === 'USER_SWITCH'
                                ? 'bg-indigo-100 text-indigo-800'
                                : 'bg-sky-100 text-sky-800'
                            }`}
                          >
                            {log.action}
                          </span>
                          {renderAuditEntityLink(log)}
                        </div>

                        <div className="flex items-center gap-4 text-xs text-slate-500 mt-1 flex-wrap">
                          <span className="flex items-center gap-1">
                            <User className="w-3.5 h-3.5 shrink-0" />
                            <span>{log.userName}</span>
                          </span>
                          <span className="flex items-center gap-1 font-mono">
                            <Clock className="w-3.5 h-3.5 shrink-0" />
                            <span>{new Date(log.timestamp).toLocaleString()}</span>
                          </span>
                        </div>
                      </div>
                    </div>

                    {hasPayload && (
                      <span className="min-h-[44px] py-2 text-xs font-semibold text-indigo-600 hover:text-indigo-800 underline inline-flex items-center self-start sm:self-center shrink-0">
                        {isExpanded ? 'Hide changes' : 'Show details'}
                      </span>
                    )}
                  </div>

                  {/* Expanded JSON diff */}
                  {isExpanded && hasPayload && (
                    <div className="mt-3 sm:ml-7 pt-3 border-t border-slate-100 grid grid-cols-1 md:grid-cols-2 gap-3 text-xs font-mono">
                      {log.oldValue && (
                        <div className="bg-rose-50/60 border border-rose-100 rounded-xl p-3">
                          <span className="font-sans font-semibold text-rose-800 block mb-1">
                            {t('audit.oldValue')}
                          </span>
                          <pre className="text-rose-900 overflow-x-auto whitespace-pre-wrap break-all text-[11px] sm:text-xs">
                            {JSON.stringify(log.oldValue, null, 2)}
                          </pre>
                        </div>
                      )}
                      {log.newValue && (
                        <div className="bg-emerald-50/60 border border-emerald-100 rounded-xl p-3">
                          <span className="font-sans font-semibold text-emerald-800 block mb-1">
                            {t('audit.newValue')}
                          </span>
                          <pre className="text-emerald-900 overflow-x-auto whitespace-pre-wrap break-all text-[11px] sm:text-xs">
                            {JSON.stringify(log.newValue, null, 2)}
                          </pre>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};
