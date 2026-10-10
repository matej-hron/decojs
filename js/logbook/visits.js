/**
 * Visits of a dive site: which dives the user may see happened at a site, and their summary
 * (visibility, water temperature by month). Reads only through the members' read function
 * (`community_entries`: own dives plus other members' visible ones, never notes, coordinates only
 * when shared) or, without the community backend, the user's own entries. No DOM.
 */

import { distanceMeters } from './geo.js';

/** Rows per `community_entries` call (the function's maximum) and the most pages one site page reads. */
export const VISITS_PAGE = 100;
export const VISITS_MAX_PAGES = 20;
/** A member's dive whose shared position is this close to the site counts as a visit, whatever its name. */
export const VISIT_RADIUS_M = 200;

const num = v => (v === null || v === undefined || v === '' || !Number.isFinite(Number(v)) ? null : Number(v));

/** Key for comparing site names across members: trimmed, case and diacritics folded, single spaces. */
export function visitNameKey(name) {
    return String(name ?? '').normalize('NFD').replace(/\p{M}/gu, '').trim().replace(/\s+/g, ' ').toLocaleLowerCase();
}

/**
 * Whether a dive row (`community_entries` shape: site_id, site_name, site_lat, site_lon) happened at `site`:
 * the same site, a site of the same name, or a shared position within VISIT_RADIUS_M.
 */
export function visitMatches(row, site, radiusM = VISIT_RADIUS_M) {
    if (!row || !site) return false;
    if (row.site_id && row.site_id === site.id) return true;
    const key = visitNameKey(site.name);
    if (key && visitNameKey(row.site_name) === key) return true;
    const a = { lat: num(row.site_lat), lon: num(row.site_lon) };
    const b = { lat: num(site.lat), lon: num(site.lon) };
    if (a.lat === null || a.lon === null || b.lat === null || b.lon === null) return false;
    return distanceMeters(a, b) <= radiusM;
}

function spread(values) {
    if (!values.length) return null;
    const sum = values.reduce((s, v) => s + v, 0);
    return { avg: sum / values.length, best: Math.max(...values), n: values.length };
}

/**
 * Summary of the visits: count, visibility near the surface and at depth (average, best), water temperature
 * range overall and per calendar month (only months with data, January first). Missing values are skipped.
 * @returns {{count: number, visShallow: ?{avg, best, n}, visDeep: ?{avg, best, n}, temp: ?{min, max, n}, months: {month, min, max, n}[]}}
 */
export function siteVisitStats(rows) {
    const shallow = [];
    const deep = [];
    const temps = [];
    const byMonth = new Map();
    for (const r of rows ?? []) {
        const s = num(r.vis_shallow_m);
        const d = num(r.vis_deep_m);
        const t = num(r.water_temp_c);
        if (s !== null) shallow.push(s);
        if (d !== null) deep.push(d);
        if (t === null) continue;
        temps.push(t);
        const m = /^\d{4}-(\d{2})-\d{2}/.exec(String(r.dive_date ?? ''));
        const month = m ? Number(m[1]) : 0;
        if (month < 1 || month > 12) continue;
        const cur = byMonth.get(month);
        byMonth.set(month, cur
            ? { month, min: Math.min(cur.min, t), max: Math.max(cur.max, t), n: cur.n + 1 }
            : { month, min: t, max: t, n: 1 });
    }
    return {
        count: (rows ?? []).length,
        visShallow: spread(shallow),
        visDeep: spread(deep),
        temp: temps.length ? { min: Math.min(...temps), max: Math.max(...temps), n: temps.length } : null,
        months: [...byMonth.values()].sort((a, b) => a.month - b.month),
    };
}

const KEEP = ['id', 'owner', 'dive_date', 'entry_time', 'duration_s', 'max_depth_m', 'water_temp_c', 'vis_shallow_m', 'vis_deep_m',
    'visibility', 'site_id', 'site_name', 'site_lat', 'site_lon', 'recording_id'];
const visitRow = r => Object.fromEntries(KEEP.filter(k => Object.hasOwn(r, k)).map(k => [k, r[k]]));
const newestFirst = (a, b) => String(b.dive_date ?? '').localeCompare(String(a.dive_date ?? ''))
    || String(b.entry_time ?? '').localeCompare(String(a.entry_time ?? ''));

/**
 * The dives at `site` the user may see, newest first, reduced to the columns the visits view needs
 * (no notes, no description).
 * @param {Object} store - DiveStore (community API optional)
 * @param {Object} site - the user's own site row
 * @param {{userId?: string}} [options]
 * @returns {Promise<{rows: Object[], capped: boolean, community: boolean}>}
 */
export async function loadSiteVisits(store, site, { userId = null } = {}) {
    const community = typeof store.communityStatus === 'function' && typeof store.listCommunityEntries === 'function'
        && await store.communityStatus();
    if (!community) {
        const [entries, sites] = await Promise.all([store.listEntries(), store.listSites()]);
        const byId = new Map((sites ?? []).map(s => [s.id, s]));
        const rows = (entries ?? []).filter(e => e.site_id).map(e => {
            const s = byId.get(e.site_id);
            return visitRow({ ...e, owner: e.owner ?? userId, site_name: s?.name ?? null, site_lat: s?.lat ?? null, site_lon: s?.lon ?? null });
        }).filter(r => visitMatches(r, site));
        return { rows: rows.sort(newestFirst), capped: false, community: false };
    }
    const seen = new Set();
    const rows = [];
    let capped = false;
    for (let page = 0; ; page++) {
        if (page >= VISITS_MAX_PAGES) { capped = true; break; }
        const batch = (await store.listCommunityEntries({ owner: null, limit: VISITS_PAGE, offset: page * VISITS_PAGE })) ?? [];
        for (const r of batch) {
            if (seen.has(r.id)) continue; // a dive added meanwhile shifts the pages
            seen.add(r.id);
            if (visitMatches(r, site)) rows.push(visitRow(r));
        }
        if (batch.length < VISITS_PAGE) break;
    }
    return { rows: rows.sort(newestFirst), capped, community: true };
}
