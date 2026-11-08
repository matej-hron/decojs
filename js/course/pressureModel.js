/**
 * Model M1 „Tlak v hloubce“ (kurz P1, kapitola Tlak, slidy 15, 19 a 20).
 *
 * Vodní sloupec (js/components/WaterColumn.js) s vrstvou tlaku (waterColumn/pressureLayer.js).
 * Ovládání:
 * - hloubka: tažení ukazatele, klik do sloupce, posuvník (po 0,5 m);
 * - šipky ← → (i klikr PageUp/PageDown) a tlačítka ‹ › v otevřeném modelu skáčou po hloubkách tabulky ze slidu 20;
 * - hladina: moře (slaná voda) / horské jezero 5 500 m n. m. (sladká voda, jako v testu SPČR č. 54);
 * - čísla: školní / přesně.
 * Předvolby v URL: `?hloubka=40,5&hladina=5500&presne=1#model-tlak` (js/course/modelParams.js).
 */

import { createWaterColumn, defaultHeight } from '../components/WaterColumn.js';
import { createPressureLayer } from '../components/waterColumn/pressureLayer.js';
import { PRESSURE_MODES } from '../physics/pressure.js';
import { readParams, syncUrl } from './modelParams.js';

/** Hloubka sloupce (m): vejde se tabulka moře do 66 m. */
export const MODEL_MAX_DEPTH = 70;

/** Nadmořská výška horského jezera ze slidu 20 a testu SPČR č. 54 (m). */
export const LAKE_ALTITUDE = 5500;

/** Hloubky (m) tabulek „doplňme hodnoty celkového tlaku“ ze slidu 20. */
export const SLIDE20_DEPTHS = Object.freeze({
    sea: Object.freeze([0, 10, 20, 22, 28, 30, 33, 40.5, 66]),
    lake: Object.freeze([0, 10, 20, 30, 40, 45, 51, 55.5]),
});

/** Schéma předvoleb v URL. */
export const PRESSURE_PARAMS = Object.freeze({
    hloubka: { min: 0, max: MODEL_MAX_DEPTH, step: 0.5, default: 0 },
    hladina: { min: 0, max: LAKE_ALTITUDE, step: LAKE_ALTITUDE, default: 0 },
    presne: { min: 0, max: 1, step: 1, default: 0 },
});

/**
 * Scénář hladiny: moře = slaná voda u 0 m, horské jezero = sladká voda v 5 500 m.
 * @param {number} altitude m n. m.
 * @returns {{altitude: number, water: 'fresh'|'salt'}}
 */
export function surfaceScenario(altitude) {
    return altitude > 0 ? { altitude: LAKE_ALTITUDE, water: 'fresh' } : { altitude: 0, water: 'salt' };
}

/**
 * Hloubky tabulky ze slidu 20 pro danou hladinu.
 * @param {number} altitude
 * @returns {readonly number[]}
 */
export function tableDepths(altitude) {
    return altitude > 0 ? SLIDE20_DEPTHS.lake : SLIDE20_DEPTHS.sea;
}

/**
 * Další (dir = 1) nebo předchozí (dir = −1) hloubka tabulky. Na konci tabulky hloubka zůstane.
 * @param {number} depth m
 * @param {readonly number[]} depths vzestupně
 * @param {1|-1} dir
 * @returns {number}
 */
export function stepTableDepth(depth, depths, dir) {
    const eps = 1e-9;
    if (dir > 0) return depths.find((d) => d > depth + eps) ?? depth;
    return [...depths].reverse().find((d) => d < depth - eps) ?? depth;
}

/**
 * Směr kroku z klávesy v otevřeném modelu. Šipky ← → a klikr (PageUp/PageDown).
 * Posuvník a pole si šipky nechají (posuvník hloubky jde po 0,5 m).
 * @param {{key: string, target?: {tagName?: string}, altKey?: boolean, ctrlKey?: boolean, metaKey?: boolean, shiftKey?: boolean}} e
 * @param {{simOpen?: boolean}} [options]
 * @returns {-1|0|1}
 */
export function modelArrowDir(e, { simOpen = false } = {}) {
    if (!simOpen || e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return 0;
    const tag = e.target?.tagName;
    if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return 0;
    if (e.key === 'ArrowRight' || e.key === 'PageDown') return 1;
    if (e.key === 'ArrowLeft' || e.key === 'PageUp') return -1;
    return 0;
}

/**
 * Počáteční stav sloupce z předvoleb.
 * @param {{hloubka: number, hladina: number, presne: number}} params výstup readParams(…, PRESSURE_PARAMS)
 * @returns {{depth: number, altitude: number, water: string, pressureMode: string}}
 */
export function initialStateFromParams(params) {
    return {
        depth: params.hloubka,
        ...surfaceScenario(params.hladina),
        pressureMode: params.presne ? PRESSURE_MODES.EXACT : PRESSURE_MODES.SCHOOL,
    };
}

/**
 * Předvolby do URL: jen to, co se liší od výchozího (null = smazat).
 * @param {{depth: number, altitude: number, pressureMode: string}} state
 * @returns {{hloubka: number|null, hladina: number|null, presne: number|null}}
 */
export function paramsFromState(state) {
    return {
        hloubka: state.depth > 0 ? state.depth : null,
        hladina: state.altitude > 0 ? state.altitude : null,
        presne: state.pressureMode === PRESSURE_MODES.EXACT ? 1 : null,
    };
}

const DESKTOP = '(min-width: 769px)';

/**
 * Přepínač tlačítek (role group), sdílí ho model B1 kapitoly Stlačování plynů.
 * @param {string} label aria-label skupiny
 * @param {Array<[string|number, string]>} options hodnota a HTML popisek
 * @param {(value: string|number) => void} onPick
 * @returns {{el: HTMLElement, sync: (value: string|number) => void}}
 */
export function segmented(label, options, onPick) {
    const group = document.createElement('div');
    group.className = 'course-segmented';
    group.setAttribute('role', 'group');
    group.setAttribute('aria-label', label);
    const buttons = options.map(([value, text]) => {
        const b = document.createElement('button');
        b.type = 'button';
        b.dataset.value = String(value);
        b.innerHTML = text;
        b.addEventListener('click', () => onPick(value));
        return b;
    });
    group.append(...buttons);
    return {
        el: group,
        sync: (value) => buttons.forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.value === String(value)))),
    };
}

/**
 * Tlačítko kroku ‹ › v ovládání modelu.
 * @param {string} text
 * @param {string} label
 * @returns {HTMLButtonElement}
 */
export function stepButton(text, label) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'btn course-step-btn';
    b.textContent = text;
    b.title = label;
    b.setAttribute('aria-label', label);
    return b;
}

/**
 * Výška SVG sloupce v modelu: náhled podle rámečku, na desktopu celá výška překryvu bez odečtu, na telefonu výchozí.
 * @param {HTMLElement} host
 * @param {() => ({readoutEl?: HTMLElement}|null)} getColumn sloupec (vzniká až po této funkci)
 * @param {boolean} compact náhled na slidu
 * @returns {(width: number) => number}
 */
export function modelHeight(host, getColumn, compact) {
    return (width) => {
        if (compact) return Math.max(160, Math.round(host.clientHeight || width * 0.6));
        if (typeof window === 'undefined' || !window.matchMedia(DESKTOP).matches) return defaultHeight(width);
        const below = getColumn()?.readoutEl?.offsetHeight || 44;
        return Math.max(280, Math.floor(host.clientHeight - below - 16));
    };
}

/**
 * Postaví model do `host`.
 * @param {HTMLElement} host prvek pro sloupec (`.course-plot.course-column-host`)
 * @param {Object} [options]
 * @param {HTMLElement} [options.controlsHost] kam dát tlačítka a přepínače (výchozí: ovládání sloupce)
 * @param {Object} [options.state] počáteční stav (initialStateFromParams)
 * @param {boolean} [options.controls=true] false = jen sloupec (náhled na slidu)
 * @param {boolean} [options.compact=false] náhled: bez odečtu a posuvníku, nižší
 * @returns {{column: Object, step: (dir: 1|-1) => void, setState: (s: Object) => void, redraw: () => void, destroy: () => void}}
 */
export function createPressureModel(host, { controlsHost = null, state = null, controls = true, compact = false } = {}) {
    const initial = state ?? initialStateFromParams(readParams('', PRESSURE_PARAMS));
    let column = null;
    const height = modelHeight(host, () => column, compact);
    column = createWaterColumn(host, {
        maxDepth: MODEL_MAX_DEPTH,
        step: 0.5,
        depth: initial.depth,
        state: { altitude: initial.altitude, water: initial.water, pressureMode: initial.pressureMode },
        height,
        labels: { figure: 'Vodní sloupec: tlak v hloubce' },
    });
    if (compact) column.el.classList.add('water-column-compact');

    const target = controlsHost ?? column.controlsEl;
    let surface = null;
    if (controls) {
        const prev = stepButton('‹', 'Předchozí hloubka z tabulky');
        const next = stepButton('›', 'Další hloubka z tabulky');
        prev.addEventListener('click', () => step(-1));
        next.addEventListener('click', () => step(1));
        const steps = document.createElement('div');
        steps.className = 'course-pressure-steps';
        steps.append(prev, next);
        surface = segmented('Hladina', [[0, 'moře'], [LAKE_ALTITUDE, 'horské jezero 5&nbsp;500&nbsp;m&nbsp;n.&nbsp;m.']],
            (alt) => column.setState(surfaceScenario(alt)));
        target.append(steps, surface.el);
    }
    column.addLayer(createPressureLayer({ controls, controlsHost: target }));
    surface?.sync(column.getState().altitude);
    column.on('change', (s) => surface?.sync(s.altitude));

    function step(dir) {
        const s = column.getState();
        column.setState({ depth: stepTableDepth(s.depth, tableDepths(s.altitude), dir) });
    }

    return {
        column,
        step,
        setState: (s) => column.setState(s),
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
export function initPressureModel({ host: hostId, controls: controlsId }) {
    const host = document.getElementById(hostId);
    if (!host) return {};
    const dialog = host.closest('dialog');
    const read = () => initialStateFromParams(readParams(window.location.search, PRESSURE_PARAMS));
    const model = createPressureModel(host, {
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
            if (Object.keys(PRESSURE_PARAMS).some((k) => search.has(k))) model.setState(read());
            model.redraw();
        },
        /** Předvolby po zavření z adresy zmizí, jinak by zůstaly při přechodu na další slide. */
        onClose() {
            open = false;
            syncUrl({ hloubka: null, hladina: null, presne: null });
        },
    };
}
