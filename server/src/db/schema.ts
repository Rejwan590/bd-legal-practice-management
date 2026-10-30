import {
  pgTable,
  text,
  integer,
  boolean,
  timestamp,
  jsonb,
  index,
  uniqueIndex,
  uuid,
  bigint,
} from 'drizzle-orm/pg-core';

// Plans Table
export const plans = pgTable('plans', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  durationMonths: integer('duration_months').notNull(),
  priceBdt: integer('price_bdt').notNull(),
  seats: integer('seats').notNull(),
  features: jsonb('features').$type<string[]>().default([]),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  deletedAt: timestamp('deleted_at', { withTimezone: true }),
  createdBy: text('created_by'),
  updatedBy: text('updated_by'),
});

// Firms Table
export const firms = pgTable('firms', {
  id: text('id').primaryKey(),
  firmId: text('firm_id').notNull(),
  name: text('name').notNull(),
  barCouncilReg: text('bar_council_reg'),
  officeAddress: text('office_address'),
  courtAffiliations: text('court_affiliations'),
  contact: text('contact'),
  maxDevices: integer('max_devices').default(5).notNull(),
  devicePolicy: text('device_policy').$type<'auto-approve' | 'manual'>().default('auto-approve').notNull(),
  allowOwnerDeviceRemoval: boolean('allow_owner_device_removal').default(false).notNull(),
  visibilityMode: text('visibility_mode').$type<'open' | 'team'>().default('team').notNull(),
  planId: text('plan_id').references(() => plans.id),
  licenseStartsAt: timestamp('license_starts_at', { withTimezone: true }),
  licenseExpiresAt: timestamp('license_expires_at', { withTimezone: true }).notNull(),
  status: text('status').$type<'active' | 'expired' | 'suspended' | 'disabled'>().default('active').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  deletedAt: timestamp('deleted_at', { withTimezone: true }),
  createdBy: text('created_by'),
  updatedBy: text('updated_by'),
});

// Users Table
export const users = pgTable('users', {
  id: text('id').primaryKey(),
  firmId: text('firm_id').references(() => firms.id).notNull(),
  name: text('name').notNull(),
  email: text('email').unique().notNull(),
  passwordHash: text('password_hash').notNull(),
  role: text('role').$type<'Owner' | 'Staff'>().notNull(),
  jobType: text('job_type').$type<'lawyer_senior' | 'lawyer_junior' | 'clerk' | 'receptionist' | 'intern' | 'other'>().default('other').notNull(),
  jobTitleLabel: text('job_title_label'),
  reportsToUserId: text('reports_to_user_id'),
  permissions: jsonb('permissions').$type<string[]>().notNull(),
  language: text('language').$type<'en' | 'bn'>().default('en').notNull(),
  active: boolean('active').default(true).notNull(),
  mustChangePassword: boolean('must_change_password').default(false).notNull(),
  failedLoginAttempts: integer('failed_login_attempts').default(0).notNull(),
  lockedUntil: timestamp('locked_until', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  deletedAt: timestamp('deleted_at', { withTimezone: true }),
  createdBy: text('created_by'),
  updatedBy: text('updated_by'),
}, (table) => [
  index('idx_users_firm_id').on(table.firmId),
  index('idx_users_email').on(table.email),
  index('idx_users_reports_to').on(table.reportsToUserId),
]);

// Clients Table (Step 3.1)
export const clients = pgTable('clients', {
  id: text('id').primaryKey(),
  firmId: text('firm_id').references(() => firms.id).notNull(),
  name: text('name').notNull(),
  nameBn: text('name_bn'),
  phone: text('phone').notNull(),
  email: text('email'),
  address: text('address').notNull(),
  notes: text('notes'),
  archived: boolean('archived').default(false).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  deletedAt: timestamp('deleted_at', { withTimezone: true }),
  createdBy: text('created_by'),
  updatedBy: text('updated_by'),
}, (table) => [
  index('idx_clients_firm_id').on(table.firmId),
  index('idx_clients_name').on(table.name),
  index('idx_clients_phone').on(table.phone),
]);

// Client Photos Table (Primary key is client_id - one photo per client)
export const clientPhotos = pgTable('client_photos', {
  clientId: text('client_id').primaryKey().references(() => clients.id, { onDelete: 'cascade' }),
  firmId: text('firm_id').references(() => firms.id, { onDelete: 'cascade' }).notNull(),
  mime: text('mime').notNull(),
  bytes: text('bytes').notNull(), // Base64 encoded string
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index('idx_client_photos_firm_id').on(table.firmId),
]);

// Client Notes Table
export const clientNotes = pgTable('client_notes', {
  id: text('id').primaryKey(),
  firmId: text('firm_id').references(() => firms.id).notNull(),
  clientId: text('client_id').references(() => clients.id).notNull(),
  noteDate: text('note_date').notNull(), // YYYY-MM-DD
  body: text('body').notNull(),
  createdBy: text('created_by'),
  updatedBy: text('updated_by'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  deletedAt: timestamp('deleted_at', { withTimezone: true }),
}, (table) => [
  index('idx_client_notes_firm_id').on(table.firmId),
  index('idx_client_notes_client_id').on(table.clientId),
  index('idx_client_notes_note_date').on(table.noteDate),
]);

// Cases Table (for linking & orphan case checks)
export const cases = pgTable('cases', {
  id: text('id').primaryKey(),
  firmId: text('firm_id').references(() => firms.id).notNull(),
  clientId: text('client_id').references(() => clients.id).notNull(),
  fileSerial: text('file_serial'),
  caseNumber: text('case_number').notNull(),
  court: text('court').notNull(),
  matterType: text('matter_type').notNull(),
  description: text('description'),
  plaintiff: text('plaintiff'),
  defendant: text('defendant'),
  ourRole: text('our_role'),
  plaintiffLawyer: text('plaintiff_lawyer'),
  defendantLawyer: text('defendant_lawyer'),
  responsibleLawyerId: text('responsible_lawyer_id'),
  status: text('status').$type<'ongoing' | 'pending' | 'closed'>().default('ongoing').notNull(),
  caseDate: timestamp('case_date', { withTimezone: true }),
  closedOn: timestamp('closed_on', { withTimezone: true }),
  caseCategory: text('case_category').$type<'civil' | 'criminal_gr' | 'criminal_cr' | 'other'>().default('civil').notNull(),
  partyARole: text('party_a_role'),
  partyBRole: text('party_b_role'),
  policeStation: text('police_station'),
  sectionsOfLaw: text('sections_of_law'),
  restricted: boolean('restricted').default(false).notNull(),
  nextHearingAt: timestamp('next_hearing_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  deletedAt: timestamp('deleted_at', { withTimezone: true }),
  createdBy: text('created_by'),
  updatedBy: text('updated_by'),
}, (table) => [
  index('idx_cases_client_id').on(table.clientId),
  index('idx_cases_firm_id').on(table.firmId),
  index('idx_cases_case_number').on(table.caseNumber),
  index('idx_cases_court').on(table.court),
  index('idx_cases_status').on(table.status),
  index('idx_cases_file_serial').on(table.fileSerial),
  index('idx_cases_resp_lawyer').on(table.responsibleLawyerId),
  index('idx_cases_case_date').on(table.caseDate),
  index('idx_cases_category').on(table.caseCategory),
  uniqueIndex('uidx_cases_firm_file_serial').on(table.firmId, table.fileSerial),
]);

// Case Notes Table
export const caseNotes = pgTable('case_notes', {
  id: text('id').primaryKey(),
  firmId: text('firm_id').references(() => firms.id).notNull(),
  caseId: text('case_id').references(() => cases.id).notNull(),
  noteDate: text('note_date').notNull(), // YYYY-MM-DD
  body: text('body').notNull(),
  createdBy: text('created_by'),
  updatedBy: text('updated_by'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  deletedAt: timestamp('deleted_at', { withTimezone: true }),
}, (table) => [
  index('idx_case_notes_firm_id').on(table.firmId),
  index('idx_case_notes_case_id').on(table.caseId),
  index('idx_case_notes_note_date').on(table.noteDate),
]);

// Hearings Table
export const hearings = pgTable('hearings', {
  id: text('id').primaryKey(),
  firmId: text('firm_id').references(() => firms.id).notNull(),
  caseId: text('case_id').references(() => cases.id).notNull(),
  appearingLawyerId: text('appearing_lawyer_id'),
  scheduledAt: timestamp('scheduled_at', { withTimezone: true }).notNull(),
  court: text('court'),
  purpose: text('purpose'),
  status: text('status').$type<'scheduled' | 'held' | 'adjourned' | 'cancelled'>().default('scheduled').notNull(),
  outcomeNote: text('outcome_note'),
  fixedFor: text('fixed_for'),
  fixedForNote: text('fixed_for_note'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  deletedAt: timestamp('deleted_at', { withTimezone: true }),
  createdBy: text('created_by'),
  updatedBy: text('updated_by'),
}, (table) => [
  index('idx_hearings_firm_id').on(table.firmId),
  index('idx_hearings_case_id').on(table.caseId),
  index('idx_hearings_appearing_lawyer').on(table.appearingLawyerId),
  index('idx_hearings_fixed_for').on(table.fixedFor),
]);

// Hearing Date History Table
export const hearingDateHistory = pgTable('hearing_date_history', {
  id: text('id').primaryKey(),
  firmId: text('firm_id').references(() => firms.id).notNull(),
  hearingId: text('hearing_id').references(() => hearings.id, { onDelete: 'cascade' }).notNull(),
  caseId: text('case_id').references(() => cases.id, { onDelete: 'cascade' }).notNull(),
  oldAt: timestamp('old_at', { withTimezone: true }).notNull(),
  newAt: timestamp('new_at', { withTimezone: true }).notNull(),
  reason: text('reason').notNull(),
  oldFixedFor: text('old_fixed_for'),
  newFixedFor: text('new_fixed_for'),
  changedBy: text('changed_by').notNull(),
  changedAt: timestamp('changed_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index('idx_hearing_date_history_firm_id').on(table.firmId),
  index('idx_hearing_date_history_hearing_id').on(table.hearingId),
  index('idx_hearing_date_history_case_id').on(table.caseId),
]);

// Case Shares Table
export const caseShares = pgTable('case_shares', {
  id: text('id').primaryKey(),
  firmId: text('firm_id').references(() => firms.id).notNull(),
  caseId: text('case_id').references(() => cases.id).notNull(),
  userId: text('user_id').references(() => users.id).notNull(),
  createdBy: text('created_by').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  deletedAt: timestamp('deleted_at', { withTimezone: true }),
}, (table) => [
  index('idx_case_shares_firm_id').on(table.firmId),
  index('idx_case_shares_case_id').on(table.caseId),
  index('idx_case_shares_user_id').on(table.userId),
]);

// Audit Log Table
export const auditLog = pgTable('audit_log', {
  id: text('id').primaryKey(),
  firmId: text('firm_id').references(() => firms.id).notNull(),
  userId: text('user_id').notNull(),
  userName: text('user_name').notNull(),
  entity: text('entity').notNull(),
  entityId: text('entity_id').notNull(),
  action: text('action').notNull(),
  oldValue: jsonb('old_value'),
  newValue: jsonb('new_value'),
  timestamp: timestamp('timestamp', { withTimezone: true }).defaultNow().notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  deletedAt: timestamp('deleted_at', { withTimezone: true }),
  createdBy: text('created_by'),
  updatedBy: text('updated_by'),
}, (table) => [
  index('idx_audit_log_firm_id').on(table.firmId),
  index('idx_audit_log_timestamp').on(table.timestamp),
]);

// Payments Table
export const payments = pgTable('payments', {
  id: text('id').primaryKey(),
  firmId: text('firm_id').references(() => firms.id).notNull(),
  amount: integer('amount').notNull(),
  method: text('method').notNull(),
  txnId: text('txn_id').notNull(),
  note: text('note'),
  paidAt: timestamp('paid_at', { withTimezone: true }).defaultNow().notNull(),
  verifiedBy: text('verified_by'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  deletedAt: timestamp('deleted_at', { withTimezone: true }),
  createdBy: text('created_by'),
  updatedBy: text('updated_by'),
}, (table) => [
  index('idx_payments_firm_id').on(table.firmId),
]);

// Backups Log Table
export const backupsLog = pgTable('backups_log', {
  id: text('id').primaryKey(),
  firmId: text('firm_id').references(() => firms.id).notNull(),
  kind: text('kind').notNull(),
  at: timestamp('at', { withTimezone: true }).defaultNow().notNull(),
  checksum: text('checksum').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  deletedAt: timestamp('deleted_at', { withTimezone: true }),
  createdBy: text('created_by'),
  updatedBy: text('updated_by'),
}, (table) => [
  index('idx_backups_log_firm_id').on(table.firmId),
]);

// Platform Admins Table (Step A: Super Admin for software owner - NO firm_id)
export const platformAdmins = pgTable('platform_admins', {
  id: uuid('id').primaryKey().defaultRandom(),
  email: text('email').unique().notNull(),
  passwordHash: text('password_hash').notNull(),
  totpSecret: text('totp_secret'),
  active: boolean('active').default(true).notNull(),
  failedAttempts: integer('failed_attempts').default(0).notNull(),
  lockedUntil: timestamp('locked_until', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  uniqueIndex('idx_platform_admins_email').on(table.email),
]);

// Admin Audit Table (All actions by platform super admins)
export const adminAudit = pgTable('admin_audit', {
  id: uuid('id').primaryKey().defaultRandom(),
  adminId: uuid('admin_id').references(() => platformAdmins.id).notNull(),
  action: text('action').notNull(),
  targetFirmId: text('target_firm_id'),
  old: jsonb('old').$type<Record<string, unknown>>(),
  new: jsonb('new').$type<Record<string, unknown>>(),
  ip: text('ip'),
  at: timestamp('at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index('idx_admin_audit_admin_id').on(table.adminId),
  index('idx_admin_audit_at').on(table.at),
]);

// License Events Table (Step B: Full history of license mutations and firm status changes)
export const licenseEvents = pgTable('license_events', {
  id: uuid('id').primaryKey().defaultRandom(),
  firmId: text('firm_id').references(() => firms.id).notNull(),
  type: text('type').notNull(),
  old: jsonb('old').$type<Record<string, unknown>>(),
  new: jsonb('new').$type<Record<string, unknown>>(),
  byAdmin: uuid('by_admin').references(() => platformAdmins.id).notNull(),
  at: timestamp('at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index('idx_license_events_firm_id').on(table.firmId),
  index('idx_license_events_at').on(table.at),
]);

// Devices Table (Step D: Browser install authorization identified by cryptographically random key, not physical hardware)
// Honest comment: A "device" is a browser install identified by a random id, not physical hardware.
export const devices = pgTable('devices', {
  id: uuid('id').primaryKey().defaultRandom(),
  firmId: text('firm_id').references(() => firms.id).notNull(),
  userId: text('user_id').references(() => users.id).notNull(),
  deviceKeyHash: text('device_key_hash').unique().notNull(),
  name: text('name').notNull(),
  userAgent: text('user_agent').notNull(),
  status: text('status').$type<'pending' | 'approved' | 'rejected' | 'revoked'>().default('pending').notNull(),
  firstSeenAt: timestamp('first_seen_at', { withTimezone: true }).defaultNow().notNull(),
  lastSeenAt: timestamp('last_seen_at', { withTimezone: true }).defaultNow().notNull(),
  approvedByAdminId: uuid('approved_by_admin_id').references(() => platformAdmins.id),
}, (table) => [
  index('idx_devices_firm_id').on(table.firmId),
  index('idx_devices_user_id').on(table.userId),
  uniqueIndex('idx_devices_key_hash').on(table.deviceKeyHash),
  index('idx_devices_status').on(table.status),
]);

// Appointments Table (Appointments Module)
export const appointments = pgTable('appointments', {
  id: text('id').primaryKey(),
  firmId: text('firm_id').references(() => firms.id).notNull(),
  title: text('title').notNull(),
  type: text('type').$type<'client_meeting' | 'consultation' | 'phone_call' | 'internal_meeting' | 'court_visit' | 'other'>().notNull(),
  startsAt: timestamp('starts_at', { withTimezone: true }).notNull(),
  endsAt: timestamp('ends_at', { withTimezone: true }).notNull(),
  mode: text('mode').$type<'in_person' | 'phone' | 'video'>().default('in_person').notNull(),
  location: text('location'),
  organiserUserId: text('organiser_user_id').references(() => users.id).notNull(),
  clientId: text('client_id').references(() => clients.id),
  caseId: text('case_id').references(() => cases.id),
  status: text('status').$type<'scheduled' | 'completed' | 'cancelled' | 'no_show'>().default('scheduled').notNull(),
  notes: text('notes'),
  reminderMinutesBefore: integer('reminder_minutes_before').default(30).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  deletedAt: timestamp('deleted_at', { withTimezone: true }),
  createdBy: text('created_by'),
  updatedBy: text('updated_by'),
}, (table) => [
  index('idx_appointments_firm_id').on(table.firmId),
  index('idx_appointments_starts_at').on(table.startsAt),
  index('idx_appointments_organiser').on(table.organiserUserId),
  index('idx_appointments_client_id').on(table.clientId),
  index('idx_appointments_case_id').on(table.caseId),
]);

// Appointment Attendees Table
export const appointmentAttendees = pgTable('appointment_attendees', {
  id: text('id').primaryKey(),
  appointmentId: text('appointment_id').references(() => appointments.id, { onDelete: 'cascade' }).notNull(),
  userId: text('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
  firmId: text('firm_id').references(() => firms.id, { onDelete: 'cascade' }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index('idx_appointment_attendees_appointment_id').on(table.appointmentId),
  index('idx_appointment_attendees_user_id').on(table.userId),
]);

// Tasks Table (Tasks Module)
export const tasks = pgTable('tasks', {
  id: text('id').primaryKey(),
  firmId: text('firm_id').references(() => firms.id).notNull(),
  caseId: text('case_id').references(() => cases.id),
  clientId: text('client_id').references(() => clients.id),
  assignedTo: text('assigned_to').references(() => users.id).notNull(),
  title: text('title').notNull(),
  description: text('description'),
  priority: text('priority').$type<'urgent' | 'high' | 'medium' | 'normal' | 'low'>().default('normal').notNull(),
  dueAt: timestamp('due_at', { withTimezone: true }).notNull(),
  status: text('status').$type<'pending' | 'in_progress' | 'completed' | 'cancelled'>().default('pending').notNull(),
  completedAt: timestamp('completed_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  deletedAt: timestamp('deleted_at', { withTimezone: true }),
  createdBy: text('created_by'),
  updatedBy: text('updated_by'),
}, (table) => [
  index('idx_tasks_firm_id').on(table.firmId),
  index('idx_tasks_case_id').on(table.caseId),
  index('idx_tasks_client_id').on(table.clientId),
  index('idx_tasks_assigned_to').on(table.assignedTo),
  index('idx_tasks_status').on(table.status),
  index('idx_tasks_due_at').on(table.dueAt),
]);

// Fee Agreements Table (Accounts Phase 1)
export const feeAgreements = pgTable('fee_agreements', {
  id: text('id').primaryKey(),
  firmId: text('firm_id').references(() => firms.id).notNull(),
  clientId: text('client_id').references(() => clients.id).notNull(),
  caseId: text('case_id').references(() => cases.id),
  feeType: text('fee_type').$type<'fixed' | 'per_hearing' | 'hourly' | 'retainer' | 'installment'>().default('fixed').notNull(),
  agreedAmountPaisa: bigint('agreed_amount_paisa', { mode: 'number' }).notNull(),
  agreementDate: text('agreement_date').notNull(),
  notes: text('notes'),
  status: text('status').$type<'active' | 'closed' | 'void'>().default('active').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  deletedAt: timestamp('deleted_at', { withTimezone: true }),
  createdBy: text('created_by'),
  updatedBy: text('updated_by'),
}, (table) => [
  index('idx_fee_agreements_firm_id').on(table.firmId),
  index('idx_fee_agreements_client_id').on(table.clientId),
  index('idx_fee_agreements_case_id').on(table.caseId),
  index('idx_fee_agreements_status').on(table.status),
]);

// Fee Agreement Changes (Audit History of Agreed Amount)
export const feeAgreementChanges = pgTable('fee_agreement_changes', {
  id: text('id').primaryKey(),
  firmId: text('firm_id').references(() => firms.id).notNull(),
  feeAgreementId: text('fee_agreement_id').references(() => feeAgreements.id).notNull(),
  oldAmountPaisa: bigint('old_amount_paisa', { mode: 'number' }).notNull(),
  newAmountPaisa: bigint('new_amount_paisa', { mode: 'number' }).notNull(),
  reason: text('reason').notNull(),
  changedBy: text('changed_by').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index('idx_fee_agreement_changes_firm_id').on(table.firmId),
  index('idx_fee_agreement_changes_agreement_id').on(table.feeAgreementId),
]);

// Number Sequences Table (Atomic Unique Receipt Numbering per Firm)
export const numberSequences = pgTable('number_sequences', {
  id: text('id').primaryKey(),
  firmId: text('firm_id').references(() => firms.id).notNull(),
  type: text('type').notNull(),
  prefix: text('prefix').notNull(),
  currentVal: integer('current_val').default(0).notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  uniqueIndex('idx_number_sequences_firm_type').on(table.firmId, table.type),
  index('idx_number_sequences_firm_id').on(table.firmId),
]);

// Fee Payments (Payments Received) Table
export const feePayments = pgTable('fee_payments', {
  id: text('id').primaryKey(),
  firmId: text('firm_id').references(() => firms.id).notNull(),
  clientId: text('client_id').references(() => clients.id).notNull(),
  caseId: text('case_id').references(() => cases.id),
  feeAgreementId: text('fee_agreement_id').references(() => feeAgreements.id),
  hearingId: text('hearing_id').references(() => hearings.id),
  paymentDate: text('payment_date').notNull(),
  amountPaisa: bigint('amount_paisa', { mode: 'number' }).notNull(),
  method: text('method').$type<'cash' | 'bank' | 'bkash' | 'nagad' | 'cheque' | 'other'>().notNull(),
  reference: text('reference'),
  receiptNumber: text('receipt_number').notNull(),
  purposeNote: text('purpose_note').notNull(),
  status: text('status').$type<'posted' | 'void'>().default('posted').notNull(),
  voidReason: text('void_reason'),
  voidedBy: text('voided_by'),
  voidedAt: timestamp('voided_at', { withTimezone: true }),
  idempotencyKey: text('idempotency_key').notNull(),
  legacyUnassigned: boolean('legacy_unassigned').default(false).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  deletedAt: timestamp('deleted_at', { withTimezone: true }),
  createdBy: text('created_by'),
  updatedBy: text('updated_by'),
}, (table) => [
  uniqueIndex('idx_fee_payments_firm_idempotency').on(table.firmId, table.idempotencyKey),
  uniqueIndex('idx_fee_payments_firm_receipt').on(table.firmId, table.receiptNumber),
  index('idx_fee_payments_firm_id').on(table.firmId),
  index('idx_fee_payments_client_id').on(table.clientId),
  index('idx_fee_payments_case_id').on(table.caseId),
  index('idx_fee_payments_fee_agreement_id').on(table.feeAgreementId),
  index('idx_fee_payments_hearing_id').on(table.hearingId),
  index('idx_fee_payments_status').on(table.status),
  index('idx_fee_payments_payment_date').on(table.paymentDate),
  index('idx_fee_payments_legacy_unassigned').on(table.legacyUnassigned),
]);

// Expense Categories Table
export const expenseCategories = pgTable('expense_categories', {
  id: text('id').primaryKey(),
  firmId: text('firm_id').references(() => firms.id).notNull(),
  name: text('name').notNull(),
  isDefault: boolean('is_default').default(false).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  deletedAt: timestamp('deleted_at', { withTimezone: true }),
  createdBy: text('created_by'),
  updatedBy: text('updated_by'),
}, (table) => [
  index('idx_expense_categories_firm_id').on(table.firmId),
]);

// Expenses Table
export const expenses = pgTable('expenses', {
  id: text('id').primaryKey(),
  firmId: text('firm_id').references(() => firms.id).notNull(),
  clientId: text('client_id').references(() => clients.id),
  caseId: text('case_id').references(() => cases.id),
  categoryId: text('category_id').references(() => expenseCategories.id).notNull(),
  expenseDate: text('expense_date').notNull(),
  amountPaisa: bigint('amount_paisa', { mode: 'number' }).notNull(),
  description: text('description').notNull(),
  reimbursable: boolean('reimbursable').default(true).notNull(),
  status: text('status').$type<'posted' | 'void'>().default('posted').notNull(),
  voidReason: text('void_reason'),
  voidedBy: text('voided_by'),
  voidedAt: timestamp('voided_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  deletedAt: timestamp('deleted_at', { withTimezone: true }),
  createdBy: text('created_by'),
  updatedBy: text('updated_by'),
}, (table) => [
  index('idx_expenses_firm_id').on(table.firmId),
  index('idx_expenses_client_id').on(table.clientId),
  index('idx_expenses_case_id').on(table.caseId),
  index('idx_expenses_category_id').on(table.categoryId),
  index('idx_expenses_status').on(table.status),
  index('idx_expenses_expense_date').on(table.expenseDate),
]);

export type Plan = typeof plans.$inferSelect;
export type Firm = typeof firms.$inferSelect;
export type NewFirm = typeof firms.$inferInsert;
export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type Client = typeof clients.$inferSelect & {
  hasPhoto?: boolean;
};
export type ClientPhoto = typeof clientPhotos.$inferSelect;
export type NewClientPhoto = typeof clientPhotos.$inferInsert;
export type ClientNote = typeof clientNotes.$inferSelect;
export type NewClientNote = typeof clientNotes.$inferInsert;
export type Case = typeof cases.$inferSelect;
export type CaseNote = typeof caseNotes.$inferSelect;
export type NewCaseNote = typeof caseNotes.$inferInsert;
export type Hearing = typeof hearings.$inferSelect;
export type NewHearing = typeof hearings.$inferInsert;
export type HearingDateHistory = typeof hearingDateHistory.$inferSelect;
export type NewHearingDateHistory = typeof hearingDateHistory.$inferInsert;
export type CaseShare = typeof caseShares.$inferSelect;
export type NewCaseShare = typeof caseShares.$inferInsert;
export type Appointment = typeof appointments.$inferSelect;
export type NewAppointment = typeof appointments.$inferInsert;
export type AppointmentAttendee = typeof appointmentAttendees.$inferSelect;
export type NewAppointmentAttendee = typeof appointmentAttendees.$inferInsert;
export type AuditLogEntry = typeof auditLog.$inferSelect;
export type Payment = typeof payments.$inferSelect;
export type NewPayment = typeof payments.$inferInsert;
export type BackupLogEntry = typeof backupsLog.$inferSelect;
export type PlatformAdmin = typeof platformAdmins.$inferSelect;
export type NewPlatformAdmin = typeof platformAdmins.$inferInsert;
export type AdminAuditEntry = typeof adminAudit.$inferSelect;
export type NewAdminAuditEntry = typeof adminAudit.$inferInsert;
export type LicenseEvent = typeof licenseEvents.$inferSelect;
export type NewLicenseEvent = typeof licenseEvents.$inferInsert;
export type Device = typeof devices.$inferSelect;
export type NewDevice = typeof devices.$inferInsert;
export type Task = typeof tasks.$inferSelect;
export type NewTask = typeof tasks.$inferInsert;
export type FeeAgreement = typeof feeAgreements.$inferSelect;
export type NewFeeAgreement = typeof feeAgreements.$inferInsert;
export type FeeAgreementChange = typeof feeAgreementChanges.$inferSelect;
export type NewFeeAgreementChange = typeof feeAgreementChanges.$inferInsert;
export type NumberSequence = typeof numberSequences.$inferSelect;
export type NewNumberSequence = typeof numberSequences.$inferInsert;
export type FeePayment = typeof feePayments.$inferSelect;
export type NewFeePayment = typeof feePayments.$inferInsert;
export type ExpenseCategory = typeof expenseCategories.$inferSelect;
export type NewExpenseCategory = typeof expenseCategories.$inferInsert;
export type Expense = typeof expenses.$inferSelect;
export type NewExpense = typeof expenses.$inferInsert;


