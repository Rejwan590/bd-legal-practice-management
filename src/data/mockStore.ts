import { ALL_PERMISSIONS, DEFAULT_STAFF_PERMISSIONS } from '../permissions';
import {
  AppointmentRecord,
  AppointmentAttendeeRecord,
  AuditLogRecord,
  CaseNoteRecord,
  CaseRecord,
  CaseShareRecord,
  ClientNoteRecord,
  ClientPhotoRecord,
  ClientRecord,
  FileMovementRecord,
  FirmRecord,
  HearingDateHistoryRecord,
  HearingRecord,
  PhysicalFileRecord,
  ReminderRecord,
  TaskRecord,
  UserRecord,
  FeeAgreement,
  FeeAgreementChange,
  FeePayment,
  ExpenseCategory,
  Expense,
} from './types';


export const DEFAULT_FIRM_ID = 'firm-bd-001';


export const INITIAL_FIRM: FirmRecord = {
  id: DEFAULT_FIRM_ID,
  firmId: DEFAULT_FIRM_ID,
  name: 'Rahman & Associates Chambers',
  barCouncilReg: 'BC-DHK-2012-9844',
  officeAddress: 'Suite 402, Supreme Court Bar Association Building, Ramna, Dhaka-1000',
  courtAffiliations: 'Supreme Court of Bangladesh (High Court & Appellate Division), Dhaka District & Sessions Judge Court',
  planId: 'annual-standard',
  licenseExpiresAt: '2027-12-31T23:59:59.000Z',
  status: 'active',
  visibilityMode: 'open',
  createdAt: '2024-01-01T00:00:00.000Z',
  updatedAt: '2024-01-01T00:00:00.000Z',
  deletedAt: null,
  createdBy: 'user-owner-001',
  updatedBy: 'user-owner-001',
};

export const INITIAL_CLIENTS: ClientRecord[] = [
  {
    id: 'client-001',
    firmId: DEFAULT_FIRM_ID,
    name: 'Haji Mohammad Rafiqul Islam',
    nameBn: 'হাজী মোহাম্মদ রফিকুল ইসলাম',
    phone: '+880 1711-234567',
    email: 'rafiqul.islam@example.com',
    address: 'House 14, Road 5, Motijheel C/A, Dhaka-1000',
    notes: 'Longstanding family client. Title suit and land partition matters in Dhaka District Court.',
    createdAt: '2024-01-10T10:00:00.000Z',
    updatedAt: '2024-01-10T10:00:00.000Z',
    deletedAt: null,
    createdBy: 'user-owner-001',
    updatedBy: 'user-owner-001',
  },
  {
    id: 'client-002',
    firmId: DEFAULT_FIRM_ID,
    name: 'Begum Rokeya Sultana',
    nameBn: 'বেগম রোকেয়া সুলতানা',
    phone: '+880 1819-876543',
    email: 'rokeya.sultana@example.com',
    address: 'Flat 4B, Concord Tower, Dhanmondi 27, Dhaka-1209',
    notes: 'Civil Revision before High Court Division concerning property decree execution.',
    createdAt: '2024-01-15T11:30:00.000Z',
    updatedAt: '2024-01-15T11:30:00.000Z',
    deletedAt: null,
    createdBy: 'user-owner-001',
    updatedBy: 'user-owner-001',
  },
  {
    id: 'client-003',
    firmId: DEFAULT_FIRM_ID,
    name: 'Kabir Steel Mills Ltd.',
    nameBn: 'কবীর স্টিল মিলস লিমিটেড',
    phone: '+880 1912-345678',
    email: 'legal@kabirsteel.com.bd',
    address: 'Agrabad Commercial Area, Chattogram-4100',
    notes: 'Commercial recovery matter and Letter of Credit arbitration.',
    createdAt: '2024-02-01T09:00:00.000Z',
    updatedAt: '2024-02-01T09:00:00.000Z',
    deletedAt: null,
    createdBy: 'user-owner-001',
    updatedBy: 'user-owner-001',
  },
];

export const INITIAL_CASES: CaseRecord[] = [
  {
    id: 'case-001',
    firmId: DEFAULT_FIRM_ID,
    clientId: 'client-001',
    fileSerial: 'F-2023-0045',
    caseNumber: 'Title Suit No. 45/2023',
    court: '1st Joint District Judge Court, Dhaka',
    matterType: 'Civil / Land Title Partition',
    description: 'Partition suit regarding inherited ancestral commercial property at Motijheel C/A.',
    plaintiff: 'Haji Mohammad Rafiqul Islam & Others',
    defendant: 'Azizur Rahman & 4 Others',
    partyARole: 'Plaintiff',
    partyBRole: 'Defendant',
    ourRole: 'Plaintiff',
    caseCategory: 'civil',
    caseDate: '2023-03-15',
    plaintiffLawyer: 'Adv. Mahbubur Rahman',
    defendantLawyer: 'Adv. Shamsul Huda',
    status: 'ongoing',
    restricted: false,
    nextHearingAt: '2026-10-15T04:30:00.000Z',
    createdAt: '2024-01-12T10:00:00.000Z',
    updatedAt: '2024-01-12T10:00:00.000Z',
    deletedAt: null,
    createdBy: 'user-owner-001',
    updatedBy: 'user-owner-001',
  },
  {
    id: 'case-002',
    firmId: DEFAULT_FIRM_ID,
    clientId: 'client-002',
    fileSerial: 'F-2023-0102',
    caseNumber: 'Civil Revision No. 1894/2023',
    court: 'Supreme Court of Bangladesh (High Court Division)',
    matterType: 'Revision under Section 115 CPC',
    description: 'Challenging judgment of District Judge regarding execution of decree.',
    plaintiff: 'Begum Rokeya Sultana',
    defendant: 'Land Reforms Board & Government of Bangladesh',
    partyARole: 'Petitioner',
    partyBRole: 'Respondent',
    ourRole: 'Petitioner',
    caseCategory: 'civil',
    caseDate: '2023-06-20',
    plaintiffLawyer: 'Adv. Mahbubur Rahman (Senior Advocate)',
    defendantLawyer: 'Deputy Attorney General (State)',
    status: 'ongoing',
    restricted: false,
    nextHearingAt: '2026-10-22T05:00:00.000Z',
    createdAt: '2024-01-18T11:00:00.000Z',
    updatedAt: '2024-01-18T11:00:00.000Z',
    deletedAt: null,
    createdBy: 'user-owner-001',
    updatedBy: 'user-owner-001',
  },
  {
    id: 'case-003',
    firmId: DEFAULT_FIRM_ID,
    clientId: 'client-003',
    fileSerial: 'F-2022-0088',
    caseNumber: 'Company Matter No. 88/2022',
    court: 'High Court Division (Company Bench)',
    matterType: 'Company Law & Commercial Arbitration',
    description: 'High-value Letter of Credit encashment and cross-border commercial arbitration. Strictly confidential chamber matter.',
    plaintiff: 'Kabir Steel Mills Ltd.',
    defendant: 'Sonali Bank PLC & Standard Chartered Bank',
    partyARole: 'Petitioner',
    partyBRole: 'Respondent',
    ourRole: 'Petitioner',
    caseCategory: 'civil',
    caseDate: '2022-11-10',
    plaintiffLawyer: 'Adv. Mahbubur Rahman',
    defendantLawyer: 'Barrister Rafiq-ul Huq Associates',
    status: 'ongoing',
    restricted: true, // Restricted / Confidential case
    nextHearingAt: '2026-11-05T04:30:00.000Z',
    createdAt: '2024-02-05T09:30:00.000Z',
    updatedAt: '2024-02-05T09:30:00.000Z',
    deletedAt: null,
    createdBy: 'user-owner-001',
    updatedBy: 'user-owner-001',
  },
  {
    id: 'case-004',
    firmId: DEFAULT_FIRM_ID,
    clientId: 'client-001',
    fileSerial: 'F-2024-0012',
    caseNumber: 'Misc. Case No. 12/2024',
    court: 'Dhaka District & Sessions Judge Court',
    matterType: 'Injunction Application (Order 39)',
    description: 'Application for temporary injunction against unauthorized construction work.',
    plaintiff: 'Haji Mohammad Rafiqul Islam',
    defendant: 'City Corporation & Developers',
    partyARole: 'Applicant',
    partyBRole: 'Opposite Party',
    ourRole: 'Applicant',
    caseCategory: 'civil',
    caseDate: '2024-02-10',
    plaintiffLawyer: 'Adv. Nusrat Jahan',
    defendantLawyer: 'Legal Counsel, DNCC',
    status: 'ongoing',
    restricted: false,
    nextHearingAt: '2026-10-18T05:00:00.000Z',
    createdAt: '2024-02-10T14:00:00.000Z',
    updatedAt: '2024-02-10T14:00:00.000Z',
    deletedAt: null,
    createdBy: 'user-owner-001',
    updatedBy: 'user-owner-001',
  },
];

export const INITIAL_HEARINGS: HearingRecord[] = [
  {
    id: 'hearing-001',
    firmId: DEFAULT_FIRM_ID,
    caseId: 'case-001',
    scheduledAt: '2026-10-15T04:30:00.000Z',
    purpose: 'Cross Examination of Defendant Witness 1 (DW-1)',
    status: 'scheduled',
    outcomeNote: 'Summons served on DW-1. Part-heard matter.',
    createdAt: '2024-01-12T10:00:00.000Z',
    updatedAt: '2026-09-25T07:15:00.000Z',
    deletedAt: null,
    createdBy: 'user-owner-001',
    updatedBy: 'user-owner-001',
  },
  {
    id: 'hearing-002',
    firmId: DEFAULT_FIRM_ID,
    caseId: 'case-001',
    scheduledAt: '2026-09-10T04:30:00.000Z',
    purpose: 'Examination-in-Chief of Plaintiff Witness 2 (PW-2)',
    status: 'held',
    outcomeNote: 'PW-2 examined and cross-examined in full. Adjourned for DW-1.',
    createdAt: '2024-01-12T10:00:00.000Z',
    updatedAt: '2026-09-10T08:00:00.000Z',
    deletedAt: null,
    createdBy: 'user-owner-001',
    updatedBy: 'user-owner-001',
  },
  {
    id: 'hearing-003',
    firmId: DEFAULT_FIRM_ID,
    caseId: 'case-002',
    scheduledAt: '2026-10-22T05:00:00.000Z',
    purpose: 'Final Hearing on Rule Nisi',
    status: 'scheduled',
    outcomeNote: 'LCR (Lower Court Records) received. Ready for final argument.',
    createdAt: '2024-01-18T11:00:00.000Z',
    updatedAt: '2024-01-18T11:00:00.000Z',
    deletedAt: null,
    createdBy: 'user-owner-001',
    updatedBy: 'user-owner-001',
  },
  {
    id: 'hearing-004',
    firmId: DEFAULT_FIRM_ID,
    caseId: 'case-003',
    scheduledAt: '2026-11-05T04:30:00.000Z',
    purpose: 'Hearing on Company Bench Injunction Application',
    status: 'scheduled',
    outcomeNote: 'Interim order extended until next date.',
    createdAt: '2024-02-05T09:30:00.000Z',
    updatedAt: '2024-02-05T09:30:00.000Z',
    deletedAt: null,
    createdBy: 'user-owner-001',
    updatedBy: 'user-owner-001',
  },
  {
    id: 'hearing-005',
    firmId: DEFAULT_FIRM_ID,
    caseId: 'case-004',
    scheduledAt: '2026-10-18T05:00:00.000Z',
    purpose: 'Hearing on Order 39 Rule 1 Application',
    status: 'scheduled',
    outcomeNote: 'Opposite party filed time petition on previous date.',
    createdAt: '2024-02-10T14:00:00.000Z',
    updatedAt: '2024-02-10T14:00:00.000Z',
    deletedAt: null,
    createdBy: 'user-owner-001',
    updatedBy: 'user-owner-001',
  },
];

export const INITIAL_HEARING_DATE_HISTORY: HearingDateHistoryRecord[] = [
  {
    id: 'hist-001',
    firmId: DEFAULT_FIRM_ID,
    hearingId: 'hearing-001',
    caseId: 'case-001',
    oldAt: '2026-09-25T04:30:00.000Z',
    newAt: '2026-10-15T04:30:00.000Z',
    reason: "Time petition (Sullah/Hazira) moved by Opposite Party stating witness ill",
    changedBy: 'user-owner-001',
    changedByName: 'Adv. Mahbubur Rahman',
    changedAt: '2026-09-25T07:15:00.000Z',
  },
];

export const INITIAL_USERS: UserRecord[] = [
  {
    id: 'user-owner-001',
    firmId: DEFAULT_FIRM_ID,
    name: 'Adv. Mahbubur Rahman',
    email: 'sample-lawyer@demo-chamber.local',
    role: 'Owner',
    jobType: 'lawyer_senior',
    jobTitleLabel: 'Senior Advocate & Head of Chamber',
    reportsToUserId: null,
    permissions: ALL_PERMISSIONS,
    language: 'en',
    active: true,
    createdAt: '2024-01-01T00:00:00.000Z',
    updatedAt: '2024-01-01T00:00:00.000Z',
    deletedAt: null,
    createdBy: 'user-owner-001',
    updatedBy: 'user-owner-001',
  },
  {
    id: 'user-staff-002',
    firmId: DEFAULT_FIRM_ID,
    name: 'Adv. Nusrat Jahan',
    email: 'sample-associate@demo-chamber.local',
    role: 'Staff',
    jobType: 'other',
    jobTitleLabel: 'Associate',
    reportsToUserId: null,
    permissions: DEFAULT_STAFF_PERMISSIONS,
    language: 'en',
    active: true,
    createdAt: '2024-01-02T00:00:00.000Z',
    updatedAt: '2024-01-02T00:00:00.000Z',
    deletedAt: null,
    createdBy: 'user-owner-001',
    updatedBy: 'user-owner-001',
  },
];

export const INITIAL_TASKS: TaskRecord[] = [
  {
    id: 'task-001',
    firmId: DEFAULT_FIRM_ID,
    caseId: 'case-001',
    clientId: 'client-001',
    assignedTo: 'user-staff-002',
    assignedToName: 'Adv. Nusrat Jahan',
    title: 'Draft Cross-Examination Questionnaire for DW-1',
    description: 'Prepare focused questions on boundary demarcation and CS vs RS survey records for DW-1 cross-examination.',
    priority: 'high',
    dueAt: '2026-10-14T10:00:00.000Z',
    status: 'pending',
    completedAt: null,
    createdAt: '2024-03-01T10:00:00.000Z',
    updatedAt: '2024-03-01T10:00:00.000Z',
    deletedAt: null,
    createdBy: 'user-owner-001',
    updatedBy: 'user-owner-001',
  },
  {
    id: 'task-002',
    firmId: DEFAULT_FIRM_ID,
    caseId: 'case-001',
    clientId: 'client-001',
    assignedTo: 'user-staff-002',
    assignedToName: 'Adv. Nusrat Jahan',
    title: 'Collect certified Khatiyan & Porcha records from AC (Land) office',
    description: 'Procure duplicate carbon copy of Mutation Khatian No. 4412 for Motijheel C/A premises.',
    priority: 'medium',
    dueAt: '2026-09-30T17:00:00.000Z', // Overdue relative to 2026-10-03
    status: 'pending',
    completedAt: null,
    createdAt: '2024-03-02T11:00:00.000Z',
    updatedAt: '2024-03-02T11:00:00.000Z',
    deletedAt: null,
    createdBy: 'user-owner-001',
    updatedBy: 'user-owner-001',
  },
  {
    id: 'task-003',
    firmId: DEFAULT_FIRM_ID,
    caseId: 'case-002',
    clientId: 'client-002',
    assignedTo: 'user-owner-001',
    assignedToName: 'Adv. Mahbubur Rahman',
    title: 'Prepare Written Submissions on Section 115 CPC Revision',
    description: 'Review Lower Court Records (LCR) and cite relevant DLR decisions on material irregularity in decree execution.',
    priority: 'urgent',
    dueAt: '2026-10-20T12:00:00.000Z',
    status: 'in_progress',
    completedAt: null,
    createdAt: '2024-03-05T09:00:00.000Z',
    updatedAt: '2024-03-05T09:00:00.000Z',
    deletedAt: null,
    createdBy: 'user-owner-001',
    updatedBy: 'user-owner-001',
  },
  {
    id: 'task-004',
    firmId: DEFAULT_FIRM_ID,
    caseId: 'case-004',
    clientId: 'client-001',
    assignedTo: 'user-staff-002',
    assignedToName: 'Adv. Nusrat Jahan',
    title: 'Serve notice of Order 39 Injunction application upon opposite counsel',
    description: 'Obtain receipt acknowledgment from legal counsel for DNCC.',
    priority: 'normal',
    dueAt: '2026-09-20T16:00:00.000Z',
    status: 'completed',
    completedAt: '2026-09-19T14:30:00.000Z',
    createdAt: '2024-02-15T10:00:00.000Z',
    updatedAt: '2026-09-19T14:30:00.000Z',
    deletedAt: null,
    createdBy: 'user-owner-001',
    updatedBy: 'user-staff-002',
  },
  {
    id: 'task-005',
    firmId: DEFAULT_FIRM_ID,
    caseId: 'case-003', // Confidential case!
    clientId: 'client-003',
    assignedTo: 'user-owner-001',
    assignedToName: 'Adv. Mahbubur Rahman',
    title: 'Draft Confidential Arbitration Memorial for LC Claim',
    description: 'High-value LC encashment memorial. Strictly confidential chamber matter.',
    priority: 'urgent',
    dueAt: '2026-11-01T15:00:00.000Z',
    status: 'pending',
    completedAt: null,
    createdAt: '2024-03-10T12:00:00.000Z',
    updatedAt: '2024-03-10T12:00:00.000Z',
    deletedAt: null,
    createdBy: 'user-owner-001',
    updatedBy: 'user-owner-001',
  },
];

export const INITIAL_PHYSICAL_FILES: PhysicalFileRecord[] = [
  {
    id: 'file-001',
    firmId: DEFAULT_FIRM_ID,
    serial: 'F-000101',
    caseId: 'case-001',
    clientId: 'client-001',
    title: 'Title Suit No. 45/2023 - Main Case File (Original Documents Bundle)',
    shelfLocation: 'Cabinet A, Shelf 2',
    status: 'checked_out',
    currentHolderId: 'user-staff-002',
    currentHolderName: 'Adv. Nusrat Jahan',
    checkedOutAt: '2026-09-28T09:00:00.000Z',
    dueBackAt: '2026-10-01T17:00:00.000Z', // Overdue return relative to 2026-10-03
    notes: 'Contains original CS Porcha, mutation khatian, and partition compromise deed.',
    createdAt: '2024-01-12T10:00:00.000Z',
    updatedAt: '2026-09-28T09:00:00.000Z',
    deletedAt: null,
    createdBy: 'user-owner-001',
    updatedBy: 'user-owner-001',
  },
  {
    id: 'file-002',
    firmId: DEFAULT_FIRM_ID,
    serial: 'F-000102',
    caseId: 'case-002',
    clientId: 'client-002',
    title: 'Civil Revision No. 1894/2023 - High Court Brief & Certified Orders',
    shelfLocation: 'Cabinet B, Shelf 1',
    status: 'in_chamber',
    currentHolderId: null,
    currentHolderName: null,
    checkedOutAt: null,
    dueBackAt: null,
    notes: 'Lower court records copy bundle and certified trial judgment.',
    createdAt: '2024-01-18T11:00:00.000Z',
    updatedAt: '2024-01-18T11:00:00.000Z',
    deletedAt: null,
    createdBy: 'user-owner-001',
    updatedBy: 'user-owner-001',
  },
  {
    id: 'file-003',
    firmId: DEFAULT_FIRM_ID,
    serial: 'F-000103',
    caseId: 'case-003', // Confidential case!
    clientId: 'client-003',
    title: 'Company Matter No. 88/2022 - LC Guarantee Arbitration Dossier',
    shelfLocation: 'Senior Partner Safe Box',
    status: 'in_chamber',
    currentHolderId: null,
    currentHolderName: null,
    checkedOutAt: null,
    dueBackAt: null,
    notes: 'Restricted partner-only physical file. Cross-border banking LC documents.',
    createdAt: '2024-02-05T09:30:00.000Z',
    updatedAt: '2024-02-05T09:30:00.000Z',
    deletedAt: null,
    createdBy: 'user-owner-001',
    updatedBy: 'user-owner-001',
  },
  {
    id: 'file-004',
    firmId: DEFAULT_FIRM_ID,
    serial: 'F-000104',
    caseId: 'case-004',
    clientId: 'client-001',
    title: 'Misc. Case No. 12/2024 - Temporary Injunction Brief',
    shelfLocation: 'Cabinet A, Shelf 3',
    status: 'in_court',
    currentHolderId: 'user-owner-001',
    currentHolderName: 'Adv. Mahbubur Rahman',
    checkedOutAt: '2026-10-02T08:30:00.000Z',
    dueBackAt: '2026-11-25T17:00:00.000Z',
    notes: 'Dispatched to Dhaka District Judge Court for injunction hearing.',
    createdAt: '2024-02-10T14:00:00.000Z',
    updatedAt: '2026-10-02T08:30:00.000Z',
    deletedAt: null,
    createdBy: 'user-owner-001',
    updatedBy: 'user-owner-001',
  },
];

export const INITIAL_FILE_MOVEMENTS: FileMovementRecord[] = [
  {
    id: 'mov-001',
    firmId: DEFAULT_FIRM_ID,
    fileId: 'file-001',
    action: 'CHECKOUT',
    userId: 'user-staff-002',
    userName: 'Adv. Nusrat Jahan',
    at: '2026-09-28T09:00:00.000Z',
    dueBackAt: '2026-10-01T17:00:00.000Z',
    note: 'Checked out for witness examination preparation and document scrutiny.',
  },
  {
    id: 'mov-002',
    firmId: DEFAULT_FIRM_ID,
    fileId: 'file-004',
    action: 'COURT_DISPATCH',
    userId: 'user-owner-001',
    userName: 'Adv. Mahbubur Rahman',
    at: '2026-10-02T08:30:00.000Z',
    dueBackAt: '2026-10-05T17:00:00.000Z',
    note: 'Taken to Dhaka District Judge Court for Order 39 motion.',
  },
];

export const INITIAL_REMINDERS: ReminderRecord[] = [
  {
    id: 'rem-001',
    firmId: DEFAULT_FIRM_ID,
    userId: 'user-owner-001',
    userName: 'Adv. Mahbubur Rahman',
    sourceType: 'hearing',
    sourceId: 'hearing-004',
    title: 'Court Hearing Today: Criminal Misc. No. 512/2024',
    description: 'Anticipatory bail motion before High Court Division Annex Building Bench No. 12 at 10:30 AM.',
    remindAt: '2026-10-03T08:30:00.000Z',
    dueAt: '2026-10-03T10:30:00.000Z',
    channel: 'in_app',
    status: 'pending',
    dismissedAt: null,
    createdAt: '2024-03-01T09:00:00.000Z',
    updatedAt: '2024-03-01T09:00:00.000Z',
    deletedAt: null,
    createdBy: 'user-owner-001',
    updatedBy: 'user-owner-001',
  },
  {
    id: 'rem-002',
    firmId: DEFAULT_FIRM_ID,
    userId: 'user-staff-002',
    userName: 'Adv. Nusrat Jahan',
    sourceType: 'task',
    sourceId: 'task-002',
    title: 'Task Deadline: Draft Written Statement in Artha Rin Case',
    description: 'Statutory deadline under Section 12 Artha Rin Adalat Ain. Court filing due.',
    remindAt: '2026-09-29T10:00:00.000Z',
    dueAt: '2026-09-30T17:00:00.000Z',
    channel: 'in_app',
    status: 'pending',
    dismissedAt: null,
    createdAt: '2024-02-20T10:00:00.000Z',
    updatedAt: '2024-02-20T10:00:00.000Z',
    deletedAt: null,
    createdBy: 'user-owner-001',
    updatedBy: 'user-owner-001',
  },
  {
    id: 'rem-003',
    firmId: DEFAULT_FIRM_ID,
    userId: 'user-staff-002',
    userName: 'Adv. Nusrat Jahan',
    sourceType: 'file_return',
    sourceId: 'file-001',
    title: 'File Return Overdue: Title Suit No. 45/2023 (F-000101)',
    description: 'Original documents bundle checked out from Cabinet A, Shelf 2 was due on 2026-10-01.',
    remindAt: '2026-10-01T10:00:00.000Z',
    dueAt: '2026-10-01T17:00:00.000Z',
    channel: 'in_app',
    status: 'pending',
    dismissedAt: null,
    createdAt: '2026-09-28T09:00:00.000Z',
    updatedAt: '2026-09-28T09:00:00.000Z',
    deletedAt: null,
    createdBy: 'user-owner-001',
    updatedBy: 'user-owner-001',
  },
  {
    id: 'rem-004',
    firmId: DEFAULT_FIRM_ID,
    userId: 'user-staff-002',
    userName: 'Adv. Nusrat Jahan',
    sourceType: 'hearing',
    sourceId: 'hearing-001',
    title: 'Upcoming Hearing: Title Suit No. 45/2023',
    description: 'Scheduled for Plaintiff witness examination (PW-1 deposition) on 2026-10-15.',
    remindAt: '2026-10-14T09:00:00.000Z',
    dueAt: '2026-10-15T10:30:00.000Z',
    channel: 'in_app',
    status: 'pending',
    dismissedAt: null,
    createdAt: '2024-02-15T11:00:00.000Z',
    updatedAt: '2024-02-15T11:00:00.000Z',
    deletedAt: null,
    createdBy: 'user-owner-001',
    updatedBy: 'user-owner-001',
  },
];

export const INITIAL_CLIENT_PHOTOS: ClientPhotoRecord[] = [];

export const INITIAL_CLIENT_NOTES: ClientNoteRecord[] = [
  {
    id: 'cnote-001',
    firmId: DEFAULT_FIRM_ID,
    clientId: 'client-001',
    noteDate: '2024-01-10',
    body: 'Longstanding family client. Title suit and land partition matters in Dhaka District Court.',
    createdAt: '2024-01-10T10:00:00.000Z',
    updatedAt: '2024-01-10T10:00:00.000Z',
    deletedAt: null,
    createdBy: 'user-owner-001',
    updatedBy: 'user-owner-001',
  },
  {
    id: 'cnote-002',
    firmId: DEFAULT_FIRM_ID,
    clientId: 'client-002',
    noteDate: '2024-01-15',
    body: 'Civil Revision before High Court Division concerning property decree execution.',
    createdAt: '2024-01-15T11:30:00.000Z',
    updatedAt: '2024-01-15T11:30:00.000Z',
    deletedAt: null,
    createdBy: 'user-owner-001',
    updatedBy: 'user-owner-001',
  },
  {
    id: 'cnote-003',
    firmId: DEFAULT_FIRM_ID,
    clientId: 'client-003',
    noteDate: '2024-02-01',
    body: 'Commercial recovery matter and Letter of Credit arbitration.',
    createdAt: '2024-02-01T09:00:00.000Z',
    updatedAt: '2024-02-01T09:00:00.000Z',
    deletedAt: null,
    createdBy: 'user-owner-001',
    updatedBy: 'user-owner-001',
  },
];

export const INITIAL_CASE_NOTES: CaseNoteRecord[] = [
  {
    id: 'casenote-001',
    firmId: DEFAULT_FIRM_ID,
    caseId: 'case-001',
    noteDate: '2024-01-15',
    body: 'Filed plaint and obtained summons for opposite parties.',
    createdAt: '2024-01-15T10:00:00.000Z',
    updatedAt: '2024-01-15T10:00:00.000Z',
    deletedAt: null,
    createdBy: 'user-owner-001',
    updatedBy: 'user-owner-001',
  },
];

export const INITIAL_APPOINTMENTS: AppointmentRecord[] = [
  {
    id: 'appt-001',
    firmId: DEFAULT_FIRM_ID,
    title: 'Consultation: Haji Mohammad Rafiqul Islam',
    type: 'consultation',
    startsAt: '2026-10-21T10:00:00.000Z',
    endsAt: '2026-10-21T11:00:00.000Z',
    mode: 'in_person',
    location: 'Chamber Conference Room',
    organiserUserId: 'user-owner-001',
    clientId: 'client-001',
    caseId: 'case-001',
    status: 'scheduled',
    notes: 'Discuss cross-examination strategy for DW-1',
    reminderMinutesBefore: 30,
    attendees: ['user-owner-001', 'user-staff-002'],
    createdAt: '2024-02-15T10:00:00.000Z',
    updatedAt: '2024-02-15T10:00:00.000Z',
    deletedAt: null,
    createdBy: 'user-owner-001',
    updatedBy: 'user-owner-001',
  },
  {
    id: 'appt-002',
    firmId: DEFAULT_FIRM_ID,
    title: 'Chamber Weekly Briefing',
    type: 'internal_meeting',
    startsAt: '2026-10-22T15:00:00.000Z',
    endsAt: '2026-10-22T16:00:00.000Z',
    mode: 'in_person',
    location: 'Main Library',
    organiserUserId: 'user-owner-001',
    status: 'scheduled',
    reminderMinutesBefore: 15,
    attendees: ['user-owner-001', 'user-staff-002'],
    createdAt: '2024-02-15T10:00:00.000Z',
    updatedAt: '2024-02-15T10:00:00.000Z',
    deletedAt: null,
    createdBy: 'user-owner-001',
    updatedBy: 'user-owner-001',
  },
];

export const INITIAL_APPOINTMENT_ATTENDEES: AppointmentAttendeeRecord[] = [
  {
    id: 'att-001',
    appointmentId: 'appt-001',
    userId: 'user-owner-001',
    firmId: DEFAULT_FIRM_ID,
    createdAt: '2024-02-15T10:00:00.000Z',
    updatedAt: '2024-02-15T10:00:00.000Z',
  },
  {
    id: 'att-002',
    appointmentId: 'appt-001',
    userId: 'user-staff-002',
    firmId: DEFAULT_FIRM_ID,
    createdAt: '2024-02-15T10:00:00.000Z',
    updatedAt: '2024-02-15T10:00:00.000Z',
  },
  {
    id: 'att-003',
    appointmentId: 'appt-002',
    userId: 'user-owner-001',
    firmId: DEFAULT_FIRM_ID,
    createdAt: '2024-02-15T10:00:00.000Z',
    updatedAt: '2024-02-15T10:00:00.000Z',
  },
  {
    id: 'att-004',
    appointmentId: 'appt-002',
    userId: 'user-staff-002',
    firmId: DEFAULT_FIRM_ID,
    createdAt: '2024-02-15T10:00:00.000Z',
    updatedAt: '2024-02-15T10:00:00.000Z',
  },
];

export interface AppStoreData {
  firm: FirmRecord;
  users: UserRecord[];
  clients: ClientRecord[];
  clientPhotos?: ClientPhotoRecord[];
  clientNotes?: ClientNoteRecord[];
  cases: CaseRecord[];
  caseNotes?: CaseNoteRecord[];
  caseShares: CaseShareRecord[];
  hearings: HearingRecord[];
  hearingDateHistory: HearingDateHistoryRecord[];
  tasks: TaskRecord[];
  physicalFiles: PhysicalFileRecord[];
  fileMovements: FileMovementRecord[];
  appointments?: AppointmentRecord[];
  appointmentAttendees?: AppointmentAttendeeRecord[];
  reminders: ReminderRecord[];
  auditLogs: AuditLogRecord[];
  feeAgreements?: FeeAgreement[];
  feeAgreementChanges?: FeeAgreementChange[];
  feePayments?: FeePayment[];
  expenseCategories?: ExpenseCategory[];
  expenses?: Expense[];
  customCollections: Record<string, unknown[]>;
}

const STORAGE_KEY = 'bd_legal_store_v1';

class LocalStoreManager {
  private data: AppStoreData;

  constructor() {
    this.data = this.load();
  }

  private load(): AppStoreData {
    if (typeof window === 'undefined') {
      return this.getInitialState();
    }
    try {
      const serialized = localStorage.getItem(STORAGE_KEY);
      if (!serialized) {
        const initial = this.getInitialState();
        this.saveState(initial);
        return initial;
      }
      const parsed = JSON.parse(serialized);
      // Ensure collections exist even if storage had earlier stage format
      if (!parsed.firm || typeof parsed.firm !== 'object') {
        parsed.firm = { ...INITIAL_FIRM };
      } else if (!parsed.firm.visibilityMode) {
        parsed.firm.visibilityMode = 'open';
      }
      if (!parsed.users || !Array.isArray(parsed.users)) {
        parsed.users = [...INITIAL_USERS];
      } else {
        // Ensure every user has jobType
        parsed.users = parsed.users.map((u: any) => ({
          ...u,
          jobType: u.jobType || (u.role === 'Owner' ? 'lawyer_senior' : 'other'),
          jobTitleLabel: u.jobTitleLabel ?? null,
          reportsToUserId: u.reportsToUserId ?? null,
        }));
      }
      if (!parsed.clients || !Array.isArray(parsed.clients)) {
        parsed.clients = [...INITIAL_CLIENTS];
      }
      if (!parsed.cases || !Array.isArray(parsed.cases)) {
        parsed.cases = [...INITIAL_CASES];
      }
      if (!parsed.caseShares || !Array.isArray(parsed.caseShares)) {
        parsed.caseShares = [];
      }
      if (!parsed.hearings || !Array.isArray(parsed.hearings)) {
        parsed.hearings = [...INITIAL_HEARINGS];
      }
      if (!parsed.hearingDateHistory || !Array.isArray(parsed.hearingDateHistory)) {
        parsed.hearingDateHistory = [...INITIAL_HEARING_DATE_HISTORY];
      }
      if (!parsed.tasks || !Array.isArray(parsed.tasks)) {
        parsed.tasks = [...INITIAL_TASKS];
      }
      if (!parsed.physicalFiles || !Array.isArray(parsed.physicalFiles)) {
        parsed.physicalFiles = [...INITIAL_PHYSICAL_FILES];
      }
      if (!parsed.fileMovements || !Array.isArray(parsed.fileMovements)) {
        parsed.fileMovements = [...INITIAL_FILE_MOVEMENTS];
      }
      if (!parsed.reminders || !Array.isArray(parsed.reminders)) {
        parsed.reminders = [...INITIAL_REMINDERS];
      }
      if (!parsed.clientPhotos || !Array.isArray(parsed.clientPhotos)) {
        parsed.clientPhotos = [...INITIAL_CLIENT_PHOTOS];
      }
      if (!parsed.clientNotes || !Array.isArray(parsed.clientNotes)) {
        parsed.clientNotes = [...INITIAL_CLIENT_NOTES];
      }
      if (!parsed.caseNotes || !Array.isArray(parsed.caseNotes)) {
        parsed.caseNotes = [...INITIAL_CASE_NOTES];
      }
      if (!parsed.appointments || !Array.isArray(parsed.appointments)) {
        parsed.appointments = [...INITIAL_APPOINTMENTS];
      }
      if (!parsed.appointmentAttendees || !Array.isArray(parsed.appointmentAttendees)) {
        parsed.appointmentAttendees = [...INITIAL_APPOINTMENT_ATTENDEES];
      }
      this.saveState(parsed);
      return parsed;
    } catch (err) {
      console.error('Failed to load local store:', err);
      return this.getInitialState();
    }
  }

  private getInitialState(): AppStoreData {
    return {
      firm: { ...INITIAL_FIRM },
      users: [...INITIAL_USERS],
      clients: [...INITIAL_CLIENTS],
      clientPhotos: [...INITIAL_CLIENT_PHOTOS],
      clientNotes: [...INITIAL_CLIENT_NOTES],
      cases: [...INITIAL_CASES],
      caseNotes: [...INITIAL_CASE_NOTES],
      caseShares: [],
      hearings: [...INITIAL_HEARINGS],
      hearingDateHistory: [...INITIAL_HEARING_DATE_HISTORY],
      tasks: [...INITIAL_TASKS],
      physicalFiles: [...INITIAL_PHYSICAL_FILES],
      fileMovements: [...INITIAL_FILE_MOVEMENTS],
      appointments: [...INITIAL_APPOINTMENTS],
      appointmentAttendees: [...INITIAL_APPOINTMENT_ATTENDEES],
      reminders: [...INITIAL_REMINDERS],
      feeAgreements: [
        {
          id: 'fa-001',
          firmId: DEFAULT_FIRM_ID,
          clientId: 'client-001',
          caseId: 'case-001',
          feeType: 'fixed',
          agreedAmountPaisa: 5000000,
          agreementDate: '2024-01-15',
          notes: 'Agreed fixed chamber fee for Title Suit trial up to judgment',
          status: 'active',
          createdAt: '2024-01-15T10:00:00.000Z',
          updatedAt: '2024-01-15T10:00:00.000Z',
          deletedAt: null,
          createdBy: 'user-owner-001',
          updatedBy: 'user-owner-001',
        },
      ],
      feeAgreementChanges: [],
      feePayments: [
        {
          id: 'pay-001',
          firmId: DEFAULT_FIRM_ID,
          clientId: 'client-001',
          caseId: 'case-001',
          feeAgreementId: 'fa-001',
          hearingId: null,
          paymentDate: '2024-01-16',
          amountPaisa: 2500000,
          method: 'bank',
          reference: 'EBL-TRX-98442',
          receiptNumber: 'R-000001',
          purposeNote: 'Initial filing retainer fee (First installment)',
          status: 'posted',
          voidReason: null,
          voidedBy: null,
          voidedAt: null,
          idempotencyKey: 'idemp-seed-001',
          createdAt: '2024-01-16T11:00:00.000Z',
          updatedAt: '2024-01-16T11:00:00.000Z',
          deletedAt: null,
          createdBy: 'user-owner-001',
          updatedBy: 'user-owner-001',
        },
      ],
      expenseCategories: [
        { id: 'expcat-1', firmId: DEFAULT_FIRM_ID, name: 'Court Fees', isDefault: true, createdAt: '2024-01-01T00:00:00.000Z', updatedAt: '2024-01-01T00:00:00.000Z', deletedAt: null, createdBy: 'system', updatedBy: 'system' },
        { id: 'expcat-2', firmId: DEFAULT_FIRM_ID, name: 'Process Server / Notice', isDefault: true, createdAt: '2024-01-01T00:00:00.000Z', updatedAt: '2024-01-01T00:00:00.000Z', deletedAt: null, createdBy: 'system', updatedBy: 'system' },
        { id: 'expcat-3', firmId: DEFAULT_FIRM_ID, name: 'Certified Copy', isDefault: true, createdAt: '2024-01-01T00:00:00.000Z', updatedAt: '2024-01-01T00:00:00.000Z', deletedAt: null, createdBy: 'system', updatedBy: 'system' },
        { id: 'expcat-4', firmId: DEFAULT_FIRM_ID, name: 'Stamp Duty', isDefault: true, createdAt: '2024-01-01T00:00:00.000Z', updatedAt: '2024-01-01T00:00:00.000Z', deletedAt: null, createdBy: 'system', updatedBy: 'system' },
        { id: 'expcat-5', firmId: DEFAULT_FIRM_ID, name: 'Travel / Conveyance', isDefault: true, createdAt: '2024-01-01T00:00:00.000Z', updatedAt: '2024-01-01T00:00:00.000Z', deletedAt: null, createdBy: 'system', updatedBy: 'system' },
        { id: 'expcat-6', firmId: DEFAULT_FIRM_ID, name: 'Photocopy & Typing', isDefault: true, createdAt: '2024-01-01T00:00:00.000Z', updatedAt: '2024-01-01T00:00:00.000Z', deletedAt: null, createdBy: 'system', updatedBy: 'system' },
        { id: 'expcat-7', firmId: DEFAULT_FIRM_ID, name: 'Miscellaneous', isDefault: true, createdAt: '2024-01-01T00:00:00.000Z', updatedAt: '2024-01-01T00:00:00.000Z', deletedAt: null, createdBy: 'system', updatedBy: 'system' },
      ],
      expenses: [
        {
          id: 'exp-001',
          firmId: DEFAULT_FIRM_ID,
          clientId: 'client-001',
          caseId: 'case-001',
          categoryId: 'expcat-1',
          expenseDate: '2024-01-16',
          amountPaisa: 150000,
          description: 'Court fee stamps purchased for plaint presentation',
          reimbursable: true,
          status: 'posted',
          voidReason: null,
          voidedBy: null,
          voidedAt: null,
          createdAt: '2024-01-16T14:00:00.000Z',
          updatedAt: '2024-01-16T14:00:00.000Z',
          deletedAt: null,
          createdBy: 'user-owner-001',
          updatedBy: 'user-owner-001',
        },
      ],
      auditLogs: [
        {
          id: 'audit-init-001',
          firmId: DEFAULT_FIRM_ID,
          userId: 'user-owner-001',
          userName: 'Adv. Mahbubur Rahman',
          entity: 'System',
          entityId: DEFAULT_FIRM_ID,
          action: 'CREATE',
          oldValue: null,
          newValue: { note: 'Chamber practice database initialized' },
          timestamp: new Date().toISOString(),
        },
      ],
      customCollections: {},
    };
  }

  private saveState(data: AppStoreData): void {
    if (typeof window === 'undefined') return;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    } catch (err) {
      console.error('Failed to save to localStorage:', err);
    }
  }

  public getData(): AppStoreData {
    return this.data;
  }

  public getSnapshot(): string {
    return JSON.stringify(this.data);
  }

  public restoreSnapshot(snapshotJson: string): void {
    this.data = JSON.parse(snapshotJson);
    this.saveState(this.data);
  }

  public setData(newData: AppStoreData, persist: boolean = true): void {
    this.data = newData;
    if (persist) {
      this.saveState(this.data);
    }
  }

  public mutate(updater: (data: AppStoreData) => void): void {
    updater(this.data);
    this.saveState(this.data);
  }

  public resetStore(): void {
    this.data = this.getInitialState();
    this.saveState(this.data);
  }
}

export const localStore = new LocalStoreManager();
