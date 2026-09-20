/**
 * Decompression Model — M-values, gradient factors and ceilings.
 *
 * Extracted verbatim from js/decoModel.js; js/decoModel.js re-exports the
 * public surface so existing importers are unaffected.
 */

import { COMPARTMENTS } from '../tissueCompartments.js';
import { PRESSURE_PER_METER, SURFACE_PRESSURE } from './constants.js';

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
