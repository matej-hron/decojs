/**
 * Decompression Model — Haldane and Schreiner gas kinetics.
 *
 * Extracted verbatim from js/decoModel.js; js/decoModel.js re-exports the
 * public surface so existing importers are unaffected.
 */

import { COMPARTMENTS, getRateConstant } from '../tissueCompartments.js';
import { N2_FRACTION, PRESSURE_PER_METER, SURFACE_PRESSURE, WATER_VAPOR_PRESSURE } from './constants.js';
import { getAmbientPressure } from './environment.js';

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
