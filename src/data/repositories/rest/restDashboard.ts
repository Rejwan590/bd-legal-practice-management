import { can } from '../../../permissions';
import { getDhakaDateString } from '../../../utils/dateUtils';
import { IDashboardRepository } from '../../interfaces';
import { localStore } from '../../mockStore';
import {
  AppointmentRecord,
  CaseRecord,
  ClientRecord,
  DashboardMetrics,
  DashboardUrgentItems,
  HearingRecord,
  SecurityContext,
  TaskRecord,
} from '../../types';
import { restFetch } from './restCommon';

export class RestDashboardRepository implements IDashboardRepository {
  private async fetchAllTasks(firmId: string): Promise<TaskRecord[]> {
    const all: TaskRecord[] = [];
    let offset = 0;
    const limit = 100;
    while (true) {
      const res = await restFetch<{ tasks: TaskRecord[]; total: number } | TaskRecord[]>(
        `/tasks?limit=${limit}&offset=${offset}`
      ).catch(() => []);
      const pageItems = Array.isArray(res) ? res : (res?.tasks || []);
      all.push(...pageItems);
      const total = Array.isArray(res) ? pageItems.length : (res?.total ?? pageItems.length);
      if (all.length >= total || pageItems.length === 0) break;
      offset += pageItems.length;
    }
    return all.filter((t) => !t.deletedAt && (!t.firmId || t.firmId === firmId));
  }

  private async fetchAllAppointments(firmId: string): Promise<AppointmentRecord[]> {
    const res = await restFetch<{ appointments?: AppointmentRecord[]; total?: number } | AppointmentRecord[]>(
      '/appointments'
    ).catch(() => []);
    const items = Array.isArray(res) ? res : (res?.appointments || []);
    return items.filter((a) => !a.deletedAt && (!a.firmId || a.firmId === firmId));
  }

  async getMetrics(context: SecurityContext): Promise<DashboardMetrics> {
    const { currentUser } = context;
    const firmId = currentUser.firmId;
    const now = new Date();
    const nowMs = now.getTime();
    const todayDhaka = getDhakaDateString(now);

    const [cases, clients, hearings, allTasks, appointments] = await Promise.all([
      restFetch<CaseRecord[]>('/cases').catch(() => []),
      restFetch<ClientRecord[]>('/clients').catch(() => []),
      restFetch<HearingRecord[]>('/hearings').catch(() => []),
      this.fetchAllTasks(firmId),
      this.fetchAllAppointments(firmId),
    ]);

    // 1. Cases: active court cases
    const allowedCaseIds = new Set(cases.map((c) => c.id));
    const activeCasesCount = cases.filter((c) => c.status === 'ongoing').length;

    // 2. Clients: non-archived, non-deleted
    const totalClientsCount = clients.filter((c) => !c.deletedAt && !c.archived).length;

    // 3. Hearings: today's hearings in Bangladesh timezone
    const validHearings = hearings.filter(
      (h) => !h.deletedAt && (!h.caseId || allowedCaseIds.has(h.caseId))
    );
    const todayHearingsCount = validHearings.filter(
      (h) => getDhakaDateString(h.scheduledAt) === todayDhaka
    ).length;

    // 4. Tasks: pending & overdue
    let tasks = allTasks.filter(
      (t) => !t.deletedAt && (!t.caseId || allowedCaseIds.has(t.caseId))
    );
    if (currentUser.role === 'Staff' && !can('tasks.assign', currentUser)) {
      tasks = tasks.filter((t) => t.assignedTo === currentUser.id);
    }
    const pendingTasks = tasks.filter((t) => t.status !== 'completed' && t.status !== 'cancelled');
    const pendingTasksCount = pendingTasks.length;
    const overdueTasksCount = pendingTasks.filter(
      (t) => new Date(t.dueAt).getTime() < nowMs
    ).length;

    // 5. Files: checked out & overdue (from physical custody store)
    const store = localStore.getData();
    const files = (store.physicalFiles || []).filter((f) => {
      if (f.firmId !== firmId || f.deletedAt !== null) return false;
      if (f.caseId && !allowedCaseIds.has(f.caseId)) return false;
      return true;
    });
    const checkedOutFiles = files.filter(
      (f) => f.status === 'checked_out' || f.status === 'in_court'
    );
    const checkedOutFilesCount = checkedOutFiles.length;
    const overdueFilesCount = checkedOutFiles.filter(
      (f) => f.dueBackAt && new Date(f.dueBackAt).getTime() < nowMs
    ).length;

    // 6. Appointments: today's appointments in Bangladesh timezone
    const validAppointments = appointments.filter(
      (a) => !a.deletedAt && (!a.caseId || allowedCaseIds.has(a.caseId))
    );
    const todayAppointmentsCount = validAppointments.filter(
      (a) => getDhakaDateString(a.startsAt) === todayDhaka
    ).length;

    // 7. Reminders: active pending alerts
    let reminders = (store.reminders || []).filter(
      (r) => r.firmId === firmId && r.deletedAt === null && r.status !== 'dismissed'
    );
    if (currentUser.role === 'Staff') {
      reminders = reminders.filter((r) => r.userId === currentUser.id);
    }
    const pendingRemindersCount = reminders.length;

    return {
      activeCasesCount,
      totalClientsCount,
      todayHearingsCount,
      todayAppointmentsCount,
      pendingTasksCount,
      overdueTasksCount,
      checkedOutFilesCount,
      overdueFilesCount,
      pendingRemindersCount,
    };
  }

  async getUrgentItems(context: SecurityContext): Promise<DashboardUrgentItems> {
    const { currentUser } = context;
    const firmId = currentUser.firmId;
    const now = new Date();
    const nowMs = now.getTime();
    const todayDhaka = getDhakaDateString(now);

    const [cases, hearings, allTasks, appointments] = await Promise.all([
      restFetch<CaseRecord[]>('/cases').catch(() => []),
      restFetch<HearingRecord[]>('/hearings').catch(() => []),
      this.fetchAllTasks(firmId),
      this.fetchAllAppointments(firmId),
    ]);

    const allowedCaseIds = new Set(cases.map((c) => c.id));

    // Today's hearings
    const todayHearings = hearings.filter((h) => {
      if (h.deletedAt !== null) return false;
      if (h.caseId && !allowedCaseIds.has(h.caseId)) return false;
      return getDhakaDateString(h.scheduledAt) === todayDhaka;
    });

    // Overdue tasks
    let tasks = allTasks.filter((t) => {
      if (t.deletedAt !== null) return false;
      if (t.caseId && !allowedCaseIds.has(t.caseId)) return false;
      return true;
    });
    if (currentUser.role === 'Staff' && !can('tasks.assign', currentUser)) {
      tasks = tasks.filter((t) => t.assignedTo === currentUser.id);
    }
    const overdueTasks = tasks.filter(
      (t) =>
        t.status !== 'completed' &&
        t.status !== 'cancelled' &&
        new Date(t.dueAt).getTime() < nowMs
    );

    // Overdue physical files
    const store = localStore.getData();
    const files = (store.physicalFiles || []).filter((f) => {
      if (f.firmId !== firmId || f.deletedAt !== null) return false;
      if (f.caseId && !allowedCaseIds.has(f.caseId)) return false;
      return true;
    });
    const overdueFiles = files.filter(
      (f) =>
        (f.status === 'checked_out' || f.status === 'in_court') &&
        f.dueBackAt &&
        new Date(f.dueBackAt).getTime() < nowMs
    );

    // Today's appointments
    const validAppointments = appointments.filter((a) => {
      if (a.deletedAt !== null) return false;
      if (a.caseId && !allowedCaseIds.has(a.caseId)) return false;
      return getDhakaDateString(a.startsAt) === todayDhaka;
    });

    return {
      todayHearings,
      todayAppointments: validAppointments,
      overdueTasks,
      overdueFiles,
    };
  }

  async getUpcomingHearings(context: SecurityContext, days: number = 7): Promise<HearingRecord[]> {
    const now = new Date();
    const startMs = now.getTime();
    const endMs = startMs + days * 24 * 60 * 60 * 1000;

    const [cases, hearings] = await Promise.all([
      restFetch<CaseRecord[]>('/cases').catch(() => []),
      restFetch<HearingRecord[]>('/hearings').catch(() => []),
    ]);

    const allowedCaseIds = new Set(cases.map((c) => c.id));

    const upcoming = hearings.filter((h) => {
      if (h.deletedAt !== null || h.status === 'cancelled') return false;
      if (h.caseId && !allowedCaseIds.has(h.caseId)) return false;
      const t = new Date(h.scheduledAt).getTime();
      return t >= startMs && t <= endMs;
    });

    return upcoming.sort(
      (a, b) => new Date(a.scheduledAt).getTime() - new Date(b.scheduledAt).getTime()
    );
  }
}
