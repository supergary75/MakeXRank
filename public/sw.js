const CACHE_NAME = 'makexrank-pwa-v3';
const APP_SCOPE = self.registration.scope;

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll([APP_SCOPE, `${APP_SCOPE}manifest.webmanifest`, `${APP_SCOPE}pwa-icon.svg`]))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') {
    return;
  }

  const url = new URL(request.url);
  if (url.origin !== self.location.origin || !url.pathname.startsWith(new URL(APP_SCOPE).pathname)) {
    return;
  }

  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request, { cache: 'no-store' })
        .then((response) => {
          const copy = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(APP_SCOPE, copy));
          return response;
        })
        .catch(() => caches.match(APP_SCOPE)),
    );
    return;
  }

  const isVersionedAsset = url.pathname.includes('/assets/');
  event.respondWith(
    (isVersionedAsset ? caches.match(request) : Promise.resolve(undefined)).then((cached) => {
      if (cached) return cached;

      return fetch(request, isVersionedAsset ? undefined : { cache: 'no-store' }).then((response) => {
        if (response.ok && isVersionedAsset) {
          const copy = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
        }
        return response;
      });
    }),
  );
});
