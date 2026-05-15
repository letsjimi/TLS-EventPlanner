/**
 * TLS Event Manager — Service Worker
 * Cache-first für statische Assets, Dexie/IndexedDB bleibt unangetastet
 */

const CACHE_NAME = 'tls-eventmanager-v2';
const STATIC_FILES = [
  '/',
  '/index.html',
  '/css/app.css',
  '/css/mobile.css',
  '/js/db.js',
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

  // CDN-Ressourcen: Network → Cache fallback
  if (req.url.includes('unpkg.com')) {
    event.respondWith(
      fetch(req).catch(() => caches.match(req))
    );
    return;
  }

  // Lokale statische Files: Cache first → Network
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
