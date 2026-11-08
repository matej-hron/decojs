/**
 * Vrstva „tlak“ vodního sloupce (kurz P1, kapitola Tlak, model M1 „Tlak v hloubce“).
 *
 * V panelu vedle sloupce je tlak ve dvou barvách: atmosférický díl p_atm je ve všech hloubkách stejný,
 * hydrostatický p_h roste s hloubkou. Tím je vidět příčina: přibývá jen voda nad potápěčem.
 * Pruh v hloubce ukazatele je celkový tlak p = p_atm + p_h, odečet píše rovnici jako slide 19.
 *
 * Stav (docs/course/water-column.md §4):
 * - scénářové klíče stránky: `altitude` (m n. m.), `water` ('fresh' | 'salt');
 * - soukromý klíč vrstvy: `pressureMode` ('school' | 'exact').
 * Ve sloupci je voda nad ukazatelem obarvená jako klín p_h, pod ním tlumená: tlak dělá voda nad potápěčem.
 * Výpočet: js/physics/pressure.js. Barvy dat: CSS `--wc-pressure-atm`, `--wc-pressure-h`, `--wc-pressure-ink`, `--wc-pressure-shade`.
 */

import { svgEl, fmtCs, niceTicks, haloAttrs } from '../WaterColumn.js';
import { PRESSURE_MODES, pressureAt } from '../../physics/pressure.js';

const NBSP = ' ';

/**
 * Tlak v barech pro odečet a popisky: školní čísla bez zbytečných nul (2; 3,2; 5,05),
 * přesná vždy na dvě desetinná místa (2,02).
 * @param {number} value bar
 * @param {'school'|'exact'} mode
 * @returns {string}
 */
export function formatBar(value, mode) {
    if (mode === PRESSURE_MODES.EXACT) return fmtCs(value, 2);
    const hundredths = Math.round(value * 100);
    const decimals = hundredths % 100 === 0 ? 0 : hundredths % 10 === 0 ? 1 : 2;
    return fmtCs(hundredths / 100, decimals);
}

/**
 * Tlak podle stavu sloupce. Chybějící klíče = školní čísla, moře u hladiny moře.
 * @param {Object} state
 * @param {number} [depth=state.depth] m
 * @returns {{atm: number, hydro: number, total: number}} bar
 */
export function layerPressure(state, depth = state.depth) {
    return pressureAt(depth, {
        mode: state.pressureMode ?? PRESSURE_MODES.SCHOOL,
        altitude: state.altitude ?? 0,
        water: state.water ?? 'salt',
    });
}

/** Zaokrouhlení na setiny baru, stejné jako ve výpisu (formatBar). */
const toHundredths = (v) => Math.round(v * 100) / 100;

/**
 * Celkový tlak k zobrazení: součet zobrazených (zaokrouhlených) složek, aby se odečet sečetl
 * (přesně v 28 m moře: 1,01 + 2,81 = 3,82, ne 3,83; review R2-01).
 * @param {Object} state
 * @returns {string}
 */
export function displayedTotal(state) {
    const mode = state.pressureMode ?? PRESSURE_MODES.SCHOOL;
    const { atm, hydro } = layerPressure(state);
    return formatBar(toHundredths(atm) + toHundredths(hydro), mode);
}

/**
 * Odečet: p = p_atm + p_h = 1 + 1 = 2 bar (HTML, barevné klíče u značek).
 * @param {Object} state
 * @returns {string}
 */
export function pressureReadout(state) {
    const mode = state.pressureMode ?? PRESSURE_MODES.SCHOOL;
    const { atm, hydro } = layerPressure(state);
    const f = (v) => formatBar(v, mode);
    return '<var>p</var> = '
        + '<span class="wc-pressure-key wc-pressure-key-atm"><var>p</var><sub>atm</sub></span> + '
        + '<span class="wc-pressure-key wc-pressure-key-h"><var>p</var><sub>h</sub></span>'
        + ` = ${f(atm)} + ${f(hydro)} = ${displayedTotal(state)}&nbsp;bar`;
}

/**
 * Konec vodorovné osy tlaku: stejný pro obě hladiny i oba režimy, aby šlo porovnávat.
 * @param {number} maxDepth m
 * @returns {number} bar, celé číslo
 */
export function pressureScaleMax(maxDepth) {
    const highest = Math.max(
        pressureAt(maxDepth, { mode: PRESSURE_MODES.SCHOOL }).total,
        pressureAt(maxDepth, { mode: PRESSURE_MODES.EXACT, water: 'salt' }).total,
    );
    return Math.ceil(highest - 1e-9);
}

function readDataColors(el) {
    const cs = getComputedStyle(el);
    const v = (name, fallback) => cs.getPropertyValue(name).trim() || fallback;
    return {
        atm: v('--wc-pressure-atm', '#e8a317'),
        hydro: v('--wc-pressure-h', '#5dade2'),
        ink: v('--wc-pressure-ink', '#0d3550'),
        shade: v('--wc-pressure-shade', '#0a2b47'),
    };
}

/**
 * @param {Object} [options]
 * @param {string} [options.id='pressure']
 * @param {HTMLElement} [options.controlsHost] kam dát přepínač „školní / přesně“ (výchozí: ovládání sloupce)
 * @param {boolean} [options.controls=true] false = vrstva žádné ovládání nepřidá
 * @returns {import('../WaterColumn.js').Layer}
 */
export function createPressureLayer({ id = 'pressure', controlsHost = null, controls = true } = {}) {
    let group = null;
    let buttons = [];

    const syncButtons = (mode) => buttons.forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.mode === mode)));

    return {
        id,
        aside: true,
        zIndex: 0,

        init(ctx) {
            if (!ctx.getState().pressureMode) ctx.setState({ pressureMode: PRESSURE_MODES.SCHOOL });
            if (!controls) return;
            group = document.createElement('div');
            group.className = 'course-segmented';
            group.setAttribute('role', 'group');
            group.setAttribute('aria-label', 'Čísla');
            buttons = [
                [PRESSURE_MODES.SCHOOL, 'školní čísla'],
                [PRESSURE_MODES.EXACT, 'přesně'],
            ].map(([mode, label]) => {
                const b = document.createElement('button');
                b.type = 'button';
                b.dataset.mode = mode;
                b.textContent = label;
                b.addEventListener('click', () => { ctx.setState({ pressureMode: mode }); syncButtons(mode); });
                return b;
            });
            group.append(...buttons);
            (controlsHost ?? ctx.controlsEl).append(group);
            syncButtons(ctx.getState().pressureMode);
        },

        render(g, geom, state) {
            syncButtons(state.pressureMode);
            const { colors, fontSize: fs } = geom;
            const data = readDataColors(g.ownerSVGElement ?? g);

            // Ve sloupci: voda nad ukazatelem má barvu klínu p_h (tlak dělá voda nad potápěčem), pod ním je tlumená (R2-09).
            const c = geom.column;
            const yDepth = geom.depthToY(state.depth);
            svgEl('rect', { class: 'wc-pressure-above', x: c.x, y: c.y, width: c.w, height: Math.max(0, yDepth - c.y),
                fill: data.hydro, 'fill-opacity': 0.45 }, g);
            svgEl('rect', { class: 'wc-pressure-below', x: c.x, y: yDepth, width: c.w, height: Math.max(0, c.y + c.h - yDepth),
                fill: data.shade, 'fill-opacity': 0.35 }, g);

            const p = geom.aside;
            if (!p) return;
            const pMax = pressureScaleMax(state.maxDepth);
            const xOf = (bar) => p.x + (bar / pMax) * p.w;
            const yTop = geom.depthToY(0);
            const yBottom = geom.depthToY(state.maxDepth);
            const bottom = layerPressure(state, state.maxDepth);

            // svislá mřížka a vodorovná osa tlaku
            const tickCount = Math.max(2, Math.floor(p.w / (1.4 * fs))); // jednociferné popisky snesou hustší osu
            for (const bar of niceTicks(0, pMax, tickCount, 1)) {
                const x = xOf(bar);
                svgEl('line', { x1: x, x2: x, y1: yTop, y2: yBottom, stroke: colors.border, 'stroke-width': 1 }, g);
                svgEl('text', {
                    x, y: p.y + p.h + 1.25 * fs, 'text-anchor': 'middle', fill: colors.text, text: fmtCs(bar, 0),
                }, g);
            }
            svgEl('text', {
                x: p.x + p.w / 2, y: p.y + p.h + 2.75 * fs, 'text-anchor': 'middle', fill: colors.text,
                text: `tlak [bar]`,
            }, g);

            // plochy: atmosférický pás (stejně široký v každé hloubce) a hydrostatický klín (roste s hloubkou)
            const xAtm = xOf(bottom.atm);
            svgEl('rect', {
                class: 'wc-pressure-atm', x: p.x, y: yTop, width: Math.max(0, xAtm - p.x), height: yBottom - yTop,
                fill: data.atm, 'fill-opacity': 0.45,
            }, g);
            svgEl('polygon', {
                class: 'wc-pressure-h',
                points: `${xAtm},${yTop} ${xAtm},${yBottom} ${Math.round(xOf(bottom.total) * 10) / 10},${yBottom}`,
                fill: data.hydro, 'fill-opacity': 0.3,
            }, g);
            svgEl('line', {
                x1: xAtm, x2: xOf(bottom.total), y1: yTop, y2: yBottom, stroke: data.hydro, 'stroke-width': 2,
            }, g);
            svgEl('line', { x1: p.x, x2: p.x, y1: yTop, y2: yBottom, stroke: colors.text, 'stroke-width': 1 }, g);

            // pruh celkového tlaku v hloubce ukazatele
            const now = layerPressure(state);
            const y = geom.depthToY(state.depth);
            const barH = Math.round(1.3 * fs);
            const barY = Math.min(Math.max(y - barH / 2, yTop - barH / 2), yBottom - barH / 2);
            const xNow = xOf(now.total);
            svgEl('rect', { class: 'wc-pressure-bar-atm', x: p.x, y: barY, width: Math.max(0, xAtm - p.x), height: barH, fill: data.atm }, g);
            if (xNow - xAtm > 0.5) {
                svgEl('rect', { class: 'wc-pressure-bar-h', x: xAtm, y: barY, width: xNow - xAtm, height: barH, fill: data.hydro }, g);
            }
            const label = `${displayedTotal(state)}${NBSP}bar`;
            const labelW = label.length * 0.6 * fs;
            const inside = xNow + 0.4 * fs + labelW > p.x + p.w;
            svgEl('text', {
                x: inside ? xNow - 0.3 * fs : xNow + 0.4 * fs, y: barY + barH / 2, dy: '0.35em',
                'text-anchor': inside ? 'end' : 'start', 'font-weight': 600,
                ...(inside ? { fill: data.ink } : haloAttrs(colors, fs)),
                text: label,
            }, g);
        },

        readout(state) {
            return pressureReadout(state);
        },

        destroy() {
            group?.remove();
            buttons = [];
        },
    };
}
