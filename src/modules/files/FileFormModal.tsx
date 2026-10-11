import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../foundation/AuthContext';
import { getRepositories } from '../../data/repositories';
import { CaseRecord, ClientRecord, PhysicalFileRecord } from '../../data/types';
import { FolderArchive, Briefcase, User, MapPin, AlertCircle, Lock } from 'lucide-react';
import { ResponsiveModal } from '../../components/responsive/ResponsiveModal';

interface FileFormModalProps {
  isOpen: boolean;
  initialData?: PhysicalFileRecord | null;
  defaultCaseId?: string | null;
  defaultClientId?: string | null;
  lockCaseAndClient?: boolean;
  lockClientOnly?: boolean;
  onClose: () => void;
  onSave: (data: {
    title: string;
    caseId?: string | null;
    clientId?: string | null;
    shelfLocation?: string;
    notes?: string;
  }) => Promise<void>;
}

export const FileFormModal: React.FC<FileFormModalProps> = ({
  isOpen,
  initialData,
  defaultCaseId,
  defaultClientId,
  lockCaseAndClient,
  lockClientOnly,
  onClose,
  onSave,
}) => {
  const { t } = useTranslation();
  const { currentUser } = useAuth();
  const repos = getRepositories();

  const [title, setTitle] = useState('');
  const [shelfLocation, setShelfLocation] = useState('');
  const [caseId, setCaseId] = useState('');
  const [clientId, setClientId] = useState('');
  const [notes, setNotes] = useState('');
  const [previewSerial, setPreviewSerial] = useState('');

  const [cases, setCases] = useState<CaseRecord[]>([]);
  const [clients, setClients] = useState<ClientRecord[]>([]);
  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      Promise.all([
        repos.case.list({ currentUser }),
        repos.client.list({ currentUser }),
        repos.physicalFile.getNextSerial({ currentUser }),
      ])
        .then(([caseData, clientData, nextSerial]) => {
          setCases(caseData);
          setClients(clientData);

          if (initialData) {
            setTitle(initialData.title);
            setShelfLocation(initialData.shelfLocation || 'Cabinet A, Shelf 1');
            setCaseId(initialData.caseId || '');
            setClientId(initialData.clientId || '');
            setNotes(initialData.notes || '');
            setPreviewSerial(initialData.serial);
          } else {
            const matchedCase = defaultCaseId
              ? caseData.find((c) => c.id === defaultCaseId)
              : undefined;
            setTitle(matchedCase ? `${matchedCase.caseNumber} - Case File Dossier` : '');
            setShelfLocation('Cabinet A, Shelf 1');
            setCaseId(defaultCaseId || '');
            setClientId(defaultClientId || matchedCase?.clientId || '');
            setNotes('');
            setPreviewSerial(nextSerial);
          }
        })
        .catch(console.error);

      setErrorMsg(null);
    }
  }, [isOpen, initialData, defaultCaseId, defaultClientId, currentUser]);

  const handleCaseChange = (newCaseId: string) => {
    setCaseId(newCaseId);
    if (newCaseId) {
      const selected = cases.find((c) => c.id === newCaseId);
      if (selected) {
        if (!title) {
          setTitle(`${selected.caseNumber} - Case File Dossier`);
        }
        if (selected.clientId) {
          setClientId(selected.clientId);
        }
      }
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) {
      setErrorMsg('File title is required');
      return;
    }

    setSaving(true);
    setErrorMsg(null);
    try {
      await onSave({
        title: title.trim(),
        caseId: caseId || null,
        clientId: clientId || null,
        shelfLocation: shelfLocation.trim() || undefined,
        notes: notes.trim() || undefined,
      });
      onClose();
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : 'Failed to save physical file');
    } finally {
      setSaving(false);
    }
  };

  if (!isOpen) return null;

  return (
    <ResponsiveModal
      isOpen={isOpen}
      onClose={onClose}
      title={initialData ? t('files.editFile') : t('files.addFile')}
      subtitle={`${t('files.serial')}: ${previewSerial}`}
      icon={FolderArchive}
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
            form="file-form-modal"
            disabled={saving}
            className="flex-1 sm:flex-initial px-5 py-2.5 min-h-[44px] text-xs font-semibold bg-slate-900 hover:bg-slate-800 text-white rounded-xl shadow-xs transition disabled:opacity-50 inline-flex items-center justify-center gap-1.5"
          >
            {saving ? t('common.loading') : t('common.save')}
          </button>
        </div>
      }
    >
      <form id="file-form-modal" onSubmit={handleSubmit} className="space-y-4">
        {errorMsg && (
          <div className="flex items-center gap-2 p-3 bg-rose-50 border border-rose-200 rounded-xl text-rose-700 text-xs">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{errorMsg}</span>
          </div>
        )}

        <div>
          <label className="block text-xs font-semibold text-slate-700 mb-1.5">
            {t('files.fileTitle')} *
          </label>
          <input
            type="text"
            required
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder={t('files.fileTitlePlaceholder')}
            className="w-full px-3.5 py-2.5 text-xs bg-slate-50 border border-slate-300 rounded-xl focus:ring-2 focus:ring-slate-500 focus:outline-hidden"
          />
        </div>

        <div>
          <label className="block text-xs font-semibold text-slate-700 mb-1.5 flex items-center gap-1">
            <MapPin className="w-3.5 h-3.5 text-slate-400" />
            {t('files.shelfLocation')} *
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

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1.5 flex items-center justify-between gap-1">
              <span className="flex items-center gap-1">
                <Briefcase className="w-3.5 h-3.5 text-slate-400" />
                {t('files.linkedCase')}
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
              <option value="">{t('files.noLinkedCase')}</option>
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
                {t('files.linkedClient')}
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
              <option value="">{t('files.noLinkedClient')}</option>
              {clients.map((cl) => (
                <option key={cl.id} value={cl.id}>
                  {cl.name} {cl.nameBn ? `(${cl.nameBn})` : ''}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div>
          <label className="block text-xs font-semibold text-slate-700 mb-1.5">
            {t('files.notes')}
          </label>
          <textarea
            rows={3}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder={t('files.notesPlaceholder')}
            className="w-full px-3.5 py-2.5 text-xs bg-slate-50 border border-slate-300 rounded-xl focus:ring-2 focus:ring-slate-500 focus:outline-hidden"
          />
        </div>
      </form>
    </ResponsiveModal>
  );
};
