/**
 * Personal gas consumption (SAC, l/min at the surface) from the logbook: one value per dive from its cylinder
 * pressures (gasModel.gasUsage), then a duration-weighted average that leaves out implausible and outlying dives.
 *
 * Pure: no DOM, no network.
 */

import { gasesFromEntry, gasUsage } from './gasModel.js';

/** A dive's SAC is believable between these values (l/min); outside it a pressure or volume was mistyped. */
export const SAC_MIN_LPM = 3;
export const SAC_MAX_LPM = 60;
/** Dives shorter than this are too noisy: a few bar of gauge error is a large share of the gas used. */
export const MIN_DURATION_S = 10 * 60;
/** Outlier fence: this many robust standard deviations (1,4826 × MAD) from the median. */
const OUTLIER_SIGMAS = 3;
/** The fence never gets tighter than this share of the median (a very steady diver would reject normal variation). */
const MIN_SPREAD_SHARE = 0.15;
/** Fewer dives than this and the median is not trusted to reject anyone. */
const MIN_FOR_OUTLIERS = 5;
export const RECENT_COUNT = 5;

/** SAC of one entry in l/min (any positive finite value); null when pressures, volume, depth or time are missing. */
export function diveSac(entry) {
    const u = gasUsage(gasesFromEntry(entry), { durationS: entry?.duration_s, avgDepthM: entry?.details?.avgDepthM });
    return u.sacLpm !== null && Number.isFinite(u.sacLpm) && u.sacLpm > 0 ? u.sacLpm : null;
}

const median = sorted => {
    const n = sorted.length;
    return n % 2 ? sorted[(n - 1) / 2] : (sorted[n / 2 - 1] + sorted[n / 2]) / 2;
};

const weighted = points => {
    const total = points.reduce((s, p) => s + p.durationS, 0);
    return total > 0 ? points.reduce((s, p) => s + p.sacLpm * p.durationS, 0) / total : null;
};

const when = e => `${e.dive_date ?? ''} ${e.entry_time ?? ''}`;

/**
 * @param {Object[]} entries - logbook entries
 * @returns {{points: {id: string, date: string, sacLpm: number, durationS: number, used: boolean, reason: string}[],
 *   count: number, overallLpm: number|null, recentLpm: number|null, recentCount: number}}
 *   `points` are the dives that have a SAC, oldest first; `used` says whether it counts towards the averages
 *   (`reason` is '' when used, else 'implausible', 'short' or 'outlier'). `recentLpm` is the same weighted
 *   average over the last RECENT_COUNT used dives; null until there are at least two of them.
 */
export function sacSummary(entries) {
    const points = [];
    for (const e of entries ?? []) {
        const sacLpm = diveSac(e);
        if (sacLpm === null) continue;
        const durationS = Number(e.duration_s);
        let reason = '';
        if (sacLpm < SAC_MIN_LPM || sacLpm > SAC_MAX_LPM) reason = 'implausible';
        else if (durationS < MIN_DURATION_S) reason = 'short';
        points.push({ id: e.id, date: e.dive_date ?? '', time: e.entry_time ?? '', sacLpm, durationS, used: !reason, reason, _k: when(e) });
    }
    points.sort((a, b) => (a._k < b._k ? -1 : a._k > b._k ? 1 : 0));

    const ok = points.filter(p => p.used);
    if (ok.length >= MIN_FOR_OUTLIERS) {
        const values = ok.map(p => p.sacLpm).sort((a, b) => a - b);
        const med = median(values);
        const mad = median(values.map(v => Math.abs(v - med)).sort((a, b) => a - b));
        const spread = Math.max(1.4826 * mad, MIN_SPREAD_SHARE * med);
        for (const p of ok) {
            if (Math.abs(p.sacLpm - med) > OUTLIER_SIGMAS * spread) { p.used = false; p.reason = 'outlier'; }
        }
    }
    const used = points.filter(p => p.used);
    const recent = used.slice(-RECENT_COUNT);
    for (const p of points) delete p._k;
    return {
        points,
        count: used.length,
        overallLpm: weighted(used),
        recentLpm: recent.length >= 2 ? weighted(recent) : null,
        recentCount: recent.length,
    };
}

/** Round the axis outwards to whole l/min with a step of 1, 2, 5 or 10 that gives about three intervals. */
function niceRange(min, max) {
    const span = Math.max(max - min, 2);
    const raw = span / 3;
    const step = [1, 2, 5, 10].find(s => s >= raw) ?? 10;
    const lo = Math.max(0, Math.floor((min - span * 0.1) / step) * step);
    const hi = Math.max(lo + step * 2, Math.ceil((max + span * 0.1) / step) * step);
    const ticks = [];
    for (let v = lo; v <= hi + 1e-9; v += step) ticks.push(v);
    return { lo, hi, ticks };
}

/**
 * Geometry of the trend chart (one value axis, oldest dive on the left, equal spacing: dives, not calendar time).
 * @param {{id: string, sacLpm: number, used: boolean}[]} points - from sacSummary, oldest first
 * @param {{width?: number, height?: number, left?: number, right?: number, top?: number, bottom?: number}} [box]
 * @returns {{width: number, height: number, ticks: {value: number, y: number}[], dots: {id: string, x: number, y: number, used: boolean, sacLpm: number}[], line: string, plotLeft: number, plotRight: number, plotBottom: number}}
 */
export function sacChartModel(points, { width = 320, height = 150, left = 34, right = 12, top = 24, bottom = 12 } = {}) {
    // The axis follows the counted dives: a mistyped 140 l/min must not flatten the real trend (it is pinned to the edge).
    const scaled = points.some(p => p.used) ? points.filter(p => p.used) : points;
    const { lo, hi, ticks } = niceRange(Math.min(...scaled.map(p => p.sacLpm)), Math.max(...scaled.map(p => p.sacLpm)));
    const plotW = width - left - right;
    const plotH = height - top - bottom;
    const y = v => top + plotH - (Math.min(hi, Math.max(lo, v)) - lo) / (hi - lo) * plotH;
    const n = points.length;
    const dots = points.map((p, i) => ({
        id: p.id, used: p.used, sacLpm: p.sacLpm,
        x: n === 1 ? left + plotW / 2 : left + (i / (n - 1)) * plotW,
        y: y(p.sacLpm),
    }));
    const round = v => Math.round(v * 10) / 10;
    const line = dots.filter(d => d.used).map((d, i) => `${i ? 'L' : 'M'}${round(d.x)} ${round(d.y)}`).join('');
    return {
        width, height, line, dots,
        ticks: ticks.map(value => ({ value, y: round(y(value)) })),
        plotLeft: left, plotRight: width - right, plotBottom: height - bottom,
    };
}
