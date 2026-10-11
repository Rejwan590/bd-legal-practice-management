import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../foundation/AuthContext';
import { useNavigation } from '../foundation/NavigationContext';
import { getRepositories } from '../../data/repositories';
import { CaseRecord, ClientRecord, TaskPriority, TaskRecord, TaskStatus, UserRecord } from '../../data/types';
import { TaskFormModal } from './TaskFormModal';
import { TaskReassignModal } from './TaskReassignModal';
import { TaskCompleteModal } from './TaskCompleteModal';
import { ResponsiveTable } from '../../components/responsive/ResponsiveTable';
import { ResponsiveModal } from '../../components/responsive/ResponsiveModal';
import { EntityLink } from '../../components/EntityLink';
import {
  CheckSquare,
  Plus,
  Search,
  Calendar,
  AlertTriangle,
  CheckCircle2,
  User,
  AlertCircle,
  ArrowRightLeft,
  Edit2,
  Trash2,
  Lock,
  Flame,
  Check,
  RotateCcw,
} from 'lucide-react';

export const TasksScreen: React.FC = () => {
  const { t } = useTranslation();
  const { currentUser, can, isReadOnly } = useAuth();
  const { refreshVersion, triggerRefresh } = useNavigation();
  const repos = getRepositories();

  const [tasks, setTasks] = useState<TaskRecord[]>([]);
  const [casesMap, setCasesMap] = useState<Record<string, CaseRecord>>({});
  const [clientsMap, setClientsMap] = useState<Record<string, ClientRecord>>({});
  const [users, setUsers] = useState<UserRecord[]>([]);
  const [loading, setLoading] = useState(true);

  // Filters & Tabs
  const canAssign = can('tasks.assign');
  const canComplete = can('tasks.complete');
  const isOwner = currentUser.role === 'Owner';

  const [scope, setScope] = useState<'my' | 'firm'>('my');
  const [searchQuery, setSearchQuery] = useState('');
  const [priorityFilter, setPriorityFilter] = useState<'all' | TaskPriority>('all');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | TaskStatus>('all');
  const [assigneeFilter, setAssigneeFilter] = useState<string>('all');

  // Modals state
  const [formModalOpen, setFormModalOpen] = useState(false);
  const [editingTask, setEditingTask] = useState<TaskRecord | null>(null);
  const [reassigningTask, setReassigningTask] = useState<TaskRecord | null>(null);
  const [completingTask, setCompletingTask] = useState<TaskRecord | null>(null);
  const [deletingTask, setDeletingTask] = useState<TaskRecord | null>(null);

  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const fetchTasksAndRelations = async () => {
    setLoading(true);
    setErrorMsg(null);
    try {
      const [casesData, clientsData, usersData] = await Promise.all([
        repos.case.list({ currentUser }),
        repos.client.list({ currentUser }),
        repos.user.list({ currentUser }),
      ]);

      const cMap: Record<string, CaseRecord> = {};
      casesData.forEach((c) => {
        cMap[c.id] = c;
      });
      setCasesMap(cMap);

      const clMap: Record<string, ClientRecord> = {};
      clientsData.forEach((cl) => {
        clMap[cl.id] = cl;
      });
      setClientsMap(clMap);
      setUsers(usersData);

      // Determine query filter based on scope
      const filter: { assignedTo?: string; search?: string } = {};
      if (scope === 'my' && !isOwner) {
        // Staff only sees their own
        filter.assignedTo = currentUser.id;
      } else if (scope === 'my' && isOwner) {
        filter.assignedTo = currentUser.id;
      } else if (scope === 'firm' && assigneeFilter !== 'all') {
        filter.assignedTo = assigneeFilter;
      }

      const tasksData = await repos.task.list({ currentUser }, filter);
      setTasks(tasksData);
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : 'Failed to load chamber tasks');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTasksAndRelations();
  }, [currentUser, scope, assigneeFilter, refreshVersion]);

  // Handle Save
  const handleSaveTask = async (data: {
    title: string;
    description?: string;
    assignedTo: string;
    dueAt: string;
    priority: TaskPriority;
    caseId?: string | null;
    clientId?: string | null;
  }) => {
    if (editingTask) {
      await repos.task.update({ currentUser }, editingTask.id, data);
      setSuccessMsg(t('tasks.taskUpdated'));
    } else {
      await repos.task.create({ currentUser }, data);
      setSuccessMsg(t('tasks.taskSaved'));
    }
    setEditingTask(null);
    await fetchTasksAndRelations();
    triggerRefresh();
    setTimeout(() => setSuccessMsg(null), 3500);
  };

  // Handle Complete
  const handleCompleteTask = async (taskId: string, note?: string) => {
    await repos.task.complete({ currentUser }, taskId, note);
    setSuccessMsg(t('tasks.taskCompleted'));
    await fetchTasksAndRelations();
    triggerRefresh();
    setTimeout(() => setSuccessMsg(null), 3500);
  };

  // Handle Reopen
  const handleReopenTask = async (task: TaskRecord) => {
    if (isReadOnly || !canComplete) return;
    try {
      await repos.task.update({ currentUser }, task.id, { status: 'pending' });
      setSuccessMsg(t('tasks.taskUpdated'));
      await fetchTasksAndRelations();
      triggerRefresh();
      setTimeout(() => setSuccessMsg(null), 3500);
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : 'Failed to reopen task');
    }
  };

  // Handle Reassign
  const handleReassignTask = async (taskId: string, newAssignedTo: string, reason?: string) => {
    await repos.task.reassign({ currentUser }, taskId, newAssignedTo, reason);
    setSuccessMsg(t('tasks.taskReassigned'));
    await fetchTasksAndRelations();
    triggerRefresh();
    setTimeout(() => setSuccessMsg(null), 3500);
  };

  // Handle Soft Delete
  const handleConfirmDelete = async () => {
    if (!deletingTask) return;
    try {
      await repos.task.delete({ currentUser }, deletingTask.id);
      setSuccessMsg(t('tasks.taskDeleted'));
      setDeletingTask(null);
      await fetchTasksAndRelations();
      triggerRefresh();
      setTimeout(() => setSuccessMsg(null), 3500);
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : 'Failed to delete task');
    }
  };

  // Filter tasks client-side for immediate responsive search and status/priority
  const now = Date.now();
  const filteredTasks = tasks.filter((task) => {
    // Search filter
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const matchTitle = task.title.toLowerCase().includes(q);
      const matchDesc = task.description?.toLowerCase().includes(q);
      const matchAssignee = task.assignedToName?.toLowerCase().includes(q);
      const matchCase = task.caseId && casesMap[task.caseId]?.caseNumber.toLowerCase().includes(q);
      if (!matchTitle && !matchDesc && !matchAssignee && !matchCase) return false;
    }

    // Priority filter
    if (priorityFilter !== 'all' && task.priority !== priorityFilter) {
      return false;
    }

    // Status filter
    if (statusFilter === 'active') {
      if (task.status === 'completed' || task.status === 'cancelled') return false;
    } else if (statusFilter !== 'all' && task.status !== statusFilter) {
      return false;
    }

    return true;
  });

  // Calculate task counts
  const totalCount = tasks.length;
  const activeCount = tasks.filter(
    (t) => t.status === 'pending' || t.status === 'in_progress'
  ).length;
  const completedCount = tasks.filter((t) => t.status === 'completed').length;
  const overdueCount = tasks.filter(
    (t) =>
      t.status !== 'completed' &&
      t.status !== 'cancelled' &&
      new Date(t.dueAt).getTime() < now
  ).length;

  return (
    <div className="space-y-6 max-w-7xl mx-auto w-full">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200 pb-5">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
            <CheckSquare className="w-6 h-6 text-slate-700" />
            {t('tasks.title')}
          </h1>
          <p className="text-sm text-slate-500 mt-1">{t('tasks.subtitle')}</p>
        </div>

        {isReadOnly ? (
          <span className="flex items-center gap-1.5 px-3 py-1.5 bg-rose-50 text-rose-700 rounded-lg text-xs font-semibold border border-rose-200">
            <Lock className="w-3.5 h-3.5" /> {t('common.readOnlyMode')}
          </span>
        ) : canAssign ? (
          <button
            onClick={() => {
              setEditingTask(null);
              setFormModalOpen(true);
            }}
            className="inline-flex items-center justify-center gap-2 px-4 py-2.5 min-h-[44px] bg-slate-900 hover:bg-slate-800 text-white text-sm font-semibold rounded-xl shadow-xs transition"
          >
            <Plus className="w-4 h-4" />
            {t('tasks.addTask')}
          </button>
        ) : (
          <span className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 text-slate-500 rounded-lg text-xs font-medium border border-slate-200">
            <Lock className="w-3.5 h-3.5" /> Staff (Tasks Assigned View)
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

      {/* Scope Switch (My Tasks vs Firm-Wide) */}
      {(canAssign || isOwner) && (
        <div className="flex items-center gap-2 bg-slate-200/60 p-1 rounded-xl w-fit">
          <button
            onClick={() => {
              setScope('my');
              setAssigneeFilter('all');
            }}
            className={`px-4 py-2 min-h-[40px] sm:min-h-0 rounded-lg text-xs font-bold transition ${
              scope === 'my'
                ? 'bg-white text-slate-900 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            {t('tasks.myTasks')}
          </button>
          <button
            onClick={() => setScope('firm')}
            className={`px-4 py-2 min-h-[40px] sm:min-h-0 rounded-lg text-xs font-bold transition ${
              scope === 'firm'
                ? 'bg-white text-slate-900 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            {t('tasks.allChamberTasks')}
          </button>
        </div>
      )}

      {/* Summary Scorecards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs">
          <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider block">
            {t('tasks.totalTasks')}
          </span>
          <span className="text-2xl font-bold text-slate-900 mt-1 block">{totalCount}</span>
        </div>

        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs">
          <span className="text-[11px] font-semibold text-indigo-600 uppercase tracking-wider block">
            {t('tasks.activeTasks')}
          </span>
          <span className="text-2xl font-bold text-indigo-700 mt-1 block">{activeCount}</span>
        </div>

        <div className="bg-white p-4 rounded-xl border border-rose-200 shadow-2xs bg-rose-50/20">
          <span className="text-[11px] font-semibold text-rose-600 uppercase tracking-wider block flex items-center gap-1">
            <Flame className="w-3.5 h-3.5 text-rose-500" />
            {t('tasks.overdueTasks')}
          </span>
          <span
            className={`text-2xl font-bold mt-1 block ${
              overdueCount > 0 ? 'text-rose-600' : 'text-slate-700'
            }`}
          >
            {overdueCount}
          </span>
        </div>

        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs">
          <span className="text-[11px] font-semibold text-emerald-600 uppercase tracking-wider block">
            {t('tasks.completedTasks')}
          </span>
          <span className="text-2xl font-bold text-emerald-700 mt-1 block">{completedCount}</span>
        </div>
      </div>

      {/* Search and Filters */}
      <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs space-y-3">
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-3.5" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={t('tasks.searchPlaceholder')}
              className="w-full pl-9 pr-4 py-2.5 min-h-[44px] sm:min-h-0 bg-slate-50 border border-slate-300 rounded-lg text-xs text-slate-900 focus:ring-2 focus:ring-slate-500 focus:outline-hidden"
            />
          </div>

          <div className="text-xs font-semibold text-slate-500 px-3 py-2 bg-slate-100 rounded-lg shrink-0 self-start sm:self-center">
            {t('tasks.totalTasks')}: {filteredTasks.length}
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-1 border-t border-slate-100">
          <div>
            <label className="block text-[11px] font-semibold text-slate-600 mb-1">
              {t('tasks.filterStatus')}
            </label>
            <select
              value={statusFilter}
              onChange={(e) =>
                setStatusFilter(e.target.value as 'all' | 'active' | TaskStatus)
              }
              className="w-full bg-slate-50 border border-slate-300 text-slate-800 text-xs rounded-lg p-2.5 min-h-[44px] sm:min-h-0 focus:ring-2 focus:ring-slate-500 focus:outline-hidden"
            >
              <option value="all">{t('common.all')}</option>
              <option value="active">{t('tasks.activeTasks')}</option>
              <option value="pending">{t('tasks.pending')}</option>
              <option value="in_progress">{t('tasks.in_progress')}</option>
              <option value="completed">{t('tasks.completed')}</option>
              <option value="cancelled">{t('tasks.cancelled')}</option>
            </select>
          </div>

          <div>
            <label className="block text-[11px] font-semibold text-slate-600 mb-1">
              {t('tasks.filterPriority')}
            </label>
            <select
              value={priorityFilter}
              onChange={(e) => setPriorityFilter(e.target.value as 'all' | TaskPriority)}
              className="w-full bg-slate-50 border border-slate-300 text-slate-800 text-xs rounded-lg p-2.5 min-h-[44px] sm:min-h-0 focus:ring-2 focus:ring-slate-500 focus:outline-hidden"
            >
              <option value="all">{t('common.all')}</option>
              <option value="urgent">{t('tasks.urgent')}</option>
              <option value="high">{t('tasks.high')}</option>
              <option value="medium">{t('tasks.medium')}</option>
              <option value="normal">{t('tasks.normal')}</option>
              <option value="low">{t('tasks.low')}</option>
            </select>
          </div>

          {scope === 'firm' && (
            <div>
              <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                {t('tasks.filterAssignee')}
              </label>
              <select
                value={assigneeFilter}
                onChange={(e) => setAssigneeFilter(e.target.value)}
                className="w-full bg-slate-50 border border-slate-300 text-slate-800 text-xs rounded-lg p-2.5 min-h-[44px] sm:min-h-0 focus:ring-2 focus:ring-slate-500 focus:outline-hidden"
              >
                <option value="all">{t('common.all')}</option>
                {users.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.name}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>
      </div>

      {/* Task List */}
      {loading ? (
        <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center text-slate-400 text-sm">
          {t('common.loading')}
        </div>
      ) : (
        <ResponsiveTable<TaskRecord>
          data={filteredTasks}
          keyExtractor={(task) => task.id}
          emptyState={
            <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center space-y-3">
              <CheckSquare className="w-10 h-10 text-slate-300 mx-auto" />
              <p className="text-sm text-slate-500">{t('tasks.noTasksFound')}</p>
              {canAssign && (
                <button
                  onClick={() => {
                    setEditingTask(null);
                    setFormModalOpen(true);
                  }}
                  className="inline-flex items-center gap-1.5 px-4 py-2.5 min-h-[44px] text-xs font-semibold text-indigo-700 bg-indigo-50 hover:bg-indigo-100 rounded-xl transition"
                >
                  <Plus className="w-4 h-4" />
                  {t('tasks.addTask')}
                </button>
              )}
            </div>
          }
          columns={[
            {
              header: 'Status & Task',
              accessor: (task) => {
                const isDone = task.status === 'completed';
                return (
                  <div className="flex items-start gap-3">
                    {canComplete && !isReadOnly ? (
                      <button
                        onClick={() => {
                          if (!isDone) {
                            setCompletingTask(task);
                          } else {
                            handleReopenTask(task);
                          }
                        }}
                        className={`w-6 h-6 rounded-lg flex items-center justify-center shrink-0 mt-0.5 border transition ${
                          isDone
                            ? 'bg-emerald-600 border-emerald-600 text-white shadow-2xs'
                            : 'border-slate-300 hover:border-emerald-500 hover:bg-emerald-50/50 text-transparent'
                        }`}
                        title={isDone ? t('hub.reopenTask', 'Reopen') : t('tasks.markCompleted')}
                      >
                        <Check className="w-4 h-4 stroke-[3]" />
                      </button>
                    ) : (
                      <div
                        className={`w-6 h-6 rounded-lg flex items-center justify-center shrink-0 mt-0.5 border ${
                          isDone
                            ? 'bg-emerald-600 border-emerald-600 text-white'
                            : 'border-slate-300 bg-slate-50 text-slate-400'
                        }`}
                      >
                        {isDone && <Check className="w-4 h-4 stroke-[3]" />}
                      </div>
                    )}
                    <div className="space-y-1 max-w-md">
                      <div className="flex items-center gap-2 flex-wrap">
                        <EntityLink
                          type="task"
                          id={task.id}
                          label={task.title}
                          showIcon={false}
                          onClickOverride={() => {
                            if (canAssign && !isReadOnly) {
                              setEditingTask(task);
                              setFormModalOpen(true);
                            } else if (!isDone && canComplete && !isReadOnly) {
                              setCompletingTask(task);
                            }
                          }}
                          className={`font-bold text-sm ${
                            isDone ? 'line-through text-slate-500' : 'text-slate-900'
                          }`}
                        />
                        <span
                          className={`text-[10px] px-2 py-0.5 rounded font-semibold ${
                            task.status === 'completed'
                              ? 'bg-emerald-100 text-emerald-800'
                              : task.status === 'in_progress'
                              ? 'bg-indigo-100 text-indigo-800'
                              : task.status === 'cancelled'
                              ? 'bg-slate-200 text-slate-600'
                              : 'bg-slate-100 text-slate-700'
                          }`}
                        >
                          {t(`tasks.${task.status}`)}
                        </span>
                      </div>
                      {task.description && (
                        <p className="text-xs text-slate-500 line-clamp-2">
                          {task.description}
                        </p>
                      )}
                    </div>
                  </div>
                );
              },
            },
            {
              header: 'Matter & Assignee',
              accessor: (task) => {
                const linkedCase = task.caseId ? casesMap[task.caseId] : null;
                const linkedClient = task.clientId ? clientsMap[task.clientId] : null;
                return (
                  <div className="space-y-1 text-xs">
                    <span className="flex items-center gap-1 font-semibold text-slate-800">
                      <User className="w-3.5 h-3.5 text-indigo-500 shrink-0" />
                      <span>{task.assignedToName || 'Advocate'}</span>
                    </span>
                    {linkedCase && (
                      <div className="flex items-center gap-1 text-slate-600">
                        <EntityLink
                          type="case"
                          id={linkedCase.id}
                          label={linkedCase.caseNumber}
                          subtitle={`(${linkedCase.fileSerial})`}
                          isRestricted={linkedCase.restricted}
                          className="text-xs"
                        />
                      </div>
                    )}
                    {linkedClient && (
                      <div className="text-[11px] text-slate-500 truncate max-w-xs flex items-center gap-1">
                        <span>Client:</span>
                        <EntityLink
                          type="client"
                          id={linkedClient.id}
                          label={linkedClient.name}
                          showIcon={false}
                          className="text-[11px] text-slate-700"
                        />
                      </div>
                    )}
                  </div>
                );
              },
            },
            {
              header: 'Priority',
              accessor: (task) => (
                <span
                  className={`inline-block text-[10px] px-2 py-0.5 rounded-full font-bold uppercase tracking-wider ${
                    task.priority === 'urgent'
                      ? 'bg-rose-100 text-rose-800 border border-rose-300'
                      : task.priority === 'high'
                      ? 'bg-amber-100 text-amber-900 border border-amber-300'
                      : task.priority === 'medium'
                      ? 'bg-sky-100 text-sky-800'
                      : 'bg-slate-100 text-slate-700'
                  }`}
                >
                  {t(`tasks.${task.priority}`)}
                </span>
              ),
            },
            {
              header: 'Due Date',
              accessor: (task) => {
                const isDone = task.status === 'completed';
                const isCancelled = task.status === 'cancelled';
                const dueDateObj = new Date(task.dueAt);
                const isOverdue = !isDone && !isCancelled && dueDateObj.getTime() < now;
                const diffDays = Math.ceil(
                  Math.abs(dueDateObj.getTime() - now) / (1000 * 60 * 60 * 24)
                );

                return (
                  <div>
                    {isDone ? (
                      <div className="flex items-center gap-1.5 text-emerald-700 font-bold text-xs">
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        <span>{t('tasks.completed')}</span>
                      </div>
                    ) : isOverdue ? (
                      <div className="inline-flex items-center gap-1 text-rose-700 font-bold text-xs bg-rose-50 px-2 py-0.5 rounded-md border border-rose-200">
                        <AlertTriangle className="w-3.5 h-3.5 text-rose-600 shrink-0" />
                        <span>{t('tasks.overdueByDays', { days: diffDays })}</span>
                      </div>
                    ) : (
                      <div className="flex items-center gap-1 text-slate-700 font-semibold text-xs">
                        <Calendar className="w-3.5 h-3.5 text-indigo-600 shrink-0" />
                        <span>{dueDateObj.toLocaleDateString()}</span>
                      </div>
                    )}
                    <span className="text-[11px] text-slate-400 font-mono block mt-0.5">
                      {dueDateObj.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>
                );
              },
            },
            {
              header: 'Actions',
              className: 'text-right',
              headerClassName: 'text-right',
              accessor: (task) => {
                const isDone = task.status === 'completed';
                return (
                  <div className="flex items-center justify-end gap-1 flex-wrap">
                    {!isDone && canComplete && !isReadOnly && (
                      <button
                        onClick={() => setCompletingTask(task)}
                        className="px-2.5 py-1.5 min-h-[36px] text-xs font-semibold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 rounded-lg transition"
                        title={t('tasks.markCompleted')}
                      >
                        Complete
                      </button>
                    )}

                    {isDone && canComplete && !isReadOnly && (
                      <button
                        onClick={() => handleReopenTask(task)}
                        className="px-2.5 py-1.5 min-h-[36px] text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition inline-flex items-center gap-1"
                        title={t('hub.reopenTask', 'Reopen')}
                      >
                        <RotateCcw className="w-3.5 h-3.5" />
                        <span>{t('hub.reopenTask', 'Reopen')}</span>
                      </button>
                    )}

                    {canAssign && !isReadOnly && (
                      <>
                        <button
                          onClick={() => setReassigningTask(task)}
                          className="p-2 min-h-[44px] min-w-[44px] inline-flex items-center justify-center text-slate-400 hover:text-indigo-600 hover:bg-slate-100 rounded-lg transition"
                          title={t('tasks.reassignTask')}
                        >
                          <ArrowRightLeft className="w-4 h-4" />
                        </button>

                        <button
                          onClick={() => {
                            setEditingTask(task);
                            setFormModalOpen(true);
                          }}
                          className="p-2 min-h-[44px] min-w-[44px] inline-flex items-center justify-center text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition"
                          title={t('common.edit')}
                        >
                          <Edit2 className="w-4 h-4" />
                        </button>

                        <button
                          onClick={() => setDeletingTask(task)}
                          className="p-2 min-h-[44px] min-w-[44px] inline-flex items-center justify-center text-slate-400 hover:text-rose-600 hover:bg-slate-100 rounded-lg transition"
                          title={t('common.delete')}
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </>
                    )}
                  </div>
                );
              },
            },
          ]}
          renderMobileCard={(task) => {
            const linkedCase = task.caseId ? casesMap[task.caseId] : null;
            const linkedClient = task.clientId ? clientsMap[task.clientId] : null;
            const isDone = task.status === 'completed';
            const isCancelled = task.status === 'cancelled';
            const dueDateObj = new Date(task.dueAt);
            const isOverdue = !isDone && !isCancelled && dueDateObj.getTime() < now;
            const diffDays = Math.ceil(
              Math.abs(dueDateObj.getTime() - now) / (1000 * 60 * 60 * 24)
            );

            return (
              <div
                className={`bg-white rounded-xl border border-slate-200 p-4 shadow-2xs space-y-3 ${
                  isDone ? 'opacity-75 bg-slate-50/50' : ''
                }`}
              >
                <div className="flex items-start gap-3">
                  {canComplete && !isReadOnly ? (
                    <button
                      onClick={() => {
                        if (!isDone) {
                          setCompletingTask(task);
                        } else {
                          handleReopenTask(task);
                        }
                      }}
                      className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 border transition ${
                        isDone
                          ? 'bg-emerald-600 border-emerald-600 text-white shadow-2xs'
                          : 'border-slate-300 hover:border-emerald-500 hover:bg-emerald-50/50 text-transparent'
                      }`}
                      title={isDone ? t('hub.reopenTask', 'Reopen') : t('tasks.markCompleted')}
                    >
                      <Check className="w-4 h-4 stroke-[3]" />
                    </button>
                  ) : (
                    <div
                      className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 border ${
                        isDone
                          ? 'bg-emerald-600 border-emerald-600 text-white'
                          : 'border-slate-300 bg-slate-50 text-slate-400'
                      }`}
                    >
                      {isDone && <Check className="w-4 h-4 stroke-[3]" />}
                    </div>
                  )}

                  <div className="space-y-1 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <EntityLink
                        type="task"
                        id={task.id}
                        label={task.title}
                        showIcon={false}
                        onClickOverride={() => {
                          if (canAssign && !isReadOnly) {
                            setEditingTask(task);
                            setFormModalOpen(true);
                          } else if (!isDone && canComplete && !isReadOnly) {
                            setCompletingTask(task);
                          }
                        }}
                        className={`font-bold text-sm ${
                          isDone ? 'line-through text-slate-500' : 'text-slate-900'
                        }`}
                      />
                    </div>

                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span
                        className={`text-[10px] px-2 py-0.5 rounded-full font-bold uppercase tracking-wider ${
                          task.priority === 'urgent'
                            ? 'bg-rose-100 text-rose-800 border border-rose-300'
                            : task.priority === 'high'
                            ? 'bg-amber-100 text-amber-900 border border-amber-300'
                            : task.priority === 'medium'
                            ? 'bg-sky-100 text-sky-800'
                            : 'bg-slate-100 text-slate-700'
                        }`}
                      >
                        {t(`tasks.${task.priority}`)}
                      </span>

                      <span
                        className={`text-[10px] px-2 py-0.5 rounded font-semibold ${
                          task.status === 'completed'
                            ? 'bg-emerald-100 text-emerald-800'
                            : task.status === 'in_progress'
                            ? 'bg-indigo-100 text-indigo-800'
                            : task.status === 'cancelled'
                            ? 'bg-slate-200 text-slate-600'
                            : 'bg-slate-100 text-slate-700'
                        }`}
                      >
                        {t(`tasks.${task.status}`)}
                      </span>
                    </div>
                  </div>
                </div>

                {task.description && (
                  <p className="text-xs text-slate-600 leading-relaxed whitespace-pre-line bg-slate-50/70 p-2.5 rounded-lg border border-slate-100">
                    {task.description}
                  </p>
                )}

                <div className="space-y-1 text-xs text-slate-500 pt-1 border-t border-slate-100">
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <span className="flex items-center gap-1 font-medium text-slate-700">
                      <User className="w-3.5 h-3.5 text-indigo-500 shrink-0" />
                      <span>{task.assignedToName || 'Advocate'}</span>
                    </span>

                    <div>
                      {isDone ? (
                        <div className="flex items-center gap-1 text-emerald-700 font-bold text-xs">
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          <span>{t('tasks.completed')}</span>
                        </div>
                      ) : isOverdue ? (
                        <div className="inline-flex items-center gap-1 text-rose-700 font-bold text-xs bg-rose-50 px-2 py-0.5 rounded-md border border-rose-200">
                          <AlertTriangle className="w-3.5 h-3.5 text-rose-600 shrink-0" />
                          <span>{t('tasks.overdueByDays', { days: diffDays })}</span>
                        </div>
                      ) : (
                        <div className="flex items-center gap-1 text-slate-700 font-semibold text-xs">
                          <Calendar className="w-3.5 h-3.5 text-indigo-600 shrink-0" />
                          <span>{dueDateObj.toLocaleDateString()}</span>
                        </div>
                      )}
                    </div>
                  </div>

                  {linkedCase && (
                    <div className="flex items-center gap-1 text-slate-600">
                      <EntityLink
                        type="case"
                        id={linkedCase.id}
                        label={linkedCase.caseNumber}
                        subtitle={`(${linkedCase.fileSerial})`}
                        isRestricted={linkedCase.restricted}
                        className="text-xs"
                      />
                    </div>
                  )}

                  {linkedClient && (
                    <div className="text-[11px] text-slate-500 flex items-center gap-1">
                      <span>Client:</span>
                      <EntityLink
                        type="client"
                        id={linkedClient.id}
                        label={linkedClient.name}
                        showIcon={false}
                        className="text-[11px] text-slate-700"
                      />
                    </div>
                  )}
                </div>

                <div className="flex items-center gap-2 pt-2 border-t border-slate-100 flex-wrap">
                  {!isDone && canComplete && !isReadOnly && (
                    <button
                      onClick={() => setCompletingTask(task)}
                      className="flex-1 inline-flex items-center justify-center gap-1 px-3 py-2 min-h-[44px] text-xs font-semibold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 rounded-xl transition"
                    >
                      <Check className="w-4 h-4" />
                      <span>Complete</span>
                    </button>
                  )}

                  {isDone && canComplete && !isReadOnly && (
                    <button
                      onClick={() => handleReopenTask(task)}
                      className="flex-1 inline-flex items-center justify-center gap-1 px-3 py-2 min-h-[44px] text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-xl transition"
                    >
                      <RotateCcw className="w-4 h-4" />
                      <span>{t('hub.reopenTask', 'Reopen')}</span>
                    </button>
                  )}

                  {canAssign && !isReadOnly && (
                    <>
                      <button
                        onClick={() => setReassigningTask(task)}
                        className="flex-1 inline-flex items-center justify-center gap-1 px-3 py-2 min-h-[44px] text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-xl transition"
                      >
                        <ArrowRightLeft className="w-4 h-4" />
                        <span>Reassign</span>
                      </button>

                      <button
                        onClick={() => {
                          setEditingTask(task);
                          setFormModalOpen(true);
                        }}
                        className="inline-flex items-center justify-center p-2.5 min-h-[44px] min-w-[44px] text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-xl transition"
                        title={t('common.edit')}
                      >
                        <Edit2 className="w-4 h-4" />
                      </button>

                      <button
                        onClick={() => setDeletingTask(task)}
                        className="inline-flex items-center justify-center p-2.5 min-h-[44px] min-w-[44px] text-rose-600 bg-rose-50 hover:bg-rose-100 rounded-xl transition"
                        title={t('common.delete')}
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </>
                  )}
                </div>
              </div>
            );
          }}
        />
      )}

      {/* Task Form Modal */}
      <TaskFormModal
        isOpen={formModalOpen}
        initialData={editingTask}
        onClose={() => {
          setFormModalOpen(false);
          setEditingTask(null);
        }}
        onSave={handleSaveTask}
      />

      {/* Task Reassign Modal */}
      <TaskReassignModal
        isOpen={Boolean(reassigningTask)}
        task={reassigningTask}
        onClose={() => setReassigningTask(null)}
        onReassign={handleReassignTask}
      />

      {/* Task Complete Modal */}
      <TaskCompleteModal
        isOpen={Boolean(completingTask)}
        task={completingTask}
        onClose={() => setCompletingTask(null)}
        onComplete={handleCompleteTask}
      />

      {/* Soft Delete Confirmation Modal */}
      <ResponsiveModal
        isOpen={Boolean(deletingTask)}
        onClose={() => setDeletingTask(null)}
        title={t('tasks.softDeleteWarningTitle')}
        icon={AlertTriangle}
        maxWidth="md"
        footer={
          <div className="flex items-center justify-end gap-3 w-full">
            <button
              type="button"
              onClick={() => setDeletingTask(null)}
              className="flex-1 sm:flex-initial px-4 py-2.5 min-h-[44px] text-xs font-semibold text-slate-700 hover:bg-slate-100 rounded-xl transition"
            >
              {t('common.cancel')}
            </button>
            <button
              type="button"
              onClick={handleConfirmDelete}
              className="flex-1 sm:flex-initial px-5 py-2.5 min-h-[44px] text-xs font-semibold bg-rose-600 hover:bg-rose-700 text-white rounded-xl shadow-xs transition inline-flex items-center justify-center gap-1.5"
            >
              <Trash2 className="w-4 h-4" />
              <span>{t('common.delete')}</span>
            </button>
          </div>
        }
      >
        {deletingTask && (
          <div className="space-y-4">
            <p className="text-xs text-slate-600 leading-relaxed">
              {t('tasks.softDeleteWarningText')}
            </p>
            <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-200 text-xs text-slate-700">
              <strong>Task:</strong> {deletingTask.title}
            </div>
          </div>
        )}
      </ResponsiveModal>
    </div>
  );
};
