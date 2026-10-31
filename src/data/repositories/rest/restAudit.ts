import { IAuditLogRepository } from '../../interfaces';
import { AuditAction, AuditLogRecord, SecurityContext } from '../../types';
import { restFetch } from './restCommon';
import { MockAuditLogRepository } from '../audit';

export class RestAuditLogRepository implements IAuditLogRepository {
  private mockRepo = new MockAuditLogRepository();

  async list(
    context: SecurityContext,
    filter?: { entity?: string; action?: AuditAction; limit?: number; offset?: number }
  ): Promise<AuditLogRecord[]> {
    const params = new URLSearchParams();
    if (filter?.limit !== undefined) params.set('limit', String(filter.limit));
    if (filter?.offset !== undefined) params.set('offset', String(filter.offset));
    if (filter?.entity) params.set('entity', filter.entity);
    if (filter?.action) params.set('action', filter.action);
    const qs = params.toString() ? `?${params.toString()}` : '';

    let serverLogs: AuditLogRecord[] = [];
    try {
      const res = await restFetch<AuditLogRecord[] | { logs: AuditLogRecord[]; total?: number }>(`/audit-log${qs}`);
      serverLogs = Array.isArray(res) ? res : (Array.isArray((res as any)?.logs) ? (res as any).logs : []);
    } catch {
      serverLogs = [];
    }

    // Merge any client-tracked records (e.g. physical file custody movements and local exports)
    const localLogs = await this.mockRepo.list(context, filter);
    const seenIds = new Set(serverLogs.map((l) => l.id));
    const combined = [...serverLogs];
    for (const log of localLogs) {
      if (!seenIds.has(log.id)) {
        combined.push(log);
        seenIds.add(log.id);
      }
    }

    combined.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
    if (filter?.limit && filter.limit > 0) {
      return combined.slice(0, filter.limit);
    }
    return combined;
  }

  async listByCaseId(context: SecurityContext, caseId: string): Promise<AuditLogRecord[]> {
    const all = await this.list(context, { limit: 500 });
    return (Array.isArray(all) ? all : []).filter((log) => {
      if (log.entity === 'Case' && log.entityId === caseId) return true;
      if (log.oldValue?.caseId === caseId || log.newValue?.caseId === caseId) return true;
      if ((log.oldValue as any)?.file?.caseId === caseId || (log.newValue as any)?.file?.caseId === caseId) return true;
      return false;
    });
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
    return this.mockRepo.record(context, params);
  }
}
