/**
 * Shape-preserving thinning of a recorded dive profile.
 *
 * Recorded dives have a sample every second; DecoTheory's charts turn every
 * waypoint into a time step. Ramer–Douglas–Peucker keeps only the points needed
 * to stay within a depth tolerance of the original polyline.
 */

/**
 * Reduce waypoints while keeping the profile within `toleranceM` of the original.
 *
 * Always keeps the first and last waypoint, the deepest waypoint and every
 * waypoint that carries a `gasId`. Deviation is measured in depth at the same
 * time (vertical distance), so the tolerance is in metres.
 *
 * @param {Array<{time: number, depth: number, gasId?: string}>} waypoints - Time in minutes, ascending
 * @param {number} toleranceM - Maximum allowed depth deviation in metres
 * @returns {Array<Object>} A new array holding a subset of the same waypoint objects, in order
 */
export function thinProfile(waypoints, toleranceM) {
    if (waypoints.length <= 2) return waypoints.slice();

    const keep = new Uint8Array(waypoints.length);
    keep[0] = 1;
    keep[waypoints.length - 1] = 1;
    let deepest = 0;
    waypoints.forEach((wp, i) => {
        if (wp.depth > waypoints[deepest].depth) deepest = i;
        if (wp.gasId) keep[i] = 1;
    });
    keep[deepest] = 1;

    const simplify = (first, last) => {
        const a = waypoints[first];
        const b = waypoints[last];
        let maxDeviation = 0;
        let maxIndex = -1;
        for (let i = first + 1; i < last; i++) {
            const span = b.time - a.time;
            const fraction = span > 0 ? (waypoints[i].time - a.time) / span : 0;
            const deviation = Math.abs(waypoints[i].depth - (a.depth + fraction * (b.depth - a.depth)));
            if (deviation > maxDeviation) {
                maxDeviation = deviation;
                maxIndex = i;
            }
        }
        if (maxDeviation > toleranceM) {
            keep[maxIndex] = 1;
            simplify(first, maxIndex);
            simplify(maxIndex, last);
        }
    };

    let previous = 0;
    for (let i = 1; i < waypoints.length; i++) {
        if (keep[i]) {
            simplify(previous, i);
            previous = i;
        }
    }
    return waypoints.filter((_, i) => keep[i]);
}
