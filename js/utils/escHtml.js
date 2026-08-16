/**
 * HTML escaping for values interpolated into `innerHTML` templates.
 *
 * Dive setups can arrive from untrusted places — a shared `?profile=` link or a
 * `localStorage` entry written by an earlier session — so any string that reaches
 * an `innerHTML` template must pass through here first.
 *
 * Prefer `textContent` where the sink allows it; use this only where the
 * surrounding markup is built as a template string.
 */

const HTML_ENTITIES = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
};

/**
 * Escape a value for safe interpolation into HTML text or a quoted attribute.
 *
 * `'` is escaped as well as `"`, so the result is safe in single-quoted
 * attributes too.
 *
 * @param {*} value - Any value; coerced with String(). null/undefined become ''.
 * @returns {string} The escaped string.
 */
export function escHtml(value) {
    if (value === null || value === undefined) return '';
    return String(value).replace(/[&<>"']/g, (c) => HTML_ENTITIES[c]);
}

export default escHtml;
