import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../foundation/AuthContext';
import { getRepositories } from '../../data/repositories';
import { CaseRecord } from '../../data/types';
import { ResponsiveModal } from '../../components/responsive/ResponsiveModal';
import { Calendar, Save, AlertCircle } from 'lucide-react';

interface HearingFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  defaultCaseId?: string;
  onSave: (data: {
    caseId: string;
    scheduledAt: string;
    purpose: string;
    outcomeNote?: string;
  }) => Promise<void>;
}

const COMMON_PURPOSES = [
  'Submission of Written Statement (W.S.)',
  'Framing of Issues',
  'Hearing on Injunction Application (Order 39)',
  'Examination-in-Chief of Plaintiff Witness',
  'Cross Examination of Defendant Witness',
  'Hearing on Additional Evidence',
  'Final Arguments on Both Sides',
  'Pronouncement of Judgment / Decree',
  'Hearing on Rule Nisi (High Court)',
];

export const HearingFormModal: React.FC<HearingFormModalProps> = ({
  isOpen,
  onClose,
  defaultCaseId,
  onSave,
}) => {
  const { t } = useTranslation();
  const { currentUser } = useAuth();
  const repos = getRepositories();

  const [cases, setCases] = useState<CaseRecord[]>([]);
  const [caseId, setCaseId] = useState(defaultCaseId || '');
  const [scheduledAt, setScheduledAt] = useState('');
  const [purpose, setPurpose] = useState(COMMON_PURPOSES[0]);
  const [customPurpose, setCustomPurpose] = useState('');
  const [outcomeNote, setOutcomeNote] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      repos.case
        .list({ currentUser })
        .then((data) => {
          setCases(data);
          if (!caseId && data.length > 0) {
            setCaseId(defaultCaseId || data[0].id);
          }
        })
        .catch(console.error);

      const d = new Date();
      d.setDate(d.getDate() + 7);
      d.setHours(10, 30, 0, 0);
      setScheduledAt(d.toISOString().slice(0, 16));
      setPurpose(COMMON_PURPOSES[0]);
      setCustomPurpose('');
      setOutcomeNote('');
      setErrorMsg(null);
    }
  }, [isOpen, currentUser, defaultCaseId]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!caseId) {
      setErrorMsg('Target case selection is required');
      return;
    }
    if (!scheduledAt) {
      setErrorMsg('Hearing date & time is required');
      return;
    }

    const finalPurpose = (purpose === 'CUSTOM' ? customPurpose : purpose).trim();
    if (!finalPurpose) {
      setErrorMsg('Hearing purpose is required');
      return;
    }

    setSubmitting(true);
    setErrorMsg(null);
    try {
      await onSave({
        caseId,
        scheduledAt: new Date(scheduledAt).toISOString(),
        purpose: finalPurpose,
        outcomeNote: outcomeNote.trim() || undefined,
      });
      onClose();
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : 'Failed to schedule hearing');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <ResponsiveModal
      isOpen={isOpen}
      onClose={onClose}
      maxWidth="lg"
      title={
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-indigo-50 text-indigo-700 flex items-center justify-center shrink-0">
            <Calendar className="w-4 h-4" />
          </div>
          <span className="truncate">{t('hearings.scheduleHearing')}</span>
        </div>
      }
      subtitle="Register an upcoming court bench appearance or procedural step"
      footer={
        <div className="flex items-center justify-end gap-3 w-full">
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            className="min-h-[44px] px-4 py-2 text-sm font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-xl transition"
          >
            {t('common.cancel')}
          </button>
          <button
            type="submit"
            form="hearing-form-modal"
            disabled={submitting}
            className="min-h-[44px] inline-flex items-center justify-center gap-2 px-5 py-2 bg-slate-900 hover:bg-slate-800 text-white text-sm font-semibold rounded-xl shadow-xs transition disabled:opacity-50"
          >
            <Save className="w-4 h-4" />
            {submitting ? t('common.loading') : t('common.save')}
          </button>
        </div>
      }
    >
      <div className="space-y-4">
        {errorMsg && (
          <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-rose-700 text-xs flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{errorMsg}</span>
          </div>
        )}

        <form id="hearing-form-modal" onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Select Court Case *
            </label>
            <select
              required
              value={caseId}
              onChange={(e) => setCaseId(e.target.value)}
              className="w-full min-h-[44px] bg-slate-50 border border-slate-300 rounded-lg px-3 py-2 text-sm text-slate-900 focus:ring-2 focus:ring-slate-500 focus:outline-hidden"
            >
              {cases.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.caseNumber} ({c.court}) - {c.fileSerial}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              {t('hearings.scheduledAt')} *
            </label>
            <input
              type="datetime-local"
              required
              value={scheduledAt}
              onChange={(e) => setScheduledAt(e.target.value)}
              className="w-full min-h-[44px] bg-slate-50 border border-slate-300 rounded-lg px-3 py-2 text-sm text-slate-900 focus:ring-2 focus:ring-slate-500 focus:outline-hidden"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              {t('hearings.purpose')} *
            </label>
            <select
              value={purpose}
              onChange={(e) => setPurpose(e.target.value)}
              className="w-full min-h-[44px] bg-slate-50 border border-slate-300 rounded-lg px-3 py-2 text-sm text-slate-900 focus:ring-2 focus:ring-slate-500 focus:outline-hidden mb-2"
            >
              {COMMON_PURPOSES.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
              <option value="CUSTOM">Custom Purpose / Step...</option>
            </select>
            {purpose === 'CUSTOM' && (
              <input
                type="text"
                required
                value={customPurpose}
                onChange={(e) => setCustomPurpose(e.target.value)}
                placeholder="Specify hearing step..."
                className="w-full min-h-[44px] bg-slate-50 border border-slate-300 rounded-lg px-3 py-2 text-sm text-slate-900 focus:ring-2 focus:ring-slate-500 focus:outline-hidden"
              />
            )}
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              {t('hearings.outcomeNote')}
            </label>
            <textarea
              rows={2}
              value={outcomeNote}
              onChange={(e) => setOutcomeNote(e.target.value)}
              placeholder="Initial directions or filing instructions..."
              className="w-full bg-slate-50 border border-slate-300 rounded-lg px-3 py-2 text-sm text-slate-900 focus:ring-2 focus:ring-slate-500 focus:outline-hidden"
            />
          </div>
        </form>
      </div>
    </ResponsiveModal>
  );
};
