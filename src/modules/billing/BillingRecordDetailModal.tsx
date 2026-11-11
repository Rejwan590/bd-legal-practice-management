import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../foundation/AuthContext';
import { getRepositories } from '../../data/repositories';
import { AgreementRecord, ExpenseRecord, FeeAgreementChange, PaymentRecord } from '../../data/types';
import { FileText, CreditCard, Receipt, History, Edit2, Ban, CheckCircle, Link } from 'lucide-react';
import { ResponsiveModal } from '../../components/responsive/ResponsiveModal';
import { formatBdt } from '../../utils/currency';
import { formatDhakaDate } from '../../utils/dateUtils';

export type SelectedBillingRecord =
  | { kind: 'agreement'; record: AgreementRecord }
  | { kind: 'payment'; record: PaymentRecord }
  | { kind: 'expense'; record: ExpenseRecord };

interface BillingRecordDetailModalProps {
  isOpen: boolean;
  item: SelectedBillingRecord | null;
  canManageBilling: boolean;
  canManageExpenses: boolean;
  isReadOnly: boolean;
  onClose: () => void;
  onEditAgreement?: (agreement: AgreementRecord) => void;
  onReviseAgreement?: (agreement: AgreementRecord) => void;
  onRecordPaymentForAgreement?: (agreement: AgreementRecord) => void;
  onCloseAgreement?: (agreement: AgreementRecord) => void;
  onVoidAgreement?: (agreement: AgreementRecord) => void;
  onAttachPayment?: (payment: PaymentRecord) => void;
  onVoidPayment?: (payment: PaymentRecord) => void;
  onEditExpense?: (expense: ExpenseRecord) => void;
  onVoidExpense?: (expense: ExpenseRecord) => void;
}

export const BillingRecordDetailModal: React.FC<BillingRecordDetailModalProps> = ({
  isOpen,
  item,
  canManageBilling,
  canManageExpenses,
  isReadOnly,
  onClose,
  onEditAgreement,
  onReviseAgreement,
  onRecordPaymentForAgreement,
  onCloseAgreement,
  onVoidAgreement,
  onAttachPayment,
  onVoidPayment,
  onEditExpense,
  onVoidExpense,
}) => {
  const { t, i18n } = useTranslation();
  const { currentUser } = useAuth();
  const repos = getRepositories();

  const [changes, setChanges] = useState<FeeAgreementChange[]>([]);
  const [loadingChanges, setLoadingChanges] = useState(false);

  useEffect(() => {
    if (isOpen && item?.kind === 'agreement' && currentUser) {
      setLoadingChanges(true);
      repos.accounts
        .listAgreementChanges({ currentUser }, item.record.id)
        .then((list) => setChanges(list))
        .catch(() => setChanges([]))
        .finally(() => setLoadingChanges(false));
    } else {
      setChanges([]);
    }
  }, [isOpen, item, currentUser]);

  if (!item) return null;

  const icon =
    item.kind === 'agreement' ? FileText : item.kind === 'payment' ? CreditCard : Receipt;

  const title =
    item.kind === 'agreement'
      ? t('billing.agreementDetails', 'Agreement Details')
      : item.kind === 'payment'
        ? t('billing.paymentDetails', 'Payment Receipt Details')
        : t('billing.expenseDetails', 'Expense Details');

  const subtitle =
    item.record.clientName
      ? `${item.record.clientName}${item.record.caseNumber ? ` · ${item.record.caseNumber}` : ''}`
      : item.record.caseNumber || undefined;

  const renderFooter = () => (
    <div className="flex flex-wrap items-center justify-between gap-2 w-full">
      <div className="flex flex-wrap items-center gap-2">
        {!isReadOnly && item.kind === 'agreement' && item.record.status === 'active' && canManageBilling && (
          <>
            {onRecordPaymentForAgreement && (
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onRecordPaymentForAgreement(item.record);
                }}
                className="px-3 py-2 text-xs font-medium bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 min-h-[44px] inline-flex items-center gap-1.5"
              >
                <CreditCard className="w-3.5 h-3.5" />
                {t('billing.recordPayment', 'Record Payment')}
              </button>
            )}
            {onEditAgreement && (
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onEditAgreement(item.record);
                }}
                className="px-3 py-2 text-xs font-medium bg-indigo-50 text-indigo-700 rounded-lg hover:bg-indigo-100 min-h-[44px] inline-flex items-center gap-1.5"
              >
                <Edit2 className="w-3.5 h-3.5" />
                {t('common.edit', 'Edit')}
              </button>
            )}
            {onReviseAgreement && (
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onReviseAgreement(item.record);
                }}
                className="px-3 py-2 text-xs font-medium bg-slate-100 text-slate-700 rounded-lg hover:bg-slate-200 min-h-[44px] inline-flex items-center gap-1.5"
              >
                <History className="w-3.5 h-3.5" />
                {t('billing.revise', 'Revise Amount')}
              </button>
            )}
            {onCloseAgreement && (
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onCloseAgreement(item.record);
                }}
                className="px-3 py-2 text-xs font-medium bg-slate-100 text-slate-700 rounded-lg hover:bg-slate-200 min-h-[44px] inline-flex items-center gap-1.5"
              >
                <CheckCircle className="w-3.5 h-3.5" />
                {t('billing.closeAgreement', 'Close')}
              </button>
            )}
            {onVoidAgreement && (
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onVoidAgreement(item.record);
                }}
                className="px-3 py-2 text-xs font-medium bg-rose-50 text-rose-700 rounded-lg hover:bg-rose-100 min-h-[44px] inline-flex items-center gap-1.5"
              >
                <Ban className="w-3.5 h-3.5" />
                {t('billing.void', 'Void')}
              </button>
            )}
          </>
        )}

        {!isReadOnly && item.kind === 'payment' && item.record.status === 'posted' && canManageBilling && (
          <>
            {(!item.record.feeAgreementId || item.record.legacyUnassigned) && onAttachPayment && (
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onAttachPayment(item.record);
                }}
                className="px-3 py-2 text-xs font-medium bg-amber-50 text-amber-800 rounded-lg hover:bg-amber-100 min-h-[44px] inline-flex items-center gap-1.5"
              >
                <Link className="w-3.5 h-3.5" />
                {t('billing.attachToAgreement', 'Attach to Agreement')}
              </button>
            )}
            {onVoidPayment && (
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onVoidPayment(item.record);
                }}
                className="px-3 py-2 text-xs font-medium bg-rose-50 text-rose-700 rounded-lg hover:bg-rose-100 min-h-[44px] inline-flex items-center gap-1.5"
              >
                <Ban className="w-3.5 h-3.5" />
                {t('billing.voidPayment', 'Void Payment')}
              </button>
            )}
          </>
        )}

        {!isReadOnly && item.kind === 'expense' && item.record.status === 'posted' && canManageExpenses && (
          <>
            {onEditExpense && (
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onEditExpense(item.record);
                }}
                className="px-3 py-2 text-xs font-medium bg-indigo-50 text-indigo-700 rounded-lg hover:bg-indigo-100 min-h-[44px] inline-flex items-center gap-1.5"
              >
                <Edit2 className="w-3.5 h-3.5" />
                {t('common.edit', 'Edit')}
              </button>
            )}
            {onVoidExpense && (
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onVoidExpense(item.record);
                }}
                className="px-3 py-2 text-xs font-medium bg-rose-50 text-rose-700 rounded-lg hover:bg-rose-100 min-h-[44px] inline-flex items-center gap-1.5"
              >
                <Ban className="w-3.5 h-3.5" />
                {t('billing.voidExpense', 'Void Expense')}
              </button>
            )}
          </>
        )}
      </div>

      <button
        type="button"
        onClick={onClose}
        className="px-4 py-2 text-sm font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg min-h-[44px]"
      >
        {t('common.close', 'Close')}
      </button>
    </div>
  );

  return (
    <ResponsiveModal
      isOpen={isOpen}
      onClose={onClose}
      title={title}
      subtitle={subtitle}
      icon={icon}
      maxWidth="lg"
      footer={renderFooter()}
    >
      <div className="space-y-4 text-sm">
        {/* Shared Client & Case Summary */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-3.5 rounded-xl bg-slate-50 border border-slate-200">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
              {t('clients.client', 'Client')}
            </p>
            <p className="font-semibold text-slate-900 mt-0.5">
              {i18n.language === 'bn' && item.record.clientNameBn
                ? item.record.clientNameBn
                : item.record.clientName || item.record.clientId || '-'}
            </p>
          </div>
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
              {t('cases.case', 'Case')}
            </p>
            <p className="font-semibold text-slate-900 mt-0.5">
              {item.record.caseNumber
                ? `${item.record.caseNumber}${item.record.caseTitle ? ` — ${item.record.caseTitle}` : ''}`
                : t('billing.clientLevel', 'Client-level / General')}
            </p>
          </div>
        </div>

        {item.kind === 'agreement' && (
          <>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="p-3 rounded-xl border border-slate-200 bg-white">
                <p className="text-[11px] text-slate-500">{t('billing.totalAgreed', 'Agreed')}</p>
                <p className="text-base font-bold text-slate-900 mt-0.5">
                  {formatBdt(item.record.agreedAmountPaisa, { lang: i18n.language })}
                </p>
              </div>
              <div className="p-3 rounded-xl border border-slate-200 bg-white">
                <p className="text-[11px] text-slate-500">{t('billing.totalPaid', 'Paid')}</p>
                <p className="text-base font-bold text-emerald-700 mt-0.5">
                  {formatBdt(item.record.paidPaisa ?? 0, { lang: i18n.language })}
                </p>
              </div>
              <div className="p-3 rounded-xl border border-slate-200 bg-white">
                <p className="text-[11px] text-slate-500">
                  {(item.record.creditPaisa ?? 0) > 0 ? t('billing.credit', 'Credit') : t('billing.outstanding', 'Outstanding')}
                </p>
                <p className={`text-base font-bold mt-0.5 ${(item.record.creditPaisa ?? 0) > 0 ? 'text-sky-700' : 'text-amber-700'}`}>
                  {formatBdt(
                    (item.record.creditPaisa ?? 0) > 0
                      ? item.record.creditPaisa ?? 0
                      : item.record.outstandingPaisa ?? Math.max(0, item.record.agreedAmountPaisa - (item.record.paidPaisa ?? 0)),
                    { lang: i18n.language }
                  )}
                </p>
              </div>
              <div className="p-3 rounded-xl border border-slate-200 bg-white">
                <p className="text-[11px] text-slate-500">{t('common.status', 'Status')}</p>
                <p className="text-sm font-bold text-slate-800 mt-1 uppercase">
                  {t(`billing.statusValues.${item.record.status}`, item.record.status)}
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
              <div>
                <span className="text-slate-500">{t('billing.feeType', 'Fee Type')}:</span>{' '}
                <span className="font-semibold text-slate-800">
                  {t(`billing.feeTypes.${item.record.feeType}`, item.record.feeType)}
                </span>
              </div>
              <div>
                <span className="text-slate-500">{t('billing.agreementDate', 'Agreement Date')}:</span>{' '}
                <span className="font-semibold text-slate-800">
                  {formatDhakaDate(item.record.agreementDate, i18n.language === 'bn' ? 'bn' : 'en')}
                </span>
              </div>
            </div>

            {item.record.notes && (
              <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-700">
                <p className="font-semibold text-slate-500 uppercase text-[10px] mb-1">{t('billing.notes', 'Notes')}</p>
                <p className="whitespace-pre-wrap">{item.record.notes}</p>
              </div>
            )}

            <div>
              <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-2 flex items-center gap-1.5">
                <History className="w-3.5 h-3.5" />
                {t('billing.revisionHistory', 'Revision History')}
              </h4>
              {loadingChanges ? (
                <p className="text-xs text-slate-500">{t('common.loading', 'Loading...')}</p>
              ) : changes.length === 0 ? (
                <p className="text-xs text-slate-500 italic">{t('billing.noRevisions', 'No fee revisions recorded.')}</p>
              ) : (
                <div className="space-y-2">
                  {changes.map((chg) => (
                    <div key={chg.id} className="p-2.5 rounded-lg border border-slate-200 bg-white text-xs">
                      <div className="flex items-center justify-between gap-2 font-semibold text-slate-800">
                        <span>
                          {formatBdt(chg.oldAmountPaisa, { lang: i18n.language })} → {formatBdt(chg.newAmountPaisa, { lang: i18n.language })}
                        </span>
                        <span className="text-slate-500 font-normal">
                          {formatDhakaDate(chg.createdAt.slice(0, 10), i18n.language === 'bn' ? 'bn' : 'en')}
                        </span>
                      </div>
                      <p className="text-slate-600 mt-1">{chg.reason}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </>
        )}

        {item.kind === 'payment' && (
          <div className="space-y-3">
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              <div className="p-3 rounded-xl border border-slate-200 bg-white">
                <p className="text-[11px] text-slate-500">{t('billing.receiptNo', 'Receipt No')}</p>
                <p className="font-mono font-bold text-slate-900 mt-0.5">{item.record.receiptNumber}</p>
              </div>
              <div className="p-3 rounded-xl border border-slate-200 bg-white">
                <p className="text-[11px] text-slate-500">{t('billing.amount', 'Amount')}</p>
                <p className="text-base font-bold text-emerald-700 mt-0.5">
                  {formatBdt(item.record.amountPaisa, { lang: i18n.language })}
                </p>
              </div>
              <div className="p-3 rounded-xl border border-slate-200 bg-white">
                <p className="text-[11px] text-slate-500">{t('common.status', 'Status')}</p>
                <p className="font-bold text-slate-800 mt-0.5 uppercase">
                  {t(`billing.statusValues.${item.record.status}`, item.record.status)}
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs p-3 rounded-xl border border-slate-200 bg-white">
              <div>
                <span className="text-slate-500">{t('billing.paymentDate', 'Payment Date')}:</span>{' '}
                <span className="font-semibold text-slate-800">{formatDhakaDate(item.record.paymentDate, i18n.language === 'bn' ? 'bn' : 'en')}</span>
              </div>
              <div>
                <span className="text-slate-500">{t('billing.method', 'Payment Method')}:</span>{' '}
                <span className="font-semibold text-slate-800">{t(`billing.methods.${item.record.method}`, item.record.method)}</span>
              </div>
              <div>
                <span className="text-slate-500">{t('billing.reference', 'Reference')}:</span>{' '}
                <span className="font-semibold text-slate-800">{item.record.reference || '-'}</span>
              </div>
              <div>
                <span className="text-slate-500">{t('billing.feeAgreement', 'Fee Agreement')}:</span>{' '}
                <span className="font-semibold text-slate-800">
                  {item.record.feeAgreementId
                    ? `${item.record.agreementFeeType ? t(`billing.feeTypes.${item.record.agreementFeeType}`, item.record.agreementFeeType) : t('billing.linked', 'Linked')}${item.record.agreementAmountPaisa ? ` (${formatBdt(item.record.agreementAmountPaisa, { lang: i18n.language })})` : ''}`
                    : t('billing.unassignedLegacy', 'Unassigned')}
                </span>
              </div>
            </div>

            <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-700">
              <p className="font-semibold text-slate-500 uppercase text-[10px] mb-1">{t('billing.purposeNote', 'Purpose Note')}</p>
              <p className="whitespace-pre-wrap">{item.record.purposeNote}</p>
            </div>

            {item.record.status === 'void' && item.record.voidReason && (
              <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-xs text-rose-800">
                <p className="font-semibold uppercase text-[10px] mb-1">{t('billing.voidReason', 'Void Reason')}</p>
                <p>{item.record.voidReason}</p>
              </div>
            )}
          </div>
        )}

        {item.kind === 'expense' && (
          <div className="space-y-3">
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              <div className="p-3 rounded-xl border border-slate-200 bg-white">
                <p className="text-[11px] text-slate-500">{t('billing.expenseCategory', 'Category')}</p>
                <p className="font-semibold text-slate-900 mt-0.5">
                  {t(`billing.categories.${item.record.categoryName || ''}`, item.record.categoryName || '-')}
                </p>
              </div>
              <div className="p-3 rounded-xl border border-slate-200 bg-white">
                <p className="text-[11px] text-slate-500">{t('billing.amount', 'Amount')}</p>
                <p className="text-base font-bold text-slate-900 mt-0.5">
                  {formatBdt(item.record.amountPaisa, { lang: i18n.language })}
                </p>
              </div>
              <div className="p-3 rounded-xl border border-slate-200 bg-white">
                <p className="text-[11px] text-slate-500">{t('common.status', 'Status')}</p>
                <p className="font-bold text-slate-800 mt-0.5 uppercase">
                  {t(`billing.statusValues.${item.record.status}`, item.record.status)}
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs p-3 rounded-xl border border-slate-200 bg-white">
              <div>
                <span className="text-slate-500">{t('billing.expenseDate', 'Expense Date')}:</span>{' '}
                <span className="font-semibold text-slate-800">{formatDhakaDate(item.record.expenseDate, i18n.language === 'bn' ? 'bn' : 'en')}</span>
              </div>
              <div>
                <span className="text-slate-500">{t('billing.reimbursable', 'Reimbursable')}:</span>{' '}
                <span className="font-semibold text-slate-800">
                  {item.record.reimbursable ? t('common.yes', 'Yes') : t('common.no', 'No')}
                </span>
              </div>
            </div>

            <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-700">
              <p className="font-semibold text-slate-500 uppercase text-[10px] mb-1">{t('billing.description', 'Description')}</p>
              <p className="whitespace-pre-wrap">{item.record.description}</p>
            </div>

            {item.record.status === 'void' && item.record.voidReason && (
              <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-xs text-rose-800">
                <p className="font-semibold uppercase text-[10px] mb-1">{t('billing.voidReason', 'Void Reason')}</p>
                <p>{item.record.voidReason}</p>
              </div>
            )}
          </div>
        )}
      </div>
    </ResponsiveModal>
  );
};
