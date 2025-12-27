/**
 * Visualization Module
 * 
 * Handles Chart.js visualization of tissue loading and dive profile
 */

import { COMPARTMENTS } from './tissueCompartments.js';

let chart = null;

/**
 * Initialize or update the chart with calculation results
 * @param {HTMLCanvasElement} canvas - Canvas element for the chart
 * @param {Object} results - Results from calculateTissueLoading()
 * @param {Set<number>} visibleCompartments - Set of compartment IDs to display
 */
export function renderChart(canvas, results, visibleCompartments = null) {
    // Default to all compartments visible
    if (!visibleCompartments) {
        visibleCompartments = new Set(COMPARTMENTS.map(c => c.id));
    }

    const ctx = canvas.getContext('2d');

    // Prepare datasets for tissue compartments
    const datasets = [];

    // Add depth profile (inverted, on secondary y-axis)
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
        order: 100 // Draw behind tissue lines
    });

    // Add tissue compartment lines
    COMPARTMENTS.forEach(comp => {
        const compData = results.compartments[comp.id];
        const isVisible = visibleCompartments.has(comp.id);
        
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

    // Add alveolar N2 pressure line (the target tissues equilibrate towards)
    datasets.push({
        label: 'Alveolar N₂ (target)',
        data: results.timePoints.map((t, i) => ({
            x: t,
            y: results.alveolarN2Pressures[i]
        })),
        borderColor: 'rgba(46, 204, 113, 0.9)',
        backgroundColor: 'rgba(46, 204, 113, 0.1)',
        borderDash: [8, 4],
        fill: false,
        yAxisID: 'yPressure',
        tension: 0,
        pointRadius: 0,
        borderWidth: 2.5,
        order: 97
    });

    // Add ambient pressure line (critical for understanding decompression limits)
    datasets.push({
        label: 'Ambient Pressure (bar)',
        data: results.timePoints.map((t, i) => ({
            x: t,
            y: results.ambientPressures[i]
        })),
        borderColor: 'rgba(231, 76, 60, 0.8)',
        backgroundColor: 'rgba(231, 76, 60, 0.1)',
        borderDash: [10, 5],
        fill: false,
        yAxisID: 'yPressure',
        tension: 0,
        pointRadius: 0,
        borderWidth: 2,
        order: 98
    });

    // Add surface pressure reference line
    const surfaceN2 = results.compartments[1].pressures[0]; // Initial surface saturation
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

    // Chart configuration
    const config = {
        type: 'line',
        data: { datasets },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            interaction: {
                mode: 'index',
                intersect: false
            },
            plugins: {
                title: {
                    display: true,
                    text: 'Tissue Nitrogen Loading During Dive',
                    font: { size: 16 }
                },
                legend: {
                    display: true,
                    position: 'right',
                    labels: {
                        usePointStyle: true,
                        padding: 10,
                        font: { size: 11 }
                    },
                    onClick: (e, legendItem, legend) => {
                        const index = legendItem.datasetIndex;
                        const chart = legend.chart;
                        const meta = chart.getDatasetMeta(index);
                        
                        // Toggle visibility
                        meta.hidden = !meta.hidden;
                        chart.update();
                        
                        // Dispatch event for external toggle sync
                        const dataset = chart.data.datasets[index];
                        if (dataset.compartmentId) {
                            canvas.dispatchEvent(new CustomEvent('compartmentToggle', {
                                detail: {
                                    compartmentId: dataset.compartmentId,
                                    visible: !meta.hidden
                                }
                            }));
                        }
                    }
                },
                tooltip: {
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
                    title: {
                        display: true,
                        text: 'Time (minutes)'
                    },
                    min: 0
                },
                yPressure: {
                    type: 'linear',
                    position: 'left',
                    title: {
                        display: true,
                        text: 'N₂ Pressure (bar)'
                    },
                    min: 0,
                    grid: {
                        color: 'rgba(0, 0, 0, 0.1)'
                    }
                },
                yDepth: {
                    type: 'linear',
                    position: 'right',
                    title: {
                        display: true,
                        text: 'Depth (m)'
                    },
                    min: 0,
                    reverse: true, // Depth increases downward
                    grid: {
                        drawOnChartArea: false
                    }
                }
            }
        }
    };

    // Destroy existing chart if present
    if (chart) {
        chart.destroy();
    }

    // Create new chart
    chart = new Chart(ctx, config);
    
    return chart;
}

/**
 * Toggle visibility of a specific compartment
 * @param {number} compartmentId - Compartment ID to toggle
 * @param {boolean} visible - Whether to show or hide
 */
export function toggleCompartment(compartmentId, visible) {
    if (!chart) return;

    chart.data.datasets.forEach((dataset, index) => {
        if (dataset.compartmentId === compartmentId) {
            const meta = chart.getDatasetMeta(index);
            meta.hidden = !visible;
        }
    });
    
    chart.update();
}

/**
 * Show only selected compartments
 * @param {Set<number>} compartmentIds - Set of compartment IDs to show
 */
export function showOnlyCompartments(compartmentIds) {
    if (!chart) return;

    chart.data.datasets.forEach((dataset, index) => {
        if (dataset.compartmentId) {
            const meta = chart.getDatasetMeta(index);
            meta.hidden = !compartmentIds.has(dataset.compartmentId);
        }
    });
    
    chart.update();
}

/**
 * Show all compartments
 */
export function showAllCompartments() {
    if (!chart) return;

    chart.data.datasets.forEach((dataset, index) => {
        if (dataset.compartmentId) {
            const meta = chart.getDatasetMeta(index);
            meta.hidden = false;
        }
    });
    
    chart.update();
}

/**
 * Hide all compartments
 */
export function hideAllCompartments() {
    if (!chart) return;

    chart.data.datasets.forEach((dataset, index) => {
        if (dataset.compartmentId) {
            const meta = chart.getDatasetMeta(index);
            meta.hidden = true;
        }
    });
    
    chart.update();
}

/**
 * Get current chart instance
 * @returns {Chart|null} Current Chart.js instance
 */
export function getChart() {
    return chart;
}
