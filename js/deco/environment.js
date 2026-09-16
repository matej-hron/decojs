/**
 * Decompression Model — ambient/surface pressure and altitude.
 *
 * Extracted verbatim from js/decoModel.js; js/decoModel.js re-exports the
 * public surface so existing importers are unaffected.
 */

import { PRESSURE_PER_METER, STANDARD_GRAVITY, SURFACE_PRESSURE, WATER_DENSITIES, WATER_TYPES, WATER_VAPOR_PRESSURE } from './constants.js';

/** Calculate standard-atmosphere pressure for an altitude in meters. */
export function getPressureAtAltitude(altitude = 0) {
    if (!Number.isFinite(altitude)) {
        throw new TypeError('Altitude must be a finite number');
    }
    const base = 1 - 2.25577e-5 * altitude;
    if (base <= 0) {
        throw new RangeError('Altitude is outside the supported standard-atmosphere range');
    }
    return SURFACE_PRESSURE * Math.pow(base, 5.25588);
}

/**
 * Resolve surface pressure from a dive environment.
 * An explicit pressure is useful for reference testing; normal UI setups store altitude.
 */
export function getSurfacePressure(environment = null) {
    if (Number.isFinite(environment?.surfacePressure)) {
        if (environment.surfacePressure <= WATER_VAPOR_PRESSURE) {
            throw new RangeError('Surface pressure must exceed water-vapour pressure');
        }
        return environment.surfacePressure;
    }
    return getPressureAtAltitude(environment?.altitude ?? 0);
}

/** Resolve the hydrostatic pressure increase per metre for an environment. */
export function getPressurePerMeter(environment = null) {
    const waterType = environment?.waterType;
    if (waterType === WATER_TYPES.STANDARD || waterType === undefined) {
        if (waterType === undefined && Number.isFinite(environment?.waterDensity)) {
            if (environment.waterDensity <= 0) {
                throw new RangeError('Water density must be positive');
            }
            return environment.waterDensity * 1000 * STANDARD_GRAVITY / 100000;
        }
        return PRESSURE_PER_METER;
    }
    const density = WATER_DENSITIES[waterType];
    if (!density) {
        throw new RangeError(`Unsupported water type: ${waterType}`);
    }
    return density * STANDARD_GRAVITY / 100000;
}

/**
 * Calculate ambient pressure at a given depth
 * @param {number} depth - Depth in meters
 * @returns {number} Ambient pressure in bar
 */
export function getAmbientPressure(
    depth,
    surfacePressure = SURFACE_PRESSURE,
    pressurePerMeter = PRESSURE_PER_METER
) {
    return surfacePressure + (depth * pressurePerMeter);
}
