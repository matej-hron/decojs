/**
 * Vrstva „objem plynu“ vodního sloupce (kurz P1, kapitola Stlačování plynů, model B1 „Balónek a zvon“).
 *
 * Ve sloupci v hloubce ukazatele je předmět s plynem: balónek (poloměr úměrný třetí odmocnině objemu) nebo zvon
 * (voda uvnitř podle podílu vzduchu). V panelu vedle sloupce je křivka objemu *V*(*h*), body řádků tabulky
 * ze slidu a pruh objemu v hloubce ukazatele. Odečet píše objem a změnu proti předchozímu řádku tabulky
 * ve směru slidu („10 m → hladina: +15 l, ×2“, slide 26).
 *
 * Stav (docs/course/water-column.md §4):
 * - soukromý klíč vrstvy: `gasObject` (klíč předmětu v `objects`);
 * - čte `pressureMode` (vrstva tlaku) a scénářové `altitude`, `water`.
 * Předměty (objem v hloubce, řádky tabulky) dává stránka v options továrny. Výpočet: js/physics/boyle.js.
 * Barvy dat: CSS `--wc-gas` (balónek, křivka), `--wc-gas-air` (vzduch ve zvonu), `--wc-gas-water` (voda ve zvonu),
 * `--wc-gas-ink` (text na pruhu objemu).
 */

import { svgEl, fmtCs, niceTicks, haloAttrs, clamp, estimateTextWidth, placeBarLabel } from '../WaterColumn.js';
import { fmtGroup } from '../../format.js';
import { volumeAtDepth } from '../../physics/boyle.js';

const NBSP = ' ';
const MINUS = '−';

/**
 * @typedef {Object} GasObject
 * @property {'balloon'|'bell'} kind
 * @property {number} volume  objem (l) v hloubce `depth`
 * @property {number} depth   m
 * @property {readonly number[]} rows  hloubky (m) řádků tabulky ve směru slidu
 * @property {string} [label] název pro čtečky („balónek“)
 */

/**
 * Objem v litrech: do 100 l na desetiny bez „,0“ (7,5; 15), od 100 l celé s mezerou v tisících (333; 1 000).
 * @param {number} litres
 * @returns {string}
 */
export function formatLitres(litres) {
    const v = Math.abs(litres) >= 100 ? Math.round(litres) : Math.round(litres * 10) / 10;
    return fmtGroup(v, 1, 'cs');
}

/**
 * Změna objemu se znaménkem (+1,5; −500).
 * @param {number} litres
 * @returns {string}
 */
export function formatSignedLitres(litres) {
    const text = formatLitres(Math.abs(litres));
    if (text === '0') return '0';
    return `${litres < 0 ? MINUS : '+'}${text}`;
}

/**
 * Kolikrát se objem změnil: zvětšení „×2“, zmenšení „÷2“ (na setiny, bez koncových nul).
 * @param {number} ratio nový / původní objem
 * @returns {string}
 */
export function formatRatio(ratio) {
    const factor = ratio >= 1 ? ratio : 1 / ratio;
    return `${ratio >= 1 ? '×' : '÷'}${fmtGroup(Math.round(factor * 100) / 100, 2, 'cs')}`;
}

/**
 * Hloubka do odečtu: 0 m je „hladina“.
 * @param {number} depth m
 * @returns {string}
 */
export function depthLabel(depth) {
    return depth === 0 ? 'hladina' : `${fmtCs(depth, Number.isInteger(depth) ? 0 : 1)}${NBSP}m`;
}

/** Znaménko směru tabulky: −1 nahoru (balónek), +1 dolů (zvon). */
const direction = (rows) => (rows.length > 1 && rows[1] < rows[0] ? -1 : 1);
const EPS = 1e-9;

/**
 * Další řádek tabulky ve směru slidu (šipka →). Na konci tabulky hloubka zůstane.
 * @param {number} depth m
 * @param {readonly number[]} rows ve směru slidu
 * @returns {number}
 */
export function nextRow(depth, rows) {
    const dir = direction(rows);
    return rows.find((r) => (r - depth) * dir > EPS) ?? depth;
}

/**
 * Předchozí řádek tabulky proti směru slidu (šipka ←), nebo null na začátku tabulky.
 * @param {number} depth m
 * @param {readonly number[]} rows ve směru slidu
 * @returns {number|null}
 */
export function previousRow(depth, rows) {
    const dir = direction(rows);
    const before = rows.filter((r) => (depth - r) * dir > EPS);
    return before.length ? before[before.length - 1] : null;
}

/**
 * Objem předmětu v hloubce.
 * @param {number} depth
 * @param {GasObject} obj
 * @param {{pressureMode?: string, altitude?: number, water?: string}} [state]
 * @returns {number} l
 */
export function objectVolume(depth, obj, state = {}) {
    return volumeAtDepth(depth, {
        volume: obj.volume,
        depth: obj.depth,
        mode: state.pressureMode ?? 'school',
        altitude: state.altitude ?? 0,
        water: state.water ?? 'salt',
    });
}

/**
 * Změna objemu proti předchozímu řádku tabulky ve směru slidu (slide 26), nebo null.
 * @param {number} depth m
 * @param {GasObject} obj
 * @param {Object} [state]
 * @returns {{fromDepth: number, toDepth: number, from: number, to: number, delta: number, ratio: number}|null}
 */
export function rowChange(depth, obj, state = {}) {
    const fromDepth = previousRow(depth, obj.rows);
    if (fromDepth === null) return null;
    const from = objectVolume(fromDepth, obj, state);
    const to = objectVolume(depth, obj, state);
    return { fromDepth, toDepth: depth, from, to, delta: to - from, ratio: to / from };
}

/**
 * Text změny: „10 m → hladina: +15 l, ×2“, „40 → 30 m: +1,5 l, ×1,25“ (jednotka u druhé hloubky jen jednou).
 * @param {ReturnType<typeof rowChange>} change
 * @returns {string} prostý text s U+00A0
 */
export function changeReadout(change) {
    if (!change) return '';
    const { fromDepth, toDepth } = change;
    const from = fromDepth !== 0 && toDepth !== 0 ? fmtCs(fromDepth, Number.isInteger(fromDepth) ? 0 : 1) : depthLabel(fromDepth);
    return `${from} → ${depthLabel(toDepth)}: ${formatSignedLitres(change.delta)}${NBSP}l, ${formatRatio(change.ratio)}`;
}

/**
 * Odečet vrstvy (HTML): „V = 30 l (10 m → hladina: +15 l, ×2)“.
 * @param {number} depth
 * @param {GasObject} obj
 * @param {Object} [state]
 * @returns {string}
 */
export function gasReadout(depth, obj, state = {}) {
    const html = (s) => s.replaceAll(NBSP, '&nbsp;');
    const volume = `<var>V</var> = ${html(formatLitres(objectVolume(depth, obj, state)))}&nbsp;l`;
    const change = rowChange(depth, obj, state);
    return change ? `${volume} (${html(changeReadout(change))})` : volume;
}

/**
 * Poloměr balónku: koule, takže poloměr roste s třetí odmocninou objemu.
 * @param {number} volume l
 * @param {number} maxVolume l, objem, kterému patří `maxRadius`
 * @param {number} maxRadius px
 * @returns {number} px
 */
export function balloonRadius(volume, maxVolume, maxRadius) {
    return maxRadius * Math.cbrt(Math.max(0, volume) / maxVolume);
}

/**
 * Jakou část zvonu vyplní voda: vzduch zabírá V / V₀ (V₀ = objem zvonu na hladině).
 * @param {number} volume l vzduchu v hloubce
 * @param {number} bellVolume l, plný objem zvonu
 * @returns {number} 0–1
 */
export function bellWaterFraction(volume, bellVolume) {
    return clamp(1 - volume / bellVolume, 0, 1);
}

/**
 * Konec osy objemu: největší objem ve sloupci, tedy na hladině.
 * @param {GasObject} obj
 * @param {Object} [state]
 * @returns {number} l
 */
export function volumeScaleMax(obj, state = {}) {
    return objectVolume(0, obj, state);
}

/**
 * Polohy popisků osy objemu v panelu (relativně k jeho levému okraji): první zarovnaný doleva, maximum doprava
 * (smí přesáhnout do pravého okraje SVG o `slack`), ostatní na střed. Stejné polohy kreslí render.
 * @param {number[]} ticks l
 * @param {number} vMax l
 * @param {number} width px panelu
 * @param {number} fontSize px
 * @param {number} [slack] px za pravým okrajem panelu (okraj SVG je 1 em)
 * @returns {{v: number, text: string, x: number, anchor: 'start'|'middle'|'end', left: number, right: number}[]}
 */
export function tickLabelBoxes(ticks, vMax, width, fontSize, slack = 0.9 * fontSize) {
    return ticks.map((v, i) => {
        const text = formatLitres(v);
        const w = estimateTextWidth(text, fontSize);
        const x = (v / vMax) * width;
        if (i === 0) return { v, text, x, anchor: 'start', left: x, right: x + w };
        if (i === ticks.length - 1 && Math.abs(v - vMax) < 1e-9) {
            const right = Math.min(x + w / 2, width + slack);
            return { v, text, x: right, anchor: 'end', left: right - w, right };
        }
        return { v, text, x, anchor: 'middle', left: x - w / 2, right: x + w / 2 };
    });
}

/** Vejdou se popisky vedle sebe s mezerou aspoň 0,4 em? */
function labelsFit(ticks, vMax, width, fontSize) {
    const boxes = tickLabelBoxes(ticks, vMax, width, fontSize);
    return boxes.every((b, i) => i === 0 || b.left - boxes[i - 1].right >= 0.4 * fontSize);
}

/**
 * Popisky osy objemu, které se vejdou vedle sebe. Pěkné dílky (krok 1, 2 nebo 5 × 10ⁿ), když jich je aspoň
 * čtyři a končí na maximu; jinak 0, polovina a maximum, a když se nevejde ani to, jen 0 a maximum (review R4-04).
 * @param {number} vMax l
 * @param {number} width px panelu
 * @param {number} fontSize px
 * @returns {number[]}
 */
export function volumeTicks(vMax, width, fontSize) {
    const labelW = estimateTextWidth(formatLitres(vMax), fontSize);
    for (let count = Math.max(1, Math.floor((3 * width) / labelW)); count > 1; count--) {
        const ticks = niceTicks(0, vMax, count);
        if (ticks.length >= 4 && Math.abs(ticks[ticks.length - 1] - vMax) < 1e-9 && labelsFit(ticks, vMax, width, fontSize)) {
            return ticks;
        }
    }
    const half = [0, vMax / 2, vMax];
    return labelsFit(half, vMax, width, fontSize) ? half : [0, vMax];
}

/**
 * Tvar nakresleného zvonu v jednotkách šířky: výška a hloubka kopule. Kopule jsou dvě kvadratické Bézierovy křivky
 * z rohů do vrcholu, pod ní svislé stěny.
 */
export const BELL_SHAPE = Object.freeze({ height: 1.15, dome: 0.42 });

/**
 * Plocha nakresleného zvonu od vrcholu do hloubky u (měřeno od vrcholu dolů).
 * Šířka kopule v hloubce u je w · (1 − t²), kde t = 1 − √(u/dome); pod kopulí je šířka w.
 * Integrál kopule v uzavřeném tvaru: 2 · w · dome · (2S³/3 − S⁴/4), S = √(u/dome); celá kopule 5/6 · w · dome.
 * @param {number} u px od vrcholu
 * @param {number} w šířka
 * @param {number} h výška
 * @param {number} dome hloubka kopule
 * @returns {number} px²
 */
export function bellAreaAbove(u, w, h, dome) {
    const uu = clamp(u, 0, h);
    if (uu <= dome) {
        const S = Math.sqrt(uu / dome);
        return 2 * w * dome * ((2 * S ** 3) / 3 - S ** 4 / 4);
    }
    return (5 / 6) * w * dome + w * (uu - dome);
}

/**
 * Hloubka hladiny vody ve zvonu od jeho vrcholu, aby vzduch zabíral daný podíl plochy nakresleného tvaru
 * (review R4-03: ve 20 m třetinu, ne podle výšky).
 * @param {number} share podíl vzduchu 0–1 (V / V na hladině)
 * @param {number} w
 * @param {number} h
 * @param {number} dome
 * @returns {number} px od vrcholu
 */
export function bellAirDepth(share, w, h, dome) {
    const s = clamp(share, 0, 1);
    if (s >= 1) return h;
    if (s <= 0) return 0;
    const target = s * bellAreaAbove(h, w, h, dome);
    const domeArea = (5 / 6) * w * dome;
    if (target >= domeArea) return dome + (target - domeArea) / w;
    let lo = 0;
    let hi = dome;
    for (let i = 0; i < 60; i++) {
        const mid = (lo + hi) / 2;
        if (bellAreaAbove(mid, w, h, dome) < target) lo = mid; else hi = mid;
    }
    return (lo + hi) / 2;
}

/** Levá stěna zvonu v hloubce u od vrcholu: odsazení od levého okraje (0 pod kopulí). */
function bellInset(u, w, dome) {
    if (u >= dome) return 0;
    const t = 1 - Math.sqrt(Math.max(0, u) / dome);
    return (w * t * t) / 2;
}

/** Největší šířka zvonu a poloměr balónku v em: vejdou se do místa nad hladinou (BOYLE_HEADROOM_EM). */
export const BELL_MAX_WIDTH_EM = 4.1;
export const BALLOON_MAX_RADIUS_EM = 4.3;

function readDataColors(el) {
    const cs = getComputedStyle(el);
    const v = (name, fallback) => cs.getPropertyValue(name).trim() || fallback;
    return {
        gas: v('--wc-gas', '#d6336c'),
        air: v('--wc-gas-air', '#ffffff'),
        water: v('--wc-gas-water', '#2e86c1'),
        ink: v('--wc-gas-ink', '#3a0d1a'),
    };
}

function drawBalloon(g, { cx, depthY, volume, maxVolume, maxRadius, bottomLimit, colors, data }) {
    const r = balloonRadius(volume, maxVolume, maxRadius);
    // Střed přesně v hloubce ukazatele (review R4-01): na hladině balónek vyčnívá nad ni, ve 40 m přesahuje dno
    // sloupce. Provázek se zkrátí, aby se vešel do SVG.
    const cy = depthY;
    const tail = Math.max(0, Math.min(0.6 * maxRadius, bottomLimit - (cy + r)));
    if (tail > 2) {
        svgEl('path', {
            class: 'wc-gas-string',
            d: `M${cx},${cy + r} q${-0.25 * tail},${0.5 * tail} 0,${tail}`,
            fill: 'none', stroke: colors.text, 'stroke-width': 1.5,
        }, g);
    }
    svgEl('path', {
        class: 'wc-gas-knot',
        d: `M${cx},${cy + r - 1} l${-0.12 * maxRadius},${0.22 * maxRadius} h${0.24 * maxRadius} z`,
        fill: data.gas, stroke: colors.text, 'stroke-width': 1,
    }, g);
    svgEl('circle', {
        class: 'wc-gas-balloon', cx, cy, r, fill: data.gas, stroke: colors.text, 'stroke-width': 1.5,
    }, g);
}

function drawBell(g, { cx, depthY, airShare, size, bottomLimit, colors, data }) {
    const w = size;
    const h = BELL_SHAPE.height * size;
    const dome = BELL_SHAPE.dome * size;
    const air = bellAirDepth(airShare, w, h, dome);
    // Hladina vody ve zvonu leží přesně v hloubce ukazatele (review R4-01, R4-02): vzduch má tlak této hloubky.
    // Na hladině je spodní okraj zvonu na hladině a zvon visí nad vodou. Jen kdyby zvon přetekl spodní okraj SVG
    // (tažení hlouběji než tabulka), posune se nahoru.
    const top = Math.min(depthY - air, bottomLimit - h);
    const x = cx - w / 2;
    const outline = `M${x},${top + h} V${top + dome} Q${x},${top} ${cx},${top} Q${x + w},${top} ${x + w},${top + dome} V${top + h}`;
    // lano z horního okraje
    svgEl('line', { class: 'wc-gas-cable', x1: cx, x2: cx, y1: 0, y2: top, stroke: colors.text, 'stroke-width': 1.5 }, g);
    // vnitřek: vzduch nahoře, voda zespodu po hladinu (tvar vody sleduje stěnu i v kopuli)
    svgEl('path', { class: 'wc-gas-bell-air', d: `${outline} Z`, fill: data.air, 'fill-opacity': 0.9 }, g);
    if (h - air > 0.5) {
        const pts = [];
        const steps = 24;
        for (let i = 0; i <= steps; i++) {
            const u = air + ((h - air) * i) / steps;
            pts.push([x + bellInset(u, w, dome), top + u]);
        }
        const right = pts.slice().reverse().map(([px, py]) => [2 * cx - px, py]);
        const poly = [...pts, ...right].map(([px, py]) => `${Math.round(px * 10) / 10},${Math.round(py * 10) / 10}`).join(' ');
        svgEl('polygon', { class: 'wc-gas-bell-water', points: poly, fill: data.water }, g);
        const inset = bellInset(air, w, dome);
        svgEl('line', {
            class: 'wc-gas-bell-level', x1: x + inset, x2: x + w - inset, y1: top + air, y2: top + air,
            stroke: colors.text, 'stroke-width': 1.5,
        }, g);
    }
    svgEl('path', { class: 'wc-gas-bell', d: outline, fill: 'none', stroke: colors.text, 'stroke-width': 3, 'stroke-linejoin': 'round' }, g);
}

/**
 * @param {Object} options
 * @param {Object<string, GasObject>} options.objects předměty podle klíče (`state.gasObject`)
 * @param {string} [options.defaultObject] předmět, když ho stav neurčí (výchozí: první klíč)
 * @param {string} [options.id='gas']
 * @returns {import('../WaterColumn.js').Layer}
 */
export function createGasVolumeLayer({ objects, defaultObject = Object.keys(objects)[0], id = 'gas' }) {
    const objectOf = (state) => objects[state.gasObject] ?? objects[defaultObject];

    return {
        id,
        aside: true,
        zIndex: 10,

        init(ctx) {
            if (!objects[ctx.getState().gasObject]) ctx.setState({ gasObject: defaultObject });
        },

        render(g, geom, state) {
            const obj = objectOf(state);
            const { colors, fontSize: fs, column: c } = geom;
            const data = readDataColors(g.ownerSVGElement ?? g);
            const volume = objectVolume(state.depth, obj, state);
            const vMax = volumeScaleMax(obj, state);
            const depthY = geom.depthToY(state.depth);
            // předmět vlevo od středu, ať nezakryje úchop ukazatele na pravém okraji sloupce
            const cx = c.x + 0.45 * c.w;

            // Velikosti předmětů se vejdou do místa nad hladinou (headroom modelu, BOYLE_HEADROOM_EM v boyleModel.js).
            const bottomLimit = geom.height - 2;
            if (obj.kind === 'bell') {
                drawBell(g, {
                    cx, depthY, colors, data, bottomLimit,
                    airShare: 1 - bellWaterFraction(volume, obj.volume),
                    size: Math.min(0.45 * c.w, 0.12 * c.h, BELL_MAX_WIDTH_EM * fs),
                });
            } else {
                drawBalloon(g, {
                    cx, depthY, colors, data, volume, maxVolume: vMax, bottomLimit,
                    maxRadius: Math.min(0.32 * c.w, 0.1 * c.h, BALLOON_MAX_RADIUS_EM * fs),
                });
            }

            const p = geom.aside;
            if (!p) return;
            const xOf = (v) => p.x + (v / vMax) * p.w;
            const yTop = geom.depthToY(0);
            const yBottom = geom.depthToY(state.maxDepth);

            // svislá mřížka a vodorovná osa objemu
            const ticks = volumeTicks(vMax, p.w, fs);
            for (const b of tickLabelBoxes(ticks, vMax, p.w, fs)) {
                const x = xOf(b.v);
                svgEl('line', { x1: x, x2: x, y1: yTop, y2: yBottom, stroke: colors.border, 'stroke-width': 1 }, g);
                svgEl('text', { x: p.x + b.x, y: p.y + p.h + 1.25 * fs, 'text-anchor': b.anchor, fill: colors.text, text: b.text }, g);
            }
            svgEl('text', {
                x: p.x + p.w / 2, y: p.y + p.h + 2.75 * fs, 'text-anchor': 'middle', fill: colors.text, text: 'objem [l]',
            }, g);

            // křivka V(h): u hladiny nejstrmější
            const pts = [];
            const steps = Math.max(20, Math.round(state.maxDepth * 4));
            for (let i = 0; i <= steps; i++) {
                const d = (state.maxDepth * i) / steps;
                pts.push(`${Math.round(xOf(objectVolume(d, obj, state)) * 10) / 10},${Math.round(geom.depthToY(d) * 10) / 10}`);
            }
            svgEl('polygon', {
                class: 'wc-gas-area', points: `${p.x},${yTop} ${pts.join(' ')} ${p.x},${yBottom}`, fill: data.gas, 'fill-opacity': 0.18,
            }, g);
            svgEl('polyline', { class: 'wc-gas-curve', points: pts.join(' '), fill: 'none', stroke: data.gas, 'stroke-width': 2.5 }, g);
            svgEl('line', { x1: p.x, x2: p.x, y1: yTop, y2: yBottom, stroke: colors.text, 'stroke-width': 1 }, g);

            // řádky tabulky ze slidu
            for (const row of obj.rows) {
                if (row > state.maxDepth) continue;
                svgEl('circle', {
                    class: 'wc-gas-row', cx: xOf(objectVolume(row, obj, state)), cy: geom.depthToY(row), r: Math.round(0.28 * fs),
                    fill: data.gas, stroke: colors.text, 'stroke-width': 1,
                }, g);
            }

            // pruh objemu v hloubce ukazatele
            const barH = Math.round(1.3 * fs);
            const barY = Math.min(Math.max(depthY - barH / 2, yTop - barH / 2), yBottom - barH / 2);
            const xNow = xOf(volume);
            svgEl('rect', { class: 'wc-gas-bar', x: p.x, y: barY, width: Math.max(0, xNow - p.x), height: barH, fill: data.gas }, g);
            const litres = formatLitres(volume);
            const lab = placeBarLabel({ x0: p.x, x1: xNow, right: p.x + p.w - 0.3 * fs, fs, labels: [`${litres}${NBSP}l`, litres] });
            svgEl('text', {
                x: lab.x, y: barY + barH / 2, dy: '0.35em',
                'text-anchor': lab.anchor, 'font-weight': 600,
                ...(lab.inside ? { fill: data.ink } : haloAttrs(colors, fs)),
                text: lab.text,
            }, g);
        },

        readout(state) {
            return gasReadout(state.depth, objectOf(state), state);
        },
    };
}
