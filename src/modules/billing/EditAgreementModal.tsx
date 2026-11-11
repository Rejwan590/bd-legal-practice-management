import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../foundation/AuthContext';
import { getRepositories } from '../../data/repositories';
import { AgreementRecord, CaseRecord, FeeType } from '../../data/types';
import { Edit2, AlertCircle } from 'lucide-react';
import { ResponsiveModal } from '../../components/responsive/ResponsiveModal';
import { takaToPaisa, formatBdt } from '../../utils/currency';
import { toDateInputValue, getDhakaDateString } from '../../utils/dateUtils';

interface EditAgreementModalProps {
  isOpen: boolean;
  agreement: AgreementRecord | null;
  lockCase?: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export const EditAgreementModal: React.FC<EditAgreementModalProps> = ({
  isOpen,
  agreement,
  lockCase = false,
  onClose,
  onSuccess,
}) => {
  const { t, i18n } = useTranslation();
  const { currentUser } = useAuth();
  const repos = getRepositories();

  const [cases, setCases] = useState<CaseRecord[]>([]);
  const [selectedCaseId, setSelectedCaseId] = useState<string>('');
  const [feeType, setFeeType] = useState<FeeType>('fixed');
  const [takaAmount, setTakaAmount] = useState('');
  const [agreementDate, setAgreementDate] = useState('');
  const [notes, setNotes] = useState('');
  const [revisionReason, setRevisionReason] = useState('');

  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen && currentUser && agreement) {
      setSelectedCaseId(agreement.caseId || '');
      setFeeType(agreement.feeType);
      setTakaAmount(String(agreement.agreedAmountPaisa / 100));
      setAgreementDate(toDateInputValue(agreement.agreementDate) || getDhakaDateString());
      setNotes(agreement.notes || '');
      setRevisionReason('');
      setErrorMsg(null);

      repos.case
        .list({ currentUser }, { clientId: agreement.clientId })
        .then((list) => setCases(list))
        .catch(() => setCases([]));
    }
  }, [isOpen, agreement, currentUser]);

  if (!agreement) return null;

  const newPaisa = takaToPaisa(takaAmount);
  const amountChanged = newPaisa !== agreement.agreedAmountPaisa;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentUser) return;

    if (newPaisa <= 0) {
      setErrorMsg(t('billing.errors.positiveAmount', 'Amount must be greater than zero'));
      return;
    }

    if (amountChanged && !revisionReason.trim()) {
      setErrorMsg(t('billing.errors.reasonRequired', 'Reason for fee revision is required'));
      return;
    }

    setSaving(true);
    setErrorMsg(null);

    try {
      await repos.accounts.updateAgreement({ currentUser }, agreement.id, {
        caseId: lockCase ? agreement.caseId : selectedCaseId || null,
        feeType,
        agreedAmountPaisa: newPaisa,
        agreementDate: toDateInputValue(agreementDate) || agreement.agreementDate,
        notes: notes.trim() || null,
        ...(amountChanged ? { revisionReason: revisionReason.trim() } : {}),
      });
      onSuccess();
      onClose();
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : t('billing.errors.saveFailed', 'Failed to update agreement'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <ResponsiveModal
      isOpen={isOpen}
      onClose={onClose}
      title={t('billing.editAgreement', 'Edit Agreement')}
      subtitle={agreement.clientName ? `${agreement.clientName}${agreement.caseNumber ? ` · ${agreement.caseNumber}` : ''}` : undefined}
      icon={Edit2}
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
            form="edit-agreement-form"
            className="px-5 py-2 text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg min-h-[44px] disabled:opacity-50"
            disabled={saving}
          >
            {saving ? t('common.saving', 'Saving...') : t('common.saveChanges', 'Save Changes')}
          </button>
        </div>
      }
    >
      <form id="edit-agreement-form" onSubmit={handleSubmit} className="space-y-4">
        {errorMsg && (
          <div className="p-3 bg-rose-50 border border-rose-200 rounded-lg text-rose-700 text-xs flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0 text-rose-600" />
            <span>{errorMsg}</span>
          </div>
        )}

        {!lockCase && (
          <div>
            <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
              {t('cases.case', 'Case')}
            </label>
            <select
              value={selectedCaseId}
              onChange={(e) => setSelectedCaseId(e.target.value)}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 min-h-[44px]"
            >
              <option value="">{t('billing.generalClientLevel', '-- General / Client-level (No specific case) --')}</option>
              {cases.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.caseNumber} - {c.matterType || c.court}
                </option>
              ))}
            </select>
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
              {t('billing.feeType', 'Fee Type')} *
            </label>
            <select
              value={feeType}
              onChange={(e) => setFeeType(e.target.value as FeeType)}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 min-h-[44px]"
            >
              <option value="fixed">{t('billing.feeTypes.fixed', 'Fixed Fee')}</option>
              <option value="installment">{t('billing.feeTypes.installment', 'Installment Fee')}</option>
              <option value="per_hearing">{t('billing.feeTypes.per_hearing', 'Per Hearing Appearance')}</option>
              <option value="retainer">{t('billing.feeTypes.retainer', 'Retainer')}</option>
              <option value="hourly">{t('billing.feeTypes.hourly', 'Hourly Rate')}</option>
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
              {t('billing.agreedAmountBdt', 'Agreed Amount (৳ Taka)')} *
            </label>
            <input
              type="number"
              step="any"
              min="1"
              value={takaAmount}
              onChange={(e) => setTakaAmount(e.target.value)}
              required
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 min-h-[44px]"
            />
            {newPaisa > 0 && (
              <span className="text-xs text-indigo-700 font-semibold block mt-1">
                {formatBdt(newPaisa, { lang: i18n.language })}
              </span>
            )}
          </div>
        </div>

        {amountChanged && (
          <div>
            <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
              {t('billing.revisionReason', 'Reason for Revision (Logged)')} *
            </label>
            <textarea
              value={revisionReason}
              onChange={(e) => setRevisionReason(e.target.value)}
              placeholder="e.g. Client requested additional appeal representation"
              rows={2}
              maxLength={500}
              required
              className="w-full px-3 py-2 border border-amber-300 rounded-lg text-sm focus:ring-2 focus:ring-amber-500 focus:border-amber-500"
            />
          </div>
        )}

        <div>
          <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
            {t('billing.agreementDate', 'Agreement Date')} *
          </label>
          <input
            type="date"
            value={toDateInputValue(agreementDate)}
            onChange={(e) => setAgreementDate(e.target.value)}
            required
            className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 min-h-[44px]"
          />
        </div>

        <div>
          <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
            {t('billing.notes', 'Notes / Scope of Representation')}
          </label>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={3}
            maxLength={2000}
            className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
          />
        </div>
      </form>
    </ResponsiveModal>
  );
};
