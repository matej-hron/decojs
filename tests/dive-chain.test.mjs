/**
 * Repetitive-dive chaining tests.
 * Run: node --test tests/dive-chain.test.mjs
 */

import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseDivesoftDLF } from '../js/import/divesoftDlf.js';
import { prepareRecordedSetup } from '../js/import/recordedDive.js';
import { analyzeRecordedDive, summarizeRecordedDive } from '../js/import/recordedDiveSummary.js';
import { startStateFor, CHAIN_MAX_GAP_MIN, CHAIN_SETTLED_BAR } from '../js/import/diveChain.js';
import { getInitialTissueN2 } from '../js/deco/gasKinetics.js';

const FIXTURES = new URL('./fixtures/divesoft/', import.meta.url);
const IDS = Array.from({ length: 10 }, (_, i) => String(92 + i).padStart(8, '0'));
const DIVES = IDS.map(id => parseDivesoftDLF(new Uint8Array(readFileSync(new URL(`${id}.DLF`, FIXTURES))), { fileName: `${id}.DLF` }));
const dive = n => DIVES.find(d => d.source.diveNumber === n);

/** A copy of a dive moved to a new device start time. */
function movedTo(original, local) {
    return { ...original, source: { ...original.source, diveNumber: null }, start: { ...original.start, local } };
}

function peakGf(target, startState) {
    const { setup } = prepareRecordedSetup(target);
    setup.initialTissuePressures = startState?.initialTissuePressures ?? null;
    return summarizeRecordedDive(analyzeRecordedDive(setup)).peakGf.value;
}

describe('startStateFor', () => {
    test('exports the agreed limits', () => {
        assert.equal(CHAIN_MAX_GAP_MIN, 7 * 24 * 60);
        assert.equal(CHAIN_SETTLED_BAR, 0.01);
    });

    test('the first loaded dive starts fresh', () => {
        const s = startStateFor(dive(92), DIVES);
        assert.equal(s.initialTissuePressures, null);
        assert.equal(s.reason, 'no-earlier-dive');
        assert.deepEqual(s.chain, []);
    });

    test('a later dive the same day chains with every earlier dive of that day', () => {
        const s = startStateFor(dive(95), DIVES);
        assert.equal(s.reason, 'chained');
        assert.deepEqual(s.chain.map(c => c.dive.source.diveNumber), [92, 93, 94]);
        for (const c of s.chain) assert.ok(c.surfaceIntervalMin > 0, `interval after #${c.dive.source.diveNumber}`);
        assert.equal(Object.keys(s.initialTissuePressures).length, 16);
    });

    test('the next morning still carries nitrogen from the day before', () => {
        const s = startStateFor(dive(96), DIVES);
        assert.equal(s.reason, 'chained');
        assert.deepEqual(s.chain.map(c => c.dive.source.diveNumber), [92, 93, 94, 95]);
        const overnight = s.chain.at(-1).surfaceIntervalMin;
        assert.ok(overnight > 12 * 60 && overnight < 18 * 60, `${overnight} min`);
    });

    test('a dive with an unreliable clock never chains', () => {
        const s = startStateFor(dive(99), DIVES);
        assert.equal(s.initialTissuePressures, null);
        assert.equal(s.reason, 'unreliable-date');
    });

    test('a dive with an unreliable clock is skipped by later dives', () => {
        const chain = startStateFor(dive(101), DIVES).chain.map(c => c.dive.source.diveNumber);
        assert.ok(!chain.includes(99));
    });

    test('weeks between dives start fresh and report the gap', () => {
        const s = startStateFor(dive(100), DIVES);
        assert.equal(s.initialTissuePressures, null);
        assert.equal(s.reason, 'long-gap');
        assert.ok(s.previousGapMin > 60 * 24 * 60, `${s.previousGapMin} min`);
    });

    test('a second dive later the same day chains with the first', () => {
        const s = startStateFor(dive(101), DIVES);
        assert.equal(s.reason, 'chained');
        assert.deepEqual(s.chain.map(c => c.dive.source.diveNumber), [100]);
    });

    test('a few days of surface time let the tissues settle', () => {
        const later = movedTo(dive(101), '2026-10-02T10:00:00');
        const s = startStateFor(later, [dive(100), later]);
        assert.equal(s.initialTissuePressures, null);
        assert.equal(s.reason, 'settled');
    });

    test('overlapping clocks break the chain', () => {
        const overlapping = movedTo(dive(101), '2026-09-27T12:10:00');
        const s = startStateFor(overlapping, [dive(100), overlapping]);
        assert.equal(s.initialTissuePressures, null);
        assert.equal(s.reason, 'clock-overlap');
    });

    test('a non-open-circuit dive breaks the chain', () => {
        const ccr = { ...dive(100), mode: 'ccr' };
        const s = startStateFor(dive(101), [ccr, dive(101)]);
        assert.equal(s.initialTissuePressures, null);
        assert.equal(s.reason, 'not-chainable');
    });

    test('after hours at the surface only the slow tissues still carry nitrogen', () => {
        const start = startStateFor(dive(101), DIVES).initialTissuePressures;
        const fresh = getInitialTissueN2(prepareRecordedSetup(dive(101)).setup.gases[0].n2, dive(101).environment.surfacePressure);
        assert.ok(Math.abs(start[1] - fresh) < 1e-4, `compartment 1: ${start[1]} vs ${fresh}`);
        assert.ok(start[16] > fresh + 0.03, `compartment 16: ${start[16]} vs ${fresh}`);
    });

    test('a short surface interval raises the peak GF of the repetitive dive', () => {
        const quick = movedTo(dive(101), '2026-09-27T13:13:00'); // about 20 min after #100 surfaced
        const state = startStateFor(quick, [dive(100), quick]);
        assert.equal(state.reason, 'chained');
        const chained = peakGf(quick, state);
        const fresh = peakGf(quick, null);
        assert.ok(chained > fresh + 0.1, `chained ${chained} vs fresh ${fresh}`);
    });

    test('a fresh start reproduces the unchained analysis exactly', () => {
        const { setup } = prepareRecordedSetup(dive(100));
        const plain = summarizeRecordedDive(analyzeRecordedDive(setup));
        const viaNull = summarizeRecordedDive(analyzeRecordedDive({ ...setup, initialTissuePressures: null }));
        assert.deepEqual(viaNull, plain);
    });
});
