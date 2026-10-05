import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../foundation/AuthContext';
import { getRepositories } from '../../data/repositories';
import { CaseRecord, ClientRecord } from '../../data/types';
import { ResponsiveTable } from '../../components/responsive/ResponsiveTable';
import { CaseFormModal } from './CaseFormModal';
import { CaseDetailsView } from './CaseDetailsView';
import {
  Briefcase,
  Search,
  Plus,
  Building,
  Lock,
  ChevronRight,
  ShieldAlert,
  AlertCircle,
  CheckCircle2,
  Calendar,
  Filter,
  Edit2,
  User,
  Scale,
} from 'lucide-react';

interface CasesScreenProps {
  initialSelectedCaseId?: string | null;
  onNavigateToClient?: (clientId: string) => void;
}

export const CasesScreen: React.FC<CasesScreenProps> = ({
  initialSelectedCaseId,
  onNavigateToClient,
}) => {
  const { t } = useTranslation();
  const { currentUser, can, isReadOnly } = useAuth();
  const [cases, setCases] = useState<CaseRecord[]>([]);
  const [clientsMap, setClientsMap] = useState<Record<string, ClientRecord>>({});
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'ongoing' | 'closed'>('all');
  const [courtFilter, setCourtFilter] = useState<string>('ALL');

  // Selected dossier & modal
  const [selectedCase, setSelectedCase] = useState<CaseRecord | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingCase, setEditingCase] = useState<CaseRecord | null>(null);

  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const repos = getRepositories();
  const canView = can('cases.view');
  const canCreate = can('cases.create');
  const canEdit = can('cases.edit');
  const canSeeRestricted = can('restricted.view');

  const fetchCases = async () => {
    if (!canView) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setErrorMsg(null);
    try {
      const [casesData, clientsData] = await Promise.all([
        repos.case.list(
          { currentUser },
          {
            search: searchQuery,
            status: statusFilter,
            court: courtFilter,
          }
        ),
        repos.client.list({ currentUser }),
      ]);

      setCases(casesData);
      const cmap: Record<string, ClientRecord> = {};
      clientsData.forEach((c) => {
        cmap[c.id] = c;
      });
      setClientsMap(cmap);
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : 'Failed to load cases');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCases();
  }, [currentUser, searchQuery, statusFilter, courtFilter, canView]);

  useEffect(() => {
    if (initialSelectedCaseId && cases.length > 0) {
      const match = cases.find((c) => c.id === initialSelectedCaseId);
      if (match) {
        setSelectedCase(match);
      }
    }
  }, [initialSelectedCaseId, cases]);

  const handleSaveCase = async (formData: Omit<CaseRecord, 'id' | 'firmId' | 'createdAt' | 'updatedAt' | 'deletedAt' | 'createdBy' | 'updatedBy' | 'nextHearingAt'>) => {
    try {
      if (editingCase) {
        const updated = await repos.case.update({ currentUser }, editingCase.id, formData);
        setSuccessMsg(t('cases.caseSaved'));
        if (selectedCase && selectedCase.id === updated.id) {
          setSelectedCase(updated);
        }
      } else {
        await repos.case.create({ currentUser }, formData);
        setSuccessMsg(t('cases.caseSaved'));
      }
      setEditingCase(null);
      await fetchCases();
      setTimeout(() => setSuccessMsg(null), 3000);
    } catch (err: unknown) {
      throw err;
    }
  };

  if (!canView) {
    return (
      <div className="max-w-4xl mx-auto p-6">
        <div className="bg-amber-50 border border-amber-200 rounded-2xl p-8 text-center text-amber-900 shadow-sm">
          <ShieldAlert className="w-12 h-12 mx-auto text-amber-600 mb-3" />
          <h2 className="text-xl font-bold mb-2">{t('cases.title')}</h2>
          <p className="text-amber-700 max-w-md mx-auto mb-4">
            Permission required: cases.view (Current role: {currentUser.role})
          </p>
        </div>
      </div>
    );
  }

  // If a case is selected, render dossier view
  if (selectedCase) {
    return (
      <CaseDetailsView
        caseRecord={selectedCase}
        onBack={() => {
          setSelectedCase(null);
          fetchCases();
        }}
        onEdit={(c) => {
          setEditingCase(c);
          setModalOpen(true);
        }}
        onDeleted={() => {
          setSelectedCase(null);
          setSuccessMsg(t('cases.caseDeleted'));
          fetchCases();
          setTimeout(() => setSuccessMsg(null), 3000);
        }}
        onNavigateToClient={onNavigateToClient}
      />
    );
  }

  // Extract unique courts for filter
  const uniqueCourts = Array.from(new Set(cases.map((c) => c.court)));

  return (
    <div className="space-y-6 max-w-7xl mx-auto w-full">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200 pb-5">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
            <Briefcase className="w-6 h-6 text-slate-700" />
            {t('cases.title')}
          </h1>
          <p className="text-sm text-slate-500 mt-1">{t('cases.subtitle')}</p>
        </div>

        {isReadOnly ? (
          <span className="flex items-center gap-1.5 px-3 py-1.5 bg-rose-50 text-rose-700 rounded-lg text-xs font-semibold border border-rose-200">
            <Lock className="w-3.5 h-3.5" /> {t('common.readOnlyMode')}
          </span>
        ) : canCreate ? (
          <button
            onClick={() => {
              setEditingCase(null);
              setModalOpen(true);
            }}
            className="min-h-[44px] inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-slate-900 hover:bg-slate-800 text-white text-sm font-semibold rounded-xl shadow-xs transition"
          >
            <Plus className="w-4 h-4" />
            {t('cases.addCase')}
          </button>
        ) : (
          <span className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 text-slate-500 rounded-lg text-xs font-medium border border-slate-200">
            <Lock className="w-3.5 h-3.5" /> {t('common.readOnlyStaff')}
          </span>
        )}
      </div>

      {successMsg && (
        <div className="flex items-center gap-2 p-4 bg-emerald-50 border border-emerald-200 rounded-xl text-emerald-800 text-sm">
          <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
          <span>{successMsg}</span>
        </div>
      )}

      {errorMsg && (
        <div className="flex items-center gap-2 p-4 bg-rose-50 border border-rose-200 rounded-xl text-rose-800 text-sm">
          <AlertCircle className="w-5 h-5 text-rose-600 shrink-0" />
          <span>{errorMsg}</span>
        </div>
      )}

      {/* Search & Filters */}
      <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs space-y-3">
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-3.5" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={t('cases.searchPlaceholder')}
              className="w-full min-h-[44px] pl-9 pr-4 py-2 bg-slate-50 border border-slate-300 rounded-lg text-sm text-slate-900 focus:ring-2 focus:ring-slate-500 focus:outline-hidden"
            />
          </div>

          <div className="text-xs font-semibold text-slate-500 px-3 py-2.5 bg-slate-100 rounded-lg shrink-0 self-center">
            {t('cases.totalCases')}: {cases.length}
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
          <div>
            <label className="block text-[11px] font-semibold text-slate-600 mb-1">
              {t('cases.filterStatus')}
            </label>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as 'all' | 'ongoing' | 'closed')}
              className="w-full min-h-[44px] bg-slate-50 border border-slate-300 text-slate-800 text-xs rounded-lg p-2.5 focus:ring-2 focus:ring-slate-500 focus:outline-hidden"
            >
              <option value="all">{t('common.all')}</option>
              <option value="ongoing">{t('cases.ongoing')}</option>
              <option value="closed">{t('cases.closed')}</option>
            </select>
          </div>

          <div>
            <label className="block text-[11px] font-semibold text-slate-600 mb-1">
              {t('cases.filterCourt')}
            </label>
            <select
              value={courtFilter}
              onChange={(e) => setCourtFilter(e.target.value)}
              className="w-full min-h-[44px] bg-slate-50 border border-slate-300 text-slate-800 text-xs rounded-lg p-2.5 focus:ring-2 focus:ring-slate-500 focus:outline-hidden"
            >
              <option value="ALL">{t('cases.allCourts')}</option>
              {uniqueCourts.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Cases List */}
      {loading ? (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-xs p-12 text-center text-slate-400 text-sm">
          {t('common.loading')}
        </div>
      ) : cases.length === 0 ? (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-xs p-12 text-center space-y-3">
          <Briefcase className="w-10 h-10 text-slate-300 mx-auto" />
          <p className="text-sm text-slate-500">{t('cases.noCasesFound')}</p>
          {canCreate && (
            <button
              onClick={() => {
                setEditingCase(null);
                setModalOpen(true);
              }}
              className="min-h-[44px] inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-indigo-700 bg-indigo-50 hover:bg-indigo-100 rounded-lg transition"
            >
              <Plus className="w-3.5 h-3.5" />
              {t('cases.addCase')}
            </button>
          )}
        </div>
      ) : (
        <ResponsiveTable<CaseRecord>
          data={cases}
          keyExtractor={(c) => c.id}
          onRowClick={(c) => setSelectedCase(c)}
          columns={[
            {
              header: 'File / Serial',
              className: 'whitespace-nowrap',
              accessor: (c) => (
                <div className="flex items-center gap-2">
                  <div className="w-9 h-9 rounded-lg bg-slate-100 text-slate-700 font-mono font-bold text-xs flex items-center justify-center shrink-0 border border-slate-200">
                    {c.fileSerial.slice(-4)}
                  </div>
                  <span className="text-xs font-mono text-slate-500">{c.fileSerial}</span>
                </div>
              ),
            },
            {
              header: 'Case Number',
              accessor: (c) => (
                <div className="space-y-1">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="font-bold text-sm text-slate-900">{c.caseNumber}</span>
                    {c.restricted && (
                      <span className="inline-flex items-center gap-0.5 text-[10px] px-1.5 py-0.5 rounded font-bold bg-amber-100 text-amber-900 border border-amber-300">
                        <Lock className="w-3 h-3 text-amber-700" />
                        Confidential
                      </span>
                    )}
                  </div>
                  <span
                    className={`inline-block text-[10px] px-2 py-0.5 rounded font-semibold ${
                      c.status === 'ongoing'
                        ? 'bg-emerald-100 text-emerald-800'
                        : 'bg-slate-200 text-slate-700'
                    }`}
                  >
                    {c.status === 'ongoing' ? t('cases.ongoing') : t('cases.closed')}
                  </span>
                </div>
              ),
            },
            {
              header: 'Court',
              accessor: (c) => (
                <div className="flex items-center gap-1.5 text-xs text-slate-600 max-w-xs">
                  <Building className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                  <span className="line-clamp-2">{c.court}</span>
                </div>
              ),
            },
            {
              header: 'Parties',
              accessor: (c) => (
                <div className="flex items-center gap-1 text-xs text-slate-600 max-w-xs">
                  <Scale className="w-3.5 h-3.5 text-indigo-500 shrink-0" />
                  <span className="line-clamp-2">
                    <strong className="text-slate-800">{c.plaintiff}</strong> vs{' '}
                    <span className="text-slate-600">{c.defendant}</span>
                  </span>
                </div>
              ),
            },
            {
              header: 'Client',
              accessor: (c) => {
                const linkedClient = clientsMap[c.clientId];
                return linkedClient ? (
                  <div className="text-xs">
                    <span className="font-medium text-slate-800 block truncate">{linkedClient.name}</span>
                    <span className="text-[11px] text-slate-500">Role: {c.ourRole}</span>
                  </div>
                ) : (
                  <span className="text-xs text-slate-400">—</span>
                );
              },
            },
            {
              header: '',
              className: 'text-right',
              accessor: (c) => (
                <div
                  className="flex items-center justify-end gap-1.5"
                  onClick={(e) => e.stopPropagation()}
                >
                  {canEdit && (
                    <button
                      onClick={() => {
                        setEditingCase(c);
                        setModalOpen(true);
                      }}
                      className="min-h-[44px] min-w-[44px] inline-flex items-center justify-center p-2 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition"
                      title={t('common.edit')}
                      aria-label={t('common.edit')}
                    >
                      <Edit2 className="w-4 h-4" />
                    </button>
                  )}
                  <button
                    onClick={() => setSelectedCase(c)}
                    className="min-h-[44px] inline-flex items-center gap-1.5 px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-semibold rounded-lg transition"
                  >
                    <span>{t('cases.viewDetails')}</span>
                    <ChevronRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              ),
            },
          ]}
          renderMobileCard={(c) => {
            const linkedClient = clientsMap[c.clientId];
            return (
              <div className="p-4 bg-white rounded-xl border border-slate-200 shadow-2xs hover:border-slate-300 transition space-y-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-start gap-2.5">
                    <div className="w-10 h-10 rounded-xl bg-slate-100 text-slate-700 font-mono font-bold text-xs flex items-center justify-center shrink-0 border border-slate-200">
                      {c.fileSerial.slice(-4)}
                    </div>
                    <div>
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="font-bold text-sm text-slate-900">{c.caseNumber}</span>
                        {c.restricted && (
                          <span className="flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded font-bold bg-amber-100 text-amber-900 border border-amber-300">
                            <Lock className="w-3 h-3 text-amber-700" />
                            Confidential
                          </span>
                        )}
                      </div>
                      <span className="text-[10px] font-mono text-slate-400">{c.fileSerial}</span>
                    </div>
                  </div>
                  <span
                    className={`text-[10px] px-2 py-0.5 rounded font-semibold shrink-0 ${
                      c.status === 'ongoing'
                        ? 'bg-emerald-100 text-emerald-800'
                        : 'bg-slate-200 text-slate-700'
                    }`}
                  >
                    {c.status === 'ongoing' ? t('cases.ongoing') : t('cases.closed')}
                  </span>
                </div>

                <div className="text-xs font-medium text-slate-600 flex items-center gap-1.5">
                  <Building className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                  <span className="truncate">{c.court}</span>
                </div>

                <div className="space-y-1 text-xs text-slate-600 pt-2 border-t border-slate-100">
                  <div className="flex items-center gap-1">
                    <Scale className="w-3.5 h-3.5 text-indigo-500 shrink-0" />
                    <span className="truncate">
                      <strong className="text-slate-700">{c.plaintiff}</strong> vs{' '}
                      <span className="text-slate-600">{c.defendant}</span>
                    </span>
                  </div>
                  {linkedClient && (
                    <div className="flex items-center gap-1 text-[11px] text-slate-500">
                      <User className="w-3 h-3 text-slate-400 shrink-0" />
                      <span className="truncate">
                        Client: {linkedClient.name} ({c.ourRole})
                      </span>
                    </div>
                  )}
                </div>

                <div
                  className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100"
                  onClick={(e) => e.stopPropagation()}
                >
                  {canEdit && (
                    <button
                      onClick={() => {
                        setEditingCase(c);
                        setModalOpen(true);
                      }}
                      className="min-h-[44px] min-w-[44px] inline-flex items-center justify-center p-2 text-slate-600 bg-slate-50 hover:bg-slate-100 rounded-lg transition border border-slate-200"
                      title={t('common.edit')}
                      aria-label={t('common.edit')}
                    >
                      <Edit2 className="w-4 h-4" />
                    </button>
                  )}
                  <button
                    onClick={() => setSelectedCase(c)}
                    className="min-h-[44px] flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 text-xs font-semibold rounded-lg transition border border-indigo-200/60"
                  >
                    <span>{t('cases.viewDetails')}</span>
                    <ChevronRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            );
          }}
        />
      )}

      {/* Case Form Modal */}
      <CaseFormModal
        isOpen={modalOpen}
        initialData={editingCase}
        onClose={() => {
          setModalOpen(false);
          setEditingCase(null);
        }}
        onSave={handleSaveCase}
      />
    </div>
  );
};
