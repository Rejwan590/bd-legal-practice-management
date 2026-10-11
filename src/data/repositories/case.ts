import { can } from '../../permissions';
import { isLawyerOrOwner } from '../../rolePresets';
import { canUserSeeCase, filterVisibleCases } from '../caseVisibility';
import { IAuditLogRepository, ICaseRepository } from '../interfaces';
import { localStore } from '../mockStore';
import { BaseRecord, CaseRecord, CaseShareRecord, SecurityContext } from '../types';
import { assertNotReadOnly, generateUUID } from './common';

export function getVisibleCaseIdsForContext(context: SecurityContext): Set<string> {
  const { currentUser } = context;
  const store = localStore.getData();
  const firm =
    store.firm.id === currentUser.firmId
      ? store.firm
      : { ...store.firm, id: currentUser.firmId, visibilityMode: 'open' as const };
  const visible = filterVisibleCases(
    currentUser,
    store.cases || [],
    firm,
    store.users || [],
    store.caseShares || []
  );
  return new Set(visible.map((c) => c.id));
}

export function syncCaseNextHearing(firmId: string, caseId: string) {
  const store = localStore.getData();
  const scheduledHearings = (store.hearings || []).filter(
    (h) =>
      h.caseId === caseId &&
      h.firmId === firmId &&
      h.deletedAt === null &&
      h.status === 'scheduled'
  );

  scheduledHearings.sort(
    (a, b) => new Date(a.scheduledAt).getTime() - new Date(b.scheduledAt).getTime()
  );

  const nextHearing = scheduledHearings[0] || null;
  const targetCase = (store.cases || []).find((c) => c.id === caseId);
  if (targetCase) {
    targetCase.nextHearingAt = nextHearing ? nextHearing.scheduledAt : null;
    targetCase.updatedAt = new Date().toISOString();
  }
}

export class MockCaseRepository implements ICaseRepository {
  private auditRepo: IAuditLogRepository;

  constructor(auditRepo: IAuditLogRepository) {
    this.auditRepo = auditRepo;
  }

  async list(
    context: SecurityContext,
    filter?: {
      search?: string;
      status?: 'ongoing' | 'closed' | 'all';
      court?: string;
      matterType?: string;
      clientId?: string;
      scope?: 'my' | 'team' | 'all';
    }
  ): Promise<CaseRecord[]> {
    if (!can('cases.view', context.currentUser)) {
      throw new Error('Permission denied: cases.view required to view cases');
    }

    const { currentUser } = context;
    const store = localStore.getData();
    const firm =
      store.firm.id === currentUser.firmId
        ? store.firm
        : { ...store.firm, id: currentUser.firmId, visibilityMode: 'open' as const };

    let cases = filterVisibleCases(
      currentUser,
      store.cases || [],
      firm,
      store.users || [],
      store.caseShares || []
    );

    if (filter?.scope) {
      const uid = currentUser.id;
      if (filter.scope === 'my') {
        cases = cases.filter((c) => c.responsibleLawyerId === uid || c.createdBy === uid);
      } else if (filter.scope === 'team') {
        const firmUsers = (store.users || []).filter(
          (u) => u.firmId === currentUser.firmId && !u.deletedAt
        );
        const me = firmUsers.find((u) => u.id === uid);
        const teamIds = new Set<string>([uid]);
        if (me?.reportsToUserId) teamIds.add(me.reportsToUserId);
        for (const u of firmUsers) {
          if (u.reportsToUserId === uid) teamIds.add(u.id);
        }
        cases = cases.filter((c) => c.responsibleLawyerId && teamIds.has(c.responsibleLawyerId));
      }
    }

    if (filter?.clientId) {
      cases = cases.filter((c) => c.clientId === filter.clientId);
    }

    if (filter?.status && filter.status !== 'all') {
      cases = cases.filter((c) => c.status === filter.status);
    }

    if (filter?.court && filter.court !== 'ALL') {
      cases = cases.filter((c) => c.court.toLowerCase().includes(filter.court!.toLowerCase()));
    }

    if (filter?.matterType && filter.matterType !== 'ALL') {
      cases = cases.filter((c) =>
        c.matterType.toLowerCase().includes(filter.matterType!.toLowerCase())
      );
    }

    if (filter?.search && filter.search.trim()) {
      const q = filter.search.trim().toLowerCase();
      cases = cases.filter(
        (c) =>
          c.caseNumber.toLowerCase().includes(q) ||
          c.plaintiff.toLowerCase().includes(q) ||
          c.defendant.toLowerCase().includes(q) ||
          c.court.toLowerCase().includes(q) ||
          c.matterType.toLowerCase().includes(q) ||
          c.fileSerial.toLowerCase().includes(q) ||
          c.plaintiffLawyer.toLowerCase().includes(q) ||
          c.defendantLawyer.toLowerCase().includes(q)
      );
    }

    // Sort descending by creation date
    return cases.sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
  }

  async getById(context: SecurityContext, id: string): Promise<CaseRecord | null> {
    if (!can('cases.view', context.currentUser)) {
      throw new Error('Permission denied: cases.view required');
    }

    const { currentUser } = context;
    const store = localStore.getData();
    const found = (store.cases || []).find(
      (c) => c.id === id && c.firmId === currentUser.firmId && c.deletedAt === null
    );

    if (!found) return null;

    if (found.restricted && !can('restricted.view', currentUser)) {
      throw new Error('Permission denied: restricted.view required to view this confidential case');
    }

    const firm =
      store.firm.id === currentUser.firmId
        ? store.firm
        : { ...store.firm, id: currentUser.firmId, visibilityMode: 'open' as const };
    if (
      !canUserSeeCase(
        currentUser,
        found,
        firm,
        store.users || [],
        store.caseShares || []
      )
    ) {
      return null;
    }

    return found;
  }

  async getByClientId(context: SecurityContext, clientId: string): Promise<CaseRecord[]> {
    return this.list(context, { clientId });
  }

  async checkDuplicate(
    context: SecurityContext,
    caseNumber: string,
    court: string,
    excludeId?: string
  ): Promise<boolean> {
    const visibleCases = await this.list(context);
    const cleanNum = caseNumber.trim().toLowerCase();
    const cleanCourt = court.trim().toLowerCase();

    return visibleCases.some(
      (c) =>
        c.id !== excludeId &&
        c.caseNumber.trim().toLowerCase() === cleanNum &&
        c.court.trim().toLowerCase() === cleanCourt
    );
  }

  async create(
    context: SecurityContext,
    data: Omit<CaseRecord, keyof BaseRecord | 'nextHearingAt'>
  ): Promise<CaseRecord> {
    if (!can('cases.create', context.currentUser)) {
      throw new Error('Permission denied: cases.create required to register case');
    }
    assertNotReadOnly(context.currentUser.firmId);

    const { currentUser } = context;

    if (data.restricted && !can('restricted.view', currentUser)) {
      throw new Error('Permission denied: restricted.view required to create confidential cases');
    }

    let resolvedRespLawyerId: string | null = data.responsibleLawyerId ?? null;
    if (!resolvedRespLawyerId) {
      if (isLawyerOrOwner(currentUser.role, currentUser.jobType)) {
        resolvedRespLawyerId = currentUser.id;
      } else if (currentUser.reportsToUserId) {
        resolvedRespLawyerId = currentUser.reportsToUserId;
      }
    }

    const now = new Date().toISOString();
    const newCase: CaseRecord = {
      id: generateUUID(),
      firmId: currentUser.firmId,
      clientId: data.clientId,
      fileSerial: data.fileSerial.trim(),
      caseNumber: data.caseNumber.trim(),
      court: data.court.trim(),
      matterType: data.matterType.trim(),
      description: data.description.trim(),
      plaintiff: data.plaintiff.trim(),
      defendant: data.defendant.trim(),
      ourRole: data.ourRole,
      plaintiffLawyer: data.plaintiffLawyer.trim(),
      defendantLawyer: data.defendantLawyer.trim(),
      responsibleLawyerId: resolvedRespLawyerId,
      status: data.status,
      restricted: Boolean(data.restricted),
      nextHearingAt: null,
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
      createdBy: currentUser.id,
      updatedBy: currentUser.id,
    };

    localStore.mutate((store) => {
      if (!store.cases) store.cases = [];
      store.cases.unshift(newCase);
    });

    await this.auditRepo.record(context, {
      entity: 'Case',
      entityId: newCase.id,
      action: 'CREATE',
      oldValue: null,
      newValue: {
        caseNumber: newCase.caseNumber,
        court: newCase.court,
        clientId: newCase.clientId,
        plaintiff: newCase.plaintiff,
        defendant: newCase.defendant,
        responsibleLawyerId: newCase.responsibleLawyerId,
        restricted: newCase.restricted,
      },
    });

    return newCase;
  }

  async update(
    context: SecurityContext,
    id: string,
    data: Partial<Omit<CaseRecord, 'id' | 'firmId' | 'createdAt' | 'deletedAt' | 'createdBy'>>
  ): Promise<CaseRecord> {
    if (!can('cases.edit', context.currentUser)) {
      throw new Error('Permission denied: cases.edit required to edit case');
    }
    assertNotReadOnly(context.currentUser.firmId);

    const { currentUser } = context;
    const store = localStore.getData();
    const existing = (store.cases || []).find(
      (c) => c.id === id && c.firmId === currentUser.firmId && c.deletedAt === null
    );

    if (!existing) {
      throw new Error('Case not found');
    }

    if (
      (existing.restricted || data.restricted) &&
      !can('restricted.view', currentUser)
    ) {
      throw new Error('Permission denied: restricted.view required to edit confidential cases');
    }

    const firm =
      store.firm.id === currentUser.firmId
        ? store.firm
        : { ...store.firm, id: currentUser.firmId, visibilityMode: 'open' as const };
    if (
      !canUserSeeCase(
        currentUser,
        existing,
        firm,
        store.users || [],
        store.caseShares || []
      )
    ) {
      throw new Error('Case not found');
    }

    const oldSnapshot = { ...existing };
    const now = new Date().toISOString();
    let updated: CaseRecord | null = null;

    localStore.mutate((s) => {
      const idx = (s.cases || []).findIndex((c) => c.id === id);
      if (idx !== -1) {
        s.cases[idx] = {
          ...s.cases[idx],
          ...data,
          updatedAt: now,
          updatedBy: currentUser.id,
        };
        updated = { ...s.cases[idx] };
      }
    });

    if (!updated) {
      throw new Error('Failed to update case');
    }

    await this.auditRepo.record(context, {
      entity: 'Case',
      entityId: id,
      action: 'UPDATE',
      oldValue: oldSnapshot as unknown as Record<string, unknown>,
      newValue: updated as unknown as Record<string, unknown>,
    });

    return updated;
  }

  async listShares(context: SecurityContext, caseId: string): Promise<CaseShareRecord[]> {
    const c = await this.getById(context, caseId);
    if (!c) throw new Error('Case not found');
    const store = localStore.getData();
    return (store.caseShares || []).filter(
      (s) => s.caseId === caseId && s.firmId === context.currentUser.firmId && !s.deletedAt
    );
  }

  async shareCase(
    context: SecurityContext,
    caseId: string,
    userId: string
  ): Promise<CaseShareRecord> {
    if (!can('cases.edit', context.currentUser)) {
      throw new Error('Permission denied: cases.edit required to share case');
    }
    assertNotReadOnly(context.currentUser.firmId);
    const c = await this.getById(context, caseId);
    if (!c) throw new Error('Case not found');

    const store = localStore.getData();
    const existing = (store.caseShares || []).find(
      (s) =>
        s.caseId === caseId &&
        s.userId === userId &&
        s.firmId === context.currentUser.firmId &&
        !s.deletedAt
    );
    if (existing) return existing;

    const share: CaseShareRecord = {
      id: `share-${generateUUID()}`,
      firmId: context.currentUser.firmId,
      caseId,
      userId,
      createdBy: context.currentUser.id,
      createdAt: new Date().toISOString(),
      deletedAt: null,
    };

    localStore.mutate((s) => {
      if (!s.caseShares) s.caseShares = [];
      s.caseShares.push(share);
    });

    await this.auditRepo.record(context, {
      entity: 'Case',
      entityId: caseId,
      action: 'UPDATE',
      oldValue: null,
      newValue: { sharedWithUserId: userId, shareId: share.id },
    });

    return share;
  }

  async unshareCase(
    context: SecurityContext,
    caseId: string,
    shareIdOrUserId: string
  ): Promise<void> {
    if (!can('cases.edit', context.currentUser)) {
      throw new Error('Permission denied: cases.edit required to remove case share');
    }
    assertNotReadOnly(context.currentUser.firmId);
    const c = await this.getById(context, caseId);
    if (!c) throw new Error('Case not found');

    const now = new Date().toISOString();
    localStore.mutate((s) => {
      const target = (s.caseShares || []).find(
        (sh) =>
          sh.caseId === caseId &&
          sh.firmId === context.currentUser.firmId &&
          !sh.deletedAt &&
          (sh.id === shareIdOrUserId || sh.userId === shareIdOrUserId)
      );
      if (target) {
        target.deletedAt = now;
      }
    });
  }

  async getLinkedCounts(
    context: SecurityContext,
    caseId: string
  ): Promise<{
    hearingsCount: number;
    tasksCount: number;
    filesCount: number;
    remindersCount: number;
  }> {
    const visibleCaseIds = getVisibleCaseIdsForContext(context);
    if (!visibleCaseIds.has(caseId)) {
      return {
        hearingsCount: 0,
        tasksCount: 0,
        filesCount: 0,
        remindersCount: 0,
      };
    }

    const { currentUser } = context;
    const store = localStore.getData();
    const firmId = currentUser.firmId;

    const hearings = (store.hearings || []).filter(
      (h) => h.caseId === caseId && h.firmId === firmId && h.deletedAt === null
    );
    const hearingIds = new Set(hearings.map((h) => h.id));

    const tasks = (store.tasks || []).filter(
      (t) => t.caseId === caseId && t.firmId === firmId && t.deletedAt === null
    );

    const files = (store.physicalFiles || []).filter(
      (f) => f.caseId === caseId && f.firmId === firmId && f.deletedAt === null
    );

    const reminders = (store.reminders || []).filter(
      (r) =>
        r.firmId === firmId &&
        r.deletedAt === null &&
        r.status === 'pending' &&
        ((r.sourceType === 'hearing' && hearingIds.has(r.sourceId)) || r.sourceId === caseId)
    );

    return {
      hearingsCount: hearings.length,
      tasksCount: tasks.length,
      filesCount: files.length,
      remindersCount: reminders.length,
    };
  }

  async delete(
    context: SecurityContext,
    id: string
  ): Promise<{ success: boolean; softDeleted: true }> {
    if (!can('cases.delete', context.currentUser) || context.currentUser.role !== 'Owner') {
      throw new Error('Permission denied: Only the chamber Owner can delete cases');
    }
    assertNotReadOnly(context.currentUser.firmId);

    const { currentUser } = context;
    const store = localStore.getData();
    const existing = (store.cases || []).find(
      (c) => c.id === id && c.firmId === currentUser.firmId && c.deletedAt === null
    );

    if (!existing) {
      throw new Error('Case not found');
    }

    if (existing.restricted && !can('restricted.view', currentUser)) {
      throw new Error('Permission denied: restricted.view required');
    }

    const oldSnapshot = { ...existing };
    const now = new Date().toISOString();

    // 1. SOFT DELETE CASE
    localStore.mutate((s) => {
      const target = (s.cases || []).find((c) => c.id === id);
      if (target) {
        target.deletedAt = now;
        target.updatedAt = now;
        target.updatedBy = currentUser.id;
      }
    });

    await this.auditRepo.record(context, {
      entity: 'Case',
      entityId: id,
      action: 'DELETE',
      oldValue: oldSnapshot as unknown as Record<string, unknown>,
      newValue: { deletedAt: now, softDeleted: true },
    });

    // 2. SOFT DELETE LINKED HEARINGS
    const hearingsToSoftDelete = (store.hearings || []).filter(
      (h) => h.caseId === id && h.firmId === currentUser.firmId && h.deletedAt === null
    );
    const hearingIds = new Set(hearingsToSoftDelete.map((h) => h.id));

    for (const h of hearingsToSoftDelete) {
      const oldHearing = { ...h };
      localStore.mutate((s) => {
        const target = (s.hearings || []).find((x) => x.id === h.id);
        if (target) {
          target.deletedAt = now;
          target.updatedAt = now;
          target.updatedBy = currentUser.id;
        }
      });
      await this.auditRepo.record(context, {
        entity: 'Hearing',
        entityId: h.id,
        action: 'DELETE',
        oldValue: oldHearing as unknown as Record<string, unknown>,
        newValue: { deletedAt: now, softDeleted: true },
      });
    }

    // 3. CLEAR PENDING REMINDERS FOR CASE / HEARINGS
    const pendingReminders = (store.reminders || []).filter(
      (r) =>
        r.firmId === currentUser.firmId &&
        r.deletedAt === null &&
        r.status === 'pending' &&
        ((r.sourceType === 'hearing' && hearingIds.has(r.sourceId)) || r.sourceId === id)
    );

    for (const r of pendingReminders) {
      const oldReminder = { ...r };
      localStore.mutate((s) => {
        const target = (s.reminders || []).find((x) => x.id === r.id);
        if (target) {
          target.status = 'dismissed';
          target.deletedAt = now;
          target.updatedAt = now;
          target.updatedBy = currentUser.id;
        }
      });
      await this.auditRepo.record(context, {
        entity: 'Reminder',
        entityId: r.id,
        action: 'DELETE',
        oldValue: oldReminder as unknown as Record<string, unknown>,
        newValue: { status: 'dismissed', deletedAt: now },
      });
    }

    // 4. UNLINK TASKS (keep them visible as "case archived")
    const linkedTasks = (store.tasks || []).filter(
      (t) => t.caseId === id && t.firmId === currentUser.firmId && t.deletedAt === null
    );

    for (const t of linkedTasks) {
      const oldTask = { ...t };
      const archivedTag = `[Case archived: ${existing.caseNumber}]`;
      const newDesc = t.description ? `${t.description} ${archivedTag}` : archivedTag;
      localStore.mutate((s) => {
        const target = (s.tasks || []).find((x) => x.id === t.id);
        if (target) {
          target.caseId = null;
          target.description = newDesc;
          target.updatedAt = now;
          target.updatedBy = currentUser.id;
        }
      });
      await this.auditRepo.record(context, {
        entity: 'Task',
        entityId: t.id,
        action: 'UPDATE',
        oldValue: oldTask as unknown as Record<string, unknown>,
        newValue: { caseId: null, description: newDesc },
      });
    }

    // 5. UNLINK PHYSICAL FILES (keep them visible as "case archived")
    const linkedFiles = (store.physicalFiles || []).filter(
      (f) => f.caseId === id && f.firmId === currentUser.firmId && f.deletedAt === null
    );

    for (const f of linkedFiles) {
      const oldFile = { ...f };
      const archivedTag = `[Case archived: ${existing.caseNumber}]`;
      const newNotes = f.notes ? `${f.notes} ${archivedTag}` : archivedTag;
      localStore.mutate((s) => {
        const target = (s.physicalFiles || []).find((x) => x.id === f.id);
        if (target) {
          target.caseId = null;
          target.notes = newNotes;
          target.updatedAt = now;
          target.updatedBy = currentUser.id;
        }
      });
      await this.auditRepo.record(context, {
        entity: 'PhysicalFile',
        entityId: f.id,
        action: 'UPDATE',
        oldValue: oldFile as unknown as Record<string, unknown>,
        newValue: { caseId: null, notes: newNotes },
      });
    }

    return { success: true, softDeleted: true };
  }
}
