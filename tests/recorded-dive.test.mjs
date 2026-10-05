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
import { analyzeRecordedDive, summarizeRecordedDive, CEILING_VIOLATION_TOLERANCE_M, DECO_CEILING_THRESHOLD_M } from '../js/import/recordedDiveSummary.js';

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

describe('analyzeRecordedDive / summarizeRecordedDive', () => {
    const dive = loadDive('00000100');
    const summaryAt = (gfLow, gfHigh) =>
        summarizeRecordedDive(analyzeRecordedDive(prepareRecordedSetup(dive, { gfLow, gfHigh }).setup));

    test('exports the agreed tolerances', () => {
        assert.equal(CEILING_VIOLATION_TOLERANCE_M, 0.1);
        assert.equal(DECO_CEILING_THRESHOLD_M, 0.05);
    });

    test('at the device GF 60/90 the dive stays within limits and has light deco', () => {
        const s = summaryAt(60, 90);
        assert.equal(s.aboveCeiling.seconds, 0);
        assert.equal(s.aboveCeiling.worstM, 0);
        assert.ok(s.deco, 'deco present');
        assert.ok(s.deco.maxCeiling > 1.5 && s.deco.maxCeiling < 3, `max ceiling ${s.deco.maxCeiling}`);
        assert.ok(s.deco.start < s.deco.end);
    });

    test('GF 30/70 deepens the ceiling but the recorded dive still clears it', () => {
        const strict = summaryAt(30, 70);
        const device = summaryAt(60, 90);
        assert.equal(strict.aboveCeiling.seconds, 0);
        assert.ok(strict.deco.maxCeiling > device.deco.maxCeiling + 5);
    });

    test('GF 20/50 puts part of the recorded dive above the ceiling', () => {
        const s = summaryAt(20, 50);
        assert.ok(s.aboveCeiling.seconds > 60, `${s.aboveCeiling.seconds} s`);
        assert.ok(s.aboveCeiling.worstM > 0.3, `${s.aboveCeiling.worstM} m`);
    });

    test('peak tissue GF does not depend on the GF setting', () => {
        const a = summaryAt(60, 90).peakGf;
        const b = summaryAt(20, 50).peakGf;
        assert.deepEqual(a, b);
        assert.ok(a.value > 0.3 && a.value < 1.2, `peak GF ${a.value}`);
        assert.ok(a.compartment >= 1 && a.compartment <= 16);
    });

    test('surface GF at the end is reported', () => {
        const s = summaryAt(60, 90);
        assert.ok(s.surfaceGfEnd);
        assert.ok(s.surfaceGfEnd.value > 0);
    });

    test('thinning does not move the peak ceiling by more than 0.1 m', () => {
        const thinned = analyzeRecordedDive(prepareRecordedSetup(dive).setup);
        const fullSetup = toDiveSetup(dive);
        const full = analyzeRecordedDive(fullSetup);
        const diff = Math.abs(Math.max(...thinned.ceilingDepths) - Math.max(...full.ceilingDepths));
        assert.ok(diff <= 0.1, `peak ceiling moved ${diff} m`);
    });

    test('a no-deco dive reports no deco and no violations', () => {
        const s = summarizeRecordedDive(analyzeRecordedDive(prepareRecordedSetup(loadDive('00000101')).setup));
        assert.equal(s.deco, null);
        assert.equal(s.aboveCeiling.seconds, 0);
    });
});
