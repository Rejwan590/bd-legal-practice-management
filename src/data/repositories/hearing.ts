import { can } from '../../permissions';
import {
  CaseHearingsOverview,
  IAuditLogRepository,
  IHearingRepository,
  IReminderRepository,
} from '../interfaces';
import { localStore } from '../mockStore';
import {
  HearingDateHistoryRecord,
  HearingRecord,
  HearingStatus,
  SecurityContext,
} from '../types';
import { getVisibleCaseIdsForContext, syncCaseNextHearing } from './case';
import { assertNotReadOnly, generateUUID } from './common';

export class MockHearingRepository implements IHearingRepository {
  private auditRepo: IAuditLogRepository;
  public reminderRepo?: IReminderRepository;

  constructor(auditRepo: IAuditLogRepository, reminderRepo?: IReminderRepository) {
    this.auditRepo = auditRepo;
    this.reminderRepo = reminderRepo;
  }

  async list(
    context: SecurityContext,
    filter?: {
      caseId?: string;
      status?: HearingStatus;
      fromDate?: string;
      toDate?: string;
      fixedFor?: string;
    }
  ): Promise<HearingRecord[]> {
    if (!can('cases.view', context.currentUser)) {
      throw new Error('Permission denied: cases.view required to view hearings');
    }

    const { currentUser } = context;
    const store = localStore.getData();
    const visibleCaseIds = getVisibleCaseIdsForContext(context);

    let hearings = (store.hearings || []).filter((h) => {
      if (h.firmId !== currentUser.firmId) return false;
      if (h.deletedAt !== null) return false;
      if (!visibleCaseIds.has(h.caseId)) return false;
      return true;
    });

    if (filter?.caseId) {
      hearings = hearings.filter((h) => h.caseId === filter.caseId);
    }

    if (filter?.status) {
      hearings = hearings.filter((h) => h.status === filter.status);
    }

    if (filter?.fromDate) {
      hearings = hearings.filter((h) => new Date(h.scheduledAt) >= new Date(filter.fromDate!));
    }

    if (filter?.toDate) {
      hearings = hearings.filter((h) => new Date(h.scheduledAt) <= new Date(filter.toDate!));
    }

    if (filter?.fixedFor) {
      hearings = hearings.filter((h) => h.fixedFor === filter.fixedFor);
    }

    // Sort ascending by scheduled date
    return hearings.sort(
      (a, b) => new Date(a.scheduledAt).getTime() - new Date(b.scheduledAt).getTime()
    );
  }

  async getById(context: SecurityContext, id: string): Promise<HearingRecord | null> {
    if (!can('cases.view', context.currentUser)) {
      throw new Error('Permission denied: cases.view required');
    }

    const { currentUser } = context;
    const store = localStore.getData();
    const hearing = (store.hearings || []).find(
      (h) => h.id === id && h.firmId === currentUser.firmId && h.deletedAt === null
    );

    if (!hearing) return null;

    const targetCase = (store.cases || []).find((c) => c.id === hearing.caseId);
    if (targetCase?.restricted && !can('restricted.view', currentUser)) {
      throw new Error('Permission denied: restricted.view required for this hearing');
    }

    const visibleCaseIds = getVisibleCaseIdsForContext(context);
    if (!visibleCaseIds.has(hearing.caseId)) {
      return null;
    }

    return hearing;
  }

  async create(
    context: SecurityContext,
    data: {
      caseId: string;
      appearingLawyerId?: string | null;
      scheduledAt: string;
      purpose: string;
      court?: string;
      outcomeNote?: string;
      fixedFor?: string;
      fixedForNote?: string | null;
    }
  ): Promise<HearingRecord> {
    if (!can('hearings.update', context.currentUser)) {
      throw new Error('Permission denied: hearings.update required to schedule hearing');
    }
    assertNotReadOnly(context.currentUser.firmId);

    const { currentUser } = context;
    const store = localStore.getData();
    const visibleCaseIds = getVisibleCaseIdsForContext(context);
    const targetCase = (store.cases || []).find(
      (c) =>
        c.id === data.caseId &&
        c.firmId === currentUser.firmId &&
        c.deletedAt === null &&
        visibleCaseIds.has(c.id)
    );

    if (!targetCase) {
      throw new Error('Case not found');
    }

    const now = new Date().toISOString();
    const newHearing: HearingRecord = {
      id: generateUUID(),
      firmId: currentUser.firmId,
      caseId: data.caseId,
      appearingLawyerId:
        data.appearingLawyerId !== undefined
          ? data.appearingLawyerId
          : targetCase.responsibleLawyerId ?? null,
      scheduledAt: data.scheduledAt,
      court: data.court || targetCase.court,
      purpose: data.purpose.trim(),
      status: 'scheduled',
      outcomeNote: data.outcomeNote?.trim() || undefined,
      fixedFor: data.fixedFor || 'hearing',
      fixedForNote: data.fixedForNote?.trim() || null,
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
      createdBy: currentUser.id,
      updatedBy: currentUser.id,
    };

    localStore.mutate((s) => {
      if (!s.hearings) s.hearings = [];
      s.hearings.push(newHearing);
      syncCaseNextHearing(currentUser.firmId, data.caseId);
    });

    await this.auditRepo.record(context, {
      entity: 'Hearing',
      entityId: newHearing.id,
      action: 'CREATE',
      oldValue: null,
      newValue: {
        caseId: newHearing.caseId,
        appearingLawyerId: newHearing.appearingLawyerId,
        scheduledAt: newHearing.scheduledAt,
        purpose: newHearing.purpose,
      },
    });

    return newHearing;
  }

  async update(
    context: SecurityContext,
    id: string,
    data: Partial<Omit<HearingRecord, 'id' | 'firmId' | 'caseId' | 'createdAt' | 'deletedAt' | 'createdBy'>>
  ): Promise<HearingRecord> {
    if (!can('hearings.update', context.currentUser)) {
      throw new Error('Permission denied: hearings.update required to modify hearing');
    }
    assertNotReadOnly(context.currentUser.firmId);

    const { currentUser } = context;
    const store = localStore.getData();
    const existing = (store.hearings || []).find(
      (h) => h.id === id && h.firmId === currentUser.firmId && h.deletedAt === null
    );

    if (!existing) {
      throw new Error('Hearing not found');
    }

    const oldSnapshot = { ...existing };
    const now = new Date().toISOString();
    let updated: HearingRecord | null = null;

    localStore.mutate((s) => {
      const idx = (s.hearings || []).findIndex((h) => h.id === id);
      if (idx !== -1) {
        s.hearings[idx] = {
          ...s.hearings[idx],
          ...data,
          updatedAt: now,
          updatedBy: currentUser.id,
        };
        updated = { ...s.hearings[idx] };
        syncCaseNextHearing(currentUser.firmId, existing.caseId);
      }
    });

    if (!updated) {
      throw new Error('Failed to update hearing');
    }

    await this.auditRepo.record(context, {
      entity: 'Hearing',
      entityId: id,
      action: 'UPDATE',
      oldValue: oldSnapshot as unknown as Record<string, unknown>,
      newValue: updated as unknown as Record<string, unknown>,
    });

    return updated;
  }

  async rescheduleDate(
    context: SecurityContext,
    hearingId: string,
    newDate: string,
    reason: string,
    fixedFor?: string,
    fixedForNote?: string | null
  ): Promise<{ hearing: HearingRecord; history: HearingDateHistoryRecord }> {
    if (!can('hearings.update', context.currentUser)) {
      throw new Error('Permission denied: hearings.update required to reschedule hearing');
    }
    assertNotReadOnly(context.currentUser.firmId);

    const { currentUser } = context;
    const store = localStore.getData();
    const hearing = (store.hearings || []).find(
      (h) => h.id === hearingId && h.firmId === currentUser.firmId && h.deletedAt === null
    );

    if (!hearing) {
      throw new Error('Hearing not found');
    }

    const oldDate = hearing.scheduledAt;
    const now = new Date().toISOString();

    const newFixedFor = fixedFor || hearing.fixedFor || 'hearing';
    const historyRecord: HearingDateHistoryRecord = {
      id: generateUUID(),
      firmId: currentUser.firmId,
      hearingId,
      caseId: hearing.caseId,
      oldAt: oldDate,
      newAt: newDate,
      reason: reason.trim(),
      oldFixedFor: hearing.fixedFor ?? null,
      newFixedFor,
      changedBy: currentUser.id,
      changedByName: currentUser.name,
      changedAt: now,
    };

    let updatedHearing: HearingRecord | null = null;

    localStore.mutate((s) => {
      if (!s.hearingDateHistory) s.hearingDateHistory = [];
      s.hearingDateHistory.unshift(historyRecord);

      const target = (s.hearings || []).find((h) => h.id === hearingId);
      if (target) {
        target.scheduledAt = newDate;
        target.fixedFor = newFixedFor;
        if (fixedForNote !== undefined) target.fixedForNote = fixedForNote?.trim() || null;
        target.updatedAt = now;
        target.updatedBy = currentUser.id;
        updatedHearing = { ...target };
      }
      syncCaseNextHearing(currentUser.firmId, hearing.caseId);
    });

    if (!updatedHearing) {
      throw new Error('Failed to reschedule hearing');
    }

    await this.auditRepo.record(context, {
      entity: 'Hearing',
      entityId: hearingId,
      action: 'HEARING_DATE_CHANGE',
      oldValue: { scheduledAt: oldDate },
      newValue: { scheduledAt: newDate, reason: reason.trim() },
    });

    if (this.reminderRepo) {
      await this.reminderRepo.rescheduleBySourceId(context, hearingId, newDate);
    }

    return { hearing: updatedHearing, history: historyRecord };
  }

  async adjournAndScheduleNext(
    context: SecurityContext,
    hearingId: string,
    outcomeNote: string,
    nextDate: string,
    nextPurpose: string,
    reason: string,
    nextFixedFor?: string,
    nextFixedForNote?: string | null
  ): Promise<{
    adjournedHearing: HearingRecord;
    nextHearing: HearingRecord;
    history: HearingDateHistoryRecord;
  }> {
    if (!can('hearings.update', context.currentUser)) {
      throw new Error('Permission denied: hearings.update required to adjourn hearing');
    }
    assertNotReadOnly(context.currentUser.firmId);

    const { currentUser } = context;
    const store = localStore.getData();
    const hearing = (store.hearings || []).find(
      (h) => h.id === hearingId && h.firmId === currentUser.firmId && h.deletedAt === null
    );

    if (!hearing) {
      throw new Error('Hearing not found');
    }

    const now = new Date().toISOString();
    const oldDate = hearing.scheduledAt;

    const resolvedNextFixedFor = nextFixedFor || hearing.fixedFor || 'hearing';
    const historyRecord: HearingDateHistoryRecord = {
      id: generateUUID(),
      firmId: currentUser.firmId,
      hearingId,
      caseId: hearing.caseId,
      oldAt: oldDate,
      newAt: nextDate,
      reason: reason.trim(),
      oldFixedFor: hearing.fixedFor ?? null,
      newFixedFor: resolvedNextFixedFor,
      changedBy: currentUser.id,
      changedByName: currentUser.name,
      changedAt: now,
    };

    const nextHearing: HearingRecord = {
      id: generateUUID(),
      firmId: currentUser.firmId,
      caseId: hearing.caseId,
      scheduledAt: nextDate,
      court: hearing.court,
      purpose: nextPurpose.trim(),
      status: 'scheduled',
      outcomeNote: undefined,
      fixedFor: resolvedNextFixedFor,
      fixedForNote: nextFixedForNote?.trim() || null,
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
      createdBy: currentUser.id,
      updatedBy: currentUser.id,
    };

    let adjournedHearing: HearingRecord | null = null;

    localStore.mutate((s) => {
      // 1. Mark current hearing as adjourned with outcome note
      const current = (s.hearings || []).find((h) => h.id === hearingId);
      if (current) {
        current.status = 'adjourned';
        current.outcomeNote = outcomeNote.trim();
        current.updatedAt = now;
        current.updatedBy = currentUser.id;
        adjournedHearing = { ...current };
      }

      // 2. Add next hearing
      if (!s.hearings) s.hearings = [];
      s.hearings.push(nextHearing);

      // 3. Record date history
      if (!s.hearingDateHistory) s.hearingDateHistory = [];
      s.hearingDateHistory.unshift(historyRecord);

      // 4. Update case next_hearing_at
      syncCaseNextHearing(currentUser.firmId, hearing.caseId);
    });

    if (!adjournedHearing) {
      throw new Error('Failed to adjourn hearing');
    }

    await this.auditRepo.record(context, {
      entity: 'Hearing',
      entityId: hearingId,
      action: 'HEARING_DATE_CHANGE',
      oldValue: { scheduledAt: oldDate, status: 'scheduled' },
      newValue: {
        scheduledAt: nextDate,
        adjournedStatus: 'adjourned',
        reason: reason.trim(),
        outcomeNote: outcomeNote.trim(),
      },
    });

    if (this.reminderRepo) {
      await this.reminderRepo.rescheduleBySourceId(context, hearingId, nextDate);
    }

    return {
      adjournedHearing,
      nextHearing,
      history: historyRecord,
    };
  }

  async getDateHistory(
    context: SecurityContext,
    hearingId: string
  ): Promise<HearingDateHistoryRecord[]> {
    if (!can('cases.view', context.currentUser)) {
      throw new Error('Permission denied: cases.view required');
    }

    const { currentUser } = context;
    const store = localStore.getData();

    return (store.hearingDateHistory || [])
      .filter((h) => h.hearingId === hearingId && h.firmId === currentUser.firmId)
      .sort((a, b) => new Date(b.changedAt).getTime() - new Date(a.changedAt).getTime());
  }

  async getCaseHearingsOverview(
    context: SecurityContext,
    caseId: string
  ): Promise<CaseHearingsOverview> {
    if (!can('cases.view', context.currentUser)) {
      throw new Error('Permission denied: cases.view required');
    }

    const { currentUser } = context;
    const store = localStore.getData();
    const hearings = (store.hearings || []).filter(
      (h) => h.caseId === caseId && h.firmId === currentUser.firmId && h.deletedAt === null
    );

    hearings.sort((a, b) => new Date(a.scheduledAt).getTime() - new Date(b.scheduledAt).getTime());

    const now = new Date();
    const todayStr = now.toISOString().slice(0, 10);

    let previousHearing: HearingRecord | null = null;
    let currentHearing: HearingRecord | null = null;
    let nextHearing: HearingRecord | null = null;

    // Check today's hearing
    currentHearing =
      hearings.find(
        (h) => h.scheduledAt.slice(0, 10) === todayStr && h.status === 'scheduled'
      ) || null;

    // Next scheduled upcoming hearing
    const upcoming = hearings.filter(
      (h) =>
        h.status === 'scheduled' &&
        new Date(h.scheduledAt).getTime() >= now.getTime() &&
        h.id !== currentHearing?.id
    );
    nextHearing = upcoming[0] || null;

    // Previous held or past hearing
    const past = hearings.filter(
      (h) =>
        h.status === 'held' ||
        h.status === 'adjourned' ||
        new Date(h.scheduledAt).getTime() < now.getTime()
    );
    previousHearing = past[past.length - 1] || null;

    return {
      previousHearing,
      currentHearing,
      nextHearing,
      allHearings: hearings,
    };
  }
}
