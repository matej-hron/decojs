/**
 * Shared dive page polish (migration 0009): approximate map area, activity-page detail layout, dive story,
 * exact location on by default, the Share card's location switch and the Share button in lists.
 * Run: node --test tests/share-polish.test.mjs
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { siteArea, sharedDiveParts } from '../js/logbook/share.js';
import { shareStoreFor } from '../js/backend/shareStore.js';
import { createSupabaseStore } from '../js/backend/supabaseStore.js';
import { siteMapHtml, AREA_RADIUS_M } from '../js/logbook/siteMap.js';
import { metersPerPixel, mapyStaticMapUrl } from '../js/logbook/geo.js';
import { heroKind, storyParagraphs, EntryDetail } from '../js/logbook/EntryDetail.js';
import { shareDive, shareButtonHtml, isLinkShared } from '../js/logbook/shareAction.js';
import { ShareCard } from '../js/logbook/ShareCard.js';

const TOKEN = 'ab'.repeat(32);
const tick = (ms = 20) => new Promise(r => setTimeout(r, ms));

async function withDom(fn, url = 'http://localhost/lab/dive-log.html#/dives') {
    const { JSDOM } = await import('jsdom');
    const dom = new JSDOM('<!doctype html><body><div id="host"></div></body>', { url });
    const saved = {};
    for (const k of ['window', 'document', 'location', 'history', 'navigator']) {
        saved[k] = Object.getOwnPropertyDescriptor(globalThis, k);
        Object.defineProperty(globalThis, k, { value: dom.window[k], configurable: true, writable: true });
    }
    try {
        return await fn(dom.window.document.getElementById('host'), dom.window);
    } finally {
        for (const [k, d] of Object.entries(saved)) {
            if (d) Object.defineProperty(globalThis, k, d); else delete globalThis[k];
        }
    }
}

// ---- Map position ----

test('siteArea: the exact site position wins; else the server area, never more precise than 2 decimals', () => {
    assert.deepEqual(siteArea({ lat: 49.66431, lon: 13.46682 }, { lat: 49.66, lon: 13.47, exact: false }), { lat: 49.66431, lon: 13.46682, exact: true });
    assert.deepEqual(siteArea({ lat: null, lon: null }, { lat: 49.66, lon: 13.47, exact: false }), { lat: 49.66, lon: 13.47, exact: false });
    assert.deepEqual(siteArea({ lat: null, lon: null }, { lat: 49.66431, lon: 13.46682, exact: false }), { lat: 49.66, lon: 13.47, exact: false }, 'rounded again on the client');
    assert.deepEqual(siteArea(null, { lat: 49.66431, lon: 13.46682, exact: true }), { lat: 49.66431, lon: 13.46682, exact: true });
    assert.equal(siteArea({ lat: null, lon: null }, null), null);
    assert.equal(siteArea(null, { lat: 91, lon: 0 }), null);
    assert.equal(siteArea(null, { lat: 'x', lon: 1 }), null);
    assert.equal(siteArea(null, { lat: null, lon: null }), null);
});

test('sharedDiveParts: carries the area and the dive story (description), never notes', () => {
    const p = sharedDiveParts({ entry: { id: 'e1', description: 'Story', notes: 'SECRET' }, site: { id: 's1', name: 'W', lat: null, lon: null } },
        { lat: 49.66, lon: 13.47, exact: false });
    assert.deepEqual(p.area, { lat: 49.66, lon: 13.47, exact: false });
    assert.equal(p.entry.description, 'Story');
    assert.equal(p.entry.notes, null);
});

function areaClient({ area = { lat: 49.66, lon: 13.47, exact: false }, areaError = null } = {}) {
    const calls = [];
    return {
        calls,
        async rpc(name, args) {
            calls.push(name);
            if (name === 'get_shared_dive_area') return { data: areaError ? null : area, error: areaError };
            return { data: { entry: { id: 'e1' }, site: { id: 's1', name: 'W', lat: null, lon: null } }, error: null, status: 200 };
        },
        storage: { from: () => ({ createSignedUrls: async () => ({ data: [], error: null }) }) },
    };
}

test('share store: asks get_shared_dive_area next to the dive; a missing function (0009 not run) means no area', async () => {
    const c = areaClient();
    const parts = await shareStoreFor(c, TOKEN).loadSharedDive();
    assert.deepEqual(c.calls.sort(), ['get_shared_dive', 'get_shared_dive_area']);
    assert.deepEqual(parts.area, { lat: 49.66, lon: 13.47, exact: false });
    const missing = await shareStoreFor(areaClient({ areaError: { code: 'PGRST202', message: 'no fn' } }), TOKEN).loadSharedDive();
    assert.equal(missing.area, null);
    assert.equal(missing.entry.id, 'e1', 'the dive still loads');
});

test('siteMapHtml: exact → marker, no circle; approximate → no marker, a ~1 km circle and the label', () => {
    const exact = siteMapHtml({ area: { lat: 49.66, lon: 13.47, exact: true }, apiKey: 'k', width: 640, height: 360, zoom: 13, alt: 'Map of <W>', areaLabel: 'Approximate area' });
    assert.match(exact, /markers=/);
    assert.doesNotMatch(exact, /lb-map-area|Approximate area/);
    assert.match(exact, /aria-label="Map of &lt;W&gt;"/);
    const approx = siteMapHtml({ area: { lat: 49.66, lon: 13.47, exact: false }, apiKey: 'k', width: 640, height: 360, zoom: 13, alt: 'Map', areaLabel: 'Approximate area' });
    assert.doesNotMatch(approx, /markers=/);
    const r = Number(/r="(\d+)"/.exec(approx)[1]);
    assert.equal(r, Math.round(AREA_RADIUS_M / metersPerPixel(49.66, 13)));
    assert.ok(r > 60 && r < 110, `radius ${r}px at zoom 13`);
    assert.match(approx, /lb-map-label">Approximate area/);
    const noKey = siteMapHtml({ area: { lat: 49.66, lon: 13.47, exact: true }, apiKey: '', width: 640, height: 360, alt: 'Map' });
    assert.doesNotMatch(noKey, /<img/, 'no key: the Leaflet fallback mounts instead');
});

test('mapyStaticMapUrl: marker can be left out', () => {
    assert.match(mapyStaticMapUrl({ lat: 1, lon: 2, apiKey: 'k', width: 10, height: 10 }), /markers=/);
    assert.doesNotMatch(mapyStaticMapUrl({ lat: 1, lon: 2, apiKey: 'k', width: 10, height: 10, marker: false }), /markers=/);
});

// ---- Layout helpers ----

test('heroKind: photo first, else the map, nothing before loading', () => {
    assert.equal(heroKind({ loaded: false, photos: 3, area: {} }), null);
    assert.equal(heroKind({ loaded: true, photos: 2, area: {} }), 'photo');
    assert.equal(heroKind({ loaded: true, photos: 0, area: {} }), 'map');
    assert.equal(heroKind({ loaded: true, photos: 0, area: null }), null);
});

test('storyParagraphs: blank lines split paragraphs, single breaks stay, empty → none', () => {
    assert.deepEqual(storyParagraphs('a\nb\n\n \n c \r\n\r\nd'), ['a\nb', 'c', 'd']);
    assert.deepEqual(storyParagraphs('  '), []);
    assert.deepEqual(storyParagraphs(null), []);
});

const ownStore = (extra = {}) => ({
    listSites: async () => [{ id: 's1', name: 'Wall', lat: 49.66431, lon: 13.46682 }],
    listMedia: async () => [], photoUrls: async () => new Map(), ...extra,
});

test('EntryDetail: story under the stats in paragraphs (hidden when empty); cards; no "More details" summary', async () => {
    await withDom(async host => {
        const entry = { id: 'e1', log_number: 3, dive_date: '2026-09-27', site_id: 's1', buddies: ['Pepa'], vis_shallow_m: 2, notes: 'mine',
            description: 'First <b>.\n\nSecond.', details: { weather: 'sunny', weightsKg: 8, rating: 4 } };
        const d = new EntryDetail(host, { store: ownStore(), entry });
        await tick();
        const story = host.querySelector('.lb-d-story');
        assert.equal(story.hidden, false);
        assert.deepEqual([...story.querySelectorAll('p')].map(p => p.textContent), ['First <b>.', 'Second.']);
        assert.ok(story.compareDocumentPosition(host.querySelector('.lb-d-grid')) & 4, 'the story comes before the columns');
        assert.ok(host.querySelector('.lb-d-hero .lb-d-map'), 'no photos: the map is the hero');
        assert.equal(host.querySelector('.lb-d-mapcard'), null, 'and not repeated in the side column');
        assert.ok(host.querySelector('.lb-d-cond'), 'conditions card');
        assert.ok(host.querySelector('.lb-d-buddies'), 'buddies card');
        assert.ok(host.querySelector('.lb-d-details'), 'details card');
        assert.equal(host.querySelector('details.lb-d-more'), null);
        assert.ok(host.querySelector('.lb-d-notes-card'), 'owner sees notes');
        assert.ok(host.querySelector('.lb-d-top .lb-d-edit'), 'Edit stays');
        assert.ok(host.querySelector('#lb-delete'), 'Delete stays');
        d.destroy();
        const plain = new EntryDetail(host, { store: ownStore(), entry: { ...entry, description: '  ', details: {} } });
        await tick();
        assert.equal(host.querySelector('.lb-d-story').hidden, true);
        assert.equal(host.querySelector('.lb-d-details'), null, 'nothing to show: no details card');
        plain.destroy();
    });
});

test('EntryDetail with photos: the first photo is the hero, the map moves to the side; the viewer steps through', async () => {
    await withDom(async host => {
        const media = [{ id: 'm1', kind: 'photo', path: 'a.jpg' }, { id: 'm2', kind: 'photo', path: 'b.jpg' }];
        const store = ownStore({ listMedia: async () => media, photoUrls: async paths => new Map(paths.map(p => [p, `https://img.test/${p}`])) });
        const d = new EntryDetail(host, { store, entry: { id: 'e1', dive_date: '2026-09-27', site_id: 's1', buddies: [], details: {} } });
        await tick();
        assert.equal(host.querySelector('.lb-d-hero img').getAttribute('src'), 'https://img.test/a.jpg');
        assert.ok(host.querySelector('.lb-d-mapcard .lb-map'));
        host.querySelector('.lb-d-hero-photo').click();
        const v = document.querySelector('.lb-viewer');
        assert.equal(v.querySelector('.lb-viewer-count').textContent, '1 / 2');
        document.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'ArrowRight' }));
        assert.equal(v.querySelector('img').getAttribute('src'), 'https://img.test/b.jpg');
        v.querySelector('.lb-viewer-next').click();
        assert.equal(v.querySelector('.lb-viewer-count').textContent, '1 / 2', 'wraps around');
        document.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Escape' }));
        assert.equal(document.querySelector('.lb-viewer'), null);
        d.destroy();
    });
});

test('EntryDetail read-only with an approximate area: map labelled, no notes; no area → no map', async () => {
    await withDom(async host => {
        const entry = { id: 'e1', dive_date: '2026-09-27', site_id: 's1', buddies: [], details: {}, notes: 'SECRET' };
        const store = { listSites: async () => [{ id: 's1', name: 'Wall', lat: null, lon: null }], listMedia: async () => [], photoUrls: async () => new Map() };
        const author = { name: 'A', avatarHtml: '', href: null };
        let d = new EntryDetail(host, { store, entry, readOnly: true, author, backHref: false, analysisHref: false, area: { lat: 49.66, lon: 13.47, exact: false } });
        await tick();
        assert.ok(host.querySelector('.lb-map--approx .lb-map-label'));
        assert.doesNotMatch(host.innerHTML, /SECRET/);
        assert.ok(d.slot && d.slot.classList.contains('lb-d-slot'), 'a slot for the analysis');
        d.destroy();
        d = new EntryDetail(host, { store, entry, readOnly: true, author, backHref: false, analysisHref: false, area: null });
        await tick();
        assert.equal(host.querySelector('.lb-map'), null);
        d.destroy();
    });
});

// ---- Exact location: default on, Share card switch, store ----

function ownerClient(user = { id: 'me', user_metadata: {} }) {
    const calls = [];
    const q = {
        update(row) { calls.push(['update', row]); return q; }, insert(row) { calls.push(['insert', row]); return q; },
        eq() { return q; }, select() { return q; }, limit() { return Promise.resolve({ data: [], error: null }); },
        single: async () => ({ data: { id: 'e1', ...calls.at(-1)[1] }, error: null }),
    };
    return {
        calls,
        auth: {
            getUser: async () => ({ data: { user }, error: null }),
            getSession: async () => ({ data: { session: { user } }, error: null }),
            updateUser: async ({ data }) => { calls.push(['meta', data]); user.user_metadata = { ...user.user_metadata, ...data }; return { error: null }; },
            onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
        },
        from: () => q,
        rpc: async () => ({ data: null, error: null }),
    };
}

test('store: exact location by default lives in the account metadata (missing = on); setShareLocation saves the field', async () => {
    const user = { id: 'me', user_metadata: {} };
    const client = ownerClient(user);
    const store = createSupabaseStore(client);
    assert.equal(await store.defaultShareLocation(), true);
    assert.equal(await store.setDefaultShareLocation(false), false);
    assert.deepEqual(client.calls.at(-1), ['meta', { share_location_default: false }]);
    assert.equal(await store.defaultShareLocation(), false);
    store.communityAvailability = async () => 'yes';
    const saved = await store.setShareLocation('e1', false);
    assert.equal(saved.share_location, false);
});

test('ShareCard: "Show the exact location" saves at once and reports the saved entry', async () => {
    await withDom(async host => {
        const calls = [];
        let changed = null;
        const store = { setSharing: async () => ({}), setShareLocation: async (id, on) => { calls.push([id, on]); return { share_location: on }; } };
        const card = new ShareCard(host, { store, entry: { id: 'e1', visibility: 'members', share_location: true }, onChange: e => { changed = e; } });
        const box = host.querySelector('[name="share_location"]');
        assert.equal(box.checked, true);
        assert.match(host.querySelector('.lb-share-hint').textContent, /approximate area/);
        box.checked = false;
        box.dispatchEvent(new window.Event('change', { bubbles: true }));
        await tick();
        assert.deepEqual(calls, [['e1', false]]);
        assert.equal(changed.share_location, false);
        assert.equal(host.querySelector('[name="share_location"]').checked, false);
        card.destroy();
        new ShareCard(host, { store: { setSharing: async () => ({}) }, entry: { id: 'e1' } });
        assert.equal(host.querySelector('[name="share_location"]'), null, 'no switch without the store method');
    });
});

// ---- Share from a list ----

test('shareDive: asks before creating a link, then the share sheet; copies when there is none', async () => {
    const pageHref = 'https://decotheory.eu/lab/dive-log.html#/dives';
    const sharing = [];
    const store = { setSharing: async (id, on, before) => { sharing.push([id, on, before]); return { visibility: 'link', share_token: TOKEN }; } };
    const shared = [];
    const notes = [];
    const nav = { share: async data => { shared.push(data.url); } };
    let r = await shareDive({ store, entry: { id: 'e1', visibility: 'private' }, confirm: async () => false, notify: t => notes.push(t), pageHref, nav });
    assert.equal(r.outcome, 'cancelled');
    assert.deepEqual(sharing, []);
    r = await shareDive({ store, entry: { id: 'e1', visibility: 'private' }, confirm: async () => true, notify: t => notes.push(t), pageHref, nav });
    assert.equal(r.outcome, 'shared');
    assert.deepEqual(sharing, [['e1', true, 'private']]);
    assert.deepEqual(shared, [`https://decotheory.eu/lab/dive.html#s=${TOKEN}`]);
    assert.ok(isLinkShared(r.entry));

    let asked = false;
    const copied = [];
    r = await shareDive({ store, entry: r.entry, confirm: async () => { asked = true; return true; }, notify: t => notes.push(t), pageHref,
        nav: { clipboard: { writeText: async u => { copied.push(u); } } } });
    assert.equal(asked, false, 'an existing link is shared without asking');
    assert.equal(r.outcome, 'copied');
    assert.equal(copied.length, 1);
    assert.equal(notes.at(-1), 'Link copied');

    const abort = await shareDive({ store, entry: r.entry, confirm: async () => true, notify: () => {}, pageHref,
        nav: { share: async () => { throw Object.assign(new Error('x'), { name: 'AbortError' }); } } });
    assert.equal(abort.outcome, 'cancelled');
    const fallback = await shareDive({ store, entry: r.entry, confirm: async () => true, notify: () => {}, pageHref,
        nav: { share: async () => { throw Object.assign(new Error('x'), { name: 'NotAllowedError' }); }, clipboard: { writeText: async () => {} } } });
    assert.equal(fallback.outcome, 'copied', 'share sheet refused (activation expired): copy instead');
    const failed = await shareDive({ store: { setSharing: async () => { throw new Error('down'); } }, entry: { id: 'e2', visibility: 'members' },
        confirm: async () => true, notify: t => notes.push(t), pageHref, nav });
    assert.equal(failed.outcome, 'failed');
});

test('shareButtonHtml: a 44 px button that carries the id, never a link', () => {
    const html = shareButtonHtml('e"1', { shared: true });
    assert.match(html, /^<button type="button" class="lb-share-btn lb-share-btn--on" data-share="e&quot;1"/);
    assert.match(readFileSync(new URL('../css/trail.css', import.meta.url), 'utf8'), /\.lb-share-btn \{[^}]*width: 44px; height: 44px;/);
});

test('LogbookApp My dives: own dives get a Share button (feed, tiles, table) only with share links; not while selecting', async () => {
    const { LogbookApp } = await import('../js/logbook/LogbookApp.js');
    await withDom(async root => {
        const entries = [{ id: 'e1', log_number: 1, dive_date: '2026-09-01', visibility: 'members', site_id: null, buddies: [] }];
        const sharing = [];
        const store = {
            onAuthChange: () => () => {}, currentUser: async () => ({ id: 'me', email: 'me@example.com' }),
            ensureEntries: async () => 0, listEntries: async () => entries, listSites: async () => [],
            listPhotoMedia: async () => [], photoUrls: async () => new Map(), communityAvailability: async () => 'yes', ensureProfile: async () => ({}),
            shareStatus: async () => true,
            setSharing: async (id, on) => { sharing.push([id, on]); return { visibility: 'link', share_token: TOKEN }; },
        };
        const app = new LogbookApp(root, { store, shell: null });
        await tick(60);
        for (const mode of ['feed', 'tiles', 'table']) {
            app._setViewMode(mode);
            const btn = root.querySelector('[data-share="e1"]');
            assert.ok(btn, mode);
            assert.equal(btn.closest('a'), null, `${mode}: not inside the card link`);
        }
        app._setViewMode('feed');
        const before = location.hash;
        root.querySelector('[data-share="e1"]').click();
        await tick();
        assert.equal(location.hash, before, 'no navigation');
        assert.match(document.querySelector('.lb-sheet-title').textContent, /public link/);
        document.querySelector('.lb-sheet [data-yes]').click();
        await tick();
        assert.deepEqual(sharing, [['e1', true]]);
        assert.ok(root.querySelector('[data-share="e1"]').classList.contains('lb-share-btn--on'), 'the list knows the dive is shared now');
        app._enterSelect();
        assert.equal(root.querySelector('[data-share]'), null, 'no Share while selecting');
        app.destroy();
    });
});

test('migration 0009: a separate area function (no get_shared_dive redefinition), default on, backfill', () => {
    const sql = readFileSync(new URL('../supabase/migrations/0009_share_map.sql', import.meta.url), 'utf8');
    assert.match(sql, /create or replace function public\.get_shared_dive_area\(p_token text\)/);
    assert.doesNotMatch(sql, /function public\.get_shared_dive\(/);
    assert.match(sql, /round\(s\.lat::numeric, 2\)/);
    assert.match(sql, /alter column share_location set default true/);
    assert.match(sql, /update public\.log_entries set share_location = true/);
    assert.match(sql, /grant execute on function public\.get_shared_dive_area\(text\) to anon, authenticated/);
});

test('strings: new keys exist in en, cs and es', () => {
    for (const lang of ['en', 'cs', 'es']) {
        const d = JSON.parse(readFileSync(new URL(`../locales/${lang}.json`, import.meta.url), 'utf8')).diveLog;
        for (const k of ['approxArea', 'location', 'conditions', 'description', 'details', 'prevPhoto', 'nextPhoto', 'mapAlt'])
            assert.ok(d.logbook.detail[k], `${lang} detail.${k}`);
        for (const k of ['exactLocation', 'exactLocationHint', 'ctaTitle', 'ctaText', 'ctaTheory', 'createConfirm', 'createLink', 'shareDive'])
            assert.ok(d.trail.share[k], `${lang} share.${k}`);
        assert.ok(d.trail.profile.shareLocationDefault, `${lang} profile.shareLocationDefault`);
    }
});

test('ProfilePage: "Show the exact location by default" (on when unset) is saved with Save', async () => {
    const { ProfilePage } = await import('../js/logbook/ProfilePage.js');
    await withDom(async host => {
        const log = [];
        let def = true;
        const store = {
            getMyProfile: async () => ({ id: 'me', display_name: 'M', default_visibility: 'members' }),
            saveProfile: async patch => { log.push(['save', patch]); return { id: 'me', ...patch }; },
            defaultShareLocation: async () => def,
            setDefaultShareLocation: async on => { log.push(['default', on]); def = on; return on; },
        };
        const page = new ProfilePage(host, { store, user: { id: 'me', email: 'm@x' } });
        await tick();
        const box = host.querySelector('[name="share_location_default"]');
        assert.equal(box.checked, true);
        box.checked = false;
        host.querySelector('form.tr-profile-form').dispatchEvent(new window.Event('submit', { cancelable: true }));
        await tick();
        assert.deepEqual(log.map(l => l[0]), ['save', 'default']);
        assert.deepEqual(log[1], ['default', false]);
        page.destroy();
        const bare = new ProfilePage(host, { store: { ...store, defaultShareLocation: undefined }, user: { id: 'me' } });
        await tick();
        assert.equal(host.querySelector('[name="share_location_default"]'), null, 'hidden without the store method');
        bare.destroy();
    });
});
