import { Hono } from 'hono';
import { z } from 'zod';
import { Env, authMiddleware, enforceSubscriptionReadOnly, requirePermission } from '../middleware/auth';
import { getDb } from '../db/client';
import * as schema from '../db/schema';
import { eq, and, isNull, sql, asc } from 'drizzle-orm';

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
  let bytes = '';
  let mime = 'image/jpeg';

  if (contentType.includes('application/json')) {
    const body = await c.req.json().catch(() => ({}));
    bytes = body.bytes || body.photo || '';
    mime = body.mime || 'image/jpeg';
  } else {
    const arrayBuffer = await c.req.arrayBuffer();
    if (arrayBuffer.byteLength > 300 * 1024) {
      return c.json({ error: 'Payload too large', message: 'Photo exceeds 300 KB limit' }, 400);
    }
    const uint8 = new Uint8Array(arrayBuffer);
    bytes = btoa(String.fromCharCode(...uint8));
    mime = contentType;
  }

  if (!bytes) {
    return c.json({ error: 'Validation failed', message: 'Photo data required' }, 400);
  }

  const now = new Date().toISOString();

  // If Cloudflare R2 is bound, stream directly to R2!
  let r2Key: string | null = null;
  if (c.env.PHOTOS_BUCKET) {
    r2Key = `photos/${firmId}/${clientId}.jpg`;
    await c.env.PHOTOS_BUCKET.put(r2Key, bytes);
  }

  // SQLite upsert
  await c.env.DB.prepare(`
    INSERT INTO client_photos (client_id, firm_id, mime, bytes, r2_key, updated_at)
    VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT (client_id)
    DO UPDATE SET mime = ?, bytes = ?, r2_key = ?, updated_at = ?
  `).bind(clientId, firmId, mime, bytes, r2Key, now, mime, bytes, r2Key, now).run();

  return c.json({
    message: 'Photo saved successfully',
    dataUrl: `data:${mime};base64,${bytes}`,
  });
});

// GET /api/v1/clients/:id/photo
clientsRouter.get('/:id/photo', async (c) => {
  const firmId = c.get('firmId') as string;
  const clientId = c.req.param('id') as string;
  const db = getDb(c.env.DB);

  const rows = await db
    .select()
    .from(schema.clientPhotos)
    .where(and(eq(schema.clientPhotos.clientId, clientId), eq(schema.clientPhotos.firmId, firmId)))
    .limit(1);

  const photo = rows[0];
  if (!photo) {
    return c.json({ error: 'Not found', message: 'Photo not found' }, 404);
  }

  c.header('Content-Type', photo.mime);
  c.header('ETag', `"${new Date(photo.updatedAt).getTime()}"`);
  c.header('Cache-Control', 'public, max-age=86400');

  // Binary response
  const rawStr = atob(photo.bytes);
  const uint8 = new Uint8Array(rawStr.length);
  for (let i = 0; i < rawStr.length; i++) {
    uint8[i] = rawStr.charCodeAt(i);
  }
  return c.body(uint8.buffer);
});
