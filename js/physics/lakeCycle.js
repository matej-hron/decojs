/**
 * Modelový lom během roku (kapitola P1 Hustota, slide 9), zjednodušený na 5 stejných vrstev.
 * Letní teploty vody (LAKE_START, LAKE_SUMMER_TARGETS): odhad podle hlášení potápěčů z lomů Srní, Horní Cerekev a Šífr.
 * Zbytek roku dopočítaný z pravidel modelu níže, profil pod ledem (LAKE_UNDER_ICE) je zvolený tvar, ne hlášení.
 * Vzduch: průměr měsíce v ČR (ČHMÚ), viz LAKE_MONTH_SCENE. Teploty jsou ve °C.
 *
 * Průběh roku se negeneruje z ruční tabulky, ale ze dvou pravidel. Jeden krok je právě jedna změna:
 *   1. jedna vrstva se změní o 1 °C,
 *   2. dvě sousední vrstvy se prohodí, když je horní těžší než spodní (podle waterDensity).
 * Navíc jsou stavové kroky beze změny teplot: hladina zamrzla, únor pod ledem, led roztál.
 * Čísla se mění jen v LAKE_START, LAKE_SUMMER_TARGETS, LAKE_UNDER_ICE a LAKE_MONTH_SCENE níže.
 *
 * Pozice `pos` je spojitá: 0 = krok 1, 0.5 = půl cesty ke kroku 2, po posledním kroku následuje krok 1.
 */

import { waterDensity } from './waterDensity.js';

export const LAKE_MAX_DEPTH = 30;
/** Pět stejně velkých vrstev (m): stejná velikost dělá prohození poctivým. */
export const LAKE_BANDS = Object.freeze([[0, 6], [6, 12], [12, 18], [18, 24], [24, 30]]);
/** Hloubky na ose (m). */
export const LAKE_DEPTHS = Object.freeze([0, 6, 12, 18, 24, 30]);

/** Výchozí stav, srpen. */
const LAKE_START = Object.freeze([23, 10, 6, 5, 4]);
/** Pod ledem po jednom kroku (po zamrznutí hladiny). */
const LAKE_UNDER_ICE = Object.freeze([[0, 3, 4, 4, 4], [0, 2, 4, 4, 4], [0, 2, 3, 4, 4]]);
/** Léto: cíle na konci měsíce, po 1 °C, v rámci měsíce nejdřív hladina, pak níže. */
const LAKE_SUMMER_TARGETS = Object.freeze([
    ['duben', [8, 5, 4, 4, 4]],
    ['květen', [13, 6, 5, 4, 4]],
    ['červen', [19, 8, 5, 5, 4]],
    ['červenec', [22, 9, 6, 5, 4]],
    ['srpen', [23, 10, 6, 5, 4]],
]);

/**
 * Co patří k měsíci: teplota vzduchu, vítr, strom a listí na zemi.
 * Vzduch: průměr měsíce v ČR, normál ČHMÚ 1991–2020 (územní průměr Česko), zaokrouhleno na celé °C.
 * Zdroj: https://opendata.chmi.cz/meteorology/products/regional_averages/temperature/Normal_1991_2020_areal_temperature.csv
 * (leden −1,4, únor −0,4, březen 3,2, duben 8,5, květen 13,1, červen 16,5, červenec 18,3, srpen 17,9,
 * září 13,0, říjen 8,2, listopad 3,5, prosinec −0,4 °C; ověřeno 2026-11-08).
 * `wind` je účinek vzduchu na hladinu: 'warm' ji ohřívá, 'cold' ochlazuje.
 * @type {Readonly<Record<string, {air: number, wind: 'warm'|'cold', tree: string, groundLeaves: number}>>}
 */
const LAKE_MONTH_SCENE = Object.freeze({
    leden: { air: -1, wind: 'cold', tree: 'snow', groundLeaves: 0 },
    únor: { air: 0, wind: 'cold', tree: 'snow', groundLeaves: 0 },
    březen: { air: 3, wind: 'warm', tree: 'bare', groundLeaves: 0 },
    duben: { air: 9, wind: 'warm', tree: 'buds', groundLeaves: 0 },
    květen: { air: 13, wind: 'warm', tree: 'leaves', groundLeaves: 0 },
    červen: { air: 17, wind: 'warm', tree: 'leaves', groundLeaves: 0 },
    červenec: { air: 18, wind: 'warm', tree: 'leaves', groundLeaves: 0 },
    srpen: { air: 18, wind: 'warm', tree: 'leaves', groundLeaves: 0 },
    září: { air: 13, wind: 'cold', tree: 'falling', groundLeaves: 0.3 },
    říjen: { air: 8, wind: 'cold', tree: 'falling', groundLeaves: 0.7 },
    listopad: { air: 4, wind: 'cold', tree: 'bare', groundLeaves: 1 },
    prosinec: { air: 0, wind: 'cold', tree: 'bare', groundLeaves: 0.6 },
});

/** Pořadí měsíců pro `?mesic=1..12` a tlačítka měsíců. */
export const LAKE_MONTH_NAMES = Object.freeze(Object.keys(LAKE_MONTH_SCENE));
/** Zkratky na tlačítka měsíců: dvě písmena, ať se leden a listopad ani červen a červenec nepletou. */
export const LAKE_MONTH_ABBR = Object.freeze(['Le', 'Ún', 'Bř', 'Du', 'Kv', 'Čn', 'Čc', 'Sr', 'Zá', 'Ří', 'Li', 'Pr']);

/** @param {string} month @returns {number} teplota vzduchu v měsíci */
export const airOf = (month) => LAKE_MONTH_SCENE[month].air;

/**
 * @typedef {Object} LakeStep
 * @property {string} month
 * @property {number[]} temps  teplota vrstev od hladiny ke dnu
 * @property {boolean} ice  led na hladině
 * @property {'chlazení'|'ohřev'|'těžší'|'lehčí'|'výměna'|'promícháno'|'led'|'pod ledem'|'klid'|'tání'|'léto'} kind
 * @property {string} label  hlavní věta k výkladu
 * @property {number} [swap]  index horní vrstvy prohozené dvojice (jen u `výměna`)
 */

/**
 * Nejvýše položená dvojice, kde je horní voda těžší než spodní.
 * @param {readonly number[]} temps
 * @returns {number} index horní vrstvy, nebo −1, když je sloupec stabilní
 */
export function unstablePair(temps) {
    for (let i = 0; i + 1 < temps.length; i++) {
        if (waterDensity(temps[i]) > waterDensity(temps[i + 1])) return i;
    }
    return -1;
}

const allFour = (temps) => temps.every(t => t === 4);

/**
 * Podzimní měsíc podle nejnižší teploty hladiny dosud, aby prohození měsíc nevrátilo.
 * Nejvýš prosinec: hladina 0 °C bez ledu patří k prosincovému vzduchu 0 °C, led je až první krok ledna.
 */
function autumnMonth(lowest) {
    if (lowest >= 16) return 'září';
    if (lowest >= 10) return 'říjen';
    return lowest >= 6 ? 'listopad' : 'prosinec';
}

/**
 * Popisek prohození. Stoupá vždy lehčí voda; nad 4 °C je to ta teplejší, pod 4 °C ta chladnější.
 * @param {number} rising teplota vody, která stoupá
 * @param {number} sinking teplota vody, která klesá
 * @returns {string}
 */
export function swapLabel(rising, sinking) {
    return rising > sinking
        ? 'Vrstvy se prohodí: těžší voda klesá, teplejší stoupá'
        : 'Vrstvy se prohodí: těžší voda klesá, lehčí stoupá';
}

/**
 * Vygeneruje celý rok ze dvou pravidel. Krok 1 je výchozí srpen, po posledním kroku následuje znovu krok 1.
 * @returns {LakeStep[]}
 */
export function buildLakeSteps() {
    const steps = [{ month: 'srpen', temps: [...LAKE_START], ice: false, kind: 'léto', label: 'Letní vrstvení: teplejší a lehčí voda zůstává nahoře' }];
    let temps = [...LAKE_START];
    const push = (month, kind, label, extra = {}) => steps.push({ month, temps: [...temps], ice: false, kind, label, ...extra });

    /** Prohazuje od nejvýše položené dvojice, dokud není sloupec stabilní. */
    const settle = (month) => {
        for (let i = unstablePair(temps); i >= 0; i = unstablePair(temps)) {
            const [sinking, rising] = [temps[i], temps[i + 1]];
            temps[i] = rising;
            temps[i + 1] = sinking;
            push(month, 'výměna', swapLabel(rising, sinking), { swap: i });
        }
    };

    // Podzim: hladina −1 °C, pak případná prohození; končí, když hladina dosáhne 0 °C.
    let lowest = temps[0];
    while (temps[0] > 0) {
        temps[0] -= 1;
        lowest = Math.min(lowest, temps[0]);
        const month = autumnMonth(lowest);
        if (unstablePair(temps) === 0) push(month, 'těžší', 'Hladina je chladnější než vrstva pod ní, a proto těžší');
        else if (allFour(temps)) push(month, 'promícháno', 'Celý lom má 4\u00a0°C: podzimní promíchání');
        else if (temps[0] < 4) push(month, 'lehčí', 'Hladina chladne, pod 4\u00a0°C je lehčí a zůstává nahoře');
        else push(month, 'chlazení', 'Hladina chladne');
        settle(month);
    }

    // Zima: led, pod ledem po jednom kroku, únor klid.
    push('leden', 'led', 'Hladina zamrzla', { ice: true });
    for (const under of LAKE_UNDER_ICE) {
        temps = [...under];
        push('leden', 'pod ledem', 'Pod ledem voda pomalu chladne', { ice: true });
    }
    push('únor', 'klid', 'Led na hladině', { ice: true });

    // Jaro: led zmizí, hladina +1 °C a stejné pravidlo prohození, dokud není všude 4 °C.
    // Jakmile hladina poprvé překročí vzduch března, je duben a už se nevrací.
    let springMonth = 'březen';
    push(springMonth, 'tání', 'Led roztál');
    while (!allFour(temps)) {
        temps[0] += 1;
        if (temps[0] > airOf('březen')) springMonth = 'duben';
        if (unstablePair(temps) === 0) push(springMonth, 'těžší', 'Hladina má teplotu blíž 4\u00a0°C, a proto je těžší než voda pod ní');
        else if (allFour(temps)) push(springMonth, 'promícháno', 'Celý lom má 4\u00a0°C: jarní promíchání');
        else push(springMonth, 'ohřev', 'Hladina se ohřívá');
        settle(springMonth);
    }

    // Léto: po 1 °C přes cíle měsíců, shora dolů. Poslední krok by byl znovu výchozí srpen.
    for (const [month, target] of LAKE_SUMMER_TARGETS) {
        for (let k = 0; k < temps.length; k++) {
            while (temps[k] !== target[k]) {
                temps[k] += Math.sign(target[k] - temps[k]);
                push(month, 'léto', k === 0 ? 'Slunce ohřívá hladinu, lehčí voda zůstává nahoře' : 'Teplo pomalu proniká hlouběji');
            }
        }
    }
    steps.pop();
    return steps;
}

/** @type {readonly LakeStep[]} */
export const LAKE_STEPS = Object.freeze(buildLakeSteps());

/** Stav stromu jako čísla 0–1, aby šel plynule měnit: koruna, padající listí, sníh, pupeny. */
const TREE_STATES = Object.freeze({
    leaves: { crown: 1, falling: 0, snow: 0, buds: 0 },
    falling: { crown: 0.6, falling: 1, snow: 0, buds: 0 },
    bare: { crown: 0, falling: 0, snow: 0, buds: 0 },
    snow: { crown: 0, falling: 0, snow: 1, buds: 0 },
    buds: { crown: 0, falling: 0, snow: 0, buds: 1 },
});

/** @param {string} month @returns {string} klíč stavu stromu v měsíci */
export const treeOf = (month) => LAKE_MONTH_SCENE[month].tree;

/**
 * Rozsah prohození v metrech: dvě sousední vrstvy. Tam patří šipky.
 * @param {number} index krok typu `výměna`
 * @returns {[number, number]}
 */
export function exchangeRange(index) {
    const { swap } = LAKE_STEPS[index];
    return [LAKE_BANDS[swap][0], LAKE_BANDS[swap + 1][1]];
}

/**
 * První krok daného měsíce.
 * @param {number} monthNumber 1–12
 * @returns {number} index kroku
 */
export function firstStepOfMonth(monthNumber) {
    return LAKE_STEPS.findIndex(s => s.month === LAKE_MONTH_NAMES[monthNumber - 1]);
}

/**
 * Krok z předvolby v adrese; `krok` má přednost před `mesic`.
 * @param {{krok: number|null, mesic: number|null}} params
 * @returns {number|null} index kroku, nebo null bez předvolby
 */
export function stepFromParams({ krok, mesic }) {
    if (krok !== null) return krok - 1;
    return mesic !== null ? firstStepOfMonth(mesic) : null;
}

/**
 * Další nebo předchozí krok, dokola.
 * @param {number} index
 * @param {1|-1} dir
 * @returns {number}
 */
export function stepIndex(index, dir) {
    const n = LAKE_STEPS.length;
    return (index + dir + n) % n;
}

const lerp = (a, b, f) => a + (b - a) * f;
const round4 = (v) => Math.round(v * 1e4) / 1e4;

/**
 * Stav modelu v dané pozici cyklu.
 * @param {number} pos
 * @returns {{temps: number[], air: number, ice: number, warm: number, tree: Record<string, number>,
 *   groundLeaves: number, step: number, progress: number}} `step` je zobrazený krok (index)
 */
export function lakeFrame(pos) {
    const n = LAKE_STEPS.length;
    const p = ((pos % n) + n) % n;
    const i = Math.floor(p + 1e-9) % n;
    const raw = p - i;
    const f = raw < 1e-9 ? 0 : raw;
    const a = LAKE_STEPS[i];
    const b = LAKE_STEPS[(i + 1) % n];
    const sceneA = LAKE_MONTH_SCENE[a.month];
    const sceneB = LAKE_MONTH_SCENE[b.month];
    const treeA = TREE_STATES[sceneA.tree];
    const treeB = TREE_STATES[sceneB.tree];
    return {
        temps: a.temps.map((t, k) => round4(lerp(t, b.temps[k], f))),
        air: round4(lerp(sceneA.air, sceneB.air, f)),
        ice: round4(lerp(a.ice ? 1 : 0, b.ice ? 1 : 0, f)),
        warm: round4(lerp(sceneA.wind === 'warm' ? 1 : 0, sceneB.wind === 'warm' ? 1 : 0, f)),
        tree: Object.fromEntries(Object.keys(treeA).map(k => [k, round4(lerp(treeA[k], treeB[k], f))])),
        groundLeaves: round4(lerp(sceneA.groundLeaves, sceneB.groundLeaves, f)),
        step: f < 0.5 ? i : (i + 1) % n,
        progress: f,
    };
}

/**
 * Popisek teploty vzduchu: se skutečným minusem a nedělitelnou mezerou před jednotkou.
 * Je to průměr měsíce včetně nocí, proto to popisek říká: jinak mate vedle teplejší hladiny.
 * @param {number} t teplota ve °C
 * @param {{short?: boolean}} [options] `short` = úzký průřez (telefon, náhled): jen „průměr“
 * @returns {string}
 */
export function formatAirTemperature(t, { short = false } = {}) {
    const r = Math.round(t) + 0; // + 0: bez −0
    return `vzduch ${r < 0 ? '−' : ''}${Math.abs(r)} °C (${short ? 'průměr' : 'průměr měsíce'})`;
}

/**
 * Popisek šipky vzduchu podle účinku na hladinu, ne podle teploty vzduchu: v březnu hladinu ohřívá i vzduch 3 °C.
 * @param {number} warm 0–1, podíl „ohřívá“ v přechodu mezi měsíci
 * @returns {string}
 */
export function windLabelText(warm) {
    return warm >= 0.5 ? 'vzduch ohřívá hladinu' : 'vzduch ochlazuje hladinu';
}

/**
 * Krok modelu z klávesy. V otevřeném simulátoru šipky patří krokům i na posuvníku, jen tak funguje
 * krok dokola a prezentační klikr. Mimo simulátor přepínají slidy (`slideNav.js`).
 * @param {{key: string, altKey: boolean, ctrlKey: boolean, metaKey: boolean, shiftKey: boolean}} e
 * @param {{simOpen?: boolean}} [state]
 * @returns {1|-1|0}
 */
export function modelKeyStep(e, { simOpen = false } = {}) {
    if (!simOpen || (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight')) return 0;
    if (e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return 0;
    return e.key === 'ArrowRight' ? 1 : -1;
}

/** Barva vrstvy podle teploty: 4 °C světlá, výš červená, níž modrá. */
const COLOR_STOPS = [
    [0, [8, 104, 176]], [1, [26, 135, 214]], [2, [103, 182, 236]], [3, [165, 213, 243]], [4, [207, 232, 242]],
    [6, [246, 196, 174]], [8, [234, 128, 120]], [10, [226, 88, 108]], [14, [214, 38, 78]], [18, [190, 26, 66]], [23, [158, 14, 50]],
];

const toHex = (rgb) => `#${rgb.map(v => Math.round(v).toString(16).padStart(2, '0')).join('')}`;

/**
 * @param {number} t teplota ve °C
 * @returns {string} hex
 */
export function lakeTemperatureColor(t) {
    if (t <= COLOR_STOPS[0][0]) return toHex(COLOR_STOPS[0][1]);
    for (let i = 1; i < COLOR_STOPS.length; i++) {
        const [t1, c1] = COLOR_STOPS[i];
        if (t <= t1) {
            const [t0, c0] = COLOR_STOPS[i - 1];
            const f = (t - t0) / (t1 - t0);
            return toHex(c0.map((v, k) => lerp(v, c1[k], f)));
        }
    }
    return toHex(COLOR_STOPS.at(-1)[1]);
}

const luminance = (hex) => {
    const c = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255)
        .map(v => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
    return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
};

/**
 * Čitelná barva textu na dané ploše.
 * @param {string} background hex
 * @returns {string} černá, nebo bílá, podle toho, co má větší kontrast
 */
export function lakeTextColor(background) {
    const l = luminance(background);
    return (l + 0.05) / 0.05 >= 1.05 / (l + 0.05) ? '#000000' : '#ffffff'; // černá i ve středních tónech drží 4,5:1
}

/**
 * Plynulé míchání dvou barev (vítr: studený ↔ teplý).
 * @param {string} a hex
 * @param {string} b hex
 * @param {number} f 0 = a, 1 = b
 * @returns {string} hex
 */
export function mixColors(a, b, f) {
    const ch = (hex) => [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16));
    const ca = ch(a);
    const cb = ch(b);
    return toHex(ca.map((v, k) => lerp(v, cb[k], f)));
}
