/**
 * Graf hustoty vody v závislosti na teplotě (kapitola P1 Hustota, model 1).
 *
 * SVG v pixelových souřadnicích (ResizeObserver) — písmo má stálou velikost na mobilu
 * i projektoru a graf nepotřebuje CDN (offline na přednášce). Křivka z
 * `js/physics/waterDensity.js`, bod v aktuální teplotě, svislá značka maxima (≈ 4 °C).
 * Pod 0 °C je voda led — bod zmizí a graf to napíše (led ~917 kg/m³ by ležel daleko
 * pod osou; skok ukazuje odečet u modelu).
 */

import { fmtNum } from '../format.js';
import { waterDensity, MAX_DENSITY_TEMPERATURE } from '../physics/waterDensity.js';

const SVG_NS = 'http://www.w3.org/2000/svg';

/** Číslo pro zobrazení v češtině, se skutečným znakem minus. */
const fmt = (v, d) => fmtNum(v, d, 'cs').replace('-', '−');

/**
 * „Hezké“ dílky osy.
 * @param {number} min
 * @param {number} max
 * @param {number} target přibližný počet dílků
 * @returns {{step: number, ticks: number[], decimals: number}}
 */
export function niceTicks(min, max, target = 5) {
    const raw = (max - min) / Math.max(1, target);
    const mag = 10 ** Math.floor(Math.log10(raw));
    const step = [1, 2, 2.5, 5, 10].map(f => f * mag).find(s => s >= raw) ?? 10 * mag;
    const first = Math.ceil(min / step - 1e-9) * step;
    const ticks = [];
    for (let v = first; v <= max + step * 1e-6; v += step) ticks.push(Math.round(v / step) * step + 0); // + 0: bez −0
    const decimals = Math.max(0, -Math.floor(Math.log10(step) + 1e-9) + (step / mag === 2.5 ? 1 : 0));
    return { step, ticks, decimals };
}

/**
 * Rozsah osy hustoty pro daný teplotní rozsah (kapalná voda), zaokrouhlený na dílky.
 * @param {[number, number]} tRange
 * @returns {{min: number, max: number, step: number, ticks: number[], decimals: number}}
 */
export function densityAxis(tRange) {
    const [t0, t1] = tRange;
    let lo = Infinity, hi = -Infinity;
    for (let t = t0; t <= t1 + 1e-9; t += (t1 - t0) / 200) {
        const r = waterDensity(Math.min(t, t1));
        lo = Math.min(lo, r); hi = Math.max(hi, r);
    }
    const margin = (hi - lo) * 0.05; // křivka se nedotkne okraje grafu
    const { step, decimals } = niceTicks(lo - margin, hi + margin, 5);
    const min = Math.floor((lo - margin) / step) * step;
    const max = Math.ceil((hi + margin) / step - 1e-9) * step;
    const ticks = [];
    for (let i = 0; min + i * step <= max + step * 1e-6; i++) ticks.push(Math.round((min + i * step) / step) * step);
    return { min, max, step, ticks, decimals };
}

function el(name, attrs = {}, text) {
    const n = document.createElementNS(SVG_NS, name);
    for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, String(v));
    if (text !== undefined) n.textContent = text;
    return n;
}

const cssVar = (name, fallback) =>
    getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback;

/**
 * @param {HTMLElement} host
 * @param {{range?: [number, number], temperature?: number}} [options]
 */
export function createDensityCurve(host, options = {}) {
    let range = options.range ?? [0, 10];
    let temperature = options.temperature ?? 4;
    const svg = el('svg', { class: 'density-curve', role: 'img' });
    host.appendChild(svg);

    function draw() {
        const width = host.clientWidth;
        const height = host.clientHeight;
        if (!width || !height) return;
        svg.setAttribute('width', width);
        svg.setAttribute('height', height);
        svg.replaceChildren();

        const font = Math.max(14, Math.min(20, width / 45));
        const c = {
            text: cssVar('--text', '#2c3e50'),
            muted: cssVar('--text-subtle', '#7f8c8d'),
            grid: cssVar('--border', '#dce1e6'),
            line: cssVar('--blue-500', '#2980b9'),
            accent: cssVar('--red-500', '#e74c3c'),
            max: cssVar('--amber-500', '#f39c12'),
        };
        const axis = densityAxis(range);
        const yLabelW = font * 4.2;
        const pad = { left: yLabelW + font * 1.6, right: font, top: font * 1.2, bottom: font * 3.4 };
        const plot = { x: pad.left, y: pad.top, w: width - pad.left - pad.right, h: height - pad.top - pad.bottom };
        const X = t => plot.x + ((t - range[0]) / (range[1] - range[0])) * plot.w;
        const Y = r => plot.y + (1 - (r - axis.min) / (axis.max - axis.min)) * plot.h;
        const r1 = v => Math.round(v * 10) / 10;

        svg.setAttribute('aria-label',
            `Graf hustoty vody pro teplotu ${fmt(range[0], 0)} až ${fmt(range[1], 0)}\u00a0°C; největší hustota při 4\u00a0°C.`);

        // mřížka + popisky osy hustoty
        for (const v of axis.ticks) {
            svg.appendChild(el('line', { x1: plot.x, x2: plot.x + plot.w, y1: r1(Y(v)), y2: r1(Y(v)), stroke: c.grid }));
            svg.appendChild(el('text', { x: plot.x - font * 0.4, y: r1(Y(v) + font * 0.35), 'text-anchor': 'end',
                'font-size': font * 0.85, fill: c.muted }, fmt(v, axis.decimals)));
        }
        const tx = niceTicks(range[0], range[1], range[1] - range[0] <= 10 ? 10 : 6);
        for (const v of tx.ticks) {
            svg.appendChild(el('line', { x1: r1(X(v)), x2: r1(X(v)), y1: plot.y, y2: plot.y + plot.h, stroke: c.grid }));
            svg.appendChild(el('text', { x: r1(X(v)), y: plot.y + plot.h + font * 1.2, 'text-anchor': 'middle',
                'font-size': font * 0.85, fill: c.muted }, fmt(v, 0)));
        }
        svg.appendChild(el('text', { x: plot.x + plot.w / 2, y: height - font * 0.5, 'text-anchor': 'middle',
            'font-size': font, fill: c.text }, 'teplota / °C'));
        const yTitle = el('text', { transform: `translate(${r1(font * 1.1)} ${r1(plot.y + plot.h / 2)}) rotate(-90)`,
            'text-anchor': 'middle', 'font-size': font, fill: c.text });
        yTitle.append('hustota ');
        yTitle.appendChild(el('tspan', { 'font-style': 'italic' }, 'ρ'));
        yTitle.append(' / (kg/m³)');
        svg.appendChild(yTitle);

        // značka maxima
        const xm = r1(X(MAX_DENSITY_TEMPERATURE));
        svg.appendChild(el('line', { x1: xm, x2: xm, y1: plot.y, y2: plot.y + plot.h, stroke: c.max,
            'stroke-width': 2, 'stroke-dasharray': '6 5' }));
        svg.appendChild(el('text', { x: xm + font * 0.4, y: plot.y + plot.h - font * 0.6, 'font-size': font * 0.85,
            fill: c.text }, 'největší hustota (4\u00a0°C)'));

        // křivka
        const pts = [];
        const n = Math.max(60, Math.round(plot.w / 4));
        for (let i = 0; i <= n; i++) {
            const t = range[0] + (i / n) * (range[1] - range[0]);
            pts.push(`${r1(X(t))},${r1(Y(waterDensity(t)))}`);
        }
        svg.appendChild(el('polyline', { points: pts.join(' '), fill: 'none', stroke: c.line, 'stroke-width': 3,
            'stroke-linejoin': 'round' }));

        // bod v aktuální teplotě
        if (temperature < 0) {
            svg.appendChild(el('text', { x: plot.x + font * 0.5, y: plot.y + font * 1.2, 'font-size': font,
                fill: c.accent, 'font-weight': 600 }, `${fmt(temperature, Number.isInteger(temperature) ? 0 : 1)}\u00a0°C: led, mimo graf`));
        } else if (temperature >= range[0] && temperature <= range[1]) {
            const cx = r1(X(temperature)), cy = r1(Y(waterDensity(temperature)));
            svg.appendChild(el('line', { x1: cx, x2: cx, y1: cy, y2: plot.y + plot.h, stroke: c.accent,
                'stroke-width': 1.5, 'stroke-dasharray': '3 4' }));
            svg.appendChild(el('circle', { cx, cy, r: Math.max(6, font * 0.45), fill: c.accent,
                stroke: cssVar('--surface-elevated', '#fff'), 'stroke-width': 2 }));
        }
    }

    const ro = new ResizeObserver(draw);
    ro.observe(host);
    const mo = new MutationObserver(draw);
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });

    return {
        /** @param {number} t teplota ve °C */
        setTemperature(t) { temperature = t; draw(); },
        /** @param {[number, number]} r rozsah osy teploty */
        setRange(r) { range = r; draw(); },
        getRange: () => range,
        redraw: draw,
        destroy() { ro.disconnect(); mo.disconnect(); svg.remove(); },
    };
}
