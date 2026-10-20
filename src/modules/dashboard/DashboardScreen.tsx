import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../foundation/AuthContext';
import { useNavigation } from '../foundation/NavigationContext';
import { getRepositories } from '../../data/repositories';
import {
  AuditLogRecord,
  DashboardMetrics,
  DashboardUrgentItems,
  HearingRecord,
  CalendarEventRecord,
  AppointmentRecord,
  ClientRecord,
} from '../../data/types';
import { ResponsiveTable } from '../../components/responsive/ResponsiveTable';
import { EntityLink } from '../../components/EntityLink';
import { GlobalSearchModal } from '../search/GlobalSearchModal';
import { CaseFormModal } from '../cases/CaseFormModal';
import { ClientFormModal } from '../clients/ClientFormModal';
import { TaskFormModal } from '../tasks/TaskFormModal';
import { DailyCauseListModal } from '../calendar/DailyCauseListModal';
import { AppointmentFormModal } from '../appointments/AppointmentFormModal';
import {
  Briefcase,
  Users,
  Gavel,
  CheckSquare,
  FolderArchive,
  Bell,
  Search,
  Plus,
  Printer,
  Calendar,
  AlertTriangle,
  Clock,
  ArrowRight,
  MapPin,
  Building,
  CheckCircle2,
  Lock,
  Activity,
  Edit2,
} from 'lucide-react';

interface DashboardScreenProps {
  onNavigate?: (tab: string, id?: string) => void;
}

export const DashboardScreen: React.FC<DashboardScreenProps> = ({ onNavigate: onNavigateProp }) => {
  const { t, i18n } = useTranslation();
  const { currentUser, currentFirm, can, isReadOnly } = useAuth();
  const {
    refreshVersion,
    triggerRefresh,
    navigateToScreen,
    openCaseDossier,
    openClientProfile,
    openEntityModalById,
  } = useNavigation();
  const onNavigate = useCallback(
    (tab: string, id?: string) => {
      if (onNavigateProp) {
        onNavigateProp(tab, id);
        return;
      }
      if (tab === 'cases' && id) {
        openCaseDossier(id, 'overview');
      } else if (tab === 'clients' && id) {
        openClientProfile(id, 'cases');
      } else {
        navigateToScreen(tab as Parameters<typeof navigateToScreen>[0]);
      }
    },
    [onNavigateProp, openCaseDossier, openClientProfile, navigateToScreen]
  );
  const repos = getRepositories();

  const [metrics, setMetrics] = useState<DashboardMetrics | null>(null);
  const [urgentItems, setUrgentItems] = useState<DashboardUrgentItems | null>(null);
  const [upcomingHearings, setUpcomingHearings] = useState<HearingRecord[]>([]);
  const [recentActivities, setRecentActivities] = useState<AuditLogRecord[]>([]);
  const [todayCauseList, setTodayCauseList] = useState<{
    date: string;
    hearings: CalendarEventRecord[];
    firmName: string;
  } | null>(null);
  const [todayAppointments, setTodayAppointments] = useState<AppointmentRecord[]>([]);
  const [clientsMap, setClientsMap] = useState<Record<string, ClientRecord>>({});
  const [appointmentModalOpen, setAppointmentModalOpen] = useState(false);
  const [selectedAppointment, setSelectedAppointment] = useState<AppointmentRecord | null>(null);
  const [, setLoading] = useState(true);

  // Modals state
  const [searchModalOpen, setSearchModalOpen] = useState(false);
  const [caseModalOpen, setCaseModalOpen] = useState(false);
  const [clientModalOpen, setClientModalOpen] = useState(false);
  const [taskModalOpen, setTaskModalOpen] = useState(false);
  const [causeListModalOpen, setCauseListModalOpen] = useState(false);

  const securityContext = { currentUser };

  const loadDashboardData = useCallback(async () => {
    try {
      setLoading(true);
      const todayIso = new Date().toISOString();

      const [m, u, up, act, cause, cls] = await Promise.all([
        repos.dashboard.getMetrics(securityContext),
        repos.dashboard.getUrgentItems(securityContext),
        repos.dashboard.getUpcomingHearings(securityContext, 7),
        can('settings.manage')
          ? repos.auditLog.list(securityContext, { limit: 6 }).catch(() => [])
          : Promise.resolve([]),
        repos.calendar.getDayCauseList(securityContext, todayIso),
        repos.client.list(securityContext).catch(() => []),
      ]);

      setMetrics(m);
      setUrgentItems(u);
      setUpcomingHearings(up);
      setRecentActivities(act);
      setTodayCauseList(cause);
      setTodayAppointments(u?.todayAppointments || []);

      const cmap: Record<string, ClientRecord> = {};
      cls.forEach((c: ClientRecord) => {
        cmap[c.id] = c;
      });
      setClientsMap(cmap);
    } catch (err) {
      console.error('Failed to load dashboard data:', err);
    } finally {
      setLoading(false);
    }
  }, [currentUser, can, repos]);

  useEffect(() => {
    loadDashboardData();
  }, [loadDashboardData, refreshVersion]);

  // Global Ctrl+K / Cmd+K listener
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setSearchModalOpen((prev) => !prev);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const handleCreateCase = async (caseData: Parameters<typeof repos.case.create>[1]) => {
    await repos.case.create(securityContext, caseData);
    setCaseModalOpen(false);
    triggerRefresh();
  };

  const handleCreateClient = async (clientData: Parameters<typeof repos.client.create>[1]) => {
    await repos.client.create(securityContext, clientData);
    setClientModalOpen(false);
    triggerRefresh();
  };

  const handleCreateTask = async (taskData: Parameters<typeof repos.task.create>[1]) => {
    await repos.task.create(securityContext, taskData);
    setTaskModalOpen(false);
    triggerRefresh();
  };

  const handleCompleteTask = async (taskId: string) => {
    if (isReadOnly) return;
    await repos.task.complete(securityContext, taskId, 'Completed via Chamber Dashboard');
    triggerRefresh();
  };

  const handleCompleteAppointment = async (appointmentId: string) => {
    if (isReadOnly || !can('appointments.manage')) return;
    await repos.appointment.update(securityContext, appointmentId, { status: 'completed' });
    triggerRefresh();
  };

  const handleCheckInFile = async (fileId: string, shelfLocation?: string) => {
    if (isReadOnly) return;
    await repos.physicalFile.checkIn(
      securityContext,
      fileId,
      shelfLocation || 'Chamber Cabinet',
      'Returned to custody via Dashboard quick action'
    );
    triggerRefresh();
  };

  const todayFormatted = new Date().toLocaleDateString(
    i18n.language === 'bn' ? 'bn-BD' : 'en-GB',
    {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    }
  );

  type UrgentItem =
    | {
        kind: 'task';
        id: string;
        title: string;
        dueAt: string;
        priority: string;
        assignedToName?: string;
        diffDays: number;
      }
    | {
        kind: 'file';
        id: string;
        title: string;
        serial: string;
        dueBackAt?: string | null;
        currentHolderName?: string | null;
        shelfLocation?: string;
        diffDays: number;
      };

  const allUrgentItems: UrgentItem[] = useMemo(() => {
    if (!urgentItems) return [];
    const tasks: UrgentItem[] = (urgentItems.overdueTasks || []).map((t) => ({
      kind: 'task' as const,
      id: t.id,
      title: t.title,
      dueAt: t.dueAt,
      priority: t.priority,
      assignedToName: t.assignedToName,
      diffDays: Math.ceil((Date.now() - new Date(t.dueAt).getTime()) / (1000 * 60 * 60 * 24)),
    }));
    const files: UrgentItem[] = (urgentItems.overdueFiles || []).map((f) => ({
      kind: 'file' as const,
      id: f.id,
      title: f.title,
      serial: f.serial,
      dueBackAt: f.dueBackAt,
      currentHolderName: f.currentHolderName,
      shelfLocation: f.shelfLocation,
      diffDays: f.dueBackAt
        ? Math.ceil((Date.now() - new Date(f.dueBackAt).getTime()) / (1000 * 60 * 60 * 24))
        : 1,
    }));
    return [...tasks, ...files];
  }, [urgentItems]);

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-10">
      {/* Top Welcome & Executive Banner */}
      <div className="bg-gradient-to-r from-slate-900 via-slate-800 to-indigo-950 text-white rounded-2xl p-6 sm:p-8 shadow-sm relative overflow-hidden">
        {/* Subtle decorative background watermark */}
        <div className="absolute right-0 bottom-0 opacity-5 pointer-events-none translate-x-8 translate-y-8">
          <Building className="w-80 h-80" />
        </div>

        <div className="relative z-10 flex flex-col lg:flex-row lg:items-center justify-between gap-6">
          <div>
            <div className="flex items-center gap-2 text-indigo-300 text-xs font-semibold tracking-wider uppercase">
              <Calendar className="w-4 h-4" />
              <span>{todayFormatted}</span>
              <span className="text-slate-500">•</span>
              <span>{currentFirm?.courtAffiliations?.split('(')[0] || 'Supreme Court of Bangladesh'}</span>
            </div>

            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-white mt-1.5">
              {t('dashboard.welcome', { name: currentUser.name })}
            </h1>
            <p className="text-slate-300 text-sm mt-1 max-w-2xl">
              {t('dashboard.welcomeSubtitle', {
                firmName: currentFirm?.name || 'Rahman & Associates Chambers',
              })}
            </p>
          </div>

          {/* Quick Search Trigger Bar */}
          <div className="w-full lg:w-96 shrink-0">
            <button
              onClick={() => setSearchModalOpen(true)}
              className="w-full flex items-center justify-between px-4 py-3 bg-white/10 hover:bg-white/15 border border-white/20 hover:border-white/30 rounded-xl text-left text-slate-300 hover:text-white transition group shadow-xs backdrop-blur-xs"
            >
              <div className="flex items-center gap-2.5 truncate">
                <Search className="w-4 h-4 text-indigo-400 group-hover:text-indigo-300" />
                <span className="text-xs sm:text-sm font-medium truncate">
                  {t('dashboard.quickSearchPlaceholder')}
                </span>
              </div>
              <kbd className="hidden sm:inline-flex items-center gap-0.5 text-[11px] font-mono px-2 py-0.5 rounded bg-white/15 text-slate-200 border border-white/10 shrink-0">
                ⌘K
              </kbd>
            </button>
          </div>
        </div>
      </div>

      {/* Operational Metric Scorecards (6 Key Chamber Metrics) */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 sm:gap-4">
        {/* Metric 1: Active Cases */}
        <div
          onClick={() => onNavigate('cases')}
          className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs hover:shadow-xs hover:border-indigo-300 transition cursor-pointer group"
        >
          <div className="flex items-center justify-between">
            <div className="w-8 h-8 rounded-lg bg-indigo-50 text-indigo-600 flex items-center justify-center group-hover:scale-105 transition">
              <Briefcase className="w-4 h-4" />
            </div>
            <span className="text-[10px] font-bold text-slate-400 group-hover:text-indigo-600 uppercase tracking-wider">
              Cases
            </span>
          </div>
          <div className="mt-3">
            <span className="text-2xl font-extrabold text-slate-900 block leading-tight">
              {metrics?.activeCasesCount ?? 0}
            </span>
            <span className="text-xs font-medium text-slate-500 line-clamp-1 mt-0.5">
              {t('dashboard.metrics.activeCases')}
            </span>
          </div>
        </div>

        {/* Metric 2: Clients */}
        <div
          onClick={() => onNavigate('clients')}
          className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs hover:shadow-xs hover:border-emerald-300 transition cursor-pointer group"
        >
          <div className="flex items-center justify-between">
            <div className="w-8 h-8 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center group-hover:scale-105 transition">
              <Users className="w-4 h-4" />
            </div>
            <span className="text-[10px] font-bold text-slate-400 group-hover:text-emerald-600 uppercase tracking-wider">
              Clients
            </span>
          </div>
          <div className="mt-3">
            <span className="text-2xl font-extrabold text-slate-900 block leading-tight">
              {metrics?.totalClientsCount ?? 0}
            </span>
            <span className="text-xs font-medium text-slate-500 line-clamp-1 mt-0.5">
              {t('dashboard.metrics.totalClients')}
            </span>
          </div>
        </div>

        {/* Metric 3: Today's Cause List */}
        <div
          onClick={() => onNavigate('hearings')}
          className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs hover:shadow-xs hover:border-amber-300 transition cursor-pointer group"
        >
          <div className="flex items-center justify-between">
            <div className="w-8 h-8 rounded-lg bg-amber-50 text-amber-600 flex items-center justify-center group-hover:scale-105 transition">
              <Gavel className="w-4 h-4" />
            </div>
            <span className="text-[10px] font-bold text-slate-400 group-hover:text-amber-600 uppercase tracking-wider">
              Today
            </span>
          </div>
          <div className="mt-3">
            <span className="text-2xl font-extrabold text-slate-900 block leading-tight">
              {metrics?.todayHearingsCount ?? 0}
            </span>
            <span className="text-xs font-medium text-slate-500 line-clamp-1 mt-0.5">
              {t('dashboard.metrics.todayHearings')}
            </span>
          </div>
        </div>

        {/* Metric 4: Tasks (Pending & Overdue) */}
        <div
          onClick={() => onNavigate('tasks')}
          className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs hover:shadow-xs hover:border-blue-300 transition cursor-pointer group"
        >
          <div className="flex items-center justify-between">
            <div className="w-8 h-8 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center group-hover:scale-105 transition">
              <CheckSquare className="w-4 h-4" />
            </div>
            {metrics?.overdueTasksCount ? (
              <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-rose-100 text-rose-700">
                {metrics.overdueTasksCount} overdue
              </span>
            ) : (
              <span className="text-[10px] font-bold text-slate-400 group-hover:text-blue-600 uppercase tracking-wider">
                Tasks
              </span>
            )}
          </div>
          <div className="mt-3">
            <span className="text-2xl font-extrabold text-slate-900 block leading-tight">
              {metrics?.pendingTasksCount ?? 0}
            </span>
            <span className="text-xs font-medium text-slate-500 line-clamp-1 mt-0.5">
              {t('dashboard.metrics.pendingTasks')}
            </span>
          </div>
        </div>

        {/* Metric 5: Physical Files in Custody */}
        <div
          onClick={() => onNavigate('files')}
          className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs hover:shadow-xs hover:border-purple-300 transition cursor-pointer group"
        >
          <div className="flex items-center justify-between">
            <div className="w-8 h-8 rounded-lg bg-purple-50 text-purple-600 flex items-center justify-center group-hover:scale-105 transition">
              <FolderArchive className="w-4 h-4" />
            </div>
            {metrics?.overdueFilesCount ? (
              <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-rose-100 text-rose-700">
                {metrics.overdueFilesCount} overdue
              </span>
            ) : (
              <span className="text-[10px] font-bold text-slate-400 group-hover:text-purple-600 uppercase tracking-wider">
                Files
              </span>
            )}
          </div>
          <div className="mt-3">
            <span className="text-2xl font-extrabold text-slate-900 block leading-tight">
              {metrics?.checkedOutFilesCount ?? 0}
            </span>
            <span className="text-xs font-medium text-slate-500 line-clamp-1 mt-0.5">
              {t('dashboard.metrics.checkedOutFiles')}
            </span>
          </div>
        </div>

        {/* Metric 6: Chamber Reminders / Alerts */}
        <div
          onClick={() => onNavigate('calendar')}
          className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs hover:shadow-xs hover:border-orange-300 transition cursor-pointer group"
        >
          <div className="flex items-center justify-between">
            <div className="w-8 h-8 rounded-lg bg-orange-50 text-orange-600 flex items-center justify-center group-hover:scale-105 transition">
              <Bell className="w-4 h-4" />
            </div>
            <span className="text-[10px] font-bold text-slate-400 group-hover:text-orange-600 uppercase tracking-wider">
              Alerts
            </span>
          </div>
          <div className="mt-3">
            <span className="text-2xl font-extrabold text-slate-900 block leading-tight">
              {metrics?.pendingRemindersCount ?? 0}
            </span>
            <span className="text-xs font-medium text-slate-500 line-clamp-1 mt-0.5">
              {t('dashboard.metrics.pendingReminders')}
            </span>
          </div>
        </div>
      </div>

      {/* Quick Action Shortcuts Bar */}
      <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className="text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center gap-1.5">
            <Activity className="w-4 h-4 text-indigo-600" />
            {t('dashboard.shortcuts.title')}
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {can('cases.create') && (
            <button
              onClick={() => setCaseModalOpen(true)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200/60 transition shadow-2xs"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>{t('dashboard.shortcuts.registerCase')}</span>
            </button>
          )}

          {can('clients.edit') && (
            <button
              onClick={() => setClientModalOpen(true)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200/60 transition shadow-2xs"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>{t('dashboard.shortcuts.registerClient')}</span>
            </button>
          )}

          {can('tasks.assign') && (
            <button
              onClick={() => setTaskModalOpen(true)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200/60 transition shadow-2xs"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>{t('dashboard.shortcuts.assignTask')}</span>
            </button>
          )}

          <button
            onClick={() => setCauseListModalOpen(true)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-slate-100 hover:bg-slate-200 text-slate-800 border border-slate-300/70 transition shadow-2xs"
          >
            <Printer className="w-3.5 h-3.5 text-slate-600" />
            <span>{t('dashboard.shortcuts.printCauseList')}</span>
          </button>

          <button
            onClick={() => setSearchModalOpen(true)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-slate-900 hover:bg-slate-800 text-white transition shadow-2xs"
          >
            <Search className="w-3.5 h-3.5" />
            <span>{t('dashboard.shortcuts.globalSearch')}</span>
          </button>
        </div>
      </div>

      {/* Main Responsive 2-Column Section */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column (8 cols): Today's Cause List & Urgent Matters */}
        <div className="lg:col-span-8 space-y-6">
          {/* Section A: Today's Court Appearances / Cause List Docket */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-2xs overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-7 h-7 rounded-lg bg-amber-50 text-amber-600 flex items-center justify-center">
                  <Gavel className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-900">
                    {t('dashboard.todayDocket.title')}
                  </h3>
                  <p className="text-xs text-slate-500">
                    {todayCauseList?.hearings.length ?? 0} matter(s) listed for today
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => setCauseListModalOpen(true)}
                  className="inline-flex items-center gap-1 text-xs font-semibold text-slate-600 hover:text-slate-900 px-2.5 py-1 rounded-md hover:bg-slate-100 transition"
                >
                  <Printer className="w-3.5 h-3.5" />
                  <span>Print</span>
                </button>
                <button
                  onClick={() => onNavigate('hearings')}
                  className="inline-flex items-center gap-1 text-xs font-semibold text-indigo-600 hover:text-indigo-800 transition"
                >
                  <span>{t('dashboard.todayDocket.viewAll')}</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

            <div className="p-3 sm:p-4">
              <ResponsiveTable
                data={todayCauseList ? todayCauseList.hearings : []}
                keyExtractor={(h) => h.id}
                onRowClick={(h) => {
                  if (h.caseId) openCaseDossier(h.caseId, 'hearings');
                  else openEntityModalById('hearing', h.sourceId);
                }}
                columns={[
                  {
                    header: 'Case / Matter',
                    accessor: (h) => (
                      <div onClick={(e) => e.stopPropagation()}>
                        {h.caseId ? (
                          <EntityLink
                            type="case"
                            id={h.caseId}
                            caseTab="hearings"
                            label={h.caseNumber || h.title}
                            restricted={h.restricted}
                            className="font-bold text-sm block"
                          />
                        ) : (
                          <span className="font-bold text-sm text-slate-900 block">{h.caseNumber || h.title}</span>
                        )}
                        <span className="text-xs text-slate-500 line-clamp-1">{h.title}</span>
                      </div>
                    ),
                  },
                  {
                    header: 'Status',
                    accessor: (h) => (
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-amber-50 text-amber-800 border border-amber-200">
                          {h.status ? h.status.toUpperCase() : 'SCHEDULED'}
                        </span>
                        {h.restricted && (
                          <span className="inline-flex items-center gap-1 text-[10px] font-bold px-1.5 py-0.5 rounded bg-rose-50 text-rose-700 border border-rose-200">
                            <Lock className="w-3 h-3" />
                            Confidential
                          </span>
                        )}
                      </div>
                    ),
                  },
                  {
                    header: 'Court Bench',
                    accessor: (h) => <span className="text-xs text-slate-600">{h.court || 'Court Bench'}</span>,
                  },
                  {
                    header: 'Client',
                    accessor: (h) => <span className="text-xs text-slate-600">{h.clientName || '—'}</span>,
                  },
                  {
                    header: 'Time',
                    accessor: (h) => (
                      <span className="text-xs font-mono font-semibold text-slate-700">
                        {new Date(h.date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    ),
                  },
                  {
                    header: 'In Charge',
                    accessor: (h) => (
                      <span className="text-xs text-slate-500">{h.assigneeName || 'Advocate In Charge'}</span>
                    ),
                  },
                ]}
                renderMobileCard={(h) => (
                  <div className="p-3.5 sm:p-4 bg-white rounded-xl border border-slate-200 shadow-2xs hover:bg-slate-50/70 transition space-y-2">
                    <div className="flex items-center justify-between gap-2 flex-wrap">
                      <div className="flex items-center gap-2 flex-wrap" onClick={(e) => e.stopPropagation()}>
                        {h.caseId ? (
                          <EntityLink
                            type="case"
                            id={h.caseId}
                            caseTab="hearings"
                            label={h.caseNumber || h.title}
                            restricted={h.restricted}
                            className="font-bold text-sm"
                          />
                        ) : (
                          <span className="font-bold text-sm text-slate-900">{h.caseNumber || h.title}</span>
                        )}
                        <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-amber-50 text-amber-800 border border-amber-200">
                          {h.status ? h.status.toUpperCase() : 'SCHEDULED'}
                        </span>
                        {h.restricted && (
                          <span className="inline-flex items-center gap-1 text-[10px] font-bold px-1.5 py-0.5 rounded bg-rose-50 text-rose-700 border border-rose-200">
                            <Lock className="w-3 h-3" />
                            Confidential
                          </span>
                        )}
                      </div>
                      <span className="text-xs font-mono font-semibold text-slate-700">
                        {new Date(h.date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </div>
                    <p className="text-xs text-slate-600 line-clamp-2">{h.title}</p>
                    <div className="flex items-center justify-between gap-2 text-xs text-slate-500 pt-1 border-t border-slate-100">
                      <span>
                        {h.court || 'Court Bench'}
                        {h.clientName ? ` • ${h.clientName}` : ''}
                      </span>
                      <span className="text-[11px] text-slate-600 font-medium">
                        {h.assigneeName || 'Advocate In Charge'}
                      </span>
                    </div>
                  </div>
                )}
                emptyState={
                  <div className="p-8 text-center text-slate-500">
                    <CheckCircle2 className="w-10 h-10 text-emerald-500 mx-auto mb-2 opacity-80" />
                    <p className="text-sm font-semibold text-slate-700">{t('dashboard.todayDocket.noHearings')}</p>
                    <p className="text-xs text-slate-400 mt-0.5">
                      No hearings currently scheduled for today's court sitting.
                    </p>
                    <button
                      onClick={() => onNavigate('calendar')}
                      className="mt-3 inline-flex items-center gap-1 text-xs font-semibold text-indigo-600 hover:text-indigo-800 min-h-[36px]"
                    >
                      <span>Check chamber calendar agenda</span>
                      <ArrowRight className="w-3.5 h-3.5" />
                    </button>
                  </div>
                }
              />
            </div>
          </div>

          {/* Section A2: Today's Appointments */}
          {can('appointments.view') && (
            <div className="bg-white rounded-xl border border-slate-200 shadow-2xs overflow-hidden">
              <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <div className="w-7 h-7 rounded-lg bg-indigo-50 text-indigo-600 flex items-center justify-center">
                    <Clock className="w-4 h-4" />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-slate-900">
                      {t('appointments.todayTitle', "Today's Appointments")}
                    </h3>
                    <p className="text-xs text-slate-500">
                      {todayAppointments.length} consultation(s) & meeting(s) scheduled for today
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  {can('appointments.manage') && !isReadOnly && (
                    <button
                      onClick={() => {
                        setSelectedAppointment(null);
                        setAppointmentModalOpen(true);
                      }}
                      className="inline-flex items-center gap-1 text-xs font-semibold text-slate-600 hover:text-slate-900 px-2.5 py-1 rounded-md hover:bg-slate-100 transition"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>{t('appointments.scheduleShort', 'New')}</span>
                    </button>
                  )}
                  <button
                    onClick={() => onNavigate('appointments')}
                    className="inline-flex items-center gap-1 text-xs font-semibold text-indigo-600 hover:text-indigo-800 transition"
                  >
                    <span>{t('dashboard.todayDocket.viewAll')}</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              <div className="p-3 sm:p-4">
                {todayAppointments.length === 0 ? (
                  <div className="p-6 text-center text-slate-500">
                    <Calendar className="w-8 h-8 text-slate-300 mx-auto mb-2 opacity-80" />
                    <p className="text-sm font-semibold text-slate-700">
                      {t('appointments.noAppointmentsToday', 'No appointments scheduled for today.')}
                    </p>
                    {can('appointments.manage') && !isReadOnly && (
                      <button
                        onClick={() => {
                          setSelectedAppointment(null);
                          setAppointmentModalOpen(true);
                        }}
                        className="mt-2.5 inline-flex items-center gap-1 text-xs font-semibold text-indigo-600 hover:text-indigo-800"
                      >
                        <Plus className="w-3 h-3" />
                        <span>{t('appointments.scheduleAppointment', 'Schedule Appointment')}</span>
                      </button>
                    )}
                  </div>
                ) : (
                  <div className="space-y-2.5">
                    {todayAppointments.map((appt) => {
                      const start = new Date(appt.startsAt);
                      const end = new Date(appt.endsAt);
                      const client = appt.clientId ? clientsMap[appt.clientId] : null;

                      return (
                        <div
                          key={appt.id}
                          data-testid={`today-appointment-row-${appt.id}`}
                          className="p-3.5 rounded-xl bg-slate-50 border border-slate-200/80 flex flex-wrap items-center justify-between gap-3 hover:bg-slate-100/60 transition"
                        >
                          <div className="space-y-1 min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="font-bold text-sm text-slate-900">{appt.title}</span>
                              <span
                                className={`text-[10px] px-2 py-0.5 rounded-full font-bold uppercase ${
                                  appt.status === 'scheduled'
                                    ? 'bg-blue-100 text-blue-800'
                                    : appt.status === 'completed'
                                    ? 'bg-emerald-100 text-emerald-800'
                                    : 'bg-slate-200 text-slate-700'
                                }`}
                              >
                                {appt.status}
                              </span>
                              <span className="text-[10px] px-1.5 py-0.5 rounded bg-white border border-slate-200 text-slate-600 capitalize">
                                {appt.type.replace('_', ' ')}
                              </span>
                            </div>

                            <div className="flex flex-wrap items-center gap-3 text-xs text-slate-500">
                              <span className="inline-flex items-center gap-1 font-semibold text-indigo-900">
                                <Clock className="w-3.5 h-3.5 text-indigo-600" />
                                <span>
                                  {start.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} -{' '}
                                  {end.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                </span>
                              </span>
                              {client && (
                                <span className="inline-flex items-center gap-1">
                                  <Users className="w-3 h-3 text-slate-400" />
                                  <span className="font-medium text-slate-700">{client.name}</span>
                                </span>
                              )}
                              {appt.location && (
                                <span className="inline-flex items-center gap-1">
                                  <MapPin className="w-3 h-3 text-slate-400" />
                                  <span>{appt.location}</span>
                                </span>
                              )}
                            </div>
                          </div>

                          <div className="flex items-center gap-1.5">
                            {can('appointments.manage') && !isReadOnly && (
                              <>
                                {appt.status === 'scheduled' && (
                                  <button
                                    type="button"
                                    title="Mark Completed"
                                    onClick={() => handleCompleteAppointment(appt.id)}
                                    className="px-2.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold flex items-center gap-1 shadow-2xs transition"
                                  >
                                    <CheckCircle2 className="w-3.5 h-3.5" />
                                    <span className="hidden sm:inline">Done</span>
                                  </button>
                                )}
                                <button
                                  type="button"
                                  title="Reschedule / Edit"
                                  onClick={() => {
                                    setSelectedAppointment(appt);
                                    setAppointmentModalOpen(true);
                                  }}
                                  className="px-2.5 py-1.5 rounded-lg bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 text-xs font-semibold flex items-center gap-1 transition"
                                >
                                  <Edit2 className="w-3 h-3" />
                                  <span className="hidden sm:inline">Reschedule</span>
                                </button>
                              </>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Section B: Urgent & Overdue Attention Matters */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-2xs overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-7 h-7 rounded-lg bg-rose-50 text-rose-600 flex items-center justify-center">
                  <AlertTriangle className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-900">
                    {t('dashboard.urgentAttention.title')}
                  </h3>
                  <p className="text-xs text-slate-500">
                    Overdue tasks and unreturned physical file custody alerts
                  </p>
                </div>
              </div>
            </div>

            <div className="p-3 sm:p-4">
              <ResponsiveTable<UrgentItem>
                data={allUrgentItems}
                keyExtractor={(item) => `${item.kind}-${item.id}`}
                onRowClick={(item) => openEntityModalById(item.kind, item.id)}
                columns={[
                  {
                    header: 'Type / Status',
                    accessor: (item) => (
                      <div className="flex items-center gap-1.5 flex-wrap">
                        {item.kind === 'task' ? (
                          <>
                            <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-rose-100 text-rose-800 uppercase tracking-wider">
                              Overdue Task
                            </span>
                            <span className="text-xs font-bold text-rose-700">{item.diffDays}d late</span>
                            <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-slate-100 text-slate-600">
                              {item.priority.toUpperCase()}
                            </span>
                          </>
                        ) : (
                          <>
                            <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-purple-100 text-purple-800 uppercase tracking-wider">
                              Overdue File
                            </span>
                            <span className="font-mono text-xs font-bold text-purple-900">{item.serial}</span>
                            <span className="text-xs font-bold text-rose-700">{item.diffDays}d late</span>
                          </>
                        )}
                      </div>
                    ),
                  },
                  {
                    header: 'Title / Subject',
                    accessor: (item) => (
                      <div onClick={(e) => e.stopPropagation()}>
                        <EntityLink
                          type={item.kind}
                          id={item.id}
                          mode="modal"
                          label={item.title}
                          className="font-semibold text-xs line-clamp-1"
                        />
                      </div>
                    ),
                  },
                  {
                    header: 'Assigned / Holder',
                    accessor: (item) => (
                      <span className="text-xs text-slate-600">
                        {item.kind === 'task'
                          ? item.assignedToName || 'Advocate'
                          : item.currentHolderName || 'Chamber Staff'}
                      </span>
                    ),
                  },
                  {
                    header: 'Due / Shelf',
                    accessor: (item) => (
                      <span className="text-xs text-slate-500">
                        {item.kind === 'task'
                          ? new Date(item.dueAt).toLocaleDateString()
                          : item.shelfLocation || 'Chamber'}
                      </span>
                    ),
                  },
                  {
                    header: 'Action',
                    className: 'text-right',
                    accessor: (item) => (
                      <div
                        className="flex items-center justify-end gap-1.5"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <button
                          type="button"
                          disabled={isReadOnly}
                          onClick={() => openEntityModalById(item.kind, item.id)}
                          className="px-2.5 py-1.5 rounded-lg text-xs font-semibold bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 transition min-h-[32px] disabled:opacity-40"
                        >
                          <Edit2 className="w-3 h-3" />
                        </button>
                        {item.kind === 'task' && can('tasks.complete') && (
                          <button
                            disabled={isReadOnly}
                            onClick={() => handleCompleteTask(item.id)}
                            className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-emerald-600 hover:bg-emerald-700 text-white transition shadow-2xs min-h-[32px] disabled:opacity-40"
                          >
                            Mark Done
                          </button>
                        )}
                        {item.kind === 'file' && can('files.manage') && (
                          <button
                            disabled={isReadOnly}
                            onClick={() => handleCheckInFile(item.id, item.shelfLocation)}
                            className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-purple-600 hover:bg-purple-700 text-white transition shadow-2xs min-h-[32px] disabled:opacity-40"
                          >
                            Check In
                          </button>
                        )}
                      </div>
                    ),
                  },
                ]}
                renderMobileCard={(item) => (
                  <div className="p-3.5 sm:p-4 bg-white rounded-xl border border-slate-200 shadow-2xs hover:bg-slate-50/70 transition space-y-2">
                    <div className="flex items-center justify-between gap-2 flex-wrap">
                      <div className="flex items-center gap-2 flex-wrap">
                        {item.kind === 'task' ? (
                          <>
                            <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-rose-100 text-rose-800 uppercase tracking-wider">
                              Overdue Task
                            </span>
                            <span className="text-xs font-bold text-rose-700">
                              {item.diffDays} day(s) late
                            </span>
                            <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-slate-100 text-slate-600">
                              {item.priority.toUpperCase()}
                            </span>
                          </>
                        ) : (
                          <>
                            <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-purple-100 text-purple-800 uppercase tracking-wider">
                              Overdue File Return
                            </span>
                            <span className="font-mono text-xs font-bold text-purple-900">{item.serial}</span>
                            <span className="text-xs font-bold text-rose-700">
                              {item.diffDays} day(s) overdue
                            </span>
                          </>
                        )}
                      </div>
                    </div>
                    <div onClick={(e) => e.stopPropagation()}>
                      <EntityLink
                        type={item.kind}
                        id={item.id}
                        mode="modal"
                        label={item.title}
                        className="font-semibold text-sm line-clamp-2"
                      />
                    </div>
                    <p className="text-xs text-slate-500">
                      {item.kind === 'task'
                        ? `Assigned to: ${item.assignedToName || 'Advocate'} • Due date: ${new Date(item.dueAt).toLocaleDateString()}`
                        : `Holder: ${item.currentHolderName || 'Chamber Staff'} • Shelf: ${item.shelfLocation || 'Chamber'}`}
                    </p>
                    <div
                      className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100"
                      onClick={(e) => e.stopPropagation()}
                    >
                      {item.kind === 'task' && can('tasks.complete') && (
                        <button
                          disabled={isReadOnly}
                          onClick={() => handleCompleteTask(item.id)}
                          className="px-3.5 py-2 rounded-lg text-xs font-semibold bg-emerald-600 hover:bg-emerald-700 text-white transition shadow-2xs min-h-[44px] disabled:opacity-40"
                        >
                          Mark Done
                        </button>
                      )}
                      {item.kind === 'file' && can('files.manage') && (
                        <button
                          disabled={isReadOnly}
                          onClick={() => handleCheckInFile(item.id, item.shelfLocation)}
                          className="px-3.5 py-2 rounded-lg text-xs font-semibold bg-purple-600 hover:bg-purple-700 text-white transition shadow-2xs min-h-[44px] disabled:opacity-40"
                        >
                          Check In
                        </button>
                      )}
                    </div>
                  </div>
                )}
                emptyState={
                  <div className="p-8 text-center text-slate-500">
                    <CheckCircle2 className="w-10 h-10 text-emerald-500 mx-auto mb-2 opacity-80" />
                    <p className="text-sm font-semibold text-slate-800">
                      {t('dashboard.urgentAttention.allClear')}
                    </p>
                    <p className="text-xs text-slate-400 mt-0.5">
                      Great job! All assigned task deadlines and paper file returns are on schedule.
                    </p>
                  </div>
                }
              />
            </div>
          </div>
        </div>

        {/* Right Column (4 cols): Upcoming Docket & Activity Stream */}
        <div className="lg:col-span-4 space-y-6">
          {/* Upcoming 7 Days Docket */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-2xs overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Calendar className="w-4 h-4 text-indigo-600" />
                <h3 className="text-sm font-bold text-slate-900">
                  {t('dashboard.upcomingWeek.title')}
                </h3>
              </div>
              <button
                onClick={() => onNavigate('calendar')}
                className="text-xs font-semibold text-indigo-600 hover:text-indigo-800 transition"
              >
                Calendar
              </button>
            </div>

            <div className="divide-y divide-slate-100 max-h-[300px] overflow-y-auto">
              {upcomingHearings.length > 0 ? (
                upcomingHearings.map((h) => {
                  const hearingDate = new Date(h.scheduledAt);
                  return (
                    <div
                      key={h.id}
                      data-testid={`dashboard-upcoming-hearing-${h.id}`}
                      onClick={() => openCaseDossier(h.caseId, 'hearings')}
                      className="p-3.5 hover:bg-slate-50 transition cursor-pointer flex items-start justify-between gap-3"
                    >
                      <div className="flex items-start gap-3 min-w-0">
                        <div className="w-10 text-center shrink-0 py-1 rounded-lg bg-indigo-50 border border-indigo-100 text-indigo-900">
                          <span className="text-[10px] font-bold uppercase block leading-none">
                            {hearingDate.toLocaleDateString('en-GB', { month: 'short' })}
                          </span>
                          <span className="text-sm font-extrabold block mt-0.5 leading-none">
                            {hearingDate.getDate()}
                          </span>
                        </div>

                        <div className="min-w-0" onClick={(e) => e.stopPropagation()}>
                          <EntityLink
                            type="hearing"
                            id={h.id}
                            caseId={h.caseId}
                            caseTab="hearings"
                            label={h.purpose}
                            className="text-xs font-bold block truncate"
                          />
                          <p className="text-[11px] text-slate-500 mt-0.5 truncate">
                            {h.outcomeNote || 'Regular Court Sitting'}
                          </p>
                        </div>
                      </div>

                      {can('hearings.update') && !isReadOnly && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            openEntityModalById('hearing', h.id);
                          }}
                          className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 shrink-0"
                          title={t('common.edit')}
                        >
                          <Edit2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  );
                })
              ) : (
                <div className="p-6 text-center text-xs text-slate-400">
                  {t('dashboard.upcomingWeek.noUpcoming')}
                </div>
              )}
            </div>
          </div>

          {/* Recent Chamber Activity Stream (Audit Trail) */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-2xs overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Activity className="w-4 h-4 text-slate-600" />
                <h3 className="text-sm font-bold text-slate-900">
                  {t('dashboard.activityStream.title')}
                </h3>
              </div>
              {can('settings.manage') && (
                <button
                  onClick={() => onNavigate('auditLog')}
                  className="text-xs font-semibold text-slate-600 hover:text-slate-900 transition"
                >
                  {t('dashboard.activityStream.viewAudit')}
                </button>
              )}
            </div>

            <div className="divide-y divide-slate-100 max-h-[320px] overflow-y-auto">
              {recentActivities.map((act) => (
                <div key={act.id} className="p-3 hover:bg-slate-50 transition text-xs">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-semibold text-slate-800 line-clamp-1">
                      {act.userName}
                    </span>
                    <span className="text-[10px] text-slate-400 font-mono shrink-0">
                      {new Date(act.timestamp).toLocaleTimeString([], {
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </span>
                  </div>
                  <p className="text-slate-600 mt-0.5 line-clamp-1">
                    <span className="font-semibold text-slate-700">{act.action}:</span>{' '}
                    {act.entity}
                  </p>
                </div>
              ))}
            </div>
          </div>

          {/* Chamber Practice & Registration Card */}
          <div className="bg-slate-900 text-white rounded-xl p-5 shadow-2xs space-y-3">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-indigo-500/20 text-indigo-300 flex items-center justify-center font-bold">
                <Building className="w-4 h-4" />
              </div>
              <div>
                <h4 className="text-xs font-bold text-white tracking-wide">
                  {currentFirm?.name || 'Rahman & Associates Chambers'}
                </h4>
                <p className="text-[10px] text-slate-400 font-mono">
                  {currentFirm?.barCouncilReg || 'BC-DHK-2012-9844'}
                </p>
              </div>
            </div>

            <div className="pt-2 border-t border-slate-800 text-[11px] text-slate-300 space-y-1.5">
              <div className="flex items-start gap-1.5">
                <MapPin className="w-3.5 h-3.5 text-slate-500 mt-0.5 shrink-0" />
                <span className="line-clamp-2">
                  {currentFirm?.officeAddress || 'Supreme Court Bar Association Building, Dhaka'}
                </span>
              </div>
              <div className="flex items-center justify-between pt-1">
                <span className="text-slate-400">License:</span>
                <span className="font-bold text-emerald-400">Active (Standard Plan)</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Global Search Modal */}
      <GlobalSearchModal
        isOpen={searchModalOpen}
        onClose={() => setSearchModalOpen(false)}
        onNavigate={onNavigate}
      />

      {/* Quick Action Modals */}
      {caseModalOpen && (
        <CaseFormModal
          isOpen={caseModalOpen}
          onClose={() => setCaseModalOpen(false)}
          onSave={handleCreateCase}
        />
      )}

      {clientModalOpen && (
        <ClientFormModal
          isOpen={clientModalOpen}
          onClose={() => setClientModalOpen(false)}
          onSave={handleCreateClient}
        />
      )}

      {taskModalOpen && (
        <TaskFormModal
          isOpen={taskModalOpen}
          onClose={() => setTaskModalOpen(false)}
          onSave={handleCreateTask}
        />
      )}

      {causeListModalOpen && todayCauseList && (
        <DailyCauseListModal
          isOpen={causeListModalOpen}
          dateStr={todayCauseList.date}
          firmName={todayCauseList.firmName}
          hearings={todayCauseList.hearings}
          onClose={() => setCauseListModalOpen(false)}
        />
      )}

      {appointmentModalOpen && (
        <AppointmentFormModal
          isOpen={appointmentModalOpen}
          initialData={selectedAppointment}
          onClose={() => {
            setAppointmentModalOpen(false);
            setSelectedAppointment(null);
          }}
          onSaved={() => {
            triggerRefresh();
          }}
        />
      )}
    </div>
  );
};
