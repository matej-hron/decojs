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

/** Surface atmospheric pressure in bar (1 atm exactly) */
export const SURFACE_PRESSURE = 1.01325;

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

/** Default Gradient Factors (100% = use raw Bühlmann M-values) */
export const DEFAULT_GF_LOW = 1.0;   // 100%
export const DEFAULT_GF_HIGH = 1.0;  // 100%

/** Supported decompression schedule policies. */
export const DECO_MODES = Object.freeze({
    STANDARD: 'standard',
    ADAPTIVE: 'adaptive',
    CONTINUOUS: 'continuous'
});

export const DECISION_AUDIT_VERSION = 2;

/** Resolve current and legacy schedule options to a supported mode. */
export function getDecoMode(options = {}) {
    if (Object.values(DECO_MODES).includes(options.decoMode)) {
        return options.decoMode;
    }
    return options.continuousDeco === true
        ? DECO_MODES.CONTINUOUS
        : DECO_MODES.STANDARD;
}

/**
 * Safety cap on a single deco stop. If waiting at one depth exceeds this, the
 * profile is outside the algorithm's usable domain (unreasonable GF for the
 * exposure, or a dive past air/diluent limits) and generateDecoSchedule throws
 * a DecoCapExceededError instead of returning a silently-truncated plan.
 */
export const DECO_STOP_MAX_MINUTES = 300;

/**
 * Thrown by generateDecoSchedule when a single stop would need to exceed
 * DECO_STOP_MAX_MINUTES. The caller is expected to surface this to the user.
 */
export class DecoCapExceededError extends Error {
    constructor(depth, stopsSoFar, capMinutes) {
        super(
            `Decompression at ${depth}\u00a0m would need more than ${capMinutes} minutes ` +
            `to clear. This profile is outside the algorithm's usable range — ` +
            `the gradient factor may be too aggressive for the exposure, or the ` +
            `dive is beyond what the configured gas can safely support.`
        );
        this.name = 'DecoCapExceededError';
        this.depth = depth;
        this.stopsSoFar = stopsSoFar;
        this.capMinutes = capMinutes;
    }
}

// ============================================================================
// CORE CALCULATIONS
// ============================================================================

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

/**
 * Calculate alveolar (inspired) nitrogen partial pressure
 * This is what the tissues are trying to equilibrate towards
 * 
 * @param {number} ambientPressure - Ambient pressure in bar
 * @param {number} [n2Fraction=N2_FRACTION] - Nitrogen fraction in breathing gas (0-1)
 * @returns {number} Alveolar N2 pressure in bar
 */
export function getAlveolarN2Pressure(ambientPressure, n2Fraction = N2_FRACTION) {
    return (ambientPressure - WATER_VAPOR_PRESSURE) * n2Fraction;
}

/**
 * Calculate initial tissue N2 pressure at surface (saturated at 1 atm)
 * @param {number} [n2Fraction=N2_FRACTION] - Nitrogen fraction in breathing gas (0-1)
 * @returns {number} Initial tissue N2 pressure in bar
 */
export function getInitialTissueN2(n2Fraction = N2_FRACTION, surfacePressure = SURFACE_PRESSURE) {
    return getAlveolarN2Pressure(surfacePressure, n2Fraction);
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
// GRADIENT FACTORS & CEILING CALCULATIONS
// ============================================================================

/**
 * Calculate M-value (maximum tolerable tissue pressure) at given ambient pressure
 * Using Bühlmann formula: M = a + P_amb / b
 * 
 * @param {number} ambientPressure - Ambient pressure in bar
 * @param {number} a - Bühlmann 'a' coefficient (bar)
 * @param {number} b - Bühlmann 'b' coefficient (dimensionless)
 * @returns {number} Maximum tolerable tissue inert gas pressure in bar
 */
export function getMValue(ambientPressure, a, b) {
    return a + ambientPressure / b;
}

/**
 * Calculate GF-adjusted M-value at given ambient pressure
 * The adjusted M-value is a fraction of the way from ambient to raw M-value:
 * M_adjusted = P_amb + GF × (M_raw - P_amb)
 * 
 * @param {number} ambientPressure - Ambient pressure in bar
 * @param {number} a - Bühlmann 'a' coefficient (bar)
 * @param {number} b - Bühlmann 'b' coefficient (dimensionless)
 * @param {number} gf - Gradient factor (0-1, where 1 = 100% = raw M-value)
 * @returns {number} GF-adjusted maximum tolerable tissue pressure in bar
 */
export function getAdjustedMValue(ambientPressure, a, b, gf) {
    const mValue = getMValue(ambientPressure, a, b);
    return ambientPressure + gf * (mValue - ambientPressure);
}

// ============================================================================
// INSTANTANEOUS GRADIENT FACTOR CALCULATIONS
// ============================================================================

/**
 * Calculate instantaneous Gradient Factor for a single tissue compartment.
 * 
 * GF_i(Pamb) = (Pt[i] - Pamb) / (Mi(Pamb) - Pamb)
 * 
 * Where:
 * - Pt[i] is the tissue inert gas pressure
 * - Mi(Pamb) is the Bühlmann M-value at ambient pressure
 * - Pamb is the ambient pressure
 * 
 * @param {number} tissuePressure - Current tissue inert gas pressure (bar)
 * @param {number} ambientPressure - Current ambient pressure (bar)
 * @param {Object} compartment - Compartment object with aN2, bN2
 * @returns {number} Instantaneous GF for this tissue (-Infinity to +Infinity)
 *                   Negative if tissue is undersaturated, >1 if exceeds M-value
 */
export function calculateInstantGF(tissuePressure, ambientPressure, compartment) {
    const mValue = getMValue(ambientPressure, compartment.aN2, compartment.bN2);
    const denominator = mValue - ambientPressure;
    
    // Avoid division by zero (though this shouldn't happen with valid coefficients)
    if (Math.abs(denominator) < 1e-10) {
        return tissuePressure > ambientPressure ? Infinity : -Infinity;
    }
    
    return (tissuePressure - ambientPressure) / denominator;
}

/**
 * Calculate maximum Gradient Factor across supersaturated tissue compartments.
 * 
 * GF_max(Pamb) = max over i of GF_i(Pamb)
 * 
 * A compartment can control decompression only while its tissue pressure
 * exceeds ambient pressure. If every compartment is undersaturated or exactly
 * at ambient pressure, there is no leading compartment and gfMax is zero.
 * Note: The leading tissue may change during ascent and deco.
 * 
 * @param {Object} tissuePressures - Map of compartment ID to tissue pressure (bar)
 * @param {number} ambientPressure - Current ambient pressure (bar)
 * @returns {{gfMax: number, leadingCompartment: number, allGFs: Object}}
 *          gfMax: Maximum positive GF, or 0 when no tissue is supersaturated
 *          leadingCompartment: ID of the supersaturated tissue with highest GF,
 *                              or null when none is supersaturated
 *          allGFs: Map of compartment ID to its instantaneous GF
 */
export function calculateMaxGF(tissuePressures, ambientPressure) {
    let gfMax = 0;
    let leadingCompartment = null;
    const allGFs = {};
    
    for (const comp of COMPARTMENTS) {
        const tissueP = tissuePressures[comp.id];
        const gf = calculateInstantGF(tissueP, ambientPressure, comp);
        allGFs[comp.id] = gf;
        
        if (tissueP > ambientPressure && gf > gfMax) {
            gfMax = gf;
            leadingCompartment = comp.id;
        }
    }
    
    return { gfMax, leadingCompartment, allGFs };
}

/**
 * Calculate ceiling (minimum tolerable ambient pressure) for a single compartment
 * This is the shallowest depth where the tissue remains within GF-adjusted limits.
 * 
 * Derived by solving: P_tissue = P_amb + GF × (a + P_amb/b - P_amb)
 * for P_amb, giving: P_ceiling = b × (P_tissue - GF × a) / (b × (1 - GF) + GF)
 * 
 * @param {number} tissuePressure - Current tissue inert gas pressure in bar
 * @param {number} a - Bühlmann 'a' coefficient (bar)
 * @param {number} b - Bühlmann 'b' coefficient (dimensionless)
 * @param {number} gf - Gradient factor (0-1)
 * @returns {number} Minimum tolerable ambient pressure in bar (may be < SURFACE_PRESSURE)
 */
export function getCompartmentCeiling(tissuePressure, a, b, gf) {
    // P_ceiling = b × (P_tissue - GF × a) / (b × (1 - GF) + GF)
    const numerator = b * (tissuePressure - gf * a);
    const denominator = b * (1 - gf) + gf;
    return numerator / denominator;
}

/**
 * Calculate overall dive ceiling across all compartments
 * The ceiling is the maximum (deepest) of all individual compartment ceilings.
 * 
 * @param {Object} tissuePressures - Map of compartment ID to tissue pressure (bar)
 * @param {number} gf - Gradient factor to use (0-1)
 * @returns {{ceiling: number, ceilingDepth: number, controllingCompartment: number}}
 *          ceiling in bar, ceilingDepth in meters (0 if can surface), controlling compartment ID
 */
export function getDiveCeiling(
    tissuePressures,
    gf,
    surfacePressure = SURFACE_PRESSURE,
    pressurePerMeter = PRESSURE_PER_METER
) {
    let maxCeiling = -Infinity;
    let controllingComp = null;
    
    for (const comp of COMPARTMENTS) {
        const tissueP = tissuePressures[comp.id];
        const ceiling = getCompartmentCeiling(tissueP, comp.aN2, comp.bN2, gf);
        if (ceiling > maxCeiling) {
            maxCeiling = ceiling;
            controllingComp = comp.id;
        }
    }
    
    // Ceiling can't be below surface (above water)
    const finalCeiling = Math.max(surfacePressure, maxCeiling);
    
    // Convert ceiling pressure to depth
    const ceilingDepth = Math.max(
        0,
        (finalCeiling - surfacePressure) / pressurePerMeter
    );
    
    return {
        ceiling: finalCeiling,
        ceilingDepth: ceilingDepth,
        controllingCompartment: controllingComp
    };
}

/**
 * Interpolate GF based on current ambient pressure between pAnchor and surface.
 * 
 * Uses the formula:
 * GF(Pamb) = GF_low + (GF_high - GF_low) × (pAnchor - Pamb) / (pAnchor - 1.0)
 * 
 * Where:
 * - At Pamb >= pAnchor: GF = GF_low
 * - At Pamb = surface (1.0 bar): GF = GF_high
 * - Between: linear interpolation
 * 
 * This is the pAnchor-based GF interpolation (Baker GF convention).
 * The pAnchor is the first stop depth's ambient pressure, produced by
 * {@link findFirstStopAtGFLow}.
 *
 * @param {number} currentAmbient - Current ambient pressure in bar
 * @param {number} pAnchor - GF ramp anchor pressure in bar (from findFirstStopAtGFLow)
 * @param {number} gfLow - GF Low value (0-1)
 * @param {number} gfHigh - GF High value (0-1)
 * @returns {number} Interpolated GF (0-1)
 */
export function interpolateGF(currentAmbient, pAnchor, gfLow, gfHigh, surfacePressure = SURFACE_PRESSURE) {
    // At or deeper than anchor: use GF Low
    if (currentAmbient >= pAnchor) {
        return gfLow;
    }
    
    // At or above surface: use GF High
    if (currentAmbient <= surfacePressure) {
        return gfHigh;
    }
    
    // Linear interpolation between pAnchor and surface
    // GF = GF_low + (GF_high - GF_low) × (pAnchor - Pamb) / (pAnchor - 1.0)
    const range = pAnchor - surfacePressure;
    if (range <= 0) {
        return gfHigh; // Edge case: anchor at surface
    }
    
    const fraction = (pAnchor - currentAmbient) / range;
    return gfLow + fraction * (gfHigh - gfLow);
}

/**
 * Find a compartment's ceiling on the complete GF boundary.
 *
 * At/deeper than pAnchor the boundary uses GF Low. Above pAnchor it follows
 * the linear GF ramp to GF High at the surface. The returned GF is determined
 * by the ceiling pressure, not by the diver's current depth.
 *
 * @returns {{pressure: number, depth: number, gf: number}}
 */
export function getCompartmentCeilingOnGFRamp(
    tissuePressure,
    a,
    b,
    gfLow,
    gfHigh,
    pAnchor,
    surfacePressure = SURFACE_PRESSURE,
    pressurePerMeter = PRESSURE_PER_METER
) {
    const atGF = (gf) => {
        const pressure = getCompartmentCeiling(tissuePressure, a, b, gf);
        return {
            pressure,
            depth: Math.max(0, (pressure - surfacePressure) / pressurePerMeter),
            gf
        };
    };
    const low = atGF(gfLow);
    const high = atGF(gfHigh);

    if (pAnchor <= surfacePressure + 1e-9) return high;
    if (Math.abs(gfHigh - gfLow) < 1e-12) return low;
    if (low.pressure >= pAnchor) return low;
    if (high.pressure <= surfacePressure) return high;

    let lower = surfacePressure;
    let upper = pAnchor;
    for (let i = 0; i < 80; i++) {
        const pressure = (lower + upper) / 2;
        const gf = interpolateGF(
            pressure,
            pAnchor,
            gfLow,
            gfHigh,
            surfacePressure
        );
        const adjustedM = getAdjustedMValue(pressure, a, b, gf);
        if (adjustedM < tissuePressure) {
            lower = pressure;
        } else {
            upper = pressure;
        }
    }

    const pressure = (lower + upper) / 2;
    return {
        pressure,
        depth: Math.max(0, (pressure - surfacePressure) / pressurePerMeter),
        gf: interpolateGF(
            pressure,
            pAnchor,
            gfLow,
            gfHigh,
            surfacePressure
        )
    };
}

/**
 * Find the first decompression stop per the Baker GF convention.
 *
 * Returns the shallowest stop-grid depth where the dive ceiling at GF_low
 * (max ceiling across all 16 compartments) is satisfied AFTER simulating
 * the actual ascent from currentDepth to that depth (with Schreiner integration
 * and gas switches if applicable). This depth is also the GF-ramp anchor:
 * GF = GF_low at and below it, ramps to GF_high at the surface.
 *
 * @param {Object} tissuePressures - Map of compartment ID to tissue pressure (bar)
 * @param {number} currentDepth - Depth at which ascent begins (meters)
 * @param {number} n2Fraction - Inert-gas fraction of the current breathing gas
 * @param {number} gfLow - GF Low (0-1)
 * @param {number} stopIncrement - Stop-grid increment in meters (default 3 m;
 *                                  use 0.1 m for a continuous-mode visualization)
 * @param {number} ascentRate - Ascent speed (m/min)
 * @param {Array|null} gasSwitchPoints - Optional gas switch points
 * @returns {{anchorDepth: number, pAnchor: number, tissuesAtAnchor: Object}}
 */
export function findFirstStopAtGFLow(
    tissuePressures, currentDepth, n2Fraction, gfLow,
    stopIncrement = STOP_INCREMENT, ascentRate = ASCENT_SPEED, gasSwitchPoints = null,
    surfacePressure = SURFACE_PRESSURE, recordDecision = null,
    pressurePerMeter = PRESSURE_PER_METER
) {
    const safeGases = gasSwitchPoints && gasSwitchPoints.length > 0 ? gasSwitchPoints : null;
    let anchorDepth = currentDepth;
    let tissuesAtAnchor = { ...tissuePressures };
    for (let candidate = 0; candidate <= currentDepth + 1e-9; candidate += stopIncrement) {
        let simTissues;
        if (safeGases) {
            simTissues = _simulateAscentWithGasSwitches(
                tissuePressures, currentDepth, candidate, n2Fraction, safeGases,
                surfacePressure, pressurePerMeter
            );
        } else {
            const ascentTime = (currentDepth - candidate) / ascentRate;
            simTissues = ascentTime > 0
                ? simulateDepthChange(
                    { ...tissuePressures }, currentDepth, candidate, ascentTime,
                    n2Fraction, surfacePressure, pressurePerMeter
                )
                : { ...tissuePressures };
        }
        const { ceilingDepth, controllingCompartment } =
            getDiveCeiling(
                simTissues, gfLow, surfacePressure, pressurePerMeter
            );
        const accepted = ceilingDepth <= candidate + 1e-9;
        recordDecision?.('anchor-check', {
            candidateDepth: candidate,
            ceilingDepth,
            roundedCeilingDepth: Math.ceil((ceilingDepth - 1e-9) / stopIncrement) * stopIncrement,
            nextCandidateDepth: Math.min(currentDepth, candidate + stopIncrement),
            controllingCompartment,
            decision: accepted ? 'accept' : 'deeper'
        });
        if (accepted) {
            anchorDepth = candidate;
            tissuesAtAnchor = simTissues;
            break;
        }
    }
    const pAnchor = surfacePressure + anchorDepth * pressurePerMeter;
    return { anchorDepth, pAnchor, tissuesAtAnchor };
}

/**
 * Find the first staged stop using Decotengu's iterative 3 m ceiling steps.
 *
 * Each candidate is derived from the ceiling at the previously reached level.
 * This deliberately does not jump directly to the shallowest level that would
 * be safe after one long ascent, because a conventional staged schedule treats
 * every reached ceiling level as an active decompression level.
 */
function findFirstStagedStopAtGFLow(
    tissuePressures, currentDepth, n2Fraction, gfLow,
    stopIncrement, ascentRate, gasSwitchPoints, surfacePressure,
    recordDecision = null, pressurePerMeter = PRESSURE_PER_METER
) {
    const ceilingState = (tissues) => {
        const { ceilingDepth, controllingCompartment } =
            getDiveCeiling(tissues, gfLow, surfacePressure, pressurePerMeter);
        const roundedCeilingDepth = Math.max(
            0,
            Math.min(
                currentDepth,
                Math.ceil((ceilingDepth - 1e-9) / stopIncrement) * stopIncrement
            )
        );
        return { ceilingDepth, roundedCeilingDepth, controllingCompartment };
    };
    const simulateTo = (targetDepth) => {
        if (gasSwitchPoints && gasSwitchPoints.length > 0) {
            return _simulateAscentWithGasSwitches(
                tissuePressures, currentDepth, targetDepth, n2Fraction,
                gasSwitchPoints, surfacePressure, pressurePerMeter
            );
        }
        const ascentTime = (currentDepth - targetDepth) / ascentRate;
        return ascentTime > 0
            ? simulateDepthChange(
                tissuePressures, currentDepth, targetDepth, ascentTime,
                n2Fraction, surfacePressure, pressurePerMeter
            )
            : { ...tissuePressures };
    };

    const initialCeiling = ceilingState(tissuePressures);
    let anchorDepth = initialCeiling.roundedCeilingDepth;
    let tissuesAtAnchor = simulateTo(anchorDepth);
    recordDecision?.('anchor-candidate', {
        ceilingDepth: initialCeiling.ceilingDepth,
        roundedCeilingDepth: anchorDepth,
        controllingCompartment: initialCeiling.controllingCompartment
    });

    while (anchorDepth > 0) {
        const arrivalCeiling = ceilingState(tissuesAtAnchor);
        const nextDepth = arrivalCeiling.roundedCeilingDepth;
        const accepted = nextDepth >= anchorDepth - 1e-9;
        recordDecision?.('anchor-check', {
            candidateDepth: anchorDepth,
            ceilingDepth: arrivalCeiling.ceilingDepth,
            roundedCeilingDepth: nextDepth,
            nextCandidateDepth: nextDepth,
            controllingCompartment: arrivalCeiling.controllingCompartment,
            decision: accepted ? 'accept' : 'shallower'
        });
        if (accepted) break;
        anchorDepth = nextDepth;
        tissuesAtAnchor = simulateTo(anchorDepth);
    }

    return {
        anchorDepth,
        pAnchor: surfacePressure + anchorDepth * pressurePerMeter,
        tissuesAtAnchor
    };
}

/**
 * Calculate the first stop depth using constant GF Low (no ramp, no ascent simulation).
 *
 * Static lookup: rounds the current dive ceiling at GF_low up to the stop grid.
 * The deco scheduler uses {@link findFirstStopAtGFLow} instead, which simulates
 * the actual ascent so Schreiner-during-ascent loading is accounted for.
 *
 * @param {Object} tissuePressures - Map of compartment ID to tissue pressure (bar)
 * @param {number} gfLow - GF Low value (0-1)
 * @param {number} stopIncrement - Stop depth increment in meters (default 3m)
 * @returns {{depth: number, ambient: number, controllingCompartment: number}}
 */
export function getFirstStopDepth(
    tissuePressures,
    gfLow,
    stopIncrement = 3,
    surfacePressure = SURFACE_PRESSURE,
    pressurePerMeter = PRESSURE_PER_METER
) {
    const { ceilingDepth, controllingCompartment } = getDiveCeiling(
        tissuePressures, gfLow, surfacePressure, pressurePerMeter
    );
    
    // Round up to next stop increment
    const stopDepth = Math.ceil(ceilingDepth / stopIncrement) * stopIncrement;
    
    return {
        depth: stopDepth,
        ambient: getAmbientPressure(
            stopDepth, surfacePressure, pressurePerMeter
        ),
        controllingCompartment
    };
}

/**
/**
 * Simulate ascent with gas switches - used to accurately predict tissue state
 * when ascending through depths where gas changes occur.
 * @param {Object} tissuePressures - Starting tissue pressures
 * @param {number} fromDepth - Starting depth (meters)
 * @param {number} toDepth - Target depth (meters, must be <= fromDepth)
 * @param {number} startN2 - N2 fraction of initial gas
 * @param {Array} gasSwitchPoints - [{switchDepth, n2}] sorted deepest first
 * @returns {Object} Simulated tissue pressures after ascent
 */
function _simulateAscentWithGasSwitches(
    tissuePressures, fromDepth, toDepth, startN2, gasSwitchPoints,
    surfacePressure = SURFACE_PRESSURE,
    pressurePerMeter = PRESSURE_PER_METER
) {
    let tissues = { ...tissuePressures };
    let currentDepth = fromDepth;
    let currentN2 = startN2;

    // Get switch points between fromDepth and toDepth, sorted deep to shallow
    const relevantSwitches = gasSwitchPoints
        .filter(sp => sp.switchDepth < currentDepth && sp.switchDepth >= toDepth)
        .sort((a, b) => b.switchDepth - a.switchDepth);

    // Ascend through each gas switch segment
    for (const sp of relevantSwitches) {
        const segmentTime = (currentDepth - sp.switchDepth) / ASCENT_SPEED;
        if (segmentTime > 0) {
            tissues = simulateDepthChange(
                tissues, currentDepth, sp.switchDepth, segmentTime, currentN2,
                surfacePressure, pressurePerMeter
            );
        }
        currentDepth = sp.switchDepth;
        currentN2 = sp.n2;
    }

    // Final segment to target depth
    if (currentDepth > toDepth) {
        const segmentTime = (currentDepth - toDepth) / ASCENT_SPEED;
        tissues = simulateDepthChange(
            tissues, currentDepth, toDepth, segmentTime, currentN2,
            surfacePressure, pressurePerMeter
        );
    }

    return tissues;
}

/**
 * Calculate ceiling depth at each time point from tissue loading results
 * Uses the complete GF boundary: GF Low at/deeper than pAnchor and the
 * interpolated GF ramp from pAnchor to GF High at the surface.
 * 
 * @param {Object} results - Results from calculateTissueLoading()
 * @param {number} gfLow - GF Low value (0-1, where 1 = 100%)
 * @param {number} gfHigh - GF High value (0-1, where 1 = 100%)
 * @param {number|null} [providedPAnchor=null] - Pre-computed scheduler anchor
 * @returns {number[]} Array of ceiling depths in meters at each time point
 */
export function calculateCeilingTimeSeries(
    results, gfLow, gfHigh = gfLow, providedPAnchor = null
) {
    const { ceilingDepths } = calculateCeilingTimeSeriesDetailed(
        results, gfLow, gfHigh, providedPAnchor, 'current-depth'
    );
    return ceilingDepths;
}

/**
 * Calculate detailed ceiling data at each time point from tissue loading results
 * Returns both overall ceiling and per-compartment ceilings.
 * 
 * For each tissue state, the ceiling is its intersection with the complete
 * pAnchor-based GF boundary. GF Low is used only when that intersection is at
 * or deeper than pAnchor; shallower intersections are solved on the ramp.
 * 
 * The pAnchor is computed dynamically at each time point to ensure
 * correct ceiling visualization that matches the deco scheduler.
 * 
 * @param {Object} results - Results from calculateTissueLoading()
 * @param {number} gfLow - GF Low value (0-1, where 1 = 100%)
 * @param {number} gfHigh - GF High value (0-1, where 1 = 100%)
 * @param {number} [providedPAnchor] - Pre-computed pAnchor from deco schedule (optional)
 * @param {'ramp'|'current-depth'} [ceilingMode='ramp'] - Ramp intersections for
 *        tissue inspection, or the staged active-GF ceiling for the profile
 * @returns {{ceilingDepths: number[], compartmentCeilings: Object, gfValues: number[], pAnchor: number}}
 *          ceilingDepths: overall ceiling at each time point
 *          compartmentCeilings: {compId: number[]} ceiling depth per compartment at each time point
 *          gfValues: GF used by the selected ceiling mode (for debugging)
 *          pAnchor: the GF Low anchor pressure used (bar)
 */
export function calculateCeilingTimeSeriesDetailed(
    results,
    gfLow,
    gfHigh = gfLow,
    providedPAnchor = null,
    ceilingMode = 'ramp'
) {
    const ceilingDepths = [];
    const compartmentCeilings = {};
    const gfValues = [];
    const surfacePressure = results.surfacePressure ?? SURFACE_PRESSURE;
    const pressurePerMeter =
        results.pressurePerMeter ?? PRESSURE_PER_METER;
    
    // Initialize per-compartment ceiling arrays
    for (const compId of Object.keys(results.compartments)) {
        compartmentCeilings[compId] = [];
    }
    
    // Track maximum depth for pAnchor detection.
    let maxDepthSeen = results.depthPoints[0];
    let previousDepth = results.depthPoints[0];
    let ascentStarted = false;
    let pAnchor = providedPAnchor;
    
    // Find max depth
    for (let i = 0; i < results.timePoints.length; i++) {
        if (results.depthPoints[i] > maxDepthSeen) {
            maxDepthSeen = results.depthPoints[i];
        }
    }
    
    // Find the LAST index where we're at max depth (start of ascent)
    // Use a small tolerance to handle floating point
    let ascentStartIndex = 0;
    const depthTolerance = 0.1; // meters
    for (let i = 0; i < results.timePoints.length; i++) {
        if (Math.abs(results.depthPoints[i] - maxDepthSeen) < depthTolerance) {
            ascentStartIndex = i;
        }
    }
    
    // If pAnchor is not provided, first apply the same direct-ascent GF High
    // decision as the scheduler. GF Low only defines an anchor after that fails.
    if (pAnchor === null) {
        const tissuesAtAscentStart = {};
        for (const compId of Object.keys(results.compartments)) {
            tissuesAtAscentStart[compId] = results.compartments[compId].pressures[ascentStartIndex];
        }
        const n2Fraction = results.n2Fractions ? results.n2Fractions[ascentStartIndex] : N2_FRACTION;
        const directAscent = evaluateDirectAscent(
            tissuesAtAscentStart, maxDepthSeen, n2Fraction, gfHigh,
            surfacePressure, pressurePerMeter
        );
        if (directAscent.ceilingDepth === 0) {
            pAnchor = surfacePressure;
        } else {
            ({ pAnchor } = findFirstStopAtGFLow(
                tissuesAtAscentStart, maxDepthSeen, n2Fraction, gfLow,
                STOP_INCREMENT, ASCENT_SPEED, null, surfacePressure, null,
                pressurePerMeter
            ));
        }
    }
    
    // Process each time point
    for (let i = 0; i < results.timePoints.length; i++) {
        const currentDepth = results.depthPoints[i];
        const currentAmbient = results.ambientPressures[i];

        // Get tissue pressures at this time point
        const tissuePressures = {};
        for (const compId of Object.keys(results.compartments)) {
            tissuePressures[compId] = results.compartments[compId].pressures[i];
        }

        const isAscending = currentDepth < previousDepth;
        if (isAscending && !ascentStarted && currentDepth < maxDepthSeen) {
            ascentStarted = true;
        }
        let currentGF;
        if (pAnchor <= surfacePressure + 1e-9) {
            currentGF = gfHigh;
        } else if (!ascentStarted || currentAmbient >= pAnchor) {
            currentGF = gfLow;
        } else {
            currentGF = interpolateGF(
                currentAmbient,
                pAnchor,
                gfLow,
                gfHigh,
                surfacePressure
            );
        }

        let maxCeilingDepth = 0;
        let controllingGF = currentGF;
        for (const comp of COMPARTMENTS) {
            const tissueP = tissuePressures[comp.id];
            const intersection = ceilingMode === 'ramp'
                ? getCompartmentCeilingOnGFRamp(
                    tissueP,
                    comp.aN2,
                    comp.bN2,
                    gfLow,
                    gfHigh,
                    pAnchor,
                    surfacePressure,
                    pressurePerMeter
                )
                : {
                    pressure: getCompartmentCeiling(
                        tissueP,
                        comp.aN2,
                        comp.bN2,
                        currentGF
                    ),
                    gf: currentGF
                };
            if (intersection.depth === undefined) {
                intersection.depth = Math.max(
                    0,
                    (intersection.pressure - surfacePressure)
                        / pressurePerMeter
                );
            }
            const ceilingDepth = intersection.depth;
            compartmentCeilings[comp.id].push(ceilingDepth);
            if (ceilingDepth > maxCeilingDepth) {
                maxCeilingDepth = ceilingDepth;
                controllingGF = intersection.gf;
            }
        }

        ceilingDepths.push(maxCeilingDepth);
        gfValues.push(controllingGF);
        previousDepth = currentDepth;
    }
    
    return { ceilingDepths, compartmentCeilings, gfValues, pAnchor };
}

// ============================================================================
// NDL & DECO CALCULATIONS
// ============================================================================

/** Descent speed in m/min for NDL calculations */
const DESCENT_SPEED = 20;

/** Ascent speed in m/min for deco calculations */
const ASCENT_SPEED = 10;

/** Deco stop increment in meters */
const STOP_INCREMENT = 3;

/**
 * Calculate No-Decompression Limit (NDL) for a given depth
 * NDL is the maximum bottom time where you can ascend directly to surface
 * without required decompression stops.
 * 
 * Uses binary search to find maximum time where ceiling = 0 (surface).
 * A no-decompression ascent is simulated to the surface on the bottom gas and
 * checked there with GF High, matching Decotengu's NDL-ascent convention.
 * 
 * @param {number} depth - Depth in meters
 * @param {number} n2Fraction - N2 fraction in gas (default 0.79 for air)
 * @param {number} gfHigh - GF High as decimal (0-1), applied at the surface
 * @param {Object.<string, number>|null} [initialTissuePressures] - Optional per-compartment
 *   N2 pressure (bar) to seed the descent start from (repetitive-dive pre-saturation);
 *   when null/omitted, starts from surface equilibrium (unchanged behaviour).
 * @returns {{ndl: number, ndlExact: number, ndlAtDepth: number, ndlAtDepthExact: number,
 *   controllingCompartment: number, descentTime: number}} `ndl` is the no-decompression
 *   limit as dive tables report it — the maximum bottom time measured from leaving the
 *   surface, descent included — so it can be compared with (or assigned to) a bottom time
 *   directly. `ndlAtDepth` is the same limit counted only from arrival at depth.
 */
function evaluateDirectAscent(
    tissuePressures, depth, n2Fraction, gfHigh,
    surfacePressure = SURFACE_PRESSURE,
    pressurePerMeter = PRESSURE_PER_METER
) {
    const ascentTime = depth / ASCENT_SPEED;
    const surfacedTissues = ascentTime > 0
        ? simulateDepthChange(
            tissuePressures, depth, 0, ascentTime, n2Fraction,
            surfacePressure, pressurePerMeter
        )
        : { ...tissuePressures };
    return {
        tissues: surfacedTissues,
        ...getDiveCeiling(
            surfacedTissues, gfHigh, surfacePressure, pressurePerMeter
        )
    };
}

export function calculateNDL(
    depth, n2Fraction = N2_FRACTION, gfHigh = 1.0,
    initialTissuePressures = null, surfacePressure = SURFACE_PRESSURE,
    pressurePerMeter = PRESSURE_PER_METER
) {
    // Very shallow depths have effectively unlimited NDL
    if (depth <= 0) {
        return {
            ndl: Infinity, ndlExact: Infinity,
            ndlAtDepth: Infinity, ndlAtDepthExact: Infinity,
            controllingCompartment: null, descentTime: 0
        };
    }
    
    const ambientPressure = getAmbientPressure(
        depth, surfacePressure, pressurePerMeter
    );
    const alveolarN2 = getAlveolarN2Pressure(ambientPressure, n2Fraction);
    
    // Initialize tissue pressures at surface saturation
    const initialN2 = getInitialTissueN2(n2Fraction, surfacePressure);
    
    // Exact descent time at ASCENT_SPEED=20 m/min (matches decotengu/divetools)
    const descentTime = depth / DESCENT_SPEED;
    const surfaceAlveolarN2 = getAlveolarN2Pressure(surfacePressure, n2Fraction);
    const descentRate = (alveolarN2 - surfaceAlveolarN2) / descentTime;
    
    // Get tissue pressures after descent
    const afterDescent = {};
    COMPARTMENTS.forEach(comp => {
        const startN2 = initialTissuePressures ? initialTissuePressures[comp.id] : initialN2;
        afterDescent[comp.id] = schreinerEquation(
            startN2,
            surfaceAlveolarN2,
            descentRate,
            descentTime,
            comp.halfTime
        );
    });
    
    // Binary search for NDL
    let minTime = 0;
    let maxTime = 300; // 5 hours max
    
    // First check whether the descent alone already prevents a direct ascent.
    const { ceilingDepth: immediateceiling, controllingCompartment } =
        evaluateDirectAscent(
            afterDescent, depth, n2Fraction, gfHigh, surfacePressure,
            pressurePerMeter
        );
    if (immediateceiling > 0) {
        return {
            ndl: 0, ndlExact: 0,
            ndlAtDepth: 0, ndlAtDepthExact: 0,
            controllingCompartment,
            descentTime
        };
    }
    
    // Check if 5 hours is still within NDL (very shallow)
    const pressuresAt5Hours = {};
    COMPARTMENTS.forEach(comp => {
        pressuresAt5Hours[comp.id] = haldaneEquation(afterDescent[comp.id], alveolarN2, 300, comp.halfTime);
    });
    const { ceilingDepth: ceiling5h } =
        evaluateDirectAscent(
            pressuresAt5Hours, depth, n2Fraction, gfHigh, surfacePressure,
            pressurePerMeter
        );
    if (ceiling5h === 0) {
        return {
            ndl: Infinity, ndlExact: Infinity,
            ndlAtDepth: Infinity, ndlAtDepthExact: Infinity,
            controllingCompartment: null, descentTime
        };
    }
    
    // Sub-second precision keeps the exact threshold and the schedule branch
    // consistent for callers that compare arbitrary decimal runtimes.
    while (maxTime - minTime > 0.001) {
        const testTime = (minTime + maxTime) / 2;
        
        // Simulate time at depth
        const testPressures = {};
        COMPARTMENTS.forEach(comp => {
            testPressures[comp.id] = haldaneEquation(afterDescent[comp.id], alveolarN2, testTime, comp.halfTime);
        });
        
        // A candidate is within NDL when the simulated direct ascent reaches
        // the surface within GF High without any mandatory stop.
        const { ceilingDepth } =
            evaluateDirectAscent(
                testPressures, depth, n2Fraction, gfHigh, surfacePressure,
                pressurePerMeter
            );
        
        if (ceilingDepth > 0) {
            maxTime = testTime; // Needs deco, reduce time
        } else {
            minTime = testTime; // No deco, can go longer
        }
    }
    
    // Get controlling compartment at NDL
    const ndlPressures = {};
    COMPARTMENTS.forEach(comp => {
        ndlPressures[comp.id] = haldaneEquation(afterDescent[comp.id], alveolarN2, minTime, comp.halfTime);
    });
    const ndlAscent = evaluateDirectAscent(
        ndlPressures, depth, n2Fraction, gfHigh, surfacePressure,
        pressurePerMeter
    );
    
    // NDL is reported the way dive tables report it: as the maximum bottom time
    // measured from leaving the surface, i.e. the descent is already included.
    // Floor to whole minutes for conservative display.
    const ndlExact = descentTime + minTime;
    return {
        ndl: Math.floor(ndlExact),
        ndlExact,                       // Exact total, from the start of the dive
        ndlAtDepth: Math.floor(minTime),
        ndlAtDepthExact: minTime,       // Time at depth after the descent
        controllingCompartment: ndlAscent.controllingCompartment,
        descentTime
    };
}

/**
 * Simulate tissue loading at constant depth
 * Helper function for deco calculations
 * 
 * @param {Object} tissuePressures - Current tissue pressures by compartment ID
 * @param {number} depth - Depth in meters
 * @param {number} time - Time in minutes
 * @param {number} n2Fraction - N2 fraction in gas
 * @returns {Object} Updated tissue pressures
 */
export function simulateDepthTime(
    tissuePressures, depth, time, n2Fraction,
    surfacePressure = SURFACE_PRESSURE,
    pressurePerMeter = PRESSURE_PER_METER
) {
    const ambientPressure = getAmbientPressure(
        depth, surfacePressure, pressurePerMeter
    );
    const alveolarN2 = getAlveolarN2Pressure(ambientPressure, n2Fraction);
    
    const newPressures = {};
    COMPARTMENTS.forEach(comp => {
        newPressures[comp.id] = haldaneEquation(tissuePressures[comp.id], alveolarN2, time, comp.halfTime);
    });
    
    return newPressures;
}

/**
 * Simulate tissue loading during depth change
 * 
 * @param {Object} tissuePressures - Current tissue pressures
 * @param {number} startDepth - Starting depth in meters
 * @param {number} endDepth - Ending depth in meters
 * @param {number} time - Duration of the depth change in minutes
 * @param {number} n2Fraction - N2 fraction in gas
 * @returns {Object} Updated tissue pressures
 */
export function simulateDepthChange(
    tissuePressures, startDepth, endDepth, time, n2Fraction,
    surfacePressure = SURFACE_PRESSURE,
    pressurePerMeter = PRESSURE_PER_METER
) {
    const startAlveolar = getAlveolarN2Pressure(
        getAmbientPressure(startDepth, surfacePressure, pressurePerMeter),
        n2Fraction
    );
    const endAlveolar = getAlveolarN2Pressure(
        getAmbientPressure(endDepth, surfacePressure, pressurePerMeter),
        n2Fraction
    );
    const rate = (endAlveolar - startAlveolar) / time;
    
    const newPressures = {};
    COMPARTMENTS.forEach(comp => {
        newPressures[comp.id] = schreinerEquation(tissuePressures[comp.id], startAlveolar, rate, time, comp.halfTime);
    });
    
    return newPressures;
}

/**
 * Generate a decompression schedule from current tissue state
 * Returns the stops needed to safely reach the surface.
 * 
 * Gas switch convention:
 * - When deco stops are required: switches occur on arrival at a stop depth,
 *   before waiting begins. The ceiling check during ascent uses the current gas;
 *   after arrival and switch, subsequent waiting uses the new gas.
 * - When no deco stops are required (NDL dive): switches occur mid-ascent at
 *   the gas's MOD (rounded to 3m grid). This allows using richer gases during
 *   ascent even without mandatory stops.
 * 
 * GF interpolation (pAnchor-based): The pAnchor is the ambient pressure during
 * ascent where GF_max first equals GF_low. The GF ramp runs from gfLow at pAnchor
 * to gfHigh at the surface. This is the correct Bühlmann + GF implementation.
 * 
 * @param {Object} tissuePressures - Current tissue pressures by compartment ID
 * @param {number} currentDepth - Current depth in meters (ascent start)
 * @param {number} n2Fraction - N2 fraction in current gas
 * @param {number} gfLow - GF Low (0-1)
 * @param {number} gfHigh - GF High (0-1)
 * @param {Array} [gases] - Available gases for switching [{id, n2, o2, name, mod}]
 * @param {Object} [options] - Additional options
 * @param {number} [options.switchPpO2=1.6] - ppO2 used to calculate gas switch depths (MOD)
 * @param {boolean} [options.audit=false] - Include structured decision events
 * @param {boolean} [options.alignRuntimeDepartures=false] - Align Standard-mode departures to whole absolute runtime minutes
 * @param {number} [options.runtimeStart] - Absolute runtime at the start of the ascent
 * @returns {{stops: Array<{depth: number, time: number, gas: string, departureRuntime?: number}>, gasSwitches: Array<{depth: number, gas: string, gasId: string}>, totalTime: number, totalAscentTime: number, pAnchor: number, anchorDepth: number, decisionAudit?: Object}}
 */
export function generateDecoSchedule(tissuePressures, currentDepth, n2Fraction, gfLow, gfHigh, gases = null, options = {}) {
    const { switchPpO2 = 1.6, gasSwitchTime = 0 } = options;
    const decoMode = getDecoMode(options);
    const surfacePressure = options.surfacePressure ?? SURFACE_PRESSURE;
    const pressurePerMeter =
        options.pressurePerMeter ?? PRESSURE_PER_METER;
    // Keep the existing sea-level MOD convention (nominal 1 bar), while
    // shifting it by the same pressure delta when altitude changes.
    const modSurfacePressure = options.modSurfacePressure
        ?? 1 + (surfacePressure - SURFACE_PRESSURE);

    const continuousDeco = decoMode === DECO_MODES.CONTINUOUS;
    const stopIncrement = continuousDeco ? 0.1 : STOP_INCREMENT;
    const timeIncrement = continuousDeco ? 0.1 : 1;
    const minimumStopTime = decoMode === DECO_MODES.STANDARD ? 1 : 0;
    const alignRuntimeDepartures = decoMode === DECO_MODES.STANDARD
        && options.alignRuntimeDepartures === true
        && Number.isFinite(options.runtimeStart);
    let scheduleRuntime = Number.isFinite(options.runtimeStart)
        ? options.runtimeStart
        : null;
    const decisionAudit = options.audit ? {
        version: DECISION_AUDIT_VERSION,
        mode: decoMode,
        startDepth: currentDepth,
        ...(scheduleRuntime !== null ? { runtimeStart: scheduleRuntime } : {}),
        gfLow,
        gfHigh,
        surfacePressure,
        events: []
    } : null;
    const recordDecision = (type, data) => {
        if (decisionAudit) {
            decisionAudit.events.push({
                type,
                ...(scheduleRuntime !== null ? { runtime: scheduleRuntime } : {}),
                ...data
            });
        }
    };

    const stops = [];
    const gasSwitches = []; // Track gas switches during ascent
    let totalAscentTime = 0;
    const advanceRuntime = (duration) => {
        if (scheduleRuntime !== null) {
            scheduleRuntime = Math.round((scheduleRuntime + duration) * 10) / 10;
        }
    };

    // Clone tissue pressures
    let tissues = { ...tissuePressures };
    let depth = currentDepth;
    let currentN2 = n2Fraction;
    // Use the bottom gas name if provided, otherwise default to 'Bottom Gas'
    let currentGasName = (gases && gases.length > 0) ? gases[0].name : 'Bottom Gas';
    
    // Helper to get a unique key for a gas (handles missing id)
    const gasKey = (g) => g.id ?? g.name;
    
    // Calculate gas switch depths (MOD at switchPpO2, rounded toward shallower on 3m grid)
    // Validates gas fractions and clamps switch depth to non-negative values
    const gasSwitchPoints = [];
    if (gases && gases.length > 1) {
        for (const gas of gases.slice(1)) {
            // Skip gases with invalid o2 fraction
            if (!gas.o2 || gas.o2 <= 0 || !Number.isFinite(gas.o2)) {
                continue;
            }
            // Skip gases with invalid n2 fraction
            if (!Number.isFinite(gas.n2) || gas.n2 < 0 || gas.n2 > 1) {
                continue;
            }
            // Skip gases where o2 + n2 > 1 (invalid mix, ignoring He for now)
            if (gas.o2 + gas.n2 > 1.001) {
                continue;
            }
            const mod =
                (switchPpO2 / gas.o2 - modSurfacePressure) /
                pressurePerMeter;
            // Skip if MOD calculation yields invalid result
            if (!Number.isFinite(mod)) {
                continue;
            }
            // Round MOD toward shallower (smaller depth = lower ppO2 = safe)
            // E.g., MOD=22m -> switchDepth=21m
            const switchDepth = Math.max(0, Math.floor(mod / stopIncrement) * stopIncrement);
            gasSwitchPoints.push({
                ...gas,
                switchDepth
            });
        }
        // Sort by switchDepth descending (deeper first) for iteration order
        gasSwitchPoints.sort((a, b) => b.switchDepth - a.switchDepth);
    }

    // Decotengu first attempts a direct ascent on bottom gas and checks the
    // surfaced tissues at GF High. Only a failed NDL ascent creates a GF Low
    // anchor and enters staged decompression.
    const directAscent = evaluateDirectAscent(
        tissuePressures, currentDepth, n2Fraction, gfHigh, surfacePressure,
        pressurePerMeter
    );
    recordDecision('direct-ascent', {
        gf: gfHigh,
        ceilingDepth: directAscent.ceilingDepth,
        controllingCompartment: directAscent.controllingCompartment,
        decision: directAscent.ceilingDepth === 0 ? 'surface' : 'decompression'
    });
    const firstStopResult = directAscent.ceilingDepth === 0
        ? {
            anchorDepth: 0,
            pAnchor: surfacePressure,
            tissuesAtAnchor: directAscent.tissues
        }
        : (decoMode === DECO_MODES.STANDARD
            ? findFirstStagedStopAtGFLow(
                tissuePressures, currentDepth, n2Fraction, gfLow, stopIncrement,
                ASCENT_SPEED, gasSwitchPoints.length > 0 ? gasSwitchPoints : null,
                surfacePressure, recordDecision, pressurePerMeter
            )
            : findFirstStopAtGFLow(
                tissuePressures, currentDepth, n2Fraction, gfLow, stopIncrement,
                ASCENT_SPEED, gasSwitchPoints.length > 0 ? gasSwitchPoints : null,
                surfacePressure, recordDecision, pressurePerMeter
            ));
    const {
        anchorDepth: firstStopFromGFLow,
        tissuesAtAnchor: tissuesAtStrictFirstStop
    } = firstStopResult;

    // Track used gases to avoid duplicate switches
    const usedGases = new Set();
    
    // Helper to switch to next best gas at depth (called on arrival at stop or switch point)
    // "Next best" means the gas with the deepest MOD (highest switchDepth) among eligible gases.
    // This ensures sequential gas switching: EAN50 at 21m before O2 at 6m.
    // NOTE: This is an N2-only model. For trimix (with He), selection logic would need
    // to consider both inert gas fractions and their respective half-times.
    const switchToBestGas = (atDepth, recordSwitch = true, phase = 'ascent') => {
        // Find all eligible gases: within MOD, lower N2 than current, not yet used
        const eligible = gasSwitchPoints.filter(gas => 
            atDepth <= gas.switchDepth && 
            gas.n2 < currentN2 && 
            !usedGases.has(gasKey(gas))
        );
        
        if (eligible.length === 0) {
            return false;
        }
        
        // Pick the gas with the deepest MOD (highest switchDepth) - ensures sequential switching
        // E.g., at 6m, if both EAN50 (MOD 21m) and O2 (MOD 6m) are eligible,
        // but EAN50 wasn't used yet, this picks EAN50 first.
        // gasSwitchPoints is already sorted by switchDepth descending, so eligible[0] is deepest
        const best = eligible.reduce((a, b) => (b.switchDepth > a.switchDepth ? b : a));
        const key = gasKey(best);
        
        currentN2 = best.n2;
        currentGasName = best.name;
        usedGases.add(key);
        if (recordSwitch) {
            gasSwitches.push({ depth: atDepth, gas: best.name, gasId: key });
            recordDecision('gas-switch', {
                depth: atDepth,
                gas: best.name,
                gasId: key,
                duration: gasSwitchTime,
                phase
            });
        }
        return true;
    };
    
    // Per Baker convention, the GF ramp is anchored AT the first stop. At
    // ambient pressures >= pAnchor the active GF is clamped to GF_low; from
    // pAnchor up to the surface it ramps linearly to GF_high.
    const anchorDepth = firstStopFromGFLow;
    const pAnchor = surfacePressure + anchorDepth * pressurePerMeter;
    if (decisionAudit) {
        decisionAudit.anchorDepth = anchorDepth;
        decisionAudit.pAnchor = pAnchor;
    }
    let firstStopDepth = firstStopFromGFLow;
    let tissuesAtFirstStop = tissuesAtStrictFirstStop;
    
    // If no deco needed (first stop = 0), just ascend with mid-ascent gas switches
    // Note: In this path, gas switches occur at MOD (rounded to 3m) during continuous
    // ascent, not at stop depths (since there are no stops).
    // We iterate through unique switch depths and pick the best gas at each.
    if (firstStopDepth === 0) {
        // Get unique switch depths, sorted deepest first
        const uniqueSwitchDepths = [...new Set(gasSwitchPoints.map(g => g.switchDepth))]
            .sort((a, b) => b - a);
        
        let remainingDepth = depth;
        // Use tissuesAtFirstStop as starting point (already simulated ascent to surface)
        // But we need to re-simulate for gas switches at intermediate depths
        let currentTissues = { ...tissues };
        for (const switchDepth of uniqueSwitchDepths) {
            if (remainingDepth > switchDepth) {
                // Ascend to switch depth
                const segmentTime = (remainingDepth - switchDepth) / ASCENT_SPEED;
                currentTissues = simulateDepthChange(
                    currentTissues, remainingDepth, switchDepth, segmentTime,
                    currentN2, surfacePressure, pressurePerMeter
                );
                totalAscentTime += segmentTime;
                advanceRuntime(segmentTime);
                remainingDepth = switchDepth;
                // Switch to best gas at this depth
                if (switchToBestGas(switchDepth) && gasSwitchTime > 0) {
                    currentTissues = simulateDepthTime(
                        currentTissues, switchDepth, gasSwitchTime, currentN2,
                        surfacePressure, pressurePerMeter
                    );
                    advanceRuntime(gasSwitchTime);
                    let switchHoldTime = gasSwitchTime;
                    if (alignRuntimeDepartures) {
                        const alignmentWait = Math.round(
                            (Math.ceil(scheduleRuntime - 1e-9) - scheduleRuntime) * 10
                        ) / 10;
                        if (alignmentWait > 0) {
                            currentTissues = simulateDepthTime(
                                currentTissues, switchDepth, alignmentWait,
                                currentN2, surfacePressure, pressurePerMeter
                            );
                            switchHoldTime += alignmentWait;
                            advanceRuntime(alignmentWait);
                        }
                        const targetGF = interpolateGF(
                            getAmbientPressure(
                                0, surfacePressure, pressurePerMeter
                            ),
                            pAnchor, gfLow, gfHigh, surfacePressure
                        );
                        let targetCeiling = getDiveCeiling(
                            currentTissues, targetGF, surfacePressure,
                            pressurePerMeter
                        ).ceilingDepth;
                        while (targetCeiling > 0) {
                            currentTissues = simulateDepthTime(
                                currentTissues, switchDepth, 1,
                                currentN2, surfacePressure, pressurePerMeter
                            );
                            switchHoldTime += 1;
                            advanceRuntime(1);
                            if (switchHoldTime > DECO_STOP_MAX_MINUTES) {
                                throw new DecoCapExceededError(
                                    switchDepth, stops, DECO_STOP_MAX_MINUTES
                                );
                            }
                            targetCeiling = getDiveCeiling(
                                currentTissues, targetGF, surfacePressure,
                                pressurePerMeter
                            ).ceilingDepth;
                        }
                    }
                    stops.push({
                        depth: switchDepth,
                        time: Math.round(switchHoldTime * 10) / 10,
                        gas: currentGasName,
                        ...(alignRuntimeDepartures ? { departureRuntime: scheduleRuntime } : {})
                    });
                }
            }
        }
        // Final ascent to surface
        if (remainingDepth > 0) {
            const segmentTime = remainingDepth / ASCENT_SPEED;
            currentTissues = simulateDepthChange(
                currentTissues, remainingDepth, 0, segmentTime, currentN2,
                surfacePressure, pressurePerMeter
            );
            totalAscentTime += segmentTime;
            advanceRuntime(segmentTime);
        }
        const totalTime = totalAscentTime + stops.reduce((sum, s) => sum + s.time, 0);
        return {
            stops, gasSwitches, totalTime, totalAscentTime, pAnchor, anchorDepth,
            ...(decisionAudit ? { decisionAudit } : {})
        };
    }
    
    // Ascend to first stop WITH gas switches at MOD depths
    // Gas switches occur at the gas's MOD during ascent, not just at stop depths.
    // This ensures EAN50 is used from 21m even when first stop is at 6m.
    // Get unique switch depths between current depth and first stop, sorted deepest first
    const ascentSwitchDepths = [...new Set(gasSwitchPoints.map(g => g.switchDepth))]
        .filter(d => d < depth && d >= firstStopDepth)
        .sort((a, b) => b - a);  // deepest first
    
    let currentAscentDepth = depth;
    let currentTissues = { ...tissues };
    
    for (const switchDepth of ascentSwitchDepths) {
        if (currentAscentDepth > switchDepth) {
            // Ascend to switch depth
            const segmentTime = (currentAscentDepth - switchDepth) / ASCENT_SPEED;
            currentTissues = simulateDepthChange(
                currentTissues, currentAscentDepth, switchDepth, segmentTime,
                currentN2, surfacePressure, pressurePerMeter
            );
            totalAscentTime += segmentTime;
            advanceRuntime(segmentTime);
            currentAscentDepth = switchDepth;
            // Switch to best gas at this depth
            if (switchToBestGas(switchDepth) && gasSwitchTime > 0) {
                currentTissues = simulateDepthTime(
                    currentTissues, switchDepth, gasSwitchTime, currentN2,
                    surfacePressure, pressurePerMeter
                );
                advanceRuntime(gasSwitchTime);
                let switchHoldTime = gasSwitchTime;
                if (alignRuntimeDepartures) {
                    const alignmentWait = Math.round(
                        (Math.ceil(scheduleRuntime - 1e-9) - scheduleRuntime) * 10
                    ) / 10;
                    if (alignmentWait > 0) {
                        currentTissues = simulateDepthTime(
                            currentTissues, switchDepth, alignmentWait,
                            currentN2, surfacePressure, pressurePerMeter
                        );
                        switchHoldTime += alignmentWait;
                        advanceRuntime(alignmentWait);
                    }
                    const targetGF = interpolateGF(
                        getAmbientPressure(
                            firstStopDepth, surfacePressure, pressurePerMeter
                        ),
                        pAnchor, gfLow, gfHigh, surfacePressure
                    );
                    let targetCeiling = getDiveCeiling(
                        currentTissues, targetGF, surfacePressure,
                        pressurePerMeter
                    ).ceilingDepth;
                    while (targetCeiling > firstStopDepth) {
                        currentTissues = simulateDepthTime(
                            currentTissues, switchDepth, 1,
                            currentN2, surfacePressure, pressurePerMeter
                        );
                        switchHoldTime += 1;
                        advanceRuntime(1);
                        if (switchHoldTime > DECO_STOP_MAX_MINUTES) {
                            throw new DecoCapExceededError(
                                switchDepth, stops, DECO_STOP_MAX_MINUTES
                            );
                        }
                        targetCeiling = getDiveCeiling(
                            currentTissues, targetGF, surfacePressure,
                            pressurePerMeter
                        ).ceilingDepth;
                    }
                }
                stops.push({
                    depth: switchDepth,
                    time: Math.round(switchHoldTime * 10) / 10,
                    gas: currentGasName,
                    ...(alignRuntimeDepartures ? { departureRuntime: scheduleRuntime } : {})
                });
            }
        }
    }

    // Final segment to first stop
    if (currentAscentDepth > firstStopDepth) {
        const finalSegmentTime = (currentAscentDepth - firstStopDepth) / ASCENT_SPEED;
        currentTissues = simulateDepthChange(
            currentTissues, currentAscentDepth, firstStopDepth,
            finalSegmentTime, currentN2, surfacePressure, pressurePerMeter
        );
        totalAscentTime += finalSegmentTime;
        advanceRuntime(finalSegmentTime);
    }
    
    tissues = currentTissues;
    depth = firstStopDepth;
    
    // Standard staged schedules spend at least one minute at every active 3 m
    // decompression level, matching Decotengu's operational convention.
    // Study modes only wait when the tissue ceiling mathematically requires it.
    let pendingStopTime = 0; // accumulates wait time at current depth
    let levelDecision = null;

    while (depth > 0) {
        let switchTime = 0;
        if (switchToBestGas(depth, true, 'level') && gasSwitchTime > 0) {
            tissues = simulateDepthTime(
                tissues, depth, gasSwitchTime, currentN2, surfacePressure,
                pressurePerMeter
            );
            pendingStopTime += gasSwitchTime;
            advanceRuntime(gasSwitchTime);
            switchTime = gasSwitchTime;
        }

        if (!levelDecision) {
            levelDecision = {
                depth,
                gas: currentGasName,
                switchTime,
                mandatoryWait: 0,
                additionalWait: 0,
                alignmentWait: 0,
                initialCeilingDepth: null,
                initialControllingCompartment: null
            };
        } else {
            levelDecision.gas = currentGasName;
            levelDecision.switchTime += switchTime;
        }

        if (pendingStopTime < minimumStopTime) {
            const mandatoryWait = minimumStopTime - pendingStopTime;
            tissues = simulateDepthTime(
                tissues, depth, mandatoryWait, currentN2, surfacePressure,
                pressurePerMeter
            );
            pendingStopTime = minimumStopTime;
            advanceRuntime(mandatoryWait);
            levelDecision.mandatoryWait += mandatoryWait;
        }

        // Next candidate depth (one step shallower)
        const nextStopDepth = Math.max(0, Math.round((depth - stopIncrement) * 10) / 10);
        const delta = depth - nextStopDepth;
        const ascentTime = delta / ASCENT_SPEED;

        // Can-we-ascend check: the ceiling at the *destination* GF (one stop
        // shallower) must clear the destination depth. We do not credit Schreiner
        // off-gassing during the short ascent — we ask "would the current tissue
        // pressures be within the M-line at the next stop, under the next stop's
        // GF". This matches the decotengu convention.
        const gfThere = interpolateGF(
            getAmbientPressure(
                nextStopDepth, surfacePressure, pressurePerMeter
            ),
            pAnchor, gfLow, gfHigh, surfacePressure
        );
        const { ceilingDepth, controllingCompartment } =
            getDiveCeiling(
                tissues, gfThere, surfacePressure, pressurePerMeter
            );
        if (levelDecision.initialCeilingDepth === null) {
            levelDecision.initialCeilingDepth = ceilingDepth;
            levelDecision.initialControllingCompartment = controllingCompartment;
        }

        if (ceilingDepth <= nextStopDepth) {
            if (alignRuntimeDepartures) {
                const alignedRuntime = Math.ceil(scheduleRuntime - 1e-9);
                const alignmentWait = Math.round((alignedRuntime - scheduleRuntime) * 10) / 10;
                if (alignmentWait > 0) {
                    tissues = simulateDepthTime(
                        tissues, depth, alignmentWait, currentN2,
                        surfacePressure, pressurePerMeter
                    );
                    pendingStopTime = Math.round((pendingStopTime + alignmentWait) * 10) / 10;
                    levelDecision.alignmentWait =
                        Math.round((levelDecision.alignmentWait + alignmentWait) * 10) / 10;
                    advanceRuntime(alignmentWait);
                    continue;
                }
            }
            recordDecision('level-decision', {
                ...levelDecision,
                targetDepth: nextStopDepth,
                targetGF: gfThere,
                finalCeilingDepth: ceilingDepth,
                finalControllingCompartment: controllingCompartment,
                totalWait: pendingStopTime,
                decision: 'ascend'
            });
            // Can ascend. Record stop if we waited here.
            if (pendingStopTime > 0) {
                const roundedDepth = Math.round(depth * 10) / 10;
                const previousStop = stops[stops.length - 1];
                if (previousStop
                    && previousStop.depth === roundedDepth
                    && previousStop.gas === currentGasName) {
                    previousStop.time = Math.round(
                        (previousStop.time + pendingStopTime) * 10
                    ) / 10;
                    if (alignRuntimeDepartures) {
                        previousStop.departureRuntime = scheduleRuntime;
                    }
                } else {
                    stops.push({
                        depth: roundedDepth,
                        time: Math.round(pendingStopTime * 10) / 10,
                        gas: currentGasName,
                        ...(alignRuntimeDepartures ? { departureRuntime: scheduleRuntime } : {})
                    });
                }
                pendingStopTime = 0;
            }
            levelDecision = null;

            // Ascend to next depth
            tissues = simulateDepthChange(
                tissues, depth, nextStopDepth, ascentTime, currentN2,
                surfacePressure, pressurePerMeter
            );
            totalAscentTime += ascentTime;
            advanceRuntime(ascentTime);
            depth = nextStopDepth;
        } else {
            // Cannot ascend yet - wait at this depth
            tissues = simulateDepthTime(
                tissues, depth, timeIncrement, currentN2, surfacePressure,
                pressurePerMeter
            );
            pendingStopTime = Math.round((pendingStopTime + timeIncrement) * 10) / 10;
            advanceRuntime(timeIncrement);
            levelDecision.additionalWait =
                Math.round((levelDecision.additionalWait + timeIncrement) * 10) / 10;

            if (pendingStopTime > DECO_STOP_MAX_MINUTES) {
                throw new DecoCapExceededError(depth, stops, DECO_STOP_MAX_MINUTES);
            }
        }
    }
    
    const totalTime = totalAscentTime + stops.reduce((sum, s) => sum + s.time, 0);
    
    return {
        stops, gasSwitches, totalTime, totalAscentTime, pAnchor, anchorDepth,
        ...(decisionAudit ? { decisionAudit } : {})
    };
}

/**
 * Find the best decompression gas valid at given depth
 * Returns gas with lowest N2 fraction (fastest off-gassing) that's within MOD
 * 
 * @param {Array} gases - Available gases [{n2, o2, name}]
 * @param {number} depth - Current depth in meters
 * @param {number} maxPpO2 - Maximum ppO2 (default 1.6 for deco)
 * @returns {Object|null} Best gas or null if none valid
 */
function findBestDecoGas(
    gases,
    depth,
    maxPpO2 = 1.6,
    surfacePressure = SURFACE_PRESSURE,
    pressurePerMeter = PRESSURE_PER_METER
) {
    const ambientPressure = getAmbientPressure(
        depth, surfacePressure, pressurePerMeter
    );
    
    // Filter gases valid at this depth and sort by N2 (lowest first)
    const validGases = gases
        .filter(gas => {
            const ppO2 = ambientPressure * gas.o2;
            return ppO2 <= maxPpO2;
        })
        .sort((a, b) => a.n2 - b.n2);
    
    return validGases[0] || null;
}

// ============================================================================
// DIVE PROFILE PROCESSING
// ============================================================================

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
