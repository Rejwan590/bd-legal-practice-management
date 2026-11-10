CREATE TABLE `admin_audit` (
	`id` text PRIMARY KEY NOT NULL,
	`admin_id` text NOT NULL,
	`action` text NOT NULL,
	`target_firm_id` text,
	`old` text,
	`new` text,
	`ip` text,
	`at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	FOREIGN KEY (`admin_id`) REFERENCES `platform_admins`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_admin_audit_admin_id` ON `admin_audit` (`admin_id`);--> statement-breakpoint
CREATE INDEX `idx_admin_audit_at` ON `admin_audit` (`at`);--> statement-breakpoint
CREATE TABLE `appointment_attendees` (
	`id` text PRIMARY KEY NOT NULL,
	`appointment_id` text NOT NULL,
	`user_id` text NOT NULL,
	`firm_id` text NOT NULL,
	`created_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	`updated_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	FOREIGN KEY (`appointment_id`) REFERENCES `appointments`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`firm_id`) REFERENCES `firms`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_appointment_attendees_appointment_id` ON `appointment_attendees` (`appointment_id`);--> statement-breakpoint
CREATE INDEX `idx_appointment_attendees_user_id` ON `appointment_attendees` (`user_id`);--> statement-breakpoint
CREATE TABLE `appointments` (
	`id` text PRIMARY KEY NOT NULL,
	`firm_id` text NOT NULL,
	`title` text NOT NULL,
	`type` text NOT NULL,
	`starts_at` text NOT NULL,
	`ends_at` text NOT NULL,
	`mode` text DEFAULT 'in_person' NOT NULL,
	`location` text,
	`organiser_user_id` text NOT NULL,
	`client_id` text,
	`case_id` text,
	`status` text DEFAULT 'scheduled' NOT NULL,
	`notes` text,
	`reminder_minutes_before` integer DEFAULT 30 NOT NULL,
	`created_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	`updated_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	`deleted_at` text,
	`created_by` text,
	`updated_by` text,
	FOREIGN KEY (`firm_id`) REFERENCES `firms`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`organiser_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`client_id`) REFERENCES `clients`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`case_id`) REFERENCES `cases`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_appointments_firm_id` ON `appointments` (`firm_id`);--> statement-breakpoint
CREATE INDEX `idx_appointments_starts_at` ON `appointments` (`starts_at`);--> statement-breakpoint
CREATE INDEX `idx_appointments_organiser` ON `appointments` (`organiser_user_id`);--> statement-breakpoint
CREATE INDEX `idx_appointments_client_id` ON `appointments` (`client_id`);--> statement-breakpoint
CREATE INDEX `idx_appointments_case_id` ON `appointments` (`case_id`);--> statement-breakpoint
CREATE TABLE `audit_log` (
	`id` text PRIMARY KEY NOT NULL,
	`firm_id` text NOT NULL,
	`user_id` text NOT NULL,
	`user_name` text NOT NULL,
	`entity` text NOT NULL,
	`entity_id` text NOT NULL,
	`action` text NOT NULL,
	`old_value` text,
	`new_value` text,
	`timestamp` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	`created_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	`updated_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	`deleted_at` text,
	`created_by` text,
	`updated_by` text,
	FOREIGN KEY (`firm_id`) REFERENCES `firms`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_audit_log_firm_id` ON `audit_log` (`firm_id`);--> statement-breakpoint
CREATE INDEX `idx_audit_log_timestamp` ON `audit_log` (`timestamp`);--> statement-breakpoint
CREATE TABLE `backups_log` (
	`id` text PRIMARY KEY NOT NULL,
	`firm_id` text NOT NULL,
	`kind` text NOT NULL,
	`at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	`checksum` text NOT NULL,
	`created_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	`updated_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	`deleted_at` text,
	`created_by` text,
	`updated_by` text,
	FOREIGN KEY (`firm_id`) REFERENCES `firms`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_backups_log_firm_id` ON `backups_log` (`firm_id`);--> statement-breakpoint
CREATE TABLE `case_notes` (
	`id` text PRIMARY KEY NOT NULL,
	`firm_id` text NOT NULL,
	`case_id` text NOT NULL,
	`note_date` text NOT NULL,
	`body` text NOT NULL,
	`created_by` text,
	`updated_by` text,
	`created_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	`updated_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	`deleted_at` text,
	FOREIGN KEY (`firm_id`) REFERENCES `firms`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`case_id`) REFERENCES `cases`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_case_notes_firm_id` ON `case_notes` (`firm_id`);--> statement-breakpoint
CREATE INDEX `idx_case_notes_case_id` ON `case_notes` (`case_id`);--> statement-breakpoint
CREATE INDEX `idx_case_notes_note_date` ON `case_notes` (`note_date`);--> statement-breakpoint
CREATE TABLE `case_shares` (
	`id` text PRIMARY KEY NOT NULL,
	`firm_id` text NOT NULL,
	`case_id` text NOT NULL,
	`user_id` text NOT NULL,
	`created_by` text NOT NULL,
	`created_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	`deleted_at` text,
	FOREIGN KEY (`firm_id`) REFERENCES `firms`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`case_id`) REFERENCES `cases`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_case_shares_firm_id` ON `case_shares` (`firm_id`);--> statement-breakpoint
CREATE INDEX `idx_case_shares_case_id` ON `case_shares` (`case_id`);--> statement-breakpoint
CREATE INDEX `idx_case_shares_user_id` ON `case_shares` (`user_id`);--> statement-breakpoint
CREATE TABLE `cases` (
	`id` text PRIMARY KEY NOT NULL,
	`firm_id` text NOT NULL,
	`client_id` text NOT NULL,
	`file_serial` text,
	`case_number` text NOT NULL,
	`court` text NOT NULL,
	`matter_type` text NOT NULL,
	`description` text,
	`plaintiff` text,
	`defendant` text,
	`our_role` text,
	`plaintiff_lawyer` text,
	`defendant_lawyer` text,
	`responsible_lawyer_id` text,
	`status` text DEFAULT 'ongoing' NOT NULL,
	`case_date` text,
	`closed_on` text,
	`case_category` text DEFAULT 'civil' NOT NULL,
	`party_a_role` text,
	`party_b_role` text,
	`police_station` text,
	`sections_of_law` text,
	`restricted` integer DEFAULT false NOT NULL,
	`next_hearing_at` text,
	`created_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	`updated_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	`deleted_at` text,
	`created_by` text,
	`updated_by` text,
	FOREIGN KEY (`firm_id`) REFERENCES `firms`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`client_id`) REFERENCES `clients`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_cases_client_id` ON `cases` (`client_id`);--> statement-breakpoint
CREATE INDEX `idx_cases_firm_id` ON `cases` (`firm_id`);--> statement-breakpoint
CREATE INDEX `idx_cases_case_number` ON `cases` (`case_number`);--> statement-breakpoint
CREATE INDEX `idx_cases_court` ON `cases` (`court`);--> statement-breakpoint
CREATE INDEX `idx_cases_status` ON `cases` (`status`);--> statement-breakpoint
CREATE INDEX `idx_cases_file_serial` ON `cases` (`file_serial`);--> statement-breakpoint
CREATE INDEX `idx_cases_resp_lawyer` ON `cases` (`responsible_lawyer_id`);--> statement-breakpoint
CREATE INDEX `idx_cases_case_date` ON `cases` (`case_date`);--> statement-breakpoint
CREATE INDEX `idx_cases_category` ON `cases` (`case_category`);--> statement-breakpoint
CREATE INDEX `idx_cases_next_hearing_at` ON `cases` (`next_hearing_at`);--> statement-breakpoint
CREATE UNIQUE INDEX `uidx_cases_firm_file_serial` ON `cases` (`firm_id`,`file_serial`);--> statement-breakpoint
CREATE TABLE `chamber_advance_settlements` (
	`id` text PRIMARY KEY NOT NULL,
	`firm_id` text NOT NULL,
	`advance_id` text NOT NULL,
	`type` text NOT NULL,
	`expense_id` text,
	`amount_paisa` integer NOT NULL,
	`settled_date` text NOT NULL,
	`notes` text,
	`created_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	`updated_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	`deleted_at` text,
	`created_by` text,
	`updated_by` text,
	FOREIGN KEY (`firm_id`) REFERENCES `firms`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`advance_id`) REFERENCES `chamber_advances`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`expense_id`) REFERENCES `chamber_expenses`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_chamber_advance_settlements_firm_id` ON `chamber_advance_settlements` (`firm_id`);--> statement-breakpoint
CREATE INDEX `idx_chamber_advance_settlements_advance_id` ON `chamber_advance_settlements` (`advance_id`);--> statement-breakpoint
CREATE TABLE `chamber_advances` (
	`id` text PRIMARY KEY NOT NULL,
	`firm_id` text NOT NULL,
	`given_to` text NOT NULL,
	`given_to_user_id` text,
	`amount_paisa` integer NOT NULL,
	`given_date` text NOT NULL,
	`purpose` text NOT NULL,
	`payment_method` text NOT NULL,
	`status` text DEFAULT 'open' NOT NULL,
	`void_reason` text,
	`voided_by` text,
	`voided_at` text,
	`created_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	`updated_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	`deleted_at` text,
	`created_by` text,
	`updated_by` text,
	FOREIGN KEY (`firm_id`) REFERENCES `firms`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`given_to_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_chamber_advances_firm_id` ON `chamber_advances` (`firm_id`);--> statement-breakpoint
CREATE INDEX `idx_chamber_advances_status` ON `chamber_advances` (`status`);--> statement-breakpoint
CREATE INDEX `idx_chamber_advances_given_date` ON `chamber_advances` (`given_date`);--> statement-breakpoint
CREATE TABLE `chamber_expense_categories` (
	`id` text PRIMARY KEY NOT NULL,
	`firm_id` text NOT NULL,
	`name` text NOT NULL,
	`name_bn` text,
	`kind` text DEFAULT 'general' NOT NULL,
	`is_default` integer DEFAULT false NOT NULL,
	`created_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	`updated_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	`deleted_at` text,
	`created_by` text,
	`updated_by` text,
	FOREIGN KEY (`firm_id`) REFERENCES `firms`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_chamber_expense_categories_firm_id` ON `chamber_expense_categories` (`firm_id`);--> statement-breakpoint
CREATE TABLE `chamber_expenses` (
	`id` text PRIMARY KEY NOT NULL,
	`firm_id` text NOT NULL,
	`category_id` text NOT NULL,
	`description` text NOT NULL,
	`amount_paisa` integer NOT NULL,
	`expense_date` text NOT NULL,
	`paid_to` text NOT NULL,
	`payment_method` text NOT NULL,
	`receipt_ref` text,
	`notes` text,
	`advance_id` text,
	`status` text DEFAULT 'posted' NOT NULL,
	`void_reason` text,
	`voided_by` text,
	`voided_at` text,
	`created_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	`updated_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	`deleted_at` text,
	`created_by` text,
	`updated_by` text,
	FOREIGN KEY (`firm_id`) REFERENCES `firms`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`category_id`) REFERENCES `chamber_expense_categories`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`advance_id`) REFERENCES `chamber_advances`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_chamber_expenses_firm_id` ON `chamber_expenses` (`firm_id`);--> statement-breakpoint
CREATE INDEX `idx_chamber_expenses_expense_date` ON `chamber_expenses` (`expense_date`);--> statement-breakpoint
CREATE INDEX `idx_chamber_expenses_category_id` ON `chamber_expenses` (`category_id`);--> statement-breakpoint
CREATE INDEX `idx_chamber_expenses_status` ON `chamber_expenses` (`status`);--> statement-breakpoint
CREATE TABLE `client_notes` (
	`id` text PRIMARY KEY NOT NULL,
	`firm_id` text NOT NULL,
	`client_id` text NOT NULL,
	`note_date` text NOT NULL,
	`body` text NOT NULL,
	`created_by` text,
	`updated_by` text,
	`created_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	`updated_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	`deleted_at` text,
	FOREIGN KEY (`firm_id`) REFERENCES `firms`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`client_id`) REFERENCES `clients`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_client_notes_firm_id` ON `client_notes` (`firm_id`);--> statement-breakpoint
CREATE INDEX `idx_client_notes_client_id` ON `client_notes` (`client_id`);--> statement-breakpoint
CREATE INDEX `idx_client_notes_note_date` ON `client_notes` (`note_date`);--> statement-breakpoint
CREATE TABLE `client_photos` (
	`client_id` text PRIMARY KEY NOT NULL,
	`firm_id` text NOT NULL,
	`mime` text NOT NULL,
	`bytes` text NOT NULL,
	`r2_key` text,
	`updated_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	FOREIGN KEY (`client_id`) REFERENCES `clients`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`firm_id`) REFERENCES `firms`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_client_photos_firm_id` ON `client_photos` (`firm_id`);--> statement-breakpoint
CREATE TABLE `clients` (
	`id` text PRIMARY KEY NOT NULL,
	`firm_id` text NOT NULL,
	`name` text NOT NULL,
	`name_bn` text,
	`phone` text NOT NULL,
	`email` text,
	`address` text NOT NULL,
	`notes` text,
	`archived` integer DEFAULT false NOT NULL,
	`created_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	`updated_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	`deleted_at` text,
	`created_by` text,
	`updated_by` text,
	FOREIGN KEY (`firm_id`) REFERENCES `firms`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_clients_firm_id` ON `clients` (`firm_id`);--> statement-breakpoint
CREATE INDEX `idx_clients_name` ON `clients` (`name`);--> statement-breakpoint
CREATE INDEX `idx_clients_phone` ON `clients` (`phone`);--> statement-breakpoint
CREATE TABLE `devices` (
	`id` text PRIMARY KEY NOT NULL,
	`firm_id` text NOT NULL,
	`user_id` text NOT NULL,
	`device_key_hash` text NOT NULL,
	`name` text NOT NULL,
	`user_agent` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`first_seen_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	`last_seen_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	`approved_by_admin_id` text,
	FOREIGN KEY (`firm_id`) REFERENCES `firms`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`approved_by_admin_id`) REFERENCES `platform_admins`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `devices_device_key_hash_unique` ON `devices` (`device_key_hash`);--> statement-breakpoint
CREATE INDEX `idx_devices_firm_id` ON `devices` (`firm_id`);--> statement-breakpoint
CREATE INDEX `idx_devices_user_id` ON `devices` (`user_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `idx_devices_key_hash` ON `devices` (`device_key_hash`);--> statement-breakpoint
CREATE INDEX `idx_devices_status` ON `devices` (`status`);--> statement-breakpoint
CREATE TABLE `expense_categories` (
	`id` text PRIMARY KEY NOT NULL,
	`firm_id` text NOT NULL,
	`name` text NOT NULL,
	`is_default` integer DEFAULT false NOT NULL,
	`created_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	`updated_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	`deleted_at` text,
	`created_by` text,
	`updated_by` text,
	FOREIGN KEY (`firm_id`) REFERENCES `firms`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_expense_categories_firm_id` ON `expense_categories` (`firm_id`);--> statement-breakpoint
CREATE TABLE `expenses` (
	`id` text PRIMARY KEY NOT NULL,
	`firm_id` text NOT NULL,
	`client_id` text,
	`case_id` text,
	`category_id` text NOT NULL,
	`expense_date` text NOT NULL,
	`amount_paisa` integer NOT NULL,
	`description` text NOT NULL,
	`reimbursable` integer DEFAULT true NOT NULL,
	`status` text DEFAULT 'posted' NOT NULL,
	`void_reason` text,
	`voided_by` text,
	`voided_at` text,
	`created_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	`updated_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	`deleted_at` text,
	`created_by` text,
	`updated_by` text,
	FOREIGN KEY (`firm_id`) REFERENCES `firms`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`client_id`) REFERENCES `clients`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`case_id`) REFERENCES `cases`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`category_id`) REFERENCES `expense_categories`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_expenses_firm_id` ON `expenses` (`firm_id`);--> statement-breakpoint
CREATE INDEX `idx_expenses_client_id` ON `expenses` (`client_id`);--> statement-breakpoint
CREATE INDEX `idx_expenses_case_id` ON `expenses` (`case_id`);--> statement-breakpoint
CREATE INDEX `idx_expenses_category_id` ON `expenses` (`category_id`);--> statement-breakpoint
CREATE INDEX `idx_expenses_status` ON `expenses` (`status`);--> statement-breakpoint
CREATE INDEX `idx_expenses_expense_date` ON `expenses` (`expense_date`);--> statement-breakpoint
CREATE TABLE `fee_agreement_changes` (
	`id` text PRIMARY KEY NOT NULL,
	`firm_id` text NOT NULL,
	`fee_agreement_id` text NOT NULL,
	`old_amount_paisa` integer NOT NULL,
	`new_amount_paisa` integer NOT NULL,
	`reason` text NOT NULL,
	`changed_by` text NOT NULL,
	`created_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	FOREIGN KEY (`firm_id`) REFERENCES `firms`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`fee_agreement_id`) REFERENCES `fee_agreements`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_fee_agreement_changes_firm_id` ON `fee_agreement_changes` (`firm_id`);--> statement-breakpoint
CREATE INDEX `idx_fee_agreement_changes_agreement_id` ON `fee_agreement_changes` (`fee_agreement_id`);--> statement-breakpoint
CREATE TABLE `fee_agreements` (
	`id` text PRIMARY KEY NOT NULL,
	`firm_id` text NOT NULL,
	`client_id` text NOT NULL,
	`case_id` text,
	`fee_type` text DEFAULT 'fixed' NOT NULL,
	`agreed_amount_paisa` integer NOT NULL,
	`agreement_date` text NOT NULL,
	`notes` text,
	`status` text DEFAULT 'active' NOT NULL,
	`created_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	`updated_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	`deleted_at` text,
	`created_by` text,
	`updated_by` text,
	FOREIGN KEY (`firm_id`) REFERENCES `firms`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`client_id`) REFERENCES `clients`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`case_id`) REFERENCES `cases`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_fee_agreements_firm_id` ON `fee_agreements` (`firm_id`);--> statement-breakpoint
CREATE INDEX `idx_fee_agreements_client_id` ON `fee_agreements` (`client_id`);--> statement-breakpoint
CREATE INDEX `idx_fee_agreements_case_id` ON `fee_agreements` (`case_id`);--> statement-breakpoint
CREATE INDEX `idx_fee_agreements_status` ON `fee_agreements` (`status`);--> statement-breakpoint
CREATE TABLE `fee_payments` (
	`id` text PRIMARY KEY NOT NULL,
	`firm_id` text NOT NULL,
	`client_id` text NOT NULL,
	`case_id` text,
	`fee_agreement_id` text,
	`hearing_id` text,
	`payment_date` text NOT NULL,
	`amount_paisa` integer NOT NULL,
	`method` text NOT NULL,
	`reference` text,
	`receipt_number` text NOT NULL,
	`purpose_note` text NOT NULL,
	`status` text DEFAULT 'posted' NOT NULL,
	`void_reason` text,
	`voided_by` text,
	`voided_at` text,
	`idempotency_key` text NOT NULL,
	`legacy_unassigned` integer DEFAULT false NOT NULL,
	`created_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	`updated_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	`deleted_at` text,
	`created_by` text,
	`updated_by` text,
	FOREIGN KEY (`firm_id`) REFERENCES `firms`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`client_id`) REFERENCES `clients`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`case_id`) REFERENCES `cases`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`fee_agreement_id`) REFERENCES `fee_agreements`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`hearing_id`) REFERENCES `hearings`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_fee_payments_firm_idempotency` ON `fee_payments` (`firm_id`,`idempotency_key`);--> statement-breakpoint
CREATE UNIQUE INDEX `idx_fee_payments_firm_receipt` ON `fee_payments` (`firm_id`,`receipt_number`);--> statement-breakpoint
CREATE INDEX `idx_fee_payments_firm_id` ON `fee_payments` (`firm_id`);--> statement-breakpoint
CREATE INDEX `idx_fee_payments_client_id` ON `fee_payments` (`client_id`);--> statement-breakpoint
CREATE INDEX `idx_fee_payments_case_id` ON `fee_payments` (`case_id`);--> statement-breakpoint
CREATE INDEX `idx_fee_payments_fee_agreement_id` ON `fee_payments` (`fee_agreement_id`);--> statement-breakpoint
CREATE INDEX `idx_fee_payments_hearing_id` ON `fee_payments` (`hearing_id`);--> statement-breakpoint
CREATE INDEX `idx_fee_payments_status` ON `fee_payments` (`status`);--> statement-breakpoint
CREATE INDEX `idx_fee_payments_payment_date` ON `fee_payments` (`payment_date`);--> statement-breakpoint
CREATE TABLE `firms` (
	`id` text PRIMARY KEY NOT NULL,
	`firm_id` text NOT NULL,
	`name` text NOT NULL,
	`bar_council_reg` text,
	`office_address` text,
	`court_affiliations` text,
	`contact` text,
	`max_users` integer DEFAULT 10 NOT NULL,
	`max_devices` integer DEFAULT 5 NOT NULL,
	`billing_cycle` text DEFAULT 'monthly' NOT NULL,
	`custom_base_price_bdt` integer,
	`custom_annual_price_bdt` integer,
	`custom_extra_user_price_bdt` integer,
	`custom_extra_device_price_bdt` integer,
	`price_locked_until` text,
	`pricing_note` text,
	`is_trial` integer DEFAULT false NOT NULL,
	`trial_started_at` text,
	`trial_days` integer,
	`device_policy` text DEFAULT 'auto-approve' NOT NULL,
	`allow_owner_device_removal` integer DEFAULT false NOT NULL,
	`visibility_mode` text DEFAULT 'team' NOT NULL,
	`plan_id` text,
	`license_starts_at` text,
	`license_expires_at` text NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`created_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	`updated_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	`deleted_at` text,
	`created_by` text,
	`updated_by` text,
	FOREIGN KEY (`plan_id`) REFERENCES `plans`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_firms_firm_id` ON `firms` (`firm_id`);--> statement-breakpoint
CREATE INDEX `idx_firms_status` ON `firms` (`status`);--> statement-breakpoint
CREATE INDEX `idx_firms_license_expires_at` ON `firms` (`license_expires_at`);--> statement-breakpoint
CREATE TABLE `hearing_date_history` (
	`id` text PRIMARY KEY NOT NULL,
	`firm_id` text NOT NULL,
	`hearing_id` text NOT NULL,
	`case_id` text NOT NULL,
	`old_at` text NOT NULL,
	`new_at` text NOT NULL,
	`reason` text NOT NULL,
	`old_fixed_for` text,
	`new_fixed_for` text,
	`changed_by` text NOT NULL,
	`changed_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	FOREIGN KEY (`firm_id`) REFERENCES `firms`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`hearing_id`) REFERENCES `hearings`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`case_id`) REFERENCES `cases`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_hearing_date_history_firm_id` ON `hearing_date_history` (`firm_id`);--> statement-breakpoint
CREATE INDEX `idx_hearing_date_history_hearing_id` ON `hearing_date_history` (`hearing_id`);--> statement-breakpoint
CREATE INDEX `idx_hearing_date_history_case_id` ON `hearing_date_history` (`case_id`);--> statement-breakpoint
CREATE TABLE `hearings` (
	`id` text PRIMARY KEY NOT NULL,
	`firm_id` text NOT NULL,
	`case_id` text NOT NULL,
	`appearing_lawyer_id` text,
	`scheduled_at` text NOT NULL,
	`court` text,
	`purpose` text,
	`status` text DEFAULT 'scheduled' NOT NULL,
	`outcome_note` text,
	`fixed_for` text,
	`fixed_for_note` text,
	`created_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	`updated_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	`deleted_at` text,
	`created_by` text,
	`updated_by` text,
	FOREIGN KEY (`firm_id`) REFERENCES `firms`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`case_id`) REFERENCES `cases`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_hearings_firm_id` ON `hearings` (`firm_id`);--> statement-breakpoint
CREATE INDEX `idx_hearings_case_id` ON `hearings` (`case_id`);--> statement-breakpoint
CREATE INDEX `idx_hearings_appearing_lawyer` ON `hearings` (`appearing_lawyer_id`);--> statement-breakpoint
CREATE INDEX `idx_hearings_fixed_for` ON `hearings` (`fixed_for`);--> statement-breakpoint
CREATE INDEX `idx_hearings_scheduled_at` ON `hearings` (`scheduled_at`);--> statement-breakpoint
CREATE TABLE `license_events` (
	`id` text PRIMARY KEY NOT NULL,
	`firm_id` text NOT NULL,
	`type` text NOT NULL,
	`old` text,
	`new` text,
	`by_admin` text NOT NULL,
	`at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	FOREIGN KEY (`firm_id`) REFERENCES `firms`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`by_admin`) REFERENCES `platform_admins`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_license_events_firm_id` ON `license_events` (`firm_id`);--> statement-breakpoint
CREATE INDEX `idx_license_events_at` ON `license_events` (`at`);--> statement-breakpoint
CREATE TABLE `number_sequences` (
	`id` text PRIMARY KEY NOT NULL,
	`firm_id` text NOT NULL,
	`type` text NOT NULL,
	`prefix` text NOT NULL,
	`current_val` integer DEFAULT 0 NOT NULL,
	`updated_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	FOREIGN KEY (`firm_id`) REFERENCES `firms`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_number_sequences_firm_type` ON `number_sequences` (`firm_id`,`type`);--> statement-breakpoint
CREATE INDEX `idx_number_sequences_firm_id` ON `number_sequences` (`firm_id`);--> statement-breakpoint
CREATE TABLE `payments` (
	`id` text PRIMARY KEY NOT NULL,
	`firm_id` text NOT NULL,
	`amount` integer NOT NULL,
	`method` text NOT NULL,
	`txn_id` text NOT NULL,
	`note` text,
	`paid_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	`verified_by` text,
	`created_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	`updated_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	`deleted_at` text,
	`created_by` text,
	`updated_by` text,
	FOREIGN KEY (`firm_id`) REFERENCES `firms`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_payments_firm_id` ON `payments` (`firm_id`);--> statement-breakpoint
CREATE TABLE `plans` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`duration_months` integer NOT NULL,
	`price_bdt` integer NOT NULL,
	`seats` integer NOT NULL,
	`included_users` integer DEFAULT 5 NOT NULL,
	`included_devices` integer DEFAULT 5 NOT NULL,
	`extra_user_price_bdt` integer DEFAULT 100 NOT NULL,
	`extra_device_price_bdt` integer DEFAULT 100 NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`features` text DEFAULT '[]',
	`created_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	`updated_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	`deleted_at` text,
	`created_by` text,
	`updated_by` text
);
--> statement-breakpoint
CREATE TABLE `platform_admins` (
	`id` text PRIMARY KEY NOT NULL,
	`email` text NOT NULL,
	`password_hash` text NOT NULL,
	`totp_secret` text,
	`active` integer DEFAULT true NOT NULL,
	`failed_attempts` integer DEFAULT 0 NOT NULL,
	`locked_until` text,
	`created_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	`updated_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `platform_admins_email_unique` ON `platform_admins` (`email`);--> statement-breakpoint
CREATE UNIQUE INDEX `idx_platform_admins_email` ON `platform_admins` (`email`);--> statement-breakpoint
CREATE TABLE `tasks` (
	`id` text PRIMARY KEY NOT NULL,
	`firm_id` text NOT NULL,
	`case_id` text,
	`client_id` text,
	`assigned_to` text NOT NULL,
	`title` text NOT NULL,
	`description` text,
	`priority` text DEFAULT 'normal' NOT NULL,
	`due_at` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`completed_at` text,
	`created_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	`updated_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	`deleted_at` text,
	`created_by` text,
	`updated_by` text,
	FOREIGN KEY (`firm_id`) REFERENCES `firms`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`case_id`) REFERENCES `cases`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`client_id`) REFERENCES `clients`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`assigned_to`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_tasks_firm_id` ON `tasks` (`firm_id`);--> statement-breakpoint
CREATE INDEX `idx_tasks_case_id` ON `tasks` (`case_id`);--> statement-breakpoint
CREATE INDEX `idx_tasks_client_id` ON `tasks` (`client_id`);--> statement-breakpoint
CREATE INDEX `idx_tasks_assigned_to` ON `tasks` (`assigned_to`);--> statement-breakpoint
CREATE INDEX `idx_tasks_status` ON `tasks` (`status`);--> statement-breakpoint
CREATE INDEX `idx_tasks_due_at` ON `tasks` (`due_at`);--> statement-breakpoint
CREATE TABLE `users` (
	`id` text PRIMARY KEY NOT NULL,
	`firm_id` text NOT NULL,
	`name` text NOT NULL,
	`email` text NOT NULL,
	`password_hash` text NOT NULL,
	`role` text NOT NULL,
	`job_type` text DEFAULT 'other' NOT NULL,
	`job_title_label` text,
	`reports_to_user_id` text,
	`permissions` text NOT NULL,
	`language` text DEFAULT 'en' NOT NULL,
	`active` integer DEFAULT true NOT NULL,
	`must_change_password` integer DEFAULT false NOT NULL,
	`failed_login_attempts` integer DEFAULT 0 NOT NULL,
	`locked_until` text,
	`created_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	`updated_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	`deleted_at` text,
	`created_by` text,
	`updated_by` text,
	FOREIGN KEY (`firm_id`) REFERENCES `firms`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `users_email_unique` ON `users` (`email`);--> statement-breakpoint
CREATE INDEX `idx_users_firm_id` ON `users` (`firm_id`);--> statement-breakpoint
CREATE INDEX `idx_users_email` ON `users` (`email`);--> statement-breakpoint
CREATE INDEX `idx_users_reports_to` ON `users` (`reports_to_user_id`);