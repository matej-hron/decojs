// Service Worker for Deco Theory PWA
const CACHE_NAME = 'deco-theory-0.5.70';

// Files to cache for offline use
const STATIC_ASSETS = [
  './',
  './index.html',
  './about.html',
  './privacy.html',

  './pressure.html',
  './tissue-loading.html',
  './m-values.html',
  './gradient-factors.html',
  './quiz-anatomy.html',
  './quiz-physics.html',
  './quiz-accidents.html',
  './quiz-safety.html',
  './quiz-training.html',
  './quiz-equipment.html',
  './quiz-vessel.html',
  './sandbox/index.html',
  './sandbox/haldane.html',
  './sandbox/tissue-saturation.html',
  './sandbox/transfilling.html',
  './sandbox/cascade-filling.html',
  './sandbox/chart-test.html',
  './sandbox/editor-test.html',
  './css/styles.css',
  './fonts/fraunces-latin.woff2',
  './fonts/fraunces-latin-ext.woff2',
  './fonts/inter-latin.woff2',
  './fonts/inter-latin-ext.woff2',
  './icons/sprite.svg',
  './js/icons.js',
  './js/main.js',
  './js/nav.js',
  './js/decoModel.js',
  './js/diveProfile.js',
  './js/diveSetup.js',
  './js/mvalues.js',
  './js/quiz.js',
  './js/tissueCompartments.js',
  './js/tissueEducation.js',
  './js/visualization.js',
  './js/charts/chartTheme.js',
  './js/charts/interactionLock.js',
  './js/charts/chartTypes.js',
  './js/charts/DiveProfileChart.js',
  './js/charts/MValueChart.js',
  './js/components/DiveSetupEditor.js',
  './js/components/HeroMotion.js',
  './js/components/StickyTOC.js',
  './js/components/TissueSaturationSim.js',
  './js/components/tooltipShortcut.js',
  './images/gas-particles.gif',
  './js/urlParams.js',
  './js/i18n.js',
  './locales/en.json',
  './locales/cs.json',
  './locales/es.json',
  './data/dive-profiles.json',
  './data/dive-setup.json',
  './data/quiz-anatomy.json',
  './data/quiz-physics.json',
  './data/quiz-accidents.json',
  './data/quiz-safety.json',
  './data/quiz-training.json',
  './data/quiz-equipment.json',
  './data/quiz-vessel.json',
  './data/quiz-physics-en.json',
  './data/quiz-physics-es.json',
  './data/quiz-anatomy-en.json',
  './data/quiz-anatomy-es.json',
  './data/quiz-accidents-en.json',
  './data/quiz-accidents-es.json',
  './data/quiz-safety-en.json',
  './data/quiz-safety-es.json',
  './data/quiz-training-en.json',
  './data/quiz-training-es.json',
  './data/quiz-equipment-en.json',
  './data/quiz-equipment-es.json',
  './data/quiz-vessel-en.json',
  './data/quiz-vessel-es.json',
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
