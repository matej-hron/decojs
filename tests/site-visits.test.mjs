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
