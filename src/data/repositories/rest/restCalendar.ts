import { getDhakaDateString } from '../../../utils/dateUtils';
import { ICalendarRepository } from '../../interfaces';
import { CalendarEventRecord, CalendarEventType, SecurityContext } from '../../types';
import { restFetch } from './restCommon';

export class RestCalendarRepository implements ICalendarRepository {
  async getEvents(
    _context: SecurityContext,
    range?: {
      startIso?: string;
      endIso?: string;
      type?: CalendarEventType | 'all';
    }
  ): Promise<CalendarEventRecord[]> {
    const params = new URLSearchParams();
    if (range?.startIso) params.set('startIso', range.startIso);
    if (range?.endIso) params.set('endIso', range.endIso);
    if (range?.type && range.type !== 'all') params.set('type', range.type);
    const qs = params.toString();
    return restFetch<CalendarEventRecord[]>(`/calendar${qs ? `?${qs}` : ''}`);
  }

  async getDayCauseList(
    _context: SecurityContext,
    dateIso: string
  ): Promise<{ date: string; hearings: CalendarEventRecord[]; firmName: string }> {
    const targetDay = getDhakaDateString(dateIso);
    return restFetch<{ date: string; hearings: CalendarEventRecord[]; firmName: string }>(
      `/calendar/cause-list?date=${encodeURIComponent(targetDay)}`
    );
  }
}
