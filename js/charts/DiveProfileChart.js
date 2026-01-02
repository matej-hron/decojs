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
        
        // Create chart container with fullscreen support
        this.chartContainer = document.createElement('div');
        this.chartContainer.className = 'dpc-chart-container';
        this.chartContainer.style.cssText = 'position: relative; width: 100%; height: 100%; min-height: 300px;';
        
        // Create canvas
        this.canvas = document.createElement('canvas');
        this.canvas.style.cssText = 'width: 100%; height: 100%;';
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
        
        this.container.appendChild(this.chartContainer);
        
        // Handle escape key for fullscreen
        this._escapeHandler = (e) => {
            if (e.key === 'Escape' && this.chartContainer.classList.contains('dpc-fullscreen')) {
                this._toggleFullscreen();
            }
        };
        document.addEventListener('keydown', this._escapeHandler);
    }
    
    /**
     * Toggle fullscreen mode
     * @private
     */
    _toggleFullscreen() {
        const isFullscreen = this.chartContainer.classList.toggle('dpc-fullscreen');
        
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
            this.chartContainer.style.cssText = 'position: relative; width: 100%; height: 100%; min-height: 300px;';
            document.body.style.overflow = '';
            if (this.fullscreenBtn) this.fullscreenBtn.style.display = 'block';
            if (this.exitFullscreenBtn) this.exitFullscreenBtn.style.display = 'none';
        }
        
        // Resize chart after layout change
        if (this.chart) {
            setTimeout(() => this.chart.resize(), 50);
        }
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
        
        return {
            results,
            ceilingDepths,
            ndlData,
            waypoints,
            gases
        };
    }
    
    /**
     * Render the chart
     * @private
     */
    _render() {
        const data = this._calculateData();
        if (!data) return;
        
        const { results, ceilingDepths, waypoints, gases } = data;
        
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
        
        // Build scales
        const scales = {
            x: {
                type: 'linear',
                title: {
                    display: true,
                    text: 'Time (minutes)'
                },
                min: 0
            },
            yDepth: {
                type: 'linear',
                position: 'left',
                reverse: true,
                title: {
                    display: true,
                    text: 'Depth (m)'
                },
                min: 0
            }
        };
        
        // Add pressure axis if needed
        if (this.options.showAmbientPressure || this.options.showPartialPressures) {
            scales.yPressure = {
                type: 'linear',
                position: 'right',
                title: {
                    display: true,
                    text: 'Pressure (bar)'
                },
                min: 0,
                grid: {
                    drawOnChartArea: false
                }
            };
        }
        
        // Build annotations
        const annotations = {};
        
        // Gas switch markers
        if (this.options.showGasSwitches && results.gasSwitches && results.gasSwitches.length > 0) {
            results.gasSwitches.forEach((sw, i) => {
                annotations[`gasSwitch${i}`] = {
                    type: 'line',
                    xMin: sw.time,
                    xMax: sw.time,
                    borderColor: '#9b59b6',
                    borderWidth: 2,
                    borderDash: [5, 5],
                    label: {
                        display: true,
                        content: `→ ${sw.gasName}`,
                        position: 'start',
                        backgroundColor: '#9b59b6',
                        color: 'white',
                        font: { size: 10 }
                    }
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
        
        document.removeEventListener('keydown', this._escapeHandler);
        
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
