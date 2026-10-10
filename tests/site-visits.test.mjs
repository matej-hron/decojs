/**
 * Site visits, site link and dive description tests.
 * Run: node --test tests/site-visits.test.mjs
 */
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { visitNameKey, visitMatches, siteVisitStats, loadSiteVisits, VISITS_MAX_PAGES } from '../js/logbook/visits.js';
import { descriptionExcerpt } from '../js/logbook/feed.js';

const SITE = { id: 's1', owner: 'me', name: 'Lom Borek', lat: 50.0, lon: 14.0 };

describe('visitNameKey', () => {
    test('trims, folds case and diacritics, collapses spaces', () => {
        assert.equal(visitNameKey('  Lom   Hořice '), 'lom horice');
        assert.equal(visitNameKey('LOM HOŘICE'), visitNameKey('lom hořice'));
        assert.equal(visitNameKey(null), '');
    });
});

describe('visitMatches', () => {
    test('same site id', () => {
        assert.equal(visitMatches({ site_id: 's1', site_name: 'Other' }, SITE), true);
    });
    test('same name after normalisation, any owner', () => {
        assert.equal(visitMatches({ site_id: 'x', site_name: 'lom  borek ' }, SITE), true);
    });
    test('different name without positions: no match', () => {
        assert.equal(visitMatches({ site_id: 'x', site_name: 'Borek' }, SITE), false);
    });
    test('shared position within 200 m matches; farther does not', () => {
        // 0.001° latitude is about 111 m
        assert.equal(visitMatches({ site_id: 'x', site_name: 'Borek', site_lat: 50.001, site_lon: 14.0 }, SITE), true);
        assert.equal(visitMatches({ site_id: 'x', site_name: 'Borek', site_lat: 50.003, site_lon: 14.0 }, SITE), false);
    });
    test('no site on the dive: no match', () => {
        assert.equal(visitMatches({ site_id: null, site_name: null }, SITE), false);
    });
    test('this site without a position still matches by name', () => {
        assert.equal(visitMatches({ site_id: 'x', site_name: 'Lom Borek', site_lat: 1, site_lon: 1 }, { ...SITE, lat: null, lon: null }), true);
    });
    test('an empty site name never matches by name', () => {
        assert.equal(visitMatches({ site_id: 'x', site_name: '  ' }, { ...SITE, name: ' ', lat: null, lon: null }), false);
    });
});

describe('siteVisitStats', () => {
    const rows = [
        { dive_date: '2026-06-10', vis_shallow_m: 8, vis_deep_m: 4, water_temp_c: 12 },
        { dive_date: '2026-06-20', vis_shallow_m: '10', vis_deep_m: null, water_temp_c: 8 },
        { dive_date: '2025-08-01', vis_shallow_m: null, vis_deep_m: 6, water_temp_c: 18.5 },
        { dive_date: '2026-01-05', vis_shallow_m: 3, vis_deep_m: 2, water_temp_c: null },
    ];
    test('count, averages and best skip missing values', () => {
        const s = siteVisitStats(rows);
        assert.equal(s.count, 4);
        assert.deepEqual(s.visShallow, { avg: 7, best: 10, n: 3 });
        assert.deepEqual(s.visDeep, { avg: 4, best: 6, n: 3 });
    });
    test('temperature range overall and by month (months in calendar order)', () => {
        const s = siteVisitStats(rows);
        assert.deepEqual(s.temp, { min: 8, max: 18.5, n: 3 });
        assert.deepEqual(s.months, [
            { month: 6, min: 8, max: 12, n: 2 },
            { month: 8, min: 18.5, max: 18.5, n: 1 },
        ]);
    });
    test('no rows: zero count, nulls', () => {
        const s = siteVisitStats([]);
        assert.equal(s.count, 0);
        assert.equal(s.visShallow, null);
        assert.equal(s.visDeep, null);
        assert.equal(s.temp, null);
        assert.deepEqual(s.months, []);
    });
    test('non-numeric values are ignored, zero is kept', () => {
        const s = siteVisitStats([{ dive_date: 'bad', vis_shallow_m: 'x', water_temp_c: 0 }]);
        assert.equal(s.visShallow, null);
        assert.deepEqual(s.temp, { min: 0, max: 0, n: 1 });
        assert.deepEqual(s.months, []);
    });
});

describe('descriptionExcerpt', () => {
    test('short text is returned trimmed', () => {
        assert.equal(descriptionExcerpt('  Nice wall.  '), 'Nice wall.');
    });
    test('long text is cut at a word boundary with an ellipsis', () => {
        const text = 'word '.repeat(60);
        const out = descriptionExcerpt(text, 30);
        assert.ok(out.length <= 31, out);
        assert.ok(out.endsWith('…'));
        assert.ok(!out.includes('wor…'));
    });
    test('whitespace runs and newlines become single spaces', () => {
        assert.equal(descriptionExcerpt('a\n\n b\tc'), 'a b c');
    });
    test('empty or not a string', () => {
        assert.equal(descriptionExcerpt(null), '');
        assert.equal(descriptionExcerpt('   '), '');
    });
});

describe('loadSiteVisits', () => {
    const row = (id, extra = {}) => ({ id, owner: 'm2', dive_date: '2026-06-01', site_id: 'x', site_name: 'Elsewhere', ...extra });

    test('community: pages through community_entries and keeps matching rows', async () => {
        const calls = [];
        const pages = [
            [row('a', { site_name: 'Lom Borek' }), row('b'), ...Array.from({ length: 98 }, (_, i) => row(`f${i}`))],
            [row('c', { owner: 'me', site_id: 's1', site_name: 'Lom Borek' })],
        ];
        const store = {
            communityStatus: async () => true,
            listCommunityEntries: async ({ limit, offset }) => { calls.push([limit, offset]); return pages[offset / limit] ?? []; },
        };
        const out = await loadSiteVisits(store, SITE);
        assert.deepEqual(calls, [[100, 0], [100, 100]]);
        assert.deepEqual(out.rows.map(r => r.id), ['a', 'c']);
        assert.equal(out.capped, false);
        assert.equal(out.community, true);
    });

    test('community: stops after the page cap and says so', async () => {
        let n = 0;
        const store = {
            communityStatus: async () => true,
            listCommunityEntries: async () => { n++; return Array.from({ length: 100 }, (_, i) => row(`p${n}-${i}`)); },
        };
        const out = await loadSiteVisits(store, SITE);
        assert.equal(n, VISITS_MAX_PAGES);
        assert.equal(out.capped, true);
    });

    test('community: a page that repeats ids is de-duplicated', async () => {
        const store = {
            communityStatus: async () => true,
            listCommunityEntries: async ({ offset }) => (offset === 0 ? [row('a', { site_id: 's1' })] : []),
        };
        const out = await loadSiteVisits(store, SITE);
        assert.equal(out.rows.length, 1);
    });

    test('without the community backend: own entries at this site (and same-name own sites), newest first', async () => {
        const store = {
            communityStatus: async () => false,
            listEntries: async () => [
                { id: 'e1', site_id: 's1', dive_date: '2026-01-01', notes: 'private' },
                { id: 'e2', site_id: 's2', dive_date: '2026-03-01' },
                { id: 'e3', site_id: 's3', dive_date: '2026-02-01' },
                { id: 'e4', site_id: null, dive_date: '2026-04-01' },
            ],
            listSites: async () => [SITE, { id: 's2', name: 'LOM BOREK' }, { id: 's3', name: 'Elsewhere' }],
        };
        const out = await loadSiteVisits(store, SITE, { userId: 'me' });
        assert.deepEqual(out.rows.map(r => r.id), ['e2', 'e1']);
        assert.equal(out.rows[0].owner, 'me');
        assert.equal(out.rows[1].notes, undefined, 'notes never travel into the visits rows');
        assert.equal(out.community, false);
    });
});

// ---- Store: migration 0006 probe and saving without it ----

import { createSupabaseStore, DiveStoreError } from '../js/backend/supabaseStore.js';

/** A Supabase client fake: `probe` is the result of selecting the new columns; writes are recorded. */
function fakeClient({ probe = { error: null }, probes = null } = {}) {
    const writes = [];
    let probeCalls = 0;
    const client = {
        writes,
        get probeCalls() { return probeCalls; },
        auth: { getUser: async () => ({ data: { user: { id: 'me' } }, error: null }) },
        from(table) {
            const q = {
                _mode: 'select', _payload: null, _cols: '*',
                select(cols) { if (this._mode === 'select') this._cols = cols ?? '*'; return this; },
                limit() { return this; },
                eq() { return this; },
                insert(row) { this._mode = 'insert'; this._payload = row; return this; },
                update(row) { this._mode = 'update'; this._payload = row; return this; },
                single() { return this; },
                then(resolve, reject) {
                    let result;
                    if (this._mode === 'select') {
                        probeCalls++;
                        result = probes ? probes.shift() : probe;
                    } else {
                        writes.push([table, this._mode, this._payload]);
                        result = { data: { id: 'new', ...this._payload }, error: null };
                    }
                    return Promise.resolve(result).then(resolve, reject);
                },
            };
            return q;
        },
    };
    return client;
}

const MISSING = { data: null, error: { code: '42703', message: 'column log_entries.description does not exist' }, status: 400 };
const OFFLINE = { data: null, error: { message: 'TypeError: Failed to fetch' }, status: 0 };

describe('store: description and site link (migration 0006)', () => {
    test('probe says yes when the column exists, and caches it', async () => {
        const client = fakeClient();
        const store = createSupabaseStore(client);
        assert.equal(await store.descriptionStatus(), true);
        assert.equal(await store.descriptionStatus(), true);
        assert.equal(client.probeCalls, 1);
    });

    test('a missing column means no (cached); a network failure is unknown (not cached)', async () => {
        const client = fakeClient({ probes: [OFFLINE, MISSING] });
        const store = createSupabaseStore(client);
        assert.equal(await store.descriptionAvailability(), 'unknown');
        assert.equal(await store.descriptionAvailability(), 'no');
        assert.equal(await store.descriptionAvailability(), 'no');
        assert.equal(client.probeCalls, 2);
    });

    test('PostgREST schema-cache error PGRST204 also means no', async () => {
        const store = createSupabaseStore(fakeClient({ probe: { data: null, error: { code: 'PGRST204', message: 'Could not find the description column' } } }));
        assert.equal(await store.descriptionAvailability(), 'no');
    });

    test('with 0006 the description and the link are saved', async () => {
        const client = fakeClient();
        const store = createSupabaseStore(client);
        await store.saveEntry({ dive_date: '2026-06-01', description: 'Great vis' });
        await store.saveSite({ name: 'Borek', url: 'https://example.com/borek' }, 's1');
        assert.equal(client.writes[0][2].description, 'Great vis');
        assert.equal(client.writes[1][2].url, 'https://example.com/borek');
    });

    test('without 0006 they are left out and the rest is saved', async () => {
        const client = fakeClient({ probe: MISSING });
        const store = createSupabaseStore(client);
        await store.saveEntry({ dive_date: '2026-06-01', description: 'Great vis' });
        await store.saveSite({ name: 'Borek', url: null }, 's1');
        assert.equal('description' in client.writes[0][2], false);
        assert.equal(client.writes[0][2].dive_date, '2026-06-01');
        assert.equal('url' in client.writes[1][2], false);
    });

    test('an unknown probe result never drops typed text: the save fails as unreachable', async () => {
        const client = fakeClient({ probe: OFFLINE });
        const store = createSupabaseStore(client);
        await assert.rejects(store.saveEntry({ dive_date: '2026-06-01', description: 'x' }),
            e => e instanceof DiveStoreError && e.kind === 'unreachable');
        assert.equal(client.writes.length, 0);
    });

    test('a save without the new fields does not probe', async () => {
        const client = fakeClient({ probe: OFFLINE });
        const store = createSupabaseStore(client);
        await store.saveEntry({ dive_date: '2026-06-01' });
        await store.saveSite({ name: 'Borek' }, 's1');
        assert.equal(client.probeCalls, 0);
        assert.equal(client.writes.length, 2);
    });
});

// ---- Dive description through the model and the read paths ----

import { normalizeEntry } from '../js/logbook/entryModel.js';
import { formValuesFromEntry } from '../js/logbook/EntryForm.js';
import { entryFromCommunityRow } from '../js/logbook/community.js';
import { sharedDiveParts } from '../js/logbook/share.js';
import { detailRows } from '../js/logbook/EntryDetail.js';
import { parseSiteUrl, siteInfoLinkHtml } from '../js/logbook/geo.js';

describe('dive description', () => {
    test('normalizeEntry sends a trimmed description only when the form offers one', () => {
        assert.equal(normalizeEntry({ dive_date: '2026-06-01', description: '  Wall at 20 m \n' }).description, 'Wall at 20 m');
        assert.equal(normalizeEntry({ dive_date: '2026-06-01', description: '   ' }).description, null);
        assert.equal('description' in normalizeEntry({ dive_date: '2026-06-01' }), false);
    });
    test('the form starts from the stored description', () => {
        assert.equal(formValuesFromEntry({ description: 'Nice' }).description, 'Nice');
        assert.equal(formValuesFromEntry({}).description, '');
    });
    test('a community row keeps the description and the shared site link, never notes', () => {
        const { entry, site } = entryFromCommunityRow({ id: 'e', description: 'Hi', notes: 'secret', site_id: 's', site_name: 'X', site_url: 'https://x.example/' });
        assert.equal(entry.description, 'Hi');
        assert.equal(entry.notes, null);
        assert.equal('site_url' in entry, false);
        assert.equal(site.url, 'https://x.example/');
    });
    test('the share payload keeps the description and the site link', () => {
        const parts = sharedDiveParts({ entry: { id: 'e', description: 'Hi', notes: 'secret' }, site: { id: 's', name: 'X', url: 'https://x.example/' } });
        assert.equal(parts.entry.description, 'Hi');
        assert.equal(parts.entry.notes, null);
        assert.equal(parts.site.url, 'https://x.example/');
    });
    test('detailRows returns the trimmed description apart from the notes', () => {
        const r = detailRows({ description: ' For you all ', notes: 'mine', details: {} }, k => k);
        assert.equal(r.description, 'For you all');
        assert.equal(r.notes, 'mine');
        assert.equal(detailRows({ description: '  ', details: {} }, k => k).description, null);
    });
});

describe('site link', () => {
    test('parseSiteUrl: empty is none, https only, normalised to ASCII', () => {
        assert.deepEqual(parseSiteUrl('  '), { ok: true, value: null });
        assert.deepEqual(parseSiteUrl('http://example.com'), { ok: false });
        assert.deepEqual(parseSiteUrl('javascript:alert(1)'), { ok: false });
        assert.deepEqual(parseSiteUrl('https://example.com/a b'), { ok: false });
        assert.deepEqual(parseSiteUrl('HTTPS://Příklad.cz/lom-hořice?a=1#x'), { ok: true, value: 'https://xn--pklad-zsa96e.cz/lom-ho%C5%99ice?a=1#x' });
        assert.deepEqual(parseSiteUrl(`https://example.com/${'x'.repeat(500)}`), { ok: false });
    });
    test('siteInfoLinkHtml opens a new tab without the opener, and refuses unsafe values', () => {
        const html = siteInfoLinkHtml('https://example.com/x', 'Site info');
        assert.match(html, /target="_blank" rel="noopener noreferrer"/);
        assert.match(html, /href="https:\/\/example\.com\/x"/);
        assert.equal(siteInfoLinkHtml('https://example.com/"><b>', 'x'), '');
        assert.equal(siteInfoLinkHtml('http://example.com/', 'x'), '');
        assert.equal(siteInfoLinkHtml(null, 'x'), '');
    });
});

// ---- jsdom: the entry form and the site page ----

import { EntryForm } from '../js/logbook/EntryForm.js';
import { SitesPage } from '../js/logbook/SitesPage.js';
import { EntryDetail } from '../js/logbook/EntryDetail.js';

async function withDom(fn) {
    const { JSDOM } = await import('jsdom');
    const dom = new JSDOM('<!doctype html><body><div id="root"></div></body>', { url: 'http://localhost/lab/dive-log.html' });
    const saved = {};
    for (const k of ['window', 'document', 'location', 'history']) {
        saved[k] = Object.getOwnPropertyDescriptor(globalThis, k);
        Object.defineProperty(globalThis, k, { value: dom.window[k], configurable: true, writable: true });
    }
    try {
        return await fn(dom.window.document.getElementById('root'), dom.window);
    } finally {
        for (const [k, d] of Object.entries(saved)) {
            if (d) Object.defineProperty(globalThis, k, d); else delete globalThis[k];
        }
    }
}
const tick = () => new Promise(r => setTimeout(r, 20));

describe('entry form: description (jsdom)', () => {
    const formStore = saves => ({
        listSites: async () => [], listBuddies: async () => [], listEntries: async () => [], listMedia: async () => [], photoUrls: async () => new Map(),
        saveEntry: async (row, id) => { saves.push(row); return { id: id ?? 'n', ...row }; },
    });
    const entry = { id: 'e1', log_number: 5, dive_date: '2026-10-01', buddies: [], details: {}, description: 'Old story', notes: 'mine' };

    test('with 0006: the description field sits before the gases and is saved', async () => {
        await withDom(async (root, window) => {
            const saves = [];
            new EntryForm(root, { store: formStore(saves), entry, describe: true, onSaved() {}, onCancel() {} });
            await tick();
            const desc = root.querySelector('textarea[name="description"]');
            assert.ok(desc);
            assert.equal(desc.value, 'Old story');
            assert.ok(desc.compareDocumentPosition(root.querySelector('.lb-gases')) & window.Node.DOCUMENT_POSITION_FOLLOWING);
            desc.value = '  New story  ';
            root.querySelector('form').dispatchEvent(new window.Event('submit', { cancelable: true }));
            await tick();
            assert.equal(saves[0].description, 'New story');
            assert.equal(saves[0].notes, 'mine');
        });
    });

    test('notes live in More details, which opens when there are notes', async () => {
        await withDom(async root => {
            new EntryForm(root, { store: formStore([]), entry, describe: true, onSaved() {}, onCancel() {} });
            await tick();
            const notes = root.querySelector('textarea[name="notes"]');
            assert.ok(notes.closest('details.lb-more'));
            assert.equal(notes.closest('details').open, true);
        });
    });

    test('without 0006: no description field and nothing sent for it', async () => {
        await withDom(async (root, window) => {
            const saves = [];
            new EntryForm(root, { store: formStore(saves), entry, onSaved() {}, onCancel() {} });
            await tick();
            assert.equal(root.querySelector('[name="description"]'), null);
            root.querySelector('form').dispatchEvent(new window.Event('submit', { cancelable: true }));
            await tick();
            assert.equal('description' in saves[0], false);
        });
    });
});

describe('entry detail: description and site link (jsdom)', () => {
    test('own dive: description, labelled private notes and the site link', async () => {
        await withDom(async root => {
            const store = { listSites: async () => [{ id: 's1', name: 'Borek', url: 'https://example.com/borek' }], listMedia: async () => [], photoUrls: async () => new Map() };
            new EntryDetail(root, { store, entry: { id: 'e1', log_number: 1, dive_date: '2026-06-01', site_id: 's1', buddies: [], details: {}, description: 'For all', notes: 'Mine' } });
            await tick();
            assert.equal(root.querySelector('.lb-d-story').textContent, 'For all');
            assert.match(root.querySelector('.lb-d-notes').textContent, /Mine/);
            assert.equal(root.querySelector('.lb-site-info').getAttribute('href'), 'https://example.com/borek');
        });
    });

    test('read-only dive: description shown, notes never', async () => {
        await withDom(async root => {
            const store = { listSites: async () => [], listMedia: async () => [], photoUrls: async () => new Map() };
            new EntryDetail(root, { store, readOnly: true, entry: { id: 'e1', dive_date: '2026-06-01', buddies: [], details: {}, description: 'For all', notes: 'Mine' } });
            await tick();
            assert.equal(root.querySelector('.lb-d-story').textContent, 'For all');
            assert.equal(root.querySelector('.lb-d-notes'), null);
        });
    });
});

describe('site page: visits and link (jsdom)', () => {
    const site = { id: 's1', name: 'Lom Borek', lat: 50, lon: 14, url: 'https://example.com/borek' };
    const rows = [
        { id: 'a', owner: 'me', dive_date: '2026-06-10', site_id: 's1', site_name: 'Lom Borek', max_depth_m: 20, duration_s: 2400, vis_shallow_m: 8, vis_deep_m: 4, water_temp_c: 12 },
        { id: 'b', owner: 'm2', dive_date: '2026-07-01', site_id: 'x', site_name: 'lom borek', max_depth_m: 30, water_temp_c: 16, notes: 'NOPE' },
        { id: 'c', owner: 'm2', dive_date: '2026-07-02', site_id: 'y', site_name: 'Elsewhere' },
    ];
    const pageStore = (over = {}) => ({
        listSites: async () => [site], siteUsage: async () => new Map([['s1', 1]]), descriptionStatus: async () => true,
        communityStatus: async () => true, listCommunityEntries: async () => rows,
        listMembers: async () => [{ id: 'm2', display_name: 'Jana' }], avatarUrls: async () => new Map(), saveSite: async () => site,
        ...over,
    });

    test('summary, newest-first visits with names and links, no notes', async () => {
        await withDom(async root => {
            new SitesPage(root, { store: pageStore(), siteId: 's1', userId: 'me' });
            await tick();
            const items = [...root.querySelectorAll('.lb-sv-visit')];
            assert.deepEqual(items.map(a => a.getAttribute('href')), ['#/m/b', '#/dive/a']);
            assert.match(items[0].textContent, /Jana/);
            assert.match(items[1].textContent, /You/);
            assert.doesNotMatch(root.textContent, /NOPE/);
            assert.match(root.querySelector('.lb-sv-stats').textContent, /2/);
            assert.equal(root.querySelectorAll('.lb-sv-month').length, 12);
            assert.equal(root.querySelectorAll('.lb-sv-month:not(.lb-sv-month--none)').length, 2);
            assert.equal(root.querySelector('.lb-sv-head .lb-site-info').getAttribute('rel'), 'noopener noreferrer');
        });
    });

    test('an invalid link is refused; a good one is saved normalised', async () => {
        await withDom(async (root, window) => {
            const saved = [];
            new SitesPage(root, { store: pageStore({ saveSite: async (row, id) => { saved.push(row); return { ...site, ...row, id }; } }), siteId: 's1', userId: 'me' });
            await tick();
            const form = root.querySelector('.lb-site-form');
            form.elements.url.value = 'http://example.com';
            form.dispatchEvent(new window.Event('submit', { cancelable: true }));
            await tick();
            assert.equal(saved.length, 0);
            assert.match(root.querySelector('.lb-form-error').textContent, /https:\/\//);
            root.querySelector('.lb-site-form').elements.url.value = 'HTTPS://Example.com/x';
            root.querySelector('.lb-site-form').dispatchEvent(new window.Event('submit', { cancelable: true }));
            await tick();
            assert.equal(saved[0].url, 'https://example.com/x');
        });
    });

    test('without 0006 the link field is hidden and nothing is sent for it', async () => {
        await withDom(async (root, window) => {
            const saved = [];
            new SitesPage(root, { store: pageStore({ descriptionStatus: async () => false, listSites: async () => [{ ...site, url: undefined }],
                saveSite: async row => { saved.push(row); return site; } }), siteId: 's1', userId: 'me' });
            await tick();
            assert.equal(root.querySelector('[name="url"]'), null);
            root.querySelector('.lb-site-form').dispatchEvent(new window.Event('submit', { cancelable: true }));
            await tick();
            assert.equal('url' in saved[0], false);
        });
    });

    test('visits that fail to load leave the edit form working', async () => {
        await withDom(async root => {
            new SitesPage(root, { store: pageStore({ listCommunityEntries: async () => { throw new Error('down'); } }), siteId: 's1', userId: 'me' });
            await tick();
            assert.ok(root.querySelector('.lb-sv-card [role="alert"]'));
            assert.ok(root.querySelector('.lb-site-form'));
        });
    });

    test('more than 20 visits: "Show all" reveals the rest', async () => {
        await withDom(async root => {
            const many = Array.from({ length: 25 }, (_, i) => ({ id: `v${i}`, owner: 'me', dive_date: `2026-05-${String(i + 1).padStart(2, '0')}`, site_id: 's1', site_name: 'Lom Borek' }));
            new SitesPage(root, { store: pageStore({ listCommunityEntries: async () => many }), siteId: 's1', userId: 'me' });
            await tick();
            assert.equal(root.querySelectorAll('.lb-sv-visit').length, 20);
            root.querySelector('#lb-sv-all').click();
            assert.equal(root.querySelectorAll('.lb-sv-visit').length, 25);
        });
    });
});

// ---- Dive story: display, limits, labels ----

import { storyHtml, STORY_MAX } from '../js/logbook/feed.js';

describe('dive story', () => {
    test('escapes HTML', () => {
        assert.equal(storyHtml('<b>hi</b> & "x"'), '<p>&lt;b&gt;hi&lt;/b&gt; &amp; &quot;x&quot;</p>');
    });
    test('blank lines make paragraphs, single line breaks stay', () => {
        assert.equal(storyHtml('First line\nsecond\n\n\nNew para\r\n'), '<p>First line<br>second</p><p>New para</p>');
    });
    test('https links become safe new-tab links; trailing punctuation stays outside', () => {
        const html = storyHtml('Photos: https://example.com/a?b=1&c=2. More (https://x.example/p).');
        assert.match(html, /<a href="https:\/\/example\.com\/a\?b=1&amp;c=2" target="_blank" rel="noopener noreferrer nofollow ugc">https:\/\/example\.com\/a\?b=1&amp;c=2<\/a>\./);
        assert.match(html, /\(<a href="https:\/\/x\.example\/p"[^>]*>https:\/\/x\.example\/p<\/a>\)\./);
    });
    test('http, javascript and quote-breaking text are never links', () => {
        assert.doesNotMatch(storyHtml('http://example.com'), /<a /);
        assert.doesNotMatch(storyHtml('javascript:alert(1)'), /<a /);
        const html = storyHtml('https://e.com/"onmouseover="x');
        assert.doesNotMatch(html, /"onmouseover/);
    });
    test('empty text gives no markup', () => {
        assert.equal(storyHtml('  \n '), '');
        assert.equal(storyHtml(null), '');
    });
    test('the limit is 5000 characters, in the form and the migration', async () => {
        assert.equal(STORY_MAX, 5000);
        const { readFileSync } = await import('node:fs');
        const sql = readFileSync(new URL('../supabase/migrations/0006_sites_description.sql', import.meta.url), 'utf8');
        assert.match(sql, /between 1 and 5000/);
    });
    test('labels: Dive story in en/cs/es, with a placeholder', async () => {
        const { readFileSync } = await import('node:fs');
        const form = lang => JSON.parse(readFileSync(new URL(`../locales/${lang}.json`, import.meta.url), 'utf8')).diveLog.logbook.form;
        assert.equal(form('en').description, 'Dive story');
        assert.equal(form('cs').description, 'Příběh ponoru');
        assert.equal(form('es').description, 'Relato de la inmersión');
        for (const l of ['en', 'cs', 'es']) assert.ok(form(l).descriptionPlaceholder, l);
        assert.equal(form('en').descriptionPlaceholder, 'How was the dive? What did you see?');
    });
});

describe('dive story in the views (jsdom)', () => {
    test('detail: paragraphs and safe links; form: placeholder and 5000 limit', async () => {
        await withDom(async root => {
            const store = { listSites: async () => [], listMedia: async () => [], photoUrls: async () => new Map(), listBuddies: async () => [], listEntries: async () => [] };
            new EntryDetail(root, { store, readOnly: true, entry: { id: 'e1', dive_date: '2026-06-01', buddies: [], details: {},
                description: 'We dropped in.\nCold!\n\nVideo: https://example.com/v. <script>x</script>' } });
            await tick();
            const story = root.querySelector('.lb-d-story');
            assert.equal(story.querySelectorAll('p').length, 2);
            assert.equal(story.querySelectorAll('br').length, 1);
            assert.equal(story.querySelector('a').getAttribute('href'), 'https://example.com/v');
            assert.equal(story.querySelector('script'), null);
            root.innerHTML = '';
            new EntryForm(root, { store: { ...store, saveEntry: async r => r }, entry: { id: 'e1', dive_date: '2026-06-01', buddies: [], details: {} }, describe: true, onSaved() {}, onCancel() {} });
            await tick();
            const ta = root.querySelector('textarea[name="description"]');
            assert.equal(ta.getAttribute('maxlength'), '5000');
            assert.ok(ta.getAttribute('placeholder'));
        });
    });
});
