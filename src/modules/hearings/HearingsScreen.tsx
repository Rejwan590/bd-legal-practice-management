import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../foundation/AuthContext';
import { useNavigation } from '../foundation/NavigationContext';
import { getRepositories } from '../../data/repositories';
import { CaseRecord, HearingRecord, HearingStatus } from '../../data/types';
import { ResponsiveTable } from '../../components/responsive/ResponsiveTable';
import { HearingDateHistoryModal } from './HearingDateHistoryModal';
import { RescheduleHearingModal } from './RescheduleHearingModal';
import { AdjournHearingModal } from './AdjournHearingModal';
import { HearingFormModal } from './HearingFormModal';
import { EntityLink } from '../../components/EntityLink';
import {
  CIVIL_FIXED_FOR_OPTIONS,
  CRIMINAL_FIXED_FOR_OPTIONS,
  getFixedForLabel,
} from '../../data/hearingFixedFor';
import {
  Gavel,
  Calendar,
  Plus,
  History,
  AlertCircle,
  CheckCircle2,
  Building,
  RotateCcw,
  FastForward,
  Lock,
  Edit2,
  Check,
  XCircle,
} from 'lucide-react';

export const HearingsScreen: React.FC = () => {
  const { t, i18n } = useTranslation();
  const { currentUser, can, isReadOnly } = useAuth();
  const { refreshVersion, triggerRefresh } = useNavigation();
  const [hearings, setHearings] = useState<HearingRecord[]>([]);
  const [casesMap, setCasesMap] = useState<Record<string, CaseRecord>>({});
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<'all' | HearingStatus>('all');
  const [fixedForFilter, setFixedForFilter] = useState<string>('all');
  const [todayOnly, setTodayOnly] = useState(false);

  // Modals state
  const [scheduleModalOpen, setScheduleModalOpen] = useState(false);
  const [editingHearing, setEditingHearing] = useState<HearingRecord | null>(null);
  const [historyHearing, setHistoryHearing] = useState<HearingRecord | null>(null);
  const [rescheduleHearing, setRescheduleHearing] = useState<HearingRecord | null>(null);
  const [adjournHearing, setAdjournHearing] = useState<HearingRecord | null>(null);

  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const repos = getRepositories();
  const canUpdate = can('hearings.update');
  const currentLang = i18n.language === 'bn' ? 'bn' : 'en';

  const allFixedForOptions = [
    ...CIVIL_FIXED_FOR_OPTIONS,
    ...CRIMINAL_FIXED_FOR_OPTIONS.filter((c) => !CIVIL_FIXED_FOR_OPTIONS.some((o) => o.key === c.key)),
  ];

  const fetchHearings = async () => {
    setLoading(true);
    setErrorMsg(null);
    try {
      const [hearingsData, casesData] = await Promise.all([
        repos.hearing.list(
          { currentUser },
          {
            status: statusFilter !== 'all' ? statusFilter : undefined,
            fixedFor: fixedForFilter !== 'all' ? fixedForFilter : undefined,
          }
        ),
        repos.case.list({ currentUser }),
      ]);

      const cmap: Record<string, CaseRecord> = {};
      casesData.forEach((c) => {
        cmap[c.id] = c;
      });
      setCasesMap(cmap);

      let filtered = hearingsData;
      if (todayOnly) {
        const todayStr = new Date().toISOString().slice(0, 10);
        filtered = filtered.filter((h) => h.scheduledAt.slice(0, 10) === todayStr);
      }
      setHearings(filtered);
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : 'Failed to load cause list');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchHearings();
  }, [currentUser, statusFilter, fixedForFilter, todayOnly, refreshVersion]);

  const handleSaveHearing = async (data: {
    caseId: string;
    appearingLawyerId?: string | null;
    scheduledAt: string;
    fixedFor: string;
    fixedForNote?: string;
    purpose: string;
    outcomeNote?: string;
    status?: HearingStatus;
  }) => {
    if (editingHearing) {
      await repos.hearing.update({ currentUser }, editingHearing.id, {
        scheduledAt: data.scheduledAt,
        appearingLawyerId: data.appearingLawyerId,
        fixedFor: data.fixedFor,
        fixedForNote: data.fixedForNote,
        purpose: data.purpose,
        outcomeNote: data.outcomeNote,
        status: data.status,
      });
      setSuccessMsg(t('hearings.hearingSaved'));
    } else {
      await repos.hearing.create({ currentUser }, data);
      setSuccessMsg(t('hearings.hearingSaved'));
    }
    setEditingHearing(null);
    await fetchHearings();
    triggerRefresh();
    setTimeout(() => setSuccessMsg(null), 3000);
  };

  const handleQuickStatus = async (h: HearingRecord, status: HearingStatus) => {
    if (isReadOnly || !canUpdate) return;
    try {
      await repos.hearing.update({ currentUser }, h.id, { status });
      setSuccessMsg(t('hearings.hearingSaved'));
      await fetchHearings();
      triggerRefresh();
      setTimeout(() => setSuccessMsg(null), 3000);
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : 'Failed to update hearing status');
    }
  };

  const handleReschedule = async (
    hearingId: string,
    newDate: string,
    reason: string,
    fixedFor?: string,
    fixedForNote?: string
  ) => {
    await repos.hearing.rescheduleDate({ currentUser }, hearingId, newDate, reason, fixedFor, fixedForNote);
    setSuccessMsg(t('hearings.dateRescheduled'));
    await fetchHearings();
    triggerRefresh();
    setTimeout(() => setSuccessMsg(null), 3000);
  };

  const handleAdjournAndNext = async (
    hearingId: string,
    outcomeNote: string,
    nextDate: string,
    nextPurpose: string,
    reason: string,
    nextFixedFor?: string,
    nextFixedForNote?: string
  ) => {
    await repos.hearing.adjournAndScheduleNext(
      { currentUser },
      hearingId,
      outcomeNote,
      nextDate,
      nextPurpose,
      reason,
      nextFixedFor,
      nextFixedForNote
    );
    setSuccessMsg(t('hearings.hearingAdjourned'));
    await fetchHearings();
    triggerRefresh();
    setTimeout(() => setSuccessMsg(null), 3000);
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto w-full">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200 pb-5">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
            <Gavel className="w-6 h-6 text-slate-700" />
            {t('hearings.title')}
          </h1>
          <p className="text-sm text-slate-500 mt-1">{t('hearings.subtitle')}</p>
        </div>

        {isReadOnly ? (
          <span className="flex items-center gap-1.5 px-3 py-1.5 bg-rose-50 text-rose-700 rounded-lg text-xs font-semibold border border-rose-200">
            <Lock className="w-3.5 h-3.5" /> {t('common.readOnlyMode')}
          </span>
        ) : canUpdate ? (
          <button
            onClick={() => {
              setEditingHearing(null);
              setScheduleModalOpen(true);
            }}
            className="inline-flex items-center justify-center gap-2 px-4 py-2.5 min-h-[44px] bg-slate-900 hover:bg-slate-800 text-white text-sm font-semibold rounded-xl shadow-xs transition"
          >
            <Plus className="w-4 h-4" />
            {t('hearings.scheduleHearing')}
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

      {/* Cause list filter bar */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={() => setTodayOnly(false)}
            className={`px-3 py-2 sm:py-1.5 min-h-[40px] sm:min-h-0 rounded-lg text-xs font-semibold transition ${
              !todayOnly
                ? 'bg-slate-900 text-white'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            {t('hearings.allHearings')}
          </button>
          <button
            onClick={() => setTodayOnly(true)}
            className={`px-3 py-2 sm:py-1.5 min-h-[40px] sm:min-h-0 rounded-lg text-xs font-semibold transition flex items-center gap-1.5 ${
              todayOnly
                ? 'bg-indigo-600 text-white shadow-xs'
                : 'bg-indigo-50 text-indigo-700 hover:bg-indigo-100'
            }`}
          >
            <Calendar className="w-3.5 h-3.5" />
            {t('hearings.todayCauseList')}
          </button>

          <div className="h-5 w-px bg-slate-200 mx-1 hidden sm:block" />

          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as 'all' | HearingStatus)}
            className="bg-slate-50 border border-slate-300 text-slate-700 text-xs rounded-lg px-2.5 py-2 sm:py-1.5 min-h-[40px] sm:min-h-0 focus:ring-2 focus:ring-slate-500 focus:outline-hidden"
          >
            <option value="all">{t('common.all')}</option>
            <option value="scheduled">{t('hearings.scheduled')}</option>
            <option value="held">{t('hearings.held')}</option>
            <option value="adjourned">{t('hearings.adjourned')}</option>
            <option value="cancelled">{t('hearings.cancelled')}</option>
          </select>

          <select
            value={fixedForFilter}
            onChange={(e) => setFixedForFilter(e.target.value)}
            className="bg-slate-50 border border-slate-300 text-slate-700 text-xs rounded-lg px-2.5 py-2 sm:py-1.5 min-h-[40px] sm:min-h-0 focus:ring-2 focus:ring-slate-500 focus:outline-hidden"
          >
            <option value="all">{t('hearings.allFixedFor')}</option>
            {allFixedForOptions.map((opt) => (
              <option key={opt.key} value={opt.key}>
                {currentLang === 'bn' ? opt.labelBn : opt.labelEn}
              </option>
            ))}
          </select>
        </div>

        <div className="text-xs font-semibold text-slate-500 px-3 py-1.5 bg-slate-100 rounded-lg shrink-0 self-start sm:self-center">
          {t('hearings.totalHearings')}: {hearings.length}
        </div>
      </div>

      {/* Hearings List */}
      {loading ? (
        <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center text-slate-400 text-sm">
          {t('common.loading')}
        </div>
      ) : (
        <ResponsiveTable<HearingRecord>
          data={hearings}
          keyExtractor={(h) => h.id}
          emptyState={
            <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center space-y-3">
              <Gavel className="w-10 h-10 text-slate-300 mx-auto" />
              <p className="text-sm text-slate-500">{t('hearings.noHearingsFound')}</p>
            </div>
          }
          columns={[
            {
              header: 'Case / Matter',
              accessor: (h) => {
                const caseRec = casesMap[h.caseId];
                return (
                  <div className="space-y-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      {caseRec ? (
                        <EntityLink
                          type="case"
                          id={caseRec.id}
                          caseTab="hearings"
                          label={caseRec.caseNumber}
                          subtitle={`(${caseRec.fileSerial})`}
                          isRestricted={caseRec.restricted}
                          className="text-sm"
                        />
                      ) : (
                        <span className="font-bold text-sm text-slate-900">Case</span>
                      )}
                    </div>
                    <div className="text-xs text-slate-500 flex items-center gap-1.5">
                      <Building className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                      <span>{h.court || caseRec?.court || '—'}</span>
                    </div>
                  </div>
                );
              },
            },
            {
              header: 'Step / Purpose',
              accessor: (h) => (
                <div className="space-y-1 max-w-md">
                  <div className="flex items-center gap-2 flex-wrap">
                    <EntityLink
                      type="hearing"
                      id={h.id}
                      caseId={h.caseId}
                      label={h.purpose}
                      showIcon={false}
                      onClickOverride={() => {
                        if (canUpdate && !isReadOnly) {
                          setEditingHearing(h);
                          setScheduleModalOpen(true);
                        } else {
                          setHistoryHearing(h);
                        }
                      }}
                      className="text-xs font-semibold text-slate-900"
                    />
                    {h.fixedFor && (
                      <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium bg-blue-50 text-blue-700 border border-blue-200">
                        {getFixedForLabel(h.fixedFor, currentLang)}
                        {h.fixedForNote ? ` (${h.fixedForNote})` : ''}
                      </span>
                    )}
                  </div>
                  {h.outcomeNote && (
                    <div className="text-xs text-slate-500 line-clamp-2" title={h.outcomeNote}>
                      <strong className="text-slate-700">Order:</strong> {h.outcomeNote}
                    </div>
                  )}
                </div>
              ),
            },
            {
              header: 'Date & Time',
              accessor: (h) => (
                <div>
                  <div className="flex items-center gap-1.5 font-bold text-xs text-slate-900">
                    <Calendar className="w-3.5 h-3.5 text-indigo-600 shrink-0" />
                    <span>{new Date(h.scheduledAt).toLocaleDateString()}</span>
                  </div>
                  <span className="text-[11px] text-slate-400 font-mono block mt-0.5">
                    {new Date(h.scheduledAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </span>
                </div>
              ),
            },
            {
              header: 'Status',
              accessor: (h) => (
                <span
                  className={`inline-block text-[10px] px-2 py-0.5 rounded font-bold uppercase tracking-wider ${
                    h.status === 'scheduled'
                      ? 'bg-indigo-100 text-indigo-800'
                      : h.status === 'held'
                      ? 'bg-emerald-100 text-emerald-800'
                      : h.status === 'adjourned'
                      ? 'bg-amber-100 text-amber-800'
                      : 'bg-rose-100 text-rose-800'
                  }`}
                >
                  {t(`hearings.${h.status}`)}
                </span>
              ),
            },
            {
              header: 'Actions',
              className: 'text-right',
              headerClassName: 'text-right',
              accessor: (h) => (
                <div className="flex items-center justify-end gap-1.5 flex-wrap">
                  <button
                    onClick={() => setHistoryHearing(h)}
                    className="inline-flex items-center gap-1 px-2.5 py-1.5 min-h-[36px] bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold rounded-lg transition"
                    title={t('hearings.dateHistory')}
                  >
                    <History className="w-3.5 h-3.5" />
                    <span>{t('hearings.dateHistory')}</span>
                  </button>

                  {canUpdate && !isReadOnly && (
                    <>
                      <button
                        onClick={() => {
                          setEditingHearing(h);
                          setScheduleModalOpen(true);
                        }}
                        className="inline-flex items-center gap-1 px-2.5 py-1.5 min-h-[36px] bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold rounded-lg transition"
                        title={t('common.edit')}
                      >
                        <Edit2 className="w-3.5 h-3.5" />
                        <span>{t('common.edit')}</span>
                      </button>

                      {h.status === 'scheduled' && (
                        <>
                          <button
                            onClick={() => setRescheduleHearing(h)}
                            className="inline-flex items-center gap-1 px-2.5 py-1.5 min-h-[36px] bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold rounded-lg transition"
                            title={t('hearings.rescheduleDate')}
                          >
                            <RotateCcw className="w-3.5 h-3.5" />
                            <span>Reschedule</span>
                          </button>

                          <button
                            onClick={() => setAdjournHearing(h)}
                            className="inline-flex items-center gap-1 px-2.5 py-1.5 min-h-[36px] bg-amber-50 hover:bg-amber-100 text-amber-900 border border-amber-200 text-xs font-semibold rounded-lg transition shadow-2xs"
                            title={t('hearings.adjournAndNext')}
                          >
                            <FastForward className="w-3.5 h-3.5 text-amber-700" />
                            <span>Adjourn & Next</span>
                          </button>

                          <button
                            onClick={() => handleQuickStatus(h, 'held')}
                            className="inline-flex items-center gap-1 px-2.5 py-1.5 min-h-[36px] bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-200 text-xs font-semibold rounded-lg transition"
                          >
                            <Check className="w-3.5 h-3.5" />
                            <span>{t('hearings.held')}</span>
                          </button>

                          <button
                            onClick={() => handleQuickStatus(h, 'cancelled')}
                            className="inline-flex items-center gap-1 px-2.5 py-1.5 min-h-[36px] bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 text-xs font-semibold rounded-lg transition"
                          >
                            <XCircle className="w-3.5 h-3.5" />
                            <span>{t('hearings.cancelled')}</span>
                          </button>
                        </>
                      )}
                    </>
                  )}
                </div>
              ),
            },
          ]}
          renderMobileCard={(h) => {
            const caseRec = casesMap[h.caseId];
            return (
              <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-2xs space-y-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="space-y-0.5">
                    <div className="flex items-center gap-2 flex-wrap">
                      {caseRec ? (
                        <EntityLink
                          type="case"
                          id={caseRec.id}
                          caseTab="hearings"
                          label={caseRec.caseNumber}
                          subtitle={`(${caseRec.fileSerial})`}
                          isRestricted={caseRec.restricted}
                          className="text-sm"
                        />
                      ) : (
                        <span className="font-bold text-sm text-slate-900">Case</span>
                      )}
                    </div>
                    <div className="text-xs text-slate-500 flex items-center gap-1.5">
                      <Building className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                      <span>{h.court || caseRec?.court || '—'}</span>
                    </div>
                  </div>

                  <span
                    className={`text-[10px] px-2 py-0.5 rounded font-bold uppercase tracking-wider shrink-0 ${
                      h.status === 'scheduled'
                        ? 'bg-indigo-100 text-indigo-800'
                        : h.status === 'held'
                        ? 'bg-emerald-100 text-emerald-800'
                        : h.status === 'adjourned'
                        ? 'bg-amber-100 text-amber-800'
                        : 'bg-rose-100 text-rose-800'
                    }`}
                  >
                    {t(`hearings.${h.status}`)}
                  </span>
                </div>

                <div className="p-3 rounded-xl bg-slate-50/80 border border-slate-200/80 text-xs space-y-1">
                  <div className="font-semibold text-slate-900 flex items-center gap-1.5 flex-wrap">
                    <span>Step / Purpose:</span>
                    <EntityLink
                      type="hearing"
                      id={h.id}
                      caseId={h.caseId}
                      label={h.purpose}
                      showIcon={false}
                      onClickOverride={() => {
                        if (canUpdate && !isReadOnly) {
                          setEditingHearing(h);
                          setScheduleModalOpen(true);
                        } else {
                          setHistoryHearing(h);
                        }
                      }}
                      className="text-xs text-slate-700"
                    />
                    {h.fixedFor && (
                      <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-blue-50 text-blue-700 border border-blue-200">
                        {getFixedForLabel(h.fixedFor, currentLang)}
                        {h.fixedForNote ? ` (${h.fixedForNote})` : ''}
                      </span>
                    )}
                  </div>
                  {h.outcomeNote && (
                    <div className="text-slate-600 pt-1 border-t border-slate-200/50">
                      <strong>Order / Notes:</strong> {h.outcomeNote}
                    </div>
                  )}
                </div>

                <div className="flex items-center justify-between pt-1 border-t border-slate-100 text-xs text-slate-600">
                  <div className="flex items-center gap-1.5 font-semibold text-slate-900">
                    <Calendar className="w-4 h-4 text-indigo-600" />
                    <span>{new Date(h.scheduledAt).toLocaleDateString()}</span>
                    <span className="text-slate-400 font-mono text-[11px]">
                      ({new Date(h.scheduledAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })})
                    </span>
                  </div>
                </div>

                <div className="flex flex-col sm:flex-row gap-2 pt-2 border-t border-slate-100">
                  <button
                    onClick={() => setHistoryHearing(h)}
                    className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2 min-h-[44px] bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold rounded-xl transition"
                  >
                    <History className="w-4 h-4" />
                    <span>{t('hearings.dateHistory')}</span>
                  </button>

                  {canUpdate && !isReadOnly && (
                    <>
                      <button
                        onClick={() => {
                          setEditingHearing(h);
                          setScheduleModalOpen(true);
                        }}
                        className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2 min-h-[44px] bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold rounded-xl transition"
                      >
                        <Edit2 className="w-4 h-4" />
                        <span>{t('common.edit')}</span>
                      </button>

                      {h.status === 'scheduled' && (
                        <>
                          <button
                            onClick={() => setRescheduleHearing(h)}
                            className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2 min-h-[44px] bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold rounded-xl transition"
                          >
                            <RotateCcw className="w-4 h-4" />
                            <span>Reschedule</span>
                          </button>

                          <button
                            onClick={() => setAdjournHearing(h)}
                            className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2 min-h-[44px] bg-amber-50 hover:bg-amber-100 text-amber-900 border border-amber-200 text-xs font-semibold rounded-xl transition"
                          >
                            <FastForward className="w-4 h-4 text-amber-700" />
                            <span>Adjourn & Next</span>
                          </button>
                        </>
                      )}
                    </>
                  )}
                </div>
              </div>
            );
          }}
        />
      )}

      {/* Modals */}
      <HearingDateHistoryModal
        isOpen={Boolean(historyHearing)}
        hearing={historyHearing}
        onClose={() => setHistoryHearing(null)}
      />

      <RescheduleHearingModal
        isOpen={Boolean(rescheduleHearing)}
        hearing={rescheduleHearing}
        onClose={() => setRescheduleHearing(null)}
        onReschedule={handleReschedule}
      />

      <AdjournHearingModal
        isOpen={Boolean(adjournHearing)}
        hearing={adjournHearing}
        onClose={() => setAdjournHearing(null)}
        onAdjournAndScheduleNext={handleAdjournAndNext}
      />

      <HearingFormModal
        isOpen={scheduleModalOpen}
        initialData={editingHearing}
        onClose={() => {
          setScheduleModalOpen(false);
          setEditingHearing(null);
        }}
        onSave={handleSaveHearing}
      />
    </div>
  );
};
