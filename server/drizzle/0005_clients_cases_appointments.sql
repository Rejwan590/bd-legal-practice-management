-- 0005_clients_cases_appointments.sql
-- Migration: Add client photos, client notes, case enhancements (history, category, notes), and appointments module

-- 1. Client Photos Table
CREATE TABLE IF NOT EXISTS "client_photos" (
	"client_id" text PRIMARY KEY NOT NULL,
	"firm_id" text NOT NULL,
	"mime" text NOT NULL,
	"bytes" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "client_photos" ADD CONSTRAINT "client_photos_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "client_photos" ADD CONSTRAINT "client_photos_firm_id_firms_id_fk" FOREIGN KEY ("firm_id") REFERENCES "public"."firms"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_client_photos_firm_id" ON "client_photos" USING btree ("firm_id");
--> statement-breakpoint

-- 2. Client Notes Table
CREATE TABLE IF NOT EXISTS "client_notes" (
	"id" text PRIMARY KEY NOT NULL,
	"firm_id" text NOT NULL,
	"client_id" text NOT NULL,
	"note_date" text NOT NULL,
	"body" text NOT NULL,
	"created_by" text,
	"updated_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "client_notes" ADD CONSTRAINT "client_notes_firm_id_firms_id_fk" FOREIGN KEY ("firm_id") REFERENCES "public"."firms"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "client_notes" ADD CONSTRAINT "client_notes_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_client_notes_firm_id" ON "client_notes" USING btree ("firm_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_client_notes_client_id" ON "client_notes" USING btree ("client_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_client_notes_note_date" ON "client_notes" USING btree ("note_date");
--> statement-breakpoint

-- Migrate existing clients.notes to initial client_notes row dated created_at
INSERT INTO "client_notes" ("id", "firm_id", "client_id", "note_date", "body", "created_by", "updated_by", "created_at", "updated_at")
SELECT 
	gen_random_uuid()::text,
	"firm_id",
	"id",
	to_char("created_at", 'YYYY-MM-DD'),
	"notes",
	"created_by",
	"updated_by",
	"created_at",
	"updated_at"
FROM "clients"
WHERE "notes" IS NOT NULL AND length(trim("notes")) > 0;
--> statement-breakpoint

-- 3. Cases enhancements (status, case_date, closed_on, category, roles, criminal fields)
ALTER TABLE "cases" ADD COLUMN "case_date" timestamp with time zone;
--> statement-breakpoint
ALTER TABLE "cases" ADD COLUMN "closed_on" timestamp with time zone;
--> statement-breakpoint
ALTER TABLE "cases" ADD COLUMN "case_category" text DEFAULT 'civil' NOT NULL;
--> statement-breakpoint
ALTER TABLE "cases" ADD COLUMN "party_a_role" text;
--> statement-breakpoint
ALTER TABLE "cases" ADD COLUMN "party_b_role" text;
--> statement-breakpoint
ALTER TABLE "cases" ADD COLUMN "police_station" text;
--> statement-breakpoint
ALTER TABLE "cases" ADD COLUMN "sections_of_law" text;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_cases_case_date" ON "cases" USING btree ("case_date");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_cases_category" ON "cases" USING btree ("case_category");
--> statement-breakpoint

-- 4. Case Notes Table
CREATE TABLE IF NOT EXISTS "case_notes" (
	"id" text PRIMARY KEY NOT NULL,
	"firm_id" text NOT NULL,
	"case_id" text NOT NULL,
	"note_date" text NOT NULL,
	"body" text NOT NULL,
	"created_by" text,
	"updated_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "case_notes" ADD CONSTRAINT "case_notes_firm_id_firms_id_fk" FOREIGN KEY ("firm_id") REFERENCES "public"."firms"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "case_notes" ADD CONSTRAINT "case_notes_case_id_cases_id_fk" FOREIGN KEY ("case_id") REFERENCES "public"."cases"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_case_notes_firm_id" ON "case_notes" USING btree ("firm_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_case_notes_case_id" ON "case_notes" USING btree ("case_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_case_notes_note_date" ON "case_notes" USING btree ("note_date");
--> statement-breakpoint

-- 5. Appointments & Attendees
CREATE TABLE IF NOT EXISTS "appointments" (
	"id" text PRIMARY KEY NOT NULL,
	"firm_id" text NOT NULL,
	"title" text NOT NULL,
	"type" text NOT NULL,
	"starts_at" timestamp with time zone NOT NULL,
	"ends_at" timestamp with time zone NOT NULL,
	"mode" text DEFAULT 'in_person' NOT NULL,
	"location" text,
	"organiser_user_id" text NOT NULL,
	"client_id" text,
	"case_id" text,
	"status" text DEFAULT 'scheduled' NOT NULL,
	"notes" text,
	"reminder_minutes_before" integer DEFAULT 30 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	"created_by" text,
	"updated_by" text
);
--> statement-breakpoint
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_firm_id_firms_id_fk" FOREIGN KEY ("firm_id") REFERENCES "public"."firms"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_organiser_users_id_fk" FOREIGN KEY ("organiser_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_case_id_cases_id_fk" FOREIGN KEY ("case_id") REFERENCES "public"."cases"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_appointments_firm_id" ON "appointments" USING btree ("firm_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_appointments_starts_at" ON "appointments" USING btree ("starts_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_appointments_organiser" ON "appointments" USING btree ("organiser_user_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_appointments_client_id" ON "appointments" USING btree ("client_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_appointments_case_id" ON "appointments" USING btree ("case_id");
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "appointment_attendees" (
	"id" text PRIMARY KEY NOT NULL,
	"appointment_id" text NOT NULL,
	"user_id" text NOT NULL,
	"firm_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "appointment_attendees" ADD CONSTRAINT "appointment_attendees_appointment_id_fk" FOREIGN KEY ("appointment_id") REFERENCES "public"."appointments"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "appointment_attendees" ADD CONSTRAINT "appointment_attendees_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "appointment_attendees" ADD CONSTRAINT "appointment_attendees_firm_id_firms_id_fk" FOREIGN KEY ("firm_id") REFERENCES "public"."firms"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_appointment_attendees_appointment_id" ON "appointment_attendees" USING btree ("appointment_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_appointment_attendees_user_id" ON "appointment_attendees" USING btree ("user_id");
