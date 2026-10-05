import crypto from 'crypto';
import { getDatabase } from '../db/client.js';
import * as schema from '../db/schema.js';

export interface RecordAdminAuditParams {
  adminId: string;
  action: string;
  targetFirmId?: string | null;
  old?: Record<string, unknown> | null;
  new?: Record<string, unknown> | null;
  ip?: string | null;
}

export async function recordAdminAudit(params: RecordAdminAuditParams): Promise<schema.AdminAuditEntry> {
  const db = getDatabase();
  return db.insertAdminAudit({
    id: crypto.randomUUID(),
    adminId: params.adminId,
    action: params.action,
    targetFirmId: params.targetFirmId ?? null,
    old: params.old ?? null,
    new: params.new ?? null,
    ip: params.ip ?? null,
    at: new Date(),
  });
}
