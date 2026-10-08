/**
 * Dive logbook tests.
 * Run: node --test tests/logbook.test.mjs
 */

import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseDivesoftDLF } from '../js/import/divesoftDlf.js';
import {
    entryFromRecording, orderRecordingsForNumbering, nextLogNumber, parseDecimal,
    normalizeEntry, needsDetails, DETAIL_KEYS, formatDiveDate, entriesOnDate,
    surfaceTempFromSamples, avgDepthFromSamples, hasUserDetails, parseDuration, formatDuration,
} from '../js/logbook/entryModel.js';
import { localeTag } from '../js/format.js';
import { parseRoute, routeHref } from '../js/logbook/router.js';
import { resizeTarget, isSupportedImage, exifTimestamp } from '../js/logbook/photo.js';
import { detailRows, isHttpsUrl, gasCards } from '../js/logbook/EntryDetail.js';
import { siteFromForm, parseCoordinates } from '../js/logbook/SitePicker.js';
import { mapySuggestUrl, mapyTileUrl, placesFromMapy, placesFromNominatim, mapyLang, distanceMeters, duplicateNameCounts, nearbySameNameSite } from '../js/logbook/geo.js';
import { createSupabaseStore, DiveStoreError } from '../js/backend/supabaseStore.js';
import { NewDive } from '../js/logbook/NewDive.js';
import { sortSites, parseAltitude, diveCountText } from '../js/logbook/SitesPage.js';
import { LogbookApp } from '../js/logbook/LogbookApp.js';
import { uploadDivelog, exportZip } from '../js/logbook/transfer.js';
import { diveTitle, feedStats, chooseVisual, logbookTotals, formatTotalTime, migrateView, photoIndex, FEED_VIEWS } from '../js/logbook/feed.js';
import { mapyStaticMapUrl } from '../js/logbook/geo.js';
import { gasesFromEntry, gasesFromRecording, primaryGas, gasUsage, formRowsFromGases, gasesFromFormRows, newGasRow, cylinderText } from '../js/logbook/gasModel.js';
import { formValuesFromEntry, recordingsOnDate, invalidNumberFields, EntryForm } from '../js/logbook/EntryForm.js';

const FIXTURES = new URL('./fixtures/divesoft/', import.meta.url);
const diveOf = id => parseDivesoftDLF(new Uint8Array(readFileSync(new URL(`${id}.DLF`, FIXTURES))), { fileName: `${id}.DLF` });

describe('entryFromRecording', () => {
    test('a deco dive', () => {
        const e = entryFromRecording(diveOf('00000100'));
        assert.equal(e.dive_date, '2026-09-27');
        assert.equal(e.entry_time, '12:01:01');
        assert.equal(e.duration_s, 3109);
        assert.equal(e.max_depth_m, 38.56);
        assert.deepEqual(e.gas, { o2: 0.21, he: 0 });
        assert.equal(e.water_temp_c, 4.8);
        assert.equal(e.details.stops, 'deco');
        assert.equal(e.details.computer, 'Divesoft Freedom 7044-00006107');
    });

    test('surface temperature and average depth come from the profile', () => {
        const e = entryFromRecording(diveOf('00000100'));
        assert.equal(e.details.surfaceTempC, 18.5);
        assert.equal(e.water_temp_c, 4.8);
        assert.ok(Math.abs(e.details.avgDepthM - 16.1) <= 0.2, String(e.details.avgDepthM));
        const f = entryFromRecording(diveOf('00000092'));
        assert.equal(f.details.surfaceTempC, 21.8);
        assert.ok(Math.abs(f.details.avgDepthM - 7.7) <= 0.2, String(f.details.avgDepthM));
    });

    test('surfaceTempFromSamples: early shallow first, then anywhere shallow, else omitted', () => {
        const s = (t, depth, temp) => ({ t, depth, ...(temp === undefined ? {} : { temp }) });
        assert.equal(surfaceTempFromSamples([s(0, 1, 18), s(60, 5, 19.04), s(300, 30, 25), s(700, 3, 30)]), 19);
        assert.equal(surfaceTempFromSamples([s(0, 10, 18), s(700, 3, 15.26), s(800, 2, 14), s(900, 2)]), 15.3);
        assert.equal(surfaceTempFromSamples([s(0, 10, 18), s(100, 3)]), undefined);
        assert.equal(surfaceTempFromSamples([]), undefined);
    });

    test('avgDepthFromSamples: time-weighted trapezoid, needs two samples', () => {
        assert.equal(avgDepthFromSamples([{ t: 0, depth: 0 }, { t: 100, depth: 20 }, { t: 200, depth: 0 }]), 10);
        assert.equal(avgDepthFromSamples([{ t: 0, depth: 10 }]), undefined);
        const e = entryFromRecording({ ...diveOf('00000100'), avgDepth: 12.3 });
        assert.equal(e.details.avgDepthM, 12.3);
    });

    test('a no-deco dive with a safety stop', () => {
        const e = entryFromRecording(diveOf('00000092'));
        assert.equal(e.details.stops, 'safety');
    });

    test('a clock-reset dive keeps its recorded date', () => {
        assert.equal(entryFromRecording(diveOf('00000099')).dive_date, '2006-07-19');
    });
});

describe('gas model', () => {
    const multi = {
        gases: [
            { id: 'g0', o2: 0.21, he: 0, role: 'oc' }, { id: 'g1', o2: 0.5, he: 0, role: 'oc' },
            { id: 'g2', o2: 1, he: 0, role: 'oc' }, { id: 'g3', o2: 0.21, he: 0, role: 'diluent' },
        ],
        events: [{ t: 0, type: 'gasSwitch', gasId: 'g0' }, { t: 1800, type: 'gasSwitch', gasId: 'g1' },
            { t: 2400, type: 'gasSwitch', gasId: 'g0' }, { t: 2500, type: 'gasSwitch', gasId: 'g1' }],
    };

    test('gasesFromRecording: bottom = first breathed, deco = later switches, unused and CCR gases left out', () => {
        const rows = gasesFromRecording(multi);
        assert.deepEqual(rows.map(r => [r.role, r.o2]), [['bottom', 0.21], ['deco', 0.5]]);
        assert.equal(rows[0].cylinder, null);
        assert.equal(rows[0].startBar, null);
        assert.deepEqual(gasesFromRecording({ gases: [{ id: 'g0', o2: 0.32, he: 0, role: 'oc' }], events: [] }).map(r => r.o2), [0.32]);
        assert.deepEqual(gasesFromRecording({ gases: [{ id: 'g0', o2: 0.21, he: 0, role: 'diluent' }], events: [] }), []);
        assert.equal(gasesFromRecording(diveOf('00000100')).length, 1);
    });

    test('entryFromRecording stores the recording gases in details.gases', () => {
        const e = entryFromRecording({ ...diveOf('00000100'), gases: multi.gases, events: multi.events });
        assert.deepEqual(e.details.gases.map(r => r.role), ['bottom', 'deco']);
        assert.deepEqual(e.gas, { o2: 0.21, he: 0 });
    });

    test('gasesFromEntry migrates the legacy single cylinder', () => {
        const legacy = { gas: { o2: 0.32, he: 0 }, details: { cylinderL: 12, cylinderMaterial: 'steel', pressureStartBar: 200, pressureEndBar: 60 } };
        assert.deepEqual(gasesFromEntry(legacy), [{ role: 'bottom', o2: 0.32, he: 0, cylinder: 's12', volumeL: 12, material: 'steel', startBar: 200, endBar: 60 }]);
        const odd = gasesFromEntry({ gas: null, details: { cylinderL: 13 } });
        assert.deepEqual(odd, [{ role: 'bottom', o2: null, he: null, cylinder: 'custom', volumeL: 13, material: null, startBar: null, endBar: null }]);
        // Nothing is invented: no material without one stored, no twinset for a legacy 24 l, material kept without a volume.
        assert.deepEqual(gasesFromEntry({ gas: null, details: { cylinderL: 12 } }).map(r => [r.cylinder, r.material]), [['custom', null]]);
        assert.deepEqual(gasesFromEntry({ gas: null, details: { cylinderL: 24, cylinderMaterial: 'steel' } }).map(r => [r.cylinder, r.volumeL]), [['custom', 24]]);
        assert.deepEqual(gasesFromEntry({ gas: null, details: { cylinderL: 11.1, cylinderMaterial: 'aluminium' } })[0].cylinder, 'al80');
        const matOnly = gasesFromEntry({ gas: null, details: { cylinderMaterial: 'aluminium' } });
        assert.deepEqual(matOnly.map(r => [r.cylinder, r.material]), [['custom', 'aluminium']]);
        assert.equal(gasesFromFormRows(formRowsFromGases(matOnly)).gases[0].material, 'aluminium');
        assert.deepEqual(gasesFromEntry({ gas: { o2: 0.21, he: 0 }, details: {} }).map(r => [r.o2, r.cylinder]), [[0.21, null]]);
        assert.deepEqual(gasesFromEntry({ gas: null, details: {} }), []);
        const stored = [{ role: 'deco', o2: 0.5, he: 0, cylinder: 'al40', volumeL: 5.7, material: 'aluminium', startBar: 200, endBar: 150 }];
        assert.deepEqual(gasesFromEntry({ gas: { o2: 0.21, he: 0 }, details: { gases: stored, cylinderL: 12 } }), stored);
    });

    test('primaryGas is the first bottom mix that is known', () => {
        assert.deepEqual(primaryGas([{ role: 'deco', o2: 0.5, he: 0 }, { role: 'bottom', o2: 0.18, he: 0.45 }]), { o2: 0.18, he: 0.45 });
        assert.deepEqual(primaryGas([{ role: 'deco', o2: 0.5, he: 0 }]), { o2: 0.5, he: 0 });
        assert.equal(primaryGas([{ role: 'bottom', o2: null, he: null }]), null);
        assert.equal(primaryGas([]), null);
    });

    test('gasUsage: bar, litres and SAC at mean ambient pressure 1 + avg/10', () => {
        const rows = [
            { role: 'bottom', volumeL: 12, startBar: 200, endBar: 80 },
            { role: 'deco', volumeL: 5.7, startBar: 200, endBar: 160 },
        ];
        const u = gasUsage(rows, { durationS: 3000, avgDepthM: 20 });
        assert.deepEqual(u.rows, [{ usedBar: 120, usedL: 1440 }, { usedBar: 40, usedL: 228 }]);
        assert.equal(u.totalL, 1668);
        assert.equal(u.sacLpm, 1668 / (50 * 3));
        assert.equal(gasUsage(rows, { durationS: 3000, avgDepthM: null }).sacLpm, null);
        assert.equal(gasUsage(rows, { durationS: 0, avgDepthM: 20 }).sacLpm, null);
        const noVol = gasUsage([{ volumeL: null, startBar: 200, endBar: 100 }, rows[1]], { durationS: 3000, avgDepthM: 20 });
        assert.deepEqual(noVol.rows[0], { usedBar: 100, usedL: null });
        assert.equal(noVol.totalL, null); // a partial sum would understate the gas used
        assert.equal(noVol.sacLpm, null);
        assert.equal(gasUsage([{ volumeL: 10, startBar: 200.3, endBar: 50.1 }], {}).rows[0].usedBar, 150.2);
        const bad = gasUsage([{ volumeL: 12, startBar: 50, endBar: 200 }], { durationS: 3000, avgDepthM: 20 });
        assert.deepEqual(bad.rows[0], { usedBar: null, usedL: null });
        assert.equal(bad.totalL, null);
        assert.deepEqual(gasUsage([{ volumeL: 12, startBar: null, endBar: null }], { durationS: 3000, avgDepthM: 20 }), { rows: [{ usedBar: null, usedL: null }], totalL: null, sacLpm: null });
    });

    test('form rows round-trip, with a decimal comma', () => {
        const rows = [
            { role: 'bottom', o2: 0.32, he: 0, cylinder: 'al80', volumeL: 11.1, material: 'aluminium', startBar: 200, endBar: 70 },
            { role: 'deco', o2: 0.5, he: 0, cylinder: 'custom', volumeL: 6.5, material: 'steel', startBar: 210, endBar: null },
            { role: 'bottom', o2: 0.18, he: 0.45, cylinder: null, volumeL: null, material: null, startBar: null, endBar: null },
            { role: 'bottom', o2: 0.33, he: 0, cylinder: null, volumeL: null, material: null, startBar: null, endBar: null },
        ];
        const form = formRowsFromGases(rows, { comma: true });
        assert.deepEqual(form.map(r => r.mix), ['ean32', 'ean50', 'tx', 'nx']);
        assert.equal(form[1].volumeL, '6,5');
        assert.equal(form[2].o2, '18');
        assert.equal(form[2].he, '45');
        assert.deepEqual(gasesFromFormRows(form), { gases: rows, errors: [] });
    });

    test('gasesFromFormRows: preset cylinders fill volume and material; bad input is reported', () => {
        const { gases } = gasesFromFormRows([{ ...newGasRow('bottom'), startBar: '200', endBar: '50' }]);
        assert.deepEqual(gases, [{ role: 'bottom', o2: 0.21, he: 0, cylinder: 's12', volumeL: 12, material: 'steel', startBar: 200, endBar: 50 }]);
        assert.deepEqual(newGasRow('deco').cylinder, 'al40');
        assert.deepEqual(newGasRow('deco').mix, 'ean50');
        const bad = gasesFromFormRows([
            { ...newGasRow('bottom'), mix: 'nx', o2: '' },
            { ...newGasRow('bottom'), mix: 'tx', o2: '60', he: '50' },
            { ...newGasRow('bottom'), startBar: '2oo' },
            { ...newGasRow('bottom'), cylinder: 'custom', volumeL: 'x' },
            { ...newGasRow('bottom'), mix: 'tx', o2: '18', he: '4S' },
            { ...newGasRow('bottom'), mix: 'nx', o2: '0,32' },
        ]);
        assert.deepEqual(bad.errors, [{ index: 0, field: 'mix' }, { index: 1, field: 'mix' }, { index: 2, field: 'startBar' }, { index: 3, field: 'volumeL' },
            { index: 4, field: 'mix' }, { index: 5, field: 'mix' }]);
        assert.deepEqual(gasesFromFormRows([{ ...newGasRow('bottom'), mix: '' }]).gases[0].o2, null);
    });

    test('cylinderText names presets and custom cylinders', () => {
        const opts = { fmt: (v, d) => String(v).replace('.', ','), material: m => ({ steel: 'Ocel', aluminium: 'Hliník' })[m] };
        assert.equal(cylinderText({ cylinder: 'al80', volumeL: 11.1 }, opts), 'AL80 (11,1 l)');
        assert.equal(cylinderText({ cylinder: 'd12', volumeL: 24 }, opts), '2×12 l');
        assert.equal(cylinderText({ cylinder: 's12', volumeL: 12 }, opts), '12 l, ocel');
        assert.equal(cylinderText({ cylinder: 'custom', volumeL: 13, material: 'aluminium' }, opts), '13 l, hliník');
        assert.equal(cylinderText({ cylinder: 'custom', volumeL: 13, material: null }, opts), '13 l');
        assert.equal(cylinderText({ cylinder: null, volumeL: null }, opts), '');
    });
});

describe('numbering', () => {
    test('next number', () => {
        assert.equal(nextLogNumber([]), 1);
        assert.equal(nextLogNumber([{ log_number: 3 }, { log_number: 7 }]), 8);
    });

    test('recordings are numbered by device number, then start', () => {
        const rows = [
            { id: 'c', diveNumber: 101, startLocal: '2026-09-27T16:21:22' },
            { id: 'a', diveNumber: 99, startLocal: '2006-07-19T09:59:05' },
            { id: 'x', diveNumber: null, startLocal: '2026-01-01T00:00:00' },
            { id: 'b', diveNumber: 100, startLocal: '2026-09-27T12:01:01' },
        ];
        assert.deepEqual(orderRecordingsForNumbering(rows).map(r => r.id), ['a', 'b', 'c', 'x']);
    });
});

describe('form normalisation', () => {
    test('decimal comma, spaces and empty values', () => {
        assert.equal(parseDecimal('12,5'), 12.5);
        assert.equal(parseDecimal(' 7.25 '), 7.25);
        assert.equal(parseDecimal(''), null);
        assert.equal(parseDecimal('abc'), null);
        assert.equal(parseDecimal(null), null);
    });

    test('normalizeEntry keeps unknown detail keys and drops empty ones', () => {
        const row = normalizeEntry({
            log_number: '12', dive_date: '2026-10-01', entry_time: '', duration_min: '45',
            max_depth_m: '18,4', buddies: [' Petr ', '', 'Petr', 'Jirka'],
            vis_shallow_m: '8', vis_deep_m: '', notes: '  ',
            details: { weather: 'sun', current: '' },
        }, { futureKey: 'kept', current: 'light' });
        assert.equal(row.log_number, 12);
        assert.equal(row.entry_time, null);
        assert.equal(row.duration_s, 2700);
        assert.equal(row.max_depth_m, 18.4);
        assert.deepEqual(row.buddies, ['Petr', 'Jirka']);
        assert.equal(row.vis_deep_m, null);
        assert.equal(row.notes, null);
        assert.deepEqual(row.details, { futureKey: 'kept', weather: 'sun' });
        for (const v of Object.values(row)) assert.ok(!Number.isNaN(v));
    });

    test('normalizeEntry reads m:ss durations to exact seconds', () => {
        assert.equal(normalizeEntry({ duration_min: '51:49' }).duration_s, 3109);
        assert.equal(normalizeEntry({ duration_min: '' }).duration_s, null);
    });

    test('hasUserDetails ignores computer-derived keys', () => {
        assert.equal(hasUserDetails({}), false);
        assert.equal(hasUserDetails({ computer: 'X', stops: 'deco', avgDepthM: 16, surfaceTempC: 18, computerFillVersion: 1 }), false);
        assert.equal(hasUserDetails({ stops: 'deco', weather: 'sun' }), true);
        assert.equal(hasUserDetails({ tags: [] }), false);
        assert.equal(hasUserDetails({ tags: ['night'] }), true);
        assert.equal(hasUserDetails({ unknownKey: 'x' }), false);
    });

    test('needsDetails', () => {
        assert.equal(needsDetails({ site_id: null, buddies: ['A'] }), true);
        assert.equal(needsDetails({ site_id: 's', buddies: [] }), true);
        assert.equal(needsDetails({ site_id: 's', buddies: ['A'] }), false);
    });

    test('detail keys cover the spec groups', () => {
        assert.ok(DETAIL_KEYS.conditions.includes('weather'));
        assert.ok(DETAIL_KEYS.equipment.includes('weightsKg'));
        assert.ok(!DETAIL_KEYS.equipment.includes('cylinderL'));
        assert.ok(DETAIL_KEYS.dive.includes('rating'));
    });
});

describe('dates and same-day entries', () => {
    test('formatDiveDate shows a calendar date in the language, without time-zone shifting', () => {
        assert.equal(formatDiveDate('2026-09-27', 'cs'), '27. 9. 2026');
        assert.equal(formatDiveDate('2026-09-27', 'en'), new Intl.DateTimeFormat(localeTag('en'), { dateStyle: 'medium', timeZone: 'UTC' }).format(new Date(Date.UTC(2026, 8, 27))));
        assert.equal(formatDiveDate('2026-01-01', 'cs'), '1. 1. 2026');
        assert.equal(formatDiveDate('', 'cs'), '');
        assert.equal(formatDiveDate(null, 'cs'), '');
        assert.equal(formatDiveDate('garbage', 'cs'), 'garbage');
    });

    test('entriesOnDate picks the entries of that day ordered by time', () => {
        const entries = [
            { id: 'a', dive_date: '2026-09-27', entry_time: '16:21:22' },
            { id: 'b', dive_date: '2026-09-28', entry_time: '08:00:00' },
            { id: 'c', dive_date: '2026-09-27', entry_time: '12:01:01' },
            { id: 'd', dive_date: '2026-09-27', entry_time: null },
        ];
        assert.deepEqual(entriesOnDate(entries, '2026-09-27').map(e => e.id), ['d', 'c', 'a']);
        assert.deepEqual(entriesOnDate(entries, '2026-10-01'), []);
    });
});

describe('router', () => {
    test('routes', () => {
        assert.deepEqual(parseRoute(''), { name: 'list' });
        assert.deepEqual(parseRoute('#/'), { name: 'list' });
        assert.deepEqual(parseRoute('#/new'), { name: 'new' });
        assert.deepEqual(parseRoute('#/dive/abc-1'), { name: 'detail', id: 'abc-1' });
        assert.deepEqual(parseRoute('#/dive/abc-1/edit'), { name: 'edit', id: 'abc-1' });
        assert.deepEqual(parseRoute('#/dive/abc-1/analysis'), { name: 'analysis', id: 'abc-1' });
        assert.deepEqual(parseRoute('#/sites'), { name: 'sites' });
        assert.deepEqual(parseRoute('#/site/s-1'), { name: 'site', id: 's-1' });
        assert.deepEqual(parseRoute('#/site/'), { name: 'notFound' });
        assert.equal(routeHref({ name: 'sites' }), '#/sites');
        assert.equal(routeHref({ name: 'site', id: 's-1' }), '#/site/s-1');
        assert.deepEqual(parseRoute('#/nonsense/x'), { name: 'notFound' });
        assert.deepEqual(parseRoute('#error_code=otp_expired'), { name: 'list' });
        assert.equal(routeHref({ name: 'edit', id: 'abc-1' }), '#/dive/abc-1/edit');
        assert.equal(routeHref({ name: 'list' }), '#/');
    });
});

describe('photos', () => {
    test('resizeTarget keeps aspect and never upscales', () => {
        assert.deepEqual(resizeTarget(8000, 6000), { width: 2560, height: 1920 });
        assert.deepEqual(resizeTarget(3000, 4000), { width: 1920, height: 2560 });
        assert.deepEqual(resizeTarget(1200, 800), { width: 1200, height: 800 });
    });

    test('supported image types', () => {
        assert.ok(isSupportedImage('image/jpeg'));
        assert.ok(isSupportedImage('photo.WEBP'));
        assert.ok(!isSupportedImage('image/heic'));
        assert.ok(!isSupportedImage('IMG_1.HEIC'));
    });
});


// ---------------------------------------------------------------------------
// Fake Supabase client for the logbook store (in memory, realistic unique errors)
// ---------------------------------------------------------------------------

const UNIQUE = {
    log_entries: [
        { name: 'log_entries_recording_id_key', cols: ['recording_id'], skipNull: true },
        { name: 'log_entries_owner_log_number_key', cols: ['owner', 'log_number'] },
    ],
};

function fakeLogbookClient({ user = { id: 'u1', email: 'me@example.com' }, tables = {} } = {}) {
    const db = { dives: [], log_entries: [], sites: [], media: [], ...tables };
    const files = new Map();
    const calls = [];
    let seq = 0;

    function violation(table, row, ignoreId) {
        for (const u of UNIQUE[table] ?? []) {
            if (u.skipNull && u.cols.some(c => row[c] == null)) continue;
            const clash = db[table].find(r => r.id !== ignoreId && u.cols.every(c => r[c] === row[c]));
            if (clash) {
                return {
                    code: '23505',
                    message: `duplicate key value violates unique constraint "${u.name}"`,
                    details: `Key (${u.cols.join(', ')})=(${u.cols.map(c => row[c]).join(', ')}) already exists.`,
                };
            }
        }
        return null;
    }

    function builder(table) {
        const q = {
            _mode: 'select', _filters: [], _order: [], _payload: null, _single: null,
            select() { return this; },
            order(col, opts = {}) { this._order.push([col, opts.ascending !== false]); calls.push(['order', table, col, opts.ascending !== false]); return this; },
            eq(col, val) { this._filters.push(r => r[col] === val); return this; },
            in(col, vals) { this._filters.push(r => vals.includes(r[col])); return this; },
            range(from, to) { this._range = [from, to]; return this; },
            single() { this._single = 'single'; return this; },
            maybeSingle() { this._single = 'maybe'; return this; },
            insert(payload) { this._mode = 'insert'; this._payload = payload; return this; },
            update(patch) { this._mode = 'update'; this._payload = patch; return this; },
            delete() { this._mode = 'delete'; return this; },
            then(resolve, reject) { return this._run().then(resolve, reject); },
            async _run() {
                await null; // let concurrent callers interleave
                const shape = rows => {
                    if (!this._single) return { data: rows, error: null };
                    if (rows.length === 1 || (this._single === 'maybe' && rows.length <= 1)) return { data: rows[0] ?? null, error: null };
                    return { data: null, error: { code: this._single === 'single' ? 'PGRST116' : 'PGRST116', message: 'JSON object requested, multiple (or no) rows returned' } };
                };
                const match = () => db[table].filter(r => this._filters.every(f => f(r)));
                if (this._mode === 'select') {
                    let rows = match().map(r => ({ ...r }));
                    for (const [col, asc] of this._order.slice().reverse()) {
                        rows.sort((a, b) => (a[col] < b[col] ? -1 : a[col] > b[col] ? 1 : 0) * (asc ? 1 : -1));
                    }
                    if (this._range) rows = rows.slice(this._range[0], this._range[1] + 1);
                    return shape(rows);
                }
                if (this._mode === 'insert') {
                    const inserted = [];
                    for (const p of [].concat(this._payload)) {
                        const row = { id: `${table}-${++seq}`, owner: user.id, buddies: [], details: {}, ...p };
                        const error = violation(table, row);
                        if (error) { calls.push(['insert-failed', table, row, error.message]); return { data: null, error }; }
                        db[table].push(row);
                        calls.push(['insert', table, row]);
                        inserted.push({ ...row });
                    }
                    return shape(inserted);
                }
                if (this._mode === 'update') {
                    const rows = match();
                    const patched = [];
                    for (const r of rows) {
                        const next = { ...r, ...this._payload };
                        const error = violation(table, next, r.id);
                        if (error) return { data: null, error };
                        Object.assign(r, this._payload);
                        patched.push({ ...r });
                    }
                    calls.push(['update', table, this._payload]);
                    return shape(patched);
                }
                const gone = match();
                db[table] = db[table].filter(r => !gone.includes(r));
                if (table === 'log_entries') db.media = db.media.filter(m => !gone.some(g => g.id === m.entry_id));
                calls.push(['delete', table, gone.map(g => g.id)]);
                return { data: null, error: null };
            },
        };
        return q;
    }

    return {
        calls, files, db,
        auth: {
            async getUser() { return { data: { user }, error: null }; },
            async getSession() { return { data: { session: user ? { user } : null }, error: null }; },
        },
        from: builder,
        storage: {
            from(bucket) {
                return {
                    async upload(path, body, opts) { calls.push(['upload', bucket, path, opts]); files.set(`${bucket}/${path}`, body); return { data: { path }, error: null }; },
                    async remove(paths) { calls.push(['remove', bucket, paths]); paths.forEach(p => files.delete(`${bucket}/${p}`)); return { data: [], error: null }; },
                    async createSignedUrls(paths, seconds) {
                        calls.push(['sign', bucket, paths, seconds]);
                        return { data: paths.map(path => ({ path, signedUrl: `https://signed.example/${bucket}/${path}?t=1`, error: null })), error: null };
                    },
                };
            },
        },
    };
}

const recordingRow = (id, n, start, dive) => ({
    id, owner: 'u1', device_serial: '7044-00006107', dive_number: n, start_local: start, record: dive,
});

describe('logbook store: fillComputerFields', () => {
    const setup = (details = {}) => {
        const client = fakeLogbookClient({ tables: { dives: [recordingRow('r100', 100, '2026-09-27T12:01:01', diveOf('00000100'))] } });
        client.db.log_entries.push({ id: 'e1', owner: 'u1', log_number: 1, dive_date: '2026-09-27', recording_id: 'r100', buddies: [], details });
        return { client, store: createSupabaseStore(client), entry: client.db.log_entries[0] };
    };

    test('fills missing values, keeps others, marks the version', async () => {
        const { store, entry } = setup({ weather: 'sun' });
        assert.equal(await store.fillComputerFields(), 1);
        assert.equal(entry.details.surfaceTempC, 18.5);
        assert.ok(Math.abs(entry.details.avgDepthM - 16.1) <= 0.2);
        assert.equal(entry.details.weather, 'sun');
        assert.equal(entry.details.computerFillVersion, 1);
    });

    test('never overwrites a value that is there', async () => {
        const { store, entry } = setup({ surfaceTempC: 12 });
        await store.fillComputerFields();
        assert.equal(entry.details.surfaceTempC, 12);
        assert.ok(entry.details.avgDepthM > 0);
    });

    test('a second run does nothing, also after the user cleared a value', async () => {
        const { client, store, entry } = setup();
        await store.fillComputerFields();
        delete entry.details.avgDepthM;
        const before = client.calls.length;
        assert.equal(await store.fillComputerFields(), 0);
        assert.ok(!client.calls.slice(before).some(c => c[0] === 'update'));
        assert.equal(entry.details.avgDepthM, undefined);
    });

    test('entries without a recording or with nothing missing are left alone', async () => {
        const { client, store } = setup({ surfaceTempC: 1, avgDepthM: 2 });
        client.db.log_entries.push({ id: 'e2', owner: 'u1', log_number: 2, dive_date: '2026-09-28', recording_id: null, buddies: [], details: {} });
        assert.equal(await store.fillComputerFields(), 0);
        assert.deepEqual(client.db.log_entries[1].details, {});
        assert.ok(!client.calls.some(c => c[0] === 'update'));
    });

    test('a failure is logged and counted as zero, not thrown', async () => {
        const { client, store } = setup();
        client.from = () => { throw new Error('boom'); };
        const orig = console.error;
        console.error = () => {};
        try { assert.equal(await store.fillComputerFields(), 0); } finally { console.error = orig; }
    });
});

describe('logbook store: entries', () => {
    const base = { dive_date: '2026-09-27', log_number: 1 };

    test('saveEntry inserts, then updates by id; getEntry reads it back', async () => {
        const client = fakeLogbookClient();
        const store = createSupabaseStore(client);
        const saved = await store.saveEntry({ ...base, max_depth_m: 20 });
        assert.equal(saved.log_number, 1);
        assert.equal(saved.owner, 'u1');
        const updated = await store.saveEntry({ max_depth_m: 25 }, saved.id);
        assert.equal(updated.max_depth_m, 25);
        assert.equal(updated.dive_date, '2026-09-27');
        assert.equal((await store.getEntry(saved.id)).max_depth_m, 25);
        assert.equal(await store.getEntry('nope'), null);
        assert.equal(client.db.log_entries.length, 1);
    });

    test('listEntries is ordered by log number, newest first', async () => {
        const store = createSupabaseStore(fakeLogbookClient());
        for (const n of [2, 5, 3]) await store.saveEntry({ dive_date: '2026-01-01', log_number: n });
        assert.deepEqual((await store.listEntries()).map(e => e.log_number), [5, 3, 2]);
    });

    test('a duplicate log number is reported as duplicate-number', async () => {
        const store = createSupabaseStore(fakeLogbookClient());
        await store.saveEntry({ ...base });
        await assert.rejects(() => store.saveEntry({ ...base }), e => e instanceof DiveStoreError && e.kind === 'duplicate-number');
        const other = await store.saveEntry({ ...base, log_number: 2 });
        await assert.rejects(() => store.saveEntry({ log_number: 1 }, other.id), e => e.kind === 'duplicate-number');
    });

    test('sites are listed by name; saveSite inserts and updates', async () => {
        const store = createSupabaseStore(fakeLogbookClient());
        const b = await store.saveSite({ name: 'Zlatý kopec' });
        await store.saveSite({ name: 'Abyss' });
        await store.saveSite({ lat: 49.1 }, b.id);
        const sites = await store.listSites();
        assert.deepEqual(sites.map(s => s.name), ['Abyss', 'Zlatý kopec']);
        assert.equal(sites[1].lat, 49.1);
    });

    test('listBuddies: distinct names, most used first, ties by name', async () => {
        const store = createSupabaseStore(fakeLogbookClient());
        await store.saveEntry({ ...base, log_number: 1, buddies: ['Jirka', 'Petr'] });
        await store.saveEntry({ ...base, log_number: 2, buddies: ['Petr'] });
        await store.saveEntry({ ...base, log_number: 3, buddies: ['Petr', 'Anna'] });
        assert.deepEqual(await store.listBuddies(), ['Petr', 'Anna', 'Jirka']);
    });

    test('listBuddies groups case- and whitespace-insensitively, keeps the most frequent spelling', async () => {
        const store = createSupabaseStore(fakeLogbookClient());
        await store.saveEntry({ ...base, log_number: 1, buddies: ['petr', 'Anna'] });
        await store.saveEntry({ ...base, log_number: 2, buddies: ['Petr'] });
        await store.saveEntry({ ...base, log_number: 3, buddies: [' Petr ', 'anna'] });
        await store.saveEntry({ ...base, log_number: 4, buddies: ['Petr', 'Zora', 'Beda'] });
        // Petr: 3x "Petr"-ish (Petr, ' Petr '->Petr, Petr) vs 1x petr -> "Petr"; Anna 2 (Anna, anna tie -> first by name order)
        const names = await store.listBuddies();
        assert.equal(names.length, 4);
        assert.equal(names[0], 'Petr');
        assert.equal(names[1].toLowerCase(), 'anna');
        assert.deepEqual(names.slice(2), ['Beda', 'Zora']);
    });
});

describe('logbook store: ensureEntries', () => {
    async function setup() {
        const dives = [
            recordingRow('r100', 100, '2026-09-27T12:01:01', diveOf('00000100')),
            recordingRow('r099', 99, '2006-07-19T09:59:05', diveOf('00000099')),
            recordingRow('r101', 101, '2026-09-27T16:21:22', diveOf('00000101')),
        ];
        const client = fakeLogbookClient({ tables: { dives } });
        return { client, store: createSupabaseStore(client) };
    }

    test('creates entries for unlinked recordings, numbered after the max in device order', async () => {
        const { client, store } = await setup();
        client.db.log_entries.push({ id: 'e1', owner: 'u1', log_number: 7, dive_date: '2026-09-27', recording_id: 'r100', buddies: [], details: {} });
        assert.equal(await store.ensureEntries(), 2);
        const byRec = Object.fromEntries(client.db.log_entries.map(e => [e.recording_id, e]));
        assert.equal(byRec.r099.log_number, 8);
        assert.equal(byRec.r101.log_number, 9);
        assert.equal(byRec.r099.dive_date, '2006-07-19');
        assert.equal(byRec.r099.owner, 'u1');
        assert.deepEqual(byRec.r101.gas, entryFromRecording(diveOf('00000101')).gas);
        assert.equal(byRec.r101.details.computer, entryFromRecording(diveOf('00000101')).details.computer);
        assert.equal(await store.ensureEntries(), 0);
        assert.equal(client.db.log_entries.length, 3);
    });

    test('two concurrent runs end with exactly one entry per recording', async () => {
        const { client, store } = await setup();
        const counts = await Promise.all([store.ensureEntries(), store.ensureEntries()]);
        assert.equal(client.db.log_entries.length, 3);
        assert.deepEqual(client.db.log_entries.map(e => e.recording_id).sort(), ['r099', 'r100', 'r101']);
        assert.equal(new Set(client.db.log_entries.map(e => e.log_number)).size, 3);
        assert.equal(counts[0] + counts[1], 3);
    });

    test('a record without start.local falls back to the row start_local; an unusable one is skipped with a warning', async () => {
        const good = diveOf('00000100');
        const noStart = { ...structuredClone(good), start: {} };
        const broken = { ...structuredClone(good), start: undefined };
        const dives = [
            recordingRow('a', 1, '2026-05-01T10:00:00', noStart),
            recordingRow('b', 2, null, broken),
            recordingRow('c', 3, '2026-05-02T10:00:00', good),
        ];
        const client = fakeLogbookClient({ tables: { dives } });
        const store = createSupabaseStore(client);
        const warn = console.warn;
        const warnings = [];
        console.warn = (...a) => warnings.push(a);
        try {
            assert.equal(await store.ensureEntries(), 2);
        } finally {
            console.warn = warn;
        }
        const byRec = Object.fromEntries(client.db.log_entries.map(e => [e.recording_id, e]));
        assert.equal(byRec.a.dive_date, '2026-05-01');
        assert.equal(byRec.a.entry_time, '10:00:00');
        assert.equal(byRec.b, undefined);
        assert.equal(byRec.c.dive_date, '2026-09-27');
        assert.equal(warnings.length, 1);
    });

    test('a log-number race retries once with a fresh maximum', async () => {
        const { client, store } = await setup();
        // another session takes number 1 between our read of the max and our insert
        const realFrom = client.from;
        let raced = false;
        client.from = table => {
            const q = realFrom(table);
            if (table === 'log_entries') {
                const insert = q.insert.bind(q);
                q.insert = payload => {
                    if (!raced) {
                        raced = true;
                        client.db.log_entries.push({ id: 'x', owner: 'u1', log_number: payload.log_number, dive_date: '2026-01-01', recording_id: null, buddies: [], details: {} });
                    }
                    return insert(payload);
                };
            }
            return q;
        };
        assert.equal(await store.ensureEntries(), 3);
        assert.ok(client.calls.some(c => c[0] === 'insert-failed' && /owner_log_number_key/.test(c[3])));
        assert.equal(client.db.log_entries.filter(e => e.recording_id).length, 3);
        assert.equal(new Set(client.db.log_entries.map(e => e.log_number)).size, 4);
    });
});

describe('logbook store: media', () => {
    test('addPhoto uploads under <uid>/<entry>/<media>.jpg and stores a media row', async () => {
        const client = fakeLogbookClient();
        const store = createSupabaseStore(client);
        const entry = await store.saveEntry({ dive_date: '2026-09-27', log_number: 1 });
        const blob = new Blob([new Uint8Array([1, 2, 3])], { type: 'image/jpeg' });
        const media = await store.addPhoto(entry.id, { blob, width: 800, height: 600, takenAt: '2026-09-27T12:30:00Z', lat: 49.1, lon: 16.6 });
        const up = client.calls.find(c => c[0] === 'upload');
        assert.equal(up[1], 'dive-photos');
        assert.match(up[2], new RegExp(`^u1/${entry.id}/[0-9a-f-]{36}\\.jpg$`));
        assert.equal(up[3].contentType, 'image/jpeg');
        assert.equal(media.path, up[2]);
        assert.equal(media.id, up[2].split('/')[2].replace('.jpg', ''));
        assert.equal(media.kind, 'photo');
        assert.equal(media.entry_id, entry.id);
        assert.deepEqual([media.width, media.height, media.taken_at, media.lat, media.lon], [800, 600, '2026-09-27T12:30:00Z', 49.1, 16.6]);
        assert.deepEqual((await store.listMedia(entry.id)).map(m => m.id), [media.id]);
    });

    test('addVideoLink and deleteMedia', async () => {
        const client = fakeLogbookClient();
        const store = createSupabaseStore(client);
        const entry = await store.saveEntry({ dive_date: '2026-09-27', log_number: 1 });
        const v = await store.addVideoLink(entry.id, 'https://youtu.be/x', 'wreck');
        assert.deepEqual([v.kind, v.url, v.caption], ['video_link', 'https://youtu.be/x', 'wreck']);
        const photo = await store.addPhoto(entry.id, { blob: new Blob(['x']), width: 1, height: 1 });
        await store.deleteMedia(photo);
        assert.ok(client.calls.some(c => c[0] === 'remove' && c[2][0] === photo.path));
        await store.deleteMedia(v);
        assert.equal((await store.listMedia(entry.id)).length, 0);
    });

    test('listPhotoMedia returns photo rows of every entry, not video links', async () => {
        const store = createSupabaseStore(fakeLogbookClient());
        const a = await store.saveEntry({ dive_date: '2026-09-27', log_number: 1 });
        const b = await store.saveEntry({ dive_date: '2026-09-28', log_number: 2 });
        const pa = await store.addPhoto(a.id, { blob: new Blob(['x']), width: 1, height: 1 });
        await store.addVideoLink(a.id, 'https://youtu.be/x');
        const pb = await store.addPhoto(b.id, { blob: new Blob(['y']), width: 1, height: 1 });
        assert.deepEqual((await store.listPhotoMedia()).map(m => m.id).sort(), [pa.id, pb.id].sort());
    });

    test('photoUrls maps paths to signed URLs valid for an hour', async () => {
        const client = fakeLogbookClient();
        const store = createSupabaseStore(client);
        const urls = await store.photoUrls(['u1/e/a.jpg', 'u1/e/b.jpg']);
        assert.equal(urls.get('u1/e/a.jpg'), 'https://signed.example/dive-photos/u1/e/a.jpg?t=1');
        assert.equal(urls.size, 2);
        assert.equal(client.calls.find(c => c[0] === 'sign')[3], 3600);
        assert.equal((await store.photoUrls([])).size, 0);
    });

    test('deleteEntry removes the entry, its media and photo files, but keeps the recording', async () => {
        const dives = [recordingRow('r100', 100, '2026-09-27T12:01:01', diveOf('00000100'))];
        const client = fakeLogbookClient({ tables: { dives } });
        const store = createSupabaseStore(client);
        await store.ensureEntries();
        const [entry] = await store.listEntries();
        const photo = await store.addPhoto(entry.id, { blob: new Blob(['x']), width: 1, height: 1 });
        await store.addVideoLink(entry.id, 'https://youtu.be/x');
        const { deleteEntry } = store; // works detached from the store object
        await deleteEntry(entry.id);
        assert.equal(client.db.log_entries.length, 0);
        assert.equal(client.db.media.length, 0);
        assert.equal(client.db.dives.length, 1);
        assert.equal(client.files.has(`dive-photos/${photo.path}`), false);
        const removed = client.calls.find(c => c[0] === 'remove');
        assert.deepEqual(removed[2], [photo.path]);
    });
});

describe('logbook store: deleteEntries (bulk)', () => {
    const withFile = (id, n, start, serial) => ({ ...recordingRow(id, n, start, diveOf(serial)), file_path: `u1/${id}.dlf` });
    const setup = async () => {
        const dives = [
            withFile('r100', 100, '2026-09-27T12:01:01', '00000100'),
            withFile('r101', 101, '2026-09-28T12:01:01', '00000099'),
            withFile('r102', 102, '2026-09-29T12:01:01', '00000092'),
        ];
        const client = fakeLogbookClient({ tables: { dives } });
        client.files.set('dive-logs/u1/r100.dlf', 'a');
        client.files.set('dive-logs/u1/r101.dlf', 'b');
        client.files.set('dive-logs/u1/r102.dlf', 'c');
        const store = createSupabaseStore(client);
        await store.ensureEntries();
        const entries = await store.listEntries();
        return { client, store, entries };
    };

    test('without recordings: entries and photos go, recordings are dismissed and kept', async () => {
        const { client, store, entries } = await setup();
        const photo = await store.addPhoto(entries[0].id, { blob: new Blob(['x']), width: 1, height: 1 });
        const result = await store.deleteEntries([entries[0].id, entries[1].id]);
        assert.deepEqual(result, { deleted: 2, failed: [] });
        assert.equal(client.db.log_entries.length, 1);
        assert.equal(client.db.dives.length, 3);
        assert.equal(client.db.dives.filter(d => d.logbook_dismissed).length, 2);
        assert.equal(client.files.has(`dive-photos/${photo.path}`), false);
        assert.equal(client.files.has('dive-logs/u1/r100.dlf'), true);
    });

    test('with recordings: entries, dives rows and files go and ensureEntries recreates nothing', async () => {
        const { client, store, entries } = await setup();
        const result = await store.deleteEntries(entries.map(e => e.id), { withRecordings: true });
        assert.deepEqual(result, { deleted: 3, failed: [] });
        assert.equal(client.db.log_entries.length, 0);
        assert.equal(client.db.dives.length, 0);
        const removed = client.calls.filter(c => c[0] === 'remove' && c[1] === 'dive-logs').map(c => c[2]);
        assert.deepEqual(removed.flat().sort(), ['u1/r100.dlf', 'u1/r101.dlf', 'u1/r102.dlf']);
        assert.equal([...client.files.keys()].filter(k => k.startsWith('dive-logs/')).length, 0);
        assert.equal(await store.ensureEntries(), 0);
    });

    test('with recordings: the recording is dismissed before its entry goes, and the row goes last', async () => {
        const { client, store, entries } = await setup();
        client.calls.length = 0;
        await store.deleteEntries([entries[0].id], { withRecordings: true });
        const kinds = client.calls
            .filter(c => (c[0] === 'update' && c[1] === 'dives') || (c[0] === 'delete') || (c[0] === 'remove' && c[1] === 'dive-logs'))
            .map(c => `${c[0]}:${c[1]}`);
        assert.deepEqual(kinds, ['update:dives', 'delete:log_entries', 'remove:dive-logs', 'delete:dives']);
    });

    test('with recordings: an entry without a recording is simply deleted', async () => {
        const { client, store } = await setup();
        const manual = await store.saveEntry({ dive_date: '2026-01-01', log_number: 90 });
        const result = await store.deleteEntries([manual.id], { withRecordings: true });
        assert.deepEqual(result, { deleted: 1, failed: [] });
        assert.equal(client.db.dives.length, 3);
        assert.equal(client.calls.some(c => c[0] === 'remove' && c[1] === 'dive-logs'), false);
    });

    test('a missing recording file does not fail the delete', async () => {
        const { client, store, entries } = await setup();
        client.storage.from = (orig => bucket => ({ ...orig(bucket), remove: async () => ({ data: null, error: { message: 'Object not found', statusCode: '404' } }) }))(client.storage.from);
        const result = await store.deleteEntries([entries[0].id], { withRecordings: true });
        assert.equal(result.deleted, 1);
        assert.equal(client.db.dives.length, 2);
    });

    test('a failure is reported and the rest continues; progress counts every dive', async () => {
        const { client, store, entries } = await setup();
        const origFrom = client.from;
        client.from = table => {
            const q = origFrom(table);
            if (table === 'log_entries') {
                const del = q.delete.bind(q);
                q.delete = function () {
                    const r = del();
                    const eq = r.eq.bind(r);
                    r.eq = (col, val) => {
                        if (val === entries[1].id) r._run = async () => ({ data: null, error: { message: 'boom' } });
                        return eq(col, val);
                    };
                    return r;
                };
            }
            return q;
        };
        const progress = [];
        const result = await store.deleteEntries(entries.map(e => e.id), { onProgress: (done, total) => progress.push([done, total]) });
        assert.equal(result.deleted, 2);
        assert.equal(result.failed.length, 1);
        assert.equal(result.failed[0].id, entries[1].id);
        assert.match(result.failed[0].message, /boom/);
        assert.equal(client.db.log_entries.length, 1);
        assert.deepEqual(progress, [[0, 3], [1, 3], [2, 3], [3, 3]]);
    });

    test('no ids is a no-op', async () => {
        const { store } = await setup();
        assert.deepEqual(await store.deleteEntries([]), { deleted: 0, failed: [] });
    });
});

describe('logbook store: deleted entries stay deleted', () => {
    const dives = () => [recordingRow('r100', 100, '2026-09-27T12:01:01', diveOf('00000100'))];

    test('deleteEntry dismisses the recording so ensureEntries does not recreate it', async () => {
        const client = fakeLogbookClient({ tables: { dives: dives() } });
        const store = createSupabaseStore(client);
        assert.equal(await store.ensureEntries(), 1);
        const [entry] = await store.listEntries();
        await store.deleteEntry(entry.id);
        assert.equal(client.db.dives[0].logbook_dismissed, true);
        assert.equal(await store.ensureEntries(), 0);
        assert.equal(client.db.log_entries.length, 0);
    });

    test('the recording is dismissed before the entry is deleted', async () => {
        const client = fakeLogbookClient({ tables: { dives: dives() } });
        const store = createSupabaseStore(client);
        await store.ensureEntries();
        const [entry] = await store.listEntries();
        client.calls.length = 0;
        await store.deleteEntry(entry.id);
        const kinds = client.calls.filter(c => (c[0] === 'update' && c[1] === 'dives') || (c[0] === 'delete' && c[1] === 'log_entries')).map(c => `${c[0]}:${c[1]}`);
        assert.deepEqual(kinds, ['update:dives', 'delete:log_entries']);
    });

    test('logging a dismissed recording again clears the flag', async () => {
        const client = fakeLogbookClient({ tables: { dives: dives() } });
        const store = createSupabaseStore(client);
        await store.ensureEntries();
        const [entry] = await store.listEntries();
        await store.deleteEntry(entry.id);
        await store.saveEntry({ dive_date: '2026-09-27', log_number: 1, recording_id: 'r100' });
        assert.equal(client.db.dives[0].logbook_dismissed, false);
        assert.equal(await store.ensureEntries(), 0);
    });

    test('saving an entry for a recording linked meanwhile reports recording-linked', async () => {
        const client = fakeLogbookClient({ tables: { dives: dives() } });
        const store = createSupabaseStore(client);
        await store.ensureEntries();
        await assert.rejects(
            store.saveEntry({ dive_date: '2026-09-27', log_number: 50, recording_id: 'r100' }),
            e => e instanceof DiveStoreError && e.kind === 'recording-linked',
        );
    });
});

describe('transfer', () => {
    const fileOf = id => ({
        name: `${id}.DLF`,
        arrayBuffer: async () => { const b = readFileSync(new URL(`${id}.DLF`, FIXTURES)); return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength); },
    });

    test('uploadDivelog saves new dives, then ensures entries, and reports', async () => {
        const order = [];
        const store = {
            listDives: async () => { order.push('list'); return []; },
            saveDives: async (batch, onProgress) => {
                order.push(`save:${batch.length}`);
                batch.forEach((_, i) => onProgress(i + 1, batch.length));
                return { saved: batch.length, updated: 0, failed: [] };
            },
            ensureEntries: async () => { order.push('ensure'); return 2; },
        };
        const progress = [];
        const { report, items } = await uploadDivelog(store, [fileOf('00000100'), fileOf('00000101'), { name: 'notes.txt', arrayBuffer: async () => new ArrayBuffer(0) }], (d, t) => progress.push([d, t]));
        assert.deepEqual(order, ['list', 'save:2', 'ensure']);
        assert.equal(items.length, 2);
        assert.deepEqual(report, { saved: 2, updated: 0, unchanged: 0, failed: [] });
        assert.deepEqual(progress, [[0, 2], [1, 2], [2, 2]]);
    });

    test('uploadDivelog with nothing readable has no report but still ensures entries', async () => {
        let ensured = 0;
        const store = {
            listDives: async () => [], saveDives: async () => ({ saved: 0, updated: 0, failed: [] }),
            ensureEntries: async () => { ensured++; },
        };
        const { report } = await uploadDivelog(store, [{ name: 'a.txt', arrayBuffer: async () => new ArrayBuffer(0) }]);
        assert.equal(report, null);
        assert.equal(ensured, 1);
    });

    test('uploadDivelog does not create entries when saving fails', async () => {
        let ensured = false;
        const store = {
            listDives: async () => [],
            saveDives: async () => { throw new Error('boom'); },
            ensureEntries: async () => { ensured = true; },
        };
        await assert.rejects(() => uploadDivelog(store, [fileOf('00000100')]), /boom/);
        assert.equal(ensured, false);
    });

    test('uploadDivelog keeps the save report when ensureEntries fails', async () => {
        const store = {
            listDives: async () => [],
            saveDives: async batch => ({ saved: batch.length, updated: 0, failed: [] }),
            ensureEntries: async () => { throw new Error('entries down'); },
        };
        const { report, ensureError } = await uploadDivelog(store, [fileOf('00000100')]);
        assert.equal(report.saved, 1);
        assert.match(ensureError.message, /entries down/);
    });

    test('exportZip adds DIVELOG files, dives.json and logbook.json', async () => {
        const added = new Map();
        class FakeZip {
            file(name, data) { added.set(name, data); }
            async generateAsync() { return 'BLOB'; }
        }
        const store = {
            exportAll: async () => ({ files: [{ name: 'A.DLF', bytes: new Uint8Array([1]) }], dives: [{ n: 1 }] }),
            listEntries: async () => [{ id: 'e1' }, { id: 'e2' }],
            listSites: async () => [{ id: 's1', name: 'Abyss' }],
            listMedia: async id => (id === 'e1' ? [{ id: 'm1', entry_id: 'e1' }] : []),
        };
        let download;
        await exportZip(store, { loadZip: async () => FakeZip, download: (blob, name) => { download = [blob, name]; }, now: new Date('2026-10-07T10:00:00Z') });
        assert.deepEqual([...added.keys()], ['DIVELOG/A.DLF', 'dives.json', 'logbook.json']);
        assert.deepEqual(JSON.parse(added.get('logbook.json')), {
            entries: [{ id: 'e1' }, { id: 'e2' }], sites: [{ id: 's1', name: 'Abyss' }], media: [{ id: 'm1', entry_id: 'e1' }],
        });
        assert.deepEqual(download, ['BLOB', 'dive-log-2026-10-07.zip']);
    });
});

const { RecordedDiveAnalysis } = await import('../js/components/RecordedDiveAnalysis.js');

describe('RecordedDiveAnalysis lifecycle (jsdom)', () => {
    async function withDom(fn) {
        const { JSDOM } = await import('jsdom');
        const dom = new JSDOM('<!doctype html><body><div id="root"></div></body>', { url: 'http://localhost/lab/dive-log.html' });
        const saved = {};
        for (const k of ['window', 'document', 'location', 'history']) {
            saved[k] = Object.getOwnPropertyDescriptor(globalThis, k);
            Object.defineProperty(globalThis, k, { value: dom.window[k], configurable: true, writable: true });
        }
        try {
            return await fn(dom.window.document.getElementById('root'));
        } finally {
            for (const [k, d] of Object.entries(saved)) {
                if (d) Object.defineProperty(globalThis, k, d); else delete globalThis[k];
            }
        }
    }
    const tick = () => new Promise(r => setTimeout(r, 20));

    test('auth events and demo loading after destroy() do not throw', async () => {
        await withDom(async root => {
            let listener;
            const store = {
                onAuthChange: l => { listener = l; return () => {}; },
                currentUser: async () => null,
                listDives: async () => [],
            };
            const rda = new RecordedDiveAnalysis(root, { store, demoFiles: [] });
            rda.destroy();
            const errors = [];
            const onRejection = e => errors.push(e);
            process.on('unhandledRejection', onRejection);
            try {
                listener({ id: 'u1', email: 'a@b.c' });
                listener(null);
                rda._setDives({ dives: [], errors: [] });
                rda._renderList();
                await tick();
            } finally {
                process.off('unhandledRejection', onRejection);
            }
            assert.deepEqual(errors, []);
        });
    });

    test('embedded with a focus id that is not stored shows "not found", not another dive', async () => {
        await withDom(async root => {
            const dive = diveOf('00000100');
            const store = {
                listDives: async () => [{ id: 'r1', deviceSerial: 'x', diveNumber: 100, startLocal: dive.start.local, parserVersion: 99, summary: { maxDepth: 1, duration: 60, mode: 'oc' } }],
                loadDive: async () => { throw new Error('must not load'); },
                reparseOutdated: async () => 0,
            };
            const rda = new RecordedDiveAnalysis(root, { store, embedded: true, focusRecordingId: 'stale' });
            await tick();
            assert.equal(rda.current, null);
            assert.equal(root.querySelector('#rda-analysis').hidden, true);
            assert.match(root.querySelector('#rda-status').textContent, /Dive not found/);
            rda.destroy();
        });
    });

    test('the chart view switch keeps its view across GF changes and shows the gas note only in Gas', async () => {
        await withDom(async root => {
            const dive = diveOf('00000100');
            const store = {
                listDives: async () => [{ id: 'r1', deviceSerial: 'x', diveNumber: 100, startLocal: dive.start.local, parserVersion: 99, summary: { maxDepth: dive.maxDepth, duration: dive.duration, mode: 'oc' } }],
                loadDive: async () => dive,
                reparseOutdated: async () => 0,
            };
            const rda = new RecordedDiveAnalysis(root, { store, embedded: true, focusRecordingId: 'r1', entryGases: [] });
            const calls = [];
            const fake = { update: (setup, options) => calls.push({ setup, options }), setTimeIndex() {}, currentTimeIndex: 0, destroy() {} };
            rda.charts = { profile: fake, mvalue: { ...fake, update() {} }, gf: { ...fake, update() {} } };
            await tick();
            const buttons = [...root.querySelectorAll('#rda-views button')];
            assert.deepEqual(buttons.map(b => b.dataset.view), ['profile', 'pressure', 'pp', 'tissue', 'gas']);
            assert.equal(root.querySelector('#rda-views').getAttribute('aria-label'), 'Chart view');
            assert.equal(calls.at(-1).options.showCeiling, true);
            assert.equal(root.querySelector('#rda-gas-note').hidden, true);

            buttons[4].focus();
            buttons[4].click();
            assert.equal(root.querySelector('[data-view="gas"]'), buttons[4], 'the clicked button is not rebuilt');
            assert.equal(root.ownerDocument.activeElement, buttons[4], 'focus stays on the clicked button');
            assert.equal(buttons[4].getAttribute('aria-pressed'), 'true');
            assert.equal(buttons[0].getAttribute('aria-pressed'), 'false');
            assert.equal(root.querySelector('[data-view="gas"]').getAttribute('aria-pressed'), 'true');
            assert.equal(root.querySelector('[data-view="profile"]').getAttribute('aria-pressed'), 'false');
            let last = calls.at(-1);
            assert.equal(last.options.showGasConsumption, true);
            assert.equal(last.options.referenceCeiling, null);
            assert.ok(last.setup.gases.every(g => g.sacRate === 20 && g.cylinderVolume === 12 && g.startPressure === 200));
            const note = root.querySelector('#rda-gas-note');
            assert.equal(note.hidden, false);
            assert.match(note.textContent, /assumed SAC 20\u00a0l\/min, 12\u00a0l cylinder filled to 200\u00a0bar/);

            rda._setGf({ gfLow: 30, gfHigh: 70 });
            last = calls.at(-1);
            assert.equal(rda.view, 'gas');
            assert.equal(last.options.showGasConsumption, true);

            root.querySelector('[data-view="tissue"]').click();
            assert.equal(calls.at(-1).options.showTissueLoading, true);
            assert.equal(note.hidden, true);
            rda.destroy();
        });
    });
});

describe('entry form helpers', () => {
    test('formatDuration gives m:ss that round-trips to the stored seconds', () => {
        assert.equal(formatDuration(null), '');
        assert.equal(formatDuration(2700), '45:00');
        assert.equal(formatDuration(3109), '51:49');
        assert.equal(formatDuration(7), '0:07');
        for (const s of [59, 3109, 2701, 7, 0, 7261]) {
            assert.equal(normalizeEntry({ duration_min: formatDuration(s) }).duration_s, s);
        }
    });

    test('parseDuration accepts m:ss, whole and decimal minutes', () => {
        assert.equal(parseDuration('51:49'), 3109);
        assert.equal(parseDuration(' 51 '), 3060);
        assert.equal(parseDuration('51,8'), 3108);
        assert.equal(parseDuration('51.82'), 3109);
        assert.equal(parseDuration('0:07'), 7);
        assert.equal(parseDuration(''), null);
        assert.equal(parseDuration('abc'), null);
        assert.equal(parseDuration('5:75'), null);
        assert.equal(parseDuration('5:'), null);
        assert.equal(parseDuration('-3'), null);
    });

    test('formValuesFromEntry gives gas cards, also for a legacy entry', () => {
        const v = formValuesFromEntry({ gas: { o2: 0.32, he: 0 }, details: { cylinderL: 12, pressureStartBar: 200 } });
        assert.deepEqual(v.gases.map(g => [g.role, g.mix, g.cylinder, g.volumeL, g.startBar]), [['bottom', 'ean32', 'custom', '12', '200']]);
        assert.deepEqual(formValuesFromEntry({ gas: null }).gases, []);
    });

    test('formValuesFromEntry round-trips through normalizeEntry', () => {
        const entry = {
            log_number: 12, dive_date: '2026-10-01', entry_time: '09:30:00', duration_s: 2700,
            max_depth_m: 18.4, site_id: 's1', buddies: ['Petr'], gas: { o2: 0.32, he: 0 },
            water_temp_c: 14.5, vis_shallow_m: 8, vis_deep_m: null, notes: 'ok',
            details: { weather: 'sun', tags: ['night'], rating: 4, futureKey: 'kept' },
        };
        const form = formValuesFromEntry(entry);
        assert.deepEqual(form.gases.map(g => g.mix), ['ean32']);
        assert.equal(form.entry_time, '09:30');
        assert.equal(form.vis_deep_m, '');
        const back = normalizeEntry({ ...form, gas: primaryGas(gasesFromFormRows(form.gases).gases) }, entry.details);
        assert.deepEqual({ ...back, entry_time: entry.entry_time }, { ...entry });
    });

    test('formValuesFromEntry detects air, trimix and unset gas, and uses a comma on request', () => {
        assert.equal(formValuesFromEntry({ gas: { o2: 0.21, he: 0 } }).gases[0].mix, 'air');
        const tx = formValuesFromEntry({ gas: { o2: 0.185, he: 0.45 } }, { comma: true }).gases[0];
        assert.deepEqual([tx.mix, tx.o2, tx.he], ['tx', '18,5', '45']);
        assert.equal(formValuesFromEntry({ max_depth_m: 18.4 }, { comma: true }).max_depth_m, '18,4');
    });

    test('recordingsOnDate lists unlinked recordings of that day, in time order', () => {
        const rows = [
            { id: 'b', startLocal: '2026-09-27T16:21:22' },
            { id: 'a', startLocal: '2026-09-27T12:01:01' },
            { id: 'c', startLocal: '2026-09-28T08:00:00' },
            { id: 'd', startLocal: '2026-09-27T10:00:00' },
        ];
        const entries = [{ recording_id: 'd' }, { recording_id: null }];
        assert.deepEqual(recordingsOnDate(rows, entries, '2026-09-27').map(r => r.id), ['a', 'b']);
        assert.deepEqual(recordingsOnDate(rows, entries, '2026-01-01'), []);
    });
});

describe('form strings', () => {
    const keysOf = (o, prefix = '') => Object.entries(o).flatMap(([k, v]) =>
        (v && typeof v === 'object' ? keysOf(v, `${prefix}${k}.`) : [`${prefix}${k}`])).sort();
    const load = lang => JSON.parse(readFileSync(new URL(`../locales/${lang}.json`, import.meta.url), 'utf8')).diveLog.logbook;

    test('the dive list view is called feed, not list, in every language', () => {
        for (const lang of ['en', 'cs', 'es']) {
            const { views } = load(lang);
            assert.ok(views.feed, lang);
            assert.equal('list' in views, false, lang);
        }
    });

    test('en, cs and es have the same logbook keys, none empty', () => {
        const en = keysOf(load('en'));
        assert.ok(en.includes('form.choices.weather.sun') && en.includes('duplicateNumber'));
        for (const lang of ['cs', 'es']) assert.deepEqual(keysOf(load(lang)), en, lang);
    });

    test('every EntryForm label key exists', () => {
        const form = load('en').form;
        const src = readFileSync(new URL('../js/logbook/EntryForm.js', import.meta.url), 'utf8');
        for (const [, key] of src.matchAll(/(?:tf|_input\([^,]+,)\s*\(?'([A-Za-z]+)'/g)) {
            assert.ok(key in form, key);
        }
    });
});

describe('entry form validation and races (jsdom)', () => {
    async function withDom(fn) {
        const { JSDOM } = await import('jsdom');
        const dom = new JSDOM('<!doctype html><body><div id="root"></div></body>', { url: 'http://localhost/lab/dive-log.html' });
        const saved = {};
        for (const k of ['window', 'document', 'location', 'history']) {
            saved[k] = Object.getOwnPropertyDescriptor(globalThis, k);
            Object.defineProperty(globalThis, k, { value: dom.window[k], configurable: true, writable: true });
        }
        try {
            return await fn(dom.window.document.getElementById('root'));
        } finally {
            for (const [k, d] of Object.entries(saved)) {
                if (d) Object.defineProperty(globalThis, k, d); else delete globalThis[k];
            }
        }
    }
    const tick = () => new Promise(r => setTimeout(r, 20));
    const entry = { id: 'e1', log_number: 5, dive_date: '2026-10-01', site_id: 's1', buddies: [], details: {} };

    test('invalidNumberFields flags non-blank text that is not a number', () => {
        const base = formValuesFromEntry({});
        assert.deepEqual(invalidNumberFields(base), []);
        assert.deepEqual(invalidNumberFields({ ...base, max_depth_m: '18,4', duration_min: ' ' }), []);
        assert.deepEqual(invalidNumberFields({ ...base, max_depth_m: '18 m', log_number: 'abc' }), ['number', 'depth']);
        assert.deepEqual(invalidNumberFields({ ...base, details: { weightsKg: '1 234', rating: 'x' } }), ['weightsKg', 'rating']);
    });

    test('gas cards: add, remove, save migrates legacy cylinder keys', async () => {
        await withDom(async root => {
            const saves = [];
            const store = { listSites: async () => [], listBuddies: async () => [], listEntries: async () => [],
                saveEntry: async (row, id) => { saves.push(row); return { id, ...row }; } };
            const legacy = { ...entry, site_id: null, gas: { o2: 0.21, he: 0 }, duration_s: 3000,
                details: { cylinderL: 12, cylinderMaterial: 'steel', pressureStartBar: 200, pressureEndBar: 80, avgDepthM: 20, weather: 'sun' } };
            new EntryForm(root, { store, entry: legacy, onSaved() {}, onCancel() {} });
            await tick();
            assert.equal(root.querySelectorAll('.lb-gas-card').length, 1);
            assert.match(root.querySelector('.lb-gas-summary').textContent, /1\s?440/);
            root.querySelector('#lb-add-gas').click();
            assert.equal(root.querySelectorAll('.lb-gas-card').length, 2);
            assert.equal(root.querySelectorAll('[name="gas.role"]')[1].value, 'deco');
            root.querySelectorAll('[name="gas.startBar"]')[1].value = '200';
            root.querySelectorAll('[name="gas.endBar"]')[1].value = '150';
            root.querySelector('form').dispatchEvent(new window.Event('submit', { cancelable: true }));
            await tick();
            const row = saves[0];
            assert.deepEqual(row.gas, { o2: 0.21, he: 0 });
            assert.deepEqual(row.details.gases.map(g => [g.role, g.cylinder, g.startBar, g.endBar]), [['bottom', 's12', 200, 80], ['deco', 'al40', 200, 150]]);
            for (const k of ['cylinderL', 'cylinderMaterial', 'pressureStartBar', 'pressureEndBar']) assert.equal(k in row.details, false, k);
            assert.equal(row.details.weather, 'sun');
        });
    });

    test('removing every gas saves no gas; a bad mix blocks the save', async () => {
        await withDom(async root => {
            const saves = [];
            const store = { listSites: async () => [], listBuddies: async () => [], listEntries: async () => [],
                saveEntry: async (row, id) => { saves.push(row); return { id, ...row }; } };
            new EntryForm(root, { store, entry: { ...entry, gas: { o2: 0.32, he: 0 } }, onSaved() {}, onCancel() {} });
            await tick();
            const mix = root.querySelector('[name="gas.mix"]');
            mix.value = 'tx';
            mix.dispatchEvent(new window.Event('change', { bubbles: true }));
            root.querySelector('[name="gas.o2"]').value = '60';
            root.querySelector('[name="gas.he"]').value = '50';
            root.querySelector('form').dispatchEvent(new window.Event('submit', { cancelable: true }));
            await tick();
            assert.equal(saves.length, 0);
            assert.ok(!root.querySelector('.lb-form-error').hidden);
            root.querySelector('.lb-gas-remove').click();
            assert.equal(root.querySelectorAll('.lb-gas-card').length, 0);
            root.querySelector('form').dispatchEvent(new window.Event('submit', { cancelable: true }));
            await tick();
            assert.equal(saves[0].gas, null);
            assert.deepEqual(saves[0].details.gases, []); // kept, so the next edit does not refill it from the recording
        });
    });

    test('editing a linked entry without gases prefills them from the recording, keeping the typed cylinder', async () => {
        await withDom(async root => {
            const record = { gases: [{ id: 'g0', o2: 0.21, he: 0, role: 'oc' }, { id: 'g1', o2: 0.5, he: 0, role: 'oc' }],
                events: [{ t: 0, type: 'gasSwitch', gasId: 'g0' }, { t: 1800, type: 'gasSwitch', gasId: 'g1' }] };
            const store = { listSites: async () => [], listBuddies: async () => [], listEntries: async () => [], loadDive: async () => record };
            new EntryForm(root, { store, entry: { ...entry, recording_id: 'r1', gas: { o2: 0.21, he: 0 }, details: { cylinderL: 15, cylinderMaterial: 'steel', pressureStartBar: 220 } }, onSaved() {}, onCancel() {} });
            await tick();
            const roles = [...root.querySelectorAll('[name="gas.role"]')].map(s => s.value);
            assert.deepEqual(roles, ['bottom', 'deco']);
            assert.equal(root.querySelector('[name="gas.cylinder"]').value, 's15');
            assert.equal(root.querySelector('[name="gas.startBar"]').value, '220');
        });
    });

    test('the recording prefill keeps a corrected mix and a buddy name being typed; a cleared block stays cleared', async () => {
        await withDom(async root => {
            const record = { gases: [{ id: 'g0', o2: 0.21, he: 0, role: 'oc' }], events: [] };
            let release;
            const loaded = new Promise(r => { release = r; });
            const store = { listSites: async () => [], listBuddies: async () => [], listEntries: async () => [], loadDive: () => loaded };
            new EntryForm(root, { store, entry: { ...entry, recording_id: 'r1', gas: { o2: 0.32, he: 0 }, details: {} }, onSaved() {}, onCancel() {} });
            await tick();
            root.querySelector('[name="buddy"]').value = 'Pet';
            release(record);
            await tick();
            assert.equal(root.querySelector('[name="gas.mix"]').value, 'ean32');
            assert.equal(root.querySelector('[name="buddy"]').value, 'Pet');
            assert.equal(root.querySelectorAll('.lb-chip').length, 0);
            let calls = 0;
            const cleared = { ...store, loadDive: async () => { calls++; return record; } };
            new EntryForm(root, { store: cleared, entry: { ...entry, recording_id: 'r1', gas: null, details: { gases: [] } }, onSaved() {}, onCancel() {} });
            await tick();
            assert.equal(calls, 0);
            assert.equal(root.querySelectorAll('.lb-gas-card').length, 0);
        });
    });

    test('saving an edit before suggestions load keeps the stored site', async () => {
        await withDom(async root => {
            const saves = [];
            const store = {
                listSites: () => new Promise(() => {}), // never resolves
                listBuddies: async () => { throw new Error('down'); },
                listEntries: async () => [],
                saveSite: async () => assert.fail('must not create a site'),
                saveEntry: async (row, id) => { saves.push([row, id]); return { id, ...row }; },
            };
            let saved = null;
            const origError = console.error;
            console.error = () => {};
            try {
                new EntryForm(root, { store, entry, onSaved: e => { saved = e; }, onCancel() {} });
                root.querySelector('form').dispatchEvent(new window.Event('submit', { cancelable: true }));
                await tick();
            } finally { console.error = origError; }
            assert.ok(saved);
            assert.equal(saves[0][0].site_id, 's1');
        });
    });

    test('clearing the site field on purpose removes the site; an invalid number blocks the save', async () => {
        await withDom(async root => {
            const saves = [];
            const store = {
                listSites: async () => [{ id: 's1', name: 'Hamr' }], listBuddies: async () => [], listEntries: async () => [],
                saveEntry: async (row, id) => { saves.push(row); return { id, ...row }; },
            };
            new EntryForm(root, { store, entry, onSaved() {}, onCancel() {} });
            await tick();
            const site = root.querySelector('[name="site"]');
            assert.equal(site.value, 'Hamr');
            root.querySelector('[name="max_depth_m"]').value = '18 m';
            root.querySelector('form').dispatchEvent(new window.Event('submit', { cancelable: true }));
            await tick();
            assert.equal(saves.length, 0);
            assert.equal(root.querySelector('[name="max_depth_m"]').value, '18 m');
            assert.ok(!root.querySelector('.lb-form-error').hidden);
            root.querySelector('[name="max_depth_m"]').value = '18,4';
            root.querySelector('[name="log_number"]').value = '';
            root.querySelector('form').dispatchEvent(new window.Event('submit', { cancelable: true }));
            await tick();
            assert.equal(saves.length, 0); // edit needs a number
            root.querySelector('[name="log_number"]').value = '5';
            site.value = '';
            site.dispatchEvent(new window.Event('input'));
            root.querySelector('form').dispatchEvent(new window.Event('submit', { cancelable: true }));
            await tick();
            assert.equal(saves[0].site_id, null);
            assert.equal(saves[0].max_depth_m, 18.4);
        });
    });

    test('NewDive waits for the entry creation before listing recordings', async () => {
        await withDom(async root => {
            const { NewDive } = await import('../js/logbook/NewDive.js');
            const order = [];
            let release;
            const ready = new Promise(r => { release = r; });
            const store = { listDives: async () => { order.push('dives'); return []; }, listEntries: async () => [] };
            new NewDive(root, { store, onChoose() {}, ready });
            await tick();
            assert.deepEqual(order, []);
            release();
            await tick();
            assert.deepEqual(order, ['dives']);
            const failing = new Promise((_, rej) => rej(new Error('ensure failed')));
            order.length = 0;
            new NewDive(root, { store, onChoose() {}, ready: failing });
            await tick();
            assert.deepEqual(order, ['dives']); // a failed ensure does not block the page
        });
    });
});

describe('detail helpers', () => {
    const t = key => `<${key}>`;
    const entry = {
        max_depth_m: 38.56, duration_s: 3109, gas: { o2: 0.32, he: 0 }, water_temp_c: 4.8,
        vis_shallow_m: null, vis_deep_m: undefined, buddies: ['Ann', 'Bob'], notes: '  ',
        details: { surfaceTempC: 12, weather: 'sun', cylinderL: 12, stops: 'deco', tags: ['wreck', 'custom'], rating: 4, guide: '', unknownKey: 'x' },
    };

    test('core rows carry units, empty values are hidden', () => {
        const { core } = detailRows(entry, t);
        assert.deepEqual(core.map(r => r.key), ['duration', 'depth', 'gas', 'waterTemp', 'surfaceTempC', 'buddies']);
        assert.equal(core.find(r => r.key === 'depth').value, '38.6\u00a0m');
        assert.equal(core.find(r => r.key === 'duration').value, '51:49\u00a0min');
        assert.equal(core.find(r => r.key === 'gas').value, 'EAN32');
        assert.equal(core.find(r => r.key === 'waterTemp').value, '4.8\u00a0\u00b0C');
        assert.equal(core.find(r => r.key === 'surfaceTempC').value, '12\u00a0\u00b0C');
        assert.equal(core.find(r => r.key === 'buddies').value, 'Ann, Bob');
    });

    test('details are grouped, choices translated, unknown keys ignored', () => {
        const { groups } = detailRows(entry, t);
        // The legacy cylinder volume is shown by the gas cards, not under Equipment.
        assert.deepEqual(groups.map(g => g.group), ['conditions', 'dive']);
        const dive = groups.find(g => g.group === 'dive').rows;
        assert.deepEqual(dive.map(r => r.key), ['stops', 'tags', 'rating']);
        assert.equal(dive.find(r => r.key === 'stops').value, '<form.choices.stops.deco>');
        assert.equal(dive.find(r => r.key === 'tags').value, '<form.choices.tags.wreck>, custom');
        assert.equal(dive.find(r => r.key === 'rating').value, '4\u00a0/\u00a05');
    });

    test('gasCards: legacy and multi-gas entries', () => {
        const t = key => ({ 'detail.roleBottom': 'Bottom', 'detail.roleDeco': 'Deco', 'detail.gasUsed': 'Gas used', 'detail.sac': 'SAC',
            'detail.mixUnknown': '?', 'form.choices.cylinderMaterial.steel': 'steel', 'form.choices.cylinderMaterial.aluminium': 'alu' })[key] ?? key;
        const fmt = (v, d) => (d === undefined ? String(v) : v.toFixed(d));
        const legacy = gasCards({ gas: { o2: 0.32, he: 0 }, duration_s: 3000, details: { cylinderL: 12, cylinderMaterial: 'steel', pressureStartBar: 200, pressureEndBar: 80, avgDepthM: 20 } }, t, fmt);
        assert.deepEqual(legacy.cards.map(c => [c.roleLabel, c.mix, c.cylinder, c.pressures, c.used]),
            [['Bottom', 'EAN32', '12 l, steel', '200 → 80 bar', '−120 bar · 1440 l']]);
        assert.equal(legacy.summary, 'Gas used 1440 l · SAC 9.6 l/min');
        assert.deepEqual(gasCards({ gas: null, details: {} }, t, fmt), { cards: [], summary: null });
        const multi = gasCards({ gas: { o2: 0.21, he: 0 }, details: { gases: [{ role: 'bottom', o2: 0.21, he: 0 }, { role: 'deco', o2: null, he: null, cylinder: 'al40', volumeL: 5.7, material: 'aluminium' }] } }, t, fmt);
        assert.deepEqual(multi.cards.map(c => [c.role, c.mix, c.cylinder]), [['bottom', 'Air', ''], ['deco', '?', 'AL40 (5.7 l)']]);
        assert.equal(multi.summary, null);
    });

    test('an empty entry has no rows and no groups', () => {
        const r = detailRows({ buddies: [], details: {} }, t);
        assert.deepEqual(r.core, []);
        assert.deepEqual(r.groups, []);
        assert.equal(r.notes, null);
    });

    test('notes are trimmed and returned separately', () => {
        assert.equal(detailRows({ notes: ' nice \n dive ', details: {} }, t).notes, 'nice \n dive');
    });

    test('isHttpsUrl accepts only https links', () => {
        assert.equal(isHttpsUrl('https://youtu.be/x'), true);
        assert.equal(isHttpsUrl(' https://example.com/a b '), false);
        assert.equal(isHttpsUrl('http://example.com'), false);
        assert.equal(isHttpsUrl('javascript:alert(1)'), false);
        assert.equal(isHttpsUrl('https://'), false);
        assert.equal(isHttpsUrl(''), false);
    });

    test('parseCoordinates accepts common forms', () => {
        const want = { lat: 49.7856, lon: 13.4012 };
        for (const text of ['49.7856, 13.4012', '49.7856 13.4012', '49,7856 13,4012', '  49.7856,13.4012 ', '49.7856N 13.4012E', 'N 49.7856 E 13.4012', '49.7856° N, 13.4012° E']) {
            assert.deepEqual(parseCoordinates(text), want, text);
        }
    });
    test('parseCoordinates uses hemisphere letters for sign', () => {
        assert.deepEqual(parseCoordinates('33.5S 70.6W'), { lat: -33.5, lon: -70.6 });
        assert.deepEqual(parseCoordinates('S33,5 W70,6'), { lat: -33.5, lon: -70.6 });
        assert.deepEqual(parseCoordinates('-33.5, -70.6'), { lat: -33.5, lon: -70.6 });
    });
    test('parseCoordinates rejects out of range, garbage and place names', () => {
        for (const text of ['91, 10', '10, 181', '-90.5 10', '', 'Lake Como', 'abc def', '49.7856', '1 2 3', '49N 13N', '12.5E 13.4E', null, undefined]) {
            assert.equal(parseCoordinates(text), null, String(text));
        }
    });

    test('siteFromForm builds a site row', () => {
        assert.deepEqual(siteFromForm({ name: ' Blue Hole ', water: 'salt', altitude: '1,5' }, { lat: 1.23456789, lon: 2 }),
            { name: 'Blue Hole', lat: 1.23456789, lon: 2, water: 'salt', altitude_m: 2 });
        assert.deepEqual(siteFromForm({ name: 'X', water: '', altitude: '' }, null), { name: 'X', lat: null, lon: null, water: null, altitude_m: null });
        assert.equal(siteFromForm({ name: '  ' }, null), null);
    });
});

describe('exifTimestamp', () => {
    const wall = new Date(2026, 8, 27, 12, 1, 1); // 12:01:01 in whatever zone the runner uses
    test('the camera offset decides the instant, not the uploader zone', () => {
        assert.equal(exifTimestamp(wall, '+02:00'), '2026-09-27T10:01:01.000Z');
        assert.equal(exifTimestamp(wall, '-05:30'), '2026-09-27T17:31:01.000Z');
    });
    test('without a valid offset the local interpretation is kept', () => {
        assert.equal(exifTimestamp(wall), wall.toISOString());
        assert.equal(exifTimestamp(wall, 'junk'), wall.toISOString());
    });
    test('invalid dates give null', () => {
        assert.equal(exifTimestamp(null, '+02:00'), null);
        assert.equal(exifTimestamp(new Date(NaN)), null);
    });
});

describe('LogbookApp background errors (jsdom)', () => {
    async function withDom(fn) {
        const { JSDOM } = await import('jsdom');
        const dom = new JSDOM('<!doctype html><body><div id="root"></div></body>', { url: 'http://localhost/lab/dive-log.html#/new' });
        const saved = {};
        for (const k of ['window', 'document', 'location', 'history']) {
            saved[k] = Object.getOwnPropertyDescriptor(globalThis, k);
            Object.defineProperty(globalThis, k, { value: dom.window[k], configurable: true, writable: true });
        }
        try {
            return await fn(dom.window.document.getElementById('root'));
        } finally {
            for (const [k, d] of Object.entries(saved)) {
                if (d) Object.defineProperty(globalThis, k, d); else delete globalThis[k];
            }
        }
    }
    const tick = (ms = 30) => new Promise(r => setTimeout(r, ms));
    const baseStore = extra => ({
        onAuthChange: () => () => {},
        currentUser: async () => ({ id: 'u1', email: 'me@example.com' }),
        listDives: async () => [], listEntries: async () => [], listSites: async () => [],
        listPhotoMedia: async () => [], photoUrls: async () => new Map(),
        ...extra,
    });

    test('a failing login-time ensureEntries keeps the open form and shows a banner', async () => {
        await withDom(async root => {
            const origError = console.error;
            console.error = () => {};
            try {
                const app = new LogbookApp(root, { store: baseStore({
                    ensureEntries: async () => { await tick(10); throw new Error('down'); },
                }) });
                await tick(80);
                assert.ok(root.querySelector('.lb-newdive'), 'the form stays');
                assert.ok(root.querySelector('.lb-banner'), 'a banner explains');
                assert.equal(root.querySelector('.lb-message'), null);
                app.destroy();
            } finally { console.error = origError; }
        });
    });

    test('a failing load of the current view replaces it with a message', async () => {
        await withDom(async root => {
            window.location.hash = '#/dive/abc';
            const origError = console.error;
            console.error = () => {};
            try {
                const app = new LogbookApp(root, { store: baseStore({
                    ensureEntries: async () => 0,
                    getEntry: async () => { throw new Error('down'); },
                }) });
                await tick(80);
                assert.ok(root.querySelector('.lb-message'));
                app.destroy();
            } finally { console.error = origError; }
        });
    });

    test('New dive lists entries already in the logbook for the chosen date; the list shows localized dates', async () => {
        await withDom(async root => {
            const entries = [{ id: 'e31', log_number: 31, dive_date: '2026-09-27', entry_time: '12:01:01', max_depth_m: 38.6, buddies: [], details: {} }];
            const store = baseStore({ listEntries: async () => entries });
            const nd = new NewDive(root, { store, onChoose() {} });
            await tick();
            nd.date = '2026-09-27';
            nd.render();
            const links = [...root.querySelectorAll('.lb-logged a')].map(a => a.getAttribute('href'));
            assert.deepEqual(links, ['#/dive/e31', '#/dive/e31/edit']);
            assert.match(root.querySelector('.lb-logged').textContent, /#31 · 12:01 · 38.6/);
            nd.date = '2026-01-02';
            nd.render();
            assert.equal(root.querySelector('.lb-logged'), null);
            nd.destroy();

            window.location.hash = '#/';
            document.documentElement.lang = 'cs';
            const app = new LogbookApp(root, { store: baseStore({ ensureEntries: async () => 0, listEntries: async () => entries }) });
            await tick(80);
            assert.match(root.querySelector('.lb-date').textContent, /27\. 9\. 2026, 12:01$/);
            app.destroy();
        });
    });

    test('select mode: toggling, selection kept across views and sorting, confirmation, progress and summary', async () => {
        await withDom(async root => {
            globalThis.localStorage = window.localStorage;
            window.localStorage.setItem('decojs.logbook.view', 'tiles');
            window.location.hash = '#/';
            const entries = [1, 2, 3].map(n => ({ id: `e${n}`, log_number: n, dive_date: `2026-09-0${n}`, max_depth_m: 10 + n, buddies: [], details: {} }));
            const calls = [];
            let release;
            const gate = new Promise(r => { release = r; });
            const store = baseStore({
                ensureEntries: async () => 0, listEntries: async () => entries.filter(e => !calls.flatMap(c => c.ids).includes(e.id)),
                deleteEntries: async (ids, opts) => {
                    calls.push({ ids, ...opts });
                    opts.onProgress(0, ids.length);
                    await gate;
                    opts.onProgress(2, ids.length);
                    return { deleted: 1, failed: [{ id: 'e2', message: 'boom' }] };
                },
            });
            try {
                const app = new LogbookApp(root, { store });
                await tick(80);
                assert.equal(root.querySelector('.lb-select-box'), null);
                root.querySelector('#lb-select').click();
                assert.equal(root.querySelectorAll('.lb-select-box').length, 3);
                assert.equal(root.querySelector('.lb-tiles a'), null, 'tiles stop being links');
                assert.equal(root.querySelector('#lb-bulk-delete').disabled, true);
                assert.match(root.querySelector('.lb-count').textContent, /^0 selected$/);
                // clicking a card toggles instead of navigating
                root.querySelector('[data-pick="e1"]').click();
                assert.equal(window.location.hash, '#/');
                assert.match(root.querySelector('.lb-count').textContent, /^1 selected$/);
                assert.equal(root.querySelector('#lb-bulk-delete').disabled, false);
                root.querySelector('[data-pick-box="e2"]').click(); // the checkbox itself
                assert.match(root.querySelector('.lb-count').textContent, /^2 selected$/);
                root.querySelector('#lb-select-all').click();
                assert.match(root.querySelector('.lb-count').textContent, /^3 selected$/);
                root.querySelector('#lb-select-none').click();
                assert.match(root.querySelector('.lb-count').textContent, /^0 selected$/);
                root.querySelector('[data-pick="e1"]').click();
                root.querySelector('[data-pick="e2"]').click();
                // selection survives the other views and sorting
                root.querySelector('.lb-seg[data-view="table"]').click();
                assert.equal(root.querySelectorAll('.lb-table tbody tr.lb-selected').length, 2);
                root.querySelector('.lb-sort[data-sort="maxDepth"]').click();
                assert.equal(root.querySelectorAll('.lb-table tbody tr.lb-selected').length, 2);
                root.querySelector('.lb-table tbody tr[data-pick="e3"]').click();
                assert.equal(window.location.hash, '#/', 'a table row toggles instead of navigating');
                root.querySelector('[data-pick="e3"]').click();
                root.querySelector('.lb-seg[data-view="feed"]').click();
                assert.equal(root.querySelectorAll('.lb-feed-card.lb-selected').length, 2);
                assert.ok(root.querySelector('.lb-selectdock .lb-bulk'), 'the confirmation opens in the select dock');
                assert.match(root.querySelector('.lb-count').textContent, /^2 selected$/);
                // confirmation
                root.querySelector('#lb-bulk-delete').click();
                const text = root.querySelector('.lb-bulk').textContent;
                assert.match(text, /Delete 2 dives \(#2, #1\)\?/);
                assert.match(text, /Uploading the DIVELOG again brings them back as new dives/);
                assert.equal(root.querySelector('#lb-bulk-rec').checked, false);
                root.querySelector('#lb-bulk-no').click();
                assert.equal(root.querySelector('.lb-bulk').textContent.trim(), '');
                assert.equal(calls.length, 0);
                assert.match(root.querySelector('.lb-count').textContent, /^2 selected$/, 'cancel keeps the selection');
                root.querySelector('#lb-bulk-delete').click();
                root.querySelector('#lb-bulk-rec').click();
                root.querySelector('#lb-bulk-yes').click();
                await tick(10);
                assert.match(root.querySelector('.lb-bulk').textContent, /Deleting 1 \/ 2…/);
                assert.deepEqual(calls[0].ids, ['e2', 'e1']);
                assert.equal(calls[0].withRecordings, true);
                release();
                await tick(80);
                const summary = root.querySelector('.lb-bulk').textContent;
                assert.match(summary, /Deleted 1 dive\./);
                assert.match(summary, /#2 \(boom\)/);
                assert.equal(root.querySelector('.lb-select-box'), null, 'select mode is left after deleting');
                assert.equal(root.querySelectorAll('.lb-feed-card').length, 1, 'the list reloaded');
                root.querySelector('#lb-bulk-close').click();
                assert.equal(root.querySelector('.lb-bulk').textContent.trim(), '');
                // cancel leaves select mode and clears
                root.querySelector('#lb-select').click();
                root.querySelector('[data-pick="e3"]').click();
                root.querySelector('#lb-select-cancel').click();
                assert.equal(root.querySelector('.lb-select-box'), null);
                root.querySelector('#lb-select').click();
                assert.match(root.querySelector('.lb-count').textContent, /^0 selected$/);
                app.destroy();
            } finally { delete globalThis.localStorage; }
        });
    });

    test('feed, table and tiles render, an old list choice opens the feed, profiles load lazily, table sorts', async () => {
        await withDom(async root => {
            globalThis.localStorage = window.localStorage;
            window.localStorage.setItem('decojs.logbook.view', 'list');
            window.location.hash = '#/';
            document.documentElement.lang = 'cs';
            const loads = [];
            const entries = [
                { id: 'e1', log_number: 1, dive_date: '2026-09-02', entry_time: '09:00:00', duration_s: 2535, max_depth_m: 18.5, recording_id: 'r1', buddies: ['Eva'], details: { avgDepthM: 9, tags: ['night'] }, notes: 'First line\nsecond', site_id: 's1', gas: { o2: 0.32, he: 0 }, water_temp_c: 4.8 },
                { id: 'e2', log_number: 2, dive_date: '2026-09-05', max_depth_m: 30, buddies: [], details: {} },
            ];
            const store = baseStore({
                ensureEntries: async () => 0, listEntries: async () => entries,
                listSites: async () => [{ id: 's1', name: 'Hemmoor' }],
                loadDive: async id => { loads.push(id); return { samples: [{ t: 0, depth: 0 }, { t: 60, depth: 10 }, { t: 120, depth: 0 }] }; },
            });
            try {
                const app = new LogbookApp(root, { store });
                await tick(120);
                assert.equal(root.querySelector('.lb-seg[aria-pressed="true"]').dataset.view, 'feed', 'the old list view became the feed');
                assert.match(root.querySelector('.lb-month-head').textContent, /Září 2026 · 2 /);
                const card = root.querySelector('.lb-feed-card[href="#/dive/e1"]');
                assert.ok(card.getAttribute('href').startsWith('#/dive/'));
                assert.equal(card.querySelector('.lb-feed-title').textContent, 'Hemmoor');
                assert.deepEqual([...card.querySelectorAll('.lb-stat dd')].map(d => d.textContent),
                    ['18,5\u00A0m', '42:15\u00A0min', '9,0\u00A0m', '4,8\u00A0°C', 'EAN32']);
                assert.match(card.querySelector('.lb-feed-people').textContent, /with Eva · night/);
                assert.match(card.querySelector('.lb-feed-notes').textContent, /^First line/);
                assert.ok(card.querySelector('.lb-spark[data-rec="r1"]'), 'a dive without photo or map position shows its profile');
                assert.equal(root.querySelector('.lb-feed-card[href="#/dive/e2"] .lb-visual'), null, 'no recording, no picture');
                assert.match(root.querySelector('.lb-totals').textContent, /^2 dives0,7\u00A0h underwaterdeepest 30,0\u00A0m$/, 'totals use the decimal comma and NBSP');
                assert.ok(root.querySelector('.lb-badge'), 'add details marker');
                if (typeof IntersectionObserver === 'undefined') assert.equal(loads.length, 0, 'no observer: no profile downloads');
                // table
                root.querySelector('.lb-seg[data-view="table"]').click();
                assert.equal(window.localStorage.getItem('decojs.logbook.view'), 'table');
                assert.equal(root.querySelectorAll('.lb-table tbody tr').length, 2);
                assert.equal(root.querySelector('th[aria-sort="descending"] .lb-sort').dataset.sort, 'number');
                root.querySelector('.lb-sort[data-sort="maxDepth"]').click();
                assert.equal(root.querySelector('th[aria-sort="descending"] .lb-sort').dataset.sort, 'maxDepth');
                assert.equal(root.querySelector('.lb-table tbody tr td').textContent.trim(), '2');
                root.querySelector('.lb-sort[data-sort="maxDepth"]').click();
                assert.equal(root.querySelector('th[aria-sort="ascending"] .lb-sort-mark').textContent, '▲');
                root.querySelector('.lb-seg[data-view="tiles"]').click();
                assert.equal(root.querySelectorAll('.lb-tiles .lb-tile').length, 2);
                assert.ok(root.querySelector('.lb-tile .lb-visual-none'), 'a tile without any picture shows its number');
                assert.ok(root.querySelector('#lb-sites'), 'the Sites link stays');
                app.destroy();
            } finally { delete globalThis.localStorage; document.documentElement.lang = 'en'; }
        });
    });

    test('feed pictures: first photo with a count, else a site map that falls back to the profile when it fails', async () => {
        await withDom(async root => {
            window.location.hash = '#/';
            const entries = [
                { id: 'e1', log_number: 1, dive_date: '2026-09-02', site_id: 's1', recording_id: 'r1', buddies: [], details: {} },
                { id: 'e2', log_number: 2, dive_date: '2026-09-03', site_id: 's1', recording_id: null, buddies: [], details: {} },
                { id: 'e3', log_number: 3, dive_date: '2026-09-04', site_id: 's1', buddies: [], details: {} },
            ];
            const store = baseStore({
                ensureEntries: async () => 0, listEntries: async () => entries,
                listSites: async () => [{ id: 's1', name: 'Lahošť', lat: 50.62, lon: 13.77 }],
                listPhotoMedia: async () => [{ entry_id: 'e3', path: 'a.jpg' }, { entry_id: 'e3', path: 'b.jpg' }],
                photoUrls: async paths => new Map(paths.map(p => [p, `https://example.com/${p}`])),
                loadDive: async () => ({ samples: [{ t: 0, depth: 0 }, { t: 60, depth: 10 }, { t: 120, depth: 0 }] }),
            });
            const app = new LogbookApp(root, { store });
            await tick(120);
            const card = id => root.querySelector(`.lb-feed-card[href="#/dive/${id}"]`);
            assert.equal(card('e3').querySelector('.lb-visual-img').getAttribute('src'), 'https://example.com/a.jpg');
            assert.equal(card('e3').querySelector('.lb-more-photos [aria-hidden="true"]').textContent, '+1');
            assert.equal(card('e3').querySelector('.lb-more-photos .rda-visually-hidden').textContent, '1 more photos');
            const map = card('e1').querySelector('img.lb-map-img');
            assert.ok(map.getAttribute('src').startsWith('https://api.mapy.com/v1/static/map?'));
            assert.equal(map.getAttribute('alt'), 'Map of Lahošť');
            map.dispatchEvent(new window.Event('error'));
            assert.equal(card('e1').querySelector('img.lb-map-img'), null, 'the failed map is gone');
            assert.ok(card('e1').querySelector('.lb-spark[data-rec="r1"]'), 'the profile takes its place');
            card('e2').querySelector('img.lb-map-img').dispatchEvent(new window.Event('error'));
            assert.equal(card('e2').querySelector('.lb-visual'), null, 'no recording: no picture at all');
            card('e3').querySelector('.lb-visual-photo img').dispatchEvent(new window.Event('error'));
            assert.equal(card('e3').querySelector('.lb-visual-photo'), null, 'an expired photo URL is dropped');
            assert.equal(card('e3').querySelector('img.lb-map-img'), null, 'maps are not asked for again after one failed');
            app.destroy();
            assert.equal(document.body.classList.contains('lb-in'), false);
        });
    });

    test('a recording-linked save error shows an inline message and keeps the values', async () => {
        await withDom(async root => {
            const store = baseStore({
                listBuddies: async () => [],
                saveEntry: async () => { throw new DiveStoreError('recording-linked', 'dup'); },
            });
            const origError = console.error;
            console.error = () => {};
            try {
                new EntryForm(root, { store, prefill: { dive_date: '2026-09-27' }, recordingId: 'r1', onSaved() {}, onCancel() {} });
                await tick();
                root.querySelector('input[name="notes"], textarea[name="notes"]')?.setAttribute('data-x', '1');
                root.querySelector('form').dispatchEvent(new window.Event('submit', { cancelable: true }));
                await tick();
            } finally { console.error = origError; }
            assert.match(root.querySelector('.lb-form-error').textContent, /recordingLinked/);
            assert.equal(root.querySelector('input[type="date"]').value, '2026-09-27');
        });
    });
});

describe('logbook geo helpers (Mapy.com, Nominatim)', () => {
    test('mapyTileUrl builds a Leaflet template and encodes the key', () => {
        assert.equal(mapyTileUrl('outdoor', 'K 1'), 'https://api.mapy.com/v1/maptiles/outdoor/256/{z}/{x}/{y}?apikey=K%201');
        assert.equal(mapyTileUrl('aerial', 'k'), 'https://api.mapy.com/v1/maptiles/aerial/256/{z}/{x}/{y}?apikey=k');
    });
    test('mapyLang maps UI language to cs/en/es, else en', () => {
        assert.equal(mapyLang('cs'), 'cs');
        assert.equal(mapyLang('es'), 'es');
        assert.equal(mapyLang('de'), 'en');
        assert.equal(mapyLang(undefined), 'en');
    });
    test('mapySuggestUrl sets query, lang, limit, key and lon,lat bias', () => {
        const url = new URL(mapySuggestUrl('Hodonín lom', { lang: 'cs', apiKey: 'KEY', center: { lat: 49.1, lon: 17.1 } }));
        assert.equal(url.origin + url.pathname, 'https://api.mapy.com/v1/suggest');
        assert.equal(url.searchParams.get('query'), 'Hodonín lom');
        assert.equal(url.searchParams.get('lang'), 'cs');
        assert.equal(url.searchParams.get('limit'), '6');
        assert.equal(url.searchParams.get('apikey'), 'KEY');
        assert.equal(url.searchParams.get('preferNear'), '17.1,49.1');
    });
    test('mapySuggestUrl omits bias without a valid centre and falls back to en', () => {
        const url = new URL(mapySuggestUrl('x', { lang: 'xx', apiKey: 'K', center: { lat: NaN, lon: 1 } }));
        assert.equal(url.searchParams.has('preferNear'), false);
        assert.equal(url.searchParams.get('lang'), 'en');
        assert.equal(new URL(mapySuggestUrl('x', { apiKey: 'K' })).searchParams.has('preferNear'), false);
    });
    test('placesFromMapy normalizes items; bbox is minLon,minLat,maxLon,maxLat -> [south,north,west,east]', () => {
        const json = { items: [
            { name: 'Praha', label: 'Hlavní město', location: 'Česko', position: { lon: 14.4, lat: 50.08 }, bbox: [14.22, 49.94, 14.70, 50.17] },
            { name: 'Lom', label: 'Lom', position: { lon: 17, lat: 48.9 } },
        ] };
        assert.deepEqual(placesFromMapy(json), [
            { name: 'Praha', detail: 'Hlavní město, Česko', lat: 50.08, lon: 14.4, bbox: [49.94, 50.17, 14.22, 14.70] },
            { name: 'Lom', detail: 'Lom', lat: 48.9, lon: 17, bbox: null },
        ]);
    });
    test('placesFromMapy drops garbage and bad bboxes', () => {
        for (const bad of [null, undefined, 'x', {}, { items: 'x' }, { items: [] }]) assert.deepEqual(placesFromMapy(bad), []);
        const out = placesFromMapy({ items: [null, 5, { name: 'a' }, { name: 'b', position: { lon: 'x', lat: 1 } },
            { name: 'ok', position: { lon: 1, lat: 2 }, bbox: [1, 2, 3] }, { position: { lon: 1, lat: 2 } }] });
        assert.deepEqual(out, [{ name: 'ok', detail: '', lat: 2, lon: 1, bbox: null }]);
    });
    test('placesFromNominatim uses the same shape; boundingbox is already south,north,west,east', () => {
        const json = [
            { display_name: 'Hodonín, Jihomoravský kraj, Česko', lat: '48.85', lon: '17.13', boundingbox: ['48.8', '48.9', '17.1', '17.2'] },
            { display_name: 'Nowhere', lat: '1', lon: '2' },
        ];
        assert.deepEqual(placesFromNominatim(json), [
            { name: 'Hodonín', detail: 'Hodonín, Jihomoravský kraj, Česko', lat: 48.85, lon: 17.13, bbox: [48.8, 48.9, 17.1, 17.2] },
            { name: 'Nowhere', detail: 'Nowhere', lat: 1, lon: 2, bbox: null },
        ]);
        for (const bad of [null, {}, 'x', [null, { lat: 'a', lon: 1, display_name: 'z' }]]) assert.deepEqual(placesFromNominatim(bad), []);
    });
});


describe('sites page helpers', () => {
    test('distanceMeters is a haversine distance', () => {
        const a = { lat: 49.8, lon: 15.5 };
        assert.equal(distanceMeters(a, a), 0);
        // one degree of latitude is about 111.2 km
        assert.ok(Math.abs(distanceMeters({ lat: 0, lon: 0 }, { lat: 1, lon: 0 }) - 111195) < 100);
        // Prague to Brno, about 185 km
        const d = distanceMeters({ lat: 50.0755, lon: 14.4378 }, { lat: 49.1951, lon: 16.6068 });
        assert.ok(d > 183000 && d < 187000, String(d));
        assert.ok(Math.abs(distanceMeters(a, { lat: 50, lon: 16 }) - distanceMeters({ lat: 50, lon: 16 }, a)) < 1e-6);
    });

    test('duplicateNameCounts groups names case-insensitively and trimmed, keeping only groups of two or more', () => {
        const counts = duplicateNameCounts([
            { id: 1, name: 'Barbora' }, { id: 2, name: ' barbora ' }, { id: 3, name: 'Hamr' },
            { id: 4, name: 'Orlík' }, { id: 5, name: 'ORLÍK' }, { id: 6, name: 'orlík' },
        ]);
        assert.equal(counts.get('barbora'), 2);
        assert.equal(counts.get('orlík'), 3);
        assert.ok(!counts.has('hamr'));
        assert.equal(duplicateNameCounts([]).size, 0);
    });

    test('nearbySameNameSite finds a same-named site with a position within the limit', () => {
        const sites = [
            { id: 'a', name: 'Barbora', lat: 50.0, lon: 13.0 },
            { id: 'b', name: 'barbora ', lat: 50.0, lon: 13.001 },      // about 71 m east
            { id: 'c', name: 'Barbora', lat: null, lon: null },
            { id: 'd', name: 'Hamr', lat: 50.0, lon: 13.0001 },
        ];
        const hit = nearbySameNameSite(sites, 'BARBORA', { lat: 50.0, lon: 13.0012 }, 300);
        assert.equal(hit.site.id, 'b');
        assert.ok(hit.distance > 10 && hit.distance < 100);
        assert.equal(nearbySameNameSite(sites, 'Barbora', { lat: 51, lon: 13 }, 300), null);
        assert.equal(nearbySameNameSite(sites, 'Nowhere', { lat: 50, lon: 13 }, 300), null);
    });
});

describe('site store methods', () => {
    const seed = () => fakeLogbookClient({ tables: {
        sites: [{ id: 's1', name: 'A' }, { id: 's2', name: 'B' }, { id: 's3', name: 'C' }],
        log_entries: [
            { id: 'e1', log_number: 1, site_id: 's1' }, { id: 'e2', log_number: 2, site_id: 's1' },
            { id: 'e3', log_number: 3, site_id: 's2' }, { id: 'e4', log_number: 4, site_id: null },
        ],
    } });

    test('siteUsage counts dives per site', async () => {
        const store = createSupabaseStore(seed());
        const usage = await store.siteUsage();
        assert.equal(usage.get('s1'), 2);
        assert.equal(usage.get('s2'), 1);
        assert.ok(!usage.has('s3'));
        assert.ok(!usage.has(null));
    });

    test('mergeSite moves the dives first, then deletes the source site', async () => {
        const client = seed();
        const store = createSupabaseStore(client);
        await store.mergeSite('s1', 's3');
        assert.deepEqual(client.db.log_entries.map(e => e.site_id), ['s3', 's3', 's2', null]);
        assert.deepEqual(client.db.sites.map(s => s.id), ['s2', 's3']);
        const ops = client.calls.filter(c => ['update', 'delete'].includes(c[0]) && (c[1] === 'log_entries' || c[1] === 'sites'));
        assert.deepEqual(ops.map(c => `${c[0]}:${c[1]}`), ['update:log_entries', 'delete:sites']);
    });

    test('mergeSite keeps the source site when moving the dives fails', async () => {
        const client = seed();
        const real = client.from;
        client.from = table => {
            const q = real(table);
            if (table === 'log_entries') q.update = () => ({ eq: async () => ({ error: { message: 'boom' } }) });
            return q;
        };
        const store = createSupabaseStore(client);
        await assert.rejects(() => store.mergeSite('s1', 's3'), e => e instanceof DiveStoreError);
        assert.ok(client.db.sites.some(s => s.id === 's1'));
        assert.equal(client.db.log_entries[0].site_id, 's1');
    });

    test('mergeSite refuses to merge a site into itself', async () => {
        const client = seed();
        await assert.rejects(() => createSupabaseStore(client).mergeSite('s1', 's1'), DiveStoreError);
        assert.equal(client.db.sites.length, 3);
    });

    test('deleteSite removes the site', async () => {
        const client = seed();
        await createSupabaseStore(client).deleteSite('s3');
        assert.deepEqual(client.db.sites.map(s => s.id), ['s1', 's2']);
    });

    test('deleteSite refuses a site that dives still use, checked on the server', async () => {
        const client = seed();
        client.db.log_entries.push({ id: 'late', owner: 'u1', site_id: 's3', log_number: 999, dive_date: '2026-10-07', buddies: [], details: {} });
        await assert.rejects(() => createSupabaseStore(client).deleteSite('s3'), e => e instanceof DiveStoreError && e.kind === 'site-in-use');
        assert.ok(client.db.sites.some(s => s.id === 's3'));
    });

    test('siteUsage counts beyond the first 1000 rows', async () => {
        const client = seed();
        for (let i = 0; i < 1500; i++) client.db.log_entries.push({ id: `bulk-${i}`, owner: 'u1', site_id: 's3', log_number: 2000 + i, dive_date: '2026-01-01', buddies: [], details: {} });
        const usage = await createSupabaseStore(client).siteUsage();
        assert.equal(usage.get('s3'), 1500);
    });
});

describe('SitesPage helpers', () => {
    test('sortSites orders by name, locale-aware and case-insensitive', () => {
        const names = sortSites([{ id: '1', name: 'Zlatý' }, { id: '2', name: 'abyss' }, { id: '3', name: 'Čeřen' }, { id: '4', name: 'Barbora' }], 'cs').map(s => s.name);
        assert.deepEqual(names, ['abyss', 'Barbora', 'Čeřen', 'Zlatý']);
    });

    test('parseAltitude accepts whole metres, empty is none, anything else is invalid', () => {
        assert.deepEqual(parseAltitude(''), { ok: true, value: null });
        assert.deepEqual(parseAltitude(' 420 '), { ok: true, value: 420 });
        assert.deepEqual(parseAltitude('-3'), { ok: true, value: -3 });
        assert.deepEqual(parseAltitude('1,5'), { ok: false });
        assert.deepEqual(parseAltitude('abc'), { ok: false });
    });

    test('diveCountText uses a plural form', () => {
        assert.match(diveCountText(1, 'en'), /1/);
        assert.match(diveCountText(0, 'en'), /0/);
    });
});

// ---- List and table views ----

import { groupByMonth, sortEntries, gasLabel, sparklinePath, profileAreaPath, formatWeekdayDate } from '../js/logbook/listViews.js';

describe('list views', () => {
    const E = (o) => ({ id: o.id ?? String(o.log_number), buddies: [], details: {}, ...o });
    const entries = [
        E({ log_number: 1, dive_date: '2026-08-30', entry_time: '10:00', max_depth_m: 20, duration_s: 2400 }),
        E({ log_number: 3, dive_date: '2026-09-02', entry_time: '09:00', max_depth_m: 12.5, duration_s: 3000, site_id: 'b', buddies: ['Zed'] }),
        E({ log_number: 2, dive_date: '2026-09-02', entry_time: '14:00', max_depth_m: null, duration_s: 600, site_id: 'a' }),
        E({ log_number: 4, dive_date: '2026-09-20', entry_time: null, max_depth_m: 30, duration_s: null, details: { avgDepthM: 9 } }),
    ];
    const sites = new Map([['a', { id: 'a', name: 'Alpha' }], ['b', { id: 'b', name: 'beta' }]]);

    test('groupByMonth groups newest first with localized labels', () => {
        const g = groupByMonth(entries, 'en-GB');
        assert.deepEqual(g.map(x => x.key), ['2026-09', '2026-08']);
        assert.equal(g[0].label, 'September 2026');
        assert.deepEqual(g[0].entries.map(e => e.log_number), [4, 2, 3]);
        assert.match(groupByMonth(entries, 'cs-CZ')[0].label, /září 2026/i);
        assert.deepEqual(groupByMonth([], 'en'), []);
    });
    test('groupByMonth puts entries without a date in a trailing group', () => {
        const g = groupByMonth([...entries, E({ log_number: 9, dive_date: null })], 'en');
        assert.equal(g.at(-1).key, '');
        assert.equal(g.at(-1).entries.length, 1);
    });

    test('sortEntries sorts numerically, toggles direction, missing last', () => {
        const nums = (key, dir) => sortEntries(entries, key, dir, sites).map(e => e.log_number);
        assert.deepEqual(nums('number', 'desc'), [4, 3, 2, 1]);
        assert.deepEqual(nums('number', 'asc'), [1, 2, 3, 4]);
        assert.deepEqual(nums('maxDepth', 'asc'), [3, 1, 4, 2]);
        assert.deepEqual(nums('maxDepth', 'desc'), [4, 1, 3, 2]);
        assert.deepEqual(nums('duration', 'desc'), [3, 1, 2, 4]);
        assert.deepEqual(nums('avgDepth', 'desc'), [4, 3, 2, 1]);
        assert.deepEqual(nums('date', 'asc'), [1, 3, 2, 4]);
    });
    test('sortEntries sorts site names case-insensitively and buddies as text; input untouched', () => {
        const copy = entries.slice();
        const s = sortEntries(entries, 'site', 'asc', sites).map(e => e.log_number);
        assert.deepEqual(s.slice(0, 2), [2, 3]);
        assert.deepEqual(sortEntries(entries, 'buddies', 'desc', sites)[0].log_number, 3);
        assert.deepEqual(entries, copy);
    });

    test('gasLabel', () => {
        assert.equal(gasLabel({ o2: 0.21, he: 0 }), 'Air');
        assert.equal(gasLabel({ o2: 0.32 }), 'EAN32');
        assert.equal(gasLabel({ o2: 0.18, he: 0.45 }), 'Tx 18/45');
        assert.equal(gasLabel(null), '');
        assert.equal(gasLabel({}), '');
    });

    test('sparklinePath handles degenerate input and inverts depth', () => {
        assert.equal(sparklinePath([], 120, 48), '');
        assert.equal(sparklinePath(null, 120, 48), '');
        assert.equal(sparklinePath([{ t: 0, depth: 0 }], 120, 48), '');
        const p = sparklinePath([{ t: 0, depth: 0 }, { t: 60, depth: 10 }, { t: 120, depth: 0 }], 120, 48);
        assert.match(p, /^M[\d.]+,[\d.]+( L[\d.]+,[\d.]+)+$/);
        const ys = [...p.matchAll(/,([\d.]+)/g)].map(m => Number(m[1]));
        assert.ok(ys[1] > ys[0], 'deeper is lower on screen');
        assert.ok(ys.every(y => y >= 0 && y <= 48));
        assert.equal(sparklinePath([{ t: 0, depth: 0 }, { t: 0, depth: 0 }], 120, 48), '');
        assert.ok(sparklinePath(Array.from({ length: 5000 }, (_, i) => ({ t: i, depth: i % 30 })), 120, 48).split(' L').length <= 130);
    });

    test('formatWeekdayDate shows the weekday and ignores non-dates', () => {
        assert.match(formatWeekdayDate('2026-09-02', 'en'), /Wed/);
        assert.match(formatWeekdayDate('2026-09-02', 'cs'), /st/);
        assert.equal(formatWeekdayDate('x', 'en'), 'x');
        assert.equal(formatWeekdayDate(null, 'en'), '');
    });

});


describe('feed helpers', () => {
    const NB = '\u00a0';
    const num = (v, d) => v.toFixed(d).replace('.', ',');
    test('mapyStaticMapUrl builds a centred marker map; empty without key or position', () => {
        const u = new URL(mapyStaticMapUrl({ lat: 50.08, lon: 14.4, apiKey: 'k y', width: 600, height: 300, scale: 2, lang: 'cs' }));
        assert.equal(u.origin + u.pathname, 'https://api.mapy.com/v1/static/map');
        assert.equal(u.searchParams.get('lon'), '14.4');
        assert.equal(u.searchParams.get('lat'), '50.08');
        assert.equal(u.searchParams.get('zoom'), '12');
        assert.equal(u.searchParams.get('width'), '600');
        assert.equal(u.searchParams.get('height'), '300');
        assert.equal(u.searchParams.get('scale'), '2');
        assert.equal(u.searchParams.get('mapset'), 'outdoor');
        assert.equal(u.searchParams.get('lang'), 'cs');
        assert.equal(u.searchParams.get('format'), 'jpg');
        assert.equal(u.searchParams.get('markers'), 'color:#2980b9;size:normal;14.4,50.08');
        assert.equal(u.searchParams.get('apikey'), 'k y');
        assert.equal(mapyStaticMapUrl({ lat: 50, lon: 14, apiKey: '', width: 10, height: 10 }), '');
        assert.equal(mapyStaticMapUrl({ lat: null, lon: 14, apiKey: 'k', width: 10, height: 10 }), '');
        assert.equal(new URL(mapyStaticMapUrl({ lat: 1, lon: 2, apiKey: 'k', width: 5000, height: 3, lang: 'de' })).searchParams.get('width'), '1024');
        assert.equal(new URL(mapyStaticMapUrl({ lat: 1, lon: 2, apiKey: 'k', width: 5000, height: 3, lang: 'xx' })).searchParams.get('lang'), 'en');
    });
    test('profileAreaPath closes the profile along the surface', () => {
        const p = profileAreaPath([{ t: 0, depth: 0 }, { t: 60, depth: 10 }, { t: 120, depth: 0 }], 100, 50);
        assert.match(p, /^M.* Z$/);
        assert.equal(profileAreaPath([], 100, 50), '');
    });
    test('diveTitle prefers the site name', () => {
        const t = k => ({ 'feed.untitled': 'Dive #{0}', 'feed.untitledNoNumber': 'Dive' }[k]);
        assert.equal(diveTitle({ log_number: 7 }, 'Lahošť', t), 'Lahošť');
        assert.equal(diveTitle({ log_number: 7 }, null, t), 'Dive #7');
        assert.equal(diveTitle({ log_number: null }, '', t), 'Dive');
    });
    test('feedStats formats with the given number formatter and NBSP, skipping missing values', () => {
        const s = feedStats({ max_depth_m: 18.5, duration_s: 2535, water_temp_c: 4.8, gas: { o2: 0.32, he: 0 }, details: { avgDepthM: 9.04 } }, num);
        assert.deepEqual(s, [
            { key: 'depth', value: '18,5', unit: 'm' }, { key: 'duration', value: '42:15', unit: 'min' },
            { key: 'avgDepth', value: '9,0', unit: 'm' }, { key: 'temp', value: '4,8', unit: '°C' },
            { key: 'gas', value: 'EAN32', unit: '' },
        ]);
        assert.deepEqual(feedStats({ details: {} }, num), []);
        assert.deepEqual(feedStats({ max_depth_m: 0, details: null }, num), [{ key: 'depth', value: '0,0', unit: 'm' }]);
    });
    test('chooseVisual: photo, then map, then profile, then none', () => {
        const site = { lat: 50, lon: 14 };
        assert.equal(chooseVisual({ photoUrl: 'x', site, apiKey: 'k', recordingId: 'r' }).kind, 'photo');
        assert.equal(chooseVisual({ site, apiKey: 'k', recordingId: 'r' }).kind, 'map');
        assert.equal(chooseVisual({ site, apiKey: '', recordingId: 'r' }).kind, 'profile');
        assert.equal(chooseVisual({ site: { lat: null, lon: 14 }, apiKey: 'k', recordingId: 'r' }).kind, 'profile');
        assert.equal(chooseVisual({ site: null, apiKey: 'k', recordingId: null }).kind, 'none');
    });
    test('logbookTotals and formatTotalTime', () => {
        const t = logbookTotals([{ duration_s: 3600, max_depth_m: 20 }, { duration_s: null, max_depth_m: 41.5 }, { duration_s: 1800 }]);
        assert.deepEqual(t, { count: 3, seconds: 5400, maxDepth: 41.5 });
        assert.deepEqual(logbookTotals([]), { count: 0, seconds: 0, maxDepth: null });
        assert.equal(formatTotalTime(5400, num), `1,5${NB}h`);
        assert.equal(formatTotalTime(0, num), `0${NB}h`);
        assert.equal(formatTotalTime(41 * 3600 + 1000, num), `41${NB}h`);
    });
    test('migrateView maps the old list view to the feed', () => {
        assert.equal(migrateView('list'), 'feed');
        assert.equal(migrateView('table'), 'table');
        assert.equal(migrateView('tiles'), 'tiles');
        assert.equal(migrateView(null), 'feed');
        assert.equal(migrateView('bogus'), 'feed');
        assert.deepEqual(FEED_VIEWS, ['feed', 'tiles', 'table']);
    });
    test('photoIndex keeps the first photo with a path and counts them', () => {
        const idx = photoIndex([
            { entry_id: 'a', path: null }, { entry_id: 'a', path: 'a1' }, { entry_id: 'a', path: 'a2' }, { entry_id: 'b', path: 'b1' },
        ]);
        assert.deepEqual(idx.get('a'), { path: 'a1', count: 2 });
        assert.deepEqual(idx.get('b'), { path: 'b1', count: 1 });
        assert.equal(idx.has('c'), false);
    });
});
