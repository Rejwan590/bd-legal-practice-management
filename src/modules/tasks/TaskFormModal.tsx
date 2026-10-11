import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../foundation/AuthContext';
import { getRepositories } from '../../data/repositories';
import { CaseRecord, ClientRecord, TaskPriority, TaskRecord, UserRecord } from '../../data/types';
import { CheckSquare, Calendar, AlertCircle, User, Briefcase, Lock } from 'lucide-react';
import { ResponsiveModal } from '../../components/responsive/ResponsiveModal';

interface TaskFormModalProps {
  isOpen: boolean;
  initialData?: TaskRecord | null;
  defaultCaseId?: string | null;
  defaultClientId?: string | null;
  lockCaseAndClient?: boolean;
  lockClientOnly?: boolean;
  defaultDueDate?: string;
  onClose: () => void;
  onSave: (data: {
    title: string;
    description?: string;
    assignedTo: string;
    dueAt: string;
    priority: TaskPriority;
    caseId?: string | null;
    clientId?: string | null;
  }) => Promise<void>;
}

export const TaskFormModal: React.FC<TaskFormModalProps> = ({
  isOpen,
  initialData,
  defaultCaseId,
  defaultClientId,
  lockCaseAndClient,
  lockClientOnly,
  defaultDueDate,
  onClose,
  onSave,
}) => {
  const { t } = useTranslation();
  const { currentUser } = useAuth();
  const repos = getRepositories();

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [assignedTo, setAssignedTo] = useState('');
  const [priority, setPriority] = useState<TaskPriority>('high');
  const [dueDate, setDueDate] = useState('');
  const [caseId, setCaseId] = useState('');
  const [clientId, setClientId] = useState('');

  const [users, setUsers] = useState<UserRecord[]>([]);
  const [cases, setCases] = useState<CaseRecord[]>([]);
  const [clients, setClients] = useState<ClientRecord[]>([]);
  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      // Load active users, cases, and clients
      Promise.all([
        repos.user.list({ currentUser }),
        repos.case.list({ currentUser }),
        repos.client.list({ currentUser }),
      ])
        .then(([userData, caseData, clientData]) => {
          setUsers(userData.filter((u) => u.active));
          setCases(caseData);
          setClients(clientData);

          if (initialData) {
            setTitle(initialData.title);
            setDescription(initialData.description || '');
            setAssignedTo(initialData.assignedTo);
            setPriority(initialData.priority);
            setDueDate(initialData.dueAt.slice(0, 16));
            setCaseId(initialData.caseId || '');
            setClientId(initialData.clientId || '');
          } else {
            // New task defaults
            setTitle('');
            setDescription('');
            // Default to staff user or self
            const staffUser = userData.find((u) => u.role === 'Staff');
            setAssignedTo(staffUser ? staffUser.id : currentUser.id);
            setPriority('high');

            if (defaultDueDate && defaultDueDate.length >= 10) {
              setDueDate(`${defaultDueDate.slice(0, 10)}T17:00`);
            } else {
              // Default due date: tomorrow at 17:00
              const tomorrow = new Date();
              tomorrow.setDate(tomorrow.getDate() + 1);
              tomorrow.setHours(17, 0, 0, 0);
              setDueDate(tomorrow.toISOString().slice(0, 16));
            }

            const resolvedCaseId = defaultCaseId || '';
            setCaseId(resolvedCaseId);
            if (defaultClientId) {
              setClientId(defaultClientId);
            } else if (resolvedCaseId) {
              const matchedCase = caseData.find((c) => c.id === resolvedCaseId);
              setClientId(matchedCase?.clientId || '');
            } else {
              setClientId('');
            }
          }
        })
        .catch((err) => {
          console.error(err);
          setErrorMsg('Failed to load related data');
        });
      setErrorMsg(null);
    }
  }, [isOpen, initialData, defaultCaseId, defaultClientId, defaultDueDate, currentUser]);

  // When a case is selected, automatically fill associated clientId if present
  const handleCaseChange = (newCaseId: string) => {
    setCaseId(newCaseId);
    if (newCaseId) {
      const selected = cases.find((c) => c.id === newCaseId);
      if (selected && selected.clientId) {
        setClientId(selected.clientId);
      }
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) {
      setErrorMsg('Task title is required');
      return;
    }
    if (!assignedTo) {
      setErrorMsg('Please select an advocate or staff member');
      return;
    }
    if (!dueDate) {
      setErrorMsg('Please select a deadline / due date');
      return;
    }

    setSaving(true);
    setErrorMsg(null);
    try {
      const dueIso = new Date(dueDate).toISOString();
      await onSave({
        title: title.trim(),
        description: description.trim() || undefined,
        assignedTo,
        dueAt: dueIso,
        priority,
        caseId: caseId || null,
        clientId: clientId || null,
      });
      onClose();
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : 'Failed to save task');
    } finally {
      setSaving(false);
    }
  };

  if (!isOpen) return null;

  return (
    <ResponsiveModal
      isOpen={isOpen}
      onClose={onClose}
      title={initialData ? t('tasks.editTask') : t('tasks.addTask')}
      icon={CheckSquare}
      maxWidth="xl"
      footer={
        <div className="flex items-center justify-end gap-3 w-full">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 sm:flex-initial px-4 py-2.5 min-h-[44px] text-xs font-semibold text-slate-700 hover:bg-slate-100 rounded-xl transition"
          >
            {t('common.cancel')}
          </button>
          <button
            type="submit"
            form="task-form-modal"
            disabled={saving}
            className="flex-1 sm:flex-initial px-5 py-2.5 min-h-[44px] text-xs font-semibold bg-slate-900 hover:bg-slate-800 text-white rounded-xl shadow-xs transition disabled:opacity-50 inline-flex items-center justify-center gap-1.5"
          >
            {saving ? t('common.loading') : t('common.save')}
          </button>
        </div>
      }
    >
      <form id="task-form-modal" onSubmit={handleSubmit} className="space-y-4">
        {errorMsg && (
          <div className="flex items-center gap-2 p-3 bg-rose-50 border border-rose-200 rounded-xl text-rose-700 text-xs">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{errorMsg}</span>
          </div>
        )}

        <div>
          <label className="block text-xs font-semibold text-slate-700 mb-1.5">
            {t('tasks.taskTitle')} *
          </label>
          <input
            type="text"
            required
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder={t('tasks.taskTitlePlaceholder')}
            className="w-full px-3.5 py-2.5 text-xs bg-slate-50 border border-slate-300 rounded-xl focus:ring-2 focus:ring-slate-500 focus:outline-hidden"
          />
        </div>

        <div>
          <label className="block text-xs font-semibold text-slate-700 mb-1.5">
            {t('tasks.taskDescription')}
          </label>
          <textarea
            rows={3}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder={t('tasks.taskDescriptionPlaceholder')}
            className="w-full px-3.5 py-2.5 text-xs bg-slate-50 border border-slate-300 rounded-xl focus:ring-2 focus:ring-slate-500 focus:outline-hidden"
          />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1.5 flex items-center gap-1">
              <User className="w-3.5 h-3.5 text-slate-400" />
              {t('tasks.assignedTo')} *
            </label>
            <select
              required
              value={assignedTo}
              onChange={(e) => setAssignedTo(e.target.value)}
              className="w-full px-3 py-2.5 min-h-[44px] sm:min-h-0 text-xs bg-slate-50 border border-slate-300 rounded-xl focus:ring-2 focus:ring-slate-500 focus:outline-hidden"
            >
              {users.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name} ({u.role})
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1.5">
              {t('tasks.priority')} *
            </label>
            <select
              value={priority}
              onChange={(e) => setPriority(e.target.value as TaskPriority)}
              className="w-full px-3 py-2.5 min-h-[44px] sm:min-h-0 text-xs bg-slate-50 border border-slate-300 rounded-xl focus:ring-2 focus:ring-slate-500 focus:outline-hidden"
            >
              <option value="urgent">🔴 {t('tasks.urgent')}</option>
              <option value="high">🟠 {t('tasks.high')}</option>
              <option value="medium">🟡 {t('tasks.medium')}</option>
              <option value="normal">🔵 {t('tasks.normal')}</option>
              <option value="low">⚪ {t('tasks.low')}</option>
            </select>
          </div>
        </div>

        <div>
          <label className="block text-xs font-semibold text-slate-700 mb-1.5 flex items-center gap-1">
            <Calendar className="w-3.5 h-3.5 text-slate-400" />
            {t('tasks.dueDate')} *
          </label>
          <input
            type="datetime-local"
            required
            value={dueDate}
            onChange={(e) => setDueDate(e.target.value)}
            className="w-full px-3.5 py-2.5 min-h-[44px] sm:min-h-0 text-xs bg-slate-50 border border-slate-300 rounded-xl focus:ring-2 focus:ring-slate-500 focus:outline-hidden"
          />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 pt-1 border-t border-slate-100">
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1.5 flex items-center justify-between gap-1">
              <span className="flex items-center gap-1">
                <Briefcase className="w-3.5 h-3.5 text-slate-400" />
                {t('tasks.linkedCase')}
              </span>
              {lockCaseAndClient && (
                <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-slate-500">
                  <Lock className="w-3 h-3" /> {t('hub.lockedField', 'Locked')}
                </span>
              )}
            </label>
            <select
              disabled={Boolean(lockCaseAndClient)}
              value={caseId}
              onChange={(e) => handleCaseChange(e.target.value)}
              className="w-full px-3 py-2.5 min-h-[44px] sm:min-h-0 text-xs bg-slate-50 border border-slate-300 rounded-xl focus:ring-2 focus:ring-slate-500 focus:outline-hidden disabled:opacity-65 disabled:cursor-not-allowed"
            >
              <option value="">{t('tasks.noLinkedCase')}</option>
              {cases
                .filter((c) => !lockClientOnly || !clientId || c.clientId === clientId)
                .map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.caseNumber} ({c.fileSerial})
                  </option>
                ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1.5 flex items-center justify-between gap-1">
              <span className="flex items-center gap-1">
                <User className="w-3.5 h-3.5 text-slate-400" />
                {t('tasks.linkedClient')}
              </span>
              {(lockCaseAndClient || lockClientOnly) && (
                <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-slate-500">
                  <Lock className="w-3 h-3" /> {t('hub.lockedField', 'Locked')}
                </span>
              )}
            </label>
            <select
              disabled={Boolean(lockCaseAndClient || lockClientOnly)}
              value={clientId}
              onChange={(e) => setClientId(e.target.value)}
              className="w-full px-3 py-2.5 min-h-[44px] sm:min-h-0 text-xs bg-slate-50 border border-slate-300 rounded-xl focus:ring-2 focus:ring-slate-500 focus:outline-hidden disabled:opacity-65 disabled:cursor-not-allowed"
            >
              <option value="">{t('tasks.noLinkedClient')}</option>
              {clients.map((cl) => (
                <option key={cl.id} value={cl.id}>
                  {cl.name} {cl.nameBn ? `(${cl.nameBn})` : ''}
                </option>
              ))}
            </select>
          </div>
        </div>
      </form>
    </ResponsiveModal>
  );
};
