import { can } from '../../permissions';
import { filterVisibleCases } from '../caseVisibility';
import { IAuditLogRepository } from '../interfaces';
import { localStore } from '../mockStore';
import { AuditAction, AuditLogRecord, SecurityContext } from '../types';
import { generateUUID } from './common';

export class MockAuditLogRepository implements IAuditLogRepository {
  async list(
    context: SecurityContext,
    filter?: { entity?: string; action?: AuditAction; limit?: number }
  ): Promise<AuditLogRecord[]> {
    // Only users with settings.manage or Owner role can view audit log
    if (!can('settings.manage', context.currentUser)) {
      throw new Error('Permission denied: settings.manage required to view audit logs');
    }

    const { currentUser } = context;
    const store = localStore.getData();
    const allLogs = store.auditLogs;

    // Firm isolation
    let firmLogs = allLogs.filter((log) => log.firmId === currentUser.firmId);

    // Central case visibility & confidentiality isolation
    const canSeeRestricted = can('restricted.view', currentUser);
    const firm =
      store.firm.id === currentUser.firmId
        ? store.firm
        : { ...store.firm, id: currentUser.firmId, visibilityMode: 'open' as const };
    const visibleCases = filterVisibleCases(
      currentUser,
      (store.cases || []).map((c) => ({ ...c, deletedAt: null })),
      firm,
      store.users || [],
      store.caseShares || []
    );
    const visibleCaseIds = new Set(visibleCases.map((c) => c.id));
    const allFirmCaseIds = new Set(
      (store.cases || []).filter((c) => c.firmId === currentUser.firmId).map((c) => c.id)
    );

    firmLogs = firmLogs.filter((log) => {
      if (log.entity.toLowerCase() === 'case') {
        if (allFirmCaseIds.has(log.entityId) && !visibleCaseIds.has(log.entityId)) return false;
      }
      if (!canSeeRestricted) {
        if (log.oldValue && (log.oldValue as any).restricted === true) return false;
        if (log.newValue && (log.newValue as any).restricted === true) return false;
      }
      const oldCaseId = log.oldValue ? (log.oldValue as any).caseId : undefined;
      if (oldCaseId && allFirmCaseIds.has(String(oldCaseId)) && !visibleCaseIds.has(String(oldCaseId))) {
        return false;
      }
      const newCaseId = log.newValue ? (log.newValue as any).caseId : undefined;
      if (newCaseId && allFirmCaseIds.has(String(newCaseId)) && !visibleCaseIds.has(String(newCaseId))) {
        return false;
      }
      return true;
    });

    if (filter?.entity) {
      firmLogs = firmLogs.filter((log) => log.entity.toLowerCase() === filter.entity!.toLowerCase());
    }

    if (filter?.action) {
      firmLogs = firmLogs.filter((log) => log.action === filter.action);
    }

    // Sort descending by timestamp
    firmLogs.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

    if (filter?.limit && filter.limit > 0) {
      return firmLogs.slice(0, filter.limit);
    }

    return firmLogs;
  }

  async listByCaseId(context: SecurityContext, caseId: string): Promise<AuditLogRecord[]> {
    if (!can('cases.view', context.currentUser)) {
      throw new Error('Permission denied: cases.view required to view case activity');
    }

    const { currentUser } = context;
    const store = localStore.getData();
    const targetCase = (store.cases || []).find(
      (c) => c.id === caseId && c.firmId === currentUser.firmId && c.deletedAt === null
    );
    if (!targetCase) {
      return [];
    }

    if (targetCase.restricted && !can('restricted.view', currentUser)) {
      throw new Error('Permission denied: restricted.view required to view restricted case activity');
    }

    const firm =
      store.firm.id === currentUser.firmId
        ? store.firm
        : { ...store.firm, id: currentUser.firmId, visibilityMode: 'open' as const };
    const visibleCases = filterVisibleCases(
      currentUser,
      (store.cases || []).map((c) => ({ ...c, deletedAt: null })),
      firm,
      store.users || [],
      store.caseShares || []
    );
    const visibleCaseIds = new Set(visibleCases.map((c) => c.id));
    if (!visibleCaseIds.has(caseId)) {
      return [];
    }

    // Collect IDs of hearings, tasks, files belonging to this case
    const caseHearingIds = new Set(
      (store.hearings || []).filter((h) => h.caseId === caseId).map((h) => h.id)
    );
    const caseTaskIds = new Set(
      (store.tasks || []).filter((t) => t.caseId === caseId).map((t) => t.id)
    );
    const caseFileIds = new Set(
      (store.physicalFiles || []).filter((f) => f.caseId === caseId).map((f) => f.id)
    );

    const logs = (store.auditLogs || []).filter((log) => {
      if (log.firmId !== currentUser.firmId) return false;
      const entityLower = log.entity.toLowerCase();
      if (entityLower === 'case' && log.entityId === caseId) return true;
      if (entityLower === 'hearing' && caseHearingIds.has(log.entityId)) return true;
      if (entityLower === 'task' && caseTaskIds.has(log.entityId)) return true;
      if (entityLower === 'physicalfile' && caseFileIds.has(log.entityId)) return true;

      const oldVal = log.oldValue as Record<string, any> | null;
      const newVal = log.newValue as Record<string, any> | null;
      if (oldVal?.caseId === caseId || newVal?.caseId === caseId) return true;
      if (oldVal?.file?.caseId === caseId || newVal?.file?.caseId === caseId) return true;
      return false;
    });

    logs.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
    return logs;
  }

  async record(
    context: SecurityContext,
    params: {
      entity: string;
      entityId: string;
      action: AuditAction;
      oldValue?: Record<string, unknown> | null;
      newValue?: Record<string, unknown> | null;
    }
  ): Promise<AuditLogRecord> {
    const log: AuditLogRecord = {
      id: generateUUID(),
      firmId: context.currentUser.firmId,
      userId: context.currentUser.id,
      userName: context.currentUser.name,
      entity: params.entity,
      entityId: params.entityId,
      action: params.action,
      oldValue: params.oldValue ?? null,
      newValue: params.newValue ?? null,
      timestamp: new Date().toISOString(),
    };

    localStore.mutate((data) => {
      data.auditLogs.unshift(log);
    });

    return log;
  }
}
