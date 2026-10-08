/**
 * Touch readout: a compact value strip above a chart, replacing the floating Chart.js tooltip on
 * touch screens, where the tooltip covers most of a phone-sized plot and cannot be dismissed.
 *
 * Opt-in: only charts created with `touchReadout: true` build it (today the dive log, see
 * js/components/RecordedDiveAnalysis.js). It is active only while `(pointer: coarse)` matches,
 * so a narrow desktop window keeps its tooltip and the T shortcut.
 *
 * While active:
 *  - the chart's tooltip is off and the strip shows the values at the touched time / point,
 *  - the canvas has `touch-action: pan-y` (css/styles.css, `.chart-readout-on`): vertical swipes scroll the page (the browser cancels
 *    the pointer and the readout reverts), taps and horizontal drags move the readout,
 *  - tapping the same spot again, tapping outside the chart or the ✕ button clears it.
 * The touched spot is kept in data coordinates and re-resolved on every draw, so it survives the
 * chart rebuilds that GF / view / time changes trigger.
 *
 * The pure formatters below are unit-tested (tests/chart-touch-readout.test.mjs).
 */

import { translate } from '../i18n.js';
import { fmtNum } from '../format.js';
import { theme } from './chartTheme.js';

export const TOUCH_READOUT_MEDIA = '(pointer: coarse)';
/** A tap this close (CSS px) to the current marker clears the readout instead of moving it. */
const TAP_AGAIN_PX = 24;
/** Horizontal movement (CSS px) after which a gesture is a drag, not a tap. */
const DRAG_PX = 6;
/** P-P / GF: a point farther than this (CSS px) from the finger is not read. */
const POINT_REACH_PX = 40;
/** Tissues view lists at most this many compartments, then "+n". */
const MAX_TISSUES = 3;
const NB = ' ';

/** True when the primary pointer is coarse (a finger). False outside a browser. */
export function touchReadoutMatches(win = globalThis) {
    try {
        return Boolean(win.matchMedia?.(TOUCH_READOUT_MEDIA)?.matches);
    } catch {
        return false;
    }
}

/** Minutes → `m:ss` (dive time as dive computers show it). */
export function readoutTime(minutes) {
    const total = Math.max(0, Math.round(minutes * 60));
    return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
}

/** Index of the time point closest to `t` in an ascending array; -1 when empty. */
export function nearestIndex(times, t) {
    if (!times?.length) return -1;
    let lo = 0;
    let hi = times.length - 1;
    while (hi - lo > 1) {
        const mid = (lo + hi) >> 1;
        if (times[mid] <= t) lo = mid; else hi = mid;
    }
    return Math.abs(times[hi] - t) < Math.abs(times[lo] - t) ? hi : lo;
}

/** Which profile-chart view the options describe (the dive log's five view presets). */
export function profileReadoutView(options) {
    if (options.showGasConsumption) return 'gas';
    if (options.showTissueLoading) return 'tissue';
    if (options.showPartialPressures) return 'pp';
    if (options.showAmbientPressure) return 'pressure';
    return 'profile';
}

const r = (key, fallback, t) => t(`chart.readout.${key}`, fallback);
const unit = (value, decimals, u, lang) => `${fmtNum(value, decimals, lang)}${NB}${u}`;

/**
 * A segment is `{label?, sym?, sub?, value}`: an upright label (GF, ceiling) or a quantity symbol
 * with subscript (rendered as <var>p</var><sub>amb</sub>), followed by its value.
 */
export function segmentText(seg) {
    const name = seg.sym ? `${seg.sym}${seg.sub ?? ''}` : seg.label ?? '';
    return [name, seg.value].filter(Boolean).join(' ');
}

/** Lines of segments → plain text, segments joined by " · ", lines by "\n". */
export function readoutText(lines) {
    return lines.map(line => line.map(segmentText).join(' · ')).join('\n');
}

const pAmbSeg = (pAmb, lang, t) => ({ sym: 'p', sub: r('subAmb', 'amb', t), value: unit(pAmb, 2, 'bar', lang) });

/** Ceiling segment; null when the view computes no ceiling. */
function ceilingSeg(ceiling, lang, t) {
    if (ceiling == null) return null;
    return ceiling > 0.05
        ? { label: r('ceiling', 'ceiling', t), value: unit(ceiling, 1, 'm', lang) }
        : { label: r('noCeiling', 'no ceiling', t) };
}

/**
 * Readout lines for the dive-profile chart at one time point.
 *
 * @param {'profile'|'pressure'|'pp'|'tissue'|'gas'} view
 * @param {{t: number, depth: number, gas: string, ceiling?: number|null, deviceCeiling?: number|null,
 *   gf?: {value: number, compartment: number}|null, pAmb?: number, pO2?: number, pN2?: number,
 *   tissues?: Array<{id: number, p: number}>, rate?: number|null, cylinders?: Array<{name: string, bar: number}>}} s
 *   Times in minutes, depths in m, pressures in bar, GF as a fraction.
 * @param {{lang?: string, t?: Function}} [opts] - language for numbers, translate function
 * @returns {Array<Array<Object>>} two lines of segments
 */
export function profileReadoutLines(view, s, { lang, t = translate } = {}) {
    const line1 = [{ value: readoutTime(s.t) }, { value: unit(s.depth, 1, 'm', lang) }];
    if (s.gas) line1.push({ value: s.gas });
    const line2 = [];
    switch (view) {
        case 'pressure':
            line2.push(pAmbSeg(s.pAmb, lang, t), ceilingSeg(s.ceiling, lang, t));
            break;
        case 'pp':
            line2.push({ sym: 'p', sub: 'O₂', value: unit(s.pO2, 2, 'bar', lang) },
                { sym: 'p', sub: 'N₂', value: unit(s.pN2, 2, 'bar', lang) });
            break;
        case 'tissue': {
            const tissues = s.tissues ?? [];
            line2.push(pAmbSeg(s.pAmb, lang, t),
                ...tissues.slice(0, MAX_TISSUES).map(c => ({ label: `TC${c.id}`, value: unit(c.p, 2, 'bar', lang) })));
            if (tissues.length > MAX_TISSUES) line2.push({ value: `+${tissues.length - MAX_TISSUES}` });
            break;
        }
        case 'gas':
            if (s.rate > 0) line2.push({ label: r('use', 'use', t), value: unit(s.rate, 1, 'L/min', lang) });
            for (const c of s.cylinders ?? []) line2.push({ label: c.name, value: unit(Math.round(c.bar), 0, 'bar', lang) });
            break;
        default:
            line2.push(ceilingSeg(s.ceiling, lang, t));
            if (s.deviceCeiling > 0.05) {
                line2.push({ label: r('computer', 'computer', t), value: unit(s.deviceCeiling, 1, 'm', lang) });
            }
            if (s.gf) line2.push({ label: 'GF', value: `${unit(s.gf.value * 100, 0, '%', lang)} (TC${s.gf.compartment})` });
    }
    return [line1, line2.filter(Boolean)];
}

/**
 * Readout lines for one point of the P-P (`mvalue`) or GF chart — the values their tooltip shows.
 * @param {'mvalue'|'gf'} kind
 * @param {{label: string, pAmb: number, y: number}} p - y is tissue pressure (bar) or GF (%)
 */
export function pointReadoutLines(kind, p, { lang, t = translate } = {}) {
    const value = kind === 'gf'
        ? { label: 'GF', value: unit(p.y, 0, '%', lang) }
        : { sym: 'p', sub: r('subTissue', 't', t), value: unit(p.y, 2, 'bar', lang) };
    return [[{ value: p.label }], [pAmbSeg(p.pAmb, lang, t), value]];
}

/** Shown when a P-P / GF touch is not near any drawn point. */
export function noPointLines({ t = translate } = {}) {
    return [[{ label: r('noPoint', 'No point here: touch a line or a dot', t) }]];
}

/**
 * The visible drawn point of a P-P / GF chart nearest to a data-space anchor, within `reachPx`.
 * Only points inside the plot area count, so clipped helper points never win.
 * @returns {{label: string, pAmb: number, y: number, marker: {x: number, y: number, r: number}}|null}
 */
export function nearestChartPoint(chart, anchor, reachPx = POINT_REACH_PX) {
    const { x: xs, y: ys } = chart.scales ?? {};
    const area = chart.chartArea;
    if (!xs || !ys || !area) return null;
    const px = xs.getPixelForValue(anchor.x);
    const py = ys.getPixelForValue(anchor.y);
    let best = null;
    chart.data.datasets.forEach((dataset, di) => {
        if (!chart.isDatasetVisible(di)) return;
        chart.getDatasetMeta(di).data.forEach((el, i) => {
            const point = dataset.data?.[i];
            if (!point || !Number.isFinite(point.x) || !Number.isFinite(point.y) || el.skip) return;
            if (el.x < area.left || el.x > area.right || el.y < area.top || el.y > area.bottom) return;
            const d = Math.hypot(el.x - px, el.y - py);
            if (d <= reachPx && (!best || d < best.d)) best = { d, label: dataset.label ?? '', point, el };
        });
    });
    const r = Math.max(7, (best?.el.options?.radius ?? 0) + 4); // ring just outside the dot
    return best && { label: best.label, pAmb: best.point.x, y: best.point.y, marker: { x: best.el.x, y: best.el.y, r } };
}

/** Append one line of segments to `el` as DOM (no innerHTML: labels may come from dive files). */
function renderLine(el, segments) {
    const doc = el.ownerDocument;
    segments.forEach((seg, i) => {
        if (i > 0) {
            const sep = doc.createElement('span');
            sep.className = 'chart-readout-sep';
            sep.setAttribute('aria-hidden', 'true');
            sep.textContent = ' · ';
            el.append(sep);
        }
        const span = doc.createElement('span');
        span.className = 'chart-readout-seg';
        if (seg.sym) {
            const v = doc.createElement('var');
            v.textContent = seg.sym;
            const sub = doc.createElement('sub');
            sub.textContent = seg.sub ?? '';
            span.append(v, sub);
        } else if (seg.label) {
            span.append(seg.label);
        }
        if (seg.value) span.append(span.childNodes.length ? ` ${seg.value}` : seg.value);
        el.append(span);
    });
}

/**
 * The strip + gesture handling for one chart.
 *
 * `resolve(chart, anchor)` turns the touched spot (data coordinates `{x, y}` on the chart's `x` and
 * `y` scales; `time` mode uses only `x`) into `{lines, marker}` or null. The marker is in canvas
 * pixels: `{x, points?: [{x, y, color}]}` (a crosshair with dots) in `time` mode, `{x, y}` (a ring) in `point` mode.
 */
export class TouchReadout {
    /**
     * @param {Object} o
     * @param {HTMLElement} o.host - chart host; a tap outside it clears the readout
     * @param {HTMLElement} o.before - the strip is inserted right before this element
     * @param {HTMLCanvasElement} o.canvas
     * @param {() => Object|null} o.getChart - current Chart.js instance
     * @param {'time'|'point'} o.mode
     * @param {(chart: Object, anchor: {x: number, y: number}) => ({lines: Array, marker: Object}|null)} o.resolve
     */
    constructor({ host, before, canvas, getChart, mode, resolve }) {
        Object.assign(this, { host, canvas, getChart, mode, resolve });
        this.anchor = null;
        this.marker = null;
        this.gesture = null;
        this._shownKey = null;

        const doc = canvas.ownerDocument;
        this.el = doc.createElement('div');
        this.el.className = 'chart-readout';
        this.el.hidden = true;
        this.textEl = doc.createElement('div');
        this.textEl.className = 'chart-readout-text';
        this.clearBtn = doc.createElement('button');
        this.clearBtn.type = 'button';
        this.clearBtn.className = 'chart-readout-clear';
        this.clearBtn.textContent = '✕';
        this.clearBtn.addEventListener('click', () => this.clear());
        this.el.append(this.textEl, this.clearBtn);
        before.before(this.el);

        this._onDown = e => this._pointerDown(e);
        this._onMove = e => this._pointerMove(e);
        this._onUp = () => this._pointerUp();
        this._onCancel = () => this._pointerCancel();
        this._onDocDown = e => {
            if (this.anchor && !this.host.contains(e.target)) this.clear();
        };
        canvas.addEventListener('pointerdown', this._onDown);
        canvas.addEventListener('pointermove', this._onMove);
        canvas.addEventListener('pointerup', this._onUp);
        canvas.addEventListener('pointercancel', this._onCancel);
        doc.addEventListener('pointerdown', this._onDocDown, true);

        const self = this;
        /** Inline Chart.js plugin: draws the marker and refreshes the strip after each draw. */
        this.plugin = {
            id: 'touchReadout',
            afterDatasetsDraw(chart) { self._draw(chart); },
        };
        this.sync();
    }

    /** Re-check the media query; show or hide the strip. Returns whether the readout is active. */
    sync() {
        this.active = touchReadoutMatches(this.canvas.ownerDocument.defaultView ?? globalThis);
        this.el.hidden = !this.active;
        this.host.classList.toggle('chart-readout-on', this.active);
        if (!this.active) this.anchor = null;
        this.clearBtn.setAttribute('aria-label', translate('chart.readout.clear', 'Clear readout'));
        this.clearBtn.title = this.clearBtn.getAttribute('aria-label');
        this._shownKey = null; // language may have changed: the next draw re-renders the text
        if (!this.anchor) this._show(null);
        return this.active;
    }

    clear() {
        this.anchor = null;
        this.gesture = null;
        this._redraw();
    }

    _anchorAt(e, clampX) {
        const chart = this.getChart();
        const area = chart?.chartArea;
        if (!area) return null;
        const rect = this.canvas.getBoundingClientRect();
        let px = e.clientX - rect.left;
        const py = e.clientY - rect.top;
        if (!clampX && (px < area.left || px > area.right || py < area.top || py > area.bottom)) return null;
        px = Math.min(area.right, Math.max(area.left, px));
        const y = chart.scales.y?.getValueForPixel(Math.min(area.bottom, Math.max(area.top, py)));
        return { anchor: { x: chart.scales.x.getValueForPixel(px), y }, px, py };
    }

    _pointerDown(e) {
        if (!this.active || (e.button ?? 0) !== 0) return;
        const hit = this._anchorAt(e, false);
        if (!hit) return;
        const m = this.marker;
        const near = this.anchor && m && (this.mode === 'time'
            ? Math.abs(hit.px - m.x) <= TAP_AGAIN_PX
            : Math.hypot(hit.px - m.x, hit.py - (m.y ?? hit.py)) <= TAP_AGAIN_PX);
        this.gesture = { prev: this.anchor, startX: hit.px, moved: false, tapAgain: Boolean(near) };
        if (!near) {
            this.anchor = hit.anchor;
            this._redraw();
        }
    }

    _pointerMove(e) {
        if (!this.gesture) return;
        const hit = this._anchorAt(e, true);
        if (!hit) return;
        if (!this.gesture.moved && Math.abs(hit.px - this.gesture.startX) < DRAG_PX) return;
        this.gesture.moved = true;
        this.anchor = hit.anchor;
        this._redraw();
    }

    _pointerUp() {
        const g = this.gesture;
        this.gesture = null;
        if (g?.tapAgain && !g.moved) this.clear();
    }

    /** The browser took the gesture over (vertical scroll): undo what it changed. */
    _pointerCancel() {
        const g = this.gesture;
        this.gesture = null;
        if (!g) return;
        this.anchor = g.prev;
        this._redraw();
    }

    _redraw() {
        const chart = this.getChart();
        if (chart) chart.draw(); else this._show(null);
    }

    _draw(chart) {
        if (!this.active || !this.anchor) {
            this.marker = null;
            this._show(null);
            return;
        }
        const res = this.resolve(chart, this.anchor);
        this.marker = res?.marker ?? null;
        this._show(res?.lines ?? null);
        if (!this.marker) return;
        const { ctx, chartArea: area } = chart;
        const color = theme().colors.text;
        ctx.save();
        ctx.strokeStyle = color;
        if (this.mode === 'time') {
            ctx.globalAlpha = 0.55;
            ctx.lineWidth = 1;
            ctx.setLineDash([4, 3]);
            ctx.beginPath();
            ctx.moveTo(this.marker.x, area.top);
            ctx.lineTo(this.marker.x, area.bottom);
            ctx.stroke();
            ctx.globalAlpha = 1;
            ctx.setLineDash([]);
            ctx.lineWidth = 2;
            ctx.strokeStyle = theme().colors.surface;
            for (const p of this.marker.points ?? []) {
                if (p.y < area.top || p.y > area.bottom) continue;
                ctx.fillStyle = p.color;
                ctx.beginPath();
                ctx.arc(p.x, p.y, 4, 0, Math.PI * 2);
                ctx.fill();
                ctx.stroke();
            }
        } else {
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.arc(this.marker.x, this.marker.y, this.marker.r ?? 7, 0, Math.PI * 2);
            ctx.stroke();
        }
        ctx.restore();
    }

    _show(lines) {
        const key = lines ? readoutText(lines) : '';
        if (key === this._shownKey) return;
        this._shownKey = key;
        this.textEl.replaceChildren();
        this.clearBtn.hidden = !lines;
        this.el.classList.toggle('chart-readout-empty', !lines);
        if (!lines) {
            this.textEl.textContent = translate('chart.readout.hint', 'Touch the chart to read its values');
            return;
        }
        for (const line of lines) {
            const div = this.canvas.ownerDocument.createElement('div');
            div.className = 'chart-readout-line';
            renderLine(div, line);
            this.textEl.append(div);
        }
    }

    destroy() {
        const doc = this.canvas.ownerDocument;
        this.canvas.removeEventListener('pointerdown', this._onDown);
        this.canvas.removeEventListener('pointermove', this._onMove);
        this.canvas.removeEventListener('pointerup', this._onUp);
        this.canvas.removeEventListener('pointercancel', this._onCancel);
        doc.removeEventListener('pointerdown', this._onDocDown, true);
        this.el.remove();
    }
}
