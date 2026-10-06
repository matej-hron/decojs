/**
 * Dive log backend tests (sync logic, Supabase adapter with a fake client, store factory).
 * Run: node --test tests/dive-log-backend.test.mjs
 */

import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseDivesoftDLF, PARSER_VERSION } from '../js/import/divesoftDlf.js';
import { diveKey, sha256Hex, listSummary, planSync } from '../js/backend/sync.js';

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
