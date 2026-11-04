/**
 * Průřez modelového lomu během roku (kapitola P1 Hustota): vrstvy v měřítku hloubky s teplotou,
 * teplota vzduchu, vítr, strom, led a klesání těžší vody. Vlastní SVG, data z `js/physics/lakeCycle.js`.
 *
 * Měsíce se posouvají klikem, aby autor stihl vykládat. Přechod je plynulý, ať je vidět, jak se
 * vrstvy mění. Při `prefers-reduced-motion` se nic neanimuje.
 *
 * Kostra SVG se staví jen při změně velikosti, každý snímek mění jen atributy.
 */

import {
    LAKE_BANDS, LAKE_DEPTHS, LAKE_MAX_DEPTH, LAKE_MONTHS, formatAirTemperature, lakeFrame, lakeTemperatureColor,
    lakeTextColor, mixColors,
} from '../physics/lakeCycle.js';

const SVG_NS = 'http://www.w3.org/2000/svg';
const TWEEN_MS = 700;
let uid = 0;

function el(name, attrs = {}, parent = null, text) {
    const n = document.createElementNS(SVG_NS, name);
    for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, String(v));
    if (text !== undefined) n.textContent = text;
    if (parent) parent.appendChild(n);
    return n;
}

const r1 = (v) => Math.round(v * 10) / 10;
const easeInOut = (x) => (x < 0.5 ? 2 * x * x : 1 - ((-2 * x + 2) ** 2) / 2);

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
 * @param {{compact?: boolean, month?: number}} [options]
 *   `compact` = náhled: menší písmo, bez názvu osy a bez popisku klesání; `month` = index (0 = leden)
 */
export function createLakeCycle(host, options = {}) {
    const compact = Boolean(options.compact);
    const id = `lake-${++uid}`;
    const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
    const svg = el('svg', { class: 'lake-cycle', role: 'img' });
    host.appendChild(svg);

    let month = options.month ?? 0; // cílový měsíc (index)
    let pos = month;
    let refs = null;
    let raf = 0;
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
        const font = compact ? Math.max(10, Math.min(13, H / 16)) : Math.max(14, Math.min(22, H / 22));
        const y0 = Math.round(H * 0.3);
        const waterH = H - y0 - Math.max(6, H * 0.04);
        const bowlW = Math.min(W * 0.64, waterH * 3.2);
        const cx = W / 2;
        const x1 = cx - bowlW / 2;
        const x2 = cx + bowlW / 2;
        const depthY = (d) => y0 + (d / LAKE_MAX_DEPTH) * waterH;

        // zem a miska lomu
        el('rect', { x: 0, y: y0, width: W, height: H - y0, rx: 4, fill: c.ground }, svg);
        const bowl = `M${r1(x1)} ${y0} C${r1(x1)} ${r1(y0 + waterH * 0.82)} ${r1(x1 + bowlW * 0.3)} ${r1(y0 + waterH)} ${r1(cx)} ${r1(y0 + waterH)} `
            + `C${r1(x2 - bowlW * 0.3)} ${r1(y0 + waterH)} ${r1(x2)} ${r1(y0 + waterH * 0.82)} ${r1(x2)} ${y0} Z`;
        el('path', { d: bowl }, el('clipPath', { id: `${id}-bowl` }, el('defs', {}, svg)));
        const water = el('g', { 'clip-path': `url(#${id}-bowl)` }, svg);
        const bands = LAKE_BANDS.map(([from, to]) => el('rect', {
            x: r1(x1), y: r1(depthY(from)), width: r1(bowlW), height: r1(depthY(to) - depthY(from) + 0.6),
        }, water));

        // svislá osa hloubky na levém břehu
        const axisX = r1(x1 - font * 0.9);
        el('line', { x1: axisX, x2: axisX, y1: y0, y2: r1(depthY(LAKE_MAX_DEPTH)), stroke: '#ffffff', 'stroke-opacity': 0.7 }, svg);
        const axisFont = r1(compact ? font * 0.9 : font * 0.85);
        for (const d of LAKE_DEPTHS) {
            const y = r1(depthY(d));
            el('line', { x1: axisX, x2: r1(axisX + font * 0.4), y1: y, y2: y, stroke: '#ffffff', 'stroke-opacity': 0.7 }, svg);
            el('text', {
                x: r1(axisX - font * 0.3), y: r1(Math.min(y + axisFont * 0.35, H - 2)), 'text-anchor': 'end', 'font-size': axisFont, fill: '#ffffff',
            }, svg, String(d));
        }
        if (!compact) {
            const ty = r1(y0 + waterH / 2);
            const tx = r1(Math.max(font, axisX - font * 2.6));
            el('text', {
                transform: `translate(${tx} ${ty}) rotate(-90)`, 'text-anchor': 'middle', 'font-size': axisFont, fill: '#ffffff',
            }, svg, 'hloubka [m]');
        }

        // Teplota je v pásu, v tenkém horním pásu menším písmem. Jen v náhledu, kde by bylo
        // nečitelné, jde popisek na pravý břeh na úroveň pásu.
        const tempFont = Math.max(compact ? 10 : 14, Math.min(font * 1.1, 24));
        const minInside = compact ? 10 : 12;
        const labels = LAKE_BANDS.map(([from, to]) => {
            const bandH = depthY(to) - depthY(from);
            const fit = Math.min(tempFont, bandH * 0.8);
            const outside = fit < minInside;
            const size = outside ? tempFont : fit;
            const y = (depthY(from) + depthY(to)) / 2 + size * 0.35;
            const node = el('text', {
                x: r1(outside ? x2 + font * 0.5 : cx), y: r1(outside ? Math.max(y, y0 + size * 0.95) : y),
                'text-anchor': outside ? 'start' : 'middle', 'font-size': r1(size), 'font-weight': 600,
            }, svg);
            return { node, outside };
        });

        // klesání: krátké šipky od hladiny, po stranách teploty
        const sinkGroup = el('g', { 'pointer-events': 'none' }, svg);
        const surfaceH = depthY(LAKE_BANDS[0][1]) - y0;
        const sinkLen = Math.max(10, surfaceH * 0.9);
        const sinkStep = Math.max(4, surfaceH * 0.34);
        const sinkPaths = [-0.34, -0.2, 0.2, 0.34].map((dx) => {
            const x = r1(cx + bowlW * dx);
            return el('path', {
                d: `M${x} ${y0 + 2} v${r1(sinkLen)} m${r1(-sinkLen * 0.3)} ${r1(-sinkLen * 0.32)} l${r1(sinkLen * 0.3)} ${r1(sinkLen * 0.32)} l${r1(sinkLen * 0.3)} ${r1(-sinkLen * 0.32)}`,
                fill: 'none', 'stroke-width': compact ? 1.6 : 2.4, 'stroke-linecap': 'round', 'stroke-linejoin': 'round',
            }, sinkGroup);
        });
        const sinkLabel = compact ? null : el('text', {
            x: r1(cx), y: r1(y0 - font * 0.5), 'text-anchor': 'middle', 'font-size': r1(font), 'font-weight': 600, fill: c.text,
        }, svg, 'těžší voda klesá');

        // led: přirůstá kolem hladiny (z větší části nad ní, ať nezakryje teplotu), popisek nad ním
        const iceThick = compact ? 4 : Math.min(surfaceH * 0.5, 10);
        const ice = el('rect', { x: r1(x1 - 2), y: y0 - 1, width: r1(bowlW + 4), height: 0, rx: 2, fill: c.ice, stroke: c.iceEdge, 'stroke-width': 1 }, svg);
        const iceLabel = compact ? null : el('text', {
            x: r1(cx), y: r1(y0 - iceThick * 0.6 - font * 0.3), 'text-anchor': 'middle', 'font-size': r1(font * 0.85), fill: c.text,
        }, svg, 'led');

        // teplota vzduchu nad hladinou
        const air = el('text', {
            x: r1(cx), y: r1(y0 * (compact ? 0.42 : 0.44)), 'text-anchor': 'middle', 'font-size': r1(font * (compact ? 1.05 : 1.3)), 'font-weight': 600, fill: c.text,
        }, svg);

        // vítr
        const arrowW = Math.min(compact ? W * 0.2 : W * 0.2, compact ? 90 : 220);
        const arrowX = Math.max(font * 0.4, x1 - arrowW * 0.75);
        const arrowY = r1(y0 * 0.68);
        const shaft = Math.max(compact ? 4 : 7, y0 * 0.1);
        const head = shaft * 2.2;
        const arrow = el('path', {
            d: `M${r1(arrowX)} ${r1(arrowY - shaft / 2)} h${r1(arrowW - head)} v${r1(-(head - shaft) / 2)} l${r1(head)} ${r1(head / 2)} l${r1(-head)} ${r1(head / 2)} v${r1(-(head - shaft) / 2)} h${r1(-(arrowW - head))} Z`,
        }, svg);
        const windLabel = el('text', {
            x: r1(arrowX), y: r1(arrowY - head / 2 - font * 0.35), 'font-size': r1(font * 0.9), 'font-weight': 600, fill: c.text,
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

        refs = { c, y0, iceThick, sinkStep, bands, labels, sinkGroup, sinkPaths, sinkLabel, ice, iceLabel, air, arrow, windLabel, groundLeaves, snow, crown, falling, buds };
    }

    function describe() {
        const m = LAKE_MONTHS[month];
        svg.setAttribute('aria-label', `Průřez modelového lomu, ${m.name}: ${m.label}. ${formatAirTemperature(m.air)}, `
            + `teploty vody od hladiny ke dnu ${m.temps.join(', ')} °C.`);
    }

    function paint() {
        const frame = lakeFrame(pos);
        if (!refs) return;
        const { c } = refs;
        frame.temps.forEach((t, i) => {
            const color = lakeTemperatureColor(t);
            refs.bands[i].setAttribute('fill', color);
            const { node, outside } = refs.labels[i];
            node.setAttribute('fill', outside ? '#ffffff' : lakeTextColor(color));
            node.textContent = `${Math.round(t)} °C`;
        });
        const iceH = frame.ice * refs.iceThick;
        refs.ice.setAttribute('y', r1(refs.y0 - iceH * 0.6));
        refs.ice.setAttribute('height', r1(iceH));
        refs.ice.setAttribute('opacity', frame.ice > 0 ? 1 : 0);
        if (refs.iceLabel) refs.iceLabel.setAttribute('opacity', frame.ice > 0.7 ? 1 : 0);
        // Led roste od hladiny, popisek první vrstvy (je-li v ní) před ním uhýbá dolů.
        if (!refs.labels[0].outside) refs.labels[0].node.setAttribute('transform', `translate(0 ${r1(iceH * 0.2)})`);
        refs.air.textContent = formatAirTemperature(frame.air);
        refs.arrow.setAttribute('fill', mixColors(c.cold, c.warm, frame.warm));
        refs.windLabel.textContent = frame.warm >= 0.5 ? 'teplý vítr' : 'studený vítr';
        // Klesání jen při kroku dopředu, v obráceném kroku ne.
        const sink = tween?.forward ? frame.sinking : 0;
        refs.sinkGroup.setAttribute('opacity', r1(sink * 10) / 10);
        refs.sinkGroup.setAttribute('transform', `translate(0 ${r1(frame.progress * refs.sinkStep)})`);
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

    function loop(now) {
        raf = 0;
        if (tween) {
            if (!tween.start) tween.start = now;
            const x = Math.min(1, (now - tween.start) / TWEEN_MS);
            pos = tween.from + (tween.to - tween.from) * easeInOut(x);
            if (x >= 1) { pos = month; tween = null; }
        }
        paint();
        if (tween) raf = requestAnimationFrame(loop);
    }

    /** Přejde na měsíc: plynule, nebo rovnou (reduced motion, předvolba). */
    function goTo(index, target, { animate, forward }) {
        month = index;
        describe();
        if (animate && !reduced) {
            tween = { from: pos, to: target, start: 0, forward };
            if (!raf) raf = requestAnimationFrame(loop);
        } else {
            cancelAnimationFrame(raf);
            raf = 0;
            tween = null;
            pos = index;
            paint();
        }
    }

    const ro = new ResizeObserver(() => { build(); paint(); });
    ro.observe(host);
    build();
    describe();
    paint();

    return {
        /**
         * Posun o měsíc, dokola. Rychlé klikání navazuje na rozběhlý přechod.
         * @param {1|-1} dir
         */
        step(dir) {
            const n = LAKE_MONTHS.length;
            const base = tween ? tween.to : pos;
            goTo((month + dir + n) % n, base + dir, { animate: true, forward: dir > 0 });
        },
        /**
         * Přímý skok na měsíc.
         * @param {number} index (0 = leden)
         * @param {{animate?: boolean}} [o]
         */
        setMonth(index, { animate = false } = {}) {
            const n = LAKE_MONTHS.length;
            pos = ((pos % n) + n) % n;
            goTo(index, index, { animate, forward: false });
        },
        getMonth: () => month,
        redraw() { build(); paint(); },
        destroy() { cancelAnimationFrame(raf); ro.disconnect(); svg.remove(); },
    };
}
