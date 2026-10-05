import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { TaskRecord } from '../../data/types';
import { CheckCircle2, AlertCircle } from 'lucide-react';
import { ResponsiveModal } from '../../components/responsive/ResponsiveModal';

interface TaskCompleteModalProps {
  isOpen: boolean;
  task: TaskRecord | null;
  onClose: () => void;
  onComplete: (taskId: string, note?: string) => Promise<void>;
}

export const TaskCompleteModal: React.FC<TaskCompleteModalProps> = ({
  isOpen,
  task,
  onClose,
  onComplete,
}) => {
  const { t } = useTranslation();
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  if (!isOpen || !task) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setErrorMsg(null);
    try {
      await onComplete(task.id, note.trim() || undefined);
      onClose();
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : 'Failed to complete task');
    } finally {
      setSaving(false);
    }
  };

  return (
    <ResponsiveModal
      isOpen={isOpen}
      onClose={onClose}
      title={t('tasks.markCompleted')}
      subtitle={task.title}
      icon={CheckCircle2}
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
            form="task-complete-form"
            disabled={saving}
            className="flex-1 sm:flex-initial px-5 py-2.5 min-h-[44px] text-xs font-semibold bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl shadow-xs transition disabled:opacity-50 inline-flex items-center justify-center gap-1.5"
          >
            <CheckCircle2 className="w-4 h-4" />
            <span>{saving ? t('common.loading') : t('tasks.markCompleted')}</span>
          </button>
        </div>
      }
    >
      <form id="task-complete-form" onSubmit={handleSubmit} className="space-y-4">
        {errorMsg && (
          <div className="flex items-center gap-2 p-3 bg-rose-50 border border-rose-200 rounded-xl text-rose-700 text-xs">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{errorMsg}</span>
          </div>
        )}

        <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-xl text-xs space-y-1">
          <span className="text-slate-400 block font-medium uppercase tracking-wider text-[10px]">
            Completing Task
          </span>
          <p className="font-bold text-slate-900">{task.title}</p>
          {task.assignedToName && (
            <p className="text-slate-500">
              Assigned to: <strong className="text-slate-700">{task.assignedToName}</strong>
            </p>
          )}
        </div>

        <div>
          <label className="block text-xs font-semibold text-slate-700 mb-1.5">
            {t('tasks.completionNote')}
          </label>
          <textarea
            rows={3}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder={t('tasks.completionNotePlaceholder')}
            className="w-full px-3.5 py-2.5 text-xs sm:text-xs bg-slate-50 border border-slate-300 rounded-xl focus:ring-2 focus:ring-slate-500 focus:outline-hidden"
          />
        </div>
      </form>
    </ResponsiveModal>
  );
};
