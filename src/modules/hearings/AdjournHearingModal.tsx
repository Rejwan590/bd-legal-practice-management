import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { HearingRecord } from '../../data/types';
import { ResponsiveModal } from '../../components/responsive/ResponsiveModal';
import { Gavel, Calendar, AlertCircle, Save } from 'lucide-react';

interface AdjournHearingModalProps {
  isOpen: boolean;
  onClose: () => void;
  hearing: HearingRecord | null;
  onAdjournAndScheduleNext: (
    hearingId: string,
    outcomeNote: string,
    nextDate: string,
    nextPurpose: string,
    reason: string
  ) => Promise<void>;
}

export const AdjournHearingModal: React.FC<AdjournHearingModalProps> = ({
  isOpen,
  onClose,
  hearing,
  onAdjournAndScheduleNext,
}) => {
  const { t } = useTranslation();
  const [outcomeNote, setOutcomeNote] = useState('');
  const [nextDate, setNextDate] = useState('');
  const [nextPurpose, setNextPurpose] = useState('');
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    if (hearing) {
      setOutcomeNote('Time petition allowed on condition; cost imposed. Fixed for step.');
      const future = new Date();
      future.setDate(future.getDate() + 21);
      future.setHours(10, 30, 0, 0);
      setNextDate(future.toISOString().slice(0, 16));
      setNextPurpose(hearing.purpose);
      setReason("Time petition (Sullah/Hazira) moved by Opposite Party");
    }
    setErrorMsg(null);
  }, [hearing, isOpen]);

  if (!hearing) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!outcomeNote.trim()) {
      setErrorMsg('Outcome order note is required');
      return;
    }
    if (!nextDate) {
      setErrorMsg('Next hearing date is required');
      return;
    }
    if (!nextPurpose.trim()) {
      setErrorMsg('Next hearing step / purpose is required');
      return;
    }
    if (!reason.trim()) {
      setErrorMsg('Adjournment reason is required');
      return;
    }

    setSubmitting(true);
    setErrorMsg(null);
    try {
      await onAdjournAndScheduleNext(
        hearing.id,
        outcomeNote.trim(),
        new Date(nextDate).toISOString(),
        nextPurpose.trim(),
        reason.trim()
      );
      onClose();
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : 'Failed to adjourn hearing');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <ResponsiveModal
      isOpen={isOpen}
      onClose={onClose}
      maxWidth="xl"
      title={
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-indigo-50 text-indigo-700 flex items-center justify-center shrink-0">
            <Gavel className="w-4 h-4" />
          </div>
          <span className="truncate">{t('hearings.adjournAndNext')}</span>
        </div>
      }
      subtitle="Record adjournment outcome order and fix the subsequent cause list date in one step"
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
            form="adjourn-hearing-form"
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

        <div className="bg-slate-50 p-3 rounded-xl border border-slate-200 text-xs space-y-1">
          <span className="text-[10px] uppercase font-bold text-slate-400 block">
            Adjourning Current Hearing:
          </span>
          <div className="font-semibold text-slate-900">{hearing.purpose}</div>
          <div className="text-slate-500 font-mono">
            Scheduled Date: {new Date(hearing.scheduledAt).toLocaleString()}
          </div>
        </div>

        <form id="adjourn-hearing-form" onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              {t('hearings.outcomeNote')} *
            </label>
            <textarea
              rows={2}
              required
              value={outcomeNote}
              onChange={(e) => setOutcomeNote(e.target.value)}
              placeholder={t('hearings.outcomePlaceholder')}
              className="w-full bg-slate-50 border border-slate-300 rounded-lg px-3 py-2 text-sm text-slate-900 focus:ring-2 focus:ring-slate-500 focus:outline-hidden"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              {t('hearings.reason')} *
            </label>
            <input
              type="text"
              required
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder={t('hearings.reasonPlaceholder')}
              className="w-full min-h-[44px] bg-slate-50 border border-slate-300 rounded-lg px-3 py-2 text-sm text-slate-900 focus:ring-2 focus:ring-slate-500 focus:outline-hidden"
            />
          </div>

          <div className="pt-2 border-t border-slate-100 space-y-3">
            <span className="text-xs font-bold text-indigo-700 flex items-center gap-1">
              <Calendar className="w-4 h-4" />
              Schedule Next Hearing Date (One-Step Workflow)
            </span>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  {t('hearings.nextDate')} *
                </label>
                <input
                  type="datetime-local"
                  required
                  value={nextDate}
                  onChange={(e) => setNextDate(e.target.value)}
                  className="w-full min-h-[44px] bg-slate-50 border border-slate-300 rounded-lg px-3 py-2 text-sm text-slate-900 focus:ring-2 focus:ring-slate-500 focus:outline-hidden"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  {t('hearings.nextPurpose')} *
                </label>
                <input
                  type="text"
                  required
                  value={nextPurpose}
                  onChange={(e) => setNextPurpose(e.target.value)}
                  placeholder={t('hearings.purposePlaceholder')}
                  className="w-full min-h-[44px] bg-slate-50 border border-slate-300 rounded-lg px-3 py-2 text-sm text-slate-900 focus:ring-2 focus:ring-slate-500 focus:outline-hidden"
                />
              </div>
            </div>
          </div>
        </form>
      </div>
    </ResponsiveModal>
  );
};
