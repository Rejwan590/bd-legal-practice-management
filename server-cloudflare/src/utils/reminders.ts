import { and, eq, inArray, isNull, ne } from 'drizzle-orm';
import { getDb } from '../db/client';
import * as schema from '../db/schema';

export function computeRemindAtIso(dueIso: string, offsetMs: number = 24 * 60 * 60 * 1000): string {
  const dueMs = new Date(dueIso).getTime();
  if (Number.isNaN(dueMs)) return new Date().toISOString();
  return new Date(dueMs - offsetMs).toISOString();
}

export function buildDismissRemindersStmt(
  db: ReturnType<typeof getDb>,
  params: {
    firmId: string;
    sourceId: string;
    updatedBy: string;
    nowIso: string;
    softDelete?: boolean;
    userIdRestrict?: string;
  }
) {
  const conditions = [
    eq(schema.reminders.firmId, params.firmId),
    eq(schema.reminders.sourceId, params.sourceId),
    isNull(schema.reminders.deletedAt),
    ...(params.softDelete ? [] : [ne(schema.reminders.status, 'dismissed')]),
  ];
  if (params.userIdRestrict) {
    conditions.push(eq(schema.reminders.userId, params.userIdRestrict));
  }
  return db
    .update(schema.reminders)
    .set({
      status: 'dismissed',
      dismissedAt: params.nowIso,
      ...(params.softDelete ? { deletedAt: params.nowIso } : {}),
      updatedAt: params.nowIso,
      updatedBy: params.updatedBy,
    })
    .where(and(...conditions));
}

export function buildDismissRemindersBySourceIdsStmt(
  db: ReturnType<typeof getDb>,
  params: {
    firmId: string;
    sourceIds: string[];
    updatedBy: string;
    nowIso: string;
    softDelete?: boolean;
  }
) {
  return db
    .update(schema.reminders)
    .set({
      status: 'dismissed',
      dismissedAt: params.nowIso,
      ...(params.softDelete ? { deletedAt: params.nowIso } : {}),
      updatedAt: params.nowIso,
      updatedBy: params.updatedBy,
    })
    .where(
      and(
        eq(schema.reminders.firmId, params.firmId),
        inArray(schema.reminders.sourceId, params.sourceIds),
        isNull(schema.reminders.deletedAt),
        ...(params.softDelete ? [] : [ne(schema.reminders.status, 'dismissed')])
      )
    );
}

export function buildRescheduleRemindersStmt(
  db: ReturnType<typeof getDb>,
  params: {
    firmId: string;
    sourceId: string;
    newDueAt: string;
    newRemindAt?: string;
    updatedBy: string;
    nowIso: string;
  }
) {
  const targetRemindAt = params.newRemindAt ?? computeRemindAtIso(params.newDueAt);
  return db
    .update(schema.reminders)
    .set({
      dueAt: params.newDueAt,
      remindAt: targetRemindAt,
      status: 'pending',
      dismissedAt: null,
      updatedAt: params.nowIso,
      updatedBy: params.updatedBy,
    })
    .where(
      and(
        eq(schema.reminders.firmId, params.firmId),
        eq(schema.reminders.sourceId, params.sourceId),
        isNull(schema.reminders.deletedAt)
      )
    );
}

export async function appendFileReturnReminderStmts(
  db: ReturnType<typeof getDb>,
  params: {
    firmId: string;
    fileId: string;
    serial: string;
    title: string;
    shelfLocation?: string | null;
    holderId: string;
    holderName: string;
    dueIso: string;
    actorId: string;
    nowIso: string;
  },
  stmts: any[]
) {
  const remindIso = computeRemindAtIso(params.dueIso, 4 * 60 * 60 * 1000);
  const existing = await db
    .select({ id: schema.reminders.id })
    .from(schema.reminders)
    .where(
      and(
        eq(schema.reminders.firmId, params.firmId),
        eq(schema.reminders.sourceType, 'file_return'),
        eq(schema.reminders.sourceId, params.fileId),
        isNull(schema.reminders.deletedAt)
      )
    );

  if (existing.length > 0) {
    stmts.push(
      db
        .update(schema.reminders)
        .set({
          userId: params.holderId,
          dueAt: params.dueIso,
          remindAt: remindIso,
          status: 'pending',
          dismissedAt: null,
          updatedAt: params.nowIso,
          updatedBy: params.actorId,
        })
        .where(
          and(
            eq(schema.reminders.firmId, params.firmId),
            eq(schema.reminders.sourceType, 'file_return'),
            eq(schema.reminders.sourceId, params.fileId),
            isNull(schema.reminders.deletedAt)
          )
        )
    );
  } else {
    stmts.push(
      db.insert(schema.reminders).values({
        id: crypto.randomUUID(),
        firmId: params.firmId,
        userId: params.holderId,
        sourceType: 'file_return',
        sourceId: params.fileId,
        title: `File Return Due: ${params.serial} (${params.title})`,
        description: `Location: ${params.shelfLocation || 'Chamber Rack'}. Current holder: ${params.holderName}`,
        remindAt: remindIso,
        dueAt: params.dueIso,
        channel: 'in_app',
        status: 'pending',
        createdAt: params.nowIso,
        updatedAt: params.nowIso,
        deletedAt: null,
        createdBy: params.actorId,
        updatedBy: params.actorId,
      })
    );
  }
}
