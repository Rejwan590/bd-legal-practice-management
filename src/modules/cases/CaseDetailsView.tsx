import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../foundation/AuthContext';
import { getRepositories } from '../../data/repositories';
import { CaseRecord, ClientRecord, HearingRecord, PhysicalFileRecord, TaskRecord } from '../../data/types';
import { CaseHearingsOverview } from '../../data/interfaces';
import { HearingDateHistoryModal } from '../hearings/HearingDateHistoryModal';
import { ResponsiveModal } from '../../components/responsive/ResponsiveModal';
import {
  ArrowLeft,
  Briefcase,
  Building,
  Scale,
  Calendar,
  User,
  Phone,
  FileText,
  Lock,
  Edit2,
  Trash2,
  AlertTriangle,
  Clock,
  Shield,
  Gavel,
  History,
  CheckCircle,
  CheckSquare,
  FolderArchive,
  MapPin,
} from 'lucide-react';

interface CaseDetailsViewProps {
  caseRecord: CaseRecord;
  onBack: () => void;
  onEdit: (c: CaseRecord) => void;
  onDeleted: () => void;
  onNavigateToClient?: (clientId: string) => void;
}

export const CaseDetailsView: React.FC<CaseDetailsViewProps> = ({
  caseRecord,
  onBack,
  onEdit,
  onDeleted,
  onNavigateToClient,
}) => {
  const { t } = useTranslation();
  const { currentUser, can } = useAuth();
  const [client, setClient] = useState<ClientRecord | null>(null);
  const [hearingsOverview, setHearingsOverview] = useState<CaseHearingsOverview | null>(null);
  const [historyModalHearing, setHistoryModalHearing] = useState<HearingRecord | null>(null);
  const [caseTasks, setCaseTasks] = useState<TaskRecord[]>([]);
  const [caseFile, setCaseFile] = useState<PhysicalFileRecord | null>(null);
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [linkedCounts, setLinkedCounts] = useState<{
    hearingsCount: number;
    tasksCount: number;
    filesCount: number;
    remindersCount: number;
  } | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const repos = getRepositories();
  const canEdit = can('cases.edit');
  const canDelete = can('cases.delete');
  const isOwner = currentUser.role === 'Owner';

  const handleOpenDeleteModal = async () => {
    setErrorMsg(null);
    setDeleteModalOpen(true);
    try {
      const counts = await repos.case.getLinkedCounts({ currentUser }, caseRecord.id);
      setLinkedCounts(counts);
    } catch (err: unknown) {
      console.error('Failed to get linked counts:', err);
    }
  };

  useEffect(() => {
    repos.client
      .getById({ currentUser }, caseRecord.clientId)
      .then(setClient)
      .catch(console.error);

    repos.hearing
      .getCaseHearingsOverview({ currentUser }, caseRecord.id)
      .then(setHearingsOverview)
      .catch(console.error);

    repos.task
      .getByCaseId({ currentUser }, caseRecord.id)
      .then(setCaseTasks)
      .catch(console.error);

    repos.physicalFile
      .getByCaseId({ currentUser }, caseRecord.id)
      .then(setCaseFile)
      .catch(console.error);
  }, [caseRecord.id, caseRecord.clientId, currentUser]);


  const handleConfirmDelete = async () => {
    if (!canDelete) return;
    setDeleting(true);
    setErrorMsg(null);
    try {
      await repos.case.delete({ currentUser }, caseRecord.id);
      setDeleteModalOpen(false);
      onDeleted();
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : 'Failed to delete case');
      setDeleting(false);
    }
  };

  return (
    <div className="space-y-6 max-w-5xl">
      {/* Top action bar */}
      <div className="flex items-center justify-between gap-4">
        <button
          onClick={onBack}
          className="inline-flex items-center gap-2 px-3 py-1.5 text-xs font-semibold text-slate-700 bg-white hover:bg-slate-50 border border-slate-300 rounded-lg transition shadow-2xs"
        >
          <ArrowLeft className="w-4 h-4" />
          {t('cases.backToList')}
        </button>

        <div className="flex items-center gap-2">
          {canEdit && (
            <button
              onClick={() => onEdit(caseRecord)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-700 bg-white hover:bg-slate-50 border border-slate-300 rounded-lg transition shadow-2xs"
            >
              <Edit2 className="w-3.5 h-3.5" />
              {t('common.edit')}
            </button>
          )}

          {canDelete && (
            <button
              onClick={handleOpenDeleteModal}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-rose-700 bg-rose-50 hover:bg-rose-100 border border-rose-200 rounded-lg transition shadow-2xs"
            >
              <Trash2 className="w-3.5 h-3.5" />
              {t('common.delete')}
            </button>
          )}
        </div>
      </div>

      {errorMsg && (
        <div className="p-3 bg-rose-50 border border-rose-200 rounded-lg text-rose-700 text-xs">
          {errorMsg}
        </div>
      )}

      {/* Main Dossier Card */}
      <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-xs space-y-6">
        {/* Header with Case Number & Badges */}
        <div className="flex flex-col md:flex-row md:items-start justify-between gap-4 border-b border-slate-100 pb-5">
          <div className="space-y-2">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-mono text-xs font-bold px-2.5 py-1 rounded-md bg-indigo-50 text-indigo-700 border border-indigo-200">
                {caseRecord.fileSerial}
              </span>
              <span
                className={`text-xs px-2.5 py-0.5 rounded-full font-semibold ${
                  caseRecord.status === 'ongoing'
                    ? 'bg-emerald-100 text-emerald-800'
                    : 'bg-slate-200 text-slate-700'
                }`}
              >
                {caseRecord.status === 'ongoing' ? t('cases.ongoing') : t('cases.closed')}
              </span>
              {caseRecord.restricted && (
                <span className="flex items-center gap-1 text-xs px-2.5 py-0.5 rounded-full font-bold bg-amber-100 text-amber-900 border border-amber-300">
                  <Lock className="w-3 h-3 text-amber-700" />
                  {t('cases.restricted')}
                </span>
              )}
            </div>

            <h1 className="text-2xl font-bold text-slate-900">{caseRecord.caseNumber}</h1>
            <p className="text-sm font-medium text-slate-600 flex items-center gap-1.5">
              <Building className="w-4 h-4 text-slate-400" />
              {caseRecord.court}
            </p>
          </div>

          <div className="bg-slate-50 p-3 rounded-xl border border-slate-200 text-xs space-y-1 self-start">
            <span className="text-slate-400 block font-medium uppercase tracking-wider text-[10px]">
              {t('cases.nextHearing')}
            </span>
            <div className="flex items-center gap-1.5 font-bold text-slate-800">
              <Calendar className="w-3.5 h-3.5 text-indigo-600" />
              <span>
                {caseRecord.nextHearingAt
                  ? new Date(caseRecord.nextHearingAt).toLocaleDateString()
                  : t('cases.notScheduled')}
              </span>
            </div>
            <span className="text-[10px] text-slate-400 block">
              Stage 4 Hearings connected
            </span>
          </div>
        </div>

        {/* Represented Client Card */}
        {client && (
          <div className="bg-indigo-50/50 border border-indigo-100 rounded-xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-indigo-100 text-indigo-700 flex items-center justify-center font-bold text-sm">
                <User className="w-5 h-5" />
              </div>
              <div>
                <span className="text-[10px] font-bold text-indigo-600 uppercase tracking-wider block">
                  {t('cases.linkedClient')}
                </span>
                <span className="font-bold text-sm text-slate-900">
                  {client.name} {client.nameBn ? `(${client.nameBn})` : ''}
                </span>
                <span className="text-xs text-slate-500 flex items-center gap-1 mt-0.5">
                  <Phone className="w-3 h-3 text-emerald-600" />
                  {client.phone}
                </span>
              </div>
            </div>

            {onNavigateToClient && (
              <button
                onClick={() => onNavigateToClient(client.id)}
                className="text-xs font-bold text-indigo-700 hover:text-indigo-900 underline self-start sm:self-center"
              >
                View Client Dossier &rarr;
              </button>
            )}
          </div>
        )}

        {/* Parties Representation Breakdown */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Plaintiff / Petitioner Box */}
          <div
            className={`p-4 rounded-xl border ${
              ['Plaintiff', 'Petitioner', 'Appellant', 'Applicant'].includes(caseRecord.ourRole)
                ? 'bg-emerald-50/60 border-emerald-200'
                : 'bg-slate-50 border-slate-200'
            }`}
          >
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-bold text-slate-700 uppercase tracking-wider">
                {t('cases.plaintiff')}
              </span>
              {['Plaintiff', 'Petitioner', 'Appellant', 'Applicant'].includes(caseRecord.ourRole) && (
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-200 text-emerald-900">
                  Chamber Client ({caseRecord.ourRole})
                </span>
              )}
            </div>
            <p className="font-bold text-sm text-slate-900">{caseRecord.plaintiff}</p>
            <div className="text-xs text-slate-500 mt-2">
              <strong>Counsel:</strong> {caseRecord.plaintiffLawyer || 'N/A'}
            </div>
          </div>

          {/* Defendant / Respondent Box */}
          <div
            className={`p-4 rounded-xl border ${
              ['Defendant', 'Respondent'].includes(caseRecord.ourRole)
                ? 'bg-emerald-50/60 border-emerald-200'
                : 'bg-slate-50 border-slate-200'
            }`}
          >
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-bold text-slate-700 uppercase tracking-wider">
                {t('cases.defendant')}
              </span>
              {['Defendant', 'Respondent'].includes(caseRecord.ourRole) && (
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-200 text-emerald-900">
                  Chamber Client ({caseRecord.ourRole})
                </span>
              )}
            </div>
            <p className="font-bold text-sm text-slate-900">{caseRecord.defendant}</p>
            <div className="text-xs text-slate-500 mt-2">
              <strong>Opposing Counsel:</strong> {caseRecord.defendantLawyer || 'N/A'}
            </div>
          </div>
        </div>

        {/* Matter Classification & Facts */}
        <div className="space-y-3 pt-2">
          <div>
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider block mb-1">
              {t('cases.matterType')}
            </span>
            <span className="inline-block px-3 py-1 rounded-lg bg-slate-100 text-slate-800 text-xs font-semibold">
              {caseRecord.matterType}
            </span>
          </div>

          {caseRecord.description && (
            <div>
              <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider block mb-1">
                {t('cases.description')}
              </span>
              <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-700 whitespace-pre-line leading-relaxed">
                {caseRecord.description}
              </div>
            </div>
          )}
        </div>

        {/* Stage 4 Hearings Overview Card */}
        <div className="bg-slate-50 border border-slate-200 rounded-xl p-5 space-y-4">
          <div className="flex items-center justify-between border-b border-slate-200 pb-3">
            <h3 className="font-bold text-sm text-slate-900 flex items-center gap-2">
              <Gavel className="w-4 h-4 text-indigo-600" />
              Court Hearings Overview (Previous, Current, Next)
            </h3>
            <span className="text-xs text-slate-500 font-mono">
              Total Hearings: {hearingsOverview?.allHearings.length || 0}
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {/* Previous Hearing */}
            <div className="p-3.5 bg-white rounded-xl border border-slate-200 shadow-2xs space-y-1.5">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
                {t('hearings.previousHearing')}
              </span>
              {hearingsOverview?.previousHearing ? (
                <>
                  <div className="font-bold text-xs text-slate-900 flex items-center gap-1.5">
                    <Calendar className="w-3.5 h-3.5 text-slate-400" />
                    <span>{new Date(hearingsOverview.previousHearing.scheduledAt).toLocaleDateString()}</span>
                  </div>
                  <p className="text-xs text-slate-600 font-medium">
                    {hearingsOverview.previousHearing.purpose}
                  </p>
                  {hearingsOverview.previousHearing.outcomeNote && (
                    <p className="text-[11px] text-slate-500 italic bg-slate-50 p-2 rounded border border-slate-100">
                      "{hearingsOverview.previousHearing.outcomeNote}"
                    </p>
                  )}
                  <span
                    className={`inline-block text-[9px] px-2 py-0.5 rounded font-bold uppercase tracking-wider ${
                      hearingsOverview.previousHearing.status === 'held'
                        ? 'bg-emerald-100 text-emerald-800'
                        : 'bg-amber-100 text-amber-800'
                    }`}
                  >
                    {hearingsOverview.previousHearing.status}
                  </span>
                </>
              ) : (
                <p className="text-xs text-slate-400 italic">No previous hearing recorded</p>
              )}
            </div>

            {/* Current / Today's Hearing */}
            <div className="p-3.5 bg-white rounded-xl border border-slate-200 shadow-2xs space-y-1.5">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
                {t('hearings.currentHearing')}
              </span>
              {hearingsOverview?.currentHearing ? (
                <>
                  <div className="font-bold text-xs text-indigo-700 flex items-center gap-1.5">
                    <Clock className="w-3.5 h-3.5" />
                    <span>Today, {new Date(hearingsOverview.currentHearing.scheduledAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                  </div>
                  <p className="text-xs text-slate-800 font-semibold">
                    {hearingsOverview.currentHearing.purpose}
                  </p>
                  <span className="inline-block text-[9px] px-2 py-0.5 rounded font-bold uppercase tracking-wider bg-indigo-100 text-indigo-800">
                    Listed Today
                  </span>
                </>
              ) : (
                <p className="text-xs text-slate-400 italic">No hearing listed for today</p>
              )}
            </div>

            {/* Next Hearing */}
            <div className="p-3.5 bg-white rounded-xl border border-indigo-200 shadow-2xs space-y-1.5 bg-indigo-50/20">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-bold text-indigo-700 uppercase tracking-wider block">
                  {t('hearings.nextHearing')}
                </span>
                {hearingsOverview?.nextHearing && (
                  <button
                    onClick={() => setHistoryModalHearing(hearingsOverview.nextHearing)}
                    className="text-[10px] text-indigo-600 hover:text-indigo-800 font-bold flex items-center gap-0.5"
                    title={t('hearings.dateHistory')}
                  >
                    <History className="w-3 h-3" />
                    History
                  </button>
                )}
              </div>
              {hearingsOverview?.nextHearing ? (
                <>
                  <div className="font-bold text-xs text-indigo-900 flex items-center gap-1.5">
                    <Calendar className="w-3.5 h-3.5 text-indigo-600" />
                    <span>{new Date(hearingsOverview.nextHearing.scheduledAt).toLocaleDateString()}</span>
                  </div>
                  <p className="text-xs text-slate-800 font-medium">
                    {hearingsOverview.nextHearing.purpose}
                  </p>
                  <span className="inline-block text-[9px] px-2 py-0.5 rounded font-bold uppercase tracking-wider bg-indigo-100 text-indigo-800">
                    Scheduled
                  </span>
                </>
              ) : (
                <p className="text-xs text-slate-400 italic">Next date not yet fixed</p>
              )}
            </div>
          </div>
        </div>

        {/* Stage 5 Tasks Linked to Case */}
        <div className="bg-slate-50 border border-slate-200 rounded-xl p-5 space-y-4">
          <div className="flex items-center justify-between border-b border-slate-200 pb-3">
            <h3 className="font-bold text-sm text-slate-900 flex items-center gap-2">
              <CheckSquare className="w-4 h-4 text-indigo-600" />
              Case Workflow Tasks & Action Items
            </h3>
            <span className="text-xs text-slate-500 font-mono">
              Tasks: {caseTasks.length}
            </span>
          </div>

          {caseTasks.length === 0 ? (
            <p className="text-xs text-slate-400 italic">No tasks currently assigned for this case.</p>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {caseTasks.map((tRec) => (
                <div
                  key={tRec.id}
                  className="p-3 bg-white rounded-xl border border-slate-200 shadow-2xs space-y-1.5"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span
                      className={`text-[9px] px-2 py-0.5 rounded font-bold uppercase tracking-wider ${
                        tRec.priority === 'urgent'
                          ? 'bg-rose-100 text-rose-800 border border-rose-300'
                          : tRec.priority === 'high'
                          ? 'bg-amber-100 text-amber-900 border border-amber-300'
                          : 'bg-slate-100 text-slate-700'
                      }`}
                    >
                      {tRec.priority}
                    </span>
                    <span
                      className={`text-[9px] px-2 py-0.5 rounded font-semibold ${
                        tRec.status === 'completed'
                          ? 'bg-emerald-100 text-emerald-800'
                          : 'bg-indigo-50 text-indigo-700'
                      }`}
                    >
                      {tRec.status}
                    </span>
                  </div>
                  <p className="font-bold text-xs text-slate-900 line-clamp-1">{tRec.title}</p>
                  <div className="text-[11px] text-slate-500 flex items-center justify-between pt-1 border-t border-slate-100">
                    <span>Assigned: <strong className="text-slate-700">{tRec.assignedToName || 'Advocate'}</strong></span>
                    <span>Due: {new Date(tRec.dueAt).toLocaleDateString()}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Stage 6 Physical File Linked to Case */}
        <div className="bg-slate-50 border border-slate-200 rounded-xl p-5 space-y-3">
          <div className="flex items-center justify-between border-b border-slate-200 pb-3">
            <h3 className="font-bold text-sm text-slate-900 flex items-center gap-2">
              <FolderArchive className="w-4 h-4 text-emerald-600" />
              Physical Case Bundle & Documents Dossier
            </h3>
            {caseFile && (
              <span className="font-mono text-xs font-bold px-2 py-0.5 rounded bg-indigo-50 text-indigo-700 border border-indigo-200">
                {caseFile.serial}
              </span>
            )}
          </div>

          {caseFile ? (
            <div className="p-4 bg-white rounded-xl border border-slate-200 shadow-2xs space-y-2">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div>
                  <h4 className="font-bold text-xs text-slate-900">{caseFile.title}</h4>
                  <span className="inline-flex items-center gap-1 text-[11px] text-slate-500 mt-0.5">
                    <MapPin className="w-3 h-3 text-slate-400" />
                    Location: <strong className="text-slate-700">{caseFile.shelfLocation}</strong>
                  </span>
                </div>

                <div>
                  {caseFile.status === 'in_chamber' && (
                    <span className="inline-block text-[10px] font-bold px-2.5 py-0.5 rounded-full bg-emerald-100 text-emerald-800 border border-emerald-200">
                      Available in Chamber
                    </span>
                  )}
                  {caseFile.status === 'checked_out' && (
                    <span className="inline-block text-[10px] font-bold px-2.5 py-0.5 rounded-full bg-amber-100 text-amber-900 border border-amber-300">
                      Checked Out to {caseFile.currentHolderName || 'Advocate'}
                    </span>
                  )}
                  {caseFile.status === 'in_court' && (
                    <span className="inline-block text-[10px] font-bold px-2.5 py-0.5 rounded-full bg-indigo-100 text-indigo-900 border border-indigo-300">
                      In Court ({caseFile.currentHolderName || 'Advocate'})
                    </span>
                  )}
                </div>
              </div>

              {caseFile.notes && (
                <p className="text-[11px] text-slate-600 bg-slate-50 p-2 rounded-lg border border-slate-100">
                  {caseFile.notes}
                </p>
              )}
            </div>
          ) : (
            <div className="p-4 bg-white rounded-xl border border-slate-200 text-center py-4">
              <p className="text-xs text-slate-500 italic">
                No physical paper file registered for this case yet. Physical files can be registered in the Files tab.
              </p>
            </div>
          )}
        </div>

        {/* Future Modules Preview */}
        <div className="pt-4 border-t border-slate-100 grid grid-cols-1 gap-3 text-xs">
          <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 text-slate-600">
            <span className="font-semibold block text-slate-800 mb-1 flex items-center gap-1.5">
              <Calendar className="w-3.5 h-3.5 text-sky-600" />
              Stage 7: Calendar & Automated Reminders
            </span>
            <span>Integrated chamber schedule and SMS/in-app cause list alerts</span>
          </div>
        </div>
      </div>

      {/* History Modal */}
      <HearingDateHistoryModal
        isOpen={Boolean(historyModalHearing)}
        hearing={historyModalHearing}
        onClose={() => setHistoryModalHearing(null)}
      />

      {/* Soft Delete Modal */}
      <ResponsiveModal
        isOpen={deleteModalOpen}
        onClose={() => setDeleteModalOpen(false)}
        title={t('cases.softDeleteWarningTitle')}
        icon={AlertTriangle}
        maxWidth="md"
        footer={
          <>
            <button
              type="button"
              onClick={() => setDeleteModalOpen(false)}
              className="w-full sm:w-auto px-4 py-2.5 text-xs font-semibold text-slate-600 hover:bg-slate-100 active:bg-slate-200 rounded-xl transition min-h-[44px]"
            >
              {t('common.cancel')}
            </button>
            <button
              type="button"
              disabled={deleting || !isOwner}
              onClick={handleConfirmDelete}
              className="w-full sm:w-auto px-4 py-2.5 text-xs font-semibold bg-rose-600 hover:bg-rose-700 active:bg-rose-800 text-white rounded-xl shadow-xs transition disabled:opacity-50 min-h-[44px]"
            >
              {deleting ? t('common.loading') : t('cases.confirmSoftDelete')}
            </button>
          </>
        }
      >
        <div className="space-y-4">
          <p className="text-xs text-slate-600 leading-relaxed">
            {t('cases.softDeleteWarningText')}
          </p>

          <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-200 text-xs space-y-2 text-slate-700">
            <div>
              <strong>Case:</strong> {caseRecord.caseNumber} ({caseRecord.court})
            </div>
            {linkedCounts ? (
              <div className="pt-2 border-t border-slate-200 text-[11px] space-y-1 text-slate-600">
                <div className="font-semibold text-slate-800">Linked Records to be Handled:</div>
                <div className="grid grid-cols-2 gap-1.5 pt-1">
                  <span className="p-1.5 bg-white rounded border border-slate-200">
                    Hearings to soft-delete: <strong>{linkedCounts.hearingsCount}</strong>
                  </span>
                  <span className="p-1.5 bg-white rounded border border-slate-200">
                    Pending reminders to clear: <strong>{linkedCounts.remindersCount}</strong>
                  </span>
                  <span className="p-1.5 bg-white rounded border border-slate-200">
                    Tasks to unlink: <strong>{linkedCounts.tasksCount}</strong>
                  </span>
                  <span className="p-1.5 bg-white rounded border border-slate-200">
                    Files to unlink: <strong>{linkedCounts.filesCount}</strong>
                  </span>
                </div>
                <p className="text-[10px] text-slate-500 pt-1">
                  Unlinked tasks and files will remain visible marked as "[Case archived]" so there are no broken links.
                </p>
              </div>
            ) : (
              <div className="text-[11px] text-slate-400 italic">Calculating linked records...</div>
            )}
          </div>

          {!isOwner && (
            <div className="p-2.5 bg-rose-50 border border-rose-200 rounded-lg text-rose-800 text-xs">
              {t('cases.ownerOnlyDelete', 'Only the chamber Owner can confirm deletion of court cases.')}
            </div>
          )}
        </div>
      </ResponsiveModal>
    </div>
  );
};
