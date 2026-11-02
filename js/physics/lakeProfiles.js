/**
 * Ilustrativní teplotní profily hlubokého lomu / jezera mírného pásma během roku
 * (kapitola P1 Hustota, slide 9 — „těžká“ voda klesá ke dnu).
 *
 * NEJDE o měření konkrétního lomu. Čísla jsou zvolená tak, aby ukázala typický
 * průběh v našich podmínkách: letní vrstvení (teplá vrstva, termoklina, u dna
 * kolem 4 °C), podzimní promíchání, zimní inverzní vrstvení pod ledem (0 °C u ledu,
 * kolem 4 °C u dna) a jarní promíchání.
 *
 * Tvar profilu: od hladiny do hloubky `mixed` je teplota `surface`, v pásmu
 * tloušťky `thick` přejde hladce (kosinem) na teplotu `bottom`, níž zůstává `bottom`.
 * Stejný vzorec dává letní profil (surface > bottom) i zimní inverzní (surface < bottom).
 */

/** @typedef {'zima'|'jarni-promichani'|'leto'|'podzimni-promichani'} LakePhase */

/**
 * @typedef {Object} LakeMonth
 * @property {string} name      název měsíce
 * @property {LakePhase} phase
 * @property {boolean} ice      na hladině je led
 * @property {number} surface   teplota u hladiny / pod ledem (°C)
 * @property {number} mixed     tloušťka promíchané vrstvy u hladiny (m)
 * @property {number} thick     tloušťka přechodu k teplotě u dna (m) — v létě termoklina
 * @property {number} bottom    teplota u dna (°C)
 */

/** @type {readonly LakeMonth[]} */
export const LAKE_MONTHS = Object.freeze([
    { name: 'leden',    phase: 'zima',                ice: true,  surface: 0,  mixed: 0,  thick: 8,  bottom: 4 },
    { name: 'únor',     phase: 'zima',                ice: true,  surface: 0,  mixed: 0,  thick: 8,  bottom: 4 },
    { name: 'březen',   phase: 'jarni-promichani',    ice: false, surface: 3,  mixed: 0,  thick: 10, bottom: 4 },
    { name: 'duben',    phase: 'jarni-promichani',    ice: false, surface: 6,  mixed: 2,  thick: 12, bottom: 4 },
    { name: 'květen',   phase: 'leto',                ice: false, surface: 13, mixed: 3,  thick: 7,  bottom: 4 },
    { name: 'červen',   phase: 'leto',                ice: false, surface: 18, mixed: 4,  thick: 7,  bottom: 4 },
    { name: 'červenec', phase: 'leto',                ice: false, surface: 21, mixed: 5,  thick: 8,  bottom: 4 },
    { name: 'srpen',    phase: 'leto',                ice: false, surface: 22, mixed: 6,  thick: 8,  bottom: 4 },
    { name: 'září',     phase: 'leto',                ice: false, surface: 18, mixed: 8,  thick: 8,  bottom: 4 },
    { name: 'říjen',    phase: 'leto',                ice: false, surface: 13, mixed: 11, thick: 9,  bottom: 4 },
    { name: 'listopad', phase: 'podzimni-promichani', ice: false, surface: 6,  mixed: 15, thick: 15, bottom: 4.5 },
    { name: 'prosinec', phase: 'zima',                ice: false, surface: 2,  mixed: 0,  thick: 8,  bottom: 4 },
].map(Object.freeze));

/** Popisky fází roku pro UI. */
export const LAKE_PHASE_LABELS = Object.freeze({
    'zima': 'zimní vrstvení',
    'jarni-promichani': 'jarní promíchání',
    'leto': 'letní vrstvení',
    'podzimni-promichani': 'podzimní promíchání',
});

function monthData(month) {
    if (!Number.isInteger(month) || month < 1 || month > 12) {
        throw new RangeError(`lakeProfiles: měsíc ${month} mimo 1–12`);
    }
    return LAKE_MONTHS[month - 1];
}

/**
 * @param {number} month 1–12
 * @returns {LakePhase}
 */
export function lakePhase(month) {
    return monthData(month).phase;
}

/**
 * @param {number} month 1–12
 * @returns {boolean} na hladině je led
 */
export function lakeHasIce(month) {
    return monthData(month).ice;
}

/**
 * Teplota vody (°C) v dané hloubce lomu v daném měsíci (ilustrativní).
 * @param {number} month    1–12
 * @param {number} depth    hloubka v m, 0 = hladina (pod ledem)
 * @param {number} maxDepth hloubka lomu v m
 * @returns {number} teplota ve °C
 */
export function lakeTemperature(month, depth, maxDepth) {
    const m = monthData(month);
    if (!(depth >= 0 && depth <= maxDepth)) {
        throw new RangeError(`lakeTemperature: hloubka ${depth} m mimo 0–${maxDepth} m`);
    }
    if (depth <= m.mixed) return m.surface;
    if (depth >= m.mixed + m.thick) return m.bottom;
    const s = 0.5 * (1 + Math.cos(Math.PI * (depth - m.mixed) / m.thick));
    return m.bottom + (m.surface - m.bottom) * s;
}

/**
 * Pojmenovaná pásma sloupce pro popisky v modelu.
 * @param {number} month
 * @param {number} maxDepth
 * @returns {{from: number, to: number, label: string}[]}
 */
export function lakeBands(month, maxDepth) {
    const m = monthData(month);
    const clip = (v) => Math.min(Math.max(v, 0), maxDepth);
    const transitionEnd = clip(m.mixed + m.thick);
    switch (m.phase) {
        case 'leto':
            return [
                { from: 0, to: clip(m.mixed), label: 'teplá vrstva' },
                { from: clip(m.mixed), to: transitionEnd, label: 'termoklina' },
                { from: transitionEnd, to: maxDepth, label: 'studená voda u dna' },
            ].filter(b => b.to > b.from);
        case 'zima':
            return [
                { from: 0, to: transitionEnd, label: m.ice ? 'studená voda pod ledem' : 'chladnoucí voda u hladiny' },
                { from: transitionEnd, to: maxDepth, label: 'nejhustší voda u dna' },
            ];
        default:
            return [{ from: 0, to: maxDepth, label: 'promíchaný sloupec' }];
    }
}
