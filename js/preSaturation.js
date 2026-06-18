/**
 * Pre-saturation: how loaded the tissues are at the START of a (repetitive) dive,
 * relative to a fresh surface-saturated diver, on a 0–100 scale toward the surfacing limit.
 *
 * The baseline is the **surface-saturation** value — the inert-gas tension a fresh diver
 * carries at the surface, breathing air (≈0.751 bar with the alveolar water-vapour
 * correction) — NOT ambient pressure. So:
 *   0%   = fresh / fully off-gassed (no residual loading)
 *   100% = the leading tissue is already at its surfacing M-value before the dive begins
 * A value above 100% means the diver would be over the surfacing limit at the surface
 * (e.g. a too-soon / overlapping repeat dive).
 *
 * Why not the surfacing gradient factor: a GF anchors at ambient pressure, so residual
 * loading that sits between the surface-saturation baseline (~0.751 bar) and ambient
 * (~1.013 bar) — exactly the band that makes a repeat dive accrue more deco — reads 0
 * on a GF even though the tissues are clearly pre-loaded. Anchoring at the surface-
 * saturation baseline makes this metric reflect that residual loading.
 *
 * Pure module — no DOM, no side effects.
 */

import { getMValue, getAmbientPressure, getInitialTissueN2, N2_FRACTION } from './decoModel.js';
import { COMPARTMENTS } from './tissueCompartments.js';

/**
 * @param {Object} tissuePressures - { [compartmentId]: nitrogen pressure (bar) }
 * @returns {{
 *   controllingPct: number,            // max pre-saturation across tissues (clamped at 0), as %
 *   controllingCompartmentId: number,  // the leading (max) compartment id
 *   perCompartmentPct: Object.<number, number> // compartment id → pre-saturation %
 * }}
 *   Each compartment's pre-saturation is (P − surfaceSat) / (M0 − surfaceSat), where
 *   surfaceSat is the fresh-diver surface N2 tension and M0 is that compartment's
 *   surfacing M-value. Tensions at or below the surface-saturation baseline clamp to 0%.
 */
export function preSaturation(tissuePressures) {
    // Surface-saturation baseline (air at the surface — the gas breathed during a surface
    // interval). The same value for every compartment, since all equilibrate to the
    // inspired surface tension.
    const baseline = getInitialTissueN2(N2_FRACTION);
    const surfaceAmbient = getAmbientPressure(0);

    let controllingPct = 0;
    let controllingCompartmentId = COMPARTMENTS[0].id;
    const perCompartmentPct = {};

    for (const comp of COMPARTMENTS) {
        const m0 = getMValue(surfaceAmbient, comp.aN2, comp.bN2); // surfacing M-value (GF 100%)
        const denom = m0 - baseline;
        const tissueP = tissuePressures[comp.id];
        const frac = denom > 0 ? (tissueP - baseline) / denom : 0;
        const pct = Math.max(0, frac) * 100; // residual at/below baseline ⇒ 0%

        perCompartmentPct[comp.id] = pct;
        if (pct > controllingPct) {
            controllingPct = pct;
            controllingCompartmentId = comp.id;
        }
    }

    return { controllingPct, controllingCompartmentId, perCompartmentPct };
}
