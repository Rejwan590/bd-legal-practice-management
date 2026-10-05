process.env.JWT_SECRET = 'test_jwt_secret_key_at_least_32_chars_long_1234567890';
process.env.ADMIN_JWT_SECRET = 'test_admin_jwt_secret_key_at_least_32_chars_9876543210';

import http from 'http';
import { createApp } from '../src/app.js';
import { getDatabase } from '../src/db/client.js';
import { SEED_PASSWORDS, ALL_PERMISSIONS } from '../src/db/seed.js';
import bcrypt from 'bcryptjs';

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

function extractToken(res: Response): string {
  const cookie = res.headers.get('set-cookie') || '';
  const match = cookie.match(/access_token=([^;]+)/);
  return match ? match[1] : '';
}

async function runTests() {
  console.log('--- STARTING BACKEND STEP 3.1 CLIENTS TEST SUITE ---');
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
    // Authenticate Owner and Staff
    const ownerRes = await fetch(`${baseUrl}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'owner@firm.bd', password: SEED_PASSWORDS.owner }),
    });
    const ownerToken = extractToken(ownerRes);

    const staffRes = await fetch(`${baseUrl}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'staff@firm.bd', password: SEED_PASSWORDS.staff }),
    });
    const staffToken = extractToken(staffRes);

    // 1. Staff without clients.edit cannot create, edit or delete
    {
      console.log('\n--- 1. Permission Check: clients.edit requirement ---');
      // Staff attempt to create
      const createRes = await fetch(`${baseUrl}/api/v1/clients`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Cookie: `access_token=${staffToken}`,
        },
        body: JSON.stringify({
          name: 'Unauthorized Client',
          phone: '+880 1700-000000',
          address: 'Dhaka',
        }),
      });
      const createBody = await createRes.json();
      assert(
        createRes.status === 403 && createBody.code === 'PERMISSION_DENIED',
        'Staff without clients.edit cannot create a client (HTTP 403)'
      );

      // Staff attempt to edit
      const editRes = await fetch(`${baseUrl}/api/v1/clients/client-001`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Cookie: `access_token=${staffToken}`,
        },
        body: JSON.stringify({ notes: 'Attempted edit' }),
      });
      assert(editRes.status === 403, 'Staff without clients.edit cannot edit a client (HTTP 403)');

      // Staff attempt to delete
      const delRes = await fetch(`${baseUrl}/api/v1/clients/client-001`, {
        method: 'DELETE',
        headers: { Cookie: `access_token=${staffToken}` },
      });
      assert(delRes.status === 403, 'Staff without clients.edit cannot delete a client (HTTP 403)');

      // Staff CAN list clients (has clients.view)
      const listRes = await fetch(`${baseUrl}/api/v1/clients`, {
        headers: { Cookie: `access_token=${staffToken}` },
      });
      assert(listRes.status === 200, 'Staff with clients.view can list clients (HTTP 200)');
    }

    // 2. Create and edit client with Bangla and English name
    let newClientId = '';
    {
      console.log('\n--- 2. Create & Edit Client with English and Bangla Names ---');
      const createRes = await fetch(`${baseUrl}/api/v1/clients`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Cookie: `access_token=${ownerToken}`,
        },
        body: JSON.stringify({
          name: 'Mohammad Anisur Rahman',
          nameBn: 'মোহাম্মদ আনিসুর রহমান',
          phone: '+880 1712-998877',
          email: 'anisur@example.com',
          address: 'House 12, Road 4, Banani, Dhaka-1213',
          notes: 'Commercial property dispute client',
        }),
      });
      const created = await createRes.json();
      assert(createRes.status === 201, 'Owner can create client (HTTP 201)');
      assert(created.name === 'Mohammad Anisur Rahman', 'Client English name saved correctly');
      assert(created.nameBn === 'মোহাম্মদ আনিসুর রহমান', 'Client Bangla name saved correctly');
      assert(Boolean(created.id && created.firmId === 'firm-bd-001'), 'Standard UUID and firmId assigned');
      newClientId = created.id;

      // Edit client
      const editRes = await fetch(`${baseUrl}/api/v1/clients/${newClientId}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Cookie: `access_token=${ownerToken}`,
        },
        body: JSON.stringify({
          phone: '+880 1712-998800',
          notes: 'Updated notes after initial chamber consultation',
        }),
      });
      const updated = await editRes.json();
      assert(editRes.status === 200, 'Owner can edit client (HTTP 200)');
      assert(updated.phone === '+880 1712-998800', 'Updated phone number saved correctly');
    }

    // 3. Search by English and Bangla name
    {
      console.log('\n--- 3. Bilingual Search ---');
      // Search by English name
      const searchEnRes = await fetch(`${baseUrl}/api/v1/clients?search=Anisur`, {
        headers: { Cookie: `access_token=${ownerToken}` },
      });
      const enResults = await searchEnRes.json();
      assert(
        enResults.some((c: any) => c.id === newClientId),
        'Search finds client by English name substring'
      );

      // Search by Bangla name
      const searchBnRes = await fetch(`${baseUrl}/api/v1/clients?search=${encodeURIComponent('আনিসুর')}`, {
        headers: { Cookie: `access_token=${ownerToken}` },
      });
      const bnResults = await searchBnRes.json();
      assert(
        bnResults.some((c: any) => c.id === newClientId),
        'Search finds client by Bangla name substring'
      );

      // Search by Phone
      const searchPhoneRes = await fetch(`${baseUrl}/api/v1/clients?search=998800`, {
        headers: { Cookie: `access_token=${ownerToken}` },
      });
      const phoneResults = await searchPhoneRes.json();
      assert(
        phoneResults.some((c: any) => c.id === newClientId),
        'Search finds client by phone number substring'
      );
    }

    // 4. Soft delete warns when client has cases & does not orphan them
    {
      console.log('\n--- 4. Soft Delete & Orphan Prevention ---');
      // client-001 has active case case-001
      const blockedDelRes = await fetch(`${baseUrl}/api/v1/clients/client-001`, {
        method: 'DELETE',
        headers: { Cookie: `access_token=${ownerToken}` },
      });
      const blockedBody = await blockedDelRes.json();
      assert(
        blockedDelRes.status === 400 && blockedBody.message?.includes('active case'),
        'Soft delete warns and rejects when client has active cases to prevent orphaned records'
      );

      // Deleting client with no active cases (newClientId) succeeds
      const successDelRes = await fetch(`${baseUrl}/api/v1/clients/${newClientId}`, {
        method: 'DELETE',
        headers: { Cookie: `access_token=${ownerToken}` },
      });
      const successDelBody = await successDelRes.json();
      assert(
        successDelRes.status === 200 && successDelBody.softDeleted === true,
        'Soft delete succeeds on client without active cases (HTTP 200, softDeleted: true)'
      );

      // Verify client no longer in active list
      const listAfterRes = await fetch(`${baseUrl}/api/v1/clients`, {
        headers: { Cookie: `access_token=${ownerToken}` },
      });
      const listAfter = await listAfterRes.json();
      assert(
        !listAfter.some((c: any) => c.id === newClientId),
        'Soft-deleted client is filtered out of active client list'
      );
    }

    // 5. Audit log shows who did what
    {
      console.log('\n--- 5. Audit Trail for Client Mutations ---');
      const auditRes = await fetch(`${baseUrl}/api/v1/audit-log`, {
        headers: { Cookie: `access_token=${ownerToken}` },
      });
      const auditLogs = await auditRes.json();

      const clientCreateAudit = auditLogs.find(
        (a: any) => a.entity === 'Client' && a.action === 'CREATE' && a.entityId === newClientId
      );
      assert(
        Boolean(clientCreateAudit && clientCreateAudit.userName === 'Adv. Mahbubur Rahman'),
        'Audit log records Client CREATE action with operator identity'
      );

      const clientDeleteAudit = auditLogs.find(
        (a: any) => a.entity === 'Client' && a.action === 'DELETE' && a.entityId === newClientId
      );
      assert(
        Boolean(clientDeleteAudit && clientDeleteAudit.newValue?.softDeleted === true),
        'Audit log records Client DELETE action with soft-delete metadata'
      );
    }

    // 6. Client Linked Overview endpoint
    {
      console.log('\n--- 6. Client Linked Overview ---');
      const overviewRes = await fetch(`${baseUrl}/api/v1/clients/client-001/overview`, {
        headers: { Cookie: `access_token=${ownerToken}` },
      });
      const overview = await overviewRes.json();
      assert(overviewRes.status === 200, 'Client linked overview returns HTTP 200');
      assert(Array.isArray(overview.cases) && overview.cases.length > 0, 'Overview includes linked cases');
      assert(overview.cases[0].caseNumber === 'Title Suit No. 45/2023', 'Linked case details populated');
    }

    // 7. Firm Isolation
    {
      console.log('\n--- 7. Firm Isolation on Clients ---');
      // Create a client for Firm B
      const firmBId = 'firm-bd-002';
      const firmBClient = await db.insertClient({
        id: 'client-firm-b-001',
        firmId: firmBId,
        name: 'Chittagong Maritime Corp',
        nameBn: 'চট্টগ্রাম মেরিটাইম কর্পোরেশন',
        phone: '+880 1819-000000',
        email: 'info@ctgmaritime.bd',
        address: 'Strand Road, Chattogram',
        notes: 'Foreign maritime matter',
        archived: false,
        createdAt: new Date(),
        updatedAt: new Date(),
        deletedAt: null,
        createdBy: 'user-owner-002',
        updatedBy: 'user-owner-002',
      });

      // Firm A query should NOT contain Firm B client
      const firmAListRes = await fetch(`${baseUrl}/api/v1/clients`, {
        headers: { Cookie: `access_token=${ownerToken}` },
      });
      const firmAList = await firmAListRes.json();
      assert(
        !firmAList.some((c: any) => c.id === firmBClient.id || c.firmId === firmBId),
        'Firm A cannot see Firm B client in client list'
      );

      // Direct query for Firm B client returns 404
      const directRes = await fetch(`${baseUrl}/api/v1/clients/${firmBClient.id}`, {
        headers: { Cookie: `access_token=${ownerToken}` },
      });
      assert(directRes.status === 404, 'Firm A querying Firm B client by ID gets 404 Not Found');
    }

    console.log(`\n========================================`);
    console.log(`CLIENTS BACKEND TEST RESULTS: ${passed} PASSED, ${failed} FAILED`);
    console.log(`========================================\n`);

    if (failed > 0) {
      process.exit(1);
    }
  } catch (err) {
    console.error('Test execution error:', err);
    process.exit(1);
  } finally {
    server.close();
  }
}

runTests();
