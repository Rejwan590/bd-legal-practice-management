import React, { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../foundation/AuthContext';
import { useNavigation } from '../foundation/NavigationContext';
import { getRepositories } from '../../data/repositories';
import { ClientRecord } from '../../data/types';
import { ResponsiveTable } from '../../components/responsive/ResponsiveTable';
import { EntityLink } from '../../components/EntityLink';
import { ClientAvatar } from '../../components/ClientAvatar';
import { ClientFormModal } from './ClientFormModal';
import { ClientProfileView } from './ClientProfileView';
import {
  Users,
  Search,
  UserPlus,
  Phone,
  MapPin,
  ChevronRight,
  ShieldAlert,
  AlertCircle,
  CheckCircle2,
  Edit2,
  Lock,
} from 'lucide-react';

interface ClientsScreenProps {
  initialSelectedClientId?: string | null;
  onNavigateToCase?: (caseId: string) => void;
}

export const ClientsScreen: React.FC<ClientsScreenProps> = ({ initialSelectedClientId }) => {
  const { t } = useTranslation();
  const { currentUser, can, isReadOnly } = useAuth();
  const {
    route,
    openClientProfile,
    navigateToScreen,
    refreshVersion,
    triggerRefresh,
  } = useNavigation();

  const [clients, setClients] = useState<ClientRecord[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const [modalOpen, setModalOpen] = useState(false);
  const [editingClient, setEditingClient] = useState<ClientRecord | null>(null);

  const repos = getRepositories();
  const canView = can('clients.view');
  const canEdit = can('clients.edit');

  const activeClientId = route.clientId || initialSelectedClientId || null;

  const fetchClients = useCallback(async () => {
    if (!canView) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setErrorMsg(null);
    try {
      const data = await repos.client.list({ currentUser }, { search: searchQuery });
      setClients(data);
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : 'Failed to load clients');
    } finally {
      setLoading(false);
    }
  }, [canView, currentUser, searchQuery, repos]);

  useEffect(() => {
    fetchClients();
  }, [fetchClients, refreshVersion]);

  const handleSaveClient = async (formData: {
    name: string;
    nameBn?: string;
    phone: string;
    email?: string;
    address: string;
    notes: string;
  }) => {
    if (!canEdit) {
      setErrorMsg('Permission denied: clients.manage required');
      return;
    }

    if (editingClient) {
      await repos.client.update({ currentUser }, editingClient.id, formData);
      setSuccessMsg(t('clients.clientSaved'));
    } else {
      await repos.client.create({ currentUser }, formData);
      setSuccessMsg(t('clients.clientSaved'));
    }
    setEditingClient(null);
    triggerRefresh();
    setTimeout(() => setSuccessMsg(null), 3000);
  };

  if (!canView) {
    return (
      <div className="max-w-4xl mx-auto p-6">
        <div className="bg-amber-50 border border-amber-200 rounded-2xl p-8 text-center text-amber-900 shadow-sm">
          <ShieldAlert className="w-12 h-12 mx-auto text-amber-600 mb-3" />
          <h2 className="text-xl font-bold mb-2">{t('clients.title')}</h2>
          <p className="text-amber-700 max-w-md mx-auto mb-4">
            Permission required: clients.view (Current role: {currentUser.role})
          </p>
        </div>
      </div>
    );
  }

  // If a client is selected via URL route, render the 3-tab Client Profile Hub
  if (activeClientId) {
    return (
      <div className="max-w-7xl mx-auto w-full space-y-4">
        <ClientProfileView
          clientId={activeClientId}
          initialClient={clients.find((c) => c.id === activeClientId) || null}
          onBack={() => navigateToScreen('clients')}
          onEdit={(c) => {
            setEditingClient(c);
            setModalOpen(true);
          }}
          onDeleted={() => {
            navigateToScreen('clients');
            setSuccessMsg(t('clients.clientDeleted'));
            setTimeout(() => setSuccessMsg(null), 3000);
          }}
        />
        <ClientFormModal
          isOpen={modalOpen}
          initialData={editingClient}
          onClose={() => {
            setModalOpen(false);
            setEditingClient(null);
          }}
          onSave={handleSaveClient}
        />
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-7xl mx-auto w-full">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200 pb-5">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
            <Users className="w-6 h-6 text-slate-700" />
            {t('clients.title')}
          </h1>
          <p className="text-sm text-slate-500 mt-1">{t('clients.subtitle')}</p>
        </div>

        {isReadOnly ? (
          <span className="flex items-center gap-1.5 px-3 py-1.5 bg-rose-50 text-rose-700 rounded-lg text-xs font-semibold border border-rose-200">
            <Lock className="w-3.5 h-3.5" /> {t('common.readOnlyMode')}
          </span>
        ) : canEdit ? (
          <button
            onClick={() => {
              setEditingClient(null);
              setModalOpen(true);
            }}
            className="min-h-[44px] inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-slate-900 hover:bg-slate-800 text-white text-sm font-semibold rounded-xl shadow-xs transition"
          >
            <UserPlus className="w-4 h-4" />
            {t('clients.addClient')}
          </button>
        ) : (
          <span className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 text-slate-500 rounded-lg text-xs font-medium border border-slate-200">
            <Lock className="w-3.5 h-3.5" /> {t('common.readOnlyViewStaff')}
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

      {/* Search Bar & Total count */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
        <div className="relative flex-1">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-3.5" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={t('clients.searchPlaceholder')}
            className="w-full min-h-[44px] pl-9 pr-4 py-2 bg-slate-50 border border-slate-300 rounded-lg text-sm text-slate-900 focus:ring-2 focus:ring-slate-500 focus:outline-hidden"
          />
        </div>
        <div className="text-xs font-semibold text-slate-500 px-3 py-2 bg-slate-100 rounded-lg shrink-0 self-center">
          {t('clients.totalClients')}: {clients.length}
        </div>
      </div>

      {/* Clients List */}
      {loading ? (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-xs p-12 text-center text-slate-400 text-sm">
          {t('common.loading')}
        </div>
      ) : clients.length === 0 ? (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-xs p-12 text-center space-y-3">
          <Users className="w-10 h-10 text-slate-300 mx-auto" />
          <p className="text-sm text-slate-500">{t('clients.noClientsFound')}</p>
          {canEdit && !isReadOnly && (
            <button
              onClick={() => {
                setEditingClient(null);
                setModalOpen(true);
              }}
              className="min-h-[44px] inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-indigo-700 bg-indigo-50 hover:bg-indigo-100 rounded-lg transition"
            >
              <UserPlus className="w-3.5 h-3.5" />
              {t('clients.addClient')}
            </button>
          )}
        </div>
      ) : (
        <ResponsiveTable<ClientRecord>
          data={clients}
          keyExtractor={(client) => client.id}
          onRowClick={(client) => openClientProfile(client.id, 'cases')}
          columns={[
            {
              header: 'Client',
              accessor: (client) => (
                <div className="flex items-center gap-3">
                  <ClientAvatar
                    clientId={client.id}
                    name={client.name}
                    nameBn={client.nameBn}
                    size="md"
                    context={{ currentUser }}
                  />
                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <EntityLink
                        type="client"
                        id={client.id}
                        label={client.name}
                        className="font-bold text-sm"
                      />
                      {client.archived && (
                        <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-slate-200 text-slate-700 border border-slate-300">
                          Archived
                        </span>
                      )}
                    </div>
                    {client.nameBn && (
                      <span className="text-xs text-slate-500 font-sans block mt-0.5">
                        {client.nameBn}
                      </span>
                    )}
                  </div>
                </div>
              ),
            },
            {
              header: 'Phone / Email',
              accessor: (client) => (
                <div className="space-y-1">
                  <div className="flex items-center gap-1.5 text-xs font-medium text-slate-700">
                    <Phone className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                    <span>{client.phone}</span>
                  </div>
                  {client.email && (
                    <div className="text-xs text-slate-500 truncate max-w-[180px]">
                      {client.email}
                    </div>
                  )}
                </div>
              ),
            },
            {
              header: 'Address',
              accessor: (client) => (
                <div className="flex items-center gap-1.5 text-xs text-slate-600 max-w-xs">
                  <MapPin className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                  <span className="line-clamp-2">{client.address || '—'}</span>
                </div>
              ),
            },
            {
              header: '',
              className: 'text-right',
              accessor: (client) => (
                <div
                  className="flex items-center justify-end gap-1.5"
                  onClick={(e) => e.stopPropagation()}
                >
                  {canEdit && !isReadOnly && (
                    <button
                      onClick={() => {
                        setEditingClient(client);
                        setModalOpen(true);
                      }}
                      className="min-h-[44px] min-w-[44px] inline-flex items-center justify-center p-2 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition"
                      title={t('common.edit')}
                      aria-label={t('common.edit')}
                    >
                      <Edit2 className="w-4 h-4" />
                    </button>
                  )}
                  <button
                    onClick={() => openClientProfile(client.id, 'cases')}
                    className="min-h-[44px] inline-flex items-center gap-1.5 px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-semibold rounded-lg transition"
                  >
                    <span>{t('clients.viewProfile')}</span>
                    <ChevronRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              ),
            },
          ]}
          renderMobileCard={(client) => (
            <div className="p-4 bg-white rounded-xl border border-slate-200 shadow-2xs hover:border-slate-300 transition space-y-3">
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-slate-100 text-slate-700 font-bold text-sm flex items-center justify-center shrink-0 border border-slate-200">
                    {client.name.slice(0, 2).toUpperCase()}
                  </div>
                  <div>
                    <EntityLink
                      type="client"
                      id={client.id}
                      label={client.name}
                      className="font-bold text-sm"
                    />
                    {client.nameBn && (
                      <span className="text-xs text-slate-500 font-sans block">
                        {client.nameBn}
                      </span>
                    )}
                  </div>
                </div>
              </div>

              <div className="space-y-1 text-xs text-slate-600 pt-2 border-t border-slate-100">
                <div className="flex items-center gap-1.5">
                  <Phone className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                  <span>{client.phone}</span>
                </div>
                {client.address && (
                  <div className="flex items-center gap-1.5">
                    <MapPin className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                    <span className="truncate">{client.address}</span>
                  </div>
                )}
              </div>

              <div
                className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100"
                onClick={(e) => e.stopPropagation()}
              >
                <button
                  onClick={() => openClientProfile(client.id, 'cases')}
                  className="min-h-[44px] flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 text-xs font-semibold rounded-lg transition border border-indigo-200/60"
                >
                  <span>{t('clients.viewProfile')}</span>
                  <ChevronRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          )}
        />
      )}

      {/* Client Form Modal */}
      <ClientFormModal
        isOpen={modalOpen}
        initialData={editingClient}
        onClose={() => {
          setModalOpen(false);
          setEditingClient(null);
        }}
        onSave={handleSaveClient}
      />
    </div>
  );
};
