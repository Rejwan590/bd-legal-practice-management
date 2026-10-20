import React, { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../foundation/AuthContext';
import { useNavigation } from '../foundation/NavigationContext';
import { getRepositories } from '../../data/repositories';
import {
  AppointmentRecord,
  AppointmentType,
  AppointmentStatus,
  ClientRecord,
  CaseRecord,
  UserRecord,
} from '../../data/types';
import { ResponsiveTable } from '../../components/responsive/ResponsiveTable';
import { EntityLink } from '../../components/EntityLink';
import { ClientAvatar } from '../../components/ClientAvatar';
import { AppointmentFormModal } from './AppointmentFormModal';
import {
  Calendar,
  Clock,
  Plus,
  Search,
  Filter,
  MapPin,
  CheckCircle2,
  XCircle,
  RotateCcw,
  Edit2,
  Trash2,
  Users,
  Briefcase,
  AlertCircle,
  Lock,
  ChevronRight,
  Video,
  Phone,
} from 'lucide-react';

export const AppointmentsScreen: React.FC = () => {
  const { t } = useTranslation();
  const { currentUser, can, isReadOnly } = useAuth();
  const { refreshVersion, triggerRefresh } = useNavigation();
  const repos = getRepositories();

  const canView = can('appointments.view');
  const canManage = can('appointments.manage');

  const [appointments, setAppointments] = useState<AppointmentRecord[]>([]);
  const [clientsMap, setClientsMap] = useState<Record<string, ClientRecord>>({});
  const [casesMap, setCasesMap] = useState<Record<string, CaseRecord>>({});
  const [usersMap, setUsersMap] = useState<Record<string, UserRecord>>({});
  const [loading, setLoading] = useState(true);

  // Filters
  const [activeRangeTab, setActiveRangeTab] = useState<'upcoming' | 'past' | 'all'>('upcoming');
  const [statusFilter, setStatusFilter] = useState<AppointmentStatus | 'all'>('all');
  const [typeFilter, setTypeFilter] = useState<AppointmentType | 'all'>('all');
  const [searchQuery, setSearchQuery] = useState('');

  // Modals
  const [modalOpen, setModalOpen] = useState(false);
  const [editingAppointment, setEditingAppointment] = useState<AppointmentRecord | null>(null);

  // Delete confirm
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);

  // Messages
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    if (!canView) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setErrorMsg(null);
    try {
      const [appts, cls, cs, us] = await Promise.all([
        repos.appointment.list(
          { currentUser },
          {
            range: activeRangeTab,
            status: statusFilter,
            type: typeFilter,
            search: searchQuery,
          }
        ),
        repos.client.list({ currentUser }).catch(() => []),
        repos.case.list({ currentUser }).catch(() => []),
        repos.user.list({ currentUser }).catch(() => []),
      ]);

      setAppointments(appts);

      const cmap: Record<string, ClientRecord> = {};
      cls.forEach((c) => {
        cmap[c.id] = c;
      });
      setClientsMap(cmap);

      const csmap: Record<string, CaseRecord> = {};
      cs.forEach((c) => {
        csmap[c.id] = c;
      });
      setCasesMap(csmap);

      const umap: Record<string, UserRecord> = {};
      us.forEach((u) => {
        umap[u.id] = u;
      });
      setUsersMap(umap);
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : 'Failed to load appointments');
    } finally {
      setLoading(false);
    }
  }, [canView, currentUser, repos, activeRangeTab, statusFilter, typeFilter, searchQuery]);

  useEffect(() => {
    loadData();
  }, [loadData, refreshVersion]);

  const handleMarkStatus = async (appt: AppointmentRecord, newStatus: AppointmentStatus) => {
    if (!canManage || isReadOnly) return;
    try {
      await repos.appointment.update({ currentUser }, appt.id, { status: newStatus });
      triggerRefresh();
      setSuccessMsg(t('appointments.statusUpdated', 'Appointment status updated.'));
      setTimeout(() => setSuccessMsg(null), 3000);
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : 'Failed to update status');
    }
  };

  const handleDelete = async (id: string) => {
    if (!canManage || isReadOnly) return;
    setDeleteBusy(true);
    try {
      await repos.appointment.delete({ currentUser }, id);
      setDeletingId(null);
      triggerRefresh();
      setSuccessMsg(t('appointments.deleted', 'Appointment deleted.'));
      setTimeout(() => setSuccessMsg(null), 3000);
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : 'Failed to delete appointment');
    } finally {
      setDeleteBusy(false);
    }
  };

  if (!canView) {
    return (
      <div className="max-w-4xl mx-auto p-6">
        <div className="bg-amber-50 border border-amber-200 rounded-2xl p-8 text-center text-amber-900 shadow-sm">
          <Lock className="w-12 h-12 mx-auto text-amber-600 mb-3" />
          <h2 className="text-xl font-bold mb-2">{t('nav.appointments', 'Appointments')}</h2>
          <p className="text-amber-700 max-w-md mx-auto mb-4">
            Permission required: appointments.view (Current role: {currentUser.role})
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-7xl mx-auto w-full">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200 pb-5">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
            <Calendar className="w-6 h-6 text-slate-700" />
            {t('nav.appointments', 'Appointments')}
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            {t('appointments.subtitle', 'Schedule and track consultations, client meetings, and chamber visits')}
          </p>
        </div>

        {isReadOnly ? (
          <span className="flex items-center gap-1.5 px-3 py-1.5 bg-rose-50 text-rose-700 rounded-lg text-xs font-semibold border border-rose-200">
            <Lock className="w-3.5 h-3.5" /> {t('common.readOnlyMode')}
          </span>
        ) : canManage ? (
          <button
            onClick={() => {
              setEditingAppointment(null);
              setModalOpen(true);
            }}
            className="min-h-[44px] inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-slate-900 hover:bg-slate-800 text-white text-sm font-semibold rounded-xl shadow-xs transition"
          >
            <Plus className="w-4 h-4" />
            {t('appointments.scheduleAppointment', 'Schedule Appointment')}
          </button>
        ) : (
          <span className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 text-slate-500 rounded-lg text-xs font-medium border border-slate-200">
            <Lock className="w-3.5 h-3.5" /> {t('common.readOnlyStaff')}
          </span>
        )}
      </div>

      {successMsg && (
        <div className="flex items-center gap-2 p-4 bg-emerald-50 border border-emerald-200 rounded-xl text-emerald-800 text-sm">
          <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
          <span>{successMsg}</span>
        </div>
      )}

      {errorMsg && (
        <div className="flex items-center gap-2 p-4 bg-rose-50 border border-rose-200 rounded-xl text-rose-800 text-sm">
          <AlertCircle className="w-5 h-5 text-rose-600 shrink-0" />
          <span>{errorMsg}</span>
        </div>
      )}

      {/* Tabs & Search & Filters */}
      <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs space-y-4">
        {/* Range Tabs: Upcoming / Past / All */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-3">
          <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl">
            {(['upcoming', 'past', 'all'] as const).map((range) => (
              <button
                key={range}
                type="button"
                data-testid={`appointment-range-${range}`}
                onClick={() => setActiveRangeTab(range)}
                className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold capitalize transition ${
                  activeRangeTab === range
                    ? 'bg-white text-slate-900 shadow-xs font-bold'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {t(`appointments.tab_${range}`, range)}
              </button>
            ))}
          </div>

          <div className="text-xs font-semibold text-slate-500 px-3 py-1.5 bg-slate-100 rounded-lg shrink-0">
            {t('appointments.total', 'Total')}: {appointments.length}
          </div>
        </div>

        {/* Search & Dropdown Filters */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-3.5" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={t('appointments.searchPlaceholder', 'Search by title, location, notes...')}
              className="w-full min-h-[44px] pl-9 pr-4 py-2 bg-slate-50 border border-slate-300 rounded-lg text-sm text-slate-900 focus:ring-2 focus:ring-slate-500 focus:outline-hidden"
            />
          </div>

          <div>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as AppointmentStatus | 'all')}
              className="w-full min-h-[44px] bg-slate-50 border border-slate-300 text-slate-800 text-xs rounded-lg p-2.5 focus:ring-2 focus:ring-slate-500 focus:outline-hidden font-medium"
            >
              <option value="all">{t('appointments.allStatuses', 'All Statuses')}</option>
              <option value="scheduled">{t('appointments.statusScheduled', 'Scheduled')}</option>
              <option value="completed">{t('appointments.statusCompleted', 'Completed')}</option>
              <option value="cancelled">{t('appointments.statusCancelled', 'Cancelled')}</option>
              <option value="no_show">{t('appointments.statusNoShow', 'No Show')}</option>
            </select>
          </div>

          <div>
            <select
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value as AppointmentType | 'all')}
              className="w-full min-h-[44px] bg-slate-50 border border-slate-300 text-slate-800 text-xs rounded-lg p-2.5 focus:ring-2 focus:ring-slate-500 focus:outline-hidden font-medium"
            >
              <option value="all">{t('appointments.allTypes', 'All Types')}</option>
              <option value="client_meeting">{t('appointments.typeClientMeeting', 'Client Meeting')}</option>
              <option value="consultation">{t('appointments.typeConsultation', 'Consultation')}</option>
              <option value="phone_call">{t('appointments.typePhoneCall', 'Phone Call')}</option>
              <option value="internal_meeting">{t('appointments.typeInternalMeeting', 'Internal Meeting')}</option>
              <option value="court_visit">{t('appointments.typeCourtVisit', 'Court Visit')}</option>
              <option value="other">{t('appointments.typeOther', 'Other')}</option>
            </select>
          </div>
        </div>
      </div>

      {/* Appointments List */}
      {loading ? (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-xs p-12 text-center text-slate-400 text-sm">
          {t('common.loading')}
        </div>
      ) : appointments.length === 0 ? (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-xs p-12 text-center space-y-3">
          <Calendar className="w-10 h-10 text-slate-300 mx-auto" />
          <p className="text-sm text-slate-500">
            {t('appointments.noAppointmentsFound', 'No appointments found for the selected criteria.')}
          </p>
          {canManage && !isReadOnly && (
            <button
              onClick={() => {
                setEditingAppointment(null);
                setModalOpen(true);
              }}
              className="min-h-[44px] inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-indigo-700 bg-indigo-50 hover:bg-indigo-100 rounded-lg transition"
            >
              <Plus className="w-3.5 h-3.5" />
              {t('appointments.scheduleAppointment', 'Schedule Appointment')}
            </button>
          )}
        </div>
      ) : (
        <ResponsiveTable<AppointmentRecord>
          data={appointments}
          keyExtractor={(a) => a.id}
          columns={[
            {
              header: t('appointments.dateTime', 'Date & Time'),
              className: 'whitespace-nowrap',
              accessor: (a) => {
                const start = new Date(a.startsAt);
                const end = new Date(a.endsAt);
                return (
                  <div className="space-y-0.5">
                    <div className="text-xs font-bold text-slate-900 flex items-center gap-1.5">
                      <Clock className="w-3.5 h-3.5 text-amber-600" />
                      <span>{start.toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' })}</span>
                    </div>
                    <div className="text-[11px] text-slate-500 pl-5">
                      {start.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} -{' '}
                      {end.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </div>
                  </div>
                );
              },
            },
            {
              header: t('appointments.appointmentDetails', 'Title & Type'),
              accessor: (a) => (
                <div className="space-y-1">
                  <div className="text-sm font-bold text-slate-900">{a.title}</div>
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span
                      className={`text-[10px] px-2 py-0.5 rounded-full font-bold uppercase ${
                        a.status === 'scheduled'
                          ? 'bg-blue-100 text-blue-800'
                          : a.status === 'completed'
                          ? 'bg-emerald-100 text-emerald-800'
                          : a.status === 'cancelled'
                          ? 'bg-rose-100 text-rose-800'
                          : 'bg-slate-200 text-slate-700'
                      }`}
                    >
                      {a.status}
                    </span>
                    <span className="text-[10px] px-2 py-0.5 rounded-full font-semibold bg-slate-100 text-slate-700 capitalize">
                      {a.type.replace('_', ' ')}
                    </span>
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-50 text-slate-500 border border-slate-200 flex items-center gap-1 capitalize">
                      {a.mode === 'video' ? <Video className="w-3 h-3 text-indigo-500" /> : a.mode === 'phone' ? <Phone className="w-3 h-3 text-emerald-500" /> : <MapPin className="w-3 h-3 text-slate-400" />}
                      {a.mode.replace('_', ' ')}
                    </span>
                  </div>
                  {a.location && (
                    <div className="text-xs text-slate-500 flex items-center gap-1">
                      <MapPin className="w-3 h-3 text-slate-400" />
                      <span>{a.location}</span>
                    </div>
                  )}
                  {a.notes && (
                    <p className="text-[11px] text-slate-500 italic line-clamp-1 max-w-sm">
                      {a.notes}
                    </p>
                  )}
                </div>
              ),
            },
            {
              header: t('appointments.linkedTo', 'Client / Case'),
              accessor: (a) => {
                const client = a.clientId ? clientsMap[a.clientId] : null;
                const caseItem = a.caseId ? casesMap[a.caseId] : null;

                if (!client && !caseItem) {
                  return <span className="text-xs text-slate-400">—</span>;
                }

                return (
                  <div className="space-y-1 text-xs">
                    {client && (
                      <div className="flex items-center gap-1.5">
                        <ClientAvatar clientId={client.id} clientName={client.name} size="xs" />
                        <EntityLink
                          type="client"
                          id={client.id}
                          label={client.name}
                          className="font-semibold block truncate"
                        />
                      </div>
                    )}
                    {caseItem && (
                      <div className="flex items-center gap-1 text-[11px] text-slate-600">
                        <Briefcase className="w-3 h-3 text-slate-400" />
                        <EntityLink
                          type="case"
                          id={caseItem.id}
                          label={caseItem.caseNumber}
                          restricted={caseItem.restricted}
                          className="truncate"
                        />
                      </div>
                    )}
                  </div>
                );
              },
            },
            {
              header: t('appointments.attendees', 'Attendees'),
              accessor: (a) => {
                const attIds = a.attendees || [];
                if (attIds.length === 0) {
                  return <span className="text-xs text-slate-400">—</span>;
                }
                const names = attIds
                  .map((id: string) => usersMap[id]?.name)
                  .filter(Boolean);
                return (
                  <div className="text-xs space-y-0.5 max-w-xs">
                    <div className="flex items-center gap-1 text-slate-700 font-medium truncate">
                      <Users className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                      <span className="truncate">{names.join(', ')}</span>
                    </div>
                  </div>
                );
              },
            },
            {
              header: '',
              className: 'text-right',
              accessor: (a) => (
                <div className="flex items-center justify-end gap-1.5" onClick={(e) => e.stopPropagation()}>
                  {canManage && !isReadOnly && (
                    <>
                      {a.status === 'scheduled' && (
                        <button
                          type="button"
                          title="Mark Completed"
                          onClick={() => handleMarkStatus(a, 'completed')}
                          className="p-1.5 rounded-lg bg-emerald-50 hover:bg-emerald-100 text-emerald-700 text-xs transition"
                        >
                          <CheckCircle2 className="w-4 h-4" />
                        </button>
                      )}

                      <button
                        type="button"
                        title="Edit / Reschedule"
                        onClick={() => {
                          setEditingAppointment(a);
                          setModalOpen(true);
                        }}
                        className="p-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs transition"
                      >
                        <Edit2 className="w-4 h-4" />
                      </button>

                      {deletingId !== a.id ? (
                        <button
                          type="button"
                          title="Delete appointment"
                          onClick={() => setDeletingId(a.id)}
                          className="p-1.5 rounded-lg bg-rose-50 hover:bg-rose-100 text-rose-600 text-xs transition"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      ) : (
                        <div className="flex items-center gap-1 bg-rose-950 p-1 rounded-lg">
                          <button
                            type="button"
                            disabled={deleteBusy}
                            onClick={() => handleDelete(a.id)}
                            className="px-2 py-0.5 bg-rose-600 text-white rounded text-[10px] font-bold"
                          >
                            {deleteBusy ? '...' : t('common.yes')}
                          </button>
                          <button
                            type="button"
                            onClick={() => setDeletingId(null)}
                            className="px-1 text-slate-300 text-[10px]"
                          >
                            {t('common.no')}
                          </button>
                        </div>
                      )}
                    </>
                  )}
                </div>
              ),
            },
          ]}
          renderMobileCard={(a) => {
            const client = a.clientId ? clientsMap[a.clientId] : null;
            const caseItem = a.caseId ? casesMap[a.caseId] : null;
            const start = new Date(a.startsAt);
            const end = new Date(a.endsAt);

            return (
              <div className="p-4 bg-white rounded-xl border border-slate-200 shadow-2xs space-y-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="space-y-1">
                    <span className="font-bold text-sm text-slate-900 block">{a.title}</span>
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span
                        className={`text-[10px] px-2 py-0.5 rounded-full font-bold uppercase ${
                          a.status === 'scheduled'
                            ? 'bg-blue-100 text-blue-800'
                            : a.status === 'completed'
                            ? 'bg-emerald-100 text-emerald-800'
                            : 'bg-slate-200 text-slate-700'
                        }`}
                      >
                        {a.status}
                      </span>
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-100 text-slate-600 capitalize">
                        {a.type.replace('_', ' ')}
                      </span>
                    </div>
                  </div>

                  <div className="text-right text-xs text-slate-500">
                    <div className="font-bold text-slate-800">
                      {start.toLocaleDateString([], { month: 'short', day: 'numeric' })}
                    </div>
                    <div className="text-[11px]">
                      {start.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </div>
                  </div>
                </div>

                {client && (
                  <div className="flex items-center gap-1.5 text-xs">
                    <ClientAvatar clientId={client.id} clientName={client.name} size="xs" />
                    <EntityLink type="client" id={client.id} label={client.name} className="font-medium" />
                  </div>
                )}

                {a.location && (
                  <div className="text-xs text-slate-500 flex items-center gap-1">
                    <MapPin className="w-3 h-3 text-slate-400" />
                    <span>{a.location}</span>
                  </div>
                )}

                {canManage && !isReadOnly && (
                  <div className="pt-2 border-t border-slate-100 flex items-center justify-end gap-2">
                    {a.status === 'scheduled' && (
                      <button
                        type="button"
                        onClick={() => handleMarkStatus(a, 'completed')}
                        className="px-2.5 py-1 rounded-lg bg-emerald-50 text-emerald-700 text-xs font-semibold flex items-center gap-1"
                      >
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        <span>{t('appointments.complete', 'Complete')}</span>
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => {
                        setEditingAppointment(a);
                        setModalOpen(true);
                      }}
                      className="px-2.5 py-1 rounded-lg bg-slate-100 text-slate-700 text-xs font-semibold flex items-center gap-1"
                    >
                      <Edit2 className="w-3.5 h-3.5" />
                      <span>{t('common.edit')}</span>
                    </button>
                  </div>
                )}
              </div>
            );
          }}
        />
      )}

      {/* Appointment Form Modal */}
      <AppointmentFormModal
        isOpen={modalOpen}
        initialData={editingAppointment}
        onClose={() => {
          setModalOpen(false);
          setEditingAppointment(null);
        }}
        onSaved={() => {
          triggerRefresh();
          setSuccessMsg(t('appointments.saved', 'Appointment saved successfully.'));
          setTimeout(() => setSuccessMsg(null), 3000);
        }}
      />
    </div>
  );
};
