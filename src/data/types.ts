import { PermissionKey, UserRole } from '../permissions';
import { JobType, VisibilityMode } from '../rolePresets';
export type { JobType, VisibilityMode };

export interface BaseRecord {
  id: string;
  firmId: string;
  createdAt: string; // ISO 8601
  updatedAt: string; // ISO 8601
  deletedAt: string | null; // Soft delete timestamp, null if active
  createdBy: string; // User ID
  updatedBy: string; // User ID
}

export type AuditAction =
  | 'CREATE'
  | 'UPDATE'
  | 'DELETE'
  | 'ARCHIVE'
  | 'RESTORE'
  | 'CASE_UNLINK'
  | 'LOGIN'
  | 'USER_SWITCH'
  | 'HEARING_DATE_CHANGE'
  | 'FILE_CHECKOUT'
  | 'FILE_CHECKIN'
  | 'TASK_ASSIGN'
  | 'TASK_COMPLETE'
  | 'REMINDER_CREATE'
  | 'REMINDER_DISMISS'
  | 'BACKUP_EXPORT'
  | 'BACKUP_RESTORE'
  | 'SUBSCRIPTION_RENEW'
  | 'SUBSCRIPTION_UPDATE'
  | 'RESET_PASSWORD';

export interface AuditLogRecord {
  id: string;
  firmId: string;
  userId: string;
  userName: string;
  entity: string;
  entityId: string;
  action: AuditAction;
  oldValue: Record<string, unknown> | null;
  newValue: Record<string, unknown> | null;
  timestamp: string; // ISO 8601
}

export interface FirmRecord extends BaseRecord {
  name: string;
  barCouncilReg: string;
  officeAddress: string;
  courtAffiliations: string;
  planId: string;
  licenseExpiresAt: string;
  status: 'active' | 'expired' | 'suspended';
  visibilityMode: VisibilityMode;
  seatLimit?: number;
}

export interface UserRecord extends BaseRecord {
  name: string;
  email: string;
  role: UserRole;
  jobType?: JobType;
  jobTitleLabel?: string | null;
  reportsToUserId?: string | null;
  permissions: PermissionKey[];
  language: 'en' | 'bn';
  active: boolean;
  status?: 'active' | 'deactivated';
  mustChangePassword?: boolean;
}

export interface ClientRecord extends BaseRecord {
  name: string;
  nameBn?: string;
  phone: string;
  email?: string;
  address: string;
  notes: string;
  archived?: boolean;
  hasPhoto?: boolean;
}

export interface ClientPhotoRecord {
  clientId: string;
  firmId: string;
  mime: string;
  bytes?: string;
  dataUrl?: string;
  updatedAt: string;
}

export interface ClientNoteRecord extends BaseRecord {
  clientId: string;
  noteDate: string; // YYYY-MM-DD
  body: string;
}

export type CaseCategory = 'civil' | 'criminal_gr' | 'criminal_cr' | 'other';

export type CourtRole =
  | 'Plaintiff'
  | 'Defendant'
  | 'Petitioner'
  | 'Respondent'
  | 'Appellant'
  | 'Applicant'
  | 'Opposite Party'
  | 'Revisioner'
  | 'Prosecution'
  | 'State'
  | 'Accused'
  | 'Complainant'
  | 'Prosecution counsel'
  | "Complainant's counsel"
  | 'Defence counsel'
  | string;

export interface CaseNoteRecord extends BaseRecord {
  caseId: string;
  noteDate: string; // YYYY-MM-DD
  body: string;
}

export interface CaseRecord extends BaseRecord {
  clientId: string;
  fileSerial: string;
  caseNumber: string;
  court: string;
  matterType: string;
  description: string;
  plaintiff: string;
  defendant: string;
  ourRole: CourtRole;
  plaintiffLawyer: string;
  defendantLawyer: string;
  responsibleLawyerId?: string | null;
  status: 'ongoing' | 'pending' | 'closed';
  caseDate?: string | null;
  closedOn?: string | null;
  caseCategory?: CaseCategory;
  partyARole?: string | null;
  partyBRole?: string | null;
  policeStation?: string | null;
  sectionsOfLaw?: string | null;
  restricted: boolean;
  nextHearingAt: string | null;
  latestNote?: { noteDate: string; body: string } | null;
}

export interface CaseShareRecord {
  id: string;
  firmId: string;
  caseId: string;
  userId: string;
  createdBy: string;
  createdAt: string;
  deletedAt: string | null;
}

export type HearingStatus = 'scheduled' | 'held' | 'adjourned' | 'cancelled';

export interface HearingRecord extends BaseRecord {
  caseId: string;
  appearingLawyerId?: string | null;
  scheduledAt: string; // ISO 8601
  court?: string;
  purpose: string;
  status: HearingStatus;
  outcomeNote?: string;
  fixedFor?: string;
  fixedForNote?: string | null;
}

export interface HearingDateHistoryRecord {
  id: string;
  firmId: string;
  hearingId: string;
  caseId: string;
  oldAt: string; // ISO 8601
  newAt: string; // ISO 8601
  reason: string;
  oldFixedFor?: string | null;
  newFixedFor?: string | null;
  changedBy: string; // User ID
  changedByName: string;
  changedAt: string; // ISO 8601
}

export type TaskPriority = 'urgent' | 'high' | 'medium' | 'normal' | 'low';
export type TaskStatus = 'pending' | 'in_progress' | 'completed' | 'cancelled';

export interface TaskRecord extends BaseRecord {
  caseId?: string | null;
  clientId?: string | null;
  assignedTo: string; // User ID
  assignedToName?: string;
  title: string;
  description?: string;
  priority: TaskPriority;
  dueAt: string; // ISO 8601
  status: TaskStatus;
  completedAt?: string | null;
}

export type PhysicalFileStatus = 'in_chamber' | 'checked_out' | 'in_court' | 'archived';
export type FileMovementAction = 'CHECKOUT' | 'CHECKIN' | 'COURT_DISPATCH' | 'TRANSFER' | 'ARCHIVE';

export interface PhysicalFileRecord extends BaseRecord {
  serial: string; // Unique auto-incrementing serial e.g. "F-000101"
  caseId?: string | null;
  clientId?: string | null;
  title: string;
  shelfLocation?: string;
  status: PhysicalFileStatus;
  currentHolderId?: string | null; // User ID
  currentHolderName?: string | null;
  checkedOutAt?: string | null; // ISO 8601
  dueBackAt?: string | null; // ISO 8601
  notes?: string;
}

export interface FileMovementRecord {
  id: string;
  firmId: string;
  fileId: string;
  action: FileMovementAction;
  userId: string;
  userName: string;
  at: string; // ISO 8601
  dueBackAt?: string | null;
  note?: string;
}

export type AppointmentType =
  | 'client_meeting'
  | 'consultation'
  | 'phone_call'
  | 'internal_meeting'
  | 'court_visit'
  | 'other';

export type AppointmentMode = 'in_person' | 'phone' | 'video';

export type AppointmentStatus = 'scheduled' | 'completed' | 'cancelled' | 'no_show';

export interface AppointmentRecord extends BaseRecord {
  title: string;
  type: AppointmentType;
  startsAt: string; // ISO 8601
  endsAt: string; // ISO 8601
  mode: AppointmentMode;
  location?: string | null;
  organiserUserId: string;
  clientId?: string | null;
  caseId?: string | null;
  status: AppointmentStatus;
  notes?: string | null;
  reminderMinutesBefore: number;
  attendees?: string[]; // user IDs
}

export interface AppointmentAttendeeRecord {
  id: string;
  appointmentId: string;
  userId: string;
  firmId: string;
  createdAt: string;
  updatedAt: string;
}

export type ReminderSourceType = 'hearing' | 'task' | 'file_return' | 'appointment';
export type ReminderChannel = 'in_app';
export type ReminderStatus = 'pending' | 'sent' | 'dismissed';

export interface ReminderRecord extends BaseRecord {
  userId: string; // Target recipient user ID
  userName?: string;
  sourceType: ReminderSourceType;
  sourceId: string; // hearingId, taskId, fileId, or appointmentId
  title: string;
  description?: string;
  remindAt: string; // ISO 8601 timestamp when notification triggers
  dueAt: string; // ISO 8601 timestamp of underlying event/hearing/deadline
  channel: ReminderChannel;
  status: ReminderStatus;
  dismissedAt?: string | null;
}

export type CalendarEventType = 'hearing' | 'task' | 'file_return' | 'appointment';

export interface CalendarEventRecord {
  id: string;
  title: string;
  date: string; // ISO 8601
  type: CalendarEventType;
  sourceId: string;
  caseId?: string | null;
  caseNumber?: string;
  court?: string;
  clientId?: string | null;
  clientName?: string;
  assigneeId?: string | null;
  assigneeName?: string;
  status?: string;
  priority?: string;
  shelfLocation?: string;
  isOverdue?: boolean;
  restricted?: boolean;
  fixedFor?: string;
  fixedForNote?: string;
}

export interface SecurityContext {
  currentUser: UserRecord;
}

export type SearchResultEntity = 'case' | 'client' | 'hearing' | 'task' | 'file' | 'appointment';

export interface SearchResultItem {
  id: string;
  entity: SearchResultEntity;
  title: string;
  subtitle: string;
  badge?: string;
  details?: string;
  caseNumber?: string;
  clientName?: string;
  court?: string;
  serial?: string;
  status?: string;
  restricted?: boolean;
  targetTab: 'cases' | 'clients' | 'hearings' | 'tasks' | 'files' | 'appointments';
  targetId: string;
}

export interface DashboardMetrics {
  activeCasesCount: number;
  totalClientsCount: number;
  todayHearingsCount: number;
  todayAppointmentsCount?: number;
  pendingTasksCount: number;
  overdueTasksCount: number;
  checkedOutFilesCount: number;
  overdueFilesCount: number;
  pendingRemindersCount: number;
}

export interface DashboardUrgentItems {
  todayHearings: HearingRecord[];
  todayAppointments?: AppointmentRecord[];
  overdueTasks: TaskRecord[];
  overdueFiles: PhysicalFileRecord[];
}

export interface ChamberBackupCounts {
  clients: number;
  cases: number;
  hearings: number;
  hearingDateHistory: number;
  tasks: number;
  physicalFiles: number;
  fileMovements: number;
  reminders: number;
  auditLog: number;
  clientNotes?: number;
  caseNotes?: number;
  appointments?: number;
}

export interface ChamberBackupMetadata {
  version: '1.0';
  exportedAt: string; // ISO timestamp
  exportedBy: string; // User ID
  exportedByName: string;
  firmId: string;
  firmName: string;
  schemaVersion: number;
  encrypted: boolean;
  counts: ChamberBackupCounts;
}

export interface ChamberBackupData {
  firm: FirmRecord;
  clients: ClientRecord[];
  clientPhotos?: ClientPhotoRecord[];
  clientNotes?: ClientNoteRecord[];
  cases: CaseRecord[];
  caseNotes?: CaseNoteRecord[];
  hearings: HearingRecord[];
  hearingDateHistory: HearingDateHistoryRecord[];
  tasks: TaskRecord[];
  physicalFiles: PhysicalFileRecord[];
  fileMovements: FileMovementRecord[];
  appointments?: AppointmentRecord[];
  appointmentAttendees?: AppointmentAttendeeRecord[];
  reminders: ReminderRecord[];
  auditLogs: AuditLogRecord[];
}

export interface ChamberBackupPayload {
  magic: 'BD_LEGAL_PRACTICE_BACKUP';
  metadata: ChamberBackupMetadata;
  checksum: string; // SHA-256 of canonical data
  data: ChamberBackupData;
}

export interface EncryptedBackupPayload {
  magic: 'BD_LEGAL_PRACTICE_BACKUP_ENCRYPTED';
  version: '1.0';
  metadata: ChamberBackupMetadata;
  encryption: {
    algorithm: 'AES-GCM-256';
    kdf: 'PBKDF2';
    iterations: number;
    salt: string; // base64
    iv: string; // base64
  };
  ciphertext: string; // base64
  checksum: string; // SHA-256 of ciphertext
}

export type RestoreMode = 'clean' | 'merge';

export interface RestorePreview {
  valid: boolean;
  isEncrypted: boolean;
  metadata?: ChamberBackupMetadata;
  checksumMatched: boolean;
  firmMatch: boolean;
  warnings: string[];
  counts?: ChamberBackupCounts;
  payload?: ChamberBackupPayload;
  error?: string;
}

export interface RestoreResult {
  success: boolean;
  mode: RestoreMode;
  restoredAt: string;
  restoredBy: string;
  restoredByName: string;
  auditLogId: string;
  counts: ChamberBackupCounts;
  message: string;
}

// Accounts Phase 1 Types
export type FeeType = 'fixed' | 'per_hearing' | 'hourly' | 'retainer' | 'installment';
export type FeeAgreementStatus = 'active' | 'closed' | 'void';
export type PaymentMethod = 'cash' | 'bank' | 'bkash' | 'nagad' | 'cheque' | 'other';
export type PaymentStatus = 'posted' | 'void';
export type ExpenseStatus = 'posted' | 'void';

export interface FeeAgreement extends BaseRecord {
  clientId: string;
  caseId: string | null;
  feeType: FeeType;
  agreedAmountPaisa: number;
  agreementDate: string;
  notes: string | null;
  status: FeeAgreementStatus;
}

export interface FeeAgreementChange {
  id: string;
  firmId: string;
  feeAgreementId: string;
  oldAmountPaisa: number;
  newAmountPaisa: number;
  reason: string;
  changedBy: string;
  createdAt: string;
}

export interface FeePayment extends BaseRecord {
  clientId: string;
  caseId: string | null;
  feeAgreementId: string | null;
  hearingId: string | null;
  paymentDate: string;
  amountPaisa: number;
  method: PaymentMethod;
  reference: string | null;
  receiptNumber: string;
  purposeNote: string;
  status: PaymentStatus;
  voidReason: string | null;
  voidedBy: string | null;
  voidedAt: string | null;
  idempotencyKey: string;
  legacyUnassigned?: boolean;
}

export interface ExpenseCategory extends BaseRecord {
  name: string;
  isDefault: boolean;
}

export interface Expense extends BaseRecord {
  clientId: string | null;
  caseId: string | null;
  categoryId: string;
  categoryName?: string;
  expenseDate: string;
  amountPaisa: number;
  description: string;
  reimbursable: boolean;
  status: ExpenseStatus;
  voidReason: string | null;
  voidedBy: string | null;
  voidedAt: string | null;
}

export interface AccountsSummary {
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
}

export interface ClientBalanceOverview {
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
}




