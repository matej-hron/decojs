/**
 * Boyle-Mariottův zákon a spotřeba vzduchu pro kurz P1 (kapitola Stlačování plynů, slidy 23–30).
 * Čistý modul bez DOM.
 *
 * Při stálém množství plynu a stálé teplotě je p₁ · V₁ = p₂ · V₂. Tlak v hloubce bere z
 * `js/physics/pressure.js`, takže platí oba jeho režimy („školní“ výchozí jako přednáška a „přesně“).
 *
 * Spotřeba: hladinová spotřeba (SAC) je objem vzduchu za minutu při tlaku na hladině p₀. V hloubce dýchá potápěč
 * stejně velké nádechy stlačeného vzduchu, takže z lahve ubývá SAC · p / p₀ litrů (přepočteno na hladinu) za minutu,
 * tedy SAC · p bar · l za minutu. Zásoba v lahvi je objem lahve · tlak, také v bar · l, a proto se čas do rezervy
 * i hladinová spotřeba z poklesu tlaku počítají s p, ne s p / p₀ (review R4-06). Ve školním režimu je p₀ = 1 bar.
 *
 * Objemy v litrech, tlaky v barech, hloubka v metrech, čas v minutách.
 */

import { pressureAt } from './pressure.js';

/**
 * @typedef {Object} PressureOptions
 * @property {'school'|'exact'} [mode='school']
 * @property {number} [altitude=0] m n. m.
 * @property {'fresh'|'salt'} [water='salt']
 */

const positive = (value, name) => {
    if (!(value > 0) || !Number.isFinite(value)) throw new RangeError(`${name} musí být kladné číslo: ${value}`);
};
const nonNegative = (value, name) => {
    if (!(value >= 0) || !Number.isFinite(value)) throw new RangeError(`${name} musí být nezáporné číslo: ${value}`);
};

/** Celkový tlak v hloubce (bar); výchozí je mořská voda u hladiny moře jako u modelu M1. */
const totalPressure = (depth, { mode = 'school', altitude = 0, water = 'salt' } = {}) =>
    pressureAt(depth, { mode, altitude, water }).total;

/**
 * p₁ · V₁ = p₂ · V₂ → V₂.
 * @param {number} v1 objem při tlaku p1
 * @param {number} p1
 * @param {number} p2
 * @returns {number} V₂
 */
export function boyleVolume(v1, p1, p2) {
    nonNegative(v1, 'Objem');
    positive(p1, 'Tlak p₁');
    positive(p2, 'Tlak p₂');
    return (p1 * v1) / p2;
}

/**
 * Objem plynu v hloubce, když známe jeho objem v jiné (výchozí) hloubce.
 * @param {number} depth m, kde objem hledáme
 * @param {PressureOptions & {volume: number, depth: number}} gas `volume` (l) v hloubce `depth` (m)
 * @returns {number} l
 */
export function volumeAtDepth(depth, { volume, depth: refDepth, ...pressure }) {
    return boyleVolume(volume, totalPressure(refDepth, pressure), totalPressure(depth, pressure));
}

/**
 * Změna objemu při přesunu z jedné hloubky do druhé (slide 26: „ze 40 do 30 m jen o 1,5 l“).
 * @param {number} fromDepth m
 * @param {number} toDepth m
 * @param {PressureOptions & {volume: number, depth: number}} gas
 * @returns {{from: number, to: number, delta: number, ratio: number}} objemy (l), rozdíl (l), poměr to/from
 */
export function volumeChange(fromDepth, toDepth, gas) {
    const from = volumeAtDepth(fromDepth, gas);
    const to = volumeAtDepth(toDepth, gas);
    return { from, to, delta: to - from, ratio: to / from };
}

/**
 * Spotřeba v hloubce přepočtená na hladinu: tolik litrů za minutu ubývá z lahve.
 * @param {number} sac hladinová spotřeba (l/min)
 * @param {number} depth m
 * @param {PressureOptions} [pressure]
 * @returns {number} l/min
 */
export function consumptionAtDepth(sac, depth, pressure = {}) {
    nonNegative(sac, 'Hladinová spotřeba');
    return (sac * totalPressure(depth, pressure)) / totalPressure(0, pressure);
}

/**
 * Kolik vzduchu (přepočteno na hladinu) potápěč spotřebuje za čas v hloubce (slide 28).
 * @param {PressureOptions & {sac: number, depth: number, time: number}} p
 * @returns {number} l
 */
export function gasUsed({ sac, depth, time, ...pressure }) {
    nonNegative(time, 'Čas');
    return consumptionAtDepth(sac, depth, pressure) * time;
}

/**
 * Použitelná zásoba vzduchu v lahvi: objem lahve × (počáteční tlak − rezerva) (slide 29).
 * Výsledek je v bar · l, tedy v litrech při 1 bar (ve školním režimu totéž co litry přepočtené na hladinu).
 * @param {{cylinder: number, start: number, reserve?: number}} p objem lahve (l), tlaky v lahvi (bar)
 * @returns {number} bar · l
 */
export function usableGas({ cylinder, start, reserve = 0 }) {
    positive(cylinder, 'Objem lahve');
    nonNegative(reserve, 'Rezerva');
    if (!(start >= reserve)) throw new RangeError(`Počáteční tlak ${start} je menší než rezerva ${reserve}`);
    return cylinder * (start - reserve);
}

/**
 * Jak dlouho vydrží zásoba v hloubce, než tlak v lahvi klesne na rezervu (slide 29). Sestup a výstup nepočítá.
 * @param {PressureOptions & {cylinder: number, start: number, reserve?: number, sac: number, depth: number}} p
 * @returns {number} min
 */
export function timeToReserve({ cylinder, start, reserve = 0, sac, depth, ...pressure }) {
    positive(sac, 'Hladinová spotřeba');
    // bar · l / (l/min · bar)
    return usableGas({ cylinder, start, reserve }) / (sac * totalPressure(depth, pressure));
}

/**
 * Hladinová spotřeba z poklesu tlaku v lahvi za čas v hloubce (slide 30).
 * @param {PressureOptions & {cylinder: number, drop: number, time: number, depth: number}} p
 * @returns {number} l/min
 */
export function sacFromPressureDrop({ cylinder, drop, time, depth, ...pressure }) {
    positive(cylinder, 'Objem lahve');
    nonNegative(drop, 'Pokles tlaku');
    positive(time, 'Čas');
    return (cylinder * drop) / time / totalPressure(depth, pressure);
}
