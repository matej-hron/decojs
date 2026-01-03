/**
 * Decompression Model
 * 
 * Implements the Haldane equation (constant depth) and Schreiner equation
 * (linear depth change) for calculating nitrogen tissue loading.
 */

import { COMPARTMENTS, getRateConstant } from './tissueCompartments.js';

// ============================================================================
// CONFIGURATION - Easy to modify
// ============================================================================

/** Calculation interval in seconds */
export const CALC_INTERVAL = 10;

/** Surface atmospheric pressure in bar */
export const SURFACE_PRESSURE = 1.0;

/** Water vapor pressure at body temperature (37°C) in bar */
export const WATER_VAPOR_PRESSURE = 0.0627;

/** Default fraction of nitrogen in breathing gas (air) - used for backward compatibility */
export const N2_FRACTION = 0.79;

/** Pressure increase per meter of seawater depth */
export const PRESSURE_PER_METER = 0.1; // bar per meter

/** Default Gradient Factors (100% = use raw Bühlmann M-values) */
export const DEFAULT_GF_LOW = 1.0;   // 100%
export const DEFAULT_GF_HIGH = 1.0;  // 100%

// ============================================================================
// CORE CALCULATIONS
// ============================================================================

/**
 * Calculate ambient pressure at a given depth
 * @param {number} depth - Depth in meters
 * @returns {number} Ambient pressure in bar
 */
export function getAmbientPressure(depth) {
    return SURFACE_PRESSURE + (depth * PRESSURE_PER_METER);
}

/**
 * Calculate alveolar (inspired) nitrogen partial pressure
 * This is what the tissues are trying to equilibrate towards
 * 
 * @param {number} ambientPressure - Ambient pressure in bar
 * @param {number} [n2Fraction=N2_FRACTION] - Nitrogen fraction in breathing gas (0-1)
 * @returns {number} Alveolar N2 pressure in bar
 */
export function getAlveolarN2Pressure(ambientPressure, n2Fraction = N2_FRACTION) {
    return (ambientPressure - WATER_VAPOR_PRESSURE) * n2Fraction;
}

/**
 * Calculate initial tissue N2 pressure at surface (saturated at 1 atm)
 * @param {number} [n2Fraction=N2_FRACTION] - Nitrogen fraction in breathing gas (0-1)
 * @returns {number} Initial tissue N2 pressure in bar
 */
export function getInitialTissueN2(n2Fraction = N2_FRACTION) {
    return getAlveolarN2Pressure(SURFACE_PRESSURE, n2Fraction);
}

/**
 * Haldane Equation - for constant depth
 * 
 * P_t(t) = P_alv + (P_t0 - P_alv) * e^(-kt)
 * 
 * @param {number} initialPressure - Initial tissue N2 pressure (P_t0) in bar
 * @param {number} alveolarPressure - Alveolar N2 pressure (P_alv) in bar
 * @param {number} time - Time at this depth in minutes
 * @param {number} halfTime - Compartment half-time in minutes
 * @returns {number} Final tissue N2 pressure in bar
 */
export function haldaneEquation(initialPressure, alveolarPressure, time, halfTime) {
    const k = getRateConstant(halfTime);
    return alveolarPressure + (initialPressure - alveolarPressure) * Math.exp(-k * time);
}

/**
 * Schreiner Equation - for linear depth change (ascent/descent)
 * 
 * P_t(t) = P_alv0 + R*(t - 1/k) - (P_alv0 - P_t0 - R/k) * e^(-kt)
 * 
 * @param {number} initialPressure - Initial tissue N2 pressure (P_t0) in bar
 * @param {number} initialAlveolarPressure - Initial alveolar N2 pressure (P_alv0) in bar
 * @param {number} rate - Rate of change of alveolar pressure (bar/min), positive=descent
 * @param {number} time - Time of the depth change in minutes
 * @param {number} halfTime - Compartment half-time in minutes
 * @returns {number} Final tissue N2 pressure in bar
 */
export function schreinerEquation(initialPressure, initialAlveolarPressure, rate, time, halfTime) {
    const k = getRateConstant(halfTime);
    const term1 = initialAlveolarPressure + rate * (time - 1/k);
    const term2 = (initialAlveolarPressure - initialPressure - rate/k) * Math.exp(-k * time);
    return term1 - term2;
}

// ============================================================================
// GRADIENT FACTORS & CEILING CALCULATIONS
// ============================================================================

/**
 * Calculate M-value (maximum tolerable tissue pressure) at given ambient pressure
 * Using Bühlmann formula: M = a + P_amb / b
 * 
 * @param {number} ambientPressure - Ambient pressure in bar
 * @param {number} a - Bühlmann 'a' coefficient (bar)
 * @param {number} b - Bühlmann 'b' coefficient (dimensionless)
 * @returns {number} Maximum tolerable tissue inert gas pressure in bar
 */
export function getMValue(ambientPressure, a, b) {
    return a + ambientPressure / b;
}

/**
 * Calculate GF-adjusted M-value at given ambient pressure
 * The adjusted M-value is a fraction of the way from ambient to raw M-value:
 * M_adjusted = P_amb + GF × (M_raw - P_amb)
 * 
 * @param {number} ambientPressure - Ambient pressure in bar
 * @param {number} a - Bühlmann 'a' coefficient (bar)
 * @param {number} b - Bühlmann 'b' coefficient (dimensionless)
 * @param {number} gf - Gradient factor (0-1, where 1 = 100% = raw M-value)
 * @returns {number} GF-adjusted maximum tolerable tissue pressure in bar
 */
export function getAdjustedMValue(ambientPressure, a, b, gf) {
    const mValue = getMValue(ambientPressure, a, b);
    return ambientPressure + gf * (mValue - ambientPressure);
}

/**
 * Calculate ceiling (minimum tolerable ambient pressure) for a single compartment
 * This is the shallowest depth where the tissue remains within GF-adjusted limits.
 * 
 * Derived by solving: P_tissue = P_amb + GF × (a + P_amb/b - P_amb)
 * for P_amb, giving: P_ceiling = b × (P_tissue - GF × a) / (b × (1 - GF) + GF)
 * 
 * @param {number} tissuePressure - Current tissue inert gas pressure in bar
 * @param {number} a - Bühlmann 'a' coefficient (bar)
 * @param {number} b - Bühlmann 'b' coefficient (dimensionless)
 * @param {number} gf - Gradient factor (0-1)
 * @returns {number} Minimum tolerable ambient pressure in bar (may be < SURFACE_PRESSURE)
 */
export function getCompartmentCeiling(tissuePressure, a, b, gf) {
    // P_ceiling = b × (P_tissue - GF × a) / (b × (1 - GF) + GF)
    const numerator = b * (tissuePressure - gf * a);
    const denominator = b * (1 - gf) + gf;
    return numerator / denominator;
}

/**
 * Calculate overall dive ceiling across all compartments
 * The ceiling is the maximum (deepest) of all individual compartment ceilings.
 * 
 * @param {Object} tissuePressures - Map of compartment ID to tissue pressure (bar)
 * @param {number} gf - Gradient factor to use (0-1)
 * @returns {{ceiling: number, ceilingDepth: number, controllingCompartment: number}}
 *          ceiling in bar, ceilingDepth in meters (0 if can surface), controlling compartment ID
 */
export function getDiveCeiling(tissuePressures, gf) {
    let maxCeiling = -Infinity;
    let controllingComp = null;
    
    for (const comp of COMPARTMENTS) {
        const tissueP = tissuePressures[comp.id];
        const ceiling = getCompartmentCeiling(tissueP, comp.aN2, comp.bN2, gf);
        if (ceiling > maxCeiling) {
            maxCeiling = ceiling;
            controllingComp = comp.id;
        }
    }
    
    // Ceiling can't be below surface (above water)
    const finalCeiling = Math.max(SURFACE_PRESSURE, maxCeiling);
    
    // Convert ceiling pressure to depth
    const ceilingDepth = Math.max(0, (finalCeiling - SURFACE_PRESSURE) / PRESSURE_PER_METER);
    
    return {
        ceiling: finalCeiling,
        ceilingDepth: ceilingDepth,
        controllingCompartment: controllingComp
    };
}

/**
 * Interpolate GF based on current depth between first stop and surface
 * At or below first stop: use GF Low
 * At surface: use GF High
 * Between: linear interpolation based on ambient pressure
 * 
 * @param {number} currentAmbient - Current ambient pressure in bar
 * @param {number} firstStopAmbient - Ambient pressure at first/deepest stop in bar
 * @param {number} gfLow - GF Low value (0-1)
 * @param {number} gfHigh - GF High value (0-1)
 * @returns {number} Interpolated GF (0-1)
 */
export function interpolateGF(currentAmbient, firstStopAmbient, gfLow, gfHigh) {
    // At or deeper than first stop: use GF Low
    if (currentAmbient >= firstStopAmbient) {
        return gfLow;
    }
    
    // At or above surface: use GF High
    if (currentAmbient <= SURFACE_PRESSURE) {
        return gfHigh;
    }
    
    // Linear interpolation between surface and first stop
    // fraction = 0 at surface, 1 at first stop
    const fraction = (currentAmbient - SURFACE_PRESSURE) / (firstStopAmbient - SURFACE_PRESSURE);
    return gfHigh + fraction * (gfLow - gfHigh);
}

/**
 * Calculate the first stop depth using GF Low
 * This establishes the deepest point of the GF line for interpolation.
 * 
 * @param {Object} tissuePressures - Map of compartment ID to tissue pressure (bar)
 * @param {number} gfLow - GF Low value (0-1)
 * @param {number} stopIncrement - Stop depth increment in meters (default 3m)
 * @returns {{depth: number, ambient: number, controllingCompartment: number}}
 */
export function getFirstStopDepth(tissuePressures, gfLow, stopIncrement = 3) {
    const { ceiling, ceilingDepth, controllingCompartment } = getDiveCeiling(tissuePressures, gfLow);
    
    // Round up to next stop increment
    const stopDepth = Math.ceil(ceilingDepth / stopIncrement) * stopIncrement;
    
    return {
        depth: stopDepth,
        ambient: getAmbientPressure(stopDepth),
        controllingCompartment
    };
}

/**
 * Calculate ceiling depth at each time point from tissue loading results
 * Uses GF interpolation: GF Low at/below first stop, GF High at surface,
 * linearly interpolated during ascent.
 * 
 * @param {Object} results - Results from calculateTissueLoading()
 * @param {number} gfLow - GF Low value (0-1, where 1 = 100%)
 * @param {number} gfHigh - GF High value (0-1, where 1 = 100%)
 * @returns {number[]} Array of ceiling depths in meters at each time point
 */
export function calculateCeilingTimeSeries(results, gfLow, gfHigh = gfLow) {
    const { ceilingDepths } = calculateCeilingTimeSeriesDetailed(results, gfLow, gfHigh);
    return ceilingDepths;
}

/**
 * Calculate detailed ceiling data at each time point from tissue loading results
 * Returns both overall ceiling and per-compartment ceilings.
 * Uses GF interpolation: GF Low at/below first stop, GF High at surface,
 * linearly interpolated during ascent.
 * 
 * @param {Object} results - Results from calculateTissueLoading()
 * @param {number} gfLow - GF Low value (0-1, where 1 = 100%)
 * @param {number} gfHigh - GF High value (0-1, where 1 = 100%)
 * @returns {{ceilingDepths: number[], compartmentCeilings: Object, gfValues: number[]}}
 *          ceilingDepths: overall ceiling at each time point
 *          compartmentCeilings: {compId: number[]} ceiling depth per compartment at each time point
 *          gfValues: GF used at each time point (for debugging)
 */
export function calculateCeilingTimeSeriesDetailed(results, gfLow, gfHigh = gfLow) {
    const ceilingDepths = [];
    const compartmentCeilings = {};
    const gfValues = [];
    
    // Initialize per-compartment ceiling arrays
    for (const compId of Object.keys(results.compartments)) {
        compartmentCeilings[compId] = [];
    }
    
    // Track first stop depth (calculated at start of ascent using GF Low)
    let firstStopAmbient = null;
    let previousDepth = results.depthPoints[0];
    
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
        
        // Calculate first stop using GF Low when we start ascending
        if (isAscending && firstStopAmbient === null) {
            const { ambient } = getFirstStopDepth(tissuePressures, gfLow);
            firstStopAmbient = ambient;
        }
        
        // Determine which GF to use
        let gf;
        if (firstStopAmbient === null || currentAmbient >= firstStopAmbient) {
            // Not yet ascending or at/deeper than first stop: use GF Low
            gf = gfLow;
        } else {
            // During ascent above first stop: interpolate GF
            gf = interpolateGF(currentAmbient, firstStopAmbient, gfLow, gfHigh);
        }
        gfValues.push(gf);
        
        // Calculate ceiling for each compartment
        let maxCeilingDepth = 0;
        for (const comp of COMPARTMENTS) {
            const tissueP = tissuePressures[comp.id];
            const ceilingPressure = getCompartmentCeiling(tissueP, comp.aN2, comp.bN2, gf);
            // Convert to depth (0 if can surface)
            const ceilingDepth = Math.max(0, (ceilingPressure - SURFACE_PRESSURE) / PRESSURE_PER_METER);
            compartmentCeilings[comp.id].push(ceilingDepth);
            if (ceilingDepth > maxCeilingDepth) {
                maxCeilingDepth = ceilingDepth;
            }
        }
        
        ceilingDepths.push(maxCeilingDepth);
        previousDepth = currentDepth;
    }
    
    return { ceilingDepths, compartmentCeilings, gfValues };
}

// ============================================================================
// NDL & DECO CALCULATIONS
// ============================================================================

/** Descent speed in m/min for NDL calculations */
const DESCENT_SPEED = 20;

/** Ascent speed in m/min for deco calculations */
const ASCENT_SPEED = 10;

/** Deco stop increment in meters */
const STOP_INCREMENT = 3;

/**
 * Calculate No-Decompression Limit (NDL) for a given depth
 * NDL is the maximum bottom time where you can ascend directly to surface
 * without required decompression stops.
 * 
 * Uses binary search to find maximum time where ceiling = 0 (surface).
 * NDL uses GF Low because that determines when the first stop is required.
 * 
 * @param {number} depth - Depth in meters
 * @param {number} n2Fraction - N2 fraction in gas (default 0.79 for air)
 * @param {number} gfLow - GF Low as decimal (0-1), determines first stop ceiling
 * @returns {{ndl: number, controllingCompartment: number}} NDL in minutes and limiting compartment
 */
export function calculateNDL(depth, n2Fraction = N2_FRACTION, gfLow = 1.0) {
    // Very shallow depths have effectively unlimited NDL
    if (depth <= 0) {
        return { ndl: Infinity, controllingCompartment: null };
    }
    
    const ambientPressure = getAmbientPressure(depth);
    const alveolarN2 = getAlveolarN2Pressure(ambientPressure, n2Fraction);
    
    // Initialize tissue pressures at surface saturation
    const initialN2 = getInitialTissueN2(n2Fraction);
    
    // Simulate descent to depth - use ceil() to match profile generation
    const descentTime = Math.ceil(depth / DESCENT_SPEED);
    const descentRate = (alveolarN2 - getAlveolarN2Pressure(SURFACE_PRESSURE, n2Fraction)) / descentTime;
    
    // Get tissue pressures after descent
    const afterDescent = {};
    COMPARTMENTS.forEach(comp => {
        afterDescent[comp.id] = schreinerEquation(
            initialN2,
            getAlveolarN2Pressure(SURFACE_PRESSURE, n2Fraction),
            descentRate,
            descentTime,
            comp.halfTime
        );
    });
    
    // Binary search for NDL
    let minTime = 0;
    let maxTime = 300; // 5 hours max
    
    // First check if we can surface immediately after descent
    // Use GF Low - this determines when first stop is needed
    const { ceilingDepth: immediateceiling } = getDiveCeiling(afterDescent, gfLow);
    if (immediateceiling > 0) {
        // Already in deco after descent (very deep dive)
        return { ndl: 0, controllingCompartment: getDiveCeiling(afterDescent, gfLow).controllingCompartment };
    }
    
    // Check if 5 hours is still within NDL (very shallow)
    const pressuresAt5Hours = {};
    COMPARTMENTS.forEach(comp => {
        pressuresAt5Hours[comp.id] = haldaneEquation(afterDescent[comp.id], alveolarN2, 300, comp.halfTime);
    });
    const { ceilingDepth: ceiling5h } = getDiveCeiling(pressuresAt5Hours, gfLow);
    if (ceiling5h === 0) {
        return { ndl: Infinity, controllingCompartment: null };
    }
    
    // Binary search with 0.1 min (6 second) precision
    while (maxTime - minTime > 0.1) {
        const testTime = (minTime + maxTime) / 2;
        
        // Simulate time at depth
        const testPressures = {};
        COMPARTMENTS.forEach(comp => {
            testPressures[comp.id] = haldaneEquation(afterDescent[comp.id], alveolarN2, testTime, comp.halfTime);
        });
        
        // Check ceiling using GF Low (first stop requirement)
        const { ceilingDepth } = getDiveCeiling(testPressures, gfLow);
        
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
    const { controllingCompartment } = getDiveCeiling(ndlPressures, gfLow);
    
    // Return NDL as bottom time (time at depth after descent)
    // Floor to whole minutes for conservative display, but actual value is minTime
    return {
        ndl: Math.floor(minTime),
        ndlExact: minTime,  // Exact value for debugging/comparison
        controllingCompartment,
        descentTime: Math.ceil(depth / DESCENT_SPEED)  // So caller knows total dive time = descentTime + ndl
    };
}

/**
 * Simulate tissue loading at constant depth
 * Helper function for deco calculations
 * 
 * @param {Object} tissuePressures - Current tissue pressures by compartment ID
 * @param {number} depth - Depth in meters
 * @param {number} time - Time in minutes
 * @param {number} n2Fraction - N2 fraction in gas
 * @returns {Object} Updated tissue pressures
 */
export function simulateDepthTime(tissuePressures, depth, time, n2Fraction) {
    const ambientPressure = getAmbientPressure(depth);
    const alveolarN2 = getAlveolarN2Pressure(ambientPressure, n2Fraction);
    
    const newPressures = {};
    COMPARTMENTS.forEach(comp => {
        newPressures[comp.id] = haldaneEquation(tissuePressures[comp.id], alveolarN2, time, comp.halfTime);
    });
    
    return newPressures;
}

/**
 * Simulate tissue loading during depth change
 * 
 * @param {Object} tissuePressures - Current tissue pressures
 * @param {number} startDepth - Starting depth in meters
 * @param {number} endDepth - Ending depth in meters
 * @param {number} time - Duration of the depth change in minutes
 * @param {number} n2Fraction - N2 fraction in gas
 * @returns {Object} Updated tissue pressures
 */
export function simulateDepthChange(tissuePressures, startDepth, endDepth, time, n2Fraction) {
    const startAlveolar = getAlveolarN2Pressure(getAmbientPressure(startDepth), n2Fraction);
    const endAlveolar = getAlveolarN2Pressure(getAmbientPressure(endDepth), n2Fraction);
    const rate = (endAlveolar - startAlveolar) / time;
    
    const newPressures = {};
    COMPARTMENTS.forEach(comp => {
        newPressures[comp.id] = schreinerEquation(tissuePressures[comp.id], startAlveolar, rate, time, comp.halfTime);
    });
    
    return newPressures;
}

/**
 * Generate a decompression schedule from current tissue state
 * Returns the stops needed to safely reach the surface
 * 
 * @param {Object} tissuePressures - Current tissue pressures by compartment ID
 * @param {number} currentDepth - Current depth in meters
 * @param {number} n2Fraction - N2 fraction in current gas
 * @param {number} gfLow - GF Low (0-1)
 * @param {number} gfHigh - GF High (0-1)
 * @param {Array} [gases] - Available gases for switching [{n2, o2, name, mod}]
 * @returns {{stops: Array<{depth: number, time: number, gas: string}>, totalTime: number, totalAscentTime: number}}
 */
export function generateDecoSchedule(tissuePressures, currentDepth, n2Fraction, gfLow, gfHigh, gases = null) {
    const stops = [];
    const gasSwitches = []; // Track gas switches during ascent
    let totalAscentTime = 0;
    
    // Clone tissue pressures
    let tissues = { ...tissuePressures };
    let depth = currentDepth;
    let currentN2 = n2Fraction;
    let currentGasName = 'Bottom Gas';
    
    // Calculate gas switch depths (MOD rounded down to 3m increments)
    const gasSwitchPoints = [];
    if (gases && gases.length > 1) {
        const decoGases = gases.slice(1).map(gas => ({
            ...gas,
            switchDepth: Math.floor((1.6 / gas.o2 - 1) * 10 / 3) * 3 // MOD rounded to 3m
        })).sort((a, b) => b.switchDepth - a.switchDepth); // Deeper first
        
        gasSwitchPoints.push(...decoGases);
    }
    
    // Track used gases to avoid duplicate switches
    const usedGases = new Set();
    
    // Helper to switch to best gas at depth
    const switchToBestGas = (atDepth, recordSwitch = true) => {
        for (const gas of gasSwitchPoints) {
            if (atDepth <= gas.switchDepth && gas.n2 < currentN2 && !usedGases.has(gas.id)) {
                currentN2 = gas.n2;
                currentGasName = gas.name;
                usedGases.add(gas.id);
                if (recordSwitch) {
                    gasSwitches.push({ depth: atDepth, gas: gas.name, gasId: gas.id });
                }
                return true;
            }
        }
        return false;
    };
    
    // Find first stop depth
    const { depth: firstStopDepth, ambient: firstStopAmbient } = getFirstStopDepth(tissues, gfLow);
    
    // If no deco needed (first stop = 0), just ascend (with gas switches)
    if (firstStopDepth === 0) {
        // Ascend with gas switches
        let remainingDepth = depth;
        for (const gas of gasSwitchPoints) {
            if (remainingDepth > gas.switchDepth && !usedGases.has(gas.id)) {
                // Ascend to switch depth
                const segmentTime = (remainingDepth - gas.switchDepth) / ASCENT_SPEED;
                tissues = simulateDepthChange(tissues, remainingDepth, gas.switchDepth, segmentTime, currentN2);
                totalAscentTime += segmentTime;
                remainingDepth = gas.switchDepth;
                // Switch gas
                if (gas.n2 < currentN2) {
                    currentN2 = gas.n2;
                    currentGasName = gas.name;
                    usedGases.add(gas.id);
                    gasSwitches.push({ depth: gas.switchDepth, gas: gas.name, gasId: gas.id });
                }
            }
        }
        // Final ascent to surface
        if (remainingDepth > 0) {
            const segmentTime = remainingDepth / ASCENT_SPEED;
            tissues = simulateDepthChange(tissues, remainingDepth, 0, segmentTime, currentN2);
            totalAscentTime += segmentTime;
        }
        return { stops: [], gasSwitches, totalTime: totalAscentTime, totalAscentTime };
    }
    
    // Ascend to first stop, switching gases at their MOD
    let remainingDepth = depth;
    for (const gas of gasSwitchPoints) {
        if (remainingDepth > gas.switchDepth && gas.switchDepth >= firstStopDepth && !usedGases.has(gas.id)) {
            // Ascend to switch depth
            const segmentTime = (remainingDepth - gas.switchDepth) / ASCENT_SPEED;
            tissues = simulateDepthChange(tissues, remainingDepth, gas.switchDepth, segmentTime, currentN2);
            totalAscentTime += segmentTime;
            remainingDepth = gas.switchDepth;
            // Switch gas
            if (gas.n2 < currentN2) {
                currentN2 = gas.n2;
                currentGasName = gas.name;
                usedGases.add(gas.id);
                gasSwitches.push({ depth: gas.switchDepth, gas: gas.name, gasId: gas.id });
            }
        }
    }
    // Finish ascent to first stop
    if (remainingDepth > firstStopDepth) {
        const segmentTime = (remainingDepth - firstStopDepth) / ASCENT_SPEED;
        tissues = simulateDepthChange(tissues, remainingDepth, firstStopDepth, segmentTime, currentN2);
        totalAscentTime += segmentTime;
    }
    depth = firstStopDepth;
    
    // Deco loop: work up from first stop to surface
    while (depth > 0) {
        // Check for gas switch (find best gas valid at this depth)
        switchToBestGas(depth);
        
        // Wait at this stop until ceiling clears to next stop (or surface)
        const nextStopDepth = Math.max(0, depth - STOP_INCREMENT);
        const ascentTime = STOP_INCREMENT / ASCENT_SPEED;
        
        // For ceiling check, use GF at the DESTINATION depth, not current depth
        const gfAtDestination = interpolateGF(getAmbientPressure(nextStopDepth), firstStopAmbient, gfLow, gfHigh);
        
        let stopTime = 0;
        
        while (true) {
            // Simulate ascent to check if we'd exceed M-value at destination
            const testTissues = simulateDepthChange({ ...tissues }, depth, nextStopDepth, ascentTime, currentN2);
            const { ceilingDepth } = getDiveCeiling(testTissues, gfAtDestination);
            
            if (ceilingDepth <= nextStopDepth) {
                break; // Ceiling cleared after simulated ascent, can actually ascend
            }
            
            // Wait 1 minute at this stop
            tissues = simulateDepthTime(tissues, depth, 1, currentN2);
            stopTime += 1;
            
            // Safety: prevent infinite loops
            if (stopTime > 300) {
                console.warn('Deco stop exceeded 5 hours, breaking');
                break;
            }
        }
        
        if (stopTime > 0) {
            stops.push({
                depth: depth,
                time: stopTime,
                gas: currentGasName
            });
        }
        
        // Ascend to next stop
        if (nextStopDepth >= 0) {
            tissues = simulateDepthChange(tissues, depth, nextStopDepth, ascentTime, currentN2);
            totalAscentTime += ascentTime;
            depth = nextStopDepth;
        }
    }
    
    const totalTime = totalAscentTime + stops.reduce((sum, s) => sum + s.time, 0);
    
    return { stops, gasSwitches, totalTime, totalAscentTime };
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
function findBestDecoGas(gases, depth, maxPpO2 = 1.6) {
    const ambientPressure = getAmbientPressure(depth);
    
    // Filter gases valid at this depth and sort by N2 (lowest first)
    const validGases = gases
        .filter(gas => {
            const ppO2 = ambientPressure * gas.o2;
            return ppO2 <= maxPpO2;
        })
        .sort((a, b) => a.n2 - b.n2);
    
    return validGases[0] || null;
}

// ============================================================================
// DIVE PROFILE PROCESSING
// ============================================================================

/**
 * Process a dive profile and calculate tissue loading over time
 * Supports multi-gas diving with gas switches at waypoints
 * 
 * @param {Array<{time: number, depth: number, gasId?: string}>} profile - Dive profile waypoints
 *        time in minutes, depth in meters, optional gasId for gas switches
 * @param {number} surfaceInterval - Additional surface time after dive (minutes)
 * @param {Object} options - Additional options
 * @param {Array<Object>} [options.gases] - Array of available gases with {id, name, o2, n2, he}
 * @param {number} [options.n2Fraction] - Legacy: single N2 fraction (used if gases not provided)
 * @returns {Object} Calculation results with time series data
 */
export function calculateTissueLoading(profile, surfaceInterval = 60, options = {}) {
    if (!profile || profile.length < 2) {
        throw new Error("Profile must have at least 2 waypoints");
    }

    // Handle gas configuration
    const gases = options.gases || null;
    const defaultN2Fraction = options.n2Fraction || N2_FRACTION;
    
    // Helper to get N2 fraction at a given time
    const getN2FractionAtTime = (time) => {
        if (!gases || gases.length === 0) {
            return defaultN2Fraction;
        }
        
        // Find the last gasId that was set at or before this time
        // Gas "sticks" until another gas switch occurs
        let currentGasId = gases[0].id;  // Start with first gas (typically air/bottom gas)
        for (const wp of profile) {
            if (wp.time <= time) {
                if (wp.gasId) {
                    currentGasId = wp.gasId;  // Update when we see an explicit gas switch
                }
            } else {
                break;
            }
        }
        
        const gas = gases.find(g => g.id === currentGasId) || gases[0];
        return gas.n2;
    };

    // Initialize results
    const results = {
        timePoints: [],       // Time in minutes
        depthPoints: [],      // Depth at each time point
        ambientPressures: [], // Ambient pressure at each time point
        alveolarN2Pressures: [], // Alveolar N2 pressure (what tissues equilibrate towards)
        n2Fractions: [],      // N2 fraction at each time point (for multi-gas)
        gasNames: [],         // Gas name at each time point
        gasSwitches: [],      // Array of {time, depth, gasName} for gas switch events
        compartments: {}      // Tissue pressures per compartment
    };

    // Track gas switches - only detect explicit gasId changes
    if (gases && gases.length > 0) {
        let currentGasId = profile[0].gasId || gases[0].id;
        for (let i = 1; i < profile.length; i++) {
            const wp = profile[i];
            // Only trigger switch if gasId is explicitly set AND different
            if (wp.gasId && wp.gasId !== currentGasId) {
                const prevGas = gases.find(g => g.id === currentGasId) || gases[0];
                const newGas = gases.find(g => g.id === wp.gasId) || gases[0];
                results.gasSwitches.push({
                    time: wp.time,
                    depth: wp.depth,
                    fromGasName: prevGas.name,
                    gasName: newGas.name,
                    gasId: wp.gasId
                });
                currentGasId = wp.gasId;
            }
        }
    }

    // Initialize compartment data
    COMPARTMENTS.forEach(comp => {
        results.compartments[comp.id] = {
            halfTime: comp.halfTime,
            label: comp.label,
            color: comp.color,
            pressures: []    // N2 pressure at each time point
        };
    });

    // Current tissue pressures (start at surface saturation with initial gas)
    const currentPressures = {};
    const initialN2Fraction = getN2FractionAtTime(0);
    const initialN2 = getInitialTissueN2(initialN2Fraction);
    COMPARTMENTS.forEach(comp => {
        currentPressures[comp.id] = initialN2;
    });

    // Calculate interval in minutes
    const intervalMinutes = CALC_INTERVAL / 60;

    // Get total dive time including surface interval
    const lastWaypoint = profile[profile.length - 1];
    const totalTime = lastWaypoint.time + surfaceInterval;

    // Process each time step
    let currentTime = 0;

    while (currentTime <= totalTime) {
        // Find current segment (between which waypoints are we?)
        let waypointIndex = 0;
        while (waypointIndex < profile.length - 1 && 
               profile[waypointIndex + 1].time <= currentTime) {
            waypointIndex++;
        }

        // Calculate current depth by interpolation
        let currentDepth;
        if (currentTime >= lastWaypoint.time) {
            // Surface interval - at 0 meters
            currentDepth = 0;
        } else {
            const wp1 = profile[waypointIndex];
            const wp2 = profile[waypointIndex + 1];
            const segmentDuration = wp2.time - wp1.time;
            const timeInSegment = currentTime - wp1.time;
            
            if (segmentDuration > 0) {
                const fraction = timeInSegment / segmentDuration;
                currentDepth = wp1.depth + fraction * (wp2.depth - wp1.depth);
            } else {
                currentDepth = wp1.depth;
            }
        }

        // Get current N2 fraction (may change at gas switches)
        const currentN2Fraction = currentTime >= lastWaypoint.time 
            ? N2_FRACTION  // Surface interval uses air
            : getN2FractionAtTime(currentTime);
        
        // Get current gas name for display
        let currentGasName = 'Air';
        if (gases && gases.length > 0 && currentTime < lastWaypoint.time) {
            // Find the last gasId that was set at or before this time
            let currentGasId = gases[0].id;
            for (const wp of profile) {
                if (wp.time <= currentTime) {
                    if (wp.gasId) currentGasId = wp.gasId;
                } else {
                    break;
                }
            }
            const gas = gases.find(g => g.id === currentGasId) || gases[0];
            currentGasName = gas.name;
        }

        // Store current state
        results.timePoints.push(currentTime);
        results.depthPoints.push(currentDepth);
        results.ambientPressures.push(getAmbientPressure(currentDepth));
        results.alveolarN2Pressures.push(getAlveolarN2Pressure(getAmbientPressure(currentDepth), currentN2Fraction));
        results.n2Fractions.push(currentN2Fraction);
        results.gasNames.push(currentGasName);

        // Calculate tissue loading for each compartment
        COMPARTMENTS.forEach(comp => {
            results.compartments[comp.id].pressures.push(currentPressures[comp.id]);
        });

        // Determine the next time step
        // Key fix: don't cross waypoint boundaries - step TO the waypoint first
        let nextTime = currentTime + intervalMinutes;
        
        // Check if we would cross a waypoint boundary
        const nextWaypointTime = (waypointIndex < profile.length - 1) 
            ? profile[waypointIndex + 1].time 
            : totalTime + 1;
        
        // If next regular step would cross a waypoint, step exactly to waypoint instead
        if (currentTime < nextWaypointTime && nextTime > nextWaypointTime) {
            nextTime = nextWaypointTime;
        }
        
        // Also handle stepping to end of dive
        if (currentTime < lastWaypoint.time && nextTime > lastWaypoint.time) {
            nextTime = lastWaypoint.time;
        }
        
        const stepDuration = nextTime - currentTime;
        
        // Calculate depth at next time step
        let nextDepth;
        if (nextTime >= lastWaypoint.time) {
            nextDepth = 0;
        } else {
            // Find segment for next time
            let nextWaypointIndex = waypointIndex;
            while (nextWaypointIndex < profile.length - 1 && 
                   profile[nextWaypointIndex + 1].time <= nextTime) {
                nextWaypointIndex++;
            }
            
            const wp1 = profile[nextWaypointIndex];
            const wp2 = profile[nextWaypointIndex + 1];
            const segmentDuration = wp2.time - wp1.time;
            const timeInSegment = nextTime - wp1.time;
            
            if (segmentDuration > 0) {
                const fraction = timeInSegment / segmentDuration;
                nextDepth = wp1.depth + fraction * (wp2.depth - wp1.depth);
            } else {
                nextDepth = wp1.depth;
            }
        }

        // Update tissue pressures for the step
        const currentAmbient = getAmbientPressure(currentDepth);
        const nextAmbient = getAmbientPressure(nextDepth);
        
        // Get N2 fraction for current and next time (handles gas switches)
        const stepN2Fraction = currentTime >= lastWaypoint.time 
            ? N2_FRACTION  // Surface interval uses air
            : getN2FractionAtTime(currentTime);
        const nextN2Fraction = nextTime >= lastWaypoint.time
            ? N2_FRACTION
            : getN2FractionAtTime(nextTime);
            
        const currentAlveolar = getAlveolarN2Pressure(currentAmbient, stepN2Fraction);
        
        // Rate of ambient pressure change (bar/min)
        const ambientRate = (nextAmbient - currentAmbient) / stepDuration;
        // Rate of alveolar pressure change (using average N2 fraction for the step)
        const avgN2Fraction = (stepN2Fraction + nextN2Fraction) / 2;
        const alveolarRate = ambientRate * avgN2Fraction;

        COMPARTMENTS.forEach(comp => {
            if (Math.abs(alveolarRate) < 0.0001) {
                // Constant depth - use Haldane equation
                currentPressures[comp.id] = haldaneEquation(
                    currentPressures[comp.id],
                    currentAlveolar,
                    stepDuration,
                    comp.halfTime
                );
            } else {
                // Depth change - use Schreiner equation
                currentPressures[comp.id] = schreinerEquation(
                    currentPressures[comp.id],
                    currentAlveolar,
                    alveolarRate,
                    stepDuration,
                    comp.halfTime
                );
            }
        });

        currentTime = nextTime;
    }

    return results;
}
