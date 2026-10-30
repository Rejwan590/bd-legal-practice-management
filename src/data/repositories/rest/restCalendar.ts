import { can } from '../../../permissions';
import { getDhakaDateString } from '../../../utils/dateUtils';
import { ICalendarRepository } from '../../interfaces';
import { localStore } from '../../mockStore';
import {
  AppointmentRecord,
  CalendarEventRecord,
  CalendarEventType,
  CaseRecord,
  ClientRecord,
  HearingRecord,
  SecurityContext,
  TaskRecord,
} from '../../types';
import { restFetch } from './restCommon';

export class RestCalendarRepository implements ICalendarRepository {
  async getEvents(
    context: SecurityContext,
    range?: {
      startIso?: string;
      endIso?: string;
      type?: CalendarEventType | 'all';
    }
  ): Promise<CalendarEventRecord[]> {
    const { currentUser } = context;
    const firmId = currentUser.firmId;
    const nowMs = Date.now();
    const events: CalendarEventRecord[] = [];

    // Parallel fetch cases and clients for enrichment
    const [cases, clients] = await Promise.all([
      restFetch<CaseRecord[]>('/cases').catch(() => []),
      restFetch<ClientRecord[]>('/clients').catch(() => []),
    ]);

    const caseMap = new Map<string, CaseRecord>(cases.map((c) => [c.id, c]));
    const clientMap = new Map<string, ClientRecord>(clients.map((cl) => [cl.id, cl]));
    const visibleCaseIds = new Set<string>(cases.map((c) => c.id));

    // 1. Hearings
    if (!range?.type || range.type === 'all' || range.type === 'hearing') {
      const hearings = await restFetch<HearingRecord[]>('/hearings').catch(() => []);
      hearings.forEach((h) => {
        if (h.deletedAt !== null) return;
        if (h.caseId && !visibleCaseIds.has(h.caseId)) return;

        const caseRec = h.caseId ? caseMap.get(h.caseId) : null;
        const clientRec = caseRec ? clientMap.get(caseRec.clientId) : null;

        events.push({
          id: `cal-hearing-${h.id}`,
          title: caseRec ? `${caseRec.caseNumber} - ${h.purpose}` : h.purpose,
          date: h.scheduledAt,
          type: 'hearing',
          sourceId: h.id,
          caseId: h.caseId,
          caseNumber: caseRec?.caseNumber,
          court: caseRec?.court || h.court,
          clientId: caseRec?.clientId,
          clientName: clientRec?.name,
          status: h.status,
          restricted: caseRec?.restricted,
          fixedFor: h.fixedFor || undefined,
          fixedForNote: h.fixedForNote || undefined,
        });
      });
    }

    // 2. Tasks
    if (!range?.type || range.type === 'all' || range.type === 'task') {
      const taskRes = await restFetch<{ tasks: TaskRecord[]; total: number } | TaskRecord[]>(
        '/tasks?limit=100'
      ).catch(() => []);
      let tasks = Array.isArray(taskRes) ? taskRes : (taskRes?.tasks || []);
      tasks = tasks.filter((t) => !t.deletedAt);

      if (currentUser.role === 'Staff' && !can('tasks.assign', currentUser)) {
        tasks = tasks.filter((t) => t.assignedTo === currentUser.id);
      }

      tasks.forEach((t) => {
        if (t.caseId && !visibleCaseIds.has(t.caseId)) return;

        const caseRec = t.caseId ? caseMap.get(t.caseId) : null;
        const clientRec = t.clientId ? clientMap.get(t.clientId) : null;
        const isOverdue = t.status !== 'completed' && new Date(t.dueAt).getTime() < nowMs;

        events.push({
          id: `cal-task-${t.id}`,
          title: t.title,
          date: t.dueAt,
          type: 'task',
          sourceId: t.id,
          caseId: t.caseId,
          caseNumber: caseRec?.caseNumber,
          clientId: t.clientId,
          clientName: clientRec?.name,
          assigneeId: t.assignedTo,
          assigneeName: t.assignedToName,
          status: t.status,
          priority: t.priority,
          isOverdue,
          restricted: caseRec?.restricted,
        });
      });
    }

    // 3. Physical File Returns
    if (!range?.type || range.type === 'all' || range.type === 'file_return') {
      const store = localStore.getData();
      const files = (store.physicalFiles || []).filter(
        (f) =>
          f.firmId === firmId &&
          (f.status === 'checked_out' || f.status === 'in_court') &&
          f.dueBackAt &&
          f.deletedAt === null
      );

      files.forEach((f) => {
        if (f.caseId && !visibleCaseIds.has(f.caseId)) return;

        const caseRec = f.caseId ? caseMap.get(f.caseId) : null;
        const clientRec = f.clientId ? clientMap.get(f.clientId) : null;
        const isOverdue = f.dueBackAt ? new Date(f.dueBackAt).getTime() < nowMs : false;

        events.push({
          id: `cal-file-${f.id}`,
          title: `Return: ${f.serial} (${f.title})`,
          date: f.dueBackAt!,
          type: 'file_return',
          sourceId: f.id,
          caseId: f.caseId,
          caseNumber: caseRec?.caseNumber,
          clientId: f.clientId,
          clientName: clientRec?.name,
          assigneeId: f.currentHolderId,
          assigneeName: f.currentHolderName || undefined,
          status: f.status,
          shelfLocation: f.shelfLocation,
          isOverdue,
          restricted: caseRec?.restricted,
        });
      });
    }

    // 4. Appointments
    if (!range?.type || range.type === 'all' || range.type === 'appointment') {
      const apptRes = await restFetch<{ appointments?: AppointmentRecord[]; total?: number } | AppointmentRecord[]>(
        '/appointments'
      ).catch(() => []);
      const appts = Array.isArray(apptRes) ? apptRes : (apptRes?.appointments || []);

      appts.forEach((a) => {
        if (a.deletedAt !== null) return;
        if (a.caseId && !visibleCaseIds.has(a.caseId)) return;

        const caseRec = a.caseId ? caseMap.get(a.caseId) : null;
        const clientRec = a.clientId ? clientMap.get(a.clientId) : null;

        events.push({
          id: `cal-appt-${a.id}`,
          title: a.title,
          date: a.startsAt,
          type: 'appointment',
          sourceId: a.id,
          caseId: a.caseId,
          caseNumber: caseRec?.caseNumber,
          clientId: a.clientId,
          clientName: clientRec?.name,
          assigneeId: a.organiserUserId,
          status: a.status,
          restricted: caseRec?.restricted,
        });
      });
    }

    // Filter by date range if provided
    let filtered = events;
    if (range?.startIso) {
      const startMs = new Date(range.startIso).getTime();
      filtered = filtered.filter((e) => new Date(e.date).getTime() >= startMs);
    }
    if (range?.endIso) {
      const endMs = new Date(range.endIso).getTime();
      filtered = filtered.filter((e) => new Date(e.date).getTime() <= endMs);
    }

    return filtered.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  }

  async getDayCauseList(
    context: SecurityContext,
    dateIso: string
  ): Promise<{ date: string; hearings: CalendarEventRecord[]; firmName: string }> {
    const targetDay = getDhakaDateString(dateIso);
    const allEvents = await this.getEvents(context, { type: 'hearing' });
    const dayHearings = allEvents.filter((e) => getDhakaDateString(e.date) === targetDay);

    const store = localStore.getData();
    return {
      date: targetDay,
      hearings: dayHearings,
      firmName: store.firm?.name || 'Rahman & Associates Chambers',
    };
  }
}
