import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../foundation/AuthContext';
import { getRepositories } from '../../data/repositories';
import { ClientRecord } from '../../data/types';
import { ClientLinkedOverview } from '../../data/interfaces';
import { ResponsiveModal } from '../../components/responsive/ResponsiveModal';
import {
  ArrowLeft,
  Briefcase,
  CheckSquare,
  FolderArchive,
  Phone,
  Mail,
  MapPin,
  FileText,
  Calendar,
  Edit2,
  Trash2,
  AlertTriangle,
  Clock,
  ShieldAlert,
  Archive,
  CheckCircle2,
} from 'lucide-react';

interface ClientProfileViewProps {
  client: ClientRecord;
  onBack: () => void;
  onEdit: (client: ClientRecord) => void;
  onDeleted: () => void;
}

export const ClientProfileView: React.FC<ClientProfileViewProps> = ({
  client: initialClient,
  onBack,
  onEdit,
  onDeleted,
}) => {
  const { t } = useTranslation();
  const { currentUser, can } = useAuth();
  const [client, setClient] = useState<ClientRecord>(initialClient);
  const [activeTab, setActiveTab] = useState<'cases' | 'tasks' | 'files'>('cases');
  const [overview, setOverview] = useState<ClientLinkedOverview>({
    cases: [],
    tasks: [],
    files: [],
  });
  const [loading, setLoading] = useState(true);
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [archiving, setArchiving] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const repos = getRepositories();
  const canEdit = can('clients.edit');
  const isOwner = currentUser.role === 'Owner';

  useEffect(() => {
    let isMounted = true;
    const loadOverview = async () => {
      setLoading(true);
      try {
        const data = await repos.client.getLinkedOverview({ currentUser }, client.id);
        if (isMounted) {
          setOverview(data);
        }
      } catch (err: unknown) {
        console.error('Failed to load client linked overview:', err);
      } finally {
        if (isMounted) setLoading(false);
      }
    };
    loadOverview();
    return () => {
      isMounted = false;
    };
  }, [client.id, currentUser]);

  const activeCasesCount = overview.cases.filter((c) => c.status.toLowerCase() === 'ongoing').length;
  const activeTasksCount = overview.tasks.filter((t) => t.status === 'pending' || t.status === 'in_progress').length;
  const activeFilesCount = overview.files.filter((f) => f.status !== 'archived').length;
  const hasActiveRecords = activeCasesCount > 0 || activeTasksCount > 0 || activeFilesCount > 0;

  const handleConfirmDelete = async () => {
    if (!canEdit) return;
    if (hasActiveRecords) {
      setErrorMsg(
        `Cannot delete client: Client has ${activeCasesCount} active case(s), ${activeTasksCount} active task(s), and ${activeFilesCount} active physical file(s). All cases, tasks, and files must be resolved or closed first.`
      );
      return;
    }
    setDeleting(true);
    setErrorMsg(null);
    try {
      await repos.client.delete({ currentUser }, client.id);
      setDeleteModalOpen(false);
      onDeleted();
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : 'Failed to delete client');
      setDeleting(false);
    }
  };

  const handleArchiveClient = async () => {
    if (!isOwner) return;
    if (activeCasesCount > 0) {
      setErrorMsg(`Cannot archive client: Client still has ${activeCasesCount} ongoing case(s). All cases must be closed or moved before archiving.`);
      return;
    }
    setArchiving(true);
    setErrorMsg(null);
    try {
      const updated = await repos.client.archive({ currentUser }, client.id);
      setClient(updated);
      setSuccessMsg(t('clients.clientArchived', 'Client archived successfully.'));
      setDeleteModalOpen(false);
      setTimeout(() => setSuccessMsg(null), 4000);
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : 'Failed to archive client');
    } finally {
      setArchiving(false);
    }
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto w-full">
      {/* Top action bar */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <button
          onClick={onBack}
          className="min-h-[44px] inline-flex items-center gap-2 px-3.5 py-2 text-xs font-semibold text-slate-700 bg-white hover:bg-slate-50 border border-slate-300 rounded-xl transition shadow-2xs"
        >
          <ArrowLeft className="w-4 h-4" />
          {t('clients.backToList')}
        </button>

        <div className="flex flex-wrap items-center gap-2">
          {canEdit && (
            <button
              onClick={() => onEdit(client)}
              className="min-h-[44px] inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-slate-700 bg-white hover:bg-slate-50 border border-slate-300 rounded-xl transition shadow-2xs"
            >
              <Edit2 className="w-3.5 h-3.5" />
              {t('common.edit')}
            </button>
          )}

          {isOwner && !client.archived && (
            <button
              onClick={handleArchiveClient}
              disabled={archiving || activeCasesCount > 0}
              title={activeCasesCount > 0 ? `Cannot archive: ${activeCasesCount} ongoing case(s)` : 'Archive client'}
              className="min-h-[44px] inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-amber-800 bg-amber-50 hover:bg-amber-100 border border-amber-200 rounded-xl transition shadow-2xs disabled:opacity-50"
            >
              <Archive className="w-3.5 h-3.5" />
              {t('clients.archiveClient', 'Archive Client')}
            </button>
          )}

          {canEdit && (
            <button
              onClick={() => setDeleteModalOpen(true)}
              className="min-h-[44px] inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-rose-700 bg-rose-50 hover:bg-rose-100 border border-rose-200 rounded-xl transition shadow-2xs"
            >
              <Trash2 className="w-3.5 h-3.5" />
              {t('common.delete')}
            </button>
          )}
        </div>
      </div>

      {successMsg && (
        <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-lg text-emerald-800 text-xs flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
          <span>{successMsg}</span>
        </div>
      )}

      {errorMsg && (
        <div className="p-3 bg-rose-50 border border-rose-200 rounded-lg text-rose-700 text-xs">
          {errorMsg}
        </div>
      )}

      {/* Client Overview Card */}
      <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-xs">
        <div className="flex flex-col md:flex-row md:items-start justify-between gap-4 border-b border-slate-100 pb-5">
          <div className="flex items-start gap-4">
            <div className="w-14 h-14 rounded-2xl bg-indigo-50 text-indigo-700 font-bold text-xl flex items-center justify-center shrink-0 border border-indigo-100 shadow-2xs">
              {client.name.slice(0, 2).toUpperCase()}
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="text-xl font-bold text-slate-900">{client.name}</h1>
                {client.nameBn && (
                  <span className="text-sm font-medium text-slate-600 bg-slate-100 px-2.5 py-0.5 rounded-full font-sans">
                    {client.nameBn}
                  </span>
                )}
                {client.archived && (
                  <span className="text-xs font-semibold px-2.5 py-0.5 rounded-full bg-slate-200 text-slate-700 border border-slate-300">
                    {t('clients.archived', 'Archived')}
                  </span>
                )}
              </div>
              <span className="text-xs text-slate-400 font-mono mt-1 block">
                ID: {client.id}
              </span>
            </div>
          </div>

          <div className="text-xs text-slate-500 font-mono bg-slate-50 p-2.5 rounded-xl border border-slate-100 flex items-center gap-2 self-start">
            <Calendar className="w-3.5 h-3.5 text-slate-400" />
            <span>
              {t('clients.registrationDate')}: {new Date(client.createdAt).toLocaleDateString()}
            </span>
          </div>
        </div>

        {/* Contact details grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-5 text-sm">
          <div className="flex items-start gap-2.5 p-3 rounded-xl bg-slate-50/70 border border-slate-100">
            <Phone className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
            <div>
              <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider block">
                {t('clients.phone')}
              </span>
              <a href={`tel:${client.phone}`} className="font-semibold text-slate-900 hover:underline">
                {client.phone}
              </a>
            </div>
          </div>

          <div className="flex items-start gap-2.5 p-3 rounded-xl bg-slate-50/70 border border-slate-100">
            <Mail className="w-4 h-4 text-sky-600 shrink-0 mt-0.5" />
            <div className="truncate">
              <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider block">
                {t('clients.email')}
              </span>
              <span className="font-medium text-slate-800 truncate block">
                {client.email || t('common.none')}
              </span>
            </div>
          </div>

          <div className="flex items-start gap-2.5 p-3 rounded-xl bg-slate-50/70 border border-slate-100">
            <MapPin className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
            <div>
              <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider block">
                {t('clients.address')}
              </span>
              <span className="font-medium text-slate-800 line-clamp-2">
                {client.address || t('common.none')}
              </span>
            </div>
          </div>
        </div>

        {/* Chamber Notes */}
        {client.notes && (
          <div className="mt-4 p-3.5 rounded-xl bg-amber-50/60 border border-amber-200/70 text-xs text-amber-900">
            <div className="flex items-center gap-1.5 font-semibold text-amber-800 mb-1">
              <FileText className="w-3.5 h-3.5" />
              {t('clients.notes')}
            </div>
            <p className="whitespace-pre-line leading-relaxed text-amber-950 font-normal">
              {client.notes}
            </p>
          </div>
        )}
      </div>

      {/* Linked Records Tabs: Cases, Tasks, Physical Files */}
      <div className="bg-white border border-slate-200 rounded-2xl shadow-xs overflow-hidden">
        {/* Tab Headers */}
        <div className="flex items-center border-b border-slate-200 bg-slate-50/70 px-4 pt-2 gap-2 overflow-x-auto scrollbar-none">
          <button
            onClick={() => setActiveTab('cases')}
            className={`min-h-[44px] flex items-center gap-2 pb-2 px-3 text-xs font-bold border-b-2 transition whitespace-nowrap shrink-0 ${
              activeTab === 'cases'
                ? 'border-indigo-600 text-indigo-700'
                : 'border-transparent text-slate-600 hover:text-slate-900'
            }`}
          >
            <Briefcase className="w-4 h-4" />
            {t('clients.linkedCases')}
            <span
              className={`px-1.5 py-0.2 rounded-full text-[10px] font-mono ${
                activeTab === 'cases'
                  ? 'bg-indigo-100 text-indigo-800'
                  : 'bg-slate-200 text-slate-600'
              }`}
            >
              {overview.cases.length}
            </span>
          </button>

          <button
            onClick={() => setActiveTab('tasks')}
            className={`min-h-[44px] flex items-center gap-2 pb-2 px-3 text-xs font-bold border-b-2 transition whitespace-nowrap shrink-0 ${
              activeTab === 'tasks'
                ? 'border-indigo-600 text-indigo-700'
                : 'border-transparent text-slate-600 hover:text-slate-900'
            }`}
          >
            <CheckSquare className="w-4 h-4" />
            {t('clients.linkedTasks')}
            <span
              className={`px-1.5 py-0.2 rounded-full text-[10px] font-mono ${
                activeTab === 'tasks'
                  ? 'bg-indigo-100 text-indigo-800'
                  : 'bg-slate-200 text-slate-600'
              }`}
            >
              {overview.tasks.length}
            </span>
          </button>

          <button
            onClick={() => setActiveTab('files')}
            className={`min-h-[44px] flex items-center gap-2 pb-2 px-3 text-xs font-bold border-b-2 transition whitespace-nowrap shrink-0 ${
              activeTab === 'files'
                ? 'border-indigo-600 text-indigo-700'
                : 'border-transparent text-slate-600 hover:text-slate-900'
            }`}
          >
            <FolderArchive className="w-4 h-4" />
            {t('clients.linkedFiles')}
            <span
              className={`px-1.5 py-0.2 rounded-full text-[10px] font-mono ${
                activeTab === 'files'
                  ? 'bg-indigo-100 text-indigo-800'
                  : 'bg-slate-200 text-slate-600'
              }`}
            >
              {overview.files.length}
            </span>
          </button>
        </div>

        {/* Tab Content */}
        <div className="p-5">
          {loading ? (
            <div className="p-8 text-center text-slate-400 text-xs font-medium">
              {t('common.loading')}
            </div>
          ) : (
            <>
              {/* Cases Tab */}
              {activeTab === 'cases' && (
                <div>
                  {overview.cases.length === 0 ? (
                    <div className="p-8 text-center text-slate-400 text-xs">
                      {t('clients.noCases')}
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {overview.cases.map((c) => (
                        <div
                          key={c.id}
                          className="p-4 rounded-xl border border-slate-200 bg-slate-50/50 hover:bg-slate-50 transition flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                        >
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="font-bold text-sm text-slate-900">
                                {c.caseNumber}
                              </span>
                              <span className="text-xs px-2 py-0.5 rounded font-semibold bg-emerald-100 text-emerald-800">
                                {c.status}
                              </span>
                            </div>
                            <p className="text-xs text-slate-600 mt-1">{c.court}</p>
                            <span className="text-[11px] text-slate-400 block mt-0.5">
                              Matter: {c.matterType}
                            </span>
                          </div>
                          <span className="text-xs text-indigo-600 font-semibold self-start sm:self-center">
                            Case Dossier &rarr;
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Tasks Tab */}
              {activeTab === 'tasks' && (
                <div>
                  {overview.tasks.length === 0 ? (
                    <div className="p-8 text-center text-slate-400 text-xs">
                      {t('clients.noTasks')}
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {overview.tasks.map((task) => (
                        <div
                          key={task.id}
                          className="p-4 rounded-xl border border-slate-200 bg-slate-50/50 hover:bg-slate-50 transition flex flex-col sm:flex-row sm:items-center justify-between gap-2"
                        >
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="font-semibold text-sm text-slate-900">
                                {task.title}
                              </span>
                              <span
                                className={`text-[10px] px-2 py-0.5 rounded font-bold uppercase tracking-wider ${
                                  task.priority === 'High'
                                    ? 'bg-rose-100 text-rose-800'
                                    : 'bg-slate-200 text-slate-700'
                                }`}
                              >
                                {task.priority}
                              </span>
                            </div>
                            <div className="flex items-center gap-2 text-xs text-slate-500 mt-1">
                              <Clock className="w-3.5 h-3.5" />
                              <span>Due: {new Date(task.dueAt).toLocaleDateString()}</span>
                            </div>
                          </div>
                          <span
                            className={`px-2 py-0.5 rounded text-xs font-semibold self-start sm:self-center ${
                              task.status === 'Completed'
                                ? 'bg-emerald-100 text-emerald-800'
                                : 'bg-amber-100 text-amber-800'
                            }`}
                          >
                            {task.status}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Physical Files Tab */}
              {activeTab === 'files' && (
                <div>
                  {overview.files.length === 0 ? (
                    <div className="p-8 text-center text-slate-400 text-xs">
                      {t('clients.noFiles')}
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {overview.files.map((file) => (
                        <div
                          key={file.id}
                          className="p-4 rounded-xl border border-slate-200 bg-slate-50/50 hover:bg-slate-50 transition flex flex-col sm:flex-row sm:items-center justify-between gap-2"
                        >
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="font-mono font-bold text-sm text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded border border-indigo-200">
                                {file.serial}
                              </span>
                              <span className="text-xs font-medium text-slate-800">
                                {file.status}
                              </span>
                            </div>
                            <span className="text-xs text-slate-500 block mt-1">
                              Holder / Custodian: <strong className="text-slate-700">{file.holderName}</strong>
                            </span>
                          </div>
                          <span className="text-xs text-slate-400 font-mono">
                            Stage 6 Linked
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* Soft-Delete Confirmation Dialog with Linked Record Warning */}
      <ResponsiveModal
        isOpen={deleteModalOpen}
        onClose={() => setDeleteModalOpen(false)}
        maxWidth="md"
        title={
          <div className={`flex items-center gap-2.5 ${hasActiveRecords ? 'text-rose-600' : 'text-amber-600'}`}>
            <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${hasActiveRecords ? 'bg-rose-100' : 'bg-amber-100'}`}>
              {hasActiveRecords ? (
                <ShieldAlert className="w-4 h-4 text-rose-600" />
              ) : (
                <AlertTriangle className="w-4 h-4 text-amber-600" />
              )}
            </div>
            <span className="font-bold text-base text-slate-900">
              {hasActiveRecords ? t('clients.deleteBlockedTitle', 'Delete Blocked: Active Records') : t('clients.softDeleteWarningTitle')}
            </span>
          </div>
        }
        subtitle={
          hasActiveRecords
            ? 'Client has active matters and cannot be deleted'
            : 'Review linked record implications before soft-deleting'
        }
        footer={
          <div className="flex flex-wrap items-center justify-end gap-2 w-full">
            <button
              type="button"
              onClick={() => setDeleteModalOpen(false)}
              className="min-h-[44px] px-4 py-2 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-xl transition"
            >
              {t('common.cancel')}
            </button>

            {isOwner && activeCasesCount === 0 && !client.archived && (
              <button
                type="button"
                disabled={archiving}
                onClick={handleArchiveClient}
                className="min-h-[44px] px-4 py-2 text-xs font-semibold bg-amber-600 hover:bg-amber-700 text-white rounded-xl shadow-xs transition disabled:opacity-50"
              >
                {archiving ? t('common.loading') : t('clients.archiveClient', 'Archive Client')}
              </button>
            )}

            {!hasActiveRecords && (
              <button
                type="button"
                disabled={deleting}
                onClick={handleConfirmDelete}
                className="min-h-[44px] px-4 py-2 text-xs font-semibold bg-rose-600 hover:bg-rose-700 text-white rounded-xl shadow-xs transition disabled:opacity-50"
              >
                {deleting ? t('common.loading') : t('clients.confirmSoftDelete')}
              </button>
            )}
          </div>
        }
      >
        <div className="space-y-4">
          {hasActiveRecords ? (
            <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-800 space-y-2">
              <p className="font-semibold">
                Cannot delete client: Client has {activeCasesCount} active case(s), {activeTasksCount} active task(s), and {activeFilesCount} active physical file(s).
              </p>
              <p className="text-[11px] text-rose-700">
                All cases, tasks, and files must be resolved or closed first. Once all cases are closed or moved, the chamber Owner can archive this client.
              </p>
            </div>
          ) : (
            <p className="text-xs text-slate-600 leading-relaxed">
              {t('clients.softDeleteWarningText', {
                casesCount: overview.cases.length,
                tasksCount: overview.tasks.length,
                filesCount: overview.files.length,
              })}
            </p>
          )}

          <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-200 text-xs space-y-1.5 text-slate-700">
            <div>
              <strong>Client:</strong> {client.name}
            </div>
            <div>
              <strong>Linked Cases:</strong> {overview.cases.length} ({activeCasesCount} ongoing) | <strong>Tasks:</strong> {overview.tasks.length} ({activeTasksCount} active) | <strong>Files:</strong> {overview.files.length} ({activeFilesCount} active)
            </div>
          </div>
        </div>
      </ResponsiveModal>
    </div>
  );
};
