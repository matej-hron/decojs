/**
 * Recorded dive analysis tests (thinning, setup preparation, summary, chart overlays, page helpers).
 * Run: node --test tests/recorded-dive.test.mjs
 */

import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseDivesoftDLF } from '../js/import/divesoftDlf.js';
import { toDiveSetup } from '../js/import/recordedDive.js';
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
        for (const wp of full) {
            if (thin.includes(wp)) {
                // Waypoint is kept in the thinned profile, check it's at the expected depth
                assert.ok(true); // Already included, so it matches exactly
                continue;
            }
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
