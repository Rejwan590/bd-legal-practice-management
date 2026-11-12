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

function normalizeFeeType(raw: unknown): 'fixed' | 'per_hearing' | 'hourly' | 'retainer' | 'installment' {
  if (raw === 'fixed' || raw === 'per_hearing' || raw === 'hourly' || raw === 'retainer' || raw === 'installment') {
    return raw;
  }
  return 'fixed';
}

function normalizeFeeAgreementStatus(raw: unknown): 'active' | 'closed' | 'void' {
  if (raw === 'active' || raw === 'closed' || raw === 'void') return raw;
  return 'active';
}

function normalizePaymentMethod(raw: unknown): 'cash' | 'bank' | 'bkash' | 'nagad' | 'cheque' | 'other' {
  if (raw === 'cash' || raw === 'bank' || raw === 'bkash' || raw === 'nagad' || raw === 'cheque' || raw === 'other') {
    return raw;
  }
  return 'cash';
}

function normalizePostedVoidStatus(raw: unknown): 'posted' | 'void' {
  if (raw === 'posted' || raw === 'void') return raw;
  return 'posted';
}

function normalizeChamberExpenseKind(raw: unknown): 'general' | 'salary' {
  if (raw === 'general' || raw === 'salary') return raw;
  return 'general';
}

function normalizeChamberPaymentMethod(raw: unknown): 'cash' | 'bank' | 'mobile_banking' | 'cheque' | 'other' {
  if (raw === 'cash' || raw === 'bank' || raw === 'mobile_banking' || raw === 'cheque' || raw === 'other') {
    return raw;
  }
  return 'cash';
}

function normalizeChamberAdvanceStatus(raw: unknown): 'open' | 'settled' | 'void' {
  if (raw === 'open' || raw === 'settled' || raw === 'void') return raw;
  return 'open';
}

function normalizeChamberSettlementType(raw: unknown): 'expense' | 'refund' {
  if (raw === 'expense' || raw === 'refund') return raw;
  return 'expense';
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
    allCaseShares,
    allHearings,
    allHearingHistory,
    allTasks,
    allFiles,
    allFileMovements,
    allAppointments,
    allAppointmentAttendees,
    allReminders,
    allFeeAgreements,
    allFeeAgreementChanges,
    allNumberSequences,
    allFeePayments,
    allExpenseCategories,
    allExpenses,
    allChamberExpenseCategories,
    allChamberAdvances,
    allChamberExpenses,
    allChamberAdvanceSettlements,
    allAuditLogs,
    visibleCases,
  ] = await Promise.all([
    db.select().from(schema.clients).where(and(eq(schema.clients.firmId, firm.id), isNull(schema.clients.deletedAt))),
    db.select().from(schema.clientNotes).where(and(eq(schema.clientNotes.firmId, firm.id), isNull(schema.clientNotes.deletedAt))),
    db.select().from(schema.cases).where(and(eq(schema.cases.firmId, firm.id), isNull(schema.cases.deletedAt))),
    db.select().from(schema.caseNotes).where(and(eq(schema.caseNotes.firmId, firm.id), isNull(schema.caseNotes.deletedAt))),
    db.select().from(schema.caseShares).where(and(eq(schema.caseShares.firmId, firm.id), isNull(schema.caseShares.deletedAt))),
    db.select().from(schema.hearings).where(and(eq(schema.hearings.firmId, firm.id), isNull(schema.hearings.deletedAt))),
    db.select().from(schema.hearingDateHistory).where(eq(schema.hearingDateHistory.firmId, firm.id)),
    db.select().from(schema.tasks).where(and(eq(schema.tasks.firmId, firm.id), isNull(schema.tasks.deletedAt))),
    db.select().from(schema.physicalFiles).where(and(eq(schema.physicalFiles.firmId, firm.id), isNull(schema.physicalFiles.deletedAt))),
    db.select().from(schema.fileMovements).where(eq(schema.fileMovements.firmId, firm.id)),
    db.select().from(schema.appointments).where(and(eq(schema.appointments.firmId, firm.id), isNull(schema.appointments.deletedAt))),
    db.select().from(schema.appointmentAttendees).where(eq(schema.appointmentAttendees.firmId, firm.id)),
    db.select().from(schema.reminders).where(and(eq(schema.reminders.firmId, firm.id), isNull(schema.reminders.deletedAt))),
    db.select().from(schema.feeAgreements).where(and(eq(schema.feeAgreements.firmId, firm.id), isNull(schema.feeAgreements.deletedAt))),
    db.select().from(schema.feeAgreementChanges).where(eq(schema.feeAgreementChanges.firmId, firm.id)),
    db.select().from(schema.numberSequences).where(eq(schema.numberSequences.firmId, firm.id)),
    db.select().from(schema.feePayments).where(and(eq(schema.feePayments.firmId, firm.id), isNull(schema.feePayments.deletedAt))),
    db.select().from(schema.expenseCategories).where(and(eq(schema.expenseCategories.firmId, firm.id), isNull(schema.expenseCategories.deletedAt))),
    db.select().from(schema.expenses).where(and(eq(schema.expenses.firmId, firm.id), isNull(schema.expenses.deletedAt))),
    db.select().from(schema.chamberExpenseCategories).where(and(eq(schema.chamberExpenseCategories.firmId, firm.id), isNull(schema.chamberExpenseCategories.deletedAt))),
    db.select().from(schema.chamberAdvances).where(and(eq(schema.chamberAdvances.firmId, firm.id), isNull(schema.chamberAdvances.deletedAt))),
    db.select().from(schema.chamberExpenses).where(and(eq(schema.chamberExpenses.firmId, firm.id), isNull(schema.chamberExpenses.deletedAt))),
    db.select().from(schema.chamberAdvanceSettlements).where(and(eq(schema.chamberAdvanceSettlements.firmId, firm.id), isNull(schema.chamberAdvanceSettlements.deletedAt))),
    db.select().from(schema.auditLog).where(and(eq(schema.auditLog.firmId, firm.id), isNull(schema.auditLog.deletedAt))).orderBy(desc(schema.auditLog.timestamp)).limit(1000),
    getVisibleCaseIds(db, firm, user),
  ]);

  const canSeeRestricted = user.role === 'Owner' || Boolean((user.permissions as Record<string, boolean>)?.['restricted.view']);
  const visibleCaseSet = visibleCases === 'ALL' ? null : new Set(visibleCases);

  const exportedCases = visibleCaseSet ? allCases.filter((cs) => visibleCaseSet.has(cs.id)) : allCases;
  const hiddenCaseIdSet = new Set(allCases.filter((cs) => visibleCaseSet && !visibleCaseSet.has(cs.id)).map((cs) => cs.id));

  const exportedCaseNotes = hiddenCaseIdSet.size > 0 ? allCaseNotes.filter((cn) => !hiddenCaseIdSet.has(cn.caseId)) : allCaseNotes;
  const exportedCaseShares = hiddenCaseIdSet.size > 0 ? allCaseShares.filter((cs) => !hiddenCaseIdSet.has(cs.caseId)) : allCaseShares;
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

  const hiddenFeeAgreementIdSet = new Set(
    allFeeAgreements.filter((fa) => fa.caseId && hiddenCaseIdSet.has(fa.caseId)).map((fa) => fa.id)
  );
  const exportedFeeAgreements =
    hiddenCaseIdSet.size > 0 ? allFeeAgreements.filter((fa) => !hiddenFeeAgreementIdSet.has(fa.id)) : allFeeAgreements;
  const exportedFeeAgreementChanges =
    hiddenCaseIdSet.size > 0
      ? allFeeAgreementChanges.filter((fc) => !hiddenFeeAgreementIdSet.has(fc.feeAgreementId))
      : allFeeAgreementChanges;
  const exportedFeePayments =
    hiddenCaseIdSet.size > 0
      ? allFeePayments.filter(
          (fp) =>
            !(fp.caseId && hiddenCaseIdSet.has(fp.caseId)) &&
            !(fp.feeAgreementId && hiddenFeeAgreementIdSet.has(fp.feeAgreementId)) &&
            !(fp.hearingId && hiddenHearingIdSet.has(fp.hearingId))
        )
      : allFeePayments;
  const exportedExpenses =
    hiddenCaseIdSet.size > 0
      ? allExpenses.filter((ex) => !(ex.caseId && hiddenCaseIdSet.has(ex.caseId)))
      : allExpenses;

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
        caseShares: exportedCaseShares.length,
        hearings: exportedHearings.length,
        tasks: exportedTasks.length,
        physicalFiles: exportedFiles.length,
        appointments: exportedAppointments.length,
        feeAgreements: exportedFeeAgreements.length,
        feePayments: exportedFeePayments.length,
        expenses: exportedExpenses.length,
        chamberAdvances: allChamberAdvances.length,
        chamberExpenses: allChamberExpenses.length,
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
    caseShares: exportedCaseShares,
    hearings: exportedHearings,
    hearingDateHistory: exportedHearingHistory,
    tasks: exportedTasks,
    physicalFiles: exportedFiles,
    fileMovements: exportedFileMovements,
    appointments: exportedAppointments,
    appointmentAttendees: exportedAppointmentAttendees,
    reminders: exportedReminders,
    feeAgreements: exportedFeeAgreements,
    feeAgreementChanges: exportedFeeAgreementChanges,
    numberSequences: allNumberSequences,
    feePayments: exportedFeePayments,
    expenseCategories: allExpenseCategories,
    expenses: exportedExpenses,
    chamberExpenseCategories: allChamberExpenseCategories,
    chamberAdvances: allChamberAdvances,
    chamberExpenses: allChamberExpenses,
    chamberAdvanceSettlements: allChamberAdvanceSettlements,
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
    caseShares: z.array(z.record(z.string(), z.unknown())).default([]),
    hearings: z.array(z.record(z.string(), z.unknown())).default([]),
    hearingDateHistory: z.array(z.record(z.string(), z.unknown())).default([]),
    tasks: z.array(z.record(z.string(), z.unknown())).default([]),
    physicalFiles: z.array(z.record(z.string(), z.unknown())).default([]),
    fileMovements: z.array(z.record(z.string(), z.unknown())).default([]),
    appointments: z.array(z.record(z.string(), z.unknown())).default([]),
    appointmentAttendees: z.array(z.record(z.string(), z.unknown())).default([]),
    reminders: z.array(z.record(z.string(), z.unknown())).default([]),
    feeAgreements: z.array(z.record(z.string(), z.unknown())).default([]),
    feeAgreementChanges: z.array(z.record(z.string(), z.unknown())).default([]),
    numberSequences: z.array(z.record(z.string(), z.unknown())).default([]),
    feePayments: z.array(z.record(z.string(), z.unknown())).default([]),
    expenseCategories: z.array(z.record(z.string(), z.unknown())).default([]),
    expenses: z.array(z.record(z.string(), z.unknown())).default([]),
    chamberExpenseCategories: z.array(z.record(z.string(), z.unknown())).default([]),
    chamberAdvances: z.array(z.record(z.string(), z.unknown())).default([]),
    chamberExpenses: z.array(z.record(z.string(), z.unknown())).default([]),
    chamberAdvanceSettlements: z.array(z.record(z.string(), z.unknown())).default([]),
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
      db.update(schema.chamberAdvanceSettlements).set({ deletedAt: nowIso, updatedAt: nowIso, updatedBy: user.id }).where(and(eq(schema.chamberAdvanceSettlements.firmId, firm.id), isNull(schema.chamberAdvanceSettlements.deletedAt))),
      db.update(schema.chamberExpenses).set({ deletedAt: nowIso, updatedAt: nowIso, updatedBy: user.id }).where(and(eq(schema.chamberExpenses.firmId, firm.id), isNull(schema.chamberExpenses.deletedAt))),
      db.update(schema.chamberAdvances).set({ deletedAt: nowIso, updatedAt: nowIso, updatedBy: user.id }).where(and(eq(schema.chamberAdvances.firmId, firm.id), isNull(schema.chamberAdvances.deletedAt))),
      db.update(schema.chamberExpenseCategories).set({ deletedAt: nowIso, updatedAt: nowIso, updatedBy: user.id }).where(and(eq(schema.chamberExpenseCategories.firmId, firm.id), isNull(schema.chamberExpenseCategories.deletedAt))),
      db.update(schema.expenses).set({ deletedAt: nowIso, updatedAt: nowIso, updatedBy: user.id }).where(and(eq(schema.expenses.firmId, firm.id), isNull(schema.expenses.deletedAt))),
      db.update(schema.expenseCategories).set({ deletedAt: nowIso, updatedAt: nowIso, updatedBy: user.id }).where(and(eq(schema.expenseCategories.firmId, firm.id), isNull(schema.expenseCategories.deletedAt))),
      db.update(schema.feePayments).set({ deletedAt: nowIso, updatedAt: nowIso, updatedBy: user.id }).where(and(eq(schema.feePayments.firmId, firm.id), isNull(schema.feePayments.deletedAt))),
      db.update(schema.feeAgreements).set({ deletedAt: nowIso, updatedAt: nowIso, updatedBy: user.id }).where(and(eq(schema.feeAgreements.firmId, firm.id), isNull(schema.feeAgreements.deletedAt))),
      db.update(schema.caseShares).set({ deletedAt: nowIso }).where(and(eq(schema.caseShares.firmId, firm.id), isNull(schema.caseShares.deletedAt))),
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

    // Avoid unique index collisions on (firm_id, file_serial) / (firm_id, serial) / (firm_id, receipt_number) / (firm_id, idempotency_key)
    const incomingCaseIds = new Set(data.cases.map((r) => String(r.id || '')));
    const incomingFileIds = new Set(data.physicalFiles.map((r) => String(r.id || '')));
    const incomingFeePaymentIds = new Set(data.feePayments.map((r) => String(r.id || '')));
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
    const existingAllFeePayments = await db
      .select({
        id: schema.feePayments.id,
        receiptNumber: schema.feePayments.receiptNumber,
        idempotencyKey: schema.feePayments.idempotencyKey,
      })
      .from(schema.feePayments)
      .where(eq(schema.feePayments.firmId, firm.id));
    for (const efp of existingAllFeePayments) {
      if (!incomingFeePaymentIds.has(efp.id)) {
        const nextReceipt = efp.receiptNumber.includes('_del_') ? efp.receiptNumber : `${efp.receiptNumber}${suffix}`;
        const nextIdem = efp.idempotencyKey.includes('_del_') ? efp.idempotencyKey : `${efp.idempotencyKey}${suffix}`;
        if (nextReceipt !== efp.receiptNumber || nextIdem !== efp.idempotencyKey) {
          statements.push(
            db
              .update(schema.feePayments)
              .set({ receiptNumber: nextReceipt, idempotencyKey: nextIdem })
              .where(eq(schema.feePayments.id, efp.id))
          );
        }
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

  const knownClientIds = new Set<string>([
    ...clientIds,
    ...(mode === 'merge' ? existingClients.map((ec) => ec.id) : []),
  ]);

  for (const r of data.clientNotes) {
    if (typeof r.clientId !== 'string' || !knownClientIds.has(r.clientId)) continue;
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
    if (typeof r.clientId !== 'string' || !knownClientIds.has(r.clientId)) continue;
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

  const knownCaseIds = new Set<string>([
    ...caseIds,
    ...(mode === 'merge' ? existingCases.map((ec) => ec.id) : []),
  ]);

  for (const r of data.caseNotes) {
    if (typeof r.caseId !== 'string' || !knownCaseIds.has(r.caseId)) continue;
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
    if (typeof r.caseId !== 'string' || !knownCaseIds.has(r.caseId)) continue;
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

  let restoredCaseShareCount = 0;
  for (const r of data.caseShares) {
    if (typeof r.caseId !== 'string' || !knownCaseIds.has(r.caseId)) continue;
    if (typeof r.userId !== 'string' || !validUserIds.has(r.userId)) continue;
    const id = typeof r.id === 'string' && r.id ? r.id : crypto.randomUUID();
    const val = {
      id,
      firmId: firm.id,
      caseId: r.caseId,
      userId: r.userId,
      createdAt: typeof r.createdAt === 'string' ? r.createdAt : nowIso,
      createdBy: resolveUserId(r.createdBy),
      deletedAt: null,
    };
    statements.push(
      db.insert(schema.caseShares).values(val).onConflictDoUpdate({ target: schema.caseShares.id, set: val })
    );
    restoredCaseShareCount++;
  }

  const expenseCategoryIds = new Set<string>();
  for (const r of data.expenseCategories) {
    const id = typeof r.id === 'string' && r.id ? r.id : crypto.randomUUID();
    expenseCategoryIds.add(id);
    const val = {
      id,
      firmId: firm.id,
      name: String(r.name || 'General Expense'),
      isDefault: Boolean(r.isDefault),
      createdAt: typeof r.createdAt === 'string' ? r.createdAt : nowIso,
      updatedAt: nowIso,
      deletedAt: null,
      createdBy: resolveUserId(r.createdBy),
      updatedBy: user.id,
    };
    statements.push(
      db.insert(schema.expenseCategories).values(val).onConflictDoUpdate({ target: schema.expenseCategories.id, set: val })
    );
  }
  if (mode === 'merge') {
    const existingExpCats = await db
      .select({ id: schema.expenseCategories.id })
      .from(schema.expenseCategories)
      .where(and(eq(schema.expenseCategories.firmId, firm.id), isNull(schema.expenseCategories.deletedAt)));
    for (const cRow of existingExpCats) expenseCategoryIds.add(cRow.id);
  }

  const feeAgreementIds = new Set<string>();
  for (const r of data.feeAgreements) {
    if (typeof r.clientId !== 'string' || !knownClientIds.has(r.clientId)) continue;
    const id = typeof r.id === 'string' && r.id ? r.id : crypto.randomUUID();
    feeAgreementIds.add(id);
    const linkedCaseId = typeof r.caseId === 'string' && knownCaseIds.has(r.caseId) ? r.caseId : null;
    const val = {
      id,
      firmId: firm.id,
      clientId: r.clientId,
      caseId: linkedCaseId,
      feeType: normalizeFeeType(r.feeType),
      agreedAmountPaisa: typeof r.agreedAmountPaisa === 'number' ? Math.round(r.agreedAmountPaisa) : 0,
      agreementDate: typeof r.agreementDate === 'string' ? r.agreementDate : nowIso.slice(0, 10),
      notes: typeof r.notes === 'string' ? r.notes : null,
      status: normalizeFeeAgreementStatus(r.status),
      createdAt: typeof r.createdAt === 'string' ? r.createdAt : nowIso,
      updatedAt: nowIso,
      deletedAt: null,
      createdBy: resolveUserId(r.createdBy),
      updatedBy: user.id,
    };
    statements.push(
      db.insert(schema.feeAgreements).values(val).onConflictDoUpdate({ target: schema.feeAgreements.id, set: val })
    );
  }
  const knownFeeAgreementIds = new Set<string>(feeAgreementIds);
  if (mode === 'merge') {
    const existingAgreements = await db
      .select({ id: schema.feeAgreements.id })
      .from(schema.feeAgreements)
      .where(and(eq(schema.feeAgreements.firmId, firm.id), isNull(schema.feeAgreements.deletedAt)));
    for (const aRow of existingAgreements) knownFeeAgreementIds.add(aRow.id);
  }

  let restoredFeeAgreementChangeCount = 0;
  for (const r of data.feeAgreementChanges) {
    if (typeof r.feeAgreementId !== 'string' || !knownFeeAgreementIds.has(r.feeAgreementId)) continue;
    const id = typeof r.id === 'string' && r.id ? r.id : crypto.randomUUID();
    const val = {
      id,
      firmId: firm.id,
      feeAgreementId: r.feeAgreementId,
      oldAmountPaisa: typeof r.oldAmountPaisa === 'number' ? Math.round(r.oldAmountPaisa) : 0,
      newAmountPaisa: typeof r.newAmountPaisa === 'number' ? Math.round(r.newAmountPaisa) : 0,
      reason: String(r.reason || 'Restored change'),
      changedBy: resolveUserId(r.changedBy),
      createdAt: typeof r.createdAt === 'string' ? r.createdAt : nowIso,
    };
    statements.push(
      db.insert(schema.feeAgreementChanges).values(val).onConflictDoUpdate({ target: schema.feeAgreementChanges.id, set: val })
    );
    restoredFeeAgreementChangeCount++;
  }

  let restoredFeePaymentCount = 0;
  for (const r of data.feePayments) {
    if (typeof r.clientId !== 'string' || !knownClientIds.has(r.clientId)) continue;
    const id = typeof r.id === 'string' && r.id ? r.id : crypto.randomUUID();
    const linkedCaseId = typeof r.caseId === 'string' && knownCaseIds.has(r.caseId) ? r.caseId : null;
    const linkedAgreementId =
      typeof r.feeAgreementId === 'string' && knownFeeAgreementIds.has(r.feeAgreementId) ? r.feeAgreementId : null;
    const linkedHearingId = typeof r.hearingId === 'string' && hearingIds.has(r.hearingId) ? r.hearingId : null;
    const val = {
      id,
      firmId: firm.id,
      clientId: r.clientId,
      caseId: linkedCaseId,
      feeAgreementId: linkedAgreementId,
      hearingId: linkedHearingId,
      paymentDate: typeof r.paymentDate === 'string' ? r.paymentDate : nowIso.slice(0, 10),
      amountPaisa: typeof r.amountPaisa === 'number' ? Math.round(r.amountPaisa) : 0,
      method: normalizePaymentMethod(r.method),
      reference: typeof r.reference === 'string' ? r.reference : null,
      receiptNumber: typeof r.receiptNumber === 'string' && r.receiptNumber ? r.receiptNumber : `RCP-${id.slice(0, 8)}`,
      purposeNote: String(r.purposeNote || ''),
      status: normalizePostedVoidStatus(r.status),
      voidReason: typeof r.voidReason === 'string' ? r.voidReason : null,
      voidedBy: resolveOptionalUserId(r.voidedBy),
      voidedAt: typeof r.voidedAt === 'string' ? r.voidedAt : null,
      idempotencyKey:
        typeof r.idempotencyKey === 'string' && r.idempotencyKey ? r.idempotencyKey : `restore-${id}`,
      legacyUnassigned: Boolean(r.legacyUnassigned),
      createdAt: typeof r.createdAt === 'string' ? r.createdAt : nowIso,
      updatedAt: nowIso,
      deletedAt: null,
      createdBy: resolveUserId(r.createdBy),
      updatedBy: user.id,
    };
    statements.push(
      db.insert(schema.feePayments).values(val).onConflictDoUpdate({ target: schema.feePayments.id, set: val })
    );
    restoredFeePaymentCount++;
  }

  let restoredExpenseCount = 0;
  for (const r of data.expenses) {
    if (typeof r.categoryId !== 'string' || !expenseCategoryIds.has(r.categoryId)) continue;
    const id = typeof r.id === 'string' && r.id ? r.id : crypto.randomUUID();
    const linkedClientId = typeof r.clientId === 'string' && knownClientIds.has(r.clientId) ? r.clientId : null;
    const linkedCaseId = typeof r.caseId === 'string' && knownCaseIds.has(r.caseId) ? r.caseId : null;
    const val = {
      id,
      firmId: firm.id,
      clientId: linkedClientId,
      caseId: linkedCaseId,
      categoryId: r.categoryId,
      expenseDate: typeof r.expenseDate === 'string' ? r.expenseDate : nowIso.slice(0, 10),
      amountPaisa: typeof r.amountPaisa === 'number' ? Math.round(r.amountPaisa) : 0,
      description: String(r.description || 'Restored Expense'),
      reimbursable: r.reimbursable === undefined ? true : Boolean(r.reimbursable),
      status: normalizePostedVoidStatus(r.status),
      voidReason: typeof r.voidReason === 'string' ? r.voidReason : null,
      voidedBy: resolveOptionalUserId(r.voidedBy),
      voidedAt: typeof r.voidedAt === 'string' ? r.voidedAt : null,
      createdAt: typeof r.createdAt === 'string' ? r.createdAt : nowIso,
      updatedAt: nowIso,
      deletedAt: null,
      createdBy: resolveUserId(r.createdBy),
      updatedBy: user.id,
    };
    statements.push(
      db.insert(schema.expenses).values(val).onConflictDoUpdate({ target: schema.expenses.id, set: val })
    );
    restoredExpenseCount++;
  }

  let restoredNumberSequenceCount = 0;
  if (data.numberSequences.length > 0) {
    const existingSeqs = await db
      .select()
      .from(schema.numberSequences)
      .where(eq(schema.numberSequences.firmId, firm.id));
    const seqByType = new Map(existingSeqs.map((s) => [s.type, s]));
    for (const r of data.numberSequences) {
      if (typeof r.type !== 'string' || !r.type) continue;
      const incomingVal = typeof r.currentVal === 'number' ? Math.round(r.currentVal) : 0;
      const prefix = typeof r.prefix === 'string' && r.prefix ? r.prefix : `${r.type.toUpperCase()}-`;
      const existing = seqByType.get(r.type);
      if (existing) {
        const nextVal = mode === 'clean' ? incomingVal : Math.max(existing.currentVal, incomingVal);
        statements.push(
          db
            .update(schema.numberSequences)
            .set({ prefix, currentVal: nextVal, updatedAt: nowIso })
            .where(eq(schema.numberSequences.id, existing.id))
        );
      } else {
        const id = typeof r.id === 'string' && r.id ? r.id : crypto.randomUUID();
        statements.push(
          db.insert(schema.numberSequences).values({
            id,
            firmId: firm.id,
            type: r.type,
            prefix,
            currentVal: incomingVal,
            updatedAt: nowIso,
          })
        );
      }
      restoredNumberSequenceCount++;
    }
  }

  const chamberCategoryIds = new Set<string>();
  for (const r of data.chamberExpenseCategories) {
    const id = typeof r.id === 'string' && r.id ? r.id : crypto.randomUUID();
    chamberCategoryIds.add(id);
    const val = {
      id,
      firmId: firm.id,
      name: String(r.name || 'Chamber Expense'),
      nameBn: typeof r.nameBn === 'string' ? r.nameBn : null,
      kind: normalizeChamberExpenseKind(r.kind),
      isDefault: Boolean(r.isDefault),
      createdAt: typeof r.createdAt === 'string' ? r.createdAt : nowIso,
      updatedAt: nowIso,
      deletedAt: null,
      createdBy: resolveUserId(r.createdBy),
      updatedBy: user.id,
    };
    statements.push(
      db.insert(schema.chamberExpenseCategories).values(val).onConflictDoUpdate({ target: schema.chamberExpenseCategories.id, set: val })
    );
  }
  if (mode === 'merge') {
    const existingChamberCats = await db
      .select({ id: schema.chamberExpenseCategories.id })
      .from(schema.chamberExpenseCategories)
      .where(and(eq(schema.chamberExpenseCategories.firmId, firm.id), isNull(schema.chamberExpenseCategories.deletedAt)));
    for (const cc of existingChamberCats) chamberCategoryIds.add(cc.id);
  }

  const chamberAdvanceIds = new Set<string>();
  for (const r of data.chamberAdvances) {
    const id = typeof r.id === 'string' && r.id ? r.id : crypto.randomUUID();
    chamberAdvanceIds.add(id);
    const val = {
      id,
      firmId: firm.id,
      givenTo: String(r.givenTo || 'Staff'),
      givenToUserId: resolveOptionalUserId(r.givenToUserId),
      amountPaisa: typeof r.amountPaisa === 'number' ? Math.round(r.amountPaisa) : 0,
      givenDate: typeof r.givenDate === 'string' ? r.givenDate : nowIso.slice(0, 10),
      purpose: String(r.purpose || ''),
      paymentMethod: normalizeChamberPaymentMethod(r.paymentMethod),
      status: normalizeChamberAdvanceStatus(r.status),
      voidReason: typeof r.voidReason === 'string' ? r.voidReason : null,
      voidedBy: resolveOptionalUserId(r.voidedBy),
      voidedAt: typeof r.voidedAt === 'string' ? r.voidedAt : null,
      createdAt: typeof r.createdAt === 'string' ? r.createdAt : nowIso,
      updatedAt: nowIso,
      deletedAt: null,
      createdBy: resolveUserId(r.createdBy),
      updatedBy: user.id,
    };
    statements.push(
      db.insert(schema.chamberAdvances).values(val).onConflictDoUpdate({ target: schema.chamberAdvances.id, set: val })
    );
  }
  const knownChamberAdvanceIds = new Set<string>(chamberAdvanceIds);
  if (mode === 'merge') {
    const existingAdvances = await db
      .select({ id: schema.chamberAdvances.id })
      .from(schema.chamberAdvances)
      .where(and(eq(schema.chamberAdvances.firmId, firm.id), isNull(schema.chamberAdvances.deletedAt)));
    for (const ca of existingAdvances) knownChamberAdvanceIds.add(ca.id);
  }

  const chamberExpenseIds = new Set<string>();
  for (const r of data.chamberExpenses) {
    if (typeof r.categoryId !== 'string' || !chamberCategoryIds.has(r.categoryId)) continue;
    const id = typeof r.id === 'string' && r.id ? r.id : crypto.randomUUID();
    chamberExpenseIds.add(id);
    const linkedAdvanceId =
      typeof r.advanceId === 'string' && knownChamberAdvanceIds.has(r.advanceId) ? r.advanceId : null;
    const val = {
      id,
      firmId: firm.id,
      categoryId: r.categoryId,
      description: String(r.description || 'Restored Chamber Expense'),
      amountPaisa: typeof r.amountPaisa === 'number' ? Math.round(r.amountPaisa) : 0,
      expenseDate: typeof r.expenseDate === 'string' ? r.expenseDate : nowIso.slice(0, 10),
      paidTo: String(r.paidTo || 'N/A'),
      paymentMethod: normalizeChamberPaymentMethod(r.paymentMethod),
      receiptRef: typeof r.receiptRef === 'string' ? r.receiptRef : null,
      notes: typeof r.notes === 'string' ? r.notes : null,
      advanceId: linkedAdvanceId,
      status: normalizePostedVoidStatus(r.status),
      voidReason: typeof r.voidReason === 'string' ? r.voidReason : null,
      voidedBy: resolveOptionalUserId(r.voidedBy),
      voidedAt: typeof r.voidedAt === 'string' ? r.voidedAt : null,
      createdAt: typeof r.createdAt === 'string' ? r.createdAt : nowIso,
      updatedAt: nowIso,
      deletedAt: null,
      createdBy: resolveUserId(r.createdBy),
      updatedBy: user.id,
    };
    statements.push(
      db.insert(schema.chamberExpenses).values(val).onConflictDoUpdate({ target: schema.chamberExpenses.id, set: val })
    );
  }
  const knownChamberExpenseIds = new Set<string>(chamberExpenseIds);
  if (mode === 'merge') {
    const existingChamberExpenses = await db
      .select({ id: schema.chamberExpenses.id })
      .from(schema.chamberExpenses)
      .where(and(eq(schema.chamberExpenses.firmId, firm.id), isNull(schema.chamberExpenses.deletedAt)));
    for (const ce of existingChamberExpenses) knownChamberExpenseIds.add(ce.id);
  }

  let restoredChamberSettlementCount = 0;
  for (const r of data.chamberAdvanceSettlements) {
    if (typeof r.advanceId !== 'string' || !knownChamberAdvanceIds.has(r.advanceId)) continue;
    const id = typeof r.id === 'string' && r.id ? r.id : crypto.randomUUID();
    const linkedExpenseId =
      typeof r.expenseId === 'string' && knownChamberExpenseIds.has(r.expenseId) ? r.expenseId : null;
    const val = {
      id,
      firmId: firm.id,
      advanceId: r.advanceId,
      type: normalizeChamberSettlementType(r.type),
      expenseId: linkedExpenseId,
      amountPaisa: typeof r.amountPaisa === 'number' ? Math.round(r.amountPaisa) : 0,
      settledDate: typeof r.settledDate === 'string' ? r.settledDate : nowIso.slice(0, 10),
      notes: typeof r.notes === 'string' ? r.notes : null,
      createdAt: typeof r.createdAt === 'string' ? r.createdAt : nowIso,
      updatedAt: nowIso,
      deletedAt: null,
      createdBy: resolveUserId(r.createdBy),
      updatedBy: user.id,
    };
    statements.push(
      db
        .insert(schema.chamberAdvanceSettlements)
        .values(val)
        .onConflictDoUpdate({ target: schema.chamberAdvanceSettlements.id, set: val })
    );
    restoredChamberSettlementCount++;
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
    caseShares: restoredCaseShareCount,
    feeAgreements: feeAgreementIds.size,
    feeAgreementChanges: restoredFeeAgreementChangeCount,
    numberSequences: restoredNumberSequenceCount,
    feePayments: restoredFeePaymentCount,
    expenseCategories: expenseCategoryIds.size,
    expenses: restoredExpenseCount,
    chamberExpenseCategories: chamberCategoryIds.size,
    chamberAdvances: chamberAdvanceIds.size,
    chamberExpenses: chamberExpenseIds.size,
    chamberAdvanceSettlements: restoredChamberSettlementCount,
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
