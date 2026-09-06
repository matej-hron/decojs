/**
 * GF Chart Component
 *
 * A reusable, embeddable chart component that displays instantaneous Gradient
 * Factor (%) for each tissue compartment vs ambient pressure.
 *
 * This visualization shows:
 * - M-value line: Horizontal at 100% (Bühlmann limit)
 * - GF corridor: Filled band from GF_low at pAnchor to GF_high at surface
 * - pAnchor vertical line: Where GF Low applies during ascent
 * - Tissue points: Current instantaneous GF of each compartment
 * - Trail: Path through the dive
 *
 * Keyboard Shortcuts (when chart is focused):
 *   Left/Right: Step time by 1 frame
 *   Shift+Left/Right: Jump to prev/next waypoint
 *   Ctrl+Left/Home: Jump to start
 *   Ctrl+Right/End: Jump to end
 *   Space: Play/Pause animation
 *   Up/Down: Move compartment selection to slower/faster tissues
 *   Shift+Up: Expand selection to include slower tissue
 *   Shift+Down: Remove slowest tissue from selection
 *
 * Usage:
 *   import { GFChart } from './charts/GFChart.js';
 *
 *   const chart = new GFChart(containerElement, {
 *     diveSetup: { gases: [...], dives: [{ waypoints: [...] }], gfLow: 70, gfHigh: 85 },
 *     options: { compartments: [1, 2, 3, 4] }
 *   });
 */

import { COMPARTMENTS } from '../tissueCompartments.js';
import { applyChartTheme } from './chartTheme.js';
import { createInteractionLockBtn } from './interactionLock.js';
import { translate } from '../i18n.js';

import { fmtNum } from '../format.js';
/** Helper: replace {0}, {1}, ... placeholders with the given values. */
function fmt(str, ...values) {
    return String(str).replace(/\{(\d+)\}/g, (_, i) => {
        const v = values[Number(i)];
        return v === undefined ? '' : String(v);
    });
}
import {
    calculateTissueLoading,
    calculateInstantGF,
    interpolateGF,
    getAmbientPressure,
    getSurfacePressure,
    SURFACE_PRESSURE
} from '../decoModel.js';
import {
    calculateChartGFAnchor,
    DEFAULT_ENVIRONMENT,
    mergeOptions,
    validateDiveSetup,
    normalizeDiveSetup
} from './chartTypes.js';

/**
 * Default options for GFChart
 */
const DEFAULT_GF_OPTIONS = {
    compartments: [1],
    showTrail: true,
    interactive: true,
    fullscreenButton: true,
    compartmentSelector: true,
    playbackSpeed: 100,
    maxPressure: null,
    colors: {
        ambient: 'rgba(52, 152, 219, 0.8)',
        surface: 'rgba(128, 128, 128, 0.6)'
    }
};

/**
 * GFChart - Gradient Factor percentage diagram visualization
 */
export class GFChart {
    /**
     * Create a new GFChart
     * @param {HTMLElement} container - Container element for the chart
     * @param {Object} config - Configuration object
     * @param {Object} config.diveSetup - Dive setup configuration
     * @param {Object} [config.environment] - Environmental settings
     * @param {Object} [config.options] - Chart display options
     */
    constructor(container, config) {
        this.container = container;
        this.chart = null;
        this.canvas = null;
        this.fullscreenBtn = null;
        this.exitFullscreenBtn = null;
        this.chartContainer = null;
        this.controlsContainer = null;
        this.timelineContainer = null;
        this.timeSlider = null;
        this.timeDisplay = null;
        this.playBtn = null;

        // State
        this.calculationResults = null;
        this.currentTimeIndex = 0;
        this.visibleCompartments = new Set();
        this.isPlaying = false;
        this.playInterval = null;
        this.savedZoomState = null;
        this.hasUserZoomed = false;

        // Merge options with defaults
        this.options = mergeOptions(DEFAULT_GF_OPTIONS, config.options);
        this.environment = mergeOptions(DEFAULT_ENVIRONMENT, config.environment);

        // Initialize visible compartments
        (this.options.compartments || [1]).forEach(c => this.visibleCompartments.add(c));

        // Validate and normalize dive setup
        if (config.diveSetup) {
            const validation = validateDiveSetup(config.diveSetup);
            if (!validation.valid) {
                console.error('GFChart: Invalid dive setup', validation.errors);
            }
            this.diveSetup = normalizeDiveSetup(config.diveSetup);
        } else {
            this.diveSetup = null;
        }

        // Build DOM structure
        this._buildDOM();

        // Setup keyboard shortcuts
        this._setupKeyboardShortcuts();

        // Re-render on language change so chart labels retranslate.
        this._onLanguageChange = () => {
            if (this.options.compartmentSelector) this._buildCompartmentSelector();
            if (this.fullscreenBtn) this.fullscreenBtn.title = translate('chart.tooltips.fullscreen', 'Toggle Fullscreen');
            if (this.exitFullscreenBtn) this.exitFullscreenBtn.title = translate('chart.tooltips.exitFullscreen', 'Exit Fullscreen (Esc)');
            if (this.resetZoomBtn) this.resetZoomBtn.title = translate('chart.tooltips.resetZoom', 'Reset Zoom (double-click chart)');
            this._updateTimeDisplay();
            if (this.diveSetup) this._render();
        };
        document.addEventListener('languagechange', this._onLanguageChange);

        // Calculate and render if we have data
        if (this.diveSetup) {
            this._calculate();
            this._render();
        }
    }

    /**
     * Build the chart's DOM structure
     * @private
     */
    _buildDOM() {
        this.container.innerHTML = '';
        this.container.tabIndex = 0;
        this.container.style.outline = 'none';

        // Main wrapper - fills parent container
        const wrapper = document.createElement('div');
        wrapper.className = 'gfc-wrapper';
        wrapper.style.cssText = 'display: flex; flex-direction: column; width: 100%; height: 100%; overflow: hidden;';

        // Compartment selector
        if (this.options.compartmentSelector) {
            this.controlsContainer = document.createElement('div');
            this.controlsContainer.className = 'gfc-controls';
            this.controlsContainer.style.cssText = `
                display: flex; flex-wrap: wrap; gap: 4px; padding: 8px;
                background: #f8f9fa; border-radius: 4px; margin-bottom: 8px;
                align-items: center;
            `;
            this._buildCompartmentSelector();
            wrapper.appendChild(this.controlsContainer);
        }

        // Timeline controls
        this.timelineContainer = document.createElement('div');
        this.timelineContainer.className = 'gfc-timeline';
        this.timelineContainer.style.cssText = `
            display: flex; align-items: center; gap: 8px; padding: 8px;
            background: #f8f9fa; border-radius: 4px; margin-bottom: 8px;
        `;
        this._buildTimelineControls();
        wrapper.appendChild(this.timelineContainer);

        // Chart container - fills remaining height
        this.chartContainer = document.createElement('div');
        this.chartContainer.className = 'gfc-chart-container';
        this.chartContainer.style.flex = '1';
        this.chartContainer.style.minHeight = '0';

        // Canvas
        this.canvas = document.createElement('canvas');
        this.chartContainer.appendChild(this.canvas);

        // Fullscreen button
        if (this.options.fullscreenButton) {
            this.fullscreenBtn = document.createElement('button');
            this.fullscreenBtn.innerHTML = '⛶';
            this.fullscreenBtn.title = translate('chart.tooltips.fullscreen', 'Toggle Fullscreen');
            this.fullscreenBtn.style.cssText = `
                position: absolute; top: 8px; right: 8px; z-index: 10;
                padding: 4px 8px; background: rgba(255,255,255,0.9);
                border: 1px solid #ccc; border-radius: 4px; cursor: pointer;
                font-size: 16px;
            `;
            this.fullscreenBtn.addEventListener('click', () => this._toggleFullscreen());
            this.chartContainer.appendChild(this.fullscreenBtn);

            this.exitFullscreenBtn = document.createElement('button');
            this.exitFullscreenBtn.className = 'gfc-exit-fullscreen-btn';
            this.exitFullscreenBtn.innerHTML = '✕';
            this.exitFullscreenBtn.title = translate('chart.tooltips.exitFullscreen', 'Exit Fullscreen (Esc)');
            this.exitFullscreenBtn.style.cssText = `
                position: absolute; top: 16px; right: 16px; z-index: 1001;
                padding: 8px 12px; background: rgba(0,0,0,0.7); color: white;
                border: none; border-radius: 4px; cursor: pointer;
                font-size: 20px;
            `;
            this.exitFullscreenBtn.addEventListener('click', () => this._toggleFullscreen());
            this.chartContainer.appendChild(this.exitFullscreenBtn);
        }

        // Reset zoom button
        this.resetZoomBtn = document.createElement('button');
        this.resetZoomBtn.className = 'gfc-reset-zoom-btn';
        this.resetZoomBtn.innerHTML = '↺';
        this.resetZoomBtn.title = translate('chart.tooltips.resetZoom', 'Reset Zoom (double-click chart)');
        this.resetZoomBtn.style.cssText = `
            position: absolute; top: 8px; right: ${this.options.fullscreenButton ? '44px' : '8px'}; z-index: 10;
            padding: 4px 8px; background: rgba(255,255,255,0.9);
            border: 1px solid #ccc; border-radius: 4px; cursor: pointer;
            font-size: 14px; display: none;
        `;
        this.resetZoomBtn.addEventListener('click', () => this.resetZoom());
        this.chartContainer.appendChild(this.resetZoomBtn);

        // Lock/unlock chart interaction (wheel/trackpad zoom + drag pan).
        // Default locked so scrolling over the chart passes through.
        this.interactionLockBtn = createInteractionLockBtn(
            () => this.chart,
            this.chartContainer,
            { rightOffsetPx: this.options.fullscreenButton ? 80 : 44 }
        );

        wrapper.appendChild(this.chartContainer);

        // Mini profile canvas
        this.miniProfileCanvas = document.createElement('canvas');
        this.miniProfileCanvas.style.cssText = 'width: 100%; height: 100px; margin-top: 6px; border-radius: 4px; background: var(--surface-alt, #f0f4f8);';
        wrapper.appendChild(this.miniProfileCanvas);

        this.container.appendChild(wrapper);

        // Set up ResizeObserver
        this._resizeObserver = new ResizeObserver(() => {
            if (this._resizeTimeout) {
                clearTimeout(this._resizeTimeout);
            }
            this._resizeTimeout = setTimeout(() => {
                if (!this.chartContainer.classList.contains('gfc-fullscreen')) {
                    this.resize();
                }
            }, 50);
        });
        this._resizeObserver.observe(this.container);
    }

    /**
     * Resize the chart to fit its container
     * @public
     */
    resize() {
        if (this.chart) {
            this.canvas.style.width = '';
            this.canvas.style.height = '';
            this.canvas.removeAttribute('width');
            this.canvas.removeAttribute('height');
            this.chart.resize();
        }
    }

    /**
     * Reset zoom to original scale
     * @public
     */
    resetZoom() {
        if (this.chart) {
            this.chart.resetZoom();
            this.savedZoomState = null;
            this.hasUserZoomed = false;
            if (this.resetZoomBtn) {
                this.resetZoomBtn.style.display = 'none';
            }
        }
    }

    /**
     * Build compartment selector checkboxes
     * @private
     */
    _buildCompartmentSelector() {
        if (!this.controlsContainer) return;

        this.controlsContainer.innerHTML = '';

        // Quick selection buttons
        const btnGroup = document.createElement('div');
        btnGroup.style.cssText = 'display: flex; gap: 4px; margin-right: 12px;';

        const buttons = [
            { text: translate('chart.buttons.all', 'All'), action: () => this._selectAllCompartments() },
            { text: translate('chart.buttons.none', 'None'), action: () => this._selectNoCompartments() },
            { text: translate('chart.buttons.fast', 'Fast'), action: () => this._selectFastCompartments() },
            { text: translate('chart.buttons.slow', 'Slow'), action: () => this._selectSlowCompartments() }
        ];

        buttons.forEach(({ text, action }) => {
            const btn = document.createElement('button');
            btn.textContent = text;
            btn.style.cssText = `
                padding: 4px 8px; background: #e9ecef; border: 1px solid #ced4da;
                border-radius: 4px; cursor: pointer; font-size: 12px;
            `;
            btn.addEventListener('click', action);
            btnGroup.appendChild(btn);
        });
        this.controlsContainer.appendChild(btnGroup);

        // Compartment checkboxes
        COMPARTMENTS.forEach(comp => {
            const label = document.createElement('label');
            label.style.cssText = `
                display: inline-flex; align-items: center; gap: 2px;
                padding: 2px 6px; border-radius: 3px; cursor: pointer;
                border: 2px solid ${comp.color}; font-size: 12px;
            `;

            const checkbox = document.createElement('input');
            checkbox.type = 'checkbox';
            checkbox.checked = this.visibleCompartments.has(comp.id);
            checkbox.dataset.compartmentId = comp.id;
            checkbox.style.pointerEvents = 'none';
            label.addEventListener('click', (e) => {
                e.preventDefault();
                if (e.shiftKey) {
                    if (this.visibleCompartments.has(comp.id)) {
                        this.visibleCompartments.delete(comp.id);
                    } else {
                        this.visibleCompartments.add(comp.id);
                    }
                } else {
                    this.visibleCompartments.clear();
                    this.visibleCompartments.add(comp.id);
                }
                this._updateCompartmentCheckboxes();
                this._render();
            });

            const colorDot = document.createElement('span');
            colorDot.style.cssText = `
                width: 10px; height: 10px; border-radius: 50%;
                background: ${comp.color};
            `;

            label.appendChild(checkbox);
            label.appendChild(colorDot);
            label.appendChild(document.createTextNode(` ${comp.id}`));
            this.controlsContainer.appendChild(label);
        });

        // Shortcut legend
        const hint = document.createElement('div');
        hint.style.cssText = 'font-size: 0.7rem; color: var(--text-muted, #888); margin-top: 2px; padding: 0 4px;';
        hint.textContent = translate('chart.hints.compartments', 'Click = select one · Shift+click = toggle · ←→ step · Space play · F fullscreen');
        this.controlsContainer.appendChild(hint);
    }

    /**
     * Build timeline playback controls
     * @private
     */
    _buildTimelineControls() {
        const rewindBtn = this._createButton('⏮', translate('chart.tooltips.jumpStart', 'Jump to start (Home)'), () => this._jumpToStart());
        const stepBackBtn = this._createButton('◀', translate('chart.tooltips.stepBack', 'Step back (←)'), () => this._stepTime(-1));
        this.playBtn = this._createButton('▶️', translate('chart.tooltips.playPause', 'Play/Pause (Space)'), () => this._togglePlayback());
        const stepFwdBtn = this._createButton('▶', translate('chart.tooltips.stepForward', 'Step forward (→)'), () => this._stepTime(1));
        const ffwdBtn = this._createButton('⏭', translate('chart.tooltips.jumpEnd', 'Jump to end (End)'), () => this._jumpToEnd());

        // Time slider
        this.timeSlider = document.createElement('input');
        this.timeSlider.type = 'range';
        this.timeSlider.min = 0;
        this.timeSlider.max = 100;
        this.timeSlider.value = 0;
        this.timeSlider.style.cssText = 'flex: 1; cursor: pointer;';
        this.timeSlider.addEventListener('input', () => {
            this._stopPlayback();
            if (!this.calculationResults) return;
            const maxIndex = this.calculationResults.timePoints.length - 1;
            this.currentTimeIndex = Math.round((this.timeSlider.value / 100) * maxIndex);
            this._updateTimeDisplay();
            this._render();
        });

        // Time display
        this.timeDisplay = document.createElement('span');
        this.timeDisplay.style.cssText = 'font-family: monospace; min-width: 120px; text-align: right;';
        this.timeDisplay.textContent = translate('chart.mvalue.initialDepthLabel', '0.0 min @ 0m');

        this.timelineContainer.appendChild(rewindBtn);
        this.timelineContainer.appendChild(stepBackBtn);
        this.timelineContainer.appendChild(this.playBtn);
        this.timelineContainer.appendChild(stepFwdBtn);
        this.timelineContainer.appendChild(ffwdBtn);
        this.timelineContainer.appendChild(this.timeSlider);
        this.timelineContainer.appendChild(this.timeDisplay);
    }

    /**
     * Create a styled button
     * @private
     */
    _createButton(text, title, onClick) {
        const btn = document.createElement('button');
        btn.textContent = text;
        btn.title = title;
        btn.style.cssText = `
            padding: 4px 8px; background: #e9ecef; border: 1px solid #ced4da;
            border-radius: 4px; cursor: pointer; font-size: 14px;
        `;
        btn.addEventListener('click', onClick);
        return btn;
    }

    /**
     * Setup keyboard shortcuts
     * @private
     */
    _setupKeyboardShortcuts() {
        this._keyHandler = (e) => {
            if (!this.container.contains(document.activeElement) &&
                !this.chartContainer.classList.contains('gfc-fullscreen')) {
                return;
            }

            if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT') return;
            if (!this.calculationResults) return;

            const maxIndex = this.calculationResults.timePoints.length - 1;

            switch (e.key) {
                case ' ':
                    e.preventDefault();
                    this._togglePlayback();
                    break;

                case 'ArrowRight':
                    e.preventDefault();
                    if (e.ctrlKey || e.metaKey) {
                        this._jumpToEnd();
                    } else if (e.shiftKey) {
                        this._jumpToNextWaypoint();
                    } else {
                        this._stepTime(1);
                    }
                    break;

                case 'ArrowLeft':
                    e.preventDefault();
                    if (e.ctrlKey || e.metaKey) {
                        this._jumpToStart();
                    } else if (e.shiftKey) {
                        this._jumpToPrevWaypoint();
                    } else {
                        this._stepTime(-1);
                    }
                    break;

                case 'Home':
                    e.preventDefault();
                    this._jumpToStart();
                    break;

                case 'End':
                    e.preventDefault();
                    this._jumpToEnd();
                    break;

                case 'ArrowUp':
                    e.preventDefault();
                    if (e.shiftKey) {
                        this._expandToSlowerCompartment();
                    } else {
                        this._moveCompartmentsSlower();
                    }
                    break;

                case 'ArrowDown':
                    e.preventDefault();
                    if (e.shiftKey) {
                        this._removeSlowestCompartment();
                    } else {
                        this._moveCompartmentsFaster();
                    }
                    break;

                case 'Escape':
                    if (this.chartContainer.classList.contains('gfc-fullscreen')) {
                        this._toggleFullscreen();
                    }
                    break;
            }
        };

        document.addEventListener('keydown', this._keyHandler);
    }

    // ============================================================================
    // Timeline Controls
    // ============================================================================

    _stepTime(steps) {
        this._stopPlayback();
        if (!this.calculationResults) return;
        const maxIndex = this.calculationResults.timePoints.length - 1;
        this.currentTimeIndex = Math.max(0, Math.min(maxIndex, this.currentTimeIndex + steps));
        this._updateSliderPosition();
        this._updateTimeDisplay();
        this._render();
    }

    _jumpToStart() {
        this._stopPlayback();
        this.currentTimeIndex = 0;
        this._updateSliderPosition();
        this._updateTimeDisplay();
        this._render();
    }

    _jumpToEnd() {
        this._stopPlayback();
        if (!this.calculationResults) return;
        this.currentTimeIndex = this.calculationResults.timePoints.length - 1;
        this._updateSliderPosition();
        this._updateTimeDisplay();
        this._render();
    }

    _findWaypointIndices() {
        if (!this.calculationResults) return [0];
        const depths = this.calculationResults.depthPoints;
        const waypoints = new Set([0, depths.length - 1]);

        for (let i = 1; i < depths.length - 1; i++) {
            const prevDepth = depths[i - 1];
            const currDepth = depths[i];
            const nextDepth = depths[i + 1];

            const wasDescending = currDepth > prevDepth;
            const wasAscending = currDepth < prevDepth;
            const wasLevel = Math.abs(currDepth - prevDepth) < 0.1;

            const willAscend = nextDepth < currDepth;
            const willDescend = nextDepth > currDepth;
            const willLevel = Math.abs(nextDepth - currDepth) < 0.1;

            if ((wasDescending && (willLevel || willAscend)) ||
                (wasAscending && willLevel) ||
                (wasLevel && willAscend) ||
                (wasLevel && willDescend)) {
                waypoints.add(i);
            }
        }

        return Array.from(waypoints).sort((a, b) => a - b);
    }

    _jumpToNextWaypoint() {
        this._stopPlayback();
        const waypoints = this._findWaypointIndices();
        for (const wp of waypoints) {
            if (wp > this.currentTimeIndex) {
                this.currentTimeIndex = wp;
                this._updateSliderPosition();
                this._updateTimeDisplay();
                this._render();
                return;
            }
        }
        this._jumpToEnd();
    }

    _jumpToPrevWaypoint() {
        this._stopPlayback();
        const waypoints = this._findWaypointIndices();
        for (let i = waypoints.length - 1; i >= 0; i--) {
            if (waypoints[i] < this.currentTimeIndex) {
                this.currentTimeIndex = waypoints[i];
                this._updateSliderPosition();
                this._updateTimeDisplay();
                this._render();
                return;
            }
        }
        this._jumpToStart();
    }

    _togglePlayback() {
        if (this.isPlaying) {
            this._stopPlayback();
        } else {
            this._startPlayback();
        }
    }

    _startPlayback() {
        if (!this.calculationResults || this.isPlaying) return;

        this.isPlaying = true;
        this.playBtn.textContent = '⏸️';

        this.playInterval = setInterval(() => {
            const maxIndex = this.calculationResults.timePoints.length - 1;
            if (this.currentTimeIndex >= maxIndex) {
                this._stopPlayback();
                return;
            }
            this.currentTimeIndex++;
            this._updateSliderPosition();
            this._updateTimeDisplay();
            this._render();
        }, this.options.playbackSpeed);
    }

    _stopPlayback() {
        if (!this.isPlaying) return;
        this.isPlaying = false;
        this.playBtn.textContent = '▶️';
        if (this.playInterval) {
            clearInterval(this.playInterval);
            this.playInterval = null;
        }
    }

    _updateSliderPosition() {
        if (!this.timeSlider || !this.calculationResults) return;
        const maxIndex = this.calculationResults.timePoints.length - 1;
        this.timeSlider.value = (this.currentTimeIndex / maxIndex) * 100;
    }

    _updateTimeDisplay() {
        if (!this.timeDisplay || !this.calculationResults) return;
        const time = this.calculationResults.timePoints[this.currentTimeIndex] || 0;
        const depth = this.calculationResults.depthPoints[this.currentTimeIndex] || 0;
        this.timeDisplay.textContent = fmt(translate('chart.timeDisplay', '{0}\u00a0min @ {1}\u00a0m'), fmtNum(time, 1), fmtNum(depth, 1));
        this._renderMiniProfile();
    }

    /**
     * Render mini dive profile with current position marker
     * @private
     */
    _renderMiniProfile() {
        const canvas = this.miniProfileCanvas;
        if (!canvas || !this.calculationResults) return;

        const dpr = window.devicePixelRatio || 1;
        const rect = canvas.getBoundingClientRect();
        const w = rect.width * dpr;
        const h = rect.height * dpr;
        if (w === 0 || h === 0) return;

        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        ctx.scale(dpr, dpr);

        const width = rect.width;
        const height = rect.height;
        const pad = { left: 4, right: 4, top: 4, bottom: 4 };

        const times = this.calculationResults.timePoints;
        const depths = this.calculationResults.depthPoints;
        if (!times || times.length === 0) return;

        const maxTime = times[times.length - 1];
        const maxDepth = Math.max(...depths);
        if (maxTime === 0 || maxDepth === 0) return;

        const plotW = width - pad.left - pad.right;
        const plotH = height - pad.top - pad.bottom;
        const toX = (t) => pad.left + (t / maxTime) * plotW;
        const toY = (d) => pad.top + (d / maxDepth) * plotH;

        // Draw filled profile
        ctx.beginPath();
        ctx.moveTo(toX(times[0]), toY(0));
        for (let i = 0; i < times.length; i++) {
            ctx.lineTo(toX(times[i]), toY(depths[i]));
        }
        ctx.lineTo(toX(times[times.length - 1]), toY(0));
        ctx.closePath();
        ctx.fillStyle = 'rgba(52, 152, 219, 0.2)';
        ctx.fill();

        // Draw profile line
        ctx.beginPath();
        for (let i = 0; i < times.length; i++) {
            if (i === 0) ctx.moveTo(toX(times[i]), toY(depths[i]));
            else ctx.lineTo(toX(times[i]), toY(depths[i]));
        }
        ctx.strokeStyle = 'rgba(52, 152, 219, 0.7)';
        ctx.lineWidth = 1.5;
        ctx.stroke();

        // Draw current position marker
        const curTime = times[this.currentTimeIndex] || 0;
        const curDepth = depths[this.currentTimeIndex] || 0;
        const cx = toX(curTime);
        const cy = toY(curDepth);

        // Vertical line
        ctx.beginPath();
        ctx.moveTo(cx, pad.top);
        ctx.lineTo(cx, height - pad.bottom);
        ctx.strokeStyle = 'rgba(231, 76, 60, 0.4)';
        ctx.lineWidth = 1;
        ctx.stroke();

        // Dot
        ctx.beginPath();
        ctx.arc(cx, cy, 4, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(231, 76, 60, 0.9)';
        ctx.fill();
        ctx.strokeStyle = 'white';
        ctx.lineWidth = 1.5;
        ctx.stroke();
    }

    // ============================================================================
    // Compartment Selection
    // ============================================================================

    _selectAllCompartments() {
        COMPARTMENTS.forEach(c => this.visibleCompartments.add(c.id));
        this._updateCompartmentCheckboxes();
        this._render();
    }

    _selectNoCompartments() {
        this.visibleCompartments.clear();
        this._updateCompartmentCheckboxes();
        this._render();
    }

    _selectFastCompartments() {
        this.visibleCompartments.clear();
        COMPARTMENTS.filter(c => c.halfTime <= 12.5).forEach(c => this.visibleCompartments.add(c.id));
        this._updateCompartmentCheckboxes();
        this._render();
    }

    _selectSlowCompartments() {
        this.visibleCompartments.clear();
        COMPARTMENTS.filter(c => c.halfTime >= 109).forEach(c => this.visibleCompartments.add(c.id));
        this._updateCompartmentCheckboxes();
        this._render();
    }

    _moveCompartmentsSlower() {
        const currentIds = Array.from(this.visibleCompartments).sort((a, b) => a - b);
        if (currentIds.length === 0) return;

        const slowestId = currentIds[currentIds.length - 1];
        if (slowestId >= 16) return;

        this.visibleCompartments.clear();
        currentIds.forEach(id => this.visibleCompartments.add(id + 1));
        this._updateCompartmentCheckboxes();
        this._render();
    }

    _moveCompartmentsFaster() {
        const currentIds = Array.from(this.visibleCompartments).sort((a, b) => a - b);
        if (currentIds.length === 0) return;

        const fastestId = currentIds[0];
        if (fastestId <= 1) return;

        this.visibleCompartments.clear();
        currentIds.forEach(id => this.visibleCompartments.add(id - 1));
        this._updateCompartmentCheckboxes();
        this._render();
    }

    _expandToSlowerCompartment() {
        const currentIds = Array.from(this.visibleCompartments).sort((a, b) => a - b);
        if (currentIds.length === 0) {
            this.visibleCompartments.add(1);
        } else {
            const slowestId = currentIds[currentIds.length - 1];
            if (slowestId < 16) {
                this.visibleCompartments.add(slowestId + 1);
            }
        }
        this._updateCompartmentCheckboxes();
        this._render();
    }

    _removeSlowestCompartment() {
        const currentIds = Array.from(this.visibleCompartments).sort((a, b) => a - b);
        if (currentIds.length > 1) {
            this.visibleCompartments.delete(currentIds[currentIds.length - 1]);
            this._updateCompartmentCheckboxes();
            this._render();
        }
    }

    _updateCompartmentCheckboxes() {
        if (!this.controlsContainer) return;
        this.controlsContainer.querySelectorAll('input[type="checkbox"]').forEach(cb => {
            const id = parseInt(cb.dataset.compartmentId);
            if (!isNaN(id)) {
                cb.checked = this.visibleCompartments.has(id);
            }
        });
    }

    // ============================================================================
    // Fullscreen
    // ============================================================================

    _toggleFullscreen() {
        const isFullscreen = this.chartContainer.classList.toggle('gfc-fullscreen');

        if (isFullscreen) {
            document.body.style.overflow = 'hidden';
            if (this.fullscreenBtn) this.fullscreenBtn.style.display = 'none';
            if (this.exitFullscreenBtn) this.exitFullscreenBtn.style.display = 'block';
        } else {
            document.body.style.overflow = '';
            if (this.fullscreenBtn) this.fullscreenBtn.style.display = '';
            if (this.exitFullscreenBtn) this.exitFullscreenBtn.style.display = '';
        }

        setTimeout(() => this.resize(), 0);
        setTimeout(() => this.resize(), 100);
        setTimeout(() => this.resize(), 300);
    }

    // ============================================================================
    // Calculation & Rendering
    // ============================================================================

    _calculate() {
        if (!this.diveSetup || !this.diveSetup.dives || this.diveSetup.dives.length === 0) {
            this.calculationResults = null;
            return;
        }

        const waypoints = this.diveSetup.dives[0].waypoints;
        const gases = this.diveSetup.gases;
        const surfaceInterval = this.diveSetup.surfaceInterval || 0;
        const surfacePressure = getSurfacePressure(this.diveSetup.environment);

        this.calculationResults = calculateTissueLoading(waypoints, surfaceInterval, {
            gases,
            initialTissuePressures: this.diveSetup.initialTissuePressures,
            surfacePressure
        });
        const hasGF = (this.diveSetup.gfLow ?? 100) < 100
            || (this.diveSetup.gfHigh ?? 100) < 100;
        this.gfAnchor = hasGF
            ? calculateChartGFAnchor(this.diveSetup, this.calculationResults)
            : { pAnchor: surfacePressure, anchorDepth: 0 };
        this._updateTimeDisplay();
    }

    _render() {
        if (!this.calculationResults) return;
        applyChartTheme();

        const results = this.calculationResults;
        const surfacePressure = results.surfacePressure ?? SURFACE_PRESSURE;
        const gfLow = (this.diveSetup.gfLow || 100) / 100;
        const gfHigh = (this.diveSetup.gfHigh || 100) / 100;
        const timeIndex = this.currentTimeIndex;

        // Get current ambient pressure
        const currentAmbient = results.ambientPressures[timeIndex];

        // Determine chart bounds
        const maxAmbient = Math.max(...results.ambientPressures);
        const maxPressure = this.options.maxPressure || Math.max(maxAmbient, 5) * 1.1;

        const datasets = [];

        // M-value line at 100%
        datasets.push({
            label: translate('chart.gf.mValue100', 'M-value (100%)'),
            data: [{ x: 0, y: 100 }, { x: maxPressure, y: 100 }],
            borderColor: 'rgba(231, 76, 60, 0.8)',
            borderDash: [6, 3],
            pointRadius: 0,
            showLine: true,
            fill: false,
            order: 50
        });

        // Calculate pAnchor for GF corridor
        const hasGF = gfLow < 1 || gfHigh < 1;
        let pAnchor = surfacePressure;

        if (hasGF && results.depthPoints) {
            pAnchor = this.gfAnchor?.pAnchor ?? surfacePressure;

            if (pAnchor > surfacePressure) {
                const corridorUpper = [];
                const numPoints = 30;
                for (let i = 0; i <= numPoints; i++) {
                    const p = surfacePressure + (pAnchor - surfacePressure) * (i / numPoints);
                    const gf = p >= pAnchor
                        ? gfLow
                        : interpolateGF(p, pAnchor, gfLow, gfHigh, surfacePressure);
                    corridorUpper.push({ x: p, y: gf * 100 });
                }
                corridorUpper.push({ x: maxPressure, y: gfLow * 100 });

                datasets.push({
                    label: translate('chart.gf.gfCorridor', 'GF corridor'),
                    data: corridorUpper,
                    borderColor: 'rgba(46, 204, 113, 0.8)',
                    backgroundColor: 'rgba(46, 204, 113, 0.1)',
                    borderWidth: 2,
                    pointRadius: 0,
                    showLine: true,
                    fill: { target: { value: 0 }, above: 'rgba(46, 204, 113, 0.1)' },
                    order: 48
                });
            }

            // pAnchor vertical line
            if (pAnchor > surfacePressure) {
                datasets.push({
                    label: fmt(translate('chart.gf.pAnchor', 'pAnchor {0}\u00a0bar ({1}\u00a0m)'), fmtNum(pAnchor, 2), fmtNum(((pAnchor - surfacePressure) / 0.1), 1)),
                    data: [
                        { x: pAnchor, y: -10 },
                        { x: pAnchor, y: 120 }
                    ],
                    borderColor: 'rgba(243, 156, 18, 0.6)',
                    borderWidth: 2,
                    borderDash: [4, 4],
                    pointRadius: 0,
                    fill: false,
                    showLine: true,
                    order: 98
                });
            }
        }

        // For each visible compartment
        COMPARTMENTS.forEach(comp => {
            if (!this.visibleCompartments.has(comp.id)) return;

            // Trail
            if (this.options.showTrail) {
                const trailData = [];
                for (let i = 0; i <= timeIndex; i++) {
                    const tissuePressure = results.compartments[comp.id].pressures[i];
                    const ambientPressure = results.ambientPressures[i];
                    const gfPercent = calculateInstantGF(tissuePressure, ambientPressure, comp) * 100;
                    trailData.push({
                        x: ambientPressure,
                        y: gfPercent
                    });
                }
                datasets.push({
                    label: fmt(translate('chart.mvalue.trailTC', 'Trail TC{0}'), comp.id),
                    data: trailData,
                    borderColor: comp.color + '60',
                    borderWidth: 1,
                    pointRadius: 0,
                    showLine: true,
                    fill: false,
                    order: 10
                });
            }

            // Current tissue point
            const currentTissue = results.compartments[comp.id].pressures[timeIndex];
            const currentGF = calculateInstantGF(currentTissue, currentAmbient, comp) * 100;
            datasets.push({
                label: fmt(translate('chart.mvalue.tcLabel', 'TC{0} ({1}\u00a0min)'), comp.id, fmtNum(comp.halfTime)),
                data: [{ x: currentAmbient, y: currentGF }],
                backgroundColor: comp.color,
                borderColor: '#fff',
                borderWidth: 2,
                pointRadius: 8,
                showLine: false,
                order: 1
            });
        });

        // Leading tissue envelope - max GF% across all tissues at each time point
        if (this.options.showTrail && results.timePoints) {
            const envelopeData = [];
            for (let i = 0; i <= timeIndex; i++) {
                const amb = results.ambientPressures[i];
                let maxGF = -Infinity;
                for (const comp of COMPARTMENTS) {
                    const tp = results.compartments[comp.id].pressures[i];
                    const gf = calculateInstantGF(tp, amb, comp) * 100;
                    if (gf > maxGF) maxGF = gf;
                }
                envelopeData.push({ x: amb, y: maxGF });
            }
            datasets.push({
                label: translate('chart.gf.leadingTissue', 'Leading tissue'),
                data: envelopeData,
                borderColor: 'rgba(0, 0, 0, 0.6)',
                borderWidth: 2.5,
                pointRadius: 0,
                showLine: true,
                fill: false,
                borderDash: [],
                order: 5
            });
        }

        // Leading tissue dot (largest GF% at current time)
        {
            let maxGF = -Infinity;
            let leadingComp = null;
            for (const comp of COMPARTMENTS) {
                const tp = results.compartments[comp.id].pressures[timeIndex];
                const gf = calculateInstantGF(tp, currentAmbient, comp) * 100;
                if (gf > maxGF) { maxGF = gf; leadingComp = comp; }
            }
            if (leadingComp) {
                datasets.push({
                    label: fmt(translate('chart.gf.leadingTC', 'Leading: TC{0} ({1}%)'), leadingComp.id, fmtNum(maxGF, 0)),
                    data: [{ x: currentAmbient, y: maxGF }],
                    backgroundColor: 'rgba(0, 0, 0, 0.8)',
                    borderColor: leadingComp.color,
                    borderWidth: 3,
                    pointRadius: 10,
                    pointStyle: 'circle',
                    showLine: false,
                    order: 0
                });
            }
        }

        const config = {
            type: 'scatter',
            data: { datasets },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                // Only animate the first build; re-renders (time scrub / compartment
                // toggle) rebuild the chart and a 50 ms entrance animation on each step
                // reads as the chart "jumping" while moving through time. `this.chart` is
                // the prior instance here (config built before the destroy below), null first.
                animation: this.chart ? false : { duration: 50 },
                plugins: {
                    legend: {
                        display: true,
                        position: 'top',
                        labels: {
                            filter: (item) => {
                                const text = item.text || '';
                                const leadingPrefix = translate('chart.gf.leadingTC', 'Leading: TC').split('TC')[0];
                                const leadingPrefixEn = 'Leading:';
                                const isTissue = text.startsWith('TC') && text.includes('min');
                                const isLeading = text.startsWith(leadingPrefix) || text.startsWith(leadingPrefixEn);
                                const isPAnchor = text.startsWith('pAnchor');
                                return isTissue || isLeading || isPAnchor;
                            }
                        }
                    },
                    tooltip: {
                        enabled: this.options.interactive,
                        callbacks: {
                            label: (context) => {
                                const label = context.dataset.label || '';
                                return fmt(
                                    translate('chart.gf.tooltipLabel', '{0}: p_amb={1}\u00a0bar, GF={2}%'),
                                    label, fmtNum(context.parsed.x, 2), fmtNum(context.parsed.y, 1)
                                );
                            }
                        }
                    },
                    zoom: {
                        pan: {
                            enabled: false,   // toggled on by the lock button
                            mode: 'xy',
                            threshold: 10,
                            onPanComplete: () => {
                                this.hasUserZoomed = true;
                                if (this.resetZoomBtn) {
                                    this.resetZoomBtn.style.display = 'block';
                                }
                            }
                        },
                        zoom: {
                            wheel: {
                                enabled: false,   // toggled on by the lock button
                                speed: 0.015
                            },
                            pinch: {
                                enabled: false
                            },
                            mode: 'xy',
                            onZoomComplete: () => {
                                this.hasUserZoomed = true;
                                if (this.resetZoomBtn) {
                                    this.resetZoomBtn.style.display = 'block';
                                }
                            }
                        }
                    }
                },
                scales: {
                    x: {
                        type: 'linear',
                        title: { display: true, text: translate('chart.axes.ambientPressureBar', 'Ambient Pressure (bar)') },
                        min: 0,
                        max: maxPressure
                    },
                    y: {
                        type: 'linear',
                        title: { display: true, text: translate('chart.axes.gfPercent', 'GF (%)') },
                        min: -10,
                        suggestedMax: 120
                    }
                }
            }
        };

        // Save zoom state before destroying
        if (this.chart) {
            if (this.hasUserZoomed) {
                const xScale = this.chart.scales.x;
                const yScale = this.chart.scales.y;
                if (xScale && yScale) {
                    this.savedZoomState = {
                        x: { min: xScale.min, max: xScale.max },
                        y: { min: yScale.min, max: yScale.max }
                    };
                }
            }
            this.chart.destroy();
        }
        this.chart = new Chart(this.canvas, config);

        // Restore zoom state
        if (this.savedZoomState && this.hasUserZoomed) {
            this.chart.zoomScale('x', this.savedZoomState.x, 'none');
            this.chart.zoomScale('y', this.savedZoomState.y, 'none');
            if (this.resetZoomBtn) {
                this.resetZoomBtn.style.display = 'block';
            }
        }
    }

    // ============================================================================
    // Public API
    // ============================================================================

    /**
     * Set the current time index
     * @param {number} index - Time index
     */
    setTimeIndex(index) {
        if (!this.calculationResults) return;
        const maxIndex = this.calculationResults.timePoints.length - 1;
        this.currentTimeIndex = Math.max(0, Math.min(maxIndex, index));
        this._updateSliderPosition();
        this._updateTimeDisplay();
        this._render();
    }

    /**
     * Get total time points
     * @returns {number}
     */
    getTimePointCount() {
        return this.calculationResults ? this.calculationResults.timePoints.length : 0;
    }

    /**
     * Get current time in minutes
     * @returns {number}
     */
    getCurrentTime() {
        if (!this.calculationResults) return 0;
        return this.calculationResults.timePoints[this.currentTimeIndex] || 0;
    }

    /**
     * Get current depth in meters
     * @returns {number}
     */
    getCurrentDepth() {
        if (!this.calculationResults) return 0;
        return this.calculationResults.depthPoints[this.currentTimeIndex] || 0;
    }

    /**
     * Update with new dive setup
     * @param {Object} diveSetup - New dive setup
     * @param {Object} [options] - New options
     */
    update(diveSetup, options) {
        if (options) {
            this.options = mergeOptions(this.options, options);
        }

        const validation = validateDiveSetup(diveSetup);
        if (!validation.valid) {
            console.error('GFChart: Invalid dive setup', validation.errors);
            return;
        }

        this.diveSetup = normalizeDiveSetup(diveSetup);
        this.currentTimeIndex = 0;
        this._calculate();
        this._updateSliderPosition();
        this._render();
    }

    /**
     * Toggle compartment visibility
     * @param {number} compartmentId - Compartment ID (1-16)
     * @param {boolean} [visible] - Set visibility
     */
    toggleCompartment(compartmentId, visible) {
        if (visible === undefined) {
            if (this.visibleCompartments.has(compartmentId)) {
                this.visibleCompartments.delete(compartmentId);
            } else {
                this.visibleCompartments.add(compartmentId);
            }
        } else if (visible) {
            this.visibleCompartments.add(compartmentId);
        } else {
            this.visibleCompartments.delete(compartmentId);
        }
        this._updateCompartmentCheckboxes();
        this._render();
    }

    /**
     * Destroy the chart and clean up
     */
    destroy() {
        this._stopPlayback();

        if (this.chart) {
            this.chart.destroy();
            this.chart = null;
        }

        if (this._resizeObserver) {
            this._resizeObserver.disconnect();
            this._resizeObserver = null;
        }

        if (this._resizeTimeout) {
            clearTimeout(this._resizeTimeout);
            this._resizeTimeout = null;
        }

        document.removeEventListener('keydown', this._keyHandler);
        if (this._onLanguageChange) {
            document.removeEventListener('languagechange', this._onLanguageChange);
            this._onLanguageChange = null;
        }
        this.container.innerHTML = '';
    }
}

/**
 * Create a GFChart instance
 * @param {HTMLElement|string} container - Container element or selector
 * @param {Object} config - Configuration object
 * @returns {GFChart}
 */
export function createGFChart(container, config) {
    const element = typeof container === 'string'
        ? document.querySelector(container)
        : container;

    if (!element) {
        throw new Error('GFChart: Container element not found');
    }

    return new GFChart(element, config);
}
