/**
 * Pre-saturation-aware NDL preview for a candidate dive at a given trip position.
 *
 * A dive's carried-in tissue load depends only on the dives BEFORE it (and the
 * surface gap), never on its own duration — so we drop a placeholder dive at the
 * candidate start, let planTrip chain it, read its startingTissue, and feed that
 * into a seeded calculateNDL. No circularity.
 *
 * Pure module — no DOM.
 */
import { planTrip } from './tripPlanner.js';
import { addDive } from './tripState.js';
import { calculateNDL } from './decoModel.js';

/**
 * @param {Object} trip - { gases, gfLow, gfHigh, dives }
 * @param {Object} candidate - { startDateTime, maxDepth, gases }
 * @param {number} gfLow - GF Low as a percentage (0-100)
 * @returns {number} pre-saturation-aware NDL in minutes
 */
export function previewNdl(trip, candidate, gfLow = trip.gfLow ?? 100) {
    const withCandidate = addDive(trip, {
        startDateTime: candidate.startDateTime,
        maxDepth: candidate.maxDepth,
        bottomTime: 1, // placeholder; startingTissue is independent of it
        gases: candidate.gases
    });
    const newId = withCandidate.dives[withCandidate.dives.length - 1].id;
    const result = planTrip(withCandidate);
    const placed = result.dives.find(d => d.id === newId);
    const seed = placed.startingTissue;
    const n2 = (candidate.gases && candidate.gases[0]) ? candidate.gases[0].n2 : 0.79;
    return calculateNDL(candidate.maxDepth, n2, gfLow / 100, seed).ndl;
}
