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
