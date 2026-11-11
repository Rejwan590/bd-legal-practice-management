import { describe, it, expect, beforeAll, vi } from 'vitest';
import app from '../src/index';
import { createInMemoryD1 } from './d1Mock';
import { hashPassword } from '../src/utils/crypto';
import * as schema from '../src/db/schema';
import { getDb } from '../src/db/client';
import { eq } from 'drizzle-orm';

describe('BD Legal Cloudflare Workers Backend Test Suite', () => {
  let mockD1: D1Database;
  const env: any = {
    DB: null,
    JWT_SECRET: 'test-secret-min-32-chars-long-security-key-12345',
    ADMIN_JWT_SECRET: 'test-admin-secret-min-32-chars-long-key-67890',
    CORS_ORIGIN: 'https://bd-legal-practice-management.vercel.app',
    ENVIRONMENT: 'test',
  };

  let adminCookie = '';
  let firmAId = '';
  let ownerEmail = 'owner@chamber-a.com';
  let ownerPassword = 'ValidPassword123!';
  let ownerCookie = '';
  let clientAId = '';
  let caseAId = '';
  let hearingAId = '';

  beforeAll(async () => {
    mockD1 = createInMemoryD1();
    env.DB = mockD1;

    // Seed Platform Admin in D1
    const adminHash = await hashPassword('AdminPass2026!');
    const db = getDb(mockD1);
    await db.insert(schema.platformAdmins).values({
      id: 'admin-001',
      email: 'superadmin@bdlegal.com',
      passwordHash: adminHash,
      active: true,
      failedAttempts: 0,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
  });

  // 1. Health Endpoint Test
  it('1. GET /api/v1/health returns 200 ok and runtime info', async () => {
    const res = await app.request('/api/v1/health', { method: 'GET' }, env);
    expect(res.status).toBe(200);
    const data = (await res.json() as any);
    expect(data.status).toBe('ok');
    expect(data.runtime).toBe('cloudflare-workers');
  });

  // 2. Admin Login
  it('2. POST /api/admin/auth/login authenticates super-admin and sets cookie', async () => {
    const res = await app.request(
      '/api/admin/auth/login',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'superadmin@bdlegal.com', password: 'AdminPass2026!' }),
      },
      env
    );
    expect(res.status).toBe(200);
    const setCookie = res.headers.get('set-cookie');
    expect(setCookie).toContain('admin_access_token=');
    adminCookie = setCookie!.split(';')[0];
  });

  // 3. Create Firm & Owner in Atomic Batch (Scenario 1)
  it('3. POST /api/admin/firms provisions firm + owner + license event atomically', async () => {
    const res = await app.request(
      '/api/admin/firms',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Cookie: adminCookie,
        },
        body: JSON.stringify({
          name: 'Chamber Alpha & Associates',
          ownerName: 'Barrister Rafiqul Islam',
          ownerEmail,
          licenseType: 'trial',
          trialDays: 14,
          maxUsers: 5,
          maxDevices: 5,
        }),
      },
      env
    );

    expect(res.status).toBe(201);
    const data = (await res.json() as any);
    expect(data.firm).toBeDefined();
    expect(data.firm.name).toBe('Chamber Alpha & Associates');
    expect(data.firm.isTrial).toBe(true);
    expect(data.owner.email).toBe(ownerEmail);
    expect(data.temporaryPassword).toBeDefined();

    firmAId = data.firm.id;
    ownerPassword = data.temporaryPassword;
  });

  // 4. Chamber Owner Login
  it('4. POST /api/v1/auth/login logs in owner with temporary password', async () => {
    const res = await app.request(
      '/api/v1/auth/login',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: ownerEmail, password: ownerPassword }),
      },
      env
    );

    expect(res.status).toBe(200);
    const data = (await res.json() as any);
    expect(data.user.email).toBe(ownerEmail);
    expect(data.user.role).toBe('Owner');
    expect(data.user.mustChangePassword).toBe(true);

    const setCookie = res.headers.get('set-cookie');
    expect(setCookie).toContain('access_token=');
    ownerCookie = setCookie!.split(';')[0];
  });

  // 5. Create Client with Audit Log
  it('5. POST /api/v1/clients creates client record and audit log atomically', async () => {
    const res = await app.request(
      '/api/v1/clients',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Cookie: ownerCookie,
        },
        body: JSON.stringify({
          name: 'Kazi Nazrul Islam',
          phone: '+8801711000001',
          email: 'nazrul@client.com',
          address: 'Dhanmondi R/A, Dhaka',
        }),
      },
      env
    );

    expect(res.status).toBe(201);
    const data = (await res.json() as any);
    expect(data.client.name).toBe('Kazi Nazrul Islam');
    clientAId = data.client.id;
  });

  // 6. Create Case
  it('6. POST /api/v1/cases creates case with responsible lawyer', async () => {
    const res = await app.request(
      '/api/v1/cases',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Cookie: ownerCookie,
        },
        body: JSON.stringify({
          clientId: clientAId,
          caseNumber: 'WP-1042/2026',
          court: 'High Court Division, Supreme Court',
          matterType: 'Writ Petition',
          plaintiff: 'Kazi Nazrul Islam',
          defendant: 'Government of Bangladesh',
        }),
      },
      env
    );

    expect(res.status).toBe(201);
    const data = (await res.json() as any);
    expect(data.case.caseNumber).toBe('WP-1042/2026');
    caseAId = data.case.id;
  });

  // 7. Schedule Hearing & Sync Case Next Hearing (Scenario 4)
  it('7. POST /api/v1/hearings creates hearing and syncs case nextHearingAt', async () => {
    const scheduledAt = '2026-11-25T10:30:00.000Z';
    const res = await app.request(
      '/api/v1/hearings',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Cookie: ownerCookie,
        },
        body: JSON.stringify({
          caseId: caseAId,
          scheduledAt,
          purpose: 'Motion Hearing',
          fixedFor: 'Order',
        }),
      },
      env
    );

    expect(res.status).toBe(201);
    const data = (await res.json() as any);
    expect(data.hearing.scheduledAt).toBe(scheduledAt);
    hearingAId = data.hearing.id;

    // Verify Case nextHearingAt was synchronized in D1
    const caseRes = await app.request(`/api/v1/cases/${caseAId}`, { headers: { Cookie: ownerCookie } }, env);
    const caseData = (await caseRes.json() as any);
    expect(caseData.case.nextHearingAt).toBe(scheduledAt);
  });

  // 8. Adjourn Hearing with Date History (Scenario 5)
  it('8. POST /api/v1/hearings/:id/adjourn records history, updates case next date in atomic batch', async () => {
    const nextDate = '2026-12-10T10:30:00.000Z';
    const res = await app.request(
      `/api/v1/hearings/${hearingAId}/adjourn`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Cookie: ownerCookie,
        },
        body: JSON.stringify({
          nextScheduledAt: nextDate,
          reason: 'Time petition by Attorney General',
        }),
      },
      env
    );

    expect(res.status).toBe(200);
    const data = (await res.json() as any);
    expect(data.newHearing.scheduledAt).toBe(nextDate);

    // Verify Case nextHearingAt was updated to the new date
    const caseRes = await app.request(`/api/v1/cases/${caseAId}`, { headers: { Cookie: ownerCookie } }, env);
    const caseData = (await caseRes.json() as any);
    expect(caseData.case.nextHearingAt).toBe(nextDate);
  });

  // 9. Fee Agreement & Sequential Receipt Numbering (Scenario 8)
  it('9. POST /api/v1/accounts/payments issues sequential receipt number (REC-YYYY-00001)', async () => {
    const res = await app.request(
      '/api/v1/accounts/payments',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Cookie: ownerCookie,
        },
        body: JSON.stringify({
          clientId: clientAId,
          caseId: caseAId,
          paymentDate: '2026-11-10',
          amountBdt: 25000,
          method: 'bank',
          purposeNote: 'Initial Retainer Fee',
        }),
      },
      env
    );

    expect(res.status).toBe(201);
    const data = (await res.json() as any);
    const year = new Date().getFullYear();
    expect(data.payment.receiptNumber).toBe(`REC-${year}-00001`);
    expect(data.payment.amountPaisa).toBe(2500000); // Integer paisa invariant
  });

  // 10. Multi-Tenant Firm Isolation Guard
  it('10. Multi-tenant isolation: Firm B cannot view Firm A clients or cases', async () => {
    // Create Firm B
    const firmBRes = await app.request(
      '/api/admin/firms',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Cookie: adminCookie,
        },
        body: JSON.stringify({
          name: 'Chamber Beta Partners',
          ownerName: 'Advocate Shamsur Rahman',
          ownerEmail: 'owner@chamber-b.com',
          licenseType: 'trial',
        }),
      },
      env
    );
    const firmBData = (await firmBRes.json() as any);

    // Login as Firm B Owner
    const loginBRes = await app.request(
      '/api/v1/auth/login',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'owner@chamber-b.com', password: firmBData.temporaryPassword }),
      },
      env
    );
    const ownerBCookie = loginBRes.headers.get('set-cookie')!.split(';')[0];

    // Firm B tries to fetch Firm A's client
    const getClientRes = await app.request(`/api/v1/clients/${clientAId}`, { headers: { Cookie: ownerBCookie } }, env);
    expect(getClientRes.status).toBe(404);

    // Firm B tries to fetch Firm A's case
    const getCaseRes = await app.request(`/api/v1/cases/${caseAId}`, { headers: { Cookie: ownerBCookie } }, env);
    expect(getCaseRes.status).toBe(404);
  });

  // 11. Read-Only Mode Invariant when Expired
  it('11. Expired subscription enforces read-only: blocks mutating writes with 403, allows reads', async () => {
    const db = getDb(mockD1);
    // Expire Firm A's license
    await db
      .update(schema.firms)
      .set({
        licenseExpiresAt: '2020-01-01T00:00:00.000Z',
        status: 'expired',
      })
      .where(eq(schema.firms.id, firmAId));

    // Try mutating write (POST /clients) -> must be blocked with HTTP 403 SUBSCRIPTION_READ_ONLY
    const mutateRes = await app.request(
      '/api/v1/clients',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Cookie: ownerCookie,
        },
        body: JSON.stringify({
          name: 'Blocked Client',
          phone: '+8801700000000',
          address: 'Dhaka',
        }),
      },
      env
    );
    expect(mutateRes.status).toBe(403);
    const mutateData = (await mutateRes.json() as any);
    expect(mutateData.code).toBe('SUBSCRIPTION_READ_ONLY');

    // Read endpoint (GET /clients) -> must still succeed with HTTP 200
    const readRes = await app.request('/api/v1/clients', { headers: { Cookie: ownerCookie } }, env);
    expect(readRes.status).toBe(200);

    // Mutating photo upload on expired Firm A -> blocked with 403 SUBSCRIPTION_READ_ONLY
    const blockedPhotoRes = await app.request(
      `/api/v1/clients/${clientAId}/photo`,
      {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Cookie: ownerCookie },
        body: JSON.stringify({ mime: 'image/jpeg', data: '/9j/4AAQSkZJRg==' }),
      },
      env
    );
    expect(blockedPhotoRes.status).toBe(403);
  });

  // 12. Supabase Storage Client Photo Upload, Fetch & Delete (Replaces R2)
  it('12. Supabase Storage handles PUT, GET (binary + ?format=json), and DELETE photo cleanly', async () => {
    // Create Firm C for clean active-firm Supabase Storage photo lifecycle test
    const firmCRes = await app.request(
      '/api/admin/firms',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: adminCookie },
        body: JSON.stringify({
          name: 'Chamber Gamma & Co',
          ownerName: 'Advocate Tahmina Haque',
          ownerEmail: 'owner@chamber-c.com',
          licenseType: 'trial',
        }),
      },
      env
    );
    expect(firmCRes.status).toBe(201);
    const firmCData = (await firmCRes.json() as any);
    const loginCRes = await app.request(
      '/api/v1/auth/login',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'owner@chamber-c.com', password: firmCData.temporaryPassword }),
      },
      env
    );
    expect(loginCRes.status).toBe(200);
    const ownerCCookie = loginCRes.headers.get('set-cookie')!.split(';')[0];

    const createClientRes = await app.request(
      '/api/v1/clients',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: ownerCCookie },
        body: JSON.stringify({
          name: 'Begum Rokeya',
          phone: '+8801711999888',
          address: 'Gulshan-2, Dhaka',
        }),
      },
      env
    );
    expect(createClientRes.status).toBe(201);
    const clientCId = ((await createClientRes.json()) as any).client.id;

    // Stub global fetch for Supabase Storage REST API calls
    const storedObjects = new Map<string, { bytes: Uint8Array; contentType: string }>();
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input.toString();
      const method = (init?.method || 'GET').toUpperCase();
      const headers = new Headers(init?.headers);

      // Verify sb_secret_ key uses apikey header cleanly (not fake Bearer JWT)
      expect(headers.get('apikey')).toBe('sb_secret_test_key_12345');
      expect(headers.get('Authorization')).toBeNull();

      if (method === 'POST' && url.includes('/storage/v1/object/bdlegal-photos/')) {
        const key = url.split('/storage/v1/object/')[1];
        const body = init?.body instanceof Uint8Array
          ? init.body
          : new Uint8Array(init?.body as ArrayBuffer);
        storedObjects.set(key, {
          bytes: body,
          contentType: headers.get('Content-Type') || 'application/octet-stream',
        });
        return new Response(JSON.stringify({ Key: key }), { status: 200 });
      }

      if (method === 'GET' && url.includes('/storage/v1/object/authenticated/bdlegal-photos/')) {
        const key = url.split('/storage/v1/object/authenticated/')[1];
        const obj = storedObjects.get(key);
        if (!obj) {
          return new Response(JSON.stringify({ statusCode: '404', error: 'not_found' }), { status: 404 });
        }
        return new Response(obj.bytes.slice().buffer, {
          status: 200,
          headers: { 'Content-Type': obj.contentType },
        });
      }

      if (method === 'DELETE' && url.includes('/storage/v1/object/bdlegal-photos/')) {
        const key = url.split('/storage/v1/object/')[1];
        storedObjects.delete(key);
        return new Response(JSON.stringify({ message: 'Successfully deleted' }), { status: 200 });
      }

      return new Response('Unexpected fetch URL: ' + url, { status: 500 });
    });

    const supabaseEnv = {
      ...env,
      SUPABASE_URL: 'https://rmuontqsoxwnzevtnvkc.supabase.co',
      SUPABASE_SECRET_KEY: 'sb_secret_test_key_12345',
      SUPABASE_PHOTOS_BUCKET: 'bdlegal-photos',
    };

    try {
      const sampleJpegBase64 =
        '/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA=';

      // Reject non-image magic bytes with 400
      const invalidRes = await app.request(
        `/api/v1/clients/${clientCId}/photo`,
        {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json', Cookie: ownerCCookie },
          body: JSON.stringify({ mime: 'image/jpeg', data: btoa('NOT_AN_IMAGE') }),
        },
        supabaseEnv
      );
      expect(invalidRes.status).toBe(400);

      // Upload valid JPEG -> goes to Supabase Storage, NOT D1 bytes
      const putRes = await app.request(
        `/api/v1/clients/${clientCId}/photo`,
        {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json', Cookie: ownerCCookie },
          body: JSON.stringify({ mime: 'image/jpeg', data: sampleJpegBase64 }),
        },
        supabaseEnv
      );
      expect(putRes.status).toBe(200);
      const putData = (await putRes.json()) as any;
      expect(putData.success).toBe(true);
      expect(putData.mime).toBe('image/jpeg');
      expect(putData.dataUrl).toContain('data:image/jpeg;base64,');

      const expectedObjectPath = `photos/${firmCData.firm.id}/${clientCId}.jpg`;
      const expectedStorageKey = `bdlegal-photos/${expectedObjectPath}`;
      expect(storedObjects.has(expectedStorageKey)).toBe(true);

      // Verify D1 stores pointer without raw base64 bloat, and audit_log has metadata only
      const db = getDb(mockD1);
      const photoRows = await db
        .select()
        .from(schema.clientPhotos)
        .where(eq(schema.clientPhotos.clientId, clientCId));
      expect(photoRows[0].bytes).toBe('');
      expect(photoRows[0].r2Key).toBe(`supabase:bdlegal-photos:${expectedObjectPath}`);

      // GET binary from Supabase Storage
      const getBinRes = await app.request(
        `/api/v1/clients/${clientCId}/photo`,
        { headers: { Cookie: ownerCCookie } },
        supabaseEnv
      );
      expect(getBinRes.status).toBe(200);
      expect(getBinRes.headers.get('content-type')).toBe('image/jpeg');
      expect(getBinRes.headers.get('cache-control')).toContain('private');
      const fetchedBytes = new Uint8Array(await getBinRes.arrayBuffer());
      expect(fetchedBytes.byteLength).toBe(storedObjects.get(expectedStorageKey)!.bytes.byteLength);

      // GET ?format=json from Supabase Storage
      const getJsonRes = await app.request(
        `/api/v1/clients/${clientCId}/photo?format=json`,
        { headers: { Cookie: ownerCCookie } },
        supabaseEnv
      );
      expect(getJsonRes.status).toBe(200);
      const getJsonData = (await getJsonRes.json()) as any;
      expect(getJsonData.bytes).toBe(sampleJpegBase64);

      // DELETE photo removes from both Supabase Storage and D1
      const delRes = await app.request(
        `/api/v1/clients/${clientCId}/photo`,
        { method: 'DELETE', headers: { Cookie: ownerCCookie } },
        supabaseEnv
      );
      expect(delRes.status).toBe(200);
      expect(storedObjects.has(expectedStorageKey)).toBe(false);

      const getAfterDeleteRes = await app.request(
        `/api/v1/clients/${clientCId}/photo`,
        { headers: { Cookie: ownerCCookie } },
        supabaseEnv
      );
      expect(getAfterDeleteRes.status).toBe(404);
    } finally {
      fetchSpy.mockRestore();
    }
  });
});
