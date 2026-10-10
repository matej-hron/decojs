/**
 * Public share link of one dive (migration 0005). Pure helpers, shared by the owner's
 * share controls and the anonymous share page `lab/dive.html`.
 */

/** Request header that carries the token to the database (storage policies read it). */
export const SHARE_HEADER = 'x-decotrail-share';

/** The share page, relative to the logbook page. */
export const SHARE_PAGE = 'dive.html';

const TOKEN = /^[0-9a-f]{64}$/;

/** True for a well-formed token: 64 lowercase hex characters. */
export function isShareToken(token) {
    return typeof token === 'string' && TOKEN.test(token);
}

/** The token of a share page fragment (`#s=<token>`), else null. */
export function parseShareHash(hash) {
    let params;
    try {
        params = new URLSearchParams(String(hash ?? '').replace(/^#/, ''));
    } catch {
        return null;
    }
    const token = (params.get('s') ?? '').trim().toLowerCase();
    return isShareToken(token) ? token : null;
}

/**
 * The public link of a dive. The token goes in the fragment: browsers never send it to a server
 * or in a Referer header.
 * @param {string} token
 * @param {string} pageHref - the page the link is made on (its folder holds the share page)
 * @returns {string|null}
 */
export function shareUrl(token, pageHref) {
    if (!isShareToken(token)) return null;
    const url = new URL(SHARE_PAGE, pageHref);
    url.search = '';
    url.hash = `s=${token}`;
    return url.href;
}

/** Visibility a dive returns to when its link is turned off: what it was before, else members. */
export function visibilityAfterSharing(before) {
    return before === 'private' || before === 'members' ? before : 'members';
}

const pick = (obj, keys) => Object.fromEntries(keys.filter(k => obj && Object.hasOwn(obj, k)).map(k => [k, obj[k]]));
const ENTRY_KEYS = ['id', 'dive_date', 'entry_time', 'duration_s', 'max_depth_m', 'buddies', 'gas', 'water_temp_c',
    'vis_shallow_m', 'vis_deep_m', 'details', 'share_location', 'description'];
const SITE_KEYS = ['id', 'name', 'country', 'water', 'altitude_m', 'lat', 'lon'];
const MEDIA_KEYS = ['id', 'kind', 'path', 'url', 'width', 'height', 'taken_at', 'lat', 'lon', 'caption', 'created_at'];

/**
 * Split the `get_shared_dive` payload into what the read-only views take. Keeps only known
 * fields (whatever the server sends, notes never reach the views).
 * @param {Object|null} [area] - the `get_shared_dive_area` payload (0009), when the backend has it
 * @returns {{entry: Object, site: Object|null, area: Object|null, media: Object[], author: Object, recording: Object|null, record: Object|null}|null}
 */
export function sharedDiveParts(payload, area = null) {
    if (!payload || typeof payload !== 'object' || !payload.entry || typeof payload.entry !== 'object') return null;
    const entry = { ...pick(payload.entry, ENTRY_KEYS), notes: null, log_number: null, visibility: 'link' };
    if (!Array.isArray(entry.buddies)) entry.buddies = [];
    if (!entry.details || typeof entry.details !== 'object') entry.details = {};
    const site = payload.site && typeof payload.site === 'object' ? pick(payload.site, SITE_KEYS) : null;
    if (site) {
        site.lat ??= null;
        site.lon ??= null;
    }
    const media = Array.isArray(payload.media) ? payload.media.filter(m => m && typeof m === 'object').map(m => pick(m, MEDIA_KEYS)) : [];
    const a = payload.author ?? {};
    const author = { display_name: a.display_name ?? null, avatar_preset: a.avatar_preset ?? null, avatar_path: a.avatar_path ?? null };
    const r = payload.recording && typeof payload.recording === 'object' && payload.recording.id ? payload.recording : null;
    const recording = r ? {
        id: r.id, deviceSerial: null, diveNumber: r.dive_number ?? null, startLocal: r.start_local ?? null,
        fileSha256: null, parserVersion: r.parser_version ?? null, summary: r.summary ?? {},
    } : null;
    const record = r && r.record && typeof r.record === 'object' ? r.record : null;
    entry.site_id = site?.id ?? null;
    entry.recording_id = recording?.id ?? null;
    return { entry, site, area: siteArea(site, area), media, author, recording, record };
}

const validLatLon = (lat, lon) => Number.isFinite(lat) && Number.isFinite(lon) && Math.abs(lat) <= 90 && Math.abs(lon) <= 180;

/**
 * Where the share page's map points: the site's exact position when the dive shares it, else the approximate
 * area from `get_shared_dive_area` (rounded by the server), else null (no map).
 * @param {Object|null} site - with `lat`/`lon` only when the dive has share_location
 * @param {Object|null} area - `{lat, lon, exact}`
 * @returns {{lat: number, lon: number, exact: boolean}|null}
 */
export function siteArea(site, area) {
    if (site && site.lat !== null && site.lon !== null && validLatLon(Number(site.lat), Number(site.lon))) {
        return { lat: Number(site.lat), lon: Number(site.lon), exact: true };
    }
    if (!area || typeof area !== 'object' || area.lat === null || area.lon === null) return null;
    const lat = Number(area.lat);
    const lon = Number(area.lon);
    if (!validLatLon(lat, lon)) return null;
    // Never more precise than the server's rounding unless the server says the position is exact.
    return area.exact === true ? { lat, lon, exact: true } : { lat: Math.round(lat * 100) / 100, lon: Math.round(lon * 100) / 100, exact: false };
}
