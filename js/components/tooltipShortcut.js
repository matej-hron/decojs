/**
 * "T" keyboard shortcut that toggles the Chart.js tooltip for the chart under
 * the pointer or keyboard focus. MValueChart reserves T for its intersection
 * ruler. Idempotent — calling initTooltipShortcut() twice installs one listener.
 *
 * Usage:
 *   import { initTooltipShortcut } from './js/components/tooltipShortcut.js';
 *   initTooltipShortcut();
 */

let installed = false;
let activeCanvas = null;
const tooltipStateByCanvas = new WeakMap();

export function resolveChartTooltipEnabled(defaultEnabled = true, canvas = null) {
    if (canvas && tooltipStateByCanvas.has(canvas)) {
        return tooltipStateByCanvas.get(canvas);
    }
    return defaultEnabled;
}

function getCharts(instances) {
    if (!instances) return [];
    if (typeof instances.values === 'function') {
        return Array.from(instances.values());
    }
    return Object.values(instances);
}

function setTooltipEnabled(chart, enabled) {
    const options = chart.config?.options;
    if (!options) return;
    if (chart.canvas) tooltipStateByCanvas.set(chart.canvas, enabled);

    options.plugins = options.plugins || {};
    options.plugins.tooltip = options.plugins.tooltip || {};
    options.plugins.tooltip.enabled = enabled;

    if (!enabled) {
        chart.setActiveElements?.([]);
        chart.tooltip?.setActiveElements?.([], { x: 0, y: 0 });
    }
    chart.update('none');
}

function chartForTarget(charts, target) {
    if (!target) return null;
    if (target === document.body || target === document.documentElement) return null;
    return charts.find((chart) =>
        chart.canvas === target ||
        target.contains?.(chart.canvas) ||
        chart.canvas?.contains?.(target)
    ) || null;
}

export function initTooltipShortcut() {
    if (installed) return;
    installed = true;

    document.addEventListener('pointerover', (e) => {
        const canvas = e.target?.closest?.('canvas');
        if (canvas) activeCanvas = canvas;
    });

    document.addEventListener('keydown', (e) => {
        if (e.key !== 't' && e.key !== 'T') return;
        if (e.metaKey || e.ctrlKey || e.altKey) return;
        // Don't hijack the key while typing in a form field
        const tag = e.target && e.target.tagName;
        if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
        if (e.target && e.target.isContentEditable) return;

        const ChartCtor = typeof window !== 'undefined' ? window.Chart : undefined;
        if (!ChartCtor || !ChartCtor.instances) return;

        const charts = getCharts(ChartCtor.instances);
        if (charts.length === 0) return;

        const focusedChart = chartForTarget(charts, e.target);
        const hoveredChart = charts.find((chart) => chart.canvas?.matches?.(':hover'));
        const activeChart = charts.find((chart) => chart.canvas === activeCanvas);
        const chart = focusedChart || hoveredChart || activeChart ||
            (charts.length === 1 ? charts[0] : null);
        if (!chart) return;
        if (chart.canvas?.closest?.('.mvc-wrapper')) return;

        const currentEnabled = resolveChartTooltipEnabled(
            chart.options?.plugins?.tooltip?.enabled ?? true,
            chart.canvas
        );
        setTooltipEnabled(chart, !currentEnabled);
    });
}
