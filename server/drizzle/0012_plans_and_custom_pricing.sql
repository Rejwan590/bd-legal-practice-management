ALTER TABLE "plans" ADD COLUMN IF NOT EXISTS "status" text DEFAULT 'active' NOT NULL;
--> statement-breakpoint
ALTER TABLE "firms" ADD COLUMN IF NOT EXISTS "billing_cycle" text DEFAULT 'monthly' NOT NULL;
--> statement-breakpoint
ALTER TABLE "firms" ADD COLUMN IF NOT EXISTS "custom_base_price_bdt" integer;
--> statement-breakpoint
ALTER TABLE "firms" ADD COLUMN IF NOT EXISTS "custom_annual_price_bdt" integer;
--> statement-breakpoint
ALTER TABLE "firms" ADD COLUMN IF NOT EXISTS "custom_extra_user_price_bdt" integer;
--> statement-breakpoint
ALTER TABLE "firms" ADD COLUMN IF NOT EXISTS "custom_extra_device_price_bdt" integer;
--> statement-breakpoint
ALTER TABLE "firms" ADD COLUMN IF NOT EXISTS "price_locked_until" timestamp with time zone;
--> statement-breakpoint
ALTER TABLE "firms" ADD COLUMN IF NOT EXISTS "pricing_note" text;
