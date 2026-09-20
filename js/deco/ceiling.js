/**
 * Decompression Model — first-stop search and ceiling time series.
 *
 * Extracted verbatim from js/decoModel.js; js/decoModel.js re-exports the
 * public surface so existing importers are unaffected.
 */

import { COMPARTMENTS } from '../tissueCompartments.js';
import { ASCENT_SPEED, N2_FRACTION, PRESSURE_PER_METER, STOP_INCREMENT, SURFACE_PRESSURE } from './constants.js';
import { getAmbientPressure } from './environment.js';
import { simulateDepthChange } from './gasKinetics.js';
import { getCompartmentCeiling, getDiveCeiling, interpolateGF } from './gradients.js';

/**
 * Find the first decompression stop per the Baker GF convention.
 *
 * Returns the shallowest stop-grid depth where the dive ceiling at GF_low
 * (max ceiling across all 16 compartments) is satisfied AFTER simulating
 * the actual ascent from currentDepth to that depth (with Schreiner integration
 * and gas switches if applicable). This depth is also the GF-ramp anchor:
 * GF = GF_low at and below it, ramps to GF_high at the surface.
 *
 * @param {Object} tissuePressures - Map of compartment ID to tissue pressure (bar)
 * @param {number} currentDepth - Depth at which ascent begins (meters)
 * @param {number} n2Fraction - Inert-gas fraction of the current breathing gas
 * @param {number} gfLow - GF Low (0-1)
 * @param {number} stopIncrement - Stop-grid increment in meters (default 3 m;
 *                                  use 0.1 m for a continuous-mode visualization)
 * @param {number} ascentRate - Ascent speed (m/min)
 * @param {Array|null} gasSwitchPoints - Optional gas switch points
 * @returns {{anchorDepth: number, pAnchor: number, tissuesAtAnchor: Object}}
 */
export function findFirstStopAtGFLow(
    tissuePressures, currentDepth, n2Fraction, gfLow,
    stopIncrement = STOP_INCREMENT, ascentRate = ASCENT_SPEED, gasSwitchPoints = null,
    surfacePressure = SURFACE_PRESSURE, recordDecision = null,
    pressurePerMeter = PRESSURE_PER_METER
) {
    const safeGases = gasSwitchPoints && gasSwitchPoints.length > 0 ? gasSwitchPoints : null;
    let anchorDepth = currentDepth;
    let tissuesAtAnchor = { ...tissuePressures };
    for (let candidate = 0; candidate <= currentDepth + 1e-9; candidate += stopIncrement) {
        let simTissues;
        if (safeGases) {
            simTissues = _simulateAscentWithGasSwitches(
                tissuePressures, currentDepth, candidate, n2Fraction, safeGases,
                surfacePressure, pressurePerMeter
            );
        } else {
            const ascentTime = (currentDepth - candidate) / ascentRate;
            simTissues = ascentTime > 0
                ? simulateDepthChange(
                    { ...tissuePressures }, currentDepth, candidate, ascentTime,
                    n2Fraction, surfacePressure, pressurePerMeter
                )
                : { ...tissuePressures };
        }
        const { ceilingDepth, controllingCompartment } =
            getDiveCeiling(
                simTissues, gfLow, surfacePressure, pressurePerMeter
            );
        const accepted = ceilingDepth <= candidate + 1e-9;
        recordDecision?.('anchor-check', {
            candidateDepth: candidate,
            ceilingDepth,
            roundedCeilingDepth: Math.ceil((ceilingDepth - 1e-9) / stopIncrement) * stopIncrement,
            nextCandidateDepth: Math.min(currentDepth, candidate + stopIncrement),
            controllingCompartment,
            decision: accepted ? 'accept' : 'deeper'
        });
        if (accepted) {
            anchorDepth = candidate;
            tissuesAtAnchor = simTissues;
            break;
        }
    }
    const pAnchor = surfacePressure + anchorDepth * pressurePerMeter;
    return { anchorDepth, pAnchor, tissuesAtAnchor };
}

/**
 * Find the first staged stop using Decotengu's iterative 3 m ceiling steps.
 *
 * Each candidate is derived from the ceiling at the previously reached level.
 * This deliberately does not jump directly to the shallowest level that would
 * be safe after one long ascent, because a conventional staged schedule treats
 * every reached ceiling level as an active decompression level.
 */
export function findFirstStagedStopAtGFLow(
    tissuePressures, currentDepth, n2Fraction, gfLow,
    stopIncrement, ascentRate, gasSwitchPoints, surfacePressure,
    recordDecision = null, pressurePerMeter = PRESSURE_PER_METER
) {
    const ceilingState = (tissues) => {
        const { ceilingDepth, controllingCompartment } =
            getDiveCeiling(tissues, gfLow, surfacePressure, pressurePerMeter);
        const roundedCeilingDepth = Math.max(
            0,
            Math.min(
                currentDepth,
                Math.ceil((ceilingDepth - 1e-9) / stopIncrement) * stopIncrement
            )
        );
        return { ceilingDepth, roundedCeilingDepth, controllingCompartment };
    };
    const simulateTo = (targetDepth) => {
        if (gasSwitchPoints && gasSwitchPoints.length > 0) {
            return _simulateAscentWithGasSwitches(
                tissuePressures, currentDepth, targetDepth, n2Fraction,
                gasSwitchPoints, surfacePressure, pressurePerMeter
            );
        }
        const ascentTime = (currentDepth - targetDepth) / ascentRate;
        return ascentTime > 0
            ? simulateDepthChange(
                tissuePressures, currentDepth, targetDepth, ascentTime,
                n2Fraction, surfacePressure, pressurePerMeter
            )
            : { ...tissuePressures };
    };

    const initialCeiling = ceilingState(tissuePressures);
    let anchorDepth = initialCeiling.roundedCeilingDepth;
    let tissuesAtAnchor = simulateTo(anchorDepth);
    recordDecision?.('anchor-candidate', {
        ceilingDepth: initialCeiling.ceilingDepth,
        roundedCeilingDepth: anchorDepth,
        controllingCompartment: initialCeiling.controllingCompartment
    });

    while (anchorDepth > 0) {
        const arrivalCeiling = ceilingState(tissuesAtAnchor);
        const nextDepth = arrivalCeiling.roundedCeilingDepth;
        const accepted = nextDepth >= anchorDepth - 1e-9;
        recordDecision?.('anchor-check', {
            candidateDepth: anchorDepth,
            ceilingDepth: arrivalCeiling.ceilingDepth,
            roundedCeilingDepth: nextDepth,
            nextCandidateDepth: nextDepth,
            controllingCompartment: arrivalCeiling.controllingCompartment,
            decision: accepted ? 'accept' : 'shallower'
        });
        if (accepted) break;
        anchorDepth = nextDepth;
        tissuesAtAnchor = simulateTo(anchorDepth);
    }

    return {
        anchorDepth,
        pAnchor: surfacePressure + anchorDepth * pressurePerMeter,
        tissuesAtAnchor
    };
}

/**
 * Calculate the first stop depth using constant GF Low (no ramp, no ascent simulation).
 *
 * Static lookup: rounds the current dive ceiling at GF_low up to the stop grid.
 * The deco scheduler uses {@link findFirstStopAtGFLow} instead, which simulates
 * the actual ascent so Schreiner-during-ascent loading is accounted for.
 *
 * @param {Object} tissuePressures - Map of compartment ID to tissue pressure (bar)
 * @param {number} gfLow - GF Low value (0-1)
 * @param {number} stopIncrement - Stop depth increment in meters (default 3m)
 * @returns {{depth: number, ambient: number, controllingCompartment: number}}
 */
export function getFirstStopDepth(
    tissuePressures,
    gfLow,
    stopIncrement = 3,
    surfacePressure = SURFACE_PRESSURE,
    pressurePerMeter = PRESSURE_PER_METER
) {
    const { ceilingDepth, controllingCompartment } = getDiveCeiling(
        tissuePressures, gfLow, surfacePressure, pressurePerMeter
    );
    
    // Round up to next stop increment
    const stopDepth = Math.ceil(ceilingDepth / stopIncrement) * stopIncrement;
    
    return {
        depth: stopDepth,
        ambient: getAmbientPressure(
            stopDepth, surfacePressure, pressurePerMeter
        ),
        controllingCompartment
    };
}

/**
 * Simulate ascent with gas switches - used to accurately predict tissue state
 * when ascending through depths where gas changes occur.
 * @param {Object} tissuePressures - Starting tissue pressures
 * @param {number} fromDepth - Starting depth (meters)
 * @param {number} toDepth - Target depth (meters, must be <= fromDepth)
 * @param {number} startN2 - N2 fraction of initial gas
 * @param {Array} gasSwitchPoints - [{switchDepth, n2}] sorted deepest first
 * @returns {Object} Simulated tissue pressures after ascent
 */
function _simulateAscentWithGasSwitches(
    tissuePressures, fromDepth, toDepth, startN2, gasSwitchPoints,
    surfacePressure = SURFACE_PRESSURE,
    pressurePerMeter = PRESSURE_PER_METER
) {
    let tissues = { ...tissuePressures };
    let currentDepth = fromDepth;
    let currentN2 = startN2;

    // Get switch points between fromDepth and toDepth, sorted deep to shallow
    const relevantSwitches = gasSwitchPoints
        .filter(sp => sp.switchDepth < currentDepth && sp.switchDepth >= toDepth)
        .sort((a, b) => b.switchDepth - a.switchDepth);

    // Ascend through each gas switch segment
    for (const sp of relevantSwitches) {
        const segmentTime = (currentDepth - sp.switchDepth) / ASCENT_SPEED;
        if (segmentTime > 0) {
            tissues = simulateDepthChange(
                tissues, currentDepth, sp.switchDepth, segmentTime, currentN2,
                surfacePressure, pressurePerMeter
            );
        }
        currentDepth = sp.switchDepth;
        currentN2 = sp.n2;
    }

    // Final segment to target depth
    if (currentDepth > toDepth) {
        const segmentTime = (currentDepth - toDepth) / ASCENT_SPEED;
        tissues = simulateDepthChange(
            tissues, currentDepth, toDepth, segmentTime, currentN2,
            surfacePressure, pressurePerMeter
        );
    }

    return tissues;
}

/**
 * Calculate ceiling depth at each time point from tissue loading results
 * Uses GF interpolation: GF Low at/below first stop, GF High at surface,
 * linearly interpolated during ascent.
 * 
 * @param {Object} results - Results from calculateTissueLoading()
 * @param {number} gfLow - GF Low value (0-1, where 1 = 100%)
 * @param {number} gfHigh - GF High value (0-1, where 1 = 100%)
 * @param {number|null} [providedPAnchor=null] - Pre-computed scheduler anchor
 * @returns {number[]} Array of ceiling depths in meters at each time point
 */
export function calculateCeilingTimeSeries(
    results, gfLow, gfHigh = gfLow, providedPAnchor = null
) {
    const { ceilingDepths } = calculateCeilingTimeSeriesDetailed(
        results, gfLow, gfHigh, providedPAnchor
    );
    return ceilingDepths;
}

/**
 * Calculate detailed ceiling data at each time point from tissue loading results
 * Returns both overall ceiling and per-compartment ceilings.
 * 
 * Uses pAnchor-based GF interpolation:
 * - Before ascent or when GF_max < GF_low: use GF Low
 * - At pAnchor (where GF_max = GF_low during ascent): begin GF ramp
 * - During ascent above pAnchor: interpolate toward GF High at surface
 * 
 * The pAnchor is computed ONCE (or supplied by the scheduler) and then held
 * fixed for the whole series. The GF is evaluated at the DIVER'S OWN ambient
 * pressure, whereas generateDecoSchedule evaluates it at the NEXT STOP'S
 * ambient pressure — so this series is one stop-step more conservative during
 * ascent, and it does not match the P-P corridor intersection during the
 * bottom phase. Both divergences are intentional and are documented in
 * wiki/Algo-06-Ceiling-Time-Series.md, "Three different ceilings".
 * 
 * @param {Object} results - Results from calculateTissueLoading()
 * @param {number} gfLow - GF Low value (0-1, where 1 = 100%)
 * @param {number} gfHigh - GF High value (0-1, where 1 = 100%)
 * @param {number} [providedPAnchor] - Pre-computed pAnchor from deco schedule (optional)
 * @returns {{ceilingDepths: number[], compartmentCeilings: Object, gfValues: number[], pAnchor: number}}
 *          ceilingDepths: overall ceiling at each time point
 *          compartmentCeilings: {compId: number[]} ceiling depth per compartment at each time point
 *          gfValues: GF used at each time point (for debugging)
 *          pAnchor: the GF Low anchor pressure used (bar)
 */
export function calculateCeilingTimeSeriesDetailed(results, gfLow, gfHigh = gfLow, providedPAnchor = null) {
    const ceilingDepths = [];
    const compartmentCeilings = {};
    const gfValues = [];
    const surfacePressure = results.surfacePressure ?? SURFACE_PRESSURE;
    const pressurePerMeter =
        results.pressurePerMeter ?? PRESSURE_PER_METER;
    
    // Initialize per-compartment ceiling arrays
    for (const compId of Object.keys(results.compartments)) {
        compartmentCeilings[compId] = [];
    }
    
    // Track state for pAnchor detection
    let maxDepthSeen = results.depthPoints[0];
    let previousDepth = results.depthPoints[0];
    let ascentStarted = false;
    let pAnchor = providedPAnchor;
    
    // Find max depth
    for (let i = 0; i < results.timePoints.length; i++) {
        if (results.depthPoints[i] > maxDepthSeen) {
            maxDepthSeen = results.depthPoints[i];
        }
    }
    
    // Find the LAST index where we're at max depth (start of ascent)
    // Use a small tolerance to handle floating point
    let ascentStartIndex = 0;
    const depthTolerance = 0.1; // meters
    for (let i = 0; i < results.timePoints.length; i++) {
        if (Math.abs(results.depthPoints[i] - maxDepthSeen) < depthTolerance) {
            ascentStartIndex = i;
        }
    }
    
    // If pAnchor is not provided, first apply the same direct-ascent GF High
    // decision as the scheduler. GF Low only defines an anchor after that fails.
    if (pAnchor === null) {
        const tissuesAtAscentStart = {};
        for (const compId of Object.keys(results.compartments)) {
            tissuesAtAscentStart[compId] = results.compartments[compId].pressures[ascentStartIndex];
        }
        const n2Fraction = results.n2Fractions ? results.n2Fractions[ascentStartIndex] : N2_FRACTION;
        const directAscent = evaluateDirectAscent(
            tissuesAtAscentStart, maxDepthSeen, n2Fraction, gfHigh,
            surfacePressure, pressurePerMeter
        );
        if (directAscent.ceilingDepth === 0) {
            pAnchor = surfacePressure;
        } else {
            ({ pAnchor } = findFirstStopAtGFLow(
                tissuesAtAscentStart, maxDepthSeen, n2Fraction, gfLow,
                STOP_INCREMENT, ASCENT_SPEED, null, surfacePressure, null,
                pressurePerMeter
            ));
        }
    }
    
    // Process each time point
    for (let i = 0; i < results.timePoints.length; i++) {
        const currentDepth = results.depthPoints[i];
        const currentAmbient = results.ambientPressures[i];
        
        // Get tissue pressures at this time point
        const tissuePressures = {};
        for (const compId of Object.keys(results.compartments)) {
            tissuePressures[compId] = results.compartments[compId].pressures[i];
        }
        
        // Detect start of ascent (depth decreasing from maximum)
        const isAscending = currentDepth < previousDepth;
        if (isAscending && !ascentStarted && currentDepth < maxDepthSeen) {
            ascentStarted = true;
        }
        
        // Determine which GF to use (pAnchor-based ramp)
        let gf;
        if (pAnchor <= surfacePressure + 1e-9) {
            gf = gfHigh;
        } else if (!ascentStarted || currentAmbient >= pAnchor) {
            // Not yet ascending or at/deeper than pAnchor: use GF Low
            gf = gfLow;
        } else {
            // During ascent above pAnchor: interpolate GF
            gf = interpolateGF(currentAmbient, pAnchor, gfLow, gfHigh, surfacePressure);
        }
        gfValues.push(gf);
        
        // Calculate ceiling for each compartment using the active GF
        let maxCeilingDepth = 0;
        for (const comp of COMPARTMENTS) {
            const tissueP = tissuePressures[comp.id];
            const ceilingPressure = getCompartmentCeiling(tissueP, comp.aN2, comp.bN2, gf);
            // Convert to depth (0 if can surface)
            const ceilingDepth = Math.max(
                0,
                (ceilingPressure - surfacePressure) / pressurePerMeter
            );
            compartmentCeilings[comp.id].push(ceilingDepth);
            if (ceilingDepth > maxCeilingDepth) {
                maxCeilingDepth = ceilingDepth;
            }
        }
        
        ceilingDepths.push(maxCeilingDepth);
        previousDepth = currentDepth;
    }
    
    return { ceilingDepths, compartmentCeilings, gfValues, pAnchor };
}

/**
 * Calculate No-Decompression Limit (NDL) for a given depth
 * NDL is the maximum bottom time where you can ascend directly to surface
 * without required decompression stops.
 * 
 * Uses binary search to find maximum time where ceiling = 0 (surface).
 * A no-decompression ascent is simulated to the surface on the bottom gas and
 * checked there with GF High, matching Decotengu's NDL-ascent convention.
 * 
 * @param {number} depth - Depth in meters
 * @param {number} n2Fraction - N2 fraction in gas (default 0.79 for air)
 * @param {number} gfHigh - GF High as decimal (0-1), applied at the surface
 * @param {Object.<string, number>|null} [initialTissuePressures] - Optional per-compartment
 *   N2 pressure (bar) to seed the descent start from (repetitive-dive pre-saturation);
 *   when null/omitted, starts from surface equilibrium (unchanged behaviour).
 * @returns {{ndl: number, ndlExact: number, ndlAtDepth: number, ndlAtDepthExact: number,
 *   controllingCompartment: number, descentTime: number}} `ndl` is the no-decompression
 *   limit as dive tables report it — the maximum bottom time measured from leaving the
 *   surface, descent included — so it can be compared with (or assigned to) a bottom time
 *   directly. `ndlAtDepth` is the same limit counted only from arrival at depth.
 */
export function evaluateDirectAscent(
    tissuePressures, depth, n2Fraction, gfHigh,
    surfacePressure = SURFACE_PRESSURE,
    pressurePerMeter = PRESSURE_PER_METER
) {
    const ascentTime = depth / ASCENT_SPEED;
    const surfacedTissues = ascentTime > 0
        ? simulateDepthChange(
            tissuePressures, depth, 0, ascentTime, n2Fraction,
            surfacePressure, pressurePerMeter
        )
        : { ...tissuePressures };
    return {
        tissues: surfacedTissues,
        ...getDiveCeiling(
            surfacedTissues, gfHigh, surfacePressure, pressurePerMeter
        )
    };
}
