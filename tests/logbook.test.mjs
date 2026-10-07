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
import { resizeTarget, isSupportedImage } from '../js/logbook/photo.js';

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
