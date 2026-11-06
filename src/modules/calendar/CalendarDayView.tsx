import React from 'react';
import { useTranslation } from 'react-i18next';
import { CalendarEventRecord } from '../../data/types';
import { EntityLink } from '../../components/EntityLink';
import {
  Calendar as CalendarIcon,
  Clock,
  Printer,
  Building,
  User,
  MapPin,
  Plus,
  Edit2,
  Gavel,
  CheckSquare,
  FolderMinus,
} from 'lucide-react';
import { getFixedForLabel } from '../../data/hearingFixedFor';
import { parseLocalDateKey } from '../../utils/dateUtils';

interface CalendarDayViewProps {
  events: CalendarEventRecord[];
  selectedDateStr: string;
  onEventClick: (event: CalendarEventRecord) => void;
  openHearingForm?: (opts?: { defaultDate?: string }) => void;
  openTaskForm?: (opts?: { defaultDueDate?: string }) => void;
  onPrintCauseList?: () => void;
  canAddHearing?: boolean;
  canAddTask?: boolean;
  isReadOnly?: boolean;
  openEntityModalById?: (
    entity: 'hearing' | 'task' | 'file' | 'case' | 'client' | 'appointment',
    id: string
  ) => void | Promise<void>;
}

export const CalendarDayView: React.FC<CalendarDayViewProps> = ({
  events,
  selectedDateStr,
  onEventClick,
  openHearingForm,
  openTaskForm,
  onPrintCauseList,
  canAddHearing = false,
  canAddTask = false,
  isReadOnly = false,
  openEntityModalById,
}) => {
  const { t, i18n } = useTranslation();

  const dayEvents = events.filter((ev) => ev.date.slice(0, 10) === selectedDateStr);
  const hearings = dayEvents.filter((ev) => ev.type === 'hearing');
  const tasks = dayEvents.filter((ev) => ev.type === 'task');
  const fileReturns = dayEvents.filter((ev) => ev.type === 'file_return');

  const formattedDate = parseLocalDateKey(selectedDateStr).toLocaleDateString(
    i18n.language === 'bn' ? 'bn-BD' : 'en-GB',
    {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    }
  );

  const renderEventCard = (ev: CalendarEventRecord) => (
    <div
      key={ev.id}
      data-testid={`calendar-day-event-${ev.sourceId}`}
      onClick={() => onEventClick(ev)}
      className={`p-3.5 rounded-xl border space-y-2 cursor-pointer transition hover:shadow-xs ${
        ev.type === 'hearing'
          ? 'border-indigo-200 bg-indigo-50/20 hover:border-indigo-300'
          : ev.type === 'task'
          ? 'border-amber-200 bg-amber-50/20 hover:border-amber-300'
          : 'border-emerald-200 bg-emerald-50/20 hover:border-emerald-300'
      }`}
    >
      <div className="flex items-center justify-between gap-2">
        <span
          className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider ${
            ev.type === 'hearing'
              ? 'bg-indigo-100 text-indigo-900'
              : ev.type === 'task'
              ? 'bg-amber-100 text-amber-900'
              : 'bg-emerald-100 text-emerald-900'
          }`}
        >
          {ev.type === 'hearing'
            ? t('calendar.courtHearingBadge')
            : ev.type === 'task'
            ? t('calendar.chamberTaskBadge')
            : t('calendar.physicalFileReturnBadge')}
        </span>

        <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
          <span className="text-[11px] font-mono text-slate-500 flex items-center gap-1">
            <Clock className="w-3 h-3 text-slate-400" />
            {new Date(ev.date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          </span>
          {!isReadOnly && openEntityModalById && (
            <button
              type="button"
              onClick={() =>
                openEntityModalById(
                  ev.type === 'file_return' ? 'file' : ev.type,
                  ev.sourceId
                )
              }
              className="p-1 rounded-md bg-white border border-slate-200 text-slate-600 hover:text-slate-900"
              title={t('common.edit')}
            >
              <Edit2 className="w-3 h-3" />
            </button>
          )}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2" onClick={(e) => e.stopPropagation()}>
        {ev.type === 'hearing' && ev.caseId ? (
          <div className="flex items-center gap-1.5 flex-wrap">
            <EntityLink
              type="hearing"
              id={ev.sourceId}
              caseId={ev.caseId}
              caseTab="hearings"
              label={ev.title}
              restricted={ev.restricted}
              className="font-bold text-xs"
            />
            {ev.fixedFor && (
              <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-blue-50 text-blue-700 border border-blue-200">
                {getFixedForLabel(ev.fixedFor, i18n.language === 'bn' ? 'bn' : 'en')}
                {ev.fixedForNote ? ` (${ev.fixedForNote})` : ''}
              </span>
            )}
          </div>
        ) : (
          <EntityLink
            type={ev.type === 'file_return' ? 'file' : ev.type}
            id={ev.sourceId}
            caseId={ev.caseId}
            mode="modal"
            label={ev.title}
            restricted={ev.restricted}
            className="font-bold text-xs"
          />
        )}
      </div>

      <div className="text-[11px] text-slate-600 space-y-1">
        {ev.caseId && ev.caseNumber && (
          <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
            <EntityLink
              type="case"
              id={ev.caseId}
              caseTab={ev.type === 'hearing' ? 'hearings' : 'overview'}
              label={ev.caseNumber}
              restricted={ev.restricted}
              showIcon
              className="text-[11px]"
            />
          </div>
        )}
        {ev.court && (
          <div className="flex items-center gap-1">
            <Building className="w-3 h-3 text-slate-400" />
            <span>{t('calendar.courtPrefix', { court: ev.court })}</span>
          </div>
        )}
        {ev.clientName && (
          <div className="flex items-center gap-1">
            <User className="w-3 h-3 text-slate-400" />
            <span>{t('calendar.clientPrefix', { name: ev.clientName })}</span>
          </div>
        )}
        {ev.assigneeName && (
          <div className="flex items-center gap-1">
            <User className="w-3 h-3 text-slate-400" />
            <span>{t('calendar.advocatePrefix', { name: ev.assigneeName })}</span>
          </div>
        )}
        {ev.shelfLocation && (
          <div className="flex items-center gap-1">
            <MapPin className="w-3 h-3 text-slate-400" />
            <span>{t('calendar.locationPrefix', { location: ev.shelfLocation })}</span>
          </div>
        )}
      </div>
    </div>
  );

  return (
    <div className="bg-white rounded-2xl border border-slate-200 p-4 sm:p-5 shadow-xs space-y-5">
      {/* Top Header & Actions */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-4">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-indigo-50 text-indigo-700 flex items-center justify-center shrink-0">
            <CalendarIcon className="w-5 h-5" />
          </div>
          <div>
            <h3 className="font-bold text-sm text-slate-900">
              {t('calendar.scheduleFor', { date: formattedDate })}
            </h3>
            <span className="text-[11px] text-slate-500 font-mono">
              {t('calendar.totalMattersCount', { count: dayEvents.length })}
            </span>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {canAddHearing && openHearingForm && (
            <button
              type="button"
              disabled={isReadOnly}
              data-testid="calendar-day-add-hearing-btn"
              onClick={() => openHearingForm({ defaultDate: selectedDateStr })}
              className="inline-flex items-center gap-1 px-3 py-2 min-h-[38px] bg-indigo-50 hover:bg-indigo-100 text-indigo-700 rounded-xl text-xs font-semibold transition disabled:opacity-40"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>{t('hearings.addHearing')}</span>
            </button>
          )}

          {canAddTask && openTaskForm && (
            <button
              type="button"
              disabled={isReadOnly}
              data-testid="calendar-day-add-task-btn"
              onClick={() => openTaskForm({ defaultDueDate: selectedDateStr })}
              className="inline-flex items-center gap-1 px-3 py-2 min-h-[38px] bg-amber-50 hover:bg-amber-100 text-amber-800 rounded-xl text-xs font-semibold transition disabled:opacity-40"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>{t('tasks.addTask')}</span>
            </button>
          )}

          {hearings.length > 0 && onPrintCauseList && (
            <button
              type="button"
              onClick={onPrintCauseList}
              className="inline-flex items-center justify-center gap-1.5 px-3.5 py-2 min-h-[38px] bg-slate-900 text-white rounded-xl text-xs font-semibold hover:bg-slate-800 transition"
            >
              <Printer className="w-3.5 h-3.5" />
              <span>{t('calendar.printCauseList')} ({hearings.length})</span>
            </button>
          )}
        </div>
      </div>

      {/* Empty State */}
      {dayEvents.length === 0 ? (
        <p className="text-xs text-slate-400 italic py-12 text-center">
          {t('calendar.noEventsForDay')}
        </p>
      ) : (
        <div className="space-y-6">
          {/* Group 1: Court Hearings */}
          {hearings.length > 0 && (
            <div className="space-y-3">
              <div className="flex items-center gap-2 text-xs font-bold text-indigo-900 uppercase tracking-wider">
                <Gavel className="w-4 h-4 text-indigo-600" />
                <span>{t('calendar.hearingsOnly')}</span>
                <span className="ml-1 px-1.5 py-0.2 text-[10px] bg-indigo-100 rounded-full font-mono">
                  {hearings.length}
                </span>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {hearings.map(renderEventCard)}
              </div>
            </div>
          )}

          {/* Group 2: Task Deadlines */}
          {tasks.length > 0 && (
            <div className="space-y-3">
              <div className="flex items-center gap-2 text-xs font-bold text-amber-900 uppercase tracking-wider">
                <CheckSquare className="w-4 h-4 text-amber-600" />
                <span>{t('calendar.tasksOnly')}</span>
                <span className="ml-1 px-1.5 py-0.2 text-[10px] bg-amber-100 rounded-full font-mono">
                  {tasks.length}
                </span>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {tasks.map(renderEventCard)}
              </div>
            </div>
          )}

          {/* Group 3: File Returns */}
          {fileReturns.length > 0 && (
            <div className="space-y-3">
              <div className="flex items-center gap-2 text-xs font-bold text-emerald-900 uppercase tracking-wider">
                <FolderMinus className="w-4 h-4 text-emerald-600" />
                <span>{t('calendar.filesOnly')}</span>
                <span className="ml-1 px-1.5 py-0.2 text-[10px] bg-emerald-100 rounded-full font-mono">
                  {fileReturns.length}
                </span>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {fileReturns.map(renderEventCard)}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
