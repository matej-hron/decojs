/**
 * Modelový lom během roku (kapitola P1 Hustota, slide 9).
 *
 * Modelový lom hluboký 30 m, typický rok. Odhad podle hlášení potápěčů, ne měření.
 * Čísla se mění jen v tabulce LAKE_MONTHS níže. Teploty jsou ve °C.
 *
 * Pozice `pos` je spojitá: 0 = leden, 0.5 = půl cesty k únoru, po prosinci následuje znovu leden.
 */

/** Hloubky z tabulky (m), ke každé patří jedna teplota v `temps`. */
export const LAKE_DEPTHS = Object.freeze([0, 5, 10, 20, 30]);
export const LAKE_MAX_DEPTH = 30;
/** Pásy kreslené kolem hloubek z tabulky (m). */
export const LAKE_BANDS = Object.freeze([[0, 2.5], [2.5, 7.5], [7.5, 15], [15, 25], [25, 30]]);

/**
 * @typedef {Object} LakeMonth
 * @property {string} name
 * @property {number} air  teplota vzduchu
 * @property {number[]} temps  teplota vody v hloubkách LAKE_DEPTHS
 * @property {boolean} ice  led na hladině
 * @property {'warm'|'cold'} wind
 * @property {string} label
 * @property {string} tree  klíč do TREE_STATES
 * @property {number} groundLeaves  listí na zemi (0–1)
 */

/** @type {readonly LakeMonth[]} */
export const LAKE_MONTHS = Object.freeze([
    { name: 'leden', air: -1, temps: [0, 2, 3, 4, 4], ice: true, wind: 'cold', label: 'led na hladině', tree: 'snow', groundLeaves: 0 },
    { name: 'únor', air: 0, temps: [0, 2, 3, 4, 4], ice: true, wind: 'cold', label: 'led na hladině', tree: 'snow', groundLeaves: 0 },
    { name: 'březen', air: 3, temps: [4, 4, 4, 4, 4], ice: false, wind: 'warm', label: 'jarní promíchání', tree: 'bare', groundLeaves: 0 },
    { name: 'duben', air: 9, temps: [8, 6, 5, 4, 4], ice: false, wind: 'warm', label: 'hladina se ohřívá', tree: 'buds', groundLeaves: 0 },
    { name: 'květen', air: 13, temps: [14, 11, 6, 5, 4], ice: false, wind: 'warm', label: 'hladina se ohřívá', tree: 'leaves', groundLeaves: 0 },
    { name: 'červen', air: 17, temps: [20, 17, 8, 5, 4], ice: false, wind: 'warm', label: 'letní vrstvení', tree: 'leaves', groundLeaves: 0 },
    { name: 'červenec', air: 18, temps: [23, 21, 9, 5, 4], ice: false, wind: 'warm', label: 'letní vrstvení', tree: 'leaves', groundLeaves: 0 },
    { name: 'srpen', air: 18, temps: [23, 22, 10, 5, 4], ice: false, wind: 'warm', label: 'letní vrstvení', tree: 'leaves', groundLeaves: 0 },
    { name: 'září', air: 13, temps: [18, 18, 11, 5, 4], ice: false, wind: 'cold', label: 'hladina chladne', tree: 'falling', groundLeaves: 0.3 },
    { name: 'říjen', air: 8, temps: [12, 12, 11, 5, 4], ice: false, wind: 'cold', label: 'hladina chladne', tree: 'falling', groundLeaves: 0.7 },
    { name: 'listopad', air: 4, temps: [7, 7, 7, 5, 4], ice: false, wind: 'cold', label: 'hladina chladne', tree: 'bare', groundLeaves: 1 },
    { name: 'prosinec', air: 0, temps: [4, 4, 4, 4, 4], ice: false, wind: 'cold', label: 'podzimní promíchání', tree: 'bare', groundLeaves: 0.6 },
]);

/** Stav stromu jako čísla 0–1, aby šel plynule měnit: koruna, padající listí, sníh, pupeny. */
const TREE_STATES = Object.freeze({
    leaves: { crown: 1, falling: 0, snow: 0, buds: 0 },
    falling: { crown: 0.6, falling: 1, snow: 0, buds: 0 },
    bare: { crown: 0, falling: 0, snow: 0, buds: 0 },
    snow: { crown: 0, falling: 0, snow: 1, buds: 0 },
    buds: { crown: 0, falling: 0, snow: 0, buds: 1 },
});

/** Přechody, při kterých se hladina blíží 4 °C a těžší voda klesá (index výchozího měsíce). */
const SINKING_FROM = new Set([1, 7, 8, 9, 10]);

/**
 * @param {number} from index výchozího měsíce (0 = leden)
 * @returns {boolean} při kroku na další měsíc klesá voda z povrchové vrstvy
 */
export function isSinkingTransition(from) {
    return SINKING_FROM.has(from);
}

/**
 * Další nebo předchozí měsíc, dokola.
 * @param {number} index
 * @param {1|-1} dir
 * @returns {number}
 */
export function stepMonth(index, dir) {
    const n = LAKE_MONTHS.length;
    return (index + dir + n) % n;
}

const lerp = (a, b, f) => a + (b - a) * f;
const round4 = (v) => Math.round(v * 1e4) / 1e4;

/**
 * Stav modelu v dané pozici roku.
 * @param {number} pos
 * @returns {{temps: number[], air: number, ice: number, warm: number, tree: Record<string, number>,
 *   groundLeaves: number, month: number, progress: number, sinking: number}}
 *   `month` je zobrazený měsíc (index), `sinking` 0–1 uprostřed přechodu s klesáním
 */
export function lakeFrame(pos) {
    const n = LAKE_MONTHS.length;
    const p = ((pos % n) + n) % n;
    const i = Math.floor(p + 1e-9) % n;
    const raw = p - i;
    const f = raw < 1e-9 ? 0 : raw;
    const a = LAKE_MONTHS[i];
    const b = LAKE_MONTHS[(i + 1) % n];
    const treeA = TREE_STATES[a.tree];
    const treeB = TREE_STATES[b.tree];
    return {
        temps: a.temps.map((t, k) => round4(lerp(t, b.temps[k], f))),
        air: round4(lerp(a.air, b.air, f)),
        ice: round4(lerp(a.ice ? 1 : 0, b.ice ? 1 : 0, f)),
        warm: round4(lerp(a.wind === 'warm' ? 1 : 0, b.wind === 'warm' ? 1 : 0, f)),
        tree: Object.fromEntries(Object.keys(treeA).map(k => [k, round4(lerp(treeA[k], treeB[k], f))])),
        groundLeaves: round4(lerp(a.groundLeaves, b.groundLeaves, f)),
        month: f < 0.5 ? i : (i + 1) % n,
        progress: f,
        sinking: isSinkingTransition(i) ? round4(Math.sin(Math.PI * f)) : 0,
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
 * Krok měsíce z klávesy. V otevřeném simulátoru šipky patří měsícům i na posuvníku,
 * jen tak funguje krok dokola a prezentační klikr. Mimo simulátor přepínají slidy (`slideNav.js`).
 * @param {{key: string, altKey: boolean, ctrlKey: boolean, metaKey: boolean, shiftKey: boolean}} e
 * @param {{simOpen?: boolean}} [state]
 * @returns {1|-1|0}
 */
export function monthKeyStep(e, { simOpen = false } = {}) {
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
