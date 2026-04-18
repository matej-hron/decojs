/**
 * Global "T" keyboard shortcut that toggles Chart.js tooltips on every chart
 * on the current page. Idempotent — calling initTooltipShortcut() twice
 * installs only one listener.
 *
 * Usage:
 *   import { initTooltipShortcut } from './js/components/tooltipShortcut.js';
 *   initTooltipShortcut();
 */

let installed = false;

export function initTooltipShortcut() {
    if (installed) return;
    installed = true;

    document.addEventListener('keydown', (e) => {
        if (e.key !== 't' && e.key !== 'T') return;
        // Don't hijack the key while typing in a form field
        const tag = e.target && e.target.tagName;
        if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
        if (e.target && e.target.isContentEditable) return;

        // Chart.instances is a dict keyed by chart id; cast to array of charts.
        const ChartCtor = typeof window !== 'undefined' ? window.Chart : undefined;
        if (!ChartCtor || !ChartCtor.instances) return;

        const charts = Object.values(ChartCtor.instances);
        if (charts.length === 0) return;

        // Flip each chart's tooltip.enabled. If different charts are out of sync,
        // we drive every chart to the inverse of the first one so a single press
        // visibly changes state everywhere.
        const first = charts[0];
        const nextEnabled = !(first.options?.plugins?.tooltip?.enabled ?? true);
        for (const chart of charts) {
            if (!chart.options) continue;
            chart.options.plugins = chart.options.plugins || {};
            chart.options.plugins.tooltip = chart.options.plugins.tooltip || {};
            chart.options.plugins.tooltip.enabled = nextEnabled;
            chart.update('none');
        }
    });
}
