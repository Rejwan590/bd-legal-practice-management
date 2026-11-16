# Admin Audit Contract Fix Report

**Component:** Super Admin Audit Service & Routes  
**Files Modified:**  
- `server/src/services/adminAuditService.ts`  
- `server/src/routes/adminPlans.ts`  
**Status:** Verified Clean  

---

## 1. Context & Contract Investigation

`RecordAdminAuditParams` defines the parameter contract for all platform admin activity logging:

```typescript
export interface RecordAdminAuditParams {
  adminId: string;
  action: string;
  targetFirmId?: string | null;
  old?: Record<string, unknown> | null;
  new?: Record<string, unknown> | null;
  ip?: string | null;
}
```

The underlying service `recordAdminAudit(params)` creates and persists an `admin_audit` entry in the database.

---

## 2. Root Cause of Error 2 (`TS2353`)

In `server/src/routes/adminPlans.ts` (line 70), `recordAdminAudit` was invoked with an explicit timestamp:

```typescript
  await recordAdminAudit({
    adminId: req.admin!.id,
    action: 'PLAN_UPDATE',
    targetFirmId: null,
    old: oldValues,
    new: updates,
    ip: req.ip,
    at: new Date(),
  });
```

Because TypeScript object literals are subjected to excess property checking, supplying `'at'` when `RecordAdminAuditParams` did not declare an `at` property produced:
`TS2353: Object literal may only specify known properties, and 'at' does not exist in type 'RecordAdminAuditParams'.`

---

## 3. Architecture Decision & Fix

Rather than just removing the property from the route or renaming it, we standardized the contract in `server/src/services/adminAuditService.ts` to allow caller flexibility:

```typescript
export interface RecordAdminAuditParams {
  adminId: string;
  action: string;
  targetFirmId?: string | null;
  old?: Record<string, unknown> | null;
  new?: Record<string, unknown> | null;
  ip?: string | null;
  at?: Date;
}

export async function recordAdminAudit(params: RecordAdminAuditParams): Promise<schema.AdminAuditEntry> {
  const db = getDatabase();
  return db.insertAdminAudit({
    id: crypto.randomUUID(),
    adminId: params.adminId,
    action: params.action,
    targetFirmId: params.targetFirmId ?? null,
    old: params.old ?? null,
    new: params.new ?? null,
    ip: params.ip ?? null,
    at: params.at ?? new Date(),
  });
}
```

### Benefits:
1. **Backward Compatibility:** All existing routes (`adminAuth.ts`, `adminFirms.ts`, `createPlatformAdmin.ts`) that do not pass `at` continue to have timestamps generated automatically by `new Date()`.
2. **Contract Alignment:** Routes or background jobs that wish to specify a precise timestamp can pass `at` without type mismatches.
3. **Immutability & Integrity:** Audit logs remain strictly append-only in the database. No tokens, passwords, or raw secrets are recorded.

---

## 4. Verification

1. `npm run build --prefix server` succeeded with 0 errors.
2. `npx tsx server/tests/adminAuth.test.ts` passed 68/68 tests.
3. `npx tsx server/tests/adminFirms.test.ts` passed 95/95 tests (including `adminAudit` logging assertions for `FIRM_CREATE`, `FIRM_UPDATE`, `FIRM_SUSPEND`, `FIRM_DISABLE`, `FIRM_REACTIVATE`, `LICENSE_UPDATE`, `LICENSE_RENEW`, `PAYMENT_RECORD`, and `RESET_USER_PASSWORD`).
