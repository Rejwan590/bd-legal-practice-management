import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../foundation/AuthContext';
import { getRepositories } from '../../data/repositories';
import { CaseRecord, FeeAgreement, FeePayment } from '../../data/types';
import { Link2, AlertCircle } from 'lucide-react';
import { ResponsiveModal } from '../../components/responsive/ResponsiveModal';
import { formatBdt } from '../../utils/currency';

interface AttachPaymentModalProps {
  isOpen: boolean;
  payment: FeePayment | null;
  agreements: FeeAgreement[];
  cases: CaseRecord[];
  onClose: () => void;
  onSuccess: () => void;
}

export const AttachPaymentModal: React.FC<AttachPaymentModalProps> = ({
  isOpen,
  payment,
  agreements,
  cases,
  onClose,
  onSuccess,
}) => {
  const { t, i18n } = useTranslation();
  const { currentUser } = useAuth();
  const repos = getRepositories();

  const [selectedAgreementId, setSelectedAgreementId] = useState<string>('');
  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const activeAgreements = agreements.filter((a) => a.status === 'active' && a.caseId);

  useEffect(() => {
    if (isOpen) {
      setErrorMsg(null);
      if (activeAgreements.length === 1) {
        setSelectedAgreementId(activeAgreements[0].id);
      } else {
        setSelectedAgreementId('');
      }
    }
  }, [isOpen, agreements]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentUser || !payment) return;

    if (!selectedAgreementId) {
      setErrorMsg(t('billing.errors.agreementRequired', 'Please select a fee agreement to attach'));
      return;
    }

    setSaving(true);
    setErrorMsg(null);

    try {
      await repos.accounts.attachPaymentToAgreement({ currentUser }, payment.id, selectedAgreementId);
      onSuccess();
      onClose();
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : t('billing.errors.saveFailed', 'Failed to attach payment'));
    } finally {
      setSaving(false);
    }
  };

  const getCaseLabel = (caseId: string | null) => {
    if (!caseId) return '';
    const c = cases.find((item) => item.id === caseId);
    return c ? `${c.caseNumber} - ${c.matterType || c.court}` : caseId;
  };

  return (
    <ResponsiveModal
      isOpen={isOpen && !!payment}
      onClose={onClose}
      title={t('billing.attachModalTitle', 'Attach Payment to Fee Agreement')}
      subtitle={t('billing.attachModalDesc', 'Link this legacy payment to an active case agreement')}
      icon={Link2}
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
            form="attach-payment-form"
            className="px-5 py-2 text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg min-h-[44px] flex items-center gap-2 disabled:opacity-50"
            disabled={saving || !selectedAgreementId || activeAgreements.length === 0}
          >
            {saving ? t('billing.attaching', 'Attaching...') : t('billing.attachToAgreement', 'Attach to Agreement')}
          </button>
        </div>
      }
    >
      <form id="attach-payment-form" onSubmit={handleSubmit} className="space-y-4">
        {errorMsg && (
          <div className="p-3 bg-rose-50 border border-rose-200 rounded-lg text-rose-700 text-xs flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0 text-rose-600" />
            <span>{errorMsg}</span>
          </div>
        )}

        {payment && (
          <div className="bg-slate-50 p-3 rounded-lg border border-slate-200 text-xs space-y-1">
            <div className="flex justify-between">
              <span className="text-slate-500">{t('billing.receiptNumber', 'Receipt #')}:</span>
              <span className="font-semibold text-slate-800">{payment.receiptNumber}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">{t('billing.paymentAmount', 'Amount')}:</span>
              <span className="font-semibold text-emerald-700">{formatBdt(payment.amountPaisa, { lang: i18n.language })}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">{t('billing.paymentDate', 'Date')}:</span>
              <span className="text-slate-700">{payment.paymentDate}</span>
            </div>
            <div className="pt-1 text-slate-600 italic">
              "{payment.purposeNote}"
            </div>
          </div>
        )}

        <div>
          <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
            {t('billing.selectAgreementToAttach', 'Select Target Fee Agreement')} *
          </label>
          <select
            value={selectedAgreementId}
            onChange={(e) => setSelectedAgreementId(e.target.value)}
            required
            disabled={activeAgreements.length === 0 || saving}
            className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 min-h-[44px]"
          >
            <option value="">{t('billing.selectAgreement', '-- Select Fee Agreement --')}</option>
            {activeAgreements.map((a) => (
              <option key={a.id} value={a.id}>
                {getCaseLabel(a.caseId)} | {t(`billing.feeTypes.${a.feeType}`, a.feeType)}: {formatBdt(a.agreedAmountPaisa, { lang: i18n.language })}
              </option>
            ))}
          </select>
          {activeAgreements.length === 0 && (
            <p className="text-xs text-amber-600 mt-1">
              {t('billing.noActiveAgreementsToAttach', 'No active fee agreements available for this client. Create a case agreement first.')}
            </p>
          )}
        </div>
      </form>
    </ResponsiveModal>
  );
};
