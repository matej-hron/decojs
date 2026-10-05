/**
 * Recorded dive analysis tests (thinning, setup preparation, summary, chart overlays, page helpers).
 * Run: node --test tests/recorded-dive.test.mjs
 */

import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseDivesoftDLF } from '../js/import/divesoftDlf.js';
import { toDiveSetup, prepareRecordedSetup, THIN_TOLERANCE_M } from '../js/import/recordedDive.js';
import { thinProfile } from '../js/import/thinProfile.js';

const FIXTURES = new URL('./fixtures/divesoft/', import.meta.url);

function loadDive(id) {
    return parseDivesoftDLF(new Uint8Array(readFileSync(new URL(`${id}.DLF`, FIXTURES))), { fileName: `${id}.DLF` });
}

/** Depth of a polyline at time t (minutes), by linear interpolation. */
function depthAt(waypoints, t) {
    for (let i = 1; i < waypoints.length; i++) {
        const a = waypoints[i - 1];
        const b = waypoints[i];
        if (t <= b.time) {
            if (b.time === a.time) return b.depth;
            return a.depth + (t - a.time) / (b.time - a.time) * (b.depth - a.depth);
        }
    }
    return waypoints.at(-1).depth;
}

describe('thinProfile', () => {
    const full = toDiveSetup(loadDive('00000100')).dives[0].waypoints;
    const thin = thinProfile(full, 0.1);

    test('reduces a recorded dive to a chart-friendly size', () => {
        assert.equal(full.length, 683);
        assert.ok(thin.length >= 60 && thin.length <= 200, `${thin.length} waypoints`);
    });

    test('never deviates more than the tolerance from the original', () => {
        const kept = new Set(thin);
        for (const wp of full) {
            if (kept.has(wp)) continue; // kept waypoints are exact by construction; depthAt is ambiguous at duplicate times (t = 0)
            const dev = Math.abs(depthAt(thin, wp.time) - wp.depth);
            assert.ok(dev <= 0.1 + 1e-9, `deviation ${dev} m at ${wp.time} min`);
        }
    });

    test('keeps endpoints, the deepest point and gas-switch waypoints', () => {
        assert.equal(thin[0], full[0]);
        assert.equal(thin.at(-1), full.at(-1));
        const deepest = full.reduce((a, b) => (b.depth > a.depth ? b : a));
        assert.ok(thin.includes(deepest));
        for (const wp of full.filter(w => w.gasId)) assert.ok(thin.includes(wp));
    });

    test('keeps order and returns the same objects', () => {
        for (let i = 1; i < thin.length; i++) assert.ok(thin[i].time >= thin[i - 1].time);
        for (const wp of thin) assert.ok(full.includes(wp));
    });

    test('is idempotent', () => {
        assert.deepEqual(thinProfile(thin, 0.1), thin);
    });

    test('short inputs come back unchanged (as a copy)', () => {
        const two = [{ time: 0, depth: 0 }, { time: 1, depth: 5 }];
        const out = thinProfile(two, 0.1);
        assert.deepEqual(out, two);
        assert.notEqual(out, two);
        assert.deepEqual(thinProfile([], 0.1), []);
    });

    test('a straight line collapses to its endpoints', () => {
        const line = Array.from({ length: 11 }, (_, i) => ({ time: i, depth: i * 2 }));
        assert.deepEqual(thinProfile(line, 0.1), [line[0], line[10]]);
    });
});

describe('prepareRecordedSetup', () => {
    test('thins the profile and keeps the device GF by default', () => {
        const dive = loadDive('00000100');
        const { setup, samples } = prepareRecordedSetup(dive);
        assert.equal(THIN_TOLERANCE_M, 0.1);
        assert.equal(setup.gfLow, 60);
        assert.equal(setup.gfHigh, 90);
        const n = setup.dives[0].waypoints.length;
        assert.ok(n >= 60 && n <= 200, `${n} waypoints`);
        assert.equal(samples, dive.samples);
    });

    test('overrides GF without touching the dive', () => {
        const dive = loadDive('00000100');
        const { setup } = prepareRecordedSetup(dive, { gfLow: 30, gfHigh: 70 });
        assert.equal(setup.gfLow, 30);
        assert.equal(setup.gfHigh, 70);
        assert.equal(dive.deco.gfLow, 60);
    });

    test('exposes the logged ceiling in minutes at full resolution', () => {
        const dive = loadDive('00000100');
        const { deviceCeiling } = prepareRecordedSetup(dive);
        assert.equal(deviceCeiling.length, dive.samples.length);
        const peak = deviceCeiling.reduce((a, b) => (b.depth > a.depth ? b : a));
        assert.equal(peak.depth, 3.1);
        const sample = dive.samples.find(s => s.ceiling === 3.1);
        assert.equal(peak.t, sample.t / 60);
    });

    test('a dive without device GF or samples does not throw', () => {
        const dive = loadDive('00000101');
        const bare = { ...dive, deco: { model: null, gfLow: null, gfHigh: null, gfAlt: null }, samples: [], events: [] };
        const { setup, deviceCeiling } = prepareRecordedSetup(bare);
        assert.equal(setup.gfLow, 100);
        assert.equal(setup.gfHigh, 100);
        assert.deepEqual(deviceCeiling, []);
        assert.deepEqual(setup.dives[0].waypoints, [{ time: 0, depth: 0 }]);
    });
});
