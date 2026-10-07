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
    normalizeEntry, needsDetails, DETAIL_KEYS,
} from '../js/logbook/entryModel.js';
import { parseRoute, routeHref } from '../js/logbook/router.js';
import { resizeTarget, isSupportedImage, exifTimestamp } from '../js/logbook/photo.js';
import { detailRows, isHttpsUrl } from '../js/logbook/EntryDetail.js';
import { siteFromForm } from '../js/logbook/SitePicker.js';
import { createSupabaseStore, DiveStoreError } from '../js/backend/supabaseStore.js';
import { uploadDivelog, exportZip } from '../js/logbook/transfer.js';
import { formValuesFromEntry, gasFromForm, formatDuration, recordingsOnDate, invalidNumberFields, EntryForm } from '../js/logbook/EntryForm.js';

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

    test('a no-deco dive with a safety stop', () => {
        const e = entryFromRecording(diveOf('00000092'));
        assert.equal(e.details.stops, 'safety');
    });

    test('a clock-reset dive keeps its recorded date', () => {
        assert.equal(entryFromRecording(diveOf('00000099')).dive_date, '2006-07-19');
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

    test('needsDetails', () => {
        assert.equal(needsDetails({ site_id: null, buddies: ['A'] }), true);
        assert.equal(needsDetails({ site_id: 's', buddies: [] }), true);
        assert.equal(needsDetails({ site_id: 's', buddies: ['A'] }), false);
    });

    test('detail keys cover the spec groups', () => {
        assert.ok(DETAIL_KEYS.conditions.includes('weather'));
        assert.ok(DETAIL_KEYS.equipment.includes('weightsKg'));
        assert.ok(DETAIL_KEYS.dive.includes('rating'));
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
});

describe('entry form helpers', () => {
    test('formatDuration gives minutes that round-trip to the stored seconds', () => {
        assert.equal(formatDuration(null), '');
        assert.equal(formatDuration(2700), '45');
        assert.equal(formatDuration(3109), '51.82');
        for (const s of [59, 3109, 2701, 7]) {
            assert.equal(normalizeEntry({ duration_min: formatDuration(s) }).duration_s, s);
        }
    });

    test('gasFromForm', () => {
        assert.deepEqual(gasFromForm({ kind: 'air' }), { o2: 0.21, he: 0 });
        assert.deepEqual(gasFromForm({ kind: 'ean', o2: '32' }), { o2: 0.32, he: 0 });
        assert.deepEqual(gasFromForm({ kind: 'ean', o2: '32,5' }), { o2: 0.325, he: 0 });
        assert.deepEqual(gasFromForm({ kind: 'tx', o2: '18', he: '45' }), { o2: 0.18, he: 0.45 });
        assert.deepEqual(gasFromForm({ kind: 'tx', o2: '18', he: '' }), { o2: 0.18, he: 0 });
        assert.equal(gasFromForm({ kind: 'ean', o2: '' }), null);
        assert.equal(gasFromForm({ kind: 'tx', o2: '60', he: '50' }), null);
        assert.equal(gasFromForm({ kind: 'ean', o2: '0' }), null);
        assert.equal(gasFromForm({ kind: '' }), null);
    });

    test('formValuesFromEntry round-trips through normalizeEntry', () => {
        const entry = {
            log_number: 12, dive_date: '2026-10-01', entry_time: '09:30:00', duration_s: 2700,
            max_depth_m: 18.4, site_id: 's1', buddies: ['Petr'], gas: { o2: 0.32, he: 0 },
            water_temp_c: 14.5, vis_shallow_m: 8, vis_deep_m: null, notes: 'ok',
            details: { weather: 'sun', tags: ['night'], rating: 4, futureKey: 'kept' },
        };
        const form = formValuesFromEntry(entry);
        assert.equal(form.gasKind, 'ean');
        assert.equal(form.gasO2, '32');
        assert.equal(form.entry_time, '09:30');
        assert.equal(form.vis_deep_m, '');
        const back = normalizeEntry({ ...form, gas: gasFromForm({ kind: form.gasKind, o2: form.gasO2, he: form.gasHe }) }, entry.details);
        assert.deepEqual({ ...back, entry_time: entry.entry_time }, { ...entry });
    });

    test('formValuesFromEntry detects air, trimix and unset gas, and uses a comma on request', () => {
        assert.equal(formValuesFromEntry({ gas: { o2: 0.21, he: 0 } }).gasKind, 'air');
        const tx = formValuesFromEntry({ gas: { o2: 0.18, he: 0.45 } });
        assert.deepEqual([tx.gasKind, tx.gasO2, tx.gasHe], ['tx', '18', '45']);
        assert.equal(formValuesFromEntry({ gas: null }).gasKind, '');
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
        assert.deepEqual(invalidNumberFields({ ...base, details: { cylinderL: '1 234', rating: 'x' } }), ['cylinderL', 'rating']);
        assert.deepEqual(invalidNumberFields({ ...base, gasKind: 'air', gasO2: 'zz' }), []);
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
        assert.deepEqual(core.map(r => r.key), ['duration', 'depth', 'gas', 'waterTemp', 'buddies']);
        assert.equal(core.find(r => r.key === 'depth').value, '38.6\u00a0m');
        assert.equal(core.find(r => r.key === 'duration').value, '52\u00a0min');
        assert.equal(core.find(r => r.key === 'gas').value, 'EAN32');
        assert.equal(core.find(r => r.key === 'waterTemp').value, '4.8\u00a0\u00b0C');
        assert.equal(core.find(r => r.key === 'buddies').value, 'Ann, Bob');
    });

    test('details are grouped, choices translated, unknown keys ignored', () => {
        const { groups } = detailRows(entry, t);
        assert.deepEqual(groups.map(g => g.group), ['conditions', 'equipment', 'dive']);
        const dive = groups.find(g => g.group === 'dive').rows;
        assert.deepEqual(dive.map(r => r.key), ['stops', 'tags', 'rating']);
        assert.equal(dive.find(r => r.key === 'stops').value, '<form.choices.stops.deco>');
        assert.equal(dive.find(r => r.key === 'tags').value, '<form.choices.tags.wreck>, custom');
        assert.equal(dive.find(r => r.key === 'rating').value, '4\u00a0/\u00a05');
        assert.equal(groups.find(g => g.group === 'equipment').rows[0].value, '12\u00a0l');
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
