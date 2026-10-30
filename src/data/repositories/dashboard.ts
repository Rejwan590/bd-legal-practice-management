import { IDashboardRepository } from '../interfaces';
import { localStore } from '../mockStore';
import {
  DashboardMetrics,
  DashboardUrgentItems,
  HearingRecord,
  SecurityContext,
} from '../types';
import { getVisibleCaseIdsForContext } from './case';
import { getDhakaDateString } from '../../utils/dateUtils';

export class MockDashboardRepository implements IDashboardRepository {
  async getMetrics(context: SecurityContext): Promise<DashboardMetrics> {
    const { currentUser } = context;
    const store = localStore.getData();
    const firmId = currentUser.firmId;
    const now = new Date();
    const todayStr = getDhakaDateString(now);
    const nowMs = now.getTime();

    // 1. Cases: use central visibility rule
    const allowedCaseIds = getVisibleCaseIdsForContext(context);
    const cases = (store.cases || []).filter((c) => allowedCaseIds.has(c.id));
    const activeCasesCount = cases.filter((c) => c.status === 'ongoing').length;

    // 2. Clients: filter firmId, not deleted
    const clients = (store.clients || []).filter((c) => c.firmId === firmId && c.deletedAt === null);
    const totalClientsCount = clients.length;

    // 3. Hearings: today's hearings
    const hearings = (store.hearings || []).filter((h) => {
      if (h.firmId !== firmId || h.deletedAt !== null) return false;
      if (h.caseId && !allowedCaseIds.has(h.caseId)) return false;
      return true;
    });
    const todayHearingsCount = hearings.filter((h) => getDhakaDateString(h.scheduledAt) === todayStr).length;

    // 4. Tasks: pending & overdue
    let tasks = (store.tasks || []).filter((t) => {
      if (t.firmId !== firmId || t.deletedAt !== null) return false;
      if (t.caseId && !allowedCaseIds.has(t.caseId)) return false;
      return true;
    });
    if (currentUser.role === 'Staff') {
      tasks = tasks.filter((t) => t.assignedTo === currentUser.id);
    }
    const pendingTasks = tasks.filter((t) => t.status !== 'completed' && t.status !== 'cancelled');
    const pendingTasksCount = pendingTasks.length;
    const overdueTasksCount = pendingTasks.filter((t) => new Date(t.dueAt).getTime() < nowMs).length;

    // 5. Files: checked out & overdue
    const files = (store.physicalFiles || []).filter((f) => {
      if (f.firmId !== firmId || f.deletedAt !== null) return false;
      if (f.caseId && !allowedCaseIds.has(f.caseId)) return false;
      return true;
    });
    const checkedOutFiles = files.filter((f) => f.status === 'checked_out' || f.status === 'in_court');
    const checkedOutFilesCount = checkedOutFiles.length;
    const overdueFilesCount = checkedOutFiles.filter(
      (f) => f.dueBackAt && new Date(f.dueBackAt).getTime() < nowMs
    ).length;

    // 6. Appointments: today's appointments
    const appointments = (store.appointments || []).filter((a) => {
      if (a.firmId !== firmId || a.deletedAt !== null) return false;
      if (a.caseId && !allowedCaseIds.has(a.caseId)) return false;
      return true;
    });
    const todayAppointmentsCount = appointments.filter((a) => getDhakaDateString(a.startsAt) === todayStr).length;

    // 7. Reminders: active pending reminders
    let reminders = (store.reminders || []).filter(
      (r) => r.firmId === firmId && r.deletedAt === null && r.status !== 'dismissed'
    );
    if (currentUser.role === 'Staff') {
      reminders = reminders.filter((r) => r.userId === currentUser.id);
    }
    const hearingMap = new Map((store.hearings || []).map((h) => [h.id, h]));
    const taskMap = new Map((store.tasks || []).map((t) => [t.id, t]));
    const fileMap = new Map((store.physicalFiles || []).map((f) => [f.id, f]));
    reminders = reminders.filter((r) => {
      if (r.sourceType === 'hearing') {
        const h = hearingMap.get(r.sourceId);
        if (h && h.caseId && !allowedCaseIds.has(h.caseId)) return false;
      }
      if (r.sourceType === 'task') {
        const t = taskMap.get(r.sourceId);
        if (t && t.caseId && !allowedCaseIds.has(t.caseId)) return false;
      }
      if (r.sourceType === 'file_return') {
        const f = fileMap.get(r.sourceId);
        if (f && f.caseId && !allowedCaseIds.has(f.caseId)) return false;
      }
      return true;
    });
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
    const store = localStore.getData();
    const firmId = currentUser.firmId;
    const now = new Date();
    const todayStr = getDhakaDateString(now);
    const nowMs = now.getTime();

    const allowedCaseIds = getVisibleCaseIdsForContext(context);

    // Today's hearings
    const todayHearings = (store.hearings || []).filter((h) => {
      if (h.firmId !== firmId || h.deletedAt !== null) return false;
      if (h.caseId && !allowedCaseIds.has(h.caseId)) return false;
      return getDhakaDateString(h.scheduledAt) === todayStr;
    });

    // Overdue tasks
    let tasks = (store.tasks || []).filter((t) => {
      if (t.firmId !== firmId || t.deletedAt !== null) return false;
      if (t.caseId && !allowedCaseIds.has(t.caseId)) return false;
      return true;
    });
    if (currentUser.role === 'Staff') {
      tasks = tasks.filter((t) => t.assignedTo === currentUser.id);
    }
    const overdueTasks = tasks.filter(
      (t) => t.status !== 'completed' && t.status !== 'cancelled' && new Date(t.dueAt).getTime() < nowMs
    );

    // Overdue file checkouts
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
    const appointments = (store.appointments || []).filter((a) => {
      if (a.firmId !== firmId || a.deletedAt !== null) return false;
      if (a.caseId && !allowedCaseIds.has(a.caseId)) return false;
      return getDhakaDateString(a.startsAt) === todayStr;
    });

    return {
      todayHearings,
      todayAppointments: appointments,
      overdueTasks,
      overdueFiles,
    };
  }

  async getUpcomingHearings(context: SecurityContext, days: number = 7): Promise<HearingRecord[]> {
    const { currentUser } = context;
    const store = localStore.getData();
    const firmId = currentUser.firmId;
    const now = new Date();
    const startMs = now.getTime();
    const endMs = startMs + days * 24 * 60 * 60 * 1000;

    const allowedCaseIds = getVisibleCaseIdsForContext(context);

    const hearings = (store.hearings || []).filter((h) => {
      if (h.firmId !== firmId || h.deletedAt !== null) return false;
      if (h.caseId && !allowedCaseIds.has(h.caseId)) return false;
      const t = new Date(h.scheduledAt).getTime();
      return t >= startMs && t <= endMs;
    });

    return hearings.sort((a, b) => new Date(a.scheduledAt).getTime() - new Date(b.scheduledAt).getTime());
  }
}
