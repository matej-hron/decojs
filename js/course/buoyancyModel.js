/**
 * Model A1 „Potápěč a vztlak“ (kurz P1, kapitola Archimédův zákon a kontrola vztlaku, slide 36).
 *
 * Vodní sloupec (js/components/WaterColumn.js) s vrstvou potápěče (waterColumn/buoyancyLayer.js). Tlak je jen
 * v odečtu, bez panelu a bez přepínače „školní / přesně“ (rozhodnutí Mateje 4d). Potápěč s oblekem ze slidu 33
 * a zátěží 8 kg začíná na hladině vyvážený s vypuštěným BC (rozhodnutí 4e a 5).
 *
 * Ovládání:
 * - šipky ← → (i klikr PageUp/PageDown) a tlačítka ‹ › v otevřeném modelu jdou po krocích scénáře
 *   (js/physics/buoyancy.js `buildScenario`): sestup 0 → 10 → 20 m a výstup 20 → 10 → 5 → 0 m, každý krok je
 *   jedna změna, buď přesun do další hloubky, nebo vyvážení BC (přifouknout / upustit);
 * - doma navíc: tlačítka „přifouknout 1 l“ / „upustit 1 l“ (litr v současné hloubce) a tažení hloubky; množství
 *   vzduchu v BC při tažení zůstane, takže je vidět, co Boyle udělá. Nic se nepřehrává samo.
 * Předvolby v URL: `?krok=6#model-vztlak` (js/course/modelParams.js), krok 1–10.
 */

import { createWaterColumn } from '../components/WaterColumn.js';
import { createBuoyancyLayer } from '../components/waterColumn/buoyancyLayer.js';
import { A1_DIVER, buildScenario, schoolPressure } from '../physics/buoyancy.js';
import { modelArrowDir, modelHeight, stepButton } from './pressureModel.js';
import { readParams, syncUrl } from './modelParams.js';

/** Hloubka sloupce (m): scénář jde do 20 m, pod ním je vidět, že křivka dál klesá. */
export const MODEL_MAX_DEPTH = 30;

/** Místo nad hladinou v em: potápěč na hladině má nad vodou lahev, vak BC a šipku „stoupá“ s popiskem. */
export const A1_HEADROOM_EM = 6.5;

/** Kroky scénáře A1 (generované ze dvou pravidel, ne ruční tabulka). */
export const A1_SCENARIO = Object.freeze(buildScenario().map((s) => Object.freeze(s)));

/** Kolik litrů (v současné hloubce) přidá nebo upustí jedno stisknutí tlačítka BC. */
export const BC_BUTTON_LITRES = 1;

/** Schéma předvoleb v URL: krok scénáře číslovaný od 1 jako v analýze. */
export const BUOYANCY_PARAMS = Object.freeze({
    krok: { min: 1, max: A1_SCENARIO.length, step: 1, default: 1 },
});

/**
 * Stav sloupce pro krok scénáře.
 * @param {number} index 0 … počet kroků − 1
 * @returns {{depth: number, diverBcAir: number, diverStep: number}}
 */
export function stepState(index) {
    const i = Math.max(0, Math.min(A1_SCENARIO.length - 1, Math.round(index)));
    const s = A1_SCENARIO[i];
    return { depth: s.depth, diverBcAir: s.amount, diverStep: i };
}

/**
 * Odpovídá stav přesně kroku scénáře? (Po ručním přifouknutí nebo tažení ne.)
 * @param {{depth: number, diverBcAir: number, diverStep: number}} state
 * @returns {boolean}
 */
export function onScenario(state) {
    const s = A1_SCENARIO[state.diverStep];
    return Boolean(s) && s.depth === state.depth && Math.abs(s.amount - state.diverBcAir) < 1e-9;
}

/**
 * Popisek kroku: „Krok 3 z 10: přifouknout BC“, po ruční změně „Krok 3 z 10 (upraveno)“.
 * @param {{depth: number, diverBcAir: number, diverStep: number}} state
 * @returns {string}
 */
export function stepLabel(state) {
    const i = state.diverStep;
    const s = A1_SCENARIO[i];
    if (!s) return '';
    const head = `Krok ${i + 1} z ${A1_SCENARIO.length}`;
    if (!onScenario(state)) return `${head} (upraveno)`;
    const place = s.depth === 0 ? 'na hladině' : `v${' '}${s.depth}${' '}m`;
    if (s.kind === 'start') return `${head}: vyvážený ${place}, BC vypuštěný`;
    if (s.kind === 'balance') return `${head}: ${s.bcChange === 'inflate' ? 'přifouknout' : 'upustit'} BC ${place}`;
    const prev = A1_SCENARIO[i - 1];
    return `${head}: ${s.depth > prev.depth ? 'sestup' : 'výstup'} ${s.depth === 0 ? 'na hladinu' : `do${' '}${s.depth}${' '}m`}`;
}

/**
 * Další krok scénáře ve směru šipky (na konci zůstane).
 * @param {number} index
 * @param {1|-1} dir
 * @returns {number}
 */
export function nextStep(index, dir) {
    return Math.max(0, Math.min(A1_SCENARIO.length - 1, (Number.isInteger(index) ? index : 0) + dir));
}

/**
 * Vzduch v BC po stisknutí tlačítka: ± 1 l v současné hloubce (bar · l = l · p), nikdy pod nulu.
 * @param {number} amount bar · l
 * @param {number} depth m
 * @param {1|-1} dir přifouknout / upustit
 * @returns {number} bar · l
 */
export function bcAfterButton(amount, depth, dir) {
    const next = amount + dir * BC_BUTTON_LITRES * schoolPressure(depth);
    return next > 1e-9 ? Math.round(next * 1e6) / 1e6 : 0;
}

/**
 * Počáteční stav z předvoleb.
 * @param {{krok: number}} params výstup readParams(…, BUOYANCY_PARAMS)
 * @returns {{depth: number, diverBcAir: number, diverStep: number}}
 */
export function initialStateFromParams(params) {
    return stepState(params.krok - 1);
}

/**
 * Předvolby do URL: krok scénáře, jen když není první (null = smazat).
 * @param {{diverStep: number}} state
 * @returns {{krok: number|null}}
 */
export function paramsFromState(state) {
    return { krok: state.diverStep > 0 ? state.diverStep + 1 : null };
}

/**
 * Místo nad hladinou: nízký náhled na slidu dostane jen 1 em jako B1.
 * @param {boolean} compact
 * @param {number} hostHeight px
 * @returns {number} em
 */
export function buoyancyHeadroom(compact, hostHeight) {
    return compact && hostHeight > 0 && hostHeight < 260 ? 1 : A1_HEADROOM_EM;
}

function bcButton(text, label) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'btn course-bc-btn';
    b.textContent = text;
    b.title = label;
    return b;
}

/**
 * Postaví model do `host`.
 * @param {HTMLElement} host prvek pro sloupec (`.course-plot.course-column-host`)
 * @param {Object} [options]
 * @param {HTMLElement} [options.controlsHost] kam dát tlačítka (výchozí: ovládání sloupce)
 * @param {{depth: number, diverBcAir: number, diverStep: number}} [options.state] počáteční stav
 * @param {boolean} [options.controls=true] false = jen sloupec (náhled na slidu)
 * @param {boolean} [options.compact=false] náhled: bez odečtu a posuvníku
 * @returns {{column: Object, step: (dir: 1|-1) => void, setState: (s: Object) => void, redraw: () => void, destroy: () => void}}
 */
export function createBuoyancyModel(host, { controlsHost = null, state = null, controls = true, compact = false } = {}) {
    const initial = state ?? stepState(0);
    let column = null;
    column = createWaterColumn(host, {
        maxDepth: MODEL_MAX_DEPTH,
        step: 1,
        depth: initial.depth,
        state: { diverBcAir: initial.diverBcAir, diverStep: initial.diverStep },
        height: modelHeight(host, () => column, compact),
        headroom: buoyancyHeadroom(compact, host.clientHeight),
        labels: { figure: 'Vodní sloupec: potápěč a vztlak' },
    });
    if (compact) column.el.classList.add('water-column-compact');

    const target = controlsHost ?? column.controlsEl;
    let status = null;
    if (controls) {
        const prev = stepButton('‹', 'Předchozí krok');
        const next = stepButton('›', 'Další krok');
        prev.addEventListener('click', () => step(-1));
        next.addEventListener('click', () => step(1));
        const steps = document.createElement('div');
        steps.className = 'course-pressure-steps';
        steps.append(prev, next);

        status = document.createElement('p');
        status.className = 'course-step-status';
        status.setAttribute('aria-live', 'polite');

        const bc = document.createElement('div');
        bc.className = 'course-bc-buttons';
        bc.setAttribute('role', 'group');
        bc.setAttribute('aria-label', 'Vzduch v BC');
        const inflate = bcButton('přifouknout 1 l', 'Přifouknout 1 l vzduchu do BC v této hloubce');
        const deflate = bcButton('upustit 1 l', 'Upustit 1 l vzduchu z BC v této hloubce');
        inflate.addEventListener('click', () => bcStep(1));
        deflate.addEventListener('click', () => bcStep(-1));
        bc.append(inflate, deflate);
        // popisek kroku až za tlačítky: mění délku, tlačítka tak mezi kroky neuskakují
        target.append(steps, bc, status);
    }
    column.addLayer(createBuoyancyLayer({ diver: A1_DIVER, scenario: A1_SCENARIO }));
    const syncStatus = (s) => { if (status) status.textContent = stepLabel(s); };
    syncStatus(column.getState());
    column.on('change', syncStatus);

    function step(dir) {
        column.setState(stepState(nextStep(column.getState().diverStep, dir)));
    }

    function bcStep(dir) {
        const s = column.getState();
        column.setState({ diverBcAir: bcAfterButton(s.diverBcAir, s.depth, dir) });
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
 * Model v překryvu (js/course/modelOverlay.js): šipky jen v otevřeném simulátoru, předvolba v adrese,
 * po zavření z adresy zmizí.
 * @param {Object} ids
 * @param {string} ids.host id prvku pro sloupec
 * @param {string} [ids.controls] id kontejneru ovládání nad sloupcem
 * @returns {import('./modelOverlay.js').ModelController}
 */
export function initBuoyancyModel({ host: hostId, controls: controlsId }) {
    const host = document.getElementById(hostId);
    if (!host) return {};
    const dialog = host.closest('dialog');
    const read = () => initialStateFromParams(readParams(new URLSearchParams(window.location.search), BUOYANCY_PARAMS));
    const model = createBuoyancyModel(host, {
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
            if (Object.keys(BUOYANCY_PARAMS).some((k) => search.has(k))) model.setState(read());
            model.redraw();
        },
        /** Předvolba po zavření z adresy zmizí, jinak by zůstala při přechodu na další slide. */
        onClose() {
            open = false;
            syncUrl({ krok: null });
        },
    };
}
