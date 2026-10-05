import { PermissionKey, UserRole } from '../permissions';

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
  | 'SUBSCRIPTION_UPDATE';

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
}

export interface UserRecord extends BaseRecord {
  name: string;
  email: string;
  role: UserRole;
  permissions: PermissionKey[];
  language: 'en' | 'bn';
  active: boolean;
}

export interface ClientRecord extends BaseRecord {
  name: string;
  nameBn?: string;
  phone: string;
  email?: string;
  address: string;
  notes: string;
  archived?: boolean;
}

export type CourtRole =
  | 'Plaintiff'
  | 'Defendant'
  | 'Petitioner'
  | 'Respondent'
  | 'Appellant'
  | 'Applicant';

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
  status: 'ongoing' | 'closed';
  restricted: boolean;
  nextHearingAt: string | null;
}

export type HearingStatus = 'scheduled' | 'held' | 'adjourned' | 'cancelled';

export interface HearingRecord extends BaseRecord {
  caseId: string;
  scheduledAt: string; // ISO 8601
  court?: string;
  purpose: string;
  status: HearingStatus;
  outcomeNote?: string;
}

export interface HearingDateHistoryRecord {
  id: string;
  firmId: string;
  hearingId: string;
  caseId: string;
  oldAt: string; // ISO 8601
  newAt: string; // ISO 8601
  reason: string;
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

export type ReminderSourceType = 'hearing' | 'task' | 'file_return';
export type ReminderChannel = 'in_app';
export type ReminderStatus = 'pending' | 'sent' | 'dismissed';

export interface ReminderRecord extends BaseRecord {
  userId: string; // Target recipient user ID
  userName?: string;
  sourceType: ReminderSourceType;
  sourceId: string; // hearingId, taskId, or fileId
  title: string;
  description?: string;
  remindAt: string; // ISO 8601 timestamp when notification triggers
  dueAt: string; // ISO 8601 timestamp of underlying event/hearing/deadline
  channel: ReminderChannel;
  status: ReminderStatus;
  dismissedAt?: string | null;
}

export type CalendarEventType = 'hearing' | 'task' | 'file_return';

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
}

export interface SecurityContext {
  currentUser: UserRecord;
}

export type SearchResultEntity = 'case' | 'client' | 'hearing' | 'task' | 'file';

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
  targetTab: 'cases' | 'clients' | 'hearings' | 'tasks' | 'files';
  targetId: string;
}

export interface DashboardMetrics {
  activeCasesCount: number;
  totalClientsCount: number;
  todayHearingsCount: number;
  pendingTasksCount: number;
  overdueTasksCount: number;
  checkedOutFilesCount: number;
  overdueFilesCount: number;
  pendingRemindersCount: number;
}

export interface DashboardUrgentItems {
  todayHearings: HearingRecord[];
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
  cases: CaseRecord[];
  hearings: HearingRecord[];
  hearingDateHistory: HearingDateHistoryRecord[];
  tasks: TaskRecord[];
  physicalFiles: PhysicalFileRecord[];
  fileMovements: FileMovementRecord[];
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



