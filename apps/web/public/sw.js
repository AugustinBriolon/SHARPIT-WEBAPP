// The installed carnet's service worker (ADR-145). It keeps one thing: the page shown when the
// network is gone. No page and no reading is ever cached, so nothing stale can be served, which
// is what retired the old web app's worker (ADR-072). Activating also drops that old worker's
// caches.
const OFFLINE_CACHE = 'sharpit-offline-v1';
const OFFLINE_PAGE = '/offline.html';

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(OFFLINE_CACHE)
      .then((cache) => cache.add(new Request(OFFLINE_PAGE, { cache: 'reload' })))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys.filter((key) => key !== OFFLINE_CACHE).map((key) => caches.delete(key)),
      );
      await self.clients.claim();
    })(),
  );
});

self.addEventListener('fetch', (event) => {
  if (event.request.mode !== 'navigate') {
    return;
  }
  event.respondWith(
    fetch(event.request).catch(async () => {
      const cache = await caches.open(OFFLINE_CACHE);
      return (await cache.match(OFFLINE_PAGE)) ?? Response.error();
    }),
  );
});
