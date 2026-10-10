// Service Worker for Deco Theory PWA
const CACHE_NAME = 'deco-theory-0.6.222';

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
  './algorithm.html',
  './quiz-anatomy.html',
  './quiz-physics.html',
  './quiz-accidents.html',
  './quiz-safety.html',
  './quiz-training.html',
  './quiz-equipment.html',
  './quiz-vessel.html',
  './sandbox/index.html',
  './sandbox/haldane.html',
  './sandbox/m-values.html',
  './sandbox/tissue-saturation.html',
  './sandbox/bubble-mechanics.html',
  './sandbox/transfilling.html',
  './sandbox/cascade-filling.html',
  './sandbox/chart-test.html',
  './sandbox/editor-test.html',
  './sandbox/repetitive-dives.html',
  './sandbox/deco-table.html',
  './lab/dive-log.html',
  './lab/dive.html',
  './data/cmas-deco-tables.json',
  './css/styles.css',
  './css/trail.css',
  './fonts/fraunces-latin.woff2',
  './fonts/fraunces-latin-ext.woff2',
  './fonts/inter-latin.woff2',
  './fonts/inter-latin-ext.woff2',
  './icons/sprite.svg',
  './icons/icon.svg',
  './js/charts/BubbleModel.js',
  './js/nav.js',
  './js/swRegister.js',
  './js/appBanner.js',
  './js/decoModel.js',
  './js/deco/constants.js',
  './js/deco/config.js',
  './js/deco/environment.js',
  './js/deco/gasKinetics.js',
  './js/deco/gradients.js',
  './js/deco/ceiling.js',
  './js/deco/schedule.js',
  './js/deco/profile.js',
  './js/diveSetup.js',
  './js/tripPlanner.js',
  './js/preSaturation.js',
  './js/quiz.js',
  './js/tissueCompartments.js',
  './js/tissueEducation.js',
  './js/charts/chartTheme.js',
  './js/algorithmExplainer.js',
  './js/charts/interactionLock.js',
  './js/charts/narrowLayout.js',
  './js/charts/touchReadout.js',
  './js/charts/chartTypes.js',
  './js/charts/DiveProfileChart.js',
  './js/charts/MValueChart.js',
  './js/charts/GFChart.js',
  './js/components/DiveSetupEditor.js',
  './js/components/RuntimeTable.js',
  './js/components/DecisionAudit.js',
  './js/components/HeroMotion.js',
  './js/components/StickyTOC.js',
  './js/components/TissueSaturationSim.js',
  './js/components/tooltipShortcut.js',
  './js/components/VideoWalkthrough.js',
  './js/tripState.js',
  './js/tripTime.js',
  './js/calendarLayout.js',
  './js/components/TripCalendar.js',
  './js/components/DiveEditPanel.js',
  './js/components/AddDiveDialog.js',
  './js/components/RecordedDiveAnalysis.js',
  './js/import/divesoftDlf.js',
  './js/import/recordedDive.js',
  './js/import/recordedGas.js',
  './js/import/thinProfile.js',
  './js/import/recordedDiveSummary.js',
  './js/import/diveChain.js',
  './js/backend/config.js',
  './js/backend/sync.js',
  './js/backend/supabaseStore.js',
  './js/backend/diveStore.js',
  './js/logbook/DeleteData.js',
  './js/logbook/entryModel.js',
  './js/logbook/gasModel.js',
  './js/logbook/router.js',
  './js/logbook/listViews.js',
  './js/logbook/feed.js',
  './js/logbook/geo.js',
  './js/logbook/SitePicker.js',
  './js/logbook/SitesPage.js',
  './js/logbook/EntryDetail.js',
  './js/logbook/EntryForm.js',
  './js/logbook/MediaSection.js',
  './js/logbook/NewDive.js',
  './js/logbook/photo.js',
  './js/logbook/transfer.js',
  './js/logbook/LogbookApp.js',
  './js/logbook/AppShell.js',
  './js/backend/communityStore.js',
  './js/logbook/community.js',
  './js/logbook/avatars.js',
  './js/logbook/feedCard.js',
  './js/logbook/sparks.js',
  './js/logbook/CommunityFeed.js',
  './js/logbook/MembersPage.js',
  './js/logbook/MemberPage.js',
  './js/logbook/ProfilePage.js',
  './js/logbook/memberEntryStore.js',
  './js/logbook/share.js',
  './js/logbook/ShareCard.js',
  './js/logbook/shareAction.js',
  './js/logbook/siteMap.js',
  './js/logbook/SharedDivePage.js',
  './js/backend/shareStore.js',
  './js/ndlPreview.js',
  './js/gfLimits.js',
  './js/gfPresets.js',
  './images/gas-particles.gif',
  './images/cmas-table-2018.png',
  './js/urlParams.js',
  './js/utils/escHtml.js',
  './js/warningHtml.js',
  './js/tripUrl.js',
  './js/i18n.js',
  './js/format.js',
  './js/cmasTables.js',
  './js/decoTableSteps.js',
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

// Network-first requests fall back to the cache after this long, so a flaky
// connection still opens quickly while an online reload always gets fresh files.
const NETWORK_TIMEOUT_MS = 3000;

// Versioned third-party assets (KaTeX) are immutable, so they stay cache-first.
const CACHEABLE_ORIGINS = ['https://cdn.jsdelivr.net'];

// Decide how a request is served: 'bypass' (browser handles it), 'network-first'
// (pages, scripts, styles, JSON: must be fresh after a release) or 'cache-first'
// (images, fonts, other static media).
function routeFor(request, selfOrigin) {
  if (request.method !== 'GET') return 'bypass';
  // Videos stream via range requests; let the browser fetch them directly
  if (request.destination === 'video' || request.headers.has('range')) return 'bypass';

  const url = new URL(request.url);
  if (url.origin !== selfOrigin) {
    // Supabase, Mapy, Nominatim etc. are never cached
    return CACHEABLE_ORIGINS.includes(url.origin) ? 'cache-first' : 'bypass';
  }

  if (request.mode === 'navigate' || request.destination === 'document') return 'network-first';
  if (/\.(?:html|js|mjs|css|json)$/i.test(url.pathname) || url.pathname.endsWith('/')) return 'network-first';
  return 'cache-first';
}

function putInCache(request, response) {
  // Cross-origin CDN scripts arrive opaque (status 0) and are still cacheable
  if (!response || (response.status !== 200 && response.type !== 'opaque')) return;
  const copy = response.clone();
  caches.open(CACHE_NAME).then((cache) => cache.put(request, copy)).catch(() => {});
}

function networkFirst(request) {
  return new Promise((resolve) => {
    let settled = false;
    const fromCache = () => caches.match(request, { ignoreSearch: request.mode === 'navigate' });
    const timer = setTimeout(() => {
      fromCache().then((cached) => {
        if (cached && !settled) { settled = true; resolve(cached); }
      });
    }, NETWORK_TIMEOUT_MS);

    // 'no-cache' revalidates, so the HTTP cache (max-age=600) cannot serve stale files
    fetch(request, { cache: 'no-cache' })
      .then((response) => {
        clearTimeout(timer);
        putInCache(request, response);
        if (!settled) { settled = true; resolve(response); }
      })
      .catch(() => {
        clearTimeout(timer);
        fromCache().then((cached) => {
          if (!settled) { settled = true; resolve(cached || Response.error()); }
        });
      });
  });
}

function cacheFirst(request) {
  return caches.match(request).then((cached) => {
    if (cached) return cached;
    return fetch(request).then((response) => {
      putInCache(request, response);
      return response;
    });
  });
}

// Install event - cache static assets
self.addEventListener('install', (event) => {
  console.log('[SW] Installing service worker...');
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        console.log('[SW] Caching static assets');
        // 'reload' skips the HTTP cache (GitHub Pages max-age=600), so a new
        // release never fills its cache with stale files.
        return Promise.all(STATIC_ASSETS.map((url) =>
          fetch(new Request(url, { cache: 'reload' })).then((response) => {
            if (!response.ok) throw new Error(`[SW] ${url} -> ${response.status}`);
            return cache.put(url, response);
          })
        ));
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

// Fetch event - see routeFor() for the strategy per request
self.addEventListener('fetch', (event) => {
  const route = routeFor(event.request, self.location.origin);
  if (route === 'bypass') return;
  event.respondWith(route === 'network-first' ? networkFirst(event.request) : cacheFirst(event.request));
});
