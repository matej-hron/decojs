/**
 * M-Value Chart Component
 * 
 * A reusable, embeddable chart component that displays the pressure-pressure
 * (M-value) diagram showing tissue nitrogen loading vs ambient pressure.
 * 
 * This is the classic decompression visualization showing:
 * - Ambient line (y = x): Equilibrium/saturation line
 * - M-value lines: Maximum tolerable tissue pressure (Bühlmann limits)
 * - GF lines: Gradient factor adjusted limits
 * - Tissue points: Current state of each compartment
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
 *   T: Toggle the intersection ruler for the hovered/selected tissue
 * 
 * Usage:
 *   import { MValueChart } from './charts/MValueChart.js';
 *   
 *   const chart = new MValueChart(containerElement, {
 *     diveSetup: { gases: [...], dives: [{ waypoints: [...] }], gfLow: 70, gfHigh: 85 },
 *     options: { compartments: [1, 2, 3, 4], showGFLines: true }
 *   });
 */

import { COMPARTMENTS } from '../tissueCompartments.js';
import { applyChartTheme, theme } from './chartTheme.js';
import { createInteractionLockBtn } from './interactionLock.js';
import { resolveChartTooltipEnabled } from '../components/tooltipShortcut.js';
import { getCurrentLanguage, translate } from '../i18n.js';

import { fmtNum } from '../format.js';
/** Helper: replace {0}, {1}, ... placeholders with the given values. */
function fmt(str, ...values) {
    return String(str).replace(/\{(\d+)\}/g, (_, i) => {
        const v = values[Number(i)];
        return v === undefined ? '' : String(v);
    });
}

export function calculateMValueRulerIntersections({
    tissuePressure,
    compartment,
    gfLow,
    gfHigh,
    surfacePressure,
    pAnchor,
    pressurePerMeter = PRESSURE_PER_METER
}) {
    const intersection = (gf) => {
        const pressure = getCompartmentCeiling(
            tissuePressure,
            compartment.aN2,
            compartment.bN2,
            gf
        );
        return {
            pressure,
            depth: Math.max(0, (pressure - surfacePressure) / pressurePerMeter),
            gf
        };
    };
    const low = intersection(gfLow);
    const high = intersection(gfHigh);

    let rampedGF;
    if (pAnchor <= surfacePressure || Math.abs(gfHigh - gfLow) < 1e-12) {
        rampedGF = low;
    } else if (low.pressure >= pAnchor) {
        rampedGF = low;
    } else if (high.pressure <= surfacePressure) {
        rampedGF = high;
    } else {
        let lower = surfacePressure;
        let upper = pAnchor;
        for (let i = 0; i < 80; i++) {
            const pressure = (lower + upper) / 2;
            const gf = interpolateGF(
                pressure,
                pAnchor,
                gfLow,
                gfHigh,
                surfacePressure
            );
            const adjustedM = getAdjustedMValue(
                pressure,
                compartment.aN2,
                compartment.bN2,
                gf
            );
            if (adjustedM < tissuePressure) {
                lower = pressure;
            } else {
                upper = pressure;
            }
        }
        const pressure = (lower + upper) / 2;
        rampedGF = {
            pressure,
            depth: Math.max(
                0,
                (pressure - surfacePressure) / pressurePerMeter
            ),
            gf: interpolateGF(
                pressure,
                pAnchor,
                gfLow,
                gfHigh,
                surfacePressure
            )
        };
    }

    return {
        equilibrium: {
            pressure: tissuePressure,
            depth: Math.max(
                0,
                (tissuePressure - surfacePressure) / pressurePerMeter
            )
        },
        gfLow: low,
        gfRamp: rampedGF,
        gfHigh: high
    };
}
import {
    calculateTissueLoading,
    getMValue,
    getAdjustedMValue,
    getCompartmentCeiling,
    getDiveCeiling,
    interpolateGF,
    getSurfacePressure,
    getPressurePerMeter,
    SURFACE_PRESSURE,
    PRESSURE_PER_METER
} from '../decoModel.js';
import {
    calculateChartGFAnchor,
    createLegendHelpIcon,
    DEFAULT_ENVIRONMENT,
    mergeOptions,
    positionLegendHelpIcon,
    validateDiveSetup,
    normalizeDiveSetup
} from './chartTypes.js';

export function calculateCurrentControllingCompartment({
    tissuePressures,
    currentAmbient,
    gfLow,
    gfHigh,
    pAnchor,
    surfacePressure = SURFACE_PRESSURE,
    pressurePerMeter = PRESSURE_PER_METER
}) {
    const gf = interpolateGF(
        currentAmbient,
        pAnchor,
        gfLow,
        gfHigh,
        surfacePressure
    );
    const ceiling = getDiveCeiling(
        tissuePressures,
        gf,
        surfacePressure,
        pressurePerMeter
    );
    return {
        ...ceiling,
        gf,
        controllingCompartment:
            ceiling.ceilingDepth > 1e-9
                ? ceiling.controllingCompartment
                : null
    };
}

/**
 * Default options for MValueChart
 */
const DEFAULT_MVALUE_OPTIONS = {
    compartments: [1],  // Show only fastest tissue by default
    showMValueLines: true,
    showGFLines: true,
    showAmbientLine: true,
    showAlveolarLine: false,
    showSurfaceLine: true,
    showTrail: true,
    interactive: true,
    fullscreenButton: true,
    compartmentSelector: true,
    playbackSpeed: 100,  // ms per frame
    onTimeIndexChange: null,
    maxPressure: null,   // Override axis max (null = auto-calculate)
    colors: {
        ambient: 'rgba(52, 152, 219, 0.8)',
        surface: 'rgba(128, 128, 128, 0.6)'
    }
};

/**
 * MValueChart - Pressure-pressure diagram visualization
 */
export class MValueChart {
    /**
     * Create a new MValueChart
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
        this.rulerPanel = null;
        this.anchorHelpIcon = null;
        this.fullscreenBtn = null;
        this.exitFullscreenBtn = null;
        this.wrapper = null;
        this.chartContainer = null;
        this.controlsContainer = null;
        this.timelineContainer = null;
        this.timeSlider = null;
        this.timeDisplay = null;
        this.playBtn = null;
        this.alveolarToggle = null;
        this.controllingCompartmentStatus = null;
        
        // State
        this.calculationResults = null;
        this.currentTimeIndex = 0;
        this.visibleCompartments = new Set();
        this.rulerCompartmentId = null;
        this.isPlaying = false;
        this.playInterval = null;
        this.savedZoomState = null;
        this.hasUserZoomed = false;
        
        // Merge options with defaults
        this.options = mergeOptions(DEFAULT_MVALUE_OPTIONS, config.options);
        this.environment = mergeOptions(DEFAULT_ENVIRONMENT, config.environment);
        
        // Initialize visible compartments
        (this.options.compartments || [1]).forEach(c => this.visibleCompartments.add(c));
        
        // Validate and normalize dive setup
        if (config.diveSetup) {
            const validation = validateDiveSetup(config.diveSetup);
            if (!validation.valid) {
                console.error('MValueChart: Invalid dive setup', validation.errors);
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
        this.container.tabIndex = 0; // Make focusable for keyboard events
        this.container.style.outline = 'none';
        
        // Main wrapper - fills parent container
        this.wrapper = document.createElement('div');
        this.wrapper.className = 'mvc-wrapper';
        this.wrapper.style.cssText = 'display: flex; flex-direction: column; width: 100%; height: 100%; overflow: hidden;';
        
        // Compartment selector
        if (this.options.compartmentSelector) {
            this.controlsContainer = document.createElement('div');
            this.controlsContainer.className = 'mvc-controls';
            this.controlsContainer.style.cssText = `
                display: flex; flex-wrap: wrap; gap: 4px; padding: 8px;
                background: #f8f9fa; border-radius: 4px; margin-bottom: 8px;
                align-items: center;
            `;
            this._buildCompartmentSelector();
            this.wrapper.appendChild(this.controlsContainer);
        }
        
        // Timeline controls
        this.timelineContainer = document.createElement('div');
        this.timelineContainer.className = 'mvc-timeline';
        this.timelineContainer.style.cssText = `
            display: flex; align-items: center; gap: 8px; padding: 8px;
            background: #f8f9fa; border-radius: 4px; margin-bottom: 8px;
        `;
        this._buildTimelineControls();
        this.wrapper.appendChild(this.timelineContainer);

        // Chart container - fills remaining height
        this.chartContainer = document.createElement('div');
        this.chartContainer.className = 'mvc-chart-container';
        // Use CSS class for base styles, minimal inline styles for flex behavior
        this.chartContainer.style.flex = '1';
        this.chartContainer.style.minHeight = '0';
        
        // Canvas - no inline styles, let CSS handle it
        this.canvas = document.createElement('canvas');
        this.chartContainer.appendChild(this.canvas);

        this.anchorHelpIcon = createLegendHelpIcon();
        this.chartContainer.appendChild(this.anchorHelpIcon);

        this.rulerPanel = document.createElement('div');
        this.rulerPanel.className = 'mvc-ruler-panel';
        this.rulerPanel.style.cssText = `
            display: none; position: absolute; top: 10px; left: 10px;
            z-index: 5; padding: 10px 12px; pointer-events: none;
            background: var(--surface-elevated, #fff);
            border: 1px solid var(--border, #e1e6ec);
            color: var(--text, #2c3e50); font-size: var(--text-xs, 0.75rem);
            line-height: 1.6;
        `;
        this.chartContainer.appendChild(this.rulerPanel);
        
        // Fullscreen button
        if (this.options.fullscreenButton) {
            this.fullscreenBtn = document.createElement('button');
            this.fullscreenBtn.className = 'mvc-fullscreen-btn';
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
            this.exitFullscreenBtn.className = 'mvc-exit-fullscreen-btn';
            this.exitFullscreenBtn.innerHTML = '✕';
            this.exitFullscreenBtn.title = translate('chart.tooltips.exitFullscreen', 'Exit Fullscreen (Esc)');
            this.exitFullscreenBtn.style.cssText = `
                position: absolute; top: 16px; right: 16px; z-index: 1001;
                padding: 8px 12px; background: rgba(0,0,0,0.7); color: white;
                border: none; border-radius: 4px; cursor: pointer;
                font-size: 20px; display: none;
            `;
            this.exitFullscreenBtn.addEventListener('click', () => this._toggleFullscreen());
            this.chartContainer.appendChild(this.exitFullscreenBtn);
        }
        
        // Reset zoom button
        this.resetZoomBtn = document.createElement('button');
        this.resetZoomBtn.className = 'mvc-reset-zoom-btn';
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

        this.wrapper.appendChild(this.chartContainer);

        // Mini profile canvas - shows dive profile with current position marker
        this.miniProfileCanvas = document.createElement('canvas');
        this.miniProfileCanvas.style.cssText = 'width: 100%; height: 100px; margin-top: 6px; border-radius: 4px; background: var(--surface-alt, #f0f4f8);';
        this.wrapper.appendChild(this.miniProfileCanvas);

        this.container.appendChild(this.wrapper);
        
        // Set up ResizeObserver to automatically resize chart when container changes
        this._resizeObserver = new ResizeObserver(() => {
            // Debounce resize calls
            if (this._resizeTimeout) {
                clearTimeout(this._resizeTimeout);
            }
            this._resizeTimeout = setTimeout(() => {
                // Don't resize during fullscreen (we handle that separately)
                if (!this.wrapper.classList.contains('mvc-fullscreen')) {
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
            // Clear any explicit dimensions that might be cached
            this.canvas.style.width = '';
            this.canvas.style.height = '';
            this.canvas.removeAttribute('width');
            this.canvas.removeAttribute('height');
            
            // Tell Chart.js to resize based on container
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

        const alveolarLabel = document.createElement('label');
        alveolarLabel.className = 'mvc-alveolar-toggle';
        alveolarLabel.style.cssText = `
            display: inline-flex; align-items: center; gap: 3px;
            padding: 2px 6px; cursor: pointer; font-size: 12px;
            white-space: nowrap;
        `;
        this.alveolarToggle = document.createElement('input');
        this.alveolarToggle.type = 'checkbox';
        this.alveolarToggle.checked = this.options.showAlveolarLine;
        this.alveolarToggle.addEventListener('change', () => {
            this.options.showAlveolarLine = this.alveolarToggle.checked;
            this._render();
        });
        const alveolarP = document.createElement('var');
        alveolarP.textContent = 'p';
        const alveolarN2 = document.createElement('sub');
        alveolarN2.textContent = 'N₂';
        alveolarLabel.append(
            this.alveolarToggle,
            document.createTextNode(
                `${translate('chart.mvalue.alveolarToggle', 'Alveolar')} `
            ),
            alveolarP,
            alveolarN2
        );
        this.controlsContainer.appendChild(alveolarLabel);
        
        // Compartment checkboxes
        COMPARTMENTS.forEach(comp => {
            const label = document.createElement('label');
            label.className = 'mvc-compartment-option';
            label.dataset.compartmentId = String(comp.id);
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
            // Click: switch to this tissue only. Shift+click: toggle (add/remove).
            label.addEventListener('click', (e) => {
                e.preventDefault();
                const rulerWasActive = this.rulerCompartmentId !== null;
                if (e.shiftKey) {
                    // Shift+click: toggle this compartment
                    if (this.visibleCompartments.has(comp.id)) {
                        this.visibleCompartments.delete(comp.id);
                    } else {
                        this.visibleCompartments.add(comp.id);
                    }
                } else {
                    // Normal click: switch to this compartment only
                    this.visibleCompartments.clear();
                    this.visibleCompartments.add(comp.id);
                }
                if (rulerWasActive) {
                    this._reconcileRulerCompartment(
                        e.shiftKey ? null : comp.id
                    );
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

        this.controllingCompartmentStatus = document.createElement('div');
        this.controllingCompartmentStatus.className = 'mvc-controlling-status';
        this.controlsContainer.appendChild(this.controllingCompartmentStatus);

        // Shortcut legend
        const hint = document.createElement('div');
        hint.style.cssText = 'font-size: 0.7rem; color: var(--text-muted, #888); margin-top: 2px; padding: 0 4px;';
        hint.textContent = translate(
            'chart.hints.mvalueCompartments',
            'Click = select one · Shift+click = toggle · ←→ step · Space play · T ruler · F fullscreen'
        );
        this.controlsContainer.appendChild(hint);
    }

    _updateControllingCompartmentIndicator(state) {
        const controllingId = state?.controllingCompartment ?? null;
        let statusText;
        if (controllingId === null) {
            statusText = translate(
                'chart.mvalue.noControllingCompartment',
                'No decompression ceiling at this point'
            );
        } else {
            const ceilingDecimals = state.ceilingDepth < 0.1 ? 2 : 1;
            statusText = fmt(
                translate(
                    'chart.mvalue.controllingCompartment',
                    'Controlling compartment: TC{0} · ceiling {1}\u00a0m'
                ),
                controllingId,
                fmtNum(state.ceilingDepth, ceilingDecimals)
            );
        }

        if (this.controllingCompartmentStatus) {
            this.controllingCompartmentStatus.textContent = statusText;
            this.controllingCompartmentStatus.classList.toggle(
                'active',
                controllingId !== null
            );
        }

        this.controlsContainer
            ?.querySelectorAll('.mvc-compartment-option')
            .forEach(label => {
                const isControlling =
                    Number(label.dataset.compartmentId) === controllingId;
                label.classList.toggle(
                    'mvc-controlling-compartment',
                    isControlling
                );
                if (isControlling) {
                    label.setAttribute('aria-current', 'true');
                    label.title = statusText;
                } else {
                    label.removeAttribute('aria-current');
                    label.removeAttribute('title');
                }
            });
    }
    
    /**
     * Build timeline playback controls
     * @private
     */
    _buildTimelineControls() {
        // Rewind button
        const rewindBtn = this._createButton('⏮', translate('chart.tooltips.jumpStart', 'Jump to start (Home)'), () => this._jumpToStart());

        // Step back button
        const stepBackBtn = this._createButton('◀', translate('chart.tooltips.stepBack', 'Step back (←)'), () => this._stepTime(-1));

        // Play/Pause button
        this.playBtn = this._createButton('▶️', translate('chart.tooltips.playPause', 'Play/Pause (Space)'), () => this._togglePlayback());

        // Step forward button
        const stepFwdBtn = this._createButton('▶', translate('chart.tooltips.stepForward', 'Step forward (→)'), () => this._stepTime(1));

        // Fast forward button
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
            this._applyTimeIndexChange();
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
            // Only handle if container is focused or we're in fullscreen
            if (!this.container.contains(document.activeElement) &&
                !this.wrapper.classList.contains('mvc-fullscreen')) {
                return;
            }
            
            // Don't handle if typing in an input
            if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT') return;

            if ((e.key === 'f' || e.key === 'F') &&
                !e.metaKey && !e.ctrlKey && !e.altKey &&
                this.options.fullscreenButton) {
                e.preventDefault();
                this._toggleFullscreen();
                return;
            }
            if (e.key === 'Escape' &&
                this.wrapper.classList.contains('mvc-fullscreen')) {
                this._toggleFullscreen();
                return;
            }
            if (!this.calculationResults) return;
            
            const maxIndex = this.calculationResults.timePoints.length - 1;
            
            switch (e.key) {
                case ' ':  // Space - play/pause
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

                case 't':
                case 'T':
                    if (e.metaKey || e.ctrlKey || e.altKey) break;
                    e.preventDefault();
                    this._toggleRuler();
                    break;
                    
            }
        };
        
        document.addEventListener('keydown', this._keyHandler);
    }
    
    // ============================================================================
    // Timeline Controls
    // ============================================================================

    _applyTimeIndexChange(notify = true) {
        this._updateSliderPosition();
        this._updateTimeDisplay();
        this._render();
        if (notify && typeof this.options.onTimeIndexChange === 'function') {
            this.options.onTimeIndexChange(this.currentTimeIndex);
        }
    }
    
    _stepTime(steps) {
        this._stopPlayback();
        if (!this.calculationResults) return;
        const maxIndex = this.calculationResults.timePoints.length - 1;
        this.currentTimeIndex = Math.max(0, Math.min(maxIndex, this.currentTimeIndex + steps));
        this._applyTimeIndexChange();
    }
    
    _jumpToStart() {
        this._stopPlayback();
        this.currentTimeIndex = 0;
        this._applyTimeIndexChange();
    }
    
    _jumpToEnd() {
        this._stopPlayback();
        if (!this.calculationResults) return;
        this.currentTimeIndex = this.calculationResults.timePoints.length - 1;
        this._applyTimeIndexChange();
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
                this._applyTimeIndexChange();
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
                this._applyTimeIndexChange();
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
            this._applyTimeIndexChange();
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

    _toggleRuler() {
        const active = this.chart?.getActiveElements?.() || [];
        const hoveredId = active
            .map(({ datasetIndex }) =>
                this.chart.data.datasets[datasetIndex]?.mvalueCompartmentId
            )
            .find(Boolean);

        if (this.rulerCompartmentId && !hoveredId) {
            const soleVisibleId = this.visibleCompartments.size === 1
                ? [...this.visibleCompartments][0]
                : null;
            if (!this.visibleCompartments.has(this.rulerCompartmentId) &&
                soleVisibleId) {
                this.rulerCompartmentId = soleVisibleId;
            } else {
                this.rulerCompartmentId = null;
            }
        } else {
            const selectedId = hoveredId ??
                (this.visibleCompartments.size === 1
                    ? [...this.visibleCompartments][0]
                    : null);
            if (!selectedId) return;
            this.rulerCompartmentId =
                this.rulerCompartmentId === selectedId ? null : selectedId;
        }
        this._render();
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
        this._reconcileRulerCompartment();
        this._updateCompartmentCheckboxes();
        this._render();
    }
    
    _selectNoCompartments() {
        this.visibleCompartments.clear();
        this._reconcileRulerCompartment();
        this._updateCompartmentCheckboxes();
        this._render();
    }
    
    _selectFastCompartments() {
        this.visibleCompartments.clear();
        COMPARTMENTS.filter(c => c.halfTime <= 12.5).forEach(c => this.visibleCompartments.add(c.id));
        this._reconcileRulerCompartment();
        this._updateCompartmentCheckboxes();
        this._render();
    }
    
    _selectSlowCompartments() {
        this.visibleCompartments.clear();
        COMPARTMENTS.filter(c => c.halfTime >= 109).forEach(c => this.visibleCompartments.add(c.id));
        this._reconcileRulerCompartment();
        this._updateCompartmentCheckboxes();
        this._render();
    }
    
    _moveCompartmentsSlower() {
        const currentIds = Array.from(this.visibleCompartments).sort((a, b) => a - b);
        if (currentIds.length === 0) return;
        
        const slowestId = currentIds[currentIds.length - 1];
        if (slowestId >= 16) return;

        const preferredRulerId = this.rulerCompartmentId === null
            ? null
            : this.rulerCompartmentId + 1;
        this.visibleCompartments.clear();
        currentIds.forEach(id => this.visibleCompartments.add(id + 1));
        this._reconcileRulerCompartment(preferredRulerId);
        this._updateCompartmentCheckboxes();
        this._render();
    }
    
    _moveCompartmentsFaster() {
        const currentIds = Array.from(this.visibleCompartments).sort((a, b) => a - b);
        if (currentIds.length === 0) return;
        
        const fastestId = currentIds[0];
        if (fastestId <= 1) return;

        const preferredRulerId = this.rulerCompartmentId === null
            ? null
            : this.rulerCompartmentId - 1;
        this.visibleCompartments.clear();
        currentIds.forEach(id => this.visibleCompartments.add(id - 1));
        this._reconcileRulerCompartment(preferredRulerId);
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
            this._reconcileRulerCompartment();
            this._updateCompartmentCheckboxes();
            this._render();
        }
    }

    _reconcileRulerCompartment(preferredId = null) {
        if (this.rulerCompartmentId === null) return;
        if (preferredId !== null && this.visibleCompartments.has(preferredId)) {
            this.rulerCompartmentId = preferredId;
            return;
        }
        if (this.visibleCompartments.has(this.rulerCompartmentId)) return;
        const remaining = [...this.visibleCompartments].sort((a, b) => a - b);
        this.rulerCompartmentId = remaining[0] ?? null;
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

    _isLegendItemVisible(legendItem, chartData) {
        return chartData?.datasets[legendItem.datasetIndex]?.mvalueAnchor === true;
    }

    // ============================================================================
    // Fullscreen
    // ============================================================================
    
    _toggleFullscreen() {
        const isFullscreen = this.wrapper.classList.toggle('mvc-fullscreen');
        
        if (isFullscreen) {
            document.body.style.overflow = 'hidden';
            if (this.fullscreenBtn) this.fullscreenBtn.style.display = 'none';
            if (this.exitFullscreenBtn) this.exitFullscreenBtn.style.display = 'block';
        } else {
            document.body.style.overflow = '';
            if (this.fullscreenBtn) this.fullscreenBtn.style.display = '';
            if (this.exitFullscreenBtn) this.exitFullscreenBtn.style.display = 'none';
        }
        
        // Resize chart after layout change - use the public resize method
        // Multiple attempts to handle CSS transition timing
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
        const pressurePerMeter = getPressurePerMeter(this.diveSetup.environment);
        
        this.calculationResults = calculateTissueLoading(waypoints, surfaceInterval, {
            gases,
            initialTissuePressures: this.diveSetup.initialTissuePressures,
            surfacePressure,
            pressurePerMeter
        });
        const hasGF = (this.diveSetup.gfLow ?? 100) < 100
            || (this.diveSetup.gfHigh ?? 100) < 100;
        this.gfAnchor = hasGF
            ? calculateChartGFAnchor(this.diveSetup, this.calculationResults)
            : { pAnchor: surfacePressure, anchorDepth: 0 };
        this._updateTimeDisplay();
    }

    _getRulerData() {
        if (!this.rulerCompartmentId || !this.calculationResults) return null;
        if (!this.visibleCompartments.has(this.rulerCompartmentId)) return null;
        const compartment = COMPARTMENTS.find(
            comp => comp.id === this.rulerCompartmentId
        );
        if (!compartment) return null;

        const tissuePressure = this.calculationResults
            .compartments[compartment.id]
            .pressures[this.currentTimeIndex];
        const currentAmbient = this.calculationResults
            .ambientPressures[this.currentTimeIndex];
        const currentDepth = this.calculationResults
            .depthPoints[this.currentTimeIndex];
        const gfLow = (this.diveSetup.gfLow || 100) / 100;
        const gfHigh = (this.diveSetup.gfHigh || 100) / 100;
        const surfacePressure = this.calculationResults.surfacePressure ??
            SURFACE_PRESSURE;

        return {
            compartment,
            tissuePressure,
            currentAmbient,
            currentDepth,
            intersections: calculateMValueRulerIntersections({
                tissuePressure,
                compartment,
                gfLow,
                gfHigh,
                surfacePressure,
                pAnchor: this.gfAnchor.pAnchor,
                pressurePerMeter: this.calculationResults.pressurePerMeter
            })
        };
    }

    _drawRuler(chart) {
        const ruler = this._getRulerData();
        this._renderRulerPanel(ruler);
        if (!ruler) return;

        const { ctx, chartArea, scales } = chart;
        this.rulerPanel.style.left = `${chartArea.left + 10}px`;
        this.rulerPanel.style.top = `${chartArea.top + 10}px`;
        const y = scales.y.getPixelForValue(ruler.tissuePressure);
        if (y < chartArea.top || y > chartArea.bottom) return;

        const t = theme();
        const usesRawMValue =
            Math.abs(ruler.intersections.gfLow.gf - 1) < 1e-12 &&
            Math.abs(ruler.intersections.gfHigh.gf - 1) < 1e-12;
        const rows = [
            {
                value: ruler.intersections.equilibrium,
                color: t.colors.ambient
            },
            ...(usesRawMValue
                ? [{
                    value: ruler.intersections.gfRamp,
                    color: ruler.compartment.color
                }]
                : [
                    {
                        value: ruler.intersections.gfLow,
                        color: '#f39c12'
                    },
                    {
                        value: ruler.intersections.gfRamp,
                        color: ruler.compartment.color
                    },
                    {
                        value: ruler.intersections.gfHigh,
                        color: '#9b59b6'
                    }
                ])
        ];

        ctx.save();
        ctx.lineWidth = 1.5;
        ctx.strokeStyle = ruler.compartment.color;
        ctx.setLineDash([6, 4]);
        ctx.beginPath();
        ctx.moveTo(chartArea.left, y);
        ctx.lineTo(chartArea.right, y);
        ctx.stroke();

        for (const row of rows) {
            const x = scales.x.getPixelForValue(row.value.pressure);
            if (x < chartArea.left || x > chartArea.right) continue;
            ctx.strokeStyle = row.color;
            ctx.globalAlpha = 0.55;
            ctx.setLineDash([3, 4]);
            ctx.beginPath();
            ctx.moveTo(x, chartArea.top);
            ctx.lineTo(x, chartArea.bottom);
            ctx.stroke();
            ctx.globalAlpha = 1;
            ctx.fillStyle = row.color;
            ctx.beginPath();
            ctx.arc(x, y, 4, 0, Math.PI * 2);
            ctx.fill();
        }

        ctx.restore();
    }

    _positionAnchorHelpIcon(chart) {
        const help = translate(
            'chart.tooltips.anchorPressure',
            'Ambient pressure at the deepest decompression stop. GF Low applies at this point, which anchors the ramp toward GF High at the surface.'
        );
        positionLegendHelpIcon(
            chart,
            this.anchorHelpIcon,
            'mvalueAnchor',
            help
        );
    }

    _renderRulerPanel(ruler) {
        if (!this.rulerPanel) return;
        if (!ruler) {
            this.rulerPanel.style.display = 'none';
            this.rulerPanel.replaceChildren();
            return;
        }

        const isCzech = getCurrentLanguage() === 'cs';
        const tissueSubscript = isCzech ? 'tk' : 't';
        const ambientSubscript = isCzech ? 'okol' : 'amb';
        const toleratedSubscript = `${ambientSubscript},tol`;
        const panel = this.rulerPanel;
        panel.replaceChildren();
        panel.style.display = 'block';

        const quantity = (symbol, subscript) => {
            const fragment = document.createDocumentFragment();
            const variable = document.createElement('var');
            variable.textContent = symbol;
            fragment.appendChild(variable);
            if (subscript) {
                const sub = document.createElement('sub');
                sub.textContent = subscript;
                fragment.appendChild(sub);
            }
            return fragment;
        };
        const valueWithUnit = (value, unit, decimals) =>
            `${fmtNum(value, decimals)}\u00a0${unit}`;
        const appendPressureAndDepth = (line, value) => {
            line.appendChild(quantity('p', toleratedSubscript));
            line.append(
                ` = ${valueWithUnit(value.pressure, 'bar', 2)} · `
            );
            line.appendChild(quantity('h'));
            line.append(` = ${valueWithUnit(value.depth, 'm', 1)}`);
        };
        const addLine = (color, bold = false) => {
            const line = document.createElement('div');
            line.style.color = color;
            if (bold) line.style.fontWeight = '600';
            panel.appendChild(line);
            return line;
        };

        const header = addLine('var(--text, #2c3e50)', true);
        header.append(
            `TC${ruler.compartment.id} · `,
            translate('chart.mvalue.rulerTitle', 'Ruler'),
            ' · '
        );
        header.appendChild(quantity('p', tissueSubscript));
        header.append(
            ` = ${valueWithUnit(ruler.tissuePressure, 'bar', 2)}`
        );

        const currentPosition = addLine('var(--blue-500, #2980b9)', true);
        currentPosition.append(
            translate('chart.mvalue.rulerCurrentPosition', 'Current position'),
            ': '
        );
        currentPosition.appendChild(quantity('p', ambientSubscript));
        currentPosition.append(
            ` = ${valueWithUnit(ruler.currentAmbient, 'bar', 2)} · `
        );
        currentPosition.appendChild(quantity('h'));
        currentPosition.append(
            ` = ${valueWithUnit(ruler.currentDepth, 'm', 1)}`
        );

        const equilibrium = addLine('var(--amber-500, #f39c12)');
        equilibrium.appendChild(quantity('p', tissueSubscript));
        equilibrium.append(' = ');
        equilibrium.appendChild(quantity('p', ambientSubscript));
        equilibrium.append(
            ` = ${valueWithUnit(ruler.intersections.equilibrium.pressure, 'bar', 2)} · `
        );
        equilibrium.appendChild(quantity('h'));
        equilibrium.append(
            ` = ${valueWithUnit(ruler.intersections.equilibrium.depth, 'm', 1)}`
        );

        const usesRawMValue =
            Math.abs(ruler.intersections.gfLow.gf - 1) < 1e-12 &&
            Math.abs(ruler.intersections.gfHigh.gf - 1) < 1e-12;
        if (usesRawMValue) {
            const mValue = addLine(ruler.compartment.color, true);
            mValue.appendChild(quantity('M'));
            mValue.append(
                translate('chart.mvalue.rulerMValueSuffix', '-value'),
                ': '
            );
            appendPressureAndDepth(mValue, ruler.intersections.gfRamp);
        } else {
            const gfLow = addLine('#f39c12');
            gfLow.append('GF');
            gfLow.appendChild(document.createElement('sub')).textContent = 'low';
            gfLow.append(
                ` = ${valueWithUnit(ruler.intersections.gfLow.gf * 100, '%', 0)}: `
            );
            appendPressureAndDepth(gfLow, ruler.intersections.gfLow);

            const ramp = addLine(ruler.compartment.color, true);
            ramp.append(
                translate('chart.mvalue.rulerRampGFLabel', 'GF ramp'),
                ` = ${valueWithUnit(ruler.intersections.gfRamp.gf * 100, '%', 1)} · `,
                translate('chart.mvalue.rulerCeiling', 'ceiling'),
                ': '
            );
            appendPressureAndDepth(ramp, ruler.intersections.gfRamp);

            const gfHigh = addLine('#9b59b6');
            gfHigh.append('GF');
            gfHigh.appendChild(document.createElement('sub')).textContent = 'high';
            gfHigh.append(
                ` = ${valueWithUnit(ruler.intersections.gfHigh.gf * 100, '%', 0)}: `
            );
            appendPressureAndDepth(gfHigh, ruler.intersections.gfHigh);
        }
    }
    
    _render() {
        if (!this.calculationResults) return;

        // Push current CSS design tokens into Chart.defaults so every
        // chart (incl. this one) picks up consistent typography & grid.
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
        const allPressures = Object.values(results.compartments).flatMap(c => c.pressures);
        const maxTissue = Math.max(...allPressures);
        const maxPressure = this.options.maxPressure || Math.max(maxAmbient, maxTissue, 1.5) * 1.1;
        
        const datasets = [];
        
        // Ambient line (y = x)
        if (this.options.showAmbientLine) {
            datasets.push({
                label: translate('chart.mvalue.ambientLine', 'Ambient Line (y = x)'),
                data: [{ x: 0, y: 0 }, { x: maxPressure, y: maxPressure }],
                borderColor: this.options.colors.ambient,
                borderWidth: 2,
                pointRadius: 0,
                fill: false,
                showLine: true,
                order: 100
            });
        }
        
        // Alveolar pN₂ line: follows the dive's gas history in (P_amb, palv) space.
        // Traces (ambientPressure_t, alveolarN2Pressure_t) across the simulation — straight
        // line for a single-gas dive; steps down vertically at each deco-gas switch because
        // FN₂ drops while P_amb momentarily stays the same.
        if (this.options.showAlveolarLine) {
            const results = this.calculationResults;
            let alveolarData;
            let alveolarLabel = translate('chart.mvalue.alveolarPN2', 'Alveolar pN₂');

            if (results && results.ambientPressures && results.alveolarN2Pressures) {
                alveolarData = results.ambientPressures.map((amb, i) => ({
                    x: amb,
                    y: results.alveolarN2Pressures[i]
                }));
                // Label lists the unique gases actually breathed (in order of first use)
                const gasSeq = [];
                if (Array.isArray(results.gasNames)) {
                    for (const name of results.gasNames) {
                        if (name && !gasSeq.includes(name)) gasSeq.push(name);
                    }
                }
                if (gasSeq.length > 0) alveolarLabel = fmt(
                    translate('chart.mvalue.alveolarPN2WithGases', 'Alveolar pN₂ ({0})'),
                    gasSeq.join(' → ')
                );
            } else {
                // Fallback: no simulation yet — draw the bottom-gas straight reference line
                const gases = this.diveSetup?.gases || [];
                const n2 = gases[0]?.n2 ?? 0.79;
                const wv = 0.0627;
                alveolarData = [
                    { x: 0, y: 0 },
                    { x: maxPressure, y: (maxPressure - wv) * n2 }
                ];
                alveolarLabel = fmt(
                    translate('chart.mvalue.alveolarPN2Percent', 'Alveolar pN₂ ({0}%)'),
                    Math.round(n2 * 100)
                );
            }

            datasets.push({
                label: alveolarLabel,
                data: alveolarData,
                borderColor: 'rgba(46, 204, 113, 0.7)',
                borderWidth: 1.5,
                borderDash: [8, 4],
                pointRadius: 0,
                fill: false,
                showLine: true,
                order: 99
            });
        }

        // Surface line (x = 1 bar)
        if (this.options.showSurfaceLine) {
            datasets.push({
                label: fmt(
                    translate('chart.mvalue.surfaceLine', 'Surface ({0}\u00a0bar)'),
                    fmtNum(surfacePressure, 3)
                ),
                data: [{ x: surfacePressure, y: 0 }, { x: surfacePressure, y: maxPressure }],
                borderColor: this.options.colors.surface,
                borderWidth: 1,
                borderDash: [5, 5],
                pointRadius: 0,
                fill: false,
                showLine: true,
                order: 99
            });
        }
        
        // Calculate pAnchor for GF corridor line
        // pAnchor is where GF_max first equals GF_low during ascent
        const hasGF = gfLow < 1 || gfHigh < 1;
        let pAnchor = surfacePressure;
        
        if (hasGF && results.depthPoints) {
            pAnchor = this.gfAnchor?.pAnchor ?? surfacePressure;
            
            // Draw vertical line at pAnchor (GF Low anchor depth)
            if (pAnchor > surfacePressure) {
                const anchorDepthM = fmtNum(
                    (pAnchor - surfacePressure)
                        / this.calculationResults.pressurePerMeter,
                    1
                );
                datasets.push({
                    label: fmt(translate('chart.mvalue.pAnchor', 'Anchor pressure {0}\u00a0bar ({1}\u00a0m)'), fmtNum(pAnchor, 2), anchorDepthM),
                    mvalueAnchor: true,
                    data: [
                        { x: pAnchor, y: 0 },
                        { x: pAnchor, y: maxPressure }
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

        const currentTissuePressures = Object.fromEntries(
            COMPARTMENTS.map(comp => [
                comp.id,
                results.compartments[comp.id].pressures[timeIndex]
            ])
        );
        const controllingState = calculateCurrentControllingCompartment({
            tissuePressures: currentTissuePressures,
            currentAmbient,
            gfLow,
            gfHigh,
            pAnchor,
            surfacePressure,
            pressurePerMeter: results.pressurePerMeter
        });
        this._updateControllingCompartmentIndicator(controllingState);
        
        // For each visible compartment
        COMPARTMENTS.forEach(comp => {
            if (!this.visibleCompartments.has(comp.id)) return;
            
            // M-value line
            if (this.options.showMValueLines) {
                const mValueData = [];
                for (let p = 0; p <= maxPressure; p += 0.5) {
                    mValueData.push({ x: p, y: getMValue(p, comp.aN2, comp.bN2) });
                }
                
                datasets.push({
                    label: fmt(translate('chart.mvalue.mValueTC', 'M-value TC{0}'), comp.id),
                    data: mValueData,
                    borderColor: comp.color,
                    borderWidth: 2.25,
                    pointRadius: 0,
                    fill: false,
                    showLine: true,
                    borderDash: [4, 4],
                    order: 50
                });
            }
            
            // GF lines (only if GF < 100%)
            if (this.options.showGFLines && (gfLow < 1 || gfHigh < 1)) {
                // GF Low line
                const gfLowData = [];
                for (let p = 0; p <= maxPressure; p += 0.5) {
                    gfLowData.push({ x: p, y: getAdjustedMValue(p, comp.aN2, comp.bN2, gfLow) });
                }
                datasets.push({
                    label: fmt(translate('chart.mvalue.gfLowTC', 'GF Low ({0}%) TC{1}'), Math.round(gfLow * 100), comp.id),
                    data: gfLowData,
                    borderColor: comp.color + 'B0',
                    borderWidth: 1.5,
                    pointRadius: 0,
                    fill: false,
                    showLine: true,
                    borderDash: [8, 4],
                    order: 51
                });
                
                // GF High line
                const gfHighData = [];
                for (let p = 0; p <= maxPressure; p += 0.5) {
                    gfHighData.push({ x: p, y: getAdjustedMValue(p, comp.aN2, comp.bN2, gfHigh) });
                }
                datasets.push({
                    label: fmt(translate('chart.mvalue.gfHighTC', 'GF High ({0}%) TC{1}'), Math.round(gfHigh * 100), comp.id),
                    data: gfHighData,
                    borderColor: comp.color + '60',
                    borderWidth: 1.5,
                    pointRadius: 0,
                    fill: false,
                    showLine: true,
                    borderDash: [4, 2],
                    order: 52
                });
                
                // GF Corridor curve - the ACTUAL critical limit during ascent
                // This is a CURVE (not a straight line) because M_adj = P + gf(P) × (M₀(P) - P)
                // where both gf(P) and (M₀(P) - P) are linear in P, making their product quadratic
                // Sample multiple points to draw the actual curved limit
                if (pAnchor > surfacePressure) {
                    const corridorData = [];
                    const numPoints = 20;
                    for (let i = 0; i <= numPoints; i++) {
                        const p = pAnchor - (pAnchor - surfacePressure) * (i / numPoints);
                        const gf = interpolateGF(p, pAnchor, gfLow, gfHigh, surfacePressure);
                        const mAdj = getAdjustedMValue(p, comp.aN2, comp.bN2, gf);
                        corridorData.push({ x: p, y: mAdj });
                    }

                    datasets.push({
                        label: fmt(translate('chart.mvalue.gfCorridorTC', 'GF Corridor TC{0}'), comp.id),
                        data: corridorData,
                        borderColor: comp.color,
                        borderWidth: 3,
                        pointRadius: 0,
                        fill: false,
                        showLine: true,
                        order: 45
                    });
                }
            }
            
            // Trail
            if (this.options.showTrail) {
                const trailData = [];
                for (let i = 0; i <= timeIndex; i++) {
                    trailData.push({
                        x: results.ambientPressures[i],
                        y: results.compartments[comp.id].pressures[i]
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
            
            // Current tissue point — ring uses --surface so it reads in
            // either theme; subtle inner glow via shadowBlur lifts the
            // point off the trail without adding visual noise.
            const currentTissue = results.compartments[comp.id].pressures[timeIndex];
            datasets.push({
                label: fmt(translate('chart.mvalue.tcLabel', 'TC{0} ({1}\u00a0min)'), comp.id, fmtNum(comp.halfTime)),
                data: [{ x: currentAmbient, y: currentTissue }],
                mvalueCompartmentId: comp.id,
                mvalueCurrentPoint: true,
                backgroundColor: comp.color,
                borderColor: theme().colors.surface,
                borderWidth: 2,
                pointRadius: 8,
                pointHoverRadius: 10,
                hoverBorderWidth: 2.5,
                pointHoverBackgroundColor: comp.color,
                // Chart.js respects element.point.shadowBlur on newer versions;
                // we set it through the dataset for compatibility.
                shadowOffsetX: 0,
                shadowOffsetY: 0,
                shadowBlur: 8,
                shadowColor: comp.color + '55',
                showLine: false,
                order: 1
            });
        });

        const config = {
            type: 'scatter',
            data: { datasets },
            plugins: [
                {
                    id: 'mvalue-intersection-ruler',
                    afterDatasetsDraw: (chart) => this._drawRuler(chart)
                },
                {
                    id: 'mvalue-anchor-help',
                    afterDraw: (chart) => this._positionAnchorHelpIcon(chart)
                }
            ],
            options: {
                responsive: true,
                maintainAspectRatio: false,
                // Only animate the first build. Every time-scrub / compartment toggle
                // rebuilds the chart (destroy + new Chart below); a 50 ms entrance
                // animation on each of those re-renders makes the chart re-draw from
                // scratch every step, which reads as "jumping" while moving through time.
                // `this.chart` is the prior instance here (config is built before the
                // destroy below) on a re-render, and null on the first render.
                animation: this.chart ? false : { duration: 50 },
                plugins: {
                    legend: {
                        display: true,
                        position: 'top',
                        labels: {
                            filter: (item, chartData) =>
                                this._isLegendItemVisible(item, chartData)
                        }
                    },
                    tooltip: {
                        enabled: resolveChartTooltipEnabled(this.options.interactive, this.canvas),
                        callbacks: {
                            label: (context) => {
                                const label = context.dataset.label || '';
                                return fmt(
                                    translate('chart.mvalue.tooltipLabel', '{0}: ambient pressure {1}\u00a0bar, tissue pressure {2}\u00a0bar'),
                                    label, fmtNum(context.parsed.x, 2), fmtNum(context.parsed.y, 2)
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
                        title: { display: true, text: translate('chart.axes.tissueN2PressureBar', 'Tissue N₂ Pressure (bar)') },
                        min: 0,
                        max: maxPressure
                    }
                }
            }
        };
        
        // Save zoom state before destroying (only if user has zoomed)
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
        
        // Restore zoom state if user had zoomed
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
        this._stopPlayback();
        const maxIndex = this.calculationResults.timePoints.length - 1;
        this.currentTimeIndex = Math.max(0, Math.min(maxIndex, index));
        this._applyTimeIndexChange(false);
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
            console.error('MValueChart: Invalid dive setup', validation.errors);
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
 * Create an MValueChart instance
 * @param {HTMLElement|string} container - Container element or selector
 * @param {Object} config - Configuration object
 * @returns {MValueChart}
 */
export function createMValueChart(container, config) {
    const element = typeof container === 'string' 
        ? document.querySelector(container) 
        : container;
    
    if (!element) {
        throw new Error('MValueChart: Container element not found');
    }
    
    return new MValueChart(element, config);
}
