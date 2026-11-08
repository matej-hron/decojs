/**
 * Vrstva „potápěč a vztlak“ vodního sloupce (kurz P1, kapitola Archimédův zákon, model A1 „Potápěč a vztlak“, slide 36).
 *
 * Ve sloupci v hloubce ukazatele je potápěč jako plná silueta. Tloušťka siluety roste s objemem obleku (oblek se
 * s hloubkou stlačuje, potápěč „hubne“), vak BCD kolem lahve je vidět vždy, prázdný jako tenký pruh, s vzduchem roste.
 * Výsledná síla je jedna bloková šipka nahoru nebo dolů s popiskem v kilogramech („chybí 4,4 kg / klesá“), popisek
 * nikdy neleží přes hladinu (`placeForce`). Zbytek potápěče (tělo,
 * výstroj, zátěž) se nestlačuje a je vyvážený (rozhodnutí Mateje 2), proto se nekreslí jako zvláštní objem.
 * V panelu vedle sloupce je křivka „vztlak navíc [kg]“ podle hloubky pro současné množství vzduchu v BCD: vyvážený je
 * potápěč jen tam, kde křivka protne nulu.
 *
 * Stav (docs/course/water-column.md §4), soukromé klíče vrstvy:
 * - `diverBcAir`: vzduch v BCD v bar · l (objem × tlak), při přesunu se nemění;
 * - `diverStep`: index posledního kroku scénáře (zapisuje model, vrstva ho jen předává dál).
 * Výpočet: js/physics/buoyancy.js (školní čísla). Barvy dat: CSS `--wc-diver` (silueta), `--wc-diver-edge` (obrys
 * lahve), `--wc-diver-bc` (jen vzduch v BCD, jako plyn v B1), `--wc-diver-force` a `--wc-diver-force-edge` (šipka síly
 * a stejnou barvou křivka, plocha a pruh v panelu: jedna veličina, jedna barva), `--wc-diver-ink` (text na pruhu).
 */

import { svgEl, fmtCs, niceTicks, haloAttrs, clamp, placeBarLabel, computeGeometry } from '../WaterColumn.js';
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
 * Odečet vrstvy (HTML): „p = 2 bar · oblek 7,6 l · BCD 4,4 l · chybí 4,4 kg, klesá“.
 * @param {number} depth m
 * @param {number} amount vzduch v BCD (bar · l)
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
        `BCD ${formatVolume(st.bc)}&nbsp;l`,
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
 * Vak BCD na zádech v jednotkách u (R7-06): kreslí se vždy, prázdný jako tenký splasklý pruh přes lahev, s vzduchem
 * roste do šířky i do výšky jako vesta, ne jako balónek. Plocha nad lahví roste s objemem vzduchu.
 * @param {number} bcVolume l
 * @returns {{w: number, h: number, empty: boolean}} šířka a výška nad lahví (u)
 */
export function bcShape(bcVolume) {
    const v = Math.max(0, bcVolume);
    return { w: 3.4 + 0.12 * v, h: 0.22 + 0.13 * v, empty: v < 0.05 };
}

/** Výška lahve v u; lahev leží na zádech a z 85 % nad osou zad. */
const TANK_H = 0.8;

/**
 * Jak vysoko nad osu trupu sahá potápěč (lahev a vak), v u: o tolik vyčnívá nad vodu, když je na hladině.
 * @param {number} suitVolume l
 * @param {number} bcVolume l
 * @returns {number} u
 */
export function diverTopOffset(suitVolume, bcVolume) {
    return suitThickness(suitVolume) / 2 + 0.85 * TANK_H + bcShape(bcVolume).h;
}

/** Největší délka potápěče v em; místo nad hladinou počítá surfaceHeadroom. */
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

/** O kolik em smí popisek vedle šipky přesahovat sloupec doprava. */
const OVERHANG = 0.6;

/** Šířka popisku v px (odhad pro tučné písmo: 0,58 em na znak). */
export function labelWidth(lines, fs) {
    return Math.max(...lines.map((l) => l.length)) * 0.58 * fs;
}

/**
 * Písmo popisku síly: na úzkém sloupci, kam se popisek nevejde, o krok menší (R7-03).
 * @returns {number} px
 */
export function labelFontSize(lines, fs, columnWidth) {
    return labelWidth(lines, fs) + 0.4 * fs > columnWidth ? 0.85 * fs : fs;
}

/**
 * Kde je šipka výsledné síly a její popisek (R7-03, R7-04). Dolů: popisek pod špičkou. Nahoru: popisek nad
 * špičkou, ale nikdy přes hladinu: když by ji křížil, posune se celý nad ni, a když tam není místo, celý pod ni
 * (šipka se zkrátí). Když nad potápěčem není místo na šipku i popisek (na hladině), stojí popisek vedle šipky.
 * @param {Object} p
 * @param {1|-1} p.dir dolů / nahoru
 * @param {number} p.start y začátku šipky (px)
 * @param {number} p.wanted délka šipky podle síly (px)
 * @param {number} p.u jednotka kresby potápěče (px)
 * @param {number} p.fs písmo (px)
 * @param {string[]} p.lines řádky popisku
 * @param {number} p.cx osa šipky (px)
 * @param {{x: number, w: number}} p.col sloupec
 * @param {number} p.surfaceY y hladiny
 * @param {number} p.height výška SVG
 * @returns {{len: number, top: number, x: number, anchor: 'middle'|'start'|'end', fs: number, lineH: number}}
 */
export function placeForce({ dir, start, wanted, u, fs, lines, cx, col, surfaceY, height }) {
    const lfs = labelFontSize(lines, fs, col.w);
    const lineH = 1.15 * lfs;
    const block = lines.length * lineH;
    const w = labelWidth(lines, lfs);
    const gap = 0.2 * lfs;
    const edge = 0.1 * fs;
    const minLen = 1.2 * u;
    const out = (len, top, x = clamp(cx, col.x + w / 2, col.x + col.w - w / 2), anchor = 'middle') => (
        { len: Math.max(0, len), top, x, anchor, fs: lfs, lineH });
    const crosses = (top) => top < surfaceY && top + block > surfaceY;

    if (dir > 0) {
        const room = Math.max(0, height - start - gap - block - edge);
        const len = clamp(wanted, Math.min(minLen, room), room);
        return out(len, start + len + gap);
    }
    // nahoru, popisek nad špičkou (když se nad ni vejde aspoň šipka 2,5 u)
    const stacked = (room) => {
        const len = Math.min(wanted, room);
        const top = start - len - gap - block;
        if (!crosses(top)) return out(len, top);
        const above = surfaceY - gap - block; // celý nad hladinu
        if (above >= edge) return out(len, above);
        const below = start - surfaceY - 2 * gap - block; // celý pod hladinu, šipka kratší
        return below >= minLen ? out(Math.min(len, below), surfaceY + gap) : null;
    };
    const stackRoom = start - gap - block - edge;
    if (stackRoom >= Math.max(minLen, Math.min(wanted, 2.5 * u))) {
        const p = stacked(stackRoom);
        if (p) return p;
    }
    // vedle šipky (potápěč na hladině, nad ním málo místa)
    const len = clamp(wanted, Math.min(minLen, Math.max(0, start - edge)), Math.max(0, start - edge));
    let top = clamp(start - len / 2 - block / 2, edge, Math.max(edge, height - block));
    if (crosses(top)) top = surfaceY - gap - block >= edge ? surfaceY - gap - block : surfaceY + gap;
    const side = 0.9 * u + 0.3 * lfs; // půlka hrotu šipky a mezera
    // nad hladinou smí popisek vpravo kousek přesahovat sloupec (mezera k panelu je 0,8–1,2 em)
    if (cx + side + w <= col.x + col.w + OVERHANG * fs) return out(len, top, cx + side, 'start');
    if (cx - side - w >= col.x) return out(len, top, cx - side, 'end');
    // nevejde se ani vedle: nad špičku s kratší šipkou
    return (stackRoom >= minLen && stacked(stackRoom)) || out(Math.max(0, Math.min(len, stackRoom)), Math.max(edge, start - Math.max(0, Math.min(len, stackRoom)) - gap - block));
}

/**
 * Poloha a velikost potápěče ve sloupci: vlevo od středu, ať nezakryje úchop ukazatele na pravém okraji.
 * @param {{x: number, w: number, h: number}} c sloupec
 * @param {number} fs
 * @returns {{cx: number, u: number}} osa šipky a jednotka kresby (px)
 */
export function diverFrame(c, fs) {
    const length = Math.min(0.8 * c.w, 0.45 * c.h, DIVER_MAX_LENGTH_EM * fs);
    return { cx: c.x + 0.42 * c.w, u: length / 11.2 }; // od špičky ploutví (−6,6 u) po ruce (+4,1 u), s okrajem
}

/**
 * Kolik místa nad hladinou (em, `headroom` vodního sloupce) potřebuje potápěč na hladině se šipkou a popiskem
 * (R7-04): lahev a vak nad vodou, šipka v plné délce a popisek vedle ní, nebo nad ní, když se vedle nevejde. Počítá se
 * z rozměrů modelu, takže nízký model (1280×720) nemá nad hladinou zbytečně velkou mezeru.
 * @param {Object} p
 * @param {number} p.width px
 * @param {number} p.height px
 * @param {number} [p.fontSize] px
 * @param {number} p.maxDepth m
 * @param {number} p.amount vzduch v BCD (bar · l), se kterým je potápěč na hladině (krok 10 scénáře)
 * @param {import('../../physics/buoyancy.js').Diver} [p.diver]
 * @returns {number} em
 */
export function surfaceHeadroom({ width, height, fontSize, maxDepth, amount, diver = A1_DIVER }) {
    const st = diverState(0, amount, diver);
    const label = netLabel(st.net, 0);
    const lines = label.amount ? [label.amount, label.verb] : [label.verb];
    let hr = 0;
    for (let k = 0; k < 4; k++) {
        const g = computeGeometry({ width, height, fontSize, maxDepth, panels: 1, headroom: hr });
        const fs = g.fontSize;
        const { cx, u } = diverFrame(g.column, fs);
        const lfs = labelFontSize(lines, fs, g.column.w);
        const block = lines.length * 1.15 * lfs;
        const len = forceLength(st.net) * u; // plná délka: stejná síla jako v kroku 6, stejně dlouhá šipka
        const w = labelWidth(lines, lfs);
        const side = 0.9 * u + 0.3 * lfs;
        const besideFits = cx + side + w <= g.column.x + g.column.w + OVERHANG * fs || cx - side - w >= g.column.x;
        const arrowAndLabel = besideFits ? Math.max(len, len / 2 + block / 2) : len + 0.2 * lfs + block;
        const need = (diverTopOffset(st.suit, st.bc) + 0.2) * u + arrowAndLabel + 0.2 * fs;
        hr = Math.max(0, need - Math.round(1.7 * fs)) / fs;
    }
    return Math.ceil(hr * 10) / 10;
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

    const backY = cy - T / 2;
    const tankH = TANK_H * u;
    const tankTop = backY - tankH * 0.85;
    // vak BCD kolem lahve (za ní): prázdný jen obrys, s vzduchem lososový (R7-06)
    const wing = bcShape(bc);
    const wingH = wing.h * u + (backY + 0.05 * u - tankTop);
    svgEl('rect', {
        class: wing.empty ? 'wc-diver-bc wc-diver-bc-empty' : 'wc-diver-bc',
        x: cx - 0.1 * u - (wing.w * u) / 2, y: tankTop - wing.h * u, width: wing.w * u, height: wingH,
        rx: Math.min(0.5 * u, wingH / 2),
        fill: data.bc, 'fill-opacity': wing.empty ? 0.3 : 1, stroke: wing.empty ? data.bc : data.body, 'stroke-width': wing.empty ? 2 : 1.5,
    }, g);
    // lahev na zádech (neutrální, nestlačuje se)
    svgEl('rect', {
        class: 'wc-diver-tank', x: cx - 1.6 * u, y: tankTop, width: 3 * u, height: tankH, rx: tankH / 2,
        fill: data.body, stroke: data.edge, 'stroke-width': 1.5,
    }, g);
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

    const top = tankTop - wing.h * u;
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
            const { cx, u } = diverFrame(c, fs);
            const body = drawDiver(g, { cx: cx + 1.25 * u, cy: depthY, u, suit: st.suit, bc: st.bc, data });

            // výsledná síla: jedna šipka a popisek v kg
            const label = netLabel(st.net, state.depth);
            const lines = label.amount ? [label.amount, label.verb] : [label.verb];
            const textAttrs = { 'font-weight': 700, ...haloAttrs(colors, fs) };
            let place;
            if (label.state === 'float') {
                const lfs = labelFontSize(lines, fs, c.w);
                const w = labelWidth(lines, lfs);
                place = { top: body.bottom + 0.3 * fs, x: clamp(cx, c.x + w / 2, c.x + c.w - w / 2), anchor: 'middle', fs: lfs, lineH: 1.15 * lfs };
            } else {
                const dir = label.state === 'rise' ? -1 : 1;
                const start = dir < 0 ? body.top - 0.2 * u : body.bottom + 0.1 * u;
                place = placeForce({
                    dir, start, wanted: forceLength(st.net) * u, u, fs, lines, cx, col: c, surfaceY: geom.depthToY(0), height: geom.height,
                });
                if (place.len > 2) {
                    svgEl('polygon', {
                        class: 'wc-diver-force', points: forceArrowPoints(cx, start, place.len, dir, 0.9 * u),
                        fill: data.force, stroke: data.forceEdge, 'stroke-width': 2, 'stroke-linejoin': 'round',
                    }, g);
                }
            }
            const textTop = clamp(place.top, 0, geom.height - lines.length * place.lineH);
            lines.forEach((line, i) => {
                svgEl('text', {
                    class: 'wc-diver-label', x: place.x, y: textTop + (i + 0.8) * place.lineH, 'text-anchor': place.anchor,
                    ...textAttrs, ...(place.fs !== fs ? { 'font-size': Math.round(place.fs * 10) / 10 } : {}), text: line,
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

/** Panel „vztlak navíc [kg]“: nulová čára, křivka pro současný vzduch v BCD, pruh v hloubce ukazatele. */
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

    // křivka: vztlak navíc v každé hloubce se současným vzduchem v BCD (oříznutá do panelu)
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
        class: 'wc-diver-area', points: `${x0},${yTop} ${pts.join(' ')} ${x0},${yBottom}`, fill: data.force, 'fill-opacity': 0.18,
    }, curves);
    svgEl('polyline', { class: 'wc-diver-curve', points: pts.join(' '), fill: 'none', stroke: data.force, 'stroke-width': 2.5 }, curves);
    // nula: tady se potápěč vznáší
    svgEl('line', { class: 'wc-diver-zero', x1: x0, x2: x0, y1: yTop, y2: yBottom, stroke: colors.text, 'stroke-width': 2 }, g);

    // pruh v hloubce ukazatele od nuly k výsledné síle
    const barH = Math.round(1.3 * fs);
    const barY = Math.min(Math.max(depthY - barH / 2, yTop - barH / 2), yBottom - barH / 2);
    const xNow = xOf(net);
    if (Math.abs(net) >= FLOAT_TOLERANCE) {
        svgEl('rect', {
            class: 'wc-diver-bar', x: Math.min(x0, xNow), y: barY, width: Math.abs(xNow - x0), height: barH, fill: data.force,
            stroke: data.forceEdge, 'stroke-width': 1,
        }, g);
    } else {
        svgEl('circle', { class: 'wc-diver-dot', cx: x0, cy: depthY, r: Math.round(0.35 * fs), fill: data.force, stroke: colors.text, 'stroke-width': 1.5 }, g);
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
