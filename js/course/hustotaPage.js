/**
 * Kapitola P1 Hustota: oba modely + společné chování kapitoly. Modely se otevírají
 * z náhledů na slidu 9 (`js/course/modelOverlay.js`) a staví se až při otevření.
 * Model 1 — hustota vody a teplota (`?teplota=&rozsah=`, kotva #model-hustota).
 * Model 2 — modelový lom během roku, posun po měsících (`?mesic=1..12`, kotva #model-lom).
 */

import { initChapter } from './chapter.js';
import { initModelOverlays } from './modelOverlay.js';
import { readParams, syncUrl } from './modelParams.js';
import { registerServiceWorker } from '../swRegister.js';
import { fmtNum } from '../format.js';
import { densityAt, waterDensity, ICE_DENSITY, MAX_DENSITY_TEMPERATURE } from '../physics/waterDensity.js';
import { LAKE_MONTHS, monthKeyStep } from '../physics/lakeCycle.js';
import { createDensityCurve } from '../components/DensityCurve.js';
import { createLakeCycle } from '../components/LakeCycle.js';

const NBSP = ' ';
const fmt = (v, d) => fmtNum(v, d, 'cs').replace('-', '−');

export const DENSITY_PARAMS = {
    teplota: { min: -5, max: 30, step: 0.5, default: 4 },
    rozsah: { min: 10, max: 30, step: 20, default: 10 },
};
/** Náhled lomu na slidu ukazuje srpen. */
const THUMB_MONTH = 7;
export const LAKE_PARAMS = {
    mesic: { min: 1, max: 12, step: 1, default: 1 },
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
    return {};
}

/**
 * Text odečtu modelu lomu.
 * @param {number} index měsíc (0 = leden)
 * @returns {{main: string, sub: string}}
 */
export function lakeReadout(index) {
    const m = LAKE_MONTHS[index];
    return { main: `${m.name[0].toUpperCase()}${m.name.slice(1)}`, sub: m.label };
}

function initLakeModel(initial) {
    const slider = document.getElementById('mesic-slider');
    const readout = document.getElementById('lom-mesic');
    const host = document.getElementById('lom-scene');
    const dialog = host?.closest('dialog');
    if (!slider || !host) return {};

    const lake = createLakeCycle(host, { month: initial.mesic - 1 });
    const show = () => {
        const index = lake.getMonth();
        slider.value = String(index + 1);
        slider.setAttribute('aria-valuetext', LAKE_MONTHS[index].name);
        const r = lakeReadout(index);
        readout.innerHTML = `${r.main}<span class="course-readout-sub">${r.sub}</span>`;
        syncUrl({ mesic: index + 1 });
    };
    const step = (dir) => { lake.step(dir); show(); };

    document.getElementById('mesic-predchozi')?.addEventListener('click', () => step(-1));
    document.getElementById('mesic-dalsi')?.addEventListener('click', () => step(1));
    host.addEventListener('click', () => step(1)); // klik kamkoli do průřezu = další měsíc
    slider.addEventListener('input', () => {
        lake.setMonth(Number(slider.value) - 1, { animate: true });
        show();
    });
    // Šipky a prezentační klikr: jen v otevřeném simulátoru, jinak přepínají slidy.
    document.addEventListener('keydown', (e) => {
        const dir = monthKeyStep(e, { simOpen: Boolean(dialog?.open) });
        if (!dir) return;
        e.preventDefault();
        step(dir);
    });
    host.closest('.course-model')?.addEventListener('fullscreenchange-model', () => lake.redraw());

    return {
        /** Předvolba z adresy (i z odkazu „Ukaž to v modelu“) ukáže měsíc bez animace. */
        onOpen() {
            lake.setMonth(readParams(window.location.search, LAKE_PARAMS).mesic - 1);
            lake.redraw();
            show();
        },
    };
}

/** Náhledy na slidu: skutečná data modelů, statické, ať na přednášce nic nerozptyluje. */
function initThumbs() {
    const densityHost = document.getElementById('nahled-hustota');
    const lakeHost = document.getElementById('nahled-jezero');
    if (densityHost) createDensityCurve(densityHost, { range: [0, 10], temperature: 4, compact: true });
    if (lakeHost) createLakeCycle(lakeHost, { compact: true, month: THUMB_MONTH });
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
        'model-lom': () => initLakeModel(readParams(window.location.search, LAKE_PARAMS)),
    });
    initPresetLinks(overlays);
    initChapter().then(() => overlays.openFromHash());
}
