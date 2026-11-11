import React, { ComponentType, LazyExoticComponent } from 'react';

const CHUNK_RELOAD_STORAGE_KEY = 'bdlegal_chunk_reload_at';
const CHUNK_RELOAD_COOLDOWN_MS = 15_000;

const CHUNK_ERROR_PATTERNS = [
  'Failed to fetch dynamically imported module',
  'Importing a module script failed',
  'error loading dynamically imported module',
  'Unable to preload CSS',
  'Expected a JavaScript-or-Wasm module script',
  'Failed to load module script',
];

/**
 * Returns true if the error represents a stale/failed Vite dynamic chunk or CSS preload.
 */
export function isChunkLoadError(error: unknown): boolean {
  if (!error) return false;
  if (typeof error === 'object' && 'name' in error && (error as { name?: unknown }).name === 'ChunkLoadError') {
    return true;
  }
  const message =
    error instanceof Error
      ? error.message
      : typeof error === 'string'
      ? error
      : String(error);
  const normalized = message.toLowerCase();
  return CHUNK_ERROR_PATTERNS.some((pattern) => normalized.includes(pattern.toLowerCase()));
}

/**
 * Clears the chunk-reload cooldown marker so a subsequent explicit retry can reload immediately.
 */
export function clearChunkReloadGuard(storage: Pick<Storage, 'removeItem'> | undefined = getSafeSessionStorage()): void {
  try {
    storage?.removeItem(CHUNK_RELOAD_STORAGE_KEY);
  } catch {
    // Ignore storage restriction errors
  }
}

function getSafeSessionStorage(): Storage | undefined {
  try {
    return typeof window !== 'undefined' ? window.sessionStorage : undefined;
  } catch {
    return undefined;
  }
}

export interface ChunkReloadDeps {
  storage?: Pick<Storage, 'getItem' | 'setItem'>;
  reload?: () => void;
  now?: () => number;
}

/**
 * Triggers a single full-page reload when a stale deployment chunk fails to load,
 * guarded by a short cooldown in sessionStorage to prevent reload loops.
 */
export function triggerChunkReloadOnce(deps: ChunkReloadDeps = {}): boolean {
  const reloadFn = deps.reload ?? (typeof window !== 'undefined' ? () => window.location.reload() : undefined);
  if (!reloadFn) return false;

  const nowMs = deps.now ? deps.now() : Date.now();
  const storage = deps.storage ?? getSafeSessionStorage();

  try {
    const lastReloadRaw = storage?.getItem(CHUNK_RELOAD_STORAGE_KEY);
    const lastReloadMs = lastReloadRaw ? Number(lastReloadRaw) : 0;
    if (Number.isFinite(lastReloadMs) && lastReloadMs > 0 && nowMs - lastReloadMs < CHUNK_RELOAD_COOLDOWN_MS) {
      return false;
    }
    storage?.setItem(CHUNK_RELOAD_STORAGE_KEY, String(nowMs));
  } catch {
    // If sessionStorage is blocked, avoid unbounded auto-reload loops
    return false;
  }

  reloadFn();
  return true;
}

/**
 * Wraps React.lazy with automatic single-reload recovery when a deployed bundle's
 * hashed asset filenames change while a user tab is already open.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function lazyWithRetry<T extends ComponentType<any>>(
  importer: () => Promise<{ default: T }>,
  deps: ChunkReloadDeps = {}
): LazyExoticComponent<T> {
  return React.lazy(async () => {
    try {
      return await importer();
    } catch (error) {
      if (isChunkLoadError(error) && triggerChunkReloadOnce(deps)) {
        // Keep Suspense fallback mounted until the browser completes navigation reload
        return new Promise<{ default: T }>(() => {});
      }
      throw error;
    }
  });
}
