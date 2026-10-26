import React, { useState, useEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../foundation/AuthContext';
import { useNavigation } from '../foundation/NavigationContext';
import { getRepositories } from '../../data/repositories';
import { CaseRecord, HearingRecord, HearingStatus, UserRecord } from '../../data/types';
import { ResponsiveTable } from '../../components/responsive/ResponsiveTable';
import { HearingDateHistoryModal } from './HearingDateHistoryModal';
import { RescheduleHearingModal } from './RescheduleHearingModal';
import { AdjournHearingModal } from './AdjournHearingModal';
import { HearingFormModal } from './HearingFormModal';
import { BulkAdjournModal } from './BulkAdjournModal';
import { BulkRescheduleModal } from './BulkRescheduleModal';
import { EntityLink } from '../../components/EntityLink';
import { formatCasePartyTitle } from '../../data/caseRoles';
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
  Printer,
  ChevronLeft,
  ChevronRight,
  User,
  X,
} from 'lucide-react';

export const HearingsScreen: React.FC = () => {
  const { t, i18n } = useTranslation();
  const { currentUser, can, isReadOnly } = useAuth();
  const { refreshVersion, triggerRefresh } = useNavigation();

  // Data states
  const [hearings, setHearings] = useState<HearingRecord[]>([]);
  const [casesMap, setCasesMap] = useState<Record<string, CaseRecord>>({});
  const [lawyers, setLawyers] = useState<UserRecord[]>([]);
  const [loading, setLoading] = useState(true);

  // Filter states
  const [viewMode, setViewMode] = useState<'all' | 'causelist'>('all');
  const [causeListDate, setCauseListDate] = useState<string>(() => new Date().toISOString().slice(0, 10));
  const [statusFilter, setStatusFilter] = useState<'all' | HearingStatus>('all');
  const [fixedForFilter, setFixedForFilter] = useState<string>('all');
  const [courtFilter, setCourtFilter] = useState<string>('all');
  const [lawyerFilter, setLawyerFilter] = useState<string>('all');

  // Multi-select state
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // Single-hearing Modals state
  const [scheduleModalOpen, setScheduleModalOpen] = useState(false);
  const [editingHearing, setEditingHearing] = useState<HearingRecord | null>(null);
  const [historyHearing, setHistoryHearing] = useState<HearingRecord | null>(null);
  const [rescheduleHearing, setRescheduleHearing] = useState<HearingRecord | null>(null);
  const [adjournHearing, setAdjournHearing] = useState<HearingRecord | null>(null);

  // Bulk Modals state
  const [bulkAdjournOpen, setBulkAdjournOpen] = useState(false);
  const [bulkRescheduleOpen, setBulkRescheduleOpen] = useState(false);
  const [bulkLoading, setBulkLoading] = useState(false);

  // Feedback notifications
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const repos = getRepositories();
  const canUpdate = can('hearings.update');
  const currentLang = i18n.language === 'bn' ? 'bn' : 'en';

  const allFixedForOptions = useMemo(() => [
    ...CIVIL_FIXED_FOR_OPTIONS,
    ...CRIMINAL_FIXED_FOR_OPTIONS.filter((c) => !CIVIL_FIXED_FOR_OPTIONS.some((o) => o.key === c.key)),
  ], []);

  // Fetch lawyers once
  useEffect(() => {
    if (currentUser) {
      repos.user
        .list({ currentUser })
        .then((usersData) => {
          setLawyers(usersData.filter((u) => (u.status ?? 'active') === 'active'));
        })
        .catch(console.error);
    }
  }, [currentUser]);

  const fetchHearings = async () => {
    setLoading(true);
    setErrorMsg(null);
    try {
      const [hearingsData, casesData] = await Promise.all([
        repos.hearing.list(
          { currentUser: currentUser! },
          {
            status: statusFilter !== 'all' ? statusFilter : undefined,
            fixedFor: fixedForFilter !== 'all' ? fixedForFilter : undefined,
          }
        ),
        repos.case.list({ currentUser: currentUser! }),
      ]);

      const cmap: Record<string, CaseRecord> = {};
      casesData.forEach((c) => {
        cmap[c.id] = c;
      });
      setCasesMap(cmap);

      let filtered = hearingsData;

      // Filter by Cause List Date if in causelist mode
      if (viewMode === 'causelist') {
        filtered = filtered.filter((h) => h.scheduledAt.slice(0, 10) === causeListDate);
      }

      // Filter by Court Bench
      if (courtFilter !== 'all') {
        filtered = filtered.filter((h) => {
          const court = h.court || cmap[h.caseId]?.court || '';
          return court.toLowerCase() === courtFilter.toLowerCase();
        });
      }

      // Filter by Appearing Lawyer
      if (lawyerFilter !== 'all') {
        filtered = filtered.filter((h) => h.appearingLawyerId === lawyerFilter);
      }

      setHearings(filtered);
      // Clean up selectedIds that are no longer in filtered list
      setSelectedIds((prev) => {
        const next = new Set<string>();
        const validIds = new Set(filtered.map((h) => h.id));
        prev.forEach((id) => {
          if (validIds.has(id)) next.add(id);
        });
        return next;
      });
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : 'Failed to load cause list');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (currentUser) {
      fetchHearings();
    }
  }, [currentUser, viewMode, causeListDate, statusFilter, fixedForFilter, courtFilter, lawyerFilter, refreshVersion]);

  // Compute unique courts
  const distinctCourts = useMemo(() => {
    const courtsSet = new Set<string>();
    Object.values(casesMap).forEach((c) => {
      if (c.court && c.court.trim()) courtsSet.add(c.court.trim());
    });
    hearings.forEach((h) => {
      if (h.court && h.court.trim()) courtsSet.add(h.court.trim());
    });
    return Array.from(courtsSet).sort();
  }, [casesMap, hearings]);

  // Selected hearings records
  const selectedHearings = useMemo(() => {
    return hearings.filter((h) => selectedIds.has(h.id));
  }, [hearings, selectedIds]);

  // Selection handlers
  const handleToggleSelectAll = () => {
    if (selectedIds.size === hearings.length && hearings.length > 0) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(hearings.map((h) => h.id)));
    }
  };

  const handleToggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleClearSelection = () => {
    setSelectedIds(new Set());
  };

  // Date jump helpers
  const handleDateOffset = (offsetDays: number) => {
    const current = new Date(causeListDate);
    current.setDate(current.getDate() + offsetDays);
    setCauseListDate(current.toISOString().slice(0, 10));
  };

  // Bulk Actions
  const handleBulkMarkHeld = async () => {
    if (isReadOnly || !canUpdate || selectedIds.size === 0) return;
    setBulkLoading(true);
    try {
      const res = await repos.hearing.bulkUpdateStatus(
        { currentUser: currentUser! },
        Array.from(selectedIds),
        'held',
        'Marked held from cause list docket'
      );
      setSuccessMsg(t('hearings.bulkStatusSuccess', { count: res.updatedCount }));
      setSelectedIds(new Set());
      await fetchHearings();
      triggerRefresh();
      setTimeout(() => setSuccessMsg(null), 3000);
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : 'Failed to bulk update status');
    } finally {
      setBulkLoading(false);
    }
  };

  const handleBulkAdjournConfirm = async (data: {
    nextDate: string;
    reason: string;
    nextFixedFor?: string;
    nextFixedForNote?: string;
    outcomeNote?: string;
  }) => {
    if (isReadOnly || !canUpdate || selectedIds.size === 0) return;
    setBulkLoading(true);
    try {
      const res = await repos.hearing.bulkAdjourn(
        { currentUser: currentUser! },
        Array.from(selectedIds),
        data.nextDate,
        data.reason,
        data.nextFixedFor,
        data.outcomeNote
      );
      setSuccessMsg(t('hearings.bulkAdjournSuccess', { count: res.adjournedCount }));
      setSelectedIds(new Set());
      await fetchHearings();
      triggerRefresh();
      setTimeout(() => setSuccessMsg(null), 3000);
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : 'Failed to bulk adjourn');
    } finally {
      setBulkLoading(false);
    }
  };

  const handleBulkRescheduleConfirm = async (data: {
    newDate: string;
    reason: string;
    fixedFor?: string;
    fixedForNote?: string;
  }) => {
    if (isReadOnly || !canUpdate || selectedIds.size === 0) return;
    setBulkLoading(true);
    try {
      const res = await repos.hearing.bulkReschedule(
        { currentUser: currentUser! },
        Array.from(selectedIds),
        data.newDate,
        data.reason,
        data.fixedFor
      );
      setSuccessMsg(t('hearings.bulkRescheduleSuccess', { count: res.rescheduledCount }));
      setSelectedIds(new Set());
      await fetchHearings();
      triggerRefresh();
      setTimeout(() => setSuccessMsg(null), 3000);
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : 'Failed to bulk reschedule');
    } finally {
      setBulkLoading(false);
    }
  };

  // Single-hearing save handlers
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
      await repos.hearing.update({ currentUser: currentUser! }, editingHearing.id, {
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
      await repos.hearing.create({ currentUser: currentUser! }, data);
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
      await repos.hearing.update({ currentUser: currentUser! }, h.id, { status });
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
    await repos.hearing.rescheduleDate({ currentUser: currentUser! }, hearingId, newDate, reason, fixedFor, fixedForNote);
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
      { currentUser: currentUser! },
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

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto w-full">
      {/* Header (Hidden on Print) */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200 pb-5 print:hidden">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
            <Gavel className="w-6 h-6 text-slate-700" />
            {t('hearings.title')}
          </h1>
          <p className="text-sm text-slate-500 mt-1">{t('hearings.subtitle')}</p>
        </div>

        <div className="flex items-center gap-2.5 flex-wrap">
          <button
            type="button"
            onClick={handlePrint}
            className="inline-flex items-center justify-center gap-2 px-3.5 py-2.5 min-h-[44px] bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 text-sm font-semibold rounded-xl shadow-2xs transition"
            title={t('hearings.printA4Docket')}
          >
            <Printer className="w-4 h-4 text-slate-600" />
            <span>{t('hearings.printA4Docket')}</span>
          </button>

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
      </div>

      {successMsg && (
        <div className="flex items-center gap-2 p-4 bg-emerald-50 border border-emerald-200 rounded-xl text-emerald-800 text-sm print:hidden">
          <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
          <span>{successMsg}</span>
        </div>
      )}

      {errorMsg && (
        <div className="flex items-center gap-2 p-4 bg-rose-50 border border-rose-200 rounded-xl text-rose-800 text-sm print:hidden">
          <AlertCircle className="w-5 h-5 text-rose-600 shrink-0" />
          <span>{errorMsg}</span>
        </div>
      )}

      {/* Cause List Filter & Docket Controls (Hidden on Print) */}
      <div className="space-y-3 bg-white p-4 rounded-xl border border-slate-200 shadow-xs print:hidden">
        {/* Top bar: Mode toggles + Date picker */}
        <div className="flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-3">
          <div className="flex items-center gap-2 flex-wrap">
            <button
              onClick={() => setViewMode('all')}
              className={`px-3.5 py-2 min-h-[40px] rounded-lg text-xs font-semibold transition ${
                viewMode === 'all'
                  ? 'bg-slate-900 text-white'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              {t('hearings.allHearings')}
            </button>
            <button
              onClick={() => setViewMode('causelist')}
              className={`px-3.5 py-2 min-h-[40px] rounded-lg text-xs font-semibold transition flex items-center gap-1.5 ${
                viewMode === 'causelist'
                  ? 'bg-indigo-600 text-white shadow-xs'
                  : 'bg-indigo-50 text-indigo-700 hover:bg-indigo-100'
              }`}
            >
              <Calendar className="w-3.5 h-3.5" />
              {t('hearings.causeListDocket')}
            </button>
          </div>

          {viewMode === 'causelist' && (
            <div className="flex items-center gap-1.5 flex-wrap bg-slate-50 p-1 rounded-xl border border-slate-200">
              <button
                type="button"
                onClick={() => handleDateOffset(-1)}
                className="p-1.5 hover:bg-white rounded-lg text-slate-600 transition"
                title={t('hearings.yesterday')}
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={() => setCauseListDate(new Date().toISOString().slice(0, 10))}
                className="px-2.5 py-1 text-xs font-semibold bg-white rounded-lg text-indigo-700 border border-slate-200 hover:bg-indigo-50 transition"
              >
                {t('calendar.today')}
              </button>
              <button
                type="button"
                onClick={() => handleDateOffset(1)}
                className="p-1.5 hover:bg-white rounded-lg text-slate-600 transition"
                title={t('hearings.tomorrow')}
              >
                <ChevronRight className="w-4 h-4" />
              </button>
              <input
                type="date"
                value={causeListDate}
                onChange={(e) => setCauseListDate(e.target.value)}
                className="text-xs font-mono font-semibold bg-white border border-slate-200 rounded-lg px-2.5 py-1 text-slate-800 focus:outline-hidden"
              />
            </div>
          )}

          <div className="text-xs font-semibold text-slate-500 px-3 py-1.5 bg-slate-100 rounded-lg shrink-0 self-start lg:self-center">
            {t('hearings.totalHearings')}: {hearings.length}
          </div>
        </div>

        {/* Multi-Filter Dropdowns */}
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-2.5 pt-2 border-t border-slate-100">
          {/* Status Filter */}
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as 'all' | HearingStatus)}
            className="w-full bg-slate-50 border border-slate-300 text-slate-700 text-xs rounded-lg px-2.5 py-2 min-h-[40px] focus:ring-2 focus:ring-slate-500 focus:outline-hidden"
          >
            <option value="all">{t('common.all')} ({t('common.status')})</option>
            <option value="scheduled">{t('hearings.scheduled')}</option>
            <option value="held">{t('hearings.held')}</option>
            <option value="adjourned">{t('hearings.adjourned')}</option>
            <option value="cancelled">{t('hearings.cancelled')}</option>
          </select>

          {/* Court Filter */}
          <select
            value={courtFilter}
            onChange={(e) => setCourtFilter(e.target.value)}
            className="w-full bg-slate-50 border border-slate-300 text-slate-700 text-xs rounded-lg px-2.5 py-2 min-h-[40px] focus:ring-2 focus:ring-slate-500 focus:outline-hidden"
          >
            <option value="all">{t('hearings.allCourts')}</option>
            {distinctCourts.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>

          {/* Fixed For Purpose Filter */}
          <select
            value={fixedForFilter}
            onChange={(e) => setFixedForFilter(e.target.value)}
            className="w-full bg-slate-50 border border-slate-300 text-slate-700 text-xs rounded-lg px-2.5 py-2 min-h-[40px] focus:ring-2 focus:ring-slate-500 focus:outline-hidden"
          >
            <option value="all">{t('hearings.allFixedFor')}</option>
            {allFixedForOptions.map((opt) => (
              <option key={opt.key} value={opt.key}>
                {currentLang === 'bn' ? opt.labelBn : opt.labelEn}
              </option>
            ))}
          </select>

          {/* Appearing Lawyer Filter */}
          <select
            value={lawyerFilter}
            onChange={(e) => setLawyerFilter(e.target.value)}
            className="w-full bg-slate-50 border border-slate-300 text-slate-700 text-xs rounded-lg px-2.5 py-2 min-h-[40px] focus:ring-2 focus:ring-slate-500 focus:outline-hidden"
          >
            <option value="all">{t('hearings.allLawyers')}</option>
            {lawyers.map((l) => (
              <option key={l.id} value={l.id}>
                {l.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Floating / Sticky Bulk Actions Toolbar (Appears when 1+ rows selected) */}
      {selectedIds.size > 0 && canUpdate && !isReadOnly && (
        <div className="sticky top-4 z-20 flex flex-wrap items-center justify-between gap-3 p-3.5 bg-slate-900 text-white rounded-2xl shadow-xl border border-slate-800 animate-in fade-in slide-in-from-top-2 print:hidden">
          <div className="flex items-center gap-2">
            <span className="w-6 h-6 rounded-full bg-indigo-500 text-white text-xs font-bold flex items-center justify-center">
              {selectedIds.size}
            </span>
            <span className="text-xs font-semibold">
              {t('hearings.selectedCount', { count: selectedIds.size })}
            </span>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <button
              type="button"
              disabled={bulkLoading}
              onClick={handleBulkMarkHeld}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 min-h-[36px] bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold rounded-xl shadow-xs transition disabled:opacity-50"
            >
              <Check className="w-3.5 h-3.5" />
              <span>{t('hearings.markHeld')}</span>
            </button>

            <button
              type="button"
              disabled={bulkLoading}
              onClick={() => setBulkAdjournOpen(true)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 min-h-[36px] bg-amber-600 hover:bg-amber-500 text-white text-xs font-semibold rounded-xl shadow-xs transition disabled:opacity-50"
            >
              <FastForward className="w-3.5 h-3.5" />
              <span>{t('hearings.adjournSelected')}</span>
            </button>

            <button
              type="button"
              disabled={bulkLoading}
              onClick={() => setBulkRescheduleOpen(true)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 min-h-[36px] bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold rounded-xl shadow-xs transition disabled:opacity-50"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>{t('hearings.rescheduleSelected')}</span>
            </button>

            <button
              type="button"
              onClick={handleClearSelection}
              className="inline-flex items-center gap-1 px-2.5 py-1.5 min-h-[36px] bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold rounded-xl transition"
              title={t('hearings.clearSelection')}
            >
              <X className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">{t('hearings.clearSelection')}</span>
            </button>
          </div>
        </div>
      )}

      {/* Official A4 Print Docket Container (Visible only when window.print() is active) */}
      <div className="hidden print:block print:space-y-4">
        <div className="text-center border-b-2 border-slate-900 pb-3 space-y-1">
          <h1 className="text-xl font-bold tracking-tight text-slate-950 uppercase font-serif">
            Rahman &amp; Associates &bull; Chamber Cause List
          </h1>
          <p className="text-xs font-medium text-slate-600 tracking-wider uppercase">
            Supreme Court of Bangladesh &bull; District &amp; Sessions Judge Courts
          </p>
          <div className="pt-2 flex items-center justify-between text-xs font-mono font-semibold border-t border-slate-300 mt-2 px-1">
            <span>
              CAUSE LIST DATE: <strong>{new Date(causeListDate).toLocaleDateString('en-GB', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</strong>
            </span>
            <span>
              TOTAL LISTED MATTERS: <strong>{hearings.length}</strong>
            </span>
          </div>
        </div>

        <table className="w-full text-left text-xs border border-slate-900 divide-y divide-slate-300">
          <thead className="bg-slate-100 text-slate-900 font-bold uppercase text-[10px]">
            <tr>
              <th className="p-2 border-r border-slate-300 text-center w-8">#</th>
              <th className="p-2 border-r border-slate-300 w-36">Court / Bench</th>
              <th className="p-2 border-r border-slate-300 w-40">Case Number</th>
              <th className="p-2 border-r border-slate-300">Parties</th>
              <th className="p-2 border-r border-slate-300 w-44">Date Fixed For</th>
              <th className="p-2 w-48">Bench Order / Notes</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200">
            {hearings.map((h, idx) => {
              const caseRec = casesMap[h.caseId];
              return (
                <tr key={h.id} className="break-inside-avoid">
                  <td className="p-2 border-r border-slate-300 text-center font-mono font-bold">{idx + 1}</td>
                  <td className="p-2 border-r border-slate-300 font-medium">{h.court || caseRec?.court || '—'}</td>
                  <td className="p-2 border-r border-slate-300 font-mono font-bold">
                    {caseRec?.caseNumber || '—'}
                    {caseRec?.fileSerial && <span className="block text-[10px] font-normal text-slate-600">({caseRec.fileSerial})</span>}
                  </td>
                  <td className="p-2 border-r border-slate-300 font-medium">
                    {caseRec ? formatCasePartyTitle(caseRec) : h.purpose}
                  </td>
                  <td className="p-2 border-r border-slate-300">
                    <span className="font-semibold block">{getFixedForLabel(h.fixedFor, currentLang) || h.purpose}</span>
                    {h.fixedForNote && <span className="text-[10px] italic text-slate-600 block">Note: {h.fixedForNote}</span>}
                  </td>
                  <td className="p-2 text-slate-600 text-[11px] italic">
                    {h.outcomeNote || '_______________________________'}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>

        <div className="pt-6 border-t border-slate-300 text-[10px] text-slate-600 flex justify-between items-center">
          <span>Printed on: {new Date().toLocaleString()} &bull; BD Legal Practice Management</span>
          <span>Clerk / Moharrir Signature: _________________________</span>
        </div>
      </div>

      {/* Hearings Interactive List / Table (Hidden on Print) */}
      <div className="print:hidden">
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
                header: (
                  <input
                    type="checkbox"
                    checked={hearings.length > 0 && selectedIds.size === hearings.length}
                    ref={(el) => {
                      if (el) el.indeterminate = selectedIds.size > 0 && selectedIds.size < hearings.length;
                    }}
                    onChange={handleToggleSelectAll}
                    aria-label="Select all hearings"
                    className="w-4 h-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 cursor-pointer"
                  />
                ),
                className: 'w-10 text-center',
                headerClassName: 'w-10 text-center',
                accessor: (h) => (
                  <input
                    type="checkbox"
                    checked={selectedIds.has(h.id)}
                    onChange={(e) => {
                      e.stopPropagation();
                      handleToggleSelect(h.id);
                    }}
                    aria-label={`Select hearing ${h.purpose}`}
                    className="w-4 h-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 cursor-pointer"
                  />
                ),
              },
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
              const isSelected = selectedIds.has(h.id);
              return (
                <div className={`bg-white rounded-xl border p-4 shadow-2xs space-y-3 transition ${
                  isSelected ? 'border-indigo-500 ring-2 ring-indigo-100' : 'border-slate-200'
                }`}>
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-start gap-2.5">
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={(e) => {
                          e.stopPropagation();
                          handleToggleSelect(h.id);
                        }}
                        aria-label={`Select hearing ${h.purpose}`}
                        className="mt-1 w-4 h-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 cursor-pointer shrink-0"
                      />
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
      </div>

      {/* Single-Hearing Modals */}
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

      {/* Bulk Action Modals */}
      <BulkAdjournModal
        isOpen={bulkAdjournOpen}
        onClose={() => setBulkAdjournOpen(false)}
        selectedHearings={selectedHearings}
        onConfirm={handleBulkAdjournConfirm}
      />

      <BulkRescheduleModal
        isOpen={bulkRescheduleOpen}
        onClose={() => setBulkRescheduleOpen(false)}
        selectedHearings={selectedHearings}
        onConfirm={handleBulkRescheduleConfirm}
      />
    </div>
  );
};
