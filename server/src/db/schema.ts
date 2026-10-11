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
  status: text('status').$type<'ongoing' | 'closed'>().default('ongoing').notNull(),
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
  uniqueIndex('uidx_cases_firm_file_serial').on(table.firmId, table.fileSerial),
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
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  deletedAt: timestamp('deleted_at', { withTimezone: true }),
  createdBy: text('created_by'),
  updatedBy: text('updated_by'),
}, (table) => [
  index('idx_hearings_firm_id').on(table.firmId),
  index('idx_hearings_case_id').on(table.caseId),
  index('idx_hearings_appearing_lawyer').on(table.appearingLawyerId),
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

export type Plan = typeof plans.$inferSelect;
export type Firm = typeof firms.$inferSelect;
export type NewFirm = typeof firms.$inferInsert;
export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type Client = typeof clients.$inferSelect;
export type Case = typeof cases.$inferSelect;
export type Hearing = typeof hearings.$inferSelect;
export type NewHearing = typeof hearings.$inferInsert;
export type CaseShare = typeof caseShares.$inferSelect;
export type NewCaseShare = typeof caseShares.$inferInsert;
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

