/**
 * Dive Setup Module
 * 
 * Provides centralized dive configuration that can be shared across
 * different pages/sections. Supports loading from JSON and extending
 * with page-specific overrides.
 */

import { 
    calculateNDL, 
    generateDecoSchedule, 
    simulateDepthTime, 
    simulateDepthChange,
    getInitialTissueN2,
    N2_FRACTION,
    SURFACE_PRESSURE,
    getAmbientPressure
} from './decoModel.js';

import { COMPARTMENTS } from './tissueCompartments.js';

// Default path to dive setup JSON
const DEFAULT_SETUP_PATH = 'data/dive-setup.json';

// Cached dive setup
let cachedSetup = null;

/**
 * Time spent at gas switch depth (minutes)
 * Standard practice: 1-3 minutes to verify gas, take several breaths, signal buddy
 * Can be moved to UI settings later
 */
export const GAS_SWITCH_TIME = 3;

/**
 * Bottom gases - suitable for descent and bottom time
 * Larger MOD, used with back-mount cylinders
 */
export const BOTTOM_GASES = [
    { id: 'air', name: 'Air', o2: 0.21, n2: 0.79, he: 0 },
    { id: 'ean32', name: 'Nitrox 32 (EAN32)', o2: 0.32, n2: 0.68, he: 0 },
    { id: 'ean36', name: 'Nitrox 36 (EAN36)', o2: 0.36, n2: 0.64, he: 0 },
    { id: 'tx21_35', name: 'Trimix 21/35', o2: 0.21, n2: 0.44, he: 0.35 },
    { id: 'tx18_45', name: 'Trimix 18/45', o2: 0.18, n2: 0.37, he: 0.45 },
    { id: 'tx10_70', name: 'Trimix 10/70', o2: 0.10, n2: 0.20, he: 0.70 }
];

/**
 * Deco gases - high O2 for accelerated decompression
 * Shallow MOD, used with stage cylinders
 */
export const DECO_GASES = [
    { id: 'ean50', name: 'Nitrox 50 (EAN50)', o2: 0.50, n2: 0.50, he: 0 },
    { id: 'ean80', name: 'Nitrox 80 (EAN80)', o2: 0.80, n2: 0.20, he: 0 },
    { id: 'o2', name: 'Pure Oxygen (100%)', o2: 1.0, n2: 0, he: 0 }
];

/**
 * All predefined gases (combined for backward compatibility)
 */
export const PREDEFINED_GASES = [...BOTTOM_GASES, ...DECO_GASES];

/**
 * Bottom/back-mount cylinder sizes (liters)
 */
export const BOTTOM_CYLINDERS = [
    { value: 10, label: '10 L (Single)' },
    { value: 12, label: '12 L (Single)' },
    { value: 15, label: '15 L (Single)' },
    { value: 18, label: '18 L (Single)' },
    { value: 14, label: '2×7 L (Doubles)' },
    { value: 20, label: '2×10 L (Doubles)' },
    { value: 24, label: '2×12 L (Doubles)' }
];

/**
 * Stage/deco cylinder sizes (liters)
 */
export const STAGE_CYLINDERS = [
    { value: 3, label: '3 L (Pony)' },
    { value: 5.5, label: '5.5 L (AL40)' },
    { value: 7, label: '7 L (AL50)' },
    { value: 11, label: '11 L (AL80)' }
];

/**
 * Default start pressure for cylinders (bar)
 */
export const DEFAULT_START_PRESSURE = 200;

/**
 * Default reserve pressure (bar)
 */
export const DEFAULT_RESERVE_PRESSURE = 50;

/**
 * Default Gradient Factors (100% = raw Bühlmann M-values)
 */
export const DEFAULT_GF_LOW = 100;   // Percentage (100 = 100%)
export const DEFAULT_GF_HIGH = 100;  // Percentage (100 = 100%)

/**
 * Get a predefined gas by ID (searches both bottom and deco gases)
 * @param {string} id - Gas ID (e.g., 'air', 'ean32')
 * @returns {Object|null} Gas object or null if not found
 */
export function getPredefinedGas(id) {
    return PREDEFINED_GASES.find(g => g.id === id) || null;
}

/**
 * Get a bottom gas by ID
 * @param {string} id - Gas ID
 * @returns {Object|null} Gas object or null if not found
 */
export function getBottomGas(id) {
    return BOTTOM_GASES.find(g => g.id === id) || null;
}

/**
 * Get a deco gas by ID
 * @param {string} id - Gas ID
 * @returns {Object|null} Gas object or null if not found
 */
export function getDecoGas(id) {
    return DECO_GASES.find(g => g.id === id) || null;
}

/**
 * Load dive setup from localStorage first, then fall back to JSON file
 * @param {string} [path] - Path to JSON file (defaults to data/dive-setup.json)
 * @returns {Promise<Object>} Dive setup configuration
 */
export async function loadDiveSetup(path = DEFAULT_SETUP_PATH) {
    if (cachedSetup) {
        return cachedSetup;
    }
    
    // Try localStorage first
    const saved = loadSavedSetup();
    if (saved) {
        cachedSetup = saved;
        return cachedSetup;
    }
    
    // Fall back to JSON file
    try {
        const response = await fetch(path);
        if (!response.ok) {
            throw new Error(`Failed to load dive setup: ${response.status}`);
        }
        cachedSetup = await response.json();
        return cachedSetup;
    } catch (error) {
        console.error('Error loading dive setup:', error);
        // Return fallback default
        return getDefaultSetup();
    }
}

/**
 * Get default dive setup (fallback if JSON fails to load)
 * @returns {Object} Default dive setup
 */
export function getDefaultSetup() {
    return {
        name: "Example Decompression Dive",
        description: "A 40m dive with planned decompression stops.",
        gases: [
            {
                id: 'bottom',
                name: 'Air',
                o2: 0.21,
                n2: 0.79,
                he: 0,
                cylinderVolume: 12,
                startPressure: 200
            }
        ],
        reservePressure: 50,
        gfLow: 100,   // Gradient Factor Low (percentage)
        gfHigh: 100,  // Gradient Factor High (percentage)
        surfaceInterval: 60,
        units: {
            depth: "meters",
            time: "minutes",
            pressure: "bar"
        },
        dives: [
            {
                waypoints: [
                    { time: 0, depth: 0 },
                    { time: 2, depth: 40 },
                    { time: 22, depth: 40 },
                    { time: 26, depth: 9 },
                    { time: 29, depth: 9 },
                    { time: 30, depth: 6 },
                    { time: 35, depth: 6 },
                    { time: 36, depth: 3 },
                    { time: 41, depth: 3 },
                    { time: 42, depth: 0 }
                ]
            }
        ]
    };
}

/**
 * Generate a simple dive profile from max depth and bottom time
 * Uses:
 *   - Descent speed: 20 m/min
 *   - Ascent speed: 10 m/min
 *   - 3 min safety stop at 5m
 *   - Times rounded up to full minutes
 * 
 * Bottom time is measured from the START of the dive (time 0), not from
 * reaching the bottom. This matches how divers plan dives - "30 min bottom time"
 * means the ascent starts at minute 30.
 * 
 * @param {number} maxDepth - Maximum depth in meters
 * @param {number} bottomTime - Time from dive start until leaving max depth (minutes)
 * @returns {Array<{time: number, depth: number}>} Generated waypoints
 */
export function generateSimpleProfile(maxDepth, bottomTime) {
    const DESCENT_SPEED = 20; // m/min
    const ASCENT_SPEED = 10;  // m/min
    const SAFETY_STOP_DEPTH = 5; // meters
    const SAFETY_STOP_TIME = 3;  // minutes
    
    // Calculate descent time (rounded up)
    const descentTime = Math.ceil(maxDepth / DESCENT_SPEED);
    
    // Bottom time is from dive start, so we leave depth at bottomTime
    // (not descentTime + bottomTime)
    const bottomEndTime = bottomTime;
    
    // Ascent from max depth to safety stop depth
    const ascentToSafetyStop = Math.ceil((maxDepth - SAFETY_STOP_DEPTH) / ASCENT_SPEED);
    const safetyStopStartTime = bottomEndTime + ascentToSafetyStop;
    
    // Safety stop ends
    const safetyStopEndTime = safetyStopStartTime + SAFETY_STOP_TIME;
    
    // Final ascent from 5m to surface
    const finalAscentTime = Math.ceil(SAFETY_STOP_DEPTH / ASCENT_SPEED);
    const surfaceTime = safetyStopEndTime + finalAscentTime;
    
    return [
        { time: 0, depth: 0 },                           // Start at surface
        { time: descentTime, depth: maxDepth },          // Arrive at max depth
        { time: bottomEndTime, depth: maxDepth },        // End of bottom time (from dive start)
        { time: safetyStopStartTime, depth: SAFETY_STOP_DEPTH }, // Arrive at safety stop
        { time: safetyStopEndTime, depth: SAFETY_STOP_DEPTH },   // End of safety stop
        { time: surfaceTime, depth: 0 }                  // Back at surface
    ];
}

/**
 * Generate a dive profile with automatic NDL check and deco stops if needed
 * 
 * If bottom time <= NDL: generates profile with safety stop
 * If bottom time > NDL: generates profile with proper deco stops
 * 
 * Supports multi-gas diving: will switch to deco gases during ascent
 * when current depth is within the deco gas MOD.
 * 
 * @param {number} maxDepth - Maximum depth in meters
 * @param {number} bottomTime - Time from dive start until leaving max depth (minutes)
 * @param {Array} gases - Available gases [{id, name, o2, n2, he}]
 * @param {number} gfLow - GF Low as percentage (0-100)
 * @param {number} gfHigh - GF High as percentage (0-100)
 * @returns {{
 *   waypoints: Array<{time: number, depth: number, gasId?: string}>,
 *   ndl: number,
 *   requiresDeco: boolean,
 *   decoStops: Array<{depth: number, time: number, gas: string}>,
 *   totalDecoTime: number,
 *   controllingCompartment: number
 * }}
 */
export function generateDecoProfile(maxDepth, bottomTime, gases, gfLow, gfHigh) {
    const DESCENT_SPEED = 20; // m/min
    const ASCENT_SPEED = 10;  // m/min
    const SAFETY_STOP_DEPTH = 5;
    const SAFETY_STOP_TIME = 3;
    const STOP_INCREMENT = 3;
    
    // Convert GF percentages to decimals
    const gfLowDec = gfLow / 100;
    const gfHighDec = gfHigh / 100;
    
    // Get bottom gas (first gas or air)
    const bottomGas = gases && gases.length > 0 ? gases[0] : { id: 'air', name: 'Air', o2: 0.21, n2: 0.79 };
    
    // Calculate NDL for this depth/gas
    const { ndl, controllingCompartment } = calculateNDL(maxDepth, bottomGas.n2, gfHighDec);
    
    // Calculate descent time
    const descentTime = Math.ceil(maxDepth / DESCENT_SPEED);
    
    // Check if deco is required
    const requiresDeco = bottomTime > ndl;
    
    if (!requiresDeco) {
        // Within NDL - generate simple profile with safety stop
        const waypoints = generateSimpleProfile(maxDepth, bottomTime);
        // Add gasId to first bottom waypoint
        waypoints[1].gasId = bottomGas.id;
        
        return {
            waypoints,
            ndl,
            requiresDeco: false,
            decoStops: [],
            totalDecoTime: 0,
            controllingCompartment
        };
    }
    
    // Deco required - simulate to end of bottom time and generate deco schedule
    
    // Initialize tissue pressures
    const initialN2 = getInitialTissueN2(bottomGas.n2);
    let tissues = {};
    COMPARTMENTS.forEach(comp => {
        tissues[comp.id] = initialN2;
    });
    
    // Simulate descent
    tissues = simulateDepthChange(tissues, 0, maxDepth, descentTime, bottomGas.n2);
    
    // Simulate bottom time (from end of descent to bottomTime)
    const actualBottomDuration = bottomTime - descentTime;
    if (actualBottomDuration > 0) {
        tissues = simulateDepthTime(tissues, maxDepth, actualBottomDuration, bottomGas.n2);
    }
    
    // Generate deco schedule
    const { stops, totalTime: ascentTotalTime } = generateDecoSchedule(
        tissues, maxDepth, bottomGas.n2, gfLowDec, gfHighDec, gases
    );
    
    // Build waypoints from deco schedule
    const waypoints = [
        { time: 0, depth: 0 },
        { time: descentTime, depth: maxDepth, gasId: bottomGas.id },
        { time: bottomTime, depth: maxDepth }
    ];
    
    let currentTime = bottomTime;
    let currentDepth = maxDepth;
    
    // Add deco stops to waypoints
    for (const stop of stops) {
        // Ascend to this stop depth
        const ascentTime = Math.ceil((currentDepth - stop.depth) / ASCENT_SPEED);
        currentTime += ascentTime;
        waypoints.push({ time: currentTime, depth: stop.depth });
        
        // Stay at stop
        currentTime += stop.time;
        waypoints.push({ time: currentTime, depth: stop.depth });
        
        currentDepth = stop.depth;
    }
    
    // Final ascent to surface (if not already there)
    if (currentDepth > 0) {
        const finalAscentTime = Math.ceil(currentDepth / ASCENT_SPEED);
        currentTime += finalAscentTime;
        waypoints.push({ time: currentTime, depth: 0 });
    }
    
    const totalDecoTime = stops.reduce((sum, s) => sum + s.time, 0);
    
    return {
        waypoints,
        ndl,
        requiresDeco: true,
        decoStops: stops,
        totalDecoTime,
        controllingCompartment
    };
}

/**
 * Synchronous version of generateDecoProfile for simpler use cases
 * Note: For async module loading, use generateDecoProfile instead
 */
export function generateDecoProfileSync(maxDepth, bottomTime, gases, gfLow, gfHigh, compartments) {
    const DESCENT_SPEED = 20;
    const ASCENT_SPEED = 10;
    const SAFETY_STOP_DEPTH = 5;
    const SAFETY_STOP_TIME = 3;
    
    // Convert GF percentages to decimals
    const gfLowDec = gfLow / 100;
    const gfHighDec = gfHigh / 100;
    
    // Get bottom gas
    const bottomGas = gases && gases.length > 0 ? gases[0] : { id: 'air', name: 'Air', o2: 0.21, n2: 0.79 };
    
    // Calculate NDL
    const { ndl, controllingCompartment } = calculateNDL(maxDepth, bottomGas.n2, gfHighDec);
    
    const descentTime = Math.ceil(maxDepth / DESCENT_SPEED);
    const requiresDeco = bottomTime > ndl;
    
    if (!requiresDeco) {
        const waypoints = generateSimpleProfile(maxDepth, bottomTime);
        waypoints[1].gasId = bottomGas.id;
        
        return {
            waypoints,
            ndl,
            requiresDeco: false,
            decoStops: [],
            totalDecoTime: 0,
            controllingCompartment
        };
    }
    
    // Deco required - need compartments for simulation
    if (!compartments) {
        throw new Error('Compartments required for deco profile generation');
    }
    
    // Initialize tissue pressures
    const initialN2 = getInitialTissueN2(bottomGas.n2);
    let tissues = {};
    compartments.forEach(comp => {
        tissues[comp.id] = initialN2;
    });
    
    // Simulate descent
    tissues = simulateDepthChange(tissues, 0, maxDepth, descentTime, bottomGas.n2);
    
    // Simulate bottom time
    const actualBottomDuration = bottomTime - descentTime;
    if (actualBottomDuration > 0) {
        tissues = simulateDepthTime(tissues, maxDepth, actualBottomDuration, bottomGas.n2);
    }
    
    // Generate deco schedule
    const { stops } = generateDecoSchedule(tissues, maxDepth, bottomGas.n2, gfLowDec, gfHighDec, gases);
    
    // Build waypoints
    const waypoints = [
        { time: 0, depth: 0 },
        { time: descentTime, depth: maxDepth, gasId: bottomGas.id },
        { time: bottomTime, depth: maxDepth }
    ];
    
    let currentTime = bottomTime;
    let currentDepth = maxDepth;
    
    for (const stop of stops) {
        const ascentTime = Math.ceil((currentDepth - stop.depth) / ASCENT_SPEED);
        currentTime += ascentTime;
        waypoints.push({ time: currentTime, depth: stop.depth });
        
        currentTime += stop.time;
        waypoints.push({ time: currentTime, depth: stop.depth });
        
        currentDepth = stop.depth;
    }
    
    if (currentDepth > 0) {
        const finalAscentTime = Math.ceil(currentDepth / ASCENT_SPEED);
        currentTime += finalAscentTime;
        waypoints.push({ time: currentTime, depth: 0 });
    }
    
    return {
        waypoints,
        ndl,
        requiresDeco: true,
        decoStops: stops,
        totalDecoTime: stops.reduce((sum, s) => sum + s.time, 0),
        controllingCompartment
    };
}

/**
 * Get NDL for a given depth and gas
 * Wrapper for UI display
 * 
 * @param {number} depth - Depth in meters
 * @param {Object} gas - Gas object with n2 property
 * @param {number} gfHigh - GF High as percentage (0-100)
 * @returns {{ndl: number, controllingCompartment: number}}
 */
export function getNDLForDepth(depth, gas, gfHigh) {
    const n2 = gas?.n2 ?? N2_FRACTION;
    return calculateNDL(depth, n2, gfHigh / 100);
}

/**
 * Extend dive setup with custom overrides
 * Performs deep merge for nested objects like units
 * @param {Object} baseSetup - Base dive setup
 * @param {Object} overrides - Override values
 * @returns {Object} Merged dive setup
 */
export function extendDiveSetup(baseSetup, overrides) {
    const merged = { ...baseSetup };
    
    for (const key of Object.keys(overrides)) {
        if (key === 'units') {
            // Deep merge for nested objects
            merged[key] = { ...baseSetup[key], ...overrides[key] };
        } else if (key === 'gases' || key === 'dives') {
            // Replace arrays entirely if provided
            merged[key] = [...overrides[key]];
        } else {
            merged[key] = overrides[key];
        }
    }
    
    return merged;
}

/**
 * Merge multiple dives into a single timeline
 * @param {Array} dives - Array of dive objects with waypoints
 * @returns {Array<{time: number, depth: number}>} Merged waypoints
 */
function mergeDivesIntoTimeline(dives) {
    const merged = [];
    let timeOffset = 0;
    
    dives.forEach((dive, index) => {
        // Add surface interval before this dive (except first dive)
        if (index > 0 && dive.surfaceIntervalBefore) {
            timeOffset += dive.surfaceIntervalBefore;
        }
        
        dive.waypoints.forEach(wp => {
            const mergedWp = {
                time: wp.time + timeOffset,
                depth: wp.depth
            };
            // Preserve gasId if present
            if (wp.gasId) {
                mergedWp.gasId = wp.gasId;
            }
            merged.push(mergedWp);
        });
        
        // Update offset to end of this dive
        if (dive.waypoints.length > 0) {
            const lastWp = dive.waypoints[dive.waypoints.length - 1];
            timeOffset += lastWp.time;
        }
    });
    
    return merged;
}

/**
 * Get waypoints from dive setup, merging multiple dives into single timeline
 * @param {Object} setup - Dive setup object with dives array
 * @returns {Array<{time: number, depth: number, gasId?: string}>} Waypoints array
 */
export function getDiveSetupWaypoints(setup) {
    if (!setup.dives || setup.dives.length === 0) {
        console.warn('Dive setup missing dives array, returning empty waypoints');
        return [];
    }
    return mergeDivesIntoTimeline(setup.dives);
}

/**
 * Get surface interval from dive setup
 * @param {Object} setup - Dive setup object
 * @returns {number} Surface interval in minutes
 */
export function getSurfaceInterval(setup) {
    return setup.surfaceInterval ?? 60;
}

/**
 * Get Gradient Factor Low from dive setup
 * @param {Object} setup - Dive setup object
 * @returns {number} GF Low as percentage (0-100)
 */
export function getGFLow(setup) {
    return setup.gfLow ?? DEFAULT_GF_LOW;
}

/**
 * Get Gradient Factor High from dive setup
 * @param {Object} setup - Dive setup object
 * @returns {number} GF High as percentage (0-100)
 */
export function getGFHigh(setup) {
    return setup.gfHigh ?? DEFAULT_GF_HIGH;
}

/**
 * Get Gradient Factors as decimals (0-1) for calculations
 * @param {Object} setup - Dive setup object
 * @returns {{gfLow: number, gfHigh: number}} GF values as decimals
 */
export function getGradientFactors(setup) {
    return {
        gfLow: (setup.gfLow ?? DEFAULT_GF_LOW) / 100,
        gfHigh: (setup.gfHigh ?? DEFAULT_GF_HIGH) / 100
    };
}

/**
 * Calculate Maximum Operating Depth (MOD) for a gas mix
 * @param {number} o2Fraction - Oxygen fraction (0-1)
 * @param {number} maxPpO2 - Maximum ppO2 limit (default 1.4 bar)
 * @returns {number} MOD in meters
 */
export function calculateMOD(o2Fraction, maxPpO2 = 1.4) {
    if (o2Fraction <= 0) return Infinity;
    const maxAmbient = maxPpO2 / o2Fraction;
    return Math.floor((maxAmbient - 1) * 10);
}

/**
 * Calculate Equivalent Narcotic Depth (END)
 * Assumes O2 and N2 are narcotic, He is not
 * @param {number} depth - Actual depth in meters
 * @param {number} heFraction - Helium fraction (0-1)
 * @returns {number} END in meters
 */
export function calculateEND(depth, heFraction = 0) {
    // END = (depth + 10) × (1 - fHe) - 10
    const narcoticFraction = 1 - heFraction;
    return Math.round((depth + 10) * narcoticFraction - 10);
}

/**
 * Calculate partial pressure of a gas at depth
 * @param {number} depth - Depth in meters
 * @param {number} gasFraction - Gas fraction (0-1)
 * @returns {number} Partial pressure in bar
 */
export function calculatePartialPressure(depth, gasFraction) {
    const ambient = 1 + depth / 10;
    return gasFraction * ambient;
}

/**
 * Get cylinder volume in liters for a specific gas
 * @param {Object} gas - Gas object with cylinderVolume
 * @returns {number} Cylinder volume in liters
 */
export function getGasCylinderVolume(gas) {
    return gas?.cylinderVolume || 12;
}

/**
 * Get total bottom gas cylinder volume (for backward compatibility)
 * @param {Object} setup - Dive setup object
 * @returns {number} Cylinder volume in liters
 */
export function getCylinderVolume(setup) {
    const gases = getGases(setup);
    return gases[0]?.cylinderVolume || 12;
}

/**
 * Get start pressure for a gas
 * @param {Object} gas - Gas object with startPressure
 * @returns {number} Start pressure in bar
 */
export function getGasStartPressure(gas) {
    return gas?.startPressure || DEFAULT_START_PRESSURE;
}

/**
 * Get reserve pressure in bar
 * @param {Object} setup - Dive setup object
 * @returns {number} Reserve pressure in bar
 */
export function getReservePressure(setup) {
    return setup.reservePressure || DEFAULT_RESERVE_PRESSURE;
}

// ============================================================================
// MULTI-GAS SUPPORT
// ============================================================================

/**
 * Get the list of gases for a dive setup
 * Each gas has: id, name, o2, n2, he, cylinderVolume, startPressure
 * @param {Object} setup - Dive setup object
 * @returns {Array<Object>} Array of gas objects
 */
export function getGases(setup) {
    if (!setup.gases || setup.gases.length === 0) {
        // Return default air if no gases defined
        return [{
            id: 'bottom',
            name: 'Air',
            o2: 0.21,
            n2: 0.79,
            he: 0,
            cylinderVolume: 12,
            startPressure: DEFAULT_START_PRESSURE
        }];
    }
    return setup.gases;
}

/**
 * Get the bottom gas (first gas in the list)
 * @param {Object} setup - Dive setup object
 * @returns {Object} Bottom gas object
 */
export function getBottomGasFromSetup(setup) {
    const gases = getGases(setup);
    return gases[0];
}

/**
 * Get deco gases (all gases except the first one)
 * @param {Object} setup - Dive setup object
 * @returns {Array<Object>} Array of deco gas objects
 */
export function getDecoGasesFromSetup(setup) {
    const gases = getGases(setup);
    return gases.slice(1);
}

/**
 * Get the gas being used at a specific waypoint
 * Falls back to first gas if waypoint has no gasId
 * @param {Object} waypoint - Waypoint object with optional gasId
 * @param {Array<Object>} gases - Array of available gases
 * @returns {Object} Gas object
 */
export function getGasAtWaypoint(waypoint, gases) {
    if (!gases || gases.length === 0) {
        return { id: 'air', name: 'Air', o2: 0.21, n2: 0.79, he: 0 };
    }
    
    if (waypoint.gasId) {
        const gas = gases.find(g => g.id === waypoint.gasId);
        if (gas) return gas;
    }
    
    // Default to first gas (bottom gas)
    return gases[0];
}

/**
 * Get the active gas at a specific time in the dive
 * Finds the most recent waypoint at or before the given time and returns its gas
 * @param {Array<Object>} waypoints - Array of waypoints with optional gasId
 * @param {Array<Object>} gases - Array of available gases
 * @param {number} time - Time in minutes
 * @returns {Object} Gas object active at that time
 */
export function getGasAtTime(waypoints, gases, time) {
    if (!waypoints || waypoints.length === 0) {
        return gases?.[0] || { id: 'air', name: 'Air', o2: 0.21, n2: 0.79, he: 0 };
    }
    
    // Find the last waypoint at or before this time
    let activeWaypoint = waypoints[0];
    for (const wp of waypoints) {
        if (wp.time <= time) {
            activeWaypoint = wp;
        } else {
            break;
        }
    }
    
    return getGasAtWaypoint(activeWaypoint, gases);
}

/**
 * Get all gas switch events from waypoints
 * Returns array of {time, depth, fromGas, toGas} for each gas change
 * @param {Array<Object>} waypoints - Array of waypoints with optional gasId
 * @param {Array<Object>} gases - Array of available gases
 * @returns {Array<Object>} Array of gas switch events
 */
export function getGasSwitchEvents(waypoints, gases) {
    if (!waypoints || waypoints.length < 2 || !gases || gases.length < 2) {
        return [];
    }
    
    const switches = [];
    let currentGas = getGasAtWaypoint(waypoints[0], gases);
    
    for (let i = 1; i < waypoints.length; i++) {
        const wp = waypoints[i];
        const wpGas = getGasAtWaypoint(wp, gases);
        
        if (wpGas.id !== currentGas.id) {
            switches.push({
                time: wp.time,
                depth: wp.depth,
                fromGas: currentGas,
                toGas: wpGas
            });
            currentGas = wpGas;
        }
    }
    
    return switches;
}

/**
 * Auto-insert gas switch waypoints during ascent based on MOD
 * Creates new waypoints where deco gases become usable, with time for the switch
 * @param {Array<Object>} waypoints - Original waypoints
 * @param {Array<Object>} gases - Available gases (first is bottom gas, rest are deco gases)
 * @param {number} ascentRate - Ascent rate in m/min (default 10)
 * @param {number} maxPpO2 - Maximum ppO2 for MOD calculation (default 1.6 for deco)
 * @returns {Array<Object>} Waypoints with gas switches inserted
 */
export function insertGasSwitchWaypoints(waypoints, gases, ascentRate = 10, maxPpO2 = 1.6) {
    if (!waypoints || waypoints.length < 2 || !gases || gases.length < 2) {
        return waypoints;
    }
    
    // Calculate MOD for each deco gas
    const decoGases = gases.slice(1).map(gas => ({
        ...gas,
        mod: calculateMOD(gas.o2, maxPpO2)
    })).sort((a, b) => b.mod - a.mod); // Sort by MOD descending (deeper first)
    
    // Find the bottom gas and max depth
    const bottomGas = gases[0];
    let maxDepthTime = 0;
    let maxDepth = 0;
    waypoints.forEach((wp) => {
        if (wp.depth > maxDepth) {
            maxDepth = wp.depth;
            maxDepthTime = wp.time;
        }
    });
    
    // Find when ascent begins (after max depth)
    const ascentStartIndex = waypoints.findIndex((wp, i) => 
        i > 0 && wp.time > maxDepthTime && wp.depth < maxDepth
    );
    
    if (ascentStartIndex === -1) {
        return waypoints; // No ascent found
    }
    
    // Pre-scan for existing stops (horizontal segments at same depth)
    // A stop exists if there are 2+ consecutive waypoints at the same depth
    const existingStopDepths = new Set();
    for (let i = 0; i < waypoints.length - 1; i++) {
        if (waypoints[i].depth === waypoints[i + 1].depth && waypoints[i].depth > 0) {
            existingStopDepths.add(waypoints[i].depth);
        }
    }
    
    // Build new waypoints with gas switches and time offsets
    const newWaypoints = [];
    const usedDecoGases = new Set();
    let timeOffset = 0; // Accumulated time offset from gas switch stops
    let currentGasId = bottomGas.id; // Track current gas during iteration
    
    for (let i = 0; i < waypoints.length; i++) {
        const wp = waypoints[i];
        
        // Apply time offset to this waypoint
        const adjustedTime = wp.time + timeOffset;
        
        // Get the previous waypoint from our new list (with adjusted times)
        const prevWp = newWaypoints.length > 0 ? newWaypoints[newWaypoints.length - 1] : null;
        
        // Check if we're ascending and cross a deco gas MOD
        if (prevWp && prevWp.depth > wp.depth) {
            // We're ascending - check each unused deco gas
            for (const decoGas of decoGases) {
                if (usedDecoGases.has(decoGas.id)) continue;
                
                // Switch depth should be at 3m increments (standard deco stops) below MOD
                const switchDepth = Math.floor(decoGas.mod / 3) * 3;
                
                // If we cross this gas's switch depth during this segment
                if (prevWp.depth > switchDepth && wp.depth <= switchDepth) {
                    // Check if there's already a deco stop at this depth
                    const hasExistingStop = existingStopDepths.has(switchDepth);
                    
                    // Check if current waypoint is exactly at the switch depth
                    // If so, we don't need to insert a new waypoint - just mark for gas update
                    const currentWpIsAtSwitchDepth = wp.depth === switchDepth;
                    
                    if (hasExistingStop) {
                        // Merge with existing stop
                        if (currentWpIsAtSwitchDepth) {
                            // The current waypoint is already at the switch depth
                            // Don't insert a new one - update currentGasId for this and future waypoints
                            usedDecoGases.add(decoGas.id);
                            currentGasId = decoGas.id;
                        } else {
                            // We're passing through switch depth but current wp is shallower
                            // Insert arrival waypoint at switch depth
                            const depthChange = prevWp.depth - switchDepth;
                            const timeToSwitch = depthChange / ascentRate;
                            const switchArrivalTime = Math.ceil(prevWp.time + timeToSwitch);
                            
                            newWaypoints.push({
                                time: switchArrivalTime,
                                depth: switchDepth,
                                gasId: decoGas.id
                            });
                            
                            usedDecoGases.add(decoGas.id);
                            currentGasId = decoGas.id;
                        }
                        // No time offset added - we're using the existing stop time
                    } else {
                        // No existing stop - insert full gas switch stop with time
                        const depthChange = prevWp.depth - switchDepth;
                        const timeToSwitch = depthChange / ascentRate;
                        const switchArrivalTime = Math.ceil(prevWp.time + timeToSwitch);
                        const switchDepartureTime = switchArrivalTime + GAS_SWITCH_TIME;
                        
                        // Insert arrival waypoint (switch to new gas)
                        newWaypoints.push({
                            time: switchArrivalTime,
                            depth: switchDepth,
                            gasId: decoGas.id
                        });
                        
                        // Insert departure waypoint (end of gas switch stop)
                        newWaypoints.push({
                            time: switchDepartureTime,
                            depth: switchDepth,
                            gasId: decoGas.id
                        });
                        
                        usedDecoGases.add(decoGas.id);
                        currentGasId = decoGas.id;
                        
                        // Add the gas switch time to the offset for subsequent waypoints
                        timeOffset += GAS_SWITCH_TIME;
                    }
                }
            }
        }
        
        // Add original waypoint with adjusted time and correct gasId
        const wpCopy = { 
            ...wp,
            time: wp.time + timeOffset
        };
        
        // Determine which gas should be active at this point
        if (i < ascentStartIndex) {
            // Before ascent, always use bottom gas
            wpCopy.gasId = bottomGas.id;
        } else {
            // During ascent, use the current tracked gas
            wpCopy.gasId = currentGasId;
        }
        
        newWaypoints.push(wpCopy);
    }
    
    // Sort by time and return
    return newWaypoints.sort((a, b) => a.time - b.time);
}

/**
 * Create a gas object with cylinder info
 * @param {string} id - Gas ID
 * @param {string} presetId - Predefined gas ID (e.g., 'air', 'ean50')
 * @param {number} cylinderVolume - Cylinder volume in liters
 * @param {number} startPressure - Start pressure in bar
 * @returns {Object} Complete gas object
 */
export function createGasWithCylinder(id, presetId, cylinderVolume, startPressure = DEFAULT_START_PRESSURE) {
    const preset = getPredefinedGas(presetId);
    if (!preset) {
        console.warn(`Unknown gas preset: ${presetId}, using air`);
        return createGasWithCylinder(id, 'air', cylinderVolume, startPressure);
    }
    return {
        id,
        name: preset.name,
        o2: preset.o2,
        n2: preset.n2,
        he: preset.he,
        cylinderVolume,
        startPressure
    };
}

/**
 * Clear cached setup (useful for reloading)
 */
export function clearCache() {
    cachedSetup = null;
}

/**
 * Save current setup to localStorage for persistence
 * @param {Object} setup - Dive setup to save
 * @param {string} [key='diveSetup'] - Storage key
 */
export function saveDiveSetup(setup, key = 'diveSetup') {
    try {
        localStorage.setItem(key, JSON.stringify(setup));
    } catch (error) {
        console.warn('Could not save dive setup to localStorage:', error);
    }
}

/**
 * Load setup from localStorage if available
 * @param {string} [key='diveSetup'] - Storage key
 * @returns {Object|null} Saved setup or null
 */
export function loadSavedSetup(key = 'diveSetup') {
    try {
        const saved = localStorage.getItem(key);
        return saved ? JSON.parse(saved) : null;
    } catch (error) {
        console.warn('Could not load dive setup from localStorage:', error);
        return null;
    }
}

/**
 * Generate a descriptive profile name from dive setup
 * Format: "[depth]m [gas1] [+ gas2...]" e.g., "40m Air + EAN50" or "55m Trimix 18/45 + O2"
 * @param {Object} setup - Dive setup object
 * @returns {string} Generated profile name
 */
export function generateProfileName(setup) {
    const waypoints = getDiveSetupWaypoints(setup);
    const maxDepth = Math.max(...waypoints.map(wp => wp.depth));
    const gases = getGases(setup);
    
    // Format gas names
    const gasNames = gases.map(g => g.name).join(' + ');
    
    return `${maxDepth}m ${gasNames}`;
}

/**
 * Format dive setup summary for display
 * @param {Object} setup - Dive setup object
 * @returns {string} Human-readable summary
 */
export function formatDiveSetupSummary(setup) {
    const waypoints = getDiveSetupWaypoints(setup);
    const maxDepth = waypoints.length > 0 ? Math.max(...waypoints.map(wp => wp.depth)) : 0;
    const totalTime = waypoints[waypoints.length - 1]?.time || 0;
    const gases = getGases(setup);
    const gasNames = gases.map(g => g.name).join(' + ');
    
    // Check if multi-dive
    const diveCount = setup.dives?.length || 1;
    const diveInfo = diveCount > 1 ? ` (${diveCount} dives)` : '';
    
    return `${setup.name}: ${maxDepth}m max depth, ${totalTime} min total, ${gasNames}${diveInfo}`;
}
/**
 * NOAA CNS Oxygen Toxicity Limits
 * Maps ppO2 (bar) to maximum single exposure time (minutes)
 * Used for calculating CNS% accumulation
 */
export const NOAA_CNS_LIMITS = [
    { ppO2: 1.60, maxTime: 45 },
    { ppO2: 1.55, maxTime: 83 },
    { ppO2: 1.50, maxTime: 120 },
    { ppO2: 1.45, maxTime: 135 },
    { ppO2: 1.40, maxTime: 150 },
    { ppO2: 1.35, maxTime: 165 },
    { ppO2: 1.30, maxTime: 180 },
    { ppO2: 1.25, maxTime: 195 },
    { ppO2: 1.20, maxTime: 210 },
    { ppO2: 1.10, maxTime: 240 },
    { ppO2: 1.00, maxTime: 300 },
    { ppO2: 0.90, maxTime: 360 },
    { ppO2: 0.80, maxTime: 450 },
    { ppO2: 0.70, maxTime: 570 },
    { ppO2: 0.60, maxTime: 720 }
];

/**
 * Get CNS% accumulation rate per minute for a given ppO2
 * @param {number} ppO2 - Partial pressure of oxygen in bar
 * @returns {number} CNS% per minute (0 if ppO2 < 0.5)
 */
export function getCNSPerMinute(ppO2) {
    if (ppO2 < 0.5) return 0;
    
    // Find the appropriate limit from the NOAA table
    for (const limit of NOAA_CNS_LIMITS) {
        if (ppO2 >= limit.ppO2) {
            return 100 / limit.maxTime;
        }
    }
    
    // Below 0.6 bar, use the 0.6 limit (720 min)
    return 100 / 720;
}

/**
 * Calculate OTU (Oxygen Toxicity Units) for an exposure
 * Formula: OTU = t × ((ppO2 - 0.5) / 0.5)^0.83
 * Only applies when ppO2 > 0.5 bar
 * @param {number} ppO2 - Partial pressure of oxygen in bar
 * @param {number} timeMinutes - Exposure time in minutes
 * @returns {number} OTU accumulated
 */
export function calculateOTU(ppO2, timeMinutes) {
    if (ppO2 <= 0.5) return 0;
    return timeMinutes * Math.pow((ppO2 - 0.5) / 0.5, 0.83);
}

/**
 * NOAA recommended OTU limits
 */
export const OTU_LIMITS = {
    singleDive: 300,      // Max OTU for a single dive
    daily: 300,           // Max OTU per day (normal operations)
    dailyExceptional: 600 // Max OTU per day (exceptional exposure)
};