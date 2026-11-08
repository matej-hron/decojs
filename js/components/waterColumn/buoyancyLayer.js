/**
 * Vrstva „potápěč a vztlak“ vodního sloupce (kurz P1, kapitola Archimédův zákon, model A1 „Potápěč a vztlak“, slide 36).
 *
 * Ve sloupci v hloubce ukazatele je potápěč jako plná silueta. Tloušťka siluety roste s objemem obleku (oblek se
 * s hloubkou stlačuje, potápěč „hubne“), vak BC na zádech má plochu úměrnou objemu vzduchu v BC. Výsledná síla je
 * jedna bloková šipka nahoru nebo dolů s popiskem v kilogramech („chybí 4,4 kg / klesá“). Zbytek potápěče (tělo,
 * výstroj, zátěž) se nestlačuje a je vyvážený (rozhodnutí Mateje 2), proto se nekreslí jako zvláštní objem.
 * V panelu vedle sloupce je křivka „vztlak navíc [kg]“ podle hloubky pro současné množství vzduchu v BC: vyvážený je
 * potápěč jen tam, kde křivka protne nulu.
 *
 * Stav (docs/course/water-column.md §4), soukromé klíče vrstvy:
 * - `diverBcAir`: vzduch v BC v bar · l (objem × tlak), při přesunu se nemění;
 * - `diverStep`: index posledního kroku scénáře (zapisuje model, vrstva ho jen předává dál).
 * Výpočet: js/physics/buoyancy.js (školní čísla). Barvy dat: CSS `--wc-diver` (silueta), `--wc-diver-edge` (obrys
 * lahve), `--wc-diver-bc` (vzduch v BC, jako plyn v B1), `--wc-diver-force` a `--wc-diver-force-edge` (šipka síly),
 * `--wc-diver-ink` (text na pruhu v panelu).
 */

import { svgEl, fmtCs, niceTicks, haloAttrs, clamp, placeBarLabel } from '../WaterColumn.js';
import { A1_DIVER, buildScenario, diverState, netBuoyancy, schoolPressure } from '../../physics/buoyancy.js';

const NBSP = '\u00a0';

/** Pod touto hodnotou (kg) model píše „vznáší se“: popisky jsou na desetiny. */
export const FLOAT_TOLERANCE = 0.05;

/**
 * Kilogramy na desetiny, bez znaménka („4,4“).
 * @param {number} kg
 * @returns {string}
 */
export function formatKg(kg) {
    return fmtCs(Math.round(Math.abs(kg) * 10) / 10, 1);
}

/**
 * Litry na desetiny bez „,0“ (7,6; 12; 0).
 * @param {number} litres
 * @returns {string}
 */
export function formatVolume(litres) {
    const v = Math.round(litres * 10) / 10;
    return fmtCs(v, Number.isInteger(v) ? 0 : 1);
}

/**
 * Výsledná síla slovy: co se děje a o kolik. Na hladině potápěč výš nevystoupá: s vyrovnaným vztlakem je
 * „vyvážený“, s přebytkem „plave“ (slide 31; analýza §3, krok 10: na hladině chce plavat).
 * @param {number} net vztlak navíc (kg), kladný = přebývá
 * @param {number} [depth] m
 * @returns {{state: 'sink'|'float'|'rise', amount: string, verb: string}} amount je prázdný, když je vyvážený
 */
export function netLabel(net, depth = 1) {
    const surface = depth <= 0;
    if (Math.abs(net) < FLOAT_TOLERANCE) return { state: 'float', amount: '', verb: surface ? 'vyvážený' : 'vznáší se' };
    const kg = `${formatKg(net)}${NBSP}kg`;
    return net < 0
        ? { state: 'sink', amount: `chybí ${kg}`, verb: 'klesá' }
        : { state: 'rise', amount: `přebývá ${kg}`, verb: surface ? 'plave' : 'stoupá' };
}

/**
 * Tlak do odečtu: celé bary bez desetin, jinak na desetiny (2; 1,5).
 * @param {number} bar
 * @returns {string}
 */
function formatBar(bar) {
    const v = Math.round(bar * 10) / 10;
    return fmtCs(v, Number.isInteger(v) ? 0 : 1);
}

/**
 * Odečet vrstvy (HTML): „p = 2 bar · oblek 7,6 l · BC 4,4 l · chybí 4,4 kg, klesá“.
 * @param {number} depth m
 * @param {number} amount vzduch v BC (bar · l)
 * @param {import('../../physics/buoyancy.js').Diver} [diver]
 * @returns {string}
 */
export function diverReadout(depth, amount, diver = A1_DIVER) {
    const html = (s) => s.replaceAll(NBSP, '&nbsp;');
    const st = diverState(depth, amount, diver);
    const label = netLabel(st.net, depth);
    const result = label.amount ? `${html(label.amount)}, ${label.verb}` : label.verb;
    return [
        `<var>p</var> = ${formatBar(schoolPressure(depth))}&nbsp;bar`,
        `oblek ${formatVolume(st.suit)}&nbsp;l`,
        `BC ${formatVolume(st.bc)}&nbsp;l`,
        `<strong class="wc-diver-result">${result}</strong>`,
    ].join(' · ');
}

/**
 * Rozsah osy „vztlak navíc [kg]“: ze všech množství vzduchu ve scénáři a všech hloubek sloupce, na celé pětky.
 * Osa se pak mezi kroky nemění, takže jdou křivky porovnat. Ruční přifouknutí mimo scénář se ořízne.
 * @param {number[]} amounts bar · l
 * @param {number} maxDepth m
 * @param {import('../../physics/buoyancy.js').Diver} [diver]
 * @returns {{min: number, max: number}} kg, min ≤ 0 ≤ max
 */
export function netAxisRange(amounts, maxDepth, diver = A1_DIVER) {
    let min = 0;
    let max = 0;
    for (const amount of amounts) {
        for (const d of [0, maxDepth]) {
            const net = netBuoyancy(d, amount, diver);
            min = Math.min(min, net);
            max = Math.max(max, net);
        }
    }
    const up5 = (x) => Math.ceil(x / 5 - 1e-9) * 5;
    return { min: -up5(-min), max: up5(max) };
}

/**
 * Tloušťka siluety (trup) podle objemu obleku v jednotkách u (délka potápěče je asi 10,7 u). Malá část tloušťky
 * je tělo, zbytek oblek, aby bylo stlačení vidět: 12 l → 2 u, 7,6 l → 1,34 u, 6,2 l → 1,13 u. Potápěč není
 * v měřítku.
 * @param {number} suitVolume l
 * @returns {number} u
 */
export function suitThickness(suitVolume) {
    return 0.2 + 0.15 * Math.max(0, suitVolume);
}

/**
 * Poloosy vaku BC v jednotkách u: plocha elipsy je úměrná objemu vzduchu (10 l → 3 × 1,5 u).
 * @param {number} bcVolume l
 * @returns {{rx: number, ry: number}}
 */
export function bcRadii(bcVolume) {
    const s = Math.sqrt(Math.max(0, bcVolume) / 10);
    return { rx: 3 * s, ry: 1.5 * s };
}

/** Největší délka potápěče v em; výška nad osou trupu se vejde do místa nad hladinou (A1_HEADROOM_EM). */
export const DIVER_MAX_LENGTH_EM = 13;

/**
 * Délka šipky síly v jednotkách u: úměrná výsledné síle, nejvýš 4,5 u (u 4,4 kg je to 4 u, u 2,9 kg 2,6 u).
 * @param {number} net kg
 * @returns {number} u
 */
export function forceLength(net) {
    return Math.min(4.5, 0.9 * Math.abs(net));
}

function readDataColors(el) {
    const cs = getComputedStyle(el);
    const v = (name, fallback) => cs.getPropertyValue(name).trim() || fallback;
    return {
        body: v('--wc-diver', '#0d3550'),
        edge: v('--wc-diver-edge', '#8fc0dd'),
        bc: v('--wc-diver-bc', '#d6336c'),
        force: v('--wc-diver-force', '#ffd98a'),
        forceEdge: v('--wc-diver-force-edge', '#0d3550'),
        ink: v('--wc-diver-ink', '#3a0d1a'),
    };
}

/**
 * Bloková šipka (jako `fig-force` ve stylu ilustrací): svislá, od `y0` délky `len` nahoru (dir −1) nebo dolů (+1).
 * @returns {string} body polygonu
 */
export function forceArrowPoints(cx, y0, len, dir, width) {
    const shaft = width / 2;
    const headW = width;
    const headL = Math.min(len * 0.55, width * 1.2);
    const y1 = y0 + dir * (len - headL);
    const y2 = y0 + dir * len;
    const pts = [
        [cx - shaft, y0], [cx - shaft, y1], [cx - headW, y1], [cx, y2], [cx + headW, y1], [cx + shaft, y1], [cx + shaft, y0],
    ];
    return pts.map(([x, y]) => `${Math.round(x * 10) / 10},${Math.round(y * 10) / 10}`).join(' ');
}

/**
 * Potápěč vodorovně, hlavou doprava, osa trupu v `cy`. Vrací horní a dolní okraj kresby (px).
 */
function drawDiver(g, { cx, cy, u, suit, bc, data }) {
    const T = suitThickness(suit) * u;
    const EDGE = clamp(0.15 * u, 1.5, 3); // světlý obrys, ať je tmavá silueta vidět i nad vodou
    const outline = svgEl('g', { class: 'wc-diver-outline' }, g);
    const limb = (d, w) => {
        const common = { d, fill: 'none', 'stroke-linecap': 'round', 'stroke-linejoin': 'round' };
        svgEl('path', { ...common, stroke: data.edge, 'stroke-width': w + 2 * EDGE }, outline);
        return svgEl('path', { ...common, class: 'wc-diver-limb', stroke: data.body, 'stroke-width': w }, g);
    };
    const P = (x, y) => `${Math.round((cx + x * u) * 10) / 10},${Math.round((cy + y * u) * 10) / 10}`;

    // lahev na zádech (neutrální, nestlačuje se)
    const backY = cy - T / 2;
    const tankH = 0.8 * u;
    svgEl('rect', {
        class: 'wc-diver-tank', x: cx - 1.6 * u, y: backY - tankH * 0.85, width: 3 * u, height: tankH, rx: tankH / 2,
        fill: data.body, stroke: data.edge, 'stroke-width': 1.5,
    }, g);
    // vak BC na zádech přes lahev: plocha úměrná objemu vzduchu
    const { rx, ry } = bcRadii(bc);
    if (rx * u > 1) {
        svgEl('ellipse', {
            class: 'wc-diver-bc', cx: cx - 0.2 * u, cy: backY - 0.45 * ry * u, rx: rx * u, ry: ry * u,
            fill: data.bc, stroke: data.body, 'stroke-width': 1.5,
        }, g);
    }
    // nohy a ploutve
    limb(`M${P(-1.8, 0)} L${P(-3.4, 0.35)} L${P(-4.8, 0.1)}`, 0.62 * T);
    const fin = `M${P(-4.6, -0.25)} L${P(-6.6, -0.45)} L${P(-6.6, 0.75)} L${P(-4.6, 0.45)} Z`;
    svgEl('path', { d: fin, fill: data.edge, stroke: data.edge, 'stroke-width': 2 + 2 * EDGE, 'stroke-linejoin': 'round' }, outline);
    svgEl('path', { class: 'wc-diver-fin', d: fin, fill: data.body, stroke: data.body, 'stroke-width': 2, 'stroke-linejoin': 'round' }, g);
    // trup
    limb(`M${P(-1.9, 0)} L${P(2.1, 0)}`, T);
    // paže dopředu pod hlavou
    limb(`M${P(1.8, 0.15)} L${P(3, 0.75)} L${P(4.1, 0.55)}`, 0.5 * T);
    // hlava
    const head = { cx: cx + 3.05 * u, cy: cy - 0.15 * u, r: Math.max(0.55 * u, 0.4 * T) };
    svgEl('circle', { ...head, r: head.r + EDGE, fill: data.edge }, outline);
    svgEl('circle', { class: 'wc-diver-head', ...head, fill: data.body }, g);

    const top = Math.min(backY - tankH * 0.85, backY - 1.45 * ry * u);
    const bottom = cy + Math.max(T / 2, 0.75 * u) + 0.4 * T;
    return { top, bottom };
}

/**
 * @param {Object} [options]
 * @param {import('../../physics/buoyancy.js').Diver} [options.diver]
 * @param {import('../../physics/buoyancy.js').ScenarioStep[]} [options.scenario] kroky (kvůli rozsahu osy panelu)
 * @param {string} [options.id='diver']
 * @returns {import('../WaterColumn.js').Layer}
 */
export function createBuoyancyLayer({ diver = A1_DIVER, scenario = buildScenario(undefined, diver), id = 'diver' } = {}) {
    const amountOf = (state) => (state.diverBcAir >= 0 ? state.diverBcAir : 0);
    const amounts = scenario.map((s) => s.amount);
    let uid = id;

    return {
        id,
        aside: true,
        zIndex: 10,

        init(ctx) {
            uid = ctx.uid;
            if (!(ctx.getState().diverBcAir >= 0)) ctx.setState({ diverBcAir: 0 });
        },

        render(g, geom, state) {
            const { colors, fontSize: fs, column: c } = geom;
            const data = readDataColors(g.ownerSVGElement ?? g);
            const amount = amountOf(state);
            const st = diverState(state.depth, amount, diver);
            const depthY = geom.depthToY(state.depth);
            // potápěč vlevo od středu, ať nezakryje úchop ukazatele na pravém okraji sloupce
            const cx = c.x + 0.42 * c.w;
            const length = Math.min(0.8 * c.w, 0.45 * c.h, DIVER_MAX_LENGTH_EM * fs);
            const u = length / 11.2; // od špičky ploutví (−6,6 u) po ruce (+4,1 u), s okrajem
            const body = drawDiver(g, { cx: cx + 1.25 * u, cy: depthY, u, suit: st.suit, bc: st.bc, data });

            // výsledná síla: jedna šipka a popisek v kg
            const label = netLabel(st.net, state.depth);
            const lineH = 1.15 * fs;
            const lines = label.amount ? [label.amount, label.verb] : [label.verb];
            const textBlock = lines.length * lineH;
            const textAttrs = { 'text-anchor': 'middle', 'font-weight': 700, ...haloAttrs(colors, fs) };
            const labelX = clamp(cx, c.x + 0.5 * Math.min(c.w, 7 * fs), c.x + c.w - 0.5 * Math.min(c.w, 7 * fs));
            let textTop;
            if (label.state === 'float') {
                textTop = body.bottom + 0.3 * fs;
            } else {
                const dir = label.state === 'rise' ? -1 : 1;
                const start = dir < 0 ? body.top - 0.2 * u : body.bottom + 0.1 * u;
                // šipka i popisek se musí vejít do SVG
                const room = dir < 0 ? start - textBlock - 0.3 * fs : geom.height - start - textBlock - 0.3 * fs;
                const len = clamp(forceLength(st.net) * u, Math.min(1.2 * u, Math.max(0, room)), Math.max(0, room));
                if (len > 2) {
                    svgEl('polygon', {
                        class: 'wc-diver-force', points: forceArrowPoints(cx, start, len, dir, 0.9 * u),
                        fill: data.force, stroke: data.forceEdge, 'stroke-width': 2, 'stroke-linejoin': 'round',
                    }, g);
                }
                const tip = start + dir * len;
                textTop = dir < 0 ? tip - 0.2 * fs - textBlock : tip + 0.2 * fs;
            }
            textTop = clamp(textTop, 0, geom.height - textBlock);
            lines.forEach((line, i) => {
                svgEl('text', {
                    class: 'wc-diver-label', x: labelX, y: textTop + (i + 0.8) * lineH, ...textAttrs, text: line,
                }, g);
            });

            const p = geom.aside;
            if (!p) return;
            drawPanel(g, { geom, state, p, amount, net: st.net, depthY, data, uid, range: netAxisRange(amounts, state.maxDepth, diver), diver });
        },

        readout(state) {
            return diverReadout(state.depth, amountOf(state), diver);
        },
    };
}

/** Panel „vztlak navíc [kg]“: nulová čára, křivka pro současný vzduch v BC, pruh v hloubce ukazatele. */
function drawPanel(g, { geom, state, p, amount, net, depthY, data, uid, range, diver }) {
    const { colors, fontSize: fs } = geom;
    const lo = Math.min(range.min, 0);
    const hi = Math.max(range.max, 0);
    const xOf = (kg) => p.x + ((clamp(kg, lo, hi) - lo) / (hi - lo)) * p.w;
    const yTop = geom.depthToY(0);
    const yBottom = geom.depthToY(state.maxDepth);
    const x0 = xOf(0);

    // svislá mřížka a vodorovná osa
    const step = p.w / fs < 9 ? 10 : 5;
    for (const kg of niceTicks(lo, hi, Math.max(2, Math.round((hi - lo) / step)))) {
        const x = xOf(kg);
        svgEl('line', { x1: x, x2: x, y1: yTop, y2: yBottom, stroke: colors.border, 'stroke-width': 1 }, g);
        svgEl('text', {
            x, y: p.y + p.h + 1.25 * fs, 'text-anchor': 'middle', fill: colors.text, text: fmtCs(kg, 0),
        }, g);
    }
    svgEl('text', {
        x: p.x + p.w / 2, y: p.y + p.h + 2.75 * fs, 'text-anchor': 'middle', fill: colors.text, text: 'vztlak navíc [kg]',
    }, g);

    // křivka: vztlak navíc v každé hloubce se současným vzduchem v BC (oříznutá do panelu)
    const clipId = `${uid}-clip`;
    const defs = svgEl('defs', {}, g);
    const clip = svgEl('clipPath', { id: clipId }, defs);
    svgEl('rect', { x: p.x, y: yTop - 2, width: p.w, height: yBottom - yTop + 4 }, clip);
    const pts = [];
    const steps = Math.max(20, Math.round(state.maxDepth * 4));
    for (let i = 0; i <= steps; i++) {
        const d = (state.maxDepth * i) / steps;
        const kg = netBuoyancy(d, amount, diver);
        const x = p.x + ((kg - lo) / (hi - lo)) * p.w;
        pts.push(`${Math.round(x * 10) / 10},${Math.round(geom.depthToY(d) * 10) / 10}`);
    }
    const curves = svgEl('g', { 'clip-path': `url(#${clipId})` }, g);
    svgEl('polygon', {
        class: 'wc-diver-area', points: `${x0},${yTop} ${pts.join(' ')} ${x0},${yBottom}`, fill: data.bc, 'fill-opacity': 0.18,
    }, curves);
    svgEl('polyline', { class: 'wc-diver-curve', points: pts.join(' '), fill: 'none', stroke: data.bc, 'stroke-width': 2.5 }, curves);
    // nula: tady se potápěč vznáší
    svgEl('line', { class: 'wc-diver-zero', x1: x0, x2: x0, y1: yTop, y2: yBottom, stroke: colors.text, 'stroke-width': 2 }, g);

    // pruh v hloubce ukazatele od nuly k výsledné síle
    const barH = Math.round(1.3 * fs);
    const barY = Math.min(Math.max(depthY - barH / 2, yTop - barH / 2), yBottom - barH / 2);
    const xNow = xOf(net);
    if (Math.abs(net) >= FLOAT_TOLERANCE) {
        svgEl('rect', {
            class: 'wc-diver-bar', x: Math.min(x0, xNow), y: barY, width: Math.abs(xNow - x0), height: barH, fill: data.bc,
        }, g);
    } else {
        svgEl('circle', { class: 'wc-diver-dot', cx: x0, cy: depthY, r: Math.round(0.35 * fs), fill: data.bc, stroke: colors.text, 'stroke-width': 1.5 }, g);
    }
    const text = `${net > 0 && Math.abs(net) >= FLOAT_TOLERANCE ? '+' : ''}${Math.abs(net) < FLOAT_TOLERANCE ? '0' : fmtCs(Math.round(net * 10) / 10, 1)}${NBSP}kg`;
    const short = text.replace(`${NBSP}kg`, '');
    let lab;
    if (net >= 0) {
        lab = placeBarLabel({ x0, x1: Math.max(xNow, x0 + 0.4 * fs), right: p.x + p.w - 0.3 * fs, fs, labels: [text, short] });
    } else {
        // záporný pruh vede doleva: popisek vlevo za pruhem, jinak vpravo od nuly
        const width = text.length * 0.6 * fs;
        lab = xNow - 0.4 * fs - width >= p.x
            ? { text, x: xNow - 0.4 * fs, anchor: 'end', inside: false }
            : { text, x: x0 + 0.4 * fs, anchor: 'start', inside: false };
    }
    svgEl('text', {
        class: 'wc-diver-bar-label', x: lab.x, y: barY + barH / 2, dy: '0.35em', 'text-anchor': lab.anchor, 'font-weight': 600,
        ...(lab.inside ? { fill: data.ink } : haloAttrs(colors, fs)), text: lab.text,
    }, g);
}
