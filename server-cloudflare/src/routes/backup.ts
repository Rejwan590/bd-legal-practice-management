import { Hono } from 'hono';
import { z } from 'zod';
import { Env, authMiddleware, enforceSubscriptionReadOnly, requireOwner, requirePermission } from '../middleware/auth';
import { getDb } from '../db/client';
import * as schema from '../db/schema';
import { and, desc, eq, isNull } from 'drizzle-orm';
import { getVisibleCaseIds } from '../utils/visibility';
import { buildAuditEntry } from '../utils/audit';

export const backupRouter = new Hono<{ Bindings: Env; Variables: any }>();

backupRouter.use('*', authMiddleware);

function sanitizeFirmForExport(firm: schema.Firm): Record<string, unknown> {
  const sanitized: Record<string, unknown> = { ...firm };
  delete sanitized.pricingNote;
  delete sanitized.customBasePriceBdt;
  delete sanitized.customAnnualPriceBdt;
  delete sanitized.customExtraUserPriceBdt;
  delete sanitized.customExtraDevicePriceBdt;
  return sanitized;
}

function normalizeCaseStatus(raw: unknown): 'ongoing' | 'pending' | 'closed' {
  if (raw === 'pending' || raw === 'closed' || raw === 'ongoing') return raw;
  return 'ongoing';
}

function normalizeCaseCategory(raw: unknown): 'civil' | 'criminal_gr' | 'criminal_cr' | 'other' {
  if (raw === 'civil' || raw === 'criminal_gr' || raw === 'criminal_cr' || raw === 'other') return raw;
  if (typeof raw === 'string') {
    const lower = raw.toLowerCase();
    if (lower === 'civil') return 'civil';
    if (lower.includes('gr')) return 'criminal_gr';
    if (lower.includes('cr') || lower === 'criminal') return 'criminal_cr';
  }
  return 'other';
}

function normalizeTaskPriority(raw: unknown): 'urgent' | 'high' | 'medium' | 'normal' | 'low' {
  if (raw === 'urgent' || raw === 'high' || raw === 'medium' || raw === 'normal' || raw === 'low') return raw;
  return 'normal';
}

function normalizeTaskStatus(raw: unknown): 'pending' | 'in_progress' | 'completed' | 'cancelled' {
  if (raw === 'pending' || raw === 'in_progress' || raw === 'completed' || raw === 'cancelled') return raw;
  return 'pending';
}

function normalizeHearingStatus(raw: unknown): 'scheduled' | 'held' | 'adjourned' | 'cancelled' {
  if (raw === 'scheduled' || raw === 'held' || raw === 'adjourned' || raw === 'cancelled') return raw;
  return 'scheduled';
}

function normalizeFileStatus(raw: unknown): 'in_chamber' | 'checked_out' | 'in_court' | 'archived' {
  if (raw === 'in_chamber' || raw === 'checked_out' || raw === 'in_court' || raw === 'archived') return raw;
  return 'in_chamber';
}

function normalizeAppointmentType(
  raw: unknown
): 'client_meeting' | 'consultation' | 'phone_call' | 'internal_meeting' | 'court_visit' | 'other' {
  if (
    raw === 'client_meeting' ||
    raw === 'consultation' ||
    raw === 'phone_call' ||
    raw === 'internal_meeting' ||
    raw === 'court_visit' ||
    raw === 'other'
  ) {
    return raw;
  }
  return 'client_meeting';
}

function normalizeAppointmentMode(raw: unknown): 'in_person' | 'phone' | 'video' {
  if (raw === 'in_person' || raw === 'phone' || raw === 'video') return raw;
  return 'in_person';
}

function normalizeAppointmentStatus(raw: unknown): 'scheduled' | 'completed' | 'cancelled' | 'no_show' {
  if (raw === 'scheduled' || raw === 'completed' || raw === 'cancelled' || raw === 'no_show') return raw;
  return 'scheduled';
}

// GET /api/v1/backup/export
// Remains available even during expired subscription read-only mode (Rule 10 & Rule 14).
backupRouter.get('/export', requirePermission('data.export'), async (c) => {
  const firm = c.get('firm') as schema.Firm;
  const user = c.get('user') as schema.User;
  const db = getDb(c.env.DB);
  const nowIso = new Date().toISOString();

  const [
    allClients,
    allClientNotes,
    allCases,
    allCaseNotes,
    allHearings,
    allHearingHistory,
    allTasks,
    allFiles,
    allFileMovements,
    allAppointments,
    allAppointmentAttendees,
    allReminders,
    allAuditLogs,
    visibleCases,
  ] = await Promise.all([
    db.select().from(schema.clients).where(and(eq(schema.clients.firmId, firm.id), isNull(schema.clients.deletedAt))),
    db.select().from(schema.clientNotes).where(and(eq(schema.clientNotes.firmId, firm.id), isNull(schema.clientNotes.deletedAt))),
    db.select().from(schema.cases).where(and(eq(schema.cases.firmId, firm.id), isNull(schema.cases.deletedAt))),
    db.select().from(schema.caseNotes).where(and(eq(schema.caseNotes.firmId, firm.id), isNull(schema.caseNotes.deletedAt))),
    db.select().from(schema.hearings).where(and(eq(schema.hearings.firmId, firm.id), isNull(schema.hearings.deletedAt))),
    db.select().from(schema.hearingDateHistory).where(eq(schema.hearingDateHistory.firmId, firm.id)),
    db.select().from(schema.tasks).where(and(eq(schema.tasks.firmId, firm.id), isNull(schema.tasks.deletedAt))),
    db.select().from(schema.physicalFiles).where(and(eq(schema.physicalFiles.firmId, firm.id), isNull(schema.physicalFiles.deletedAt))),
    db.select().from(schema.fileMovements).where(eq(schema.fileMovements.firmId, firm.id)),
    db.select().from(schema.appointments).where(and(eq(schema.appointments.firmId, firm.id), isNull(schema.appointments.deletedAt))),
    db.select().from(schema.appointmentAttendees).where(eq(schema.appointmentAttendees.firmId, firm.id)),
    db.select().from(schema.reminders).where(and(eq(schema.reminders.firmId, firm.id), isNull(schema.reminders.deletedAt))),
    db.select().from(schema.auditLog).where(and(eq(schema.auditLog.firmId, firm.id), isNull(schema.auditLog.deletedAt))).orderBy(desc(schema.auditLog.timestamp)).limit(1000),
    getVisibleCaseIds(db, firm, user),
  ]);

  const canSeeRestricted = user.role === 'Owner' || Boolean((user.permissions as Record<string, boolean>)?.['restricted.view']);
  const visibleCaseSet = visibleCases === 'ALL' ? null : new Set(visibleCases);

  const exportedCases = visibleCaseSet ? allCases.filter((cs) => visibleCaseSet.has(cs.id)) : allCases;
  const hiddenCaseIdSet = new Set(allCases.filter((cs) => visibleCaseSet && !visibleCaseSet.has(cs.id)).map((cs) => cs.id));

  const exportedCaseNotes = hiddenCaseIdSet.size > 0 ? allCaseNotes.filter((cn) => !hiddenCaseIdSet.has(cn.caseId)) : allCaseNotes;
  const hiddenHearingIdSet = new Set(allHearings.filter((h) => hiddenCaseIdSet.has(h.caseId)).map((h) => h.id));
  const exportedHearings = hiddenCaseIdSet.size > 0 ? allHearings.filter((h) => !hiddenHearingIdSet.has(h.id)) : allHearings;
  const exportedHearingHistory = hiddenCaseIdSet.size > 0 ? allHearingHistory.filter((hd) => !hiddenHearingIdSet.has(hd.hearingId)) : allHearingHistory;

  const hiddenTaskIdSet = new Set(allTasks.filter((t) => t.caseId && hiddenCaseIdSet.has(t.caseId)).map((t) => t.id));
  const exportedTasks = hiddenCaseIdSet.size > 0 ? allTasks.filter((t) => !hiddenTaskIdSet.has(t.id)) : allTasks;

  const hiddenFileIdSet = new Set(allFiles.filter((f) => f.caseId && hiddenCaseIdSet.has(f.caseId)).map((f) => f.id));
  const exportedFiles = hiddenCaseIdSet.size > 0 ? allFiles.filter((f) => !hiddenFileIdSet.has(f.id)) : allFiles;
  const exportedFileMovements = hiddenCaseIdSet.size > 0 ? allFileMovements.filter((fm) => !hiddenFileIdSet.has(fm.fileId)) : allFileMovements;

  const hiddenAppointmentIdSet = new Set(allAppointments.filter((a) => a.caseId && hiddenCaseIdSet.has(a.caseId)).map((a) => a.id));
  const exportedAppointments = hiddenCaseIdSet.size > 0 ? allAppointments.filter((a) => !hiddenAppointmentIdSet.has(a.id)) : allAppointments;
  const exportedAppointmentAttendees =
    hiddenCaseIdSet.size > 0 ? allAppointmentAttendees.filter((aa) => !hiddenAppointmentIdSet.has(aa.appointmentId)) : allAppointmentAttendees;

  const exportedReminders =
    hiddenCaseIdSet.size > 0
      ? allReminders.filter((r) => {
          if (r.sourceType === 'hearing' && hiddenHearingIdSet.has(r.sourceId)) return false;
          if (r.sourceType === 'task' && hiddenTaskIdSet.has(r.sourceId)) return false;
          if (r.sourceType === 'file_return' && hiddenFileIdSet.has(r.sourceId)) return false;
          if (r.sourceType === 'appointment' && hiddenAppointmentIdSet.has(r.sourceId)) return false;
          return true;
        })
      : allReminders;

  const exportedAuditLogs =
    hiddenCaseIdSet.size > 0 || !canSeeRestricted
      ? allAuditLogs.filter((a) => {
          if (a.entity === 'Case' && hiddenCaseIdSet.has(a.entityId)) return false;
          if (hiddenCaseIdSet.has(a.entityId)) return false;
          const oldVal = a.oldValue as Record<string, unknown> | null;
          const newVal = a.newValue as Record<string, unknown> | null;
          if (oldVal?.caseId && typeof oldVal.caseId === 'string' && hiddenCaseIdSet.has(oldVal.caseId)) return false;
          if (newVal?.caseId && typeof newVal.caseId === 'string' && hiddenCaseIdSet.has(newVal.caseId)) return false;
          if (!canSeeRestricted && (oldVal?.restricted === true || newVal?.restricted === true)) return false;
          return true;
        })
      : allAuditLogs;

  const exportAudit = buildAuditEntry({
    firmId: firm.id,
    userId: user.id,
    userName: user.name,
    entity: 'ChamberBackup',
    entityId: firm.id,
    action: 'BACKUP_EXPORT',
    newValue: {
      counts: {
        clients: allClients.length,
        cases: exportedCases.length,
        hearings: exportedHearings.length,
        tasks: exportedTasks.length,
        physicalFiles: exportedFiles.length,
        appointments: exportedAppointments.length,
      },
      exportedAt: nowIso,
    },
  });

  await db.batch([
    db.insert(schema.auditLog).values(exportAudit),
    db.insert(schema.backupsLog).values({
      id: crypto.randomUUID(),
      firmId: firm.id,
      kind: 'client_snapshot_export',
      at: nowIso,
      checksum: 'client-computed',
      createdAt: nowIso,
      updatedAt: nowIso,
      createdBy: user.id,
      updatedBy: user.id,
    }),
  ]);

  return c.json({
    firm: sanitizeFirmForExport(firm),
    clients: allClients,
    clientNotes: allClientNotes,
    cases: exportedCases,
    caseNotes: exportedCaseNotes,
    hearings: exportedHearings,
    hearingDateHistory: exportedHearingHistory,
    tasks: exportedTasks,
    physicalFiles: exportedFiles,
    fileMovements: exportedFileMovements,
    appointments: exportedAppointments,
    appointmentAttendees: exportedAppointmentAttendees,
    reminders: exportedReminders,
    auditLogs: exportedAuditLogs,
  });
});

const restoreBodySchema = z.object({
  mode: z.enum(['clean', 'merge']),
  metadata: z
    .object({
      firmId: z.string().optional(),
      firmName: z.string().optional(),
      exportedAt: z.string().optional(),
      counts: z.record(z.string(), z.number()).optional(),
    })
    .optional(),
  data: z.object({
    clients: z.array(z.record(z.string(), z.unknown())).default([]),
    clientNotes: z.array(z.record(z.string(), z.unknown())).default([]),
    cases: z.array(z.record(z.string(), z.unknown())).default([]),
    caseNotes: z.array(z.record(z.string(), z.unknown())).default([]),
    hearings: z.array(z.record(z.string(), z.unknown())).default([]),
    hearingDateHistory: z.array(z.record(z.string(), z.unknown())).default([]),
    tasks: z.array(z.record(z.string(), z.unknown())).default([]),
    physicalFiles: z.array(z.record(z.string(), z.unknown())).default([]),
    fileMovements: z.array(z.record(z.string(), z.unknown())).default([]),
    appointments: z.array(z.record(z.string(), z.unknown())).default([]),
    appointmentAttendees: z.array(z.record(z.string(), z.unknown())).default([]),
    reminders: z.array(z.record(z.string(), z.unknown())).default([]),
  }),
});

// POST /api/v1/backup/restore
backupRouter.post('/restore', enforceSubscriptionReadOnly, requireOwner, async (c) => {
  const firm = c.get('firm') as schema.Firm;
  const user = c.get('user') as schema.User;
  const rawBody = await c.req.json().catch(() => null);

  const parsed = restoreBodySchema.safeParse(rawBody);
  if (!parsed.success) {
    return c.json({ error: 'Invalid restore payload', errors: parsed.error.issues }, 400);
  }

  const { mode, metadata, data } = parsed.data;
  const db = getDb(c.env.DB);
  const nowIso = new Date().toISOString();

  const [firmUsers, existingClients, existingCases, existingTasks] = await Promise.all([
    db.select({ id: schema.users.id }).from(schema.users).where(and(eq(schema.users.firmId, firm.id), isNull(schema.users.deletedAt))),
    db.select({ id: schema.clients.id }).from(schema.clients).where(and(eq(schema.clients.firmId, firm.id), isNull(schema.clients.deletedAt))),
    db.select({ id: schema.cases.id }).from(schema.cases).where(and(eq(schema.cases.firmId, firm.id), isNull(schema.cases.deletedAt))),
    db.select({ id: schema.tasks.id }).from(schema.tasks).where(and(eq(schema.tasks.firmId, firm.id), isNull(schema.tasks.deletedAt))),
  ]);

  const validUserIds = new Set(firmUsers.map((u) => u.id));
  const resolveUserId = (candidate: unknown): string =>
    typeof candidate === 'string' && validUserIds.has(candidate) ? candidate : user.id;
  const resolveOptionalUserId = (candidate: unknown): string | null =>
    typeof candidate === 'string' && validUserIds.has(candidate) ? candidate : null;

  const statements: any[] = [];

  if (mode === 'clean') {
    const suffix = `_del_${Date.now()}`;
    statements.push(
      db.update(schema.reminders).set({ deletedAt: nowIso, updatedAt: nowIso, updatedBy: user.id }).where(and(eq(schema.reminders.firmId, firm.id), isNull(schema.reminders.deletedAt))),
      db.update(schema.appointments).set({ deletedAt: nowIso, updatedAt: nowIso, updatedBy: user.id }).where(and(eq(schema.appointments.firmId, firm.id), isNull(schema.appointments.deletedAt))),
      db.update(schema.physicalFiles).set({ deletedAt: nowIso, updatedAt: nowIso, updatedBy: user.id }).where(and(eq(schema.physicalFiles.firmId, firm.id), isNull(schema.physicalFiles.deletedAt))),
      db.update(schema.tasks).set({ deletedAt: nowIso, updatedAt: nowIso, updatedBy: user.id }).where(and(eq(schema.tasks.firmId, firm.id), isNull(schema.tasks.deletedAt))),
      db.update(schema.hearings).set({ deletedAt: nowIso, updatedAt: nowIso, updatedBy: user.id }).where(and(eq(schema.hearings.firmId, firm.id), isNull(schema.hearings.deletedAt))),
      db.update(schema.caseNotes).set({ deletedAt: nowIso, updatedAt: nowIso, updatedBy: user.id }).where(and(eq(schema.caseNotes.firmId, firm.id), isNull(schema.caseNotes.deletedAt))),
      db.update(schema.cases).set({ deletedAt: nowIso, updatedAt: nowIso, updatedBy: user.id }).where(and(eq(schema.cases.firmId, firm.id), isNull(schema.cases.deletedAt))),
      db.update(schema.clientNotes).set({ deletedAt: nowIso, updatedAt: nowIso, updatedBy: user.id }).where(and(eq(schema.clientNotes.firmId, firm.id), isNull(schema.clientNotes.deletedAt))),
      db.update(schema.clients).set({ deletedAt: nowIso, updatedAt: nowIso, updatedBy: user.id }).where(and(eq(schema.clients.firmId, firm.id), isNull(schema.clients.deletedAt)))
    );

    // Avoid unique index collisions on (firm_id, file_serial) / (firm_id, serial) from previously soft-deleted rows
    const incomingCaseIds = new Set(data.cases.map((r) => String(r.id || '')));
    const incomingFileIds = new Set(data.physicalFiles.map((r) => String(r.id || '')));
    const existingAllCases = await db
      .select({ id: schema.cases.id, fileSerial: schema.cases.fileSerial })
      .from(schema.cases)
      .where(eq(schema.cases.firmId, firm.id));
    for (const ec of existingAllCases) {
      if (ec.fileSerial && !incomingCaseIds.has(ec.id) && !ec.fileSerial.includes('_del_')) {
        statements.push(
          db.update(schema.cases).set({ fileSerial: `${ec.fileSerial}${suffix}` }).where(eq(schema.cases.id, ec.id))
        );
      }
    }
    const existingAllFiles = await db
      .select({ id: schema.physicalFiles.id, serial: schema.physicalFiles.serial })
      .from(schema.physicalFiles)
      .where(eq(schema.physicalFiles.firmId, firm.id));
    for (const ef of existingAllFiles) {
      if (ef.serial && !incomingFileIds.has(ef.id) && !ef.serial.includes('_del_')) {
        statements.push(
          db.update(schema.physicalFiles).set({ serial: `${ef.serial}${suffix}` }).where(eq(schema.physicalFiles.id, ef.id))
        );
      }
    }
  }

  const clientIds = new Set<string>();
  for (const r of data.clients) {
    const id = typeof r.id === 'string' && r.id ? r.id : crypto.randomUUID();
    clientIds.add(id);
    const val = {
      id,
      firmId: firm.id,
      name: String(r.name || 'Unnamed Client'),
      nameBn: typeof r.nameBn === 'string' ? r.nameBn : null,
      phone: String(r.phone || 'N/A'),
      email: typeof r.email === 'string' ? r.email : null,
      address: String(r.address || 'N/A'),
      notes: typeof r.notes === 'string' ? r.notes : null,
      archived: Boolean(r.archived),
      createdAt: typeof r.createdAt === 'string' ? r.createdAt : nowIso,
      updatedAt: nowIso,
      deletedAt: null,
      createdBy: resolveUserId(r.createdBy),
      updatedBy: user.id,
    };
    statements.push(
      db.insert(schema.clients).values(val).onConflictDoUpdate({ target: schema.clients.id, set: val })
    );
  }

  for (const r of data.clientNotes) {
    if (typeof r.clientId !== 'string' || !clientIds.has(r.clientId)) continue;
    const id = typeof r.id === 'string' && r.id ? r.id : crypto.randomUUID();
    const val = {
      id,
      firmId: firm.id,
      clientId: r.clientId,
      noteDate: typeof r.noteDate === 'string' ? r.noteDate : nowIso.slice(0, 10),
      body: String(r.body || ''),
      createdBy: resolveUserId(r.createdBy),
      updatedBy: user.id,
      createdAt: typeof r.createdAt === 'string' ? r.createdAt : nowIso,
      updatedAt: nowIso,
      deletedAt: null,
    };
    statements.push(
      db.insert(schema.clientNotes).values(val).onConflictDoUpdate({ target: schema.clientNotes.id, set: val })
    );
  }

  const caseIds = new Set<string>();
  for (const r of data.cases) {
    if (typeof r.clientId !== 'string' || !clientIds.has(r.clientId)) continue;
    const id = typeof r.id === 'string' && r.id ? r.id : crypto.randomUUID();
    caseIds.add(id);
    const val = {
      id,
      firmId: firm.id,
      clientId: r.clientId,
      fileSerial: typeof r.fileSerial === 'string' ? r.fileSerial : null,
      caseNumber: String(r.caseNumber || 'N/A'),
      court: String(r.court || 'N/A'),
      matterType: String(r.matterType || 'civil'),
      description: typeof r.description === 'string' ? r.description : null,
      plaintiff: typeof r.plaintiff === 'string' ? r.plaintiff : null,
      defendant: typeof r.defendant === 'string' ? r.defendant : null,
      ourRole: typeof r.ourRole === 'string' ? r.ourRole : null,
      plaintiffLawyer: typeof r.plaintiffLawyer === 'string' ? r.plaintiffLawyer : null,
      defendantLawyer: typeof r.defendantLawyer === 'string' ? r.defendantLawyer : null,
      responsibleLawyerId: resolveOptionalUserId(r.responsibleLawyerId),
      status: normalizeCaseStatus(r.status),
      caseDate: typeof r.caseDate === 'string' ? r.caseDate : null,
      closedOn: typeof r.closedOn === 'string' ? r.closedOn : null,
      caseCategory: normalizeCaseCategory(r.caseCategory),
      partyARole: typeof r.partyARole === 'string' ? r.partyARole : null,
      partyBRole: typeof r.partyBRole === 'string' ? r.partyBRole : null,
      policeStation: typeof r.policeStation === 'string' ? r.policeStation : null,
      sectionsOfLaw: typeof r.sectionsOfLaw === 'string' ? r.sectionsOfLaw : null,
      restricted: Boolean(r.restricted),
      nextHearingAt: typeof r.nextHearingAt === 'string' ? r.nextHearingAt : null,
      createdAt: typeof r.createdAt === 'string' ? r.createdAt : nowIso,
      updatedAt: nowIso,
      deletedAt: null,
      createdBy: resolveUserId(r.createdBy),
      updatedBy: user.id,
    };
    statements.push(
      db.insert(schema.cases).values(val).onConflictDoUpdate({ target: schema.cases.id, set: val })
    );
  }

  for (const r of data.caseNotes) {
    if (typeof r.caseId !== 'string' || !caseIds.has(r.caseId)) continue;
    const id = typeof r.id === 'string' && r.id ? r.id : crypto.randomUUID();
    const val = {
      id,
      firmId: firm.id,
      caseId: r.caseId,
      noteDate: typeof r.noteDate === 'string' ? r.noteDate : nowIso.slice(0, 10),
      body: String(r.body || ''),
      createdBy: resolveUserId(r.createdBy),
      updatedBy: user.id,
      createdAt: typeof r.createdAt === 'string' ? r.createdAt : nowIso,
      updatedAt: nowIso,
      deletedAt: null,
    };
    statements.push(
      db.insert(schema.caseNotes).values(val).onConflictDoUpdate({ target: schema.caseNotes.id, set: val })
    );
  }

  const hearingIds = new Set<string>();
  for (const r of data.hearings) {
    if (typeof r.caseId !== 'string' || !caseIds.has(r.caseId)) continue;
    const id = typeof r.id === 'string' && r.id ? r.id : crypto.randomUUID();
    hearingIds.add(id);
    const val = {
      id,
      firmId: firm.id,
      caseId: r.caseId,
      appearingLawyerId: resolveOptionalUserId(r.appearingLawyerId),
      scheduledAt: typeof r.scheduledAt === 'string' ? r.scheduledAt : nowIso,
      court: typeof r.court === 'string' ? r.court : null,
      purpose: typeof r.purpose === 'string' ? r.purpose : null,
      status: normalizeHearingStatus(r.status),
      outcomeNote: typeof r.outcomeNote === 'string' ? r.outcomeNote : null,
      fixedFor: typeof r.fixedFor === 'string' ? r.fixedFor : null,
      fixedForNote: typeof r.fixedForNote === 'string' ? r.fixedForNote : null,
      createdAt: typeof r.createdAt === 'string' ? r.createdAt : nowIso,
      updatedAt: nowIso,
      deletedAt: null,
      createdBy: resolveUserId(r.createdBy),
      updatedBy: user.id,
    };
    statements.push(
      db.insert(schema.hearings).values(val).onConflictDoUpdate({ target: schema.hearings.id, set: val })
    );
  }

  for (const r of data.hearingDateHistory) {
    if (typeof r.hearingId !== 'string' || !hearingIds.has(r.hearingId)) continue;
    if (typeof r.caseId !== 'string' || !caseIds.has(r.caseId)) continue;
    const id = typeof r.id === 'string' && r.id ? r.id : crypto.randomUUID();
    const val = {
      id,
      firmId: firm.id,
      hearingId: r.hearingId,
      caseId: r.caseId,
      oldAt: typeof r.oldAt === 'string' ? r.oldAt : nowIso,
      newAt: typeof r.newAt === 'string' ? r.newAt : nowIso,
      reason: String(r.reason || 'Restored'),
      oldFixedFor: typeof r.oldFixedFor === 'string' ? r.oldFixedFor : null,
      newFixedFor: typeof r.newFixedFor === 'string' ? r.newFixedFor : null,
      changedBy: resolveUserId(r.changedBy),
      changedAt: typeof r.changedAt === 'string' ? r.changedAt : nowIso,
    };
    statements.push(
      db.insert(schema.hearingDateHistory).values(val).onConflictDoUpdate({ target: schema.hearingDateHistory.id, set: val })
    );
  }

  for (const r of data.tasks) {
    const id = typeof r.id === 'string' && r.id ? r.id : crypto.randomUUID();
    const linkedCaseId = typeof r.caseId === 'string' && caseIds.has(r.caseId) ? r.caseId : null;
    const linkedClientId = typeof r.clientId === 'string' && clientIds.has(r.clientId) ? r.clientId : null;
    const val = {
      id,
      firmId: firm.id,
      caseId: linkedCaseId,
      clientId: linkedClientId,
      assignedTo: resolveUserId(r.assignedTo),
      title: String(r.title || 'Restored Task'),
      description: typeof r.description === 'string' ? r.description : null,
      priority: normalizeTaskPriority(r.priority),
      dueAt: typeof r.dueAt === 'string' ? r.dueAt : nowIso,
      status: normalizeTaskStatus(r.status),
      completedAt: typeof r.completedAt === 'string' ? r.completedAt : null,
      createdAt: typeof r.createdAt === 'string' ? r.createdAt : nowIso,
      updatedAt: nowIso,
      deletedAt: null,
      createdBy: resolveUserId(r.createdBy),
      updatedBy: user.id,
    };
    statements.push(
      db.insert(schema.tasks).values(val).onConflictDoUpdate({ target: schema.tasks.id, set: val })
    );
  }

  const fileIds = new Set<string>();
  for (const r of data.physicalFiles) {
    const id = typeof r.id === 'string' && r.id ? r.id : crypto.randomUUID();
    fileIds.add(id);
    const linkedCaseId = typeof r.caseId === 'string' && caseIds.has(r.caseId) ? r.caseId : null;
    const linkedClientId = typeof r.clientId === 'string' && clientIds.has(r.clientId) ? r.clientId : null;
    const serial = typeof r.serial === 'string' && r.serial ? r.serial : `F-${id.slice(0, 8)}`;
    const val = {
      id,
      firmId: firm.id,
      serial,
      caseId: linkedCaseId,
      clientId: linkedClientId,
      title: String(r.title || serial),
      shelfLocation: typeof r.shelfLocation === 'string' ? r.shelfLocation : null,
      status: normalizeFileStatus(r.status),
      currentHolderId: resolveOptionalUserId(r.currentHolderId ?? r.holderId),
      checkedOutAt: typeof r.checkedOutAt === 'string' ? r.checkedOutAt : null,
      dueBackAt: typeof r.dueBackAt === 'string' ? r.dueBackAt : null,
      notes: typeof r.notes === 'string' ? r.notes : null,
      createdAt: typeof r.createdAt === 'string' ? r.createdAt : nowIso,
      updatedAt: nowIso,
      deletedAt: null,
      createdBy: resolveUserId(r.createdBy),
      updatedBy: user.id,
    };
    statements.push(
      db.insert(schema.physicalFiles).values(val).onConflictDoUpdate({ target: schema.physicalFiles.id, set: val })
    );
  }

  for (const r of data.fileMovements) {
    if (typeof r.fileId !== 'string' || !fileIds.has(r.fileId)) continue;
    const id = typeof r.id === 'string' && r.id ? r.id : crypto.randomUUID();
    const actionRaw = r.action;
    const action =
      actionRaw === 'CHECKOUT' ||
      actionRaw === 'CHECKIN' ||
      actionRaw === 'COURT_DISPATCH' ||
      actionRaw === 'TRANSFER' ||
      actionRaw === 'ARCHIVE'
        ? actionRaw
        : 'CHECKIN';
    const val = {
      id,
      firmId: firm.id,
      fileId: r.fileId,
      action,
      userId: resolveUserId(r.userId),
      at: typeof r.at === 'string' ? r.at : nowIso,
      dueBackAt: typeof r.dueBackAt === 'string' ? r.dueBackAt : null,
      note: typeof r.note === 'string' ? r.note : null,
    };
    statements.push(
      db.insert(schema.fileMovements).values(val).onConflictDoUpdate({ target: schema.fileMovements.id, set: val })
    );
  }

  const appointmentIds = new Set<string>();
  for (const r of data.appointments) {
    const id = typeof r.id === 'string' && r.id ? r.id : crypto.randomUUID();
    appointmentIds.add(id);
    const linkedCaseId = typeof r.caseId === 'string' && caseIds.has(r.caseId) ? r.caseId : null;
    const linkedClientId = typeof r.clientId === 'string' && clientIds.has(r.clientId) ? r.clientId : null;
    const val = {
      id,
      firmId: firm.id,
      title: String(r.title || 'Restored Appointment'),
      type: normalizeAppointmentType(r.type),
      startsAt: typeof r.startsAt === 'string' ? r.startsAt : nowIso,
      endsAt: typeof r.endsAt === 'string' ? r.endsAt : nowIso,
      mode: normalizeAppointmentMode(r.mode),
      location: typeof r.location === 'string' ? r.location : null,
      organiserUserId: resolveUserId(r.organiserUserId ?? r.createdBy),
      clientId: linkedClientId,
      caseId: linkedCaseId,
      status: normalizeAppointmentStatus(r.status),
      notes: typeof r.notes === 'string' ? r.notes : null,
      reminderMinutesBefore: typeof r.reminderMinutesBefore === 'number' ? r.reminderMinutesBefore : 30,
      createdAt: typeof r.createdAt === 'string' ? r.createdAt : nowIso,
      updatedAt: nowIso,
      deletedAt: null,
      createdBy: resolveUserId(r.createdBy),
      updatedBy: user.id,
    };
    statements.push(
      db.insert(schema.appointments).values(val).onConflictDoUpdate({ target: schema.appointments.id, set: val })
    );

    if (Array.isArray(r.attendees)) {
      for (const attId of r.attendees) {
        if (typeof attId === 'string' && validUserIds.has(attId)) {
          statements.push(
            db.insert(schema.appointmentAttendees).values({
              id: crypto.randomUUID(),
              appointmentId: id,
              userId: attId,
              firmId: firm.id,
              createdAt: nowIso,
              updatedAt: nowIso,
            })
          );
        }
      }
    }
  }

  for (const r of data.reminders) {
    const id = typeof r.id === 'string' && r.id ? r.id : crypto.randomUUID();
    const stRaw = r.sourceType;
    const sourceType =
      stRaw === 'hearing' || stRaw === 'task' || stRaw === 'file_return' || stRaw === 'appointment'
        ? stRaw
        : 'task';
    const chRaw = r.channel;
    const channel = chRaw === 'in_app' || chRaw === 'email_stub' || chRaw === 'sms_stub' ? chRaw : 'in_app';
    const statusRaw = r.status;
    const status = statusRaw === 'pending' || statusRaw === 'sent' || statusRaw === 'dismissed' ? statusRaw : 'pending';
    const val = {
      id,
      firmId: firm.id,
      userId: resolveUserId(r.userId),
      sourceType,
      sourceId: String(r.sourceId || id),
      title: String(r.title || 'Restored Reminder'),
      description: typeof r.description === 'string' ? r.description : null,
      remindAt: typeof r.remindAt === 'string' ? r.remindAt : nowIso,
      dueAt: typeof r.dueAt === 'string' ? r.dueAt : nowIso,
      channel,
      status,
      sentAt: typeof r.sentAt === 'string' ? r.sentAt : null,
      dismissedAt: typeof r.dismissedAt === 'string' ? r.dismissedAt : null,
      createdAt: typeof r.createdAt === 'string' ? r.createdAt : nowIso,
      updatedAt: nowIso,
      deletedAt: null,
      createdBy: resolveUserId(r.createdBy),
      updatedBy: user.id,
    };
    statements.push(
      db.insert(schema.reminders).values(val).onConflictDoUpdate({ target: schema.reminders.id, set: val })
    );
  }

  const restoredCounts = {
    clients: clientIds.size,
    cases: caseIds.size,
    hearings: hearingIds.size,
    hearingDateHistory: data.hearingDateHistory.length,
    tasks: data.tasks.length,
    physicalFiles: fileIds.size,
    fileMovements: data.fileMovements.length,
    reminders: data.reminders.length,
    auditLog: 0,
    clientNotes: data.clientNotes.length,
    caseNotes: data.caseNotes.length,
    appointments: appointmentIds.size,
  };

  const restoreAudit = buildAuditEntry({
    firmId: firm.id,
    userId: user.id,
    userName: user.name,
    entity: 'ChamberBackup',
    entityId: firm.id,
    action: 'BACKUP_RESTORE',
    oldValue: {
      clients: existingClients.length,
      cases: existingCases.length,
      tasks: existingTasks.length,
    },
    newValue: {
      mode,
      sourceFirm: metadata?.firmName || null,
      sourceFirmId: metadata?.firmId || null,
      exportedAt: metadata?.exportedAt || null,
      restoredCounts,
      restoredAt: nowIso,
    },
  });

  statements.push(db.insert(schema.auditLog).values(restoreAudit));

  // Execute in D1-safe batches (chunked by 50 statements)
  for (let i = 0; i < statements.length; i += 50) {
    await db.batch(statements.slice(i, i + 50) as [any, ...any[]]);
  }

  return c.json({
    success: true,
    mode,
    restoredAt: nowIso,
    restoredBy: user.id,
    restoredByName: user.name,
    auditLogId: restoreAudit.id,
    counts: restoredCounts,
    message: `Successfully restored ${restoredCounts.cases} cases, ${restoredCounts.clients} clients, and ${restoredCounts.hearings} hearings in ${mode} mode.`,
  });
});
