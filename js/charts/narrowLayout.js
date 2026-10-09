/**
 * Narrow (phone-portrait) layout for the shared charts.
 *
 * Opt-in: only charts created with `narrowLayout: true` use it (today the dive log, whose page CSS
 * in lab/dive-log.html does the DOM layout). A chart is "narrow" when its host is at most
 * NARROW_CHART_MAX_WIDTH wide. Narrow charts:
 *  - get the `chart-narrow` class on their host,
 *  - get smaller Chart.js fonts and a top gutter for the overlay buttons (narrowChartPlugin),
 *  - with `plugins.narrowLayout.depthBand`, hide the depth axis (pressure keeps the grid).
 * Desktop options are saved before the first override and restored when the chart widens
 * again (a phone rotated to landscape), so desktop rendering is unchanged.
 */

export const NARROW_CHART_MAX_WIDTH = 600;
/** Space above the legend for the lock / reset-zoom / fullscreen buttons. */
export const NARROW_BUTTON_GUTTER_PX = 40;
const GF_RANKING_OVERLAY_MIN_WIDTH = 800;
const MIN_ANNOTATION_FONT_PX = 8;
const NARROW_LABEL_PADDING = { top: 2, bottom: 2, left: 4, right: 4 };

/** @param {number} width - host or chart width in CSS px; 0 (hidden) is not narrow */
export function isNarrowChartWidth(width) {
    return Number.isFinite(width) && width > 0 && width <= NARROW_CHART_MAX_WIDTH;
}

/** Where the GF tissue-ranking panel goes at this chart width. */
export function rankingPlacement(chartWidth) {
    if (chartWidth >= GF_RANKING_OVERLAY_MIN_WIDTH) return 'overlay';
    return isNarrowChartWidth(chartWidth) ? 'below' : 'hidden';
}

const isPlainObject = v => v !== null && typeof v === 'object' && !Array.isArray(v);

/** Overrides as [path, value-or-fn(original)] for the given options. */
function narrowOverrides(options) {
    const list = [
        [['layout', 'padding'], padding => (isPlainObject(padding)
            ? { ...padding, top: NARROW_BUTTON_GUTTER_PX }
            : Number.isFinite(padding)
                ? { top: NARROW_BUTTON_GUTTER_PX, right: padding, bottom: padding, left: padding }
                : { top: NARROW_BUTTON_GUTTER_PX })],
        [['plugins', 'legend', 'labels', 'boxWidth'], 14],
        [['plugins', 'legend', 'labels', 'padding'], 6],
        [['plugins', 'legend', 'labels', 'font', 'size'], 11],
    ];
    // Opt-in (plugins.narrowLayout.depthBand): one y axis. The depth profile stays as a background band.
    // The pressure axis keeps its side: Chart.js reads `position` before beforeUpdate, so moving it would lag.
    if (options.plugins?.narrowLayout?.depthBand && options.scales?.yDepth && options.scales?.yPressure) {
        list.push([['scales', 'yDepth', 'display'], false]);
        list.push([['scales', 'yPressure', 'grid', 'drawOnChartArea'], true]);
    }
    for (const id of Object.keys(options.scales ?? {})) {
        list.push([['scales', id, 'title', 'font', 'size'], 11]);
        list.push([['scales', id, 'ticks', 'font', 'size'], 10]);
    }
    const annotations = options.plugins?.annotation?.annotations;
    const shrink = size => Math.max(MIN_ANNOTATION_FONT_PX, size - 1);
    for (const [key, ann] of Object.entries(isPlainObject(annotations) || Array.isArray(annotations) ? annotations : {})) {
        if (!isPlainObject(ann)) continue;
        const base = ['plugins', 'annotation', 'annotations', key];
        for (const sub of [[], ['label']]) {
            const owner = sub.length ? ann.label : ann;
            if (!isPlainObject(owner)) continue;
            if (isPlainObject(owner.font) && Number.isFinite(owner.font.size)) {
                list.push([[...base, ...sub, 'font', 'size'], shrink]);
            }
            if (isPlainObject(owner.padding)) list.push([[...base, ...sub, 'padding'], { ...NARROW_LABEL_PADDING }]);
        }
    }
    return list;
}

/**
 * Walk to the parent of `path`; null if a non-plain value is in the way.
 * With `saved`, missing containers are created and recorded (`created: true`) so a restore can prune them.
 */
function parentOf(root, path, saved = null) {
    let node = root;
    for (let i = 0; i < path.length - 1; i++) {
        const key = path[i];
        if (node[key] === undefined) {
            if (!saved) return null;
            node[key] = {};
            saved.set(JSON.stringify(path.slice(0, i + 1)), { had: false, value: undefined, created: true });
        }
        if (!isPlainObject(node[key]) && !Array.isArray(node[key])) return null;
        node = node[key];
    }
    return node;
}

/**
 * Apply (narrow) or restore (wide) the narrow overrides on a Chart.js options object, in place.
 * @param {object} options - raw Chart.js options (chart.config.options)
 * @param {boolean} narrow
 * @param {Map<string, {had: boolean, value: *, created?: boolean}>} saved - originals and containers created on narrow (`created`), kept by the caller per options object
 */
export function applyNarrowOverrides(options, narrow, saved) {
    if (!narrow) {
        // newest first: leaves before the containers created for them
        for (const [key, { had, value, created }] of [...saved].reverse()) {
            const path = JSON.parse(key);
            const parent = parentOf(options, path);
            if (!parent) continue;
            const last = path.at(-1);
            if (had) parent[last] = value;
            else if (!created || Object.keys(parent[last] ?? {}).length === 0) delete parent[last];
        }
        saved.clear();
        return;
    }
    for (const [path, override] of narrowOverrides(options)) {
        const key = JSON.stringify(path);
        const parent = parentOf(options, path, saved);
        if (!parent) continue;
        const last = path.at(-1);
        if (!saved.has(key)) saved.set(key, { had: Object.hasOwn(parent, last), value: parent[last] });
        const original = saved.get(key).value;
        parent[last] = typeof override === 'function' ? override(original) : override;
    }
}

const savedByOptions = new WeakMap();

/** Chart.js inline plugin: narrow overrides by current chart width (re-evaluated on every update/resize). */
export const narrowChartPlugin = {
    id: 'narrowLayout',
    beforeUpdate(chart) {
        const options = chart.config?.options;
        if (!options) return;
        let saved = savedByOptions.get(options);
        if (!saved) {
            saved = new Map();
            savedByOptions.set(options, saved);
        }
        applyNarrowOverrides(options, isNarrowChartWidth(chart.width), saved);
    },
};

/** Toggle `chart-narrow` on a chart host from its current width. */
export function syncNarrowClass(host) {
    const narrow = isNarrowChartWidth(host.clientWidth);
    host.classList.toggle('chart-narrow', narrow);
    return narrow;
}
