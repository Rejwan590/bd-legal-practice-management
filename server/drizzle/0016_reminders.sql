-- 0016_reminders.sql
-- Migration: Phase 9 Calendar & Automated Reminders Backend

CREATE TABLE IF NOT EXISTS "reminders" (
	"id" text PRIMARY KEY NOT NULL,
	"firm_id" text NOT NULL,
	"user_id" text NOT NULL,
	"source_type" text NOT NULL,
	"source_id" text NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"remind_at" timestamp with time zone NOT NULL,
	"due_at" timestamp with time zone NOT NULL,
	"channel" text DEFAULT 'in_app' NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"sent_at" timestamp with time zone,
	"dismissed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	"created_by" text,
	"updated_by" text
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "reminders" ADD CONSTRAINT "reminders_firm_id_firms_id_fk" FOREIGN KEY ("firm_id") REFERENCES "public"."firms"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "reminders" ADD CONSTRAINT "reminders_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_reminders_firm_id" ON "reminders" USING btree ("firm_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_reminders_firm_user" ON "reminders" USING btree ("firm_id","user_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_reminders_remind_at" ON "reminders" USING btree ("remind_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_reminders_source" ON "reminders" USING btree ("firm_id","source_type","source_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_reminders_status" ON "reminders" USING btree ("status");
