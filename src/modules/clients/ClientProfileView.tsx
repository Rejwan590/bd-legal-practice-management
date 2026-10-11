import React, { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../foundation/AuthContext';
import { useNavigation, ClientProfileTab } from '../foundation/NavigationContext';
import { getRepositories } from '../../data/repositories';
import {
  CaseRecord,
  ClientRecord,
  PhysicalFileRecord,
  TaskRecord,
} from '../../data/types';
import { EntityLink } from '../../components/EntityLink';
import { Breadcrumbs } from '../../components/Breadcrumbs';
import {
  User,
  Phone,
  Mail,
  MapPin,
  FileText,
  Briefcase,
  CheckSquare,
  FolderArchive,
  Edit2,
  Archive,
  AlertTriangle,
  Plus,
  UserPlus,
  CheckCircle2,
  RotateCcw,
  LogOut,
  LogIn,
  History,
  Lock,
  X,
} from 'lucide-react';

interface ClientProfileViewProps {
  clientId: string;
  initialClient?: ClientRecord | null;
  onBack: () => void;
  onEdit: (client: ClientRecord) => void;
  onDeleted: () => void;
}

export const ClientProfileView: React.FC<ClientProfileViewProps> = ({
  clientId,
  initialClient,
  onBack,
  onEdit,
  onDeleted,
}) => {
  const { t } = useTranslation();
  const { currentUser, can, isReadOnly } = useAuth();
  const {
    route,
    openClientProfile,
    refreshVersion,
    triggerRefresh,
    setActiveClientContext,
    openCaseForm,
    openTaskForm,
    openTaskComplete,
    openTaskReassign,
    openFileForm,
    openFileCheckOut,
    openFileCheckIn,
    openFileHistory,
  } = useNavigation();
  const repos = getRepositories();

  const activeTab: ClientProfileTab =
    route.clientId === clientId ? route.clientTab : 'cases';

  const [client, setClient] = useState<ClientRecord | null>(initialClient || null);
  const [cases, setCases] = useState<CaseRecord[]>([]);
  const [tasks, setTasks] = useState<TaskRecord[]>([]);
  const [files, setFiles] = useState<PhysicalFileRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [confirmArchive, setConfirmArchive] = useState(false);
  const [archiving, setArchiving] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const canManageClient = can('clients.edit');
  const canCreateCase = can('cases.create');
  const canEditCase = can('cases.edit');
  const canAssignTasks = can('tasks.assign');
  const canCompleteTasks = can('tasks.complete');
  const canManageFiles = can('files.manage');

  const loadClientHub = useCallback(async () => {
    setLoading(true);
    setErrorMsg(null);
    try {
      const [cl, clientCases, clientTasks, clientFiles] = await Promise.all([
        repos.client.getById({ currentUser }, clientId),
        repos.case.getByClientId({ currentUser }, clientId).catch(() => []),
        repos.task.list({ currentUser }, { clientId }).catch(() => []),
        repos.physicalFile.list({ currentUser }, { clientId }).catch(() => []),
      ]);
      setClient(cl);
      setCases(clientCases);
      setTasks(clientTasks);
      setFiles(clientFiles);
      if (cl) {
        setActiveClientContext({ clientId: cl.id, clientName: cl.name });
      } else {
        setActiveClientContext(null);
      }
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : 'Failed to load client profile');
    } finally {
      setLoading(false);
    }
  }, [clientId, currentUser, repos, setActiveClientContext]);

  useEffect(() => {
    loadClientHub();
    return () => {
      setActiveClientContext(null);
    };
  }, [loadClientHub, refreshVersion, setActiveClientContext]);

  const handleArchive = async () => {
    if (!client || !canManageClient || isReadOnly) return;
    setArchiving(true);
    setErrorMsg(null);
    try {
      await repos.client.archive({ currentUser }, client.id);
      triggerRefresh();
      onDeleted();
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : 'Failed to archive client');
      setArchiving(false);
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

  if (loading && !client) {
    return (
      <div className="p-8 text-center text-slate-400 text-sm">
        {t('common.loading')}
      </div>
    );
  }

  if (!client) {
    return (
      <div className="bg-white rounded-2xl border border-slate-200 p-8 text-center space-y-4">
        <h3 className="text-base font-bold text-slate-900">
          {errorMsg || 'Client not found'}
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

  const tabDefinitions: Array<{
    id: ClientProfileTab;
    label: string;
    count: number;
    icon: React.FC<{ className?: string }>;
  }> = [
    {
      id: 'cases',
      label: t('clients.linkedCases', 'Cases'),
      count: cases.length,
      icon: Briefcase,
    },
    {
      id: 'tasks',
      label: t('clients.linkedTasks', 'Tasks'),
      count: tasks.length,
      icon: CheckSquare,
    },
    {
      id: 'files',
      label: t('clients.linkedFiles', 'Files'),
      count: files.length,
      icon: FolderArchive,
    },
  ];

  return (
    <div className="space-y-5 min-w-0" data-testid="client-profile-hub">
      <Breadcrumbs
        fallbackPath="/clients"
        onBackOverride={onBack}
        items={[
          { label: t('nav.clients'), href: '/clients' },
          { label: client.name, href: `/clients/${encodeURIComponent(client.id)}` },
          {
            label:
              tabDefinitions.find((td) => td.id === activeTab)?.label ||
              t('clients.linkedCases', 'Cases'),
          },
        ]}
      />

      {isReadOnly && (
        <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-amber-800 text-xs flex items-center gap-2">
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

      {/* Client Profile Header Card — Single Edit and Single Archive Button */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
        <div className="p-4 sm:p-6 bg-slate-900 text-white">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="flex items-start gap-3.5 min-w-0">
              <div className="w-12 h-12 rounded-2xl bg-slate-800 border border-slate-700 flex items-center justify-center shrink-0">
                <User className="w-6 h-6 text-amber-400" />
              </div>
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <h1 className="text-lg sm:text-2xl font-bold tracking-tight break-words">
                    {client.name}
                  </h1>
                  {client.archived && (
                    <span className="px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider bg-amber-500/20 text-amber-300 border border-amber-500/30 rounded-full">
                      Archived
                    </span>
                  )}
                </div>
                {client.nameBn && (
                  <p className="text-sm text-slate-300 mt-0.5 font-sans">{client.nameBn}</p>
                )}
                <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-300 mt-2">
                  <span className="inline-flex items-center gap-1">
                    <Phone className="w-3.5 h-3.5 text-slate-400" />
                    {client.phone}
                  </span>
                  {client.email && (
                    <span className="inline-flex items-center gap-1">
                      <Mail className="w-3.5 h-3.5 text-slate-400" />
                      {client.email}
                    </span>
                  )}
                  {client.address && (
                    <span className="inline-flex items-center gap-1">
                      <MapPin className="w-3.5 h-3.5 text-slate-400" />
                      {client.address}
                    </span>
                  )}
                </div>
              </div>
            </div>

            {canManageClient && (
              <div className="flex flex-wrap items-center gap-2 shrink-0">
                <button
                  type="button"
                  data-testid="client-header-edit-btn"
                  disabled={isReadOnly}
                  onClick={() => onEdit(client)}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-white/10 hover:bg-white/20 text-white text-xs font-semibold rounded-xl transition disabled:opacity-40 min-h-[38px]"
                >
                  <Edit2 className="w-3.5 h-3.5" />
                  <span>{t('common.edit')}</span>
                </button>

                {!client.archived && !confirmArchive && (
                  <button
                    type="button"
                    data-testid="client-header-archive-btn"
                    disabled={isReadOnly}
                    onClick={() => setConfirmArchive(true)}
                    className="inline-flex items-center gap-1.5 px-3 py-2 bg-amber-500/20 hover:bg-amber-500/30 text-amber-200 text-xs font-semibold rounded-xl border border-amber-500/30 transition disabled:opacity-40 min-h-[38px]"
                  >
                    <Archive className="w-3.5 h-3.5" />
                    <span>{t('common.archive', 'Archive')}</span>
                  </button>
                )}

                {confirmArchive && (
                  <div className="flex items-center gap-2 bg-amber-950/90 border border-amber-500/40 px-3 py-1.5 rounded-xl">
                    <span className="text-xs text-amber-200 font-medium">
                      {t('clients.confirmDeleteTitle')}
                    </span>
                    <button
                      type="button"
                      disabled={archiving || isReadOnly}
                      onClick={handleArchive}
                      className="px-2.5 py-1 bg-amber-600 hover:bg-amber-500 text-white text-xs font-bold rounded-lg"
                    >
                      {archiving ? '...' : t('common.yes')}
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfirmArchive(false)}
                      className="px-2 py-1 text-slate-300 hover:text-white text-xs"
                    >
                      {t('common.no')}
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>

          {client.notes && (
            <div className="mt-4 pt-3 border-t border-slate-800 text-xs text-slate-300 flex items-start gap-2">
              <FileText className="w-3.5 h-3.5 text-slate-400 shrink-0 mt-0.5" />
              <span>{client.notes}</span>
            </div>
          )}
        </div>

        {/* Client Profile 3-Tab Bar: Cases, Tasks, Files */}
        <div
          role="tablist"
          aria-label="Client profile tabs"
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
                data-testid={`client-tab-${tab.id}`}
                onClick={() => openClientProfile(client.id, tab.id)}
                className={`inline-flex items-center gap-1.5 px-3 sm:px-4 py-3 text-xs sm:text-sm font-semibold border-b-2 transition whitespace-nowrap shrink-0 min-h-[44px] ${
                  isSelected
                    ? 'border-slate-900 text-slate-900 bg-white/60'
                    : 'border-transparent text-slate-500 hover:text-slate-800 hover:border-slate-300'
                }`}
              >
                <Icon className="w-4 h-4 shrink-0" />
                <span>{tab.label}</span>
                <span
                  className={`px-1.5 py-0.5 text-[10px] rounded-full font-bold ${
                    isSelected ? 'bg-slate-900 text-white' : 'bg-slate-200/80 text-slate-600'
                  }`}
                >
                  {tab.count}
                </span>
              </button>
            );
          })}
        </div>

        {/* TAB 1: CASES */}
        {activeTab === 'cases' && (
          <div className="p-4 sm:p-6 space-y-4" data-testid="client-panel-cases">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h3 className="text-sm font-bold text-slate-900">
                  {t('clients.linkedCases')} ({cases.length})
                </h3>
                <p className="text-xs text-slate-500">{t('cases.subtitle')}</p>
              </div>
              {canCreateCase && (
                <button
                  type="button"
                  data-testid="client-add-case-btn"
                  disabled={isReadOnly}
                  onClick={() =>
                    openCaseForm({
                      defaultClientId: client.id,
                      lockClientId: true,
                    })
                  }
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold rounded-xl shadow-2xs transition disabled:opacity-40 min-h-[38px]"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>{t('cases.addCase')}</span>
                </button>
              )}
            </div>

            {cases.length === 0 ? (
              <div className="p-8 text-center bg-slate-50 rounded-xl border border-slate-200/80 text-slate-500 text-xs">
                {t('clients.noLinkedRecords')}
              </div>
            ) : (
              <div className="space-y-3">
                {cases.map((c) => (
                  <div
                    key={c.id}
                    data-testid={`client-case-row-${c.id}`}
                    className="p-4 rounded-xl bg-slate-50 border border-slate-200/80 flex flex-wrap items-center justify-between gap-3"
                  >
                    <div className="space-y-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <EntityLink
                          type="case"
                          id={c.id}
                          label={c.caseNumber}
                          restricted={c.restricted}
                          className="text-sm font-bold"
                        />
                        {c.restricted && (
                          <span className="inline-flex items-center gap-0.5 text-[10px] px-1.5 py-0.5 rounded font-bold bg-amber-100 text-amber-900 border border-amber-300">
                            <Lock className="w-3 h-3" /> {t('cases.restrictedBadge')}
                          </span>
                        )}
                        <span
                          className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${
                            c.status === 'ongoing'
                              ? 'bg-emerald-100 text-emerald-800'
                              : 'bg-slate-200 text-slate-700'
                          }`}
                        >
                          {c.status}
                        </span>
                      </div>
                      <div className="text-xs text-slate-600">{c.court}</div>
                      <div className="text-xs text-slate-500">{c.matterType}</div>
                    </div>

                    <div className="flex items-center gap-2">
                      {canEditCase && (
                        <button
                          type="button"
                          disabled={isReadOnly}
                          onClick={() => openCaseForm({ initialData: c })}
                          className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-white border border-slate-200 hover:bg-slate-100 text-slate-700 text-xs font-semibold disabled:opacity-40 min-h-[34px]"
                        >
                          <Edit2 className="w-3 h-3" />
                          <span>{t('common.edit')}</span>
                        </button>
                      )}
                      <EntityLink
                        type="case"
                        id={c.id}
                        label={t('cases.viewDetails')}
                        restricted={c.restricted}
                        className="px-3 py-1.5 rounded-lg bg-indigo-50 hover:bg-indigo-100 text-indigo-700 text-xs font-semibold min-h-[34px]"
                      />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* TAB 2: TASKS */}
        {activeTab === 'tasks' && (
          <div className="p-4 sm:p-6 space-y-4" data-testid="client-panel-tasks">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h3 className="text-sm font-bold text-slate-900">
                  {t('clients.linkedTasks')} ({tasks.length})
                </h3>
                <p className="text-xs text-slate-500">{t('tasks.subtitle')}</p>
              </div>
              {canAssignTasks && (
                <button
                  type="button"
                  data-testid="client-add-task-btn"
                  disabled={isReadOnly}
                  onClick={() =>
                    openTaskForm({
                      defaultClientId: client.id,
                      lockClientOnly: true,
                    })
                  }
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold rounded-xl shadow-2xs transition disabled:opacity-40 min-h-[38px]"
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
                      data-testid={`client-task-row-${task.id}`}
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
                          <span className="text-xs text-slate-500">
                            {new Date(task.dueAt).toLocaleDateString()}
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
                          {t('tasks.assignedTo')}: {task.assignedToName}
                        </div>
                      </div>

                      <div className="flex flex-wrap items-center gap-1.5">
                        {canAssignTasks && (
                          <button
                            type="button"
                            disabled={isReadOnly}
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

        {/* TAB 3: FILES */}
        {activeTab === 'files' && (
          <div className="p-4 sm:p-6 space-y-4" data-testid="client-panel-files">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h3 className="text-sm font-bold text-slate-900">
                  {t('clients.linkedFiles')} ({files.length})
                </h3>
                <p className="text-xs text-slate-500">{t('files.subtitle')}</p>
              </div>
              {canManageFiles && (
                <button
                  type="button"
                  data-testid="client-add-file-btn"
                  disabled={isReadOnly}
                  onClick={() =>
                    openFileForm({
                      defaultClientId: client.id,
                      lockClientOnly: true,
                    })
                  }
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold rounded-xl shadow-2xs transition disabled:opacity-40 min-h-[38px]"
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
                      data-testid={`client-file-row-${file.id}`}
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
                        <div className="text-xs text-slate-500">
                          {t('files.shelfLocation')}: {file.shelfLocation || '—'}
                        </div>
                      </div>

                      <div className="flex flex-wrap items-center gap-1.5">
                        {canManageFiles && isInChamber && (
                          <button
                            type="button"
                            disabled={isReadOnly}
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
      </div>
    </div>
  );
};
