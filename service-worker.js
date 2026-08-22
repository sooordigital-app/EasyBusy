// EasyBusy PWA service worker
// Strategy:
// - HTML / navigation requests (the app shell): NETWORK-FIRST, so an already-installed
//   app always picks up the newest deployed version instead of showing an old cached copy.
//   Falls back to the cached copy only when there's no internet.
// - Static assets (icons, manifest): cache-first, refreshed quietly in the background.
//
// IMPORTANT: bump CACHE_NAME (v1 -> v2 -> v3 ...) every time you redeploy.
// That's what makes the old cache get deleted below and forces the new files to load.
const CACHE_NAME = 'easybusy-v7';
const APP_SHELL = [
  './manifest.json',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-192.png',
  './icons/icon-maskable-512.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting()) // don't wait for old tabs to close, activate right away
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))
      ))
      .then(() => self.clients.claim()) // take control of any already-open tabs immediately
      .then(() => self.clients.matchAll({ type: 'window' }))
      .then((clients) => {
        // tell every open tab (including the installed home-screen app) that a new
        // version just took over, so it can reload itself automatically
        clients.forEach((client) => client.postMessage({ type: 'SW_UPDATED' }));
      })
  );
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;

  // Navigation requests = loading the app shell itself -> always prefer the network
  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
          return response;
        })
        .catch(() => caches.match(event.request)) // offline -> fall back to last cached version
    );
    return;
  }

  // Everything else (icons, manifest, etc.) -> cache-first, refresh in background
  event.respondWith(
    caches.match(event.request).then((cached) => {
      const networkFetch = fetch(event.request)
        .then((response) => {
          if (response && response.status === 200) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
          }
          return response;
        })
        .catch(() => cached); // offline — fall back to whatever's cached

      return cached || networkFetch;
    })
  );
});
