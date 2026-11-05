/**
 * Kapitola P1 Hustota: oba modely + společné chování kapitoly. Modely se otevírají
 * z náhledů na slidu 9 (`js/course/modelOverlay.js`) a staví se až při otevření.
 * Model 1 — hustota vody a teplota (`?teplota=&rozsah=`, kotva #model-hustota).
 * Model 2 — modelový lom během roku, posun po krocích (`?krok=`, `?mesic=1..12`, kotva #model-lom).
 */

import { initChapter } from './chapter.js';
import { initModelOverlays } from './modelOverlay.js';
import { readParams, syncUrl } from './modelParams.js';
import { registerServiceWorker } from '../swRegister.js';
import { fmtNum } from '../format.js';
import { densityAt, waterDensity, ICE_DENSITY, MAX_DENSITY_TEMPERATURE } from '../physics/waterDensity.js';
import { LAKE_MONTH_NAMES, LAKE_STEPS, firstStepOfMonth, modelKeyStep, stepFromParams } from '../physics/lakeCycle.js';
import { createDensityCurve } from '../components/DensityCurve.js';
import { createLakeCycle } from '../components/LakeCycle.js';

const NBSP = ' ';
const fmt = (v, d) => fmtNum(v, d, 'cs').replace('-', '−');

export const DENSITY_PARAMS = {
    teplota: { min: -5, max: 30, step: 0.5, default: 4 },
    rozsah: { min: 10, max: 30, step: 20, default: 10 },
};
export const LAKE_PARAMS = {
    krok: { min: 1, max: LAKE_STEPS.length, step: 1, default: null },
    mesic: { min: 1, max: 12, step: 1, default: null },
};

/**
 * Text odečtu modelu 1.
 * @param {number} t teplota ve °C
 * @returns {{main: string, sub: string}}
 */
export function densityReadout(t) {
    const { phase, rho } = densityAt(t);
    const temp = `${fmt(t, Number.isInteger(t) ? 0 : 1)}${NBSP}°C`;
    if (phase === 'ice') {
        const drop = Math.round((1 - ICE_DENSITY / waterDensity(0)) * 100);
        return {
            main: `${temp}: led, hustota ${ICE_DENSITY}${NBSP}kg/m³`,
            sub: `Při zamrznutí se hustota skokem zmenší asi o ${drop}${NBSP}% — led plave.`,
        };
    }
    let sub;
    if (Math.abs(t - 4) < 0.25) sub = 'Největší hustota — tato voda klesá ke dnu.';
    else if (t < MAX_DENSITY_TEMPERATURE) sub = 'Pod 4 °C se voda ochlazováním zase roztahuje (anomálie vody).';
    else sub = 'Nad 4 °C má voda tím menší hustotu, čím je teplejší.';
    return { main: `${temp}: voda, hustota ${fmt(rho, 2)}${NBSP}kg/m³`, sub };
}

function initDensityModel(initial) {
    const slider = document.getElementById('teplota-slider');
    const readout = document.getElementById('hustota-readout');
    const plot = document.getElementById('hustota-plot');
    const rangeButtons = [...document.querySelectorAll('#model-hustota [data-range]')];
    if (!slider || !plot) return;

    let t = initial.teplota;
    let range = initial.rozsah;
    const curve = createDensityCurve(plot, { range: [0, range], temperature: t });

    const render = (writeUrl) => {
        slider.value = String(t);
        slider.setAttribute('aria-valuetext', `${fmt(t, 1)}\u00a0°C`);
        rangeButtons.forEach(b => b.setAttribute('aria-pressed', String(Number(b.dataset.range) === range)));
        curve.setRange([0, range]);
        curve.setTemperature(t);
        const r = densityReadout(t);
        readout.innerHTML = `${r.main}<span class="course-readout-sub">${r.sub}</span>`;
        if (writeUrl) syncUrl({ teplota: t, rozsah: range === DENSITY_PARAMS.rozsah.default ? null : range });
    };
    slider.addEventListener('input', () => {
        t = Number(slider.value);
        if (t > range) range = 30; // bod by utekl z grafu
        render(true);
    });
    rangeButtons.forEach(b => b.addEventListener('click', () => {
        range = Number(b.dataset.range);
        if (t > range) t = range; // bod nesmí potichu zmizet z grafu
        render(true);
    }));
    if (t > range) range = 30;
    render(false);
    return {
        /** Předvolba po zavření z adresy zmizí, jinak by zůstala při přechodu na další slide. */
        onClose() { syncUrl({ teplota: null, rozsah: null }); },
    };
}

/**
 * Text odečtu modelu lomu.
 * @param {number} index krok (0 = krok 1)
 * @returns {{main: string, sub: string, label: string}}
 */
export function lakeReadout(index) {
    const { month, label } = LAKE_STEPS[index];
    return { main: `${month[0].toUpperCase()}${month.slice(1)}`, sub: `krok ${index + 1} z ${LAKE_STEPS.length}`, label };
}

function initLakeModel() {
    const slider = document.getElementById('krok-slider');
    const readout = document.getElementById('lom-mesic');
    const labelEl = document.getElementById('lom-popisek');
    const host = document.getElementById('lom-scene');
    const dialog = host?.closest('dialog');
    if (!slider || !host) return {};

    const lake = createLakeCycle(host, { step: stepFromParams(readParams(window.location.search, LAKE_PARAMS)) ?? 0 });
    slider.max = String(LAKE_STEPS.length);

    // Řada tlačítek s měsíci: skočí na první krok měsíce.
    const monthButtons = LAKE_MONTH_NAMES.map((name, m) => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.textContent = name[0].toUpperCase();
        btn.title = name;
        btn.setAttribute('aria-label', name);
        btn.addEventListener('click', () => { lake.setStep(firstStepOfMonth(m + 1)); show(); });
        return btn;
    });
    document.getElementById('lom-mesice')?.append(...monthButtons);

    const show = () => {
        const index = lake.getStep();
        const r = lakeReadout(index);
        monthButtons.forEach((btn, m) => btn.setAttribute('aria-pressed', String(LAKE_MONTH_NAMES[m] === LAKE_STEPS[index].month)));
        slider.value = String(index + 1);
        slider.setAttribute('aria-valuetext', `${index + 1}, ${LAKE_STEPS[index].month}: ${r.label}`);
        readout.innerHTML = `${r.main}<span class="course-readout-sub">${r.sub}</span>`;
        labelEl.textContent = r.label;
        syncUrl({ krok: index + 1, mesic: null });
    };
    const step = (dir) => { lake.step(dir); show(); };

    document.getElementById('krok-predchozi')?.addEventListener('click', () => step(-1));
    document.getElementById('krok-dalsi')?.addEventListener('click', () => step(1));
    host.addEventListener('click', () => step(1)); // klik kamkoli do průřezu = další krok
    slider.addEventListener('input', () => {
        lake.setStep(Number(slider.value) - 1, { animate: true });
        show();
    });
    // Šipky a prezentační klikr: jen v otevřeném simulátoru, jinak přepínají slidy.
    document.addEventListener('keydown', (e) => {
        const dir = modelKeyStep(e, { simOpen: Boolean(dialog?.open) });
        if (!dir) return;
        e.preventDefault();
        step(dir);
    });
    host.closest('.course-model')?.addEventListener('fullscreenchange-model', () => lake.redraw());

    return {
        /** Předvolba z adresy (i z odkazu „Ukaž to v modelu“) ukáže krok bez animace; jinak zůstane poslední krok. */
        onOpen() {
            const preset = stepFromParams(readParams(window.location.search, LAKE_PARAMS));
            if (preset !== null) lake.setStep(preset);
            lake.redraw();
            show();
        },
        /** Předvolba po zavření z adresy zmizí, jinak by zůstala při přechodu na další slide. */
        onClose() { syncUrl({ krok: null, mesic: null }); },
    };
}

/** Náhledy na slidu: skutečná data modelů, statické, ať na přednášce nic nerozptyluje. */
function initThumbs() {
    const densityHost = document.getElementById('nahled-hustota');
    const lakeHost = document.getElementById('nahled-jezero');
    if (densityHost) createDensityCurve(densityHost, { range: [0, 10], temperature: 4, compact: true });
    if (lakeHost) createLakeCycle(lakeHost, { compact: true }) // krok 1 je srpen;
}

function initPresetLinks(overlays) {
    // Odkaz „Ukaž v modelu“: zapiš předvolbu do adresy a otevři simulátor bez znovunačtení.
    document.querySelectorAll('a[data-preset-link]').forEach(a => a.addEventListener('click', (e) => {
        e.preventDefault();
        const url = new URL(a.href);
        window.history.replaceState(null, '', `${url.pathname}${url.search}${window.location.hash}`);
        overlays.open(url.hash.slice(1));
    }));
}

if (typeof document !== 'undefined') {
    registerServiceWorker('../sw.js');
    initThumbs();
    const overlays = initModelOverlays({
        'model-hustota': () => initDensityModel(readParams(window.location.search, DENSITY_PARAMS)),
        'model-lom': () => initLakeModel(),
    });
    initPresetLinks(overlays);
    initChapter().then(() => overlays.openFromHash());
}
