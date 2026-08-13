/**
 * Number formatting that follows the active language.
 *
 * Czech and Spanish write the decimal comma, English the decimal point
 * (ČSN 01 6910 kap. 9.3; SI/RAE). Static text already follows this rule —
 * see docs/notation/glossary.md — so computed numbers must follow it too,
 * otherwise the Czech UI shows "0,16 bar" in prose next to "0.7511 bar"
 * in the calculation right below it.
 *
 * This module deliberately imports nothing. The pure helpers are testable
 * under Node, and js/mvalues.js and friends stay free of any dependency on
 * the browser-only i18n layer.
 *
 * Grouping (thousands) is intentionally left alone. The app's numbers are
 * small physical quantities (bar, m, min) where grouping never applies, and
 * introducing it would change output this change is not meant to touch.
 */

/** @type {Set<string>} Languages that use the decimal comma */
const COMMA_LANGS = new Set(['cs', 'es']);

/**
 * Normalize a language tag to its primary subtag ("cs-CZ" -> "cs").
 * @param {string} lang
 * @returns {string}
 */
function primarySubtag(lang) {
    return String(lang || '').split('-')[0].toLowerCase();
}

/**
 * The decimal separator a language uses.
 * @param {string} lang - Language tag ("cs", "en", "es", "cs-CZ", ...)
 * @returns {string} "," or "."
 */
export function decimalSeparator(lang) {
    return COMMA_LANGS.has(primarySubtag(lang)) ? ',' : '.';
}

/**
 * Read the active language.
 *
 * `js/i18n.js` writes `document.documentElement.lang` on every language
 * change, so the DOM is an accurate mirror of the i18n state without this
 * module having to import it.
 *
 * @returns {string} Language tag, "en" outside a browser
 */
export function currentLang() {
    if (typeof document === 'undefined' || !document.documentElement) return 'en';
    return document.documentElement.lang || 'en';
}

/**
 * Format a number for display in the given language.
 *
 * Returns a *display string*. Never feed the result back into `parseFloat`,
 * a `<input type="number">` value, an SVG/CSS coordinate or a URL — a comma
 * is invalid in all of those.
 *
 * @param {number} value - The number to format
 * @param {number} [decimals] - Fixed decimal places; omit to keep as-is
 * @param {string} [lang] - Language tag; defaults to the active language
 * @returns {string} Localized number, or String(value) if not finite
 */
export function fmtNum(value, decimals, lang) {
    // Number(null), Number(undefined) and Number('') would coerce to 0 or NaN
    // and print "0,00" where the old fixed-decimal call threw. Passing them
    // through keeps a bug visible instead of dressing it up as a measurement.
    if (value === null || value === undefined || value === '') return String(value);
    const n = typeof value === 'number' ? value : Number(value);
    if (!Number.isFinite(n)) return String(value);
    const s = decimals === undefined || decimals === null ? String(n) : n.toFixed(decimals);
    const sep = decimalSeparator(lang === undefined ? currentLang() : lang);
    return sep === '.' ? s : s.replace('.', sep);
}
