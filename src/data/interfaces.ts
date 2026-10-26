import {
  AuditAction,
  AuditLogRecord,
  BaseRecord,
  CalendarEventRecord,
  CalendarEventType,
  CaseRecord,
  CaseCategory,
  CaseNoteRecord,
  CaseShareRecord,
  ClientRecord,
  ClientNoteRecord,
  ClientPhotoRecord,
  AppointmentRecord,
  FileMovementRecord,
  FirmRecord,
  HearingDateHistoryRecord,
  HearingRecord,
  HearingStatus,
  PhysicalFileRecord,
  PhysicalFileStatus,
  ReminderChannel,
  ReminderRecord,
  ReminderSourceType,
  ReminderStatus,
  SearchResultEntity,
  SearchResultItem,
  DashboardMetrics,
  DashboardUrgentItems,
  ChamberBackupMetadata,
  ChamberBackupPayload,
  EncryptedBackupPayload,
  RestoreMode,
  RestorePreview,
  RestoreResult,
  SecurityContext,
  TaskPriority,
  TaskRecord,
  TaskStatus,
  UserRecord,
} from './types';


import { PermissionKey } from '../permissions';



export interface IAuditLogRepository {
  list(context: SecurityContext, filter?: { entity?: string; action?: AuditAction; limit?: number; offset?: number }): Promise<AuditLogRecord[]>;
  listByCaseId?(context: SecurityContext, caseId: string): Promise<AuditLogRecord[]>;
  record(
    context: SecurityContext,
    params: {
      entity: string;
      entityId: string;
      action: AuditAction;
      oldValue?: Record<string, unknown> | null;
      newValue?: Record<string, unknown> | null;
    }
  ): Promise<AuditLogRecord>;
}

export interface IUserRepository {
  list(context: SecurityContext): Promise<UserRecord[]>;
  getById(context: SecurityContext, id: string): Promise<UserRecord | null>;
  create(
    context: SecurityContext,
    data: {
      name: string;
      email: string;
      role?: 'Owner' | 'Staff';
      jobType?: string;
      jobTitleLabel?: string | null;
      reportsToUserId?: string | null;
      preset?: string;
      permissions?: PermissionKey[];
      language?: 'en' | 'bn';
      temporaryPassword?: string;
    }
  ): Promise<UserRecord & { temporaryPassword?: string }>;
  update(
    context: SecurityContext,
    targetUserId: string,
    data: {
      name?: string;
      email?: string;
      jobType?: string;
      jobTitleLabel?: string | null;
      reportsToUserId?: string | null;
      language?: 'en' | 'bn';
    }
  ): Promise<UserRecord>;
  updatePermissions(context: SecurityContext, targetUserId: string, permissions: PermissionKey[]): Promise<UserRecord>;
  updateRole(context: SecurityContext, targetUserId: string, role: 'Owner' | 'Staff'): Promise<UserRecord>;
  deactivate(
    context: SecurityContext,
    targetUserId: string,
    reassignToUserId?: string
  ): Promise<UserRecord & { warnings?: string[]; openCasesCount?: number; futureHearingsCount?: number }>;
  reactivate(context: SecurityContext, targetUserId: string): Promise<UserRecord>;
  reassignTeam(
    context: SecurityContext,
    fromLawyerId: string,
    toLawyerId: string
  ): Promise<{ success: boolean; affectedUserIds: string[] }>;
}

export interface IFirmRepository {
  getFirm(context: SecurityContext): Promise<FirmRecord>;
  updateFirm(context: SecurityContext, data: Partial<Omit<FirmRecord, 'id' | 'firmId' | 'createdAt' | 'deletedAt' | 'createdBy'>>): Promise<FirmRecord>;
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
    status: string;
    holderName: string;
  }>;
}

export interface IClientRepository {
  list(context: SecurityContext, filter?: { search?: string }): Promise<ClientRecord[]>;
  getById(context: SecurityContext, id: string): Promise<ClientRecord | null>;
  create(
    context: SecurityContext,
    data: {
      name: string;
      nameBn?: string;
      phone: string;
      email?: string;
      address: string;
      notes: string;
    }
  ): Promise<ClientRecord>;
  update(
    context: SecurityContext,
    id: string,
    data: Partial<Omit<ClientRecord, 'id' | 'firmId' | 'createdAt' | 'deletedAt' | 'createdBy'>>
  ): Promise<ClientRecord>;
  delete(context: SecurityContext, id: string): Promise<{ success: boolean; softDeleted: true }>;
  archive(context: SecurityContext, id: string): Promise<ClientRecord>;
  getLinkedOverview(context: SecurityContext, clientId: string): Promise<ClientLinkedOverview>;
  getPhoto(context: SecurityContext, clientId: string): Promise<ClientPhotoRecord | null>;
  savePhoto(context: SecurityContext, clientId: string, mime: string, bytes: string): Promise<ClientPhotoRecord>;
  deletePhoto(context: SecurityContext, clientId: string): Promise<void>;
  listNotes(context: SecurityContext, clientId: string, options?: { limit?: number; offset?: number }): Promise<{ notes: ClientNoteRecord[]; total: number }>;
  createNote(context: SecurityContext, clientId: string, data: { noteDate: string; body: string }): Promise<ClientNoteRecord>;
  updateNote(context: SecurityContext, clientId: string, noteId: string, data: { noteDate?: string; body?: string }): Promise<ClientNoteRecord>;
  deleteNote(context: SecurityContext, clientId: string, noteId: string): Promise<{ success: boolean; softDeleted: true }>;
}

export interface ICaseRepository {
  list(
    context: SecurityContext,
    filter?: {
      search?: string;
      status?: 'ongoing' | 'pending' | 'closed' | 'all';
      court?: string;
      matterType?: string;
      clientId?: string;
      scope?: 'my' | 'team' | 'all';
      sortBy?: 'case_date' | 'created_at' | 'updated_at';
      sortOrder?: 'asc' | 'desc';
    }
  ): Promise<CaseRecord[]>;
  getById(context: SecurityContext, id: string): Promise<CaseRecord | null>;
  create(
    context: SecurityContext,
    data: Omit<CaseRecord, keyof BaseRecord | 'nextHearingAt'>
  ): Promise<CaseRecord>;
  update(
    context: SecurityContext,
    id: string,
    data: Partial<Omit<CaseRecord, 'id' | 'firmId' | 'createdAt' | 'deletedAt' | 'createdBy'>>
  ): Promise<CaseRecord>;
  delete(context: SecurityContext, id: string): Promise<{ success: boolean; softDeleted: true }>;
  getLinkedCounts(
    context: SecurityContext,
    caseId: string
  ): Promise<{
    hearingsCount: number;
    tasksCount: number;
    filesCount: number;
    remindersCount: number;
  }>;
  getByClientId(context: SecurityContext, clientId: string): Promise<CaseRecord[]>;
  checkDuplicate(
    context: SecurityContext,
    caseNumber: string,
    court: string,
    excludeId?: string
  ): Promise<boolean>;
  listShares?(context: SecurityContext, caseId: string): Promise<CaseShareRecord[]>;
  shareCase?(context: SecurityContext, caseId: string, userId: string): Promise<CaseShareRecord>;
  unshareCase?(context: SecurityContext, caseId: string, shareIdOrUserId: string): Promise<void>;
  listNotes(context: SecurityContext, caseId: string, options?: { limit?: number; offset?: number }): Promise<{ notes: CaseNoteRecord[]; total: number }>;
  createNote(context: SecurityContext, caseId: string, data: { noteDate: string; body: string }): Promise<CaseNoteRecord>;
  updateNote(context: SecurityContext, caseId: string, noteId: string, data: { noteDate?: string; body?: string }): Promise<CaseNoteRecord>;
  deleteNote(context: SecurityContext, caseId: string, noteId: string): Promise<{ success: boolean; softDeleted: true }>;
}

export interface IAppointmentRepository {
  list(
    context: SecurityContext,
    filter?: {
      status?: AppointmentRecord['status'] | 'all';
      type?: AppointmentRecord['type'] | 'all';
      range?: 'upcoming' | 'past' | 'all';
      fromDate?: string;
      toDate?: string;
      clientId?: string;
      caseId?: string;
      search?: string;
    }
  ): Promise<AppointmentRecord[]>;
  getById(context: SecurityContext, id: string): Promise<AppointmentRecord | null>;
  create(
    context: SecurityContext,
    data: {
      title: string;
      type: AppointmentRecord['type'];
      startsAt: string;
      endsAt: string;
      mode?: AppointmentRecord['mode'];
      status?: AppointmentRecord['status'];
      location?: string | null;
      clientId?: string | null;
      caseId?: string | null;
      notes?: string | null;
      reminderMinutesBefore?: number;
      attendees?: string[];
    }
  ): Promise<AppointmentRecord & { overlapWarning?: boolean }>;
  update(
    context: SecurityContext,
    id: string,
    data: Partial<{
      title: string;
      type: AppointmentRecord['type'];
      startsAt: string;
      endsAt: string;
      mode: AppointmentRecord['mode'];
      location: string | null;
      clientId: string | null;
      caseId: string | null;
      status: AppointmentRecord['status'];
      notes: string | null;
      reminderMinutesBefore: number;
      attendees: string[];
      rescheduleReason?: string;
    }>
  ): Promise<AppointmentRecord & { overlapWarning?: boolean }>;
  delete(context: SecurityContext, id: string): Promise<{ success: boolean; softDeleted: true }>;
}

export interface CaseHearingsOverview {
  previousHearing: HearingRecord | null;
  currentHearing: HearingRecord | null;
  nextHearing: HearingRecord | null;
  allHearings: HearingRecord[];
}

export interface IHearingRepository {
  list(
    context: SecurityContext,
    filter?: {
      caseId?: string;
      status?: HearingStatus;
      fromDate?: string;
      toDate?: string;
      fixedFor?: string;
    }
  ): Promise<HearingRecord[]>;
  getById(context: SecurityContext, id: string): Promise<HearingRecord | null>;
  create(
    context: SecurityContext,
    data: {
      caseId: string;
      appearingLawyerId?: string | null;
      scheduledAt: string;
      purpose: string;
      court?: string;
      outcomeNote?: string;
      fixedFor?: string;
      fixedForNote?: string | null;
    }
  ): Promise<HearingRecord>;
  update(
    context: SecurityContext,
    id: string,
    data: Partial<Omit<HearingRecord, 'id' | 'firmId' | 'caseId' | 'createdAt' | 'deletedAt' | 'createdBy'>>
  ): Promise<HearingRecord>;
  rescheduleDate(
    context: SecurityContext,
    hearingId: string,
    newDate: string,
    reason: string,
    fixedFor?: string,
    fixedForNote?: string | null
  ): Promise<{ hearing: HearingRecord; history: HearingDateHistoryRecord }>;
  adjournAndScheduleNext(
    context: SecurityContext,
    hearingId: string,
    outcomeNote: string,
    nextDate: string,
    nextPurpose: string,
    reason: string,
    nextFixedFor?: string,
    nextFixedForNote?: string | null
  ): Promise<{
    adjournedHearing: HearingRecord;
    nextHearing: HearingRecord;
    history: HearingDateHistoryRecord;
  }>;
  getDateHistory(context: SecurityContext, hearingId: string): Promise<HearingDateHistoryRecord[]>;
  getCaseHearingsOverview(context: SecurityContext, caseId: string): Promise<CaseHearingsOverview>;
  bulkUpdateStatus(
    context: SecurityContext,
    hearingIds: string[],
    status: HearingStatus,
    outcomeNote?: string
  ): Promise<{ updatedCount: number }>;
  bulkAdjourn(
    context: SecurityContext,
    hearingIds: string[],
    nextDate: string,
    reason: string,
    nextFixedFor?: string,
    outcomeNote?: string
  ): Promise<{ adjournedCount: number }>;
  bulkReschedule(
    context: SecurityContext,
    hearingIds: string[],
    newDate: string,
    reason: string,
    fixedFor?: string
  ): Promise<{ rescheduledCount: number }>;
}

export interface ITaskRepository {
  list(
    context: SecurityContext,
    filter?: {
      caseId?: string;
      clientId?: string;
      assignedTo?: string;
      status?: TaskStatus | 'active';
      priority?: TaskPriority;
      search?: string;
    }
  ): Promise<TaskRecord[]>;
  getById(context: SecurityContext, id: string): Promise<TaskRecord | null>;
  create(
    context: SecurityContext,
    data: {
      title: string;
      description?: string;
      assignedTo: string;
      dueAt: string;
      priority: TaskPriority;
      caseId?: string | null;
      clientId?: string | null;
    }
  ): Promise<TaskRecord>;
  update(
    context: SecurityContext,
    id: string,
    data: Partial<Omit<TaskRecord, 'id' | 'firmId' | 'createdAt' | 'deletedAt' | 'createdBy'>>
  ): Promise<TaskRecord>;
  complete(context: SecurityContext, id: string, note?: string): Promise<TaskRecord>;
  reassign(
    context: SecurityContext,
    id: string,
    newAssignedTo: string,
    reason?: string
  ): Promise<TaskRecord>;
  delete(context: SecurityContext, id: string): Promise<{ success: boolean; softDeleted: true }>;
  getByCaseId(context: SecurityContext, caseId: string): Promise<TaskRecord[]>;
  getByClientId(context: SecurityContext, clientId: string): Promise<TaskRecord[]>;
}

export interface IPhysicalFileRepository {
  list(
    context: SecurityContext,
    filter?: {
      caseId?: string;
      clientId?: string;
      status?: PhysicalFileStatus | 'all';
      holderId?: string;
      search?: string;
    }
  ): Promise<PhysicalFileRecord[]>;
  getById(context: SecurityContext, id: string): Promise<PhysicalFileRecord | null>;
  getBySerial(context: SecurityContext, serial: string): Promise<PhysicalFileRecord | null>;
  create(
    context: SecurityContext,
    data: {
      title: string;
      caseId?: string | null;
      clientId?: string | null;
      shelfLocation?: string;
      notes?: string;
      serial?: string;
    }
  ): Promise<PhysicalFileRecord>;
  update(
    context: SecurityContext,
    id: string,
    data: Partial<
      Omit<PhysicalFileRecord, 'id' | 'firmId' | 'serial' | 'createdAt' | 'deletedAt' | 'createdBy'>
    >
  ): Promise<PhysicalFileRecord>;
  checkOut(
    context: SecurityContext,
    id: string,
    holderId: string,
    dueBackAt: string,
    note?: string
  ): Promise<{ file: PhysicalFileRecord; movement: FileMovementRecord }>;
  checkIn(
    context: SecurityContext,
    id: string,
    shelfLocation?: string,
    note?: string
  ): Promise<{ file: PhysicalFileRecord; movement: FileMovementRecord }>;
  dispatchToCourt(
    context: SecurityContext,
    id: string,
    courtName: string,
    holderId: string,
    dueBackAt: string,
    note?: string
  ): Promise<{ file: PhysicalFileRecord; movement: FileMovementRecord }>;
  getMovements(context: SecurityContext, fileId: string): Promise<FileMovementRecord[]>;
  delete(context: SecurityContext, id: string): Promise<{ success: boolean; softDeleted: true }>;
  getNextSerial(context: SecurityContext): Promise<string>;
  getByCaseId(context: SecurityContext, caseId: string): Promise<PhysicalFileRecord | null>;
}

export interface IReminderRepository {
  list(
    context: SecurityContext,
    filter?: {
      status?: ReminderStatus | 'active';
      sourceType?: ReminderSourceType;
      userId?: string;
      search?: string;
    }
  ): Promise<ReminderRecord[]>;
  getDueReminders(context: SecurityContext): Promise<ReminderRecord[]>;
  create(
    context: SecurityContext,
    data: {
      userId: string;
      sourceType: ReminderSourceType;
      sourceId: string;
      title: string;
      description?: string;
      remindAt: string;
      dueAt: string;
      channel?: ReminderChannel;
    }
  ): Promise<ReminderRecord>;
  dismiss(context: SecurityContext, id: string): Promise<ReminderRecord>;
  syncReminders(
    context: SecurityContext
  ): Promise<{ createdCount: number; updatedCount: number; activeReminders: ReminderRecord[] }>;
  clearBySourceId(context: SecurityContext, sourceId: string): Promise<{ dismissedCount: number }>;
  rescheduleBySourceId(
    context: SecurityContext,
    sourceId: string,
    newDueAt: string,
    newRemindAt?: string
  ): Promise<{ updatedCount: number }>;
}

export interface ICalendarRepository {
  getEvents(
    context: SecurityContext,
    range?: {
      startIso?: string;
      endIso?: string;
      type?: CalendarEventType | 'all';
    }
  ): Promise<CalendarEventRecord[]>;
  getDayCauseList(
    context: SecurityContext,
    dateIso: string
  ): Promise<{ date: string; hearings: CalendarEventRecord[]; firmName: string }>;
}

export interface ISearchRepository {
  search(
    context: SecurityContext,
    query: string,
    filter?: {
      entity?: SearchResultEntity | 'all';
      limit?: number;
    }
  ): Promise<SearchResultItem[]>;
}

export interface IDashboardRepository {
  getMetrics(context: SecurityContext): Promise<DashboardMetrics>;
  getUrgentItems(context: SecurityContext): Promise<DashboardUrgentItems>;
  getUpcomingHearings(context: SecurityContext, days?: number): Promise<HearingRecord[]>;
}

export interface IBackupRepository {
  createBackup(
    context: SecurityContext,
    options?: {
      password?: string;
    }
  ): Promise<{
    filename: string;
    payload: ChamberBackupPayload | EncryptedBackupPayload;
    jsonString: string;
    metadata: ChamberBackupMetadata;
    checksum: string;
    isEncrypted: boolean;
  }>;

  inspectBackup(
    context: SecurityContext,
    fileContent: string,
    password?: string
  ): Promise<RestorePreview>;

  restoreBackup(
    context: SecurityContext,
    fileContent: string,
    options: {
      password?: string;
      mode: RestoreMode;
    }
  ): Promise<RestoreResult>;
}



