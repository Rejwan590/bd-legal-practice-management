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
    expect(data.firm.trialPriceBdt).toBe(0);
    expect(data.owner.email).toBe(ownerEmail);
    expect(data.ownerUser.email).toBe(ownerEmail);
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
    expect(data.user.active).toBe(true);
    expect(data.user.permissions).toContain('cases.view');
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

    // Verify CasesScreen wildcard filter query (?status=all&court=ALL&scope=all) returns the created case
    const listAllRes = await app.request(
      '/api/v1/cases?status=all&court=ALL&scope=all',
      { headers: { Cookie: ownerCookie } },
      env
    );
    expect(listAllRes.status).toBe(200);
    const listAllData = (await listAllRes.json()) as any[];
    expect(listAllData.some((c) => c.id === caseAId)).toBe(true);
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

  it('19. CORS allows Cloudflare Pages origin and preview subdomains while rejecting untrusted Pages origins', async () => {
    const prodRes = await app.request(
      '/api/v1/health',
      { method: 'OPTIONS', headers: { Origin: 'https://bdlegal-app.pages.dev' } },
      env
    );
    expect(prodRes.headers.get('access-control-allow-origin')).toBe('https://bdlegal-app.pages.dev');

    const previewRes = await app.request(
      '/api/v1/health',
      { method: 'OPTIONS', headers: { Origin: 'https://abc123.bdlegal-app.pages.dev' } },
      env
    );
    expect(previewRes.headers.get('access-control-allow-origin')).toBe('https://abc123.bdlegal-app.pages.dev');

    const evilRes = await app.request(
      '/api/v1/health',
      { method: 'OPTIONS', headers: { Origin: 'https://evil.pages.dev' } },
      env
    );
    expect(evilRes.headers.get('access-control-allow-origin')).toBeNull();
  });

  it('20. Custom paid trial fee (trialPriceBdt) and { days } extend-trial parity on Cloudflare D1', async () => {
    const createRes = await app.request(
      '/api/admin/firms',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: adminCookie },
        body: JSON.stringify({
          name: 'Paid Trial Cloudflare Chamber',
          ownerName: 'Advocate Paid CF',
          ownerEmail: 'paid-trial-cf@chamber.bd',
          planId: 'chamber',
          licenseType: 'trial',
          trialDays: 14,
          trialPriceBdt: 500,
        }),
      },
      env
    );
    expect(createRes.status).toBe(201);
    const created = (await createRes.json()) as any;
    expect(created.firm.trialPriceBdt).toBe(500);
    expect(created.ownerUser.email).toBe('paid-trial-cf@chamber.bd');

    const getRes = await app.request(`/api/admin/firms/${created.firm.id}`, { headers: { Cookie: adminCookie } }, env);
    expect(getRes.status).toBe(200);
    const detail = (await getRes.json()) as any;
    expect(detail.monthlyPriceBdt).toBe(500);
    expect(detail.license.trialPriceBdt).toBe(500);

    const updateRes = await app.request(
      `/api/admin/firms/${created.firm.id}/license`,
      {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Cookie: adminCookie },
        body: JSON.stringify({ trialPriceBdt: 900 }),
      },
      env
    );
    expect(updateRes.status).toBe(200);
    const updated = (await updateRes.json()) as any;
    expect(updated.firm.trialPriceBdt).toBe(900);

    const extendRes = await app.request(
      `/api/admin/firms/${created.firm.id}/extend-trial`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: adminCookie },
        body: JSON.stringify({ days: 7 }),
      },
      env
    );
    expect(extendRes.status).toBe(200);
    const extended = (await extendRes.json()) as any;
    expect(extended.firm.trialDays).toBe(21);
  });

  it('21. POST & PATCH /api/v1/cases/:id persist counsel fields and accept nullable optional fields when changing status', async () => {
    const createRes = await app.request(
      '/api/v1/cases',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: firmDOwnerCookie },
        body: JSON.stringify({
          clientId: firmDClientId,
          responsibleLawyerId: null,
          fileSerial: 'F-2026-9901',
          caseNumber: 'Title Suit 99/2026',
          court: 'Dhaka District & Sessions Judge Court',
          matterType: 'Civil / Land Title Partition Suit',
          description: null,
          caseCategory: 'civil',
          caseDate: null,
          closedOn: null,
          plaintiff: 'Side A Test',
          defendant: 'Side B Test',
          ourRole: 'Plaintiff',
          plaintiffLawyer: 'Advocate Plaintiff',
          defendantLawyer: null,
          status: 'ongoing',
          restricted: false,
        }),
      },
      env
    );
    expect(createRes.status).toBe(201);
    const created = (await createRes.json()) as any;
    expect(created.plaintiffLawyer).toBe('Advocate Plaintiff');
    expect(created.defendantLawyer).toBeNull();
    expect(created.responsibleLawyerId).toBeNull();
    expect(created.caseDate).toBeNull();

    const patchRes = await app.request(
      `/api/v1/cases/${created.id}`,
      {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Cookie: firmDOwnerCookie },
        body: JSON.stringify({
          responsibleLawyerId: null,
          caseDate: null,
          description: null,
          plaintiffLawyer: 'Advocate Plaintiff Updated',
          defendantLawyer: 'Advocate Defendant',
          status: 'closed',
          closedOn: '2026-11-11',
        }),
      },
      env
    );
    expect(patchRes.status).toBe(200);
    const updated = (await patchRes.json()) as any;
    expect(updated.status).toBe('closed');
    expect(updated.closedOn).toBe('2026-11-11');
    expect(updated.plaintiffLawyer).toBe('Advocate Plaintiff Updated');
    expect(updated.defendantLawyer).toBe('Advocate Defendant');
    expect(updated.responsibleLawyerId).toBeNull();
  });

  it('22. Phase 8 Physical File Tracking & Custody lifecycle on Cloudflare Workers + D1', async () => {
    const db = getDb(mockD1);
    const [firmUser] = await db
      .select()
      .from(schema.users)
      .where(eq(schema.users.firmId, firmDId))
      .limit(1);

    // Expired Firm A still gets 403 SUBSCRIPTION_READ_ONLY on write, while read succeeds
    const expiredCreateRes = await app.request(
      '/api/v1/physical-files',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: ownerCookie },
        body: JSON.stringify({ title: 'Blocked File' }),
      },
      env
    );
    expect(expiredCreateRes.status).toBe(403);

    // Next serial preview starts at F-000101 for active Firm D
    const nextRes1 = await app.request(
      '/api/v1/physical-files/next-serial',
      { headers: { Cookie: firmDOwnerCookie } },
      env
    );
    expect(nextRes1.status).toBe(200);
    expect(((await nextRes1.json()) as any).serial).toBe('F-000101');

    // Create physical file linked to Firm D Case D
    const createRes = await app.request(
      '/api/v1/physical-files',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: firmDOwnerCookie },
        body: JSON.stringify({
          title: 'Writ Dossier Bundle Vol-I',
          caseId: firmDCaseId,
          shelfLocation: 'Rack 1, Shelf A',
          notes: 'Original annexures inside',
        }),
      },
      env
    );
    expect(createRes.status).toBe(201);
    const createdFile = (await createRes.json()) as any;
    expect(createdFile.serial).toBe('F-000101');
    expect(createdFile.status).toBe('in_chamber');
    expect(createdFile.clientId).toBe(firmDClientId);

    // Duplicate serial is rejected with 409 Conflict
    const dupRes = await app.request(
      '/api/v1/physical-files',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: firmDOwnerCookie },
        body: JSON.stringify({ title: 'Dup Serial', serial: 'F-000101' }),
      },
      env
    );
    expect(dupRes.status).toBe(409);

    // Check-out file
    const dueIso = new Date(Date.now() + 86400000 * 2).toISOString();
    const outRes = await app.request(
      `/api/v1/physical-files/${createdFile.id}/check-out`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: firmDOwnerCookie },
        body: JSON.stringify({ holderId: firmUser.id, dueBackAt: dueIso, note: 'Drafting submission' }),
      },
      env
    );
    expect(outRes.status).toBe(200);
    const outJson = (await outRes.json()) as any;
    expect(outJson.file.status).toBe('checked_out');
    expect(outJson.file.currentHolderId).toBe(firmUser.id);
    expect(outJson.movement.action).toBe('CHECKOUT');

    // Client overview and case counts now reflect physical file
    const overviewRes = await app.request(
      `/api/v1/clients/${firmDClientId}/overview`,
      { headers: { Cookie: firmDOwnerCookie } },
      env
    );
    expect(overviewRes.status).toBe(200);
    const overview = (await overviewRes.json()) as any;
    expect(overview.files.some((f: any) => f.id === createdFile.id && f.status === 'checked_out')).toBe(true);

    const countsRes = await app.request(
      `/api/v1/cases/${firmDCaseId}/counts`,
      { headers: { Cookie: firmDOwnerCookie } },
      env
    );
    expect(countsRes.status).toBe(200);
    expect(((await countsRes.json()) as any).filesCount).toBe(1);

    // Dispatch to court & Check-in
    const dispatchRes = await app.request(
      `/api/v1/physical-files/${createdFile.id}/dispatch-court`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: firmDOwnerCookie },
        body: JSON.stringify({
          courtName: 'High Court Annex 5',
          holderId: firmUser.id,
          dueBackAt: dueIso,
        }),
      },
      env
    );
    expect(dispatchRes.status).toBe(200);
    expect(((await dispatchRes.json()) as any).file.status).toBe('in_court');

    const inRes = await app.request(
      `/api/v1/physical-files/${createdFile.id}/check-in`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: firmDOwnerCookie },
        body: JSON.stringify({ shelfLocation: 'Rack 2, Shelf C', note: 'Returned intact' }),
      },
      env
    );
    expect(inRes.status).toBe(200);
    const inJson = (await inRes.json()) as any;
    expect(inJson.file.status).toBe('in_chamber');
    expect(inJson.file.currentHolderId).toBeNull();
    expect(inJson.file.shelfLocation).toBe('Rack 2, Shelf C');

    // Movements timeline
    const movRes = await app.request(
      `/api/v1/physical-files/${createdFile.id}/movements`,
      { headers: { Cookie: firmDOwnerCookie } },
      env
    );
    expect(movRes.status).toBe(200);
    const movements = (await movRes.json()) as any[];
    expect(movements.length).toBe(3);

    // Lookup by serial
    const serialLookup = await app.request(
      '/api/v1/physical-files/by-serial/F-000101',
      { headers: { Cookie: firmDOwnerCookie } },
      env
    );
    expect(serialLookup.status).toBe(200);

    // Multi-tenant isolation: expired/other firm A cannot read Firm D physical file
    const crossFirmGet = await app.request(
      `/api/v1/physical-files/${createdFile.id}`,
      { headers: { Cookie: ownerCookie } },
      env
    );
    expect(crossFirmGet.status).toBe(404);

    // Soft delete
    const delRes = await app.request(
      `/api/v1/physical-files/${createdFile.id}`,
      { method: 'DELETE', headers: { Cookie: firmDOwnerCookie } },
      env
    );
    expect(delRes.status).toBe(200);

    const afterDel = await app.request(
      `/api/v1/physical-files/${createdFile.id}`,
      { headers: { Cookie: firmDOwnerCookie } },
      env
    );
    expect(afterDel.status).toBe(404);
  });

  it('23. Unified Matters Billing Ledger: Case 88/90, Client Dossier & Main Billing parity, balances, edits, idempotency, visibility & firm isolation', async () => {
    // Provision Case 88/90 ("Civil / Land Title Partition Suit") under Firm D client
    const case88Res = await app.request(
      '/api/v1/cases',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: firmDOwnerCookie },
        body: JSON.stringify({
          clientId: firmDClientId,
          caseNumber: '88/90',
          court: 'Joint District Judge Court, Dhaka',
          matterType: 'Civil / Land Title Partition Suit',
          plaintiff: 'Padma Textiles Ltd',
          defendant: 'Sharif Estate Co-Sharers',
          status: 'ongoing',
          isRestricted: true,
        }),
      },
      env
    );
    expect(case88Res.status).toBe(201);
    const case88 = (await case88Res.json()) as any;
    expect(case88.caseNumber).toBe('88/90');
    expect(case88.matterType).toBe('Civil / Land Title Partition Suit');

    // 1) Create AgreementRecord for Case 88/90 + a client-level AgreementRecord (no caseId)
    const agrCaseRes = await app.request(
      '/api/v1/fee-agreements',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: firmDOwnerCookie },
        body: JSON.stringify({
          clientId: firmDClientId,
          caseId: case88.id,
          feeType: 'fixed',
          agreedAmountPaisa: 12000000, // BDT 120,000
          agreementDate: '2026-11-11',
          notes: 'Full partition suit representation up to preliminary decree',
        }),
      },
      env
    );
    expect(agrCaseRes.status).toBe(201);
    const agrCase = (await agrCaseRes.json()) as any;
    expect(agrCase.caseNumber).toBe('88/90');
    expect(agrCase.caseTitle).toBe('Civil / Land Title Partition Suit');
    expect(agrCase.outstandingPaisa).toBe(12000000);
    expect(agrCase.paidPaisa).toBe(0);

    const agrClientRes = await app.request(
      '/api/v1/fee-agreements',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: firmDOwnerCookie },
        body: JSON.stringify({
          clientId: firmDClientId,
          caseId: null,
          feeType: 'retainer',
          agreedAmountPaisa: 3000000, // BDT 30,000 client retainer
          agreementDate: '2026-11-11',
          notes: 'General client advisory retainer',
        }),
      },
      env
    );
    expect(agrClientRes.status).toBe(201);
    const agrClient = (await agrClientRes.json()) as any;
    expect(agrClient.caseId).toBeNull();

    // 2) Record PaymentRecord with idempotency key (no duplicates on retry)
    const payRes1 = await app.request(
      '/api/v1/fee-payments',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: firmDOwnerCookie },
        body: JSON.stringify({
          feeAgreementId: agrCase.id,
          paymentDate: '2026-11-11',
          amountPaisa: 4500000, // BDT 45,000
          method: 'bank',
          reference: 'DBBL-TXN-8890',
          purposeNote: 'Advance retainer for Title Suit 88/90',
          idempotencyKey: 'idem-case-88-90-pay-1',
        }),
      },
      env
    );
    expect(payRes1.status).toBe(201);
    const pay1 = (await payRes1.json()) as any;
    expect(pay1.caseId).toBe(case88.id);
    expect(pay1.clientId).toBe(firmDClientId);
    expect(pay1.caseNumber).toBe('88/90');
    expect(pay1.receiptNumber).toMatch(/^REC-\d{4}-\d{5}$/);

    // Duplicate retry returns same record without creating a second payment
    const payResDup = await app.request(
      '/api/v1/fee-payments',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: firmDOwnerCookie },
        body: JSON.stringify({
          feeAgreementId: agrCase.id,
          paymentDate: '2026-11-11',
          amountPaisa: 4500000,
          method: 'bank',
          reference: 'DBBL-TXN-8890',
          purposeNote: 'Advance retainer for Title Suit 88/90',
          idempotencyKey: 'idem-case-88-90-pay-1',
        }),
      },
      env
    );
    expect(payResDup.status).toBe(200);
    const payDup = (await payResDup.json()) as any;
    expect(payDup.id).toBe(pay1.id);
    expect(payDup.receiptNumber).toBe(pay1.receiptNumber);

    // Client/case mismatch on payment rejected
    const badPayRes = await app.request(
      '/api/v1/fee-payments',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: firmDOwnerCookie },
        body: JSON.stringify({
          feeAgreementId: agrCase.id,
          caseId: firmDCaseId, // Wrong case
          paymentDate: '2026-11-11',
          amountPaisa: 500000,
          method: 'cash',
          purposeNote: 'Mismatched case check',
          idempotencyKey: 'idem-mismatch-88-90',
        }),
      },
      env
    );
    expect(badPayRes.status).toBe(400);

    // 3) Create and Edit ExpenseRecord on Case 88/90
    const expCats = (await (
      await app.request('/api/v1/expenses/categories', { headers: { Cookie: firmDOwnerCookie } }, env)
    ).json()) as any[];
    const expCreateRes = await app.request(
      '/api/v1/expenses',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: firmDOwnerCookie },
        body: JSON.stringify({
          clientId: firmDClientId,
          caseId: case88.id,
          categoryId: expCats[0].id,
          expenseDate: '2026-11-11',
          amountPaisa: 220000, // BDT 2,200
          description: 'Amin survey commissioner fee for 88/90',
          reimbursable: true,
        }),
      },
      env
    );
    expect(expCreateRes.status).toBe(201);
    const expCreated = (await expCreateRes.json()) as any;
    expect(expCreated.caseNumber).toBe('88/90');
    expect(expCreated.amountPaisa).toBe(220000);

    const expPatchRes = await app.request(
      `/api/v1/expenses/${expCreated.id}`,
      {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Cookie: firmDOwnerCookie },
        body: JSON.stringify({
          amountPaisa: 250000,
          description: 'Amin survey commissioner fee + trace map copy',
        }),
      },
      env
    );
    expect(expPatchRes.status).toBe(200);
    const expEdited = (await expPatchRes.json()) as any;
    expect(expEdited.amountPaisa).toBe(250000);
    expect(expEdited.description).toBe('Amin survey commissioner fee + trace map copy');

    // 4) Edit Agreement via PATCH (with mandatory revisionReason for amount change -> audit + changes log)
    const agrPatchNoReason = await app.request(
      `/api/v1/fee-agreements/${agrCase.id}`,
      {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Cookie: firmDOwnerCookie },
        body: JSON.stringify({ agreedAmountPaisa: 13500000 }),
      },
      env
    );
    expect(agrPatchNoReason.status).toBe(400);

    const agrPatchOk = await app.request(
      `/api/v1/fee-agreements/${agrCase.id}`,
      {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Cookie: firmDOwnerCookie },
        body: JSON.stringify({
          agreedAmountPaisa: 13500000,
          revisionReason: 'Added local commission and demarcation hearings',
          notes: 'Full partition suit including commission report objection',
        }),
      },
      env
    );
    expect(agrPatchOk.status).toBe(200);
    const agrUpdated = (await agrPatchOk.json()) as any;
    expect(agrUpdated.agreedAmountPaisa).toBe(13500000);
    expect(agrUpdated.paidPaisa).toBe(4500000);
    expect(agrUpdated.outstandingPaisa).toBe(9000000);

    const changesRes = await app.request(
      `/api/v1/fee-agreements/${agrCase.id}/changes`,
      { headers: { Cookie: firmDOwnerCookie } },
      env
    );
    expect(changesRes.status).toBe(200);
    const changes = (await changesRes.json()) as any[];
    expect(changes.length).toBe(1);
    expect(changes[0].oldAmountPaisa).toBe(12000000);
    expect(changes[0].newAmountPaisa).toBe(13500000);

    // 5) Main Billing Ledger, Client Dossier & Case 88/90 Dossier return exact same record IDs without duplication
    const [firmAgs, clientAgs, caseAgs, firmPays, clientPays, casePays, firmExps, clientExps, caseExps, caseBalRes] =
      await Promise.all([
        app.request('/api/v1/fee-agreements?search=88/90', { headers: { Cookie: firmDOwnerCookie } }, env).then((r) => r.json()) as Promise<any[]>,
        app.request(`/api/v1/fee-agreements?clientId=${firmDClientId}`, { headers: { Cookie: firmDOwnerCookie } }, env).then((r) => r.json()) as Promise<any[]>,
        app.request(`/api/v1/fee-agreements?caseId=${case88.id}`, { headers: { Cookie: firmDOwnerCookie } }, env).then((r) => r.json()) as Promise<any[]>,
        app.request('/api/v1/fee-payments?search=DBBL-TXN-8890', { headers: { Cookie: firmDOwnerCookie } }, env).then((r) => r.json()) as Promise<any[]>,
        app.request(`/api/v1/fee-payments?clientId=${firmDClientId}`, { headers: { Cookie: firmDOwnerCookie } }, env).then((r) => r.json()) as Promise<any[]>,
        app.request(`/api/v1/fee-payments?caseId=${case88.id}`, { headers: { Cookie: firmDOwnerCookie } }, env).then((r) => r.json()) as Promise<any[]>,
        app.request('/api/v1/expenses?search=Amin', { headers: { Cookie: firmDOwnerCookie } }, env).then((r) => r.json()) as Promise<any[]>,
        app.request(`/api/v1/expenses?clientId=${firmDClientId}`, { headers: { Cookie: firmDOwnerCookie } }, env).then((r) => r.json()) as Promise<any[]>,
        app.request(`/api/v1/expenses?caseId=${case88.id}`, { headers: { Cookie: firmDOwnerCookie } }, env).then((r) => r.json()) as Promise<any[]>,
        app.request('/api/v1/accounts/case-balances', { headers: { Cookie: firmDOwnerCookie } }, env).then((r) => r.json()) as Promise<any[]>,
      ]);

    expect(firmAgs.map((a) => a.id)).toEqual([agrCase.id]);
    expect(caseAgs.map((a) => a.id)).toEqual([agrCase.id]);
    expect(clientAgs.some((a) => a.id === agrCase.id) && clientAgs.some((a) => a.id === agrClient.id)).toBe(true);

    expect(firmPays.map((p) => p.id)).toEqual([pay1.id]);
    expect(casePays.map((p) => p.id)).toEqual([pay1.id]);
    expect(clientPays.some((p) => p.id === pay1.id)).toBe(true);
    // Only 1 payment matching idempotencyKey exists
    expect(casePays.filter((p) => p.idempotencyKey === 'idem-case-88-90-pay-1').length).toBe(1);

    expect(firmExps.map((e) => e.id)).toEqual([expCreated.id]);
    expect(caseExps.map((e) => e.id)).toEqual([expCreated.id]);
    expect(clientExps.some((e) => e.id === expCreated.id)).toBe(true);

    const case88Bal = caseBalRes.find((b) => b.caseId === case88.id);
    expect(case88Bal).toBeDefined();
    expect(case88Bal.caseNumber).toBe('88/90');
    expect(case88Bal.totalAgreedPaisa).toBe(13500000);
    expect(case88Bal.totalPaidPaisa).toBe(4500000);
    expect(case88Bal.totalExpensesPaisa).toBe(250000);
    expect(case88Bal.outstandingPaisa).toBe(9000000);

    // 6) Voiding Payment preserves historical payment row (immutable amount/receipt) & restores balance
    const voidPayRes = await app.request(
      `/api/v1/fee-payments/${pay1.id}/void`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: firmDOwnerCookie },
        body: JSON.stringify({ reason: 'Cheque dishonored' }),
      },
      env
    );
    expect(voidPayRes.status).toBe(200);
    const voidedPay = (await voidPayRes.json()) as any;
    expect(voidedPay.status).toBe('void');
    expect(voidedPay.amountPaisa).toBe(4500000);
    expect(voidedPay.receiptNumber).toBe(pay1.receiptNumber);

    const agrAfterVoidPay = (await (
      await app.request(`/api/v1/fee-agreements/${agrCase.id}`, { headers: { Cookie: firmDOwnerCookie } }, env)
    ).json()) as any;
    expect(agrAfterVoidPay.paidPaisa).toBe(0);
    expect(agrAfterVoidPay.outstandingPaisa).toBe(13500000);

    // 7) Cross-firm isolation & expired-subscription read-only check:
    // Firm A owner cannot view Firm D Case 88/90 billing records (404), and Firm A reads still work (200) while writes are blocked (403 READ_ONLY_MODE)
    expect((await app.request(`/api/v1/fee-agreements/${agrCase.id}`, { headers: { Cookie: ownerCookie } }, env)).status).toBe(404);
    expect((await app.request(`/api/v1/fee-payments/${pay1.id}`, { headers: { Cookie: ownerCookie } }, env)).status).toBe(404);
    expect((await app.request(`/api/v1/expenses/${expCreated.id}`, { headers: { Cookie: ownerCookie } }, env)).status).toBe(404);

    const firmAListRes = await app.request('/api/v1/fee-payments', { headers: { Cookie: ownerCookie } }, env);
    expect(firmAListRes.status).toBe(200);
    const firmAPays = (await firmAListRes.json()) as any[];
    expect(firmAPays.some((p) => p.id === pay1.id)).toBe(false);

    const readOnlyWriteRes = await app.request(
      `/api/v1/expenses/${expCreated.id}`,
      { method: 'PATCH', headers: { 'Content-Type': 'application/json', Cookie: ownerCookie }, body: JSON.stringify({ description: 'Hacked' }) },
      env
    );
    expect(readOnlyWriteRes.status).toBe(403);

    // 8) Central visibility + Permissions:
    // Staff without billing perms gets 403
    expect((await app.request('/api/v1/fee-agreements', { headers: { Cookie: juniorCookie } }, env)).status).toBe(403);

    // Provision a staff member with billing.view (no billing.manage, no restricted.view)
    const billViewerRes = await app.request(
      '/api/v1/users',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: firmDOwnerCookie },
        body: JSON.stringify({
          name: 'Accounts Clerk',
          email: 'accounts.clerk@chamber-d.com',
          jobType: 'clerk',
          jobTitleLabel: 'Accounts Clerk',
          permissions: ['cases.view', 'clients.view', 'billing.view'],
        }),
      },
      env
    );
    expect(billViewerRes.status).toBe(201);
    const bvJson = (await billViewerRes.json()) as any;
    const bvLoginRes = await app.request(
      '/api/v1/auth/login',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'accounts.clerk@chamber-d.com', password: bvJson.temporaryPassword }),
      },
      env
    );
    const bvCookie = bvLoginRes.headers.get('set-cookie')!.split(';')[0];

    // Restricted Case 88/90 billing records are hidden from staff without restricted.view, while client-level agreement is visible
    const bvAgs = (await (
      await app.request(`/api/v1/fee-agreements?clientId=${firmDClientId}`, { headers: { Cookie: bvCookie } }, env)
    ).json()) as any[];
    expect(bvAgs.some((a) => a.id === agrCase.id)).toBe(false);
    expect(bvAgs.some((a) => a.id === agrClient.id)).toBe(true);
    expect((await app.request(`/api/v1/fee-agreements/${agrCase.id}`, { headers: { Cookie: bvCookie } }, env)).status).toBe(404);

    // Staff with only billing.view gets 403 on writes
    const bvWriteRes = await app.request(
      '/api/v1/fee-agreements',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: bvCookie },
        body: JSON.stringify({
          clientId: firmDClientId,
          caseId: null,
          feeType: 'fixed',
          agreedAmountPaisa: 100000,
          agreementDate: '2026-11-11',
        }),
      },
      env
    );
    expect(bvWriteRes.status).toBe(403);
  });

  it('24. Phase 9 Calendar Aggregation, Cause List (Asia/Dhaka) & Automated Reminders lifecycle on Cloudflare Workers + D1', async () => {
    // 1) Create a normal case assigned to juniorUserId and a restricted case visible only to Owner
    const normalCaseRes = await app.request(
      '/api/v1/cases',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: firmDOwnerCookie },
        body: JSON.stringify({
          clientId: firmDClientId,
          fileSerial: 'F-P9-001',
          caseNumber: 'Phase9 Civil 101/2026',
          court: 'Dhaka District Judge Court',
          matterType: 'Civil Suit',
          responsibleLawyerId: juniorUserId,
          restricted: false,
        }),
      },
      env
    );
    expect(normalCaseRes.status).toBe(201);
    const p9NormalCase = (await normalCaseRes.json()) as any;

    const secretCaseRes = await app.request(
      '/api/v1/cases',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: firmDOwnerCookie },
        body: JSON.stringify({
          clientId: firmDClientId,
          fileSerial: 'F-P9-SEC-001',
          caseNumber: 'Phase9 Secret Writ 77/2026',
          court: 'High Court Division',
          matterType: 'Writ',
          restricted: true,
        }),
      },
      env
    );
    expect(secretCaseRes.status).toBe(201);
    const p9SecretCase = (await secretCaseRes.json()) as any;

    // 2) Create hearing (<24h so due), Dhaka-midnight hearing (18:30Z -> next Dhaka day), restricted hearing, task (<2h), file checkout (<4h), appointment
    const in12hIso = new Date(Date.now() + 12 * 3600 * 1000).toISOString();
    const h1 = (await (
      await app.request(
        '/api/v1/hearings',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Cookie: firmDOwnerCookie },
          body: JSON.stringify({
            caseId: p9NormalCase.id,
            scheduledAt: in12hIso,
            purpose: 'Injunction Argument',
            appearingLawyerId: juniorUserId,
          }),
        },
        env
      )
    ).json()) as any;

    const hMidnightRes = await app.request(
      '/api/v1/hearings',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: firmDOwnerCookie },
        body: JSON.stringify({
          caseId: p9NormalCase.id,
          scheduledAt: '2026-12-20T18:30:00.000Z',
          purpose: 'Midnight Dhaka Cause List Check',
          appearingLawyerId: juniorUserId,
        }),
      },
      env
    );
    expect(hMidnightRes.status).toBe(201);

    const hSecret = (await (
      await app.request(
        '/api/v1/hearings',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Cookie: firmDOwnerCookie },
          body: JSON.stringify({
            caseId: p9SecretCase.id,
            scheduledAt: in12hIso,
            purpose: 'Restricted Chamber Motion',
          }),
        },
        env
      )
    ).json()) as any;

    const t1 = (await (
      await app.request(
        '/api/v1/tasks',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Cookie: firmDOwnerCookie },
          body: JSON.stringify({
            title: 'Compile Paperbook Phase 9',
            caseId: p9NormalCase.id,
            clientId: firmDClientId,
            assignedTo: juniorUserId,
            dueAt: new Date(Date.now() + 90 * 60 * 1000).toISOString(),
            priority: 'high',
          }),
        },
        env
      )
    ).json()) as any;

    const f1 = (await (
      await app.request(
        '/api/v1/physical-files',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Cookie: firmDOwnerCookie },
          body: JSON.stringify({
            title: 'Phase 9 Original Brief',
            caseId: p9NormalCase.id,
            clientId: firmDClientId,
            shelfLocation: 'Rack-D9',
          }),
        },
        env
      )
    ).json()) as any;

    const checkoutRes = await app.request(
      `/api/v1/physical-files/${f1.id}/check-out`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: firmDOwnerCookie },
        body: JSON.stringify({
          holderId: juniorUserId,
          dueBackAt: new Date(Date.now() + 2 * 3600 * 1000).toISOString(),
        }),
      },
      env
    );
    expect(checkoutRes.status).toBe(200);

    const apptRes = await app.request(
      '/api/v1/appointments',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: firmDOwnerCookie },
        body: JSON.stringify({
          title: 'Phase 9 Client Consultation',
          startsAt: new Date(Date.now() + 3 * 3600 * 1000).toISOString(),
          endsAt: new Date(Date.now() + 4 * 3600 * 1000).toISOString(),
          caseId: p9NormalCase.id,
          clientId: firmDClientId,
          reminderMinutesBefore: 30,
        }),
      },
      env
    );
    expect(apptRes.status).toBe(201);
    const appt1 = (await apptRes.json()) as any;

    // 3) Sync reminders and verify due alerts + counts
    const syncRes = await app.request('/api/v1/reminders/sync', { method: 'POST', headers: { Cookie: firmDOwnerCookie } }, env);
    expect(syncRes.status).toBe(200);
    const syncJson = (await syncRes.json()) as any;
    expect(syncJson.createdCount).toBeGreaterThanOrEqual(3);

    const ownerDue = (await (
      await app.request('/api/v1/reminders/due', { headers: { Cookie: firmDOwnerCookie } }, env)
    ).json()) as any[];
    expect(ownerDue.some((r) => r.sourceId === h1.id)).toBe(true);
    expect(ownerDue.some((r) => r.sourceId === t1.id)).toBe(true);
    expect(ownerDue.some((r) => r.sourceId === f1.id)).toBe(true);
    expect(ownerDue.some((r) => r.sourceId === hSecret.id)).toBe(true);

    // 4) Staff partitioning + restricted visibility check + cross-staff dismiss 403
    const juniorList = (await (
      await app.request('/api/v1/reminders?status=active', { headers: { Cookie: juniorCookie } }, env)
    ).json()) as any[];
    expect(juniorList.every((r) => r.userId === juniorUserId)).toBe(true);
    expect(juniorList.some((r) => r.sourceId === hSecret.id)).toBe(false);

    const ownerOnlyRem = ownerDue.find((r) => r.sourceId === hSecret.id || r.sourceId === appt1.id)!;
    const crossStaffDismiss = await app.request(
      `/api/v1/reminders/${ownerOnlyRem.id}/dismiss`,
      { method: 'POST', headers: { Cookie: juniorCookie } },
      env
    );
    expect(crossStaffDismiss.status).toBe(403);

    // Case linked counts include remindersCount
    const countsBefore = (await (
      await app.request(`/api/v1/cases/${p9NormalCase.id}/counts`, { headers: { Cookie: firmDOwnerCookie } }, env)
    ).json()) as any;
    expect(countsBefore.remindersCount).toBeGreaterThanOrEqual(4);

    // 5) Calendar aggregation + cause list + Dhaka timezone + restricted isolation
    const calAll = (await (
      await app.request('/api/v1/calendar', { headers: { Cookie: firmDOwnerCookie } }, env)
    ).json()) as any[];
    expect(calAll.some((e) => e.type === 'hearing' && e.sourceId === h1.id)).toBe(true);
    expect(calAll.some((e) => e.type === 'task' && e.sourceId === t1.id)).toBe(true);
    expect(calAll.some((e) => e.type === 'file_return' && e.sourceId === f1.id)).toBe(true);
    expect(calAll.some((e) => e.type === 'appointment' && e.sourceId === appt1.id)).toBe(true);
    expect(calAll.some((e) => e.sourceId === hSecret.id)).toBe(true);

    const juniorCal = (await (
      await app.request('/api/v1/calendar', { headers: { Cookie: juniorCookie } }, env)
    ).json()) as any[];
    expect(juniorCal.some((e) => e.sourceId === hSecret.id)).toBe(false);

    const causeListRes = await app.request(
      '/api/v1/calendar/cause-list?date=2026-12-21',
      { headers: { Cookie: firmDOwnerCookie } },
      env
    );
    expect(causeListRes.status).toBe(200);
    const causeList = (await causeListRes.json()) as any;
    expect(causeList.date).toBe('2026-12-21');
    expect(causeList.firmName).toBe('Delta Legal Chambers');
    expect(causeList.hearings.some((e: any) => String(e.title).includes('Midnight Dhaka Cause List Check'))).toBe(true);

    // 6) Lifecycle cascades: adjourn -> reschedule reminder, task complete -> dismiss, file check-in -> dismiss, appt cancel -> dismiss
    const nextDateIso = new Date(Date.now() + 7 * 86400000).toISOString();
    expect(
      (
        await app.request(
          `/api/v1/hearings/${h1.id}/adjourn`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Cookie: firmDOwnerCookie },
            body: JSON.stringify({ nextDate: nextDateIso, reason: 'Adjourned for argument' }),
          },
          env
        )
      ).status
    ).toBe(200);

    const hearingRemsAfter = (await (
      await app.request('/api/v1/reminders?sourceType=hearing', { headers: { Cookie: firmDOwnerCookie } }, env)
    ).json()) as any[];
    const h1Rem = hearingRemsAfter.find((r) => r.sourceId === h1.id);
    expect(h1Rem?.dueAt).toBe(nextDateIso);

    expect(
      (await app.request(`/api/v1/tasks/${t1.id}/complete`, { method: 'POST', headers: { Cookie: juniorCookie } }, env)).status
    ).toBe(200);
    const activeTaskRems = (await (
      await app.request('/api/v1/reminders?status=active&sourceType=task', { headers: { Cookie: firmDOwnerCookie } }, env)
    ).json()) as any[];
    expect(activeTaskRems.some((r) => r.sourceId === t1.id)).toBe(false);

    expect(
      (
        await app.request(
          `/api/v1/physical-files/${f1.id}/check-in`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Cookie: firmDOwnerCookie },
            body: JSON.stringify({ shelfLocation: 'Rack-D9' }),
          },
          env
        )
      ).status
    ).toBe(200);
    const activeFileRems = (await (
      await app.request('/api/v1/reminders?status=active&sourceType=file_return', { headers: { Cookie: firmDOwnerCookie } }, env)
    ).json()) as any[];
    expect(activeFileRems.some((r) => r.sourceId === f1.id)).toBe(false);

    expect(
      (
        await app.request(
          `/api/v1/appointments/${appt1.id}`,
          {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json', Cookie: firmDOwnerCookie },
            body: JSON.stringify({ status: 'cancelled' }),
          },
          env
        )
      ).status
    ).toBe(200);
    const activeApptRems = (await (
      await app.request('/api/v1/reminders?status=active&sourceType=appointment', { headers: { Cookie: firmDOwnerCookie } }, env)
    ).json()) as any[];
    expect(activeApptRems.some((r) => r.sourceId === appt1.id)).toBe(false);

    // 7) Firm isolation & Subscription Read-Only (Firm A ownerCookie is expired from test 11)
    const firmARemList = (await (
      await app.request('/api/v1/reminders', { headers: { Cookie: ownerCookie } }, env)
    ).json()) as any[];
    expect(firmARemList.some((r) => r.sourceId === h1.id)).toBe(false);
    expect(
      (await app.request(`/api/v1/reminders/${h1Rem.id}/dismiss`, { method: 'POST', headers: { Cookie: ownerCookie } }, env)).status
    ).toBe(403); // read-only blocked first for Firm A expired subscription

    // Reads still work under read-only mode
    expect((await app.request('/api/v1/calendar', { headers: { Cookie: ownerCookie } }, env)).status).toBe(200);

    // 8) Case delete cascades to reminders
    expect(
      (await app.request(`/api/v1/cases/${p9NormalCase.id}`, { method: 'DELETE', headers: { Cookie: firmDOwnerCookie } }, env)).status
    ).toBe(200);
    const remAfterCaseDelete = (await (
      await app.request('/api/v1/reminders?status=active', { headers: { Cookie: firmDOwnerCookie } }, env)
    ).json()) as any[];
    expect(remAfterCaseDelete.some((r) => r.sourceId === h1.id)).toBe(false);
  });
});
