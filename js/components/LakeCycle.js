/**
 * Průřez jezera během roku (kapitola P1 Hustota): pět vrstev s teplotou, vítr, strom, led
 * a klesání těžší vody. Vlastní SVG podle GIFu ze slidu 9, data z `js/physics/lakeCycle.js`.
 *
 * Dynamika je hlavní věc: přechody jsou plynulé, ať je vidět, jak se vrstvy mění. Při
 * `prefers-reduced-motion` se nic neanimuje, fáze se jen krokují.
 *
 * Kostra SVG se staví jen při změně velikosti, každý snímek mění jen atributy.
 */

import { LAKE_PHASES, lakeFrame, lakeTemperatureColor, lakeTextColor, mixColors, playPosition } from '../physics/lakeCycle.js';

const SVG_NS = 'http://www.w3.org/2000/svg';
const TWEEN_MS = 700;
const LAYERS = 5;
let uid = 0;

function el(name, attrs = {}, parent = null, text) {
    const n = document.createElementNS(SVG_NS, name);
    for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, String(v));
    if (text !== undefined) n.textContent = text;
    if (parent) parent.appendChild(n);
    return n;
}

const r1 = (v) => Math.round(v * 10) / 10;

/** Kresba stromu v jednotkách 0–100, základ kmene v (0, 0), nahoru je záporné y. */
const TREE = {
    trunk: 'M0 0 C2 -18 3 -36 6 -56',
    branches: ['M6 -56 C2 -66 -8 -74 -20 -80', 'M6 -56 C8 -68 10 -80 8 -94', 'M6 -56 C14 -62 24 -70 34 -74', 'M3 -34 C-4 -40 -12 -44 -20 -46'],
    crown: [[-18, -78, 13], [-4, -86, 14], [10, -92, 13], [24, -80, 14], [34, -70, 11], [8, -72, 14], [-10, -66, 11], [-22, -52, 10]],
    falling: [[40, -48], [28, -28], [48, -22], [-30, -30], [36, -8]],
    ground: [[-12, 0], [-4, 1], [6, 1], [14, 0], [22, 1], [30, 0]],
    buds: [[-20, -80], [8, -94], [34, -74], [-20, -46], [-8, -72], [18, -66]],
};

/**
 * @param {HTMLElement} host prvek s rozměry; SVG ho vyplní
 * @param {{compact?: boolean, phase?: number, onPhase?: (index: number) => void}} [options]
 *   `compact` = náhled: menší písmo, bez popisku klesání
 */
export function createLakeCycle(host, options = {}) {
    const compact = Boolean(options.compact);
    const onPhase = options.onPhase ?? (() => {});
    const id = `lake-${++uid}`;
    const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
    const svg = el('svg', { class: 'lake-cycle', role: 'img' });
    host.appendChild(svg);

    let pos = options.phase ?? 0;
    let shownPhase = -1;
    let refs = null;
    let raf = 0;
    let playing = false;
    let playStart = 0;
    let playFrom = 0;
    let tween = null;

    function cssTokens() {
        const css = getComputedStyle(host);
        const v = (name, fallback) => css.getPropertyValue(name).trim() || fallback;
        return {
            text: v('--text', '#2c3e50'),
            warm: v('--lake-wind-warm', '#c9301f'),
            cold: v('--lake-wind-cold', '#1670c0'),
            ground: v('--lake-ground', '#7d5a45'),
            trunk: v('--lake-trunk', '#c0752f'),
            leaf: v('--lake-leaf', '#3f9a4a'),
            ice: v('--lake-ice', '#f4fbff'),
            iceEdge: v('--lake-ice-edge', '#7d96a8'),
            iceText: v('--lake-ice-text', '#10202c'),
        };
    }

    function build() {
        const W = host.clientWidth;
        const H = host.clientHeight;
        if (!W || !H) { refs = null; return; }
        svg.setAttribute('width', W);
        svg.setAttribute('height', H);
        svg.setAttribute('viewBox', `0 0 ${W} ${H}`); // v tisku se zmenší na šířku papíru
        svg.replaceChildren();

        const c = cssTokens();
        const font = compact ? Math.max(11, Math.min(14, H / 15)) : Math.max(14, Math.min(22, H / 22));
        const y0 = Math.round(H * 0.34);
        const waterH = H - y0 - Math.max(6, H * 0.04);
        const bowlW = Math.min(W * 0.66, waterH * 3.2);
        const cx = W / 2;
        const x1 = cx - bowlW / 2;
        const x2 = cx + bowlW / 2;
        const band = waterH / LAYERS;

        // zem a miska
        el('rect', { x: 0, y: y0, width: W, height: H - y0, rx: 4, fill: c.ground }, svg);
        const bowl = `M${r1(x1)} ${y0} C${r1(x1)} ${r1(y0 + waterH * 0.82)} ${r1(x1 + bowlW * 0.3)} ${r1(y0 + waterH)} ${r1(cx)} ${r1(y0 + waterH)} `
            + `C${r1(x2 - bowlW * 0.3)} ${r1(y0 + waterH)} ${r1(x2)} ${r1(y0 + waterH * 0.82)} ${r1(x2)} ${y0} Z`;
        el('path', { d: bowl }, el('clipPath', { id: `${id}-bowl` }, el('defs', {}, svg)));
        const water = el('g', { 'clip-path': `url(#${id}-bowl)` }, svg);
        const bands = Array.from({ length: LAYERS }, (_, i) => el('rect', {
            x: r1(x1), y: r1(y0 + band * i), width: r1(bowlW), height: r1(band + 0.6),
        }, water));
        const tempFont = Math.max(compact ? 11 : 14, Math.min(band * 0.6, font * 1.15));
        const labels = Array.from({ length: LAYERS }, (_, i) => el('text', {
            x: r1(cx), y: r1(y0 + band * (i + 0.5) + tempFont * 0.35), 'text-anchor': 'middle',
            'font-size': r1(tempFont), 'font-weight': 600,
        }, svg));

        // klesání: krátké šipky v povrchové vrstvě, po stranách teploty
        const sinkGroup = el('g', { 'pointer-events': 'none' }, svg);
        const sinkLen = Math.max(8, band * 0.42);
        const sinkPaths = [-0.34, -0.2, 0.2, 0.34].map((dx) => {
            const x = r1(cx + bowlW * dx);
            const y = r1(y0 + band * 0.12);
            return el('path', {
                d: `M${x} ${y} v${r1(sinkLen)} m${r1(-sinkLen * 0.3)} ${r1(-sinkLen * 0.32)} l${r1(sinkLen * 0.3)} ${r1(sinkLen * 0.32)} l${r1(sinkLen * 0.3)} ${r1(-sinkLen * 0.32)}`,
                fill: 'none', 'stroke-width': compact ? 1.6 : 2.4, 'stroke-linecap': 'round', 'stroke-linejoin': 'round',
            }, sinkGroup);
        });
        const sinkLabel = compact ? null : el('text', {
            x: r1(cx), y: r1(y0 - font * 0.55), 'text-anchor': 'middle', 'font-size': r1(font), 'font-weight': 600, fill: c.text,
        }, svg, 'těžší voda klesá');

        // led: přirůstá od hladiny
        const iceThick = Math.max(compact ? 7 : 14, band * 0.34);
        const ice = el('rect', { x: r1(x1 - 2), y: y0 - 1, width: r1(bowlW + 4), height: 0, rx: 2, fill: c.ice, stroke: c.iceEdge, 'stroke-width': 1 }, svg);
        const iceLabel = compact ? null : el('text', {
            x: r1(cx), y: r1(y0 + iceThick * 0.5 + font * 0.28), 'text-anchor': 'middle', 'font-size': r1(font * 0.8), fill: c.iceText,
        }, svg, 'led');

        // vítr
        const arrowW = Math.min(compact ? W * 0.3 : W * 0.24, compact ? 110 : 240);
        const arrowX = Math.max(font * 0.4, x1 - arrowW * 0.55);
        const arrowY = r1(y0 * (compact ? 0.62 : 0.66));
        const shaft = Math.max(compact ? 5 : 8, y0 * 0.11);
        const head = shaft * 2.2;
        const arrow = el('path', {
            d: `M${r1(arrowX)} ${r1(arrowY - shaft / 2)} h${r1(arrowW - head)} v${r1(-(head - shaft) / 2)} l${r1(head)} ${r1(head / 2)} l${r1(-head)} ${r1(head / 2)} v${r1(-(head - shaft) / 2)} h${r1(-(arrowW - head))} Z`,
        }, svg);
        const windLabel = el('text', {
            x: r1(arrowX), y: r1(arrowY - head / 2 - font * 0.35), 'font-size': r1(font * (compact ? 0.95 : 0.9)), 'font-weight': 600, fill: c.text,
        }, svg);

        // strom na pravém břehu
        const treeScale = Math.min(y0 * 0.9, (W - x2) * 1.1) / 100;
        const tree = el('g', { transform: `translate(${r1(Math.min(x2 + (W - x2) * 0.5, W - 34 * treeScale - 4))} ${y0}) scale(${Math.round(treeScale * 1000) / 1000})` }, svg);
        const groundLeaves = el('g', {}, tree);
        TREE.ground.forEach(([x, y]) => el('ellipse', { cx: x, cy: y - 1, rx: 5, ry: 2.6, fill: c.leaf }, groundLeaves));
        el('path', { d: TREE.trunk, fill: 'none', stroke: c.trunk, 'stroke-width': 7, 'stroke-linecap': 'round' }, tree);
        TREE.branches.forEach(d => el('path', { d, fill: 'none', stroke: c.trunk, 'stroke-width': 4, 'stroke-linecap': 'round' }, tree));
        const snow = el('g', {}, tree);
        [TREE.trunk, ...TREE.branches].forEach(d => el('path', { d, fill: 'none', stroke: '#ffffff', 'stroke-width': 2.4, 'stroke-linecap': 'round' }, snow));
        const crown = el('g', {}, tree);
        TREE.crown.forEach(([x, y, r]) => el('circle', { cx: x, cy: y, r, fill: c.leaf }, crown));
        const falling = el('g', {}, tree);
        TREE.falling.forEach(([x, y]) => el('ellipse', { cx: x, cy: y, rx: 4, ry: 2.2, fill: c.leaf }, falling));
        const buds = el('g', {}, tree);
        TREE.buds.forEach(([x, y]) => el('circle', { cx: x, cy: y, r: 3.2, fill: c.leaf }, buds));

        refs = { c, y0, band, iceThick, bands, labels, sinkGroup, sinkPaths, sinkLabel, ice, iceLabel, arrow, windLabel, groundLeaves, snow, crown, falling, buds };
    }

    function paint() {
        const frame = lakeFrame(pos);
        if (refs) {
            const { c } = refs;
            frame.temps.forEach((t, i) => {
                const color = lakeTemperatureColor(t);
                refs.bands[i].setAttribute('fill', color);
                refs.labels[i].setAttribute('fill', lakeTextColor(color));
                refs.labels[i].textContent = `${Math.round(t)} °C`;
            });
            const iceH = frame.ice * refs.iceThick;
            refs.ice.setAttribute('height', r1(iceH + 1));
            refs.ice.setAttribute('opacity', frame.ice > 0 ? 1 : 0);
            if (refs.iceLabel) refs.iceLabel.setAttribute('opacity', frame.ice > 0.7 ? 1 : 0);
            // Led roste od hladiny, popisek první vrstvy před ním uhýbá dolů.
            refs.labels[0].setAttribute('transform', `translate(0 ${r1(iceH * 0.5)})`);
            refs.arrow.setAttribute('fill', mixColors(c.cold, c.warm, frame.warm));
            refs.windLabel.textContent = frame.warm >= 0.5 ? 'teplý vítr' : 'studený vítr';
            const sink = frame.sinking;
            refs.sinkGroup.setAttribute('opacity', r1(sink * 10) / 10);
            refs.sinkGroup.setAttribute('transform', `translate(0 ${r1(frame.progress * refs.band * 0.34)})`);
            const sinkColor = lakeTextColor(lakeTemperatureColor(frame.temps[0]));
            refs.sinkPaths.forEach(p => p.setAttribute('stroke', sinkColor));
            if (refs.sinkLabel) refs.sinkLabel.setAttribute('opacity', r1(sink * 10) / 10);
            refs.crown.setAttribute('opacity', frame.tree.crown);
            refs.falling.setAttribute('opacity', frame.tree.falling);
            refs.falling.setAttribute('transform', `translate(${r1(frame.progress * 6)} ${r1(frame.progress * 10)})`);
            refs.snow.setAttribute('opacity', frame.tree.snow);
            refs.buds.setAttribute('opacity', frame.tree.buds);
            refs.groundLeaves.setAttribute('opacity', frame.groundLeaves);
        }
        if (frame.phase !== shownPhase) {
            shownPhase = frame.phase;
            const p = LAKE_PHASES[shownPhase];
            svg.setAttribute('aria-label', `Průřez jezera, fáze ${shownPhase + 1} z ${LAKE_PHASES.length}, ${p.label}: `
                + `teploty od hladiny ke dnu ${p.temps.join(', ')} °C${p.ice ? ', na hladině led' : ''}.`);
            onPhase(shownPhase);
        }
    }

    function loop(now) {
        raf = 0;
        if (tween) {
            const x = Math.min(1, (now - tween.start) / TWEEN_MS);
            pos = tween.from + (tween.to - tween.from) * x;
            if (x >= 1) { pos = tween.to; tween = null; }
        } else if (playing) {
            if (!playStart) playStart = now;
            pos = playPosition(now - playStart, playFrom);
        }
        paint();
        if (tween || playing) raf = requestAnimationFrame(loop);
    }
    const kick = () => { if (!raf) raf = requestAnimationFrame(loop); };

    const ro = new ResizeObserver(() => { build(); paint(); });
    ro.observe(host);
    build();
    paint();

    return {
        /** Tichá animace je pro `prefers-reduced-motion` vypnutá. */
        canPlay: !reduced,
        isPlaying: () => playing,
        /** Přehrává od aktuální fáze. */
        play() {
            if (reduced || playing) return;
            tween = null;
            playing = true;
            playStart = 0;
            playFrom = lakeFrame(pos).phase;
            pos = playFrom;
            kick();
        },
        pause() {
            playing = false;
            if (!tween) pos = lakeFrame(pos).phase;
            cancelAnimationFrame(raf);
            raf = 0;
            paint();
        },
        /**
         * @param {number} index fáze (0 = fáze 1)
         * @param {{animate?: boolean}} [o] plynule přejít (mimo reduced-motion)
         */
        setPhase(index, { animate = false } = {}) {
            playing = false;
            if (animate && !reduced) {
                tween = { from: pos, to: index, start: performance.now() };
                kick();
            } else {
                tween = null;
                pos = index;
                paint();
            }
        },
        getPhase: () => lakeFrame(pos).phase,
        redraw() { build(); paint(); },
        destroy() { cancelAnimationFrame(raf); ro.disconnect(); svg.remove(); },
    };
}
