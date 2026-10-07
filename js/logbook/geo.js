/**
 * Pure geo helpers for the site picker: coordinate parsing, Mapy.com URLs and
 * normalisation of place-search results (Mapy.com suggest, Nominatim).
 * API reference: https://api.mapy.com/v1/docs/geocode/ and /v1/docs/maptiles/
 */

/**
 * Parse pasted coordinates such as `49.7856, 13.4012`, `49,7856 13,4012` or
 * `49.7856N 13.4012E`. Decimal commas and N/S/E/W prefixes or suffixes are accepted;
 * S and W make the value negative. Null when the text is not a valid latitude/longitude pair.
 * @param {string} text
 * @returns {{lat: number, lon: number}|null}
 */
export function parseCoordinates(text) {
    if (typeof text !== 'string') return null;
    const clean = text.replace(/[°º]/g, ' ').trim();
    if (!clean || !/^[\s\d.,;+\-NSEWnsew]+$/.test(clean)) return null;
    const tokens = clean.match(/[NSEWnsew]|[+-]?\d+(?:[.,]\d+)?/g) ?? [];
    const nums = [];
    let pending = null;
    for (const tok of tokens) {
        if (/^[a-z]$/i.test(tok)) {
            const letter = tok.toUpperCase();
            const prev = nums[nums.length - 1];
            if (prev && !prev.letter) prev.letter = letter;
            else if (!pending) pending = letter;
            else return null;
        } else {
            nums.push({ value: Number(tok.replace(',', '.')), letter: pending });
            pending = null;
        }
    }
    if (pending || nums.length !== 2 || nums.some(n => !Number.isFinite(n.value))) return null;
    let [first, second] = nums;
    if (first.letter || second.letter) {
        if (!first.letter || !second.letter) return null;
        if ('EW'.includes(first.letter)) [first, second] = [second, first];
        if (!'NS'.includes(first.letter) || !'EW'.includes(second.letter)) return null;
        first = { value: Math.abs(first.value) * (first.letter === 'S' ? -1 : 1) };
        second = { value: Math.abs(second.value) * (second.letter === 'W' ? -1 : 1) };
    }
    const lat = first.value;
    const lon = second.value;
    if (lat < -90 || lat > 90 || lon < -180 || lon > 180) return null;
    return { lat, lon };
}

const MAPY_BASE = 'https://api.mapy.com/v1';
const MAPY_LANGS = ['cs', 'en', 'es'];
export const MAPY_SUGGEST_LIMIT = 6;

/** Mapy.com language for a UI language: cs, en or es; anything else English. */
export const mapyLang = lang => (MAPY_LANGS.includes(lang) ? lang : 'en');

/** Leaflet tile template for a Mapy.com mapset (basic, outdoor, aerial, names-overlay). */
export const mapyTileUrl = (mapset, apiKey) =>
    `${MAPY_BASE}/maptiles/${mapset}/256/{z}/{x}/{y}?apikey=${encodeURIComponent(apiKey)}`;

/** TileJSON URL of a mapset; used to check that the key works (tiles answer 401/403 with an image, which Leaflet sees as success). */
export const mapyProbeUrl = (mapset, apiKey) => `${MAPY_BASE}/maptiles/${mapset}/tiles.json?apikey=${encodeURIComponent(apiKey)}`;

/**
 * Mapy.com suggest request. `center` ({lat, lon}) biases results towards the map view
 * (API parameter `preferNear` takes lon,lat).
 */
export function mapySuggestUrl(query, { lang, apiKey, center } = {}) {
    const params = new URLSearchParams({ query: String(query ?? ''), lang: mapyLang(lang), limit: String(MAPY_SUGGEST_LIMIT) });
    if (Number.isFinite(center?.lat) && Number.isFinite(center?.lon)) params.set('preferNear', `${center.lon},${center.lat}`);
    params.set('apikey', apiKey ?? '');
    return `${MAPY_BASE}/suggest?${params}`;
}

const finiteBox = box => (Array.isArray(box) && box.length === 4 && box.every(Number.isFinite) ? box : null);

/**
 * Normalise a Mapy.com suggest response to `[{name, detail, lat, lon, bbox:[south,north,west,east]|null}]`.
 * Mapy gives bbox as [minLon, minLat, maxLon, maxLat].
 */
export function placesFromMapy(json) {
    if (!Array.isArray(json?.items)) return [];
    const out = [];
    for (const item of json.items) {
        const lat = Number(item?.position?.lat);
        const lon = Number(item?.position?.lon);
        const name = typeof item?.name === 'string' ? item.name.trim() : '';
        if (!name || item.position?.lat == null || item.position?.lon == null || !Number.isFinite(lat) || !Number.isFinite(lon)) continue;
        const b = finiteBox(item.bbox);
        const detail = [item.label, item.location].filter(v => typeof v === 'string' && v.trim()).join(', ');
        out.push({ name, detail, lat, lon, bbox: b ? [b[1], b[3], b[0], b[2]] : null });
    }
    return out;
}

/** Normalise a Nominatim search response (jsonv2) to the same shape; its boundingbox is already [south, north, west, east]. */
export function placesFromNominatim(json) {
    if (!Array.isArray(json)) return [];
    const out = [];
    for (const item of json) {
        const lat = Number(item?.lat);
        const lon = Number(item?.lon);
        const display = typeof item?.display_name === 'string' ? item.display_name.trim() : '';
        if (!display || item.lat == null || item.lon == null || !Number.isFinite(lat) || !Number.isFinite(lon)) continue;
        const b = Array.isArray(item.boundingbox) ? finiteBox(item.boundingbox.map(Number)) : null;
        out.push({ name: display.split(',')[0].trim(), detail: display, lat, lon, bbox: b });
    }
    return out;
}

const EARTH_RADIUS_M = 6371008.8;
const toRad = deg => (deg * Math.PI) / 180;

/** Great-circle (haversine) distance in metres between two `{lat, lon}` points. */
export function distanceMeters(a, b) {
    const dLat = toRad(b.lat - a.lat);
    const dLon = toRad(b.lon - a.lon);
    const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLon / 2) ** 2;
    return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Key for comparing site names: trimmed, case-insensitive. */
export const siteNameKey = name => String(name ?? '').trim().toLocaleLowerCase();

/** Map(nameKey -> count) for names shared by two or more sites. */
export function duplicateNameCounts(sites) {
    const all = new Map();
    for (const s of sites) {
        const key = siteNameKey(s.name);
        all.set(key, (all.get(key) ?? 0) + 1);
    }
    return new Map([...all].filter(([, n]) => n > 1));
}

/**
 * The nearest site with the same name (trimmed, case-insensitive) and a position within `limitM` metres of `pin`.
 * @returns {{site: Object, distance: number}|null}
 */
export function nearbySameNameSite(sites, name, pin, limitM = 300) {
    const key = siteNameKey(name);
    let best = null;
    for (const site of sites) {
        if (siteNameKey(site.name) !== key || !Number.isFinite(site.lat) || !Number.isFinite(site.lon)) continue;
        const distance = distanceMeters(pin, site);
        if (distance <= limitM && (!best || distance < best.distance)) best = { site, distance };
    }
    return best;
}
