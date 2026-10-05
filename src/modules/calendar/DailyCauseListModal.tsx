import React, { useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { CalendarEventRecord } from '../../data/types';
import { ResponsiveModal } from '../../components/responsive/ResponsiveModal';
import { Printer, Scale, Building } from 'lucide-react';

interface DailyCauseListModalProps {
  isOpen: boolean;
  dateStr: string;
  firmName: string;
  hearings: CalendarEventRecord[];
  onClose: () => void;
}

export const DailyCauseListModal: React.FC<DailyCauseListModalProps> = ({
  isOpen,
  dateStr,
  firmName,
  hearings,
  onClose,
}) => {
  const { t } = useTranslation();
  const printRef = useRef<HTMLDivElement>(null);

  if (!isOpen) return null;

  const handlePrint = () => {
    window.print();
  };

  const formattedDate = new Date(dateStr).toLocaleDateString('en-GB', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });

  return (
    <ResponsiveModal
      isOpen={isOpen}
      onClose={onClose}
      title={t('calendar.causeListTitle')}
      subtitle={formattedDate}
      icon={Scale}
      maxWidth="4xl"
      footer={
        <div className="flex flex-col-reverse sm:flex-row items-center justify-between gap-3 w-full print:hidden">
          <button
            type="button"
            onClick={onClose}
            className="w-full sm:w-auto px-4 py-2 min-h-[44px] text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-xl transition"
          >
            {t('common.cancel')}
          </button>
          <button
            type="button"
            onClick={handlePrint}
            className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-4 py-2 min-h-[44px] bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-semibold shadow-xs transition"
          >
            <Printer className="w-4 h-4" />
            {t('calendar.printCauseList')}
          </button>
        </div>
      }
    >
      {/* Printable Cause List Content */}
      <div ref={printRef} className="space-y-6 p-1 print:p-0">
        {/* Official Chamber Docket Header */}
        <div className="text-center border-b-2 border-slate-900 pb-4 space-y-1">
          <h1 className="text-xl font-bold tracking-tight text-slate-950 uppercase font-serif">
            {firmName}
          </h1>
          <p className="text-xs font-medium text-slate-600 tracking-wider uppercase">
            Supreme Court of Bangladesh &bull; District & Sessions Judge Courts
          </p>
          <div className="pt-2 flex flex-col sm:flex-row items-center justify-between text-xs font-mono font-semibold border-t border-slate-200 mt-2 px-2 gap-1">
            <span>
              CAUSE LIST FOR: <strong>{formattedDate.toUpperCase()}</strong>
            </span>
            <span>
              TOTAL MATTERS LISTED: <strong>{hearings.length}</strong>
            </span>
          </div>
        </div>

        {hearings.length === 0 ? (
          <div className="py-16 text-center text-slate-400 text-xs italic">
            No court hearings listed for {formattedDate}.
          </div>
        ) : (
          <div className="overflow-x-auto -mx-1 sm:mx-0">
            <table className="w-full min-w-[580px] text-left text-xs border border-slate-300 divide-y divide-slate-200">
              <thead className="bg-slate-100 text-slate-800 font-bold uppercase tracking-wider text-[10px]">
                <tr>
                  <th className="p-2.5 border-r border-slate-200 text-center w-10">#</th>
                  <th className="p-2.5 border-r border-slate-200 w-44">{t('calendar.courtBench')}</th>
                  <th className="p-2.5 border-r border-slate-200 w-48">{t('calendar.caseNumber')}</th>
                  <th className="p-2.5 border-r border-slate-200">{t('calendar.parties')}</th>
                  <th className="p-2.5 border-r border-slate-200 w-44">{t('calendar.purpose')}</th>
                  <th className="p-2.5 w-28 text-center">{t('common.status')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 font-sans">
                {hearings.map((h, idx) => (
                  <tr key={h.id} className="hover:bg-slate-50/80">
                    <td className="p-2.5 border-r border-slate-200 text-center font-mono font-bold text-slate-500">
                      {idx + 1}
                    </td>
                    <td className="p-2.5 border-r border-slate-200 font-medium text-slate-900">
                      <div className="flex items-start gap-1">
                        <Building className="w-3.5 h-3.5 text-slate-400 shrink-0 mt-0.5" />
                        <span>{h.court || 'Court not specified'}</span>
                      </div>
                    </td>
                    <td className="p-2.5 border-r border-slate-200">
                      <strong className="font-mono text-slate-900 block">{h.caseNumber || h.title}</strong>
                      {h.clientName && (
                        <span className="text-[11px] text-slate-500 block">
                          Client: {h.clientName}
                        </span>
                      )}
                    </td>
                    <td className="p-2.5 border-r border-slate-200 text-slate-800">
                      <span className="font-medium">{h.title}</span>
                    </td>
                    <td className="p-2.5 border-r border-slate-200">
                      <span className="font-semibold text-indigo-950 block">
                        {h.title.split(' - ')[1] || h.title}
                      </span>
                      <span className="text-[10px] text-slate-500 font-mono">
                        Time: {new Date(h.date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </td>
                    <td className="p-2.5 text-center">
                      <span className="inline-block text-[10px] px-2 py-0.5 rounded font-bold uppercase tracking-wider bg-slate-100 text-slate-800 border border-slate-200">
                        {h.status || 'Scheduled'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Chamber Footer */}
        <div className="pt-4 border-t border-slate-200 text-[10px] text-slate-500 flex flex-col sm:flex-row justify-between items-center gap-2">
          <span>Printed from Rahman & Associates Chamber Management System</span>
          <span>Clerk Verification Signature: _________________________</span>
        </div>
      </div>
    </ResponsiveModal>
  );
};
