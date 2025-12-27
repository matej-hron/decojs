/**
 * Dive Profile Management
 * 
 * Handles parsing, validation, and management of dive profile waypoints.
 */

/**
 * Create a default dive profile for demonstration
 * @returns {Array<{time: number, depth: number}>} Default profile
 */
export function createDefaultProfile() {
    return [
        { time: 0, depth: 0 },      // Start at surface
        { time: 2, depth: 30 },     // Descend to 30m over 2 minutes
        { time: 25, depth: 30 },    // Stay at 30m until 25 minutes
        { time: 26, depth: 5 },     // Ascend to 5m safety stop
        { time: 29, depth: 5 },     // 3 minute safety stop
        { time: 30, depth: 0 }      // Surface
    ];
}

/**
 * Validate a dive profile
 * @param {Array<{time: number, depth: number}>} profile - Profile to validate
 * @returns {{valid: boolean, errors: string[]}} Validation result
 */
export function validateProfile(profile) {
    const errors = [];

    if (!Array.isArray(profile)) {
        return { valid: false, errors: ["Profile must be an array"] };
    }

    if (profile.length < 2) {
        errors.push("Profile must have at least 2 waypoints");
    }

    // Check first waypoint
    if (profile.length > 0) {
        if (profile[0].time !== 0) {
            errors.push("First waypoint must be at time 0");
        }
        if (profile[0].depth !== 0) {
            errors.push("First waypoint should be at surface (0m)");
        }
    }

    // Check each waypoint
    for (let i = 0; i < profile.length; i++) {
        const wp = profile[i];
        
        // Check for required properties
        if (typeof wp.time !== 'number' || isNaN(wp.time)) {
            errors.push(`Waypoint ${i + 1}: Invalid time value`);
            continue;
        }
        if (typeof wp.depth !== 'number' || isNaN(wp.depth)) {
            errors.push(`Waypoint ${i + 1}: Invalid depth value`);
            continue;
        }

        // Check for negative values
        if (wp.time < 0) {
            errors.push(`Waypoint ${i + 1}: Time cannot be negative`);
        }
        if (wp.depth < 0) {
            errors.push(`Waypoint ${i + 1}: Depth cannot be negative`);
        }

        // Check time is ascending
        if (i > 0 && wp.time <= profile[i - 1].time) {
            errors.push(`Waypoint ${i + 1}: Time must be greater than previous waypoint`);
        }

        // Safety warnings (not errors)
        if (wp.depth > 60) {
            errors.push(`Warning: Waypoint ${i + 1} depth (${wp.depth}m) exceeds recreational limits`);
        }
    }

    // Check last waypoint ends at surface
    if (profile.length > 0) {
        const lastWp = profile[profile.length - 1];
        if (lastWp.depth !== 0) {
            errors.push("Warning: Dive should end at surface (0m)");
        }
    }

    return {
        valid: errors.filter(e => !e.startsWith("Warning")).length === 0,
        errors
    };
}

/**
 * Parse profile from table input data
 * @param {Array<{time: string, depth: string}>} inputData - Raw input from table
 * @returns {Array<{time: number, depth: number}>} Parsed profile
 */
export function parseProfileInput(inputData) {
    return inputData.map(row => ({
        time: parseFloat(row.time) || 0,
        depth: parseFloat(row.depth) || 0
    }));
}

/**
 * Calculate descent/ascent rates between waypoints
 * @param {Array<{time: number, depth: number}>} profile - Dive profile
 * @returns {Array<{from: number, to: number, rate: number, type: string}>} Rate info
 */
export function calculateRates(profile) {
    const rates = [];
    
    for (let i = 0; i < profile.length - 1; i++) {
        const wp1 = profile[i];
        const wp2 = profile[i + 1];
        const timeDiff = wp2.time - wp1.time;
        const depthDiff = wp2.depth - wp1.depth;
        
        if (timeDiff > 0) {
            const rate = Math.abs(depthDiff / timeDiff);
            rates.push({
                from: i,
                to: i + 1,
                rate: rate,
                type: depthDiff > 0 ? 'descent' : depthDiff < 0 ? 'ascent' : 'level'
            });
        }
    }
    
    return rates;
}

/**
 * Get dive statistics
 * @param {Array<{time: number, depth: number}>} profile - Dive profile
 * @returns {Object} Dive statistics
 */
export function getDiveStats(profile) {
    if (!profile || profile.length < 2) {
        return null;
    }

    const maxDepth = Math.max(...profile.map(wp => wp.depth));
    const totalTime = profile[profile.length - 1].time;
    const rates = calculateRates(profile);
    
    const maxDescentRate = Math.max(...rates.filter(r => r.type === 'descent').map(r => r.rate), 0);
    const maxAscentRate = Math.max(...rates.filter(r => r.type === 'ascent').map(r => r.rate), 0);

    return {
        maxDepth,
        totalTime,
        maxDescentRate,
        maxAscentRate,
        waypointCount: profile.length
    };
}
