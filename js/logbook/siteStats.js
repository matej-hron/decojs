/**
 * Conditions at a dive site: visibility (shallow / deep) and water temperature (bottom / surface), overall and by
 * month. `siteStatsFromRows` returns the same shape as the `site_stats` database function (migration 0011), so the
 * page renders one shape whether the server or the client (without 0011) computed it. Pure, no DOM.
 */

import { fmtNum, localeTag, currentLang } from '../format.js';
import { translate } from '../i18n.js';

const NB = ' ';

const num = v => (v === null || v === undefined || v === '' || typeof v === 'boolean' || !Number.isFinite(Number(v)) ? null : Number(v));
const round1 = v => Math.round(v * 10) / 10;

/** Surface temperature of a visit row: `surface_temp_c` (site_visits) or `details.surfaceTempC` (an entry). */
export function surfaceTemp(row) {
    if (row && Object.hasOwn(row, 'surface_temp_c')) return num(row.surface_temp_c);
    const v = row?.details?.surfaceTempC;
    return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

const newestFirst = (a, b) => String(b.dive_date ?? '').localeCompare(String(a.dive_date ?? ''))
    || String(b.entry_time ?? '').localeCompare(String(a.entry_time ?? ''));

/** {n, avg, min, max, best_date, latest, latest_date} of one value over rows sorted newest first, or null. */
function summary(sorted, pick) {
    let n = 0; let sum = 0; let min = Infinity; let max = -Infinity; let bestDate = null; let latest = null; let latestDate = null;
    for (const r of sorted) {
        const v = pick(r);
        if (v === null) continue;
        if (n === 0) { latest = v; latestDate = r.dive_date ?? null; }
        n++; sum += v;
        if (v < min) min = v;
        if (v > max) { max = v; bestDate = r.dive_date ?? null; } // newest first: the latest date of the maximum
    }
    return n ? { n, avg: round1(sum / n), min, max, best_date: bestDate, latest, latest_date: latestDate } : null;
}

function monthStats(sorted) {
    const byMonth = new Map();
    for (const r of sorted) {
        const m = /^\d{4}-(\d{2})-\d{2}/.exec(String(r.dive_date ?? ''));
        const month = m ? Number(m[1]) : 0;
        if (month < 1 || month > 12) continue;
        if (!byMonth.has(month)) byMonth.set(month, []);
        byMonth.get(month).push(r);
    }
    const agg = values => (values.length
        ? { avg: round1(values.reduce((s, v) => s + v, 0) / values.length), min: Math.min(...values), max: Math.max(...values), n: values.length } : null);
    return [...byMonth.entries()].sort((a, b) => a[0] - b[0]).map(([month, rows]) => {
        const vis = rows.flatMap(r => [num(r.vis_shallow_m), num(r.vis_deep_m)]).filter(v => v !== null);
        const v = agg(vis);
        return {
            month, n: rows.length,
            bottom: agg(rows.map(r => num(r.water_temp_c)).filter(x => x !== null)),
            surface: agg(rows.map(surfaceTemp).filter(x => x !== null)),
            vis: v ? { avg: v.avg, n: v.n } : null,
        };
    });
}

/**
 * Conditions from visit rows (the `site_visits` shape or entries with `details`).
 * @returns {{visits: number, divers: number, first_visit: ?string, last_visit: ?string,
 *   vis: {shallow: ?Object, deep: ?Object}, temp: {bottom: ?Object, surface: ?Object}, months: Object[]}}
 */
export function siteStatsFromRows(rows) {
    const sorted = [...(rows ?? [])].sort(newestFirst);
    const dates = sorted.map(r => r.dive_date).filter(Boolean);
    return {
        visits: sorted.length,
        divers: new Set(sorted.map(r => r.owner ?? null)).size,
        first_visit: dates.length ? dates[dates.length - 1] : null,
        last_visit: dates.length ? dates[0] : null,
        vis: { shallow: summary(sorted, r => num(r.vis_shallow_m)), deep: summary(sorted, r => num(r.vis_deep_m)) },
        temp: { bottom: summary(sorted, r => num(r.water_temp_c)), surface: summary(sorted, surfaceTemp) },
        months: monthStats(sorted),
    };
}

/**
 * The directory aggregates (`community_sites` columns) from visit rows: visits, last_visit, vis_min/max over
 * shallow and deep, temp_min/max over bottom and surface.
 */
export function siteAggregatesFromRows(rows) {
    const s = siteStatsFromRows(rows);
    const span = (...parts) => {
        const xs = parts.filter(Boolean);
        return xs.length ? { min: Math.min(...xs.map(x => x.min)), max: Math.max(...xs.map(x => x.max)) } : null;
    };
    const vis = span(s.vis.shallow, s.vis.deep);
    const temp = span(s.temp.bottom, s.temp.surface);
    return {
        visits: s.visits, last_visit: s.last_visit,
        vis_min: vis?.min ?? null, vis_max: vis?.max ?? null, temp_min: temp?.min ?? null, temp_max: temp?.max ?? null,
    };
}

/** A number with at most one decimal, in the UI language ("4", "4,5"). */
export function fmtShort(value, lang = currentLang()) {
    return fmtNum(round1(Number(value)), undefined, lang);
}

/** "4–8" (or "4" when both ends round the same); `whole` rounds to integers. */
export function fmtRange(min, max, lang = currentLang(), { whole = false } = {}) {
    const f = v => (whole ? fmtNum(Math.round(Number(v)), undefined, lang) : fmtShort(v, lang));
    const a = f(min);
    const b = f(max);
    return a === b ? a : `${a}–${b}`;
}

/** "27 Sep" (this year) or "27 Sep 2025"; '' for a missing or malformed date. */
export function fmtShortDate(date, lang = currentLang(), now = new Date()) {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(date ?? ''));
    if (!m) return '';
    const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
    const opts = { day: 'numeric', month: 'short', timeZone: 'UTC' };
    if (Number(m[1]) !== now.getFullYear()) opts.year = 'numeric';
    try { return new Intl.DateTimeFormat(localeTag(lang), opts).format(d); } catch { return String(date); }
}

const fill = (text, ...values) => String(text).replace(/\{(\d+)\}/g, (_, i) => values[Number(i)] ?? '');

/**
 * One line for a site card or map popup: "vis 4–8 m · 6–21 °C (last: 27 Sep)". Parts without data are left out;
 * '' when there is nothing at all.
 * @param {{vis_min?, vis_max?, temp_min?, temp_max?, last_visit?}} site
 */
export function siteSummaryLine(site, { lang = currentLang(), now = new Date(), t = translate } = {}) {
    const tr = (key, fallback) => t(`diveLog.logbook.sites.summary.${key}`, fallback);
    const parts = [];
    if (num(site?.vis_min) !== null && num(site?.vis_max) !== null) {
        parts.push(fill(tr('vis', 'vis {0}'), `${fmtRange(site.vis_min, site.vis_max, lang)}${NB}m`));
    }
    if (num(site?.temp_min) !== null && num(site?.temp_max) !== null) {
        parts.push(`${fmtRange(site.temp_min, site.temp_max, lang, { whole: true })}${NB}°C`);
    }
    const last = fmtShortDate(site?.last_visit, lang, now);
    const line = parts.join(' · ');
    if (!last) return line;
    const lastText = fill(tr('last', 'last: {0}'), last);
    return line ? `${line} (${lastText})` : lastText;
}
