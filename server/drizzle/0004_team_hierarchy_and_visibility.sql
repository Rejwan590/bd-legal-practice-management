-- 0004_team_hierarchy_and_visibility.sql
-- Migration: Add team hierarchy, visibility mode, case shares, and hearings

-- 1. Firms: add visibility_mode ('open' | 'team'), default 'open' for existing firms
ALTER TABLE "firms" ADD COLUMN "visibility_mode" text DEFAULT 'open' NOT NULL;
--> statement-breakpoint

-- 2. Users: add job_type, job_title_label, reports_to_user_id
ALTER TABLE "users" ADD COLUMN "job_type" text DEFAULT 'other' NOT NULL;
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "job_title_label" text;
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "reports_to_user_id" text;
--> statement-breakpoint
-- Backfill existing data according to DESIGN:
-- Owners become 'lawyer_senior', staff stay 'other' with reports_to_user_id null
UPDATE "users" SET "job_type" = 'lawyer_senior' WHERE "role" = 'Owner';
--> statement-breakpoint
CREATE INDEX "idx_users_reports_to" ON "users" USING btree ("reports_to_user_id");
--> statement-breakpoint

-- 3. Cases: add responsible_lawyer_id
ALTER TABLE "cases" ADD COLUMN "responsible_lawyer_id" text;
--> statement-breakpoint
CREATE INDEX "idx_cases_resp_lawyer" ON "cases" USING btree ("responsible_lawyer_id");
--> statement-breakpoint

-- 4. Create hearings table if not exists
CREATE TABLE IF NOT EXISTS "hearings" (
	"id" text PRIMARY KEY NOT NULL,
	"firm_id" text NOT NULL,
	"case_id" text NOT NULL,
	"appearing_lawyer_id" text,
	"scheduled_at" timestamp with time zone NOT NULL,
	"court" text,
	"purpose" text,
	"status" text DEFAULT 'scheduled' NOT NULL,
	"outcome_note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	"created_by" text,
	"updated_by" text
);
--> statement-breakpoint
ALTER TABLE "hearings" ADD CONSTRAINT "hearings_firm_id_firms_id_fk" FOREIGN KEY ("firm_id") REFERENCES "public"."firms"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "hearings" ADD CONSTRAINT "hearings_case_id_cases_id_fk" FOREIGN KEY ("case_id") REFERENCES "public"."cases"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_hearings_firm_id" ON "hearings" USING btree ("firm_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_hearings_case_id" ON "hearings" USING btree ("case_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_hearings_appearing_lawyer" ON "hearings" USING btree ("appearing_lawyer_id");
--> statement-breakpoint

-- 5. Create case_shares table
CREATE TABLE IF NOT EXISTS "case_shares" (
	"id" text PRIMARY KEY NOT NULL,
	"firm_id" text NOT NULL,
	"case_id" text NOT NULL,
	"user_id" text NOT NULL,
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "case_shares" ADD CONSTRAINT "case_shares_firm_id_firms_id_fk" FOREIGN KEY ("firm_id") REFERENCES "public"."firms"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "case_shares" ADD CONSTRAINT "case_shares_case_id_cases_id_fk" FOREIGN KEY ("case_id") REFERENCES "public"."cases"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "case_shares" ADD CONSTRAINT "case_shares_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_case_shares_firm_id" ON "case_shares" USING btree ("firm_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_case_shares_case_id" ON "case_shares" USING btree ("case_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_case_shares_user_id" ON "case_shares" USING btree ("user_id");
