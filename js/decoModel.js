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
 * Uses GF Low for the ceiling calculation (most conservative during bottom phase)
 * 
 * @param {Object} results - Results from calculateTissueLoading()
 * @param {number} gfLow - GF Low value (0-1, where 1 = 100%)
 * @returns {number[]} Array of ceiling depths in meters at each time point
 */
export function calculateCeilingTimeSeries(results, gfLow) {
    const ceilingDepths = [];
    
    for (let i = 0; i < results.timePoints.length; i++) {
        // Get tissue pressures at this time point
        const tissuePressures = {};
        for (const compId of Object.keys(results.compartments)) {
            tissuePressures[compId] = results.compartments[compId].pressures[i];
        }
        
        // Calculate ceiling using GF Low
        const { ceilingDepth } = getDiveCeiling(tissuePressures, gfLow);
        ceilingDepths.push(ceilingDepth);
    }
    
    return ceilingDepths;
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
        
        // Find the last waypoint at or before this time
        let activeWaypoint = profile[0];
        for (const wp of profile) {
            if (wp.time <= time) {
                activeWaypoint = wp;
            } else {
                break;
            }
        }
        
        // Get gas for this waypoint
        const gasId = activeWaypoint.gasId || gases[0].id;
        const gas = gases.find(g => g.id === gasId) || gases[0];
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

    // Track gas switches
    if (gases && gases.length > 0) {
        let currentGasId = profile[0].gasId || gases[0].id;
        for (let i = 1; i < profile.length; i++) {
            const wp = profile[i];
            const wpGasId = wp.gasId || gases[0].id;
            if (wpGasId !== currentGasId) {
                const gas = gases.find(g => g.id === wpGasId) || gases[0];
                results.gasSwitches.push({
                    time: wp.time,
                    depth: wp.depth,
                    gasName: gas.name,
                    gasId: wpGasId
                });
                currentGasId = wpGasId;
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
            let activeWaypoint = profile[0];
            for (const wp of profile) {
                if (wp.time <= currentTime) activeWaypoint = wp;
                else break;
            }
            const gasId = activeWaypoint.gasId || gases[0].id;
            const gas = gases.find(g => g.id === gasId) || gases[0];
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
