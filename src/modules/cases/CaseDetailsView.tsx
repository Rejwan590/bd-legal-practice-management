import React, { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../foundation/AuthContext';
import { useNavigation, CaseDossierTab } from '../foundation/NavigationContext';
import { getRepositories } from '../../data/repositories';
import {
  AuditLogRecord,
  CaseRecord,
  CaseShareRecord,
  ClientRecord,
  HearingRecord,
  HearingStatus,
  PhysicalFileRecord,
  TaskRecord,
  UserRecord,
} from '../../data/types';
import { isLawyerOrOwner } from '../../rolePresets';
import { EntityLink } from '../../components/EntityLink';
import { Breadcrumbs } from '../../components/Breadcrumbs';
import { ClientAvatar } from '../../components/ClientAvatar';
import { formatCasePartyTitle } from '../../data/caseRoles';
import { getFixedForLabel } from '../../data/hearingFixedFor';
import { CaseNotesTab } from './CaseNotesTab';
import {
  Briefcase,
  Building,
  User,
  Calendar,
  CheckSquare,
  FolderArchive,
  Bell,
  Lock,
  Edit2,
  Trash2,
  Scale,
  FileText,
  Clock,
  Share2,
  UserPlus,
  X,
  Plus,
  History,
  CalendarClock,
  ArrowRightCircle,
  CheckCircle2,
  RotateCcw,
  LogOut,
  LogIn,
  Activity,
  AlertTriangle,
  RefreshCw,
  Check,
  Shield,
  CreditCard,
} from 'lucide-react';
import { BillingTab } from '../billing/BillingTab';

interface CaseDetailsViewProps {
  caseId: string;
  onBack: () => void;
  onEdit: (caseRecord: CaseRecord) => void;
  onDeleteSuccess: () => void;
}

export const CaseDetailsView: React.FC<CaseDetailsViewProps> = ({
  caseId,
  onBack,
  onEdit,
  onDeleteSuccess,
}) => {
  const { t, i18n } = useTranslation();
  const { currentUser, can, isReadOnly } = useAuth();
  const {
    route,
    openCaseDossier,
    refreshVersion,
    triggerRefresh,
    setActiveCaseContext,
    openHearingForm,
    openRescheduleHearing,
    openAdjournHearing,
    openHearingHistory,
    openTaskForm,
    openTaskComplete,
    openTaskReassign,
    openFileForm,
    openFileCheckOut,
    openFileCheckIn,
    openFileHistory,
  } = useNavigation();
  const repos = getRepositories();

  const activeTab: CaseDossierTab = route.caseId === caseId ? route.caseTab : 'overview';

  const [caseData, setCaseData] = useState<CaseRecord | null>(null);
  const [client, setClient] = useState<ClientRecord | null>(null);
  const [allClients, setAllClients] = useState<ClientRecord[]>([]);
  const [hearings, setHearings] = useState<HearingRecord[]>([]);
  const [tasks, setTasks] = useState<TaskRecord[]>([]);
  const [files, setFiles] = useState<PhysicalFileRecord[]>([]);
  const [activityLogs, setActivityLogs] = useState<AuditLogRecord[]>([]);
  const [counts, setCounts] = useState({
    hearingsCount: 0,
    tasksCount: 0,
    filesCount: 0,
    remindersCount: 0,
    notesCount: 0,
  });
  const [loading, setLoading] = useState(true);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [shares, setShares] = useState<CaseShareRecord[]>([]);
  const [firmLawyers, setFirmLawyers] = useState<UserRecord[]>([]);
  const [allUsers, setAllUsers] = useState<UserRecord[]>([]);
  const [selectedShareUserId, setSelectedShareUserId] = useState<string>('');
  const [sharingBusy, setSharingBusy] = useState(false);

  // Client change state
  const [changingClient, setChangingClient] = useState(false);
  const [selectedNewClientId, setSelectedNewClientId] = useState('');
  const [savingClientChange, setSavingClientChange] = useState(false);

  // Outcome note inline edit state
  const [editingOutcomeHearingId, setEditingOutcomeHearingId] = useState<string | null>(null);
  const [outcomeDraft, setOutcomeDraft] = useState('');
  const [savingOutcome, setSavingOutcome] = useState(false);

  const canEditCase = can('cases.edit');
  const canDeleteCase = can('cases.delete');
  const canUpdateHearings = can('hearings.update');
  const canAssignTasks = can('tasks.assign');
  const canCompleteTasks = can('tasks.complete');
  const canManageFiles = can('files.manage');

  const canManageShares =
    Boolean(caseData) &&
    !isReadOnly &&
    (currentUser.role === 'Owner' ||
      can('settings.manage') ||
      caseData?.responsibleLawyerId === currentUser.id);

  const loadCaseDetails = useCallback(async () => {
    setLoading(true);
    setErrorMsg(null);
    try {
      const c = await repos.case.getById({ currentUser }, caseId);
      setCaseData(c);
      if (c) {
        setActiveCaseContext({
          caseId: c.id,
          clientId: c.clientId,
          caseNumber: c.caseNumber,
        });
        setSelectedNewClientId(c.clientId);

        const [
          linkedCounts,
          cl,
          clientsList,
          usersList,
          caseHearings,
          caseTasks,
          caseFiles,
          caseAudit,
          caseNotesRes,
        ] = await Promise.all([
          repos.case.getLinkedCounts({ currentUser }, caseId),
          repos.client.getById({ currentUser }, c.clientId).catch(() => null),
          repos.client.list({ currentUser }).catch(() => []),
          repos.user.list({ currentUser }).catch(() => []),
          repos.hearing.list({ currentUser }, { caseId }).catch(() => []),
          repos.task.list({ currentUser }, { caseId }).catch(() => []),
          repos.physicalFile.list({ currentUser }, { caseId }).catch(() => []),
          repos.auditLog.listByCaseId
            ? repos.auditLog.listByCaseId({ currentUser }, caseId).catch(() => [])
            : Promise.resolve([]),
          repos.case.listNotes
            ? repos.case.listNotes({ currentUser }, caseId, { limit: 1 }).catch(() => ({ notes: [], total: 0 }))
            : Promise.resolve({ notes: [], total: 0 }),
        ]);

        setCounts({
          ...linkedCounts,
          notesCount: caseNotesRes?.total ?? 0,
        });
        setClient(cl);
        setAllClients(clientsList);
        setAllUsers(usersList);
        setHearings(caseHearings);
        setTasks(caseTasks);
        setFiles(caseFiles);
        setActivityLogs(caseAudit);
        setFirmLawyers(
          usersList.filter(
            (u: UserRecord) => (u.status ?? 'active') === 'active' && isLawyerOrOwner(u)
          )
        );

        if (repos.case.listShares) {
          try {
            const shareList = await repos.case.listShares({ currentUser }, caseId);
            setShares(shareList);
          } catch {
            setShares([]);
          }
        }
      } else {
        setActiveCaseContext(null);
      }
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : 'Failed to load case details');
      setCaseData(null);
      setActiveCaseContext(null);
    } finally {
      setLoading(false);
    }
  }, [caseId, currentUser, repos, setActiveCaseContext]);

  useEffect(() => {
    loadCaseDetails();
    return () => {
      setActiveCaseContext(null);
    };
  }, [loadCaseDetails, refreshVersion, setActiveCaseContext]);

  const handleTabSelect = (tab: CaseDossierTab) => {
    openCaseDossier(caseId, tab);
  };

  const handleShareCase = async () => {
    if (!selectedShareUserId || !repos.case.shareCase || isReadOnly) return;
    setSharingBusy(true);
    try {
      await repos.case.shareCase({ currentUser }, caseId, selectedShareUserId);
      setSelectedShareUserId('');
      triggerRefresh();
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : 'Failed to share case');
    } finally {
      setSharingBusy(false);
    }
  };

  const handleUnshareCase = async (shareIdOrUserId: string) => {
    if (!repos.case.unshareCase || isReadOnly) return;
    setSharingBusy(true);
    try {
      await repos.case.unshareCase({ currentUser }, caseId, shareIdOrUserId);
      triggerRefresh();
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : 'Failed to remove share');
    } finally {
      setSharingBusy(false);
    }
  };

  const handleDelete = async () => {
    if (!canDeleteCase || isReadOnly) return;
    setDeleting(true);
    try {
      await repos.case.delete({ currentUser }, caseId);
      triggerRefresh();
      onDeleteSuccess();
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : 'Delete failed');
      setDeleting(false);
    }
  };

  const handleReopenCase = async () => {
    if (!canEditCase || isReadOnly) return;
    try {
      await repos.case.update({ currentUser }, caseId, {
        status: 'ongoing',
        closedOn: null,
      });
      triggerRefresh();
      await loadCaseDetails();
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : 'Failed to reopen case');
    }
  };

  const handleSaveClientChange = async () => {
    if (!caseData || !canEditCase || isReadOnly || !selectedNewClientId) return;
    setSavingClientChange(true);
    setErrorMsg(null);
    try {
      await repos.case.update({ currentUser }, caseData.id, { clientId: selectedNewClientId });
      setChangingClient(false);
      triggerRefresh();
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : 'Failed to change linked client');
    } finally {
      setSavingClientChange(false);
    }
  };

  const handleHearingStatusChange = async (hearing: HearingRecord, newStatus: HearingStatus) => {
    if (!canUpdateHearings || isReadOnly) return;
    try {
      await repos.hearing.update({ currentUser }, hearing.id, { status: newStatus });
      triggerRefresh();
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : 'Failed to update hearing status');
    }
  };

  const handleSaveOutcomeNote = async (hearingId: string) => {
    if (!canUpdateHearings || isReadOnly) return;
    setSavingOutcome(true);
    try {
      await repos.hearing.update({ currentUser }, hearingId, {
        outcomeNote: outcomeDraft.trim(),
      });
      setEditingOutcomeHearingId(null);
      triggerRefresh();
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : 'Failed to save outcome note');
    } finally {
      setSavingOutcome(false);
    }
  };

  const handleReopenTask = async (task: TaskRecord) => {
    if ((!canCompleteTasks && !canAssignTasks) || isReadOnly) return;
    try {
      await repos.task.update({ currentUser }, task.id, {
        status: 'pending',
        completedAt: null,
      });
      triggerRefresh();
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : 'Failed to reopen task');
    }
  };

  if (loading && !caseData) {
    return (
      <div className="p-8 text-center text-slate-400 text-sm">
        {t('common.loading')}
      </div>
    );
  }

  if (errorMsg && !caseData) {
    return (
      <div className="bg-white rounded-2xl border border-slate-200 p-8 text-center space-y-4">
        <div className="w-12 h-12 rounded-full bg-rose-50 text-rose-600 flex items-center justify-center mx-auto">
          <Lock className="w-6 h-6" />
        </div>
        <h3 className="text-base font-bold text-slate-900">
          {errorMsg || 'Case not found'}
        </h3>
        <button
          onClick={onBack}
          className="px-4 py-2 bg-slate-900 text-white text-xs font-semibold rounded-lg"
        >
          {t('common.back')}
        </button>
      </div>
    );
  }

  if (!caseData) return null;

  const responsibleLawyer = allUsers.find((u) => u.id === caseData.responsibleLawyerId);

  const tabDefinitions: Array<{
    id: CaseDossierTab;
    label: string;
    count?: number;
    icon: React.FC<{ className?: string }>;
  }> = [
    { id: 'overview', label: t('hub.tabOverview', 'Overview'), icon: Briefcase },
    {
      id: 'hearings',
      label: t('cases.linkedHearings', 'Hearings'),
      count: hearings.length,
      icon: Calendar,
    },
    {
      id: 'tasks',
      label: t('cases.linkedTasks', 'Tasks'),
      count: tasks.length,
      icon: CheckSquare,
    },
    {
      id: 'files',
      label: t('cases.linkedFiles', 'Files'),
      count: files.length,
      icon: FolderArchive,
    },
    {
      id: 'notes',
      label: t('cases.notesTab', 'Notes'),
      count: counts.notesCount,
      icon: FileText,
    },
    {
      id: 'activity',
      label: t('hub.tabActivity', 'Activity'),
      count: activityLogs.length,
      icon: Activity,
    },
    ...(can('accounts.view')
      ? [
          {
            id: 'billing' as CaseDossierTab,
            label: t('nav.billing', 'Billing'),
            icon: CreditCard,
          },
        ]
      : []),
  ];

  return (
    <div className="space-y-5 min-w-0" data-testid="case-dossier-hub">
      {/* Breadcrumbs & Back Button */}
      <Breadcrumbs
        fallbackPath="/cases"
        onBackOverride={onBack}
        items={[
          { label: t('nav.cases'), href: '/cases' },
          {
            label: caseData.caseNumber,
            href: `/cases/${encodeURIComponent(caseData.id)}/overview`,
          },
          {
            label:
              tabDefinitions.find((td) => td.id === activeTab)?.label ||
              t('hub.tabOverview', 'Overview'),
          },
        ]}
      />

      {/* Read-Only Subscription Banner inside Hub if expired */}
      {isReadOnly && (
        <div
          data-testid="hub-readonly-banner"
          className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-amber-800 text-xs flex items-center gap-2"
        >
          <AlertTriangle className="w-4 h-4 shrink-0 text-amber-600" />
          <span>{t('subscription.readOnlyMessage')}</span>
        </div>
      )}

      {errorMsg && (
        <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-rose-700 text-xs flex items-center justify-between gap-2">
          <span>{errorMsg}</span>
          <button onClick={() => setErrorMsg(null)} className="text-rose-500 hover:text-rose-800">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Case Header Card — ONE clear Edit button for the case itself */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
        <div className="p-4 sm:p-6 bg-slate-900 text-white">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="space-y-1.5 min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className="px-2.5 py-0.5 rounded-md bg-slate-800 text-slate-300 font-mono text-xs border border-slate-700">
                  {caseData.fileSerial}
                </span>
                <span
                  className={`px-2.5 py-0.5 rounded-full text-xs font-bold uppercase tracking-wider ${
                    caseData.status === 'ongoing'
                      ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                      : caseData.status === 'pending'
                      ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                      : 'bg-slate-700 text-slate-300'
                  }`}
                >
                  {caseData.status === 'ongoing'
                    ? t('cases.statusOngoing')
                    : caseData.status === 'pending'
                    ? t('cases.statusPending', 'Pending')
                    : t('cases.statusClosed')}
                </span>
                {caseData.caseCategory && (
                  <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 capitalize">
                    {caseData.caseCategory === 'criminal_gr'
                      ? 'Criminal (GR)'
                      : caseData.caseCategory === 'criminal_cr'
                      ? 'Criminal (CR)'
                      : caseData.caseCategory}
                  </span>
                )}
                {caseData.restricted && (
                  <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-500/20 text-amber-300 border border-amber-500/30">
                    <Lock className="w-3 h-3" />
                    {t('cases.restrictedBadge')}
                  </span>
                )}
              </div>
              <h1 className="text-lg sm:text-2xl font-bold tracking-tight break-words">
                {caseData.caseNumber}
              </h1>
              <p className="text-sm font-semibold text-slate-200">
                {formatCasePartyTitle(caseData)}
              </p>
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-slate-300 text-xs sm:text-sm">
                <span className="inline-flex items-center gap-1.5">
                  <Building className="w-4 h-4 text-slate-400 shrink-0" />
                  <span className="break-words">{caseData.court}</span>
                </span>
                {client && (
                  <span className="inline-flex items-center gap-1.5">
                    <ClientAvatar clientId={client.id} clientName={client.name} size="xs" />
                    <EntityLink
                      type="client"
                      id={client.id}
                      label={client.name}
                      className="text-amber-300 hover:text-amber-200 font-semibold"
                    />
                  </span>
                )}
                {caseData.caseDate && (
                  <span className="inline-flex items-center gap-1">
                    <Calendar className="w-3.5 h-3.5 text-slate-400" />
                    <span>Filed: {caseData.caseDate}</span>
                  </span>
                )}
                {caseData.status === 'closed' && caseData.closedOn && (
                  <span className="text-slate-400">
                    Closed: {caseData.closedOn}
                  </span>
                )}
              </div>
              {(caseData.policeStation || caseData.sectionsOfLaw) && (
                <div className="flex flex-wrap items-center gap-3 text-xs text-slate-300 pt-0.5">
                  {caseData.policeStation && (
                    <span className="inline-flex items-center gap-1">
                      <Shield className="w-3.5 h-3.5 text-slate-400" />
                      <span>PS: {caseData.policeStation}</span>
                    </span>
                  )}
                  {caseData.sectionsOfLaw && (
                    <span className="inline-flex items-center gap-1">
                      <Scale className="w-3.5 h-3.5 text-slate-400" />
                      <span>Sec: {caseData.sectionsOfLaw}</span>
                    </span>
                  )}
                </div>
              )}
            </div>

            {/* Single Case Edit + Delete Actions in Header */}
            <div className="flex flex-wrap items-center gap-2 shrink-0">
              {caseData.status === 'closed' && canEditCase && (
                <button
                  type="button"
                  data-testid="case-header-reopen-btn"
                  disabled={isReadOnly}
                  title={t('cases.reopenMatter', 'Reopen / Restore Matter')}
                  onClick={handleReopenCase}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold rounded-xl transition disabled:opacity-40 disabled:cursor-not-allowed min-h-[38px] shadow-xs"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span>{t('cases.reopenMatter', 'Reopen / Restore Matter')}</span>
                </button>
              )}

              {canEditCase && (
                <button
                  type="button"
                  data-testid="case-header-edit-btn"
                  disabled={isReadOnly}
                  title={isReadOnly ? t('subscription.readOnlyMessage') : t('cases.editCase')}
                  onClick={() => {
                    if (!isReadOnly && canEditCase) onEdit(caseData);
                  }}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-white/10 hover:bg-white/20 text-white text-xs font-semibold rounded-xl transition disabled:opacity-40 disabled:cursor-not-allowed min-h-[38px]"
                >
                  <Edit2 className="w-3.5 h-3.5" />
                  <span>{t('common.edit')}</span>
                </button>
              )}

              {canDeleteCase && !confirmDelete && (
                <button
                  type="button"
                  disabled={isReadOnly}
                  title={isReadOnly ? t('subscription.readOnlyMessage') : t('common.delete')}
                  onClick={() => setConfirmDelete(true)}
                  className="inline-flex items-center gap-1.5 px-3 py-2 bg-rose-500/20 hover:bg-rose-500/30 text-rose-200 text-xs font-semibold rounded-xl border border-rose-500/30 transition disabled:opacity-40 disabled:cursor-not-allowed min-h-[38px]"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">{t('common.delete')}</span>
                </button>
              )}

              {confirmDelete && (
                <div className="flex items-center gap-2 bg-rose-950/90 border border-rose-500/40 px-3 py-1.5 rounded-xl">
                  <span className="text-xs text-rose-200 font-medium">
                    {t('cases.confirmDeleteTitle')}
                  </span>
                  <button
                    type="button"
                    onClick={handleDelete}
                    disabled={deleting || isReadOnly}
                    className="px-2.5 py-1 bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold rounded-lg"
                  >
                    {deleting ? '...' : t('common.yes')}
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirmDelete(false)}
                    className="px-2 py-1 text-slate-300 hover:text-white text-xs"
                  >
                    {t('common.no')}
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Dossier 5-Tab Bar */}
        <div
          role="tablist"
          aria-label="Case dossier tabs"
          className="flex items-center gap-1 px-3 sm:px-6 bg-slate-50 border-b border-slate-200 overflow-x-auto no-scrollbar"
        >
          {tabDefinitions.map((tab) => {
            const Icon = tab.icon;
            const isSelected = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                role="tab"
                type="button"
                aria-selected={isSelected}
                data-testid={`dossier-tab-${tab.id}`}
                onClick={() => handleTabSelect(tab.id)}
                className={`inline-flex items-center gap-1.5 px-3 sm:px-4 py-3 text-xs sm:text-sm font-semibold border-b-2 transition whitespace-nowrap shrink-0 min-h-[44px] ${
                  isSelected
                    ? 'border-slate-900 text-slate-900 bg-white/60'
                    : 'border-transparent text-slate-500 hover:text-slate-800 hover:border-slate-300'
                }`}
              >
                <Icon className="w-4 h-4 shrink-0" />
                <span>{tab.label}</span>
                {tab.count !== undefined && (
                  <span
                    className={`px-1.5 py-0.5 text-[10px] rounded-full font-bold ${
                      isSelected
                        ? 'bg-slate-900 text-white'
                        : 'bg-slate-200/80 text-slate-600'
                    }`}
                  >
                    {tab.count}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* TAB 1: OVERVIEW */}
        {activeTab === 'overview' && (
          <div className="p-4 sm:p-6 space-y-6" data-testid="dossier-panel-overview">
            {/* Summary Metric Cards — Clickable to jump directly to the tab */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <button
                type="button"
                onClick={() => handleTabSelect('hearings')}
                className="p-3.5 rounded-xl bg-slate-50 hover:bg-indigo-50/50 border border-slate-200/80 flex items-center gap-3 text-left transition group"
              >
                <div className="w-9 h-9 rounded-lg bg-indigo-50 text-indigo-700 flex items-center justify-center shrink-0">
                  <Calendar className="w-4 h-4" />
                </div>
                <div className="min-w-0">
                  <div className="text-lg font-bold text-slate-900 group-hover:text-indigo-700">
                    {hearings.length}
                  </div>
                  <div className="text-xs text-slate-500 truncate">
                    {t('cases.linkedHearings')}
                  </div>
                </div>
              </button>

              <button
                type="button"
                onClick={() => handleTabSelect('tasks')}
                className="p-3.5 rounded-xl bg-slate-50 hover:bg-emerald-50/50 border border-slate-200/80 flex items-center gap-3 text-left transition group"
              >
                <div className="w-9 h-9 rounded-lg bg-emerald-50 text-emerald-700 flex items-center justify-center shrink-0">
                  <CheckSquare className="w-4 h-4" />
                </div>
                <div className="min-w-0">
                  <div className="text-lg font-bold text-slate-900 group-hover:text-emerald-700">
                    {tasks.length}
                  </div>
                  <div className="text-xs text-slate-500 truncate">
                    {t('cases.linkedTasks')}
                  </div>
                </div>
              </button>

              <button
                type="button"
                onClick={() => handleTabSelect('files')}
                className="p-3.5 rounded-xl bg-slate-50 hover:bg-amber-50/50 border border-slate-200/80 flex items-center gap-3 text-left transition group"
              >
                <div className="w-9 h-9 rounded-lg bg-amber-50 text-amber-700 flex items-center justify-center shrink-0">
                  <FolderArchive className="w-4 h-4" />
                </div>
                <div className="min-w-0">
                  <div className="text-lg font-bold text-slate-900 group-hover:text-amber-700">
                    {files.length}
                  </div>
                  <div className="text-xs text-slate-500 truncate">
                    {t('cases.linkedFiles')}
                  </div>
                </div>
              </button>

              <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200/80 flex items-center gap-3">
                <div className="w-9 h-9 rounded-lg bg-purple-50 text-purple-700 flex items-center justify-center shrink-0">
                  <Bell className="w-4 h-4" />
                </div>
                <div className="min-w-0">
                  <div className="text-lg font-bold text-slate-900">
                    {counts.remindersCount}
                  </div>
                  <div className="text-xs text-slate-500 truncate">
                    {t('cases.linkedReminders')}
                  </div>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Matter Details & Client Hub Card */}
              <div className="space-y-4">
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
                  <Briefcase className="w-3.5 h-3.5" />
                  {t('cases.matterType')} & {t('cases.linkedClient')}
                </h3>

                <div className="p-4 rounded-xl bg-slate-50 border border-slate-200/70 space-y-3">
                  <div>
                    <div className="text-xs text-slate-500">{t('cases.matterType')}</div>
                    <div className="text-sm font-semibold text-slate-900 mt-0.5">
                      {caseData.matterType}
                    </div>
                  </div>

                  {/* Linked Client with Open Profile & Change Linked Client */}
                  <div className="pt-2 border-t border-slate-200/60">
                    <div className="flex items-center justify-between gap-2">
                      <div className="text-xs text-slate-500">{t('cases.linkedClient')}</div>
                      {canEditCase && !changingClient && (
                        <button
                          type="button"
                          disabled={isReadOnly}
                          data-testid="change-linked-client-btn"
                          onClick={() => {
                            setSelectedNewClientId(caseData.clientId);
                            setChangingClient(true);
                          }}
                          className="inline-flex items-center gap-1 text-[11px] font-semibold text-indigo-600 hover:text-indigo-800 disabled:opacity-40"
                        >
                          <RefreshCw className="w-3 h-3" />
                          <span>{t('hub.changeClient', 'Change Client')}</span>
                        </button>
                      )}
                    </div>

                    {!changingClient ? (
                      <div className="mt-1 flex flex-wrap items-center justify-between gap-2">
                        {client ? (
                          <div className="min-w-0">
                            <EntityLink
                              type="client"
                              id={client.id}
                              label={`${client.name}${client.nameBn ? ` (${client.nameBn})` : ''}`}
                              showIcon
                              showExternalIcon
                              className="text-sm"
                            />
                            <div className="text-xs text-slate-500 mt-0.5">{client.phone}</div>
                          </div>
                        ) : (
                          <span className="text-xs text-slate-400">{t('common.none')}</span>
                        )}
                      </div>
                    ) : (
                      <div className="mt-2 space-y-2 bg-white p-2.5 rounded-lg border border-slate-200">
                        <select
                          value={selectedNewClientId}
                          onChange={(e) => setSelectedNewClientId(e.target.value)}
                          data-testid="change-linked-client-select"
                          className="w-full min-h-[38px] bg-slate-50 border border-slate-300 rounded-lg px-2.5 py-1.5 text-xs text-slate-900"
                        >
                          {allClients.map((cl) => (
                            <option key={cl.id} value={cl.id}>
                              {cl.name} {cl.nameBn ? `(${cl.nameBn})` : ''} - {cl.phone}
                            </option>
                          ))}
                        </select>
                        <div className="flex items-center justify-end gap-2">
                          <button
                            type="button"
                            onClick={() => setChangingClient(false)}
                            className="px-2.5 py-1 text-xs font-medium text-slate-600 hover:bg-slate-100 rounded-md"
                          >
                            {t('common.cancel')}
                          </button>
                          <button
                            type="button"
                            disabled={savingClientChange || isReadOnly}
                            data-testid="save-linked-client-btn"
                            onClick={handleSaveClientChange}
                            className="inline-flex items-center gap-1 px-3 py-1 bg-slate-900 text-white text-xs font-semibold rounded-md disabled:opacity-50"
                          >
                            <Check className="w-3 h-3" />
                            <span>{t('common.save')}</span>
                          </button>
                        </div>
                      </div>
                    )}
                  </div>

                  <div className="pt-2 border-t border-slate-200/60">
                    <div className="text-xs text-slate-500">{t('cases.responsibleLawyer')}</div>
                    <div className="text-sm font-medium text-slate-800 mt-0.5">
                      {responsibleLawyer
                        ? responsibleLawyer.name
                        : t('cases.unassignedLawyer')}
                    </div>
                  </div>

                  <div className="pt-2 border-t border-slate-200/60">
                    <div className="text-xs text-slate-500 flex items-center gap-1">
                      <Clock className="w-3.5 h-3.5 text-amber-600" />
                      {t('cases.nextHearing')}
                    </div>
                    <div
                      data-testid="case-next-hearing-value"
                      className="text-sm font-semibold text-slate-900 mt-0.5"
                    >
                      {caseData.nextHearingAt
                        ? new Date(caseData.nextHearingAt).toLocaleString()
                        : t('cases.noUpcomingHearing')}
                    </div>
                  </div>
                </div>
              </div>

              {/* Opposing Parties & Representation */}
              <div className="space-y-4">
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
                  <Scale className="w-3.5 h-3.5" />
                  {t('cases.partiesSection')}
                </h3>

                <div className="p-4 rounded-xl bg-slate-50 border border-slate-200/70 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-slate-500">{t('cases.ourRole')}</span>
                    <span className="px-2.5 py-0.5 bg-indigo-50 text-indigo-700 border border-indigo-200 rounded-md text-xs font-bold">
                      {caseData.ourRole}
                    </span>
                  </div>

                  <div className="pt-2 border-t border-slate-200/60 grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <div className="text-[11px] font-semibold text-emerald-700 uppercase">
                        {caseData.partyARole || t('cases.plaintiff')}
                      </div>
                      <div className="text-sm font-semibold text-slate-900 mt-0.5 break-words">
                        {caseData.plaintiff}
                      </div>
                      {caseData.plaintiffLawyer && (
                        <div className="text-xs text-slate-500 mt-1">
                          Adv: {caseData.plaintiffLawyer}
                        </div>
                      )}
                    </div>

                    <div>
                      <div className="text-[11px] font-semibold text-rose-700 uppercase">
                        {caseData.partyBRole || t('cases.defendant')}
                      </div>
                      <div className="text-sm font-semibold text-slate-900 mt-0.5 break-words">
                        {caseData.defendant}
                      </div>
                      {caseData.defendantLawyer && (
                        <div className="text-xs text-slate-500 mt-1">
                          Adv: {caseData.defendantLawyer}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Case Summary & Notes */}
            {caseData.description && (
              <div className="space-y-2">
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
                  <FileText className="w-3.5 h-3.5" />
                  {t('cases.description')}
                </h3>
                <div className="p-4 rounded-xl bg-slate-50 border border-slate-200/70 text-sm text-slate-700 leading-relaxed whitespace-pre-line">
                  {caseData.description}
                </div>
              </div>
            )}

            {/* Case Sharing Section */}
            <div className="space-y-3 pt-2 border-t border-slate-100">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
                  <Share2 className="w-3.5 h-3.5" />
                  {t('cases.sharedWith')}
                </h3>
              </div>

              <div className="p-4 rounded-xl bg-slate-50 border border-slate-200/70 space-y-3">
                {shares.length === 0 ? (
                  <p className="text-xs text-slate-500">{t('cases.noSharedLawyers')}</p>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    {shares.map((sh) => {
                      const sharedLawyer = firmLawyers.find((u) => u.id === sh.userId);
                      return (
                        <span
                          key={sh.id}
                          className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-white border border-slate-200 text-xs font-medium text-slate-700 shadow-2xs"
                        >
                          <User className="w-3 h-3 text-slate-400" />
                          <span>{sharedLawyer ? sharedLawyer.name : sh.userId}</span>
                          {canManageShares && (
                            <button
                              type="button"
                              onClick={() => handleUnshareCase(sh.userId)}
                              disabled={sharingBusy}
                              title={t('cases.unshareAction')}
                              className="text-slate-400 hover:text-rose-600 ml-1"
                            >
                              <X className="w-3 h-3" />
                            </button>
                          )}
                        </span>
                      );
                    })}
                  </div>
                )}

                {canManageShares && (
                  <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-slate-200/60">
                    <select
                      value={selectedShareUserId}
                      onChange={(e) => setSelectedShareUserId(e.target.value)}
                      className="bg-white border border-slate-300 rounded-lg px-3 py-1.5 text-xs text-slate-800 focus:outline-hidden min-h-[36px]"
                    >
                      <option value="">{t('cases.shareWithLawyer')}...</option>
                      {firmLawyers
                        .filter(
                          (lw) =>
                            lw.id !== caseData.responsibleLawyerId &&
                            !shares.some((s) => s.userId === lw.id)
                        )
                        .map((lw) => (
                          <option key={lw.id} value={lw.id}>
                            {lw.name}
                          </option>
                        ))}
                    </select>
                    <button
                      type="button"
                      onClick={handleShareCase}
                      disabled={!selectedShareUserId || sharingBusy}
                      className="inline-flex items-center gap-1 px-3 py-1.5 bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold rounded-lg disabled:opacity-50 min-h-[36px]"
                    >
                      <UserPlus className="w-3.5 h-3.5" />
                      <span>{t('cases.shareAction')}</span>
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* TAB 2: HEARINGS */}
        {activeTab === 'hearings' && (
          <div className="p-4 sm:p-6 space-y-4" data-testid="dossier-panel-hearings">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h3 className="text-sm font-bold text-slate-900">
                  {t('cases.linkedHearings')} ({hearings.length})
                </h3>
                <p className="text-xs text-slate-500">
                  {t('hearings.subtitle')}
                </p>
              </div>
              {canUpdateHearings && (
                <button
                  type="button"
                  data-testid="dossier-add-hearing-btn"
                  disabled={isReadOnly}
                  title={isReadOnly ? t('subscription.readOnlyMessage') : t('hearings.addHearing')}
                  onClick={() =>
                    openHearingForm({
                      defaultCaseId: caseData.id,
                      lockCaseId: true,
                    })
                  }
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold rounded-xl shadow-2xs transition disabled:opacity-40 disabled:cursor-not-allowed min-h-[38px]"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>{t('hearings.addHearing')}</span>
                </button>
              )}
            </div>

            {hearings.length === 0 ? (
              <div className="p-8 text-center bg-slate-50 rounded-xl border border-slate-200/80 text-slate-500 text-xs">
                {t('hearings.emptyHearings')}
              </div>
            ) : (
              <div className="space-y-3">
                {hearings.map((h) => {
                  const appearingLawyer = allUsers.find((u) => u.id === h.appearingLawyerId);
                  const isEditingOutcome = editingOutcomeHearingId === h.id;
                  return (
                    <div
                      key={h.id}
                      data-testid={`dossier-hearing-row-${h.id}`}
                      className="p-4 rounded-xl bg-slate-50 border border-slate-200/80 space-y-3"
                    >
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div className="space-y-1 min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <span
                              className={`px-2 py-0.5 rounded-full text-[11px] font-bold uppercase ${
                                h.status === 'scheduled'
                                  ? 'bg-indigo-100 text-indigo-800'
                                  : h.status === 'held'
                                    ? 'bg-emerald-100 text-emerald-800'
                                    : h.status === 'adjourned'
                                      ? 'bg-amber-100 text-amber-800'
                                      : 'bg-slate-200 text-slate-700'
                              }`}
                            >
                              {t(
                                `hearings.status${h.status.charAt(0).toUpperCase() + h.status.slice(1)}`
                              )}
                            </span>
                            <span className="text-xs font-bold text-slate-900">
                              {new Date(h.scheduledAt).toLocaleString()}
                            </span>
                            {h.fixedFor && (
                              <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium bg-blue-50 text-blue-700 border border-blue-200">
                                {getFixedForLabel(h.fixedFor, i18n.language as 'en' | 'bn')}
                                {h.fixedForNote ? ` (${h.fixedForNote})` : ''}
                              </span>
                            )}
                          </div>
                          <div className="text-sm font-semibold text-slate-900 break-words">
                            {h.purpose}
                          </div>
                          {appearingLawyer && (
                            <div className="text-xs text-slate-500">
                              {t('hearings.appearingLawyer')}: {appearingLawyer.name}
                            </div>
                          )}
                        </div>

                        {/* Hearing Per-Row Hub Actions */}
                        <div className="flex flex-wrap items-center gap-1.5">
                          {canUpdateHearings && (
                            <>
                              <button
                                type="button"
                                disabled={isReadOnly}
                                data-testid={`hearing-reschedule-btn-${h.id}`}
                                onClick={() =>
                                  openRescheduleHearing(
                                    h,
                                    `${caseData.caseNumber} (${caseData.court})`
                                  )
                                }
                                className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-white border border-slate-200 hover:bg-slate-100 text-slate-700 text-xs font-semibold disabled:opacity-40 min-h-[34px]"
                              >
                                <CalendarClock className="w-3.5 h-3.5 text-indigo-600" />
                                <span>{t('hearings.reschedule')}</span>
                              </button>

                              {h.status === 'scheduled' && (
                                <button
                                  type="button"
                                  disabled={isReadOnly}
                                  onClick={() =>
                                    openAdjournHearing(
                                      h,
                                      `${caseData.caseNumber} (${caseData.court})`
                                    )
                                  }
                                  className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-white border border-slate-200 hover:bg-slate-100 text-slate-700 text-xs font-semibold disabled:opacity-40 min-h-[34px]"
                                >
                                  <ArrowRightCircle className="w-3.5 h-3.5 text-amber-600" />
                                  <span>{t('hearings.adjournAndNext')}</span>
                                </button>
                              )}

                              {/* Mark Held / Adjourned / Cancelled */}
                              <select
                                aria-label="Change hearing status"
                                disabled={isReadOnly}
                                data-testid={`hearing-status-select-${h.id}`}
                                value={h.status}
                                onChange={(e) =>
                                  handleHearingStatusChange(h, e.target.value as HearingStatus)
                                }
                                className="px-2.5 py-1.5 rounded-lg bg-white border border-slate-200 text-slate-700 text-xs font-semibold disabled:opacity-40 min-h-[34px]"
                              >
                                <option value="scheduled">{t('hearings.statusScheduled')}</option>
                                <option value="held">{t('hearings.statusHeld')}</option>
                                <option value="adjourned">{t('hearings.statusAdjourned')}</option>
                                <option value="cancelled">{t('hearings.statusCancelled')}</option>
                              </select>

                              <button
                                type="button"
                                disabled={isReadOnly}
                                data-testid={`hearing-edit-outcome-btn-${h.id}`}
                                onClick={() => {
                                  setEditingOutcomeHearingId(h.id);
                                  setOutcomeDraft(h.outcomeNote || '');
                                }}
                                className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-white border border-slate-200 hover:bg-slate-100 text-slate-700 text-xs font-semibold disabled:opacity-40 min-h-[34px]"
                              >
                                <Edit2 className="w-3 h-3" />
                                <span>{t('hearings.outcomeNote')}</span>
                              </button>
                            </>
                          )}

                          <button
                            type="button"
                            data-testid={`hearing-history-btn-${h.id}`}
                            onClick={() =>
                              openHearingHistory(
                                h,
                                `${caseData.caseNumber} (${caseData.court})`
                              )
                            }
                            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-white border border-slate-200 hover:bg-slate-100 text-slate-600 text-xs font-semibold min-h-[34px]"
                          >
                            <History className="w-3.5 h-3.5" />
                            <span>{t('hearings.dateHistory')}</span>
                          </button>
                        </div>
                      </div>

                      {/* Outcome Note Display or Editor */}
                      {isEditingOutcome ? (
                        <div className="pt-2 border-t border-slate-200/70 space-y-2">
                          <textarea
                            rows={2}
                            value={outcomeDraft}
                            onChange={(e) => setOutcomeDraft(e.target.value)}
                            placeholder={t('hearings.outcomeNote')}
                            className="w-full p-2.5 text-xs bg-white border border-slate-300 rounded-lg"
                          />
                          <div className="flex items-center justify-end gap-2">
                            <button
                              type="button"
                              onClick={() => setEditingOutcomeHearingId(null)}
                              className="px-2.5 py-1 text-xs text-slate-600 hover:bg-slate-200 rounded-md"
                            >
                              {t('common.cancel')}
                            </button>
                            <button
                              type="button"
                              disabled={savingOutcome || isReadOnly}
                              onClick={() => handleSaveOutcomeNote(h.id)}
                              className="px-3 py-1 bg-slate-900 text-white text-xs font-semibold rounded-md"
                            >
                              {t('common.save')}
                            </button>
                          </div>
                        </div>
                      ) : (
                        h.outcomeNote && (
                          <div className="pt-2 border-t border-slate-200/60 text-xs text-slate-600">
                            <span className="font-semibold text-slate-700">
                              {t('hearings.outcomeNote')}:
                            </span>{' '}
                            {h.outcomeNote}
                          </div>
                        )
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* TAB 3: TASKS */}
        {activeTab === 'tasks' && (
          <div className="p-4 sm:p-6 space-y-4" data-testid="dossier-panel-tasks">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h3 className="text-sm font-bold text-slate-900">
                  {t('cases.linkedTasks')} ({tasks.length})
                </h3>
                <p className="text-xs text-slate-500">{t('tasks.subtitle')}</p>
              </div>
              {canAssignTasks && (
                <button
                  type="button"
                  data-testid="dossier-add-task-btn"
                  disabled={isReadOnly}
                  title={isReadOnly ? t('subscription.readOnlyMessage') : t('tasks.addTask')}
                  onClick={() =>
                    openTaskForm({
                      defaultCaseId: caseData.id,
                      defaultClientId: caseData.clientId,
                      lockCaseAndClient: true,
                    })
                  }
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold rounded-xl shadow-2xs transition disabled:opacity-40 disabled:cursor-not-allowed min-h-[38px]"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>{t('tasks.addTask')}</span>
                </button>
              )}
            </div>

            {tasks.length === 0 ? (
              <div className="p-8 text-center bg-slate-50 rounded-xl border border-slate-200/80 text-slate-500 text-xs">
                {t('tasks.noTasksFound')}
              </div>
            ) : (
              <div className="space-y-3">
                {tasks.map((task) => {
                  const isCompleted = task.status === 'completed';
                  return (
                    <div
                      key={task.id}
                      data-testid={`dossier-task-row-${task.id}`}
                      className="p-4 rounded-xl bg-slate-50 border border-slate-200/80 flex flex-wrap items-start justify-between gap-3"
                    >
                      <div className="space-y-1 min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span
                            className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${
                              task.priority === 'urgent' || task.priority === 'high'
                                ? 'bg-rose-100 text-rose-800'
                                : 'bg-slate-200 text-slate-700'
                            }`}
                          >
                            {t(`tasks.${task.priority}`)}
                          </span>
                          <span
                            className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${
                              isCompleted
                                ? 'bg-emerald-100 text-emerald-800'
                                : 'bg-amber-100 text-amber-800'
                            }`}
                          >
                            {t(`tasks.${task.status}`)}
                          </span>
                          <span className="text-xs text-slate-500">
                            {t('tasks.dueDate')}: {new Date(task.dueAt).toLocaleDateString()}
                          </span>
                        </div>
                        <div
                          className={`text-sm font-semibold break-words ${
                            isCompleted ? 'line-through text-slate-400' : 'text-slate-900'
                          }`}
                        >
                          {task.title}
                        </div>
                        <div className="text-xs text-slate-500">
                          {t('tasks.assignedTo')}: <span className="font-medium">{task.assignedToName}</span>
                        </div>
                        {task.description && (
                          <div className="text-xs text-slate-600 bg-white/80 px-2.5 py-1 rounded-md whitespace-pre-line">
                            {task.description}
                          </div>
                        )}
                      </div>

                      {/* Task Per-Row Hub Actions: Edit, Reassign, Complete, Reopen */}
                      <div className="flex flex-wrap items-center gap-1.5">
                        {canAssignTasks && (
                          <button
                            type="button"
                            disabled={isReadOnly}
                            data-testid={`task-edit-btn-${task.id}`}
                            onClick={() => openTaskForm({ initialData: task })}
                            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-white border border-slate-200 hover:bg-slate-100 text-slate-700 text-xs font-semibold disabled:opacity-40 min-h-[34px]"
                          >
                            <Edit2 className="w-3 h-3" />
                            <span>{t('common.edit')}</span>
                          </button>
                        )}

                        {canAssignTasks && !isCompleted && (
                          <button
                            type="button"
                            disabled={isReadOnly}
                            data-testid={`task-reassign-btn-${task.id}`}
                            onClick={() => openTaskReassign(task)}
                            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-white border border-slate-200 hover:bg-slate-100 text-slate-700 text-xs font-semibold disabled:opacity-40 min-h-[34px]"
                          >
                            <UserPlus className="w-3.5 h-3.5 text-indigo-600" />
                            <span>{t('tasks.reassignTask')}</span>
                          </button>
                        )}

                        {canCompleteTasks && !isCompleted && (
                          <button
                            type="button"
                            disabled={isReadOnly}
                            data-testid={`task-complete-btn-${task.id}`}
                            onClick={() => openTaskComplete(task)}
                            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold disabled:opacity-40 min-h-[34px]"
                          >
                            <CheckCircle2 className="w-3.5 h-3.5" />
                            <span>{t('tasks.completeTask')}</span>
                          </button>
                        )}

                        {(canCompleteTasks || canAssignTasks) && isCompleted && (
                          <button
                            type="button"
                            disabled={isReadOnly}
                            data-testid={`task-reopen-btn-${task.id}`}
                            onClick={() => handleReopenTask(task)}
                            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-white border border-slate-200 hover:bg-slate-100 text-slate-700 text-xs font-semibold disabled:opacity-40 min-h-[34px]"
                          >
                            <RotateCcw className="w-3.5 h-3.5 text-amber-600" />
                            <span>{t('hub.reopenTask', 'Reopen')}</span>
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* TAB 4: FILES */}
        {activeTab === 'files' && (
          <div className="p-4 sm:p-6 space-y-4" data-testid="dossier-panel-files">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h3 className="text-sm font-bold text-slate-900">
                  {t('cases.linkedFiles')} ({files.length})
                </h3>
                <p className="text-xs text-slate-500">{t('files.subtitle')}</p>
              </div>
              {canManageFiles && (
                <button
                  type="button"
                  data-testid="dossier-add-file-btn"
                  disabled={isReadOnly}
                  title={isReadOnly ? t('subscription.readOnlyMessage') : t('files.addFile')}
                  onClick={() =>
                    openFileForm({
                      defaultCaseId: caseData.id,
                      defaultClientId: caseData.clientId,
                      lockCaseAndClient: true,
                    })
                  }
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold rounded-xl shadow-2xs transition disabled:opacity-40 disabled:cursor-not-allowed min-h-[38px]"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>{t('files.addFile')}</span>
                </button>
              )}
            </div>

            {files.length === 0 ? (
              <div className="p-8 text-center bg-slate-50 rounded-xl border border-slate-200/80 text-slate-500 text-xs">
                {t('files.noFilesFound')}
              </div>
            ) : (
              <div className="space-y-3">
                {files.map((file) => {
                  const isInChamber = file.status === 'in_chamber';
                  return (
                    <div
                      key={file.id}
                      data-testid={`dossier-file-row-${file.id}`}
                      className="p-4 rounded-xl bg-slate-50 border border-slate-200/80 flex flex-wrap items-start justify-between gap-3"
                    >
                      <div className="space-y-1 min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="px-2 py-0.5 rounded-md bg-slate-900 text-white font-mono text-xs font-bold">
                            {file.serial}
                          </span>
                          <span
                            className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${
                              isInChamber
                                ? 'bg-emerald-100 text-emerald-800'
                                : 'bg-amber-100 text-amber-800'
                            }`}
                          >
                            {t(`files.${file.status}`)}
                          </span>
                        </div>
                        <div className="text-sm font-semibold text-slate-900 break-words">
                          {file.title}
                        </div>
                        <div className="text-xs text-slate-500 flex flex-wrap items-center gap-x-3 gap-y-1">
                          <span>
                            {t('files.shelfLocation')}: {file.shelfLocation || '—'}
                          </span>
                          {file.currentHolderName && (
                            <span>
                              {t('files.currentHolder')}: <strong>{file.currentHolderName}</strong>
                            </span>
                          )}
                          {file.dueBackAt && (
                            <span>
                              {t('files.dueBack')}: {new Date(file.dueBackAt).toLocaleString()}
                            </span>
                          )}
                        </div>
                      </div>

                      {/* File Per-Row Hub Actions: Check Out, Check In, Edit, History */}
                      <div className="flex flex-wrap items-center gap-1.5">
                        {canManageFiles && isInChamber && (
                          <button
                            type="button"
                            disabled={isReadOnly}
                            data-testid={`file-checkout-btn-${file.id}`}
                            onClick={() => openFileCheckOut(file)}
                            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-500 text-white text-xs font-semibold disabled:opacity-40 min-h-[34px]"
                          >
                            <LogOut className="w-3.5 h-3.5" />
                            <span>{t('files.checkOut')}</span>
                          </button>
                        )}

                        {canManageFiles && !isInChamber && (
                          <button
                            type="button"
                            disabled={isReadOnly}
                            data-testid={`file-checkin-btn-${file.id}`}
                            onClick={() => openFileCheckIn(file)}
                            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold disabled:opacity-40 min-h-[34px]"
                          >
                            <LogIn className="w-3.5 h-3.5" />
                            <span>{t('files.checkIn')}</span>
                          </button>
                        )}

                        {canManageFiles && (
                          <button
                            type="button"
                            disabled={isReadOnly}
                            data-testid={`file-edit-btn-${file.id}`}
                            onClick={() => openFileForm({ initialData: file })}
                            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-white border border-slate-200 hover:bg-slate-100 text-slate-700 text-xs font-semibold disabled:opacity-40 min-h-[34px]"
                          >
                            <Edit2 className="w-3 h-3" />
                            <span>{t('common.edit')}</span>
                          </button>
                        )}

                        <button
                          type="button"
                          onClick={() => openFileHistory(file)}
                          className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-white border border-slate-200 hover:bg-slate-100 text-slate-600 text-xs font-semibold min-h-[34px]"
                        >
                          <History className="w-3.5 h-3.5" />
                          <span>{t('files.movementHistory')}</span>
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* TAB 5: NOTES */}
        {activeTab === 'notes' && (
          <div className="p-4 sm:p-6" data-testid="dossier-panel-notes">
            <CaseNotesTab caseId={caseId} canEdit={canEditCase} isReadOnly={isReadOnly} />
          </div>
        )}

        {/* TAB: BILLING */}
        {activeTab === 'billing' && can('accounts.view') && (
          <div className="p-4 sm:p-6" data-testid="dossier-panel-billing">
            <BillingTab clientId={caseData.clientId} caseId={caseData.id} />
          </div>
        )}

        {/* TAB 6: ACTIVITY */}
        {activeTab === 'activity' && (
          <div className="p-4 sm:p-6 space-y-4" data-testid="dossier-panel-activity">
            <div>
              <h3 className="text-sm font-bold text-slate-900">
                {t('hub.tabActivity', 'Case Activity')} ({activityLogs.length})
              </h3>
              <p className="text-xs text-slate-500">
                {t('hub.activitySubtitle', 'Audit trail of all changes to this case, its hearings, tasks, and files')}
              </p>
            </div>

            {activityLogs.length === 0 ? (
              <div className="p-8 text-center bg-slate-50 rounded-xl border border-slate-200/80 text-slate-500 text-xs">
                {t('audit.noEntries')}
              </div>
            ) : (
              <div className="space-y-2.5">
                {activityLogs.map((log) => (
                  <div
                    key={log.id}
                    data-testid={`dossier-activity-row-${log.id}`}
                    className="p-3.5 rounded-xl bg-slate-50 border border-slate-200/80 flex flex-wrap items-center justify-between gap-2 text-xs"
                  >
                    <div className="flex flex-wrap items-center gap-2 min-w-0">
                      <span className="px-2 py-0.5 rounded-md bg-slate-900 text-white font-bold text-[10px]">
                        {t(`audit.actions.${log.action}`, log.action)}
                      </span>
                      <span className="font-semibold text-slate-800">{log.entity}</span>
                      <span className="text-slate-500">by {log.userName}</span>
                    </div>
                    <span className="text-slate-400 font-mono text-[11px]">
                      {new Date(log.timestamp).toLocaleString()}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
