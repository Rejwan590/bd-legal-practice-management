import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../foundation/AuthContext';
import { getRepositories } from '../../data/repositories';
import { PhysicalFileRecord, UserRecord } from '../../data/types';
import { LogOut, Calendar, UserCheck, AlertCircle } from 'lucide-react';
import { ResponsiveModal } from '../../components/responsive/ResponsiveModal';

interface FileCheckOutModalProps {
  isOpen: boolean;
  file: PhysicalFileRecord | null;
  onClose: () => void;
  onCheckOut: (fileId: string, holderId: string, dueBackAt: string, note?: string) => Promise<void>;
}

export const FileCheckOutModal: React.FC<FileCheckOutModalProps> = ({
  isOpen,
  file,
  onClose,
  onCheckOut,
}) => {
  const { t } = useTranslation();
  const { currentUser } = useAuth();
  const repos = getRepositories();

  const [users, setUsers] = useState<UserRecord[]>([]);
  const [holderId, setHolderId] = useState('');
  const [dueBackAt, setDueBackAt] = useState('');
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen && file) {
      repos.user
        .list({ currentUser })
        .then((userData) => {
          const activeUsers = userData.filter((u) => u.active);
          setUsers(activeUsers);
          setHolderId(activeUsers[0]?.id || currentUser.id);
        })
        .catch(console.error);

      // Default due-back: 3 days from now at 17:00
      const returnDate = new Date();
      returnDate.setDate(returnDate.getDate() + 3);
      returnDate.setHours(17, 0, 0, 0);
      setDueBackAt(returnDate.toISOString().slice(0, 16));

      setNote('');
      setErrorMsg(null);
    }
  }, [isOpen, file, currentUser]);

  if (!isOpen || !file) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!holderId) {
      setErrorMsg('Please select a recipient advocate/staff member');
      return;
    }
    if (!dueBackAt) {
      setErrorMsg('Please specify a due back date');
      return;
    }

    setSaving(true);
    setErrorMsg(null);
    try {
      const dueIso = new Date(dueBackAt).toISOString();
      await onCheckOut(file.id, holderId, dueIso, note.trim() || undefined);
      onClose();
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : 'Failed to check out physical file');
    } finally {
      setSaving(false);
    }
  };

  return (
    <ResponsiveModal
      isOpen={isOpen}
      onClose={onClose}
      title={t('files.checkOut')}
      subtitle={`${file.serial} • ${file.title}`}
      icon={LogOut}
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
            form="file-checkout-form"
            disabled={saving}
            className="flex-1 sm:flex-initial px-5 py-2.5 min-h-[44px] text-xs font-semibold bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl shadow-xs transition disabled:opacity-50 inline-flex items-center justify-center gap-1.5"
          >
            <LogOut className="w-4 h-4" />
            <span>{saving ? t('common.loading') : t('files.checkOut')}</span>
          </button>
        </div>
      }
    >
      <form id="file-checkout-form" onSubmit={handleSubmit} className="space-y-4">
        {errorMsg && (
          <div className="flex items-center gap-2 p-3 bg-rose-50 border border-rose-200 rounded-xl text-rose-700 text-xs">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{errorMsg}</span>
          </div>
        )}

        <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-xl text-xs space-y-1">
          <span className="text-slate-400 block font-medium uppercase tracking-wider text-[10px]">
            File Details
          </span>
          <p className="font-bold text-slate-900">{file.title}</p>
          <p className="text-slate-500 font-mono">Current Location: {file.shelfLocation}</p>
        </div>

        <div>
          <label className="block text-xs font-semibold text-slate-700 mb-1.5 flex items-center gap-1">
            <UserCheck className="w-3.5 h-3.5 text-slate-400" />
            {t('files.checkoutTo')} *
          </label>
          <select
            required
            value={holderId}
            onChange={(e) => setHolderId(e.target.value)}
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
          <label className="block text-xs font-semibold text-slate-700 mb-1.5 flex items-center gap-1">
            <Calendar className="w-3.5 h-3.5 text-slate-400" />
            {t('files.checkoutDue')} *
          </label>
          <input
            type="datetime-local"
            required
            value={dueBackAt}
            onChange={(e) => setDueBackAt(e.target.value)}
            className="w-full px-3.5 py-2.5 min-h-[44px] sm:min-h-0 text-xs bg-slate-50 border border-slate-300 rounded-xl focus:ring-2 focus:ring-slate-500 focus:outline-hidden"
          />
        </div>

        <div>
          <label className="block text-xs font-semibold text-slate-700 mb-1.5">
            {t('files.checkoutNote')}
          </label>
          <textarea
            rows={3}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder={t('files.checkoutNotePlaceholder')}
            className="w-full px-3.5 py-2.5 text-xs bg-slate-50 border border-slate-300 rounded-xl focus:ring-2 focus:ring-slate-500 focus:outline-hidden"
          />
        </div>
      </form>
    </ResponsiveModal>
  );
};
