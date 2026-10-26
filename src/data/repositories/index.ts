import {
  IAuditLogRepository,
  IAppointmentRepository,
  IBackupRepository,
  ICalendarRepository,
  ICaseRepository,
  IClientRepository,
  IDashboardRepository,
  IFirmRepository,
  IHearingRepository,
  IPhysicalFileRepository,
  IReminderRepository,
  ISearchRepository,
  ITaskRepository,
  IUserRepository,
} from '../interfaces';
import { MockAppointmentRepository } from './appointment';
import { MockAuditLogRepository } from './audit';
import { MockBackupRepository } from './backup';
import { MockCalendarRepository } from './calendar';
import { MockCaseRepository, syncCaseNextHearing } from './case';
import { MockClientRepository } from './client';
import { assertNotReadOnly, generateUUID } from './common';
import { MockDashboardRepository } from './dashboard';
import { MockPhysicalFileRepository } from './file';
import { MockFirmRepository } from './firm';
import { MockHearingRepository } from './hearing';
import { MockReminderRepository } from './reminder';
import { MockSearchRepository } from './search';
import { MockTaskRepository } from './task';
import { MockUserRepository } from './user';
import {
  RestAuditLogRepository,
  RestFirmRepository,
  RestUserRepository,
  RestClientRepository,
  RestCaseRepository,
  RestAppointmentRepository,
  RestHearingRepository,
} from './rest';

// Export all individual classes, helpers, and types
export {
  assertNotReadOnly,
  generateUUID,
  MockAppointmentRepository,
  MockAuditLogRepository,
  MockBackupRepository,
  MockCalendarRepository,
  MockCaseRepository,
  MockClientRepository,
  MockDashboardRepository,
  MockFirmRepository,
  MockHearingRepository,
  MockPhysicalFileRepository,
  MockReminderRepository,
  MockSearchRepository,
  MockTaskRepository,
  MockUserRepository,
  syncCaseNextHearing,
  RestAuditLogRepository,
  RestFirmRepository,
  RestUserRepository,
  RestClientRepository,
  RestCaseRepository,
  RestAppointmentRepository,
  RestHearingRepository,
};

// Single registry of repositories
export interface Repositories {
  auditLog: IAuditLogRepository | RestAuditLogRepository;
  user: IUserRepository;
  firm: IFirmRepository;
  client: IClientRepository;
  case: ICaseRepository;
  appointment: IAppointmentRepository;
  hearing: IHearingRepository;
  task: ITaskRepository;
  physicalFile: IPhysicalFileRepository;
  reminder: IReminderRepository;
  calendar: ICalendarRepository;
  search: ISearchRepository;
  dashboard: IDashboardRepository;
  backup: IBackupRepository;
}

const isRestMode =
  typeof import.meta !== 'undefined' &&
  import.meta.env?.VITE_DATA_SOURCE === 'rest';

const mockAuditLogRepo = new MockAuditLogRepository();
const auditLogRepo: IAuditLogRepository | RestAuditLogRepository = isRestMode
  ? new RestAuditLogRepository()
  : mockAuditLogRepo;

const userRepo: IUserRepository = isRestMode
  ? new RestUserRepository()
  : new MockUserRepository(mockAuditLogRepo);

const firmRepo: IFirmRepository = isRestMode
  ? new RestFirmRepository()
  : new MockFirmRepository(mockAuditLogRepo);

const clientRepo: IClientRepository = isRestMode
  ? new RestClientRepository()
  : new MockClientRepository(mockAuditLogRepo);

const caseRepo: ICaseRepository = isRestMode
  ? new RestCaseRepository()
  : new MockCaseRepository(mockAuditLogRepo);

const appointmentRepo: IAppointmentRepository = isRestMode
  ? new RestAppointmentRepository()
  : new MockAppointmentRepository(mockAuditLogRepo);

const reminderRepo = new MockReminderRepository(mockAuditLogRepo);
const hearingRepo: IHearingRepository = isRestMode
  ? new RestHearingRepository()
  : new MockHearingRepository(mockAuditLogRepo, reminderRepo);
const taskRepo = new MockTaskRepository(mockAuditLogRepo, reminderRepo);
const physicalFileRepo = new MockPhysicalFileRepository(mockAuditLogRepo, reminderRepo);
const calendarRepo = new MockCalendarRepository();
const searchRepo = new MockSearchRepository();
const dashboardRepo = new MockDashboardRepository();
const backupRepo = new MockBackupRepository(mockAuditLogRepo);

export const repositories: Repositories = {
  auditLog: auditLogRepo,
  user: userRepo,
  firm: firmRepo,
  client: clientRepo,
  case: caseRepo,
  appointment: appointmentRepo,
  hearing: hearingRepo,
  task: taskRepo,
  physicalFile: physicalFileRepo,
  reminder: reminderRepo,
  calendar: calendarRepo,
  search: searchRepo,
  dashboard: dashboardRepo,
  backup: backupRepo,
};

export function getRepositories(): Repositories {
  return repositories;
}
