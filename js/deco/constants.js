/**
 * Decompression Model — shared constants.
 *
 * Extracted verbatim from js/decoModel.js; js/decoModel.js re-exports the
 * public surface so existing importers are unaffected.
 */

/** Calculation interval in seconds */
export const CALC_INTERVAL = 10;

/** Surface atmospheric pressure in bar (1 atm exactly) */
export const SURFACE_PRESSURE = 1.01325;

/** Water vapor pressure at body temperature (37°C) in bar */
export const WATER_VAPOR_PRESSURE = 0.0627;

/**
 * Effective N2-equivalent fraction in air. Textbook value is 0.79, but
 * decompression models lump argon (~0.93%) with nitrogen, giving 0.7902.
 */
export const N2_FRACTION = 0.7902;

/** Standard gravitational acceleration in m/s². */
export const STANDARD_GRAVITY = 9.80665;

/** Supported depth-to-pressure conventions. */
export const WATER_TYPES = Object.freeze({
    STANDARD: 'standard',
    FRESH: 'fresh',
    SEA: 'sea'
});

/** Reference water densities in kg/m³. */
export const WATER_DENSITIES = Object.freeze({
    [WATER_TYPES.STANDARD]: 1019.716,
    [WATER_TYPES.FRESH]: 1000,
    [WATER_TYPES.SEA]: 1025
});

/** EN 13319 indicated-depth convention: exactly 0.1 bar per metre. */
export const PRESSURE_PER_METER = 0.1;

/** Default Gradient Factors (100% = use raw Bühlmann M-values) */
export const DEFAULT_GF_LOW = 1.0;   // 100%

export const DEFAULT_GF_HIGH = 1.0;  // 100%

/** Descent speed in m/min for NDL calculations */
export const DESCENT_SPEED = 20;

/** Ascent speed in m/min for deco calculations */
export const ASCENT_SPEED = 10;

/** Deco stop increment in meters */
export const STOP_INCREMENT = 3;
