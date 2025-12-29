/**
 * Dive Setup Module
 * 
 * Provides centralized dive configuration that can be shared across
 * different pages/sections. Supports loading from JSON and extending
 * with page-specific overrides.
 */

// Default path to dive setup JSON
const DEFAULT_SETUP_PATH = 'data/dive-setup.json';

// Cached dive setup
let cachedSetup = null;

/**
 * Predefined gas mixes commonly used in diving
 * Each gas has: name, o2 (oxygen fraction), n2 (nitrogen fraction), he (helium fraction)
 */
export const PREDEFINED_GASES = [
    { id: 'air', name: 'Air', o2: 0.21, n2: 0.79, he: 0 },
    { id: 'ean32', name: 'Nitrox 32 (EAN32)', o2: 0.32, n2: 0.68, he: 0 },
    { id: 'ean36', name: 'Nitrox 36 (EAN36)', o2: 0.36, n2: 0.64, he: 0 },
    { id: 'ean50', name: 'Nitrox 50 (EAN50)', o2: 0.50, n2: 0.50, he: 0 },
    { id: 'tx21_35', name: 'Trimix 21/35', o2: 0.21, n2: 0.44, he: 0.35 },
    { id: 'tx18_45', name: 'Trimix 18/45', o2: 0.18, n2: 0.37, he: 0.45 },
    { id: 'tx10_70', name: 'Trimix 10/70', o2: 0.10, n2: 0.20, he: 0.70 },
    { id: 'o2', name: 'Pure Oxygen (100%)', o2: 1.0, n2: 0, he: 0 }
];

/**
 * Get a predefined gas by ID
 * @param {string} id - Gas ID (e.g., 'air', 'ean32')
 * @returns {Object|null} Gas object or null if not found
 */
export function getPredefinedGas(id) {
    return PREDEFINED_GASES.find(g => g.id === id) || null;
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
        gasMix: {
            name: "Air",
            o2: 0.21,
            n2: 0.79,
            he: 0
        },
        surfaceInterval: 60,
        units: {
            depth: "meters",
            time: "minutes",
            pressure: "bar"
        },
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
    };
}

/**
 * Extend dive setup with custom overrides
 * Performs deep merge for nested objects like gasMix and units
 * @param {Object} baseSetup - Base dive setup
 * @param {Object} overrides - Override values
 * @returns {Object} Merged dive setup
 */
export function extendDiveSetup(baseSetup, overrides) {
    const merged = { ...baseSetup };
    
    for (const key of Object.keys(overrides)) {
        if (key === 'gasMix' || key === 'units') {
            // Deep merge for nested objects
            merged[key] = { ...baseSetup[key], ...overrides[key] };
        } else if (key === 'waypoints') {
            // Replace waypoints entirely if provided
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
            merged.push({
                time: wp.time + timeOffset,
                depth: wp.depth
            });
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
 * Get waypoints from dive setup (convenience function for backward compatibility)
 * Handles both legacy single-waypoints format and new multi-dive format
 * @param {Object} setup - Dive setup object
 * @returns {Array<{time: number, depth: number}>} Waypoints array
 */
export function getDiveSetupWaypoints(setup) {
    // New multi-dive format
    if (setup.dives && setup.dives.length > 0) {
        return mergeDivesIntoTimeline(setup.dives);
    }
    
    // Legacy single waypoints format
    return setup.waypoints.map(wp => ({
        time: wp.time,
        depth: wp.depth
    }));
}

/**
 * Get surface interval from dive setup
 * @param {Object} setup - Dive setup object
 * @returns {number} Surface interval in minutes
 */
export function getSurfaceInterval(setup) {
    return setup.surfaceInterval || 60;
}

/**
 * Get N2 fraction from gas mix
 * @param {Object} setup - Dive setup object
 * @returns {number} N2 fraction (0-1)
 */
export function getN2Fraction(setup) {
    return setup.gasMix?.n2 || 0.79;
}

/**
 * Get O2 fraction from gas mix
 * @param {Object} setup - Dive setup object
 * @returns {number} O2 fraction (0-1)
 */
export function getO2Fraction(setup) {
    return setup.gasMix?.o2 || 0.21;
}

/**
 * Get He fraction from gas mix
 * @param {Object} setup - Dive setup object
 * @returns {number} He fraction (0-1)
 */
export function getHeFraction(setup) {
    return setup.gasMix?.he || 0;
}

/**
 * Get gas mix object from setup
 * @param {Object} setup - Dive setup object
 * @returns {Object} Gas mix object with name, o2, n2, he
 */
export function getGasMix(setup) {
    return setup.gasMix || { name: 'Air', o2: 0.21, n2: 0.79, he: 0 };
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
 * Get cylinder volume in liters
 * @param {Object} setup - Dive setup object
 * @returns {number} Cylinder volume in liters
 */
export function getCylinderVolume(setup) {
    return setup.cylinderVolume || 12;
}

/**
 * Get reserve pressure in bar
 * @param {Object} setup - Dive setup object
 * @returns {number} Reserve pressure in bar
 */
export function getReservePressure(setup) {
    return setup.reservePressure || 50;
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
 * Format dive setup summary for display
 * @param {Object} setup - Dive setup object
 * @returns {string} Human-readable summary
 */
export function formatDiveSetupSummary(setup) {
    const waypoints = getDiveSetupWaypoints(setup);
    const maxDepth = Math.max(...waypoints.map(wp => wp.depth));
    const totalTime = waypoints[waypoints.length - 1]?.time || 0;
    const gasMix = setup.gasMix?.name || 'Air';
    
    // Check if multi-dive
    const diveCount = setup.dives?.length || 1;
    const diveInfo = diveCount > 1 ? ` (${diveCount} dives)` : '';
    
    return `${setup.name}: ${maxDepth}m max depth, ${totalTime} min total, ${gasMix}${diveInfo}`;
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