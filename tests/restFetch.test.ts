import http from 'http';
import { AddressInfo } from 'net';
import { restFetch, RestApiError } from '../src/data/repositories/rest/restCommon';

interface TestServerContext {
  baseUrl: string;
  server: http.Server;
}

function createTestHttpServer(): Promise<TestServerContext> {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      const url = req.url || '';

      if (url === '/api/v1/test-204') {
        res.writeHead(204);
        res.end();
        return;
      }

      if (url === '/api/v1/test-empty-200') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end('');
        return;
      }

      if (url === '/api/v1/test-401') {
        res.writeHead(401, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Unauthorized', message: 'Token expired' }));
        return;
      }

      if (url === '/api/v1/test-timeout') {
        // Delay response to trigger client-side timeout
        setTimeout(() => {
          if (!res.writableEnded) {
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ ok: true }));
          }
        }, 300);
        return;
      }

      if (url === '/api/v1/test-success') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, count: 42 }));
        return;
      }

      res.writeHead(404);
      res.end();
    });

    server.listen(0, '127.0.0.1', () => {
      const addr = server.address() as AddressInfo;
      resolve({
        baseUrl: `http://127.0.0.1:${addr.port}/api/v1`,
        server,
      });
    });
  });
}

async function runRestFetchTests() {
  console.log('--- STARTING RESTFETCH UNIT TEST SUITE ---');
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

  const { baseUrl, server } = await createTestHttpServer();

  try {
    // 1. Test 204 No Content
    {
      const result = await restFetch(`${baseUrl}/test-204`);
      assert(result === undefined, 'restFetch handles 204 No Content without calling response.json()');
    }

    // 2. Test 200 with Empty Body
    {
      const result = await restFetch(`${baseUrl}/test-empty-200`);
      assert(result === undefined, 'restFetch handles 200 with empty body without throwing JSON parse error');
    }

    // 3. Test 401 Unauthorized & Redirect
    {
      // Mock window.location in Node test environment
      const mockLocation = { pathname: '/dashboard', href: 'http://localhost:3000/dashboard' };
      (globalThis as unknown as { window?: { location: typeof mockLocation } }).window = { location: mockLocation };

      let errorThrown: RestApiError | null = null;
      try {
        await restFetch(`${baseUrl}/test-401`);
      } catch (err: unknown) {
        errorThrown = err as RestApiError;
      }

      assert(errorThrown !== null, 'restFetch throws on HTTP 401');
      assert(errorThrown?.status === 401, 'Error object carries status 401');
      assert(mockLocation.href === '/login', 'HTTP 401 triggers browser redirect to /login');

      // Clean up mock window
      delete (globalThis as unknown as { window?: unknown }).window;
    }

    // 4. Test Timeout with AbortController
    {
      let timeoutError: RestApiError | null = null;
      const start = Date.now();
      try {
        await restFetch(`${baseUrl}/test-timeout`, { timeoutMs: 80 });
      } catch (err: unknown) {
        timeoutError = err as RestApiError;
      }
      const elapsed = Date.now() - start;

      assert(timeoutError !== null, 'restFetch throws on timeout');
      assert(timeoutError?.code === 'REQUEST_TIMEOUT', 'Timeout error code is REQUEST_TIMEOUT');
      assert(timeoutError?.status === 408, 'Timeout error status is HTTP 408');
      assert(Boolean(timeoutError?.message.includes('timed out after 0.08 seconds')), 'Timeout error message is readable and accurate');
      assert(elapsed < 250, 'Timeout aborted within specified duration');
    }

    // 5. Test Network Failure
    {
      let networkError: RestApiError | null = null;
      try {
        // Point to an unavailable local port
        await restFetch('http://127.0.0.1:1/api/v1/nonexistent', { timeoutMs: 1000 });
      } catch (err: unknown) {
        networkError = err as RestApiError;
      }

      assert(networkError !== null, 'restFetch throws on network failure');
      assert(
        networkError?.code === 'NETWORK_FAILURE' || networkError?.code === 'REQUEST_TIMEOUT',
        'Error code captures network failure or timeout'
      );
      assert(Boolean(networkError?.message.includes('connection') || networkError?.message.includes('network')), 'Error message is clear and human-readable');
    }

    // 6. Test Successful JSON parsing
    {
      const data = await restFetch<{ success: boolean; count: number }>(`${baseUrl}/test-success`);
      assert(data.success === true && data.count === 42, 'restFetch parses valid JSON successfully');
    }

    console.log(`\n========================================`);
    console.log(`RESTFETCH TEST RESULTS: ${passed} PASSED, ${failed} FAILED`);
    console.log(`========================================\n`);

    if (failed > 0) {
      process.exit(1);
    }
  } catch (err) {
    console.error('Test suite error:', err);
    process.exit(1);
  } finally {
    server.close();
  }
}

runRestFetchTests();
