/**
 * Encode/decode a repetitive-dive trip to/from a URL param, so a trip is
 * shareable and reload-surviving. Mirrors the single-dive scheme in urlParams.js.
 *
 * encodeTrip/decodeTrip are pure (no DOM). The get/update/share helpers touch
 * window.location / history.
 */

const URL_PARAM = 'trip';

function minimalGas(g) {
    return { id: g.id, name: g.name, o2: g.o2, n2: g.n2, he: g.he || 0 };
}

function sameGases(a, b) {
    if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false;
    return a.every((g, i) =>
        g.id === b[i].id && g.o2 === b[i].o2 && g.n2 === b[i].n2 && (g.he || 0) === (b[i].he || 0));
}

/**
 * @param {Object} trip - { startDate, dayCount, gfLow, gfHigh, gases, dives }
 * @returns {string} URL-safe base64 of the minimal trip JSON
 */
export function encodeTrip(trip) {
    const tripGases = (trip.gases || []).map(minimalGas);
    const minimal = {
        startDate: trip.startDate,
        dayCount: trip.dayCount,
        gfLow: trip.gfLow,
        gfHigh: trip.gfHigh,
        gases: tripGases,
        dives: (trip.dives || []).map(d => {
            const dive = {
                name: d.name,
                startDateTime: d.startDateTime,
                maxDepth: d.maxDepth,
                bottomTime: d.bottomTime
            };
            // Store per-dive gas only when it differs from the trip gas (keeps URLs short).
            if (d.gases && !sameGases(d.gases, trip.gases)) dive.gases = d.gases.map(minimalGas);
            return dive;
        })
    };
    const json = JSON.stringify(minimal);
    return btoa(unescape(encodeURIComponent(json)));
}

/**
 * @param {string} str - encoded trip
 * @returns {Object|null} trip, or null on any malformed input
 */
export function decodeTrip(str) {
    try {
        if (!str) return null;
        const json = decodeURIComponent(escape(atob(str)));
        const m = JSON.parse(json);
        if (!m || !Array.isArray(m.dives) || !Array.isArray(m.gases)) return null;
        const tripGases = m.gases;
        const dives = m.dives.map((d, i) => ({
            id: 'd' + (i + 1),
            name: d.name,
            startDateTime: d.startDateTime,
            maxDepth: d.maxDepth,
            bottomTime: d.bottomTime,
            gases: Array.isArray(d.gases) ? d.gases : [...tripGases]
        }));
        return {
            startDate: m.startDate,
            dayCount: m.dayCount,
            gfLow: m.gfLow,
            gfHigh: m.gfHigh,
            gases: tripGases,
            dives
        };
    } catch (e) {
        return null;
    }
}

/** Read and decode the trip from the current URL (null if absent/invalid). */
export function getTripFromUrl() {
    const params = new URLSearchParams(window.location.search);
    return decodeTrip(params.get(URL_PARAM));
}

/** Write the trip into the URL via replaceState (no new history entry). */
export function updateUrlWithTrip(trip) {
    const url = new URL(window.location);
    url.searchParams.set(URL_PARAM, encodeTrip(trip));
    window.history.replaceState({}, '', url);
}

/** Absolute shareable URL for the trip. */
export function getTripShareUrl(trip) {
    const url = new URL(window.location);
    url.searchParams.set(URL_PARAM, encodeTrip(trip));
    return url.toString();
}
