import {
  sqliteTable,
  text,
  integer,
  index,
  uniqueIndex,
} from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';

// 1. Plans Table
export const plans = sqliteTable('plans', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  durationMonths: integer('duration_months').notNull(),
  priceBdt: integer('price_bdt').notNull(),
  seats: integer('seats').notNull(),
  includedUsers: integer('included_users').default(5).notNull(),
  includedDevices: integer('included_devices').default(5).notNull(),
  extraUserPriceBdt: integer('extra_user_price_bdt').default(100).notNull(),
  extraDevicePriceBdt: integer('extra_device_price_bdt').default(100).notNull(),
  status: text('status').$type<'active' | 'archived'>().default('active').notNull(),
  features: text('features', { mode: 'json' }).$type<string[]>().default(sql`'[]'`),
  createdAt: text('created_at').default(sql`(CURRENT_TIMESTAMP)`).notNull(),
  updatedAt: text('updated_at').default(sql`(CURRENT_TIMESTAMP)`).notNull(),
  deletedAt: text('deleted_at'),
  createdBy: text('created_by'),
  updatedBy: text('updated_by'),
});

// 2. Firms Table
export const firms = sqliteTable('firms', {
  id: text('id').primaryKey(),
  firmId: text('firm_id').notNull(),
  name: text('name').notNull(),
  barCouncilReg: text('bar_council_reg'),
  officeAddress: text('office_address'),
  courtAffiliations: text('court_affiliations'),
  contact: text('contact'),
  maxUsers: integer('max_users').default(10).notNull(),
  maxDevices: integer('max_devices').default(5).notNull(),
  billingCycle: text('billing_cycle').$type<'monthly' | 'annual'>().default('monthly').notNull(),
  customBasePriceBdt: integer('custom_base_price_bdt'),
  customAnnualPriceBdt: integer('custom_annual_price_bdt'),
  customExtraUserPriceBdt: integer('custom_extra_user_price_bdt'),
  customExtraDevicePriceBdt: integer('custom_extra_device_price_bdt'),
  priceLockedUntil: text('price_locked_until'),
  pricingNote: text('pricing_note'),
  isTrial: integer('is_trial', { mode: 'boolean' }).default(false).notNull(),
  trialStartedAt: text('trial_started_at'),
  trialDays: integer('trial_days'),
  trialPriceBdt: integer('trial_price_bdt').default(0).notNull(),
  devicePolicy: text('device_policy').$type<'auto-approve' | 'manual'>().default('auto-approve').notNull(),
  allowOwnerDeviceRemoval: integer('allow_owner_device_removal', { mode: 'boolean' }).default(false).notNull(),
  visibilityMode: text('visibility_mode').$type<'open' | 'team'>().default('team').notNull(),
  planId: text('plan_id').references(() => plans.id),
  licenseStartsAt: text('license_starts_at'),
  licenseExpiresAt: text('license_expires_at').notNull(),
  status: text('status').$type<'active' | 'expired' | 'suspended' | 'disabled'>().default('active').notNull(),
  createdAt: text('created_at').default(sql`(CURRENT_TIMESTAMP)`).notNull(),
  updatedAt: text('updated_at').default(sql`(CURRENT_TIMESTAMP)`).notNull(),
  deletedAt: text('deleted_at'),
  createdBy: text('created_by'),
  updatedBy: text('updated_by'),
}, (table) => [
  index('idx_firms_firm_id').on(table.firmId),
  index('idx_firms_status').on(table.status),
  index('idx_firms_license_expires_at').on(table.licenseExpiresAt),
]);

// 3. Users Table
export const users = sqliteTable('users', {
  id: text('id').primaryKey(),
  firmId: text('firm_id').references(() => firms.id).notNull(),
  name: text('name').notNull(),
  email: text('email').unique().notNull(),
  passwordHash: text('password_hash').notNull(),
  role: text('role').$type<'Owner' | 'Staff'>().notNull(),
  jobType: text('job_type').$type<'lawyer_senior' | 'lawyer_junior' | 'clerk' | 'receptionist' | 'intern' | 'other'>().default('other').notNull(),
  jobTitleLabel: text('job_title_label'),
  reportsToUserId: text('reports_to_user_id'),
  permissions: text('permissions', { mode: 'json' }).$type<string[]>().notNull(),
  language: text('language').$type<'en' | 'bn'>().default('en').notNull(),
  active: integer('active', { mode: 'boolean' }).default(true).notNull(),
  mustChangePassword: integer('must_change_password', { mode: 'boolean' }).default(false).notNull(),
  failedLoginAttempts: integer('failed_login_attempts').default(0).notNull(),
  lockedUntil: text('locked_until'),
  createdAt: text('created_at').default(sql`(CURRENT_TIMESTAMP)`).notNull(),
  updatedAt: text('updated_at').default(sql`(CURRENT_TIMESTAMP)`).notNull(),
  deletedAt: text('deleted_at'),
  createdBy: text('created_by'),
  updatedBy: text('updated_by'),
}, (table) => [
  index('idx_users_firm_id').on(table.firmId),
  index('idx_users_email').on(table.email),
  index('idx_users_reports_to').on(table.reportsToUserId),
]);

// 4. Clients Table
export const clients = sqliteTable('clients', {
  id: text('id').primaryKey(),
  firmId: text('firm_id').references(() => firms.id).notNull(),
  name: text('name').notNull(),
  nameBn: text('name_bn'),
  phone: text('phone').notNull(),
  email: text('email'),
  address: text('address').notNull(),
  notes: text('notes'),
  archived: integer('archived', { mode: 'boolean' }).default(false).notNull(),
  createdAt: text('created_at').default(sql`(CURRENT_TIMESTAMP)`).notNull(),
  updatedAt: text('updated_at').default(sql`(CURRENT_TIMESTAMP)`).notNull(),
  deletedAt: text('deleted_at'),
  createdBy: text('created_by'),
  updatedBy: text('updated_by'),
}, (table) => [
  index('idx_clients_firm_id').on(table.firmId),
  index('idx_clients_name').on(table.name),
  index('idx_clients_phone').on(table.phone),
]);

// 5. Client Photos Table (Metadata + R2 key or cached bytes)
export const clientPhotos = sqliteTable('client_photos', {
  clientId: text('client_id').primaryKey().references(() => clients.id, { onDelete: 'cascade' }),
  firmId: text('firm_id').references(() => firms.id, { onDelete: 'cascade' }).notNull(),
  mime: text('mime').notNull(),
  bytes: text('bytes').notNull(),
  r2Key: text('r2_key'),
  updatedAt: text('updated_at').default(sql`(CURRENT_TIMESTAMP)`).notNull(),
}, (table) => [
  index('idx_client_photos_firm_id').on(table.firmId),
]);

// 6. Client Notes Table
export const clientNotes = sqliteTable('client_notes', {
  id: text('id').primaryKey(),
  firmId: text('firm_id').references(() => firms.id).notNull(),
  clientId: text('client_id').references(() => clients.id).notNull(),
  noteDate: text('note_date').notNull(),
  body: text('body').notNull(),
  createdBy: text('created_by'),
  updatedBy: text('updated_by'),
  createdAt: text('created_at').default(sql`(CURRENT_TIMESTAMP)`).notNull(),
  updatedAt: text('updated_at').default(sql`(CURRENT_TIMESTAMP)`).notNull(),
  deletedAt: text('deleted_at'),
}, (table) => [
  index('idx_client_notes_firm_id').on(table.firmId),
  index('idx_client_notes_client_id').on(table.clientId),
  index('idx_client_notes_note_date').on(table.noteDate),
]);

// 7. Cases Table
export const cases = sqliteTable('cases', {
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
  caseDate: text('case_date'),
  closedOn: text('closed_on'),
  caseCategory: text('case_category').$type<'civil' | 'criminal_gr' | 'criminal_cr' | 'other'>().default('civil').notNull(),
  partyARole: text('party_a_role'),
  partyBRole: text('party_b_role'),
  policeStation: text('police_station'),
  sectionsOfLaw: text('sections_of_law'),
  restricted: integer('restricted', { mode: 'boolean' }).default(false).notNull(),
  nextHearingAt: text('next_hearing_at'),
  createdAt: text('created_at').default(sql`(CURRENT_TIMESTAMP)`).notNull(),
  updatedAt: text('updated_at').default(sql`(CURRENT_TIMESTAMP)`).notNull(),
  deletedAt: text('deleted_at'),
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
  index('idx_cases_next_hearing_at').on(table.nextHearingAt),
  uniqueIndex('uidx_cases_firm_file_serial').on(table.firmId, table.fileSerial),
]);

// 8. Case Notes Table
export const caseNotes = sqliteTable('case_notes', {
  id: text('id').primaryKey(),
  firmId: text('firm_id').references(() => firms.id).notNull(),
  caseId: text('case_id').references(() => cases.id).notNull(),
  noteDate: text('note_date').notNull(),
  body: text('body').notNull(),
  createdBy: text('created_by'),
  updatedBy: text('updated_by'),
  createdAt: text('created_at').default(sql`(CURRENT_TIMESTAMP)`).notNull(),
  updatedAt: text('updated_at').default(sql`(CURRENT_TIMESTAMP)`).notNull(),
  deletedAt: text('deleted_at'),
}, (table) => [
  index('idx_case_notes_firm_id').on(table.firmId),
  index('idx_case_notes_case_id').on(table.caseId),
  index('idx_case_notes_note_date').on(table.noteDate),
]);

// 9. Hearings Table
export const hearings = sqliteTable('hearings', {
  id: text('id').primaryKey(),
  firmId: text('firm_id').references(() => firms.id).notNull(),
  caseId: text('case_id').references(() => cases.id).notNull(),
  appearingLawyerId: text('appearing_lawyer_id'),
  scheduledAt: text('scheduled_at').notNull(),
  court: text('court'),
  purpose: text('purpose'),
  status: text('status').$type<'scheduled' | 'held' | 'adjourned' | 'cancelled'>().default('scheduled').notNull(),
  outcomeNote: text('outcome_note'),
  fixedFor: text('fixed_for'),
  fixedForNote: text('fixed_for_note'),
  createdAt: text('created_at').default(sql`(CURRENT_TIMESTAMP)`).notNull(),
  updatedAt: text('updated_at').default(sql`(CURRENT_TIMESTAMP)`).notNull(),
  deletedAt: text('deleted_at'),
  createdBy: text('created_by'),
  updatedBy: text('updated_by'),
}, (table) => [
  index('idx_hearings_firm_id').on(table.firmId),
  index('idx_hearings_case_id').on(table.caseId),
  index('idx_hearings_appearing_lawyer').on(table.appearingLawyerId),
  index('idx_hearings_fixed_for').on(table.fixedFor),
  index('idx_hearings_scheduled_at').on(table.scheduledAt),
]);

// 10. Hearing Date History Table
export const hearingDateHistory = sqliteTable('hearing_date_history', {
  id: text('id').primaryKey(),
  firmId: text('firm_id').references(() => firms.id).notNull(),
  hearingId: text('hearing_id').references(() => hearings.id, { onDelete: 'cascade' }).notNull(),
  caseId: text('case_id').references(() => cases.id, { onDelete: 'cascade' }).notNull(),
  oldAt: text('old_at').notNull(),
  newAt: text('new_at').notNull(),
  reason: text('reason').notNull(),
  oldFixedFor: text('old_fixed_for'),
  newFixedFor: text('new_fixed_for'),
  changedBy: text('changed_by').notNull(),
  changedAt: text('changed_at').default(sql`(CURRENT_TIMESTAMP)`).notNull(),
}, (table) => [
  index('idx_hearing_date_history_firm_id').on(table.firmId),
  index('idx_hearing_date_history_hearing_id').on(table.hearingId),
  index('idx_hearing_date_history_case_id').on(table.caseId),
]);

// 11. Case Shares Table
export const caseShares = sqliteTable('case_shares', {
  id: text('id').primaryKey(),
  firmId: text('firm_id').references(() => firms.id).notNull(),
  caseId: text('case_id').references(() => cases.id).notNull(),
  userId: text('user_id').references(() => users.id).notNull(),
  createdBy: text('created_by').notNull(),
  createdAt: text('created_at').default(sql`(CURRENT_TIMESTAMP)`).notNull(),
  deletedAt: text('deleted_at'),
}, (table) => [
  index('idx_case_shares_firm_id').on(table.firmId),
  index('idx_case_shares_case_id').on(table.caseId),
  index('idx_case_shares_user_id').on(table.userId),
]);

// 12. Audit Log Table
export const auditLog = sqliteTable('audit_log', {
  id: text('id').primaryKey(),
  firmId: text('firm_id').references(() => firms.id).notNull(),
  userId: text('user_id').notNull(),
  userName: text('user_name').notNull(),
  entity: text('entity').notNull(),
  entityId: text('entity_id').notNull(),
  action: text('action').notNull(),
  oldValue: text('old_value', { mode: 'json' }),
  newValue: text('new_value', { mode: 'json' }),
  timestamp: text('timestamp').default(sql`(CURRENT_TIMESTAMP)`).notNull(),
  createdAt: text('created_at').default(sql`(CURRENT_TIMESTAMP)`).notNull(),
  updatedAt: text('updated_at').default(sql`(CURRENT_TIMESTAMP)`).notNull(),
  deletedAt: text('deleted_at'),
  createdBy: text('created_by'),
  updatedBy: text('updated_by'),
}, (table) => [
  index('idx_audit_log_firm_id').on(table.firmId),
  index('idx_audit_log_timestamp').on(table.timestamp),
]);

// 13. Payments Table
export const payments = sqliteTable('payments', {
  id: text('id').primaryKey(),
  firmId: text('firm_id').references(() => firms.id).notNull(),
  amount: integer('amount').notNull(),
  method: text('method').notNull(),
  txnId: text('txn_id').notNull(),
  note: text('note'),
  paidAt: text('paid_at').default(sql`(CURRENT_TIMESTAMP)`).notNull(),
  verifiedBy: text('verified_by'),
  createdAt: text('created_at').default(sql`(CURRENT_TIMESTAMP)`).notNull(),
  updatedAt: text('updated_at').default(sql`(CURRENT_TIMESTAMP)`).notNull(),
  deletedAt: text('deleted_at'),
  createdBy: text('created_by'),
  updatedBy: text('updated_by'),
}, (table) => [
  index('idx_payments_firm_id').on(table.firmId),
]);

// 14. Backups Log Table
export const backupsLog = sqliteTable('backups_log', {
  id: text('id').primaryKey(),
  firmId: text('firm_id').references(() => firms.id).notNull(),
  kind: text('kind').notNull(),
  at: text('at').default(sql`(CURRENT_TIMESTAMP)`).notNull(),
  checksum: text('checksum').notNull(),
  createdAt: text('created_at').default(sql`(CURRENT_TIMESTAMP)`).notNull(),
  updatedAt: text('updated_at').default(sql`(CURRENT_TIMESTAMP)`).notNull(),
  deletedAt: text('deleted_at'),
  createdBy: text('created_by'),
  updatedBy: text('updated_by'),
}, (table) => [
  index('idx_backups_log_firm_id').on(table.firmId),
]);

// 15. Platform Admins Table
export const platformAdmins = sqliteTable('platform_admins', {
  id: text('id').primaryKey(),
  email: text('email').unique().notNull(),
  passwordHash: text('password_hash').notNull(),
  totpSecret: text('totp_secret'),
  active: integer('active', { mode: 'boolean' }).default(true).notNull(),
  failedAttempts: integer('failed_attempts').default(0).notNull(),
  lockedUntil: text('locked_until'),
  createdAt: text('created_at').default(sql`(CURRENT_TIMESTAMP)`).notNull(),
  updatedAt: text('updated_at').default(sql`(CURRENT_TIMESTAMP)`).notNull(),
}, (table) => [
  uniqueIndex('idx_platform_admins_email').on(table.email),
]);

// 16. Admin Audit Table
export const adminAudit = sqliteTable('admin_audit', {
  id: text('id').primaryKey(),
  adminId: text('admin_id').references(() => platformAdmins.id).notNull(),
  action: text('action').notNull(),
  targetFirmId: text('target_firm_id'),
  old: text('old', { mode: 'json' }).$type<Record<string, unknown>>(),
  new: text('new', { mode: 'json' }).$type<Record<string, unknown>>(),
  ip: text('ip'),
  at: text('at').default(sql`(CURRENT_TIMESTAMP)`).notNull(),
}, (table) => [
  index('idx_admin_audit_admin_id').on(table.adminId),
  index('idx_admin_audit_at').on(table.at),
]);

// 17. License Events Table
export const licenseEvents = sqliteTable('license_events', {
  id: text('id').primaryKey(),
  firmId: text('firm_id').references(() => firms.id).notNull(),
  type: text('type').notNull(),
  old: text('old', { mode: 'json' }).$type<Record<string, unknown>>(),
  new: text('new', { mode: 'json' }).$type<Record<string, unknown>>(),
  byAdmin: text('by_admin').references(() => platformAdmins.id).notNull(),
  at: text('at').default(sql`(CURRENT_TIMESTAMP)`).notNull(),
}, (table) => [
  index('idx_license_events_firm_id').on(table.firmId),
  index('idx_license_events_at').on(table.at),
]);

// 18. Devices Table
export const devices = sqliteTable('devices', {
  id: text('id').primaryKey(),
  firmId: text('firm_id').references(() => firms.id).notNull(),
  userId: text('user_id').references(() => users.id).notNull(),
  deviceKeyHash: text('device_key_hash').unique().notNull(),
  name: text('name').notNull(),
  userAgent: text('user_agent').notNull(),
  status: text('status').$type<'pending' | 'approved' | 'rejected' | 'revoked'>().default('pending').notNull(),
  firstSeenAt: text('first_seen_at').default(sql`(CURRENT_TIMESTAMP)`).notNull(),
  lastSeenAt: text('last_seen_at').default(sql`(CURRENT_TIMESTAMP)`).notNull(),
  approvedByAdminId: text('approved_by_admin_id').references(() => platformAdmins.id),
}, (table) => [
  index('idx_devices_firm_id').on(table.firmId),
  index('idx_devices_user_id').on(table.userId),
  uniqueIndex('idx_devices_key_hash').on(table.deviceKeyHash),
  index('idx_devices_status').on(table.status),
]);

// 19. Appointments Table
export const appointments = sqliteTable('appointments', {
  id: text('id').primaryKey(),
  firmId: text('firm_id').references(() => firms.id).notNull(),
  title: text('title').notNull(),
  type: text('type').$type<'client_meeting' | 'consultation' | 'phone_call' | 'internal_meeting' | 'court_visit' | 'other'>().notNull(),
  startsAt: text('starts_at').notNull(),
  endsAt: text('ends_at').notNull(),
  mode: text('mode').$type<'in_person' | 'phone' | 'video'>().default('in_person').notNull(),
  location: text('location'),
  organiserUserId: text('organiser_user_id').references(() => users.id).notNull(),
  clientId: text('client_id').references(() => clients.id),
  caseId: text('case_id').references(() => cases.id),
  status: text('status').$type<'scheduled' | 'completed' | 'cancelled' | 'no_show'>().default('scheduled').notNull(),
  notes: text('notes'),
  reminderMinutesBefore: integer('reminder_minutes_before').default(30).notNull(),
  createdAt: text('created_at').default(sql`(CURRENT_TIMESTAMP)`).notNull(),
  updatedAt: text('updated_at').default(sql`(CURRENT_TIMESTAMP)`).notNull(),
  deletedAt: text('deleted_at'),
  createdBy: text('created_by'),
  updatedBy: text('updated_by'),
}, (table) => [
  index('idx_appointments_firm_id').on(table.firmId),
  index('idx_appointments_starts_at').on(table.startsAt),
  index('idx_appointments_organiser').on(table.organiserUserId),
  index('idx_appointments_client_id').on(table.clientId),
  index('idx_appointments_case_id').on(table.caseId),
]);

// 20. Appointment Attendees Table
export const appointmentAttendees = sqliteTable('appointment_attendees', {
  id: text('id').primaryKey(),
  appointmentId: text('appointment_id').references(() => appointments.id, { onDelete: 'cascade' }).notNull(),
  userId: text('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
  firmId: text('firm_id').references(() => firms.id, { onDelete: 'cascade' }).notNull(),
  createdAt: text('created_at').default(sql`(CURRENT_TIMESTAMP)`).notNull(),
  updatedAt: text('updated_at').default(sql`(CURRENT_TIMESTAMP)`).notNull(),
}, (table) => [
  index('idx_appointment_attendees_appointment_id').on(table.appointmentId),
  index('idx_appointment_attendees_user_id').on(table.userId),
]);

// 21. Tasks Table
export const tasks = sqliteTable('tasks', {
  id: text('id').primaryKey(),
  firmId: text('firm_id').references(() => firms.id).notNull(),
  caseId: text('case_id').references(() => cases.id),
  clientId: text('client_id').references(() => clients.id),
  assignedTo: text('assigned_to').references(() => users.id).notNull(),
  title: text('title').notNull(),
  description: text('description'),
  priority: text('priority').$type<'urgent' | 'high' | 'medium' | 'normal' | 'low'>().default('normal').notNull(),
  dueAt: text('due_at').notNull(),
  status: text('status').$type<'pending' | 'in_progress' | 'completed' | 'cancelled'>().default('pending').notNull(),
  completedAt: text('completed_at'),
  createdAt: text('created_at').default(sql`(CURRENT_TIMESTAMP)`).notNull(),
  updatedAt: text('updated_at').default(sql`(CURRENT_TIMESTAMP)`).notNull(),
  deletedAt: text('deleted_at'),
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

// 22. Fee Agreements Table
export const feeAgreements = sqliteTable('fee_agreements', {
  id: text('id').primaryKey(),
  firmId: text('firm_id').references(() => firms.id).notNull(),
  clientId: text('client_id').references(() => clients.id).notNull(),
  caseId: text('case_id').references(() => cases.id),
  feeType: text('fee_type').$type<'fixed' | 'per_hearing' | 'hourly' | 'retainer' | 'installment'>().default('fixed').notNull(),
  agreedAmountPaisa: integer('agreed_amount_paisa').notNull(),
  agreementDate: text('agreement_date').notNull(),
  notes: text('notes'),
  status: text('status').$type<'active' | 'closed' | 'void'>().default('active').notNull(),
  createdAt: text('created_at').default(sql`(CURRENT_TIMESTAMP)`).notNull(),
  updatedAt: text('updated_at').default(sql`(CURRENT_TIMESTAMP)`).notNull(),
  deletedAt: text('deleted_at'),
  createdBy: text('created_by'),
  updatedBy: text('updated_by'),
}, (table) => [
  index('idx_fee_agreements_firm_id').on(table.firmId),
  index('idx_fee_agreements_client_id').on(table.clientId),
  index('idx_fee_agreements_case_id').on(table.caseId),
  index('idx_fee_agreements_status').on(table.status),
]);

// 23. Fee Agreement Changes Table
export const feeAgreementChanges = sqliteTable('fee_agreement_changes', {
  id: text('id').primaryKey(),
  firmId: text('firm_id').references(() => firms.id).notNull(),
  feeAgreementId: text('fee_agreement_id').references(() => feeAgreements.id).notNull(),
  oldAmountPaisa: integer('old_amount_paisa').notNull(),
  newAmountPaisa: integer('new_amount_paisa').notNull(),
  reason: text('reason').notNull(),
  changedBy: text('changed_by').notNull(),
  createdAt: text('created_at').default(sql`(CURRENT_TIMESTAMP)`).notNull(),
}, (table) => [
  index('idx_fee_agreement_changes_firm_id').on(table.firmId),
  index('idx_fee_agreement_changes_agreement_id').on(table.feeAgreementId),
]);

// 24. Number Sequences Table
export const numberSequences = sqliteTable('number_sequences', {
  id: text('id').primaryKey(),
  firmId: text('firm_id').references(() => firms.id).notNull(),
  type: text('type').notNull(),
  prefix: text('prefix').notNull(),
  currentVal: integer('current_val').default(0).notNull(),
  updatedAt: text('updated_at').default(sql`(CURRENT_TIMESTAMP)`).notNull(),
}, (table) => [
  uniqueIndex('idx_number_sequences_firm_type').on(table.firmId, table.type),
  index('idx_number_sequences_firm_id').on(table.firmId),
]);

// 25. Fee Payments Table
export const feePayments = sqliteTable('fee_payments', {
  id: text('id').primaryKey(),
  firmId: text('firm_id').references(() => firms.id).notNull(),
  clientId: text('client_id').references(() => clients.id).notNull(),
  caseId: text('case_id').references(() => cases.id),
  feeAgreementId: text('fee_agreement_id').references(() => feeAgreements.id),
  hearingId: text('hearing_id').references(() => hearings.id),
  paymentDate: text('payment_date').notNull(),
  amountPaisa: integer('amount_paisa').notNull(),
  method: text('method').$type<'cash' | 'bank' | 'bkash' | 'nagad' | 'cheque' | 'other'>().notNull(),
  reference: text('reference'),
  receiptNumber: text('receipt_number').notNull(),
  purposeNote: text('purpose_note').notNull(),
  status: text('status').$type<'posted' | 'void'>().default('posted').notNull(),
  voidReason: text('void_reason'),
  voidedBy: text('voided_by'),
  voidedAt: text('voided_at'),
  idempotencyKey: text('idempotency_key').notNull(),
  legacyUnassigned: integer('legacy_unassigned', { mode: 'boolean' }).default(false).notNull(),
  createdAt: text('created_at').default(sql`(CURRENT_TIMESTAMP)`).notNull(),
  updatedAt: text('updated_at').default(sql`(CURRENT_TIMESTAMP)`).notNull(),
  deletedAt: text('deleted_at'),
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
]);

// 26. Expense Categories Table
export const expenseCategories = sqliteTable('expense_categories', {
  id: text('id').primaryKey(),
  firmId: text('firm_id').references(() => firms.id).notNull(),
  name: text('name').notNull(),
  isDefault: integer('is_default', { mode: 'boolean' }).default(false).notNull(),
  createdAt: text('created_at').default(sql`(CURRENT_TIMESTAMP)`).notNull(),
  updatedAt: text('updated_at').default(sql`(CURRENT_TIMESTAMP)`).notNull(),
  deletedAt: text('deleted_at'),
  createdBy: text('created_by'),
  updatedBy: text('updated_by'),
}, (table) => [
  index('idx_expense_categories_firm_id').on(table.firmId),
]);

// 27. Expenses Table
export const expenses = sqliteTable('expenses', {
  id: text('id').primaryKey(),
  firmId: text('firm_id').references(() => firms.id).notNull(),
  clientId: text('client_id').references(() => clients.id),
  caseId: text('case_id').references(() => cases.id),
  categoryId: text('category_id').references(() => expenseCategories.id).notNull(),
  expenseDate: text('expense_date').notNull(),
  amountPaisa: integer('amount_paisa').notNull(),
  description: text('description').notNull(),
  reimbursable: integer('reimbursable', { mode: 'boolean' }).default(true).notNull(),
  status: text('status').$type<'posted' | 'void'>().default('posted').notNull(),
  voidReason: text('void_reason'),
  voidedBy: text('voided_by'),
  voidedAt: text('voided_at'),
  createdAt: text('created_at').default(sql`(CURRENT_TIMESTAMP)`).notNull(),
  updatedAt: text('updated_at').default(sql`(CURRENT_TIMESTAMP)`).notNull(),
  deletedAt: text('deleted_at'),
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

// 28. Chamber Operational Expense Categories Table
export const chamberExpenseCategories = sqliteTable('chamber_expense_categories', {
  id: text('id').primaryKey(),
  firmId: text('firm_id').references(() => firms.id).notNull(),
  name: text('name').notNull(),
  nameBn: text('name_bn'),
  kind: text('kind').$type<'general' | 'salary'>().default('general').notNull(),
  isDefault: integer('is_default', { mode: 'boolean' }).default(false).notNull(),
  createdAt: text('created_at').default(sql`(CURRENT_TIMESTAMP)`).notNull(),
  updatedAt: text('updated_at').default(sql`(CURRENT_TIMESTAMP)`).notNull(),
  deletedAt: text('deleted_at'),
  createdBy: text('created_by'),
  updatedBy: text('updated_by'),
}, (table) => [
  index('idx_chamber_expense_categories_firm_id').on(table.firmId),
]);

// 29. Chamber Advances Table
export const chamberAdvances = sqliteTable('chamber_advances', {
  id: text('id').primaryKey(),
  firmId: text('firm_id').references(() => firms.id).notNull(),
  givenTo: text('given_to').notNull(),
  givenToUserId: text('given_to_user_id').references(() => users.id),
  amountPaisa: integer('amount_paisa').notNull(),
  givenDate: text('given_date').notNull(),
  purpose: text('purpose').notNull(),
  paymentMethod: text('payment_method').$type<'cash' | 'bank' | 'mobile_banking' | 'cheque' | 'other'>().notNull(),
  status: text('status').$type<'open' | 'settled' | 'void'>().default('open').notNull(),
  voidReason: text('void_reason'),
  voidedBy: text('voided_by'),
  voidedAt: text('voided_at'),
  createdAt: text('created_at').default(sql`(CURRENT_TIMESTAMP)`).notNull(),
  updatedAt: text('updated_at').default(sql`(CURRENT_TIMESTAMP)`).notNull(),
  deletedAt: text('deleted_at'),
  createdBy: text('created_by'),
  updatedBy: text('updated_by'),
}, (table) => [
  index('idx_chamber_advances_firm_id').on(table.firmId),
  index('idx_chamber_advances_status').on(table.status),
  index('idx_chamber_advances_given_date').on(table.givenDate),
]);

// 30. Chamber Expenses Table
export const chamberExpenses = sqliteTable('chamber_expenses', {
  id: text('id').primaryKey(),
  firmId: text('firm_id').references(() => firms.id).notNull(),
  categoryId: text('category_id').references(() => chamberExpenseCategories.id).notNull(),
  description: text('description').notNull(),
  amountPaisa: integer('amount_paisa').notNull(),
  expenseDate: text('expense_date').notNull(),
  paidTo: text('paid_to').notNull(),
  paymentMethod: text('payment_method').$type<'cash' | 'bank' | 'mobile_banking' | 'cheque' | 'other'>().notNull(),
  receiptRef: text('receipt_ref'),
  notes: text('notes'),
  advanceId: text('advance_id').references(() => chamberAdvances.id),
  status: text('status').$type<'posted' | 'void'>().default('posted').notNull(),
  voidReason: text('void_reason'),
  voidedBy: text('voided_by'),
  voidedAt: text('voided_at'),
  createdAt: text('created_at').default(sql`(CURRENT_TIMESTAMP)`).notNull(),
  updatedAt: text('updated_at').default(sql`(CURRENT_TIMESTAMP)`).notNull(),
  deletedAt: text('deleted_at'),
  createdBy: text('created_by'),
  updatedBy: text('updated_by'),
}, (table) => [
  index('idx_chamber_expenses_firm_id').on(table.firmId),
  index('idx_chamber_expenses_expense_date').on(table.expenseDate),
  index('idx_chamber_expenses_category_id').on(table.categoryId),
  index('idx_chamber_expenses_status').on(table.status),
]);

// 31. Chamber Advance Settlements Table
export const chamberAdvanceSettlements = sqliteTable('chamber_advance_settlements', {
  id: text('id').primaryKey(),
  firmId: text('firm_id').references(() => firms.id).notNull(),
  advanceId: text('advance_id').references(() => chamberAdvances.id).notNull(),
  type: text('type').$type<'expense' | 'refund'>().notNull(),
  expenseId: text('expense_id').references(() => chamberExpenses.id),
  amountPaisa: integer('amount_paisa').notNull(),
  settledDate: text('settled_date').notNull(),
  notes: text('notes'),
  createdAt: text('created_at').default(sql`(CURRENT_TIMESTAMP)`).notNull(),
  updatedAt: text('updated_at').default(sql`(CURRENT_TIMESTAMP)`).notNull(),
  deletedAt: text('deleted_at'),
  createdBy: text('created_by'),
  updatedBy: text('updated_by'),
}, (table) => [
  index('idx_chamber_advance_settlements_firm_id').on(table.firmId),
  index('idx_chamber_advance_settlements_advance_id').on(table.advanceId),
]);

// Type Inference Exports
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
export type ChamberExpenseCategory = typeof chamberExpenseCategories.$inferSelect;
export type NewChamberExpenseCategory = typeof chamberExpenseCategories.$inferInsert;
export type ChamberExpense = typeof chamberExpenses.$inferSelect;
export type NewChamberExpense = typeof chamberExpenses.$inferInsert;
export type ChamberAdvance = typeof chamberAdvances.$inferSelect;
export type NewChamberAdvance = typeof chamberAdvances.$inferInsert;
export type ChamberAdvanceSettlement = typeof chamberAdvanceSettlements.$inferSelect;
export type NewChamberAdvanceSettlement = typeof chamberAdvanceSettlements.$inferInsert;
