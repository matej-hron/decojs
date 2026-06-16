/**
 * Pre-saturation expressed as the surfacing gradient factor.
 *
 * "If you ascended straight to the surface right now, how close to each tissue's
 * Bühlmann limit are you." 0% = off-gassed to a fresh-diver baseline (clamped);
 * 100% = at the surfacing M-value limit. This is the same gradient factor the GF
 * chart shows, read at surface ambient — no new decompression math.
 *
 * Pure module — no DOM, no side effects.
 */

import { calculateMaxGF, getAmbientPressure } from './decoModel.js';

/**
 * @param {Object} tissuePressures - { [compartmentId]: nitrogen pressure (bar) }
 * @returns {{
 *   controllingPct: number,            // max surfacing GF across tissues, clamped at 0, as %
 *   controllingCompartmentId: number,  // the leading (max-GF) compartment id
 *   perCompartmentPct: Object.<number, number> // compartment id → clamped surfacing GF %
 * }}
 *   Negative GFs are clamped to 0: a negative surfacing GF means the tissue sits
 *   below surface ambient (it still has on-gassing capacity, not a saturation
 *   state), so it reads as 0% pre-saturation rather than a negative percentage.
 */
export function surfacingGF(tissuePressures) {
    const surfaceAmbient = getAmbientPressure(0);
    const { gfMax, leadingCompartment, allGFs } = calculateMaxGF(tissuePressures, surfaceAmbient);
    const clampPct = (g) => Math.max(0, g) * 100;

    const perCompartmentPct = {};
    for (const id of Object.keys(allGFs)) {
        perCompartmentPct[Number(id)] = clampPct(allGFs[id]);
    }

    return {
        controllingPct: clampPct(gfMax),
        controllingCompartmentId: leadingCompartment,
        perCompartmentPct
    };
}
