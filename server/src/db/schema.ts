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
  planId: text('plan_id').references(() => plans.id),
  licenseExpiresAt: timestamp('license_expires_at', { withTimezone: true }).notNull(),
  status: text('status').$type<'active' | 'expired' | 'suspended'>().default('active').notNull(),
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
  permissions: jsonb('permissions').$type<string[]>().notNull(),
  language: text('language').$type<'en' | 'bn'>().default('en').notNull(),
  active: boolean('active').default(true).notNull(),
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
  uniqueIndex('uidx_cases_firm_file_serial').on(table.firmId, table.fileSerial),
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

export type Plan = typeof plans.$inferSelect;
export type Firm = typeof firms.$inferSelect;
export type User = typeof users.$inferSelect;
export type Client = typeof clients.$inferSelect;
export type Case = typeof cases.$inferSelect;
export type AuditLogEntry = typeof auditLog.$inferSelect;
export type Payment = typeof payments.$inferSelect;
export type BackupLogEntry = typeof backupsLog.$inferSelect;
export type PlatformAdmin = typeof platformAdmins.$inferSelect;
export type NewPlatformAdmin = typeof platformAdmins.$inferInsert;
export type AdminAuditEntry = typeof adminAudit.$inferSelect;
export type NewAdminAuditEntry = typeof adminAudit.$inferInsert;

