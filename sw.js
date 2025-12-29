// Service Worker for Deco Theory PWA
const CACHE_NAME = 'deco-theory-v2';

// Files to cache for offline use
const STATIC_ASSETS = [
  './',
  './index.html',
  './about.html',
  './dive-setup.html',
  './pressure.html',
  './tissue-loading.html',
  './quiz-anatomy.html',
  './quiz-physics.html',
  './css/styles.css',
  './js/main.js',
  './js/decoModel.js',
  './js/diveProfile.js',
  './js/diveSetup.js',
  './js/quiz.js',
  './js/tissueCompartments.js',
  './js/visualization.js',
  './data/dive-profiles.json',
  './data/dive-setup.json',
  './data/quiz-anatomy.json',
  './data/quiz-physics.json',
  './manifest.json'
];

// Install event - cache static assets
self.addEventListener('install', (event) => {
  console.log('[SW] Installing service worker...');
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        console.log('[SW] Caching static assets');
        return cache.addAll(STATIC_ASSETS);
      })
      .then(() => {
        // Activate immediately without waiting
        return self.skipWaiting();
      })
  );
});

// Activate event - clean up old caches
self.addEventListener('activate', (event) => {
  console.log('[SW] Activating service worker...');
  event.waitUntil(
    caches.keys()
      .then((cacheNames) => {
        return Promise.all(
          cacheNames
            .filter((name) => name !== CACHE_NAME)
            .map((name) => {
              console.log('[SW] Deleting old cache:', name);
              return caches.delete(name);
            })
        );
      })
      .then(() => {
        // Take control of all pages immediately
        return self.clients.claim();
      })
  );
});

// Fetch event - serve from cache, fallback to network
self.addEventListener('fetch', (event) => {
  // Only handle GET requests
  if (event.request.method !== 'GET') {
    return;
  }

  event.respondWith(
    caches.match(event.request)
      .then((cachedResponse) => {
        if (cachedResponse) {
          // Return cached version
          return cachedResponse;
        }

        // Not in cache, fetch from network
        return fetch(event.request)
          .then((networkResponse) => {
            // Don't cache non-successful responses
            if (!networkResponse || networkResponse.status !== 200) {
              return networkResponse;
            }

            // Clone the response before caching
            const responseToCache = networkResponse.clone();
            
            caches.open(CACHE_NAME)
              .then((cache) => {
                cache.put(event.request, responseToCache);
              });

            return networkResponse;
          })
          .catch(() => {
            // Network failed, could return offline page here
            console.log('[SW] Network request failed for:', event.request.url);
          });
      })
  );
});
