/**
 * Pure reducer over a trip's dive list. Every operation returns a NEW trip
 * (immutable update); the dives array is ready to feed planTrip().
 *
 * A trip dive: { id, startDateTime (epoch minutes), maxDepth, bottomTime, gases }.
 * Pure module — no DOM, no side effects.
 */

/**
 * Next stable id: 'd<n>' where n is one past the highest existing numeric suffix.
 * Max-based (not length-based) so ids never collide after a removal.
 */
function nextId(dives) {
    let max = 0;
    for (const d of dives) {
        const m = /^d(\d+)$/.exec(d.id || '');
        if (m) max = Math.max(max, Number(m[1]));
    }
    return 'd' + (max + 1);
}

export function addDive(trip, fields) {
    const dive = { id: nextId(trip.dives), ...fields };
    return { ...trip, dives: [...trip.dives, dive] };
}

export function editDive(trip, id, patch) {
    return {
        ...trip,
        dives: trip.dives.map(d => (d.id === id ? { ...d, ...patch } : d))
    };
}

export function removeDive(trip, id) {
    return { ...trip, dives: trip.dives.filter(d => d.id !== id) };
}

export function rescheduleDive(trip, id, startDateTime) {
    return editDive(trip, id, { startDateTime });
}
