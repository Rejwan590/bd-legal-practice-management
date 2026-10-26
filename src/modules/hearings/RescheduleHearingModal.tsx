import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { HearingRecord, CaseCategory } from '../../data/types';
import { useAuth } from '../foundation/AuthContext';
import { getRepositories } from '../../data/repositories';
import { ResponsiveModal } from '../../components/responsive/ResponsiveModal';
import { Calendar, AlertCircle, Save, Clock } from 'lucide-react';
import { getFixedForOptionsForCategory, getFixedForLabel } from '../../data/hearingFixedFor';

interface RescheduleHearingModalProps {
  isOpen: boolean;
  onClose: () => void;
  hearing: HearingRecord | null;
  onReschedule: (
    hearingId: string,
    newDate: string,
    reason: string,
    fixedFor?: string,
    fixedForNote?: string
  ) => Promise<void>;
}

const COMMON_REASONS = [
  "Time petition (Sullah/Hazira) moved by Opposite Party",
  "Presiding Judge on leave / Court vacant",
  "Bar Council resolution / Advocate General meeting",
  "Part-heard matter adjourned for further examination",
  "Awaiting Lower Court Records (LCR) / Case Diary",
  "Writ Bench not sitting on listed day",
];

export const RescheduleHearingModal: React.FC<RescheduleHearingModalProps> = ({
  isOpen,
  onClose,
  hearing,
  onReschedule,
}) => {
  const { t, i18n } = useTranslation();
  const { currentUser } = useAuth();
  const repos = getRepositories();

  const [newDate, setNewDate] = useState('');
  const [reason, setReason] = useState('');
  const [fixedFor, setFixedFor] = useState('hearing');
  const [fixedForNote, setFixedForNote] = useState('');
  const [category, setCategory] = useState<CaseCategory | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const fixedForOptions = getFixedForOptionsForCategory(category);
  const currentLang = i18n.language === 'bn' ? 'bn' : 'en';

  useEffect(() => {
    if (hearing && isOpen) {
      // Default to 14 days after current scheduled date
      const current = new Date(hearing.scheduledAt);
      current.setDate(current.getDate() + 14);
      setNewDate(current.toISOString().slice(0, 16));
      setReason(COMMON_REASONS[0]);
      setFixedFor(hearing.fixedFor || 'hearing');
      setFixedForNote(hearing.fixedForNote || '');

      if (currentUser) {
        repos.case
          .getById({ currentUser }, hearing.caseId)
          .then((caseRec) => {
            if (caseRec) {
              setCategory(caseRec.caseCategory || null);
              const opts = getFixedForOptionsForCategory(caseRec.caseCategory);
            if (hearing.fixedFor) {
              setFixedFor(hearing.fixedFor);
            } else if (opts.length > 0) {
              setFixedFor(opts[0].key);
            }
          }
          })
          .catch(console.error);
      }
    }
    setErrorMsg(null);
  }, [hearing, isOpen, currentUser]);

  if (!hearing) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newDate) {
      setErrorMsg('New hearing date is required');
      return;
    }
    if (!fixedFor) {
      setErrorMsg(t('hearings.fixedForRequired'));
      return;
    }
    if (!reason.trim()) {
      setErrorMsg('Reason for date change is required to maintain audit history');
      return;
    }

    setSubmitting(true);
    setErrorMsg(null);
    try {
      await onReschedule(
        hearing.id,
        new Date(newDate).toISOString(),
        reason.trim(),
        fixedFor,
        fixedForNote.trim() || undefined
      );
      onClose();
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : 'Failed to reschedule hearing');
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
          <span className="truncate">{t('hearings.rescheduleDate')}</span>
        </div>
      }
      subtitle="Shift cause list appearance to an alternate fixture date"
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
            form="reschedule-hearing-form"
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

        <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-200 text-xs space-y-1">
          <div className="font-semibold text-slate-800">
            {t('hearings.purpose')}: <span className="font-normal">{hearing.purpose}</span>
            {hearing.fixedFor && (
              <span className="ml-2 inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium bg-blue-50 text-blue-700 border border-blue-200">
                {getFixedForLabel(hearing.fixedFor, currentLang)}
              </span>
            )}
          </div>
          <div className="text-slate-600 flex items-center gap-1.5 font-medium">
            <Clock className="w-3.5 h-3.5 text-slate-400" />
            <span>
              Current Hearing Date: <strong>{new Date(hearing.scheduledAt).toLocaleString()}</strong>
            </span>
          </div>
        </div>

        <form id="reschedule-hearing-form" onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              {t('hearings.newDate')} *
            </label>
            <input
              type="datetime-local"
              required
              value={newDate}
              onChange={(e) => setNewDate(e.target.value)}
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
              {t('hearings.reason')} *
            </label>
            <select
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              className="w-full min-h-[44px] bg-slate-50 border border-slate-300 rounded-lg px-3 py-2 text-sm text-slate-900 focus:ring-2 focus:ring-slate-500 focus:outline-hidden mb-2"
            >
              {COMMON_REASONS.map((r, i) => (
                <option key={i} value={r}>
                  {r}
                </option>
              ))}
              <option value="CUSTOM">Custom Reason...</option>
            </select>
            {reason === 'CUSTOM' && (
              <textarea
                rows={2}
                required
                onChange={(e) => setReason(e.target.value)}
                placeholder={t('hearings.reasonPlaceholder')}
                className="w-full bg-slate-50 border border-slate-300 rounded-lg px-3 py-2 text-sm text-slate-900 focus:ring-2 focus:ring-slate-500 focus:outline-hidden"
              />
            )}
          </div>
        </form>
      </div>
    </ResponsiveModal>
  );
};
