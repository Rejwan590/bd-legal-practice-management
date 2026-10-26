import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../foundation/AuthContext';
import { useNavigation, ClientProfileTab } from '../foundation/NavigationContext';
import { getRepositories } from '../../data/repositories';
import {
  AppointmentRecord,
  CaseRecord,
  ClientRecord,
  PhysicalFileRecord,
  TaskRecord,
} from '../../data/types';
import { EntityLink } from '../../components/EntityLink';
import { Breadcrumbs } from '../../components/Breadcrumbs';
import { ClientAvatar } from '../../components/ClientAvatar';
import { ClientNotesPanel } from './ClientNotesPanel';
import { resizeClientPhoto } from '../../utils/photoResizer';
import { formatCasePartyTitle } from '../../data/caseRoles';
import {
  Phone,
  Mail,
  MapPin,
  Briefcase,
  CheckSquare,
  FolderArchive,
  Edit2,
  Archive,
  AlertTriangle,
  Plus,
  UserPlus,
  CheckCircle2,
  RotateCcw,
  LogOut,
  LogIn,
  History,
  Lock,
  X,
  Camera,
  Upload,
  Trash2,
  Clock,
  Calendar as CalendarIcon,
  CreditCard,
} from 'lucide-react';
import { BillingTab } from '../billing/BillingTab';

interface ClientProfileViewProps {
  clientId: string;
  initialClient?: ClientRecord | null;
  onBack: () => void;
  onEdit: (client: ClientRecord) => void;
  onDeleted: () => void;
}

export const ClientProfileView: React.FC<ClientProfileViewProps> = ({
  clientId,
  initialClient,
  onBack,
  onEdit,
  onDeleted,
}) => {
  const { t } = useTranslation();
  const { currentUser, can, isReadOnly } = useAuth();
  const {
    route,
    openClientProfile,
    refreshVersion,
    triggerRefresh,
    setActiveClientContext,
    openCaseForm,
    openTaskForm,
    openTaskComplete,
    openTaskReassign,
    openFileForm,
    openFileCheckOut,
    openFileCheckIn,
    openFileHistory,
    navigateToScreen,
  } = useNavigation();
  const repos = getRepositories();

  const activeTab: ClientProfileTab =
    route.clientId === clientId && route.clientTab ? route.clientTab : 'cases';

  const [client, setClient] = useState<ClientRecord | null>(initialClient || null);
  const [cases, setCases] = useState<CaseRecord[]>([]);
  const [tasks, setTasks] = useState<TaskRecord[]>([]);
  const [files, setFiles] = useState<PhysicalFileRecord[]>([]);
  const [appointments, setAppointments] = useState<AppointmentRecord[]>([]);
  const [photoDataUrl, setPhotoDataUrl] = useState<string | null>(null);
  const [photoUploading, setPhotoUploading] = useState(false);
  const [loading, setLoading] = useState(true);
  const [confirmArchive, setConfirmArchive] = useState(false);
  const [archiving, setArchiving] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);

  const canManageClient = can('clients.edit');
  const canCreateCase = can('cases.create');
  const canEditCase = can('cases.edit');
  const canAssignTasks = can('tasks.assign');
  const canCompleteTasks = can('tasks.complete');
  const canManageFiles = can('files.manage');
  const canViewAppointments = can('appointments.view');
  const canManageAppointments = can('appointments.manage');

  const loadClientHub = useCallback(async () => {
    setLoading(true);
    setErrorMsg(null);
    try {
      const [cl, clientCases, clientTasks, clientFiles, clientAppointments, photoRec] = await Promise.all([
        repos.client.getById({ currentUser }, clientId),
        repos.case.getByClientId({ currentUser }, clientId).catch(() => []),
        repos.task.list({ currentUser }, { clientId }).catch(() => []),
        repos.physicalFile.list({ currentUser }, { clientId }).catch(() => []),
        repos.appointment ? repos.appointment.list({ currentUser }, { clientId }).catch(() => []) : Promise.resolve([]),
        repos.client.getPhoto({ currentUser }, clientId).catch(() => null),
      ]);
      setClient(cl);
      setCases(clientCases);
      setTasks(clientTasks);
      setFiles(clientFiles);
      setAppointments(clientAppointments || []);

      if (photoRec?.dataUrl) {
        setPhotoDataUrl(photoRec.dataUrl);
      } else if (photoRec?.bytes && photoRec?.mime) {
        setPhotoDataUrl(`data:${photoRec.mime};base64,${photoRec.bytes}`);
      } else {
        setPhotoDataUrl(null);
      }

      if (cl) {
        setActiveClientContext({ clientId: cl.id, clientName: cl.name });
      } else {
        setActiveClientContext(null);
      }
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : 'Failed to load client profile');
    } finally {
      setLoading(false);
    }
  }, [clientId, currentUser, repos, setActiveClientContext]);

  useEffect(() => {
    loadClientHub();
    return () => {
      setActiveClientContext(null);
    };
  }, [loadClientHub, refreshVersion, setActiveClientContext]);

  const handlePhotoUpload = async (file: File) => {
    if (!file || isReadOnly || !canManageClient) return;
    setPhotoUploading(true);
    setErrorMsg(null);
    try {
      const resized = await resizeClientPhoto(file, 400, 'image/jpeg');
      await repos.client.savePhoto({ currentUser }, clientId, resized.mime, resized.bytes);
      setPhotoDataUrl(resized.dataUrl);
      triggerRefresh();
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : 'Failed to upload photo');
    } finally {
      setPhotoUploading(false);
    }
  };

  const handlePhotoDelete = async () => {
    if (isReadOnly || !canManageClient) return;
    setPhotoUploading(true);
    setErrorMsg(null);
    try {
      await repos.client.deletePhoto({ currentUser }, clientId);
      setPhotoDataUrl(null);
      triggerRefresh();
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : 'Failed to delete photo');
    } finally {
      setPhotoUploading(false);
    }
  };

  const handleArchive = async () => {
    if (!client || !canManageClient || isReadOnly) return;
    setArchiving(true);
    setErrorMsg(null);
    try {
      await repos.client.archive({ currentUser }, client.id);
      triggerRefresh();
      onDeleted();
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : 'Failed to archive client');
      setArchiving(false);
    }
  };

  const handleReopenTask = async (task: TaskRecord) => {
    if ((!canCompleteTasks && !canAssignTasks) || isReadOnly) return;
    try {
      await repos.task.update({ currentUser }, task.id, {
        status: 'pending',
        completedAt: null,
      });
      triggerRefresh();
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : 'Failed to reopen task');
    }
  };

  if (loading && !client) {
    return (
      <div className="p-8 text-center text-slate-400 text-sm">
        {t('common.loading')}
      </div>
    );
  }

  if (!client) {
    return (
      <div className="bg-white rounded-2xl border border-slate-200 p-8 text-center space-y-4">
        <h3 className="text-base font-bold text-slate-900">
          {errorMsg || 'Client not found'}
        </h3>
        <button
          onClick={onBack}
          className="px-4 py-2 bg-slate-900 text-white text-xs font-semibold rounded-lg"
        >
          {t('common.back')}
        </button>
      </div>
    );
  }

  // Cases grouped into 3 distinct sections
  const ongoingCases = cases.filter((c) => c.status === 'ongoing');
  const pendingCases = cases.filter((c) => c.status === 'pending');
  const closedCases = cases.filter((c) => c.status === 'closed');

  const tabDefinitions: Array<{
    id: ClientProfileTab;
    label: string;
    count: number;
    icon: React.FC<{ className?: string }>;
  }> = [
    {
      id: 'cases',
      label: t('clients.linkedCases', 'Cases'),
      count: cases.length,
      icon: Briefcase,
    },
    ...(canViewAppointments
      ? [
          {
            id: 'appointments' as ClientProfileTab,
            label: t('nav.appointments', 'Appointments'),
            count: appointments.length,
            icon: Clock,
          },
        ]
      : []),
    {
      id: 'tasks',
      label: t('clients.linkedTasks', 'Tasks'),
      count: tasks.length,
      icon: CheckSquare,
    },
    {
      id: 'files',
      label: t('clients.linkedFiles', 'Files'),
      count: files.length,
      icon: FolderArchive,
    },
    ...(can('accounts.view')
      ? [
          {
            id: 'billing' as ClientProfileTab,
            label: t('nav.billing', 'Billing'),
            count: 0,
            icon: CreditCard,
          },
        ]
      : []),
  ];

  return (
    <div className="space-y-5 min-w-0" data-testid="client-profile-hub">
      <Breadcrumbs
        fallbackPath="/clients"
        onBackOverride={onBack}
        items={[
          { label: t('nav.clients'), href: '/clients' },
          { label: client.name, href: `/clients/${encodeURIComponent(client.id)}` },
          {
            label:
              tabDefinitions.find((td) => td.id === activeTab)?.label ||
              t('clients.linkedCases', 'Cases'),
          },
        ]}
      />

      {isReadOnly && (
        <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-amber-800 text-xs flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 shrink-0 text-amber-600" />
          <span>{t('subscription.readOnlyMessage')}</span>
        </div>
      )}

      {errorMsg && (
        <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-rose-700 text-xs flex items-center justify-between gap-2">
          <span>{errorMsg}</span>
          <button onClick={() => setErrorMsg(null)} className="text-rose-500 hover:text-rose-800">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* 1. CLIENT PROFILE HEADER CARD */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
        <div className="p-5 sm:p-7 bg-slate-900 text-white">
          <div className="flex flex-col sm:flex-row items-start justify-between gap-5">
            <div className="flex flex-col sm:flex-row items-start gap-5 min-w-0 w-full sm:w-auto">
              {/* Photo & Avatar with Upload / Camera Controls */}
              <div className="relative group shrink-0 flex flex-col items-center">
                <ClientAvatar
                  clientId={client.id}
                  photoUrl={photoDataUrl}
                  name={client.name}
                  nameBn={client.nameBn}
                  size="xl"
                  context={{ currentUser }}
                />

                {canManageClient && !isReadOnly && (
                  <div className="mt-2.5 flex items-center justify-center gap-1.5 flex-wrap">
                    <button
                      type="button"
                      title="Upload photo from files"
                      onClick={() => fileInputRef.current?.click()}
                      disabled={photoUploading}
                      className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 text-[11px] inline-flex items-center gap-1 shadow-xs transition"
                    >
                      <Upload className="w-3.5 h-3.5 text-amber-400" />
                      <span className="hidden sm:inline">{t('clients.upload', 'Upload')}</span>
                    </button>
                    <button
                      type="button"
                      title="Take photo with camera"
                      onClick={() => cameraInputRef.current?.click()}
                      disabled={photoUploading}
                      className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 text-[11px] inline-flex items-center gap-1 shadow-xs transition"
                    >
                      <Camera className="w-3.5 h-3.5 text-amber-400" />
                      <span className="hidden sm:inline">{t('clients.camera', 'Camera')}</span>
                    </button>
                    {photoDataUrl && (
                      <button
                        type="button"
                        title="Remove photo"
                        onClick={handlePhotoDelete}
                        disabled={photoUploading}
                        className="p-1.5 rounded-lg bg-rose-950/70 hover:bg-rose-900 text-rose-300 border border-rose-800 text-[11px] inline-flex items-center shadow-xs transition"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                )}

                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) handlePhotoUpload(f);
                    e.target.value = '';
                  }}
                />
                <input
                  ref={cameraInputRef}
                  type="file"
                  accept="image/*"
                  capture="environment"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) handlePhotoUpload(f);
                    e.target.value = '';
                  }}
                />
              </div>

              {/* Large Name & Contact Lines (Stacked on Mobile, Horizontal on Desktop) */}
              <div className="min-w-0 space-y-3">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <h1 className="text-2xl sm:text-3xl lg:text-4xl font-extrabold tracking-tight text-white font-serif break-words">
                      {client.name}
                    </h1>
                    {client.archived && (
                      <span className="px-2.5 py-0.5 text-xs font-bold uppercase tracking-wider bg-amber-500/20 text-amber-300 border border-amber-500/30 rounded-full">
                        Archived
                      </span>
                    )}
                  </div>
                  {client.nameBn && (
                    <p className="text-base sm:text-lg text-slate-300 font-sans mt-0.5 font-medium">
                      {client.nameBn}
                    </p>
                  )}
                </div>

                <div className="flex flex-col sm:flex-row sm:flex-wrap items-start sm:items-center gap-y-2 gap-x-6 text-sm text-slate-200">
                  <a
                    href={`tel:${client.phone}`}
                    className="inline-flex items-center gap-2 text-amber-300 hover:text-amber-200 font-semibold tracking-wide transition group"
                    title={t('clients.tapToCall', 'Tap to call')}
                  >
                    <Phone className="w-4 h-4 text-amber-400 shrink-0 group-hover:scale-110 transition" />
                    <span>{client.phone}</span>
                  </a>
                  {client.email && (
                    <a
                      href={`mailto:${client.email}`}
                      className="inline-flex items-center gap-2 text-sky-300 hover:text-sky-200 font-medium transition group"
                      title={t('clients.tapToEmail', 'Tap to email')}
                    >
                      <Mail className="w-4 h-4 text-sky-400 shrink-0 group-hover:scale-110 transition" />
                      <span>{client.email}</span>
                    </a>
                  )}
                  {client.address && (
                    <div className="inline-flex items-center gap-2 text-slate-300 font-medium">
                      <MapPin className="w-4 h-4 text-rose-400 shrink-0" />
                      <span>{client.address}</span>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Header Action Buttons */}
            {canManageClient && (
              <div className="flex flex-wrap items-center gap-2 shrink-0 self-start sm:self-auto">
                <button
                  type="button"
                  data-testid="client-header-edit-btn"
                  disabled={isReadOnly}
                  onClick={() => onEdit(client)}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-white/10 hover:bg-white/20 text-white text-xs font-semibold rounded-xl transition disabled:opacity-40 min-h-[38px]"
                >
                  <Edit2 className="w-3.5 h-3.5" />
                  <span>{t('common.edit')}</span>
                </button>

                {!client.archived && !confirmArchive && (
                  <button
                    type="button"
                    data-testid="client-header-archive-btn"
                    disabled={isReadOnly}
                    onClick={() => setConfirmArchive(true)}
                    className="inline-flex items-center gap-1.5 px-3 py-2 bg-amber-500/20 hover:bg-amber-500/30 text-amber-200 text-xs font-semibold rounded-xl border border-amber-500/30 transition disabled:opacity-40 min-h-[38px]"
                  >
                    <Archive className="w-3.5 h-3.5" />
                    <span>{t('common.archive', 'Archive')}</span>
                  </button>
                )}

                {confirmArchive && (
                  <div className="flex items-center gap-2 bg-amber-950/90 border border-amber-500/40 px-3 py-1.5 rounded-xl">
                    <span className="text-xs text-amber-200 font-medium">
                      {t('clients.confirmDeleteTitle')}
                    </span>
                    <button
                      type="button"
                      disabled={archiving || isReadOnly}
                      onClick={handleArchive}
                      className="px-2.5 py-1 bg-amber-600 hover:bg-amber-500 text-white text-xs font-bold rounded-lg"
                    >
                      {archiving ? '...' : t('common.yes')}
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfirmArchive(false)}
                      className="px-2 py-1 text-slate-300 hover:text-white text-xs"
                    >
                      {t('common.no')}
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* 2. NOTES PANEL UNDER HEADER */}
      <ClientNotesPanel
        clientId={client.id}
        canEdit={canManageClient}
        isReadOnly={isReadOnly}
      />

      {/* 3. LINKED RECORDS TAB CONTAINER */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
        {/* Tab Bar */}
        <div
          role="tablist"
          aria-label="Client profile tabs"
          className="flex items-center gap-1 px-3 sm:px-6 bg-slate-50 border-b border-slate-200 overflow-x-auto no-scrollbar"
        >
          {tabDefinitions.map((tab) => {
            const Icon = tab.icon;
            const isSelected = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                role="tab"
                type="button"
                aria-selected={isSelected}
                data-testid={`client-tab-${tab.id}`}
                onClick={() => openClientProfile(client.id, tab.id)}
                className={`inline-flex items-center gap-1.5 px-3 sm:px-4 py-3 text-xs sm:text-sm font-semibold border-b-2 transition whitespace-nowrap shrink-0 min-h-[44px] ${
                  isSelected
                    ? 'border-slate-900 text-slate-900 bg-white/60'
                    : 'border-transparent text-slate-500 hover:text-slate-800 hover:border-slate-300'
                }`}
              >
                <Icon className="w-4 h-4 shrink-0" />
                <span>{tab.label}</span>
                <span
                  className={`px-1.5 py-0.5 text-[10px] rounded-full font-bold ${
                    isSelected ? 'bg-slate-900 text-white' : 'bg-slate-200/80 text-slate-600'
                  }`}
                >
                  {tab.count}
                </span>
              </button>
            );
          })}
        </div>

        {/* TAB 1: CASES (Grouped into Current, Pending, Previous) */}
        {activeTab === 'cases' && (
          <div className="p-4 sm:p-6 space-y-6" data-testid="client-panel-cases">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-3">
              <div>
                <h3 className="text-sm font-bold text-slate-900">
                  {t('clients.linkedCases')} ({cases.length})
                </h3>
                <p className="text-xs text-slate-500">{t('cases.subtitle')}</p>
              </div>
              {canCreateCase && (
                <button
                  type="button"
                  data-testid="client-add-case-btn"
                  disabled={isReadOnly}
                  onClick={() =>
                    openCaseForm({
                      defaultClientId: client.id,
                      lockClientId: true,
                    })
                  }
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold rounded-xl shadow-2xs transition disabled:opacity-40 min-h-[38px]"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>{t('cases.addCase')}</span>
                </button>
              )}
            </div>

            {cases.length === 0 ? (
              <div className="p-8 text-center bg-slate-50 rounded-xl border border-slate-200/80 text-slate-500 text-xs">
                {t('clients.noLinkedRecords')}
              </div>
            ) : (
              <div className="space-y-6">
                {/* 1. CURRENT (ONGOING) CASES */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <h4 className="text-xs font-bold uppercase tracking-wider text-emerald-800 flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-full bg-emerald-500 inline-block" />
                      {t('cases.currentCases', 'Current (Ongoing)')}
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800 ml-1">
                        {ongoingCases.length}
                      </span>
                    </h4>
                  </div>
                  {ongoingCases.length === 0 ? (
                    <div className="p-3 text-xs text-slate-400 bg-slate-50 rounded-lg italic">
                      {t('cases.noOngoingCases', 'No active ongoing cases.')}
                    </div>
                  ) : (
                    <div className="space-y-2.5">
                      {ongoingCases.map((c) => (
                        <ClientCaseRow
                          key={c.id}
                          caseItem={c}
                          canEditCase={canEditCase}
                          isReadOnly={isReadOnly}
                          onEdit={openCaseForm}
                        />
                      ))}
                    </div>
                  )}
                </div>

                {/* 2. PENDING CASES */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <h4 className="text-xs font-bold uppercase tracking-wider text-amber-800 flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-full bg-amber-500 inline-block" />
                      {t('cases.pendingCases', 'Pending')}
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-800 ml-1">
                        {pendingCases.length}
                      </span>
                    </h4>
                  </div>
                  {pendingCases.length === 0 ? (
                    <div className="p-3 text-xs text-slate-400 bg-slate-50 rounded-lg italic">
                      {t('cases.noPendingCases', 'No pending cases.')}
                    </div>
                  ) : (
                    <div className="space-y-2.5">
                      {pendingCases.map((c) => (
                        <ClientCaseRow
                          key={c.id}
                          caseItem={c}
                          canEditCase={canEditCase}
                          isReadOnly={isReadOnly}
                          onEdit={openCaseForm}
                        />
                      ))}
                    </div>
                  )}
                </div>

                {/* 3. PREVIOUS (CLOSED) CASES */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <h4 className="text-xs font-bold uppercase tracking-wider text-slate-700 flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-full bg-slate-400 inline-block" />
                      {t('cases.previousCases', 'Previous (Closed)')}
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-200 text-slate-700 ml-1">
                        {closedCases.length}
                      </span>
                    </h4>
                  </div>
                  {closedCases.length === 0 ? (
                    <div className="p-3 text-xs text-slate-400 bg-slate-50 rounded-lg italic">
                      {t('cases.noClosedCases', 'No closed cases.')}
                    </div>
                  ) : (
                    <div className="space-y-2.5">
                      {closedCases.map((c) => (
                        <ClientCaseRow
                          key={c.id}
                          caseItem={c}
                          canEditCase={canEditCase}
                          isReadOnly={isReadOnly}
                          onEdit={openCaseForm}
                        />
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        {/* TAB 2: APPOINTMENTS */}
        {activeTab === 'appointments' && (
          <div className="p-4 sm:p-6 space-y-4" data-testid="client-panel-appointments">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h3 className="text-sm font-bold text-slate-900">
                  {t('nav.appointments', 'Appointments')} ({appointments.length})
                </h3>
                <p className="text-xs text-slate-500">
                  {t('appointments.subtitle', 'Scheduled consultations, client meetings and site visits')}
                </p>
              </div>
              {canManageAppointments && (
                <button
                  type="button"
                  data-testid="client-add-appointment-btn"
                  disabled={isReadOnly}
                  onClick={() => navigateToScreen('appointments')}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold rounded-xl shadow-2xs transition disabled:opacity-40 min-h-[38px]"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>{t('appointments.scheduleAppointment', 'Schedule Appointment')}</span>
                </button>
              )}
            </div>

            {appointments.length === 0 ? (
              <div className="p-8 text-center bg-slate-50 rounded-xl border border-slate-200/80 text-slate-500 text-xs">
                {t('appointments.noAppointmentsFound', 'No appointments recorded for this client.')}
              </div>
            ) : (
              <div className="space-y-3">
                {appointments.map((appt) => (
                  <div
                    key={appt.id}
                    data-testid={`client-appointment-${appt.id}`}
                    className="p-4 rounded-xl bg-slate-50 border border-slate-200/80 flex flex-wrap items-start justify-between gap-3"
                  >
                    <div className="space-y-1 min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-bold text-sm text-slate-900">{appt.title}</span>
                        <span
                          className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${
                            appt.status === 'scheduled'
                              ? 'bg-blue-100 text-blue-800'
                              : appt.status === 'completed'
                              ? 'bg-emerald-100 text-emerald-800'
                              : 'bg-slate-200 text-slate-700'
                          }`}
                        >
                          {appt.status}
                        </span>
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-slate-200 text-slate-700">
                          {appt.type.replace('_', ' ')}
                        </span>
                      </div>
                      <div className="flex flex-wrap items-center gap-3 text-xs text-slate-500 mt-1">
                        <span className="inline-flex items-center gap-1 font-medium text-slate-700">
                          <Clock className="w-3.5 h-3.5 text-amber-700" />
                          {new Date(appt.startsAt).toLocaleString([], {
                            dateStyle: 'medium',
                            timeStyle: 'short',
                          })}
                        </span>
                        {appt.location && (
                          <span className="inline-flex items-center gap-1">
                            <MapPin className="w-3 h-3 text-slate-400" />
                            {appt.location}
                          </span>
                        )}
                        <span className="capitalize">{appt.mode.replace('_', ' ')}</span>
                      </div>
                      {appt.notes && (
                        <p className="text-xs text-slate-600 mt-1 italic">{appt.notes}</p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* TAB 3: TASKS */}
        {activeTab === 'tasks' && (
          <div className="p-4 sm:p-6 space-y-4" data-testid="client-panel-tasks">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h3 className="text-sm font-bold text-slate-900">
                  {t('clients.linkedTasks')} ({tasks.length})
                </h3>
                <p className="text-xs text-slate-500">{t('tasks.subtitle')}</p>
              </div>
              {canAssignTasks && (
                <button
                  type="button"
                  data-testid="client-add-task-btn"
                  disabled={isReadOnly}
                  onClick={() =>
                    openTaskForm({
                      defaultClientId: client.id,
                      lockClientOnly: true,
                    })
                  }
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold rounded-xl shadow-2xs transition disabled:opacity-40 min-h-[38px]"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>{t('tasks.addTask')}</span>
                </button>
              )}
            </div>

            {tasks.length === 0 ? (
              <div className="p-8 text-center bg-slate-50 rounded-xl border border-slate-200/80 text-slate-500 text-xs">
                {t('tasks.noTasksFound')}
              </div>
            ) : (
              <div className="space-y-3">
                {tasks.map((task) => {
                  const isCompleted = task.status === 'completed';
                  return (
                    <div
                      key={task.id}
                      data-testid={`client-task-row-${task.id}`}
                      className="p-4 rounded-xl bg-slate-50 border border-slate-200/80 flex flex-wrap items-start justify-between gap-3"
                    >
                      <div className="space-y-1 min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span
                            className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${
                              task.priority === 'urgent' || task.priority === 'high'
                                ? 'bg-rose-100 text-rose-800'
                                : 'bg-slate-200 text-slate-700'
                            }`}
                          >
                            {t(`tasks.${task.priority}`)}
                          </span>
                          <span className="text-xs text-slate-500">
                            {new Date(task.dueAt).toLocaleDateString()}
                          </span>
                        </div>
                        <div
                          className={`text-sm font-semibold break-words ${
                            isCompleted ? 'line-through text-slate-400' : 'text-slate-900'
                          }`}
                        >
                          {task.title}
                        </div>
                        <div className="text-xs text-slate-500">
                          {t('tasks.assignedTo')}: {task.assignedToName}
                        </div>
                      </div>

                      <div className="flex flex-wrap items-center gap-1.5">
                        {canAssignTasks && (
                          <button
                            type="button"
                            disabled={isReadOnly}
                            onClick={() => openTaskForm({ initialData: task })}
                            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-white border border-slate-200 hover:bg-slate-100 text-slate-700 text-xs font-semibold disabled:opacity-40 min-h-[34px]"
                          >
                            <Edit2 className="w-3 h-3" />
                            <span>{t('common.edit')}</span>
                          </button>
                        )}
                        {canAssignTasks && !isCompleted && (
                          <button
                            type="button"
                            disabled={isReadOnly}
                            onClick={() => openTaskReassign(task)}
                            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-white border border-slate-200 hover:bg-slate-100 text-slate-700 text-xs font-semibold disabled:opacity-40 min-h-[34px]"
                          >
                            <UserPlus className="w-3.5 h-3.5 text-indigo-600" />
                            <span>{t('tasks.reassignTask')}</span>
                          </button>
                        )}
                        {canCompleteTasks && !isCompleted && (
                          <button
                            type="button"
                            disabled={isReadOnly}
                            onClick={() => openTaskComplete(task)}
                            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold disabled:opacity-40 min-h-[34px]"
                          >
                            <CheckCircle2 className="w-3.5 h-3.5" />
                            <span>{t('tasks.completeTask')}</span>
                          </button>
                        )}
                        {(canCompleteTasks || canAssignTasks) && isCompleted && (
                          <button
                            type="button"
                            disabled={isReadOnly}
                            onClick={() => handleReopenTask(task)}
                            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-white border border-slate-200 hover:bg-slate-100 text-slate-700 text-xs font-semibold disabled:opacity-40 min-h-[34px]"
                          >
                            <RotateCcw className="w-3.5 h-3.5 text-amber-600" />
                            <span>{t('hub.reopenTask', 'Reopen')}</span>
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* TAB 4: FILES */}
        {activeTab === 'billing' && can('accounts.view') && (
          <div className="pt-2">
            <BillingTab clientId={client.id} />
          </div>
        )}

        {activeTab === 'files' && (
          <div className="p-4 sm:p-6 space-y-4" data-testid="client-panel-files">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h3 className="text-sm font-bold text-slate-900">
                  {t('clients.linkedFiles')} ({files.length})
                </h3>
                <p className="text-xs text-slate-500">{t('files.subtitle')}</p>
              </div>
              {canManageFiles && (
                <button
                  type="button"
                  data-testid="client-add-file-btn"
                  disabled={isReadOnly}
                  onClick={() =>
                    openFileForm({
                      defaultClientId: client.id,
                      lockClientOnly: true,
                    })
                  }
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold rounded-xl shadow-2xs transition disabled:opacity-40 min-h-[38px]"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>{t('files.addFile')}</span>
                </button>
              )}
            </div>

            {files.length === 0 ? (
              <div className="p-8 text-center bg-slate-50 rounded-xl border border-slate-200/80 text-slate-500 text-xs">
                {t('files.noFilesFound')}
              </div>
            ) : (
              <div className="space-y-3">
                {files.map((file) => {
                  const isInChamber = file.status === 'in_chamber';
                  return (
                    <div
                      key={file.id}
                      data-testid={`client-file-row-${file.id}`}
                      className="p-4 rounded-xl bg-slate-50 border border-slate-200/80 flex flex-wrap items-start justify-between gap-3"
                    >
                      <div className="space-y-1 min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="px-2 py-0.5 rounded-md bg-slate-900 text-white font-mono text-xs font-bold">
                            {file.serial}
                          </span>
                          <span
                            className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${
                              isInChamber
                                ? 'bg-emerald-100 text-emerald-800'
                                : 'bg-amber-100 text-amber-800'
                            }`}
                          >
                            {t(`files.${file.status}`)}
                          </span>
                        </div>
                        <div className="text-sm font-semibold text-slate-900 break-words">
                          {file.title}
                        </div>
                        <div className="text-xs text-slate-500">
                          {t('files.shelfLocation')}: {file.shelfLocation || '—'}
                        </div>
                      </div>

                      <div className="flex flex-wrap items-center gap-1.5">
                        {canManageFiles && isInChamber && (
                          <button
                            type="button"
                            disabled={isReadOnly}
                            onClick={() => openFileCheckOut(file)}
                            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-500 text-white text-xs font-semibold disabled:opacity-40 min-h-[34px]"
                          >
                            <LogOut className="w-3.5 h-3.5" />
                            <span>{t('files.checkOut')}</span>
                          </button>
                        )}
                        {canManageFiles && !isInChamber && (
                          <button
                            type="button"
                            disabled={isReadOnly}
                            onClick={() => openFileCheckIn(file)}
                            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold disabled:opacity-40 min-h-[34px]"
                          >
                            <LogIn className="w-3.5 h-3.5" />
                            <span>{t('files.checkIn')}</span>
                          </button>
                        )}
                        {canManageFiles && (
                          <button
                            type="button"
                            disabled={isReadOnly}
                            onClick={() => openFileForm({ initialData: file })}
                            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-white border border-slate-200 hover:bg-slate-100 text-slate-700 text-xs font-semibold disabled:opacity-40 min-h-[34px]"
                          >
                            <Edit2 className="w-3 h-3" />
                            <span>{t('common.edit')}</span>
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => openFileHistory(file)}
                          className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-white border border-slate-200 hover:bg-slate-100 text-slate-600 text-xs font-semibold min-h-[34px]"
                        >
                          <History className="w-3.5 h-3.5" />
                          <span>{t('files.movementHistory')}</span>
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

interface ClientCaseRowProps {
  caseItem: CaseRecord;
  canEditCase: boolean;
  isReadOnly: boolean;
  onEdit: (params: { initialData: CaseRecord }) => void;
}

const ClientCaseRow: React.FC<ClientCaseRowProps> = ({
  caseItem,
  canEditCase,
  isReadOnly,
  onEdit,
}) => {
  const { t } = useTranslation();
  const partyTitle = formatCasePartyTitle(caseItem);

  return (
    <div
      data-testid={`client-case-row-${caseItem.id}`}
      className="p-4 rounded-xl bg-slate-50 border border-slate-200/80 flex flex-wrap items-center justify-between gap-3 hover:bg-slate-100/60 transition"
    >
      <div className="space-y-1 min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <EntityLink
            type="case"
            id={caseItem.id}
            label={caseItem.caseNumber}
            restricted={caseItem.restricted}
            className="text-sm font-bold text-slate-900"
          />
          {caseItem.restricted && (
            <span className="inline-flex items-center gap-0.5 text-[10px] px-1.5 py-0.5 rounded font-bold bg-amber-100 text-amber-900 border border-amber-300">
              <Lock className="w-3 h-3" /> {t('cases.restrictedBadge')}
            </span>
          )}
          <span
            className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${
              caseItem.status === 'ongoing'
                ? 'bg-emerald-100 text-emerald-800'
                : caseItem.status === 'pending'
                ? 'bg-amber-100 text-amber-800'
                : 'bg-slate-200 text-slate-700'
            }`}
          >
            {caseItem.status}
          </span>
          {caseItem.caseDate && (
            <span className="text-xs text-slate-500 font-medium">
              ({caseItem.caseDate})
            </span>
          )}
        </div>
        <div className="text-xs font-semibold text-slate-800 break-words">
          {partyTitle}
        </div>
        <div className="text-xs text-slate-600">{caseItem.court} • {caseItem.matterType}</div>
        {caseItem.latestNote && (
          <div className="text-xs text-amber-900 bg-amber-50/70 p-2 rounded-lg border border-amber-200/60 mt-1 line-clamp-2">
            <span className="font-semibold text-amber-800">{caseItem.latestNote.noteDate}: </span>
            {caseItem.latestNote.body}
          </div>
        )}
      </div>

      <div className="flex items-center gap-2">
        {canEditCase && (
          <button
            type="button"
            disabled={isReadOnly}
            onClick={() => onEdit({ initialData: caseItem })}
            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-white border border-slate-200 hover:bg-slate-100 text-slate-700 text-xs font-semibold disabled:opacity-40 min-h-[34px]"
          >
            <Edit2 className="w-3 h-3" />
            <span>{t('common.edit')}</span>
          </button>
        )}
        <EntityLink
          type="case"
          id={caseItem.id}
          label={t('cases.viewDetails')}
          restricted={caseItem.restricted}
          className="px-3 py-1.5 rounded-lg bg-indigo-50 hover:bg-indigo-100 text-indigo-700 text-xs font-semibold min-h-[34px]"
        />
      </div>
    </div>
  );
};
