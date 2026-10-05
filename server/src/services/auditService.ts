import crypto from 'crypto';
import { getDatabase } from '../db/client.js';

export interface RecordAuditParams {
  firmId: string;
  userId: string;
  userName: string;
  entity: string;
  entityId: string;
  action: string;
  oldValue?: Record<string, unknown> | null;
  newValue?: Record<string, unknown> | null;
}

export async function recordAudit(params: RecordAuditParams) {
  const db = getDatabase();
  const id = crypto.randomUUID();
  const now = new Date();

  return db.insertAudit({
    id,
    firmId: params.firmId,
    userId: params.userId,
    userName: params.userName,
    entity: params.entity,
    entityId: params.entityId,
    action: params.action,
    oldValue: params.oldValue || null,
    newValue: params.newValue || null,
    timestamp: now,
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
    createdBy: params.userId,
    updatedBy: params.userId,
  });
}
