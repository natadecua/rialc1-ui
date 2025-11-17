const STATIC_CACHE = 'rialc-static-v1';
const TILE_CACHE = 'rialc-tiles-v1';
const DATA_CACHE = 'rialc-data-v1';

const CORE_ASSETS = [
  '/',
  '/index.html',
  '/view_lamesa.html',
  '/lamesa_3d_viewer.html',
  '/lamesa_potree_viewer.html',
  '/style.css',
  '/script.js',
  '/js/colors.js',
  '/js/data-loader.js',
  '/js/predictions.js',
  '/js/pointcloud-viewer.js',
  '/js/potree-launcher.js',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(STATIC_CACHE)
      .then((cache) => cache.addAll(CORE_ASSETS))
      .then(() => self.skipWaiting())
      .catch((error) => console.warn('[sw] Install cache failed:', error))
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys.map((key) => {
            if (![STATIC_CACHE, TILE_CACHE, DATA_CACHE].includes(key)) {
              return caches.delete(key);
            }
            return null;
          })
        )
      )
      .then(() => self.clients.claim())
  );
});

function cacheFirst(event, cacheName) {
  event.respondWith(
    caches.open(cacheName).then((cache) =>
      cache.match(event.request).then((cachedResponse) => {
        if (cachedResponse) {
          return cachedResponse;
        }

        return fetch(event.request)
          .then((networkResponse) => {
            if (networkResponse && networkResponse.status === 200) {
              cache.put(event.request, networkResponse.clone());
            }
            return networkResponse;
          })
          .catch(() => cachedResponse);
      })
    )
  );
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') {
    return;
  }

  // Allow HEAD probes for shapefiles to hit the network directly.
  if (request.method === 'HEAD') {
    return;
  }

  const url = new URL(request.url);

  if (url.origin !== self.location.origin) {
    return;
  }

  if (url.pathname.startsWith('/tiles/')) {
    cacheFirst(event, TILE_CACHE);
    return;
  }

  if (
    url.pathname.startsWith('/raw_data/shapefiles/') ||
    url.pathname.startsWith('/raw_data/crown_shp/') ||
    url.pathname.endsWith('/prediction_results_top5_metrics.csv')
  ) {
    cacheFirst(event, DATA_CACHE);
    return;
  }

  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response && response.status === 200) {
            const cloned = response.clone();
            caches.open(STATIC_CACHE).then((cache) => cache.put(request, cloned));
          }
          return response;
        })
        .catch(() => caches.match(request).then((match) => match || caches.match('/index.html')))
    );
  }
});
