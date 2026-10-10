/**
 * Pure helpers of the logbook feed: card titles and stats, the visual of a dive, totals, view names.
 * No DOM, no network.
 */

import { formatDuration } from './entryModel.js';
import { gasLabel } from './listViews.js';
import { isHttpsUrl } from './geo.js';
import { escHtml } from '../utils/escHtml.js';

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

/**
 * CSS aspect-ratio for a feed hero frame that follows the photo: landscape up to 16:9, square 1:1,
 * portrait down to 4:5 (so a tall photo never makes a huge card). Unknown size keeps the 16:10 default.
 * @returns {string} e.g. '4 / 5'
 */
export function photoFrame(width, height) {
    const w = Number(width), h = Number(height);
    if (!(w > 0) || !(h > 0)) return '16 / 10';
    const r = w / h;
    if (r > 0.95 && r < 1.05) return '1 / 1';
    const c = Math.min(16 / 9, Math.max(4 / 5, r));
    return `${Math.round(c * 1000)} / 1000`;
}

/** Map(entryId -> {path, count, width, height}) from photo media rows (oldest first): the first photo with a path, its size, and how many there are. */
export function photoIndex(media) {
    const out = new Map();
    for (const m of media ?? []) {
        if (!m?.path) continue;
        const cur = out.get(m.entry_id);
        if (cur) cur.count++;
        else out.set(m.entry_id, { path: m.path, count: 1, width: m.width ?? null, height: m.height ?? null });
    }
    return out;
}

/** Length of the dive story excerpt on a feed card (the card also clamps it to three lines). */
export const EXCERPT_CHARS = 220;

/** Longest dive story (log_entries.description; the 0006 check constraint says the same). */
export const STORY_MAX = 5000;

const URL_IN_TEXT = /https:\/\/[^\s<>"'`]+/g;

/** One line of a story: escaped text with its https:// addresses as links that open in a new tab. */
function linkedLine(line) {
    let out = '';
    let at = 0;
    for (const m of line.matchAll(URL_IN_TEXT)) {
        let url = m[0];
        // Punctuation that ends the sentence is not part of the address; a ")" only when it closes nothing in it.
        for (;;) {
            const last = url.at(-1);
            if ('.,;:!?'.includes(last) || (last === ')' && !url.includes('('))) url = url.slice(0, -1);
            else break;
        }
        out += escHtml(line.slice(at, m.index));
        out += isHttpsUrl(url)
            ? `<a href="${escHtml(url)}" target="_blank" rel="noopener noreferrer nofollow ugc">${escHtml(url)}</a>`
            : escHtml(url);
        at = m.index + url.length;
    }
    return out + escHtml(line.slice(at));
}

/**
 * The dive story as HTML: escaped, blank lines start a paragraph, single line breaks stay, and https://
 * addresses become links. '' for no text.
 */
export function storyHtml(text) {
    if (typeof text !== 'string' || !text.trim()) return '';
    return text.replace(/\r\n?/g, '\n').trim().split(/\n[ \t]*\n\s*/)
        .map(par => `<p>${par.split('\n').map(linkedLine).join('<br>')}</p>`).join('');
}

/**
 * A dive description shortened for a card: whitespace runs become one space, and a longer text is cut
 * at the last word boundary before `max` characters, with "…". '' for no text.
 */
export function descriptionExcerpt(text, max = EXCERPT_CHARS) {
    if (typeof text !== 'string') return '';
    const flat = text.replace(/\s+/g, ' ').trim();
    const chars = Array.from(flat); // code points: never split an emoji
    if (chars.length <= max) return flat;
    const head = chars.slice(0, max).join('');
    const cut = head.lastIndexOf(' ');
    return `${(cut > max / 2 ? head.slice(0, cut) : head).replace(/[\s.,;:!?–-]+$/u, '')}…`;
}
