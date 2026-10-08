/**
 * Shared lock/unlock toggle for Chart.js zoom + pan interaction.
 *
 * Charts ship with zoom and pan DISABLED so wheel/trackpad scroll over
 * the chart passes through to the page. Clicking the lock button unlocks
 * both pan and zoom (wheel, pinch). Clicking again re-locks.
 *
 * Usage — from a chart class, after the chart and chartContainer exist:
 *
 *   import { createInteractionLockBtn } from './interactionLock.js';
 *   this.interactionLockBtn = createInteractionLockBtn(
 *       () => this.chart,
 *       this.chartContainer,
 *       { rightOffsetPx: 44 }   // sit to the left of the reset-zoom button
 *   );
 *
 * The helper sets `pan.enabled`, `zoom.wheel.enabled`, and
 * `zoom.pinch.enabled` based on the current lock state. It uses a
 * `chart.update('none')` so redraw is cheap.
 */

export function createInteractionLockBtn(getChart, container, opts = {}) {
    const rightOffsetPx = opts.rightOffsetPx ?? 8;
    const topOffsetPx = opts.topOffsetPx ?? 8;

    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'chart-interaction-lock-btn';
    btn.setAttribute('aria-pressed', 'false');
    btn.style.cssText = `
        position: absolute;
        top: ${topOffsetPx}px;
        right: ${rightOffsetPx}px;
        z-index: 10;
        padding: 4px 8px;
        background: rgba(255, 255, 255, 0.9);
        border: 1px solid #ccc;
        border-radius: 4px;
        cursor: pointer;
        font-size: 14px;
        line-height: 1;
    `;

    let unlocked = false;

    const setLabel = () => {
        btn.textContent = unlocked ? '🔓' : '🔒';
        btn.title = unlocked
            ? 'Zoom/pan unlocked — click to lock (page scroll over chart)'
            : 'Zoom/pan locked — click to unlock (wheel/trackpad zooms)';
        btn.setAttribute('aria-pressed', String(unlocked));
    };

    btn.addEventListener('click', () => {
        unlocked = !unlocked;
        const chart = getChart();
        const zoomPlugin = chart?.options?.plugins?.zoom;
        if (zoomPlugin) {
            if (zoomPlugin.pan) zoomPlugin.pan.enabled = unlocked;
            if (zoomPlugin.zoom?.wheel) zoomPlugin.zoom.wheel.enabled = unlocked;
            if (zoomPlugin.zoom?.pinch) zoomPlugin.zoom.pinch.enabled = unlocked;
            chart.update('none');
        }
        setLabel();
    });

    setLabel();
    container.appendChild(btn);
    return btn;
}
