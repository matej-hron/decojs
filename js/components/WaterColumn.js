/**
 * Water column — shared, layered SVG model for the P1 physics course.
 *
 * A vertical column of water with a depth axis, a water surface (or ice),
 * a depth pointer the user can drag and a depth slider. Chapters do not copy
 * this component; they add *layers* to it (pressure + balloon,
 * diver and buoyancy, partial pressures, saturation …).
 *
 * The layer contract is documented in docs/course/water-column.md — read it
 * before writing a layer. Short version:
 *
 *   const col = createWaterColumn(host, { maxDepth: 40 });
 *   col.addLayer({
 *       id: 'pressure',                 // unique; also the prefix of its private state keys
 *       aside: true,                    // ask for an own panel right of the column
 *       zIndex: 0,                      // optional draw order (then insertion order)
 *       init(ctx) { … },                // optional, once: add DOM controls to ctx.controlsEl
 *       render(g, geom, state) { … },   // draw into g (cleared by the core before each call)
 *       readout(state) { return 'tlak 2&nbsp;bar'; },   // optional HTML or null
 *       destroy() { … },                // optional cleanup
 *   });
 *
 * The SVG works in *pixel* coordinates (a 1:1 viewBox, no scaling on screen) so text keeps a
 * fixed, legible size: ≥ 14 px on a 390 px phone, up to 20 px on a projector.
 *
 * Pure helpers (geometry, ticks, depth ↔ y mapping, snapping, formatting) are
 * exported separately and are tested under Node without a DOM
 * (tests/water-column.test.mjs).
 *
 * Course content is Czech only for now, so numbers are formatted with the
 * Czech decimal comma regardless of the UI language (see `fmtCs`).
 */

import { fmtNum } from '../format.js';

/** SVG namespace. */
export const SVG_NS = 'http://www.w3.org/2000/svg';

/**
 * State keys owned by the core. Layers read them, only the core validates them.
 * Every other key belongs to the page (scenario keys such as `water`) or to a
 * layer (keys prefixed with the layer id, e.g. `pressureMode`).
 */
export const CORE_STATE_KEYS = Object.freeze(['depth', 'maxDepth', 'surface']);

/** Default Czech labels. Override any of them via `options.labels`. */
export const DEFAULT_LABELS = Object.freeze({
    figure: 'Vodní sloupec',
    depthAxis: 'hloubka [m]',
    depth: 'hloubka',
    slider: 'Hloubka',
    ice: 'led',
});

const NBSP = ' ';
const MINUS = '−';

// ---------------------------------------------------------------------------
// Pure helpers (no DOM)
// ---------------------------------------------------------------------------

/**
 * Clamp a number into [min, max].
 * @param {number} v
 * @param {number} min
 * @param {number} max
 * @returns {number}
 */
export function clamp(v, min, max) {
    return Math.min(max, Math.max(min, v));
}

/**
 * Number of decimal places of a step ("0.5" → 1, "1" → 0, "0.25" → 2).
 * @param {number} step
 * @returns {number}
 */
export function decimalsOf(step) {
    const s = String(step);
    if (s.includes('e-')) return Number(s.split('e-')[1]);
    const i = s.indexOf('.');
    return i < 0 ? 0 : s.length - i - 1;
}

/**
 * Format a number for Czech course content: decimal comma (via `fmtNum`),
 * real minus sign U+2212 for negatives, and no "−0" after rounding.
 *
 * Returns a display string — never feed it back into arithmetic or SVG
 * coordinates.
 *
 * @param {number} value
 * @param {number} [decimals]
 * @returns {string}
 */
export function fmtCs(value, decimals) {
    const s = fmtNum(value, decimals, 'cs');
    if (!s.startsWith('-')) return s;
    if (/^-0(,0*)?$/.test(s)) return s.slice(1);
    return MINUS + s.slice(1);
}

/**
 * Snap a depth to the slider step and clamp it into [0, maxDepth].
 * Non-finite input becomes 0.
 *
 * @param {number} depth - Requested depth in metres
 * @param {number} maxDepth - Bottom of the column in metres
 * @param {number} [step=1] - Step in metres
 * @returns {number}
 */
export function snapDepth(depth, maxDepth, step = 1) {
    const d = Number(depth);
    if (!Number.isFinite(d)) return 0;
    const st = step > 0 ? step : 1;
    const snapped = Math.round(clamp(d, 0, maxDepth) / st) * st;
    // Remove floating-point noise (0.30000000000000004) — numeric, not display.
    return clamp(Math.round(snapped * 10 ** decimalsOf(st)) / 10 ** decimalsOf(st), 0, maxDepth);
}

/**
 * Round a raw step up to a "nice" one: 1, 2 or 5 × 10^k.
 * @param {number} raw - Desired step (> 0)
 * @returns {number}
 */
export function niceStep(raw) {
    if (!(raw > 0) || !Number.isFinite(raw)) return 1;
    const exp = Math.floor(Math.log10(raw));
    const base = 10 ** exp;
    for (const m of [1, 2, 5, 10]) {
        if (m * base >= raw - 1e-12) return Number((m * base).toPrecision(12));
    }
    return 10 * base;
}

/**
 * Evenly spaced ticks on nice values covering [min, max].
 *
 * @param {number} min
 * @param {number} max
 * @param {number} maxCount - Maximum number of *intervals* that fit
 * @param {number} [minStep=0] - Never use a smaller step than this
 * @returns {number[]}
 */
export function niceTicks(min, max, maxCount, minStep = 0) {
    if (!(max > min)) return [min];
    const step = Math.max(niceStep((max - min) / Math.max(1, Math.floor(maxCount))), minStep);
    const first = Math.ceil(min / step - 1e-9) * step;
    const out = [];
    for (let v = first; v <= max + step * 1e-9; v += step) {
        out.push(Number(v.toPrecision(12)));
    }
    return out;
}

/**
 * Depth ticks for an axis of the given pixel height: whole metres, labels
 * at least ~2.5 em apart.
 *
 * @param {number} maxDepth - metres
 * @param {number} pixelHeight - height of the column in px
 * @param {number} fontSize - px
 * @returns {number[]}
 */
export function depthTicks(maxDepth, pixelHeight, fontSize) {
    const maxCount = Math.max(1, Math.floor(pixelHeight / (2.5 * fontSize)));
    return niceTicks(0, maxDepth, maxCount, 1);
}

/**
 * Base font size from the drawing width: 14 px on phones, growing to 20 px
 * on a 1280 px+ projector layout.
 * @param {number} width - px
 * @returns {number} px
 */
export function baseFontSize(width) {
    return clamp(Math.round(10 + width / 128), 14, 20);
}

/**
 * Default SVG height for a width: tall on a phone (portrait), shorter on a
 * landscape projector so the model fits one screen with its controls.
 * @param {number} width - px
 * @returns {number} px
 */
export function defaultHeight(width) {
    const h = width < 600 ? width * 1.05 : width * 0.5;
    return Math.round(clamp(h, 300, 600));
}

/**
 * Rough text width estimate for layout decisions (no DOM measuring).
 * @param {string} text
 * @param {number} fontSize - px
 * @returns {number} px
 */
export function estimateTextWidth(text, fontSize) {
    return String(text).length * 0.56 * fontSize;
}

/**
 * Where to put the value label of a horizontal bar in a panel: after the bar if it fits, else inside its end,
 * never over the panel's left axis or into the neighbouring panel. `labels` go from the fullest to the shortest
 * ('2 bar', '2'); the first one that fits wins, the last one is used after the bar as a fallback.
 * @param {Object} p
 * @param {number} p.x0 - left edge of the panel (bar start), px
 * @param {number} p.x1 - bar end, px
 * @param {number} p.right - right edge of the panel, px
 * @param {number} p.fs - font size, px
 * @param {string[]} p.labels
 * @returns {{text: string, x: number, anchor: 'start'|'end', inside: boolean, width: number}}
 */
export function placeBarLabel({ x0, x1, right, fs, labels }) {
    const pad = 0.4 * fs;
    for (const text of labels) {
        const width = text.length * 0.6 * fs; // bold digits: a little wider than estimateTextWidth
        if (x1 + pad + width <= right) return { text, x: x1 + pad, anchor: 'start', inside: false, width };
        if (x1 - pad - width >= x0 + 0.2 * fs) return { text, x: x1 - pad, anchor: 'end', inside: true, width };
    }
    const text = labels[labels.length - 1];
    const width = text.length * 0.6 * fs;
    return { text, x: Math.min(x1 + pad, right - width), anchor: 'start', inside: false, width };
}

/**
 * Split a label into at most two lines so that it fits `maxWidth`.
 * Breaks at the space nearest the middle. A label that fits stays one line.
 *
 * @param {string} label
 * @param {number} maxWidth - px
 * @param {number} fontSize - px
 * @returns {string[]} 1 or 2 lines (a single long word may still overflow)
 */
export function splitLabel(label, maxWidth, fontSize) {
    const text = String(label).trim();
    if (estimateTextWidth(text, fontSize) <= maxWidth || !text.includes(' ')) return [text];
    const mid = text.length / 2;
    let best = -1;
    for (let i = 0; i < text.length; i++) {
        if (text[i] === ' ' && (best < 0 || Math.abs(i - mid) < Math.abs(best - mid))) best = i;
    }
    return [text.slice(0, best), text.slice(best + 1)];
}

/**
 * @typedef {{x:number, y:number, w:number, h:number}} Rect
 */

/**
 * @typedef {Object} Geometry
 * @property {number} width - SVG width, px
 * @property {number} height - SVG height, px
 * @property {number} fontSize - base font size, px
 * @property {number} maxDepth - metres
 * @property {Rect} column - the water column (y = surface, y + h = bottom)
 * @property {Rect|null} aside - the panel of the layer being rendered (null if it has none)
 * @property {Rect[]} panels - all aside panels, in layer order
 * @property {(depth:number) => number} depthToY - linear, not clamped
 * @property {(y:number) => number} yToDepth - linear, not clamped
 * @property {number[]} ticks - depth ticks drawn on the axis, metres
 * @property {Object<string,string>} [colors] - theme colours (added by the component)
 */

/**
 * Compute the layout. Pure: depends only on its arguments.
 *
 * Horizontal: [axis title | tick labels | column | gap | panel | gap | panel …].
 * The whole composition is centred when the panels hit their maximum width.
 * Vertical: top margin for the surface / ice, bottom margin for the panels'
 * horizontal axis (tick labels + title).
 *
 * @param {Object} p
 * @param {number} p.width - px
 * @param {number} [p.height] - px (default `defaultHeight(width)`)
 * @param {number} [p.fontSize] - px (default `baseFontSize(width)`)
 * @param {number} p.maxDepth - metres
 * @param {number} [p.panels=0] - number of aside panels
 * @param {number} [p.headroom=0] - extra space above the surface in em (an object floating on the surface, a bell
 *   hanging above it); the bottom of the column stays where it was
 * @returns {Geometry} (without `colors`; `aside` is null — set per layer)
 */
export function computeGeometry({ width, height, fontSize, maxDepth, panels = 0, headroom = 0 }) {
    const W = Math.max(0, width);
    const fs = fontSize || baseFontSize(W);
    const H = height || defaultHeight(W);
    const n = Math.max(0, Math.floor(panels));

    const digits = String(Math.round(maxDepth)).length;
    const left = Math.round(1.6 * fs + digits * 0.62 * fs + 0.8 * fs);
    const right = Math.round(n > 0 ? 1.0 * fs : 0.6 * fs);
    const top = Math.round(1.7 * fs) + Math.round(Math.max(0, headroom) * fs);
    const bottom = Math.round(n > 0 ? 3.4 * fs : 1.0 * fs);
    const inner = Math.max(0, W - left - right);
    const gap = Math.round((W < 600 ? 0.8 : 1.2) * fs);

    let colW;
    let panelW = 0;
    if (n > 0) {
        colW = clamp(inner * (W < 600 ? 0.42 : 0.36), 3.5 * fs, 16 * fs);
        const asideW = Math.max(0, inner - colW - gap * n);
        panelW = Math.min(asideW / n, 30 * fs);
    } else {
        colW = Math.min(inner, 18 * fs);
    }
    colW = Math.round(colW);
    panelW = Math.floor(panelW);

    const contentW = colW + (n > 0 ? n * (gap + panelW) : 0);
    const offset = Math.max(0, Math.floor((inner - contentW) / 2));
    const colX = left + offset;
    const colY = top;
    const colH = Math.max(1, H - top - bottom);

    const column = { x: colX, y: colY, w: colW, h: colH };
    const panelRects = [];
    for (let i = 0; i < n; i++) {
        panelRects.push({ x: colX + colW + gap + i * (panelW + gap), y: colY, w: panelW, h: colH });
    }

    const md = maxDepth > 0 ? maxDepth : 1;
    const depthToY = (d) => colY + (d / md) * colH;
    const yToDepth = (y) => ((y - colY) / colH) * md;

    return {
        width: W,
        height: H,
        fontSize: fs,
        maxDepth: md,
        column,
        aside: null,
        panels: panelRects,
        depthToY,
        yToDepth,
        ticks: depthTicks(md, colH, fs),
    };
}

/**
 * HTML readout of the core (depth), e.g. "hloubka 12&nbsp;m".
 * @param {Object} state
 * @param {number} [step=1]
 * @param {string} [label='hloubka']
 * @returns {string}
 */
export function depthReadout(state, step = 1, label = DEFAULT_LABELS.depth) {
    return `${label} ${fmtDepth(state.depth, step)}&nbsp;m`;
}

/**
 * Hloubka pro popisky: celé metry bez desetinné části, jinak tolik míst, kolik má krok (12; 12,5).
 * @param {number} depth - metres
 * @param {number} [step=1]
 * @returns {string}
 */
export function fmtDepth(depth, step = 1) {
    const d = decimalsOf(step);
    return fmtCs(depth, Math.abs(depth - Math.round(depth)) < 1e-9 ? 0 : d);
}

/**
 * Join readout parts of the core and the layers with a middle dot.
 * Null / empty parts are skipped.
 * @param {Array<string|null|undefined>} parts
 * @returns {string}
 */
export function joinReadout(parts) {
    return parts.filter((p) => typeof p === 'string' && p.trim() !== '').join(' · ');
}

/**
 * Order layers for drawing: by `zIndex` (default 0), then insertion order.
 * @param {Array<{zIndex?:number}>} layers
 * @returns {Array} new array
 */
export function sortLayers(layers) {
    return layers
        .map((l, i) => ({ l, i }))
        .sort((a, b) => (a.l.zIndex || 0) - (b.l.zIndex || 0) || a.i - b.i)
        .map((x) => x.l);
}

// ---------------------------------------------------------------------------
// DOM helpers (exported for layers)
// ---------------------------------------------------------------------------

/**
 * Create an SVG element. `text` sets textContent; null/undefined attrs are skipped.
 * @param {string} tag
 * @param {Object<string,any>} [attrs]
 * @param {Element} [parent] - appended to it when given
 * @returns {SVGElement}
 */
export function svgEl(tag, attrs = {}, parent) {
    const el = document.createElementNS(SVG_NS, tag);
    for (const [k, v] of Object.entries(attrs)) {
        if (v === null || v === undefined) continue;
        if (k === 'text') el.textContent = String(v);
        else el.setAttribute(k, String(v));
    }
    if (parent) parent.appendChild(el);
    return el;
}

/**
 * Attributes for text that stays legible over coloured fills: a halo in the
 * surface colour painted under the glyphs.
 * @param {Object<string,string>} colors - `geom.colors`
 * @param {number} fontSize - px
 * @returns {Object<string,string>}
 */
export function haloAttrs(colors, fontSize) {
    return {
        fill: colors.text,
        stroke: colors.surface,
        'stroke-width': Math.max(3, Math.round(fontSize * 0.28)),
        'stroke-linejoin': 'round',
        'paint-order': 'stroke',
    };
}

/**
 * Read the theme colours from CSS custom properties (css/styles.css tokens).
 * The core-specific `--wc-*` properties override the defaults.
 * @param {Element} el - element whose computed style is read
 * @returns {Object<string,string>}
 */
export function readColors(el) {
    const cs = getComputedStyle(el);
    const v = (name, fallback = '') => cs.getPropertyValue(name).trim() || fallback;
    const dark = document.documentElement.getAttribute('data-theme') === 'dark';
    return {
        dark: dark ? 'dark' : 'light',
        text: v('--text', '#2c3e50'),
        subtle: v('--text-subtle', '#7f8c8d'),
        border: v('--border', '#dce1e6'),
        borderStrong: v('--border-strong', '#c5ccd4'),
        surface: v('--surface', '#ffffff'),
        water: v('--wc-water') || v(dark ? '--blue-800' : '--blue-100', dark ? '#12405c' : '#cfe5f5'),
        waterLine: v('--wc-water-line') || v(dark ? '--blue-300' : '--blue-500', '#2980b9'),
        ice: v('--wc-ice') || v(dark ? '--gray-200' : '--blue-50', '#eaf4fb'),
        iceStroke: v('--wc-ice-stroke') || v(dark ? '--gray-400' : '--blue-300', '#71b0d6'),
        iceText: v('--wc-ice-text') || v('--gray-800', '#2c3e50'),
    };
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

let instanceCounter = 0;

/**
 * @typedef {Object} Layer
 * @property {string} id - unique within the column; prefix of the layer's private state keys
 * @property {(g:SVGGElement, geom:Geometry, state:Object) => void} render
 * @property {(state:Object) => (string|null)} [readout] - HTML fragment for the readout line
 * @property {boolean} [aside] - true = the layer gets its own panel right of the column
 * @property {number} [zIndex=0] - draw order; equal values keep insertion order
 * @property {(ctx:LayerContext) => void} [init] - called once from addLayer
 * @property {() => void} [destroy] - called from removeLayer / destroy
 */

/**
 * @typedef {Object} LayerContext
 * @property {HTMLElement} root - the component's wrapper element
 * @property {HTMLElement} controlsEl - container for the layer's own controls
 * @property {() => Object} getState
 * @property {(partial:Object) => void} setState - reported as source 'user'
 * @property {string} uid - unique prefix for SVG ids (gradients, clip paths)
 */

/**
 * Create a water column inside `host`.
 *
 * @param {HTMLElement} host - container; the component appends its own wrapper
 * @param {Object} [options]
 * @param {number} [options.maxDepth=40] - metres
 * @param {number} [options.depth=0] - metres
 * @param {'water'|'ice'} [options.surface='water']
 * @param {number} [options.step=1] - depth step of the slider and drag, metres
 * @param {boolean} [options.aside=true] - false = no aside panels at all
 * @param {number} [options.headroom=0] - extra space above the surface in em (see computeGeometry)
 * @param {number|((width:number)=>number)} [options.height] - SVG height, px
 * @param {Object} [options.labels] - overrides of DEFAULT_LABELS
 * @param {Object} [options.state] - initial page/layer keys merged into state
 * @returns {WaterColumnApi}
 */
export function createWaterColumn(host, options = {}) {
    const uid = `wc${++instanceCounter}`;
    const step = options.step > 0 ? options.step : 1;
    const labels = { ...DEFAULT_LABELS, ...(options.labels || {}) };
    const asideEnabled = options.aside !== false;

    /** @type {Object} */
    let state = {
        ...(options.state || {}),
        maxDepth: options.maxDepth > 0 ? options.maxDepth : 40,
        surface: options.surface === 'ice' ? 'ice' : 'water',
        depth: 0,
    };
    state.depth = snapDepth(options.depth ?? 0, state.maxDepth, step);

    /** @type {Array<{layer:Layer, g:SVGGElement}>} */
    const entries = [];
    const listeners = new Set();
    let geom = null;
    let rafId = 0;
    let dragging = null; // pointerId while dragging
    let destroyed = false;

    // ---- DOM skeleton ----------------------------------------------------
    const root = document.createElement('div');
    root.className = 'water-column';

    const svg = document.createElementNS(SVG_NS, 'svg');
    svg.setAttribute('class', 'water-column-svg');
    svg.setAttribute('role', 'img');
    svg.setAttribute('aria-label', labels.figure);
    svg.style.display = 'block';
    svg.style.width = '100%';
    svg.style.userSelect = 'none';
    svg.style.webkitUserSelect = 'none';

    const readoutEl = document.createElement('p');
    readoutEl.className = 'water-column-readout';
    readoutEl.setAttribute('aria-live', 'polite');
    readoutEl.setAttribute('aria-atomic', 'true');

    const controlsEl = document.createElement('div');
    controlsEl.className = 'water-column-controls';

    const depthLabel = document.createElement('label');
    depthLabel.className = 'water-column-depth';
    const depthLabelText = document.createElement('span');
    depthLabelText.textContent = labels.slider;
    const range = document.createElement('input');
    range.type = 'range';
    range.min = '0';
    range.step = String(step);
    range.setAttribute('aria-label', labels.slider);
    depthLabel.append(depthLabelText, range);
    controlsEl.appendChild(depthLabel);

    root.append(svg, readoutEl, controlsEl);
    host.appendChild(root);

    // ---- state -------------------------------------------------------------
    function syncRange() {
        range.max = String(state.maxDepth);
        range.value = String(state.depth);
        range.setAttribute('aria-valuetext', `${fmtDepth(state.depth, step)}${NBSP}m`);
    }

    function setStateInternal(partial, source) {
        if (destroyed || !partial || typeof partial !== 'object') return;
        const next = { ...state, ...partial };
        if (!(Number(next.maxDepth) > 0)) next.maxDepth = state.maxDepth;
        next.maxDepth = Number(next.maxDepth);
        next.surface = next.surface === 'ice' ? 'ice' : 'water';
        next.depth = snapDepth(next.depth, next.maxDepth, step);
        const changed = Object.keys(next).filter((k) => !Object.is(next[k], state[k]));
        if (changed.length === 0) return;
        state = next;
        syncRange();
        scheduleRender();
        emit(getState(), { source, changed });
    }

    // Změny vyvolané posluchačem (setState uvnitř on('change')) se řadí do fronty:
    // každý posluchač dostane všechny změny ve správném pořadí a poslední stav
    // je vždy ten aktuální (žádný pozdější posluchač nedostane starší snímek).
    const pending = [];
    let emitting = false;
    function emit(snapshot, info) {
        pending.push([snapshot, info]);
        if (emitting) return;
        emitting = true;
        try {
            while (pending.length) {
                const [snap, inf] = pending.shift();
                for (const fn of [...listeners]) {
                    try {
                        fn(snap, inf);
                    } catch (err) {
                        console.error('[WaterColumn] change listener failed', err);
                    }
                }
            }
        } finally {
            emitting = false;
        }
    }

    function getState() {
        return { ...state };
    }

    // ---- rendering ---------------------------------------------------------
    function scheduleRender() {
        if (destroyed || rafId) return;
        if (typeof requestAnimationFrame !== 'function') {
            render();
            return;
        }
        rafId = requestAnimationFrame(() => {
            rafId = 0;
            render();
        });
    }

    function updateReadout() {
        const parts = [depthReadout(state, step, labels.depth)];
        for (const { layer } of entries) {
            if (typeof layer.readout !== 'function') continue;
            try {
                parts.push(layer.readout(getState()));
            } catch (err) {
                console.error(`[WaterColumn] readout of layer "${layer.id}" failed`, err);
            }
        }
        const html = joinReadout(parts);
        if (readoutEl.innerHTML !== html) readoutEl.innerHTML = html;
    }

    function render() {
        if (destroyed) return;
        updateReadout();
        const width = Math.floor(root.clientWidth || host.clientWidth || 0);
        if (width <= 0) return; // hidden (e.g. closed <details>); ResizeObserver re-renders
        const height = typeof options.height === 'function' ? options.height(width) : options.height;
        const asideLayers = asideEnabled ? entries.filter((e) => e.layer.aside) : [];
        geom = computeGeometry({ width, height, maxDepth: state.maxDepth, panels: asideLayers.length, headroom: options.headroom });
        geom.colors = readColors(root);

        svg.setAttribute('width', String(geom.width));
        svg.setAttribute('height', String(geom.height));
        svg.style.height = `${geom.height}px`;
        svg.setAttribute('viewBox', `0 0 ${geom.width} ${geom.height}`); // 1:1 on screen; lets print CSS fit the paper
        svg.setAttribute('font-size', String(geom.fontSize));
        svg.setAttribute('font-family', 'var(--font-body, sans-serif)');
        svg.replaceChildren();

        const frozen = Object.freeze(getState());
        const base = svgEl('g', { class: 'wc-base' }, svg);
        drawBase(base, geom);

        const ordered = sortLayers(entries.map((e) => ({ zIndex: e.layer.zIndex, entry: e }))).map((x) => x.entry);
        for (const entry of ordered) {
            entry.g.replaceChildren();
            svg.appendChild(entry.g);
            const panelIndex = asideLayers.indexOf(entry);
            const layerGeom = { ...geom, aside: panelIndex >= 0 ? geom.panels[panelIndex] : null };
            try {
                entry.layer.render(entry.g, layerGeom, frozen);
            } catch (err) {
                console.error(`[WaterColumn] render of layer "${entry.layer.id}" failed`, err);
            }
        }

        const overlay = svgEl('g', { class: 'wc-overlay' }, svg);
        drawOverlay(overlay, geom, frozen);
    }

    function drawBase(g, gm) {
        const { column: c, colors } = gm;
        const rect = svgEl('rect', { class: 'wc-water', x: c.x, y: c.y, width: c.w, height: c.h, fill: colors.water }, g);
        // Mouse / pen: press anywhere in the column jumps there and starts a drag.
        rect.addEventListener('pointerdown', (e) => {
            if (e.pointerType === 'touch') return; // touch: tap (click) jumps, swipe scrolls the page
            startDrag(e);
        });
        rect.addEventListener('click', (e) => {
            setStateInternal({ depth: depthAtClientY(e.clientY) }, 'user');
        });
    }

    function drawOverlay(g, gm, st) {
        const { column: c, colors, fontSize: fs } = gm;
        // column outline
        svgEl('rect', {
            x: c.x, y: c.y, width: c.w, height: c.h,
            fill: 'none', stroke: colors.borderStrong, 'stroke-width': 1, 'pointer-events': 'none',
        }, g);

        // surface: waves or ice
        if (st.surface === 'ice') {
            const iceH = Math.round(0.95 * fs);
            svgEl('rect', {
                class: 'wc-ice', x: c.x - 2, y: c.y - iceH, width: c.w + 4, height: iceH, rx: 2,
                fill: colors.ice, stroke: colors.iceStroke, 'stroke-width': 1, 'pointer-events': 'none',
            }, g);
            svgEl('text', {
                x: c.x + c.w / 2, y: c.y - iceH / 2, dy: '0.35em', 'text-anchor': 'middle',
                'font-size': Math.round(fs * 0.85), fill: colors.iceText, 'pointer-events': 'none',
                text: labels.ice,
            }, g);
        } else {
            svgEl('path', {
                class: 'wc-surface', d: wavePath(c.x, c.y, c.w, fs), fill: 'none',
                stroke: colors.waterLine, 'stroke-width': 2, 'stroke-linecap': 'round', 'pointer-events': 'none',
            }, g);
        }

        // depth axis
        const tick = Math.round(0.4 * fs);
        const axis = svgEl('g', { class: 'wc-axis', 'pointer-events': 'none' }, g);
        for (const d of gm.ticks) {
            const y = gm.depthToY(d);
            svgEl('line', { x1: c.x - tick, x2: c.x, y1: y, y2: y, stroke: colors.text, 'stroke-width': 1 }, axis);
            svgEl('text', {
                x: c.x - tick - Math.round(0.3 * fs), y, dy: '0.35em', 'text-anchor': 'end',
                fill: colors.text, text: fmtCs(d, 0),
            }, axis);
        }
        // rotated title left of the widest tick label
        const widest = estimateTextWidth(String(Math.round(st.maxDepth)), fs);
        const axisTitleX = Math.max(
            Math.round(0.9 * fs),
            Math.round(c.x - tick - 0.3 * fs - widest - 0.7 * fs),
        );
        const cy = c.y + c.h / 2;
        svgEl('text', {
            x: axisTitleX, y: cy, 'text-anchor': 'middle', fill: colors.text,
            transform: `rotate(-90 ${axisTitleX} ${cy})`, text: labels.depthAxis,
        }, axis);

        // depth pointer
        const py = gm.depthToY(st.depth);
        const ptr = svgEl('g', { class: 'wc-pointer' }, g);
        for (const p of gm.panels) {
            svgEl('line', {
                x1: p.x, x2: p.x + p.w, y1: py, y2: py, stroke: colors.text, 'stroke-width': 1,
                'stroke-dasharray': '3 4', 'pointer-events': 'none',
            }, ptr);
        }
        svgEl('line', {
            x1: c.x, x2: c.x + c.w, y1: py, y2: py, stroke: colors.text, 'stroke-width': 2, 'pointer-events': 'none',
        }, ptr);
        const knobR = Math.round(Math.max(7, 0.5 * fs));
        svgEl('circle', {
            cx: c.x + c.w, cy: py, r: knobR, fill: colors.surface, stroke: colors.text, 'stroke-width': 2,
            'pointer-events': 'none',
        }, ptr);
        const labelBelow = py - c.y < 1.3 * fs;
        svgEl('text', {
            x: c.x + c.w - knobR - Math.round(0.4 * fs),
            y: labelBelow ? py + Math.round(0.45 * fs) : py - Math.round(0.45 * fs),
            dy: labelBelow ? '0.8em' : '0', 'text-anchor': 'end', 'pointer-events': 'none',
            ...haloAttrs(colors, fs),
            text: `${fmtDepth(st.depth, step)}${NBSP}m`,
        }, ptr);

        // hit band: the only place where touch-action is disabled, so a finger
        // drags the pointer here and scrolls the page everywhere else
        const band = Math.max(44, Math.round(2.2 * fs));
        const hit = svgEl('rect', {
            class: 'wc-pointer-hit', x: c.x, y: py - band / 2, width: c.w + knobR + 4, height: band,
            fill: colors.text, 'fill-opacity': 0, 'pointer-events': 'all',
        }, ptr);
        hit.style.cursor = 'ns-resize';
        hit.style.touchAction = 'none';
        hit.addEventListener('pointerdown', startDrag);
    }

    // ---- pointer interaction ----------------------------------------------
    function depthAtClientY(clientY) {
        if (!geom) return state.depth;
        const top = svg.getBoundingClientRect().top;
        return geom.yToDepth(clientY - top);
    }

    function startDrag(e) {
        if (e.button !== undefined && e.button !== 0) return;
        e.preventDefault();
        dragging = e.pointerId;
        try {
            svg.setPointerCapture(e.pointerId); // on the persistent <svg>: survives re-renders
        } catch { /* capture unsupported — moves still arrive while over the svg */ }
        setStateInternal({ depth: depthAtClientY(e.clientY) }, 'user');
    }

    function onPointerMove(e) {
        if (dragging === null || e.pointerId !== dragging) return;
        e.preventDefault();
        setStateInternal({ depth: depthAtClientY(e.clientY) }, 'user');
    }

    function endDrag(e) {
        if (dragging === null || (e && e.pointerId !== dragging)) return;
        dragging = null;
    }

    svg.addEventListener('pointermove', onPointerMove);
    svg.addEventListener('pointerup', endDrag);
    svg.addEventListener('pointercancel', endDrag);
    svg.addEventListener('lostpointercapture', endDrag);
    range.addEventListener('input', () => setStateInternal({ depth: Number(range.value) }, 'user'));

    // ---- observers ---------------------------------------------------------
    let ro = null;
    if (typeof ResizeObserver === 'function') {
        let lastWidth = -1;
        ro = new ResizeObserver(() => {
            const w = Math.floor(root.clientWidth);
            if (w === lastWidth) return; // our own height changes do not re-layout
            lastWidth = w;
            render();
        });
        ro.observe(root);
    }
    // Výška daná funkcí (např. podle výšky okna) se musí přepočítat i při změně výšky
    // okna — ResizeObserver výše reaguje jen na šířku (F11 na projektoru).
    const onWindowResize = typeof options.height === 'function' && typeof window !== 'undefined'
        ? () => scheduleRender() : null;
    if (onWindowResize) window.addEventListener('resize', onWindowResize);
    let mo = null;
    if (typeof MutationObserver === 'function') {
        mo = new MutationObserver(scheduleRender);
        mo.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    }

    // ---- public API ----------------------------------------------------------
    /**
     * @typedef {Object} WaterColumnApi
     * @property {HTMLElement} el - wrapper (.water-column)
     * @property {SVGSVGElement} svg
     * @property {HTMLElement} controlsEl - .water-column-controls (depth slider + layer controls)
     * @property {HTMLElement} readoutEl - .water-column-readout (aria-live)
     * @property {(layer:Layer) => WaterColumnApi} addLayer
     * @property {(id:string) => boolean} removeLayer
     * @property {(partial:Object) => void} setState
     * @property {() => Object} getState - shallow copy
     * @property {(type:'change', fn:(state:Object, info:{source:'user'|'api', changed:string[]}) => void) => (() => void)} on
     * @property {() => (Geometry|null)} getGeometry - last rendered geometry
     * @property {() => void} render - force a synchronous redraw
     * @property {() => void} destroy
     */
    const api = {
        el: root,
        svg,
        controlsEl,
        readoutEl,

        addLayer(layer) {
            if (!layer || typeof layer.id !== 'string' || layer.id === '') {
                throw new TypeError('WaterColumn layer needs a non-empty string id');
            }
            if (typeof layer.render !== 'function') {
                throw new TypeError(`WaterColumn layer "${layer.id}" needs a render(g, geom, state) function`);
            }
            if (entries.some((e) => e.layer.id === layer.id)) {
                throw new Error(`WaterColumn layer "${layer.id}" is already added`);
            }
            // Vrstva je pro ukazatel průhledná (klik/tažení ve sloupci jde na kostru);
            // prvek, který má být klikací, si nastaví pointer-events sám.
            const g = svgEl('g', { class: 'wc-layer', 'data-layer': layer.id, 'pointer-events': 'none' });
            entries.push({ layer, g });
            if (typeof layer.init === 'function') {
                layer.init({
                    root,
                    controlsEl,
                    getState,
                    setState: (partial) => setStateInternal(partial, 'user'),
                    uid: `${uid}-${layer.id}`,
                });
            }
            scheduleRender();
            return api;
        },

        removeLayer(id) {
            const i = entries.findIndex((e) => e.layer.id === id);
            if (i < 0) return false;
            const [{ layer, g }] = entries.splice(i, 1);
            g.remove();
            if (typeof layer.destroy === 'function') layer.destroy();
            scheduleRender();
            return true;
        },

        setState(partial) {
            setStateInternal(partial, 'api');
        },

        getState,

        on(type, fn) {
            if (type !== 'change' || typeof fn !== 'function') return () => {};
            listeners.add(fn);
            return () => listeners.delete(fn);
        },

        getGeometry() {
            return geom;
        },

        render() {
            if (rafId && typeof cancelAnimationFrame === 'function') cancelAnimationFrame(rafId);
            rafId = 0;
            render();
        },

        destroy() {
            if (destroyed) return;
            for (const { layer } of entries.splice(0)) {
                if (typeof layer.destroy === 'function') layer.destroy();
            }
            destroyed = true;
            if (rafId && typeof cancelAnimationFrame === 'function') cancelAnimationFrame(rafId);
            ro?.disconnect();
            mo?.disconnect();
            if (onWindowResize) window.removeEventListener('resize', onWindowResize);
            listeners.clear();
            root.remove();
        },
    };

    syncRange();
    render();
    return api;
}

/**
 * Gentle wave along the water surface (y = surface line).
 * @param {number} x
 * @param {number} y
 * @param {number} w
 * @param {number} fs - font size, scales the wave
 * @returns {string} SVG path data
 */
export function wavePath(x, y, w, fs) {
    const amp = Math.max(1.5, 0.14 * fs);
    const n = Math.max(2, Math.round(w / (1.6 * fs)));
    const seg = w / n;
    let d = `M${round1(x)} ${round1(y)}`;
    for (let i = 0; i < n; i++) {
        const x0 = x + i * seg;
        const cy = i % 2 === 0 ? y - amp : y + amp;
        d += ` Q${round1(x0 + seg / 2)} ${round1(cy)} ${round1(x0 + seg)} ${round1(y)}`;
    }
    return d;
}

/** Round an SVG coordinate to 0.1 px (geometry only, never display text). */
function round1(v) {
    return Math.round(v * 10) / 10;
}
