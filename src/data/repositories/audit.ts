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
