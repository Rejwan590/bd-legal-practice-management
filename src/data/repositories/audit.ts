import { can } from '../../permissions';
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
    const allLogs = localStore.getData().auditLogs;

    // Firm isolation
    let firmLogs = allLogs.filter((log) => log.firmId === currentUser.firmId);

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
