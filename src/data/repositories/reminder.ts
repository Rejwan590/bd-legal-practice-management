import { can } from '../../permissions';
import { IAuditLogRepository, IReminderRepository } from '../interfaces';
import { localStore } from '../mockStore';
import {
  ReminderChannel,
  ReminderRecord,
  ReminderSourceType,
  ReminderStatus,
  SecurityContext,
} from '../types';
import { assertNotReadOnly, generateUUID } from './common';

export class MockReminderRepository implements IReminderRepository {
  private auditRepo: IAuditLogRepository;

  constructor(auditRepo: IAuditLogRepository) {
    this.auditRepo = auditRepo;
  }

  async list(
    context: SecurityContext,
    filter?: {
      status?: ReminderStatus | 'active';
      sourceType?: ReminderSourceType;
      userId?: string;
      search?: string;
    }
  ): Promise<ReminderRecord[]> {
    const { currentUser } = context;
    const store = localStore.getData();
    let reminders = (store.reminders || []).filter(
      (r) => r.firmId === currentUser.firmId && r.deletedAt === null
    );

    // Staff role partitioning: staff advocates only see reminders for themselves
    if (currentUser.role === 'Staff') {
      reminders = reminders.filter((r) => r.userId === currentUser.id);
    } else if (filter?.userId) {
      reminders = reminders.filter((r) => r.userId === filter.userId);
    }

    // Confidentiality isolation: hide reminders linked to restricted cases if caller lacks restricted.view
    const canSeeRestricted = can('restricted.view', currentUser);
    if (!canSeeRestricted) {
      const restrictedCaseIds = new Set(
        (store.cases || []).filter((c) => c.restricted).map((c) => c.id)
      );
      const hearingMap = new Map((store.hearings || []).map((h) => [h.id, h]));
      const taskMap = new Map((store.tasks || []).map((t) => [t.id, t]));
      const fileMap = new Map((store.physicalFiles || []).map((f) => [f.id, f]));
      reminders = reminders.filter((r) => {
        if (r.sourceType === 'hearing') {
          const h = hearingMap.get(r.sourceId);
          if (h && h.caseId && restrictedCaseIds.has(h.caseId)) return false;
        }
        if (r.sourceType === 'task') {
          const t = taskMap.get(r.sourceId);
          if (t && t.caseId && restrictedCaseIds.has(t.caseId)) return false;
        }
        if (r.sourceType === 'file_return') {
          const f = fileMap.get(r.sourceId);
          if (f && f.caseId && restrictedCaseIds.has(f.caseId)) return false;
        }
        return true;
      });
    }

    if (filter?.status) {
      if (filter.status === 'active') {
        reminders = reminders.filter((r) => r.status !== 'dismissed');
      } else {
        reminders = reminders.filter((r) => r.status === filter.status);
      }
    }

    if (filter?.sourceType) {
      reminders = reminders.filter((r) => r.sourceType === filter.sourceType);
    }

    if (filter?.search) {
      const q = filter.search.toLowerCase();
      reminders = reminders.filter(
        (r) =>
          r.title.toLowerCase().includes(q) ||
          (r.description && r.description.toLowerCase().includes(q))
      );
    }

    return reminders.sort(
      (a, b) => new Date(a.remindAt).getTime() - new Date(b.remindAt).getTime()
    );
  }

  async getDueReminders(context: SecurityContext): Promise<ReminderRecord[]> {
    const list = await this.list(context, { status: 'active' });
    const nowMs = Date.now();
    return list.filter((r) => new Date(r.remindAt).getTime() <= nowMs);
  }

  async create(
    context: SecurityContext,
    data: {
      userId: string;
      sourceType: ReminderSourceType;
      sourceId: string;
      title: string;
      description?: string;
      remindAt: string;
      dueAt: string;
      channel?: ReminderChannel;
    }
  ): Promise<ReminderRecord> {
    assertNotReadOnly(context.currentUser.firmId);
    const { currentUser } = context;
    const store = localStore.getData();
    const now = new Date().toISOString();
    // Task 5 SAFE ID: Use generateUUID() instead of Date.now() / Math.random()
    const id = generateUUID();

    const user = (store.users || []).find((u) => u.id === data.userId);
    const userName = user ? user.name : currentUser.name;

    const newReminder: ReminderRecord = {
      id,
      firmId: currentUser.firmId,
      userId: data.userId,
      userName,
      sourceType: data.sourceType,
      sourceId: data.sourceId,
      title: data.title.trim(),
      description: data.description ? data.description.trim() : undefined,
      remindAt: data.remindAt,
      dueAt: data.dueAt,
      channel: data.channel || 'in_app',
      status: 'pending',
      dismissedAt: null,
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
      createdBy: currentUser.id,
      updatedBy: currentUser.id,
    };

    localStore.mutate((s) => {
      s.reminders = [...(s.reminders || []), newReminder];
    });

    await this.auditRepo.record(context, {
      entity: 'Reminder',
      entityId: id,
      action: 'REMINDER_CREATE',
      oldValue: null,
      newValue: newReminder as unknown as Record<string, unknown>,
    });

    return newReminder;
  }

  async dismiss(context: SecurityContext, id: string): Promise<ReminderRecord> {
    assertNotReadOnly(context.currentUser.firmId);
    const { currentUser } = context;
    const store = localStore.getData();
    const existing = (store.reminders || []).find(
      (r) => r.id === id && r.firmId === currentUser.firmId && r.deletedAt === null
    );

    if (!existing) {
      throw new Error('Reminder not found');
    }

    if (currentUser.role === 'Staff' && existing.userId !== currentUser.id) {
      throw new Error('Permission denied: you cannot dismiss reminders of other advocates');
    }

    const oldSnapshot = { ...existing };
    const now = new Date().toISOString();
    let updated: ReminderRecord | null = null;

    localStore.mutate((s) => {
      const idx = (s.reminders || []).findIndex((r) => r.id === id);
      if (idx !== -1) {
        s.reminders[idx] = {
          ...s.reminders[idx],
          status: 'dismissed',
          dismissedAt: now,
          updatedAt: now,
          updatedBy: currentUser.id,
        };
        updated = { ...s.reminders[idx] };
      }
    });

    if (!updated) {
      throw new Error('Failed to dismiss reminder');
    }

    const finalRecord: ReminderRecord = updated;
    await this.auditRepo.record(context, {
      entity: 'Reminder',
      entityId: id,
      action: 'REMINDER_DISMISS',
      oldValue: oldSnapshot as unknown as Record<string, unknown>,
      newValue: finalRecord as unknown as Record<string, unknown>,
    });

    return finalRecord;
  }

  async clearBySourceId(
    context: SecurityContext,
    sourceId: string
  ): Promise<{ dismissedCount: number }> {
    const { currentUser } = context;
    const store = localStore.getData();
    const matching = (store.reminders || []).filter(
      (r) =>
        r.sourceId === sourceId &&
        r.firmId === currentUser.firmId &&
        r.status !== 'dismissed' &&
        r.deletedAt === null
    );

    if (matching.length === 0) return { dismissedCount: 0 };

    const now = new Date().toISOString();
    localStore.mutate((s) => {
      s.reminders = (s.reminders || []).map((r) => {
        if (r.sourceId === sourceId && r.firmId === currentUser.firmId) {
          return {
            ...r,
            status: 'dismissed',
            dismissedAt: now,
            updatedAt: now,
            updatedBy: currentUser.id,
          };
        }
        return r;
      });
    });

    return { dismissedCount: matching.length };
  }

  async rescheduleBySourceId(
    context: SecurityContext,
    sourceId: string,
    newDueAt: string,
    newRemindAt?: string
  ): Promise<{ updatedCount: number }> {
    const { currentUser } = context;
    const store = localStore.getData();
    const matching = (store.reminders || []).filter(
      (r) => r.sourceId === sourceId && r.firmId === currentUser.firmId && r.deletedAt === null
    );

    if (matching.length === 0) return { updatedCount: 0 };

    const now = new Date().toISOString();
    const calculatedRemindAt =
      newRemindAt ||
      new Date(new Date(newDueAt).getTime() - 24 * 60 * 60 * 1000).toISOString();

    localStore.mutate((s) => {
      s.reminders = (s.reminders || []).map((r) => {
        if (r.sourceId === sourceId && r.firmId === currentUser.firmId) {
          return {
            ...r,
            dueAt: newDueAt,
            remindAt: calculatedRemindAt,
            status: 'pending', // Re-activate for future hearing
            dismissedAt: null,
            updatedAt: now,
            updatedBy: currentUser.id,
          };
        }
        return r;
      });
    });

    return { updatedCount: matching.length };
  }

  async syncReminders(
    context: SecurityContext
  ): Promise<{ createdCount: number; updatedCount: number; activeReminders: ReminderRecord[] }> {
    const { currentUser } = context;
    const store = localStore.getData();
    let createdCount = 0;
    let updatedCount = 0;

    const existingReminders = store.reminders || [];

    // 1. Sync Hearings (upcoming hearings)
    const upcomingHearings = (store.hearings || []).filter(
      (h) => h.firmId === currentUser.firmId && h.status === 'scheduled' && h.deletedAt === null
    );

    for (const h of upcomingHearings) {
      const existing = existingReminders.find(
        (r) => r.sourceId === h.id && r.sourceType === 'hearing' && r.deletedAt === null
      );

      const hearingDate = new Date(h.scheduledAt);
      const remindAt = new Date(hearingDate.getTime() - 24 * 60 * 60 * 1000).toISOString();

      if (!existing) {
        const caseRec = (store.cases || []).find((c) => c.id === h.caseId);
        const title = caseRec
          ? `Court Hearing: ${caseRec.caseNumber}`
          : `Court Hearing: ${h.purpose}`;
        const description = caseRec
          ? `${caseRec.court} - ${h.purpose}`
          : `Scheduled hearing for chamber case matter`;

        await this.create(context, {
          userId: currentUser.id,
          sourceType: 'hearing',
          sourceId: h.id,
          title,
          description,
          remindAt,
          dueAt: h.scheduledAt,
        });
        createdCount++;
      } else if (existing.dueAt !== h.scheduledAt) {
        await this.rescheduleBySourceId(context, h.id, h.scheduledAt, remindAt);
        updatedCount++;
      }
    }

    // 2. Sync Incomplete Tasks
    const activeTasks = (store.tasks || []).filter(
      (t) =>
        t.firmId === currentUser.firmId &&
        t.status !== 'completed' &&
        t.status !== 'cancelled' &&
        t.deletedAt === null
    );

    for (const t of activeTasks) {
      const existing = existingReminders.find(
        (r) => r.sourceId === t.id && r.sourceType === 'task' && r.deletedAt === null
      );

      const taskDue = new Date(t.dueAt);
      const remindAt = new Date(taskDue.getTime() - 2 * 60 * 60 * 1000).toISOString();

      if (!existing) {
        await this.create(context, {
          userId: t.assignedTo,
          sourceType: 'task',
          sourceId: t.id,
          title: `Task Deadline: ${t.title}`,
          description: t.description || `Priority: ${t.priority}`,
          remindAt,
          dueAt: t.dueAt,
        });
        createdCount++;
      }
    }

    // 3. Sync Checked-Out Physical Files
    const checkedOutFiles = (store.physicalFiles || []).filter(
      (f) =>
        f.firmId === currentUser.firmId &&
        (f.status === 'checked_out' || f.status === 'in_court') &&
        f.dueBackAt &&
        f.deletedAt === null
    );

    for (const f of checkedOutFiles) {
      const existing = existingReminders.find(
        (r) => r.sourceId === f.id && r.sourceType === 'file_return' && r.deletedAt === null
      );

      if (!existing && f.currentHolderId && f.dueBackAt) {
        const fileDue = new Date(f.dueBackAt);
        const remindAt = new Date(fileDue.getTime() - 4 * 60 * 60 * 1000).toISOString();

        await this.create(context, {
          userId: f.currentHolderId,
          sourceType: 'file_return',
          sourceId: f.id,
          title: `File Return Due: ${f.serial} (${f.title})`,
          description: `Location: ${f.shelfLocation || 'Chamber Rack'}. Current holder: ${f.currentHolderName}`,
          remindAt,
          dueAt: f.dueBackAt,
        });
        createdCount++;
      }
    }

    const activeReminders = await this.list(context, { status: 'active' });
    return { createdCount, updatedCount, activeReminders };
  }
}
