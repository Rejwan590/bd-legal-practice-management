import { can } from '../../permissions';
import { canUserSeeAppointment, filterVisibleAppointments } from '../appointmentVisibility';
import { IAppointmentRepository, IAuditLogRepository } from '../interfaces';
import { localStore } from '../mockStore';
import { AppointmentRecord, SecurityContext } from '../types';
import { assertNotReadOnly, generateUUID } from './common';

export class MockAppointmentRepository implements IAppointmentRepository {
  private auditRepo: IAuditLogRepository;

  constructor(auditRepo: IAuditLogRepository) {
    this.auditRepo = auditRepo;
  }

  async list(
    context: SecurityContext,
    filter?: {
      status?: AppointmentRecord['status'] | 'all';
      type?: AppointmentRecord['type'] | 'all';
      fromDate?: string;
      toDate?: string;
      clientId?: string;
      caseId?: string;
      search?: string;
    }
  ): Promise<AppointmentRecord[]> {
    if (!can('appointments.view', context.currentUser)) {
      throw new Error('Permission denied: appointments.view required');
    }

    const { currentUser } = context;
    const store = localStore.getData();
    const firm =
      store.firm.id === currentUser.firmId
        ? store.firm
        : { ...store.firm, id: currentUser.firmId, visibilityMode: 'open' as const };

    let results = filterVisibleAppointments(
      currentUser,
      store.appointments || [],
      firm,
      store.cases || [],
      store.users || [],
      store.caseShares || []
    );

    if (filter?.status && filter.status !== 'all') {
      results = results.filter((a) => a.status === filter.status);
    }
    if (filter?.type && filter.type !== 'all') {
      results = results.filter((a) => a.type === filter.type);
    }
    if (filter?.clientId) {
      results = results.filter((a) => a.clientId === filter.clientId);
    }
    if (filter?.caseId) {
      results = results.filter((a) => a.caseId === filter.caseId);
    }
    if (filter?.fromDate) {
      results = results.filter((a) => new Date(a.startsAt) >= new Date(filter.fromDate!));
    }
    if (filter?.toDate) {
      results = results.filter((a) => new Date(a.startsAt) <= new Date(filter.toDate!));
    }
    if (filter?.search && filter.search.trim()) {
      const q = filter.search.trim().toLowerCase();
      results = results.filter(
        (a) =>
          a.title.toLowerCase().includes(q) ||
          (a.location && a.location.toLowerCase().includes(q)) ||
          (a.notes && a.notes.toLowerCase().includes(q))
      );
    }

    // Sort by scheduled start ascending
    return results.sort(
      (a, b) => new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime()
    );
  }

  async getById(context: SecurityContext, id: string): Promise<AppointmentRecord | null> {
    if (!can('appointments.view', context.currentUser)) {
      throw new Error('Permission denied: appointments.view required');
    }

    const { currentUser } = context;
    const store = localStore.getData();
    const found = (store.appointments || []).find(
      (a) => a.id === id && a.firmId === currentUser.firmId && a.deletedAt === null
    );
    if (!found) return null;

    const firm =
      store.firm.id === currentUser.firmId
        ? store.firm
        : { ...store.firm, id: currentUser.firmId, visibilityMode: 'open' as const };

    if (
      !canUserSeeAppointment(
        currentUser,
        found,
        firm,
        store.cases || [],
        store.users || [],
        store.caseShares || []
      )
    ) {
      return null;
    }

    return found;
  }

  private checkOverlap(
    firmId: string,
    startsAt: string,
    endsAt: string,
    userIds: string[],
    excludeId?: string
  ): boolean {
    const store = localStore.getData();
    const start = new Date(startsAt).getTime();
    const end = new Date(endsAt).getTime();

    const otherAppts = (store.appointments || []).filter(
      (a) =>
        a.firmId === firmId &&
        a.deletedAt === null &&
        a.status === 'scheduled' &&
        a.id !== excludeId
    );

    for (const a of otherAppts) {
      const aStart = new Date(a.startsAt).getTime();
      const aEnd = new Date(a.endsAt).getTime();
      const hasTimeOverlap = aStart < end && aEnd > start;
      if (hasTimeOverlap) {
        const otherUsers = new Set<string>([a.organiserUserId, ...(a.attendees || [])]);
        for (const uid of userIds) {
          if (otherUsers.has(uid)) {
            return true;
          }
        }
      }
    }
    return false;
  }

  async create(
    context: SecurityContext,
    data: {
      title: string;
      type: AppointmentRecord['type'];
      startsAt: string;
      endsAt: string;
      mode?: AppointmentRecord['mode'];
      location?: string | null;
      clientId?: string | null;
      caseId?: string | null;
      notes?: string | null;
      reminderMinutesBefore?: number;
      attendees?: string[];
    }
  ): Promise<AppointmentRecord & { overlapWarning?: boolean }> {
    if (!can('appointments.manage', context.currentUser)) {
      throw new Error('Permission denied: appointments.manage required to create appointments');
    }
    assertNotReadOnly(context.currentUser.firmId);

    const { currentUser } = context;
    const now = new Date().toISOString();
    const attendeeUserIds = data.attendees ? Array.from(new Set(data.attendees)) : [];
    if (!attendeeUserIds.includes(currentUser.id)) {
      attendeeUserIds.unshift(currentUser.id);
    }

    const hasOverlap = this.checkOverlap(
      currentUser.firmId,
      data.startsAt,
      data.endsAt,
      attendeeUserIds
    );

    const newAppt: AppointmentRecord = {
      id: generateUUID(),
      firmId: currentUser.firmId,
      title: data.title.trim(),
      type: data.type,
      startsAt: data.startsAt,
      endsAt: data.endsAt,
      mode: data.mode || 'in_person',
      location: data.location?.trim() || null,
      organiserUserId: currentUser.id,
      clientId: data.clientId || null,
      caseId: data.caseId || null,
      status: 'scheduled',
      notes: data.notes?.trim() || null,
      reminderMinutesBefore: data.reminderMinutesBefore ?? 30,
      attendees: attendeeUserIds,
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
      createdBy: currentUser.id,
      updatedBy: currentUser.id,
    };

    localStore.mutate((store) => {
      if (!store.appointments) store.appointments = [];
      store.appointments.push(newAppt);

      if (!store.appointmentAttendees) store.appointmentAttendees = [];
      for (const uid of attendeeUserIds) {
        store.appointmentAttendees.push({
          id: generateUUID(),
          appointmentId: newAppt.id,
          userId: uid,
          firmId: currentUser.firmId,
          createdAt: now,
          updatedAt: now,
        });
      }

      // Create in-app reminder
      if (newAppt.reminderMinutesBefore > 0) {
        const startMs = new Date(newAppt.startsAt).getTime();
        const remindMs = startMs - newAppt.reminderMinutesBefore * 60 * 1000;
        if (!store.reminders) store.reminders = [];
        store.reminders.push({
          id: generateUUID(),
          firmId: currentUser.firmId,
          userId: currentUser.id,
          userName: currentUser.name,
          sourceType: 'appointment',
          sourceId: newAppt.id,
          title: `Appointment: ${newAppt.title}`,
          description: `Starts at ${new Date(newAppt.startsAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`,
          remindAt: new Date(remindMs).toISOString(),
          dueAt: newAppt.startsAt,
          channel: 'in_app',
          status: 'pending',
          createdAt: now,
          updatedAt: now,
          deletedAt: null,
          createdBy: currentUser.id,
          updatedBy: currentUser.id,
        });
      }
    });

    await this.auditRepo.record(context, {
      entity: 'Appointment',
      entityId: newAppt.id,
      action: 'CREATE',
      oldValue: null,
      newValue: {
        title: newAppt.title,
        type: newAppt.type,
        startsAt: newAppt.startsAt,
        endsAt: newAppt.endsAt,
        attendees: attendeeUserIds,
      },
    });

    return {
      ...newAppt,
      overlapWarning: hasOverlap,
    };
  }

  async update(
    context: SecurityContext,
    id: string,
    data: Partial<{
      title: string;
      type: AppointmentRecord['type'];
      startsAt: string;
      endsAt: string;
      mode: AppointmentRecord['mode'];
      location: string | null;
      clientId: string | null;
      caseId: string | null;
      status: AppointmentRecord['status'];
      notes: string | null;
      reminderMinutesBefore: number;
      attendees: string[];
      rescheduleReason?: string;
    }>
  ): Promise<AppointmentRecord & { overlapWarning?: boolean }> {
    if (!can('appointments.manage', context.currentUser)) {
      throw new Error('Permission denied: appointments.manage required to update appointments');
    }
    assertNotReadOnly(context.currentUser.firmId);

    const { currentUser } = context;
    const store = localStore.getData();
    const existing = (store.appointments || []).find(
      (a) => a.id === id && a.firmId === currentUser.firmId && a.deletedAt === null
    );
    if (!existing) throw new Error('Appointment not found');

    const targetStartsAt = data.startsAt || existing.startsAt;
    const targetEndsAt = data.endsAt || existing.endsAt;
    const targetAttendees = data.attendees !== undefined ? data.attendees : (existing.attendees || [existing.organiserUserId]);

    const isRescheduled = data.startsAt && data.startsAt !== existing.startsAt;
    const hasOverlap = this.checkOverlap(
      currentUser.firmId,
      targetStartsAt,
      targetEndsAt,
      targetAttendees,
      id
    );

    const oldSnapshot = { ...existing };
    const now = new Date().toISOString();
    let updated: AppointmentRecord | null = null;

    localStore.mutate((s) => {
      const idx = (s.appointments || []).findIndex((a) => a.id === id);
      if (idx !== -1) {
        s.appointments![idx] = {
          ...s.appointments![idx],
          ...data,
          attendees: targetAttendees,
          updatedAt: now,
          updatedBy: currentUser.id,
        };
        updated = { ...s.appointments![idx] };
      }

      if (data.attendees !== undefined && s.appointmentAttendees) {
        s.appointmentAttendees = s.appointmentAttendees.filter((att) => att.appointmentId !== id);
        for (const uid of targetAttendees) {
          s.appointmentAttendees.push({
            id: generateUUID(),
            appointmentId: id,
            userId: uid,
            firmId: currentUser.firmId,
            createdAt: now,
            updatedAt: now,
          });
        }
      }
    });

    if (!updated) throw new Error('Failed to update appointment');

    await this.auditRepo.record(context, {
      entity: 'Appointment',
      entityId: id,
      action: isRescheduled ? 'UPDATE' : 'UPDATE',
      oldValue: oldSnapshot as unknown as Record<string, unknown>,
      newValue: {
        ...((updated as unknown as Record<string, unknown>) || {}),
        rescheduled: isRescheduled,
        rescheduleReason: data.rescheduleReason || null,
      },
    });

    return {
      ...(updated as AppointmentRecord),
      overlapWarning: hasOverlap,
    };
  }

  async delete(
    context: SecurityContext,
    id: string
  ): Promise<{ success: boolean; softDeleted: true }> {
    if (!can('appointments.manage', context.currentUser)) {
      throw new Error('Permission denied: appointments.manage required to delete appointments');
    }
    assertNotReadOnly(context.currentUser.firmId);

    const { currentUser } = context;
    const store = localStore.getData();
    const existing = (store.appointments || []).find(
      (a) => a.id === id && a.firmId === currentUser.firmId && a.deletedAt === null
    );
    if (!existing) throw new Error('Appointment not found');

    const oldSnapshot = { ...existing };
    const now = new Date().toISOString();

    localStore.mutate((s) => {
      const target = (s.appointments || []).find((a) => a.id === id);
      if (target) {
        target.deletedAt = now;
        target.updatedAt = now;
        target.updatedBy = currentUser.id;
      }
      if (s.reminders) {
        s.reminders = s.reminders.filter(
          (r) => !(r.sourceType === 'appointment' && r.sourceId === id)
        );
      }
    });

    await this.auditRepo.record(context, {
      entity: 'Appointment',
      entityId: id,
      action: 'DELETE',
      oldValue: oldSnapshot as unknown as Record<string, unknown>,
      newValue: { deletedAt: now, softDeleted: true },
    });

    return { success: true, softDeleted: true };
  }
}
