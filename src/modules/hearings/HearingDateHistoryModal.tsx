import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../foundation/AuthContext';
import { getRepositories } from '../../data/repositories';
import { HearingDateHistoryRecord, HearingRecord } from '../../data/types';
import { ResponsiveModal } from '../../components/responsive/ResponsiveModal';
import { History, Calendar, Clock, ArrowRight, User } from 'lucide-react';
import { getFixedForLabel } from '../../data/hearingFixedFor';

interface HearingDateHistoryModalProps {
  isOpen: boolean;
  onClose: () => void;
  hearing: HearingRecord | null;
}

export const HearingDateHistoryModal: React.FC<HearingDateHistoryModalProps> = ({
  isOpen,
  onClose,
  hearing,
}) => {
  const { t, i18n } = useTranslation();
  const { currentUser } = useAuth();
  const [historyList, setHistoryList] = useState<HearingDateHistoryRecord[]>([]);
  const [loading, setLoading] = useState(true);

  const repos = getRepositories();
  const currentLang = i18n.language === 'bn' ? 'bn' : 'en';

  useEffect(() => {
    if (isOpen && hearing) {
      setLoading(true);
      repos.hearing
        .getDateHistory({ currentUser }, hearing.id)
        .then(setHistoryList)
        .catch(console.error)
        .finally(() => setLoading(false));
    }
  }, [isOpen, hearing, currentUser]);

  if (!hearing) return null;

  return (
    <ResponsiveModal
      isOpen={isOpen}
      onClose={onClose}
      maxWidth="lg"
      title={
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-indigo-50 text-indigo-700 flex items-center justify-center shrink-0">
            <History className="w-4 h-4" />
          </div>
          <div>
            <h3 className="text-base font-bold text-slate-900 leading-tight">
              {t('hearings.timelineTitle')}
            </h3>
            <p className="text-xs text-slate-500 font-mono">
              Hearing ID: {hearing.id.slice(0, 8)}...
            </p>
          </div>
        </div>
      }
      subtitle="Complete chronological timeline of hearing adjournments and fixed dates"
      footer={
        <div className="flex justify-end w-full">
          <button
            onClick={onClose}
            className="min-h-[44px] px-5 py-2 text-xs font-semibold bg-slate-100 hover:bg-slate-200 text-slate-800 rounded-xl transition"
          >
            {t('common.cancel')}
          </button>
        </div>
      }
    >
      <div className="space-y-4">
        <div className="bg-slate-50 p-3 rounded-xl border border-slate-200 text-xs space-y-1">
          <div className="font-semibold text-slate-800">
            {t('hearings.purpose')}: <span className="font-normal">{hearing.purpose}</span>
            {hearing.fixedFor && (
              <span className="ml-2 inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium bg-blue-50 text-blue-700 border border-blue-200">
                {getFixedForLabel(hearing.fixedFor, currentLang)}
                {hearing.fixedForNote ? ` (${hearing.fixedForNote})` : ''}
              </span>
            )}
          </div>
          <div className="text-slate-600 flex items-center gap-1.5 font-medium">
            <Calendar className="w-3.5 h-3.5 text-indigo-600" />
            <span>Currently Scheduled: {new Date(hearing.scheduledAt).toLocaleString()}</span>
          </div>
        </div>

        <div className="space-y-3">
          {loading ? (
            <div className="p-8 text-center text-slate-400 text-xs">{t('common.loading')}</div>
          ) : historyList.length === 0 ? (
            <div className="p-8 text-center space-y-2">
              <History className="w-8 h-8 text-slate-300 mx-auto" />
              <p className="text-xs text-slate-500">{t('hearings.noDateHistory')}</p>
            </div>
          ) : (
            <div className="relative border-l-2 border-slate-200 ml-4 pl-4 space-y-4">
              {historyList.map((hist) => (
                <div key={hist.id} className="relative group">
                  <div className="absolute -left-[23px] top-1 w-3.5 h-3.5 rounded-full bg-indigo-600 ring-4 ring-indigo-50" />
                  <div className="p-3.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 transition shadow-2xs space-y-2">
                    <div className="flex items-center gap-2 flex-wrap text-xs font-semibold text-slate-800">
                      <span className="text-rose-700 font-mono line-through bg-rose-50 px-1.5 py-0.5 rounded">
                        {new Date(hist.oldAt).toLocaleDateString()}
                        {hist.oldFixedFor && (
                          <span className="ml-1 text-[11px] font-sans font-medium text-rose-600">
                            ({getFixedForLabel(hist.oldFixedFor, currentLang)})
                          </span>
                        )}
                      </span>
                      <ArrowRight className="w-3.5 h-3.5 text-slate-400" />
                      <span className="text-emerald-700 font-mono bg-emerald-50 px-1.5 py-0.5 rounded">
                        {new Date(hist.newAt).toLocaleDateString()}
                        {hist.newFixedFor && (
                          <span className="ml-1 text-[11px] font-sans font-medium text-emerald-600">
                            ({getFixedForLabel(hist.newFixedFor, currentLang)})
                          </span>
                        )}
                      </span>
                    </div>

                    {(hist.oldFixedFor || hist.newFixedFor) && (
                      <p className="text-[11px] text-slate-600 font-medium">
                        {t('hearings.dateChangedFromTo', {
                          oldDate: new Date(hist.oldAt).toLocaleDateString(),
                          oldPurpose: hist.oldFixedFor ? getFixedForLabel(hist.oldFixedFor, currentLang) : t('hearings.hearing'),
                          newDate: new Date(hist.newAt).toLocaleDateString(),
                          newPurpose: hist.newFixedFor ? getFixedForLabel(hist.newFixedFor, currentLang) : t('hearings.hearing'),
                        })}
                      </p>
                    )}

                    <div className="text-xs text-slate-700 bg-slate-50 p-2.5 rounded-lg border border-slate-100">
                      <span className="font-semibold text-slate-800 block text-[11px] mb-0.5">
                        {t('hearings.reason')}:
                      </span>
                      <p className="italic text-slate-600">"{hist.reason}"</p>
                    </div>

                    <div className="flex items-center justify-between text-[11px] text-slate-400 pt-1">
                      <span className="flex items-center gap-1 font-medium text-slate-500">
                        <User className="w-3 h-3 text-slate-400" />
                        {hist.changedByName}
                      </span>
                      <span className="flex items-center gap-1 font-mono">
                        <Clock className="w-3 h-3 text-slate-400" />
                        {new Date(hist.changedAt).toLocaleString()}
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </ResponsiveModal>
  );
};
