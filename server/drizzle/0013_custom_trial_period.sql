ALTER TABLE "firms" ADD COLUMN IF NOT EXISTS "is_trial" boolean DEFAULT false NOT NULL;
ALTER TABLE "firms" ADD COLUMN IF NOT EXISTS "trial_started_at" timestamp with time zone;
ALTER TABLE "firms" ADD COLUMN IF NOT EXISTS "trial_days" integer;
