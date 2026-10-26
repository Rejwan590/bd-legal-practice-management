-- 0008_accounts_phase1.sql
-- Migration: Create tables for Accounts Phase 1 (fee agreements, changes, sequences, fee payments, expense categories, expenses)

CREATE TABLE IF NOT EXISTS "fee_agreements" (
	"id" text PRIMARY KEY NOT NULL,
	"firm_id" text NOT NULL,
	"client_id" text NOT NULL,
	"case_id" text,
	"fee_type" text DEFAULT 'fixed' NOT NULL,
	"agreed_amount_paisa" bigint NOT NULL,
	"agreement_date" text NOT NULL,
	"notes" text,
	"status" text DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	"created_by" text,
	"updated_by" text
);
--> statement-breakpoint
ALTER TABLE "fee_agreements" ADD CONSTRAINT "fee_agreements_firm_id_firms_id_fk" FOREIGN KEY ("firm_id") REFERENCES "public"."firms"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "fee_agreements" ADD CONSTRAINT "fee_agreements_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "fee_agreements" ADD CONSTRAINT "fee_agreements_case_id_cases_id_fk" FOREIGN KEY ("case_id") REFERENCES "public"."cases"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_fee_agreements_firm_id" ON "fee_agreements" USING btree ("firm_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_fee_agreements_client_id" ON "fee_agreements" USING btree ("client_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_fee_agreements_case_id" ON "fee_agreements" USING btree ("case_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_fee_agreements_status" ON "fee_agreements" USING btree ("status");
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "fee_agreement_changes" (
	"id" text PRIMARY KEY NOT NULL,
	"firm_id" text NOT NULL,
	"fee_agreement_id" text NOT NULL,
	"old_amount_paisa" bigint NOT NULL,
	"new_amount_paisa" bigint NOT NULL,
	"reason" text NOT NULL,
	"changed_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "fee_agreement_changes" ADD CONSTRAINT "fee_agreement_changes_firm_id_firms_id_fk" FOREIGN KEY ("firm_id") REFERENCES "public"."firms"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "fee_agreement_changes" ADD CONSTRAINT "fee_agreement_changes_fee_agreement_id_fee_agreements_id_fk" FOREIGN KEY ("fee_agreement_id") REFERENCES "public"."fee_agreements"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_fee_agreement_changes_firm_id" ON "fee_agreement_changes" USING btree ("firm_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_fee_agreement_changes_agreement_id" ON "fee_agreement_changes" USING btree ("fee_agreement_id");
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "number_sequences" (
	"id" text PRIMARY KEY NOT NULL,
	"firm_id" text NOT NULL,
	"type" text NOT NULL,
	"prefix" text NOT NULL,
	"current_val" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "number_sequences" ADD CONSTRAINT "number_sequences_firm_id_firms_id_fk" FOREIGN KEY ("firm_id") REFERENCES "public"."firms"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "idx_number_sequences_firm_type" ON "number_sequences" USING btree ("firm_id", "type");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_number_sequences_firm_id" ON "number_sequences" USING btree ("firm_id");
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "fee_payments" (
	"id" text PRIMARY KEY NOT NULL,
	"firm_id" text NOT NULL,
	"client_id" text NOT NULL,
	"case_id" text,
	"fee_agreement_id" text,
	"hearing_id" text,
	"payment_date" text NOT NULL,
	"amount_paisa" bigint NOT NULL,
	"method" text NOT NULL,
	"reference" text,
	"receipt_number" text NOT NULL,
	"purpose_note" text NOT NULL,
	"status" text DEFAULT 'posted' NOT NULL,
	"void_reason" text,
	"voided_by" text,
	"voided_at" timestamp with time zone,
	"idempotency_key" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	"created_by" text,
	"updated_by" text
);
--> statement-breakpoint
ALTER TABLE "fee_payments" ADD CONSTRAINT "fee_payments_firm_id_firms_id_fk" FOREIGN KEY ("firm_id") REFERENCES "public"."firms"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "fee_payments" ADD CONSTRAINT "fee_payments_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "fee_payments" ADD CONSTRAINT "fee_payments_case_id_cases_id_fk" FOREIGN KEY ("case_id") REFERENCES "public"."cases"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "fee_payments" ADD CONSTRAINT "fee_payments_fee_agreement_id_fee_agreements_id_fk" FOREIGN KEY ("fee_agreement_id") REFERENCES "public"."fee_agreements"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "fee_payments" ADD CONSTRAINT "fee_payments_hearing_id_hearings_id_fk" FOREIGN KEY ("hearing_id") REFERENCES "public"."hearings"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "idx_fee_payments_firm_idempotency" ON "fee_payments" USING btree ("firm_id", "idempotency_key");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "idx_fee_payments_firm_receipt" ON "fee_payments" USING btree ("firm_id", "receipt_number");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_fee_payments_firm_id" ON "fee_payments" USING btree ("firm_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_fee_payments_client_id" ON "fee_payments" USING btree ("client_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_fee_payments_case_id" ON "fee_payments" USING btree ("case_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_fee_payments_fee_agreement_id" ON "fee_payments" USING btree ("fee_agreement_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_fee_payments_hearing_id" ON "fee_payments" USING btree ("hearing_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_fee_payments_status" ON "fee_payments" USING btree ("status");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_fee_payments_payment_date" ON "fee_payments" USING btree ("payment_date");
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "expense_categories" (
	"id" text PRIMARY KEY NOT NULL,
	"firm_id" text NOT NULL,
	"name" text NOT NULL,
	"is_default" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	"created_by" text,
	"updated_by" text
);
--> statement-breakpoint
ALTER TABLE "expense_categories" ADD CONSTRAINT "expense_categories_firm_id_firms_id_fk" FOREIGN KEY ("firm_id") REFERENCES "public"."firms"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_expense_categories_firm_id" ON "expense_categories" USING btree ("firm_id");
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "expenses" (
	"id" text PRIMARY KEY NOT NULL,
	"firm_id" text NOT NULL,
	"client_id" text,
	"case_id" text,
	"category_id" text NOT NULL,
	"expense_date" text NOT NULL,
	"amount_paisa" bigint NOT NULL,
	"description" text NOT NULL,
	"reimbursable" boolean DEFAULT true NOT NULL,
	"status" text DEFAULT 'posted' NOT NULL,
	"void_reason" text,
	"voided_by" text,
	"voided_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	"created_by" text,
	"updated_by" text
);
--> statement-breakpoint
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_firm_id_firms_id_fk" FOREIGN KEY ("firm_id") REFERENCES "public"."firms"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_case_id_cases_id_fk" FOREIGN KEY ("case_id") REFERENCES "public"."cases"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_category_id_expense_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."expense_categories"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_expenses_firm_id" ON "expenses" USING btree ("firm_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_expenses_client_id" ON "expenses" USING btree ("client_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_expenses_case_id" ON "expenses" USING btree ("case_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_expenses_category_id" ON "expenses" USING btree ("category_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_expenses_status" ON "expenses" USING btree ("status");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_expenses_expense_date" ON "expenses" USING btree ("expense_date");
