import { can } from '../../permissions';
import { ICalendarRepository } from '../interfaces';
import { localStore } from '../mockStore';
import { CalendarEventRecord, CalendarEventType, SecurityContext } from '../types';
import { getVisibleCaseIdsForContext } from './case';
import { getDhakaDateString } from '../../utils/dateUtils';

export class MockCalendarRepository implements ICalendarRepository {
  async getEvents(
    context: SecurityContext,
    range?: {
      startIso?: string;
      endIso?: string;
      type?: CalendarEventType | 'all';
    }
  ): Promise<CalendarEventRecord[]> {
    const { currentUser } = context;
    const store = localStore.getData();
    const visibleCaseIds = getVisibleCaseIdsForContext(context);

    const events: CalendarEventRecord[] = [];
    const nowMs = Date.now();

    // 1. Hearings
    if (!range?.type || range.type === 'all' || range.type === 'hearing') {
      const hearings = (store.hearings || []).filter(
        (h) => h.firmId === currentUser.firmId && h.deletedAt === null
      );

      hearings.forEach((h) => {
        if (!visibleCaseIds.has(h.caseId)) {
          return;
        }
        const caseRec = (store.cases || []).find((c) => c.id === h.caseId);

        const clientRec = caseRec ? (store.clients || []).find((cl) => cl.id === caseRec.clientId) : null;

        events.push({
          id: `cal-hearing-${h.id}`,
          title: caseRec ? `${caseRec.caseNumber} - ${h.purpose}` : h.purpose,
          date: h.scheduledAt,
          type: 'hearing',
          sourceId: h.id,
          caseId: h.caseId,
          caseNumber: caseRec?.caseNumber,
          court: caseRec?.court,
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
      let tasks = (store.tasks || []).filter(
        (t) => t.firmId === currentUser.firmId && t.deletedAt === null
      );

      // Staff role partitioning: staff only see tasks assigned to them
      if (currentUser.role === 'Staff' && !can('tasks.assign', currentUser)) {
        tasks = tasks.filter((t) => t.assignedTo === currentUser.id);
      }

      tasks.forEach((t) => {
        if (t.caseId && !visibleCaseIds.has(t.caseId)) {
          return;
        }

        const caseRec = t.caseId ? (store.cases || []).find((c) => c.id === t.caseId) : null;
        const clientRec = t.clientId ? (store.clients || []).find((cl) => cl.id === t.clientId) : null;
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
      const files = (store.physicalFiles || []).filter(
        (f) =>
          f.firmId === currentUser.firmId &&
          (f.status === 'checked_out' || f.status === 'in_court') &&
          f.dueBackAt &&
          f.deletedAt === null
      );

      files.forEach((f) => {
        if (f.caseId && !visibleCaseIds.has(f.caseId)) {
          return;
        }

        const caseRec = f.caseId ? (store.cases || []).find((c) => c.id === f.caseId) : null;
        const clientRec = f.clientId ? (store.clients || []).find((cl) => cl.id === f.clientId) : null;
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
      const appts = (store.appointments || []).filter(
        (a) => a.firmId === currentUser.firmId && a.deletedAt === null
      );

      appts.forEach((a) => {
        if (a.caseId && !visibleCaseIds.has(a.caseId)) {
          return;
        }

        const caseRec = a.caseId ? (store.cases || []).find((c) => c.id === a.caseId) : null;
        const clientRec = a.clientId ? (store.clients || []).find((cl) => cl.id === a.clientId) : null;

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
