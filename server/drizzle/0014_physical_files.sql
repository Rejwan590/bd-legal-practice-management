-- 0015_physical_files.sql
-- Migration: Phase 8 Physical File Tracking & Custody tables

CREATE TABLE IF NOT EXISTS "physical_files" (
	"id" text PRIMARY KEY NOT NULL,
	"firm_id" text NOT NULL,
	"serial" text NOT NULL,
	"case_id" text,
	"client_id" text,
	"title" text NOT NULL,
	"shelf_location" text,
	"status" text DEFAULT 'in_chamber' NOT NULL,
	"holder_id" text,
	"checked_out_at" timestamp with time zone,
	"due_back_at" timestamp with time zone,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	"created_by" text,
	"updated_by" text
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "file_movements" (
	"id" text PRIMARY KEY NOT NULL,
	"firm_id" text NOT NULL,
	"file_id" text NOT NULL,
	"action" text NOT NULL,
	"user_id" text NOT NULL,
	"at" timestamp with time zone DEFAULT now() NOT NULL,
	"due_back_at" timestamp with time zone,
	"note" text
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "physical_files" ADD CONSTRAINT "physical_files_firm_id_firms_id_fk" FOREIGN KEY ("firm_id") REFERENCES "public"."firms"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "physical_files" ADD CONSTRAINT "physical_files_case_id_cases_id_fk" FOREIGN KEY ("case_id") REFERENCES "public"."cases"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "physical_files" ADD CONSTRAINT "physical_files_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "physical_files" ADD CONSTRAINT "physical_files_holder_id_users_id_fk" FOREIGN KEY ("holder_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "file_movements" ADD CONSTRAINT "file_movements_firm_id_firms_id_fk" FOREIGN KEY ("firm_id") REFERENCES "public"."firms"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "file_movements" ADD CONSTRAINT "file_movements_file_id_physical_files_id_fk" FOREIGN KEY ("file_id") REFERENCES "public"."physical_files"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "file_movements" ADD CONSTRAINT "file_movements_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "uidx_physical_files_firm_serial" ON "physical_files" USING btree ("firm_id","serial");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_physical_files_firm_id" ON "physical_files" USING btree ("firm_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_physical_files_case_id" ON "physical_files" USING btree ("case_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_physical_files_client_id" ON "physical_files" USING btree ("client_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_physical_files_holder_id" ON "physical_files" USING btree ("holder_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_physical_files_status" ON "physical_files" USING btree ("status");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_file_movements_firm_id" ON "file_movements" USING btree ("firm_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_file_movements_file_id" ON "file_movements" USING btree ("file_id");
