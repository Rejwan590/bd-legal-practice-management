import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../foundation/AuthContext';
import { getRepositories } from '../../data/repositories';
import { FeeAgreement } from '../../data/types';
import { Edit3, AlertCircle } from 'lucide-react';
import { ResponsiveModal } from '../../components/responsive/ResponsiveModal';
import { formatBdt, takaToPaisa, paisaToTaka } from '../../utils/currency';

interface ReviseAgreementModalProps {
  isOpen: boolean;
  agreement: FeeAgreement | null;
  onClose: () => void;
  onSuccess: () => void;
}

export const ReviseAgreementModal: React.FC<ReviseAgreementModalProps> = ({
  isOpen,
  agreement,
  onClose,
  onSuccess,
}) => {
  const { t, i18n } = useTranslation();
  const { currentUser } = useAuth();
  const repos = getRepositories();

  const [takaAmount, setTakaAmount] = useState('');
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen && agreement) {
      setTakaAmount(String(paisaToTaka(agreement.agreedAmountPaisa)));
      setReason('');
      setErrorMsg(null);
    }
  }, [isOpen, agreement]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentUser || !agreement) return;

    const paisa = takaToPaisa(takaAmount);
    if (paisa <= 0) {
      setErrorMsg(t('billing.errors.positiveAmount', 'Amount must be greater than zero'));
      return;
    }

    if (reason.trim().length < 3) {
      setErrorMsg(t('billing.errors.reasonMinLength', 'Reason must be at least 3 characters long'));
      return;
    }

    setSaving(true);
    setErrorMsg(null);

    try {
      await repos.accounts.reviseAgreement(
        { currentUser },
        agreement.id,
        paisa,
        reason.trim()
      );
      onSuccess();
      onClose();
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : t('billing.errors.saveFailed', 'Failed to revise agreement'));
    } finally {
      setSaving(false);
    }
  };

  if (!agreement) return null;

  return (
    <ResponsiveModal
      isOpen={isOpen}
      onClose={onClose}
      title={t('billing.reviseFee', 'Revise Agreed Fee')}
      subtitle={t('billing.reviseFeeSub', 'Update fee amount with audit trail')}
      icon={Edit3}
      maxWidth="md"
      footer={
        <div className="flex items-center justify-end gap-3 w-full">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100 rounded-lg min-h-[44px]"
            disabled={saving}
          >
            {t('common.cancel', 'Cancel')}
          </button>
          <button
            type="submit"
            form="revise-agreement-form"
            className="px-5 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg min-h-[44px] flex items-center gap-2 disabled:opacity-50"
            disabled={saving}
          >
            {saving ? t('common.saving', 'Updating...') : t('billing.saveRevision', 'Update Fee')}
          </button>
        </div>
      }
    >
      <form id="revise-agreement-form" onSubmit={handleSubmit} className="space-y-4">
        {errorMsg && (
          <div className="p-3 bg-rose-50 border border-rose-200 rounded-lg text-rose-700 text-xs flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0 text-rose-600" />
            <span>{errorMsg}</span>
          </div>
        )}

        <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg text-xs">
          <span className="text-slate-500">{t('billing.currentAgreedFee', 'Current Agreed Fee')}:</span>{' '}
          <span className="font-semibold text-slate-800 text-sm">
            {formatBdt(agreement.agreedAmountPaisa, { lang: i18n.language })}
          </span>
        </div>

        <div>
          <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
            {t('billing.newAgreedAmount', 'New Agreed Amount (৳ Taka)')} *
          </label>
          <input
            type="number"
            step="any"
            min="1"
            value={takaAmount}
            onChange={(e) => setTakaAmount(e.target.value)}
            required
            className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 min-h-[44px]"
          />
        </div>

        <div>
          <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
            {t('billing.revisionReason', 'Reason for Revision')} *
          </label>
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="e.g. Scope expanded to appeal / Additional interlocutory applications"
            rows={3}
            maxLength={500}
            required
            className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          />
          <p className="text-[11px] text-slate-400 mt-0.5 text-right">{reason.length} / 500</p>
        </div>
      </form>
    </ResponsiveModal>
  );
};
