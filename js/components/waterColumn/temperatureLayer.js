/**
 * Water column layer "teplota" (temperature) — first layer of the shared
 * water column (js/components/WaterColumn.js, contract in
 * docs/course/water-column.md).
 *
 * - colours the column by temperature (vertical gradient sampled from `profile`),
 * - draws the temperature profile in its aside panel (axis "teplota / °C",
 *   point at the current depth),
 * - optional labelled bands (warm layer, thermocline, cold water at the bottom),
 * - readout "teplota 8&nbsp;°C".
 *
 * The layer knows nothing about lakes. The page supplies `profile(depth, state)`,
 * typically closing over a scenario key such as `state.month`:
 *
 *   createTemperatureLayer({
 *       profile: (depth, s) => lakeTemperature(s.month, depth, s.maxDepth),
 *   });
 *
 * Notation: temperature is written as a word with °C (docs/notation/style-guide.md
 * §3.3) — the symbol t is reserved for time in DecoJS.
 */

import {
    svgEl, fmtCs, niceTicks, haloAttrs, splitLabel, estimateTextWidth, clamp,
} from '../WaterColumn.js';

const NBSP = ' ';

/**
 * Default colour stops of the temperature scale, cold → warm:
 * deep blue → light cool grey → red-orange. Interpolated in OKLab so equal
 * temperature steps look like equal colour steps. The light middle keeps both
 * ends readable on the light (projector) and the dark theme.
 * Override per page with the CSS custom properties
 * `--wc-temp-cold`, `--wc-temp-mid`, `--wc-temp-warm` (hex colours).
 */
export const DEFAULT_TEMPERATURE_STOPS = Object.freeze(['#215d9c', '#cfd8de', '#e0592a']);

// ---------------------------------------------------------------------------
// Colour (pure)
// ---------------------------------------------------------------------------

/**
 * @param {string} hex - "#rrggbb" or "#rgb"
 * @returns {[number, number, number]} sRGB 0–1
 */
export function hexToRgb(hex) {
    let h = String(hex).trim().replace(/^#/, '');
    if (h.length === 3) h = h.split('').map((c) => c + c).join('');
    if (!/^[0-9a-f]{6}$/i.test(h)) throw new TypeError(`Not a hex colour: ${hex}`);
    return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16) / 255);
}

/**
 * @param {[number, number, number]} rgb - sRGB 0–1
 * @returns {string} "#rrggbb"
 */
export function rgbToHex(rgb) {
    return `#${rgb.map((c) => Math.round(clamp(c, 0, 1) * 255).toString(16).padStart(2, '0')).join('')}`;
}

const toLinear = (c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const toGamma = (c) => (c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055);

/**
 * sRGB → OKLab (Björn Ottosson, 2020).
 * @param {[number, number, number]} rgb - sRGB 0–1
 * @returns {[number, number, number]} [L, a, b]
 */
export function rgbToOklab(rgb) {
    const [r, g, b] = rgb.map(toLinear);
    const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
    const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
    const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
    return [
        0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
        1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
        0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
    ];
}

/**
 * OKLab → sRGB (clamped to gamut).
 * @param {[number, number, number]} lab
 * @returns {[number, number, number]} sRGB 0–1
 */
export function oklabToRgb([L, a, b]) {
    const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
    const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
    const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
    return [
        4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
        -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
        -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
    ].map((c) => clamp(toGamma(c), 0, 1));
}

/**
 * Colour of a temperature on the cold → warm scale.
 * Temperatures outside `range` get the end colour.
 *
 * @param {number} t - temperature, °C
 * @param {[number, number]} [range=[0, 25]] - °C mapped onto the first / last stop
 * @param {string[]} [stops=DEFAULT_TEMPERATURE_STOPS] - ≥ 2 hex colours, evenly spaced
 * @returns {string|null} "#rrggbb", or null when t is not a finite number
 */
export function temperatureColor(t, range = [0, 25], stops = DEFAULT_TEMPERATURE_STOPS) {
    const v = Number(t);
    if (t === null || t === undefined || !Number.isFinite(v)) return null;
    const [lo, hi] = range;
    const f = hi > lo ? clamp((v - lo) / (hi - lo), 0, 1) : 0;
    const pos = f * (stops.length - 1);
    const i = Math.min(stops.length - 2, Math.floor(pos));
    const k = pos - i;
    const a = rgbToOklab(hexToRgb(stops[i]));
    const b = rgbToOklab(hexToRgb(stops[i + 1]));
    return rgbToHex(oklabToRgb(a.map((x, j) => x + (b[j] - x) * k)));
}

// ---------------------------------------------------------------------------
// Data helpers (pure)
// ---------------------------------------------------------------------------

/**
 * Temperature ticks: steps of 5 °C; doubled (10, 20 °C …) while the labels
 * would be closer than 2.2 em.
 * @param {[number, number]} range - °C
 * @param {number} panelWidth - px
 * @param {number} fontSize - px
 * @returns {number[]}
 */
export function temperatureTicks(range, panelWidth, fontSize) {
    const [lo, hi] = range;
    const span = hi - lo;
    let step = 5;
    while ((panelWidth * step) / span < 2.2 * fontSize && step < span) step *= 2;
    return niceTicks(lo, hi, Math.ceil(span / step), step);
}

/**
 * Sample the profile evenly from the surface to the bottom.
 * Non-finite temperatures are dropped.
 *
 * @param {(depth:number, state:Object) => number} profile
 * @param {Object} state - needs `maxDepth`
 * @param {number} [n=64] - number of samples (≥ 2)
 * @returns {Array<{depth:number, t:number}>}
 */
export function sampleProfile(profile, state, n = 64) {
    const count = Math.max(2, Math.floor(n));
    const out = [];
    for (let i = 0; i < count; i++) {
        const depth = (state.maxDepth * i) / (count - 1);
        const t = Number(profile(depth, state));
        if (Number.isFinite(t)) out.push({ depth, t });
    }
    return out;
}

/**
 * Resolve `bands` (array or function of state) into valid, clamped bands
 * sorted by depth. Bands with no height or no label are dropped.
 *
 * @param {Array|Function|undefined} bands
 * @param {Object} state - needs `maxDepth`
 * @returns {Array<{from:number, to:number, label:string}>}
 */
export function resolveBands(bands, state) {
    const list = typeof bands === 'function' ? bands(state) : bands;
    if (!Array.isArray(list)) return [];
    return list
        .map((b) => ({
            from: clamp(Number(Math.min(b.from, b.to)), 0, state.maxDepth),
            to: clamp(Number(Math.max(b.from, b.to)), 0, state.maxDepth),
            label: String(b.label ?? '').trim(),
        }))
        .filter((b) => Number.isFinite(b.from) && Number.isFinite(b.to) && b.to > b.from && b.label)
        .sort((a, b) => a.from - b.from);
}

/**
 * Readout HTML for a temperature, e.g. "teplota 8&nbsp;°C".
 * @param {number} t - °C
 * @param {number} [decimals=0]
 * @param {string} [label='teplota']
 * @returns {string|null} null when t is not a finite number
 */
export function temperatureReadout(t, decimals = 0, label = 'teplota') {
    if (t === null || t === undefined || !Number.isFinite(Number(t))) return null;
    return `${label} ${fmtCs(Number(t), decimals)}&nbsp;°C`;
}

// ---------------------------------------------------------------------------
// Layer
// ---------------------------------------------------------------------------

let gradientCounter = 0;

/**
 * Create the temperature layer.
 *
 * @param {Object} options
 * @param {(depth:number, state:Object) => number} options.profile - temperature in °C
 * @param {[number, number]} [options.range=[0, 25]] - °C shown on the axis and colour scale
 * @param {Array<{from:number,to:number,label:string}>|((state:Object) => Array)} [options.bands]
 * @param {string} [options.id='temperature']
 * @param {string} [options.label='teplota'] - readout word
 * @param {string} [options.axisLabel='teplota / °C']
 * @param {number} [options.decimals=0] - decimals of readout and point label
 * @param {boolean} [options.aside=true] - draw the profile panel
 * @param {string[]} [options.stops] - colour stops (else CSS --wc-temp-* or defaults)
 * @returns {import('../WaterColumn.js').Layer}
 */
export function createTemperatureLayer({
    profile,
    range = [0, 25],
    bands,
    id = 'temperature',
    label = 'teplota',
    axisLabel = 'teplota / °C',
    decimals = 0,
    aside = true,
    stops,
} = {}) {
    if (typeof profile !== 'function') {
        throw new TypeError('createTemperatureLayer needs profile(depth, state) → °C');
    }
    // SVG id gradientu: z ctx.uid (kontrakt kostry, unikátní i pro víc sloupců na stránce).
    let gradId = `wc-temp-grad-${++gradientCounter}`;

    function resolveStops(el) {
        if (Array.isArray(stops) && stops.length >= 2) return stops;
        const cs = getComputedStyle(el);
        const css = ['--wc-temp-cold', '--wc-temp-mid', '--wc-temp-warm']
            .map((n) => cs.getPropertyValue(n).trim());
        return css.every((c) => /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(c)) ? css : DEFAULT_TEMPERATURE_STOPS;
    }

    return {
        id,
        aside,
        init(ctx) { gradId = `${ctx.uid}-grad`; },
        zIndex: -10, // background colouring: below the other layers

        readout(state) {
            return temperatureReadout(profile(state.depth, state), decimals, label);
        },

        render(g, geom, state) {
            const { column: c, colors, fontSize: fs } = geom;
            const scale = resolveStops(g.ownerSVGElement || g);
            const samples = sampleProfile(profile, state, clamp(Math.ceil(c.h / 4), 16, 200));
            if (samples.length === 0) return;

            // 1) column coloured by temperature
            const defs = svgEl('defs', {}, g);
            const grad = svgEl('linearGradient', {
                id: gradId, gradientUnits: 'userSpaceOnUse', x1: 0, y1: c.y, x2: 0, y2: c.y + c.h,
            }, defs);
            for (const s of samples) {
                svgEl('stop', {
                    offset: Math.round((s.depth / state.maxDepth) * 1e4) / 1e4, // SVG geometry, not display
                    'stop-color': temperatureColor(s.t, range, scale),
                }, grad);
            }
            svgEl('rect', {
                class: 'wc-temp-fill', x: c.x, y: c.y, width: c.w, height: c.h,
                fill: `url(#${gradId})`, 'pointer-events': 'none',
            }, g);

            // 2) bands: boundaries across column (+ panel), label inside the column
            const panel = geom.aside;
            const bandList = resolveBands(bands, state);
            const bandFs = Math.round(fs * 0.9);
            const lineH = Math.round(bandFs * 1.2);
            const bandG = svgEl('g', { class: 'wc-temp-bands', 'pointer-events': 'none' }, g);
            const boundaries = new Set();
            for (const b of bandList) {
                if (b.from > 0) boundaries.add(b.from);
                if (b.to < state.maxDepth) boundaries.add(b.to);
            }
            const x2 = panel ? panel.x + panel.w : c.x + c.w;
            for (const d of boundaries) {
                const y = geom.depthToY(d);
                svgEl('line', {
                    x1: c.x, x2, y1: y, y2: y, stroke: colors.text, 'stroke-opacity': 0.55,
                    'stroke-width': 1, 'stroke-dasharray': '5 4',
                }, bandG);
            }
            for (const b of bandList) {
                const y0 = geom.depthToY(b.from);
                const y1 = geom.depthToY(b.to);
                const room = y1 - y0;
                let lines = splitLabel(b.label, c.w - fs, bandFs);
                if (lines.length * lineH > room) lines = [b.label];
                if (lineH > room) continue; // too thin for a label: boundaries still show it
                const yMid = (y0 + y1) / 2 - ((lines.length - 1) * lineH) / 2;
                const text = svgEl('text', {
                    x: c.x + Math.round(0.5 * fs), y: yMid, dy: '0.35em', 'font-size': bandFs,
                    ...haloAttrs(colors, bandFs),
                }, bandG);
                lines.forEach((ln, i) => {
                    svgEl('tspan', { x: c.x + Math.round(0.5 * fs), dy: i === 0 ? null : lineH, text: ln }, text);
                });
            }

            // 3) aside: temperature profile
            if (!panel || panel.w < 2 * fs) return;
            const [lo, hi] = range;
            const xOf = (t) => panel.x + ((clamp(t, lo, hi) - lo) / (hi - lo)) * panel.w;
            const chart = svgEl('g', { class: 'wc-temp-profile', 'pointer-events': 'none' }, g);

            // recessive grid: temperature ticks (vertical) and depth ticks (horizontal)
            const tTicks = temperatureTicks(range, panel.w, fs);
            for (const t of tTicks) {
                const x = xOf(t);
                svgEl('line', {
                    x1: x, x2: x, y1: panel.y, y2: panel.y + panel.h, stroke: colors.border, 'stroke-width': 1,
                }, chart);
                svgEl('text', {
                    x, y: panel.y + panel.h + Math.round(1.25 * fs), 'text-anchor': 'middle',
                    fill: colors.text, text: fmtCs(t, 0),
                }, chart);
            }
            for (const d of geom.ticks) {
                const y = geom.depthToY(d);
                svgEl('line', {
                    x1: panel.x, x2: panel.x + panel.w, y1: y, y2: y, stroke: colors.border, 'stroke-width': 1,
                }, chart);
            }
            svgEl('rect', {
                x: panel.x, y: panel.y, width: panel.w, height: panel.h,
                fill: 'none', stroke: colors.borderStrong, 'stroke-width': 1,
            }, chart);
            svgEl('text', {
                x: panel.x + panel.w / 2, y: panel.y + panel.h + Math.round(2.75 * fs), 'text-anchor': 'middle',
                fill: colors.text, text: axisLabel,
            }, chart);

            // profile line
            const points = samples
                .map((s) => `${Math.round(xOf(s.t) * 10) / 10},${Math.round(geom.depthToY(s.depth) * 10) / 10}`)
                .join(' ');
            svgEl('polyline', {
                points, fill: 'none', stroke: colors.text, 'stroke-width': 2,
                'stroke-linejoin': 'round', 'stroke-linecap': 'round',
            }, chart);

            // point at the current depth + direct label
            const tNow = Number(profile(state.depth, state));
            if (!Number.isFinite(tNow)) return;
            const px = xOf(tNow);
            const py = geom.depthToY(state.depth);
            svgEl('circle', {
                cx: px, cy: py, r: Math.max(5, Math.round(0.35 * fs)),
                fill: colors.text, stroke: colors.surface, 'stroke-width': 2,
            }, chart);
            const valueText = `${fmtCs(tNow, decimals)}${NBSP}°C`;
            const gapPx = Math.round(0.6 * fs);
            const fitsRight = px + gapPx + estimateTextWidth(valueText, fs) <= panel.x + panel.w;
            svgEl('text', {
                x: fitsRight ? px + gapPx : px - gapPx,
                y: py - Math.round(0.5 * fs),
                'text-anchor': fitsRight ? 'start' : 'end',
                ...haloAttrs(colors, fs),
                text: valueText,
            }, chart);
        },
    };
}
