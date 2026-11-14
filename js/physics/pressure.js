/**
 * Tlak v hloubce pro kurz P1 (kapitola Tlak, slidy 15–20). Čistý modul bez DOM.
 *
 * Celkový tlak p = p_atm + p_h ve dvou režimech:
 * - „školní“ (výchozí, jako přednáška): u moře 1 bar, ρ = 1 000 kg/m³, g = 10 m/s²,
 *   tedy p = h/10 + 1 bar. Atmosférický tlak ve výšce je tabulka ze slidu 17 (standardní
 *   atmosféra přepočtená na 100 kPa u moře) zaokrouhlená na 0,1 bar, takže horské jezero
 *   v 5 500 m má na hladině 0,5 bar jako ve slidu 20 a v testu SPČR č. 54.
 * - „přesně“: atmosférický tlak podle výšky z `js/deco/environment.js` (1,013 25 bar u moře),
 *   hustota vody z `WATER_DENSITIES` (sladká 1 000, mořská 1 025 kg/m³), g = 9,806 65 m/s².
 *
 * Tlaky jsou v barech, hloubka v metrech, výška v metrech nad mořem.
 */

import { getPressureAtAltitude, getPressurePerMeter } from '../deco/environment.js';
import { SURFACE_PRESSURE, WATER_TYPES } from '../deco/constants.js';

/**
 * Tabulka slidu 17 (p1/tlak.html, „Atmosférický tlak“, výšková stupnice): výška (m n. m.) → tlak vzduchu (kPa).
 * Jediné místo, odkud ji berou modely (B1 „Balónek a zvon“: předvolby výšky). Stupnice na slidu je statické SVG;
 * tests/boyle-altitude.test.mjs hlídá, že se její popisky i aria-label s touto tabulkou shodují, a
 * tests/pressure.test.mjs, že tabulka odpovídá standardní atmosféře přepočtené na 100 kPa u moře.
 */
export const SLIDE_ALTITUDE_KPA = Object.freeze({
    0: 100, 100: 98.8, 200: 97.6, 500: 94.2, 1000: 88.6, 2000: 78.4, 3000: 69.1, 4000: 60.8,
    5000: 53.3, 5500: 49.8, 6000: 46.5, 7000: 40.5, 8000: 35.1, 9000: 30.3, 10000: 26,
});

/** Režimy výpočtu. */
export const PRESSURE_MODES = Object.freeze({ SCHOOL: 'school', EXACT: 'exact' });

/** Krok, na který školní režim zaokrouhluje atmosférický tlak ve výšce (bar). */
export const SCHOOL_ALTITUDE_STEP_BAR = 0.1;

/** Školní hydrostatický tlak na metr: ρ · g = 1 000 · 10 Pa/m = 0,1 bar/m. */
const SCHOOL_PER_METER = 0.1;

/** Scénářový klíč vodního sloupce (`'fresh'` | `'salt'`) → typ vody v `js/deco/`. */
const WATER_KEYS = Object.freeze({ fresh: WATER_TYPES.FRESH, salt: WATER_TYPES.SEA });

function checkMode(mode) {
    if (mode !== PRESSURE_MODES.SCHOOL && mode !== PRESSURE_MODES.EXACT) {
        throw new RangeError(`Neznámý režim tlaku: ${mode}`);
    }
}

/**
 * Atmosférický tlak přepočtený na 1 bar u moře, jako tabulka ve slidu 17.
 * @param {number} altitude m n. m.
 * @returns {number} bar
 */
export function normalizedAtmosphere(altitude = 0) {
    return getPressureAtAltitude(altitude) / SURFACE_PRESSURE;
}

/**
 * Atmosférický tlak na hladině.
 * @param {number} [altitude=0] m n. m.
 * @param {{mode?: 'school'|'exact'}} [options]
 * @returns {number} bar
 */
export function atmosphericPressure(altitude = 0, { mode = PRESSURE_MODES.SCHOOL } = {}) {
    checkMode(mode);
    if (mode === PRESSURE_MODES.EXACT) return getPressureAtAltitude(altitude);
    const steps = Math.round(normalizedAtmosphere(altitude) / SCHOOL_ALTITUDE_STEP_BAR);
    return Math.round(steps * SCHOOL_ALTITUDE_STEP_BAR * 1e6) / 1e6;
}

/**
 * Hydrostatický tlak p_h = h · ρ · g.
 * @param {number} depth m
 * @param {{mode?: 'school'|'exact', water?: 'fresh'|'salt'}} [options]
 * @returns {number} bar
 */
export function hydrostaticPressure(depth, { mode = PRESSURE_MODES.SCHOOL, water = 'fresh' } = {}) {
    checkMode(mode);
    if (!(depth >= 0)) throw new RangeError(`Hloubka musí být nezáporné číslo: ${depth}`);
    if (mode === PRESSURE_MODES.SCHOOL) return depth * SCHOOL_PER_METER;
    const waterType = WATER_KEYS[water];
    if (!waterType) throw new RangeError(`Neznámý typ vody: ${water}`);
    return depth * getPressurePerMeter({ waterType });
}

/**
 * Celkový tlak v hloubce a jeho dvě složky.
 * @param {number} depth m
 * @param {{mode?: 'school'|'exact', altitude?: number, water?: 'fresh'|'salt', atm?: number}} [options]
 *   `atm` (bar): atmosférický tlak na hladině, když ho určuje stránka (model B1 podle tabulky slidu 17);
 *   bez něj se počítá z `altitude` a režimu.
 * @returns {{atm: number, hydro: number, total: number}} bar
 */
export function pressureAt(depth, { mode = PRESSURE_MODES.SCHOOL, altitude = 0, water = 'fresh', atm: given } = {}) {
    if (given !== undefined && !(given > 0 && Number.isFinite(given))) {
        throw new RangeError(`Atmosférický tlak musí být kladné číslo: ${given}`);
    }
    const atm = given ?? atmosphericPressure(altitude, { mode });
    const hydro = hydrostaticPressure(depth, { mode, water });
    return { atm, hydro, total: atm + hydro };
}
