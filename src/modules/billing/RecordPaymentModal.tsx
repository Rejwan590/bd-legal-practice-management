import React, { useState, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../foundation/AuthContext';
import { getRepositories } from '../../data/repositories';
import { CaseRecord, ClientRecord, FeeAgreement, HearingRecord, PaymentMethod } from '../../data/types';
import { CreditCard, AlertCircle, Lock } from 'lucide-react';
import { ResponsiveModal } from '../../components/responsive/ResponsiveModal';
import { takaToPaisa, formatBdt } from '../../utils/currency';
import { getDhakaDateString, toDateInputValue } from '../../utils/dateUtils';

interface RecordPaymentModalProps {
  isOpen: boolean;
  clientId?: string | null;
  caseId?: string | null;
  feeAgreementId?: string | null;
  onClose: () => void;
  onSuccess: () => void;
}

export const RecordPaymentModal: React.FC<RecordPaymentModalProps> = ({
  isOpen,
  clientId,
  caseId,
  feeAgreementId,
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
  const [agreements, setAgreements] = useState<FeeAgreement[]>([]);
  const [selectedAgreementId, setSelectedAgreementId] = useState<string>(feeAgreementId || '');
  const [hearings, setHearings] = useState<HearingRecord[]>([]);
  const [selectedHearingId, setSelectedHearingId] = useState<string>('');

  const [takaAmount, setTakaAmount] = useState('');
  const [paymentDate, setPaymentDate] = useState(() => getDhakaDateString());
  const [method, setMethod] = useState<PaymentMethod>('cash');
  const [reference, setReference] = useState('');
  const [purposeNote, setPurposeNote] = useState('');

  const [saving, setSaving] = useState(false);
  const [loadingClients, setLoadingClients] = useState(false);
  const [loadingCases, setLoadingCases] = useState(false);
  const [loadingAgreements, setLoadingAgreements] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Stable idempotency key per modal session so retries/double-clicks never create duplicate receipts
  const idempotencyKeyRef = useRef<string>('');

  useEffect(() => {
    if (isOpen && currentUser) {
      idempotencyKeyRef.current =
        typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
          ? crypto.randomUUID()
          : `pay-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
      setTakaAmount('');
      setPaymentDate(getDhakaDateString());
      setMethod('cash');
      setReference('');
      setPurposeNote('');
      setSelectedHearingId('');
      setErrorMsg(null);
      setSelectedClientId(clientId || '');
      setSelectedCaseId(caseId || '');
      setSelectedAgreementId(feeAgreementId || '');

      if (!clientId) {
        setLoadingClients(true);
        repos.client
          .list({ currentUser })
          .then((list) => setClients(list))
          .catch(() => setClients([]))
          .finally(() => setLoadingClients(false));
      }
    }
  }, [isOpen, clientId, caseId, feeAgreementId, currentUser]);

  // Load client's visible cases and active agreements when selectedClientId changes
  useEffect(() => {
    if (isOpen && currentUser && selectedClientId) {
      setLoadingCases(true);
      setLoadingAgreements(true);
      Promise.all([
        repos.case.list({ currentUser }, { clientId: selectedClientId }),
        repos.accounts.listAgreements({ currentUser }, { clientId: selectedClientId, status: 'active' }),
      ])
        .then(([caseList, agList]) => {
          setCases(caseList);
          const filteredAgreements = selectedCaseId
            ? agList.filter((a) => a.caseId === selectedCaseId || !a.caseId)
            : agList;
          setAgreements(filteredAgreements);
          if (feeAgreementId && filteredAgreements.some((a) => a.id === feeAgreementId)) {
            setSelectedAgreementId(feeAgreementId);
          } else if (filteredAgreements.length === 1) {
            setSelectedAgreementId(filteredAgreements[0].id);
          } else if (!filteredAgreements.some((a) => a.id === selectedAgreementId)) {
            setSelectedAgreementId('');
          }
        })
        .catch(() => {
          setCases([]);
          setAgreements([]);
        })
        .finally(() => {
          setLoadingCases(false);
          setLoadingAgreements(false);
        });
    } else if (isOpen && !selectedClientId) {
      setCases([]);
      setAgreements([]);
      if (!feeAgreementId) setSelectedAgreementId('');
    }
  }, [isOpen, selectedClientId, selectedCaseId, feeAgreementId, currentUser]);

  // Load hearings for selectedCaseId or selected agreement's case
  const selectedAgreement = agreements.find((a) => a.id === selectedAgreementId);
  const effectiveCaseId = selectedCaseId || selectedAgreement?.caseId || '';

  useEffect(() => {
    if (isOpen && currentUser && effectiveCaseId) {
      repos.hearing
        .list({ currentUser }, { caseId: effectiveCaseId })
        .then((hList) => setHearings(hList))
        .catch(() => setHearings([]));
    } else {
      setHearings([]);
      setSelectedHearingId('');
    }
  }, [isOpen, effectiveCaseId, currentUser]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentUser) return;

    if (!selectedClientId) {
      setErrorMsg(t('billing.errors.clientRequired', 'Please select a client'));
      return;
    }

    if (!selectedAgreementId) {
      setErrorMsg(t('billing.errors.agreementRequired', 'Every payment must reference an active fee agreement'));
      return;
    }

    const paisa = takaToPaisa(takaAmount);
    if (paisa <= 0) {
      setErrorMsg(t('billing.errors.positiveAmount', 'Amount must be greater than zero'));
      return;
    }

    if (!purposeNote.trim()) {
      setErrorMsg(t('billing.errors.purposeRequired', 'Purpose note is required'));
      return;
    }

    setSaving(true);
    setErrorMsg(null);

    try {
      await repos.accounts.recordPayment(
        { currentUser },
        {
          feeAgreementId: selectedAgreementId,
          clientId: selectedClientId,
          caseId: effectiveCaseId || null,
          hearingId: selectedHearingId || null,
          paymentDate: toDateInputValue(paymentDate) || getDhakaDateString(),
          amountPaisa: paisa,
          method,
          reference: reference.trim() || null,
          purposeNote: purposeNote.trim(),
          idempotencyKey: idempotencyKeyRef.current,
        }
      );
      onSuccess();
      onClose();
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : t('billing.errors.saveFailed', 'Failed to record payment'));
    } finally {
      setSaving(false);
    }
  };

  const isClientLocked = Boolean(clientId);
  const isCaseLocked = Boolean(caseId);
  const isAgreementLocked = Boolean(feeAgreementId);

  return (
    <ResponsiveModal
      isOpen={isOpen}
      onClose={onClose}
      title={t('billing.recordPayment', 'Record Payment')}
      subtitle={t('billing.recordPaymentSub', 'Receipt entry for client fees')}
      icon={CreditCard}
      maxWidth="lg"
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
            form="record-payment-form"
            className="px-5 py-2 text-sm font-medium text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg min-h-[44px] flex items-center gap-2 disabled:opacity-50"
            disabled={saving || !selectedAgreementId || agreements.length === 0}
          >
            {saving ? t('common.saving', 'Recording...') : t('billing.recordPayment', 'Record Payment')}
          </button>
        </div>
      }
    >
      <form id="record-payment-form" onSubmit={handleSubmit} className="space-y-4">
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
                if (!isAgreementLocked) setSelectedAgreementId('');
              }}
              disabled={loadingClients}
              required
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 min-h-[44px]"
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

        {/* Case Filter / Selector */}
        <div>
          <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1 flex items-center gap-1.5">
            <span>{t('cases.case', 'Case')}</span>
            {isCaseLocked && <Lock className="w-3 h-3 text-slate-400" />}
          </label>
          <select
            value={selectedCaseId}
            onChange={(e) => setSelectedCaseId(e.target.value)}
            disabled={isCaseLocked || loadingCases || !selectedClientId}
            className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 min-h-[44px] disabled:bg-slate-100 disabled:text-slate-500"
          >
            <option value="">{t('billing.allClientAgreements', '-- General / All Client Matters --')}</option>
            {cases.map((c) => (
              <option key={c.id} value={c.id}>
                {c.caseNumber} - {c.matterType || c.court} {c.fileSerial ? `(${c.fileSerial})` : ''}
              </option>
            ))}
          </select>
        </div>

        {/* Agreement Selector */}
        <div>
          <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1 flex items-center gap-1.5">
            <span>{t('billing.feeAgreement', 'Fee Agreement')} *</span>
            {isAgreementLocked && <Lock className="w-3 h-3 text-slate-400" />}
          </label>
          <select
            value={selectedAgreementId}
            onChange={(e) => setSelectedAgreementId(e.target.value)}
            disabled={isAgreementLocked || loadingAgreements || agreements.length === 0}
            required
            className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 min-h-[44px] disabled:bg-slate-100 disabled:text-slate-500"
          >
            <option value="">{t('billing.selectAgreement', '-- Select Fee Agreement --')}</option>
            {agreements.map((a) => (
              <option key={a.id} value={a.id}>
                {a.caseNumber ? `${a.caseNumber} · ` : `${t('billing.clientLevel', 'Client-level')} · `}
                {t(`billing.feeTypes.${a.feeType}`, a.feeType)} - {formatBdt(a.agreedAmountPaisa, { lang: i18n.language })} ({a.agreementDate})
              </option>
            ))}
          </select>
          {selectedAgreement && (
            <div className="mt-1.5 px-3 py-2 rounded-lg bg-slate-50 border border-slate-200 text-xs text-slate-700 flex flex-wrap gap-4">
              <span>{t('billing.totalAgreed', 'Agreed')}: <strong>{formatBdt(selectedAgreement.agreedAmountPaisa, { lang: i18n.language })}</strong></span>
              <span>{t('billing.totalPaid', 'Paid')}: <strong className="text-emerald-700">{formatBdt(selectedAgreement.paidPaisa ?? 0, { lang: i18n.language })}</strong></span>
              <span>
                {(selectedAgreement.creditPaisa ?? 0) > 0 ? t('billing.credit', 'Credit') : t('billing.outstanding', 'Outstanding')}:{' '}
                <strong className={(selectedAgreement.creditPaisa ?? 0) > 0 ? 'text-sky-700' : 'text-amber-700'}>
                  {formatBdt(
                    (selectedAgreement.creditPaisa ?? 0) > 0
                      ? selectedAgreement.creditPaisa ?? 0
                      : selectedAgreement.outstandingPaisa ?? Math.max(0, selectedAgreement.agreedAmountPaisa - (selectedAgreement.paidPaisa ?? 0)),
                    { lang: i18n.language }
                  )}
                </strong>
              </span>
            </div>
          )}
          {selectedClientId && agreements.length === 0 && !loadingAgreements && (
            <p className="text-xs text-amber-600 mt-1">
              {t('billing.noAgreementsForSelection', 'No active fee agreement exists for this client/case. Create a fee agreement first to track payments.')}
            </p>
          )}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
              {t('billing.amountBdt', 'Amount (৳ Taka)')} *
            </label>
            <input
              type="number"
              step="any"
              min="1"
              value={takaAmount}
              onChange={(e) => setTakaAmount(e.target.value)}
              placeholder={t('billing.amountInTaka', 'Amount in Taka')}
              required
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 min-h-[44px]"
            />
            {Number(takaAmount) > 0 && (
              <span className="text-xs text-emerald-700 font-semibold block mt-1">
                {formatBdt(takaToPaisa(Number(takaAmount)), { lang: i18n.language })}
              </span>
            )}
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
              {t('billing.paymentDate', 'Payment Date')} *
            </label>
            <input
              type="date"
              value={toDateInputValue(paymentDate)}
              onChange={(e) => setPaymentDate(e.target.value)}
              required
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 min-h-[44px]"
            />
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
              {t('billing.method', 'Payment Method')} *
            </label>
            <select
              value={method}
              onChange={(e) => setMethod(e.target.value as PaymentMethod)}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 min-h-[44px]"
            >
              <option value="cash">{t('billing.methods.cash', 'Cash')}</option>
              <option value="bank">{t('billing.methods.bank', 'Bank Transfer / Deposit')}</option>
              <option value="bkash">{t('billing.methods.bkash', 'bKash')}</option>
              <option value="nagad">{t('billing.methods.nagad', 'Nagad')}</option>
              <option value="cheque">{t('billing.methods.cheque', 'Cheque')}</option>
              <option value="other">{t('billing.methods.other', 'Other')}</option>
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
              {t('billing.reference', 'Reference / Cheque / Txn ID')}
            </label>
            <input
              type="text"
              value={reference}
              onChange={(e) => setReference(e.target.value)}
              placeholder="e.g. CQ-88231 or bKash TrxID"
              maxLength={100}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 min-h-[44px]"
            />
          </div>
        </div>

        {effectiveCaseId && hearings.length > 0 && (
          <div>
            <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
              {t('billing.linkedHearing', 'Link to Hearing (Optional)')}
            </label>
            <select
              value={selectedHearingId}
              onChange={(e) => setSelectedHearingId(e.target.value)}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 min-h-[44px]"
            >
              <option value="">{t('billing.noHearingLinked', '-- None / General Case Fee --')}</option>
              {hearings.map((h) => (
                <option key={h.id} value={h.id}>
                  {h.scheduledAt ? h.scheduledAt.slice(0, 10) : ''} - {h.fixedFor ? t(`hearings.fixedFor.${h.fixedFor}`, h.fixedFor) : t('hearings.hearing', 'Hearing')}
                </option>
              ))}
            </select>
          </div>
        )}

        <div>
          <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
            {t('billing.purposeNote', 'Purpose Note (Required on Receipt)')} *
          </label>
          <textarea
            value={purposeNote}
            onChange={(e) => setPurposeNote(e.target.value)}
            placeholder="e.g. Filing fee retainer installment / Evidence hearing argument fee"
            rows={3}
            maxLength={500}
            required
            className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
          />
          <p className="text-[11px] text-slate-400 mt-0.5 text-right">{purposeNote.length} / 500</p>
        </div>
      </form>
    </ResponsiveModal>
  );
};
