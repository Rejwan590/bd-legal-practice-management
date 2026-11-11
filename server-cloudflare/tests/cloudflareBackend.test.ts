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
    expect(data.name).toBe('Kazi Nazrul Islam');
    clientAId = data.id;
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
    expect(data.caseNumber).toBe('WP-1042/2026');
    caseAId = data.id;
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
    expect(data.scheduledAt).toBe(scheduledAt);
    hearingAId = data.id;

    // Verify Case nextHearingAt was synchronized in D1
    const caseRes = await app.request(`/api/v1/cases/${caseAId}`, { headers: { Cookie: ownerCookie } }, env);
    const caseData = (await caseRes.json() as any);
    expect(caseData.nextHearingAt).toBe(scheduledAt);
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
    expect(data.nextHearing.scheduledAt).toBe(nextDate);

    // Verify Case nextHearingAt was updated to the new date
    const caseRes = await app.request(`/api/v1/cases/${caseAId}`, { headers: { Cookie: ownerCookie } }, env);
    const caseData = (await caseRes.json() as any);
    expect(caseData.nextHearingAt).toBe(nextDate);
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
    expect(data.receiptNumber).toBe(`REC-${year}-00001`);
    expect(data.amountPaisa).toBe(2500000); // Integer paisa invariant
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
    const clientCId = ((await createClientRes.json()) as any).id;

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

  // ===========================================================================
  // COMPREHENSIVE PARITY & INVARIANT SUITE (TESTS 13-18)
  // ===========================================================================

  let firmDId: string;
  let firmDOwnerCookie: string;
  let firmDClientId: string;
  let firmDCaseId: string;
  let juniorUserId: string;
  let juniorCookie: string;

  it('13. Staff provisioning, team visibility (reportsTo + restricted.view + case shares), and change-password', async () => {
    const firmDRes = await app.request(
      '/api/admin/firms',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: adminCookie },
        body: JSON.stringify({
          name: 'Delta Legal Chambers',
          officeAddress: 'Motijheel C/A, Dhaka',
          ownerName: 'Advocate Rashed Khan',
          ownerEmail: 'owner@chamber-d.com',
          maxUsers: 5,
          maxDevices: 5,
          devicePolicy: 'auto-approve',
          licenseType: 'trial',
        }),
      },
      env
    );
    expect(firmDRes.status).toBe(201);
    const firmDData = (await firmDRes.json()) as any;
    firmDId = firmDData.firm.id;

    // Login owner -> change password
    const loginRes = await app.request(
      '/api/v1/auth/login',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'owner@chamber-d.com', password: firmDData.temporaryPassword }),
      },
      env
    );
    expect(loginRes.status).toBe(200);
    firmDOwnerCookie = loginRes.headers.get('set-cookie')!.split(';')[0];

    const changePwRes = await app.request(
      '/api/v1/auth/change-password',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: firmDOwnerCookie },
        body: JSON.stringify({ currentPassword: firmDData.temporaryPassword, newPassword: 'NewOwnerPassword#2026' }),
      },
      env
    );
    expect(changePwRes.status).toBe(200);

    // Create junior associate & clerk
    const juniorRes = await app.request(
      '/api/v1/users',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: firmDOwnerCookie },
        body: JSON.stringify({
          name: 'Junior Barrister Arif',
          email: 'junior@chamber-d.com',
          preset: 'junior_lawyer',
          temporaryPassword: 'JuniorPass#2026',
        }),
      },
      env
    );
    expect(juniorRes.status).toBe(201);
    const juniorData = (await juniorRes.json()) as any;
    juniorUserId = juniorData.id;

    // Login junior
    const juniorLoginRes = await app.request(
      '/api/v1/auth/login',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'junior@chamber-d.com', password: 'JuniorPass#2026' }),
      },
      env
    );
    expect(juniorLoginRes.status).toBe(200);
    juniorCookie = juniorLoginRes.headers.get('set-cookie')!.split(';')[0];

    // Owner creates client + a restricted case assigned to Owner
    const clientRes = await app.request(
      '/api/v1/clients',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: firmDOwnerCookie },
        body: JSON.stringify({ name: 'Padma Textiles Ltd', phone: '+8801811000222', address: 'Dhanmondi, Dhaka' }),
      },
      env
    );
    expect(clientRes.status).toBe(201);
    firmDClientId = ((await clientRes.json()) as any).id;

    const caseRes = await app.request(
      '/api/v1/cases',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: firmDOwnerCookie },
        body: JSON.stringify({
          clientId: firmDClientId,
          caseNumber: 'CR-88/2026',
          court: 'District Judge Court, Dhaka',
          matterType: 'Commercial',
          plaintiff: 'Padma Textiles Ltd',
          defendant: 'Apex Suppliers',
          isRestricted: true,
        }),
      },
      env
    );
    expect(caseRes.status).toBe(201);
    firmDCaseId = ((await caseRes.json()) as any).id;

    // Under default team visibility + isRestricted=true, junior cannot see Owner's case yet
    const juniorCasesBefore = (await (
      await app.request('/api/v1/cases', { headers: { Cookie: juniorCookie } }, env)
    ).json()) as any[];
    expect(juniorCasesBefore.find((c) => c.id === firmDCaseId)).toBeUndefined();

    // Share case explicitly with junior -> now visible even though restricted & owned by senior
    const shareRes = await app.request(
      `/api/v1/cases/${firmDCaseId}/shares`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: firmDOwnerCookie },
        body: JSON.stringify({ userId: juniorUserId }),
      },
      env
    );
    expect(shareRes.status).toBe(201);

    const juniorCasesAfter = (await (
      await app.request('/api/v1/cases', { headers: { Cookie: juniorCookie } }, env)
    ).json()) as any[];
    expect(juniorCasesAfter.some((c) => c.id === firmDCaseId)).toBe(true);
  });

  it('14. Manual device approval policy blocks unknown device until admin approves, then revokes access', async () => {
    const firmERes = await app.request(
      '/api/admin/firms',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: adminCookie },
        body: JSON.stringify({
          name: 'Strict Security Chamber',
          ownerName: 'Advocate Salma',
          ownerEmail: 'owner@chamber-e.com',
          ownerPassword: 'StrictOwner#2026',
          devicePolicy: 'manual',
          licenseType: 'trial',
        }),
      },
      env
    );
    expect(firmERes.status).toBe(201);
    const firmEId = ((await firmERes.json()) as any).firm.id;

    // First login with manual policy -> 403 DEVICE_PENDING_APPROVAL
    const blockedLogin = await app.request(
      '/api/v1/auth/login',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'User-Agent': 'Mozilla/5.0 Chrome/120' },
        body: JSON.stringify({ email: 'owner@chamber-e.com', password: 'StrictOwner#2026' }),
      },
      env
    );
    expect(blockedLogin.status).toBe(403);
    const blockedBody = (await blockedLogin.json()) as any;
    expect(blockedBody.code).toBe('DEVICE_PENDING');
    const blockedCookies: string[] =
      (blockedLogin.headers as unknown as { getSetCookie?: () => string[] }).getSetCookie?.() ??
      [blockedLogin.headers.get('set-cookie') || ''];
    const deviceKeyPair = blockedCookies.find((c: string) => c.includes('device_key='))!.trim().split(';')[0];

    // Admin inspects pending device and approves it
    const listDevRes = await app.request(`/api/admin/firms/${firmEId}/devices`, { headers: { Cookie: adminCookie } }, env);
    expect(listDevRes.status).toBe(200);
    const devicesList = ((await listDevRes.json()) as any).devices as any[];
    expect(devicesList.length).toBe(1);
    expect(devicesList[0].status).toBe('pending');
    const devId = devicesList[0].id;

    const approveRes = await app.request(
      `/api/admin/devices/${devId}/approve`,
      { method: 'POST', headers: { Cookie: adminCookie } },
      env
    );
    expect(approveRes.status).toBe(200);

    // Retry login sending the device_key cookie -> 200 OK
    const allowedLogin = await app.request(
      '/api/v1/auth/login',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: deviceKeyPair },
        body: JSON.stringify({ email: 'owner@chamber-e.com', password: 'StrictOwner#2026' }),
      },
      env
    );
    expect(allowedLogin.status).toBe(200);
    const allowedCookiesList: string[] =
      (allowedLogin.headers as unknown as { getSetCookie?: () => string[] }).getSetCookie?.() ??
      [allowedLogin.headers.get('set-cookie') || ''];
    const approvedAccess = allowedCookiesList.find((c: string) => c.includes('access_token='))!.trim().split(';')[0];

    // Admin revokes device -> authenticated API call immediately denied
    const revokeRes = await app.request(
      `/api/admin/devices/${devId}/revoke`,
      { method: 'POST', headers: { Cookie: adminCookie } },
      env
    );
    expect(revokeRes.status).toBe(200);

    const postRevokeRes = await app.request(
      '/api/v1/clients',
      { headers: { Cookie: `${approvedAccess}; ${deviceKeyPair}` } },
      env
    );
    expect(postRevokeRes.status).toBe(403);
    expect(((await postRevokeRes.json()) as any).code).toBe('DEVICE_REVOKED');
  });

  it('15. Tasks, appointments, client/case notes, counts, and audit log work cleanly', async () => {
    // Task create -> reassign -> complete
    const taskRes = await app.request(
      '/api/v1/tasks',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: firmDOwnerCookie },
        body: JSON.stringify({
          title: 'File Vakalatnama',
          assignedTo: juniorUserId,
          dueAt: '2026-12-01T12:00:00.000Z',
          priority: 'high',
          caseId: firmDCaseId,
          clientId: firmDClientId,
        }),
      },
      env
    );
    expect(taskRes.status).toBe(201);
    const taskId = ((await taskRes.json()) as any).id;

    const completeRes = await app.request(
      `/api/v1/tasks/${taskId}/complete`,
      { method: 'POST', headers: { Cookie: juniorCookie } },
      env
    );
    expect(completeRes.status).toBe(200);
    expect(((await completeRes.json()) as any).status).toBe('completed');

    // Appointment create with court_conference normalization -> court_visit
    const apptRes = await app.request(
      '/api/v1/appointments',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: firmDOwnerCookie },
        body: JSON.stringify({
          title: 'Pre-trial conference',
          type: 'court_conference',
          startsAt: '2026-12-02T09:00:00.000Z',
          endsAt: '2026-12-02T10:00:00.000Z',
          clientId: firmDClientId,
          caseId: firmDCaseId,
          attendees: [juniorUserId],
        }),
      },
      env
    );
    expect(apptRes.status).toBe(201);
    const apptBody = (await apptRes.json()) as any;
    expect(apptBody.type).toBe('court_visit');
    expect(apptBody.attendees).toContain(juniorUserId);

    // Client note & Case note
    const cNoteRes = await app.request(
      `/api/v1/clients/${firmDClientId}/notes`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: firmDOwnerCookie },
        body: JSON.stringify({ noteDate: '2026-11-11', body: 'Client delivered original LC documents' }),
      },
      env
    );
    expect(cNoteRes.status).toBe(201);

    const caseNoteRes = await app.request(
      `/api/v1/cases/${firmDCaseId}/notes`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: firmDOwnerCookie },
        body: JSON.stringify({ noteDate: '2026-11-11', body: 'Interim injunction requested' }),
      },
      env
    );
    expect(caseNoteRes.status).toBe(201);

    const countsRes = await app.request(`/api/v1/cases/${firmDCaseId}/counts`, { headers: { Cookie: firmDOwnerCookie } }, env);
    expect(countsRes.status).toBe(200);
    const counts = (await countsRes.json()) as any;
    expect(counts.tasksCount).toBe(1);
    expect(counts.activeTasksCount).toBe(0);
    expect(counts.notesCount).toBe(1);

    const auditRes = await app.request('/api/v1/audit-log', { headers: { Cookie: firmDOwnerCookie } }, env);
    expect(auditRes.status).toBe(200);
    const auditLogs = (await auditRes.json()) as any[];
    expect(auditLogs.length).toBeGreaterThanOrEqual(4);
  });

  it('16. Bulk hearing reschedule & adjourn preserve hearing_date_history and case nextHearingAt', async () => {
    const h1 = (await (
      await app.request(
        '/api/v1/hearings',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Cookie: firmDOwnerCookie },
          body: JSON.stringify({ caseId: firmDCaseId, scheduledAt: '2026-12-05T10:00:00.000Z', purpose: 'Framing Issues' }),
        },
        env
      )
    ).json()) as any;

    const bulkResched = await app.request(
      '/api/v1/hearings/bulk-reschedule',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: firmDOwnerCookie },
        body: JSON.stringify({
          items: [
            {
              hearingId: h1.id,
              newDate: '2026-12-18T11:00:00.000Z',
              reason: 'Bar Association holiday declared',
            },
          ],
        }),
      },
      env
    );
    expect(bulkResched.status).toBe(200);

    const histRes = await app.request(`/api/v1/hearings/${h1.id}/history`, { headers: { Cookie: firmDOwnerCookie } }, env);
    expect(histRes.status).toBe(200);
    const hist = (await histRes.json()) as any[];
    expect(hist.length).toBe(1);
    expect(hist[0].newAt).toBe('2026-12-18T11:00:00.000Z');

    const caseAfter = (await (
      await app.request(`/api/v1/cases/${firmDCaseId}`, { headers: { Cookie: firmDOwnerCookie } }, env)
    ).json()) as any;
    expect(caseAfter.nextHearingAt).toBe('2026-12-18T11:00:00.000Z');
  });

  it('17. Full accounts suite: fee agreements, payment idempotency, client expenses, and chamber advances/settlements', async () => {
    // Fee agreement -> revise
    const agrRes = await app.request(
      '/api/v1/fee-agreements',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: firmDOwnerCookie },
        body: JSON.stringify({
          clientId: firmDClientId,
          caseId: firmDCaseId,
          feeType: 'fixed',
          agreedAmountBdt: 50000,
          agreementDate: '2026-11-11',
        }),
      },
      env
    );
    expect(agrRes.status).toBe(201);
    const agr = (await agrRes.json()) as any;
    expect(agr.agreedAmountPaisa).toBe(5000000);

    // Fee payment with idempotency key deduplication
    const payPayload = {
      feeAgreementId: agr.id,
      paymentDate: '2026-11-11',
      amountPaisa: 2000000,
      method: 'bkash',
      purposeNote: 'First milestone payment',
      idempotencyKey: 'idem-firm-d-pay-001',
    };
    const pay1 = await app.request(
      '/api/v1/fee-payments',
      { method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: firmDOwnerCookie }, body: JSON.stringify(payPayload) },
      env
    );
    expect(pay1.status).toBe(201);
    const p1Body = (await pay1.json()) as any;

    const pay2 = await app.request(
      '/api/v1/fee-payments',
      { method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: firmDOwnerCookie }, body: JSON.stringify(payPayload) },
      env
    );
    expect(pay2.status).toBe(200);
    expect(((await pay2.json()) as any).id).toBe(p1Body.id);

    // Client expense
    const expCats = (await (
      await app.request('/api/v1/expenses/categories', { headers: { Cookie: firmDOwnerCookie } }, env)
    ).json()) as any[];
    expect(expCats.length).toBeGreaterThanOrEqual(4);

    const expRes = await app.request(
      '/api/v1/expenses',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: firmDOwnerCookie },
        body: JSON.stringify({
          clientId: firmDClientId,
          caseId: firmDCaseId,
          categoryId: expCats[0].id,
          expenseDate: '2026-11-11',
          amountPaisa: 150000,
          description: 'Court filing stamp',
        }),
      },
      env
    );
    expect(expRes.status).toBe(201);

    // Chamber advance + partial settlement + chamber overhead summary
    const advRes = await app.request(
      '/api/v1/chamber-expenses/advances',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: firmDOwnerCookie },
        body: JSON.stringify({
          givenTo: 'Clerk Rahim',
          amountPaisa: 500000,
          givenDate: '2026-11-11',
          purpose: 'High Court taidad float',
          paymentMethod: 'cash',
        }),
      },
      env
    );
    expect(advRes.status).toBe(201);
    const advId = ((await advRes.json()) as any).id;

    const settleRes = await app.request(
      `/api/v1/chamber-expenses/advances/${advId}/settle`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: firmDOwnerCookie },
        body: JSON.stringify({ type: 'refund', amountPaisa: 500000, settledDate: '2026-11-11' }),
      },
      env
    );
    expect(settleRes.status).toBe(201);

    const advDetailRes = await app.request(`/api/v1/chamber-expenses/advances/${advId}`, { headers: { Cookie: firmDOwnerCookie } }, env);
    expect(advDetailRes.status).toBe(200);
    expect(((await advDetailRes.json()) as any).status).toBe('settled');

    const acctSummary = (await (
      await app.request('/api/v1/accounts/summary', { headers: { Cookie: firmDOwnerCookie } }, env)
    ).json()) as any;
    expect(acctSummary.totalAgreedPaisa).toBe(5000000);
    expect(acctSummary.totalPaidPaisa).toBe(2000000);
    expect(acctSummary.balancePaisa).toBe(3000000);
    expect(acctSummary.totalExpensesPaisa).toBe(150000);
  });

  it('18. Platform Admin plans, firm suspend/reactivate, renew, billing payment, and admin audit', async () => {
    // Plans create -> list -> patch
    const createPlanRes = await app.request(
      '/api/admin/plans',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: adminCookie },
        body: JSON.stringify({
          id: 'chamber',
          name: 'Chamber Standard',
          priceBdt: 3000,
          includedUsers: 5,
          includedDevices: 5,
          extraUserPriceBdt: 500,
          extraDevicePriceBdt: 300,
        }),
      },
      env
    );
    expect(createPlanRes.status).toBe(201);

    const plansRes = await app.request('/api/admin/plans', { headers: { Cookie: adminCookie } }, env);
    expect(plansRes.status).toBe(200);
    expect(((await plansRes.json()) as any).plans.length).toBeGreaterThanOrEqual(1);

    // Firm detail -> update -> suspend -> reactivate -> renew -> record payment
    const detailRes = await app.request(`/api/admin/firms/${firmDId}`, { headers: { Cookie: adminCookie } }, env);
    expect(detailRes.status).toBe(200);

    const suspendRes = await app.request(
      `/api/admin/firms/${firmDId}/suspend`,
      { method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: adminCookie }, body: JSON.stringify({ reason: 'Manual review' }) },
      env
    );
    expect(suspendRes.status).toBe(200);

    const reactivateRes = await app.request(
      `/api/admin/firms/${firmDId}/reactivate`,
      { method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: adminCookie }, body: JSON.stringify({ reason: 'Verified' }) },
      env
    );
    expect(reactivateRes.status).toBe(200);

    const renewRes = await app.request(
      `/api/admin/firms/${firmDId}/renew`,
      { method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: adminCookie }, body: JSON.stringify({ months: 1 }) },
      env
    );
    expect(renewRes.status).toBe(200);

    const bPayRes = await app.request(
      `/api/admin/firms/${firmDId}/payments`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: adminCookie },
        body: JSON.stringify({ amount: 3000, method: 'bkash', txnId: 'TRX9988', note: 'Monthly renewal' }),
      },
      env
    );
    expect(bPayRes.status).toBe(201);

    const adminAuditRes = await app.request('/api/admin/audit', { headers: { Cookie: adminCookie } }, env);
    expect(adminAuditRes.status).toBe(200);
    expect(((await adminAuditRes.json()) as any).logs.length).toBeGreaterThanOrEqual(5);
  });
});
