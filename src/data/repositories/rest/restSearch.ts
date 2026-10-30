import { can } from '../../../permissions';
import { ISearchRepository } from '../../interfaces';
import { localStore } from '../../mockStore';
import {
  AppointmentRecord,
  CaseRecord,
  ClientRecord,
  HearingRecord,
  SearchResultEntity,
  SearchResultItem,
  SecurityContext,
  TaskRecord,
} from '../../types';
import { restFetch } from './restCommon';

export class RestSearchRepository implements ISearchRepository {
  async search(
    context: SecurityContext,
    query: string,
    filter?: {
      entity?: SearchResultEntity | 'all';
      limit?: number;
    }
  ): Promise<SearchResultItem[]> {
    const q = query.trim().toLowerCase();
    if (!q) return [];

    const { currentUser } = context;
    const firmId = currentUser.firmId;
    const limit = filter?.limit || 50;
    const results: SearchResultItem[] = [];

    // 1. Cases (backend already enforces case visibility)
    const cases = await restFetch<CaseRecord[]>(`/cases?search=${encodeURIComponent(q)}`).catch(() => []);
    const caseMap = new Map<string, CaseRecord>(cases.map((c) => [c.id, c]));
    const visibleCaseIds = new Set<string>(cases.map((c) => c.id));

    // Clients map for linking
    const clients = await restFetch<ClientRecord[]>('/clients').catch(() => []);
    const clientMap = new Map<string, ClientRecord>(clients.map((cl) => [cl.id, cl]));

    // Clients search
    if (!filter?.entity || filter.entity === 'all' || filter.entity === 'client') {
      if (can('clients.view', currentUser)) {
        const clientResults = await restFetch<ClientRecord[]>(
          `/clients?search=${encodeURIComponent(q)}`
        ).catch(() => []);
        for (const c of clientResults) {
          if (c.deletedAt) continue;
          results.push({
            id: `search-client-${c.id}`,
            entity: 'client',
            title: c.name,
            subtitle: c.phone + (c.address ? ` • ${c.address}` : ''),
            details: c.notes || undefined,
            clientName: c.name,
            targetTab: 'clients',
            targetId: c.id,
          });
        }
      }
    }

    // Cases search
    if (!filter?.entity || filter.entity === 'all' || filter.entity === 'case') {
      if (can('cases.view', currentUser)) {
        for (const c of cases) {
          const clientRec = clientMap.get(c.clientId);
          results.push({
            id: `search-case-${c.id}`,
            entity: 'case',
            title: `${c.caseNumber} - ${c.court}`,
            subtitle: `${c.matterType} • Status: ${c.status}${
              clientRec ? ` • Client: ${clientRec.name}` : ''
            }`,
            details: c.description || undefined,
            caseNumber: c.caseNumber,
            clientName: clientRec?.name,
            court: c.court,
            restricted: c.restricted,
            targetTab: 'cases',
            targetId: c.id,
          });
        }
      }
    }

    // Hearings search
    if (!filter?.entity || filter.entity === 'all' || filter.entity === 'hearing') {
      if (can('cases.view', currentUser)) {
        const hearings = await restFetch<HearingRecord[]>('/hearings').catch(() => []);
        for (const h of hearings) {
          if (h.deletedAt !== null) continue;
          if (h.caseId && !visibleCaseIds.has(h.caseId)) continue;

          const purposeMatch = h.purpose.toLowerCase().includes(q);
          const outcomeMatch = h.outcomeNote ? h.outcomeNote.toLowerCase().includes(q) : false;
          const courtMatch = h.court ? h.court.toLowerCase().includes(q) : false;
          const fixedForMatch = h.fixedFor ? h.fixedFor.toLowerCase().includes(q) : false;
          const fixedForNoteMatch = h.fixedForNote ? h.fixedForNote.toLowerCase().includes(q) : false;

          if (purposeMatch || outcomeMatch || courtMatch || fixedForMatch || fixedForNoteMatch) {
            const caseRec = h.caseId ? caseMap.get(h.caseId) : null;
            const clientRec = caseRec ? clientMap.get(caseRec.clientId) : null;

            results.push({
              id: `search-hearing-${h.id}`,
              entity: 'hearing',
              title: h.purpose,
              subtitle: `Date: ${h.scheduledAt.slice(0, 10)}${h.court ? ` • Court: ${h.court}` : ''}${
                caseRec ? ` • Case: ${caseRec.caseNumber}` : ''
              }`,
              details: h.outcomeNote || undefined,
              caseNumber: caseRec?.caseNumber,
              clientName: clientRec?.name,
              court: h.court || caseRec?.court,
              restricted: caseRec?.restricted,
              targetTab: 'hearings',
              targetId: h.id,
            });
          }
        }
      }
    }

    // Tasks search
    if (!filter?.entity || filter.entity === 'all' || filter.entity === 'task') {
      if (can('tasks.view', currentUser)) {
        const taskRes = await restFetch<{ tasks: TaskRecord[]; total: number } | TaskRecord[]>(
          `/tasks?search=${encodeURIComponent(q)}`
        ).catch(() => []);
        let tasks = Array.isArray(taskRes) ? taskRes : (taskRes?.tasks || []);
        tasks = tasks.filter((t) => !t.deletedAt);

        if (currentUser.role === 'Staff' && !can('tasks.assign', currentUser)) {
          tasks = tasks.filter((t) => t.assignedTo === currentUser.id);
        }

        for (const t of tasks) {
          if (t.caseId && !visibleCaseIds.has(t.caseId)) continue;
          const caseRec = t.caseId ? caseMap.get(t.caseId) : null;
          const clientRec = t.clientId ? clientMap.get(t.clientId) : null;

          results.push({
            id: `search-task-${t.id}`,
            entity: 'task',
            title: t.title,
            subtitle: `Due: ${t.dueAt.slice(0, 10)} • Priority: ${t.priority} • Status: ${t.status}${
              t.assignedToName ? ` • Assignee: ${t.assignedToName}` : ''
            }`,
            details: t.description || undefined,
            caseNumber: caseRec?.caseNumber,
            clientName: clientRec?.name,
            restricted: caseRec?.restricted,
            targetTab: 'tasks',
            targetId: t.id,
          });
        }
      }
    }

    // Physical Files search (from store)
    if (!filter?.entity || filter.entity === 'all' || filter.entity === 'file') {
      const store = localStore.getData();
      const files = (store.physicalFiles || []).filter(
        (f) => f.firmId === firmId && f.deletedAt === null
      );
      for (const f of files) {
        if (f.caseId && !visibleCaseIds.has(f.caseId)) continue;

        const serialMatch = f.serial.toLowerCase().includes(q);
        const titleMatch = f.title.toLowerCase().includes(q);
        const shelfMatch = f.shelfLocation ? f.shelfLocation.toLowerCase().includes(q) : false;
        const notesMatch = f.notes ? f.notes.toLowerCase().includes(q) : false;

        if (serialMatch || titleMatch || shelfMatch || notesMatch) {
          const caseRec = f.caseId ? caseMap.get(f.caseId) : null;
          const clientRec = f.clientId ? clientMap.get(f.clientId) : null;

          results.push({
            id: `search-file-${f.id}`,
            entity: 'file',
            title: `${f.serial} - ${f.title}`,
            subtitle: `Shelf: ${f.shelfLocation || 'N/A'} • Status: ${f.status}${
              f.currentHolderName ? ` • With: ${f.currentHolderName}` : ''
            }`,
            details: f.notes || undefined,
            caseNumber: caseRec?.caseNumber,
            clientName: clientRec?.name,
            restricted: caseRec?.restricted,
            targetTab: 'files',
            targetId: f.id,
          });
        }
      }
    }

    // Appointments search
    if (!filter?.entity || filter.entity === 'all' || filter.entity === 'appointment') {
      const apptRes = await restFetch<{ appointments?: AppointmentRecord[]; total?: number } | AppointmentRecord[]>(
        `/appointments?search=${encodeURIComponent(q)}`
      ).catch(() => []);
      const appts = Array.isArray(apptRes) ? apptRes : (apptRes?.appointments || []);

      for (const a of appts) {
        if (a.deletedAt !== null) continue;
        if (a.caseId && !visibleCaseIds.has(a.caseId)) continue;

        const caseRec = a.caseId ? caseMap.get(a.caseId) : null;
        const clientRec = a.clientId ? clientMap.get(a.clientId) : null;

        results.push({
          id: `search-appt-${a.id}`,
          entity: 'appointment',
          title: a.title,
          subtitle: `Time: ${a.startsAt.slice(0, 16).replace('T', ' ')}${
            a.location ? ` • Location: ${a.location}` : ''
          } • Status: ${a.status}`,
          details: a.notes || undefined,
          caseNumber: caseRec?.caseNumber,
          clientName: clientRec?.name,
          restricted: caseRec?.restricted,
          targetTab: 'appointments',
          targetId: a.id,
        });
      }
    }

    return results.slice(0, limit);
  }
}
