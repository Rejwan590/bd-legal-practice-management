import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../foundation/AuthContext';
import { getRepositories } from '../../data/repositories';
import { FileMovementRecord, PhysicalFileRecord } from '../../data/types';
import { ResponsiveModal } from '../../components/responsive/ResponsiveModal';
import {
  LogIn,
  LogOut,
  Scale,
  Calendar,
  Clock,
  User,
  AlertCircle,
} from 'lucide-react';

interface FileHistoryModalProps {
  isOpen: boolean;
  file: PhysicalFileRecord | null;
  onClose: () => void;
}

export const FileHistoryModal: React.FC<FileHistoryModalProps> = ({
  isOpen,
  file,
  onClose,
}) => {
  const { t } = useTranslation();
  const { currentUser } = useAuth();
  const repos = getRepositories();

  const [movements, setMovements] = useState<FileMovementRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen && file) {
      setLoading(true);
      setErrorMsg(null);
      repos.physicalFile
        .getMovements({ currentUser }, file.id)
        .then((data) => {
          setMovements(data);
          setLoading(false);
        })
        .catch((err: unknown) => {
          setErrorMsg(err instanceof Error ? err.message : 'Failed to load movement history');
          setLoading(false);
        });
    }
  }, [isOpen, file, currentUser]);

  if (!isOpen || !file) return null;

  const getActionBadge = (action: string) => {
    switch (action) {
      case 'CHECKOUT':
        return (
          <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-100 text-amber-900 border border-amber-300">
            <LogOut className="w-3 h-3 text-amber-700" />
            CHECKOUT
          </span>
        );
      case 'CHECKIN':
        return (
          <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-900 border border-emerald-300">
            <LogIn className="w-3 h-3 text-emerald-700" />
            CHECKIN
          </span>
        );
      case 'COURT_DISPATCH':
        return (
          <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-indigo-100 text-indigo-900 border border-indigo-300">
            <Scale className="w-3 h-3 text-indigo-700" />
            COURT DISPATCH
          </span>
        );
      default:
        return (
          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-100 text-slate-700">
            {action}
          </span>
        );
    }
  };

  return (
    <ResponsiveModal
      isOpen={isOpen}
      onClose={onClose}
      title={t('files.custodyTimeline')}
      subtitle={`${file.serial} • ${file.title}`}
      maxWidth="xl"
      footer={
        <div className="flex justify-end w-full">
          <button
            type="button"
            onClick={onClose}
            className="w-full sm:w-auto px-4 py-2 min-h-[44px] text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-xl transition"
          >
            {t('common.cancel')}
          </button>
        </div>
      }
    >
      <div className="space-y-4">
        {errorMsg && (
          <div className="flex items-center gap-2 p-3 bg-rose-50 border border-rose-200 rounded-xl text-rose-700 text-xs">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{errorMsg}</span>
          </div>
        )}

        {/* Current status banner */}
        <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl text-xs flex items-center justify-between">
          <div>
            <span className="text-[10px] uppercase font-bold text-slate-400 block tracking-wider">
              Current Custody Status
            </span>
            <span className="font-bold text-slate-800 capitalize">
              {file.status.replace('_', ' ')}
            </span>
          </div>
          <div className="text-right">
            <span className="text-[10px] uppercase font-bold text-slate-400 block tracking-wider">
              Location / Custodian
            </span>
            <span className="font-mono text-slate-700">
              {file.status === 'in_chamber'
                ? file.shelfLocation || 'Chamber Rack'
                : file.currentHolderName || 'Advocate'}
            </span>
          </div>
        </div>

        {/* Timeline Content */}
        <div>
          {loading ? (
            <div className="py-12 text-center text-xs text-slate-400 font-medium">
              {t('common.loading')}
            </div>
          ) : movements.length === 0 ? (
            <div className="py-12 text-center text-xs text-slate-400 italic">
              {t('files.noMovements')}
            </div>
          ) : (
            <div className="relative pl-6 space-y-5 before:absolute before:left-2 before:top-2 before:bottom-2 before:w-0.5 before:bg-slate-200">
              {movements.map((mov) => (
                <div key={mov.id} className="relative space-y-1">
                  <div className="absolute -left-[27px] top-1 w-3.5 h-3.5 rounded-full bg-white border-2 border-indigo-600 shadow-2xs" />
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <div className="flex items-center gap-2">
                      {getActionBadge(mov.action)}
                      <span className="text-xs font-semibold text-slate-800 flex items-center gap-1">
                        <User className="w-3 h-3 text-slate-400" />
                        {mov.userName}
                      </span>
                    </div>
                    <span className="text-[11px] font-mono text-slate-400 flex items-center gap-1">
                      <Clock className="w-3 h-3 text-slate-400" />
                      {new Date(mov.at).toLocaleString()}
                    </span>
                  </div>

                  {mov.dueBackAt && (
                    <div className="text-xs text-slate-600 flex items-center gap-1 pt-0.5">
                      <Calendar className="w-3.5 h-3.5 text-amber-600" />
                      <span>
                        Due Back:{' '}
                        <strong className="text-slate-800 font-mono">
                          {new Date(mov.dueBackAt).toLocaleString()}
                        </strong>
                      </span>
                    </div>
                  )}

                  {mov.note && (
                    <p className="text-xs text-slate-700 bg-slate-50/80 p-2.5 rounded-lg border border-slate-200/80 leading-relaxed font-normal">
                      {mov.note}
                    </p>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </ResponsiveModal>
  );
};
