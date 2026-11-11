import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../foundation/AuthContext';
import { getRepositories } from '../../data/repositories';
import { CaseRecord, ClientRecord, FeeType } from '../../data/types';
import { FileText, AlertCircle, Lock } from 'lucide-react';
import { ResponsiveModal } from '../../components/responsive/ResponsiveModal';
import { takaToPaisa, formatBdt } from '../../utils/currency';
import { getDhakaDateString, toDateInputValue } from '../../utils/dateUtils';

interface CreateAgreementModalProps {
  isOpen: boolean;
  clientId?: string | null;
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
  const { t, i18n } = useTranslation();
  const { currentUser } = useAuth();
  const repos = getRepositories();

  const [clients, setClients] = useState<ClientRecord[]>([]);
  const [selectedClientId, setSelectedClientId] = useState<string>(clientId || '');
  const [cases, setCases] = useState<CaseRecord[]>([]);
  const [selectedCaseId, setSelectedCaseId] = useState<string>(caseId || '');
  const [feeType, setFeeType] = useState<FeeType>('fixed');
  const [takaAmount, setTakaAmount] = useState('');
  const [agreementDate, setAgreementDate] = useState(() => getDhakaDateString());
  const [notes, setNotes] = useState('');

  const [saving, setSaving] = useState(false);
  const [loadingClients, setLoadingClients] = useState(false);
  const [loadingCases, setLoadingCases] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen && currentUser) {
      setFeeType('fixed');
      setTakaAmount('');
      setAgreementDate(getDhakaDateString());
      setNotes('');
      setErrorMsg(null);
      setSelectedClientId(clientId || '');
      setSelectedCaseId(caseId || '');

      if (!clientId) {
        setLoadingClients(true);
        repos.client
          .list({ currentUser })
          .then((list) => setClients(list))
          .catch(() => setClients([]))
          .finally(() => setLoadingClients(false));
      }
    }
  }, [isOpen, clientId, caseId, currentUser]);

  useEffect(() => {
    if (isOpen && currentUser && selectedClientId) {
      setLoadingCases(true);
      repos.case
        .list({ currentUser }, { clientId: selectedClientId })
        .then((caseList) => {
          setCases(caseList);
          if (caseId) {
            setSelectedCaseId(caseId);
          } else if (caseList.length === 1 && !selectedCaseId) {
            setSelectedCaseId(caseList[0].id);
          }
        })
        .catch(() => setCases([]))
        .finally(() => setLoadingCases(false));
    } else if (isOpen && !selectedClientId) {
      setCases([]);
      if (!caseId) setSelectedCaseId('');
    }
  }, [isOpen, selectedClientId, caseId, currentUser]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentUser) return;

    if (!selectedClientId) {
      setErrorMsg(t('billing.errors.clientRequired', 'Please select a client'));
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
          clientId: selectedClientId,
          caseId: selectedCaseId || null,
          feeType,
          agreedAmountPaisa: paisa,
          agreementDate: toDateInputValue(agreementDate) || getDhakaDateString(),
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

  const isClientLocked = Boolean(clientId);
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
            disabled={saving || !selectedClientId}
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

        {!isClientLocked && (
          <div>
            <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
              {t('clients.client', 'Client')} *
            </label>
            <select
              value={selectedClientId}
              onChange={(e) => {
                setSelectedClientId(e.target.value);
                if (!isCaseLocked) setSelectedCaseId('');
              }}
              disabled={loadingClients}
              required
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 min-h-[44px]"
            >
              <option value="">{t('billing.selectClient', '-- Select Client --')}</option>
              {clients.map((cl) => (
                <option key={cl.id} value={cl.id}>
                  {cl.name} {cl.phone ? `(${cl.phone})` : ''}
                </option>
              ))}
            </select>
          </div>
        )}

        {/* Case Selector */}
        <div>
          <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1 flex items-center gap-1.5">
            <span>{t('cases.case', 'Case')}</span>
            {isCaseLocked && <Lock className="w-3 h-3 text-slate-400" />}
          </label>
          <select
            value={selectedCaseId}
            onChange={(e) => setSelectedCaseId(e.target.value)}
            disabled={isCaseLocked || loadingCases || !selectedClientId}
            className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 min-h-[44px] disabled:bg-slate-100 disabled:text-slate-500"
          >
            <option value="">{t('billing.generalClientLevel', '-- General / Client-level (No specific case) --')}</option>
            {cases.map((c) => (
              <option key={c.id} value={c.id}>
                {c.caseNumber} - {c.matterType || c.court} {c.fileSerial ? `(${c.fileSerial})` : ''}
              </option>
            ))}
          </select>
          {selectedClientId && cases.length === 0 && !loadingCases && (
            <p className="text-xs text-slate-500 mt-1">{t('billing.noCasesFoundClientLevelOk', 'No active cases linked yet — will be recorded as a client-level agreement.')}</p>
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
              placeholder={t('billing.amountInTaka', 'Amount in Taka')}
              required
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 min-h-[44px]"
            />
            {Number(takaAmount) > 0 && (
              <span className="text-xs text-indigo-700 font-semibold block mt-1">
                {formatBdt(takaToPaisa(Number(takaAmount)), { lang: i18n.language })}
              </span>
            )}
          </div>
        </div>

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
