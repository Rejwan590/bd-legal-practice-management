process.env.JWT_SECRET = 'valid_test_secret_key_at_least_32_chars_long_1234567890';
process.env.ADMIN_JWT_SECRET = 'valid_admin_secret_key_at_least_32_chars_long_9876543210';

import http from 'http';
import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';
import { createApp } from '../src/app.js';
import { getDatabase } from '../src/db/client.js';
import { hashDeviceKey, generateDeviceKey } from '../src/services/deviceService.js';

interface TestContext {
  baseUrl: string;
  server: http.Server;
}

async function startTestServer(): Promise<TestContext> {
  const app = createApp();
  const server = http.createServer(app);

  await new Promise<void>((resolve) => {
    server.listen(0, '127.0.0.1', () => resolve());
  });

  const addr = server.address() as any;
  const baseUrl = `http://127.0.0.1:${addr.port}`;
  return { baseUrl, server };
}

function extractCookieValue(res: Response, cookieName: string): string {
  const raw = res.headers.get('set-cookie') || '';
  const match = raw.match(new RegExp(`${cookieName}=([^;]+)`));
  return match ? match[1] : '';
}

async function runDeviceTests() {
  console.log('\n========================================');
  console.log('STARTING STEP D: DEVICE AUTHORIZATION TEST SUITE');
  console.log('========================================\n');

  const { baseUrl, server } = await startTestServer();
  const db = getDatabase();

  let passed = 0;
  let failed = 0;

  function assert(condition: boolean, name: string, details?: string) {
    if (condition) {
      console.log(`[PASS] ${name}`);
      passed++;
    } else {
      console.error(`[FAIL] ${name} ${details ? '- ' + details : ''}`);
      failed++;
    }
  }

  try {
    // 0. Seed test platform admin
    const adminEmail = `admin-devices-${crypto.randomUUID()}@platform.bd`;
    const adminPassword = 'AdminSecretPass_14Chars!';
    const adminSalt = await bcrypt.genSalt(10);
    const adminHash = await bcrypt.hash(adminPassword, adminSalt);
    const platformAdmin = await db.insertPlatformAdmin({
      email: adminEmail,
      passwordHash: adminHash,
      active: true,
      failedAttempts: 0,
    });

    // Admin login
    const adminLoginRes = await fetch(`${baseUrl}/api/admin/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: adminEmail, password: adminPassword }),
    });
    assert(adminLoginRes.status === 200, 'Platform admin logs in successfully');
    const adminToken = extractCookieValue(adminLoginRes, 'admin_access_token');
    const adminCookie = `admin_access_token=${adminToken}`;

    // 1. Setup two firms for isolation and device quota testing
    // Firm A: maxDevices = 3, devicePolicy = 'auto-approve', allowOwnerDeviceRemoval = false
    const firmAId = `firm-dev-a-${crypto.randomUUID()}`;
    const ownerAPassword = 'ChamberOwnerPass1!';
    const ownerAHash = await bcrypt.hash(ownerAPassword, await bcrypt.genSalt(10));
    const firmA = await db.insertFirm({
      id: firmAId,
      firmId: firmAId,
      name: 'Chamber A Devices Test',
      maxDevices: 3,
      devicePolicy: 'auto-approve',
      allowOwnerDeviceRemoval: false,
      licenseStartsAt: new Date(),
      licenseExpiresAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
      status: 'active',
      planId: 'annual-standard',
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    const userA = await db.insertUser({
      id: `user-dev-a-${crypto.randomUUID()}`,
      firmId: firmAId,
      name: 'Adv. Test Owner A',
      email: `owner-a-${crypto.randomUUID()}@chamber.bd`,
      passwordHash: ownerAHash,
      role: 'Owner',
      permissions: ['all'],
      language: 'en',
      active: true,
    });

    // Firm B
    const firmBId = `firm-dev-b-${crypto.randomUUID()}`;
    const ownerBPassword = 'ChamberOwnerPass2!';
    const ownerBHash = await bcrypt.hash(ownerBPassword, await bcrypt.genSalt(10));
    const firmB = await db.insertFirm({
      id: firmBId,
      firmId: firmBId,
      name: 'Chamber B Devices Test',
      maxDevices: 5,
      devicePolicy: 'auto-approve',
      allowOwnerDeviceRemoval: false,
      licenseStartsAt: new Date(),
      licenseExpiresAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
      status: 'active',
      planId: 'annual-standard',
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    const userB = await db.insertUser({
      id: `user-dev-b-${crypto.randomUUID()}`,
      firmId: firmBId,
      name: 'Adv. Test Owner B',
      email: `owner-b-${crypto.randomUUID()}@chamber.bd`,
      passwordHash: ownerBHash,
      role: 'Owner',
      permissions: ['all'],
      language: 'en',
      active: true,
    });

    console.log('\n--- 1. Quota Enforcement: 3 devices allowed, 4th becomes pending ---');
    // Device 1 login (initial install, no cookie sent)
    const dev1LoginRes = await fetch(`${baseUrl}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/128' },
      body: JSON.stringify({ email: userA.email, password: ownerAPassword }),
    });
    assert(dev1LoginRes.status === 200, 'Device 1 login succeeds (slot 1/3)');
    const dev1Key = extractCookieValue(dev1LoginRes, 'device_key');
    const dev1Token = extractCookieValue(dev1LoginRes, 'access_token');
    assert(Boolean(dev1Key), 'Device 1 receives httpOnly device_key cookie');
    assert(Boolean(dev1Token), 'Device 1 receives httpOnly access_token cookie');

    // Device 2 login (different browser install: separate device key)
    const dev2KeyExplicit = generateDeviceKey();
    const dev2LoginRes = await fetch(`${baseUrl}/auth/login`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Safari/605',
        Cookie: `device_key=${dev2KeyExplicit}`,
      },
      body: JSON.stringify({ email: userA.email, password: ownerAPassword }),
    });
    assert(dev2LoginRes.status === 200, 'Device 2 login succeeds (slot 2/3)');
    const dev2Token = extractCookieValue(dev2LoginRes, 'access_token');

    // Device 3 login
    const dev3KeyExplicit = generateDeviceKey();
    const dev3LoginRes = await fetch(`${baseUrl}/auth/login`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) Firefox/128',
        Cookie: `device_key=${dev3KeyExplicit}`,
      },
      body: JSON.stringify({ email: userA.email, password: ownerAPassword }),
    });
    assert(dev3LoginRes.status === 200, 'Device 3 login succeeds (slot 3/3 - max reached)');

    // Device 4 login: quota is 3, 3 approved exist -> MUST become pending!
    const dev4KeyExplicit = generateDeviceKey();
    const dev4LoginRes = await fetch(`${baseUrl}/auth/login`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) Mobile Safari',
        Cookie: `device_key=${dev4KeyExplicit}`,
      },
      body: JSON.stringify({ email: userA.email, password: ownerAPassword }),
    });
    assert(dev4LoginRes.status === 403, 'Device 4 login is rejected with HTTP 403');
    const dev4Body = await dev4LoginRes.json();
    assert(dev4Body.code === 'DEVICE_PENDING', 'Device 4 receives code DEVICE_PENDING');
    assert(Boolean(dev4Body.message), 'Device 4 receives a friendly explanatory message');
    assert(dev4Body.device?.status === 'pending', 'Device 4 database record has status pending');

    console.log('\n--- 2. Admin Approval of Pending Device ---');
    const dev4Id = dev4Body.device.id;
    // Admin approves device 4
    const approveRes = await fetch(`${baseUrl}/api/admin/devices/${dev4Id}/approve`, {
      method: 'POST',
      headers: { Cookie: adminCookie },
    });
    assert(approveRes.status === 200, 'Platform admin approves pending Device 4');
    const approveBody = await approveRes.json();
    assert(approveBody.device.status === 'approved', 'Device 4 is marked approved in DB');

    // Device 4 now retries login
    const dev4RetryLogin = await fetch(`${baseUrl}/auth/login`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: `device_key=${dev4KeyExplicit}`,
      },
      body: JSON.stringify({ email: userA.email, password: ownerAPassword }),
    });
    assert(dev4RetryLogin.status === 200, 'Device 4 now logs in successfully after admin approval');

    console.log('\n--- 3. Immediate Session Invalidation: Revoke blocks next request ---');
    // Device 1 is approved and active
    const req1BeforeRevoke = await fetch(`${baseUrl}/api/v1/firms/current`, {
      headers: {
        Cookie: `access_token=${dev1Token}; device_key=${dev1Key}`,
      },
    });
    assert(req1BeforeRevoke.status === 200, 'Device 1 active session can access /api/v1/firms/current');

    // Get Device 1 ID from database via deviceKeyHash
    const dev1Record = await db.getDeviceByHash(hashDeviceKey(dev1Key));
    assert(Boolean(dev1Record), 'Device 1 record exists in database');

    // Admin revokes Device 1
    const revokeRes = await fetch(`${baseUrl}/api/admin/devices/${dev1Record!.id}/revoke`, {
      method: 'POST',
      headers: { Cookie: adminCookie },
    });
    assert(revokeRes.status === 200, 'Platform admin revokes Device 1 authorization');

    // The very next request made by Device 1 MUST be rejected immediately!
    const req1AfterRevoke = await fetch(`${baseUrl}/api/v1/firms/current`, {
      headers: {
        Cookie: `access_token=${dev1Token}; device_key=${dev1Key}`,
      },
    });
    assert(req1AfterRevoke.status === 403, 'Next request from revoked Device 1 returns HTTP 403');
    const req1AfterBody = await req1AfterRevoke.json();
    assert(req1AfterBody.code === 'DEVICE_REVOKED', 'Revoked device returns code DEVICE_REVOKED');

    // Replay with revoked token also blocked
    const req1Replay = await fetch(`${baseUrl}/api/v1/firms/current`, {
      headers: {
        Cookie: `access_token=${dev1Token}; device_key=${dev1Key}`,
      },
    });
    assert(req1Replay.status === 403 || req1Replay.status === 401, 'Subsequent requests remain blocked');

    console.log('\n--- 4. Firm Isolation: Cannot see or approve another firm devices ---');
    // Device login for Firm B
    const devBKey = generateDeviceKey();
    const devBLoginRes = await fetch(`${baseUrl}/auth/login`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: `device_key=${devBKey}`,
      },
      body: JSON.stringify({ email: userB.email, password: ownerBPassword }),
    });
    assert(devBLoginRes.status === 200, 'Firm B Owner logs in');
    const devBToken = extractCookieValue(devBLoginRes, 'access_token');

    // Firm A Owner calls GET /api/v1/devices/my
    const firmADevicesRes = await fetch(`${baseUrl}/api/v1/devices/my`, {
      headers: { Cookie: `access_token=${dev2Token}; device_key=${dev2KeyExplicit}` },
    });
    assert(firmADevicesRes.status === 200, 'Firm A Owner can call GET /api/v1/devices/my');
    const firmADevicesBody = await firmADevicesRes.json();
    const containsFirmBDevice = firmADevicesBody.devices.some((d: any) => d.firmId === firmBId);
    assert(!containsFirmBDevice, 'Firm A cannot see Firm B devices (Firm isolation)');
    const anyHasKeyHash = firmADevicesBody.devices.some((d: any) => d.deviceKeyHash !== undefined);
    assert(!anyHasKeyHash, 'deviceKeyHash is never exposed to clients');

    // Firm B Owner calls GET /api/v1/devices/my
    const firmBDevicesRes = await fetch(`${baseUrl}/api/v1/devices/my`, {
      headers: { Cookie: `access_token=${devBToken}; device_key=${devBKey}` },
    });
    assert(firmBDevicesRes.status === 200, 'Firm B Owner can call GET /api/v1/devices/my');
    const firmBDevicesBody = await firmBDevicesRes.json();
    const containsFirmADevice = firmBDevicesBody.devices.some((d: any) => d.firmId === firmAId);
    assert(!containsFirmADevice, 'Firm B cannot see Firm A devices (Firm isolation)');

    // Firm Owner tries to approve devices via admin endpoint -> 401/403
    const firmOwnerCallsAdminApprove = await fetch(`${baseUrl}/api/admin/devices/${dev1Record!.id}/approve`, {
      method: 'POST',
      headers: { Cookie: `access_token=${dev2Token}` },
    });
    assert(
      firmOwnerCallsAdminApprove.status === 401 || firmOwnerCallsAdminApprove.status === 403,
      'Firm Owner cannot call admin device approval endpoint'
    );

    console.log('\n--- 5. Staff Device Removal by Firm Owner & Policy Guard ---');
    // With allowOwnerDeviceRemoval = false:
    const ownerRemovesDisabledRes = await fetch(`${baseUrl}/api/v1/devices/${dev4Id}`, {
      method: 'DELETE',
      headers: { Cookie: `access_token=${dev2Token}; device_key=${dev2KeyExplicit}` },
    });
    assert(
      ownerRemovesDisabledRes.status === 403,
      'Owner cannot remove devices when allowOwnerDeviceRemoval is false'
    );

    // Admin enables allowOwnerDeviceRemoval for Firm A
    await db.updateFirm(firmAId, { allowOwnerDeviceRemoval: true });

    // Firm A Owner tries to remove a device belonging to Firm B -> 404
    const firmBRecord = await db.getDeviceByHash(hashDeviceKey(devBKey));
    const crossRemoveRes = await fetch(`${baseUrl}/api/v1/devices/${firmBRecord!.id}`, {
      method: 'DELETE',
      headers: { Cookie: `access_token=${dev2Token}; device_key=${dev2KeyExplicit}` },
    });
    assert(crossRemoveRes.status === 404, 'Firm A Owner removing Firm B device returns 404 (Firm isolation)');

    // Firm A Owner removes Device 4 (belonging to Firm A)
    const ownerRemovesSuccessRes = await fetch(`${baseUrl}/api/v1/devices/${dev4Id}`, {
      method: 'DELETE',
      headers: { Cookie: `access_token=${dev2Token}; device_key=${dev2KeyExplicit}` },
    });
    assert(ownerRemovesSuccessRes.status === 200, 'Owner removes staff device when policy enabled');
    const dev4AfterRemoval = await db.getDeviceById(dev4Id);
    assert(dev4AfterRemoval?.status === 'revoked', 'Removed device status transitioned to revoked');

    // R-08: When firm is expired, DELETE /api/v1/devices/:id returns HTTP 403 SUBSCRIPTION_READ_ONLY
    await db.updateFirm(firmAId, {
      status: 'expired',
      licenseExpiresAt: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
    });
    const expiredRemoveRes = await fetch(`${baseUrl}/api/v1/devices/${dev4Id}`, {
      method: 'DELETE',
      headers: { Cookie: `access_token=${dev2Token}; device_key=${dev2KeyExplicit}` },
    });
    assert(expiredRemoveRes.status === 403, 'DELETE /api/v1/devices/:id returns 403 when firm is expired (R-08)');
    const expiredRemoveBody = await expiredRemoveRes.json();
    assert(
      expiredRemoveBody.code === 'SUBSCRIPTION_READ_ONLY',
      'DELETE /api/v1/devices/:id returns code SUBSCRIPTION_READ_ONLY'
    );

    // Restore Firm A license
    await db.updateFirm(firmAId, {
      status: 'active',
      licenseExpiresAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
    });

    console.log('\n--- 6. Clearing Cookies Creates a New Pending Device (Documented) ---');
    // Current state of Firm A:
    // Device 1: revoked
    // Device 2: approved
    // Device 3: approved
    // Device 4: revoked
    // Re-approve device 1 so 3 approved devices exist (slots full: 3/3)
    await db.updateDevice(dev1Record!.id, { status: 'approved' });
    const approvedCountNow = await db.countApprovedDevices(firmAId);
    assert(approvedCountNow === 3, 'Firm A has exactly 3 approved devices (maxDevices: 3)');

    // User clears all cookies (both access_token and device_key are gone)
    // Next login sends NO Cookie header
    const clearedCookiesLoginRes = await fetch(`${baseUrl}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: userA.email, password: ownerAPassword }),
    });

    assert(
      clearedCookiesLoginRes.status === 403,
      'Login after clearing cookies returns HTTP 403 when quota is full'
    );
    const clearedBody = await clearedCookiesLoginRes.json();
    assert(
      clearedBody.code === 'DEVICE_PENDING',
      'Clearing cookies causes browser to be registered as brand new pending device'
    );
    const newGeneratedKey = extractCookieValue(clearedCookiesLoginRes, 'device_key');
    assert(
      Boolean(newGeneratedKey),
      'Server assigns a new device_key cookie for the cleared browser install'
    );
    assert(
      newGeneratedKey !== dev1Key && newGeneratedKey !== dev2KeyExplicit,
      'New device key is unique and different from previous keys'
    );

    console.log('\n========================================');
    console.log(`DEVICE AUTHORIZATION TEST RESULTS: ${passed} PASSED, ${failed} FAILED`);
    console.log('========================================\n');

    if (failed > 0) {
      process.exit(1);
    }
  } finally {
    server.close();
  }
}

runDeviceTests().catch((err) => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
