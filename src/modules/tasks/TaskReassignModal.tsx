import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../foundation/AuthContext';
import { getRepositories } from '../../data/repositories';
import { TaskRecord, UserRecord } from '../../data/types';
import { UserCheck, AlertCircle, ArrowRightLeft } from 'lucide-react';
import { ResponsiveModal } from '../../components/responsive/ResponsiveModal';

interface TaskReassignModalProps {
  isOpen: boolean;
  task: TaskRecord | null;
  onClose: () => void;
  onReassign: (taskId: string, newAssignedTo: string, reason?: string) => Promise<void>;
}

export const TaskReassignModal: React.FC<TaskReassignModalProps> = ({
  isOpen,
  task,
  onClose,
  onReassign,
}) => {
  const { t } = useTranslation();
  const { currentUser } = useAuth();
  const repos = getRepositories();

  const [users, setUsers] = useState<UserRecord[]>([]);
  const [targetUserId, setTargetUserId] = useState('');
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen && task) {
      repos.user
        .list({ currentUser })
        .then((data) => {
          const activeUsers = data.filter((u) => u.active);
          setUsers(activeUsers);
          // Pick the other user if possible
          const other = activeUsers.find((u) => u.id !== task.assignedTo);
          setTargetUserId(other ? other.id : activeUsers[0]?.id || '');
        })
        .catch(console.error);

      setReason('');
      setErrorMsg(null);
    }
  }, [isOpen, task, currentUser]);

  if (!isOpen || !task) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!targetUserId) {
      setErrorMsg('Please select a target advocate');
      return;
    }

    setSaving(true);
    setErrorMsg(null);
    try {
      await onReassign(task.id, targetUserId, reason.trim() || undefined);
      onClose();
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : 'Failed to reassign task');
    } finally {
      setSaving(false);
    }
  };

  const currentAssigneeName = task.assignedToName || 'Current Advocate';

  return (
    <ResponsiveModal
      isOpen={isOpen}
      onClose={onClose}
      title={t('tasks.reassignTask')}
      subtitle={task.title}
      icon={ArrowRightLeft}
      maxWidth="md"
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
            form="task-reassign-form"
            disabled={saving}
            className="flex-1 sm:flex-initial px-5 py-2.5 min-h-[44px] text-xs font-semibold bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl shadow-xs transition disabled:opacity-50 inline-flex items-center justify-center gap-1.5"
          >
            {saving ? t('common.loading') : t('tasks.reassignTask')}
          </button>
        </div>
      }
    >
      <form id="task-reassign-form" onSubmit={handleSubmit} className="space-y-4">
        {errorMsg && (
          <div className="flex items-center gap-2 p-3 bg-rose-50 border border-rose-200 rounded-xl text-rose-700 text-xs">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{errorMsg}</span>
          </div>
        )}

        <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-xl text-xs space-y-1">
          <span className="text-slate-400 block font-medium uppercase tracking-wider text-[10px]">
            Target Task
          </span>
          <p className="font-bold text-slate-900">{task.title}</p>
          <p className="text-slate-500">
            Currently assigned to: <strong className="text-slate-700">{currentAssigneeName}</strong>
          </p>
        </div>

        <div>
          <label className="block text-xs font-semibold text-slate-700 mb-1.5 flex items-center gap-1">
            <UserCheck className="w-3.5 h-3.5 text-slate-400" />
            {t('tasks.reassignTo')} *
          </label>
          <select
            required
            value={targetUserId}
            onChange={(e) => setTargetUserId(e.target.value)}
            className="w-full px-3 py-2.5 min-h-[44px] sm:min-h-0 text-xs bg-slate-50 border border-slate-300 rounded-xl focus:ring-2 focus:ring-slate-500 focus:outline-hidden"
          >
            {users.map((u) => (
              <option key={u.id} value={u.id} disabled={u.id === task.assignedTo}>
                {u.name} ({u.role}){u.id === task.assignedTo ? ' - Current Assignee' : ''}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-xs font-semibold text-slate-700 mb-1.5">
            {t('tasks.reassignmentReason')}
          </label>
          <textarea
            rows={3}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder={t('tasks.reassignmentReasonPlaceholder')}
            className="w-full px-3.5 py-2.5 text-xs bg-slate-50 border border-slate-300 rounded-xl focus:ring-2 focus:ring-slate-500 focus:outline-hidden"
          />
        </div>
      </form>
    </ResponsiveModal>
  );
};
