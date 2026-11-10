import { describe, it, expect, beforeAll } from 'vitest';
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
  });
});
