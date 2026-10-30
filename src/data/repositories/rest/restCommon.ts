export const DEFAULT_TIMEOUT_MS = 15000;

export interface RestApiError extends Error {
  status?: number;
  code?: string;
}

export function createRestError(message: string, status?: number, code?: string): RestApiError {
  const err: RestApiError = new Error(message);
  if (status !== undefined) err.status = status;
  if (code !== undefined) err.code = code;
  return err;
}

/**
 * Resolves the API base URL.
 * In development, defaults to 'http://localhost:4000/api/v1'.
 * In production builds, throws a clear startup error if VITE_API_BASE_URL is not configured.
 */
export function getApiBaseUrl(): string {
  const isDev =
    (typeof import.meta !== 'undefined' && Boolean(import.meta.env?.DEV)) ||
    (typeof process !== 'undefined' && process.env?.NODE_ENV !== 'production');
  const configuredUrl =
    (typeof import.meta !== 'undefined' ? import.meta.env?.VITE_API_BASE_URL : undefined) ||
    (typeof process !== 'undefined' ? process.env?.VITE_API_BASE_URL : undefined);

  if (!configuredUrl) {
    if (isDev) {
      return 'http://localhost:4000/api/v1';
    }
    throw new Error('FATAL: VITE_API_BASE_URL environment variable is missing. Localhost fallback is disabled in production builds.');
  }

  return configuredUrl;
}

export const API_BASE_URL = typeof import.meta !== 'undefined' && import.meta.env?.DEV
  ? (import.meta.env.VITE_API_BASE_URL || 'http://localhost:4000/api/v1')
  : (typeof import.meta !== 'undefined' && import.meta.env?.VITE_API_BASE_URL ? import.meta.env.VITE_API_BASE_URL : '');

export interface RestFetchOptions extends RequestInit {
  timeoutMs?: number;
}

export async function restFetch<T>(
  endpoint: string,
  options: RestFetchOptions = {}
): Promise<T> {
  const baseUrl = endpoint.startsWith('http') ? '' : getApiBaseUrl();
  const url = endpoint.startsWith('http') ? endpoint : `${baseUrl}${endpoint}`;

  const headers = new Headers(options.headers || {});
  if (!headers.has('Content-Type') && options.body) {
    headers.set('Content-Type', 'application/json');
  }

  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => {
    controller.abort();
  }, timeoutMs);

  try {
    const response = await fetch(url, {
      ...options,
      headers,
      credentials: 'include', // Sends httpOnly access_token cookie
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    // 401 Unauthorized handling: trigger login redirect if in browser context
    if (response.status === 401) {
      if (typeof window !== 'undefined' && window.location) {
        if (!window.location.pathname.startsWith('/admin') && !window.location.pathname.includes('/login') && window.location.pathname !== '/') {
          window.location.href = '/login';
        }
      }
      throw createRestError('Session expired or unauthorized. Please log in again.', 401, 'UNAUTHORIZED');
    }

    if (!response.ok) {
      const errorText = await response.text().catch(() => '');
      let errorBody: Record<string, unknown> = {};
      try {
        if (errorText) errorBody = JSON.parse(errorText);
      } catch {
        // Response wasn't JSON
      }
      const message =
        (typeof errorBody.message === 'string' && errorBody.message) ||
        (typeof errorBody.error === 'string' && errorBody.error) ||
        (errorText && errorText.length < 200 ? errorText : `HTTP error ${response.status}`);
      const code = typeof errorBody.code === 'string' ? errorBody.code : undefined;
      throw createRestError(message, response.status, code);
    }

    // Handle 204 No Content
    if (response.status === 204) {
      return undefined as unknown as T;
    }

    // Handle empty body responses
    const text = await response.text();
    if (!text || !text.trim()) {
      return undefined as unknown as T;
    }

    try {
      return JSON.parse(text) as T;
    } catch {
      return text as unknown as T;
    }
  } catch (err: unknown) {
    clearTimeout(timeoutId);

    // Timeout / abort handling
    const isAbort = (err instanceof Error && err.name === 'AbortError') || controller.signal.aborted;
    if (isAbort) {
      throw createRestError(
        `Request timed out after ${timeoutMs / 1000} seconds. Please check your network connection.`,
        408,
        'REQUEST_TIMEOUT'
      );
    }

    // Network / connection failures
    if (
      err instanceof TypeError &&
      (err.message.includes('fetch') ||
        err.message.includes('Failed to fetch') ||
        err.message.includes('network') ||
        err.message.includes('ECONNREFUSED'))
    ) {
      throw createRestError(
        `Network failure: Unable to connect to the server at ${url}. Please check your connection.`,
        undefined,
        'NETWORK_FAILURE'
      );
    }

    throw err;
  }
}
