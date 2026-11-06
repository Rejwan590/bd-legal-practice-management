import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../foundation/AuthContext';
import { useNavigation } from '../foundation/NavigationContext';
import { getRepositories } from '../../data/repositories';
import {
  CalendarEventRecord,
  CalendarEventType,
  ReminderRecord,
} from '../../data/types';
import { EntityLink } from '../../components/EntityLink';
import {
  Calendar as CalendarIcon,
  ChevronLeft,
  ChevronRight,
  Clock,
  Printer,
  Bell,
  CheckCircle2,
  RefreshCw,
  Building,
  User,
  MapPin,
  List,
  Grid,
  FileText,
  Plus,
  Edit2,
  ChevronDown,
  ChevronUp,
  CalendarDays,
  CalendarRange,
} from 'lucide-react';
import { DailyCauseListModal } from './DailyCauseListModal';
import { CalendarWeekView } from './CalendarWeekView';
import { CalendarDayView } from './CalendarDayView';
import { getFixedForLabel } from '../../data/hearingFixedFor';
import {
  getDhakaDateString,
  formatLocalDateKey,
  parseLocalDateKey,
  navigateDate,
  getCalendarRangeLabel,
} from '../../utils/dateUtils';

export const CalendarScreen: React.FC = () => {
  const { t, i18n } = useTranslation();
  const { currentUser, can, isReadOnly } = useAuth();
  const {
    refreshVersion,
    triggerRefresh,
    selectedCalendarDate,
    setSelectedCalendarDate,
    openCaseDossier,
    openHearingForm,
    openTaskForm,
    openEntityModalById,
  } = useNavigation();
  const repos = getRepositories();

  const [currentDate, setCurrentDate] = useState(() => new Date());
  const [selectedDateStr, setSelectedDateStrLocal] = useState(
    () => selectedCalendarDate || formatLocalDateKey(new Date())
  );
  const [expandedDateStr, setExpandedDateStr] = useState<string | null>(null);
  const setSelectedDateStr = useCallback(
    (d: string) => {
      setSelectedDateStrLocal(d);
      setSelectedCalendarDate(d);
    },
    [setSelectedCalendarDate]
  );
  const [viewMode, setViewMode] = useState<'month' | 'week' | 'day' | 'agenda' | 'causelist'>('month');
  const [typeFilter, setTypeFilter] = useState<CalendarEventType | 'all'>('all');

  const [events, setEvents] = useState<CalendarEventRecord[]>([]);
  const [dueReminders, setDueReminders] = useState<ReminderRecord[]>([]);
  const [, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [firmName, setFirmName] = useState('Rahman & Associates Chambers');

  const [causeListModalOpen, setCauseListModalOpen] = useState(false);
  const [toastMsg, setToastMsg] = useState<string | null>(null);
  const [overdueUserToggled, setOverdueUserToggled] = useState<boolean | null>(null);

  const todayDhakaStr = getDhakaDateString();
  const currentReminders = useMemo(
    () => dueReminders.filter((r) => getDhakaDateString(r.dueAt) >= todayDhakaStr),
    [dueReminders, todayDhakaStr]
  );
  const overdueReminders = useMemo(
    () => dueReminders.filter((r) => getDhakaDateString(r.dueAt) < todayDhakaStr),
    [dueReminders, todayDhakaStr]
  );
  const isOverdueExpanded =
    overdueUserToggled !== null ? overdueUserToggled : overdueReminders.length <= 5;

  const showToast = (msg: string) => {
    setToastMsg(msg);
    setTimeout(() => setToastMsg(null), 3500);
  };

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      const [allEvents, remindersData, firmRec] = await Promise.all([
        repos.calendar.getEvents({ currentUser }),
        repos.reminder.getDueReminders({ currentUser }),
        repos.firm.getFirm({ currentUser }),
      ]);

      setEvents(Array.isArray(allEvents) ? allEvents : []);
      setDueReminders(Array.isArray(remindersData) ? remindersData : []);
      if (firmRec?.name) {
        setFirmName(firmRec.name);
      }
    } catch (err: unknown) {
      console.error('Failed to load calendar data:', err);
    } finally {
      setLoading(false);
    }
  }, [currentUser, repos]);

  useEffect(() => {
    loadData();
  }, [loadData, refreshVersion]);

  // Sync reminders
  const handleSyncReminders = async () => {
    try {
      setSyncing(true);
      await repos.reminder.syncReminders({ currentUser });
      showToast(t('reminders.syncSuccess'));
      triggerRefresh();
    } catch (err: unknown) {
      console.error('Failed to sync reminders:', err);
    } finally {
      setSyncing(false);
    }
  };

  // Dismiss a reminder
  const handleDismissReminder = async (id: string) => {
    try {
      await repos.reminder.dismiss({ currentUser }, id);
      showToast(t('reminders.dismissed'));
      setDueReminders((prev) => prev.filter((r) => r.id !== id));
      triggerRefresh();
    } catch (err: unknown) {
      console.error('Failed to dismiss reminder:', err);
    }
  };

  const handleEventClick = (ev: CalendarEventRecord) => {
    if (ev.type === 'hearing') {
      if (ev.caseId) {
        openCaseDossier(ev.caseId, 'hearings');
      } else {
        openEntityModalById('hearing', ev.sourceId);
      }
    } else if (ev.type === 'task') {
      openEntityModalById('task', ev.sourceId);
    } else if (ev.type === 'file_return') {
      openEntityModalById('file', ev.sourceId);
    }
  };

  // Unified date navigation for all views
  const handlePrevious = () => {
    const { newDateStr, newCurrentDate } = navigateDate(selectedDateStr, viewMode, 'prev');
    setSelectedDateStr(newDateStr);
    setCurrentDate(newCurrentDate);
    setExpandedDateStr(null);
  };

  const handleNext = () => {
    const { newDateStr, newCurrentDate } = navigateDate(selectedDateStr, viewMode, 'next');
    setSelectedDateStr(newDateStr);
    setCurrentDate(newCurrentDate);
    setExpandedDateStr(null);
  };

  const goToToday = () => {
    const today = new Date();
    setCurrentDate(today);
    setSelectedDateStr(formatLocalDateKey(today));
    setExpandedDateStr(null);
  };

  // Month grid calculations
  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();

  const monthName = currentDate.toLocaleString('default', { month: 'long', year: 'numeric' });

  useEffect(() => {
    setExpandedDateStr(null);
  }, [typeFilter]);

  // Filter events by type
  const filteredEvents = useMemo(() => {
    if (typeFilter === 'all') return events;
    return events.filter((e) => e.type === typeFilter);
  }, [events, typeFilter]);

  // Events map by Date YYYY-MM-DD
  const eventsByDate = useMemo(() => {
    const map = new Map<string, CalendarEventRecord[]>();
    filteredEvents.forEach((ev) => {
      const dateKey = ev.date.slice(0, 10);
      const existing = map.get(dateKey) || [];
      existing.push(ev);
      map.set(dateKey, existing);
    });
    return map;
  }, [filteredEvents]);

  // Agenda month scoping and sorting (date then type)
  const agendaEvents = useMemo(() => {
    const currentMonthKey = selectedDateStr.slice(0, 7);
    return filteredEvents
      .filter((ev) => ev.date.slice(0, 7) === currentMonthKey)
      .sort((a, b) => {
        const dateComp = a.date.localeCompare(b.date);
        if (dateComp !== 0) return dateComp;
        const typeOrder: Record<string, number> = { hearing: 1, task: 2, file_return: 3 };
        return (typeOrder[a.type] || 99) - (typeOrder[b.type] || 99);
      });
  }, [filteredEvents, selectedDateStr]);

  const agendaGroupedByDate = useMemo(() => {
    const map = new Map<string, CalendarEventRecord[]>();
    agendaEvents.forEach((ev) => {
      const dateKey = ev.date.slice(0, 10);
      const list = map.get(dateKey) || [];
      list.push(ev);
      map.set(dateKey, list);
    });
    return Array.from(map.entries());
  }, [agendaEvents]);

  // Days in calendar month grid
  const daysInMonthGrid = useMemo(() => {
    const firstDayOfMonth = new Date(year, month, 1).getDay(); // 0 = Sun
    const daysInCurrentMonth = new Date(year, month + 1, 0).getDate();
    const daysInPrevMonth = new Date(year, month, 0).getDate();

    const days: { date: Date; dateStr: string; isCurrentMonth: boolean }[] = [];

    // Prev month padding
    for (let i = firstDayOfMonth - 1; i >= 0; i--) {
      const d = new Date(year, month - 1, daysInPrevMonth - i);
      days.push({
        date: d,
        dateStr: formatLocalDateKey(d),
        isCurrentMonth: false,
      });
    }

    // Current month days
    for (let i = 1; i <= daysInCurrentMonth; i++) {
      const d = new Date(year, month, i);
      days.push({
        date: d,
        dateStr: formatLocalDateKey(d),
        isCurrentMonth: true,
      });
    }

    // Next month padding to fill complete grid of 35 or 42
    const remaining = (7 - (days.length % 7)) % 7;
    for (let i = 1; i <= remaining; i++) {
      const d = new Date(year, month + 1, i);
      days.push({
        date: d,
        dateStr: formatLocalDateKey(d),
        isCurrentMonth: false,
      });
    }

    return days;
  }, [year, month]);

  // Selected date events
  const selectedDateEvents = useMemo(() => {
    return eventsByDate.get(selectedDateStr) || [];
  }, [eventsByDate, selectedDateStr]);

  // Hearings for cause list on selected date
  const selectedDateHearings = useMemo(() => {
    const all = eventsByDate.get(selectedDateStr) || [];
    return all.filter((e) => e.type === 'hearing');
  }, [eventsByDate, selectedDateStr]);

  // Metrics
  const summaryCounts = useMemo(() => {
    let hearings = 0;
    let tasks = 0;
    let files = 0;
    events.forEach((e) => {
      if (e.type === 'hearing') hearings++;
      if (e.type === 'task') tasks++;
      if (e.type === 'file_return') files++;
    });
    return { hearings, tasks, files };
  }, [events]);

  const todayStr = formatLocalDateKey(new Date());

  return (
    <div className="space-y-4 w-full">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200 pb-5">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
            <CalendarIcon className="w-6 h-6 text-indigo-600" />
            {t('calendar.title')}
          </h1>
          <p className="text-xs text-slate-500 mt-1">{t('calendar.subtitle')}</p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <button
            type="button"
            onClick={handleSyncReminders}
            disabled={syncing}
            className="inline-flex items-center justify-center gap-1.5 px-3.5 py-2 min-h-[44px] bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-semibold transition disabled:opacity-50"
            title="Scan matters and update scheduled reminders"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${syncing ? 'animate-spin' : ''}`} />
            {t('reminders.syncNow')}
          </button>

          <button
            type="button"
            onClick={() => setCauseListModalOpen(true)}
            className="inline-flex items-center justify-center gap-1.5 px-4 py-2 min-h-[44px] bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-semibold shadow-xs transition"
          >
            <Printer className="w-4 h-4" />
            {t('calendar.printCauseList')}
          </button>
        </div>
      </div>

      {/* Toast */}
      {toastMsg && (
        <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-emerald-800 text-xs flex items-center gap-2 font-medium">
          <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
          <span>{toastMsg}</span>
        </div>
      )}

      {/* Due / Pending Reminders Inbox Banner */}
      {dueReminders.length > 0 && (
        <div className="bg-gradient-to-r from-amber-50 to-orange-50 border border-amber-200 rounded-2xl p-4 shadow-2xs space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-lg bg-amber-500 text-white flex items-center justify-center animate-pulse">
                <Bell className="w-4 h-4" />
              </div>
              <div>
                <h3 className="font-bold text-xs text-amber-950 uppercase tracking-wide">
                  {t('reminders.dueReminders')} ({dueReminders.length})
                </h3>
                <span className="text-[11px] text-amber-800">
                  {t('calendar.immediateAttention')}
                </span>
              </div>
            </div>
          </div>

          {/* Current and Upcoming Reminders */}
          {currentReminders.length > 0 && (
            <div className="space-y-2">
              <span className="text-[11px] font-bold text-amber-900 uppercase tracking-wider block">
                {t('reminders.currentAndUpcoming')} ({currentReminders.length})
              </span>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
                {currentReminders.map((rem) => (
                  <div
                    key={rem.id}
                    className="bg-white/90 backdrop-blur-xs p-3 rounded-xl border border-amber-200/80 shadow-2xs flex items-start justify-between gap-3 text-xs"
                  >
                    <div className="space-y-1">
                      <div className="flex items-center gap-1.5">
                        {rem.sourceType === 'hearing' && (
                          <span className="text-[10px] font-bold px-1.5 py-0.2 rounded bg-indigo-100 text-indigo-800">
                            {t('calendar.hearingBadge')}
                          </span>
                        )}
                        {rem.sourceType === 'task' && (
                          <span className="text-[10px] font-bold px-1.5 py-0.2 rounded bg-amber-100 text-amber-900">
                            {t('calendar.taskDeadlineBadge')}
                          </span>
                        )}
                        {rem.sourceType === 'file_return' && (
                          <span className="text-[10px] font-bold px-1.5 py-0.2 rounded bg-rose-100 text-rose-800">
                            {t('calendar.fileReturnBadge')}
                          </span>
                        )}
                        <span className="font-bold text-slate-900 line-clamp-1">{rem.title}</span>
                      </div>
                      {rem.description && (
                        <p className="text-[11px] text-slate-600 line-clamp-2">{rem.description}</p>
                      )}
                      <span className="text-[10px] font-mono text-slate-400 block">
                        Due: {new Date(rem.dueAt).toLocaleString()}
                      </span>
                    </div>

                    <button
                      type="button"
                      onClick={() => handleDismissReminder(rem.id)}
                      className="px-3 py-1.5 min-h-[44px] text-xs font-semibold text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-xl transition shrink-0 flex items-center justify-center cursor-pointer"
                    >
                      {t('reminders.dismiss')}
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Overdue Reminders Collapsible Section */}
          {overdueReminders.length > 0 && (
            <div className="border border-rose-200 bg-rose-50/70 rounded-xl overflow-hidden mt-2">
              <button
                type="button"
                onClick={() => setOverdueUserToggled(!isOverdueExpanded)}
                className="w-full px-3.5 py-2.5 flex items-center justify-between text-xs font-bold text-rose-900 hover:bg-rose-100/60 transition min-h-[44px] cursor-pointer"
              >
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-rose-600 animate-pulse" />
                  <span>{t('reminders.overdue')}</span>
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-rose-600 text-white">
                    {overdueReminders.length}
                  </span>
                </div>
                <div className="flex items-center gap-1 text-[11px] text-rose-700">
                  <span>{isOverdueExpanded ? t('reminders.hideOverdue') : t('reminders.showOverdue')}</span>
                  {isOverdueExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                </div>
              </button>
              {isOverdueExpanded && (
                <div className="p-3 border-t border-rose-200 grid grid-cols-1 md:grid-cols-2 gap-2.5 bg-white/70">
                  {overdueReminders.map((rem) => (
                    <div
                      key={rem.id}
                      className="bg-white/90 backdrop-blur-xs p-3 rounded-xl border border-rose-200/80 shadow-2xs flex items-start justify-between gap-3 text-xs"
                    >
                      <div className="space-y-1">
                        <div className="flex items-center gap-1.5">
                          {rem.sourceType === 'hearing' && (
                            <span className="text-[10px] font-bold px-1.5 py-0.2 rounded bg-indigo-100 text-indigo-800">
                              {t('calendar.hearingBadge')}
                            </span>
                          )}
                          {rem.sourceType === 'task' && (
                            <span className="text-[10px] font-bold px-1.5 py-0.2 rounded bg-amber-100 text-amber-900">
                              {t('calendar.taskDeadlineBadge')}
                            </span>
                          )}
                          {rem.sourceType === 'file_return' && (
                            <span className="text-[10px] font-bold px-1.5 py-0.2 rounded bg-rose-100 text-rose-800">
                              {t('calendar.fileReturnBadge')}
                            </span>
                          )}
                          <span className="font-bold text-slate-900 line-clamp-1">{rem.title}</span>
                        </div>
                        {rem.description && (
                          <p className="text-[11px] text-slate-600 line-clamp-2">{rem.description}</p>
                        )}
                        <span className="text-[10px] font-mono text-rose-700 font-semibold block">
                          Due: {new Date(rem.dueAt).toLocaleString()}
                        </span>
                      </div>

                      <button
                        type="button"
                        onClick={() => handleDismissReminder(rem.id)}
                        className="px-3 py-1.5 min-h-[44px] text-xs font-semibold text-rose-700 hover:text-rose-900 hover:bg-rose-100 rounded-xl transition shrink-0 flex items-center justify-center cursor-pointer"
                      >
                        {t('reminders.dismiss')}
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Control Bar: View Switcher, Filter Pills, and Unified Date Navigator */}
      <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-4">
        {/* Left: View Mode Toggle */}
        <div className="flex items-center bg-slate-100 p-1 rounded-xl w-full sm:w-auto overflow-x-auto gap-1">
          <button
            type="button"
            onClick={() => {
              setViewMode('month');
              setExpandedDateStr(null);
            }}
            className={`flex-1 sm:flex-initial flex items-center justify-center gap-1.5 px-3 py-2 min-h-[44px] rounded-lg text-xs font-semibold whitespace-nowrap transition ${
              viewMode === 'month'
                ? 'bg-white text-slate-900 shadow-2xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Grid className="w-3.5 h-3.5" />
            <span>{t('calendar.viewMonth')}</span>
          </button>
          <button
            type="button"
            onClick={() => {
              setViewMode('week');
              setExpandedDateStr(null);
            }}
            className={`flex-1 sm:flex-initial flex items-center justify-center gap-1.5 px-3 py-2 min-h-[44px] rounded-lg text-xs font-semibold whitespace-nowrap transition ${
              viewMode === 'week'
                ? 'bg-white text-slate-900 shadow-2xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <CalendarRange className="w-3.5 h-3.5" />
            <span>{t('calendar.viewWeek')}</span>
          </button>
          <button
            type="button"
            onClick={() => {
              setViewMode('day');
              setExpandedDateStr(null);
            }}
            className={`flex-1 sm:flex-initial flex items-center justify-center gap-1.5 px-3 py-2 min-h-[44px] rounded-lg text-xs font-semibold whitespace-nowrap transition ${
              viewMode === 'day'
                ? 'bg-white text-slate-900 shadow-2xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <CalendarDays className="w-3.5 h-3.5" />
            <span>{t('calendar.viewDay')}</span>
          </button>
          <button
            type="button"
            onClick={() => {
              setViewMode('agenda');
              setExpandedDateStr(null);
            }}
            className={`flex-1 sm:flex-initial flex items-center justify-center gap-1.5 px-3 py-2 min-h-[44px] rounded-lg text-xs font-semibold whitespace-nowrap transition ${
              viewMode === 'agenda'
                ? 'bg-white text-slate-900 shadow-2xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <List className="w-3.5 h-3.5" />
            <span>{t('calendar.viewAgenda')}</span>
          </button>
          <button
            type="button"
            onClick={() => {
              setViewMode('causelist');
              setExpandedDateStr(null);
            }}
            className={`flex-1 sm:flex-initial flex items-center justify-center gap-1.5 px-3 py-2 min-h-[44px] rounded-lg text-xs font-semibold whitespace-nowrap transition ${
              viewMode === 'causelist'
                ? 'bg-white text-slate-900 shadow-2xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <FileText className="w-3.5 h-3.5" />
            <span>{t('calendar.viewCauseList')}</span>
          </button>
        </div>

        {/* Center: Unified Date Navigator */}
        <div className="flex items-center justify-center gap-2 sm:gap-3 flex-wrap sm:flex-nowrap">
          <button
            type="button"
            onClick={handlePrevious}
            className="p-2 min-h-[44px] min-w-[44px] flex items-center justify-center rounded-xl border border-slate-200 hover:bg-slate-50 text-slate-600 transition"
            aria-label={viewMode === 'month' ? 'Previous Month' : viewMode === 'week' ? 'Previous Week' : viewMode === 'day' ? 'Previous Day' : 'Previous'}
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <span className="font-bold text-sm text-slate-900 min-w-44 text-center select-none">
            {getCalendarRangeLabel(selectedDateStr, viewMode, i18n.language === 'bn' ? 'bn' : 'en')}
          </span>
          <button
            type="button"
            onClick={handleNext}
            className="p-2 min-h-[44px] min-w-[44px] flex items-center justify-center rounded-xl border border-slate-200 hover:bg-slate-50 text-slate-600 transition"
            aria-label={viewMode === 'month' ? 'Next Month' : viewMode === 'week' ? 'Next Week' : viewMode === 'day' ? 'Next Day' : 'Next'}
          >
            <ChevronRight className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={goToToday}
            className="px-3 py-2 min-h-[44px] text-xs font-semibold text-indigo-700 bg-indigo-50 hover:bg-indigo-100 rounded-xl transition flex items-center justify-center"
          >
            {t('calendar.today')}
          </button>
        </div>

        {/* Right: Type Filter Pills */}
        <div className="flex items-center gap-1.5 flex-wrap">
          <button
            type="button"
            onClick={() => setTypeFilter('all')}
            className={`px-3 py-2 min-h-[44px] rounded-xl text-xs font-semibold transition flex items-center justify-center ${
              typeFilter === 'all'
                ? 'bg-slate-900 text-white'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            {t('calendar.allEvents')}
          </button>
          <button
            type="button"
            onClick={() => setTypeFilter('hearing')}
            className={`px-3 py-2 min-h-[44px] rounded-xl text-xs font-semibold transition flex items-center justify-center ${
              typeFilter === 'hearing'
                ? 'bg-indigo-600 text-white'
                : 'bg-indigo-50 text-indigo-800 hover:bg-indigo-100'
            }`}
          >
            {t('calendar.hearingsOnly')} ({summaryCounts.hearings})
          </button>
          <button
            type="button"
            onClick={() => setTypeFilter('task')}
            className={`px-3 py-2 min-h-[44px] rounded-xl text-xs font-semibold transition flex items-center justify-center ${
              typeFilter === 'task'
                ? 'bg-amber-600 text-white'
                : 'bg-amber-50 text-amber-900 hover:bg-amber-100'
            }`}
          >
            {t('calendar.tasksOnly')} ({summaryCounts.tasks})
          </button>
          <button
            type="button"
            onClick={() => setTypeFilter('file_return')}
            className={`px-3 py-2 min-h-[44px] rounded-xl text-xs font-semibold transition flex items-center justify-center ${
              typeFilter === 'file_return'
                ? 'bg-emerald-600 text-white'
                : 'bg-emerald-50 text-emerald-800 hover:bg-emerald-100'
            }`}
          >
            {t('calendar.filesOnly')} ({summaryCounts.files})
          </button>
        </div>
      </div>

      {/* Main Content Areas */}
      {viewMode === 'month' && (
        <div className="space-y-6">
          {/* Calendar Grid Container */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
            {/* Days of week header */}
            <div className="grid grid-cols-7 border-b border-slate-200 bg-slate-50 text-center text-[10px] sm:text-xs font-bold text-slate-600 uppercase tracking-wider py-2.5">
              <span>{t('calendar.daysSun')}</span>
              <span>{t('calendar.daysMon')}</span>
              <span>{t('calendar.daysTue')}</span>
              <span>{t('calendar.daysWed')}</span>
              <span>{t('calendar.daysThu')}</span>
              <span>{t('calendar.daysFri')}</span>
              <span>{t('calendar.daysSat')}</span>
            </div>

            {/* Calendar Cells */}
            <div className="grid grid-cols-7 divide-x divide-y divide-slate-100">
              {daysInMonthGrid.map((dayObj, idx) => {
                const dayEvents = eventsByDate.get(dayObj.dateStr) || [];
                const isSelected = dayObj.dateStr === selectedDateStr;
                const isToday = dayObj.dateStr === todayStr;

                return (
                  <div
                    key={idx}
                    onClick={() => setSelectedDateStr(dayObj.dateStr)}
                    className={`min-h-[56px] sm:min-h-[105px] p-1 sm:p-2 flex flex-col justify-between transition cursor-pointer select-none ${
                      !dayObj.isCurrentMonth
                        ? 'bg-slate-50/50 text-slate-400'
                        : 'bg-white hover:bg-slate-50/80'
                    } ${isSelected ? 'ring-2 ring-indigo-600 ring-inset bg-indigo-50/20' : ''}`}
                  >
                    {/* Top Day Number & Badges */}
                    <div className="flex items-center justify-between">
                      <span
                        className={`text-xs font-semibold w-5 h-5 sm:w-6 sm:h-6 flex items-center justify-center rounded-full ${
                          isToday
                            ? 'bg-indigo-600 text-white font-bold'
                            : isSelected
                            ? 'text-indigo-700 font-bold'
                            : 'text-slate-700'
                        }`}
                      >
                        {dayObj.date.getDate()}
                      </span>

                      {dayEvents.length > 0 && (
                        <span className="text-[10px] font-mono px-1 sm:px-1.5 py-0.2 rounded-full bg-slate-100 text-slate-600 font-bold">
                          {dayEvents.length}
                        </span>
                      )}
                    </div>

                    {/* Mobile: Event colored dots (< sm) */}
                    {dayEvents.length > 0 && (
                      <div className="flex sm:hidden items-center justify-center gap-1 mt-1">
                        {dayEvents.slice(0, 3).map((ev) => (
                          <span
                            key={ev.id}
                            className={`w-1.5 h-1.5 rounded-full ${
                              ev.type === 'hearing'
                                ? 'bg-indigo-600'
                                : ev.type === 'task'
                                ? 'bg-amber-600'
                                : 'bg-emerald-600'
                            }`}
                          />
                        ))}
                      </div>
                    )}

                    {/* Desktop / Tablet Event Mini Badges (>= sm) */}
                    {(() => {
                      const isExpanded = dayObj.dateStr === expandedDateStr;
                      const visibleEvents = isExpanded ? dayEvents : dayEvents.slice(0, 3);
                      const hiddenCount = dayEvents.length - 3;

                      return (
                        <div className="hidden sm:block space-y-1 mt-1">
                          {visibleEvents.map((ev) => (
                            <div
                              key={ev.id}
                              data-testid={`calendar-grid-event-${ev.sourceId}`}
                              onClick={(e) => {
                                e.stopPropagation();
                                handleEventClick(ev);
                              }}
                              className={`text-[10px] font-medium px-1.5 py-0.5 rounded truncate border cursor-pointer hover:opacity-85 ${
                                ev.type === 'hearing'
                                  ? 'bg-indigo-50 text-indigo-900 border-indigo-200'
                                  : ev.type === 'task'
                                  ? 'bg-amber-50 text-amber-900 border-amber-200'
                                  : 'bg-emerald-50 text-emerald-900 border-emerald-200'
                              }`}
                              title={ev.title}
                            >
                              {ev.type === 'hearing' ? '⚖️ ' : ev.type === 'task' ? '📋 ' : '📁 '}
                              {ev.caseNumber || ev.title}
                            </div>
                          ))}

                          {/* When collapsed and more than 3 events, show interactive +N more button */}
                          {!isExpanded && hiddenCount > 0 && (
                            <button
                              type="button"
                              data-testid={`calendar-expand-more-${dayObj.dateStr}`}
                              aria-expanded={false}
                              aria-label={`Show ${hiddenCount} more matters on ${dayObj.date.getDate()} ${monthName.split(' ')[0]}`}
                              onClick={(e) => {
                                e.stopPropagation();
                                setExpandedDateStr(dayObj.dateStr);
                              }}
                              className="w-full flex items-center justify-end px-1 py-0.5 min-h-[28px] text-[10px] font-bold text-indigo-600 hover:text-indigo-800 hover:bg-indigo-50/70 rounded focus-visible:outline-hidden focus-visible:ring-1 focus-visible:ring-indigo-500 transition text-right"
                            >
                              {t('calendar.moreCount', { count: hiddenCount })}
                            </button>
                          )}

                          {/* When expanded, show Show Less button at the bottom */}
                          {isExpanded && hiddenCount > 0 && (
                            <button
                              type="button"
                              data-testid={`calendar-show-less-${dayObj.dateStr}`}
                              aria-expanded={true}
                              aria-label={`Show less matters on ${dayObj.date.getDate()} ${monthName.split(' ')[0]}`}
                              onClick={(e) => {
                                e.stopPropagation();
                                setExpandedDateStr(null);
                              }}
                              className="w-full flex items-center justify-center gap-1 px-1 py-0.5 min-h-[28px] text-[10px] font-semibold text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded focus-visible:outline-hidden focus-visible:ring-1 focus-visible:ring-indigo-500 transition border border-dashed border-slate-200 mt-1"
                            >
                              <ChevronUp className="w-3 h-3 text-slate-500" />
                              <span>{t('calendar.showLess')}</span>
                            </button>
                          )}
                        </div>
                      );
                    })()}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Selected Date Agenda Details */}
          <div className="bg-white rounded-2xl border border-slate-200 p-4 sm:p-5 shadow-xs space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-indigo-50 text-indigo-700 flex items-center justify-center shrink-0">
                  <CalendarIcon className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-bold text-sm text-slate-900">
                    {t('calendar.scheduleFor', {
                      date: new Date(selectedDateStr).toLocaleDateString(i18n.language === 'bn' ? 'bn-BD' : 'en-GB', {
                        weekday: 'long',
                        day: 'numeric',
                        month: 'long',
                        year: 'numeric',
                      }),
                    })}
                  </h3>
                  <span className="text-[11px] text-slate-500 font-mono">
                    {t('calendar.totalMattersCount', { count: selectedDateEvents.length })}
                  </span>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                {can('hearings.update') && (
                  <button
                    type="button"
                    disabled={isReadOnly}
                    data-testid="calendar-add-hearing-btn"
                    onClick={() => openHearingForm({ defaultDate: selectedDateStr })}
                    className="inline-flex items-center gap-1 px-3 py-2 min-h-[38px] bg-indigo-50 hover:bg-indigo-100 text-indigo-700 rounded-xl text-xs font-semibold transition disabled:opacity-40"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>{t('hearings.addHearing')}</span>
                  </button>
                )}

                {can('tasks.assign') && (
                  <button
                    type="button"
                    disabled={isReadOnly}
                    data-testid="calendar-add-task-btn"
                    onClick={() => openTaskForm({ defaultDueDate: selectedDateStr })}
                    className="inline-flex items-center gap-1 px-3 py-2 min-h-[38px] bg-amber-50 hover:bg-amber-100 text-amber-800 rounded-xl text-xs font-semibold transition disabled:opacity-40"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>{t('tasks.addTask')}</span>
                  </button>
                )}

                {selectedDateHearings.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setCauseListModalOpen(true)}
                    className="inline-flex items-center justify-center gap-1.5 px-3.5 py-2 min-h-[38px] bg-slate-900 text-white rounded-xl text-xs font-semibold hover:bg-slate-800 transition"
                  >
                    <Printer className="w-3.5 h-3.5" />
                    <span>{t('calendar.printCauseList')} ({selectedDateHearings.length})</span>
                  </button>
                )}
              </div>
            </div>

            {selectedDateEvents.length === 0 ? (
              <p className="text-xs text-slate-400 italic py-6 text-center">
                {t('calendar.noEventsForDay')}
              </p>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {selectedDateEvents.map((ev) => (
                  <div
                    key={ev.id}
                    data-testid={`calendar-event-card-${ev.sourceId}`}
                    onClick={() => handleEventClick(ev)}
                    className={`p-3.5 rounded-xl border space-y-2 cursor-pointer transition hover:shadow-xs ${
                      ev.type === 'hearing'
                        ? 'border-indigo-200 bg-indigo-50/20 hover:border-indigo-300'
                        : ev.type === 'task'
                        ? 'border-amber-200 bg-amber-50/20 hover:border-amber-300'
                        : 'border-emerald-200 bg-emerald-50/20 hover:border-emerald-300'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span
                        className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider ${
                          ev.type === 'hearing'
                            ? 'bg-indigo-100 text-indigo-900'
                            : ev.type === 'task'
                            ? 'bg-amber-100 text-amber-900'
                            : 'bg-emerald-100 text-emerald-900'
                        }`}
                      >
                        {ev.type === 'hearing'
                          ? t('calendar.courtHearingBadge')
                          : ev.type === 'task'
                          ? t('calendar.chamberTaskBadge')
                          : t('calendar.physicalFileReturnBadge')}
                      </span>

                      <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                        <span className="text-[11px] font-mono text-slate-500 flex items-center gap-1">
                          <Clock className="w-3 h-3 text-slate-400" />
                          {new Date(ev.date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </span>
                        {!isReadOnly && (
                          <button
                            type="button"
                            onClick={() =>
                              openEntityModalById(
                                ev.type === 'file_return' ? 'file' : ev.type,
                                ev.sourceId
                              )
                            }
                            className="p-1 rounded-md bg-white border border-slate-200 text-slate-600 hover:text-slate-900"
                            title={t('common.edit')}
                          >
                            <Edit2 className="w-3 h-3" />
                          </button>
                        )}
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-2" onClick={(e) => e.stopPropagation()}>
                      {ev.type === 'hearing' && ev.caseId ? (
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <EntityLink
                            type="hearing"
                            id={ev.sourceId}
                            caseId={ev.caseId}
                            caseTab="hearings"
                            label={ev.title}
                            restricted={ev.restricted}
                            className="font-bold text-xs"
                          />
                          {ev.fixedFor && (
                            <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-blue-50 text-blue-700 border border-blue-200">
                              {getFixedForLabel(ev.fixedFor, i18n.language === 'bn' ? 'bn' : 'en')}
                              {ev.fixedForNote ? ` (${ev.fixedForNote})` : ''}
                            </span>
                          )}
                        </div>
                      ) : (
                        <EntityLink
                          type={ev.type === 'file_return' ? 'file' : ev.type}
                          id={ev.sourceId}
                          caseId={ev.caseId}
                          mode="modal"
                          label={ev.title}
                          restricted={ev.restricted}
                          className="font-bold text-xs"
                        />
                      )}
                    </div>

                    <div className="text-[11px] text-slate-600 space-y-1">
                      {ev.caseId && ev.caseNumber && (
                        <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                          <EntityLink
                            type="case"
                            id={ev.caseId}
                            caseTab={ev.type === 'hearing' ? 'hearings' : 'overview'}
                            label={ev.caseNumber}
                            restricted={ev.restricted}
                            showIcon
                            className="text-[11px]"
                          />
                        </div>
                      )}
                      {ev.court && (
                        <div className="flex items-center gap-1">
                          <Building className="w-3 h-3 text-slate-400" />
                          <span>{t('calendar.courtPrefix', { court: ev.court })}</span>
                        </div>
                      )}
                      {ev.clientName && (
                        <div className="flex items-center gap-1">
                          <User className="w-3 h-3 text-slate-400" />
                          <span>{t('calendar.clientPrefix', { name: ev.clientName })}</span>
                        </div>
                      )}
                      {ev.assigneeName && (
                        <div className="flex items-center gap-1">
                          <User className="w-3 h-3 text-slate-400" />
                          <span>{t('calendar.advocatePrefix', { name: ev.assigneeName })}</span>
                        </div>
                      )}
                      {ev.shelfLocation && (
                        <div className="flex items-center gap-1">
                          <MapPin className="w-3 h-3 text-slate-400" />
                          <span>{t('calendar.locationPrefix', { location: ev.shelfLocation })}</span>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Week View */}
      {viewMode === 'week' && (
        <CalendarWeekView
          events={filteredEvents}
          selectedDateStr={selectedDateStr}
          onEventClick={handleEventClick}
          onSelectDate={(dateStr) => {
            setSelectedDateStr(dateStr);
            setCurrentDate(parseLocalDateKey(dateStr));
          }}
        />
      )}

      {/* Day View */}
      {viewMode === 'day' && (
        <CalendarDayView
          events={filteredEvents}
          selectedDateStr={selectedDateStr}
          onEventClick={handleEventClick}
          openHearingForm={openHearingForm}
          openTaskForm={openTaskForm}
          onPrintCauseList={() => setCauseListModalOpen(true)}
          canAddHearing={can('hearings.update')}
          canAddTask={can('tasks.assign')}
          isReadOnly={isReadOnly}
          openEntityModalById={openEntityModalById}
        />
      )}

      {/* Agenda / Chronological Timeline View */}
      {viewMode === 'agenda' && (
        <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs space-y-4">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <h3 className="font-bold text-sm text-slate-900">
              {t('calendar.docketTitle')}
            </h3>
            <span className="text-xs text-slate-500 font-mono">
              {t('calendar.totalListedCount', { count: agendaEvents.length })}
            </span>
          </div>

          {agendaEvents.length === 0 ? (
            <p className="text-xs text-slate-400 italic py-10 text-center">
              {t('calendar.noEventsForMonth')}
            </p>
          ) : (
            <div className="space-y-6">
              {agendaGroupedByDate.map(([dateKey, dayEvs]) => (
                <div key={dateKey} className="space-y-2">
                  <div className="flex items-center gap-2 pb-1.5 border-b border-slate-100">
                    <span className="font-bold text-xs text-slate-800">
                      {parseLocalDateKey(dateKey).toLocaleDateString(i18n.language === 'bn' ? 'bn-BD' : 'en-GB', {
                        weekday: 'long',
                        day: 'numeric',
                        month: 'short',
                        year: 'numeric',
                      })}
                    </span>
                    <span className="text-[10px] text-slate-400 font-mono">
                      ({dayEvs.length})
                    </span>
                  </div>
                  <div className="divide-y divide-slate-100 space-y-1">
                    {dayEvs.map((ev) => (
                      <div
                        key={ev.id}
                        onClick={() => handleEventClick(ev)}
                        className="py-3 px-2 hover:bg-slate-50/70 rounded-xl transition flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs cursor-pointer"
                      >
                        <div className="space-y-1">
                          <div className="flex items-center gap-2 flex-wrap" onClick={(e) => e.stopPropagation()}>
                            <span
                              className={`text-[10px] font-bold px-2 py-0.5 rounded uppercase tracking-wider ${
                                ev.type === 'hearing'
                                  ? 'bg-indigo-100 text-indigo-900'
                                  : ev.type === 'task'
                                  ? 'bg-amber-100 text-amber-900'
                                  : 'bg-emerald-100 text-emerald-900'
                              }`}
                            >
                              {ev.type === 'hearing'
                                ? t('calendar.hearingBadge')
                                : ev.type === 'task'
                                ? t('calendar.taskDeadlineBadge')
                                : t('calendar.fileReturnBadge')}
                            </span>
                            <EntityLink
                              type={ev.type === 'file_return' ? 'file' : ev.type}
                              id={ev.sourceId}
                              caseId={ev.caseId}
                              caseTab={ev.type === 'hearing' ? 'hearings' : 'overview'}
                              mode={ev.type === 'hearing' && ev.caseId ? 'page' : 'modal'}
                              label={ev.title}
                              restricted={ev.restricted}
                              className="font-bold text-slate-900"
                            />
                            {ev.type === 'hearing' && ev.fixedFor && (
                              <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-blue-50 text-blue-700 border border-blue-200">
                                {getFixedForLabel(ev.fixedFor, i18n.language === 'bn' ? 'bn' : 'en')}
                                {ev.fixedForNote ? ` (${ev.fixedForNote})` : ''}
                              </span>
                            )}
                            {ev.restricted && (
                              <span className="text-[10px] px-1.5 py-0.2 rounded font-bold bg-amber-100 text-amber-900 border border-amber-300">
                                {t('cases.restricted')}
                              </span>
                            )}
                          </div>

                          <div className="text-[11px] text-slate-500 flex items-center gap-3 flex-wrap">
                            {ev.court && <span>{t('calendar.courtPrefix', { court: ev.court })}</span>}
                            {ev.clientName && <span>{t('calendar.clientPrefix', { name: ev.clientName })}</span>}
                            {ev.assigneeName && <span>{t('calendar.advocatePrefix', { name: ev.assigneeName })}</span>}
                          </div>
                        </div>

                        <div className="shrink-0 text-right font-mono">
                          <span className="font-semibold text-slate-800 block">
                            {new Date(ev.date).toLocaleDateString()}
                          </span>
                          <span className="text-[11px] text-slate-400">
                            {new Date(ev.date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Cause List View */}
      {viewMode === 'causelist' && (
        <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-xs space-y-5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-200 pb-4">
            <div>
              <h2 className="font-bold text-base text-slate-900">{t('calendar.causeListTitle')}</h2>
              <p className="text-xs text-slate-500">
                {t('calendar.scheduleFor', {
                  date: new Date(selectedDateStr).toLocaleDateString(i18n.language === 'bn' ? 'bn-BD' : 'en-GB', {
                    weekday: 'long',
                    day: 'numeric',
                    month: 'long',
                    year: 'numeric',
                  }),
                })}
              </p>
            </div>

            <button
              type="button"
              onClick={() => setCauseListModalOpen(true)}
              className="inline-flex items-center justify-center gap-1.5 px-4 py-2 min-h-[44px] bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-semibold shadow-xs transition"
            >
              <Printer className="w-4 h-4" />
              {t('calendar.printCauseList')}
            </button>
          </div>

          {selectedDateHearings.length === 0 ? (
            <div className="py-12 text-center text-slate-400 text-xs italic">
              {t('calendar.noHearingsOnDate', { date: selectedDateStr })}
            </div>
          ) : (
            <>
              {/* Mobile Card List (<sm) */}
              <div className="block sm:hidden space-y-2">
                {selectedDateHearings.map((h, i) => (
                  <div
                    key={h.id}
                    onClick={() => handleEventClick(h)}
                    className="p-3 bg-white border border-slate-200 rounded-xl space-y-2 text-xs hover:border-indigo-300 transition cursor-pointer"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-mono font-bold text-[11px] text-slate-500">#{i + 1}</span>
                      <span className="text-[10px] px-2 py-0.5 rounded-full font-bold uppercase tracking-wider bg-slate-100 text-slate-800">
                        {h.status ? t(`hearings.status${h.status.charAt(0).toUpperCase() + h.status.slice(1).toLowerCase()}`, h.status) : t('hearings.statusScheduled', 'Scheduled')}
                      </span>
                    </div>
                    <div>
                      <div className="font-semibold text-slate-900">{h.court || t('calendar.courtNotFixed')}</div>
                      <div onClick={(e) => e.stopPropagation()} className="mt-0.5">
                        {h.caseId ? (
                          <EntityLink
                            type="case"
                            id={h.caseId}
                            caseTab="hearings"
                            label={h.caseNumber || h.title}
                            restricted={h.restricted}
                            className="font-mono font-bold block text-indigo-700"
                          />
                        ) : (
                          <span className="font-mono font-bold text-indigo-700 block">{h.caseNumber || h.title}</span>
                        )}
                        {h.clientName && <span className="text-[11px] text-slate-500">{t('calendar.clientPrefix', { name: h.clientName })}</span>}
                      </div>
                    </div>
                    <div className="pt-1 border-t border-slate-100 flex items-center justify-between gap-2 flex-wrap">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="font-medium text-slate-800">{h.title}</span>
                        {h.fixedFor && (
                          <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-blue-50 text-blue-700 border border-blue-200">
                            {getFixedForLabel(h.fixedFor, i18n.language === 'bn' ? 'bn' : 'en')}
                            {h.fixedForNote ? ` (${h.fixedForNote})` : ''}
                          </span>
                        )}
                      </div>
                      <span className="text-[10px] text-slate-400 font-mono">
                        {t('calendar.timePrefix', { time: new Date(h.date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) })}
                      </span>
                    </div>
                  </div>
                ))}
              </div>

              {/* Desktop Table View (>=sm) */}
              <div className="hidden sm:block overflow-x-auto border border-slate-200 rounded-xl">
                <table className="w-full min-w-[560px] text-left text-xs divide-y divide-slate-200">
                  <thead className="bg-slate-100 text-slate-800 font-bold uppercase tracking-wider text-[10px]">
                    <tr>
                      <th className="p-3 text-center w-10">#</th>
                      <th className="p-3 w-48">{t('calendar.courtBench')}</th>
                      <th className="p-3 w-52">{t('calendar.caseNumber')}</th>
                      <th className="p-3">{t('calendar.purpose')}</th>
                      <th className="p-3 w-32 text-center">{t('common.status')}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {selectedDateHearings.map((h, i) => (
                      <tr
                        key={h.id}
                        onClick={() => handleEventClick(h)}
                        className="hover:bg-slate-50 cursor-pointer"
                      >
                        <td className="p-3 text-center font-mono font-bold text-slate-400">{i + 1}</td>
                        <td className="p-3 font-semibold text-slate-900">{h.court || t('calendar.courtNotFixed')}</td>
                        <td className="p-3" onClick={(e) => e.stopPropagation()}>
                          {h.caseId ? (
                            <EntityLink
                              type="case"
                              id={h.caseId}
                              caseTab="hearings"
                              label={h.caseNumber || h.title}
                              restricted={h.restricted}
                              className="font-mono font-bold block"
                            />
                          ) : (
                            <span className="font-mono font-bold text-indigo-700 block">{h.caseNumber || h.title}</span>
                          )}
                          {h.clientName && <span className="text-[11px] text-slate-500">{t('calendar.clientPrefix', { name: h.clientName })}</span>}
                        </td>
                        <td className="p-3">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="font-medium text-slate-800">{h.title}</span>
                            {h.fixedFor && (
                              <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-blue-50 text-blue-700 border border-blue-200">
                                {getFixedForLabel(h.fixedFor, i18n.language === 'bn' ? 'bn' : 'en')}
                                {h.fixedForNote ? ` (${h.fixedForNote})` : ''}
                              </span>
                            )}
                          </div>
                          <span className="text-[10px] text-slate-400 font-mono block mt-0.5">
                            {t('calendar.timePrefix', { time: new Date(h.date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) })}
                          </span>
                        </td>
                        <td className="p-3 text-center">
                          <span className="text-[10px] px-2 py-0.5 rounded-full font-bold uppercase tracking-wider bg-slate-100 text-slate-800">
                            {h.status ? t(`hearings.status${h.status.charAt(0).toUpperCase() + h.status.slice(1).toLowerCase()}`, h.status) : t('hearings.statusScheduled', 'Scheduled')}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      )}

      {/* Cause List Modal */}
      <DailyCauseListModal
        isOpen={causeListModalOpen}
        dateStr={selectedDateStr}
        firmName={firmName}
        hearings={selectedDateHearings}
        onClose={() => setCauseListModalOpen(false)}
      />
    </div>
  );
};
