/**
 * Kapitola P1 Hustota: oba modely + společné chování kapitoly. Modely se otevírají
 * z náhledů na slidu 9 (`js/course/modelOverlay.js`) a staví se až při otevření.
 * Model 1 — hustota vody a teplota (`?teplota=&rozsah=`, kotva #model-hustota).
 * Model 2 — jezero během roku podle GIFu z přednášky (`?faze=1..9`, kotva #model-lom).
 */

import { initChapter } from './chapter.js';
import { initModelOverlays } from './modelOverlay.js';
import { readParams, syncUrl } from './modelParams.js';
import { registerServiceWorker } from '../swRegister.js';
import { fmtNum } from '../format.js';
import { densityAt, waterDensity, ICE_DENSITY, MAX_DENSITY_TEMPERATURE } from '../physics/waterDensity.js';
import { LAKE_PHASES } from '../physics/lakeCycle.js';
import { createDensityCurve } from '../components/DensityCurve.js';
import { createLakeCycle } from '../components/LakeCycle.js';

const NBSP = ' ';
const fmt = (v, d) => fmtNum(v, d, 'cs').replace('-', '−');

export const DENSITY_PARAMS = {
    teplota: { min: -5, max: 30, step: 0.5, default: 4 },
    rozsah: { min: 10, max: 30, step: 20, default: 10 },
};
export const LAKE_PARAMS = {
    faze: { min: 1, max: 9, step: 1, default: null }, // bez předvolby se přehrává
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
 * Text odečtu modelu jezera.
 * @param {number} index fáze (0 = fáze 1)
 * @returns {{main: string, sub: string}}
 */
export function lakeReadout(index) {
    const p = LAKE_PHASES[index];
    return {
        main: `Fáze ${index + 1} z ${LAKE_PHASES.length}: ${p.label}`,
        sub: `${p.wind === 'warm' ? 'teplý' : 'studený'} vítr${p.ice ? ', na hladině led' : ''}`,
    };
}

function initLakeModel(initial) {
    const slider = document.getElementById('faze-slider');
    const readout = document.getElementById('jezero-faze');
    const playBtn = document.getElementById('jezero-play');
    const host = document.getElementById('jezero-scene');
    if (!slider || !host) return null;

    const showPhase = (index) => {
        slider.value = String(index + 1);
        slider.setAttribute('aria-valuetext', `${index + 1}: ${LAKE_PHASES[index].label}`);
        const r = lakeReadout(index);
        readout.innerHTML = `${r.main}<span class="course-readout-sub">${r.sub}</span>`;
    };
    const lake = createLakeCycle(host, { phase: initial.faze === null ? 0 : initial.faze - 1, onPhase: showPhase });

    const syncPlay = () => {
        const on = lake.isPlaying();
        playBtn.textContent = on ? 'Pozastavit' : 'Přehrát';
        playBtn.setAttribute('aria-pressed', String(on));
        readout.setAttribute('aria-live', on ? 'off' : 'polite'); // při přehrávání nečíst každou fázi
    };
    const play = () => { lake.play(); syncPlay(); syncUrl({ faze: null }); };
    const pause = () => { lake.pause(); syncPlay(); syncUrl({ faze: lake.getPhase() + 1 }); };

    playBtn.hidden = !lake.canPlay; // prefers-reduced-motion: jen krokování
    playBtn.addEventListener('click', () => (lake.isPlaying() ? pause() : play()));
    slider.addEventListener('input', () => {
        const index = Number(slider.value) - 1;
        lake.setPhase(index, { animate: true });
        syncPlay();
        syncUrl({ faze: index + 1 });
    });
    host.closest('.course-model')?.addEventListener('fullscreenchange-model', () => lake.redraw());

    return {
        /** Bez předvolby se hned přehrává, s `?faze=` ukáže fázi a stojí. */
        onOpen() {
            const { faze } = readParams(window.location.search, LAKE_PARAMS);
            if (faze === null) lake.play();
            else lake.setPhase(faze - 1);
            syncPlay();
        },
        onClose() {
            lake.pause();
            syncPlay();
        },
    };
}

/** Náhledy na slidu: skutečná data modelů. Jezero se v klidu přehrává, když je vidět. */
function initThumbs() {
    const densityHost = document.getElementById('nahled-hustota');
    const lakeHost = document.getElementById('nahled-jezero');
    if (densityHost) createDensityCurve(densityHost, { range: [0, 10], temperature: 4, compact: true });
    if (!lakeHost) return () => {};
    const lake = createLakeCycle(lakeHost, { compact: true });
    let visible = false;
    let simOpen = false;
    const sync = () => { if (visible && !simOpen) lake.play(); else lake.pause(); };
    new IntersectionObserver(([entry]) => { visible = entry.isIntersecting; sync(); }).observe(lakeHost);
    return (open) => { simOpen = open; sync(); };
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
    const setThumbsPaused = initThumbs();
    const overlays = initModelOverlays({
        'model-hustota': () => initDensityModel(readParams(window.location.search, DENSITY_PARAMS)),
        'model-lom': () => initLakeModel(readParams(window.location.search, LAKE_PARAMS)),
    }, { onToggle: setThumbsPaused });
    initPresetLinks(overlays);
    initChapter().then(() => overlays.openFromHash());
}
