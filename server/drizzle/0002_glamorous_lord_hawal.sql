CREATE TABLE "license_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"firm_id" text NOT NULL,
	"type" text NOT NULL,
	"old" jsonb,
	"new" jsonb,
	"by_admin" uuid NOT NULL,
	"at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "firms" ADD COLUMN "contact" text;--> statement-breakpoint
ALTER TABLE "firms" ADD COLUMN "max_devices" integer DEFAULT 5 NOT NULL;--> statement-breakpoint
ALTER TABLE "firms" ADD COLUMN "license_starts_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "payments" ADD COLUMN "note" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "must_change_password" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "license_events" ADD CONSTRAINT "license_events_firm_id_firms_id_fk" FOREIGN KEY ("firm_id") REFERENCES "public"."firms"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "license_events" ADD CONSTRAINT "license_events_by_admin_platform_admins_id_fk" FOREIGN KEY ("by_admin") REFERENCES "public"."platform_admins"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_license_events_firm_id" ON "license_events" USING btree ("firm_id");--> statement-breakpoint
CREATE INDEX "idx_license_events_at" ON "license_events" USING btree ("at");