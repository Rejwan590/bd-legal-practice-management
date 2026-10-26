-- 0006_hearings_date_fixed_for.sql
-- Migration: Add fixed_for and fixed_for_note to hearings, and create hearing_date_history table

-- 1. Add fixed_for and fixed_for_note to hearings
ALTER TABLE "hearings" ADD COLUMN IF NOT EXISTS "fixed_for" text;
--> statement-breakpoint
ALTER TABLE "hearings" ADD COLUMN IF NOT EXISTS "fixed_for_note" text;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_hearings_fixed_for" ON "hearings" USING btree ("fixed_for");
--> statement-breakpoint

-- 2. Create hearing_date_history table
CREATE TABLE IF NOT EXISTS "hearing_date_history" (
	"id" text PRIMARY KEY NOT NULL,
	"firm_id" text NOT NULL,
	"hearing_id" text NOT NULL,
	"case_id" text NOT NULL,
	"old_at" timestamp with time zone NOT NULL,
	"new_at" timestamp with time zone NOT NULL,
	"reason" text NOT NULL,
	"old_fixed_for" text,
	"new_fixed_for" text,
	"changed_by" text NOT NULL,
	"changed_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "hearing_date_history" ADD CONSTRAINT "hearing_date_history_firm_id_firms_id_fk" FOREIGN KEY ("firm_id") REFERENCES "public"."firms"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "hearing_date_history" ADD CONSTRAINT "hearing_date_history_hearing_id_hearings_id_fk" FOREIGN KEY ("hearing_id") REFERENCES "public"."hearings"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "hearing_date_history" ADD CONSTRAINT "hearing_date_history_case_id_cases_id_fk" FOREIGN KEY ("case_id") REFERENCES "public"."cases"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_hearing_date_history_firm_id" ON "hearing_date_history" USING btree ("firm_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_hearing_date_history_hearing_id" ON "hearing_date_history" USING btree ("hearing_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_hearing_date_history_case_id" ON "hearing_date_history" USING btree ("case_id");
