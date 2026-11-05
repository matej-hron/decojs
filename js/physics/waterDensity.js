/**
 * Hustota vody v závislosti na teplotě (kapitola P1 Hustota, slide 9).
 *
 * Zdroj dat: M. Tanaka, G. Girard, R. Davis, A. Peuto, N. Bignell,
 * „Recommended table for the density of water between 0 °C and 40 °C based on
 * recent experimental reports“, Metrologia 38 (2001) 301–309 — doporučení CIPM
 * pro vzduchem nenasycenou čistou vodu (SMOW) při 101 325 Pa, ITS-90.
 * Vzorec platí v rozsahu 0–40 °C s nejistotou pod 0,001 kg/m³.
 *
 * Hustota ledu 917 kg/m³ (led Ih u 0 °C při normálním tlaku; přednáška ji
 * zaokrouhluje na 920 kg/m³).
 */

/** Koeficienty Tanakova vzorce (°C, °C, °C², °C, kg/m³). */
const A1 = -3.983035;
const A2 = 301.797;
const A3 = 522528.9;
const A4 = 69.34881;
const A5 = 999.974950;

/** Rozsah teplot (°C), kde vzorec platí. */
export const WATER_RANGE = Object.freeze([0, 40]);

/** Teplota (°C) největší hustoty vody — vrchol Tanakova vzorce, t = −a₁. */
export const MAX_DENSITY_TEMPERATURE = -A1;

/** Hustota ledu u 0 °C (kg/m³). */
export const ICE_DENSITY = 917;

/**
 * Hustota kapalné vody (kg/m³) při dané teplotě.
 * @param {number} celsius teplota ve °C, 0–40
 * @returns {number} hustota v kg/m³
 * @throws {RangeError} mimo rozsah platnosti vzorce
 */
export function waterDensity(celsius) {
    if (!(celsius >= WATER_RANGE[0] && celsius <= WATER_RANGE[1])) {
        throw new RangeError(`waterDensity: ${celsius} °C mimo rozsah ${WATER_RANGE.join('–')} °C`);
    }
    const t = celsius;
    return A5 * (1 - ((t + A1) ** 2 * (t + A2)) / (A3 * (t + A4)));
}

/**
 * Skupenství a hustota vody při dané teplotě: pod 0 °C led, jinak kapalná voda.
 * (Model neřeší podchlazenou vodu — v přírodě pod 0 °C voda mrzne.)
 * @param {number} celsius teplota ve °C (−∞ až 40)
 * @returns {{phase: 'ice'|'water', rho: number}}
 */
export function densityAt(celsius) {
    if (celsius < 0) return { phase: 'ice', rho: ICE_DENSITY };
    return { phase: 'water', rho: waterDensity(celsius) };
}
