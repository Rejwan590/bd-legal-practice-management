import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../foundation/AuthContext';
import { getRepositories } from '../../data/repositories';
import { CaseRecord, HearingRecord, HearingStatus, UserRecord } from '../../data/types';
import { isLawyerOrOwner } from '../../rolePresets';
import { ResponsiveModal } from '../../components/responsive/ResponsiveModal';
import { Calendar, Save, AlertCircle, Lock } from 'lucide-react';

interface HearingFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  defaultCaseId?: string;
  lockCaseId?: boolean;
  defaultDate?: string;
  initialData?: HearingRecord | null;
  onSave: (data: {
    caseId: string;
    appearingLawyerId?: string | null;
    scheduledAt: string;
    purpose: string;
    outcomeNote?: string;
    status?: HearingStatus;
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
  lockCaseId,
  defaultDate,
  initialData,
  onSave,
}) => {
  const { t } = useTranslation();
  const { currentUser } = useAuth();
  const repos = getRepositories();

  const [cases, setCases] = useState<CaseRecord[]>([]);
  const [activeLawyers, setActiveLawyers] = useState<UserRecord[]>([]);
  const [caseId, setCaseId] = useState(defaultCaseId || '');
  const [appearingLawyerId, setAppearingLawyerId] = useState<string>('');
  const [scheduledAt, setScheduledAt] = useState('');
  const [purpose, setPurpose] = useState(COMMON_PURPOSES[0]);
  const [customPurpose, setCustomPurpose] = useState('');
  const [outcomeNote, setOutcomeNote] = useState('');
  const [status, setStatus] = useState<HearingStatus>('scheduled');
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      repos.case
        .list({ currentUser })
        .then((data) => {
          setCases(data);
          if (initialData) {
            setCaseId(initialData.caseId);
          } else if (defaultCaseId) {
            setCaseId(defaultCaseId);
          } else if (data.length > 0) {
            setCaseId(data[0].id);
          }
        })
        .catch(console.error);

      repos.user
        .list({ currentUser })
        .then((usersData) => {
          const lawyers = usersData.filter(
            (u) => (u.status ?? 'active') === 'active' && isLawyerOrOwner(u)
          );
          setActiveLawyers(lawyers);
        })
        .catch(console.error);

      if (initialData) {
        setCaseId(initialData.caseId);
        setAppearingLawyerId(initialData.appearingLawyerId || '');
        setScheduledAt(initialData.scheduledAt.slice(0, 16));
        if (COMMON_PURPOSES.includes(initialData.purpose)) {
          setPurpose(initialData.purpose);
          setCustomPurpose('');
        } else {
          setPurpose('CUSTOM');
          setCustomPurpose(initialData.purpose);
        }
        setOutcomeNote(initialData.outcomeNote || '');
        setStatus(initialData.status);
      } else {
        if (defaultDate && defaultDate.length >= 10) {
          setScheduledAt(`${defaultDate.slice(0, 10)}T10:30`);
        } else {
          const d = new Date();
          d.setDate(d.getDate() + 7);
          d.setHours(10, 30, 0, 0);
          setScheduledAt(d.toISOString().slice(0, 16));
        }
        if (defaultCaseId) {
          setCaseId(defaultCaseId);
        }
        setAppearingLawyerId('');
        setPurpose(COMMON_PURPOSES[0]);
        setCustomPurpose('');
        setOutcomeNote('');
        setStatus('scheduled');
      }
      setErrorMsg(null);
    }
  }, [isOpen, currentUser, defaultCaseId, defaultDate, initialData]);

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
        appearingLawyerId: appearingLawyerId || null,
        scheduledAt: new Date(scheduledAt).toISOString(),
        purpose: finalPurpose,
        outcomeNote: outcomeNote.trim() || undefined,
        status: initialData ? status : undefined,
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
          <span className="truncate">
            {initialData ? t('common.edit') + ' ' + t('hearings.title') : t('hearings.scheduleHearing')}
          </span>
        </div>
      }
      subtitle="Register or update a court bench appearance or procedural step"
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
            <label className="block text-xs font-semibold text-slate-700 mb-1 flex items-center justify-between">
              <span>Select Court Case *</span>
              {(lockCaseId || initialData) && (
                <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-slate-500">
                  <Lock className="w-3 h-3" /> {t('hub.lockedField', 'Locked to context')}
                </span>
              )}
            </label>
            <select
              required
              disabled={Boolean(lockCaseId || initialData)}
              value={caseId}
              onChange={(e) => setCaseId(e.target.value)}
              className="w-full min-h-[44px] bg-slate-50 border border-slate-300 rounded-lg px-3 py-2 text-sm text-slate-900 focus:ring-2 focus:ring-slate-500 focus:outline-hidden disabled:opacity-65 disabled:cursor-not-allowed"
            >
              {cases.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.caseNumber} ({c.court}) - {c.fileSerial}
                </option>
              ))}
            </select>
          </div>

          {initialData && (
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                {t('common.status')}
              </label>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value as HearingStatus)}
                className="w-full min-h-[44px] bg-slate-50 border border-slate-300 rounded-lg px-3 py-2 text-sm text-slate-900 focus:ring-2 focus:ring-slate-500 focus:outline-hidden"
              >
                <option value="scheduled">{t('hearings.statusScheduled')}</option>
                <option value="held">{t('hearings.statusHeld')}</option>
                <option value="adjourned">{t('hearings.statusAdjourned')}</option>
                <option value="cancelled">{t('hearings.statusCancelled')}</option>
              </select>
            </div>
          )}

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              {t('hearings.appearingLawyer')}
            </label>
            <select
              value={appearingLawyerId}
              onChange={(e) => setAppearingLawyerId(e.target.value)}
              className="w-full min-h-[44px] bg-slate-50 border border-slate-300 rounded-lg px-3 py-2 text-sm text-slate-900 focus:ring-2 focus:ring-slate-500 focus:outline-hidden"
            >
              <option value="">{t('hearings.selectAppearingLawyer')}</option>
              {activeLawyers.map((lw) => (
                <option key={lw.id} value={lw.id}>
                  {lw.name} ({lw.role === 'Owner' ? 'Owner' : t(`settings.jobType_${lw.jobType || 'lawyer_junior'}`)})
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
