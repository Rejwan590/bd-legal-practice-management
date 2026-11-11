import pg from 'pg';
import crypto from 'crypto';
import { drizzle } from 'drizzle-orm/node-postgres';
import { eq, and, isNull, isNotNull, desc, asc, gte, lte, or, ilike, ne, sql, SQL, inArray } from 'drizzle-orm';
import bcrypt from 'bcryptjs';
import * as schema from './schema.js';
import { getSeedUsers, SEED_FIRMS, SEED_PLANS, SEED_CLIENTS, SEED_CASES } from './seed.js';
import {
  canUserSeeCase,
  buildCaseVisibilitySql,
  canUserSeeClient,
  buildClientVisibilitySql,
  canUserSeeAppointment,
} from '../services/visibilityService.js';

export interface VisibilityUserContext {
  id: string;
  firmId: string;
  role: string;
  permissions?: string[];
}

export interface ClientLinkedOverview {
  cases: Array<{
    id: string;
    caseNumber: string;
    court: string;
    matterType: string;
    status: string;
  }>;
  tasks: Array<{
    id: string;
    title: string;
    priority: string;
    status: string;
    dueAt: string;
  }>;
  files: Array<{
    id: string;
    serial: string;
    title?: string;
    status: string;
    holderName: string;
  }>;
}

export interface CaseLinkedCounts {
  hearingsCount: number;
  tasksCount: number;
  filesCount: number;
  remindersCount: number;
}

export interface IDatabase {
  isHealthy(): Promise<boolean>;
  getFirm(id: string, includeDeleted?: boolean): Promise<schema.Firm | null>;
  updateFirm(id: string, updates: Partial<schema.Firm>): Promise<schema.Firm>;
  insertFirm(firm: schema.Firm | schema.NewFirm): Promise<schema.Firm>;
  listFirms(query?: {
    search?: string;
    status?: string;
    page?: number;
    limit?: number;
    includeDeleted?: boolean;
  }): Promise<{ firms: schema.Firm[]; total: number; page: number; limit: number }>;
  getPlan(id: string): Promise<schema.Plan | null>;
  listPlans(): Promise<schema.Plan[]>;
  insertPlan(plan: schema.Plan): Promise<schema.Plan>;
  updatePlan(id: string, updates: Partial<schema.Plan>): Promise<schema.Plan>;
  getUserByEmail(email: string): Promise<schema.User | null>;
  getUserById(id: string): Promise<schema.User | null>;
  listUsers(firmId: string): Promise<schema.User[]>;
  insertUser(user: schema.User | schema.NewUser): Promise<schema.User>;
  updateUser(id: string, updates: Partial<schema.User>): Promise<schema.User>;
  incrementFailedLogin(
    id: string,
    lockedUntil: Date | null
  ): Promise<{ failedLoginAttempts: number; lockedUntil: Date | null }>;
  resetFailedLogin(id: string): Promise<void>;
  insertAudit(entry: schema.AuditLogEntry): Promise<schema.AuditLogEntry>;
  listAudit(
    firmId: string,
    limit?: number,
    offset?: number,
    includeRestricted?: boolean,
    user?: VisibilityUserContext,
    filter?: {
      entity?: string;
      action?: string;
      userId?: string;
      startDate?: string;
      endDate?: string;
    }
  ): Promise<schema.AuditLogEntry[]>;
  // Clients (Step 3.1)
  listClients(firmId: string, search?: string, user?: VisibilityUserContext): Promise<schema.Client[]>;
  getClientById(id: string, firmId: string, user?: VisibilityUserContext, includeDeleted?: boolean): Promise<schema.Client | null>;
  insertClient(client: schema.Client): Promise<schema.Client>;
  updateClient(id: string, firmId: string, updates: Partial<schema.Client>): Promise<schema.Client>;
  countActiveCasesForClient(clientId: string, firmId: string): Promise<number>;
  getClientLinkedOverview(
    clientId: string,
    firmId: string,
    includeRestricted?: boolean,
    user?: VisibilityUserContext
  ): Promise<ClientLinkedOverview>;
  // Client Photos
  getClientPhoto(clientId: string, firmId: string): Promise<schema.ClientPhoto | null>;
  upsertClientPhoto(photo: schema.ClientPhoto): Promise<schema.ClientPhoto>;
  deleteClientPhoto(clientId: string, firmId: string): Promise<void>;
  // Client Notes
  listClientNotes(
    clientId: string,
    firmId: string,
    limit?: number,
    offset?: number
  ): Promise<{ notes: schema.ClientNote[]; total: number }>;
  getClientNoteById(noteId: string, clientId: string, firmId: string): Promise<schema.ClientNote | null>;
  insertClientNote(note: schema.ClientNote): Promise<schema.ClientNote>;
  updateClientNote(
    noteId: string,
    clientId: string,
    firmId: string,
    updates: Partial<schema.ClientNote>
  ): Promise<schema.ClientNote>;
  deleteClientNote(noteId: string, clientId: string, firmId: string, updatedBy?: string): Promise<void>;
  // Cases (Step 3.2)
  listCases(
    firmId: string,
    filter?: {
      search?: string;
      status?: 'ongoing' | 'pending' | 'closed' | 'all';
      court?: string;
      matterType?: string;
      clientId?: string;
      includeRestricted?: boolean;
      user?: VisibilityUserContext;
      scope?: 'my' | 'team' | 'all';
      sortBy?: 'caseDate' | 'createdAt' | 'caseNumber';
      sortOrder?: 'asc' | 'desc';
    }
  ): Promise<Array<schema.Case & { latestNote?: { noteDate: string; body: string } | null }>>;
  getCaseById(id: string, firmId: string, user?: VisibilityUserContext): Promise<schema.Case | null>;
  insertCase(c: schema.Case): Promise<schema.Case>;
  updateCase(id: string, firmId: string, updates: Partial<schema.Case>): Promise<schema.Case>;
  checkDuplicateCase(
    firmId: string,
    caseNumber: string,
    court: string,
    excludeId?: string,
    includeRestricted?: boolean,
    user?: VisibilityUserContext
  ): Promise<boolean>;
  getCaseLinkedCounts(caseId: string, firmId: string): Promise<CaseLinkedCounts>;
  // Case Notes
  listCaseNotes(
    caseId: string,
    firmId: string,
    limit?: number,
    offset?: number
  ): Promise<{ notes: schema.CaseNote[]; total: number }>;
  getCaseNoteById(noteId: string, caseId: string, firmId: string): Promise<schema.CaseNote | null>;
  insertCaseNote(note: schema.CaseNote): Promise<schema.CaseNote>;
  updateCaseNote(
    noteId: string,
    caseId: string,
    firmId: string,
    updates: Partial<schema.CaseNote>
  ): Promise<schema.CaseNote>;
  deleteCaseNote(noteId: string, caseId: string, firmId: string, updatedBy?: string): Promise<void>;
  // Appointments
  listAppointments(
    firmId: string,
    filter?: {
      from?: string;
      to?: string;
      status?: string;
      clientId?: string;
      caseId?: string;
      mine?: boolean;
      user?: VisibilityUserContext;
      limit?: number;
      offset?: number;
    }
  ): Promise<{ appointments: Array<schema.Appointment & { attendees: string[] }>; total: number }>;
  getAppointmentById(id: string, firmId: string, user?: VisibilityUserContext): Promise<(schema.Appointment & { attendees: string[] }) | null>;
  insertAppointment(appointment: schema.NewAppointment, attendeeUserIds: string[]): Promise<schema.Appointment & { attendees: string[] }>;
  updateAppointment(id: string, firmId: string, updates: Partial<schema.Appointment>, attendeeUserIds?: string[]): Promise<schema.Appointment & { attendees: string[] }>;
  deleteAppointment(id: string, firmId: string, updatedBy?: string): Promise<void>;
  checkAppointmentOverlap(firmId: string, userId: string, startsAt: Date, endsAt: Date, excludeId?: string): Promise<boolean>;
  // Case Shares
  listCaseShares(caseId: string, firmId: string): Promise<schema.CaseShare[]>;
  listFirmCaseShares(firmId: string): Promise<schema.CaseShare[]>;
  insertCaseShare(share: schema.NewCaseShare): Promise<schema.CaseShare>;
  deleteCaseShare(id: string, firmId: string): Promise<void>;
  // Hearings
  listHearings(
    firmId: string,
    filter?: {
      caseId?: string;
      status?: string;
      fromDate?: string;
      toDate?: string;
      fixedFor?: string;
    },
    user?: VisibilityUserContext
  ): Promise<schema.Hearing[]>;
  getHearingById(id: string, firmId: string, user?: VisibilityUserContext): Promise<schema.Hearing | null>;
  insertHearing(hearing: schema.NewHearing): Promise<schema.Hearing>;
  updateHearing(id: string, firmId: string, updates: Partial<schema.Hearing>): Promise<schema.Hearing>;
  deleteHearing(id: string, firmId: string, updatedBy?: string): Promise<{ success: boolean; softDeleted: true }>;
  insertHearingDateHistory(history: schema.NewHearingDateHistory): Promise<schema.HearingDateHistory>;
  listHearingDateHistory(hearingId: string, firmId: string): Promise<schema.HearingDateHistory[]>;
  // Tasks (Tasks Module)
  listTasks(
    firmId: string,
    filter?: {
      caseId?: string;
      clientId?: string;
      assignedTo?: string;
      status?: string;
      priority?: string;
      search?: string;
      limit?: number;
      offset?: number;
    },
    user?: VisibilityUserContext
  ): Promise<{ tasks: Array<schema.Task & { assignedToName?: string }>; total: number }>;
  getTaskById(id: string, firmId: string, user?: VisibilityUserContext): Promise<(schema.Task & { assignedToName?: string }) | null>;
  insertTask(task: schema.NewTask): Promise<schema.Task & { assignedToName?: string }>;
  updateTask(id: string, firmId: string, updates: Partial<schema.Task>): Promise<schema.Task & { assignedToName?: string }>;
  deleteTask(id: string, firmId: string, updatedBy?: string): Promise<{ success: boolean; softDeleted: true }>;
  // Physical Files & Custody Tracking (Phase 8)
  getNextPhysicalFileSerial(firmId: string): Promise<string>;
  listPhysicalFiles(
    firmId: string,
    filter?: {
      caseId?: string;
      clientId?: string;
      status?: string;
      holderId?: string;
      search?: string;
    },
    user?: VisibilityUserContext
  ): Promise<Array<schema.PhysicalFile & { currentHolderName?: string | null }>>;
  getPhysicalFileById(
    id: string,
    firmId: string
  ): Promise<(schema.PhysicalFile & { currentHolderName?: string | null }) | null>;
  getPhysicalFileBySerial(
    serial: string,
    firmId: string
  ): Promise<(schema.PhysicalFile & { currentHolderName?: string | null }) | null>;
  getPhysicalFileByCaseId(
    caseId: string,
    firmId: string
  ): Promise<(schema.PhysicalFile & { currentHolderName?: string | null }) | null>;
  insertPhysicalFile(
    file: schema.NewPhysicalFile
  ): Promise<schema.PhysicalFile & { currentHolderName?: string | null }>;
  updatePhysicalFile(
    id: string,
    firmId: string,
    updates: Partial<schema.PhysicalFile>
  ): Promise<schema.PhysicalFile & { currentHolderName?: string | null }>;
  deletePhysicalFile(
    id: string,
    firmId: string,
    updatedBy?: string
  ): Promise<{ success: boolean; softDeleted: true }>;
  listFileMovements(
    fileId: string,
    firmId: string
  ): Promise<Array<schema.FileMovement & { userName: string }>>;
  insertFileMovement(
    movement: schema.NewFileMovement
  ): Promise<schema.FileMovement & { userName: string }>;
  // Reminders Module (Phase 9)
  listReminders(
    firmId: string,
    filter?: {
      status?: 'pending' | 'sent' | 'dismissed' | 'active';
      sourceType?: 'hearing' | 'task' | 'file_return' | 'appointment';
      userId?: string;
      search?: string;
      dueOnly?: boolean;
    },
    user?: VisibilityUserContext
  ): Promise<Array<schema.Reminder & { userName?: string }>>;
  getReminderById(
    id: string,
    firmId: string
  ): Promise<(schema.Reminder & { userName?: string }) | null>;
  insertReminder(
    reminder: schema.NewReminder
  ): Promise<schema.Reminder & { userName?: string }>;
  updateReminder(
    id: string,
    firmId: string,
    updates: Partial<schema.Reminder>
  ): Promise<schema.Reminder & { userName?: string }>;
  dismissRemindersBySource(
    firmId: string,
    sourceId: string,
    updatedBy?: string,
    softDelete?: boolean,
    userIdRestrict?: string
  ): Promise<number>;
  rescheduleRemindersBySource(
    firmId: string,
    sourceId: string,
    newDueAt: Date,
    newRemindAt?: Date,
    updatedBy?: string
  ): Promise<number>;
  listRemindersBySourceIds(firmId: string, sourceIds: string[]): Promise<schema.Reminder[]>;
  // Accounts Module (Accounts Phase 1)
  getAccountsSummary(
    firmId: string,
    filter: { clientId?: string; caseId?: string },
    user?: VisibilityUserContext
  ): Promise<{
    totalAgreedPaisa: number;
    totalPaidPaisa: number;
    balancePaisa: number;
    isCredit: boolean;
    creditPaisa: number;
    outstandingPaisa: number;
    totalExpensesPaisa: number;
    caseSummaries?: Array<{
      caseId: string;
      agreedPaisa: number;
      paidPaisa: number;
      balancePaisa: number;
      isCredit: boolean;
      creditPaisa: number;
      outstandingPaisa: number;
      expensesPaisa: number;
    }>;
  }>;
  getClientBalancesOverview(
    firmId: string,
    user?: VisibilityUserContext
  ): Promise<
    Array<{
      clientId: string;
      clientName: string;
      clientNameBn?: string | null;
      clientPhone: string;
      totalAgreedPaisa: number;
      totalPaidPaisa: number;
      balancePaisa: number;
      isCredit: boolean;
      creditPaisa: number;
      outstandingPaisa: number;
    }>
  >;
  getCaseBalancesOverview(
    firmId: string,
    user?: VisibilityUserContext
  ): Promise<
    Array<{
      clientId: string;
      clientName: string;
      clientNameBn?: string | null;
      clientPhone: string;
      caseId: string | null;
      caseNumber: string | null;
      caseTitle: string | null;
      fileSerial?: string | null;
      totalAgreedPaisa: number;
      totalPaidPaisa: number;
      balancePaisa: number;
      isCredit: boolean;
      creditPaisa: number;
      outstandingPaisa: number;
    }>
  >;
  // Fee Agreements
  listFeeAgreements(
    firmId: string,
    filter?: { clientId?: string; caseId?: string; status?: string },
    user?: VisibilityUserContext
  ): Promise<schema.FeeAgreement[]>;
  getFeeAgreementById(id: string, firmId: string, user?: VisibilityUserContext): Promise<schema.FeeAgreement | null>;
  insertFeeAgreement(agreement: schema.NewFeeAgreement): Promise<schema.FeeAgreement>;
  updateFeeAgreement(id: string, firmId: string, updates: Partial<schema.FeeAgreement>): Promise<schema.FeeAgreement>;
  insertFeeAgreementChange(change: schema.NewFeeAgreementChange): Promise<schema.FeeAgreementChange>;
  listFeeAgreementChanges(feeAgreementId: string, firmId: string): Promise<schema.FeeAgreementChange[]>;
  // Fee Payments & Number Sequences
  getNextSequenceNumber(firmId: string, type: string, prefix?: string): Promise<{ sequenceNumber: string; currentVal: number }>;
  listFeePayments(
    firmId: string,
    filter?: { clientId?: string; caseId?: string; feeAgreementId?: string; status?: string; legacyUnassigned?: boolean },
    user?: VisibilityUserContext
  ): Promise<schema.FeePayment[]>;
  getFeePaymentById(id: string, firmId: string, user?: VisibilityUserContext): Promise<schema.FeePayment | null>;
  getFeePaymentByIdempotencyKey(firmId: string, idempotencyKey: string): Promise<schema.FeePayment | null>;
  insertFeePayment(payment: schema.NewFeePayment): Promise<schema.FeePayment>;
  updateFeePayment(id: string, firmId: string, updates: Partial<schema.FeePayment>): Promise<schema.FeePayment>;
  // Expenses & Categories
  listExpenseCategories(firmId: string): Promise<schema.ExpenseCategory[]>;
  seedDefaultExpenseCategories(firmId: string): Promise<schema.ExpenseCategory[]>;
  listExpenses(
    firmId: string,
    filter?: { clientId?: string; caseId?: string; categoryId?: string; status?: string },
    user?: VisibilityUserContext
  ): Promise<Array<schema.Expense & { categoryName?: string }>>;
  getExpenseById(id: string, firmId: string, user?: VisibilityUserContext): Promise<(schema.Expense & { categoryName?: string }) | null>;
  insertExpense(expense: schema.NewExpense): Promise<schema.Expense>;
  updateExpense(id: string, firmId: string, updates: Partial<schema.Expense>): Promise<schema.Expense>;

  // Chamber Expenses & Advances
  listChamberExpenseCategories(firmId: string): Promise<schema.ChamberExpenseCategory[]>;
  createChamberExpenseCategory(firmId: string, data: schema.NewChamberExpenseCategory): Promise<schema.ChamberExpenseCategory>;
  listChamberExpenses(
    firmId: string,
    filter?: { fromDate?: string; toDate?: string; categoryId?: string; status?: string },
    user?: VisibilityUserContext
  ): Promise<Array<schema.ChamberExpense & { categoryName?: string; categoryNameBn?: string | null; categoryKind?: string }>>;
  getChamberExpenseById(
    firmId: string,
    id: string,
    user?: VisibilityUserContext
  ): Promise<(schema.ChamberExpense & { categoryName?: string; categoryNameBn?: string | null; categoryKind?: string }) | null>;
  createChamberExpense(firmId: string, data: schema.NewChamberExpense): Promise<schema.ChamberExpense>;
  updateChamberExpense(firmId: string, id: string, updates: Partial<schema.ChamberExpense>): Promise<schema.ChamberExpense>;
  voidChamberExpense(firmId: string, id: string, voidReason: string, userId: string): Promise<schema.ChamberExpense>;
  getChamberExpensesSummary(
    firmId: string,
    period?: { month?: string; year?: number },
    user?: VisibilityUserContext
  ): Promise<{
    totalThisMonthPaisa: number;
    totalLastMonthPaisa: number;
    totalSalaryThisMonthPaisa: number;
    byCategory: Array<{
      categoryId: string;
      categoryName: string;
      categoryNameBn?: string | null;
      categoryKind: string;
      totalPaisa: number;
      count: number;
    }>;
  }>;
  listChamberAdvances(
    firmId: string,
    filter?: { givenToUserId?: string; status?: string }
  ): Promise<Array<schema.ChamberAdvance & { settledAmountPaisa: number; remainingAmountPaisa: number }>>;
  getChamberAdvanceById(
    firmId: string,
    id: string
  ): Promise<(schema.ChamberAdvance & { settledAmountPaisa: number; remainingAmountPaisa: number; settlements: schema.ChamberAdvanceSettlement[] }) | null>;
  createChamberAdvance(firmId: string, data: schema.NewChamberAdvance): Promise<schema.ChamberAdvance>;
  voidChamberAdvance(firmId: string, id: string, voidReason: string, userId: string): Promise<schema.ChamberAdvance>;
  createChamberAdvanceSettlement(firmId: string, advanceId: string, data: schema.NewChamberAdvanceSettlement): Promise<schema.ChamberAdvanceSettlement>;
  listChamberAdvanceSettlements(firmId: string, advanceId: string): Promise<schema.ChamberAdvanceSettlement[]>;

  // Platform Admins & Admin Audit (Super Admin for software owner)
  getPlatformAdminByEmail(email: string): Promise<schema.PlatformAdmin | null>;
  getPlatformAdminById(id: string): Promise<schema.PlatformAdmin | null>;
  listPlatformAdmins(): Promise<schema.PlatformAdmin[]>;
  insertPlatformAdmin(admin: schema.NewPlatformAdmin): Promise<schema.PlatformAdmin>;
  updatePlatformAdmin(id: string, updates: Partial<schema.PlatformAdmin>): Promise<schema.PlatformAdmin>;
  incrementPlatformAdminFailedLogin(
    id: string,
    lockedUntil: Date | null
  ): Promise<{ failedAttempts: number; lockedUntil: Date | null }>;
  resetPlatformAdminFailedLogin(id: string): Promise<void>;
  insertAdminAudit(entry: schema.NewAdminAuditEntry): Promise<schema.AdminAuditEntry>;
  listAdminAudit(limit?: number, offset?: number): Promise<schema.AdminAuditEntry[]>;
  // License Events (Step B)
  insertLicenseEvent(event: schema.NewLicenseEvent): Promise<schema.LicenseEvent>;
  listLicenseEvents(firmId?: string, limit?: number): Promise<schema.LicenseEvent[]>;
  // Payments (Step B)
  insertPayment(payment: schema.NewPayment): Promise<schema.Payment>;
  listPayments(firmId: string): Promise<schema.Payment[]>;
  // Devices (Step D: Browser install authorization identified by cryptographically random key, not physical hardware)
  getDeviceById(id: string): Promise<schema.Device | null>;
  getDeviceByHash(deviceKeyHash: string): Promise<schema.Device | null>;
  listDevices(firmId: string): Promise<schema.Device[]>;
  countApprovedDevices(firmId: string): Promise<number>;
  countPendingDevices(firmId: string): Promise<number>;
  insertDevice(device: schema.NewDevice): Promise<schema.Device>;
  updateDevice(id: string, updates: Partial<schema.Device>): Promise<schema.Device>;
  deleteDevice(id: string): Promise<void>;
  // Metrics (Step B & D)
  getFirmMetrics(firmId: string): Promise<{ userCount: number; deviceCount: number; pendingDeviceCount: number; lastActivity: Date | null }>;
  // Transactions (R-10: Multi-step write atomicity)
  transaction<T>(callback: (txDb: IDatabase) => Promise<T>): Promise<T>;
}

export const DEFAULT_EXPENSE_CATEGORIES = [
  'Court Fees',
  'Process Server / Notice',
  'Certified Copy',
  'Stamp Duty',
  'Travel / Conveyance',
  'Photocopy & Typing',
  'Miscellaneous',
];

// In-Memory Database Adapter (for headless testing and local development without active Docker container)
class MemoryDatabase implements IDatabase {
  public plans: schema.Plan[] = [];
  public firms: schema.Firm[] = [];
  public users: schema.User[] = [];
  public clients: schema.Client[] = [];
  public clientPhotos: schema.ClientPhoto[] = [];
  public clientNotes: schema.ClientNote[] = [];
  public cases: schema.Case[] = [];
  public caseNotes: schema.CaseNote[] = [];
  public hearings: schema.Hearing[] = [];
  public hearingDateHistory: schema.HearingDateHistory[] = [];
  public caseShares: schema.CaseShare[] = [];
  public appointments: schema.Appointment[] = [];
  public appointmentAttendees: schema.AppointmentAttendee[] = [];
  public auditLogs: schema.AuditLogEntry[] = [];
  public platformAdmins: schema.PlatformAdmin[] = [];
  public adminAudits: schema.AdminAuditEntry[] = [];
  public licenseEvents: schema.LicenseEvent[] = [];
  public payments: schema.Payment[] = [];
  public devices: schema.Device[] = [];
  public tasks: schema.Task[] = [];
  public feeAgreements: schema.FeeAgreement[] = [];
  public feeAgreementChanges: schema.FeeAgreementChange[] = [];
  public numberSequences: schema.NumberSequence[] = [];
  public feePayments: schema.FeePayment[] = [];
  public expenseCategories: schema.ExpenseCategory[] = [];
  public expenses: schema.Expense[] = [];
  public chamberExpenseCategories: schema.ChamberExpenseCategory[] = [];
  public chamberAdvances: schema.ChamberAdvance[] = [];
  public chamberExpenses: schema.ChamberExpense[] = [];
  public chamberAdvanceSettlements: schema.ChamberAdvanceSettlement[] = [];
  public physicalFiles: schema.PhysicalFile[] = [];
  public fileMovements: schema.FileMovement[] = [];
  public reminders: schema.Reminder[] = [];
  private initialized = false;

  public async init() {
    if (this.initialized) return;
    this.plans = [...SEED_PLANS];
    this.firms = [...SEED_FIRMS];
    this.users = await getSeedUsers();
    this.clients = [...SEED_CLIENTS];
    for (const c of this.clients) {
      if (c.notes && c.notes.trim()) {
        const noteId = `note-${c.id}`;
        if (!this.clientNotes.some((n) => n.id === noteId)) {
          this.clientNotes.push({
            id: noteId,
            firmId: c.firmId,
            clientId: c.id,
            noteDate: c.createdAt ? c.createdAt.toISOString().slice(0, 10) : new Date().toISOString().slice(0, 10),
            body: c.notes,
            createdBy: c.createdBy,
            updatedBy: c.updatedBy,
            createdAt: c.createdAt || new Date(),
            updatedAt: c.updatedAt || new Date(),
            deletedAt: null,
          });
        }
      }
    }
    this.cases = SEED_CASES.map((c) => ({
      ...c,
      status: (c.status as 'ongoing' | 'pending' | 'closed') || 'ongoing',
      caseDate: (c as any).caseDate || null,
      closedOn: (c as any).closedOn || null,
      caseCategory: ((c as any).caseCategory as 'civil' | 'criminal_gr' | 'criminal_cr' | 'other') || 'civil',
      partyARole: (c as any).partyARole || null,
      partyBRole: (c as any).partyBRole || null,
      policeStation: (c as any).policeStation || null,
      sectionsOfLaw: (c as any).sectionsOfLaw || null,
    }));
    if (this.platformAdmins.length === 0) {
      const adminHash = await bcrypt.hash('PlatformAdmin2026!', 10);
      this.platformAdmins = [
        {
          id: 'admin-platform-001',
          email: 'admin@platform.bd',
          passwordHash: adminHash,
          active: true,
          failedAttempts: 0,
          lockedUntil: null,
          totpSecret: null,
          createdAt: new Date('2024-01-01T00:00:00.000Z'),
          updatedAt: new Date('2024-01-01T00:00:00.000Z'),
        },
      ];
    }
    this.initialized = true;
  }

  public async isHealthy(): Promise<boolean> {
    return true;
  }

  public async getFirm(id: string, includeDeleted = false): Promise<schema.Firm | null> {
    await this.init();
    const firm = this.firms.find((f) => f.id === id && (includeDeleted || !f.deletedAt));
    return firm ? { ...firm } : null;
  }

  public async updateFirm(id: string, updates: Partial<schema.Firm>): Promise<schema.Firm> {
    await this.init();
    const index = this.firms.findIndex((f) => f.id === id);
    if (index === -1) throw new Error(`Firm not found: ${id}`);
    const updated = {
      ...this.firms[index],
      ...updates,
      updatedAt: new Date(),
    };
    this.firms[index] = updated;
    return { ...updated };
  }

  public async insertFirm(firm: schema.Firm | schema.NewFirm): Promise<schema.Firm> {
    await this.init();
    const newFirm: schema.Firm = {
      id: firm.id || `firm-${crypto.randomUUID()}`,
      firmId: firm.firmId || firm.id || `firm-${crypto.randomUUID()}`,
      name: firm.name,
      barCouncilReg: firm.barCouncilReg ?? null,
      officeAddress: firm.officeAddress ?? null,
      courtAffiliations: firm.courtAffiliations ?? null,
      contact: firm.contact ?? null,
      maxUsers: firm.maxUsers ?? 10,
      maxDevices: firm.maxDevices ?? 5,
      billingCycle: firm.billingCycle ?? 'monthly',
      customBasePriceBdt: firm.customBasePriceBdt ?? null,
      customAnnualPriceBdt: firm.customAnnualPriceBdt ?? null,
      customExtraUserPriceBdt: firm.customExtraUserPriceBdt ?? null,
      customExtraDevicePriceBdt: firm.customExtraDevicePriceBdt ?? null,
      priceLockedUntil: firm.priceLockedUntil ? new Date(firm.priceLockedUntil) : null,
      pricingNote: firm.pricingNote ?? null,
      isTrial: firm.isTrial ?? false,
      trialStartedAt: firm.trialStartedAt ? new Date(firm.trialStartedAt) : null,
      trialDays: firm.trialDays ?? null,
      devicePolicy: firm.devicePolicy ?? 'auto-approve',
      allowOwnerDeviceRemoval: firm.allowOwnerDeviceRemoval ?? false,
      visibilityMode: firm.visibilityMode ?? 'team',
      planId: firm.planId ?? null,
      licenseStartsAt: firm.licenseStartsAt ?? new Date(),
      licenseExpiresAt: firm.licenseExpiresAt,
      status: firm.status ?? 'active',
      createdAt: new Date(),
      updatedAt: new Date(),
      deletedAt: null,
      createdBy: firm.createdBy ?? null,
      updatedBy: firm.updatedBy ?? null,
    };
    this.firms.push(newFirm);
    return { ...newFirm };
  }

  public async listFirms(query?: {
    search?: string;
    status?: string;
    page?: number;
    limit?: number;
    includeDeleted?: boolean;
  }): Promise<{ firms: schema.Firm[]; total: number; page: number; limit: number }> {
    await this.init();
    const page = Math.max(1, query?.page || 1);
    const limit = Math.max(1, Math.min(100, query?.limit || 20));

    let list = this.firms.filter((f) => (query?.includeDeleted ? true : !f.deletedAt));

    if (query?.status && query.status !== 'all') {
      list = list.filter((f) => f.status === query.status);
    }

    if (query?.search && query.search.trim()) {
      const q = query.search.trim().toLowerCase();
      list = list.filter(
        (f) =>
          f.name.toLowerCase().includes(q) ||
          f.firmId.toLowerCase().includes(q) ||
          (f.contact && f.contact.toLowerCase().includes(q)) ||
          (f.officeAddress && f.officeAddress.toLowerCase().includes(q)) ||
          (f.barCouncilReg && f.barCouncilReg.toLowerCase().includes(q))
      );
    }

    list.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    const total = list.length;
    const paginated = list.slice((page - 1) * limit, page * limit).map((f) => ({ ...f }));

    return { firms: paginated, total, page, limit };
  }

  public async getPlan(id: string): Promise<schema.Plan | null> {
    await this.init();
    const plan = this.plans.find((p) => p.id === id);
    return plan ? { ...plan } : null;
  }

  public async listPlans(): Promise<schema.Plan[]> {
    await this.init();
    return this.plans.filter((p) => !p.deletedAt).map((p) => ({ ...p }));
  }

  public async insertPlan(plan: schema.Plan): Promise<schema.Plan> {
    await this.init();
    const idx = this.plans.findIndex((p) => p.id === plan.id);
    if (idx !== -1) {
      this.plans[idx] = { ...plan, status: plan.status ?? 'active' };
    } else {
      this.plans.push({ ...plan, status: plan.status ?? 'active' });
    }
    return { ...plan };
  }

  public async updatePlan(id: string, updates: Partial<schema.Plan>): Promise<schema.Plan> {
    await this.init();
    const idx = this.plans.findIndex((p) => p.id === id && !p.deletedAt);
    if (idx === -1) {
      throw new Error(`Plan ${id} not found`);
    }
    const updated = {
      ...this.plans[idx],
      ...updates,
      updatedAt: new Date(),
    };
    this.plans[idx] = updated;
    return { ...updated };
  }

  public async getUserByEmail(email: string): Promise<schema.User | null> {
    await this.init();
    const user = this.users.find(
      (u) => u.email.toLowerCase() === email.toLowerCase() && !u.deletedAt
    );
    return user ? { ...user } : null;
  }

  public async getUserById(id: string): Promise<schema.User | null> {
    await this.init();
    const user = this.users.find((u) => u.id === id && !u.deletedAt);
    return user ? { ...user } : null;
  }

  public async listUsers(firmId: string): Promise<schema.User[]> {
    await this.init();
    return this.users
      .filter((u) => u.firmId === firmId && !u.deletedAt)
      .map((u) => ({ ...u }));
  }

  public async insertUser(user: schema.User | schema.NewUser): Promise<schema.User> {
    await this.init();
    const newUser: schema.User = {
      id: user.id || `user-${crypto.randomUUID()}`,
      firmId: user.firmId,
      name: user.name,
      email: user.email,
      passwordHash: user.passwordHash,
      role: user.role,
      jobType: user.jobType ?? (user.role === 'Owner' ? 'lawyer_senior' : 'other'),
      jobTitleLabel: user.jobTitleLabel ?? null,
      reportsToUserId: user.reportsToUserId ?? null,
      permissions: user.permissions,
      language: user.language ?? 'en',
      active: user.active ?? true,
      mustChangePassword: user.mustChangePassword ?? false,
      failedLoginAttempts: 0,
      lockedUntil: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      deletedAt: null,
      createdBy: user.createdBy ?? null,
      updatedBy: user.updatedBy ?? null,
    };
    this.users.push(newUser);
    return { ...newUser };
  }

  public async updateUser(id: string, updates: Partial<schema.User>): Promise<schema.User> {
    await this.init();
    const index = this.users.findIndex((u) => u.id === id);
    if (index === -1) throw new Error(`User not found: ${id}`);
    const updated = {
      ...this.users[index],
      ...updates,
      updatedAt: new Date(),
    };
    this.users[index] = updated;
    return { ...updated };
  }

  public async incrementFailedLogin(
    id: string,
    lockedUntil: Date | null
  ): Promise<{ failedLoginAttempts: number; lockedUntil: Date | null }> {
    await this.init();
    const index = this.users.findIndex((u) => u.id === id);
    if (index === -1) throw new Error(`User not found: ${id}`);
    const u = this.users[index];
    const nextAttempts = (u.failedLoginAttempts || 0) + 1;
    u.failedLoginAttempts = nextAttempts;
    u.lockedUntil = lockedUntil;
    u.updatedAt = new Date();
    return { failedLoginAttempts: nextAttempts, lockedUntil };
  }

  public async resetFailedLogin(id: string): Promise<void> {
    await this.init();
    const index = this.users.findIndex((u) => u.id === id);
    if (index !== -1) {
      this.users[index].failedLoginAttempts = 0;
      this.users[index].lockedUntil = null;
      this.users[index].updatedAt = new Date();
    }
  }

  public async insertAudit(entry: schema.AuditLogEntry): Promise<schema.AuditLogEntry> {
    await this.init();
    this.auditLogs.unshift({ ...entry });
    return { ...entry };
  }

  private getVisibleCaseSetForMemory(
    firmId: string,
    user?: VisibilityUserContext,
    includeRestricted = true,
    includeDeleted = false
  ): Set<string> {
    const firm = this.firms.find((f) => f.id === firmId) || { id: firmId, visibilityMode: 'open' };
    const firmUsers = this.users.filter((u) => u.firmId === firmId && !u.deletedAt);
    const firmShares = this.caseShares.filter((s) => s.firmId === firmId && !s.deletedAt);
    return new Set(
      this.cases
        .filter((c) => {
          if (c.firmId !== firmId) return false;
          if (!includeDeleted && c.deletedAt) return false;
          if (!includeRestricted && c.restricted) return false;
          if (user) {
            return canUserSeeCase(user, c, firm, firmUsers, firmShares, includeDeleted);
          }
          return true;
        })
        .map((c) => c.id)
    );
  }

  public async listAudit(
    firmId: string,
    limit = 100,
    offset = 0,
    includeRestricted = true,
    user?: VisibilityUserContext,
    filter?: {
      entity?: string;
      action?: string;
      userId?: string;
      startDate?: string;
      endDate?: string;
    }
  ): Promise<schema.AuditLogEntry[]> {
    await this.init();
    let entries = this.auditLogs.filter((a) => a.firmId === firmId);
    const visibleCaseIds = this.getVisibleCaseSetForMemory(firmId, user, includeRestricted, true);
    const allFirmCaseIds = new Set(this.cases.filter((c) => c.firmId === firmId).map((c) => c.id));

    entries = entries.filter((a) => {
      if (a.entity === 'Case') {
        if (allFirmCaseIds.has(a.entityId) && !visibleCaseIds.has(a.entityId)) return false;
      }
      if (!includeRestricted) {
        if (a.oldValue && (a.oldValue as any).restricted === true) return false;
        if (a.newValue && (a.newValue as any).restricted === true) return false;
      }
      const oldCaseId = a.oldValue ? (a.oldValue as any).caseId : undefined;
      if (oldCaseId && allFirmCaseIds.has(String(oldCaseId)) && !visibleCaseIds.has(String(oldCaseId))) {
        return false;
      }
      const newCaseId = a.newValue ? (a.newValue as any).caseId : undefined;
      if (newCaseId && allFirmCaseIds.has(String(newCaseId)) && !visibleCaseIds.has(String(newCaseId))) {
        return false;
      }
      return true;
    });

    if (filter?.entity) {
      entries = entries.filter((a) => a.entity.toLowerCase() === filter.entity!.toLowerCase());
    }
    if (filter?.action) {
      entries = entries.filter((a) => a.action.toLowerCase() === filter.action!.toLowerCase());
    }
    if (filter?.userId) {
      entries = entries.filter((a) => a.userId === filter.userId);
    }
    if (filter?.startDate) {
      const start = new Date(filter.startDate).getTime();
      if (!isNaN(start)) {
        entries = entries.filter((a) => new Date(a.timestamp).getTime() >= start);
      }
    }
    if (filter?.endDate) {
      const end = new Date(filter.endDate).getTime();
      if (!isNaN(end)) {
        entries = entries.filter((a) => new Date(a.timestamp).getTime() <= end);
      }
    }

    return entries.slice(offset, offset + limit).map((a) => ({ ...a }));
  }

  // Clients Methods
  public async listClients(
    firmId: string,
    search?: string,
    user?: VisibilityUserContext
  ): Promise<schema.Client[]> {
    await this.init();
    const firm = this.firms.find((f) => f.id === firmId) || { id: firmId, visibilityMode: 'open' };
    const firmUsers = this.users.filter((u) => u.firmId === firmId && !u.deletedAt);
    const firmShares = this.caseShares.filter((s) => s.firmId === firmId && !s.deletedAt);

    let res = this.clients.filter((c) => {
      if (c.firmId !== firmId || c.deletedAt) return false;
      if (user) {
        return canUserSeeClient(user, c, firm, firmUsers, this.cases, firmShares);
      }
      return true;
    });

    if (search && search.trim()) {
      const q = search.trim().toLowerCase();
      res = res.filter(
        (c) =>
          c.name.toLowerCase().includes(q) ||
          (c.nameBn && c.nameBn.toLowerCase().includes(q)) ||
          c.phone.toLowerCase().includes(q) ||
          c.address.toLowerCase().includes(q)
      );
    }
    return res
      .map((c) => ({
        ...c,
        hasPhoto: this.clientPhotos.some((p) => p.clientId === c.id),
      }))
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }

  public async getClientById(
    id: string,
    firmId: string,
    user?: VisibilityUserContext,
    includeDeleted = false
  ): Promise<schema.Client | null> {
    await this.init();
    const c = this.clients.find((x) => x.id === id && x.firmId === firmId && (includeDeleted || !x.deletedAt));
    if (!c) return null;
    if (user) {
      const firm = this.firms.find((f) => f.id === firmId) || { id: firmId, visibilityMode: 'open' };
      const firmUsers = this.users.filter((u) => u.firmId === firmId && !u.deletedAt);
      const firmShares = this.caseShares.filter((s) => s.firmId === firmId && !s.deletedAt);
      if (!canUserSeeClient(user, c, firm, firmUsers, this.cases, firmShares)) {
        return null;
      }
    }
    return {
      ...c,
      hasPhoto: this.clientPhotos.some((p) => p.clientId === c.id),
    };
  }

  public async insertClient(client: schema.Client): Promise<schema.Client> {
    await this.init();
    this.clients.unshift({ ...client });
    return { ...client };
  }

  public async updateClient(id: string, firmId: string, updates: Partial<schema.Client>): Promise<schema.Client> {
    await this.init();
    const index = this.clients.findIndex((c) => c.id === id && c.firmId === firmId);
    if (index === -1) throw new Error(`Client not found: ${id}`);
    const updated = {
      ...this.clients[index],
      ...updates,
      updatedAt: new Date(),
    };
    this.clients[index] = updated;
    const hasPhoto = this.clientPhotos.some((p) => p.clientId === id && p.firmId === firmId);
    return { ...updated, hasPhoto };
  }

  public async countActiveCasesForClient(clientId: string, firmId: string): Promise<number> {
    await this.init();
    return this.cases.filter(
      (c) => c.clientId === clientId && c.firmId === firmId && !c.deletedAt && c.status === 'ongoing'
    ).length;
  }

  public async getClientLinkedOverview(
    clientId: string,
    firmId: string,
    includeRestricted = true,
    user?: VisibilityUserContext
  ): Promise<ClientLinkedOverview> {
    await this.init();
    const visibleIds = this.getVisibleCaseSetForMemory(firmId, user, includeRestricted);
    const clientCases = this.cases.filter(
      (c) => c.clientId === clientId && visibleIds.has(c.id)
    );

    const clientTasks = this.tasks.filter(
      (t) => t.clientId === clientId && t.firmId === firmId && !t.deletedAt && (!t.caseId || visibleIds.has(t.caseId))
    );

    const clientFiles = this.physicalFiles.filter(
      (f) => f.clientId === clientId && f.firmId === firmId && !f.deletedAt && (!f.caseId || visibleIds.has(f.caseId))
    );

    return {
      cases: clientCases.map((c) => ({
        id: c.id,
        caseNumber: c.caseNumber,
        court: c.court,
        matterType: c.matterType,
        status: c.status === 'ongoing' ? 'Ongoing' : c.status === 'pending' ? 'Pending' : 'Closed',
      })),
      tasks: clientTasks.map((t) => ({
        id: t.id,
        title: t.title,
        priority: t.priority,
        status: t.status,
        dueAt: new Date(t.dueAt).toISOString(),
      })),
      files: clientFiles.map((f) => {
        const holder = f.currentHolderId ? this.users.find((u) => u.id === f.currentHolderId) : null;
        return {
          id: f.id,
          serial: f.serial,
          title: f.title,
          status: f.status,
          holderName: holder ? holder.name : 'Chamber Archive',
        };
      }),
    };
  }

  // Client Photos Methods
  public async getClientPhoto(clientId: string, firmId: string): Promise<schema.ClientPhoto | null> {
    await this.init();
    const photo = this.clientPhotos.find((p) => p.clientId === clientId && p.firmId === firmId);
    return photo ? { ...photo } : null;
  }

  public async upsertClientPhoto(photo: schema.ClientPhoto): Promise<schema.ClientPhoto> {
    await this.init();
    const index = this.clientPhotos.findIndex(
      (p) => p.clientId === photo.clientId && p.firmId === photo.firmId
    );
    const saved: schema.ClientPhoto = {
      ...photo,
      updatedAt: new Date(),
    };
    if (index >= 0) {
      this.clientPhotos[index] = saved;
    } else {
      this.clientPhotos.push(saved);
    }
    return { ...saved };
  }

  public async deleteClientPhoto(clientId: string, firmId: string): Promise<void> {
    await this.init();
    const index = this.clientPhotos.findIndex(
      (p) => p.clientId === clientId && p.firmId === firmId
    );
    if (index >= 0) {
      this.clientPhotos.splice(index, 1);
    }
  }

  // Client Notes Methods
  public async listClientNotes(
    clientId: string,
    firmId: string,
    limit = 50,
    offset = 0
  ): Promise<{ notes: schema.ClientNote[]; total: number }> {
    await this.init();
    const all = this.clientNotes.filter(
      (n) => n.clientId === clientId && n.firmId === firmId && !n.deletedAt
    );
    all.sort((a, b) => {
      if (b.noteDate !== a.noteDate) {
        return b.noteDate.localeCompare(a.noteDate);
      }
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    });
    return {
      notes: all.slice(offset, offset + limit).map((n) => ({ ...n })),
      total: all.length,
    };
  }

  public async getClientNoteById(
    noteId: string,
    clientId: string,
    firmId: string
  ): Promise<schema.ClientNote | null> {
    await this.init();
    const note = this.clientNotes.find(
      (n) => n.id === noteId && n.clientId === clientId && n.firmId === firmId && !n.deletedAt
    );
    return note ? { ...note } : null;
  }

  public async insertClientNote(note: schema.ClientNote): Promise<schema.ClientNote> {
    await this.init();
    this.clientNotes.unshift({ ...note });
    return { ...note };
  }

  public async updateClientNote(
    noteId: string,
    clientId: string,
    firmId: string,
    updates: Partial<schema.ClientNote>
  ): Promise<schema.ClientNote> {
    await this.init();
    const index = this.clientNotes.findIndex(
      (n) => n.id === noteId && n.clientId === clientId && n.firmId === firmId && !n.deletedAt
    );
    if (index === -1) throw new Error(`Client note not found: ${noteId}`);
    const updated = {
      ...this.clientNotes[index],
      ...updates,
      updatedAt: new Date(),
    };
    this.clientNotes[index] = updated;
    return { ...updated };
  }

  public async deleteClientNote(
    noteId: string,
    clientId: string,
    firmId: string,
    updatedBy?: string
  ): Promise<void> {
    await this.init();
    const index = this.clientNotes.findIndex(
      (n) => n.id === noteId && n.clientId === clientId && n.firmId === firmId && !n.deletedAt
    );
    if (index !== -1) {
      this.clientNotes[index].deletedAt = new Date();
      this.clientNotes[index].updatedAt = new Date();
      if (updatedBy) this.clientNotes[index].updatedBy = updatedBy;
    }
  }

  // Case Notes Methods
  public async listCaseNotes(
    caseId: string,
    firmId: string,
    limit = 50,
    offset = 0
  ): Promise<{ notes: schema.CaseNote[]; total: number }> {
    await this.init();
    const all = this.caseNotes.filter(
      (n) => n.caseId === caseId && n.firmId === firmId && !n.deletedAt
    );
    all.sort((a, b) => {
      if (b.noteDate !== a.noteDate) {
        return b.noteDate.localeCompare(a.noteDate);
      }
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    });
    return {
      notes: all.slice(offset, offset + limit).map((n) => ({ ...n })),
      total: all.length,
    };
  }

  public async getCaseNoteById(
    noteId: string,
    caseId: string,
    firmId: string
  ): Promise<schema.CaseNote | null> {
    await this.init();
    const note = this.caseNotes.find(
      (n) => n.id === noteId && n.caseId === caseId && n.firmId === firmId && !n.deletedAt
    );
    return note ? { ...note } : null;
  }

  public async insertCaseNote(note: schema.CaseNote): Promise<schema.CaseNote> {
    await this.init();
    this.caseNotes.unshift({ ...note });
    return { ...note };
  }

  public async updateCaseNote(
    noteId: string,
    caseId: string,
    firmId: string,
    updates: Partial<schema.CaseNote>
  ): Promise<schema.CaseNote> {
    await this.init();
    const index = this.caseNotes.findIndex(
      (n) => n.id === noteId && n.caseId === caseId && n.firmId === firmId && !n.deletedAt
    );
    if (index === -1) throw new Error(`Case note not found: ${noteId}`);
    const updated = {
      ...this.caseNotes[index],
      ...updates,
      updatedAt: new Date(),
    };
    this.caseNotes[index] = updated;
    return { ...updated };
  }

  public async deleteCaseNote(
    noteId: string,
    caseId: string,
    firmId: string,
    updatedBy?: string
  ): Promise<void> {
    await this.init();
    const index = this.caseNotes.findIndex(
      (n) => n.id === noteId && n.caseId === caseId && n.firmId === firmId && !n.deletedAt
    );
    if (index !== -1) {
      this.caseNotes[index].deletedAt = new Date();
      this.caseNotes[index].updatedAt = new Date();
      if (updatedBy) this.caseNotes[index].updatedBy = updatedBy;
    }
  }

  // Cases Methods
  public async listCases(
    firmId: string,
    filter?: {
      search?: string;
      status?: 'ongoing' | 'pending' | 'closed' | 'all';
      court?: string;
      matterType?: string;
      clientId?: string;
      includeRestricted?: boolean;
      user?: VisibilityUserContext;
      scope?: 'my' | 'team' | 'all';
      sortBy?: 'caseDate' | 'createdAt' | 'caseNumber';
      sortOrder?: 'asc' | 'desc';
    }
  ): Promise<Array<schema.Case & { latestNote?: { noteDate: string; body: string } | null }>> {
    await this.init();
    const visibleIds = this.getVisibleCaseSetForMemory(
      firmId,
      filter?.user,
      filter?.includeRestricted ?? true
    );
    let res = this.cases.filter((c) => visibleIds.has(c.id));

    if (filter?.user && filter?.scope) {
      const uid = filter.user.id;
      if (filter.scope === 'my') {
        res = res.filter((c) => c.responsibleLawyerId === uid || c.createdBy === uid);
      } else if (filter.scope === 'team') {
        const firmUsers = this.users.filter((u) => u.firmId === firmId && !u.deletedAt);
        const me = firmUsers.find((u) => u.id === uid);
        const teamIds = new Set<string>([uid]);
        if (me?.reportsToUserId) teamIds.add(me.reportsToUserId);
        for (const u of firmUsers) {
          if (u.reportsToUserId === uid) teamIds.add(u.id);
        }
        res = res.filter((c) => c.responsibleLawyerId && teamIds.has(c.responsibleLawyerId));
      }
    }

    if (filter?.clientId) {
      res = res.filter((c) => c.clientId === filter.clientId);
    }

    if (filter?.status && filter.status !== 'all') {
      res = res.filter((c) => c.status === filter.status);
    }

    if (filter?.court && filter.court !== 'ALL') {
      res = res.filter((c) => c.court.toLowerCase().includes(filter.court!.toLowerCase()));
    }

    if (filter?.matterType && filter.matterType !== 'ALL') {
      res = res.filter((c) => c.matterType.toLowerCase().includes(filter.matterType!.toLowerCase()));
    }

    if (filter?.search && filter.search.trim()) {
      const q = filter.search.trim().toLowerCase();
      res = res.filter(
        (c) =>
          c.caseNumber.toLowerCase().includes(q) ||
          (c.plaintiff && c.plaintiff.toLowerCase().includes(q)) ||
          (c.defendant && c.defendant.toLowerCase().includes(q)) ||
          (c.court && c.court.toLowerCase().includes(q)) ||
          (c.matterType && c.matterType.toLowerCase().includes(q)) ||
          (c.fileSerial && c.fileSerial.toLowerCase().includes(q)) ||
          (c.plaintiffLawyer && c.plaintiffLawyer.toLowerCase().includes(q)) ||
          (c.defendantLawyer && c.defendantLawyer.toLowerCase().includes(q))
      );
    }

    // Sort by caseDate or createdAt
    const sortBy = filter?.sortBy || 'createdAt';
    const sortOrder = filter?.sortOrder || 'desc';
    res.sort((a, b) => {
      let diff = 0;
      if (sortBy === 'caseDate') {
        const timeA = a.caseDate ? new Date(a.caseDate).getTime() : 0;
        const timeB = b.caseDate ? new Date(b.caseDate).getTime() : 0;
        diff = timeB - timeA;
      } else {
        diff = new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      }
      return sortOrder === 'asc' ? -diff : diff;
    });

    return res.map((c) => {
      const activeNotes = this.caseNotes
        .filter((n) => n.caseId === c.id && n.firmId === c.firmId && !n.deletedAt)
        .sort((a, b) => {
          if (b.noteDate !== a.noteDate) return b.noteDate.localeCompare(a.noteDate);
          return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
        });
      const latestNote = activeNotes.length > 0 ? { noteDate: activeNotes[0].noteDate, body: activeNotes[0].body } : null;
      return { ...c, latestNote };
    });
  }

  public async getCaseById(
    id: string,
    firmId: string,
    user?: VisibilityUserContext
  ): Promise<schema.Case | null> {
    await this.init();
    const c = this.cases.find((x) => x.id === id && x.firmId === firmId && !x.deletedAt);
    if (!c) return null;
    if (user) {
      const firm = this.firms.find((f) => f.id === firmId) || { id: firmId, visibilityMode: 'open' };
      const firmUsers = this.users.filter((u) => u.firmId === firmId && !u.deletedAt);
      const firmShares = this.caseShares.filter((s) => s.firmId === firmId && !s.deletedAt);
      if (!canUserSeeCase(user, c, firm, firmUsers, firmShares)) {
        return null;
      }
    }
    return { ...c };
  }

  public async insertCase(c: schema.Case): Promise<schema.Case> {
    await this.init();
    this.cases.unshift({ ...c });
    return { ...c };
  }

  public async updateCase(id: string, firmId: string, updates: Partial<schema.Case>): Promise<schema.Case> {
    await this.init();
    const index = this.cases.findIndex((c) => c.id === id && c.firmId === firmId);
    if (index === -1) throw new Error(`Case not found: ${id}`);
    const updated = {
      ...this.cases[index],
      ...updates,
      updatedAt: new Date(),
    };
    this.cases[index] = updated;
    return { ...updated };
  }

  public async checkDuplicateCase(
    firmId: string,
    caseNumber: string,
    court: string,
    excludeId?: string,
    includeRestricted = true,
    user?: VisibilityUserContext
  ): Promise<boolean> {
    await this.init();
    const cleanNum = caseNumber.trim().toLowerCase();
    const cleanCourt = court.trim().toLowerCase();
    const visibleIds = this.getVisibleCaseSetForMemory(firmId, user, includeRestricted);

    return this.cases.some(
      (c) =>
        visibleIds.has(c.id) &&
        c.id !== excludeId &&
        c.caseNumber.trim().toLowerCase() === cleanNum &&
        c.court.trim().toLowerCase() === cleanCourt
    );
  }

  public async getCaseLinkedCounts(caseId: string, firmId: string): Promise<CaseLinkedCounts> {
    await this.init();
    const hearingsCount = this.hearings.filter(
      (h) => h.caseId === caseId && h.firmId === firmId && !h.deletedAt
    ).length;
    const tasksCount = this.tasks.filter(
      (t) => t.caseId === caseId && t.firmId === firmId && !t.deletedAt && t.status !== 'cancelled'
    ).length;
    const filesCount = this.physicalFiles.filter(
      (f) => f.caseId === caseId && f.firmId === firmId && !f.deletedAt
    ).length;
    const hearingIds = new Set(
      this.hearings.filter((h) => h.caseId === caseId && h.firmId === firmId && !h.deletedAt).map((h) => h.id)
    );
    const taskIds = new Set(
      this.tasks.filter((t) => t.caseId === caseId && t.firmId === firmId && !t.deletedAt).map((t) => t.id)
    );
    const fileIds = new Set(
      this.physicalFiles.filter((f) => f.caseId === caseId && f.firmId === firmId && !f.deletedAt).map((f) => f.id)
    );
    const apptIds = new Set(
      this.appointments.filter((a) => a.caseId === caseId && a.firmId === firmId && !a.deletedAt).map((a) => a.id)
    );
    const remindersCount = this.reminders.filter(
      (r) =>
        r.firmId === firmId &&
        !r.deletedAt &&
        r.status === 'pending' &&
        (r.sourceId === caseId ||
          (r.sourceType === 'hearing' && hearingIds.has(r.sourceId)) ||
          (r.sourceType === 'task' && taskIds.has(r.sourceId)) ||
          (r.sourceType === 'file_return' && fileIds.has(r.sourceId)) ||
          (r.sourceType === 'appointment' && apptIds.has(r.sourceId)))
    ).length;
    return {
      hearingsCount,
      tasksCount,
      filesCount,
      remindersCount,
    };
  }

  public async listCaseShares(caseId: string, firmId: string): Promise<schema.CaseShare[]> {
    await this.init();
    return this.caseShares
      .filter((s) => s.caseId === caseId && s.firmId === firmId && !s.deletedAt)
      .map((s) => ({ ...s }));
  }

  public async listFirmCaseShares(firmId: string): Promise<schema.CaseShare[]> {
    await this.init();
    return this.caseShares
      .filter((s) => s.firmId === firmId && !s.deletedAt)
      .map((s) => ({ ...s }));
  }

  public async insertCaseShare(share: schema.NewCaseShare): Promise<schema.CaseShare> {
    await this.init();
    const existingIdx = this.caseShares.findIndex(
      (s) => s.caseId === share.caseId && s.userId === share.userId && s.firmId === share.firmId && !s.deletedAt
    );
    if (existingIdx !== -1) {
      return { ...this.caseShares[existingIdx] };
    }
    const created: schema.CaseShare = {
      id: share.id || `share-${crypto.randomUUID()}`,
      firmId: share.firmId,
      caseId: share.caseId,
      userId: share.userId,
      createdBy: share.createdBy,
      createdAt: share.createdAt || new Date(),
      deletedAt: null,
    };
    this.caseShares.push(created);
    return { ...created };
  }

  public async deleteCaseShare(id: string, firmId: string): Promise<void> {
    await this.init();
    const idx = this.caseShares.findIndex((s) => s.id === id && s.firmId === firmId && !s.deletedAt);
    if (idx !== -1) {
      this.caseShares[idx].deletedAt = new Date();
    }
  }

  public async listHearings(
    firmId: string,
    filter?: {
      caseId?: string;
      status?: string;
      fromDate?: string;
      toDate?: string;
      fixedFor?: string;
    },
    user?: VisibilityUserContext
  ): Promise<schema.Hearing[]> {
    await this.init();
    const visibleCaseIds = this.getVisibleCaseSetForMemory(firmId, user, true);
    return this.hearings
      .filter((h) => {
        if (h.firmId !== firmId || h.deletedAt || !visibleCaseIds.has(h.caseId)) return false;
        if (filter?.caseId && h.caseId !== filter.caseId) return false;
        if (filter?.status && h.status !== filter.status) return false;
        if (filter?.fixedFor && h.fixedFor !== filter.fixedFor) return false;
        if (filter?.fromDate && new Date(h.scheduledAt) < new Date(filter.fromDate)) return false;
        if (filter?.toDate && new Date(h.scheduledAt) > new Date(filter.toDate)) return false;
        return true;
      })
      .sort((a, b) => new Date(a.scheduledAt).getTime() - new Date(b.scheduledAt).getTime())
      .map((h) => ({ ...h }));
  }

  public async getHearingById(id: string, firmId: string, user?: VisibilityUserContext): Promise<schema.Hearing | null> {
    await this.init();
    const hearing = this.hearings.find((h) => h.id === id && h.firmId === firmId && !h.deletedAt);
    if (!hearing) return null;
    if (user) {
      const visibleCaseIds = this.getVisibleCaseSetForMemory(firmId, user, true);
      if (!visibleCaseIds.has(hearing.caseId)) return null;
    }
    return { ...hearing };
  }

  public async insertHearing(hearing: schema.NewHearing): Promise<schema.Hearing> {
    await this.init();
    const created: schema.Hearing = {
      id: hearing.id || `hearing-${crypto.randomUUID()}`,
      firmId: hearing.firmId,
      caseId: hearing.caseId,
      appearingLawyerId: hearing.appearingLawyerId ?? null,
      scheduledAt: hearing.scheduledAt,
      court: hearing.court ?? null,
      purpose: hearing.purpose ?? null,
      status: hearing.status ?? 'scheduled',
      outcomeNote: hearing.outcomeNote ?? null,
      fixedFor: hearing.fixedFor ?? null,
      fixedForNote: hearing.fixedForNote ?? null,
      createdAt: hearing.createdAt || new Date(),
      updatedAt: hearing.updatedAt || new Date(),
      deletedAt: null,
      createdBy: hearing.createdBy ?? null,
      updatedBy: hearing.updatedBy ?? null,
    };
    this.hearings.push(created);
    return { ...created };
  }

  public async updateHearing(id: string, firmId: string, updates: Partial<schema.Hearing>): Promise<schema.Hearing> {
    await this.init();
    const idx = this.hearings.findIndex((h) => h.id === id && h.firmId === firmId && !h.deletedAt);
    if (idx === -1) throw new Error(`Hearing not found: ${id}`);
    const updated = {
      ...this.hearings[idx],
      ...updates,
      updatedAt: new Date(),
    };
    this.hearings[idx] = updated;
    return { ...updated };
  }

  public async deleteHearing(id: string, firmId: string, updatedBy?: string): Promise<{ success: boolean; softDeleted: true }> {
    await this.init();
    const idx = this.hearings.findIndex((h) => h.id === id && h.firmId === firmId && !h.deletedAt);
    if (idx === -1) throw new Error(`Hearing not found: ${id}`);
    this.hearings[idx].deletedAt = new Date();
    this.hearings[idx].updatedAt = new Date();
    if (updatedBy) this.hearings[idx].updatedBy = updatedBy;
    return { success: true, softDeleted: true };
  }

  public async insertHearingDateHistory(history: schema.NewHearingDateHistory): Promise<schema.HearingDateHistory> {
    await this.init();
    const created: schema.HearingDateHistory = {
      id: history.id || `hdh-${crypto.randomUUID()}`,
      firmId: history.firmId,
      hearingId: history.hearingId,
      caseId: history.caseId,
      oldAt: history.oldAt,
      newAt: history.newAt,
      reason: history.reason,
      oldFixedFor: history.oldFixedFor ?? null,
      newFixedFor: history.newFixedFor ?? null,
      changedBy: history.changedBy,
      changedAt: history.changedAt || new Date(),
    };
    this.hearingDateHistory.push(created);
    return { ...created };
  }

  public async listHearingDateHistory(hearingId: string, firmId: string): Promise<schema.HearingDateHistory[]> {
    await this.init();
    return this.hearingDateHistory
      .filter((h) => h.hearingId === hearingId && h.firmId === firmId)
      .sort((a, b) => new Date(b.changedAt).getTime() - new Date(a.changedAt).getTime())
      .map((h) => ({ ...h }));
  }

  // Tasks Methods
  public async listTasks(
    firmId: string,
    filter?: {
      caseId?: string;
      clientId?: string;
      assignedTo?: string;
      status?: string;
      priority?: string;
      search?: string;
      limit?: number;
      offset?: number;
    },
    user?: VisibilityUserContext
  ): Promise<{ tasks: Array<schema.Task & { assignedToName?: string }>; total: number }> {
    await this.init();
    const visibleCaseIds = this.getVisibleCaseSetForMemory(firmId, user, true);

    let list = this.tasks.filter((t) => {
      if (t.firmId !== firmId || t.deletedAt) return false;
      if (t.caseId && !visibleCaseIds.has(t.caseId)) return false;
      return true;
    });

    // Staff Partitioning Invariant:
    // If user is Staff and does not have tasks.assign, can only see their own assigned tasks
    if (user && user.role === 'Staff' && !(user.permissions && user.permissions.includes('tasks.assign'))) {
      list = list.filter((t) => t.assignedTo === user.id);
    } else if (filter?.assignedTo) {
      list = list.filter((t) => t.assignedTo === filter.assignedTo);
    }

    if (filter?.caseId) {
      list = list.filter((t) => t.caseId === filter.caseId);
    }
    if (filter?.clientId) {
      list = list.filter((t) => t.clientId === filter.clientId);
    }
    if (filter?.priority) {
      list = list.filter((t) => t.priority === filter.priority);
    }
    if (filter?.status) {
      if (filter.status === 'active') {
        list = list.filter((t) => t.status === 'pending' || t.status === 'in_progress');
      } else {
        list = list.filter((t) => t.status === filter.status);
      }
    }
    if (filter?.search) {
      const q = filter.search.toLowerCase();
      list = list.filter((t) => {
        const assignee = this.users.find((u) => u.id === t.assignedTo);
        const name = assignee ? assignee.name.toLowerCase() : '';
        return (
          t.title.toLowerCase().includes(q) ||
          (t.description && t.description.toLowerCase().includes(q)) ||
          name.includes(q)
        );
      });
    }

    // Sort by dueAt ascending (soonest due first)
    list.sort((a, b) => new Date(a.dueAt).getTime() - new Date(b.dueAt).getTime());

    const total = list.length;
    const limit = filter?.limit || 50;
    const offset = filter?.offset || 0;
    const paged = list.slice(offset, offset + limit);

    const tasksWithName = paged.map((t) => {
      const assignee = this.users.find((u) => u.id === t.assignedTo);
      return {
        ...t,
        assignedToName: assignee ? assignee.name : 'Unknown User',
      };
    });

    return { tasks: tasksWithName, total };
  }

  public async getTaskById(
    id: string,
    firmId: string,
    user?: VisibilityUserContext
  ): Promise<(schema.Task & { assignedToName?: string }) | null> {
    await this.init();
    const task = this.tasks.find((t) => t.id === id && t.firmId === firmId && !t.deletedAt);
    if (!task) return null;

    if (user) {
      // Staff partitioning
      if (user.role === 'Staff' && !(user.permissions && user.permissions.includes('tasks.assign'))) {
        if (task.assignedTo !== user.id) return null;
      }
      // Case visibility
      if (task.caseId) {
        const visibleCaseIds = this.getVisibleCaseSetForMemory(firmId, user, true);
        if (!visibleCaseIds.has(task.caseId)) return null;
      }
    }

    const assignee = this.users.find((u) => u.id === task.assignedTo);
    return {
      ...task,
      assignedToName: assignee ? assignee.name : 'Unknown User',
    };
  }

  public async insertTask(task: schema.NewTask): Promise<schema.Task & { assignedToName?: string }> {
    await this.init();
    const created: schema.Task = {
      id: task.id || `task-${crypto.randomUUID()}`,
      firmId: task.firmId,
      caseId: task.caseId ?? null,
      clientId: task.clientId ?? null,
      assignedTo: task.assignedTo,
      title: task.title,
      description: task.description ?? null,
      priority: task.priority ?? 'normal',
      dueAt: task.dueAt,
      status: task.status ?? 'pending',
      completedAt: task.completedAt ?? null,
      createdAt: task.createdAt || new Date(),
      updatedAt: task.updatedAt || new Date(),
      deletedAt: null,
      createdBy: task.createdBy ?? null,
      updatedBy: task.updatedBy ?? null,
    };
    this.tasks.push(created);
    const assignee = this.users.find((u) => u.id === created.assignedTo);
    return {
      ...created,
      assignedToName: assignee ? assignee.name : 'Unknown User',
    };
  }

  public async updateTask(
    id: string,
    firmId: string,
    updates: Partial<schema.Task>
  ): Promise<schema.Task & { assignedToName?: string }> {
    await this.init();
    const idx = this.tasks.findIndex((t) => t.id === id && t.firmId === firmId && !t.deletedAt);
    if (idx === -1) throw new Error(`Task not found: ${id}`);

    const existing = this.tasks[idx];
    const updated: schema.Task = {
      ...existing,
      ...updates,
      updatedAt: new Date(),
    };
    this.tasks[idx] = updated;
    const assignee = this.users.find((u) => u.id === updated.assignedTo);
    return {
      ...updated,
      assignedToName: assignee ? assignee.name : 'Unknown User',
    };
  }

  public async deleteTask(
    id: string,
    firmId: string,
    updatedBy?: string
  ): Promise<{ success: boolean; softDeleted: true }> {
    await this.init();
    const idx = this.tasks.findIndex((t) => t.id === id && t.firmId === firmId && !t.deletedAt);
    if (idx === -1) throw new Error(`Task not found: ${id}`);
    this.tasks[idx].deletedAt = new Date();
    this.tasks[idx].updatedAt = new Date();
    if (updatedBy) this.tasks[idx].updatedBy = updatedBy;
    return { success: true, softDeleted: true };
  }

  // Physical Files & Custody Methods (Phase 8)
  private enrichPhysicalFileForMemory(f: schema.PhysicalFile): schema.PhysicalFile & { currentHolderName?: string | null } {
    const holder = f.currentHolderId ? this.users.find((u) => u.id === f.currentHolderId) : null;
    return {
      ...f,
      currentHolderName: holder ? holder.name : null,
    };
  }

  public async getNextPhysicalFileSerial(firmId: string): Promise<string> {
    await this.init();
    const firmFiles = this.physicalFiles.filter((f) => f.firmId === firmId);
    let maxNumber = 100;
    for (const f of firmFiles) {
      const match = f.serial.match(/^F-(\d+)$/i) || f.serial.match(/(\d+)/);
      if (match) {
        const num = parseInt(match[1], 10);
        if (!Number.isNaN(num) && num > maxNumber) {
          maxNumber = num;
        }
      }
    }
    return `F-${String(maxNumber + 1).padStart(6, '0')}`;
  }

  public async listPhysicalFiles(
    firmId: string,
    filter?: {
      caseId?: string;
      clientId?: string;
      status?: string;
      holderId?: string;
      search?: string;
    },
    user?: VisibilityUserContext
  ): Promise<Array<schema.PhysicalFile & { currentHolderName?: string | null }>> {
    await this.init();
    const includeRestricted = user
      ? user.role === 'Owner' || Boolean(user.permissions?.includes('restricted.view'))
      : true;
    const visibleIds = user ? this.getVisibleCaseSetForMemory(firmId, user, includeRestricted) : null;

    let result = this.physicalFiles.filter((f) => {
      if (f.firmId !== firmId || f.deletedAt) return false;
      if (visibleIds && f.caseId && !visibleIds.has(f.caseId)) return false;
      return true;
    });

    if (filter?.caseId) {
      result = result.filter((f) => f.caseId === filter.caseId);
    }
    if (filter?.clientId) {
      result = result.filter((f) => f.clientId === filter.clientId);
    }
    if (filter?.status && filter.status !== 'all') {
      result = result.filter((f) => f.status === filter.status);
    }
    if (filter?.holderId) {
      result = result.filter((f) => f.currentHolderId === filter.holderId);
    }

    const enriched = result.map((f) => this.enrichPhysicalFileForMemory(f));
    const finalFiltered = filter?.search
      ? enriched.filter((f) => {
          const q = filter.search!.trim().toLowerCase();
          return (
            f.serial.toLowerCase().includes(q) ||
            f.title.toLowerCase().includes(q) ||
            (f.shelfLocation || '').toLowerCase().includes(q) ||
            (f.notes || '').toLowerCase().includes(q) ||
            (f.currentHolderName || '').toLowerCase().includes(q)
          );
        })
      : enriched;

    return finalFiltered.sort(
      (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
    );
  }

  public async getPhysicalFileById(
    id: string,
    firmId: string
  ): Promise<(schema.PhysicalFile & { currentHolderName?: string | null }) | null> {
    await this.init();
    const row = this.physicalFiles.find((f) => f.id === id && f.firmId === firmId && !f.deletedAt);
    return row ? this.enrichPhysicalFileForMemory(row) : null;
  }

  public async getPhysicalFileBySerial(
    serial: string,
    firmId: string
  ): Promise<(schema.PhysicalFile & { currentHolderName?: string | null }) | null> {
    await this.init();
    const clean = serial.trim().toLowerCase();
    const row = this.physicalFiles.find(
      (f) => f.firmId === firmId && !f.deletedAt && f.serial.toLowerCase() === clean
    );
    return row ? this.enrichPhysicalFileForMemory(row) : null;
  }

  public async getPhysicalFileByCaseId(
    caseId: string,
    firmId: string
  ): Promise<(schema.PhysicalFile & { currentHolderName?: string | null }) | null> {
    await this.init();
    const row = this.physicalFiles.find(
      (f) => f.caseId === caseId && f.firmId === firmId && !f.deletedAt
    );
    return row ? this.enrichPhysicalFileForMemory(row) : null;
  }

  public async insertPhysicalFile(
    file: schema.NewPhysicalFile
  ): Promise<schema.PhysicalFile & { currentHolderName?: string | null }> {
    await this.init();
    const duplicate = this.physicalFiles.find(
      (f) => f.firmId === file.firmId && f.serial.toLowerCase() === file.serial.toLowerCase()
    );
    if (duplicate) {
      throw new Error(`DUPLICATE_SERIAL: Serial ${file.serial} already exists in firm`);
    }
    const now = new Date();
    const created: schema.PhysicalFile = {
      id: file.id || `file-${crypto.randomUUID()}`,
      firmId: file.firmId,
      serial: file.serial,
      caseId: file.caseId ?? null,
      clientId: file.clientId ?? null,
      title: file.title,
      shelfLocation: file.shelfLocation ?? 'General File Rack',
      status: file.status ?? 'in_chamber',
      currentHolderId: file.currentHolderId ?? null,
      checkedOutAt: file.checkedOutAt ?? null,
      dueBackAt: file.dueBackAt ?? null,
      notes: file.notes ?? null,
      createdAt: file.createdAt ?? now,
      updatedAt: file.updatedAt ?? now,
      deletedAt: null,
      createdBy: file.createdBy ?? null,
      updatedBy: file.updatedBy ?? null,
    };
    this.physicalFiles.push(created);
    return this.enrichPhysicalFileForMemory(created);
  }

  public async updatePhysicalFile(
    id: string,
    firmId: string,
    updates: Partial<schema.PhysicalFile>
  ): Promise<schema.PhysicalFile & { currentHolderName?: string | null }> {
    await this.init();
    const idx = this.physicalFiles.findIndex((f) => f.id === id && f.firmId === firmId && !f.deletedAt);
    if (idx === -1) throw new Error(`Physical file not found: ${id}`);

    const updated: schema.PhysicalFile = {
      ...this.physicalFiles[idx],
      ...updates,
      updatedAt: new Date(),
    };
    this.physicalFiles[idx] = updated;
    return this.enrichPhysicalFileForMemory(updated);
  }

  public async deletePhysicalFile(
    id: string,
    firmId: string,
    updatedBy?: string
  ): Promise<{ success: boolean; softDeleted: true }> {
    await this.init();
    const idx = this.physicalFiles.findIndex((f) => f.id === id && f.firmId === firmId && !f.deletedAt);
    if (idx === -1) throw new Error(`Physical file not found: ${id}`);
    this.physicalFiles[idx].deletedAt = new Date();
    this.physicalFiles[idx].updatedAt = new Date();
    if (updatedBy) this.physicalFiles[idx].updatedBy = updatedBy;
    return { success: true, softDeleted: true };
  }

  public async listFileMovements(
    fileId: string,
    firmId: string
  ): Promise<Array<schema.FileMovement & { userName: string }>> {
    await this.init();
    return this.fileMovements
      .filter((m) => m.fileId === fileId && m.firmId === firmId)
      .sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime())
      .map((m) => {
        const u = this.users.find((usr) => usr.id === m.userId);
        return {
          ...m,
          userName: u ? u.name : 'Unknown User',
        };
      });
  }

  public async insertFileMovement(
    movement: schema.NewFileMovement
  ): Promise<schema.FileMovement & { userName: string }> {
    await this.init();
    const created: schema.FileMovement = {
      id: movement.id || `mov-${crypto.randomUUID()}`,
      firmId: movement.firmId,
      fileId: movement.fileId,
      action: movement.action,
      userId: movement.userId,
      at: movement.at ?? new Date(),
      dueBackAt: movement.dueBackAt ?? null,
      note: movement.note ?? null,
    };
    this.fileMovements.push(created);
    const u = this.users.find((usr) => usr.id === created.userId);
    return {
      ...created,
      userName: u ? u.name : 'Unknown User',
    };
  }

  // Reminders Methods (Phase 9)
  private enrichReminderForMemory(r: schema.Reminder): schema.Reminder & { userName?: string } {
    const u = this.users.find((usr) => usr.id === r.userId);
    return {
      ...r,
      userName: u ? u.name : undefined,
    };
  }

  public async listReminders(
    firmId: string,
    filter?: {
      status?: 'pending' | 'sent' | 'dismissed' | 'active';
      sourceType?: 'hearing' | 'task' | 'file_return' | 'appointment';
      userId?: string;
      search?: string;
      dueOnly?: boolean;
    },
    user?: VisibilityUserContext
  ): Promise<Array<schema.Reminder & { userName?: string }>> {
    await this.init();
    const visibleCaseIds = this.getVisibleCaseSetForMemory(firmId, user, true);
    const hearingMap = new Map(this.hearings.filter((h) => h.firmId === firmId && !h.deletedAt).map((h) => [h.id, h]));
    const taskMap = new Map(this.tasks.filter((t) => t.firmId === firmId && !t.deletedAt).map((t) => [t.id, t]));
    const fileMap = new Map(this.physicalFiles.filter((f) => f.firmId === firmId && !f.deletedAt).map((f) => [f.id, f]));
    const apptMap = new Map(this.appointments.filter((a) => a.firmId === firmId && !a.deletedAt).map((a) => [a.id, a]));
    const nowMs = Date.now();

    return this.reminders
      .filter((r) => {
        if (r.firmId !== firmId || r.deletedAt) return false;
        if (user?.role === 'Staff') {
          if (r.userId !== user.id) return false;
        } else if (filter?.userId && r.userId !== filter.userId) {
          return false;
        }

        if (user) {
          if (r.sourceType === 'hearing') {
            const h = hearingMap.get(r.sourceId);
            if (h && h.caseId && !visibleCaseIds.has(h.caseId)) return false;
          } else if (r.sourceType === 'task') {
            const t = taskMap.get(r.sourceId);
            if (t && t.caseId && !visibleCaseIds.has(t.caseId)) return false;
          } else if (r.sourceType === 'file_return') {
            const f = fileMap.get(r.sourceId);
            if (f && f.caseId && !visibleCaseIds.has(f.caseId)) return false;
          } else if (r.sourceType === 'appointment') {
            const a = apptMap.get(r.sourceId);
            if (a && a.caseId && !visibleCaseIds.has(a.caseId)) return false;
          }
        }

        if (filter?.status) {
          if (filter.status === 'active') {
            if (r.status === 'dismissed') return false;
          } else if (r.status !== filter.status) {
            return false;
          }
        }
        if (filter?.dueOnly && new Date(r.remindAt).getTime() > nowMs) {
          return false;
        }
        if (filter?.sourceType && r.sourceType !== filter.sourceType) {
          return false;
        }
        if (filter?.search) {
          const q = filter.search.toLowerCase();
          const hit =
            r.title.toLowerCase().includes(q) ||
            (r.description && r.description.toLowerCase().includes(q));
          if (!hit) return false;
        }
        return true;
      })
      .sort((a, b) => new Date(a.remindAt).getTime() - new Date(b.remindAt).getTime())
      .map((r) => this.enrichReminderForMemory({ ...r }));
  }

  public async getReminderById(
    id: string,
    firmId: string
  ): Promise<(schema.Reminder & { userName?: string }) | null> {
    await this.init();
    const found = this.reminders.find((r) => r.id === id && r.firmId === firmId && !r.deletedAt);
    return found ? this.enrichReminderForMemory({ ...found }) : null;
  }

  public async insertReminder(
    reminder: schema.NewReminder
  ): Promise<schema.Reminder & { userName?: string }> {
    await this.init();
    const now = new Date();
    const created: schema.Reminder = {
      id: reminder.id || crypto.randomUUID(),
      firmId: reminder.firmId,
      userId: reminder.userId,
      sourceType: reminder.sourceType,
      sourceId: reminder.sourceId,
      title: reminder.title,
      description: reminder.description ?? null,
      remindAt: reminder.remindAt,
      dueAt: reminder.dueAt,
      channel: reminder.channel ?? 'in_app',
      status: reminder.status ?? 'pending',
      sentAt: reminder.sentAt ?? null,
      dismissedAt: reminder.dismissedAt ?? null,
      createdAt: reminder.createdAt ?? now,
      updatedAt: reminder.updatedAt ?? now,
      deletedAt: reminder.deletedAt ?? null,
      createdBy: reminder.createdBy ?? null,
      updatedBy: reminder.updatedBy ?? null,
    };
    this.reminders.push(created);
    return this.enrichReminderForMemory({ ...created });
  }

  public async updateReminder(
    id: string,
    firmId: string,
    updates: Partial<schema.Reminder>
  ): Promise<schema.Reminder & { userName?: string }> {
    await this.init();
    const idx = this.reminders.findIndex((r) => r.id === id && r.firmId === firmId && !r.deletedAt);
    if (idx === -1) throw new Error(`Reminder not found: ${id}`);
    const updated: schema.Reminder = {
      ...this.reminders[idx],
      ...updates,
      id: this.reminders[idx].id,
      firmId: this.reminders[idx].firmId,
      updatedAt: updates.updatedAt ?? new Date(),
    };
    this.reminders[idx] = updated;
    return this.enrichReminderForMemory({ ...updated });
  }

  public async dismissRemindersBySource(
    firmId: string,
    sourceId: string,
    updatedBy?: string,
    softDelete = false,
    userIdRestrict?: string
  ): Promise<number> {
    await this.init();
    const now = new Date();
    let count = 0;
    for (let i = 0; i < this.reminders.length; i++) {
      const r = this.reminders[i];
      if (
        r.firmId === firmId &&
        r.sourceId === sourceId &&
        !r.deletedAt &&
        r.status !== 'dismissed' &&
        (!userIdRestrict || r.userId === userIdRestrict)
      ) {
        this.reminders[i] = {
          ...r,
          status: 'dismissed',
          dismissedAt: now,
          deletedAt: softDelete ? now : r.deletedAt,
          updatedAt: now,
          updatedBy: updatedBy ?? r.updatedBy,
        };
        count++;
      }
    }
    return count;
  }

  public async rescheduleRemindersBySource(
    firmId: string,
    sourceId: string,
    newDueAt: Date,
    newRemindAt?: Date,
    updatedBy?: string
  ): Promise<number> {
    await this.init();
    const now = new Date();
    const targetRemindAt = newRemindAt ?? new Date(newDueAt.getTime() - 24 * 60 * 60 * 1000);
    let count = 0;
    for (let i = 0; i < this.reminders.length; i++) {
      const r = this.reminders[i];
      if (r.firmId === firmId && r.sourceId === sourceId && !r.deletedAt) {
        this.reminders[i] = {
          ...r,
          dueAt: newDueAt,
          remindAt: targetRemindAt,
          status: 'pending',
          dismissedAt: null,
          updatedAt: now,
          updatedBy: updatedBy ?? r.updatedBy,
        };
        count++;
      }
    }
    return count;
  }

  public async listRemindersBySourceIds(firmId: string, sourceIds: string[]): Promise<schema.Reminder[]> {
    await this.init();
    const set = new Set(sourceIds);
    return this.reminders
      .filter((r) => r.firmId === firmId && !r.deletedAt && set.has(r.sourceId))
      .map((r) => ({ ...r }));
  }

  // Accounts Methods (Accounts Phase 1)
  public async getAccountsSummary(
    firmId: string,
    filter: { clientId?: string; caseId?: string },
    user?: VisibilityUserContext
  ): Promise<{
    totalAgreedPaisa: number;
    totalPaidPaisa: number;
    balancePaisa: number;
    isCredit: boolean;
    creditPaisa: number;
    outstandingPaisa: number;
    totalExpensesPaisa: number;
    caseSummaries?: Array<{
      caseId: string;
      agreedPaisa: number;
      paidPaisa: number;
      balancePaisa: number;
      isCredit: boolean;
      creditPaisa: number;
      outstandingPaisa: number;
      expensesPaisa: number;
    }>;
  }> {
    await this.init();
    const visibleCaseIds = this.getVisibleCaseSetForMemory(firmId, user, true);

    const agreements = this.feeAgreements.filter((a) => {
      if (a.firmId !== firmId || a.deletedAt || a.status === 'void') return false;
      if (a.caseId && !visibleCaseIds.has(a.caseId)) return false;
      if (filter.clientId && a.clientId !== filter.clientId) return false;
      if (filter.caseId && a.caseId !== filter.caseId) return false;
      return true;
    });
    const totalAgreedPaisa = agreements.reduce((sum, a) => sum + Number(a.agreedAmountPaisa || 0), 0);

    const payments = this.feePayments.filter((p) => {
      if (p.firmId !== firmId || p.deletedAt || p.status !== 'posted') return false;
      if (p.caseId && !visibleCaseIds.has(p.caseId)) return false;
      if (filter.clientId && p.clientId !== filter.clientId) return false;
      if (filter.caseId && p.caseId !== filter.caseId) return false;
      return true;
    });
    const totalPaidPaisa = payments.reduce((sum, p) => sum + Number(p.amountPaisa || 0), 0);

    const expenses = this.expenses.filter((e) => {
      if (e.firmId !== firmId || e.deletedAt || e.status !== 'posted') return false;
      if (e.caseId && !visibleCaseIds.has(e.caseId)) return false;
      if (filter.clientId && e.clientId !== filter.clientId) return false;
      if (filter.caseId && e.caseId !== filter.caseId) return false;
      return true;
    });
    const totalExpensesPaisa = expenses.reduce((sum, e) => sum + Number(e.amountPaisa || 0), 0);

    const balancePaisa = totalAgreedPaisa - totalPaidPaisa;
    const isCredit = balancePaisa < 0;
    const creditPaisa = isCredit ? Math.abs(balancePaisa) : 0;
    const outstandingPaisa = isCredit ? 0 : balancePaisa;

    // Build per-case breakdown
    let caseSummaries: Array<{
      caseId: string;
      agreedPaisa: number;
      paidPaisa: number;
      balancePaisa: number;
      isCredit: boolean;
      creditPaisa: number;
      outstandingPaisa: number;
      expensesPaisa: number;
    }> = [];

    if (filter.clientId) {
      const caseMap = new Map<string, { agreedPaisa: number; paidPaisa: number; expensesPaisa: number }>();
      for (const a of agreements) {
        if (a.caseId) {
          const cur = caseMap.get(a.caseId) || { agreedPaisa: 0, paidPaisa: 0, expensesPaisa: 0 };
          cur.agreedPaisa += Number(a.agreedAmountPaisa || 0);
          caseMap.set(a.caseId, cur);
        }
      }
      for (const p of payments) {
        if (p.caseId) {
          const cur = caseMap.get(p.caseId) || { agreedPaisa: 0, paidPaisa: 0, expensesPaisa: 0 };
          cur.paidPaisa += Number(p.amountPaisa || 0);
          caseMap.set(p.caseId, cur);
        }
      }
      for (const e of expenses) {
        if (e.caseId) {
          const cur = caseMap.get(e.caseId) || { agreedPaisa: 0, paidPaisa: 0, expensesPaisa: 0 };
          cur.expensesPaisa += Number(e.amountPaisa || 0);
          caseMap.set(e.caseId, cur);
        }
      }
      caseSummaries = Array.from(caseMap.entries()).map(([cid, data]) => {
        const bPaisa = data.agreedPaisa - data.paidPaisa;
        const credit = bPaisa < 0;
        return {
          caseId: cid,
          agreedPaisa: data.agreedPaisa,
          paidPaisa: data.paidPaisa,
          balancePaisa: bPaisa,
          isCredit: credit,
          creditPaisa: credit ? Math.abs(bPaisa) : 0,
          outstandingPaisa: credit ? 0 : bPaisa,
          expensesPaisa: data.expensesPaisa,
        };
      });
    }

    return {
      totalAgreedPaisa,
      totalPaidPaisa,
      balancePaisa,
      isCredit,
      creditPaisa,
      outstandingPaisa,
      totalExpensesPaisa,
      caseSummaries,
    };
  }

  public async getClientBalancesOverview(
    firmId: string,
    user?: VisibilityUserContext
  ): Promise<
    Array<{
      clientId: string;
      clientName: string;
      clientNameBn?: string | null;
      clientPhone: string;
      totalAgreedPaisa: number;
      totalPaidPaisa: number;
      balancePaisa: number;
      isCredit: boolean;
      creditPaisa: number;
      outstandingPaisa: number;
    }>
  > {
    await this.init();
    const clients = await this.listClients(firmId, undefined, user);
    const visibleCaseIds = this.getVisibleCaseSetForMemory(firmId, user, true);

    return clients.map((c) => {
      const agreements = this.feeAgreements.filter((a) => {
        if (a.firmId !== firmId || a.deletedAt || a.status === 'void' || a.clientId !== c.id) return false;
        if (a.caseId && !visibleCaseIds.has(a.caseId)) return false;
        return true;
      });
      const totalAgreedPaisa = agreements.reduce((sum, a) => sum + Number(a.agreedAmountPaisa || 0), 0);

      const payments = this.feePayments.filter((p) => {
        if (p.firmId !== firmId || p.deletedAt || p.status !== 'posted' || p.clientId !== c.id) return false;
        if (p.caseId && !visibleCaseIds.has(p.caseId)) return false;
        return true;
      });
      const totalPaidPaisa = payments.reduce((sum, p) => sum + Number(p.amountPaisa || 0), 0);

      const balancePaisa = totalAgreedPaisa - totalPaidPaisa;
      const isCredit = balancePaisa < 0;
      const creditPaisa = isCredit ? Math.abs(balancePaisa) : 0;
      const outstandingPaisa = isCredit ? 0 : balancePaisa;

      return {
        clientId: c.id,
        clientName: c.name,
        clientNameBn: c.nameBn,
        clientPhone: c.phone,
        totalAgreedPaisa,
        totalPaidPaisa,
        balancePaisa,
        isCredit,
        creditPaisa,
        outstandingPaisa,
      };
    });
  }

  public async getCaseBalancesOverview(
    firmId: string,
    user?: VisibilityUserContext
  ): Promise<
    Array<{
      clientId: string;
      clientName: string;
      clientNameBn?: string | null;
      clientPhone: string;
      caseId: string | null;
      caseNumber: string | null;
      caseTitle: string | null;
      fileSerial?: string | null;
      totalAgreedPaisa: number;
      totalPaidPaisa: number;
      balancePaisa: number;
      isCredit: boolean;
      creditPaisa: number;
      outstandingPaisa: number;
    }>
  > {
    await this.init();
    const clients = await this.listClients(firmId, undefined, user);
    const visibleCaseIds = this.getVisibleCaseSetForMemory(firmId, user, true);
    const result: Array<{
      clientId: string;
      clientName: string;
      clientNameBn?: string | null;
      clientPhone: string;
      caseId: string | null;
      caseNumber: string | null;
      caseTitle: string | null;
      fileSerial?: string | null;
      totalAgreedPaisa: number;
      totalPaidPaisa: number;
      balancePaisa: number;
      isCredit: boolean;
      creditPaisa: number;
      outstandingPaisa: number;
    }> = [];

    for (const c of clients) {
      const agreements = this.feeAgreements.filter(
        (a) => a.firmId === firmId && !a.deletedAt && a.status !== 'void' && a.clientId === c.id
      );
      const payments = this.feePayments.filter(
        (p) => p.firmId === firmId && !p.deletedAt && p.status === 'posted' && p.clientId === c.id
      );
      const clientExpenses = this.expenses.filter(
        (e) => e.firmId === firmId && !e.deletedAt && e.status === 'posted' && e.clientId === c.id
      );

      const caseIds = new Set<string | null>();
      for (const a of agreements) caseIds.add(a.caseId ?? null);
      for (const p of payments) caseIds.add(p.caseId ?? null);
      for (const e of clientExpenses) caseIds.add(e.caseId ?? null);

      for (const cid of caseIds) {
        if (cid === null) {
          const generalAgreements = agreements.filter((a) => !a.caseId);
          const generalPayments = payments.filter((p) => !p.caseId);
          const totalAgreedPaisa = generalAgreements.reduce((sum, a) => sum + Number(a.agreedAmountPaisa || 0), 0);
          const totalPaidPaisa = generalPayments.reduce((sum, p) => sum + Number(p.amountPaisa || 0), 0);
          const balancePaisa = totalAgreedPaisa - totalPaidPaisa;
          const isCredit = balancePaisa < 0;
          result.push({
            clientId: c.id,
            clientName: c.name,
            clientNameBn: c.nameBn,
            clientPhone: c.phone,
            caseId: null,
            caseNumber: null,
            caseTitle: 'General / no case',
            fileSerial: null,
            totalAgreedPaisa,
            totalPaidPaisa,
            balancePaisa,
            isCredit,
            creditPaisa: isCredit ? Math.abs(balancePaisa) : 0,
            outstandingPaisa: isCredit ? 0 : balancePaisa,
          });
        } else {
          if (!visibleCaseIds.has(cid)) continue;
          const caseRec = this.cases.find((k) => k.id === cid && !k.deletedAt);
          if (!caseRec) continue;
          const caseAgreements = agreements.filter((a) => a.caseId === cid);
          const casePayments = payments.filter((p) => p.caseId === cid);
          const totalAgreedPaisa = caseAgreements.reduce((sum, a) => sum + Number(a.agreedAmountPaisa || 0), 0);
          const totalPaidPaisa = casePayments.reduce((sum, p) => sum + Number(p.amountPaisa || 0), 0);
          const balancePaisa = totalAgreedPaisa - totalPaidPaisa;
          const isCredit = balancePaisa < 0;
          result.push({
            clientId: c.id,
            clientName: c.name,
            clientNameBn: c.nameBn,
            clientPhone: c.phone,
            caseId: caseRec.id,
            caseNumber: caseRec.caseNumber,
            caseTitle: caseRec.description || caseRec.matterType || null,
            fileSerial: caseRec.fileSerial || null,
            totalAgreedPaisa,
            totalPaidPaisa,
            balancePaisa,
            isCredit,
            creditPaisa: isCredit ? Math.abs(balancePaisa) : 0,
            outstandingPaisa: isCredit ? 0 : balancePaisa,
          });
        }
      }
    }
    return result;
  }

  // Fee Agreements
  public async listFeeAgreements(
    firmId: string,
    filter?: { clientId?: string; caseId?: string; status?: string },
    user?: VisibilityUserContext
  ): Promise<schema.FeeAgreement[]> {
    await this.init();
    const visibleCaseIds = this.getVisibleCaseSetForMemory(firmId, user, true);

    let list = this.feeAgreements.filter((a) => {
      if (a.firmId !== firmId || a.deletedAt) return false;
      if (a.caseId && !visibleCaseIds.has(a.caseId)) return false;
      if (filter?.clientId && a.clientId !== filter.clientId) return false;
      if (filter?.caseId && a.caseId !== filter.caseId) return false;
      if (filter?.status && a.status !== filter.status) return false;
      return true;
    });

    return list
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .map((a) => ({ ...a }));
  }

  public async getFeeAgreementById(
    id: string,
    firmId: string,
    user?: VisibilityUserContext
  ): Promise<schema.FeeAgreement | null> {
    await this.init();
    const agreement = this.feeAgreements.find((a) => a.id === id && a.firmId === firmId && !a.deletedAt);
    if (!agreement) return null;

    if (user && agreement.caseId) {
      const visibleCaseIds = this.getVisibleCaseSetForMemory(firmId, user, true);
      if (!visibleCaseIds.has(agreement.caseId)) return null;
    }
    return { ...agreement };
  }

  public async insertFeeAgreement(agreement: schema.NewFeeAgreement): Promise<schema.FeeAgreement> {
    await this.init();
    const created: schema.FeeAgreement = {
      id: agreement.id || `fa-${crypto.randomUUID()}`,
      firmId: agreement.firmId,
      clientId: agreement.clientId,
      caseId: agreement.caseId ?? null,
      feeType: agreement.feeType ?? 'fixed',
      agreedAmountPaisa: agreement.agreedAmountPaisa,
      agreementDate: agreement.agreementDate,
      notes: agreement.notes ?? null,
      status: agreement.status ?? 'active',
      createdAt: agreement.createdAt || new Date(),
      updatedAt: agreement.updatedAt || new Date(),
      deletedAt: null,
      createdBy: agreement.createdBy ?? null,
      updatedBy: agreement.updatedBy ?? null,
    };
    this.feeAgreements.push(created);
    return { ...created };
  }

  public async updateFeeAgreement(
    id: string,
    firmId: string,
    updates: Partial<schema.FeeAgreement>
  ): Promise<schema.FeeAgreement> {
    await this.init();
    const idx = this.feeAgreements.findIndex((a) => a.id === id && a.firmId === firmId && !a.deletedAt);
    if (idx === -1) throw new Error(`Fee agreement not found: ${id}`);
    const updated = {
      ...this.feeAgreements[idx],
      ...updates,
      updatedAt: new Date(),
    };
    this.feeAgreements[idx] = updated;
    return { ...updated };
  }

  public async insertFeeAgreementChange(change: schema.NewFeeAgreementChange): Promise<schema.FeeAgreementChange> {
    await this.init();
    const created: schema.FeeAgreementChange = {
      id: change.id || `fac-${crypto.randomUUID()}`,
      firmId: change.firmId,
      feeAgreementId: change.feeAgreementId,
      oldAmountPaisa: change.oldAmountPaisa,
      newAmountPaisa: change.newAmountPaisa,
      reason: change.reason,
      changedBy: change.changedBy,
      createdAt: change.createdAt || new Date(),
    };
    this.feeAgreementChanges.push(created);
    return { ...created };
  }

  public async listFeeAgreementChanges(feeAgreementId: string, firmId: string): Promise<schema.FeeAgreementChange[]> {
    await this.init();
    return this.feeAgreementChanges
      .filter((c) => c.firmId === firmId && c.feeAgreementId === feeAgreementId)
      .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())
      .map((c) => ({ ...c }));
  }

  // Number Sequences & Fee Payments
  public async getNextSequenceNumber(
    firmId: string,
    type: string,
    prefix = 'R-'
  ): Promise<{ sequenceNumber: string; currentVal: number }> {
    await this.init();
    let seq = this.numberSequences.find((s) => s.firmId === firmId && s.type === type);
    if (!seq) {
      seq = {
        id: `seq-${crypto.randomUUID()}`,
        firmId,
        type,
        prefix,
        currentVal: 1,
        updatedAt: new Date(),
      };
      this.numberSequences.push(seq);
    } else {
      seq.currentVal += 1;
      seq.updatedAt = new Date();
    }
    const sequenceNumber = `${seq.prefix}${String(seq.currentVal).padStart(6, '0')}`;
    return { sequenceNumber, currentVal: seq.currentVal };
  }

  public async listFeePayments(
    firmId: string,
    filter?: { clientId?: string; caseId?: string; feeAgreementId?: string; status?: string; legacyUnassigned?: boolean },
    user?: VisibilityUserContext
  ): Promise<schema.FeePayment[]> {
    await this.init();
    const visibleCaseIds = this.getVisibleCaseSetForMemory(firmId, user, true);

    let list = this.feePayments.filter((p) => {
      if (p.firmId !== firmId || p.deletedAt) return false;
      if (p.caseId && !visibleCaseIds.has(p.caseId)) return false;
      if (filter?.clientId && p.clientId !== filter.clientId) return false;
      if (filter?.caseId && p.caseId !== filter.caseId) return false;
      if (filter?.feeAgreementId && p.feeAgreementId !== filter.feeAgreementId) return false;
      if (filter?.status && p.status !== filter.status) return false;
      if (filter?.legacyUnassigned !== undefined) {
        const isLegacy = Boolean(p.legacyUnassigned || !p.feeAgreementId || !p.caseId);
        if (filter.legacyUnassigned !== isLegacy) return false;
      }
      return true;
    });

    return list
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .map((p) => ({ ...p }));
  }

  public async getFeePaymentById(
    id: string,
    firmId: string,
    user?: VisibilityUserContext
  ): Promise<schema.FeePayment | null> {
    await this.init();
    const payment = this.feePayments.find((p) => p.id === id && p.firmId === firmId && !p.deletedAt);
    if (!payment) return null;

    if (user && payment.caseId) {
      const visibleCaseIds = this.getVisibleCaseSetForMemory(firmId, user, true);
      if (!visibleCaseIds.has(payment.caseId)) return null;
    }
    return { ...payment };
  }

  public async getFeePaymentByIdempotencyKey(
    firmId: string,
    idempotencyKey: string
  ): Promise<schema.FeePayment | null> {
    await this.init();
    const payment = this.feePayments.find(
      (p) => p.firmId === firmId && p.idempotencyKey === idempotencyKey && !p.deletedAt
    );
    return payment ? { ...payment } : null;
  }

  public async insertFeePayment(payment: schema.NewFeePayment): Promise<schema.FeePayment> {
    await this.init();
    const existingKey = this.feePayments.find(
      (p) => p.firmId === payment.firmId && p.idempotencyKey === payment.idempotencyKey && !p.deletedAt
    );
    if (existingKey) {
      const err: any = new Error('duplicate key value violates unique constraint "idx_fee_payments_firm_idempotency"');
      err.code = '23505';
      throw err;
    }
    const existingReceipt = this.feePayments.find(
      (p) => p.firmId === payment.firmId && p.receiptNumber === payment.receiptNumber && !p.deletedAt
    );
    if (existingReceipt) {
      const err: any = new Error('duplicate key value violates unique constraint "idx_fee_payments_firm_receipt"');
      err.code = '23505';
      throw err;
    }
    const isLegacy = payment.legacyUnassigned ?? (!payment.feeAgreementId || !payment.caseId);
    const created: schema.FeePayment = {
      id: payment.id || `pay-${crypto.randomUUID()}`,
      firmId: payment.firmId,
      clientId: payment.clientId,
      caseId: payment.caseId ?? null,
      feeAgreementId: payment.feeAgreementId ?? null,
      hearingId: payment.hearingId ?? null,
      paymentDate: payment.paymentDate,
      amountPaisa: payment.amountPaisa,
      method: payment.method,
      reference: payment.reference ?? null,
      receiptNumber: payment.receiptNumber,
      purposeNote: payment.purposeNote,
      status: payment.status ?? 'posted',
      voidReason: payment.voidReason ?? null,
      voidedBy: payment.voidedBy ?? null,
      voidedAt: payment.voidedAt ?? null,
      idempotencyKey: payment.idempotencyKey,
      legacyUnassigned: isLegacy,
      createdAt: payment.createdAt || new Date(),
      updatedAt: payment.updatedAt || new Date(),
      deletedAt: null,
      createdBy: payment.createdBy ?? null,
      updatedBy: payment.updatedBy ?? null,
    };
    this.feePayments.push(created);
    return { ...created };
  }

  public async updateFeePayment(
    id: string,
    firmId: string,
    updates: Partial<schema.FeePayment>
  ): Promise<schema.FeePayment> {
    await this.init();
    const idx = this.feePayments.findIndex((p) => p.id === id && p.firmId === firmId && !p.deletedAt);
    if (idx === -1) throw new Error(`Fee payment not found: ${id}`);
    const updated = {
      ...this.feePayments[idx],
      ...updates,
      updatedAt: new Date(),
    };
    this.feePayments[idx] = updated;
    return { ...updated };
  }

  // Expenses & Categories
  public async listExpenseCategories(firmId: string): Promise<schema.ExpenseCategory[]> {
    await this.init();
    let categories = this.expenseCategories.filter((c) => c.firmId === firmId && !c.deletedAt);
    if (categories.length === 0) {
      categories = await this.seedDefaultExpenseCategories(firmId);
    }
    return categories.map((c) => ({ ...c }));
  }

  public async seedDefaultExpenseCategories(firmId: string): Promise<schema.ExpenseCategory[]> {
    await this.init();
    const seeded: schema.ExpenseCategory[] = DEFAULT_EXPENSE_CATEGORIES.map((name) => ({
      id: `expcat-${crypto.randomUUID()}`,
      firmId,
      name,
      isDefault: true,
      createdAt: new Date(),
      updatedAt: new Date(),
      deletedAt: null,
      createdBy: null,
      updatedBy: null,
    }));
    this.expenseCategories.push(...seeded);
    return seeded.map((c) => ({ ...c }));
  }

  public async listExpenses(
    firmId: string,
    filter?: { clientId?: string; caseId?: string; categoryId?: string; status?: string },
    user?: VisibilityUserContext
  ): Promise<Array<schema.Expense & { categoryName?: string }>> {
    await this.init();
    const visibleCaseIds = this.getVisibleCaseSetForMemory(firmId, user, true);

    let list = this.expenses.filter((e) => {
      if (e.firmId !== firmId || e.deletedAt) return false;
      if (e.caseId && !visibleCaseIds.has(e.caseId)) return false;
      if (filter?.clientId && e.clientId !== filter.clientId) return false;
      if (filter?.caseId && e.caseId !== filter.caseId) return false;
      if (filter?.categoryId && e.categoryId !== filter.categoryId) return false;
      if (filter?.status && e.status !== filter.status) return false;
      return true;
    });

    return list
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .map((e) => {
        const cat = this.expenseCategories.find((c) => c.id === e.categoryId);
        return {
          ...e,
          categoryName: cat ? cat.name : 'Unknown Category',
        };
      });
  }

  public async getExpenseById(
    id: string,
    firmId: string,
    user?: VisibilityUserContext
  ): Promise<(schema.Expense & { categoryName?: string }) | null> {
    await this.init();
    const expense = this.expenses.find((e) => e.id === id && e.firmId === firmId && !e.deletedAt);
    if (!expense) return null;

    if (user && expense.caseId) {
      const visibleCaseIds = this.getVisibleCaseSetForMemory(firmId, user, true);
      if (!visibleCaseIds.has(expense.caseId)) return null;
    }
    const cat = this.expenseCategories.find((c) => c.id === expense.categoryId);
    return {
      ...expense,
      categoryName: cat ? cat.name : 'Unknown Category',
    };
  }

  public async insertExpense(expense: schema.NewExpense): Promise<schema.Expense> {
    await this.init();
    const created: schema.Expense = {
      id: expense.id || `exp-${crypto.randomUUID()}`,
      firmId: expense.firmId,
      clientId: expense.clientId ?? null,
      caseId: expense.caseId ?? null,
      categoryId: expense.categoryId,
      expenseDate: expense.expenseDate,
      amountPaisa: expense.amountPaisa,
      description: expense.description,
      reimbursable: expense.reimbursable ?? true,
      status: expense.status ?? 'posted',
      voidReason: expense.voidReason ?? null,
      voidedBy: expense.voidedBy ?? null,
      voidedAt: expense.voidedAt ?? null,
      createdAt: expense.createdAt || new Date(),
      updatedAt: expense.updatedAt || new Date(),
      deletedAt: null,
      createdBy: expense.createdBy ?? null,
      updatedBy: expense.updatedBy ?? null,
    };
    this.expenses.push(created);
    return { ...created };
  }

  public async updateExpense(
    id: string,
    firmId: string,
    updates: Partial<schema.Expense>
  ): Promise<schema.Expense> {
    await this.init();
    const idx = this.expenses.findIndex((e) => e.id === id && e.firmId === firmId && !e.deletedAt);
    if (idx === -1) throw new Error(`Expense not found: ${id}`);
    const updated = {
      ...this.expenses[idx],
      ...updates,
      updatedAt: new Date(),
    };
    this.expenses[idx] = updated;
    return { ...updated };
  }


  public async listChamberExpenseCategories(firmId: string): Promise<schema.ChamberExpenseCategory[]> {
    await this.init();
    let cats = this.chamberExpenseCategories.filter((c) => c.firmId === firmId && !c.deletedAt);
    if (cats.length === 0) {
      const defaults: Array<{ name: string; nameBn: string; kind: 'general' | 'salary' }> = [
        { name: 'Food and refreshments', nameBn: 'খাবার ও আপ্যায়ন', kind: 'general' },
        { name: 'Office supplies', nameBn: 'অফিস স্টেশনারি ও সামগ্রী', kind: 'general' },
        { name: 'Utilities (electricity, internet, water)', nameBn: 'ইউটিলিটি - বিদ্যুৎ, ইন্টারনেট, পানি', kind: 'general' },
        { name: 'Rent', nameBn: 'চেম্বার ভাড়া', kind: 'general' },
        { name: 'Staff salary', nameBn: 'কর্মচারীদের বেতন', kind: 'salary' },
        { name: 'Payments for specific work', nameBn: 'নির্দিষ্ট কাজের পারিশ্রমিক', kind: 'general' },
        { name: 'Transportation', nameBn: 'যাতায়াত ও পরিবহন', kind: 'general' },
        { name: 'Miscellaneous', nameBn: 'বিবিধ খরচ', kind: 'general' },
      ];
      for (const d of defaults) {
        const cat: schema.ChamberExpenseCategory = {
          id: `ch-cat-${crypto.randomUUID()}`,
          firmId,
          name: d.name,
          nameBn: d.nameBn,
          kind: d.kind,
          isDefault: true,
          createdAt: new Date(),
          updatedAt: new Date(),
          deletedAt: null,
          createdBy: null,
          updatedBy: null,
        };
        this.chamberExpenseCategories.push(cat);
      }
      cats = this.chamberExpenseCategories.filter((c) => c.firmId === firmId && !c.deletedAt);
    }
    return [...cats].sort((a, b) => a.name.localeCompare(b.name));
  }

  public async createChamberExpenseCategory(
    firmId: string,
    data: schema.NewChamberExpenseCategory
  ): Promise<schema.ChamberExpenseCategory> {
    await this.init();
    const created: schema.ChamberExpenseCategory = {
      id: data.id || `ch-cat-${crypto.randomUUID()}`,
      firmId,
      name: data.name,
      nameBn: data.nameBn ?? null,
      kind: data.kind || 'general',
      isDefault: data.isDefault ?? false,
      createdAt: new Date(),
      updatedAt: new Date(),
      deletedAt: null,
      createdBy: data.createdBy ?? null,
      updatedBy: data.updatedBy ?? null,
    };
    this.chamberExpenseCategories.push(created);
    return { ...created };
  }

  public async listChamberExpenses(
    firmId: string,
    filter?: { fromDate?: string; toDate?: string; categoryId?: string; status?: string },
    user?: VisibilityUserContext
  ): Promise<Array<schema.ChamberExpense & { categoryName?: string; categoryNameBn?: string | null; categoryKind?: string }>> {
    await this.init();
    const canViewSalary = !user || user.role === 'firm_owner' || user.role === 'admin' || user.permissions?.includes('chamber_expenses.salary') || user.permissions?.includes('*');

    const cats = await this.listChamberExpenseCategories(firmId);
    const catMap = new Map(cats.map((c) => [c.id, c]));

    const list = this.chamberExpenses.filter((e) => {
      if (e.firmId !== firmId || e.deletedAt) return false;
      const cat = catMap.get(e.categoryId);
      if (!canViewSalary && cat?.kind === 'salary') return false;
      if (filter?.categoryId && e.categoryId !== filter.categoryId) return false;
      if (filter?.status && e.status !== filter.status) return false;
      if (filter?.fromDate && e.expenseDate < filter.fromDate) return false;
      if (filter?.toDate && e.expenseDate > filter.toDate) return false;
      return true;
    });

    return list
      .sort((a, b) => b.expenseDate.localeCompare(a.expenseDate) || new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .map((e) => {
        const cat = catMap.get(e.categoryId);
        return {
          ...e,
          categoryName: cat?.name || 'Unknown',
          categoryNameBn: cat?.nameBn || null,
          categoryKind: cat?.kind || 'general',
        };
      });
  }

  public async getChamberExpenseById(
    firmId: string,
    id: string,
    user?: VisibilityUserContext
  ): Promise<(schema.ChamberExpense & { categoryName?: string; categoryNameBn?: string | null; categoryKind?: string }) | null> {
    await this.init();
    const exp = this.chamberExpenses.find((e) => e.id === id && e.firmId === firmId && !e.deletedAt);
    if (!exp) return null;
    const cats = await this.listChamberExpenseCategories(firmId);
    const cat = cats.find((c) => c.id === exp.categoryId);
    const canViewSalary = !user || user.role === 'firm_owner' || user.role === 'admin' || user.permissions?.includes('chamber_expenses.salary') || user.permissions?.includes('*');
    if (!canViewSalary && cat?.kind === 'salary') return null;

    return {
      ...exp,
      categoryName: cat?.name || 'Unknown',
      categoryNameBn: cat?.nameBn || null,
      categoryKind: cat?.kind || 'general',
    };
  }

  public async createChamberExpense(
    firmId: string,
    data: schema.NewChamberExpense
  ): Promise<schema.ChamberExpense> {
    await this.init();
    const created: schema.ChamberExpense = {
      id: data.id || `ch-exp-${crypto.randomUUID()}`,
      firmId,
      categoryId: data.categoryId,
      description: data.description,
      amountPaisa: data.amountPaisa,
      expenseDate: data.expenseDate,
      paidTo: data.paidTo,
      paymentMethod: data.paymentMethod,
      receiptRef: data.receiptRef ?? null,
      notes: data.notes ?? null,
      advanceId: data.advanceId ?? null,
      status: data.status || 'posted',
      voidReason: null,
      voidedBy: null,
      voidedAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      deletedAt: null,
      createdBy: data.createdBy ?? null,
      updatedBy: data.updatedBy ?? null,
    };
    this.chamberExpenses.push(created);

    // If advanceId is present, automatically record advance settlement
    if (created.advanceId) {
      await this.createChamberAdvanceSettlement(firmId, created.advanceId, {
        id: `ch-set-${crypto.randomUUID()}`,
        firmId,
        advanceId: created.advanceId,
        type: 'expense',
        expenseId: created.id,
        amountPaisa: created.amountPaisa,
        settledDate: created.expenseDate,
        notes: `Expense settlement: ${created.description}`,
        createdBy: data.createdBy ?? null,
      });
    }

    return { ...created };
  }

  public async updateChamberExpense(
    firmId: string,
    id: string,
    updates: Partial<schema.ChamberExpense>
  ): Promise<schema.ChamberExpense> {
    await this.init();
    const idx = this.chamberExpenses.findIndex((e) => e.id === id && e.firmId === firmId && !e.deletedAt);
    if (idx === -1) throw new Error(`Chamber expense not found: ${id}`);
    const updated = {
      ...this.chamberExpenses[idx],
      ...updates,
      updatedAt: new Date(),
    };
    this.chamberExpenses[idx] = updated;
    return { ...updated };
  }

  public async voidChamberExpense(
    firmId: string,
    id: string,
    voidReason: string,
    userId: string
  ): Promise<schema.ChamberExpense> {
    await this.init();
    const exp = await this.updateChamberExpense(firmId, id, {
      status: 'void',
      voidReason,
      voidedBy: userId,
      voidedAt: new Date(),
      updatedBy: userId,
    });

    // If linked to advance, soft-delete settlement and reopen advance if needed
    const settlements = this.chamberAdvanceSettlements.filter(
      (s) => s.firmId === firmId && s.expenseId === id && !s.deletedAt
    );
    for (const s of settlements) {
      s.deletedAt = new Date();
      s.updatedBy = userId;
      // Re-evaluate advance status
      const adv = this.chamberAdvances.find((a) => a.id === s.advanceId && a.firmId === firmId);
      if (adv && adv.status === 'settled') {
        const remainingSettlements = this.chamberAdvanceSettlements.filter(
          (other) => other.advanceId === adv.id && other.firmId === firmId && !other.deletedAt
        );
        const settledPaisa = remainingSettlements.reduce((sum, item) => sum + Number(item.amountPaisa || 0), 0);
        if (settledPaisa < Number(adv.amountPaisa)) {
          adv.status = 'open';
          adv.updatedAt = new Date();
        }
      }
    }

    return exp;
  }

  public async getChamberExpensesSummary(
    firmId: string,
    period?: { month?: string; year?: number },
    user?: VisibilityUserContext
  ): Promise<{
    totalThisMonthPaisa: number;
    totalLastMonthPaisa: number;
    totalSalaryThisMonthPaisa: number;
    byCategory: Array<{
      categoryId: string;
      categoryName: string;
      categoryNameBn?: string | null;
      categoryKind: string;
      totalPaisa: number;
      count: number;
    }>;
  }> {
    await this.init();
    const canViewSalary = !user || user.role === 'firm_owner' || user.role === 'admin' || user.permissions?.includes('chamber_expenses.salary') || user.permissions?.includes('*');

    const cats = await this.listChamberExpenseCategories(firmId);
    const catMap = new Map(cats.map((c) => [c.id, c]));

    const now = new Date();
    const currentYear = period?.year ?? now.getFullYear();
    const currentMonth = period?.month ?? String(now.getMonth() + 1).padStart(2, '0');
    const currentMonthPrefix = `${currentYear}-${currentMonth}`;

    const lastMonthDate = new Date(currentYear, Number(currentMonth) - 2, 1);
    const lastMonthYear = lastMonthDate.getFullYear();
    const lastMonthNum = String(lastMonthDate.getMonth() + 1).padStart(2, '0');
    const lastMonthPrefix = `${lastMonthYear}-${lastMonthNum}`;

    let totalThisMonthPaisa = 0;
    let totalLastMonthPaisa = 0;
    let totalSalaryThisMonthPaisa = 0;
    const catBuckets = new Map<string, { totalPaisa: number; count: number }>();

    for (const exp of this.chamberExpenses) {
      if (exp.firmId !== firmId || exp.deletedAt || exp.status === 'void') continue;
      const cat = catMap.get(exp.categoryId);
      const isSalary = cat?.kind === 'salary';
      if (isSalary && !canViewSalary) continue;

      const amt = Number(exp.amountPaisa || 0);

      if (exp.expenseDate.startsWith(currentMonthPrefix)) {
        totalThisMonthPaisa += amt;
        if (isSalary) {
          totalSalaryThisMonthPaisa += amt;
        }

        const bucket = catBuckets.get(exp.categoryId) || { totalPaisa: 0, count: 0 };
        bucket.totalPaisa += amt;
        bucket.count += 1;
        catBuckets.set(exp.categoryId, bucket);
      } else if (exp.expenseDate.startsWith(lastMonthPrefix)) {
        totalLastMonthPaisa += amt;
      }
    }

    const byCategory = cats
      .filter((c) => canViewSalary || c.kind !== 'salary')
      .map((c) => {
        const bucket = catBuckets.get(c.id) || { totalPaisa: 0, count: 0 };
        return {
          categoryId: c.id,
          categoryName: c.name,
          categoryNameBn: c.nameBn,
          categoryKind: c.kind,
          totalPaisa: bucket.totalPaisa,
          count: bucket.count,
        };
      })
      .filter((c) => c.count > 0)
      .sort((a, b) => b.totalPaisa - a.totalPaisa);

    return {
      totalThisMonthPaisa,
      totalLastMonthPaisa,
      totalSalaryThisMonthPaisa,
      byCategory,
    };
  }

  public async listChamberAdvances(
    firmId: string,
    filter?: { givenToUserId?: string; status?: string }
  ): Promise<Array<schema.ChamberAdvance & { settledAmountPaisa: number; remainingAmountPaisa: number }>> {
    await this.init();
    const advances = this.chamberAdvances.filter((a) => {
      if (a.firmId !== firmId || a.deletedAt) return false;
      if (filter?.givenToUserId && a.givenToUserId !== filter.givenToUserId) return false;
      if (filter?.status && a.status !== filter.status) return false;
      return true;
    });

    return advances
      .sort((a, b) => b.givenDate.localeCompare(a.givenDate) || new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .map((a) => {
        const settlements = this.chamberAdvanceSettlements.filter(
          (s) => s.advanceId === a.id && s.firmId === firmId && !s.deletedAt
        );
        const settledAmountPaisa = settlements.reduce((sum, s) => sum + Number(s.amountPaisa || 0), 0);
        const remainingAmountPaisa = Math.max(0, Number(a.amountPaisa) - settledAmountPaisa);
        return {
          ...a,
          settledAmountPaisa,
          remainingAmountPaisa,
        };
      });
  }

  public async getChamberAdvanceById(
    firmId: string,
    id: string
  ): Promise<(schema.ChamberAdvance & { settledAmountPaisa: number; remainingAmountPaisa: number; settlements: schema.ChamberAdvanceSettlement[] }) | null> {
    await this.init();
    const adv = this.chamberAdvances.find((a) => a.id === id && a.firmId === firmId && !a.deletedAt);
    if (!adv) return null;

    const settlements = this.chamberAdvanceSettlements.filter(
      (s) => s.advanceId === id && s.firmId === firmId && !s.deletedAt
    );
    const settledAmountPaisa = settlements.reduce((sum, s) => sum + Number(s.amountPaisa || 0), 0);
    const remainingAmountPaisa = Math.max(0, Number(adv.amountPaisa) - settledAmountPaisa);

    return {
      ...adv,
      settledAmountPaisa,
      remainingAmountPaisa,
      settlements,
    };
  }

  public async createChamberAdvance(
    firmId: string,
    data: schema.NewChamberAdvance
  ): Promise<schema.ChamberAdvance> {
    await this.init();
    const created: schema.ChamberAdvance = {
      id: data.id || `ch-adv-${crypto.randomUUID()}`,
      firmId,
      givenTo: data.givenTo,
      givenToUserId: data.givenToUserId ?? null,
      amountPaisa: data.amountPaisa,
      givenDate: data.givenDate,
      purpose: data.purpose,
      paymentMethod: data.paymentMethod,
      status: 'open',
      voidReason: null,
      voidedBy: null,
      voidedAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      deletedAt: null,
      createdBy: data.createdBy ?? null,
      updatedBy: data.updatedBy ?? null,
    };
    this.chamberAdvances.push(created);
    return { ...created };
  }

  public async voidChamberAdvance(
    firmId: string,
    id: string,
    voidReason: string,
    userId: string
  ): Promise<schema.ChamberAdvance> {
    await this.init();
    const idx = this.chamberAdvances.findIndex((a) => a.id === id && a.firmId === firmId && !a.deletedAt);
    if (idx === -1) throw new Error(`Advance not found: ${id}`);

    const settlements = this.chamberAdvanceSettlements.filter(
      (s) => s.advanceId === id && s.firmId === firmId && !s.deletedAt
    );
    if (settlements.length > 0) {
      throw new Error('Cannot void advance with existing settlements. Settle by refund or void linked expenses first.');
    }

    const updated = {
      ...this.chamberAdvances[idx],
      status: 'void' as const,
      voidReason,
      voidedBy: userId,
      voidedAt: new Date(),
      updatedBy: userId,
      updatedAt: new Date(),
    };
    this.chamberAdvances[idx] = updated;
    return { ...updated };
  }

  public async createChamberAdvanceSettlement(
    firmId: string,
    advanceId: string,
    data: schema.NewChamberAdvanceSettlement
  ): Promise<schema.ChamberAdvanceSettlement> {
    await this.init();
    const adv = this.chamberAdvances.find((a) => a.id === advanceId && a.firmId === firmId && !a.deletedAt);
    if (!adv) throw new Error(`Advance not found: ${advanceId}`);
    if (adv.status === 'void') throw new Error('Cannot settle a voided advance');

    const settlements = this.chamberAdvanceSettlements.filter(
      (s) => s.advanceId === advanceId && s.firmId === firmId && !s.deletedAt
    );
    const currentSettled = settlements.reduce((sum, s) => sum + Number(s.amountPaisa || 0), 0);
    const remaining = Number(adv.amountPaisa) - currentSettled;

    if (Number(data.amountPaisa) > remaining) {
      throw new Error(`Settlement amount (${Number(data.amountPaisa)}) exceeds remaining balance (${remaining})`);
    }

    const created: schema.ChamberAdvanceSettlement = {
      id: data.id || `ch-set-${crypto.randomUUID()}`,
      firmId,
      advanceId,
      type: data.type,
      expenseId: data.expenseId ?? null,
      amountPaisa: data.amountPaisa,
      settledDate: data.settledDate,
      notes: data.notes ?? null,
      createdAt: new Date(),
      updatedAt: new Date(),
      deletedAt: null,
      createdBy: data.createdBy ?? null,
      updatedBy: data.updatedBy ?? null,
    };
    this.chamberAdvanceSettlements.push(created);

    // If fully settled, update advance status
    if (currentSettled + Number(data.amountPaisa) >= Number(adv.amountPaisa)) {
      adv.status = 'settled';
      adv.updatedAt = new Date();
    }

    return { ...created };
  }

  public async listChamberAdvanceSettlements(
    firmId: string,
    advanceId: string
  ): Promise<schema.ChamberAdvanceSettlement[]> {
    await this.init();
    return this.chamberAdvanceSettlements
      .filter((s) => s.advanceId === advanceId && s.firmId === firmId && !s.deletedAt)
      .sort((a, b) => b.settledDate.localeCompare(a.settledDate));
  }
  public async getPlatformAdminByEmail(email: string): Promise<schema.PlatformAdmin | null> {
    await this.init();
    const admin = this.platformAdmins.find(
      (a) => a.email.toLowerCase() === email.trim().toLowerCase()
    );
    return admin ? { ...admin } : null;
  }

  public async getPlatformAdminById(id: string): Promise<schema.PlatformAdmin | null> {
    await this.init();
    const admin = this.platformAdmins.find((a) => a.id === id);
    return admin ? { ...admin } : null;
  }

  public async listPlatformAdmins(): Promise<schema.PlatformAdmin[]> {
    await this.init();
    return this.platformAdmins.map((a) => ({ ...a }));
  }

  public async insertPlatformAdmin(admin: schema.NewPlatformAdmin): Promise<schema.PlatformAdmin> {
    await this.init();
    const existing = this.platformAdmins.find(
      (a) => a.email.toLowerCase() === admin.email.trim().toLowerCase()
    );
    if (existing) {
      throw new Error(`PlatformAdmin with email ${admin.email} already exists`);
    }
    const fullAdmin: schema.PlatformAdmin = {
      id: admin.id || crypto.randomUUID(),
      email: admin.email.trim(),
      passwordHash: admin.passwordHash,
      totpSecret: admin.totpSecret ?? null,
      active: admin.active !== undefined ? admin.active : true,
      failedAttempts: admin.failedAttempts || 0,
      lockedUntil: admin.lockedUntil ?? null,
      createdAt: admin.createdAt || new Date(),
      updatedAt: admin.updatedAt || new Date(),
    };
    this.platformAdmins.push(fullAdmin);
    return { ...fullAdmin };
  }

  public async updatePlatformAdmin(
    id: string,
    updates: Partial<schema.PlatformAdmin>
  ): Promise<schema.PlatformAdmin> {
    await this.init();
    const index = this.platformAdmins.findIndex((a) => a.id === id);
    if (index === -1) throw new Error(`PlatformAdmin not found: ${id}`);
    const updated = {
      ...this.platformAdmins[index],
      ...updates,
      updatedAt: new Date(),
    };
    this.platformAdmins[index] = updated;
    return { ...updated };
  }

  public async incrementPlatformAdminFailedLogin(
    id: string,
    lockedUntil: Date | null
  ): Promise<{ failedAttempts: number; lockedUntil: Date | null }> {
    await this.init();
    const index = this.platformAdmins.findIndex((a) => a.id === id);
    if (index === -1) throw new Error(`PlatformAdmin not found: ${id}`);
    const admin = this.platformAdmins[index];
    const nextAttempts = (admin.failedAttempts || 0) + 1;
    admin.failedAttempts = nextAttempts;
    admin.lockedUntil = lockedUntil;
    admin.updatedAt = new Date();
    return { failedAttempts: nextAttempts, lockedUntil };
  }

  public async resetPlatformAdminFailedLogin(id: string): Promise<void> {
    await this.init();
    const index = this.platformAdmins.findIndex((a) => a.id === id);
    if (index === -1) return;
    this.platformAdmins[index].failedAttempts = 0;
    this.platformAdmins[index].lockedUntil = null;
    this.platformAdmins[index].updatedAt = new Date();
  }

  public async insertAdminAudit(entry: schema.NewAdminAuditEntry): Promise<schema.AdminAuditEntry> {
    await this.init();
    const fullEntry: schema.AdminAuditEntry = {
      id: entry.id || crypto.randomUUID(),
      adminId: entry.adminId,
      action: entry.action,
      targetFirmId: entry.targetFirmId ?? null,
      old: (entry.old as Record<string, unknown> | null) ?? null,
      new: (entry.new as Record<string, unknown> | null) ?? null,
      ip: entry.ip ?? null,
      at: entry.at || new Date(),
    };
    this.adminAudits.push(fullEntry);
    return { ...fullEntry };
  }

  public async listAdminAudit(limit = 100, offset = 0): Promise<schema.AdminAuditEntry[]> {
    await this.init();
    return [...this.adminAudits]
      .sort((a, b) => b.at.getTime() - a.at.getTime())
      .slice(offset, offset + limit)
      .map((e) => ({ ...e }));
  }

  public async insertLicenseEvent(event: schema.NewLicenseEvent): Promise<schema.LicenseEvent> {
    await this.init();
    const newEvent: schema.LicenseEvent = {
      id: event.id || crypto.randomUUID(),
      firmId: event.firmId,
      type: event.type,
      old: (event.old as Record<string, unknown> | null) ?? null,
      new: (event.new as Record<string, unknown> | null) ?? null,
      byAdmin: event.byAdmin,
      at: event.at || new Date(),
    };
    this.licenseEvents.push(newEvent);
    return { ...newEvent };
  }

  public async listLicenseEvents(firmId?: string, limit = 50): Promise<schema.LicenseEvent[]> {
    await this.init();
    let list = [...this.licenseEvents];
    if (firmId) {
      list = list.filter((e) => e.firmId === firmId);
    }
    list.sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());
    return list.slice(0, limit).map((e) => ({ ...e }));
  }

  public async insertPayment(payment: schema.NewPayment): Promise<schema.Payment> {
    await this.init();
    const newPayment: schema.Payment = {
      id: payment.id || `pay-${crypto.randomUUID()}`,
      firmId: payment.firmId,
      amount: payment.amount,
      method: payment.method,
      txnId: payment.txnId,
      note: payment.note ?? null,
      paidAt: payment.paidAt || new Date(),
      verifiedBy: payment.verifiedBy ?? null,
      createdAt: new Date(),
      updatedAt: new Date(),
      deletedAt: null,
      createdBy: payment.createdBy ?? null,
      updatedBy: payment.updatedBy ?? null,
    };
    this.payments.push(newPayment);
    return { ...newPayment };
  }

  public async listPayments(firmId: string): Promise<schema.Payment[]> {
    await this.init();
    return this.payments
      .filter((p) => p.firmId === firmId && !p.deletedAt)
      .sort((a, b) => new Date(b.paidAt).getTime() - new Date(a.paidAt).getTime())
      .map((p) => ({ ...p }));
  }

  public async getDeviceById(id: string): Promise<schema.Device | null> {
    await this.init();
    return this.devices.find((d) => d.id === id) || null;
  }

  public async getDeviceByHash(deviceKeyHash: string): Promise<schema.Device | null> {
    await this.init();
    return this.devices.find((d) => d.deviceKeyHash === deviceKeyHash) || null;
  }

  public async listDevices(firmId: string): Promise<schema.Device[]> {
    await this.init();
    return this.devices
      .filter((d) => d.firmId === firmId)
      .sort((a, b) => new Date(b.lastSeenAt).getTime() - new Date(a.lastSeenAt).getTime());
  }

  public async countApprovedDevices(firmId: string): Promise<number> {
    await this.init();
    return this.devices.filter((d) => d.firmId === firmId && d.status === 'approved').length;
  }

  public async countPendingDevices(firmId: string): Promise<number> {
    await this.init();
    return this.devices.filter((d) => d.firmId === firmId && d.status === 'pending').length;
  }

  public async insertDevice(device: schema.NewDevice): Promise<schema.Device> {
    await this.init();
    const created: schema.Device = {
      id: device.id || crypto.randomUUID(),
      firmId: device.firmId,
      userId: device.userId,
      deviceKeyHash: device.deviceKeyHash,
      name: device.name,
      userAgent: device.userAgent,
      status: device.status || 'pending',
      firstSeenAt: device.firstSeenAt ? new Date(device.firstSeenAt) : new Date(),
      lastSeenAt: device.lastSeenAt ? new Date(device.lastSeenAt) : new Date(),
      approvedByAdminId: device.approvedByAdminId || null,
    };
    this.devices.push(created);
    return created;
  }

  public async updateDevice(id: string, updates: Partial<schema.Device>): Promise<schema.Device> {
    await this.init();
    const index = this.devices.findIndex((d) => d.id === id);
    if (index === -1) {
      throw new Error(`Device not found: ${id}`);
    }
    const updated: schema.Device = {
      ...this.devices[index],
      ...updates,
    };
    this.devices[index] = updated;
    return updated;
  }

  public async deleteDevice(id: string): Promise<void> {
    await this.init();
    this.devices = this.devices.filter((d) => d.id !== id);
  }

  public async getFirmMetrics(
    firmId: string
  ): Promise<{ userCount: number; deviceCount: number; pendingDeviceCount: number; lastActivity: Date | null }> {
    await this.init();
    const userCount = this.users.filter((u) => u.firmId === firmId && !u.deletedAt).length;
    const approvedDevices = this.devices.filter((d) => d.firmId === firmId && d.status === 'approved').length;
    const pendingDeviceCount = this.devices.filter((d) => d.firmId === firmId && d.status === 'pending').length;
    
    // In memory: use approved device count if devices exist, fallback to IP approximation
    let deviceCount = approvedDevices;
    if (deviceCount === 0 && pendingDeviceCount === 0) {
      const sessionAudits = this.auditLogs.filter(
        (a) => a.firmId === firmId && a.entity === 'Session' && a.action === 'LOGIN_SUCCESS'
      );
      const ipSet = new Set<string>();
      sessionAudits.forEach((a) => {
        const ip = (a.newValue as any)?.ipAddress;
        if (ip) ipSet.add(ip);
      });
      deviceCount = ipSet.size > 0 ? ipSet.size : Math.max(1, userCount);
    }

    const firmAudits = this.auditLogs.filter((a) => a.firmId === firmId);
    let lastActivity: Date | null = null;
    if (firmAudits.length > 0) {
      const latestTimestamp = Math.max(...firmAudits.map((a) => new Date(a.timestamp).getTime()));
      lastActivity = new Date(latestTimestamp);
    } else {
      const firm = this.firms.find((f) => f.id === firmId);
      lastActivity = firm?.updatedAt || firm?.createdAt || null;
    }
    return { userCount, deviceCount, pendingDeviceCount, lastActivity };
  }

  // Appointments Methods
  public async listAppointments(
    firmId: string,
    filter?: {
      from?: string;
      to?: string;
      status?: string;
      clientId?: string;
      caseId?: string;
      mine?: boolean;
      user?: VisibilityUserContext;
      limit?: number;
      offset?: number;
    }
  ): Promise<{ appointments: Array<schema.Appointment & { attendees: string[] }>; total: number }> {
    await this.init();
    const firm = this.firms.find((f) => f.id === firmId) || { id: firmId, visibilityMode: 'open' };
    const firmUsers = this.users.filter((u) => u.firmId === firmId && !u.deletedAt);
    const firmShares = this.caseShares.filter((s) => s.firmId === firmId && !s.deletedAt);

    let list = this.appointments.filter((a) => a.firmId === firmId && !a.deletedAt);

    // Apply visibility filter
    if (filter?.user) {
      const u = filter.user;
      list = list.filter((a) => {
        const attendeeIds = this.appointmentAttendees
          .filter((att) => att.appointmentId === a.id)
          .map((att) => att.userId);
        return canUserSeeAppointment(u, a, attendeeIds, firm, firmUsers, this.cases, firmShares);
      });
    }

    if (filter?.mine && filter?.user) {
      const uid = filter.user.id;
      list = list.filter((a) => {
        const attendeeIds = this.appointmentAttendees
          .filter((att) => att.appointmentId === a.id)
          .map((att) => att.userId);
        return a.organiserUserId === uid || attendeeIds.includes(uid);
      });
    }

    if (filter?.status && filter.status !== 'all') {
      list = list.filter((a) => a.status === filter.status);
    }
    if (filter?.clientId) {
      list = list.filter((a) => a.clientId === filter.clientId);
    }
    if (filter?.caseId) {
      list = list.filter((a) => a.caseId === filter.caseId);
    }
    if (filter?.from) {
      const fromTime = new Date(filter.from).getTime();
      list = list.filter((a) => new Date(a.startsAt).getTime() >= fromTime);
    }
    if (filter?.to) {
      const toTime = new Date(filter.to).getTime();
      list = list.filter((a) => new Date(a.startsAt).getTime() <= toTime);
    }

    list.sort((a, b) => new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime());

    const total = list.length;
    const limit = filter?.limit || 50;
    const offset = filter?.offset || 0;
    const paged = list.slice(offset, offset + limit);

    const appointmentsWithAttendees = paged.map((a) => {
      const attendees = this.appointmentAttendees
        .filter((att) => att.appointmentId === a.id)
        .map((att) => att.userId);
      return { ...a, attendees };
    });

    return { appointments: appointmentsWithAttendees, total };
  }

  public async getAppointmentById(
    id: string,
    firmId: string,
    user?: VisibilityUserContext
  ): Promise<(schema.Appointment & { attendees: string[] }) | null> {
    await this.init();
    const appt = this.appointments.find((a) => a.id === id && a.firmId === firmId && !a.deletedAt);
    if (!appt) return null;

    const attendees = this.appointmentAttendees
      .filter((att) => att.appointmentId === appt.id)
      .map((att) => att.userId);

    if (user) {
      const firm = this.firms.find((f) => f.id === firmId) || { id: firmId, visibilityMode: 'open' };
      const firmUsers = this.users.filter((u) => u.firmId === firmId && !u.deletedAt);
      const firmShares = this.caseShares.filter((s) => s.firmId === firmId && !s.deletedAt);
      if (!canUserSeeAppointment(user, appt, attendees, firm, firmUsers, this.cases, firmShares)) {
        return null;
      }
    }

    return { ...appt, attendees };
  }

  public async insertAppointment(
    appointment: schema.NewAppointment,
    attendeeUserIds: string[]
  ): Promise<schema.Appointment & { attendees: string[] }> {
    await this.init();
    const now = new Date();
    const newAppt: schema.Appointment = {
      id: appointment.id || crypto.randomUUID(),
      firmId: appointment.firmId,
      title: appointment.title,
      type: appointment.type,
      startsAt: appointment.startsAt,
      endsAt: appointment.endsAt,
      mode: appointment.mode || 'in_person',
      location: appointment.location || null,
      organiserUserId: appointment.organiserUserId,
      clientId: appointment.clientId || null,
      caseId: appointment.caseId || null,
      status: appointment.status || 'scheduled',
      notes: appointment.notes || null,
      reminderMinutesBefore: appointment.reminderMinutesBefore ?? 30,
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
      createdBy: appointment.createdBy || null,
      updatedBy: appointment.updatedBy || null,
    };
    this.appointments.push(newAppt);

    for (const uid of attendeeUserIds) {
      this.appointmentAttendees.push({
        id: crypto.randomUUID(),
        appointmentId: newAppt.id,
        userId: uid,
        firmId: newAppt.firmId,
        createdAt: now,
        updatedAt: now,
      });
    }

    return { ...newAppt, attendees: [...attendeeUserIds] };
  }

  public async updateAppointment(
    id: string,
    firmId: string,
    updates: Partial<schema.Appointment>,
    attendeeUserIds?: string[]
  ): Promise<schema.Appointment & { attendees: string[] }> {
    await this.init();
    const index = this.appointments.findIndex((a) => a.id === id && a.firmId === firmId && !a.deletedAt);
    if (index === -1) throw new Error(`Appointment not found: ${id}`);

    const now = new Date();
    const updated = {
      ...this.appointments[index],
      ...updates,
      updatedAt: now,
    };
    this.appointments[index] = updated;

    if (attendeeUserIds !== undefined) {
      this.appointmentAttendees = this.appointmentAttendees.filter((att) => att.appointmentId !== id);
      for (const uid of attendeeUserIds) {
        this.appointmentAttendees.push({
          id: crypto.randomUUID(),
          appointmentId: id,
          userId: uid,
          firmId,
          createdAt: now,
          updatedAt: now,
        });
      }
    }

    const currentAttendees = this.appointmentAttendees
      .filter((att) => att.appointmentId === id)
      .map((att) => att.userId);

    return { ...updated, attendees: currentAttendees };
  }

  public async deleteAppointment(id: string, firmId: string, updatedBy?: string): Promise<void> {
    await this.init();
    const index = this.appointments.findIndex((a) => a.id === id && a.firmId === firmId && !a.deletedAt);
    if (index !== -1) {
      this.appointments[index].deletedAt = new Date();
      this.appointments[index].updatedAt = new Date();
      if (updatedBy) this.appointments[index].updatedBy = updatedBy;
    }
  }

  public async checkAppointmentOverlap(
    firmId: string,
    userId: string,
    startsAt: Date,
    endsAt: Date,
    excludeId?: string
  ): Promise<boolean> {
    await this.init();
    const startMs = startsAt.getTime();
    const endMs = endsAt.getTime();

    for (const a of this.appointments) {
      if (a.firmId !== firmId || a.deletedAt || a.status === 'cancelled') continue;
      if (excludeId && a.id === excludeId) continue;

      const aStartMs = new Date(a.startsAt).getTime();
      const aEndMs = new Date(a.endsAt).getTime();

      if (startMs < aEndMs && endMs > aStartMs) {
        if (a.organiserUserId === userId) return true;
        const isAttending = this.appointmentAttendees.some(
          (att) => att.appointmentId === a.id && att.userId === userId
        );
        if (isAttending) return true;
      }
    }
    return false;
  }

  public async transaction<T>(callback: (txDb: IDatabase) => Promise<T>): Promise<T> {
    await this.init();
    // Snapshot state for rollback on error
    const snapshot = {
      plans: [...this.plans],
      firms: [...this.firms],
      users: [...this.users],
      clients: [...this.clients],
      clientPhotos: [...this.clientPhotos],
      clientNotes: [...this.clientNotes],
      cases: [...this.cases],
      caseNotes: [...this.caseNotes],
      hearings: [...this.hearings],
      hearingDateHistory: [...this.hearingDateHistory],
      caseShares: [...this.caseShares],
      appointments: [...this.appointments],
      appointmentAttendees: [...this.appointmentAttendees],
      auditLogs: [...this.auditLogs],
      platformAdmins: [...this.platformAdmins],
      adminAudits: [...this.adminAudits],
      licenseEvents: [...this.licenseEvents],
      payments: [...this.payments],
      devices: [...this.devices],
      tasks: [...this.tasks],
      feeAgreements: [...this.feeAgreements],
      feeAgreementChanges: [...this.feeAgreementChanges],
      numberSequences: [...this.numberSequences],
      feePayments: [...this.feePayments],
      expenseCategories: [...this.expenseCategories],
      expenses: [...this.expenses],
      chamberExpenseCategories: [...this.chamberExpenseCategories],
      chamberAdvances: [...this.chamberAdvances],
      chamberExpenses: [...this.chamberExpenses],
      chamberAdvanceSettlements: [...this.chamberAdvanceSettlements],
      physicalFiles: [...this.physicalFiles],
      fileMovements: [...this.fileMovements],
      reminders: [...this.reminders],
    };

    try {
      return await callback(this);
    } catch (err) {
      // Rollback all tables to snapshot
      this.plans = snapshot.plans;
      this.firms = snapshot.firms;
      this.users = snapshot.users;
      this.clients = snapshot.clients;
      this.clientPhotos = snapshot.clientPhotos;
      this.clientNotes = snapshot.clientNotes;
      this.cases = snapshot.cases;
      this.caseNotes = snapshot.caseNotes;
      this.hearings = snapshot.hearings;
      this.hearingDateHistory = snapshot.hearingDateHistory;
      this.caseShares = snapshot.caseShares;
      this.appointments = snapshot.appointments;
      this.appointmentAttendees = snapshot.appointmentAttendees;
      this.auditLogs = snapshot.auditLogs;
      this.platformAdmins = snapshot.platformAdmins;
      this.adminAudits = snapshot.adminAudits;
      this.licenseEvents = snapshot.licenseEvents;
      this.payments = snapshot.payments;
      this.devices = snapshot.devices;
      this.tasks = snapshot.tasks;
      this.feeAgreements = snapshot.feeAgreements;
      this.feeAgreementChanges = snapshot.feeAgreementChanges;
      this.numberSequences = snapshot.numberSequences;
      this.feePayments = snapshot.feePayments;
      this.expenseCategories = snapshot.expenseCategories;
      this.expenses = snapshot.expenses;
      this.chamberExpenseCategories = snapshot.chamberExpenseCategories;
      this.chamberAdvances = snapshot.chamberAdvances;
      this.chamberExpenses = snapshot.chamberExpenses;
      this.chamberAdvanceSettlements = snapshot.chamberAdvanceSettlements;
      this.physicalFiles = snapshot.physicalFiles;
      this.fileMovements = snapshot.fileMovements;
      this.reminders = snapshot.reminders;
      throw err;
    }
  }
}

// PostgreSQL Database Adapter via Drizzle ORM
class PostgresDatabase implements IDatabase {
  private pool: pg.Pool;
  private db: ReturnType<typeof drizzle<typeof schema>>;
  private seatLimitOverrides = new Map<string, number>();

  constructor(connectionString: string) {
    const isRemote =
      !connectionString.includes('localhost') &&
      !connectionString.includes('127.0.0.1');

    // Test isolation guard: refuse to run tests unless database is in-memory or local AND db name contains "test"
    if (process.env.NODE_ENV === 'test' || process.env.CI === 'true') {
      const isLocal = !isRemote;
      const parsedPath = connectionString.split('/').pop()?.split('?')[0]?.toLowerCase() || '';
      const isTestDb = parsedPath.includes('test');
      if (!isLocal || !isTestDb) {
        throw new Error(
          `[TEST ISOLATION GUARD] Server tests are strictly forbidden from connecting to non-test or remote database! Target DB: ${parsedPath}, Remote: ${isRemote}`
        );
      }
    }

    const allowInsecureTls =
      process.env.ALLOW_INSECURE_TLS === 'true' ||
      process.env.PG_REJECT_UNAUTHORIZED === 'false' ||
      process.env.NODE_TLS_REJECT_UNAUTHORIZED === '0';
    const ssl =
      connectionString.includes('sslmode=') || isRemote
        ? { rejectUnauthorized: !allowInsecureTls }
        : undefined;

    const isProd = process.env.NODE_ENV === 'production';
    this.pool = new pg.Pool({
      connectionString,
      connectionTimeoutMillis: 5000,
      allowExitOnIdle: !isProd,
      min: isProd ? 2 : 0,
      max: 20,
      idleTimeoutMillis: 30000,
      ...(ssl ? { ssl } : {}),
    });
    this.pool.on('error', (err: Error) => {
      console.error('[BD Legal PostgreSQL Pool Error]:', err.message);
    });
    this.db = drizzle(this.pool, { schema });
  }

  public async isHealthy(): Promise<boolean> {
    try {
      const res = await this.pool.query('SELECT 1');
      return res.rowCount !== null && res.rowCount > 0;
    } catch {
      return false;
    }
  }

  public async getFirm(id: string, includeDeleted = false): Promise<schema.Firm | null> {
    const condition = includeDeleted
      ? eq(schema.firms.id, id)
      : and(eq(schema.firms.id, id), isNull(schema.firms.deletedAt));
    const rows = await this.db
      .select()
      .from(schema.firms)
      .where(condition)
      .limit(1);
    const firm = rows[0] || null;
    if (firm && this.seatLimitOverrides.has(id)) {
      (firm as any).seatLimit = this.seatLimitOverrides.get(id);
    }
    return firm;
  }

  public async updateFirm(id: string, updates: Partial<schema.Firm>): Promise<schema.Firm> {
    if (typeof (updates as any).seatLimit === 'number') {
      this.seatLimitOverrides.set(id, (updates as any).seatLimit);
    }
    const rows = await this.db
      .update(schema.firms)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(schema.firms.id, id))
      .returning();
    if (!rows[0]) throw new Error(`Firm not found: ${id}`);
    const firm = rows[0];
    if (this.seatLimitOverrides.has(id)) {
      (firm as any).seatLimit = this.seatLimitOverrides.get(id);
    }
    return firm;
  }

  public async insertFirm(firm: schema.Firm | schema.NewFirm): Promise<schema.Firm> {
    if (firm.planId) {
      const existingPlan = await this.getPlan(firm.planId);
      if (!existingPlan) {
        await this.insertPlan({
          id: firm.planId,
          name: firm.planId,
          durationMonths: 12,
          priceBdt: 50000,
          seats: 10,
          includedUsers: 10,
          includedDevices: 5,
          extraUserPriceBdt: 100,
          extraDevicePriceBdt: 100,
          status: 'active' as const,
          features: ['cases', 'clients', 'hearings', 'tasks'],
          createdAt: new Date(),
          updatedAt: new Date(),
          deletedAt: null,
          createdBy: 'system',
          updatedBy: 'system',
        });
      }
    }
    const values = {
      ...firm,
      id: firm.id || `firm-${crypto.randomUUID()}`,
      firmId: firm.firmId || firm.id || `firm-${crypto.randomUUID()}`,
    };
    const rows = await this.db
      .insert(schema.firms)
      .values(values as any)
      .onConflictDoUpdate({ target: schema.firms.id, set: values as any })
      .returning();
    return rows[0];
  }

  public async listFirms(query?: {
    search?: string;
    status?: string;
    page?: number;
    limit?: number;
    includeDeleted?: boolean;
  }): Promise<{ firms: schema.Firm[]; total: number; page: number; limit: number }> {
    const page = Math.max(1, query?.page || 1);
    const limit = Math.max(1, Math.min(100, query?.limit || 20));
    const offset = (page - 1) * limit;

    const conditions: any[] = [];
    if (!query?.includeDeleted) {
      conditions.push(isNull(schema.firms.deletedAt));
    }
    if (query?.status && query.status !== 'all') {
      conditions.push(eq(schema.firms.status, query.status as any));
    }
    if (query?.search && query.search.trim()) {
      const q = `%${query.search.trim()}%`;
      conditions.push(
        or(
          ilike(schema.firms.name, q),
          ilike(schema.firms.firmId, q),
          ilike(schema.firms.contact, q),
          ilike(schema.firms.officeAddress, q),
          ilike(schema.firms.barCouncilReg, q)
        )
      );
    }

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    const totalRes = await this.db
      .select({ count: sql<number>`count(*)::int` })
      .from(schema.firms)
      .where(whereClause);
    const total = Number(totalRes[0]?.count || 0);

    const rows = await this.db
      .select()
      .from(schema.firms)
      .where(whereClause)
      .orderBy(desc(schema.firms.createdAt))
      .limit(limit)
      .offset(offset);

    return { firms: rows, total, page, limit };
  }

  public async getPlan(id: string): Promise<schema.Plan | null> {
    const rows = await this.db
      .select()
      .from(schema.plans)
      .where(eq(schema.plans.id, id))
      .limit(1);
    return rows[0] || null;
  }

  public async listPlans(): Promise<schema.Plan[]> {
    return this.db
      .select()
      .from(schema.plans)
      .where(isNull(schema.plans.deletedAt));
  }

  public async insertPlan(plan: schema.Plan): Promise<schema.Plan> {
    const rows = await this.db
      .insert(schema.plans)
      .values(plan)
      .onConflictDoUpdate({ target: schema.plans.id, set: plan })
      .returning();
    return rows[0];
  }

  public async updatePlan(id: string, updates: Partial<schema.Plan>): Promise<schema.Plan> {
    const rows = await this.db
      .update(schema.plans)
      .set({
        ...updates,
        updatedAt: new Date(),
      })
      .where(and(eq(schema.plans.id, id), isNull(schema.plans.deletedAt)))
      .returning();
    if (!rows[0]) {
      throw new Error(`Plan ${id} not found`);
    }
    return rows[0];
  }

  public async getUserByEmail(email: string): Promise<schema.User | null> {
    const rows = await this.db
      .select()
      .from(schema.users)
      .where(and(eq(schema.users.email, email.toLowerCase()), isNull(schema.users.deletedAt)))
      .limit(1);
    return rows[0] || null;
  }

  public async getUserById(id: string): Promise<schema.User | null> {
    const rows = await this.db
      .select()
      .from(schema.users)
      .where(and(eq(schema.users.id, id), isNull(schema.users.deletedAt)))
      .limit(1);
    return rows[0] || null;
  }

  public async listUsers(firmId: string): Promise<schema.User[]> {
    return this.db
      .select()
      .from(schema.users)
      .where(and(eq(schema.users.firmId, firmId), isNull(schema.users.deletedAt)));
  }

  public async insertUser(user: schema.User | schema.NewUser): Promise<schema.User> {
    const values = {
      ...user,
      id: user.id || `user-${crypto.randomUUID()}`,
    };
    const rows = await this.db
      .insert(schema.users)
      .values(values as any)
      .onConflictDoUpdate({ target: schema.users.id, set: values as any })
      .returning();
    return rows[0];
  }

  public async updateUser(id: string, updates: Partial<schema.User>): Promise<schema.User> {
    const rows = await this.db
      .update(schema.users)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(schema.users.id, id))
      .returning();
    if (!rows[0]) throw new Error(`User not found: ${id}`);
    return rows[0];
  }

  public async incrementFailedLogin(
    id: string,
    lockedUntil: Date | null
  ): Promise<{ failedLoginAttempts: number; lockedUntil: Date | null }> {
    const res = await this.pool.query(
      `UPDATE users
       SET failed_login_attempts = failed_login_attempts + 1,
           locked_until = $2,
           updated_at = NOW()
       WHERE id = $1
       RETURNING failed_login_attempts, locked_until`,
      [id, lockedUntil]
    );
    if (res.rows.length === 0) throw new Error(`User not found: ${id}`);
    return {
      failedLoginAttempts: res.rows[0].failed_login_attempts,
      lockedUntil: res.rows[0].locked_until,
    };
  }

  public async resetFailedLogin(id: string): Promise<void> {
    await this.pool.query(
      `UPDATE users
       SET failed_login_attempts = 0,
           locked_until = NULL,
           updated_at = NOW()
       WHERE id = $1`,
      [id]
    );
  }

  public async insertAudit(entry: schema.AuditLogEntry): Promise<schema.AuditLogEntry> {
    const rows = await this.db
      .insert(schema.auditLog)
      .values(entry)
      .onConflictDoUpdate({ target: schema.auditLog.id, set: entry })
      .returning();
    return rows[0];
  }

  private async buildPostgresCaseCondition(
    firmId: string,
    user?: VisibilityUserContext,
    includeRestricted = true,
    includeDeleted = false
  ) {
    if (user) {
      const firm = (await this.getFirm(firmId)) || { id: firmId, visibilityMode: 'open' };
      const firmUsers = await this.listUsers(firmId);
      const visSql = buildCaseVisibilitySql(user, firm, firmUsers, includeDeleted);
      if (!includeRestricted) {
        return and(visSql, eq(schema.cases.restricted, false))!;
      }
      return visSql;
    }
    const base = [eq(schema.cases.firmId, firmId)];
    if (!includeDeleted) {
      base.push(isNull(schema.cases.deletedAt));
    }
    if (!includeRestricted) {
      base.push(eq(schema.cases.restricted, false));
    }
    return and(...base)!;
  }

  public async listAudit(
    firmId: string,
    limit = 100,
    offset = 0,
    includeRestricted = true,
    user?: VisibilityUserContext,
    filter?: {
      entity?: string;
      action?: string;
      userId?: string;
      startDate?: string;
      endDate?: string;
    }
  ): Promise<schema.AuditLogEntry[]> {
    const conditions = [eq(schema.auditLog.firmId, firmId)];
    if (user || !includeRestricted) {
      const caseCond = await this.buildPostgresCaseCondition(firmId, user, includeRestricted, true);
      conditions.push(
        sql`(${schema.auditLog.entity} != 'Case' OR ${schema.auditLog.entityId} IN (SELECT id FROM ${schema.cases} WHERE ${caseCond}))`
      );
    }
    if (filter?.entity) {
      conditions.push(sql`lower(${schema.auditLog.entity}) = lower(${filter.entity})`);
    }
    if (filter?.action) {
      conditions.push(sql`lower(${schema.auditLog.action}) = lower(${filter.action})`);
    }
    if (filter?.userId) {
      conditions.push(eq(schema.auditLog.userId, filter.userId));
    }
    if (filter?.startDate) {
      const start = new Date(filter.startDate);
      if (!isNaN(start.getTime())) {
        conditions.push(gte(schema.auditLog.timestamp, start));
      }
    }
    if (filter?.endDate) {
      const end = new Date(filter.endDate);
      if (!isNaN(end.getTime())) {
        conditions.push(lte(schema.auditLog.timestamp, end));
      }
    }
    return this.db
      .select()
      .from(schema.auditLog)
      .where(and(...conditions))
      .orderBy(desc(schema.auditLog.timestamp))
      .limit(limit)
      .offset(offset);
  }

  // Clients Methods
  public async listClients(firmId: string, search?: string, user?: VisibilityUserContext): Promise<schema.Client[]> {
    let visibilitySql: SQL | undefined;
    if (user) {
      const firm = (await this.getFirm(firmId)) || { id: firmId, visibilityMode: 'open' };
      const firmUsers = await this.listUsers(firmId);
      visibilitySql = buildClientVisibilitySql(user, firm, firmUsers);
    }

    const conditions = [
      visibilitySql || and(eq(schema.clients.firmId, firmId), isNull(schema.clients.deletedAt))!,
    ];

    if (search && search.trim()) {
      const q = `%${search.trim()}%`;
      conditions.push(
        or(
          ilike(schema.clients.name, q),
          ilike(schema.clients.nameBn, q),
          ilike(schema.clients.phone, q),
          ilike(schema.clients.address, q)
        )!
      );
    }

    const rows = await this.db
      .select({
        client: schema.clients,
        hasPhoto: sql<boolean>`CASE WHEN ${schema.clientPhotos.clientId} IS NOT NULL THEN true ELSE false END`,
      })
      .from(schema.clients)
      .leftJoin(schema.clientPhotos, eq(schema.clients.id, schema.clientPhotos.clientId))
      .where(and(...conditions))
      .orderBy(desc(schema.clients.createdAt));

    return rows.map((r) => ({
      ...r.client,
      hasPhoto: Boolean(r.hasPhoto),
    }));
  }

  public async getClientById(id: string, firmId: string, user?: VisibilityUserContext, includeDeleted = false): Promise<schema.Client | null> {
    const conditions = [
      eq(schema.clients.id, id),
      eq(schema.clients.firmId, firmId),
    ];
    if (!includeDeleted) {
      conditions.push(isNull(schema.clients.deletedAt)!);
    }
    if (user) {
      const firm = (await this.getFirm(firmId)) || { id: firmId, visibilityMode: 'open' };
      const firmUsers = await this.listUsers(firmId);
      conditions.push(buildClientVisibilitySql(user, firm, firmUsers));
    }
    const rows = await this.db
      .select({
        client: schema.clients,
        hasPhoto: sql<boolean>`CASE WHEN ${schema.clientPhotos.clientId} IS NOT NULL THEN true ELSE false END`,
      })
      .from(schema.clients)
      .leftJoin(schema.clientPhotos, eq(schema.clients.id, schema.clientPhotos.clientId))
      .where(and(...conditions))
      .limit(1);
    if (!rows[0]) return null;
    return {
      ...rows[0].client,
      hasPhoto: Boolean(rows[0].hasPhoto),
    };
  }

  public async insertClient(client: schema.Client): Promise<schema.Client> {
    const rows = await this.db
      .insert(schema.clients)
      .values(client)
      .onConflictDoUpdate({ target: schema.clients.id, set: client })
      .returning();
    return rows[0];
  }

  public async updateClient(id: string, firmId: string, updates: Partial<schema.Client>): Promise<schema.Client> {
    const rows = await this.db
      .update(schema.clients)
      .set({ ...updates, updatedAt: new Date() })
      .where(and(eq(schema.clients.id, id), eq(schema.clients.firmId, firmId)))
      .returning();
    if (!rows[0]) throw new Error(`Client not found: ${id}`);
    const photoRow = await this.db
      .select({ clientId: schema.clientPhotos.clientId })
      .from(schema.clientPhotos)
      .where(and(eq(schema.clientPhotos.clientId, id), eq(schema.clientPhotos.firmId, firmId)))
      .limit(1);
    return {
      ...rows[0],
      hasPhoto: photoRow.length > 0,
    };
  }

  public async countActiveCasesForClient(clientId: string, firmId: string): Promise<number> {
    const rows = await this.db
      .select()
      .from(schema.cases)
      .where(
        and(
          eq(schema.cases.clientId, clientId),
          eq(schema.cases.firmId, firmId),
          isNull(schema.cases.deletedAt),
          eq(schema.cases.status, 'ongoing')
        )
      );
    return rows.length;
  }

  public async getClientLinkedOverview(
    clientId: string,
    firmId: string,
    includeRestricted = true,
    user?: VisibilityUserContext
  ): Promise<ClientLinkedOverview> {
    const visCond = await this.buildPostgresCaseCondition(firmId, user, includeRestricted);
    const conditions = [
      eq(schema.cases.clientId, clientId),
      visCond,
    ];

    const clientCases = await this.db
      .select()
      .from(schema.cases)
      .where(and(...conditions));

    const taskConditions = [
      eq(schema.tasks.clientId, clientId),
      eq(schema.tasks.firmId, firmId),
      isNull(schema.tasks.deletedAt),
      sql`(${schema.tasks.caseId} IS NULL OR ${schema.tasks.caseId} IN (SELECT id FROM ${schema.cases} WHERE ${visCond}))`,
    ];
    const clientTasks = await this.db
      .select()
      .from(schema.tasks)
      .where(and(...taskConditions));

    const fileConditions = [
      eq(schema.physicalFiles.clientId, clientId),
      eq(schema.physicalFiles.firmId, firmId),
      isNull(schema.physicalFiles.deletedAt),
      sql`(${schema.physicalFiles.caseId} IS NULL OR ${schema.physicalFiles.caseId} IN (SELECT id FROM ${schema.cases} WHERE ${visCond}))`,
    ];
    const clientFiles = await this.db
      .select({
        file: schema.physicalFiles,
        holderName: schema.users.name,
      })
      .from(schema.physicalFiles)
      .leftJoin(schema.users, eq(schema.physicalFiles.currentHolderId, schema.users.id))
      .where(and(...fileConditions));

    return {
      cases: clientCases.map((c) => ({
        id: c.id,
        caseNumber: c.caseNumber,
        court: c.court,
        matterType: c.matterType,
        status: c.status === 'ongoing' ? 'Ongoing' : c.status === 'pending' ? 'Pending' : 'Closed',
      })),
      tasks: clientTasks.map((t) => ({
        id: t.id,
        title: t.title,
        priority: t.priority,
        status: t.status,
        dueAt: new Date(t.dueAt).toISOString(),
      })),
      files: clientFiles.map((row) => ({
        id: row.file.id,
        serial: row.file.serial,
        title: row.file.title,
        status: row.file.status,
        holderName: row.holderName || 'Chamber Archive',
      })),
    };
  }

  // Client Photos Methods
  public async getClientPhoto(clientId: string, firmId: string): Promise<schema.ClientPhoto | null> {
    const rows = await this.db
      .select()
      .from(schema.clientPhotos)
      .where(and(eq(schema.clientPhotos.clientId, clientId), eq(schema.clientPhotos.firmId, firmId)))
      .limit(1);
    return rows[0] || null;
  }

  public async upsertClientPhoto(photo: schema.ClientPhoto): Promise<schema.ClientPhoto> {
    const rows = await this.db
      .insert(schema.clientPhotos)
      .values(photo)
      .onConflictDoUpdate({
        target: schema.clientPhotos.clientId,
        set: {
          mime: photo.mime,
          bytes: photo.bytes,
          updatedAt: new Date(),
        },
      })
      .returning();
    return rows[0];
  }

  public async deleteClientPhoto(clientId: string, firmId: string): Promise<void> {
    await this.db
      .delete(schema.clientPhotos)
      .where(and(eq(schema.clientPhotos.clientId, clientId), eq(schema.clientPhotos.firmId, firmId)));
  }

  // Client Notes Methods
  public async listClientNotes(
    clientId: string,
    firmId: string,
    limit = 50,
    offset = 0
  ): Promise<{ notes: schema.ClientNote[]; total: number }> {
    const whereCond = and(
      eq(schema.clientNotes.clientId, clientId),
      eq(schema.clientNotes.firmId, firmId),
      isNull(schema.clientNotes.deletedAt)
    );
    const [notes, countRes] = await Promise.all([
      this.db
        .select()
        .from(schema.clientNotes)
        .where(whereCond)
        .orderBy(desc(schema.clientNotes.noteDate), desc(schema.clientNotes.createdAt))
        .limit(limit)
        .offset(offset),
      this.db
        .select({ count: sql<number>`count(*)::int` })
        .from(schema.clientNotes)
        .where(whereCond),
    ]);
    return { notes, total: countRes[0]?.count || 0 };
  }

  public async getClientNoteById(
    noteId: string,
    clientId: string,
    firmId: string
  ): Promise<schema.ClientNote | null> {
    const rows = await this.db
      .select()
      .from(schema.clientNotes)
      .where(
        and(
          eq(schema.clientNotes.id, noteId),
          eq(schema.clientNotes.clientId, clientId),
          eq(schema.clientNotes.firmId, firmId),
          isNull(schema.clientNotes.deletedAt)
        )
      )
      .limit(1);
    return rows[0] || null;
  }

  public async insertClientNote(note: schema.ClientNote): Promise<schema.ClientNote> {
    const rows = await this.db.insert(schema.clientNotes).values(note).returning();
    return rows[0];
  }

  public async updateClientNote(
    noteId: string,
    clientId: string,
    firmId: string,
    updates: Partial<schema.ClientNote>
  ): Promise<schema.ClientNote> {
    const rows = await this.db
      .update(schema.clientNotes)
      .set({ ...updates, updatedAt: new Date() })
      .where(
        and(
          eq(schema.clientNotes.id, noteId),
          eq(schema.clientNotes.clientId, clientId),
          eq(schema.clientNotes.firmId, firmId),
          isNull(schema.clientNotes.deletedAt)
        )
      )
      .returning();
    if (!rows[0]) throw new Error(`Client note not found: ${noteId}`);
    return rows[0];
  }

  public async deleteClientNote(
    noteId: string,
    clientId: string,
    firmId: string,
    updatedBy?: string
  ): Promise<void> {
    await this.db
      .update(schema.clientNotes)
      .set({ deletedAt: new Date(), updatedAt: new Date(), ...(updatedBy ? { updatedBy } : {}) })
      .where(
        and(
          eq(schema.clientNotes.id, noteId),
          eq(schema.clientNotes.clientId, clientId),
          eq(schema.clientNotes.firmId, firmId),
          isNull(schema.clientNotes.deletedAt)
        )
      );
  }

  // Case Notes Methods
  public async listCaseNotes(
    caseId: string,
    firmId: string,
    limit = 50,
    offset = 0
  ): Promise<{ notes: schema.CaseNote[]; total: number }> {
    const whereCond = and(
      eq(schema.caseNotes.caseId, caseId),
      eq(schema.caseNotes.firmId, firmId),
      isNull(schema.caseNotes.deletedAt)
    );
    const [notes, countRes] = await Promise.all([
      this.db
        .select()
        .from(schema.caseNotes)
        .where(whereCond)
        .orderBy(desc(schema.caseNotes.noteDate), desc(schema.caseNotes.createdAt))
        .limit(limit)
        .offset(offset),
      this.db
        .select({ count: sql<number>`count(*)::int` })
        .from(schema.caseNotes)
        .where(whereCond),
    ]);
    return { notes, total: countRes[0]?.count || 0 };
  }

  public async getCaseNoteById(
    noteId: string,
    caseId: string,
    firmId: string
  ): Promise<schema.CaseNote | null> {
    const rows = await this.db
      .select()
      .from(schema.caseNotes)
      .where(
        and(
          eq(schema.caseNotes.id, noteId),
          eq(schema.caseNotes.caseId, caseId),
          eq(schema.caseNotes.firmId, firmId),
          isNull(schema.caseNotes.deletedAt)
        )
      )
      .limit(1);
    return rows[0] || null;
  }

  public async insertCaseNote(note: schema.CaseNote): Promise<schema.CaseNote> {
    const rows = await this.db.insert(schema.caseNotes).values(note).returning();
    return rows[0];
  }

  public async updateCaseNote(
    noteId: string,
    caseId: string,
    firmId: string,
    updates: Partial<schema.CaseNote>
  ): Promise<schema.CaseNote> {
    const rows = await this.db
      .update(schema.caseNotes)
      .set({ ...updates, updatedAt: new Date() })
      .where(
        and(
          eq(schema.caseNotes.id, noteId),
          eq(schema.caseNotes.caseId, caseId),
          eq(schema.caseNotes.firmId, firmId),
          isNull(schema.caseNotes.deletedAt)
        )
      )
      .returning();
    if (!rows[0]) throw new Error(`Case note not found: ${noteId}`);
    return rows[0];
  }

  public async deleteCaseNote(
    noteId: string,
    caseId: string,
    firmId: string,
    updatedBy?: string
  ): Promise<void> {
    await this.db
      .update(schema.caseNotes)
      .set({ deletedAt: new Date(), updatedAt: new Date(), ...(updatedBy ? { updatedBy } : {}) })
      .where(
        and(
          eq(schema.caseNotes.id, noteId),
          eq(schema.caseNotes.caseId, caseId),
          eq(schema.caseNotes.firmId, firmId),
          isNull(schema.caseNotes.deletedAt)
        )
      );
  }

  // Cases Methods
  public async listCases(
    firmId: string,
    filter?: {
      search?: string;
      status?: 'ongoing' | 'pending' | 'closed' | 'all';
      court?: string;
      matterType?: string;
      clientId?: string;
      includeRestricted?: boolean;
      user?: VisibilityUserContext;
      scope?: 'my' | 'team' | 'all';
      sortBy?: 'caseDate' | 'createdAt' | 'caseNumber';
      sortOrder?: 'asc' | 'desc';
    }
  ): Promise<Array<schema.Case & { latestNote?: { noteDate: string; body: string } | null }>> {
    const visCond = await this.buildPostgresCaseCondition(
      firmId,
      filter?.user,
      filter?.includeRestricted ?? true
    );
    const conditions = [visCond];

    if (filter?.user && filter?.scope) {
      const uid = filter.user.id;
      if (filter.scope === 'my') {
        conditions.push(or(eq(schema.cases.responsibleLawyerId, uid), eq(schema.cases.createdBy, uid))!);
      } else if (filter.scope === 'team') {
        const firmUsers = await this.listUsers(firmId);
        const me = firmUsers.find((u) => u.id === uid);
        const teamIds = new Set<string>([uid]);
        if (me?.reportsToUserId) teamIds.add(me.reportsToUserId);
        for (const u of firmUsers) {
          if (u.reportsToUserId === uid) teamIds.add(u.id);
        }
        const teamArr = Array.from(teamIds);
        conditions.push(
          sql`${schema.cases.responsibleLawyerId} IN (${sql.join(
            teamArr.map((id) => sql`${id}`),
            sql`, `
          )})`
        );
      }
    }

    if (filter?.clientId) {
      conditions.push(eq(schema.cases.clientId, filter.clientId));
    }

    if (filter?.status && filter.status !== 'all') {
      conditions.push(eq(schema.cases.status, filter.status));
    }

    if (filter?.court && filter.court !== 'ALL') {
      conditions.push(ilike(schema.cases.court, `%${filter.court}%`));
    }

    if (filter?.matterType && filter.matterType !== 'ALL') {
      conditions.push(ilike(schema.cases.matterType, `%${filter.matterType}%`));
    }

    if (filter?.search && filter.search.trim()) {
      const q = `%${filter.search.trim()}%`;
      conditions.push(
        or(
          ilike(schema.cases.caseNumber, q),
          ilike(schema.cases.plaintiff, q),
          ilike(schema.cases.defendant, q),
          ilike(schema.cases.court, q),
          ilike(schema.cases.matterType, q),
          ilike(schema.cases.fileSerial, q),
          ilike(schema.cases.plaintiffLawyer, q),
          ilike(schema.cases.defendantLawyer, q)
        )!
      );
    }

    const sortBy = filter?.sortBy || 'createdAt';
    const sortOrder = filter?.sortOrder || 'desc';
    const orderClause =
      sortBy === 'caseDate'
        ? sortOrder === 'asc' ? sql`${schema.cases.caseDate} ASC NULLS LAST` : sql`${schema.cases.caseDate} DESC NULLS LAST`
        : sortOrder === 'asc' ? sql`${schema.cases.createdAt} ASC` : sql`${schema.cases.createdAt} DESC`;

    const caseRows = await this.db
      .select()
      .from(schema.cases)
      .where(and(...conditions))
      .orderBy(orderClause);

    // Fetch latest notes for returned cases
    const result: Array<schema.Case & { latestNote?: { noteDate: string; body: string } | null }> = [];
    for (const c of caseRows) {
      const notes = await this.db
        .select({ noteDate: schema.caseNotes.noteDate, body: schema.caseNotes.body })
        .from(schema.caseNotes)
        .where(and(eq(schema.caseNotes.caseId, c.id), eq(schema.caseNotes.firmId, firmId), isNull(schema.caseNotes.deletedAt)))
        .orderBy(desc(schema.caseNotes.noteDate), desc(schema.caseNotes.createdAt))
        .limit(1);
      result.push({
        ...c,
        latestNote: notes[0] || null,
      });
    }

    return result;
  }

  public async getCaseById(
    id: string,
    firmId: string,
    user?: VisibilityUserContext
  ): Promise<schema.Case | null> {
    const visCond = await this.buildPostgresCaseCondition(firmId, user, true);
    const rows = await this.db
      .select()
      .from(schema.cases)
      .where(and(eq(schema.cases.id, id), visCond))
      .limit(1);
    return rows[0] || null;
  }

  public async insertCase(c: schema.Case): Promise<schema.Case> {
    const rows = await this.db.insert(schema.cases).values(c).returning();
    return rows[0];
  }

  public async updateCase(id: string, firmId: string, updates: Partial<schema.Case>): Promise<schema.Case> {
    const rows = await this.db
      .update(schema.cases)
      .set({ ...updates, updatedAt: new Date() })
      .where(and(eq(schema.cases.id, id), eq(schema.cases.firmId, firmId)))
      .returning();
    if (!rows[0]) throw new Error(`Case not found: ${id}`);
    return rows[0];
  }

  public async checkDuplicateCase(
    firmId: string,
    caseNumber: string,
    court: string,
    excludeId?: string,
    includeRestricted = true,
    user?: VisibilityUserContext
  ): Promise<boolean> {
    const visCond = await this.buildPostgresCaseCondition(firmId, user, includeRestricted);
    const conditions = [
      visCond,
      ilike(schema.cases.caseNumber, caseNumber.trim()),
      ilike(schema.cases.court, court.trim()),
    ];
    if (excludeId) {
      conditions.push(ne(schema.cases.id, excludeId));
    }
    const rows = await this.db
      .select({ id: schema.cases.id })
      .from(schema.cases)
      .where(and(...conditions))
      .limit(1);
    return rows.length > 0;
  }

  public async getCaseLinkedCounts(caseId: string, firmId: string): Promise<CaseLinkedCounts> {
    const hearingsRows = await this.db
      .select({ id: schema.hearings.id })
      .from(schema.hearings)
      .where(
        and(
          eq(schema.hearings.caseId, caseId),
          eq(schema.hearings.firmId, firmId),
          isNull(schema.hearings.deletedAt)
        )
      );
    const tasksRows = await this.db
      .select({ id: schema.tasks.id })
      .from(schema.tasks)
      .where(
        and(
          eq(schema.tasks.caseId, caseId),
          eq(schema.tasks.firmId, firmId),
          isNull(schema.tasks.deletedAt),
          ne(schema.tasks.status, 'cancelled')
        )
      );
    const filesRows = await this.db
      .select({ id: schema.physicalFiles.id })
      .from(schema.physicalFiles)
      .where(
        and(
          eq(schema.physicalFiles.caseId, caseId),
          eq(schema.physicalFiles.firmId, firmId),
          isNull(schema.physicalFiles.deletedAt)
        )
      );
    const apptsRows = await this.db
      .select({ id: schema.appointments.id })
      .from(schema.appointments)
      .where(
        and(
          eq(schema.appointments.caseId, caseId),
          eq(schema.appointments.firmId, firmId),
          isNull(schema.appointments.deletedAt)
        )
      );
    const sourceIds = [
      caseId,
      ...hearingsRows.map((r) => r.id),
      ...tasksRows.map((r) => r.id),
      ...filesRows.map((r) => r.id),
      ...apptsRows.map((r) => r.id),
    ];
    const remindersRows =
      sourceIds.length > 0
        ? await this.db
            .select({ id: schema.reminders.id })
            .from(schema.reminders)
            .where(
              and(
                eq(schema.reminders.firmId, firmId),
                isNull(schema.reminders.deletedAt),
                eq(schema.reminders.status, 'pending'),
                inArray(schema.reminders.sourceId, sourceIds)
              )
            )
        : [];
    return {
      hearingsCount: hearingsRows.length,
      tasksCount: tasksRows.length,
      filesCount: filesRows.length,
      remindersCount: remindersRows.length,
    };
  }

  public async listCaseShares(caseId: string, firmId: string): Promise<schema.CaseShare[]> {
    return this.db
      .select()
      .from(schema.caseShares)
      .where(
        and(
          eq(schema.caseShares.caseId, caseId),
          eq(schema.caseShares.firmId, firmId),
          isNull(schema.caseShares.deletedAt)
        )
      );
  }

  public async listFirmCaseShares(firmId: string): Promise<schema.CaseShare[]> {
    return this.db
      .select()
      .from(schema.caseShares)
      .where(and(eq(schema.caseShares.firmId, firmId), isNull(schema.caseShares.deletedAt)));
  }

  public async insertCaseShare(share: schema.NewCaseShare): Promise<schema.CaseShare> {
    const existing = await this.db
      .select()
      .from(schema.caseShares)
      .where(
        and(
          eq(schema.caseShares.caseId, share.caseId),
          eq(schema.caseShares.userId, share.userId),
          eq(schema.caseShares.firmId, share.firmId),
          isNull(schema.caseShares.deletedAt)
        )
      )
      .limit(1);
    if (existing[0]) return existing[0];
    const rows = await this.db
      .insert(schema.caseShares)
      .values({
        ...share,
        id: share.id || `share-${crypto.randomUUID()}`,
      })
      .returning();
    return rows[0];
  }

  public async deleteCaseShare(id: string, firmId: string): Promise<void> {
    await this.db
      .update(schema.caseShares)
      .set({ deletedAt: new Date() })
      .where(and(eq(schema.caseShares.id, id), eq(schema.caseShares.firmId, firmId)));
  }

  public async listHearings(
    firmId: string,
    filter?: {
      caseId?: string;
      status?: string;
      fromDate?: string;
      toDate?: string;
      fixedFor?: string;
    },
    user?: VisibilityUserContext
  ): Promise<schema.Hearing[]> {
    const visCond = await this.buildPostgresCaseCondition(firmId, user, true);
    const conditions = [
      eq(schema.hearings.firmId, firmId),
      isNull(schema.hearings.deletedAt),
      sql`${schema.hearings.caseId} IN (SELECT id FROM ${schema.cases} WHERE ${visCond})`,
    ];
    if (filter?.caseId) {
      conditions.push(eq(schema.hearings.caseId, filter.caseId));
    }
    if (filter?.status) {
      conditions.push(eq(schema.hearings.status, filter.status as any));
    }
    if (filter?.fixedFor) {
      conditions.push(eq(schema.hearings.fixedFor, filter.fixedFor));
    }
    if (filter?.fromDate) {
      conditions.push(gte(schema.hearings.scheduledAt, new Date(filter.fromDate)));
    }
    if (filter?.toDate) {
      conditions.push(lte(schema.hearings.scheduledAt, new Date(filter.toDate)));
    }
    return this.db
      .select()
      .from(schema.hearings)
      .where(and(...conditions))
      .orderBy(asc(schema.hearings.scheduledAt));
  }

  public async getHearingById(id: string, firmId: string, user?: VisibilityUserContext): Promise<schema.Hearing | null> {
    const conditions = [
      eq(schema.hearings.id, id),
      eq(schema.hearings.firmId, firmId),
      isNull(schema.hearings.deletedAt),
    ];
    if (user) {
      const visCond = await this.buildPostgresCaseCondition(firmId, user, true);
      conditions.push(sql`${schema.hearings.caseId} IN (SELECT id FROM ${schema.cases} WHERE ${visCond})`);
    }
    const rows = await this.db
      .select()
      .from(schema.hearings)
      .where(and(...conditions))
      .limit(1);
    return rows[0] || null;
  }

  public async insertHearing(hearing: schema.NewHearing): Promise<schema.Hearing> {
    const rows = await this.db
      .insert(schema.hearings)
      .values({
        ...hearing,
        id: hearing.id || `hearing-${crypto.randomUUID()}`,
      })
      .returning();
    return rows[0];
  }

  public async updateHearing(id: string, firmId: string, updates: Partial<schema.Hearing>): Promise<schema.Hearing> {
    const rows = await this.db
      .update(schema.hearings)
      .set({ ...updates, updatedAt: new Date() })
      .where(and(eq(schema.hearings.id, id), eq(schema.hearings.firmId, firmId), isNull(schema.hearings.deletedAt)))
      .returning();
    if (!rows[0]) throw new Error(`Hearing not found: ${id}`);
    return rows[0];
  }

  public async deleteHearing(id: string, firmId: string, updatedBy?: string): Promise<{ success: boolean; softDeleted: true }> {
    const rows = await this.db
      .update(schema.hearings)
      .set({ deletedAt: new Date(), updatedAt: new Date(), updatedBy: updatedBy ?? null })
      .where(and(eq(schema.hearings.id, id), eq(schema.hearings.firmId, firmId), isNull(schema.hearings.deletedAt)))
      .returning();
    if (!rows[0]) throw new Error(`Hearing not found: ${id}`);
    return { success: true, softDeleted: true };
  }

  public async insertHearingDateHistory(history: schema.NewHearingDateHistory): Promise<schema.HearingDateHistory> {
    const rows = await this.db
      .insert(schema.hearingDateHistory)
      .values({
        ...history,
        id: history.id || `hdh-${crypto.randomUUID()}`,
      })
      .returning();
    return rows[0];
  }

  public async listHearingDateHistory(hearingId: string, firmId: string): Promise<schema.HearingDateHistory[]> {
    return this.db
      .select()
      .from(schema.hearingDateHistory)
      .where(and(eq(schema.hearingDateHistory.hearingId, hearingId), eq(schema.hearingDateHistory.firmId, firmId)))
      .orderBy(desc(schema.hearingDateHistory.changedAt));
  }

  // Tasks Methods
  public async listTasks(
    firmId: string,
    filter?: {
      caseId?: string;
      clientId?: string;
      assignedTo?: string;
      status?: string;
      priority?: string;
      search?: string;
      limit?: number;
      offset?: number;
    },
    user?: VisibilityUserContext
  ): Promise<{ tasks: Array<schema.Task & { assignedToName?: string }>; total: number }> {
    const visCond = await this.buildPostgresCaseCondition(firmId, user, true);
    const conditions = [
      eq(schema.tasks.firmId, firmId),
      isNull(schema.tasks.deletedAt),
      sql`(${schema.tasks.caseId} IS NULL OR ${schema.tasks.caseId} IN (SELECT id FROM ${schema.cases} WHERE ${visCond}))`,
    ];

    if (user && user.role === 'Staff' && !(user.permissions && user.permissions.includes('tasks.assign'))) {
      conditions.push(eq(schema.tasks.assignedTo, user.id));
    } else if (filter?.assignedTo) {
      conditions.push(eq(schema.tasks.assignedTo, filter.assignedTo));
    }

    if (filter?.caseId) {
      conditions.push(eq(schema.tasks.caseId, filter.caseId));
    }
    if (filter?.clientId) {
      conditions.push(eq(schema.tasks.clientId, filter.clientId));
    }
    if (filter?.priority) {
      conditions.push(eq(schema.tasks.priority, filter.priority as any));
    }
    if (filter?.status) {
      if (filter.status === 'active') {
        conditions.push(sql`(${schema.tasks.status} = 'pending' OR ${schema.tasks.status} = 'in_progress')`);
      } else {
        conditions.push(eq(schema.tasks.status, filter.status as any));
      }
    }
    if (filter?.search) {
      const q = `%${filter.search.trim().toLowerCase()}%`;
      conditions.push(
        sql`(${schema.tasks.title} ILIKE ${q} OR ${schema.tasks.description} ILIKE ${q})`
      );
    }

    const allRows = await this.db
      .select({
        task: schema.tasks,
        assignedToName: schema.users.name,
      })
      .from(schema.tasks)
      .leftJoin(schema.users, eq(schema.tasks.assignedTo, schema.users.id))
      .where(and(...conditions))
      .orderBy(asc(schema.tasks.dueAt));

    const total = allRows.length;
    const limit = filter?.limit || 50;
    const offset = filter?.offset || 0;
    const paged = allRows.slice(offset, offset + limit);

    return {
      tasks: paged.map((r) => ({
        ...r.task,
        assignedToName: r.assignedToName || 'Unknown User',
      })),
      total,
    };
  }

  public async getTaskById(
    id: string,
    firmId: string,
    user?: VisibilityUserContext
  ): Promise<(schema.Task & { assignedToName?: string }) | null> {
    const conditions = [
      eq(schema.tasks.id, id),
      eq(schema.tasks.firmId, firmId),
      isNull(schema.tasks.deletedAt),
    ];

    if (user && user.role === 'Staff' && !(user.permissions && user.permissions.includes('tasks.assign'))) {
      conditions.push(eq(schema.tasks.assignedTo, user.id));
    }

    if (user) {
      const visCond = await this.buildPostgresCaseCondition(firmId, user, true);
      conditions.push(sql`(${schema.tasks.caseId} IS NULL OR ${schema.tasks.caseId} IN (SELECT id FROM ${schema.cases} WHERE ${visCond}))`);
    }

    const rows = await this.db
      .select({
        task: schema.tasks,
        assignedToName: schema.users.name,
      })
      .from(schema.tasks)
      .leftJoin(schema.users, eq(schema.tasks.assignedTo, schema.users.id))
      .where(and(...conditions))
      .limit(1);

    if (!rows[0]) return null;
    return {
      ...rows[0].task,
      assignedToName: rows[0].assignedToName || 'Unknown User',
    };
  }

  public async insertTask(task: schema.NewTask): Promise<schema.Task & { assignedToName?: string }> {
    const taskId = task.id || crypto.randomUUID();
    const rows = await this.db
      .insert(schema.tasks)
      .values({ ...task, id: taskId })
      .returning();

    const created = rows[0];
    const userRows = await this.db
      .select({ name: schema.users.name })
      .from(schema.users)
      .where(eq(schema.users.id, created.assignedTo))
      .limit(1);

    return {
      ...created,
      assignedToName: userRows[0]?.name || 'Unknown User',
    };
  }

  public async updateTask(
    id: string,
    firmId: string,
    updates: Partial<schema.Task>
  ): Promise<schema.Task & { assignedToName?: string }> {
    const rows = await this.db
      .update(schema.tasks)
      .set({ ...updates, updatedAt: new Date() })
      .where(and(eq(schema.tasks.id, id), eq(schema.tasks.firmId, firmId), isNull(schema.tasks.deletedAt)))
      .returning();

    const updated = rows[0];
    if (!updated) throw new Error(`Task not found: ${id}`);

    const userRows = await this.db
      .select({ name: schema.users.name })
      .from(schema.users)
      .where(eq(schema.users.id, updated.assignedTo))
      .limit(1);

    return {
      ...updated,
      assignedToName: userRows[0]?.name || 'Unknown User',
    };
  }

  public async deleteTask(
    id: string,
    firmId: string,
    updatedBy?: string
  ): Promise<{ success: boolean; softDeleted: true }> {
    await this.db
      .update(schema.tasks)
      .set({
        deletedAt: new Date(),
        updatedAt: new Date(),
        ...(updatedBy ? { updatedBy } : {}),
      })
      .where(and(eq(schema.tasks.id, id), eq(schema.tasks.firmId, firmId), isNull(schema.tasks.deletedAt)));

    return { success: true, softDeleted: true };
  }

  // Physical Files & Custody Methods (Phase 8 - PostgreSQL)
  private async resolveHolderNamePostgres(holderId: string | null | undefined): Promise<string | null> {
    if (!holderId) return null;
    const userRows = await this.db
      .select({ name: schema.users.name })
      .from(schema.users)
      .where(eq(schema.users.id, holderId))
      .limit(1);
    return userRows[0]?.name || null;
  }

  public async getNextPhysicalFileSerial(firmId: string): Promise<string> {
    const rows = await this.db
      .select({ serial: schema.physicalFiles.serial })
      .from(schema.physicalFiles)
      .where(eq(schema.physicalFiles.firmId, firmId));

    let maxNumber = 100;
    for (const r of rows) {
      const match = r.serial.match(/^F-(\d+)$/i) || r.serial.match(/(\d+)/);
      if (match) {
        const num = parseInt(match[1], 10);
        if (!Number.isNaN(num) && num > maxNumber) {
          maxNumber = num;
        }
      }
    }
    return `F-${String(maxNumber + 1).padStart(6, '0')}`;
  }

  public async listPhysicalFiles(
    firmId: string,
    filter?: {
      caseId?: string;
      clientId?: string;
      status?: string;
      holderId?: string;
      search?: string;
    },
    user?: VisibilityUserContext
  ): Promise<Array<schema.PhysicalFile & { currentHolderName?: string | null }>> {
    const conditions: SQL[] = [
      eq(schema.physicalFiles.firmId, firmId),
      isNull(schema.physicalFiles.deletedAt),
    ];

    if (user) {
      const includeRestricted =
        user.role === 'Owner' || Boolean(user.permissions?.includes('restricted.view'));
      const visCond = await this.buildPostgresCaseCondition(firmId, user, includeRestricted);
      conditions.push(
        sql`(${schema.physicalFiles.caseId} IS NULL OR ${schema.physicalFiles.caseId} IN (SELECT id FROM ${schema.cases} WHERE ${visCond}))`
      );
    }
    if (filter?.caseId) {
      conditions.push(eq(schema.physicalFiles.caseId, filter.caseId));
    }
    if (filter?.clientId) {
      conditions.push(eq(schema.physicalFiles.clientId, filter.clientId));
    }
    if (filter?.status && filter.status !== 'all') {
      conditions.push(eq(schema.physicalFiles.status, filter.status as any));
    }
    if (filter?.holderId) {
      conditions.push(eq(schema.physicalFiles.currentHolderId, filter.holderId));
    }
    if (filter?.search) {
      const q = `%${filter.search.trim()}%`;
      conditions.push(
        sql`(${schema.physicalFiles.serial} ILIKE ${q} OR ${schema.physicalFiles.title} ILIKE ${q} OR COALESCE(${schema.physicalFiles.shelfLocation}, '') ILIKE ${q} OR COALESCE(${schema.physicalFiles.notes}, '') ILIKE ${q} OR COALESCE(${schema.users.name}, '') ILIKE ${q})`
      );
    }

    const rows = await this.db
      .select({
        file: schema.physicalFiles,
        currentHolderName: schema.users.name,
      })
      .from(schema.physicalFiles)
      .leftJoin(schema.users, eq(schema.physicalFiles.currentHolderId, schema.users.id))
      .where(and(...conditions))
      .orderBy(desc(schema.physicalFiles.updatedAt));

    return rows.map((r) => ({
      ...r.file,
      currentHolderName: r.currentHolderName || null,
    }));
  }

  public async getPhysicalFileById(
    id: string,
    firmId: string
  ): Promise<(schema.PhysicalFile & { currentHolderName?: string | null }) | null> {
    const rows = await this.db
      .select({
        file: schema.physicalFiles,
        currentHolderName: schema.users.name,
      })
      .from(schema.physicalFiles)
      .leftJoin(schema.users, eq(schema.physicalFiles.currentHolderId, schema.users.id))
      .where(
        and(
          eq(schema.physicalFiles.id, id),
          eq(schema.physicalFiles.firmId, firmId),
          isNull(schema.physicalFiles.deletedAt)
        )
      )
      .limit(1);

    if (!rows[0]) return null;
    return {
      ...rows[0].file,
      currentHolderName: rows[0].currentHolderName || null,
    };
  }

  public async getPhysicalFileBySerial(
    serial: string,
    firmId: string
  ): Promise<(schema.PhysicalFile & { currentHolderName?: string | null }) | null> {
    const clean = serial.trim();
    const rows = await this.db
      .select({
        file: schema.physicalFiles,
        currentHolderName: schema.users.name,
      })
      .from(schema.physicalFiles)
      .leftJoin(schema.users, eq(schema.physicalFiles.currentHolderId, schema.users.id))
      .where(
        and(
          eq(schema.physicalFiles.firmId, firmId),
          isNull(schema.physicalFiles.deletedAt),
          ilike(schema.physicalFiles.serial, clean)
        )
      )
      .limit(1);

    if (!rows[0]) return null;
    return {
      ...rows[0].file,
      currentHolderName: rows[0].currentHolderName || null,
    };
  }

  public async getPhysicalFileByCaseId(
    caseId: string,
    firmId: string
  ): Promise<(schema.PhysicalFile & { currentHolderName?: string | null }) | null> {
    const rows = await this.db
      .select({
        file: schema.physicalFiles,
        currentHolderName: schema.users.name,
      })
      .from(schema.physicalFiles)
      .leftJoin(schema.users, eq(schema.physicalFiles.currentHolderId, schema.users.id))
      .where(
        and(
          eq(schema.physicalFiles.caseId, caseId),
          eq(schema.physicalFiles.firmId, firmId),
          isNull(schema.physicalFiles.deletedAt)
        )
      )
      .limit(1);

    if (!rows[0]) return null;
    return {
      ...rows[0].file,
      currentHolderName: rows[0].currentHolderName || null,
    };
  }

  public async insertPhysicalFile(
    file: schema.NewPhysicalFile
  ): Promise<schema.PhysicalFile & { currentHolderName?: string | null }> {
    const id = file.id || crypto.randomUUID();
    const rows = await this.db
      .insert(schema.physicalFiles)
      .values({ ...file, id })
      .returning();

    const created = rows[0];
    const holderName = await this.resolveHolderNamePostgres(created.currentHolderId);
    return {
      ...created,
      currentHolderName: holderName,
    };
  }

  public async updatePhysicalFile(
    id: string,
    firmId: string,
    updates: Partial<schema.PhysicalFile>
  ): Promise<schema.PhysicalFile & { currentHolderName?: string | null }> {
    const rows = await this.db
      .update(schema.physicalFiles)
      .set({ ...updates, updatedAt: new Date() })
      .where(
        and(
          eq(schema.physicalFiles.id, id),
          eq(schema.physicalFiles.firmId, firmId),
          isNull(schema.physicalFiles.deletedAt)
        )
      )
      .returning();

    const updated = rows[0];
    if (!updated) throw new Error(`Physical file not found: ${id}`);
    const holderName = await this.resolveHolderNamePostgres(updated.currentHolderId);
    return {
      ...updated,
      currentHolderName: holderName,
    };
  }

  public async deletePhysicalFile(
    id: string,
    firmId: string,
    updatedBy?: string
  ): Promise<{ success: boolean; softDeleted: true }> {
    await this.db
      .update(schema.physicalFiles)
      .set({
        deletedAt: new Date(),
        updatedAt: new Date(),
        ...(updatedBy ? { updatedBy } : {}),
      })
      .where(
        and(
          eq(schema.physicalFiles.id, id),
          eq(schema.physicalFiles.firmId, firmId),
          isNull(schema.physicalFiles.deletedAt)
        )
      );
    return { success: true, softDeleted: true };
  }

  public async listFileMovements(
    fileId: string,
    firmId: string
  ): Promise<Array<schema.FileMovement & { userName: string }>> {
    const rows = await this.db
      .select({
        movement: schema.fileMovements,
        userName: schema.users.name,
      })
      .from(schema.fileMovements)
      .leftJoin(schema.users, eq(schema.fileMovements.userId, schema.users.id))
      .where(
        and(
          eq(schema.fileMovements.fileId, fileId),
          eq(schema.fileMovements.firmId, firmId)
        )
      )
      .orderBy(desc(schema.fileMovements.at));

    return rows.map((r) => ({
      ...r.movement,
      userName: r.userName || 'Unknown User',
    }));
  }

  public async insertFileMovement(
    movement: schema.NewFileMovement
  ): Promise<schema.FileMovement & { userName: string }> {
    const id = movement.id || crypto.randomUUID();
    const rows = await this.db
      .insert(schema.fileMovements)
      .values({ ...movement, id })
      .returning();

    const created = rows[0];
    const userName = (await this.resolveHolderNamePostgres(created.userId)) || 'Unknown User';
    return {
      ...created,
      userName,
    };
  }

  public async listReminders(
    firmId: string,
    filter?: {
      status?: 'pending' | 'sent' | 'dismissed' | 'active';
      sourceType?: 'hearing' | 'task' | 'file_return' | 'appointment';
      userId?: string;
      search?: string;
      dueOnly?: boolean;
    },
    user?: VisibilityUserContext
  ): Promise<Array<schema.Reminder & { userName?: string }>> {
    const conditions: SQL[] = [
      eq(schema.reminders.firmId, firmId),
      isNull(schema.reminders.deletedAt),
    ];

    if (user?.role === 'Staff') {
      conditions.push(eq(schema.reminders.userId, user.id));
    } else if (filter?.userId) {
      conditions.push(eq(schema.reminders.userId, filter.userId));
    }

    if (filter?.status) {
      if (filter.status === 'active') {
        conditions.push(ne(schema.reminders.status, 'dismissed'));
      } else {
        conditions.push(eq(schema.reminders.status, filter.status));
      }
    }

    if (filter?.sourceType) {
      conditions.push(eq(schema.reminders.sourceType, filter.sourceType));
    }

    if (filter?.dueOnly) {
      conditions.push(lte(schema.reminders.remindAt, new Date()));
    }

    const rows = await this.db
      .select({
        reminder: schema.reminders,
        userName: schema.users.name,
      })
      .from(schema.reminders)
      .leftJoin(schema.users, eq(schema.reminders.userId, schema.users.id))
      .where(and(...conditions))
      .orderBy(asc(schema.reminders.remindAt));

    let items = rows.map((r) => ({
      ...r.reminder,
      userName: r.userName || undefined,
    }));

    if (user) {
      const visibleCases = await this.listCases(firmId, { user, includeRestricted: true });
      const visibleCaseIds = new Set(visibleCases.map((c) => c.id));

      const hearingIds = items.filter((r) => r.sourceType === 'hearing').map((r) => r.sourceId);
      const taskIds = items.filter((r) => r.sourceType === 'task').map((r) => r.sourceId);
      const fileIds = items.filter((r) => r.sourceType === 'file_return').map((r) => r.sourceId);
      const apptIds = items.filter((r) => r.sourceType === 'appointment').map((r) => r.sourceId);

      const [hRows, tRows, fRows, aRows] = await Promise.all([
        hearingIds.length
          ? this.db
              .select({ id: schema.hearings.id, caseId: schema.hearings.caseId })
              .from(schema.hearings)
              .where(and(eq(schema.hearings.firmId, firmId), isNull(schema.hearings.deletedAt), inArray(schema.hearings.id, hearingIds)))
          : Promise.resolve([]),
        taskIds.length
          ? this.db
              .select({ id: schema.tasks.id, caseId: schema.tasks.caseId })
              .from(schema.tasks)
              .where(and(eq(schema.tasks.firmId, firmId), isNull(schema.tasks.deletedAt), inArray(schema.tasks.id, taskIds)))
          : Promise.resolve([]),
        fileIds.length
          ? this.db
              .select({ id: schema.physicalFiles.id, caseId: schema.physicalFiles.caseId })
              .from(schema.physicalFiles)
              .where(and(eq(schema.physicalFiles.firmId, firmId), isNull(schema.physicalFiles.deletedAt), inArray(schema.physicalFiles.id, fileIds)))
          : Promise.resolve([]),
        apptIds.length
          ? this.db
              .select({ id: schema.appointments.id, caseId: schema.appointments.caseId })
              .from(schema.appointments)
              .where(and(eq(schema.appointments.firmId, firmId), isNull(schema.appointments.deletedAt), inArray(schema.appointments.id, apptIds)))
          : Promise.resolve([]),
      ]);

      const hCaseMap = new Map(hRows.map((x) => [x.id, x.caseId]));
      const tCaseMap = new Map(tRows.map((x) => [x.id, x.caseId]));
      const fCaseMap = new Map(fRows.map((x) => [x.id, x.caseId]));
      const aCaseMap = new Map(aRows.map((x) => [x.id, x.caseId]));

      items = items.filter((r) => {
        let caseId: string | null | undefined;
        if (r.sourceType === 'hearing') caseId = hCaseMap.get(r.sourceId);
        else if (r.sourceType === 'task') caseId = tCaseMap.get(r.sourceId);
        else if (r.sourceType === 'file_return') caseId = fCaseMap.get(r.sourceId);
        else if (r.sourceType === 'appointment') caseId = aCaseMap.get(r.sourceId);
        if (caseId && !visibleCaseIds.has(caseId)) return false;
        return true;
      });
    }

    if (filter?.search) {
      const q = filter.search.toLowerCase();
      items = items.filter(
        (r) =>
          r.title.toLowerCase().includes(q) ||
          (r.description && r.description.toLowerCase().includes(q))
      );
    }

    return items;
  }

  public async getReminderById(
    id: string,
    firmId: string
  ): Promise<(schema.Reminder & { userName?: string }) | null> {
    const rows = await this.db
      .select({
        reminder: schema.reminders,
        userName: schema.users.name,
      })
      .from(schema.reminders)
      .leftJoin(schema.users, eq(schema.reminders.userId, schema.users.id))
      .where(and(eq(schema.reminders.id, id), eq(schema.reminders.firmId, firmId), isNull(schema.reminders.deletedAt)))
      .limit(1);
    if (!rows[0]) return null;
    return {
      ...rows[0].reminder,
      userName: rows[0].userName || undefined,
    };
  }

  public async insertReminder(
    reminder: schema.NewReminder
  ): Promise<schema.Reminder & { userName?: string }> {
    const id = reminder.id || crypto.randomUUID();
    const rows = await this.db
      .insert(schema.reminders)
      .values({ ...reminder, id })
      .returning();
    const created = rows[0];
    const userName = await this.resolveHolderNamePostgres(created.userId);
    return {
      ...created,
      userName: userName || undefined,
    };
  }

  public async updateReminder(
    id: string,
    firmId: string,
    updates: Partial<schema.Reminder>
  ): Promise<schema.Reminder & { userName?: string }> {
    const rows = await this.db
      .update(schema.reminders)
      .set({ ...updates, updatedAt: updates.updatedAt ?? new Date() })
      .where(and(eq(schema.reminders.id, id), eq(schema.reminders.firmId, firmId), isNull(schema.reminders.deletedAt)))
      .returning();
    if (!rows[0]) throw new Error(`Reminder not found: ${id}`);
    const userName = await this.resolveHolderNamePostgres(rows[0].userId);
    return {
      ...rows[0],
      userName: userName || undefined,
    };
  }

  public async dismissRemindersBySource(
    firmId: string,
    sourceId: string,
    updatedBy?: string,
    softDelete = false,
    userIdRestrict?: string
  ): Promise<number> {
    const now = new Date();
    const conditions: SQL[] = [
      eq(schema.reminders.firmId, firmId),
      eq(schema.reminders.sourceId, sourceId),
      isNull(schema.reminders.deletedAt),
      ne(schema.reminders.status, 'dismissed'),
    ];
    if (userIdRestrict) {
      conditions.push(eq(schema.reminders.userId, userIdRestrict));
    }
    const updated = await this.db
      .update(schema.reminders)
      .set({
        status: 'dismissed',
        dismissedAt: now,
        ...(softDelete ? { deletedAt: now } : {}),
        updatedAt: now,
        ...(updatedBy ? { updatedBy } : {}),
      })
      .where(and(...conditions))
      .returning({ id: schema.reminders.id });
    return updated.length;
  }

  public async rescheduleRemindersBySource(
    firmId: string,
    sourceId: string,
    newDueAt: Date,
    newRemindAt?: Date,
    updatedBy?: string
  ): Promise<number> {
    const now = new Date();
    const targetRemindAt = newRemindAt ?? new Date(newDueAt.getTime() - 24 * 60 * 60 * 1000);
    const updated = await this.db
      .update(schema.reminders)
      .set({
        dueAt: newDueAt,
        remindAt: targetRemindAt,
        status: 'pending',
        dismissedAt: null,
        updatedAt: now,
        ...(updatedBy ? { updatedBy } : {}),
      })
      .where(
        and(
          eq(schema.reminders.firmId, firmId),
          eq(schema.reminders.sourceId, sourceId),
          isNull(schema.reminders.deletedAt)
        )
      )
      .returning({ id: schema.reminders.id });
    return updated.length;
  }

  public async listRemindersBySourceIds(firmId: string, sourceIds: string[]): Promise<schema.Reminder[]> {
    if (sourceIds.length === 0) return [];
    return this.db
      .select()
      .from(schema.reminders)
      .where(
        and(
          eq(schema.reminders.firmId, firmId),
          isNull(schema.reminders.deletedAt),
          inArray(schema.reminders.sourceId, sourceIds)
        )
      );
  }
  public async getAccountsSummary(
    firmId: string,
    filter: { clientId?: string; caseId?: string },
    user?: VisibilityUserContext
  ): Promise<{
    totalAgreedPaisa: number;
    totalPaidPaisa: number;
    balancePaisa: number;
    isCredit: boolean;
    creditPaisa: number;
    outstandingPaisa: number;
    totalExpensesPaisa: number;
    caseSummaries?: Array<{
      caseId: string;
      agreedPaisa: number;
      paidPaisa: number;
      balancePaisa: number;
      isCredit: boolean;
      creditPaisa: number;
      outstandingPaisa: number;
      expensesPaisa: number;
    }>;
  }> {
    const visCond = await this.buildPostgresCaseCondition(firmId, user, true);

    // Fee Agreements
    const agConditions = [
      eq(schema.feeAgreements.firmId, firmId),
      isNull(schema.feeAgreements.deletedAt),
      ne(schema.feeAgreements.status, 'void'),
    ];
    if (filter.clientId) agConditions.push(eq(schema.feeAgreements.clientId, filter.clientId));
    if (filter.caseId) agConditions.push(eq(schema.feeAgreements.caseId, filter.caseId));
    if (user) {
      agConditions.push(sql`(${schema.feeAgreements.caseId} IS NULL OR ${schema.feeAgreements.caseId} IN (SELECT id FROM ${schema.cases} WHERE ${visCond}))`);
    }

    const agRows = await this.db
      .select({ total: sql<string>`COALESCE(SUM(${schema.feeAgreements.agreedAmountPaisa}), 0)` })
      .from(schema.feeAgreements)
      .where(and(...agConditions));
    const totalAgreedPaisa = Number(agRows[0]?.total || 0);

    // Fee Payments
    const payConditions = [
      eq(schema.feePayments.firmId, firmId),
      isNull(schema.feePayments.deletedAt),
      eq(schema.feePayments.status, 'posted'),
    ];
    if (filter.clientId) payConditions.push(eq(schema.feePayments.clientId, filter.clientId));
    if (filter.caseId) payConditions.push(eq(schema.feePayments.caseId, filter.caseId));
    if (user) {
      payConditions.push(sql`(${schema.feePayments.caseId} IS NULL OR ${schema.feePayments.caseId} IN (SELECT id FROM ${schema.cases} WHERE ${visCond}))`);
    }

    const payRows = await this.db
      .select({ total: sql<string>`COALESCE(SUM(${schema.feePayments.amountPaisa}), 0)` })
      .from(schema.feePayments)
      .where(and(...payConditions));
    const totalPaidPaisa = Number(payRows[0]?.total || 0);

    // Expenses
    const expConditions = [
      eq(schema.expenses.firmId, firmId),
      isNull(schema.expenses.deletedAt),
      eq(schema.expenses.status, 'posted'),
    ];
    if (filter.clientId) expConditions.push(eq(schema.expenses.clientId, filter.clientId));
    if (filter.caseId) expConditions.push(eq(schema.expenses.caseId, filter.caseId));
    if (user) {
      expConditions.push(sql`(${schema.expenses.caseId} IS NULL OR ${schema.expenses.caseId} IN (SELECT id FROM ${schema.cases} WHERE ${visCond}))`);
    }

    const expRows = await this.db
      .select({ total: sql<string>`COALESCE(SUM(${schema.expenses.amountPaisa}), 0)` })
      .from(schema.expenses)
      .where(and(...expConditions));
    const totalExpensesPaisa = Number(expRows[0]?.total || 0);

    const balancePaisa = totalAgreedPaisa - totalPaidPaisa;
    const isCredit = balancePaisa < 0;
    const creditPaisa = isCredit ? Math.abs(balancePaisa) : 0;
    const outstandingPaisa = isCredit ? 0 : balancePaisa;

    // Build per-case breakdown
    let caseSummaries: Array<{
      caseId: string;
      agreedPaisa: number;
      paidPaisa: number;
      balancePaisa: number;
      isCredit: boolean;
      creditPaisa: number;
      outstandingPaisa: number;
      expensesPaisa: number;
    }> = [];

    if (filter.clientId) {
      const caseAgs = await this.db
        .select({
          caseId: schema.feeAgreements.caseId,
          total: sql<string>`COALESCE(SUM(${schema.feeAgreements.agreedAmountPaisa}), 0)`
        })
        .from(schema.feeAgreements)
        .where(and(...agConditions, isNotNull(schema.feeAgreements.caseId)))
        .groupBy(schema.feeAgreements.caseId);

      const casePays = await this.db
        .select({
          caseId: schema.feePayments.caseId,
          total: sql<string>`COALESCE(SUM(${schema.feePayments.amountPaisa}), 0)`
        })
        .from(schema.feePayments)
        .where(and(...payConditions, isNotNull(schema.feePayments.caseId)))
        .groupBy(schema.feePayments.caseId);

      const caseExps = await this.db
        .select({
          caseId: schema.expenses.caseId,
          total: sql<string>`COALESCE(SUM(${schema.expenses.amountPaisa}), 0)`
        })
        .from(schema.expenses)
        .where(and(...expConditions, isNotNull(schema.expenses.caseId)))
        .groupBy(schema.expenses.caseId);

      const caseMap = new Map<string, { agreedPaisa: number; paidPaisa: number; expensesPaisa: number }>();
      for (const row of caseAgs) {
        if (row.caseId) {
          const cur = caseMap.get(row.caseId) || { agreedPaisa: 0, paidPaisa: 0, expensesPaisa: 0 };
          cur.agreedPaisa += Number(row.total);
          caseMap.set(row.caseId, cur);
        }
      }
      for (const row of casePays) {
        if (row.caseId) {
          const cur = caseMap.get(row.caseId) || { agreedPaisa: 0, paidPaisa: 0, expensesPaisa: 0 };
          cur.paidPaisa += Number(row.total);
          caseMap.set(row.caseId, cur);
        }
      }
      for (const row of caseExps) {
        if (row.caseId) {
          const cur = caseMap.get(row.caseId) || { agreedPaisa: 0, paidPaisa: 0, expensesPaisa: 0 };
          cur.expensesPaisa += Number(row.total);
          caseMap.set(row.caseId, cur);
        }
      }
      caseSummaries = Array.from(caseMap.entries()).map(([cid, data]) => {
        const bPaisa = data.agreedPaisa - data.paidPaisa;
        const credit = bPaisa < 0;
        return {
          caseId: cid,
          agreedPaisa: data.agreedPaisa,
          paidPaisa: data.paidPaisa,
          balancePaisa: bPaisa,
          isCredit: credit,
          creditPaisa: credit ? Math.abs(bPaisa) : 0,
          outstandingPaisa: credit ? 0 : bPaisa,
          expensesPaisa: data.expensesPaisa,
        };
      });
    }

    return {
      totalAgreedPaisa,
      totalPaidPaisa,
      balancePaisa,
      isCredit,
      creditPaisa,
      outstandingPaisa,
      totalExpensesPaisa,
      caseSummaries,
    };
  }

  public async getClientBalancesOverview(
    firmId: string,
    user?: VisibilityUserContext
  ): Promise<
    Array<{
      clientId: string;
      clientName: string;
      clientNameBn?: string | null;
      clientPhone: string;
      totalAgreedPaisa: number;
      totalPaidPaisa: number;
      balancePaisa: number;
      isCredit: boolean;
      creditPaisa: number;
      outstandingPaisa: number;
    }>
  > {
    const clients = await this.listClients(firmId, undefined, user);
    const visCond = await this.buildPostgresCaseCondition(firmId, user, true);

    const result = [];
    for (const c of clients) {
      const agConditions = [
        eq(schema.feeAgreements.firmId, firmId),
        eq(schema.feeAgreements.clientId, c.id),
        isNull(schema.feeAgreements.deletedAt),
        ne(schema.feeAgreements.status, 'void'),
      ];
      if (user) {
        agConditions.push(sql`(${schema.feeAgreements.caseId} IS NULL OR ${schema.feeAgreements.caseId} IN (SELECT id FROM ${schema.cases} WHERE ${visCond}))`);
      }
      const agRows = await this.db
        .select({ total: sql<string>`COALESCE(SUM(${schema.feeAgreements.agreedAmountPaisa}), 0)` })
        .from(schema.feeAgreements)
        .where(and(...agConditions));
      const totalAgreedPaisa = Number(agRows[0]?.total || 0);

      const payConditions = [
        eq(schema.feePayments.firmId, firmId),
        eq(schema.feePayments.clientId, c.id),
        isNull(schema.feePayments.deletedAt),
        eq(schema.feePayments.status, 'posted'),
      ];
      if (user) {
        payConditions.push(sql`(${schema.feePayments.caseId} IS NULL OR ${schema.feePayments.caseId} IN (SELECT id FROM ${schema.cases} WHERE ${visCond}))`);
      }
      const payRows = await this.db
        .select({ total: sql<string>`COALESCE(SUM(${schema.feePayments.amountPaisa}), 0)` })
        .from(schema.feePayments)
        .where(and(...payConditions));
      const totalPaidPaisa = Number(payRows[0]?.total || 0);

      const balancePaisa = totalAgreedPaisa - totalPaidPaisa;
      const isCredit = balancePaisa < 0;
      const creditPaisa = isCredit ? Math.abs(balancePaisa) : 0;
      const outstandingPaisa = isCredit ? 0 : balancePaisa;

      result.push({
        clientId: c.id,
        clientName: c.name,
        clientNameBn: c.nameBn,
        clientPhone: c.phone,
        totalAgreedPaisa,
        totalPaidPaisa,
        balancePaisa,
        isCredit,
        creditPaisa,
        outstandingPaisa,
      });
    }
    return result;
  }

  public async getCaseBalancesOverview(
    firmId: string,
    user?: VisibilityUserContext
  ): Promise<
    Array<{
      clientId: string;
      clientName: string;
      clientNameBn?: string | null;
      clientPhone: string;
      caseId: string | null;
      caseNumber: string | null;
      caseTitle: string | null;
      fileSerial?: string | null;
      totalAgreedPaisa: number;
      totalPaidPaisa: number;
      balancePaisa: number;
      isCredit: boolean;
      creditPaisa: number;
      outstandingPaisa: number;
    }>
  > {
    const clients = await this.listClients(firmId, undefined, user);
    const visCond = await this.buildPostgresCaseCondition(firmId, user, true);
    const result: Array<{
      clientId: string;
      clientName: string;
      clientNameBn?: string | null;
      clientPhone: string;
      caseId: string | null;
      caseNumber: string | null;
      caseTitle: string | null;
      fileSerial?: string | null;
      totalAgreedPaisa: number;
      totalPaidPaisa: number;
      balancePaisa: number;
      isCredit: boolean;
      creditPaisa: number;
      outstandingPaisa: number;
    }> = [];

    for (const c of clients) {
      const agCaseRows = await this.db
        .selectDistinct({ caseId: schema.feeAgreements.caseId })
        .from(schema.feeAgreements)
        .where(
          and(
            eq(schema.feeAgreements.firmId, firmId),
            eq(schema.feeAgreements.clientId, c.id),
            isNull(schema.feeAgreements.deletedAt),
            ne(schema.feeAgreements.status, 'void')
          )
        );

      const payCaseRows = await this.db
        .selectDistinct({ caseId: schema.feePayments.caseId })
        .from(schema.feePayments)
        .where(
          and(
            eq(schema.feePayments.firmId, firmId),
            eq(schema.feePayments.clientId, c.id),
            isNull(schema.feePayments.deletedAt),
            eq(schema.feePayments.status, 'posted')
          )
        );

      const expCaseRows = await this.db
        .selectDistinct({ caseId: schema.expenses.caseId })
        .from(schema.expenses)
        .where(
          and(
            eq(schema.expenses.firmId, firmId),
            eq(schema.expenses.clientId, c.id),
            isNull(schema.expenses.deletedAt),
            eq(schema.expenses.status, 'posted')
          )
        );

      const caseIds = new Set<string | null>();
      for (const r of agCaseRows) caseIds.add(r.caseId ?? null);
      for (const r of payCaseRows) caseIds.add(r.caseId ?? null);
      for (const r of expCaseRows) caseIds.add(r.caseId ?? null);

      for (const cid of caseIds) {
        if (cid === null) {
          const agRows = await this.db
            .select({ total: sql<string>`COALESCE(SUM(${schema.feeAgreements.agreedAmountPaisa}), 0)` })
            .from(schema.feeAgreements)
            .where(
              and(
                eq(schema.feeAgreements.firmId, firmId),
                eq(schema.feeAgreements.clientId, c.id),
                isNull(schema.feeAgreements.caseId),
                isNull(schema.feeAgreements.deletedAt),
                ne(schema.feeAgreements.status, 'void')
              )
            );
          const totalAgreedPaisa = Number(agRows[0]?.total || 0);

          const payRows = await this.db
            .select({ total: sql<string>`COALESCE(SUM(${schema.feePayments.amountPaisa}), 0)` })
            .from(schema.feePayments)
            .where(
              and(
                eq(schema.feePayments.firmId, firmId),
                eq(schema.feePayments.clientId, c.id),
                isNull(schema.feePayments.caseId),
                isNull(schema.feePayments.deletedAt),
                eq(schema.feePayments.status, 'posted')
              )
            );
          const totalPaidPaisa = Number(payRows[0]?.total || 0);

          const balancePaisa = totalAgreedPaisa - totalPaidPaisa;
          const isCredit = balancePaisa < 0;

          result.push({
            clientId: c.id,
            clientName: c.name,
            clientNameBn: c.nameBn,
            clientPhone: c.phone,
            caseId: null,
            caseNumber: null,
            caseTitle: 'General / no case',
            fileSerial: null,
            totalAgreedPaisa,
            totalPaidPaisa,
            balancePaisa,
            isCredit,
            creditPaisa: isCredit ? Math.abs(balancePaisa) : 0,
            outstandingPaisa: isCredit ? 0 : balancePaisa,
          });
        } else {
          const caseRows = await this.db
            .select()
            .from(schema.cases)
            .where(
              and(
                eq(schema.cases.id, cid),
                eq(schema.cases.firmId, firmId),
                isNull(schema.cases.deletedAt),
                visCond
              )
            );
          if (!caseRows.length) continue;
          const caseRec = caseRows[0];

          const agRows = await this.db
            .select({ total: sql<string>`COALESCE(SUM(${schema.feeAgreements.agreedAmountPaisa}), 0)` })
            .from(schema.feeAgreements)
            .where(
              and(
                eq(schema.feeAgreements.firmId, firmId),
                eq(schema.feeAgreements.clientId, c.id),
                eq(schema.feeAgreements.caseId, cid),
                isNull(schema.feeAgreements.deletedAt),
                ne(schema.feeAgreements.status, 'void')
              )
            );
          const totalAgreedPaisa = Number(agRows[0]?.total || 0);

          const payRows = await this.db
            .select({ total: sql<string>`COALESCE(SUM(${schema.feePayments.amountPaisa}), 0)` })
            .from(schema.feePayments)
            .where(
              and(
                eq(schema.feePayments.firmId, firmId),
                eq(schema.feePayments.clientId, c.id),
                eq(schema.feePayments.caseId, cid),
                isNull(schema.feePayments.deletedAt),
                eq(schema.feePayments.status, 'posted')
              )
            );
          const totalPaidPaisa = Number(payRows[0]?.total || 0);

          const balancePaisa = totalAgreedPaisa - totalPaidPaisa;
          const isCredit = balancePaisa < 0;

          result.push({
            clientId: c.id,
            clientName: c.name,
            clientNameBn: c.nameBn,
            clientPhone: c.phone,
            caseId: caseRec.id,
            caseNumber: caseRec.caseNumber,
            caseTitle: caseRec.description || caseRec.matterType || null,
            fileSerial: caseRec.fileSerial || null,
            totalAgreedPaisa,
            totalPaidPaisa,
            balancePaisa,
            isCredit,
            creditPaisa: isCredit ? Math.abs(balancePaisa) : 0,
            outstandingPaisa: isCredit ? 0 : balancePaisa,
          });
        }
      }
    }
    return result;
  }

  // Fee Agreements
  public async listFeeAgreements(
    firmId: string,
    filter?: { clientId?: string; caseId?: string; status?: string },
    user?: VisibilityUserContext
  ): Promise<schema.FeeAgreement[]> {
    const conditions = [
      eq(schema.feeAgreements.firmId, firmId),
      isNull(schema.feeAgreements.deletedAt),
    ];
    if (filter?.clientId) conditions.push(eq(schema.feeAgreements.clientId, filter.clientId));
    if (filter?.caseId) conditions.push(eq(schema.feeAgreements.caseId, filter.caseId));
    if (filter?.status) conditions.push(eq(schema.feeAgreements.status, filter.status as any));

    if (user) {
      const visCond = await this.buildPostgresCaseCondition(firmId, user, true);
      conditions.push(sql`(${schema.feeAgreements.caseId} IS NULL OR ${schema.feeAgreements.caseId} IN (SELECT id FROM ${schema.cases} WHERE ${visCond}))`);
    }

    return await this.db
      .select()
      .from(schema.feeAgreements)
      .where(and(...conditions))
      .orderBy(desc(schema.feeAgreements.createdAt));
  }

  public async getFeeAgreementById(
    id: string,
    firmId: string,
    user?: VisibilityUserContext
  ): Promise<schema.FeeAgreement | null> {
    const conditions = [
      eq(schema.feeAgreements.id, id),
      eq(schema.feeAgreements.firmId, firmId),
      isNull(schema.feeAgreements.deletedAt),
    ];
    if (user) {
      const visCond = await this.buildPostgresCaseCondition(firmId, user, true);
      conditions.push(sql`(${schema.feeAgreements.caseId} IS NULL OR ${schema.feeAgreements.caseId} IN (SELECT id FROM ${schema.cases} WHERE ${visCond}))`);
    }
    const rows = await this.db
      .select()
      .from(schema.feeAgreements)
      .where(and(...conditions))
      .limit(1);
    return rows[0] || null;
  }

  public async insertFeeAgreement(agreement: schema.NewFeeAgreement): Promise<schema.FeeAgreement> {
    const id = agreement.id || `fa-${crypto.randomUUID()}`;
    const rows = await this.db
      .insert(schema.feeAgreements)
      .values({ ...agreement, id })
      .returning();
    return rows[0];
  }

  public async updateFeeAgreement(
    id: string,
    firmId: string,
    updates: Partial<schema.FeeAgreement>
  ): Promise<schema.FeeAgreement> {
    const rows = await this.db
      .update(schema.feeAgreements)
      .set({ ...updates, updatedAt: new Date() })
      .where(and(eq(schema.feeAgreements.id, id), eq(schema.feeAgreements.firmId, firmId), isNull(schema.feeAgreements.deletedAt)))
      .returning();
    if (!rows[0]) throw new Error(`Fee agreement not found: ${id}`);
    return rows[0];
  }

  public async insertFeeAgreementChange(change: schema.NewFeeAgreementChange): Promise<schema.FeeAgreementChange> {
    const id = change.id || `fac-${crypto.randomUUID()}`;
    const rows = await this.db
      .insert(schema.feeAgreementChanges)
      .values({ ...change, id })
      .returning();
    return rows[0];
  }

  public async listFeeAgreementChanges(feeAgreementId: string, firmId: string): Promise<schema.FeeAgreementChange[]> {
    return await this.db
      .select()
      .from(schema.feeAgreementChanges)
      .where(and(eq(schema.feeAgreementChanges.feeAgreementId, feeAgreementId), eq(schema.feeAgreementChanges.firmId, firmId)))
      .orderBy(asc(schema.feeAgreementChanges.createdAt));
  }

  // Number Sequences & Fee Payments
  public async getNextSequenceNumber(
    firmId: string,
    type: string,
    prefix = 'R-'
  ): Promise<{ sequenceNumber: string; currentVal: number }> {
    const result = await (this.db as any).execute(sql`
      INSERT INTO number_sequences (id, firm_id, type, prefix, current_val, updated_at)
      VALUES (gen_random_uuid(), ${firmId}, ${type}, ${prefix}, 1, NOW())
      ON CONFLICT (firm_id, type)
      DO UPDATE SET current_val = number_sequences.current_val + 1, updated_at = NOW()
      RETURNING prefix, current_val;
    `);
    const row = result.rows[0];
    const currentVal = Number(row.current_val);
    const pfx = String(row.prefix);
    const sequenceNumber = `${pfx}${String(currentVal).padStart(6, '0')}`;
    return { sequenceNumber, currentVal };
  }

  public async listFeePayments(
    firmId: string,
    filter?: { clientId?: string; caseId?: string; feeAgreementId?: string; status?: string; legacyUnassigned?: boolean },
    user?: VisibilityUserContext
  ): Promise<schema.FeePayment[]> {
    const conditions = [
      eq(schema.feePayments.firmId, firmId),
      isNull(schema.feePayments.deletedAt),
    ];
    if (filter?.clientId) conditions.push(eq(schema.feePayments.clientId, filter.clientId));
    if (filter?.caseId) conditions.push(eq(schema.feePayments.caseId, filter.caseId));
    if (filter?.feeAgreementId) conditions.push(eq(schema.feePayments.feeAgreementId, filter.feeAgreementId));
    if (filter?.status) conditions.push(eq(schema.feePayments.status, filter.status as any));
    if (filter?.legacyUnassigned !== undefined) {
      if (filter.legacyUnassigned) {
        conditions.push(sql`(${schema.feePayments.legacyUnassigned} = true OR ${schema.feePayments.feeAgreementId} IS NULL OR ${schema.feePayments.caseId} IS NULL)`);
      } else {
        conditions.push(sql`(${schema.feePayments.legacyUnassigned} = false AND ${schema.feePayments.feeAgreementId} IS NOT NULL AND ${schema.feePayments.caseId} IS NOT NULL)`);
      }
    }

    if (user) {
      const visCond = await this.buildPostgresCaseCondition(firmId, user, true);
      conditions.push(sql`(${schema.feePayments.caseId} IS NULL OR ${schema.feePayments.caseId} IN (SELECT id FROM ${schema.cases} WHERE ${visCond}))`);
    }

    return await this.db
      .select()
      .from(schema.feePayments)
      .where(and(...conditions))
      .orderBy(desc(schema.feePayments.createdAt));
  }

  public async getFeePaymentById(
    id: string,
    firmId: string,
    user?: VisibilityUserContext
  ): Promise<schema.FeePayment | null> {
    const conditions = [
      eq(schema.feePayments.id, id),
      eq(schema.feePayments.firmId, firmId),
      isNull(schema.feePayments.deletedAt),
    ];
    if (user) {
      const visCond = await this.buildPostgresCaseCondition(firmId, user, true);
      conditions.push(sql`(${schema.feePayments.caseId} IS NULL OR ${schema.feePayments.caseId} IN (SELECT id FROM ${schema.cases} WHERE ${visCond}))`);
    }
    const rows = await this.db
      .select()
      .from(schema.feePayments)
      .where(and(...conditions))
      .limit(1);
    return rows[0] || null;
  }

  public async getFeePaymentByIdempotencyKey(
    firmId: string,
    idempotencyKey: string
  ): Promise<schema.FeePayment | null> {
    const rows = await this.db
      .select()
      .from(schema.feePayments)
      .where(and(eq(schema.feePayments.firmId, firmId), eq(schema.feePayments.idempotencyKey, idempotencyKey), isNull(schema.feePayments.deletedAt)))
      .limit(1);
    return rows[0] || null;
  }

  public async insertFeePayment(payment: schema.NewFeePayment): Promise<schema.FeePayment> {
    const id = payment.id || `pay-${crypto.randomUUID()}`;
    const rows = await this.db
      .insert(schema.feePayments)
      .values({ ...payment, id })
      .returning();
    return rows[0];
  }

  public async updateFeePayment(
    id: string,
    firmId: string,
    updates: Partial<schema.FeePayment>
  ): Promise<schema.FeePayment> {
    const rows = await this.db
      .update(schema.feePayments)
      .set({ ...updates, updatedAt: new Date() })
      .where(and(eq(schema.feePayments.id, id), eq(schema.feePayments.firmId, firmId), isNull(schema.feePayments.deletedAt)))
      .returning();
    if (!rows[0]) throw new Error(`Fee payment not found: ${id}`);
    return rows[0];
  }

  // Expenses & Categories
  public async listExpenseCategories(firmId: string): Promise<schema.ExpenseCategory[]> {
    const rows = await this.db
      .select()
      .from(schema.expenseCategories)
      .where(and(eq(schema.expenseCategories.firmId, firmId), isNull(schema.expenseCategories.deletedAt)))
      .orderBy(asc(schema.expenseCategories.name));
    if (rows.length === 0) {
      return await this.seedDefaultExpenseCategories(firmId);
    }
    return rows;
  }

  public async seedDefaultExpenseCategories(firmId: string): Promise<schema.ExpenseCategory[]> {
    const entries = DEFAULT_EXPENSE_CATEGORIES.map((name) => ({
      id: `expcat-${crypto.randomUUID()}`,
      firmId,
      name,
      isDefault: true,
    }));
    return await this.db
      .insert(schema.expenseCategories)
      .values(entries)
      .returning();
  }

  public async listExpenses(
    firmId: string,
    filter?: { clientId?: string; caseId?: string; categoryId?: string; status?: string },
    user?: VisibilityUserContext
  ): Promise<Array<schema.Expense & { categoryName?: string }>> {
    const conditions = [
      eq(schema.expenses.firmId, firmId),
      isNull(schema.expenses.deletedAt),
    ];
    if (filter?.clientId) conditions.push(eq(schema.expenses.clientId, filter.clientId));
    if (filter?.caseId) conditions.push(eq(schema.expenses.caseId, filter.caseId));
    if (filter?.categoryId) conditions.push(eq(schema.expenses.categoryId, filter.categoryId));
    if (filter?.status) conditions.push(eq(schema.expenses.status, filter.status as any));

    if (user) {
      const visCond = await this.buildPostgresCaseCondition(firmId, user, true);
      conditions.push(sql`(${schema.expenses.caseId} IS NULL OR ${schema.expenses.caseId} IN (SELECT id FROM ${schema.cases} WHERE ${visCond}))`);
    }

    const rows = await this.db
      .select({
        expense: schema.expenses,
        categoryName: schema.expenseCategories.name,
      })
      .from(schema.expenses)
      .leftJoin(schema.expenseCategories, eq(schema.expenses.categoryId, schema.expenseCategories.id))
      .where(and(...conditions))
      .orderBy(desc(schema.expenses.createdAt));

    return rows.map((r) => ({
      ...r.expense,
      categoryName: r.categoryName || 'Unknown Category',
    }));
  }

  public async getExpenseById(
    id: string,
    firmId: string,
    user?: VisibilityUserContext
  ): Promise<(schema.Expense & { categoryName?: string }) | null> {
    const conditions = [
      eq(schema.expenses.id, id),
      eq(schema.expenses.firmId, firmId),
      isNull(schema.expenses.deletedAt),
    ];
    if (user) {
      const visCond = await this.buildPostgresCaseCondition(firmId, user, true);
      conditions.push(sql`(${schema.expenses.caseId} IS NULL OR ${schema.expenses.caseId} IN (SELECT id FROM ${schema.cases} WHERE ${visCond}))`);
    }
    const rows = await this.db
      .select({
        expense: schema.expenses,
        categoryName: schema.expenseCategories.name,
      })
      .from(schema.expenses)
      .leftJoin(schema.expenseCategories, eq(schema.expenses.categoryId, schema.expenseCategories.id))
      .where(and(...conditions))
      .limit(1);

    if (!rows[0]) return null;
    return {
      ...rows[0].expense,
      categoryName: rows[0].categoryName || 'Unknown Category',
    };
  }

  public async insertExpense(expense: schema.NewExpense): Promise<schema.Expense> {
    const id = expense.id || `exp-${crypto.randomUUID()}`;
    const rows = await this.db
      .insert(schema.expenses)
      .values({ ...expense, id })
      .returning();
    return rows[0];
  }

  public async updateExpense(
    id: string,
    firmId: string,
    updates: Partial<schema.Expense>
  ): Promise<schema.Expense> {
    const rows = await this.db
      .update(schema.expenses)
      .set({ ...updates, updatedAt: new Date() })
      .where(and(eq(schema.expenses.id, id), eq(schema.expenses.firmId, firmId), isNull(schema.expenses.deletedAt)))
      .returning();
    if (!rows[0]) throw new Error(`Expense not found: ${id}`);
    return rows[0];
  }


  public async listChamberExpenseCategories(firmId: string): Promise<schema.ChamberExpenseCategory[]> {
    let rows = await this.db
      .select()
      .from(schema.chamberExpenseCategories)
      .where(and(eq(schema.chamberExpenseCategories.firmId, firmId), isNull(schema.chamberExpenseCategories.deletedAt)))
      .orderBy(asc(schema.chamberExpenseCategories.name));

    if (rows.length === 0) {
      const defaults: Array<{ name: string; nameBn: string; kind: 'general' | 'salary' }> = [
        { name: 'Food and refreshments', nameBn: 'খাবার ও আপ্যায়ন', kind: 'general' },
        { name: 'Office supplies', nameBn: 'অফিস স্টেশনারি ও সামগ্রী', kind: 'general' },
        { name: 'Utilities (electricity, internet, water)', nameBn: 'ইউটিলিটি - বিদ্যুৎ, ইন্টারনেট, পানি', kind: 'general' },
        { name: 'Rent', nameBn: 'চেম্বার ভাড়া', kind: 'general' },
        { name: 'Staff salary', nameBn: 'কর্মচারীদের বেতন', kind: 'salary' },
        { name: 'Payments for specific work', nameBn: 'নির্দিষ্ট কাজের পারিশ্রমিক', kind: 'general' },
        { name: 'Transportation', nameBn: 'যাতায়াত ও পরিবহন', kind: 'general' },
        { name: 'Miscellaneous', nameBn: 'বিবিধ খরচ', kind: 'general' },
      ];
      for (const d of defaults) {
        await this.db.insert(schema.chamberExpenseCategories).values({
          id: `ch-cat-${crypto.randomUUID()}`,
          firmId,
          name: d.name,
          nameBn: d.nameBn,
          kind: d.kind,
          isDefault: true,
        });
      }
      rows = await this.db
        .select()
        .from(schema.chamberExpenseCategories)
        .where(and(eq(schema.chamberExpenseCategories.firmId, firmId), isNull(schema.chamberExpenseCategories.deletedAt)))
        .orderBy(asc(schema.chamberExpenseCategories.name));
    }
    return rows;
  }

  public async createChamberExpenseCategory(
    firmId: string,
    data: schema.NewChamberExpenseCategory
  ): Promise<schema.ChamberExpenseCategory> {
    const [row] = await this.db
      .insert(schema.chamberExpenseCategories)
      .values({
        ...data,
        id: data.id || `ch-cat-${crypto.randomUUID()}`,
        firmId,
      })
      .returning();
    return row;
  }

  public async listChamberExpenses(
    firmId: string,
    filter?: { fromDate?: string; toDate?: string; categoryId?: string; status?: string },
    user?: VisibilityUserContext
  ): Promise<Array<schema.ChamberExpense & { categoryName?: string; categoryNameBn?: string | null; categoryKind?: string }>> {
    const canViewSalary = !user || user.role === 'firm_owner' || user.role === 'admin' || user.permissions?.includes('chamber_expenses.salary') || user.permissions?.includes('*');

    const conditions = [
      eq(schema.chamberExpenses.firmId, firmId),
      isNull(schema.chamberExpenses.deletedAt),
    ];
    if (filter?.categoryId) conditions.push(eq(schema.chamberExpenses.categoryId, filter.categoryId));
    if (filter?.status) conditions.push(eq(schema.chamberExpenses.status, filter.status as any));
    if (filter?.fromDate) conditions.push(gte(schema.chamberExpenses.expenseDate, filter.fromDate));
    if (filter?.toDate) conditions.push(lte(schema.chamberExpenses.expenseDate, filter.toDate));

    if (!canViewSalary) {
      conditions.push(sql`${schema.chamberExpenses.categoryId} IN (SELECT id FROM ${schema.chamberExpenseCategories} WHERE kind != 'salary')`);
    }

    const rows = await this.db
      .select({
        expense: schema.chamberExpenses,
        categoryName: schema.chamberExpenseCategories.name,
        categoryNameBn: schema.chamberExpenseCategories.nameBn,
        categoryKind: schema.chamberExpenseCategories.kind,
      })
      .from(schema.chamberExpenses)
      .leftJoin(schema.chamberExpenseCategories, eq(schema.chamberExpenses.categoryId, schema.chamberExpenseCategories.id))
      .where(and(...conditions))
      .orderBy(desc(schema.chamberExpenses.expenseDate), desc(schema.chamberExpenses.createdAt));

    return rows.map((r) => ({
      ...r.expense,
      categoryName: r.categoryName || 'Unknown',
      categoryNameBn: r.categoryNameBn || null,
      categoryKind: r.categoryKind || 'general',
    }));
  }

  public async getChamberExpenseById(
    firmId: string,
    id: string,
    user?: VisibilityUserContext
  ): Promise<(schema.ChamberExpense & { categoryName?: string; categoryNameBn?: string | null; categoryKind?: string }) | null> {
    const canViewSalary = !user || user.role === 'firm_owner' || user.role === 'admin' || user.permissions?.includes('chamber_expenses.salary') || user.permissions?.includes('*');

    const conditions = [
      eq(schema.chamberExpenses.id, id),
      eq(schema.chamberExpenses.firmId, firmId),
      isNull(schema.chamberExpenses.deletedAt),
    ];
    if (!canViewSalary) {
      conditions.push(sql`${schema.chamberExpenses.categoryId} IN (SELECT id FROM ${schema.chamberExpenseCategories} WHERE kind != 'salary')`);
    }

    const rows = await this.db
      .select({
        expense: schema.chamberExpenses,
        categoryName: schema.chamberExpenseCategories.name,
        categoryNameBn: schema.chamberExpenseCategories.nameBn,
        categoryKind: schema.chamberExpenseCategories.kind,
      })
      .from(schema.chamberExpenses)
      .leftJoin(schema.chamberExpenseCategories, eq(schema.chamberExpenses.categoryId, schema.chamberExpenseCategories.id))
      .where(and(...conditions));

    if (!rows.length) return null;
    const r = rows[0];
    return {
      ...r.expense,
      categoryName: r.categoryName || 'Unknown',
      categoryNameBn: r.categoryNameBn || null,
      categoryKind: r.categoryKind || 'general',
    };
  }

  public async createChamberExpense(
    firmId: string,
    data: schema.NewChamberExpense
  ): Promise<schema.ChamberExpense> {
    const expenseId = data.id || `ch-exp-${crypto.randomUUID()}`;
    const [row] = await this.db
      .insert(schema.chamberExpenses)
      .values({
        ...data,
        id: expenseId,
        firmId,
      })
      .returning();

    // If advanceId is present, automatically record advance settlement
    if (data.advanceId) {
      await this.createChamberAdvanceSettlement(firmId, data.advanceId, {
        id: `ch-set-${crypto.randomUUID()}`,
        firmId,
        advanceId: data.advanceId,
        type: 'expense',
        expenseId: row.id,
        amountPaisa: data.amountPaisa,
        settledDate: data.expenseDate,
        notes: `Expense settlement: ${data.description}`,
        createdBy: data.createdBy ?? null,
      });
    }

    return row;
  }

  public async updateChamberExpense(
    firmId: string,
    id: string,
    updates: Partial<schema.ChamberExpense>
  ): Promise<schema.ChamberExpense> {
    const [row] = await this.db
      .update(schema.chamberExpenses)
      .set({
        ...updates,
        updatedAt: new Date(),
      })
      .where(and(eq(schema.chamberExpenses.id, id), eq(schema.chamberExpenses.firmId, firmId)))
      .returning();
    return row;
  }

  public async voidChamberExpense(
    firmId: string,
    id: string,
    voidReason: string,
    userId: string
  ): Promise<schema.ChamberExpense> {
    const [row] = await this.db
      .update(schema.chamberExpenses)
      .set({
        status: 'void',
        voidReason,
        voidedBy: userId,
        voidedAt: new Date(),
        updatedBy: userId,
        updatedAt: new Date(),
      })
      .where(and(eq(schema.chamberExpenses.id, id), eq(schema.chamberExpenses.firmId, firmId)))
      .returning();

    // If linked to advance settlement, soft delete the settlement and check advance
    const settlements = await this.db
      .select()
      .from(schema.chamberAdvanceSettlements)
      .where(
        and(
          eq(schema.chamberAdvanceSettlements.firmId, firmId),
          eq(schema.chamberAdvanceSettlements.expenseId, id),
          isNull(schema.chamberAdvanceSettlements.deletedAt)
        )
      );

    for (const s of settlements) {
      await this.db
        .update(schema.chamberAdvanceSettlements)
        .set({
          deletedAt: new Date(),
          updatedBy: userId,
          updatedAt: new Date(),
        })
        .where(eq(schema.chamberAdvanceSettlements.id, s.id));

      const [adv] = await this.db
        .select()
        .from(schema.chamberAdvances)
        .where(eq(schema.chamberAdvances.id, s.advanceId));

      if (adv && adv.status === 'settled') {
        const remainingSettlements = await this.db
          .select({ total: sql<string>`COALESCE(SUM(${schema.chamberAdvanceSettlements.amountPaisa}), 0)` })
          .from(schema.chamberAdvanceSettlements)
          .where(
            and(
              eq(schema.chamberAdvanceSettlements.advanceId, adv.id),
              eq(schema.chamberAdvanceSettlements.firmId, firmId),
              isNull(schema.chamberAdvanceSettlements.deletedAt)
            )
          );
        const settledPaisa = Number(remainingSettlements[0]?.total || 0);
        if (settledPaisa < Number(adv.amountPaisa)) {
          await this.db
            .update(schema.chamberAdvances)
            .set({ status: 'open', updatedAt: new Date() })
            .where(eq(schema.chamberAdvances.id, adv.id));
        }
      }
    }

    return row;
  }

  public async getChamberExpensesSummary(
    firmId: string,
    period?: { month?: string; year?: number },
    user?: VisibilityUserContext
  ): Promise<{
    totalThisMonthPaisa: number;
    totalLastMonthPaisa: number;
    totalSalaryThisMonthPaisa: number;
    byCategory: Array<{
      categoryId: string;
      categoryName: string;
      categoryNameBn?: string | null;
      categoryKind: string;
      totalPaisa: number;
      count: number;
    }>;
  }> {
    const canViewSalary = !user || user.role === 'firm_owner' || user.role === 'admin' || user.permissions?.includes('chamber_expenses.salary') || user.permissions?.includes('*');

    const cats = await this.listChamberExpenseCategories(firmId);
    const catMap = new Map(cats.map((c) => [c.id, c]));

    const now = new Date();
    const currentYear = period?.year ?? now.getFullYear();
    const currentMonth = period?.month ?? String(now.getMonth() + 1).padStart(2, '0');
    const currentMonthPrefix = `${currentYear}-${currentMonth}`;

    const lastMonthDate = new Date(currentYear, Number(currentMonth) - 2, 1);
    const lastMonthYear = lastMonthDate.getFullYear();
    const lastMonthNum = String(lastMonthDate.getMonth() + 1).padStart(2, '0');
    const lastMonthPrefix = `${lastMonthYear}-${lastMonthNum}`;

    const rows = await this.listChamberExpenses(firmId, undefined, user);

    let totalThisMonthPaisa = 0;
    let totalLastMonthPaisa = 0;
    let totalSalaryThisMonthPaisa = 0;
    const catBuckets = new Map<string, { totalPaisa: number; count: number }>();

    for (const exp of rows) {
      if (exp.status === 'void') continue;
      const cat = catMap.get(exp.categoryId);
      const isSalary = cat?.kind === 'salary';
      if (isSalary && !canViewSalary) continue;

      const amt = Number(exp.amountPaisa || 0);

      if (exp.expenseDate.startsWith(currentMonthPrefix)) {
        totalThisMonthPaisa += amt;
        if (isSalary) {
          totalSalaryThisMonthPaisa += amt;
        }

        const bucket = catBuckets.get(exp.categoryId) || { totalPaisa: 0, count: 0 };
        bucket.totalPaisa += amt;
        bucket.count += 1;
        catBuckets.set(exp.categoryId, bucket);
      } else if (exp.expenseDate.startsWith(lastMonthPrefix)) {
        totalLastMonthPaisa += amt;
      }
    }

    const byCategory = cats
      .filter((c) => canViewSalary || c.kind !== 'salary')
      .map((c) => {
        const bucket = catBuckets.get(c.id) || { totalPaisa: 0, count: 0 };
        return {
          categoryId: c.id,
          categoryName: c.name,
          categoryNameBn: c.nameBn,
          categoryKind: c.kind,
          totalPaisa: bucket.totalPaisa,
          count: bucket.count,
        };
      })
      .filter((c) => c.count > 0)
      .sort((a, b) => b.totalPaisa - a.totalPaisa);

    return {
      totalThisMonthPaisa,
      totalLastMonthPaisa,
      totalSalaryThisMonthPaisa,
      byCategory,
    };
  }

  public async listChamberAdvances(
    firmId: string,
    filter?: { givenToUserId?: string; status?: string }
  ): Promise<Array<schema.ChamberAdvance & { settledAmountPaisa: number; remainingAmountPaisa: number }>> {
    const conditions = [
      eq(schema.chamberAdvances.firmId, firmId),
      isNull(schema.chamberAdvances.deletedAt),
    ];
    if (filter?.givenToUserId) conditions.push(eq(schema.chamberAdvances.givenToUserId, filter.givenToUserId));
    if (filter?.status) conditions.push(eq(schema.chamberAdvances.status, filter.status as any));

    const rows = await this.db
      .select()
      .from(schema.chamberAdvances)
      .where(and(...conditions))
      .orderBy(desc(schema.chamberAdvances.givenDate), desc(schema.chamberAdvances.createdAt));

    const result = [];
    for (const a of rows) {
      const settlements = await this.db
        .select({ total: sql<string>`COALESCE(SUM(${schema.chamberAdvanceSettlements.amountPaisa}), 0)` })
        .from(schema.chamberAdvanceSettlements)
        .where(
          and(
            eq(schema.chamberAdvanceSettlements.advanceId, a.id),
            eq(schema.chamberAdvanceSettlements.firmId, firmId),
            isNull(schema.chamberAdvanceSettlements.deletedAt)
          )
        );
      const settledAmountPaisa = Number(settlements[0]?.total || 0);
      const remainingAmountPaisa = Math.max(0, Number(a.amountPaisa) - settledAmountPaisa);

      result.push({
        ...a,
        settledAmountPaisa,
        remainingAmountPaisa,
      });
    }
    return result;
  }

  public async getChamberAdvanceById(
    firmId: string,
    id: string
  ): Promise<(schema.ChamberAdvance & { settledAmountPaisa: number; remainingAmountPaisa: number; settlements: schema.ChamberAdvanceSettlement[] }) | null> {
    const [adv] = await this.db
      .select()
      .from(schema.chamberAdvances)
      .where(
        and(
          eq(schema.chamberAdvances.id, id),
          eq(schema.chamberAdvances.firmId, firmId),
          isNull(schema.chamberAdvances.deletedAt)
        )
      );
    if (!adv) return null;

    const settlements = await this.db
      .select()
      .from(schema.chamberAdvanceSettlements)
      .where(
        and(
          eq(schema.chamberAdvanceSettlements.advanceId, id),
          eq(schema.chamberAdvanceSettlements.firmId, firmId),
          isNull(schema.chamberAdvanceSettlements.deletedAt)
        )
      )
      .orderBy(desc(schema.chamberAdvanceSettlements.settledDate));

    const settledAmountPaisa = settlements.reduce((sum, s) => sum + Number(s.amountPaisa || 0), 0);
    const remainingAmountPaisa = Math.max(0, Number(adv.amountPaisa) - settledAmountPaisa);

    return {
      ...adv,
      settledAmountPaisa,
      remainingAmountPaisa,
      settlements,
    };
  }

  public async createChamberAdvance(
    firmId: string,
    data: schema.NewChamberAdvance
  ): Promise<schema.ChamberAdvance> {
    const [row] = await this.db
      .insert(schema.chamberAdvances)
      .values({
        ...data,
        id: data.id || `ch-adv-${crypto.randomUUID()}`,
        firmId,
        status: 'open',
      })
      .returning();
    return row;
  }

  public async voidChamberAdvance(
    firmId: string,
    id: string,
    voidReason: string,
    userId: string
  ): Promise<schema.ChamberAdvance> {
    const settlements = await this.db
      .select()
      .from(schema.chamberAdvanceSettlements)
      .where(
        and(
          eq(schema.chamberAdvanceSettlements.advanceId, id),
          eq(schema.chamberAdvanceSettlements.firmId, firmId),
          isNull(schema.chamberAdvanceSettlements.deletedAt)
        )
      );
    if (settlements.length > 0) {
      throw new Error('Cannot void advance with existing settlements. Settle by refund or void linked expenses first.');
    }

    const [row] = await this.db
      .update(schema.chamberAdvances)
      .set({
        status: 'void',
        voidReason,
        voidedBy: userId,
        voidedAt: new Date(),
        updatedBy: userId,
        updatedAt: new Date(),
      })
      .where(and(eq(schema.chamberAdvances.id, id), eq(schema.chamberAdvances.firmId, firmId)))
      .returning();
    return row;
  }

  public async createChamberAdvanceSettlement(
    firmId: string,
    advanceId: string,
    data: schema.NewChamberAdvanceSettlement
  ): Promise<schema.ChamberAdvanceSettlement> {
    const [adv] = await this.db
      .select()
      .from(schema.chamberAdvances)
      .where(
        and(
          eq(schema.chamberAdvances.id, advanceId),
          eq(schema.chamberAdvances.firmId, firmId),
          isNull(schema.chamberAdvances.deletedAt)
        )
      );
    if (!adv) throw new Error(`Advance not found: ${advanceId}`);
    if (adv.status === 'void') throw new Error('Cannot settle a voided advance');

    const settlements = await this.db
      .select({ total: sql<string>`COALESCE(SUM(${schema.chamberAdvanceSettlements.amountPaisa}), 0)` })
      .from(schema.chamberAdvanceSettlements)
      .where(
        and(
          eq(schema.chamberAdvanceSettlements.advanceId, advanceId),
          eq(schema.chamberAdvanceSettlements.firmId, firmId),
          isNull(schema.chamberAdvanceSettlements.deletedAt)
        )
      );
    const currentSettled = Number(settlements[0]?.total || 0);
    const remaining = Number(adv.amountPaisa) - currentSettled;

    if (Number(data.amountPaisa) > remaining) {
      throw new Error(`Settlement amount (${Number(data.amountPaisa)}) exceeds remaining balance (${remaining})`);
    }

    const [created] = await this.db
      .insert(schema.chamberAdvanceSettlements)
      .values({
        ...data,
        id: data.id || `ch-set-${crypto.randomUUID()}`,
        firmId,
        advanceId,
      })
      .returning();

    if (currentSettled + Number(data.amountPaisa) >= Number(adv.amountPaisa)) {
      await this.db
        .update(schema.chamberAdvances)
        .set({ status: 'settled', updatedAt: new Date() })
        .where(eq(schema.chamberAdvances.id, advanceId));
    }

    return created;
  }

  public async listChamberAdvanceSettlements(
    firmId: string,
    advanceId: string
  ): Promise<schema.ChamberAdvanceSettlement[]> {
    return this.db
      .select()
      .from(schema.chamberAdvanceSettlements)
      .where(
        and(
          eq(schema.chamberAdvanceSettlements.advanceId, advanceId),
          eq(schema.chamberAdvanceSettlements.firmId, firmId),
          isNull(schema.chamberAdvanceSettlements.deletedAt)
        )
      )
      .orderBy(desc(schema.chamberAdvanceSettlements.settledDate));
  }
  public async getPlatformAdminByEmail(email: string): Promise<schema.PlatformAdmin | null> {
    const rows = await this.db
      .select()
      .from(schema.platformAdmins)
      .where(ilike(schema.platformAdmins.email, email.trim()))
      .limit(1);
    return rows[0] || null;
  }

  public async getPlatformAdminById(id: string): Promise<schema.PlatformAdmin | null> {
    const rows = await this.db
      .select()
      .from(schema.platformAdmins)
      .where(eq(schema.platformAdmins.id, id))
      .limit(1);
    return rows[0] || null;
  }

  public async listPlatformAdmins(): Promise<schema.PlatformAdmin[]> {
    return this.db
      .select()
      .from(schema.platformAdmins)
      .orderBy(desc(schema.platformAdmins.createdAt));
  }

  public async insertPlatformAdmin(admin: schema.NewPlatformAdmin): Promise<schema.PlatformAdmin> {
    const rows = await this.db.insert(schema.platformAdmins).values(admin).returning();
    return rows[0];
  }

  public async updatePlatformAdmin(
    id: string,
    updates: Partial<schema.PlatformAdmin>
  ): Promise<schema.PlatformAdmin> {
    const rows = await this.db
      .update(schema.platformAdmins)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(schema.platformAdmins.id, id))
      .returning();
    if (!rows[0]) throw new Error(`PlatformAdmin not found: ${id}`);
    return rows[0];
  }

  public async incrementPlatformAdminFailedLogin(
    id: string,
    lockedUntil: Date | null
  ): Promise<{ failedAttempts: number; lockedUntil: Date | null }> {
    const res = await this.pool.query(
      `UPDATE platform_admins
       SET failed_attempts = failed_attempts + 1,
           locked_until = $2,
           updated_at = NOW()
       WHERE id = $1
       RETURNING failed_attempts, locked_until`,
      [id, lockedUntil]
    );
    if (!res.rows[0]) throw new Error(`PlatformAdmin not found: ${id}`);
    return {
      failedAttempts: res.rows[0].failed_attempts,
      lockedUntil: res.rows[0].locked_until,
    };
  }

  public async resetPlatformAdminFailedLogin(id: string): Promise<void> {
    await this.pool.query(
      `UPDATE platform_admins
       SET failed_attempts = 0,
           locked_until = NULL,
           updated_at = NOW()
       WHERE id = $1`,
      [id]
    );
  }

  public async insertAdminAudit(entry: schema.NewAdminAuditEntry): Promise<schema.AdminAuditEntry> {
    const rows = await this.db.insert(schema.adminAudit).values(entry).returning();
    return rows[0];
  }

  public async listAdminAudit(limit = 100, offset = 0): Promise<schema.AdminAuditEntry[]> {
    return this.db
      .select()
      .from(schema.adminAudit)
      .orderBy(desc(schema.adminAudit.at))
      .limit(limit)
      .offset(offset);
  }

  public async insertLicenseEvent(event: schema.NewLicenseEvent): Promise<schema.LicenseEvent> {
    const rows = await this.db.insert(schema.licenseEvents).values(event).returning();
    return rows[0];
  }

  public async listLicenseEvents(firmId?: string, limit = 50): Promise<schema.LicenseEvent[]> {
    if (firmId) {
      return this.db
        .select()
        .from(schema.licenseEvents)
        .where(eq(schema.licenseEvents.firmId, firmId))
        .orderBy(desc(schema.licenseEvents.at))
        .limit(limit);
    }
    return this.db
      .select()
      .from(schema.licenseEvents)
      .orderBy(desc(schema.licenseEvents.at))
      .limit(limit);
  }

  public async insertPayment(payment: schema.NewPayment): Promise<schema.Payment> {
    const values = {
      ...payment,
      id: payment.id || `pay-${crypto.randomUUID()}`,
    };
    const rows = await this.db.insert(schema.payments).values(values as any).returning();
    return rows[0];
  }

  public async listPayments(firmId: string): Promise<schema.Payment[]> {
    return this.db
      .select()
      .from(schema.payments)
      .where(and(eq(schema.payments.firmId, firmId), isNull(schema.payments.deletedAt)))
      .orderBy(desc(schema.payments.paidAt));
  }

  public async getDeviceById(id: string): Promise<schema.Device | null> {
    const res = await this.db.select().from(schema.devices).where(eq(schema.devices.id, id));
    return res[0] || null;
  }

  public async getDeviceByHash(deviceKeyHash: string): Promise<schema.Device | null> {
    const res = await this.db.select().from(schema.devices).where(eq(schema.devices.deviceKeyHash, deviceKeyHash));
    return res[0] || null;
  }

  public async listDevices(firmId: string): Promise<schema.Device[]> {
    return this.db
      .select()
      .from(schema.devices)
      .where(eq(schema.devices.firmId, firmId))
      .orderBy(desc(schema.devices.lastSeenAt));
  }

  public async countApprovedDevices(firmId: string): Promise<number> {
    const res = await this.db
      .select({ count: sql<number>`count(*)::int` })
      .from(schema.devices)
      .where(and(eq(schema.devices.firmId, firmId), eq(schema.devices.status, 'approved')));
    return Number(res[0]?.count || 0);
  }

  public async countPendingDevices(firmId: string): Promise<number> {
    const res = await this.db
      .select({ count: sql<number>`count(*)::int` })
      .from(schema.devices)
      .where(and(eq(schema.devices.firmId, firmId), eq(schema.devices.status, 'pending')));
    return Number(res[0]?.count || 0);
  }

  public async insertDevice(device: schema.NewDevice): Promise<schema.Device> {
    const res = await this.db.insert(schema.devices).values(device).returning();
    return res[0];
  }

  public async updateDevice(id: string, updates: Partial<schema.Device>): Promise<schema.Device> {
    const res = await this.db
      .update(schema.devices)
      .set(updates)
      .where(eq(schema.devices.id, id))
      .returning();
    return res[0];
  }

  public async deleteDevice(id: string): Promise<void> {
    await this.db.delete(schema.devices).where(eq(schema.devices.id, id));
  }

  // Appointments Methods
  public async listAppointments(
    firmId: string,
    filter?: {
      from?: string;
      to?: string;
      status?: string;
      clientId?: string;
      caseId?: string;
      mine?: boolean;
      user?: VisibilityUserContext;
      limit?: number;
      offset?: number;
    }
  ): Promise<{ appointments: Array<schema.Appointment & { attendees: string[] }>; total: number }> {
    const conditions: SQL[] = [eq(schema.appointments.firmId, firmId), isNull(schema.appointments.deletedAt)];

    if (filter?.status && filter.status !== 'all') {
      conditions.push(eq(schema.appointments.status, filter.status as any));
    }
    if (filter?.clientId) {
      conditions.push(eq(schema.appointments.clientId, filter.clientId));
    }
    if (filter?.caseId) {
      conditions.push(eq(schema.appointments.caseId, filter.caseId));
    }
    if (filter?.from) {
      conditions.push(sql`${schema.appointments.startsAt} >= ${new Date(filter.from).toISOString()}::timestamptz`);
    }
    if (filter?.to) {
      conditions.push(sql`${schema.appointments.startsAt} <= ${new Date(filter.to).toISOString()}::timestamptz`);
    }

    const allAppts = await this.db
      .select()
      .from(schema.appointments)
      .where(and(...conditions))
      .orderBy(schema.appointments.startsAt);

    // Fetch attendees for all matching appointments
    const apptIds = allAppts.map((a) => a.id);
    let allAttendees: schema.AppointmentAttendee[] = [];
    if (apptIds.length > 0) {
      allAttendees = await this.db
        .select()
        .from(schema.appointmentAttendees)
        .where(
          and(
            eq(schema.appointmentAttendees.firmId, firmId),
            sql`${schema.appointmentAttendees.appointmentId} IN (${sql.join(
              apptIds.map((id) => sql`${id}`),
              sql`, `
            )})`
          )
        );
    }

    // Apply visibility filter and mine filter
    let filtered = allAppts;
    if (filter?.user) {
      const u = filter.user;
      const firm = (await this.getFirm(firmId)) || { id: firmId, visibilityMode: 'open' };
      const firmUsers = await this.listUsers(firmId);
      const firmCases = await this.db.select().from(schema.cases).where(eq(schema.cases.firmId, firmId));
      const firmShares = await this.listFirmCaseShares(firmId);

      filtered = filtered.filter((a) => {
        const attIds = allAttendees.filter((att) => att.appointmentId === a.id).map((att) => att.userId);
        return canUserSeeAppointment(u, a, attIds, firm, firmUsers, firmCases, firmShares);
      });
    }

    if (filter?.mine && filter?.user) {
      const uid = filter.user.id;
      filtered = filtered.filter((a) => {
        const attIds = allAttendees.filter((att) => att.appointmentId === a.id).map((att) => att.userId);
        return a.organiserUserId === uid || attIds.includes(uid);
      });
    }

    const total = filtered.length;
    const limit = filter?.limit || 50;
    const offset = filter?.offset || 0;
    const paged = filtered.slice(offset, offset + limit);

    const appointmentsWithAttendees = paged.map((a) => {
      const attendees = allAttendees.filter((att) => att.appointmentId === a.id).map((att) => att.userId);
      return { ...a, attendees };
    });

    return { appointments: appointmentsWithAttendees, total };
  }

  public async getAppointmentById(
    id: string,
    firmId: string,
    user?: VisibilityUserContext
  ): Promise<(schema.Appointment & { attendees: string[] }) | null> {
    const rows = await this.db
      .select()
      .from(schema.appointments)
      .where(and(eq(schema.appointments.id, id), eq(schema.appointments.firmId, firmId), isNull(schema.appointments.deletedAt)))
      .limit(1);
    const appt = rows[0];
    if (!appt) return null;

    const attendeesRows = await this.db
      .select()
      .from(schema.appointmentAttendees)
      .where(and(eq(schema.appointmentAttendees.appointmentId, id), eq(schema.appointmentAttendees.firmId, firmId)));
    const attendees = attendeesRows.map((a) => a.userId);

    if (user) {
      const firm = (await this.getFirm(firmId)) || { id: firmId, visibilityMode: 'open' };
      const firmUsers = await this.listUsers(firmId);
      const firmCases = await this.db.select().from(schema.cases).where(eq(schema.cases.firmId, firmId));
      const firmShares = await this.listFirmCaseShares(firmId);
      if (!canUserSeeAppointment(user, appt, attendees, firm, firmUsers, firmCases, firmShares)) {
        return null;
      }
    }

    return { ...appt, attendees };
  }

  public async insertAppointment(
    appointment: schema.NewAppointment,
    attendeeUserIds: string[]
  ): Promise<schema.Appointment & { attendees: string[] }> {
    const now = new Date();
    const apptId = appointment.id || crypto.randomUUID();
    const rows = await this.db
      .insert(schema.appointments)
      .values({
        ...appointment,
        id: apptId,
        createdAt: now,
        updatedAt: now,
      })
      .returning();
    const appt = rows[0];

    for (const uid of attendeeUserIds) {
      await this.db.insert(schema.appointmentAttendees).values({
        id: crypto.randomUUID(),
        appointmentId: apptId,
        userId: uid,
        firmId: appt.firmId,
        createdAt: now,
        updatedAt: now,
      });
    }

    return { ...appt, attendees: [...attendeeUserIds] };
  }

  public async updateAppointment(
    id: string,
    firmId: string,
    updates: Partial<schema.Appointment>,
    attendeeUserIds?: string[]
  ): Promise<schema.Appointment & { attendees: string[] }> {
    const now = new Date();
    const rows = await this.db
      .update(schema.appointments)
      .set({ ...updates, updatedAt: now })
      .where(and(eq(schema.appointments.id, id), eq(schema.appointments.firmId, firmId), isNull(schema.appointments.deletedAt)))
      .returning();
    const appt = rows[0];
    if (!appt) throw new Error(`Appointment not found: ${id}`);

    if (attendeeUserIds !== undefined) {
      await this.db.delete(schema.appointmentAttendees).where(eq(schema.appointmentAttendees.appointmentId, id));
      for (const uid of attendeeUserIds) {
        await this.db.insert(schema.appointmentAttendees).values({
          id: crypto.randomUUID(),
          appointmentId: id,
          userId: uid,
          firmId,
          createdAt: now,
          updatedAt: now,
        });
      }
    }

    const currentAttendeesRows = await this.db
      .select()
      .from(schema.appointmentAttendees)
      .where(eq(schema.appointmentAttendees.appointmentId, id));

    return { ...appt, attendees: currentAttendeesRows.map((a) => a.userId) };
  }

  public async deleteAppointment(id: string, firmId: string, updatedBy?: string): Promise<void> {
    await this.db
      .update(schema.appointments)
      .set({ deletedAt: new Date(), updatedAt: new Date(), ...(updatedBy ? { updatedBy } : {}) })
      .where(and(eq(schema.appointments.id, id), eq(schema.appointments.firmId, firmId), isNull(schema.appointments.deletedAt)));
  }

  public async checkAppointmentOverlap(
    firmId: string,
    userId: string,
    startsAt: Date,
    endsAt: Date,
    excludeId?: string
  ): Promise<boolean> {
    const conditions = [
      eq(schema.appointments.firmId, firmId),
      isNull(schema.appointments.deletedAt),
      ne(schema.appointments.status, 'cancelled'),
      sql`${schema.appointments.startsAt} < ${endsAt.toISOString()}::timestamptz`,
      sql`${schema.appointments.endsAt} > ${startsAt.toISOString()}::timestamptz`,
    ];
    if (excludeId) {
      conditions.push(ne(schema.appointments.id, excludeId));
    }

    const overlapping = await this.db
      .select({
        id: schema.appointments.id,
        organiserUserId: schema.appointments.organiserUserId,
      })
      .from(schema.appointments)
      .where(and(...conditions));

    for (const a of overlapping) {
      if (a.organiserUserId === userId) return true;
      const att = await this.db
        .select()
        .from(schema.appointmentAttendees)
        .where(and(eq(schema.appointmentAttendees.appointmentId, a.id), eq(schema.appointmentAttendees.userId, userId)))
        .limit(1);
      if (att.length > 0) return true;
    }
    return false;
  }

  public async getFirmMetrics(
    firmId: string
  ): Promise<{ userCount: number; deviceCount: number; pendingDeviceCount: number; lastActivity: Date | null }> {
    const usersCountRes = await this.db
      .select({ count: sql<number>`count(*)::int` })
      .from(schema.users)
      .where(and(eq(schema.users.firmId, firmId), isNull(schema.users.deletedAt)));
    const userCount = Number(usersCountRes[0]?.count || 0);

    const approvedDevicesRes = await this.db
      .select({ count: sql<number>`count(*)::int` })
      .from(schema.devices)
      .where(and(eq(schema.devices.firmId, firmId), eq(schema.devices.status, 'approved')));
    let deviceCount = Number(approvedDevicesRes[0]?.count || 0);

    const pendingDevicesRes = await this.db
      .select({ count: sql<number>`count(*)::int` })
      .from(schema.devices)
      .where(and(eq(schema.devices.firmId, firmId), eq(schema.devices.status, 'pending')));
    const pendingDeviceCount = Number(pendingDevicesRes[0]?.count || 0);

    if (deviceCount === 0 && pendingDeviceCount === 0) {
      const distinctIpRes = await this.pool.query(
        `SELECT COUNT(DISTINCT (new_value->>'ipAddress')) as count
         FROM audit_log
         WHERE firm_id = $1 AND entity = 'Session' AND action = 'LOGIN_SUCCESS' AND (new_value->>'ipAddress') IS NOT NULL`,
        [firmId]
      );
      const ipCount = Number(distinctIpRes.rows[0]?.count || 0);
      deviceCount = ipCount > 0 ? ipCount : Math.max(1, userCount);
    }

    const latestAuditRes = await this.pool.query(
      `SELECT timestamp FROM audit_log WHERE firm_id = $1 ORDER BY timestamp DESC LIMIT 1`,
      [firmId]
    );
    let lastActivity: Date | null = null;
    if (latestAuditRes.rows[0]?.timestamp) {
      lastActivity = new Date(latestAuditRes.rows[0].timestamp);
    } else {
      const firm = await this.getFirm(firmId, true);
      lastActivity = firm?.updatedAt || firm?.createdAt || null;
    }

    return { userCount, deviceCount, pendingDeviceCount, lastActivity };
  }

  public async transaction<T>(callback: (txDb: IDatabase) => Promise<T>): Promise<T> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const txDrizzle = drizzle(client, { schema });
      // Create a scoped PostgresDatabase instance wrapping client/txDrizzle
      const txAdapter = Object.create(this) as PostgresDatabase;
      (txAdapter as any).pool = client;
      (txAdapter as any).db = txDrizzle;
      const result = await callback(txAdapter);
      await client.query('COMMIT');
      return result;
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }
}

// Factory returning Postgres DB or In-Memory fallback
let instance: IDatabase | null = null;

export function getDatabase(): IDatabase {
  if (instance) return instance;

  const url = process.env.DATABASE_URL;
  if (url && (process.env.USE_POSTGRES === 'true' || process.env.NODE_ENV !== 'test')) {
    instance = new PostgresDatabase(url);
  } else {
    instance = new MemoryDatabase();
  }

  return instance;
}

export function createMemoryDatabase(): MemoryDatabase {
  return new MemoryDatabase();
}

export function createPostgresDatabase(url: string): IDatabase {
  return new PostgresDatabase(url);
}

export function resetDatabaseInstance(): void {
  instance = null;
}
