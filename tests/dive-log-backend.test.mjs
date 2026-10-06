/**
 * Dive log backend tests (sync logic, Supabase adapter with a fake client, store factory).
 * Run: node --test tests/dive-log-backend.test.mjs
 */

import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseDivesoftDLF, PARSER_VERSION } from '../js/import/divesoftDlf.js';
import { diveKey, sha256Hex, listSummary, planSync } from '../js/backend/sync.js';
import { createSupabaseStore, DiveStoreError } from '../js/backend/supabaseStore.js';
import { getDiveStore } from '../js/backend/diveStore.js';
import { loadDiveFiles, summaryToListDive, chainWindow, canAnalyze, codeLabel, diveNumberLabel, translateStatic } from '../js/components/RecordedDiveAnalysis.js';

const FIXTURES = new URL('./fixtures/divesoft/', import.meta.url);
const bytesOf = id => new Uint8Array(readFileSync(new URL(`${id}.DLF`, FIXTURES)));
const diveOf = id => parseDivesoftDLF(bytesOf(id), { fileName: `${id}.DLF` });

async function item(id) {
    const bytes = bytesOf(id);
    return { dive: diveOf(id), bytes, sha256: await sha256Hex(bytes) };
}

function row(it) {
    return { deviceSerial: it.dive.device.serial, diveNumber: it.dive.source.diveNumber, startLocal: it.dive.start.local, fileSha256: it.sha256 };
}

describe('versions', () => {
    test('parser and record schema versions', () => {
        assert.equal(PARSER_VERSION, 1);
        assert.equal(diveOf('00000100').schema, 1);
    });
});

describe('diveKey', () => {
    test('serial, number and device start time', () => {
        assert.equal(diveKey(diveOf('00000100')), '7044-00006107|100|2026-09-27T12:01:01');
    });

    test('a clock-reset dive keeps a stable key', () => {
        assert.equal(diveKey(diveOf('00000099')), diveKey(diveOf('00000099')));
        assert.ok(diveKey(diveOf('00000099')).includes('|99|2006-'));
    });

    test('falls back for missing serial and number', () => {
        const d = diveOf('00000100');
        const bare = { ...d, device: { ...d.device, serial: null }, source: { ...d.source, diveNumber: null } };
        assert.equal(diveKey(bare), 'unknown|0|2026-09-27T12:01:01');
    });
});

describe('sha256Hex', () => {
    test('known vector', async () => {
        assert.equal(await sha256Hex(new TextEncoder().encode('abc')),
            'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
    });
});

describe('listSummary', () => {
    test('carries what the dive list shows', () => {
        assert.deepEqual(listSummary(diveOf('00000100')), {
            maxDepth: 38.56, duration: 3109, mode: 'oc', gfLow: 60, gfHigh: 90,
            waterSetting: 'salt', warnings: ['duplicate-seconds:1'],
        });
    });
});

describe('planSync', () => {
    test('an empty server uploads everything', async () => {
        const local = [await item('00000100'), await item('00000101')];
        const plan = planSync(local, []);
        assert.equal(plan.upload.length, 2);
        assert.equal(plan.update.length, 0);
        assert.equal(plan.unchanged.length, 0);
    });

    test('the same folder twice uploads nothing', async () => {
        const local = [await item('00000100'), await item('00000101')];
        const plan = planSync(local, local.map(row));
        assert.equal(plan.upload.length, 0);
        assert.equal(plan.unchanged.length, 2);
    });

    test('a changed file is an update', async () => {
        const local = [await item('00000100')];
        const stored = { ...row(local[0]), fileSha256: 'different' };
        const plan = planSync(local, [stored]);
        assert.deepEqual(plan.update, local);
        assert.equal(plan.upload.length, 0);
    });

    test('duplicate local keys keep the first', async () => {
        const a = await item('00000100');
        const b = { ...a };
        const plan = planSync([a, b], []);
        assert.deepEqual(plan.upload, [a]);
        assert.deepEqual(plan.unchanged, [b]);
    });
});

function fakeClient({ user = { id: 'u1', email: 'me@example.com' }, rows = [], failUpload = new Set(), listError = null } = {}) {
    const calls = [];
    const files = new Map();
    const table = rows.slice();
    const query = (name) => {
        const q = {
            _filters: [], _select: '*',
            select(cols) { this._select = cols; return this; },
            order(col) { calls.push(['order', col]); return this; },
            eq(col, val) { this._filters.push([col, val]); return this; },
            single() { this._single = true; return this; },
            async then(resolve) {
                if (listError) return resolve({ data: null, error: listError });
                let data = table.filter(r => this._filters.every(([c, v]) => r[c] === v));
                return resolve({ data: this._single ? data[0] ?? null : data, error: null });
            },
            upsert(row, opts) {
                calls.push(['upsert', name, row, opts]);
                const i = table.findIndex(r => r.owner === row.owner && r.device_serial === row.device_serial && r.dive_number === row.dive_number && r.start_local === row.start_local);
                if (i >= 0) table[i] = { ...table[i], ...row }; else table.push({ id: `id${table.length + 1}`, ...row });
                return Promise.resolve({ data: null, error: null });
            },
            update(patch) {
                const self = this;
                return { eq(col, val) { calls.push(['update', name, patch, val]); const r = table.find(x => x[col] === val); Object.assign(r, patch); return Promise.resolve({ error: null }); } };
            },
        };
        return q;
    };
    return {
        calls, files, table,
        auth: {
            async getUser() { return { data: { user }, error: null }; },
            async getSession() { return { data: { session: user ? { user } : null }, error: null }; },
            async signInWithOtp(args) { calls.push(['otp', args]); return { error: null }; },
            async signOut() { calls.push(['signOut']); return { error: null }; },
            onAuthStateChange(fn) { calls.push(['listen']); return { data: { subscription: { unsubscribe() { calls.push(['unlisten']); } } } }; },
        },
        from: query,
        storage: {
            from(bucket) {
                return {
                    async upload(path, body, opts) {
                        calls.push(['upload', bucket, path, opts]);
                        if ([...failUpload].some(f => path.endsWith(f))) return { data: null, error: { message: 'boom' } };
                        files.set(path, body); return { data: { path }, error: null };
                    },
                    async download(path) { return files.has(path) ? { data: new Blob([files.get(path)]), error: null } : { data: null, error: { message: 'missing' } }; },
                };
            },
        },
    };
}

describe('createSupabaseStore', () => {
    test('saveDives uploads the original file, then upserts the row on the dive key', async () => {
        const client = fakeClient();
        const store = createSupabaseStore(client);
        const it = await item('00000100');
        const report = await store.saveDives([{ ...it, action: 'upload' }]);
        assert.deepEqual(report, { saved: 1, updated: 0, failed: [] });
        const [up, ups] = client.calls.filter(c => c[0] === 'upload' || c[0] === 'upsert');
        assert.equal(up[0], 'upload');
        assert.equal(up[2], 'u1/7044-00006107/20260927120101_00000100.DLF');
        assert.equal(up[3].upsert, true);
        assert.equal(ups[0], 'upsert');
        assert.equal(ups[3].onConflict, 'owner,device_serial,dive_number,start_local');
        const r = ups[2];
        assert.equal(r.owner, 'u1');
        assert.equal(r.device_serial, '7044-00006107');
        assert.equal(r.dive_number, 100);
        assert.equal(r.start_local, '2026-09-27T12:01:01');
        assert.equal(r.file_path, 'u1/7044-00006107/20260927120101_00000100.DLF');
        assert.equal(r.file_sha256, it.sha256);
        assert.equal(r.parser_version, 1);
        assert.deepEqual(r.summary, listSummary(it.dive));
        assert.equal(r.record.schema, 1);
    });

    test('two dives with the same number and different start never share a file', async () => {
        const client = fakeClient();
        const store = createSupabaseStore(client);
        const a = await item('00000100');
        const b = { ...a, dive: { ...a.dive, start: { ...a.dive.start, local: '2026-09-28T08:00:00' } } };
        await store.saveDives([{ ...a, action: 'upload' }, { ...b, action: 'upload' }]);
        const paths = client.calls.filter(c => c[0] === 'upload').map(c => c[2]);
        assert.equal(new Set(paths).size, 2);
        assert.equal(client.table.length, 2);
        const out = await store.exportAll();
        assert.deepEqual(out.files.map(f => f.name).sort(), ['20260928080000_00000100.DLF', '00000100.DLF'].sort());
    });

    test('a failed upload is reported and the rest continue', async () => {
        const client = fakeClient({ failUpload: new Set(['00000100.DLF']) });
        const store = createSupabaseStore(client);
        const items = [{ ...(await item('00000100')), action: 'upload' }, { ...(await item('00000101')), action: 'update' }];
        const report = await store.saveDives(items);
        assert.equal(report.saved, 0);
        assert.equal(report.updated, 1);
        assert.deepEqual(report.failed.map(f => f.fileName), ['00000100.DLF']);
        assert.equal(client.calls.filter(c => c[0] === 'upsert').length, 1);
    });

    test('listDives maps rows to summaries and loadDive returns the record', async () => {
        const it = await item('00000100');
        const client = fakeClient();
        const store = createSupabaseStore(client);
        await store.saveDives([{ ...it, action: 'upload' }]);
        const [rowOut] = await store.listDives();
        assert.deepEqual(Object.keys(rowOut).sort(), ['deviceSerial', 'diveNumber', 'fileSha256', 'id', 'parserVersion', 'startLocal', 'summary']);
        assert.equal(rowOut.diveNumber, 100);
        assert.deepEqual(client.calls.filter(c => c[0] === 'order').map(c => c[1]), ['dive_number', 'start_local']);
        const full = await store.loadDive(rowOut.id);
        assert.equal(full.maxDepth, 38.56);
        assert.equal(full.samples.length, it.dive.samples.length);
    });

    test('rows from an older parser are re-parsed from the stored file', async () => {
        const it = await item('00000100');
        const client = fakeClient();
        const store = createSupabaseStore(client);
        await store.saveDives([{ ...it, action: 'upload' }]);
        client.table[0].parser_version = 0;
        client.table[0].record = { schema: 0 };
        const rows = await store.listDives();
        assert.equal(await store.reparseOutdated(rows), 1);
        assert.equal(client.table[0].parser_version, 1);
        assert.equal(client.table[0].record.schema, 1);
    });

    test('an unreachable backend raises an unreachable error', async () => {
        const store = createSupabaseStore(fakeClient({ listError: { message: 'Failed to fetch' } }));
        await assert.rejects(() => store.listDives(), e => e instanceof DiveStoreError && e.kind === 'unreachable');
    });

    test('login link, current user and sign out', async () => {
        const client = fakeClient();
        const store = createSupabaseStore(client);
        await store.sendLoginLink('me@example.com', 'https://decotheory.eu/lab/dive-log.html');
        assert.deepEqual(client.calls.find(c => c[0] === 'otp')[1], {
            email: 'me@example.com', options: { emailRedirectTo: 'https://decotheory.eu/lab/dive-log.html' },
        });
        assert.deepEqual(await store.currentUser(), { id: 'u1', email: 'me@example.com' });
        await store.signOut();
        assert.ok(client.calls.some(c => c[0] === 'signOut'));
    });

    test('currentUser rejects as unreachable when getSession fails over the network', async () => {
        const client = fakeClient();
        client.auth.getSession = async () => ({ data: { session: null }, error: { message: 'Failed to fetch' } });
        await assert.rejects(createSupabaseStore(client).currentUser(), e => e instanceof DiveStoreError && e.kind === 'unreachable');
    });

    test('exportAll returns the original files and all records', async () => {
        const client = fakeClient();
        const store = createSupabaseStore(client);
        await store.saveDives([{ ...(await item('00000100')), action: 'upload' }]);
        const out = await store.exportAll();
        assert.deepEqual(out.files.map(f => f.name), ['00000100.DLF']);
        assert.equal(out.files[0].bytes.length, bytesOf('00000100').length);
        assert.equal(out.dives.length, 1);
    });
});

describe('getDiveStore', () => {
    const fake = () => ({});
    test('no store while url or key is empty; the factory is not called', () => {
        let called = false;
        const factory = () => { called = true; return fake(); };
        assert.equal(getDiveStore({ url: '', key: '', factory }), null);
        assert.equal(getDiveStore({ url: 'https://x.supabase.co', key: '', factory }), null);
        assert.equal(called, false);
    });

    test('no store without a client factory', () => {
        assert.equal(getDiveStore({ url: 'https://x.supabase.co', key: 'k', factory: undefined }), null);
    });

    test('creates a store from url, key and factory', () => {
        const seen = [];
        const store = getDiveStore({ url: 'https://x.supabase.co', key: 'k', factory: (...a) => { seen.push(a); return fakeClient(); } });
        assert.equal(typeof store.listDives, 'function');
        assert.deepEqual(seen, [['https://x.supabase.co', 'k']]);
    });
});

const fileOf = (name, bytes) => ({ name, arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) });

describe('loadDiveFiles items', () => {
    test('items carry bytes and hash, aligned with dives', async () => {
        const files = [fileOf('00000101.DLF', bytesOf('00000101')), fileOf('00000100.DLF', bytesOf('00000100')),
            fileOf('SUMMARY.DSM', new Uint8Array([1, 2])), fileOf('x.SSF', new Uint8Array([3]))];
        const { dives, items } = await loadDiveFiles(files);
        assert.equal(items.length, 2);
        assert.equal(dives.length, 2);
        for (let i = 0; i < dives.length; i++) {
            assert.equal(items[i].dive, dives[i]);
            assert.equal(items[i].sha256, await sha256Hex(items[i].bytes));
        }
        assert.equal(dives[0].source.diveNumber, 100);
    });
});

describe('summaryToListDive', () => {
    test('builds a lightweight dive that cannot be analysed yet', () => {
        const d = summaryToListDive({
            id: 'a', deviceSerial: 'S1', diveNumber: 7, startLocal: '2026-09-27T12:01:01',
            summary: { maxDepth: 20, duration: 1800, mode: 'oc', gfLow: 50, gfHigh: 80, waterSetting: 'salt', warnings: ['w'] },
        });
        assert.deepEqual(d, {
            id: 'a', source: { diveNumber: 7, fileName: null }, start: { local: '2026-09-27T12:01:01' },
            device: { serial: 'S1' }, maxDepth: 20, duration: 1800, mode: 'oc',
            deco: { gfLow: 50, gfHigh: 80 }, environment: { waterSetting: 'salt' }, warnings: ['w'], samples: null,
        });
        assert.equal(canAnalyze(d), false);
    });
});

describe('chainWindow', () => {
    const mk = (local, warnings = []) => ({ start: { local }, warnings });
    test('keeps dives within a week before the target, drops implausible dates', () => {
        const target = mk('2026-09-27T12:00:00');
        const a = mk('2026-09-26T12:00:00');
        const old = mk('2026-09-10T12:00:00');
        const later = mk('2026-09-28T12:00:00');
        const bad = mk('2026-09-26T13:00:00', ['implausible-date']);
        assert.deepEqual(chainWindow(target, [old, a, bad, target, later]), [a]);
    });
});

describe('list labels', () => {
    const tr = (key, fb) => ({ 'diveLog.mode.oc': 'OC', 'diveLog.water.salt': 'Slaná' }[key] ?? fb);
    test('codeLabel translates known codes, keeps unknown ones, dashes absent ones', () => {
        assert.equal(codeLabel('mode', 'oc', tr), 'OC');
        assert.equal(codeLabel('water', 'salt', tr), 'Slaná');
        assert.equal(codeLabel('water', 'brackish', tr), 'brackish');
        assert.equal(codeLabel('water', null, tr), '–');
    });

    test('diveNumberLabel shows a dash for number 0 without a file name', () => {
        assert.equal(diveNumberLabel({ source: { diveNumber: 0, fileName: null } }), '–');
        assert.equal(diveNumberLabel({ source: { diveNumber: 0, fileName: 'a.DLF' } }), 'a.DLF');
        assert.equal(diveNumberLabel({ source: { diveNumber: 7, fileName: 'a.DLF' } }), '7');
        assert.equal(diveNumberLabel({ source: { diveNumber: null, fileName: 'a.DLF' } }), 'a.DLF');
    });
});

describe('translateStatic', () => {
    const el = (key, html) => {
        const data = {};
        return { dataset: data, innerHTML: html, getAttribute: () => key };
    };
    test('keeps the English fallback for later re-translations', () => {
        const a = el('diveLog.helpText', '<b>x</b>');
        const root = { querySelectorAll: () => [a] };
        translateStatic(root, (k, fb) => `cs:${fb}`);
        assert.equal(a.innerHTML, 'cs:<b>x</b>');
        translateStatic(root, (k, fb) => fb);
        assert.equal(a.innerHTML, '<b>x</b>');
    });
});
