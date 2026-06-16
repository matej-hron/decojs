/**
 * Repetitive-dive trip planner (sub-project ①).
 *
 * Chains a sequence of square dives across surface intervals: tissues off-gas at
 * the surface between dives, and each dive's deco obligation is regenerated from
 * the carried-in ("pre-saturated") tissue state.
 *
 * Pure module — no DOM, no side effects.
 */

import { generateDecoProfile } from './diveSetup.js';
import { calculateTissueLoading, simulateDepthTime, calculateNDL, N2_FRACTION } from './decoModel.js';

/**
 * @typedef {Object} TripDive
 * @property {string} id            Stable identity (survives reshuffling).
 * @property {number} startDateTime Scheduled start, epoch minutes.
 * @property {number} maxDepth      Metres.
 * @property {number} bottomTime    Minutes from dive start until leaving max depth.
 * @property {Array=}  gases         Optional per-dive gas list; falls back to the trip-level diveSetup.gases when absent.
 */

/** Cap for an NDL-locked dive whose NDL is effectively infinite (very shallow). */
const NDL_LOCK_CAP = 99;

/**
 * @param {Object} diveSetup - { gases, gfLow, gfHigh, dives: TripDive[] }
 * @returns {{ dives: Array, conflicts: Array }}
 */
export function planTrip(diveSetup) {
    const gases = diveSetup.gases;
    const gfLow = diveSetup.gfLow ?? 100;
    const gfHigh = diveSetup.gfHigh ?? 100;

    const ordered = [...diveSetup.dives].sort((a, b) => a.startDateTime - b.startDateTime);

    const results = [];
    const conflicts = [];
    let tissue = null;            // { [compId]: pressure } at end of previous dive
    let prevEndDateTime = null;

    ordered.forEach((dive, i) => {
        let surfaceIntervalBefore = null;
        let seed = null;

        if (i > 0) {
            const gap = dive.startDateTime - prevEndDateTime;
            if (gap < 0) {
                conflicts.push({ diveId: dive.id, type: 'overlap', overrunMinutes: -gap });
                surfaceIntervalBefore = 0;
                seed = { ...tissue };                       // no off-gassing
            } else {
                surfaceIntervalBefore = gap;
                seed = simulateDepthTime(tissue, 0, gap, N2_FRACTION);  // off-gas on air at surface
            }
        }

        const diveGases = dive.gases ?? gases;

        // NDL-locked dives derive their bottom time from the carried-in pre-saturation,
        // so they stay no-deco wherever they are scheduled. seed === null on the first
        // dive ⇒ surface-saturated NDL (matches the add-dialog preview).
        let bottomTime = dive.bottomTime;
        if (dive.ndlLocked) {
            const n2 = (diveGases && diveGases[0]) ? diveGases[0].n2 : N2_FRACTION;
            const ndl = calculateNDL(dive.maxDepth, n2, gfLow / 100, seed).ndl;
            const capped = Number.isFinite(ndl) ? Math.min(ndl, NDL_LOCK_CAP) : NDL_LOCK_CAP;
            // bottomTime is measured from dive start and includes the descent. A derived NDL
            // below the descent time (heavy pre-saturation, e.g. an overlapping dive) would
            // make actualBottomDuration negative and the profile non-monotonic, so floor it at
            // the descent time (DESCENT_SPEED = 20 m/min, matching generateDecoProfile).
            const descentTime = dive.maxDepth / 20;
            bottomTime = Math.max(capped, descentTime);
        }

        const decoOpts = seed ? { initialTissuePressures: seed } : {};
        const profile = generateDecoProfile(
            dive.maxDepth, bottomTime, diveGases, gfLow, gfHigh, undefined, decoOpts
        );
        // surfaceInterval = 0: we want only the in-water tissue track for this dive;
        // surface off-gassing between dives is handled separately by simulateDepthTime
        // at the start of the next iteration.
        const loading = calculateTissueLoading(profile.waypoints, 0, { gases: diveGases, ...decoOpts });

        const startingTissue = {};
        const endTissue = {};
        Object.keys(loading.compartments).forEach(id => {
            const p = loading.compartments[id].pressures;
            startingTissue[id] = seed ? seed[id] : p[0];
            endTissue[id] = p[p.length - 1];
        });

        const lastWp = profile.waypoints[profile.waypoints.length - 1];
        const endDateTime = dive.startDateTime + lastWp.time;

        results.push({
            id: dive.id,
            name: dive.name,
            startDateTime: dive.startDateTime,
            endDateTime,
            maxDepth: dive.maxDepth,
            bottomTime,
            surfaceIntervalBefore,
            startingTissue,
            endTissue,
            profile
        });

        tissue = endTissue;
        prevEndDateTime = endDateTime;
    });

    return { dives: results, conflicts };
}
