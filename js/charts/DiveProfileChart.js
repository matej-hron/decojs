/**
 * Dive Profile Chart Component
 * 
 * A reusable, embeddable chart component that displays dive profiles.
 * Accepts a DiveSetup configuration and handles all calculations internally.
 * 
 * Features:
 * - Depth vs time profile
 * - Optional pressure overlays (ambient, partial pressures)
 * - Gas switch markers
 * - Deco stop annotations
 * - NDL/ceiling lines
 * - Built-in fullscreen toggle
 * 
 * Usage:
 *   import { DiveProfileChart } from './charts/DiveProfileChart.js';
 *   
 *   const chart = new DiveProfileChart(containerElement, {
 *     diveSetup: { gases: [...], dives: [{ waypoints: [...] }], gfLow: 70, gfHigh: 85 },
 *     options: { mode: 'depth', showGasSwitches: true }
 *   });
 *   
 *   // Update with new data
 *   chart.update(newDiveSetup);
 *   
 *   // Destroy when done
 *   chart.destroy();
 */

import { COMPARTMENTS } from '../tissueCompartments.js';
import {
    calculateTissueLoading,
    calculateCeilingTimeSeries,
    calculateNDL,
    getAmbientPressure,
    getAlveolarN2Pressure,
    SURFACE_PRESSURE
} from '../decoModel.js';
import {
    DEFAULT_DIVE_PROFILE_OPTIONS,
    DEFAULT_ENVIRONMENT,
    mergeOptions,
    validateDiveSetup,
    normalizeDiveSetup
} from './chartTypes.js';

/**
 * DiveProfileChart - Embeddable dive profile visualization
 */
export class DiveProfileChart {
    /**
     * Create a new DiveProfileChart
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
        this.tissueControlsContainer = null;
        
        // Visible compartments for tissue loading mode - default to fastest only
        this.visibleCompartments = new Set([1]);
        
        // Merge options with defaults
        this.options = mergeOptions(DEFAULT_DIVE_PROFILE_OPTIONS, config.options);
        this.environment = mergeOptions(DEFAULT_ENVIRONMENT, config.environment);
        
        // Validate and normalize dive setup
        if (config.diveSetup) {
            const validation = validateDiveSetup(config.diveSetup);
            if (!validation.valid) {
                console.error('DiveProfileChart: Invalid dive setup', validation.errors);
            }
            this.diveSetup = normalizeDiveSetup(config.diveSetup);
        } else {
            this.diveSetup = null;
        }
        
        // Build DOM structure
        this._buildDOM();
        
        // Render chart if we have data
        if (this.diveSetup) {
            this._render();
        }
    }
    
    /**
     * Build the chart's DOM structure
     * @private
     */
    _buildDOM() {
        // Clear container
        this.container.innerHTML = '';
        this.container.tabIndex = 0; // Make focusable for keyboard events
        this.container.style.outline = 'none';
        
        // Create tissue controls container (shown only in tissue mode)
        this.tissueControlsContainer = document.createElement('div');
        this.tissueControlsContainer.className = 'dpc-tissue-controls';
        this.tissueControlsContainer.style.cssText = `
            display: none; padding: 8px; background: #f8f9fa;
            border-radius: 4px; margin-bottom: 8px;
        `;
        this._buildTissueControls();
        this.container.appendChild(this.tissueControlsContainer);
        
        // Create chart container with fullscreen support
        this.chartContainer = document.createElement('div');
        this.chartContainer.className = 'dpc-chart-container';
        // No inline styles - let CSS handle sizing
        
        // Create canvas
        this.canvas = document.createElement('canvas');
        this.chartContainer.appendChild(this.canvas);
        
        // Create fullscreen button (if enabled)
        if (this.options.fullscreenButton) {
            this.fullscreenBtn = document.createElement('button');
            this.fullscreenBtn.className = 'dpc-fullscreen-btn';
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
            
            // Exit fullscreen button (visible only in fullscreen)
            this.exitFullscreenBtn = document.createElement('button');
            this.exitFullscreenBtn.className = 'dpc-exit-fullscreen-btn';
            this.exitFullscreenBtn.innerHTML = '✕';
            this.exitFullscreenBtn.title = 'Exit Fullscreen';
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
        this.resetZoomBtn.className = 'dpc-reset-zoom-btn';
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
        
        this.container.appendChild(this.chartContainer);
        
        // Handle keyboard events
        this._keyHandler = (e) => {
            // Only handle if container is focused or we're in fullscreen
            if (!this.container.contains(document.activeElement) && 
                !this.chartContainer.classList.contains('dpc-fullscreen')) {
                return;
            }
            
            // Don't handle if typing in an input
            if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT') return;
            
            // Only handle arrow keys in tissue mode
            if (!this.options.showTissueLoading) return;
            
            switch (e.key) {
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
                    if (this.chartContainer.classList.contains('dpc-fullscreen')) {
                        this._toggleFullscreen();
                    }
                    break;
            }
        };
        document.addEventListener('keydown', this._keyHandler);
        
        // Set up ResizeObserver to automatically resize chart when container changes
        this._resizeObserver = new ResizeObserver((entries) => {
            // Debounce resize calls
            if (this._resizeTimeout) {
                clearTimeout(this._resizeTimeout);
            }
            this._resizeTimeout = setTimeout(() => {
                // Don't resize during fullscreen (we handle that separately)
                if (!this.chartContainer.classList.contains('dpc-fullscreen')) {
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
     * Toggle fullscreen mode
     * @private
     */
    _toggleFullscreen() {
        const isFullscreen = this.chartContainer.classList.toggle('dpc-fullscreen');
        
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
    // Tissue Compartment Controls
    // ============================================================================
    
    /**
     * Build tissue compartment selector controls
     * @private
     */
    _buildTissueControls() {
        if (!this.tissueControlsContainer) return;
        
        this.tissueControlsContainer.innerHTML = '';
        
        // Quick selection buttons
        const btnGroup = document.createElement('div');
        btnGroup.style.cssText = 'display: flex; gap: 4px; margin-right: 12px; flex-wrap: wrap; align-items: center;';
        
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
        
        // Add keyboard hint
        const hint = document.createElement('span');
        hint.textContent = '↑↓ move, Shift+↑↓ expand/shrink';
        hint.style.cssText = 'font-size: 11px; color: #6c757d; margin-left: 8px;';
        btnGroup.appendChild(hint);
        
        this.tissueControlsContainer.appendChild(btnGroup);
        
        // Compartment checkboxes
        const checkboxContainer = document.createElement('div');
        checkboxContainer.style.cssText = 'display: flex; flex-wrap: wrap; gap: 4px; margin-top: 8px;';
        
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
            checkboxContainer.appendChild(label);
        });
        
        this.tissueControlsContainer.appendChild(checkboxContainer);
    }
    
    /**
     * Update tissue controls visibility based on current mode
     * @private
     */
    _updateTissueControlsVisibility() {
        if (this.tissueControlsContainer) {
            this.tissueControlsContainer.style.display = 
                this.options.showTissueLoading ? 'block' : 'none';
        }
    }
    
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
        if (!this.tissueControlsContainer) return;
        this.tissueControlsContainer.querySelectorAll('input[type="checkbox"]').forEach(cb => {
            const id = parseInt(cb.dataset.compartmentId);
            if (!isNaN(id)) {
                cb.checked = this.visibleCompartments.has(id);
            }
        });
    }
    
    /**
     * Add profile labels (descent, bottom time, max depth, ascent, stops)
     * @private
     */
    _addProfileLabels(annotations, waypoints, results) {
        if (!waypoints || waypoints.length < 2) return;
        
        const maxDepth = Math.max(...waypoints.map(wp => wp.depth));
        const totalTime = Math.max(...waypoints.map(wp => wp.time));
        
        // Find descent end (first waypoint at max depth)
        let descentEnd = null;
        for (const wp of waypoints) {
            if (wp.depth === maxDepth) {
                descentEnd = wp;
                break;
            }
        }
        
        // Find bottom end (last waypoint at max depth)
        let bottomEnd = null;
        for (let i = waypoints.length - 1; i >= 0; i--) {
            if (waypoints[i].depth === maxDepth) {
                bottomEnd = waypoints[i];
                break;
            }
        }
        
        // Find stops (horizontal segments not at max depth and not at surface)
        const stops = [];
        for (let i = 0; i < waypoints.length - 1; i++) {
            const curr = waypoints[i];
            const next = waypoints[i + 1];
            
            // Detect horizontal segments at non-surface, non-max depths
            if (curr.depth > 0 && curr.depth < maxDepth && 
                Math.abs(next.depth - curr.depth) < 0.1 && next.time > curr.time) {
                // Check if this extends an existing stop at the same depth
                const existing = stops.find(s => s.depth === curr.depth && s.end.time === curr.time);
                if (existing) {
                    existing.end = next;
                } else {
                    stops.push({ start: curr, end: next, depth: curr.depth });
                }
            }
        }
        
        // Descent label - position at middle of descent phase
        if (descentEnd && descentEnd.time > 0) {
            annotations.descentLabel = {
                type: 'label',
                xValue: descentEnd.time / 2,
                yValue: -3,
                content: ['DESCENT ⬇'],
                backgroundColor: 'rgba(46, 204, 113, 0.9)',
                color: 'white',
                font: { size: 10, weight: 'bold' },
                padding: { top: 3, bottom: 3, left: 6, right: 6 }
            };
        }
        
        // Bottom time bracket
        if (bottomEnd) {
            annotations.bottomTimeBracket = {
                type: 'line',
                xMin: 0,
                xMax: bottomEnd.time,
                yMin: -4,
                yMax: -4,
                borderColor: 'rgba(241, 196, 15, 0.9)',
                borderWidth: 3,
                label: {
                    display: true,
                    content: `BOTTOM TIME: ${bottomEnd.time} min`,
                    position: 'center',
                    backgroundColor: 'rgba(241, 196, 15, 0.95)',
                    color: '#333',
                    font: { size: 10, weight: 'bold' },
                    padding: { top: 3, bottom: 3, left: 6, right: 6 },
                    yAdjust: -12
                }
            };
            annotations.bottomTimeCapLeft = {
                type: 'line',
                xMin: 0, xMax: 0, yMin: -6, yMax: -2,
                borderColor: 'rgba(241, 196, 15, 0.9)',
                borderWidth: 3
            };
            annotations.bottomTimeCapRight = {
                type: 'line',
                xMin: bottomEnd.time, xMax: bottomEnd.time, yMin: -6, yMax: -2,
                borderColor: 'rgba(241, 196, 15, 0.9)',
                borderWidth: 3
            };
        }
        
        // Max depth line
        annotations.maxDepthLine = {
            type: 'line',
            yMin: maxDepth,
            yMax: maxDepth,
            borderColor: 'rgba(231, 76, 60, 0.6)',
            borderWidth: 2,
            borderDash: [6, 4],
            label: {
                display: true,
                content: `MAX: ${maxDepth}m`,
                position: 'end',
                backgroundColor: 'rgba(231, 76, 60, 0.9)',
                color: 'white',
                font: { size: 10, weight: 'bold' },
                padding: { top: 3, bottom: 3, left: 6, right: 6 }
            }
        };
        
        // Ascent label
        if (bottomEnd && bottomEnd.time < totalTime) {
            annotations.ascentLabel = {
                type: 'label',
                xValue: totalTime - 1,
                yValue: -5,
                content: ['⬆ ASCENT'],
                backgroundColor: 'rgba(155, 89, 182, 0.9)',
                color: 'white',
                font: { size: 10, weight: 'bold' },
                padding: { top: 3, bottom: 3, left: 6, right: 6 }
            };
        }
    }
    
    /**
     * Add stop labels (deco/safety stops) - always shown regardless of showLabels option
     * @private
     */
    _addStopLabels(annotations, waypoints) {
        if (!waypoints || waypoints.length < 2) return;
        
        const maxDepth = Math.max(...waypoints.map(wp => wp.depth));
        
        // Find stops (horizontal segments not at max depth and not at surface)
        const stops = [];
        for (let i = 0; i < waypoints.length - 1; i++) {
            const curr = waypoints[i];
            const next = waypoints[i + 1];
            
            // Detect horizontal segments at non-surface, non-max depths
            if (curr.depth > 0 && curr.depth < maxDepth && 
                Math.abs(next.depth - curr.depth) < 0.1 && next.time > curr.time) {
                // Check if this extends an existing stop at the same depth
                const existing = stops.find(s => s.depth === curr.depth && s.end.time === curr.time);
                if (existing) {
                    existing.end = next;
                } else {
                    stops.push({ start: curr, end: next, depth: curr.depth });
                }
            }
        }
        
        // Stop annotations - just labels, no boxes (boxes can obscure the profile)
        const isMultiStageDeco = stops.length > 1;
        stops.forEach((stop, i) => {
            const isDeepStop = stop.depth > 5;
            const stopDuration = Math.round(stop.end.time - stop.start.time);
            let label;
            if (isDeepStop || isMultiStageDeco) {
                label = 'DECO';
            } else {
                label = 'SAFETY';
            }
            const color = isDeepStop ? 'rgba(230, 126, 34, 0.9)' : 'rgba(52, 152, 219, 0.9)';
            
            // Label positioned to the right of the stop with depth and time
            annotations[`stopLabel${i}`] = {
                type: 'label',
                xValue: stop.end.time + 1,
                yValue: stop.depth,
                yAdjust: 20,
                content: [`${label} ${stop.depth}m · ${stopDuration}min`],
                backgroundColor: color,
                color: 'white',
                font: { size: 9, weight: 'bold' },
                padding: { top: 2, bottom: 2, left: 4, right: 4 }
            };
        });
    }
    
    /**
     * Calculate gas consumption over the dive profile
     * @private
     * @param {Object} results - Tissue loading results with timePoints and depthPoints
     * @param {Object[]} gases - Gas configurations
     * @param {number} sacRate - Surface Air Consumption rate in L/min
     * @param {number} reservePressure - Reserve pressure in bar
     * @returns {Object} Gas consumption data per cylinder
     */
    _calculateGasConsumption(results, gases, sacRate, reservePressure) {
        const gasData = {};
        
        // Initialize each gas cylinder
        gases.forEach(gas => {
            const cylinderVolume = gas.cylinderVolume || 12; // Default 12L cylinder
            const startPressure = gas.startPressure || 200; // Default 200 bar
            const totalGas = cylinderVolume * startPressure; // Total gas in liters
            const reserveGas = cylinderVolume * reservePressure;
            
            gasData[gas.id] = {
                name: gas.name,
                cylinderVolume,
                startPressure,
                totalGas,
                reserveGas,
                reservePressure,
                pressures: [],      // Pressure at each time point
                consumption: [],    // Cumulative consumption at each time point
                isActive: false     // Whether this gas has been used
            };
        });
        
        // Track current gas (first gas by default, or use gas switches from results)
        let currentGasId = gases[0]?.id;
        let cumulativeConsumption = {}; // Per-gas cumulative consumption
        gases.forEach(gas => { cumulativeConsumption[gas.id] = 0; });
        
        // Build gas switch timeline from results
        const gasSwitchTimes = {};
        if (results.gasSwitches) {
            results.gasSwitches.forEach(sw => {
                gasSwitchTimes[sw.time] = sw.gasId;
            });
        }
        
        // Calculate consumption at each time point
        for (let i = 0; i < results.timePoints.length; i++) {
            const time = results.timePoints[i];
            const depth = results.depthPoints[i];
            
            // Check for gas switch
            if (gasSwitchTimes[time]) {
                currentGasId = gasSwitchTimes[time];
            }
            
            // Mark gas as active once used
            if (gasData[currentGasId]) {
                gasData[currentGasId].isActive = true;
            }
            
            // Calculate consumption for this time step
            if (i > 0) {
                const prevTime = results.timePoints[i - 1];
                const prevDepth = results.depthPoints[i - 1];
                const deltaTime = time - prevTime; // minutes
                
                // Average depth for this segment
                const avgDepth = (depth + prevDepth) / 2;
                const ambientPressure = 1 + avgDepth / 10; // bar
                
                // Gas consumed in this segment (liters at surface)
                const segmentConsumption = sacRate * ambientPressure * deltaTime;
                
                // Add to cumulative consumption for current gas
                if (gasData[currentGasId]) {
                    cumulativeConsumption[currentGasId] += segmentConsumption;
                }
            }
            
            // Record pressure for each gas at this time point
            gases.forEach(gas => {
                const data = gasData[gas.id];
                const consumed = cumulativeConsumption[gas.id];
                const remainingGas = data.totalGas - consumed;
                const remainingPressure = Math.max(0, remainingGas / data.cylinderVolume);
                
                data.consumption.push(consumed);
                data.pressures.push(remainingPressure);
            });
        }
        
        return gasData;
    }
    
    /**
     * Calculate all data needed for the chart
     * @private
     * @returns {Object} Calculated data
     */
    _calculateData() {
        if (!this.diveSetup || !this.diveSetup.dives || this.diveSetup.dives.length === 0) {
            return null;
        }
        
        // Get first dive's waypoints
        const waypoints = this.diveSetup.dives[0].waypoints;
        const gases = this.diveSetup.gases;
        const gfLow = (this.diveSetup.gfLow || 100) / 100;
        const gfHigh = (this.diveSetup.gfHigh || 100) / 100;
        const surfaceInterval = this.diveSetup.surfaceInterval || 0;
        
        // Calculate tissue loading
        const results = calculateTissueLoading(waypoints, surfaceInterval, { gases });
        
        // Calculate ceiling if needed
        let ceilingDepths = null;
        if (this.options.showCeiling) {
            ceilingDepths = calculateCeilingTimeSeries(results, gfLow, gfHigh);
        }
        
        // Calculate NDL if needed
        let ndlData = null;
        if (this.options.showNDL) {
            const maxDepth = Math.max(...waypoints.map(wp => wp.depth));
            const bottomGas = gases[0];
            ndlData = calculateNDL(maxDepth, bottomGas.n2, gfHigh);
        }
        
        // Calculate gas consumption if needed
        let gasConsumption = null;
        if (this.options.showGasConsumption) {
            const sacRate = this.diveSetup.sacRate || 20; // Default 20 L/min
            const reservePressure = this.diveSetup.reservePressure || 50;
            gasConsumption = this._calculateGasConsumption(results, gases, sacRate, reservePressure);
        }
        
        return {
            results,
            ceilingDepths,
            ndlData,
            gasConsumption,
            waypoints,
            gases
        };
    }
    
    /**
     * Render the chart
     * @private
     */
    _render() {
        // Update tissue controls visibility
        this._updateTissueControlsVisibility();
        
        const data = this._calculateData();
        if (!data) return;
        
        const { results, ceilingDepths, gasConsumption, waypoints, gases } = data;
        
        // Calculate axis bounds
        const maxDepth = Math.max(...waypoints.map(wp => wp.depth));
        const maxPressure = Math.max(...results.ambientPressures);
        
        // For tissue loading, also consider tissue pressures
        let maxTissuePressure = maxPressure;
        if (this.options.showTissueLoading) {
            Object.values(results.compartments).forEach(comp => {
                const compMax = Math.max(...comp.pressures);
                if (compMax > maxTissuePressure) {
                    maxTissuePressure = compMax;
                }
            });
        }
        
        // Prepare datasets
        const datasets = [];
        
        // Depth profile (primary)
        datasets.push({
            label: 'Depth (m)',
            data: results.timePoints.map((t, i) => ({
                x: t,
                y: results.depthPoints[i]
            })),
            borderColor: this.options.colors.depth,
            backgroundColor: this.options.colors.depth + '20',
            fill: true,
            yAxisID: 'yDepth',
            tension: 0,
            pointRadius: 0,
            borderWidth: 2,
            order: 10
        });
        
        // Tissue loading curves (if enabled)
        if (this.options.showTissueLoading) {
            COMPARTMENTS.forEach(comp => {
                if (!this.visibleCompartments.has(comp.id)) return;
                
                const pressureData = results.compartments[comp.id].pressures;
                datasets.push({
                    label: `TC${comp.id} (${comp.halfTime}min)`,
                    data: results.timePoints.map((t, i) => ({
                        x: t,
                        y: pressureData[i]
                    })),
                    borderColor: comp.color,
                    backgroundColor: 'transparent',
                    fill: false,
                    yAxisID: 'yPressure',
                    tension: 0.1,
                    pointRadius: 0,
                    borderWidth: 1.5,
                    order: 20
                });
            });
        }
        
        // Ceiling line (if enabled)
        if (this.options.showCeiling && ceilingDepths) {
            datasets.push({
                label: 'Ceiling (m)',
                data: results.timePoints.map((t, i) => ({
                    x: t,
                    y: ceilingDepths[i]
                })),
                borderColor: this.options.colors.ceiling,
                backgroundColor: this.options.colors.ceiling + '30',
                fill: true,
                yAxisID: 'yDepth',
                tension: 0.1,
                pointRadius: 0,
                borderWidth: 2,
                borderDash: [5, 3],
                order: 9
            });
        }
        
        // Ambient pressure (if enabled)
        if (this.options.showAmbientPressure) {
            datasets.push({
                label: 'Ambient Pressure (bar)',
                data: results.timePoints.map((t, i) => ({
                    x: t,
                    y: results.ambientPressures[i]
                })),
                borderColor: this.options.colors.ambient,
                borderDash: [10, 5],
                fill: false,
                yAxisID: 'yPressure',
                tension: 0,
                pointRadius: 0,
                borderWidth: 2,
                order: 5
            });
        }
        
        // Partial pressures (if enabled)
        if (this.options.showPartialPressures) {
            // ppO2
            datasets.push({
                label: 'ppO₂ (bar)',
                data: results.timePoints.map((t, i) => {
                    const n2 = results.n2Fractions[i];
                    const o2 = 1 - n2; // Simplified - assumes no helium
                    return {
                        x: t,
                        y: results.ambientPressures[i] * o2
                    };
                }),
                borderColor: this.options.colors.ppO2,
                fill: false,
                yAxisID: 'yPressure',
                tension: 0,
                pointRadius: 0,
                borderWidth: 2,
                order: 4
            });
            
            // ppN2
            datasets.push({
                label: 'ppN₂ (bar)',
                data: results.timePoints.map((t, i) => ({
                    x: t,
                    y: results.ambientPressures[i] * results.n2Fractions[i]
                })),
                borderColor: this.options.colors.ppN2,
                fill: false,
                yAxisID: 'yPressure',
                tension: 0,
                pointRadius: 0,
                borderWidth: 2,
                order: 3
            });
        }
        
        // Alveolar N2 (inspired nitrogen partial pressure) - shown automatically in tissue mode
        if (this.options.showTissueLoading) {
            datasets.push({
                label: 'Alveolar ppN₂ (bar)',
                data: results.timePoints.map((t, i) => ({
                    x: t,
                    y: getAlveolarN2Pressure(results.ambientPressures[i], results.n2Fractions[i])
                })),
                borderColor: this.options.colors.ppN2,
                borderDash: [5, 3],
                fill: false,
                yAxisID: 'yPressure',
                tension: 0,
                pointRadius: 0,
                borderWidth: 2,
                order: 3
            });
        }
        
        // Gas consumption (if enabled)
        if (this.options.showGasConsumption && gasConsumption) {
            const gasColors = ['#e74c3c', '#3498db', '#27ae60', '#9b59b6', '#f39c12'];
            let colorIndex = 0;
            
            Object.entries(gasConsumption).forEach(([gasId, gasData]) => {
                // Only show gases that are actually used
                if (!gasData.isActive) return;
                
                const color = gasColors[colorIndex % gasColors.length];
                colorIndex++;
                
                // Tank pressure line
                datasets.push({
                    label: `${gasData.name} (bar)`,
                    data: results.timePoints.map((t, i) => ({
                        x: t,
                        y: gasData.pressures[i]
                    })),
                    borderColor: color,
                    backgroundColor: color + '20',
                    fill: false,
                    yAxisID: 'yGas',
                    tension: 0,
                    pointRadius: 0,
                    borderWidth: 2.5,
                    order: 2
                });
            });
        }
        
        // Build scales
        const scales = {
            x: {
                type: 'linear',
                title: {
                    display: true,
                    text: 'Time (minutes)'
                },
                min: this.options.showLabels ? -2 : 0
            },
            yDepth: {
                type: 'linear',
                position: 'left',
                reverse: true,
                title: {
                    display: true,
                    text: 'Depth (m)'
                },
                min: this.options.showLabels ? -10 : 0,
                max: maxDepth + 5  // Add padding below max depth
            }
        };
        
        // Add pressure axis if needed
        if (this.options.showAmbientPressure || this.options.showPartialPressures || this.options.showTissueLoading) {
            scales.yPressure = {
                type: 'linear',
                position: 'right',
                title: {
                    display: true,
                    text: 'Pressure (bar)'
                },
                min: 0,
                max: Math.ceil(maxTissuePressure) + 1,  // Round up and add 1 bar padding
                grid: {
                    drawOnChartArea: false
                }
            };
        }
        
        // Add gas consumption axis if needed
        if (this.options.showGasConsumption && gasConsumption) {
            // Find max starting pressure across all gases
            const maxGasPressure = Math.max(...Object.values(gasConsumption).map(g => g.startPressure));
            const reservePressure = Object.values(gasConsumption)[0]?.reservePressure || 50;
            
            scales.yGas = {
                type: 'linear',
                position: 'right',
                title: {
                    display: true,
                    text: 'Tank Pressure (bar)'
                },
                min: 0,
                max: maxGasPressure + 10,
                grid: {
                    drawOnChartArea: false
                }
            };
        }
        
        // Build annotations
        const annotations = {};
        
        // Profile labels (descent, bottom time, max depth, ascent) - only in depth mode
        if (this.options.showLabels) {
            this._addProfileLabels(annotations, waypoints, results);
        }
        
        // Stop labels (deco/safety stops) - always shown
        this._addStopLabels(annotations, waypoints);
        
        // Reserve pressure line (if showing gas consumption)
        if (this.options.showGasConsumption && gasConsumption) {
            const reservePressure = Object.values(gasConsumption)[0]?.reservePressure || 50;
            annotations.reserveLine = {
                type: 'line',
                yMin: reservePressure,
                yMax: reservePressure,
                yScaleID: 'yGas',
                borderColor: 'rgba(231, 76, 60, 0.8)',
                borderWidth: 2,
                borderDash: [8, 4],
                label: {
                    display: true,
                    content: `RESERVE: ${reservePressure} bar`,
                    position: 'start',
                    backgroundColor: 'rgba(231, 76, 60, 0.9)',
                    color: 'white',
                    font: { size: 10, weight: 'bold' },
                    padding: { top: 3, bottom: 3, left: 6, right: 6 }
                }
            };
        }
        
        // Gas switch markers
        if (this.options.showGasSwitches && results.gasSwitches && results.gasSwitches.length > 0) {
            results.gasSwitches.forEach((sw, i) => {
                // Position label to the right of the switch, at same depth level
                const fromText = sw.fromGasName ? `${sw.fromGasName} → ${sw.gasName}` : `→ ${sw.gasName}`;
                annotations[`gasSwitch${i}`] = {
                    type: 'label',
                    xValue: sw.time + 1,
                    yValue: sw.depth,
                    yAdjust: 20,
                    content: [fromText],
                    backgroundColor: 'rgba(155, 89, 182, 0.95)',
                    color: 'white',
                    font: { size: 9, weight: 'bold' },
                    padding: { top: 3, bottom: 3, left: 6, right: 6 },
                    borderRadius: 4
                };
            });
        }
        
        // ppO2 limit lines (if showing partial pressures)
        if (this.options.showPartialPressures) {
            annotations.ppO2Max = {
                type: 'line',
                yMin: 1.6,
                yMax: 1.6,
                yScaleID: 'yPressure',
                borderColor: 'rgba(231, 76, 60, 0.5)',
                borderWidth: 1,
                borderDash: [3, 3],
                label: {
                    display: true,
                    content: 'ppO₂ max (1.6)',
                    position: 'end',
                    font: { size: 9 }
                }
            };
        }
        
        // Chart configuration
        const config = {
            type: 'line',
            data: { datasets },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                animation: {
                    duration: this.options.animationDuration
                },
                interaction: {
                    mode: 'index',
                    intersect: false
                },
                plugins: {
                    legend: {
                        display: true,
                        position: 'top'
                    },
                    tooltip: {
                        enabled: this.options.interactive,
                        callbacks: {
                            title: (items) => {
                                if (items.length > 0) {
                                    return `Time: ${items[0].parsed.x.toFixed(1)} min`;
                                }
                                return '';
                            },
                            label: (context) => {
                                const label = context.dataset.label || '';
                                const value = context.parsed.y;
                                if (label.includes('Depth') || label.includes('Ceiling')) {
                                    return `${label}: ${value.toFixed(1)} m`;
                                } else if (label.includes('Pressure') || label.includes('pp')) {
                                    return `${label}: ${value.toFixed(2)} bar`;
                                }
                                return `${label}: ${value.toFixed(2)}`;
                            }
                        }
                    },
                    annotation: {
                        annotations
                    },
                    zoom: {
                        pan: {
                            enabled: true,
                            mode: 'xy',
                            modifierKey: 'shift',
                            onPanComplete: () => {
                                if (this.resetZoomBtn) {
                                    this.resetZoomBtn.style.display = 'block';
                                }
                            }
                        },
                        zoom: {
                            wheel: {
                                enabled: true,
                                speed: 0.015
                            },
                            pinch: {
                                enabled: true
                            },
                            mode: 'xy',
                            onZoomComplete: () => {
                                if (this.resetZoomBtn) {
                                    this.resetZoomBtn.style.display = 'block';
                                }
                            }
                        }
                    }
                },
                scales
            }
        };
        
        // Destroy existing chart if any
        if (this.chart) {
            this.chart.destroy();
        }
        
        // Create new chart
        this.chart = new Chart(this.canvas, config);
    }
    
    /**
     * Update the chart with new dive setup
     * @param {Object} diveSetup - New dive setup configuration
     * @param {Object} [options] - Optional new chart options
     */
    update(diveSetup, options) {
        if (options) {
            this.options = mergeOptions(this.options, options);
        }
        
        const validation = validateDiveSetup(diveSetup);
        if (!validation.valid) {
            console.error('DiveProfileChart: Invalid dive setup', validation.errors);
            return;
        }
        
        this.diveSetup = normalizeDiveSetup(diveSetup);
        this._render();
    }
    
    /**
     * Update chart options without changing data
     * @param {Object} options - New chart options
     */
    setOptions(options) {
        this.options = mergeOptions(this.options, options);
        if (this.diveSetup) {
            this._render();
        }
    }
    
    /**
     * Get the current calculated results
     * @returns {Object|null} Calculation results or null if no data
     */
    getResults() {
        return this._calculateData();
    }
    
    /**
     * Destroy the chart and clean up resources
     */
    destroy() {
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
        
        if (this.chartContainer) {
            this.chartContainer.innerHTML = '';
        }
        
        this.container.innerHTML = '';
    }
}

/**
 * Create a DiveProfileChart instance (convenience function)
 * @param {HTMLElement|string} container - Container element or selector
 * @param {Object} config - Configuration object
 * @returns {DiveProfileChart} Chart instance
 */
export function createDiveProfileChart(container, config) {
    const element = typeof container === 'string' 
        ? document.querySelector(container) 
        : container;
    
    if (!element) {
        throw new Error('DiveProfileChart: Container element not found');
    }
    
    return new DiveProfileChart(element, config);
}
