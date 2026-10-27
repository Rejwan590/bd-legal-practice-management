import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../foundation/AuthContext';
import { getRepositories } from '../../data/repositories';
import { CaseRecord, FeeType } from '../../data/types';
import { FileText, AlertCircle, Lock } from 'lucide-react';
import { ResponsiveModal } from '../../components/responsive/ResponsiveModal';
import { takaToPaisa } from '../../utils/currency';

interface CreateAgreementModalProps {
  isOpen: boolean;
  clientId: string;
  caseId?: string | null;
  onClose: () => void;
  onSuccess: () => void;
}

export const CreateAgreementModal: React.FC<CreateAgreementModalProps> = ({
  isOpen,
  clientId,
  caseId,
  onClose,
  onSuccess,
}) => {
  const { t } = useTranslation();
  const { currentUser } = useAuth();
  const repos = getRepositories();

  const [cases, setCases] = useState<CaseRecord[]>([]);
  const [selectedCaseId, setSelectedCaseId] = useState<string>(caseId || '');
  const [feeType, setFeeType] = useState<FeeType>('fixed');
  const [takaAmount, setTakaAmount] = useState('');
  const [agreementDate, setAgreementDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [notes, setNotes] = useState('');

  const [saving, setSaving] = useState(false);
  const [loadingCases, setLoadingCases] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen && currentUser && clientId) {
      setFeeType('fixed');
      setTakaAmount('');
      setAgreementDate(new Date().toISOString().slice(0, 10));
      setNotes('');
      setErrorMsg(null);

      const initialCaseId = caseId || '';
      setSelectedCaseId(initialCaseId);

      setLoadingCases(true);
      repos.case.list({ currentUser }, { clientId })
        .then((caseList) => {
          setCases(caseList);
          if (!initialCaseId && caseList.length === 1) {
            setSelectedCaseId(caseList[0].id);
          }
        })
        .catch(() => setCases([]))
        .finally(() => setLoadingCases(false));
    }
  }, [isOpen, clientId, caseId, currentUser]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentUser) return;

    if (!selectedCaseId) {
      setErrorMsg(t('billing.errors.caseRequired', 'Please select a case for this fee agreement'));
      return;
    }

    const paisa = takaToPaisa(takaAmount);
    if (paisa <= 0) {
      setErrorMsg(t('billing.errors.positiveAmount', 'Amount must be greater than zero'));
      return;
    }

    setSaving(true);
    setErrorMsg(null);

    try {
      await repos.accounts.createAgreement(
        { currentUser },
        {
          clientId,
          caseId: selectedCaseId,
          feeType,
          agreedAmountPaisa: paisa,
          agreementDate,
          notes: notes.trim() || null,
        }
      );
      onSuccess();
      onClose();
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : t('billing.errors.saveFailed', 'Failed to create agreement'));
    } finally {
      setSaving(false);
    }
  };

  const isCaseLocked = Boolean(caseId);

  return (
    <ResponsiveModal
      isOpen={isOpen}
      onClose={onClose}
      title={t('billing.newAgreement', 'Fee Agreement')}
      subtitle={t('billing.newAgreementSub', 'Agreed legal fees contract with client')}
      icon={FileText}
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
            form="create-agreement-form"
            className="px-5 py-2 text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg min-h-[44px] flex items-center gap-2 disabled:opacity-50"
            disabled={saving || !selectedCaseId}
          >
            {saving ? t('common.saving', 'Saving...') : t('billing.createAgreement', 'Create Agreement')}
          </button>
        </div>
      }
    >
      <form id="create-agreement-form" onSubmit={handleSubmit} className="space-y-4">
        {errorMsg && (
          <div className="p-3 bg-rose-50 border border-rose-200 rounded-lg text-rose-700 text-xs flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0 text-rose-600" />
            <span>{errorMsg}</span>
          </div>
        )}

        {/* Case Selector */}
        <div>
          <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1 flex items-center gap-1.5">
            <span>{t('cases.case', 'Case')} *</span>
            {isCaseLocked && <Lock className="w-3 h-3 text-slate-400" />}
          </label>
          <select
            value={selectedCaseId}
            onChange={(e) => setSelectedCaseId(e.target.value)}
            disabled={isCaseLocked || loadingCases}
            required
            className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 min-h-[44px] disabled:bg-slate-100 disabled:text-slate-500"
          >
            <option value="">{t('billing.selectCase', '-- Select Case --')}</option>
            {cases.map((c) => (
              <option key={c.id} value={c.id}>
                {c.caseNumber} - {c.matterType || c.court} {c.fileSerial ? `(${c.fileSerial})` : ''}
              </option>
            ))}
          </select>
          {cases.length === 0 && !loadingCases && (
            <p className="text-xs text-amber-600 mt-1">{t('billing.noCasesFound', 'No active visible cases found for this client.')}</p>
          )}
        </div>

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
              placeholder="e.g. 150000"
              required
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 min-h-[44px]"
            />
          </div>
        </div>

        <div>
          <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
            {t('billing.agreementDate', 'Agreement Date')} *
          </label>
          <input
            type="date"
            value={agreementDate}
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
            placeholder="e.g. Covers trial up to argument and judgment; does not cover appeal."
            rows={3}
            maxLength={2000}
            className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
          />
        </div>
      </form>
    </ResponsiveModal>
  );
};
