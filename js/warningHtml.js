import { escHtml } from './utils/escHtml.js';

/**
 * Format a trusted translated HTML template with escaped placeholder values.
 *
 * @param {string} template
 * @param {...unknown} values
 * @returns {string}
 */
export function formatWarningHtml(template, ...values) {
    return String(template).replace(/\{(\d+)\}/g, (_, index) => {
        const value = values[Number(index)];
        return value === undefined ? '' : escHtml(value);
    });
}

/**
 * Render warnings whose html field was produced by formatWarningHtml().
 *
 * @param {Array<{type: string, icon: string, html: string}>} warnings
 * @returns {string}
 */
export function renderWarningsHtml(warnings) {
    return warnings.map(warning => `
                <div class="dive-warning ${escHtml(warning.type)}">
                    <span class="dive-warning-icon">${escHtml(warning.icon)}</span>
                    <span>${warning.html}</span>
                </div>
            `).join('');
}
