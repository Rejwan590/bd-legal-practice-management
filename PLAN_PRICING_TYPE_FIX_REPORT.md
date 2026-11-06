# Plan Pricing Type Fix Report

**Component:** Server Database Client & Plan Type Contract  
**File Modified:** `server/src/db/client.ts`  
**Location:** Lines 3363–3385 (`PostgresDatabase.insertFirm()`)  
**Status:** Verified Clean  

---

## 1. Context & Canonical Type Inspection

In commit `1413369`, the Drizzle schema in `server/src/db/schema.ts` was extended with migration `0011_seat_and_device_pricing.sql`:

```typescript
export const plans = pgTable('plans', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  durationMonths: integer('duration_months').notNull(),
  priceBdt: integer('price_bdt').notNull(),
  seats: integer('seats').notNull(),
  includedUsers: integer('included_users').default(5).notNull(),
  includedDevices: integer('included_devices').default(5).notNull(),
  extraUserPriceBdt: integer('extra_user_price_bdt').default(100).notNull(),
  extraDevicePriceBdt: integer('extra_device_price_bdt').default(100).notNull(),
  features: jsonb('features').$type<string[]>().default([]),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  deletedAt: timestamp('deleted_at', { withTimezone: true }),
  createdBy: text('created_by'),
  updatedBy: text('updated_by'),
});

export type Plan = typeof plans.$inferSelect;
```

Because `typeof plans.$inferSelect` enforces all non-null columns without optionality, every object satisfying `schema.Plan` must supply all four fields.

---

## 2. Root Cause in `PostgresDatabase.insertFirm()`

When provisioning or updating a firm with a `planId` that is not yet stored in the database, `PostgresDatabase.insertFirm()` seeds an initial plan:

```typescript
  public async insertFirm(firm: schema.Firm | schema.NewFirm): Promise<schema.Firm> {
    if (firm.planId) {
      const existingPlan = await this.getPlan(firm.planId);
      if (!existingPlan) {
        await this.insertPlan({
          id: firm.planId,
          name: firm.planId,
          durationMonths: 12,
          priceBdt: 50000,
          seats: 10,
          features: ['cases', 'clients', 'hearings', 'tasks'],
          createdAt: new Date(),
          updatedAt: new Date(),
          deletedAt: null,
          createdBy: 'system',
          updatedBy: 'system',
        });
      }
    }
```

This object literal lacked `includedUsers`, `includedDevices`, `extraUserPriceBdt`, and `extraDevicePriceBdt`, triggering:
`TS2345: Argument of type '{ ... }' is not assignable to parameter of type 'Plan'.`

---

## 3. Resolution & Business Rules Adherence

Per specification rules:
- `includedUsers`: Defaults to existing `seats` count (10).
- `includedDevices`: Integer default (5).
- `extraUserPriceBdt`: Integer default BDT 100.
- `extraDevicePriceBdt`: Integer default BDT 100.

The object was updated to:

```typescript
        await this.insertPlan({
          id: firm.planId,
          name: firm.planId,
          durationMonths: 12,
          priceBdt: 50000,
          seats: 10,
          includedUsers: 10,
          includedDevices: 5,
          extraUserPriceBdt: 100,
          extraDevicePriceBdt: 100,
          features: ['cases', 'clients', 'hearings', 'tasks'],
          createdAt: new Date(),
          updatedAt: new Date(),
          deletedAt: null,
          createdBy: 'system',
          updatedBy: 'system',
        });
```

---

## 4. Verification

1. **TypeScript Build:** `npm run build --prefix server` succeeded with 0 errors.
2. **Pricing Suite:** `npx tsx server/tests/seatAndDevicePricing.test.ts` passed 33/33 tests:
   - Base price only: 50,000 BDT
   - Extra users only (4 extra @ 100): 50,400 BDT
   - Extra devices only (3 extra @ 100): 50,300 BDT
   - Both extras: 50,600 BDT
   - Below included thresholds: clamped at 0 extras via `Math.max(0, ...)`.
   - Admin plan configuration and parameter updates verified.
