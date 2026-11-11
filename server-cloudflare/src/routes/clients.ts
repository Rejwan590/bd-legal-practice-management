import { Hono } from 'hono';
import { z } from 'zod';
import { Env, authMiddleware, enforceSubscriptionReadOnly, requirePermission } from '../middleware/auth';
import { getDb } from '../db/client';
import * as schema from '../db/schema';
import { eq, and, isNull, sql, asc, desc } from 'drizzle-orm';
import {
  base64ToUint8Array,
  deleteFromSupabaseStorage,
  detectImageMimeFromMagic,
  downloadFromSupabaseStorage,
  formatSupabaseStorageRef,
  getPhotosBucketName,
  isSupabaseStorageConfigured,
  parseSupabaseStorageRef,
  uint8ArrayToBase64,
  uploadToSupabaseStorage,
} from '../services/supabaseStorage';
import { getVisibleCaseIds } from '../utils/visibility';
import { buildAuditEntry } from '../utils/audit';

export const clientsRouter = new Hono<{ Bindings: Env; Variables: any }>();

clientsRouter.use('*', authMiddleware);

function formatClientRow(r: any) {
  return {
    ...r,
    hasPhoto: Boolean(r.hasPhoto),
  };
}

// GET /api/v1/clients
clientsRouter.get('/', requirePermission('clients.view'), async (c) => {
  const firmId = c.get('firmId') as string;
  const search = (c.req.query('search') || c.req.query('q'))?.trim();
  const limit = Math.min(parseInt(c.req.query('limit') || '200', 10), 500);
  const offset = parseInt(c.req.query('offset') || '0', 10);

  const db = getDb(c.env.DB);
  const conditions = [eq(schema.clients.firmId, firmId), isNull(schema.clients.deletedAt)];

  if (search) {
    const q = `%${search}%`;
    conditions.push(
      sql`(${schema.clients.name} LIKE ${q} COLLATE NOCASE OR COALESCE(${schema.clients.nameBn}, '') LIKE ${q} COLLATE NOCASE OR ${schema.clients.phone} LIKE ${q})`
    );
  }

  const rows = await db
    .select({
      id: schema.clients.id,
      firmId: schema.clients.firmId,
      name: schema.clients.name,
      nameBn: schema.clients.nameBn,
      phone: schema.clients.phone,
      email: schema.clients.email,
      address: schema.clients.address,
      notes: schema.clients.notes,
      archived: schema.clients.archived,
      createdAt: schema.clients.createdAt,
      updatedAt: schema.clients.updatedAt,
      deletedAt: schema.clients.deletedAt,
      createdBy: schema.clients.createdBy,
      updatedBy: schema.clients.updatedBy,
      hasPhoto: sql<number>`CASE WHEN ${schema.clientPhotos.clientId} IS NOT NULL THEN 1 ELSE 0 END`,
    })
    .from(schema.clients)
    .leftJoin(schema.clientPhotos, eq(schema.clients.id, schema.clientPhotos.clientId))
    .where(and(...conditions))
    .limit(limit)
    .offset(offset)
    .orderBy(asc(schema.clients.name));

  return c.json(rows.map(formatClientRow));
});

// GET /api/v1/clients/:id
clientsRouter.get('/:id', requirePermission('clients.view'), async (c) => {
  const firmId = c.get('firmId') as string;
  const id = c.req.param('id') as string;
  const db = getDb(c.env.DB);

  const rows = await db
    .select({
      id: schema.clients.id,
      firmId: schema.clients.firmId,
      name: schema.clients.name,
      nameBn: schema.clients.nameBn,
      phone: schema.clients.phone,
      email: schema.clients.email,
      address: schema.clients.address,
      notes: schema.clients.notes,
      archived: schema.clients.archived,
      createdAt: schema.clients.createdAt,
      updatedAt: schema.clients.updatedAt,
      deletedAt: schema.clients.deletedAt,
      createdBy: schema.clients.createdBy,
      updatedBy: schema.clients.updatedBy,
      hasPhoto: sql<number>`CASE WHEN ${schema.clientPhotos.clientId} IS NOT NULL THEN 1 ELSE 0 END`,
    })
    .from(schema.clients)
    .leftJoin(schema.clientPhotos, eq(schema.clients.id, schema.clientPhotos.clientId))
    .where(and(eq(schema.clients.id, id), eq(schema.clients.firmId, firmId), isNull(schema.clients.deletedAt)))
    .limit(1);

  if (!rows[0]) {
    return c.json({ error: 'Not found', message: 'Client not found' }, 404);
  }

  return c.json(formatClientRow(rows[0]));
});

// POST /api/v1/clients
clientsRouter.post('/', enforceSubscriptionReadOnly, requirePermission('clients.edit'), async (c) => {
  const firmId = c.get('firmId') as string;
  const user = c.get('user') as schema.User;
  const body = await c.req.json().catch(() => ({}));

  const clientSchema = z.object({
    name: z.string().min(1),
    nameBn: z.string().nullable().optional(),
    phone: z.string().min(1),
    email: z.string().email().nullable().optional().or(z.literal('')),
    address: z.string().min(1),
    notes: z.string().nullable().optional(),
  });

  const parse = clientSchema.safeParse(body);
  if (!parse.success) {
    return c.json({ error: 'Validation failed', errors: parse.error.issues }, 400);
  }

  const clientId = crypto.randomUUID();
  const now = new Date().toISOString();

  const newClientData = {
    id: clientId,
    firmId,
    name: parse.data.name.trim(),
    nameBn: parse.data.nameBn || null,
    phone: parse.data.phone.trim(),
    email: parse.data.email || null,
    address: parse.data.address.trim(),
    notes: parse.data.notes || null,
    archived: false,
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
    createdBy: user.id,
    updatedBy: null,
  };

  const db = getDb(c.env.DB);
  await db.batch([
    db.insert(schema.clients).values(newClientData),
    db.insert(schema.auditLog).values(
      buildAuditEntry({
        firmId,
        userId: user.id,
        userName: user.name,
        entity: 'Client',
        entityId: clientId,
        action: 'CREATE',
        newValue: newClientData,
        now,
      })
    ),
  ] as any);

  return c.json({ ...newClientData, hasPhoto: false }, 201);
});

// PATCH /api/v1/clients/:id
clientsRouter.patch('/:id', enforceSubscriptionReadOnly, requirePermission('clients.edit'), async (c) => {
  const firmId = c.get('firmId') as string;
  const user = c.get('user') as schema.User;
  const id = c.req.param('id') as string;
  const body = await c.req.json().catch(() => ({}));

  const updateSchema = z.object({
    name: z.string().min(1).optional(),
    nameBn: z.string().nullable().optional(),
    phone: z.string().min(1).optional(),
    email: z.string().email().nullable().optional().or(z.literal('')),
    address: z.string().min(1).optional(),
    notes: z.string().nullable().optional(),
    archived: z.boolean().optional(),
  });

  const parse = updateSchema.safeParse(body);
  if (!parse.success) {
    return c.json({ error: 'Validation failed', errors: parse.error.issues }, 400);
  }

  const db = getDb(c.env.DB);
  const rows = await db
    .select()
    .from(schema.clients)
    .where(and(eq(schema.clients.id, id), eq(schema.clients.firmId, firmId), isNull(schema.clients.deletedAt)))
    .limit(1);

  const existing = rows[0];
  if (!existing) {
    return c.json({ error: 'Not found', message: 'Client not found' }, 404);
  }

  const now = new Date().toISOString();
  const updates: Record<string, any> = {
    ...parse.data,
    email: parse.data.email === '' ? null : parse.data.email,
    updatedAt: now,
    updatedBy: user.id,
  };

  await db.batch([
    db.update(schema.clients).set(updates).where(and(eq(schema.clients.id, id), eq(schema.clients.firmId, firmId))),
    db.insert(schema.auditLog).values(
      buildAuditEntry({
        firmId,
        userId: user.id,
        userName: user.name,
        entity: 'Client',
        entityId: id,
        action: 'UPDATE',
        oldValue: existing,
        newValue: updates,
        now,
      })
    ),
  ] as any);

  return c.json({ ...existing, ...updates });
});

// DELETE /api/v1/clients/:id
clientsRouter.delete('/:id', enforceSubscriptionReadOnly, requirePermission('clients.edit'), async (c) => {
  const firmId = c.get('firmId') as string;
  const user = c.get('user') as schema.User;
  const id = c.req.param('id') as string;
  const db = getDb(c.env.DB);

  const rows = await db
    .select()
    .from(schema.clients)
    .where(and(eq(schema.clients.id, id), eq(schema.clients.firmId, firmId), isNull(schema.clients.deletedAt)))
    .limit(1);

  const existing = rows[0];
  if (!existing) {
    return c.json({ error: 'Not found', message: 'Client not found' }, 404);
  }

  const now = new Date().toISOString();
  await db.batch([
    db
      .update(schema.clients)
      .set({ deletedAt: now, updatedAt: now, updatedBy: user.id })
      .where(and(eq(schema.clients.id, id), eq(schema.clients.firmId, firmId))),
    db.insert(schema.auditLog).values(
      buildAuditEntry({
        firmId,
        userId: user.id,
        userName: user.name,
        entity: 'Client',
        entityId: id,
        action: 'DELETE',
        oldValue: { name: existing.name, phone: existing.phone },
        now,
      })
    ),
  ] as any);

  return c.json({ success: true, softDeleted: true });
});

// POST /api/v1/clients/:id/restore
clientsRouter.post('/:id/restore', enforceSubscriptionReadOnly, requirePermission('clients.edit'), async (c) => {
  const firmId = c.get('firmId') as string;
  const user = c.get('user') as schema.User;
  const id = c.req.param('id') as string;
  const db = getDb(c.env.DB);

  const rows = await db
    .select()
    .from(schema.clients)
    .where(and(eq(schema.clients.id, id), eq(schema.clients.firmId, firmId)))
    .limit(1);

  const existing = rows[0];
  if (!existing) {
    return c.json({ error: 'Not found', message: 'Client not found' }, 404);
  }

  const now = new Date().toISOString();
  await db.batch([
    db
      .update(schema.clients)
      .set({ deletedAt: null, updatedAt: now, updatedBy: user.id })
      .where(and(eq(schema.clients.id, id), eq(schema.clients.firmId, firmId))),
    db.insert(schema.auditLog).values(
      buildAuditEntry({
        firmId,
        userId: user.id,
        userName: user.name,
        entity: 'Client',
        entityId: id,
        action: 'UPDATE',
        oldValue: { deletedAt: existing.deletedAt },
        newValue: { deletedAt: null, restored: true },
        now,
      })
    ),
  ] as any);

  return c.json({ ...existing, deletedAt: null, updatedAt: now });
});

// GET /api/v1/clients/:id/overview
clientsRouter.get('/:id/overview', requirePermission('clients.view'), async (c) => {
  const firm = c.get('firm') as schema.Firm;
  const user = c.get('user') as schema.User;
  const clientId = c.req.param('id') as string;
  const db = getDb(c.env.DB);

  const clientRows = await db
    .select({ id: schema.clients.id })
    .from(schema.clients)
    .where(and(eq(schema.clients.id, clientId), eq(schema.clients.firmId, firm.id), isNull(schema.clients.deletedAt)))
    .limit(1);
  if (!clientRows[0]) {
    return c.json({ error: 'Not found', message: 'Client not found' }, 404);
  }

  const [visible, clientCases, clientTasks, clientFiles] = await Promise.all([
    getVisibleCaseIds(db, firm, user),
    db
      .select({
        id: schema.cases.id,
        caseNumber: schema.cases.caseNumber,
        court: schema.cases.court,
        matterType: schema.cases.matterType,
        status: schema.cases.status,
      })
      .from(schema.cases)
      .where(and(eq(schema.cases.firmId, firm.id), eq(schema.cases.clientId, clientId), isNull(schema.cases.deletedAt))),
    db
      .select({
        id: schema.tasks.id,
        caseId: schema.tasks.caseId,
        title: schema.tasks.title,
        priority: schema.tasks.priority,
        status: schema.tasks.status,
        dueAt: schema.tasks.dueAt,
      })
      .from(schema.tasks)
      .where(and(eq(schema.tasks.firmId, firm.id), eq(schema.tasks.clientId, clientId), isNull(schema.tasks.deletedAt))),
    db
      .select({
        id: schema.physicalFiles.id,
        caseId: schema.physicalFiles.caseId,
        serial: schema.physicalFiles.serial,
        title: schema.physicalFiles.title,
        status: schema.physicalFiles.status,
        holderName: schema.users.name,
      })
      .from(schema.physicalFiles)
      .leftJoin(schema.users, eq(schema.physicalFiles.currentHolderId, schema.users.id))
      .where(and(eq(schema.physicalFiles.firmId, firm.id), eq(schema.physicalFiles.clientId, clientId), isNull(schema.physicalFiles.deletedAt))),
  ]);

  const cases = visible === 'ALL' ? clientCases : clientCases.filter((cs) => visible.includes(cs.id));
  const tasks = clientTasks.filter((t) => !t.caseId || visible === 'ALL' || visible.includes(t.caseId));
  const files = clientFiles
    .filter((f) => !f.caseId || visible === 'ALL' || visible.includes(f.caseId))
    .map((f) => ({
      id: f.id,
      serial: f.serial,
      title: f.title,
      status: f.status,
      holderName: f.holderName || 'Chamber Archive',
    }));

  return c.json({ cases, tasks, files });
});

// Client Notes: GET / POST / PATCH / DELETE
clientsRouter.get('/:id/notes', requirePermission('clients.view'), async (c) => {
  const firmId = c.get('firmId') as string;
  const clientId = c.req.param('id') as string;
  const limit = Math.min(100, parseInt(c.req.query('limit') || '50', 10));
  const offset = parseInt(c.req.query('offset') || '0', 10);
  const db = getDb(c.env.DB);

  const clientRows = await db
    .select({ id: schema.clients.id })
    .from(schema.clients)
    .where(and(eq(schema.clients.id, clientId), eq(schema.clients.firmId, firmId), isNull(schema.clients.deletedAt)))
    .limit(1);
  if (!clientRows[0]) return c.json({ error: 'Not found', message: 'Client not found' }, 404);

  const allNotes = await db
    .select()
    .from(schema.clientNotes)
    .where(and(eq(schema.clientNotes.firmId, firmId), eq(schema.clientNotes.clientId, clientId), isNull(schema.clientNotes.deletedAt)))
    .orderBy(desc(schema.clientNotes.createdAt));

  return c.json({
    notes: allNotes.slice(offset, offset + limit),
    total: allNotes.length,
  });
});

clientsRouter.post('/:id/notes', enforceSubscriptionReadOnly, requirePermission('clients.edit'), async (c) => {
  const firmId = c.get('firmId') as string;
  const user = c.get('user') as schema.User;
  const clientId = c.req.param('id') as string;
  const rawBody = await c.req.json().catch(() => ({}));
  const parse = z
    .object({
      body: z.string().min(1).max(5000).optional(),
      noteText: z.string().min(1).max(5000).optional(),
      noteDate: z.string().optional(),
    })
    .refine((d) => Boolean(d.body || d.noteText), { message: 'Note body is required' })
    .safeParse(rawBody);
  if (!parse.success) return c.json({ error: 'Validation failed', errors: parse.error.issues }, 400);

  const db = getDb(c.env.DB);
  const clientRows = await db
    .select({ id: schema.clients.id })
    .from(schema.clients)
    .where(and(eq(schema.clients.id, clientId), eq(schema.clients.firmId, firmId), isNull(schema.clients.deletedAt)))
    .limit(1);
  if (!clientRows[0]) return c.json({ error: 'Not found', message: 'Client not found' }, 404);

  const now = new Date().toISOString();
  const text = (parse.data.body || parse.data.noteText)!.trim();
  const note = {
    id: crypto.randomUUID(),
    firmId,
    clientId,
    noteDate: parse.data.noteDate || now.slice(0, 10),
    body: text,
    createdBy: user.id,
    updatedBy: user.id,
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
  };

  await db.batch([
    db.insert(schema.clientNotes).values(note),
    db.insert(schema.auditLog).values(
      buildAuditEntry({
        firmId,
        userId: user.id,
        userName: user.name,
        entity: 'ClientNote',
        entityId: note.id,
        action: 'CREATE',
        newValue: { clientId },
        now,
      })
    ),
  ] as any);

  return c.json(note, 201);
});

clientsRouter.patch('/:id/notes/:noteId', enforceSubscriptionReadOnly, requirePermission('clients.edit'), async (c) => {
  const firmId = c.get('firmId') as string;
  const user = c.get('user') as schema.User;
  const clientId = c.req.param('id') as string;
  const noteId = c.req.param('noteId') as string;
  const rawBody = await c.req.json().catch(() => ({}));
  const parse = z
    .object({
      body: z.string().min(1).max(5000).optional(),
      noteText: z.string().min(1).max(5000).optional(),
      noteDate: z.string().optional(),
    })
    .refine((d) => Boolean(d.body || d.noteText || d.noteDate), { message: 'Note update payload required' })
    .safeParse(rawBody);
  if (!parse.success) return c.json({ error: 'Validation failed', errors: parse.error.issues }, 400);

  const db = getDb(c.env.DB);
  const rows = await db
    .select()
    .from(schema.clientNotes)
    .where(
      and(
        eq(schema.clientNotes.id, noteId),
        eq(schema.clientNotes.clientId, clientId),
        eq(schema.clientNotes.firmId, firmId),
        isNull(schema.clientNotes.deletedAt)
      )
    )
    .limit(1);
  if (!rows[0]) return c.json({ error: 'Not found', message: 'Note not found' }, 404);

  const now = new Date().toISOString();
  const nextBody = parse.data.body || parse.data.noteText;
  const updates: Record<string, any> = { updatedAt: now, updatedBy: user.id };
  if (nextBody) updates.body = nextBody.trim();
  if (parse.data.noteDate) updates.noteDate = parse.data.noteDate;

  await db.update(schema.clientNotes).set(updates).where(eq(schema.clientNotes.id, noteId));

  return c.json({ ...rows[0], ...updates });
});

clientsRouter.delete('/:id/notes/:noteId', enforceSubscriptionReadOnly, requirePermission('clients.edit'), async (c) => {
  const firmId = c.get('firmId') as string;
  const clientId = c.req.param('id') as string;
  const noteId = c.req.param('noteId') as string;
  const db = getDb(c.env.DB);

  const rows = await db
    .select({ id: schema.clientNotes.id })
    .from(schema.clientNotes)
    .where(
      and(
        eq(schema.clientNotes.id, noteId),
        eq(schema.clientNotes.clientId, clientId),
        eq(schema.clientNotes.firmId, firmId),
        isNull(schema.clientNotes.deletedAt)
      )
    )
    .limit(1);
  if (!rows[0]) return c.json({ error: 'Not found', message: 'Note not found' }, 404);

  const now = new Date().toISOString();
  await db.update(schema.clientNotes).set({ deletedAt: now, updatedAt: now }).where(eq(schema.clientNotes.id, noteId));
  return c.json({ success: true, softDeleted: true });
});

// Photo Management: PUT /api/v1/clients/:id/photo
clientsRouter.put('/:id/photo', enforceSubscriptionReadOnly, requirePermission('clients.edit'), async (c) => {
  const firmId = c.get('firmId') as string;
  const clientId = c.req.param('id') as string;
  const user = c.get('user') as schema.User;
  const db = getDb(c.env.DB);

  const existingClient = await db
    .select()
    .from(schema.clients)
    .where(and(eq(schema.clients.id, clientId), eq(schema.clients.firmId, firmId), isNull(schema.clients.deletedAt)))
    .limit(1);

  if (!existingClient[0]) {
    return c.json({ error: 'Not found', message: 'Client not found' }, 404);
  }

  const contentType = c.req.header('content-type') || 'application/json';
  let rawBytes: Uint8Array | null = null;

  if (contentType.includes('application/json')) {
    const body = await c.req.json().catch(() => ({} as Record<string, unknown>));
    const encoded = (body.data || body.bytes || body.photo || '') as string;
    if (typeof encoded === 'string' && encoded.trim().length > 0) {
      try {
        rawBytes = base64ToUint8Array(encoded);
      } catch {
        return c.json({ error: 'Validation failed', message: 'Invalid base64 photo data' }, 400);
      }
    }
  } else {
    const arrayBuffer = await c.req.arrayBuffer();
    rawBytes = new Uint8Array(arrayBuffer);
  }

  if (!rawBytes || rawBytes.byteLength === 0) {
    return c.json({ error: 'Validation failed', message: 'Photo data required' }, 400);
  }

  if (rawBytes.byteLength > 300 * 1024) {
    return c.json({ error: 'Payload too large', message: 'Photo exceeds 300 KB limit' }, 400);
  }

  const detected = detectImageMimeFromMagic(rawBytes);
  if (!detected) {
    return c.json({
      error: 'Invalid image format',
      message: 'Only JPEG, WebP, and PNG are allowed based on verified file signature',
    }, 400);
  }

  const existingPhotoRows = await db
    .select()
    .from(schema.clientPhotos)
    .where(and(eq(schema.clientPhotos.clientId, clientId), eq(schema.clientPhotos.firmId, firmId)))
    .limit(1);
  const existingPhoto = existingPhotoRows[0];

  const now = new Date().toISOString();
  const base64Bytes = uint8ArrayToBase64(rawBytes);
  let r2Key: string | null = null;
  let storedBytes = base64Bytes;
  let storageProvider: 'supabase' | 'r2' | 'd1' = 'd1';

  if (isSupabaseStorageConfigured(c.env)) {
    const bucket = getPhotosBucketName(c.env);
    const objectPath = `photos/${firmId}/${clientId}.${detected.ext}`;
    await uploadToSupabaseStorage({
      env: c.env,
      bucket,
      objectPath,
      data: rawBytes,
      contentType: detected.mime,
    });

    const oldRef = parseSupabaseStorageRef(existingPhoto?.r2Key);
    if (oldRef && (oldRef.bucket !== bucket || oldRef.objectPath !== objectPath)) {
      await deleteFromSupabaseStorage({ env: c.env, bucket: oldRef.bucket, objectPath: oldRef.objectPath }).catch(() => {});
    }

    r2Key = formatSupabaseStorageRef(bucket, objectPath);
    storedBytes = '';
    storageProvider = 'supabase';
  } else if (c.env.PHOTOS_BUCKET) {
    r2Key = `photos/${firmId}/${clientId}.${detected.ext}`;
    await c.env.PHOTOS_BUCKET.put(r2Key, rawBytes, { httpMetadata: { contentType: detected.mime } });
    storedBytes = '';
    storageProvider = 'r2';
  }

  await c.env.DB.batch([
    c.env.DB.prepare(`
      INSERT INTO client_photos (client_id, firm_id, mime, bytes, r2_key, updated_at)
      VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT (client_id)
      DO UPDATE SET mime = ?, bytes = ?, r2_key = ?, updated_at = ?
    `).bind(clientId, firmId, detected.mime, storedBytes, r2Key, now, detected.mime, storedBytes, r2Key, now),
    c.env.DB.prepare(`
      INSERT INTO audit_log (id, firm_id, user_id, user_name, entity, entity_id, action, old_value, new_value, timestamp, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      crypto.randomUUID(),
      firmId,
      user.id,
      user.name,
      'ClientPhoto',
      clientId,
      existingPhoto ? 'UPDATE' : 'CREATE',
      null,
      JSON.stringify({ mime: detected.mime, size: rawBytes.byteLength, storage: storageProvider }),
      now,
      now,
      now
    ),
  ]);

  return c.json({
    success: true,
    clientId,
    firmId,
    mime: detected.mime,
    bytes: base64Bytes,
    dataUrl: `data:${detected.mime};base64,${base64Bytes}`,
    size: rawBytes.byteLength,
    updatedAt: now,
  });
});

// GET /api/v1/clients/:id/photo
clientsRouter.get('/:id/photo', requirePermission('clients.view'), async (c) => {
  const firmId = c.get('firmId') as string;
  const clientId = c.req.param('id') as string;
  const db = getDb(c.env.DB);

  const clientRows = await db
    .select({ id: schema.clients.id })
    .from(schema.clients)
    .where(and(eq(schema.clients.id, clientId), eq(schema.clients.firmId, firmId), isNull(schema.clients.deletedAt)))
    .limit(1);

  if (!clientRows[0]) {
    return c.json({ error: 'Not found', message: 'Client not found' }, 404);
  }

  const rows = await db
    .select()
    .from(schema.clientPhotos)
    .where(and(eq(schema.clientPhotos.clientId, clientId), eq(schema.clientPhotos.firmId, firmId)))
    .limit(1);

  const photo = rows[0];
  if (!photo) {
    return c.json({ error: 'Not found', message: 'Photo not found' }, 404);
  }

  let binaryData: Uint8Array | null = null;
  const supabaseRef = parseSupabaseStorageRef(photo.r2Key);
  if (supabaseRef && isSupabaseStorageConfigured(c.env)) {
    const obj = await downloadFromSupabaseStorage({
      env: c.env,
      bucket: supabaseRef.bucket,
      objectPath: supabaseRef.objectPath,
    });
    if (obj) {
      binaryData = new Uint8Array(obj.data);
    }
  } else if (photo.r2Key && c.env.PHOTOS_BUCKET && !supabaseRef) {
    const obj = await c.env.PHOTOS_BUCKET.get(photo.r2Key);
    if (obj) {
      binaryData = new Uint8Array(await obj.arrayBuffer());
    }
  }

  if (!binaryData && photo.bytes) {
    binaryData = base64ToUint8Array(photo.bytes);
  }

  if (!binaryData || binaryData.byteLength === 0) {
    return c.json({ error: 'Not found', message: 'Photo not found' }, 404);
  }

  const acceptsJson = c.req.header('accept')?.includes('application/json') || c.req.query('format') === 'json';
  if (acceptsJson) {
    const base64Bytes = uint8ArrayToBase64(binaryData);
    return c.json({
      clientId,
      firmId,
      mime: photo.mime,
      bytes: base64Bytes,
      dataUrl: `data:${photo.mime};base64,${base64Bytes}`,
      updatedAt: photo.updatedAt,
    });
  }

  c.header('Content-Type', photo.mime);
  c.header('ETag', `"${new Date(photo.updatedAt).getTime()}"`);
  c.header('Cache-Control', 'private, no-cache, must-revalidate');
  return c.body(binaryData.slice().buffer);
});

// DELETE /api/v1/clients/:id/photo
clientsRouter.delete('/:id/photo', enforceSubscriptionReadOnly, requirePermission('clients.edit'), async (c) => {
  const firmId = c.get('firmId') as string;
  const clientId = c.req.param('id') as string;
  const user = c.get('user') as schema.User;
  const db = getDb(c.env.DB);

  const clientRows = await db
    .select({ id: schema.clients.id })
    .from(schema.clients)
    .where(and(eq(schema.clients.id, clientId), eq(schema.clients.firmId, firmId), isNull(schema.clients.deletedAt)))
    .limit(1);

  if (!clientRows[0]) {
    return c.json({ error: 'Not found', message: 'Client not found' }, 404);
  }

  const existingPhotoRows = await db
    .select()
    .from(schema.clientPhotos)
    .where(and(eq(schema.clientPhotos.clientId, clientId), eq(schema.clientPhotos.firmId, firmId)))
    .limit(1);
  const existingPhoto = existingPhotoRows[0];

  if (existingPhoto?.r2Key) {
    const supabaseRef = parseSupabaseStorageRef(existingPhoto.r2Key);
    if (supabaseRef && isSupabaseStorageConfigured(c.env)) {
      await deleteFromSupabaseStorage({
        env: c.env,
        bucket: supabaseRef.bucket,
        objectPath: supabaseRef.objectPath,
      });
    } else if (!supabaseRef && c.env.PHOTOS_BUCKET) {
      await c.env.PHOTOS_BUCKET.delete(existingPhoto.r2Key);
    }
  }

  const now = new Date().toISOString();
  await c.env.DB.batch([
    c.env.DB.prepare('DELETE FROM client_photos WHERE client_id = ? AND firm_id = ?').bind(clientId, firmId),
    c.env.DB.prepare(`
      INSERT INTO audit_log (id, firm_id, user_id, user_name, entity, entity_id, action, old_value, new_value, timestamp, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      crypto.randomUUID(),
      firmId,
      user.id,
      user.name,
      'ClientPhoto',
      clientId,
      'DELETE',
      null,
      JSON.stringify({ deleted: true }),
      now,
      now,
      now
    ),
  ]);

  return c.json({ success: true });
});
