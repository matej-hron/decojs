/**
 * Modelový lom během roku (kapitola P1 Hustota, slide 9): mechanismus po krocích.
 *
 * Modelový lom hluboký 30 m, typický rok. Odhad podle hlášení potápěčů, ne měření.
 * Čísla se mění jen v tabulkách LAKE_STEPS a LAKE_MONTH_SCENE níže. Teploty jsou ve °C.
 *
 * Model ukazuje příčinu: hladina chladne, až je těžší než voda pod ní, a teprve pak se vrstvy
 * vymění. Pod 4 °C je chladnější voda lehčí a zůstává nahoře.
 *
 * Pozice `pos` je spojitá: 0 = krok 1, 0.5 = půl cesty ke kroku 2, po posledním kroku následuje krok 1.
 */

/** Hloubky z tabulky (m), ke každé patří jedna teplota v `temps`. */
export const LAKE_DEPTHS = Object.freeze([0, 5, 10, 20, 30]);
export const LAKE_MAX_DEPTH = 30;
/** Pásy kreslené kolem hloubek z tabulky (m). */
export const LAKE_BANDS = Object.freeze([[0, 2.5], [2.5, 7.5], [7.5, 15], [15, 25], [25, 30]]);

/**
 * Co patří k měsíci: teplota vzduchu, vítr, strom a listí na zemi.
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

/** Pořadí měsíců pro `?mesic=1..12`. */
const MONTH_ORDER = Object.keys(LAKE_MONTH_SCENE);

/**
 * @typedef {Object} LakeStep
 * @property {string} month
 * @property {number[]} temps  teplota vody v hloubkách LAKE_DEPTHS
 * @property {boolean} ice  led na hladině
 * @property {'klid'|'ohřev'|'chlazení'|'těžší'|'výměna'|'lehčí'} kind
 * @property {string} label  hlavní věta k výkladu
 */

const HEAVIER = 'hladina je chladnější než vrstva pod ní, a proto těžší';
const EXCHANGE = 'vrstvy se mění: těžší voda klesá, teplejší stoupá';
const WARMING = 'hladina se ohřívá, lehčí voda zůstává nahoře';

/** @type {readonly LakeStep[]} */
export const LAKE_STEPS = Object.freeze([
    { month: 'leden', temps: [0, 2, 3, 4, 4], ice: true, kind: 'klid', label: 'led na hladině' },
    { month: 'únor', temps: [0, 2, 3, 4, 4], ice: true, kind: 'klid', label: 'led na hladině' },
    { month: 'březen', temps: [2, 2, 3, 4, 4], ice: false, kind: 'ohřev', label: 'led roztál, hladina se ohřívá' },
    { month: 'březen', temps: [4, 3, 3, 4, 4], ice: false, kind: 'těžší', label: 'hladina má 4\u00a0°C, je těžší než voda pod ní' },
    { month: 'březen', temps: [4, 4, 4, 4, 4], ice: false, kind: 'výměna', label: 'vrstvy se mění: jarní promíchání' },
    { month: 'duben', temps: [8, 6, 5, 4, 4], ice: false, kind: 'ohřev', label: WARMING },
    { month: 'květen', temps: [14, 11, 6, 5, 4], ice: false, kind: 'ohřev', label: WARMING },
    { month: 'červen', temps: [20, 17, 8, 5, 4], ice: false, kind: 'klid', label: 'letní vrstvení' },
    { month: 'červenec', temps: [23, 21, 9, 5, 4], ice: false, kind: 'klid', label: 'letní vrstvení' },
    { month: 'srpen', temps: [23, 22, 10, 5, 4], ice: false, kind: 'klid', label: 'letní vrstvení' },
    { month: 'září', temps: [22, 22, 10, 5, 4], ice: false, kind: 'chlazení', label: 'hladina chladne' },
    { month: 'září', temps: [21, 22, 10, 5, 4], ice: false, kind: 'těžší', label: HEAVIER },
    { month: 'září', temps: [21, 21, 11, 5, 4], ice: false, kind: 'výměna', label: EXCHANGE },
    { month: 'září', temps: [18, 18, 11, 5, 4], ice: false, kind: 'chlazení', label: 'hladina chladne' },
    { month: 'říjen', temps: [12, 12, 11, 5, 4], ice: false, kind: 'chlazení', label: 'hladina chladne' },
    { month: 'listopad', temps: [7, 7, 7, 5, 4], ice: false, kind: 'chlazení', label: 'hladina chladne' },
    { month: 'prosinec', temps: [4, 7, 7, 5, 4], ice: false, kind: 'těžší', label: HEAVIER },
    { month: 'prosinec', temps: [5, 5, 5, 5, 4], ice: false, kind: 'výměna', label: EXCHANGE },
    { month: 'prosinec', temps: [4, 5, 5, 5, 4], ice: false, kind: 'těžší', label: HEAVIER },
    { month: 'prosinec', temps: [4, 4, 4, 4, 4], ice: false, kind: 'výměna', label: 'vrstvy se mění až ke dnu: podzimní promíchání' },
    { month: 'prosinec', temps: [3, 4, 4, 4, 4], ice: false, kind: 'lehčí', label: 'hladina je chladnější, ale pod 4\u00a0°C je lehčí, a proto zůstává nahoře' },
    { month: 'leden', temps: [1, 3, 4, 4, 4], ice: false, kind: 'lehčí', label: 'hladina dál chladne a zůstává nahoře' },
]);

/** Stav stromu jako čísla 0–1, aby šel plynule měnit: koruna, padající listí, sníh, pupeny. */
const TREE_STATES = Object.freeze({
    leaves: { crown: 1, falling: 0, snow: 0, buds: 0 },
    falling: { crown: 0.6, falling: 1, snow: 0, buds: 0 },
    bare: { crown: 0, falling: 0, snow: 0, buds: 0 },
    snow: { crown: 0, falling: 0, snow: 1, buds: 0 },
    buds: { crown: 0, falling: 0, snow: 0, buds: 1 },
});

/** @param {string} month @returns {number} teplota vzduchu v měsíci */
export const airOf = (month) => LAKE_MONTH_SCENE[month].air;
/** @param {string} month @returns {string} klíč stavu stromu v měsíci */
export const treeOf = (month) => LAKE_MONTH_SCENE[month].tree;

/**
 * Kolik vrstev od hladiny se účastní výměny v daném kroku: po nejhlubší, která se mění.
 * @param {number} index krok (0 = krok 1)
 * @returns {number}
 */
export function exchangeLayerCount(index) {
    const n = LAKE_STEPS.length;
    const now = LAKE_STEPS[index].temps;
    const before = LAKE_STEPS[(index - 1 + n) % n].temps;
    let count = 0;
    now.forEach((t, k) => { if (t !== before[k]) count = k + 1; });
    return count;
}

/**
 * První krok daného měsíce.
 * @param {number} monthNumber 1–12
 * @returns {number} index kroku
 */
export function firstStepOfMonth(monthNumber) {
    return LAKE_STEPS.findIndex(s => s.month === MONTH_ORDER[monthNumber - 1]);
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
 * @param {number} t teplota ve °C
 * @returns {string}
 */
export function formatAirTemperature(t) {
    const r = Math.round(t) + 0; // + 0: bez −0
    return `vzduch ${r < 0 ? '−' : ''}${Math.abs(r)} °C`;
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
