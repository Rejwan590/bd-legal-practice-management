import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AlertTriangle, AlertCircle } from 'lucide-react';
import { ResponsiveModal } from '../../components/responsive/ResponsiveModal';

interface VoidRecordModalProps {
  isOpen: boolean;
  title: string;
  itemDescription: string;
  onClose: () => void;
  onConfirm: (reason: string) => Promise<void>;
}

export const VoidRecordModal: React.FC<VoidRecordModalProps> = ({
  isOpen,
  title,
  itemDescription,
  onClose,
  onConfirm,
}) => {
  const { t } = useTranslation();
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (reason.trim().length < 3) {
      setErrorMsg(t('billing.errors.reasonMinLength', 'Reason must be at least 3 characters long'));
      return;
    }

    setSubmitting(true);
    setErrorMsg(null);
    try {
      await onConfirm(reason.trim());
      setReason('');
      onClose();
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : t('billing.errors.voidFailed', 'Failed to void record'));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <ResponsiveModal
      isOpen={isOpen}
      onClose={onClose}
      title={title}
      subtitle={t('billing.voidSubtitle', 'Permanent reversal with audit reason')}
      icon={AlertTriangle}
      maxWidth="md"
      footer={
        <div className="flex items-center justify-end gap-3 w-full">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100 rounded-lg min-h-[44px]"
            disabled={submitting}
          >
            {t('common.cancel', 'Cancel')}
          </button>
          <button
            type="submit"
            form="void-record-form"
            className="px-5 py-2 text-sm font-medium text-white bg-rose-600 hover:bg-rose-700 rounded-lg min-h-[44px] flex items-center gap-2 disabled:opacity-50"
            disabled={submitting}
          >
            {submitting ? t('common.submitting', 'Voiding...') : t('billing.confirmVoid', 'Confirm Void')}
          </button>
        </div>
      }
    >
      <form id="void-record-form" onSubmit={handleSubmit} className="space-y-4">
        {errorMsg && (
          <div className="p-3 bg-rose-50 border border-rose-200 rounded-lg text-rose-700 text-xs flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0 text-rose-600" />
            <span>{errorMsg}</span>
          </div>
        )}

        <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-800">
          <p className="font-medium text-amber-900 mb-1">{itemDescription}</p>
          <p>{t('billing.voidWarning', 'This entry will be marked VOID and excluded from all balance math. This action cannot be undone.')}</p>
        </div>

        <div>
          <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
            {t('billing.voidReason', 'Reason for Voiding')} *
          </label>
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="e.g. Entry made in error / Bounced cheque / Duplicate receipt"
            rows={3}
            maxLength={500}
            required
            className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-rose-500 focus:border-rose-500"
          />
          <p className="text-[11px] text-slate-400 mt-0.5 text-right">{reason.length} / 500</p>
        </div>
      </form>
    </ResponsiveModal>
  );
};
