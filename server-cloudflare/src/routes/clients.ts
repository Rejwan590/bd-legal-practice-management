import { Hono } from 'hono';
import { z } from 'zod';
import { Env, authMiddleware, enforceSubscriptionReadOnly, requirePermission } from '../middleware/auth';
import { getDb } from '../db/client';
import * as schema from '../db/schema';
import { eq, and, isNull, sql, asc } from 'drizzle-orm';
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

export const clientsRouter = new Hono<{ Bindings: Env; Variables: any }>();

clientsRouter.use('*', authMiddleware);

// GET /api/v1/clients
clientsRouter.get('/', requirePermission('clients.view'), async (c) => {
  const firmId = c.get('firmId');
  const search = c.req.query('q')?.trim();
  const limit = Math.min(parseInt(c.req.query('limit') || '50', 10), 100);
  const offset = parseInt(c.req.query('offset') || '0', 10);

  const db = getDb(c.env.DB);
  const conditions = [eq(schema.clients.firmId, firmId), isNull(schema.clients.deletedAt)];

  if (search) {
    const q = `%${search}%`;
    conditions.push(sql`(${schema.clients.name} LIKE ${q} COLLATE NOCASE OR ${schema.clients.phone} LIKE ${q})`);
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
      hasPhoto: sql<number>`CASE WHEN ${schema.clientPhotos.clientId} IS NOT NULL THEN 1 ELSE 0 END`,
    })
    .from(schema.clients)
    .leftJoin(schema.clientPhotos, eq(schema.clients.id, schema.clientPhotos.clientId))
    .where(and(...conditions))
    .limit(limit)
    .offset(offset)
    .orderBy(asc(schema.clients.name));

  return c.json({
    clients: rows.map((r) => ({
      ...r,
      hasPhoto: Boolean(r.hasPhoto),
    })),
  });
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
      hasPhoto: sql<number>`CASE WHEN ${schema.clientPhotos.clientId} IS NOT NULL THEN 1 ELSE 0 END`,
    })
    .from(schema.clients)
    .leftJoin(schema.clientPhotos, eq(schema.clients.id, schema.clientPhotos.clientId))
    .where(and(eq(schema.clients.id, id), eq(schema.clients.firmId, firmId), isNull(schema.clients.deletedAt)))
    .limit(1);

  if (!rows[0]) {
    return c.json({ error: 'Not found', message: 'Client not found' }, 404);
  }

  return c.json({ client: { ...rows[0], hasPhoto: Boolean(rows[0].hasPhoto) } });
});

// POST /api/v1/clients
clientsRouter.post('/', enforceSubscriptionReadOnly, requirePermission('clients.create'), async (c) => {
  const firmId = c.get('firmId');
  const user = c.get('user') as schema.User;
  const body = await c.req.json().catch(() => ({}));

  const clientSchema = z.object({
    name: z.string().min(1),
    nameBn: z.string().optional(),
    phone: z.string().min(1),
    email: z.string().email().optional().or(z.literal('')),
    address: z.string().min(1),
    notes: z.string().optional(),
  });

  const parse = clientSchema.safeParse(body);
  if (!parse.success) {
    return c.json({ error: 'Validation failed', errors: parse.error.issues }, 400);
  }

  const clientId = crypto.randomUUID();
  const auditId = crypto.randomUUID();
  const now = new Date().toISOString();

  const newClientData = {
    id: clientId,
    firmId,
    name: parse.data.name,
    nameBn: parse.data.nameBn || null,
    phone: parse.data.phone,
    email: parse.data.email || null,
    address: parse.data.address,
    notes: parse.data.notes || null,
    archived: false,
    createdAt: now,
    updatedAt: now,
    createdBy: user.id,
  };

  const auditEntry = {
    id: auditId,
    firmId,
    userId: user.id,
    userName: user.name,
    entity: 'Client',
    entityId: clientId,
    action: 'CREATE',
    oldValue: null,
    newValue: newClientData,
    timestamp: now,
    createdAt: now,
    updatedAt: now,
  };

  const db = getDb(c.env.DB);
  await db.batch([
    db.insert(schema.clients).values(newClientData),
    db.insert(schema.auditLog).values(auditEntry),
  ] as any);

  return c.json({ client: { ...newClientData, hasPhoto: false } }, 201);
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
