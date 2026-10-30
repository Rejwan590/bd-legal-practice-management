import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../foundation/AuthContext';
import { getRepositories } from '../../data/repositories';
import { CaseRecord, HearingRecord, HearingStatus, UserRecord } from '../../data/types';
import { isLawyerOrOwner } from '../../rolePresets';
import { toDateTimeInputValue } from '../../utils/dateUtils';
import { ResponsiveModal } from '../../components/responsive/ResponsiveModal';
import { Calendar, Save, AlertCircle, Lock } from 'lucide-react';
import { getFixedForOptionsForCategory, getFixedForLabel } from '../../data/hearingFixedFor';

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
    fixedFor: string;
    fixedForNote?: string;
    purpose: string;
    outcomeNote?: string;
    status?: HearingStatus;
  }) => Promise<void>;
}

export const HearingFormModal: React.FC<HearingFormModalProps> = ({
  isOpen,
  onClose,
  defaultCaseId,
  lockCaseId,
  defaultDate,
  initialData,
  onSave,
}) => {
  const { t, i18n } = useTranslation();
  const { currentUser } = useAuth();
  const repos = getRepositories();

  const [cases, setCases] = useState<CaseRecord[]>([]);
  const [activeLawyers, setActiveLawyers] = useState<UserRecord[]>([]);
  const [caseId, setCaseId] = useState(defaultCaseId || '');
  const [appearingLawyerId, setAppearingLawyerId] = useState<string>('');
  const [scheduledAt, setScheduledAt] = useState('');
  const [fixedFor, setFixedFor] = useState('first_hearing');
  const [fixedForNote, setFixedForNote] = useState('');
  const [purpose, setPurpose] = useState('');
  const [outcomeNote, setOutcomeNote] = useState('');
  const [status, setStatus] = useState<HearingStatus>('scheduled');
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const selectedCase = cases.find((c) => c.id === caseId);
  const fixedForOptions = getFixedForOptionsForCategory(selectedCase?.caseCategory);

  useEffect(() => {
    if (isOpen) {
      repos.case
        .list({ currentUser })
        .then((data) => {
          setCases(data);
          let targetCaseId = defaultCaseId || '';
          if (initialData) {
            targetCaseId = initialData.caseId;
          } else if (!targetCaseId && data.length > 0) {
            targetCaseId = data[0].id;
          }
          setCaseId(targetCaseId);

          const foundCase = data.find((c) => c.id === targetCaseId);
          const opts = getFixedForOptionsForCategory(foundCase?.caseCategory);
          if (initialData?.fixedFor) {
            setFixedFor(initialData.fixedFor);
            setFixedForNote(initialData.fixedForNote || '');
          } else if (opts.length > 0) {
            setFixedFor(opts[0].key);
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
        setScheduledAt(toDateTimeInputValue(initialData.scheduledAt));
        setFixedFor(initialData.fixedFor || 'first_hearing');
        setFixedForNote(initialData.fixedForNote || '');
        setPurpose(initialData.purpose);
        setOutcomeNote(initialData.outcomeNote || '');
        setStatus(initialData.status);
      } else {
        if (defaultDate && defaultDate.length >= 10) {
          setScheduledAt(`${defaultDate.slice(0, 10)}T10:30`);
        } else {
          const d = new Date();
          d.setDate(d.getDate() + 7);
          d.setHours(10, 30, 0, 0);
          setScheduledAt(toDateTimeInputValue(d));
        }
        if (defaultCaseId) {
          setCaseId(defaultCaseId);
        }
        setAppearingLawyerId('');
        setFixedFor('first_hearing');
        setFixedForNote('');
        setPurpose('');
        setOutcomeNote('');
        setStatus('scheduled');
      }
      setErrorMsg(null);
    }
  }, [isOpen, currentUser, defaultCaseId, defaultDate, initialData]);

  // When selected case changes, ensure fixedFor is valid for category
  const handleCaseChange = (newCaseId: string) => {
    setCaseId(newCaseId);
    const newCase = cases.find((c) => c.id === newCaseId);
    const opts = getFixedForOptionsForCategory(newCase?.caseCategory);
    if (!opts.some((o) => o.key === fixedFor)) {
      setFixedFor(opts[0]?.key || 'hearing');
    }
  };

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
    if (!fixedFor) {
      setErrorMsg(t('hearings.fixedForRequired'));
      return;
    }

    const currentLang = i18n.language === 'bn' ? 'bn' : 'en';
    const computedPurpose =
      purpose.trim() ||
      fixedForNote.trim() ||
      getFixedForLabel(fixedFor, currentLang) ||
      fixedFor;

    setSubmitting(true);
    setErrorMsg(null);
    try {
      await onSave({
        caseId,
        appearingLawyerId: appearingLawyerId || null,
        scheduledAt: new Date(scheduledAt).toISOString(),
        fixedFor,
        fixedForNote: fixedForNote.trim() || undefined,
        purpose: computedPurpose,
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

  const currentLang = i18n.language === 'bn' ? 'bn' : 'en';

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
              onChange={(e) => handleCaseChange(e.target.value)}
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
              value={toDateTimeInputValue(scheduledAt)}
              onChange={(e) => setScheduledAt(e.target.value)}
              className="w-full min-h-[44px] bg-slate-50 border border-slate-300 rounded-lg px-3 py-2 text-sm text-slate-900 focus:ring-2 focus:ring-slate-500 focus:outline-hidden"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              {t('hearings.fixedFor')} *
            </label>
            <select
              required
              value={fixedFor}
              onChange={(e) => setFixedFor(e.target.value)}
              className="w-full min-h-[44px] bg-slate-50 border border-slate-300 rounded-lg px-3 py-2 text-sm text-slate-900 focus:ring-2 focus:ring-slate-500 focus:outline-hidden"
            >
              {fixedForOptions.map((opt) => (
                <option key={opt.key} value={opt.key}>
                  {currentLang === 'bn' ? opt.labelBn : opt.labelEn}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              {t('hearings.fixedForNote')}
            </label>
            <input
              type="text"
              maxLength={200}
              value={fixedForNote}
              onChange={(e) => setFixedForNote(e.target.value)}
              placeholder={t('hearings.fixedForNotePlaceholder')}
              className="w-full min-h-[44px] bg-slate-50 border border-slate-300 rounded-lg px-3 py-2 text-sm text-slate-900 focus:ring-2 focus:ring-slate-500 focus:outline-hidden"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              {t('hearings.purpose')}
            </label>
            <input
              type="text"
              value={purpose}
              onChange={(e) => setPurpose(e.target.value)}
              placeholder={t('hearings.purposePlaceholder')}
              className="w-full min-h-[44px] bg-slate-50 border border-slate-300 rounded-lg px-3 py-2 text-sm text-slate-900 focus:ring-2 focus:ring-slate-500 focus:outline-hidden"
            />
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
