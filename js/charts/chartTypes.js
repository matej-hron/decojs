/**
 * Chart Component Type Definitions
 * 
 * This module defines the contracts for embeddable chart components.
 * Charts accept a DiveSetup configuration and handle all calculations internally,
 * making them truly reusable across different contexts (Theory pages, Sandbox, 
 * external presentations, etc.)
 */

/**
 * @typedef {Object} Gas
 * @property {string} id - Unique gas identifier
 * @property {string} name - Display name (e.g., "Nitrox 32")
 * @property {number} o2 - Oxygen fraction (0-1)
 * @property {number} n2 - Nitrogen fraction (0-1)
 * @property {number} he - Helium fraction (0-1)
 * @property {number} [cylinderVolume] - Cylinder volume in liters (optional)
 * @property {number} [startPressure] - Starting pressure in bar (optional)
 */

/**
 * @typedef {Object} Waypoint
 * @property {number} time - Time in minutes from dive start
 * @property {number} depth - Depth in meters
 * @property {string} [gasId] - Gas ID if gas switch occurs at this waypoint
 * @property {string} [note] - Optional note for this waypoint
 */

/**
 * @typedef {Object} Dive
 * @property {Waypoint[]} waypoints - Array of waypoints defining the dive profile
 */

/**
 * @typedef {Object} Units
 * @property {'meters'|'feet'} depth - Depth unit
 * @property {'minutes'} time - Time unit
 * @property {'bar'|'psi'} pressure - Pressure unit
 */

/**
 * @typedef {Object} DiveSetup
 * @property {string} [name] - Profile name for display
 * @property {string} [description] - Profile description
 * @property {Gas[]} gases - Available gases for the dive
 * @property {number} [reservePressure=50] - Reserve pressure in bar
 * @property {number} [sacRate=20] - Surface Air Consumption rate in liters/min
 * @property {number} [gfLow=100] - Gradient Factor Low (0-100 percentage)
 * @property {number} [gfHigh=100] - Gradient Factor High (0-100 percentage)
 * @property {number} [surfaceInterval=60] - Post-dive surface interval in minutes
 * @property {Units} [units] - Unit preferences
 * @property {Dive[]} dives - Array of dives (supports repetitive diving)
 */

/**
 * @typedef {Object} EnvironmentConfig
 * @property {number} [altitude=0] - Altitude in meters above sea level
 * @property {number} [waterDensity=1.025] - Water density (1.0 for fresh, 1.025 for salt)
 * @property {number} [surfacePressure=1.0] - Surface atmospheric pressure in bar
 */

// ============================================================================
// Dive Profile Chart Options
// ============================================================================

/**
 * Display modes for the Dive Profile Chart
 * @typedef {'depth'|'pressure'|'partial-pressure'|'all'} DiveProfileMode
 * 
 * - 'depth': Simple depth vs time profile
 * - 'pressure': Depth with ambient pressure overlay
 * - 'partial-pressure': Depth with ppO2 and ppN2 overlays
 * - 'all': Full view with all overlays
 */

/**
 * @typedef {Object} DiveProfileChartOptions
 * @property {DiveProfileMode} [mode='depth'] - Display mode
 * @property {boolean} [showGasSwitches=true] - Highlight gas switch points
 * @property {boolean} [showDecoStops=true] - Annotate deco stops
 * @property {boolean} [showNDL=false] - Show NDL limit line
 * @property {boolean} [showCeiling=false] - Show deco ceiling line
 * @property {boolean} [showAmbientPressure=false] - Show ambient pressure axis
 * @property {boolean} [showPartialPressures=false] - Show ppO2/ppN2 traces
 * @property {boolean} [interactive=true] - Enable tooltips and hover
 * @property {boolean} [fullscreenButton=true] - Show fullscreen toggle
 * @property {number} [animationDuration=500] - Chart animation duration in ms
 * @property {Object} [colors] - Custom color overrides
 * @property {string} [colors.depth='#3498db'] - Depth line color
 * @property {string} [colors.ceiling='#e74c3c'] - Ceiling line color
 * @property {string} [colors.ppO2='#27ae60'] - ppO2 line color
 * @property {string} [colors.ppN2='#9b59b6'] - ppN2 line color
 */

// ============================================================================
// Tissue Pressure Chart Options
// ============================================================================

/**
 * Display modes for the Tissue Pressure Chart
 * @typedef {'loading'|'saturation'|'mvalue'|'ceiling'} TissuePressureMode
 * 
 * - 'loading': Basic tissue N2 loading over time
 * - 'saturation': Tissue saturation as percentage of M-value
 * - 'mvalue': Pressure-pressure diagram with M-value lines
 * - 'ceiling': Show ceiling depths per compartment
 */

/**
 * @typedef {Object} TissuePressureChartOptions
 * @property {TissuePressureMode} [mode='loading'] - Display mode
 * @property {number[]} [compartments] - Which compartments to show (1-16), default all
 * @property {boolean} [showMValueLines=false] - Show M-value limit lines
 * @property {boolean} [showAmbientLine=true] - Show ambient pressure reference
 * @property {boolean} [showGFLines=false] - Show GF-adjusted M-value lines
 * @property {boolean} [animate=false] - Animate through dive timeline
 * @property {number} [animationSpeed=1] - Animation speed multiplier
 * @property {boolean} [interactive=true] - Enable tooltips and hover
 * @property {boolean} [fullscreenButton=true] - Show fullscreen toggle
 * @property {boolean} [showLegend=true] - Show compartment legend
 * @property {boolean} [compartmentSelector=false] - Show compartment toggle checkboxes
 */

// ============================================================================
// Chart Component Configuration
// ============================================================================

/**
 * Full configuration object for chart components
 * 
 * @typedef {Object} ChartConfig
 * @property {DiveSetup} diveSetup - The dive configuration (gases, waypoints, GF, etc.)
 * @property {EnvironmentConfig} [environment] - Environmental settings
 * @property {DiveProfileChartOptions|TissuePressureChartOptions} [options] - Chart-specific options
 */

// ============================================================================
// Default Values
// ============================================================================

/**
 * Default environment configuration
 * @type {EnvironmentConfig}
 */
export const DEFAULT_ENVIRONMENT = {
    altitude: 0,
    waterDensity: 1.025,
    surfacePressure: 1.0
};

/**
 * Default dive profile chart options
 * @type {DiveProfileChartOptions}
 */
export const DEFAULT_DIVE_PROFILE_OPTIONS = {
    mode: 'depth',
    showGasSwitches: true,
    showDecoStops: true,
    showNDL: false,
    showCeiling: false,
    showAmbientPressure: false,
    showPartialPressures: false,
    showTissueLoading: false,
    showGasConsumption: false,
    showLabels: true,
    tissueCompartments: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16],
    interactive: true,
    fullscreenButton: true,
    animationDuration: 500,
    colors: {
        depth: '#3498db',
        ceiling: '#e74c3c',
        ppO2: '#27ae60',
        ppN2: '#9b59b6',
        ambient: '#f39c12'
    }
};

/**
 * Default tissue pressure chart options
 * @type {TissuePressureChartOptions}
 */
export const DEFAULT_TISSUE_PRESSURE_OPTIONS = {
    mode: 'loading',
    compartments: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16],
    showMValueLines: true,
    showAmbientLine: true,
    showGFLines: true,
    animate: false,
    animationSpeed: 1,
    interactive: true,
    fullscreenButton: true,
    showLegend: true,
    compartmentSelector: false
};

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Merge user options with defaults
 * @param {Object} defaults - Default options object
 * @param {Object} [userOptions] - User-provided options
 * @returns {Object} Merged options
 */
export function mergeOptions(defaults, userOptions) {
    if (!userOptions) return { ...defaults };
    
    const result = { ...defaults };
    for (const key of Object.keys(userOptions)) {
        if (userOptions[key] !== undefined) {
            if (typeof defaults[key] === 'object' && !Array.isArray(defaults[key])) {
                result[key] = { ...defaults[key], ...userOptions[key] };
            } else {
                result[key] = userOptions[key];
            }
        }
    }
    return result;
}

/**
 * Validate a DiveSetup configuration
 * @param {DiveSetup} setup - The dive setup to validate
 * @returns {{valid: boolean, errors: string[]}} Validation result
 */
export function validateDiveSetup(setup) {
    const errors = [];
    
    if (!setup) {
        errors.push('DiveSetup is required');
        return { valid: false, errors };
    }
    
    if (!setup.gases || !Array.isArray(setup.gases) || setup.gases.length === 0) {
        errors.push('At least one gas is required');
    } else {
        setup.gases.forEach((gas, i) => {
            if (typeof gas.o2 !== 'number' || gas.o2 < 0 || gas.o2 > 1) {
                errors.push(`Gas ${i + 1}: o2 must be a number between 0 and 1`);
            }
            if (typeof gas.n2 !== 'number' || gas.n2 < 0 || gas.n2 > 1) {
                errors.push(`Gas ${i + 1}: n2 must be a number between 0 and 1`);
            }
            const total = (gas.o2 || 0) + (gas.n2 || 0) + (gas.he || 0);
            if (Math.abs(total - 1) > 0.001) {
                errors.push(`Gas ${i + 1}: gas fractions must sum to 1 (got ${total.toFixed(3)})`);
            }
        });
    }
    
    if (!setup.dives || !Array.isArray(setup.dives) || setup.dives.length === 0) {
        errors.push('At least one dive is required');
    } else {
        setup.dives.forEach((dive, i) => {
            if (!dive.waypoints || !Array.isArray(dive.waypoints) || dive.waypoints.length < 2) {
                errors.push(`Dive ${i + 1}: at least 2 waypoints are required`);
            } else {
                dive.waypoints.forEach((wp, j) => {
                    if (typeof wp.time !== 'number' || wp.time < 0) {
                        errors.push(`Dive ${i + 1}, waypoint ${j + 1}: time must be a non-negative number`);
                    }
                    if (typeof wp.depth !== 'number' || wp.depth < 0) {
                        errors.push(`Dive ${i + 1}, waypoint ${j + 1}: depth must be a non-negative number`);
                    }
                });
                
                // Check waypoints are in time order
                for (let j = 1; j < dive.waypoints.length; j++) {
                    if (dive.waypoints[j].time < dive.waypoints[j - 1].time) {
                        errors.push(`Dive ${i + 1}: waypoints must be in ascending time order`);
                        break;
                    }
                }
            }
        });
    }
    
    if (setup.gfLow !== undefined && (setup.gfLow < 0 || setup.gfLow > 100)) {
        errors.push('gfLow must be between 0 and 100');
    }
    
    if (setup.gfHigh !== undefined && (setup.gfHigh < 0 || setup.gfHigh > 100)) {
        errors.push('gfHigh must be between 0 and 100');
    }
    
    return { valid: errors.length === 0, errors };
}

/**
 * Normalize a DiveSetup by applying defaults for missing optional fields
 * @param {DiveSetup} setup - The dive setup to normalize
 * @returns {DiveSetup} Normalized setup with all fields populated
 */
export function normalizeDiveSetup(setup) {
    return {
        name: setup.name || 'Unnamed Dive',
        description: setup.description || '',
        gases: setup.gases.map(gas => ({
            id: gas.id || `gas-${Math.random().toString(36).substr(2, 9)}`,
            name: gas.name || 'Custom Gas',
            o2: gas.o2,
            n2: gas.n2,
            he: gas.he || 0,
            cylinderVolume: gas.cylinderVolume || 12,
            startPressure: gas.startPressure || 200
        })),
        reservePressure: setup.reservePressure ?? 50,
        gfLow: setup.gfLow ?? 100,
        gfHigh: setup.gfHigh ?? 100,
        surfaceInterval: setup.surfaceInterval ?? 60,
        units: {
            depth: setup.units?.depth || 'meters',
            time: setup.units?.time || 'minutes',
            pressure: setup.units?.pressure || 'bar'
        },
        dives: setup.dives
    };
}
