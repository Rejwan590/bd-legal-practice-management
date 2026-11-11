import { Hono } from 'hono';
import { z } from 'zod';
import { eq, and, isNull, desc } from 'drizzle-orm';
import {
  Env,
  authMiddleware,
  enforceSubscriptionReadOnly,
  requirePermission,
} from '../middleware/auth';
import { getDb } from '../db/client';
import * as schema from '../db/schema';
import { getVisibleCaseIds, canUserSeeCaseId } from '../utils/visibility';
import { buildAuditEntry } from '../utils/audit';
import {
  appendFileReturnReminderStmts,
  buildDismissRemindersStmt,
  buildRescheduleRemindersStmt,
  computeRemindAtIso,
} from '../utils/reminders';

export const physicalFilesRouter = new Hono<{ Bindings: Env; Variables: any }>();

physicalFilesRouter.use('*', authMiddleware);

function canViewRestricted(user: schema.User): boolean {
  const perms = (Array.isArray(user.permissions) ? user.permissions : []) as string[];
  return user.role === 'Owner' || perms.includes('*') || perms.includes('restricted.view');
}

async function resolveNextSerial(db: ReturnType<typeof getDb>, firmId: string): Promise<string> {
  const rows = await db
    .select({ serial: schema.physicalFiles.serial })
    .from(schema.physicalFiles)
    .where(eq(schema.physicalFiles.firmId, firmId));

  let maxNumber = 100;
  for (const r of rows) {
    const match = r.serial.match(/^F-(\d+)$/i) || r.serial.match(/(\d+)/);
    if (match) {
      const num = parseInt(match[1], 10);
      if (!Number.isNaN(num) && num > maxNumber) {
        maxNumber = num;
      }
    }
  }
  return `F-${String(maxNumber + 1).padStart(6, '0')}`;
}

async function checkCaseVisibility(
  db: ReturnType<typeof getDb>,
  firm: schema.Firm,
  user: schema.User,
  caseId: string
): Promise<{ ok: true } | { ok: false; status: 403 | 404; error: string; message: string }> {
  const caseRows = await db
    .select()
    .from(schema.cases)
    .where(and(eq(schema.cases.id, caseId), eq(schema.cases.firmId, firm.id), isNull(schema.cases.deletedAt)))
    .limit(1);

  const caseRec = caseRows[0];
  if (!caseRec) {
    return { ok: false, status: 404, error: 'Not found', message: 'Case not found' };
  }
  if (caseRec.restricted && !canViewRestricted(user)) {
    return {
      ok: false,
      status: 403,
      error: 'PermissionDenied',
      message: 'Permission denied: restricted case physical file',
    };
  }
  const canSee = await canUserSeeCaseId(db, firm, user, caseId);
  if (!canSee) {
    return { ok: false, status: 404, error: 'Not found', message: 'Case not found or access denied' };
  }
  return { ok: true };
}

function enrichFileRow(row: {
  file: schema.PhysicalFile;
  currentHolderName: string | null;
}) {
  return {
    ...row.file,
    currentHolderName: row.currentHolderName || null,
  };
}

// GET /api/v1/physical-files
physicalFilesRouter.get('/', requirePermission('files.view'), async (c) => {
  const firm = c.get('firm') as schema.Firm;
  const user = c.get('user') as schema.User;
  const caseId = c.req.query('caseId');
  const clientId = c.req.query('clientId');
  const status = c.req.query('status');
  const holderId = c.req.query('holderId');
  const search = c.req.query('search')?.trim().toLowerCase();

  const db = getDb(c.env.DB);
  const [visible, rows] = await Promise.all([
    getVisibleCaseIds(db, firm, user),
    db
      .select({
        file: schema.physicalFiles,
        currentHolderName: schema.users.name,
      })
      .from(schema.physicalFiles)
      .leftJoin(schema.users, eq(schema.physicalFiles.currentHolderId, schema.users.id))
      .where(and(eq(schema.physicalFiles.firmId, firm.id), isNull(schema.physicalFiles.deletedAt)))
      .orderBy(desc(schema.physicalFiles.updatedAt)),
  ]);

  const filtered = rows
    .map(enrichFileRow)
    .filter((f) => {
      if (f.caseId && visible !== 'ALL' && !visible.includes(f.caseId)) return false;
      if (caseId && f.caseId !== caseId) return false;
      if (clientId && f.clientId !== clientId) return false;
      if (status && status !== 'all' && f.status !== status) return false;
      if (holderId && f.currentHolderId !== holderId) return false;
      if (search) {
        const hit =
          f.serial.toLowerCase().includes(search) ||
          f.title.toLowerCase().includes(search) ||
          (f.shelfLocation || '').toLowerCase().includes(search) ||
          (f.notes || '').toLowerCase().includes(search) ||
          (f.currentHolderName || '').toLowerCase().includes(search);
        if (!hit) return false;
      }
      return true;
    });

  return c.json(filtered);
});

// GET /api/v1/physical-files/next-serial
physicalFilesRouter.get('/next-serial', requirePermission('files.view'), async (c) => {
  const firm = c.get('firm') as schema.Firm;
  const db = getDb(c.env.DB);
  const serial = await resolveNextSerial(db, firm.id);
  return c.json({ serial });
});

// GET /api/v1/physical-files/by-serial/:serial
physicalFilesRouter.get('/by-serial/:serial', requirePermission('files.view'), async (c) => {
  const firm = c.get('firm') as schema.Firm;
  const user = c.get('user') as schema.User;
  const serial = (c.req.param('serial') as string).trim().toLowerCase();
  const db = getDb(c.env.DB);

  const rows = await db
    .select({
      file: schema.physicalFiles,
      currentHolderName: schema.users.name,
    })
    .from(schema.physicalFiles)
    .leftJoin(schema.users, eq(schema.physicalFiles.currentHolderId, schema.users.id))
    .where(and(eq(schema.physicalFiles.firmId, firm.id), isNull(schema.physicalFiles.deletedAt)));

  const match = rows.find((r) => r.file.serial.toLowerCase() === serial);
  if (!match) return c.json({ error: 'Not found', message: 'Physical file not found' }, 404);

  if (match.file.caseId) {
    const vis = await checkCaseVisibility(db, firm, user, match.file.caseId);
    if (!vis.ok) return c.json({ error: vis.error, message: vis.message }, vis.status);
  }

  return c.json(enrichFileRow(match));
});

// GET /api/v1/physical-files/by-case/:caseId
physicalFilesRouter.get('/by-case/:caseId', requirePermission('files.view'), async (c) => {
  const firm = c.get('firm') as schema.Firm;
  const user = c.get('user') as schema.User;
  const caseId = c.req.param('caseId') as string;
  const db = getDb(c.env.DB);

  const vis = await checkCaseVisibility(db, firm, user, caseId);
  if (!vis.ok) return c.json({ error: vis.error, message: vis.message }, vis.status);

  const rows = await db
    .select({
      file: schema.physicalFiles,
      currentHolderName: schema.users.name,
    })
    .from(schema.physicalFiles)
    .leftJoin(schema.users, eq(schema.physicalFiles.currentHolderId, schema.users.id))
    .where(
      and(
        eq(schema.physicalFiles.firmId, firm.id),
        eq(schema.physicalFiles.caseId, caseId),
        isNull(schema.physicalFiles.deletedAt)
      )
    )
    .limit(1);

  if (!rows[0]) {
    return c.json({ error: 'Not found', message: 'Physical file not found for case' }, 404);
  }

  return c.json(enrichFileRow(rows[0]));
});

// GET /api/v1/physical-files/:id
physicalFilesRouter.get('/:id', requirePermission('files.view'), async (c) => {
  const firm = c.get('firm') as schema.Firm;
  const user = c.get('user') as schema.User;
  const id = c.req.param('id') as string;
  const db = getDb(c.env.DB);

  const rows = await db
    .select({
      file: schema.physicalFiles,
      currentHolderName: schema.users.name,
    })
    .from(schema.physicalFiles)
    .leftJoin(schema.users, eq(schema.physicalFiles.currentHolderId, schema.users.id))
    .where(
      and(
        eq(schema.physicalFiles.id, id),
        eq(schema.physicalFiles.firmId, firm.id),
        isNull(schema.physicalFiles.deletedAt)
      )
    )
    .limit(1);

  if (!rows[0]) return c.json({ error: 'Not found', message: 'Physical file not found' }, 404);

  if (rows[0].file.caseId) {
    const vis = await checkCaseVisibility(db, firm, user, rows[0].file.caseId);
    if (!vis.ok) return c.json({ error: vis.error, message: vis.message }, vis.status);
  }

  return c.json(enrichFileRow(rows[0]));
});

// GET /api/v1/physical-files/:id/movements
physicalFilesRouter.get('/:id/movements', requirePermission('files.view'), async (c) => {
  const firm = c.get('firm') as schema.Firm;
  const user = c.get('user') as schema.User;
  const id = c.req.param('id') as string;
  const db = getDb(c.env.DB);

  const fileRows = await db
    .select()
    .from(schema.physicalFiles)
    .where(
      and(
        eq(schema.physicalFiles.id, id),
        eq(schema.physicalFiles.firmId, firm.id),
        isNull(schema.physicalFiles.deletedAt)
      )
    )
    .limit(1);

  const file = fileRows[0];
  if (!file) return c.json({ error: 'Not found', message: 'Physical file not found' }, 404);

  if (file.caseId) {
    const vis = await checkCaseVisibility(db, firm, user, file.caseId);
    if (!vis.ok) return c.json({ error: vis.error, message: vis.message }, vis.status);
  }

  const movements = await db
    .select({
      movement: schema.fileMovements,
      userName: schema.users.name,
    })
    .from(schema.fileMovements)
    .leftJoin(schema.users, eq(schema.fileMovements.userId, schema.users.id))
    .where(and(eq(schema.fileMovements.fileId, id), eq(schema.fileMovements.firmId, firm.id)))
    .orderBy(desc(schema.fileMovements.at));

  return c.json(
    movements.map((r) => ({
      ...r.movement,
      userName: r.userName || 'Unknown User',
    }))
  );
});

// POST /api/v1/physical-files
physicalFilesRouter.post('/', enforceSubscriptionReadOnly, requirePermission('files.manage'), async (c) => {
  const firm = c.get('firm') as schema.Firm;
  const user = c.get('user') as schema.User;
  const body = await c.req.json().catch(() => ({}));

  const createSchema = z.object({
    title: z.string().trim().min(1).max(300),
    serial: z.string().trim().min(1).max(60).optional(),
    caseId: z.string().trim().nullable().optional(),
    clientId: z.string().trim().nullable().optional(),
    shelfLocation: z.string().trim().max(200).nullable().optional(),
    notes: z.string().trim().max(2000).nullable().optional(),
  });

  const parse = createSchema.safeParse(body);
  if (!parse.success) {
    return c.json({ error: 'Validation failed', errors: parse.error.issues }, 400);
  }

  const db = getDb(c.env.DB);
  const cleanCaseId = parse.data.caseId || null;
  let cleanClientId = parse.data.clientId || null;

  if (cleanCaseId) {
    const vis = await checkCaseVisibility(db, firm, user, cleanCaseId);
    if (!vis.ok) return c.json({ error: vis.error, message: vis.message }, vis.status);
    if (!cleanClientId) {
      const cRows = await db
        .select({ clientId: schema.cases.clientId })
        .from(schema.cases)
        .where(and(eq(schema.cases.id, cleanCaseId), eq(schema.cases.firmId, firm.id)))
        .limit(1);
      cleanClientId = cRows[0]?.clientId ?? null;
    }
  }

  if (cleanClientId) {
    const clRows = await db
      .select({ id: schema.clients.id })
      .from(schema.clients)
      .where(and(eq(schema.clients.id, cleanClientId), eq(schema.clients.firmId, firm.id), isNull(schema.clients.deletedAt)))
      .limit(1);
    if (!clRows[0]) {
      return c.json({ error: 'Not found', message: 'Linked client not found or access denied' }, 404);
    }
  }

  const serial = parse.data.serial?.trim() || (await resolveNextSerial(db, firm.id));
  const existingSerial = await db
    .select({ id: schema.physicalFiles.id, serial: schema.physicalFiles.serial })
    .from(schema.physicalFiles)
    .where(eq(schema.physicalFiles.firmId, firm.id));
  if (existingSerial.some((r) => r.serial.toLowerCase() === serial.toLowerCase())) {
    return c.json({ error: 'Conflict', message: 'Physical file serial already exists in this firm' }, 409);
  }

  const id = crypto.randomUUID();
  const nowIso = new Date().toISOString();
  const newFile: typeof schema.physicalFiles.$inferInsert = {
    id,
    firmId: firm.id,
    serial,
    caseId: cleanCaseId,
    clientId: cleanClientId,
    title: parse.data.title,
    shelfLocation: parse.data.shelfLocation?.trim() || 'General File Rack',
    status: 'in_chamber',
    currentHolderId: null,
    checkedOutAt: null,
    dueBackAt: null,
    notes: parse.data.notes || null,
    createdAt: nowIso,
    updatedAt: nowIso,
    deletedAt: null,
    createdBy: user.id,
    updatedBy: user.id,
  };

  await db.batch([
    db.insert(schema.physicalFiles).values(newFile),
    db.insert(schema.auditLog).values(
      buildAuditEntry({
        firmId: firm.id,
        userId: user.id,
        userName: user.name,
        entity: 'PhysicalFile',
        entityId: id,
        action: 'CREATE',
        newValue: newFile,
        now: nowIso,
      })
    ),
  ] as any);

  return c.json({ ...newFile, currentHolderName: null }, 201);
});

// PATCH /api/v1/physical-files/:id
physicalFilesRouter.patch('/:id', enforceSubscriptionReadOnly, requirePermission('files.manage'), async (c) => {
  const firm = c.get('firm') as schema.Firm;
  const user = c.get('user') as schema.User;
  const id = c.req.param('id') as string;
  const body = await c.req.json().catch(() => ({}));

  const updateSchema = z.object({
    title: z.string().trim().min(1).max(300).optional(),
    caseId: z.string().trim().nullable().optional(),
    clientId: z.string().trim().nullable().optional(),
    shelfLocation: z.string().trim().max(200).nullable().optional(),
    status: z.enum(['in_chamber', 'checked_out', 'in_court', 'archived']).optional(),
    currentHolderId: z.string().trim().nullable().optional(),
    checkedOutAt: z.string().refine((v) => !isNaN(Date.parse(v))).nullable().optional(),
    dueBackAt: z.string().refine((v) => !isNaN(Date.parse(v))).nullable().optional(),
    notes: z.string().trim().max(2000).nullable().optional(),
  });

  const parse = updateSchema.safeParse(body);
  if (!parse.success) {
    return c.json({ error: 'Validation failed', errors: parse.error.issues }, 400);
  }

  const db = getDb(c.env.DB);
  const rows = await db
    .select()
    .from(schema.physicalFiles)
    .where(and(eq(schema.physicalFiles.id, id), eq(schema.physicalFiles.firmId, firm.id), isNull(schema.physicalFiles.deletedAt)))
    .limit(1);

  const existing = rows[0];
  if (!existing) return c.json({ error: 'Not found', message: 'Physical file not found' }, 404);

  if (existing.caseId) {
    const vis = await checkCaseVisibility(db, firm, user, existing.caseId);
    if (!vis.ok) return c.json({ error: vis.error, message: vis.message }, vis.status);
  }

  if (parse.data.caseId !== undefined && parse.data.caseId !== null && parse.data.caseId !== existing.caseId) {
    const vis = await checkCaseVisibility(db, firm, user, parse.data.caseId);
    if (!vis.ok) return c.json({ error: vis.error, message: vis.message }, vis.status);
  }

  if (parse.data.clientId !== undefined && parse.data.clientId !== null && parse.data.clientId !== existing.clientId) {
    const clRows = await db
      .select({ id: schema.clients.id })
      .from(schema.clients)
      .where(and(eq(schema.clients.id, parse.data.clientId), eq(schema.clients.firmId, firm.id), isNull(schema.clients.deletedAt)))
      .limit(1);
    if (!clRows[0]) {
      return c.json({ error: 'Not found', message: 'Linked client not found or access denied' }, 404);
    }
  }

  let currentHolderName: string | null = null;
  if (parse.data.currentHolderId) {
    const holderRows = await db
      .select({ id: schema.users.id, name: schema.users.name, active: schema.users.active })
      .from(schema.users)
      .where(and(eq(schema.users.id, parse.data.currentHolderId), eq(schema.users.firmId, firm.id), isNull(schema.users.deletedAt)))
      .limit(1);
    if (!holderRows[0] || !holderRows[0].active) {
      return c.json({ error: 'ValidationError', message: 'Holder user not found or inactive in this firm' }, 400);
    }
    currentHolderName = holderRows[0].name;
  } else if (parse.data.currentHolderId === undefined && existing.currentHolderId) {
    const holderRows = await db
      .select({ name: schema.users.name })
      .from(schema.users)
      .where(eq(schema.users.id, existing.currentHolderId))
      .limit(1);
    currentHolderName = holderRows[0]?.name || null;
  }

  const nowIso = new Date().toISOString();
  const updates: Record<string, any> = { updatedAt: nowIso, updatedBy: user.id };
  if (parse.data.title !== undefined) updates.title = parse.data.title;
  if (parse.data.caseId !== undefined) updates.caseId = parse.data.caseId || null;
  if (parse.data.clientId !== undefined) updates.clientId = parse.data.clientId || null;
  if (parse.data.shelfLocation !== undefined) updates.shelfLocation = parse.data.shelfLocation || null;
  if (parse.data.status !== undefined) updates.status = parse.data.status;
  if (parse.data.currentHolderId !== undefined) updates.currentHolderId = parse.data.currentHolderId || null;
  if (parse.data.checkedOutAt !== undefined) updates.checkedOutAt = parse.data.checkedOutAt || null;
  if (parse.data.dueBackAt !== undefined) updates.dueBackAt = parse.data.dueBackAt || null;
  if (parse.data.notes !== undefined) updates.notes = parse.data.notes || null;

  const stmts: any[] = [
    db.update(schema.physicalFiles).set(updates).where(and(eq(schema.physicalFiles.id, id), eq(schema.physicalFiles.firmId, firm.id))),
    db.insert(schema.auditLog).values(
      buildAuditEntry({
        firmId: firm.id,
        userId: user.id,
        userName: user.name,
        entity: 'PhysicalFile',
        entityId: id,
        action: 'UPDATE',
        oldValue: existing,
        newValue: { ...existing, ...updates },
        now: nowIso,
      })
    ),
  ];

  if (parse.data.status === 'archived' && existing.status !== 'archived') {
    stmts.push(
      db.insert(schema.fileMovements).values({
        id: crypto.randomUUID(),
        firmId: firm.id,
        fileId: id,
        action: 'ARCHIVE',
        userId: user.id,
        at: nowIso,
        dueBackAt: null,
        note: `Archived by ${user.name}`,
      })
    );
  }

  if (parse.data.status === 'archived' || parse.data.status === 'in_chamber') {
    stmts.push(
      buildDismissRemindersStmt(db, {
        firmId: firm.id,
        sourceId: id,
        updatedBy: user.id,
        nowIso,
      })
    );
  } else if (parse.data.dueBackAt) {
    stmts.push(
      buildRescheduleRemindersStmt(db, {
        firmId: firm.id,
        sourceId: id,
        newDueAt: parse.data.dueBackAt,
        newRemindAt: computeRemindAtIso(parse.data.dueBackAt, 4 * 60 * 60 * 1000),
        updatedBy: user.id,
        nowIso,
      })
    );
  }

  await db.batch(stmts as any);

  return c.json({ ...existing, ...updates, currentHolderName });
});

// POST /api/v1/physical-files/:id/check-out
physicalFilesRouter.post('/:id/check-out', enforceSubscriptionReadOnly, requirePermission('files.manage'), async (c) => {
  const firm = c.get('firm') as schema.Firm;
  const user = c.get('user') as schema.User;
  const id = c.req.param('id') as string;
  const body = await c.req.json().catch(() => ({}));

  const parse = z
    .object({
      holderId: z.string().trim().min(1),
      dueBackAt: z.string().refine((v) => !isNaN(Date.parse(v))),
      note: z.string().trim().max(1000).nullable().optional(),
    })
    .safeParse(body);
  if (!parse.success) {
    return c.json({ error: 'Validation failed', errors: parse.error.issues }, 400);
  }

  const db = getDb(c.env.DB);
  const rows = await db
    .select()
    .from(schema.physicalFiles)
    .where(and(eq(schema.physicalFiles.id, id), eq(schema.physicalFiles.firmId, firm.id), isNull(schema.physicalFiles.deletedAt)))
    .limit(1);
  const existing = rows[0];
  if (!existing) return c.json({ error: 'Not found', message: 'Physical file not found' }, 404);

  if (existing.caseId) {
    const vis = await checkCaseVisibility(db, firm, user, existing.caseId);
    if (!vis.ok) return c.json({ error: vis.error, message: vis.message }, vis.status);
  }

  if (existing.status === 'archived') {
    return c.json({ error: 'InvalidState', message: 'Cannot check out an archived physical file' }, 400);
  }

  const holderRows = await db
    .select({ id: schema.users.id, name: schema.users.name, active: schema.users.active })
    .from(schema.users)
    .where(and(eq(schema.users.id, parse.data.holderId), eq(schema.users.firmId, firm.id), isNull(schema.users.deletedAt)))
    .limit(1);
  const holder = holderRows[0];
  if (!holder || !holder.active) {
    return c.json({ error: 'ValidationError', message: 'Recipient holder must be an active member of this firm' }, 400);
  }

  const nowIso = new Date().toISOString();
  const dueIso = new Date(parse.data.dueBackAt).toISOString();
  const note = parse.data.note?.trim() || `Checked out by ${user.name}`;
  const updates = {
    status: 'checked_out' as const,
    currentHolderId: holder.id,
    checkedOutAt: nowIso,
    dueBackAt: dueIso,
    updatedAt: nowIso,
    updatedBy: user.id,
  };
  const movement: typeof schema.fileMovements.$inferInsert = {
    id: crypto.randomUUID(),
    firmId: firm.id,
    fileId: id,
    action: 'CHECKOUT',
    userId: holder.id,
    at: nowIso,
    dueBackAt: dueIso,
    note,
  };

  const stmts: any[] = [
    db.update(schema.physicalFiles).set(updates).where(and(eq(schema.physicalFiles.id, id), eq(schema.physicalFiles.firmId, firm.id))),
    db.insert(schema.fileMovements).values(movement),
    db.insert(schema.auditLog).values(
      buildAuditEntry({
        firmId: firm.id,
        userId: user.id,
        userName: user.name,
        entity: 'PhysicalFile',
        entityId: id,
        action: 'PHYSICAL_FILE_CHECKED_OUT',
        oldValue: { status: existing.status, currentHolderId: existing.currentHolderId },
        newValue: { status: 'checked_out', currentHolderId: holder.id, currentHolderName: holder.name, dueBackAt: dueIso, note },
        now: nowIso,
      })
    ),
  ];
  await appendFileReturnReminderStmts(
    db,
    {
      firmId: firm.id,
      fileId: id,
      serial: existing.serial,
      title: existing.title,
      shelfLocation: existing.shelfLocation,
      holderId: holder.id,
      holderName: holder.name,
      dueIso,
      actorId: user.id,
      nowIso,
    },
    stmts
  );
  await db.batch(stmts as any);

  return c.json({
    file: { ...existing, ...updates, currentHolderName: holder.name },
    movement: { ...movement, userName: holder.name },
  });
});

// POST /api/v1/physical-files/:id/check-in
physicalFilesRouter.post('/:id/check-in', enforceSubscriptionReadOnly, requirePermission('files.manage'), async (c) => {
  const firm = c.get('firm') as schema.Firm;
  const user = c.get('user') as schema.User;
  const id = c.req.param('id') as string;
  const body = await c.req.json().catch(() => ({}));

  const parse = z
    .object({
      shelfLocation: z.string().trim().max(200).nullable().optional(),
      note: z.string().trim().max(1000).nullable().optional(),
    })
    .safeParse(body || {});
  if (!parse.success) {
    return c.json({ error: 'Validation failed', errors: parse.error.issues }, 400);
  }

  const db = getDb(c.env.DB);
  const rows = await db
    .select()
    .from(schema.physicalFiles)
    .where(and(eq(schema.physicalFiles.id, id), eq(schema.physicalFiles.firmId, firm.id), isNull(schema.physicalFiles.deletedAt)))
    .limit(1);
  const existing = rows[0];
  if (!existing) return c.json({ error: 'Not found', message: 'Physical file not found' }, 404);

  if (existing.caseId) {
    const vis = await checkCaseVisibility(db, firm, user, existing.caseId);
    if (!vis.ok) return c.json({ error: vis.error, message: vis.message }, vis.status);
  }

  if (existing.status === 'archived') {
    return c.json({ error: 'InvalidState', message: 'Cannot check in an archived physical file' }, 400);
  }

  const nowIso = new Date().toISOString();
  const nextShelf = parse.data.shelfLocation?.trim() || existing.shelfLocation || 'General File Rack';
  const note = parse.data.note?.trim() || `Returned to ${nextShelf}`;
  const updates = {
    status: 'in_chamber' as const,
    currentHolderId: null,
    checkedOutAt: null,
    dueBackAt: null,
    shelfLocation: nextShelf,
    updatedAt: nowIso,
    updatedBy: user.id,
  };
  const movement: typeof schema.fileMovements.$inferInsert = {
    id: crypto.randomUUID(),
    firmId: firm.id,
    fileId: id,
    action: 'CHECKIN',
    userId: user.id,
    at: nowIso,
    dueBackAt: null,
    note,
  };

  await db.batch([
    db.update(schema.physicalFiles).set(updates).where(and(eq(schema.physicalFiles.id, id), eq(schema.physicalFiles.firmId, firm.id))),
    db.insert(schema.fileMovements).values(movement),
    buildDismissRemindersStmt(db, {
      firmId: firm.id,
      sourceId: id,
      updatedBy: user.id,
      nowIso,
    }),
    db.insert(schema.auditLog).values(
      buildAuditEntry({
        firmId: firm.id,
        userId: user.id,
        userName: user.name,
        entity: 'PhysicalFile',
        entityId: id,
        action: 'PHYSICAL_FILE_CHECKED_IN',
        oldValue: { status: existing.status, currentHolderId: existing.currentHolderId },
        newValue: { status: 'in_chamber', shelfLocation: nextShelf, note },
        now: nowIso,
      })
    ),
  ] as any);

  return c.json({
    file: { ...existing, ...updates, currentHolderName: null },
    movement: { ...movement, userName: user.name },
  });
});

// POST /api/v1/physical-files/:id/dispatch-court
physicalFilesRouter.post('/:id/dispatch-court', enforceSubscriptionReadOnly, requirePermission('files.manage'), async (c) => {
  const firm = c.get('firm') as schema.Firm;
  const user = c.get('user') as schema.User;
  const id = c.req.param('id') as string;
  const body = await c.req.json().catch(() => ({}));

  const parse = z
    .object({
      courtName: z.string().trim().min(1).max(300),
      holderId: z.string().trim().min(1),
      dueBackAt: z.string().refine((v) => !isNaN(Date.parse(v))),
      note: z.string().trim().max(1000).nullable().optional(),
    })
    .safeParse(body);
  if (!parse.success) {
    return c.json({ error: 'Validation failed', errors: parse.error.issues }, 400);
  }

  const db = getDb(c.env.DB);
  const rows = await db
    .select()
    .from(schema.physicalFiles)
    .where(and(eq(schema.physicalFiles.id, id), eq(schema.physicalFiles.firmId, firm.id), isNull(schema.physicalFiles.deletedAt)))
    .limit(1);
  const existing = rows[0];
  if (!existing) return c.json({ error: 'Not found', message: 'Physical file not found' }, 404);

  if (existing.caseId) {
    const vis = await checkCaseVisibility(db, firm, user, existing.caseId);
    if (!vis.ok) return c.json({ error: vis.error, message: vis.message }, vis.status);
  }

  if (existing.status === 'archived') {
    return c.json({ error: 'InvalidState', message: 'Cannot dispatch an archived physical file' }, 400);
  }

  const holderRows = await db
    .select({ id: schema.users.id, name: schema.users.name, active: schema.users.active })
    .from(schema.users)
    .where(and(eq(schema.users.id, parse.data.holderId), eq(schema.users.firmId, firm.id), isNull(schema.users.deletedAt)))
    .limit(1);
  const holder = holderRows[0];
  if (!holder || !holder.active) {
    return c.json({ error: 'ValidationError', message: 'Taking custodian must be an active member of this firm' }, 400);
  }

  const nowIso = new Date().toISOString();
  const dueIso = new Date(parse.data.dueBackAt).toISOString();
  const note = parse.data.note?.trim()
    ? `[Court: ${parse.data.courtName}] ${parse.data.note.trim()}`
    : `Dispatched to ${parse.data.courtName}`;

  const updates = {
    status: 'in_court' as const,
    currentHolderId: holder.id,
    checkedOutAt: nowIso,
    dueBackAt: dueIso,
    updatedAt: nowIso,
    updatedBy: user.id,
  };
  const movement: typeof schema.fileMovements.$inferInsert = {
    id: crypto.randomUUID(),
    firmId: firm.id,
    fileId: id,
    action: 'COURT_DISPATCH',
    userId: holder.id,
    at: nowIso,
    dueBackAt: dueIso,
    note,
  };

  const stmts: any[] = [
    db.update(schema.physicalFiles).set(updates).where(and(eq(schema.physicalFiles.id, id), eq(schema.physicalFiles.firmId, firm.id))),
    db.insert(schema.fileMovements).values(movement),
    db.insert(schema.auditLog).values(
      buildAuditEntry({
        firmId: firm.id,
        userId: user.id,
        userName: user.name,
        entity: 'PhysicalFile',
        entityId: id,
        action: 'PHYSICAL_FILE_COURT_DISPATCH',
        oldValue: { status: existing.status, currentHolderId: existing.currentHolderId },
        newValue: {
          status: 'in_court',
          courtName: parse.data.courtName,
          currentHolderId: holder.id,
          currentHolderName: holder.name,
          dueBackAt: dueIso,
          note,
        },
        now: nowIso,
      })
    ),
  ];
  await appendFileReturnReminderStmts(
    db,
    {
      firmId: firm.id,
      fileId: id,
      serial: existing.serial,
      title: existing.title,
      shelfLocation: existing.shelfLocation,
      holderId: holder.id,
      holderName: holder.name,
      dueIso,
      actorId: user.id,
      nowIso,
    },
    stmts
  );
  await db.batch(stmts as any);

  return c.json({
    file: { ...existing, ...updates, currentHolderName: holder.name },
    movement: { ...movement, userName: holder.name },
  });
});

// DELETE /api/v1/physical-files/:id
physicalFilesRouter.delete('/:id', enforceSubscriptionReadOnly, requirePermission('files.manage'), async (c) => {
  const firm = c.get('firm') as schema.Firm;
  const user = c.get('user') as schema.User;
  const id = c.req.param('id') as string;
  const db = getDb(c.env.DB);

  const rows = await db
    .select()
    .from(schema.physicalFiles)
    .where(and(eq(schema.physicalFiles.id, id), eq(schema.physicalFiles.firmId, firm.id), isNull(schema.physicalFiles.deletedAt)))
    .limit(1);
  const existing = rows[0];
  if (!existing) return c.json({ error: 'Not found', message: 'Physical file not found' }, 404);

  if (existing.caseId) {
    const vis = await checkCaseVisibility(db, firm, user, existing.caseId);
    if (!vis.ok) return c.json({ error: vis.error, message: vis.message }, vis.status);
  }

  const nowIso = new Date().toISOString();
  await db.batch([
    db
      .update(schema.physicalFiles)
      .set({ deletedAt: nowIso, updatedAt: nowIso, updatedBy: user.id })
      .where(and(eq(schema.physicalFiles.id, id), eq(schema.physicalFiles.firmId, firm.id))),
    buildDismissRemindersStmt(db, {
      firmId: firm.id,
      sourceId: id,
      updatedBy: user.id,
      nowIso,
      softDelete: true,
    }),
    db.insert(schema.auditLog).values(
      buildAuditEntry({
        firmId: firm.id,
        userId: user.id,
        userName: user.name,
        entity: 'PhysicalFile',
        entityId: id,
        action: 'DELETE',
        oldValue: existing,
        newValue: { deletedAt: nowIso, softDeleted: true },
        now: nowIso,
      })
    ),
  ] as any);

  return c.json({ success: true, softDeleted: true });
});
