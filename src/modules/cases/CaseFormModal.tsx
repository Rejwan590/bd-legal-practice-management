import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../foundation/AuthContext';
import { getRepositories } from '../../data/repositories';
import { CaseRecord, ClientRecord, CourtRole, UserRecord } from '../../data/types';
import { isLawyerOrOwner } from '../../rolePresets';
import { ResponsiveModal } from '../../components/responsive/ResponsiveModal';
import {
  X,
  Briefcase,
  Save,
  AlertTriangle,
  AlertCircle,
  Lock,
  Building,
} from 'lucide-react';

interface CaseFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (data: Omit<CaseRecord, 'id' | 'firmId' | 'createdAt' | 'updatedAt' | 'deletedAt' | 'createdBy' | 'updatedBy' | 'nextHearingAt'>) => Promise<void>;
  initialData?: CaseRecord | null;
  defaultClientId?: string;
  lockClientId?: boolean;
}

const COMMON_COURTS = [
  'Supreme Court of Bangladesh (High Court Division)',
  'Supreme Court of Bangladesh (Appellate Division)',
  'Dhaka District & Sessions Judge Court',
  '1st Joint District Judge Court, Dhaka',
  '2nd Joint District Judge Court, Dhaka',
  'Senior Assistant Judge Court, Dhaka Sadar',
  'Metropolitan Sessions Judge Court, Dhaka',
  'Administrative Tribunal, Dhaka',
  'Labour Court, Dhaka',
];

const COMMON_MATTERS = [
  'Civil / Land Title Partition Suit',
  'Civil Revision (Section 115 CPC)',
  'First Appeal / Civil Appeal',
  'Writ Petition (Article 102)',
  'Company Matter / Winding Up',
  'Commercial Recovery & LC Arbitration',
  'Temporary Injunction (Order 39)',
  'Criminal Revision / Bail Application',
  'Negotiable Instruments Act (Section 138)',
];

export const CaseFormModal: React.FC<CaseFormModalProps> = ({
  isOpen,
  onClose,
  onSave,
  initialData,
  defaultClientId,
  lockClientId,
}) => {
  const { t } = useTranslation();
  const { currentUser, can } = useAuth();
  const repos = getRepositories();

  const [clients, setClients] = useState<ClientRecord[]>([]);
  const [activeLawyers, setActiveLawyers] = useState<UserRecord[]>([]);
  const [clientId, setClientId] = useState('');
  const [responsibleLawyerId, setResponsibleLawyerId] = useState<string>('');
  const [fileSerial, setFileSerial] = useState('');
  const [caseNumber, setCaseNumber] = useState('');
  const [court, setCourt] = useState(COMMON_COURTS[0]);
  const [customCourt, setCustomCourt] = useState('');
  const [matterType, setMatterType] = useState(COMMON_MATTERS[0]);
  const [customMatter, setCustomMatter] = useState('');
  const [description, setDescription] = useState('');
  const [plaintiff, setPlaintiff] = useState('');
  const [defendant, setDefendant] = useState('');
  const [ourRole, setOurRole] = useState<CourtRole>('Plaintiff');
  const [plaintiffLawyer, setPlaintiffLawyer] = useState('');
  const [defendantLawyer, setDefendantLawyer] = useState('');
  const [status, setStatus] = useState<'ongoing' | 'closed'>('ongoing');
  const [restricted, setRestricted] = useState(false);

  const [isDuplicate, setIsDuplicate] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const canRestricted = can('restricted.view');

  // Load clients list and active lawyers for selector dropdowns
  useEffect(() => {
    if (isOpen) {
      repos.client
        .list({ currentUser })
        .then((data) => {
          setClients(data);
          if (!initialData && data.length > 0) {
            setClientId(defaultClientId || data[0].id);
          }
        })
        .catch(console.error);

      repos.user
        .list({ currentUser })
        .then((usersData) => {
          const lawyers = usersData.filter(
            (u) => (u.status ?? 'active') === 'active' && isLawyerOrOwner(u)
          );
          setActiveLawyers(lawyers);
          if (!initialData) {
            if (isLawyerOrOwner(currentUser)) {
              setResponsibleLawyerId(currentUser.id);
            } else if (currentUser.reportsToUserId) {
              setResponsibleLawyerId(currentUser.reportsToUserId);
            } else if (lawyers.length > 0) {
              setResponsibleLawyerId(lawyers[0].id);
            }
          }
        })
        .catch(console.error);
    }
  }, [isOpen, currentUser, defaultClientId]);

  useEffect(() => {
    if (initialData) {
      setClientId(initialData.clientId);
      setResponsibleLawyerId(initialData.responsibleLawyerId || '');
      setFileSerial(initialData.fileSerial);
      setCaseNumber(initialData.caseNumber);

      if (COMMON_COURTS.includes(initialData.court)) {
        setCourt(initialData.court);
        setCustomCourt('');
      } else {
        setCourt('CUSTOM');
        setCustomCourt(initialData.court);
      }

      if (COMMON_MATTERS.includes(initialData.matterType)) {
        setMatterType(initialData.matterType);
        setCustomMatter('');
      } else {
        setMatterType('CUSTOM');
        setCustomMatter(initialData.matterType);
      }

      setDescription(initialData.description);
      setPlaintiff(initialData.plaintiff);
      setDefendant(initialData.defendant);
      setOurRole(initialData.ourRole);
      setPlaintiffLawyer(initialData.plaintiffLawyer);
      setDefendantLawyer(initialData.defendantLawyer);
      setStatus(initialData.status);
      setRestricted(initialData.restricted);
    } else {
      const year = new Date().getFullYear();
      const randomSeq = Math.floor(1000 + Math.random() * 9000);
      setFileSerial(`F-${year}-${randomSeq}`);
      setCaseNumber('');
      setCourt(COMMON_COURTS[0]);
      setCustomCourt('');
      setMatterType(COMMON_MATTERS[0]);
      setCustomMatter('');
      setDescription('');
      setPlaintiff('');
      setDefendant('');
      setOurRole('Plaintiff');
      setPlaintiffLawyer(currentUser.name);
      setDefendantLawyer('');
      setStatus('ongoing');
      setRestricted(false);
      if (defaultClientId) {
        setClientId(defaultClientId);
      }
    }
    setIsDuplicate(false);
    setErrorMsg(null);
  }, [initialData, isOpen, currentUser, defaultClientId]);

  // Check duplicate case number in same court
  useEffect(() => {
    const finalCourt = court === 'CUSTOM' ? customCourt : court;
    if (caseNumber.trim().length > 3 && finalCourt.trim().length > 3) {
      const timer = setTimeout(async () => {
        try {
          const dup = await repos.case.checkDuplicate(
            { currentUser },
            caseNumber,
            finalCourt,
            initialData?.id
          );
          setIsDuplicate(dup);
        } catch (e) {
          console.error(e);
        }
      }, 300);
      return () => clearTimeout(timer);
    } else {
      setIsDuplicate(false);
    }
  }, [caseNumber, court, customCourt, initialData, currentUser]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!clientId) {
      setErrorMsg(t('cases.validationClientRequired'));
      return;
    }
    if (!caseNumber.trim()) {
      setErrorMsg(t('cases.validationCaseNumberRequired'));
      return;
    }

    const finalCourt = (court === 'CUSTOM' ? customCourt : court).trim();
    if (!finalCourt) {
      setErrorMsg(t('cases.validationCourtRequired'));
      return;
    }

    const finalMatter = (matterType === 'CUSTOM' ? customMatter : matterType).trim();
    if (!finalMatter) {
      setErrorMsg(t('cases.validationMatterRequired'));
      return;
    }

    setSubmitting(true);
    setErrorMsg(null);

    try {
      await onSave({
        clientId,
        responsibleLawyerId: responsibleLawyerId || null,
        fileSerial: fileSerial.trim(),
        caseNumber: caseNumber.trim(),
        court: finalCourt,
        matterType: finalMatter,
        description: description.trim(),
        plaintiff: plaintiff.trim(),
        defendant: defendant.trim(),
        ourRole,
        plaintiffLawyer: plaintiffLawyer.trim(),
        defendantLawyer: defendantLawyer.trim(),
        status,
        restricted,
      });
      onClose();
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : 'Failed to save case');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <ResponsiveModal
      isOpen={isOpen}
      onClose={onClose}
      title={initialData ? t('cases.editCase') : t('cases.addCase')}
      icon={Briefcase}
      maxWidth="2xl"
      footer={
        <>
          <button
            type="button"
            onClick={onClose}
            className="w-full sm:w-auto px-4 py-2.5 text-sm font-medium text-slate-600 hover:bg-slate-100 active:bg-slate-200 rounded-xl transition min-h-[44px]"
          >
            {t('common.cancel')}
          </button>
          <button
            type="submit"
            form="case-form-modal"
            disabled={submitting}
            className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-5 py-2.5 bg-slate-900 hover:bg-slate-800 active:bg-slate-950 text-white text-sm font-semibold rounded-xl shadow-xs transition disabled:opacity-50 min-h-[44px]"
          >
            <Save className="w-4 h-4" />
            {submitting ? t('common.loading') : t('common.save')}
          </button>
        </>
      }
    >
      <div className="space-y-4">
        {errorMsg && (
          <div className="p-3 bg-rose-50 border border-rose-200 rounded-lg text-rose-700 text-xs flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{errorMsg}</span>
          </div>
        )}

        {isDuplicate && (
          <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-amber-800 text-xs flex items-start gap-2">
            <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
            <span>{t('cases.duplicateWarning')}</span>
          </div>
        )}

        <form id="case-form-modal" onSubmit={handleSubmit} className="space-y-4">
          {/* Client, Responsible Lawyer & File Serial */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1 flex items-center justify-between">
                <span>{t('cases.linkedClient')} *</span>
                {lockClientId && (
                  <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-slate-500">
                    <Lock className="w-3 h-3" /> {t('hub.lockedField', 'Locked')}
                  </span>
                )}
              </label>
              <select
                required
                disabled={Boolean(lockClientId)}
                value={clientId}
                onChange={(e) => setClientId(e.target.value)}
                className="w-full bg-slate-50 border border-slate-300 rounded-lg px-3 py-2 text-sm text-slate-900 focus:ring-2 focus:ring-slate-500 focus:outline-hidden min-h-[44px] disabled:opacity-65 disabled:cursor-not-allowed"
              >
                {clients.length === 0 && <option value="">{t('cases.noClientsRegistered')}</option>}
                {clients.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name} {c.nameBn ? `(${c.nameBn})` : ''} - {c.phone}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                {t('cases.responsibleLawyer')}
              </label>
              <select
                value={responsibleLawyerId}
                onChange={(e) => setResponsibleLawyerId(e.target.value)}
                className="w-full bg-slate-50 border border-slate-300 rounded-lg px-3 py-2 text-sm text-slate-900 focus:ring-2 focus:ring-slate-500 focus:outline-hidden min-h-[44px]"
              >
                <option value="">{t('cases.unassignedLawyer')}</option>
                {activeLawyers.map((lw) => (
                  <option key={lw.id} value={lw.id}>
                    {lw.name} ({lw.role === 'Owner' ? 'Owner' : t(`settings.jobType_${lw.jobType || 'lawyer_junior'}`)})
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                {t('cases.fileSerial')} *
              </label>
              <input
                type="text"
                required
                value={fileSerial}
                onChange={(e) => setFileSerial(e.target.value)}
                className="w-full font-mono bg-slate-50 border border-slate-300 rounded-lg px-3 py-2 text-sm text-slate-900 focus:ring-2 focus:ring-slate-500 focus:outline-hidden min-h-[44px]"
              />
            </div>
          </div>

          {/* Case Number & Status */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="sm:col-span-2">
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                {t('cases.caseNumber')} *
              </label>
              <input
                type="text"
                required
                value={caseNumber}
                onChange={(e) => setCaseNumber(e.target.value)}
                placeholder="e.g. Title Suit No. 45/2023"
                className="w-full bg-slate-50 border border-slate-300 rounded-lg px-3 py-2 text-sm text-slate-900 focus:ring-2 focus:ring-slate-500 focus:outline-hidden"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                {t('cases.status')} *
              </label>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value as 'ongoing' | 'closed')}
                className="w-full bg-slate-50 border border-slate-300 rounded-lg px-3 py-2 text-sm text-slate-900 focus:ring-2 focus:ring-slate-500 focus:outline-hidden font-medium"
              >
                <option value="ongoing">{t('cases.ongoing')}</option>
                <option value="closed">{t('cases.closed')}</option>
              </select>
            </div>
          </div>

          {/* Court Selection */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              {t('cases.court')} *
            </label>
            <select
              value={court}
              onChange={(e) => setCourt(e.target.value)}
              className="w-full bg-slate-50 border border-slate-300 rounded-lg px-3 py-2 text-sm text-slate-900 focus:ring-2 focus:ring-slate-500 focus:outline-hidden mb-2"
            >
              {COMMON_COURTS.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
              <option value="CUSTOM">{t('cases.otherCustomCourt')}</option>
            </select>
            {court === 'CUSTOM' && (
              <input
                type="text"
                required
                value={customCourt}
                onChange={(e) => setCustomCourt(e.target.value)}
                placeholder={t('cases.specifyCustomCourt')}
                className="w-full bg-slate-50 border border-slate-300 rounded-lg px-3 py-2 text-sm text-slate-900 focus:ring-2 focus:ring-slate-500 focus:outline-hidden"
              />
            )}
          </div>

          {/* Matter Type */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              {t('cases.matterType')} *
            </label>
            <select
              value={matterType}
              onChange={(e) => setMatterType(e.target.value)}
              className="w-full bg-slate-50 border border-slate-300 rounded-lg px-3 py-2 text-sm text-slate-900 focus:ring-2 focus:ring-slate-500 focus:outline-hidden mb-2"
            >
              {COMMON_MATTERS.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
              <option value="CUSTOM">{t('cases.otherMatterType')}</option>
            </select>
            {matterType === 'CUSTOM' && (
              <input
                type="text"
                required
                value={customMatter}
                onChange={(e) => setCustomMatter(e.target.value)}
                placeholder={t('cases.specifyMatter')}
                className="w-full bg-slate-50 border border-slate-300 rounded-lg px-3 py-2 text-sm text-slate-900 focus:ring-2 focus:ring-slate-500 focus:outline-hidden"
              />
            )}
          </div>

          {/* Parties & Role */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 bg-slate-50 p-3.5 rounded-xl border border-slate-200">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                {t('cases.plaintiff')} *
              </label>
              <input
                type="text"
                required
                value={plaintiff}
                onChange={(e) => setPlaintiff(e.target.value)}
                placeholder={t('cases.plaintiffPlaceholder')}
                className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-xs text-slate-900 focus:ring-2 focus:ring-slate-500 focus:outline-hidden"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                {t('cases.defendant')} *
              </label>
              <input
                type="text"
                required
                value={defendant}
                onChange={(e) => setDefendant(e.target.value)}
                placeholder={t('cases.defendantPlaceholder')}
                className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-xs text-slate-900 focus:ring-2 focus:ring-slate-500 focus:outline-hidden"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                {t('cases.ourRole')} *
              </label>
              <select
                value={ourRole}
                onChange={(e) => setOurRole(e.target.value as CourtRole)}
                className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-xs text-slate-900 focus:ring-2 focus:ring-slate-500 focus:outline-hidden font-semibold"
              >
                <option value="Plaintiff">{t('cases.rolePlaintiff')}</option>
                <option value="Defendant">{t('cases.roleDefendant')}</option>
                <option value="Petitioner">{t('cases.rolePetitioner')}</option>
                <option value="Respondent">{t('cases.roleRespondent')}</option>
                <option value="Appellant">{t('cases.roleAppellant')}</option>
                <option value="Applicant">{t('cases.roleApplicant')}</option>
              </select>
            </div>
          </div>

          {/* Lawyers */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                {t('cases.plaintiffLawyer')}
              </label>
              <input
                type="text"
                value={plaintiffLawyer}
                onChange={(e) => setPlaintiffLawyer(e.target.value)}
                placeholder="e.g. Adv. Mahbubur Rahman"
                className="w-full bg-slate-50 border border-slate-300 rounded-lg px-3 py-2 text-sm text-slate-900 focus:ring-2 focus:ring-slate-500 focus:outline-hidden"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                {t('cases.defendantLawyer')}
              </label>
              <input
                type="text"
                value={defendantLawyer}
                onChange={(e) => setDefendantLawyer(e.target.value)}
                placeholder={t('cases.opposingCounselPlaceholder')}
                className="w-full bg-slate-50 border border-slate-300 rounded-lg px-3 py-2 text-sm text-slate-900 focus:ring-2 focus:ring-slate-500 focus:outline-hidden"
              />
            </div>
          </div>

          {/* Description */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              {t('cases.description')}
            </label>
            <textarea
              rows={2}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder={t('cases.caseDescriptionPlaceholder')}
              className="w-full bg-slate-50 border border-slate-300 rounded-lg px-3 py-2 text-sm text-slate-900 focus:ring-2 focus:ring-slate-500 focus:outline-hidden"
            />
          </div>

          {/* Confidential / Restricted Flag */}
          <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl">
            <label className="flex items-start gap-2.5 cursor-pointer">
              <input
                type="checkbox"
                disabled={!canRestricted}
                checked={restricted}
                onChange={(e) => setRestricted(e.target.checked)}
                className="mt-0.5 rounded text-slate-900 focus:ring-slate-500 w-4 h-4"
              />
              <div className="flex-1">
                <span className="text-xs font-bold text-slate-900 flex items-center gap-1.5">
                  <Lock className="w-3.5 h-3.5 text-amber-600" />
                  {t('cases.restricted')}
                </span>
                <p className="text-[11px] text-slate-500 mt-0.5">
                  {t('cases.restrictedNotice')}
                </p>
                {!canRestricted && (
                  <span className="text-[10px] text-amber-700 font-semibold block mt-1">
                    {t('cases.restrictedPermissionNotice')}
                  </span>
                )}
              </div>
            </label>
          </div>

        </form>
      </div>
    </ResponsiveModal>
  );
};
