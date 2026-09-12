/**
 * "T" keyboard shortcut that toggles the Chart.js tooltip for the chart under
 * the pointer or keyboard focus. Idempotent — calling initTooltipShortcut()
 * twice installs only one listener.
 *
 * Usage:
 *   import { initTooltipShortcut } from './js/components/tooltipShortcut.js';
 *   initTooltipShortcut();
 */

let installed = false;
let hoveredCanvas = null;
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
    if (!chart.options) return;
    if (chart.canvas) tooltipStateByCanvas.set(chart.canvas, enabled);

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

function chartForTarget(charts, target) {
    if (!target) return null;
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
        if (canvas) hoveredCanvas = canvas;
    });
    document.addEventListener('pointerout', (e) => {
        if (e.target === hoveredCanvas && e.relatedTarget !== hoveredCanvas) {
            hoveredCanvas = null;
        }
    });

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

        const focusedChart = chartForTarget(charts, e.target);
        const hoveredChart = charts.find((chart) => chart.canvas === hoveredCanvas);
        const chart = focusedChart || hoveredChart || (charts.length === 1 ? charts[0] : null);
        if (!chart) return;

        const currentEnabled = resolveChartTooltipEnabled(
            chart.options?.plugins?.tooltip?.enabled ?? true,
            chart.canvas
        );
        setTooltipEnabled(chart, !currentEnabled);
    });
}
