/**
 * Pure helpers of the logbook feed: card titles and stats, the visual of a dive, totals, view names.
 * No DOM, no network.
 */

import { formatDuration } from './entryModel.js';
import { gasLabel } from './listViews.js';

const NB = '\u00a0';
const has = v => v !== null && v !== undefined && v !== '' && Number.isFinite(Number(v));
const fill = (text, ...values) => String(text).replace(/\{(\d+)\}/g, (_, i) => values[Number(i)] ?? '');

/** Views of the dive list; the first is the default. */
export const FEED_VIEWS = Object.freeze(['feed', 'tiles', 'table']);

/** A stored view name of this or an older version ('list' became 'feed'). */
export function migrateView(stored) {
    if (stored === 'list') return 'feed';
    return FEED_VIEWS.includes(stored) ? stored : FEED_VIEWS[0];
}

/** Card title: the site name, else "Dive #n", else "Dive". `t(key)` looks up below `diveLog.logbook.`. */
export function diveTitle(entry, siteName, t) {
    if (siteName && String(siteName).trim()) return String(siteName).trim();
    return has(entry?.log_number) ? fill(t('feed.untitled'), entry.log_number) : t('feed.untitledNoNumber');
}

/**
 * The stat row of a card: max depth, duration (m:ss), average depth, water temperature, gas. Missing values are left out.
 * @param {(value: number, decimals: number) => string} num - number formatter (decimal comma in Czech)
 * @returns {{key: string, value: string, unit: string}[]}
 */
export function feedStats(entry, num) {
    const out = [];
    if (has(entry.max_depth_m)) out.push({ key: 'depth', value: num(Number(entry.max_depth_m), 1), unit: 'm' });
    if (has(entry.duration_s)) out.push({ key: 'duration', value: formatDuration(entry.duration_s), unit: 'min' });
    const avg = entry.details?.avgDepthM;
    if (has(avg)) out.push({ key: 'avgDepth', value: num(Number(avg), 1), unit: 'm' });
    if (has(entry.water_temp_c)) out.push({ key: 'temp', value: num(Number(entry.water_temp_c), 1), unit: '°C' });
    const gas = gasLabel(entry.gas);
    if (gas) out.push({ key: 'gas', value: gas, unit: '' });
    return out;
}

const positioned = site => site && site.lat !== null && site.lon !== null && Number.isFinite(site.lat) && Number.isFinite(site.lon);

/** Which visual a dive gets: its first photo, else a map of its site, else its depth profile, else none. */
export function chooseVisual({ photoUrl = null, site = null, apiKey = '', recordingId = null } = {}) {
    if (photoUrl) return { kind: 'photo' };
    if (apiKey && positioned(site)) return { kind: 'map' };
    if (recordingId) return { kind: 'profile' };
    return { kind: 'none' };
}

/** Dive count, total time in seconds and deepest depth of the logbook. */
export function logbookTotals(entries) {
    let seconds = 0;
    let maxDepth = null;
    for (const e of entries ?? []) {
        if (has(e.duration_s)) seconds += Number(e.duration_s);
        if (has(e.max_depth_m)) maxDepth = maxDepth === null ? Number(e.max_depth_m) : Math.max(maxDepth, Number(e.max_depth_m));
    }
    return { count: entries?.length ?? 0, seconds, maxDepth };
}

/** Total time in hours: one decimal below 10 h, whole hours above ("4,5 h", "41 h"). */
export function formatTotalTime(seconds, num) {
    const h = (Number(seconds) || 0) / 3600;
    if (h === 0) return `0${NB}h`;
    return `${h < 10 ? num(h, 1) : num(Math.round(h), 0)}${NB}h`;
}

/** Map(entryId -> {path, count}) from photo media rows (oldest first): the first photo with a path and how many there are. */
export function photoIndex(media) {
    const out = new Map();
    for (const m of media ?? []) {
        if (!m?.path) continue;
        const cur = out.get(m.entry_id);
        if (cur) cur.count++;
        else out.set(m.entry_id, { path: m.path, count: 1 });
    }
    return out;
}
