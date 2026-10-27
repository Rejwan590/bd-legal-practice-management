ALTER TABLE "fee_payments" ADD COLUMN IF NOT EXISTS "legacy_unassigned" boolean DEFAULT false NOT NULL;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_fee_payments_legacy_unassigned" ON "fee_payments" ("legacy_unassigned");
--> statement-breakpoint
UPDATE "fee_payments" SET "legacy_unassigned" = true WHERE "fee_agreement_id" IS NULL OR "case_id" IS NULL;
