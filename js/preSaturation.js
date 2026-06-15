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
 *   perCompartmentPct: Object          // { [compartmentId]: clamped surfacing GF % }
 * }}
 */
export function surfacingGF(tissuePressures) {
    const surfaceAmbient = getAmbientPressure(0);
    const { gfMax, leadingCompartment, allGFs } = calculateMaxGF(tissuePressures, surfaceAmbient);
    const clampPct = (g) => Math.max(0, g) * 100;

    const perCompartmentPct = {};
    for (const id of Object.keys(allGFs)) {
        perCompartmentPct[id] = clampPct(allGFs[id]);
    }

    return {
        controllingPct: clampPct(gfMax),
        controllingCompartmentId: leadingCompartment,
        perCompartmentPct
    };
}
