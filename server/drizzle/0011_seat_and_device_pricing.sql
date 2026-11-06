ALTER TABLE "plans" ADD COLUMN IF NOT EXISTS "included_users" integer DEFAULT 5 NOT NULL;
--> statement-breakpoint
ALTER TABLE "plans" ADD COLUMN IF NOT EXISTS "included_devices" integer DEFAULT 5 NOT NULL;
--> statement-breakpoint
ALTER TABLE "plans" ADD COLUMN IF NOT EXISTS "extra_user_price_bdt" integer DEFAULT 100 NOT NULL;
--> statement-breakpoint
ALTER TABLE "plans" ADD COLUMN IF NOT EXISTS "extra_device_price_bdt" integer DEFAULT 100 NOT NULL;
--> statement-breakpoint
UPDATE "plans" SET "included_users" = "seats" WHERE "included_users" = 5;
--> statement-breakpoint
ALTER TABLE "firms" ADD COLUMN IF NOT EXISTS "max_users" integer DEFAULT 10 NOT NULL;
