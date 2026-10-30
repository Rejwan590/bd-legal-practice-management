import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { HearingRecord } from '../../data/types';
import { toDateTimeInputValue } from '../../utils/dateUtils';
import { ResponsiveModal } from '../../components/responsive/ResponsiveModal';
import { Gavel, AlertCircle, Save } from 'lucide-react';
import { CIVIL_FIXED_FOR_OPTIONS, CRIMINAL_FIXED_FOR_OPTIONS } from '../../data/hearingFixedFor';

interface BulkAdjournModalProps {
  isOpen: boolean;
  onClose: () => void;
  selectedHearings: HearingRecord[];
  onConfirm: (data: {
    nextDate: string;
    reason: string;
    nextFixedFor?: string;
    nextFixedForNote?: string;
    outcomeNote?: string;
  }) => Promise<void>;
}

const COMMON_REASONS = [
  'Time petition (Sullah/Hazira) moved by Opposite Party',
  'Presiding Judge on leave / Court vacant',
  'Bar Council resolution / Advocate General meeting',
  'Part-heard matter adjourned for further examination',
  'Awaiting Lower Court Records (LCR) / Case Diary',
  'Writ Bench not sitting on listed day',
];

export const BulkAdjournModal: React.FC<BulkAdjournModalProps> = ({
  isOpen,
  onClose,
  selectedHearings,
  onConfirm,
}) => {
  const { t, i18n } = useTranslation();
  const [nextDate, setNextDate] = useState('');
  const [nextFixedFor, setNextFixedFor] = useState('');
  const [nextFixedForNote, setNextFixedForNote] = useState('');
  const [reason, setReason] = useState(COMMON_REASONS[0]);
  const [outcomeNote, setOutcomeNote] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const currentLang = i18n.language === 'bn' ? 'bn' : 'en';

  const allPurposeOptions = [
    ...CIVIL_FIXED_FOR_OPTIONS,
    ...CRIMINAL_FIXED_FOR_OPTIONS.filter((c) => !CIVIL_FIXED_FOR_OPTIONS.some((o) => o.key === c.key)),
  ];

  useEffect(() => {
    if (isOpen) {
      const future = new Date();
      future.setDate(future.getDate() + 21);
      future.setHours(10, 30, 0, 0);
      setNextDate(toDateTimeInputValue(future));
      setNextFixedFor('');
      setNextFixedForNote('');
      setReason(COMMON_REASONS[0]);
      setOutcomeNote('Time petition allowed on condition; cost imposed. Fixed for step.');
      setErrorMsg(null);
    }
  }, [isOpen]);

  if (!isOpen || selectedHearings.length === 0) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!nextDate) {
      setErrorMsg(t('hearings.nextDate') + ' is required');
      return;
    }
    if (!reason.trim()) {
      setErrorMsg(t('hearings.reason') + ' is required');
      return;
    }

    setSubmitting(true);
    setErrorMsg(null);
    try {
      await onConfirm({
        nextDate: new Date(nextDate).toISOString(),
        reason: reason.trim(),
        nextFixedFor: nextFixedFor ? nextFixedFor : undefined,
        nextFixedForNote: nextFixedForNote.trim() || undefined,
        outcomeNote: outcomeNote.trim() || undefined,
      });
      onClose();
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : 'Failed to bulk adjourn hearings');
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
          <div className="w-8 h-8 rounded-lg bg-amber-50 text-amber-700 flex items-center justify-center shrink-0">
            <Gavel className="w-4 h-4" />
          </div>
          <span className="truncate">{t('hearings.bulkAdjournTitle')}</span>
        </div>
      }
      subtitle={t('hearings.selectedCount', { count: selectedHearings.length })}
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
            form="bulk-adjourn-form"
            disabled={submitting}
            className="min-h-[44px] inline-flex items-center justify-center gap-2 px-5 py-2 bg-amber-600 hover:bg-amber-700 text-white text-sm font-semibold rounded-xl shadow-xs transition disabled:opacity-50"
          >
            <Save className="w-4 h-4" />
            {submitting ? t('common.loading') : `${t('hearings.adjournSelected')} (${selectedHearings.length})`}
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

        <div className="bg-amber-50/70 border border-amber-200 p-3 rounded-xl text-xs text-amber-900 space-y-1">
          <span className="font-bold block">
            {t('hearings.selectedCount', { count: selectedHearings.length })}:
          </span>
          <div className="flex flex-wrap gap-1.5 max-h-24 overflow-y-auto pt-1">
            {selectedHearings.map((h) => (
              <span
                key={h.id}
                className="px-2 py-0.5 bg-white border border-amber-200 rounded text-[11px] font-mono"
              >
                {h.purpose}
              </span>
            ))}
          </div>
        </div>

        <form id="bulk-adjourn-form" onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                {t('hearings.nextDate')} *
              </label>
              <input
                type="datetime-local"
                required
                value={toDateTimeInputValue(nextDate)}
                onChange={(e) => setNextDate(e.target.value)}
                className="w-full min-h-[44px] bg-slate-50 border border-slate-300 rounded-lg px-3 py-2 text-sm text-slate-900 focus:ring-2 focus:ring-slate-500 focus:outline-hidden"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                {t('hearings.nextFixedFor')}
              </label>
              <select
                value={nextFixedFor}
                onChange={(e) => setNextFixedFor(e.target.value)}
                className="w-full min-h-[44px] bg-slate-50 border border-slate-300 rounded-lg px-3 py-2 text-sm text-slate-900 focus:ring-2 focus:ring-slate-500 focus:outline-hidden"
              >
                <option value="">{t('hearings.keepOriginalPurpose')}</option>
                {allPurposeOptions.map((opt) => (
                  <option key={opt.key} value={opt.key}>
                    {currentLang === 'bn' ? opt.labelBn : opt.labelEn}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              {t('hearings.nextFixedForNote')}
            </label>
            <input
              type="text"
              maxLength={200}
              value={nextFixedForNote}
              onChange={(e) => setNextFixedForNote(e.target.value)}
              placeholder={t('hearings.nextFixedForNotePlaceholder')}
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

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              {t('hearings.outcomeNote')}
            </label>
            <textarea
              rows={2}
              value={outcomeNote}
              onChange={(e) => setOutcomeNote(e.target.value)}
              placeholder={t('hearings.outcomePlaceholder')}
              className="w-full bg-slate-50 border border-slate-300 rounded-lg px-3 py-2 text-sm text-slate-900 focus:ring-2 focus:ring-slate-500 focus:outline-hidden"
            />
          </div>
        </form>
      </div>
    </ResponsiveModal>
  );
};
