/**
 * Analysis of a recorded dive at a chosen GF, and the numbers shown in the
 * analysis page's summary panel.
 *
 * The ceiling series is computed exactly as DiveProfileChart computes it
 * (same GF anchor), so the summary agrees with what the chart draws.
 */

import { calculateTissueLoading } from '../deco/profile.js';
import { calculateCeilingTimeSeries } from '../deco/ceiling.js';
import { calculateMaxGF } from '../deco/gradients.js';
import { calculateChartGFAnchor } from '../charts/chartTypes.js';
import {
    getDiveSetupWaypoints,
    getDiveSetupSurfacePressure,
    getDiveSetupPressurePerMeter,
} from '../diveSetup.js';

/** Depth shallower than ceiling minus this (m) counts as above the ceiling. */
export const CEILING_VIOLATION_TOLERANCE_M = 0.1;

/** A ceiling deeper than this (m) means a deco obligation. */
export const DECO_CEILING_THRESHOLD_M = 0.05;

/**
 * Run the engine over a prepared recorded-dive setup.
 *
 * @param {Object} setup - DiveSetup (gfLow/gfHigh in %)
 * @returns {{results: Object, ceilingDepths: number[]}} Tissue loading results
 *   (time in minutes) and the ceiling at each time point
 */
export function analyzeRecordedDive(setup) {
    const results = calculateTissueLoading(getDiveSetupWaypoints(setup), setup.surfaceInterval ?? 0, {
        gases: setup.gases,
        surfacePressure: getDiveSetupSurfacePressure(setup),
        pressurePerMeter: getDiveSetupPressurePerMeter(setup),
    });
    const { pAnchor } = calculateChartGFAnchor(setup, results);
    const ceilingDepths = calculateCeilingTimeSeries(results, setup.gfLow / 100, setup.gfHigh / 100, pAnchor);
    return { results, ceilingDepths };
}

function tissuesAt(results, index) {
    const pressures = {};
    for (const id of Object.keys(results.compartments)) {
        pressures[id] = results.compartments[id].pressures[index];
    }
    return pressures;
}

/**
 * Summarise an analysed recorded dive.
 *
 * @param {{results: Object, ceilingDepths: number[]}} analysis - From analyzeRecordedDive()
 * @returns {{
 *   peakGf: {value: number, compartment: number, t: number}|null,
 *   surfaceGfEnd: {value: number, compartment: number}|null,
 *   aboveCeiling: {seconds: number, worstM: number},
 *   deco: {maxCeiling: number, start: number, end: number}|null
 * }} GF as fractions of the M-value gradient; times in minutes
 */
export function summarizeRecordedDive({ results, ceilingDepths }) {
    const { timePoints, depthPoints, ambientPressures } = results;

    let peakGf = null;
    for (let i = 0; i < timePoints.length; i++) {
        const { gfMax, leadingCompartment } = calculateMaxGF(tissuesAt(results, i), ambientPressures[i]);
        if (leadingCompartment !== null && (!peakGf || gfMax > peakGf.value)) {
            peakGf = { value: gfMax, compartment: leadingCompartment, t: timePoints[i] };
        }
    }

    const last = timePoints.length - 1;
    const surface = last >= 0 ? calculateMaxGF(tissuesAt(results, last), results.surfacePressure) : null;
    const surfaceGfEnd = surface && surface.leadingCompartment !== null
        ? { value: surface.gfMax, compartment: surface.leadingCompartment }
        : null;

    let seconds = 0;
    let worstM = 0;
    for (let i = 1; i < timePoints.length; i++) {
        const shortfall = ceilingDepths[i] - depthPoints[i];
        if (shortfall > CEILING_VIOLATION_TOLERANCE_M) {
            seconds += (timePoints[i] - timePoints[i - 1]) * 60;
            worstM = Math.max(worstM, shortfall);
        }
    }

    let deco = null;
    for (let i = 0; i < timePoints.length; i++) {
        if (ceilingDepths[i] > DECO_CEILING_THRESHOLD_M) {
            if (!deco) deco = { maxCeiling: 0, start: timePoints[i], end: timePoints[i] };
            deco.maxCeiling = Math.max(deco.maxCeiling, ceilingDepths[i]);
            deco.end = timePoints[i];
        }
    }

    return { peakGf, surfaceGfEnd, aboveCeiling: { seconds: Math.round(seconds), worstM }, deco };
}
