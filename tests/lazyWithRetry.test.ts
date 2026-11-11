import assert from 'node:assert/strict';
import {
  clearChunkReloadGuard,
  isChunkLoadError,
  lazyWithRetry,
  triggerChunkReloadOnce,
} from '../src/utils/lazyWithRetry';

function createMemoryStorage() {
  const store = new Map<string, string>();
  return {
    getItem(key: string) {
      return store.get(key) ?? null;
    },
    setItem(key: string, value: string) {
      store.set(key, value);
    },
    removeItem(key: string) {
      store.delete(key);
    },
  };
}

async function runTests() {
  console.log('--- STARTING LAZY CHUNK RETRY RECOVERY TEST SUITE ---');

  // 1. Chunk error classification
  assert.equal(
    isChunkLoadError(new TypeError('Failed to fetch dynamically imported module: https://bd-legal-practice-management.vercel.app/assets/AppointmentsScreen-Dksje8El.js')),
    true
  );
  assert.equal(
    isChunkLoadError(new Error('Importing a module script failed.')),
    true
  );
  assert.equal(
    isChunkLoadError(new Error('Expected a JavaScript-or-Wasm module script but the server responded with a MIME type of "text/html".')),
    true
  );
  assert.equal(
    isChunkLoadError(new Error('Unable to preload CSS for /assets/index-123.css')),
    true
  );
  const chunkErr = new Error('Loading chunk 42 failed');
  chunkErr.name = 'ChunkLoadError';
  assert.equal(isChunkLoadError(chunkErr), true);

  // Non-chunk runtime errors must return false
  assert.equal(isChunkLoadError(new TypeError("Cannot read properties of null (reading 'trim')")), false);
  assert.equal(isChunkLoadError(new Error('Permission denied')), false);
  assert.equal(isChunkLoadError(null), false);
  console.log('[PASS] 1. Chunk-load error detection classifies dynamic module & MIME errors accurately');

  // 2. Single-reload cooldown guard
  const storage = createMemoryStorage();
  let reloadCount = 0;
  let currentNow = 1_000_000;
  const deps = {
    storage,
    reload: () => {
      reloadCount += 1;
    },
    now: () => currentNow,
  };

  assert.equal(triggerChunkReloadOnce(deps), true);
  assert.equal(reloadCount, 1);

  // Immediate repeat within cooldown must NOT loop
  currentNow += 3_000;
  assert.equal(triggerChunkReloadOnce(deps), false);
  assert.equal(reloadCount, 1);

  // After cooldown (>15s), reload is allowed again
  currentNow += 20_000;
  assert.equal(triggerChunkReloadOnce(deps), true);
  assert.equal(reloadCount, 2);

  // Clearing guard explicitly resets cooldown immediately
  clearChunkReloadGuard(storage);
  assert.equal(triggerChunkReloadOnce(deps), true);
  assert.equal(reloadCount, 3);
  console.log('[PASS] 2. Single-reload guard prevents infinite loops and resets cleanly');

  // 3. lazyWithRetry wrapper behavior
  const lazyStorage = createMemoryStorage();
  let lazyReloads = 0;
  const lazyDeps = {
    storage: lazyStorage,
    reload: () => {
      lazyReloads += 1;
    },
    now: () => 5_000_000,
  };

  // First chunk error triggers reload and stays pending
  const LazyStale = lazyWithRetry(
    async () => {
      throw new TypeError('Failed to fetch dynamically imported module: /assets/AppointmentsScreen-old.js');
    },
    lazyDeps
  );
  const firstPayload = (LazyStale as unknown as { _payload: { _status: number; _result: () => Promise<unknown> } })._payload;
  const firstResult = firstPayload._result();
  const settledWithinTimeout = await Promise.race([
    firstResult.then(() => 'resolved', () => 'rejected'),
    new Promise((resolve) => setTimeout(() => resolve('pending'), 25)),
  ]);
  assert.equal(lazyReloads, 1);
  assert.equal(settledWithinTimeout, 'pending');

  // Repeat chunk error inside cooldown rethrows so ErrorBoundary renders
  const LazySecondFail = lazyWithRetry(
    async () => {
      throw new TypeError('Failed to fetch dynamically imported module: /assets/AppointmentsScreen-old.js');
    },
    lazyDeps
  );
  const secondPayload = (LazySecondFail as unknown as { _payload: { _result: () => Promise<unknown> } })._payload;
  await assert.rejects(() => secondPayload._result(), /Failed to fetch dynamically imported module/);
  assert.equal(lazyReloads, 1);

  // Non-chunk runtime error never reloads; rethrows immediately
  const LazyRuntimeFail = lazyWithRetry(
    async () => {
      throw new Error('Unexpected render bug');
    },
    lazyDeps
  );
  const runtimePayload = (LazyRuntimeFail as unknown as { _payload: { _result: () => Promise<unknown> } })._payload;
  await assert.rejects(() => runtimePayload._result(), /Unexpected render bug/);
  assert.equal(lazyReloads, 1);
  console.log('[PASS] 3. lazyWithRetry auto-reloads once on stale chunk and surfaces persistent/non-chunk errors to ErrorBoundary');
}

runTests().catch((err) => {
  console.error(err);
  process.exit(1);
});
