import assert from 'node:assert';
import http from 'http';
import { AddressInfo } from 'net';
import { getRepositories } from '../src/data/repositories';
import { RestClientRepository } from '../src/data/repositories/rest/restClient';
import { invalidateClientPhotoCache, getCachedClientPhoto } from '../src/components/ClientAvatar';
import { SecurityContext } from '../src/data/types';

async function runPhotoPersistenceTests() {
  console.log('--- STARTING CLIENT PHOTO PERSISTENCE & UPLOAD FLOW REGRESSION SUITE ---');
  let passed = 0;
  let failed = 0;

  function test(name: string, fn: () => void | Promise<void>) {
    return Promise.resolve()
      .then(fn)
      .then(() => {
        console.log(`[PASS] ${name}`);
        passed++;
      })
      .catch((err) => {
        console.error(`[FAIL] ${name}:`, err.message);
        failed++;
      });
  }

  const mockContext: SecurityContext = {
    currentUser: {
      id: 'user-owner-001',
      firmId: 'firm-bd-001',
      name: 'Adv. Mahbubur Rahman',
      email: 'owner@firm.bd',
      role: 'Owner',
      active: true,
      permissions: ['clients.view', 'clients.edit'],
      language: 'en',
      createdAt: '2024-01-01T00:00:00.000Z',
      updatedAt: '2024-01-01T00:00:00.000Z',
      deletedAt: null,
      createdBy: 'user-owner-001',
      updatedBy: 'user-owner-001',
    },
  };

  const sampleJpegBase64 = '/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA=';
  const sampleMime = 'image/jpeg';
  const testClientId = 'client-001';

  // 1. Mock Repository savePhoto
  await test('1. Mock repository savePhoto stores photo and sets hasPhoto === true on client', async () => {
    const repos = getRepositories();
    const saved = await repos.client.savePhoto(mockContext, testClientId, sampleMime, sampleJpegBase64);
    assert(saved !== null, 'Saved photo record returned');
    assert.strictEqual(saved.clientId, testClientId);
    assert.strictEqual(saved.mime, sampleMime);
    assert(typeof saved.dataUrl === 'string' && saved.dataUrl.startsWith('data:image/jpeg;base64,'), 'dataUrl is properly formatted');

    const client = await repos.client.getById(mockContext, testClientId);
    assert(client !== null, 'Client found');
    assert.strictEqual(client.hasPhoto, true, 'client hasPhoto is true after savePhoto');
  });

  // 2. Mock Repository getPhoto
  await test('2. Mock repository getPhoto returns complete record with dataUrl and bytes', async () => {
    const repos = getRepositories();
    const photo = await repos.client.getPhoto(mockContext, testClientId);
    assert(photo !== null, 'Photo returned');
    assert.strictEqual(photo?.clientId, testClientId);
    assert(photo?.dataUrl?.startsWith('data:image/jpeg;base64,'), 'photo dataUrl is present and valid');
    assert.strictEqual(photo?.bytes, sampleJpegBase64, 'raw base64 bytes match');
  });

  // 3. Mock Repository update preserves hasPhoto
  await test('3. Mock repository update preserves hasPhoto === true', async () => {
    const repos = getRepositories();
    const updated = await repos.client.update(mockContext, testClientId, { notes: 'Updated notes' });
    assert.strictEqual(updated.hasPhoto, true, 'hasPhoto is preserved as true after updating notes');
  });

  // 4. Invalidate & Read Client Photo Cache
  await test('4. Client photo cache setter, getter, and invalidation work seamlessly', () => {
    const customUrl = 'data:image/jpeg;base64,custom-test-url';
    invalidateClientPhotoCache(testClientId, customUrl);
    assert.strictEqual(getCachedClientPhoto(testClientId), customUrl, 'Cached photo URL matches');

    invalidateClientPhotoCache(testClientId, null);
    assert.strictEqual(getCachedClientPhoto(testClientId), null, 'Cache safely updated to null on deletion');

    invalidateClientPhotoCache(testClientId);
    assert.strictEqual(getCachedClientPhoto(testClientId), undefined, 'Cache entry deleted when no url supplied');
  });

  // 5. Mock Repository deletePhoto
  await test('5. Mock repository deletePhoto removes photo and sets hasPhoto === false', async () => {
    const repos = getRepositories();
    await repos.client.deletePhoto(mockContext, testClientId);
    const photo = await repos.client.getPhoto(mockContext, testClientId);
    assert.strictEqual(photo, null, 'getPhoto returns null after deletion');

    const client = await repos.client.getById(mockContext, testClientId);
    assert(client !== null);
    assert.strictEqual(client.hasPhoto, false, 'client hasPhoto reverts to false');
  });

  // 6. Test RestClientRepository with simulated REST server
  await test('6. RestClientRepository getPhoto and savePhoto handle JSON and binary gracefully', async () => {
    let storedPhoto: { mime: string; bytes: string; updatedAt: string } | null = null;

    const server = http.createServer((req, res) => {
      const url = req.url || '';

      if (url.startsWith('/api/v1/clients/test-rest-client/photo')) {
        if (req.method === 'PUT') {
          let body = '';
          req.on('data', (chunk) => { body += chunk; });
          req.on('end', () => {
            const parsed = JSON.parse(body);
            storedPhoto = {
              mime: parsed.mime,
              bytes: parsed.data,
              updatedAt: new Date().toISOString(),
            };
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({
              success: true,
              clientId: 'test-rest-client',
              firmId: 'firm-bd-001',
              mime: storedPhoto.mime,
              bytes: storedPhoto.bytes,
              dataUrl: `data:${storedPhoto.mime};base64,${storedPhoto.bytes}`,
              updatedAt: storedPhoto.updatedAt,
            }));
          });
          return;
        }

        if (req.method === 'GET') {
          if (!storedPhoto) {
            res.writeHead(404, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Photo not found' }));
            return;
          }

          const acceptsJson = req.headers.accept?.includes('application/json');
          if (acceptsJson) {
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({
              clientId: 'test-rest-client',
              firmId: 'firm-bd-001',
              mime: storedPhoto.mime,
              bytes: storedPhoto.bytes,
              dataUrl: `data:${storedPhoto.mime};base64,${storedPhoto.bytes}`,
              updatedAt: storedPhoto.updatedAt,
            }));
          } else {
            res.writeHead(200, {
              'Content-Type': storedPhoto.mime,
              'Cache-Control': 'private, no-cache, must-revalidate',
            });
            res.end(Buffer.from(storedPhoto.bytes, 'base64'));
          }
          return;
        }
      }

      res.writeHead(404);
      res.end();
    });

    await new Promise<void>((resolve) => {
      server.listen(0, '127.0.0.1', () => resolve());
    });

    const addr = server.address() as AddressInfo;
    const testApiBase = `http://127.0.0.1:${addr.port}/api/v1`;
    process.env.VITE_API_BASE_URL = testApiBase;

    try {
      const restRepo = new RestClientRepository();

      // Initially no photo -> returns null
      const initialPhoto = await restRepo.getPhoto(mockContext, 'test-rest-client');
      assert.strictEqual(initialPhoto, null, 'getPhoto on missing photo returns null');

      // Save photo via PUT
      const saved = await restRepo.savePhoto(mockContext, 'test-rest-client', 'image/jpeg', sampleJpegBase64);
      assert(saved !== null, 'Saved photo returned from restRepo');
      assert.strictEqual(saved.clientId, 'test-rest-client');
      assert(saved.dataUrl?.startsWith('data:image/jpeg;base64,'), 'saved dataUrl is set');

      // Retrieve photo via GET (JSON content negotiation)
      const fetchedJson = await restRepo.getPhoto(mockContext, 'test-rest-client');
      assert(fetchedJson !== null, 'Photo successfully fetched via REST');
      assert.strictEqual(fetchedJson?.clientId, 'test-rest-client');
      assert(fetchedJson?.dataUrl?.startsWith('data:image/jpeg;base64,'), 'fetched dataUrl is intact');
      assert.strictEqual(fetchedJson?.bytes, sampleJpegBase64, 'raw bytes match uploaded data');

      // Simulation of reload: photo record has dataUrl and does NOT revert to null
      assert(Boolean(fetchedJson?.dataUrl), 'dataUrl exists on photo reload response');
    } finally {
      server.close();
      delete process.env.VITE_API_BASE_URL;
    }
  });

  console.log(`\n========================================`);
  console.log(`PHOTO PERSISTENCE TEST RESULTS: ${passed} PASSED, ${failed} FAILED`);
  console.log(`========================================\n`);

  if (failed > 0) {
    process.exit(1);
  }
}

runPhotoPersistenceTests().catch((err) => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
