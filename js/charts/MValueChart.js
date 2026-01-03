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
import {
    calculateTissueLoading,
    getMValue,
    getAdjustedMValue,
    getFirstStopDepth,
    SURFACE_PRESSURE
} from '../decoModel.js';
import {
    DEFAULT_ENVIRONMENT,
    mergeOptions,
    validateDiveSetup,
    normalizeDiveSetup
} from './chartTypes.js';

/**
 * Default options for MValueChart
 */
const DEFAULT_MVALUE_OPTIONS = {
    compartments: [1, 2, 3, 4, 5, 6, 7, 8],
    showMValueLines: true,
    showGFLines: true,
    showAmbientLine: true,
    showSurfaceLine: true,
    showTrail: true,
    interactive: true,
    fullscreenButton: true,
    compartmentSelector: true,
    playbackSpeed: 100,  // ms per frame
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
        const wrapper = document.createElement('div');
        wrapper.className = 'mvc-wrapper';
        wrapper.style.cssText = 'display: flex; flex-direction: column; width: 100%; height: 100%; overflow: hidden;';
        
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
            wrapper.appendChild(this.controlsContainer);
        }
        
        // Timeline controls
        this.timelineContainer = document.createElement('div');
        this.timelineContainer.className = 'mvc-timeline';
        this.timelineContainer.style.cssText = `
            display: flex; align-items: center; gap: 8px; padding: 8px;
            background: #f8f9fa; border-radius: 4px; margin-bottom: 8px;
        `;
        this._buildTimelineControls();
        wrapper.appendChild(this.timelineContainer);
        
        // Chart container - fills remaining height
        this.chartContainer = document.createElement('div');
        this.chartContainer.className = 'mvc-chart-container';
        // Use CSS class for base styles, minimal inline styles for flex behavior
        this.chartContainer.style.flex = '1';
        this.chartContainer.style.minHeight = '0';
        
        // Canvas - no inline styles, let CSS handle it
        this.canvas = document.createElement('canvas');
        this.chartContainer.appendChild(this.canvas);
        
        // Fullscreen button
        if (this.options.fullscreenButton) {
            this.fullscreenBtn = document.createElement('button');
            this.fullscreenBtn.innerHTML = '⛶';
            this.fullscreenBtn.title = 'Toggle Fullscreen';
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
            this.exitFullscreenBtn.title = 'Exit Fullscreen (Esc)';
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
        this.resetZoomBtn.className = 'mvc-reset-zoom-btn';
        this.resetZoomBtn.innerHTML = '↺';
        this.resetZoomBtn.title = 'Reset Zoom (double-click chart)';
        this.resetZoomBtn.style.cssText = `
            position: absolute; top: 8px; right: ${this.options.fullscreenButton ? '44px' : '8px'}; z-index: 10;
            padding: 4px 8px; background: rgba(255,255,255,0.9);
            border: 1px solid #ccc; border-radius: 4px; cursor: pointer;
            font-size: 14px; display: none;
        `;
        this.resetZoomBtn.addEventListener('click', () => this.resetZoom());
        this.chartContainer.appendChild(this.resetZoomBtn);
        
        wrapper.appendChild(this.chartContainer);
        this.container.appendChild(wrapper);
        
        // Set up ResizeObserver to automatically resize chart when container changes
        this._resizeObserver = new ResizeObserver(() => {
            // Debounce resize calls
            if (this._resizeTimeout) {
                clearTimeout(this._resizeTimeout);
            }
            this._resizeTimeout = setTimeout(() => {
                // Don't resize during fullscreen (we handle that separately)
                if (!this.chartContainer.classList.contains('mvc-fullscreen')) {
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
            { text: 'All', action: () => this._selectAllCompartments() },
            { text: 'None', action: () => this._selectNoCompartments() },
            { text: 'Fast', action: () => this._selectFastCompartments() },
            { text: 'Slow', action: () => this._selectSlowCompartments() }
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
            checkbox.addEventListener('change', () => {
                if (checkbox.checked) {
                    this.visibleCompartments.add(comp.id);
                } else {
                    this.visibleCompartments.delete(comp.id);
                }
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
    }
    
    /**
     * Build timeline playback controls
     * @private
     */
    _buildTimelineControls() {
        // Rewind button
        const rewindBtn = this._createButton('⏮', 'Jump to start (Home)', () => this._jumpToStart());
        
        // Step back button
        const stepBackBtn = this._createButton('◀', 'Step back (←)', () => this._stepTime(-1));
        
        // Play/Pause button
        this.playBtn = this._createButton('▶️', 'Play/Pause (Space)', () => this._togglePlayback());
        
        // Step forward button
        const stepFwdBtn = this._createButton('▶', 'Step forward (→)', () => this._stepTime(1));
        
        // Fast forward button
        const ffwdBtn = this._createButton('⏭', 'Jump to end (End)', () => this._jumpToEnd());
        
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
        this.timeDisplay.textContent = '0.0 min @ 0m';
        
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
                !this.chartContainer.classList.contains('mvc-fullscreen')) {
                return;
            }
            
            // Don't handle if typing in an input
            if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT') return;
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
                    
                case 'Escape':
                    if (this.chartContainer.classList.contains('mvc-fullscreen')) {
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
        this.timeDisplay.textContent = `${time.toFixed(1)} min @ ${depth.toFixed(1)}m`;
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
        const isFullscreen = this.chartContainer.classList.toggle('mvc-fullscreen');
        
        if (isFullscreen) {
            document.body.style.overflow = 'hidden';
            if (this.fullscreenBtn) this.fullscreenBtn.style.display = 'none';
            if (this.exitFullscreenBtn) this.exitFullscreenBtn.style.display = 'block';
        } else {
            document.body.style.overflow = '';
            if (this.fullscreenBtn) this.fullscreenBtn.style.display = '';
            if (this.exitFullscreenBtn) this.exitFullscreenBtn.style.display = '';
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
        
        this.calculationResults = calculateTissueLoading(waypoints, surfaceInterval, { gases });
        this._updateTimeDisplay();
    }
    
    _render() {
        if (!this.calculationResults) return;
        
        const results = this.calculationResults;
        const gfLow = (this.diveSetup.gfLow || 100) / 100;
        const gfHigh = (this.diveSetup.gfHigh || 100) / 100;
        const timeIndex = this.currentTimeIndex;
        
        // Get current ambient pressure
        const currentAmbient = results.ambientPressures[timeIndex];
        
        // Determine chart bounds
        const maxAmbient = Math.max(...results.ambientPressures);
        const allPressures = Object.values(results.compartments).flatMap(c => c.pressures);
        const maxTissue = Math.max(...allPressures);
        const maxPressure = Math.max(maxAmbient, maxTissue, 5) * 1.1;
        
        const datasets = [];
        
        // Ambient line (y = x)
        if (this.options.showAmbientLine) {
            datasets.push({
                label: 'Ambient Line (y = x)',
                data: [{ x: 0, y: 0 }, { x: maxPressure, y: maxPressure }],
                borderColor: this.options.colors.ambient,
                borderWidth: 2,
                pointRadius: 0,
                fill: false,
                showLine: true,
                order: 100
            });
        }
        
        // Surface line (x = 1 bar)
        if (this.options.showSurfaceLine) {
            datasets.push({
                label: 'Surface (1 bar)',
                data: [{ x: SURFACE_PRESSURE, y: 0 }, { x: SURFACE_PRESSURE, y: maxPressure }],
                borderColor: this.options.colors.surface,
                borderWidth: 1,
                borderDash: [5, 5],
                pointRadius: 0,
                fill: false,
                showLine: true,
                order: 99
            });
        }
        
        // Calculate first stop depth for GF corridor line
        // GF Low applies at first stop, GF High at surface, linear interpolation between
        const hasGF = gfLow < 1 || gfHigh < 1;
        let firstStopAmbient = SURFACE_PRESSURE;
        let maxDepthAmbient = maxAmbient;  // Starting point of ascent (max depth)
        
        if (hasGF && results.depthPoints) {
            // Find the maximum depth (start of ascent)
            const maxDepth = Math.max(...results.depthPoints);
            
            // Find the last point at max depth (start of ascent) and get tissue pressures there
            let ascentStartIndex = 0;
            for (let i = 0; i < results.depthPoints.length; i++) {
                if (Math.abs(results.depthPoints[i] - maxDepth) < 0.5) {
                    ascentStartIndex = i;
                }
            }
            
            // Store the ambient pressure at max depth
            maxDepthAmbient = results.ambientPressures[ascentStartIndex];
            
            // Get tissue pressures at ascent start
            const tissuePressures = {};
            for (const compId of Object.keys(results.compartments)) {
                tissuePressures[compId] = results.compartments[compId].pressures[ascentStartIndex];
            }
            
            // Calculate first stop from tissue loading at ascent start
            const { ambient } = getFirstStopDepth(tissuePressures, gfLow);
            firstStopAmbient = ambient;
            
            // Draw vertical line at first stop depth
            datasets.push({
                label: 'First Stop',
                data: [
                    { x: firstStopAmbient, y: 0 },
                    { x: firstStopAmbient, y: maxPressure }
                ],
                borderColor: 'rgba(243, 156, 18, 0.6)',  // Orange
                borderWidth: 2,
                borderDash: [4, 4],
                pointRadius: 0,
                fill: false,
                showLine: true,
                order: 98
            });
        }
        
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
                    label: `M-value TC${comp.id}`,
                    data: mValueData,
                    borderColor: comp.color,
                    borderWidth: 2,
                    pointRadius: 0,
                    fill: false,
                    showLine: true,
                    borderDash: [3, 3],
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
                    label: `GF Low (${Math.round(gfLow * 100)}%) TC${comp.id}`,
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
                    label: `GF High (${Math.round(gfHigh * 100)}%) TC${comp.id}`,
                    data: gfHighData,
                    borderColor: comp.color + '60',
                    borderWidth: 1.5,
                    pointRadius: 0,
                    fill: false,
                    showLine: true,
                    borderDash: [4, 2],
                    order: 52
                });
                
                // GF Corridor line - the ACTUAL critical limit during ascent
                // Goes from (maxDepthAmbient, M_gfLow) to (surfacePressure, M_gfHigh)
                // This shows the limit from when you leave bottom to when you reach surface
                const mAtMaxDepthGfLow = getAdjustedMValue(maxDepthAmbient, comp.aN2, comp.bN2, gfLow);
                const mAtSurfaceGfHigh = getAdjustedMValue(SURFACE_PRESSURE, comp.aN2, comp.bN2, gfHigh);
                
                datasets.push({
                    label: `GF Corridor TC${comp.id}`,
                    data: [
                        { x: maxDepthAmbient, y: mAtMaxDepthGfLow },
                        { x: SURFACE_PRESSURE, y: mAtSurfaceGfHigh }
                    ],
                    borderColor: comp.color,
                    borderWidth: 3,
                    pointRadius: 4,
                    pointBackgroundColor: comp.color,
                    fill: false,
                    showLine: true,
                    order: 45  // Draw on top of M-value lines
                });
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
                    label: `Trail TC${comp.id}`,
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
            datasets.push({
                label: `TC${comp.id} (${comp.halfTime}min)`,
                data: [{ x: currentAmbient, y: currentTissue }],
                backgroundColor: comp.color,
                borderColor: '#fff',
                borderWidth: 2,
                pointRadius: 8,
                showLine: false,
                order: 1
            });
        });
        
        const config = {
            type: 'scatter',
            data: { datasets },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                animation: { duration: 50 },
                plugins: {
                    legend: {
                        display: true,
                        position: 'top',
                        labels: {
                            filter: (item) => {
                                // Only show tissue point labels
                                return item.text.startsWith('TC') && 
                                       !item.text.startsWith('Trail') &&
                                       item.text.includes('min');
                            }
                        }
                    },
                    tooltip: {
                        enabled: this.options.interactive,
                        callbacks: {
                            label: (context) => {
                                const label = context.dataset.label || '';
                                return `${label}: P_amb=${context.parsed.x.toFixed(2)}, P_tissue=${context.parsed.y.toFixed(2)} bar`;
                            }
                        }
                    },
                    zoom: {
                        pan: {
                            enabled: true,
                            mode: 'xy',
                            modifierKey: null
                        },
                        zoom: {
                            wheel: {
                                enabled: true,
                                speed: 0.03  // Reduced sensitivity (default is 0.1)
                            },
                            pinch: {
                                enabled: true
                            },
                            mode: 'xy',
                            onZoomComplete: () => {
                                // Show reset button when zoomed
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
                        title: { display: true, text: 'Ambient Pressure (bar)' },
                        min: 0,
                        max: maxPressure
                    },
                    y: {
                        type: 'linear',
                        title: { display: true, text: 'Tissue N₂ Pressure (bar)' },
                        min: 0,
                        max: maxPressure
                    }
                }
            }
        };
        
        if (this.chart) {
            this.chart.destroy();
        }
        this.chart = new Chart(this.canvas, config);
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
