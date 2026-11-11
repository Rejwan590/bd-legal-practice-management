export function buildAuditEntry(params: {
  firmId: string;
  userId: string;
  userName: string;
  entity: string;
  entityId: string;
  action: string;
  oldValue?: unknown;
  newValue?: unknown;
  now?: string;
}) {
  const now = params.now || new Date().toISOString();
  return {
    id: crypto.randomUUID(),
    firmId: params.firmId,
    userId: params.userId,
    userName: params.userName,
    entity: params.entity,
    entityId: params.entityId,
    action: params.action,
    oldValue: (params.oldValue ?? null) as Record<string, unknown> | null,
    newValue: (params.newValue ?? null) as Record<string, unknown> | null,
    timestamp: now,
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
    createdBy: params.userId,
    updatedBy: null,
  };
}

export function buildAdminAuditEntry(params: {
  adminId: string;
  action: string;
  targetFirmId?: string | null;
  old?: unknown;
  new?: unknown;
  ip?: string | null;
  at?: string;
}) {
  const at = params.at || new Date().toISOString();
  return {
    id: crypto.randomUUID(),
    adminId: params.adminId,
    action: params.action,
    targetFirmId: params.targetFirmId ?? null,
    old: (params.old ?? null) as Record<string, unknown> | null,
    new: (params.new ?? null) as Record<string, unknown> | null,
    ip: params.ip ?? null,
    at,
  };
}
