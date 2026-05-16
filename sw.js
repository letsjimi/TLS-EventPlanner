/**
 * TLS Event Manager — Service Worker
 * Cache-first für statische Assets, Dexie/IndexedDB bleibt unangetastet
 */

const CACHE_NAME = 'tls-eventmanager-v4';
const STATIC_FILES = [
  '/',
  '/index.html',
  '/css/app.css',
  '/css/mobile.css',
  '/js/version-check.js',
  '/js/db.js',
  '/js/api.js',
  '/js/components.js',
  '/js/auth.js',
  '/js/app.js',
  '/manifest.json',
  '/assets/icon.svg',
  '/assets/icon-192.svg',
  'https://unpkg.com/dexie@3.2.4/dist/dexie.min.js',
  'https://unpkg.com/lucide@latest'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(STATIC_FILES))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((names) =>
      Promise.all(
        names
          .filter((n) => n !== CACHE_NAME)
          .map((n) => caches.delete(n))
      )
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);

  // Cache-Busting-Parameter → IMMER frisch holen
  if (url.searchParams.has('_v') || url.searchParams.has('_cb') || url.searchParams.has('noCache')) {
    event.respondWith(fetch(req));
    return;
  }

  // CDN-Ressourcen: Network → Cache fallback
  if (req.url.includes('unpkg.com')) {
    event.respondWith(
      fetch(req).catch(() => caches.match(req))
    );
    return;
  }

  // Index.html: IMMER Network-First (damit Version-Check funktioniert)
  if (url.pathname === '/' || url.pathname.endsWith('/index.html')) {
    event.respondWith(
      fetch(req).then((response) => {
        if (response && response.status === 200 && response.type === 'basic') {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(req, clone));
        }
        return response;
      }).catch(() => caches.match(req))
    );
    return;
  }

  // Alle anderen lokale statische Files: Cache first → Network
  event.respondWith(
    caches.match(req).then((cached) => {
      if (cached) return cached;
      return fetch(req).then((response) => {
        if (!response || response.status !== 200 || response.type !== 'basic') {
          return response;
        }
        const clone = response.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(req, clone));
        return response;
      });
    })
  );
});
