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
let tooltipsEnabled = null;

export function resolveChartTooltipEnabled(defaultEnabled = true) {
    return tooltipsEnabled ?? defaultEnabled;
}

function getCharts(instances) {
    if (!instances) return [];
    if (typeof instances.values === 'function') {
        return Array.from(instances.values());
    }
    return Object.values(instances);
}

function setTooltipEnabled(chart, enabled) {
    if (!chart.options) return;

    chart.options.plugins = chart.options.plugins || {};
    chart.options.plugins.tooltip = chart.options.plugins.tooltip || {};
    chart.options.plugins.tooltip.enabled = enabled;

    if (chart.config?.options) {
        chart.config.options.plugins = chart.config.options.plugins || {};
        chart.config.options.plugins.tooltip = chart.config.options.plugins.tooltip || {};
        chart.config.options.plugins.tooltip.enabled = enabled;
    }

    if (!enabled) {
        chart.setActiveElements?.([]);
        chart.tooltip?.setActiveElements?.([], { x: 0, y: 0 });
    }
    chart.update('none');
}

export function initTooltipShortcut() {
    if (installed) return;
    installed = true;

    document.addEventListener('keydown', (e) => {
        if (e.key !== 't' && e.key !== 'T') return;
        // Don't hijack the key while typing in a form field
        const tag = e.target && e.target.tagName;
        if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
        if (e.target && e.target.isContentEditable) return;

        const ChartCtor = typeof window !== 'undefined' ? window.Chart : undefined;
        if (!ChartCtor || !ChartCtor.instances) return;

        const charts = getCharts(ChartCtor.instances);
        if (charts.length === 0) return;

        const first = charts[0];
        const currentEnabled = tooltipsEnabled ??
            (first.options?.plugins?.tooltip?.enabled ?? true);
        tooltipsEnabled = !currentEnabled;

        for (const chart of charts) {
            setTooltipEnabled(chart, tooltipsEnabled);
        }
    });
}
