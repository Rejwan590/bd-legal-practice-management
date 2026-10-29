import { IAuditLogRepository } from '../../interfaces';
import { AuditAction, AuditLogRecord, SecurityContext } from '../../types';
import { restFetch } from './restCommon';

export class RestAuditLogRepository implements Omit<IAuditLogRepository, 'record'> {
  async list(
    _context: SecurityContext,
    filter?: { entity?: string; action?: AuditAction; limit?: number; offset?: number }
  ): Promise<AuditLogRecord[]> {
    const params = new URLSearchParams();
    if (filter?.limit !== undefined) params.set('limit', String(filter.limit));
    if (filter?.offset !== undefined) params.set('offset', String(filter.offset));
    const qs = params.toString() ? `?${params.toString()}` : '';
    const res = await restFetch<AuditLogRecord[] | { logs: AuditLogRecord[]; total?: number }>(`/audit-log${qs}`);
    return Array.isArray(res) ? res : (Array.isArray((res as any)?.logs) ? (res as any).logs : []);
  }

  async listByCaseId(_context: SecurityContext, caseId: string): Promise<AuditLogRecord[]> {
    const all = await this.list(_context, { limit: 200 });
    return (Array.isArray(all) ? all : []).filter(
      (log) =>
        (log.entity === 'Case' && log.entityId === caseId) ||
        log.oldValue?.caseId === caseId ||
        log.newValue?.caseId === caseId
    );
  }
}
