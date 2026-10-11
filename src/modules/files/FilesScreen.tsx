import React, { useState, useEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../foundation/AuthContext';
import { useNavigation } from '../foundation/NavigationContext';
import { getRepositories } from '../../data/repositories';
import {
  CaseRecord,
  ClientRecord,
  PhysicalFileRecord,
  PhysicalFileStatus,
} from '../../data/types';
import { can } from '../../permissions';
import {
  FolderArchive,
  Plus,
  Search,
  LogIn,
  LogOut,
  Scale,
  History,
  Edit2,
  Trash2,
  MapPin,
  Clock,
  User,
  AlertTriangle,
  CheckCircle2,
  AlertCircle,
  FileCheck,
  Lock,
} from 'lucide-react';
import { FileFormModal } from './FileFormModal';
import { FileCheckOutModal } from './FileCheckOutModal';
import { FileCheckInModal } from './FileCheckInModal';
import { FileCourtDispatchModal } from './FileCourtDispatchModal';
import { FileHistoryModal } from './FileHistoryModal';
import { ResponsiveTable, ColumnDef } from '../../components/responsive/ResponsiveTable';
import { ResponsiveModal } from '../../components/responsive/ResponsiveModal';
import { EntityLink } from '../../components/EntityLink';

export const FilesScreen: React.FC = () => {
  const { t } = useTranslation();
  const { currentUser, isReadOnly } = useAuth();
  const { refreshVersion, triggerRefresh } = useNavigation();
  const repos = getRepositories();

  const [files, setFiles] = useState<PhysicalFileRecord[]>([]);
  const [cases, setCases] = useState<Record<string, CaseRecord>>({});
  const [clients, setClients] = useState<Record<string, ClientRecord>>({});
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<PhysicalFileStatus | 'all' | 'overdue'>('all');
  const [shelfFilter, setShelfFilter] = useState('all');

  // Modals state
  const [formModalOpen, setFormModalOpen] = useState(false);
  const [editingFile, setEditingFile] = useState<PhysicalFileRecord | null>(null);

  const [checkOutModalFile, setCheckOutModalFile] = useState<PhysicalFileRecord | null>(null);
  const [checkInModalFile, setCheckInModalFile] = useState<PhysicalFileRecord | null>(null);
  const [dispatchModalFile, setDispatchModalFile] = useState<PhysicalFileRecord | null>(null);
  const [historyModalFile, setHistoryModalFile] = useState<PhysicalFileRecord | null>(null);
  const [deleteConfirmFile, setDeleteConfirmFile] = useState<PhysicalFileRecord | null>(null);

  const [notification, setNotification] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  const canManage = can('files.manage', currentUser);

  const showNotification = (type: 'success' | 'error', message: string) => {
    setNotification({ type, message });
    setTimeout(() => setNotification(null), 4000);
  };

  const loadAllData = async () => {
    try {
      setLoading(true);
      const [filesData, casesData, clientsData] = await Promise.all([
        repos.physicalFile.list({ currentUser }),
        repos.case.list({ currentUser }),
        repos.client.list({ currentUser }),
      ]);

      setFiles(filesData);

      const caseMap: Record<string, CaseRecord> = {};
      casesData.forEach((c) => {
        caseMap[c.id] = c;
      });
      setCases(caseMap);

      const clientMap: Record<string, ClientRecord> = {};
      clientsData.forEach((cl) => {
        clientMap[cl.id] = cl;
      });
      setClients(clientMap);
    } catch (err: unknown) {
      console.error('Failed to load physical files:', err);
      showNotification('error', err instanceof Error ? err.message : 'Error loading files');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAllData();
  }, [currentUser, refreshVersion]);

  // Distinct shelves for filter dropdown
  const uniqueShelves = useMemo(() => {
    const set = new Set<string>();
    files.forEach((f) => {
      if (f.shelfLocation) set.add(f.shelfLocation);
    });
    return Array.from(set).sort();
  }, [files]);

  // Overdue check
  const nowMs = Date.now();
  const isFileOverdue = (file: PhysicalFileRecord) => {
    if (file.status !== 'checked_out' && file.status !== 'in_court') return false;
    if (!file.dueBackAt) return false;
    return new Date(file.dueBackAt).getTime() < nowMs;
  };

  const getOverdueDays = (dueBackAt: string) => {
    const diffMs = nowMs - new Date(dueBackAt).getTime();
    return Math.max(1, Math.floor(diffMs / (1000 * 60 * 60 * 24)));
  };

  // Metrics
  const stats = useMemo(() => {
    let total = 0;
    let inChamber = 0;
    let checkedOut = 0;
    let inCourt = 0;
    let overdue = 0;

    files.forEach((f) => {
      total++;
      if (f.status === 'in_chamber') inChamber++;
      if (f.status === 'checked_out') checkedOut++;
      if (f.status === 'in_court') inCourt++;
      if (isFileOverdue(f)) overdue++;
    });

    return { total, inChamber, checkedOut, inCourt, overdue };
  }, [files, nowMs]);

  // Filtering
  const filteredFiles = useMemo(() => {
    return files.filter((f) => {
      // Overdue filter
      if (statusFilter === 'overdue') {
        if (!isFileOverdue(f)) return false;
      } else if (statusFilter !== 'all') {
        if (f.status !== statusFilter) return false;
      }

      // Shelf location filter
      if (shelfFilter !== 'all' && f.shelfLocation !== shelfFilter) {
        return false;
      }

      // Search query
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchesSerial = f.serial.toLowerCase().includes(q);
        const matchesTitle = f.title.toLowerCase().includes(q);
        const matchesLocation = f.shelfLocation ? f.shelfLocation.toLowerCase().includes(q) : false;
        const matchesHolder = f.currentHolderName ? f.currentHolderName.toLowerCase().includes(q) : false;
        const matchesNotes = f.notes ? f.notes.toLowerCase().includes(q) : false;

        const linkedCase = f.caseId ? cases[f.caseId] : null;
        const matchesCase = linkedCase
          ? linkedCase.caseNumber.toLowerCase().includes(q) || linkedCase.fileSerial.toLowerCase().includes(q)
          : false;

        const linkedClient = f.clientId ? clients[f.clientId] : null;
        const matchesClient = linkedClient ? linkedClient.name.toLowerCase().includes(q) : false;

        if (
          !matchesSerial &&
          !matchesTitle &&
          !matchesLocation &&
          !matchesHolder &&
          !matchesNotes &&
          !matchesCase &&
          !matchesClient
        ) {
          return false;
        }
      }

      return true;
    });
  }, [files, statusFilter, shelfFilter, searchQuery, cases, clients, nowMs]);

  // Handler: Save (Create/Update)
  const handleSaveFile = async (data: {
    title: string;
    caseId?: string | null;
    clientId?: string | null;
    shelfLocation?: string;
    notes?: string;
  }) => {
    if (editingFile) {
      await repos.physicalFile.update({ currentUser }, editingFile.id, data);
      showNotification('success', t('files.fileUpdated'));
    } else {
      await repos.physicalFile.create({ currentUser }, data);
      showNotification('success', t('files.fileSaved'));
    }
    await loadAllData();
    triggerRefresh();
  };

  // Handler: Check Out
  const handleCheckOut = async (
    fileId: string,
    holderId: string,
    dueBackAt: string,
    note?: string
  ) => {
    await repos.physicalFile.checkOut({ currentUser }, fileId, holderId, dueBackAt, note);
    showNotification('success', t('files.fileCheckedOut'));
    await loadAllData();
    triggerRefresh();
  };

  // Handler: Check In
  const handleCheckIn = async (fileId: string, shelfLocation?: string, note?: string) => {
    await repos.physicalFile.checkIn({ currentUser }, fileId, shelfLocation, note);
    showNotification('success', t('files.fileCheckedIn'));
    await loadAllData();
    triggerRefresh();
  };

  // Handler: Dispatch to Court
  const handleDispatchCourt = async (
    fileId: string,
    courtName: string,
    holderId: string,
    dueBackAt: string,
    note?: string
  ) => {
    await repos.physicalFile.dispatchToCourt(
      { currentUser },
      fileId,
      courtName,
      holderId,
      dueBackAt,
      note
    );
    showNotification('success', t('files.fileDispatched'));
    await loadAllData();
    triggerRefresh();
  };

  // Handler: Archive (Soft-delete)
  const handleConfirmArchive = async () => {
    if (!deleteConfirmFile) return;
    try {
      await repos.physicalFile.delete({ currentUser }, deleteConfirmFile.id);
      showNotification('success', t('files.fileDeleted'));
      setDeleteConfirmFile(null);
      await loadAllData();
      triggerRefresh();
    } catch (err: unknown) {
      showNotification('error', err instanceof Error ? err.message : 'Failed to archive file');
    }
  };

  // Desktop table columns
  const columns: ColumnDef<PhysicalFileRecord>[] = [
    {
      header: t('files.title'),
      accessor: (file) => (
        <div className="space-y-1">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="font-mono text-xs font-bold px-2 py-0.5 rounded-lg bg-indigo-50 text-indigo-700 border border-indigo-200 inline-flex items-center gap-1">
              <FileCheck className="w-3 h-3 text-indigo-600" />
              {file.serial}
            </span>
            <span className="inline-flex items-center gap-1 text-[11px] text-slate-600 bg-slate-100 px-2 py-0.5 rounded-md font-medium">
              <MapPin className="w-3 h-3 text-slate-400" />
              {file.shelfLocation || 'Chamber Rack'}
            </span>
          </div>
          <div className="font-bold text-sm text-slate-900">
            <EntityLink
              type="file"
              id={file.id}
              label={file.title}
              showIcon={false}
              onClickOverride={() => {
                if (canManage && !isReadOnly) {
                  setEditingFile(file);
                  setFormModalOpen(true);
                } else {
                  setHistoryModalFile(file);
                }
              }}
              className="text-sm text-slate-900"
            />
          </div>
          {file.notes && (
            <p className="text-xs text-slate-500 line-clamp-1 max-w-xs">{file.notes}</p>
          )}
        </div>
      ),
    },
    {
      header: 'Case & Client',
      accessor: (file) => {
        const linkedCase = file.caseId ? cases[file.caseId] : null;
        const linkedClient = file.clientId ? clients[file.clientId] : null;
        if (!linkedCase && !linkedClient) {
          return <span className="text-slate-400 text-xs italic">-</span>;
        }
        return (
          <div className="space-y-1">
            {linkedCase && (
              <div>
                <EntityLink
                  type="case"
                  id={linkedCase.id}
                  label={linkedCase.caseNumber}
                  isRestricted={linkedCase.restricted}
                  className="text-xs font-mono text-indigo-800"
                />
              </div>
            )}
            {linkedClient && (
              <div className="flex items-center gap-1 text-xs text-slate-700">
                <EntityLink
                  type="client"
                  id={linkedClient.id}
                  label={linkedClient.name}
                  className="text-xs text-slate-700"
                />
              </div>
            )}
          </div>
        );
      },
    },
    {
      header: t('files.status'),
      accessor: (file) => {
        const overdue = isFileOverdue(file);
        const overdueDays = overdue && file.dueBackAt ? getOverdueDays(file.dueBackAt) : 0;
        return (
          <div className="space-y-1">
            {file.status === 'in_chamber' && (
              <span className="inline-flex items-center gap-1 text-xs px-2.5 py-1 rounded-full font-bold bg-emerald-100 text-emerald-800 border border-emerald-200">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                {t('files.in_chamber')}
              </span>
            )}
            {file.status === 'checked_out' && (
              <span className="inline-flex items-center gap-1 text-xs px-2.5 py-1 rounded-full font-bold bg-amber-100 text-amber-900 border border-amber-300">
                <LogOut className="w-3.5 h-3.5 text-amber-700" />
                {t('files.checked_out')}
              </span>
            )}
            {file.status === 'in_court' && (
              <span className="inline-flex items-center gap-1 text-xs px-2.5 py-1 rounded-full font-bold bg-indigo-100 text-indigo-900 border border-indigo-300">
                <Scale className="w-3.5 h-3.5 text-indigo-700" />
                {t('files.in_court')}
              </span>
            )}
            {overdue && (
              <div>
                <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-rose-100 text-rose-800 border border-rose-300 animate-pulse">
                  <AlertTriangle className="w-3 h-3 text-rose-600" />
                  {t('files.overdueByDays', { days: overdueDays })}
                </span>
              </div>
            )}
          </div>
        );
      },
    },
    {
      header: 'Holder & Due Date',
      accessor: (file) => {
        if (file.status === 'in_chamber') {
          return (
            <span className="text-xs text-slate-500 font-mono">
              {file.shelfLocation || 'Chamber Rack'}
            </span>
          );
        }
        const overdue = isFileOverdue(file);
        return (
          <div className="space-y-1 text-xs">
            <div className="font-medium text-slate-800 flex items-center gap-1">
              <User className="w-3 h-3 text-slate-400" />
              {file.currentHolderName || 'Advocate'}
            </div>
            {file.dueBackAt && (
              <div
                className={`font-mono text-[11px] flex items-center gap-1 ${
                  overdue ? 'text-rose-700 font-semibold' : 'text-slate-500'
                }`}
              >
                <Clock className="w-3 h-3" />
                {new Date(file.dueBackAt).toLocaleDateString()}
              </div>
            )}
          </div>
        );
      },
    },
    {
      header: t('common.actions'),
      className: 'text-right',
      headerClassName: 'text-right',
      accessor: (file) => (
        <div className="flex items-center justify-end gap-1 flex-wrap">
          {canManage && !isReadOnly && file.status === 'in_chamber' && (
            <>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setCheckOutModalFile(file);
                }}
                className="inline-flex items-center gap-1 px-2.5 py-1.5 min-h-[44px] text-xs font-semibold bg-amber-500 hover:bg-amber-600 text-white rounded-lg shadow-2xs transition"
                title={t('files.checkOut')}
              >
                <LogOut className="w-3.5 h-3.5" />
                <span className="hidden xl:inline">{t('files.checkOut')}</span>
              </button>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setDispatchModalFile(file);
                }}
                className="inline-flex items-center gap-1 px-2.5 py-1.5 min-h-[44px] text-xs font-semibold bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg shadow-2xs transition"
                title={t('files.dispatchCourt')}
              >
                <Scale className="w-3.5 h-3.5" />
                <span className="hidden xl:inline">{t('files.dispatchCourt')}</span>
              </button>
            </>
          )}

          {canManage && !isReadOnly && (file.status === 'checked_out' || file.status === 'in_court') && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setCheckInModalFile(file);
              }}
              className="inline-flex items-center gap-1 px-2.5 py-1.5 min-h-[44px] text-xs font-semibold bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg shadow-2xs transition"
              title={t('files.checkIn')}
            >
              <LogIn className="w-3.5 h-3.5" />
              <span className="hidden xl:inline">{t('files.checkIn')}</span>
            </button>
          )}

          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setHistoryModalFile(file);
            }}
            className="inline-flex items-center gap-1 px-2.5 py-1.5 min-h-[44px] text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition"
            title={t('files.viewHistory')}
          >
            <History className="w-3.5 h-3.5 text-slate-500" />
          </button>

          {canManage && !isReadOnly && (
            <>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setEditingFile(file);
                  setFormModalOpen(true);
                }}
                className="p-2 min-h-[44px] min-w-[44px] inline-flex items-center justify-center text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-lg transition"
                title={t('common.edit')}
              >
                <Edit2 className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setDeleteConfirmFile(file);
                }}
                className="p-2 min-h-[44px] min-w-[44px] inline-flex items-center justify-center text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition"
                title={t('common.delete')}
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </>
          )}
        </div>
      ),
    },
  ];

  // Mobile card view
  const renderMobileCard = (file: PhysicalFileRecord) => {
    const linkedCase = file.caseId ? cases[file.caseId] : null;
    const linkedClient = file.clientId ? clients[file.clientId] : null;
    const overdue = isFileOverdue(file);
    const overdueDays = overdue && file.dueBackAt ? getOverdueDays(file.dueBackAt) : 0;

    return (
      <div
        className={`bg-white rounded-2xl border p-4 shadow-2xs hover:shadow-xs transition space-y-3 ${
          overdue ? 'border-rose-300 bg-rose-50/20' : 'border-slate-200'
        }`}
      >
        {/* Top Row: Serial, Title, Status Badge */}
        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            {/* Monospace Serial Badge */}
            <span className="font-mono text-xs font-bold px-2.5 py-1 rounded-lg bg-indigo-50 text-indigo-700 border border-indigo-200 flex items-center gap-1">
              <FileCheck className="w-3.5 h-3.5 text-indigo-600" />
              {file.serial}
            </span>

            {/* Status Indicator */}
            {file.status === 'in_chamber' && (
              <span className="inline-flex items-center gap-1 text-xs px-2.5 py-1 rounded-full font-bold bg-emerald-100 text-emerald-800 border border-emerald-200">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                {t('files.in_chamber')}
              </span>
            )}
            {file.status === 'checked_out' && (
              <span className="inline-flex items-center gap-1 text-xs px-2.5 py-1 rounded-full font-bold bg-amber-100 text-amber-900 border border-amber-300">
                <LogOut className="w-3.5 h-3.5 text-amber-700" />
                {t('files.checked_out')}
              </span>
            )}
            {file.status === 'in_court' && (
              <span className="inline-flex items-center gap-1 text-xs px-2.5 py-1 rounded-full font-bold bg-indigo-100 text-indigo-900 border border-indigo-300">
                <Scale className="w-3.5 h-3.5 text-indigo-700" />
                {t('files.in_court')}
              </span>
            )}
          </div>

          <div className="flex items-center gap-1.5 flex-wrap">
            {/* Shelf Location */}
            <span className="inline-flex items-center gap-1 text-[11px] text-slate-600 bg-slate-100 px-2.5 py-0.5 rounded-lg font-medium">
              <MapPin className="w-3 h-3 text-slate-400" />
              {file.shelfLocation || 'Chamber Rack'}
            </span>

            {/* Linked Case Tag */}
            {linkedCase && (
              <span className="inline-flex items-center gap-1 text-[11px] text-indigo-800 bg-indigo-50/80 border border-indigo-200 px-2 py-0.5 rounded-lg font-mono">
                <EntityLink
                  type="case"
                  id={linkedCase.id}
                  label={linkedCase.caseNumber}
                  isRestricted={linkedCase.restricted}
                  className="text-[11px]"
                />
              </span>
            )}

            {/* Linked Client Tag */}
            {linkedClient && (
              <span className="inline-flex items-center gap-1 text-[11px] text-slate-700 bg-slate-100 px-2 py-0.5 rounded-lg">
                <EntityLink
                  type="client"
                  id={linkedClient.id}
                  label={linkedClient.name}
                  className="text-[11px] text-slate-700"
                />
              </span>
            )}

            {/* Overdue alert badge */}
            {overdue && (
              <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-rose-100 text-rose-800 border border-rose-300 animate-pulse">
                <AlertTriangle className="w-3 h-3 text-rose-600" />
                {t('files.overdueByDays', { days: overdueDays })}
              </span>
            )}
          </div>

          <h3 className="font-bold text-sm text-slate-900 break-words">
            <EntityLink
              type="file"
              id={file.id}
              label={file.title}
              showIcon={false}
              onClickOverride={() => {
                if (canManage && !isReadOnly) {
                  setEditingFile(file);
                  setFormModalOpen(true);
                } else {
                  setHistoryModalFile(file);
                }
              }}
              className="text-sm text-slate-900"
            />
          </h3>

          {file.notes && (
            <p className="text-xs text-slate-500 line-clamp-2">{file.notes}</p>
          )}
        </div>

        {/* Custody Info Strip (if checked out or in court) */}
        {(file.status === 'checked_out' || file.status === 'in_court') && (
          <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 text-xs flex flex-col gap-2">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <div>
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">
                  {t('files.currentHolder')}
                </span>
                <strong className="text-slate-800 font-medium">
                  {file.currentHolderName || 'Advocate'}
                </strong>
              </div>

              {file.checkedOutAt && (
                <div>
                  <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">
                    {t('files.checkedOutAt')}
                  </span>
                  <span className="text-slate-600 font-mono">
                    {new Date(file.checkedOutAt).toLocaleDateString()}
                  </span>
                </div>
              )}

              {file.dueBackAt && (
                <div>
                  <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">
                    {t('files.dueBackAt')}
                  </span>
                  <span
                    className={`font-mono font-semibold flex items-center gap-1 ${
                      overdue ? 'text-rose-700' : 'text-slate-700'
                    }`}
                  >
                    <Clock className="w-3 h-3" />
                    {new Date(file.dueBackAt).toLocaleDateString()}
                  </span>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Action Bar */}
        <div className="flex items-center justify-between gap-2 pt-2 border-t border-slate-100 flex-wrap">
          <div className="flex items-center gap-2 flex-wrap">
            {canManage && file.status === 'in_chamber' && (
              <>
                <button
                  type="button"
                  onClick={() => setCheckOutModalFile(file)}
                  className="inline-flex items-center gap-1.5 px-3 py-2 min-h-[44px] text-xs font-semibold bg-amber-500 hover:bg-amber-600 text-white rounded-xl shadow-2xs transition"
                >
                  <LogOut className="w-3.5 h-3.5" />
                  {t('files.checkOut')}
                </button>

                <button
                  type="button"
                  onClick={() => setDispatchModalFile(file)}
                  className="inline-flex items-center gap-1.5 px-3 py-2 min-h-[44px] text-xs font-semibold bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl shadow-2xs transition"
                >
                  <Scale className="w-3.5 h-3.5" />
                  {t('files.dispatchCourt')}
                </button>
              </>
            )}

            {canManage && (file.status === 'checked_out' || file.status === 'in_court') && (
              <button
                type="button"
                onClick={() => setCheckInModalFile(file)}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 min-h-[44px] text-xs font-semibold bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl shadow-2xs transition"
              >
                <LogIn className="w-3.5 h-3.5" />
                {t('files.checkIn')}
              </button>
            )}

            <button
              type="button"
              onClick={() => setHistoryModalFile(file)}
              className="inline-flex items-center gap-1.5 px-3 py-2 min-h-[44px] text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-xl transition"
            >
              <History className="w-3.5 h-3.5 text-slate-500" />
              {t('files.viewHistory')}
            </button>
          </div>

          {canManage && (
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => {
                  setEditingFile(file);
                  setFormModalOpen(true);
                }}
                className="p-2.5 min-h-[44px] min-w-[44px] flex items-center justify-center text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-xl transition"
                title={t('common.edit')}
              >
                <Edit2 className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={() => setDeleteConfirmFile(file)}
                className="p-2.5 min-h-[44px] min-w-[44px] flex items-center justify-center text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-xl transition"
                title={t('common.delete')}
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          )}
        </div>
      </div>
    );
  };

  // Empty state component
  const emptyState = (
    <div className="bg-white rounded-2xl border border-slate-200 p-8 sm:p-12 text-center space-y-3">
      <div className="w-12 h-12 rounded-2xl bg-slate-100 text-slate-400 flex items-center justify-center mx-auto">
        <FolderArchive className="w-6 h-6" />
      </div>
      <p className="text-xs text-slate-500">{t('files.noFilesFound')}</p>
      {canManage && (
        <button
          type="button"
          onClick={() => {
            setEditingFile(null);
            setFormModalOpen(true);
          }}
          className="inline-flex items-center justify-center px-4 py-2 min-h-[44px] bg-slate-900 text-white rounded-xl text-xs font-semibold hover:bg-slate-800 transition"
        >
          {t('files.addFile')}
        </button>
      )}
    </div>
  );

  return (
    <div className="space-y-6 max-w-7xl mx-auto w-full">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200 pb-5">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
            <FolderArchive className="w-6 h-6 text-indigo-600" />
            {t('files.title')}
          </h1>
          <p className="text-xs text-slate-500 mt-1">{t('files.subtitle')}</p>
        </div>

        {isReadOnly ? (
          <span className="flex items-center gap-1.5 px-3 py-2 bg-rose-50 text-rose-700 rounded-lg text-xs font-semibold border border-rose-200">
            <Lock className="w-3.5 h-3.5" /> {t('common.readOnlyMode')}
          </span>
        ) : canManage ? (
          <button
            type="button"
            onClick={() => {
              setEditingFile(null);
              setFormModalOpen(true);
            }}
            className="inline-flex items-center justify-center gap-2 px-4 py-2 min-h-[44px] bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-semibold shadow-xs transition"
          >
            <Plus className="w-4 h-4" />
            {t('files.addFile')}
          </button>
        ) : null}
      </div>

      {/* Notification toast */}
      {notification && (
        <div
          className={`p-3 rounded-xl border flex items-center gap-2 text-xs font-medium animate-fadeIn ${
            notification.type === 'success'
              ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
              : 'bg-rose-50 border-rose-200 text-rose-800'
          }`}
        >
          {notification.type === 'success' ? (
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
          ) : (
            <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
          )}
          <span>{notification.message}</span>
        </div>
      )}

      {/* Stats Scorecards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        <div
          onClick={() => setStatusFilter('all')}
          className={`p-3.5 rounded-xl border cursor-pointer transition select-none flex flex-col justify-between min-h-[44px] ${
            statusFilter === 'all'
              ? 'bg-slate-900 text-white border-slate-900 shadow-sm'
              : 'bg-white border-slate-200 text-slate-800 hover:border-slate-300'
          }`}
        >
          <span className={`text-[10px] font-bold uppercase tracking-wider block ${statusFilter === 'all' ? 'text-slate-300' : 'text-slate-400'}`}>
            {t('files.totalFiles')}
          </span>
          <span className="text-xl font-bold mt-1 block">{stats.total}</span>
        </div>

        <div
          onClick={() => setStatusFilter('in_chamber')}
          className={`p-3.5 rounded-xl border cursor-pointer transition select-none flex flex-col justify-between min-h-[44px] ${
            statusFilter === 'in_chamber'
              ? 'bg-emerald-800 text-white border-emerald-800 shadow-sm'
              : 'bg-white border-slate-200 text-slate-800 hover:border-slate-300'
          }`}
        >
          <span className={`text-[10px] font-bold uppercase tracking-wider block ${statusFilter === 'in_chamber' ? 'text-emerald-200' : 'text-emerald-700'}`}>
            {t('files.inChamberCount')}
          </span>
          <span className="text-xl font-bold mt-1 block text-emerald-600">
            {stats.inChamber}
          </span>
        </div>

        <div
          onClick={() => setStatusFilter('checked_out')}
          className={`p-3.5 rounded-xl border cursor-pointer transition select-none flex flex-col justify-between min-h-[44px] ${
            statusFilter === 'checked_out'
              ? 'bg-amber-800 text-white border-amber-800 shadow-sm'
              : 'bg-white border-slate-200 text-slate-800 hover:border-slate-300'
          }`}
        >
          <span className={`text-[10px] font-bold uppercase tracking-wider block ${statusFilter === 'checked_out' ? 'text-amber-200' : 'text-amber-700'}`}>
            {t('files.checkedOutCount')}
          </span>
          <span className="text-xl font-bold mt-1 block text-amber-600">
            {stats.checkedOut}
          </span>
        </div>

        <div
          onClick={() => setStatusFilter('in_court')}
          className={`p-3.5 rounded-xl border cursor-pointer transition select-none flex flex-col justify-between min-h-[44px] ${
            statusFilter === 'in_court'
              ? 'bg-indigo-800 text-white border-indigo-800 shadow-sm'
              : 'bg-white border-slate-200 text-slate-800 hover:border-slate-300'
          }`}
        >
          <span className={`text-[10px] font-bold uppercase tracking-wider block ${statusFilter === 'in_court' ? 'text-indigo-200' : 'text-indigo-700'}`}>
            {t('files.inCourtCount')}
          </span>
          <span className="text-xl font-bold mt-1 block text-indigo-600">
            {stats.inCourt}
          </span>
        </div>

        <div
          onClick={() => setStatusFilter('overdue')}
          className={`p-3.5 rounded-xl border cursor-pointer transition select-none flex flex-col justify-between min-h-[44px] col-span-2 sm:col-span-1 ${
            statusFilter === 'overdue'
              ? 'bg-rose-900 text-white border-rose-900 shadow-sm'
              : stats.overdue > 0
              ? 'bg-rose-50 border-rose-200 text-rose-900 hover:border-rose-300'
              : 'bg-white border-slate-200 text-slate-800 hover:border-slate-300'
          }`}
        >
          <span className={`text-[10px] font-bold uppercase tracking-wider block ${statusFilter === 'overdue' ? 'text-rose-200' : 'text-rose-700'}`}>
            {t('files.overdueCount')}
          </span>
          <span className={`text-xl font-bold mt-1 block ${statusFilter === 'overdue' ? 'text-white' : 'text-rose-600'}`}>
            {stats.overdue}
          </span>
        </div>
      </div>

      {/* Search & Filter Toolbar */}
      <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
        {/* Search Input */}
        <div className="relative flex-1">
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={t('files.searchPlaceholder')}
            className="w-full pl-9 pr-3.5 py-2.5 min-h-[44px] text-xs bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-slate-500 focus:outline-hidden"
          />
        </div>

        {/* Filters */}
        <div className="flex items-center gap-2 flex-wrap">
          {/* Status Select */}
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as PhysicalFileStatus | 'all' | 'overdue')}
            className="px-3 py-2 min-h-[44px] text-xs bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-slate-500 focus:outline-hidden font-medium text-slate-700 w-full sm:w-auto"
          >
            <option value="all">{t('files.status')}: {t('common.all')}</option>
            <option value="in_chamber">{t('files.in_chamber')}</option>
            <option value="checked_out">{t('files.checked_out')}</option>
            <option value="in_court">{t('files.in_court')}</option>
            <option value="overdue">🚨 {t('files.overdueCount')}</option>
          </select>

          {/* Shelf Location Select */}
          <select
            value={shelfFilter}
            onChange={(e) => setShelfFilter(e.target.value)}
            className="px-3 py-2 min-h-[44px] text-xs bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-slate-500 focus:outline-hidden font-medium text-slate-700 w-full sm:w-auto"
          >
            <option value="all">{t('files.filterLocation')}: {t('common.all')}</option>
            {uniqueShelves.map((sh) => (
              <option key={sh} value={sh}>
                {sh}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* File List / ResponsiveTable */}
      {loading ? (
        <div className="py-20 text-center text-slate-400 text-xs font-medium">
          {t('common.loading')}
        </div>
      ) : (
        <ResponsiveTable<PhysicalFileRecord>
          data={filteredFiles}
          keyExtractor={(file) => file.id}
          columns={columns}
          renderMobileCard={renderMobileCard}
          emptyState={emptyState}
        />
      )}

      {/* File Form Modal (Register / Edit) */}
      <FileFormModal
        isOpen={formModalOpen}
        initialData={editingFile}
        onClose={() => {
          setFormModalOpen(false);
          setEditingFile(null);
        }}
        onSave={handleSaveFile}
      />

      {/* Check Out Modal */}
      <FileCheckOutModal
        isOpen={Boolean(checkOutModalFile)}
        file={checkOutModalFile}
        onClose={() => setCheckOutModalFile(null)}
        onCheckOut={handleCheckOut}
      />

      {/* Check In Modal */}
      <FileCheckInModal
        isOpen={Boolean(checkInModalFile)}
        file={checkInModalFile}
        onClose={() => setCheckInModalFile(null)}
        onCheckIn={handleCheckIn}
      />

      {/* Court Dispatch Modal */}
      <FileCourtDispatchModal
        isOpen={Boolean(dispatchModalFile)}
        file={dispatchModalFile}
        onClose={() => setDispatchModalFile(null)}
        onDispatch={handleDispatchCourt}
      />

      {/* Movement History Modal */}
      <FileHistoryModal
        isOpen={Boolean(historyModalFile)}
        file={historyModalFile}
        onClose={() => setHistoryModalFile(null)}
      />

      {/* Soft-Delete Modal */}
      <ResponsiveModal
        isOpen={Boolean(deleteConfirmFile)}
        onClose={() => setDeleteConfirmFile(null)}
        title={t('files.softDeleteWarningTitle')}
        maxWidth="md"
        footer={
          <div className="flex flex-col-reverse sm:flex-row items-center justify-end gap-2 w-full">
            <button
              type="button"
              onClick={() => setDeleteConfirmFile(null)}
              className="w-full sm:w-auto px-4 py-2 min-h-[44px] text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-xl transition"
            >
              {t('common.cancel')}
            </button>
            <button
              type="button"
              onClick={handleConfirmArchive}
              className="w-full sm:w-auto px-4 py-2 min-h-[44px] text-xs font-semibold bg-rose-600 hover:bg-rose-700 text-white rounded-xl shadow-xs transition"
            >
              {t('common.delete')}
            </button>
          </div>
        }
      >
        {deleteConfirmFile && (
          <div className="space-y-4">
            <div className="flex items-center gap-3 text-amber-600">
              <div className="w-10 h-10 rounded-full bg-amber-100 flex items-center justify-center shrink-0">
                <AlertTriangle className="w-5 h-5 text-amber-600" />
              </div>
              <p className="text-xs text-slate-600 leading-relaxed">
                {t('files.softDeleteWarningText')}
              </p>
            </div>

            <div className="bg-slate-50 p-3 rounded-xl border border-slate-200 text-xs text-slate-700">
              <strong>{deleteConfirmFile.serial}:</strong> {deleteConfirmFile.title}
            </div>
          </div>
        )}
      </ResponsiveModal>
    </div>
  );
};
