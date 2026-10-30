import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../foundation/AuthContext';
import { getRepositories } from '../../data/repositories';
import { CaseCategory, CaseRecord, ClientRecord, CourtRole, UserRecord } from '../../data/types';
import { isLawyerOrOwner } from '../../rolePresets';
import { getDhakaDateString, toDateInputValue } from '../../utils/dateUtils';
import {
  CATEGORY_ROLES,
  COMMON_COURT_SUGGESTIONS,
  validateCaseRoles,
} from '../../data/caseRoles';
import { ResponsiveModal } from '../../components/responsive/ResponsiveModal';
import {
  X,
  Briefcase,
  Save,
  AlertTriangle,
  AlertCircle,
  Lock,
  Building,
  Calendar,
  Shield,
} from 'lucide-react';

interface CaseFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (data: Omit<CaseRecord, 'id' | 'firmId' | 'createdAt' | 'updatedAt' | 'deletedAt' | 'createdBy' | 'updatedBy' | 'nextHearingAt'>) => Promise<void>;
  initialData?: CaseRecord | null;
  defaultClientId?: string;
  lockClientId?: boolean;
}

const COMMON_MATTERS = [
  'Civil / Land Title Partition Suit',
  'Civil Revision (Section 115 CPC)',
  'First Appeal / Civil Appeal',
  'Writ Petition (Article 102)',
  'Company Matter / Winding Up',
  'Commercial Recovery & LC Arbitration',
  'Temporary Injunction (Order 39)',
  'Criminal GR Case / Police Prosecution',
  'Criminal CR Case / Complaint Petition',
  'Criminal Revision / Bail Application',
  'Negotiable Instruments Act (Section 138)',
  'Family Court / Dower & Maintenance',
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
  const [caseCategory, setCaseCategory] = useState<CaseCategory>('civil');
  const [caseDate, setCaseDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [closedOn, setClosedOn] = useState<string>('');
  const [court, setCourt] = useState(COMMON_COURT_SUGGESTIONS[3]);
  const [matterType, setMatterType] = useState(COMMON_MATTERS[0]);
  const [customMatter, setCustomMatter] = useState('');
  const [description, setDescription] = useState('');

  // Parties & Roles
  const [partyARole, setPartyARole] = useState('Plaintiff');
  const [partyBRole, setPartyBRole] = useState('Defendant');
  const [plaintiff, setPlaintiff] = useState('');
  const [defendant, setDefendant] = useState('');
  const [ourRole, setOurRole] = useState<CourtRole>('Plaintiff');

  // Criminal specifics
  const [policeStation, setPoliceStation] = useState('');
  const [sectionsOfLaw, setSectionsOfLaw] = useState('');

  // Representation
  const [plaintiffLawyer, setPlaintiffLawyer] = useState('');
  const [defendantLawyer, setDefendantLawyer] = useState('');
  const [status, setStatus] = useState<'ongoing' | 'pending' | 'closed'>('ongoing');
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

  // Sync category changes to default roles
  const handleCategoryChange = (newCat: CaseCategory) => {
    setCaseCategory(newCat);
    const config = CATEGORY_ROLES[newCat];
    setPartyARole(config.defaultPartyARole);
    setPartyBRole(config.defaultPartyBRole);
    setOurRole(config.ourRoleOptions[0]?.value || 'Plaintiff');
  };

  useEffect(() => {
    if (initialData) {
      setClientId(initialData.clientId);
      setResponsibleLawyerId(initialData.responsibleLawyerId || '');
      setFileSerial(initialData.fileSerial);
      setCaseNumber(initialData.caseNumber);
      const cat = initialData.caseCategory || 'civil';
      setCaseCategory(cat);
      setCaseDate(toDateInputValue(initialData.caseDate || initialData.createdAt));
      setClosedOn(toDateInputValue(initialData.closedOn));
      setCourt(initialData.court);

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
      setPartyARole(initialData.partyARole || CATEGORY_ROLES[cat].defaultPartyARole);
      setPartyBRole(initialData.partyBRole || CATEGORY_ROLES[cat].defaultPartyBRole);
      setOurRole(initialData.ourRole);

      setPoliceStation(initialData.policeStation || '');
      setSectionsOfLaw(initialData.sectionsOfLaw || '');

      setPlaintiffLawyer(initialData.plaintiffLawyer);
      setDefendantLawyer(initialData.defendantLawyer);
      setStatus(initialData.status);
      setRestricted(initialData.restricted);
    } else {
      const year = new Date().getFullYear();
      const randomSeq = Math.floor(1000 + Math.random() * 9000);
      setFileSerial(`F-${year}-${randomSeq}`);
      setCaseNumber('');
      setCaseCategory('civil');
      setCaseDate(getDhakaDateString());
      setClosedOn('');
      setCourt(COMMON_COURT_SUGGESTIONS[3]);
      setMatterType(COMMON_MATTERS[0]);
      setCustomMatter('');
      setDescription('');
      setPartyARole('Plaintiff');
      setPartyBRole('Defendant');
      setPlaintiff('');
      setDefendant('');
      setOurRole('Plaintiff');
      setPoliceStation('');
      setSectionsOfLaw('');
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
    if (caseNumber.trim().length > 3 && court.trim().length > 3) {
      const timer = setTimeout(async () => {
        try {
          const dup = await repos.case.checkDuplicate(
            { currentUser },
            caseNumber,
            court,
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
  }, [caseNumber, court, initialData, currentUser]);

  if (!isOpen) return null;

  const currentRoleConfig = CATEGORY_ROLES[caseCategory] || CATEGORY_ROLES.civil;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!clientId) {
      setErrorMsg(t('cases.validationClientRequired', 'Please select a linked client'));
      return;
    }
    if (!caseNumber.trim()) {
      setErrorMsg(t('cases.validationCaseNumberRequired', 'Case Number is required'));
      return;
    }
    if (!court.trim()) {
      setErrorMsg(t('cases.validationCourtRequired', 'Court name is required'));
      return;
    }

    const finalMatter = (matterType === 'CUSTOM' ? customMatter : matterType).trim();
    if (!finalMatter) {
      setErrorMsg(t('cases.validationMatterRequired', 'Matter type is required'));
      return;
    }

    // Role validation
    const roleValidation = validateCaseRoles(caseCategory, ourRole, partyARole, partyBRole);
    if (!roleValidation.valid) {
      setErrorMsg(roleValidation.error || 'Invalid role selection');
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
        court: court.trim(),
        matterType: finalMatter,
        description: description.trim(),
        caseCategory,
        caseDate: toDateInputValue(caseDate) || null,
        closedOn: status === 'closed' ? (toDateInputValue(closedOn) || getDhakaDateString()) : null,
        partyARole: partyARole.trim(),
        partyBRole: partyBRole.trim(),
        plaintiff: plaintiff.trim(),
        defendant: defendant.trim(),
        ourRole,
        policeStation: (caseCategory === 'criminal_gr' || caseCategory === 'criminal_cr') ? policeStation.trim() : null,
        sectionsOfLaw: (caseCategory === 'criminal_gr' || caseCategory === 'criminal_cr') ? sectionsOfLaw.trim() : null,
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
      maxWidth="3xl"
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
          {/* Top Row: Client, Responsible Lawyer & File Serial */}
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

          {/* BD Case Category & Case Date */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 bg-amber-50/60 p-3.5 rounded-xl border border-amber-200/80">
            <div>
              <label className="block text-xs font-bold text-amber-900 mb-1 flex items-center gap-1">
                <Shield className="w-3.5 h-3.5 text-amber-700" />
                <span>{t('cases.category', 'Case Category')} *</span>
              </label>
              <select
                value={caseCategory}
                onChange={(e) => handleCategoryChange(e.target.value as CaseCategory)}
                className="w-full bg-white border border-amber-300 rounded-lg px-3 py-2 text-sm text-slate-900 font-semibold focus:ring-2 focus:ring-amber-500 focus:outline-hidden min-h-[44px]"
              >
                <option value="civil">{t('cases.categoryCivil', 'Civil (দেওয়ানি)')}</option>
                <option value="criminal_gr">{t('cases.categoryCriminalGR', 'Criminal GR / Police (জি.আর.)')}</option>
                <option value="criminal_cr">{t('cases.categoryCriminalCR', 'Criminal CR / Complaint (সি.আর.)')}</option>
                <option value="other">{t('cases.categoryOther', 'Other / Special (অন্যান্য)')}</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1 flex items-center gap-1">
                <Calendar className="w-3.5 h-3.5 text-slate-500" />
                <span>{t('cases.caseDate', 'Filing / Registration Date')}</span>
              </label>
              <input
                type="date"
                value={toDateInputValue(caseDate)}
                onChange={(e) => setCaseDate(e.target.value)}
                className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-sm text-slate-900 focus:ring-2 focus:ring-slate-500 focus:outline-hidden min-h-[44px]"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                {t('cases.status')} *
              </label>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value as 'ongoing' | 'pending' | 'closed')}
                className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-sm text-slate-900 focus:ring-2 focus:ring-slate-500 focus:outline-hidden font-medium min-h-[44px]"
              >
                <option value="ongoing">{t('cases.ongoing', 'Ongoing')}</option>
                <option value="pending">{t('cases.pending', 'Pending')}</option>
                <option value="closed">{t('cases.closed', 'Closed')}</option>
              </select>
            </div>
          </div>

          {/* If Closed, optional Closed On date */}
          {status === 'closed' && (
            <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl">
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                {t('cases.closedOn', 'Disposal / Closed On Date')}
              </label>
              <input
                type="date"
                value={toDateInputValue(closedOn)}
                onChange={(e) => setClosedOn(e.target.value)}
                className="w-full sm:w-1/2 bg-white border border-slate-300 rounded-lg px-3 py-2 text-sm text-slate-900 focus:ring-2 focus:ring-slate-500 focus:outline-hidden"
              />
            </div>
          )}

          {/* Case Number & Court with Datalist Suggestions */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                {t('cases.caseNumber')} *
              </label>
              <input
                type="text"
                required
                value={caseNumber}
                onChange={(e) => setCaseNumber(e.target.value)}
                placeholder={
                  caseCategory === 'criminal_gr'
                    ? 'e.g. GR Case No. 124/2024'
                    : caseCategory === 'criminal_cr'
                    ? 'e.g. CR Case No. 89/2024'
                    : 'e.g. Title Suit No. 45/2023'
                }
                className="w-full bg-slate-50 border border-slate-300 rounded-lg px-3 py-2 text-sm text-slate-900 focus:ring-2 focus:ring-slate-500 focus:outline-hidden min-h-[44px]"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1 flex items-center justify-between">
                <span>{t('cases.court')} *</span>
                <span className="text-[10px] text-slate-400 font-normal">Type or pick from suggestions</span>
              </label>
              <input
                type="text"
                required
                list="court-suggestions"
                value={court}
                onChange={(e) => setCourt(e.target.value)}
                placeholder="e.g. Dhaka District & Sessions Judge Court"
                className="w-full bg-slate-50 border border-slate-300 rounded-lg px-3 py-2 text-sm text-slate-900 focus:ring-2 focus:ring-slate-500 focus:outline-hidden min-h-[44px]"
              />
              <datalist id="court-suggestions">
                {COMMON_COURT_SUGGESTIONS.map((c) => (
                  <option key={c} value={c} />
                ))}
              </datalist>
            </div>
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
              <option value="CUSTOM">{t('cases.otherMatterType', 'Custom Matter Type...')}</option>
            </select>
            {matterType === 'CUSTOM' && (
              <input
                type="text"
                required
                value={customMatter}
                onChange={(e) => setCustomMatter(e.target.value)}
                placeholder={t('cases.specifyMatter', 'Specify custom matter type')}
                className="w-full bg-slate-50 border border-slate-300 rounded-lg px-3 py-2 text-sm text-slate-900 focus:ring-2 focus:ring-slate-500 focus:outline-hidden"
              />
            )}
          </div>

          {/* BD PARTIES STRUCTURE: SIDE A, SIDE B, OUR ROLE */}
          <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-200/80 pb-2">
              <h4 className="text-xs font-bold uppercase tracking-wider text-slate-800">
                {t('cases.partiesSection', 'Parties & Representation (পক্ষসমূহ)')}
              </h4>
              <span className="text-[11px] font-semibold text-amber-800">
                {t(`cases.category_${caseCategory}`, caseCategory.replace('_', ' ').toUpperCase())}
              </span>
            </div>

            {/* Side A & Side B Rows */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* SIDE A */}
              <div className="space-y-2 bg-white p-3 rounded-lg border border-slate-200">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold text-emerald-800">
                    Side A ({partyARole}) *
                  </label>
                  <select
                    value={partyARole}
                    onChange={(e) => setPartyARole(e.target.value)}
                    className="text-xs font-semibold bg-slate-50 border border-slate-300 rounded-md px-2 py-1"
                  >
                    {currentRoleConfig.partyARoles.map((r) => (
                      <option key={r} value={r}>
                        {r}
                      </option>
                    ))}
                  </select>
                </div>
                <input
                  type="text"
                  required
                  value={plaintiff}
                  onChange={(e) => setPlaintiff(e.target.value)}
                  placeholder={
                    caseCategory === 'criminal_gr'
                      ? 'e.g. The State (রাষ্ট্র)'
                      : caseCategory === 'criminal_cr'
                      ? 'e.g. Complainant Name (ফরিয়াদি)'
                      : 'e.g. Haji Mohammad Rafiqul Islam & Others'
                  }
                  className="w-full bg-slate-50 border border-slate-300 rounded-lg px-3 py-2 text-xs text-slate-900 focus:ring-2 focus:ring-slate-500 focus:outline-hidden"
                />
              </div>

              {/* SIDE B */}
              <div className="space-y-2 bg-white p-3 rounded-lg border border-slate-200">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold text-rose-800">
                    Side B ({partyBRole}) *
                  </label>
                  <select
                    value={partyBRole}
                    onChange={(e) => setPartyBRole(e.target.value)}
                    className="text-xs font-semibold bg-slate-50 border border-slate-300 rounded-md px-2 py-1"
                  >
                    {currentRoleConfig.partyBRoles.map((r) => (
                      <option key={r} value={r}>
                        {r}
                      </option>
                    ))}
                  </select>
                </div>
                <input
                  type="text"
                  required
                  value={defendant}
                  onChange={(e) => setDefendant(e.target.value)}
                  placeholder={
                    caseCategory.startsWith('criminal')
                      ? 'e.g. Accused Names (আসামি)'
                      : 'e.g. Azizur Rahman & 4 Others'
                  }
                  className="w-full bg-slate-50 border border-slate-300 rounded-lg px-3 py-2 text-xs text-slate-900 focus:ring-2 focus:ring-slate-500 focus:outline-hidden"
                />
              </div>
            </div>

            {/* OUR ROLE SELECTION (Controlled by Category) */}
            <div className="bg-white p-3 rounded-lg border border-slate-200">
              <label className="block text-xs font-bold text-slate-800 mb-1 flex items-center justify-between">
                <span>{t('cases.ourRole', 'Our Client / Chamber Role')} *</span>
                <span className="text-[11px] text-amber-700 font-normal">
                  Which party represents our engagement?
                </span>
              </label>
              <select
                value={ourRole}
                onChange={(e) => setOurRole(e.target.value as CourtRole)}
                className="w-full bg-slate-50 border border-slate-300 rounded-lg px-3 py-2 text-sm text-slate-900 focus:ring-2 focus:ring-slate-500 focus:outline-hidden font-bold text-amber-950"
              >
                {currentRoleConfig.ourRoleOptions.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.labelEn}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Optional Criminal Specific Fields */}
          {(caseCategory === 'criminal_gr' || caseCategory === 'criminal_cr') && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 bg-indigo-50/50 p-3.5 rounded-xl border border-indigo-200/70">
              <div>
                <label className="block text-xs font-semibold text-indigo-950 mb-1">
                  {t('cases.policeStation', 'Police Station / Thana (থানা)')}
                </label>
                <input
                  type="text"
                  value={policeStation}
                  onChange={(e) => setPoliceStation(e.target.value)}
                  placeholder="e.g. Motijheel Thana, Dhaka"
                  className="w-full bg-white border border-indigo-300 rounded-lg px-3 py-2 text-sm text-slate-900 focus:ring-2 focus:ring-indigo-500 focus:outline-hidden"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-indigo-950 mb-1">
                  {t('cases.sectionsOfLaw', 'Sections of Law (দণ্ডবিধি / আইনের ধারা)')}
                </label>
                <input
                  type="text"
                  value={sectionsOfLaw}
                  onChange={(e) => setSectionsOfLaw(e.target.value)}
                  placeholder="e.g. 302/34 Penal Code, 1860"
                  className="w-full bg-white border border-indigo-300 rounded-lg px-3 py-2 text-sm text-slate-900 focus:ring-2 focus:ring-indigo-500 focus:outline-hidden"
                />
              </div>
            </div>
          )}

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
