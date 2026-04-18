/**
 * Shared Chart.js theme for DecoJS.
 *
 * Reads CSS design tokens (from :root) once and applies them to
 * Chart.defaults so every chart instance inherits the same typography,
 * grid styling, tooltip shape, and legend chrome. Per-chart code can
 * still override anything it needs.
 *
 * Usage (in a chart module):
 *     import { applyChartTheme, depthGradient, theme } from './chartTheme.js';
 *     applyChartTheme();  // idempotent; safe to call on every render
 *
 * Re-apply when the theme flips (`data-theme` attr on <html> changes)
 * by calling applyChartTheme() again — callers also need to re-render
 * their existing Chart instances to pick up the new defaults.
 */

const cssVar = (name, fallback) => {
    if (typeof document === 'undefined') return fallback;
    const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
    return v || fallback;
};

const rem2px = (remStr, fallbackPx) => {
    const n = parseFloat(remStr);
    return Number.isFinite(n) ? n * 16 : fallbackPx;
};

/** Current theme snapshot, recomputed each call. */
export function theme() {
    return {
        colors: {
            depth:   cssVar('--blue-500',  '#2980b9'),
            depthLo: cssVar('--blue-300',  '#71b0d6'),
            ceiling: cssVar('--red-500',   '#e74c3c'),
            ppO2:    cssVar('--green-500', '#27ae60'),
            ppN2:    '#9b59b6',
            ambient: cssVar('--amber-500', '#f39c12'),
            surface: cssVar('--surface-elevated', '#ffffff'),
            grid:    cssVar('--border',    '#e1e6ec'),
            text:    cssVar('--text',      '#2c3e50'),
            muted:   cssVar('--text-subtle', '#7f8c8d'),
            brand:   cssVar('--brand',     '#2980b9'),
        },
        fonts: {
            body:    cssVar('--font-body',    'Inter, -apple-system, sans-serif'),
            display: cssVar('--font-display', 'Fraunces, Georgia, serif'),
        },
        sizes: {
            xs: rem2px(cssVar('--text-xs',   '0.75rem'),  12),
            sm: rem2px(cssVar('--text-sm',   '0.875rem'), 14),
            base: rem2px(cssVar('--text-base', '1rem'),   16),
        },
    };
}

/**
 * Merge token-driven defaults into `Chart.defaults`. Idempotent: safe
 * to call multiple times (e.g., on every render). No-op if Chart is
 * not loaded yet.
 */
export function applyChartTheme() {
    if (typeof Chart === 'undefined') return false;
    const t = theme();
    const c = t.colors;

    // Base
    Chart.defaults.font.family = t.fonts.body;
    Chart.defaults.font.size = t.sizes.xs;
    Chart.defaults.font.weight = 500;
    Chart.defaults.color = c.muted;

    // Scales — grid lines get the border token and a subtle dash
    Chart.defaults.scale.grid.color = c.grid;
    Chart.defaults.scale.grid.lineWidth = 1;
    Chart.defaults.scale.grid.tickColor = c.grid;
    // borderDash moved under a custom helper since Chart.js v4 scoped it
    Chart.defaults.scale.border = Chart.defaults.scale.border || {};
    Chart.defaults.scale.border.color = c.grid;
    Chart.defaults.scale.border.dash = [2, 4];

    Chart.defaults.scale.ticks.color = c.muted;
    Chart.defaults.scale.ticks.font = {
        family: t.fonts.body,
        size: t.sizes.xs,
        weight: 500,
    };
    // Tabular numerals for axis tick labels — Chart.js writes these directly
    // to the canvas, so font-variant-numeric from CSS doesn't reach them.
    // We cover this via a ticks callback that formats numbers consistently
    // (see per-chart scale overrides for labels like "Time (minutes)").

    Chart.defaults.scale.title.color = c.text;
    Chart.defaults.scale.title.font = {
        family: t.fonts.body,
        size: t.sizes.sm,
        weight: 600,
    };

    // Legend — denser boxes, matches UI typography
    Chart.defaults.plugins.legend.labels.color = c.text;
    Chart.defaults.plugins.legend.labels.boxWidth = 16;
    Chart.defaults.plugins.legend.labels.boxHeight = 3;
    Chart.defaults.plugins.legend.labels.padding = 12;
    Chart.defaults.plugins.legend.labels.font = {
        family: t.fonts.body,
        size: t.sizes.xs,
        weight: 500,
    };

    // Tooltip — card-like shape, dark ink surface, generous padding
    const tip = Chart.defaults.plugins.tooltip;
    tip.backgroundColor = 'rgba(26, 35, 48, 0.94)';
    tip.titleColor = '#ffffff';
    tip.titleFont = {
        family: t.fonts.body,
        size: t.sizes.sm,
        weight: 600,
    };
    tip.bodyColor = '#e4e8ed';
    tip.bodyFont = {
        family: t.fonts.body,
        size: t.sizes.xs,
        weight: 500,
    };
    tip.footerColor = '#9aa4ae';
    tip.footerFont = {
        family: t.fonts.body,
        size: t.sizes.xs,
        weight: 400,
    };
    tip.padding = { top: 10, right: 12, bottom: 10, left: 12 };
    tip.boxPadding = 6;
    tip.cornerRadius = 8;
    tip.displayColors = true;
    tip.boxWidth = 8;
    tip.boxHeight = 8;

    return true;
}

/**
 * Build a vertical gradient fill for a depth dataset that fades from
 * a lighter tone at the surface to near-transparent at the chart floor.
 * Pass as `backgroundColor` via a function in the dataset config:
 *
 *     backgroundColor: (ctx) => depthGradient(ctx.chart.ctx, ctx.chart.chartArea)
 */
export function depthGradient(canvasCtx, chartArea, strong, weak) {
    if (!chartArea) return (strong || '#2980b9') + '20';
    const t = theme();
    const topColor = strong || t.colors.depthLo;
    const bottomColor = weak || t.colors.depth;
    const g = canvasCtx.createLinearGradient(0, chartArea.top, 0, chartArea.bottom);
    g.addColorStop(0, topColor + '55');
    g.addColorStop(0.55, bottomColor + '22');
    g.addColorStop(1, bottomColor + '06');
    return g;
}

/**
 * Format a number with up to `decimals` digits and thousand separators
 * — used in custom axis tick callbacks so numbers render with the same
 * tabular visual rhythm as the body UI.
 */
export function formatAxis(v, decimals = 0) {
    const n = Number(v);
    if (!Number.isFinite(n)) return '';
    return n.toLocaleString(undefined, {
        minimumFractionDigits: 0,
        maximumFractionDigits: decimals,
    });
}

/**
 * Observe theme changes on <html data-theme>. Calls the provided
 * callback *after* re-applying Chart.defaults, so the callback can
 * trigger a re-render of existing charts.
 */
export function watchThemeChanges(onChange) {
    if (typeof document === 'undefined') return;
    const observer = new MutationObserver(() => {
        applyChartTheme();
        if (typeof onChange === 'function') onChange();
    });
    observer.observe(document.documentElement, {
        attributes: true,
        attributeFilter: ['data-theme'],
    });
}
