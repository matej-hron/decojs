/**
 * Tissue Pressure Chart Component
 * 
 * A reusable, embeddable chart component that displays tissue nitrogen loading.
 * Accepts a DiveSetup configuration and handles all calculations internally.
 * 
 * Supports multiple display modes:
 * - 'loading': Time vs tissue N2 pressure (16 compartments)
 * - 'saturation': Time vs saturation percentage  
 * - 'mvalue': Pressure-pressure diagram with M-value lines
 * - 'ceiling': Show ceiling depths per compartment
 * 
 * Usage:
 *   import { TissuePressureChart } from './charts/TissuePressureChart.js';
 *   
 *   const chart = new TissuePressureChart(containerElement, {
 *     diveSetup: { gases: [...], dives: [{ waypoints: [...] }] },
 *     options: { mode: 'loading', compartments: [1, 2, 3, 4] }
 *   });
 *   
 *   // Animate through the dive
 *   chart.setTimeIndex(50);
 *   
 *   // Update with new data
 *   chart.update(newDiveSetup);
 */

import { COMPARTMENTS } from '../tissueCompartments.js';
import {
    calculateTissueLoading,
    calculateCeilingTimeSeries,
    getAmbientPressure,
    getMValue,
    getAdjustedMValue,
    SURFACE_PRESSURE
} from '../decoModel.js';
import {
    DEFAULT_TISSUE_PRESSURE_OPTIONS,
    DEFAULT_ENVIRONMENT,
    mergeOptions,
    validateDiveSetup,
    normalizeDiveSetup
} from './chartTypes.js';

/**
 * TissuePressureChart - Embeddable tissue saturation visualization
 */
export class TissuePressureChart {
    /**
     * Create a new TissuePressureChart
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
        
        // State
        this.calculationResults = null;
        this.currentTimeIndex = 0;
        this.visibleCompartments = new Set();
        
        // Merge options with defaults
        this.options = mergeOptions(DEFAULT_TISSUE_PRESSURE_OPTIONS, config.options);
        this.environment = mergeOptions(DEFAULT_ENVIRONMENT, config.environment);
        
        // Initialize visible compartments
        this.options.compartments.forEach(c => this.visibleCompartments.add(c));
        
        // Validate and normalize dive setup
        if (config.diveSetup) {
            const validation = validateDiveSetup(config.diveSetup);
            if (!validation.valid) {
                console.error('TissuePressureChart: Invalid dive setup', validation.errors);
            }
            this.diveSetup = normalizeDiveSetup(config.diveSetup);
        } else {
            this.diveSetup = null;
        }
        
        // Build DOM structure
        this._buildDOM();
        
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
        // Clear container
        this.container.innerHTML = '';
        
        // Main wrapper
        const wrapper = document.createElement('div');
        wrapper.className = 'tpc-wrapper';
        wrapper.style.cssText = 'display: flex; flex-direction: column; width: 100%; height: 100%;';
        
        // Compartment selector (if enabled)
        if (this.options.compartmentSelector) {
            this.controlsContainer = document.createElement('div');
            this.controlsContainer.className = 'tpc-controls';
            this.controlsContainer.style.cssText = `
                display: flex; flex-wrap: wrap; gap: 4px; padding: 8px;
                background: #f8f9fa; border-radius: 4px; margin-bottom: 8px;
            `;
            this._buildCompartmentSelector();
            wrapper.appendChild(this.controlsContainer);
        }
        
        // Create chart container with fullscreen support
        this.chartContainer = document.createElement('div');
        this.chartContainer.className = 'tpc-chart-container';
        this.chartContainer.style.cssText = 'position: relative; flex: 1; min-height: 300px;';
        
        // Create canvas
        this.canvas = document.createElement('canvas');
        this.canvas.style.cssText = 'width: 100%; height: 100%;';
        this.chartContainer.appendChild(this.canvas);
        
        // Create fullscreen button (if enabled)
        if (this.options.fullscreenButton) {
            this.fullscreenBtn = document.createElement('button');
            this.fullscreenBtn.className = 'tpc-fullscreen-btn';
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
            
            // Exit fullscreen button
            this.exitFullscreenBtn = document.createElement('button');
            this.exitFullscreenBtn.className = 'tpc-exit-fullscreen-btn';
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
        
        wrapper.appendChild(this.chartContainer);
        this.container.appendChild(wrapper);
        
        // Handle escape key for fullscreen
        this._escapeHandler = (e) => {
            if (e.key === 'Escape' && this.chartContainer.classList.contains('tpc-fullscreen')) {
                this._toggleFullscreen();
            }
        };
        document.addEventListener('keydown', this._escapeHandler);
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
        
        const allBtn = this._createButton('All', () => {
            COMPARTMENTS.forEach(c => this.visibleCompartments.add(c.id));
            this._updateCompartmentCheckboxes();
            this._render();
        });
        
        const noneBtn = this._createButton('None', () => {
            this.visibleCompartments.clear();
            this._updateCompartmentCheckboxes();
            this._render();
        });
        
        const fastBtn = this._createButton('Fast', () => {
            this.visibleCompartments.clear();
            COMPARTMENTS.filter(c => c.halfTime <= 12.5).forEach(c => this.visibleCompartments.add(c.id));
            this._updateCompartmentCheckboxes();
            this._render();
        });
        
        const slowBtn = this._createButton('Slow', () => {
            this.visibleCompartments.clear();
            COMPARTMENTS.filter(c => c.halfTime >= 109).forEach(c => this.visibleCompartments.add(c.id));
            this._updateCompartmentCheckboxes();
            this._render();
        });
        
        btnGroup.appendChild(allBtn);
        btnGroup.appendChild(noneBtn);
        btnGroup.appendChild(fastBtn);
        btnGroup.appendChild(slowBtn);
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
     * Create a styled button
     * @private
     */
    _createButton(text, onClick) {
        const btn = document.createElement('button');
        btn.textContent = text;
        btn.style.cssText = `
            padding: 4px 8px; background: #e9ecef; border: 1px solid #ced4da;
            border-radius: 4px; cursor: pointer; font-size: 12px;
        `;
        btn.addEventListener('click', onClick);
        return btn;
    }
    
    /**
     * Update compartment checkbox states
     * @private
     */
    _updateCompartmentCheckboxes() {
        if (!this.controlsContainer) return;
        
        this.controlsContainer.querySelectorAll('input[type="checkbox"]').forEach(cb => {
            const id = parseInt(cb.dataset.compartmentId);
            if (!isNaN(id)) {
                cb.checked = this.visibleCompartments.has(id);
            }
        });
    }
    
    /**
     * Toggle fullscreen mode
     * @private
     */
    _toggleFullscreen() {
        const isFullscreen = this.chartContainer.classList.toggle('tpc-fullscreen');
        
        if (isFullscreen) {
            this.chartContainer.style.cssText = `
                position: fixed; top: 0; left: 0; right: 0; bottom: 0;
                width: 100vw; height: 100vh; z-index: 1000;
                background: white; padding: 20px; box-sizing: border-box;
            `;
            document.body.style.overflow = 'hidden';
            if (this.fullscreenBtn) this.fullscreenBtn.style.display = 'none';
            if (this.exitFullscreenBtn) this.exitFullscreenBtn.style.display = 'block';
        } else {
            this.chartContainer.style.cssText = 'position: relative; flex: 1; min-height: 300px;';
            document.body.style.overflow = '';
            if (this.fullscreenBtn) this.fullscreenBtn.style.display = 'block';
            if (this.exitFullscreenBtn) this.exitFullscreenBtn.style.display = 'none';
        }
        
        if (this.chart) {
            setTimeout(() => this.chart.resize(), 50);
        }
    }
    
    /**
     * Calculate tissue loading data
     * @private
     */
    _calculate() {
        if (!this.diveSetup || !this.diveSetup.dives || this.diveSetup.dives.length === 0) {
            this.calculationResults = null;
            return;
        }
        
        const waypoints = this.diveSetup.dives[0].waypoints;
        const gases = this.diveSetup.gases;
        const surfaceInterval = this.diveSetup.surfaceInterval || 0;
        
        this.calculationResults = calculateTissueLoading(waypoints, surfaceInterval, { gases });
    }
    
    /**
     * Render the chart based on current mode
     * @private
     */
    _render() {
        if (!this.calculationResults) return;
        
        switch (this.options.mode) {
            case 'loading':
                this._renderLoadingChart();
                break;
            case 'mvalue':
                this._renderMValueChart();
                break;
            case 'saturation':
                this._renderSaturationChart();
                break;
            case 'ceiling':
                this._renderCeilingChart();
                break;
            default:
                this._renderLoadingChart();
        }
    }
    
    /**
     * Render time vs tissue N2 pressure chart
     * @private
     */
    _renderLoadingChart() {
        const results = this.calculationResults;
        const datasets = [];
        
        // Depth profile (on secondary axis)
        datasets.push({
            label: 'Depth (m)',
            data: results.timePoints.map((t, i) => ({
                x: t,
                y: results.depthPoints[i]
            })),
            borderColor: 'rgba(100, 100, 100, 0.8)',
            backgroundColor: 'rgba(100, 100, 100, 0.1)',
            fill: true,
            yAxisID: 'yDepth',
            tension: 0,
            pointRadius: 0,
            borderWidth: 2,
            order: 100
        });
        
        // Tissue compartment lines
        COMPARTMENTS.forEach(comp => {
            const compData = results.compartments[comp.id];
            const isVisible = this.visibleCompartments.has(comp.id);
            
            datasets.push({
                label: comp.label,
                data: results.timePoints.map((t, i) => ({
                    x: t,
                    y: compData.pressures[i]
                })),
                borderColor: comp.color,
                backgroundColor: comp.color,
                fill: false,
                yAxisID: 'yPressure',
                tension: 0.1,
                pointRadius: 0,
                borderWidth: 2,
                hidden: !isVisible,
                compartmentId: comp.id
            });
        });
        
        // Alveolar N2 pressure (target)
        if (this.options.showAmbientLine) {
            datasets.push({
                label: 'Alveolar N₂ (target)',
                data: results.timePoints.map((t, i) => ({
                    x: t,
                    y: results.alveolarN2Pressures[i]
                })),
                borderColor: 'rgba(46, 204, 113, 0.9)',
                borderDash: [8, 4],
                fill: false,
                yAxisID: 'yPressure',
                tension: 0,
                pointRadius: 0,
                borderWidth: 2.5,
                order: 97
            });
            
            // Ambient pressure
            datasets.push({
                label: 'Ambient Pressure (bar)',
                data: results.timePoints.map((t, i) => ({
                    x: t,
                    y: results.ambientPressures[i]
                })),
                borderColor: 'rgba(231, 76, 60, 0.8)',
                borderDash: [10, 5],
                fill: false,
                yAxisID: 'yPressure',
                tension: 0,
                pointRadius: 0,
                borderWidth: 2,
                order: 98
            });
        }
        
        // Surface saturation reference
        const surfaceN2 = results.compartments[1].pressures[0];
        datasets.push({
            label: 'Surface Saturation',
            data: results.timePoints.map(t => ({ x: t, y: surfaceN2 })),
            borderColor: 'rgba(0, 0, 0, 0.3)',
            borderDash: [5, 5],
            fill: false,
            yAxisID: 'yPressure',
            pointRadius: 0,
            borderWidth: 1,
            order: 99
        });
        
        const config = {
            type: 'line',
            data: { datasets },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                animation: { duration: 300 },
                interaction: {
                    mode: 'index',
                    intersect: false
                },
                plugins: {
                    legend: {
                        display: this.options.showLegend,
                        position: 'top',
                        labels: {
                            usePointStyle: true,
                            font: { size: 11 },
                            filter: (item, data) => {
                                // Hide individual compartment datasets from legend
                                return !data.datasets[item.datasetIndex].compartmentId;
                            }
                        }
                    },
                    tooltip: {
                        enabled: this.options.interactive,
                        callbacks: {
                            title: (items) => `Time: ${items[0].parsed.x.toFixed(1)} min`,
                            label: (context) => {
                                const label = context.dataset.label || '';
                                const value = context.parsed.y;
                                if (label === 'Depth (m)') {
                                    return `${label}: ${value.toFixed(1)}m`;
                                }
                                return `${label}: ${value.toFixed(3)} bar`;
                            }
                        }
                    }
                },
                scales: {
                    x: {
                        type: 'linear',
                        title: { display: true, text: 'Time (minutes)' },
                        min: 0
                    },
                    yPressure: {
                        type: 'linear',
                        position: 'left',
                        title: { display: true, text: 'N₂ Pressure (bar)' },
                        min: 0
                    },
                    yDepth: {
                        type: 'linear',
                        position: 'right',
                        title: { display: true, text: 'Depth (m)' },
                        min: 0,
                        reverse: true,
                        grid: { drawOnChartArea: false }
                    }
                }
            }
        };
        
        this._updateOrCreateChart(config);
    }
    
    /**
     * Render pressure-pressure (M-value) diagram
     * @private
     */
    _renderMValueChart() {
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
        const maxPressure = Math.max(maxAmbient, maxTissue) * 1.1;
        
        const datasets = [];
        
        // Ambient line (y = x)
        datasets.push({
            label: 'Ambient Line (P_tissue = P_ambient)',
            data: [
                { x: 0, y: 0 },
                { x: maxPressure, y: maxPressure }
            ],
            borderColor: 'rgba(52, 152, 219, 0.8)',
            borderWidth: 2,
            pointRadius: 0,
            fill: false
        });
        
        // Surface line (x = 1 bar)
        datasets.push({
            label: 'Surface (1 bar)',
            data: [
                { x: SURFACE_PRESSURE, y: 0 },
                { x: SURFACE_PRESSURE, y: maxPressure }
            ],
            borderColor: 'rgba(128, 128, 128, 0.6)',
            borderWidth: 1,
            borderDash: [5, 5],
            pointRadius: 0,
            fill: false
        });
        
        // M-value lines and tissue points for visible compartments
        COMPARTMENTS.forEach(comp => {
            if (!this.visibleCompartments.has(comp.id)) return;
            
            // M-value line for this compartment
            const mValueData = [];
            for (let p = 0; p <= maxPressure; p += 0.5) {
                mValueData.push({
                    x: p,
                    y: getMValue(p, comp.aN2, comp.bN2)
                });
            }
            
            datasets.push({
                label: `M-value TC${comp.id}`,
                data: mValueData,
                borderColor: comp.color,
                borderWidth: 2,
                pointRadius: 0,
                fill: false,
                borderDash: [3, 3]
            });
            
            // GF-adjusted M-value line (if showing GF lines)
            if (this.options.showGFLines && gfHigh < 1) {
                const gfData = [];
                for (let p = 0; p <= maxPressure; p += 0.5) {
                    gfData.push({
                        x: p,
                        y: getAdjustedMValue(p, comp.aN2, comp.bN2, gfHigh)
                    });
                }
                
                datasets.push({
                    label: `GF-adjusted TC${comp.id}`,
                    data: gfData,
                    borderColor: comp.color + '80',
                    borderWidth: 1,
                    pointRadius: 0,
                    fill: false,
                    borderDash: [8, 4]
                });
            }
            
            // Tissue point trail (history up to current time)
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
                fill: false
            });
            
            // Current tissue point
            const currentTissue = results.compartments[comp.id].pressures[timeIndex];
            datasets.push({
                label: `TC${comp.id} (${comp.halfTime}min)`,
                data: [{ x: currentAmbient, y: currentTissue }],
                backgroundColor: comp.color,
                borderColor: '#fff',
                borderWidth: 2,
                pointRadius: 8,
                showLine: false
            });
        });
        
        const config = {
            type: 'scatter',
            data: { datasets },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                animation: { duration: 100 },
                plugins: {
                    legend: {
                        display: this.options.showLegend,
                        position: 'top',
                        labels: {
                            filter: (item) => {
                                // Only show main labels, not trails
                                return !item.text.startsWith('Trail') && 
                                       !item.text.startsWith('M-value') &&
                                       !item.text.startsWith('GF-adjusted');
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
        
        this._updateOrCreateChart(config);
    }
    
    /**
     * Render saturation percentage chart
     * @private
     */
    _renderSaturationChart() {
        // For now, redirect to loading chart
        // TODO: Implement saturation as percentage of M-value
        this._renderLoadingChart();
    }
    
    /**
     * Render ceiling depths chart
     * @private
     */
    _renderCeilingChart() {
        const results = this.calculationResults;
        const gfLow = (this.diveSetup.gfLow || 100) / 100;
        const gfHigh = (this.diveSetup.gfHigh || 100) / 100;
        
        // Calculate ceiling time series
        const ceilingDepths = calculateCeilingTimeSeries(results, gfLow, gfHigh);
        
        const datasets = [
            {
                label: 'Dive Profile',
                data: results.timePoints.map((t, i) => ({
                    x: t,
                    y: results.depthPoints[i]
                })),
                borderColor: '#3498db',
                backgroundColor: '#3498db20',
                fill: true,
                tension: 0,
                pointRadius: 0,
                borderWidth: 2
            },
            {
                label: 'Ceiling',
                data: results.timePoints.map((t, i) => ({
                    x: t,
                    y: ceilingDepths[i]
                })),
                borderColor: '#e74c3c',
                backgroundColor: '#e74c3c30',
                fill: true,
                tension: 0.1,
                pointRadius: 0,
                borderWidth: 2,
                borderDash: [5, 3]
            }
        ];
        
        const config = {
            type: 'line',
            data: { datasets },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { display: true, position: 'top' },
                    tooltip: { enabled: this.options.interactive }
                },
                scales: {
                    x: {
                        type: 'linear',
                        title: { display: true, text: 'Time (minutes)' },
                        min: 0
                    },
                    y: {
                        type: 'linear',
                        title: { display: true, text: 'Depth (m)' },
                        min: 0,
                        reverse: true
                    }
                }
            }
        };
        
        this._updateOrCreateChart(config);
    }
    
    /**
     * Update existing chart or create new one
     * @private
     */
    _updateOrCreateChart(config) {
        if (this.chart) {
            this.chart.destroy();
        }
        this.chart = new Chart(this.canvas, config);
    }
    
    /**
     * Set the current time index for animation
     * @param {number} index - Time index (0 to timePoints.length - 1)
     */
    setTimeIndex(index) {
        if (!this.calculationResults) return;
        
        const maxIndex = this.calculationResults.timePoints.length - 1;
        this.currentTimeIndex = Math.max(0, Math.min(maxIndex, index));
        
        if (this.options.mode === 'mvalue') {
            this._render();
        }
    }
    
    /**
     * Get total number of time points
     * @returns {number} Number of time points
     */
    getTimePointCount() {
        return this.calculationResults ? this.calculationResults.timePoints.length : 0;
    }
    
    /**
     * Get current time in minutes
     * @returns {number} Current time in minutes
     */
    getCurrentTime() {
        if (!this.calculationResults) return 0;
        return this.calculationResults.timePoints[this.currentTimeIndex] || 0;
    }
    
    /**
     * Get current depth in meters
     * @returns {number} Current depth in meters
     */
    getCurrentDepth() {
        if (!this.calculationResults) return 0;
        return this.calculationResults.depthPoints[this.currentTimeIndex] || 0;
    }
    
    /**
     * Toggle visibility of a compartment
     * @param {number} compartmentId - Compartment ID (1-16)
     * @param {boolean} [visible] - Set visibility (toggles if not specified)
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
     * Set which compartments are visible
     * @param {number[]} compartmentIds - Array of compartment IDs to show
     */
    setVisibleCompartments(compartmentIds) {
        this.visibleCompartments.clear();
        compartmentIds.forEach(id => this.visibleCompartments.add(id));
        this._updateCompartmentCheckboxes();
        this._render();
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
            console.error('TissuePressureChart: Invalid dive setup', validation.errors);
            return;
        }
        
        this.diveSetup = normalizeDiveSetup(diveSetup);
        this.currentTimeIndex = 0;
        this._calculate();
        this._render();
    }
    
    /**
     * Update chart options without changing data
     * @param {Object} options - New chart options
     */
    setOptions(options) {
        this.options = mergeOptions(this.options, options);
        
        // Rebuild compartment selector if needed
        if (options.compartmentSelector !== undefined && this.options.compartmentSelector) {
            this._buildCompartmentSelector();
        }
        
        if (this.calculationResults) {
            this._render();
        }
    }
    
    /**
     * Set display mode
     * @param {'loading'|'saturation'|'mvalue'|'ceiling'} mode - Display mode
     */
    setMode(mode) {
        this.options.mode = mode;
        if (this.calculationResults) {
            this._render();
        }
    }
    
    /**
     * Get the current calculated results
     * @returns {Object|null} Calculation results or null if no data
     */
    getResults() {
        return this.calculationResults;
    }
    
    /**
     * Destroy the chart and clean up resources
     */
    destroy() {
        if (this.chart) {
            this.chart.destroy();
            this.chart = null;
        }
        
        document.removeEventListener('keydown', this._escapeHandler);
        
        this.container.innerHTML = '';
    }
}

/**
 * Create a TissuePressureChart instance (convenience function)
 * @param {HTMLElement|string} container - Container element or selector
 * @param {Object} config - Configuration object
 * @returns {TissuePressureChart} Chart instance
 */
export function createTissuePressureChart(container, config) {
    const element = typeof container === 'string' 
        ? document.querySelector(container) 
        : container;
    
    if (!element) {
        throw new Error('TissuePressureChart: Container element not found');
    }
    
    return new TissuePressureChart(element, config);
}
