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

/**
 * @typedef {Object} TripDiveResult
 * @property {string} id
 * @property {string=} name
 * @property {number} startDateTime  Epoch minutes.
 * @property {number} endDateTime    Epoch minutes (start + full runtime incl. deco).
 * @property {number} maxDepth       Metres.
 * @property {number} bottomTime     Effective bottom time used (derived for ndlLocked dives).
 * @property {boolean} ndlLocked     Echo of the input dive's NDL-lock flag.
 * @property {?number} surfaceIntervalBefore  Minutes since the previous dive's end; null for the first dive.
 * @property {Object} startingTissue Per-compartment N2 pressure at the start of the dive.
 * @property {Object} endTissue      Per-compartment N2 pressure at the end of the dive.
 * @property {Object} profile        generateDecoProfile output (waypoints, decoStops, totalDecoTime, …).
 * @property {boolean} invalid       True when an ndlLocked dive has under 1 min of real bottom time.
 * @property {?string} invalidReason 'ndl-too-short' when invalid, else null.
 */

/** Cap for an NDL-locked dive whose NDL is effectively infinite (very shallow). */
const NDL_LOCK_CAP = 99;

/**
 * @param {Object} diveSetup - { gases, gfLow, gfHigh, dives: TripDive[] }
 * @returns {{ dives: TripDiveResult[], conflicts: Array<{diveId: string, type: string}> }}
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
        let invalid = false;
        let invalidReason = null;
        if (dive.ndlLocked) {
            const n2 = (diveGases && diveGases[0]) ? diveGases[0].n2 : N2_FRACTION;
            // Use the NDL value directly as the bottom time. calculateNDL reports the NDL
            // the way dive tables do — from leaving the surface, descent included — so it
            // drops straight into bottomTime with no correction, and a moved NDL-locked
            // dive shows the SAME number the add-dialog showed at creation.
            const ndl = calculateNDL(dive.maxDepth, n2, gfLow / 100, seed).ndl;
            const capped = Number.isFinite(ndl) ? Math.min(ndl, NDL_LOCK_CAP) : NDL_LOCK_CAP;
            const descentTime = dive.maxDepth / 20;   // DESCENT_SPEED = 20 m/min
            // If the actual bottom phase (capped − descentTime) is under a minute, there is no
            // real no-deco dive at this position (too pre-saturated). Flag it invalid; still floor
            // the bottom time so a minimal profile is generated for tissue continuity (chaining),
            // but the UI shows an explanation instead of the degenerate "triangle" profile.
            if (capped - descentTime < 1) {
                invalid = true;
                invalidReason = 'ndl-too-short';
            }
            bottomTime = Math.max(capped, descentTime);
        }

        const decoOpts = seed ? { initialTissuePressures: seed } : {};
        // Safety stops are disabled for the trip planner: a 3-min stop on no-deco dives inflates
        // runtime/TTS inconsistently across dives and obscures the calendar deco times.
        const profile = generateDecoProfile(
            dive.maxDepth, bottomTime, diveGases, gfLow, gfHigh, { enabled: false }, decoOpts
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
            ndlLocked: !!dive.ndlLocked,
            surfaceIntervalBefore,
            startingTissue,
            endTissue,
            profile,
            invalid,
            invalidReason
        });

        tissue = endTissue;
        prevEndDateTime = endDateTime;
    });

    return { dives: results, conflicts };
}
