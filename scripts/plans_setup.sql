-- ============================================================================
-- BD Legal Practice Management: Plans & Pricing Setup (Stage 1)
-- DO NOT RUN AUTOMATICALLY ON PRODUCTION STARTUP. Run on-demand by DBA / Owner.
-- ============================================================================

-- Step 1: Check which firms currently use the legacy 'annual-standard' plan
SELECT id, name, status, license_expires_at 
FROM firms 
WHERE plan_id = 'annual-standard' AND deleted_at IS NULL;

-- Step 2: Insert or update the 3 standard production plans
-- 1. Solo Plan: BDT 599/mo, 2 users, 2 devices, extra 100/user, extra 100/device, duration 12 mo
INSERT INTO plans (
  id, name, price_bdt, seats, included_users, included_devices,
  extra_user_price_bdt, extra_device_price_bdt, duration_months,
  status, features, created_at, updated_at
) VALUES (
  'solo', 'Solo', 599, 2, 2, 2,
  100, 100, 12,
  'active', '["cases", "hearings", "tasks", "files", "calendar", "backup", "audit"]'::jsonb, NOW(), NOW()
) ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  price_bdt = EXCLUDED.price_bdt,
  seats = EXCLUDED.seats,
  included_users = EXCLUDED.included_users,
  included_devices = EXCLUDED.included_devices,
  extra_user_price_bdt = EXCLUDED.extra_user_price_bdt,
  extra_device_price_bdt = EXCLUDED.extra_device_price_bdt,
  duration_months = EXCLUDED.duration_months,
  status = 'active',
  updated_at = NOW();

-- 2. Chamber Plan: BDT 1299/mo, 5 users, 5 devices, extra 100/user, extra 100/device, duration 12 mo
INSERT INTO plans (
  id, name, price_bdt, seats, included_users, included_devices,
  extra_user_price_bdt, extra_device_price_bdt, duration_months,
  status, features, created_at, updated_at
) VALUES (
  'chamber', 'Chamber', 1299, 5, 5, 5,
  100, 100, 12,
  'active', '["cases", "hearings", "tasks", "files", "calendar", "backup", "audit"]'::jsonb, NOW(), NOW()
) ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  price_bdt = EXCLUDED.price_bdt,
  seats = EXCLUDED.seats,
  included_users = EXCLUDED.included_users,
  included_devices = EXCLUDED.included_devices,
  extra_user_price_bdt = EXCLUDED.extra_user_price_bdt,
  extra_device_price_bdt = EXCLUDED.extra_device_price_bdt,
  duration_months = EXCLUDED.duration_months,
  status = 'active',
  updated_at = NOW();

-- 3. Professional Plan: BDT 2499/mo, 12 users, 10 devices, extra 100/user, extra 100/device, duration 12 mo
INSERT INTO plans (
  id, name, price_bdt, seats, included_users, included_devices,
  extra_user_price_bdt, extra_device_price_bdt, duration_months,
  status, features, created_at, updated_at
) VALUES (
  'professional', 'Professional', 2499, 12, 12, 10,
  100, 100, 12,
  'active', '["cases", "hearings", "tasks", "files", "calendar", "backup", "audit"]'::jsonb, NOW(), NOW()
) ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  price_bdt = EXCLUDED.price_bdt,
  seats = EXCLUDED.seats,
  included_users = EXCLUDED.included_users,
  included_devices = EXCLUDED.included_devices,
  extra_user_price_bdt = EXCLUDED.extra_user_price_bdt,
  extra_device_price_bdt = EXCLUDED.extra_device_price_bdt,
  duration_months = EXCLUDED.duration_months,
  status = 'active',
  updated_at = NOW();

-- Step 3: Archive legacy 'annual-standard' ONLY if no active firms use it
UPDATE plans 
SET status = 'archived', updated_at = NOW() 
WHERE id = 'annual-standard' 
  AND NOT EXISTS (
    SELECT 1 FROM firms WHERE firms.plan_id = 'annual-standard' AND firms.deleted_at IS NULL
  );
