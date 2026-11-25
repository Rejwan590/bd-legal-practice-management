/**
 * Lawyers eChamber - Chamber Practice Management PWA Service Worker
 * Scope: Strictly isolated to Chamber App (/)
 * Guard: Bypasses /admin/ (Super Admin) and /api/ (REST API) completely.
 */

const CACHE_NAME = 'echamber-shell-v1';
const PRECACHE_ASSETS = [
  '/',
  '/index.html',
  '/favicon.svg',
  '/manifest.webmanifest',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  '/icons/apple-touch-icon.png'
];

// Install: Pre-cache static shell assets
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(PRECACHE_ASSETS);
    }).then(() => self.skipWaiting())
  );
});

// Activate: Clean up old caches and take immediate control
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))
      );
    }).then(() => self.clients.claim())
  );
});

// Fetch: Strict routing and caching policy
self.addEventListener('fetch', (event) => {
  const request = event.request;
  const url = new URL(request.url);

  // 1. HARD INVARIANT: NEVER intercept Super Admin routes
  if (url.pathname.startsWith('/admin')) {
    return;
  }

  // 2. HARD INVARIANT: NEVER cache backend REST API calls or mutating requests
  if (url.pathname.startsWith('/api') || request.method !== 'GET') {
    return;
  }

  // 3. Ignore non-HTTP/HTTPS and dev server requests
  if (!url.protocol.startsWith('http') || url.pathname.includes('/@vite/') || url.pathname.includes('/@fs/')) {
    return;
  }

  // 4. HTML Navigation: Network-first to always serve the latest chamber build
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request).catch(() => caches.match('/index.html'))
    );
    return;
  }

  // 5. Static Assets (/assets/*): Cache-first with network fallback
  if (url.pathname.startsWith('/assets/') || url.pathname.startsWith('/icons/')) {
    event.respondWith(
      caches.match(request).then((cachedResponse) => {
        if (cachedResponse) {
          return cachedResponse;
        }
        return fetch(request).then((networkResponse) => {
          if (networkResponse && networkResponse.status === 200) {
            const responseToCache = networkResponse.clone();
            caches.open(CACHE_NAME).then((cache) => {
              cache.put(request, responseToCache);
            });
          }
          return networkResponse;
        });
      })
    );
    return;
  }

  // 6. Default: Network with cache fallback
  event.respondWith(
    fetch(request).catch(() => caches.match(request))
  );
});
