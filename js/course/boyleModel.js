/**
 * Model B1 „Balónek a zvon“ (kurz P1, kapitola Stlačování plynů, slidy 24–26).
 *
 * Vodní sloupec (js/components/WaterColumn.js) s panelem tlaku z modelu M1 (bez přepínače „školní / přesně“,
 * rozhodnutí 3c) a vrstvou objemu plynu (waterColumn/gasVolumeLayer.js). Tlak roste po stejných krocích,
 * objem se jím dělí, proto se u hladiny mění nejvíc (slide 26).
 *
 * Ovládání:
 * - hloubka: tažení ukazatele, klik do sloupce, posuvník (po 1 m);
 * - šipky ← → (i klikr PageUp/PageDown) a tlačítka ‹ › v otevřeném modelu jdou po řádcích tabulky ve směru slidu:
 *   balónek 40 → 30 → 20 → 10 → 0 m (slide 25 odkrývá objemy odspodu), zvon 0 → 10 → 20 m (slide 24);
 * - předmět: balónek / zvon (přepnutí skočí na první řádek jeho tabulky);
 * - nadmořská výška hladiny (U12): 0, 500, 1 000, 2 000, 3 000 a 5 500 m n. m. Tlak u hladiny je z tabulky slidu 17
 *   (SLIDE_ALTITUDE_KPA v js/physics/pressure.js) na setiny baru, 5 500 m na 0,5 bar jako na slidu 20, ať se dá
 *   počítat z hlavy. Model počítá se stejným číslem, jaké ukazuje, takže odečet jde přepočítat. p_h je dál 1 bar
 *   na 10 m. Výchozí 0 m jsou školní čísla beze změny.
 * Předvolby v URL: `?zvon=1&hloubka=20&vyska=1000#model-boyle` (js/course/modelParams.js). Bez `hloubka` začne
 * předmět na prvním řádku své tabulky, bez `vyska` u moře.
 */

import { createWaterColumn } from '../components/WaterColumn.js';
import { createPressureLayer } from '../components/waterColumn/pressureLayer.js';
import { createGasVolumeLayer, nextRow, previousRow } from '../components/waterColumn/gasVolumeLayer.js';
import { PRESSURE_MODES, SLIDE_ALTITUDE_KPA } from '../physics/pressure.js';
import { fmtGroup } from '../format.js';
import { modelArrowDir, modelHeight, segmented, stepButton } from './pressureModel.js';
import { readParams, syncUrl } from './modelParams.js';

/** Hloubka sloupce (m): balónek začíná ve 40 m. */
export const MODEL_MAX_DEPTH = 40;

/**
 * Místo nad hladinou v em (WaterColumn `headroom`): zvon na hladině visí nad vodou a balónek na hladině z ní vyčnívá
 * (review R4-01). Nad hladinou je i tak 1,7 em kostry, dohromady se vejde zvon (1,15 · 4,1 em) i balónek (4,3 em).
 */
export const BOYLE_HEADROOM_EM = 3.4;

/**
 * Předměty ze slidů: balónek 6 l vypuštěný ze 40 m (slide 25) a zvon s 1 000 l vzduchu na hladině (slide 24).
 * `rows` jsou hloubky řádků tabulky ve směru slidu.
 * @type {Readonly<Record<'balloon'|'bell', import('../components/waterColumn/gasVolumeLayer.js').GasObject>>}
 */
export const BOYLE_OBJECTS = Object.freeze({
    balloon: Object.freeze({ kind: 'balloon', label: 'balónek', volume: 6, depth: 40, rows: Object.freeze([40, 30, 20, 10, 0]) }),
    bell: Object.freeze({ kind: 'bell', label: 'zvon', volume: 1000, depth: 0, rows: Object.freeze([0, 10, 20]) }),
});

/**
 * Místo nad hladinou pro daný sloupec. Nízký náhled (telefon: 150 px) by s plným místem nad hladinou nechal sloupci
 * jen pár pixelů; předměty se tam velikostí řídí výškou sloupce, takže jim stačí 1 em.
 * @param {boolean} compact náhled na slidu
 * @param {number} hostHeight px
 * @returns {number} em
 */
export function boyleHeadroom(compact, hostHeight) {
    return compact && hostHeight > 0 && hostHeight < 260 ? 1 : BOYLE_HEADROOM_EM;
}

const NBSP = '\u00a0';

/**
 * Předvolby nadmořské výšky: na kolik desetinných míst baru se zaokrouhlí tlak z tabulky slidu 17. 5 500 m
 * (49,8 kPa) na 0,5 bar, ať se dá počítat z hlavy (balónek ze 40 m na hladině 4,5 · 6 / 0,5 = 54 l).
 */
const ALTITUDE_PRESETS = Object.freeze([
    [0, 2], [500, 2], [1000, 2], [2000, 2], [3000, 2], [5500, 1],
]);

/** Předvolby nadmořské výšky (m n. m.). */
export const BOYLE_ALTITUDES = Object.freeze(ALTITUDE_PRESETS.map(([altitude]) => altitude));

/**
 * Atmosférický tlak u hladiny pro předvolbu výšky: tabulka slidu 17 zaokrouhlená jako v odečtu.
 * @param {number} altitude m n. m., jedna z BOYLE_ALTITUDES
 * @returns {number} bar
 */
export function boyleAtmosphere(altitude) {
    const preset = ALTITUDE_PRESETS.find(([a]) => a === altitude);
    if (!preset) throw new RangeError(`Výška není předvolba modelu: ${altitude}`);
    const factor = 10 ** preset[1];
    return Math.round((SLIDE_ALTITUDE_KPA[altitude] / 100) * factor) / factor;
}

/**
 * Popisek předvolby: „1 000 m“; zaokrouhlená předvolba i s tlakem, „5 500 m (≈ 0,5 bar)“.
 * @param {number} altitude
 * @returns {string}
 */
export function altitudeLabel(altitude) {
    const metres = `${fmtGroup(altitude, 0, 'cs')}${NBSP}m`;
    const [, decimals] = ALTITUDE_PRESETS.find(([a]) => a === altitude);
    return decimals < 2 ? `${metres} (≈${NBSP}${fmtGroup(boyleAtmosphere(altitude), decimals, 'cs')}${NBSP}bar)` : metres;
}

/**
 * Scénářové klíče sloupce pro výšku: `altitude` a `atm` (p_atm z tabulky), vždy spolu.
 * @param {number} altitude
 * @returns {{altitude: number, atm: number}}
 */
export function altitudeState(altitude) {
    return { altitude, atm: boyleAtmosphere(altitude) };
}

/**
 * Nejbližší předvolba výšky (z adresy může přijít cokoli).
 * @param {number} altitude
 * @returns {number}
 */
export function nearestAltitude(altitude) {
    return BOYLE_ALTITUDES.reduce((best, a) => (Math.abs(a - altitude) < Math.abs(best - altitude) ? a : best));
}

/** Schéma předvoleb v URL. */
export const BOYLE_PARAMS = Object.freeze({
    zvon: { min: 0, max: 1, step: 1, default: 0 },
    hloubka: { min: 0, max: MODEL_MAX_DEPTH, step: 1, default: 0 },
    vyska: { min: 0, max: BOYLE_ALTITUDES.at(-1), step: 1, default: 0 },
});

/**
 * Hloubka, kde předmět začíná: první řádek jeho tabulky.
 * @param {'balloon'|'bell'} key
 * @returns {number} m
 */
export function startDepth(key) {
    return BOYLE_OBJECTS[key].rows[0];
}

/**
 * Počáteční stav z předvoleb. Bez `hloubka` v adrese začne předmět na prvním řádku tabulky.
 * @param {{zvon: number, hloubka: number, vyska: number}} params výstup readParams(…, BOYLE_PARAMS)
 * @param {URLSearchParams} search kvůli rozlišení „hloubka chybí“ od „hloubka=0“
 * @returns {{depth: number, gasObject: 'balloon'|'bell', altitude: number}}
 */
export function initialStateFromParams(params, search) {
    const gasObject = params.zvon ? 'bell' : 'balloon';
    return {
        depth: search.has('hloubka') ? params.hloubka : startDepth(gasObject),
        gasObject,
        altitude: nearestAltitude(params.vyska ?? 0),
    };
}

/**
 * Předvolby do URL: jen to, co se liší od výchozího stavu předmětu (null = smazat).
 * @param {{depth: number, gasObject: string, altitude?: number}} state
 * @returns {{zvon: number|null, hloubka: number|null, vyska: number|null}}
 */
export function paramsFromState(state) {
    const key = state.gasObject === 'bell' ? 'bell' : 'balloon';
    return {
        zvon: key === 'bell' ? 1 : null,
        hloubka: state.depth === startDepth(key) ? null : state.depth,
        vyska: state.altitude ? state.altitude : null,
    };
}

/**
 * Výběr nadmořské výšky v ovládání modelu.
 * @param {(altitude: number) => void} onPick
 * @returns {{el: HTMLElement, sync: (altitude: number) => void}}
 */
function altitudePicker(onPick) {
    const label = document.createElement('label');
    label.className = 'course-select';
    label.append('Nadmořská výška ');
    const select = document.createElement('select');
    for (const altitude of BOYLE_ALTITUDES) {
        const option = document.createElement('option');
        option.value = String(altitude);
        option.textContent = altitudeLabel(altitude);
        select.append(option);
    }
    select.addEventListener('change', () => onPick(Number(select.value)));
    label.append(select);
    return { el: label, sync: (altitude) => { select.value = String(altitude); } };
}

/**
 * Postaví model do `host`.
 * @param {HTMLElement} host prvek pro sloupec (`.course-plot.course-column-host`)
 * @param {Object} [options]
 * @param {HTMLElement} [options.controlsHost] kam dát tlačítka a přepínač (výchozí: ovládání sloupce)
 * @param {{depth: number, gasObject: string, altitude?: number}} [options.state] počáteční stav
 * @param {boolean} [options.controls=true] false = jen sloupec (náhled na slidu)
 * @param {boolean} [options.compact=false] náhled: bez odečtu a posuvníku
 * @returns {{column: Object, step: (dir: 1|-1) => void, setState: (s: Object) => void, redraw: () => void, destroy: () => void}}
 */
export function createBoyleModel(host, { controlsHost = null, state = null, controls = true, compact = false } = {}) {
    const initial = state ?? { depth: startDepth('balloon'), gasObject: 'balloon' };
    const altitude = initial.altitude ?? 0;
    let column = null;
    column = createWaterColumn(host, {
        maxDepth: MODEL_MAX_DEPTH,
        step: 1,
        depth: initial.depth,
        state: { gasObject: initial.gasObject, pressureMode: PRESSURE_MODES.SCHOOL, ...altitudeState(altitude), water: 'salt' },
        height: modelHeight(host, () => column, compact),
        headroom: boyleHeadroom(compact, host.clientHeight),
        labels: { figure: 'Vodní sloupec: objem plynu v hloubce' },
    });
    if (compact) column.el.classList.add('water-column-compact');

    const target = controlsHost ?? column.controlsEl;
    let picker = null;
    let heights = null;
    if (controls) {
        const prev = stepButton('‹', 'Předchozí řádek tabulky');
        const next = stepButton('›', 'Další řádek tabulky');
        prev.addEventListener('click', () => step(-1));
        next.addEventListener('click', () => step(1));
        const steps = document.createElement('div');
        steps.className = 'course-pressure-steps';
        steps.append(prev, next);
        picker = segmented('Předmět', [['balloon', 'balónek'], ['bell', 'zvon']],
            (key) => column.setState({ gasObject: key, depth: startDepth(key) }));
        heights = altitudePicker((a) => column.setState(altitudeState(a)));
        target.append(steps, picker.el, heights.el);
    }
    column.addLayer(createPressureLayer({ controls: false, exactScale: false }));
    column.addLayer(createGasVolumeLayer({ objects: BOYLE_OBJECTS, defaultObject: 'balloon' }));
    picker?.sync(column.getState().gasObject);
    heights?.sync(column.getState().altitude);
    column.on('change', (s) => { picker?.sync(s.gasObject); heights?.sync(s.altitude); });

    function step(dir) {
        const s = column.getState();
        const rows = BOYLE_OBJECTS[s.gasObject]?.rows ?? BOYLE_OBJECTS.balloon.rows;
        const depth = dir > 0 ? nextRow(s.depth, rows) : (previousRow(s.depth, rows) ?? s.depth);
        column.setState({ depth });
    }

    return {
        column,
        step,
        setState: (s) => column.setState(s.altitude === undefined ? s : { ...s, ...altitudeState(s.altitude) }),
        redraw: () => column.render(),
        destroy: () => column.destroy(),
    };
}

/**
 * Model v překryvu (js/course/modelOverlay.js): šipky jen v otevřeném simulátoru, předvolby v adrese,
 * po zavření z adresy zmizí.
 * @param {Object} ids
 * @param {string} ids.host id prvku pro sloupec
 * @param {string} [ids.controls] id kontejneru ovládání nad sloupcem
 * @returns {import('./modelOverlay.js').ModelController}
 */
export function initBoyleModel({ host: hostId, controls: controlsId }) {
    const host = document.getElementById(hostId);
    if (!host) return {};
    const dialog = host.closest('dialog');
    const read = () => {
        const search = new URLSearchParams(window.location.search);
        return initialStateFromParams(readParams(search, BOYLE_PARAMS), search);
    };
    const model = createBoyleModel(host, {
        controlsHost: controlsId ? document.getElementById(controlsId) : null,
        state: read(),
    });
    let open = false;
    model.column.on('change', (s) => { if (open) syncUrl(paramsFromState(s)); });
    document.addEventListener('keydown', (e) => {
        const dir = modelArrowDir(e, { simOpen: Boolean(dialog?.open) });
        if (!dir) return;
        e.preventDefault();
        model.step(dir);
    });
    host.closest('.course-model')?.addEventListener('fullscreenchange-model', () => model.redraw());
    return {
        /** Předvolba z adresy (náhled bez ní nechá model, jak ho student nechal). */
        onOpen() {
            open = true;
            const search = new URLSearchParams(window.location.search);
            if (Object.keys(BOYLE_PARAMS).some((k) => search.has(k))) model.setState(read());
            model.redraw();
        },
        /** Předvolby po zavření z adresy zmizí, jinak by zůstaly při přechodu na další slide. */
        onClose() {
            open = false;
            syncUrl({ zvon: null, hloubka: null, vyska: null });
        },
    };
}
