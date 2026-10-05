import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { PhysicalFileRecord } from '../../data/types';
import { LogIn, MapPin, AlertCircle } from 'lucide-react';
import { ResponsiveModal } from '../../components/responsive/ResponsiveModal';

interface FileCheckInModalProps {
  isOpen: boolean;
  file: PhysicalFileRecord | null;
  onClose: () => void;
  onCheckIn: (fileId: string, shelfLocation?: string, note?: string) => Promise<void>;
}

export const FileCheckInModal: React.FC<FileCheckInModalProps> = ({
  isOpen,
  file,
  onClose,
  onCheckIn,
}) => {
  const { t } = useTranslation();

  const [shelfLocation, setShelfLocation] = useState('');
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen && file) {
      setShelfLocation(file.shelfLocation || 'Cabinet A, Shelf 1');
      setNote('');
      setErrorMsg(null);
    }
  }, [isOpen, file]);

  if (!isOpen || !file) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setErrorMsg(null);
    try {
      await onCheckIn(file.id, shelfLocation.trim() || undefined, note.trim() || undefined);
      onClose();
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : 'Failed to check in physical file');
    } finally {
      setSaving(false);
    }
  };

  return (
    <ResponsiveModal
      isOpen={isOpen}
      onClose={onClose}
      title={t('files.checkIn')}
      subtitle={`${file.serial} • ${file.title}`}
      icon={LogIn}
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
            form="file-checkin-form"
            disabled={saving}
            className="flex-1 sm:flex-initial px-5 py-2.5 min-h-[44px] text-xs font-semibold bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl shadow-xs transition disabled:opacity-50 inline-flex items-center justify-center gap-1.5"
          >
            <LogIn className="w-4 h-4" />
            <span>{saving ? t('common.loading') : t('files.checkIn')}</span>
          </button>
        </div>
      }
    >
      <form id="file-checkin-form" onSubmit={handleSubmit} className="space-y-4">
        {errorMsg && (
          <div className="flex items-center gap-2 p-3 bg-rose-50 border border-rose-200 rounded-xl text-rose-700 text-xs">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{errorMsg}</span>
          </div>
        )}

        <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-xl text-xs space-y-1.5">
          <span className="text-slate-400 block font-medium uppercase tracking-wider text-[10px]">
            File Summary
          </span>
          <p className="font-bold text-slate-900">{file.title}</p>
          <div className="flex items-center justify-between text-slate-500">
            <span>Current Custodian:</span>
            <strong className="text-slate-800">{file.currentHolderName || 'Advocate'}</strong>
          </div>
          {file.dueBackAt && (
            <div className="flex items-center justify-between text-slate-500">
              <span>Expected Due:</span>
              <span className="font-mono text-slate-700">
                {new Date(file.dueBackAt).toLocaleDateString()}
              </span>
            </div>
          )}
        </div>

        <div>
          <label className="block text-xs font-semibold text-slate-700 mb-1.5 flex items-center gap-1">
            <MapPin className="w-3.5 h-3.5 text-slate-400" />
            {t('files.checkinLocation')} *
          </label>
          <input
            type="text"
            required
            value={shelfLocation}
            onChange={(e) => setShelfLocation(e.target.value)}
            placeholder={t('files.shelfLocationPlaceholder')}
            className="w-full px-3.5 py-2.5 min-h-[44px] sm:min-h-0 text-xs bg-slate-50 border border-slate-300 rounded-xl focus:ring-2 focus:ring-slate-500 focus:outline-hidden"
          />
        </div>

        <div>
          <label className="block text-xs font-semibold text-slate-700 mb-1.5">
            {t('files.checkinNote')}
          </label>
          <textarea
            rows={3}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder={t('files.checkinNotePlaceholder')}
            className="w-full px-3.5 py-2.5 text-xs bg-slate-50 border border-slate-300 rounded-xl focus:ring-2 focus:ring-slate-500 focus:outline-hidden"
          />
        </div>
      </form>
    </ResponsiveModal>
  );
};
