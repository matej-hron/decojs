/**
 * Decompression Model — full dive profile tissue loading.
 *
 * Extracted verbatim from js/decoModel.js; js/decoModel.js re-exports the
 * public surface so existing importers are unaffected.
 */

import { COMPARTMENTS } from '../tissueCompartments.js';
import { CALC_INTERVAL, N2_FRACTION, PRESSURE_PER_METER, SURFACE_PRESSURE } from './constants.js';
import { getAmbientPressure } from './environment.js';
import { getAlveolarN2Pressure, getInitialTissueN2, haldaneEquation, schreinerEquation } from './gasKinetics.js';

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
    const surfacePressure = options.surfacePressure ?? SURFACE_PRESSURE;
    const pressurePerMeter =
        options.pressurePerMeter ?? PRESSURE_PER_METER;
    
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
        compartments: {},     // Tissue pressures per compartment
        surfacePressure,      // Surface pressure used for this calculation
        pressurePerMeter      // Hydrostatic pressure increase per metre
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

    // Current tissue pressures. Default: surface saturation with the initial gas.
    // When options.initialTissuePressures is provided (repetitive-dive chaining),
    // seed each compartment from it instead.
    const currentPressures = {};
    const initialN2Fraction = getN2FractionAtTime(0);
    const initialN2 = getInitialTissueN2(initialN2Fraction, surfacePressure);
    const seededPressures = options.initialTissuePressures || null;
    COMPARTMENTS.forEach(comp => {
        currentPressures[comp.id] = seededPressures
            ? seededPressures[comp.id]
            : initialN2;
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
        if (currentTime > lastWaypoint.time) {
            // Surface interval - at 0 meters (AFTER the last waypoint)
            currentDepth = 0;
        } else if (currentTime === lastWaypoint.time) {
            // Exactly at last waypoint - use its depth
            currentDepth = lastWaypoint.depth;
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
        const currentN2Fraction = currentTime > lastWaypoint.time 
            ? N2_FRACTION  // Surface interval uses air (AFTER the last waypoint)
            : getN2FractionAtTime(currentTime);
        
        // Get current gas name for display
        let currentGasName = 'Air';
        if (gases && gases.length > 0 && currentTime <= lastWaypoint.time) {
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
        const ambientAtPoint = getAmbientPressure(
            currentDepth, surfacePressure, pressurePerMeter
        );
        results.ambientPressures.push(ambientAtPoint);
        results.alveolarN2Pressures.push(getAlveolarN2Pressure(ambientAtPoint, currentN2Fraction));
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
        if (nextTime > lastWaypoint.time) {
            // Surface interval - at 0 meters (AFTER the last waypoint)
            nextDepth = 0;
        } else if (nextTime === lastWaypoint.time) {
            // Exactly at last waypoint - use its depth
            nextDepth = lastWaypoint.depth;
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
        const currentAmbient = getAmbientPressure(
            currentDepth, surfacePressure, pressurePerMeter
        );
        const nextAmbient = getAmbientPressure(
            nextDepth, surfacePressure, pressurePerMeter
        );
        
        // Get N2 fraction for current and next time (handles gas switches)
        const stepN2Fraction = currentTime > lastWaypoint.time 
            ? N2_FRACTION  // Surface interval uses air (AFTER the last waypoint)
            : getN2FractionAtTime(currentTime);
        const nextN2Fraction = nextTime > lastWaypoint.time
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
