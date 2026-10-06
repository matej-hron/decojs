/**
 * Repetitive-dive chaining for recorded dives.
 *
 * A dive starts with whatever nitrogen the earlier dives left behind. Walking
 * the loaded dives in time order, each dive's end tissue state off-gasses over
 * the surface interval and becomes the next dive's start state. The chain
 * breaks (fresh start) when the tissues have settled back to surface
 * saturation, when the gap is longer than a week, when the clock cannot be
 * trusted, or when a dive cannot be modelled (not open circuit).
 */

import { COMPARTMENTS } from '../tissueCompartments.js';
import { calculateTissueLoading } from '../deco/profile.js';
import { getAlveolarN2Pressure, getInitialTissueN2, haldaneEquation } from '../deco/gasKinetics.js';
import {
    getDiveSetupWaypoints,
    getDiveSetupSurfacePressure,
    getDiveSetupPressurePerMeter,
} from '../diveSetup.js';
import { prepareRecordedSetup } from './recordedDive.js';

/** Hard limit (minutes): dives further apart than a week never chain. */
export const CHAIN_MAX_GAP_MIN = 7 * 24 * 60;

/** Tissues within this many bar of surface saturation count as settled. */
export const CHAIN_SETTLED_BAR = 0.01;

const MS_PER_MIN = 60000;

/** Device start time in ms. Start times carry no time zone, so all dives share the device clock. */
function startMs(dive) {
    return Date.parse(`${dive.start.local}Z`);
}

function hasReliableClock(dive) {
    return !dive.warnings.includes('implausible-date');
}

function hasProfile(dive) {
    return dive.samples.length >= 2;
}

function isModelled(dive) {
    return dive.mode === 'oc' || dive.mode === 'gauge';
}

/** Off-gas tissues at the surface for `minutes`, towards the same saturation a fresh start uses. */
function offGas(tissues, minutes, surfacePressure, n2Fraction) {
    const alveolar = getAlveolarN2Pressure(surfacePressure, n2Fraction);
    const result = {};
    for (const comp of COMPARTMENTS) {
        result[comp.id] = haldaneEquation(tissues[comp.id], alveolar, minutes, comp.halfTime);
    }
    return result;
}

function isSettled(tissues, setup) {
    const saturated = getInitialTissueN2(setup.gases[0].n2, getDiveSetupSurfacePressure(setup));
    return COMPARTMENTS.every(comp => Math.abs(tissues[comp.id] - saturated) < CHAIN_SETTLED_BAR);
}

/** Run one dive from `startTissues`; return its end tissues and end time. */
function runDive(dive, startTissues) {
    const { setup } = prepareRecordedSetup(dive);
    const results = calculateTissueLoading(getDiveSetupWaypoints(setup), 0, {
        gases: setup.gases,
        surfacePressure: getDiveSetupSurfacePressure(setup),
        pressurePerMeter: getDiveSetupPressurePerMeter(setup),
        initialTissuePressures: startTissues ?? undefined,
    });
    const last = results.timePoints.length - 1;
    const tissues = {};
    for (const comp of COMPARTMENTS) tissues[comp.id] = results.compartments[comp.id].pressures[last];
    return {
        tissues,
        endMs: startMs(dive) + results.timePoints[last] * MS_PER_MIN,
    };
}

/**
 * Work out the tissue state a recorded dive starts from, given the other loaded dives.
 *
 * @param {Object} target - RecordedDive to analyse
 * @param {Object[]} dives - All loaded RecordedDives (may include `target`)
 * @returns {{
 *   initialTissuePressures: Object|null,
 *   chain: Array<{dive: Object, surfaceIntervalMin: number}>,
 *   reason: 'chained'|'no-earlier-dive'|'long-gap'|'settled'|'clock-overlap'|'unreliable-date'|'not-chainable',
 *   previousGapMin: number|null
 * }} initialTissuePressures is null for a fresh start; chain lists the earlier
 *   dives carried over, oldest first, each with the surface interval after it
 */
export function startStateFor(target, dives) {
    const fresh = (reason, previousGapMin = null) => ({ initialTissuePressures: null, chain: [], reason, previousGapMin });
    if (!hasReliableClock(target)) return fresh('unreliable-date');

    const timeline = dives
        .filter(d => d === target || (hasReliableClock(d) && hasProfile(d)))
        .sort((a, b) => startMs(a) - startMs(b));
    const targetIndex = timeline.indexOf(target);
    if (targetIndex <= 0) return fresh('no-earlier-dive');

    const endMsByHeader = d => startMs(d) + d.duration * 1000;
    const previousGapMin = (startMs(target) - endMsByHeader(timeline[targetIndex - 1])) / MS_PER_MIN;
    if (!isModelled(target)) return fresh('not-chainable', previousGapMin);

    // Only dives after the last gap longer than the hard limit can matter.
    let first = targetIndex;
    while (first > 0 && (startMs(timeline[first]) - endMsByHeader(timeline[first - 1])) / MS_PER_MIN <= CHAIN_MAX_GAP_MIN) {
        first--;
    }
    if (first === targetIndex) return fresh('long-gap', previousGapMin);

    let state = null;
    let chain = [];
    let reason = 'no-earlier-dive';
    for (let i = first; i < targetIndex; i++) {
        const dive = timeline[i];
        if (!isModelled(dive)) {
            [state, chain, reason] = [null, [], 'not-chainable'];
            continue;
        }
        if (state) {
            const tissues = carryOver(state, dive);
            if (!tissues.ok) {
                [state, chain, reason] = [null, [], tissues.reason];
            } else {
                chain.at(-1).surfaceIntervalMin = tissues.gapMin;
                state = { ...state, tissues: tissues.tissues };
            }
        }
        state = runDive(dive, state?.tissues);
        chain.push({ dive, surfaceIntervalMin: null });
    }

    if (!state) return fresh(reason, previousGapMin);
    const carried = carryOver(state, target);
    if (!carried.ok) return fresh(carried.reason, previousGapMin);
    chain.at(-1).surfaceIntervalMin = carried.gapMin;
    return { initialTissuePressures: carried.tissues, chain, reason: 'chained', previousGapMin };
}

/** Off-gas `state` until `dive` starts; report whether anything is left to carry. */
function carryOver(state, dive) {
    const gapMin = (startMs(dive) - state.endMs) / MS_PER_MIN;
    if (gapMin < 0) return { ok: false, reason: 'clock-overlap' };
    if (gapMin > CHAIN_MAX_GAP_MIN) return { ok: false, reason: 'long-gap' };
    // Off-gas at the next dive's surface pressure: that is where the diver waits, and it makes
    // fast tissues converge to exactly the fresh-start state the engine would use for that dive.
    const setup = prepareRecordedSetup(dive).setup;
    const tissues = offGas(state.tissues, gapMin, getDiveSetupSurfacePressure(setup), setup.gases[0].n2);
    if (isSettled(tissues, setup)) return { ok: false, reason: 'settled' };
    return { ok: true, tissues, gapMin };
}
