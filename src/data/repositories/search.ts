import { can } from '../../permissions';
import { ISearchRepository } from '../interfaces';
import { localStore } from '../mockStore';
import {
  CaseRecord,
  SearchResultEntity,
  SearchResultItem,
  SecurityContext,
} from '../types';
import { getVisibleCaseIdsForContext } from './case';

export class MockSearchRepository implements ISearchRepository {
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
    const store = localStore.getData();
    const firmId = currentUser.firmId;
    const limit = filter?.limit || 50;
    const results: SearchResultItem[] = [];

    // Central visibility rule for cases
    const visibleCaseIds = getVisibleCaseIdsForContext(context);
    const cases = (store.cases || []).filter((c) => visibleCaseIds.has(c.id));
    const caseMap = new Map<string, CaseRecord>();
    cases.forEach((c) => caseMap.set(c.id, c));

    // Clients
    if (!filter?.entity || filter.entity === 'all' || filter.entity === 'client') {
      if (can('clients.view', currentUser)) {
        const clients = (store.clients || []).filter(
          (c) => c.firmId === firmId && c.deletedAt === null
        );
        for (const c of clients) {
          const nameMatch = c.name.toLowerCase().includes(q);
          const nameBnMatch = c.nameBn ? c.nameBn.toLowerCase().includes(q) : false;
          const phoneMatch = c.phone.toLowerCase().includes(q);
          const addressMatch = c.address ? c.address.toLowerCase().includes(q) : false;
          const notesMatch = c.notes ? c.notes.toLowerCase().includes(q) : false;

          if (nameMatch || nameBnMatch || phoneMatch || addressMatch || notesMatch) {
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
    }

    // Cases
    if (!filter?.entity || filter.entity === 'all' || filter.entity === 'case') {
      if (can('cases.view', currentUser)) {
        for (const c of cases) {
          const numMatch = c.caseNumber.toLowerCase().includes(q);
          const serialMatch = c.fileSerial.toLowerCase().includes(q);
          const courtMatch = c.court.toLowerCase().includes(q);
          const typeMatch = c.matterType.toLowerCase().includes(q);
          const descMatch = c.description ? c.description.toLowerCase().includes(q) : false;
          const plaintiffMatch = c.plaintiff.toLowerCase().includes(q);
          const defMatch = c.defendant.toLowerCase().includes(q);

          if (numMatch || serialMatch || courtMatch || typeMatch || descMatch || plaintiffMatch || defMatch) {
            results.push({
              id: `search-case-${c.id}`,
              entity: 'case',
              title: c.caseNumber,
              subtitle: `${c.court} • ${c.matterType}`,
              badge: c.status.toUpperCase(),
              caseNumber: c.caseNumber,
              court: c.court,
              serial: c.fileSerial,
              status: c.status,
              restricted: c.restricted,
              details: `${c.plaintiff} vs ${c.defendant}`,
              targetTab: 'cases',
              targetId: c.id,
            });
          }
        }
      }
    }

    // Hearings
    if (!filter?.entity || filter.entity === 'all' || filter.entity === 'hearing') {
      if (can('hearings.update', currentUser) || can('cases.view', currentUser)) {
        const hearings = (store.hearings || []).filter(
          (h) => h.firmId === firmId && h.deletedAt === null && visibleCaseIds.has(h.caseId)
        );
        for (const h of hearings) {
          const caseRec = caseMap.get(h.caseId);

          const purposeMatch = h.purpose.toLowerCase().includes(q);
          const outcomeMatch = h.outcomeNote ? h.outcomeNote.toLowerCase().includes(q) : false;
          const caseNumMatch = caseRec ? caseRec.caseNumber.toLowerCase().includes(q) : false;
          const courtMatch = caseRec ? caseRec.court.toLowerCase().includes(q) : false;

          if (purposeMatch || outcomeMatch || caseNumMatch || courtMatch) {
            results.push({
              id: `search-hearing-${h.id}`,
              entity: 'hearing',
              title: `${caseRec?.caseNumber || 'Hearing'}: ${h.purpose}`,
              subtitle: `${caseRec?.court || ''} • Scheduled: ${new Date(h.scheduledAt).toLocaleDateString()}`,
              badge: h.status.toUpperCase(),
              details: h.outcomeNote || undefined,
              caseNumber: caseRec?.caseNumber,
              court: caseRec?.court,
              status: h.status,
              targetTab: 'hearings',
              targetId: h.id,
            });
          }
        }
      }
    }

    // Tasks
    if (!filter?.entity || filter.entity === 'all' || filter.entity === 'task') {
      if (can('tasks.view', currentUser)) {
        let tasks = (store.tasks || []).filter(
          (t) =>
            t.firmId === firmId &&
            t.deletedAt === null &&
            (!t.caseId || visibleCaseIds.has(t.caseId))
        );
        // Staff partitioning: staff advocates only see their own assigned tasks
        if (currentUser.role === 'Staff') {
          tasks = tasks.filter((t) => t.assignedTo === currentUser.id);
        }

        for (const t of tasks) {
          const caseRec = t.caseId ? caseMap.get(t.caseId) : undefined;

          const titleMatch = t.title.toLowerCase().includes(q);
          const descMatch = t.description ? t.description.toLowerCase().includes(q) : false;
          const assigneeMatch = t.assignedToName ? t.assignedToName.toLowerCase().includes(q) : false;
          const caseNumMatch = caseRec ? caseRec.caseNumber.toLowerCase().includes(q) : false;

          if (titleMatch || descMatch || assigneeMatch || caseNumMatch) {
            results.push({
              id: `search-task-${t.id}`,
              entity: 'task',
              title: t.title,
              subtitle: `Due: ${new Date(t.dueAt).toLocaleDateString()} • Assigned: ${t.assignedToName || 'Unassigned'}`,
              badge: t.priority.toUpperCase(),
              details: caseRec ? `Case: ${caseRec.caseNumber}` : undefined,
              caseNumber: caseRec?.caseNumber,
              status: t.status,
              targetTab: 'tasks',
              targetId: t.id,
            });
          }
        }
      }
    }

    // Physical Files
    if (!filter?.entity || filter.entity === 'all' || filter.entity === 'file') {
      if (can('files.view', currentUser)) {
        const files = (store.physicalFiles || []).filter(
          (f) =>
            f.firmId === firmId &&
            f.deletedAt === null &&
            (!f.caseId || visibleCaseIds.has(f.caseId))
        );
        for (const f of files) {
          const caseRec = f.caseId ? caseMap.get(f.caseId) : undefined;

          const serialMatch = f.serial.toLowerCase().includes(q);
          const titleMatch = f.title.toLowerCase().includes(q);
          const shelfMatch = f.shelfLocation ? f.shelfLocation.toLowerCase().includes(q) : false;
          const holderMatch = f.currentHolderName ? f.currentHolderName.toLowerCase().includes(q) : false;
          const caseNumMatch = caseRec ? caseRec.caseNumber.toLowerCase().includes(q) : false;

          if (serialMatch || titleMatch || shelfMatch || holderMatch || caseNumMatch) {
            results.push({
              id: `search-file-${f.id}`,
              entity: 'file',
              title: `${f.serial} - ${f.title}`,
              subtitle: `Location: ${f.shelfLocation || 'Chamber'} • Status: ${f.status.replace('_', ' ')}`,
              badge: f.status.toUpperCase(),
              details: f.currentHolderName ? `Holder: ${f.currentHolderName}` : undefined,
              serial: f.serial,
              caseNumber: caseRec?.caseNumber,
              status: f.status,
              targetTab: 'files',
              targetId: f.id,
            });
          }
        }
      }
    }

    // Appointments
    if (!filter?.entity || filter.entity === 'all' || filter.entity === 'appointment') {
      if (can('appointments.view', currentUser)) {
        const appts = (store.appointments || []).filter(
          (a) =>
            a.firmId === firmId &&
            a.deletedAt === null &&
            (!a.caseId || visibleCaseIds.has(a.caseId))
        );
        for (const a of appts) {
          const titleMatch = a.title.toLowerCase().includes(q);
          const locationMatch = a.location ? a.location.toLowerCase().includes(q) : false;
          const notesMatch = a.notes ? a.notes.toLowerCase().includes(q) : false;
          const caseRec = a.caseId ? caseMap.get(a.caseId) : undefined;
          const clientRec = a.clientId ? (store.clients || []).find((c) => c.id === a.clientId) : undefined;

          if (titleMatch || locationMatch || notesMatch) {
            results.push({
              id: `search-appt-${a.id}`,
              entity: 'appointment',
              title: a.title,
              subtitle: `${new Date(a.startsAt).toLocaleDateString()} • ${a.type.replace('_', ' ')}`,
              badge: a.status.toUpperCase(),
              details: a.location ? `Location: ${a.location}` : undefined,
              clientName: clientRec?.name,
              caseNumber: caseRec?.caseNumber,
              status: a.status,
              targetTab: 'appointments',
              targetId: a.id,
            });
          }
        }
      }
    }

    return results.slice(0, limit);
  }
}
