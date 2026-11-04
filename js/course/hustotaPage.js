/**
 * Kapitola P1 Hustota: oba modely + společné chování kapitoly.
 * Model 1 — hustota vody a teplota (`?teplota=&rozsah=`, kotva #model-hustota).
 * Model 2 — lom během roku ve vodním sloupci (`?mesic=&hloubka=`, kotva #model-lom).
 */

import { initChapter } from './chapter.js';
import { readParams, syncUrl } from './modelParams.js';
import { registerServiceWorker } from '../swRegister.js';
import { fmtNum } from '../format.js';
import { densityAt, waterDensity, ICE_DENSITY, MAX_DENSITY_TEMPERATURE } from '../physics/waterDensity.js';
import { lakeTemperature, lakeBands, lakeHasIce, lakePhase, LAKE_MONTHS, LAKE_PHASE_LABELS } from '../physics/lakeProfiles.js';
import { createDensityCurve } from '../components/DensityCurve.js';
import { createWaterColumn } from '../components/WaterColumn.js';
import { createTemperatureLayer } from '../components/waterColumn/temperatureLayer.js';

const NBSP = ' ';
const fmt = (v, d) => fmtNum(v, d, 'cs').replace('-', '−');

export const DENSITY_PARAMS = {
    teplota: { min: -5, max: 30, step: 0.5, default: 4 },
    rozsah: { min: 10, max: 30, step: 20, default: 10 },
};
export const LAKE_PARAMS = {
    mesic: { min: 1, max: 12, step: 1, default: 8 },
    hloubka: { min: 0, max: 40, step: 1, default: 0 },
};
const LAKE_DEPTH = 40;

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
}

function initLakeModel(initial) {
    const slider = document.getElementById('mesic-slider');
    const phaseEl = document.getElementById('lom-phase');
    const host = document.getElementById('lom-column');
    if (!slider || !host) return null;

    const column = createWaterColumn(host, {
        maxDepth: LAKE_DEPTH,
        depth: initial.hloubka,
        surface: lakeHasIce(initial.mesic) ? 'ice' : 'water',
        aside: true,
        // Na projektoru (na šířku) se model i s ovládáním vejde na jednu obrazovku.
        // Hlavička a popisky slidu rostou s výškou okna, proto ne pevný odečet.
        height: (width) => Math.round(Math.max(300, Math.min(width < 600 ? width * 1.05 : width * 0.5,
            window.innerHeight * 0.93 - 320))),
    });
    column.setState({ month: initial.mesic });
    column.addLayer(createTemperatureLayer({
        profile: (depth, state) => lakeTemperature(state.month, Math.min(depth, LAKE_DEPTH), LAKE_DEPTH),
        range: [0, 25],
        bands: (state) => lakeBands(state.month, LAKE_DEPTH),
    }));

    const renderPhase = (m) => {
        slider.value = String(m);
        const name = LAKE_MONTHS[m - 1].name;
        slider.setAttribute('aria-valuetext', name);
        phaseEl.innerHTML = `${name[0].toUpperCase()}${name.slice(1)}<span class="course-readout-sub">${LAKE_PHASE_LABELS[lakePhase(m)]}${lakeHasIce(m) ? ', na hladině led' : ''}</span>`;
    };
    slider.addEventListener('input', () => {
        const m = Number(slider.value);
        column.setState({ month: m, surface: lakeHasIce(m) ? 'ice' : 'water' });
        renderPhase(m);
        syncUrl({ mesic: m });
    });
    column.on('change', (state, { changed }) => {
        if (changed.includes('depth')) syncUrl({ hloubka: state.depth });
    });
    renderPhase(initial.mesic);

    host.closest('.course-model')?.addEventListener('fullscreenchange-model', () => column.render());

    /** Nastaví předvolbu (z odkazu „Ukaž v modelu“) bez znovunačtení stránky. */
    return (p) => {
        column.setState({ month: p.mesic, depth: p.hloubka, surface: lakeHasIce(p.mesic) ? 'ice' : 'water' });
        renderPhase(p.mesic);
        syncUrl({ mesic: p.mesic, hloubka: p.hloubka });
    };
}

function initPresetLinks(applyLake) {
    // Odkaz „Ukaž v modelu“ na téže stránce: nastav předvolbu bez znovunačtení.
    document.querySelectorAll('a[data-preset-link]').forEach(a => a.addEventListener('click', (e) => {
        if (!applyLake) return;
        e.preventDefault();
        const url = new URL(a.href);
        applyLake(readParams(url.search, LAKE_PARAMS));
        document.getElementById(url.hash.slice(1))?.scrollIntoView({ behavior: 'smooth' });
    }));
}

if (typeof document !== 'undefined') {
    registerServiceWorker('../sw.js');
    const search = window.location.search;
    initDensityModel(readParams(search, DENSITY_PARAMS));
    initPresetLinks(initLakeModel(readParams(search, LAKE_PARAMS)));
    initChapter();
}
