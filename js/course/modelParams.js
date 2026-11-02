/**
 * Předvolby modelů kurzu v URL (`?teplota=2&mesic=1#model-lom`).
 *
 * Matej tak může ze slidu nebo z rozcestníku skočit rovnou na konkrétní ukázku.
 * Každý model popíše své parametry schématem; neplatná hodnota se tiše nahradí
 * výchozí, hodnota mimo rozsah se ořízne a zaokrouhlí na krok.
 *
 * Názvy parametrů jsou česky bez diakritiky (čitelné v odkazu, bez kódování).
 */

/**
 * @typedef {Object} ParamSpec
 * @property {number} min
 * @property {number} max
 * @property {number} [step=1]
 * @property {number} default
 */

/**
 * Ořízne a zaokrouhlí hodnotu podle schématu.
 * @param {number} value
 * @param {ParamSpec} spec
 * @returns {number}
 */
export function normalizeParam(value, spec) {
    const step = spec.step ?? 1;
    const clamped = Math.min(spec.max, Math.max(spec.min, value));
    const stepped = spec.min + Math.round((clamped - spec.min) / step) * step;
    // odstraní binární šum (0.1 + 0.2) a znovu ořízne
    return Math.min(spec.max, Math.max(spec.min, Math.round(stepped * 1e6) / 1e6));
}

/**
 * Přečte parametry modelu z query stringu.
 * @param {string|URLSearchParams} search   např. `location.search`
 * @param {Object<string, ParamSpec>} schema
 * @returns {Object<string, number>} hodnota pro každý klíč schématu
 */
export function readParams(search, schema) {
    const params = search instanceof URLSearchParams ? search : new URLSearchParams(search);
    const out = {};
    for (const [key, spec] of Object.entries(schema)) {
        const raw = params.get(key);
        const n = raw === null || raw.trim() === '' ? NaN : Number(raw.replace(',', '.'));
        out[key] = Number.isFinite(n) ? normalizeParam(n, spec) : spec.default;
    }
    return out;
}

/**
 * Zapíše hodnoty do query stringu; ostatní parametry (i jiných modelů) nechá být.
 * @param {string} search          současný query string
 * @param {Object<string, number>} values
 * @returns {string} nový query string včetně `?` (nebo prázdný řetězec)
 */
export function writeParams(search, values) {
    const params = new URLSearchParams(search);
    for (const [key, value] of Object.entries(values)) {
        if (value === null || value === undefined) params.delete(key);
        else params.set(key, String(value));
    }
    const s = params.toString();
    return s ? `?${s}` : '';
}

/**
 * Promítne hodnoty do adresního řádku (bez nového záznamu v historii).
 * @param {Object<string, number>} values
 */
export function syncUrl(values) {
    if (typeof window === 'undefined' || !window.history?.replaceState) return;
    const { pathname, search, hash } = window.location;
    window.history.replaceState(null, '', `${pathname}${writeParams(search, values)}${hash}`);
}
