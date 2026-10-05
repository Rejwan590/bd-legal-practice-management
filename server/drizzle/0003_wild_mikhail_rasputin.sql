CREATE TABLE "devices" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"firm_id" text NOT NULL,
	"user_id" text NOT NULL,
	"device_key_hash" text NOT NULL,
	"name" text NOT NULL,
	"user_agent" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"first_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"approved_by_admin_id" uuid,
	CONSTRAINT "devices_device_key_hash_unique" UNIQUE("device_key_hash")
);
--> statement-breakpoint
ALTER TABLE "firms" ADD COLUMN "device_policy" text DEFAULT 'auto-approve' NOT NULL;--> statement-breakpoint
ALTER TABLE "firms" ADD COLUMN "allow_owner_device_removal" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "devices" ADD CONSTRAINT "devices_firm_id_firms_id_fk" FOREIGN KEY ("firm_id") REFERENCES "public"."firms"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "devices" ADD CONSTRAINT "devices_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "devices" ADD CONSTRAINT "devices_approved_by_admin_id_platform_admins_id_fk" FOREIGN KEY ("approved_by_admin_id") REFERENCES "public"."platform_admins"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_devices_firm_id" ON "devices" USING btree ("firm_id");--> statement-breakpoint
CREATE INDEX "idx_devices_user_id" ON "devices" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "idx_devices_key_hash" ON "devices" USING btree ("device_key_hash");--> statement-breakpoint
CREATE INDEX "idx_devices_status" ON "devices" USING btree ("status");