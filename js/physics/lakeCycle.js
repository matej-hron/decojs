/**
 * Jezero během roku podle GIFu ze slidu 9 přednášky: 9 fází po 2 s, pět vrstev od hladiny ke dnu.
 * Čísla jsou z GIFu, je to schéma, ne měření. Popisky fází odvodil koordinátor z obrázku.
 *
 * Pozice `pos` je spojitá: 0 = fáze 1, 0.5 = půl cesty k fázi 2, po 8.x následuje znovu fáze 1.
 */

/**
 * @typedef {Object} LakePhase
 * @property {number[]} temps  teplota vrstev ve °C, od hladiny ke dnu
 * @property {'warm'|'cold'} wind
 * @property {string} tree  klíč do TREE_STATES
 * @property {number} groundLeaves  listí na zemi (0–1)
 * @property {boolean} ice  led na hladině
 * @property {string} label
 */

/** @type {readonly LakePhase[]} */
export const LAKE_PHASES = Object.freeze([
    { temps: [14, 10, 8, 6, 4], wind: 'warm', tree: 'full', groundLeaves: 0, ice: false, label: 'konec léta' },
    { temps: [10, 8, 6, 4, 4], wind: 'cold', tree: 'falling', groundLeaves: 0.4, ice: false, label: 'podzim' },
    { temps: [6, 6, 4, 4, 4], wind: 'cold', tree: 'bareLeaves', groundLeaves: 1, ice: false, label: 'podzim' },
    { temps: [4, 4, 4, 4, 4], wind: 'cold', tree: 'bare', groundLeaves: 0.8, ice: false, label: 'pozdní podzim' },
    { temps: [2, 3, 4, 4, 4], wind: 'cold', tree: 'bare', groundLeaves: 0.5, ice: false, label: 'začátek zimy' },
    { temps: [0, 1, 2, 3, 4], wind: 'cold', tree: 'snow', groundLeaves: 0, ice: true, label: 'zima' },
    { temps: [2, 3, 4, 4, 4], wind: 'warm', tree: 'bare', groundLeaves: 0, ice: false, label: 'jaro' },
    { temps: [4, 4, 4, 4, 4], wind: 'warm', tree: 'buds', groundLeaves: 0, ice: false, label: 'jaro' },
    { temps: [10, 8, 6, 4, 4], wind: 'warm', tree: 'leaves', groundLeaves: 0, ice: false, label: 'začátek léta' },
]);

/** Stav stromu jako čísla 0–1, aby šel plynule měnit: koruna, padající listí, sníh, pupeny. */
const TREE_STATES = Object.freeze({
    full: { crown: 1, falling: 0, snow: 0, buds: 0 },
    falling: { crown: 0.7, falling: 1, snow: 0, buds: 0 },
    bareLeaves: { crown: 0, falling: 0, snow: 0, buds: 0 },
    bare: { crown: 0, falling: 0, snow: 0, buds: 0 },
    snow: { crown: 0, falling: 0, snow: 1, buds: 0 },
    buds: { crown: 0, falling: 0, snow: 0, buds: 1 },
    leaves: { crown: 1, falling: 0, snow: 0, buds: 0 },
});

/** Tempo přehrávání jako v GIFu. */
export const PHASE_MS = 2000;
/** Začátek fáze stojí, ať se dá přečíst; zbytek je přechod na další. */
const HOLD_MS = 1000;

/** Přechody, při kterých se hladina blíží 4 °C a těžší voda klesá (index výchozí fáze). */
const SINKING_FROM = new Set([0, 1, 2, 5, 6]);

/**
 * @param {number} from index výchozí fáze (0 = fáze 1)
 * @returns {boolean} při přechodu na další fázi klesá voda z povrchové vrstvy
 */
export function isSinkingTransition(from) {
    return SINKING_FROM.has(from);
}

const lerp = (a, b, f) => a + (b - a) * f;
const round4 = (v) => Math.round(v * 1e4) / 1e4;

/**
 * Stav modelu v dané pozici cyklu.
 * @param {number} pos
 * @returns {{temps: number[], ice: number, warm: number, tree: Record<string, number>, groundLeaves: number,
 *   phase: number, progress: number, sinking: number}} `phase` je zobrazená fáze (index), `sinking` 0–1
 */
export function lakeFrame(pos) {
    const n = LAKE_PHASES.length;
    const p = ((pos % n) + n) % n;
    const i = Math.floor(p + 1e-9);
    const f = p - i < 1e-9 ? 0 : p - i;
    const a = LAKE_PHASES[i];
    const b = LAKE_PHASES[(i + 1) % n];
    const treeA = TREE_STATES[a.tree];
    const treeB = TREE_STATES[b.tree];
    return {
        temps: a.temps.map((t, k) => round4(lerp(t, b.temps[k], f))),
        ice: round4(lerp(a.ice ? 1 : 0, b.ice ? 1 : 0, f)),
        warm: round4(lerp(a.wind === 'warm' ? 1 : 0, b.wind === 'warm' ? 1 : 0, f)),
        tree: Object.fromEntries(Object.keys(treeA).map(k => [k, round4(lerp(treeA[k], treeB[k], f))])),
        groundLeaves: round4(lerp(a.groundLeaves, b.groundLeaves, f)),
        phase: f < 0.5 ? i : (i + 1) % n,
        progress: f,
        sinking: isSinkingTransition(i) ? round4(Math.sin(Math.PI * f)) : 0,
    };
}

const easeInOut = (x) => (x < 0.5 ? 2 * x * x : 1 - ((-2 * x + 2) ** 2) / 2);

/**
 * Pozice cyklu po uplynulém čase přehrávání.
 * @param {number} elapsedMs
 * @param {number} startPhase index fáze, odkud se přehrává
 * @returns {number}
 */
export function playPosition(elapsedMs, startPhase) {
    const n = LAKE_PHASES.length;
    const k = Math.floor(elapsedMs / PHASE_MS);
    const r = elapsedMs - k * PHASE_MS;
    const f = r <= HOLD_MS ? 0 : easeInOut((r - HOLD_MS) / (PHASE_MS - HOLD_MS));
    return (startPhase + k + f) % n;
}

/** Barva vrstvy podle teploty: °C → hex. Stejná logika jako v GIFu: 4 °C světlá, výš červená, níž modrá. */
const COLOR_STOPS = [
    [0, [8, 104, 176]], [1, [26, 135, 214]], [2, [103, 182, 236]], [3, [165, 213, 243]], [4, [207, 232, 242]],
    [6, [246, 196, 174]], [8, [234, 128, 120]], [10, [226, 88, 108]], [14, [214, 38, 78]],
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
