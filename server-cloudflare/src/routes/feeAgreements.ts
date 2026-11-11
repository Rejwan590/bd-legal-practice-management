import { Hono } from 'hono';
import { z } from 'zod';
import { Env, authMiddleware, enforceSubscriptionReadOnly, requireAnyPermission } from '../middleware/auth';
import { getDb } from '../db/client';
import * as schema from '../db/schema';
import { eq, and, isNull, desc } from 'drizzle-orm';
import { canUserSeeCaseId, getVisibleCaseIds } from '../utils/visibility';
import { buildAuditEntry } from '../utils/audit';
import { enrichAgreements } from '../utils/billing';

export const feeAgreementsRouter = new Hono<{ Bindings: Env; Variables: any }>();

feeAgreementsRouter.use('*', authMiddleware);

const readPerm = requireAnyPermission(['accounts.view', 'billing.view']);
const writePerm = requireAnyPermission(['accounts.manage', 'billing.manage', 'billing.edit']);

// GET /api/v1/fee-agreements
feeAgreementsRouter.get('/', readPerm, async (c) => {
  const firm = c.get('firm') as schema.Firm;
  const user = c.get('user') as schema.User;
  const clientId = c.req.query('clientId');
  const caseId = c.req.query('caseId');
  const status = c.req.query('status');
  const search = (c.req.query('search') || '').trim().toLowerCase();

  const db = getDb(c.env.DB);
  const [rows, visible] = await Promise.all([
    db
      .select()
      .from(schema.feeAgreements)
      .where(and(eq(schema.feeAgreements.firmId, firm.id), isNull(schema.feeAgreements.deletedAt)))
      .orderBy(desc(schema.feeAgreements.agreementDate), desc(schema.feeAgreements.createdAt)),
    getVisibleCaseIds(db, firm, user),
  ]);

  const filtered = rows.filter((a) => {
    if (a.caseId && visible !== 'ALL' && !visible.includes(a.caseId)) return false;
    if (clientId && a.clientId !== clientId) return false;
    if (caseId && a.caseId !== caseId) return false;
    if (status && status !== 'all' && a.status !== status) return false;
    return true;
  });

  const enriched = await enrichAgreements(db, firm.id, filtered);
  if (!search) return c.json(enriched);

  return c.json(
    enriched.filter((a) => {
      const hay = [
        a.clientName,
        a.clientNameBn,
        a.caseNumber,
        a.caseTitle,
        a.feeType,
        a.notes,
        a.agreementDate,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      return hay.includes(search);
    })
  );
});

// GET /api/v1/fee-agreements/:id
feeAgreementsRouter.get('/:id', readPerm, async (c) => {
  const firm = c.get('firm') as schema.Firm;
  const user = c.get('user') as schema.User;
  const id = c.req.param('id') as string;
  const db = getDb(c.env.DB);

  const rows = await db
    .select()
    .from(schema.feeAgreements)
    .where(and(eq(schema.feeAgreements.id, id), eq(schema.feeAgreements.firmId, firm.id), isNull(schema.feeAgreements.deletedAt)))
    .limit(1);

  const agreement = rows[0];
  if (!agreement) return c.json({ error: 'NotFound', message: 'Fee agreement not found' }, 404);
  if (agreement.caseId && !(await canUserSeeCaseId(db, firm, user, agreement.caseId))) {
    return c.json({ error: 'NotFound', message: 'Fee agreement not found' }, 404);
  }
  const [enriched] = await enrichAgreements(db, firm.id, [agreement]);
  return c.json(enriched);
});

// POST /api/v1/fee-agreements
feeAgreementsRouter.post('/', enforceSubscriptionReadOnly, writePerm, async (c) => {
  const firm = c.get('firm') as schema.Firm;
  const user = c.get('user') as schema.User;
  const body = await c.req.json().catch(() => ({}));

  const createSchema = z
    .object({
      clientId: z.string().min(1),
      caseId: z.string().nullable().optional(),
      feeType: z.enum(['fixed', 'per_hearing', 'hourly', 'retainer', 'installment']).default('fixed'),
      agreedAmountPaisa: z.number().int().min(1).optional(),
      agreedAmountBdt: z.number().int().min(1).optional(),
      agreementDate: z.string().min(1),
      notes: z.string().trim().max(2000).nullable().optional(),
    })
    .refine((d) => d.agreedAmountPaisa !== undefined || d.agreedAmountBdt !== undefined, {
      message: 'agreedAmountPaisa or agreedAmountBdt is required',
    });

  const parse = createSchema.safeParse(body);
  if (!parse.success) return c.json({ error: 'ValidationError', details: parse.error.issues }, 400);

  const db = getDb(c.env.DB);

  // Verify client exists in this firm
  const clientRows = await db
    .select()
    .from(schema.clients)
    .where(and(eq(schema.clients.id, parse.data.clientId), eq(schema.clients.firmId, firm.id), isNull(schema.clients.deletedAt)))
    .limit(1);
  if (!clientRows[0]) {
    return c.json({ error: 'NotFound', message: 'Client not found' }, 404);
  }

  // Verify case if provided: firm isolation + visibility + client ownership
  const normalizedCaseId = parse.data.caseId || null;
  if (normalizedCaseId) {
    if (!(await canUserSeeCaseId(db, firm, user, normalizedCaseId))) {
      return c.json({ error: 'NotFound', message: 'Case not found or access denied' }, 404);
    }
    const caseRows = await db
      .select({ id: schema.cases.id, clientId: schema.cases.clientId })
      .from(schema.cases)
      .where(and(eq(schema.cases.id, normalizedCaseId), eq(schema.cases.firmId, firm.id), isNull(schema.cases.deletedAt)))
      .limit(1);
    if (!caseRows[0]) {
      return c.json({ error: 'NotFound', message: 'Case not found' }, 404);
    }
    if (caseRows[0].clientId !== parse.data.clientId) {
      return c.json({ error: 'BadRequest', message: 'Case does not belong to the selected client' }, 400);
    }
  }

  const agreedAmountPaisa = parse.data.agreedAmountPaisa ?? parse.data.agreedAmountBdt! * 100;
  const id = crypto.randomUUID();
  const now = new Date().toISOString();

  const agreement = {
    id,
    firmId: firm.id,
    clientId: parse.data.clientId,
    caseId: normalizedCaseId,
    feeType: parse.data.feeType,
    agreedAmountPaisa,
    agreementDate: parse.data.agreementDate,
    notes: parse.data.notes || null,
    status: 'active' as const,
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
    createdBy: user.id,
    updatedBy: null,
  };

  await db.batch([
    db.insert(schema.feeAgreements).values(agreement),
    db.insert(schema.auditLog).values(
      buildAuditEntry({
        firmId: firm.id,
        userId: user.id,
        userName: user.name,
        entity: 'FeeAgreement',
        entityId: id,
        action: 'CREATE',
        newValue: agreement,
        now,
      })
    ),
  ] as any);

  const [enriched] = await enrichAgreements(db, firm.id, [agreement]);
  return c.json(enriched, 201);
});

// PATCH /api/v1/fee-agreements/:id
feeAgreementsRouter.patch('/:id', enforceSubscriptionReadOnly, writePerm, async (c) => {
  const firm = c.get('firm') as schema.Firm;
  const user = c.get('user') as schema.User;
  const id = c.req.param('id') as string;
  const body = await c.req.json().catch(() => ({}));

  const patchSchema = z.object({
    caseId: z.string().nullable().optional(),
    feeType: z.enum(['fixed', 'per_hearing', 'hourly', 'retainer', 'installment']).optional(),
    agreedAmountPaisa: z.number().int().min(1).optional(),
    agreementDate: z.string().min(1).optional(),
    notes: z.string().trim().max(2000).nullable().optional(),
    revisionReason: z.string().trim().min(3).max(500).optional(),
  });

  const parse = patchSchema.safeParse(body);
  if (!parse.success) return c.json({ error: 'ValidationError', details: parse.error.issues }, 400);

  const db = getDb(c.env.DB);
  const rows = await db
    .select()
    .from(schema.feeAgreements)
    .where(and(eq(schema.feeAgreements.id, id), eq(schema.feeAgreements.firmId, firm.id), isNull(schema.feeAgreements.deletedAt)))
    .limit(1);

  const existing = rows[0];
  if (!existing) return c.json({ error: 'NotFound', message: 'Fee agreement not found' }, 404);
  if (existing.caseId && !(await canUserSeeCaseId(db, firm, user, existing.caseId))) {
    return c.json({ error: 'NotFound', message: 'Fee agreement not found' }, 404);
  }
  if (existing.status !== 'active') {
    return c.json({ error: 'BadRequest', message: 'Can only edit active agreements' }, 400);
  }

  let nextCaseId = existing.caseId;
  if (parse.data.caseId !== undefined) {
    nextCaseId = parse.data.caseId || null;
    if (nextCaseId) {
      if (!(await canUserSeeCaseId(db, firm, user, nextCaseId))) {
        return c.json({ error: 'NotFound', message: 'Case not found or access denied' }, 404);
      }
      const caseRows = await db
        .select({ id: schema.cases.id, clientId: schema.cases.clientId })
        .from(schema.cases)
        .where(and(eq(schema.cases.id, nextCaseId), eq(schema.cases.firmId, firm.id), isNull(schema.cases.deletedAt)))
        .limit(1);
      if (!caseRows[0]) {
        return c.json({ error: 'NotFound', message: 'Case not found' }, 404);
      }
      if (caseRows[0].clientId !== existing.clientId) {
        return c.json({ error: 'BadRequest', message: 'Case does not belong to the agreement client' }, 400);
      }
    }
  }

  const amountChanged =
    parse.data.agreedAmountPaisa !== undefined && parse.data.agreedAmountPaisa !== existing.agreedAmountPaisa;
  if (amountChanged && !parse.data.revisionReason) {
    return c.json(
      { error: 'ValidationError', message: 'revisionReason (min 3 characters) is required when changing agreed amount' },
      400
    );
  }

  const now = new Date().toISOString();
  const nextValues = {
    caseId: nextCaseId,
    feeType: parse.data.feeType ?? existing.feeType,
    agreedAmountPaisa: parse.data.agreedAmountPaisa ?? existing.agreedAmountPaisa,
    agreementDate: parse.data.agreementDate ?? existing.agreementDate,
    notes: parse.data.notes !== undefined ? (parse.data.notes || null) : existing.notes,
    updatedAt: now,
    updatedBy: user.id,
  };

  const batchOps: any[] = [
    db
      .update(schema.feeAgreements)
      .set(nextValues)
      .where(and(eq(schema.feeAgreements.id, id), eq(schema.feeAgreements.firmId, firm.id))),
  ];

  if (amountChanged) {
    batchOps.push(
      db.insert(schema.feeAgreementChanges).values({
        id: crypto.randomUUID(),
        firmId: firm.id,
        feeAgreementId: id,
        oldAmountPaisa: existing.agreedAmountPaisa,
        newAmountPaisa: nextValues.agreedAmountPaisa,
        reason: parse.data.revisionReason!,
        changedBy: user.id,
        createdAt: now,
      })
    );
  }

  batchOps.push(
    db.insert(schema.auditLog).values(
      buildAuditEntry({
        firmId: firm.id,
        userId: user.id,
        userName: user.name,
        entity: 'FeeAgreement',
        entityId: id,
        action: 'UPDATE',
        oldValue: {
          caseId: existing.caseId,
          feeType: existing.feeType,
          agreedAmountPaisa: existing.agreedAmountPaisa,
          agreementDate: existing.agreementDate,
          notes: existing.notes,
        },
        newValue: {
          ...nextValues,
          ...(amountChanged ? { revisionReason: parse.data.revisionReason } : {}),
        },
        now,
      })
    )
  );

  await db.batch(batchOps as any);

  const [enriched] = await enrichAgreements(db, firm.id, [{ ...existing, ...nextValues }]);
  return c.json(enriched);
});

// POST /api/v1/fee-agreements/:id/revise
feeAgreementsRouter.post('/:id/revise', enforceSubscriptionReadOnly, writePerm, async (c) => {
  const firm = c.get('firm') as schema.Firm;
  const user = c.get('user') as schema.User;
  const id = c.req.param('id') as string;
  const body = await c.req.json().catch(() => ({}));

  const parse = z.object({ newAmountPaisa: z.number().int().min(1), reason: z.string().trim().min(3).max(500) }).safeParse(body);
  if (!parse.success) return c.json({ error: 'ValidationError', details: parse.error.issues }, 400);

  const db = getDb(c.env.DB);
  const rows = await db
    .select()
    .from(schema.feeAgreements)
    .where(and(eq(schema.feeAgreements.id, id), eq(schema.feeAgreements.firmId, firm.id), isNull(schema.feeAgreements.deletedAt)))
    .limit(1);

  const existing = rows[0];
  if (!existing) return c.json({ error: 'NotFound', message: 'Fee agreement not found' }, 404);
  if (existing.caseId && !(await canUserSeeCaseId(db, firm, user, existing.caseId))) {
    return c.json({ error: 'NotFound', message: 'Fee agreement not found' }, 404);
  }
  if (existing.status !== 'active') return c.json({ error: 'BadRequest', message: 'Can only revise active agreements' }, 400);

  const now = new Date().toISOString();
  const updated = { ...existing, agreedAmountPaisa: parse.data.newAmountPaisa, updatedAt: now, updatedBy: user.id };

  await db.batch([
    db
      .update(schema.feeAgreements)
      .set({ agreedAmountPaisa: parse.data.newAmountPaisa, updatedAt: now, updatedBy: user.id })
      .where(and(eq(schema.feeAgreements.id, id), eq(schema.feeAgreements.firmId, firm.id))),
    db.insert(schema.feeAgreementChanges).values({
      id: crypto.randomUUID(),
      firmId: firm.id,
      feeAgreementId: id,
      oldAmountPaisa: existing.agreedAmountPaisa,
      newAmountPaisa: parse.data.newAmountPaisa,
      reason: parse.data.reason,
      changedBy: user.id,
      createdAt: now,
    }),
    db.insert(schema.auditLog).values(
      buildAuditEntry({
        firmId: firm.id,
        userId: user.id,
        userName: user.name,
        entity: 'FeeAgreement',
        entityId: id,
        action: 'UPDATE',
        oldValue: { agreedAmountPaisa: existing.agreedAmountPaisa },
        newValue: { agreedAmountPaisa: parse.data.newAmountPaisa, reason: parse.data.reason },
        now,
      })
    ),
  ] as any);

  const [enriched] = await enrichAgreements(db, firm.id, [updated]);
  return c.json(enriched);
});

// POST /api/v1/fee-agreements/:id/close
feeAgreementsRouter.post('/:id/close', enforceSubscriptionReadOnly, writePerm, async (c) => {
  const firm = c.get('firm') as schema.Firm;
  const user = c.get('user') as schema.User;
  const id = c.req.param('id') as string;
  const db = getDb(c.env.DB);

  const rows = await db
    .select()
    .from(schema.feeAgreements)
    .where(and(eq(schema.feeAgreements.id, id), eq(schema.feeAgreements.firmId, firm.id), isNull(schema.feeAgreements.deletedAt)))
    .limit(1);
  const existing = rows[0];
  if (!existing) return c.json({ error: 'NotFound', message: 'Fee agreement not found' }, 404);
  if (existing.caseId && !(await canUserSeeCaseId(db, firm, user, existing.caseId))) {
    return c.json({ error: 'NotFound', message: 'Fee agreement not found' }, 404);
  }
  if (existing.status !== 'active') return c.json({ error: 'BadRequest', message: 'Can only close active agreements' }, 400);

  const now = new Date().toISOString();
  await db.batch([
    db
      .update(schema.feeAgreements)
      .set({ status: 'closed', updatedAt: now, updatedBy: user.id })
      .where(and(eq(schema.feeAgreements.id, id), eq(schema.feeAgreements.firmId, firm.id))),
    db.insert(schema.auditLog).values(
      buildAuditEntry({
        firmId: firm.id,
        userId: user.id,
        userName: user.name,
        entity: 'FeeAgreement',
        entityId: id,
        action: 'UPDATE',
        oldValue: { status: existing.status },
        newValue: { status: 'closed' },
        now,
      })
    ),
  ] as any);

  const [enriched] = await enrichAgreements(db, firm.id, [{ ...existing, status: 'closed', updatedAt: now, updatedBy: user.id }]);
  return c.json(enriched);
});

// POST /api/v1/fee-agreements/:id/void
feeAgreementsRouter.post('/:id/void', enforceSubscriptionReadOnly, writePerm, async (c) => {
  const firm = c.get('firm') as schema.Firm;
  const user = c.get('user') as schema.User;
  const id = c.req.param('id') as string;
  const body = await c.req.json().catch(() => ({}));
  const parse = z.object({ reason: z.string().trim().min(3).max(500) }).safeParse(body);
  const reason = parse.success ? parse.data.reason : typeof body?.reason === 'string' && body.reason.trim() ? body.reason.trim() : 'Voided';

  const db = getDb(c.env.DB);
  const rows = await db
    .select()
    .from(schema.feeAgreements)
    .where(and(eq(schema.feeAgreements.id, id), eq(schema.feeAgreements.firmId, firm.id), isNull(schema.feeAgreements.deletedAt)))
    .limit(1);
  const existing = rows[0];
  if (!existing) return c.json({ error: 'NotFound', message: 'Fee agreement not found' }, 404);
  if (existing.caseId && !(await canUserSeeCaseId(db, firm, user, existing.caseId))) {
    return c.json({ error: 'NotFound', message: 'Fee agreement not found' }, 404);
  }
  if (existing.status === 'void') return c.json({ error: 'BadRequest', message: 'Agreement is already voided' }, 400);

  const now = new Date().toISOString();
  await db.batch([
    db
      .update(schema.feeAgreements)
      .set({ status: 'void', updatedAt: now, updatedBy: user.id })
      .where(and(eq(schema.feeAgreements.id, id), eq(schema.feeAgreements.firmId, firm.id))),
    db.insert(schema.auditLog).values(
      buildAuditEntry({
        firmId: firm.id,
        userId: user.id,
        userName: user.name,
        entity: 'FeeAgreement',
        entityId: id,
        action: 'VOID',
        oldValue: { status: existing.status },
        newValue: { status: 'void', reason },
        now,
      })
    ),
  ] as any);

  const [enriched] = await enrichAgreements(db, firm.id, [{ ...existing, status: 'void', updatedAt: now, updatedBy: user.id }]);
  return c.json(enriched);
});

// GET /api/v1/fee-agreements/:id/changes
feeAgreementsRouter.get('/:id/changes', readPerm, async (c) => {
  const firm = c.get('firm') as schema.Firm;
  const user = c.get('user') as schema.User;
  const id = c.req.param('id') as string;
  const db = getDb(c.env.DB);

  const agrRows = await db
    .select()
    .from(schema.feeAgreements)
    .where(and(eq(schema.feeAgreements.id, id), eq(schema.feeAgreements.firmId, firm.id), isNull(schema.feeAgreements.deletedAt)))
    .limit(1);
  if (!agrRows[0]) return c.json({ error: 'NotFound', message: 'Fee agreement not found' }, 404);
  if (agrRows[0].caseId && !(await canUserSeeCaseId(db, firm, user, agrRows[0].caseId))) {
    return c.json({ error: 'NotFound', message: 'Fee agreement not found' }, 404);
  }

  const rows = await db
    .select()
    .from(schema.feeAgreementChanges)
    .where(and(eq(schema.feeAgreementChanges.firmId, firm.id), eq(schema.feeAgreementChanges.feeAgreementId, id)))
    .orderBy(desc(schema.feeAgreementChanges.createdAt));

  return c.json(rows);
});
