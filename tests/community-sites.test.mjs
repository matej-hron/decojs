/**
 * Community site directory (migration 0011): conditions stats, summary line, store API.
 * Run: node --test tests/community-sites.test.mjs
 */
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { siteStatsFromRows, siteAggregatesFromRows, siteSummaryLine, fmtRange, fmtShortDate, surfaceTemp } from '../js/logbook/siteStats.js';

const NB = ' ';
const ROWS = [
    { id: 'd1', owner: 'a', dive_date: '2026-09-27', entry_time: '10:00', water_temp_c: 18, surface_temp_c: 21, vis_shallow_m: 8, vis_deep_m: 4 },
    { id: 'd2', owner: 'b', dive_date: '2026-09-01', entry_time: null, water_temp_c: 16.5, surface_temp_c: null, vis_shallow_m: 6, vis_deep_m: null },
    { id: 'd3', owner: 'a', dive_date: '2025-01-15', entry_time: '09:00', water_temp_c: 4, surface_temp_c: 6, vis_shallow_m: 8, vis_deep_m: 7 },
];

describe('siteStatsFromRows', () => {
    test('counts, divers, first and last visit', () => {
        const s = siteStatsFromRows(ROWS);
        assert.equal(s.visits, 3);
        assert.equal(s.divers, 2);
        assert.equal(s.first_visit, '2025-01-15');
        assert.equal(s.last_visit, '2026-09-27');
    });
    test('visibility: avg, range, best with its latest date, latest with date', () => {
        const { shallow, deep } = siteStatsFromRows(ROWS).vis;
        assert.deepEqual(shallow, { n: 3, avg: 7.3, min: 6, max: 8, best_date: '2026-09-27', latest: 8, latest_date: '2026-09-27' });
        assert.deepEqual(deep, { n: 2, avg: 5.5, min: 4, max: 7, best_date: '2025-01-15', latest: 4, latest_date: '2026-09-27' });
    });
    test('temperature: bottom and surface separately', () => {
        const { bottom, surface } = siteStatsFromRows(ROWS).temp;
        assert.deepEqual(bottom, { n: 3, avg: 12.8, min: 4, max: 18, best_date: '2026-09-27', latest: 18, latest_date: '2026-09-27' });
        assert.equal(surface.n, 2);
        assert.equal(surface.min, 6);
        assert.equal(surface.latest, 21);
    });
    test('months pool the years, only months with dives, January first', () => {
        const { months } = siteStatsFromRows(ROWS);
        assert.deepEqual(months.map(m => m.month), [1, 9]);
        assert.deepEqual(months[0], { month: 1, n: 1, bottom: { avg: 4, min: 4, max: 4, n: 1 }, surface: { avg: 6, min: 6, max: 6, n: 1 }, vis: { avg: 7.5, n: 2 } });
        assert.deepEqual(months[1].bottom, { avg: 17.3, min: 16.5, max: 18, n: 2 });
        assert.deepEqual(months[1].surface, { avg: 21, min: 21, max: 21, n: 1 });
        assert.deepEqual(months[1].vis, { avg: 6, n: 3 });
    });
    test('no rows: zero visits, null summaries, no months', () => {
        const s = siteStatsFromRows([]);
        assert.equal(s.visits, 0);
        assert.equal(s.last_visit, null);
        assert.equal(s.vis.shallow, null);
        assert.equal(s.temp.surface, null);
        assert.deepEqual(s.months, []);
    });
    test('surface from entry details, only numbers', () => {
        assert.equal(surfaceTemp({ details: { surfaceTempC: 21.5 } }), 21.5);
        assert.equal(surfaceTemp({ details: { surfaceTempC: 'abc' } }), null);
        assert.equal(surfaceTemp({ details: {} }), null);
        assert.equal(surfaceTemp({ surface_temp_c: '19.0' }), 19);
    });
    test('aggregates span shallow+deep and bottom+surface', () => {
        assert.deepEqual(siteAggregatesFromRows(ROWS), { visits: 3, last_visit: '2026-09-27', vis_min: 4, vis_max: 8, temp_min: 4, temp_max: 21 });
    });
});

describe('summary line', () => {
    const now = new Date('2026-10-10T12:00:00Z');
    const t = (_key, fallback) => fallback;
    test('English: vis range, temperature range, last visit this year', () => {
        assert.equal(siteSummaryLine({ vis_min: 4, vis_max: 8, temp_min: 6, temp_max: 21, last_visit: '2026-09-27' }, { lang: 'en', now, t }),
            `vis 4–8${NB}m · 6–21${NB}°C (last:${NB}Sep${NB}27)`);
    });
    test('Czech: decimal comma and day-first date', () => {
        const line = siteSummaryLine({ vis_min: 4.5, vis_max: 8, temp_min: 6.4, temp_max: 21.2, last_visit: '2026-09-27' }, { lang: 'cs', now, t });
        assert.match(line, /^vis 4,5–8\u00a0m · 6–21\u00a0°C \(last:\u00a027\.\u00a09\.\)$/);
    });
    test('another year shows the year; parts without data are left out', () => {
        assert.match(siteSummaryLine({ temp_min: 10, temp_max: 10, last_visit: '2025-03-02' }, { lang: 'en', now, t }), /^10\u00a0°C \(last:\u00a0Mar\u00a02,\u00a02025\)$/);
        assert.equal(siteSummaryLine({ last_visit: null }, { lang: 'en', now, t }), '');
        assert.equal(siteSummaryLine({ vis_min: 3, vis_max: 3 }, { lang: 'en', now, t }), `vis 3${NB}m`);
    });
    test('fmtRange and fmtShortDate', () => {
        assert.equal(fmtRange(4.04, 4.0, 'en'), '4');
        assert.equal(fmtRange(5.25, 12, 'cs'), '5,3–12');
        assert.equal(fmtShortDate('bad', 'en'), '');
    });
});

// ---- Store ----

import { createSupabaseStore, DiveStoreError } from '../js/backend/supabaseStore.js';

/** A small Supabase fake: profiles and sites tables, the 0011 RPCs, configurable errors. */
function fakeClient({ has0011 = true, user = { id: 'me' }, own = [], directory = [], errors = {} } = {}) {
    const calls = [];
    const db = { sites: own.map(s => ({ ...s })), profiles: [{ id: 'me' }], log_entries: [] };
    function builder(table) {
        const q = {
            mode: 'select', cols: '*', filters: [], payload: null, one: false,
            select(cols) { if (q.mode === 'select') q.cols = cols ?? '*'; return q; },
            limit() { return q; }, order() { return q; }, range() { return q; },
            eq(c, v) { q.filters.push(r => r[c] === v); return q; },
            in(c, vs) { q.filters.push(r => vs.includes(r[c])); return q; },
            insert(p) { q.mode = 'insert'; q.payload = p; return q; },
            update(p) { q.mode = 'update'; q.payload = p; return q; },
            delete() { q.mode = 'delete'; return q; },
            single() { q.one = true; return q; },
            maybeSingle() { q.one = true; return q; },
            then(resolve, reject) { return run().then(resolve, reject); },
        };
        async function run() {
            if (table === 'sites' && q.mode === 'select' && q.cols === 'visibility' && !has0011) {
                return { data: null, error: { code: '42703', message: 'column sites.visibility does not exist' }, status: 400 };
            }
            const err = errors[`${q.mode}:${table}`];
            if (err) { calls.push([q.mode, table, q.payload]); return { data: null, error: err }; }
            const rows = db[table].filter(r => q.filters.every(f => f(r)));
            if (q.mode === 'insert') {
                const row = { id: `${table}-${db[table].length + 1}`, owner: user.id, ...q.payload };
                db[table].push(row);
                calls.push(['insert', table, q.payload]);
                return { data: q.one ? row : [row], error: null };
            }
            if (q.mode === 'update') {
                rows.forEach(r => Object.assign(r, q.payload));
                calls.push(['update', table, q.payload, rows.map(r => r.id)]);
                return { data: q.one ? rows[0] : rows, error: null };
            }
            if (q.mode === 'delete') {
                db[table] = db[table].filter(r => !rows.includes(r));
                calls.push(['delete', table, rows.map(r => r.id)]);
                return { data: rows.map(r => ({ id: r.id })), error: null };
            }
            return { data: q.one ? rows[0] ?? null : rows.map(r => ({ ...r })), error: null };
        }
        return q;
    }
    return {
        calls, db, from: builder,
        auth: { getUser: async () => ({ data: { user }, error: null }) },
        async rpc(name, args) {
            calls.push(['rpc', name, args]);
            const err = errors[`rpc:${name}`];
            if (err) return { data: null, error: err };
            if (name === 'community_sites') return { data: directory, error: null };
            if (name === 'merge_site') return { data: { moved: 2, deleted: false }, error: null };
            if (name === 'site_stats') return { data: { visits: 1 }, error: null };
            if (name === 'site_visits') return { data: [{ id: 'd1' }], error: null };
            return { data: null, error: null };
        },
    };
}

describe('community sites store', () => {
    const OWN = [{ id: 's1', owner: 'me', name: 'Barbora CMAS', notes: 'secret' }];
    const DIR = [
        { id: 's1', owner: 'me', name: 'Barbora CMAS', visibility: 'members', visits: '3', vis_min: '4', vis_max: '8', temp_min: 6, temp_max: 21, used_by_others: true },
        { id: 's2', owner: 'luis', name: 'Lom Borek', lat: '50.1', lon: 14, visibility: 'members', visits: 5, used_by_others: null },
    ];

    test('listAllSites: own rows keep notes and gain aggregates; others come without notes', async () => {
        const store = createSupabaseStore(fakeClient({ own: OWN, directory: DIR }));
        const all = await store.listAllSites();
        assert.equal(all.length, 2);
        assert.equal(all[0].own, true);
        assert.equal(all[0].notes, 'secret');
        assert.equal(all[0].visits, 3);
        assert.equal(all[0].vis_min, 4);
        assert.equal(all[1].own, false);
        assert.equal(all[1].lat, 50.1);
        assert.equal('notes' in all[1], false);
    });

    test('listAllSites without 0011: own sites only, no directory call', async () => {
        const client = fakeClient({ has0011: false, own: OWN, directory: DIR });
        const store = createSupabaseStore(client);
        const all = await store.listAllSites();
        assert.deepEqual(all.map(s => [s.id, s.own]), [['s1', true]]);
        assert.equal(client.calls.some(c => c[1] === 'community_sites'), false);
        assert.equal(await store.communitySitesStatus(), false);
    });

    test('listAllSites: a failing directory falls back to own sites', async () => {
        const store = createSupabaseStore(fakeClient({ own: OWN, errors: { 'rpc:community_sites': { message: 'boom' } } }));
        assert.deepEqual((await store.listAllSites()).map(s => s.id), ['s1']);
    });

    test('saveSite sends visibility with 0011 and drops it without', async () => {
        const c1 = fakeClient({ own: OWN });
        await createSupabaseStore(c1).saveSite({ name: 'X', visibility: 'private' }, 's1');
        assert.equal(c1.db.sites[0].visibility, 'private');
        const c2 = fakeClient({ has0011: false, own: OWN });
        await createSupabaseStore(c2).saveSite({ name: 'X', visibility: 'private' }, 's1');
        assert.equal('visibility' in c2.db.sites[0], false);
    });

    test('trigger errors map to their kinds', async () => {
        const shared = fakeClient({ own: OWN, errors: { 'update:sites': { code: 'DTS01', message: 'used by other members' } } });
        await assert.rejects(() => createSupabaseStore(shared).saveSite({ visibility: 'private' }, 's1'), e => e instanceof DiveStoreError && e.kind === 'site-shared');
        const used = fakeClient({ own: OWN, errors: { 'delete:sites': { code: 'DTS02', message: 'in use' } } });
        await assert.rejects(() => createSupabaseStore(used).deleteSite('s1'), e => e.kind === 'site-in-use');
    });

    test('mergeSite uses merge_site with 0011', async () => {
        const client = fakeClient({ own: OWN });
        assert.deepEqual(await createSupabaseStore(client).mergeSite('s1', 's2'), { moved: 2, deleted: false });
        assert.deepEqual(client.calls.filter(c => c[0] === 'rpc' && c[1] === 'merge_site').map(c => c[2]), [{ p_from: 's1', p_into: 's2' }]);
        assert.equal(client.calls.some(c => c[0] === 'update' && c[1] === 'log_entries'), false);
    });

    test('siteStats and siteVisits call the RPCs with the site id', async () => {
        const client = fakeClient();
        const store = createSupabaseStore(client);
        assert.deepEqual(await store.siteStats('s2'), { visits: 1 });
        assert.deepEqual(await store.siteVisits('s2', { limit: 50 }), [{ id: 'd1' }]);
        assert.deepEqual(client.calls.find(c => c[1] === 'site_visits')[2], { p_site_id: 's2', p_limit: 50, p_offset: 0 });
    });
});


// ---- Ordering and name matching ----

import { findSiteByName, siteNameOptions } from '../js/logbook/geo.js';
import { orderSites, distanceText } from '../js/logbook/SitesPage.js';

describe('directory helpers', () => {
    const sites = [
        { id: 'a', name: 'Barbora CMAS', own: false, owner: 'luis', visits: 9, lat: 50.6, lon: 13.8 },
        { id: 'b', name: 'barbora cmas', own: false, owner: 'eva', visits: 2, lat: 50.6, lon: 13.8 },
        { id: 'c', name: 'Lom Borek', own: true, owner: 'me', lat: 50.0, lon: 14.0 },
        { id: 'd', name: 'Abyss', own: true, owner: 'me' },
    ];
    test('findSiteByName: own first, then the most-visited community site', () => {
        assert.equal(findSiteByName(sites, ' BARBORA cmas ').id, 'a');
        assert.equal(findSiteByName([...sites, { id: 'e', name: 'Barbora CMAS', own: true }], 'Barbora CMAS').id, 'e');
        assert.equal(findSiteByName(sites, 'Nowhere'), null);
        assert.equal(findSiteByName(sites, '  '), null);
    });
    test('siteNameOptions: each name once, own first, others labelled', () => {
        const opts = siteNameOptions(sites, s => `Added by ${s.owner}`);
        assert.deepEqual(opts, [{ value: 'Lom Borek' }, { value: 'Abyss' }, { value: 'Barbora CMAS', label: 'Added by luis' }]);
    });
    test('orderSites: by name, by distance with positionless last, My sites only own', () => {
        assert.deepEqual(orderSites(sites, { lang: 'en' }).map(s => s.id), ['d', 'a', 'b', 'c']);
        const near = orderSites(sites, { here: { lat: 50.01, lon: 14.0 }, lang: 'en' });
        assert.deepEqual(near.map(s => s.id), ['c', 'a', 'b', 'd']);
        assert.ok(near[0].distance > 1000 && near[0].distance < 1200);
        assert.deepEqual(orderSites(sites, { scope: 'mine', lang: 'en' }).map(s => s.id), ['d', 'c']);
    });
    test('distanceText', () => {
        assert.equal(distanceText(347, 'en'), '350 m');
        assert.equal(distanceText(4234, 'cs'), '4,2 km');
        assert.equal(distanceText(123456, 'en'), '123 km');
        assert.equal(distanceText(null), '');
    });
});

// ---- Duplicates and the nearest site ----

import { similarSiteNames, possibleDuplicates, nearestSite, foldSiteName } from '../js/logbook/geo.js';

describe('similar names and possible duplicates', () => {
    test('folding: case, diacritics, punctuation', () => {
        assert.equal(foldSiteName('  Lom  Hořice – sever! '), 'lom horice sever');
    });
    test('similar: equal folded, contained word(s), small typos; not unrelated or tiny names', () => {
        assert.equal(similarSiteNames('Barbora CMAS', 'barbora-cmas'), true);
        assert.equal(similarSiteNames('Lom Hořice', 'LOM HORICE'), true);
        assert.equal(similarSiteNames('Barbora', 'Lom Barbora'), true);
        assert.equal(similarSiteNames('Barbora', 'Barbara'), true, 'one edit at 7 characters');
        assert.equal(similarSiteNames('Hemmoor Kreidesee', 'Hemoor Kreidesee'), true);
        assert.equal(similarSiteNames('Lom', 'Lom Borek'), false, 'too short to count as contained');
        assert.equal(similarSiteNames('Borek', 'Barbora'), false);
        assert.equal(similarSiteNames('Bora', 'Bara'), false, 'no typos under 5 characters');
        assert.equal(similarSiteNames('', 'x'), false);
    });
    test('possibleDuplicates: similar name within 300 m, nearest first, never itself', () => {
        const mine = { id: 'm', name: 'Barbora', lat: 50.6, lon: 13.8 };
        const sites = [mine,
            { id: 'a', name: 'Barbora CMAS', lat: 50.6009, lon: 13.8 }, // ~100 m
            { id: 'b', name: 'barbora', lat: 50.6001, lon: 13.8 }, // ~11 m
            { id: 'c', name: 'Barbora', lat: 50.61, lon: 13.8 }, // ~1.1 km
            { id: 'd', name: 'Lahošť', lat: 50.6, lon: 13.8 }, // same spot, other name
            { id: 'e', name: 'Barbora' }, // no position
        ];
        assert.deepEqual(possibleDuplicates(mine, sites).map(d => d.site.id), ['b', 'a']);
        assert.deepEqual(possibleDuplicates({ ...mine, lat: null }, sites), []);
    });
});

describe('nearestSite', () => {
    const here = { lat: 50, lon: 14 };
    test('nearest within the limit, with its distance; null when none is close', () => {
        const sites = [
            { id: 'far', name: 'Far', lat: 50.02, lon: 14 }, // ~2.2 km
            { id: 'near', name: 'Near', lat: 50.001, lon: 14 }, // ~111 m
            { id: 'mid', name: 'Mid', lat: 50.005, lon: 14 }, // ~556 m
            { id: 'nopos', name: 'No position' },
        ];
        const hit = nearestSite(sites, here);
        assert.equal(hit.site.id, 'near');
        assert.ok(Math.abs(hit.distance - 111.2) < 1);
        assert.equal(nearestSite(sites.filter(s => s.id === 'far'), here), null);
        assert.equal(nearestSite(sites.filter(s => s.id === 'far'), here, 3000).site.id, 'far');
        assert.equal(nearestSite(sites, { lat: null, lon: 14 }), null);
        assert.equal(nearestSite([], here), null);
    });
    test('ties: own first, then most visits, then name', () => {
        const at = { lat: 50.001, lon: 14 };
        const a = { id: 'a', name: 'Zeta', ...at, own: false, visits: 9 };
        const b = { id: 'b', name: 'Alpha', ...at, own: false, visits: 2 };
        const c = { id: 'c', name: 'Mine', ...at, own: true, visits: 0 };
        assert.equal(nearestSite([a, b, c], here).site.id, 'c');
        assert.equal(nearestSite([b, a], here).site.id, 'a');
        assert.equal(nearestSite([{ ...a, visits: 2 }, b], here).site.id, 'b');
    });
});
