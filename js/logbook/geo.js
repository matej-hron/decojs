/**
 * Pure geo helpers for the site picker: coordinate parsing, Mapy.com URLs and
 * normalisation of place-search results (Mapy.com suggest, Nominatim).
 * API reference: https://api.mapy.com/v1/docs/geocode/ and /v1/docs/maptiles/
 */

import { escHtml } from '../utils/escHtml.js';

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

/** A site name folded for comparing: trimmed, case and diacritics folded, punctuation and repeated spaces collapsed. */
export function foldSiteName(name) {
    return String(name ?? '').normalize('NFD').replace(/\p{M}/gu, '').toLocaleLowerCase()
        .replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
}

/** Levenshtein distance, giving up (returning `max + 1`) once it exceeds `max`. */
function editDistance(a, b, max) {
    if (Math.abs(a.length - b.length) > max) return max + 1;
    let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
    for (let i = 1; i <= a.length; i++) {
        const cur = [i];
        let best = i;
        for (let j = 1; j <= b.length; j++) {
            cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
            best = Math.min(best, cur[j]);
        }
        if (best > max) return max + 1;
        prev = cur;
    }
    return prev[b.length];
}

/**
 * Whether two site names probably mean the same place: equal after folding (case, diacritics, punctuation), one
 * contains the other (the shorter has at least 4 characters: "Barbora" / "Lom Barbora"), or a typo apart
 * (one edit from 5 characters, two from 10).
 */
export function similarSiteNames(a, b) {
    const x = foldSiteName(a);
    const y = foldSiteName(b);
    if (!x || !y) return false;
    if (x === y) return true;
    const [short, long] = x.length <= y.length ? [x, y] : [y, x];
    if (short.length >= 4 && (` ${long} `).includes(` ${short} `)) return true;
    const max = short.length >= 10 ? 2 : short.length >= 5 ? 1 : 0;
    return max > 0 && editDistance(x, y, max) <= max;
}

/** A site has a usable position. */
const positioned = s => Number.isFinite(s?.lat) && Number.isFinite(s?.lon);

/**
 * Other sites that are probably the same place as `site`: a similar name (see similarSiteNames) and a position
 * within `limitM` metres. Nearest first.
 * @returns {{site: Object, distance: number}[]}
 */
export function possibleDuplicates(site, sites, limitM = 300) {
    if (!positioned(site)) return [];
    return sites
        .filter(s => s.id !== site.id && positioned(s) && similarSiteNames(s.name, site.name))
        .map(s => ({ site: s, distance: distanceMeters(site, s) }))
        .filter(d => d.distance <= limitM)
        .sort((a, b) => a.distance - b.distance || String(a.site.id).localeCompare(String(b.site.id)));
}

/**
 * The site nearest to `point` within `maxM` metres, or null. Ties (equal distance, e.g. duplicates at one spot):
 * the user's own site first, then the one with more visits, then by name and id, so the answer is stable.
 * @param {Object[]} sites - with lat, lon (others are skipped), optional own and visits
 * @param {{lat: number, lon: number}} point
 * @returns {{site: Object, distance: number}|null}
 */
export function nearestSite(sites, point, maxM = 1000) {
    if (!positioned(point)) return null;
    const rank = (a, b) => a.distance - b.distance
        || Number(b.site.own !== false) - Number(a.site.own !== false)
        || (Number(b.site.visits) || 0) - (Number(a.site.visits) || 0)
        || String(a.site.name).localeCompare(String(b.site.name)) || String(a.site.id).localeCompare(String(b.site.id));
    const near = (sites ?? []).filter(positioned)
        .map(site => ({ site, distance: Math.round(distanceMeters(point, site) * 10) / 10 })) // 0.1 m: float noise is a tie
        .filter(d => d.distance <= maxM)
        .sort(rank);
    return near[0] ?? null;
}

/**
 * The site a typed name means: the user's own site of that name (trimmed, case-insensitive) first, else the
 * community site of that name with the most visits. Null when none.
 */
export function findSiteByName(sites, name) {
    const key = siteNameKey(name);
    if (!key) return null;
    const same = sites.filter(s => siteNameKey(s.name) === key);
    return same.find(s => s.own !== false)
        ?? same.filter(s => s.own === false).sort((a, b) => (Number(b.visits) || 0) - (Number(a.visits) || 0))[0] ?? null;
}

/**
 * Datalist options for the site field: each name once (the site `findSiteByName` would pick), own sites first, then
 * community sites labelled "added by …" via `ownerLabel(site)` (null leaves the label out).
 * @returns {{value: string, label?: string}[]}
 */
export function siteNameOptions(sites, ownerLabel = () => null) {
    const seen = new Set();
    const out = [];
    const ordered = [...sites.filter(s => s.own !== false), ...sites.filter(s => s.own === false)
        .sort((a, b) => (Number(b.visits) || 0) - (Number(a.visits) || 0))];
    for (const s of ordered) {
        const key = siteNameKey(s.name);
        if (!key || seen.has(key)) continue;
        seen.add(key);
        const label = s.own === false ? ownerLabel(s) : null;
        out.push(label ? { value: s.name, label } : { value: s.name });
    }
    return out;
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

const MAPY_STATIC_LANGS = ['cs', 'de', 'el', 'en', 'es', 'fr', 'it', 'nl', 'pl', 'pt', 'ru', 'sk', 'tr', 'uk'];
const clampPx = n => Math.min(1024, Math.max(10, Math.round(Number(n) || 10)));

/**
 * Mapy.com static map (v1/static/map) centred on a site with one marker. The image carries the Mapy.com
 * logo and attribution itself. '' without a key or a valid position.
 */
export function mapyStaticMapUrl({ lat, lon, apiKey, width, height, zoom = 12, scale = 1, lang = 'en', mapset = 'outdoor', color = '#2980b9', marker = true }) {
    if (!apiKey || lat === null || lon === null || !Number.isFinite(lat) || !Number.isFinite(lon)) return '';
    const params = new URLSearchParams({
        lon: String(lon), lat: String(lat), zoom: String(zoom), width: String(clampPx(width)), height: String(clampPx(height)),
        scale: String(scale >= 2 ? 2 : 1), mapset, lang: MAPY_STATIC_LANGS.includes(lang) ? lang : 'en', format: 'jpg',
        markers: `color:${color};size:normal;${lon},${lat}`, apikey: apiKey,
    });
    if (!marker) params.delete('markers');
    return `${MAPY_BASE}/static/map?${params}`;
}

/** Metres per CSS pixel of a Web Mercator map at `zoom` and latitude `lat` (256-px tiles). */
export function metersPerPixel(lat, zoom) {
    return (156543.03392 * Math.cos(toRad(lat))) / 2 ** zoom;
}

/** True for a well-formed https:// link without whitespace. */
export function isHttpsUrl(text) {
    const s = String(text ?? '');
    if (s === '' || /\s/.test(s)) return false;
    try {
        const u = new URL(s);
        return u.protocol === 'https:' && u.hostname !== '';
    } catch {
        return false;
    }
}

const SITE_URL_CHARS = /^https:\/\/[A-Za-z0-9._~:/?#@!$&'()*+,;=%[\]-]+$/; // as the 0006 check constraint
const SITE_URL_MAX = 500;

/**
 * Parse the site link field: empty is none, otherwise an https:// address, normalised the way the browser
 * writes it (lowercase scheme and host, punycode, percent-encoded path) so it passes the database check.
 * @returns {{ok: true, value: string|null}|{ok: false}}
 */
export function parseSiteUrl(text) {
    const s = String(text ?? '').trim();
    if (s === '') return { ok: true, value: null };
    if (!isHttpsUrl(s)) return { ok: false };
    const href = new URL(s).href;
    return SITE_URL_CHARS.test(href) && href.length <= SITE_URL_MAX ? { ok: true, value: href } : { ok: false };
}

/** "Site info ↗": a link that opens in a new tab, or '' when `url` is not a safe https address. */
export function siteInfoLinkHtml(url, text) {
    if (!isHttpsUrl(url) || !SITE_URL_CHARS.test(url)) return '';
    return `<a class="lb-site-info" href="${escHtml(url)}" target="_blank" rel="noopener noreferrer">${escHtml(text)}<span aria-hidden="true">\u00a0↗</span></a>`;
}
