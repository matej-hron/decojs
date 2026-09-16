/**
 * Decompression Model — NDL and decompression schedule generation.
 *
 * Extracted verbatim from js/decoModel.js; js/decoModel.js re-exports the
 * public surface so existing importers are unaffected.
 */

import { COMPARTMENTS } from '../tissueCompartments.js';
import { ASCENT_SPEED, DESCENT_SPEED, N2_FRACTION, PRESSURE_PER_METER, STOP_INCREMENT, SURFACE_PRESSURE } from './constants.js';
import { DECISION_AUDIT_VERSION, DECO_MODES, DECO_STOP_MAX_MINUTES, DecoCapExceededError, getDecoMode } from './config.js';
import { getAmbientPressure } from './environment.js';
import { getAlveolarN2Pressure, getInitialTissueN2, haldaneEquation, schreinerEquation, simulateDepthChange, simulateDepthTime } from './gasKinetics.js';
import { getDiveCeiling, interpolateGF } from './gradients.js';
import { evaluateDirectAscent, findFirstStagedStopAtGFLow, findFirstStopAtGFLow } from './ceiling.js';

export function calculateNDL(
    depth, n2Fraction = N2_FRACTION, gfHigh = 1.0,
    initialTissuePressures = null, surfacePressure = SURFACE_PRESSURE,
    pressurePerMeter = PRESSURE_PER_METER
) {
    // Very shallow depths have effectively unlimited NDL
    if (depth <= 0) {
        return {
            ndl: Infinity, ndlExact: Infinity,
            ndlAtDepth: Infinity, ndlAtDepthExact: Infinity,
            controllingCompartment: null, descentTime: 0
        };
    }
    
    const ambientPressure = getAmbientPressure(
        depth, surfacePressure, pressurePerMeter
    );
    const alveolarN2 = getAlveolarN2Pressure(ambientPressure, n2Fraction);
    
    // Initialize tissue pressures at surface saturation
    const initialN2 = getInitialTissueN2(n2Fraction, surfacePressure);
    
    // Exact descent time at ASCENT_SPEED=20 m/min (matches decotengu/divetools)
    const descentTime = depth / DESCENT_SPEED;
    const surfaceAlveolarN2 = getAlveolarN2Pressure(surfacePressure, n2Fraction);
    const descentRate = (alveolarN2 - surfaceAlveolarN2) / descentTime;
    
    // Get tissue pressures after descent
    const afterDescent = {};
    COMPARTMENTS.forEach(comp => {
        const startN2 = initialTissuePressures ? initialTissuePressures[comp.id] : initialN2;
        afterDescent[comp.id] = schreinerEquation(
            startN2,
            surfaceAlveolarN2,
            descentRate,
            descentTime,
            comp.halfTime
        );
    });
    
    // Binary search for NDL
    let minTime = 0;
    let maxTime = 300; // 5 hours max
    
    // First check whether the descent alone already prevents a direct ascent.
    const { ceilingDepth: immediateceiling, controllingCompartment } =
        evaluateDirectAscent(
            afterDescent, depth, n2Fraction, gfHigh, surfacePressure,
            pressurePerMeter
        );
    if (immediateceiling > 0) {
        return {
            ndl: 0, ndlExact: 0,
            ndlAtDepth: 0, ndlAtDepthExact: 0,
            controllingCompartment,
            descentTime
        };
    }
    
    // Check if 5 hours is still within NDL (very shallow)
    const pressuresAt5Hours = {};
    COMPARTMENTS.forEach(comp => {
        pressuresAt5Hours[comp.id] = haldaneEquation(afterDescent[comp.id], alveolarN2, 300, comp.halfTime);
    });
    const { ceilingDepth: ceiling5h } =
        evaluateDirectAscent(
            pressuresAt5Hours, depth, n2Fraction, gfHigh, surfacePressure,
            pressurePerMeter
        );
    if (ceiling5h === 0) {
        return {
            ndl: Infinity, ndlExact: Infinity,
            ndlAtDepth: Infinity, ndlAtDepthExact: Infinity,
            controllingCompartment: null, descentTime
        };
    }
    
    // Sub-second precision keeps the exact threshold and the schedule branch
    // consistent for callers that compare arbitrary decimal runtimes.
    while (maxTime - minTime > 0.001) {
        const testTime = (minTime + maxTime) / 2;
        
        // Simulate time at depth
        const testPressures = {};
        COMPARTMENTS.forEach(comp => {
            testPressures[comp.id] = haldaneEquation(afterDescent[comp.id], alveolarN2, testTime, comp.halfTime);
        });
        
        // A candidate is within NDL when the simulated direct ascent reaches
        // the surface within GF High without any mandatory stop.
        const { ceilingDepth } =
            evaluateDirectAscent(
                testPressures, depth, n2Fraction, gfHigh, surfacePressure,
                pressurePerMeter
            );
        
        if (ceilingDepth > 0) {
            maxTime = testTime; // Needs deco, reduce time
        } else {
            minTime = testTime; // No deco, can go longer
        }
    }
    
    // Get controlling compartment at NDL
    const ndlPressures = {};
    COMPARTMENTS.forEach(comp => {
        ndlPressures[comp.id] = haldaneEquation(afterDescent[comp.id], alveolarN2, minTime, comp.halfTime);
    });
    const ndlAscent = evaluateDirectAscent(
        ndlPressures, depth, n2Fraction, gfHigh, surfacePressure,
        pressurePerMeter
    );
    
    // NDL is reported the way dive tables report it: as the maximum bottom time
    // measured from leaving the surface, i.e. the descent is already included.
    // Floor to whole minutes for conservative display.
    const ndlExact = descentTime + minTime;
    return {
        ndl: Math.floor(ndlExact),
        ndlExact,                       // Exact total, from the start of the dive
        ndlAtDepth: Math.floor(minTime),
        ndlAtDepthExact: minTime,       // Time at depth after the descent
        controllingCompartment: ndlAscent.controllingCompartment,
        descentTime
    };
}

/**
 * Generate a decompression schedule from current tissue state
 * Returns the stops needed to safely reach the surface.
 * 
 * Gas switch convention:
 * - When deco stops are required: switches occur on arrival at a stop depth,
 *   before waiting begins. The ceiling check during ascent uses the current gas;
 *   after arrival and switch, subsequent waiting uses the new gas.
 * - When no deco stops are required (NDL dive): switches occur mid-ascent at
 *   the gas's MOD (rounded to 3m grid). This allows using richer gases during
 *   ascent even without mandatory stops.
 * 
 * GF interpolation (pAnchor-based): The pAnchor is the ambient pressure during
 * ascent where GF_max first equals GF_low. The GF ramp runs from gfLow at pAnchor
 * to gfHigh at the surface. This is the correct Bühlmann + GF implementation.
 * 
 * @param {Object} tissuePressures - Current tissue pressures by compartment ID
 * @param {number} currentDepth - Current depth in meters (ascent start)
 * @param {number} n2Fraction - N2 fraction in current gas
 * @param {number} gfLow - GF Low (0-1)
 * @param {number} gfHigh - GF High (0-1)
 * @param {Array} [gases] - Available gases for switching [{id, n2, o2, name, mod}]
 * @param {Object} [options] - Additional options
 * @param {number} [options.switchPpO2=1.6] - ppO2 used to calculate gas switch depths (MOD)
 * @param {boolean} [options.audit=false] - Include structured decision events
 * @param {boolean} [options.alignRuntimeDepartures=false] - Align Standard-mode departures to whole absolute runtime minutes
 * @param {number} [options.runtimeStart] - Absolute runtime at the start of the ascent
 * @returns {{stops: Array<{depth: number, time: number, gas: string, departureRuntime?: number}>, gasSwitches: Array<{depth: number, gas: string, gasId: string}>, totalTime: number, totalAscentTime: number, pAnchor: number, anchorDepth: number, decisionAudit?: Object}}
 */
export function generateDecoSchedule(tissuePressures, currentDepth, n2Fraction, gfLow, gfHigh, gases = null, options = {}) {
    const { switchPpO2 = 1.6, gasSwitchTime = 0 } = options;
    const decoMode = getDecoMode(options);
    const surfacePressure = options.surfacePressure ?? SURFACE_PRESSURE;
    const pressurePerMeter =
        options.pressurePerMeter ?? PRESSURE_PER_METER;
    // Keep the existing sea-level MOD convention (nominal 1 bar), while
    // shifting it by the same pressure delta when altitude changes.
    const modSurfacePressure = options.modSurfacePressure
        ?? 1 + (surfacePressure - SURFACE_PRESSURE);

    const continuousDeco = decoMode === DECO_MODES.CONTINUOUS;
    const stopIncrement = continuousDeco ? 0.1 : STOP_INCREMENT;
    const timeIncrement = continuousDeco ? 0.1 : 1;
    const minimumStopTime = decoMode === DECO_MODES.STANDARD ? 1 : 0;
    const alignRuntimeDepartures = decoMode === DECO_MODES.STANDARD
        && options.alignRuntimeDepartures === true
        && Number.isFinite(options.runtimeStart);
    let scheduleRuntime = Number.isFinite(options.runtimeStart)
        ? options.runtimeStart
        : null;
    const decisionAudit = options.audit ? {
        version: DECISION_AUDIT_VERSION,
        mode: decoMode,
        startDepth: currentDepth,
        ...(scheduleRuntime !== null ? { runtimeStart: scheduleRuntime } : {}),
        gfLow,
        gfHigh,
        surfacePressure,
        events: []
    } : null;
    const recordDecision = (type, data) => {
        if (decisionAudit) {
            decisionAudit.events.push({
                type,
                ...(scheduleRuntime !== null ? { runtime: scheduleRuntime } : {}),
                ...data
            });
        }
    };

    const stops = [];
    const gasSwitches = []; // Track gas switches during ascent
    let totalAscentTime = 0;
    const advanceRuntime = (duration) => {
        if (scheduleRuntime !== null) {
            scheduleRuntime = Math.round((scheduleRuntime + duration) * 10) / 10;
        }
    };

    // Clone tissue pressures
    let tissues = { ...tissuePressures };
    let depth = currentDepth;
    let currentN2 = n2Fraction;
    // Use the bottom gas name if provided, otherwise default to 'Bottom Gas'
    let currentGasName = (gases && gases.length > 0) ? gases[0].name : 'Bottom Gas';
    
    // Helper to get a unique key for a gas (handles missing id)
    const gasKey = (g) => g.id ?? g.name;
    
    // Calculate gas switch depths (MOD at switchPpO2, rounded toward shallower on 3m grid)
    // Validates gas fractions and clamps switch depth to non-negative values
    const gasSwitchPoints = [];
    if (gases && gases.length > 1) {
        for (const gas of gases.slice(1)) {
            // Skip gases with invalid o2 fraction
            if (!gas.o2 || gas.o2 <= 0 || !Number.isFinite(gas.o2)) {
                continue;
            }
            // Skip gases with invalid n2 fraction
            if (!Number.isFinite(gas.n2) || gas.n2 < 0 || gas.n2 > 1) {
                continue;
            }
            // Skip gases where o2 + n2 > 1 (invalid mix, ignoring He for now)
            if (gas.o2 + gas.n2 > 1.001) {
                continue;
            }
            const mod =
                (switchPpO2 / gas.o2 - modSurfacePressure) /
                pressurePerMeter;
            // Skip if MOD calculation yields invalid result
            if (!Number.isFinite(mod)) {
                continue;
            }
            // Round MOD toward shallower (smaller depth = lower ppO2 = safe)
            // E.g., MOD=22m -> switchDepth=21m
            const switchDepth = Math.max(0, Math.floor(mod / stopIncrement) * stopIncrement);
            gasSwitchPoints.push({
                ...gas,
                switchDepth
            });
        }
        // Sort by switchDepth descending (deeper first) for iteration order
        gasSwitchPoints.sort((a, b) => b.switchDepth - a.switchDepth);
    }

    // Decotengu first attempts a direct ascent on bottom gas and checks the
    // surfaced tissues at GF High. Only a failed NDL ascent creates a GF Low
    // anchor and enters staged decompression.
    const directAscent = evaluateDirectAscent(
        tissuePressures, currentDepth, n2Fraction, gfHigh, surfacePressure,
        pressurePerMeter
    );
    recordDecision('direct-ascent', {
        gf: gfHigh,
        ceilingDepth: directAscent.ceilingDepth,
        controllingCompartment: directAscent.controllingCompartment,
        decision: directAscent.ceilingDepth === 0 ? 'surface' : 'decompression'
    });
    const firstStopResult = directAscent.ceilingDepth === 0
        ? {
            anchorDepth: 0,
            pAnchor: surfacePressure,
            tissuesAtAnchor: directAscent.tissues
        }
        : (decoMode === DECO_MODES.STANDARD
            ? findFirstStagedStopAtGFLow(
                tissuePressures, currentDepth, n2Fraction, gfLow, stopIncrement,
                ASCENT_SPEED, gasSwitchPoints.length > 0 ? gasSwitchPoints : null,
                surfacePressure, recordDecision, pressurePerMeter
            )
            : findFirstStopAtGFLow(
                tissuePressures, currentDepth, n2Fraction, gfLow, stopIncrement,
                ASCENT_SPEED, gasSwitchPoints.length > 0 ? gasSwitchPoints : null,
                surfacePressure, recordDecision, pressurePerMeter
            ));
    const {
        anchorDepth: firstStopFromGFLow,
        tissuesAtAnchor: tissuesAtStrictFirstStop
    } = firstStopResult;

    // Track used gases to avoid duplicate switches
    const usedGases = new Set();
    
    // Helper to switch to next best gas at depth (called on arrival at stop or switch point)
    // "Next best" means the gas with the deepest MOD (highest switchDepth) among eligible gases.
    // This ensures sequential gas switching: EAN50 at 21m before O2 at 6m.
    // NOTE: This is an N2-only model. For trimix (with He), selection logic would need
    // to consider both inert gas fractions and their respective half-times.
    const switchToBestGas = (atDepth, recordSwitch = true, phase = 'ascent') => {
        // Find all eligible gases: within MOD, lower N2 than current, not yet used
        const eligible = gasSwitchPoints.filter(gas => 
            atDepth <= gas.switchDepth && 
            gas.n2 < currentN2 && 
            !usedGases.has(gasKey(gas))
        );
        
        if (eligible.length === 0) {
            return false;
        }
        
        // Pick the gas with the deepest MOD (highest switchDepth) - ensures sequential switching
        // E.g., at 6m, if both EAN50 (MOD 21m) and O2 (MOD 6m) are eligible,
        // but EAN50 wasn't used yet, this picks EAN50 first.
        // gasSwitchPoints is already sorted by switchDepth descending, so eligible[0] is deepest
        const best = eligible.reduce((a, b) => (b.switchDepth > a.switchDepth ? b : a));
        const key = gasKey(best);
        
        currentN2 = best.n2;
        currentGasName = best.name;
        usedGases.add(key);
        if (recordSwitch) {
            gasSwitches.push({ depth: atDepth, gas: best.name, gasId: key });
            recordDecision('gas-switch', {
                depth: atDepth,
                gas: best.name,
                gasId: key,
                duration: gasSwitchTime,
                phase
            });
        }
        return true;
    };
    
    // Per Baker convention, the GF ramp is anchored AT the first stop. At
    // ambient pressures >= pAnchor the active GF is clamped to GF_low; from
    // pAnchor up to the surface it ramps linearly to GF_high.
    const anchorDepth = firstStopFromGFLow;
    const pAnchor = surfacePressure + anchorDepth * pressurePerMeter;
    if (decisionAudit) {
        decisionAudit.anchorDepth = anchorDepth;
        decisionAudit.pAnchor = pAnchor;
    }
    let firstStopDepth = firstStopFromGFLow;
    let tissuesAtFirstStop = tissuesAtStrictFirstStop;
    
    // If no deco needed (first stop = 0), just ascend with mid-ascent gas switches
    // Note: In this path, gas switches occur at MOD (rounded to 3m) during continuous
    // ascent, not at stop depths (since there are no stops).
    // We iterate through unique switch depths and pick the best gas at each.
    if (firstStopDepth === 0) {
        // Get unique switch depths, sorted deepest first
        const uniqueSwitchDepths = [...new Set(gasSwitchPoints.map(g => g.switchDepth))]
            .sort((a, b) => b - a);
        
        let remainingDepth = depth;
        // Use tissuesAtFirstStop as starting point (already simulated ascent to surface)
        // But we need to re-simulate for gas switches at intermediate depths
        let currentTissues = { ...tissues };
        for (const switchDepth of uniqueSwitchDepths) {
            if (remainingDepth > switchDepth) {
                // Ascend to switch depth
                const segmentTime = (remainingDepth - switchDepth) / ASCENT_SPEED;
                currentTissues = simulateDepthChange(
                    currentTissues, remainingDepth, switchDepth, segmentTime,
                    currentN2, surfacePressure, pressurePerMeter
                );
                totalAscentTime += segmentTime;
                advanceRuntime(segmentTime);
                remainingDepth = switchDepth;
                // Switch to best gas at this depth
                if (switchToBestGas(switchDepth) && gasSwitchTime > 0) {
                    currentTissues = simulateDepthTime(
                        currentTissues, switchDepth, gasSwitchTime, currentN2,
                        surfacePressure, pressurePerMeter
                    );
                    advanceRuntime(gasSwitchTime);
                    let switchHoldTime = gasSwitchTime;
                    if (alignRuntimeDepartures) {
                        const alignmentWait = Math.round(
                            (Math.ceil(scheduleRuntime - 1e-9) - scheduleRuntime) * 10
                        ) / 10;
                        if (alignmentWait > 0) {
                            currentTissues = simulateDepthTime(
                                currentTissues, switchDepth, alignmentWait,
                                currentN2, surfacePressure, pressurePerMeter
                            );
                            switchHoldTime += alignmentWait;
                            advanceRuntime(alignmentWait);
                        }
                        const targetGF = interpolateGF(
                            getAmbientPressure(
                                0, surfacePressure, pressurePerMeter
                            ),
                            pAnchor, gfLow, gfHigh, surfacePressure
                        );
                        let targetCeiling = getDiveCeiling(
                            currentTissues, targetGF, surfacePressure,
                            pressurePerMeter
                        ).ceilingDepth;
                        while (targetCeiling > 0) {
                            currentTissues = simulateDepthTime(
                                currentTissues, switchDepth, 1,
                                currentN2, surfacePressure, pressurePerMeter
                            );
                            switchHoldTime += 1;
                            advanceRuntime(1);
                            if (switchHoldTime > DECO_STOP_MAX_MINUTES) {
                                throw new DecoCapExceededError(
                                    switchDepth, stops, DECO_STOP_MAX_MINUTES
                                );
                            }
                            targetCeiling = getDiveCeiling(
                                currentTissues, targetGF, surfacePressure,
                                pressurePerMeter
                            ).ceilingDepth;
                        }
                    }
                    stops.push({
                        depth: switchDepth,
                        time: Math.round(switchHoldTime * 10) / 10,
                        gas: currentGasName,
                        ...(alignRuntimeDepartures ? { departureRuntime: scheduleRuntime } : {})
                    });
                }
            }
        }
        // Final ascent to surface
        if (remainingDepth > 0) {
            const segmentTime = remainingDepth / ASCENT_SPEED;
            currentTissues = simulateDepthChange(
                currentTissues, remainingDepth, 0, segmentTime, currentN2,
                surfacePressure, pressurePerMeter
            );
            totalAscentTime += segmentTime;
            advanceRuntime(segmentTime);
        }
        const totalTime = totalAscentTime + stops.reduce((sum, s) => sum + s.time, 0);
        return {
            stops, gasSwitches, totalTime, totalAscentTime, pAnchor, anchorDepth,
            ...(decisionAudit ? { decisionAudit } : {})
        };
    }
    
    // Ascend to first stop WITH gas switches at MOD depths
    // Gas switches occur at the gas's MOD during ascent, not just at stop depths.
    // This ensures EAN50 is used from 21m even when first stop is at 6m.
    // Get unique switch depths between current depth and first stop, sorted deepest first
    const ascentSwitchDepths = [...new Set(gasSwitchPoints.map(g => g.switchDepth))]
        .filter(d => d < depth && d >= firstStopDepth)
        .sort((a, b) => b - a);  // deepest first
    
    let currentAscentDepth = depth;
    let currentTissues = { ...tissues };
    
    for (const switchDepth of ascentSwitchDepths) {
        if (currentAscentDepth > switchDepth) {
            // Ascend to switch depth
            const segmentTime = (currentAscentDepth - switchDepth) / ASCENT_SPEED;
            currentTissues = simulateDepthChange(
                currentTissues, currentAscentDepth, switchDepth, segmentTime,
                currentN2, surfacePressure, pressurePerMeter
            );
            totalAscentTime += segmentTime;
            advanceRuntime(segmentTime);
            currentAscentDepth = switchDepth;
            // Switch to best gas at this depth
            if (switchToBestGas(switchDepth) && gasSwitchTime > 0) {
                currentTissues = simulateDepthTime(
                    currentTissues, switchDepth, gasSwitchTime, currentN2,
                    surfacePressure, pressurePerMeter
                );
                advanceRuntime(gasSwitchTime);
                let switchHoldTime = gasSwitchTime;
                if (alignRuntimeDepartures) {
                    const alignmentWait = Math.round(
                        (Math.ceil(scheduleRuntime - 1e-9) - scheduleRuntime) * 10
                    ) / 10;
                    if (alignmentWait > 0) {
                        currentTissues = simulateDepthTime(
                            currentTissues, switchDepth, alignmentWait,
                            currentN2, surfacePressure, pressurePerMeter
                        );
                        switchHoldTime += alignmentWait;
                        advanceRuntime(alignmentWait);
                    }
                    const targetGF = interpolateGF(
                        getAmbientPressure(
                            firstStopDepth, surfacePressure, pressurePerMeter
                        ),
                        pAnchor, gfLow, gfHigh, surfacePressure
                    );
                    let targetCeiling = getDiveCeiling(
                        currentTissues, targetGF, surfacePressure,
                        pressurePerMeter
                    ).ceilingDepth;
                    while (targetCeiling > firstStopDepth) {
                        currentTissues = simulateDepthTime(
                            currentTissues, switchDepth, 1,
                            currentN2, surfacePressure, pressurePerMeter
                        );
                        switchHoldTime += 1;
                        advanceRuntime(1);
                        if (switchHoldTime > DECO_STOP_MAX_MINUTES) {
                            throw new DecoCapExceededError(
                                switchDepth, stops, DECO_STOP_MAX_MINUTES
                            );
                        }
                        targetCeiling = getDiveCeiling(
                            currentTissues, targetGF, surfacePressure,
                            pressurePerMeter
                        ).ceilingDepth;
                    }
                }
                stops.push({
                    depth: switchDepth,
                    time: Math.round(switchHoldTime * 10) / 10,
                    gas: currentGasName,
                    ...(alignRuntimeDepartures ? { departureRuntime: scheduleRuntime } : {})
                });
            }
        }
    }

    // Final segment to first stop
    if (currentAscentDepth > firstStopDepth) {
        const finalSegmentTime = (currentAscentDepth - firstStopDepth) / ASCENT_SPEED;
        currentTissues = simulateDepthChange(
            currentTissues, currentAscentDepth, firstStopDepth,
            finalSegmentTime, currentN2, surfacePressure, pressurePerMeter
        );
        totalAscentTime += finalSegmentTime;
        advanceRuntime(finalSegmentTime);
    }
    
    tissues = currentTissues;
    depth = firstStopDepth;
    
    // Standard staged schedules spend at least one minute at every active 3 m
    // decompression level, matching Decotengu's operational convention.
    // Study modes only wait when the tissue ceiling mathematically requires it.
    let pendingStopTime = 0; // accumulates wait time at current depth
    let levelDecision = null;

    while (depth > 0) {
        let switchTime = 0;
        if (switchToBestGas(depth, true, 'level') && gasSwitchTime > 0) {
            tissues = simulateDepthTime(
                tissues, depth, gasSwitchTime, currentN2, surfacePressure,
                pressurePerMeter
            );
            pendingStopTime += gasSwitchTime;
            advanceRuntime(gasSwitchTime);
            switchTime = gasSwitchTime;
        }

        if (!levelDecision) {
            levelDecision = {
                depth,
                gas: currentGasName,
                switchTime,
                mandatoryWait: 0,
                additionalWait: 0,
                alignmentWait: 0,
                initialCeilingDepth: null,
                initialControllingCompartment: null
            };
        } else {
            levelDecision.gas = currentGasName;
            levelDecision.switchTime += switchTime;
        }

        if (pendingStopTime < minimumStopTime) {
            const mandatoryWait = minimumStopTime - pendingStopTime;
            tissues = simulateDepthTime(
                tissues, depth, mandatoryWait, currentN2, surfacePressure,
                pressurePerMeter
            );
            pendingStopTime = minimumStopTime;
            advanceRuntime(mandatoryWait);
            levelDecision.mandatoryWait += mandatoryWait;
        }

        // Next candidate depth (one step shallower)
        const nextStopDepth = Math.max(0, Math.round((depth - stopIncrement) * 10) / 10);
        const delta = depth - nextStopDepth;
        const ascentTime = delta / ASCENT_SPEED;

        // Can-we-ascend check: the ceiling at the *destination* GF (one stop
        // shallower) must clear the destination depth. We do not credit Schreiner
        // off-gassing during the short ascent — we ask "would the current tissue
        // pressures be within the M-line at the next stop, under the next stop's
        // GF". This matches the decotengu convention.
        const gfThere = interpolateGF(
            getAmbientPressure(
                nextStopDepth, surfacePressure, pressurePerMeter
            ),
            pAnchor, gfLow, gfHigh, surfacePressure
        );
        const { ceilingDepth, controllingCompartment } =
            getDiveCeiling(
                tissues, gfThere, surfacePressure, pressurePerMeter
            );
        if (levelDecision.initialCeilingDepth === null) {
            levelDecision.initialCeilingDepth = ceilingDepth;
            levelDecision.initialControllingCompartment = controllingCompartment;
        }

        if (ceilingDepth <= nextStopDepth) {
            if (alignRuntimeDepartures) {
                const alignedRuntime = Math.ceil(scheduleRuntime - 1e-9);
                const alignmentWait = Math.round((alignedRuntime - scheduleRuntime) * 10) / 10;
                if (alignmentWait > 0) {
                    tissues = simulateDepthTime(
                        tissues, depth, alignmentWait, currentN2,
                        surfacePressure, pressurePerMeter
                    );
                    pendingStopTime = Math.round((pendingStopTime + alignmentWait) * 10) / 10;
                    levelDecision.alignmentWait =
                        Math.round((levelDecision.alignmentWait + alignmentWait) * 10) / 10;
                    advanceRuntime(alignmentWait);
                    continue;
                }
            }
            recordDecision('level-decision', {
                ...levelDecision,
                targetDepth: nextStopDepth,
                targetGF: gfThere,
                finalCeilingDepth: ceilingDepth,
                finalControllingCompartment: controllingCompartment,
                totalWait: pendingStopTime,
                decision: 'ascend'
            });
            // Can ascend. Record stop if we waited here.
            if (pendingStopTime > 0) {
                const roundedDepth = Math.round(depth * 10) / 10;
                const previousStop = stops[stops.length - 1];
                if (previousStop
                    && previousStop.depth === roundedDepth
                    && previousStop.gas === currentGasName) {
                    previousStop.time = Math.round(
                        (previousStop.time + pendingStopTime) * 10
                    ) / 10;
                    if (alignRuntimeDepartures) {
                        previousStop.departureRuntime = scheduleRuntime;
                    }
                } else {
                    stops.push({
                        depth: roundedDepth,
                        time: Math.round(pendingStopTime * 10) / 10,
                        gas: currentGasName,
                        ...(alignRuntimeDepartures ? { departureRuntime: scheduleRuntime } : {})
                    });
                }
                pendingStopTime = 0;
            }
            levelDecision = null;

            // Ascend to next depth
            tissues = simulateDepthChange(
                tissues, depth, nextStopDepth, ascentTime, currentN2,
                surfacePressure, pressurePerMeter
            );
            totalAscentTime += ascentTime;
            advanceRuntime(ascentTime);
            depth = nextStopDepth;
        } else {
            // Cannot ascend yet - wait at this depth
            tissues = simulateDepthTime(
                tissues, depth, timeIncrement, currentN2, surfacePressure,
                pressurePerMeter
            );
            pendingStopTime = Math.round((pendingStopTime + timeIncrement) * 10) / 10;
            advanceRuntime(timeIncrement);
            levelDecision.additionalWait =
                Math.round((levelDecision.additionalWait + timeIncrement) * 10) / 10;

            if (pendingStopTime > DECO_STOP_MAX_MINUTES) {
                throw new DecoCapExceededError(depth, stops, DECO_STOP_MAX_MINUTES);
            }
        }
    }
    
    const totalTime = totalAscentTime + stops.reduce((sum, s) => sum + s.time, 0);
    
    return {
        stops, gasSwitches, totalTime, totalAscentTime, pAnchor, anchorDepth,
        ...(decisionAudit ? { decisionAudit } : {})
    };
}

/**
 * Find the best decompression gas valid at given depth
 * Returns gas with lowest N2 fraction (fastest off-gassing) that's within MOD
 * 
 * @param {Array} gases - Available gases [{n2, o2, name}]
 * @param {number} depth - Current depth in meters
 * @param {number} maxPpO2 - Maximum ppO2 (default 1.6 for deco)
 * @returns {Object|null} Best gas or null if none valid
 */
function findBestDecoGas(
    gases,
    depth,
    maxPpO2 = 1.6,
    surfacePressure = SURFACE_PRESSURE,
    pressurePerMeter = PRESSURE_PER_METER
) {
    const ambientPressure = getAmbientPressure(
        depth, surfacePressure, pressurePerMeter
    );
    
    // Filter gases valid at this depth and sort by N2 (lowest first)
    const validGases = gases
        .filter(gas => {
            const ppO2 = ambientPressure * gas.o2;
            return ppO2 <= maxPpO2;
        })
        .sort((a, b) => a.n2 - b.n2);
    
    return validGases[0] || null;
}
