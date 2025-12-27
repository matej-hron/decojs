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

/** Fraction of nitrogen in breathing gas (air) */
export const N2_FRACTION = 0.79;

/** Pressure increase per meter of seawater depth */
export const PRESSURE_PER_METER = 0.1; // bar per meter

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
 * @returns {number} Alveolar N2 pressure in bar
 */
export function getAlveolarN2Pressure(ambientPressure) {
    return (ambientPressure - WATER_VAPOR_PRESSURE) * N2_FRACTION;
}

/**
 * Calculate initial tissue N2 pressure at surface (saturated at 1 atm)
 * @returns {number} Initial tissue N2 pressure in bar
 */
export function getInitialTissueN2() {
    return getAlveolarN2Pressure(SURFACE_PRESSURE);
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
// DIVE PROFILE PROCESSING
// ============================================================================

/**
 * Process a dive profile and calculate tissue loading over time
 * 
 * @param {Array<{time: number, depth: number}>} profile - Dive profile waypoints
 *        time in minutes, depth in meters
 * @param {number} surfaceInterval - Additional surface time after dive (minutes)
 * @returns {Object} Calculation results with time series data
 */
export function calculateTissueLoading(profile, surfaceInterval = 60) {
    if (!profile || profile.length < 2) {
        throw new Error("Profile must have at least 2 waypoints");
    }

    // Initialize results
    const results = {
        timePoints: [],      // Time in minutes
        depthPoints: [],     // Depth at each time point
        compartments: {}     // Tissue pressures per compartment
    };

    // Initialize compartment data
    COMPARTMENTS.forEach(comp => {
        results.compartments[comp.id] = {
            halfTime: comp.halfTime,
            label: comp.label,
            color: comp.color,
            pressures: []    // N2 pressure at each time point
        };
    });

    // Current tissue pressures (start at surface saturation)
    const currentPressures = {};
    const initialN2 = getInitialTissueN2();
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
    let waypointIndex = 0;

    while (currentTime <= totalTime) {
        // Find current segment (between which waypoints are we?)
        while (waypointIndex < profile.length - 1 && 
               profile[waypointIndex + 1].time <= currentTime) {
            waypointIndex++;
        }

        // Calculate current depth
        let currentDepth;
        if (currentTime >= lastWaypoint.time) {
            // Surface interval - at 0 meters
            currentDepth = 0;
        } else if (waypointIndex >= profile.length - 1) {
            // At or past last waypoint
            currentDepth = lastWaypoint.depth;
        } else {
            // Interpolate between waypoints
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

        // Store current state
        results.timePoints.push(currentTime);
        results.depthPoints.push(currentDepth);

        // Calculate tissue loading for each compartment
        COMPARTMENTS.forEach(comp => {
            results.compartments[comp.id].pressures.push(currentPressures[comp.id]);
        });

        // Calculate next time step
        const nextTime = currentTime + intervalMinutes;
        
        // Determine depth at next time step for rate calculation
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
            
            if (nextWaypointIndex >= profile.length - 1) {
                nextDepth = lastWaypoint.depth;
            } else {
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
        }

        // Update tissue pressures for next time step
        const currentAmbient = getAmbientPressure(currentDepth);
        const nextAmbient = getAmbientPressure(nextDepth);
        const currentAlveolar = getAlveolarN2Pressure(currentAmbient);
        
        // Rate of ambient pressure change (bar/min)
        const ambientRate = (nextAmbient - currentAmbient) / intervalMinutes;
        // Rate of alveolar pressure change
        const alveolarRate = ambientRate * N2_FRACTION;

        COMPARTMENTS.forEach(comp => {
            if (Math.abs(alveolarRate) < 0.0001) {
                // Constant depth - use Haldane equation
                currentPressures[comp.id] = haldaneEquation(
                    currentPressures[comp.id],
                    currentAlveolar,
                    intervalMinutes,
                    comp.halfTime
                );
            } else {
                // Depth change - use Schreiner equation
                currentPressures[comp.id] = schreinerEquation(
                    currentPressures[comp.id],
                    currentAlveolar,
                    alveolarRate,
                    intervalMinutes,
                    comp.halfTime
                );
            }
        });

        currentTime = nextTime;
    }

    return results;
}
