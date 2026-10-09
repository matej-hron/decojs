import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const ORIGIN = 'https://decotheory.eu';

function loadSw(overrides = {}) {
    const listeners = {};
    const ctx = {
        console: { log() {} },
        URL, Response,
        Request: class { constructor(u, init = {}) { this.url = new URL(u, ORIGIN + '/sw.js').href; Object.assign(this, init); } }, setTimeout, clearTimeout, Promise,
        self: { location: { origin: ORIGIN }, addEventListener: (t, f) => { listeners[t] = f; } },
        ...overrides,
    };
    vm.createContext(ctx);
    vm.runInContext(readFileSync(new URL('../sw.js', import.meta.url), 'utf8') +
        '\n;this.__sw = { routeFor, STATIC_ASSETS };', ctx);
    return { sw: ctx.__sw, listeners };
}

const req = (path, init = {}, extra = {}) => ({
    method: 'GET', url: path.startsWith('http') ? path : ORIGIN + path, mode: 'no-cors', destination: '',
    headers: new Headers(init.headers), ...extra,
});

test('routeFor: freshness-critical files are network-first', () => {
    const { sw } = loadSw();
    for (const p of ['/', '/index.html', '/js/nav.js', '/css/styles.css', '/locales/cs.json', '/data/quiz-physics.json', '/lab/dive-log.html']) {
        assert.equal(sw.routeFor(req(p), ORIGIN), 'network-first', p);
    }
    assert.equal(sw.routeFor(req('/pressure', {}, { mode: 'navigate' }), ORIGIN), 'network-first');
});

test('routeFor: static media stay cache-first', () => {
    const { sw } = loadSw();
    for (const p of ['/fonts/inter-latin.woff2', '/images/cmas-table-2018.png', '/icons/sprite.svg']) {
        assert.equal(sw.routeFor(req(p), ORIGIN), 'cache-first', p);
    }
});

test('routeFor: never handles non-GET, range, video or foreign API calls', () => {
    const { sw } = loadSw();
    assert.equal(sw.routeFor(req('/x.js', {}, { method: 'POST' }), ORIGIN), 'bypass');
    assert.equal(sw.routeFor(req('/v.mp4', { headers: { range: 'bytes=0-' } }), ORIGIN), 'bypass');
    assert.equal(sw.routeFor(req('/v.mp4', {}, { destination: 'video' }), ORIGIN), 'bypass');
    for (const u of ['https://abc.supabase.co/rest/v1/dives', 'https://api.mapy.cz/v1/geocode', 'https://nominatim.openstreetmap.org/search?q=x']) {
        assert.equal(sw.routeFor(req(u), ORIGIN), 'bypass', u);
    }
    assert.equal(sw.routeFor(req('https://cdn.jsdelivr.net/npm/katex@0.16.9/dist/katex.min.css'), ORIGIN), 'cache-first');
});

test('install fetches every asset bypassing the HTTP cache', async () => {
    const fetched = [], stored = [];
    const cache = { put: async (u) => { stored.push(u); } };
    const { sw, listeners } = loadSw({
        caches: { open: async () => cache },
        fetch: async (r) => { fetched.push(r); return new Response('ok', { status: 200 }); },
    });
    let done;
    listeners.install({ waitUntil: (p) => { done = p; } });
    await done.catch(() => {}); // skipWaiting is not stubbed on self
    assert.equal(fetched.length, sw.STATIC_ASSETS.length);
    assert.ok(fetched.every((r) => r.cache === 'reload'));
    assert.equal(stored.length, sw.STATIC_ASSETS.length);
});

test('network-first serves fresh network response, falls back to cache offline', async () => {
    const cached = new Response('old');
    let online = true;
    const { listeners } = loadSw({
        caches: { match: async () => cached, open: async () => ({ put: async () => {} }) },
        fetch: async () => { if (!online) throw new TypeError('offline'); return new Response('new', { status: 200 }); },
    });
    const run = (request) => new Promise((res) => listeners.fetch({ request, respondWith: res }));
    assert.equal(await (await run(req('/js/nav.js'))).text(), 'new');
    online = false;
    assert.equal(await (await run(req('/js/nav.js'))).text(), 'old');
});
