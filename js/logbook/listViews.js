/**
 * Pure helpers of the logbook's List and Table views: month grouping, sorting, labels, sparkline path.
 * No DOM, no network.
 */

import { gasName } from '../import/recordedDive.js';
import { localeTag } from '../format.js';

const DATE = /^(\d{4})-(\d{2})-\d{2}$/;
const has = v => v !== null && v !== undefined && v !== '' && Number.isFinite(Number(v));

/**
 * Entries grouped by calendar month, newest month first and newest dive first inside it.
 * Entries without a valid date go into a last group with key '' and label ''.
 * @param {Object[]} entries
 * @param {string} locale - BCP 47 tag
 * @returns {{key: string, label: string, entries: Object[]}[]}
 */
export function groupByMonth(entries, locale) {
    const fmt = new Intl.DateTimeFormat(locale, { month: 'long', year: 'numeric', timeZone: 'UTC' });
    const sorted = [...(entries ?? [])].sort((a, b) =>
        String(b.dive_date ?? '').localeCompare(String(a.dive_date ?? ''))
        || String(b.entry_time ?? '').localeCompare(String(a.entry_time ?? ''))
        || (b.log_number ?? 0) - (a.log_number ?? 0));
    const groups = new Map();
    for (const e of sorted) {
        const m = DATE.exec(String(e.dive_date ?? ''));
        const key = m ? `${m[1]}-${m[2]}` : '';
        if (!groups.has(key)) {
            let label = '';
            if (m) {
                label = fmt.format(new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, 1)));
                label = label.charAt(0).toLocaleUpperCase(locale) + label.slice(1);
            }
            groups.set(key, { key, label, entries: [] });
        }
        groups.get(key).entries.push(e);
    }
    const out = [...groups.values()];
    const unknown = out.findIndex(g => g.key === '');
    if (unknown >= 0) out.push(out.splice(unknown, 1)[0]);
    return out;
}

/** Table sort keys; each yields a number, a string, or null when the value is missing. */
const SORT_VALUE = {
    number: e => (has(e.log_number) ? Number(e.log_number) : null),
    date: e => (e.dive_date ? `${e.dive_date}T${e.entry_time ?? ''}` : null),
    site: (e, sites) => {
        const name = e.site_id ? sites?.get(e.site_id)?.name : null;
        return name ? String(name).toLocaleLowerCase() : null;
    },
    maxDepth: e => (has(e.max_depth_m) ? Number(e.max_depth_m) : null),
    duration: e => (has(e.duration_s) ? Number(e.duration_s) : null),
    avgDepth: e => (has(e.details?.avgDepthM) ? Number(e.details.avgDepthM) : null),
    temp: e => (has(e.water_temp_c) ? Number(e.water_temp_c) : null),
    buddies: e => (e.buddies?.length ? e.buddies.join(', ').toLocaleLowerCase() : null),
};

/** The sort keys of the table. */
export const SORT_KEYS = Object.freeze(Object.keys(SORT_VALUE));

/**
 * A sorted copy. Missing values go last in both directions; ties fall back to the log number, newest first.
 * @param {Object[]} entries
 * @param {string} key - one of SORT_KEYS
 * @param {'asc'|'desc'} dir
 * @param {Map<string, {name: string}>} [sitesById]
 */
export function sortEntries(entries, key, dir, sitesById) {
    const value = SORT_VALUE[key] ?? SORT_VALUE.number;
    const sign = dir === 'asc' ? 1 : -1;
    return [...entries].sort((a, b) => {
        const va = value(a, sitesById);
        const vb = value(b, sitesById);
        if (va === null && vb !== null) return 1;
        if (vb === null && va !== null) return -1;
        if (va !== null) {
            const c = typeof va === 'number' ? va - vb : va.localeCompare(vb);
            if (c !== 0) return c * sign;
        }
        return (b.log_number ?? 0) - (a.log_number ?? 0);
    });
}

/** "Air", "EAN32", "Tx 18/45"; '' when the gas is unknown. */
export function gasLabel(gas) {
    if (!gas || !Number.isFinite(gas.o2)) return '';
    return gasName({ o2: gas.o2, he: Number.isFinite(gas.he) ? gas.he : 0 });
}

/**
 * SVG path of a depth profile for a sparkline: time left to right, surface at the top, depth downwards.
 * At most ~120 points. '' when there is nothing to draw (fewer than two samples or no elapsed time).
 * @param {Array<{t: number, depth: number}>} samples
 */
export function sparklinePath(samples, width, height, pad = 2) {
    const s = (samples ?? []).filter(p => Number.isFinite(p?.t) && Number.isFinite(p?.depth));
    if (s.length < 2) return '';
    const t0 = s[0].t;
    const span = s[s.length - 1].t - t0;
    if (!(span > 0)) return '';
    const maxDepth = Math.max(...s.map(p => p.depth), 0);
    const step = Math.max(1, Math.ceil(s.length / 120));
    const picked = s.filter((_, i) => i % step === 0);
    if (picked[picked.length - 1] !== s[s.length - 1]) picked.push(s[s.length - 1]);
    const r = n => Math.round(n * 10) / 10;
    return picked.map((p, i) => {
        const x = pad + ((p.t - t0) / span) * (width - 2 * pad);
        const y = pad + (maxDepth > 0 ? (Math.max(p.depth, 0) / maxDepth) * (height - 2 * pad) : 0);
        return `${i ? 'L' : 'M'}${r(x)},${r(y)}`;
    }).join(' ');
}

/** A `YYYY-MM-DD` dive date with its weekday for the language (en "Wed, 2 Sept 2026"); anything else is returned as given. */
export function formatWeekdayDate(date, lang) {
    if (!date) return '';
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(date));
    if (!m) return String(date);
    const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
    return new Intl.DateTimeFormat(localeTag(lang), { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }).format(d);
}

/** The sparkline path closed along the surface, for a filled "water column". '' when there is nothing to draw. */
export function profileAreaPath(samples, width, height, pad = 2) {
    const line = sparklinePath(samples, width, height, pad);
    if (!line) return '';
    const r = n => Math.round(n * 10) / 10;
    return `${line} L${r(width - pad)},${r(pad)} L${r(pad)},${r(pad)} Z`;
}
