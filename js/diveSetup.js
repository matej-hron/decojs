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
import { translate } from './i18n.js';
import { escHtml } from './utils/escHtml.js';

// Default path to dive setup JSON
const DEFAULT_SETUP_PATH = 'data/dive-setup.json';

// Cached dive setup
let cachedSetup = null;

/**
 * Default time spent at gas switch depth (minutes).
 * Configurable in DiveSetupEditor (0-5 min dropdown).
 * 0 = instant switch (no stop), typical range 1-3 min.
 */
export const DEFAULT_GAS_SWITCH_TIME = 0;

/**
 * Bottom gases - suitable for descent and bottom time
 * Larger MOD, used with back-mount cylinders
 */
export const BOTTOM_GASES = [
    { id: 'air', name: 'Air', o2: 0.2098, n2: 0.7902, he: 0 },
    { id: 'ean32', name: 'EAN32', o2: 0.32, n2: 0.68, he: 0 },
    { id: 'ean36', name: 'EAN36', o2: 0.36, n2: 0.64, he: 0 }
];

/**
 * Deco gases - high O2 for accelerated decompression
 * Shallow MOD, used with stage cylinders
 */
export const DECO_GASES = [
    { id: 'ean50', name: 'EAN50', o2: 0.50, n2: 0.50, he: 0 },
    { id: 'ean80', name: 'EAN80', o2: 0.80, n2: 0.20, he: 0 },
    { id: 'o2', name: 'O₂ 100%', o2: 1.0, n2: 0, he: 0 }
];

/**
 * All predefined gases (combined for backward compatibility)
 */
export const PREDEFINED_GASES = [...BOTTOM_GASES, ...DECO_GASES];

/**
 * Bottom/back-mount cylinder sizes (liters)
 * Volumes are water capacity (actual internal volume).
 */
export const BOTTOM_CYLINDERS = [
    { value: 10, label: '10\u00a0l (Single)' },
    { value: 12, label: '12\u00a0l (Single)' },
    { value: 15, label: '15\u00a0l (Single)' },
    { value: 18, label: '18\u00a0l (Single)' },
    { value: 14, label: '2×7\u00a0l (Doubles)' },
    { value: 20, label: '2×10\u00a0l (Doubles)' },
    { value: 24, label: '2×12\u00a0l (Doubles)' }
];

/**
 * Stage/deco cylinder sizes (liters)
 * Based on Luxfer aluminum stage cylinders commonly used in EU diving.
 * Ref: stranypotapecske.cz - S040 = 5.7 L, S080 = 11.1 L
 * "S" = stage designation (cuft nominal capacity at working pressure)
 */
export const STAGE_CYLINDERS = [
    { value: 5.7, label: '5.7\u00a0l (S040)' },
    { value: 7, label: '7\u00a0l' },
    { value: 10, label: '10\u00a0l' },
    { value: 11.1, label: '11.1\u00a0l (S080)' }
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
 * Default Safety Stop settings
 */
export const DEFAULT_SAFETY_STOP = {
    enabled: true,
    depth: 5,    // meters
    time: 3      // minutes
};

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
                o2: 0.2098,
                n2: 0.7902,
                he: 0,
                cylinderVolume: 12,
                startPressure: 200
            }
        ],
        reservePressure: 50,
        gfLow: 100,   // Gradient Factor Low (percentage)
        gfHigh: 100,  // Gradient Factor High (percentage)
        surfaceInterval: 15,  // Post-dive surface time to show off-gassing
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
 *   - Configurable safety stop (default: 3 min at 5m)
 *   - Times rounded up to full minutes
 * 
 * Bottom time is measured from the START of the dive (time 0), not from
 * reaching the bottom. This matches how divers plan dives - "30 min bottom time"
 * means the ascent starts at minute 30.
 * 
 * @param {number} maxDepth - Maximum depth in meters
 * @param {number} bottomTime - Time from dive start until leaving max depth (minutes)
 * @param {Object} [safetyStop] - Safety stop configuration
 * @param {boolean} [safetyStop.enabled=true] - Whether to include safety stop
 * @param {number} [safetyStop.depth=5] - Safety stop depth in meters
 * @param {number} [safetyStop.time=3] - Safety stop duration in minutes
 * @returns {Array<{time: number, depth: number}>} Generated waypoints
 */
export function generateSimpleProfile(maxDepth, bottomTime, safetyStop = DEFAULT_SAFETY_STOP, options = {}) {
    const DESCENT_SPEED = 20; // m/min
    const ASCENT_SPEED = 10;  // m/min
    // Descent still rounds up (keeps the bottom-time invariant intact); ascents use
    // exact fractional time so the effective ascent rate is really 10 m/min.
    // Exact descent time (matches decotengu/divetools; no whole-minute rounding).
    const roundUpDescent = (x) => x;

    // Get safety stop settings with defaults
    const safetyStopEnabled = safetyStop?.enabled ?? DEFAULT_SAFETY_STOP.enabled;
    const safetyStopDepth = safetyStop?.depth ?? DEFAULT_SAFETY_STOP.depth;
    const safetyStopTime = safetyStop?.time ?? DEFAULT_SAFETY_STOP.time;

    // Calculate descent time
    const descentTime = roundUpDescent(maxDepth / DESCENT_SPEED);

    // Bottom time is from dive start, so we leave depth at bottomTime
    // (not descentTime + bottomTime)
    const bottomEndTime = bottomTime;

    // Snap to 0.1-min precision to avoid IEEE-754 accumulation artifacts.
    const snap = options.continuousDeco ? (t) => t : (t) => Math.round(t * 10) / 10;

    if (safetyStopEnabled && maxDepth > safetyStopDepth) {
        // Ascent from max depth to safety stop depth — exact 10 m/min
        const ascentToSafetyStop = (maxDepth - safetyStopDepth) / ASCENT_SPEED;
        const safetyStopStartTime = snap(bottomEndTime + ascentToSafetyStop);

        // Safety stop ends
        const safetyStopEndTime = snap(safetyStopStartTime + safetyStopTime);

        // Final ascent from safety stop to surface — exact 10 m/min
        const finalAscentTime = safetyStopDepth / ASCENT_SPEED;
        const surfaceTime = snap(safetyStopEndTime + finalAscentTime);

        return [
            { time: 0, depth: 0 },                                   // Start at surface
            { time: descentTime, depth: maxDepth },                  // Arrive at max depth
            { time: bottomEndTime, depth: maxDepth },                // End of bottom time
            { time: safetyStopStartTime, depth: safetyStopDepth },   // Arrive at safety stop
            { time: safetyStopEndTime, depth: safetyStopDepth },     // End of safety stop
            { time: surfaceTime, depth: 0 }                          // Back at surface
        ];
    } else {
        // No safety stop - direct ascent at exact 10 m/min
        const ascentTime = maxDepth / ASCENT_SPEED;
        const surfaceTime = snap(bottomEndTime + ascentTime);

        return [
            { time: 0, depth: 0 },                           // Start at surface
            { time: descentTime, depth: maxDepth },          // Arrive at max depth
            { time: bottomEndTime, depth: maxDepth },        // End of bottom time
            { time: surfaceTime, depth: 0 }                  // Back at surface
        ];
    }
}

/**
 * Generate a dive profile with automatic NDL check and deco stops if needed
 * 
 * If bottom time <= NDL: generates profile with safety stop (if configured)
 * If bottom time > NDL: generates profile with proper deco stops
 *   - If deco clears before safety stop depth, adds safety stop
 * 
 * Supports multi-gas diving: will switch to deco gases during ascent
 * when current depth is within the deco gas MOD.
 * 
 * @param {number} maxDepth - Maximum depth in meters
 * @param {number} bottomTime - Time from dive start until leaving max depth (minutes)
 * @param {Array} gases - Available gases [{id, name, o2, n2, he}]
 * @param {number} gfLow - GF Low as percentage (0-100)
 * @param {number} gfHigh - GF High as percentage (0-100)
 * @param {Object} [safetyStop] - Safety stop configuration
 * @param {boolean} [safetyStop.enabled=true] - Whether to include safety stop
 * @param {number} [safetyStop.depth=5] - Safety stop depth in meters
 * @param {number} [safetyStop.time=3] - Safety stop duration in minutes
 * @returns {{
 *   waypoints: Array<{time: number, depth: number, gasId?: string}>,
 *   ndl: number,
 *   requiresDeco: boolean,
 *   decoStops: Array<{depth: number, time: number, gas: string}>,
 *   totalDecoTime: number,
 *   controllingCompartment: number,
 *   pAnchor: number,
 *   anchorDepth: number
 * }}
 */
export function generateDecoProfile(maxDepth, bottomTime, gases, gfLow, gfHigh, safetyStop = DEFAULT_SAFETY_STOP, options = {}) {
    const DESCENT_SPEED = 20; // m/min
    const ASCENT_SPEED = 10;  // m/min
    const STOP_INCREMENT = 3;
    // Exact descent time (matches decotengu/divetools).
    const roundUp = (x) => x;

    // Get safety stop settings with defaults
    const safetyStopEnabled = safetyStop?.enabled ?? DEFAULT_SAFETY_STOP.enabled;
    const safetyStopDepth = safetyStop?.depth ?? DEFAULT_SAFETY_STOP.depth;
    const safetyStopTime = safetyStop?.time ?? DEFAULT_SAFETY_STOP.time;

    // Convert GF percentages to decimals
    const gfLowDec = gfLow / 100;
    const gfHighDec = gfHigh / 100;

    // Get bottom gas (first gas or air)
    const bottomGas = gases && gases.length > 0 ? gases[0] : { id: 'air', name: 'Air', o2: 0.2098, n2: 0.7902 };

    // Calculate NDL for this depth/gas (uses GF Low since that determines first stop)
    const { ndl, ndlExact, controllingCompartment } = calculateNDL(maxDepth, bottomGas.n2, gfLowDec);

    // Calculate descent time
    const descentTime = roundUp(maxDepth / DESCENT_SPEED);
    
    // Check if deco is required. The NDL here is surface-based, so it is only
    // valid when starting fresh. For repetitive dives (a seeded tissue state) we
    // cannot trust it — skip the early-return and always run the deco scheduler,
    // which reads the actual bottom tissue state (and returns zero stops + a
    // safety stop if no deco is genuinely needed).
    //
    // Both clocks run from leaving the surface: bottomTime is measured from the start
    // of the descent and calculateNDL reports the NDL the same way (descent included),
    // so they are compared directly. The comparison uses the exact NDL, not the whole
    // minutes shown in the UI — flooring the threshold would route the last fraction
    // of a minute into the deco branch, which then finds nothing to do.
    const seededTissues = options.initialTissuePressures || null;
    const exceedsNDL = bottomTime > ndlExact;

    if (!exceedsNDL && !seededTissues) {
        // Within NDL - generate simple profile with safety stop
        const waypoints = generateSimpleProfile(maxDepth, bottomTime, safetyStop, options);
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

    // Simulate to end of bottom time and generate deco schedule.

    // Initialize tissue pressures (seeded for repetitive dives, else surface).
    const initialN2 = getInitialTissueN2(bottomGas.n2);
    let tissues = {};
    COMPARTMENTS.forEach(comp => {
        tissues[comp.id] = seededTissues ? seededTissues[comp.id] : initialN2;
    });
    
    // Simulate descent
    tissues = simulateDepthChange(tissues, 0, maxDepth, descentTime, bottomGas.n2);
    
    // Simulate bottom time (from end of descent to bottomTime)
    const actualBottomDuration = bottomTime - descentTime;
    if (actualBottomDuration > 0) {
        tissues = simulateDepthTime(tissues, maxDepth, actualBottomDuration, bottomGas.n2);
    }
    
    // Generate deco schedule (now returns gasSwitches and pAnchor too)
    const { stops, gasSwitches, totalTime: ascentTotalTime, pAnchor, anchorDepth } = generateDecoSchedule(
        tissues, maxDepth, bottomGas.n2, gfLowDec, gfHighDec, gases, options
    );
    
    // Build waypoints from deco schedule
    const waypoints = [
        { time: 0, depth: 0 },
        { time: descentTime, depth: maxDepth, gasId: bottomGas.id },
        { time: bottomTime, depth: maxDepth }
    ];
    
    let currentTime = bottomTime;
    let currentDepth = maxDepth;
    let currentGasId = bottomGas.id;
    
    // Build unified event list: merge gas switches with deco stops at same depth
    // Each event: { depth, stopTime, gasId?, gas }
    // Note: Gas switches that happen during ascent (not at a deco stop) don't add time -
    // the deco algorithm already accounts for off-gassing with the new gas
    const eventsByDepth = new Map();
    
    // First, collect all deco stops
    for (const stop of stops) {
        const stopGas = gases.find(g => g.name === stop.gas);
        eventsByDepth.set(stop.depth, {
            depth: stop.depth,
            stopTime: stop.time,
            gasId: stopGas?.id,
            gas: stop.gas,
            isDecoStop: true
        });
    }
    
    // Gas switches at deco stops: update the stop's gasId.
    // Gas switches during ascent (not at a deco stop) are NOT added as waypoints –
    // they happen "in transit" and the chart shows them as annotations from gasSwitches.
    // This avoids breaking the ascent into segments with different (rounded) speeds.
    const gasSwitchesByDepth = new Map();
    for (const sw of gasSwitches) {
        if (eventsByDepth.has(sw.depth)) {
            // Gas switch at a deco stop - update the gasId
            const existing = eventsByDepth.get(sw.depth);
            existing.gasId = sw.gasId;
        }
        // Track all switches for gasId assignment to waypoints
        gasSwitchesByDepth.set(sw.depth, sw);
    }
    
    // Check if we need to add a safety stop (deco cleared before safety stop depth)
    // Safety stop is added if:
    // 1. Safety stop is enabled
    // 2. Max depth is greater than safety stop depth
    // 3. No deco stop at or below safety stop depth (deco has cleared)
    const hasDecoAtOrBelowSafetyStop = stops.some(s => s.depth <= safetyStopDepth && s.depth > 0);
    const needsSafetyStop = safetyStopEnabled && 
                           maxDepth > safetyStopDepth && 
                           !hasDecoAtOrBelowSafetyStop;
    
    if (needsSafetyStop) {
        // Add safety stop if not already covered by a deco stop
        if (!eventsByDepth.has(safetyStopDepth)) {
            eventsByDepth.set(safetyStopDepth, {
                depth: safetyStopDepth,
                stopTime: safetyStopTime,
                gasId: null,  // Use current gas
                gas: null,
                isDecoStop: false,
                isSafetyStop: true
            });
        }
    }
    
    // Sort events by depth (descending - deeper first)
    const events = Array.from(eventsByDepth.values()).sort((a, b) => b.depth - a.depth);
    
    // Sort gas switches by depth descending for in-transit gasId tracking
    const sortedGasSwitches = [...gasSwitchesByDepth.values()].sort((a, b) => b.depth - a.depth);

    // Process events in order. Physics convention: a stop's `stopTime` is the
    // stay at depth (matching decotengu and our scheduler's semantics). The
    // ascent to the next level is a separate segment that follows. This keeps
    // the tissue simulation strictly honest — the diver stays at stop depth
    // for the full scheduled minutes, as the scheduler planned.
    //
    // The table renderer (`renderDivePlanTableHTML`) subsequently folds each
    // inter-stop ascent into the PRECEDING stop row for display, so the plan
    // table shows Divesoft-style runtimes (Stop 6m 1 min runT 33) while the
    // waypoints retain the faithful stay+ascent structure for the chart.
    for (const event of events) {
        // Ascend to this event's depth
        if (currentDepth > event.depth) {
            // Apply any gas switches passed during this ascent segment
            for (const sw of sortedGasSwitches) {
                if (sw.depth < currentDepth && sw.depth >= event.depth) {
                    currentGasId = sw.gasId;
                }
            }
            const ascentTime = (currentDepth - event.depth) / ASCENT_SPEED;
            currentTime += ascentTime;
            if (!options.continuousDeco) currentTime = Math.round(currentTime * 10) / 10;
            currentDepth = event.depth;
        }

        // Add arrival waypoint (with gasId if gas changes)
        if (event.gasId && event.gasId !== currentGasId) {
            waypoints.push({ time: currentTime, depth: event.depth, gasId: event.gasId });
            currentGasId = event.gasId;
        } else {
            waypoints.push({ time: currentTime, depth: event.depth, gasId: currentGasId });
        }

        // Add departure waypoint after full scheduled stay at depth
        if (event.stopTime > 0) {
            currentTime += event.stopTime;
            if (!options.continuousDeco) currentTime = Math.round(currentTime * 10) / 10;
            waypoints.push({ time: currentTime, depth: event.depth });
        }
    }

    // Final ascent to surface at exact 10 m/min
    if (currentDepth > 0) {
        const finalAscentTime = currentDepth / ASCENT_SPEED;
        currentTime += finalAscentTime;
        if (!options.continuousDeco) currentTime = Math.round(currentTime * 10) / 10;
        waypoints.push({ time: currentTime, depth: 0 });
    }

    // Insert gas switch waypoints on the ascent line (for chart annotation positioning).
    // These don't change the profile geometry – they sit exactly on the existing ascent line.
    for (const sw of sortedGasSwitches) {
        if (eventsByDepth.has(sw.depth)) continue; // already a stop at this depth
        // Find the two waypoints this switch falls between
        for (let i = 0; i < waypoints.length - 1; i++) {
            const wp1 = waypoints[i];
            const wp2 = waypoints[i + 1];
            if (wp1.depth > sw.depth && wp2.depth < sw.depth) {
                // Interpolate time on the ascent line (no rounding - must be exactly on the line)
                const fraction = (wp1.depth - sw.depth) / (wp1.depth - wp2.depth);
                const switchTime = wp1.time + fraction * (wp2.time - wp1.time);
                waypoints.splice(i + 1, 0, { time: switchTime, depth: sw.depth, gasId: sw.gasId });
                break;
            }
        }
    }

    const totalDecoTime = stops.reduce((sum, s) => sum + s.time, 0);
    
    return {
        waypoints,
        ndl,
        // True whenever the bottom time exceeds the NDL, i.e. the ceiling has left the
        // surface. Between that moment and the first 3 m stop there is a real but
        // sub-3 m obligation with an empty stop list — that is not a contradiction.
        requiresDeco: true,
        decoStops: stops,
        totalDecoTime,
        controllingCompartment,
        pAnchor,
        anchorDepth
    };
}

/**
 * Synchronous version of generateDecoProfile for simpler use cases
 * Note: For async module loading, use generateDecoProfile instead
 */
export function generateDecoProfileSync(maxDepth, bottomTime, gases, gfLow, gfHigh, compartments, safetyStop = DEFAULT_SAFETY_STOP, options = {}) {
    const DESCENT_SPEED = 20;
    const ASCENT_SPEED = 10;
    // Exact descent time (matches decotengu/divetools).
    const roundUp = (x) => x;

    // Get safety stop settings with defaults
    const safetyStopEnabled = safetyStop?.enabled ?? DEFAULT_SAFETY_STOP.enabled;
    const safetyStopDepth = safetyStop?.depth ?? DEFAULT_SAFETY_STOP.depth;
    const safetyStopTime = safetyStop?.time ?? DEFAULT_SAFETY_STOP.time;

    // Convert GF percentages to decimals
    const gfLowDec = gfLow / 100;
    const gfHighDec = gfHigh / 100;

    // Get bottom gas
    const bottomGas = gases && gases.length > 0 ? gases[0] : { id: 'air', name: 'Air', o2: 0.2098, n2: 0.7902 };

    // Calculate NDL (uses GF Low since that determines first stop)
    const { ndl, ndlExact, controllingCompartment } = calculateNDL(maxDepth, bottomGas.n2, gfLowDec);

    const descentTime = roundUp(maxDepth / DESCENT_SPEED);
    // NOTE: this sync variant intentionally does NOT support
    // options.initialTissuePressures (repetitive-dive tissue seeding). Its
    // NDL early-return and surface-only tissue init assume a fresh surface
    // start. Callers needing a seeded profile must use the async
    // generateDecoProfile, which implements that seam.
    //
    // bottomTime and ndlExact are both measured from leaving the surface (calculateNDL
    // includes the descent), so they are compared directly — same as generateDecoProfile.
    const exceedsNDL = bottomTime > ndlExact;

    if (!exceedsNDL) {
        const waypoints = generateSimpleProfile(maxDepth, bottomTime, safetyStop, options);
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
    const { stops } = generateDecoSchedule(tissues, maxDepth, bottomGas.n2, gfLowDec, gfHighDec, gases, options);
    
    // Build waypoints
    const waypoints = [
        { time: 0, depth: 0 },
        { time: descentTime, depth: maxDepth, gasId: bottomGas.id },
        { time: bottomTime, depth: maxDepth }
    ];
    
    let currentTime = bottomTime;
    let currentDepth = maxDepth;
    
    // Snap currentTime to 0.1-min precision after each accumulation to avoid
    // IEEE-754 artifacts like 52.099999999999994 that leak into the editor.
    const snap = options.continuousDeco ? (t) => t : (t) => Math.round(t * 10) / 10;

    for (const stop of stops) {
        // Exact 10 m/min; fractional preserved so the ascent rate is correct.
        const ascentTime = (currentDepth - stop.depth) / ASCENT_SPEED;
        currentTime = snap(currentTime + ascentTime);
        waypoints.push({ time: currentTime, depth: stop.depth });

        currentTime = snap(currentTime + stop.time);
        waypoints.push({ time: currentTime, depth: stop.depth });

        currentDepth = stop.depth;
    }

    // Check if we need to add a safety stop (deco cleared before safety stop depth)
    const hasDecoAtOrBelowSafetyStop = stops.some(s => s.depth <= safetyStopDepth && s.depth > 0);
    const needsSafetyStop = safetyStopEnabled &&
                           maxDepth > safetyStopDepth &&
                           !hasDecoAtOrBelowSafetyStop;

    if (needsSafetyStop && currentDepth > safetyStopDepth) {
        // Add safety stop — exact ascent at 10 m/min
        const ascentTime = (currentDepth - safetyStopDepth) / ASCENT_SPEED;
        currentTime = snap(currentTime + ascentTime);
        waypoints.push({ time: currentTime, depth: safetyStopDepth });
        currentTime = snap(currentTime + safetyStopTime);
        waypoints.push({ time: currentTime, depth: safetyStopDepth });
        currentDepth = safetyStopDepth;
    }

    if (currentDepth > 0) {
        // Final ascent at exact 10 m/min
        const finalAscentTime = currentDepth / ASCENT_SPEED;
        currentTime = snap(currentTime + finalAscentTime);
        waypoints.push({ time: currentTime, depth: 0 });
    }
    
    return {
        waypoints,
        ndl,
        // See generateDecoProfile: an empty stop list above the NDL is a legitimate
        // sub-3 m obligation, not a contradiction.
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
 * @param {number} gfLow - GF Low as percentage (0-100), determines first stop
 * @returns {{ndl: number, controllingCompartment: number}}
 */
export function getNDLForDepth(depth, gas, gfLow) {
    const n2 = gas?.n2 ?? N2_FRACTION;
    return calculateNDL(depth, n2, gfLow / 100);
}

/**
 * Fraction of the NDL above which the dive is reported as approaching the limit.
 */
export const NDL_NEAR_LIMIT_FRACTION = 0.9;

/**
 * Classify a dive against its no-decompression limit.
 *
 * Both numbers are measured from the start of the dive: bottom time runs from
 * leaving the surface, and `calculateNDL` reports the NDL the way dive tables do
 * — descent included. They are therefore compared directly, with no correction.
 * Subtracting the descent here would count it twice.
 *
 * @param {number} ndl - No-decompression limit in minutes, from the start of the dive (may be Infinity)
 * @param {number} bottomTime - Bottom time in minutes, measured from leaving the surface
 * @returns {{state: 'unlimited'|'ok'|'nearLimit'|'deco', remaining: number}}
 */
export function getNDLStatus(ndl, bottomTime) {
    if (!Number.isFinite(ndl)) {
        return { state: 'unlimited', remaining: Infinity };
    }
    if (bottomTime > ndl) {
        return { state: 'deco', remaining: 0 };
    }
    const remaining = ndl - bottomTime;
    const state = bottomTime > ndl * NDL_NEAR_LIMIT_FRACTION ? 'nearLimit' : 'ok';
    return { state, remaining };
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
    return setup.surfaceInterval ?? 15;
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
    const ambient = SURFACE_PRESSURE + depth / 10;
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
            o2: 0.2098,
            n2: 0.7902,
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
        return { id: 'air', name: 'Air', o2: 0.2098, n2: 0.7902, he: 0 };
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
        return gases?.[0] || { id: 'air', name: 'Air', o2: 0.2098, n2: 0.7902, he: 0 };
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
export function insertGasSwitchWaypoints(waypoints, gases, ascentRate = 10, maxPpO2 = 1.6, gasSwitchTime = DEFAULT_GAS_SWITCH_TIME) {
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
                        const switchDepartureTime = switchArrivalTime + gasSwitchTime;
                        
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
                        timeOffset += gasSwitchTime;
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
    
    return `${maxDepth}\u00a0m ${gasNames}`;
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
    
    return `${setup.name}: ${maxDepth}\u00a0m max depth, ${totalTime}\u00a0min total, ${gasNames}${diveInfo}`;
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

/**
 * Shared gas-consumption integrator used by the chart line AND the warning /
 * Gas Summary blocks. Walks simulated time-points (from calculateTissueLoading)
 * and computes per-gas consumption and remaining pressure using the SAME
 * convention everywhere: sacRate for moving phases and the bottom, decoSacRate
 * for stationary stops (depth unchanged, depth > 0) AFTER the diver has left
 * max depth — except gas-switch stops, which use sacRate so they don't count
 * as deco stops.
 *
 * @param {Object} results           Output of calculateTissueLoading (needs timePoints, depthPoints, gasSwitches).
 * @param {Array}  gases             Dive-setup gases (each {id, name, cylinderVolume, startPressure}).
 * @param {number} sacRate           L/min at surface, bottom/descent/ascent.
 * @param {number} [decoSacRate]     L/min for deco/safety stops (defaults to sacRate).
 * @param {number} [reservePressure] bar — carried through to the summary so callers share one threshold.
 * @returns {{
 *   pressureByGasId: Object,        final remaining pressure (bar), per gas id
 *   consumedByGasId: Object,        L consumed per gas id
 *   pressureSeries:  Object,        per-gas array of remaining pressure at each timepoint (for chart lines)
 *   totalConsumed:   number
 * }}
 */
export function computeGasConsumption(results, gases, sacRate, decoSacRate, reservePressure = 50) {
    const pressureByGasId = {};
    const consumedByGasId = {};
    const pressureSeries = {};
    for (const g of gases) {
        pressureByGasId[g.id] = g.startPressure ?? 200;
        consumedByGasId[g.id] = 0;
        pressureSeries[g.id] = [];
    }
    if (!results || !results.timePoints || results.timePoints.length === 0) {
        return { pressureByGasId, consumedByGasId, pressureSeries, totalConsumed: 0 };
    }

    // Build gas-switch time → gasId map
    const gasSwitchTimes = {};
    if (results.gasSwitches) {
        for (const sw of results.gasSwitches) gasSwitchTimes[sw.time] = sw.gasId;
    }

    const maxDepth = Math.max(...results.depthPoints);
    let leftMaxDepth = false;
    let gasSwitchActive = false;
    let gasSwitchDepth = null;
    let currentGasId = gases[0]?.id;

    for (let i = 0; i < results.timePoints.length; i++) {
        const time = results.timePoints[i];
        const depth = results.depthPoints[i];

        if (!leftMaxDepth && i > 0 && results.depthPoints[i - 1] >= maxDepth && depth < maxDepth) {
            leftMaxDepth = true;
        }

        if (gasSwitchTimes[time]) {
            currentGasId = gasSwitchTimes[time];
            gasSwitchActive = true;
            gasSwitchDepth = depth;
        }

        if (i > 0) {
            const prevTime = results.timePoints[i - 1];
            const prevDepth = results.depthPoints[i - 1];
            const deltaTime = time - prevTime;
            // Keep switch-mode active while diver stays at the switch depth;
            // clear once they move off it (ascending out of the switch stop).
            if (gasSwitchActive && depth !== gasSwitchDepth) gasSwitchActive = false;
            if (!(depth === 0 && prevDepth === 0)) {
                const avgDepth = (depth + prevDepth) / 2;
                const ambient = SURFACE_PRESSURE + avgDepth / 10;
                const isDecoStop = leftMaxDepth && depth === prevDepth && depth > 0 && !gasSwitchActive;
                const sac = isDecoStop ? decoSacRate : sacRate;
                const consumed = sac * ambient * deltaTime;
                if (consumedByGasId[currentGasId] !== undefined) {
                    consumedByGasId[currentGasId] += consumed;
                    const gas = gases.find(g => g.id === currentGasId);
                    if (gas && gas.cylinderVolume > 0) {
                        const drop = consumed / gas.cylinderVolume;
                        pressureByGasId[currentGasId] = Math.max(0, pressureByGasId[currentGasId] - drop);
                    }
                }
            }
        }

        // Record per-timepoint remaining pressure for chart lines
        for (const g of gases) {
            pressureSeries[g.id].push(pressureByGasId[g.id]);
        }
    }

    let totalConsumed = 0;
    for (const id of Object.keys(consumedByGasId)) totalConsumed += consumedByGasId[id];

    return { pressureByGasId, consumedByGasId, pressureSeries, totalConsumed };
}

/**
 * Build a read-only dive-plan (RunTime) table for a set of waypoints.
 *
 * Returns an HTML string containing separate Bottom and Ascent runtime tables
 * with one row per dive segment (descent / bottom / ascent / stop / gas switch /
 * surface) and columns: Phase, Depth, Stop, Runtime, Gas, Tank.
 *
 * Tank pressure is tracked per-gas across the dive. Rows where the tracked
 * pressure falls at or below the gas's reservePressure (or the `reserve`
 * fallback) are tagged with `danger-row` for red highlight.
 *
 * Returns an empty string if fewer than 2 waypoints are provided.
 *
 * @param {Array<{time:number, depth:number, gasId?:string}>} waypoints
 * @param {Array<{id:string, name:string, cylinderVolume?:number, startPressure?:number, reservePressure?:number}>} gases
 * @param {Object} [opts]
 * @param {number} [opts.sacRate=20]       Bottom/descent/ascent SAC (L/min).
 * @param {number} [opts.decoSacRate=15]   Deco-stop / safety-stop SAC.
 * @param {number} [opts.reserve=50]       Fallback reserve pressure (bar).
 * @returns {string}  HTML for the plan table (or '').
 */
export function renderDivePlanTableHTML(waypoints, gases, opts = {}) {
    if (!Array.isArray(waypoints) || waypoints.length < 2) return '';
    const sacRate = opts.sacRate ?? 20;
    const decoSacRate = opts.decoSacRate ?? 15;
    const reserve = opts.reserve ?? 50;
    const gasList = Array.isArray(gases) ? gases : [];

    const maxDepth = Math.max(...waypoints.map(wp => wp.depth));
    let leftMax = false;
    let prevGasId = waypoints[0].gasId;
    const segments = [];

    const pressureByGasId = {};
    for (const g of gasList) {
        pressureByGasId[g.id] = g.startPressure ?? 200;
    }

    const phaseLabels = {
        des: translate('divePlan.phaseDescent', 'Des'),
        bottom: translate('divePlan.phaseBottom', 'Bottom'),
        surface: translate('divePlan.phaseSurface', 'Surface'),
        asc: translate('divePlan.phaseAscent', 'Asc'),
        switch: translate('divePlan.phaseSwitch', 'Switch'),
        stop: translate('divePlan.phaseStop', 'Stop')
    };

    for (let i = 0; i < waypoints.length - 1; i++) {
        const wp = waypoints[i];
        const next = waypoints[i + 1];
        const duration = Math.round((next.time - wp.time) * 10) / 10;
        const activeGasId = next.gasId || wp.gasId || prevGasId;
        const activeGas = gasList.find(g => g.id === activeGasId);
        const gasName = activeGas?.name || '';
        const runtime = Math.round(next.time * 10) / 10;

        // pushSeg attributes gas consumption to gasIdOverride (falling back to
        // this iteration's activeGasId) so a segment can be billed to a
        // different gas than the one shown by default — needed below to
        // charge an ascent leg to the OLD gas while a zero-duration switch
        // marker right after it introduces the NEW one.
        const pushSeg = (seg, gasIdOverride) => {
            const segGasId = gasIdOverride || activeGasId;
            const segGas = gasList.find(g => g.id === segGasId);
            const isDecoOrSafety = seg.cls === 'stop' || seg.cls === 'safety';
            const sac = isDecoOrSafety ? decoSacRate : sacRate;
            const avgDepth = (wp.depth + next.depth) / 2;
            const avgAmbient = 1 + avgDepth / 10;
            if (segGas && segGas.cylinderVolume > 0 && duration > 0) {
                const litersUsed = sac * avgAmbient * duration;
                const barDrop = litersUsed / segGas.cylinderVolume;
                pressureByGasId[segGasId] = Math.max(0, pressureByGasId[segGasId] - barDrop);
            }
            seg.tankBar = segGas && pressureByGasId[segGasId] !== undefined
                ? Math.round(pressureByGasId[segGasId])
                : null;
            seg.gasId = segGasId;
            segments.push(seg);
        };

        if (next.depth > wp.depth) {
            pushSeg({ cls: 'des', icon: '↓', label: phaseLabels.des, depth: next.depth, stop: duration, runtime, gas: gasName });
        } else if (next.depth === wp.depth && next.depth === maxDepth && !leftMax) {
            pushSeg({ cls: 'bottom', icon: '●', label: phaseLabels.bottom, depth: wp.depth, stop: duration, runtime, gas: gasName });
        } else if (next.depth === 0 && wp.depth === 0) {
            // already at surface — skip
        } else if (next.depth === 0 && wp.depth > 0) {
            // Final surface ascent — blank stop column; it's just a surfacing
            // marker, not a deco duration worth showing as a number.
            leftMax = true;
            pushSeg({ cls: 'asc', icon: '▲', label: phaseLabels.surface, isSurface: true, depth: 0, stop: '', runtime, gas: '' });
        } else if (next.depth < wp.depth) {
            leftMax = true;
            // A gas switch taken exactly upon arrival (next.gasId differs from
            // the gas breathed during the climb) must not relabel the whole
            // ascent leg with the new gas — that reads as "already on deco gas
            // while still 20 m above its MOD". Bill the ascent to the OLD gas.
            const transitGasId = wp.gasId || prevGasId;
            const transitGas = gasList.find(g => g.id === transitGasId);
            const gasChanged = next.gasId && transitGasId && next.gasId !== transitGasId;
            pushSeg({ cls: 'asc', icon: '↑', label: phaseLabels.asc, depth: next.depth, stop: duration, runtime, gas: transitGas?.name || '' }, transitGasId);
            // If the switch has its own configured stop time (a following
            // waypoint at the SAME depth — e.g. generateDecoProfile's
            // gasSwitchTime), don't add a zero-duration marker here: let the
            // stationary branch below render ONE switch row carrying that
            // real duration, so the table doesn't ignore the configured time.
            // Only a switch with no dedicated stop (purely in transit, ascent
            // continues immediately) gets our own instant marker row.
            const nextNext = waypoints[i + 2];
            const hasDedicatedSwitchStop = gasChanged && nextNext && nextNext.depth === next.depth;
            if (gasChanged && !hasDedicatedSwitchStop) {
                // Blank ('' not 0) Stop cell — this is an instant marker, not
                // a measured zero-length stop, matching the surface-row convention.
                pushSeg({ cls: 'switch', icon: '⇄', label: phaseLabels.switch, depth: next.depth, stop: '', runtime, gas: gasName }, next.gasId);
            }
            if (hasDedicatedSwitchStop) {
                // Keep prevGasId at the OLD gas so the upcoming stationary
                // segment (arrival -> departure at the switch depth) still
                // sees the change and renders it as a 'switch' row below.
                prevGasId = transitGasId;
                continue;
            }
        } else if (next.depth === wp.depth && next.depth > 0) {
            leftMax = true;
            const gasChanged = wp.gasId && wp.gasId !== prevGasId;
            if (gasChanged) {
                pushSeg({ cls: 'switch', icon: '⇄', label: phaseLabels.switch, depth: wp.depth, stop: duration, runtime, gas: gasName });
            } else {
                pushSeg({ cls: 'stop', icon: '■', label: phaseLabels.stop, depth: wp.depth, stop: duration, runtime, gas: gasName });
            }
        }
        // prevGasId tracks the gas actually in effect once this leg completes
        // (== activeGasId), not merely wp.gasId — otherwise a switch taken
        // exactly on arrival (handled above) would still look "unseen" to
        // the very next iteration's stationary-switch check and double-fire
        // a second switch row for a stop starting at that same waypoint.
        prevGasId = activeGasId;
    }

    if (segments.length === 0) return '';

    // Fold each inter-stop ascent into the PRECEDING stop row. Effect:
    // "Stop 6m 1 min runT 33" means "at runtime 33 the diver reaches the next
    // level (3m) — the 1 min spans arrival-at-6m to arrival-at-3m, the final
    // 0.3 min of which is the ascent." Runtimes in the table then line up
    // with the chart's integer-grid arrivals at each next level.
    //
    // Gas-switch rows never merge — they stay their own line, with the ascent
    // leading INTO them also preserved. This is load-bearing UX for tech
    // diving.
    for (let i = segments.length - 1; i >= 0; i--) {
        const seg = segments[i];
        if (seg.cls !== 'asc') continue;
        if (seg.isSurface) continue;                 // final surface handled below
        const prev = segments[i - 1];
        const next = segments[i + 1];
        if (!prev || !next) continue;
        if (prev.cls !== 'stop') continue;           // only merge stop→asc→stop chains
        if (next.cls !== 'stop') continue;           // do not fold into a switch row
        // Extend the preceding stop row to absorb the ascent: runtime moves
        // forward to the ascent's end (arrival at next level), and the
        // displayed stop duration now covers stay + ascent-out.
        const ascDuration = seg.runtime - prev.runtime;
        prev.stop = Math.round(((typeof prev.stop === 'number' ? prev.stop : 0) + ascDuration) * 10) / 10;
        prev.runtime = seg.runtime;
        segments.splice(i, 1);
    }

    // Drop the final Surface marker and extend the preceding stop so its row
    // "ends on the surface" — same spirit as inter-stop folding.
    //
    // Note: we do NOT add the final-ascent duration onto prev.stop. After the
    // inter-stop merge above, prev.stop already represents the effective
    // duration at this depth (in display terms). Adding the 0.3-ish min of
    // the final 3m→0 ascent on top would give 10.6→11, double-counting.
    // Instead we keep prev.stop as-is and only move prev.runtime to surface
    // arrival, so the row reads "Stop 3m, 10 min, runT 43" exactly like the
    // industry-standard table.
    //
    // We skip if the preceding row is a switch — preserves gas-switch row
    // visibility (switches are load-bearing UX for tech diving).
    const lastIdx = segments.length - 1;
    if (lastIdx >= 1 && segments[lastIdx].isSurface) {
        const prev = segments[lastIdx - 1];
        if (prev && prev.cls === 'stop') {
            prev.runtime = segments[lastIdx].runtime;
            segments.splice(lastIdx, 1);
        }
    }

    // Display runtime rounded to whole minutes (matches Divesoft). To keep
    // the Stop column internally consistent with the Runtime column
    // (so `runtime[i] − runtime[i-1]` always equals the displayed Stop), we
    // compute displayed Stop as the integer runtime delta, not as the raw
    // segment duration. Independently rounding two fractional runtimes can
    // otherwise create a 1-minute discrepancy (e.g., runtime 43 → 47 but
    // raw 3.3 min rounds to 3, missing 1 min).
    const displayRuntimes = segments.map(s => Math.round(s.runtime));
    // Bottom = descent + bottom-time rows; Ascent = everything after leaving
    // the bottom (stops, gas switches, ascents).
    const bottomRowsHtml = [];
    const ascentRowsHtml = [];
    segments.forEach((s, i) => {
        const tankCell = s.tankBar !== null && s.tankBar !== undefined ? `${s.tankBar}\u00a0bar` : '—';
        const gas = gasList.find(g => g.id === s.gasId);
        const threshold = gas?.reservePressure ?? reserve;
        const belowReserve = s.tankBar !== null && s.tankBar !== undefined && s.tankBar <= threshold;
        const trClass = belowReserve ? `dse-plan-${s.cls} danger-row` : `dse-plan-${s.cls}`;

        const runtimeDisplay = displayRuntimes[i];
        // First row's "stop" is its own duration; subsequent rows derive it
        // from the runtime delta so the table stays internally consistent.
        let stopDisplay;
        if (s.stop === '' || s.stop === undefined || s.stop === null) {
            stopDisplay = '';
        } else if (i === 0) {
            stopDisplay = Math.round(s.stop);
        } else {
            stopDisplay = runtimeDisplay - displayRuntimes[i - 1];
        }
        const rowHtml = `<tr class="${trClass}">` +
            `<td class="dse-plan-phase"><span class="dse-plan-icon">${escHtml(s.icon)}</span> ${escHtml(s.label)}</td>` +
            `<td class="dse-plan-depth">${s.depth}\u00a0m</td>` +
            `<td class="dse-plan-stop">${stopDisplay || stopDisplay === 0 ? stopDisplay : '—'}</td>` +
            `<td class="dse-plan-runtime">${runtimeDisplay}</td>` +
            `<td class="dse-plan-gas">${escHtml(s.gas)}</td>` +
            `<td class="dse-plan-tank">${tankCell}</td>` +
            `</tr>`;
        const targetRows = s.cls === 'des' || s.cls === 'bottom'
            ? bottomRowsHtml
            : ascentRowsHtml;
        targetRows.push(rowHtml);
    });

    // Terminal Hladina/Surface row: purely informational marker that the
    // dive has ended, not a real segment (blank duration/runtime/gas/tank).
    ascentRowsHtml.push(`<tr class="dse-plan-surface-final">` +
        `<td class="dse-plan-phase"><span class="dse-plan-icon">▲</span> ${phaseLabels.surface}</td>` +
        `<td class="dse-plan-depth">0\u00a0m</td>` +
        `<td class="dse-plan-stop">—</td>` +
        `<td class="dse-plan-runtime">—</td>` +
        `<td class="dse-plan-gas">—</td>` +
        `<td class="dse-plan-tank">—</td>` +
        `</tr>`);

    const tableHtml = (caption, rows) => `<table class="dse-plan-table">` +
        `<caption>${caption}</caption>` +
        `<thead><tr>` +
            `<th>${translate('divePlan.colPhase', 'Phase')}</th>` +
            `<th>${translate('divePlan.colDepth', 'Depth')}</th>` +
            `<th>${translate('divePlan.colStop', 'Stop')}</th>` +
            `<th>${translate('divePlan.colRuntime', 'Runtime')} *</th>` +
            `<th>${translate('divePlan.colGas', 'Gas')}</th>` +
            `<th>${translate('divePlan.colTank', 'Tank')}</th>` +
        `</tr></thead>` +
        `<tbody>${rows.join('')}</tbody>` +
        `</table>`;

    return `<div class="dse-plan-tables">` +
        tableHtml(translate('divePlan.sectionBottom', 'Bottom'), bottomRowsHtml) +
        tableHtml(translate('divePlan.sectionAscent', 'Ascent'), ascentRowsHtml) +
        `</div>` +
        `<p class="dse-plan-footnote">* ${translate('divePlan.runtimeFootnote', 'end time of the stage')}</p>`;
}