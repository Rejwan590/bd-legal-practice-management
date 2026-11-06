import React, { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { CalendarEventRecord } from '../../data/types';
import { getWeekDaysForDate, formatLocalDateKey } from '../../utils/dateUtils';
import { Clock } from 'lucide-react';

interface CalendarWeekViewProps {
  events: CalendarEventRecord[];
  selectedDateStr: string;
  onSelectDate: (dateStr: string) => void;
  onEventClick: (ev: CalendarEventRecord) => void;
  todayStr?: string;
}

export const CalendarWeekView: React.FC<CalendarWeekViewProps> = ({
  events,
  selectedDateStr,
  onSelectDate,
  onEventClick,
  todayStr = formatLocalDateKey(new Date()),
}) => {
  const { t, i18n } = useTranslation();

  const weekDays = useMemo(() => {
    return getWeekDaysForDate(selectedDateStr);
  }, [selectedDateStr]);

  // Group events by date
  const eventsByDate = useMemo(() => {
    const map = new Map<string, CalendarEventRecord[]>();
    events.forEach((ev) => {
      const dateKey = ev.date.slice(0, 10);
      const existing = map.get(dateKey) || [];
      existing.push(ev);
      map.set(dateKey, existing);
    });
    return map;
  }, [events]);

  const dayHeaders = [
    t('calendar.daysSun'),
    t('calendar.daysMon'),
    t('calendar.daysTue'),
    t('calendar.daysWed'),
    t('calendar.daysThu'),
    t('calendar.daysFri'),
    t('calendar.daysSat'),
  ];

  return (
    <div className="space-y-4">
      {/* Desktop & Tablet: 7 Columns Grid (>= md) */}
      <div className="hidden md:block bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
        {/* Week Header */}
        <div className="grid grid-cols-7 border-b border-slate-200 bg-slate-50 text-center text-xs font-bold text-slate-700 py-3">
          {weekDays.map((dayObj, idx) => {
            const isToday = dayObj.dateStr === todayStr;
            const isSelected = dayObj.dateStr === selectedDateStr;

            return (
              <div
                key={dayObj.dateStr}
                onClick={() => onSelectDate(dayObj.dateStr)}
                className={`cursor-pointer px-2 py-1 rounded-lg transition select-none flex flex-col items-center gap-1 ${
                  isSelected ? 'bg-indigo-50/80' : 'hover:bg-slate-100'
                }`}
              >
                <span className="uppercase tracking-wider text-[11px] text-slate-500 font-bold">
                  {dayHeaders[idx]}
                </span>
                <span
                  className={`text-xs font-bold w-6 h-6 flex items-center justify-center rounded-full ${
                    isToday
                      ? 'bg-indigo-600 text-white shadow-xs'
                      : isSelected
                      ? 'text-indigo-700 bg-indigo-100'
                      : 'text-slate-800'
                  }`}
                >
                  {dayObj.date.getDate()}
                </span>
              </div>
            );
          })}
        </div>

        {/* 7 Columns Day Events */}
        <div className="grid grid-cols-7 divide-x divide-slate-100 min-h-[360px]">
          {weekDays.map((dayObj) => {
            const dayEvents = eventsByDate.get(dayObj.dateStr) || [];
            const isSelected = dayObj.dateStr === selectedDateStr;
            const isToday = dayObj.dateStr === todayStr;

            return (
              <div
                key={dayObj.dateStr}
                onClick={() => onSelectDate(dayObj.dateStr)}
                className={`p-2.5 flex flex-col justify-start space-y-2 transition cursor-pointer select-none ${
                  isToday
                    ? 'bg-indigo-50/20'
                    : 'bg-white hover:bg-slate-50/60'
                } ${isSelected ? 'ring-2 ring-indigo-600 ring-inset bg-indigo-50/30' : ''}`}
              >
                <div className="flex items-center justify-between text-[11px] text-slate-400 border-b border-slate-100 pb-1">
                  <span className="font-mono font-semibold">
                    {dayObj.date.toLocaleDateString(i18n.language === 'bn' ? 'bn-BD' : 'en-GB', { month: 'short', day: 'numeric' })}
                  </span>
                  {dayEvents.length > 0 && (
                    <span className="font-bold text-[10px] px-1.5 py-0.2 rounded-full bg-slate-100 text-slate-600">
                      {dayEvents.length}
                    </span>
                  )}
                </div>

                {dayEvents.length === 0 ? (
                  <span className="text-[11px] text-slate-300 italic py-2 text-center block">
                    —
                  </span>
                ) : (
                  <div className="space-y-1.5">
                    {dayEvents.map((ev) => (
                      <div
                        key={ev.id}
                        data-testid={`calendar-grid-event-${ev.sourceId}`}
                        onClick={(e) => {
                          e.stopPropagation();
                          onEventClick(ev);
                        }}
                        className={`text-[10px] font-medium p-1.5 rounded-lg border cursor-pointer hover:opacity-85 transition shadow-2xs space-y-0.5 ${
                          ev.type === 'hearing'
                            ? 'bg-indigo-50 text-indigo-900 border-indigo-200'
                            : ev.type === 'task'
                            ? 'bg-amber-50 text-amber-900 border-amber-200'
                            : 'bg-emerald-50 text-emerald-900 border-emerald-200'
                        }`}
                      >
                        <div className="font-bold truncate leading-tight">{ev.title}</div>
                        <div className="text-[9px] opacity-75 font-mono flex items-center gap-1">
                          <Clock className="w-2.5 h-2.5" />
                          <span>
                            {new Date(ev.date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Mobile: 7 Vertical Day Sections (< md) */}
      <div className="block md:hidden space-y-3">
        {weekDays.map((dayObj, idx) => {
          const dayEvents = eventsByDate.get(dayObj.dateStr) || [];
          const isToday = dayObj.dateStr === todayStr;
          const isSelected = dayObj.dateStr === selectedDateStr;

          return (
            <div
              key={dayObj.dateStr}
              onClick={() => onSelectDate(dayObj.dateStr)}
              className={`bg-white rounded-2xl border p-4 shadow-xs transition space-y-3 cursor-pointer ${
                isSelected
                  ? 'border-indigo-600 ring-2 ring-indigo-600/30'
                  : isToday
                  ? 'border-indigo-200 bg-indigo-50/10'
                  : 'border-slate-200 hover:border-slate-300'
              }`}
            >
              {/* Day Header */}
              <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                <div className="flex items-center gap-2">
                  <span
                    className={`text-xs font-bold w-6 h-6 flex items-center justify-center rounded-full ${
                      isToday
                        ? 'bg-indigo-600 text-white'
                        : isSelected
                        ? 'bg-indigo-100 text-indigo-700'
                        : 'bg-slate-100 text-slate-700'
                    }`}
                  >
                    {dayObj.date.getDate()}
                  </span>
                  <div>
                    <span className="font-bold text-xs text-slate-900">
                      {dayHeaders[idx]},{' '}
                      {dayObj.date.toLocaleDateString(i18n.language === 'bn' ? 'bn-BD' : 'en-GB', {
                        day: 'numeric',
                        month: 'short',
                      })}
                    </span>
                    {isToday && (
                      <span className="ml-2 text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-indigo-100 text-indigo-700">
                        {t('calendar.today')}
                      </span>
                    )}
                  </div>
                </div>

                <span className="text-[11px] font-mono text-slate-500">
                  {dayEvents.length} {t('calendar.totalMattersCount', { count: dayEvents.length }).toLowerCase()}
                </span>
              </div>

              {/* Day Events */}
              {dayEvents.length === 0 ? (
                <p className="text-xs text-slate-400 italic py-2 text-center">
                  {t('calendar.noEventsForDay')}
                </p>
              ) : (
                <div className="space-y-2">
                  {dayEvents.map((ev) => (
                    <div
                      key={ev.id}
                      data-testid={`calendar-grid-event-${ev.sourceId}`}
                      onClick={(e) => {
                        e.stopPropagation();
                        onEventClick(ev);
                      }}
                      className={`p-3 rounded-xl border flex items-center justify-between gap-2 cursor-pointer hover:shadow-xs transition ${
                        ev.type === 'hearing'
                          ? 'bg-indigo-50/50 border-indigo-200 text-indigo-950'
                          : ev.type === 'task'
                          ? 'bg-amber-50/50 border-amber-200 text-amber-950'
                          : 'bg-emerald-50/50 border-emerald-200 text-emerald-950'
                      }`}
                    >
                      <div className="space-y-0.5 truncate">
                        <div className="font-bold text-xs truncate">{ev.title}</div>
                        <div className="text-[11px] text-slate-500 flex items-center gap-2">
                          <span className="uppercase text-[9px] font-extrabold tracking-wider px-1.5 py-0.2 rounded bg-white/80 border border-slate-200/80">
                            {ev.type === 'hearing'
                              ? t('calendar.hearingBadge')
                              : ev.type === 'task'
                              ? t('calendar.taskDeadlineBadge')
                              : t('calendar.fileReturnBadge')}
                          </span>
                          {ev.court && <span className="truncate">{ev.court}</span>}
                        </div>
                      </div>

                      <span className="font-mono text-xs text-slate-600 shrink-0 font-medium">
                        {new Date(ev.date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};
