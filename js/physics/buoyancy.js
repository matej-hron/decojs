/**
 * Archimédův zákon a kontrola vztlaku pro kurz P1 (kapitola Archimédův zákon a kontrola vztlaku, slidy 31–37).
 * Čistý modul bez DOM.
 *
 * Školní čísla jako přednáška: hustota vody 1 kg/l (1 000 kg/m³), g = 10 m/s², tlak p = 1 + h/10 bar
 * (js/physics/pressure.js). Vztlak a tíhu proto počítáme v kilogramech, jako slide 33, testy SPČR i praxe se zátěží:
 * 1 l vytlačené vody nadlehčuje jako 1 kg. Newtony jen tam, kde je chce příklad (slide 32, test SPČR č. 46).
 *
 * Model A1 „Potápěč a vztlak“ (slide 36, rozhodnutí Mateje 1–5 v archimedes-rozhodnuti.md):
 * - tělo potápěče je neutrální: zbytek potápěče (tělo, výstroj, zátěž) se nestlačuje a je vyvážený;
 * - oblek „pryž + bublinky“: pryž obleku se nestlačuje, plyn v bublinkách se řídí Boylem;
 * - vzduch v kompenzátoru (BC) se řídí Boylem; jeho množství je v bar · l (objem × tlak), to se při přesunu nemění;
 * - zátěž = výsledek slidu 33 (objem olova zanedbán jako v testu SPČR č. 34);
 * - start na hladině vyvážený s vypuštěným BC (rozhodnutí 5).
 *
 * Objemy v litrech, hmotnosti a vztlak v kilogramech, tlaky v barech, hloubka v metrech.
 */

import { pressureAt } from './pressure.js';
import { volumeAtDepth } from './boyle.js';

/** Hustota vody ve školních číslech (kg/l), slide 8. */
export const SCHOOL_WATER_DENSITY = 1;

/** Školní tíhové zrychlení (m/s²), jako přednáška. */
export const SCHOOL_G = 10;

/** Hustota vzduchu (kg/m³) při normálním tlaku a 10 °C, slide 8 (Hustota) a slide 37. */
export const AIR_DENSITY = 1.25;

/**
 * Hustota pryže obleku (kg/l): neopren je polychloropren, pevná pryž má 1,23 g/cm³.
 * Zdroj: https://en.wikipedia.org/wiki/Neoprene (infobox „Density 1.23 g/cm³ (solid)“). Rozhodnutí Mateje 3.
 */
export const RUBBER_DENSITY = 1.23;

/**
 * Oblek ze slidu 33: neoprenový oblek o hmotnosti 4 kg má u hladiny objem 12 l.
 * @typedef {{mass: number, volume: number}} Suit
 */
export const SLIDE_33_SUIT = Object.freeze({ mass: 4, volume: 12 });

/** Cesta potápěče ve scénáři A1 (rozhodnutí 1): sestup 0 → 10 → 20 m, výstup 20 → 10 → 5 → 0 m. */
export const A1_ROUTE = Object.freeze([0, 10, 20, 10, 5, 0]);

/** Pod touto hodnotou (kg) je potápěč vyvážený; kroky scénáře vyvažují přesně, tohle jen chrání proti zaokrouhlení. */
export const BALANCE_EPS = 1e-9;

const positive = (value, name) => {
    if (!(value > 0) || !Number.isFinite(value)) throw new RangeError(`${name} musí být kladné číslo: ${value}`);
};
const nonNegative = (value, name) => {
    if (!(value >= 0) || !Number.isFinite(value)) throw new RangeError(`${name} musí být nezáporné číslo: ${value}`);
};

/** Celkový tlak v hloubce ve školních číslech (bar). */
export const schoolPressure = (depth) => pressureAt(depth, { mode: 'school' }).total;

// ---------------------------------------------------------------- Archimédův zákon (slidy 31–32)

/**
 * Vztlak v kilogramech: hmotnost vody, kterou těleso vytlačí (slide 31).
 * @param {number} volume l ponořené části
 * @param {number} [waterDensity=1] kg/l
 * @returns {number} kg
 */
export function buoyancyKg(volume, waterDensity = SCHOOL_WATER_DENSITY) {
    nonNegative(volume, 'Objem');
    positive(waterDensity, 'Hustota vody');
    return volume * waterDensity;
}

/**
 * Vztlaková síla F_vz = V · ρ_v · g v newtonech (slide 32). Na hloubce nezávisí (test SPČR č. 46).
 * @param {number} volume l
 * @param {{waterDensity?: number, g?: number}} [options] hustota v kg/l, g v m/s²
 * @returns {number} N
 */
export function buoyantForce(volume, { waterDensity = SCHOOL_WATER_DENSITY, g = SCHOOL_G } = {}) {
    return buoyancyKg(volume, waterDensity) * g;
}

/**
 * Plave, vznáší se, nebo klesá: srovnání hustoty tělesa a vody (slide 31, test SPČR č. 49).
 * @param {number} bodyDensity
 * @param {number} waterDensity ve stejných jednotkách
 * @returns {'plave'|'vznáší se'|'klesá'}
 */
export function floatState(bodyDensity, waterDensity) {
    positive(bodyDensity, 'Hustota tělesa');
    positive(waterDensity, 'Hustota vody');
    if (bodyDensity < waterDensity) return 'plave';
    if (bodyDensity > waterDensity) return 'klesá';
    return 'vznáší se';
}

/**
 * Jaká část plovoucího tělesa je pod vodou: ρ_t / ρ_v (nejvýš 1).
 * @param {number} bodyDensity
 * @param {number} waterDensity
 * @returns {number} 0–1
 */
export function submergedFraction(bodyDensity, waterDensity) {
    floatState(bodyDensity, waterDensity);
    return Math.min(1, bodyDensity / waterDensity);
}

/**
 * Zdánlivá hmotnost pod vodou: hmotnost minus vztlak vlastního objemu (test SPČR č. 47: ocelová kostka).
 * @param {number} mass kg
 * @param {number} density kg/l tělesa
 * @param {number} [waterDensity=1] kg/l
 * @returns {number} kg (záporná = těleso plave)
 */
export function apparentMass(mass, density, waterDensity = SCHOOL_WATER_DENSITY) {
    nonNegative(mass, 'Hmotnost');
    positive(density, 'Hustota');
    return mass - buoyancyKg(mass / density, waterDensity);
}

// ---------------------------------------------------------------- zátěž a vzduch v lahvi (slidy 33 a 37)

/**
 * Kolik zátěže vyrovná vztlak obleku na hladině (slide 33, test SPČR č. 34). Objem olova se zanedbává.
 * @param {Suit} suit
 * @param {number} [waterDensity=1] kg/l
 * @returns {number} kg
 */
export function weightsForSuit(suit, waterDensity = SCHOOL_WATER_DENSITY) {
    nonNegative(suit.mass, 'Hmotnost obleku');
    return buoyancyKg(suit.volume, waterDensity) - suit.mass;
}

/**
 * Hmotnost vzduchu v lahvi (slide 37, testy SPČR č. 45): objem lahve × tlak = objem přepočtený na hladinu,
 * krát hustota vzduchu. Ideální plyn jako testy SPČR.
 * @param {number} cylinder l
 * @param {number} pressure bar v lahvi
 * @param {number} [airDensity=1.25] kg/m³
 * @returns {number} kg
 */
export function airMass(cylinder, pressure, airDensity = AIR_DENSITY) {
    positive(cylinder, 'Objem lahve');
    nonNegative(pressure, 'Tlak v lahvi');
    return (cylinder * pressure * airDensity) / 1000;
}

// ---------------------------------------------------------------- oblek a BC v hloubce (slide 36)

/**
 * Objem obleku v hloubce, varianta „pryž + bublinky“ (rozhodnutí 3): pryž (hmotnost / 1,23 kg/l) se nestlačuje,
 * zbytek objemu je plyn v bublinkách podle Boyla. Oblek ze slidu 33: 12 l → 7,6 l v 10 m → 6,2 l ve 20 m.
 * @param {number} depth m
 * @param {Suit} [suit]
 * @returns {number} l
 */
export function suitVolume(depth, suit = SLIDE_33_SUIT) {
    const rubber = suit.mass / RUBBER_DENSITY;
    const gas = suit.volume - rubber;
    if (!(gas >= 0)) throw new RangeError(`Oblek je těžší než jeho pryž: ${suit.mass} kg v ${suit.volume} l`);
    return rubber + volumeAtDepth(depth, { volume: gas, depth: 0, mode: 'school' });
}

/**
 * Objem vzduchu v BC v hloubce.
 * @param {number} depth m
 * @param {number} amount bar · l
 * @returns {number} l
 */
export function bcVolume(depth, amount) {
    nonNegative(amount, 'Množství vzduchu v BC');
    return amount / schoolPressure(depth);
}

/**
 * Kolik vzduchu (bar · l) je v BC, když má v hloubce daný objem.
 * @param {number} depth m
 * @param {number} volume l
 * @returns {number} bar · l
 */
export function bcAmount(depth, volume) {
    nonNegative(volume, 'Objem BC');
    return volume * schoolPressure(depth);
}

/**
 * Potápěč modelu A1: oblek a zátěž. Zbytek (tělo, výstroj) je neutrální, proto v něm není.
 * @typedef {{suit: Suit, weights: number}} Diver
 */

/** Potápěč ze slidů 33 a 36: oblek 12 l / 4 kg a zátěž 8 kg (výsledek slidu 33). */
export const A1_DIVER = Object.freeze({ suit: SLIDE_33_SUIT, weights: weightsForSuit(SLIDE_33_SUIT) });

/**
 * Stav potápěče v hloubce.
 * `net` je vztlak navíc v kg: kladný = přebývá, stoupá; záporný = chybí, klesá; 0 = vznáší se.
 * @param {number} depth m
 * @param {number} amount vzduch v BC (bar · l)
 * @param {Diver} [diver]
 * @returns {{depth: number, suit: number, bc: number, net: number}} objemy v l, net v kg
 */
export function diverState(depth, amount, diver = A1_DIVER) {
    const suit = suitVolume(depth, diver.suit);
    const bc = bcVolume(depth, amount);
    const net = buoyancyKg(suit + bc) - diver.suit.mass - diver.weights;
    return { depth, suit, bc, net };
}

/**
 * Vztlak navíc v hloubce (kg) při stálém množství vzduchu v BC: křivka v panelu modelu A1.
 * @param {number} depth m
 * @param {number} amount bar · l
 * @param {Diver} [diver]
 * @returns {number} kg
 */
export function netBuoyancy(depth, amount, diver = A1_DIVER) {
    return diverState(depth, amount, diver).net;
}

/**
 * Kolik vzduchu (bar · l) musí být v BC, aby se potápěč v hloubce vznášel. Když vztlak přebývá i s prázdným BC
 * (na hladině ze slidu 33 je to přesně 0), vrátí 0: BC víc vypustit nejde.
 * @param {number} depth m
 * @param {Diver} [diver]
 * @returns {number} bar · l
 */
export function balancedAmount(depth, diver = A1_DIVER) {
    const missing = -netBuoyancy(depth, 0, diver);
    return missing > 0 ? bcAmount(depth, missing / SCHOOL_WATER_DENSITY) : 0;
}

/**
 * Krok scénáře A1.
 * @typedef {Object} ScenarioStep
 * @property {'start'|'move'|'balance'} kind start, přesun do další hloubky, nebo vyvážení BC
 * @property {number} depth m
 * @property {number} amount vzduch v BC (bar · l)
 * @property {'inflate'|'deflate'|null} bcChange u vyvážení: přifouknout, nebo upustit
 */

/**
 * Kroky scénáře ze dvou pravidel (poučení z modelu lomu: generovat, ne ruční tabulka):
 * 1. „přesun“: do další hloubky cesty, vzduch v BC se nemění (jen Boyle);
 * 2. „vyvážit“: po přesunu pod hladinu, pokud potápěč není vyvážený, BC se přifoukne nebo upustí na nulový vztlak.
 * Na hladině se nevyvažuje: tam potápěč chce plavat.
 * Každý krok je tedy jedna změna: buď hloubka, nebo vzduch v BC.
 * @param {readonly number[]} [route] hloubky (m), první je start vyvážený s vypuštěným BC
 * @param {Diver} [diver]
 * @returns {ScenarioStep[]}
 */
export function buildScenario(route = A1_ROUTE, diver = A1_DIVER) {
    if (!route.length) throw new RangeError('Cesta potápěče je prázdná');
    route.forEach((d) => nonNegative(d, 'Hloubka'));
    const steps = [{ kind: 'start', depth: route[0], amount: 0, bcChange: null }];
    let amount = 0;
    for (const depth of route.slice(1)) {
        steps.push({ kind: 'move', depth, amount, bcChange: null });
        if (depth > 0 && Math.abs(netBuoyancy(depth, amount, diver)) > BALANCE_EPS) {
            const next = balancedAmount(depth, diver);
            steps.push({ kind: 'balance', depth, amount: next, bcChange: next > amount ? 'inflate' : 'deflate' });
            amount = next;
        }
    }
    return steps;
}
