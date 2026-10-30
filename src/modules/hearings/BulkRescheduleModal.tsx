import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { HearingRecord } from '../../data/types';
import { toDateTimeInputValue } from '../../utils/dateUtils';
import { ResponsiveModal } from '../../components/responsive/ResponsiveModal';
import { Calendar, AlertCircle, Save } from 'lucide-react';
import { CIVIL_FIXED_FOR_OPTIONS, CRIMINAL_FIXED_FOR_OPTIONS } from '../../data/hearingFixedFor';

interface BulkRescheduleModalProps {
  isOpen: boolean;
  onClose: () => void;
  selectedHearings: HearingRecord[];
  onConfirm: (data: {
    newDate: string;
    reason: string;
    fixedFor?: string;
    fixedForNote?: string;
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

export const BulkRescheduleModal: React.FC<BulkRescheduleModalProps> = ({
  isOpen,
  onClose,
  selectedHearings,
  onConfirm,
}) => {
  const { t, i18n } = useTranslation();
  const [newDate, setNewDate] = useState('');
  const [fixedFor, setFixedFor] = useState('');
  const [fixedForNote, setFixedForNote] = useState('');
  const [reason, setReason] = useState(COMMON_REASONS[0]);
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
      future.setDate(future.getDate() + 14);
      future.setHours(10, 30, 0, 0);
      setNewDate(toDateTimeInputValue(future));
      setFixedFor('');
      setFixedForNote('');
      setReason(COMMON_REASONS[0]);
      setErrorMsg(null);
    }
  }, [isOpen]);

  if (!isOpen || selectedHearings.length === 0) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newDate) {
      setErrorMsg(t('hearings.newDate') + ' is required');
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
        newDate: new Date(newDate).toISOString(),
        reason: reason.trim(),
        fixedFor: fixedFor ? fixedFor : undefined,
        fixedForNote: fixedForNote.trim() || undefined,
      });
      onClose();
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : 'Failed to bulk reschedule hearings');
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
            <Calendar className="w-4 h-4" />
          </div>
          <span className="truncate">{t('hearings.bulkRescheduleTitle')}</span>
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
            form="bulk-reschedule-form"
            disabled={submitting}
            className="min-h-[44px] inline-flex items-center justify-center gap-2 px-5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold rounded-xl shadow-xs transition disabled:opacity-50"
          >
            <Save className="w-4 h-4" />
            {submitting ? t('common.loading') : `${t('hearings.rescheduleSelected')} (${selectedHearings.length})`}
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

        <div className="bg-indigo-50/70 border border-indigo-200 p-3 rounded-xl text-xs text-indigo-900 space-y-1">
          <span className="font-bold block">
            {t('hearings.selectedCount', { count: selectedHearings.length })}:
          </span>
          <div className="flex flex-wrap gap-1.5 max-h-24 overflow-y-auto pt-1">
            {selectedHearings.map((h) => (
              <span
                key={h.id}
                className="px-2 py-0.5 bg-white border border-indigo-200 rounded text-[11px] font-mono"
              >
                {h.purpose}
              </span>
            ))}
          </div>
        </div>

        <form id="bulk-reschedule-form" onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                {t('hearings.newDate')} *
              </label>
              <input
                type="datetime-local"
                required
                value={toDateTimeInputValue(newDate)}
                onChange={(e) => setNewDate(e.target.value)}
                className="w-full min-h-[44px] bg-slate-50 border border-slate-300 rounded-lg px-3 py-2 text-sm text-slate-900 focus:ring-2 focus:ring-slate-500 focus:outline-hidden"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                {t('hearings.fixedFor')}
              </label>
              <select
                value={fixedFor}
                onChange={(e) => setFixedFor(e.target.value)}
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
